import React, { useEffect, useMemo, useState } from "react"
import { exportWasteResultPdf } from "../utils/pdfExport"

function badgeClass(filiere) {
  const key = String(filiere || "autre").toLowerCase()
  if (key.includes("textile")) return "badge badge-textile"
  if (key.includes("plast")) return "badge badge-plastique"
  if (key.includes("papier")) return "badge badge-papier"
  return "badge badge-autre"
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return 0
}

const money = (value) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(value || 0))

function splitParagraphs(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function confidenceStatus(confidence) {
  const c = Number(confidence || 0)
  if (c < 40) return { label: "Identification faible", message: "Image difficile à analyser. Essayez une photo plus nette.", warn: true }
  if (c < 60) return { label: "Identification probable", message: "Proposition plausible. Merci de valider ou corriger.", warn: false }
  if (c <= 80) return { label: "Identification correcte", message: "Bonne identification. Merci de valider.", warn: false }
  return { label: "Identification certaine", message: "Identification très probable. Merci de confirmer.", warn: false }
}

export default function ResultCard({
  result,
  form,
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
  onOpenOperators,
  onSave,
  compactMode = false,
}) {
  const safeResult = result || {}
  const source = safeResult.raw_api || safeResult
  const [showDetails, setShowDetails] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState("")

  useEffect(() => setPdfError(""), [safeResult.nom_exact, safeResult.nom])

  const filiere = safeResult.filiere || "autre"
  const confidence = Number(safeResult.confiance_identification || 0)
  const confidenceInfo = confidenceStatus(confidence)
  const shortDescription = String(safeResult.description_estimee || safeResult.resume_choix || safeResult.justification_technique || "").trim()
  const chosenRoute = String(safeResult.decision_principale || safeResult.decision || safeResult?.valorisation_1?.methode || "voie non spécifiée")
  const alternatives = Array.isArray(safeResult.alternatives) ? safeResult.alternatives : []
  const voiesExaminees = Array.isArray(safeResult.scores_par_voie) && safeResult.scores_par_voie.length > 0 ? safeResult.scores_par_voie.slice(0, 4) : alternatives.slice(0, 4)
  const whyPriority = String(safeResult.explication_detaillee || safeResult.explication || safeResult.justification_technique || safeResult.resume_choix || "").trim()
  const co2 = firstFiniteNumber(
    safeResult.co2_evite_estime_kg,
    source?.co2_evite_estime_kg,
    safeResult.impact_co2_kg,
    source?.impact_co2_kg,
    safeResult?.impact_environnemental?.bilan_net_recommande_kgco2e,
    source?.impact_environnemental?.bilan_net_recommande_kgco2e,
  )
  const treatmentCost = firstFiniteNumber(
    safeResult.cout_estime_fcfa_tonne,
    source?.cout_estime_fcfa_tonne,
    safeResult?.details_scores_bruts?.treatment_cost_fcfa_tonne,
    source?.details_scores_bruts?.treatment_cost_fcfa_tonne,
    safeResult?.details_scores_bruts?.treatment_cost_fcfa,
    source?.details_scores_bruts?.treatment_cost_fcfa,
  )
  const saleValue = firstFiniteNumber(
    safeResult.valeur_estimee_fcfa_tonne,
    source?.valeur_estimee_fcfa_tonne,
    safeResult?.details_scores_bruts?.market_value_fcfa_tonne,
    source?.details_scores_bruts?.market_value_fcfa_tonne,
    safeResult?.details_scores_bruts?.market_value_fcfa,
    source?.details_scores_bruts?.market_value_fcfa,
  )
  const industrialGainTotal = firstFiniteNumber(
    safeResult.gain_industriel_fcfa,
    source?.gain_industriel_fcfa,
    safeResult?.details_scores_bruts?.gain_industriel_fcfa,
    source?.details_scores_bruts?.gain_industriel_fcfa,
  )
  const industrialGainTon = firstFiniteNumber(
    safeResult.gain_industriel_fcfa_tonne,
    source?.gain_industriel_fcfa_tonne,
    safeResult?.details_scores_bruts?.gain_industriel_fcfa_tonne,
    source?.details_scores_bruts?.gain_industriel_fcfa_tonne,
  )
  const roi = firstFiniteNumber(safeResult?.details_scores_bruts?.roi, source?.details_scores_bruts?.roi)
  const hasEconomicData = [saleValue, treatmentCost, industrialGainTotal, industrialGainTon].some((value) => Number.isFinite(value) && value !== 0) || (Number.isFinite(roi) && roi !== 0)

  const topMetrics = useMemo(() => ([
    { label: "Valeur", value: `${money(saleValue)} FCFA/t` },
    { label: "Coût", value: `${money(treatmentCost)} FCFA/t` },
    { label: "Gain net", value: `${money(industrialGainTotal)} FCFA` },
    { label: "ROI", value: Number.isFinite(roi) ? roi.toFixed(2) : "n/d" },
  ]), [saleValue, treatmentCost, industrialGainTotal, roi])

  async function handleDownloadPdf() {
    if (!result || pdfLoading) return
    setPdfError("")
    try {
      setPdfLoading(true)
      setShowDetails(true)
      await new Promise((resolve) => setTimeout(resolve, 50))
      await exportWasteResultPdf({ sourceId: "results", result: safeResult, form, filename: "wasteai-resultats.pdf" })
    } catch (error) {
      setPdfError(error?.message || "Échec de génération du PDF.")
    } finally {
      setPdfLoading(false)
    }
  }

  if (!result) return null

  return (
    <section className="card result-card" id="results">
      <div className="result-hero">
        <div className="result-hero-copy">
          <div className="result-top">
            <span className={badgeClass(filiere)}>{String(filiere || "AUTRE").toUpperCase()}</span>
            <span className="result-chip">{confidenceInfo.label}</span>
          </div>
          <h3>{safeResult.nom_exact || safeResult.nom || "Déchet non précisé"}</h3>
          <p className="result-subtitle">{shortDescription || "Analyse structurée des voies de valorisation et des contraintes du flux."}</p>
          <div className="result-chips">
            <span className="result-chip result-chip-strong">{chosenRoute}</span>
            <span className="result-chip">{Number.isFinite(confidence) ? `${Math.round(confidence)} % de confiance` : "Confiance non disponible"}</span>
          </div>
        </div>
        <div className="result-hero-side">
          <div className="result-score-block">
            <p>Lecture rapide</p>
            <strong>{confidenceInfo.label}</strong>
            <small>{confidenceInfo.message}</small>
          </div>
        </div>
      </div>

      <div className="result-pane result-summary">
        <p className="result-section-title">Synthèse économique</p>
        <div className="result-grid result-metrics" style={{ marginTop: 0 }}>
          {hasEconomicData ? (
            topMetrics.map((metric) => (
              <div key={metric.label}>
                <p className="metric-label">{metric.label}</p>
                <strong className="metric-value">{metric.value}</strong>
              </div>
            ))
          ) : (
            <p className="result-status">Estimation économique non disponible pour ce flux.</p>
          )}
        </div>
        <p className="result-footnote">Impact environnemental: {money(co2)} kgCO2e évités.</p>
      </div>

      <div className="actions-row">
        <button className="btn btn-primary" type="button" onClick={onCorrect}>Valider</button>
        <button className="btn" type="button" onClick={onIncorrect}>Corriger</button>
        <button className="btn" type="button" onClick={() => setShowDetails((v) => !v)}>{showDetails ? "Masquer détails" : "Voir détails"}</button>
        {!compactMode ? <button className="btn" type="button" onClick={onOpenOperators}>Voir opérateurs</button> : null}
        {!compactMode ? <button className="btn" type="button" onClick={onSave}>Sauver</button> : null}
        <button className="btn btn-primary" type="button" onClick={handleDownloadPdf} disabled={pdfLoading}>{pdfLoading ? "Génération PDF..." : "Télécharger PDF"}</button>
      </div>

      {showDetails ? (
        <div className="result-grid result-details">
          <article className="result-pane">
            <h4>Justification détaillée</h4>
            {splitParagraphs(whyPriority).slice(0, 3).map((paragraph, idx) => (
              <p key={`why-${idx}`}>{paragraph}</p>
            ))}
            <p><strong>Voie retenue:</strong> {chosenRoute}</p>
          </article>

          <article className="result-pane">
            <h4>Voies examinées</h4>
            <ul>
              {voiesExaminees.map((item, idx) => {
                const statut = String(item?.statut || item?.status || (item?.compatible === false ? "Non conforme" : idx === 0 ? "Recommandée" : "Alternative")).trim()
                const explanation = String(item?.explication || item?.pourquoi_pas_prioritaire || "").trim()
                return (
                  <li key={`route-${idx}`} className="route-item">
                    <div><strong>{String(item?.solution || item?.nom || item?.filiere || "voie")}</strong> - {statut}</div>
                    {explanation ? <div className="route-explanation">{explanation}</div> : null}
                  </li>
                )
              })}
            </ul>
          </article>

          <article className="result-pane">
            <h4>Repères clés</h4>
            <p><strong>Valeur estimée:</strong> {money(saleValue)} FCFA/tonne</p>
            <p><strong>Coût:</strong> {money(treatmentCost)} FCFA/tonne</p>
            <p><strong>Gain brut:</strong> {money(industrialGainTotal)} FCFA</p>
            <p><strong>CO2 évité:</strong> {money(co2)} kg</p>
            <p><strong>ROI:</strong> {Number.isFinite(roi) ? roi.toFixed(2) : "n/d"}</p>
            {Number.isFinite(industrialGainTon) && industrialGainTon !== 0 ? <p><strong>Gain/t:</strong> {money(industrialGainTon)} FCFA/t</p> : null}
          </article>
        </div>
      ) : null}

      {showCorrection ? (
        <div className="result-pane result-correction">
          <p><strong>Corriger l'identification</strong></p>
          <div className="actions-row">
            <button className="btn" type="button" onClick={() => setCorrectionMode("correct")}>Identification correcte</button>
            <button className="btn" type="button" onClick={() => setCorrectionMode("incorrect")}>Identification incorrecte</button>
          </div>
          {correctionMode === "incorrect" ? (
            <div className="field">
              <label>Choisir le bon déchet</label>
              <select value={correctionChoice} onChange={(e) => setCorrectionChoice(e.target.value)}>
                <option value="">Sélectionner...</option>
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

      {pdfError ? <p className="warn">{pdfError}</p> : null}
      {correctionStatus ? <p className="result-status">{correctionStatus}</p> : null}
    </section>
  )
}