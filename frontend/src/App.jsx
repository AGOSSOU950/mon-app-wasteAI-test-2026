import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react"
import axios from "axios"
import "./App.css"
import useAnalytics from "./hooks/useAnalytics"

const LazyMarketplacePanel = lazy(() => import("./MarketplacePanel"))
const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8001"

const WASTE_TYPES = [
  "biomasse_lignocellulosique",
  "boue_de_vidange",
  "huile_usagee",
  "textile",
  "plastique",
  "autre"
]

const CATEGORIES = ["metal", "organique", "chimique", "plastique", "electronique", "papier", "verre", "autre"]
const INDUSTRIES = ["agroalimentaire", "metallurgie", "chimie", "textile", "automobile", "construction", "energie", "autre"]
const DANGER_LEVELS = ["faible", "moyen", "eleve", "critique"]
const CEDEAO_COUNTRIES = [
  "Benin",
  "Burkina Faso",
  "Cabo Verde",
  "Cote d'Ivoire",
  "Gambia",
  "Ghana",
  "Guinea",
  "Guinea-Bissau",
  "Liberia",
  "Mali",
  "Niger",
  "Nigeria",
  "Senegal",
  "Sierra Leone",
  "Togo"
]

const INITIAL_FORM = {
  nom: "",
  categorie: "metal",
  type_dechet: "autre",
  type_industrie: "autre",
  quantite_kg: "",
  niveau_danger: "faible",
  description: "",
  contient_metaux: false,
  pays_cedeao: "Benin",
  valorization: "recycling",
}

function toAnalyzePayload(form) {
  return {
    nom: form.nom,
    categorie: form.categorie,
    type_dechet: form.type_dechet,
    type_industrie: form.type_industrie,
    quantite_kg: Number(form.quantite_kg),
    niveau_danger: form.niveau_danger,
    description: form.description || "",
    contient_metaux: Boolean(form.contient_metaux),
    pays_cedeao: form.pays_cedeao || null,
  }
}

function buildMatchPayload(form, analyzeResult) {
  return {
    decision_result: {
      decision: analyzeResult?.decision || "",
      score: Number(analyzeResult?.score || 0),
      confiance: analyzeResult?.confiance || "faible",
    },
    waste_type: form.type_dechet,
    quantity: Number(form.quantite_kg || 0) / 1000,
    location: form.pays_cedeao || "Benin",
    valorization: form.valorization,
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function App() {
  const [view, setView] = useState("analyse")
  const [form, setForm] = useState(INITIAL_FORM)
  const [loading, setLoading] = useState(false)
  const [imageLoading, setImageLoading] = useState(false)
  const [imageStatus, setImageStatus] = useState("")
  const [error, setError] = useState("")
  const [result, setResult] = useState(null)
  const [matches, setMatches] = useState([])

  const { analytics, dashboardLoading, refreshAnalytics } = useAnalytics(API_BASE, setError)

  useEffect(() => {
    refreshAnalytics()
  }, [refreshAnalytics])

  const summary = analytics?.summary || null
  const history = analytics?.history || []

  const canSubmit = useMemo(() => {
    return form.nom.trim().length > 1 && Number(form.quantite_kg) > 0
  }, [form.nom, form.quantite_kg])

  const handleIdentifyImage = useCallback(async (file) => {
    if (!file) return
    setError("")
    setImageStatus("")
    setImageLoading(true)
    try {
      const dataUrl = await readFileAsDataUrl(file)
      const response = await axios.post(`${API_BASE}/api/waste/identify-image`, {
        image_base64: dataUrl,
        media_type: file.type || "image/jpeg",
        filename: file.name,
      })
      const identified = response.data || {}
      setForm(prev => ({
        ...prev,
        nom: identified.nom || prev.nom,
        categorie: identified.categorie || prev.categorie,
        type_dechet: identified.type_dechet || prev.type_dechet,
        description: identified.description_estimee || prev.description,
      }))

      const confiance = String(identified.confiance || "faible")
      const warning = identified.avertissement ? ` ${identified.avertissement}` : ""
      setImageStatus(`Image analysee (${confiance}).${warning}`)
    } catch (err) {
      setImageStatus("")
      setError(err?.response?.data?.detail || "Identification image impossible.")
    } finally {
      setImageLoading(false)
    }
  }, [])

  const handleAnalyze = useCallback(async () => {
    setError("")
    setLoading(true)
    setMatches([])
    try {
      const analyzeRes = await axios.post(`${API_BASE}/api/waste/analyze`, toAnalyzePayload(form))
      const analyzeData = analyzeRes.data
      setResult(analyzeData)

      try {
        const matchRes = await axios.post(`${API_BASE}/api/marketplace/match`, buildMatchPayload(form, analyzeData))
        setMatches(matchRes.data?.top_3_buyers || [])
      } catch (matchErr) {
        const status = matchErr?.response?.status
        setMatches([])
        if (status === 404) {
          setError("Analyse effectuee, mais le module marketplace/match n'est pas disponible sur cette API.")
        } else {
          setError("Analyse effectuee, mais le matching marketplace a echoue.")
        }
      }

      await refreshAnalytics()
    } catch (err) {
      setError(err?.response?.data?.detail || "Analyse impossible. Verifie les champs et la connexion API.")
    } finally {
      setLoading(false)
    }
  }, [form, refreshAnalytics])

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">WasteAi</p>
          <h1>WasteAi</h1>
          <p className="subtitle">Version ciblee CEDEAO avec focus operationnel sur le Benin, explication detaillee et matching intelligent.</p>
        </div>
        <div className="topbar-actions">
          <button className={view === "analyse" ? "tab active" : "tab"} onClick={() => setView("analyse")}>Analyse</button>
          <button className={view === "marketplace" ? "tab active" : "tab"} onClick={() => setView("marketplace")}>Marketplace</button>
          <button className={view === "presentation" ? "tab active" : "tab"} onClick={() => setView("presentation")}>Presentation</button>
        </div>
      </header>

      {view === "analyse" && (
        <main className="layout">
          <section className="panel form-panel">
            <h2>Entrée de déchet</h2>

            <div className="image-upload-box">
              <p className="muted">Tu ne connais pas le nom du déchet? Ajoute une photo pour une pré-identification IA.</p>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => handleIdentifyImage(e.target.files?.[0])}
                disabled={imageLoading}
              />
              {imageLoading && <p className="muted">Analyse image en cours...</p>}
              {imageStatus && <p className="muted">{imageStatus}</p>}
            </div>

            <div className="grid two">
              <label>Nom
                <input value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} placeholder="Ex: Papier bureau trié" />
              </label>
              <label>Quantité (kg)
                <input type="number" value={form.quantite_kg} onChange={e => setForm({ ...form, quantite_kg: e.target.value })} />
              </label>
              <label>Catégorie
                <select value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value })}>{CATEGORIES.map(v => <option key={v} value={v}>{v}</option>)}</select>
              </label>
              <label>Type de déchet
                <select value={form.type_dechet} onChange={e => setForm({ ...form, type_dechet: e.target.value })}>{WASTE_TYPES.map(v => <option key={v} value={v}>{v}</option>)}</select>
              </label>
              <label>Industrie
                <select value={form.type_industrie} onChange={e => setForm({ ...form, type_industrie: e.target.value })}>{INDUSTRIES.map(v => <option key={v} value={v}>{v}</option>)}</select>
              </label>
              <label>Niveau de danger
                <select value={form.niveau_danger} onChange={e => setForm({ ...form, niveau_danger: e.target.value })}>{DANGER_LEVELS.map(v => <option key={v} value={v}>{v}</option>)}</select>
              </label>
              <label>Pays CEDEAO (focus Benin)
                <select value={form.pays_cedeao} onChange={e => setForm({ ...form, pays_cedeao: e.target.value })}>
                  {CEDEAO_COUNTRIES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
              <label>Filière visée
                <select value={form.valorization} onChange={e => setForm({ ...form, valorization: e.target.value })}>
                  <option value="recycling">recycling</option>
                  <option value="reemploi">reemploi</option>
                  <option value="valorisation matiere">valorisation matiere</option>
                  <option value="valorisation energetique">valorisation energetique</option>
                </select>
              </label>
            </div>
            <label>Description
              <textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </label>
            <label className="check">
              <input type="checkbox" checked={form.contient_metaux} onChange={e => setForm({ ...form, contient_metaux: e.target.checked })} />
              contient des métaux
            </label>
            <button className="primary" disabled={!canSubmit || loading} onClick={handleAnalyze}>
              {loading ? "Traitement..." : "Analyser et matcher"}
            </button>
            {error && <p className="error">{error}</p>}
          </section>

          <section className="panel result-panel">
            <h2>Résultat décision moteur</h2>
            {!result && <p className="muted">Lance une analyse pour afficher la recommandation.</p>}
            {result && (
              <>
                <div className="kpi-row">
                  <div className="kpi"><span>Décision</span><strong>{result.decision}</strong></div>
                  <div className="kpi"><span>Score</span><strong>{Number(result.score || 0).toFixed(1)}/100</strong></div>
                  <div className="kpi"><span>Confiance</span><strong>{result.confiance}</strong></div>
                </div>
                {result.resume_choix && <p>{result.resume_choix}</p>}

                <details className="details-box" open>
                  <summary>Explication detaillee</summary>

                  {result.details_scores && Object.keys(result.details_scores).length > 0 && (
                    <p>
                      <strong>Scores appliques:</strong>{" "}
                      {Object.entries(result.details_scores).map(([k, v]) => `${k}: ${Number(v || 0).toFixed(1)}`).join(" | ")}
                    </p>
                  )}

                  {result.details_scores_bruts && Object.keys(result.details_scores_bruts).length > 0 && (
                    <p>
                      <strong>Scores bruts:</strong>{" "}
                      {Object.entries(result.details_scores_bruts).map(([k, v]) => `${k}: ${Number(v || 0).toFixed(2)}`).join(" | ")}
                    </p>
                  )}

                  {result.detail_scoring && Object.keys(result.detail_scoring).length > 0 && (
                    <div>
                      <p><strong>Attribution des scores par regle:</strong></p>
                      {Object.entries(result.detail_scoring).map(([decision, rows]) => (
                        <div key={decision} className="detail-group">
                          <p><strong>{decision}</strong></p>
                          <ul>
                            {(rows || []).map((r, i) => (
                              <li key={`${decision}-${i}`}>{(r.points ?? 0) >= 0 ? "+" : ""}{r.points} pts - {r.regle}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}

                  {result.facteurs_cles?.length > 0 && (
                    <div>
                      <p><strong>Facteurs cles:</strong></p>
                      <ul>{result.facteurs_cles.map((f, i) => <li key={i}>{f}</li>)}</ul>
                    </div>
                  )}

                  {result.options_bloquees?.length > 0 && (
                    <div>
                      <p><strong>Options bloquees:</strong></p>
                      <ul>{result.options_bloquees.map((o, i) => <li key={i}>{o}</li>)}</ul>
                    </div>
                  )}

                  {result.conformite_reglementaire?.status && (
                    <p>
                      <strong>Conformite CEDEAO:</strong> {result.conformite_reglementaire.status} ({result.conformite_reglementaire.max_severity || "low"}) | <strong>Risque:</strong> {result.conformite_reglementaire.risk_score ?? 0}/100
                    </p>
                  )}

                  {result.impact_environnemental?.bilan_net_recommande_kgco2e !== undefined && (
                    <p>
                      <strong>Impact carbone net recommande:</strong> {result.impact_environnemental.bilan_net_recommande_kgco2e} kgCO2e evites
                    </p>
                  )}
                </details>
              </>
            )}

            {result?.conformite_reglementaire && (
              <section className="compliance-box">
                <div className="compliance-head">
                  <h3>Conformite CEDEAO/Bamako</h3>
                  <span className={`badge ${String(result.conformite_reglementaire.status || "").toLowerCase()}`}>
                    {result.conformite_reglementaire.status || "inconnu"}
                  </span>
                </div>
                <p className="muted">
                  Scope: {result.conformite_reglementaire.scope || "CEDEAO"} | Pays: {result.conformite_reglementaire.country || form.pays_cedeao || "Benin"} | Risque: {result.conformite_reglementaire.risk_score ?? 0}/100
                </p>
                {!!result.conformite_reglementaire.max_severity && <p className="muted">Severite max: {result.conformite_reglementaire.max_severity}</p>}

                {Array.isArray(result.conformite_reglementaire.rule_hits) && result.conformite_reglementaire.rule_hits.length > 0 && (
                  <div>
                    <p><strong>Regles declenchees</strong></p>
                    <ul>
                      {result.conformite_reglementaire.rule_hits.map((hit, idx) => (
                        <li key={`${hit.id || "rule"}-${idx}`}>
                          {hit.label || hit.id || "Regle"} [{hit.severity || "medium"}] - {hit.message || ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {Array.isArray(result.references_reglementaires) && result.references_reglementaires.length > 0 && (
                  <div>
                    <p><strong>References reglementaires</strong></p>
                    <ul>
                      {result.references_reglementaires.slice(0, 4).map((ref, idx) => <li key={`ref-${idx}`}>{ref}</li>)}
                    </ul>
                  </div>
                )}
              </section>
            )}

            <h3>Top 3 acheteurs potentiels</h3>
            {matches.length === 0 && <p className="muted">Aucun matching affiché pour le moment.</p>}
            <div className="match-list">
              {matches.map((m, idx) => (
                <article key={`${m.buyer_name}-${idx}`} className="match-card">
                  <div className="match-head">
                    <strong>{idx + 1}. {m.buyer_name}</strong>
                    <span className="score">{m.matching_score}/100</span>
                  </div>
                  <p className="price">Prix estimé: <strong>{m.estimated_price_per_tonne}</strong> / tonne</p>
                  <p className="muted">{m.explanation}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="panel analytics-panel">
            <h2>Tableau de bord léger</h2>
            {dashboardLoading && <p className="muted">Chargement analytics...</p>}
            {!dashboardLoading && !summary && <p className="muted">Pas encore de données analytics.</p>}
            {summary && (
              <>
                <div className="kpi-row">
                  <div className="kpi"><span>Analyses</span><strong>{summary.total_analyses}</strong></div>
                  <div className="kpi"><span>Tonnes valorisées</span><strong>{summary.tonnes_valorisees} t</strong></div>
                  <div className="kpi"><span>CO2 évité</span><strong>{summary.co2_evite_kg} kg</strong></div>
                  <div className="kpi"><span>Revenus</span><strong>{summary.revenus_generes_eur} EUR</strong></div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Date</th><th>Déchet</th><th>Décision</th><th>Score</th></tr>
                    </thead>
                    <tbody>
                      {history.map(row => (
                        <tr key={row.id}>
                          <td>{String(row.timestamp || "").slice(0, 10)}</td>
                          <td>{row.nom}</td>
                          <td>{row.decision}</td>
                          <td>{row.score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </main>
      )}

      {view === "marketplace" && (
        <Suspense fallback={<section className="panel"><p className="muted">Chargement marketplace...</p></section>}>
          <LazyMarketplacePanel />
        </Suspense>
      )}

      {view === "presentation" && (
        <main className="presentation-layout">
          <section className="panel">
            <h2>Presentation de WasteAi</h2>
            <p>
              WasteAi est une plateforme de decision et de matching pour transformer les dechets industriels en valeur locale.
              L'application priorise les pays CEDEAO avec une implementation orientee Benin.
            </p>
            <div className="presentation-grid">
              <article className="presentation-card">
                <h3>Fonctionnalites cles</h3>
                <ul>
                  <li>Moteur de decision multicriteres (technique, economique, environnemental, social).</li>
                  <li>Conformite reglementaire CEDEAO, Accord de Bamako et restrictions d'export par pays.</li>
                  <li>Matching marketplace des 3 meilleurs acheteurs avec scoring et prix estime.</li>
                  <li>Identification IA par photo quand le nom du dechet est inconnu.</li>
                </ul>
              </article>
              <article className="presentation-card">
                <h3>Particularites</h3>
                <ul>
                  <li>Approche prioritaire de developpement durable et d'economie circulaire.</li>
                  <li>Valorisation matiere privilegiee avant energie puis vente.</li>
                  <li>Pilotage par tableau de bord pour suivre impact carbone, revenus et volumes valorises.</li>
                  <li>Conception legere pour un usage operationnel en contexte industriel africain.</li>
                </ul>
              </article>
              <article className="presentation-card">
                <h3>Importance pour l'Afrique</h3>
                <ul>
                  <li>Reduction de l'enfouissement et des depots sauvages via des filieres locales.</li>
                  <li>Creation d'emplois verts et structuration de chaines de valeur regionales.</li>
                  <li>Amelioration de la conformite aux normes CEDEAO et aux engagements environnementaux.</li>
                  <li>Appui a l'industrialisation durable avec une intelligence adaptee au terrain.</li>
                </ul>
              </article>
            </div>
          </section>
        </main>
      )}
    </div>
  )
}


