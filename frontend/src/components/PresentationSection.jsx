import React from "react"
import { FEATURES } from "../config/features"

const HIGHLIGHTS = [
  { label: "Rapide", value: "1 flux, 1 lecture, 1 décision" },
  { label: "Sûr", value: "CEDEAO + Bamako" },
  { label: "Local", value: "Circuits d'exécution concrets" },
]

export default function PresentationSection({ onGoAnalyze }) {
  return (
    <section className="card presentation-wrap">
      <div className="presentation-hero">
        <div>
          <p className="eyebrow">WasteAI</p>
          <h2>parce que les déchets valent de l'or.</h2>
          <p className="presentation-subtitle">Une interface sobre pour qualifier un flux, vérifier la conformité et garder seulement les voies utiles.</p>

          <div className="presentation-chips">
            {HIGHLIGHTS.map((item) => (
              <div key={item.label} className="presentation-chip">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>

          <div className="actions-row">
            <button className="btn btn-primary" type="button" onClick={onGoAnalyze}>Lancer une analyse</button>
          </div>
        </div>

        <aside className="presentation-panel">
          <p className="panel-label">Ce que l'on garde</p>
          <ul>
            <li>Les voies vraiment exploitables</li>
            <li>Les raisons de choix ou d'exclusion</li>
            <li>Les contraintes de terrain et de conformité</li>
          </ul>
        </aside>
      </div>

      {FEATURES.marketplace ? null : (
        <div className="presentation-banner">Marketplace désactivée temporairement. WasteAI privilégie les opérateurs locaux et les circuits conformes.</div>
      )}
    </section>
  )
}