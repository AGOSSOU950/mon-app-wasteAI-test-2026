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
  return `${CURRENCY.format(Number.isFinite(Number(value)) ? Number(value) : 0)} FCFA`
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
  return (
    <article className={`kpi-card kpi-${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{hint}</span>
    </article>
  )
}

function CompactChannel({ channel, isBest = false }) {
  if (!channel) return null
  const net = Number(channel.net_gain_per_ton || 0)
  return (
    <div className={`channel-card compact ${isBest ? "is-best" : ""}`}>
      <div className="channel-card-head">
        <div>
          <p className="channel-card-name">{channel.name}</p>
          <p className="channel-card-subtitle">{channel.kind === "buyer" ? "Acheteur direct" : "Canal de traitement"}</p>
        </div>
        {isBest ? <span className="channel-card-pill">Choix</span> : null}
      </div>
      <div className="channel-card-grid compact-grid">
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
    <section className="dashboard-wrap card">
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">Pilotage</p>
          <h2>Tableau de bord WasteAI</h2>
          <p>Lecture des flux, cohérence économique et voie recommandée dans un seul écran.</p>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading} className="btn btn-secondary">
          {loading ? "Actualisation..." : "Rafraîchir"}
        </button>
      </div>

      <div className="dashboard-kpis">
        <StatCard label="Gain total" value={formatCurrency(metrics.totalGain)} hint="Valeur valorisable" tone="positive" />
        <StatCard label="Coût total" value={formatCurrency(metrics.totalCost)} hint="Traitement et logistique" tone="negative" />
        <StatCard label="Solde net" value={formatCurrency(metrics.net)} hint={metrics.net >= 0 ? "Position positive" : "Position négative"} tone={metrics.net >= 0 ? "positive" : "negative"} />
        <StatCard label="Taux de valorisation" value={`${metrics.valorizationRate.toFixed(1)}%`} hint="Flux favorables" tone="amber" />
      </div>

      <div className="dashboard-graphs">
        <div className="graph-pane">
          <div className="dashboard-filters">
            <label>
              Mois
              <select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)}>
                <option value="all">Tous les mois</option>
                {monthOptions.map((month) => <option key={month} value={month}>{formatMonth(month)}</option>)}
              </select>
            </label>
            <label>
              Filière
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <option value="all">Toutes</option>
                {typeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
          </div>

          <div className="chart-shell">
            <div className="chart-head">
              <div>
                <h3>Tendance des flux</h3>
                <p>Gain et coût agrégés par mois</p>
              </div>
              <span className="chart-pill">{visibleLignes.length} flux</span>
            </div>
            <div className="chart-frame">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlySeries} margin={{ top: 10, right: 12, bottom: 6, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(164,177,171,0.14)" />
                  <XAxis dataKey="label" stroke="rgba(164,177,171,0.8)" tickLine={false} axisLine={{ stroke: "rgba(164,177,171,0.2)" }} />
                  <YAxis stroke="rgba(164,177,171,0.8)" tickLine={false} axisLine={{ stroke: "rgba(164,177,171,0.2)" }} tickFormatter={(value) => formatCurrency(value)} />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Line type="monotone" dataKey="gain" name="Gain" stroke="#74d2a5" strokeWidth={3} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="cost" name="Coût" stroke="#e05656" strokeWidth={3} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="graph-pane">
          <div className="channel-panel">
            <div className="chart-head">
              <div>
                <h3>Canal cohérent</h3>
                <p>Acheteur direct ou traitement</p>
              </div>
              <span className="chart-pill">Pilotage</span>
            </div>
            {channelContext && bestChannel ? (
              <div className="channel-highlight">
                <p className="eyebrow">Recommandé</p>
                <strong>{bestChannel.name}</strong>
                <span>{bestChannel.kind === "buyer" ? "Acheteur direct" : "Canal de traitement"}</span>
                <p>{channelContext.name} - {formatQuantity(channelContext.quantity)} - {channelContext.recommendation}</p>
                {!rankedChannels.hasDirectBuyer ? <p className="channel-note">Aucun acheteur direct pertinent. La voie de traitement sert de référence.</p> : null}
              </div>
            ) : (
              <p className="muted-line">Aucun canal pertinent pour l’instant.</p>
            )}

            <div className="channel-stack">
              {alternatives.map((channel, index) => <CompactChannel key={channel.id} channel={channel} isBest={index === 0} />)}
            </div>
          </div>

          <div className="recent-panel">
            <h3>Flux récents</h3>
            <div className="recent-list">
              {recentRows.map((row) => {
                const net = (row.gain_per_ton - row.cost_per_ton) * row.quantity
                const positive = net >= 0
                return (
                  <div key={row.id} className="recent-row">
                    <div className="recent-copy">
                      <p>{row.name}</p>
                      <span>{row.recommendation}</span>
                    </div>
                    <span className={`recent-badge ${positive ? "positive" : "negative"}`}>
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
