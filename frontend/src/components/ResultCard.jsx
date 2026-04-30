import React, { useEffect, useMemo, useState } from "react"
import { exportWasteResultPdf } from "../utils/pdfExport"

function badgeClass(filiere) {
  const key = String(filiere || "autre").toLowerCase()
  if (key.includes("textile")) return "badge badge-textile"
  if (key.includes("plast")) return "badge badge-plastique"
  if (key.includes("papier")) return "badge badge-papier"
  return "badge badge-autre"
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
  if (c < 40) return { label: "Identification faible", message: "Image difficile Ã  analyser. Essayez une photo plus nette.", warn: true }
  if (c < 60) return { label: "Identification probable", message: "Proposition plausible. Merci de valider ou corriger.", warn: false }
  if (c <= 80) return { label: "Identification correcte", message: "Bonne identification. Merci de valider.", warn: false }
  return { label: "Identification certaine", message: "Identification trÃ¨s probable. Merci de confirmer.", warn: false }
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
  onOpenOperators,
  onSave,
  compactMode = false,
}) {
  const safeResult = result || {}
  const [showDetails, setShowDetails] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState("")

  useEffect(() => setPdfError(""), [safeResult.nom_exact, safeResult.nom])

  const filiere = safeResult.filiere || "autre"
  const confidence = Number(safeResult.confiance_identification || 0)
  const confidenceInfo = confidenceStatus(confidence)
  const shortDescription = String(safeResult.description_estimee || safeResult.resume_choix || safeResult.justification_technique || "").trim()
  const chosenRoute = String(safeResult.decision_principale || safeResult.decision || safeResult?.valorisation_1?.methode || "voie non spÃ©cifiÃ©e")
  const alternatives = Array.isArray(safeResult.alternatives) ? safeResult.alternatives : []
  const voiesExaminees = Array.isArray(safeResult.scores_par_voie) && safeResult.scores_par_voie.length > 0 ? safeResult.scores_par_voie.slice(0, 4) : alternatives.slice(0, 4)
  const whyPriority = String(safeResult.explication_detaillee || safeResult.explication || safeResult.justification_technique || safeResult.resume_choix || "").trim()
  const co2 = Number(safeResult.co2_evite_estime_kg || safeResult.impact_co2_kg || safeResult?.impact_environnemental?.bilan_net_recommande_kgco2e || 0)
  const treatmentCost = Number(safeResult.cout_estime_fcfa_tonne || safeResult?.details_scores_bruts?.treatment_cost_fcfa || 0)
  const industrialGainTotal = Number(safeResult.gain_industriel_fcfa || safeResult?.details_scores_bruts?.gain_industriel_fcfa || 0)
  const saleValue = Number(safeResult.valeur_estimee_fcfa_tonne || safeResult?.details_scores_bruts?.market_value_fcfa || 0)
  const roi = Number(safeResult?.details_scores_bruts?.roi || 0)
  const hasEconomicData =
    [saleValue, treatmentCost, industrialGainTotal].some((value) => Number.isFinite(value) && value > 0) ||
    (Number.isFinite(roi) && roi !== 0)

  const topMetrics = useMemo(() => ([
    { label: "Valeur", value: `${money(saleValue)} FCFA/t` },
    { label: "CoÃ»t", value: `${money(treatmentCost)} FCFA/t` },
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
      await exportWasteResultPdf({ sourceId: "results", result: safeResult, filename: "wasteai-resultats.pdf" })
    } catch (error) {
      setPdfError(error?.message || "Ã‰chec de gÃ©nÃ©ration du PDF.")
    } finally {
      setPdfLoading(false)
    }
  }

  if (!result) return null

  return (
    <section className="card result-card" id="results">
      <div className="result-top">
        <span className={badgeClass(filiere)}>{String(filiere || "AUTRE").toUpperCase()}</span>
      </div>

      <h3 style={{ marginBottom: 4 }}>{safeResult.nom_exact || safeResult.nom || "DÃ©chet non prÃ©cisÃ©"}</h3>
      <p style={{ marginTop: 0, color: "var(--muted)" }}>Confiance: {confidenceInfo.label}</p>
      {shortDescription ? <p>{shortDescription}</p> : null}

      <div className="result-pane" style={{ margin: "10px 0 14px" }}>
        <p style={{ marginTop: 0, marginBottom: 8 }}><strong>SynthÃ¨se Ã©conomique</strong></p>
        {hasEconomicData ? (
          <div className="result-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            {topMetrics.map((metric) => (
              <div key={metric.label}>
                <p style={{ margin: 0, color: "var(--muted)", fontSize: 12 }}>{metric.label}</p>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ marginBottom: 0, color: "var(--muted)" }}>Estimation Ã©conomique non disponible pour ce flux.</p>
        )}
      </div>

      <div className="actions-row">
        <button className="btn btn-primary" type="button" onClick={onCorrect}>Valider</button>
        <button className="btn" type="button" onClick={onIncorrect}>Corriger</button>
        <button className="btn" type="button" onClick={() => setShowDetails((v) => !v)}>{showDetails ? "Masquer dÃ©tails" : "Voir dÃ©tails"}</button>
        {!compactMode ? <button className="btn" type="button" onClick={onOpenOperators}>Voir opÃ©rateurs</button> : null}
        {!compactMode ? <button className="btn" type="button" onClick={onSave}>Sauver</button> : null}
        <button className="btn btn-primary" type="button" onClick={handleDownloadPdf} disabled={pdfLoading}>{pdfLoading ? "GÃ©nÃ©ration PDF..." : "TÃ©lÃ©charger PDF"}</button>
      </div>

      {showDetails ? (
        <div className="result-grid">
          <article className="result-pane">
            <h4>Pourquoi cette voie</h4>
            {splitParagraphs(whyPriority).slice(0, 2).map((paragraph, idx) => <p key={`why-${idx}`}>{paragraph}</p>)}
            <p><strong>Voie retenue:</strong> {chosenRoute}</p>
          </article>

          <article className="result-pane">
            <h4>Voies examinÃ©es</h4>
            <ul>
              {voiesExaminees.map((item, idx) => {
                const statut = String(item?.statut || item?.status || (item?.compatible === false ? "Non conforme" : idx === 0 ? "RecommandÃ©e" : "Alternative")).trim()
                const explanation = String(item?.explication || item?.pourquoi_pas_prioritaire || "").trim()
                return (
                  <li key={`route-${idx}`} style={{ marginBottom: 10 }}>
                    <div><strong>{String(item?.filiere || item?.nom || "voie")}</strong> - {statut}</div>
                    {explanation ? <div style={{ marginTop: 4, color: "var(--muted)" }}>{explanation}</div> : null}
                  </li>
                )
              })}
            </ul>
          </article>

          <article className="result-pane">
            <h4>RepÃ¨res clÃ©s</h4>
            <p><strong>Valeur estimÃ©e:</strong> {money(saleValue)} FCFA/tonne</p>
            <p><strong>CoÃ»t:</strong> {money(treatmentCost)} FCFA/tonne</p>
            <p><strong>Gain brut:</strong> {money(industrialGainTotal)} FCFA</p>
            <p><strong>CO2 Ã©vitÃ©:</strong> {money(co2)} kg</p>
            <p><strong>ROI:</strong> {Number.isFinite(roi) ? roi.toFixed(2) : "n/d"}</p>
          </article>
        </div>
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
              <label>Choisir le bon dÃ©chet</label>
              <select value={correctionChoice} onChange={(e) => setCorrectionChoice(e.target.value)}>
                <option value="">SÃ©lectionner...</option>
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
      {correctionStatus ? <p>{correctionStatus}</p> : null}
    </section>
  )
}
