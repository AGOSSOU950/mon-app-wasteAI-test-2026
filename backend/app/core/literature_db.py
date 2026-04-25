import json
import unicodedata
from pathlib import Path


def _normalize(value: str | None) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch)).lower().strip()


def _load_json(filename: str, fallback: dict) -> dict:
    path = Path(__file__).with_name(filename)
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception:
        return fallback


LITERATURE_DB = _load_json("literature_characteristics.json", {"version": "litterature-invalid", "entries": []})
SCIENTIFIC_DB = _load_json("scientific_profiles.json", {"version": "scientific-invalid", "profiles": [], "type_fallbacks": {}})


def get_literature_db() -> dict:
    return LITERATURE_DB


def get_scientific_db() -> dict:
    return SCIENTIFIC_DB


def _build_reference_index(entry: dict) -> dict[str, str]:
    refs = {}
    for ref in entry.get("references", []):
        ref_id = ref.get("id")
        citation = ref.get("citation")
        if isinstance(ref_id, str) and isinstance(citation, str):
            refs[ref_id] = citation
    return refs


def get_scientific_prefill(
    nom: str,
    type_dechet: str | None = None,
    categorie: str | None = None,
    description: str | None = None,
) -> dict[str, object]:
    text = f"{_normalize(nom)} {_normalize(description)}"
    waste_type = _normalize(type_dechet)
    waste_cat = _normalize(categorie)

    best_profile = None
    best_score = -1

    for profile in SCIENTIFIC_DB.get("profiles", []):
        aliases = profile.get("aliases", [])
        alias_hits = 0
        for alias in aliases:
            alias_n = _normalize(alias)
            if alias_n and alias_n in text:
                alias_hits += 1

        p_type = _normalize(profile.get("type_dechet"))
        p_cat = _normalize(profile.get("categorie"))

        type_match = 1 if (waste_type and p_type and waste_type == p_type) else 0
        cat_match = 1 if (waste_cat and p_cat and waste_cat == p_cat) else 0

        score = alias_hits * 4 + type_match * 2 + cat_match
        if score > best_score and score > 0:
            best_score = score
            best_profile = profile

    if best_profile:
        return {
            "source": "profile",
            "profile_id": best_profile.get("id"),
            "defaults": best_profile.get("defaults", {}),
            "references": best_profile.get("references", []),
            "score": best_score,
        }

    if waste_type:
        fallback = (SCIENTIFIC_DB.get("type_fallbacks") or {}).get(waste_type)
        if isinstance(fallback, dict):
            return {
                "source": "type_fallback",
                "profile_id": f"type_{waste_type}",
                "defaults": fallback.get("defaults", {}),
                "references": fallback.get("references", []),
                "score": 0,
            }

    return {
        "source": "none",
        "profile_id": None,
        "defaults": {},
        "references": [],
        "score": 0,
    }


def infer_literature_defaults(
    nom: str,
    description: str | None = None,
) -> tuple[dict, str | None, str | None, list[str], dict[str, list[str]]]:
    # Priorite 1: base scientifique centralisee (matching par alias/texte)
    sci = get_scientific_prefill(nom=nom, description=description)
    sci_defaults = sci.get("defaults", {}) if isinstance(sci, dict) else {}
    if sci_defaults:
        source = f"Base scientifique centralisee ({sci.get('source', 'profile')})"
        entry_id = str(sci.get("profile_id") or "scientific")
        references = [str(r) for r in (sci.get("references") or []) if str(r).strip()]
        return sci_defaults, source, entry_id, references, {}

    # Priorite 2: base litterature historique (retrocompatibilite)
    text = f"{_normalize(nom)} {_normalize(description)}"
    best_entry = None
    best_score = 0

    for entry in LITERATURE_DB.get("entries", []):
        score = 0
        for kw in entry.get("keywords", []):
            if _normalize(kw) in text:
                score += 1

        if score > best_score:
            best_score = score
            best_entry = entry

    if not best_entry:
        return {}, None, None, [], {}

    defaults = best_entry.get("defaults", {})
    source = best_entry.get("source")
    entry_id = best_entry.get("id")

    ref_index = _build_reference_index(best_entry)
    references = list(ref_index.values())

    field_refs_raw = best_entry.get("field_references", {})
    field_references: dict[str, list[str]] = {}
    for field_name, ref_ids in field_refs_raw.items():
        if not isinstance(field_name, str):
            continue
        if not isinstance(ref_ids, list):
            continue

        citations = [ref_index[rid] for rid in ref_ids if isinstance(rid, str) and rid in ref_index]
        if citations:
            field_references[field_name] = citations

    return defaults, source, entry_id, references, field_references
