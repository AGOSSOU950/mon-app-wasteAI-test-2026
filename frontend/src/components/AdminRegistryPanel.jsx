import React, { useEffect, useMemo, useState } from "react"
import { getValorizationRegistry, getValorizationRegistryAudit, getValorizationRegistryTemplate, updateValorizationRegistry } from "../services/api"

function safeStringify(value) {
  return JSON.stringify(value, null, 2)
}

function parseJson(text) {
  try {
    return { data: JSON.parse(text), error: "" }
  } catch (error) {
    return { data: null, error: error?.message || "JSON invalide" }
  }
}

function FilierePreview({ filiere }) {
  const economics = filiere?.economics || {}
  return (
    <article className="admin-filiere-card">
      <div className="admin-filiere-head">
        <div>
          <h4>{filiere?.nom || filiere?.id || "Filiere"}</h4>
          <p>{filiere?.id || "id inconnu"} - {filiere?.type || "type inconnu"}</p>
        </div>
        <span className="admin-chip">{filiere?.score_base ?? 0} pts base</span>
      </div>
      <p className="admin-muted">
        Cout: {Number(economics?.treatment_cost_fcfa_tonne || 0).toLocaleString("fr-FR")} FCFA/t | Valeur: {Number(economics?.market_value_fcfa_tonne || 0).toLocaleString("fr-FR")} FCFA/t
      </p>
      <p className="admin-muted">
        CO2 evite: {Number(economics?.co2_avoided_kg_tonne || 0).toLocaleString("fr-FR")} kg/t
      </p>
      {filiere?.contraintes && Object.keys(filiere.contraintes).length > 0 ? (
        <p className="admin-muted">Contraintes: {Object.entries(filiere.contraintes).map(([key, value]) => `${key}=${String(value)}`).join(", ")}</p>
      ) : (
        <p className="admin-muted">Contraintes: aucune contrainte externe</p>
      )}
    </article>
  )
}

export default function AdminRegistryPanel() {
  const [registryText, setRegistryText] = useState("")
  const [templateText, setTemplateText] = useState("")
  const [adminKey, setAdminKey] = useState(() => window.localStorage.getItem("wasteai_admin_key") || "")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [status, setStatus] = useState("")
  const [audit, setAudit] = useState(null)

  const parsed = useMemo(() => parseJson(registryText), [registryText])
  const registry = parsed.data
  const filieres = Array.isArray(registry?.filieres) ? registry.filieres : []

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      setLoading(true)
      setError("")
      try {
        const [current, template, auditPayload] = await Promise.all([
          getValorizationRegistry(),
          getValorizationRegistryTemplate(),
          getValorizationRegistryAudit(),
        ])
        if (cancelled) return
        setRegistryText(safeStringify(current))
        setTemplateText(safeStringify(template))
        setAudit(auditPayload)
      } catch (err) {
        if (!cancelled) setError(err?.message || "Impossible de charger le registre.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadData()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleReload() {
    setLoading(true)
    setError("")
    try {
      const [current, template, auditPayload] = await Promise.all([
        getValorizationRegistry(),
        getValorizationRegistryTemplate(),
        getValorizationRegistryAudit(),
      ])
      setRegistryText(safeStringify(current))
      setTemplateText(safeStringify(template))
      setAudit(auditPayload)
      setStatus("Registre recharge")
    } catch (err) {
      setError(err?.message || "Impossible de recharger le registre.")
    } finally {
      setLoading(false)
    }
  }

  function handleRestoreTemplate() {
    if (!templateText) return
    setRegistryText(templateText)
    setStatus("Template charge dans l'editeur")
  }

  async function handleSave() {
    const parsedPayload = parseJson(registryText)
    if (!parsedPayload.data) {
      setError(parsedPayload.error || "JSON invalide")
      return
    }

    const payload = parsedPayload.data
    if (!payload.version || !Array.isArray(payload.filieres) || payload.filieres.length === 0) {
      setError("Le registre doit contenir une version et une liste non vide de filieres.")
      return
    }

    setSaving(true)
    setError("")
    setStatus("")
    try {
      const response = await updateValorizationRegistry(payload, adminKey.trim())
      if (adminKey.trim()) {
        window.localStorage.setItem("wasteai_admin_key", adminKey.trim())
      }
      const auditPayload = await getValorizationRegistryAudit()
      setRegistryText(safeStringify(response?.data || payload))
      setAudit(auditPayload)
      setStatus("Registre enregistre avec succes")
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Echec de sauvegarde du registre.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card admin-wrap">
      <div className="admin-header">
        <div>
          <h2>Administration du registre de valorisation</h2>
          <p className="admin-muted">Edition directe du JSON des filieres. Le moteur reste generique: tu ajoutes, modifies ou retires des filieres sans changer le code de calcul.</p>
        </div>
        <div className="admin-actions">
          <button className="btn" type="button" onClick={handleReload} disabled={loading}>{loading ? "Chargement..." : "Recharger"}</button>
          <button className="btn btn-secondary" type="button" onClick={handleRestoreTemplate} disabled={!templateText}>Charger template</button>
          <button className="btn btn-primary" type="button" onClick={handleSave} disabled={saving}>{saving ? "Sauvegarde..." : "Sauver"}</button>
        </div>
      </div>

      <div className="admin-toolbar">
        <div className="field">
          <label>Cle admin</label>
          <input value={adminKey} onChange={(event) => setAdminKey(event.target.value)} placeholder="x-admin-key" />
        </div>
        <div className="admin-metadata">
          <p><strong>Version:</strong> {registry?.version || "n/a"}</p>
          <p><strong>Filiere(s):</strong> {filieres.length}</p>
          <p><strong>Etat:</strong> {status || (loading ? "Chargement en cours" : "Pret")}</p>
        </div>
      </div>

      <div className="admin-audit">
        <h3>Audit du registre</h3>
        <div className="admin-audit-grid">
          <p><strong>Sante:</strong> {audit?.healthy ? "OK" : "A corriger"}</p>
          <p><strong>Problemes:</strong> {audit?.issues_count ?? 0}</p>
          <p><strong>Poids moyen:</strong> {audit?.weight_range?.avg ?? "n/a"}</p>
          <p><strong>Derniere MAJ:</strong> {audit?.updated_at || "n/a"}</p>
        </div>
        {Array.isArray(audit?.issues) && audit.issues.length > 0 ? (
          <ul className="admin-audit-list">
            {audit.issues.slice(0, 8).map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : (
          <p className="admin-muted">Aucune anomalie detectee sur le registre.</p>
        )}
      </div>

      <div className="admin-grid">
        <div className="admin-editor">
          <h3>JSON du registre</h3>
          <textarea
            className="admin-textarea"
            rows={26}
            value={registryText}
            onChange={(event) => setRegistryText(event.target.value)}
            spellCheck={false}
          />
          {parsed.error ? <p className="warn">{parsed.error}</p> : null}
          {error ? <p className="warn">{error}</p> : null}
        </div>

        <div className="admin-preview">
          <h3>Preview filieres</h3>
          <div className="admin-preview-list">
            {filieres.length > 0 ? filieres.map((filiere) => (
              <FilierePreview key={filiere?.id || filiere?.nom} filiere={filiere} />
            )) : <p className="admin-muted">Aucune filiere chargee.</p>}
          </div>
        </div>
      </div>
    </section>
  )
}
