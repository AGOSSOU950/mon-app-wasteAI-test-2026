from app.core.environmental_factors_db import get_country_environmental_profile
from app.models.waste import WasteInput


def _safe_text(value: str | None) -> str:
    return (value or "").strip().lower()


def _is_natural_textile(composition: str | None) -> bool:
    text = _safe_text(composition)
    return any(k in text for k in ["coton", "lin", "chanvre", "laine", "naturel", "naturelle"])


def _is_pvc(waste: WasteInput) -> bool:
    text = _safe_text(waste.type_plastique)
    return "pvc" in text or "chlorure de polyvinyle" in text or bool(waste.presence_chlore)


def _effective_humidity_pct(waste: WasteInput) -> float | None:
    if waste.taux_humidite_pct is None:
        return None
    return max(0.0, min(100.0, float(waste.taux_humidite_pct)))


def _base_factors_per_tonne() -> dict[str, dict[str, float]]:
    # Factors are simplified engineering estimates in kgCO2e/tonne.
    return {
        "matiere": {"generated": 180.0, "avoided": 1200.0},
        "energetique": {"generated": 320.0, "avoided": 700.0},
        "vente": {"generated": 90.0, "avoided": 350.0},
    }


def _apply_type_adjustments(
    factors: dict[str, dict[str, float]],
    waste: WasteInput,
    waste_type: str,
) -> None:
    wt = _safe_text(waste_type)

    if wt == "textile":
        factors["matiere"]["avoided"] += 180.0
        if _safe_text(waste.etat_textile) in {"propre", "triable", "sec"}:
            factors["matiere"]["generated"] -= 20.0
        if _is_natural_textile(waste.composition_textile):
            factors["energetique"]["avoided"] += 60.0
        else:
            factors["energetique"]["avoided"] -= 80.0
        if waste.presence_metaux_lourds:
            factors["matiere"]["generated"] += 140.0
            factors["energetique"]["generated"] += 120.0
            factors["vente"]["generated"] += 100.0

    if wt == "plastique":
        contamination = float(waste.taux_contamination_pct or 0.0)
        if contamination <= 10.0:
            factors["matiere"]["avoided"] += 260.0
            factors["matiere"]["generated"] -= 20.0
        elif contamination >= 30.0:
            factors["matiere"]["avoided"] += 80.0
            factors["matiere"]["generated"] += 70.0
            factors["energetique"]["avoided"] += 40.0

        if waste.presence_colorants:
            factors["matiere"]["generated"] += 30.0

        if waste.presence_additifs:
            factors["matiere"]["generated"] += 35.0
            factors["energetique"]["generated"] += 25.0

        if _is_pvc(waste):
            factors["matiere"]["generated"] += 90.0
            factors["energetique"]["generated"] += 220.0
            factors["energetique"]["avoided"] -= 120.0

    if wt == "biomasse_lignocellulosique":
        factors["matiere"]["avoided"] += 120.0
        factors["energetique"]["avoided"] += 160.0

    if wt == "boue_de_vidange":
        factors["energetique"]["avoided"] += 220.0
        factors["energetique"]["generated"] += 80.0

    if wt == "huile_usagee":
        factors["energetique"]["avoided"] += 260.0

    humidity = _effective_humidity_pct(waste)
    if humidity is not None:
        if humidity >= 75.0:
            factors["energetique"]["avoided"] -= 110.0
            factors["energetique"]["generated"] += 60.0
            if wt in {"biomasse_lignocellulosique", "boue_de_vidange", "textile"}:
                factors["matiere"]["avoided"] += 90.0
        elif humidity <= 30.0:
            factors["energetique"]["avoided"] += 90.0
            if wt in {"biomasse_lignocellulosique", "boue_de_vidange"}:
                factors["matiere"]["avoided"] -= 35.0


def _apply_quality_adjustments(factors: dict[str, dict[str, float]], waste: WasteInput) -> None:
    if waste.pci_mj_kg is not None:
        if waste.pci_mj_kg >= 16:
            factors["energetique"]["avoided"] += 160.0
        elif waste.pci_mj_kg < 8:
            factors["energetique"]["avoided"] -= 90.0

    if waste.niveau_danger.value == "eleve":
        factors["matiere"]["generated"] += 70.0
        factors["vente"]["generated"] += 60.0
    if waste.niveau_danger.value == "critique":
        factors["matiere"]["generated"] += 160.0
        factors["energetique"]["generated"] += 100.0
        factors["vente"]["generated"] += 130.0


def _apply_country_adjustments(factors: dict[str, dict[str, float]], waste: WasteInput) -> dict[str, float | str | bool | None]:
    profile = get_country_environmental_profile(waste.pays_cedeao)
    generated_multiplier = float(profile.get("generated_multiplier") or 1.0)
    avoided_multiplier = float(profile.get("avoided_multiplier") or 1.0)
    transport_penalty_multiplier = float(profile.get("transport_penalty_multiplier") or 1.0)

    for path in factors.values():
        path["generated"] *= generated_multiplier
        path["avoided"] *= avoided_multiplier

    # Transport/logistics penalties impact direct emissions for material and sale channels.
    factors["matiere"]["generated"] *= transport_penalty_multiplier
    factors["vente"]["generated"] *= transport_penalty_multiplier

    return {
        "country": profile.get("country"),
        "fallback": bool(profile.get("fallback", True)),
        "generated_multiplier": round(generated_multiplier, 3),
        "avoided_multiplier": round(avoided_multiplier, 3),
        "transport_penalty_multiplier": round(transport_penalty_multiplier, 3),
        "source": str(profile.get("source") or "CEDEAO default baseline"),
    }


def _build_line(label: str, tonnes: float, generated_per_tonne: float, avoided_per_tonne: float) -> dict[str, float | str]:
    generated_pt = max(0.0, generated_per_tonne)
    avoided_pt = max(0.0, avoided_per_tonne)
    generated = round(tonnes * generated_pt, 2)
    avoided = round(tonnes * avoided_pt, 2)
    net = round(avoided - generated, 2)

    return {
        "voie": label,
        "facteur_genere_kgco2e_tonne": round(generated_pt, 2),
        "facteur_evite_kgco2e_tonne": round(avoided_pt, 2),
        "emissions_generees_kgco2e": generated,
        "emissions_evitees_kgco2e": avoided,
        "bilan_net_kgco2e": net,
    }


def calculate_environmental_impact(
    waste: WasteInput,
    waste_type_effectif: str,
    decision_labels: dict[str, str],
    recommended_decision: str,
) -> dict[str, object]:
    tonnes = max(0.0, float(waste.quantite_kg) / 1000.0)
    factors = _base_factors_per_tonne()

    _apply_type_adjustments(factors, waste, waste_type_effectif)
    _apply_quality_adjustments(factors, waste)
    country_adjustments = _apply_country_adjustments(factors, waste)

    by_path = {
        "matiere": _build_line(
            decision_labels["matiere"],
            tonnes,
            factors["matiere"]["generated"],
            factors["matiere"]["avoided"],
        ),
        "energetique": _build_line(
            decision_labels["energetique"],
            tonnes,
            factors["energetique"]["generated"],
            factors["energetique"]["avoided"],
        ),
        "vente": _build_line(
            decision_labels["vente"],
            tonnes,
            factors["vente"]["generated"],
            factors["vente"]["avoided"],
        ),
    }

    recommended_key = "matiere"
    for key, label in decision_labels.items():
        if label == recommended_decision:
            recommended_key = key
            break

    recommended = by_path[recommended_key]
    ranked = sorted(by_path.values(), key=lambda row: float(row["bilan_net_kgco2e"]), reverse=True)

    return {
        "unite": "kgCO2e",
        "quantite_tonnes": round(tonnes, 3),
        "calibrage_cedeao": country_adjustments,
        "hypotheses": [
            "Facteurs moyens simplifies (kgCO2e/tonne) selon voie de valorisation.",
            "Le bilan net est calcule comme emissions evitees moins emissions generees.",
            "Des ajustements sont appliques selon type de dechet, contamination et niveau de danger.",
            "Calibration CEDEAO appliquee via multiplicateurs pays (generation, avoidance, logistique).",
        ],
        "par_voie": by_path,
        "voie_recommandee": recommended_decision,
        "bilan_net_recommande_kgco2e": recommended["bilan_net_kgco2e"],
        "classement_bilan_net": ranked,
    }
