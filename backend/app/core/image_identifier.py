import json
import os
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

from app.core.llm_client import vision_completion_json
from app.models.waste import WasteCategory, WasteType

MAX_IMAGE_SIZE_BYTES = 6 * 1024 * 1024
ALLOWED_MEDIA_TYPES = {"image/jpeg", "image/png", "image/webp"}
BENIN_DB_PATH = Path(__file__).resolve().with_name("waste_benin_database.json")


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

    ranked: list[tuple[int, dict]] = []
    for row in rows:
        ranked.append((_score_match(row, text), row))

    ranked.sort(key=lambda x: x[0], reverse=True)
    top = ranked[: max(1, limit)]

    if top and top[0][0] <= 0:
        top = [(1, row) for row in rows[:limit]]

    if not top:
        return []

    best = max(1, top[0][0])
    result: list[dict] = []
    for idx, (score, row) in enumerate(top):
        confidence = max(60, min(95, int((score / best) * 92) - idx * 6))
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
    if key == "textile":
        return WasteCategory.OTHER
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


def _confidence_message(score: int) -> str:
    if score < 40:
        return "Photo difficile a analyser. Conseils: meilleure lumiere, dechet bien centre, fond neutre"
    if score < 60:
        return "Dechet identifie avec precision moyenne. Une meilleure photo ameliorerait les resultats"
    if score <= 80:
        return "Bonne identification !"
    return "Identification precise !"


def _is_unreadable_signal(parsed: dict) -> bool:
    text = " ".join(
        [
            str(parsed.get("nom_exact") or ""),
            str(parsed.get("explication") or ""),
            str(parsed.get("sous_type") or ""),
        ]
    )
    norm = _normalize(text)
    hints = ["completement noire", "completement noir", "image noire", "illisible", "black image", "unreadable", "aucun objet"]
    return any(h in norm for h in hints)


def _build_prompt() -> str:
    return (
        "Expert dechets industriels Benin.\n"
        "Observe la photo et propose le dechet le plus plausible meme en cas d\'incertitude.\n"
        "Retourne UNIQUEMENT ce JSON:\n"
        "{\n"
        "  'nom_exact': '...',\n"
        "  'filiere': 'textile|plastique|papier|biomasse|metal|autre',\n"
        "  'description_estimee': '1 a 2 phrases max',\n"
        "  'confiance': 20-99\n"
        "}\n"
        "Pas de texte autour du JSON."
    )


def _fallback_from_hypotheses(filename: str | None = None) -> dict:
    hyp = _top_hypotheses(str(filename or ""), limit=3)
    lead = hyp[0] if hyp else {"nom": "Hypothese non determinee", "confiance": 62, "filiere": "autre"}
    score = max(60, min(95, _safe_int(lead.get("confiance"), 62)))

    return {
        "nom": str(lead.get("nom") or "Hypothese non determinee"),
        "nom_exact": str(lead.get("nom") or "Hypothese non determinee"),
        "filiere": str(lead.get("filiere") or "autre"),
        "sous_type": "Estimation prealable basee sur la base beninoise",
        "origine_probable": "A confirmer",
        "qualite": "moyenne",
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
        "score_valorisation": max(45, score - 8),
        "confiance_identification": score,
        "explication": "Reconnaissance prealable basee sur les meilleurs profils disponibles.",
        "hypotheses": hyp,
        "categorie": _category_from_filiere(str(lead.get("filiere") or "autre")),
        "type_dechet": _type_from_filiere(str(lead.get("filiere") or "autre"), str(lead.get("nom") or "")),
        "confiance": _confidence_label(score),
        "description_estimee": "Identification visuelle probable. Merci de confirmer ce nom.",
        "avertissement": "Proposition la plus plausible. Merci de valider ou corriger.",
    }


def identify_waste_from_image(image_bytes: bytes, media_type: str, filename: str | None = None) -> dict:
    if not image_bytes:
        raise ValueError("Image vide.")
    if len(image_bytes) > MAX_IMAGE_SIZE_BYTES:
        raise ValueError("Image trop lourde (max 6 MB).")
    if media_type not in ALLOWED_MEDIA_TYPES:
        raise ValueError("Format non supporte. Utilise JPEG, PNG ou WEBP.")

    prompt = _build_prompt()

    try:
        parsed = vision_completion_json(
            instruction=prompt,
            image_bytes=image_bytes,
            media_type=media_type,
            model=(os.getenv("OPENAI_VISION_MODEL") or os.getenv("OPENAI_MODEL") or "gpt-4o").strip(),
            max_tokens=260,
            timeout_s=35,
        )
    except Exception:
        parsed = None

    if not parsed:
        return _fallback_from_hypotheses(filename)

    nom_exact = str(parsed.get("nom_exact") or parsed.get("nom") or "").strip()
    filiere = _normalize(parsed.get("filiere"))
    if filiere not in {"textile", "plastique", "papier", "biomasse", "metal", "autre"}:
        filiere = "autre"

    if not nom_exact:
        hyp = _top_hypotheses(str(filename or ""), limit=1)
        if hyp:
            nom_exact = str(hyp[0].get("nom") or "Hypothese non determinee")
        else:
            nom_exact = "Hypothese non determinee"

    raw_conf = _safe_int(parsed.get("confiance_identification") or parsed.get("confiance"), 65)
    if _is_unreadable_signal(parsed):
        confiance_identification = max(20, min(45, raw_conf if raw_conf < 46 else 40))
    else:
        confiance_identification = max(20, min(99, raw_conf))

    valorisation = str(parsed.get("valorisation") or "").strip()
    valeur_fcfa = _safe_int(parsed.get("valeur_fcfa"), 0)
    explication = str(parsed.get("description_estimee") or parsed.get("explication") or "Identification visuelle probable. Merci de confirmer ce nom.").strip()
    phrases = [p.strip() for p in re.split(r"(?<=[.!?])\\s+", explication) if p.strip()]
    explication = " ".join(phrases[:2])[:260] if phrases else "Identification visuelle probable. Merci de confirmer ce nom."

    hypotheses = _top_hypotheses(" ".join([nom_exact, str(filename or "")]), limit=3)

    result = {
        "nom": nom_exact,
        "nom_exact": nom_exact,
        "filiere": filiere,
        "sous_type": str(parsed.get("sous_type") or "").strip(),
        "origine_probable": str(parsed.get("origine_probable") or "").strip(),
        "qualite": str(parsed.get("qualite") or "moyenne").strip().lower() or "moyenne",
        "valorisation_1": parsed.get("valorisation_1") if isinstance(parsed.get("valorisation_1"), dict) else {
            "methode": valorisation or "Tri et valorisation",
            "description": explication,
            "valeur_fcfa_tonne": valeur_fcfa,
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
        "score_valorisation": max(0, min(100, _safe_int(parsed.get("score_valorisation"), 65))),
        "confiance_identification": confiance_identification,
        "explication": explication,
        "hypotheses": hypotheses,
        "categorie": _category_from_filiere(filiere),
        "type_dechet": _type_from_filiere(filiere, nom_exact),
        "confiance": _confidence_label(confiance_identification),
        "description_estimee": explication,
        "avertissement": "Proposition la plus plausible. Merci de valider ou corriger.",
    }

    if not result["hypotheses"]:
        result["hypotheses"] = _top_hypotheses(nom_exact, limit=3)

    return result





