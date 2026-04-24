from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, Field

from app.core.llm_client import chat_completion_json, is_llm_available


class DecisionEngineResult(BaseModel):
    decision: str = Field(..., min_length=3)
    score: float = Field(..., ge=0, le=100)
    confiance: str = Field(..., min_length=3)


class MarketplaceMatchInput(BaseModel):
    decision_result: DecisionEngineResult
    waste_type: str = Field(..., min_length=2)
    quantity: float = Field(..., gt=0)
    location: str = Field(..., min_length=2)
    valorization: str = Field(..., min_length=2)


class BuyerProfile(BaseModel):
    name: str
    accepted_waste_types: list[str]
    supported_valorizations: list[str]
    location: str
    capacity_tonnes: float
    price_range_per_tonne: tuple[float, float]


class MatchCandidate(BaseModel):
    buyer_name: str
    matching_score: int
    estimated_price_per_tonne: float
    explanation: str
    score_breakdown: dict[str, float] | None = None
    ai_insight: str | None = None
    recommended_action: str | None = None


class MarketplaceMatchOutput(BaseModel):
    input_summary: dict[str, object]
    top_3_buyers: list[MatchCandidate]


BUYERS_DB: list[BuyerProfile] = [
    BuyerProfile(
        name="Benin Recycle Hub",
        accepted_waste_types=["paper", "plastic", "cardboard"],
        supported_valorizations=["recycling", "reemploi"],
        location="Benin",
        capacity_tonnes=120,
        price_range_per_tonne=(75, 125),
    ),
    BuyerProfile(
        name="EcoPulp Ghana",
        accepted_waste_types=["paper", "cardboard"],
        supported_valorizations=["recycling"],
        location="Ghana",
        capacity_tonnes=200,
        price_range_per_tonne=(70, 110),
    ),
    BuyerProfile(
        name="Lagos Circular Materials",
        accepted_waste_types=["paper", "plastic", "metal"],
        supported_valorizations=["recycling", "upcycling", "valorisation matiere"],
        location="Nigeria",
        capacity_tonnes=300,
        price_range_per_tonne=(65, 120),
    ),
    BuyerProfile(
        name="Abidjan Green Fibers",
        accepted_waste_types=["paper", "textile"],
        supported_valorizations=["recycling", "reemploi"],
        location="Cote d'Ivoire",
        capacity_tonnes=90,
        price_range_per_tonne=(68, 105),
    ),
    BuyerProfile(
        name="Dakar Resource Partners",
        accepted_waste_types=["paper", "organic", "glass"],
        supported_valorizations=["recycling", "valorisation energetique"],
        location="Senegal",
        capacity_tonnes=80,
        price_range_per_tonne=(60, 98),
    ),
]

BASE_PRICE_BY_WASTE: dict[str, float] = {
    "paper": 95.0,
    "cardboard": 85.0,
    "plastic": 145.0,
    "organic": 55.0,
    "metal": 185.0,
    "textile": 92.0,
    "glass": 45.0,
}

NEIGHBOR_COUNTRIES: dict[str, set[str]] = {
    "benin": {"togo", "nigeria", "burkina faso", "niger"},
    "ghana": {"togo", "burkina faso", "cote d'ivoire"},
    "nigeria": {"benin", "niger"},
    "cote d'ivoire": {"ghana", "burkina faso", "liberia", "guinea"},
    "senegal": {"mali", "guinea", "gambia", "mauritania"},
}

WASTE_TYPE_ALIASES: dict[str, str] = {
    "biomasse_lignocellulosique": "organic",
    "boue_de_vidange": "organic",
    "huile_usagee": "organic",
    "plastique": "plastic",
    "textile": "textile",
    "autre": "other",
}

VALORIZATION_ALIASES: dict[str, str] = {
    "valorisation matiere": "recycling",
    "valorisation energetique": "valorisation energetique",
    "reemploi": "reemploi",
    "recycling": "recycling",
    "upcycling": "upcycling",
}

WEIGHTS = {
    "compatibility": 0.38,
    "valorization": 0.18,
    "proximity": 0.16,
    "capacity": 0.16,
    "price": 0.08,
    "confidence": 0.04,
}


def _norm(value: str) -> str:
    return value.strip().lower()


def _normalized_waste_type(value: str) -> str:
    raw = _norm(value)
    return WASTE_TYPE_ALIASES.get(raw, raw)


def _normalized_valorization(value: str) -> str:
    raw = _norm(value)
    return VALORIZATION_ALIASES.get(raw, raw)


def _confidence_score(confidence: str) -> int:
    return {"elevee": 100, "moyenne": 72, "faible": 50}.get(_norm(confidence), 55)


def _score_compatibility(waste_type: str, buyer: BuyerProfile) -> int:
    normalized = _normalized_waste_type(waste_type)
    accepted = {_normalized_waste_type(x) for x in buyer.accepted_waste_types}
    if normalized in accepted:
        return 100
    if normalized == "other":
        return 35
    if normalized in {"organic", "textile"} and "paper" in accepted:
        return 45
    return 0


def _score_valorization(valorization: str, decision_label: str, buyer: BuyerProfile) -> int:
    target = _normalized_valorization(valorization)
    decision = _norm(decision_label)
    supported = {_normalized_valorization(x) for x in buyer.supported_valorizations}

    if target in supported:
        return 100
    if any(token in decision for token in supported):
        return 72
    if target == "valorisation energetique" and "recycling" in supported:
        return 40
    return 28


def _score_proximity(producer_location: str, buyer_location: str) -> int:
    p = _norm(producer_location)
    b = _norm(buyer_location)
    if p == b:
        return 100
    if b in NEIGHBOR_COUNTRIES.get(p, set()) or p in NEIGHBOR_COUNTRIES.get(b, set()):
        return 76
    return 46


def _score_capacity(quantity_tonnes: float, buyer_capacity_tonnes: float) -> int:
    if quantity_tonnes <= buyer_capacity_tonnes:
        return 100
    if quantity_tonnes <= buyer_capacity_tonnes * 1.2:
        return 64
    if quantity_tonnes <= buyer_capacity_tonnes * 1.5:
        return 36
    return 8


def _base_price_per_tonne(waste_type: str) -> float:
    normalized = _normalized_waste_type(waste_type)
    return BASE_PRICE_BY_WASTE.get(normalized, 80.0)


def _estimate_price_per_tonne(
    waste_type: str,
    quantity_tonnes: float,
    buyer_range: tuple[float, float],
    decision_score: float,
    confidence: str,
) -> tuple[float, int]:
    market_ref = _base_price_per_tonne(waste_type)

    confidence_factor = {
        "elevee": 1.04,
        "moyenne": 1.00,
        "faible": 0.96,
    }.get(_norm(confidence), 1.00)

    volume_factor = 0.94 if quantity_tonnes >= 100 else (0.98 if quantity_tonnes >= 50 else 1.00)
    decision_factor = 0.95 + (max(0.0, min(100.0, decision_score)) / 100.0) * 0.10

    candidate_price = market_ref * confidence_factor * volume_factor * decision_factor
    low, high = buyer_range

    if candidate_price < low:
        estimated = low
        price_score = 84
    elif candidate_price > high:
        estimated = high
        gap_ratio = (candidate_price - high) / max(candidate_price, 1.0)
        price_score = max(25, int(100 - gap_ratio * 100))
    else:
        estimated = candidate_price
        price_score = 100

    return round(float(estimated), 2), price_score


def _weighted_score(components: dict[str, int]) -> int:
    raw = (
        components["compatibility"] * WEIGHTS["compatibility"]
        + components["valorization"] * WEIGHTS["valorization"]
        + components["proximity"] * WEIGHTS["proximity"]
        + components["capacity"] * WEIGHTS["capacity"]
        + components["price"] * WEIGHTS["price"]
        + components["confidence"] * WEIGHTS["confidence"]
    )
    return int(round(max(0.0, min(100.0, raw))))


def _deterministic_explanation(
    waste_type: str,
    quantity_tonnes: float,
    valorization: str,
    components: dict[str, int],
) -> str:
    parts: list[str] = []
    parts.append(
        f"Compatibilite {waste_type}: {'forte' if components['compatibility'] >= 80 else 'partielle' if components['compatibility'] >= 40 else 'faible'}."
    )
    parts.append(
        f"Alignement filiere {valorization}: {components['valorization']}/100."
    )
    parts.append(
        f"Proximite logistique {components['proximity']}/100 et capacite pour {quantity_tonnes} t: {components['capacity']}/100."
    )
    parts.append(f"Niveau prix estime: {components['price']}/100.")
    return " ".join(parts)


def _ai_marketplace_adjustments(
    payload: MarketplaceMatchInput,
    scored_rows: list[dict[str, Any]],
) -> dict[str, dict[str, str | int]]:
    if not is_llm_available() or not scored_rows:
        return {}

    shortlist = [
        {
            "buyer_name": row["buyer"].name,
            "location": row["buyer"].location,
            "capacity_tonnes": row["buyer"].capacity_tonnes,
            "estimated_price_per_tonne": row["estimated_price_per_tonne"],
            "deterministic_score": row["deterministic_score"],
            "score_components": row["components"],
        }
        for row in scored_rows
    ]

    system_prompt = (
        "Tu es un agent IA de matching B2B pour dechets industriels en CEDEAO. "
        "Tu ajustes legerement le ranking a partir des scores fournis sans casser la logique de scoring."
    )
    user_prompt = (
        "Retourne uniquement un JSON valide avec ce schema: "
        "{\"adjustments\":[{\"buyer_name\":string,\"delta\":integer(-8..8),\"insight\":string,\"recommended_action\":string}]}. "
        "Le delta est un micro-ajustement, pas un rescoring complet. "
        "Chaque insight doit etre court et actionnable.\n\n"
        + json.dumps(
            {
                "waste_type": payload.waste_type,
                "quantity_tonnes": payload.quantity,
                "location": payload.location,
                "valorization": payload.valorization,
                "decision": payload.decision_result.model_dump(mode="json"),
                "buyers": shortlist,
            },
            ensure_ascii=False,
        )
    )

    parsed = chat_completion_json(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        max_tokens=700,
        temperature=0,
    )
    if not parsed:
        return {}

    adjustments = parsed.get("adjustments")
    if not isinstance(adjustments, list):
        return {}

    out: dict[str, dict[str, str | int]] = {}
    for item in adjustments:
        if not isinstance(item, dict):
            continue
        buyer_name = str(item.get("buyer_name") or "").strip()
        if not buyer_name:
            continue
        delta_raw = item.get("delta")
        try:
            delta = int(delta_raw)
        except Exception:
            delta = 0
        delta = max(-8, min(8, delta))

        out[buyer_name] = {
            "delta": delta,
            "insight": str(item.get("insight") or "").strip(),
            "recommended_action": str(item.get("recommended_action") or "").strip(),
        }
    return out


def run_marketplace_matching(payload: MarketplaceMatchInput) -> MarketplaceMatchOutput:
    quantity_tonnes = float(payload.quantity)
    confidence_component = _confidence_score(payload.decision_result.confiance)

    scored_rows: list[dict[str, Any]] = []
    for buyer in BUYERS_DB:
        compat = _score_compatibility(payload.waste_type, buyer)
        val = _score_valorization(payload.valorization, payload.decision_result.decision, buyer)
        prox = _score_proximity(payload.location, buyer.location)
        cap = _score_capacity(quantity_tonnes, buyer.capacity_tonnes)

        estimated_price, price_score = _estimate_price_per_tonne(
            waste_type=payload.waste_type,
            quantity_tonnes=quantity_tonnes,
            buyer_range=buyer.price_range_per_tonne,
            decision_score=payload.decision_result.score,
            confidence=payload.decision_result.confiance,
        )

        components = {
            "compatibility": compat,
            "valorization": val,
            "proximity": prox,
            "capacity": cap,
            "price": price_score,
            "confidence": confidence_component,
        }
        deterministic_score = _weighted_score(components)
        scored_rows.append(
            {
                "buyer": buyer,
                "components": components,
                "deterministic_score": deterministic_score,
                "estimated_price_per_tonne": estimated_price,
            }
        )

    ai_adjustments = _ai_marketplace_adjustments(payload, scored_rows)

    ranked: list[MatchCandidate] = []
    for row in scored_rows:
        buyer = row["buyer"]
        components = row["components"]
        deterministic_score = int(row["deterministic_score"])
        ai_data = ai_adjustments.get(buyer.name, {})
        ai_delta = int(ai_data.get("delta") or 0)
        final_score = max(0, min(100, deterministic_score + ai_delta))

        explanation = _deterministic_explanation(
            waste_type=payload.waste_type,
            quantity_tonnes=quantity_tonnes,
            valorization=payload.valorization,
            components=components,
        )
        insight = str(ai_data.get("insight") or "").strip() or None
        action = str(ai_data.get("recommended_action") or "").strip() or None

        ranked.append(
            MatchCandidate(
                buyer_name=buyer.name,
                matching_score=final_score,
                estimated_price_per_tonne=float(row["estimated_price_per_tonne"]),
                explanation=explanation,
                score_breakdown={
                    **{k: float(v) for k, v in components.items()},
                    "deterministic_score": float(deterministic_score),
                    "ai_delta": float(ai_delta),
                },
                ai_insight=insight,
                recommended_action=action,
            )
        )

    ranked.sort(key=lambda x: x.matching_score, reverse=True)

    return MarketplaceMatchOutput(
        input_summary={
            "waste_type": payload.waste_type,
            "quantity": payload.quantity,
            "location": payload.location,
            "valorization": payload.valorization,
            "decision": payload.decision_result.decision,
            "decision_score": payload.decision_result.score,
            "decision_confiance": payload.decision_result.confiance,
            "matching_agent": "ia_scoring_v2",
            "llm_adjustments_enabled": bool(ai_adjustments),
        },
        top_3_buyers=ranked[:3],
    )
