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
  if (!Number.isFinite(n)) return ''
  return String(Math.round(n))
}

function formatOptionalNumber(value, unit = '') {
  if (value === null || value === undefined || value === '') return ''
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  const formatted = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n)
  return unit ? `${formatted} ${unit}` : formatted
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

function firstOptionalNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatPercent(value) {
  if (value === null || value === undefined || value === '') return 'N/R'
  const n = Number(value)
  if (!Number.isFinite(n)) return 'N/R'
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n)} %`
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return 0
}

function formatMaybeNumber(value, unit = '') {
  if (value === null || value === undefined || value === '') return 'N/R'
  const n = Number(value)
  if (!Number.isFinite(n)) return 'N/R'
  const text = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n)
  return unit ? `${text} ${unit}` : text
}

function listText(items) {
  return uniq(items).filter(Boolean)
}

function splitLines(doc, text, width) {
  return doc.splitTextToSize(String(text || ''), width)
}

function buildWasteProfile(result = {}, form = {}) {
  const source = result || {}
  const input = form || {}
  return {
    name: firstText(input.nom, source.nom_exact, source.nom, source.name, 'Déchet non précisé'),
    type: firstText(input.type_dechet, input.categorie, source.type_dechet, source.type, source.categorie, source.filiere, 'Non précisé'),
    quantityKg: firstOptionalNumber(input.quantite_kg, source.quantite_kg, source.quantity_kg, source.quantity),
    humidity: firstOptionalNumber(input.taux_humidite_pct, source.taux_humidite_pct, source.humidity),
    pci: firstOptionalNumber(input.pci_mj_kg, source.pci_mj_kg, source.PCI),
    dco: firstOptionalNumber(input.dco_mg_l, source.dco_mg_l, source.DCO),
    dbo: firstOptionalNumber(input.dbo_mg_l, source.dbo_mg_l, source.DBO),
    contamination: firstOptionalNumber(input.taux_contamination_pct, source.taux_contamination_pct, source.contamination),
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
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
  const profile = buildWasteProfile(result || {}, form || {})
  const solutions = extractSolutions(result || {})
  const actors = rankActors(profile, solutions)
  const whyPriority = String(result?.explication_détaillée || result?.explication || result?.justification_technique || result?.resume_choix || '').trim()
  const selectedRoute = String(result?.decision_principale || result?.decision || solutions[0] || 'voie non spécifiée').trim()
  const routeList = Array.isArray(result?.scores_par_voie) ? result.scores_par_voie : []
  const warnings = listText([
    result?.avertissements,
    ...(Array.isArray(result?.hypotheses_utilisees) ? result.hypotheses_utilisees : []),
    ...(Array.isArray(result?.donnees_manquantes_critiques) ? result.donnees_manquantes_critiques : []),
  ])
  const assumptions = listText(Array.isArray(result?.hypotheses_utilisees) ? result.hypotheses_utilisees : [])
  const conditions = listText((Array.isArray(result?.conditions_requises) ? result.conditions_requises : String(result?.conditions_requises || '').split(/;\s*/)).filter(Boolean))

  const saleValue = firstFiniteNumber(
    result?.valeur_estimee_fcfa_tonne,
    result?.details_scores_bruts?.market_value_fcfa_tonne,
    result?.details_scores_bruts?.market_value_fcfa,
  )
  const treatmentCost = firstFiniteNumber(
    result?.cout_estime_fcfa_tonne,
    result?.details_scores_bruts?.treatment_cost_fcfa_tonne,
    result?.details_scores_bruts?.treatment_cost_fcfa,
  )
  const industrialGainTotal = firstFiniteNumber(result?.gain_industriel_fcfa, result?.details_scores_bruts?.gain_industriel_fcfa)
  const industrialGainTon = firstFiniteNumber(result?.gain_industriel_fcfa_tonne, result?.details_scores_bruts?.gain_industriel_fcfa_tonne)
  const roi = firstFiniteNumber(result?.score_global, result?.details_scores_bruts?.roi)
  const co2 = firstFiniteNumber(result?.co2_evite_estime_kg, result?.impact_co2_kg, result?.impact_environnemental?.bilan_net_recommande_kgco2e)

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 12
  const marginTop = 10
  const marginBottom = 10
  const gap = 4
  const contentWidth = pageWidth - marginX * 2
  const colGap = 4
  const halfWidth = (contentWidth - colGap) / 2

  function setFont(size, style = 'normal') {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
  }

  function drawBox(x, y, w, h, options = {}) {
    const fill = options.fill || [255, 255, 255]
    const stroke = options.stroke || [210, 214, 220]
    doc.setFillColor(fill[0], fill[1], fill[2])
    doc.setDrawColor(stroke[0], stroke[1], stroke[2])
    doc.roundedRect(x, y, w, h, 2, 2, 'FD')
  }

  function clampLines(text, width, maxLines = 4) {
    const lines = splitLines(doc, String(text || '').trim(), width)
    if (lines.length <= maxLines) return lines
    const clipped = lines.slice(0, maxLines)
    clipped[maxLines - 1] = `${String(clipped[maxLines - 1] || '').replace(/[\s.]+$/, '')}...`
    return clipped
  }

  function drawWrappedText(text, x, y, width, options = {}) {
    const fontSize = options.fontSize || 9
    const lineHeight = options.lineHeight || fontSize * 0.42 + 3
    const maxLines = options.maxLines || 99
    const style = options.style || 'normal'
    const color = options.color || [17, 24, 39]
    const lines = clampLines(text, width, maxLines)
    doc.setTextColor(color[0], color[1], color[2])
    setFont(fontSize, style)
    doc.text(lines, x, y)
    return y + lines.length * lineHeight
  }

  function drawLabelValue(x, y, label, value, width, options = {}) {
    const labelWidth = options.labelWidth || Math.min(34, width * 0.42)
    const valueWidth = Math.max(10, width - labelWidth - 2)
    const lineHeight = options.lineHeight || 4.2
    const labelSize = options.labelSize || 8.2
    const valueSize = options.valueSize || 8.8
    setFont(labelSize, 'bold')
    doc.setTextColor(110, 118, 129)
    doc.text(String(label), x, y)
    setFont(valueSize, 'normal')
    doc.setTextColor(17, 24, 39)
    const lines = clampLines(value, valueWidth, options.maxLines || 2)
    doc.text(lines, x + labelWidth, y)
    return y + Math.max(lineHeight, lines.length * lineHeight)
  }

  function drawMetric(x, y, w, title, value) {
    drawBox(x, y, w, 18, { fill: [250, 250, 250] })
    setFont(7.6, 'bold')
    doc.setTextColor(110, 118, 129)
    doc.text(title, x + 3, y + 5)
    setFont(10.8, 'bold')
    doc.setTextColor(17, 24, 39)
    doc.text(String(value || 'N/R'), x + 3, y + 12.3)
  }

  function drawSectionTitle(x, y, w, title) {
    setFont(8.2, 'bold')
    doc.setTextColor(45, 55, 72)
    doc.text(String(title), x, y)
    doc.setDrawColor(220, 224, 229)
    doc.line(x, y + 1.8, x + w, y + 1.8)
  }

  const title = profile.name || 'Déchet non précisé'
  const routeLabel = formatRouteLabel(selectedRoute)
  const generatedAt = formatDate()
  const typeLabel = profile.type || 'Type non précisé'
  const quantityLabel = formatOptionalNumber(profile.quantityKg, 'kg') || 'Quantité non précisée'
  const dcoDbo = `${formatMaybeNumber(profile.dco, 'mg/L')} / ${formatMaybeNumber(profile.dbo, 'mg/L')}`
  const routeRows = (routeList.length ? routeList : solutions.slice(0, 3).map((item) => ({ solution: item, score: 0, status: 'Alternative', explication: '' }))).slice(0, 3)
  const actorRows = (actors.length ? actors : [{ name: 'Opérateur à confirmer', score: 0, justification: 'Flux à caractériser plus finement.' }]).slice(0, 3)

  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, pageWidth, pageHeight, 'F')

  let y = marginTop

  drawBox(marginX, y, contentWidth, 22, { fill: [248, 248, 248] })
  setFont(8, 'bold')
  doc.setTextColor(110, 118, 129)
  doc.text('WasteAI - Fiche de synthèse', marginX + 3, y + 5)
  setFont(16, 'bold')
  doc.setTextColor(17, 24, 39)
  doc.text(title, marginX + 3, y + 12.5)
  setFont(8.8, 'normal')
  doc.setTextColor(55, 65, 81)
  doc.text(`Voie recommandée: ${routeLabel}`, marginX + 3, y + 18.2)
  setFont(8.4, 'normal')
  const metaX = marginX + contentWidth - 64
  doc.text('Rapport généré', metaX, y + 5)
  doc.setFont('helvetica', 'bold')
  doc.text(generatedAt, metaX, y + 9.4)
  doc.setFont('helvetica', 'normal')
  doc.text(typeLabel, metaX, y + 13.8)
  doc.text(quantityLabel, metaX, y + 18.2)

  y += 26

  const metricWidth = (contentWidth - 3 * gap) / 4
  drawMetric(marginX, y, metricWidth, 'Valeur', formatMaybeNumber(saleValue, 'FCFA/t'))
  drawMetric(marginX + metricWidth + gap, y, metricWidth, 'Coût', formatMaybeNumber(treatmentCost, 'FCFA/t'))
  drawMetric(marginX + (metricWidth + gap) * 2, y, metricWidth, 'Gain net', formatMaybeNumber(industrialGainTotal, 'FCFA'))
  drawMetric(marginX + (metricWidth + gap) * 3, y, metricWidth, 'CO2 évité', formatMaybeNumber(co2, 'kgCO2e'))

  y += 22

  const profileHeight = 67
  drawBox(marginX, y, halfWidth, profileHeight)
  drawBox(marginX + halfWidth + colGap, y, halfWidth, profileHeight)
  drawSectionTitle(marginX + 3, y + 6, halfWidth - 6, 'Profil du flux')
  drawSectionTitle(marginX + halfWidth + colGap + 3, y + 6, halfWidth - 6, 'Lecture technique')

  let leftY = y + 11
  leftY = drawLabelValue(marginX + 3, leftY, 'Déchet', profile.name || 'N/R', halfWidth - 6, { maxLines: 2 })
  leftY = drawLabelValue(marginX + 3, leftY, 'Type', profile.type || 'N/R', halfWidth - 6, { maxLines: 2 })
  leftY = drawLabelValue(marginX + 3, leftY, 'Quantité', formatOptionalNumber(profile.quantityKg, 'kg') || 'N/R', halfWidth - 6)
  leftY = drawLabelValue(marginX + 3, leftY, 'Humidité', formatPercent(profile.humidity), halfWidth - 6)
  leftY = drawLabelValue(marginX + 3, leftY, 'PCI', formatMaybeNumber(profile.pci, 'MJ/kg'), halfWidth - 6)
  leftY = drawLabelValue(marginX + 3, leftY, 'DCO / DBO', dcoDbo, halfWidth - 6, { maxLines: 1 })
  leftY = drawLabelValue(marginX + 3, leftY, 'Contamination', formatPercent(profile.contamination), halfWidth - 6)
  leftY = drawLabelValue(marginX + 3, leftY, 'Métaux', boolLabel(profile.hasMetals), halfWidth - 6)
  drawLabelValue(marginX + 3, leftY, 'Chlore', boolLabel(profile.hasChlorine), halfWidth - 6)

  let rightY = y + 11
  rightY = drawWrappedText(whyPriority || 'Aucune justification détaillée disponible.', marginX + halfWidth + colGap + 3, rightY, halfWidth - 6, { fontSize: 8.6, lineHeight: 3.9, maxLines: 7 })
  rightY += 1.5
  rightY = drawLabelValue(marginX + halfWidth + colGap + 3, rightY, 'Voie retenue', routeLabel, halfWidth - 6, { maxLines: 2 })
  rightY = drawLabelValue(marginX + halfWidth + colGap + 3, rightY, 'Conditions', conditions.length ? conditions.join(' ; ') : 'Aucune condition explicite', halfWidth - 6, { maxLines: 3 })

  y += profileHeight + 4

  drawBox(marginX, y, contentWidth, 58)
  drawSectionTitle(marginX + 3, y + 6, contentWidth - 6, 'Voies de valorisation examinées')
  routeRows.forEach((item, idx) => {
    const titleText = formatRouteLabel(item?.solution || item?.filiere || item?.nom || 'voie')
    const score = Number(item?.score ?? item?.global_score ?? item?.technical_score ?? 0)
    const status = String(item?.statut || item?.status || (idx === 0 ? 'Recommandée' : 'Alternative')).trim()
    const explanation = String(item?.explication || item?.pourquoi_pas_prioritaire || item?.justification || item?.technical_reason || '').trim()
    const conditionsText = Array.isArray(item?.conditions) ? item.conditions.join(' ; ') : String(item?.conditions || '')
    const rowY = y + 11 + idx * 14.6
    drawBox(marginX + 3, rowY, contentWidth - 6, 13.2, { fill: [252, 252, 252] })
    setFont(9.2, 'bold')
    doc.setTextColor(17, 24, 39)
    doc.text(titleText, marginX + 5, rowY + 4.6)
    setFont(8, 'normal')
    doc.setTextColor(75, 85, 99)
    doc.text(`${status} - ${Number.isFinite(score) ? `${score.toFixed(0)}/100` : 'N/R'}`, marginX + 5, rowY + 8.4)
    const rightText = [conditionsText, explanation || 'Aucune justification détaillée disponible.'].filter(Boolean).join(' | ')
    const lines = clampLines(rightText, contentWidth - 68, 2)
    setFont(8, 'normal')
    doc.text(lines, marginX + 55, rowY + 4.6)
  })

  y += 62

  drawBox(marginX, y, halfWidth, 48)
  drawBox(marginX + halfWidth + colGap, y, halfWidth, 48)
  drawSectionTitle(marginX + 3, y + 6, halfWidth - 6, 'Opérateurs compatibles')
  drawSectionTitle(marginX + halfWidth + colGap + 3, y + 6, halfWidth - 6, 'Repères complémentaires')

  actorRows.forEach((actor, idx) => {
    const lineY = y + 11 + idx * 10.8
    setFont(8.6, 'bold')
    doc.setTextColor(17, 24, 39)
    doc.text(String(actor.name || 'Opérateur'), marginX + 3, lineY)
    setFont(7.8, 'normal')
    doc.setTextColor(75, 85, 99)
    doc.text(`(${Number.isFinite(Number(actor.score)) ? `${Math.round(Number(actor.score))}/100` : 'N/R'})`, marginX + 43, lineY)
    const lines = clampLines(actor.justification || '', halfWidth - 14, 1)
    doc.text(lines, marginX + 3, lineY + 4)
  })

  const noteX = marginX + halfWidth + colGap + 3
  let noteY = y + 11
  noteY = drawLabelValue(noteX, noteY, 'Gain/t', formatMaybeNumber(industrialGainTon, 'FCFA/t'), halfWidth - 6)
  noteY = drawLabelValue(noteX, noteY, 'ROI', Number.isFinite(roi) ? roi.toFixed(2) : 'N/R', halfWidth - 6)
  noteY = drawLabelValue(noteX, noteY, 'Hypothèses', assumptions.length ? assumptions.join(' ; ') : 'Aucune hypothèse majeure', halfWidth - 6, { maxLines: 2 })
  drawLabelValue(noteX, noteY, 'Avertissements', warnings.length ? warnings.join(' ; ') : 'Aucun avertissement majeur', halfWidth - 6, { maxLines: 2 })

  drawBox(marginX, pageHeight - marginBottom - 8, contentWidth, 8, { fill: [245, 245, 245] })
  setFont(7.8, 'normal')
  doc.setTextColor(107, 114, 128)
  doc.text('Document technique sobre, mise en page A4 fixe.', marginX + 3, pageHeight - marginBottom - 3)
  doc.text('WasteAI', marginX + contentWidth - 14, pageHeight - marginBottom - 3)

  doc.save(filename)
}