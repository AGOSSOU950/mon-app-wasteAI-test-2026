import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react"
import "./App.css"
import {
  analyzeWaste,
  analyzeLocally,
  buildAnalyzePayload,
  identifyWasteFromImage,
  getScientificPrefill,
  pingApi,
} from "./services/api"
import useAnalytics from "./hooks/useAnalytics"
import Header from "./components/Header"
import HeroSection from "./components/HeroSection"
import PresentationSection from "./components/PresentationSection"
import AnalysisForm from "./components/AnalysisForm"
import ResultCard from "./components/ResultCard"
import LocalChannelsSection from "./components/MarketplaceSection"

import Footer from "./components/Footer"
import { FEATURES } from "./config/features"

const PHOTO_AI_ENABLED = FEATURES.photoIdentification
const MARKETPLACE_ENABLED = FEATURES.marketplace
const LazyMarketplacePanel = MARKETPLACE_ENABLED ? lazy(() => import("./MarketplacePanel")) : null
const LazyDashboardSection = lazy(() => import("./components/DashboardSection"))
const LazyAdminRegistryPanel = lazy(() => import("./components/AdminRegistryPanel"))
const LazyRecommendedChannelsSection = lazy(() => import("./components/RecommendedChannelsSection"))
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
  taux_humidite_pct: "",
  taux_contamination_pct: "",
  type_plastique: "",
  presence_chlore: "",
  presence_metaux_lourds: "",
  sous_region_cedeao: "",
}

const PHYSICO_FIELDS = [
  "pci_mj_kg",
  "dbo_mg_l",
  "dco_mg_l",
  "taux_lignine_pct",
  "taux_humidite_pct",
  "taux_contamination_pct",
  "type_plastique",
  "presence_chlore",
]

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(new Error("Lecture image impossible"))
    reader.readAsDataURL(file)
  })
}

function buildLocalIdentificationFallback(form, file) {
  const nom = String(form?.nom || file?.name || "dechet industriel")
  const filiere = String(form?.filiere || form?.categorie || "autre")
  return {
    nom_exact: nom,
    filiere,
    sous_type: String(form?.type_dechet || "autre"),
    origine_probable: String(form?.type_industrie || "industrie"),
    confiance_identification: 62,
    confiance: "moyenne",
    valorisation_1: {
      methode: "Tri et valorisation adaptee",
      description: "Resultat local provisoire car l'identification IA distante n'a pas repondu a temps.",
      valeur_fcfa_tonne: 0,
    },
    explication:
      "Mode resilient active: l'application fournit une proposition exploitable meme en cas d'indisponibilite temporaire de l'API image.",
  }
}

function hasUsableIdentification(result) {
  const name = String(result?.nom_exact || result?.nom || "").trim()
  return name.length > 1
}

async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas")
        const ctx = canvas.getContext("2d")
        if (!ctx) {
          URL.revokeObjectURL(objectUrl)
          resolve(file)
          return
        }

        let width = img.width
        let height = img.height

        if (width > 800 || height > 800) {
          if (width > height) {
            height = (height * 800) / width
            width = 800
          } else {
            width = (width * 800) / height
            height = 800
          }
        }

        canvas.width = Math.max(1, Math.round(width))
        canvas.height = Math.max(1, Math.round(height))
        ctx.filter = "contrast(1.12) brightness(1.05)"
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        ctx.filter = "none"

        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl)
          resolve(blob || file)
        }, "image/jpeg", 0.7)
      } catch (err) {
        URL.revokeObjectURL(objectUrl)
        reject(err)
      }
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(file)
    }

    img.src = objectUrl
  })
}

function firstNonEmptyText(...values) {
  for (const value of values) {
    const v = String(value ?? "").trim()
    if (v) return v
  }
  return ""
}

function normalizeResultToCard(result) {
  if (!result) return null
  return {
    nom_exact: firstNonEmptyText(result.nom_exact, result.nom, result.mode_valorisation_propose, "Resultat analyse"),
    filiere: firstNonEmptyText(result.filiere, result.categorie, "autre"),
    score_valorisation: result.score_valorisation ?? result.score ?? 0,
    confiance_identification:
      result.confiance_identification ?? (result.confiance === "elevee" ? 90 : result.confiance === "moyenne" ? 70 : 45),
    valorisation_1: result.valorisation_1 || {
      methode: result.decision_principale || result.mode_valorisation_propose || result.decision || "Valorisation recommandee",
      description: result.resume_choix || result.explication || "Recommendation basee sur analyse multicritere.",
      valeur_fcfa_tonne: 0,
    },
    valorisation_2: result.valorisation_2 || {
      methode: "Option alternative",
      description: "A valider selon qualite du lot et cout logistique.",
      valeur_fcfa_tonne: 0,
    },
    acheteurs_benin: result.acheteurs_benin || [],
    impact_co2_kg: result.impact_co2_kg ?? result?.impact_environnemental?.bilan_net_recommande_kgco2e ?? 0,
    co2_evite_estime_kg: result.co2_evite_estime_kg ?? result?.impact_co2_kg ?? result?.impact_environnemental?.bilan_net_recommande_kgco2e ?? 0,
    cout_estime_fcfa_tonne:
      result.cout_estime_fcfa_tonne ??
      result?.details_scores_bruts?.treatment_cost_fcfa_tonne ??
      result?.details_scores_bruts?.treatment_cost_fcfa ??
      Math.max(0, Number(result?.valeur_estimee_fcfa_tonne ?? result?.valeur_fcfa ?? result?.valorisation_1?.valeur_fcfa_tonne ?? 0) * 0.65),
    valeur_estimee_fcfa_tonne:
      result.valeur_estimee_fcfa_tonne ??
      result?.details_scores_bruts?.market_value_fcfa_tonne ??
      result?.details_scores_bruts?.market_value_fcfa ??
      result?.valorisation_1?.valeur_fcfa_tonne ??
      result?.valeur_fcfa ??
      0,
    gain_industriel_fcfa:
      result.gain_industriel_fcfa ??
      result?.details_scores_bruts?.gain_industriel_fcfa ??
      Math.max(0, Number(result?.valeur_estimee_fcfa_tonne ?? result?.valeur_fcfa ?? 0) - Number(result?.cout_estime_fcfa_tonne ?? 0)),
    gain_industriel_fcfa_tonne:
      result.gain_industriel_fcfa_tonne ??
      result?.details_scores_bruts?.gain_industriel_fcfa_tonne ??
      Math.max(0, Number(result?.valeur_estimee_fcfa_tonne ?? result?.valeur_fcfa ?? 0) - Number(result?.cout_estime_fcfa_tonne ?? 0)),
    impact_environnemental: result.impact_environnemental || null,
    conseil_stockage: result.conseil_stockage || "Stocker en zone seche, ventilee et tracee.",
    niveau_danger: result.niveau_danger || "faible",
    hypotheses: result.hypotheses || [],
    explication: result.explication || result.description_estimee || "",
    explication_detaillee: result.explication_detaillee || result.explication || result.justification_technique || "",
    description_estimee: result.description_estimee || "",
    decision: result.decision || "",
    decision_principale: result.decision_principale || result.mode_valorisation_propose || result.decision || "",
    resume_choix: result.resume_choix || "",
    alternatives: Array.isArray(result.alternatives) ? result.alternatives : [],
    classement_filieres: Array.isArray(result.classement_filieres) ? result.classement_filieres : [],
    scores_par_voie: Array.isArray(result.scores_par_voie) ? result.scores_par_voie : [],
    details_scores: result.details_scores || {},
    details_scores_bruts: result.details_scores_bruts || {},
    justification_technique: result.justification_technique || "",
    raw_api: result.raw_api || result,
  }
}

function isBlankValue(value) {
  return value === null || value === undefined || String(value).trim() === ""
}

function ensureImpactData(result, payload) {
  const existing = result?.impact_environnemental?.bilan_net_recommande_kgco2e
  if (typeof existing === "number" && Number.isFinite(existing)) {
    return {
      ...result,
      impact_co2_kg: result.impact_co2_kg ?? existing,
    }
  }

  const decisionRaw = String(result?.decision_principale || result?.decision || "").toLowerCase()
  const quantityKg = Number(payload?.quantite_kg || 0)
  const tonnes = Math.max(0, quantityKg / 1000)
  let factor = 520
  if (decisionRaw.includes("ener")) factor = 320
  if (decisionRaw.includes("elim") || decisionRaw.includes("special")) factor = 40
  if (decisionRaw.includes("reemploi") || decisionRaw.includes("reuse")) factor = 560

  const avoided = Number((tonnes * factor).toFixed(2))
  return {
    ...result,
    impact_co2_kg: avoided,
    impact_environnemental: {
      bilan_net_recommande_kgco2e: avoided,
      par_voie: {
        voie_principale: {
          voie: result?.decision_principale || result?.decision || "voie estimee",
          emissions_generees_kgco2e: 0,
          emissions_evitees_kgco2e: avoided,
          bilan_net_kgco2e: avoided,
        },
      },
      hypotheses: ["Impact estime localement (details API incomplets)."],
    },
  }
}

function persistAnalyticsSnapshot(result, payload) {
  try {
    const key = "wasteai_analytics_rows"
    const existing = JSON.parse(localStorage.getItem(key) || "[]")
    const row = {
      created_at: new Date().toISOString(),
      nom: result?.nom_exact || payload?.nom || "dechet",
      categorie: payload?.categorie || "autre",
      type_dechet: payload?.type_dechet || "autre",
      decision: result?.decision_principale || result?.decision || result?.mode_valorisation_propose || "",
      quantite_kg: Number(payload?.quantite_kg || 0),
      impact_co2_kg: Number(result?.impact_co2_kg || result?.impact_environnemental?.bilan_net_recommande_kgco2e || 0),
      valeur_estimee: Number(result?.valeur_fcfa || result?.valorisation_1?.valeur_fcfa_tonne || 0),
    }
    existing.unshift(row)
    localStorage.setItem(key, JSON.stringify(existing.slice(0, 250)))
  } catch (error) {
    void error
  }
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

function analysisContextFromResult(resultCard, form) {
  return {
    name: resultCard?.nom_exact || resultCard?.nom || form.nom,
    quantity: Number(form.quantite_kg || 0),
    recommendation: resultCard?.decision_principale || resultCard?.decision || resultCard?.valorisation_1?.methode || "",
    wasteType: resultCard?.filiere || form.filiere || form.categorie,
  }
}

export default function App() {
  const [view, setView] = useState("presentation")
  const [theme, setTheme] = useState("dark")
  const [apiOnline, setApiOnline] = useState(true)

  const [form, setForm] = useState(INITIAL_FORM)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState("")
  const [banner, setBanner] = useState("")

  const [imageFile, setImageFile] = useState(null)
  const [identifyLoading, setIdentifyLoading] = useState(false)
  const [identifyError, setIdentifyError] = useState("")
  const [identifyLoadingMessage, setIdentifyLoadingMessage] = useState("")

  const [aiProposal, setAiProposal] = useState(null)
  const [analysisResult, setAnalysisResult] = useState(null)


  const [toast, setToast] = useState("")

  const { analytics, dashboardLoading, refreshAnalytics } = useAnalytics()

  const formRef = useRef(null)
  const touchStartRef = useRef({ x: 0, y: 0 })
  const apiPingFailuresRef = useRef(0)

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
  }, [theme])

  useEffect(() => {
    const ping = async () => {
      const ok = await pingApi()
      if (ok) {
        apiPingFailuresRef.current = 0
        setApiOnline(true)
        return
      }

      apiPingFailuresRef.current += 1
      if (apiPingFailuresRef.current >= 2) {
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

  const resultCard = useMemo(() => normalizeResultToCard(analysisResult || aiProposal), [analysisResult, aiProposal])
  const analysisContext = useMemo(() => analysisContextFromResult(resultCard, form), [resultCard, form])

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

    const tabs = MARKETPLACE_ENABLED
      ? ["presentation", "analyse", "marketplace", "pilotage", "admin"]
      : ["presentation", "analyse", "pilotage", "admin"]
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
    setAnalysisResult(null)
    setIdentifyError("")
    setIdentifyLoadingMessage("")
    if (!file) return
    void handleIdentifyImage(file)
  }

  async function handleIdentifyImage(fileOverride = imageFile) {
    if (!PHOTO_AI_ENABLED) {
      setIdentifyError("Identification photo desactivee temporairement.")
      setBanner("Identification photo temporairement indisponible.")
      setToast("Photo AI desactivee")
      return
    }
    if (!fileOverride) return

    setIdentifyLoading(true)
    setIdentifyError("")
    setIdentifyLoadingMessage("Identification automatique en cours...")

    try {
      const compressed = await compressImage(fileOverride)
      const uploadFile = compressed instanceof File
        ? compressed
        : new File([compressed], fileOverride.name || "waste.jpg", { type: compressed.type || "image/jpeg" })
      const imageBase64 = await fileToBase64(uploadFile)

      let identified = null
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          if (attempt > 1) setIdentifyLoadingMessage(`Nouvelle tentative (${attempt}/2)...`)
          identified = await identifyWasteFromImage({
            file: uploadFile,
            imageBase64,
            mediaType: uploadFile.type || "image/jpeg",
            filename: fileOverride.name,
          })
          break
        } catch (err) {
          void err
        }
      }

      if (!identified || !hasUsableIdentification(identified)) {
        setAiProposal(buildLocalIdentificationFallback(form, fileOverride))
        setIdentifyError("Identification IA incomplete. Proposition locale affichee.")
      } else {
        setAiProposal(identified)
      }
      setApiOnline(true)
      setIdentifyLoadingMessage("Nom du dechet propose. Merci de valider ou corriger.")
      setToast("Identification photo terminee")
    } catch (error) {
      void error
      setAiProposal(null)
      setIdentifyError("Identification IA indisponible. Veuillez renseigner le formulaire manuellement puis lancer l analyse.")
      setBanner("Identification photo indisponible: completez le formulaire pour continuer.")
      setToast("Veuillez completer le formulaire")
    } finally {
      setIdentifyLoading(false)
      setIdentifyLoadingMessage("")
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

    let workingForm = { ...form }
    let scientificApplied = 0

    try {
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
          if (scientificApplied > 0) setForm(workingForm)
        }
      }

      const payload = buildAnalyzePayload(workingForm)
      const response = await analyzeWaste(payload)
      const safeResult = ensureImpactData(response.data || {}, payload)
      setAnalysisResult(safeResult)
      persistAnalyticsSnapshot(safeResult, payload)
      void refreshAnalytics()
      setApiOnline(true)

      const userProvided = PHYSICO_FIELDS.some((field) => !isBlankValue(form[field]))
      let dataMessage = ""
      if (scientificApplied > 0 && userProvided) {
        dataMessage = "Donnees utilisateur prioritaires + base scientifique pour champs manquants."
      } else if (scientificApplied > 0) {
        dataMessage = "Caracteristiques completees automatiquement via la base scientifique."
      }

      const sourceMessage = "Analyse API terminée"
      setBanner(dataMessage ? `${sourceMessage}. ${dataMessage}` : sourceMessage)
      setToast("Analyse terminée")
    } catch (error) {
      const localResult = analyzeLocally(workingForm)
      const localPayload = buildAnalyzePayload(workingForm)
      const safeLocalResult = ensureImpactData(localResult, localPayload)
      setAnalysisResult(safeLocalResult)
      persistAnalyticsSnapshot(safeLocalResult, localPayload)
      void refreshAnalytics()
      setBanner("Analyse locale estimée (IA temporairement indisponible).")
      setApiOnline(false)

      if (error?.code === "ECONNABORTED") {
        setError("Delai depasse. Reessayez.")
      } else if (error?.response?.status === 401) {
        setError("Cle API invalide.")
      } else if (error?.response?.status === 429) {
        setError("Trop de requetes. Attendez 1 minute.")
      } else if (error?.response?.status >= 500) {
        setError("Erreur serveur. Contactez le support.")
      } else {
        setError(`Erreur: ${error?.message || "inconnue"}`)
      }

      setToast("Analyse locale de secours activée")
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
    setIdentifyError("")
    setIdentifyLoadingMessage("")
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
    } catch (error) {
      void error
      setToast("Préremplissage indisponible")
    }
  }

  function openWhatsAppContact(buyerName) {
    const txt = encodeURIComponent(
      `Bonjour, je vous contacte via WasteAI pour: ${resultCard?.nom_exact || resultCard?.nom || "dechet"} (${buyerName}).`,
    )
    window.open(`https://wa.me/?text=${txt}`, "_blank", "noopener,noreferrer")
  }

  function handleSaveResult() {
    if (!resultCard) return
    try {
      const key = "wasteai_saved_results"
      const existing = JSON.parse(localStorage.getItem(key) || "[]")
      existing.unshift({ ...resultCard, saved_at: new Date().toISOString() })
      localStorage.setItem(key, JSON.stringify(existing.slice(0, 30)))
      setToast("Resultat sauvegarde")
    } catch (error) {
      void error
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
        {view === "presentation" ? <PresentationSection onGoAnalyze={() => setView("analyse")} /> : null}

        {view === "analyse" ? (
          <>
            <HeroSection onAnalyzeNow={onAnalyzeNow} />

            <section ref={formRef} className="page-section">
              <AnalysisForm
                form={form}
                setForm={setForm}
                identifyLoading={identifyLoading}
                identifyLoadingMessage={identifyLoadingMessage}
                loading={loading}
                progress={progress}
                onImageChange={handleImageChange}
                onIdentify={handleIdentifyImage}
                onAnalyze={handleAnalyze}
                onReset={handleReset}
                onPrefill={handlePrefill}
                photoAiEnabled={PHOTO_AI_ENABLED}
              />
            </section>

            {identifyError ? <p className="warn">{identifyError}</p> : null}
            {error ? <p className="warn">{error}</p> : null}
            {banner ? <p>{banner}</p> : null}

            <ResultCard
              result={resultCard}
              form={form}
              onWhatsApp={openWhatsAppContact}
              onOpenOperators={() => setView(MARKETPLACE_ENABLED ? "marketplace" : "pilotage")}
              onSave={handleSaveResult}
              compactMode={Boolean(aiProposal && !analysisResult)}
            />

            <Suspense fallback={<div className="card" style={{ padding: 12 }}><div className="skeleton" style={{ height: 160, borderRadius: 12 }} /></div>}><LazyRecommendedChannelsSection result={resultCard} form={form} /></Suspense>

            <div className="actions-row" style={{ marginTop: 10 }}>
              <button className="btn" type="button" onClick={applyAiSuggestion} disabled={!aiProposal}>
                Appliquer identification IA
              </button>
            </div>
          </>
        ) : null}
        {view === "marketplace" && MARKETPLACE_ENABLED ? (
          <LocalChannelsSection>
            <Suspense fallback={<div className="card" style={{ padding: 12 }}><div className="skeleton" style={{ height: 160, borderRadius: 12 }} /></div>}>
              <LazyMarketplacePanel />
            </Suspense>
          </LocalChannelsSection>
        ) : null}

        {view === "pilotage" ? (
          <Suspense fallback={<div className="card" style={{ padding: 12 }}><div className="skeleton" style={{ height: 220, borderRadius: 12 }} /></div>}>
            <LazyDashboardSection analytics={analytics} loading={dashboardLoading} onRefresh={refreshAnalytics} />
          </Suspense>
        ) : null}

        {view === "admin" ? (
          <Suspense fallback={<div className="card" style={{ padding: 12 }}><div className="skeleton" style={{ height: 220, borderRadius: 12 }} /></div>}>
            <LazyAdminRegistryPanel />
          </Suspense>
        ) : null}

        <Footer apiOnline={apiOnline} />
      </div>

      <nav className="mobile-nav" aria-label="Navigation mobile">
        <button className={view === "presentation" ? "active" : ""} onClick={() => setView("presentation")}>Accueil</button>
        {FEATURES.marketplace ? (
          <button className={view === "marketplace" ? "active" : ""} onClick={() => setView("marketplace")}>Réseau local</button>
        ) : null}

        <button className={view === "pilotage" ? "active" : ""} onClick={() => setView("pilotage")}>Pilotage</button>
        <button className={view === "admin" ? "active" : ""} onClick={() => setView("admin")}>Admin</button>
      </nav>
      <button className="fab" type="button" onClick={onAnalyzeNow} aria-label="Analyser maintenant">+</button>

      {toast ? <div className="toast" role="status" aria-live="polite">{toast}</div> : null}
    </main>
  )
}
