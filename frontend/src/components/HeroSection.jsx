import React, { useEffect, useState } from "react"

export default function HeroSection({ onAnalyzeNow }) {
  const [values, setValues] = useState({ a: 0, b: 0, c: 0 })

  useEffect(() => {
    let frame = 0
    const timer = setInterval(() => {
      frame += 1
      setValues((prev) => ({
        a: Math.min(500, prev.a + 80),
        b: Math.min(3, prev.b + 1),
        c: Math.min(15, prev.c + 3),
      }))
      if (frame > 6) clearInterval(timer)
    }, 120)

    return () => clearInterval(timer)
  }, [])

  return (
    <section className="hero card">
      <div>
        <h2>Transformez vos dechets en opportunites</h2>
        <p>IA au service de toutes les industries, de tous les recycleurs et de tous les pays de la CEDEAO.</p>

        <div className="hero-stats">
          <div className="hero-stat">
            <strong>{values.a}+</strong>
            <span>dechets identifies</span>
          </div>
          <div className="hero-stat">
            <strong>{values.b}</strong>
            <span>filieres prioritaires</span>
          </div>
          <div className="hero-stat">
            <strong>{values.c}</strong>
            <span>pays CEDEAO couverts</span>
          </div>
        </div>

        <div className="actions-row">
          <button className="btn btn-primary" type="button" onClick={onAnalyzeNow}>Analyser maintenant</button>
        </div>
      </div>

      <div className="hero-svg" aria-hidden="true">
        <svg viewBox="0 0 480 280" width="100%" height="100%">
          <rect x="0" y="0" width="480" height="280" fill="#f5f9f5" />
          <rect x="40" y="70" width="120" height="140" rx="12" fill="#dcedc8" stroke="#4caf50" />
          <rect x="180" y="95" width="120" height="115" rx="12" fill="#c8e6c9" stroke="#1b5e20" />
          <rect x="320" y="80" width="120" height="130" rx="12" fill="#fff8e1" stroke="#f9a825" />
          <circle cx="100" cy="50" r="22" fill="#f9a825" />
          <path d="M70 232C120 192 168 192 216 232" stroke="#4caf50" strokeWidth="6" fill="none" />
          <path d="M180 232C230 182 280 182 330 232" stroke="#1b5e20" strokeWidth="6" fill="none" />
          <circle cx="110" cy="130" r="20" fill="#4caf50" />
          <rect x="202" y="126" width="70" height="42" rx="8" fill="#1b5e20" />
          <rect x="346" y="124" width="68" height="48" rx="10" fill="#f9a825" />
          <text x="34" y="258" fontSize="13" fill="#1b5e20">WasteAI CEDEAO - Industries et recycleurs dans tous les pays</text>
        </svg>
      </div>
    </section>
  )
}
