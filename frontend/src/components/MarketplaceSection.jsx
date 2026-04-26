import React, { useState } from "react"

export default function MarketplaceSection({ children }) {
  const [filters, setFilters] = useState({
    search: "",
    filiere: "",
    region: "",
    minPrice: "",
    maxPrice: "",
    minQty: "",
    maxQty: "",
    sort: "date",
  })

  return (
    <section className="card market-wrap">
      <h3>Marketplace WasteAI</h3>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>Place de marche beninoise pour la valorisation des dechets.</p>

      <div className="market-toolbar">
        <label className="sr-only" htmlFor="market-search">Recherche dechet</label>
        <input id="market-search" placeholder="Rechercher un dechet..." value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />

        <label className="sr-only" htmlFor="market-filiere">Filtrer par filiere</label>
        <select id="market-filiere" value={filters.filiere} onChange={(e) => setFilters({ ...filters, filiere: e.target.value })}><option value="">Filiere</option><option value="textile">Textile</option><option value="plastique">Plastique</option><option value="papier">Papier</option></select>

        <label className="sr-only" htmlFor="market-region">Region Benin</label>
        <input id="market-region" placeholder="Region Benin" value={filters.region} onChange={(e) => setFilters({ ...filters, region: e.target.value })} />

        <label className="sr-only" htmlFor="market-min-price">Prix minimum</label>
        <input id="market-min-price" placeholder="Prix min" value={filters.minPrice} onChange={(e) => setFilters({ ...filters, minPrice: e.target.value })} />

        <label className="sr-only" htmlFor="market-max-price">Prix maximum</label>
        <input id="market-max-price" placeholder="Prix max" value={filters.maxPrice} onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })} />

        <label className="sr-only" htmlFor="market-sort">Tri marketplace</label>
        <select id="market-sort" value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}><option value="date">Tri: Date</option><option value="prix">Tri: Prix</option><option value="quantite">Tri: Quantite</option><option value="score">Tri: Score</option></select>
      </div>

      <div style={{ marginTop: 8 }}>{children}</div>
    </section>
  )
}
