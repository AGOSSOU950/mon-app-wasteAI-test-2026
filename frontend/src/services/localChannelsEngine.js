const CHANNELS = [
  {
    id: 1,
    name: "Fabrimetal",
    kind: "buyer",
    type: "Recyclage metal",
    acceptedFamilies: ["metal"],
    acceptedRouteHints: ["refonte", "ferraille", "recyclage metal", "vente ferrailleur", "matiere"],
    location: "Cotonou",
    distance_km: 18,
    contact: "+229 01 43 00 00",
    estimated_cost_per_ton: 22,
    potential_gain_per_ton: 170,
  },
  {
    id: 2,
    name: "Valea",
    kind: "buyer",
    type: "Recyclage plastique",
    acceptedFamilies: ["plastic"],
    acceptedRouteHints: ["plastique", "recyclage plastique", "granulation", "tri", "recyclage matiere"],
    location: "Cotonou",
    distance_km: 16,
    contact: "+229 01 44 00 00",
    estimated_cost_per_ton: 26,
    potential_gain_per_ton: 145,
  },
  {
    id: 3,
    name: "Ateliers de confection locaux",
    kind: "buyer",
    type: "Reemploi textile",
    acceptedFamilies: ["textile"],
    acceptedRouteHints: ["textile", "reemploi", "retouche", "couture", "upcycling", "effilochage"],
    location: "Cotonou",
    distance_km: 12,
    contact: "ateliers-cotonou@example.com",
    estimated_cost_per_ton: 18,
    potential_gain_per_ton: 125,
  },
  {
    id: 4,
    name: "Couturiers partenaires de Porto-Novo",
    kind: "buyer",
    type: "Reemploi textile",
    acceptedFamilies: ["textile"],
    acceptedRouteHints: ["textile", "reemploi", "retouche", "couture", "upcycling"],
    location: "Porto-Novo",
    distance_km: 28,
    contact: "couturiers-portonovo@example.com",
    estimated_cost_per_ton: 20,
    potential_gain_per_ton: 118,
  },
  {
    id: 5,
    name: "CIMBENIN",
    kind: "treatment",
    type: "Co-processing cimenterie",
    acceptedFamilies: ["organic", "industrial", "plastic", "textile"],
    acceptedRouteHints: ["co-processing", "co-incineration", "cimenterie", "energie", "thermique"],
    location: "Benin, corridor Atlantique",
    distance_km: 42,
    contact: "+229 01 40 00 00",
    estimated_cost_per_ton: 38,
    potential_gain_per_ton: 110,
  },
  {
    id: 6,
    name: "NOCIBE",
    kind: "treatment",
    type: "Co-processing cimenterie",
    acceptedFamilies: ["organic", "industrial", "plastic", "textile"],
    acceptedRouteHints: ["co-processing", "co-incineration", "cimenterie", "energie", "thermique"],
    location: "Benin, zone industrielle cotiere",
    distance_km: 58,
    contact: "+229 01 41 00 00",
    estimated_cost_per_ton: 41,
    potential_gain_per_ton: 104,
  },
  {
    id: 7,
    name: "BlueStone Plastiques",
    kind: "buyer",
    type: "Recyclage plastique",
    acceptedFamilies: ["plastic"],
    acceptedRouteHints: ["plastique", "recyclage plastique", "granulation"],
    location: "Abomey-Calavi",
    distance_km: 24,
    contact: "+229 01 45 00 00",
    estimated_cost_per_ton: 28,
    potential_gain_per_ton: 138,
  },
  {
    id: 8,
    name: "Biogaz Benin",
    kind: "treatment",
    type: "Biogaz et compostage",
    acceptedFamilies: ["organic"],
    acceptedRouteHints: ["biogaz", "methanisation", "compostage", "biodechets", "abattoir", "boue", "lisier", "fumier"],
    location: "Benin",
    distance_km: 10,
    contact: "contact@biogazbenin.example.com",
    estimated_cost_per_ton: 34,
    potential_gain_per_ton: 132,
  },
  {
    id: 9,
    name: "Fondation ReBin",
    kind: "treatment",
    type: "Biogaz et compostage",
    acceptedFamilies: ["organic"],
    acceptedRouteHints: ["biogaz", "methanisation", "compostage", "biodechets", "organique", "abattoir"],
    location: "Benin",
    distance_km: 26,
    contact: "contact@rebin.example.com",
    estimated_cost_per_ton: 33,
    potential_gain_per_ton: 126,
  },
  {
    id: 10,
    name: "Centre Valdera - UAC",
    kind: "treatment",
    type: "Compost, biogaz et pavage plastique",
    acceptedFamilies: ["organic", "plastic"],
    acceptedRouteHints: ["compostage", "biogaz", "methanisation", "boues de vidange", "boue", "vidange", "plastique", "paves", "pave", "pet", "pe", "pp"],
    location: "Abomey-Calavi",
    distance_km: 22,
    contact: "valdera@uac.bj",
    estimated_cost_per_ton: 31,
    potential_gain_per_ton: 140,
  },
  {
    id: 11,
    name: "Centre Songhai",
    kind: "treatment",
    type: "Compost et biogaz",
    acceptedFamilies: ["organic"],
    acceptedRouteHints: ["compostage", "biogaz", "methanisation", "biodechets", "dechets organiques"],
    location: "Porto-Novo",
    distance_km: 31,
    contact: "songhai@example.com",
    estimated_cost_per_ton: 32,
    potential_gain_per_ton: 128,
  },
  {
    id: 12,
    name: "SGDS",
    kind: "treatment",
    type: "Valorisation multi-filiere",
    acceptedFamilies: ["organic", "plastic", "industrial"],
    acceptedRouteHints: ["plastique", "compostage", "biogaz", "methanisation", "biodechets", "biochar", "biomasse", "lignocellulosique"],
    location: "Benin",
    distance_km: 24,
    contact: "sgds@example.com",
    estimated_cost_per_ton: 35,
    potential_gain_per_ton: 122,
  },
  {
    id: 13,
    name: "Gbogbeto",
    kind: "treatment",
    type: "Biochar et valorisation plastique",
    acceptedFamilies: ["plastic", "industrial", "organic"],
    acceptedRouteHints: ["biochar", "valorisation energetique", "plastique", "pe", "pp", "polyethylene", "polypropylene", "biomasse", "lignocellulosique"],
    location: "Benin",
    distance_km: 38,
    contact: "gbogbeto@example.com",
    estimated_cost_per_ton: 29,
    potential_gain_per_ton: 136,
  },
]

const FAMILY_ALIASES = [
  { needle: "metal", family: "metal" },
  { needle: "ferraille", family: "metal" },
  { needle: "acier", family: "metal" },
  { needle: "alu", family: "metal" },
  { needle: "plast", family: "plastic" },
  { needle: "pet", family: "plastic" },
  { needle: "pehd", family: "plastic" },
  { needle: "pvc", family: "plastic" },
  { needle: "film", family: "plastic" },
  { needle: "bouteille", family: "plastic" },
  { needle: "sachet", family: "plastic" },
  { needle: "textile", family: "textile" },
  { needle: "tissu", family: "textile" },
  { needle: "coton", family: "textile" },
  { needle: "couture", family: "textile" },
  { needle: "fibre", family: "textile" },
  { needle: "organ", family: "organic" },
  { needle: "biode", family: "organic" },
  { needle: "biod", family: "organic" },
  { needle: "dechet alimentaire", family: "organic" },
  { needle: "dechet organique", family: "organic" },
  { needle: "abattoir", family: "organic" },
  { needle: "boue", family: "organic" },
  { needle: "vidange", family: "organic" },
  { needle: "lisier", family: "organic" },
  { needle: "sang", family: "organic" },
  { needle: "compost", family: "organic" },
  { needle: "methan", family: "organic" },
  { needle: "biogaz", family: "organic" },
  { needle: "fumier", family: "organic" },
  { needle: "fiente", family: "organic" },
  { needle: "dechet vert", family: "organic" },
  { needle: "restaurant", family: "organic" },
  { needle: "cantine", family: "organic" },
  { needle: "marche", family: "organic" },
  { needle: "cuisine", family: "organic" },
  { needle: "agroaliment", family: "organic" },
  { needle: "lignocellulos", family: "industrial" },
  { needle: "biomasse", family: "industrial" },
  { needle: "bois", family: "industrial" },
  { needle: "charbon", family: "industrial" },
  { needle: "mineral", family: "industrial" },
  { needle: "industri", family: "industrial" },
  { needle: "chim", family: "industrial" },
  { needle: "residu", family: "industrial" },
  { needle: "dechet", family: "industrial" },
]

const ROUTE_HINTS = [
  { needle: "refonte", route: "refonte" },
  { needle: "ferraille", route: "ferraille" },
  { needle: "recyclage plastique", route: "plastique" },
  { needle: "plastique", route: "plastique" },
  { needle: "granulation", route: "plastique" },
  { needle: "reemploi", route: "textile" },
  { needle: "couture", route: "textile" },
  { needle: "retouche", route: "textile" },
  { needle: "effilochage", route: "textile" },
  { needle: "co-processing", route: "co-processing" },
  { needle: "co inciner", route: "co-processing" },
  { needle: "cimenterie", route: "co-processing" },
  { needle: "energie", route: "co-processing" },
  { needle: "thermique", route: "co-processing" },
  { needle: "compostage", route: "compostage" },
  { needle: "compost", route: "compostage" },
  { needle: "methanisation", route: "methanisation" },
  { needle: "biogaz", route: "methanisation" },
  { needle: "biochar", route: "biochar" },
  { needle: "boues de vidange", route: "methanisation" },
  { needle: "pave", route: "plastique" },
  { needle: "paves", route: "plastique" },
  { needle: "pe", route: "plastique" },
  { needle: "pp", route: "plastique" },
]

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function normalizeWasteType(value) {
  const raw = normalizeText(value)
  if (!raw) return "industrial"
  if (["pe", "pp", "pet", "pvc", "pehd", "polyethylene", "polypropylene"].includes(raw)) return "plastic"
  const alias = FAMILY_ALIASES.find((item) => raw.includes(item.needle))
  return alias ? alias.family : raw
}

function inferFamily(context = {}) {
  const combined = normalizeText([
    context.wasteType,
    context.type,
    context.recommendation,
    context.name,
    context.description,
  ].filter(Boolean).join(" "))
  const alias = FAMILY_ALIASES.find((item) => combined.includes(item.needle))
  return alias ? alias.family : normalizeWasteType(context.wasteType || context.type || context.name || "industrial")
}

function inferRouteFamily(context = {}) {
  const raw = normalizeText([context.recommendation, context.decision, context.route].filter(Boolean).join(" "))
  const matched = ROUTE_HINTS.find((item) => raw.includes(item.needle))
  return matched ? matched.route : raw
}

function routeMatches(routeFamily, channel) {
  const raw = normalizeText(routeFamily)
  if (!raw) return false
  return (channel.acceptedRouteHints || []).some((hint) => raw.includes(normalizeText(hint)) || normalizeText(hint).includes(raw))
}

function familyMatches(family, channel) {
  const raw = normalizeText(family)
  return (channel.acceptedFamilies || []).some((item) => normalizeText(item) === raw)
}

function scoreChannel(channel, context = {}) {
  const family = inferFamily(context)
  const routeFamily = inferRouteFamily(context)
  const quantity = Number(context.quantity || 0)
  const expectedNet = Number(channel.potential_gain_per_ton || 0) - Number(channel.estimated_cost_per_ton || 0)

  const familyMatch = familyMatches(family, channel)
  const routeMatch = routeMatches(routeFamily, channel)

  if (!familyMatch && !routeMatch) {
    return {
      ...channel,
      matched_family: family,
      matched_route: routeFamily,
      net_gain_per_ton: expectedNet,
      match_score: 0,
      match_state: "no_direct_match",
      match_reason: ["Aucun achat direct coherent pour cette filiere."],
      best_use_case: channel.type,
      family_match: false,
      route_match: false,
    }
  }

  const familyScore = familyMatch ? 100 : (channel.kind === "treatment" && routeMatch ? 55 : 20)
  const routeScore = routeMatch ? 100 : (channel.kind === "buyer" && familyMatch ? 60 : 0)
  const distanceScore = Math.max(0, 100 - Math.round(Number(channel.distance_km || 0) * 2))
  const quantityScore = quantity >= 20 ? 10 : quantity >= 5 ? 5 : 0
  const economicsScore = Math.max(0, Math.min(100, 50 + expectedNet / 3))

  const weighted = Math.round(
    familyScore * 0.42 +
    routeScore * 0.26 +
    distanceScore * 0.14 +
    economicsScore * 0.12 +
    quantityScore * 0.06,
  )

  const matchScore = familyMatch && routeMatch
    ? Math.max(weighted, 78)
    : familyMatch
      ? Math.max(weighted, channel.kind === "buyer" ? 68 : 58)
      : Math.max(weighted, 52)

  const matchReason = []
  if (familyMatch) matchReason.push(`Filiere ${family} compatible`)
  if (routeMatch) matchReason.push(`Voie ${routeFamily} coherente`)
  matchReason.push(`Distance ${Number(channel.distance_km || 0)} km`)
  if (expectedNet > 0) matchReason.push(`Net positif ${Math.round(expectedNet)} FCFA/t`)

  const directBuyer = channel.kind === "buyer" && familyMatch && matchScore >= 60
  const treatmentFallback = channel.kind === "treatment" && routeMatch && matchScore >= 55

  return {
    ...channel,
    matched_family: family,
    matched_route: routeFamily,
    net_gain_per_ton: expectedNet,
    match_score: matchScore,
    match_state: directBuyer ? "direct_buyer" : treatmentFallback ? "treatment_channel" : "fallback",
    match_reason: matchReason,
    best_use_case: channel.type,
    family_match: familyMatch,
    route_match: routeMatch,
  }
}

function rankChannels(context = {}, channels = CHANNELS) {
  const ranked = (channels || []).map((channel) => scoreChannel(channel, context))
  ranked.sort((a, b) => {
    const scoreDiff = Number(b.match_score || 0) - Number(a.match_score || 0)
    if (scoreDiff !== 0) return scoreDiff
    const kindDiff = (a.kind === "buyer" ? 1 : 0) - (b.kind === "buyer" ? 1 : 0)
    if (kindDiff !== 0) return kindDiff
    const distanceDiff = Number(a.distance_km || 0) - Number(b.distance_km || 0)
    if (distanceDiff !== 0) return distanceDiff
    return Number(b.net_gain_per_ton || 0) - Number(a.net_gain_per_ton || 0)
  })

  const relevant = ranked.filter((item) => Number(item.match_score || 0) >= 55)
  const directBuyer = relevant.find((item) => item.kind === "buyer") || null
  const treatmentChannel = relevant.find((item) => item.kind === "treatment") || null
  const best = directBuyer || treatmentChannel || null
  const alternatives = relevant.filter((item) => item.id !== best?.id).slice(0, 3)

  return {
    best,
    directBuyer,
    treatmentChannel,
    alternatives,
    all: ranked,
    hasRelevantMatch: Boolean(best),
    hasDirectBuyer: Boolean(directBuyer),
  }
}

function filterChannels(channels = CHANNELS, filters = {}) {
  const maxDistance = Number.isFinite(Number(filters.maxDistance)) ? Number(filters.maxDistance) : null
  const wasteType = inferFamily({ wasteType: filters.wasteType || filters.route || "" })

  return (channels || []).filter((channel) => {
    if (maxDistance !== null && Number(channel.distance_km || 0) > maxDistance) return false
    if (wasteType && wasteType !== "industrial") {
      const familyMatch = familyMatches(wasteType, channel)
      const routeMatch = routeMatches(wasteType, channel)
      if (!familyMatch && !routeMatch) return false
    }
    return true
  })
}

export {
  CHANNELS,
  normalizeWasteType,
  rankChannels,
  filterChannels,
  scoreChannel,
  inferFamily,
  inferRouteFamily,
}
