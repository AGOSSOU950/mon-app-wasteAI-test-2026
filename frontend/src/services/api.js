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

const DECISION_LABELS = {
  material: "Valorisation matiere",
  energetic: "Valorisation energetique",
  reuse_sale: "Reemploi / vente encadree",
  specialized: "Traitement specialise",
}

const SPECIFIC_ROUTE_LABELS = {
  recyclage_mecanique_plastique: "Recyclage mecanique du plastique (tri-lavage-extrusion)",
  pyrolyse_plastique: "Pyrolyse des plastiques melanges",
  co_incineration_cimenterie: "Co-incineration en cimenterie autorisee",
  charbon_actif: "Valorisation matiere en charbon actif",
  refonte_metaux: "Refonte metallurgique (fonderie/acierie)",
  reemploi_pieces_metalliques: "Reemploi de pieces metalliques",
  methanisation_biogaz: "Methanisation avec production de biogaz",
  regeneration_huiles: "Regeneration des huiles usagees",
  effilochage_textile: "Effilochage textile en fibres techniques",
  reemploi_textile: "Reemploi textile avec tri qualite",
  recyclage_papetier: "Recyclage papetier",
  compostage: "Compostage",
  epandage_agricole: "Epandage agricole conforme",
  elimination_securisee: "Elimination securisee",
}

const CEDEAO_REFERENCES = [
  "Convention de Bamako: interdiction d'importation de dechets dangereux et gestion ecologiquement rationnelle.",
  "Cadre CEDEAO: controle des flux transfrontaliers, tracabilite et autorisation des operateurs.",
]

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function inferDecisionKey(rawDecision) {
  const key = normalizeText(rawDecision)
  if (!key) return "material"
  if (key.includes("ener")) return "energetic"
  if (key.includes("reemploi") || key.includes("reuse") || key.includes("market") || key.includes("vente")) return "reuse_sale"
  if (key.includes("special") || key.includes("dang") || key.includes("inciner")) return "specialized"
  if (key.includes("mati") || key.includes("recycl") || key.includes("refonte") || key.includes("charbon_actif")) return "material"
  return "material"
}

function normalizeDecisionLabel(rawDecision) {
  return DECISION_LABELS[inferDecisionKey(rawDecision)] || DECISION_LABELS.material
}

function toDecisionDisplayLabel(rawDecision) {
  const raw = String(rawDecision || "").trim()
  if (!raw) return normalizeDecisionLabel(rawDecision)
  const normalized = normalizeText(raw)
  if (SPECIFIC_ROUTE_LABELS[normalized]) return SPECIFIC_ROUTE_LABELS[normalized]
  if (raw.includes("_")) {
    const pretty = raw.replaceAll("_", " ")
    return pretty.charAt(0).toUpperCase() + pretty.slice(1)
  }
  return raw
}

function computeRegulatoryGate(payload, decisionKey) {
  const danger = normalizeText(payload?.niveau_danger || "faible")
  const category = normalizeText(payload?.categorie)
  const type = normalizeText(payload?.type_dechet)
  const chlorine = payload?.presence_chlore === true
  const contamination = Number(payload?.taux_contamination_pct || 0)

  let blocked = false
  let riskDelta = 0
  const warnings = []

  if (danger === "critique" && decisionKey !== "specialized") {
    blocked = true
    warnings.push("Flux critique: traitement specialise requis.")
    riskDelta += 35
  } else if (danger === "eleve" && (decisionKey === "reuse_sale" || decisionKey === "material")) {
    blocked = true
    warnings.push("Flux a risque eleve: voie directe non conforme sans pretraitement.")
    riskDelta += 22
  }

  if ((type.includes("boue") || category.includes("chimique")) && decisionKey === "reuse_sale") {
    blocked = true
    warnings.push("Flux liquide/chimique: vente directe non conforme.")
    riskDelta += 20
  }

  const chlorineSensitive = chlorine && (
    type.includes("plastique") ||
    category.includes("plastique") ||
    category.includes("chimique") ||
    normalizeText(payload?.type_plastique).includes("pvc")
  )

  if (chlorineSensitive && decisionKey === "energetic") {
    blocked = true
    warnings.push("Flux chloré sensible (PVC/chimique): voie energetique bloquee sans depollution adaptee.")
    riskDelta += 20
  }


  if (chlorine && !chlorineSensitive && decisionKey === "energetic") {
    warnings.push("Presence de chlore signalee mais flux non chloré sensible (ex: biomasse lignocellulosique): verifier en laboratoire avant arbitrage final.")
    riskDelta += 2
  }
  if (contamination >= 35 && decisionKey !== "specialized") {
    blocked = true
    warnings.push("Contamination elevee: traitement specialise requis.")
    riskDelta += 24
  }

  return {
    blocked,
    riskDelta,
    warnings,
    references: CEDEAO_REFERENCES,
    scope: "CEDEAO",
  }
}

function buildRegulatoryContext(payload, decisionKey) {
  const gate = computeRegulatoryGate(payload, decisionKey)
  const danger = normalizeText(payload?.niveau_danger || "faible")

  let baseRisk = 34
  if (danger === "eleve") baseRisk += 18
  if (danger === "critique") baseRisk += 32

  const risk = clamp(baseRisk + gate.riskDelta, 8, 95)
  const status = gate.blocked ? "non_conforme" : risk >= 70 ? "vigilance_renforcee" : "preliminaire_conforme"

  return {
    conformite_reglementaire: {
      status,
      max_severity: risk >= 80 ? "high" : risk >= 45 ? "medium" : "low",
      risk_score: risk,
      scope: gate.scope,
      warnings: gate.warnings,
      authorised: !gate.blocked,
    },
    references_reglementaires: gate.references,
  }
}

function computeOfflineAnalysis(payload) {
  const quantity = Number(payload?.quantite_kg || 0)
  const decision = "Valorisation matiere"
  const regs = buildRegulatoryContext(payload, "material")

  return {
    decision,
    decision_principale: decision,
    mode_valorisation_propose: decision,
    score: 62,
    confiance: "moyenne",
    explication: "Resultat local: fallback hors-ligne avec controle reglementaire CEDEAO.",
    resume_choix: "Analyse heuristique locale en attendant la reponse API.",
    facteurs_cles: ["Mode hors-ligne"],
    options_bloquees: [],
    alternatives: [],
    ...regs,
    impact_environnemental: {
      bilan_net_recommande_kgco2e: Number((quantity * 0.18).toFixed(2)),
    },
  }
}

function enforceRegulatoryDecision(payload, suggestedDecision) {
  const key = inferDecisionKey(suggestedDecision)
  const gate = computeRegulatoryGate(payload, key)

  if (!gate.blocked) {
    return {
      finalDecision: String(suggestedDecision || "").trim() || normalizeDecisionLabel(suggestedDecision),
      enforced: false,
      blockedReason: "",
      key,
    }
  }

  return {
    finalDecision: "elimination_securisee",
    enforced: true,
    blockedReason: gate.warnings.join(" ") || "Voie initiale non conforme.",
    key: "specialized",
  }
}

function normalizeApiResult(payload, apiData) {
  const base = computeOfflineAnalysis(payload)
  const suggestedDecisionRaw =
    apiData?.decision_principale ||
    apiData?.mode_valorisation_propose ||
    apiData?.recommandation ||
    apiData?.decision ||
    apiData?.mode_valorisation

  const policy = enforceRegulatoryDecision(payload, suggestedDecisionRaw)
  const finalDecisionRaw = policy.finalDecision
  const finalKey = inferDecisionKey(finalDecisionRaw)
  const finalRegs = buildRegulatoryContext(payload, finalKey)

  const mergedScore = typeof apiData?.score === "number" ? clamp(apiData.score, 0, 100) : clamp(base.score + 5, 0, 100)
  const finalScore = policy.enforced ? Math.min(mergedScore, 55) : mergedScore

  return {
    ...base,
    ...apiData,
    decision: toDecisionDisplayLabel(finalDecisionRaw),
    decision_principale: toDecisionDisplayLabel(finalDecisionRaw),
    mode_valorisation_propose: toDecisionDisplayLabel(finalDecisionRaw),
    score: Number(finalScore.toFixed(1)),
    confiance: apiData?.confiance || base.confiance,
    resume_choix: policy.enforced
      ? `Voie initiale ecartee pour conformite. ${policy.blockedReason}`
      : apiData?.resume_choix || base.resume_choix,
    conformite_reglementaire: finalRegs.conformite_reglementaire,
    references_reglementaires: Array.from(new Set([...(apiData?.references_reglementaires || []), ...(finalRegs.references_reglementaires || [])])),
    raw_api: apiData,
  }
}

function buildAnalyzeWarning(error) {
  if (!axios.isAxiosError(error)) return "API indisponible. Analyse locale activee."
  if (error.code === "ECONNABORTED") return "Timeout API: delai depasse. Analyse locale activee."
  if (!error.response) return "Backend non joignable (verifie que l'API est demarree). Analyse locale activee."

  const status = error.response.status
  if (status === 401 || status === 403) return "Acces API refuse (401/403). Analyse locale activee."
  if (status >= 500) return `Erreur serveur API (${status}). Analyse locale activee.`
  return `Erreur API (${status}). Analyse locale activee.`
}

function optionalNumber(value) {
  if (value === "" || value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function optionalString(value) {
  const v = String(value ?? "").trim()
  return v ? v : null
}

function optionalBoolean(value) {
  if (value === "" || value === null || value === undefined) return null
  if (value === true || value === false) return value
  const normalized = String(value).trim().toLowerCase()
  if (normalized === "true" || normalized === "oui" || normalized === "1") return true
  if (normalized === "false" || normalized === "non" || normalized === "0") return false
  return null
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

    pays_cedeao: optionalString(input.pays_cedeao),
    sous_region_cedeao: optionalString(input.sous_region_cedeao),

    pci_mj_kg: optionalNumber(input.pci_mj_kg),
    dbo_mg_l: optionalNumber(input.dbo_mg_l),
    dco_mg_l: optionalNumber(input.dco_mg_l),
    taux_lignine_pct: optionalNumber(input.taux_lignine_pct),
    taux_contamination_pct: optionalNumber(input.taux_contamination_pct),

    produit_principal: optionalString(input.produit_principal),
    composition_textile: optionalString(input.composition_textile),
    etat_textile: optionalString(input.etat_textile),
    origine_flux: optionalString(input.origine_flux),

    type_plastique: optionalString(input.type_plastique),
    presence_metaux_lourds: optionalBoolean(input.presence_metaux_lourds),
    presence_colorants: optionalBoolean(input.presence_colorants),
    presence_additifs: optionalBoolean(input.presence_additifs),
    presence_chlore: optionalBoolean(input.presence_chlore),
    filiere_cimenterie_autorisee: optionalBoolean(input.filiere_cimenterie_autorisee),
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
    return {
      source: "offline",
      data: computeOfflineAnalysis(payload),
      apiBase: API_BASE,
      warning: buildAnalyzeWarning(error),
      error,
    }
  }
}

export async function identifyWasteFromImage({ imageBase64, mediaType, filename }) {
  const response = await http.request({
    method: "post",
    url: "/api/waste/identify-image",
    data: {
      image_base64: imageBase64,
      media_type: mediaType,
      filename: filename || null,
    },
  })
  return response.data || {}
}

export async function getScientificPrefill({ nom, type_dechet, categorie, description }) {
  const response = await http.request({
    method: "get",
    url: "/api/waste/scientific-prefill",
    params: {
      nom,
      type_dechet: type_dechet || null,
      categorie: categorie || null,
      description: description || null,
    },
  })
  return response.data || {}
}

export { API_BASE, API_URL, REMOTE_API_BASE }
export async function getBeninWasteDatabase() {
  const response = await http.request({
    method: "get",
    url: "/api/waste/database/benin",
  })
  return response.data || { dechets: [] }
}

export async function submitIdentificationCorrection(payload) {
  const response = await http.request({
    method: "post",
    url: "/api/waste/identify-image/corrections",
    data: payload,
  })
  return response.data || { status: "ok" }
}



