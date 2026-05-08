import React from "react"

const CEDEAO_COUNTRIES = [
  "Bénin",
  "Burkina Faso",
  "Cap-Vert",
  "Côte d'Ivoire",
  "Gambie",
  "Ghana",
  "Guinée",
  "Guinée-Bissau",
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
  { value: "organique", label: "Organique" },
  { value: "biodégradable", label: "Biodégradable" },
  { value: "biodéchets ménagers", label: "Biodéchets ménagers" },
  { value: "déchets alimentaires", label: "Déchets alimentaires" },
  { value: "déchets d'abattoir", label: "Déchets d'abattoir" },
  { value: "boues organiques", label: "Boues organiques" },
  { value: "plastique", label: "Plastique" },
  { value: "textile", label: "Textile" },
  { value: "papier_carton", label: "Papier / carton" },
  { value: "metal", label: "Métal" },
  { value: "verre", label: "Verre" },
  { value: "caoutchouc", label: "Caoutchouc" },
  { value: "bois", label: "Bois" },
  { value: "biomasse", label: "Biomasse" },
  { value: "biomasse_lignocellulosique", label: "Biomasse lignocellulosique" },
  { value: "boues", label: "Boues" },
  { value: "huiles_usees", label: "Huiles usées" },
  { value: "solvants", label: "Solvants" },
  { value: "dechets_chimiques", label: "Déchets chimiques" },
  { value: "dechets_biomedicaux", label: "Déchets biomédicaux" },
  { value: "e_waste", label: "E-waste" },
  { value: "gravats", label: "Gravats" },
  { value: "autre", label: "Autre" },
]

function Field({ id, label, children, help }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {help ? <small className="field-help">{help}</small> : null}
    </div>
  )
}

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
          Renseignez l'essentiel pour obtenir une lecture rapide, une voie cohérente et un cadre de conformité clair.
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
              <button className="btn" type="button" onClick={onIdentify} disabled={identifyLoading}>
                {identifyLoading ? "Identification..." : "Relancer"}
              </button>
            </div>
            <small>{identifyLoading ? (identifyLoadingMessage || "Analyse en cours...") : "Identification automatique au chargement. Vérifiez puis validez."}</small>
          </div>
        </>
      ) : null}

      <h3 className="step-title" style={{ marginTop: photoAiEnabled ? 16 : 0 }}>Étape 2 - Informations utiles</h3>
      <div className="form-grid">
        <Field id="waste-name" label="Nom du déchet">
          <input id="waste-name" placeholder="Ex: boues huileuses, restes alimentaires" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
        </Field>

        <Field id="waste-qty" label="Quantité (kg)">
          <input id="waste-qty" type="number" placeholder="Ex: 500" value={form.quantite_kg} onChange={(e) => setForm({ ...form, quantite_kg: e.target.value })} />
        </Field>

        <Field id="waste-category" label="Catégorie">
          <select
            id="waste-category"
            value={form.categorie}
            onChange={(e) => setForm({ ...form, categorie: e.target.value, type_dechet: e.target.value === "biomasse_lignocellulosique" ? "biomasse_lignocellulosique" : form.type_dechet })}
          >
            <option value="organique">Organique</option>
            <option value="biodégradable">Biodégradable</option>
            <option value="biodéchets ménagers">Biodéchets ménagers</option>
            <option value="déchets alimentaires">Déchets alimentaires</option>
            <option value="déchets d'abattoir">Déchets d'abattoir</option>
            <option value="boues organiques">Boues organiques</option>
            <option value="textile">Textile</option>
            <option value="plastique">Plastique</option>
            <option value="papier">Papier</option>
            <option value="metal">Métal</option>
            <option value="biomasse">Biomasse</option>
            <option value="biomasse_lignocellulosique">Biomasse lignocellulosique</option>
            <option value="chimique">Chimique</option>
            <option value="verre">Verre</option>
            <option value="e_waste">E-waste</option>
            <option value="autre">Autre</option>
          </select>
        </Field>

        <Field id="waste-type" label="Type" help="Pour les coques, bagasse, sciure ou bois, choisissez Biomasse lignocellulosique.">
          <select id="waste-type" value={form.type_dechet} onChange={(e) => setForm({ ...form, type_dechet: e.target.value })}>
            {WASTE_TYPES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </Field>

        <Field id="waste-industry" label="Industrie">
          <select id="waste-industry" value={form.type_industrie} onChange={(e) => setForm({ ...form, type_industrie: e.target.value })}>
            {INDUSTRY_OPTIONS.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </Field>

        <Field id="waste-danger" label="Niveau de danger">
          <select id="waste-danger" value={form.niveau_danger} onChange={(e) => setForm({ ...form, niveau_danger: e.target.value })}>
            <option value="faible">Faible</option>
            <option value="moyen">Moyen</option>
            <option value="eleve">Élevé</option>
            <option value="critique">Critique</option>
          </select>
        </Field>

        <Field id="waste-country" label="Pays CEDEAO">
          <select id="waste-country" value={form.pays_cedeao || "Bénin"} onChange={(e) => setForm({ ...form, pays_cedeao: e.target.value })}>
            {CEDEAO_COUNTRIES.map((country) => (
              <option key={country} value={country}>{country}</option>
            ))}
          </select>
        </Field>

        <Field id="waste-track" label="Filière cible">
          <input id="waste-track" placeholder="Recyclage / biogaz / régénération..." value={form.filiere || ""} onChange={(e) => setForm({ ...form, filiere: e.target.value })} />
        </Field>

        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="waste-description">Description</label>
          <textarea id="waste-description" placeholder="État, contamination, origine, process industriel..." value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
      </div>

      <p className="form-note">
        Conseil: pour les déchets organiques, précisez l'origine (abattoir, cuisine, marché, biodéchets ménagers, boues biologiques) et l'humidité si possible.
      </p>

      <h3 className="step-title">Étape 3 - Données physico-chimiques</h3>
      <p className="form-note">Prioritaires si elles sont renseignées. Sinon, WasteAI complète avec la base scientifique.</p>
      <div className="form-grid">
        <Field id="waste-pci" label="PCI (MJ/kg)">
          <input id="waste-pci" type="number" step="0.1" placeholder="Ex: 28" value={form.pci_mj_kg || ""} onChange={(e) => setForm({ ...form, pci_mj_kg: e.target.value })} />
        </Field>

        <Field id="waste-lignin" label="Taux de lignine (%)">
          <input id="waste-lignin" type="number" step="0.1" placeholder="Ex: 30" value={form.taux_lignine_pct || ""} onChange={(e) => setForm({ ...form, taux_lignine_pct: e.target.value })} />
        </Field>

        <Field id="waste-dbo" label="DBO (mg/L)">
          <input id="waste-dbo" type="number" step="1" placeholder="Ex: 1400" value={form.dbo_mg_l || ""} onChange={(e) => setForm({ ...form, dbo_mg_l: e.target.value })} />
        </Field>

        <Field id="waste-dco" label="DCO (mg/L)">
          <input id="waste-dco" type="number" step="1" placeholder="Ex: 2600" value={form.dco_mg_l || ""} onChange={(e) => setForm({ ...form, dco_mg_l: e.target.value })} />
        </Field>

        <Field id="waste-humidity" label="Taux d'humidité (%)">
          <input id="waste-humidity" type="number" step="0.1" placeholder="Ex: 35" value={form.taux_humidite_pct || ""} onChange={(e) => setForm({ ...form, taux_humidite_pct: e.target.value })} />
        </Field>

        <Field id="waste-contamination" label="Taux de contamination (%)">
          <input id="waste-contamination" type="number" step="0.1" placeholder="Ex: 15" value={form.taux_contamination_pct || ""} onChange={(e) => setForm({ ...form, taux_contamination_pct: e.target.value })} />
        </Field>

        <Field id="waste-plastic-type" label="Type plastique">
          <input id="waste-plastic-type" placeholder="Ex: PET, PEHD, PVC" value={form.type_plastique || ""} onChange={(e) => setForm({ ...form, type_plastique: e.target.value })} />
        </Field>

        <Field id="waste-chlore" label="Présence chlore">
          <select id="waste-chlore" value={form.presence_chlore ?? ""} onChange={(e) => setForm({ ...form, presence_chlore: e.target.value })}>
            <option value="">Non renseigné</option>
            <option value="true">Oui</option>
            <option value="false">Non</option>
          </select>
        </Field>

        <Field id="waste-heavy-metals" label="Métaux lourds">
          <select id="waste-heavy-metals" value={form.presence_metaux_lourds ?? ""} onChange={(e) => setForm({ ...form, presence_metaux_lourds: e.target.value })}>
            <option value="">Non renseigné</option>
            <option value="true">Oui</option>
            <option value="false">Non</option>
          </select>
        </Field>
      </div>

      <h3 className="step-title">Actions</h3>
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

