from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class WasteCategory(str, Enum):
    ORGANIC = "organique"
    CHEMICAL = "chimique"
    METAL = "metal"
    PLASTIC = "plastique"
    ELECTRONIC = "electronique"
    PAPER = "papier"
    GLASS = "verre"
    OTHER = "autre"


class WasteType(str, Enum):
    BIOMASSE_LIGNOCELLULOSIQUE = "biomasse_lignocellulosique"
    BOUE_DE_VIDANGE = "boue_de_vidange"
    HUILE_USAGEE = "huile_usagee"
    TEXTILE = "textile"
    PLASTIQUE = "plastique"
    OTHER = "autre"


class IndustryType(str, Enum):
    AGROALIMENTAIRE = "agroalimentaire"
    METALLURGIE = "metallurgie"
    CHIMIE = "chimie"
    TEXTILE = "textile"
    AUTOMOBILE = "automobile"
    CONSTRUCTION = "construction"
    ENERGIE = "energie"
    OTHER = "autre"


class DangerLevel(str, Enum):
    LOW = "faible"
    MEDIUM = "moyen"
    HIGH = "eleve"
    CRITICAL = "critique"


class WasteInput(BaseModel):
    nom: str
    categorie: WasteCategory
    type_dechet: WasteType = WasteType.OTHER
    type_industrie: IndustryType = IndustryType.OTHER
    quantite_kg: float
    niveau_danger: DangerLevel
    description: Optional[str] = None
    contient_metaux: bool = False

    # Contexte reglementaire CEDEAO
    pays_cedeao: Optional[str] = None
    sous_region_cedeao: Optional[str] = None

    # Caracteristiques optionnelles
    pci_mj_kg: Optional[float] = None
    taux_lignine_pct: Optional[float] = None
    dbo_mg_l: Optional[float] = None
    dco_mg_l: Optional[float] = None
    produit_principal: Optional[str] = None

    # Caracterisation textile
    composition_textile: Optional[str] = None
    etat_textile: Optional[str] = None
    origine_flux: Optional[str] = None
    presence_metaux_lourds: Optional[bool] = None

    # Caracterisation plastique
    type_plastique: Optional[str] = None
    taux_contamination_pct: Optional[float] = None
    presence_colorants: Optional[bool] = None
    presence_additifs: Optional[bool] = None
    presence_chlore: Optional[bool] = None
    filiere_cimenterie_autorisee: Optional[bool] = None


class WasteImageIdentificationInput(BaseModel):
    image_base64: str
    media_type: str
    filename: Optional[str] = None


class WasteImageIdentificationResult(BaseModel):
    nom: str
    categorie: WasteCategory
    type_dechet: WasteType
    confiance: str
    description_estimee: Optional[str] = None
    avertissement: Optional[str] = None


class DecisionResult(BaseModel):
    decision: str
    score: float
    confiance: str
    explication: str
    resume_choix: str = ""
    details_scores: dict[str, float] = Field(default_factory=dict)
    details_scores_bruts: dict[str, float] = Field(default_factory=dict)
    detail_scoring: dict[str, list[dict[str, object]]] = Field(default_factory=dict)
    facteurs_cles: list[str] = Field(default_factory=list)
    contraintes_appliquees: list[str] = Field(default_factory=list)
    options_bloquees: list[str] = Field(default_factory=list)
    valeurs_reference_appliquees: dict[str, float | str] = Field(default_factory=dict)
    conformite_reglementaire: dict[str, object] = Field(default_factory=dict)
    impact_environnemental: dict[str, object] = Field(default_factory=dict)
    reference_litterature: Optional[str] = None
    references_bibliographiques: list[str] = Field(default_factory=list)
    references_reglementaires: list[str] = Field(default_factory=list)
    valeur_estimee: Optional[float] = None
    options_alternatives: list[str] = Field(default_factory=list)

    # Nouveau format multicriteres explicite
    decision_principale: Optional[str] = None
    justification_technique: Optional[str] = None
    justification_economique: Optional[str] = None
    justification_environnementale: Optional[str] = None
    justification_sociale: Optional[str] = None
    score_global: Optional[float] = None
    alternatives: list[dict[str, object]] = Field(default_factory=list)
    conditions_requises: Optional[str] = None
    avertissements: Optional[str] = None
    donnees_manquantes_critiques: list[str] = Field(default_factory=list)
    hypotheses_utilisees: list[str] = Field(default_factory=list)






