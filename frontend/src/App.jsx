import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react"
import "./App.css"
import {
  analyzeWaste,
  buildAnalyzePayload,
  identifyWasteFromImage,
  getScientificPrefill,
  getBeninWasteDatabase,
  submitIdentificationCorrection,
} from "./services/api"
import useAnalytics from "./hooks/useAnalytics"
import Header from "./components/Header"
import HeroSection from "./components/HeroSection"
import PresentationSection from "./components/PresentationSection"
import AnalysisForm from "./components/AnalysisForm"
import ResultCard from "./components/ResultCard"
import MarketplaceSection from "./components/MarketplaceSection"
import DashboardSection from "./components/DashboardSection"
import Footer from "./components/Footer"

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
  filiere: "plastique",
  pci_mj_kg: "",
  dbo_mg_l: "",
  dco_mg_l: "",
  taux_lignine_pct: "",
  taux_contamination_pct: "",
  type_plastique: "",
  presence_chlore: "",
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(new Error("Lecture image impossible"))
    reader.readAsDataURL(file)
  })
}

function normalizeResultToCard(result) {
  if (!result) return null
  return {
    nom_exact: result.nom_exact || result.nom || result.mode_valorisation_propose || "Resultat analyse",
    filiere: result.filiere || result.categorie || "autre",
    score_valorisation: result.score_valorisation ?? result.score ?? 0,
    confiance_identification: result.confiance_identification ?? (result.confiance === "elevee" ? 90 : result.confiance === "moyenne" ? 70 : 45),
    valorisation_1: result.valorisation_1 || {
      methode: result.decision_principale || result.mode_valorisation_propose || result.decision || "Valorisation recommandee",
      description: result.resume_choix || result.explication || "Recommendation basee sur l'analyse multicritere.",
      valeur_fcfa_tonne: 0,
    },
    valorisation_2: result.valorisation_2 || {
      methode: "Option alternative",
      description: "A valider selon qualite du lot et cout logistique.",
      valeur_fcfa_tonne: 0,
    },
    acheteurs_benin: result.acheteurs_benin || [],
    impact_co2_kg: result.impact_co2_kg || result?.impact_environnemental?.bilan_net_recommande_kgco2e || 0,
    conseil_stockage: result.conseil_stockage || "Stocker en zone seche, ventilee et tracee.",
    niveau_danger: result.niveau_danger || "faible",
    hypotheses: result.hypotheses || [],
    explication: result.explication || result.description_estimee || "",
  }
}


const PHYSICO_FIELDS = [
  "pci_mj_kg",
  "dbo_mg_l",
  "dco_mg_l",
  "taux_lignine_pct",
  "taux_contamination_pct",
  "type_plastique",
  "presence_chlore",
]

function isBlankValue(value) {
  return value === null || value === undefined || String(value).trim() === ""
}

function mergeScientificDefaults(formState, defaults) {
  const next = { ...formState }
  let appliedCount = 0

  Object.entries(defaults || {}).forEach(([key, value]) => {
    if (!(key in next)) return
    if (!isBlankValue(next[key])) return
    if (value === null || value === undefined || value === "") return
    next[key] = typeof value === "number" ? String(value) : value
    appliedCount += 1
  })

  return { mergedForm: next, appliedCount }
}

export default function App() {
  const [view, setView] = useState("presentation")
  const [theme, setTheme] = useState("light")
  const [apiOnline, setApiOnline] = useState(true)

  const [form, setForm] = useState(INITIAL_FORM)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState("")
  const [banner, setBanner] = useState("")

  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState("")
  const [identifyLoading, setIdentifyLoading] = useState(false)
  const [identifyError, setIdentifyError] = useState("")

  const [aiProposal, setAiProposal] = useState(null)
  const [analysisResult, setAnalysisResult] = useState(null)

  const [beninWasteDb, setBeninWasteDb] = useState([])
  const [showCorrectionPanel, setShowCorrectionPanel] = useState(false)
  const [correctionMode, setCorrectionMode] = useState("correct")
  const [correctionChoice, setCorrectionChoice] = useState("")
  const [correctionComment, setCorrectionComment] = useState("")
  const [correctionStatus, setCorrectionStatus] = useState("")

  const [toast, setToast] = useState("")

  const { analytics, dashboardLoading, refreshAnalytics } = useAnalytics()

  const formRef = useRef(null)
  const touchStartRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
  }, [theme])

  useEffect(() => {
    let cancelled = false
    getBeninWasteDatabase()
      .then((payload) => {
        if (cancelled) return
        const rows = Array.isArray(payload?.dechets) ? payload.dechets : Array.isArray(payload?.wastes) ? payload.wastes : []
        setBeninWasteDb(rows)
      })
      .catch(() => {
        if (!cancelled) setBeninWasteDb([])
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const ping = async () => {
      try {
        await getScientificPrefill({ nom: "test", type_dechet: "autre", categorie: "autre", description: "status" })
        setApiOnline(true)
      } catch {
        setApiOnline(false)
      }
    }
    ping()
    const id = setInterval(ping, 20000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(""), 2400)
    return () => clearTimeout(id)
  }, [toast])


  useEffect(() => {
    if (!imagePreview) return
    return () => {
      URL.revokeObjectURL(imagePreview)
    }
  }, [imagePreview])
  const resultCard = useMemo(() => normalizeResultToCard(aiProposal || analysisResult), [aiProposal, analysisResult])


  function handleTouchStart(event) {
    const touch = event.touches?.[0]
    if (!touch) return
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }

  function handleTouchEnd(event) {
    const touch = event.changedTouches?.[0]
    if (!touch) return
    const dx = touch.clientX - touchStartRef.current.x
    const dy = touch.clientY - touchStartRef.current.y
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy)) return

    const tabs = ["presentation", "analyse", "marketplace", "dashboard"]
    const idx = tabs.indexOf(view)
    if (idx === -1) return

    if (dx < 0 && idx < tabs.length - 1) setView(tabs[idx + 1])
    if (dx > 0 && idx > 0) setView(tabs[idx - 1])
  }
  const onAnalyzeNow = () => {
    setView("analyse")
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  function handleImageChange(event) {
    const file = event.target.files?.[0] || null
    setImageFile(file)
    setAiProposal(null)
    setIdentifyError("")
    if (!file) {
      setImagePreview("")
      return
    }
    setImagePreview(URL.createObjectURL(file))
  }

  async function handleIdentifyImage() {
    if (!imageFile) return
    setIdentifyLoading(true)
    setIdentifyError("")
    setCorrectionStatus("")
    setShowCorrectionPanel(false)
    setCorrectionChoice("")
    setCorrectionComment("")
    try {
      const imageBase64 = await fileToBase64(imageFile)
      const identified = await identifyWasteFromImage({
        imageBase64,
        mediaType: imageFile.type || "image/jpeg",
        filename: imageFile.name,
      })
      setAiProposal(identified)
      setToast("Photo analysee")
    } catch (err) {
      setAiProposal(null)
      setIdentifyError(err?.message || "Identification image indisponible")
      setToast("Erreur identification")
    } finally {
      setIdentifyLoading(false)
    }
  }

  function applyAiSuggestion() {
    if (!aiProposal) return
    setForm((prev) => ({
      ...prev,
      nom: aiProposal.nom_exact || aiProposal.nom || prev.nom,
      categorie: aiProposal.categorie || prev.categorie,
      type_dechet: aiProposal.type_dechet || prev.type_dechet,
      filiere: aiProposal.filiere || prev.filiere,
      description: aiProposal.explication || aiProposal.description_estimee || prev.description,
    }))
    setToast("Proposition appliquee")
  }

  async function handleAnalyze() {
    setLoading(true)
    setProgress(8)
    setError("")
    setBanner("")

    const timer = setInterval(() => {
      setProgress((v) => (v >= 92 ? v : v + 6))
    }, 180)

    try {
      let workingForm = { ...form }
      let scientificApplied = 0

      const missingPhysico = PHYSICO_FIELDS.filter((field) => isBlankValue(workingForm[field]))
      if (missingPhysico.length > 0) {
        const profile = await getScientificPrefill({
          nom: workingForm.nom,
          type_dechet: workingForm.type_dechet,
          categorie: workingForm.categorie,
          description: workingForm.description,
        })

        if (profile?.defaults) {
          const merged = mergeScientificDefaults(workingForm, profile.defaults)
          workingForm = merged.mergedForm
          scientificApplied = merged.appliedCount
          if (scientificApplied > 0) {
            setForm(workingForm)
          }
        }
      }

      const payload = buildAnalyzePayload(workingForm)
      const response = await analyzeWaste(payload)
      setAnalysisResult(response.data)

      const sourceMessage = response.source === "offline" ? "Analyse locale activee" : "Analyse API terminee"
      const userProvided = PHYSICO_FIELDS.some((field) => !isBlankValue(form[field]))

      let dataMessage = ""
      if (scientificApplied > 0 && userProvided) {
        dataMessage = "Donnees utilisateur prioritaires + base scientifique pour champs manquants."
      } else if (scientificApplied > 0) {
        dataMessage = "Caracteristiques completees automatiquement via la base scientifique."
      }

      setBanner(dataMessage ? `${sourceMessage}. ${dataMessage}` : sourceMessage)
      setToast("Analyse terminee")
    } catch {
      setAnalysisResult(null)
      setError("Analyse indisponible pour le moment")
      setToast("Erreur analyse")
    } finally {
      clearInterval(timer)
      setProgress(100)
      setLoading(false)
      setTimeout(() => setProgress(0), 500)
    }
  }

  function handleReset() {
    setForm(INITIAL_FORM)
    setAnalysisResult(null)
    setAiProposal(null)
    setError("")
    setBanner("")
    setImageFile(null)
    setImagePreview("")
    setIdentifyError("")
    setShowCorrectionPanel(false)
    setCorrectionMode("correct")
    setCorrectionChoice("")
    setCorrectionComment("")
    setCorrectionStatus("")
  }

  async function handlePrefill() {
    try {
      const profile = await getScientificPrefill({
        nom: form.nom,
        type_dechet: form.type_dechet,
        categorie: form.categorie,
        description: form.description,
      })

      if (!profile?.defaults) {
        setToast("Pas de profil scientifique")
        return
      }

      const merged = mergeScientificDefaults(form, profile.defaults)
      if (merged.appliedCount === 0) {
        setToast("Champs deja renseignes")
        return
      }

      setForm(merged.mergedForm)
      setToast(`Pre-remplissage applique (${merged.appliedCount} champ(s))`)
    } catch {
      setToast("Prefill indisponible")
    }
  }

  function openWhatsAppContact(buyerName) {
    const txt = encodeURIComponent(`Bonjour, je vous contacte via WasteAI pour: ${resultCard?.nom_exact || resultCard?.nom || "dechet"} (${buyerName}).`)
    window.open(`https://wa.me/?text=${txt}`, "_blank", "noopener,noreferrer")
  }

  async function submitCorrection(mode = correctionMode) {
    const correctedNom = mode === "incorrect" ? correctionChoice : (resultCard?.nom_exact || resultCard?.nom)
    const correctedFiliere = mode === "incorrect"
      ? (beninWasteDb.find((x) => x.nom_exact === correctionChoice)?.filiere || resultCard?.filiere || "autre")
      : (resultCard?.filiere || "autre")

    try {
      await submitIdentificationCorrection({
        image_filename: imageFile?.name || null,
        prediction: resultCard,
        is_correct: mode === "correct",
        corrected_nom_exact: correctedNom || null,
        corrected_filiere: correctedFiliere || null,
        corrected_comment: correctionComment || null,
        user_context: {
          pays_cedeao: form.pays_cedeao || "Benin",
          type_industrie: form.type_industrie || null,
        },
      })
      setCorrectionStatus("Correction enregistree")
      setShowCorrectionPanel(false)
      setToast("Merci pour votre retour")
    } catch {
      setCorrectionStatus("Echec enregistrement correction")
      setToast("Erreur correction")
    }
  }

  function handleExampleTextile() {
    setForm({ ...INITIAL_FORM, nom: "Chutes de tissu coton", categorie: "textile", type_dechet: "textile", filiere: "textile", quantite_kg: "420" })
  }

  function handleExamplePlastic() {
    setForm({ ...INITIAL_FORM, nom: "PET bouteilles", categorie: "plastique", type_dechet: "plastique", filiere: "plastique", quantite_kg: "500" })
  }

  function handleExamplePaper() {
    setForm({ ...INITIAL_FORM, nom: "Cartons ondules", categorie: "papier", type_dechet: "autre", filiere: "papier", quantite_kg: "380" })
  }

  function handleSaveResult() {
    if (!resultCard) return
    try {
      const key = "wasteai_saved_results"
      const existing = JSON.parse(localStorage.getItem(key) || "[]")
      existing.unshift({ ...resultCard, saved_at: new Date().toISOString() })
      localStorage.setItem(key, JSON.stringify(existing.slice(0, 30)))
      setToast("Resultat sauvegarde")
    } catch {
      setToast("Sauvegarde indisponible")
    }
  }

  return (
    <main className="app-shell" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <Header
        view={view}
        setView={setView}
        apiOnline={apiOnline}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      />

      <div className="container page-section">
        {view === "presentation" ? (
          <PresentationSection onGoAnalyze={() => setView("analyse")} />
        ) : null}

        {view === "analyse" ? (
          <>
            <HeroSection onAnalyzeNow={onAnalyzeNow} />

            <section ref={formRef} className="page-section">
              <AnalysisForm
                form={form}
                setForm={setForm}
                imagePreview={imagePreview}
                identifyLoading={identifyLoading}
                loading={loading}
                progress={progress}
                onImageChange={handleImageChange}
                onIdentify={handleIdentifyImage}
                onAnalyze={handleAnalyze}
                onReset={handleReset}
                onExampleTextile={handleExampleTextile}
                onExamplePlastic={handleExamplePlastic}
                onExamplePaper={handleExamplePaper}
                onPrefill={handlePrefill}
              />
            </section>

            {identifyError ? <p className="warn">{identifyError}</p> : null}
            {error ? <p className="warn">{error}</p> : null}
            {banner ? <p>{banner}</p> : null}

            <ResultCard
              result={resultCard}
              onWhatsApp={openWhatsAppContact}
              onCorrect={() => submitCorrection("correct")}
              onIncorrect={() => setShowCorrectionPanel((v) => !v)}
              showCorrection={showCorrectionPanel}
              correctionMode={correctionMode}
              setCorrectionMode={setCorrectionMode}
              correctionChoice={correctionChoice}
              setCorrectionChoice={setCorrectionChoice}
              correctionComment={correctionComment}
              setCorrectionComment={setCorrectionComment}
              correctionOptions={beninWasteDb}
              onSubmitCorrection={submitCorrection}
              correctionStatus={correctionStatus}
              onOpenMarketplace={() => setView("marketplace")}
              onSave={handleSaveResult}
            />

            <div className="actions-row" style={{ marginTop: 10 }}>
              <button className="btn" type="button" onClick={applyAiSuggestion} disabled={!aiProposal}>Appliquer identification IA</button>
              <button className="btn" type="button" onClick={handlePrefill}>Pre-remplir scientifique</button>
            </div>
          </>
        ) : null}

        {view === "marketplace" ? (
          <MarketplaceSection>
            <Suspense fallback={<div className="card" style={{ padding: 12 }}><div className="skeleton" style={{ height: 160, borderRadius: 12 }} /></div>}>
              <LazyMarketplacePanel />
            </Suspense>
          </MarketplaceSection>
        ) : null}

        {view === "dashboard" ? (
          <DashboardSection analytics={analytics} loading={dashboardLoading} onRefresh={refreshAnalytics} />
        ) : null}

        <Footer apiOnline={apiOnline} />
      </div>

      <nav className="mobile-nav" aria-label="Navigation mobile">
        <button className={view === "presentation" ? "active" : ""} onClick={() => setView("presentation")}>Presentation</button>
        <button className={view === "analyse" ? "active" : ""} onClick={() => setView("analyse")}>Analyser</button>
        <button className={view === "marketplace" ? "active" : ""} onClick={() => setView("marketplace")}>Marche</button>
        <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>Stats</button>
      </nav>

      <button className="fab" type="button" onClick={onAnalyzeNow} aria-label="Analyser maintenant">+</button>

      {toast ? <div className="toast" role="status" aria-live="polite">{toast}</div> : null}
    </main>
  )
}














