import { useCallback, useState } from "react"
import { apiClient } from "../api"

const EMPTY_PAYLOAD = {
  summary: null,
  history: [],
  meta: { recent_limit: 20, summary_window: 400, summary_total_records: 0 }
}

export default function useAnalytics(onError) {
  const [analytics, setAnalytics] = useState(EMPTY_PAYLOAD)
  const [dashboardLoading, setDashboardLoading] = useState(false)

  const refreshAnalytics = useCallback(async () => {
    setDashboardLoading(true)
    try {
      const compactRes = await apiClient.get(`/api/waste/analytics/compact`, {
        params: { recent_limit: 20, summary_window: 400 }
      })
      setAnalytics(compactRes.data || EMPTY_PAYLOAD)
    } catch (compactErr) {
      try {
        const fallbackRes = await apiClient.get(`/api/waste/analytics`, {
          params: { limit: 100 }
        })
        const rows = Array.isArray(fallbackRes.data) ? fallbackRes.data : []
        const summary = rows.reduce(
          (acc, row) => {
            acc.total_analyses += 1
            acc.tonnes_valorisees += Number(row.quantite_kg || 0) / 1000
            acc.co2_evite_kg += Number(row.co2_evite_kg || 0)
            acc.revenus_generes_eur += Number(row.valeur_estimee || 0)
            return acc
          },
          { total_analyses: 0, tonnes_valorisees: 0, co2_evite_kg: 0, revenus_generes_eur: 0 }
        )

        setAnalytics({
          summary: {
            total_analyses: summary.total_analyses,
            tonnes_valorisees: Number(summary.tonnes_valorisees.toFixed(2)),
            co2_evite_kg: Number(summary.co2_evite_kg.toFixed(2)),
            revenus_generes_eur: Number(summary.revenus_generes_eur.toFixed(2)),
          },
          history: rows.slice(0, 20),
          meta: { recent_limit: 20, summary_window: 100, summary_total_records: rows.length }
        })
      } catch {
        if (typeof onError === "function") {
          const status = compactErr?.response?.status
          onError(status ? `Dashboard indisponible (code ${status}).` : "Impossible de charger le tableau de bord.")
        }
      }
    } finally {
      setDashboardLoading(false)
    }
  }, [onError])

  return {
    analytics,
    dashboardLoading,
    refreshAnalytics,
  }
}





