import axios from "axios"

const REMOTE_API_BASE = (import.meta.env.VITE_API_BASE || "https://wasteai-api.wasteai-gildas.workers.dev/api").replace(/\/$/, "")

const http = axios.create({
  baseURL: REMOTE_API_BASE,
  timeout: 20000,
  headers: {
    "Content-Type": "application/json",
  },
})

function computeOfflineAnalysis(payload) {
  const quantity = Number(payload.quantite_kg || 0)
  const danger = String(payload.niveau_danger || "faible")
  const type = String(payload.type_dechet || "autre")
  const category = String(payload.categorie || "autre")

  let score = 60
  let decision = "recycling"
  const factors = []

  if (type === "plastique" || category === "plastique") {
    score += 12
    factors.push("Flux plastique compatible avec une filiere de recyclage.")
  }

  if (danger === "eleve" || danger === "critique") {
    score -= 18
    decision = "traitement_specialise"
    factors.push("Niveau de danger eleve: traitement specialise recommande.")
  }

  if (quantity > 5000) {
    score += 8
    factors.push("Volume important: economie d'echelle favorable a la valorisation.")
  } else if (quantity > 0 && quantity < 200) {
    score -= 6
    factors.push("Petit volume: cout logistique proportionnellement plus eleve.")
  }

  score = Math.max(5, Math.min(95, score))

  const confidence = score >= 80 ? "elevee" : score >= 60 ? "moyenne" : "faible"

  return {
    decision,
    score,
    confiance: confidence,
    explication: "Resultat estime localement (mode hors-ligne).",
    resume_choix: factors.join(" ") || "Evaluation locale par regles heuristiques.",
    facteurs_cles: factors,
    options_bloquees: [],
    conformite_reglementaire: {
      status: "a_verifier",
      max_severity: danger === "critique" ? "high" : "medium",
      risk_score: danger === "critique" ? 85 : danger === "eleve" ? 65 : 35,
      scope: "CEDEAO",
    },
    impact_environnemental: {
      bilan_net_recommande_kgco2e: Number((quantity * 0.18).toFixed(2)),
    },
  }
}

export function buildAnalyzePayload(input) {
  return {
    nom: String(input.nom || "dechet industriel"),
    categorie: String(input.categorie || "autre"),
    type_dechet: String(input.type_dechet || "autre"),
    type_industrie: String(input.type_industrie || "autre"),
    quantite_kg: Number(input.quantite_kg || 0),
    niveau_danger: String(input.niveau_danger || "faible"),
    description: String(input.description || ""),
    contient_metaux: Boolean(input.contient_metaux),
    pays_cedeao: input.pays_cedeao ? String(input.pays_cedeao) : null,
  }
}

export async function analyzeWaste(payload) {
  try {
    const response = await http.post("/waste/analyze", payload)
    return {
      source: "api",
      data: response.data,
      apiBase: REMOTE_API_BASE,
      warning: "",
    }
  } catch (error) {
    const offline = computeOfflineAnalysis(payload)
    return {
      source: "offline",
      data: offline,
      apiBase: REMOTE_API_BASE,
      warning: "API indisponible ou bloquee (CORS/reseau). Analyse locale activee.",
      error,
    }
  }
}

export { REMOTE_API_BASE }
