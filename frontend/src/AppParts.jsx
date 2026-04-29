import heroImage from "./assets/hero.png"
import wastePlasticImage from "./assets/waste-plastic.svg"
import wasteTextileImage from "./assets/waste-textile.svg"
import wasteOrganicImage from "./assets/waste-organic.svg"
import { exportWasteResultPdf } from "./utils/pdfExport"


const API_BASE = (import.meta.env.VITE_API_URL || "https://wasteai-api.wasteai-gildas.workers.dev").replace(/\/$/, "")

const WASTE_TYPES = [
  { value: "biomasse_lignocellulosique", label: "biomasse lignocellulosique" },
  { value: "boue_de_vidange", label: "boue de vidange" },
  { value: "huile_usagee", label: "huile usee" },
  { value: "textile", label: "textile" },
  { value: "plastique", label: "plastique" },
  { value: "autre", label: "autre" }
]

const INDUSTRY_TYPES = [
  { value: "agroalimentaire", label: "agroalimentaire" },
  { value: "metallurgie", label: "metallurgie" },
  { value: "chimie", label: "chimie" },
  { value: "textile", label: "textile" },
  { value: "automobile", label: "automobile" },
  { value: "construction", label: "construction" },
  { value: "energie", label: "energie" },
  { value: "autre", label: "autre" }
]

const CEDEAO_COUNTRIES = [
  "benin", "burkina faso", "cap-vert", "cote d'ivoire", "gambie", "ghana", "guinee", "guinee-bissau", "liberia", "mali", "niger", "nigeria", "senegal", "sierra leone", "togo"
]

const CEDEAO_SUBREGIONS = ["uemoa", "anglophone", "lusophone"]

const WASTE_VISUALS = [
  {
    title: "Plastiques industriels",
    note: "Tri + recyclage matiere, puis valorisation energetique si necessaire.",
    image: wastePlasticImage
  },
  {
    title: "Textiles",
    note: "Reemploi et effilochage priorises avant les voies thermiques.",
    image: wasteTextileImage
  },
  {
    title: "Biomasse",
    note: "Conversion energetique ou matiere selon humidite et PCI.",
    image: wasteOrganicImage
  }
]

const INITIAL_FORM = {
  nom: "",
  categorie: "metal",
  type_dechet: "autre",
  type_industrie: "autre",
  quantite_kg: "",
  niveau_danger: "faible",
  description: "",
  contient_metaux: false,
  pays_cedeao: "",
  sous_region_cedeao: "",
  pci_mj_kg: "",
  taux_lignine_pct: "",
  dbo_mg_l: "",
  dco_mg_l: "",
  taux_humidite_pct: "",
  produit_principal: "",
  composition_textile: "",
  etat_textile: "",
  origine_flux: "",
  presence_metaux_lourds: false,
  type_plastique: "",
  taux_contamination_pct: "",
  presence_colorants: false,
  presence_additifs: false,
  presence_chlore: false,
  filiere_cimenterie_autorisee: false
}

function buildPayload(form) {
  return {
    ...form,
    quantite_kg: parseFloat(form.quantite_kg),
    pci_mj_kg: form.pci_mj_kg ? parseFloat(form.pci_mj_kg) : null,
    taux_lignine_pct: form.taux_lignine_pct ? parseFloat(form.taux_lignine_pct) : null,
    dbo_mg_l: form.dbo_mg_l ? parseFloat(form.dbo_mg_l) : null,
    dco_mg_l: form.dco_mg_l ? parseFloat(form.dco_mg_l) : null,
    taux_contamination_pct: form.taux_contamination_pct ? parseFloat(form.taux_contamination_pct) : null
  }
}

const DEFAULT_FIELD_LABELS = {
  pci_mj_kg: "PCI (MJ/kg)",
  taux_lignine_pct: "Taux de lignine (%)",
  dbo_mg_l: "DBO (mg/L)",
  dco_mg_l: "DCO (mg/L)",
  type_dechet: "Type de dechet"
}

function getDefaultLabel(key) {
  return DEFAULT_FIELD_LABELS[key] || key
}

function formatDefaultValue(value) {
  if (value === null || value === undefined || value === "") return "n/a"
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2)
  return String(value)
}

function csvEscape(value) {
  const str = String(value ?? "")
  if (str.includes('"') || str.includes(",") || str.includes("\n")) return `"${str.replace(/"/g, '""')}"`
  return str
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(new Error("Lecture image impossible"))
    reader.readAsDataURL(file)
  })
}

function DetectionProposal({ detection, onAccept, onApplyAndEdit, onDismiss }) {
  if (!detection) return null
  return (
    <div style={{ background: "#fff7e6", border: "1px solid #e7cf9f", borderRadius: 8, padding: 12, marginBottom: 14 }}>
      <p style={{ margin: "0 0 8px", color: "#6a4e1f" }}><strong>Proposition issue de la photo</strong></p>
      <p style={{ margin: "0 0 6px" }}><strong>Nom:</strong> {detection.nom}</p>
      <p style={{ margin: "0 0 6px" }}><strong>Categorie:</strong> {detection.categorie}</p>
      <p style={{ margin: "0 0 6px" }}><strong>Type:</strong> {detection.type_dechet}</p>
      <p style={{ margin: "0 0 6px" }}><strong>Confiance:</strong> {detection.confiance}</p>
      {!!detection.avertissement && <p style={{ margin: "0 0 10px", color: "#7a3030" }}>{detection.avertissement}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={primaryMiniBtn} onClick={onAccept}>Valider</button>
        <button type="button" style={secondaryMiniBtn} onClick={onApplyAndEdit}>Appliquer puis corriger</button>
        <button type="button" style={ghostMiniBtn} onClick={onDismiss}>Ignorer</button>
      </div>
    </div>
  )
}

function FormSection({ title, form, setForm, onIdentifyImage, identifyingImage, imageHint, pendingDetection, onAcceptDetection, onApplyAndEditDetection, onDismissDetection }) {
  return (
    <div style={{ background: "#f8f8f8", padding: 20, borderRadius: 14, marginBottom: 16, border: "1px solid #d9e5dd" }}>
      <h3 style={{ marginTop: 0, marginBottom: 4, color: "#1f513d" }}>{title}</h3>
      <p style={{ margin: "0 0 12px", color: "#4e645a", fontSize: 13 }}>Saisis les champs essentiels puis ouvre les blocs avances si besoin.</p>

      <label>Identification par photo (optionnel)</label>
      <input style={inp} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const file = e.target.files?.[0]; if (file) onIdentifyImage(file); e.target.value = "" }} />
      {identifyingImage && <p style={{ marginTop: -8, marginBottom: 10, color: "#1f513d" }}>Identification photo en cours...</p>}
      {!!imageHint && <p style={{ marginTop: -8, marginBottom: 10, color: "#384744" }}>{imageHint}</p>}
      <DetectionProposal detection={pendingDetection} onAccept={onAcceptDetection} onApplyAndEdit={onApplyAndEditDetection} onDismiss={onDismissDetection} />

      <div style={formGrid}>
        <div>
          <label>Nom du dechet</label>
          <input style={inp} value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} />
        </div>
        <div>
          <label>Quantite (kg)</label>
          <input style={inp} type="number" value={form.quantite_kg} onChange={e => setForm({ ...form, quantite_kg: e.target.value })} />
        </div>
        <div>
          <label>Categorie</label>
          <select style={inp} value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value })}>{["metal", "organique", "chimique", "plastique", "electronique", "papier", "verre", "autre"].map(c => <option key={c} value={c}>{c}</option>)}</select>
        </div>
        <div>
          <label>Type de dechet</label>
          <select style={inp} value={form.type_dechet} onChange={e => setForm({ ...form, type_dechet: e.target.value })}>{WASTE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
        </div>
        <div>
          <label>Type d'industrie</label>
          <select style={inp} value={form.type_industrie} onChange={e => setForm({ ...form, type_industrie: e.target.value })}>{INDUSTRY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
        </div>
        <div>
          <label>Niveau de danger</label>
          <select style={inp} value={form.niveau_danger} onChange={e => setForm({ ...form, niveau_danger: e.target.value })}>{["faible", "moyen", "eleve", "critique"].map(n => <option key={n} value={n}>{n}</option>)}</select>
        </div>
        <div>
          <label>Pays CEDEAO</label>
          <select style={inp} value={form.pays_cedeao} onChange={e => setForm({ ...form, pays_cedeao: e.target.value })}>
            <option value="">non renseigne</option>
            {CEDEAO_COUNTRIES.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label>Sous-region CEDEAO</label>
          <select style={inp} value={form.sous_region_cedeao} onChange={e => setForm({ ...form, sous_region_cedeao: e.target.value })}>
            <option value="">non renseigne</option>
            {CEDEAO_SUBREGIONS.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>

      <label>Produit principal (optionnel)</label>
      <input style={inp} value={form.produit_principal} onChange={e => setForm({ ...form, produit_principal: e.target.value })} />

      <details open style={accordion}>
        <summary style={accordionSummary}>Caracteristiques analytiques</summary>
        <div style={formGrid}>
          <div>
            <label>PCI (MJ/kg)</label>
            <input style={inp} type="number" step="0.1" value={form.pci_mj_kg} onChange={e => setForm({ ...form, pci_mj_kg: e.target.value })} />
          </div>
          <div>
            <label>Taux de lignine (%)</label>
            <input style={inp} type="number" step="0.1" value={form.taux_lignine_pct} onChange={e => setForm({ ...form, taux_lignine_pct: e.target.value })} />
          </div>
          <div>
            <label>DBO (mg/L)</label>
            <input style={inp} type="number" step="1" value={form.dbo_mg_l} onChange={e => setForm({ ...form, dbo_mg_l: e.target.value })} />
          </div>
          <div>
            <label>DCO (mg/L)</label>
            <input style={inp} type="number" step="1" value={form.dco_mg_l} onChange={e => setForm({ ...form, dco_mg_l: e.target.value })} />
          </div>
          <div>
            <label>Humidite (%)</label>
            <input style={inp} type="number" step="0.1" value={form.taux_humidite_pct} onChange={e => setForm({ ...form, taux_humidite_pct: e.target.value })} />
          </div>
        </div>
      </details>

      <details style={accordion}>
        <summary style={accordionSummary}>Specifique textile/plastique</summary>
        <div style={formGrid}>
          <div>
            <label>Composition textile</label>
            <input style={inp} value={form.composition_textile} onChange={e => setForm({ ...form, composition_textile: e.target.value })} placeholder="coton, polyester..." />
          </div>
          <div>
            <label>Etat textile</label>
            <select style={inp} value={form.etat_textile} onChange={e => setForm({ ...form, etat_textile: e.target.value })}>{["", "propre", "souille", "humide", "melange"].map(v => <option key={v} value={v}>{v || "non renseigne"}</option>)}</select>
          </div>
          <div>
            <label>Origine du flux</label>
            <select style={inp} value={form.origine_flux} onChange={e => setForm({ ...form, origine_flux: e.target.value })}>{["", "post_consommation", "post_production_industriel"].map(v => <option key={v} value={v}>{v || "non renseigne"}</option>)}</select>
          </div>
          <div>
            <label>Type de plastique (PET, PEHD, PP, PVC...)</label>
            <input style={inp} value={form.type_plastique} onChange={e => setForm({ ...form, type_plastique: e.target.value })} />
          </div>
          <div>
            <label>Taux de contamination (%)</label>
            <input style={inp} type="number" step="0.1" value={form.taux_contamination_pct} onChange={e => setForm({ ...form, taux_contamination_pct: e.target.value })} />
          </div>
        </div>
      </details>

      <details style={accordion}>
        <summary style={accordionSummary}>Contraintes et conformite</summary>
        <div style={checkGrid}>
          <label style={chk}><input type="checkbox" checked={form.presence_metaux_lourds} onChange={e => setForm({ ...form, presence_metaux_lourds: e.target.checked })} />Presence de metaux lourds</label>
          <label style={chk}><input type="checkbox" checked={form.presence_colorants} onChange={e => setForm({ ...form, presence_colorants: e.target.checked })} />Presence de colorants</label>
          <label style={chk}><input type="checkbox" checked={form.presence_additifs} onChange={e => setForm({ ...form, presence_additifs: e.target.checked })} />Presence d'additifs</label>
          <label style={chk}><input type="checkbox" checked={form.presence_chlore} onChange={e => setForm({ ...form, presence_chlore: e.target.checked })} />Presence de chlore (cas PVC)</label>
          <label style={chk}><input type="checkbox" checked={form.filiere_cimenterie_autorisee} onChange={e => setForm({ ...form, filiere_cimenterie_autorisee: e.target.checked })} />Filiere cimenterie autorisee</label>
          <label style={chk}><input type="checkbox" checked={form.contient_metaux} onChange={e => setForm({ ...form, contient_metaux: e.target.checked })} />Contient des metaux</label>
        </div>
      </details>
    </div>
  )
}

function ResultCard({ title, result }) {
  const [loadingPdf, setLoadingPdf] = React.useState(false)
  const [pdfError, setPdfError] = React.useState("")

  if (!result) return null

  async function handleDownloadPdf() {
    if (loadingPdf) return
    setPdfError("")
    try {
      setLoadingPdf(true)
      await exportWasteResultPdf({ sourceId: "results", result, filename: "wasteai-resultats.pdf" })
    } catch (error) {
      setPdfError(error?.message || "Echec de generation du PDF.")
    } finally {
      setLoadingPdf(false)
    }
  }

  return (
    <div style={resultCard} id="results">
      <div style={{ display: "flex", gap: 12, justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" }}>
        <h3 style={{ marginTop: 0, color: "#2d6a4f" }}>{title}</h3>
        <button type="button" style={secondaryBtn} onClick={handleDownloadPdf} disabled={loadingPdf}>{loadingPdf ? "Generation PDF..." : "Telecharger PDF"}</button>
      </div>
      <p><strong>Decision:</strong> {result.decision}</p>
      <p><strong>Score:</strong> {result.score}/100</p>
      <p><strong>Confiance:</strong> {result.confiance}</p>
      {result.resume_choix && <p><strong>Pourquoi ce choix:</strong> {result.resume_choix}</p>}
      {pdfError ? <p style={{ color: "#b42318" }}>{pdfError}</p> : null}
      {result.conformite_reglementaire?.status && <p><strong>Conformite CEDEAO:</strong> {result.conformite_reglementaire.status} ({result.conformite_reglementaire.max_severity || 'low'}) | <strong>Risque:</strong> {result.conformite_reglementaire.risk_score ?? 0}/100</p>}
      {result.conformite_reglementaire?.rule_hits?.length > 0 && <>
        <p><strong>Regles declenchees:</strong></p>
        <ul>{result.conformite_reglementaire.rule_hits.map((r, i) => <li key={i}>{r.label} [{r.severity}] - {r.message}</li>)}</ul>
      </>}
      {result.conformite_reglementaire?.warnings?.length > 0 && <ul>{result.conformite_reglementaire.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
      {result.references_reglementaires?.length > 0 && <><p><strong>References reglementaires:</strong></p><ul>{result.references_reglementaires.map((r, i) => <li key={i}>{r}</li>)}</ul></>}
      {result.reference_litterature && <p><strong>Source litterature:</strong> {result.reference_litterature}</p>}
      {result.references_bibliographiques?.length > 0 && <><p><strong>References scientifiques:</strong></p><ul>{result.references_bibliographiques.map((r, i) => <li key={i}>{r}</li>)}</ul></>}
      {result.valeurs_reference_appliquees && Object.keys(result.valeurs_reference_appliquees).length > 0 && <>
        <p><strong>Valeurs auto-remplies utilisees:</strong></p>
        <ul>{Object.entries(result.valeurs_reference_appliquees).map(([k, v]) => <li key={k}>{getDefaultLabel(k)}: {formatDefaultValue(v)}</li>)}</ul>
      </>}
      {result.details_scores && <>
        <p><strong>Scores appliques (apres contraintes):</strong> M {result.details_scores.matiere ?? 0} | E {result.details_scores.energetique ?? 0} | V {result.details_scores.vente ?? 0}</p>
        <p><strong>Scores bruts (avant blocages):</strong> M {result.details_scores_bruts?.matiere ?? result.details_scores.matiere ?? 0} | E {result.details_scores_bruts?.energetique ?? result.details_scores.energetique ?? 0} | V {result.details_scores_bruts?.vente ?? result.details_scores.vente ?? 0}</p>
      </>}
      {Array.isArray(result.classement_filieres) && result.classement_filieres.length > 0 && <>
        <p><strong>Classement complet des filieres:</strong></p>
        <ul>{result.classement_filieres.map((item, i) => <li key={`cf-${i}`}>{item.nom || item.id} - {Number(item.score || 0).toFixed(1)}/100 - {item.statut || "Peu pertinent"}</li>)}</ul>
      </>}
      {result.detail_scoring && Object.keys(result.detail_scoring).length > 0 && <>
        <p><strong>Attribution des scores (par regle):</strong></p>
        {Object.entries(result.detail_scoring).map(([decision, rows]) => <div key={decision} style={{ marginBottom: 8 }}><p style={{ margin: "0 0 4px" }}><strong>{decision}</strong></p><ul style={{ marginTop: 2 }}>{(rows || []).map((r, i) => <li key={`${decision}-${i}`}>{(r.points ?? 0) >= 0 ? "+" : ""}{r.points} pts - {r.regle}</li>)}</ul></div>)}
      </>}
      <div style={{ background: "#f2fbf6", border: "1px solid #cfe7d8", borderRadius: 8, padding: 10, marginBottom: 10 }}>
        <p style={{ margin: "0 0 8px", color: "#24523f" }}><strong>Calculateur d'impact environnemental (bilan carbone)</strong></p>
        {!result.impact_environnemental?.par_voie && <p style={{ margin: 0, color: "#4d6358" }}>Aucun resultat carbone disponible pour cette analyse.</p>}
        {result.impact_environnemental?.par_voie && <>
          <p><strong>Bilan net recommande:</strong> {result.impact_environnemental.bilan_net_recommande_kgco2e ?? 0} kgCO2e evites</p>
          {result.impact_environnemental.calibrage_cedeao?.country && <p><strong>Calibration pays:</strong> {result.impact_environnemental.calibrage_cedeao.country} (mult. emissions {result.impact_environnemental.calibrage_cedeao.generated_multiplier}, mult. evitees {result.impact_environnemental.calibrage_cedeao.avoided_multiplier})</p>}
          {result.impact_environnemental.hypotheses?.length > 0 && <ul>{result.impact_environnemental.hypotheses.map((h, i) => <li key={i}>{h}</li>)}</ul>}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680, marginBottom: 8 }}>
              <thead>
                <tr style={{ background: "#dff0e7" }}>
                  <th style={th}>Voie</th>
                  <th style={th}>Genere (kgCO2e)</th>
                  <th style={th}>Evite (kgCO2e)</th>
                  <th style={th}>Bilan net (kgCO2e)</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(result.impact_environnemental.par_voie).map((row, i) => <tr key={i} style={{ borderTop: "1px solid #dbe9e2" }}><td style={td}>{row.voie}</td><td style={td}>{row.emissions_generees_kgco2e}</td><td style={td}>{row.emissions_evitees_kgco2e}</td><td style={td}>{row.bilan_net_kgco2e}</td></tr>)}
              </tbody>
            </table>
          </div>
        </>}
      </div>
      {result.facteurs_cles?.length > 0 && <><p><strong>Facteurs cles:</strong></p><ul>{result.facteurs_cles.map((f, i) => <li key={i}>{f}</li>)}</ul></>}
      {result.options_bloquees?.length > 0 && <><p><strong>Options bloquees:</strong></p><ul>{result.options_bloquees.map((o, i) => <li key={i}>{o}</li>)}</ul></>}
    </div>
  )
}

function StatCard({ title, value, suffix }) {
  return <div style={statCard}><p style={{ margin: "0 0 6px", color: "#4d6358", fontSize: 13 }}>{title}</p><p style={{ margin: 0, fontSize: 26, fontWeight: 700, color: "#1f513d" }}>{value}{suffix ? ` ${suffix}` : ""}</p></div>
}

function TrendChart({ title, data, dataKey, color }) {
  const width = 360
  const height = 140
  const points = data.map((item, index) => ({ x: index, y: Number(item[dataKey] || 0), label: item.date }))
  if (points.length === 0) return <div style={{ ...chartCard, color: "#60756a" }}>{title}: pas de donnees</div>
  const maxY = Math.max(...points.map(p => p.y), 1)
  const minY = Math.min(...points.map(p => p.y), 0)
  const xStep = points.length > 1 ? (width - 30) / (points.length - 1) : 0
  const range = Math.max(maxY - minY, 1)
  const poly = points.map(p => `${15 + p.x * xStep},${15 + ((maxY - p.y) / range) * (height - 30)}`).join(" ")
  const last = points[points.length - 1]
  return <div style={chartCard}><p style={{ margin: "0 0 8px", color: "#315848", fontWeight: 600 }}>{title}</p><svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: 140, background: "#ffffff", borderRadius: 8 }}><line x1="15" y1={height - 15} x2={width - 15} y2={height - 15} stroke="#dde7e1" /><line x1="15" y1="15" x2="15" y2={height - 15} stroke="#dde7e1" /><polyline fill="none" stroke={color} strokeWidth="3" points={poly} /></svg><p style={{ margin: "8px 0 0", fontSize: 12, color: "#4e6358" }}>Derniere valeur: {last.y} ({last.label})</p></div>
}


const heroShell = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: 16,
  alignItems: "center",
  background: "linear-gradient(135deg, #f2f8f4 0%, #e2f1e8 100%)",
  border: "1px solid #cfe0d5",
  borderRadius: 20,
  padding: 16,
  boxShadow: "0 12px 28px rgba(26, 60, 45, 0.08)",
  marginBottom: 14
}
const heroKicker = { margin: "0 0 8px", color: "#266147", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }
const heroTitle = { margin: "0 0 8px", color: "#163f31", fontSize: "clamp(1.35rem, 2.6vw, 2rem)", lineHeight: 1.2 }
const heroText = { margin: 0, color: "#355a4c", maxWidth: 620 }
const heroMediaWrap = { borderRadius: 14, overflow: "hidden", border: "1px solid #c8ddd0", minHeight: 220, background: "#d9e9df" }
const heroMedia = { width: "100%", height: "100%", objectFit: "cover", display: "block" }
const visualGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 10 }
const visualCard = { background: "#ffffff", border: "1px solid #d4e2d8", borderRadius: 14, padding: 10, display: "grid", gap: 8, animation: "fadeIn .4s ease both" }
const visualImage = { width: "100%", height: 120, objectFit: "cover", borderRadius: 10 }
const visualTitle = { margin: "0 0 4px", color: "#224c3a", fontWeight: 700 }
const visualText = { margin: 0, color: "#54695f", fontSize: 13 }
const formGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }
const accordion = { marginTop: 10, background: "#ffffff", border: "1px solid #d5e3da", borderRadius: 10, padding: 10 }
const accordionSummary = { cursor: "pointer", color: "#244b3a", fontWeight: 700, marginBottom: 8 }
const checkGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 6 }
const inp = { display: "block", width: "100%", padding: "10px 12px", margin: "6px 0 14px", borderRadius: 10, border: "1px solid #cfe0d5", fontSize: 14, boxSizing: "border-box", background: "#ffffff" }
const h4 = { marginTop: 18, marginBottom: 8, color: "#204b3b", fontSize: 15 }
const panel = { marginTop: 22, padding: 20, borderRadius: 16, background: "#f8fbf8", border: "1px solid #d4e2d8", boxShadow: "0 8px 24px rgba(26, 60, 45, 0.06)" }
const resultCard = { background: "#edf8f2", padding: 18, borderRadius: 14, borderLeft: "4px solid #1f7a55", marginBottom: 12 }
const statCard = { background: "#ffffff", border: "1px solid #d3e2d7", borderRadius: 12, padding: 14, minWidth: 170, flex: 1, boxShadow: "0 4px 12px rgba(26, 60, 45, 0.05)" }
const chartCard = { background: "#f4faf6", border: "1px solid #d6e4da", borderRadius: 12, padding: 10 }
const th = { textAlign: "left", fontSize: 13, color: "#2f4d40", padding: "8px 10px" }
const td = { padding: "8px 10px", fontSize: 13, color: "#2b3f36" }
const mainBtn = { marginTop: 8, background: "#1f7a55", color: "white", border: "none", padding: "12px 24px", borderRadius: 12, cursor: "pointer", fontSize: 16, width: "100%" }
const mainBtnTab = { background: "#edf4ef", color: "#1f513d", border: "1px solid #c7ddd0", padding: "9px 14px", borderRadius: 999, cursor: "pointer", fontWeight: 600 }
const mainBtnTabActive = { background: "#1f7a55", color: "white", border: "1px solid #1f7a55", padding: "9px 14px", borderRadius: 999, cursor: "pointer", fontWeight: 600 }
const secondaryBtn = { background: "#edf4ef", color: "#1f513d", border: "1px solid #c7ddd0", padding: "8px 12px", borderRadius: 10, cursor: "pointer" }
const chk = { display: "flex", alignItems: "center", gap: 8, marginTop: 8 }
const primaryMiniBtn = { background: "#2d6a4f", color: "white", border: "none", padding: "6px 10px", borderRadius: 6, cursor: "pointer" }
const secondaryMiniBtn = { background: "#f0e7d6", color: "#4f3d1f", border: "1px solid #d8bf90", padding: "6px 10px", borderRadius: 6, cursor: "pointer" }
const ghostMiniBtn = { background: "transparent", color: "#5c5c5c", border: "1px solid #c5c5c5", padding: "6px 10px", borderRadius: 6, cursor: "pointer" }

export {
  API_BASE,
  INITIAL_FORM,
  WASTE_VISUALS,
  buildPayload,
  csvEscape,
  fileToDataUrl,
  FormSection,
  ResultCard,
  StatCard,
  TrendChart,
  heroImage,
  heroMedia,
  heroMediaWrap,
  heroKicker,
  heroShell,
  heroText,
  heroTitle,
  inp,
  mainBtn,
  mainBtnTab,
  mainBtnTabActive,
  panel,
  resultCard,
  secondaryBtn,
  chk,
  th,
  td,
  visualCard,
  visualGrid,
  visualImage,
  visualText,
  visualTitle,
}


