import React from "react"

const FEATURES = [
  {
    title: "Moteur multicriteres industriel",
    text: "Scoring technique, economique, environnemental, social et reglementaire pour choisir une voie de valorisation faisable.",
  },
  {
    title: "Couverture CEDEAO complete",
    text: "Contexte adapte a tous les pays CEDEAO avec prise en compte des exigences reglementaires et contraintes locales.",
  },
  {
    title: "IA photo + validation operateur",
    text: "Identification du dechet via photo, proposition de filiere specifique, puis validation/correction par l'utilisateur.",
  },
  {
    title: "Caracteristiques physico-chimiques",
    text: "PCI, DCO/DBO, lignine et autres donnees optionnelles prioritaires si saisies par l'utilisateur.",
  },
  {
    title: "Base scientifique embarquee",
    text: "Si les mesures manquent, WasteAI complete automatiquement avec des valeurs de reference issues de la litterature.",
  },
  {
    title: "Marketplace et pilotage impact",
    text: "Mise en relation avec les acheteurs/recycleurs et suivi des KPI: CO2 evite, tonnage valorise, performance globale.",
  },
]

export default function PresentationSection({ onGoAnalyze }) {
  return (
    <section className="card presentation-wrap">
      <h2>Presentation de WasteAI</h2>
      <p className="presentation-subtitle">
        WasteAI est un outil d'aide a la decision pour toutes les industries, tous les recycleurs et tous les pays de la CEDEAO.
      </p>

      <div className="presentation-grid">
        {FEATURES.map((item) => (
          <article key={item.title} className="presentation-item">
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </article>
        ))}
      </div>

      <div className="actions-row">
        <button className="btn btn-primary" type="button" onClick={onGoAnalyze}>Commencer une analyse</button>
      </div>
    </section>
  )
}
