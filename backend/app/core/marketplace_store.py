import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.models.marketplace import (
    ContactSellerRequest,
    ContactSellerResponse,
    ConversationSummary,
    ConversationThread,
    FinalDisposalCreate,
    FinalDisposalRecord,
    Listing,
    ListingCreate,
    ListingStatus,
    ListingUpdate,
    MarketplaceMessage,
    MarketplaceMessageCreate,
    TraceabilityEvent,
    TraceabilityEventCreate,
    User,
    UserCreate,
    WasteLot,
    WasteLotCreate,
    WasteLotStatus,
    WasteLotTimeline,
)

_DATA_DIR = Path(os.getenv("WASTEAI_DATA_DIR", str(Path(__file__).resolve().parents[1] / "data"))).expanduser().resolve()
_DB_PATH = _DATA_DIR / "marketplace.db"


def _connect() -> sqlite3.Connection:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_marketplace_db() -> None:
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                nom TEXT NOT NULL,
                entreprise TEXT NOT NULL,
                email TEXT NOT NULL,
                telephone TEXT NOT NULL,
                localisation TEXT NOT NULL,
                type TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS listings (
                id TEXT PRIMARY KEY,
                titre TEXT NOT NULL,
                categorie TEXT NOT NULL,
                quantite_kg REAL NOT NULL,
                prix_unitaire REAL NOT NULL,
                localisation TEXT NOT NULL,
                description TEXT,
                photo_url TEXT,
                vendeur_id TEXT NOT NULL,
                date_expiration TEXT NOT NULL,
                statut TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (vendeur_id) REFERENCES users(id) ON DELETE RESTRICT
            );

            CREATE TABLE IF NOT EXISTS contacts (
                id TEXT PRIMARY KEY,
                listing_id TEXT NOT NULL,
                vendeur_id TEXT NOT NULL,
                nom TEXT NOT NULL,
                entreprise TEXT,
                email TEXT NOT NULL,
                telephone TEXT,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
                FOREIGN KEY (vendeur_id) REFERENCES users(id) ON DELETE RESTRICT
            );

            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                listing_id TEXT NOT NULL,
                participant_a_id TEXT NOT NULL,
                participant_b_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(listing_id, participant_a_id, participant_b_id),
                FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
                FOREIGN KEY (participant_a_id) REFERENCES users(id) ON DELETE RESTRICT,
                FOREIGN KEY (participant_b_id) REFERENCES users(id) ON DELETE RESTRICT
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                listing_id TEXT NOT NULL,
                sender_id TEXT NOT NULL,
                recipient_id TEXT NOT NULL,
                contenu TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
                FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE RESTRICT,
                FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE RESTRICT
            );

            CREATE TABLE IF NOT EXISTS waste_lots (
                id TEXT PRIMARY KEY,
                listing_id TEXT NOT NULL,
                code_lot TEXT NOT NULL UNIQUE,
                quantite_kg REAL NOT NULL,
                unite TEXT NOT NULL,
                localisation_initiale TEXT NOT NULL,
                statut_courant TEXT NOT NULL,
                commentaire TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS traceability_events (
                id TEXT PRIMARY KEY,
                lot_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                location TEXT NOT NULL,
                actor_user_id TEXT,
                actor_name TEXT,
                proof_ref TEXT,
                note TEXT,
                event_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (lot_id) REFERENCES waste_lots(id) ON DELETE CASCADE,
                FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS final_disposals (
                id TEXT PRIMARY KEY,
                lot_id TEXT NOT NULL UNIQUE,
                disposal_method TEXT NOT NULL,
                facility_name TEXT NOT NULL,
                facility_location TEXT NOT NULL,
                compliance_doc_ref TEXT,
                note TEXT,
                disposed_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (lot_id) REFERENCES waste_lots(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_listings_created_at ON listings(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_listings_vendeur_created ON listings(vendeur_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_listings_statut_created ON listings(statut, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_listings_categorie ON listings(categorie);
            CREATE INDEX IF NOT EXISTS idx_listings_localisation ON listings(localisation);

            CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_conversations_participant_a ON conversations(participant_a_id, updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_conversations_participant_b ON conversations(participant_b_id, updated_at DESC);

            CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_messages_listing_created ON messages(listing_id, created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_traceability_lot_event_time
            ON traceability_events(lot_id, event_at DESC, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_waste_lots_listing_created ON waste_lots(listing_id, created_at DESC);
            """
        )


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _listing_from_row(row: sqlite3.Row) -> Listing:
    return Listing(
        id=row["id"],
        titre=row["titre"],
        categorie=row["categorie"],
        quantite_kg=float(row["quantite_kg"]),
        prix_unitaire=float(row["prix_unitaire"]),
        localisation=row["localisation"],
        description=row["description"],
        photo_url=row["photo_url"],
        vendeur_id=row["vendeur_id"],
        date_expiration=datetime.fromisoformat(row["date_expiration"]),
        statut=ListingStatus(row["statut"]),
    )


def _user_from_row(row: sqlite3.Row) -> User:
    return User(
        id=row["id"],
        nom=row["nom"],
        entreprise=row["entreprise"],
        email=row["email"],
        telephone=row["telephone"],
        localisation=row["localisation"],
        type=row["type"],
    )


def _message_from_row(row: sqlite3.Row) -> MarketplaceMessage:
    return MarketplaceMessage(
        id=row["id"],
        conversation_id=row["conversation_id"],
        listing_id=row["listing_id"],
        sender_id=row["sender_id"],
        recipient_id=row["recipient_id"],
        contenu=row["contenu"],
        created_at=datetime.fromisoformat(row["created_at"]),
    )


def _waste_lot_from_row(row: sqlite3.Row) -> WasteLot:
    return WasteLot(
        id=row["id"],
        listing_id=row["listing_id"],
        code_lot=row["code_lot"],
        quantite_kg=float(row["quantite_kg"]),
        unite=row["unite"],
        localisation_initiale=row["localisation_initiale"],
        statut_courant=WasteLotStatus(row["statut_courant"]),
        commentaire=row["commentaire"],
        date_creation=datetime.fromisoformat(row["created_at"]),
        date_mise_a_jour=datetime.fromisoformat(row["updated_at"]),
    )


def _traceability_event_from_row(row: sqlite3.Row) -> TraceabilityEvent:
    return TraceabilityEvent(
        id=row["id"],
        lot_id=row["lot_id"],
        event_type=WasteLotStatus(row["event_type"]),
        location=row["location"],
        actor_user_id=row["actor_user_id"],
        actor_name=row["actor_name"],
        proof_ref=row["proof_ref"],
        note=row["note"],
        event_at=datetime.fromisoformat(row["event_at"]),
        created_at=datetime.fromisoformat(row["created_at"]),
    )


def _final_disposal_from_row(row: sqlite3.Row) -> FinalDisposalRecord:
    return FinalDisposalRecord(
        id=row["id"],
        lot_id=row["lot_id"],
        disposal_method=row["disposal_method"],
        facility_name=row["facility_name"],
        facility_location=row["facility_location"],
        compliance_doc_ref=row["compliance_doc_ref"],
        note=row["note"],
        disposed_at=datetime.fromisoformat(row["disposed_at"]),
        created_at=datetime.fromisoformat(row["created_at"]),
    )


def _build_listing_filters(
    categorie: str | None = None,
    localisation: str | None = None,
    statut: str | None = None,
    q: str | None = None,
    vendeur_id: str | None = None,
) -> tuple[str, list[object]]:
    clauses: list[str] = []
    params: list[object] = []

    if categorie:
        clauses.append("LOWER(categorie) = LOWER(?)")
        params.append(categorie.strip())
    if localisation:
        clauses.append("LOWER(localisation) LIKE LOWER(?)")
        params.append(f"%{localisation.strip()}%")
    if statut:
        clauses.append("statut = ?")
        params.append(statut.strip())
    if vendeur_id:
        clauses.append("vendeur_id = ?")
        params.append(vendeur_id.strip())
    if q:
        clauses.append("(LOWER(titre) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?) OR LOWER(categorie) LIKE LOWER(?))")
        needle = f"%{q.strip()}%"
        params.extend([needle, needle, needle])

    if not clauses:
        return "", params
    return f" WHERE {' AND '.join(clauses)}", params


def create_user(payload: UserCreate) -> User:
    user_id = str(uuid4())
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO users (id, nom, entreprise, email, telephone, localisation, type, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                payload.nom.strip(),
                payload.entreprise.strip(),
                payload.email.strip(),
                payload.telephone.strip(),
                payload.localisation.strip(),
                payload.type.value,
                _now_iso(),
            ),
        )
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return _user_from_row(row)


def list_users() -> list[User]:
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM users ORDER BY created_at DESC").fetchall()
    return [_user_from_row(r) for r in rows]


def get_user(user_id: str) -> User | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return _user_from_row(row) if row else None


def create_listing(payload: ListingCreate) -> Listing:
    seller = get_user(payload.vendeur_id)
    if not seller or seller.type != "vendeur":
        raise ValueError("vendeur_id introuvable ou non vendeur.")

    listing_id = str(uuid4())
    now = _now_iso()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO listings (
                id, titre, categorie, quantite_kg, prix_unitaire, localisation,
                description, photo_url, vendeur_id, date_expiration, statut,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                listing_id,
                payload.titre.strip(),
                payload.categorie.strip(),
                float(payload.quantite_kg),
                float(payload.prix_unitaire),
                payload.localisation.strip(),
                payload.description,
                payload.photo_url,
                payload.vendeur_id,
                payload.date_expiration.isoformat(),
                payload.statut.value,
                now,
                now,
            ),
        )
        row = conn.execute("SELECT * FROM listings WHERE id = ?", (listing_id,)).fetchone()
    return _listing_from_row(row)


def list_listings(
    categorie: str | None = None,
    localisation: str | None = None,
    statut: str | None = None,
    q: str | None = None,
    vendeur_id: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[Listing], int]:
    safe_limit = max(1, min(100, int(limit)))
    safe_offset = max(0, int(offset))

    where_sql, params = _build_listing_filters(
        categorie=categorie,
        localisation=localisation,
        statut=statut,
        q=q,
        vendeur_id=vendeur_id,
    )

    count_query = f"SELECT COUNT(*) as total FROM listings{where_sql}"
    data_query = f"SELECT * FROM listings{where_sql} ORDER BY created_at DESC LIMIT ? OFFSET ?"

    with _connect() as conn:
        total = int(conn.execute(count_query, tuple(params)).fetchone()["total"])
        rows = conn.execute(data_query, tuple(params + [safe_limit, safe_offset])).fetchall()

    return ([_listing_from_row(r) for r in rows], total)


def get_listing(listing_id: str) -> Listing | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM listings WHERE id = ?", (listing_id,)).fetchone()
    return _listing_from_row(row) if row else None


def update_listing(listing_id: str, payload: ListingUpdate) -> Listing:
    current = get_listing(listing_id)
    if not current:
        raise ValueError("Annonce introuvable.")

    updates = payload.model_dump(exclude_unset=True)
    if "vendeur_id" in updates and updates["vendeur_id"]:
        seller = get_user(str(updates["vendeur_id"]))
        if not seller or seller.type != "vendeur":
            raise ValueError("vendeur_id introuvable ou non vendeur.")

    allowed = {
        "titre",
        "categorie",
        "quantite_kg",
        "prix_unitaire",
        "localisation",
        "description",
        "photo_url",
        "vendeur_id",
        "date_expiration",
        "statut",
    }

    sets: list[str] = []
    params: list[object] = []

    for key, value in updates.items():
        if key not in allowed:
            continue
        if key == "statut" and value is not None:
            value = value.value
        if key == "date_expiration" and value is not None:
            value = value.isoformat()
        sets.append(f"{key} = ?")
        params.append(value)

    if not sets:
        return current

    sets.append("updated_at = ?")
    params.append(_now_iso())
    params.append(listing_id)

    with _connect() as conn:
        conn.execute(f"UPDATE listings SET {', '.join(sets)} WHERE id = ?", tuple(params))
        row = conn.execute("SELECT * FROM listings WHERE id = ?", (listing_id,)).fetchone()

    return _listing_from_row(row)


def delete_listing(listing_id: str) -> None:
    with _connect() as conn:
        cur = conn.execute("DELETE FROM listings WHERE id = ?", (listing_id,))
        if cur.rowcount == 0:
            raise ValueError("Annonce introuvable.")


def contact_seller(listing_id: str, payload: ContactSellerRequest) -> ContactSellerResponse:
    listing = get_listing(listing_id)
    if not listing:
        raise ValueError("Annonce introuvable.")

    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO contacts (id, listing_id, vendeur_id, nom, entreprise, email, telephone, message, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid4()),
                listing_id,
                listing.vendeur_id,
                payload.nom.strip(),
                payload.entreprise,
                payload.email.strip(),
                payload.telephone,
                payload.message.strip(),
                _now_iso(),
            ),
        )

    return ContactSellerResponse(
        status="ok",
        message="Demande de contact enregistree.",
        listing_id=listing_id,
        vendeur_id=listing.vendeur_id,
    )


def _get_or_create_conversation(conn: sqlite3.Connection, listing_id: str, sender_id: str, recipient_id: str) -> str:
    participant_a, participant_b = sorted([sender_id, recipient_id])
    row = conn.execute(
        """
        SELECT id FROM conversations
        WHERE listing_id = ? AND participant_a_id = ? AND participant_b_id = ?
        """,
        (listing_id, participant_a, participant_b),
    ).fetchone()

    now = _now_iso()
    if row:
        conversation_id = row["id"]
        conn.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", (now, conversation_id))
        return conversation_id

    conversation_id = str(uuid4())
    conn.execute(
        """
        INSERT INTO conversations (id, listing_id, participant_a_id, participant_b_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (conversation_id, listing_id, participant_a, participant_b, now, now),
    )
    return conversation_id


def create_message(payload: MarketplaceMessageCreate) -> MarketplaceMessage:
    listing = get_listing(payload.listing_id)
    if not listing:
        raise ValueError("Annonce introuvable.")

    sender = get_user(payload.sender_id)
    recipient = get_user(payload.recipient_id)
    if not sender:
        raise ValueError("Expediteur introuvable.")
    if not recipient:
        raise ValueError("Destinataire introuvable.")
    if payload.sender_id == payload.recipient_id:
        raise ValueError("Impossible de s'envoyer un message a soi-meme.")
    if payload.recipient_id != listing.vendeur_id and payload.sender_id != listing.vendeur_id:
        raise ValueError("Le vendeur de l'annonce doit etre implique dans la conversation.")

    with _connect() as conn:
        conversation_id = _get_or_create_conversation(conn, payload.listing_id, payload.sender_id, payload.recipient_id)
        message_id = str(uuid4())
        now = _now_iso()
        conn.execute(
            """
            INSERT INTO messages (id, conversation_id, listing_id, sender_id, recipient_id, contenu, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                message_id,
                conversation_id,
                payload.listing_id,
                payload.sender_id,
                payload.recipient_id,
                payload.contenu.strip(),
                now,
            ),
        )
        conn.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", (now, conversation_id))
        row = conn.execute("SELECT * FROM messages WHERE id = ?", (message_id,)).fetchone()

    return _message_from_row(row)


def list_conversations_for_user(user_id: str, limit: int = 50) -> list[ConversationSummary]:
    if not get_user(user_id):
        raise ValueError("Utilisateur introuvable.")

    safe_limit = max(1, min(200, int(limit)))
    query = """
        SELECT
            c.id as conversation_id,
            c.listing_id,
            l.titre as listing_titre,
            CASE WHEN c.participant_a_id = ? THEN c.participant_b_id ELSE c.participant_a_id END as other_user_id,
            ou.nom as other_user_nom,
            ou.entreprise as other_user_entreprise,
            m.contenu as last_message,
            m.created_at as last_message_at
        FROM conversations c
        INNER JOIN listings l ON l.id = c.listing_id
        INNER JOIN users ou ON ou.id = CASE WHEN c.participant_a_id = ? THEN c.participant_b_id ELSE c.participant_a_id END
        INNER JOIN messages m ON m.id = (
            SELECT m2.id
            FROM messages m2
            WHERE m2.conversation_id = c.id
            ORDER BY m2.created_at DESC
            LIMIT 1
        )
        WHERE c.participant_a_id = ? OR c.participant_b_id = ?
        ORDER BY c.updated_at DESC
        LIMIT ?
    """

    with _connect() as conn:
        rows = conn.execute(query, (user_id, user_id, user_id, user_id, safe_limit)).fetchall()

    return [
        ConversationSummary(
            conversation_id=r["conversation_id"],
            listing_id=r["listing_id"],
            listing_titre=r["listing_titre"],
            other_user_id=r["other_user_id"],
            other_user_nom=r["other_user_nom"],
            other_user_entreprise=r["other_user_entreprise"],
            last_message=r["last_message"],
            last_message_at=datetime.fromisoformat(r["last_message_at"]),
        )
        for r in rows
    ]


def get_conversation_thread(conversation_id: str, user_id: str) -> ConversationThread:
    if not get_user(user_id):
        raise ValueError("Utilisateur introuvable.")

    with _connect() as conn:
        conv = conn.execute(
            """
            SELECT c.id, c.listing_id, c.participant_a_id, c.participant_b_id, l.titre as listing_titre
            FROM conversations c
            INNER JOIN listings l ON l.id = c.listing_id
            WHERE c.id = ?
            """,
            (conversation_id,),
        ).fetchone()
        if not conv:
            raise ValueError("Conversation introuvable.")

        if user_id not in {conv["participant_a_id"], conv["participant_b_id"]}:
            raise ValueError("Acces refuse a cette conversation.")

        rows = conn.execute(
            """
            SELECT * FROM messages
            WHERE conversation_id = ?
            ORDER BY created_at ASC
            """,
            (conversation_id,),
        ).fetchall()

    return ConversationThread(
        conversation_id=conv["id"],
        listing_id=conv["listing_id"],
        listing_titre=conv["listing_titre"],
        user_a_id=conv["participant_a_id"],
        user_b_id=conv["participant_b_id"],
        messages=[_message_from_row(r) for r in rows],
    )


def list_contacts(limit: int = 200) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM contacts ORDER BY created_at DESC LIMIT ?", (max(1, min(1000, limit)),)).fetchall()
    return [dict(r) for r in rows]


_EVENT_ORDER = {
    WasteLotStatus.DECLARE.value: 1,
    WasteLotStatus.COLLECTE.value: 2,
    WasteLotStatus.TRI.value: 3,
    WasteLotStatus.TRANSPORT.value: 4,
    WasteLotStatus.TRAITEMENT.value: 5,
    WasteLotStatus.ELIMINATION.value: 6,
    WasteLotStatus.CLOTURE.value: 7,
}


def create_waste_lot(payload: WasteLotCreate) -> WasteLot:
    listing = get_listing(payload.listing_id)
    if not listing:
        raise ValueError("Annonce introuvable pour ce lot.")

    lot_id = str(uuid4())
    now = _now_iso()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO waste_lots (
                id, listing_id, code_lot, quantite_kg, unite, localisation_initiale,
                statut_courant, commentaire, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                lot_id,
                payload.listing_id,
                payload.code_lot.strip(),
                float(payload.quantite_kg),
                payload.unite.strip() or "kg",
                payload.localisation_initiale.strip(),
                WasteLotStatus.DECLARE.value,
                payload.commentaire,
                now,
                now,
            ),
        )
        conn.execute(
            """
            INSERT INTO traceability_events (
                id, lot_id, event_type, location, actor_user_id, actor_name, proof_ref, note, event_at, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid4()),
                lot_id,
                WasteLotStatus.DECLARE.value,
                payload.localisation_initiale.strip(),
                None,
                "Systeme WasteAI",
                None,
                "Declaration initiale du lot.",
                now,
                now,
            ),
        )
        row = conn.execute("SELECT * FROM waste_lots WHERE id = ?", (lot_id,)).fetchone()

    return _waste_lot_from_row(row)


def get_waste_lot(lot_id: str) -> WasteLot | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM waste_lots WHERE id = ?", (lot_id,)).fetchone()
    return _waste_lot_from_row(row) if row else None


def list_waste_lots(listing_id: str | None = None, limit: int = 100) -> list[WasteLot]:
    safe_limit = max(1, min(1000, int(limit)))
    query = "SELECT * FROM waste_lots"
    params: list[object] = []
    if listing_id:
        query += " WHERE listing_id = ?"
        params.append(listing_id)
    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(safe_limit)

    with _connect() as conn:
        rows = conn.execute(query, tuple(params)).fetchall()

    return [_waste_lot_from_row(r) for r in rows]


def _validate_event_flow(conn: sqlite3.Connection, lot_id: str, event_type: WasteLotStatus, event_at: datetime) -> None:
    lot_row = conn.execute("SELECT * FROM waste_lots WHERE id = ?", (lot_id,)).fetchone()
    if not lot_row:
        raise ValueError("Lot introuvable.")

    last_event = conn.execute(
        "SELECT * FROM traceability_events WHERE lot_id = ? ORDER BY event_at DESC, created_at DESC LIMIT 1",
        (lot_id,),
    ).fetchone()
    if not last_event:
        return

    last_type = str(last_event["event_type"])
    incoming = event_type.value
    if _EVENT_ORDER.get(incoming, 0) < _EVENT_ORDER.get(last_type, 0):
        raise ValueError("Ordre de tracabilite invalide: l'etape ne peut pas revenir en arriere.")

    last_event_at = datetime.fromisoformat(last_event["event_at"])
    if event_at < last_event_at:
        raise ValueError("Chronologie invalide: la date de l'evenement est anterieure au dernier evenement.")


def add_traceability_event(payload: TraceabilityEventCreate) -> TraceabilityEvent:
    event_time = payload.event_at or datetime.now(timezone.utc)
    with _connect() as conn:
        _validate_event_flow(conn, payload.lot_id, payload.event_type, event_time)

        if payload.actor_user_id:
            if not conn.execute("SELECT id FROM users WHERE id = ?", (payload.actor_user_id,)).fetchone():
                raise ValueError("actor_user_id introuvable.")

        event_id = str(uuid4())
        now = _now_iso()
        conn.execute(
            """
            INSERT INTO traceability_events (
                id, lot_id, event_type, location, actor_user_id, actor_name, proof_ref, note, event_at, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                payload.lot_id,
                payload.event_type.value,
                payload.location.strip(),
                payload.actor_user_id,
                payload.actor_name,
                payload.proof_ref,
                payload.note,
                event_time.isoformat(),
                now,
            ),
        )
        conn.execute(
            "UPDATE waste_lots SET statut_courant = ?, updated_at = ? WHERE id = ?",
            (payload.event_type.value, now, payload.lot_id),
        )
        row = conn.execute("SELECT * FROM traceability_events WHERE id = ?", (event_id,)).fetchone()

    return _traceability_event_from_row(row)


def get_lot_timeline(lot_id: str) -> WasteLotTimeline:
    lot = get_waste_lot(lot_id)
    if not lot:
        raise ValueError("Lot introuvable.")

    with _connect() as conn:
        events = conn.execute(
            "SELECT * FROM traceability_events WHERE lot_id = ? ORDER BY event_at ASC, created_at ASC",
            (lot_id,),
        ).fetchall()
        disposal = conn.execute("SELECT * FROM final_disposals WHERE lot_id = ?", (lot_id,)).fetchone()

    return WasteLotTimeline(
        lot=lot,
        events=[_traceability_event_from_row(r) for r in events],
        final_disposal=_final_disposal_from_row(disposal) if disposal else None,
    )


def register_final_disposal(payload: FinalDisposalCreate) -> FinalDisposalRecord:
    lot = get_waste_lot(payload.lot_id)
    if not lot:
        raise ValueError("Lot introuvable.")

    if lot.statut_courant not in {WasteLotStatus.TRAITEMENT, WasteLotStatus.ELIMINATION, WasteLotStatus.CLOTURE}:
        raise ValueError("Elimination finale autorisee uniquement apres traitement.")

    with _connect() as conn:
        already = conn.execute("SELECT id FROM final_disposals WHERE lot_id = ?", (payload.lot_id,)).fetchone()
        if already:
            raise ValueError("Un enregistrement d'elimination existe deja pour ce lot.")

        disposal_id = str(uuid4())
        now = _now_iso()
        conn.execute(
            """
            INSERT INTO final_disposals (
                id, lot_id, disposal_method, facility_name, facility_location,
                compliance_doc_ref, note, disposed_at, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                disposal_id,
                payload.lot_id,
                payload.disposal_method.strip(),
                payload.facility_name.strip(),
                payload.facility_location.strip(),
                payload.compliance_doc_ref,
                payload.note,
                payload.disposed_at.isoformat(),
                now,
            ),
        )

        conn.execute(
            """
            INSERT INTO traceability_events (
                id, lot_id, event_type, location, actor_user_id, actor_name, proof_ref, note, event_at, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid4()),
                payload.lot_id,
                WasteLotStatus.ELIMINATION.value,
                payload.facility_location.strip(),
                None,
                payload.facility_name.strip(),
                payload.compliance_doc_ref,
                payload.note,
                payload.disposed_at.isoformat(),
                now,
            ),
        )
        conn.execute(
            "UPDATE waste_lots SET statut_courant = ?, updated_at = ? WHERE id = ?",
            (WasteLotStatus.CLOTURE.value, now, payload.lot_id),
        )

        row = conn.execute("SELECT * FROM final_disposals WHERE id = ?", (disposal_id,)).fetchone()

    return _final_disposal_from_row(row)


init_marketplace_db()



