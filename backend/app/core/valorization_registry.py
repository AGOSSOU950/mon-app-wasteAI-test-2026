from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping
import unicodedata

_REGISTRY_PATH = Path(__file__).with_name('valorization_filieres.json')
_TEMPLATE_PATH = Path(__file__).with_name('valorization_filieres_template.json')
_HISTORY_PATH = Path(__file__).with_name('valorization_history.json')

_WEIGHT_DELTA_BY_FEEDBACK = {
    'choisi': 0.1,
    'choisie': 0.1,
    'success': 0.2,
    'succes': 0.2,
    'refuse': -0.1,
    'refusee': -0.1,
    'echec': -0.1,
}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def _normalize_text(value: Any) -> str:
    text = str(value or '').strip().lower()
    if not text:
        return ''
    normalized = unicodedata.normalize('NFKD', text)
    return ''.join(ch for ch in normalized if not unicodedata.combining(ch))


def _normalize_feedback(value: Any) -> str:
    return _normalize_text(value)


def _load_json(path: Path) -> dict[str, Any] | list[Any] | None:
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding='utf-8-sig'))
    return data


def _save_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')


def _ensure_registry(payload: dict[str, Any]) -> dict[str, Any]:
    normalized = deepcopy(payload)
    normalized.setdefault('version', '1.0')
    normalized.setdefault('updated_at', None)
    filieres = normalized.get('filieres')
    if not isinstance(filieres, list) or not filieres:
        raise ValueError("Registry payload must contain a non-empty 'filieres' list")

    for filiere in filieres:
        if not isinstance(filiere, dict):
            raise ValueError('Each filiere must be a JSON object')
        filiere.setdefault('id', '')
        filiere.setdefault('nom', filiere.get('id') or 'filiere')
        filiere.setdefault('type', 'matiere')
        filiere.setdefault('description', '')
        filiere.setdefault('poids', 1.0)
        filiere.setdefault('conditions_techniques', {'base': float(filiere.get('score_base') or 0.0), 'all': [], 'any': []})
        filiere.setdefault('penalites', [])
        filiere.setdefault('contraintes', {})
        filiere.setdefault('score_base', float(filiere.get('conditions_techniques', {}).get('base') or 0.0))

        if 'rules' not in filiere:
            filiere['rules'] = []
        if 'feasibility' not in filiere:
            filiere['feasibility'] = {}

    return normalized


def _registry_issues(registry: Mapping[str, Any]) -> list[str]:
    issues: list[str] = []
    filieres = list(registry.get('filieres') or [])
    seen_ids: set[str] = set()
    seen_names: set[str] = set()

    for index, filiere in enumerate(filieres, start=1):
        if not isinstance(filiere, dict):
            issues.append(f'filiere#{index}: not_an_object')
            continue

        fid = str(filiere.get('id') or '').strip()
        name = str(filiere.get('nom') or '').strip()
        poids = filiere.get('poids')

        if not fid:
            issues.append(f'filiere#{index}: missing_id')
        elif fid in seen_ids:
            issues.append(f'duplicate_id:{fid}')
        else:
            seen_ids.add(fid)

        if not name:
            issues.append(f'filiere#{fid or index}: missing_name')
        else:
            normalized_name = _normalize_text(name)
            if normalized_name in seen_names:
                issues.append(f'duplicate_name:{name}')
            else:
                seen_names.add(normalized_name)

        try:
            weight_value = float(poids)
        except Exception:
            issues.append(f'filiere#{fid or index}: invalid_weight')
        else:
            if not 0.5 <= weight_value <= 2.0:
                issues.append(f'filiere#{fid or index}: weight_out_of_bounds:{weight_value:.3f}')

        conditions = filiere.get('conditions_techniques')
        if not isinstance(conditions, dict):
            issues.append(f'filiere#{fid or index}: invalid_conditions_techniques')
        penalties = filiere.get('penalites')
        if penalties is not None and not isinstance(penalties, list):
            issues.append(f'filiere#{fid or index}: invalid_penalites')
        constraints = filiere.get('contraintes')
        if constraints is not None and not isinstance(constraints, dict):
            issues.append(f'filiere#{fid or index}: invalid_contraintes')

    return issues


def get_valorization_registry_audit() -> dict[str, Any]:
    registry = get_valorization_registry()
    filieres = list(registry.get('filieres', []))
    issues = _registry_issues(registry)
    weights = []
    types: dict[str, int] = {}

    for filiere in filieres:
        if not isinstance(filiere, dict):
            continue
        try:
            weights.append(float(filiere.get('poids', 1.0)))
        except Exception:
            continue
        ftype = str(filiere.get('type') or 'unknown').strip() or 'unknown'
        types[ftype] = types.get(ftype, 0) + 1

    weight_min = min(weights) if weights else None
    weight_max = max(weights) if weights else None
    weight_avg = round(sum(weights) / len(weights), 3) if weights else None

    return {
        'generated_at': _utc_now(),
        'version': registry.get('version'),
        'updated_at': registry.get('updated_at'),
        'healthy': len(issues) == 0,
        'filieres_count': len(filieres),
        'type_distribution': types,
        'weight_range': {
            'min': weight_min,
            'max': weight_max,
            'avg': weight_avg,
        },
        'issues_count': len(issues),
        'issues': issues,
    }


def _load_registry(path: Path) -> dict[str, Any] | None:
    data = _load_json(path)
    if data is None:
        return None
    if not isinstance(data, dict):
        raise ValueError(f'Invalid registry format in {path.name}')
    return _ensure_registry(data)


def _default_registry() -> dict[str, Any]:
    data = _load_registry(_TEMPLATE_PATH)
    if data is None:
        raise RuntimeError('No valorization registry template available')
    return data


def _registry_file() -> Path:
    return _REGISTRY_PATH


def get_valorization_registry() -> dict[str, Any]:
    data = _load_registry(_registry_file())
    if data is not None:
        return deepcopy(data)
    return deepcopy(_default_registry())


def get_valorization_registry_template() -> dict[str, Any]:
    return deepcopy(_default_registry())


def update_valorization_registry(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError('Registry payload must be a JSON object')
    normalized = _ensure_registry(payload)
    normalized['updated_at'] = normalized.get('updated_at') or _utc_now()
    _save_json(_registry_file(), normalized)
    return deepcopy(normalized)


def get_valorization_filieres() -> list[dict[str, Any]]:
    return list(get_valorization_registry().get('filieres', []))


def _plain_value(data: Mapping[str, Any] | dict[str, Any], field: str) -> Any:
    if not field:
        return None
    if isinstance(data, Mapping) and field in data:
        return data.get(field)
    parts = field.split('.')
    current: Any = data
    for part in parts:
        if isinstance(current, Mapping) and part in current:
            current = current[part]
        else:
            return None
    return current


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or value == '':
            return float(default)
        return float(value)
    except Exception:
        return float(default)


def _compare(actual: Any, op: str, expected: Any) -> bool:
    op = str(op or '').lower().strip()
    if op in {'truthy', 'true'}:
        return bool(actual)
    if op in {'falsy', 'false'}:
        return not bool(actual)
    if op == 'between':
        if not isinstance(expected, (list, tuple)) or len(expected) != 2:
            return False
        lo, hi = expected
        return _to_float(lo) <= _to_float(actual) <= _to_float(hi)
    if op in {'contains', 'icontains'}:
        if actual is None:
            return False
        return str(expected).lower() in str(actual).lower()
    if op == 'in':
        return isinstance(expected, (list, tuple, set)) and actual in expected
    if op == 'not_in':
        return not isinstance(expected, (list, tuple, set)) or actual not in expected
    if op in {'eq', '=='}:
        return actual == expected
    if op in {'ne', '!='}:
        return actual != expected
    a = _to_float(actual, default=float('nan'))
    b = _to_float(expected, default=float('nan'))
    if op in {'le', 'lte', '<='}:
        return a <= b
    if op in {'lt', '<'}:
        return a < b
    if op in {'ge', 'gte', '>='}:
        return a >= b
    if op in {'gt', '>'}:
        return a > b
    return False


def _match_condition(data: Mapping[str, Any] | dict[str, Any], condition: dict[str, Any] | None) -> bool:
    if not condition:
        return True
    if 'all' in condition:
        return all(_match_condition(data, item) for item in condition.get('all') or [])
    if 'any' in condition:
        return any(_match_condition(data, item) for item in condition.get('any') or [])
    if 'not' in condition:
        return not _match_condition(data, condition.get('not'))

    field = str(condition.get('field') or condition.get('champ') or condition.get('key') or '')
    if not field:
        return True
    actual = _plain_value(data, field)
    op = condition.get('op') or condition.get('operator') or 'eq'
    expected = condition.get('value') if 'value' in condition else condition.get('valeur')
    return _compare(actual, op, expected)


def _evaluate_group(data: Mapping[str, Any] | dict[str, Any], spec: dict[str, Any] | None) -> tuple[bool, list[str]]:
    if not spec:
        return True, []
    reasons: list[str] = []
    all_conditions = spec.get('all') or []
    any_conditions = spec.get('any') or []
    if all_conditions:
        for item in all_conditions:
            if _match_condition(data, item):
                label = str(item.get('label') or item.get('explication') or item.get('desc') or item.get('reason') or item.get('field') or item.get('champ') or '')
                points = float(item.get('points') or item.get('gain') or 0.0)
                if label:
                    reasons.append(f'{label} (+{points:.1f})' if points else label)
            else:
                return False, reasons
    if any_conditions:
        matched = False
        for item in any_conditions:
            if _match_condition(data, item):
                matched = True
                label = str(item.get('label') or item.get('explication') or item.get('desc') or item.get('reason') or item.get('field') or item.get('champ') or '')
                points = float(item.get('points') or item.get('gain') or 0.0)
                if label:
                    reasons.append(f'{label} (+{points:.1f})' if points else label)
        if not matched:
            return False, reasons
    return True, reasons


def _evaluate_constraints(data: Mapping[str, Any] | dict[str, Any], constraints: dict[str, Any] | None) -> tuple[bool, list[str]]:
    ok, reasons = _evaluate_group(data, constraints)
    if not ok:
        return False, reasons
    if not constraints:
        return True, reasons
    return True, reasons


def _normalize_conditions(spec: Any) -> dict[str, Any]:
    if isinstance(spec, dict):
        return spec
    return {'base': 0.0, 'all': [], 'any': []}


def _condition_points(item: dict[str, Any]) -> float:
    if 'points' in item:
        return float(item.get('points') or 0.0)
    if 'then' in item:
        return float(item.get('then') or 0.0)
    if 'gain' in item:
        return float(item.get('gain') or 0.0)
    return 0.0


def calculateScore(dechet: Mapping[str, Any] | dict[str, Any], filiere: dict[str, Any]) -> dict[str, Any]:
    profile = dict(dechet or {})
    conditions = _normalize_conditions(filiere.get('conditions_techniques'))
    score = _to_float(conditions.get('base'), _to_float(filiere.get('score_base'), 0.0))
    matched: list[str] = []
    penalties: list[str] = []
    detail: list[dict[str, Any]] = []

    for group_name in ('all', 'any'):
        for item in conditions.get(group_name) or []:
            if _match_condition(profile, item):
                points = _condition_points(item)
                score += points
                label = str(item.get('label') or item.get('explication') or item.get('desc') or item.get('reason') or item.get('field') or item.get('champ') or '')
                if label:
                    matched.append(label)
                detail.append({'type': 'condition', 'group': group_name, 'label': label, 'points': round(points, 2)})

    for penalty in filiere.get('penalites') or []:
        if not isinstance(penalty, dict):
            continue
        spec = penalty.get('if') or penalty.get('when') or penalty.get('condition') or penalty
        if _match_condition(profile, spec if isinstance(spec, dict) else None):
            points = _condition_points(penalty)
            score += points
            label = str(penalty.get('label') or penalty.get('explication') or penalty.get('desc') or penalty.get('reason') or penalty.get('field') or penalty.get('champ') or '')
            if label:
                penalties.append(label)
            detail.append({'type': 'penalite', 'label': label, 'points': round(points, 2)})

    weight = _to_float(filiere.get('poids'), 1.0)
    weighted_score = max(0.0, min(100.0, round(score * weight, 2)))
    conditions_ok, blocked_reasons = _evaluate_constraints(profile, filiere.get('contraintes'))

    auto_explanation_parts = [filiere.get('description') or filiere.get('nom') or filiere.get('id') or 'filiere']
    if matched:
        auto_explanation_parts.append('conditions: ' + '; '.join(dict.fromkeys(matched)))
    if penalties:
        auto_explanation_parts.append('penalites: ' + '; '.join(dict.fromkeys(penalties)))
    if blocked_reasons:
        auto_explanation_parts.append('contraintes: ' + '; '.join(dict.fromkeys(blocked_reasons)))

    return {
        'id': filiere.get('id'),
        'nom': filiere.get('nom'),
        'type': filiere.get('type'),
        'poids': weight,
        'score_brut': round(score, 2),
        'score': weighted_score,
        'matched_conditions': list(dict.fromkeys(matched)),
        'penalites_appliquees': list(dict.fromkeys(penalties)),
        'detail': detail,
        'conditions_ok': conditions_ok,
        'available': conditions_ok,
        'blocked_reason': None if conditions_ok else '; '.join(dict.fromkeys(blocked_reasons)) or 'constrained',
        'status': 'recommande' if conditions_ok and weighted_score >= 70 else 'non pertinent' if conditions_ok else 'non disponible',
        'explication_automatique': ' | '.join(auto_explanation_parts),
        'contraintes': deepcopy(filiere.get('contraintes') or {}),
        'description': filiere.get('description') or '',
        'filiere': deepcopy(filiere),
    }


def runEvaluation(dechet: Mapping[str, Any] | dict[str, Any], contraintes: Mapping[str, Any] | dict[str, Any] | None = None) -> list[dict[str, Any]]:
    profile = dict(dechet or {})
    global_constraints = dict(contraintes or {})
    results: list[dict[str, Any]] = []
    for filiere in get_valorization_filieres():
        scored = calculateScore(profile, filiere)
        if global_constraints:
            ok, blocked = _evaluate_constraints(profile, global_constraints)
            if not ok:
                scored['available'] = False
                scored['conditions_ok'] = False
                scored['blocked_reason'] = '; '.join(blocked) or scored.get('blocked_reason')
                scored['status'] = 'non disponible'
        results.append(scored)
    return sorted(results, key=lambda item: float(item.get('score') or 0.0), reverse=True)


def updateWeights(filiereId: str, feedback: str) -> dict[str, Any]:
    registry = get_valorization_registry()
    fid = str(filiereId or '').strip()
    if not fid:
        raise ValueError('filiereId is required')
    key = _normalize_feedback(feedback)
    delta = _WEIGHT_DELTA_BY_FEEDBACK.get(key)
    if delta is None:
        raise ValueError('Unsupported feedback value')

    updated: dict[str, Any] | None = None
    for filiere in registry.get('filieres', []):
        if str(filiere.get('id') or '').strip() == fid:
            poids = _to_float(filiere.get('poids'), 1.0)
            filiere['poids'] = round(max(0.5, min(2.0, poids + delta)), 3)
            updated = deepcopy(filiere)
            break
    if updated is None:
        raise ValueError(f'Filiere not found: {fid}')

    registry['updated_at'] = _utc_now()
    _save_json(_registry_file(), registry)
    append_decision_history({
        'timestamp': _utc_now(),
        'type': 'weight_update',
        'filiere_id': fid,
        'feedback': key,
        'delta': delta,
        'new_weight': updated.get('poids'),
    })
    return updated


def append_decision_history(entry: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(entry, dict):
        raise ValueError('History entry must be a JSON object')
    history = _load_json(_HISTORY_PATH)
    if not isinstance(history, list):
        history = []
    item = deepcopy(entry)
    item.setdefault('timestamp', _utc_now())
    history.append(item)
    _save_json(_HISTORY_PATH, history)
    return item


def get_decision_history(limit: int | None = None) -> list[dict[str, Any]]:
    history = _load_json(_HISTORY_PATH)
    if not isinstance(history, list):
        return []
    items = [dict(item) for item in history if isinstance(item, dict)]
    if limit is None or limit <= 0:
        return items
    return items[-limit:]


def export_recommendations(results: list[dict[str, Any]], dechet: Mapping[str, Any] | dict[str, Any] | None = None) -> dict[str, Any]:
    ordered = sorted([dict(item) for item in results], key=lambda item: float(item.get('score') or 0.0), reverse=True)
    return {
        'generated_at': _utc_now(),
        'input': dict(dechet or {}),
        'count': len(ordered),
        'top_recommendations': ordered[:5],
        'all_recommendations': ordered,
    }


def _value(data: dict[str, Any], field: str) -> Any:
    return data.get(field)


def _condition_list_match(data: dict[str, Any], spec: dict[str, Any] | None) -> bool:
    if not spec:
        return True
    all_conditions = spec.get('all') or []
    any_conditions = spec.get('any') or []
    if all_conditions and not all(_match_condition(data, item) for item in all_conditions):
        return False
    if any_conditions and not any(_match_condition(data, item) for item in any_conditions):
        return False
    return True


def evaluate_valorization_filiere(filiere: dict[str, Any], data: dict[str, Any]) -> dict[str, Any]:
    scored = calculateScore(data, filiere)
    return {
        'technical_score': scored['score'],
        'technical_reason': scored['explication_automatique'],
        'conditions': scored['matched_conditions'],
        'feasible': scored['available'],
        'blocked_reason': scored['blocked_reason'],
        'status': scored['status'],
        'external_block': not scored['available'],
        'contraintes': scored['contraintes'],
        'economics': deepcopy(filiere.get('economics') or {}),
        'poids': scored['poids'],
        'explication_automatique': scored['explication_automatique'],
    }
