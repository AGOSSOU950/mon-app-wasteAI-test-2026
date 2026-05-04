import io
import json
import os
import re
import unicodedata
import logging
from functools import lru_cache
from pathlib import Path

from app.core.llm_client import vision_completion_json
from app.models.waste import WasteCategory, WasteType

try:
    from PIL import Image, ImageEnhance, ImageOps
except Exception:  # pragma: no cover
    Image = None
    ImageEnhance = None
    ImageOps = None

MAX_IMAGE_SIZE_BYTES = 6 * 1024 * 1024
ALLOWED_MEDIA_TYPES = {"image/jpeg", "image/png", "image/webp"}
BENIN_DB_PATH = Path(__file__).resolve().with_name("waste_benin_database.json")
UNKNOWN_WASTE_NAME = "dechet solide non identifie"
LOW_CONFIDENCE_UNKNOWN_NAME = "Type de dechet probable inconnu"

logger = logging.getLogger(__name__)


def _normalize(value: str | None) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch)).lower().strip()


def _safe_int(value: object, default: int = 0) -> int:
    try:
        return int(float(str(value)))
    except Exception:
        return default


def _safe_float(value: object, default: float = 0.0) -> float:
    try:
        return float(str(value))
    except Exception:
        return default


def _preprocess_image_for_vision(image_bytes: bytes, media_type: str) -> tuple[bytes, str]:
    if not Image or not image_bytes:
        return image_bytes, media_type

    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img = ImageOps.autocontrast(img, cutoff=2)
        img = ImageEnhance.Contrast(img).enhance(1.15)
        img = ImageEnhance.Brightness(img).enhance(1.05)

        max_side = max(img.width, img.height)
        if max_side > 1400:
            scale = 1400.0 / float(max_side)
            img = img.resize((max(1, int(img.width * scale)), max(1, int(img.height * scale))), Image.Resampling.LANCZOS)

        out = io.BytesIO()
        if media_type == "image/png":
            img.save(out, format="PNG", optimize=True)
            return out.getvalue(), "image/png"

        img.save(out, format="JPEG", quality=90, optimize=True)
        return out.getvalue(), "image/jpeg"
    except Exception:
        return image_bytes, media_type


@lru_cache(maxsize=1)
def _load_benin_db() -> list[dict]:
    try:
        payload = json.loads(BENIN_DB_PATH.read_text(encoding="utf-8"))
    except Exception:
        return []

    rows = payload.get("dechets") if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        return []

    clean_rows: list[dict] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        nom = str(row.get("nom_exact") or "").strip()
        if not nom:
            continue
        blob = " ".join(
            [
                _normalize(nom),
                _normalize(row.get("filiere")),
                _normalize(row.get("sous_categorie")),
                " ".join(_normalize(x) for x in (row.get("origine_industrie") or []) if isinstance(x, str)),
                " ".join(_normalize(x) for x in (row.get("regions_benin") or []) if isinstance(x, str)),
            ]
        )
        clean_rows.append({**row, "_search_blob": blob})
    return clean_rows


def _score_match(entry: dict, text: str) -> int:
    norm_text = _normalize(text)
    if not norm_text:
        return 0

    score = 0
    name = _normalize(entry.get("nom_exact"))
    if name and (name in norm_text or norm_text in name):
        score += 10

    tokens = [tok for tok in re.split(r"[^a-z0-9]+", norm_text) if len(tok) >= 4]
    blob = str(entry.get("_search_blob") or "")
    for tok in tokens:
        if tok in blob:
            score += 1

    return score


def _top_hypotheses(text: str, limit: int = 3) -> list[dict]:
    rows = _load_benin_db()
    if not rows:
        return []

    ranked: list[tuple[int, dict]] = [(_score_match(row, text), row) for row in rows]
    ranked.sort(key=lambda x: x[0], reverse=True)
    top = ranked[: max(1, limit)]

    if top and top[0][0] <= 0:
        top = [(1, row) for row in rows[:limit]]

    if not top:
        return []

    best = max(1, top[0][0])
    result: list[dict] = []
    for idx, (score, row) in enumerate(top):
        confidence = max(35, min(95, int((score / best) * 90) - idx * 8))
        result.append(
            {
                "nom": str(row.get("nom_exact") or "Hypothese inconnue"),
                "confiance": confidence,
                "filiere": str(row.get("filiere") or "autre"),
            }
        )
    return result


def _category_from_filiere(filiere: str) -> WasteCategory:
    key = _normalize(filiere)
    if key == "plastique":
        return WasteCategory.PLASTIC
    if key == "papier":
        return WasteCategory.PAPER
    if key == "metal":
        return WasteCategory.METAL
    if key == "biomasse":
        return WasteCategory.ORGANIC
    return WasteCategory.OTHER


def _type_from_filiere(filiere: str, nom: str) -> WasteType:
    key = _normalize(filiere)
    name = _normalize(nom)
    if key == "plastique":
        return WasteType.PLASTIQUE
    if key == "textile":
        return WasteType.TEXTILE
    if key == "biomasse":
        return WasteType.BIOMASSE_LIGNOCELLULOSIQUE
    if key == "papier" and any(x in name for x in ["bois", "mixte"]):
        return WasteType.BIOMASSE_LIGNOCELLULOSIQUE
    return WasteType.OTHER


def _confidence_label(score: int) -> str:
    if score >= 80:
        return "elevee"
    if score >= 60:
        return "moyenne"
    return "faible"


def _is_unreadable_signal(parsed: dict) -> bool:
    text = " ".join(
        [
            str(parsed.get("waste_name") or ""),
            str(parsed.get("nom_exact") or ""),
            str(parsed.get("explication") or ""),
            str(parsed.get("description_estimee") or ""),
            str(parsed.get("sous_type") or ""),
        ]
    )
    norm = _normalize(text)
    hints = [
        "completement noire",
        "completement noir",
        "image noire",
        "illisible",
        "black image",
        "unreadable",
        "aucun objet",
        "non identifiable",
        "cannot identify",
    ]
    return any(h in norm for h in hints)


def _guess_filiere_from_hints(text: str) -> str:
    t = _normalize(text)
    if any(x in t for x in ["plast", "bouteille", "film", "sachet", "pet", "pehd", "poly"]):
        return "plastique"
    if any(x in t for x in ["metal", "fer", "acier", "alu", "rouille", "canette"]):
        return "metal"
    if any(x in t for x in ["papier", "carton", "feuille", "journal"]):
        return "papier"
    if any(x in t for x in ["bois", "fibre", "organ", "aliment", "biom", "vegetal", "coque"]):
        return "biomasse"
    return "autre"


def _technical_description_for_filiere(filiere: str) -> str:
    key = _normalize(filiere)
    if key == "plastique":
        return "Probable polymere thermoplastique; recyclage matiere par tri-lavage-granulation ou valorisation energetique controlee."
    if key == "metal":
        return "Probable fraction metallique/alliage; forte recyclabilite par tri metallurgique et refonte en fonderie."
    if key == "papier":
        return "Probable matrice cellulosique; valorisable en recyclage papetier, sinon voie energetique en cas de contamination."
    if key == "biomasse":
        return "Probable biomasse organique/lignocellulosique; valorisable par methanisation, compostage ou voie thermique selon humidite."
    return "Matiere heterogene non specifiee; tri visuel et caracterisation physico-chimique recommandes avant orientation filiere."


def _build_prompt() -> str:
    return (
        "Expert dechets industriels Benin.\n"
        "Observe la photo et propose le dechet le plus plausible meme en cas d'incertitude.\n"
        "Retourne STRICTEMENT un objet JSON valide (double quotes), sans markdown et sans texte hors JSON.\n"
        "Le JSON doit contenir au minimum: waste_name (string), confidence (number 0..1), status (identified|uncertain), filiere (textile|plastique|papier|biomasse|metal|autre), description_estimee (string).\n"
        "Si confidence < 0.5 alors status=uncertain. Si non reconnaissable: waste_name='Type de dechet probable inconnu'.\n"
        "Aucun champ null/undefined."
    )


def _normalize_identification_output(result: dict) -> dict:
    if not isinstance(result, dict):
        result = {}

    raw_name = str(result.get("waste_name") or result.get("nom_exact") or result.get("nom") or result.get("label") or "").strip()
    waste_name = raw_name or UNKNOWN_WASTE_NAME

    confidence = _safe_float(result.get("confidence"), default=-1.0)
    if confidence < 0:
        if result.get("confiance_identification") is not None:
            confidence = _safe_float(result.get("confiance_identification"), default=32.0)
        elif result.get("confiance") is not None:
            raw_conf = result.get("confiance")
            if isinstance(raw_conf, str) and raw_conf.lower() in {"elevee", "high"}:
                confidence = 0.85
            elif isinstance(raw_conf, str) and raw_conf.lower() in {"moyenne", "medium"}:
                confidence = 0.65
            elif isinstance(raw_conf, str) and raw_conf.lower() in {"faible", "low"}:
                confidence = 0.35
            else:
                confidence = _safe_float(raw_conf, default=32.0)
        else:
            confidence = 0.32

    if confidence > 1:
        confidence = confidence / 100.0
    confidence = max(0.0, min(0.99, confidence))

    hints_text = " ".join([
        waste_name,
        str(result.get("description_estimee") or ""),
        str(result.get("explication") or ""),
        str(result.get("filiere") or ""),
    ])

    filiere_guess = _normalize(str(result.get("filiere") or ""))
    if filiere_guess not in {"textile", "plastique", "papier", "biomasse", "metal", "autre"}:
        filiere_guess = _guess_filiere_from_hints(hints_text)

    if not waste_name or _normalize(waste_name) in {
        "null",
        "none",
        "undefined",
        "",
        "inconnu",
        "unknown",
        "dechet non identifie",
        "dechet solide non identifie",
    }:
        waste_name = UNKNOWN_WASTE_NAME
        confidence = min(confidence, 0.49)

    if _is_unreadable_signal(result):
        confidence = min(confidence, 0.45)

    status = "identified" if confidence >= 0.5 else "uncertain"
    confidence_identification = max(1, int(round(confidence * 100)))
    technical_description = str(result.get("technical_description") or "").strip() or _technical_description_for_filiere(filiere_guess)

    normalized = dict(result)
    normalized["waste_name"] = waste_name
    normalized["confidence"] = round(confidence, 2)
    normalized["status"] = status
    normalized["filiere"] = filiere_guess
    normalized["categorie"] = _category_from_filiere(filiere_guess)
    normalized["type_dechet"] = _type_from_filiere(filiere_guess, waste_name)
    normalized["nom"] = waste_name
    normalized["nom_exact"] = waste_name
    normalized["confiance_identification"] = confidence_identification
    normalized["confiance"] = _confidence_label(confidence_identification)
    normalized["technical_description"] = technical_description

    base_desc = str(normalized.get("description_estimee") or normalized.get("explication") or "").strip()
    if not base_desc:
        base_desc = f"Classification visuelle approximative: {filiere_guess}. {technical_description}"

    if confidence < 0.30:
        low_name = LOW_CONFIDENCE_UNKNOWN_NAME if waste_name == UNKNOWN_WASTE_NAME else waste_name
        guess = f"{filiere_guess} (approximation)"
        low_desc = (
            f"L'image est difficile a analyser. Base sur la texture, la couleur et la forme visibles, "
            f"ce dechet pourrait appartenir a la categorie {filiere_guess}. {technical_description}"
        )
        normalized["name"] = low_name
        normalized["guess"] = guess
        normalized["description"] = low_desc
        normalized["description_estimee"] = low_desc
        normalized["explication"] = low_desc
        if waste_name == UNKNOWN_WASTE_NAME:
            normalized["waste_name"] = low_name
            normalized["nom"] = low_name
            normalized["nom_exact"] = low_name
    else:
        normalized["name"] = normalized.get("name") or normalized["waste_name"]
        normalized["guess"] = normalized.get("guess") or f"{filiere_guess} (probable)"
        normalized["description"] = normalized.get("description") or base_desc
        normalized["description_estimee"] = base_desc
        normalized["explication"] = base_desc

    normalized["ux_message"] = (
        "Image difficile a analyser. Essayez une photo plus nette ou rapprochee."
        if confidence_identification < 40
        else ""
    )
    normalized["avertissement"] = str(normalized.get("avertissement") or "Proposition la plus plausible. Merci de valider ou corriger.").strip()

    if not isinstance(normalized.get("hypotheses"), list) or not normalized.get("hypotheses"):
        normalized["hypotheses"] = [
            {
                "nom": normalized["waste_name"],
                "confiance": confidence_identification,
                "filiere": filiere_guess,
            }
        ]
    return normalized


def _fallback_from_hypotheses(filename: str | None = None) -> dict:
    hyp = _top_hypotheses(str(filename or ""), limit=3)
    lead = hyp[0] if hyp else {"nom": UNKNOWN_WASTE_NAME, "confiance": 28, "filiere": "autre"}
    lead_name = str(lead.get("nom") or "").strip() or UNKNOWN_WASTE_NAME
    if _normalize(lead_name) in {"hypothese non determinee", "hypothese inconnue", "inconnu", "unknown"}:
        lead_name = UNKNOWN_WASTE_NAME

    score = _safe_int(lead.get("confiance"), 28)
    score = max(20, min(49, score if score > 0 else 28))
    guessed_filiere = str(lead.get("filiere") or "autre")

    return _normalize_identification_output(
        {
            "nom": lead_name,
            "nom_exact": lead_name,
            "filiere": guessed_filiere,
            "confiance_identification": score,
            "waste_name": lead_name,
            "confidence": round(score / 100.0, 2),
            "status": "uncertain",
            "description_estimee": "L'image est difficile a analyser. Une classification probable est proposee a titre indicatif.",
            "technical_description": _technical_description_for_filiere(guessed_filiere),
            "hypotheses": hyp,
            "valorisation_1": {
                "methode": "Tri complementaire",
                "description": "Identifier plus precisement avant valorisation finale.",
                "valeur_fcfa_tonne": 0,
            },
            "valorisation_2": {
                "methode": "Pre-tri",
                "description": "Orienter vers un centre de tri pour qualification.",
                "valeur_fcfa_tonne": 0,
            },
            "acheteurs_benin": [],
            "acheteurs_cedeao": [],
            "impact_co2_kg": 0,
            "conseil_stockage": "Conserver sec, prendre une photo plus nette.",
            "niveau_danger": "faible",
            "score_valorisation": max(35, score - 5),
            "avertissement": "Proposition la plus plausible. Merci de valider ou corriger.",
        }
    )


def identify_waste_from_image(image_bytes: bytes, media_type: str, filename: str | None = None) -> dict:
    if not image_bytes:
        raise ValueError("Image vide.")
    if len(image_bytes) > MAX_IMAGE_SIZE_BYTES:
        raise ValueError("Image trop lourde (max 6 MB).")
    if media_type not in ALLOWED_MEDIA_TYPES:
        raise ValueError("Format non supporte. Utilise JPEG, PNG ou WEBP.")

    processed_bytes, processed_media_type = _preprocess_image_for_vision(image_bytes, media_type)
    logger.info("identify_waste_from_image called: media_type=%s bytes=%s filename=%s", media_type, len(image_bytes), filename or "")

    parsed = None
    try:
        parsed = vision_completion_json(
            instruction=_build_prompt(),
            image_bytes=processed_bytes,
            media_type=processed_media_type,
            model=(os.getenv("OPENAI_VISION_MODEL") or os.getenv("OPENAI_MODEL") or "gpt-5.5").strip(),
            max_tokens=320,
            timeout_s=35,
        )
    except Exception:
        parsed = None

    if not parsed:
        return _fallback_from_hypotheses(filename)

    nom_exact = str(parsed.get("waste_name") or parsed.get("nom_exact") or parsed.get("nom") or "").strip()
    filiere = _normalize(parsed.get("filiere"))
    if filiere not in {"textile", "plastique", "papier", "biomasse", "metal", "autre"}:
        filiere = _guess_filiere_from_hints(" ".join([nom_exact, str(parsed.get("description_estimee") or ""), str(parsed.get("explication") or "")]))

    if not nom_exact:
        hyp = _top_hypotheses(str(filename or ""), limit=1)
        nom_exact = str(hyp[0].get("nom") if hyp else LOW_CONFIDENCE_UNKNOWN_NAME)

    raw_conf = _safe_float(
        parsed.get("confidence")
        if parsed.get("confidence") is not None
        else (parsed.get("confiance_identification") or parsed.get("confiance")),
        0.35,
    )
    if raw_conf > 1:
        raw_conf = raw_conf / 100.0

    confidence = max(0.0, min(0.99, raw_conf))
    if _is_unreadable_signal(parsed):
        confidence = min(confidence, 0.35)

    explication = str(parsed.get("description_estimee") or parsed.get("explication") or "").strip()
    if not explication:
        explication = f"Classification visuelle probable: {filiere}. {_technical_description_for_filiere(filiere)}"
    phrases = [p.strip() for p in re.split(r"(?<=[.!?])\s+", explication) if p.strip()]
    explication = " ".join(phrases[:2])[:320] if phrases else explication

    hypotheses = _top_hypotheses(" ".join([nom_exact, str(filename or "")]), limit=3)

    result = {
        "waste_name": nom_exact,
        "confidence": round(confidence, 2),
        "status": "identified" if confidence >= 0.5 else "uncertain",
        "nom": nom_exact,
        "nom_exact": nom_exact,
        "filiere": filiere,
        "description_estimee": explication,
        "explication": explication,
        "technical_description": _technical_description_for_filiere(filiere),
        "hypotheses": hypotheses,
        "confiance_identification": int(round(confidence * 100)),
        "confiance": _confidence_label(int(round(confidence * 100))),
        "valorisation_1": parsed.get("valorisation_1") if isinstance(parsed.get("valorisation_1"), dict) else {
            "methode": "Tri et valorisation",
            "description": explication,
            "valeur_fcfa_tonne": _safe_int(parsed.get("valeur_fcfa"), 0),
        },
        "valorisation_2": parsed.get("valorisation_2") if isinstance(parsed.get("valorisation_2"), dict) else {
            "methode": "Alternative locale",
            "description": "Orienter vers un repreneur secondaire.",
            "valeur_fcfa_tonne": 0,
        },
        "acheteurs_benin": parsed.get("acheteurs_benin") if isinstance(parsed.get("acheteurs_benin"), list) else [],
        "acheteurs_cedeao": parsed.get("acheteurs_cedeao") if isinstance(parsed.get("acheteurs_cedeao"), list) else [],
        "impact_co2_kg": _safe_int(parsed.get("impact_co2_kg"), 0),
        "conseil_stockage": str(parsed.get("conseil") or parsed.get("conseil_stockage") or "Stocker dans un espace sec et ventile.").strip(),
        "niveau_danger": str(parsed.get("niveau_danger") or "faible").strip().lower(),
        "score_valorisation": max(0, min(100, _safe_int(parsed.get("score_valorisation"), 55))),
        "avertissement": "Proposition la plus plausible. Merci de valider ou corriger.",
    }

    return _normalize_identification_output(result)
