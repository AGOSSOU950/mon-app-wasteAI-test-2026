import React, { useMemo } from "react"
import ChannelCard from "./ChannelCard"
import { filterChannels, rankChannels } from "../services/localChannelsEngine"

export default function ChannelsList({ result, channels = [], filters = {}, onContact, onSelect, onFilterChange }) {
  const ranked = useMemo(() => rankChannels(result || {}, channels), [result, channels])
  const visibleChannels = useMemo(() => filterChannels(ranked.all, filters), [ranked.all, filters])
  const relevantChannels = visibleChannels.filter((channel) => Number(channel.match_score || 0) >= 55)
  const bestBuyer = relevantChannels.find((channel) => channel.kind === "buyer") || ranked.directBuyer || null
  const bestTreatment = relevantChannels.find((channel) => channel.kind === "treatment") || ranked.treatmentChannel || null
  const best = bestBuyer || bestTreatment || null
  const alternatives = relevantChannels.filter((channel) => channel.id !== best?.id).slice(0, 3)
  const noDirectBuyer = !bestBuyer

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] border border-[#22303a] bg-gradient-to-br from-[#0a0e12] to-[#10161b] p-6 text-[#f8fffb] shadow-[0_24px_80px_rgba(2,6,23,0.35)]">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#9ef0ce]">Canaux locaux</p>
        <h2 className="mt-2 text-3xl font-semibold">Destination recommandÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©e</h2>
        <p className="mt-3 max-w-2xl text-sm text-[#aab4af]">
          Le moteur filtre les suggestions par famille de dÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©chets et par voie de valorisation. Les faux positifs sont ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©cartÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©s.
        </p>
        {best ? (
          <div className="mt-5 rounded-3xl border border-[#2f6f5f]/30 bg-[#11211c] p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-[#9ef0ce]">{best.kind === "buyer" ? "Acheteur direct" : "Canal de traitement"}</p>
            <p className="mt-1 text-xl font-semibold text-[#f8fffb]">{best.name}</p>
            <p className="mt-1 text-sm text-[#d9f6ea]">
              {best.type} ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· {Number(best.distance_km || 0)} km ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· gain net {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(best.net_gain_per_ton || 0))} FCFA / tonne
            </p>
            {noDirectBuyer ? <p className="mt-3 text-sm text-[#ffd8a8]">Aucun acheteur direct pertinent pour ce flux. La voie de traitement devient la solution de rÃƒÆ’Ã‚Â©fÃƒÆ’Ã‚Â©rence.</p> : null}
          </div>
        ) : (
          <div className="mt-5 rounded-3xl border border-[#7b4a19]/30 bg-[#2a2110] p-4 text-[#ffd8a8]">
            Aucun canal pertinent pour ce flux.
          </div>
        )}
      </div>

      <div className="grid gap-3 rounded-3xl border border-[#22303a] bg-[#0f1418] p-4 shadow-sm md:grid-cols-3">
        <label className="grid gap-2 text-sm font-medium text-[#d9e2dd]">
          Distance max (km)
          <input
            type="range"
            min="10"
            max="200"
            step="5"
            value={filters.maxDistance ?? 100}
            onChange={(e) => onFilterChange?.({ ...filters, maxDistance: Number(e.target.value) })}
          />
          <span className="text-xs text-[#aab4af]">{"Jusqu\u2019à "}{filters.maxDistance ?? 100} km</span>
        </label>
        <label className="grid gap-2 text-sm font-medium text-[#d9e2dd] md:col-span-2">
          Filtre matiÃƒÆ’Ã‚Â¨re
          <input
            type="text"
            list="local-waste-types"
            value={filters.wasteType || ""}
            onChange={(e) => onFilterChange?.({ ...filters, wasteType: e.target.value })}
            placeholder="organique, biodÃƒÆ’Ã‚Â©chets, boues, biochar, plastique..."
            className="rounded-2xl border border-[#2a3a35] bg-[#11161b] px-4 py-3 text-[#f8fffb]"
          />
          <datalist id="local-waste-types">
            <option value="plastique" />
            <option value="mÃƒÆ’Ã‚Â©tal" />
            <option value="textile" />
            <option value="boues" />
            <option value="organique" />
            <option value="biodÃƒÆ’Ã‚Â©chets" />
            <option value="biochar" />
            <option value="biogaz" />
            <option value="dÃƒÆ’Ã‚Â©chets industriels" />
          </datalist>
        </label>
      </div>

      {relevantChannels.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {relevantChannels.map((channel, index) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              isBest={index === 0}
              onContact={onContact}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-[#22303a] bg-[#0f1418] p-5 text-sm text-[#aab4af] shadow-sm">
          Aucun canal cohÃƒÆ’Ã‚Â©rent pour cette filiÃƒÆ’Ã‚Â¨re. Gardez la voie de traitement sÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©curisÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©e.
        </div>
      )}

      {alternatives.length > 0 ? (
        <div className="rounded-3xl border border-[#22303a] bg-[#12181d] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#aab4af]">Alternatives</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {alternatives.map((channel) => (
              <div key={`alt-${channel.id}`} className="rounded-2xl border border-[#22303a] bg-[#0f1418] p-4 text-sm text-[#d9e2dd]">
                <p className="font-semibold text-[#f8fffb]">{channel.name}</p>
                <p className="mt-1 text-[#aab4af]">{channel.type} ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· {Number(channel.distance_km || 0)} km</p>
                <p className="mt-2 text-[#aab4af]">Gain net: {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(channel.net_gain_per_ton || 0))} FCFA / tonne</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
