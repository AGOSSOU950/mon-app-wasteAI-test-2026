import json
import os
import re
import unicodedata
from typing import Any

from app.core.llm_client import chat_completion_text

from app.core.analytics_store import get_learning_adjustments, get_ml_score_adjustments
from app.core.environmental_factors_db import get_country_environmental_profile
from app.core.environmental_impact import calculate_environmental_impact
from app.core.literature_db import infer_literature_defaults
from app.core.valorization_registry import evaluate_valorization_filiere, get_valorization_filieres, calculateScore, runEvaluation, updateWeights, append_decision_history, export_recommendations, get_decision_history
from app.core.regulation_db import evaluate_regulatory_compliance
from app.core.scoring_config import get_scoring_config
from app.models.waste import DecisionResult, WasteCategory, WasteInput, WasteType

CFG = get_scoring_config()
DECISION_MATIERE = CFG.get("decision", {}).get("matiere", "valorisation_matiere")
DECISION_ENERGIE = CFG.get("decision", {}).get("energetique", "valorisation_energetique")
DECISION_REEMPLOI = CFG.get("decision", {}).get("reemploi", "Reemploi / reutilisation industrielle")
DECISION_VENTE = CFG.get("decision", {}).get("vente", "vente_marketplace")
DECISION_ELIMINATION = "elimination_securisee"
HIERARCHY = ["reemploi", "matiere", "energie", "vente"]

# Priorite technique + reglementaire CEDEAO/Bamako
WEIGHT_TECH, WEIGHT_ECO, WEIGHT_ENV, WEIGHT_SOCIAL, WEIGHT_REG = 0.35, 0.2, 0.15, 0.1, 0.2

LOCAL_MARKET = {
    "charbon_actif": 330000,
    "recyclage_papetier": 125000,
    "recyclage_mecanique_plastique": 180000,
    "refonte_metaux": 260000,
    "regeneration_huiles": 300000,
    "reemploi_textile": 90000,
    "effilochage_textile": 115000,
    "methanisation_biogaz": 155000,
    "biodiesel_combustible": 185000,
    "farines_animales_engrais": 140000,
    "combustion_gazeification": 135000,
    "co_incineration_cimenterie": 80000,
    "compostage": 50000,
    "epandage_agricole": 45000,
    "pyrolyse_plastique": 165000,
    "vente_ferrailleur_certifie": 140000,
    "neutralisation_chimique": 20000,
    "elimination_securisee": -20000,
}
TREATMENT_COST = {
    "charbon_actif": 120000,
    "recyclage_papetier": 70000,
    "recyclage_mecanique_plastique": 105000,
    "refonte_metaux": 120000,
    "regeneration_huiles": 145000,
    "reemploi_textile": 35000,
    "effilochage_textile": 60000,
    "methanisation_biogaz": 90000,
    "biodiesel_combustible": 115000,
    "farines_animales_engrais": 95000,
    "combustion_gazeification": 100000,
    "co_incineration_cimenterie": 95000,
    "compostage": 40000,
    "epandage_agricole": 30000,
    "pyrolyse_plastique": 130000,
    "vente_ferrailleur_certifie": 30000,
    "neutralisation_chimique": 110000,
    "elimination_securisee": 140000,
}
CO2_AVOIDED = {
    "charbon_actif": 520,
    "recyclage_papetier": 420,
    "recyclage_mecanique_plastique": 610,
    "refonte_metaux": 760,
    "regeneration_huiles": 540,
    "reemploi_textile": 300,
    "effilochage_textile": 260,
    "methanisation_biogaz": 360,
    "biodiesel_combustible": 290,
    "farines_animales_engrais": 180,
    "combustion_gazeification": 180,
    "co_incineration_cimenterie": 140,
    "compostage": 110,
    "epandage_agricole": 90,
    "pyrolyse_plastique": 240,
    "vente_ferrailleur_certifie": 80,
    "neutralisation_chimique": 20,
    "elimination_securisee": -50,
}
SOCIAL = {
    "charbon_actif": 78,
    "recyclage_papetier": 70,
    "recyclage_mecanique_plastique": 72,
    "refonte_metaux": 66,
    "regeneration_huiles": 65,
    "reemploi_textile": 80,
    "effilochage_textile": 74,
    "methanisation_biogaz": 69,
    "biodiesel_combustible": 58,
    "farines_animales_engrais": 62,
    "combustion_gazeification": 54,
    "co_incineration_cimenterie": 45,
    "compostage": 68,
    "epandage_agricole": 63,
    "pyrolyse_plastique": 52,
    "vente_ferrailleur_certifie": 58,
    "neutralisation_chimique": 42,
    "elimination_securisee": 35,
}
AVAIL_BENIN = {
    "charbon_actif": 8,
    "recyclage_papetier": 5,
    "recyclage_mecanique_plastique": 7,
    "refonte_metaux": 6,
    "regeneration_huiles": 4,
    "reemploi_textile": 6,
    "effilochage_textile": 5,
    "methanisation_biogaz": 6,
    "biodiesel_combustible": 3,
    "farines_animales_engrais": 4,
    "compostage": 8,
    "epandage_agricole": 6,
    "co_incineration_cimenterie": 3,
}
TYPICAL = {
    WasteType.BIOMASSE_LIGNOCELLULOSIQUE.value: {"pci_mj_kg": 16.5, "taux_lignine_pct": 28.0, "siccite_pct": 35.0, "metaux_pct": 2.0},
    WasteType.BOUE_DE_VIDANGE.value: {"dbo_mg_l": 1400.0, "dco_mg_l": 2600.0, "siccite_pct": 22.0, "pci_mj_kg": 5.0, "metaux_pct": 5.0},
    WasteType.HUILE_USAGEE.value: {"pci_mj_kg": 38.0, "siccite_pct": 100.0, "metaux_pct": 1.0},
    WasteType.TEXTILE.value: {"pci_mj_kg": 17.0, "siccite_pct": 70.0, "metaux_pct": 1.0},
    WasteType.PLASTIQUE.value: {"pci_mj_kg": 31.0, "siccite_pct": 98.0, "metaux_pct": 1.0},
    WasteType.OTHER.value: {"pci_mj_kg": 12.0, "siccite_pct": 30.0, "metaux_pct": 10.0},
}


def _n(v: str | None) -> str:
    if not v:
        return ""
    t = unicodedata.normalize("NFKD", v)
    return "".join(ch for ch in t if not unicodedata.combining(ch)).lower().strip()


def _b(v: float) -> float:
    return max(0.0, min(100.0, float(v)))


def _pct(description: str | None, keywords: list[str]) -> float | None:
    t = _n(description)
    if not t:
        return None
    for k in keywords:
        if k in t:
            right = t[t.find(k):t.find(k) + 45]
            m = re.search(r"(\d{1,3}(?:[\.,]\d+)?)\s*%", right)
            if m:
                return float(m.group(1).replace(",", "."))
    m = re.search(r"(\d{1,3}(?:[\.,]\d+)?)\s*%", t)
    return float(m.group(1).replace(",", ".")) if m else None



_ABATTOIR_KEYWORDS = [
    "abattoir",
    "abattage",
    "dechet abattoir",
    "dechets d abattoir",
    "effluent abattoir",
    "sang animal",
    "sang d abattage",
    "residus animaux",
    "tripes",
    "panse",
    "rumen",
    "visceres",
    "graisse animale",
    "sous produit animal",
]



_ORGANIC_TEXT_KEYWORDS = [
    "excrement",
    "excrements",
    "dejection",
    "dejections",
    "fumier",
    "fiente",
    "lisier",
    "dechet animal",
    "dechets animaux",
    "organique",
    "biodechet",
    "dechet alimentaire",
    "reste alimentaire",
]

_PAINT_TEXT_KEYWORDS = [
    "peinture",
    "paint",
    "vernis",
    "coating",
    "laque",
    "encre",
    "pigment",
    "resine",
]

_USED_OIL_KEYWORDS = [
    "huile usagee",
    "huiles usees",
    "huile de vidange",
    "vidange huile",
    "huile moteur",
    "lubrifiant use",
    "used oil",
    "waste oil",
]

_PLASTIC_TEXT_KEYWORDS = [
    "plastique",
    "polyethylene",
    "polyprop",
    "pet",
    "pehd",
    "pvc",
    "film plastique",
    "sachet plastique",
]


def _waste_text(waste: WasteInput) -> str:
    return " ".join([
        _n(waste.nom),
        _n(waste.description),
        _n(waste.produit_principal),
        _n(waste.origine_flux),
        _n(waste.type_plastique),
    ])


def _is_organic_waste_text(waste: WasteInput) -> bool:
    txt = _waste_text(waste)
    return any(k in txt for k in _ORGANIC_TEXT_KEYWORDS)


def _is_paint_or_coating_waste(waste: WasteInput) -> bool:
    txt = _waste_text(waste)
    return any(k in txt for k in _PAINT_TEXT_KEYWORDS)


def _is_used_oil_waste(waste: WasteInput) -> bool:
    txt = _waste_text(waste)
    if any(k in txt for k in _USED_OIL_KEYWORDS):
        return True
    return ("huile" in txt and "peinture" not in txt and "vernis" not in txt)


def _is_probably_plastic_text(waste: WasteInput) -> bool:
    txt = _waste_text(waste)
    return any(k in txt for k in _PLASTIC_TEXT_KEYWORDS)
def _is_abattoir_waste(waste: WasteInput) -> bool:
    text = " ".join([
        _n(waste.nom),
        _n(waste.description),
        _n(waste.produit_principal),
        _n(waste.origine_flux),
    ])
    return any(k in text for k in _ABATTOIR_KEYWORDS)


def _infer_effective_profile(waste: WasteInput) -> tuple[WasteInput, WasteType, list[str]]:
    assumptions: list[str] = []

    if _is_abattoir_waste(waste):
        effective = waste.model_copy(
            update={
                "categorie": WasteCategory.ORGANIC,
                "type_dechet": WasteType.BOUE_DE_VIDANGE,
                "description": ((waste.description or "") + " Flux abattoir a dominante organique, oriente methanisation biogaz.").strip(),
            }
        )
        assumptions.append("Profil corrige via nom/description: dechet d'abattoir traite comme flux organique pour methanisation biogaz.")
        return effective, WasteType.BOUE_DE_VIDANGE, assumptions

    inferred_type = _infer_type(waste)
    inferred_category = waste.categorie

    if _is_organic_waste_text(waste):
        inferred_category = WasteCategory.ORGANIC
        if inferred_type == WasteType.OTHER:
            inferred_type = WasteType.BOUE_DE_VIDANGE
        assumptions.append("Categorie organique deduite du nom/description utilisateur.")

    if _is_paint_or_coating_waste(waste):
        inferred_category = WasteCategory.CHEMICAL
        if inferred_type == WasteType.HUILE_USAGEE and not _is_used_oil_waste(waste):
            inferred_type = WasteType.OTHER
        assumptions.append("Flux peinture/revetement detecte: orientation chimique appliquee.")

    if inferred_type in {WasteType.BOUE_DE_VIDANGE, WasteType.BIOMASSE_LIGNOCELLULOSIQUE} and waste.categorie in {WasteCategory.PLASTIC, WasteCategory.OTHER}:
        inferred_category = WasteCategory.ORGANIC
        assumptions.append("Categorie ajustee depuis le nom/description utilisateur (profil organique detecte).")

    if inferred_category == WasteCategory.PLASTIC and not _is_probably_plastic_text(waste) and (_is_organic_waste_text(waste) or _is_paint_or_coating_waste(waste)):
        inferred_category = WasteCategory.ORGANIC if _is_organic_waste_text(waste) else WasteCategory.CHEMICAL
        assumptions.append("Categorie plastique corrigee selon le nom du dechet saisi.")

    effective = waste.model_copy(update={"categorie": inferred_category, "type_dechet": inferred_type})
    return effective, inferred_type, assumptions

def _infer_type(waste: WasteInput) -> WasteType:
    if waste.type_dechet != WasteType.OTHER:
        return waste.type_dechet

    text = " ".join([_n(waste.nom), _n(waste.description), _n(waste.composition_textile), _n(waste.type_plastique), _n(waste.produit_principal), _n(waste.origine_flux)])

    if _is_abattoir_waste(waste) or _is_organic_waste_text(waste):
        return WasteType.BOUE_DE_VIDANGE

    if _is_paint_or_coating_waste(waste) and not _is_used_oil_waste(waste):
        return WasteType.OTHER

    if _is_used_oil_waste(waste) or any(x in text for x in ["lubrifiant", "oil"]):
        return WasteType.HUILE_USAGEE

    if any(x in text for x in ["bagasse", "sciure", "coque", "tige", "biomasse", "bois", "lignine", "cellulose"]):
        return WasteType.BIOMASSE_LIGNOCELLULOSIQUE
    if any(x in text for x in ["boue", "vidange", "sludge", "effluent"]):
        return WasteType.BOUE_DE_VIDANGE
    if any(x in text for x in ["textile", "tissu", "vetement"]):
        return WasteType.TEXTILE
    if any(x in text for x in ["plastique", "poly", "pet", "pehd", "pvc"]):
        return WasteType.PLASTIQUE
    return WasteType.OTHER

def _is_pvc(w: WasteInput) -> bool:
    tp = _n(w.type_plastique)
    return "pvc" in tp or "chlorure de polyvinyle" in tp or bool(w.presence_chlore)


def _textile_reusable(w: WasteInput) -> bool:
    et = _n(w.etat_textile)
    d = _n(w.description)
    return et in {"bon", "correct", "propre", "triable"} or "bon etat" in d or "seconde main" in d

def _is_export_intent(w: WasteInput) -> bool:
    txt = " ".join([_n(w.description), _n(w.nom), _n(w.produit_principal)])
    return any(k in txt for k in ["export", "exportation", "international", "transfrontal", "hors benin"])


def _is_combustion_route(filiere: str) -> bool:
    return filiere in {
        "combustion_gazeification",
        "co_incineration_cimenterie",
        "pyrolyse_plastique",
        "biodiesel_combustible",
        "combustible_solide_recupere",
        "valorisation_energetique_generique",
        "methanisation_biogaz",
    }


def _combustion_pollution_risk(w: WasteInput, metrics: dict[str, float]) -> tuple[bool, str]:
    if w.categorie == WasteCategory.CHEMICAL and w.niveau_danger in {"eleve", "critique"}:
        return True, "Risque chimique eleve: combustion/energie interdite."

    if bool(w.presence_metaux_lourds):
        return True, "Presence de metaux lourds: voie combustible/thermique ecartee (risque emissions toxiques)."

    if bool(w.presence_chlore):
        return True, "Presence de chlore/PVC: voie combustible ecartee (risque dioxines/acides)."

    if bool(w.presence_additifs) and w.categorie in {WasteCategory.CHEMICAL, WasteCategory.PLASTIC}:
        return True, "Additifs a risque sur flux chimique/plastique: voie combustible ecartee."

    contamination = float(w.taux_contamination_pct or metrics.get("metaux_pct", 0.0) or 0.0)
    if contamination >= 35 and w.categorie in {WasteCategory.CHEMICAL, WasteCategory.PLASTIC, WasteCategory.TEXTILE}:
        return True, "Contamination elevee: voie combustible non retenue sans depollution prealable."

    return False, ""


def _apply_combustion_safety_constraints(candidates: list[dict[str, Any]], w: WasteInput, metrics: dict[str, float], warnings: list[str]) -> None:
    at_risk, reason = _combustion_pollution_risk(w, metrics)
    if not at_risk:
        return

    blocked_any = False
    for cand in candidates:
        if not _is_combustion_route(str(cand.get("filiere") or "")):
            continue
        cand["feasible"] = False
        existing = str(cand.get("blocked_reason") or "").strip()
        cand["blocked_reason"] = f"{existing} | {reason}" if existing else reason
        blocked_any = True

    if blocked_any:
        warnings.append(reason)


def _humidity_level_from_siccite(siccite_pct: float) -> str:
    if siccite_pct < 25:
        return "eleve"
    if siccite_pct < 55:
        return "moyen"
    return "faible"


def _humidity_level_from_pct(humidity_pct: float | None) -> str:
    if humidity_pct is None:
        return "moyen"
    if humidity_pct >= 70:
        return "eleve"
    if humidity_pct >= 40:
        return "moyen"
    return "faible"


def _effective_humidity_pct(w: WasteInput, metrics: dict[str, float]) -> float | None:
    if w.taux_humidite_pct is not None:
        return max(0.0, min(100.0, float(w.taux_humidite_pct)))
    sic = metrics.get("siccite_pct")
    if sic is None:
        return None
    return max(0.0, min(100.0, 100.0 - float(sic)))


def _state_from_waste(w: WasteInput, wt: WasteType, metrics: dict[str, float]) -> str:
    txt = " ".join([_n(w.nom), _n(w.description), _n(w.origine_flux)])
    if any(k in txt for k in ["effluent", "liquide", "boue", "sludge", "sang"]):
        return "liquide"
    humidity = _effective_humidity_pct(w, metrics)
    if wt == WasteType.BOUE_DE_VIDANGE:
        if humidity is None:
            return "semi-solide" if float(metrics.get("siccite_pct", 0.0) or 0.0) > 20 else "liquide"
        if humidity >= 70:
            return "liquide"
        if humidity >= 40:
            return "semi-solide"
        return "solide"
    return "solide"



def _probable_family_and_subtype_from_text(w: WasteInput) -> tuple[str, str]:
    txt = " ".join([_n(w.nom), _n(w.description), _n(w.produit_principal), _n(w.origine_flux)])

    if any(k in txt for k in ["abattoir", "abattage", "viscere", "tripe", "sang", "animal", "carcasse"]):
        return "abattoir", "biomasse animale"
    if any(k in txt for k in ["alimentaire", "reste alimentaire", "dechet alimentaire", "agroalimentaire", "organique"]):
        return "agricole", "dechet alimentaire organique"
    if any(k in txt for k in ["plastique", "pet", "pehd", "pvc", "poly", "sachet", "film"]):
        return "plastique", "polymere synthetique"
    if any(k in txt for k in ["bois", "sciure", "copeaux", "bagasse", "lignine", "cellulose"]):
        return "agricole", "biomasse lignocellulosique"
    if any(k in txt for k in ["peinture", "paint", "vernis", "coating", "laque", "encre", "resine", "pigment"]):
        return "industriel", "dechet chimique de peinture/revetement"
    if any(k in txt for k in ["metal", "fer", "acier", "alu", "ferraille"]):
        return "industriel", "dechet metallique"

    return "industriel", "biomasse mixte probable"


def _is_composition_estimated(w: WasteInput, wt: WasteType) -> bool:
    if wt == WasteType.BOUE_DE_VIDANGE:
        return w.dbo_mg_l is None or w.dco_mg_l is None
    if wt == WasteType.BIOMASSE_LIGNOCELLULOSIQUE:
        return w.pci_mj_kg is None or w.taux_lignine_pct is None
    if wt in {WasteType.PLASTIQUE, WasteType.TEXTILE, WasteType.HUILE_USAGEE}:
        return w.pci_mj_kg is None
    if wt == WasteType.OTHER:
        return True
    return any(v is None for v in [w.pci_mj_kg, w.taux_lignine_pct, w.dbo_mg_l, w.dco_mg_l])

def _waste_family_label(w: WasteInput, wt: WasteType) -> str:
    if _is_abattoir_waste(w):
        return "abattoir"
    if _is_organic_waste_text(w):
        return "organique"
    if wt == WasteType.PLASTIQUE:
        return "plastique"
    if wt == WasteType.BIOMASSE_LIGNOCELLULOSIQUE:
        return "agricole"
    if w.categorie == WasteCategory.CHEMICAL:
        return "industriel"
    if w.categorie == WasteCategory.METAL:
        return "industriel"
    if wt == WasteType.BOUE_DE_VIDANGE:
        return "organique"
    if wt == WasteType.OTHER:
        probable_family, _ = _probable_family_and_subtype_from_text(w)
        return probable_family
    return "industriel"

def _waste_subtype_label(w: WasteInput, wt: WasteType) -> str:
    if _is_abattoir_waste(w):
        return "biomasse animale"
    if w.categorie == WasteCategory.CHEMICAL:
        return "dechet chimique de peinture/revetement" if _is_paint_or_coating_waste(w) else "dechet chimique industriel"
    if wt == WasteType.OTHER:
        _, probable_subtype = _probable_family_and_subtype_from_text(w)
        return probable_subtype
    mapping = {
        WasteType.BIOMASSE_LIGNOCELLULOSIQUE: "biomasse lignocellulosique",
        WasteType.BOUE_DE_VIDANGE: "matiere organique humide",
        WasteType.HUILE_USAGEE: "fraction lipidique",
        WasteType.TEXTILE: "fibre polymerique",
        WasteType.PLASTIQUE: "polymere thermoplastique",
        WasteType.OTHER: "biomasse mixte probable",
    }
    return mapping.get(wt, "biomasse mixte probable")

def _is_lipid_rich(w: WasteInput, wt: WasteType) -> bool:
    txt = " ".join([_n(w.nom), _n(w.description), _n(w.produit_principal)])
    if any(k in txt for k in ["graisse", "lipide", "suif", "gras", "huile"]):
        return True
    return wt == WasteType.HUILE_USAGEE or _is_abattoir_waste(w)


def _is_animal_protein_rich(w: WasteInput) -> bool:
    txt = " ".join([_n(w.nom), _n(w.description), _n(w.produit_principal), _n(w.origine_flux)])
    return any(k in txt for k in ["abattoir", "animal", "viscere", "tripe", "sang", "carcasse", "proteine"])


def _estimate_composition_labels(w: WasteInput, wt: WasteType, metrics: dict[str, float]) -> list[str]:
    comp: list[str] = []
    humidity_pct = _effective_humidity_pct(w, metrics)
    humidity = _humidity_level_from_pct(humidity_pct)
    txt = " ".join([_n(w.nom), _n(w.description), _n(w.produit_principal), _n(w.origine_flux)])

    if _is_abattoir_waste(w):
        comp.extend([
            "matiere organique elevee",
            "proteines animales",
            "lipides animaux",
            "humidite elevee",
            "mineraux traces",
        ])
        return comp

    if any(k in txt for k in ["dechet alimentaire", "alimentaire", "reste alimentaire", "agroalimentaire"]):
        comp.extend(["glucides", "matiere organique"])

    if any(k in txt for k in ["bois", "sciure", "copeaux", "bagasse", "lignine", "cellulose"]):
        comp.extend(["cellulose", "lignine"])

    if any(k in txt for k in ["plastique", "pet", "pehd", "pvc", "poly"]):
        comp.append("polymeres synthetiques")

    if wt in {WasteType.BIOMASSE_LIGNOCELLULOSIQUE, WasteType.BOUE_DE_VIDANGE}:
        comp.append("matiere organique")
    if wt == WasteType.BIOMASSE_LIGNOCELLULOSIQUE:
        comp.append("cellulose/lignine")
    if wt == WasteType.HUILE_USAGEE:
        comp.append("lipides/hydrocarbures")
    if wt == WasteType.PLASTIQUE:
        comp.append("polymeres")
    if w.categorie == WasteCategory.METAL:
        comp.append("mineraux/metaux")
    if wt == WasteType.BOUE_DE_VIDANGE and float(metrics.get("dbo_mg_l", 0.0) or 0.0) > 800:
        comp.append("fraction biodegradable elevee")

    if wt == WasteType.OTHER and not comp:
        _, probable_subtype = _probable_family_and_subtype_from_text(w)
        if probable_subtype == "biomasse mixte probable":
            comp.append("biomasse mixte probable")
        elif "polymere" in probable_subtype:
            comp.append("polymeres synthetiques")
        elif "lignocellulosique" in probable_subtype:
            comp.extend(["cellulose", "lignine"])
        elif "alimentaire" in probable_subtype:
            comp.extend(["glucides", "matiere organique"])

    comp.append(f"humidite {humidity}")
    return list(dict.fromkeys(comp))


def _priority_from_filiere(filiere: str) -> str:
    high = {"methanisation_biogaz", "biodiesel_combustible", "regeneration_huiles", "neutralisation_chimique", "refonte_metaux", "recyclage_mecanique_plastique", "charbon_actif", "recyclage_papetier", "pyrolyse_plastique", "farines_animales_engrais"}
    medium = {"compostage", "epandage_agricole", "effilochage_textile", "reemploi_textile", "reemploi_pieces_metalliques", "reemploi_plastique", "reemploi_carton_emballage"}
    if filiere in high:
        return "haute"
    if filiere in medium:
        return "moyenne"
    return "basse"


def _build_expert_valorization_profile(w: WasteInput, wt: WasteType, metrics: dict[str, float], evald: list[dict[str, Any]], regulatory: dict[str, Any]) -> dict[str, Any]:
    waste_type = _waste_family_label(w, wt)
    subtype = _waste_subtype_label(w, wt)
    humidity_pct = _effective_humidity_pct(w, metrics)
    humidity = _humidity_level_from_pct(humidity_pct)
    state = _state_from_waste(w, wt, metrics)
    composition = _estimate_composition_labels(w, wt, metrics)
    composition_estimee = _is_composition_estimated(w, wt)

    ranked = sorted([x for x in evald if x.get("feasible", True)], key=lambda z: float(z.get("global_score", 0.0)), reverse=True)
    valorisations: list[dict[str, str]] = []

    def add_valo(name: str, priority: str, justification: str) -> None:
        if any(v["nom"] == name for v in valorisations):
            return
        valorisations.append({"nom": name, "priorite": priority, "justification": justification})

    if _is_abattoir_waste(w):
        add_valo("methanisation_biogaz", "haute", "Matiere organique humide elevee: production de biogaz et digestat stabilise, voie robuste en contexte CEDEAO.")
        if _is_lipid_rich(w, wt):
            add_valo("biodiesel_combustible", "haute", "Fraction lipidique valorisable en esters energetiques apres pretraitement.")
        add_valo("farines_animales_engrais", "moyenne", "Proteines animales valorisables sous contraintes sanitaires strictes et conformite reglementaire locale.")
        add_valo("compostage", "moyenne", "Option biologique complementaire apres hygienisation/pretraitement.")
        if w.niveau_danger in {"faible", "moyen"}:
            add_valo("epandage_agricole", "moyenne", "Applicable uniquement apres controle microbiologique et autorisation locale.")

    for item in ranked:
        filiere = str(item.get("filiere") or "")
        if not filiere:
            continue
        add_valo(filiere, _priority_from_filiere(filiere), str(item.get("technical_reason") or "Justification technique multicritere."))
        if len(valorisations) >= 5:
            break

    if not any(v["priorite"] == "haute" for v in valorisations):
        for item in ranked:
            filiere = str(item.get("filiere") or "")
            if filiere and filiere != DECISION_ELIMINATION:
                existing = next((v for v in valorisations if v["nom"] == filiere), None)
                if existing:
                    existing["priorite"] = "haute"
                    existing["justification"] = "Meilleure option a forte valeur retenue par scoring technico-economique."
                else:
                    add_valo(filiere, "haute", "Meilleure option a forte valeur retenue par scoring technico-economique.")
                break

    add_valo(DECISION_ELIMINATION, "basse", "Voie de securite obligatoire en cas de non-conformite sanitaire/reglementaire des autres filieres.")

    priority_rank = {"haute": 0, "moyenne": 1, "basse": 2}
    valorisations = sorted(valorisations, key=lambda v: priority_rank.get(str(v.get("priorite") or ""), 3))


    contraintes = [
        "sanitaire: pretraitement/hygienisation requis pour flux animaux ou putrescibles",
        "reglementation: conformite CEDEAO/Bamako et autorisations locales obligatoires",
        "technique: tri, controle qualite et caracterisation physico-chimique avant orientation finale",
    ]
    if str(regulatory.get("status") or "") == "non_conforme":
        contraintes.append("reglementation: certaines voies sont bloquees tant que la non-conformite persiste")

    return {
        "type": waste_type,
        "categorie": subtype,
        "etat": state,
        "humidite": humidity,
        "composition": composition,
        "composition_estimee": composition_estimee,
        "mention_composition": "Les donnees de composition sont estimees automatiquement" if composition_estimee else "",
        "valorisations": valorisations,
        "contraintes": contraintes,
    }
def _metrics(w: WasteInput, wt: WasteType) -> tuple[dict[str, float], list[str], list[str]]:
    defaults = TYPICAL.get(wt.value, TYPICAL[WasteType.OTHER.value])
    assumptions: list[str] = []
    missing: list[str] = []

    met_desc = _pct(w.description, ["metaux", "metal"])
    met = met_desc if met_desc is not None else (60.0 if w.contient_metaux else defaults["metaux_pct"])
    if w.contient_metaux and met_desc is None:
        assumptions.append("Teneur en metaux supposee a 60% (contient_metaux=true).")

    humidity_desc = _pct(w.description, ["humidite", "humide", "hygrometrie", "teneur en eau"])
    sic_desc = _pct(w.description, ["siccite", "sechage", "matiere seche"])

    humidity = float(w.taux_humidite_pct) if w.taux_humidite_pct is not None else None
    if humidity is not None:
        assumptions.append(f"Humidite fournie par l'utilisateur ({humidity:.1f}%).")
    elif humidity_desc is not None:
        humidity = float(humidity_desc)
        assumptions.append(f"Humidite extraite de la description ({humidity:.1f}%).")

    sic = float(sic_desc) if sic_desc is not None else None
    if humidity is None and sic is not None:
        humidity = max(0.0, min(100.0, 100.0 - float(sic)))
        assumptions.append(f"Humidite deduite de la siccite ({humidity:.1f}%).")
    if humidity is None:
        d = _n(w.description)
        if "humide" in d:
            humidity = 82.0
            sic = 18.0
            assumptions.append("Humidite estimee a 82% (decrit humide).")
        elif "sec" in d:
            humidity = 35.0
            sic = 65.0
            assumptions.append("Humidite estimee a 35% (decrit sec).")
        else:
            humidity = max(0.0, min(100.0, 100.0 - float(defaults["siccite_pct"])))
            assumptions.append(f"Humidite typique appliquee ({humidity:.1f}%).")
    if sic is None:
        sic = max(0.0, min(100.0, 100.0 - float(humidity)))
    if humidity is not None and sic is not None and w.taux_humidite_pct is not None and sic_desc is None:
        sic = max(0.0, min(100.0, 100.0 - float(humidity)))

    out = {
        "pci_mj_kg": float(w.pci_mj_kg) if w.pci_mj_kg is not None else float(defaults.get("pci_mj_kg", 0.0)),
        "dbo_mg_l": float(w.dbo_mg_l) if w.dbo_mg_l is not None else float(defaults.get("dbo_mg_l", 0.0)),
        "dco_mg_l": float(w.dco_mg_l) if w.dco_mg_l is not None else float(defaults.get("dco_mg_l", 0.0)),
        "taux_lignine_pct": float(w.taux_lignine_pct) if w.taux_lignine_pct is not None else float(defaults.get("taux_lignine_pct", 0.0)),
        "metaux_pct": float(met),
        "siccite_pct": float(sic),
        "humidite_pct": float(humidity),
    }

    if w.pci_mj_kg is None:
        assumptions.append(f"PCI typique applique ({out['pci_mj_kg']} MJ/kg).")
    if wt == WasteType.BOUE_DE_VIDANGE:
        if w.dbo_mg_l is None:
            assumptions.append(f"DBO typique appliquee ({out['dbo_mg_l']} mg/L)."); missing.append("DBO (mg/L)")
        if w.dco_mg_l is None:
            assumptions.append(f"DCO typique appliquee ({out['dco_mg_l']} mg/L)."); missing.append("DCO (mg/L)")
    if wt in {WasteType.BIOMASSE_LIGNOCELLULOSIQUE, WasteType.PLASTIQUE, WasteType.TEXTILE, WasteType.HUILE_USAGEE} and w.pci_mj_kg is None:
        missing.append("PCI (MJ/kg)")
    if w.categorie == WasteCategory.METAL and met_desc is None:
        missing.append("teneur_metaux_%")
    if w.taux_humidite_pct is None and humidity_desc is None and sic_desc is None:
        assumptions.append(f"Humidite typique appliquee ({out['humidite_pct']:.1f}%).")

    return out, assumptions, sorted(set(missing))


def _cand(f: str, h: str, t: float, reason: str, conds: list[str], feasible: bool = True, blocked: str | None = None) -> dict[str, Any]:
    return {"filiere": f, "hierarchy": h, "technical_score": _b(t), "technical_reason": reason, "conditions": conds, "feasible": feasible, "blocked_reason": blocked}


def _build_candidates(w: WasteInput, wt: WasteType, m: dict[str, float]) -> tuple[list[dict[str, Any]], list[str]]:
    c: list[dict[str, Any]] = []
    warnings: list[str] = []
    humidity_pct = float(m.get("humidite_pct", max(0.0, 100.0 - float(m.get("siccite_pct", 0.0) or 0.0))) or 0.0)

    if w.niveau_danger == "critique" or (w.categorie == WasteCategory.CHEMICAL and w.niveau_danger in {"eleve", "critique"}):
        return [
            _cand(DECISION_ELIMINATION, "elimination", 95, "Dangerosite critique/chimique: elimination securisee obligatoire.", ["transport ADR", "centre agree", "bordereau de suivi"])
        ], warnings

    if w.categorie == WasteCategory.CHEMICAL and wt != WasteType.HUILE_USAGEE:
        paint_like = _is_paint_or_coating_waste(w)
        c += [
            _cand("neutralisation_chimique", "matiere", 86 if paint_like else 74, "Traitement physico-chimique prioritaire pour stabiliser/neutraliser le flux chimique.", ["neutralisation", "controle pH", "gestion des boues"], feasible=True),
            _cand("co_incineration_cimenterie", "energie", 58 if paint_like else 52, "Voie thermique uniquement si conformite emissions et autorisation locale.", ["analyse halogenes", "controle emissions"], feasible=(not bool(w.presence_chlore)), blocked="Presence de chlore: voie thermique non recommandee" if bool(w.presence_chlore) else None),
            _cand(DECISION_ELIMINATION, "elimination", 68, "Filet de securite en cas de non-conformite des filieres de valorisation chimique.", ["centre agree", "bordereau de suivi"]),
        ]
        _apply_combustion_safety_constraints(c, w, m, warnings)
        return c, warnings
    if wt == WasteType.BIOMASSE_LIGNOCELLULOSIQUE:
        dry_biomass = humidity_pct <= 35.0
        c += [
            _cand("charbon_actif", "matiere", 88 if (m["taux_lignine_pct"] >= 20 and dry_biomass) else 70 if humidity_pct <= 55.0 else 60, f"Biomasse lignocellulosique, lignine={m['taux_lignine_pct']:.1f}%, humidite={humidity_pct:.1f}%.", ["pyrolyse", "activation", "QC"], feasible=dry_biomass or humidity_pct <= 55.0, blocked="Humidite trop elevee pour carbonisation directe" if humidity_pct > 55.0 else None),
            _cand("combustion_gazeification", "energie", 82 if (m["pci_mj_kg"] > 15 and dry_biomass) else 58 if m["pci_mj_kg"] > 15 else 50, f"PCI={m['pci_mj_kg']:.1f} MJ/kg, siccite={m['siccite_pct']:.1f}%, humidite={humidity_pct:.1f}%.", ["chaudiere/gazogeniere", "controle emissions"], feasible=(m["pci_mj_kg"] > 12 and humidity_pct <= 60.0), blocked="PCI insuffisant ou flux trop humide" if (m["pci_mj_kg"] <= 12 or humidity_pct > 60.0) else None),
            _cand("compostage", "matiere", 70 if 35.0 <= humidity_pct <= 70.0 else 55 if humidity_pct > 70.0 else 45, "Compostage en fallback si flux humide.", ["plateforme compostage"], feasible=(humidity_pct >= 30.0), blocked="Humidite insuffisante pour compostage stable" if humidity_pct < 30.0 else None),
        ]
    elif w.categorie == WasteCategory.METAL:
        reusable_metal = m["metaux_pct"] >= 80 and w.niveau_danger in {"faible", "moyen"}
        c += [
            _cand("reemploi_pieces_metalliques", "reemploi", 82 if reusable_metal else 55, f"Reemploi possible si pieces intactes; teneur metaux estimee a {m['metaux_pct']:.1f}%.", ["tri qualite", "controle integrite", "tracabilite"], feasible=reusable_metal, blocked="Flux metal trop heterogene/risque pour reemploi" if not reusable_metal else None),
            _cand("refonte_metaux", "matiere", 90 if m["metaux_pct"] > 50 else 65, f"Teneur metaux estimee a {m['metaux_pct']:.1f}%.", ["tri metallique", "fonderie/acierie"], feasible=(m["metaux_pct"] > 40), blocked="Teneur metallique insuffisante" if m["metaux_pct"] <= 40 else None),
            _cand("vente_ferrailleur_certifie", "vente", 58, "Dernier recours vers ferrailleur certifie.", ["tracabilite lot", "conformite"]),
        ]
    elif wt == WasteType.PLASTIQUE:
        contamination = float(w.taux_contamination_pct or 15.0)
        reusable_plastic = contamination <= 10 and w.niveau_danger in {"faible", "moyen"}
        c += [
            _cand("reemploi_plastique", "reemploi", 80 if reusable_plastic else 50, f"Reemploi si contamination faible ({contamination:.1f}%).", ["tri", "lavage", "controle qualite"], feasible=reusable_plastic, blocked="Contamination trop elevee pour reemploi" if not reusable_plastic else None),
            _cand("recyclage_mecanique_plastique", "matiere", 86 if contamination <= 20 else 62, f"Contamination={contamination:.1f}%, tri et proprete determinants.", ["tri", "lavage", "extrusion"], feasible=(contamination <= 35), blocked="Contamination trop elevee" if contamination > 35 else None),
            _cand("pyrolyse_plastique", "energie", 76 if contamination > 20 else 61, "Pyrolyse pour plastiques melanges/contamines.", ["reacteur pyrolyse", "traitement gaz"]),
            _cand("co_incineration_cimenterie", "energie", 72 if m["pci_mj_kg"] > 15 else 45, f"PCI={m['pci_mj_kg']:.1f} MJ/kg, co-incineration conditionnelle.", ["filiere cimenterie", "controle chlore"], feasible=(m["pci_mj_kg"] > 15 and (not _is_pvc(w) or bool(w.filiere_cimenterie_autorisee))), blocked="PCI<15 ou filiere cimenterie non autorisee pour flux chlore" if not (m["pci_mj_kg"] > 15 and (not _is_pvc(w) or bool(w.filiere_cimenterie_autorisee))) else None),
        ]
    elif wt == WasteType.BOUE_DE_VIDANGE:
        is_abattoir = _is_abattoir_waste(w)
        lipid_rich = _is_lipid_rich(w, wt)
        protein_rich = _is_animal_protein_rich(w)
        c += [
            _cand("methanisation_biogaz", "energie", 96 if (is_abattoir or m["dbo_mg_l"] > 1000 or humidity_pct >= 70.0) else 68 if humidity_pct >= 55.0 else 56, f"DBO={m['dbo_mg_l']:.0f} mg/L, DCO={m['dco_mg_l']:.0f} mg/L, humidite={humidity_pct:.1f}%.", ["digesteur", "epuration biogaz", "hygienisation des intrants"], feasible=(m["dbo_mg_l"] > 500 or is_abattoir or humidity_pct >= 60.0), blocked="Charge organique ou humidite insuffisante" if (m["dbo_mg_l"] <= 500 and not is_abattoir and humidity_pct < 60.0) else None),
            _cand("biodiesel_combustible", "energie", 84 if lipid_rich and humidity_pct <= 35.0 else 58 if lipid_rich else 45, "Fraction lipidique valorisable en biocarburant apres pretraitement.", ["separation des graisses", "transesterification", "controle qualite"], feasible=lipid_rich, blocked="Fraction lipidique insuffisante" if not lipid_rich else None),
            _cand("farines_animales_engrais", "matiere", 72 if protein_rich else 50, "Valorisation proteique conditionnee a une maitrise sanitaire stricte.", ["sterilisation", "controle pathogenes", "conformite sanitaire"], feasible=protein_rich and w.niveau_danger != "critique", blocked="Profil proteique animal non confirme ou risque sanitaire eleve" if not (protein_rich and w.niveau_danger != "critique") else None),
            _cand("compostage", "matiere", 78 if 45.0 <= humidity_pct <= 75.0 else 60 if humidity_pct > 75.0 else 50, f"Humidite={humidity_pct:.1f}%, siccite={m['siccite_pct']:.1f}%.", ["compostage", "stabilisation"], feasible=(m["siccite_pct"] > 12), blocked="Siccite trop faible" if m["siccite_pct"] <= 12 else None),
            _cand("epandage_agricole", "matiere", 58, "Epandage possible si conformite sanitaire.", ["analyse sanitaire", "autorisation locale"], feasible=(w.niveau_danger in {"faible", "moyen"}), blocked="Niveau de danger incompatible" if w.niveau_danger in {"eleve", "critique"} else None),
        ]
    elif wt == WasteType.HUILE_USAGEE:
        c += [
            _cand("regeneration_huiles", "matiere", 90, "Regeneration en base oils prioritaire.", ["unite regeneration", "controle impuretes"]),
            _cand("biodiesel_combustible", "energie", 72, "Alternative biodiesel/combustible industriel.", ["transesterification/blending"]),
        ]
    elif wt == WasteType.TEXTILE:
        reusable_textile = _textile_reusable(w)
        c += [
            _cand("reemploi_textile", "reemploi", 84 if reusable_textile else 55, "Reemploi prioritaire si etat correct.", ["tri qualite", "desinfection"], feasible=reusable_textile, blocked="Etat textile insuffisant" if not reusable_textile else None),
            _cand("effilochage_textile", "matiere", 74 if humidity_pct <= 45.0 else 60, "Effilochage en fibres techniques.", ["ligne effilochage"], feasible=(humidity_pct <= 60.0), blocked="Humidite trop elevee pour effilochage direct" if humidity_pct > 60.0 else None),
            _cand("co_incineration_cimenterie", "energie", 62 if humidity_pct <= 30.0 else 50, "Reserve aux textiles souilles.", ["cimenterie", "controle emissions"], feasible=(humidity_pct <= 50.0), blocked="Texile trop humide pour voie thermique directe" if humidity_pct > 50.0 else None),
        ]
    elif w.categorie == WasteCategory.PAPER:
        contamination = float(w.taux_contamination_pct or 12.0)
        reusable_paper = contamination <= 8 and w.niveau_danger in {"faible", "moyen"}
        c += [
            _cand("reemploi_carton_emballage", "reemploi", 78 if reusable_paper else 50, "Reemploi de cartons/emballages si qualite suffisante.", ["tri", "reconditionnement"], feasible=reusable_paper, blocked="Qualite insuffisante pour reemploi" if not reusable_paper else None),
            _cand("recyclage_papetier", "matiere", 85 if contamination <= 20 else 58, "Recyclage papetier prioritaire.", ["tri papier", "ballage"], feasible=(contamination <= 35), blocked="Contamination trop elevee" if contamination > 35 else None),
            _cand("compostage", "matiere", 63 if m["siccite_pct"] < 30 else 45, "Compostage si humide/contamine.", ["plateforme compostage"]),
            _cand("combustion_gazeification", "energie", 68 if m["pci_mj_kg"] > 15 else 46, f"PCI={m['pci_mj_kg']:.1f}.", ["chaudiere biomasse"], feasible=(m["pci_mj_kg"] > 12), blocked="PCI insuffisant" if m["pci_mj_kg"] <= 12 else None),
        ]
    else:
        c += [
            _cand("tri_preparation_matiere", "matiere", 58, "Tri avance et preparation matiere avant orientation filiere locale.", ["tri source", "broyage", "controle qualite"]),
            _cand("combustible_solide_recupere", "energie", 54, "Production de combustible solide de recuperation si conformite emissions.", ["preparation CSR", "controle emissions", "autorisation installation"]),
            _cand("vente_marketplace", "vente", 42, "Vente en dernier recours.", ["certificat qualite"]),
        ]

    _apply_combustion_safety_constraints(c, w, m, warnings)
    return c, warnings


def _eco(f: str, qt: float, country: str | None) -> tuple[float, float, float, float, float, float]:
    price, cost = float(LOCAL_MARKET.get(f, 90000.0)), float(TREATMENT_COST.get(f, 70000.0))
    if _n(country) == "benin":
        price *= 1.03
        cost *= 0.97
    value, treat = price * qt, cost * qt
    net = value - treat
    roi = (net / treat) if treat > 1e-6 else 0.0
    return value, treat, roi, _b(50.0 + roi * 55.0), price, cost


def _env_social(w: WasteInput, f: str, country: str | None) -> tuple[float, float, float]:
    p = get_country_environmental_profile(country)
    avoided = float(CO2_AVOIDED.get(f, 120.0)) * float(p.get("avoided_multiplier") or 1.0)
    gen = float(p.get("generated_multiplier") or 1.0)
    env = _b(50.0 + avoided / 12.0 - max(0.0, gen - 1.0) * 10.0)
    if w.niveau_danger in {"eleve", "critique"} and f in {"vente_marketplace", "vente_ferrailleur_certifie"}:
        env -= 30
    social = float(SOCIAL.get(f, 55.0)) + float(AVAIL_BENIN.get(f, 0.0) if _n(country) == "benin" else 0.0)
    return _b(env), _b(social), max(0.0, avoided)


def _evaluate(
    w: WasteInput,
    candidates: list[dict[str, Any]],
    country: str | None,
    metrics: dict[str, float],
    score_adjustments: dict[str, float] | None = None,
) -> list[dict[str, Any]]:
    qt = max(0.01, float(w.quantite_kg) / 1000.0)
    out: list[dict[str, Any]] = []
    for c in candidates:
        val, treat, roi, eco, value_pt, cost_pt = _eco(c["filiere"], qt, country)
        env, social, co2 = _env_social(w, c["filiere"], country)
        tech = c["technical_score"] if c.get("feasible", True) else max(5.0, c["technical_score"] - 40.0)

        pci = float(metrics.get("pci_mj_kg", 0.0) or 0.0)
        lignine = float(metrics.get("taux_lignine_pct", 0.0) or 0.0)
        dbo = float(metrics.get("dbo_mg_l", 0.0) or 0.0)
        dco = float(metrics.get("dco_mg_l", 0.0) or 0.0)
        humidity_pct = float(metrics.get("humidite_pct", max(0.0, 100.0 - float(metrics.get("siccite_pct", 0.0) or 0.0))) or 0.0)
        dco_dbo = (dco / dbo) if dbo > 0 else 99.0

        if humidity_pct >= 70.0:
            if c["hierarchy"] == "energie":
                tech -= 15.0
            if c["filiere"] in {"methanisation_biogaz", "compostage", "epandage_agricole"}:
                tech += 10.0
            if c["filiere"] in {"recyclage_mecanique_plastique", "reemploi_plastique", "reemploi_textile", "reemploi_carton_emballage", "effilochage_textile"}:
                tech -= 8.0
        elif humidity_pct <= 30.0:
            if c["hierarchy"] == "energie":
                tech += 10.0
            if c["filiere"] in {"methanisation_biogaz", "compostage"}:
                tech -= 6.0

        if c["hierarchy"] == "energie":
            if pci >= 16:
                tech += 10.0
            elif pci < 8:
                tech -= 18.0
            if c["filiere"] == "methanisation_biogaz":
                if dbo >= 1200 and dco_dbo <= 3.0:
                    tech += 18.0
                elif dbo < 500:
                    tech -= 20.0

        if c["filiere"] == "charbon_actif":
            if lignine >= 25:
                tech += 12.0
            elif lignine >= 15:
                tech += 5.0

        if c["hierarchy"] == "reemploi" and w.niveau_danger in {"eleve", "critique"}:
            tech -= 25.0

        if _n(country) == "benin" and w.categorie == WasteCategory.METAL and c["hierarchy"] == "vente":
            tech -= 10.0
            if _is_export_intent(w):
                c["feasible"] = False
                c["blocked_reason"] = "Benin: exportation de ferraille restreinte, vente export non autorisee."
                tech -= 35.0

        tech = _b(tech)
        g = _b(WEIGHT_TECH * tech + WEIGHT_ECO * eco + WEIGHT_ENV * env + WEIGHT_SOCIAL * social)
        x = dict(c)
        x.update({
            "economic_score": round(eco, 2),
            "environmental_score": round(env, 2),
            "social_score": round(social, 2),
            "regulatory_score": 0.0,
            "global_score": round(g, 2),
            "market_value_fcfa": round(val, 2),
            "market_value_fcfa_tonne": round(value_pt, 2),
            "treatment_cost_fcfa": round(treat, 2),
            "treatment_cost_fcfa_tonne": round(cost_pt, 2),
            "gain_industriel_fcfa": round(val - treat, 2),
            "gain_industriel_fcfa_tonne": round(value_pt - cost_pt, 2),
            "roi": round(roi, 4),
            "co2_avoided_kg": round(co2, 2),
        })
        out.append(x)

    if score_adjustments is None:
        decision_labels = [DECISION_REEMPLOI, DECISION_MATIERE, DECISION_ENERGIE, DECISION_VENTE]

        l = get_learning_adjustments(
            waste_type=getattr(_infer_type(w), "value", str(_infer_type(w))),
            country=country,
            decision_labels=decision_labels,
        )
        deltas = l.get("deltas", {}) if isinstance(l, dict) else {}

        ml = get_ml_score_adjustments(
            waste_type=getattr(_infer_type(w), "value", str(_infer_type(w))),
            country=country,
            quantity_kg=float(w.quantite_kg),
            decision_labels=decision_labels,
        )
        ml_deltas = ml.get("deltas", {}) if isinstance(ml, dict) else {}
        score_adjustments = {
            DECISION_REEMPLOI: float(deltas.get(DECISION_REEMPLOI, 0.0)) + float(ml_deltas.get(DECISION_REEMPLOI, 0.0)),
            DECISION_MATIERE: float(deltas.get(DECISION_MATIERE, 0.0)) + float(ml_deltas.get(DECISION_MATIERE, 0.0)),
            DECISION_ENERGIE: float(deltas.get(DECISION_ENERGIE, 0.0)) + float(ml_deltas.get(DECISION_ENERGIE, 0.0)),
            DECISION_VENTE: float(deltas.get(DECISION_VENTE, 0.0)) + float(ml_deltas.get(DECISION_VENTE, 0.0)),
        }
    for x in out:
        if x["hierarchy"] == "reemploi":
            x["global_score"] = _b(x["global_score"] + float(score_adjustments.get(DECISION_REEMPLOI, 0.0)))
        elif x["hierarchy"] == "matiere":
            x["global_score"] = _b(x["global_score"] + float(score_adjustments.get(DECISION_MATIERE, 0.0)))
        elif x["hierarchy"] == "energie":
            x["global_score"] = _b(x["global_score"] + float(score_adjustments.get(DECISION_ENERGIE, 0.0)))
        elif x["hierarchy"] == "vente":
            x["global_score"] = _b(x["global_score"] + float(score_adjustments.get(DECISION_VENTE, 0.0)))
    return out


def _label_for_hierarchy(hierarchy: str, labels: dict[str, str]) -> str | None:
    if hierarchy == "reemploi":
        return labels["reemploi"]
    if hierarchy == "matiere":
        return labels["matiere"]
    if hierarchy == "energie":
        return labels["energetique"]
    if hierarchy == "vente":
        return labels["vente"]
    return None


def _apply_regulatory_priority(evald: list[dict[str, Any]], blocked: dict[str, list[str]], regulatory: dict[str, Any], labels: dict[str, str], references: list[str]) -> list[dict[str, Any]]:
    risk = float(regulatory.get("risk_score") or 0.0)
    status = str(regulatory.get("status") or "conforme_sous_conditions")
    has_bamako = any("bamako" in _n(ref) for ref in references)

    for x in evald:
        label = _label_for_hierarchy(x.get("hierarchy", ""), labels)
        block_reasons = blocked.get(label, []) if label else []

        reg_score = _b(100.0 - risk)
        if status == "non_conforme":
            reg_score -= 25.0
        elif status == "conforme_sous_conditions":
            reg_score -= 10.0
        if has_bamako:
            reg_score += 5.0

        if block_reasons:
            x["feasible"] = False
            joined = " | ".join(block_reasons)
            x["blocked_reason"] = f"{x['blocked_reason']} | {joined}" if x.get("blocked_reason") else joined
            reg_score = min(reg_score, 15.0)

        x["regulatory_score"] = round(_b(reg_score), 2)
        x["global_score"] = round(
            _b(
                WEIGHT_TECH * float(x.get("technical_score", 0.0))
                + WEIGHT_ECO * float(x.get("economic_score", 0.0))
                + WEIGHT_ENV * float(x.get("environmental_score", 0.0))
                + WEIGHT_SOCIAL * float(x.get("social_score", 0.0))
                + WEIGHT_REG * float(x.get("regulatory_score", 0.0))
            ),
            2,
        )

    return evald

def _select(evald: list[dict[str, Any]]) -> tuple[dict[str, Any], list[str]]:
    reasons: list[str] = []
    elim = [x for x in evald if x["hierarchy"] == "elimination" and x.get("feasible", True)]

    by = {g: [x for x in evald if x["hierarchy"] == g and x.get("feasible", True)] for g in HIERARCHY}
    best = {g: (sorted(by[g], key=lambda z: z["global_score"], reverse=True)[0] if by[g] else None) for g in HIERARCHY}

    # Exception industrielle: si la meilleure option energetique depasse nettement la meilleure matiere,
    # on la retient malgre la hierarchie (cas PCI/DBO-DCO tres favorables).
    if best.get("matiere") and best.get("energie"):
        if float(best["energie"]["global_score"]) >= float(best["matiere"]["global_score"]) + 8.0:
            reasons.append("Energie retenue: superiority nette sur matiere selon scoring multicriteres.")
            return best["energie"], reasons

    for g in HIERARCHY:
        if best.get(g):
            chosen = best[g]
            if g == "reemploi":
                reasons.append("Hierarchie appliquee: reemploi retenu en priorite (sobriete matiere/energie).")
            elif g == "matiere":
                reasons.append("Hierarchie appliquee: matiere retenue car faisable.")
            elif g == "energie":
                reasons.append("Energie retenue car matiere non faisable ou moins robuste.")
            else:
                reasons.append("Vente retenue en dernier recours seulement.")
            return chosen, reasons

    if elim:
        reasons.append("Aucune voie de valorisation conforme: elimination securisee imposee.")
        return sorted(elim, key=lambda z: z["global_score"], reverse=True)[0], reasons

    feasible_any = [x for x in evald if x.get("feasible", True)]
    if feasible_any:
        reasons.append("Aucune voie prioritaire disponible: meilleure option faisable retenue.")
        return sorted(feasible_any, key=lambda z: z["global_score"], reverse=True)[0], reasons

    reasons.append("Aucune filiere de valorisation conforme: elimination securisee par precaution.")
    return {
        "filiere": DECISION_ELIMINATION,
        "hierarchy": "elimination",
        "technical_score": 70.0,
        "technical_reason": "Fallback de conformite: absence de filiere conforme.",
        "conditions": ["transport ADR", "centre agree", "bordereau de suivi"],
        "feasible": True,
        "blocked_reason": None,
        "economic_score": 20.0,
        "environmental_score": 25.0,
        "social_score": 30.0,
        "regulatory_score": 85.0,
        "global_score": 48.0,
        "market_value_fcfa": 0.0,
        "treatment_cost_fcfa": 140000.0,
        "roi": -1.0,
        "co2_avoided_kg": 0.0,
    }, reasons
def _alternatives(chosen: dict[str, Any], evald: list[dict[str, Any]]) -> list[dict[str, Any]]:
    order = sorted([x for x in evald if x["filiere"] != chosen["filiere"] and x.get("feasible", True)], key=lambda z: z["global_score"], reverse=True)
    out: list[dict[str, Any]] = []
    for x in order[:3]:
        why = "Score global inferieur a la filiere principale."
        if chosen["hierarchy"] != x["hierarchy"] and chosen["hierarchy"] in {"matiere", "energie"}:
            why = f"Moins prioritaire dans la hierarchie ({x['hierarchy']} apres {chosen['hierarchy']})."
        if not x.get("feasible", True):
            why = x.get("blocked_reason") or "Non faisable techniquement/reglementairement."
        out.append({"filiere": x["filiere"], "score": round(float(x["global_score"]), 2), "pourquoi_pas_prioritaire": why})
    return out


def _req(conds: list[str]) -> str:
    return "; ".join(dict.fromkeys(conds)) if conds else "Aucune condition specifique identifiee."


def _format_physico_chemical_context(waste: WasteInput, metrics: dict[str, Any]) -> str:
    cues: list[str] = []
    nature: list[str] = []

    if waste.categorie:
        nature.append(f"categorie {getattr(waste.categorie, 'value', waste.categorie)}")
    if waste.type_dechet:
        nature.append(f"type {getattr(waste.type_dechet, 'value', waste.type_dechet)}")
    if waste.type_plastique:
        nature.append(f"plastique {waste.type_plastique}")
    if waste.composition_textile:
        nature.append(f"composition textile {waste.composition_textile}")
    if waste.etat_textile:
        nature.append(f"etat textile {waste.etat_textile}")
    if waste.produit_principal:
        nature.append(f"produit principal {waste.produit_principal}")
    if waste.origine_flux:
        nature.append(f"origine {waste.origine_flux}")

    pci = metrics.get("pci_mj_kg")
    lignine = metrics.get("taux_lignine_pct")
    dbo = metrics.get("dbo_mg_l")
    dco = metrics.get("dco_mg_l")
    contamination = waste.taux_contamination_pct if waste.taux_contamination_pct is not None else metrics.get("metaux_pct")
    humidity_pct = _effective_humidity_pct(waste, metrics)

    if pci is not None:
        cues.append(f"PCI estime a {float(pci):.1f} MJ/kg, ce qui oriente plutot vers une voie energetique ou de revalorisation thermique")
    if lignine is not None:
        cues.append(f"taux de lignine de {float(lignine):.1f}% compatible avec une stabilisation matiere ou biochar selon l'humidite")
    if dbo is not None and dco is not None:
        cues.append(f"charge organique mesuree via DBO {float(dbo):.0f} mg/L et DCO {float(dco):.0f} mg/L, utile pour arbitrer vers methanisation ou traitement biologique")
    if humidity_pct is not None:
        cues.append(f"humidite mesuree a {float(humidity_pct):.1f}% qui oriente la preparation (sechage, drainage, broyage ou digestion selon la filiere)")
    if contamination is not None:
        cues.append(f"taux de contamination estime a {float(contamination):.1f}% qui penalise les voies exigeant une matiere tres propre")
    if waste.presence_chlore:
        cues.append("presence de chlore qui limite les voies thermiques sans traitement des emissions")
    if waste.presence_metaux_lourds or waste.contient_metaux:
        cues.append("presence de metaux qui favorise une recuperation metallique ou une securisation avant toute autre filiere")
    if waste.presence_metaux_lourds is False and waste.contient_metaux is False and not cues:
        cues.append("absence d'indicateur de contamination critique, ce qui laisse ouvertes les voies de recyclage ou de reemploi si la qualite du lot le permet")

    nature_txt = ", ".join(nature) if nature else "nature du flux partiellement renseignee"
    cues_txt = "; ".join(cues) if cues else "donnees physico-chimiques partielles, analyse basee surtout sur la nature du dechet et les contraintes reglementaires"
    return f"Le choix technique part de la nature du flux ({nature_txt}) et de ses signaux physico-chimiques: {cues_txt}."




def _process_engineering_notes(waste: WasteInput, chosen: dict[str, Any], metrics: dict[str, Any]) -> str:
    filiere = str(chosen.get('filiere') or '').lower()
    pretreatment: list[str] = []
    hse: list[str] = []
    yield_note = ''

    contamination = float(waste.taux_contamination_pct or 0.0)
    humidity_pct = _effective_humidity_pct(waste, metrics)
    pci = metrics.get('pci_mj_kg')
    dbo = metrics.get('dbo_mg_l')
    dco = metrics.get('dco_mg_l')
    lignine = metrics.get('taux_lignine_pct')

    if filiere in {'methanisation_biogaz', 'compostage'}:
        pretreatment += ['tri des indesirables', 'homogeneisation du lot']
        if contamination > 10:
            pretreatment.append('depottage / lavage / dedensification si necessaire')
        if humidity_pct is not None and humidity_pct > 75:
            pretreatment.append('gestion des lixiviats et drainage')
        if dbo is not None and dco is not None:
            pretreatment.append('controle DBO/DCO avant envoi en filiere biologique')
        hse.append('maitrise des odeurs, lixiviats et risques biologiques')
        yield_note = 'Rendement attendu plus stable lorsque le lot est homogene et peu contamine; une humidite elevee favorise les voies biologiques mais impose souvent drainage, homogenisation et eventuel co-substrat.'
    elif filiere in {'recyclage_mecanique_plastique', 'tri_preparation_matiere', 'recyclage_papetier', 'reemploi_carton_emballage'}:
        pretreatment += ['tri fin', 'deferrage si besoin', 'controle humidite et corps etrangers']
        if contamination > 15 or (humidity_pct is not None and humidity_pct > 40):
            pretreatment.append('lavage ou re-tri avant extrusion/recyclage')
        hse.append('poussieres, bruit, manutention et risques de coupes')
        yield_note = 'Le rendement matiere depend surtout de la purete du flux, de la stabilite de composition et de l humidite; plus la contamination ou l humidite montent, plus le taux de rebuts augmente.'
    elif filiere in {'pyrolyse_plastique', 'combustion_gazeification', 'co_incineration_cimenterie', 'combustible_solide_recupere'}:
        pretreatment += ['broyage', 'sechage', 'homogeneisation PCI']
        if humidity_pct is not None and humidity_pct > 40:
            pretreatment.append('sechage additionnel')
        if waste.presence_chlore:
            pretreatment.append('dechloration / exclusion si PVC dominant')
        if waste.presence_metaux_lourds or waste.contient_metaux:
            pretreatment.append('controle metaux et cendres')
        hse.append('controle emissions, HCl/dioxines, filtration et autorisations d installation')
        yield_note = 'La performance depend du PCI, de l humidite et du taux de chlore; au-dessus des seuils critiques, la voie thermique perd en robustesse.'
    elif filiere in {'refonte_metaux', 'vente_ferrailleur_certifie'}:
        pretreatment += ['tri metallique', 'segregation des alliages', 'decontamination superficielle']
        if humidity_pct is not None and humidity_pct > 60:
            pretreatment.append('sechage avant refonte pour limiter pertes et corrosion')
        hse.append('gestion des copeaux, huiles et poussieres metalliques')
        yield_note = 'Le rendement economique est surtout lie au taux de recuperation metallique et au niveau de contamination residuelle.'
    else:
        pretreatment += ['tri initial', 'controle qualite', 'conditionnement du lot']
        hse.append('mesures standard de manutention et tracabilite')
        yield_note = 'Le rendement est estime de maniere prudente faute de donnees de conversion detaillees.'

    if waste.niveau_danger in {'eleve', 'critique'}:
        hse.append('procedure renforcee de confinement et EPI')
    if pci is not None and pci < 8:
        hse.append('PCI faible: voie energetique peu robuste sans pretraitement')
    if humidity_pct is not None and humidity_pct > 70:
        hse.append('humidite elevee: attention aux lixiviats, a la stabilite de stockage et au transport')
    if humidity_pct is not None and humidity_pct < 25:
        hse.append('flux sec: risque poussiere et auto-echauffement pour certaines filieres')
    if lignine is not None and lignine >= 25:
        pretreatment.append('valoriser la fraction lignocellulosique pour limiter la combustion brute')

    pretreatment_txt = ', '.join(dict.fromkeys(pretreatment)) if pretreatment else 'aucun pretraitement specifique identifie'
    hse_txt = ', '.join(dict.fromkeys(hse)) if hse else 'mesures HSE standard'
    return f"Pretraitement recommande: {pretreatment_txt}. HSE: {hse_txt}. {yield_note}"


def _build_explication_paragraphs(
    waste: WasteInput,
    metrics: dict[str, Any],
    chosen: dict[str, Any],
    alternatives: list[dict[str, Any]],
    regulatory: dict[str, Any],
    reg_refs: list[str],
    hierarchy_reasons: list[str],
) -> str:
    physico = _format_physico_chemical_context(waste, metrics)
    process = _process_engineering_notes(waste, chosen, metrics)
    p1 = (
        f"La filiere retenue est {chosen.get('filiere')} avec un score global de {float(chosen.get('global_score', 0.0)):.1f}/100. "
        f"Elle a ete choisie parce que le profil technique ({float(chosen.get('technical_score', 0.0)):.1f}/100), "
        f"economique ({float(chosen.get('economic_score', 0.0)):.1f}/100) et environnemental ({float(chosen.get('environmental_score', 0.0)):.1f}/100) "
        f"reste meilleur que les autres voies compatibles. {physico} {process} {' '.join(hierarchy_reasons)}"
    )

    alt_desc: list[str] = []
    for alt in alternatives[:3]:
        alt_desc.append(
            f"{alt.get('filiere')} ({float(alt.get('score', 0.0)):.1f}/100, {alt.get('pourquoi_pas_prioritaire') or 'moins favorable'})"
        )
    if alt_desc:
        p2_prefix = "Les alternatives examinees sont: " + "; ".join(alt_desc) + "."
    else:
        p2_prefix = "Aucune alternative robuste n'a ete gardee au-dessus des seuils de faisabilite."

    co2 = float(chosen.get("co2_avoided_kg", 0.0))
    cost = float(chosen.get("treatment_cost_fcfa", 0.0))
    market = float(chosen.get("market_value_fcfa", 0.0))
    gain = float(chosen.get("gain_industriel_fcfa", market - cost))
    gain_pt = float(chosen.get("gain_industriel_fcfa_tonne", (float(chosen.get("market_value_fcfa_tonne", 0.0)) - float(chosen.get("treatment_cost_fcfa_tonne", 0.0)))))
    roi = float(chosen.get("roi", 0.0))
    p2 = (
        f"{p2_prefix} Le gain environnemental associe a la voie retenue est estime a {co2:.1f} kgCO2e evites par tonne. "
        f"Le cout de traitement est estime a {cost:.0f} FCFA pour le lot, pour une valeur de marche d'environ {market:.0f} FCFA et un gain industriel brut de {gain:.0f} FCFA sur le lot (soit {gain_pt:.0f} FCFA/t). "
        f"Le ROI estime est de {roi:.2f}, avant prise en compte des frais de collecte, transport, fiscalite et CAPEX. Le seuil de rentabilite est franchi des que la marge industrielle brute devient positive et que la voie reste exploitable regulierement."
    )

    has_bamako_ref = any('bamako' in _n(ref) for ref in reg_refs)
    reg_status = str(regulatory.get('status', 'unknown'))
    reg_risk = float(regulatory.get('risk_score') or 0.0)
    reg_warnings = regulatory.get('warnings') or []
    warning_txt = f" Les alertes principales sont: {'; '.join(str(w) for w in reg_warnings[:2])}." if reg_warnings else ""
    p3 = (
        f"Le filtre reglementaire CEDEAO/Bamako a ete applique avant validation finale: transport, stockage, tracabilite, autorisations locales et gestion des flux dangereux "
        f"sont verifiees pour eviter toute voie non conforme. La Convention de Bamako est {'referencee explicitement' if has_bamako_ref else 'verifiee dans le corpus de references disponible'} "
        f"pour les restrictions sur les transferts transfrontaliers de dechets dangereux. Statut de conformite: {reg_status}, risque reglementaire {reg_risk:.1f}/100.{warning_txt}"
    )

    return "\n\n".join([p1, p2, p3])


def _llm_enrichment(waste: WasteInput) -> str | None:
    system_prompt = "Expert dechets Benin. Analyse uniquement a partir des donnees fournies. Retourne du JSON valide uniquement."
    prompt = (
        "Expert dechets Benin. Analyse ce dechet.\n"
        f"Nom: {waste.nom}, Categorie: {waste.categorie}\n"
        f"Type: {waste.type_dechet}, Quantite: {waste.quantite_kg}kg\n\n"
        "Retourne JSON uniquement:\n"
        "{\n"
        "  \"decision\": \"recyclage|valorisation|elimination\",\n"
        "  \"score\": 0-100,\n"
        "  \"confiance\": \"haute|moyenne|faible\",\n"
        "  \"resume\": \"2 phrases max\",\n"
        "  \"valorisation\": \"methode recommandee\",\n"
        "  \"valeur_fcfa\": 0,\n"
        "  \"acheteurs\": [\"acheteur1\", \"acheteur2\"],\n"
        "  \"co2_evite\": 0\n"
        "}"
    )
    return chat_completion_text(
        system_prompt=system_prompt,
        user_prompt=prompt,
        model=os.getenv("OPENAI_MODEL", "gpt-5.4"),
        max_tokens=500,
        temperature=0.1,
        timeout_s=35,
    )


def analyser_dechet(waste: WasteInput) -> DecisionResult:
    effective_waste, wt, profile_assumptions = _infer_effective_profile(waste)
    litterature_defaults, litterature_source, litterature_id, litterature_refs, _ = infer_literature_defaults(effective_waste.nom, effective_waste.description)

    metrics, assumptions, missing_critical = _metrics(effective_waste, wt)
    if profile_assumptions:
        assumptions.extend(profile_assumptions)
    refs_appliquees: dict[str, float | str] = {}
    for f in ["pci_mj_kg", "taux_lignine_pct", "dbo_mg_l", "dco_mg_l"]:
        if getattr(effective_waste, f, None) is None and litterature_defaults.get(f) is not None:
            metrics[f] = float(litterature_defaults[f])
            refs_appliquees[f] = metrics[f]

    candidates, warnings = _build_candidates(effective_waste, wt, metrics)
    ml_explain = explain_ml_adjustments(effective_waste, lookback_limit=1200)
    combined_deltas = ml_explain.get("combined_deltas", {}) if isinstance(ml_explain, dict) else {}
    evald = _evaluate(effective_waste, candidates, effective_waste.pays_cedeao or "Benin", metrics, score_adjustments=combined_deltas)

    labels = {"reemploi": DECISION_REEMPLOI, "matiere": DECISION_MATIERE, "energetique": DECISION_ENERGIE, "vente": DECISION_VENTE}
    blocked, regulatory, reg_refs = evaluate_regulatory_compliance(effective_waste, wt.value, labels)
    evald = _apply_regulatory_priority(evald, blocked, regulatory, labels, reg_refs)
    expert_profile = _build_expert_valorization_profile(effective_waste, wt, metrics, evald, regulatory)

    chosen, hierarchy_reasons = _select(evald)
    classement_filieres = [
        {
            "id": x.get("filiere"),
            "nom": x.get("nom") or x.get("filiere"),
            "type": x.get("type"),
            "score": round(float(x.get("global_score", 0.0)), 2),
            "statut": x.get("status") or ("Recommand?" if x.get("feasible", True) and float(x.get("global_score", 0.0)) >= 70 else "Peu pertinent" if x.get("feasible", True) else "Non compatible techniquement"),
            "compatible": bool(x.get("feasible", True)),
            "raison": x.get("technical_reason"),
            "contraintes": x.get("contraintes") or [],
            "blocked_reason": x.get("blocked_reason"),
        }
        for x in sorted(evald, key=lambda z: float(z.get("global_score", 0.0)), reverse=True)
    ]
    alternatives = _alternatives(chosen, evald)

    has_bamako_ref = any("bamako" in _n(ref) for ref in reg_refs)
    bamako_tag = " Accord de Bamako pris en compte." if has_bamako_ref else ""

    just_tech = f"{chosen['technical_reason']} Classement generic applique sur l'ensemble des filieres candidates. {' '.join(hierarchy_reasons)}"
    just_eco = f"Valeur marche {chosen['market_value_fcfa']:.0f} FCFA, cout {chosen['treatment_cost_fcfa']:.0f} FCFA, gain industriel brut {chosen.get('gain_industriel_fcfa', chosen['market_value_fcfa'] - chosen['treatment_cost_fcfa']):.0f} FCFA, ROI={chosen['roi']:.2f}."
    just_env = f"CO2 evite estime {chosen['co2_avoided_kg']:.1f} kg/t, score env {chosen['environmental_score']}/100, score reglementaire {chosen['regulatory_score']}/100, conformite {regulatory.get('status', 'unknown')}.{bamako_tag}"
    just_social = f"Score social {chosen['social_score']}/100 (emploi local + disponibilite filiere Benin/CEDEAO)."

    if missing_critical:
        warnings.append("Donnees critiques manquantes: " + ", ".join(missing_critical))
    if assumptions:
        warnings.append("Hypotheses: " + " | ".join(assumptions[:4]))
    for rw in (regulatory.get("warnings") or []):
        warnings.append(str(rw))
    for ir in (regulatory.get("international_restrictions") or []):
        warnings.append(str(ir))
    for fr in (regulatory.get("filiere_restrictions") or []):
        warnings.append(str(fr))

    llm_text = _llm_enrichment(effective_waste)
    if not llm_text:
        warnings.append("Enrichissement IA indisponible (cle/API absente ou inaccessible).")

    score_global = _b(chosen["global_score"])
    confiance = "elevee" if score_global >= 75 else "moyenne" if score_global >= 55 else "faible"
    decision_legacy = DECISION_REEMPLOI if chosen["hierarchy"] == "reemploi" else DECISION_MATIERE if chosen["hierarchy"] == "matiere" else DECISION_ENERGIE if chosen["hierarchy"] == "energie" else DECISION_VENTE
    if chosen["hierarchy"] == "elimination":
        decision_legacy = DECISION_ELIMINATION

    impact = calculate_environmental_impact(
        waste=waste,
        waste_type_effectif=wt.value,
        decision_labels=labels,
        recommended_decision=chosen["filiere"],
    )

    explication_detaillee = _build_explication_paragraphs(effective_waste, metrics, chosen, alternatives, regulatory, reg_refs, hierarchy_reasons)

    exp_payload = {
        "decision_principale": chosen["filiere"],
        "justification_technique": just_tech,
        "justification_economique": just_eco,
        "justification_environnementale": just_env,
        "justification_sociale": just_social,
        "score_global": round(score_global, 2),
        "valeur_estimee": round(float(chosen["market_value_fcfa"]), 2),
        "valeur_estimee_fcfa_tonne": round(float(chosen.get("market_value_fcfa_tonne", 0.0)), 2),
        "gain_industriel_fcfa": round(float(chosen.get("gain_industriel_fcfa", chosen["market_value_fcfa"] - chosen["treatment_cost_fcfa"])), 2),
        "gain_industriel_fcfa_tonne": round(float(chosen.get("gain_industriel_fcfa_tonne", chosen.get("market_value_fcfa_tonne", 0.0) - chosen.get("treatment_cost_fcfa_tonne", 0.0))), 2),
        "alternatives": alternatives,
        "conditions_requises": _req(chosen.get("conditions", [])),
        "avertissements": " | ".join(warnings) if warnings else "Aucun avertissement majeur.",
        "donnees_manquantes_critiques": missing_critical,
        "hypotheses_utilisees": assumptions,
        "references_reglementaires": reg_refs,
        "ajustements_ml": ml_explain,
        "profil_valorisation_expert": expert_profile,
        "explication_detaillee": explication_detaillee,
        "details_scoring": {
            "technique": round(float(chosen["technical_score"]), 2),
            "economique": round(float(chosen["economic_score"]), 2),
            "environnement": round(float(chosen["environmental_score"]), 2),
            "social": round(float(chosen["social_score"]), 2),
            "reglementaire": round(float(chosen["regulatory_score"]), 2),
            "ponderations": {
              "technique": WEIGHT_TECH,
              "economique": WEIGHT_ECO,
              "environnement": WEIGHT_ENV,
              "social": WEIGHT_SOCIAL,
              "reglementaire": WEIGHT_REG,
            },
        },
    }
    if llm_text:
        exp_payload["enrichissement_ia"] = llm_text

    try:
        append_decision_history({
            "timestamp": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat().replace("+00:00", "Z"),
            "waste_name": effective_waste.nom,
            "country": effective_waste.pays_cedeao,
            "decision_principale": chosen["filiere"],
            "score_global": round(score_global, 2),
            "classement_filieres": classement_filieres[:5],
            "alternatives": alternatives,
            "conformite_reglementaire": regulatory,
        })
    except Exception:
        pass

    return DecisionResult(
        decision=decision_legacy,
        score=round(score_global, 2),
        confiance=confiance,
        explication=explication_detaillee,
        explication_detaillee=explication_detaillee,
        resume_choix=f"Filiere retenue: {chosen['filiere']} ({chosen['hierarchy']}) avec score {score_global:.1f}/100.",
        details_scores={
            "technique": round(float(chosen["technical_score"]), 2),
            "economique": round(float(chosen["economic_score"]), 2),
            "environnement": round(float(chosen["environmental_score"]), 2),
            "social": round(float(chosen["social_score"]), 2),
            "reglementaire": round(float(chosen["regulatory_score"]), 2),
        },
        details_scores_bruts={
            "global": round(float(chosen["global_score"]), 2),
            "market_value_fcfa": round(float(chosen["market_value_fcfa"]), 2),
            "market_value_fcfa_tonne": round(float(chosen.get("market_value_fcfa_tonne", 0.0)), 2),
            "treatment_cost_fcfa": round(float(chosen["treatment_cost_fcfa"]), 2),
            "treatment_cost_fcfa_tonne": round(float(chosen.get("treatment_cost_fcfa_tonne", 0.0)), 2),
            "gain_industriel_fcfa": round(float(chosen.get("gain_industriel_fcfa", chosen["market_value_fcfa"] - chosen["treatment_cost_fcfa"])), 2),
            "gain_industriel_fcfa_tonne": round(float(chosen.get("gain_industriel_fcfa_tonne", chosen.get("market_value_fcfa_tonne", 0.0) - chosen.get("treatment_cost_fcfa_tonne", 0.0))), 2),
            "roi": round(float(chosen["roi"]), 4),
        },
        detail_scoring={
            "technique": [{"points": round(chosen["technical_score"], 2), "regle": chosen["technical_reason"]}],
            "economique": [{"points": round(chosen["economic_score"], 2), "regle": f"ROI={chosen['roi']:.2f}"}],
            "environnement": [{"points": round(chosen["environmental_score"], 2), "regle": f"CO2={chosen['co2_avoided_kg']:.1f} kg/t"}],
            "social": [{"points": round(chosen["social_score"], 2), "regle": "emplois + disponibilite locale"}],
            "reglementaire": [{"points": round(chosen["regulatory_score"], 2), "regle": f"status={regulatory.get('status','unknown')} | risk={regulatory.get('risk_score',0)}"}],
            "learning_ml": [{"points": 0.0, "regle": json.dumps(ml_explain, ensure_ascii=False)}],
        },
        facteurs_cles=hierarchy_reasons,
        contraintes_appliquees=chosen.get("conditions", []),
        options_bloquees=[x.get("blocked_reason") for x in evald if x.get("blocked_reason")],
        valeurs_reference_appliquees=refs_appliquees,
        conformite_reglementaire=regulatory,
        impact_environnemental=impact,
        reference_litterature=(f"{litterature_id or 'ref'} - {litterature_source or 'litterature'}" if refs_appliquees else None),
        references_bibliographiques=litterature_refs or [],
        references_reglementaires=reg_refs,
        valeur_estimee=round(float(chosen["market_value_fcfa"]), 2),
        valeur_estimee_fcfa_tonne=round(float(chosen.get("market_value_fcfa_tonne", 0.0)), 2),
        co2_evite_estime_kg=round(float(chosen["co2_avoided_kg"]), 2),
        cout_estime_fcfa_tonne=round(float(chosen["treatment_cost_fcfa"]), 2),
        gain_industriel_fcfa=round(float(chosen.get("gain_industriel_fcfa", chosen["market_value_fcfa"] - chosen["treatment_cost_fcfa"])), 2),
        gain_industriel_fcfa_tonne=round(float(chosen.get("gain_industriel_fcfa_tonne", chosen.get("market_value_fcfa_tonne", 0.0) - chosen.get("treatment_cost_fcfa_tonne", 0.0))), 2),
        options_alternatives=[f"{a['filiere']} ({a['score']})" for a in alternatives],
        decision_principale=chosen["filiere"],
        justification_technique=just_tech,
        justification_economique=just_eco,
        justification_environnementale=just_env,
        justification_sociale=just_social,
        score_global=round(score_global, 2),
        alternatives=alternatives,
        classement_filieres=classement_filieres,
        conditions_requises=_req(chosen.get("conditions", [])),
        avertissements=(" | ".join(warnings) if warnings else "Aucun avertissement majeur."),
        donnees_manquantes_critiques=missing_critical,
        hypotheses_utilisees=assumptions,
    )

def explain_ml_adjustments(waste: WasteInput, lookback_limit: int = 1200) -> dict[str, Any]:
    effective_waste, wt, _ = _infer_effective_profile(waste)
    decision_labels = [DECISION_REEMPLOI, DECISION_MATIERE, DECISION_ENERGIE, DECISION_VENTE]

    learning = get_learning_adjustments(
        waste_type=wt.value,
        country=effective_waste.pays_cedeao,
        decision_labels=decision_labels,
    )

    ml = get_ml_score_adjustments(
        waste_type=wt.value,
        country=effective_waste.pays_cedeao,
        quantity_kg=float(effective_waste.quantite_kg),
        decision_labels=decision_labels,
        lookback_limit=max(50, min(5000, int(lookback_limit))),
    )

    return {
        "waste_type_effectif": wt.value,
        "country": effective_waste.pays_cedeao,
        "quantity_kg": float(effective_waste.quantite_kg),
        "decision_labels": decision_labels,
        "learning_adjustments": learning,
        "ml_adjustments": ml,
        "combined_deltas": {
            label: round(float((learning.get("deltas", {}) or {}).get(label, 0.0)) + float((ml.get("deltas", {}) or {}).get(label, 0.0)), 2)
            for label in decision_labels
        },
    }



























# ----------------------------------------------------------------------------
# Generic valorization engine (registry-driven, extensible)
# ----------------------------------------------------------------------------


def _generic_hierarchy(kind: str) -> str:
    mapping = {
        "reemploi": "reemploi",
        "matiere": "matiere",
        "biologique": "energie",
        "thermique": "energie",
        "chimique": "matiere",
        "vente": "vente",
    }
    return mapping.get(str(kind or "").lower(), "matiere")


def _generic_profile(w: WasteInput, m: dict[str, float]) -> dict[str, Any]:
    contamination = float(w.taux_contamination_pct if w.taux_contamination_pct is not None else m.get("metaux_pct", 0.0) or 0.0)
    humidity = float(m.get("humidite_pct", max(0.0, 100.0 - float(m.get("siccite_pct", 0.0) or 0.0))) or 0.0)
    return {
        "pci_mj_kg": float(m.get("pci_mj_kg", 0.0) or 0.0),
        "dbo_mg_l": float(m.get("dbo_mg_l", 0.0) or 0.0),
        "dco_mg_l": float(m.get("dco_mg_l", 0.0) or 0.0),
        "taux_lignine_pct": float(m.get("taux_lignine_pct", 0.0) or 0.0),
        "humidite_pct": humidity,
        "siccite_pct": float(m.get("siccite_pct", max(0.0, 100.0 - humidity)) or 0.0),
        "contamination_pct": max(0.0, contamination),
        "metaux_pct": float(m.get("metaux_pct", 0.0) or 0.0),
        "presence_chlore": bool(w.presence_chlore),
        "presence_metaux_lourds": bool(w.presence_metaux_lourds),
        "contient_metaux": bool(w.contient_metaux),
        "danger_level": str(getattr(w.niveau_danger, "value", w.niveau_danger) or "faible"),
        "categorie": str(getattr(w.categorie, "value", w.categorie) or "autre"),
        "type_dechet": str(getattr(w.type_dechet, "value", w.type_dechet) or "autre"),
        "cimenterie_autorisee": bool(w.filiere_cimenterie_autorisee),
    }


def _build_candidates(w: WasteInput, wt: WasteType, m: dict[str, float]) -> tuple[list[dict[str, Any]], list[str]]:
    profile = _generic_profile(w, m)
    c: list[dict[str, Any]] = []
    warnings: list[str] = []

    for filiere in get_valorization_filieres():
        scored = dict(evaluate_valorization_filiere(filiere, profile))
        score = float(scored.get("technical_score", 0.0))
        feasible = bool(scored.get("feasible", True))
        blocked_reason = scored.get("blocked_reason")
        external_block = bool(scored.get("external_block", False))
        if filiere.get("contraintes", {}).get("necessite_cimenterie") and not profile.get("cimenterie_autorisee"):
            feasible = False
            external_block = True
            blocked_reason = blocked_reason or "pas de cimenterie autorisee"
        status = scored.get("status") or ("Non disponible" if external_block else ("Recommande" if feasible and score >= 70 else "Non pertinent" if feasible else "Non disponible"))
        if external_block:
            status = "Non disponible (pas de cimenterie autorisee)"
        elif str(status).lower() == "recommande":
            status = "Recommande"
        elif str(status).lower() == "non pertinent":
            status = "Non pertinent"
        elif str(status).lower() == "non disponible":
            status = "Non disponible (pas de cimenterie autorisee)"
        c.append({
            "filiere": filiere["id"],
            "nom": filiere["nom"],
            "type": filiere["type"],
            "hierarchy": _generic_hierarchy(filiere["type"]),
            "technical_score": _b(score),
            "technical_reason": str(scored.get("technical_reason") or "Scoring modulaire applique."),
            "conditions": list(scored.get("conditions") or []),
            "poids": float(scored.get("poids") or 1.0),
            "explication_automatique": str(scored.get("explication_automatique") or scored.get("technical_reason") or "Scoring modulaire applique."),
            "score_brut": float(scored.get("score_brut") or score),
            "feasible": feasible,
            "blocked_reason": blocked_reason,
            "status": status,
            "external_block": external_block,
            "contraintes": dict(filiere.get("contraintes") or {}),
            "economics": dict(filiere.get("economics") or {}),
        })

    return c, warnings


def _evaluate(
    w: WasteInput,
    candidates: list[dict[str, Any]],
    country: str | None,
    metrics: dict[str, float],
    score_adjustments: dict[str, float] | None = None,
) -> list[dict[str, Any]]:
    qt = max(0.01, float(w.quantite_kg) / 1000.0)
    out: list[dict[str, Any]] = []
    profile = _generic_profile(w, metrics)
    for c in candidates:
        economics = c.get("economics") or {}
        value_pt = float(economics.get("market_value_fcfa_tonne", 90000.0))
        cost_pt = float(economics.get("treatment_cost_fcfa_tonne", 70000.0))
        co2_pt = float(economics.get("co2_avoided_kg_tonne", 120.0))
        social_base = float(economics.get("social_score", 55.0))

        if _n(country) == "benin":
            value_pt *= 1.03
            cost_pt *= 0.97

        value = value_pt * qt
        treat = cost_pt * qt
        roi = (value - treat) / treat if treat > 1e-6 else 0.0
        eco = _b(50.0 + roi * 55.0)
        env = _b(50.0 + co2_pt / 12.0 - (8.0 if profile["humidite_pct"] > 70.0 and c["hierarchy"] == "energie" else 0.0))
        social = _b(social_base + (5.0 if _n(country) == "benin" else 0.0))
        tech = c["technical_score"] if c.get("feasible", True) else max(5.0, c["technical_score"] - 40.0)
        tech = _b(tech)
        g = _b(WEIGHT_TECH * tech + WEIGHT_ECO * eco + WEIGHT_ENV * env + WEIGHT_SOCIAL * social)

        x = dict(c)
        x.update({
            "economic_score": round(eco, 2),
            "environmental_score": round(env, 2),
            "social_score": round(social, 2),
            "regulatory_score": 0.0,
            "global_score": round(g, 2),
            "market_value_fcfa": round(value, 2),
            "market_value_fcfa_tonne": round(value_pt, 2),
            "treatment_cost_fcfa": round(treat, 2),
            "treatment_cost_fcfa_tonne": round(cost_pt, 2),
            "gain_industriel_fcfa": round(value - treat, 2),
            "gain_industriel_fcfa_tonne": round(value_pt - cost_pt, 2),
            "roi": round(roi, 4),
            "co2_avoided_kg": round(co2_pt * qt, 2),
        })
        out.append(x)

    if score_adjustments is None:
        score_adjustments = {DECISION_REEMPLOI: 0.0, DECISION_MATIERE: 0.0, DECISION_ENERGIE: 0.0, DECISION_VENTE: 0.0}
    for x in out:
        key = x.get("hierarchy") or "matiere"
        x["global_score"] = _b(float(x["global_score"]) + float(score_adjustments.get({"reemploi": DECISION_REEMPLOI, "matiere": DECISION_MATIERE, "energie": DECISION_ENERGIE, "vente": DECISION_VENTE}.get(key, DECISION_MATIERE), 0.0)))
    return out


def _select(evald: list[dict[str, Any]]) -> tuple[dict[str, Any], list[str]]:
    reasons: list[str] = []
    feasible = [x for x in evald if x.get("feasible", True)]
    if feasible:
        chosen = sorted(feasible, key=lambda z: (float(z.get("global_score", 0.0)), float(z.get("technical_score", 0.0))), reverse=True)[0]
        reasons.append("Choix base sur le meilleur score global parmi les filieres compatibles.")
        return chosen, reasons
    chosen = sorted(evald, key=lambda z: (float(z.get("global_score", 0.0)), float(z.get("technical_score", 0.0))), reverse=True)[0]
    reasons.append("Aucune filiere pleinement compatible: meilleure option restante conservee comme reference.")
    return chosen, reasons


def _alternatives(chosen: dict[str, Any], evald: list[dict[str, Any]]) -> list[dict[str, Any]]:
    order = sorted([x for x in evald if x.get("filiere") != chosen.get("filiere")], key=lambda z: float(z.get("global_score", 0.0)), reverse=True)
    out: list[dict[str, Any]] = []
    for x in order[:3]:
        why = str(x.get("blocked_reason") or "Score global inferieur a la filiere principale.")
        out.append({"filiere": x["filiere"], "nom": x.get("nom") or x["filiere"], "score": round(float(x.get("global_score", 0.0)), 2), "statut": x.get("status") or "Peu pertinent", "pourquoi_pas_prioritaire": why})
    return out
