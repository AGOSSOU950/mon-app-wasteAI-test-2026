import React from "react"
import { FEATURES } from "../config/features"

const HIGHLIGHTS = [
  { label: "D?cision rapide", value: "1 flux, 1 lecture, 1 recommandation" },
  { label: "Conformit?", value: "CEDEAO + Convention de Bamako" },
  { label: "Industrialisation", value: "Volumes, co?ts, ex?cution" },
]

const FEATURES_LIST = [
  {
    title: "Lecture industrielle multicrit?re",
    text: "WasteAI croise la technicit?, l??conomie, l?environnement et le cadre r?glementaire pour trancher vite et proprement.",
  },
  {
    title: "Base de connaissance ?volutive",
    text: "Les fili?res, contraintes et poids sont modifiables en JSON pour adapter l?outil au terrain sans recoder le moteur.",
  },
  {
    title: "Canaux locaux actionnables",
    text: "Chaque recommandation peut ?tre reli?e ? des op?rateurs locaux, avec alternatives, distance et prise de contact directe.",
  },
  {
    title: "Tra?abilit? d?cisionnelle",
    text: "Historique, explication automatique et export permettent de documenter chaque orientation dans un contexte industriel.",
  },
]

const REGULATORY_POINTS = [
  "Filtrage des voies incompatibles avec le danger, le chlore, les m?taux lourds ou l?absence d?autorisation.",
  "Priorisation des fili?res conformes aux pratiques CEDEAO et aux exigences de la Convention de Bamako.",
  "Justification lisible pour les audits internes, les HSE et les ?quipes qualit?.",
]

export default function PresentationSection({ onGoAnalyze }) {
  return (
    <section className="card presentation-wrap">
      <div className="presentation-hero">
        <div>
          <p className="eyebrow">WasteAI pour les industries</p>
          <h2>Transformer un d?chet en d?cision de valorisation exploitable.</h2>
          <p className="presentation-subtitle">WasteAI aide les industriels, recycleurs et ?quipes HSE ? qualifier un flux, v?rifier la conformit? et identifier rapidement la meilleure voie de traitement en Afrique de l?Ouest.</p>

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
            <button className="btn btn-secondary" type="button" onClick={onGoAnalyze}>Voir la m?thode</button>
          </div>
        </div>

        <aside className="presentation-panel">
          <p className="panel-label">Cadre r?glementaire</p>
          <h3>CEDEAO + Convention de Bamako</h3>
          <ul>
            {REGULATORY_POINTS.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </aside>
      </div>

      <div className="presentation-grid">
        {FEATURES_LIST.map((item) => (
          <article key={item.title} className="presentation-item">
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </article>
        ))}
      </div>

      <div className="presentation-note">
        <div>
          <p className="panel-label">Apport principal</p>
          <p>Une interface sobre pour les ?quipes exploitation, qualit?, environnement et direction industrielle.</p>
        </div>
        <div>
          <p className="panel-label">Support terrain</p>
          <p>Base de connaissance locale, canaux Benin/West Africa et recommandations explicables.</p>
        </div>
      </div>

      {FEATURES.marketplace ? null : (
        <div className="presentation-banner">Marketplace d?sactiv? temporairement. WasteAI privil?gie les op?rateurs locaux et les circuits conformes.</div>
      )}
    </section>
  )
}
