import React, { useEffect, useState } from "react"
import { FEATURES } from "../config/features"
import { exportWasteResultPdf } from "../utils/pdfExport"

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

function splitParagraphs(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function confidenceStatus(confidence) {
  const c = Number(confidence || 0)
  if (c < 40) {
    return {
      label: "Identification faible",
      message: "Image difficile a analyser. Essayez une photo plus nette ou rapprochee.",
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
  const safeResult = result || {}

  const [showDetails, setShowDetails] = useState(!compactMode)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState("")

  useEffect(() => {
    setShowDetails(!compactMode)
  }, [compactMode, safeResult.nom_exact, safeResult.nom])

  useEffect(() => {
    setPdfError("")
  }, [safeResult.nom_exact, safeResult.nom])

  const filiere = safeResult.filiere || "autre"
  const score = Number(safeResult.score_valorisation || safeResult.score || 0)
  const confidence = Number(safeResult.confiance_identification || 0)
  const confidenceInfo = confidenceStatus(confidence)
  const co2 = Number(safeResult.co2_evite_estime_kg || safeResult.impact_co2_kg || safeResult?.impact_environnemental?.bilan_net_recommande_kgco2e || 0)
  const treatmentCost = Number(safeResult.cout_estime_fcfa_tonne || safeResult?.details_scores_bruts?.treatment_cost_fcfa || 0)
  const saleValue = Number(safeResult.valeur_estimee_fcfa_tonne || safeResult?.details_scores_bruts?.market_value_fcfa || 0)
  const industrialGain = Number(safeResult.gain_industriel_fcfa_tonne || safeResult?.details_scores_bruts?.gain_industriel_fcfa_tonne || saleValue - treatmentCost)
  const industrialGainTotal = Number(safeResult.gain_industriel_fcfa || safeResult?.details_scores_bruts?.gain_industriel_fcfa || 0)
  const roi = Number(safeResult?.details_scores_bruts?.roi || 0)
  const marginRate = treatmentCost > 0 ? ((industrialGain - 0) / treatmentCost) * 100 : 0
  const trees = Math.max(0, Math.round(co2 / 25))
  const carbon = Math.max(0, Math.round((co2 / 1000) * 15000))
  const shortDescription = String(safeResult.description_estimee || safeResult.resume_choix || safeResult.justification_technique || "").trim()

  const chosenRoute = String(safeResult.decision_principale || safeResult.decision || safeResult?.valorisation_1?.methode || "voie non specifiee")
  const alternatives = Array.isArray(safeResult.alternatives) ? safeResult.alternatives : []
  const classementFilieres = Array.isArray(safeResult.classement_filieres) ? safeResult.classement_filieres : []
  const routeRanking = [
    { filiere: chosenRoute, score, selected: true },
    ...alternatives.map((a) => ({
      filiere: String(a?.filiere || "alternative"),
      score: Number(a?.score || 0),
      selected: false,
      reason: String(a?.pourquoi_pas_prioritaire || ""),
    })),
  ]

  const detailScores = safeResult.details_scores || {}
  const perRouteScores = Array.isArray(safeResult.scores_par_voie) ? safeResult.scores_par_voie : []
  const whyPriority = String(safeResult.explication_detaillee || safeResult.explication || safeResult.justification_technique || safeResult.resume_choix || "").trim()

  async function handleDownloadPdf() {
    if (!result || pdfLoading) return
    setPdfError("")
    const wasShowingDetails = showDetails
    try {
      setPdfLoading(true)
      setShowDetails(true)
      await new Promise((resolve) => setTimeout(resolve, 60))
      await exportWasteResultPdf({ sourceId: "results", result: safeResult, filename: "wasteai-resultats.pdf" })
    } catch (error) {
      setPdfError(error?.message || "Echec de generation du PDF.")
    } finally {
      setShowDetails(wasShowingDetails)
      setPdfLoading(false)
    }
  }

  if (!result) return null

  return (
    <section className="card result-card" id="results">
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

      <h3 style={{ marginBottom: 4 }}>{safeResult.nom_exact || safeResult.nom || "Dechet non precise"}</h3>
      <p style={{ marginTop: 0, color: "var(--muted)" }}>
        Confiance: {confidence}% - {confidenceInfo.label}
      </p>
      {shortDescription ? <p>{shortDescription}</p> : null}
      {confidenceInfo.warn ? <p className="warn">{confidenceInfo.message}</p> : <p>{confidenceInfo.message}</p>}

      <div className="actions-row">
        <button className="btn btn-primary" type="button" onClick={onCorrect}>Valider</button>
        <button className="btn" type="button" onClick={onIncorrect}>Corriger</button>
        <button className="btn" type="button" onClick={() => setShowDetails((v) => !v)}>{showDetails ? "Masquer details" : "Voir details"}</button>
        {!compactMode ? <button className="btn" type="button" onClick={onOpenMarketplace}>{FEATURES.marketplace ? "Voir Marketplace" : "Voir canaux recommandés"}</button> : null}
        {!compactMode ? <button className="btn" type="button" onClick={onSave}>Sauver</button> : null}
        <button className="btn btn-primary" type="button" onClick={handleDownloadPdf} disabled={pdfLoading}>
          {pdfLoading ? "Generation PDF..." : "Telecharger PDF"}
        </button>
      </div>

      {showDetails ? (
        <>
          <div className="result-grid">
            <article className="result-pane">
              <h4>Synthese economique</h4>
              <p><strong>Valeur estimee:</strong> {money(saleValue)} FCFA/tonne</p>
              <p><strong>Cout de traitement:</strong> {money(treatmentCost)} FCFA/tonne</p>
              <p><strong>Gain industriel brut:</strong> {money(industrialGain)} FCFA/tonne</p>
              <p><strong>Gain industriel total:</strong> {money(industrialGainTotal)} FCFA pour le lot</p>
              <p><strong>ROI estime:</strong> {roi.toFixed(2)}</p>
              <p><strong>Marge relative:</strong> {marginRate.toFixed(1)} % du cout de traitement</p>
              <p>La voie retenue est conservee si la marge brute reste positive et si les contraintes techniques et reglementaires restent compatibles avec une exploitation repetable.</p>
            </article>
            <article className="result-pane">
              <h4>Valorisation recommandee</h4>
              <p><strong>1. {safeResult?.valorisation_1?.methode || "-"}</strong></p>
              <p>{safeResult?.valorisation_1?.description || "-"}</p>
              <p>{money(safeResult?.valorisation_1?.valeur_fcfa_tonne)} FCFA/tonne</p>
              <p><strong>2. {safeResult?.valorisation_2?.methode || "-"}</strong></p>
              <p>{safeResult?.valorisation_2?.description || "-"}</p>
              <p>{money(safeResult?.valorisation_2?.valeur_fcfa_tonne)} FCFA/tonne</p>
            </article>

            <article className="result-pane">
              <h4>Acheteurs au Benin</h4>
              <div className="whats-list">
                {(Array.isArray(safeResult.acheteurs_benin) ? safeResult.acheteurs_benin : []).map((buyer) => (
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
              <p>Stockage: {safeResult.conseil_stockage || "Lieu sec, a l'abri."}</p>
              <p>Danger: {safeResult.niveau_danger || "faible"}</p>
            </article>

            <article className="result-pane">
              <h4>Explication de la voie de valorisation</h4>
              <p><strong>Voie prioritaire:</strong> {chosenRoute}</p>
              {whyPriority ? splitParagraphs(whyPriority).map((paragraph, idx) => <p key={`exp-${idx}`}>{paragraph}</p>) : null}
              {co2 || treatmentCost || industrialGainTotal ? <p><strong>Synthese:</strong> {money(co2)} kgCO2e evites pour le lot | {money(treatmentCost)} FCFA de cout | {money(industrialGainTotal)} FCFA de gain brut</p> : null}
              <p><strong>Classement des voies (score global):</strong></p>
              <ul>
                {routeRanking.map((r, idx) => (
                  <li key={`route-${idx}`}>
                    {r.selected ? "Choisie" : "Alternative"}: {r.filiere} - {Number(r.score || 0).toFixed(1)}/100
                    {r.reason ? ` (${r.reason})` : ""}
                  </li>
                ))}
              </ul>
              {Object.keys(detailScores).length > 0 ? (
                <p>
                  <strong>Detail criteres (voie prioritaire):</strong> Technique {Number(detailScores.technique || 0).toFixed(1)} | Economique {Number(detailScores.economique || 0).toFixed(1)} |
                  Environnement {Number(detailScores.environnement || 0).toFixed(1)} | Social {Number(detailScores.social || 0).toFixed(1)} | Reglementaire {Number(detailScores.reglementaire || 0).toFixed(1)}
                </p>
              ) : null}
              {perRouteScores.length > 0 ? (
                <>
                  <p><strong>Scoring detaille par voie:</strong></p>
                  <ul>
                    {perRouteScores.map((r, idx) => (
                      <li key={`ps-${idx}`}>
                        {r.filiere} - Global {Number(r.score || 0).toFixed(1)}/100 |
                        Tech {Number(r.technique || 0).toFixed(1)} |
                        Env {Number(r.environnement || 0).toFixed(1)} |
                        Reg {Number(r.reglementaire || 0).toFixed(1)} |
                        Eco {Number(r.economique || 0).toFixed(1)}
                        {r.blocked ? ` (bloquee: ${r.blocked_reason || "non conforme"})` : ""}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {classementFilieres.length > 0 ? (
                <>
                  <p><strong>Classement complet des filieres:</strong></p>
                  <ul>
                    {classementFilieres.map((item, idx) => (
                      <li key={`cf-${idx}`}>
                        {item.nom || item.id} - {Number(item.score || 0).toFixed(1)}/100 - {item.statut || "Peu pertinent"}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </article>
          </div>

          {!compactMode ? (
            <div className="actions-row">
              <button className="btn" type="button" onClick={onOpenMarketplace}>{FEATURES.marketplace ? "Voir Marketplace" : "Voir canaux recommandés"}</button>
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

      {Array.isArray(safeResult.hypotheses) && safeResult.hypotheses.length > 0 ? (
        <div className="hypotheses-box">
          <p><strong>Meilleures hypotheses :</strong></p>
          <ul>
            {safeResult.hypotheses.slice(0, 3).map((h, idx) => (
              <li key={`h-${idx}`}>Hypothese {idx + 1}: {h.nom || "-"} - {h.confiance || 0}%</li>
            ))}
          </ul>
        </div>
      ) : null}

      {pdfError ? <p className="warn">{pdfError}</p> : null}
      {correctionStatus ? <p>{correctionStatus}</p> : null}
    </section>
  )
}