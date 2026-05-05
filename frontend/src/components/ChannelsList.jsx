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
    <section className="channels-list">
      <div className="channels-hero card">
        <p className="eyebrow">Canaux locaux</p>
        <h2>Destination recommandée</h2>
        <p className="channels-lead">
          Le moteur filtre les suggestions par famille de déchets et par voie de valorisation. Les faux positifs sont écartés.
        </p>
        {best ? (
          <div className="channels-best">
            <p className="channels-best-kicker">{best.kind === "buyer" ? "Acheteur direct" : "Canal de traitement"}</p>
            <h3>{best.name}</h3>
            <p>
              {best.type} · {Number(best.distance_km || 0)} km · gain net {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(best.net_gain_per_ton || 0))} FCFA / tonne
            </p>
            {noDirectBuyer ? <p className="channels-warning">Aucun acheteur direct pertinent pour ce flux. La voie de traitement devient la solution de référence.</p> : null}
          </div>
        ) : (
          <div className="channels-warning-panel">Aucun canal pertinent pour ce flux.</div>
        )}
      </div>

      <div className="channels-filters card">
        <label>
          Distance max (km)
          <input
            type="range"
            min="10"
            max="200"
            step="5"
            value={filters.maxDistance ?? 100}
            onChange={(e) => onFilterChange?.({ ...filters, maxDistance: Number(e.target.value) })}
          />
          <span>Jusqu’à {filters.maxDistance ?? 100} km</span>
        </label>
        <label>
          Filtre matière
          <input
            type="text"
            list="local-waste-types"
            value={filters.wasteType || ""}
            onChange={(e) => onFilterChange?.({ ...filters, wasteType: e.target.value })}
            placeholder="organique, biodéchets, boues, biochar, plastique..."
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
        <div className="channel-grid">
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
        <div className="channels-empty card">Aucun canal cohérent pour cette filière. Gardez la voie de traitement sécurisée.</div>
      )}

      {alternatives.length > 0 ? (
        <div className="channels-alternatives card">
          <p className="eyebrow">Alternatives</p>
          <div className="channels-alternatives-grid">
            {alternatives.map((channel) => (
              <div key={`alt-${channel.id}`} className="channels-alt-card">
                <p>{channel.name}</p>
                <span>{channel.type} · {Number(channel.distance_km || 0)} km</span>
                <strong>Gain net: {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(channel.net_gain_per_ton || 0))} FCFA / tonne</strong>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
