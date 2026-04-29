const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const FEEDBACK_DELTAS = {
  choisi: 0.1,
  choisie: 0.1,
  success: 0.2,
  succes: 0.2,
  'succès': 0.2,
  refuse: -0.1,
  'refusé': -0.1,
  refusee: -0.1,
  'refusée': -0.1,
  echec: -0.1,
  'échec': -0.1,
}

function getValue(data, field) {
  if (!field) return undefined
  if (Object.prototype.hasOwnProperty.call(data || {}, field)) return data[field]
  return String(field)
    .split('.')
    .reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), data)
}

function toNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizeFeedback(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function compare(actual, op, expected) {
  const operator = String(op || 'eq').toLowerCase().trim()
  if (operator === 'truthy' || operator === 'true') return !!actual
  if (operator === 'falsy' || operator === 'false') return !actual
  if (operator === 'between') {
    if (!Array.isArray(expected) || expected.length !== 2) return false
    return toNumber(expected[0]) <= toNumber(actual) && toNumber(actual) <= toNumber(expected[1])
  }
  if (operator === 'contains' || operator === 'icontains') {
    return String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase())
  }
  if (operator === 'in') return Array.isArray(expected) && expected.includes(actual)
  if (operator === 'not_in') return !Array.isArray(expected) || !expected.includes(actual)
  if (operator === 'eq' || operator === '==') return actual === expected
  if (operator === 'ne' || operator === '!=') return actual !== expected
  const a = toNumber(actual, Number.NaN)
  const b = toNumber(expected, Number.NaN)
  if (operator === 'le' || operator === 'lte' || operator === '<=') return a <= b
  if (operator === 'lt' || operator === '<') return a < b
  if (operator === 'ge' || operator === 'gte' || operator === '>=') return a >= b
  if (operator === 'gt' || operator === '>') return a > b
  return false
}

function matchCondition(data, condition) {
  if (!condition) return true
  if (condition.all) return condition.all.every((item) => matchCondition(data, item))
  if (condition.any) return condition.any.some((item) => matchCondition(data, item))
  if (condition.not) return !matchCondition(data, condition.not)

  const field = condition.field || condition.champ || condition.key || ''
  if (!field) return true
  const actual = getValue(data, field)
  const operator = condition.op || condition.operator || 'eq'
  const expected = Object.prototype.hasOwnProperty.call(condition, 'value') ? condition.value : condition.valeur
  return compare(actual, operator, expected)
}

function conditionPoints(item) {
  if (item && Object.prototype.hasOwnProperty.call(item, 'points')) return toNumber(item.points)
  if (item && Object.prototype.hasOwnProperty.call(item, 'then')) return toNumber(item.then)
  if (item && Object.prototype.hasOwnProperty.call(item, 'gain')) return toNumber(item.gain)
  return 0
}

function evaluateGroup(data, spec) {
  if (!spec) return { ok: true, reasons: [] }
  const reasons = []
  if (Array.isArray(spec.all)) {
    for (const item of spec.all) {
      if (!matchCondition(data, item)) return { ok: false, reasons }
      const label = item.label || item.explication || item.desc || item.reason || item.field || item.champ || ''
      if (label) reasons.push(item.points ? `${label} (+${Number(item.points).toFixed(1)})` : label)
    }
  }
  if (Array.isArray(spec.any)) {
    const matched = []
    for (const item of spec.any) {
      if (matchCondition(data, item)) {
        const label = item.label || item.explication || item.desc || item.reason || item.field || item.champ || ''
        if (label) matched.push(item.points ? `${label} (+${Number(item.points).toFixed(1)})` : label)
      }
    }
    if (matched.length === 0) return { ok: false, reasons }
    reasons.push(...matched)
  }
  return { ok: true, reasons }
}

function calculateScore(dechet = {}, filiere = {}) {
  const profile = { ...dechet }
  const kb = filiere.conditions_techniques || {}
  let score = toNumber(kb.base, toNumber(filiere.score_base, 0))
  const matched = []
  const penalties = []
  const detail = []

  for (const groupName of ['all', 'any']) {
    for (const item of kb[groupName] || []) {
      if (matchCondition(profile, item)) {
        const points = conditionPoints(item)
        score += points
        const label = item.label || item.explication || item.desc || item.reason || item.field || item.champ || ''
        if (label) matched.push(label)
        detail.push({ type: 'condition', group: groupName, label, points: Number(points.toFixed(2)) })
      }
    }
  }

  for (const item of filiere.penalites || []) {
    const spec = item.if || item.when || item.condition || item
    if (matchCondition(profile, spec)) {
      const points = conditionPoints(item)
      score += points
      const label = item.label || item.explication || item.desc || item.reason || item.field || item.champ || ''
      if (label) penalties.push(label)
      detail.push({ type: 'penalite', label, points: Number(points.toFixed(2)) })
    }
  }

  const weight = toNumber(filiere.poids, 1)
  const weightedScore = clamp(Number((score * weight).toFixed(2)), 0, 100)
  const constraints = evaluateGroup(profile, filiere.contraintes)
  const explanation = [filiere.description || filiere.nom || filiere.id || 'filiere']
  if (matched.length) explanation.push(`conditions: ${[...new Set(matched)].join('; ')}`)
  if (penalties.length) explanation.push(`penalites: ${[...new Set(penalties)].join('; ')}`)
  if (!constraints.ok && constraints.reasons.length) explanation.push(`contraintes: ${[...new Set(constraints.reasons)].join('; ')}`)

  return {
    id: filiere.id,
    nom: filiere.nom,
    type: filiere.type,
    poids: weight,
    score_brut: Number(score.toFixed(2)),
    score: weightedScore,
    matched_conditions: [...new Set(matched)],
    penalites_appliquees: [...new Set(penalties)],
    detail,
    conditions_ok: constraints.ok,
    available: constraints.ok,
    blocked_reason: constraints.ok ? null : (constraints.reasons.join('; ') || 'constrained'),
    status: constraints.ok && weightedScore >= 70 ? 'recommande' : constraints.ok ? 'non pertinent' : 'non disponible',
    explication_automatique: explanation.join(' | '),
    contraintes: structuredClone(filiere.contraintes || {}),
    description: filiere.description || '',
    filiere: structuredClone(filiere),
  }
}

function runEvaluation(dechet = {}, contraintes = null, registry = { filieres: [] }) {
  const results = (registry.filieres || []).map((filiere) => {
    const scored = calculateScore(dechet, filiere)
    if (contraintes) {
      const globalCheck = evaluateGroup(dechet, contraintes)
      if (!globalCheck.ok) {
        scored.available = false
        scored.conditions_ok = false
        scored.blocked_reason = globalCheck.reasons.join('; ') || scored.blocked_reason
        scored.status = 'non disponible'
      }
    }
    return scored
  })
  return results.sort((a, b) => b.score - a.score)
}

function updateWeights(registry, filiereId, feedback) {
  const delta = FEEDBACK_DELTAS[normalizeFeedback(feedback)]
  if (delta === undefined) throw new Error('Unsupported feedback value')
  const next = structuredClone(registry || { filieres: [] })
  const filiere = (next.filieres || []).find((item) => String(item.id || '').trim() === String(filiereId || '').trim())
  if (!filiere) throw new Error(`Filiere not found: ${filiereId}`)
  filiere.poids = Number(clamp(toNumber(filiere.poids, 1) + delta, 0.5, 2).toFixed(3))
  next.updated_at = new Date().toISOString()
  return next
}

function exportRecommendations(results = [], dechet = {}) {
  const ordered = [...results].sort((a, b) => toNumber(b.score) - toNumber(a.score))
  return {
    generated_at: new Date().toISOString(),
    input: { ...dechet },
    count: ordered.length,
    top_recommendations: ordered.slice(0, 5),
    all_recommendations: ordered,
  }
}

async function loadValorizationRegistry(endpoint = '/api/waste/valorization-filieres') {
  const response = await fetch(endpoint, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Impossible de charger le registre (${response.status})`)
  return response.json()
}

export {
  calculateScore,
  runEvaluation,
  updateWeights,
  exportRecommendations,
  loadValorizationRegistry,
}
