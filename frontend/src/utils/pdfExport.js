import { jsPDF } from "jspdf"
import { CHANNELS, rankChannels } from "../services/localChannelsEngine.js"

function formatDate(value = new Date()) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(value)
}

function formatOptionalNumber(value, unit = "") {
  if (value === null || value === undefined || value === "") return ""
  const n = Number(value)
  if (!Number.isFinite(n)) return ""
  const formatted = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n)
  return unit ? `${formatted} ${unit}` : formatted
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function uniq(items) {
  const out = []
  for (const item of items) {
    const text = String(item || "").trim()
    if (text && !out.includes(text)) out.push(text)
  }
  return out
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value || "").trim()
    if (text) return text
  }
  return ""
}

function firstOptionalNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

function boolLabel(value) {
  if (value === true) return "Oui"
  if (value === false) return "Non"
  return "N/R"
}

function coerceBoolean(...values) {
  for (const value of values) {
    if (value === true || value === false) return value
    if (value === null || value === undefined || value === "") continue
    const normalized = String(value).trim().toLowerCase()
    if (["true", "1", "oui", "yes"].includes(normalized)) return true
    if (["false", "0", "non", "no"].includes(normalized)) return false
  }
  return null
}

function formatPercent(value) {
  if (value === null || value === undefined || value === "") return "N/R"
  const n = Number(value)
  if (!Number.isFinite(n)) return "N/R"
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n)} %`
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return 0
}

function formatMaybeNumber(value, unit = "") {
  if (value === null || value === undefined || value === "") return "N/R"
  const n = Number(value)
  if (!Number.isFinite(n)) return "N/R"
  const text = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n)
  return unit ? `${text} ${unit}` : text
}

function listText(items) {
  return uniq(items).filter(Boolean)
}

function clampText(text, max = 2) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, max)
    .join(" ")
}

function buildWasteProfile(result = {}, form = {}) {
  const source = result || {}
  const input = form || {}
  return {
    name: firstText(input.nom, source.nom_exact, source.nom, source.name, "Déchet non précisé"),
    type: firstText(input.type_dechet, input.categorie, source.type_dechet, source.type, source.categorie, source.filiere, "Non précisé"),
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
  if (!raw) return ""
  if (raw.includes("methan") || raw.includes("biogaz")) return "methanisation"
  if (raw.includes("compost")) return "compostage"
  if (raw.includes("energet") || raw.includes("inciner") || raw.includes("ciment")) return "valorisation energetique"
  if (raw.includes("recycl") || raw.includes("mati")) return "recyclage matiere"
  if (raw.includes("elim") || raw.includes("depot")) return "elimination securisee"
  return raw
}

function inferFamily(profile) {
  const merged = normalizeText([profile.name, profile.type].join(" "))
  if (merged.includes("abattoir") || merged.includes("organ") || merged.includes("biod") || merged.includes("aliment") || merged.includes("boue") || merged.includes("fumier") || merged.includes("lisier")) return "organic"
  if (merged.includes("plast")) return "plastic"
  if (merged.includes("textile") || merged.includes("fibre")) return "textile"
  if (merged.includes("metal") || merged.includes("ferraille") || merged.includes("alu")) return "metal"
  if (merged.includes("papier") || merged.includes("carton")) return "paper"
  return "industrial"
}

function actorTypeMatches(actor, route) {
  const normalizedRoute = normalizeRoute(route)
  const raw = normalizeText([actor.type, ...(actor.technologies || []), ...(actor.specialties || [])].join(" "))
  if (!normalizedRoute) return false
  if (normalizedRoute === "methanisation") return raw.includes("methan") || raw.includes("biogaz") || raw.includes("compost")
  if (normalizedRoute === "compostage") return raw.includes("compost") || raw.includes("biogaz") || raw.includes("methan")
  if (normalizedRoute === "valorisation energetique") return raw.includes("biochar") || raw.includes("energet") || raw.includes("therm") || raw.includes("biogaz")
  if (normalizedRoute === "recyclage matiere") return raw.includes("recycl") || raw.includes("pave") || raw.includes("plast") || raw.includes("metal")
  if (normalizedRoute === "elimination securisee") return raw.includes("elim") || raw.includes("neutralis") || raw.includes("traitement")
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

function rankActors(profile, solutions) {
  const context = {
    name: profile.name,
    quantity: profile.quantityKg,
    recommendation: solutions[0] || "",
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
    justification: (item.match_reason || []).slice(0, 3).join(", ") || "Compatible avec le flux et les contraintes locales",
  }))
}

function formatRouteLabel(route) {
  const normalized = normalizeRoute(route)
  if (normalized === "methanisation") return "Méthanisation"
  if (normalized === "compostage") return "Compostage"
  if (normalized === "valorisation energetique") return "Valorisation énergétique"
  if (normalized === "recyclage matiere") return "Recyclage matière"
  if (normalized === "elimination securisee") return "Élimination sécurisée"
  return route
}

function confidenceStatus(confidence) {
  const c = Number(confidence || 0)
  if (c < 40) return { label: "Identification faible", message: "Image difficile à analyser. Essayez une photo plus nette." }
  if (c < 60) return { label: "Identification probable", message: "Proposition plausible. Merci de valider ou corriger." }
  if (c <= 80) return { label: "Identification correcte", message: "Bonne identification. Merci de valider." }
  return { label: "Identification certaine", message: "Identification très probable. Merci de confirmer." }
}

export function exportWasteResultPdf({ sourceId = "results", result, form, filename = "wasteai-resultats.pdf" } = {}) {
  if (!document.getElementById(sourceId) && !result && !form) {
    throw new Error("Aucun résultat à exporter.")
  }

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true })

  const profile = buildWasteProfile(result || {}, form || {})
  const solutions = extractSolutions(result || {})
  const actors = rankActors(profile, solutions)
  const actorRows = actors.length ? actors : [{ name: "Opérateur à confirmer", score: 0, justification: "Flux à caractériser plus finement." }]
  const confidenceInfo = confidenceStatus(result?.confiance_identification)
  const whyPriority = String(result?.explication_detaillee || result?.explication || result?.justification_technique || result?.resume_choix || "").trim()
  const selectedRoute = String(result?.decision_principale || result?.decision || solutions[0] || "voie non spécifiée").trim()
  const routeList = Array.isArray(result?.scores_par_voie) ? result.scores_par_voie : []
  const warnings = listText([
    result?.avertissements,
    ...(Array.isArray(result?.hypotheses_utilisees) ? result.hypotheses_utilisees : []),
    ...(Array.isArray(result?.donnees_manquantes_critiques) ? result.donnees_manquantes_critiques : []),
  ])
  const assumptions = listText(Array.isArray(result?.hypotheses_utilisees) ? result.hypotheses_utilisees : [])
  const conditions = listText((Array.isArray(result?.conditions_requises) ? result.conditions_requises : String(result?.conditions_requises || "").split(/;\s*/)).filter(Boolean))

  const saleValue = firstFiniteNumber(result?.valeur_estimee_fcfa_tonne, result?.details_scores_bruts?.market_value_fcfa_tonne, result?.details_scores_bruts?.market_value_fcfa)
  const treatmentCost = firstFiniteNumber(result?.cout_estime_fcfa_tonne, result?.details_scores_bruts?.treatment_cost_fcfa_tonne, result?.details_scores_bruts?.treatment_cost_fcfa)
  const industrialGainTotal = firstFiniteNumber(result?.gain_industriel_fcfa, result?.details_scores_bruts?.gain_industriel_fcfa)
  const industrialGainTon = firstFiniteNumber(result?.gain_industriel_fcfa_tonne, result?.details_scores_bruts?.gain_industriel_fcfa_tonne)
  const roi = firstFiniteNumber(result?.score_global, result?.details_scores_bruts?.roi)
  const co2 = firstFiniteNumber(result?.co2_evite_estime_kg, result?.impact_co2_kg, result?.impact_environnemental?.bilan_net_recommande_kgco2e)

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 14
  const gap = 4
  const contentWidth = pageWidth - margin * 2
  const leftColWidth = 90
  const rightColWidth = contentWidth - leftColWidth - gap
  const columnWidth = (contentWidth - gap) / 2

  const colors = {
    bg: [247, 250, 248],
    surface: [255, 255, 255],
    surfaceSoft: [240, 246, 243],
    text: [17, 24, 39],
    muted: [95, 109, 104],
    border: [214, 221, 217],
    brand: [18, 83, 61],
    brandSoft: [233, 244, 239],
  }

  const setText = (color, font = "normal", size = 10) => {
    doc.setTextColor(...color)
    doc.setFont("helvetica", font)
    doc.setFontSize(size)
  }

  const fillPage = () => {
    doc.setFillColor(...colors.bg)
    doc.rect(0, 0, pageWidth, pageHeight, "F")
  }

  const panel = (x, y, w, h, fill = colors.surface, stroke = colors.border, radius = 4) => {
    doc.setFillColor(...fill)
    doc.setDrawColor(...stroke)
    doc.roundedRect(x, y, w, h, radius, radius, "FD")
  }

  const sectionTitle = (text, x, y, width) => {
    doc.setFillColor(...colors.brand)
    doc.roundedRect(x, y - 4, width, 8, 2, 2, "F")
    setText([255, 255, 255], "bold", 10)
    doc.text(text, x + 3, y + 1.5)
    setText(colors.text)
  }

  const wrap = (text, width) => doc.splitTextToSize(String(text || ""), width)

  const paragraph = (text, x, y, width, options = {}) => {
    const { font = "normal", size = 9, color = colors.text, maxLines = null } = options
    setText(color, font, size)
    const lines = wrap(text, width)
    const output = maxLines ? lines.slice(0, maxLines) : lines
    doc.text(output, x, y, { lineHeightFactor: 1.1 })
    return output.length * 4.1
  }

  const chip = (label, x, y, maxWidth) => {
    const textWidth = doc.getTextWidth(label)
    const width = Math.min(maxWidth, textWidth + 6)
    doc.setFillColor(...colors.brandSoft)
    doc.setDrawColor(...colors.border)
    doc.roundedRect(x, y - 3.2, width, 6.4, 3, 3, "FD")
    setText(colors.brand, "bold", 8)
    doc.text(label, x + 3, y)
    return width
  }

  const metricCard = (x, y, w, h, label, value, hint) => {
    panel(x, y, w, h, colors.surface, colors.border, 3)
    setText(colors.muted, "bold", 7)
    doc.text(label, x + 3, y + 5)
    setText(colors.text, "bold", 11)
    doc.text(String(value || "N/R"), x + 3, y + 11)
    if (hint) {
      setText(colors.muted, "normal", 7)
      doc.text(wrap(hint, w - 6).slice(0, 2), x + 3, y + 16.2, { lineHeightFactor: 1.05 })
    }
  }

  const keyValueGrid = (x, y, width, items) => {
    let cursorY = y
    items.forEach(([label, value]) => {
      setText(colors.muted, "bold", 8)
      doc.text(`${label}:`, x, cursorY)
      setText(colors.text, "normal", 8)
      const lines = wrap(String(value || "N/R"), width - 28)
      doc.text(lines, x + 26, cursorY, { lineHeightFactor: 1.05 })
      cursorY += Math.max(4.7, lines.length * 4.1)
    })
    return cursorY
  }

  const bulletList = (x, y, width, items, maxItems = 3) => {
    let cursorY = y
    items.slice(0, maxItems).forEach((item) => {
      const lines = wrap(String(item || ""), width - 4)
      setText(colors.text, "normal", 8)
      doc.text(`- ${lines[0] || ""}`, x, cursorY)
      if (lines.length > 1) {
        doc.text(lines.slice(1), x + 4, cursorY + 4, { lineHeightFactor: 1.05 })
        cursorY += 4 * lines.length
      } else {
        cursorY += 4.5
      }
    })
    return cursorY
  }

  fillPage()
  setText(colors.brand, "bold", 12)
  doc.text("WasteAI - Rapport analytique", margin, 13)
  setText(colors.muted, "normal", 8)
  doc.text(`Généré le ${formatDate()}`, pageWidth - margin, 13, { align: "right" })

  const heroY = 18
  const heroH = 44
  panel(margin, heroY, contentWidth, heroH, colors.surface, colors.border, 5)
  doc.setFillColor(245, 248, 247)
  doc.roundedRect(margin + 1, heroY + 1, contentWidth * 0.67, heroH - 2, 4, 4, "F")

  setText(colors.muted, "bold", 8)
  doc.text("WasteAI - Fiche de synthèse", margin + 4, heroY + 8)
  setText(colors.text, "bold", 15)
  doc.text(wrap(profile.name || "Déchet non précisé", 92).slice(0, 2), margin + 4, heroY + 16, { lineHeightFactor: 1.05 })
  paragraph(clampText(whyPriority || "Analyse technique du flux et de ses voies de valorisation.", 3), margin + 4, heroY + 24, 88, { color: colors.muted, size: 8.5, maxLines: 3 })

  let chipX = margin + 4
  const chipY = heroY + 35
  chipX += chip(`Voie recommandée: ${formatRouteLabel(selectedRoute)}`, chipX, chipY, 88) + 2
  chipX += chip(profile.type || "Type non précisé", chipX, chipY, 40) + 2
  chip(`Quantité ${formatOptionalNumber(profile.quantityKg, "kg") || "non précisée"}`, chipX, chipY, 44)

  const scoreX = margin + contentWidth * 0.69
  panel(scoreX, heroY + 4, contentWidth * 0.27, heroH - 8, colors.surfaceSoft, colors.border, 4)
  setText(colors.muted, "bold", 7)
  doc.text("Lecture rapide", scoreX + 3, heroY + 10)
  setText(colors.text, "bold", 12)
  doc.text(confidenceInfo.label, scoreX + 3, heroY + 17)
  setText(colors.muted, "normal", 8)
  doc.text(wrap(confidenceInfo.message, contentWidth * 0.24).slice(0, 2), scoreX + 3, heroY + 24, { lineHeightFactor: 1.05 })
  doc.text(formatDate(), scoreX + 3, heroY + 39)

  const summaryY = heroY + heroH + 5
  panel(margin, summaryY, contentWidth, 34, colors.surface, colors.border, 5)
  sectionTitle("Synthèse économique", margin + 4, summaryY + 8, 42)
  const metricY = summaryY + 12
  const metricW = (contentWidth - 9) / 4
  metricCard(margin + 4, metricY, metricW, 18, "Valeur", formatMaybeNumber(saleValue, "FCFA/t"), "Valeur estimée par tonne")
  metricCard(margin + 4 + metricW + 3, metricY, metricW, 18, "Coût", formatMaybeNumber(treatmentCost, "FCFA/t"), "Coût de traitement par tonne")
  metricCard(margin + 4 + (metricW + 3) * 2, metricY, metricW, 18, "Gain net", formatMaybeNumber(industrialGainTotal, "FCFA"), "Gain total projeté")
  metricCard(margin + 4 + (metricW + 3) * 3, metricY, metricW, 18, "CO2 évité", formatMaybeNumber(co2, "kgCO2e"), "Impact environnemental net")
  setText(colors.muted, "normal", 7)
  doc.text(`Impact environnemental: ${formatMaybeNumber(co2, "kgCO2e")} évités.`, margin + 4, summaryY + 31)

  const leftY = summaryY + 39
  panel(margin, leftY, leftColWidth, 74, colors.surface, colors.border, 5)
  panel(margin + leftColWidth + gap, leftY, rightColWidth, 74, colors.surface, colors.border, 5)
  sectionTitle("Profil du flux", margin + 4, leftY + 8, 34)
  sectionTitle("Lecture technique", margin + leftColWidth + gap + 4, leftY + 8, 36)

  keyValueGrid(margin + 4, leftY + 15, leftColWidth - 8, [
    ["Déchet", profile.name || "N/R"],
    ["Type", profile.type || "N/R"],
    ["Humidité", formatPercent(profile.humidity)],
    ["PCI", formatMaybeNumber(profile.pci, "MJ/kg")],
    ["DCO / DBO", `${formatMaybeNumber(profile.dco, "mg/L")} / ${formatMaybeNumber(profile.dbo, "mg/L")}`],
    ["Contam.", formatPercent(profile.contamination)],
    ["Métaux", boolLabel(profile.hasMetals)],
    ["Chlore", boolLabel(profile.hasChlorine)],
  ])

  paragraph(clampText(whyPriority || "Aucune justification détaillée disponible.", 4), margin + leftColWidth + gap + 4, leftY + 15, rightColWidth - 8, { color: colors.text, size: 8, maxLines: 6 })
  keyValueGrid(margin + leftColWidth + gap + 4, leftY + 41, rightColWidth - 8, [
    ["Voie retenue", formatRouteLabel(selectedRoute)],
    ["Conditions", conditions.length ? conditions.join(" ; ") : "Aucune condition explicite"],
  ])

  doc.addPage()
  fillPage()
  setText(colors.brand, "bold", 12)
  doc.text("WasteAI - Détails de la décision", margin, 13)
  setText(colors.muted, "normal", 8)
  doc.text(`Généré le ${formatDate()}`, pageWidth - margin, 13, { align: "right" })

  const topBlockY = 20
  panel(margin, topBlockY, columnWidth, 108, colors.surface, colors.border, 5)
  panel(margin + columnWidth + gap, topBlockY, columnWidth, 108, colors.surface, colors.border, 5)
  sectionTitle("Voies examinées", margin + 4, topBlockY + 8, 38)
  sectionTitle("Opérateurs compatibles", margin + columnWidth + gap + 4, topBlockY + 8, 48)

  let routeCursor = topBlockY + 16
  routeList.slice(0, 3).forEach((item, idx) => {
    const title = formatRouteLabel(item?.solution || item?.filiere || item?.nom || "voie")
    const score = Number(item?.score ?? item?.global_score ?? item?.technical_score ?? 0)
    const status = String(item?.statut || item?.status || (idx === 0 ? "Recommandée" : "Alternative")).trim()
    const explanation = clampText(String(item?.explication || item?.pourquoi_pas_prioritaire || item?.justification || item?.technical_reason || "").trim() || "Aucune justification détaillée disponible.", 2)
    const conditionsText = Array.isArray(item?.conditions) ? item.conditions.join(" ; ") : String(item?.conditions || "")

    panel(margin + 4, routeCursor - 3, columnWidth - 8, 28, colors.surfaceSoft, colors.border, 3)
    setText(colors.text, "bold", 9)
    doc.text(title, margin + 7, routeCursor + 3)
    setText(colors.muted, "normal", 7)
    doc.text(`${Number.isFinite(score) ? `${score.toFixed(0)}/100` : "N/R"} | ${status}`, margin + 7, routeCursor + 8)
    if (conditionsText) {
      doc.text(wrap(conditionsText, columnWidth - 20).slice(0, 1), margin + 7, routeCursor + 13, { lineHeightFactor: 1.05 })
    }
    setText(colors.text, "normal", 8)
    doc.text(wrap(explanation, columnWidth - 14).slice(0, 2), margin + 7, routeCursor + 19, { lineHeightFactor: 1.05 })
    routeCursor += 31
  })

  let actorCursor = topBlockY + 16
  actorRows.slice(0, 3).forEach((actor) => {
    panel(margin + columnWidth + gap + 4, actorCursor - 3, columnWidth - 8, 28, colors.surfaceSoft, colors.border, 3)
    setText(colors.text, "bold", 9)
    doc.text(actor.name || "Opérateur", margin + columnWidth + gap + 7, actorCursor + 3)
    setText(colors.muted, "normal", 7)
    doc.text(Number.isFinite(Number(actor.score)) ? `${Math.round(Number(actor.score))}/100` : "N/R", margin + columnWidth + gap + 7, actorCursor + 8)
    setText(colors.text, "normal", 8)
    doc.text(wrap(clampText(actor.justification || "", 2), columnWidth - 14).slice(0, 2), margin + columnWidth + gap + 7, actorCursor + 14, { lineHeightFactor: 1.05 })
    actorCursor += 31
  })

  const bottomY = 132
  panel(margin, bottomY, contentWidth, 72, colors.surface, colors.border, 5)
  sectionTitle("Hypothèses et avertissements", margin + 4, bottomY + 8, 54)
  setText(colors.text, "normal", 8)
  bulletList(margin + 4, bottomY + 16, contentWidth / 2 - 6, assumptions.length ? assumptions : ["Aucune hypothèse majeure"], 4)
  bulletList(margin + contentWidth / 2 + 2, bottomY + 16, contentWidth / 2 - 6, warnings.length ? warnings : ["Aucun avertissement majeur"], 4)
  setText(colors.muted, "normal", 7)
  doc.text(`Gain/t: ${formatMaybeNumber(industrialGainTon, "FCFA/t")}`, margin + 4, bottomY + 63)
  doc.text(`ROI: ${Number.isFinite(roi) ? roi.toFixed(2) : "N/R"}`, margin + contentWidth / 2 + 2, bottomY + 63)
  doc.text(`Page 2 / ${doc.getNumberOfPages()}`, pageWidth - margin, pageHeight - 10, { align: "right" })

  doc.setPage(1)
  doc.text(`Page 1 / ${doc.getNumberOfPages()}`, pageWidth - margin, pageHeight - 10, { align: "right" })

  try {
    doc.save(filename)
    return
  } catch (error) {
    const blob = doc.output("blob")
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    link.rel = "noopener"
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1500)
    if (error) void error
  }
}
