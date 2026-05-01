import axios from "axios"
import regulatoryProfiles from "../data/regulatory_profiles.json"

const API_URL = import.meta.env.VITE_API_URL || "https://wasteai-api.wasteai-gildas.workers.dev"
const API_BASE = API_URL.replace(/\/$/, "")
const REMOTE_API_BASE = "https://wasteai-api.wasteai-gildas.workers.dev"
const REMOTE_API_URL = REMOTE_API_BASE.replace(/\/$/, "")
const SHOULD_TRY_REMOTE_FALLBACK = API_BASE !== REMOTE_API_URL && /(^https?:\/\/(127\.0\.0\.1|localhost))|(^https?:\/\/\[::1\])/.test(API_BASE)




const http = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
  headers: { "Content-Type": "application/json" },
})

const remoteHttp = axios.create({
  baseURL: REMOTE_API_URL,
  timeout: 60000,
  headers: { "Content-Type": "application/json" },
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
  co_incineration_cimenterie: "Co-incineration / valorisation thermique",
  charbon_actif: "Valorisation en charbon actif (lignine elevee)",
  refonte_metaux: "Refonte metallurgique (fonderie/acierie)",
  reemploi_pieces_metalliques: "Reemploi de pieces metalliques",
  methanisation_biogaz: "Methanisation avec production de biogaz",
  regeneration_huiles: "Regeneration des huiles usagees",
  neutralisation_chimique: "Traitement physico-chimique (peintures/solvants)",
  effilochage_textile: "Effilochage textile en fibres techniques",
  reemploi_textile: "Reemploi textile avec tri qualite",
  recyclage_papetier: "Recyclage papetier",
  compostage: "Compostage",
  epandage_agricole: "Epandage agricole conforme",
  recyclage_verre: "Recyclage du verre (calcin)",
  demantelement_e_waste: "Demantelement e-waste et recuperation de metaux" ,
  elimination_securisee: "Elimination securisee",
}

const CEDEAO_REFERENCES = [
  "Convention de Bamako: interdiction d'importation de dechets dangereux et gestion ecologiquement rationnelle.",
  "Cadre CEDEAO: controle des flux transfrontaliers, tracabilite et autorisation des operateurs.",
]

const DEFAULT_COUNTRY_POLICY = {
  benin: {
    regulatoryDelta: { energetic: -2, material: 4, reuse_sale: 2, specialized: 0 },
    economicFactor: { energetic: 1.0, material: 1.02, reuse_sale: 1.0, specialized: 1.0 },
    refs: ["Benin: Decret sur la gestion des dechets et autorisations des filieres de traitement."],
  },
  togo: {
    regulatoryDelta: { energetic: -4, material: 3, reuse_sale: 2, specialized: 0 },
    economicFactor: { energetic: 0.95, material: 1.0, reuse_sale: 1.0, specialized: 1.0 },
    refs: ["Togo: cadre national d'hygiene publique et police environnementale."],
  },
  cote_divoire: {
    regulatoryDelta: { energetic: -1, material: 4, reuse_sale: 2, specialized: 0 },
    economicFactor: { energetic: 1.05, material: 1.08, reuse_sale: 1.04, specialized: 1.0 },
    refs: ["Cote d'Ivoire: Code de l'environnement et filieres agreees de valorisation."],
  },
  ghana: {
    regulatoryDelta: { energetic: 2, material: 3, reuse_sale: 2, specialized: 0 },
    economicFactor: { energetic: 1.08, material: 1.06, reuse_sale: 1.03, specialized: 1.0 },
    refs: ["Ghana: EPA Act and hazardous waste control framework."],
  },
  nigeria: {
    regulatoryDelta: { energetic: 1, material: 2, reuse_sale: 1, specialized: 0 },
    economicFactor: { energetic: 1.1, material: 1.07, reuse_sale: 1.05, specialized: 1.0 },
    refs: ["Nigeria: NESREA guidelines for hazardous waste and industrial emissions."],
  },
  default: {
    regulatoryDelta: { energetic: 0, material: 0, reuse_sale: 0, specialized: 0 },
    economicFactor: { energetic: 1.0, material: 1.0, reuse_sale: 1.0, specialized: 1.0 },
    refs: [],
  },
}

const DEFAULT_WASTE_TYPE_RULES = {
  pvc_or_chlorinated: {
    refs: ["Flux PVC/chlore: combustion strictement encadree, priorite au recyclage ou traitement specialise."],
  },
  waste_oil_or_solvent: {
    refs: ["Huiles/solvants usages: regeneration prioritaire, elimination securisee si contamination forte."],
  },
  heavy_metals: {
    refs: ["Presence de metaux lourds: interdiction des voies diffuses, traitement specialise requis."],
  },
  lignin_high: {
    refs: ["Biomasse lignocellulosique: voie charbon actif ou biogaz selon qualite du flux."],
  },
}

const DEFAULT_TYPE_ECONOMIC_MULTIPLIERS = {
  fallback: 1.0,
  category_decision: {
    metal: { material: 1.12, reuse_sale: 1.12 },
    plastique: { material: 1.05, energetic: 0.92 },
    biomasse: { energetic: 1.08 },
    chimique: { energetic: 0.6, material: 1.02 },
  },
  route_bonus: {
    charbon_actif: { ligninHigh: 1.15 },
  },
}

const COUNTRY_POLICY = regulatoryProfiles?.country_policy || DEFAULT_COUNTRY_POLICY
const WASTE_TYPE_RULES = regulatoryProfiles?.waste_type_rules || DEFAULT_WASTE_TYPE_RULES
const TYPE_ECONOMIC_MULTIPLIERS = regulatoryProfiles?.type_economic_multipliers || DEFAULT_TYPE_ECONOMIC_MULTIPLIERS

function inferWasteFlags(payload) {
  const type = normalizeText(payload?.type_dechet)
  const plasticType = normalizeText(payload?.type_plastique)
  const chlorine = payload?.presence_chlore === true
  const contamination = Number(payload?.taux_contamination_pct || 0)
  const lignin = Number(payload?.taux_lignine_pct || 0)
  const heavyMetals = payload?.presence_metaux_lourds === true

  const pvcOrChlorinated = chlorine || plasticType.includes("pvc")
  const name = normalizeText(payload?.nom)
  const desc = normalizeText(payload?.description)
  const wasteOilOrSolvent = type.includes("huile") || type.includes("solvant") || name.includes("huile") || desc.includes("huile") || desc.includes("solvant")
  const ligninHigh = lignin >= 30

  return {
    pvcOrChlorinated,
    wasteOilOrSolvent,
    heavyMetals,
    ligninHigh,
    contamination,
  }
}

function getTypeEconomicMultiplier(payload, decisionKey, routeKey) {
  const category = guessCategory(payload)
  const flags = inferWasteFlags(payload)
  const cfg = TYPE_ECONOMIC_MULTIPLIERS || DEFAULT_TYPE_ECONOMIC_MULTIPLIERS

  let multiplier = Number(cfg?.fallback ?? 1)
  const categoryMap = cfg?.category_decision?.[category]
  const categoryFactor = Number(categoryMap?.[decisionKey])
  if (Number.isFinite(categoryFactor) && categoryFactor > 0) {
    multiplier *= categoryFactor
  }

  const routeBonus = cfg?.route_bonus?.[routeKey]
  if (routeBonus && flags.ligninHigh && Number.isFinite(Number(routeBonus.ligninHigh))) {
    multiplier *= Number(routeBonus.ligninHigh)
  }

  return multiplier
}
const ROUTE_CONFIG = {
  recyclage_mecanique_plastique: {
    decisionKey: "material",
    econFcfaTonne: 90000,
    base: { technique: 76, environnement: 78, reglementaire: 82, economique: 72, social: 62 },
    description: "Tri, lavage et extrusion vers granules secondaires.",
  },
  pyrolyse_plastique: {
    decisionKey: "energetic",
    econFcfaTonne: 70000,
    base: { technique: 66, environnement: 58, reglementaire: 60, economique: 70, social: 56 },
    description: "Conversion thermochimique controlee pour recuperation d'huile pyrolytique.",
  },
  co_incineration_cimenterie: {
    decisionKey: "energetic",
    econFcfaTonne: 45000,
    base: { technique: 63, environnement: 52, reglementaire: 64, economique: 60, social: 54 },
    description: "Substitution partielle de combustible en installation thermique controlee.",
  },
  charbon_actif: {
    decisionKey: "material",
    econFcfaTonne: 140000,
    base: { technique: 72, environnement: 74, reglementaire: 78, economique: 86, social: 58 },
    description: "Valorisation de flux lignocellulosiques en charbon actif.",
  },
  refonte_metaux: {
    decisionKey: "material",
    econFcfaTonne: 220000,
    base: { technique: 84, environnement: 82, reglementaire: 86, economique: 90, social: 66 },
    description: "Tri metallique et refonte en filiere industrielle locale.",
  },
  reemploi_pieces_metalliques: {
    decisionKey: "reuse_sale",
    econFcfaTonne: 150000,
    base: { technique: 70, environnement: 88, reglementaire: 76, economique: 82, social: 72 },
    description: "Reemploi direct de pieces conformes apres controle qualite.",
  },
  methanisation_biogaz: {
    decisionKey: "energetic",
    econFcfaTonne: 65000,
    base: { technique: 74, environnement: 86, reglementaire: 80, economique: 68, social: 64 },
    description: "Digestion anaerobie avec production de biogaz et digestat encadre.",
  },
  regeneration_huiles: {
    decisionKey: "material",
    econFcfaTonne: 120000,
    base: { technique: 78, environnement: 70, reglementaire: 82, economique: 80, social: 60 },
    description: "Regeneration d'huiles usagees en filiere autorisee.",
  },
  effilochage_textile: {
    decisionKey: "material",
    econFcfaTonne: 55000,
    base: { technique: 73, environnement: 76, reglementaire: 82, economique: 60, social: 62 },
    description: "Transformation en fibres secondaires techniques.",
  },
  reemploi_textile: {
    decisionKey: "reuse_sale",
    econFcfaTonne: 70000,
    base: { technique: 68, environnement: 85, reglementaire: 76, economique: 70, social: 75 },
    description: "Tri qualite pour reemploi local et insertion sociale.",
  },
  recyclage_papetier: {
    decisionKey: "material",
    econFcfaTonne: 50000,
    base: { technique: 72, environnement: 80, reglementaire: 84, economique: 58, social: 60 },
    description: "Recyclage en pate papier selon exigences de proprete.",
  },
  compostage: {
    decisionKey: "material",
    econFcfaTonne: 30000,
    base: { technique: 64, environnement: 78, reglementaire: 78, economique: 50, social: 68 },
    description: "Compostage aerobie sous controle de contamination.",
  },
  epandage_agricole: {
    decisionKey: "material",
    econFcfaTonne: 20000,
    base: { technique: 58, environnement: 66, reglementaire: 60, economique: 45, social: 64 },
    description: "Epandage uniquement si conformite agronomique et sanitaire verifiee.",
  },
  neutralisation_chimique: {
    decisionKey: "specialized",
    econFcfaTonne: 15000,
    base: { technique: 82, environnement: 62, reglementaire: 88, economique: 42, social: 50 },
    description: "Traitement physico-chimique pour stabiliser les flux peinture/solvants.",
  },
  elimination_securisee: {
    decisionKey: "specialized",
    econFcfaTonne: -25000,
    base: { technique: 72, environnement: 40, reglementaire: 90, economique: 20, social: 48 },
    description: "Traitement/elimination securisee en installation autorisee.",
  },
}

const DECISION_FACTORS = {
  material: 620,
  energetic: 340,
  reuse_sale: 540,
  specialized: 40,
}

function shouldFallbackToRemote(error) {
  if (!SHOULD_TRY_REMOTE_FALLBACK) return false
  if (!axios.isAxiosError(error)) return false
  if (error.code === "ECONNABORTED") return true
  if (!error.response) return true
  return error.response.status >= 500
}

async function requestWithFallback(config) {
  try {
    return await http.request(config)
  } catch (error) {
    if (!shouldFallbackToRemote(error)) throw error
    return remoteHttp.request(config)
  }
}

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

const COUNTRY_ALIASES = {
  benin: ["benin"],
  togo: ["togo"],
  cote_divoire: ["cote divoire", "cote d ivoire", "cote ivoire", "ivory coast"],
  ghana: ["ghana"],
  nigeria: ["nigeria"],
  default: [
    "burkina faso",
    "cap vert",
    "gambie",
    "guinee",
    "guinee bissau",
    "liberia",
    "mali",
    "niger",
    "senegal",
    "sierra leone",
  ],
}

function getCountryKey(payload) {
  const raw = normalizeText(payload?.pays_cedeao || payload?.country || "benin")
  for (const [key, aliases] of Object.entries(COUNTRY_ALIASES)) {
    if (aliases.some((alias) => raw.includes(alias))) return key
  }
  return "default"
}

function inferDecisionKey(rawDecision) {
  const key = normalizeText(rawDecision)
  if (!key) return "material"
  if (key.includes("ener")) return "energetic"
  if (key.includes("reemploi") || key.includes("reuse") || key.includes("market") || key.includes("vente")) return "reuse_sale"
  if (key.includes("special") || key.includes("dang") || key.includes("inciner") || key.includes("elim")) return "specialized"
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

function guessCategory(payload) {
  const category = normalizeText(payload?.categorie)
  const type = normalizeText(payload?.type_dechet)
  const name = normalizeText(payload?.nom)
  const desc = normalizeText(payload?.description)
  const flow = normalizeText(payload?.origine_flux)
  const merged = `${category} ${type} ${name} ${desc} ${flow}`

  const organicHints = ["abattoir", "abattage", "residus animaux", "tripes", "visceres", "sang animal", "sous produit animal", "excrement", "dejection", "fumier", "fiente", "lisier", "dechet animal", "organique", "biodéchet", "biodechet", "biodéchets", "biodechats", "alimentaire", "aliment", "cuisine", "cantine", "restaurant", "marche", "menager"]
  if (organicHints.some((k) => merged.includes(k))) return "organique"

  if (merged.includes("metal") || merged.includes("ferraille") || merged.includes("alu")) return "metal"
  if (merged.includes("textile") || merged.includes("fibre")) return "textile"
  if (merged.includes("papier") || merged.includes("carton")) return "papier"
  if (merged.includes("plast") || merged.includes("pet") || merged.includes("pehd") || merged.includes("pvc")) return "plastique"
  if (merged.includes("verre")) return "verre"
  if (merged.includes("e waste") || merged.includes("ewaste") || merged.includes("electron") || merged.includes("batter")) return "e_waste"

  const paintHints = ["peinture", "paint", "vernis", "coating", "laque", "encre", "resine", "pigment"]
  if (paintHints.some((k) => merged.includes(k))) return "chimique"

  if (merged.includes("huile") || merged.includes("solvant") || merged.includes("chim") || merged.includes("boue")) return "chimique"
  return "autre"
}

function computeRegulatoryGate(payload, decisionKey) {
  const countryKey = getCountryKey(payload)
  const category = normalizeText(payload?.categorie)
  const countryPolicy = COUNTRY_POLICY[countryKey] || COUNTRY_POLICY.default
  const flags = inferWasteFlags(payload)

  const danger = normalizeText(payload?.niveau_danger || "faible")
  const type = normalizeText(payload?.type_dechet)
  const chlorine = payload?.presence_chlore === true
  const contamination = Number(payload?.taux_contamination_pct || 0)
  const typePlastique = normalizeText(payload?.type_plastique)

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
    typePlastique.includes("pvc")
  )

  if ((chlorineSensitive || flags.pvcOrChlorinated) && decisionKey === "energetic") {
    blocked = true
    warnings.push("Presence de chlore (PVC/chimique): combustion interdite sans depollution adaptee.")
    riskDelta += 20
  } else if (chlorine && decisionKey === "energetic") {
    warnings.push("Presence de chlore signalee: verification laboratoire obligatoire avant voie energetique.")
    riskDelta += 6
  }

  if ((contamination >= 35 || flags.heavyMetals) && decisionKey !== "specialized") {
    blocked = true
    warnings.push("Contamination elevee: traitement specialise requis.")
    riskDelta += 24
  }

  if (flags.wasteOilOrSolvent && decisionKey === "reuse_sale") {
    blocked = true
    warnings.push("Huiles/solvants: reemploi/vente directe non autorise.")
    riskDelta += 16
  }

  if (countryKey === "togo" && flags.wasteOilOrSolvent && decisionKey === "material") {
    warnings.push("Togo: filiere matiere pour huiles/solvants soumise a autorisation renforcee.")
    riskDelta += 8
  }

  if (countryKey === "cote_divoire" && flags.ligninHigh && decisionKey === "material") {
    warnings.push("Cote d Ivoire: biomasse lignine elevee favorable aux filieres matiere stabilisees.")
    riskDelta -= 4
  }

  if (countryKey === "nigeria" && decisionKey === "energetic" && flags.contamination >= 20) {
    warnings.push("Nigeria: controle emission renforce pour voie energetique sur flux contamine.")
    riskDelta += 6
  }

  if (countryKey === "ghana" && decisionKey === "reuse_sale" && danger !== "faible") {
    warnings.push("Ghana: verification documentaire renforcee pour reemploi hors flux faible risque.")
    riskDelta += 6
  }

  riskDelta -= Number(countryPolicy?.regulatoryDelta?.[decisionKey] || 0)

  return {
    blocked,
    riskDelta,
    warnings,
    references: [...CEDEAO_REFERENCES, ...(countryPolicy.refs || []), ...(flags.pvcOrChlorinated ? WASTE_TYPE_RULES.pvc_or_chlorinated.refs : []), ...(flags.wasteOilOrSolvent ? WASTE_TYPE_RULES.waste_oil_or_solvent.refs : []), ...(flags.heavyMetals ? WASTE_TYPE_RULES.heavy_metals.refs : []), ...(flags.ligninHigh ? WASTE_TYPE_RULES.lignin_high.refs : [])],
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

function routeLabel(routeKey) {
  return SPECIFIC_ROUTE_LABELS[routeKey] || toDecisionDisplayLabel(routeKey)
}

function estimateImpactKg(payload, decisionKey) {
  const quantityKg = Number(payload?.quantite_kg || 0)
  const tonnes = Math.max(0, quantityKg / 1000)
  const factor = DECISION_FACTORS[decisionKey] ?? DECISION_FACTORS.material
  return Number((tonnes * factor).toFixed(2))
}

function candidateRoutesForCategory(category, payload) {
  const lignin = Number(payload?.taux_lignine_pct || 0)
  const merged = normalizeText(`${payload?.nom || ""} ${payload?.description || ""} ${payload?.type_dechet || ""} ${payload?.categorie || ""}`)
  const paintLike = ["peinture", "paint", "vernis", "coating", "laque", "encre", "resine", "pigment"].some((k) => merged.includes(k))
  const oilLike = ["huile usagee", "huile usee", "vidange", "lubrifiant", "waste oil", "used oil"].some((k) => merged.includes(k))

  if (category === "plastique") {
    return ["recyclage_mecanique_plastique", "pyrolyse_plastique", "co_incineration_cimenterie", "elimination_securisee"]
  }
  if (category === "textile") {
    return ["effilochage_textile", "reemploi_textile", "co_incineration_cimenterie", "elimination_securisee"]
  }
  if (category === "metal") {
    return ["refonte_metaux", "reemploi_pieces_metalliques", "elimination_securisee"]
  }
  if (category === "papier") {
    return ["recyclage_papetier", "compostage", "co_incineration_cimenterie", "elimination_securisee"]
  }
  if (category === "biomasse" || category === "organique") {
    return lignin >= 30
      ? ["charbon_actif", "methanisation_biogaz", "compostage", "elimination_securisee"]
      : ["methanisation_biogaz", "compostage", "epandage_agricole", "elimination_securisee"]
  }
  if (category === "chimique") {
    if (paintLike) return ["neutralisation_chimique", "co_incineration_cimenterie", "elimination_securisee"]
    if (oilLike) return ["regeneration_huiles", "co_incineration_cimenterie", "elimination_securisee"]
    return ["neutralisation_chimique", "elimination_securisee", "co_incineration_cimenterie"]
  }
  if (category === "verre") {
    return ["recyclage_papetier", "refonte_metaux", "elimination_securisee"]
  }
  if (category === "e_waste") {
    return ["refonte_metaux", "elimination_securisee", "reemploi_pieces_metalliques"]
  }
  return ["methanisation_biogaz", "recyclage_papetier", "elimination_securisee", "co_incineration_cimenterie"]
}

function scoreRoute(payload, routeKey) {
  const cfg = ROUTE_CONFIG[routeKey] || ROUTE_CONFIG.elimination_securisee
  const gate = computeRegulatoryGate(payload, cfg.decisionKey)
  const countryKey = getCountryKey(payload)
  const countryPolicy = COUNTRY_POLICY[countryKey] || COUNTRY_POLICY.default

  const contamination = Number(payload?.taux_contamination_pct || 0)
  const quantity = Number(payload?.quantite_kg || 0)
  const danger = normalizeText(payload?.niveau_danger || "faible")
  const lignin = Number(payload?.taux_lignine_pct || 0)

  let technique = cfg.base.technique - clamp(contamination / 3, 0, 22)
  let environnement = cfg.base.environnement
  let reglementaire = cfg.base.reglementaire - gate.riskDelta
  let economique = cfg.base.economique
  const social = cfg.base.social

  if (quantity >= 1000) economique += 6
  if (quantity >= 5000) economique += 6
  if (danger === "eleve") technique -= 8
  if (danger === "critique") technique -= 14

  reglementaire += Number(countryPolicy?.regulatoryDelta?.[cfg.decisionKey] || 0)
  economique *= Number(countryPolicy?.economicFactor?.[cfg.decisionKey] || 1)

  if (routeKey === "charbon_actif") {
    if (lignin >= 35) technique += 12
    else technique -= 12
  }

  const decisionKey = cfg.decisionKey
  const impactKg = estimateImpactKg(payload, decisionKey)
  environnement += clamp((impactKg / Math.max(1, Number(payload?.quantite_kg || 1))) * 120, 0, 12)

  technique = clamp(technique, 0, 100)
  environnement = clamp(environnement, 0, 100)
  reglementaire = clamp(reglementaire, 0, 100)
  economique = clamp(economique, 0, 100)

  const global = clamp(
    0.3 * technique +
      0.2 * environnement +
      0.25 * reglementaire +
      0.2 * economique +
      0.05 * social -
      (gate.blocked ? 35 : 0),
    0,
    100
  )

  return {
    route_key: routeKey,
    filiere: routeLabel(routeKey),
    decision_key: decisionKey,
    score: Number(global.toFixed(1)),
    details_scores: {
      technique: Number(technique.toFixed(1)),
      environnement: Number(environnement.toFixed(1)),
      reglementaire: Number(reglementaire.toFixed(1)),
      economique: Number(economique.toFixed(1)),
      social: Number(social.toFixed(1)),
    },
    impact_kgco2e: impactKg,
    valeur_fcfa_tonne: Math.round(cfg.econFcfaTonne * Number(countryPolicy?.economicFactor?.[cfg.decisionKey] || 1) * getTypeEconomicMultiplier(payload, cfg.decisionKey, routeKey)),
    description: cfg.description,
    blocked: gate.blocked,
    blocked_reason: gate.warnings.join(" "),
    regulatory_warnings: gate.warnings,
  }
}

function buildPathwayEngine(payload, suggestedDecisionRaw) {
  const category = guessCategory(payload)
  const evaluated = candidateRoutesForCategory(category, payload)
    .map((routeKey) => scoreRoute(payload, routeKey))
    .sort((a, b) => b.score - a.score)

  const allowed = evaluated.filter((r) => !r.blocked)
  const blocked = evaluated.filter((r) => r.blocked)

  const suggestedKey = inferDecisionKey(suggestedDecisionRaw)
  const preferredBySuggestion = allowed.find((r) => r.decision_key === suggestedKey)
  const primary = preferredBySuggestion || allowed[0] || evaluated[0]
  const second = allowed.find((r) => r.route_key !== primary?.route_key) || null

  const blockedForSuggested = blocked.filter((r) => r.decision_key === suggestedKey)
  const enforced = Boolean(suggestedDecisionRaw && preferredBySuggestion == null && blockedForSuggested.length > 0)
  const blockedReason = enforced
    ? blockedForSuggested.map((x) => x.blocked_reason).filter(Boolean).join(" ") || "Voie proposee non conforme."
    : ""

  const alternatives = allowed
    .filter((r) => r.route_key !== primary?.route_key)
    .slice(0, 2)
    .map((route) => ({
      filiere: route.filiere,
      score: route.score,
      pourquoi_pas_prioritaire: `Technique ${route.details_scores.technique}/100, environnement ${route.details_scores.environnement}/100, reglementaire ${route.details_scores.reglementaire}/100, economique ${route.details_scores.economique}/100.`,
      valeur_fcfa_tonne: route.valeur_fcfa_tonne,
    }))

  const optionsBloquees = blocked.map((route) => ({
    filiere: route.filiere,
    raison: route.blocked_reason || "Contrainte reglementaire.",
    score: route.score,
  }))

  const scoresParVoie = evaluated.map((route) => ({
    filiere: route.filiere,
    score: route.score,
    blocked: route.blocked,
    blocked_reason: route.blocked_reason,
    ...route.details_scores,
  }))

  const resumeChoix = primary
    ? `Voie prioritaire: ${primary.filiere}. Scores - technique ${primary.details_scores.technique}/100, environnement ${primary.details_scores.environnement}/100, reglementaire ${primary.details_scores.reglementaire}/100, economique ${primary.details_scores.economique}/100.${enforced ? ` ${blockedReason}` : ""}`
    : "Aucune voie prioritaire calculee."

  return {
    category,
    primary,
    second,
    alternatives,
    optionsBloquees,
    scoresParVoie,
    resumeChoix,
    enforced,
    blockedReason,
    decisionKey: primary?.decision_key || "specialized",
  }
}

function buildEstimatedImpact(payload, primaryDecisionKey, evaluatedRoutes = []) {
  const primaryImpact = estimateImpactKg(payload, primaryDecisionKey)
  const parVoie = {}

  if (Array.isArray(evaluatedRoutes) && evaluatedRoutes.length > 0) {
    evaluatedRoutes.forEach((route) => {
      const impact = Number(route.impact_kgco2e || 0)
      parVoie[route.route_key || route.filiere] = {
        voie: route.filiere,
        emissions_generees_kgco2e: 0,
        emissions_evitees_kgco2e: impact,
        bilan_net_kgco2e: impact,
      }
    })
  } else {
    parVoie[primaryDecisionKey] = {
      voie: normalizeDecisionLabel(primaryDecisionKey),
      emissions_generees_kgco2e: 0,
      emissions_evitees_kgco2e: primaryImpact,
      bilan_net_kgco2e: primaryImpact,
    }
  }

  return {
    bilan_net_recommande_kgco2e: primaryImpact,
    par_voie: parVoie,
    hypotheses: [
      "Impact estime localement faute de detail environnemental complet retourne par l'API.",
    ],
  }
}

export function analyzeLocally(formData) {
  const engine = buildPathwayEngine(formData, "")
  const primary = engine.primary
  const second = engine.second
  const regs = buildRegulatoryContext(formData, engine.decisionKey)

  return {
    decision: primary?.filiere || "Elimination securisee",
    decision_principale: primary?.filiere || "Elimination securisee",
    mode_valorisation_propose: primary?.filiere || "Elimination securisee",
    score: Number(primary?.score || 50),
    confiance: "moyenne",
    resume: engine.resumeChoix,
    resume_choix: engine.resumeChoix,
    valorisation: primary?.filiere || "Elimination securisee",
    valeur_fcfa: Number(primary?.valeur_fcfa_tonne || 0),
    valorisation_1: {
      methode: primary?.filiere || "Elimination securisee",
      description: primary?.description || "Voie estimee localement.",
      valeur_fcfa_tonne: Number(primary?.valeur_fcfa_tonne || 0),
    },
    valorisation_2: {
      methode: second?.filiere || "Aucune alternative conforme",
      description: second?.description || "Aucune 2e voie conforme disponible avec les contraintes actuelles.",
      valeur_fcfa_tonne: Number(second?.valeur_fcfa_tonne || 0),
    },
    alternatives: engine.alternatives,
    options_bloquees: engine.optionsBloquees,
    details_scores: primary?.details_scores || {},
    scores_par_voie: engine.scoresParVoie,
    explication: engine.resumeChoix,
    source: "local",
    note: "Analyse IA indisponible - resultat estime",
    impact_environnemental: buildEstimatedImpact(formData, engine.decisionKey, engine.primary ? [engine.primary, ...(engine.second ? [engine.second] : [])] : []),
    ...regs,
  }
}

function normalizeApiResult(payload, apiData) {
  const suggestedDecisionRaw =
    apiData?.decision_principale ||
    apiData?.mode_valorisation_propose ||
    apiData?.recommandation ||
    apiData?.decision ||
    apiData?.mode_valorisation

  const engine = buildPathwayEngine(payload, suggestedDecisionRaw)
  const primary = engine.primary
  const second = engine.second
  const finalRegs = buildRegulatoryContext(payload, engine.decisionKey)

  const apiScore = typeof apiData?.score === "number" ? clamp(apiData.score, 0, 100) : null
  const score = Number((apiScore ?? primary?.score ?? 50).toFixed(1))

  const impactFromApi = apiData?.impact_environnemental?.bilan_net_recommande_kgco2e
  const estimatedImpact = buildEstimatedImpact(payload, engine.decisionKey, engine.primary ? [engine.primary, ...(engine.second ? [engine.second] : [])] : [])

  return {
    ...apiData,
    decision: primary?.filiere || toDecisionDisplayLabel(suggestedDecisionRaw),
    decision_principale: primary?.filiere || toDecisionDisplayLabel(suggestedDecisionRaw),
    mode_valorisation_propose: primary?.filiere || toDecisionDisplayLabel(suggestedDecisionRaw),
    score,
    confiance: apiData?.confiance || "moyenne",
    resume_choix: apiData?.resume_choix || engine.resumeChoix,
    explication: apiData?.explication || engine.resumeChoix,
    valorisation_1: {
      methode: primary?.filiere || toDecisionDisplayLabel(suggestedDecisionRaw),
      description: primary?.description || "Voie proposee apres scoring multicritere.",
      valeur_fcfa_tonne: Number(primary?.valeur_fcfa_tonne || 0),
    },
    valorisation_2: {
      methode: second?.filiere || "Aucune alternative conforme",
      description: second?.description || "Aucune 2e voie conforme disponible avec les contraintes actuelles.",
      valeur_fcfa_tonne: Number(second?.valeur_fcfa_tonne || 0),
    },
    valeur_fcfa: Number(primary?.valeur_fcfa_tonne || apiData?.valeur_fcfa || 0),
    alternatives: engine.alternatives,
    options_bloquees: engine.optionsBloquees,
    details_scores: primary?.details_scores || {},
    scores_par_voie: engine.scoresParVoie,
    conformite_reglementaire: finalRegs.conformite_reglementaire,
    references_reglementaires: Array.from(new Set([...(apiData?.references_reglementaires || []), ...(finalRegs.references_reglementaires || [])])),
    impact_environnemental:
      typeof impactFromApi === "number" ? apiData.impact_environnemental : estimatedImpact,
    raw_api: apiData,
  }
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
    taux_humidite_pct: optionalNumber(input.taux_humidite_pct),
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
  }
}

export async function analyzeWaste(payload) {
  const response = await requestWithFallback({
    method: "post",
    url: "/api/waste/analyze",
    data: payload,
    timeout: 60000,
  })

  return {
    source: "api",
    data: normalizeApiResult(payload, response.data || {}),
    apiBase: API_BASE,
    warning: "Format API compact detecte: enrichissement local applique pour detail operationnel.",
  }
}

function normalizeIdentificationApiResult(raw, filename) {
  const data = raw?.result || raw?.data || raw?.prediction || raw || {}
  const detectedName = String(
    data.nom_exact || data.nom || data.waste_name || data.label || data.object_name || ""
  ).trim()

  const fallbackName = String(filename || "dechet solide non identifie")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim() || "dechet solide non identifie"

  const confidenceRaw = Number(data.confidence ?? data.confiance_identification ?? data.score ?? 0)
  const confidencePercent = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(100, confidenceRaw <= 1 ? confidenceRaw * 100 : confidenceRaw))
    : 32

  const confidenceNormalized = Number((confidencePercent / 100).toFixed(2))
  const status = String(data.status || "").trim() || (confidenceNormalized < 0.5 ? "uncertain" : "identified")

  const filiere = String(data.filiere || data.categorie || data.category || "autre")
  let finalName = detectedName || fallbackName || "dechet solide non identifie"
  let guess = String(data.guess || "").trim()
  let description = String(data.description_estimee || data.description || data.explication || data.resume || "").trim()
  const technicalDescription = String(data.technical_description || "").trim()

  if (confidencePercent < 30) {
    if (!detectedName || /dechet solide non identifie/i.test(finalName)) {
      finalName = "Type de dechet probable inconnu"
    }
    guess = guess || `${filiere} (approximation)`
    description = description || `L'image est difficile a analyser. Base sur la texture et la couleur, ce dechet pourrait appartenir a la categorie ${filiere}.`
  }

  if (!description && technicalDescription) {
    description = technicalDescription
  }
  if (!description) {
    description = "Identification visuelle probable. Merci de confirmer ce nom."
  }

  return {
    ...data,
    name: String(data.name || finalName),
    guess,
    description,
    technical_description: technicalDescription,
    ux_message: String(data.ux_message || (confidencePercent < 40 ? "Image difficile a analyser. Essayez une photo plus nette ou rapprochee." : "")),
    waste_name: finalName,
    confidence: confidenceNormalized,
    status,
    nom_exact: finalName,
    nom: finalName,
    filiere,
    description_estimee: description,
    explication: String(data.explication || description).trim(),
    confiance_identification: confidencePercent,
    confiance: confidencePercent >= 75 ? "elevee" : confidencePercent >= 55 ? "moyenne" : "faible",
  }
}
export async function identifyWasteFromImage({ imageBase64, mediaType, filename, file }) {
  const requestWithRetry = async (config, retries = 1) => {
    let lastError = null
    for (let i = 0; i <= retries; i += 1) {
      try {
        const response = await requestWithFallback(config)
        return normalizeIdentificationApiResult(response.data || {}, filename)
      } catch (error) {
        lastError = error
        if (i < retries) {
          await new Promise((resolve) => setTimeout(resolve, 1200))
        }
      }
    }
    throw lastError
  }

  const postJson = async () => requestWithRetry({
    method: "post",
    url: "/api/waste/identify-image",
    timeout: 45000,
    data: {
      image_base64: imageBase64,
      media_type: mediaType,
      filename: filename || null,
    },
  })

  if (!file) return postJson()

  const formData = new FormData()
  formData.append("image", file, filename || file.name || "waste.jpg")
  if (filename) formData.append("filename", filename)

  try {
    return await requestWithRetry({
      method: "post",
      url: "/api/waste/identify-image",
      timeout: 45000,
      data: formData,
    })
  } catch (error) {
    if (imageBase64) return postJson()
    throw error
  }
}

export async function getScientificPrefill({ nom, type_dechet, categorie, description }) {
  const response = await requestWithFallback({
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

export async function pingApi() {
  try {
    await requestWithFallback({
      method: "get",
      url: "/api/waste/database/benin",
      timeout: 8000,
      params: { limit: 1 },
    })
    return true
  } catch {
    return false
  }
}

export async function getValorizationRegistry() {
  const response = await requestWithFallback({
    method: "get",
    url: "/api/waste/valorization-filieres",
  })
  return response.data || { filieres: [] }
}

export async function getValorizationRegistryTemplate() {
  const response = await requestWithFallback({
    method: "get",
    url: "/api/waste/valorization-filieres/template",
  })
  return response.data || { filieres: [] }
}

export async function getValorizationRegistryAudit() {
  const response = await requestWithFallback({
    method: "get",
    url: "/api/waste/valorization-filieres/audit",
  })
  return response.data || { healthy: false, issues: [] }
}

export async function updateValorizationRegistry(payload, adminKey) {
  const response = await requestWithFallback({
    method: "put",
    url: "/api/waste/valorization-filieres",
    data: payload,
    headers: adminKey ? { "x-admin-key": adminKey } : undefined,
  })
  return response.data || { status: "ok" }
}

export { API_BASE, API_URL, REMOTE_API_BASE }

export async function getBeninWasteDatabase() {
  const response = await requestWithFallback({
    method: "get",
    url: "/api/waste/database/benin",
  })
  return response.data || { dechets: [] }
}

export async function submitIdentificationCorrection(payload) {
  const response = await requestWithFallback({
    method: "post",
    url: "/api/waste/identify-image/corrections",
    data: payload,
  })
  return response.data || { status: "ok" }
}



export async function matchLocalActors(payload) {
  const response = await requestWithFallback({
    method: "post",
    url: "/api/marketplace/actors/match",
    data: payload,
  })
  return response.data || []
}
