import React from "react"
import { FEATURES } from "../config/features"

function WasteAiMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 64 64" role="img" aria-label="Logo WasteAI">
      <defs>
        <linearGradient id="wleaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#74d2a5" />
          <stop offset="100%" stopColor="#146343" />
        </linearGradient>
      </defs>
      <path d="M8 36C8 20 22 8 39 8c0 19-12 33-29 37-1-3-2-6-2-9z" fill="url(#wleaf)" />
      <path d="M15 44c8-6 15-13 21-23" stroke="#eef5f1" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="46" cy="24" r="4" fill="#e4b15a" />
      <circle cx="53" cy="31" r="3" fill="#e4b15a" />
      <circle cx="45" cy="38" r="3" fill="#e4b15a" />
      <path d="M46 24l7 7-8 7" stroke="#e4b15a" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  )
}

export default function Header({ view, setView, apiOnline, theme, onToggleTheme }) {
  return (
    <header className="top-header">
      <div className="container inner">
        <button className="brand-block brand-link" type="button" onClick={() => setView("presentation")} aria-label="Aller à l'accueil">
          <WasteAiMark />
          <div>
            <h1 className="brand-title">WasteAI</h1>
            <p className="brand-sub">Analyse sobre, pilotage utile</p>
          </div>
        </button>

        <nav className="nav-tabs desktop-nav" aria-label="Navigation principale">
          <button className={`nav-tab ${view === "presentation" ? "active" : ""}`} type="button" onClick={() => setView("presentation")}>Accueil</button>
          <button className={`nav-tab ${view === "analyse" ? "active" : ""}`} type="button" onClick={() => setView("analyse")}>Analyse</button>
          {FEATURES.marketplace ? <button className={`nav-tab ${view === "marketplace" ? "active" : ""}`} type="button" onClick={() => setView("marketplace")}>Réseau local</button> : null}
          <button className={`nav-tab ${view === "pilotage" ? "active" : ""}`} type="button" onClick={() => setView("pilotage")}>Pilotage</button>
        </nav>

        <div className="header-actions">
          <div className="header-status" aria-label={apiOnline ? "API en ligne" : "API hors ligne"}>
            <span className={`api-dot ${apiOnline ? "api-online" : "api-offline"}`} aria-hidden="true" />
            <small>{apiOnline ? "En ligne" : "Hors ligne"}</small>
          </div>
          <button className="btn btn-secondary header-theme" type="button" onClick={onToggleTheme} aria-pressed={theme === "dark"}>
            {theme === "dark" ? "Passer au clair" : "Passer au sombre"}
          </button>
        </div>
      </div>
    </header>
  )
}
