import React, { useEffect, useState } from "react"

function badgeClass(filiere) {
  const key = String(filiere || "autre").toLowerCase()
  if (key.includes("textile")) return "badge badge-textile"
  if (key.includes("plast")) return "badge badge-plastique"
  if (key.includes("papier")) return "badge badge-papier"
  return "badge badge-autre"
}

function scoreClass(score) {
  const n = Number(score || 0)
  if (n >= 75) return "score-high"
  if (n >= 45) return "score-mid"
  return "score-low"
}

const money = (v) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(v || 0))

function confidenceStatus(confidence) {
  const c = Number(confidence || 0)
  if (c < 40) {
    return {
      label: "Identification faible",
      message: "Photo difficile a analyser. Essayez une image plus nette.",
      warn: true,
    }
  }
  if (c < 60) {
    return {
      label: "Identification probable",
      message: "Proposition plausible. Merci de valider ou corriger.",
      warn: false,
    }
  }
  if (c <= 80) {
    return {
      label: "Identification correcte",
      message: "Bonne identification. Merci de valider.",
      warn: false,
    }
  }
  return {
    label: "Identification certaine",
    message: "Identification tres probable. Merci de confirmer.",
    warn: false,
  }
}

export default function ResultCard({
  result,
  onWhatsApp,
  onCorrect,
  onIncorrect,
  showCorrection,
  correctionMode,
  setCorrectionMode,
  correctionChoice,
  setCorrectionChoice,
  correctionComment,
  setCorrectionComment,
  correctionOptions,
  onSubmitCorrection,
  correctionStatus,
  onOpenMarketplace,
  onSave,
  compactMode = false,
}) {
  if (!result) return null

  const [showDetails, setShowDetails] = useState(!compactMode)

  useEffect(() => {
    setShowDetails(!compactMode)
  }, [compactMode, result?.nom_exact, result?.nom])

  const filiere = result.filiere || "autre"
  const score = Number(result.score_valorisation || result.score || 0)
  const confidence = Number(result.confiance_identification || 0)
  const confidenceInfo = confidenceStatus(confidence)
  const co2 = Number(result.impact_co2_kg || 0)
  const trees = Math.max(0, Math.round(co2 / 25))
  const carbon = Math.max(0, Math.round((co2 / 1000) * 15000))
  const shortDescription = String(result.description_estimee || result.explication || "").trim()

  return (
    <section className="card result-card">
      <div className="result-top">
        <span className={badgeClass(filiere)}>{String(filiere || "AUTRE").toUpperCase()}</span>
        {!compactMode ? (
          <div className="score-meter">
            <small>Score valorisation: {score}/100</small>
            <div className="score-bar">
              <div className={`score-fill ${scoreClass(score)}`} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
            </div>
          </div>
        ) : null}
      </div>

      <h3 style={{ marginBottom: 4 }}>{result.nom_exact || result.nom || "Dechet non precise"}</h3>
      <p style={{ marginTop: 0, color: "var(--muted)" }}>
        Confiance: {confidence}% - {confidenceInfo.label}
      </p>
      {shortDescription ? <p>{shortDescription}</p> : null}
      {confidenceInfo.warn ? <p className="warn">{confidenceInfo.message}</p> : <p>{confidenceInfo.message}</p>}

      <div className="actions-row">
        <button className="btn btn-primary" type="button" onClick={onCorrect}>Valider</button>
        <button className="btn" type="button" onClick={onIncorrect}>Corriger</button>
        <button className="btn" type="button" onClick={() => setShowDetails((v) => !v)}>{showDetails ? "Masquer details" : "Voir details"}</button>
        {!compactMode ? <button className="btn" type="button" onClick={onOpenMarketplace}>Voir Marketplace</button> : null}
        {!compactMode ? <button className="btn" type="button" onClick={onSave}>Sauver</button> : null}
      </div>

      {showDetails ? (
        <>
          <div className="result-grid">
            <article className="result-pane">
              <h4>Valorisation recommandee</h4>
              <p><strong>1. {result?.valorisation_1?.methode || "-"}</strong></p>
              <p>{result?.valorisation_1?.description || "-"}</p>
              <p>{money(result?.valorisation_1?.valeur_fcfa_tonne)} FCFA/tonne</p>
              <p><strong>2. {result?.valorisation_2?.methode || "-"}</strong></p>
              <p>{result?.valorisation_2?.description || "-"}</p>
              <p>{money(result?.valorisation_2?.valeur_fcfa_tonne)} FCFA/tonne</p>
            </article>

            <article className="result-pane">
              <h4>Acheteurs au Benin</h4>
              <div className="whats-list">
                {(Array.isArray(result.acheteurs_benin) ? result.acheteurs_benin : []).map((buyer) => (
                  <button key={buyer} className="whats-btn" type="button" onClick={() => onWhatsApp?.(buyer)}>
                    {buyer} - Contacter via WhatsApp
                  </button>
                ))}
              </div>
            </article>

            <article className="result-pane">
              <h4>Impact environnemental</h4>
              <p>CO2 evite: {(co2 / 1000).toFixed(2)} tonnes</p>
              <p>Equivalent: {trees} arbres plantes</p>
              <p>Valeur carbone: {money(carbon)} FCFA</p>
            </article>

            <article className="result-pane">
              <h4>Securite</h4>
              <p>Stockage: {result.conseil_stockage || "Lieu sec, a l'abri."}</p>
              <p>Danger: {result.niveau_danger || "faible"}</p>
            </article>
          </div>

          {!compactMode ? (
            <div className="actions-row">
              <button className="btn" type="button" onClick={onOpenMarketplace}>Voir Marketplace</button>
              <button className="btn" type="button" onClick={onSave}>Sauver</button>
            </div>
          ) : null}
        </>
      ) : null}

      {showCorrection ? (
        <div className="result-pane" style={{ marginTop: 10 }}>
          <p><strong>Corriger l'identification</strong></p>
          <div className="actions-row">
            <button className="btn" type="button" onClick={() => setCorrectionMode("correct")}>Identification correcte</button>
            <button className="btn" type="button" onClick={() => setCorrectionMode("incorrect")}>Identification incorrecte</button>
          </div>
          {correctionMode === "incorrect" ? (
            <div className="field">
              <label>Choisir le bon dechet</label>
              <select value={correctionChoice} onChange={(e) => setCorrectionChoice(e.target.value)}>
                <option value="">Selectionner...</option>
                {correctionOptions.map((item) => <option key={item.id} value={item.nom_exact}>{item.nom_exact}</option>)}
              </select>
            </div>
          ) : null}
          <div className="field">
            <label>Commentaire</label>
            <textarea rows={2} value={correctionComment} onChange={(e) => setCorrectionComment(e.target.value)} />
          </div>
          <div className="actions-row">
            <button className="btn btn-primary" type="button" onClick={onSubmitCorrection}>Enregistrer correction</button>
          </div>
        </div>
      ) : null}

      {Array.isArray(result.hypotheses) && result.hypotheses.length > 0 ? (
        <div className="hypotheses-box">
          <p><strong>Meilleures hypotheses :</strong></p>
          <ul>
            {result.hypotheses.slice(0, 3).map((h, idx) => (
              <li key={`h-${idx}`}>Hypothese {idx + 1}: {h.nom || "-"} - {h.confiance || 0}%</li>
            ))}
          </ul>
        </div>
      ) : null}

      {correctionStatus ? <p>{correctionStatus}</p> : null}
    </section>
  )
}
