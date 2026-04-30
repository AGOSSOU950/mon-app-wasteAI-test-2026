import React from "react"

const HIGHLIGHTS = [
  { label: "Décision", value: "1 flux, 1 voie" },
  { label: "Conformité", value: "CEDEAO / Bamako" },
  { label: "Terrain", value: "Acteurs béninois" },
  { label: "Impact", value: "Coût, valeur, risque" },
]

const FEATURES = [
  {
    title: "Diagnostic utile",
    text: "WasteAI transforme les données du déchet en signal de décision exploitable, sans jargon inutile.",
  },
  {
    title: "Arbitrage clair",
    text: "Le système compare les voies matière, énergie et spécialité pour faire ressortir l’option la plus robuste.",
  },
  {
    title: "Conformité intégrée",
    text: "Les recommandations tiennent compte des contraintes CEDEAO et de la Convention de Bamako dès le départ.",
  },
  {
    title: "Réseau local",
    text: "Les opérateurs béninois pertinents sont mis en avant pour accélérer la mise en action sur le terrain.",
  },
]

const PIPELINE = [
  { id: "01", title: "Capture", text: "Nom, contexte, quantité, photo ou données de procédé." },
  { id: "02", title: "Analyse", text: "Comparaison des voies, coûts, gains et risques." },
  { id: "03", title: "Décision", text: "Une recommandation lisible, prête à être appliquée." },
]

export default function PresentationSection({ onGoAnalyze }) {
  return (
    <section className="card presentation-wrap presentation-home presentation-saas">
      <div className="presentation-topline">
        <span>WasteAI / decision engine</span>
        <span>Industries · HSE · Conformité</span>
      </div>

      <div className="presentation-hero">
        <div className="presentation-hero-copy">
          <p className="presentation-kicker">Couche de décision industrielle</p>
          <p className="eyebrow">WasteAI</p>
          <h2>Du déchet à la décision.</h2>
          <p className="presentation-subtitle">
            Qualifier un flux, arbitrer une voie de traitement et intégrer CEDEAO / Bamako dans une lecture nette, rapide et actionnable.
          </p>

          <div className="presentation-chips">
            {HIGHLIGHTS.map((item) => (
              <div key={item.label} className="presentation-chip">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>

          <div className="presentation-metric-row" aria-label="Repères clés">
            {PIPELINE.map((metric) => (
              <div key={metric.label || metric.id} className="presentation-metric">
                <strong>{metric.id}</strong>
                <span>{metric.title}</span>
              </div>
            ))}
          </div>

          <div className="presentation-actions">
            <button className="btn btn-primary" type="button" onClick={onGoAnalyze}>Lancer une analyse</button>
            <p className="presentation-action-note">Lecture immédiate. Arbitrage net.</p>
          </div>
        </div>

        <div className="presentation-dashcard">
          <div className="presentation-dashheader">
            <span>Signal</span>
            <strong>Lecture instantanée</strong>
          </div>
          <div className="presentation-bars" aria-hidden="true">
            <span style={{ height: "30%" }} />
            <span style={{ height: "56%" }} />
            <span style={{ height: "78%" }} />
            <span style={{ height: "48%" }} />
            <span style={{ height: "88%" }} />
          </div>
          <div className="presentation-dashgrid">
            {PIPELINE.map((step) => (
              <div key={step.id} className="presentation-dashstep">
                <strong>{step.id}</strong>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="presentation-grid presentation-grid-saas">
        {FEATURES.map((item) => (
          <article key={item.title} className="presentation-item">
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
