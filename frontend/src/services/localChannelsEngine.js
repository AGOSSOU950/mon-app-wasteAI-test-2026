const CHANNELS = [
  {
    id: 1,
    name: "CIMBENIN",
    type: "energy recovery / co-processing",
    waste_types: ["industrial waste", "sludge", "high calorific waste"],
    location: "Benin, Atlantic corridor",
    distance_km: 42,
    contact: "+229 01 40 00 00",
    estimated_cost_per_ton: 38,
    potential_gain_per_ton: 110,
  },
  {
    id: 2,
    name: "NOCIBE",
    type: "energy recovery / co-processing",
    waste_types: ["industrial waste", "sludge", "high calorific waste"],
    location: "Benin, coastal industrial zone",
    distance_km: 58,
    contact: "+229 01 41 00 00",
    estimated_cost_per_ton: 41,
    potential_gain_per_ton: 104,
  },
  {
    id: 3,
    name: "SCB - Societe des Ciments du Benin",
    type: "cement plant",
    waste_types: ["mineral waste", "industrial residues"],
    location: "Benin, Porto-Novo axis",
    distance_km: 35,
    contact: "+229 01 42 00 00",
    estimated_cost_per_ton: 35,
    potential_gain_per_ton: 88,
  },
  {
    id: 4,
    name: "FABRIMETAL BENIN",
    type: "metal recycling",
    waste_types: ["scrap metal", "steel waste"],
    location: "Cotonou industrial area",
    distance_km: 18,
    contact: "+229 01 43 00 00",
    estimated_cost_per_ton: 22,
    potential_gain_per_ton: 170,
  },
  {
    id: 5,
    name: "Valdeo",
    type: "plastic recycling",
    waste_types: ["plastic waste"],
    location: "Cotonou logistics hub",
    distance_km: 16,
    contact: "+229 01 44 00 00",
    estimated_cost_per_ton: 26,
    potential_gain_per_ton: 145,
  },
  {
    id: 6,
    name: "BlueStone Benin",
    type: "plastic recycling",
    waste_types: ["plastic waste"],
    location: "Abomey-Calavi",
    distance_km: 24,
    contact: "+229 01 45 00 00",
    estimated_cost_per_ton: 28,
    potential_gain_per_ton: 138,
  },
  {
    id: 7,
    name: "EcoPlast Benin",
    type: "plastic marketplace",
    waste_types: ["plastic waste"],
    location: "West Africa regional market",
    distance_km: 67,
    contact: "contact@ecoplast.example",
    estimated_cost_per_ton: 24,
    potential_gain_per_ton: 132,
  },
]

const TYPE_SYNONYMS = [
  { needle: "plastic", normalized: "plastic waste" },
  { needle: "plastique", normalized: "plastic waste" },
  { needle: "film pe", normalized: "plastic waste" },
  { needle: "poly", normalized: "plastic waste" },
  { needle: "metal", normalized: "scrap metal" },
  { needle: "steel", normalized: "steel waste" },
  { needle: "ferraille", normalized: "scrap metal" },
  { needle: "sludge", normalized: "sludge" },
  { needle: "boue", normalized: "sludge" },
  { needle: "organic", normalized: "sludge" },
  { needle: "organique", normalized: "sludge" },
  { needle: "mineral", normalized: "mineral waste" },
  { needle: "mineral waste", normalized: "mineral waste" },
  { needle: "industrial residue", normalized: "industrial residues" },
  { needle: "residu", normalized: "industrial residues" },
  { needle: "high calorific", normalized: "high calorific waste" },
  { needle: "calorifique", normalized: "high calorific waste" },
  { needle: "combustible", normalized: "high calorific waste" },
]

const RECOMMENDATION_MAP = [
  { match: "energy recovery", types: ["energy recovery / co-processing", "cement plant"] },
  { match: "co-processing", types: ["energy recovery / co-processing", "cement plant"] },
  { match: "cement", types: ["cement plant", "energy recovery / co-processing"] },
  { match: "plastic recycling", types: ["plastic recycling", "plastic marketplace"] },
  { match: "recyclage plastique", types: ["plastic recycling", "plastic marketplace"] },
  { match: "metal recycling", types: ["metal recycling"] },
  { match: "recyclage metal", types: ["metal recycling"] },
  { match: "compost", types: ["composting"] },
  { match: "landfill", types: ["landfill"] },
]

function normalizeText(value) {
  return String(value || "").trim().toLowerCase()
}

function normalizeWasteType(value) {
  const raw = normalizeText(value)
  if (!raw) return "industrial waste"
  const found = TYPE_SYNONYMS.find((item) => raw.includes(item.needle))
  return found ? found.normalized : raw
}

function inferRecommendationTarget(recommendation) {
  const raw = normalizeText(recommendation)
  const found = RECOMMENDATION_MAP.find((item) => raw.includes(item.match))
  return found ? found.types : []
}

function scoreChannel(channel, context = {}) {
  const wasteType = normalizeWasteType(context.wasteType || context.type || context.name)
  const recommendation = normalizeText(context.recommendation)
  const quantity = Number(context.quantity || 0)
  const channelTypes = (channel.waste_types || []).map(normalizeWasteType)
  const targetTypes = inferRecommendationTarget(recommendation)

  const wasteMatch = channelTypes.includes(wasteType) ? 52 : channelTypes.some((type) => wasteType.includes(type) || type.includes(wasteType)) ? 34 : 0
  const recommendationMatch = targetTypes.length === 0 ? 0 : targetTypes.includes(normalizeText(channel.type)) ? 30 : targetTypes.some((target) => normalizeText(channel.type).includes(target) || target.includes(normalizeText(channel.type))) ? 18 : 0
  const distanceScore = Math.max(0, 20 - Math.round(Number(channel.distance_km || 0) / 5))
  const quantityBoost = quantity >= 20 && channel.type.includes("cement") ? 8 : quantity >= 10 && channel.type.includes("recycling") ? 5 : 0
  const netGain = Number(channel.potential_gain_per_ton || 0) - Number(channel.estimated_cost_per_ton || 0)

  const score = Math.max(0, Math.round(wasteMatch + recommendationMatch + distanceScore + quantityBoost + Math.min(20, netGain / 10)))
  return {
    ...channel,
    matched_waste_type: wasteType,
    net_gain_per_ton: netGain,
    match_score: score,
    match_reason: [
      wasteMatch ? `waste type: ${wasteType}` : null,
      recommendationMatch ? `recommendation: ${recommendation}` : null,
      `distance: ${Number(channel.distance_km || 0)} km`,
    ].filter(Boolean),
    best_use_case: channel.type,
  }
}

function rankChannels(context = {}, channels = CHANNELS) {
  const ranked = (channels || []).map((channel) => scoreChannel(channel, context))
  ranked.sort((a, b) => {
    const netDiff = Number(b.net_gain_per_ton || 0) - Number(a.net_gain_per_ton || 0)
    if (netDiff !== 0) return netDiff
    const distanceDiff = Number(a.distance_km || 0) - Number(b.distance_km || 0)
    if (distanceDiff !== 0) return distanceDiff
    return Number(b.match_score || 0) - Number(a.match_score || 0)
  })

  const best = ranked[0] || null
  const alternatives = ranked.slice(1, 3)

  return {
    best,
    alternatives,
    all: ranked,
  }
}

function filterChannels(channels = CHANNELS, filters = {}) {
  const maxDistance = Number.isFinite(Number(filters.maxDistance)) ? Number(filters.maxDistance) : null
  const wasteType = normalizeWasteType(filters.wasteType || "")

  return (channels || []).filter((channel) => {
    if (maxDistance !== null && Number(channel.distance_km || 0) > maxDistance) return false
    if (wasteType) {
      const normalizedTypes = (channel.waste_types || []).map(normalizeWasteType)
      if (!normalizedTypes.includes(wasteType) && !normalizedTypes.some((type) => wasteType.includes(type) || type.includes(wasteType))) return false
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
}
