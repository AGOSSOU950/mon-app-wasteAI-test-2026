import React, { useEffect, useMemo, useState } from "react"
import { matchLocalActors } from "../services/api"
import ChannelsList from "./ChannelsList"
import { CHANNELS, normalizeWasteType } from "../services/localChannelsEngine"
import { LOCAL_ACTORS } from "../data/localActors"

function inferContext(result) {
  if (!result) return {}
  return {
    name: result.name || result.nom_exact || result.nom || "Déchet",
    quantity: Number(result.quantity || result.quantite_kg || 0),
    recommendation: result.recommendation || result.decision_principale || result.decision || result?.valorisation_1?.methode || "",
    wasteType: result.waste_type || result.filiere || result.type || result.categorie || "",
  }
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function parseMaybeBoolean(value) {
  if (value === true || value === false) return value
  const normalized = normalizeText(value)
  if (["true", "1", "oui", "yes"].includes(normalized)) return true
  if (["false", "0", "non", "no"].includes(normalized)) return false
  return null
}

function extractRecommendedSolutions(result) {
  const raw = [
    result?.decision_principale,
    result?.decision,
    result?.valorisation_1?.methode,
    result?.resume_choix,
    ...(Array.isArray(result?.alternatives) ? result.alternatives.map((item) => item?.solution || item?.filiere || item?.nom) : []),
    ...(Array.isArray(result?.scores_par_voie) ? result.scores_par_voie.map((item) => item?.solution || item?.filiere || item?.nom) : []),
  ]

  const cleaned = []
  for (const value of raw) {
    const text = String(value || "").trim()
    if (text && !cleaned.includes(text)) cleaned.push(text)
  }
  return cleaned.slice(0, 4)
}

function buildActors() {
  return LOCAL_ACTORS
}

function buildWasteSignal(result, form, family) {
  const source = result || {}
  return {
    family: family || normalizeWasteType(source.filiere || form?.categorie || form?.type_dechet || ""),
    humidity: Number(source.taux_humidite_pct ?? form?.taux_humidite_pct ?? 0),
    PCI: Number(source.pci_mj_kg ?? form?.pci_mj_kg ?? 0),
    DCO: Number(source.dco_mg_l ?? form?.dco_mg_l ?? 0),
    DBO: Number(source.dbo_mg_l ?? form?.dbo_mg_l ?? 0),
    contamination: Number(source.taux_contamination_pct ?? form?.taux_contamination_pct ?? 0),
    hasMetals: Boolean(parseMaybeBoolean(source.presence_metaux_lourds ?? form?.presence_metaux_lourds ?? form?.contient_metaux)),
    hasChlorine: Boolean(parseMaybeBoolean(source.presence_chlore ?? form?.presence_chlore)),
  }
}

export default function LocalWasteChannelsSection({ result, form }) {
  const [filters, setFilters] = useState({ maxDistance: 100, wasteType: "" })
  const [actorMatches, setActorMatches] = useState([])
  const [actorLoading, setActorLoading] = useState(false)
  const [actorError, setActorError] = useState("")
  const context = useMemo(() => inferContext(result), [result])
  const normalizedWasteType = normalizeWasteType(context.wasteType)
  const actors = useMemo(() => buildActors(), [])
  const waste = useMemo(() => buildWasteSignal(result, form, normalizedWasteType), [result, form, normalizedWasteType])
  const recommendedSolutions = useMemo(() => extractRecommendedSolutions(result), [result])

  useEffect(() => {
    let cancelled = false
    async function run() {
      setActorLoading(true)
      setActorError("")
      try {
        const items = await matchLocalActors({ waste, recommendedSolutions, actors })
        if (!cancelled) setActorMatches(Array.isArray(items) ? items.slice(0, 3) : [])
      } catch (error) {
        if (!cancelled) {
          setActorMatches([])
          setActorError(error?.response?.data?.detail || "Matching local indisponible.")
        }
      } finally {
        if (!cancelled) setActorLoading(false)
      }
    }

    if (actors.length > 0 && recommendedSolutions.length > 0) {
      run()
    } else {
      setActorMatches([])
    }

    return () => {
      cancelled = true
    }
  }, [actors, recommendedSolutions, waste])

  function handleContact(channel) {
    const text = encodeURIComponent(
      `Bonjour ${channel.name}, WasteAI recommande votre canal pour ${context.name} (${normalizedWasteType || context.wasteType || "déchet"}). Quantité: ${context.quantity || 0} tonnes. Merci de me recontacter.`,
    )
    if (String(channel.contact || "").includes("@")) {
      window.open(`mailto:${channel.contact}?subject=${encodeURIComponent("WasteAI - mise en relation")}&body=${text}`, "_blank", "noopener,noreferrer")
      return
    }
    const digits = String(channel.contact || "").replace(/[^\d+]/g, "")
    window.open(`https://wa.me/${digits.replace(/\+/g, "")}?text=${text}`, "_blank", "noopener,noreferrer")
  }

  return (
    <section className="local-channels">
      <div className="local-channels-summary card">
        <p className="eyebrow">Opérateurs locaux</p>
        <h3>Réseau de valorisation</h3>
        <p>
          Biogaz Bénin, ReBin, Valdera, Songhai, SGDS et Gbogbeto couvrent les voies organiques, plastiques et
          énergétiques les plus utiles.
        </p>
        <div className="local-channels-facts">
          <div>
            <span>Filière</span>
            <strong>{normalizedWasteType || "Non précisée"}</strong>
          </div>
          <div>
            <span>Quantité</span>
            <strong>{Number(context.quantity || 0)} t</strong>
          </div>
          <div>
            <span>Voie</span>
            <strong>{String(context.recommendation || "Canal local")}</strong>
          </div>
        </div>
      </div>

      <div className="local-channels-match card">
        <p className="eyebrow">Acteurs locaux pertinents</p>
        <h4>Résultat du matching</h4>
        <p>Basé sur les contraintes du flux, les solutions recommandées et la priorité locale.</p>
        {actorLoading ? <p className="muted-line">Matching en cours...</p> : null}
        {actorError ? <p className="warn soft">{actorError}</p> : null}
        {!actorLoading && !actorError && actorMatches.length === 0 ? (
          <p className="muted-line">Aucun acteur local pertinent identifié pour ce flux.</p>
        ) : null}
        <div className="local-channels-match-list">
          {actorMatches.map((item, index) => (
            <div key={`${item.name}-${index}`} className={`local-channel-card ${index === 0 ? "is-best" : ""}`}>
              <div className="local-channel-head">
                <div>
                  <p>{String(item?.name || "Opérateur local")}</p>
                  <span>{String(item?.justification || "Compatible avec le flux")}</span>
                </div>
                <strong>{String(Math.round(Number(item?.score || 0)))} /100</strong>
              </div>
            </div>
          ))}
        </div>
      </div>

      <ChannelsList
        result={context}
        channels={CHANNELS}
        filters={filters}
        onFilterChange={setFilters}
        onContact={handleContact}
      />
    </section>
  )
}


