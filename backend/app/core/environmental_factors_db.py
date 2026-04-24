import json
import threading
import unicodedata
from copy import deepcopy
from pathlib import Path

_FALLBACK_DB = {
    "version": "missing",
    "scope": "CEDEAO",
    "default": {
        "generated_multiplier": 1.0,
        "avoided_multiplier": 1.0,
        "transport_penalty_multiplier": 1.0,
        "source": "Default CEDEAO baseline",
    },
    "countries": {},
    "references": [],
}

_DB_LOCK = threading.Lock()
_DB_PATH = Path(__file__).with_name("environmental_factors_cedeao.json")
_TEMPLATE_PATH = Path(__file__).with_name("environmental_factors_cedeao_template.json")


def _normalize(value: str | None) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch)).lower().strip()


def _load_db() -> dict:
    if not _DB_PATH.exists():
        return deepcopy(_FALLBACK_DB)

    try:
        data = json.loads(_DB_PATH.read_text(encoding="utf-8-sig"))
        if isinstance(data, dict):
            return data
    except Exception:
        pass

    fallback = deepcopy(_FALLBACK_DB)
    fallback["version"] = "invalid"
    return fallback


_DB = _load_db()


def _ensure_multiplier(value: object, field_name: str) -> float:
    if not isinstance(value, (int, float)):
        raise ValueError(f"{field_name} doit etre numerique.")
    as_float = float(value)
    if as_float <= 0:
        raise ValueError(f"{field_name} doit etre > 0.")
    if as_float > 5:
        raise ValueError(f"{field_name} est trop eleve (max 5).")
    return as_float


def _validate_profile(profile: dict, profile_name: str) -> dict:
    if not isinstance(profile, dict):
        raise ValueError(f"Profil {profile_name} invalide.")

    return {
        "generated_multiplier": _ensure_multiplier(profile.get("generated_multiplier", 1.0), f"{profile_name}.generated_multiplier"),
        "avoided_multiplier": _ensure_multiplier(profile.get("avoided_multiplier", 1.0), f"{profile_name}.avoided_multiplier"),
        "transport_penalty_multiplier": _ensure_multiplier(
            profile.get("transport_penalty_multiplier", 1.0),
            f"{profile_name}.transport_penalty_multiplier",
        ),
        "source": str(profile.get("source") or "Source non renseignee"),
    }


def _validate_db(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("Payload invalide.")

    countries_raw = payload.get("countries", {})
    refs_raw = payload.get("references", [])

    if not isinstance(countries_raw, dict):
        raise ValueError("countries doit etre un objet.")
    if not isinstance(refs_raw, list):
        raise ValueError("references doit etre une liste.")

    validated = {
        "version": str(payload.get("version") or "cedeao-impact-v1"),
        "scope": str(payload.get("scope") or "CEDEAO"),
        "default": _validate_profile(payload.get("default") or {}, "default"),
        "countries": {},
        "references": [str(x) for x in refs_raw if str(x).strip()],
    }

    for country, profile in countries_raw.items():
        country_name = str(country).strip()
        if not country_name:
            continue
        validated["countries"][country_name] = _validate_profile(profile, country_name)

    return validated


def _save_db(data: dict) -> None:
    _DB_PATH.write_text(json.dumps(data, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")


def get_environmental_factors_db() -> dict:
    with _DB_LOCK:
        return deepcopy(_DB)


def get_environmental_factors_template() -> dict:
    if _TEMPLATE_PATH.exists():
        try:
            data = json.loads(_TEMPLATE_PATH.read_text(encoding="utf-8-sig"))
            if isinstance(data, dict):
                return data
        except Exception:
            pass

    fallback = deepcopy(_FALLBACK_DB)
    fallback["version"] = "template-fallback"
    fallback["notes_methodo"] = [
        "Renseigner les multiplicateurs > 0.",
        "Documenter chaque valeur avec une source.",
    ]
    return fallback


def update_environmental_factors_db(payload: dict) -> dict:
    validated = _validate_db(payload)
    with _DB_LOCK:
        global _DB
        _DB = validated
        _save_db(_DB)
        return deepcopy(_DB)


def get_country_environmental_profile(country: str | None) -> dict:
    with _DB_LOCK:
        default_profile = _DB.get("default", {}) if isinstance(_DB.get("default"), dict) else {}
        if not country:
            return {**default_profile, "country": None, "fallback": True}

        countries = _DB.get("countries", {}) if isinstance(_DB.get("countries"), dict) else {}

        normalized_target = _normalize(country)
        for key, profile in countries.items():
            if _normalize(str(key)) == normalized_target and isinstance(profile, dict):
                merged = {**default_profile, **profile}
                merged["country"] = key
                merged["fallback"] = False
                return merged

        return {**default_profile, "country": country, "fallback": True}
