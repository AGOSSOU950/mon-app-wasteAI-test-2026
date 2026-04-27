import json
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
        payload = json.loads(result.explication)
        profile = payload.get("profil_valorisation_expert") or {}
        return {
            "decision": payload.get("decision_principale"),
            "profile": profile,
            "valorisations": profile.get("valorisations") or [],
        }

    def test_excrements_animaux_are_routed_as_organic_not_plastic(self) -> None:
        output = self._analyze("excrements d'animaux")
        decision = output["decision"]
        profile = output["profile"]
        names = [str(v.get("nom") or "") for v in output["valorisations"]]

        self.assertEqual(decision, "methanisation_biogaz")
        self.assertEqual(profile.get("type"), "organique")
        self.assertIn("methanisation_biogaz", names)
        self.assertNotIn("recyclage_mecanique_plastique", names)

    def test_peinture_chimique_is_not_routed_to_regeneration_huiles(self) -> None:
        output = self._analyze("peinture industrie chimique")
        decision = output["decision"]
        profile = output["profile"]
        names = [str(v.get("nom") or "") for v in output["valorisations"]]

        self.assertEqual(decision, "neutralisation_chimique")
        self.assertEqual(profile.get("categorie"), "dechet chimique de peinture/revetement")
        self.assertIn("neutralisation_chimique", names)
        self.assertNotIn("regeneration_huiles", names)


if __name__ == "__main__":
    unittest.main()
