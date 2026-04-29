import React from "react"
import LocalWasteChannelsSection from "./LocalWasteChannelsSection"
import { FEATURES } from "../config/features"

export default function RecommendedChannelsSection({ result }) {
  return (
    <section className="space-y-4">
      <div className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">Marketplace désactivée</p>
        <p className="mt-2 text-sm text-amber-100/85">Bientôt disponible. En attendant, contactez directement les opérateurs locaux recommandés.</p>
        <p className="mt-2 text-xs text-amber-100/70">Statut: {FEATURES.marketplace ? "activée" : "désactivée"}</p>
      </div>
      <LocalWasteChannelsSection result={result} />
    </section>
  )
}