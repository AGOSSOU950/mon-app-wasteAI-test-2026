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
  "cimenterie",
  "chimie",
  "petrole_gaz",
  "pharmaceutique",
  "metalurgie",
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
  "biodégradable",
  "biodéchets ménagers",
  "déchets alimentaires",
  "déchets d'abattoir",
  "boues organiques",
  "plastique",
  "textile",
  "papier_carton",
  "metal",
  "verre",
  "caoutchouc",
  "bois",
  "biomasse",
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
        <h2>Préparer un flux exploitable</h2>
        <p className="analysis-subtitle">
          Renseignez le minimum utile pour obtenir une lecture rapide, une voie cohérente et un cadre de conformité clair.
        </p>
      </div>

      {photoAiEnabled ? (
        <>
          <h3 className="step-title">Étape 1 - Photo</h3>
          <div className={`upload-zone ${identifyLoading ? "scan-overlay" : ""}`}>
            <p><strong>Déposez une photo</strong> ou cliquez pour choisir</p>
            <small>JPG, PNG, WEBP</small>
            <label htmlFor="waste-photo" className="sr-only">Photo du déchet</label>
            <input id="waste-photo" type="file" accept="image/*" onChange={onImageChange} />
            <div className="actions-row">
              <button className="btn" type="button" onClick={onIdentify} disabled={identifyLoading}>{identifyLoading ? "Identification..." : "Relancer"}</button>
            </div>
            <div style={{ marginTop: 10 }}>
              <small>{identifyLoading ? (identifyLoadingMessage || "Analyse en cours...") : "Identification automatique au chargement. Vérifiez puis validez."}</small>
            </div>
          </div>
        </>
      ) : null}

      <h3 className="step-title" style={{ marginTop: photoAiEnabled ? 16 : 0 }}>Étape 2 - Informations utiles</h3>
      <div className="form-grid">
        <div className="field"><label htmlFor="waste-name">Nom du déchet</label><input id="waste-name" placeholder="Ex: boues huileuses, restes alimentaires" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} /></div>
        <div className="field"><label htmlFor="waste-qty">Quantité (kg)</label><input id="waste-qty" type="number" placeholder="Ex: 500" value={form.quantite_kg} onChange={(e) => setForm({ ...form, quantite_kg: e.target.value })} /></div>

        <div className="field"><label htmlFor="waste-category">Catégorie</label><select id="waste-category" value={form.categorie} onChange={(e) => setForm({ ...form, categorie: e.target.value })}><option value="organique">organique</option><option value="biodégradable">biodégradable</option><option value="biodéchets ménagers">biodéchets ménagers</option><option value="déchets alimentaires">déchets alimentaires</option><option value="déchets d'abattoir">déchets d'abattoir</option><option value="boues organiques">boues organiques</option><option value="textile">textile</option><option value="plastique">plastique</option><option value="papier">papier</option><option value="metal">metal</option><option value="biomasse">biomasse</option><option value="chimique">chimique</option><option value="verre">verre</option><option value="e_waste">e_waste</option><option value="autre">autre</option></select></div>
        <div className="field"><label htmlFor="waste-type">Type</label><select id="waste-type" value={form.type_dechet} onChange={(e) => setForm({ ...form, type_dechet: e.target.value })}>{WASTE_TYPES.map((w) => <option key={w} value={w}>{w}</option>)}</select></div>

        <div className="field"><label htmlFor="waste-industry">Industrie</label><select id="waste-industry" value={form.type_industrie} onChange={(e) => setForm({ ...form, type_industrie: e.target.value })}>{INDUSTRY_OPTIONS.map((i) => <option key={i} value={i}>{i}</option>)}</select></div>
        <div className="field"><label htmlFor="waste-danger">Niveau de danger</label><select id="waste-danger" value={form.niveau_danger} onChange={(e) => setForm({ ...form, niveau_danger: e.target.value })}><option value="faible">faible</option><option value="moyen">moyen</option><option value="eleve">élevé</option><option value="critique">critique</option></select></div>

        <div className="field"><label htmlFor="waste-country">Pays CEDEAO</label><select id="waste-country" value={form.pays_cedeao || "Benin"} onChange={(e) => setForm({ ...form, pays_cedeao: e.target.value })}>{CEDEAO_COUNTRIES.map((country) => <option key={country} value={country}>{country}</option>)}</select></div>
        <div className="field"><label htmlFor="waste-track">Filière cible</label><input id="waste-track" placeholder="Recyclage / biogaz / régénération..." value={form.filiere || ""} onChange={(e) => setForm({ ...form, filiere: e.target.value })} /></div>

        <div className="field" style={{ gridColumn: "1 / -1" }}><label htmlFor="waste-description">Description</label><textarea id="waste-description" placeholder="État, contamination, origine, process industriel..." value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
      </div>

      <p style={{ margin: "10px 0 0", color: "var(--muted)", fontSize: 13 }}>
        Conseil: pour les déchets organiques, précisez l’origine (abattoir, cuisine, marché, biodéchets ménagers, boues biologiques) et l’humidité si possible.
      </p>

      <h3 className="step-title" style={{ marginTop: 16 }}>Étape 3 - Données physico-chimiques</h3>
      <p style={{ margin: "0 0 10px", color: "var(--muted)" }}>
        Prioritaires si elles sont renseignées. Sinon, WasteAI complète avec la base scientifique.
      </p>
      <div className="form-grid">
        <div className="field"><label htmlFor="waste-pci">PCI (MJ/kg)</label><input id="waste-pci" type="number" step="0.1" placeholder="Ex: 28" value={form.pci_mj_kg || ""} onChange={(e) => setForm({ ...form, pci_mj_kg: e.target.value })} /></div>
        <div className="field"><label htmlFor="waste-lignin">Taux de lignine (%)</label><input id="waste-lignin" type="number" step="0.1" placeholder="Ex: 30" value={form.taux_lignine_pct || ""} onChange={(e) => setForm({ ...form, taux_lignine_pct: e.target.value })} /></div>

        <div className="field"><label htmlFor="waste-dbo">DBO (mg/L)</label><input id="waste-dbo" type="number" step="1" placeholder="Ex: 1400" value={form.dbo_mg_l || ""} onChange={(e) => setForm({ ...form, dbo_mg_l: e.target.value })} /></div>
        <div className="field"><label htmlFor="waste-dco">DCO (mg/L)</label><input id="waste-dco" type="number" step="1" placeholder="Ex: 2600" value={form.dco_mg_l || ""} onChange={(e) => setForm({ ...form, dco_mg_l: e.target.value })} /></div>
        <div className="field"><label htmlFor="waste-humidity">Taux d'humidité (%)</label><input id="waste-humidity" type="number" step="0.1" placeholder="Ex: 35" value={form.taux_humidite_pct || ""} onChange={(e) => setForm({ ...form, taux_humidite_pct: e.target.value })} /></div>

        <div className="field"><label htmlFor="waste-contamination">Taux de contamination (%)</label><input id="waste-contamination" type="number" step="0.1" placeholder="Ex: 15" value={form.taux_contamination_pct || ""} onChange={(e) => setForm({ ...form, taux_contamination_pct: e.target.value })} /></div>
        <div className="field"><label htmlFor="waste-plastic-type">Type plastique</label><input id="waste-plastic-type" placeholder="Ex: PET, PEHD, PVC" value={form.type_plastique || ""} onChange={(e) => setForm({ ...form, type_plastique: e.target.value })} /></div>

        <div className="field"><label htmlFor="waste-chlore">Présence chlore</label><select id="waste-chlore" value={form.presence_chlore ?? ""} onChange={(e) => setForm({ ...form, presence_chlore: e.target.value })}><option value="">Non renseigné</option><option value="true">Oui</option><option value="false">Non</option></select></div>
        <div className="field"><label htmlFor="waste-heavy-metals">Métaux lourds</label><select id="waste-heavy-metals" value={form.presence_metaux_lourds ?? ""} onChange={(e) => setForm({ ...form, presence_metaux_lourds: e.target.value })}><option value="">Non renseigné</option><option value="true">Oui</option><option value="false">Non</option></select></div>

        <div className="field"><label htmlFor="waste-cement">Opérateur cimenterie autorisé</label><select id="waste-cement" value={form.filiere_cimenterie_autorisee ?? ""} onChange={(e) => setForm({ ...form, filiere_cimenterie_autorisee: e.target.value })}><option value="">Non renseigné</option><option value="true">Oui</option><option value="false">Non</option></select></div>
      </div>

      <h3 className="step-title" style={{ marginTop: 16 }}>Actions</h3>
      <div className="actions-row">
        <button className="btn btn-primary" type="button" onClick={onAnalyze} disabled={loading}>{loading ? "Analyse en cours..." : "Analyser"}</button>
        <button className="btn" type="button" onClick={onReset}>Réinitialiser</button>
        <button className="btn" type="button" onClick={onPrefill}>Pré-remplir</button>
      </div>

      {loading ? (
        <div className="progress-wrap" aria-label="Progression analyse">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
    </section>
  )
}
