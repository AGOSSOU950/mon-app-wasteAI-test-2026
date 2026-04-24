from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


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


def _norm(value: str) -> str:
    return value.strip().lower()


def _score_compatibility(waste_type: str, buyer: BuyerProfile) -> int:
    accepted = {_norm(x) for x in buyer.accepted_waste_types}
    return 100 if _norm(waste_type) in accepted else 0


def _score_valorization(valorization: str, decision_label: str, buyer: BuyerProfile) -> int:
    v = _norm(valorization)
    d = _norm(decision_label)
    supported = {_norm(x) for x in buyer.supported_valorizations}

    direct_match = v in supported
    decision_hint_match = any(token in d for token in supported)

    if direct_match and decision_hint_match:
        return 100
    if direct_match:
        return 80
    if decision_hint_match:
        return 70
    return 35


def _score_proximity(producer_location: str, buyer_location: str) -> int:
    p = _norm(producer_location)
    b = _norm(buyer_location)
    if p == b:
        return 100
    if b in NEIGHBOR_COUNTRIES.get(p, set()) or p in NEIGHBOR_COUNTRIES.get(b, set()):
        return 75
    return 45


def _score_capacity(quantity_tonnes: float, buyer_capacity_tonnes: float) -> int:
    if quantity_tonnes <= buyer_capacity_tonnes:
        return 100
    if quantity_tonnes <= buyer_capacity_tonnes * 1.25:
        return 60
    if quantity_tonnes <= buyer_capacity_tonnes * 1.5:
        return 35
    return 0


def _base_price_per_tonne(waste_type: str) -> float:
    return BASE_PRICE_BY_WASTE.get(_norm(waste_type), 80.0)


def _estimate_price_per_tonne(
    waste_type: str,
    quantity_tonnes: float,
    buyer_range: tuple[float, float],
    decision_score: float,
    confidence: str,
) -> tuple[float, int]:
    market_ref = _base_price_per_tonne(waste_type)

    confidence_factor = {
        "elevee": 1.03,
        "moyenne": 1.00,
        "faible": 0.97,
    }.get(_norm(confidence), 1.00)

    volume_factor = 0.95 if quantity_tonnes >= 100 else (0.98 if quantity_tonnes >= 50 else 1.00)
    decision_factor = 0.95 + (max(0.0, min(100.0, decision_score)) / 100.0) * 0.10

    candidate_price = market_ref * confidence_factor * volume_factor * decision_factor
    low, high = buyer_range

    if candidate_price < low:
        estimated = low
        price_score = 85
    elif candidate_price > high:
        estimated = high
        gap_ratio = (candidate_price - high) / max(candidate_price, 1.0)
        price_score = max(25, int(100 - gap_ratio * 100))
    else:
        estimated = candidate_price
        price_score = 100

    return round(float(estimated), 2), price_score


def _explain(
    waste_type: str,
    quantity_tonnes: float,
    valorization: str,
    compat: int,
    val: int,
    prox: int,
    cap: int,
    price_score: int,
) -> str:
    parts: list[str] = []

    parts.append(f"Compatibilite technique {waste_type}: {'forte' if compat >= 100 else 'insuffisante'}.")

    if val >= 80:
        parts.append(f"Filiere cible ({valorization}) bien alignee avec le besoin de valorisation.")
    elif val >= 60:
        parts.append(f"Filiere ({valorization}) partiellement compatible, ajustement possible.")
    else:
        parts.append(f"Filiere ({valorization}) faiblement alignee, necessite verification.")

    if prox >= 100:
        parts.append("Proximite geographique: meme pays, logistique simplifiee.")
    elif prox >= 75:
        parts.append("Proximite geographique: pays voisin CEDEAO, logistique acceptable.")
    else:
        parts.append("Proximite geographique: distance plus longue, cout transport plus eleve.")

    if cap >= 100:
        parts.append(f"Capacite disponible suffisante pour {quantity_tonnes} t.")
    elif cap >= 60:
        parts.append(f"Capacite proche de la limite pour {quantity_tonnes} t (lotissement possible).")
    else:
        parts.append("Capacite limitee pour ce volume.")

    if price_score >= 90:
        parts.append("Prix estime competitif.")
    elif price_score >= 60:
        parts.append("Prix estime acceptable avec negociation.")
    else:
        parts.append("Prix estime peu attractif par rapport au marche.")

    return " ".join(parts)


def run_marketplace_matching(payload: MarketplaceMatchInput) -> MarketplaceMatchOutput:
    # Ponderation: compatibilite (haute), proximite (moyenne), capacite (moyenne), prix (faible), alignement decision (moyenne)
    w_compat = 0.42
    w_prox = 0.18
    w_cap = 0.18
    w_price = 0.08
    w_val = 0.14

    quantity_tonnes = float(payload.quantity)

    ranked: list[MatchCandidate] = []
    for buyer in BUYERS_DB:
        compat = _score_compatibility(payload.waste_type, buyer)
        if compat == 0:
            continue

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

        raw_score = (
            compat * w_compat
            + prox * w_prox
            + cap * w_cap
            + price_score * w_price
            + val * w_val
        )
        final_score = int(round(max(0.0, min(100.0, raw_score))))

        explanation = _explain(
            waste_type=payload.waste_type,
            quantity_tonnes=quantity_tonnes,
            valorization=payload.valorization,
            compat=compat,
            val=val,
            prox=prox,
            cap=cap,
            price_score=price_score,
        )

        ranked.append(
            MatchCandidate(
                buyer_name=buyer.name,
                matching_score=final_score,
                estimated_price_per_tonne=estimated_price,
                explanation=explanation,
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
        },
        top_3_buyers=ranked[:3],
    )
