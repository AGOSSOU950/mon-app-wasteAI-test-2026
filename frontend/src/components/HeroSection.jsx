import React, { useEffect, useState } from "react"

export default function HeroSection({ onAnalyzeNow }) {
  const [values, setValues] = useState({ a: 0, b: 0, c: 0 })

  useEffect(() => {
    let frame = 0
    const timer = setInterval(() => {
      frame += 1
      setValues((prev) => ({
        a: Math.min(1200, prev.a + 160),
        b: Math.min(6, prev.b + 1),
        c: Math.min(18, prev.c + 2),
      }))
      if (frame > 7) clearInterval(timer)
    }, 120)

    return () => clearInterval(timer)
  }, [])

  return (
    <section className="hero card">
      <div className="hero-copy">
        <p className="eyebrow">WasteAI / analyse procédés</p>
        <h2>Qualifier un flux sans perdre les contraintes terrain.</h2>
        <p>
          Saisie guidée, propriétés physico-chimiques, coûts et impact carbone: WasteAI structure l’analyse pour
          orienter rapidement vers la voie la plus réaliste.
        </p>

        <div className="hero-stats" aria-label="Indicateurs clés">
          <div className="hero-stat">
            <strong>{values.a.toLocaleString("fr-FR")}</strong>
            <span>analyses traitées</span>
          </div>
          <div className="hero-stat">
            <strong>{values.b}</strong>
            <span>couches de conformité</span>
          </div>
          <div className="hero-stat">
            <strong>{values.c}</strong>
            <span>acteurs locaux</span>
          </div>
        </div>

        <div className="actions-row">
          <button className="btn btn-primary" type="button" onClick={onAnalyzeNow}>
            Analyser un flux
          </button>
        </div>
      </div>

      <div className="hero-visual" aria-hidden="true">
        <div className="hero-card">
          <span>Lecture</span>
          <strong>Technique, coût, conformité</strong>
          <small>En un seul écran</small>
        </div>
        <div className="hero-card">
          <span>Focus</span>
          <strong>Voies utiles</strong>
          <small>Sans surcharge visuelle</small>
        </div>
        <div className="hero-card">
          <span>Terrain</span>
          <strong>Opérateurs locaux</strong>
          <small>Contact direct</small>
        </div>
      </div>
    </section>
  )
}
