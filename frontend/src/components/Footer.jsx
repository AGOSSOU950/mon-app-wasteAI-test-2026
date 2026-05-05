import React from "react"

export default function Footer({ apiOnline }) {
  return (
    <footer className="site-footer page-section" aria-label="Pied de page">
      <div className="site-footer-inner card">
        <div>
          <p className="site-footer-name">WasteAI</p>
          <p className="site-footer-tagline">Décision, conformité et orientation locale pour les flux de déchets industriels et ménagers.</p>
        </div>

        <div className="site-footer-meta">
          <span>{apiOnline ? "API disponible" : "API hors ligne"}</span>
          <span>CEDEAO / Bamako</span>
          <span>Opérateurs locaux</span>
        </div>
      </div>
    </footer>
  )
}
