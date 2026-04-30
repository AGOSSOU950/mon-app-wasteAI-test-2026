import React from "react"
import LocalWasteChannelsSection from "./LocalWasteChannelsSection"

export default function RecommendedChannelsSection({ result, form }) {
  return (
    <section className="space-y-4">
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">Canaux recommandés</p>
        <p className="mt-2 text-sm text-emerald-900/85">Contact direct des opérateurs locaux les plus cohérents pour ce flux.</p>
        <p className="mt-2 text-xs text-emerald-900/70">Biogaz, compost, biochar et recyclage matière sont mis en avant selon la filière.</p>
      </div>
      <LocalWasteChannelsSection result={result} form={form} />
    </section>
  )
}
