import React, { useEffect, useMemo, useState } from "react"
import { matchLocalActors } from "../services/api"
import ChannelsList from "./ChannelsList"
import { CHANNELS, normalizeWasteType } from "../services/localChannelsEngine"
import { LOCAL_ACTORS } from "../data/localActors"

function inferContext(result) {
  if (!result) return {}
  return {
    name: result.name || result.nom_exact || result.nom || "DÃ©chet",
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
    hasMetals: Boolean(source.presence_metaux_lourds ?? form?.presence_metaux_lourds ?? form?.contient_metaux),
    hasChlorine: Boolean(source.presence_chlore ?? form?.presence_chlore),
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
      `Bonjour ${channel.name}, WasteAI recommande votre canal pour ${context.name} (${normalizedWasteType || context.wasteType || "dÃ©chet"}). QuantitÃ©: ${context.quantity || 0} tonnes. Merci de me recontacter.`,
    )
    if (String(channel.contact || "").includes("@")) {
      window.open(`mailto:${channel.contact}?subject=${encodeURIComponent("WasteAI - mise en relation")}&body=${text}`, "_blank", "noopener,noreferrer")
      return
    }
    const digits = String(channel.contact || "").replace(/[^\d+]/g, "")
    window.open(`https://wa.me/${digits.replace(/\+/g, "")}?text=${text}`, "_blank", "noopener,noreferrer")
  }

  return (
    <section className="space-y-5">
      <div className="rounded-[2rem] border border border-[#22303a] bg-[#0f1418] p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">OpÃ©rateurs locaux</p>
        <h2 className="mt-2 text-3xl font-semibold text-[#f8fffb]">RÃ©seau de valorisation</h2>
        <p className="mt-3 max-w-3xl text-sm text-[#aab4af]">
          Biogaz BÃ©nin, ReBin, Valdera, Songhai, SGDS et Gbogbeto couvrent les voies organiques, plastiques et Ã©nergÃ©tiques les plus utiles.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-[#12181d] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[#aab4af]">FiliÃ¨re</p>
            <p className="mt-2 text-lg font-semibold text-[#f8fffb]">{normalizedWasteType || "Non prÃ©cisÃ©e"}</p>
          </div>
          <div className="rounded-2xl bg-[#12181d] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[#aab4af]">QuantitÃ©</p>
            <p className="mt-2 text-lg font-semibold text-[#f8fffb]">{Number(context.quantity || 0)} t</p>
          </div>
          <div className="rounded-2xl bg-[#12181d] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[#aab4af]">Voie</p>
            <p className="mt-2 text-lg font-semibold text-[#f8fffb]">{context.recommendation || "Canal local"}</p>
          </div>
        </div>
      </div>

      <div className="rounded-[2rem] border border border-[#22303a] bg-[#0f1418] p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">Acteurs locaux pertinents</p>
        <h3 className="mt-2 text-2xl font-semibold text-[#f8fffb]">RÃ©sultat du matching</h3>
        <p className="mt-2 text-sm text-[#aab4af]">BasÃ© sur les contraintes du flux, les solutions recommandÃ©es et la prioritÃ© locale.</p>
        {actorLoading ? <p className="mt-4 text-sm text-[#aab4af]">Matching en cours...</p> : null}
        {actorError ? <p className="mt-4 text-sm text-amber-700">{actorError}</p> : null}
        {!actorLoading && !actorError && actorMatches.length === 0 ? (
          <p className="mt-4 text-sm text-[#aab4af]">Aucun acteur local pertinent identifiÃ© pour ce flux.</p>
        ) : null}
        <div className="mt-4 grid gap-3">
          {actorMatches.map((item, index) => (
            <div key={`${item.name}-${index}`} className={`rounded-2xl border p-4 ${index === 0 ? "border border-[#204136] bg-[#11211c]" : "border-slate-200 bg-[#12181d]"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-[#f8fffb]">{item.name}</p>
                  <p className="mt-1 text-sm text-[#aab4af]">{item.justification}</p>
                </div>
                <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">{item.score}/100</span>
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
