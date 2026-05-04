import { memo } from "react"
import { useMarketplaceCatalogView } from "./MarketplaceContext"

const MarketplaceCatalogSection = memo(function MarketplaceCatalogSection() {
  const {
    styles,
    sellerForm,
    setSellerForm,
    buyerForm,
    setBuyerForm,
    createSeller,
    createBuyer,
    listingForm,
    setListingForm,
    vendeurOptions,
    uploadPhoto,
    uploadingPhoto,
    toAbsolutePhoto,
    createListing,
    filters,
    setFilters,
    applyPublicFilters,
    loading,
    listings,
    OfferCard,
    fetchDetail,
    listPager,
    fetchListings,
    Pager,
    selectedListing,
    getCategoryVisual,
    StatusBadge,
    contactForm,
    setContactForm,
    acheteurOptions,
    contactSeller,
    activeSellerId,
    setActiveSellerId,
    setEditListingId,
    setEditForm,
    fetchSellerListings,
    sellerFilters,
    setSellerFilters,
    applySellerFilters,
    sellerPager,
    sellerListings,
    OwnedListingCard,
    startEditOwnedListing,
    saveOwnedListing,
    deleteOwnedListing,
    editListingId,
    editForm
  } = useMarketplaceCatalogView()

  const {
    section,
    h3,
    hint,
    grid2,
    grid3,
    inp,
    btn,
    btnSecondary,
    subAccordion,
    subSummary,
    thumbWrap,
    thumbWrapLarge,
    thumb,
    thumbLarge,
    title,
    meta
  } = styles

  return (
    <>
      <div style={section}>
        <h3 style={h3}>1) Creer un vendeur</h3>
        <div style={grid2}>
          <input style={inp} placeholder="Nom" value={sellerForm.nom} onChange={e => setSellerForm({ ...sellerForm, nom: e.target.value })} />
          <input style={inp} placeholder="Entreprise" value={sellerForm.entreprise} onChange={e => setSellerForm({ ...sellerForm, entreprise: e.target.value })} />
          <input style={inp} placeholder="Email" value={sellerForm.email} onChange={e => setSellerForm({ ...sellerForm, email: e.target.value })} />
          <input style={inp} placeholder="Telephone" value={sellerForm.telephone} onChange={e => setSellerForm({ ...sellerForm, telephone: e.target.value })} />
          <input style={inp} placeholder="Localisation" value={sellerForm.localisation} onChange={e => setSellerForm({ ...sellerForm, localisation: e.target.value })} />
        </div>
        <button style={btn} onClick={createSeller}>Creer vendeur</button>
        <hr style={{ border: "none", borderTop: "1px solid var(--line)", margin: "12px 0" }} />
        <h4 style={{ margin: "0 0 6px", color: "var(--text)" }}>Creer un acheteur</h4>
        <div style={grid2}>
          <input style={inp} placeholder="Nom" value={buyerForm.nom} onChange={e => setBuyerForm({ ...buyerForm, nom: e.target.value })} />
          <input style={inp} placeholder="Entreprise" value={buyerForm.entreprise} onChange={e => setBuyerForm({ ...buyerForm, entreprise: e.target.value })} />
          <input style={inp} placeholder="Email" value={buyerForm.email} onChange={e => setBuyerForm({ ...buyerForm, email: e.target.value })} />
          <input style={inp} placeholder="Telephone" value={buyerForm.telephone} onChange={e => setBuyerForm({ ...buyerForm, telephone: e.target.value })} />
          <input style={inp} placeholder="Localisation" value={buyerForm.localisation} onChange={e => setBuyerForm({ ...buyerForm, localisation: e.target.value })} />
        </div>
        <button style={btnSecondary} onClick={createBuyer}>Creer acheteur</button>
      </div>

      <div style={section}>
        <h3 style={h3}>2) Publier une offre</h3>
        <p style={hint}>Renseigne d'abord les champs indispensables, puis ouvre les options avancees.</p>
        <div style={grid2}>
          <input style={inp} placeholder="Titre" value={listingForm.titre} onChange={e => setListingForm({ ...listingForm, titre: e.target.value })} />
          <input style={inp} placeholder="Categorie" value={listingForm.categorie} onChange={e => setListingForm({ ...listingForm, categorie: e.target.value })} />
          <input style={inp} type="number" step="0.1" placeholder="Quantite kg" value={listingForm.quantite_kg} onChange={e => setListingForm({ ...listingForm, quantite_kg: e.target.value })} />
          <input style={inp} type="number" step="0.01" placeholder="Prix unitaire EUR/kg" value={listingForm.prix_unitaire} onChange={e => setListingForm({ ...listingForm, prix_unitaire: e.target.value })} />
          <input style={inp} placeholder="Localisation" value={listingForm.localisation} onChange={e => setListingForm({ ...listingForm, localisation: e.target.value })} />
          <input style={inp} type="datetime-local" value={listingForm.date_expiration} onChange={e => setListingForm({ ...listingForm, date_expiration: e.target.value })} />
          <select style={inp} value={listingForm.vendeur_id} onChange={e => setListingForm({ ...listingForm, vendeur_id: e.target.value })}>
            <option value="">Selectionner vendeur</option>
            {vendeurOptions.map(u => <option key={u.id} value={u.id}>{u.nom} - {u.entreprise}</option>)}
          </select>
        </div>

        <details style={subAccordion}>
          <summary style={subSummary}>Champs avances: photo, statut, description</summary>
          <div style={grid2}>
            <div>
              <label style={{ color: "var(--muted)", fontSize: 13 }}>Photo (fichier):</label>
              <input style={inp} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = "" }} />
              {uploadingPhoto && <p style={{ marginTop: -6, color: "var(--muted)" }}>Upload en cours...</p>}
              {!!listingForm.photo_url && <img src={toAbsolutePhoto(listingForm.photo_url)} alt="preview" style={{ width: 140, height: 100, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)", marginBottom: 8 }} />}
            </div>
            <div>
              <label>Statut</label>
              <select style={inp} value={listingForm.statut} onChange={e => setListingForm({ ...listingForm, statut: e.target.value })}>
                {["actif", "expire", "archive"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <textarea style={{ ...inp, minHeight: 82 }} placeholder="Description" value={listingForm.description} onChange={e => setListingForm({ ...listingForm, description: e.target.value })} />
        </details>

        <button style={btn} onClick={createListing}>Publier offre</button>
      </div>

      <div style={section}>
        <h3 style={h3}>3) Offres disponibles</h3>
        <p style={hint}>Filtrage rapide par categorie/localisation/recherche. Les options secondaires sont repliables.</p>
        <div style={grid3}>
          <input style={inp} placeholder="Filtre categorie" value={filters.categorie} onChange={e => setFilters({ ...filters, categorie: e.target.value })} />
          <input style={inp} placeholder="Filtre localisation" value={filters.localisation} onChange={e => setFilters({ ...filters, localisation: e.target.value })} />
          <input style={inp} placeholder="Recherche" value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value })} />
        </div>
        <details style={subAccordion}>
          <summary style={subSummary}>Filtre avance: statut</summary>
          <select style={inp} value={filters.statut} onChange={e => setFilters({ ...filters, statut: e.target.value })}>
            <option value="">Filtre statut (tous)</option>
            {["actif", "expire", "archive"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </details>
        <button style={btnSecondary} onClick={applyPublicFilters}>{loading ? "Chargement..." : "Appliquer filtres"}</button>

        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 10 }}>
          {listings.map(item => <OfferCard key={item.id} item={item} onOpenDetail={fetchDetail} />)}
          {!loading && listings.length === 0 && <p style={{ color: "var(--muted)" }}>Aucune offre.</p>}
        </div>

        <Pager
          offset={listPager.offset}
          limit={listPager.limit}
          total={listPager.total}
          onPrevious={() => fetchListings({ offset: Math.max(0, listPager.offset - listPager.limit) })}
          onNext={() => fetchListings({ offset: listPager.offset + listPager.limit })}
        />
      </div>

      {selectedListing && (
        <div style={section}>
          <h3 style={h3}>4) Detail offre</h3>
          <p style={hint}>Resume rapide visible, informations completes et messagerie dans les panneaux ci-dessous.</p>

          <div style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 10, alignItems: "center", marginBottom: 8 }}>
            <div style={thumbWrap}>
              <img src={selectedListing.photo_url ? toAbsolutePhoto(selectedListing.photo_url) : getCategoryVisual(selectedListing.categorie)} alt={selectedListing.titre} style={thumb} />
            </div>
            <div>
              <p style={title}>{selectedListing.titre}</p>
              <p style={meta}>{selectedListing.localisation} | {Number(selectedListing.prix_unitaire).toFixed(2)} EUR/kg | {selectedListing.quantite_kg} kg</p>
              <StatusBadge statut={selectedListing.statut} />
            </div>
          </div>

          <details style={subAccordion}>
            <summary style={subSummary}>Voir toutes les informations de l'offre</summary>
            <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 12 }}>
              <div style={thumbWrapLarge}>
                <img src={selectedListing.photo_url ? toAbsolutePhoto(selectedListing.photo_url) : getCategoryVisual(selectedListing.categorie)} alt={selectedListing.titre} style={thumbLarge} />
              </div>
              <div>
                <p style={meta}>Categorie: {selectedListing.categorie}</p>
                <p style={meta}>Quantite: {selectedListing.quantite_kg} kg</p>
                <p style={meta}>Prix unitaire: {Number(selectedListing.prix_unitaire).toFixed(2)} EUR/kg</p>
                <p style={meta}>Localisation: {selectedListing.localisation}</p>
                <p style={meta}>Expiration: {new Date(selectedListing.date_expiration).toLocaleString()}</p>
                {!!selectedListing.description && <p style={{ ...meta, marginTop: 8 }}>{selectedListing.description}</p>}
              </div>
            </div>
          </details>

          <details open style={subAccordion}>
            <summary style={subSummary}>Contacter le vendeur</summary>
            <select style={inp} value={contactForm.buyer_id} onChange={e => setContactForm({ ...contactForm, buyer_id: e.target.value })}>
              <option value="">Selectionner un acheteur</option>
              {acheteurOptions.map(u => <option key={u.id} value={u.id}>{u.nom} - {u.entreprise}</option>)}
            </select>
            <textarea style={{ ...inp, minHeight: 82 }} placeholder="Message" value={contactForm.message} onChange={e => setContactForm({ ...contactForm, message: e.target.value })} />
            <button style={btn} onClick={contactSeller}>Envoyer le message</button>
          </details>
        </div>
      )}

      <div style={section}>
        <h3 style={h3}>5) Espace vendeur: gerer ses offres</h3>
        <div style={grid2}>
          <select style={inp} value={activeSellerId} onChange={e => { setActiveSellerId(e.target.value); setEditListingId(""); setEditForm(null) }}>
            <option value="">Selectionner un vendeur</option>
            {vendeurOptions.map(u => <option key={u.id} value={u.id}>{u.nom} - {u.entreprise}</option>)}
          </select>
          <button style={btnSecondary} onClick={() => fetchSellerListings({ offset: 0 })}>Rafraichir mes offres</button>
        </div>

        {!!activeSellerId && (
          <details style={subAccordion}>
            <summary style={subSummary}>Filtres avances vendeur</summary>
            <div style={grid2}>
              <input style={inp} placeholder="Recherche dans mes offres" value={sellerFilters.q} onChange={e => setSellerFilters({ ...sellerFilters, q: e.target.value })} />
              <select style={inp} value={sellerFilters.statut} onChange={e => setSellerFilters({ ...sellerFilters, statut: e.target.value })}>
                <option value="">Statut (tous)</option>
                {["actif", "expire", "archive"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </details>
        )}

        {!!activeSellerId && <button style={btnSecondary} onClick={applySellerFilters}>{sellerPager.loading ? "Chargement..." : "Appliquer filtres vendeur"}</button>}

        {!activeSellerId && <p style={{ color: "var(--muted)", marginTop: 0 }}>Selectionne un vendeur pour voir et gerer ses offres.</p>}
        {!!activeSellerId && !sellerPager.loading && sellerListings.length === 0 && <p style={{ color: "var(--muted)", marginTop: 0 }}>Aucune offre trouvee pour ce vendeur.</p>}

        <div style={{ display: "grid", gap: 10 }}>
          {sellerListings.map(item => (
            <OwnedListingCard
              key={item.id}
              item={item}
              isEditing={editListingId === item.id}
              editForm={editForm}
              onStartEdit={startEditOwnedListing}
              onCancelEdit={() => { setEditListingId(""); setEditForm(null) }}
              onChangeEdit={setEditForm}
              onSaveEdit={saveOwnedListing}
              onDelete={deleteOwnedListing}
            />
          ))}
        </div>

        {!!activeSellerId && (
          <Pager
            offset={sellerPager.offset}
            limit={sellerPager.limit}
            total={sellerPager.total}
            onPrevious={() => fetchSellerListings({ offset: Math.max(0, sellerPager.offset - sellerPager.limit) })}
            onNext={() => fetchSellerListings({ offset: sellerPager.offset + sellerPager.limit })}
          />
        )}
      </div>
    </>
  )
})

export default MarketplaceCatalogSection

