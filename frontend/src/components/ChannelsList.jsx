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
      <div className="rounded-[2rem] border border-[#22303a] bg-gradient-to-br from-[#080b0f] via-[#0d1318] to-[#11181d] p-6 text-[#f8fffb] shadow-[0_24px_80px_rgba(2,6,23,0.35)]">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#9ef0ce]">Canaux locaux</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Destination recommandée</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#aab4af]">
          Le moteur filtre les suggestions par famille de déchets et par voie de valorisation. Les faux positifs sont écartés.
        </p>
        {best ? (
          <div className="mt-5 rounded-3xl border border-[#2f6f5f]/30 bg-[#11211c] p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-[#9ef0ce]">{best.kind === "buyer" ? "Acheteur direct" : "Canal de traitement"}</p>
            <p className="mt-1 text-xl font-semibold text-[#f8fffb]">{best.name}</p>
            <p className="mt-1 text-sm text-[#d9f6ea]">
              {best.type} · {Number(best.distance_km || 0)} km · gain net {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(best.net_gain_per_ton || 0))} FCFA / tonne
            </p>
            {noDirectBuyer ? <p className="mt-3 text-sm text-[#ffd8a8]">Aucun acheteur direct pertinent pour ce flux. La voie de traitement devient la solution de référence.</p> : null}
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
          <span className="text-xs text-[#aab4af]">Jusqu’à {filters.maxDistance ?? 100} km</span>
        </label>
        <label className="grid gap-2 text-sm font-medium text-[#d9e2dd] md:col-span-2">
          Filtre matière
          <input
            type="text"
            list="local-waste-types"
            value={filters.wasteType || ""}
            onChange={(e) => onFilterChange?.({ ...filters, wasteType: e.target.value })}
            placeholder="organique, biodéchets, boues, biochar, plastique..."
            className="rounded-2xl border border-[#2a3a35] bg-[#11161b] px-4 py-3 text-[#f8fffb]"
          />
          <datalist id="local-waste-types">
            <option value="plastique" />
            <option value="métal" />
            <option value="textile" />
            <option value="boues" />
            <option value="organique" />
            <option value="biodéchets" />
            <option value="biochar" />
            <option value="biogaz" />
            <option value="déchets industriels" />
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
          Aucun canal cohérent pour cette filière. Gardez la voie de traitement sécurisée.
        </div>
      )}

      {alternatives.length > 0 ? (
        <div className="rounded-3xl border border-[#22303a] bg-[#12181d] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#aab4af]">Alternatives</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {alternatives.map((channel) => (
              <div key={`alt-${channel.id}`} className="rounded-2xl border border-[#22303a] bg-[#0f1418] p-4 text-sm text-[#d9e2dd]">
                <p className="font-semibold text-[#f8fffb]">{channel.name}</p>
                <p className="mt-1 text-[#aab4af]">{channel.type} · {Number(channel.distance_km || 0)} km</p>
                <p className="mt-2 text-[#aab4af]">Gain net: {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(channel.net_gain_per_ton || 0))} FCFA / tonne</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
