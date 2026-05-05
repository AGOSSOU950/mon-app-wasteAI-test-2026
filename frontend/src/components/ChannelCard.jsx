import React from "react"

const money = (value) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(value || 0))

export default function ChannelCard({ channel, isBest = false, onContact, onSelect }) {
  if (!channel) return null

  const families = Array.isArray(channel.acceptedFamilies) ? channel.acceptedFamilies : []
  const routeHints = Array.isArray(channel.acceptedRouteHints) ? channel.acceptedRouteHints.slice(0, 4) : []

  return (
    <article className={`channel-card ${isBest ? "is-best" : ""}`}>
      <div className="channel-card-head">
        <div>
          <p className="channel-card-name">{channel.name}</p>
          <p className="channel-card-subtitle">{channel.type}</p>
        </div>
        {isBest ? (
          <span className="channel-card-pill">
            {channel.kind === "buyer" ? "Cible prioritaire" : "Voie prioritaire"}
          </span>
        ) : null}
      </div>

      <div className="channel-card-grid">
        <p><span>Type :</span> {channel.kind === "buyer" ? "Acheteur direct" : "Canal de traitement"}</p>
        <p><span>Localisation :</span> {channel.location}</p>
        <p><span>Distance :</span> {Number(channel.distance_km || 0)} km</p>
        <p><span>Coût / tonne :</span> {money(channel.estimated_cost_per_ton)} FCFA</p>
        <p><span>Gain estimé :</span> {money(channel.potential_gain_per_ton)} FCFA</p>
        <p><span>Contact :</span> {channel.contact}</p>
      </div>

      {families.length > 0 ? (
        <div className="channel-card-block">
          <p className="channel-card-label">Filières acceptées</p>
          <div className="channel-card-tags">
            {families.map((family) => (
              <span key={family}>{family}</span>
            ))}
          </div>
        </div>
      ) : null}

      {routeHints.length > 0 ? (
        <div className="channel-card-block">
          <p className="channel-card-label">Voies compatibles</p>
          <p>{routeHints.join(" · ")}</p>
        </div>
      ) : null}

      <div className="channel-card-actions">
        <button type="button" className="btn btn-primary" onClick={() => onContact?.(channel)}>
          Contacter
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => onSelect?.(channel)}>
          Voir le détail
        </button>
      </div>
    </article>
  )
}
