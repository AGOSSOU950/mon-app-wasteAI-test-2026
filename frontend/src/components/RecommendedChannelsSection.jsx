import React from "react"
import LocalWasteChannelsSection from "./LocalWasteChannelsSection"
import { FEATURES } from "../config/features"

export default function RecommendedChannelsSection({ result }) {
  return (
    <section className="space-y-4">
      <div className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">Marketplace disabled</p>
        <p className="mt-2 text-sm text-amber-100/85">
          Marketplace coming soon. For now, connect directly with recommended local operators.
        </p>
        <p className="mt-2 text-xs text-amber-100/70">Feature flag: {FEATURES.marketplace ? "enabled" : "disabled"}</p>
      </div>
      <LocalWasteChannelsSection result={result} />
    </section>
  )
}
