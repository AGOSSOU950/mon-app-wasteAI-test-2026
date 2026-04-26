import { useCallback, useEffect, useState } from "react"
import { apiClient } from "../api"

const EMPTY_PAYLOAD = {
  summary: null,
  history: [],
  meta: { recent_limit: 20, summary_window: 400, summary_total_records: 0 },
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) return []
  return rows.filter(Boolean)
}

function buildSummaryFromRows(rows) {
  const summary = rows.reduce(
    (acc, row) => {
      acc.total_analyses += 1
      acc.tonnes_valorisees += Number(row.quantite_kg || row.quantity_kg || 0) / 1000
      acc.co2_evite_kg += Number(row.co2_evite_kg || row.impact_co2_kg || 0)
      acc.revenus_generes_eur += Number(row.valeur_estimee || row.valeur_fcfa || 0)
      return acc
    },
    { total_analyses: 0, tonnes_valorisees: 0, co2_evite_kg: 0, revenus_generes_eur: 0 }
  )

  return {
    total_analyses: summary.total_analyses,
    tonnes_valorisees: Number(summary.tonnes_valorisees.toFixed(2)),
    co2_evite_kg: Number(summary.co2_evite_kg.toFixed(2)),
    revenus_generes_eur: Number(summary.revenus_generes_eur.toFixed(2)),
  }
}

export default function useAnalytics() {
  const [analytics, setAnalytics] = useState(EMPTY_PAYLOAD)
  const [dashboardLoading, setDashboardLoading] = useState(false)

  const refreshAnalytics = useCallback(async () => {
    setDashboardLoading(true)

    try {
      const compactRes = await apiClient.get(`/api/waste/analytics/compact`, {
        params: { recent_limit: 20, summary_window: 400 },
      })

      const payload = compactRes.data || {}
      const rows = normalizeRows(payload.history || payload.recent || payload.rows)
      const summary = payload.summary || buildSummaryFromRows(rows)

      setAnalytics({
        summary,
        history: rows.slice(0, 20),
        meta: payload.meta || EMPTY_PAYLOAD.meta,
      })
    } catch {
      try {
        const fallbackRes = await apiClient.get(`/api/waste/analytics`, {
          params: { limit: 100 },
        })

        const payload = fallbackRes.data || {}
        const rows = normalizeRows(
          Array.isArray(payload)
            ? payload
            : payload.history || payload.recent || payload.rows || payload.items
        )
        const summary = payload.summary || buildSummaryFromRows(rows)

        setAnalytics({
          summary,
          history: rows.slice(0, 20),
          meta: payload.meta || { recent_limit: 20, summary_window: 100, summary_total_records: rows.length },
        })
      } catch {
        setAnalytics(EMPTY_PAYLOAD)
      }
    } finally {
      setDashboardLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshAnalytics()
  }, [refreshAnalytics])

  return {
    analytics,
    dashboardLoading,
    refreshAnalytics,
  }
}
