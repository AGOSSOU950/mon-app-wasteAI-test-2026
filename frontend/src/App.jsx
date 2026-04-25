import { Suspense, lazy, useEffect, useMemo, useState } from "react"
import "./App.css"
import { analyzeWaste, buildAnalyzePayload, identifyWasteFromImage, getScientificPrefill } from "./services/api"
import useAnalytics from "./hooks/useAnalytics"

const LazyMarketplacePanel = lazy(() => import("./MarketplacePanel"))

const INITIAL_FORM = {
  nom: "Plastique melange",
  categorie: "plastique",
  type_dechet: "plastique",
  type_industrie: "autre",
  quantite_kg: "250",
  niveau_danger: "faible",
  description: "Lot plastique industriel a valoriser",
  contient_metaux: false,
  pays_cedeao: "Benin",
  pci_mj_kg: "",
  dbo_mg_l: "",
  dco_mg_l: "",
  taux_lignine_pct: "",
  taux_contamination_pct: "",
  type_plastique: "",
  presence_chlore: false,
}

const DEFAULT_WEIGHTS = {
  technique: 0.35,
  economique: 0.2,
  environnement: 0.15,
  social: 0.1,
  reglementaire: 0.2,
}

function parseExplanation(raw) {
  if (!raw || typeof raw !== "string") return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? parsed : null
  } catch {
    return null
  }
}

function formatPct(value) {
  return `${Math.round(Number(value || 0) * 100)}%`
}

function formatScore(value) {
  if (typeof value !== "number") return "-"
  return `${value.toFixed(2)}/100`
}

function confidenceClass(confidence) {
  const key = String(confidence || "").toLowerCase()
  if (key.includes("elevee") || key.includes("high")) return "confidence-high"
  if (key.includes("moyenne") || key.includes("medium")) return "confidence-medium"
  return "confidence-low"
}

function formatMetric(value, options = {}) {
  const numeric = Number(value || 0)
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: options.maximumFractionDigits ?? 1,
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
  }).format(Number.isFinite(numeric) ? numeric : 0)
}

function toTonnes(kg) {
  return Number((Number(kg || 0) / 1000).toFixed(2))
}

function extractHistoryRowMetrics(row) {
  const co2 = Number(
    row?.co2_evite_kg
      ?? row?.impact_environnemental?.bilan_net_recommande_kgco2e
      ?? 0
  )
  const revenue = Number(row?.revenus_generes_eur ?? row?.valeur_estimee ?? 0)
  const quantityKg = Number(row?.quantite_kg ?? 0)
  const decision = row?.mode_valorisation_propose || row?.decision || row?.recommandation || "-"

  return {
    co2: Number.isFinite(co2) ? co2 : 0,
    revenue: Number.isFinite(revenue) ? revenue : 0,
    quantityKg: Number.isFinite(quantityKg) ? quantityKg : 0,
    decision,
  }
}

function normalizeDateKey(value) {
  const raw = String(value || "")
  const quick = raw.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(quick)) return quick
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

function formatShortDate(dateKey) {
  if (!dateKey || dateKey.length < 10) return "-"
  return `${dateKey.slice(8, 10)}/${dateKey.slice(5, 7)}`
}

function buildDailyTrend(rows, days = 7) {
  const byDay = new Map()

  for (const row of rows || []) {
    const day = normalizeDateKey(row?.created_at || row?.date)
    if (!day) continue

    const prev = byDay.get(day) || { co2: 0, tonnes: 0, revenue: 0, analyses: 0 }
    const metrics = extractHistoryRowMetrics(row)

    byDay.set(day, {
      co2: prev.co2 + metrics.co2,
      tonnes: prev.tonnes + toTonnes(metrics.quantityKg),
      revenue: prev.revenue + metrics.revenue,
      analyses: prev.analyses + 1,
    })
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-days)
    .map(([date, values]) => ({ date, label: formatShortDate(date), ...values }))
}

function TrendBars({ title, unit, series, metricKey, decimals = 0 }) {
  const maxValue = Math.max(1, ...series.map((item) => Number(item?.[metricKey] || 0)))

  return (
    <article className="trend-card">
      <div className="trend-head">
        <h4>{title}</h4>
      </div>
      {series.length === 0 ? (
        <p className="trend-empty">Pas assez d'historique.</p>
      ) : (
        <>
          <div className="trend-bars" role="list" aria-label={title}>
            {series.map((point) => {
              const value = Number(point?.[metricKey] || 0)
              const height = Math.max(8, Math.round((value / maxValue) * 100))
              return (
                <div className="trend-col" role="listitem" key={`${title}-${point.date}`}>
                  <span className="trend-value">{formatMetric(value, { maximumFractionDigits: decimals })}</span>
                  <div className="trend-bar-wrap">
                    <div className="trend-bar" style={{ height: `${height}%` }} />
                  </div>
                  <span className="trend-label">{point.label}</span>
                </div>
              )
            })}
          </div>
          <p className="trend-unit">Unite: {unit}</p>
        </>
      )}
    </article>
  )
}
function ScoreGauge({ score }) {
  const safe = Number.isFinite(Number(score)) ? Math.max(0, Math.min(100, Number(score))) : 0
  return (
    <div className="gauge" style={{ "--score": safe }}>
      <div className="gauge-inner">
        <span>{Math.round(safe)}</span>
        <small>/100</small>
      </div>
    </div>
  )
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(new Error("Lecture image impossible"))
    reader.readAsDataURL(file)
  })
}

function EcowasMark() {
  return (
    <svg className="ecowas-map" viewBox="0 0 220 140" role="img" aria-label="Carte stylisee CEDEAO">
      <path d="M24 85 L34 66 L50 58 L66 40 L88 34 L101 26 L126 24 L138 30 L151 24 L170 30 L187 46 L197 66 L190 81 L175 92 L160 95 L145 110 L122 116 L97 108 L82 114 L58 106 L42 94 Z" />
      <circle cx="102" cy="76" r="4" />
    </svg>
  )
}

function PresentationView() {
  return (
    <section className="card presentation-card">
      <h2>Presentation</h2>
      <p className="subtitle">
        WasteAi est une plateforme industrielle d'aide a la decision qui transforme des donnees terrain en
        recommandations de valorisation concretes, techniquement exploitables et conformes CEDEAO/Bamako.
      </p>
      <div className="presentation-grid">
        <article>
          <h3>Ce qui rend WasteAi unique</h3>
          <ul>
            <li>Voie de valorisation specifique: pas seulement "matiere", mais une filiere precise (ex: recyclage mecanique plastique, charbon actif, refonte metaux).</li>
            <li>Moteur multicriteres industriel: technique, economique, environnemental, social et reglementaire.</li>
            <li>Prefill scientifique: PCI, lignine, DCO/DBO proposes automatiquement depuis la litterature quand les mesures terrain manquent.</li>
            <li>Identification IA par photo avec validation operateur avant lancement de l'analyse.</li>
          </ul>
        </article>
        <article>
          <h3>Conformite et surete reglementaire</h3>
          <ul>
            <li>Convention de Bamako: prise en compte explicite des restrictions sur les dechets dangereux.</li>
            <li>Cadres CEDEAO et regles pays: le moteur bloque les voies non conformes et ne retient que des options autorisees.</li>
            <li>Avertissements et exigences operationnelles: controle documentaire, tracabilite, operateurs agrees, conditions de mise en oeuvre.</li>
            <li>Score reglementaire integre au score global pour eviter les choix techniquement bons mais juridiquement risquées.</li>
          </ul>
        </article>
        <article>
          <h3>Marketplace et pilotage</h3>
          <ul>
            <li>Marketplace integree pour connecter producteurs et repreneurs/filières selon le type de flux.</li>
            <li>Tableau de bord impact: CO2 evite, tonnes valorisees, revenus estimes, tendances temporelles.</li>
            <li>Comparaison de scenarios: voie retenue + alternatives faisables pour arbitrage industriel.</li>
            <li>Mode operationnel resilient: API distante + fallback local pour continuer l'analyse en contexte reseau degrade.</li>
          </ul>
        </article>
      </div>
    </section>
  )
}
function DashboardView() {
  const { analytics, dashboardLoading, refreshAnalytics } = useAnalytics()

  useEffect(() => {
    refreshAnalytics()
  }, [refreshAnalytics])

  const summary = analytics?.summary || {}
  const historyRaw = Array.isArray(analytics?.history) ? analytics.history : []
  const history = historyRaw.filter((row) => row && typeof row === "object")
  const trendSeries = useMemo(() => buildDailyTrend(history, 7), [history])

  const kpis = [
    {
      label: "CO2 evite",
      value: `${formatMetric(summary.co2_evite_kg)} kgCO2e`,
      hint: "Impact cumule sur les analyses tracees",
    },
    {
      label: "Dechets valorises",
      value: `${formatMetric(summary.tonnes_valorisees, { maximumFractionDigits: 2 })} t`,
      hint: "Masse orientee vers une filiere utile",
    },
    {
      label: "Analyses realisees",
      value: `${formatMetric(summary.total_analyses, { maximumFractionDigits: 0 })}`,
      hint: "Nombre de cas traites par WasteAi",
    },
    {
      label: "Revenus estimes",
      value: `${formatMetric(summary.revenus_generes_eur, { maximumFractionDigits: 0 })} EUR`,
      hint: "Valorisation economique indicative",
    },
  ]

  return (
    <section className="card dashboard-card">
      <div className="dashboard-head">
        <div>
          <h2>Tableau de bord environnemental</h2>
          <p className="subtitle">Suivi consolide de la performance industrielle et climat.</p>
        </div>
        <button className="btn" type="button" onClick={refreshAnalytics} disabled={dashboardLoading}>
          {dashboardLoading ? "Actualisation..." : "Actualiser"}
        </button>
      </div>

      <div className="dashboard-kpis" role="list" aria-label="Indicateurs clefs">
        {kpis.map((kpi) => (
          <article className="dashboard-kpi" role="listitem" key={kpi.label}>
            <p className="dashboard-kpi-label">{kpi.label}</p>
            <p className="dashboard-kpi-value">{kpi.value}</p>
            <p className="dashboard-kpi-hint">{kpi.hint}</p>
          </article>
        ))}
      </div>

      <section className="dashboard-trends">
        <TrendBars title="Tendance CO2 evite" unit="kgCO2e/jour" series={trendSeries} metricKey="co2" />
        <TrendBars title="Tendance tonnage valorise" unit="t/jour" series={trendSeries} metricKey="tonnes" decimals={2} />
        <TrendBars title="Tendance valeur economique" unit="EUR/jour" series={trendSeries} metricKey="revenue" />
      </section>

      <section className="dashboard-history">
        <h3>Historique recent</h3>
        {dashboardLoading ? (
          <div className="dashboard-table-skeleton" aria-hidden="true">
            <div className="skeleton line w-100" />
            <div className="skeleton line w-100" />
            <div className="skeleton line w-100" />
          </div>
        ) : null}

        {!dashboardLoading && history.length === 0 ? (
          <p className="subtitle">Aucune analyse disponible pour le moment.</p>
        ) : null}

        {!dashboardLoading && history.length > 0 ? (
          <div className="dashboard-table-wrap">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Dechet</th>
                  <th>Voie retenue</th>
                  <th>Tonnage</th>
                  <th>CO2 evite</th>
                  <th>Valeur</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 12).map((row, idx) => {
                  const m = extractHistoryRowMetrics(row)
                  return (
                    <tr key={`${row?.id || row?.created_at || "row"}-${idx}`}>
                      <td>{String(row?.created_at || row?.date || "-").slice(0, 10)}</td>
                      <td>{row?.nom || row?.dechet || "-"}</td>
                      <td>{m.decision}</td>
                      <td>{formatMetric(toTonnes(m.quantityKg), { maximumFractionDigits: 2 })} t</td>
                      <td>{formatMetric(m.co2)} kg</td>
                      <td>{formatMetric(m.revenue, { maximumFractionDigits: 0 })} EUR</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </section>
  )
}
function AnalyzeView() {
  const [form, setForm] = useState(INITIAL_FORM)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState("")
  const [banner, setBanner] = useState(null)
  const [compactMode, setCompactMode] = useState(false)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState("")
  const [identifyLoading, setIdentifyLoading] = useState(false)
  const [identifyError, setIdentifyError] = useState("")
  const [aiProposal, setAiProposal] = useState(null)
  const [aiApplied, setAiApplied] = useState(false)
  const [scientificRefsUsed, setScientificRefsUsed] = useState([])

  const canAnalyze = useMemo(() => form.nom.trim().length > 1 && Number(form.quantite_kg) > 0, [form.nom, form.quantite_kg])
  const stepDescribeDone = Boolean(form.nom?.trim()) && Number(form.quantite_kg) > 0 && Boolean(form.categorie) && Boolean(form.type_dechet)
  const stepVerifyDone = Boolean(form.type_industrie) && Boolean(form.niveau_danger) && Boolean(form.pays_cedeao?.trim())
  const stepAnalyzeDone = Boolean(result)
  const activeStep = !stepDescribeDone ? 1 : !stepVerifyDone ? 2 : 3

  function handleImageChange(event) {
    const file = event.target.files?.[0] || null
    setImageFile(file)
    setAiProposal(null)
    setAiApplied(false)
    setIdentifyError("")
    if (!file) {
      setImagePreview("")
      return
    }
    const previewUrl = URL.createObjectURL(file)
    setImagePreview(previewUrl)
  }

  async function handleIdentifyImage() {
    if (!imageFile) return
    setIdentifyLoading(true)
    setIdentifyError("")
    setAiApplied(false)
    try {
      const imageBase64 = await fileToBase64(imageFile)
      const identified = await identifyWasteFromImage({
        imageBase64,
        mediaType: imageFile.type || "image/jpeg",
        filename: imageFile.name,
      })
      setAiProposal(identified)
    } catch (err) {
      setAiProposal(null)
      setIdentifyError(err?.message || "Identification image indisponible.")
    } finally {
      setIdentifyLoading(false)
    }
  }

  function applyAiSuggestion() {
    if (!aiProposal) return
    setForm((prev) => ({
      ...prev,
      nom: aiProposal.nom || prev.nom,
      categorie: aiProposal.categorie || prev.categorie,
      type_dechet: aiProposal.type_dechet || prev.type_dechet,
      description: aiProposal.description_estimee || prev.description,
    }))
    setAiApplied(true)
  }

  async function applyScientificPrefill() {
    try {
      const profile = await getScientificPrefill({
        nom: form.nom,
        type_dechet: form.type_dechet,
        categorie: form.categorie,
        description: form.description,
      })

      if (!profile?.defaults || Object.keys(profile.defaults).length === 0) {
        setScientificRefsUsed([])
        setBanner({
          type: "info",
          text: "Aucun profil scientifique specifique trouve pour ce dechet. Renseignez manuellement les caracteristiques si disponibles.",
        })
        return
      }

      const defaults = profile.defaults || {}
      setForm((prev) => ({
        ...prev,
        pci_mj_kg: prev.pci_mj_kg === "" ? String(defaults.pci_mj_kg ?? "") : prev.pci_mj_kg,
        taux_lignine_pct: prev.taux_lignine_pct === "" ? String(defaults.taux_lignine_pct ?? "") : prev.taux_lignine_pct,
        dbo_mg_l: prev.dbo_mg_l === "" ? String(defaults.dbo_mg_l ?? "") : prev.dbo_mg_l,
        dco_mg_l: prev.dco_mg_l === "" ? String(defaults.dco_mg_l ?? "") : prev.dco_mg_l,
        taux_contamination_pct: prev.taux_contamination_pct === "" ? String(defaults.taux_contamination_pct ?? "") : prev.taux_contamination_pct,
      }))

      setScientificRefsUsed(Array.isArray(profile.references) ? profile.references : [])
      setBanner({
        type: "info",
        text: `Pre-remplissage scientifique applique (${profile.source === "profile" ? "profil specifique" : profile.source === "type_fallback" ? "profil type" : "base scientifique"}). Vous pouvez ajuster les valeurs avant analyse.`,
      })
    } catch (err) {
      setBanner({
        type: "offline",
        text: "Base scientifique backend indisponible. Utilisez la saisie manuelle pour cette analyse.",
      })
      setScientificRefsUsed([])
    }
  }

  async function handleAnalyze() {
    setLoading(true)
    setError("")
    setBanner(null)

    try {
      const payload = buildAnalyzePayload(form)
      const response = await analyzeWaste(payload)
      setResult(response.data)

      if (response.source === "offline") {
        setBanner({
          type: "offline",
          text: "Mode hors-ligne active: analyse locale fiable en attendant la reprise reseau/API.",
        })
      } else {
        setBanner({ type: "info", text: "Analyse terminee avec l'API distante." })
      }
    } catch {
      setResult(null)
      setError("Analyse indisponible pour le moment.")
      setBanner({
        type: "offline",
        text: "Mode hors-ligne active: connexion API temporairement indisponible.",
      })
    } finally {
      setLoading(false)
    }
  }

  function handleQuickPlastic() {
    setForm({
      ...INITIAL_FORM,
      nom: "Plastique PEHD",
      type_dechet: "plastique",
      categorie: "plastique",
      quantite_kg: "500",
    })
  }

  function handleReset() {
    setForm(INITIAL_FORM)
    setResult(null)
    setError("")
    setBanner(null)
    setImageFile(null)
    setImagePreview("")
    setAiProposal(null)
    setAiApplied(false)
    setIdentifyError("")
    setScientificRefsUsed([])
  }

  function safeJsonPreview(value) {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return "[Resultat non serialisable]"
    }
  }

  const resultObj = result && typeof result === "object" ? result : null
  const compliance = resultObj?.conformite_reglementaire
  const exp = parseExplanation(resultObj?.explication)
  const scoring = exp?.details_scoring || null
  const weights = scoring?.ponderations || DEFAULT_WEIGHTS

  const score = typeof resultObj?.score === "number" ? resultObj.score : Number(exp?.score_global || 0)
  const decision = exp?.decision_principale || resultObj?.mode_valorisation_propose || resultObj?.decision || "-"
  const specificDecision = exp?.agent_ia_voie_specifique?.voie_specifique || resultObj?.decision_principale || decision
  const confidence = resultObj?.confiance || "-"

  const scoringRows = resultObj
    ? [
        {
          voie: decision,
          score,
          statut: "Retenue",
          justification: resultObj.justification_technique || exp?.justification_technique || resultObj.resume_choix || "",
        },
        ...((Array.isArray(exp?.alternatives) ? exp.alternatives : resultObj.alternatives || []).map((alt) => ({
          voie: alt?.filiere || "Alternative",
          score: typeof alt?.score === "number" ? alt.score : null,
          statut: "Alternative",
          justification: alt?.pourquoi_pas_prioritaire || "Score ou priorite inferieurs",
        }))),
      ]
    : []

  const combinedDeltas = exp?.ajustements_ml?.combined_deltas
  const hasMlDeltas = combinedDeltas && Object.keys(combinedDeltas).length > 0

  const bestAlternative = scoringRows.find((row) => row.statut === "Alternative")
  const narrativeSentences = []

  narrativeSentences.push(
    `Conclusion technique: la voie ${decision} est recommandee avec un score global de ${typeof score === "number" ? `${score.toFixed(1)}/100` : "-"}. Cette option presente le meilleur equilibre operationnel entre robustesse de procede, viabilite economique, performance environnementale, acceptabilite sociale et conformite reglementaire CEDEAO/Benin.`
  )

  if (scoring) {
    narrativeSentences.push(
      `Base d'evaluation multicriteres: technique ${formatScore(scoring.technique)}, economique ${formatScore(scoring.economique)}, environnement ${formatScore(scoring.environnement)}, social ${formatScore(scoring.social)} et reglementaire ${formatScore(scoring.reglementaire)}. Ces indicateurs structurent la recommandation finale selon une logique d'aide a la decision industrielle.`
    )
  }

  if (bestAlternative) {
    narrativeSentences.push(
      `Option de repli analysee: ${bestAlternative.voie} (${typeof bestAlternative.score === "number" ? `${bestAlternative.score}/100` : "score non disponible"}). Elle demeure moins pertinente dans le contexte actuel, notamment au regard des conditions de deployment local, de la maturite filiere et des exigences de maitrise du risque.`
    )
  }

  if (compliance) {
    narrativeSentences.push(
      `Lecture reglementaire: statut ${compliance.status || "non precise"}, risque ${compliance.risk_score ?? "-"}/100. La voie preconisee reste exploitable dans l'environnement CEDEAO/Benin, sous reserve de verification documentaire, tracabilite des flux et respect des obligations de controle applicables.`
    )
  }

  if (hasMlDeltas) {
    narrativeSentences.push(
      "Le moteur integre enfin des ajustements d'apprentissage issus du retour d'experience terrain. Ces corrections restent encadrees et viennent affiner la recommandation sans se substituer au socle technique, economique et reglementaire."
    )
  }

  return (
    <section className={`card analyze-card ${compactMode ? "compact" : ""}`}>
      <h2>Analyse</h2>
      <p className="subtitle">Moteur hybride API + mode hors-ligne resilient.</p>

      <div className="analyze-toolbar">
        <ol className="stepper" aria-label="Progression analyse">
          <li className={stepDescribeDone ? "done" : activeStep === 1 ? "active" : ""}><span>1</span> Decrire</li>
          <li className={stepVerifyDone ? "done" : activeStep === 2 ? "active" : ""}><span>2</span> Verifier</li>
          <li className={stepAnalyzeDone ? "done" : activeStep === 3 ? "active" : ""}><span>3</span> Analyser</li>
        </ol>
        <button className="btn compact-toggle" type="button" onClick={() => setCompactMode((v) => !v)}>
          {compactMode ? "Mode detaille" : "Mode compact"}
        </button>
      </div>

      {banner ? <div className={`notice ${banner.type === "offline" ? "offline" : "info"}`}>{banner.text}</div> : null}
      {error ? <div className="output error">{error}</div> : null}

      <div className="form-section">
        <h3>Identification IA par photo (optionnel)</h3>
        <p className="section-subtitle">Importez une photo du dechet, puis validez ou corrigez la proposition IA avant l'analyse.</p>
        <div className="photo-grid">
          <label>
            Photo du dechet
            <input type="file" accept="image/*" onChange={handleImageChange} />
          </label>
          <div className="photo-actions">
            <button className="btn" type="button" onClick={handleIdentifyImage} disabled={!imageFile || identifyLoading}>
              {identifyLoading ? "Identification IA..." : "Identifier avec IA"}
            </button>
            {aiProposal ? <button className="btn" type="button" onClick={applyAiSuggestion}>Valider la proposition IA</button> : null}
          </div>
        </div>
        {imagePreview ? <img className="photo-preview" src={imagePreview} alt="Apercu dechet" /> : null}
        {identifyError ? <p className="inline-error">{identifyError}</p> : null}
        {aiProposal ? (
          <div className="ai-proposal">
            <p><strong>Proposition IA:</strong> {aiProposal.nom || "dechet industriel"}</p>
            <p>Categorie: {aiProposal.categorie || "-"} | Type: {aiProposal.type_dechet || "-"} | Confiance: {aiProposal.confiance || "-"}</p>
            {aiProposal.description_estimee ? <p>{aiProposal.description_estimee}</p> : null}
            {aiProposal.avertissement ? <p className="inline-warn">{aiProposal.avertissement}</p> : null}
            {aiApplied ? <p className="inline-ok">Proposition IA appliquee. Vous pouvez ajuster les champs ci-dessous.</p> : null}
          </div>
        ) : null}
      </div>

      <div className="form-section">
        <h3>Identification du dechet</h3>
        <p className="section-subtitle">Profil de base du flux entrant.</p>
        <div className="grid">
          <label>Nom<input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} /></label>
          <label>Quantite (kg)<input type="number" value={form.quantite_kg} onChange={(e) => setForm({ ...form, quantite_kg: e.target.value })} /></label>
          <label>
            Categorie
            <select value={form.categorie} onChange={(e) => setForm({ ...form, categorie: e.target.value })}>
              <option value="metal">metal</option><option value="organique">organique</option><option value="chimique">chimique</option><option value="plastique">plastique</option><option value="electronique">electronique</option><option value="papier">papier</option><option value="verre">verre</option><option value="autre">autre</option>
            </select>
          </label>
          <label>
            Type dechet
            <select value={form.type_dechet} onChange={(e) => setForm({ ...form, type_dechet: e.target.value })}>
              <option value="biomasse_lignocellulosique">biomasse_lignocellulosique</option><option value="boue_de_vidange">boue_de_vidange</option><option value="huile_usagee">huile_usagee</option><option value="textile">textile</option><option value="plastique">plastique</option><option value="autre">autre</option>
            </select>
          </label>
        </div>
      </div>

      <div className="form-section">
        <h3>Contexte industriel</h3>
        <p className="section-subtitle">Parametres operationnels et reglementaires.</p>
        <div className="grid">
          <label>
            Industrie
            <select value={form.type_industrie} onChange={(e) => setForm({ ...form, type_industrie: e.target.value })}>
              <option value="agroalimentaire">agroalimentaire</option><option value="metallurgie">metallurgie</option><option value="chimie">chimie</option><option value="textile">textile</option><option value="automobile">automobile</option><option value="construction">construction</option><option value="energie">energie</option><option value="autre">autre</option>
            </select>
          </label>
          <label>
            Niveau danger
            <select value={form.niveau_danger} onChange={(e) => setForm({ ...form, niveau_danger: e.target.value })}>
              <option value="faible">faible</option><option value="moyen">moyen</option><option value="eleve">eleve</option><option value="critique">critique</option>
            </select>
          </label>
          <label>
            Pays CEDEAO
            <input value={form.pays_cedeao || ""} onChange={(e) => setForm({ ...form, pays_cedeao: e.target.value })} />
          </label>
        </div>
      </div>

      <div className="form-section">
        <h3>Caracterisation rapide</h3>
        <p className="section-subtitle">Informations textuelles pour enrichir le scoring.</p>
        <label>Description<textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <div className="checks">
          <label className="check-inline"><input type="checkbox" checked={form.contient_metaux} onChange={(e) => setForm({ ...form, contient_metaux: e.target.checked })} />Contient metaux</label>
        </div>
      </div>

      <div className="form-section">
        <h3>Caracteristiques physico-chimiques (optionnel)</h3>
        <p className="section-subtitle">Si renseignees, ces donnees sont transmises au moteur et influencent directement le calcul multicriteres.</p>
        <div className="grid">
          <label>PCI (MJ/kg)<input type="number" step="0.01" value={form.pci_mj_kg} onChange={(e) => setForm({ ...form, pci_mj_kg: e.target.value })} /></label>
          <label>Taux lignine (%)<input type="number" step="0.01" value={form.taux_lignine_pct} onChange={(e) => setForm({ ...form, taux_lignine_pct: e.target.value })} /></label>
          <label>DBO (mg/L)<input type="number" step="0.01" value={form.dbo_mg_l} onChange={(e) => setForm({ ...form, dbo_mg_l: e.target.value })} /></label>
          <label>DCO (mg/L)<input type="number" step="0.01" value={form.dco_mg_l} onChange={(e) => setForm({ ...form, dco_mg_l: e.target.value })} /></label>
          <label>Taux contamination (%)<input type="number" step="0.01" value={form.taux_contamination_pct} onChange={(e) => setForm({ ...form, taux_contamination_pct: e.target.value })} /></label>
          <label>Type plastique (si pertinent)<input value={form.type_plastique} onChange={(e) => setForm({ ...form, type_plastique: e.target.value })} /></label>
          <label className="check-inline"><input type="checkbox" checked={form.presence_chlore} onChange={(e) => setForm({ ...form, presence_chlore: e.target.checked })} />Presence chlore</label>
        </div>
      </div>

      <div className="actions secondary-actions">
        <button className="btn" type="button" onClick={applyScientificPrefill}>Pre-remplir depuis la litterature</button>
      </div>

      <div className="actions primary-action">
        <button className="btn primary full" onClick={handleAnalyze} disabled={!canAnalyze || loading}>{loading ? "Analyse en cours..." : "Analyser"}</button>
      </div>
      <div className="actions secondary-actions">
        <button className="btn" type="button" onClick={handleQuickPlastic}>Exemple plastique</button>
        <button className="btn" type="button" onClick={handleReset}>Reinitialiser</button>
      </div>

      {scientificRefsUsed.length > 0 ? (
        <div className="deep-explain refs-box">
          <h3>References scientifiques utilisees pour le pre-remplissage</h3>
          <ul>
            {scientificRefsUsed.map((ref, idx) => <li key={`sci-ref-${idx}`}>{ref}</li>)}
          </ul>
        </div>
      ) : null}

      {loading ? (
        <div className="result-card skeleton-card" aria-hidden="true">
          <div className="result-head">
            <div className="skeleton gauge-skeleton" />
            <div className="skeleton-lines">
              <div className="skeleton line w-70" />
              <div className="skeleton line w-45" />
              <div className="skeleton line w-55" />
            </div>
          </div>
          <div className="skeleton line w-100" />
          <div className="skeleton line w-90" />
          <div className="skeleton line w-80" />
        </div>
      ) : null}

      {resultObj && !loading ? (
        <div className="result-card">
          <div className="result-head">
            <ScoreGauge score={score} />
            <div className="result-meta">
              <span className="decision-badge">{decision}</span>
              <span className={`confidence-pill ${confidenceClass(confidence)}`}>Confiance: {confidence}</span>
              {compliance ? <p className="muted">Conformite: {compliance.status || "-"} | risque {compliance.risk_score ?? "-"}/100</p> : null}
              {specificDecision ? <p className="muted">Voie specifique: {specificDecision}</p> : null}
            </div>
          </div>

          {scoring ? (
            <div className="result-kpis" role="list" aria-label="Synthese rapide des sous-scores">
              <div className="kpi-chip" role="listitem"><span>Technique</span><strong>{formatScore(scoring.technique)}</strong></div>
              <div className="kpi-chip" role="listitem"><span>Economique</span><strong>{formatScore(scoring.economique)}</strong></div>
              <div className="kpi-chip" role="listitem"><span>Environnement</span><strong>{formatScore(scoring.environnement)}</strong></div>
              <div className="kpi-chip" role="listitem"><span>Reglementaire</span><strong>{formatScore(scoring.reglementaire)}</strong></div>
            </div>
          ) : null}

          {scoring ? (
            <div className="deep-explain">
              <h3>Methode de scoring</h3>
              <p>
                Score global = technique ({formatPct(weights.technique)}) + economique ({formatPct(weights.economique)}) +
                environnement ({formatPct(weights.environnement)}) + social ({formatPct(weights.social)}) + reglementaire ({formatPct(weights.reglementaire)}).
              </p>
              <p>
                Sous-scores voie retenue: technique {formatScore(scoring.technique)}, economique {formatScore(scoring.economique)},
                environnement {formatScore(scoring.environnement)}, social {formatScore(scoring.social)}, reglementaire {formatScore(scoring.reglementaire)}.
              </p>
            </div>
          ) : null}

          {scoringRows.length > 0 ? (
            <div className="score-ways">
              <h3>Scoring par voie</h3>
              <div className="score-ways-head">
                <span>Voie</span>
                <span>Score</span>
                <span>Statut</span>
              </div>
              {scoringRows.map((row, idx) => (
                <div className="score-way-row" key={`${row.voie}-${idx}`}>
                  <p><strong>{row.voie}</strong></p>
                  <p>{typeof row.score === "number" ? `${row.score}/100` : "-"}</p>
                  <p>{row.statut}</p>
                  <p className="score-way-why">{row.justification}</p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="deep-explain">
            <h3>Explication industrielle des resultats</h3>
            {narrativeSentences.map((sentence, idx) => (
              <p key={`narrative-${idx}`}>{sentence}</p>
            ))}
            {hasMlDeltas ? (
              <div>
                <p><strong>Ajustements apprentissage (ML + historique):</strong></p>
                <ul>
                  {Object.entries(combinedDeltas).map(([voie, delta]) => (
                    <li key={voie}>{voie}: {(Number(delta) >= 0 ? "+" : "") + Number(delta).toFixed(2)} points</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <details className="tech-details">
            <summary>Details techniques</summary>
            <pre className="output">{safeJsonPreview(resultObj)}</pre>
          </details>
        </div>
      ) : null}
    </section>
  )
}

export default function App() {
  const [view, setView] = useState("presentation")

  return (
    <main className="app">
      <section className="card shell-head">
        <div className="brand-row">
          <EcowasMark />
          <div>
            <h1>WasteAi CEDEAO</h1>
            <p className="subtitle">Decision industrielle et valorisation conforme aux exigences Bamako/CEDEAO.</p>
          </div>
        </div>

        <div className="actions shell-tabs">
          <button className={`btn ${view === "presentation" ? "primary" : ""}`} onClick={() => setView("presentation")}>Presentation</button>
          <button className={`btn ${view === "analyse" ? "primary" : ""}`} onClick={() => setView("analyse")}>Analyse</button>
          <button className={`btn ${view === "dashboard" ? "primary" : ""}`} onClick={() => setView("dashboard")}>Tableau de bord</button>
          <button className={`btn ${view === "marketplace" ? "primary" : ""}`} onClick={() => setView("marketplace")}>Marketplace</button>
        </div>
      </section>

      {view === "presentation" && <PresentationView />}
      {view === "analyse" && <AnalyzeView />}
      {view === "dashboard" && <DashboardView />}

      {view === "marketplace" && (
        <Suspense fallback={<section className="card"><p>Chargement marketplace...</p></section>}>
          <section className="card"><LazyMarketplacePanel /></section>
        </Suspense>
      )}
    </main>
  )
}