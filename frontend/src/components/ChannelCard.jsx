import React from "react"

const money = (value) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(value || 0))

export default function ChannelCard({ channel, isBest = false, onContact, onSelect }) {
  if (!channel) return null

  return (
    <article className={`rounded-3xl border p-5 shadow-[0_18px_48px_rgba(2,6,23,0.22)] transition ${isBest ? "border-emerald-400 bg-emerald-50/95 ring-1 ring-emerald-400/40" : "border-slate-200 bg-white"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-semibold text-slate-950">{channel.name}</p>
          <p className="mt-1 text-sm text-slate-500">{channel.type}</p>
        </div>
        {isBest ? (
          <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white">
            {channel.kind === "buyer" ? "Acheteur #1" : "Traitement #1"}
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2 text-sm text-slate-700">
        <p><span className="font-medium text-slate-500">Type:</span> {channel.kind === "buyer" ? "Acheteur direct" : "Canal de traitement"}</p>
        <p><span className="font-medium text-slate-500">Location:</span> {channel.location}</p>
        <p><span className="font-medium text-slate-500">Distance:</span> {Number(channel.distance_km || 0)} km</p>
        <p><span className="font-medium text-slate-500">Cost / ton:</span> {money(channel.estimated_cost_per_ton)} FCFA</p>
        <p><span className="font-medium text-slate-500">Estimated gain:</span> {money(channel.potential_gain_per_ton)} FCFA</p>
        <p><span className="font-medium text-slate-500">Contact:</span> {channel.contact}</p>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => onContact?.(channel)}
          className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Send waste here
        </button>
        <button
          type="button"
          onClick={() => onSelect?.(channel)}
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-500 hover:text-slate-950"
        >
          View details
        </button>
      </div>
    </article>
  )
}