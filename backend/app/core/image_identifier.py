import json
import re
import os
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
        # Fallback deterministic top entries if no lexical match.
        top = [(1, row) for row in rows[:limit]]

    if not top:
        return []

    best = max(1, top[0][0])
    result: list[dict] = []
    for idx, (score, row) in enumerate(top):
        confidence = max(35, min(92, int((score / best) * 90) - idx * 8))
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
    if key == "papier" and any(x in name for x in ["bois", "mixte"]):
        return WasteType.BIOMASSE_LIGNOCELLULOSIQUE
    return WasteType.OTHER


def _confidence_label(score: int) -> str:
    if score >= 80:
        return "elevee"
    if score >= 60:
        return "moyenne"
    return "faible"


def _build_prompt() -> str:
    return (
        "Tu es un expert en dÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©chets industriels \n"
        "spÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©cialisÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â© au BÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©nin et en Afrique de l'Ouest.\n\n"
        "CONTEXTE BÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â°NINOIS :\n"
        "- Industries textiles : SITEX, SOBETEX, \n"
        "  ateliers de couture Cotonou/Porto-Novo\n"
        "- Industries plastiques : recycleurs Cotonou,\n"
        "  Zone Industrielle de Cotonou\n"
        "- Industries papier/carton : importateurs, \n"
        "  imprimeries locales\n\n"
        "FILIÃƒÆ’Ã†â€™Ãƒâ€¹Ã¢â‚¬Â RES PRIORITAIRES (dans cet ordre) :\n"
        "1. TEXTILE ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ recyclage, rÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©emploi, chiffons\n"
        "2. PLASTIQUE ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ recyclage, valorisation ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©nergÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©tique  \n"
        "3. PAPIER ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ recyclage, compostage\n\n"
        "Analyse cette image et retourne UNIQUEMENT \n"
        "ce JSON sans aucun texte autour :\n\n"
        "{\n"
        "  'nom_exact': 'nom prÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©cis du dÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©chet visible',\n"
        "  'filiere': 'textile|plastique|papier|autre',\n"
        "  'sous_type': 'description dÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©taillÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©e',\n"
        "  'origine_probable': 'industrie source',\n"
        "  'qualite': 'haute|moyenne|faible',\n"
        "  'valorisation_1': {\n"
        "    'methode': 'meilleure valorisation',\n"
        "    'description': 'explication',\n"
        "    'valeur_fcfa_tonne': 0000\n"
        "  },\n"
        "  'valorisation_2': {\n"
        "    'methode': 'alternative',\n"
        "    'description': 'explication',\n"
        "    'valeur_fcfa_tonne': 0000\n"
        "  },\n"
        "  'acheteurs_benin': ['acheteur1', 'acheteur2'],\n"
        "  'acheteurs_cedeao': ['acheteur1', 'acheteur2'],\n"
        "  'impact_co2_kg': 000,\n"
        "  'conseil_stockage': 'conseil pratique',\n"
        "  'niveau_danger': 'faible|moyen|ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©levÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©',\n"
        "  'score_valorisation': 0-100,\n"
        "  'confiance_identification': 0-100,\n"
        "  'explication': 'pourquoi cette identification'\n"
        "}\n\n"
        "Si le dÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©chet n'est PAS textile/plastique/papier,\n"
        "indique quand mÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Âªme la meilleure filiÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¨re possible\n"
        "dans le contexte bÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©ninois."
    )


def _fallback_from_hypotheses(filename: str | None = None) -> dict:
    hyp = _top_hypotheses(str(filename or ""), limit=3)
    lead = hyp[0] if hyp else {"nom": "Hypothese non determinee", "confiance": 40, "filiere": "autre"}
    score = _safe_int(lead.get("confiance"), 40)

    return {
        "nom": str(lead.get("nom") or "Hypothese non determinee"),
        "nom_exact": str(lead.get("nom") or "Hypothese non determinee"),
        "filiere": str(lead.get("filiere") or "autre"),
        "sous_type": "Estimation prealable basee sur la base beninoise",
        "origine_probable": "A confirmer",
        "qualite": "faible",
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
        "score_valorisation": max(45, score - 10),
        "confiance_identification": score,
        "explication": "Reconnaissance incertaine: hypotheses proposees a partir de la base Benin.",
        "hypotheses": hyp,
        "categorie": _category_from_filiere(str(lead.get("filiere") or "autre")),
        "type_dechet": _type_from_filiere(str(lead.get("filiere") or "autre"), str(lead.get("nom") or "")),
        "confiance": _confidence_label(score),
        "description_estimee": "Je ne suis pas sur a 100%. Voici mes 3 meilleures hypotheses.",
        "avertissement": "Photo peu claire - Prenez une meilleure photo",
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
            model=(os.getenv("OPENAI_VISION_MODEL") or os.getenv("OPENAI_MODEL") or "gpt-5.4").strip(),
            max_tokens=900,
            timeout_s=35,
        )
    except Exception:
        parsed = None

    if not parsed:
        return _fallback_from_hypotheses(filename)

    nom_exact = str(parsed.get("nom_exact") or parsed.get("nom") or "").strip()
    filiere = _normalize(parsed.get("filiere"))
    if filiere not in {"textile", "plastique", "papier", "autre"}:
        filiere = "autre"

    if not nom_exact:
        hyp = _top_hypotheses(str(filename or ""), limit=1)
        if hyp:
            nom_exact = str(hyp[0].get("nom") or "Hypothese non determinee")
        else:
            nom_exact = "Hypothese non determinee"

    confiance_identification = _safe_int(parsed.get("confiance_identification"), 60)
    confiance_identification = max(0, min(100, confiance_identification))

    hypotheses = _top_hypotheses(" ".join([nom_exact, str(parsed.get("sous_type") or ""), str(filename or "")]), limit=3)

    result = {
        "nom": nom_exact,
        "nom_exact": nom_exact,
        "filiere": filiere,
        "sous_type": str(parsed.get("sous_type") or "").strip(),
        "origine_probable": str(parsed.get("origine_probable") or "").strip(),
        "qualite": str(parsed.get("qualite") or "moyenne").strip().lower() or "moyenne",
        "valorisation_1": parsed.get("valorisation_1") if isinstance(parsed.get("valorisation_1"), dict) else {
            "methode": "Tri et valorisation",
            "description": "Affiner en fonction de la qualite reelle du lot.",
            "valeur_fcfa_tonne": 0,
        },
        "valorisation_2": parsed.get("valorisation_2") if isinstance(parsed.get("valorisation_2"), dict) else {
            "methode": "Alternative locale",
            "description": "Orienter vers un repreneur secondaire.",
            "valeur_fcfa_tonne": 0,
        },
        "acheteurs_benin": parsed.get("acheteurs_benin") if isinstance(parsed.get("acheteurs_benin"), list) else [],
        "acheteurs_cedeao": parsed.get("acheteurs_cedeao") if isinstance(parsed.get("acheteurs_cedeao"), list) else [],
        "impact_co2_kg": _safe_int(parsed.get("impact_co2_kg"), 0),
        "conseil_stockage": str(parsed.get("conseil_stockage") or "Stocker dans un espace sec et ventile.").strip(),
        "niveau_danger": str(parsed.get("niveau_danger") or "faible").strip().lower(),
        "score_valorisation": max(0, min(100, _safe_int(parsed.get("score_valorisation"), 65))),
        "confiance_identification": confiance_identification,
        "explication": str(parsed.get("explication") or "Identification basee sur les caracteristiques visuelles dominantes.").strip(),
        "hypotheses": hypotheses,
        "categorie": _category_from_filiere(filiere),
        "type_dechet": _type_from_filiere(filiere, nom_exact),
        "confiance": _confidence_label(confiance_identification),
        "description_estimee": str(parsed.get("explication") or "Identification visuelle initiale."),
        "avertissement": None,
    }

    if confiance_identification < 70:
        result["avertissement"] = "Photo peu claire - Prenez une meilleure photo"
        if not result["description_estimee"]:
            result["description_estimee"] = "Je ne suis pas sur a 100%. Voici mes 3 meilleures hypotheses."

    if not result["hypotheses"]:
        result["hypotheses"] = _top_hypotheses(nom_exact, limit=3)

    return result