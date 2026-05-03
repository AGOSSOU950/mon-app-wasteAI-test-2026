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
    name: firstText(input.nom, source.nom_exact, source.nom, source.name, 'Dechet non precise'),
    type: firstText(input.type_dechet, input.categorie, source.type_dechet, source.type, source.categorie, source.filiere, 'Non precise'),
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
  const selectedRoute = String(result?.decision_principale || result?.decision || solutions[0] || 'voie non specifiee').trim()
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

  const html = `
    <div class="pdf-root">
      <style>
        :root { color-scheme: light; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111827; background: #fff; }
        .pdf-root { width: 100%; padding: 0; }
        .sheet { width: 100%; padding: 0; }
        .hero {
          display: flex; justify-content: space-between; gap: 12px; align-items: flex-start;
          border: 1px solid #cfcfcf; border-radius: 10px; padding: 12px 14px; margin-bottom: 10px;
        }
        .eyebrow { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: #4b5563; margin-bottom: 4px; }
        h1 { margin: 0; font-size: 18px; line-height: 1.15; }
        .subtitle { margin-top: 5px; font-size: 10.5px; color: #374151; }
        .meta { min-width: 170px; text-align: right; font-size: 9.5px; color: #374151; }
        .meta strong { display: block; color: #111827; font-size: 11px; margin-bottom: 4px; }
        .kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; }
        .kpi { border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 10px; min-height: 48px; }
        .kpi .label { font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: .05em; }
        .kpi .value { margin-top: 4px; font-size: 14px; font-weight: 700; }
        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
        .panel { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 11px; background: #fff; break-inside: avoid; page-break-inside: avoid; }
        .panel h2 { margin: 0 0 8px; font-size: 11.5px; text-transform: uppercase; letter-spacing: .06em; color: #111827; }
        .dl-grid { display: grid; grid-template-columns: 1fr; gap: 6px; font-size: 10px; }
        .dl-row { display: grid; grid-template-columns: 42% 58%; gap: 8px; align-items: start; }
        .dl-row .label { color: #6b7280; }
        .dl-row .value { color: #111827; font-weight: 600; word-break: break-word; }
        .flow { display: grid; gap: 8px; margin-bottom: 8px; }
        .route-card { border: 1px solid #d1d5db; border-radius: 8px; padding: 9px 10px; break-inside: avoid; page-break-inside: avoid; }
        .route-top { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; margin-bottom: 4px; }
        .route-title { font-size: 11px; font-weight: 700; }
        .route-score { font-size: 10px; color: #374151; }
        .route-meta { font-size: 9.5px; color: #6b7280; margin-bottom: 4px; }
        .route-text { font-size: 10px; line-height: 1.45; color: #111827; }
        .note { font-size: 9.5px; line-height: 1.45; color: #374151; }
        .section-title { margin: 0 0 8px; font-size: 11.5px; text-transform: uppercase; letter-spacing: .06em; }
        ul.clean { margin: 0; padding-left: 16px; }
        ul.clean li { margin-bottom: 4px; font-size: 10px; line-height: 1.45; }
        .stack { display: grid; gap: 8px; }
        .operators { display: grid; gap: 6px; }
        .operator { border-top: 1px solid #e5e7eb; padding-top: 6px; font-size: 10px; }
        .operator:first-child { border-top: 0; padding-top: 0; }
        .footer { margin-top: 8px; font-size: 9px; color: #6b7280; display: flex; justify-content: space-between; gap: 8px; }
        .muted { color: #6b7280; }
      </style>
      <div class="sheet">
        <div class="hero">
          <div>
            <div class="eyebrow">WasteAI - Fiche de synthèse</div>
            <h1>${escapeHtml(profile.name || 'Déchet non précisé')}</h1>
            <div class="subtitle">Voie recommandée: ${escapeHtml(formatRouteLabel(selectedRoute))}</div>
          </div>
          <div class="meta">
            <strong>Rapport généré</strong>
            <div>${escapeHtml(formatDate())}</div>
            <div>${escapeHtml(profile.type || 'Type non précisé')}</div>
            <div>${escapeHtml(formatOptionalNumber(profile.quantityKg, 'kg') || 'Quantité non précisée')}</div>
          </div>
        </div>

        <div class="kpi-grid">
          <div class="kpi"><div class="label">Valeur</div><div class="value">${escapeHtml(formatMaybeNumber(saleValue, 'FCFA/t'))}</div></div>
          <div class="kpi"><div class="label">Coût</div><div class="value">${escapeHtml(formatMaybeNumber(treatmentCost, 'FCFA/t'))}</div></div>
          <div class="kpi"><div class="label">Gain net</div><div class="value">${escapeHtml(formatMaybeNumber(industrialGainTotal, 'FCFA'))}</div></div>
          <div class="kpi"><div class="label">CO2 évité</div><div class="value">${escapeHtml(formatMaybeNumber(co2, 'kgCO2e'))}</div></div>
        </div>

        <div class="two-col">
          <div class="panel">
            <h2>Profil du flux</h2>
            <div class="dl-grid">
              <div class="dl-row"><div class="label">Déchet</div><div class="value">${escapeHtml(profile.name || 'N/R')}</div></div>
              <div class="dl-row"><div class="label">Type</div><div class="value">${escapeHtml(profile.type || 'N/R')}</div></div>
              <div class="dl-row"><div class="label">Quantité</div><div class="value">${escapeHtml(formatOptionalNumber(profile.quantityKg, 'kg') || 'N/R')}</div></div>
              <div class="dl-row"><div class="label">Humidité</div><div class="value">${escapeHtml(formatPercent(profile.humidity))}</div></div>
              <div class="dl-row"><div class="label">PCI</div><div class="value">${escapeHtml(formatMaybeNumber(profile.pci, 'MJ/kg'))}</div></div>
              <div class="dl-row"><div class="label">DCO / DBO</div><div class="value">${escapeHtml(`${formatMaybeNumber(profile.dco, 'mg/L')} / ${formatMaybeNumber(profile.dbo, 'mg/L')}`)}</div></div>
              <div class="dl-row"><div class="label">Contamination</div><div class="value">${escapeHtml(formatPercent(profile.contamination))}</div></div>
              <div class="dl-row"><div class="label">Métaux</div><div class="value">${escapeHtml(boolLabel(profile.hasMetals))}</div></div>
              <div class="dl-row"><div class="label">Chlore</div><div class="value">${escapeHtml(boolLabel(profile.hasChlorine))}</div></div>
            </div>
          </div>
          <div class="panel">
            <h2>Lecture technique</h2>
            <div class="note">${escapeHtml(whyPriority || 'Aucune justification détaillée disponible.')}</div>
            <div style="height: 8px"></div>
            <div class="note"><strong>Voie retenue:</strong> ${escapeHtml(formatRouteLabel(selectedRoute))}</div>
            <div style="height: 8px"></div>
            <div class="note"><strong>Conditions requises:</strong> ${escapeHtml(Array.isArray(conditions) ? conditions.join('; ') : String(conditions || 'Aucune'))}</div>
          </div>
        </div>

        <div class="panel" style="margin-bottom: 8px;">
          <h2 class="section-title">Voies de valorisation examinées</h2>
          <div class="flow">
            ${(routeList.length ? routeList : solutions.slice(0, 4).map((item) => ({ solution: item, score: 0, conditions: [], justification: '' }))).slice(0, 4).map((item, idx) => {
              const title = formatRouteLabel(item?.solution || item?.filiere || item?.nom || 'voie')
              const score = Number(item?.score ?? item?.global_score ?? item?.technical_score ?? 0)
              const status = String(item?.statut || item?.status || (idx === 0 ? 'Recommandée' : 'Alternative')).trim()
              const explanation = String(item?.explication || item?.pourquoi_pas_prioritaire || item?.justification || item?.technical_reason || '').trim()
              const conditionsText = Array.isArray(item?.conditions) ? item.conditions.join('; ') : String(item?.conditions || '')
              return `
                <div class="route-card">
                  <div class="route-top">
                    <div class="route-title">${escapeHtml(title)}</div>
                    <div class="route-score">${escapeHtml(Number.isFinite(score) ? `${score.toFixed(0)}/100` : 'N/R')}</div>
                  </div>
                  <div class="route-meta">${escapeHtml(status)}${conditionsText ? ` - ${escapeHtml(conditionsText)}` : ''}</div>
                  <div class="route-text">${escapeHtml(explanation || 'Aucune justification détaillée disponible.')}</div>
                </div>
              `
            }).join('')}
          </div>
        </div>

        <div class="two-col">
          <div class="panel">
            <h2>Opérateurs compatibles</h2>
            <div class="operators">
              ${(actors.length ? actors : [{ name: 'Aucun op?rateur compatible identifi?', score: 0, justification: 'Le flux n?cessite une caract?risation compl?mentaire.' }]).slice(0, 3).map((actor) => `
                <div class="operator">
                  <div><strong>${escapeHtml(actor.name || 'Opérateur')}</strong> <span class="muted">(${escapeHtml(Number.isFinite(Number(actor.score)) ? `${Math.round(Number(actor.score))}/100` : 'N/R')})</span></div>
                  <div class="muted">${escapeHtml(actor.justification || '')}</div>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="panel">
            <h2>Repères complémentaires</h2>
            <div class="stack">
              <div class="note"><strong>Gain par tonne:</strong> ${escapeHtml(formatMaybeNumber(industrialGainTon, 'FCFA/t'))}</div>
              <div class="note"><strong>ROI:</strong> ${escapeHtml(Number.isFinite(roi) ? roi.toFixed(2) : 'N/R')}</div>
              <div class="note"><strong>Hypoth?ses:</strong> ${escapeHtml(assumptions.length ? assumptions.join(' ; ') : 'Aucune hypoth?se majeure') }</div>
              <div class="note"><strong>Avertissements:</strong> ${escapeHtml(warnings.length ? warnings.join(' ; ') : 'Aucun avertissement majeur') }</div>
            </div>
          </div>
        </div>

        <div class="footer">
          <div>Document technique sobre, pagination automatique A4.</div>
          <div>WasteAI</div>
        </div>
      </div>
    </div>
  `

  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-10000px'
  container.style.top = '0'
  container.style.width = '190mm'
  container.style.background = '#fff'
  container.innerHTML = html
  document.body.appendChild(container)

  try {
    await new Promise((resolve, reject) => {
      doc.html(container, {
        x: 10,
        y: 10,
        width: 190,
        windowWidth: 1200,
        margin: [10, 10, 12, 10],
        autoPaging: 'text',
        html2canvas: {
          scale: 1.2,
          useCORS: true,
          backgroundColor: '#ffffff',
        },
        callback: () => resolve(),
        onclone: () => {},
      })
    })
    doc.save(filename)
  } catch (error) {
    throw error
  } finally {
    container.remove()
  }
}
