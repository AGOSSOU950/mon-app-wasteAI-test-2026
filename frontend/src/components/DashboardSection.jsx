import React, { useMemo, useState } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { rankChannels } from "../services/localChannelsEngine"

const CURRENCY = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
})

const NUMBER = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
})

const MONTH_LABEL = new Intl.DateTimeFormat("fr-FR", {
  month: "short",
  year: "2-digit",
})

const TYPE_BENCHMARKS = {
  plastic: { cost_per_ton: 120, gain_per_ton: 260 },
  organic: { cost_per_ton: 95, gain_per_ton: 210 },
  metal: { cost_per_ton: 180, gain_per_ton: 390 },
  paper: { cost_per_ton: 110, gain_per_ton: 190 },
  textile: { cost_per_ton: 130, gain_per_ton: 220 },
  electronic: { cost_per_ton: 220, gain_per_ton: 420 },
  glass: { cost_per_ton: 90, gain_per_ton: 170 },
  mixed: { cost_per_ton: 140, gain_per_ton: 200 },
}

const MOCK_WASTE_DATA = [
  { id: 1, name: "Film PE industriel", quantity: 14, recommendation: "Recyclage matière", cost_per_ton: 120, gain_per_ton: 260, date: "2026-01-12", type: "plastic" },
  { id: 2, name: "Boues organiques", quantity: 22, recommendation: "Méthanisation", cost_per_ton: 95, gain_per_ton: 210, date: "2026-01-26", type: "organic" },
  { id: 3, name: "Ferraille légère", quantity: 18, recommendation: "Recyclage métal", cost_per_ton: 180, gain_per_ton: 390, date: "2026-02-03", type: "metal" },
  { id: 4, name: "Carton compacté", quantity: 11, recommendation: "Valorisation matière", cost_per_ton: 110, gain_per_ton: 190, date: "2026-02-18", type: "paper" },
  { id: 5, name: "Textiles de coupe", quantity: 9, recommendation: "Réemploi / fibres", cost_per_ton: 130, gain_per_ton: 220, date: "2026-03-04", type: "textile" },
  { id: 6, name: "Déchets électroniques", quantity: 6, recommendation: "Traitement spécialisé", cost_per_ton: 220, gain_per_ton: 420, date: "2026-03-19", type: "electronic" },
  { id: 7, name: "Verre trié", quantity: 15, recommendation: "Recyclage matière", cost_per_ton: 90, gain_per_ton: 170, date: "2026-04-02", type: "glass" },
  { id: 8, name: "Déchets mixtes stabilisés", quantity: 20, recommendation: "Co-traitement", cost_per_ton: 140, gain_per_ton: 200, date: "2026-04-15", type: "mixed" },
]

function formatCurrency(value) {
  return CURRENCY.format(Number.isFinite(Number(value)) ? Number(value) : 0)
}

function formatQuantity(value) {
  return `${NUMBER.format(Number.isFinite(Number(value)) ? Number(value) : 0)} t`
}

function formatMonth(dateString) {
  const date = new Date(`${dateString}-01T00:00:00`)
  return Number.isNaN(date.getTime()) ? dateString : MONTH_LABEL.format(date)
}

function normalizeType(value) {
  const raw = String(value || "mixed").toLowerCase()
  if (raw.includes("plast")) return "plastic"
  if (raw.includes("organ")) return "organic"
  if (raw.includes("metal")) return "metal"
  if (raw.includes("paper") || raw.includes("carton")) return "paper"
  if (raw.includes("text")) return "textile"
  if (raw.includes("elect")) return "electronic"
  if (raw.includes("glass") || raw.includes("verre")) return "glass"
  return raw || "mixed"
}

function inferTypeFromRecommendation(value) {
  const raw = String(value || "").toLowerCase()
  if (raw.includes("metal")) return "metal"
  if (raw.includes("organ") || raw.includes("methan")) return "organic"
  if (raw.includes("paper") || raw.includes("carton")) return "paper"
  if (raw.includes("text")) return "textile"
  if (raw.includes("elect")) return "electronic"
  if (raw.includes("glass") || raw.includes("verre")) return "glass"
  if (raw.includes("plastic")) return "plastic"
  return "mixed"
}

function normalizeRow(row, index = 0) {
  if (!row) return null
  const inferredType = normalizeType(
    row.type || row.waste_type || row.type_dechet || row.categorie || row.category || inferTypeFromRecommendation(row.recommendation || row.decision || row.decision_principale),
  )
  const benchmark = TYPE_BENCHMARKS[inferredType] || TYPE_BENCHMARKS.mixed
  const rawQuantity = Number(row.quantity ?? row.quantite_kg ?? row.quantity_kg ?? row.quantite ?? 0)
  const quantity = Number.isFinite(rawQuantity) && rawQuantity > 50 ? rawQuantity / 1000 : rawQuantity || 0
  const date = String(row.date || row.created_at || new Date().toISOString().slice(0, 10)).slice(0, 10)
  const recommendation = String(row.recommendation || row.decision_principale || row.decision || row.mode_valorisation_propose || "Aucune recommandation")
  const costPerTon = Number(row.cost_per_ton ?? row.cout_estime_fcfa_tonne ?? benchmark.cost_per_ton)
  const gainPerTon = Number(row.gain_per_ton ?? row.valeur_estimee_fcfa_tonne ?? benchmark.gain_per_ton)

  return {
    id: Number(row.id ?? index + 1),
    name: String(row.name || row.nom || row.waste_name || `Déchet ${index + 1}`),
    quantity: Number.isFinite(quantity) ? quantity : 0,
    recommendation,
    cost_per_ton: Number.isFinite(costPerTon) ? costPerTon : benchmark.cost_per_ton,
    gain_per_ton: Number.isFinite(gainPerTon) ? gainPerTon : benchmark.gain_per_ton,
    date,
    type: inferredType,
  }
}

function StatCard({ label, value, hint, tone = "neutral" }) {
  const tones = {
    neutral: "border-slate-200 bg-white",
    positive: "border-emerald-200 bg-emerald-50",
    negative: "border-rose-200 bg-rose-50",
    amber: "border-amber-200 bg-amber-50",
  }

  return (
    <article className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      <p className="mt-1 text-sm text-slate-600">{hint}</p>
    </article>
  )
}

function CompactChannel({ channel, isBest = false }) {
  if (!channel) return null
  const net = Number(channel.net_gain_per_ton || 0)
  return (
    <div className={`rounded-2xl border p-4 ${isBest ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">{channel.name}</p>
          <p className="text-sm text-slate-600">{channel.kind === "buyer" ? "Acheteur direct" : "Canal de traitement"}</p>
        </div>
        {isBest ? <span className="rounded-full bg-emerald-600 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">Choix</span> : null}
      </div>
      <div className="mt-3 grid gap-1 text-sm text-slate-600">
        <p>{channel.location}</p>
        <p>{Number(channel.distance_km || 0)} km</p>
        <p>{formatCurrency(net)} / t</p>
      </div>
    </div>
  )
}

function DashboardSection({ analytics, loading, onRefresh }) {
  const sourceLignes = useMemo(() => {
    const analyticsLignes = Array.isArray(analytics?.history) ? analytics.history.map(normalizeRow).filter(Boolean) : []
    return analyticsLignes.length > 0 ? analyticsLignes : MOCK_WASTE_DATA
  }, [analytics])

  const [monthFilter, setMonthFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")

  const monthOptions = useMemo(() => [...new Set(sourceLignes.map((row) => row.date.slice(0, 7)).filter(Boolean))].sort((a, b) => b.localeCompare(a)), [sourceLignes])
  const typeOptions = useMemo(() => [...new Set(sourceLignes.map((row) => row.type).filter(Boolean))].sort(), [sourceLignes])

  const visibleLignes = useMemo(() => sourceLignes.filter((row) => {
    const matchesMonth = monthFilter === "all" || row.date.slice(0, 7) === monthFilter
    const matchesType = typeFilter === "all" || row.type === typeFilter
    return matchesMonth && matchesType
  }), [sourceLignes, monthFilter, typeFilter])

  const metrics = useMemo(() => {
    const totalCost = visibleLignes.reduce((sum, row) => sum + row.cost_per_ton * row.quantity, 0)
    const totalGain = visibleLignes.reduce((sum, row) => sum + row.gain_per_ton * row.quantity, 0)
    const net = totalGain - totalCost
    const positiveCount = visibleLignes.filter((row) => row.gain_per_ton > row.cost_per_ton).length
    const valorizationRate = visibleLignes.length ? (positiveCount / visibleLignes.length) * 100 : 0
    return { totalCost, totalGain, net, valorizationRate }
  }, [visibleLignes])

  const monthlySeries = useMemo(() => {
    const map = new Map()
    visibleLignes.forEach((row) => {
      const month = row.date.slice(0, 7)
      const current = map.get(month) || { month, cost: 0, gain: 0, label: formatMonth(month) }
      current.cost += row.cost_per_ton * row.quantity
      current.gain += row.gain_per_ton * row.quantity
      map.set(month, current)
    })
    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month))
  }, [visibleLignes])

  const latestWaste = visibleLignes[0] || null
  const channelContext = useMemo(() => {
    if (!latestWaste) return null
    return {
      name: latestWaste.name,
      quantity: latestWaste.quantity,
      recommendation: latestWaste.recommendation,
      wasteType: latestWaste.type,
    }
  }, [latestWaste])

  const rankedChannels = useMemo(() => {
    if (!channelContext) return { best: null, directBuyer: null, treatmentChannel: null, alternatives: [], hasDirectBuyer: false }
    return rankChannels(channelContext)
  }, [channelContext])

  const bestChannel = rankedChannels.directBuyer || rankedChannels.treatmentChannel || rankedChannels.best || null
  const alternatives = rankedChannels.alternatives.slice(0, 2)
  const recentRows = [...visibleLignes].slice(0, 4)

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)] md:p-6">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Pilotage WasteAI</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900 md:text-3xl">Résumé de valorisation</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">Un seul écran pour lire les chiffres clés, le canal le plus cohérent et les derniers flux.</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Actualisation" : "Rafraîchir"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Gain total" value={formatCurrency(metrics.totalGain)} hint="Revenu valorisable" tone="positive" />
        <StatCard label="Coût total" value={formatCurrency(metrics.totalCost)} hint="Traitement et logistique" tone="negative" />
        <StatCard label="Solde net" value={formatCurrency(metrics.net)} hint={metrics.net >= 0 ? "Position positive" : "Position négative"} tone={metrics.net >= 0 ? "positive" : "negative"} />
        <StatCard label="Taux de valorisation" value={`${metrics.valorizationRate.toFixed(1)}%`} hint="Part des flux favorables" tone="amber" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-600">
                Mois
                <select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none">
                  <option value="all">Tous les mois</option>
                  {monthOptions.map((month) => <option key={month} value={month}>{formatMonth(month)}</option>)}
                </select>
              </label>
              <label className="grid gap-2 text-sm text-slate-600">
                Filière
                <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none">
                  <option value="all">Toutes</option>
                  {typeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Tendance mensuelle</h3>
                <p className="text-sm text-slate-600">Coût et gain agrégés</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{visibleLignes.length} flux</span>
            </div>
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlySeries} margin={{ top: 10, right: 12, bottom: 6, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" stroke="#64748b" tickLine={false} axisLine={{ stroke: "#cbd5e1" }} />
                  <YAxis stroke="#64748b" tickLine={false} axisLine={{ stroke: "#cbd5e1" }} tickFormatter={(value) => formatCurrency(value)} />
                  <Tooltip />
                  <Line type="monotone" dataKey="gain" name="Gain" stroke="#16a34a" strokeWidth={3} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="cost" name="Coût" stroke="#dc2626" strokeWidth={3} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Canal cohérent</h3>
                <p className="text-sm text-slate-600">Acheteur direct ou traitement</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Pilotage</span>
            </div>
            {channelContext && bestChannel ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Recommandé</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">{bestChannel.name}</p>
                  <p className="mt-1 text-sm text-slate-600">{bestChannel.kind === "buyer" ? "Acheteur direct" : "Canal de traitement"}</p>
                  <p className="mt-2 text-sm text-slate-700">{channelContext.name} - {formatQuantity(channelContext.quantity)} - {channelContext.recommendation}</p>
                  {!rankedChannels.hasDirectBuyer ? <p className="mt-2 text-sm text-amber-700">Aucun acheteur direct pertinent, on privilégie la voie de traitement cohérente.</p> : null}
                </div>
                <div className="grid gap-3">
                  {alternatives.map((channel, index) => <CompactChannel key={channel.id} channel={channel} isBest={index === 0} />)}
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-600">Aucun canal pertinent pour l’instant.</p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-lg font-semibold text-slate-900">Derniers flux</h3>
            <div className="mt-3 space-y-3">
              {recentRows.map((row) => {
                const net = (row.gain_per_ton - row.cost_per_ton) * row.quantity
                const positive = net >= 0
                return (
                  <div key={row.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{row.name}</p>
                      <p className="text-sm text-slate-600">{row.recommendation}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${positive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                      {formatCurrency(net)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default DashboardSection
