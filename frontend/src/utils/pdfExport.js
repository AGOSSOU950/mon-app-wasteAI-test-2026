const HTML2PDF_CDN = "https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js"

let html2pdfLoader = null

function loadHtml2Pdf() {
  if (typeof window !== "undefined" && window.html2pdf) {
    return Promise.resolve(window.html2pdf)
  }

  if (html2pdfLoader) {
    return html2pdfLoader
  }

  html2pdfLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-wasteai-html2pdf="true"]')
    if (existing) {
      existing.addEventListener('load', () => resolve(window.html2pdf), { once: true })
      existing.addEventListener('error', () => reject(new Error('Impossible de charger la librairie PDF.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = HTML2PDF_CDN
    script.async = true
    script.setAttribute('data-wasteai-html2pdf', 'true')
    script.onload = () => resolve(window.html2pdf)
    script.onerror = () => reject(new Error('Impossible de charger la librairie PDF.'))
    document.head.appendChild(script)
  })

  return html2pdfLoader
}

function formatDate(value = new Date()) {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(value)
}

function money(value) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Number(value || 0))
}

function buildRecommendations(result) {
  const items = []
  const route = String(result?.decision_principale || result?.decision || result?.filiere || '').trim()
  const explanation = String(result?.explication_detaillee || result?.explication || result?.justification_technique || '').trim()
  const stockage = String(result?.conseil_stockage || '').trim()
  const co2 = Number(result?.co2_evite_estime_kg || result?.impact_co2_kg || result?.impact_environnemental?.bilan_net_recommande_kgco2e || 0)
  const cost = Number(result?.cout_estime_fcfa_tonne || result?.details_scores_bruts?.treatment_cost_fcfa || 0)

  if (route) items.push(`Voie retenue: ${route}`)
  if (explanation) items.push(`La filiere a ete retenue car le profil technique, economique, environnemental et reglementaire est plus robuste que les alternatives.`)
  if (stockage) items.push(`Stockage / manipulation: ${stockage}`)
  if (co2 > 0) items.push(`Impact CO2 evite estime: ${money(co2)} kgCO2e`)
  if (cost > 0) items.push(`Cout de traitement estime: ${money(cost)} FCFA/tonne`)
  if (Array.isArray(result?.alternatives) && result.alternatives.length > 0) {
    const topAlt = result.alternatives.slice(0, 2).map((alt) => String(alt?.filiere || alt?.methode || '').trim()).filter(Boolean)
    if (topAlt.length > 0) items.push(`Alternatives a surveiller: ${topAlt.join(', ')}`)
  }

  return items.slice(0, 5)
}

function sanitizeExportNode(source) {
  const clone = source.cloneNode(true)

  clone.querySelectorAll('.whats-list').forEach((list) => {
    const items = Array.from(list.querySelectorAll('button')).map((button) => {
      const text = String(button.textContent || '').replace(/\s*-\s*Contacter via WhatsApp\s*$/i, '').trim()
      const item = document.createElement('p')
      item.style.margin = '0 0 6px'
      item.textContent = text
      return item
    })
    list.innerHTML = ''
    items.forEach((item) => list.appendChild(item))
  })

  clone.querySelectorAll('.actions-row').forEach((node) => node.remove())
  clone.querySelectorAll('.result-card button').forEach((node) => node.remove())
  clone.querySelectorAll('input, textarea, select').forEach((node) => node.remove())
  clone.querySelectorAll('iframe, video, audio').forEach((node) => node.remove())

  clone.querySelectorAll('.result-pane').forEach((pane) => {
    pane.style.background = '#ffffff'
    pane.style.border = '1px solid #d7e6db'
    pane.style.breakInside = 'avoid'
    pane.style.pageBreakInside = 'avoid'
  })

  clone.querySelectorAll('h3, h4').forEach((title) => {
    title.style.pageBreakAfter = 'avoid'
    title.style.breakAfter = 'avoid'
  })

  return clone
}

function createHeader(result) {
  const header = document.createElement('div')
  header.style.display = 'flex'
  header.style.justifyContent = 'space-between'
  header.style.alignItems = 'center'
  header.style.gap = '16px'
  header.style.padding = '18px 20px'
  header.style.marginBottom = '14px'
  header.style.borderRadius = '16px'
  header.style.background = 'linear-gradient(135deg, #0f3d2e 0%, #1f7a55 100%)'
  header.style.color = '#ffffff'

  const brand = document.createElement('div')
  brand.style.display = 'flex'
  brand.style.alignItems = 'center'
  brand.style.gap = '12px'

  const logo = document.createElement('div')
  logo.textContent = 'W'
  logo.style.width = '42px'
  logo.style.height = '42px'
  logo.style.borderRadius = '12px'
  logo.style.display = 'grid'
  logo.style.placeItems = 'center'
  logo.style.background = 'rgba(255,255,255,0.16)'
  logo.style.border = '1px solid rgba(255,255,255,0.28)'
  logo.style.fontWeight = '800'
  logo.style.fontSize = '20px'

  const titleWrap = document.createElement('div')
  const title = document.createElement('div')
  title.textContent = "WasteAI - Resultats d'analyse"
  title.style.fontSize = '18px'
  title.style.fontWeight = '800'
  const subtitle = document.createElement('div')
  subtitle.textContent = 'Rapport PDF genere cote client'
  subtitle.style.fontSize = '12px'
  subtitle.style.opacity = '0.9'

  titleWrap.appendChild(title)
  titleWrap.appendChild(subtitle)
  brand.appendChild(logo)
  brand.appendChild(titleWrap)

  const meta = document.createElement('div')
  meta.style.textAlign = 'right'
  meta.style.fontSize = '12px'
  meta.style.lineHeight = '1.5'
  const date = document.createElement('div')
  date.textContent = `Genere le ${formatDate()}`
  const route = document.createElement('div')
  route.textContent = `Voie retenue: ${String(result?.decision_principale || result?.decision || 'non specifiee')}`
  meta.appendChild(date)
  meta.appendChild(route)

  header.appendChild(brand)
  header.appendChild(meta)
  return header
}

function createRecommendationsSection(result) {
  const section = document.createElement('section')
  section.style.marginTop = '16px'
  section.style.padding = '16px 18px'
  section.style.border = '1px solid #d7e6db'
  section.style.borderRadius = '14px'
  section.style.background = '#f7fbf8'
  section.style.breakInside = 'avoid'
  section.style.pageBreakInside = 'avoid'

  const title = document.createElement('h3')
  title.textContent = 'Recommandations WasteAI'
  title.style.margin = '0 0 10px'
  title.style.color = '#174937'
  title.style.fontSize = '16px'

  const list = document.createElement('ul')
  list.style.margin = '0'
  list.style.paddingLeft = '20px'
  list.style.color = '#28463a'
  buildRecommendations(result).forEach((item) => {
    const li = document.createElement('li')
    li.style.marginBottom = '6px'
    li.textContent = item
    list.appendChild(li)
  })

  section.appendChild(title)
  if (list.childElementCount === 0) {
    const empty = document.createElement('p')
    empty.style.margin = '0'
    empty.textContent = 'Aucune recommandation disponible.'
    section.appendChild(empty)
  } else {
    section.appendChild(list)
  }

  return section
}

export async function exportWasteResultPdf({ sourceId = 'results', result, filename = 'wasteai-resultats.pdf' } = {}) {
  const source = document.getElementById(sourceId)
  if (!source) {
    throw new Error('Aucun bloc de resultats trouve.')
  }

  if (!String(source.textContent || '').trim()) {
    throw new Error('Le contenu des resultats est vide.')
  }

  const html2pdf = await loadHtml2Pdf()

  const wrapper = document.createElement('div')
  wrapper.style.position = 'fixed'
  wrapper.style.left = '-10000px'
  wrapper.style.top = '0'
  wrapper.style.width = '794px'
  wrapper.style.padding = '0'
  wrapper.style.background = '#ffffff'
  wrapper.style.color = '#111827'
  wrapper.style.fontFamily = 'Segoe UI, Arial, sans-serif'
  wrapper.style.boxSizing = 'border-box'
  wrapper.style.zIndex = '-1'

  const style = document.createElement('style')
  style.textContent = `
    .wasteai-pdf-report { width: 100%; }
    .wasteai-pdf-report * { box-sizing: border-box; }
    .wasteai-pdf-report .result-card { background: #ffffff !important; box-shadow: none !important; border: 1px solid #d7e6db !important; }
    .wasteai-pdf-report .result-pane { background: #ffffff !important; border: 1px solid #d7e6db !important; }
    .wasteai-pdf-report h3, .wasteai-pdf-report h4 { page-break-after: avoid; break-after: avoid; }
    .wasteai-pdf-report .actions-row { display: none !important; }
    .wasteai-pdf-report button { display: none !important; }
    .wasteai-pdf-report ul { margin-top: 6px; margin-bottom: 6px; }
  `

  const report = document.createElement('div')
  report.className = 'wasteai-pdf-report'
  report.style.width = '100%'

  report.appendChild(createHeader(result))
  report.appendChild(sanitizeExportNode(source))
  report.appendChild(createRecommendationsSection(result))

  wrapper.appendChild(style)
  wrapper.appendChild(report)
  document.body.appendChild(wrapper)

  try {
    await html2pdf()
      .set({
        margin: [10, 10, 12, 10],
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy', 'avoid-all'] },
      })
      .from(report)
      .save()
  } finally {
    wrapper.remove()
  }
}
