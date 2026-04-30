import os
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from app.core.actor_matching import LocalActorMatchInput, LocalActorMatchItem, match_local_actors
from app.core.marketplace_agent import MarketplaceMatchInput, MarketplaceMatchOutput, run_marketplace_matching
from app.core.marketplace_store import (
    add_traceability_event,
    contact_seller,
    create_listing,
    create_message,
    create_user,
    create_waste_lot,
    delete_listing,
    get_conversation_thread,
    get_listing,
    get_lot_timeline,
    get_user,
    list_contacts,
    list_conversations_for_user,
    list_listings,
    list_users,
    list_waste_lots,
    register_final_disposal,
    update_listing,
)
from app.models.marketplace import (
    ContactSellerRequest,
    FinalDisposalCreate,
    Listing,
    ListingCreate,
    ListingUpdate,
    MarketplaceMessage,
    MarketplaceMessageCreate,
    TraceabilityEvent,
    TraceabilityEventCreate,
    User,
    UserCreate,
    WasteLot,
    WasteLotCreate,
    WasteLotTimeline,
)

router = APIRouter(prefix="/api/marketplace", tags=["marketplace"])

_DATA_DIR = Path(os.getenv("WASTEAI_DATA_DIR", str(Path(__file__).resolve().parents[1] / "data"))).expanduser().resolve()
_UPLOADS_DIR = _DATA_DIR / "uploads"
_ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp"}
_MAX_UPLOAD_BYTES = 5 * 1024 * 1024


@router.post("/users", response_model=User)
def post_marketplace_user(payload: UserCreate):
    return create_user(payload)


@router.get("/users")
def get_marketplace_users(type: str | None = None):
    users = list_users()
    if type:
        users = [u for u in users if u.type == type]
    return {"items": [u.model_dump(mode="json") for u in users], "count": len(users)}


@router.get("/users/{user_id}", response_model=User)
def get_marketplace_user(user_id: str):
    user = get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")
    return user


@router.post("/upload-photo")
async def post_marketplace_upload_photo(photo: UploadFile = File(...)):
    suffix = Path(photo.filename or "").suffix.lower()
    if suffix not in _ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="Format image invalide. Utilise jpg, png ou webp.")

    content = await photo.read()
    if not content:
        raise HTTPException(status_code=400, detail="Fichier vide.")
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Image trop volumineuse (max 5 MB).")

    _UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid4()}{suffix}"
    target = _UPLOADS_DIR / filename
    target.write_bytes(content)

    return {
        "status": "ok",
        "photo_url": f"/uploads/{filename}",
        "filename": filename,
        "size_bytes": len(content),
    }


@router.post("/listings", response_model=Listing)
def post_marketplace_listing(payload: ListingCreate):
    try:
        return create_listing(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/listings")
def get_marketplace_listings(
    categorie: str | None = None,
    localisation: str | None = None,
    statut: str | None = None,
    q: str | None = None,
    vendeur_id: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    items, total = list_listings(
        categorie=categorie,
        localisation=localisation,
        statut=statut,
        q=q,
        vendeur_id=vendeur_id,
        limit=limit,
        offset=offset,
    )
    return {
        "items": [x.model_dump(mode="json") for x in items],
        "count": len(items),
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/listings/{id}", response_model=Listing)
def get_marketplace_listing(id: str):
    listing = get_listing(id)
    if not listing:
        raise HTTPException(status_code=404, detail="Annonce introuvable.")
    return listing


@router.put("/listings/{id}", response_model=Listing)
def put_marketplace_listing(id: str, payload: ListingUpdate):
    try:
        return update_listing(id, payload)
    except ValueError as exc:
        detail = str(exc)
        code = 404 if "introuvable" in detail.lower() else 400
        raise HTTPException(status_code=code, detail=detail) from exc


@router.delete("/listings/{id}")
def delete_marketplace_listing(id: str):
    try:
        delete_listing(id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"status": "ok", "message": "Annonce supprimee."}


@router.post("/messages", response_model=MarketplaceMessage)
def post_marketplace_message(payload: MarketplaceMessageCreate):
    try:
        return create_message(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/messages/conversations")
def get_marketplace_conversations(user_id: str, limit: int = Query(default=50, ge=1, le=200)):
    try:
        items = list_conversations_for_user(user_id=user_id, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"items": [x.model_dump(mode="json") for x in items], "count": len(items)}


@router.get("/messages/thread/{conversation_id}")
def get_marketplace_conversation_thread(conversation_id: str, user_id: str):
    try:
        thread = get_conversation_thread(conversation_id=conversation_id, user_id=user_id)
    except ValueError as exc:
        text = str(exc)
        code = 404 if "introuvable" in text.lower() else 400
        raise HTTPException(status_code=code, detail=text) from exc
    return thread.model_dump(mode="json")


@router.post("/contact/{listing_id}")
def post_contact_seller(listing_id: str, payload: ContactSellerRequest):
    try:
        return contact_seller(listing_id, payload).model_dump(mode="json")
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/contacts")
def get_marketplace_contacts(limit: int = Query(default=200, ge=1, le=1000)):
    items = list_contacts(limit=limit)
    return {"items": items, "count": len(items)}


@router.post("/traceability/lots", response_model=WasteLot)
def post_traceability_lot(payload: WasteLotCreate):
    try:
        return create_waste_lot(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/traceability/lots")
def get_traceability_lots(listing_id: str | None = None, limit: int = Query(default=100, ge=1, le=1000)):
    items = list_waste_lots(listing_id=listing_id, limit=limit)
    return {"items": [x.model_dump(mode="json") for x in items], "count": len(items)}


@router.post("/traceability/events", response_model=TraceabilityEvent)
def post_traceability_event(payload: TraceabilityEventCreate):
    try:
        return add_traceability_event(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/traceability/final-disposal")
def post_traceability_final_disposal(payload: FinalDisposalCreate):
    try:
        record = register_final_disposal(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return record.model_dump(mode="json")


@router.get("/traceability/timeline/{lot_id}", response_model=WasteLotTimeline)
def get_traceability_timeline(lot_id: str):
    try:
        return get_lot_timeline(lot_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc




@router.post("/match", response_model=MarketplaceMatchOutput)
def post_marketplace_match(payload: MarketplaceMatchInput):
    return run_marketplace_matching(payload)


@router.post('/actors/match', response_model=list[LocalActorMatchItem])
def post_actor_match(payload: LocalActorMatchInput):
    return match_local_actors(payload)
