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
    "biochar": 310000,
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
    "biochar": 105000,
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
    "biochar": 490,
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
    "biochar": 76,
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
    "biochar": 7,
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
    high = {"biochar", "methanisation_biogaz", "biodiesel_combustible", "regeneration_huiles", "neutralisation_chimique", "refonte_metaux", "recyclage_mecanique_plastique", "charbon_actif", "recyclage_papetier", "pyrolyse_plastique", "farines_animales_engrais"}
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
        material = analyzeMaterialProperties(w, metrics)
        material_reliable = bool(material.get("reliable"))
        material_lignine = float(material.get("lignine_pct") or 0.0)
        material_humidity = float(material.get("humidity_pct") or 0.0)
        material_biodeg = str(material.get("biodegradability") or "unknown")
        material_ligno = bool(material.get("lignocellulosic"))
        if c["filiere"] == "biochar":
            if float(metrics.get("taux_lignine_pct", 0.0) or 0.0) >= 20 and humidity_pct <= 25.0 and pci >= 15.0:
                tech += 18.0
            elif float(metrics.get("taux_lignine_pct", 0.0) or 0.0) >= 15 and humidity_pct <= 30.0:
                tech += 10.0
        if c["filiere"] == "methanisation_biogaz":
            if dbo >= 1200 and dco_dbo <= 3.5:
                tech += 18.0
            elif dbo >= 800 and dco_dbo <= 4.5:
                tech += 10.0
            elif dbo < 500:
                tech -= 20.0
        if c["filiere"] == "compostage":
            if 45.0 <= humidity_pct <= 70.0 and dco_dbo <= 4.5:
                tech += 12.0
            elif humidity_pct < 30.0:
                tech -= 6.0
        if c["filiere"] == "charbon_actif":
            if float(metrics.get("taux_lignine_pct", 0.0) or 0.0) >= 25 and humidity_pct <= 25.0:
                tech += 12.0
            elif float(metrics.get("taux_lignine_pct", 0.0) or 0.0) >= 15 and humidity_pct <= 30.0:
                tech += 5.0

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

        if material_reliable:
            if c["filiere"] == "methanisation_biogaz":
                if material_ligno and material_lignine > 20:
                    tech -= 35.0
                if material_biodeg == "low":
                    tech -= 20.0
                elif material_biodeg == "high" and material_humidity > 50:
                    tech += 10.0
            if c["filiere"] == "compostage":
                if material_ligno and material_lignine > 20:
                    tech -= 25.0
                if material_biodeg == "high" and 40 <= material_humidity <= 70:
                    tech += 10.0
                if material_biodeg == "low":
                    tech -= 15.0
            if c["filiere"] == "biochar":
                if material_lignine > 20:
                    tech += 15.0
                if material_humidity <= 25.0:
                    tech += 10.0
            if c["hierarchy"] == "energie":
                if pci > 12:
                    tech += 10.0
                if material_humidity < 20.0:
                    tech += 8.0

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
def _route_status_label(route: dict[str, Any], chosen: dict[str, Any]) -> str:
    if route.get("filiere") == chosen.get("filiere"):
        return "Recommandee" if route.get("feasible", True) else "Recommandee sous conditions"
    if not route.get("feasible", True):
        return "Non conforme"
    score = float(route.get("global_score", 0.0))
    if score >= 70.0:
        return "Alternative recommandee"
    if score >= 55.0:
        return "Alternative"
    return "Pertinence faible"


def _alternatives(chosen: dict[str, Any], evald: list[dict[str, Any]]) -> list[dict[str, Any]]:
    order = sorted([x for x in evald if x["filiere"] != chosen["filiere"]], key=lambda z: z["global_score"], reverse=True)
    out: list[dict[str, Any]] = []
    for x in order[:4]:
        why = "Score global inferieur a la filiere principale."
        if chosen["hierarchy"] != x["hierarchy"] and chosen["hierarchy"] in {"matiere", "energie"}:
            why = f"Moins prioritaire dans la hierarchie ({x['hierarchy']} apres {chosen['hierarchy']})."
        if not x.get("feasible", True):
            why = x.get("blocked_reason") or "Non faisable techniquement/reglementairement."
        out.append({"filiere": x["filiere"], "score": round(float(x["global_score"]), 2), "statut": _route_status_label(x, chosen), "pourquoi_pas_prioritaire": why, "blocked": not x.get("feasible", True), "blocked_reason": x.get("blocked_reason")})
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
    if _is_abattoir_waste(waste):
        cues.append("flux d'abattoir interprete comme flux organique humide a forte charge biodegradables, donc prioritairement oriente vers methanisation ou compostage apres hygienisation")
    if getattr(waste.categorie, 'value', waste.categorie) == WasteCategory.PLASTIC.value or waste.type_dechet == WasteType.PLASTIQUE:
        cues.append("flux plastique: le recyclage mecanique domine si le lot est propre; le chlore ou la contamination poussent vers une autre voie")
    if waste.type_dechet == WasteType.TEXTILE:
        cues.append("flux textile: le reemploi ou l'effilochage sont favorises si le lot est propre, homogene et reutilisable")
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
    elif filiere in {'recyclage_matiere', 'reemploi'}:
        pretreatment += ['tri fin', 'controle qualite', 'conditionnement du lot']
        if filiere == 'recyclage_matiere':
            if contamination > 15 or (humidity_pct is not None and humidity_pct > 40):
                pretreatment.append('lavage ou re-tri avant recyclage')
            yield_note = 'Le rendement matiere depend surtout de la purete du flux, de la stabilite de composition et de l humidite; plus la contamination ou l humidite montent, plus le taux de rebuts augmente.'
        else:
            if contamination > 15:
                pretreatment.append('reparation ou reconditionnement avant reemploi')
            yield_note = 'Le reemploi reste pertinent seulement pour un lot propre, homogene et visuellement acceptable; la contamination ou l usure degradent rapidement la valeur.'
        hse.append('poussieres, manutention, hygiene et integrite du lot')
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
    elif filiere == 'neutralisation_chimique':
        pretreatment += ['identification des reactifs', 'neutralisation controlee', 'gestion des effluents']
        hse.append('protocole chimique renforce et confinement')
        yield_note = 'La neutralisation chimique est reservee aux flux reactifs ou incompatibles avec les autres filieres.'
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
    routes: list[dict[str, Any]],
    regulatory: dict[str, Any],
    reg_refs: list[str],
    hierarchy_reasons: list[str],
) -> str:
    physico = _format_physico_chemical_context(waste, metrics)
    process = _process_engineering_notes(waste, chosen, metrics)
    top_routes = sorted(routes, key=lambda z: float(z.get("global_score", 0.0)), reverse=True)[:3]

    route_lines: list[str] = []
    for idx, route in enumerate(top_routes, start=1):
        route_lines.append(
            f"{idx}. {route.get('filiere')}: {route.get('technical_reason') or route.get('blocked_reason') or route.get('explication') or 'Aucune justification detaillee disponible.'}"
        )

    p1 = (
        f"1) Lecture technique. Filiere retenue est {chosen.get('filiere')}. Elle est coherente avec le profil du flux: {physico} {process} "
        f"La selection repose sur la nature physico-chimique du lot, la stabilite d'exploitation et la compatibilite avec les contraintes de traitement."
    )

    p2 = (
        "2) Comparison des voies. Alternatives examinees: "
        + (" ".join(route_lines) if route_lines else "Aucune alternative exploitable n'a pu etre maintenue.")
        + " La presence de trois voies permet de comparer la robustesse technique plutot que de forcer un choix unique trop tot."
    )

    cost = float(chosen.get("treatment_cost_fcfa", 0.0))
    market = float(chosen.get("market_value_fcfa", 0.0))
    gain = float(chosen.get("gain_industriel_fcfa", market - cost))
    co2 = float(chosen.get("co2_avoided_kg", 0.0))
    reg_status = str(regulatory.get("status", "unknown"))
    reg_warnings = regulatory.get("warnings") or []
    warning_txt = f" Alertes notables: {'; '.join(str(w) for w in reg_warnings[:2])}." if reg_warnings else ""
    p3 = (
        f"3) Cout, impact et cadre reglementaire. Le cout de traitement estime est d'environ {cost:.0f} FCFA/t pour une valeur de marche de {market:.0f} FCFA/t, soit un gain industriel net de {gain:.0f} FCFA/t. "
        f"L'impact environnemental associe est d'environ {co2:.1f} kgCO2e evites par tonne sur la voie retenue. "
        f"Le filtre CEDEAO/Bamako a ete applique avant validation finale, avec un statut de conformite {reg_status}; points de vigilance: {(', '.join(str(w) for w in reg_warnings[:2]) if reg_warnings else 'aucun blocage majeur signale')}."
    )

    return "\n\n".join([p1, p2, p3])



def analyzeMaterialProperties(waste: WasteInput, metrics: dict[str, Any]) -> dict[str, Any]:
    humidity = _effective_humidity_pct(waste, metrics)
    pci = float(metrics.get("pci_mj_kg", 0.0) or 0.0)
    lignine = float(metrics.get("taux_lignine_pct", 0.0) or 0.0)

    raw_text = " ".join(
        str(part)
        for part in [
            waste.nom,
            waste.description,
            waste.produit_principal,
            waste.composition_textile,
            waste.type_plastique,
            getattr(waste.type_dechet, "value", waste.type_dechet),
            getattr(waste.categorie, "value", waste.categorie),
            waste.origine_flux,
        ]
        if part
    )
    text = _n(raw_text)

    lignocellulosic = bool(
        waste.type_dechet == WasteType.BIOMASSE_LIGNOCELLULOSIQUE
        or any(k in text for k in [
            "bagasse",
            "sciure",
            "coque",
            "palmiste",
            "noix de palme",
            "noyau de palme",
            "fibre de palm",
            "bois",
            "lignine",
            "cellulose",
            "tige",
            "raffia",
            "peau de cafe",
            "coquille",
        ])
    )
    fibrous = bool(lignocellulosic or any(k in text for k in ["fibre", "fibres", "bagasse", "coque", "noyau", "bois", "tige", "rafia", "raffia"]))
    easily_biodegradable = bool(
        _is_abattoir_waste(waste)
        or _is_organic_waste_text(waste)
        or any(k in text for k in ["boue", "dechet alimentaire", "alimentaire", "restes", "pulpe", "marc", "legume", "fruit", "dechets verts"])
    )

    if lignocellulosic and lignine == 0:
        lignine = 25.0
    if lignocellulosic and (humidity is None or humidity == 0):
        humidity = 35.0
    if lignocellulosic and pci == 0:
        pci = 15.0

    if lignocellulosic and lignine >= 20 and (humidity is not None and humidity < 40):
        biodegradability = "low"
    elif easily_biodegradable or (humidity is not None and humidity >= 50 and not lignocellulosic):
        biodegradability = "high"
    elif fibrous or pci >= 10:
        biodegradability = "medium"
    else:
        biodegradability = "unknown"

    reliable = any(v is not None for v in [humidity, pci, lignine]) or lignocellulosic or easily_biodegradable or fibrous
    cues: list[str] = []
    if humidity is not None:
        cues.append(f"humidite {humidity:.1f}%")
    if pci:
        cues.append(f"PCI {pci:.1f} MJ/kg")
    if lignine:
        cues.append(f"lignine {lignine:.1f}%")
    if lignocellulosic:
        cues.append("matrice lignocellulosique detectee")
    if fibrous and not lignocellulosic:
        cues.append("structure fibreuse detectee")
    if biodegradability == "high":
        cues.append("biodegradabilite elevee")
    elif biodegradability == "low":
        cues.append("biodegradabilite faible")
    if lignocellulosic and lignine >= 20 and humidity <= 25:
        cues.append("matrice lignocellulosique seche incompatible avec methanisation et compostage")

    return {
        "humidity_pct": humidity,
        "pci_mj_kg": pci,
        "lignine_pct": lignine,
        "lignocellulosic": lignocellulosic,
        "fibrous": fibrous,
        "biodegradability": biodegradability,
        "reliable": reliable,
        "cues": cues,
    }

def _is_dry_lignocellulosic_material(material: dict[str, Any]) -> bool:
    if not material.get("reliable"):
        return False

    lignocellulosic = bool(material.get("lignocellulosic"))
    lignine = float(material.get("lignine_pct") or 0.0)
    humidity = float(material.get("humidity_pct") or 0.0)
    pci = float(material.get("pci_mj_kg") or 0.0)

    return lignocellulosic and lignine >= 20.0 and humidity <= 25.0 and pci >= 12.0


def _biological_routes_incompatible(material: dict[str, Any]) -> bool:
    if not material.get("reliable"):
        return False
    lignocellulosic = bool(material.get("lignocellulosic"))
    lignine = float(material.get("lignine_pct") or 0.0)
    humidity = float(material.get("humidity_pct") or 0.0)
    return lignocellulosic and lignine >= 20.0 and humidity <= 25.0


def _wet_organic_stream(material: dict[str, Any], waste: WasteInput) -> bool:
    humidity = float(material.get("humidity_pct") or 0.0)
    dbo = float(material.get("dbo_mg_l") or 0.0)
    dco = float(material.get("dco_mg_l") or 0.0)
    return bool(material.get("reliable")) and (material.get("biodegradability") == "high" or _is_abattoir_waste(waste) or (humidity >= 65.0 and (dbo >= 800.0 or dco >= 1800.0)))


def _material_recommendation_scores(material: dict[str, Any]) -> list[dict[str, Any]]:
    if not material.get("reliable"):
        return []

    humidity = float(material.get("humidity_pct") or 0.0)
    pci = float(material.get("pci_mj_kg") or 0.0)
    lignine = float(material.get("lignine_pct") or 0.0)
    biodegradability = str(material.get("biodegradability") or "unknown")
    lignocellulosic = bool(material.get("lignocellulosic"))
    fibrous = bool(material.get("fibrous"))

    def build(solution: str, score: float, justification: str, conditions: list[str], delta: float | None = None) -> dict[str, Any]:
        raw_score = _b(score)
        return {
            "solution": solution,
            "score": round(raw_score, 1),
            "score_delta": round(delta if delta is not None else raw_score - 25.0, 1),
            "conditions": list(dict.fromkeys(conditions)),
            "justification": justification,
            "material_generated": True,
        }

    meth_score = 0.0
    meth_conditions: list[str] = []
    if humidity > 50:
        meth_score += 30
        meth_conditions.append("humidite elevee favorable a la digestion anaerobie")
    if lignine < 15:
        meth_score += 20
    if biodegradability == "high":
        meth_score += 30
    if lignine > 20:
        meth_score -= 50
        meth_conditions.append("lignine elevee defavorable a la methanisation")
    if humidity < 20:
        meth_score -= 30
        meth_conditions.append("faible humidite defavorable a la methanisation")
    if lignocellulosic and lignine > 20:
        meth_score -= 15
    if _biological_routes_incompatible(material):
        meth_score = 0.0
        meth_conditions.append("matrice lignocellulosique seche incompatible avec methanisation")
    elif lignocellulosic and lignine >= 20 and humidity <= 25:
        meth_score -= 30
        meth_conditions.append("matrice lignocellulosique seche defavorable a la methanisation")
    meth_just = "Recommande car flux humide et facilement biodegradable." if meth_score > 0 else "Non recommande pour methanisation: matrice lignocellulosique ou biodegradabilite insuffisante."

    comp_score = 0.0
    comp_conditions: list[str] = []
    if 40 <= humidity <= 70:
        comp_score += 30
        comp_conditions.append("humidite intermediaire favorable au compostage")
    if lignine < 25:
        comp_score += 20
    if lignine > 30:
        comp_score -= 20
        comp_conditions.append("lignine elevee defavorable au compostage")
    if fibrous:
        comp_score += 10
        comp_conditions.append("structure fibreuse utile comme structurant")
    if biodegradability == "high":
        comp_score += 10
    if lignocellulosic and lignine > 20:
        comp_score -= 20
    if _biological_routes_incompatible(material):
        comp_score = 0.0
        comp_conditions.append("matrice lignocellulosique seche incompatible avec compostage")
    elif lignocellulosic and lignine >= 20 and humidity <= 25:
        comp_score -= 25
        comp_conditions.append("lignine elevee et secheresse defavorables au compostage")
    comp_just = "Recommande car humidite et structure sont compatibles avec une stabilisation aerobie." if comp_score > 0 else "Non recommande pour compostage: fraction trop lignifiee ou trop seche."

    energy_score = 0.0
    energy_conditions: list[str] = []
    if pci > 12:
        energy_score += 40
        energy_conditions.append("PCI eleve favorable a la valorisation energetique")
    if humidity < 20:
        energy_score += 30
    if lignine > 20:
        energy_score += 20
    if lignocellulosic and lignine >= 20 and humidity <= 25:
        energy_score += 20
    if humidity > 60:
        energy_score -= 30
        energy_conditions.append("humidite elevee defavorable a la combustion/thermique")
    if biodegradability == "high" and pci < 10:
        energy_score -= 10
    energy_just = "Recommande car PCI eleve et flux sec/lignifie valorisable thermiquement." if energy_score > 0 else "Faible aptitude energetique en l'absence de PCI suffisant."

    biochar_score = 0.0
    biochar_conditions: list[str] = []
    if lignine > 20:
        biochar_score += 30
        biochar_conditions.append("lignine elevee favorable a la pyrolyse lente")
    if humidity < 15:
        biochar_score += 20
    elif humidity < 25:
        biochar_score += 10
    if lignocellulosic and lignine >= 20 and humidity <= 25:
        biochar_score += 15
    if humidity > 30:
        biochar_score -= 10
    biochar_just = "Recommande car matrice lignocellulosique adaptee au biochar." if biochar_score > 0 else "Faible aptitude au biochar en l'absence de lignine ou de secheresse suffisante."

    return [
        build("methanisation", meth_score, meth_just, meth_conditions),
        build("compostage", comp_score, comp_just, comp_conditions),
        build("valorisation energetique", energy_score, energy_just, energy_conditions),
        build("pyrolyse / biochar", biochar_score, biochar_just, biochar_conditions),
    ]


def mergeRecommendations(existing: list[dict[str, Any]], material_scores: list[dict[str, Any]], material: dict[str, Any]) -> list[dict[str, Any]]:
    if not material.get("reliable"):
        return sorted(existing, key=lambda item: float(item.get("score", 0.0)), reverse=True) or existing[:1]

    merged: dict[str, dict[str, Any]] = {}
    order: list[str] = []

    for item in existing:
        key = str(item.get("solution") or item.get("filiere") or item.get("nom") or "").strip()
        if not key:
            continue
        copy = dict(item)
        copy.setdefault("base_score", round(float(copy.get("score", 0.0)), 1))
        copy.setdefault("material_score", 0.0)
        copy.setdefault("material_delta", 0.0)
        merged[key] = copy
        order.append(key)

    for adj in material_scores:
        key = str(adj.get("solution") or "").strip()
        if not key:
            continue
        score = float(adj.get("score", 0.0))
        delta = float(adj.get("score_delta", score))
        if key in merged:
            current = merged[key]
            base = float(current.get("score", 0.0))
            current["base_score"] = round(base, 1)
            current["material_score"] = round(score, 1)
            current["material_delta"] = round(delta, 1)
            current["score"] = round(_b(base + delta), 1)
            current_conditions = list(dict.fromkeys([*(current.get("conditions") or []), *(adj.get("conditions") or [])]))
            current["conditions"] = current_conditions
            current_just = str(current.get("justification") or "").strip()
            extra_just = str(adj.get("justification") or "").strip()
            if extra_just and extra_just not in current_just:
                current["justification"] = f"{current_just} | {extra_just}".strip(" |") if current_just else extra_just
        elif score >= 35.0:
            merged[key] = {
                "solution": key,
                "score": round(score, 1),
                "base_score": 0.0,
                "material_score": round(score, 1),
                "material_delta": round(delta, 1),
                "conditions": list(dict.fromkeys(adj.get("conditions") or [])),
                "justification": str(adj.get("justification") or ""),
                "material_generated": True,
            }
            order.append(key)

    if material.get("electronic") or material.get("metals_heavy"):
        for key in {"methanisation", "compostage", "biochar", "pyrolyse / biochar", "recyclage matiere"}:
            if key in merged:
                current = merged[key]
                current["score"] = 0.0
                current["base_score"] = 0.0
                current["material_score"] = 0.0
                current["material_delta"] = 0.0
                current["conditions"] = list(dict.fromkeys([*(current.get("conditions") or []), "flux electronique ou metallique lourd a ecarter de cette voie"]))
                current["justification"] = "Flux electronique ou metallique lourd: voie ecartee au profit d'une stabilisation ou d'une securisation."

    return sorted(merged.values(), key=lambda item: float(item.get("score", 0.0)), reverse=True)
def _canonical_material_route(name: str | None) -> str:
    key = _n(str(name or ""))
    aliases = {
        "methanisation": "methanisation_biogaz",
        "methanisation biogaz": "methanisation_biogaz",
        "methanisation_biogaz": "methanisation_biogaz",
        "valorisation energetique": "valorisation_energetique",
        "valorisation_energetique": "valorisation_energetique",
        "biochar": "biochar",
        "pyrolyse / biochar": "biochar",
        "pyrolyse biochar": "biochar",
        "recyclage matiere": "recyclage_matiere",
        "recyclage_matiere": "recyclage_matiere",
        "compostage": "compostage",
        "reemploi": "reemploi",
        "elimination securisee": "elimination_securisee",
    }
    return aliases.get(key, key)


def _material_score_map(material_scores: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for item in material_scores:
        key = _canonical_material_route(str(item.get("solution") or item.get("filiere") or item.get("nom") or ""))
        if not key:
            continue
        out[key] = {
            "score": float(item.get("score", 0.0) or 0.0),
            "justification": str(item.get("justification") or ""),
            "conditions": list(item.get("conditions") or []),
        }
    return out


def _hybrid_route_score(route: dict[str, Any], material_lookup: dict[str, dict[str, Any]], material: dict[str, Any]) -> float:
    base = float(route.get("global_score", 0.0) or 0.0)
    if not material.get("reliable"):
        return base

    key = _canonical_material_route(str(route.get("filiere") or route.get("solution") or ""))
    lignine = float(material.get("lignine_pct") or 0.0)
    humidity = float(material.get("humidity_pct") or 0.0)
    pci = float(material.get("pci_mj_kg") or 0.0)
    dry_lignocellulosic = _is_dry_lignocellulosic_material(material)

    if key == "reemploi" and (material.get("lignocellulosic") or lignine > 20.0 or humidity > 45.0):
        base -= 20.0
    if key == "recyclage_matiere" and material.get("lignocellulosic"):
        base -= 18.0
    if key in {"methanisation_biogaz", "compostage"} and lignine > 20.0:
        base -= 12.0
    if dry_lignocellulosic and key in {"methanisation_biogaz", "compostage"}:
        base -= 35.0
    if key in {"valorisation_energetique", "biochar"} and (pci > 12.0 or humidity < 25.0):
        base += 8.0
    if dry_lignocellulosic and key in {"valorisation_energetique", "biochar"}:
        base += 15.0
    if material.get("type_dechet") == WasteType.HUILE_USAGEE.value and key in {"valorisation_energetique", "biochar"}:
        base += 20.0
    if material.get("category") == WasteCategory.ELECTRONIC.value and key in {"neutralisation_chimique", "elimination_securisee"}:
        base += 22.0
    if material.get("category") == WasteCategory.ELECTRONIC.value and key in {"reemploi", "recyclage_matiere", "methanisation_biogaz", "compostage"}:
        base -= 40.0

    mat = material_lookup.get(key)
    if not mat:
        return base

    material_score = float(mat.get("score", 0.0) or 0.0)
    weight = 0.35 if material.get("lignocellulosic") else 0.18

    if key in {"methanisation_biogaz", "compostage"} and lignine > 20.0:
        weight += 0.08
    if dry_lignocellulosic and key in {"methanisation_biogaz", "compostage"}:
        weight += 0.15
    if key in {"valorisation_energetique", "biochar"} and (pci > 12.0 or humidity < 25.0):
        weight += 0.05
    if dry_lignocellulosic and key in {"valorisation_energetique", "biochar"}:
        weight += 0.12

    return _b(base + (weight * (material_score - 50.0)))


def _score_generic_solutions(waste: WasteInput, metrics: dict[str, Any]) -> list[dict[str, Any]]:
    material = analyzeMaterialProperties(waste, metrics)
    humidity = float(material.get("humidity_pct") or 0.0)
    pci = float(material.get("pci_mj_kg") or 0.0)
    lignine = float(material.get("lignine_pct") or 0.0)
    biodegradability = str(material.get("biodegradability") or "unknown")
    lignocellulosic = bool(material.get("lignocellulosic"))
    fibrous = bool(material.get("fibrous"))

    dco = float(metrics.get("dco_mg_l", 0.0) or 0.0)
    dbo = float(metrics.get("dbo_mg_l", 0.0) or 0.0)
    contamination = float(waste.taux_contamination_pct or 0.0)
    has_metals = bool(waste.contient_metaux or waste.presence_metaux_lourds)
    has_chlorine = bool(waste.presence_chlore)
    metal_category = waste.categorie == WasteCategory.METAL

    dco_high = dco >= 100000 or (dco >= 1000 and dbo >= 500)
    dbo_high = dbo >= 1000 or (dco > 0 and dbo > 0 and (dco / max(dbo, 1.0)) >= 2.0)
    biodegradable = biodegradability == "high" or dco_high or dbo_high or _is_abattoir_waste(waste)
    low_organic_load = dco < 100000 and dbo < 1000
    low_pci = pci < 10
    metals_heavy = has_metals or bool(waste.presence_metaux_lourds)
    chlorine_risk = has_chlorine or _is_pvc(waste)

    def make_item(solution: str, score: float, conditions: list[str], justification: str, filiere: str) -> dict[str, Any]:
        score = _b(score)
        return {
            "solution": solution,
            "filiere": filiere,
            "score": round(score, 1),
            "base_score": round(score, 1),
            "score_delta": 0.0,
            "conditions": list(dict.fromkeys(conditions)),
            "justification": justification,
        }

    shared_conditions: list[str] = []
    if contamination > 60:
        shared_conditions.append("pretraitement requis")

    meth_conditions = list(shared_conditions)
    if metals_heavy:
        meth_conditions.append("metaux a limiter avant digestion")
    if metal_category:
        meth_conditions.append("flux metallique incompatible avec la digestion")
    if chlorine_risk:
        meth_conditions.append("chlore a verifier avant digestion")
    meth_score = 20.0
    if dco_high:
        meth_score += 50
    if dbo_high:
        meth_score += 30
    if humidity > 60:
        meth_score += 20
    if lignocellulosic and lignine > 20:
        meth_score -= 45
    if biodegradability == "high":
        meth_score += 20
    elif biodegradability == "low":
        meth_score -= 35
    if humidity < 20:
        meth_score -= 25
    if metals_heavy:
        meth_score -= 20
    if chlorine_risk:
        meth_score -= 20

    comp_conditions = list(shared_conditions)
    if metals_heavy:
        comp_conditions.append("metaux a retirer pour stabilisation biologique")
    if metal_category:
        comp_conditions.append("flux metallique incompatible avec le compostage")
    if chlorine_risk:
        comp_conditions.append("chlore a verifier avant compostage")
    comp_score = 15.0
    if biodegradable:
        comp_score += 40
    if 40 <= humidity <= 70:
        comp_score += 20
    if lignine < 25:
        comp_score += 10
    if lignine > 30:
        comp_score -= 25
    if fibrous:
        comp_score += 5
    if contamination > 70:
        comp_score -= 30
    if lignocellulosic and lignine > 20:
        comp_score -= 20
    if humidity < 20:
        comp_score -= 10
    if metals_heavy:
        comp_score -= 15
    if chlorine_risk:
        comp_score -= 10

    bio_score = 18.0
    bio_conditions = list(shared_conditions)
    bio_conditions.append("pyrolyse lente")
    if humidity > 30:
        bio_conditions.append("sechage requis avant carbonisation")
    if lignine >= 20 and humidity <= 25:
        bio_score += 45
    elif lignine >= 20 and humidity <= 30:
        bio_score += 25
    elif lignine >= 20:
        bio_score += 15
    if not biodegradable:
        bio_score -= 10
    if contamination > 70:
        bio_score -= 10
    if chlorine_risk:
        bio_score -= 20
    if metal_category:
        bio_score = 0.0
        bio_conditions.append("flux metallique incompatible avec le biochar")

    energy_conditions = list(shared_conditions)
    if chlorine_risk:
        energy_conditions.append("limitation thermique liee au chlore")
    if contamination > 60:
        energy_conditions.append("homogeneisation avant valorisation thermique")
    energy_score = 20.0
    if pci > 12:
        energy_score += 40
    if humidity < 20:
        energy_score += 30
    if lignine > 20:
        energy_score += 20
    if humidity > 60:
        energy_score -= 40
    if chlorine_risk:
        energy_score -= 20
    if contamination > 70:
        energy_score -= 10

    mater_conditions = list(shared_conditions)
    if contamination > 60:
        mater_conditions.append("tri et nettoyage renforces pour recyclage matiere")
    if metals_heavy:
        mater_conditions.append("recuperation metallique prioritaire")
    mater_score = 10.0
    if has_metals:
        mater_score += 50
    if low_pci and low_organic_load:
        mater_score += 50
    if contamination > 70:
        mater_score -= 30
    if humidity > 70:
        mater_score -= 10
    if chlorine_risk:
        mater_score -= 10

    elim_conditions: list[str] = []
    if contamination > 60:
        elim_conditions.append("pretraitement requis")
    elim_score = 5.0
    if contamination > 80:
        elim_score += 50
    if metals_heavy:
        elim_score += 40
    if chlorine_risk:
        elim_score += 30
    if max(meth_score, comp_score, bio_score, energy_score, mater_score) < 40:
        elim_score += 20

    electronic = waste.categorie == WasteCategory.ELECTRONIC
    if electronic or metals_heavy or metal_category:
        meth_score = 0.0
        comp_score = 0.0
        bio_score = 0.0
        meth_conditions.append("flux electronique ou metallique lourd incompatible avec la methanisation")
        comp_conditions.append("flux electronique ou metallique lourd incompatible avec le compostage")
        bio_conditions.append("flux electronique ou metallique lourd incompatible avec le biochar")
        if electronic:
            energy_score -= 15
        if metal_category:
            mater_score += 25
        elif has_metals:
            mater_score += 15
        elim_score += 20

    base = [
        make_item("methanisation", meth_score, meth_conditions, "Forte DCO/DBO et humidite favorable orientent vers un traitement biologique avec biogaz.", "methanisation_biogaz"),
        make_item("compostage", comp_score, comp_conditions, "Charge biodegradable et humidite intermediaire compatibles avec une stabilisation aerobie.", "compostage"),
        make_item("biochar", bio_score, bio_conditions, "Flux sec avec lignine elevee compatible avec pyrolyse lente et stockage du carbone.", "biochar"),
        make_item("valorisation energetique", energy_score, energy_conditions, "PCI et humidite determinent la robustesse de l'option thermique; le chlore impose des controles renforces.", "valorisation_energetique"),
        make_item("recyclage matiere", mater_score, mater_conditions, "Recuperation matiere privilegiee si la fraction utile est valorisable et si le flux reste maitrise.", "recyclage_matiere"),
        make_item("elimination securisee", elim_score, elim_conditions, "Voie de dernier recours lorsque les contraintes sanitaires ou techniques restent trop fortes.", "elimination_securisee"),
    ]

    material = dict(material)
    material["electronic"] = electronic
    material["metals_heavy"] = metals_heavy
    material["metal_category"] = metal_category

    material_scores = _material_recommendation_scores(material)
    return mergeRecommendations(base, material_scores, material)

def _minimal_voie(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "solution": str(item.get("solution") or item.get("filiere") or item.get("nom") or "voie"),
        "score": round(float(item.get("score") or item.get("global_score") or 0.0), 1),
        "conditions": list(item.get("conditions") or item.get("contraintes") or []),
        "justification": str(item.get("justification") or item.get("explication") or item.get("technical_reason") or ""),
    }


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
        model=os.getenv("OPENAI_MODEL", "gpt-5.5"),
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

    material_profile = analyzeMaterialProperties(effective_waste, metrics)
    generic_scores = _score_generic_solutions(effective_waste, metrics)

    chosen, hierarchy_reasons = _select(effective_waste, evald, generic_scores, material_profile)
    if material_profile.get("reliable") and _is_dry_lignocellulosic_material(material_profile):
        preferred = [x for x in evald if x.get("filiere") in {"biochar", "valorisation_energetique", "charbon_actif"} and x.get("feasible", True)]
        if preferred:
            chosen = sorted(preferred, key=lambda z: float(z.get("global_score", 0.0)), reverse=True)[0]
            hierarchy_reasons = [
                "Biomasse lignocellulosique seche: methanisation et compostage de-priorises de facon hard-rule.",
                f"Priorite a {chosen.get('filiere')} selon PCI={float(material_profile.get('pci_mj_kg') or 0.0):.1f} MJ/kg, lignine={float(material_profile.get('lignine_pct') or 0.0):.1f}% et humidite={float(material_profile.get('humidity_pct') or 0.0):.1f}%.",
            ]
    if wt == WasteType.BIOMASSE_LIGNOCELLULOSIQUE and material_profile.get("reliable"):
        material_lignine = float(material_profile.get("lignine_pct") or 0.0)
        material_humidity = float(material_profile.get("humidity_pct") or 0.0)
        material_biodeg = str(material_profile.get("biodegradability") or "unknown")
        if material_profile.get("lignocellulosic") and (material_lignine >= 20.0 or material_biodeg == "low"):
            preferred = [x for x in evald if x.get("filiere") in {"valorisation_energetique", "biochar", "charbon_actif"} and x.get("feasible", True)]
            if preferred:
                chosen = sorted(preferred, key=lambda z: float(z.get("global_score", 0.0)), reverse=True)[0]
                hierarchy_reasons = [
                    "Biomasse lignocellulosique a forte lignine: methanisation et compostage de-priorises.",
                    f"Priorite a {chosen.get('filiere')} selon PCI={float(metrics.get('pci_mj_kg', 0.0) or 0.0):.1f} MJ/kg, humidite={material_humidity:.1f}% et structure fibreuse.",
                ]
    if wt == WasteType.BIOMASSE_LIGNOCELLULOSIQUE:
        humidity_pct = float(metrics.get("humidite_pct", 100.0 - float(metrics.get("siccite_pct", 0.0) or 0.0)) or 0.0)
        lignine = float(metrics.get("taux_lignine_pct", 0.0) or 0.0)
        pci = float(metrics.get("pci_mj_kg", 0.0) or 0.0)
        if humidity_pct <= 25.0 and lignine >= 20.0 and pci >= 12.0:
            qt = max(0.01, float(effective_waste.quantite_kg) / 1000.0)
            val, treat, roi, eco, value_pt, cost_pt = _eco("biochar", qt, effective_waste.pays_cedeao or "Benin")
            env, social, co2 = _env_social(effective_waste, "biochar", effective_waste.pays_cedeao or "Benin")
            chosen = {
                "filiere": "biochar",
                "hierarchy": "matiere",
                "technical_score": 94.0,
                "technical_reason": f"Biomasse lignocellulosique seche, lignine={lignine:.1f}%, PCI={pci:.1f} MJ/kg et humidite={humidity_pct:.1f}%: biochar prioritaire.",
                "conditions": ["pyrolyse lente", "condensation des vapeurs", "controle cendres"],
                "feasible": True,
                "blocked_reason": None,
                "economic_score": round(eco, 2),
                "environmental_score": round(env, 2),
                "social_score": round(social, 2),
                "regulatory_score": 82.0,
                "global_score": round(_b(WEIGHT_TECH * 94.0 + WEIGHT_ECO * eco + WEIGHT_ENV * env + WEIGHT_SOCIAL * social + WEIGHT_REG * 82.0), 2),
                "market_value_fcfa": round(val, 2),
                "market_value_fcfa_tonne": round(value_pt, 2),
                "treatment_cost_fcfa": round(treat, 2),
                "treatment_cost_fcfa_tonne": round(cost_pt, 2),
                "gain_industriel_fcfa": round(val - treat, 2),
                "gain_industriel_fcfa_tonne": round(value_pt - cost_pt, 2),
                "roi": round(roi, 4),
                "co2_avoided_kg": round(co2, 2),
            }
            hierarchy_reasons = ["Biomasse lignocellulosique seche: biochar prioritaire avant les autres voies."]
    elif _is_dry_lignocellulosic_material(material_profile):
        preferred = [x for x in evald if x.get("filiere") in {"biochar", "valorisation_energetique", "charbon_actif"} and x.get("feasible", True)]
        if preferred:
            chosen = sorted(preferred, key=lambda z: float(z.get("global_score", 0.0)), reverse=True)[0]
            hierarchy_reasons = [
                "Biomasse lignocellulosique seche identifiee par analyse matiere: methanisation et compostage de-priorises.",
                f"Priorite a {chosen.get('filiere')} selon PCI={float(material_profile.get('pci_mj_kg') or 0.0):.1f} MJ/kg, lignine={float(material_profile.get('lignine_pct') or 0.0):.1f}% et humidite={float(material_profile.get('humidity_pct') or 0.0):.1f}%.",
            ]
    if _is_paint_or_coating_waste(effective_waste):
        paint_choice = next((x for x in evald if x.get("filiere") == "neutralisation_chimique" and x.get("feasible", True)), None)
        if paint_choice is not None:
            chosen = paint_choice
            hierarchy_reasons = ["Flux peinture/revetement: neutralisation chimique prioritaire."] + hierarchy_reasons

    material_lookup = _material_score_map(generic_scores)
    classement_filieres = [
        {**_minimal_voie(x), "statut": ("Recommandee" if x.get("filiere") == chosen["filiere"] and x.get("feasible", True) else "Alternative recommandee" if x.get("feasible", True) and float(x.get("global_score", 0.0)) >= 70 else "Alternative" if x.get("feasible", True) else "Non conforme")}
        for x in sorted(
            evald,
            key=lambda z: (_hybrid_route_score(z, material_lookup, material_profile), float(z.get("technical_score", 0.0))),
            reverse=True,
        )
    ]
    alternatives = [_minimal_voie(x) for x in generic_scores if str(x.get("solution") or "") != str(chosen.get("filiere") or "")][:4]

    has_bamako_ref = any("bamako" in _n(ref) for ref in reg_refs)
    bamako_tag = " Accord de Bamako pris en compte." if has_bamako_ref else ""

    just_tech = f"{chosen['technical_reason']} Classement generic applique sur l'ensemble des filieres candidates. {' '.join(hierarchy_reasons)}"
    just_eco = f"Valeur marche {chosen['market_value_fcfa']:.0f} FCFA, cout {chosen['treatment_cost_fcfa']:.0f} FCFA, gain industriel brut {chosen.get('gain_industriel_fcfa', chosen['market_value_fcfa'] - chosen['treatment_cost_fcfa']):.0f} FCFA, ROI={chosen['roi']:.2f}."
    just_env = f"CO2 evite estime {chosen['co2_avoided_kg']:.1f} kg/t, conformite {regulatory.get('status', 'unknown')}.{bamako_tag}"
    just_social = "Impact social positif lie a l'emploi local et a la disponibilite de la filiere au Benin/CEDEAO."

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

    explication_detaillee = _build_explication_paragraphs(effective_waste, metrics, chosen, evald, regulatory, reg_refs, hierarchy_reasons)

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
        resume_choix=f"Filiere retenue: {chosen['filiere']} ({chosen['hierarchy']}).",
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
        options_alternatives=[f"{a['solution']} ({a['score']})" for a in alternatives],
        decision_principale=chosen["filiere"],
        justification_technique=just_tech,
        justification_economique=just_eco,
        justification_environnementale=just_env,
        justification_sociale=just_social,
        score_global=round(score_global, 2),
        alternatives=alternatives,
        classement_filieres=classement_filieres,
        scores_par_voie=[_minimal_voie(x) for x in generic_scores],
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
    }


def _scientific_profile(w: WasteInput, wt: WasteType, m: dict[str, float]) -> dict[str, Any]:
    humidity = float(m.get("humidite_pct", max(0.0, 100.0 - float(m.get("siccite_pct", 0.0) or 0.0))) or 0.0)
    pci = float(m.get("pci_mj_kg", 0.0) or 0.0)
    lignine = float(m.get("taux_lignine_pct", 0.0) or 0.0)
    dbo = float(m.get("dbo_mg_l", 0.0) or 0.0)
    dco = float(m.get("dco_mg_l", 0.0) or 0.0)
    dco_dbo = (dco / dbo) if dbo > 0 else None
    contamination = float(w.taux_contamination_pct if w.taux_contamination_pct is not None else m.get("metaux_pct", 0.0) or 0.0)
    category = getattr(w.categorie, "value", w.categorie) or "autre"
    danger = getattr(w.niveau_danger, "value", w.niveau_danger) or "faible"
    abattoir = _is_abattoir_waste(w)
    metal_category = category == WasteCategory.METAL.value
    wet_organic = abattoir or _is_organic_waste_text(w) or category == WasteCategory.ORGANIC.value or wt == WasteType.BOUE_DE_VIDANGE
    lignocellulosic = wt == WasteType.BIOMASSE_LIGNOCELLULOSIQUE or any(k in _waste_text(w) for k in ["bagasse", "sciure", "coque", "tige", "bois", "lignine", "cellulose"])
    plastic = category == WasteCategory.PLASTIC.value or wt == WasteType.PLASTIQUE
    textile = wt == WasteType.TEXTILE or category == WasteCategory.OTHER.value and any(k in _waste_text(w) for k in ["textile", "tissu", "vetement", "vetement", "cloth"])
    chlorine_risk = bool(w.presence_chlore or _is_pvc(w))

    return {
        "humidity_pct": humidity,
        "pci_mj_kg": pci,
        "lignine_pct": lignine,
        "dbo_mg_l": dbo,
        "dco_mg_l": dco,
        "dco_dbo_ratio": dco_dbo,
        "contamination_pct": contamination,
        "category": category,
        "danger": danger,
        "metal_category": metal_category,
        "abattoir": abattoir,
        "wet_organic": wet_organic,
        "lignocellulosic": lignocellulosic,
        "plastic": plastic,
        "textile": textile,
        "chlorine_risk": chlorine_risk,
        "reusable_textile": _textile_reusable(w),
    }


def _apply_scientific_route_bias(w: WasteInput, wt: WasteType, m: dict[str, float], candidate: dict[str, Any]) -> tuple[float, list[str], list[str], bool, str | None]:
    profile = _scientific_profile(w, wt, m)
    filiere = str(candidate.get("filiere") or "")
    tech = float(candidate.get("technical_score", 0.0) or 0.0)
    conditions = list(candidate.get("conditions") or [])
    notes: list[str] = []
    feasible = bool(candidate.get("feasible", True))
    blocked_reason = candidate.get("blocked_reason")

    humidity = float(profile["humidity_pct"])
    pci = float(profile["pci_mj_kg"])
    lignine = float(profile["lignine_pct"])
    dbo = float(profile["dbo_mg_l"])
    dco = float(profile["dco_mg_l"])
    ratio = profile["dco_dbo_ratio"]
    contamination = float(profile["contamination_pct"])
    abattoir = bool(profile["abattoir"])
    wet_organic = bool(profile["wet_organic"])
    lignocellulosic = bool(profile["lignocellulosic"])
    plastic = bool(profile["plastic"])
    textile = bool(profile["textile"])
    chlorine_risk = bool(profile["chlorine_risk"])
    reusable_textile = bool(profile["reusable_textile"])
    dry_lignocellulosic = _is_dry_lignocellulosic_material(profile)
    electronic = w.categorie == WasteCategory.ELECTRONIC
    has_metals = bool(w.contient_metaux or w.presence_metaux_lourds)
    metal_category = w.categorie == WasteCategory.METAL
    metals_heavy = has_metals
    danger = str(profile["danger"])

    if filiere == "methanisation_biogaz":
        if dry_lignocellulosic:
            tech -= 70.0
            feasible = False
            blocked_reason = "Biomasse lignocellulosique seche incompatible avec la methanisation."
            notes.append("Matrice lignocellulosique seche: methanisation ecartee au profit d'une voie thermique ou de biochar.")
        elif plastic and (contamination > 35 or chlorine_risk):
            tech -= 60.0
            feasible = False
            blocked_reason = "Flux plastique contamine ou chlore incompatible avec la methanisation."
            notes.append("Flux plastique mixte ou chlore: methanisation ecartee.")
        elif electronic or metals_heavy or metal_category:
            tech -= 60.0
            feasible = False
            blocked_reason = "Dechet electronique ou charge metallique incompatible avec la methanisation."
            notes.append("Dechet electronique ou fortement metallique: methanisation ecartee.")
        elif wet_organic:
            if humidity >= 70 and (dbo >= 1000 or dco >= 2500):
                tech += 22.0
                notes.append("Flux humide et fortement biodegradable: methanisation priorisee pour convertir la DBO/DCO en biogaz.")
            elif humidity >= 60 and (dbo >= 800 or dco >= 1800):
                tech += 16.0
                notes.append("Humidite elevee et charge organique suffisante: digestion anaerobie robuste.")
            elif humidity >= 45:
                tech += 8.0
        elif not wet_organic and lignocellulosic and lignine >= 20 and humidity <= 45:
            tech -= 35.0
            feasible = False
            blocked_reason = "Biomasse lignocellulosique trop seche ou trop lignee pour la methanisation."
            notes.append("Matrice fibreuse et peu biodegradables: methanisation ecartee.")
        if ratio is not None and ratio <= 4.5 and (dbo >= 500 or dco >= 1000):
            tech += 6.0
            notes.append("Ratio DCO/DBO compatible avec un digesteur stabilisable.")
        if abattoir:
            tech += 8.0
            notes.append("Flux d'abattoir traite comme flux organique humide a valoriser prioritairement par biogaz.")
            conditions.extend(["tri initial", "hygienisation des intrants", "drainage si humidite excessive"])
        if humidity < 45:
            tech -= 18.0
            notes.append("Humidite trop faible pour une digestion anaerobie robuste.")
        if contamination > 35:
            tech -= 12.0
            conditions.append("pretraitement sanitaire/tri des indesirables")
        if danger in {"eleve", "critique"}:
            tech -= 10.0

    elif filiere == "compostage":
        if dry_lignocellulosic:
            tech -= 65.0
            feasible = False
            blocked_reason = "Biomasse lignocellulosique seche incompatible avec le compostage."
            notes.append("Matrice lignocellulosique seche: compostage ecarte au profit d'une voie de valorisation thermique.")
        elif plastic and (contamination > 35 or chlorine_risk):
            tech -= 55.0
            feasible = False
            blocked_reason = "Flux plastique contamine ou chlore incompatible avec le compostage."
            notes.append("Flux plastique mixte ou chlore: compostage ecarte.")
        elif electronic or metals_heavy or metal_category:
            tech -= 60.0
            feasible = False
            blocked_reason = "Dechet electronique ou charge metallique incompatible avec le compostage."
            notes.append("Dechet electronique ou fortement metallique: compostage ecarte.")
        elif wet_organic and 40 <= humidity <= 70 and contamination <= 35:
            tech += 16.0
            notes.append("Matiere organique stabilisable par compostage avec humidite exploitable.")
        elif lignocellulosic and 35 <= humidity <= 65 and contamination <= 25:
            tech += 12.0
            notes.append("Fraction lignocellulosique compatible avec une maturation aerobie.")
        if abattoir and humidity >= 55:
            tech += 6.0
            conditions.append("hygienisation prealable avant maturation aerobie")
        if humidity < 30:
            tech -= 12.0
        if humidity > 75:
            tech -= 8.0
            conditions.append("gestion des lixiviats")
        if contamination > 35:
            tech -= 15.0
        if danger == "critique":
            tech -= 20.0

    elif filiere == "recyclage_matiere":
        if plastic and contamination <= 20 and humidity <= 40 and not chlorine_risk:
            tech += 20.0
            notes.append("Flux plastique propre et sec: recyclage mecanique prioritaire.")
            conditions.extend(["tri fin", "lavage si necessaire"])
        elif plastic and (contamination > 35 or humidity > 45 or chlorine_risk):
            tech -= 40.0
            feasible = False
            blocked_reason = "Flux plastique trop contamine ou instable pour le recyclage matiere."
            notes.append("Flux plastique mixte ou contamine: recyclage matiere ecarte.")
        elif electronic or metals_heavy:
            tech -= 60.0
            feasible = False
            blocked_reason = "Dechet electronique ou charge metallique incompatible avec le recyclage matiere."
            notes.append("Dechet electronique ou fortement metallique: recyclage matiere classique ecarte.")
        elif wt == WasteType.HUILE_USAGEE:
            tech -= 55.0
            feasible = False
            blocked_reason = "Huile usagee incompatible avec le recyclage matiere."
            notes.append("Huile usagee: recyclage matiere ecarte au profit d'une voie thermique ou de regeneration.")
        elif textile and contamination <= 20 and humidity <= 35:
            tech += 16.0
            notes.append("Flux textile compatible avec une preparation matiere ou un effilochage.")
            conditions.append("tri par composition et couleur")
        elif wt == WasteType.TEXTILE and reusable_textile:
            tech += 12.0
        elif w.categorie == WasteCategory.METAL:
            tech += 18.0 if bool(w.contient_metaux or w.presence_metaux_lourds) else 8.0
        if contamination > 35:
            tech -= 18.0
        if humidity > 70:
            tech -= 10.0
        if chlorine_risk:
            tech -= 15.0
            conditions.append("chlore a verifier avant recyclage")
        if wet_organic or abattoir:
            tech -= 20.0

    elif filiere == "reemploi":
        if textile and reusable_textile and contamination <= 15 and humidity <= 35 and danger in {"faible", "moyen"}:
            tech += 22.0
            notes.append("Textile reutilisable propre: reemploi en tete de sequence.")
        elif textile and not reusable_textile:
            tech -= 35.0
            feasible = False
            blocked_reason = "Textile non reutilisable: reemploi impossible."
            notes.append("Etat textile ou contamination insuffisants pour le reemploi.")
        elif electronic or metals_heavy or metal_category:
            tech -= 60.0
            feasible = False
            blocked_reason = "Dechet electronique ou charge metallique incompatible avec le reemploi."
            notes.append("Dechet electronique ou fortement metallique: reemploi ecarte.")
        elif wt == WasteType.HUILE_USAGEE:
            tech -= 60.0
            feasible = False
            blocked_reason = "Huile usagee incompatible avec le reemploi."
            notes.append("Huile usagee: reemploi ecarte.")
        elif plastic and contamination <= 15 and humidity <= 35 and danger in {"faible", "moyen"}:
            tech -= 30.0
            blocked_reason = "Flux plastique trop contamine pour le reemploi."
        else:
            tech -= 10.0
        if wet_organic or abattoir:
            tech -= 25.0
        if danger in {"eleve", "critique"}:
            tech -= 20.0

    elif filiere == "neutralisation_chimique":
        if _is_paint_or_coating_waste(w) or chlorine_risk or danger in {"eleve", "critique"} or w.categorie == WasteCategory.CHEMICAL or electronic or metals_heavy or metal_category:
            tech += 30.0
            notes.append("Stabilisation chimique utile pour un flux reactif, chlore, dangereux ou charge en metaux lourds.")
        elif wt == WasteType.HUILE_USAGEE:
            tech -= 12.0
            notes.append("Huile usagee: neutralisation chimique reservee aux cas fortement contamines.")
        else:
            tech -= 22.0

    elif filiere == "pyrolyse_gazification":
        if electronic or metals_heavy or metal_category:
            tech -= 60.0
            feasible = False
            blocked_reason = "Dechet electronique ou charge metallique incompatible avec la pyrolyse/gazification."
            notes.append("Dechet electronique ou fortement metallique: pyrolyse/gazification ecartee.")
        elif pci >= 15 and humidity <= 25 and not chlorine_risk:
            tech += 16.0
            notes.append("PCI eleve et faible humidite compatibles avec une pyrolyse/gazification de stabilisation.")
            conditions.append("tri et controle emissions")
        else:
            tech -= 15.0
        if chlorine_risk:
            tech -= 20.0
        if humidity > 50:
            tech -= 10.0

    elif filiere == "co_incineration_cimenterie":
        if electronic or metals_heavy or metal_category:
            tech -= 60.0
            feasible = False
            blocked_reason = "Dechet electronique ou charge metallique incompatible avec la co-incineration."
            notes.append("Dechet electronique ou fortement metallique: co-incineration ecartee.")
        elif pci >= 15 and humidity <= 35 and not chlorine_risk:
            tech += 18.0
            notes.append("PCI eleve et humidite faible compatibles avec co-incineration en cimenterie.")
            conditions.append("autorisation cimenterie")
        elif pci >= 12 and humidity <= 40 and not chlorine_risk:
            tech += 10.0
        else:
            tech -= 12.0
        if chlorine_risk:
            tech -= 25.0
        if humidity > 50:
            tech -= 10.0

    if notes:
        candidate_reason = str(candidate.get("technical_reason") or "Scoring modulaire applique.")
        candidate["technical_reason"] = candidate_reason + " " + " ".join(dict.fromkeys(notes))
    candidate["conditions"] = list(dict.fromkeys(conditions))
    return _b(tech), candidate["conditions"], notes, feasible, blocked_reason


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
        status = scored.get("status") or ("Recommande" if feasible and score >= 70 else "Non pertinent" if feasible else "Non disponible")
        if str(status).lower() == "recommande":
            status = "Recommande"
        elif str(status).lower() == "non pertinent":
            status = "Non pertinent"
        elif str(status).lower() == "non disponible":
            status = "Non disponible"

        candidate = {
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
        }

        adjusted_score, adjusted_conditions, notes, feasible2, blocked_reason2 = _apply_scientific_route_bias(w, wt, m, candidate)
        candidate["technical_score"] = adjusted_score
        candidate["conditions"] = adjusted_conditions
        candidate["feasible"] = feasible and feasible2
        candidate["blocked_reason"] = blocked_reason2 if blocked_reason2 is not None else blocked_reason
        if notes:
            candidate["explication_automatique"] = candidate["technical_reason"]
            warnings.extend(notes)
        c.append(candidate)

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
        env = _b(50.0 + co2_pt / 12.0 - (8.0 if profile['humidite_pct'] > 70.0 and c["hierarchy"] == "energie" else 0.0))
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


def _select(
    waste: WasteInput,
    evald: list[dict[str, Any]],
    material_scores: list[dict[str, Any]] | None = None,
    material: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], list[str]]:
    reasons: list[str] = []
    material_lookup = _material_score_map(material_scores or [])
    material = material or {"reliable": False}

    def rank(route: dict[str, Any]) -> float:
        return _hybrid_route_score(route, material_lookup, material)

    feasible = sorted(
        [x for x in evald if x.get("feasible", True)],
        key=lambda z: (rank(z), float(z.get("technical_score", 0.0))),
        reverse=True,
    )
    if not feasible:
        chosen = sorted(
            evald,
            key=lambda z: (rank(z), float(z.get("technical_score", 0.0))),
            reverse=True,
        )[0]
        reasons.append("Aucune filiere pleinement compatible: meilleure option restante conservee comme reference.")
        return chosen, reasons

    non_elimination = [x for x in feasible if x.get("filiere") != DECISION_ELIMINATION]
    if non_elimination and material.get("reliable"):
        contamination = float(waste.taux_contamination_pct or 0.0)
        humidity = float(material.get("humidity_pct") or 0.0)
        chlorine_risk = bool(waste.presence_chlore or _is_pvc(waste))
        if (waste.categorie == WasteCategory.PLASTIC or _is_probably_plastic_text(waste)) and contamination <= 20.0 and humidity <= 40.0 and not chlorine_risk:
            preferred = [x for x in non_elimination if x.get("filiere") == "recyclage_matiere" and x.get("feasible", True)]
            if preferred:
                chosen = sorted(preferred, key=lambda z: (rank(z), float(z.get("technical_score", 0.0))), reverse=True)[0]
                reasons.append("Plastique propre: recyclage matiere prioritaire sur le reemploi.")
                return chosen, reasons
        by = {g: [x for x in non_elimination if x["hierarchy"] == g] for g in HIERARCHY}
        best = {g: (sorted(by[g], key=lambda z: (rank(z), float(z.get("technical_score", 0.0))), reverse=True)[0] if by[g] else None) for g in HIERARCHY}
        baseline = next((best[g] for g in HIERARCHY if best.get(g)), None)
        top_candidate = sorted(non_elimination, key=lambda z: (rank(z), float(z.get("technical_score", 0.0))), reverse=True)[0]

        if baseline and top_candidate and top_candidate.get("filiere") != baseline.get("filiere"):
            advantage = rank(top_candidate) - rank(baseline)
            threshold = 3.0 if material.get("reliable") else 5.0
            if advantage >= threshold:
                reasons.append("Score hybride physico-chimique superieur a la priorite hierarchique.")
                return top_candidate, reasons

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

    chosen = feasible[0]
    reasons.append("Aucune voie de valorisation faisable: elimination securisee retenue en dernier recours.")
    return chosen, reasons

def _route_explanation(route: dict[str, Any], chosen: dict[str, Any]) -> str:
    filiere = str(route.get("filiere") or "").lower()
    blocked = str(route.get("blocked_reason") or "").strip()

    if route.get("filiere") == chosen.get("filiere"):
        if filiere == "methanisation_biogaz":
            base = (
                "Retenue parce que le flux est humide, fortement charge en matiere organique et peu adapte a une voie thermique. "
                "Dans ce contexte, la digestion anaerobie valorise mieux la DBO/DCO elevee en biogaz, sous reserve d'un tri initial, d'une homogenisation du lot et d'une hygienisation des intrants."
            )
        elif filiere == "compostage":
            base = (
                "Retenue parce que le flux reste biologiquement stabilisable sans exigence de PCI eleve. L'humidite et la fraction organique permettent une maturation aerobie, a condition de maitriser les odeurs, les lixiviats et la contamination."
            )
        elif filiere == "epandage_agricole":
            base = (
                "Retenue seulement si les analyses sanitaires et agronomiques sont conformes. Cette option n'est acceptable que pour un residu organique stabilise, peu contamine et traceable jusqu'au champ d'epandage."
            )
        elif filiere == "recyclage_matiere":
            base = (
                "Retenue parce que le flux est suffisamment propre, homogene et techniquement triable pour une recuperation matiere. Le recyclage mecanique n'est robuste que si la contamination, l'humidite et les corps etrangers restent sous controle."
            )
        elif filiere == "reemploi":
            base = (
                "Retenue parce que le lot conserve une qualite d'usage suffisante pour une reutilisation directe. Le reemploi ne reste pertinent que pour un flux propre, homogene et peu dangereux, avec controle visuel et sanitaire."
            )
        elif filiere == "elimination_securisee":
            base = (
                "Retenue comme voie de securite lorsque les autres options restent trop incertaines sur le plan sanitaire, technique ou reglementaire. L'orientation en installation agreee garantit la maitrise et la tracabilite du lot."
            )
        else:
            base = (
                "Retenue car cette voie correspond le mieux a la nature du flux, a sa qualite materielle et aux contraintes de marche et de conformite."
            )
    elif not route.get("feasible", True):
        if filiere == "compostage":
            base = (
                "Ecartee car le lot est trop instable, trop sec ou trop contamine pour une maturation biologique fiable. Les odeurs, les pertes de matiere et les risques sanitaires deviendraient trop difficiles a contenir en exploitation reguliere."
            )
        elif filiere == "epandage_agricole":
            base = (
                "Ecartee car l'epandage exige un flux stabilise, peu contamine et juridiquement encadre. En l'etat, le risque sanitaire et la contrainte reglementaire restent trop eleves pour une application directe au sol."
            )
        elif filiere == "methanisation_biogaz":
            base = (
                "Ecartee car les conditions de digestion ne sont pas reunies: la charge organique, l'humidite ou la qualite sanitaire ne donnent pas une marge de securite suffisante pour un digesteur stable."
            )
        elif filiere == "elimination_securisee":
            base = (
                "Ecartee uniquement si une autre voie reste conforme, car cette option doit rester le filet de securite du dossier."
            )
        else:
            base = (
                "Ecartee car la qualite du flux, sa contamination ou ses contraintes de marche ne permettent pas une exploitation fiable de cette voie."
            )
    else:
        if filiere == "methanisation_biogaz":
            base = (
                "Alternative solide car le lot est organique et humide, mais une autre voie reste plus simple a mettre en oeuvre dans ce dossier. La methanisation demeure pertinente si l'on securise l'hygienisation, le drainage et le pilotage du digesteur."
            )
        elif filiere == "compostage":
            base = (
                "Alternative plausible car le flux peut se stabiliser biologiquement, mais la tenue economique, les nuisances d'exploitation ou la concurrence d'une voie plus robuste limitent son rang."
            )
        elif filiere in {"recyclage_matiere", "recyclage_mecanique_plastique"}:
            base = (
                "Alternative plausible pour un flux propre et homogene, mais elle reste moins adaptee si la contamination, l'humidite ou l'heterogeneite augmentent."
            )
        elif filiere == "reemploi":
            base = (
                "Alternative seulement si le lot est suffisamment propre et homogene; en presence de contraintes sanitaires ou de qualite, le reemploi devient trop fragile pour etre prioritaire."
            )
        else:
            base = (
                "Alternative plausible mais moins robuste que la voie retenue au regard du profil du lot, de la conformite et des debouches disponibles."
            )

    if blocked:
        base = f"{base} Limite identifiee: {blocked}."
    return base


def _alternatives(chosen: dict[str, Any], evald: list[dict[str, Any]]) -> list[dict[str, Any]]:
    order = sorted([x for x in evald if x.get("filiere") != chosen.get("filiere")], key=lambda z: float(z.get("global_score", 0.0)), reverse=True)
    out: list[dict[str, Any]] = []
    for x in order[:4]:
        why = str(x.get("blocked_reason") or "Score global inferieur a la filiere principale.")
        if not x.get("feasible", True):
            why = str(x.get("blocked_reason") or "Non faisable techniquement/reglementairement.")
        if chosen.get("hierarchy") != x.get("hierarchy") and chosen.get("hierarchy") in {"matiere", "energie"}:
            why = f"Moins prioritaire dans la hierarchie ({x.get('hierarchy')} apres {chosen.get('hierarchy')})." if x.get("feasible", True) else why
        out.append({
            "filiere": x.get("filiere"),
            "nom": x.get("nom") or x.get("filiere"),
            "score": round(float(x.get("global_score", 0.0)), 2),
            "statut": _route_status_label(x, chosen),
            "pourquoi_pas_prioritaire": why,
            "blocked": not x.get("feasible", True),
            "blocked_reason": x.get("blocked_reason"),
            "explication": _route_explanation(x, chosen),
            "technique": round(float(x.get("technical_score", 0.0)), 2),
            "economique": round(float(x.get("economic_score", 0.0)), 2),
            "environnement": round(float(x.get("environmental_score", 0.0)), 2),
            "social": round(float(x.get("social_score", 0.0)), 2),
            "reglementaire": round(float(x.get("regulatory_score", 0.0)), 2),
        })
    return out














