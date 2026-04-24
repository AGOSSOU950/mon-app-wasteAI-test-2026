import json
import os
from copy import deepcopy
from pathlib import Path

DEFAULT_SCORING_CONFIG = {
    "bound": {"min": 0, "max": 100},
    "decision": {
        "matiere": "Valorisation matiere (charbon actif, refonte...)",
        "energetique": "Valorisation energetique (biogaz, combustible, electricite...)",
        "vente": "Vente directe sur marketplace",
    },
    "confiance": {"high_min_score": 75, "high_min_gap": 20, "medium_min_gap": 10},
    "thresholds": {
        "quantite_energie": [
            {"min": 1500, "score": 25},
            {"min": 700, "score": 18},
            {"min": 300, "score": 10},
        ],
        "quantite_vente": [
            {"min": 2000, "score": 18},
            {"min": 1000, "score": 10},
            {"min": 500, "score": 5},
        ],
        "pci_mj_kg": [
            {"min": 16, "score": 40},
            {"min": 12, "score": 30},
            {"min": 8, "score": 18},
        ],
        "taux_lignine": [
            {"min": 30, "score": 30},
            {"min": 20, "score": 20},
            {"min": 10, "score": 10},
        ],
        "biogaz_dbo": [
            {"min": 4000, "score": 25},
            {"min": 2000, "score": 18},
            {"min": 1000, "score": 0},
        ],
        "biogaz_dco": [
            {"min": 8000, "score": 18},
            {"min": 4000, "score": 12},
            {"min": 2000, "score": 6},
        ],
        "biogaz_ratio": [{"min": 0.4, "max": 0.8, "score": 12}, {"min": 0.3, "score": 6}],
        "biogaz_max_score": 50,
    },
    "weights": {
        "categorie": {
            "metal_matiere": 45,
            "plastic_matiere": 30,
            "paper_matiere": 20,
            "organic_energie": 12,
        },
        "metaux": {"presence_matiere": 20},
        "waste_type": {
            "biomasse_matiere": 45,
            "biomasse_energie": 8,
            "boue_energie": 35,
            "huile_energie": 48,
            "huile_vente": 10,
        },
        "biogaz": {
            "organic_base": 10,
            "boue_base": 15,
            "vente_penalty_if_high": 5,
            "high_bonus_threshold": 30,
        },
        "industrie": {
            "agro_biomasse_matiere": 18,
            "agro_organic_energie": 12,
            "metallurgie_metal_matiere": 25,
            "metallurgie_metal_vente": 10,
            "rebar_matiere": 30,
            "rebar_vente_penalty": 5,
            "chimie_huile_energie": 18,
            "energie_calorifique_bonus": 18,
            "energie_calorifique_min": 8,
        },
        "danger": {
            "low_vente": 0,
            "medium_vente": -5,
            "high_vente": -20,
            "high_matiere": -5,
            "critical_vente": -35,
            "critical_matiere": -10,
        },
    },
    "keywords": {
        "biomasse": [
            "coque de noix de coco",
            "coques de noix de coco",
            "coco",
            "lignocellulos",
            "bagasse",
            "sciure",
            "paille",
            "biomasse",
        ],
        "boue": ["boue", "vidange", "sludge"],
        "huile": ["huile usagee", "huile usee", "huile moteur", "lubrifiant use"],
        "rebar": ["fer a beton", "fer beton", "acier", "rebar"],
        "textile": ["textile", "vetement", "tissu", "coton", "lin", "polyester", "chiffon"],
        "plastique": ["plastique", "pet", "pehd", "pp", "pvc", "film plastique", "emballage"],
    },
    "country_filiere_overrides": {
        "default": {
            "biomasse_lignocellulosique": {"matiere": 2, "energie": 4, "vente": -1},
            "boue_de_vidange": {"matiere": -2, "energie": 6, "vente": -4},
            "huile_usagee": {"matiere": -3, "energie": 5, "vente": -5},
            "textile": {"matiere": 4, "energie": 1, "vente": -2},
            "plastique": {"matiere": 5, "energie": 0, "vente": -1},
        },
        "benin": {
            "biomasse_lignocellulosique": {"matiere": 7, "energie": 10, "vente": -6},
            "boue_de_vidange": {"matiere": -5, "energie": 11, "vente": -9},
            "huile_usagee": {"matiere": -4, "energie": 10, "vente": -9},
            "textile": {"matiere": 9, "energie": 2, "vente": -6},
            "plastique": {"matiere": 9, "energie": 2, "vente": -5},
        },
        "cote d'ivoire": {
            "biomasse_lignocellulosique": {"matiere": 3, "energie": 5, "vente": -2},
            "boue_de_vidange": {"matiere": -3, "energie": 7, "vente": -5},
            "huile_usagee": {"matiere": -2, "energie": 6, "vente": -5},
            "textile": {"matiere": 5, "energie": 1, "vente": -2},
            "plastique": {"matiere": 5, "energie": 0, "vente": -1},
        },
        "senegal": {
            "biomasse_lignocellulosique": {"matiere": 3, "energie": 5, "vente": -2},
            "boue_de_vidange": {"matiere": -3, "energie": 8, "vente": -5},
            "huile_usagee": {"matiere": -2, "energie": 6, "vente": -5},
            "textile": {"matiere": 5, "energie": 1, "vente": -2},
            "plastique": {"matiere": 6, "energie": 0, "vente": -2},
        },
        "nigeria": {
            "biomasse_lignocellulosique": {"matiere": 2, "energie": 6, "vente": -1},
            "boue_de_vidange": {"matiere": -2, "energie": 8, "vente": -5},
            "huile_usagee": {"matiere": -2, "energie": 7, "vente": -5},
            "textile": {"matiere": 4, "energie": 2, "vente": -1},
            "plastique": {"matiere": 5, "energie": 1, "vente": 0},
        },
    },
}


def _deep_merge(base: dict, override: dict) -> dict:
    merged = deepcopy(base)
    for key, value in override.items():
        if key in merged and isinstance(merged[key], dict) and isinstance(value, dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _config_path() -> Path:
    env_path = os.getenv("WASTEWISE_SCORING_CONFIG")
    if env_path:
        return Path(env_path)
    return Path(__file__).with_name("scoring_config.json")


def get_scoring_config() -> dict:
    path = _config_path()
    if not path.exists():
        return deepcopy(DEFAULT_SCORING_CONFIG)

    try:
        loaded = json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception:
        return deepcopy(DEFAULT_SCORING_CONFIG)

    if not isinstance(loaded, dict):
        return deepcopy(DEFAULT_SCORING_CONFIG)

    return _deep_merge(DEFAULT_SCORING_CONFIG, loaded)


