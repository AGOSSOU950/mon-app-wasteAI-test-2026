import { useCallback, useEffect, useMemo, useState } from "react"
import axios from "axios"

export const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8001"

const EMPTY_LISTING = {
  titre: "",
  categorie: "",
  quantite_kg: "",
  prix_unitaire: "",
  localisation: "",
  description: "",
  photo_url: "",
  vendeur_id: "",
  date_expiration: "",
  statut: "actif"
}

const EMPTY_SELLER = {
  nom: "",
  entreprise: "",
  email: "",
  telephone: "",
  localisation: "",
  type: "vendeur"
}

const EMPTY_BUYER = {
  nom: "",
  entreprise: "",
  email: "",
  telephone: "",
  localisation: "",
  type: "acheteur"
}

const EMPTY_CONTACT = {
  buyer_id: "",
  message: ""
}

const EMPTY_LOT = {
  code_lot: "",
  quantite_kg: "",
  unite: "kg",
  localisation_initiale: "",
  commentaire: ""
}

const EMPTY_TRACE_EVENT = {
  lot_id: "",
  event_type: "collecte",
  location: "",
  actor_user_id: "",
  actor_name: "",
  proof_ref: "",
  note: ""
}

const EMPTY_TRACE_FINAL = {
  lot_id: "",
  disposal_method: "",
  facility_name: "",
  facility_location: "",
  compliance_doc_ref: "",
  note: ""
}

function toLocalDatetimeInput(value) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const pad = n => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function useMarketplace() {
  const [listings, setListings] = useState([])
  const [users, setUsers] = useState([])
  const [filters, setFilters] = useState({ categorie: "", localisation: "", statut: "", q: "" })
  const [listingForm, setListingForm] = useState(EMPTY_LISTING)
  const [sellerForm, setSellerForm] = useState(EMPTY_SELLER)
  const [buyerForm, setBuyerForm] = useState(EMPTY_BUYER)
  const [selectedId, setSelectedId] = useState(null)
  const [selectedListing, setSelectedListing] = useState(null)
  const [contactForm, setContactForm] = useState(EMPTY_CONTACT)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")

  const [activeSellerId, setActiveSellerId] = useState("")
  const [editListingId, setEditListingId] = useState("")
  const [editForm, setEditForm] = useState(null)

  const [listPager, setListPager] = useState({ limit: 9, offset: 0, total: 0 })
  const [sellerListings, setSellerListings] = useState([])
  const [sellerFilters, setSellerFilters] = useState({ q: "", statut: "" })
  const [sellerPager, setSellerPager] = useState({ limit: 5, offset: 0, total: 0, loading: false })
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const [messagingUserId, setMessagingUserId] = useState("")
  const [conversations, setConversations] = useState([])
  const [selectedConversationId, setSelectedConversationId] = useState("")
  const [conversationThread, setConversationThread] = useState(null)
  const [replyText, setReplyText] = useState("")
  const [loadingConversations, setLoadingConversations] = useState(false)
  const [loadingThread, setLoadingThread] = useState(false)

  const [traceListingId, setTraceListingId] = useState("")
  const [traceLots, setTraceLots] = useState([])
  const [traceTimeline, setTraceTimeline] = useState(null)
  const [traceLotForm, setTraceLotForm] = useState(EMPTY_LOT)
  const [traceEventForm, setTraceEventForm] = useState(EMPTY_TRACE_EVENT)
  const [traceFinalForm, setTraceFinalForm] = useState(EMPTY_TRACE_FINAL)

  const vendeurOptions = useMemo(() => users.filter(u => u.type === "vendeur"), [users])
  const acheteurOptions = useMemo(() => users.filter(u => u.type === "acheteur"), [users])

  const fetchUsers = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/marketplace/users`)
      setUsers(res.data?.items || [])
    } catch {
      setMessage("Impossible de charger les vendeurs.")
    }
  }, [])

  const fetchListings = useCallback(async (custom = {}) => {
    const nextOffset = custom.offset ?? listPager.offset
    const nextFilters = custom.filters || filters
    const nextLimit = custom.limit ?? listPager.limit

    setLoading(true)
    try {
      const res = await axios.get(`${API_BASE}/api/marketplace/listings`, {
        params: {
          categorie: nextFilters.categorie || undefined,
          localisation: nextFilters.localisation || undefined,
          statut: nextFilters.statut || undefined,
          q: nextFilters.q || undefined,
          limit: nextLimit,
          offset: nextOffset
        }
      })
      setListings(res.data?.items || [])
      setListPager(prev => ({ ...prev, offset: nextOffset, limit: nextLimit, total: res.data?.total || 0 }))
    } catch {
      setMessage("Impossible de charger les offres.")
    }
    setLoading(false)
  }, [filters, listPager.limit, listPager.offset])

  const fetchSellerListings = useCallback(async (custom = {}) => {
    const sellerId = custom.sellerId ?? activeSellerId
    if (!sellerId) {
      setSellerListings([])
      setSellerPager(prev => ({ ...prev, total: 0, offset: 0 }))
      return
    }

    const nextOffset = custom.offset ?? sellerPager.offset
    const nextLimit = custom.limit ?? sellerPager.limit
    const nextFilters = custom.filters || sellerFilters

    setSellerPager(prev => ({ ...prev, loading: true }))
    try {
      const res = await axios.get(`${API_BASE}/api/marketplace/listings`, {
        params: {
          vendeur_id: sellerId,
          q: nextFilters.q || undefined,
          statut: nextFilters.statut || undefined,
          limit: nextLimit,
          offset: nextOffset
        }
      })
      setSellerListings(res.data?.items || [])
      setSellerPager(prev => ({ ...prev, loading: false, offset: nextOffset, limit: nextLimit, total: res.data?.total || 0 }))
    } catch {
      setSellerPager(prev => ({ ...prev, loading: false }))
      setMessage("Impossible de charger les offres du vendeur.")
    }
  }, [activeSellerId, sellerFilters, sellerPager.limit, sellerPager.offset])

  const fetchDetail = useCallback(async (id) => {
    setLoading(true)
    try {
      const res = await axios.get(`${API_BASE}/api/marketplace/listings/${id}`)
      setSelectedListing(res.data)
      setSelectedId(id)
    } catch {
      setMessage("Impossible de charger le detail de l'offre.")
    }
    setLoading(false)
  }, [])

  const fetchConversations = useCallback(async (userId) => {
    const id = userId || messagingUserId
    if (!id) {
      setConversations([])
      setSelectedConversationId("")
      setConversationThread(null)
      return
    }

    setLoadingConversations(true)
    try {
      const res = await axios.get(`${API_BASE}/api/marketplace/messages/conversations`, {
        params: { user_id: id, limit: 100 }
      })
      setConversations(res.data?.items || [])
    } catch (err) {
      setMessage(err?.response?.data?.detail || "Impossible de charger les conversations.")
    }
    setLoadingConversations(false)
  }, [messagingUserId])

  const fetchConversationThread = useCallback(async (conversationId, userId) => {
    const id = userId || messagingUserId
    if (!conversationId || !id) return

    setLoadingThread(true)
    try {
      const res = await axios.get(`${API_BASE}/api/marketplace/messages/thread/${conversationId}`, {
        params: { user_id: id }
      })
      setConversationThread(res.data)
      setSelectedConversationId(conversationId)
    } catch (err) {
      setMessage(err?.response?.data?.detail || "Impossible de charger le fil de discussion.")
    }
    setLoadingThread(false)
  }, [messagingUserId])

  const sendReply = useCallback(async () => {
    if (!messagingUserId || !conversationThread || !replyText.trim()) {
      setMessage("Selectionne une conversation et saisis une reponse.")
      return
    }

    const recipientId = conversationThread.user_a_id === messagingUserId
      ? conversationThread.user_b_id
      : conversationThread.user_a_id

    try {
      await axios.post(`${API_BASE}/api/marketplace/messages`, {
        listing_id: conversationThread.listing_id,
        sender_id: messagingUserId,
        recipient_id: recipientId,
        contenu: replyText.trim()
      })
      setReplyText("")
      await fetchConversations(messagingUserId)
      await fetchConversationThread(conversationThread.conversation_id, messagingUserId)
      setMessage("Reponse envoyee.")
    } catch (err) {
      setMessage(err?.response?.data?.detail || "Echec envoi reponse.")
    }
  }, [conversationThread, fetchConversationThread, fetchConversations, messagingUserId, replyText])

  const createSeller = useCallback(async () => {
    if (!sellerForm.nom || !sellerForm.entreprise || !sellerForm.email || !sellerForm.telephone || !sellerForm.localisation) {
      setMessage("Complete les champs vendeur.")
      return
    }
    try {
      const res = await axios.post(`${API_BASE}/api/marketplace/users`, sellerForm)
      const created = res.data
      setMessage("Vendeur cree.")
      setSellerForm(EMPTY_SELLER)
      await fetchUsers()
      setListingForm(prev => ({ ...prev, vendeur_id: created.id }))
      setActiveSellerId(created.id)
    } catch (err) {
      setMessage(err?.response?.data?.detail || "Echec creation vendeur.")
    }
  }, [fetchUsers, sellerForm])

  const createBuyer = useCallback(async () => {
    if (!buyerForm.nom || !buyerForm.entreprise || !buyerForm.email || !buyerForm.telephone || !buyerForm.localisation) {
      setMessage("Complete les champs acheteur.")
      return
    }
    try {
      await axios.post(`${API_BASE}/api/marketplace/users`, buyerForm)
      setMessage("Acheteur cree.")
      setBuyerForm(EMPTY_BUYER)
      await fetchUsers()
    } catch (err) {
      setMessage(err?.response?.data?.detail || "Echec creation acheteur.")
    }
  }, [buyerForm, fetchUsers])

  const uploadPhoto = useCallback(async (file) => {
    const fd = new FormData()
    fd.append("photo", file)
    setUploadingPhoto(true)
    try {
      const res = await axios.post(`${API_BASE}/api/marketplace/upload-photo`, fd, {
        headers: { "Content-Type": "multipart/form-data" }
      })
      setListingForm(prev => ({ ...prev, photo_url: res.data?.photo_url || "" }))
      setMessage("Photo telechargee.")
    } catch (err) {
      setMessage(err?.response?.data?.detail || "Echec upload photo.")
    }
    setUploadingPhoto(false)
  }, [])

  const createListing = useCallback(async () => {
    const required = ["titre", "categorie", "quantite_kg", "prix_unitaire", "localisation", "vendeur_id", "date_expiration"]
    if (required.some(k => !listingForm[k])) {
      setMessage("Complete les champs obligatoires de l'offre.")
      return
    }

    try {
      await axios.post(`${API_BASE}/api/marketplace/listings`, {
        ...listingForm,
        quantite_kg: parseFloat(listingForm.quantite_kg),
        prix_unitaire: parseFloat(listingForm.prix_unitaire),
        date_expiration: new Date(listingForm.date_expiration).toISOString()
      })
      setMessage("Offre publiee.")
      const createdSellerId = listingForm.vendeur_id
      setListingForm(EMPTY_LISTING)
      await fetchListings({ offset: 0 })
      if (createdSellerId && createdSellerId === activeSellerId) {
        await fetchSellerListings({ sellerId: createdSellerId, offset: 0 })
      }
    } catch (err) {
      setMessage(err?.response?.data?.detail || "Echec publication offre.")
    }
  }, [activeSellerId, fetchListings, fetchSellerListings, listingForm])

  const startEditOwnedListing = useCallback((item) => {
    setEditListingId(item.id)
    setEditForm({
      titre: item.titre || "",
      categorie: item.categorie || "",
      quantite_kg: String(item.quantite_kg || ""),
      prix_unitaire: String(item.prix_unitaire || ""),
      localisation: item.localisation || "",
      description: item.description || "",
      photo_url: item.photo_url || "",
      date_expiration: toLocalDatetimeInput(item.date_expiration),
      statut: item.statut || "actif"
    })
  }, [])

  const saveOwnedListing = useCallback(async () => {
    if (!editListingId || !editForm) return
    const required = ["titre", "categorie", "quantite_kg", "prix_unitaire", "localisation", "date_expiration", "statut"]
    if (required.some(k => !editForm[k])) {
      setMessage("Complete les champs obligatoires pour la modification.")
      return
    }

    try {
      await axios.put(`${API_BASE}/api/marketplace/listings/${editListingId}`, {
        titre: editForm.titre,
        categorie: editForm.categorie,
        quantite_kg: parseFloat(editForm.quantite_kg),
        prix_unitaire: parseFloat(editForm.prix_unitaire),
        localisation: editForm.localisation,
        description: editForm.description,
        photo_url: editForm.photo_url,
        date_expiration: new Date(editForm.date_expiration).toISOString(),
        statut: editForm.statut
      })
      setMessage("Offre modifiee.")
      setEditListingId("")
      setEditForm(null)
      await fetchListings({ offset: listPager.offset })
      await fetchSellerListings({ offset: sellerPager.offset })
      if (selectedId === editListingId) await fetchDetail(editListingId)
    } catch (err) {
      setMessage(err?.response?.data?.detail || "Echec modification offre.")
    }
  }, [editForm, editListingId, fetchDetail, fetchListings, fetchSellerListings, listPager.offset, selectedId, sellerPager.offset])

  const deleteOwnedListing = useCallback(async (id, titleText) => {
    const ok = window.confirm(`Supprimer l'offre "${titleText}" ? Cette action est irreversible.`)
    if (!ok) return

    try {
      await axios.delete(`${API_BASE}/api/marketplace/listings/${id}`)
      setMessage("Offre supprimee.")
      if (selectedId === id) {
        setSelectedId(null)
        setSelectedListing(null)
      }
      if (editListingId === id) {
        setEditListingId("")
        setEditForm(null)
      }

      const nextSellerOffset = sellerPager.offset >= sellerPager.limit && sellerListings.length === 1
        ? sellerPager.offset - sellerPager.limit
        : sellerPager.offset
      const nextMainOffset = listPager.offset >= listPager.limit && listings.length === 1
        ? listPager.offset - listPager.limit
        : listPager.offset

      await fetchListings({ offset: nextMainOffset })
      await fetchSellerListings({ offset: nextSellerOffset })
    } catch (err) {
      setMessage(err?.response?.data?.detail || "Echec suppression offre.")
    }
  }, [editListingId, fetchListings, fetchSellerListings, listPager.limit, listPager.offset, listings.length, selectedId, sellerListings.length, sellerPager.limit, sellerPager.offset])

  const contactSeller = useCallback(async () => {
    if (!selectedId || !selectedListing) return
    if (!contactForm.buyer_id || !contactForm.message) {
      setMessage("Selectionne un acheteur et saisis un message.")
      return
    }
    try {
      const res = await axios.post(`${API_BASE}/api/marketplace/messages`, {
        listing_id: selectedId,
        sender_id: contactForm.buyer_id,
        recipient_id: selectedListing.vendeur_id,
        contenu: contactForm.message
      })
      setMessage("Message envoye au vendeur.")
      setContactForm(EMPTY_CONTACT)
      setMessagingUserId(contactForm.buyer_id)
      await fetchConversations(contactForm.buyer_id)
      if (res.data?.conversation_id) {
        await fetchConversationThread(res.data.conversation_id, contactForm.buyer_id)
      }
    } catch (err) {
      setMessage(err?.response?.data?.detail || "Echec envoi message au vendeur.")
    }
  }, [contactForm, fetchConversationThread, fetchConversations, selectedId, selectedListing])

  const applyPublicFilters = useCallback(async () => {
    await fetchListings({ offset: 0 })
  }, [fetchListings])

  const applySellerFilters = useCallback(async () => {
    await fetchSellerListings({ offset: 0 })
  }, [fetchSellerListings])

  const fetchTraceabilityLots = useCallback(async (listingId) => {
    if (!listingId) {
      setTraceLots([])
      setTraceTimeline(null)
      return
    }
    try {
      const res = await axios.get(`${API_BASE}/api/marketplace/traceability/lots`, { params: { listing_id: listingId, limit: 200 } })
      const items = res.data?.items || []
      setTraceLots(items)
      if (items.length > 0 && !traceEventForm.lot_id) {
        setTraceEventForm(prev => ({ ...prev, lot_id: items[0].id }))
        setTraceFinalForm(prev => ({ ...prev, lot_id: items[0].id }))
      }
    } catch {
      setMessage("Impossible de charger les lots de tracabilite.")
    }
  }, [traceEventForm.lot_id])

  const fetchTraceabilityTimeline = useCallback(async (lotId) => {
    if (!lotId) return
    try {
      const res = await axios.get(`${API_BASE}/api/marketplace/traceability/timeline/${lotId}`)
      setTraceTimeline(res.data)
    } catch {
      setMessage("Impossible de charger la timeline de tracabilite.")
    }
  }, [])

  const createTraceabilityLot = useCallback(async () => {
    if (!traceListingId || !traceLotForm.code_lot || !traceLotForm.quantite_kg || !traceLotForm.localisation_initiale) {
      setMessage("Complete les champs lot (annonce, code, quantite, localisation).")
      return
    }
    try {
      await axios.post(`${API_BASE}/api/marketplace/traceability/lots`, {
        listing_id: traceListingId,
        code_lot: traceLotForm.code_lot,
        quantite_kg: parseFloat(traceLotForm.quantite_kg),
        unite: traceLotForm.unite || "kg",
        localisation_initiale: traceLotForm.localisation_initiale,
        commentaire: traceLotForm.commentaire || null
      })
      setTraceLotForm(EMPTY_LOT)
      await fetchTraceabilityLots(traceListingId)
      setMessage("Lot trace cree.")
    } catch (err) {
      setMessage(err?.response?.data?.detail || "Echec creation lot trace.")
    }
  }, [fetchTraceabilityLots, traceListingId, traceLotForm])

  const addTraceabilityEvent = useCallback(async () => {
    if (!traceEventForm.lot_id || !traceEventForm.location) {
      setMessage("Selectionne un lot et renseigne le lieu de l'etape.")
      return
    }
    try {
      await axios.post(`${API_BASE}/api/marketplace/traceability/events`, {
        lot_id: traceEventForm.lot_id,
        event_type: traceEventForm.event_type,
        location: traceEventForm.location,
        actor_user_id: traceEventForm.actor_user_id || null,
        actor_name: traceEventForm.actor_name || null,
        proof_ref: traceEventForm.proof_ref || null,
        note: traceEventForm.note || null
      })
      const timelineRes = await axios.get(`${API_BASE}/api/marketplace/traceability/timeline/${traceEventForm.lot_id}`)
      setTraceTimeline(timelineRes.data)
      setMessage("Etape traceabilite enregistree.")
    } catch (err) {
      setMessage(err?.response?.data?.detail || "Echec ajout etape traceabilite.")
    }
  }, [traceEventForm])

  const addFinalDisposal = useCallback(async () => {
    if (!traceFinalForm.lot_id || !traceFinalForm.disposal_method || !traceFinalForm.facility_name || !traceFinalForm.facility_location) {
      setMessage("Complete les champs elimination finale.")
      return
    }
    try {
      await axios.post(`${API_BASE}/api/marketplace/traceability/final-disposal`, {
        ...traceFinalForm,
        compliance_doc_ref: traceFinalForm.compliance_doc_ref || null,
        note: traceFinalForm.note || null,
        disposed_at: new Date().toISOString()
      })
      const timelineRes = await axios.get(`${API_BASE}/api/marketplace/traceability/timeline/${traceFinalForm.lot_id}`)
      setTraceTimeline(timelineRes.data)
      setMessage("Elimination finale enregistree.")
    } catch (err) {
      setMessage(err?.response?.data?.detail || "Echec elimination finale.")
    }
  }, [traceFinalForm])

  const selectTraceLot = useCallback(async (lotId) => {
    setTraceEventForm(prev => ({ ...prev, lot_id: lotId }))
    setTraceFinalForm(prev => ({ ...prev, lot_id: lotId }))
    await fetchTraceabilityTimeline(lotId)
  }, [fetchTraceabilityTimeline])

  useEffect(() => {
    fetchUsers()
    fetchListings({ offset: 0 })
  }, [fetchListings, fetchUsers])

  useEffect(() => {
    if (!activeSellerId) {
      setSellerListings([])
      setSellerPager(prev => ({ ...prev, total: 0, offset: 0 }))
      return
    }
    fetchSellerListings({ sellerId: activeSellerId, offset: 0 })
  }, [activeSellerId, fetchSellerListings])

  useEffect(() => {
    if (!messagingUserId) {
      setConversations([])
      setSelectedConversationId("")
      setConversationThread(null)
      return
    }
    fetchConversations(messagingUserId)
  }, [fetchConversations, messagingUserId])

  useEffect(() => {
    fetchTraceabilityLots(traceListingId)
  }, [fetchTraceabilityLots, traceListingId])

  return {
    listings,
    users,
    filters,
    setFilters,
    listingForm,
    setListingForm,
    sellerForm,
    setSellerForm,
    buyerForm,
    setBuyerForm,
    selectedListing,
    contactForm,
    setContactForm,
    loading,
    message,
    activeSellerId,
    setActiveSellerId,
    editListingId,
    setEditListingId,
    editForm,
    setEditForm,
    listPager,
    sellerListings,
    sellerFilters,
    setSellerFilters,
    sellerPager,
    uploadingPhoto,
    messagingUserId,
    setMessagingUserId,
    conversations,
    selectedConversationId,
    conversationThread,
    replyText,
    setReplyText,
    loadingConversations,
    loadingThread,
    traceListingId,
    setTraceListingId,
    traceLots,
    traceTimeline,
    traceLotForm,
    setTraceLotForm,
    traceEventForm,
    setTraceEventForm,
    traceFinalForm,
    setTraceFinalForm,
    vendeurOptions,
    acheteurOptions,
    fetchDetail,
    fetchConversations,
    fetchConversationThread,
    sendReply,
    createSeller,
    createBuyer,
    uploadPhoto,
    createListing,
    startEditOwnedListing,
    saveOwnedListing,
    deleteOwnedListing,
    contactSeller,
    applyPublicFilters,
    applySellerFilters,
    fetchListings,
    fetchSellerListings,
    fetchTraceabilityLots,
    createTraceabilityLot,
    addTraceabilityEvent,
    addFinalDisposal,
    selectTraceLot
  }
}
