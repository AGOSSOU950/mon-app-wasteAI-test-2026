import React, { useMemo } from "react"
import ChannelCard from "./ChannelCard"
import { filterChannels, rankChannels } from "../services/localChannelsEngine"

export default function ChannelsList({ result, channels = [], filters = {}, onContact, onSelect, onFilterChange }) {
  const ranked = useMemo(() => rankChannels(result || {}, channels), [result, channels])
  const visibleChannels = useMemo(() => filterChannels(ranked.all, filters), [ranked.all, filters])
  const best = visibleChannels[0] || ranked.best
  const alternatives = visibleChannels.slice(1, 3)

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] border border-slate-200 bg-gradient-to-br from-slate-950 to-slate-800 p-6 text-white shadow-[0_24px_80px_rgba(2,6,23,0.35)]">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-300">Local Waste Channels</p>
        <h2 className="mt-2 text-3xl font-semibold">Recommended destination</h2>
        <p className="mt-3 max-w-2xl text-sm text-slate-300">
          Marketplace coming soon. For now, connect directly with local treatment and recycling channels.
        </p>
        {best ? (
          <div className="mt-5 rounded-3xl border border-emerald-400/30 bg-emerald-500/10 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Best destination</p>
            <p className="mt-1 text-xl font-semibold text-white">{best.name}</p>
            <p className="mt-1 text-sm text-emerald-100/85">
              {best.type} · {Number(best.distance_km || 0)} km · net gain {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(best.net_gain_per_ton || 0))} FCFA / ton
            </p>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3">
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Max distance (km)
          <input
            type="range"
            min="10"
            max="200"
            step="5"
            value={filters.maxDistance ?? 100}
            onChange={(e) => onFilterChange?.({ ...filters, maxDistance: Number(e.target.value) })}
          />
          <span className="text-xs text-slate-500">Up to {filters.maxDistance ?? 100} km</span>
        </label>
        <label className="grid gap-2 text-sm font-medium text-slate-700 md:col-span-2">
          Waste type filter
          <input
            type="text"
            list="local-waste-types"
            value={filters.wasteType || ""}
            onChange={(e) => onFilterChange?.({ ...filters, wasteType: e.target.value })}
            placeholder="plastic waste, scrap metal, sludge..."
            className="rounded-2xl border border-slate-300 px-4 py-3"
          />
          <datalist id="local-waste-types">
            <option value="plastic waste" />
            <option value="scrap metal" />
            <option value="sludge" />
            <option value="industrial waste" />
            <option value="mineral waste" />
          </datalist>
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {visibleChannels.map((channel, index) => (
          <ChannelCard
            key={channel.id}
            channel={channel}
            isBest={index === 0}
            onContact={onContact}
            onSelect={onSelect}
          />
        ))}
      </div>

      {alternatives.length > 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Alternatives</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {alternatives.map((channel) => (
              <div key={`alt-${channel.id}`} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-950">{channel.name}</p>
                <p className="mt-1 text-slate-500">{channel.type} · {Number(channel.distance_km || 0)} km</p>
                <p className="mt-2 text-slate-600">Net gain: {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(channel.net_gain_per_ton || 0))} FCFA / ton</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
