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


def _infer_type(waste: WasteInput) -> WasteType:
    if waste.type_dechet != WasteType.OTHER:
        return waste.type_dechet
    text = " ".join([_n(waste.nom), _n(waste.description), _n(waste.composition_textile), _n(waste.type_plastique)])
    if any(x in text for x in ["bagasse", "sciure", "coque", "tige", "biomasse"]):
        return WasteType.BIOMASSE_LIGNOCELLULOSIQUE
    if any(x in text for x in ["boue", "vidange", "sludge"]):
        return WasteType.BOUE_DE_VIDANGE
    if any(x in text for x in ["huile", "lubrifiant", "oil"]):
        return WasteType.HUILE_USAGEE
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


def _metrics(w: WasteInput, wt: WasteType) -> tuple[dict[str, float], list[str], list[str]]:
    defaults = TYPICAL.get(wt.value, TYPICAL[WasteType.OTHER.value])
    assumptions: list[str] = []
    missing: list[str] = []

    met = _pct(w.description, ["metaux", "metal"]) or (60.0 if w.contient_metaux else defaults["metaux_pct"])
    if w.contient_metaux and _pct(w.description, ["metaux", "metal"]) is None:
        assumptions.append("Teneur en metaux supposee a 60% (contient_metaux=true).")

    sic = _pct(w.description, ["siccite", "humidite", "sechage"])
    if sic is None:
        d = _n(w.description)
        if "humide" in d:
            sic = 18.0
            assumptions.append("Siccite estimee a 18% (decrit humide).")
        elif "sec" in d:
            sic = 40.0
            assumptions.append("Siccite estimee a 40% (decrit sec).")
        else:
            sic = float(defaults["siccite_pct"])
            assumptions.append(f"Siccite typique appliquee ({sic}%).")

    out = {
        "pci_mj_kg": float(w.pci_mj_kg) if w.pci_mj_kg is not None else float(defaults.get("pci_mj_kg", 0.0)),
        "dbo_mg_l": float(w.dbo_mg_l) if w.dbo_mg_l is not None else float(defaults.get("dbo_mg_l", 0.0)),
        "dco_mg_l": float(w.dco_mg_l) if w.dco_mg_l is not None else float(defaults.get("dco_mg_l", 0.0)),
        "taux_lignine_pct": float(w.taux_lignine_pct) if w.taux_lignine_pct is not None else float(defaults.get("taux_lignine_pct", 0.0)),
        "metaux_pct": float(met),
        "siccite_pct": float(sic),
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
    if w.categorie == WasteCategory.METAL and _pct(w.description, ["metaux", "metal"]) is None:
        missing.append("teneur_metaux_%")

    return out, assumptions, sorted(set(missing))


def _cand(f: str, h: str, t: float, reason: str, conds: list[str], feasible: bool = True, blocked: str | None = None) -> dict[str, Any]:
    return {"filiere": f, "hierarchy": h, "technical_score": _b(t), "technical_reason": reason, "conditions": conds, "feasible": feasible, "blocked_reason": blocked}


def _build_candidates(w: WasteInput, wt: WasteType, m: dict[str, float]) -> tuple[list[dict[str, Any]], list[str]]:
    c: list[dict[str, Any]] = []
    warnings: list[str] = []

    if w.niveau_danger == "critique" or (w.categorie == WasteCategory.CHEMICAL and w.niveau_danger in {"eleve", "critique"}):
        return [
            _cand(DECISION_ELIMINATION, "elimination", 95, "Dangerosite critique/chimique: elimination securisee obligatoire.", ["transport ADR", "centre agree", "bordereau de suivi"])
        ], warnings
    if wt == WasteType.BIOMASSE_LIGNOCELLULOSIQUE:
        c += [
            _cand("charbon_actif", "matiere", 88 if m["taux_lignine_pct"] >= 20 else 72, f"Biomasse lignocellulosique, lignine={m['taux_lignine_pct']:.1f}%.", ["pyrolyse", "activation", "QC"]),
            _cand("combustion_gazeification", "energie", 78 if (m["pci_mj_kg"] > 15 or m["siccite_pct"] > 30) else 52, f"PCI={m['pci_mj_kg']:.1f} MJ/kg, siccite={m['siccite_pct']:.1f}%.", ["chaudiere/gazogeniere", "controle emissions"], feasible=(m["pci_mj_kg"] > 12), blocked="PCI insuffisant" if m["pci_mj_kg"] <= 12 else None),
            _cand("compostage", "matiere", 60 if m["siccite_pct"] < 30 else 45, "Compostage en fallback si flux humide.", ["plateforme compostage"]),
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
        c += [
            _cand("methanisation_biogaz", "energie", 88 if m["dbo_mg_l"] > 1000 else 60, f"DBO={m['dbo_mg_l']:.0f} mg/L, DCO={m['dco_mg_l']:.0f} mg/L.", ["digesteur", "epuration biogaz"], feasible=(m["dbo_mg_l"] > 500), blocked="Charge organique insuffisante" if m["dbo_mg_l"] <= 500 else None),
            _cand("compostage", "matiere", 74 if m["siccite_pct"] > 20 else 52, f"Siccite={m['siccite_pct']:.1f}%.", ["compostage", "stabilisation"], feasible=(m["siccite_pct"] > 15), blocked="Siccite trop faible" if m["siccite_pct"] <= 15 else None),
            _cand("epandage_agricole", "matiere", 58, "Epandage possible si conformite sanitaire.", ["analyse sanitaire", "autorisation locale"], feasible=(w.niveau_danger in {"faible", "moyen"}), blocked="Niveau de danger incompatible" if w.niveau_danger in {"eleve", "critique"} else None),
        ]
    elif wt == WasteType.HUILE_USAGEE:
        c += [
            _cand("regeneration_huiles", "matiere", 90, "Regeneration en base oils prioritaire.", ["unite regeneration", "controle impuretes"]),
            _cand("biodiesel_combustible", "energie", 72, "Alternative biodiesel/combustible industriel.", ["transesterification/blending"]),
        ]
    elif wt == WasteType.TEXTILE:
        c += [
            _cand("reemploi_textile", "reemploi", 84 if _textile_reusable(w) else 55, "Reemploi prioritaire si etat correct.", ["tri qualite", "desinfection"], feasible=_textile_reusable(w), blocked="Etat textile insuffisant" if not _textile_reusable(w) else None),
            _cand("effilochage_textile", "matiere", 74, "Effilochage en fibres techniques.", ["ligne effilochage"]),
            _cand("co_incineration_cimenterie", "energie", 62, "Reserve aux textiles souilles.", ["cimenterie", "controle emissions"]),
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
            _cand("recyclage_matiere_generique", "matiere", 55, "Tri/valorisation matiere generique.", ["tri source", "controle qualite"]),
            _cand("valorisation_energetique_generique", "energie", 52, "Energie si matiere impossible.", ["installation thermique"]),
            _cand("vente_marketplace", "vente", 42, "Vente en dernier recours.", ["certificat qualite"]),
        ]

    return c, warnings


def _eco(f: str, qt: float, country: str | None) -> tuple[float, float, float, float]:
    price, cost = float(LOCAL_MARKET.get(f, 90000.0)), float(TREATMENT_COST.get(f, 70000.0))
    if _n(country) == "benin":
        price *= 1.03
        cost *= 0.97
    value, treat = price * qt, cost * qt
    net = value - treat
    roi = (net / treat) if treat > 1e-6 else 0.0
    return value, treat, roi, _b(50.0 + roi * 55.0)


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
        val, treat, roi, eco = _eco(c["filiere"], qt, country)
        env, social, co2 = _env_social(w, c["filiere"], country)
        tech = c["technical_score"] if c.get("feasible", True) else max(5.0, c["technical_score"] - 40.0)

        pci = float(metrics.get("pci_mj_kg", 0.0) or 0.0)
        lignine = float(metrics.get("taux_lignine_pct", 0.0) or 0.0)
        dbo = float(metrics.get("dbo_mg_l", 0.0) or 0.0)
        dco = float(metrics.get("dco_mg_l", 0.0) or 0.0)
        dco_dbo = (dco / dbo) if dbo > 0 else 99.0

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
            "treatment_cost_fcfa": round(treat, 2),
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


def _llm_enrichment(payload: dict[str, Any]) -> str | None:
    system_prompt = (
        "Tu es un ingenieur industriel senior specialise en valorisation des dechets en Afrique de l'Ouest. "
        "Tu enrichis un resultat existant sans changer la filiere retenue."
    )
    user_prompt = (
        "Enrichis ce resultat WasteAi CEDEAO/Benin en 6-8 lignes maximum. "
        "Reste concret (faisabilite, risques, prochaine action) et ne modifie pas la decision principale.\n\n"
        + json.dumps(payload, ensure_ascii=False)
    )
    return chat_completion_text(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        model=os.getenv("OPENAI_MODEL", "gpt-5.4"),
        max_tokens=420,
        temperature=0.2,
        timeout_s=20,
    )


def analyser_dechet(waste: WasteInput) -> DecisionResult:
    wt = _infer_type(waste)
    litterature_defaults, litterature_source, litterature_id, litterature_refs, _ = infer_literature_defaults(waste.nom, waste.description)

    metrics, assumptions, missing_critical = _metrics(waste, wt)
    refs_appliquees: dict[str, float | str] = {}
    for f in ["pci_mj_kg", "taux_lignine_pct", "dbo_mg_l", "dco_mg_l"]:
        if getattr(waste, f, None) is None and litterature_defaults.get(f) is not None:
            metrics[f] = float(litterature_defaults[f])
            refs_appliquees[f] = metrics[f]

    candidates, warnings = _build_candidates(waste, wt, metrics)
    ml_explain = explain_ml_adjustments(waste, lookback_limit=1200)
    combined_deltas = ml_explain.get("combined_deltas", {}) if isinstance(ml_explain, dict) else {}
    evald = _evaluate(waste, candidates, waste.pays_cedeao or "Benin", metrics, score_adjustments=combined_deltas)

    labels = {"reemploi": DECISION_REEMPLOI, "matiere": DECISION_MATIERE, "energetique": DECISION_ENERGIE, "vente": DECISION_VENTE}
    blocked, regulatory, reg_refs = evaluate_regulatory_compliance(waste, wt.value, labels)
    evald = _apply_regulatory_priority(evald, blocked, regulatory, labels, reg_refs)

    chosen, hierarchy_reasons = _select(evald)
    alternatives = _alternatives(chosen, evald)

    has_bamako_ref = any("bamako" in _n(ref) for ref in reg_refs)
    bamako_tag = " Accord de Bamako pris en compte." if has_bamako_ref else ""

    just_tech = f"{chosen['technical_reason']} Hierarchie respectee ({' > '.join(HIERARCHY)}). {' '.join(hierarchy_reasons)}"
    just_eco = f"Valeur marche {chosen['market_value_fcfa']:.0f} FCFA, cout {chosen['treatment_cost_fcfa']:.0f} FCFA, ROI={chosen['roi']:.2f}."
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

    llm_text = _llm_enrichment({
        "decision_principale": chosen["filiere"],
        "pays": waste.pays_cedeao or "Benin",
        "type_dechet": wt.value,
        "justifications": [just_tech, just_eco, just_env, just_social],
        "alternatives": alternatives,
        "reglementation": reg_refs[:5],
    })
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

    exp_payload = {
        "decision_principale": chosen["filiere"],
        "justification_technique": just_tech,
        "justification_economique": just_eco,
        "justification_environnementale": just_env,
        "justification_sociale": just_social,
        "score_global": round(score_global, 2),
        "valeur_estimee": round(float(chosen["market_value_fcfa"]), 2),
        "alternatives": alternatives,
        "conditions_requises": _req(chosen.get("conditions", [])),
        "avertissements": " | ".join(warnings) if warnings else "Aucun avertissement majeur.",
        "donnees_manquantes_critiques": missing_critical,
        "hypotheses_utilisees": assumptions,
        "references_reglementaires": reg_refs,
        "ajustements_ml": ml_explain,
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

    return DecisionResult(
        decision=decision_legacy,
        score=round(score_global, 2),
        confiance=confiance,
        explication=json.dumps(exp_payload, ensure_ascii=False),
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
            "treatment_cost_fcfa": round(float(chosen["treatment_cost_fcfa"]), 2),
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
        options_alternatives=[f"{a['filiere']} ({a['score']})" for a in alternatives],
        decision_principale=chosen["filiere"],
        justification_technique=just_tech,
        justification_economique=just_eco,
        justification_environnementale=just_env,
        justification_sociale=just_social,
        score_global=round(score_global, 2),
        alternatives=alternatives,
        conditions_requises=_req(chosen.get("conditions", [])),
        avertissements=(" | ".join(warnings) if warnings else "Aucun avertissement majeur."),
        donnees_manquantes_critiques=missing_critical,
        hypotheses_utilisees=assumptions,
    )

def explain_ml_adjustments(waste: WasteInput, lookback_limit: int = 1200) -> dict[str, Any]:
    wt = _infer_type(waste)
    decision_labels = [DECISION_REEMPLOI, DECISION_MATIERE, DECISION_ENERGIE, DECISION_VENTE]

    learning = get_learning_adjustments(
        waste_type=wt.value,
        country=waste.pays_cedeao,
        decision_labels=decision_labels,
    )

    ml = get_ml_score_adjustments(
        waste_type=wt.value,
        country=waste.pays_cedeao,
        quantity_kg=float(waste.quantite_kg),
        decision_labels=decision_labels,
        lookback_limit=max(50, min(5000, int(lookback_limit))),
    )

    return {
        "waste_type_effectif": wt.value,
        "country": waste.pays_cedeao,
        "quantity_kg": float(waste.quantite_kg),
        "decision_labels": decision_labels,
        "learning_adjustments": learning,
        "ml_adjustments": ml,
        "combined_deltas": {
            label: round(float((learning.get("deltas", {}) or {}).get(label, 0.0)) + float((ml.get("deltas", {}) or {}).get(label, 0.0)), 2)
            for label in decision_labels
        },
    }











