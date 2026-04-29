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


    def test_cementery_constraint_is_reported_without_removing_filiere(self) -> None:
        waste = WasteInput(
            nom="CSR",
            categorie=WasteCategory.OTHER,
            type_dechet=WasteType.OTHER,
            type_industrie=IndustryType.OTHER,
            quantite_kg=800,
            niveau_danger=DangerLevel.LOW,
            description="dechet sec a fort PCI",
            contient_metaux=False,
            pays_cedeao="Benin",
            pci_mj_kg=20,
            taux_humidite_pct=18,
            filiere_cimenterie_autorisee=False,
        )
        result = analyser_dechet(waste)
        classement = result.classement_filieres or []
        cement = next((x for x in classement if x.get("id") == "co_incineration_cimenterie"), None)
        self.assertIsNotNone(cement)
        self.assertTrue(str(cement.get("statut") or "").startswith("Non disponible"))
        self.assertIn("pas de cimenterie", str(cement.get("statut") or "").lower())
        self.assertGreater(len(classement), 4)

    def test_peinture_chimique_is_not_routed_to_regeneration_huiles(self) -> None:
        output = self._analyze("peinture industrie chimique")
        self.assertEqual(output["decision"], "neutralisation_chimique")
        self.assertIn("cedeao", output["explication"].lower())
        self.assertIn("bamako", output["explication"].lower())
        self.assertIn("nature du flux", output["explication"].lower())
        self.assertNotIn("regeneration_huiles", output["explication"].lower())


if __name__ == "__main__":
    unittest.main()