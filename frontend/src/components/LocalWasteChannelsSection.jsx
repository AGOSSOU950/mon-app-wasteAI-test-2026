import React, { useMemo, useState } from "react"
import ChannelsList from "./ChannelsList"
import { CHANNELS, normalizeWasteType } from "../services/localChannelsEngine"

function inferContext(result) {
  if (!result) return {}
  return {
    name: result.name || result.nom_exact || result.nom || "Waste item",
    quantity: Number(result.quantity || result.quantite_kg || 0),
    recommendation: result.recommendation || result.decision_principale || result.decision || result?.valorisation_1?.methode || "",
    wasteType: result.waste_type || result.filiere || result.type || result.categorie || "",
  }
}

export default function LocalWasteChannelsSection({ result }) {
  const [filters, setFilters] = useState({ maxDistance: 100, wasteType: "" })
  const context = useMemo(() => inferContext(result), [result])
  const normalizedWasteType = normalizeWasteType(context.wasteType)

  function handleContact(channel) {
    const text = encodeURIComponent(
      `Bonjour ${channel.name}, WasteAI recommande votre canal pour ${context.name} (${normalizedWasteType || context.wasteType || "waste"}). Quantité: ${context.quantity || 0} tonnes. Merci de me recontacter.`,
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
      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">Local Waste Channels</p>
        <h2 className="mt-2 text-3xl font-semibold text-slate-950">Turn recommendations into action</h2>
        <p className="mt-3 max-w-3xl text-sm text-slate-600">
          Marketplace coming soon. For now, connect directly with recommended local operators.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Waste type</p>
            <p className="mt-2 text-lg font-semibold text-slate-950">{normalizedWasteType || "Not specified"}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Quantity</p>
            <p className="mt-2 text-lg font-semibold text-slate-950">{Number(context.quantity || 0)} tons</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Recommendation</p>
            <p className="mt-2 text-lg font-semibold text-slate-950">{context.recommendation || "Local treatment channel"}</p>
          </div>
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
