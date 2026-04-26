import React from "react"

export default function AnalysisForm({
  form,
  setForm,
  imagePreview,
  identifyLoading,
  loading,
  progress,
  onImageChange,
  onIdentify,
  onAnalyze,
  onReset,
  onExampleTextile,
  onExamplePlastic,
  onExamplePaper,
  onPrefill,
}) {
  return (
    <section className="card analysis-wrap" id="analysis-form">
      <h3 className="step-title">Etape 1 - Upload photo</h3>
      <div className={`upload-zone ${identifyLoading ? "scan-overlay" : ""}`}>
        <p><strong>Glissez votre photo ici</strong> ou cliquez pour choisir</p>
        <small>Formats: JPG, PNG, WEBP</small>
        <label htmlFor="waste-photo" className="sr-only">Photo du dechet</label>
        <input id="waste-photo" type="file" accept="image/*" capture="environment" onChange={onImageChange} />
        {imagePreview ? <img className="photo-preview" src={imagePreview} alt="Apercu" loading="lazy" decoding="async" /> : null}
        <div className="actions-row">
          <button className="btn" type="button" onClick={onIdentify} disabled={identifyLoading}>{identifyLoading ? "Identification..." : "Identifier avec IA"}</button>
        </div>
      </div>

      <h3 className="step-title" style={{ marginTop: 16 }}>Etape 2 - Informations complementaires</h3>
      <div className="form-grid">
        <div className="field"><label htmlFor="waste-name">Nom du dechet</label><input id="waste-name" placeholder="Ex: Chutes de tissu coton" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} /></div>
        <div className="field"><label htmlFor="waste-qty">Quantite (kg)</label><input id="waste-qty" type="number" placeholder="Ex: 500" value={form.quantite_kg} onChange={(e) => setForm({ ...form, quantite_kg: e.target.value })} /></div>

        <div className="field"><label htmlFor="waste-category">Categorie</label><select id="waste-category" value={form.categorie} onChange={(e) => setForm({ ...form, categorie: e.target.value })}><option value="textile">textile</option><option value="plastique">plastique</option><option value="papier">papier</option><option value="metal">metal</option><option value="organique">organique</option><option value="chimique">chimique</option><option value="autre">autre</option></select></div>
        <div className="field"><label htmlFor="waste-type">Type</label><select id="waste-type" value={form.type_dechet} onChange={(e) => setForm({ ...form, type_dechet: e.target.value })}><option value="textile">textile</option><option value="plastique">plastique</option><option value="autre">autre</option></select></div>

        <div className="field"><label htmlFor="waste-industry">Industrie</label><select id="waste-industry" value={form.type_industrie} onChange={(e) => setForm({ ...form, type_industrie: e.target.value })}><option value="textile">textile</option><option value="agroalimentaire">agroalimentaire</option><option value="chimie">chimie</option><option value="autre">autre</option></select></div>
        <div className="field"><label htmlFor="waste-danger">Niveau de danger</label><select id="waste-danger" value={form.niveau_danger} onChange={(e) => setForm({ ...form, niveau_danger: e.target.value })}><option value="faible">faible</option><option value="moyen">moyen</option><option value="eleve">eleve</option><option value="critique">critique</option></select></div>

        <div className="field"><label htmlFor="waste-country">Pays CEDEAO</label><input id="waste-country" placeholder="Benin" value={form.pays_cedeao || ""} onChange={(e) => setForm({ ...form, pays_cedeao: e.target.value })} /></div>
        <div className="field"><label htmlFor="waste-track">Filiere cible</label><input id="waste-track" placeholder="Textile / Plastique / Papier" value={form.filiere || ""} onChange={(e) => setForm({ ...form, filiere: e.target.value })} /></div>

        <div className="field" style={{ gridColumn: "1 / -1" }}><label htmlFor="waste-description">Description</label><textarea id="waste-description" placeholder="Precisez l'etat, la contamination, l'origine..." value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
      </div>

      <h3 className="step-title" style={{ marginTop: 16 }}>Etape 2 bis - Caracteristiques physico-chimiques (optionnel)</h3>
      <p style={{ margin: "0 0 10px", color: "var(--muted)" }}>
        Si vous renseignez ces donnees, elles sont prioritaires. Sinon, WasteAI complete automatiquement avec la base scientifique.
      </p>
      <div className="form-grid">
        <div className="field"><label htmlFor="waste-pci">PCI (MJ/kg)</label><input id="waste-pci" type="number" step="0.1" placeholder="Ex: 28" value={form.pci_mj_kg || ""} onChange={(e) => setForm({ ...form, pci_mj_kg: e.target.value })} /></div>
        <div className="field"><label htmlFor="waste-lignin">Taux de lignine (%)</label><input id="waste-lignin" type="number" step="0.1" placeholder="Ex: 30" value={form.taux_lignine_pct || ""} onChange={(e) => setForm({ ...form, taux_lignine_pct: e.target.value })} /></div>

        <div className="field"><label htmlFor="waste-dbo">DBO (mg/L)</label><input id="waste-dbo" type="number" step="1" placeholder="Ex: 1400" value={form.dbo_mg_l || ""} onChange={(e) => setForm({ ...form, dbo_mg_l: e.target.value })} /></div>
        <div className="field"><label htmlFor="waste-dco">DCO (mg/L)</label><input id="waste-dco" type="number" step="1" placeholder="Ex: 2600" value={form.dco_mg_l || ""} onChange={(e) => setForm({ ...form, dco_mg_l: e.target.value })} /></div>

        <div className="field"><label htmlFor="waste-contamination">Taux contamination (%)</label><input id="waste-contamination" type="number" step="0.1" placeholder="Ex: 15" value={form.taux_contamination_pct || ""} onChange={(e) => setForm({ ...form, taux_contamination_pct: e.target.value })} /></div>
        <div className="field"><label htmlFor="waste-plastic-type">Type plastique</label><input id="waste-plastic-type" placeholder="Ex: PET, PEHD, PVC" value={form.type_plastique || ""} onChange={(e) => setForm({ ...form, type_plastique: e.target.value })} /></div>

        <div className="field"><label htmlFor="waste-chlore">Presence chlore</label><select id="waste-chlore" value={form.presence_chlore ?? ""} onChange={(e) => setForm({ ...form, presence_chlore: e.target.value })}><option value="">Non renseigne</option><option value="true">Oui</option><option value="false">Non</option></select></div>
      </div>

      <h3 className="step-title" style={{ marginTop: 16 }}>Etape 3 - Actions</h3>
      <div className="actions-row">
        <button className="btn btn-primary" type="button" onClick={onAnalyze} disabled={loading}>{loading ? "Analyse en cours..." : "Analyser"}</button>
        <button className="btn btn-secondary" type="button" onClick={onExampleTextile}>Exemple textile</button>
        <button className="btn btn-secondary" type="button" onClick={onExamplePlastic}>Exemple plastique</button>
        <button className="btn btn-secondary" type="button" onClick={onExamplePaper}>Exemple papier</button>
        <button className="btn" type="button" onClick={onReset}>Reinitialiser</button>
        <button className="btn" type="button" onClick={onPrefill}>Pre-remplir scientifique</button>
      </div>

      {loading ? (
        <div className="progress-wrap" aria-label="Progression analyse">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
    </section>
  )
}
