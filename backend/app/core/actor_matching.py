from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


SOLUTION_ALIASES: dict[str, str] = {
    "methanisation": "methanisation",
    "biogaz": "methanisation",
    "digestion anaerobie": "methanisation",
    "compostage": "compostage",
    "compost": "compostage",
    "incineration": "incineration",
    "co incineration": "incineration",
    "co-incineration": "incineration",
    "cimenterie": "incineration",
    "valorisation energetique": "valorisation_energetique",
    "energie": "valorisation_energetique",
    "combustion": "valorisation_energetique",
    "biochar": "biochar",
    "recyclage matiere": "recyclage_matiere",
    "recyclage": "recyclage_matiere",
}

SOLUTION_LABELS: dict[str, str] = {
    "methanisation": "methanisation",
    "compostage": "compostage",
    "incineration": "incineration",
    "valorisation_energetique": "valorisation energetique",
    "biochar": "biochar",
    "recyclage_matiere": "recyclage matiere",
}

HIGH_PRIORITY_MARKERS = {"high", "haute", "elevee", "eleve", "1", "2", "top", "priority_high"}


class WasteSignal(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    humidity: float = Field(..., ge=0, le=100)
    pci: float | None = Field(default=None, alias="PCI")
    dco: float | None = Field(default=None, alias="DCO")
    dbo: float | None = Field(default=None, alias="DBO")
    contamination: float = Field(..., ge=0, le=100)
    has_metals: bool = Field(default=False, alias="hasMetals")
    has_chlorine: bool = Field(default=False, alias="hasChlorine")
    family: str | None = None


class ActorConstraints(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    max_contamination: float = Field(..., ge=0, le=100, alias="maxContamination")
    requires_low_metals: bool = Field(default=False, alias="requiresLowMetals")
    requires_low_chlorine: bool = Field(default=False, alias="requiresLowChlorine")
    max_humidity: float = Field(..., ge=0, le=100, alias="maxHumidity")


class LocalActor(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    type: str
    technologies: list[str] = Field(default_factory=list)
    specialties: list[str] = Field(default_factory=list)
    accepted_waste: list[str] = Field(default_factory=list, alias="acceptedWaste")
    constraints: ActorConstraints
    priority: int | str = 0


class LocalActorMatchInput(BaseModel):
    waste: WasteSignal
    recommended_solutions: list[str] = Field(default_factory=list, alias="recommendedSolutions")
    actors: list[LocalActor] = Field(default_factory=list)


class LocalActorMatchItem(BaseModel):
    name: str
    score: int
    justification: str


class LocalActorMatchOutput(BaseModel):
    items: list[LocalActorMatchItem]


def _normalize_text(value: Any) -> str:
    text = str(value or "")
    if not text:
        return ""
    normalized = (
        text.strip()
        .lower()
        .replace("é", "e")
        .replace("è", "e")
        .replace("ê", "e")
        .replace("à", "a")
        .replace("ù", "u")
        .replace("â", "a")
        .replace("î", "i")
        .replace("ô", "o")
        .replace("ç", "c")
    )
    return normalized


def _canonical_solution(value: Any) -> str:
    raw = _normalize_text(value)
    if not raw:
        return ""
    for needle, canonical in SOLUTION_ALIASES.items():
        if needle in raw:
            return canonical
    return raw.replace(" ", "_")


def _actor_solution_tags(actor: LocalActor) -> set[str]:
    tags = {_canonical_solution(actor.type)}
    tags.update({_canonical_solution(item) for item in actor.technologies})
    tags.update({_canonical_solution(item) for item in actor.specialties})
    tags.discard("")
    return tags


def _actor_family_tags(actor: LocalActor) -> set[str]:
    tags = {_normalize_text(item).replace(" ", "_") for item in actor.accepted_waste}
    tags.discard("")
    return tags


def _solution_labels(solutions: list[str]) -> list[str]:
    labels: list[str] = []
    for solution in solutions:
        canonical = _canonical_solution(solution)
        if canonical:
            labels.append(SOLUTION_LABELS.get(canonical, canonical.replace("_", " ")))
    return labels


def _priority_bonus(priority: int | str) -> int:
    if isinstance(priority, (int, float)):
        return 10 if float(priority) >= 8 else 0
    return 10 if _normalize_text(priority) in HIGH_PRIORITY_MARKERS else 0


def _actor_matches_solutions(actor: LocalActor, recommended_solutions: list[str]) -> tuple[bool, str | None, bool]:
    if not recommended_solutions:
        return False, None, False

    actor_tags = _actor_solution_tags(actor)
    canonical_solutions = [_canonical_solution(item) for item in recommended_solutions if _canonical_solution(item)]
    if not canonical_solutions:
        return False, None, False

    main_solution = canonical_solutions[0]
    if main_solution in actor_tags:
        return True, main_solution, True

    for solution in canonical_solutions[1:]:
        if solution in actor_tags:
            return True, solution, False

    return False, None, False


def _is_compatible(waste: WasteSignal, actor: LocalActor) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    c = actor.constraints

    family = _normalize_text(waste.family or "").replace(" ", "_")
    actor_families = _actor_family_tags(actor)
    if family and actor_families and family not in actor_families:
        reasons.append("filiere non acceptee")

    if waste.contamination > c.max_contamination:
        reasons.append("contamination trop elevee")
    if waste.humidity > c.max_humidity:
        reasons.append("humidite trop elevee")
    if waste.has_metals and c.requires_low_metals:
        reasons.append("metaux presents incompatibles")
    if waste.has_chlorine and c.requires_low_chlorine:
        reasons.append("chlore present incompatible")

    return not reasons, reasons


def _is_thermal_actor(actor: LocalActor) -> bool:
    tags = _actor_solution_tags(actor)
    return any(tag in tags for tag in {"incineration", "valorisation_energetique"})


def _is_methanisation_actor(actor: LocalActor) -> bool:
    tags = _actor_solution_tags(actor)
    return "methanisation" in tags


def _format_solution(solution: str) -> str:
    return SOLUTION_LABELS.get(solution, solution.replace("_", " "))


def score_actor(waste: WasteSignal, recommended_solutions: list[str], actor: LocalActor) -> LocalActorMatchItem | None:
    compatible, _ = _is_compatible(waste, actor)
    if not compatible:
        return None

    matches_solution, matched_solution, is_primary = _actor_matches_solutions(actor, recommended_solutions)
    if not matches_solution:
        return None

    score = 0
    reasons: list[str] = []

    if is_primary and matched_solution:
        score += 50
        reasons.append(f"compatible avec { _format_solution(matched_solution) }")
    elif matched_solution:
        score += 20
        reasons.append(f"compatible avec { _format_solution(matched_solution) }")

    if actor.specialties:
        specialty_tags = {_canonical_solution(item) for item in actor.specialties}
        specialty_tags.discard("")
        if is_primary and matched_solution and matched_solution in specialty_tags:
            score += 10
            reasons.append("specialite exacte du canal")
        elif matched_solution and matched_solution in specialty_tags:
            reasons.append("specialite coherente")

    priority_bonus = _priority_bonus(actor.priority)
    if priority_bonus:
        score += priority_bonus
        reasons.append("priorite elevee")

    if waste.dco is not None and waste.dco > 100000 and _is_methanisation_actor(actor):
        score += 15
        reasons.append("DCO elevee favorable a la methanisation")

    if waste.pci is not None and waste.pci > 10 and _is_thermal_actor(actor):
        score += 15
        reasons.append("PCI eleve favorable a la valorisation energetique")

    if waste.humidity > 70 and _is_thermal_actor(actor):
        score -= 30
        reasons.append("humidite elevee penalise la voie thermique")

    max_cont = float(actor.constraints.max_contamination or 0)
    if max_cont > 0 and waste.contamination >= max_cont * 0.8:
        score -= 20
        reasons.append("contamination proche de la limite du canal")

    if waste.has_metals and not actor.constraints.requires_low_metals:
        reasons.append("metaux acceptes par le canal")
    if waste.has_chlorine and not actor.constraints.requires_low_chlorine:
        reasons.append("chlore tolere par le canal")
    if waste.humidity <= actor.constraints.max_humidity:
        reasons.append("humidite acceptable")
    if waste.contamination <= actor.constraints.max_contamination:
        reasons.append("contamination acceptable")
    if waste.family and _actor_family_tags(actor):
        reasons.append(f"filiere {waste.family} acceptee")

    score = max(0, min(100, int(round(score))))
    justification = ", ".join(dict.fromkeys(reasons))
    return LocalActorMatchItem(name=actor.name, score=score, justification=justification)


def match_local_actors(payload: LocalActorMatchInput) -> list[LocalActorMatchItem]:
    scored = [
        item
        for item in (
            score_actor(payload.waste, payload.recommended_solutions, actor)
            for actor in payload.actors
        )
        if item is not None
    ]
    scored.sort(key=lambda item: item.score, reverse=True)
    return scored


__all__ = [
    "ActorConstraints",
    "LocalActor",
    "LocalActorMatchInput",
    "LocalActorMatchItem",
    "LocalActorMatchOutput",
    "WasteSignal",
    "match_local_actors",
    "score_actor",
]
