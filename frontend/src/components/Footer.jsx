import React from "react"

export default function Footer({ apiOnline }) {
  return (
    <footer className="site-footer page-section" aria-label="Pied de page">
      <div className="site-footer-inner card">
        <div className="site-footer-brand">
          <p className="site-footer-name">WasteAI</p>
          <p className="site-footer-tagline">{"Parce que les d\u00e9chets valent de l'or"}</p>
          <p className="site-footer-credit">{"Fait avec amour au B\u00e9nin"}</p>
        </div>

        <div className="site-footer-links" aria-label="Informations utilitaires">
          <span className="site-footer-link">{"Politique de confidentialit\u00e9"}</span>
          <span className="site-footer-link">Contact</span>
          <span className="site-footer-link">LinkedIn</span>
          <span className="site-footer-link">WhatsApp Business</span>
        </div>

        <div className="site-footer-meta">
          <span>{apiOnline ? "API disponible" : "API hors ligne"}</span>
        </div>
      </div>
    </footer>
  )
}