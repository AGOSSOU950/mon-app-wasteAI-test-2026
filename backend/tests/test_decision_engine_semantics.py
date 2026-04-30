import unittest

from app.core.decision_engine import analyser_dechet
from app.models.waste import DangerLevel, IndustryType, WasteCategory, WasteInput, WasteType


class DecisionEngineSemanticRoutingTests(unittest.TestCase):
    def _analyze(self, nom: str, description: str = "") -> dict:
        waste = WasteInput(
            nom=nom,
            categorie=WasteCategory.OTHER,
            type_dechet=WasteType.OTHER,
            type_industrie=IndustryType.OTHER,
            quantite_kg=500,
            niveau_danger=DangerLevel.LOW,
            description=description,
            contient_metaux=False,
            pays_cedeao="Benin",
        )
        result = analyser_dechet(waste)
        return {
            "decision": result.decision_principale,
            "explication": str(result.explication or ""),
            "explication_detaillee": str(result.explication_detaillee or ""),
            "alternatives": [str(x) for x in (result.options_alternatives or [])],
        }

    def test_excrements_animaux_are_routed_as_organic_not_plastic(self) -> None:
        output = self._analyze("excrements d'animaux")
        self.assertEqual(output["decision"], "methanisation_biogaz")
        self.assertIn("filiere retenue est methanisation_biogaz", output["explication"].lower())
        self.assertIn("co2", output["explication"].lower())
        self.assertIn("cout de traitement", output["explication"].lower())
        self.assertIn("alternatives examinees", output["explication"].lower())
        self.assertNotIn("recyclage_mecanique_plastique", output["explication"].lower())
    def test_peinture_chimique_is_not_routed_to_regeneration_huiles(self) -> None:
        output = self._analyze("peinture industrie chimique")
        self.assertEqual(output["decision"], "neutralisation_chimique")
        self.assertIn("cedeao", output["explication"].lower())
        self.assertIn("bamako", output["explication"].lower())
        self.assertIn("nature du flux", output["explication"].lower())
        self.assertNotIn("regeneration_huiles", output["explication"].lower())

    def test_abattoir_wet_organic_stream_keeps_three_routes_and_explains_costs(self) -> None:
        waste = WasteInput(
            nom="DÃƒÆ’Ã‚Â©chets d'abattoir",
            categorie=WasteCategory.OTHER,
            type_dechet=WasteType.OTHER,
            type_industrie=IndustryType.AGROALIMENTAIRE,
            quantite_kg=1200,
            niveau_danger=DangerLevel.MEDIUM,
            description="RÃƒÆ’Ã‚Â©sidus d'abattoir trÃƒÆ’Ã‚Â¨s humides avec DBO ÃƒÆ’Ã‚Â©levÃƒÆ’Ã‚Â©e, DCO ÃƒÆ’Ã‚Â©levÃƒÆ’Ã‚Â©e et forte charge organique",
            contient_metaux=False,
            pays_cedeao="Benin",
            dbo_mg_l=1800,
            dco_mg_l=4200,
            taux_humidite_pct=82,
        )
        result = analyser_dechet(waste)
        self.assertEqual(result.decision_principale, "methanisation_biogaz")
        self.assertIn("cout de traitement", result.explication_detaillee.lower())
        self.assertIn("impact environnemental", result.explication_detaillee.lower())
        self.assertIn("cadre reglementaire", result.explication_detaillee.lower())
        paragraphs = [part.strip() for part in str(result.explication_detaillee or "").split("\n\n") if part.strip()]
        self.assertGreaterEqual(len(paragraphs), 3)
        self.assertGreaterEqual(len(result.scores_par_voie or []), 3)
        self.assertTrue(any(item.get("solution") == "compostage" for item in (result.scores_par_voie or [])))
        self.assertTrue(any(item.get("solution") == "methanisation" for item in (result.scores_par_voie or [])))


    def test_high_contamination_still_returns_multiple_options(self) -> None:
        waste = WasteInput(
            nom="Boues organiques tres contaminees",
            categorie=WasteCategory.OTHER,
            type_dechet=WasteType.OTHER,
            type_industrie=IndustryType.AGROALIMENTAIRE,
            quantite_kg=1000,
            niveau_danger=DangerLevel.MEDIUM,
            description="Flux humide avec DCO elevee, DBO elevee, contamination 75%, metaux et chlore",
            contient_metaux=True,
            pays_cedeao="Benin",
            dbo_mg_l=1500,
            dco_mg_l=150000,
            taux_humidite_pct=78,
            taux_contamination_pct=75,
            presence_chlore=True,
        )
        result = analyser_dechet(waste)
        self.assertGreaterEqual(len(result.scores_par_voie or []), 5)
        self.assertTrue(all(set(item.keys()) == {"solution", "score", "conditions", "justification"} for item in (result.scores_par_voie or [])))
        self.assertTrue(any(item.get("solution") == "methanisation" for item in (result.scores_par_voie or [])))
        self.assertTrue(any(item.get("solution") == "compostage" for item in (result.scores_par_voie or [])))
        self.assertTrue(any(item.get("solution") == "valorisation energetique" for item in (result.scores_par_voie or [])))
        self.assertTrue(any(item.get("solution") == "recyclage matiere" for item in (result.scores_par_voie or [])))


if __name__ == "__main__":
    unittest.main()