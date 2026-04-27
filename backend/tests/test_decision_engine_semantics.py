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
            "alternatives": [str(x) for x in (result.options_alternatives or [])],
        }

    def test_excrements_animaux_are_routed_as_organic_not_plastic(self) -> None:
        output = self._analyze("excrements d'animaux")
        self.assertEqual(output["decision"], "methanisation_biogaz")
        self.assertIn("filiere retenue est methanisation_biogaz", output["explication"].lower())
        self.assertNotIn("recyclage_mecanique_plastique", output["explication"].lower())

    def test_peinture_chimique_is_not_routed_to_regeneration_huiles(self) -> None:
        output = self._analyze("peinture industrie chimique")
        self.assertEqual(output["decision"], "neutralisation_chimique")
        self.assertIn("cedeao", output["explication"].lower())
        self.assertNotIn("regeneration_huiles", output["explication"].lower())


if __name__ == "__main__":
    unittest.main()
