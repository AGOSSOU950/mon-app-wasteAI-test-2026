import axios from "axios"

const API_URL = "https://wasteai-api.wasteai-gildas.workers.dev"
const API_BASE = (import.meta.env.VITE_API_BASE || API_URL).replace(/\/$/, "")
const REMOTE_API_BASE = API_URL

const http = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
  headers: {
    "Content-Type": "application/json",
  },
})

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function normalizeDecisionLabel(rawDecision) {
  const raw = String(rawDecision || "").trim()
  if (!raw) return "Valorisation matiere (charbon actif, refonte...)"

  const key = raw.toLowerCase()
  if (key.includes("ener")) return "Valorisation energetique (biogaz, combustible, electricite...)"
  if (key.includes("market") || key.includes("vente")) return "Vente directe sur marketplace"
  if (key.includes("special") || key.includes("dang")) return "Traitement specialise"
  if (key.includes("mati") || key.includes("recycl")) return "Valorisation matiere (charbon actif, refonte...)"
  return raw
}

function buildRegulatoryContext(payload, decision) {
  const danger = String(payload?.niveau_danger || "faible").toLowerCase()
  const country = String(payload?.pays_cedeao || "").toLowerCase()

  let status = "preliminaire_conforme"
  let severity = "medium"
  let risk = 35

  if (danger === "eleve") {
    status = "vigilance_renforcee"
    severity = "high"
    risk = 65
  }

  if (danger === "critique") {
    status = "controle_renforce"
    severity = "high"
    risk = 85
  }

  const references = [
    "Cadre CEDEAO: harmonisation de la gestion des dechets et controle des flux transfrontaliers.",
    "Convention de Bamako: interdiction d'importation de dechets dangereux en Afrique.",
  ]

  if (country.includes("benin")) {
    references.push("Benin: verification des autorisations ANGED/structures habilitees pour collecte, transport et traitement.")
  }

  if (decision.includes("energetique")) {
    references.push("Valorisation energetique: verifier emissions, filtres et tracabilite des residus ultimes.")
  }

  if (decision.includes("matiere")) {
    references.push("Valorisation matiere: prioriser tri, qualite de flux et conformite des filieres de recyclage.")
  }

  if (decision.includes("specialise")) {
    references.push("Traitement specialise: requis pour flux a danger eleve/critique ou contamination significative.")
  }

  return {
    conformite_reglementaire: {
      status,
      max_severity: severity,
      risk_score: risk,
      scope: country.includes("benin") ? "CEDEAO + Benin" : "CEDEAO",
      warnings: status === "preliminaire_conforme" ? [] : ["Controle documentaire et operateur agree recommandes avant execution."],
    },
    references_reglementaires: references,
  }
}

function computeOfflineAnalysis(payload) {
  const quantity = Number(payload.quantite_kg || 0)
  const danger = String(payload.niveau_danger || "faible")
  const type = String(payload.type_dechet || "autre")
  const category = String(payload.categorie || "autre")

  let score = 60
  let decision = "Valorisation matiere (charbon actif, refonte...)"
  const factors = []

  if (type === "plastique" || category === "plastique") {
    score += 12
    factors.push("Flux plastique compatible avec une filiere de recyclage.")
  }

  if (danger === "eleve" || danger === "critique") {
    score -= 18
    decision = "Traitement specialise"
    factors.push("Niveau de danger eleve: traitement specialise recommande.")
  }

  if (quantity > 5000) {
    score += 8
    factors.push("Volume important: economie d'echelle favorable a la valorisation.")
  } else if (quantity > 0 && quantity < 200) {
    score -= 6
    factors.push("Petit volume: cout logistique proportionnellement plus eleve.")
  }

  score = clamp(score, 5, 95)

  const confidence = score >= 80 ? "elevee" : score >= 60 ? "moyenne" : "faible"
  const regs = buildRegulatoryContext(payload, decision)

  return {
    decision,
    mode_valorisation_propose: decision,
    score,
    confiance: confidence,
    explication: "Resultat estime localement (mode hors-ligne) avec verification reglementaire preliminaire.",
    resume_choix: factors.join(" ") || "Evaluation locale par regles heuristiques.",
    facteurs_cles: factors,
    options_bloquees: [],
    ...regs,
    impact_environnemental: {
      bilan_net_recommande_kgco2e: Number((quantity * 0.18).toFixed(2)),
    },
  }
}

function normalizeApiResult(payload, apiData) {
  const base = computeOfflineAnalysis(payload)
  const compactDecision = normalizeDecisionLabel(apiData?.recommandation || apiData?.decision || apiData?.mode_valorisation)
  const regs = buildRegulatoryContext(payload, compactDecision)

  const mergedScore = typeof apiData?.score === "number"
    ? clamp(apiData.score, 0, 100)
    : clamp(base.score + 5, 0, 100)

  return {
    ...base,
    ...apiData,
    decision: compactDecision,
    mode_valorisation_propose: compactDecision,
    score: mergedScore,
    confiance: apiData?.confiance || base.confiance,
    explication: apiData?.explication || `Recommendation API: ${compactDecision}. ${base.resume_choix}`,
    resume_choix: apiData?.resume_choix || base.resume_choix,
    facteurs_cles: Array.from(new Set([...(base.facteurs_cles || []), "Priorisation basee sur contraintes techniques, risque et filiere locale."])),
    conformite_reglementaire: apiData?.conformite_reglementaire || regs.conformite_reglementaire,
    references_reglementaires: apiData?.references_reglementaires || regs.references_reglementaires,
    raw_api: apiData,
  }
}

function buildAnalyzeWarning(error) {
  if (!axios.isAxiosError(error)) {
    return "API indisponible. Analyse locale activee."
  }

  if (error.code === "ECONNABORTED") {
    return "Timeout API: delai depasse. Analyse locale activee."
  }

  if (!error.response) {
    return "Backend non joignable (verifie que l'API est demarree). Analyse locale activee."
  }

  const status = error.response.status
  if (status === 401 || status === 403) {
    return "Acces API refuse (401/403). Analyse locale activee."
  }

  if (status >= 500) {
    return `Erreur serveur API (${status}). Analyse locale activee.`
  }

  return `Erreur API (${status}). Analyse locale activee.`
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
    const response = await http.request({
      method: "post",
      url: "/api/waste/analyze",
      data: payload,
    })

    return {
      source: "api",
      data: normalizeApiResult(payload, response.data || {}),
      apiBase: API_BASE,
      warning: "Format API compact detecte: enrichissement local applique pour detail operationnel.",
    }
  } catch (error) {
    const offline = computeOfflineAnalysis(payload)
    return {
      source: "offline",
      data: offline,
      apiBase: API_BASE,
      warning: buildAnalyzeWarning(error),
      error,
    }
  }
}

export { API_BASE, API_URL, REMOTE_API_BASE }
