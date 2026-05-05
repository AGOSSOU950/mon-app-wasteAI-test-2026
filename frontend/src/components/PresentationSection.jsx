import React from "react"

const HIGHLIGHTS = [
  { label: "Usage", value: "Décider vite" },
  { label: "Conformité", value: "CEDEAO / Bamako" },
  { label: "Terrain", value: "Acteurs locaux" },
  { label: "Valeur", value: "Coût et CO2" },
]

const FEATURES = [
  {
    title: "Caractérisation utile",
    text: "WasteAI transforme un déchet décrit ou analysé en profil exploitable: type, propriétés physico-chimiques et niveau de risque.",
  },
  {
    title: "Voies de valorisation pertinentes",
    text: "Le moteur compare plusieurs options au lieu de bloquer trop tôt: matière, énergie, biologique ou élimination sécurisée.",
  },
  {
    title: "Réglementation intégrée",
    text: "Les recommandations intègrent les contraintes CEDEAO et la Convention de Bamako pour réduire les choix non conformes.",
  },
  {
    title: "Ancrage industriel local",
    text: "WasteAI met en avant les opérateurs et canaux béninois compatibles pour accélérer l’exécution sur le terrain.",
  },
]

const STEPS = [
  {
    id: "01",
    title: "Qualifier",
    text: "Nom, type, quantité, contexte d’origine et propriétés physico-chimiques du flux.",
  },
  {
    id: "02",
    title: "Comparer",
    text: "Scores multi-voies, coûts estimés, CO2 évité et contraintes techniques.",
  },
  {
    id: "03",
    title: "Orienter",
    text: "Voies retenues, opérateurs compatibles et synthèse actionnable.",
  },
]

export default function PresentationSection({ onGoAnalyze }) {
  return (
    <section className="card presentation-wrap">
      <div className="presentation-topline">
        <span>WasteAI / plateforme d’aide à la décision déchets</span>
        <span>Industries · Réglementation · Valorisation</span>
      </div>

      <div className="presentation-hero">
        <div className="presentation-hero-copy">
          <p className="presentation-kicker eyebrow">Décision industrielle</p>
          <h2>Du déchet à une décision de valorisation claire.</h2>
          <p className="presentation-subtitle">
            Une lecture technique pour les déchets ménagers et industriels, avec prise en compte des voies locales,
            de la conformité CEDEAO / Bamako, des coûts et de l’impact environnemental.
          </p>

          <div className="presentation-chips">
            {HIGHLIGHTS.map((item) => (
              <div key={item.label} className="presentation-chip">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>

          <div className="presentation-metric-row" aria-label="Fonctionnement">
            {STEPS.map((step) => (
              <div key={step.id} className="presentation-metric">
                <strong>{step.id}</strong>
                <span>{step.title}</span>
              </div>
            ))}
          </div>

          <div className="presentation-actions">
            <button className="btn btn-primary" type="button" onClick={onGoAnalyze}>
              Lancer une analyse
            </button>
            <p className="presentation-action-note">Rapide, exploitable, orienté terrain.</p>
          </div>
        </div>

        <div className="presentation-dashcard">
          <div className="presentation-dashheader">
            <span>Ce que WasteAI apporte</span>
            <strong>Lecture opérationnelle</strong>
          </div>
          <div className="presentation-dashgrid">
            {STEPS.map((step) => (
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

      <div className="presentation-grid">
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
