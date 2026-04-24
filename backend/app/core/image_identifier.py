import base64
import json
import os
import re
import unicodedata

import anthropic

from app.models.waste import WasteCategory, WasteType

MAX_IMAGE_SIZE_BYTES = 6 * 1024 * 1024
ALLOWED_MEDIA_TYPES = {"image/jpeg", "image/png", "image/webp"}


def _normalize(value: str | None) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch)).lower()


def _extract_json_block(text: str) -> dict | None:
    if not text:
        return None

    try:
        loaded = json.loads(text)
        if isinstance(loaded, dict):
            return loaded
    except Exception:
        pass

    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        return None

    try:
        loaded = json.loads(match.group(0))
        if isinstance(loaded, dict):
            return loaded
    except Exception:
        return None
    return None


def _safe_category(value: str | None) -> WasteCategory:
    try:
        return WasteCategory((value or "").strip().lower())
    except Exception:
        return WasteCategory.OTHER


def _safe_waste_type(value: str | None) -> WasteType:
    try:
        return WasteType((value or "").strip().lower())
    except Exception:
        return WasteType.OTHER


def _heuristic_from_filename(filename: str | None) -> dict:
    text = _normalize(filename)

    nom = "dechet industriel non identifie"
    categorie = WasteCategory.OTHER
    waste_type = WasteType.OTHER

    if any(k in text for k in ["coco", "coque", "bois", "sciure", "biomasse"]):
        nom = "biomasse lignocellulosique"
        categorie = WasteCategory.ORGANIC
        waste_type = WasteType.BIOMASSE_LIGNOCELLULOSIQUE
    elif any(k in text for k in ["boue", "sludge", "vidange"]):
        nom = "boue de vidange"
        categorie = WasteCategory.ORGANIC
        waste_type = WasteType.BOUE_DE_VIDANGE
    elif any(k in text for k in ["huile", "oil", "lubrifiant", "moteur"]):
        nom = "huile usagee"
        categorie = WasteCategory.CHEMICAL
        waste_type = WasteType.HUILE_USAGEE
    elif any(k in text for k in ["textile", "tissu", "vetement", "coton", "lin", "polyester"]):
        nom = "dechet textile"
        categorie = WasteCategory.OTHER
        waste_type = WasteType.TEXTILE
    elif any(k in text for k in ["plastique", "pet", "pehd", "pp", "pvc", "emballage"]):
        nom = "dechet plastique"
        categorie = WasteCategory.PLASTIC
        waste_type = WasteType.PLASTIQUE
    elif any(k in text for k in ["fer", "acier", "metal", "tole"]):
        nom = "dechet ferreux"
        categorie = WasteCategory.METAL

    return {
        "nom": nom,
        "categorie": categorie,
        "type_dechet": waste_type,
        "confiance": "faible",
        "description_estimee": "Identification heuristique basee sur le nom du fichier.",
        "avertissement": "Vision IA indisponible ou resultat incertain. Verification humaine recommandee.",
    }


def identify_waste_from_image(image_bytes: bytes, media_type: str, filename: str | None = None) -> dict:
    if not image_bytes:
        raise ValueError("Image vide.")
    if len(image_bytes) > MAX_IMAGE_SIZE_BYTES:
        raise ValueError("Image trop lourde (max 6 MB).")
    if media_type not in ALLOWED_MEDIA_TYPES:
        raise ValueError("Format non supporte. Utilise JPEG, PNG ou WEBP.")

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return _heuristic_from_filename(filename)

    prompt = (
        "Tu es un classificateur de dechets industriels. "
        "Observe l'image et retourne UNIQUEMENT un JSON valide, sans texte autour, "
        "avec ce schema exact: "
        "{\"nom\": string, \"categorie\": one of [\"organique\",\"chimique\",\"metal\",\"plastique\",\"electronique\",\"papier\",\"verre\",\"autre\"], "
        "\"type_dechet\": one of [\"biomasse_lignocellulosique\",\"boue_de_vidange\",\"huile_usagee\",\"textile\",\"plastique\",\"autre\"], "
        "\"confiance\": one of [\"faible\",\"moyenne\",\"elevee\"], "
        "\"description_estimee\": string}. "
        "Si incertain, reste conservateur et mets categorie/type a 'autre'."
    )

    try:
        encoded = base64.b64encode(image_bytes).decode("utf-8")
        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=280,
            temperature=0,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": encoded,
                            },
                        },
                    ],
                }
            ],
        )

        response_text = ""
        if message.content and getattr(message.content[0], "text", None):
            response_text = message.content[0].text

        parsed = _extract_json_block(response_text)
        if not parsed:
            return _heuristic_from_filename(filename)

        nom = str(parsed.get("nom") or "dechet industriel")
        categorie = _safe_category(parsed.get("categorie"))
        waste_type = _safe_waste_type(parsed.get("type_dechet"))
        confiance = str(parsed.get("confiance") or "faible").lower()
        if confiance not in {"faible", "moyenne", "elevee"}:
            confiance = "faible"
        description = str(parsed.get("description_estimee") or "")

        result = {
            "nom": nom,
            "categorie": categorie,
            "type_dechet": waste_type,
            "confiance": confiance,
            "description_estimee": description,
            "avertissement": None,
        }

        if result["nom"].strip() == "":
            result["nom"] = "dechet industriel"

        return result
    except Exception:
        return _heuristic_from_filename(filename)
