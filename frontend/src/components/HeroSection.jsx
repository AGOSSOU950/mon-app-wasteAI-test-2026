import React, { useEffect, useState } from "react"

export default function HeroSection({ onAnalyzeNow }) {
  const [values, setValues] = useState({ a: 0, b: 0, c: 0 })

  useEffect(() => {
    let frame = 0
    const timer = setInterval(() => {
      frame += 1
      setValues((prev) => ({
        a: Math.min(1250, prev.a + 180),
        b: Math.min(6, prev.b + 1),
        c: Math.min(18, prev.c + 2),
      }))
      if (frame > 7) clearInterval(timer)
    }, 110)

    return () => clearInterval(timer)
  }, [])

  return (
    <section className="hero card">
      <div className="hero-copy">
        <p className="eyebrow">Pilotage industriel & conformit?</p>
        <h2>Des recommandations de valorisation plus fiables, plus lisibles et directement actionnables.</h2>
        <p>WasteAI structure la d?cision autour du co?t, du gain, de l?impact et du cadre r?glementaire pour aider les sites industriels ? r?duire les risques et capter la valeur.</p>

        <div className="hero-stats">
          <div className="hero-stat">
            <strong>{values.a.toLocaleString("fr-FR")}</strong>
            <span>analyses exploitables</span>
          </div>
          <div className="hero-stat">
            <strong>{values.b}</strong>
            <span>couches de conformit?</span>
          </div>
          <div className="hero-stat">
            <strong>{values.c}</strong>
            <span>canaux locaux suivis</span>
          </div>
        </div>

        <div className="actions-row">
          <button className="btn btn-primary" type="button" onClick={onAnalyzeNow}>Analyser un flux</button>
        </div>
      </div>

      <div className="hero-visual" aria-hidden="true">
        <div className="hero-card hero-card-main">
          <span>Conformit?</span>
          <strong>CEDEAO / Bamako</strong>
          <small>Voies bloqu?es si non conformes</small>
        </div>
        <div className="hero-card hero-card-secondary">
          <span>Valorisation</span>
          <strong>Co?t / gain / CO2</strong>
          <small>Lecture financi?re et environnementale</small>
        </div>
        <div className="hero-card hero-card-tertiary">
          <span>Terrain</span>
          <strong>Canaux locaux</strong>
          <small>Op?rateurs identifi?s, contact direct</small>
        </div>
        <svg viewBox="0 0 520 300" width="100%" height="100%" className="hero-graph">
          <defs>
            <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#17372f" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#2f6f5f" stopOpacity="0.95" />
            </linearGradient>
            <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c7d8d1" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#edf3f1" stopOpacity="0.6" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="520" height="300" rx="26" fill="url(#g2)" />
          <rect x="44" y="42" width="118" height="182" rx="18" fill="#fff" stroke="#d8e2de" />
          <rect x="184" y="76" width="118" height="148" rx="18" fill="#fff" stroke="#d8e2de" />
          <rect x="324" y="58" width="152" height="166" rx="18" fill="#fff" stroke="#d8e2de" />
          <path d="M70 182C105 155 133 155 160 182" stroke="#2f6f5f" strokeWidth="7" fill="none" strokeLinecap="round" />
          <path d="M210 180C245 136 277 136 302 180" stroke="#17372f" strokeWidth="7" fill="none" strokeLinecap="round" />
          <path d="M350 176C393 142 424 142 454 176" stroke="#7c8b87" strokeWidth="7" fill="none" strokeLinecap="round" />
          <circle cx="102" cy="104" r="26" fill="url(#g1)" />
          <circle cx="242" cy="116" r="26" fill="#2f6f5f" />
          <circle cx="404" cy="104" r="26" fill="#8a9d96" />
          <text x="60" y="240" fontSize="15" fill="#17372f">D?cision industrialis?e, tra?able et conforme</text>
        </svg>
      </div>
    </section>
  )
}
