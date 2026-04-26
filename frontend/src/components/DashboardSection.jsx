import React, { useMemo } from "react"

function formatMetric(value, options = {}) {
  const n = Number(value || 0)
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: options.maximumFractionDigits ?? 0,
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
  }).format(Number.isFinite(n) ? n : 0)
}

function byMonth(history) {
  const map = new Map()
  ;(history || []).forEach((row) => {
    const date = String(row?.created_at || row?.date || "")
    const key = date.slice(0, 7) || "inconnu"
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-6)
}

export default function DashboardSection({ analytics, loading, onRefresh }) {
  const summary = analytics?.summary || {}
  const history = Array.isArray(analytics?.history) ? analytics.history : []

  const stats = useMemo(() => {
    const textile = history.filter((x) => String(x?.type_dechet || "").includes("textile")).length
    const plastique = history.filter((x) => String(x?.type_dechet || "").includes("plastique")).length
    const papier = history.filter((x) => String(x?.categorie || "").includes("papier")).length
    return { textile, plastique, papier }
  }, [history])

  const total = Math.max(1, stats.textile + stats.plastique + stats.papier)
  const tPct = Math.round((stats.textile / total) * 100)
  const pPct = Math.round((stats.plastique / total) * 100)
  const paPct = Math.max(0, 100 - tPct - pPct)

  const monthly = byMonth(history)
  const maxMonthly = Math.max(1, ...monthly.map((x) => x[1]))
  const lastFive = history.slice(0, 5)

  return (
    <section className="card dashboard-wrap">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Dashboard Analytics</h3>
        <button className="btn" type="button" onClick={onRefresh}>{loading ? "Actualisation..." : "Actualiser"}</button>
      </div>

      <div className="dashboard-kpis" style={{ marginTop: 10 }}>
        <article className="kpi-card"><span>Total analyses</span><strong>{formatMetric(summary.total_analyses)}</strong></article>
        <article className="kpi-card"><span>Textiles identifies</span><strong>{formatMetric(stats.textile)}</strong></article>
        <article className="kpi-card"><span>Plastiques identifies</span><strong>{formatMetric(stats.plastique)}</strong></article>
        <article className="kpi-card"><span>Papiers identifies</span><strong>{formatMetric(stats.papier)}</strong></article>
      </div>

      <div className="dashboard-graphs">
        <article className="graph-pane">
          <h4>Repartition filieres</h4>
          <div className="pie" style={{ background: `conic-gradient(#1565c0 0 ${tPct}%, #f59e0b ${tPct}% ${tPct + pPct}%, #22c55e ${tPct + pPct}% 100%)` }} />
          <p>Textile {tPct}% | Plastique {pPct}% | Papier {paPct}%</p>
        </article>

        <article className="graph-pane">
          <h4>Analyses par mois</h4>
          <div className="bar-chart">
            {monthly.map(([month, value]) => {
              const h = Math.max(12, Math.round((value / maxMonthly) * 150))
              return (
                <div className="bar-col" key={month}>
                  <div className="bar" style={{ height: `${h}px` }} />
                  <small>{month.slice(5)}</small>
                </div>
              )
            })}
          </div>
        </article>
      </div>

      <article className="graph-pane" style={{ marginTop: 10 }}>
        <h4>5 dernieres analyses</h4>
        <ul>
          {lastFive.map((row, idx) => (
            <li key={`recent-${idx}`}>{String(row?.created_at || row?.date || "-").slice(0, 10)} - {row?.nom || "-"} - {row?.decision || row?.mode_valorisation_propose || "-"}</li>
          ))}
        </ul>
      </article>

      <article className="benin-hotspots">
        <h4 style={{ marginTop: 0 }}>Carte Benin - points chauds (estimation)</h4>
        <p>Cotonou: eleve | Porto-Novo: moyen | Parakou: eleve | Abomey: moyen</p>
      </article>
    </section>
  )
}
