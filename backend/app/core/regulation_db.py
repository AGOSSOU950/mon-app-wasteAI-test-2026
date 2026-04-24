import json
import unicodedata
from pathlib import Path

from app.models.waste import WasteCategory, WasteInput

SEVERITY_ORDER = {"info": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}


def _normalize(value: str | None) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch)).strip().lower()


def _load_db() -> dict:
    path = Path(__file__).with_name("regulations_cedeao.json")
    if not path.exists():
        return {"version": "reg-ceDEAO-missing", "countries": [], "sous_regions": {}}
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception:
        return {"version": "reg-ceDEAO-invalid", "countries": [], "sous_regions": {}}


REG_DB = _load_db()


def get_regulation_db() -> dict:
    return REG_DB


def _infer_subregion(country: str) -> str | None:
    for subregion, members in REG_DB.get("sous_regions", {}).items():
        if country in [_normalize(x) for x in members]:
            return subregion
    return None


def _format_ref(ref: str | dict) -> str:
    if isinstance(ref, str):
        return ref
    if isinstance(ref, dict):
        title = str(ref.get("title") or "Reference")
        article = str(ref.get("article") or "")
        source = str(ref.get("source") or "")
        summary = str(ref.get("summary") or "")
        parts = [title]
        if article:
            parts.append(f"({article})")
        if source:
            parts.append(f"- {source}")
        if summary:
            parts.append(f": {summary}")
        return " ".join(parts)
    return str(ref)


def _rule_meta(rule_id: str) -> dict:
    for rule in REG_DB.get("regles_screening", []):
        if str(rule.get("id")) == rule_id:
            return rule
    return {"id": rule_id, "severity": "medium", "label": rule_id}


def _add_rule_hit(rule_hits: list[dict], rule_id: str, message: str, blocked_decision: str | None) -> None:
    meta = _rule_meta(rule_id)
    rule_hits.append(
        {
            "id": rule_id,
            "label": meta.get("label", rule_id),
            "severity": str(meta.get("severity") or "medium"),
            "source": meta.get("source"),
            "article": meta.get("article"),
            "message": message,
            "blocked_decision": blocked_decision,
        }
    )


def _max_severity(rule_hits: list[dict], has_block: bool) -> str:
    if not rule_hits:
        return "low" if not has_block else "medium"
    max_level = max(SEVERITY_ORDER.get(str(hit.get("severity", "medium")), 2) for hit in rule_hits)
    for name, level in SEVERITY_ORDER.items():
        if level == max_level:
            return name
    return "medium"


def _compute_risk_score(rule_hits: list[dict], warnings: list[str], in_cedeao: bool) -> int:
    if not rule_hits and in_cedeao and not warnings:
        return 0

    score = 0
    for hit in rule_hits:
        sev = str(hit.get("severity") or "medium")
        score += {
            "info": 5,
            "low": 10,
            "medium": 20,
            "high": 35,
            "critical": 50,
        }.get(sev, 20)

    if warnings:
        score += min(20, 5 * len(warnings))

    if not in_cedeao:
        score += 10

    return int(max(0, min(100, score)))


def _decision_key_to_label(decision_labels: dict[str, str], key: str) -> str | None:
    if key == "matiere":
        return decision_labels.get("matiere")
    if key in {"energie", "energetique"}:
        return decision_labels.get("energetique")
    if key == "vente":
        return decision_labels.get("vente")
    return None


def _is_chemical_hazardous(waste: WasteInput) -> bool:
    level = str(getattr(waste.niveau_danger, "value", waste.niveau_danger))
    return waste.categorie == WasteCategory.CHEMICAL and level in {"eleve", "critique"}


def _match_export_rule(rule: dict, waste: WasteInput, waste_type_value: str) -> bool:
    allowed_types = [str(x) for x in rule.get("waste_types", [])]
    allowed_categories = [str(x) for x in rule.get("waste_categories", [])]
    if allowed_types and waste_type_value not in allowed_types:
        return False
    if allowed_categories and waste.categorie.value not in allowed_categories:
        return False
    return True


def evaluate_regulatory_compliance(
    waste: WasteInput,
    waste_type_effectif_value: str,
    decision_labels: dict[str, str],
) -> tuple[dict[str, list[str]], dict, list[str]]:
    country = _normalize(waste.pays_cedeao)
    user_subregion = _normalize(waste.sous_region_cedeao)
    countries = [_normalize(x) for x in REG_DB.get("countries", [])]

    in_cedeao = country in countries if country else False
    inferred_subregion = _infer_subregion(country) if in_cedeao else None
    subregion_consistent = bool(user_subregion and inferred_subregion and user_subregion == inferred_subregion)

    blocked: dict[str, list[str]] = {
        decision_labels["matiere"]: [],
        decision_labels["energetique"]: [],
        decision_labels["vente"]: [],
    }
    warnings: list[str] = []
    rule_hits: list[dict] = []
    international_restrictions: list[str] = []
    filiere_restrictions: list[str] = []

    if not country:
        warnings.append("Pays CEDEAO non renseigne: verification reglementaire partielle.")
    elif not in_cedeao:
        warnings.append("Pays hors perimetre CEDEAO: verifier la conformite avec la reglementation locale specifique.")

    if user_subregion and inferred_subregion and user_subregion != inferred_subregion:
        warnings.append(f"Sous-region incoherente avec le pays ({waste.sous_region_cedeao} vs {inferred_subregion}).")

    # Regles existantes
    danger_value = str(getattr(waste.niveau_danger, "value", waste.niveau_danger))
    if danger_value in ["eleve", "critique"]:
        msg = "Vente directe non conforme pour dechets dangereux sans autorisation specifique."
        blocked[decision_labels["vente"]].append(msg)
        _add_rule_hit(rule_hits, "ecowas_danger_market", msg, decision_labels["vente"])

    if waste_type_effectif_value in ["huile_usagee", "boue_de_vidange"]:
        msg = "Flux reglemente: transfert vers operateur agree requis (pas de vente directe)."
        blocked[decision_labels["vente"]].append(msg)
        _add_rule_hit(rule_hits, "ecowas_hazardous_transfer", msg, decision_labels["vente"])

    is_pvc = False
    if waste_type_effectif_value == "plastique":
        tp = _normalize(waste.type_plastique)
        is_pvc = ("pvc" in tp) or bool(waste.presence_chlore)

    if is_pvc and not waste.filiere_cimenterie_autorisee:
        msg = "PVC/chlore: valorisation energetique interdite hors filiere cimenterie autorisee (screening CEDEAO)."
        blocked[decision_labels["energetique"]].append(msg)
        _add_rule_hit(rule_hits, "ecowas_pvc_energy", msg, decision_labels["energetique"])

    if waste_type_effectif_value == "textile" and bool(waste.presence_metaux_lourds):
        msg = "Textile avec metaux lourds: depollution obligatoire avant mise sur le marche."
        blocked[decision_labels["vente"]].append(msg)
        _add_rule_hit(rule_hits, "ecowas_textile_hm", msg, decision_labels["vente"])

    # Regles filiere par type de produit
    filiere_rules = REG_DB.get("filieres_autorisees_par_type", {})
    target_key = "chimique_dangereux" if _is_chemical_hazardous(waste) else waste_type_effectif_value
    specific = filiere_rules.get(target_key)
    if isinstance(specific, dict):
        interdit = specific.get("interdit", [])
        msg = str(specific.get("message_interdit") or "Filiere non autorisee pour ce flux.")
        rid = str(specific.get("rule_id") or "ecowas_rule_type")
        for dkey in interdit:
            label = _decision_key_to_label(decision_labels, str(dkey))
            if label:
                blocked[label].append(msg)
                filiere_restrictions.append(msg)
                _add_rule_hit(rule_hits, rid, msg, label)

    # Restrictions commerce international par pays
    export_by_country = REG_DB.get("restrictions_export_par_pays", {})
    country_rules = export_by_country.get(country, []) if country else []
    for rule in country_rules:
        if not isinstance(rule, dict):
            continue
        if not _match_export_rule(rule, waste, waste_type_effectif_value):
            continue
        msg = str(rule.get("message") or "Restriction export detectee pour ce flux.")
        rid = str(rule.get("id") or "ecowas_international_hazardous_ban")
        mode = str(rule.get("mode") or "warning")
        international_restrictions.append(msg)

        if mode == "block_vente":
            blocked[decision_labels["vente"]].append(msg)
            _add_rule_hit(rule_hits, rid, msg, decision_labels["vente"])
        else:
            warnings.append(msg)
            _add_rule_hit(rule_hits, rid, msg, None)

    country_refs = REG_DB.get("references_par_pays", {}).get(country, []) if country else []
    references = [_format_ref(r) for r in REG_DB.get("references_generales", [])] + [_format_ref(r) for r in country_refs]

    has_block = any(bool(v) for v in blocked.values())
    max_sev = _max_severity(rule_hits, has_block)

    status = "conforme" if not has_block and in_cedeao else "conforme_sous_conditions"
    if has_block:
        status = "non_conforme"
    elif warnings or international_restrictions or filiere_restrictions:
        status = "conforme_sous_conditions"

    risk_score = _compute_risk_score(rule_hits, warnings, in_cedeao)

    payload = {
        "scope": REG_DB.get("scope", "CEDEAO"),
        "country": country or None,
        "in_cedeao": in_cedeao,
        "sous_region": inferred_subregion,
        "sous_region_saisie": user_subregion or None,
        "sous_region_coherente": subregion_consistent if user_subregion else None,
        "status": status,
        "max_severity": max_sev,
        "risk_score": risk_score,
        "rule_hits": rule_hits,
        "warnings": warnings,
        "international_restrictions": international_restrictions,
        "filiere_restrictions": filiere_restrictions,
    }

    return blocked, payload, references


