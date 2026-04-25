import json
import math
import os
import sqlite3
import tempfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from uuid import uuid4

from app.models.waste import DecisionResult, WasteInput

_HISTORY_LOCK = Lock()


def _resolve_data_dir() -> Path:
    preferred = Path(
        os.getenv("WASTEAI_DATA_DIR", str(Path(__file__).resolve().parents[1] / "data"))
    ).expanduser().resolve()
    fallback = Path(tempfile.gettempdir()).resolve() / "wasteai-data"

    for candidate in (preferred, fallback):
        try:
            candidate.mkdir(parents=True, exist_ok=True)
            probe = candidate / ".write_test"
            probe.write_text("ok", encoding="utf-8")
            probe.unlink(missing_ok=True)
            return candidate
        except OSError:
            continue

    return preferred


_DATA_DIR = _resolve_data_dir()
_HISTORY_PATH = _DATA_DIR / "analysis_history.json"
_HISTORY_DB_PATH = _DATA_DIR / "analytics.db"

_DECISION_REVENUE_EUR_PER_TONNE = {
    "Valorisation matiere (charbon actif, refonte...)": 180.0,
    "Valorisation energetique (biogaz, combustible, electricite...)": 120.0,
    "Vente directe sur marketplace": 90.0,
}

_DECISION_CO2_KG_PER_TONNE = {
    "Valorisation matiere (charbon actif, refonte...)": 820.0,
    "Valorisation energetique (biogaz, combustible, electricite...)": 450.0,
    "Vente directe sur marketplace": 280.0,
}


def _connect() -> sqlite3.Connection:
    _HISTORY_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(_HISTORY_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def _ensure_legacy_file_exists() -> None:
    _HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not _HISTORY_PATH.exists():
        _HISTORY_PATH.write_text("[]\n", encoding="utf-8")


def _load_legacy_history() -> list[dict]:
    _ensure_legacy_file_exists()
    try:
        raw = _HISTORY_PATH.read_text(encoding="utf-8")
        data = json.loads(raw)
        if isinstance(data, list):
            return data
    except Exception:
        pass
    return []


def _init_history_store() -> None:
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS analysis_history (
                id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                nom TEXT NOT NULL,
                categorie TEXT NOT NULL,
                type_dechet TEXT NOT NULL,
                type_industrie TEXT NOT NULL,
                pays_cedeao TEXT,
                decision TEXT NOT NULL,
                score REAL NOT NULL,
                confiance TEXT NOT NULL,
                quantite_kg REAL NOT NULL,
                tonnes_valorisees REAL NOT NULL,
                revenus_generes_eur REAL NOT NULL,
                co2_evite_kg REAL NOT NULL,
                resume_choix TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_analysis_history_timestamp
            ON analysis_history(timestamp DESC);

            CREATE INDEX IF NOT EXISTS idx_analysis_history_type_country
            ON analysis_history(type_dechet, pays_cedeao);
            """
        )

        existing_count = int(conn.execute("SELECT COUNT(*) AS c FROM analysis_history").fetchone()["c"])
        if existing_count > 0:
            return

        legacy_rows = _load_legacy_history()
        if not legacy_rows:
            return

        prepared: list[tuple] = []
        for row in legacy_rows:
            if not isinstance(row, dict):
                continue
            try:
                prepared.append(
                    (
                        str(row.get("id") or uuid4()),
                        str(row.get("timestamp") or datetime.now(timezone.utc).isoformat()),
                        str(row.get("nom") or ""),
                        str(row.get("categorie") or "autre"),
                        str(row.get("type_dechet") or "autre"),
                        str(row.get("type_industrie") or "autre"),
                        row.get("pays_cedeao"),
                        str(row.get("decision") or "Non classe"),
                        float(row.get("score") or 0.0),
                        str(row.get("confiance") or "faible"),
                        float(row.get("quantite_kg") or 0.0),
                        float(row.get("tonnes_valorisees") or 0.0),
                        float(row.get("revenus_generes_eur") or 0.0),
                        float(row.get("co2_evite_kg") or 0.0),
                        row.get("resume_choix"),
                    )
                )
            except Exception:
                continue

        if prepared:
            conn.executemany(
                """
                INSERT OR IGNORE INTO analysis_history (
                    id, timestamp, nom, categorie, type_dechet, type_industrie,
                    pays_cedeao, decision, score, confiance, quantite_kg,
                    tonnes_valorisees, revenus_generes_eur, co2_evite_kg, resume_choix
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                prepared,
            )


def _insert_history_entry(entry: dict) -> None:
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO analysis_history (
                id, timestamp, nom, categorie, type_dechet, type_industrie,
                pays_cedeao, decision, score, confiance, quantite_kg,
                tonnes_valorisees, revenus_generes_eur, co2_evite_kg, resume_choix
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry["id"],
                entry["timestamp"],
                entry["nom"],
                entry["categorie"],
                entry["type_dechet"],
                entry["type_industrie"],
                entry["pays_cedeao"],
                entry["decision"],
                entry["score"],
                entry["confiance"],
                entry["quantite_kg"],
                entry["tonnes_valorisees"],
                entry["revenus_generes_eur"],
                entry["co2_evite_kg"],
                entry["resume_choix"],
            ),
        )


def _fetch_history(*, limit: int | None = None, waste_type: str | None = None, country: str | None = None) -> list[dict]:
    clauses: list[str] = []
    params: list[object] = []

    if waste_type:
        clauses.append("type_dechet = ?")
        params.append(waste_type)

    if country:
        clauses.append("LOWER(TRIM(COALESCE(pays_cedeao, ''))) = LOWER(TRIM(?))")
        params.append(country)

    where_sql = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    query = (
        "SELECT id, timestamp, nom, categorie, type_dechet, type_industrie, pays_cedeao, decision, "
        "score, confiance, quantite_kg, tonnes_valorisees, revenus_generes_eur, co2_evite_kg, resume_choix "
        f"FROM analysis_history{where_sql} ORDER BY timestamp DESC"
    )
    if limit is not None:
        query += " LIMIT ?"
        params.append(max(1, int(limit)))

    with _connect() as conn:
        rows = conn.execute(query, tuple(params)).fetchall()

    return [dict(r) for r in rows]


def _estimate_revenue_eur(tonnes: float, decision: str, valeur_estimee: float | None) -> float:
    if valeur_estimee is not None:
        return max(0.0, float(valeur_estimee))
    rate = _DECISION_REVENUE_EUR_PER_TONNE.get(decision, 100.0)
    return tonnes * rate


def _estimate_co2_avoided_kg(tonnes: float, decision: str, result: DecisionResult | None = None) -> float:
    if result is not None:
        impact = result.impact_environnemental or {}
        net = impact.get("bilan_net_recommande_kgco2e")
        if isinstance(net, (int, float)):
            return max(0.0, float(net))

    factor = _DECISION_CO2_KG_PER_TONNE.get(decision, 300.0)
    return tonnes * factor


def record_analysis(waste: WasteInput, result: DecisionResult) -> dict:
    tonnes = max(0.0, float(waste.quantite_kg) / 1000.0)
    revenue_eur = _estimate_revenue_eur(tonnes, result.decision, result.valeur_estimee)
    co2_avoided_kg = _estimate_co2_avoided_kg(tonnes, result.decision, result)

    entry = {
        "id": str(uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "nom": waste.nom,
        "categorie": waste.categorie.value,
        "type_dechet": waste.type_dechet.value,
        "type_industrie": waste.type_industrie.value,
        "pays_cedeao": waste.pays_cedeao,
        "decision": result.decision,
        "score": round(float(result.score), 2),
        "confiance": result.confiance,
        "quantite_kg": round(float(waste.quantite_kg), 3),
        "tonnes_valorisees": round(tonnes, 3),
        "revenus_generes_eur": round(revenue_eur, 2),
        "co2_evite_kg": round(co2_avoided_kg, 2),
        "resume_choix": result.resume_choix,
    }

    with _HISTORY_LOCK:
        _insert_history_entry(entry)

    return entry


def get_history(limit: int = 100) -> list[dict]:
    clamped_limit = max(1, min(1000, limit))
    with _HISTORY_LOCK:
        return _fetch_history(limit=clamped_limit)


def build_summary(history: list[dict]) -> dict:
    tonnes = sum(float(item.get("tonnes_valorisees", 0.0)) for item in history)
    revenus = sum(float(item.get("revenus_generes_eur", 0.0)) for item in history)
    co2 = sum(float(item.get("co2_evite_kg", 0.0)) for item in history)

    repartition: dict[str, int] = defaultdict(int)
    for item in history:
        repartition[str(item.get("decision") or "Non classe")] += 1

    by_date: dict[str, dict] = defaultdict(lambda: {"analyses": 0, "tonnes": 0.0, "revenus_eur": 0.0, "co2_kg": 0.0})
    for item in history:
        timestamp = str(item.get("timestamp") or "")
        date_key = timestamp.split("T", 1)[0] if "T" in timestamp else timestamp[:10]
        line = by_date[date_key]
        line["analyses"] += 1
        line["tonnes"] += float(item.get("tonnes_valorisees", 0.0))
        line["revenus_eur"] += float(item.get("revenus_generes_eur", 0.0))
        line["co2_kg"] += float(item.get("co2_evite_kg", 0.0))

    evolution = []
    for date_key in sorted(k for k in by_date.keys() if k):
        line = by_date[date_key]
        evolution.append(
            {
                "date": date_key,
                "analyses": line["analyses"],
                "tonnes": round(line["tonnes"], 3),
                "revenus_eur": round(line["revenus_eur"], 2),
                "co2_kg": round(line["co2_kg"], 2),
            }
        )

    return {
        "total_analyses": len(history),
        "tonnes_valorisees": round(tonnes, 3),
        "revenus_generes_eur": round(revenus, 2),
        "co2_evite_kg": round(co2, 2),
        "co2_evite_tonnes": round(co2 / 1000.0, 3),
        "repartition_decisions": dict(repartition),
        "evolution": evolution,
    }


def get_analytics(limit: int = 100) -> dict:
    history = get_history(limit=limit)
    summary = build_summary(history)
    return {"summary": summary, "history": history}



def get_analytics_compact(*, recent_limit: int = 20, summary_window: int = 400) -> dict:
    safe_recent = max(1, min(200, int(recent_limit)))
    safe_window = max(safe_recent, min(5000, int(summary_window)))

    with _HISTORY_LOCK:
        history_for_summary = _fetch_history(limit=safe_window)
        recent_history = history_for_summary[:safe_recent]

    summary = build_summary(history_for_summary)
    return {
        "summary": summary,
        "history": recent_history,
        "meta": {
            "recent_limit": safe_recent,
            "summary_window": safe_window,
            "summary_total_records": len(history_for_summary),
        },
    }

def _compute_learning_signal(history: list[dict], decision_labels: list[str]) -> dict:
    total = len(history)
    if total == 0:
        return {"deltas": {label: 0.0 for label in decision_labels}, "sample_size": 0, "confidence": "faible", "best": None}

    counts: dict[str, int] = {label: 0 for label in decision_labels}
    score_sum: dict[str, float] = {label: 0.0 for label in decision_labels}
    for item in history:
        decision = str(item.get("decision") or "")
        if decision in counts:
            counts[decision] += 1
            score_sum[decision] += float(item.get("score") or 0.0)

    best = max(counts, key=lambda k: counts[k]) if counts else None
    dominant_share = (counts[best] / total) if best else 0.0

    if total >= 40 and dominant_share >= 0.55:
        confidence = "elevee"
    elif total >= 20 and dominant_share >= 0.5:
        confidence = "moyenne"
    else:
        confidence = "faible"

    deltas: dict[str, float] = {label: 0.0 for label in decision_labels}
    if best and confidence != "faible":
        boost = min(6.0, max(1.0, (dominant_share - 0.5) * 20.0))
        penalty = min(2.5, boost / 2.0)
        for label in decision_labels:
            deltas[label] = -penalty
        deltas[best] = boost

    return {
        "deltas": deltas,
        "sample_size": total,
        "confidence": confidence,
        "best": best,
        "counts": counts,
    }


def get_learning_adjustments(
    *,
    waste_type: str,
    country: str | None,
    decision_labels: list[str],
) -> dict:
    with _HISTORY_LOCK:
        same_type = _fetch_history(waste_type=waste_type)
        same_country_type = _fetch_history(waste_type=waste_type, country=country) if country else []

    local_signal = _compute_learning_signal(same_country_type, decision_labels)
    type_signal = _compute_learning_signal(same_type, decision_labels)

    if local_signal["sample_size"] >= 8:
        source = "historique pays + filiere"
        selected = local_signal
    elif type_signal["sample_size"] >= 12:
        source = "historique filiere CEDEAO"
        selected = type_signal
    else:
        source = "insuffisant"
        selected = {"deltas": {label: 0.0 for label in decision_labels}, "sample_size": max(local_signal["sample_size"], type_signal["sample_size"]), "confidence": "faible", "best": None, "counts": {label: 0 for label in decision_labels}}

    return {
        "source": source,
        "sample_size": int(selected["sample_size"]),
        "confidence": selected["confidence"],
        "best_decision": selected["best"],
        "deltas": {k: round(float(v), 2) for k, v in selected["deltas"].items()},
        "decision_counts": selected.get("counts", {}),
    }




def _safe_iso_to_utc(ts: str | None) -> datetime:
    if not ts:
        return datetime.now(timezone.utc)
    raw = str(ts).strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(raw)
    except Exception:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def get_ml_score_adjustments(
    *,
    waste_type: str,
    country: str | None,
    quantity_kg: float,
    decision_labels: list[str],
    lookback_limit: int = 1200,
) -> dict:
    """Lightweight online-ML score adjustment from historical outcomes.

    The model is a recency + quantity-similarity weighted estimator of expected score
    per decision label. It returns additive deltas in [-8, +8].
    """
    safe_labels = [str(x) for x in decision_labels if str(x).strip()]
    if not safe_labels:
        return {"source": "ml_empty_labels", "sample_size": 0, "deltas": {}, "confidence": "faible"}

    with _HISTORY_LOCK:
        local_rows = _fetch_history(limit=lookback_limit, waste_type=waste_type, country=country) if country else []
        type_rows = _fetch_history(limit=lookback_limit, waste_type=waste_type)

    rows = local_rows if len(local_rows) >= 15 else type_rows
    source = "ml_pays_filiere" if rows is local_rows and rows else "ml_filiere"

    if not rows:
        return {
            "source": "ml_insuffisant",
            "sample_size": 0,
            "confidence": "faible",
            "deltas": {label: 0.0 for label in safe_labels},
            "weights_by_decision": {label: 0.0 for label in safe_labels},
        }

    now = datetime.now(timezone.utc)
    q_ref = max(1.0, float(quantity_kg or 0.0))
    q_ref_log = math.log1p(q_ref)

    weighted_sum: dict[str, float] = {label: 0.0 for label in safe_labels}
    weighted_mass: dict[str, float] = {label: 0.0 for label in safe_labels}

    for row in rows:
        decision = str(row.get("decision") or "")
        if decision not in weighted_sum:
            continue

        score = float(row.get("score") or 0.0)
        q_hist = max(1.0, float(row.get("quantite_kg") or 0.0))
        q_hist_log = math.log1p(q_hist)
        q_distance = abs(q_ref_log - q_hist_log)

        # Quantity similarity: decays smoothly as the order of magnitude diverges.
        w_quantity = math.exp(-q_distance)

        dt = _safe_iso_to_utc(row.get("timestamp"))
        age_days = max(0.0, (now - dt).total_seconds() / 86400.0)

        # Recency half-life ~ 180 days.
        w_recency = math.exp(-age_days / 180.0)

        weight = w_quantity * w_recency
        if weight <= 1e-8:
            continue

        weighted_sum[decision] += score * weight
        weighted_mass[decision] += weight

    active_labels = [label for label in safe_labels if weighted_mass[label] > 0]
    if not active_labels:
        return {
            "source": source,
            "sample_size": len(rows),
            "confidence": "faible",
            "deltas": {label: 0.0 for label in safe_labels},
            "weights_by_decision": weighted_mass,
        }

    means = {label: (weighted_sum[label] / weighted_mass[label]) for label in active_labels}
    global_mean = sum(means.values()) / max(1, len(means))

    total_mass = sum(weighted_mass.values())
    confidence_factor = min(1.0, total_mass / 30.0)

    # Convert expected-score gap into bounded additive score deltas.
    deltas: dict[str, float] = {label: 0.0 for label in safe_labels}
    for label in safe_labels:
        if label not in means:
            continue
        raw_delta = (means[label] - global_mean) * 0.28
        deltas[label] = max(-8.0, min(8.0, raw_delta * confidence_factor))

    confidence = "elevee" if confidence_factor >= 0.75 else "moyenne" if confidence_factor >= 0.4 else "faible"

    return {
        "source": source,
        "sample_size": len(rows),
        "confidence": confidence,
        "confidence_factor": round(confidence_factor, 3),
        "deltas": {k: round(float(v), 2) for k, v in deltas.items()},
        "weights_by_decision": {k: round(float(v), 3) for k, v in weighted_mass.items()},
        "means_by_decision": {k: round(float(v), 2) for k, v in means.items()},
    }

def get_learning_snapshot(limit: int = 500) -> dict:
    history = get_history(limit=limit)
    by_country: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    by_type: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    for item in history:
        decision = str(item.get("decision") or "Non classe")
        country = str(item.get("pays_cedeao") or "non_renseigne")
        waste_type = str(item.get("type_dechet") or "autre")
        by_country[country][decision] += 1
        by_type[waste_type][decision] += 1

    return {
        "total_records": len(history),
        "by_country": {k: dict(v) for k, v in by_country.items()},
        "by_waste_type": {k: dict(v) for k, v in by_type.items()},
    }


_init_history_store()

