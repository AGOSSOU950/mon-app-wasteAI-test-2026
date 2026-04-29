import React, { useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
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

const COLORS = ["#10b981", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6", "#84cc16", "#14b8a6"]

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

function formatMonthValue(dateString) {
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

function MetricCard({ label, value, hint, tone = "neutral" }) {
  const toneClasses = {
    neutral: "from-slate-900 to-slate-800 border-slate-700",
    positive: "from-emerald-950 to-emerald-900 border-emerald-700/60",
    negative: "from-rose-950 to-rose-900 border-rose-700/60",
    amber: "from-amber-950 to-amber-900 border-amber-700/60",
  }

  return (
    <article className={`rounded-2xl border bg-gradient-to-br p-4 shadow-[0_18px_40px_rgba(2,6,23,0.35)] ${toneClasses[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <p className="mt-1 text-sm text-slate-400">{hint}</p>
    </article>
  )
}

function Panel({ title, subtitle, children, className = "" }) {
  return (
    <section className={`rounded-3xl border border-slate-800/80 bg-slate-950/90 p-5 shadow-[0_22px_70px_rgba(2,6,23,0.45)] ${className}`}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  )
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-950/95 px-4 py-3 shadow-2xl">
      <p className="text-sm font-semibold text-white">{label}</p>
      <div className="mt-2 space-y-1 text-sm text-slate-300">
        {payload.map((item) => (
          <p key={item.dataKey}>
            <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.name}: {formatCurrency(item.value)}
          </p>
        ))}
      </div>
    </div>
  )
}

function CompactChannelCard({ channel, isBest = false }) {
  if (!channel) return null
  const net = Number(channel.net_gain_per_ton || 0)
  return (
    <article className={`rounded-2xl border p-4 ${isBest ? "border-emerald-500/40 bg-emerald-500/10" : "border-slate-800 bg-slate-900/80"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{channel.name}</p>
          <p className="mt-1 text-xs text-slate-400">{channel.type}</p>
        </div>
        {isBest ? <span className="rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-950">Best</span> : null}
      </div>
      <div className="mt-3 grid gap-1 text-xs text-slate-300">
        <p>Distance: {Number(channel.distance_km || 0)} km</p>
        <p>Net gain / ton: {formatCurrency(net)}</p>
      </div>
    </article>
  )
}

function DashboardSection({ analytics, loading, onRefresh }) {
  const sourceRows = useMemo(() => {
    const analyticsRows = Array.isArray(analytics?.history) ? analytics.history.map(normalizeRow).filter(Boolean) : []
    return analyticsRows.length > 0 ? analyticsRows : MOCK_WASTE_DATA
  }, [analytics])

  const [monthFilter, setMonthFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")

  const monthOptions = useMemo(() => [...new Set(sourceRows.map((row) => row.date.slice(0, 7)).filter(Boolean))].sort((a, b) => b.localeCompare(a)), [sourceRows])
  const typeOptions = useMemo(() => [...new Set(sourceRows.map((row) => row.type).filter(Boolean))].sort(), [sourceRows])

  const visibleRows = useMemo(() => {
    return sourceRows.filter((row) => {
      const matchesMonth = monthFilter === "all" || row.date.slice(0, 7) === monthFilter
      const matchesType = typeFilter === "all" || row.type === typeFilter
      return matchesMonth && matchesType
    })
  }, [sourceRows, monthFilter, typeFilter])

  const metrics = useMemo(() => {
    const totalCost = visibleRows.reduce((sum, row) => sum + row.cost_per_ton * row.quantity, 0)
    const totalGain = visibleRows.reduce((sum, row) => sum + row.gain_per_ton * row.quantity, 0)
    const net = totalGain - totalCost
    const positiveRows = visibleRows.filter((row) => row.gain_per_ton > row.cost_per_ton).length
    const valorizationRate = visibleRows.length ? (positiveRows / visibleRows.length) * 100 : 0
    return { totalCost, totalGain, net, valorizationRate }
  }, [visibleRows])

  const monthlySeries = useMemo(() => {
    const map = new Map()
    visibleRows.forEach((row) => {
      const month = row.date.slice(0, 7)
      const current = map.get(month) || { month, cost: 0, gain: 0, label: formatMonthValue(month) }
      current.cost += row.cost_per_ton * row.quantity
      current.gain += row.gain_per_ton * row.quantity
      map.set(month, current)
    })
    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month))
  }, [visibleRows])

  const typeSeries = useMemo(() => {
    const map = new Map()
    visibleRows.forEach((row) => {
      const current = map.get(row.type) || { type: row.type, cost: 0, gain: 0, quantity: 0 }
      current.cost += row.cost_per_ton * row.quantity
      current.gain += row.gain_per_ton * row.quantity
      current.quantity += row.quantity
      map.set(row.type, current)
    })
    return [...map.values()].sort((a, b) => b.quantity - a.quantity)
  }, [visibleRows])

  const pieSeries = useMemo(() => {
    const map = new Map()
    visibleRows.forEach((row) => map.set(row.type, (map.get(row.type) || 0) + row.quantity))
    return [...map.entries()].map(([type, quantity]) => ({ type, quantity })).sort((a, b) => b.quantity - a.quantity)
  }, [visibleRows])

  const netRows = useMemo(() => {
    return [...visibleRows]
      .map((row) => ({ ...row, net: (row.gain_per_ton - row.cost_per_ton) * row.quantity }))
      .sort((a, b) => b.date.localeCompare(a.date) || b.net - a.net)
  }, [visibleRows])

  const latestWaste = visibleRows[0] || null
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
    if (!channelContext) return { best: null, alternatives: [], all: [] }
    return rankChannels(channelContext)
  }, [channelContext])

  const bestChannel = rankedChannels.best
  const topChannels = [bestChannel, ...rankedChannels.alternatives].filter(Boolean)
  const topTypeLabel = pieSeries.length ? pieSeries[0].type : "No data"
  const loadingBadge = loading ? "Refreshing..." : `${visibleRows.length} flows shown`

  return (
    <section className="rounded-[2rem] border border-slate-800 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.16),_transparent_35%),linear-gradient(180deg,_#0b1220_0%,_#020617_100%)] p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-400">WasteAI control tower</p>
          <h2 className="mt-2 text-3xl font-semibold text-white md:text-4xl">Industrial Waste Dashboard</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Financial and operational tracking of valorization, with direct linkage to local treatment channels.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300">
            {loadingBadge}
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Refreshing" : "Refresh data"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total cost (€)" value={formatCurrency(metrics.totalCost)} hint="Operational treatment cost" tone="negative" />
        <MetricCard label="Total gain (€)" value={formatCurrency(metrics.totalGain)} hint="Valorizable revenue" tone="positive" />
        <MetricCard label="Net balance (€)" value={formatCurrency(metrics.net)} hint={metrics.net >= 0 ? "Positive balance" : "Negative balance"} tone={metrics.net >= 0 ? "positive" : "negative"} />
        <MetricCard label="Valorization rate (%)" value={`${metrics.valorizationRate.toFixed(1)}%`} hint={`Top type: ${topTypeLabel}`} tone="amber" />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <Panel title="Filters" subtitle="View by month and waste type">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm text-slate-300">
              Month
              <select
                value={monthFilter}
                onChange={(event) => setMonthFilter(event.target.value)}
                className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-400"
              >
                <option value="all">All months</option>
                {monthOptions.map((month) => (
                  <option key={month} value={month}>{formatMonthValue(month)}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              Waste type
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
                className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-400"
              >
                <option value="all">All types</option>
                {typeOptions.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
            <span className="rounded-full border border-slate-700 px-3 py-1">Net = gain - cost</span>
            <span className="rounded-full border border-slate-700 px-3 py-1">Positive = green</span>
            <span className="rounded-full border border-slate-700 px-3 py-1">Negative = red</span>
          </div>
        </Panel>

        <Panel title="Operational snapshot" subtitle="Current filtered dataset">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Rows</p>
              <p className="mt-2 text-2xl font-semibold text-white">{visibleRows.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Best type</p>
              <p className="mt-2 text-2xl font-semibold text-white">{topTypeLabel}</p>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-sm text-slate-300">
            Selected filters drive every calculation and chart.
          </div>
        </Panel>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Panel title="Monthly evolution" subtitle="Cost vs gain over time">
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlySeries} margin={{ top: 10, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={{ stroke: "#334155" }} />
                <YAxis stroke="#94a3b8" tickLine={false} axisLine={{ stroke: "#334155" }} tickFormatter={(value) => formatCurrency(value)} />
                <Tooltip content={<ChartTooltip />} />
                <Legend />
                <Line type="monotone" dataKey="cost" name="Cost" stroke="#ef4444" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="gain" name="Gain" stroke="#22c55e" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Waste mix" subtitle="Distribution by type">
          <div className="grid gap-4 lg:grid-cols-[1fr_140px] lg:items-center">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip content={<ChartTooltip />} />
                  <Pie data={pieSeries} dataKey="quantity" nameKey="type" innerRadius={70} outerRadius={110} paddingAngle={3}>
                    {pieSeries.map((entry, index) => (
                      <Cell key={entry.type} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              {pieSeries.slice(0, 5).map((entry, index) => (
                <div key={entry.type} className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 px-3 py-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{entry.type}</p>
                    <p className="text-xs text-slate-400">{formatQuantity(entry.quantity)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Panel title="Cost and gain by waste type" subtitle="Grouped financial performance">
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={typeSeries} margin={{ top: 10, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="type" stroke="#94a3b8" tickLine={false} axisLine={{ stroke: "#334155" }} />
                <YAxis stroke="#94a3b8" tickLine={false} axisLine={{ stroke: "#334155" }} tickFormatter={(value) => formatCurrency(value)} />
                <Tooltip content={<ChartTooltip />} />
                <Legend />
                <Bar dataKey="cost" name="Cost" fill="#ef4444" radius={[8, 8, 0, 0]} />
                <Bar dataKey="gain" name="Gain" fill="#22c55e" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Local channels" subtitle="Best destination for the latest waste flow">
          {channelContext && bestChannel ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Recommended destination</p>
                <p className="mt-1 text-xl font-semibold text-white">{bestChannel.name}</p>
                <p className="mt-1 text-sm text-emerald-100/85">
                  For {channelContext.name} · {Number(channelContext.quantity || 0)} tons · {channelContext.recommendation}
                </p>
              </div>
              <div className="grid gap-3">
                {topChannels.map((channel, index) => (
                  <CompactChannelCard key={channel.id} channel={channel} isBest={index === 0} />
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No channel match available yet.</p>
          )}
        </Panel>
      </div>

      <Panel title="Waste table" subtitle="Filtered operational list">
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="min-w-full divide-y divide-slate-800 text-left">
            <thead className="bg-slate-900 text-xs uppercase tracking-[0.16em] text-slate-400">
              <tr>
                <th className="px-4 py-3">Waste name</th>
                <th className="px-4 py-3">Quantity</th>
                <th className="px-4 py-3">Recommendation</th>
                <th className="px-4 py-3">Cost / ton</th>
                <th className="px-4 py-3">Gain / ton</th>
                <th className="px-4 py-3">Net result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-950 text-sm text-slate-200">
              {netRows.length > 0 ? netRows.map((row) => {
                const net = (row.gain_per_ton - row.cost_per_ton) * row.quantity
                const positive = net >= 0
                return (
                  <tr key={row.id} className="transition hover:bg-slate-900/80">
                    <td className="px-4 py-4 font-medium text-white">{row.name}</td>
                    <td className="px-4 py-4">{formatQuantity(row.quantity)}</td>
                    <td className="px-4 py-4 text-slate-300">{row.recommendation}</td>
                    <td className="px-4 py-4">{formatCurrency(row.cost_per_ton)}</td>
                    <td className="px-4 py-4">{formatCurrency(row.gain_per_ton)}</td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${positive ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>
                        {formatCurrency(net)}
                      </span>
                    </td>
                  </tr>
                )
              }) : (
                <tr>
                  <td className="px-4 py-8 text-slate-400" colSpan={6}>No waste entries match the selected filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </section>
  )
}

export default DashboardSection
