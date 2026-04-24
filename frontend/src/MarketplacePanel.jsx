import { memo, useMemo } from "react"
import wasteMarketImage from "./assets/waste-market.svg"
import wastePlasticImage from "./assets/waste-plastic.svg"
import wasteTextileImage from "./assets/waste-textile.svg"
import wasteOrganicImage from "./assets/waste-organic.svg"
import MarketplaceCatalogSection from "./marketplace/MarketplaceCatalogSection"
import MarketplaceMessagingSection from "./marketplace/MarketplaceMessagingSection"
import MarketplaceTraceabilitySection from "./marketplace/MarketplaceTraceabilitySection"
import {
  MarketplaceCatalogProvider,
  MarketplaceMessagingProvider,
  MarketplaceTraceabilityProvider
} from "./marketplace/MarketplaceContext"
import { API_BASE, useMarketplace } from "./hooks/useMarketplace"

const STATUS_STYLES = {
  actif: { color: "#155724", background: "#d4edda", border: "1px solid #b7dfc0" },
  expire: { color: "#7a4b00", background: "#ffe8c2", border: "1px solid #f5d291" },
  archive: { color: "#4f5f66", background: "#e5ebef", border: "1px solid #d0d9de" }
}

const CATEGORY_VISUALS = {
  plastique: wastePlasticImage,
  textile: wasteTextileImage,
  organique: wasteOrganicImage,
  biomasse_lignocellulosique: wasteOrganicImage,
  boue_de_vidange: wasteOrganicImage,
  default: wasteMarketImage
}

function getCategoryVisual(category) {
  if (!category) return CATEGORY_VISUALS.default
  const key = String(category).toLowerCase().trim()
  return CATEGORY_VISUALS[key] || CATEGORY_VISUALS.default
}

function toAbsolutePhoto(url) {
  if (!url) return ""
  if (url.startsWith("http://") || url.startsWith("https://")) return url
  return `${API_BASE}${url}`
}

const StatusBadge = memo(function StatusBadge({ statut }) {
  const style = STATUS_STYLES[statut] || STATUS_STYLES.archive
  return <span style={{ ...badgeBase, ...style }}>{statut}</span>
})

const OfferCard = memo(function OfferCard({ item, onOpenDetail }) {
  return (
    <div style={card}>
      <div style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 10 }}>
        <div style={thumbWrap}>
          <img src={item.photo_url ? toAbsolutePhoto(item.photo_url) : getCategoryVisual(item.categorie)} alt={item.titre} style={thumb} />
        </div>
        <div>
          <p style={title}>{item.titre}</p>
          <p style={meta}>{item.categorie} | {item.localisation}</p>
          <p style={price}>{Number(item.prix_unitaire).toFixed(2)} EUR/kg</p>
          <p style={meta}>Quantite: {item.quantite_kg} kg</p>
          <StatusBadge statut={item.statut} />
          <p style={meta}>Expire le: {new Date(item.date_expiration).toLocaleDateString()}</p>
          <button style={btnSecondary} onClick={() => onOpenDetail(item.id)}>Voir detail</button>
        </div>
      </div>
    </div>
  )
})

const OwnedListingCard = memo(function OwnedListingCard({ item, isEditing, editForm, onStartEdit, onCancelEdit, onChangeEdit, onSaveEdit, onDelete }) {
  return (
    <div style={ownedCard}>
      {!isEditing && (
        <>
          <p style={title}>{item.titre}</p>
          <p style={meta}>{item.categorie} | {item.localisation}</p>
          <p style={meta}>Quantite: {item.quantite_kg} kg | Prix: {Number(item.prix_unitaire).toFixed(2)} EUR/kg</p>
          <StatusBadge statut={item.statut} />
          <p style={meta}>Expiration: {new Date(item.date_expiration).toLocaleString()}</p>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <button style={btnSecondary} onClick={() => onStartEdit(item)}>Modifier</button>
            <button style={btnDanger} onClick={() => onDelete(item.id, item.titre)}>Supprimer</button>
          </div>
        </>
      )}

      {isEditing && (
        <>
          <div style={grid2}>
            <input style={inp} placeholder="Titre" value={editForm.titre} onChange={e => onChangeEdit({ ...editForm, titre: e.target.value })} />
            <input style={inp} placeholder="Categorie" value={editForm.categorie} onChange={e => onChangeEdit({ ...editForm, categorie: e.target.value })} />
            <input style={inp} type="number" step="0.1" placeholder="Quantite kg" value={editForm.quantite_kg} onChange={e => onChangeEdit({ ...editForm, quantite_kg: e.target.value })} />
            <input style={inp} type="number" step="0.01" placeholder="Prix EUR/kg" value={editForm.prix_unitaire} onChange={e => onChangeEdit({ ...editForm, prix_unitaire: e.target.value })} />
            <input style={inp} placeholder="Localisation" value={editForm.localisation} onChange={e => onChangeEdit({ ...editForm, localisation: e.target.value })} />
            <input style={inp} placeholder="Photo URL" value={editForm.photo_url} onChange={e => onChangeEdit({ ...editForm, photo_url: e.target.value })} />
            <input style={inp} type="datetime-local" value={editForm.date_expiration} onChange={e => onChangeEdit({ ...editForm, date_expiration: e.target.value })} />
            <select style={inp} value={editForm.statut} onChange={e => onChangeEdit({ ...editForm, statut: e.target.value })}>
              {["actif", "expire", "archive"].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <textarea style={{ ...inp, minHeight: 80 }} placeholder="Description" value={editForm.description} onChange={e => onChangeEdit({ ...editForm, description: e.target.value })} />
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            <button style={btn} onClick={onSaveEdit}>Enregistrer</button>
            <button style={btnSecondary} onClick={onCancelEdit}>Annuler</button>
          </div>
        </>
      )}
    </div>
  )
})

const Pager = memo(function Pager({ offset, limit, total, onPrevious, onNext }) {
  const start = total === 0 ? 0 : offset + 1
  const end = Math.min(offset + limit, total)
  const hasPrevious = offset > 0
  const hasNext = offset + limit < total

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
      <button style={btnSecondary} onClick={onPrevious} disabled={!hasPrevious}>Precedent</button>
      <button style={btnSecondary} onClick={onNext} disabled={!hasNext}>Suivant</button>
      <span style={{ color: "#4f6359", fontSize: 13 }}>
        {start}-{end} sur {total}
      </span>
    </div>
  )
})

export default function MarketplacePanel() {
  const marketplace = useMarketplace()

  const styles = useMemo(() => ({
    section,
    h3,
    hint,
    subAccordion,
    subSummary,
    grid2,
    grid3,
    inp,
    btn,
    btnSecondary,
    ownedCard,
    convBtn,
    convBtnActive,
    msgMine,
    msgOther,
    thumbWrap,
    thumbWrapLarge,
    thumb,
    thumbLarge,
    title,
    meta
  }), [])

  const sharedView = useMemo(() => ({
    styles,
    toAbsolutePhoto,
    getCategoryVisual,
    StatusBadge,
    OfferCard,
    OwnedListingCard,
    Pager
  }), [styles])

  const catalogValue = useMemo(() => ({
    ...sharedView,
    sellerForm: marketplace.sellerForm,
    setSellerForm: marketplace.setSellerForm,
    buyerForm: marketplace.buyerForm,
    setBuyerForm: marketplace.setBuyerForm,
    createSeller: marketplace.createSeller,
    createBuyer: marketplace.createBuyer,
    listingForm: marketplace.listingForm,
    setListingForm: marketplace.setListingForm,
    vendeurOptions: marketplace.vendeurOptions,
    uploadPhoto: marketplace.uploadPhoto,
    uploadingPhoto: marketplace.uploadingPhoto,
    createListing: marketplace.createListing,
    filters: marketplace.filters,
    setFilters: marketplace.setFilters,
    applyPublicFilters: marketplace.applyPublicFilters,
    loading: marketplace.loading,
    listings: marketplace.listings,
    fetchDetail: marketplace.fetchDetail,
    listPager: marketplace.listPager,
    fetchListings: marketplace.fetchListings,
    selectedListing: marketplace.selectedListing,
    contactForm: marketplace.contactForm,
    setContactForm: marketplace.setContactForm,
    acheteurOptions: marketplace.acheteurOptions,
    contactSeller: marketplace.contactSeller,
    activeSellerId: marketplace.activeSellerId,
    setActiveSellerId: marketplace.setActiveSellerId,
    setEditListingId: marketplace.setEditListingId,
    setEditForm: marketplace.setEditForm,
    fetchSellerListings: marketplace.fetchSellerListings,
    sellerFilters: marketplace.sellerFilters,
    setSellerFilters: marketplace.setSellerFilters,
    applySellerFilters: marketplace.applySellerFilters,
    sellerPager: marketplace.sellerPager,
    sellerListings: marketplace.sellerListings,
    startEditOwnedListing: marketplace.startEditOwnedListing,
    saveOwnedListing: marketplace.saveOwnedListing,
    deleteOwnedListing: marketplace.deleteOwnedListing,
    editListingId: marketplace.editListingId,
    editForm: marketplace.editForm
  }), [
    sharedView,
    marketplace.sellerForm,
    marketplace.setSellerForm,
    marketplace.buyerForm,
    marketplace.setBuyerForm,
    marketplace.createSeller,
    marketplace.createBuyer,
    marketplace.listingForm,
    marketplace.setListingForm,
    marketplace.vendeurOptions,
    marketplace.uploadPhoto,
    marketplace.uploadingPhoto,
    marketplace.createListing,
    marketplace.filters,
    marketplace.setFilters,
    marketplace.applyPublicFilters,
    marketplace.loading,
    marketplace.listings,
    marketplace.fetchDetail,
    marketplace.listPager,
    marketplace.fetchListings,
    marketplace.selectedListing,
    marketplace.contactForm,
    marketplace.setContactForm,
    marketplace.acheteurOptions,
    marketplace.contactSeller,
    marketplace.activeSellerId,
    marketplace.setActiveSellerId,
    marketplace.setEditListingId,
    marketplace.setEditForm,
    marketplace.fetchSellerListings,
    marketplace.sellerFilters,
    marketplace.setSellerFilters,
    marketplace.applySellerFilters,
    marketplace.sellerPager,
    marketplace.sellerListings,
    marketplace.startEditOwnedListing,
    marketplace.saveOwnedListing,
    marketplace.deleteOwnedListing,
    marketplace.editListingId,
    marketplace.editForm
  ])

  const messagingValue = useMemo(() => ({
    ...sharedView,
    users: marketplace.users,
    messagingUserId: marketplace.messagingUserId,
    setMessagingUserId: marketplace.setMessagingUserId,
    fetchConversations: marketplace.fetchConversations,
    loadingConversations: marketplace.loadingConversations,
    conversations: marketplace.conversations,
    selectedConversationId: marketplace.selectedConversationId,
    fetchConversationThread: marketplace.fetchConversationThread,
    conversationThread: marketplace.conversationThread,
    loadingThread: marketplace.loadingThread,
    replyText: marketplace.replyText,
    setReplyText: marketplace.setReplyText,
    sendReply: marketplace.sendReply
  }), [
    sharedView,
    marketplace.users,
    marketplace.messagingUserId,
    marketplace.setMessagingUserId,
    marketplace.fetchConversations,
    marketplace.loadingConversations,
    marketplace.conversations,
    marketplace.selectedConversationId,
    marketplace.fetchConversationThread,
    marketplace.conversationThread,
    marketplace.loadingThread,
    marketplace.replyText,
    marketplace.setReplyText,
    marketplace.sendReply
  ])

  const traceabilityValue = useMemo(() => ({
    ...sharedView,
    listings: marketplace.listings,
    traceListingId: marketplace.traceListingId,
    setTraceListingId: marketplace.setTraceListingId,
    fetchTraceabilityLots: marketplace.fetchTraceabilityLots,
    traceLotForm: marketplace.traceLotForm,
    setTraceLotForm: marketplace.setTraceLotForm,
    createTraceabilityLot: marketplace.createTraceabilityLot,
    traceLots: marketplace.traceLots,
    selectTraceLot: marketplace.selectTraceLot,
    traceEventForm: marketplace.traceEventForm,
    setTraceEventForm: marketplace.setTraceEventForm,
    addTraceabilityEvent: marketplace.addTraceabilityEvent,
    traceFinalForm: marketplace.traceFinalForm,
    setTraceFinalForm: marketplace.setTraceFinalForm,
    addFinalDisposal: marketplace.addFinalDisposal,
    traceTimeline: marketplace.traceTimeline
  }), [
    sharedView,
    marketplace.listings,
    marketplace.traceListingId,
    marketplace.setTraceListingId,
    marketplace.fetchTraceabilityLots,
    marketplace.traceLotForm,
    marketplace.setTraceLotForm,
    marketplace.createTraceabilityLot,
    marketplace.traceLots,
    marketplace.selectTraceLot,
    marketplace.traceEventForm,
    marketplace.setTraceEventForm,
    marketplace.addTraceabilityEvent,
    marketplace.traceFinalForm,
    marketplace.setTraceFinalForm,
    marketplace.addFinalDisposal,
    marketplace.traceTimeline
  ])

  return (
    <div style={{ marginTop: 20 }}>
      <section style={marketHero}>
        <div>
          <h2 style={{ color: "#1f513d", margin: "0 0 8px" }}>Marketplace B2B dechets industriels</h2>
          <p style={{ marginTop: 0, color: "#3e5b50" }}>Publication d'offres, consultation detaillee et messagerie directe acheteur-vendeur.</p>
          <p style={{ margin: 0, color: "#4f675d", fontSize: 13 }}>Astuce: ajoute une photo et une description precise pour accelerer la conversion de vos offres.</p>
        </div>
        <img src={wasteMarketImage} alt="Marche B2B des dechets" style={marketHeroImg} />
      </section>

      {!!marketplace.message && <p style={{ color: "#315848", marginTop: 6 }}>{marketplace.message}</p>}

      <MarketplaceCatalogProvider value={catalogValue}>
        <MarketplaceCatalogSection />
      </MarketplaceCatalogProvider>

      <MarketplaceMessagingProvider value={messagingValue}>
        <MarketplaceMessagingSection />
      </MarketplaceMessagingProvider>

      <MarketplaceTraceabilityProvider value={traceabilityValue}>
        <MarketplaceTraceabilitySection />
      </MarketplaceTraceabilityProvider>
    </div>
  )
}

const marketHero = { background: "linear-gradient(135deg, #eef7f2 0%, #dbeee2 100%)", border: "1px solid #c7ddd0", borderRadius: 16, padding: 14, marginBottom: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, alignItems: "center" }
const marketHeroImg = { width: "100%", height: 170, objectFit: "cover", borderRadius: 12, border: "1px solid #c8ddd0", background: "#d7e8df" }
const section = { background: "#f3f8f5", border: "1px solid #c7ddd0", borderRadius: 12, padding: 14, marginBottom: 14 }
const h3 = { marginTop: 0, color: "#2d6a4f" }
const hint = { marginTop: 0, marginBottom: 8, color: "#5a7166", fontSize: 13 }
const subAccordion = { marginTop: 8, marginBottom: 10, background: "#fff", border: "1px solid #d5e3da", borderRadius: 10, padding: 10 }
const subSummary = { cursor: "pointer", color: "#244b3a", fontWeight: 700, fontSize: 13 }
const grid2 = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }
const grid3 = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }
const inp = { display: "block", width: "100%", padding: "9px 12px", margin: "6px 0 10px", borderRadius: 8, border: "1px solid #cfe0d5", fontSize: 14, boxSizing: "border-box", background: "#fff" }
const btn = { background: "#1f7a55", color: "white", border: "none", padding: "10px 14px", borderRadius: 10, cursor: "pointer" }
const btnSecondary = { background: "#e6eee9", color: "#1f513d", border: "1px solid #b7cdbf", padding: "8px 12px", borderRadius: 8, cursor: "pointer" }
const btnDanger = { background: "#fceceb", color: "#8b1f1f", border: "1px solid #efc6c2", padding: "8px 12px", borderRadius: 8, cursor: "pointer" }
const card = { background: "#fff", border: "1px solid #d6e4dc", borderRadius: 10, padding: 10 }
const ownedCard = { background: "#fff", border: "1px solid #d6e4dc", borderRadius: 10, padding: 12 }
const thumbWrap = { width: 96, height: 96, borderRadius: 8, overflow: "hidden", background: "#eef5f0", border: "1px solid #d6e4dc" }
const thumbWrapLarge = { width: 160, height: 140, borderRadius: 8, overflow: "hidden", background: "#eef5f0", border: "1px solid #d6e4dc" }
const thumb = { width: "100%", height: "100%", objectFit: "cover" }
const thumbLarge = { width: "100%", height: "100%", objectFit: "cover" }
const title = { margin: "0 0 6px", color: "#244b3a", fontWeight: 700 }
const meta = { margin: "0 0 4px", color: "#4f6359", fontSize: 13 }
const price = { margin: "0 0 4px", color: "#1f513d", fontWeight: 700 }
const badgeBase = { margin: "4px 0 8px", fontSize: 12, display: "inline-block", padding: "2px 8px", borderRadius: 999 }
const convBtn = { width: "100%", border: "1px solid #d6e4dc", borderRadius: 8, background: "#fff", padding: 8, marginBottom: 8, cursor: "pointer" }
const convBtnActive = { ...convBtn, border: "1px solid #93b9a4", background: "#eff7f2" }
const msgMine = { background: "#e6f4ec", border: "1px solid #cde5d7", borderRadius: 8, padding: 8, marginLeft: "12%" }
const msgOther = { background: "#f7f9f8", border: "1px solid #dbe6e1", borderRadius: 8, padding: 8, marginRight: "12%" }
