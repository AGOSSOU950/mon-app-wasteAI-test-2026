import React from "react"

const CEDEAO_COUNTRIES = [
  "Benin",
  "Burkina Faso",
  "Cap-Vert",
  "Cote d'Ivoire",
  "Gambie",
  "Ghana",
  "Guinee",
  "Guinee-Bissau",
  "Liberia",
  "Mali",
  "Niger",
  "Nigeria",
  "Senegal",
  "Sierra Leone",
  "Togo",
]

const INDUSTRY_OPTIONS = [
  "agroalimentaire",
  "textile",
  "mines",
  "chimie",
  "petrole_gaz",
  "pharmaceutique",
  "metallurgie",
  "electronique",
  "automobile",
  "construction_btp",
  "municipal",
  "sante_hospitalier",
  "portuaire_logistique",
  "autre",
]

const WASTE_TYPES = [
  "organique",
  "biodÃƒÂ©gradable",
  "biodÃƒÂ©chets mÃƒÂ©nagers",
  "dÃƒÂ©chets alimentaires",
  "dÃƒÂ©chets d'abattoir",
  "boues organiques",
  "plastique",
  "textile",
  "papier_carton",
  "metal",
  "verre",
  "caoutchouc",
  "bois",
  "biomasse",
  "biomasse_lignocellulosique",
  "boues",
  "huiles_usees",
  "solvants",
  "dechets_chimiques",
  "dechets_biomedicaux",
  "e_waste",
  "gravats",
  "autre",
]

export default function AnalysisForm({
  form,
  setForm,
  identifyLoading,
  identifyLoadingMessage,
  loading,
  progress,
  onImageChange,
  onIdentify,
  onAnalyze,
  onReset,
  onPrefill,
  photoAiEnabled = true,
}) {
  return (
    <section className="card analysis-wrap" id="analysis-form">
      <div className="analysis-header">
        <p className="eyebrow">Analyse</p>
        <h2>PrÃƒÂ©parer un flux exploitable</h2>
        <p className="analysis-subtitle">
          Renseignez lÃ¢â‚¬â„¢essentiel pour obtenir une lecture rapide, une voie cohÃƒÂ©rente et un cadre de conformitÃƒÂ© clair.
        </p>
      </div>

      {photoAiEnabled ? (
        <>
          <h3 className="step-title">Ãƒâ€°tape 1 - Photo</h3>
          <div className={`upload-zone ${identifyLoading ? "scan-overlay" : ""}`}>
            <p><strong>DÃƒÂ©posez une photo</strong> ou cliquez pour choisir</p>
            <small>JPG, PNG, WEBP</small>
            <label htmlFor="waste-photo" className="sr-only">Photo du dÃƒÂ©chet</label>
            <input id="waste-photo" type="file" accept="image/*" onChange={onImageChange} />
            <div className="actions-row">
              <button className="btn" type="button" onClick={onIdentify} disabled={identifyLoading}>
                {identifyLoading ? "Identification..." : "Relancer"}
              </button>
            </div>
            <small>{identifyLoading ? (identifyLoadingMessage || "Analyse en cours...") : "Identification automatique au chargement. VÃƒÂ©rifiez puis validez."}</small>
          </div>
        </>
      ) : null}

      <h3 className="step-title" style={{ marginTop: photoAiEnabled ? 16 : 0 }}>Ãƒâ€°tape 2 - Informations utiles</h3>
      <div className="form-grid">
        <div className="field"><label htmlFor="waste-name">Nom du dÃƒÂ©chet</label><input id="waste-name" placeholder="Ex: boues huileuses, restes alimentaires" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} /></div>
        <div className="field"><label htmlFor="waste-qty">QuantitÃƒÂ© (kg)</label><input id="waste-qty" type="number" placeholder="Ex: 500" value={form.quantite_kg} onChange={(e) => setForm({ ...form, quantite_kg: e.target.value })} /></div>

        <div className="field"><label htmlFor="waste-category">Cat??gorie</label><select id="waste-category" value={form.categorie} onChange={(e) => setForm({ ...form, categorie: e.target.value, type_dechet: e.target.value === "biomasse_lignocellulosique" ? "biomasse_lignocellulosique" : form.type_dechet })}><option value="organique">organique</option><option value="biod??gradable">biod??gradable</option><option value="biod??chets m??nagers">biod??chets m??nagers</option><option value="d??chets alimentaires">d??chets alimentaires</option><option value="d??chets d'abattoir">d??chets d'abattoir</option><option value="boues organiques">boues organiques</option><option value="textile">textile</option><option value="plastique">plastique</option><option value="papier">papier</option><option value="metal">metal</option><option value="biomasse">biomasse</option><option value="biomasse_lignocellulosique">Biomasse lignocellulosique</option><option value="chimique">chimique</option><option value="verre">verre</option><option value="e_waste">e_waste</option><option value="autre">autre</option></select></div>
        <div className="field"><label htmlFor="waste-type">Type</label><select id="waste-type" value={form.type_dechet} onChange={(e) => setForm({ ...form, type_dechet: e.target.value })}>{WASTE_TYPES.map((w) => <option key={w} value={w}>{w === "biomasse_lignocellulosique" ? "Biomasse lignocellulosique" : w}</option>)}</select></div>
        <small className="field-help">Pour les coques, bagasse, sciure ou bois, choisissez Biomasse lignocellulosique.</small>

        <div className="field"><label htmlFor="waste-industry">Industrie</label><select id="waste-industry" value={form.type_industrie} onChange={(e) => setForm({ ...form, type_industrie: e.target.value })}>{INDUSTRY_OPTIONS.map((i) => <option key={i} value={i}>{i}</option>)}</select></div>
        <div className="field"><label htmlFor="waste-danger">Niveau de danger</label><select id="waste-danger" value={form.niveau_danger} onChange={(e) => setForm({ ...form, niveau_danger: e.target.value })}><option value="faible">faible</option><option value="moyen">moyen</option><option value="eleve">ÃƒÂ©levÃƒÂ©</option><option value="critique">critique</option></select></div>

        <div className="field"><label htmlFor="waste-country">Pays CEDEAO</label><select id="waste-country" value={form.pays_cedeao || "Benin"} onChange={(e) => setForm({ ...form, pays_cedeao: e.target.value })}>{CEDEAO_COUNTRIES.map((country) => <option key={country} value={country}>{country}</option>)}</select></div>
        <div className="field"><label htmlFor="waste-track">FiliÃƒÂ¨re cible</label><input id="waste-track" placeholder="Recyclage / biogaz / rÃƒÂ©gÃƒÂ©nÃƒÂ©ration..." value={form.filiere || ""} onChange={(e) => setForm({ ...form, filiere: e.target.value })} /></div>

        <div className="field" style={{ gridColumn: "1 / -1" }}><label htmlFor="waste-description">Description</label><textarea id="waste-description" placeholder="Ãƒâ€°tat, contamination, origine, process industriel..." value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
      </div>

      <p className="form-note">
        Conseil: pour les dÃƒÂ©chets organiques, prÃƒÂ©cisez lÃ¢â‚¬â„¢origine (abattoir, cuisine, marchÃƒÂ©, biodÃƒÂ©chets mÃƒÂ©nagers, boues biologiques) et lÃ¢â‚¬â„¢humiditÃƒÂ© si possible.
      </p>

      <h3 className="step-title">Ãƒâ€°tape 3 - DonnÃƒÂ©es physico-chimiques</h3>
      <p className="form-note">Prioritaires si elles sont renseignÃƒÂ©es. Sinon, WasteAI complÃƒÂ¨te avec la base scientifique.</p>
      <div className="form-grid">
        <div className="field"><label htmlFor="waste-pci">PCI (MJ/kg)</label><input id="waste-pci" type="number" step="0.1" placeholder="Ex: 28" value={form.pci_mj_kg || ""} onChange={(e) => setForm({ ...form, pci_mj_kg: e.target.value })} /></div>
        <div className="field"><label htmlFor="waste-lignin">Taux de lignine (%)</label><input id="waste-lignin" type="number" step="0.1" placeholder="Ex: 30" value={form.taux_lignine_pct || ""} onChange={(e) => setForm({ ...form, taux_lignine_pct: e.target.value })} /></div>

        <div className="field"><label htmlFor="waste-dbo">DBO (mg/L)</label><input id="waste-dbo" type="number" step="1" placeholder="Ex: 1400" value={form.dbo_mg_l || ""} onChange={(e) => setForm({ ...form, dbo_mg_l: e.target.value })} /></div>
        <div className="field"><label htmlFor="waste-dco">DCO (mg/L)</label><input id="waste-dco" type="number" step="1" placeholder="Ex: 2600" value={form.dco_mg_l || ""} onChange={(e) => setForm({ ...form, dco_mg_l: e.target.value })} /></div>
        <div className="field"><label htmlFor="waste-humidity">Taux d'humiditÃƒÂ© (%)</label><input id="waste-humidity" type="number" step="0.1" placeholder="Ex: 35" value={form.taux_humidite_pct || ""} onChange={(e) => setForm({ ...form, taux_humidite_pct: e.target.value })} /></div>

        <div className="field"><label htmlFor="waste-contamination">Taux de contamination (%)</label><input id="waste-contamination" type="number" step="0.1" placeholder="Ex: 15" value={form.taux_contamination_pct || ""} onChange={(e) => setForm({ ...form, taux_contamination_pct: e.target.value })} /></div>
        <div className="field"><label htmlFor="waste-plastic-type">Type plastique</label><input id="waste-plastic-type" placeholder="Ex: PET, PEHD, PVC" value={form.type_plastique || ""} onChange={(e) => setForm({ ...form, type_plastique: e.target.value })} /></div>

        <div className="field"><label htmlFor="waste-chlore">PrÃƒÂ©sence chlore</label><select id="waste-chlore" value={form.presence_chlore ?? ""} onChange={(e) => setForm({ ...form, presence_chlore: e.target.value })}><option value="">Non renseignÃƒÂ©</option><option value="true">Oui</option><option value="false">Non</option></select></div>
        <div className="field"><label htmlFor="waste-heavy-metals">MÃƒÂ©taux lourds</label><select id="waste-heavy-metals" value={form.presence_metaux_lourds ?? ""} onChange={(e) => setForm({ ...form, presence_metaux_lourds: e.target.value })}><option value="">Non renseignÃƒÂ©</option><option value="true">Oui</option><option value="false">Non</option></select></div>
      </div>

      <h3 className="step-title">Actions</h3>
      <div className="actions-row">
        <button className="btn btn-primary" type="button" onClick={onAnalyze} disabled={loading}>{loading ? "Analyse en cours..." : "Analyser"}</button>
        <button className="btn" type="button" onClick={onReset}>RÃƒÂ©initialiser</button>
        <button className="btn" type="button" onClick={onPrefill}>PrÃƒÂ©-remplir</button>
      </div>

      {loading ? (
        <div className="progress-wrap" aria-label="Progression analyse">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
    </section>
  )
}