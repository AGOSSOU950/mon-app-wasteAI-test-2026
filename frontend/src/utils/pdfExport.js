import { CHANNELS, rankChannels } from "../services/localChannelsEngine.js"

function formatDate(value = new Date()) {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(value)
}

function money(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n === 0) return '0'
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n)
}

function plainQuantity(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n === 0) return '0'
  return String(Math.round(n))
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function uniq(items) {
  const out = []
  for (const item of items) {
    const text = String(item || '').trim()
    if (text && !out.includes(text)) out.push(text)
  }
  return out
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value || '').trim()
    if (text) return text
  }
  return ''
}

function firstNumber(...values) {
  for (const value of values) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return 0
}

function boolLabel(value) {
  if (value === true) return 'Oui'
  if (value === false) return 'Non'
  return 'N/R'
}

function coerceBoolean(...values) {
  for (const value of values) {
    if (value === true || value === false) return value
    if (value === null || value === undefined || value === '') continue
    const normalized = String(value).trim().toLowerCase()
    if (['true', '1', 'oui', 'yes'].includes(normalized)) return true
    if (['false', '0', 'non', 'no'].includes(normalized)) return false
  }
  return null
}

function splitLines(doc, text, width) {
  return doc.splitTextToSize(String(text || ''), width)
}

function buildWasteProfile(result = {}, form = {}) {
  const source = result || {}
  const input = form || {}
  return {
    name: firstText(input.nom, source.nom_exact, source.nom, source.name, 'Dechet non precise'),
    type: firstText(input.type_dechet, input.categorie, source.type_dechet, source.type, source.categorie, source.filiere, 'Non precise'),
    quantityKg: firstNumber(input.quantite_kg, source.quantite_kg, source.quantity_kg, source.quantity),
    humidity: firstNumber(input.taux_humidite_pct, source.taux_humidite_pct, source.humidity),
    pci: firstNumber(input.pci_mj_kg, source.pci_mj_kg, source.PCI),
    dco: firstNumber(input.dco_mg_l, source.dco_mg_l, source.DCO),
    dbo: firstNumber(input.dbo_mg_l, source.dbo_mg_l, source.DBO),
    contamination: firstNumber(input.taux_contamination_pct, source.taux_contamination_pct, source.contamination),
    hasMetals: coerceBoolean(input.presence_metaux_lourds, input.contient_metaux, source.presence_metaux_lourds, source.hasMetals, source.contient_metaux),
    hasChlorine: coerceBoolean(input.presence_chlore, source.presence_chlore, source.hasChlorine),
  }
}

function extractSolutions(result = {}) {
  const raw = [
    result.decision_principale,
    result.decision,
    result.mode_valorisation_propose,
    result?.valorisation_1?.methode,
    result?.valorisation_2?.methode,
    result?.resume_choix,
    ...(Array.isArray(result.scores_par_voie) ? result.scores_par_voie.map((item) => item?.solution || item?.filiere || item?.nom) : []),
    ...(Array.isArray(result.classement_filieres) ? result.classement_filieres.map((item) => item?.solution || item?.filiere || item?.nom) : []),
    ...(Array.isArray(result.alternatives) ? result.alternatives.map((item) => item?.solution || item?.filiere || item?.nom) : []),
  ]
  return uniq(raw).slice(0, 5)
}

function normalizeRoute(value) {
  const raw = normalizeText(value)
  if (!raw) return ''
  if (raw.includes('methan') || raw.includes('biogaz')) return 'methanisation'
  if (raw.includes('compost')) return 'compostage'
  if (raw.includes('energet') || raw.includes('inciner') || raw.includes('ciment')) return 'valorisation energetique'
  if (raw.includes('recycl') || raw.includes('mati')) return 'recyclage matiere'
  if (raw.includes('elim') || raw.includes('depot')) return 'elimination securisee'
  return raw
}

function inferFamily(profile) {
  const merged = normalizeText([profile.name, profile.type].join(' '))
  if (merged.includes('abattoir') || merged.includes('organ') || merged.includes('biod') || merged.includes('aliment') || merged.includes('boue') || merged.includes('fumier') || merged.includes('lisier')) return 'organic'
  if (merged.includes('plast')) return 'plastic'
  if (merged.includes('textile') || merged.includes('fibre')) return 'textile'
  if (merged.includes('metal') || merged.includes('ferraille') || merged.includes('alu')) return 'metal'
  if (merged.includes('papier') || merged.includes('carton')) return 'paper'
  return 'industrial'
}

function actorTypeMatches(actor, route) {
  const normalizedRoute = normalizeRoute(route)
  const raw = normalizeText([actor.type, ...(actor.technologies || []), ...(actor.specialties || [])].join(' '))
  if (!normalizedRoute) return false
  if (normalizedRoute === 'methanisation') return raw.includes('methan') || raw.includes('biogaz') || raw.includes('compost')
  if (normalizedRoute === 'compostage') return raw.includes('compost') || raw.includes('biogaz') || raw.includes('methan')
  if (normalizedRoute === 'valorisation energetique') return raw.includes('biochar') || raw.includes('energet') || raw.includes('therm') || raw.includes('biogaz')
  if (normalizedRoute === 'recyclage matiere') return raw.includes('recycl') || raw.includes('pave') || raw.includes('plast') || raw.includes('metal')
  if (normalizedRoute === 'elimination securisee') return raw.includes('elim') || raw.includes('neutralis') || raw.includes('traitement')
  return raw.includes(normalizedRoute)
}

function familyMatches(actor, family) {
  return (actor.acceptedWaste || []).some((item) => normalizeText(item) === normalizeText(family))
}

function actorAllowedByWaste(actor, waste) {
  if (!actor?.constraints) return true
  const { maxContamination, requiresLowMetals, requiresLowChlorine, maxHumidity } = actor.constraints
  if (Number.isFinite(Number(maxContamination)) && waste.contamination > Number(maxContamination)) return false
  if (Number.isFinite(Number(maxHumidity)) && waste.humidity > Number(maxHumidity)) return false
  if (requiresLowMetals && waste.hasMetals) return false
  if (requiresLowChlorine && waste.hasChlorine) return false
  return true
}

function scoreActor(actor, profile, solutions) {
  const family = inferFamily(profile)
  const normalizedSolutions = solutions.map(normalizeRoute)
  const primary = normalizedSolutions[0] || ''
  const secondary = normalizedSolutions[1] || ''
  const typeMatch = actorTypeMatches(actor, primary)
  const altMatch = secondary ? actorTypeMatches(actor, secondary) : false
  const familyMatch = familyMatches(actor, family)

  if (!actorAllowedByWaste(actor, profile)) return null

  let score = 0
  if (familyMatch) score += 35
  if (typeMatch) score += 50
  if (altMatch) score += 20
  if (Number(actor.priority || 0) >= 8) score += 10
  if (profile.humidity >= 60 && normalizeRoute(primary) === 'methanisation') score += 10
  if (profile.pci >= 10 && normalizeRoute(primary) === 'valorisation energetique') score += 10
  if (profile.hasMetals && normalizeText(actor.type).includes('metal')) score += 10
  if (profile.hasChlorine && !actor.constraints?.requiresLowChlorine) score += 5

  const reasons = []
  if (typeMatch) reasons.push(`Compatible avec ${primary || 'la voie principale'}`)
  if (altMatch) reasons.push(`Alternative coherente avec ${secondary}`)
  if (familyMatch) reasons.push(`Famille ${family} acceptee`)
  if (Number(actor.priority || 0) >= 8) reasons.push('Priorite locale elevee')
  if (profile.contamination > 60) reasons.push('Prettraitement requis avant envoi')
  if (profile.humidity > 70) reasons.push('Humidite elevee a surveiller')

  return {
    name: actor.name,
    score: Math.min(100, score),
    justification: reasons.length ? reasons.join(', ') : 'Compatible sous reserve des contraintes du flux',
  }
}

function rankActors(profile, solutions) {
  const context = {
    name: profile.name,
    quantity: profile.quantityKg,
    recommendation: solutions[0] || '',
    wasteType: profile.type,
    type: profile.type,
  }

  const ranked = rankChannels(context, CHANNELS)
  const ordered = [ranked.best, ranked.directBuyer, ranked.treatmentChannel, ...(ranked.alternatives || []), ...(ranked.all || [])]
    .filter(Boolean)
    .reduce((acc, item) => {
      if (!acc.some((existing) => existing.id === item.id)) acc.push(item)
      return acc
    }, [])

  return ordered.slice(0, 3).map((item) => ({
    name: item.name,
    score: Number(item.match_score || 0),
    justification: (item.match_reason || []).slice(0, 3).join(', ') || 'Compatible avec le flux et les contraintes locales',
  }))
}

function formatRouteLabel(route) {
  const normalized = normalizeRoute(route)
  if (normalized === 'methanisation') return 'Methanisation'
  if (normalized === 'compostage') return 'Compostage'
  if (normalized === 'valorisation energetique') return 'Valorisation energetique'
  if (normalized === 'recyclage matiere') return 'Recyclage matiere'
  if (normalized === 'elimination securisee') return 'Elimination securisee'
  return route
}

function drawSectionTitle(doc, text, x, y, width) {
  doc.setFillColor(18, 83, 61)
  doc.roundedRect(x, y - 4, width, 8, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(text, x + 3, y + 1.5)
  doc.setTextColor(17, 24, 39)
}

function drawKeyValueList(doc, items, x, y, width, lineHeight = 5.2) {
  let cursorY = y
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  items.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold')
    doc.text(`${label}:`, x, cursorY)
    doc.setFont('helvetica', 'normal')
    const lines = splitLines(doc, String(value ?? 'N/R'), width - 35)
    doc.text(lines, x + 34, cursorY)
    cursorY += Math.max(lineHeight, lines.length * 4.2)
  })
  return cursorY
}

function drawBullets(doc, bullets, x, y, width, maxItems = 3) {
  let cursorY = y
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  bullets.slice(0, maxItems).forEach((bullet) => {
    const lines = splitLines(doc, bullet, width - 4)
    doc.text(`- ${lines[0] || ''}`, x, cursorY)
    if (lines.length > 1) {
      doc.text(lines.slice(1), x + 4, cursorY + 4)
      cursorY += 4 * lines.length
    } else {
      cursorY += 4.8
    }
  })
  return cursorY
}

export async function exportWasteResultPdf({ sourceId = 'results', result, form, filename = 'wasteai-resultats.pdf' } = {}) {
  const source = document.getElementById(sourceId)
  if (!source && !result && !form) {
    throw new Error('Aucun resultat a exporter.')
  }

  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const profile = buildWasteProfile(result || {}, form || {})
  const solutions = extractSolutions(result || {})
  const actors = rankActors(profile, solutions)
  const marginX = 12
  const pageWidth = 210
  const contentWidth = pageWidth - marginX * 2
  const rightColX = 110
  const leftColWidth = 86
  const rightColWidth = 88
  let y = 12

  doc.setFillColor(15, 61, 46)
  doc.roundedRect(marginX, y, contentWidth, 22, 4, 4, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('WasteAI - Fiche de synthese', marginX + 5, y + 8)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Genere le ${formatDate()}`, marginX + 5, y + 15)
  doc.text('Rapport technique d une page', marginX + 120, y + 15)
  y += 28

  drawSectionTitle(doc, 'Dechet', marginX, y, leftColWidth)
  drawSectionTitle(doc, 'Proprietes physicochimiques', rightColX, y, rightColWidth)
  y += 8

  const leftEndY = drawKeyValueList(doc, [
    ['Nom', profile.name],
    ['Type', profile.type],
    ['Quantite', `${plainQuantity(profile.quantityKg)} kg`],
  ], marginX, y, leftColWidth)

  const rightEndY = drawKeyValueList(doc, [
    ['Humidite', `${profile.humidity || 0}%`],
    ['PCI', `${profile.pci || 0} MJ/kg`],
    ['DCO', `${profile.dco || 0} mg/L`],
    ['DBO', `${profile.dbo || 0} mg/L`],
    ['Contamination', `${profile.contamination || 0}%`],
    ['Metaux', boolLabel(profile.hasMetals)],
    ['Chlore', boolLabel(profile.hasChlorine)],
  ], rightColX, y, rightColWidth)

  y = Math.max(leftEndY, rightEndY) + 4

  drawSectionTitle(doc, 'Voies de valorisation retenues', marginX, y, contentWidth)
  y += 8
  const routeBullets = uniq([
    ...solutions.slice(0, 4).map(formatRouteLabel),
    firstText(result?.resume_choix, result?.resume, result?.explication),
  ]).slice(0, 4)
  y = drawBullets(doc, routeBullets.map((item) => (item.includes(':') ? item : `Voie retenue: ${item}`)), marginX, y, contentWidth, 4) + 1

  drawSectionTitle(doc, 'Operateurs locaux compatibles', marginX, y, contentWidth)
  y += 8
  if (actors.length > 0) {
    actors.forEach((actor, index) => {
      const cardY = y
      const cardHeight = index === 0 ? 18 : 15
      doc.setFillColor(index === 0 ? 237 : 248, index === 0 ? 251 : 248, index === 0 ? 245 : 250)
      doc.setDrawColor(index === 0 ? 110 : 217, index === 0 ? 231 : 230, index === 0 ? 193 : 219)
      doc.roundedRect(marginX, cardY, contentWidth, cardHeight, 3, 3, 'FD')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9.5)
      doc.text(actor.name, marginX + 3, cardY + 5)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.text(`${Math.round(actor.score)}/100`, marginX + contentWidth - 15, cardY + 5)
      const wrapped = splitLines(doc, actor.justification, contentWidth - 6)
      doc.text(wrapped.slice(0, 2), marginX + 3, cardY + 10)
      y += cardHeight + 2
    })
  } else {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text('Aucun operateur local compatible identifie.', marginX, y)
    y += 6
  }

  const footerY = 286
  doc.setDrawColor(220, 228, 222)
  doc.line(marginX, footerY - 5, pageWidth - marginX, footerY - 5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(107, 114, 128)
  doc.text(`CO2 evite estime: ${money(result?.co2_evite_estime_kg || result?.impact_co2_kg || result?.impact_environnemental?.bilan_net_recommande_kgco2e || 0)} kgCO2e`, marginX, footerY)
  const cost = firstNumber(result?.cout_estime_fcfa_tonne, result?.details_scores_bruts?.treatment_cost_fcfa_tonne, result?.details_scores_bruts?.treatment_cost_fcfa)
  doc.text(`Cout estime: ${money(cost)} FCFA/t`, marginX + 70, footerY)
  doc.text('WasteAI', pageWidth - marginX - 16, footerY, { align: 'right' })

  doc.save(filename)
}
