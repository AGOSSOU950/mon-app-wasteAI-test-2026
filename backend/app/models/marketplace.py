from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class UserType(str, Enum):
    VENDEUR = "vendeur"
    ACHETEUR = "acheteur"


class ListingStatus(str, Enum):
    ACTIF = "actif"
    EXPIRE = "expire"
    ARCHIVE = "archive"


class UserCreate(BaseModel):
    nom: str
    entreprise: str
    email: str
    telephone: str
    localisation: str
    type: UserType


class User(BaseModel):
    id: str
    nom: str
    entreprise: str
    email: str
    telephone: str
    localisation: str
    type: UserType


class ListingCreate(BaseModel):
    titre: str
    categorie: str
    quantite_kg: float = Field(gt=0)
    prix_unitaire: float = Field(gt=0)
    localisation: str
    description: Optional[str] = None
    photo_url: Optional[str] = None
    vendeur_id: str
    date_expiration: datetime
    statut: ListingStatus = ListingStatus.ACTIF


class ListingUpdate(BaseModel):
    titre: Optional[str] = None
    categorie: Optional[str] = None
    quantite_kg: Optional[float] = Field(default=None, gt=0)
    prix_unitaire: Optional[float] = Field(default=None, gt=0)
    localisation: Optional[str] = None
    description: Optional[str] = None
    photo_url: Optional[str] = None
    vendeur_id: Optional[str] = None
    date_expiration: Optional[datetime] = None
    statut: Optional[ListingStatus] = None


class Listing(BaseModel):
    id: str
    titre: str
    categorie: str
    quantite_kg: float
    prix_unitaire: float
    localisation: str
    description: Optional[str] = None
    photo_url: Optional[str] = None
    vendeur_id: str
    date_expiration: datetime
    statut: ListingStatus


class ContactSellerRequest(BaseModel):
    nom: str
    entreprise: Optional[str] = None
    email: str
    telephone: Optional[str] = None
    message: str


class ContactSellerResponse(BaseModel):
    status: str
    message: str
    listing_id: str
    vendeur_id: str


class MarketplaceMessageCreate(BaseModel):
    listing_id: str
    sender_id: str
    recipient_id: str
    contenu: str = Field(min_length=1, max_length=2000)


class MarketplaceMessage(BaseModel):
    id: str
    conversation_id: str
    listing_id: str
    sender_id: str
    recipient_id: str
    contenu: str
    created_at: datetime


class ConversationSummary(BaseModel):
    conversation_id: str
    listing_id: str
    listing_titre: str
    other_user_id: str
    other_user_nom: str
    other_user_entreprise: str
    last_message: str
    last_message_at: datetime


class ConversationThread(BaseModel):
    conversation_id: str
    listing_id: str
    listing_titre: str
    user_a_id: str
    user_b_id: str
    messages: list[MarketplaceMessage]
class WasteLotStatus(str, Enum):
    DECLARE = "declare"
    COLLECTE = "collecte"
    TRI = "tri"
    TRANSPORT = "transport"
    TRAITEMENT = "traitement"
    ELIMINATION = "elimination"
    CLOTURE = "cloture"


class WasteLotCreate(BaseModel):
    listing_id: str
    code_lot: str = Field(min_length=2, max_length=80)
    quantite_kg: float = Field(gt=0)
    unite: str = "kg"
    localisation_initiale: str
    commentaire: Optional[str] = None


class WasteLot(BaseModel):
    id: str
    listing_id: str
    code_lot: str
    quantite_kg: float
    unite: str
    localisation_initiale: str
    statut_courant: WasteLotStatus
    commentaire: Optional[str] = None
    date_creation: datetime
    date_mise_a_jour: datetime


class TraceabilityEventCreate(BaseModel):
    lot_id: str
    event_type: WasteLotStatus
    location: str
    actor_user_id: Optional[str] = None
    actor_name: Optional[str] = None
    proof_ref: Optional[str] = Field(default=None, max_length=255)
    note: Optional[str] = Field(default=None, max_length=1200)
    event_at: Optional[datetime] = None


class TraceabilityEvent(BaseModel):
    id: str
    lot_id: str
    event_type: WasteLotStatus
    location: str
    actor_user_id: Optional[str] = None
    actor_name: Optional[str] = None
    proof_ref: Optional[str] = None
    note: Optional[str] = None
    event_at: datetime
    created_at: datetime


class FinalDisposalCreate(BaseModel):
    lot_id: str
    disposal_method: str
    facility_name: str
    facility_location: str
    compliance_doc_ref: Optional[str] = Field(default=None, max_length=255)
    note: Optional[str] = Field(default=None, max_length=1200)
    disposed_at: datetime


class FinalDisposalRecord(BaseModel):
    id: str
    lot_id: str
    disposal_method: str
    facility_name: str
    facility_location: str
    compliance_doc_ref: Optional[str] = None
    note: Optional[str] = None
    disposed_at: datetime
    created_at: datetime


class WasteLotTimeline(BaseModel):
    lot: WasteLot
    events: list[TraceabilityEvent]
    final_disposal: Optional[FinalDisposalRecord] = None

