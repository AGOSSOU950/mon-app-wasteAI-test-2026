import json
import unicodedata
from pathlib import Path


def _normalize(value: str | None) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch)).lower()


def _load_db() -> dict:
    path = Path(__file__).with_name("literature_characteristics.json")
    if not path.exists():
        return {"version": "litterature-missing", "entries": []}

    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception:
        return {"version": "litterature-invalid", "entries": []}


DB = _load_db()


def get_literature_db() -> dict:
    return DB


def _build_reference_index(entry: dict) -> dict[str, str]:
    refs = {}
    for ref in entry.get("references", []):
        ref_id = ref.get("id")
        citation = ref.get("citation")
        if isinstance(ref_id, str) and isinstance(citation, str):
            refs[ref_id] = citation
    return refs


def infer_literature_defaults(
    nom: str,
    description: str | None = None,
) -> tuple[dict, str | None, str | None, list[str], dict[str, list[str]]]:
    text = f"{_normalize(nom)} {_normalize(description)}"
    best_entry = None
    best_score = 0

    for entry in DB.get("entries", []):
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
