import { Suspense, lazy, useMemo, useState } from "react"
import "./App.css"
import { analyzeWaste, buildAnalyzePayload, API_BASE } from "./services/api"

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
}

function PresentationView() {
  return (
    <section className="card">
      <h2>Presentation</h2>
      <p className="subtitle">
        WasteAi est une plateforme de decision et de matching pour valoriser les dechets industriels
        avec un focus operationnel CEDEAO/Benin.
      </p>
      <ul>
        <li>Moteur de decision multicriteres (technique, economique, environnemental, social).</li>
        <li>Matching des acheteurs potentiels avec scoring et priorisation.</li>
        <li>Conformite CEDEAO/Bamako et suivi de la performance.</li>
      </ul>
    </section>
  )
}

function AnalyzeView() {
  const [form, setForm] = useState(INITIAL_FORM)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")

  const canAnalyze = useMemo(() => {
    return form.nom.trim().length > 1 && Number(form.quantite_kg) > 0
  }, [form.nom, form.quantite_kg])

  async function handleAnalyze() {
    setLoading(true)
    setError("")
    setInfo("")

    try {
      const payload = buildAnalyzePayload(form)
      const response = await analyzeWaste(payload)
      setResult(response.data)

      if (response.source === "offline") {
        setInfo(response.warning)
      } else {
        setInfo(`Analyse realisee via API distante (${response.apiBase}).`)
      }
    } catch (err) {
      setResult(null)
      setError(err?.message || "Analyse impossible.")
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
    setInfo("")
  }

  return (
    <section className="card">
      <h2>Analyse</h2>
      <p className="subtitle">Analyse API + fallback hors-ligne automatique.</p>

      <div className="grid">
        <label>
          Nom
          <input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
        </label>
        <label>
          Quantite (kg)
          <input type="number" value={form.quantite_kg} onChange={(e) => setForm({ ...form, quantite_kg: e.target.value })} />
        </label>
        <label>
          Categorie
          <select value={form.categorie} onChange={(e) => setForm({ ...form, categorie: e.target.value })}>
            <option value="metal">metal</option>
            <option value="organique">organique</option>
            <option value="chimique">chimique</option>
            <option value="plastique">plastique</option>
            <option value="electronique">electronique</option>
            <option value="papier">papier</option>
            <option value="verre">verre</option>
            <option value="autre">autre</option>
          </select>
        </label>
        <label>
          Type dechet
          <select value={form.type_dechet} onChange={(e) => setForm({ ...form, type_dechet: e.target.value })}>
            <option value="biomasse_lignocellulosique">biomasse_lignocellulosique</option>
            <option value="boue_de_vidange">boue_de_vidange</option>
            <option value="huile_usagee">huile_usagee</option>
            <option value="textile">textile</option>
            <option value="plastique">plastique</option>
            <option value="autre">autre</option>
          </select>
        </label>
        <label>
          Industrie
          <select value={form.type_industrie} onChange={(e) => setForm({ ...form, type_industrie: e.target.value })}>
            <option value="agroalimentaire">agroalimentaire</option>
            <option value="metallurgie">metallurgie</option>
            <option value="chimie">chimie</option>
            <option value="textile">textile</option>
            <option value="automobile">automobile</option>
            <option value="construction">construction</option>
            <option value="energie">energie</option>
            <option value="autre">autre</option>
          </select>
        </label>
        <label>
          Niveau danger
          <select value={form.niveau_danger} onChange={(e) => setForm({ ...form, niveau_danger: e.target.value })}>
            <option value="faible">faible</option>
            <option value="moyen">moyen</option>
            <option value="eleve">eleve</option>
            <option value="critique">critique</option>
          </select>
        </label>
      </div>

      <label>
        Description
        <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </label>

      <div className="checks">
        <label className="check-inline">
          <input type="checkbox" checked={form.contient_metaux} onChange={(e) => setForm({ ...form, contient_metaux: e.target.checked })} />
          Contient metaux
        </label>
      </div>

      <div className="actions">
        <button className="btn primary" onClick={handleAnalyze} disabled={!canAnalyze || loading}>
          {loading ? "Analyse en cours..." : "Analyser"}
        </button>
        <button className="btn" type="button" onClick={handleQuickPlastic}>
          Exemple plastique
        </button>
        <button className="btn" type="button" onClick={handleReset}>
          Reinitialiser
        </button>
      </div>

      <p className="endpoint">Endpoint API: {API_BASE}/api/waste/analyze</p>

      {info ? <div className="notice">{info}</div> : null}
      {error ? <div className="output error">{error}</div> : null}

      {result ? (
        <div className="result">
          <p><strong>Decision:</strong> {result.decision || "-"}</p>
          <p><strong>Score:</strong> {typeof result.score === "number" ? result.score : "-"}</p>
          <p><strong>Confiance:</strong> {result.confiance || "-"}</p>
          <p><strong>Resume:</strong> {result.resume_choix || "-"}</p>
          <pre className="output">{JSON.stringify(result, null, 2)}</pre>
        </div>
      ) : null}
    </section>
  )
}

export default function App() {
  const [view, setView] = useState("analyse")

  return (
    <main className="app">
      <section className="card" style={{ marginBottom: 12 }}>
        <h1>WasteAi</h1>
        <p className="subtitle">Plateforme de decision et de matching pour la valorisation des dechets.</p>
        <div className="actions" style={{ margin: 0 }}>
          <button className={`btn ${view === "analyse" ? "primary" : ""}`} onClick={() => setView("analyse")}>Analyse</button>
          <button className={`btn ${view === "marketplace" ? "primary" : ""}`} onClick={() => setView("marketplace")}>Marketplace</button>
          <button className={`btn ${view === "presentation" ? "primary" : ""}`} onClick={() => setView("presentation")}>Presentation</button>
        </div>
      </section>

      {view === "analyse" && <AnalyzeView />}

      {view === "marketplace" && (
        <Suspense fallback={<section className="card"><p>Chargement marketplace...</p></section>}>
          <section className="card">
            <LazyMarketplacePanel />
          </section>
        </Suspense>
      )}

      {view === "presentation" && <PresentationView />}
    </main>
  )
}

