import React from "react"

const money = (value) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(value || 0))

export default function ChannelCard({ channel, isBest = false, onContact, onSelect }) {
  if (!channel) return null

  const families = Array.isArray(channel.acceptedFamilies) ? channel.acceptedFamilies : []
  const routeHints = Array.isArray(channel.acceptedRouteHints) ? channel.acceptedRouteHints.slice(0, 4) : []

  return (
    <article className={`rounded-3xl border p-5 shadow-[0_18px_48px_rgba(2,6,23,0.22)] transition ${isBest ? "border-emerald-400 bg-[#11211c] ring-1 ring-emerald-400/40" : "border-[#22303a] bg-[#0f1418]"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-semibold text-[#f8fffb]">{channel.name}</p>
          <p className="mt-1 text-sm text-[#aab4af]">{channel.type}</p>
        </div>
        {isBest ? (
          <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white">
            {channel.kind === "buyer" ? "Cible prioritaire" : "Voie prioritaire"}
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2 text-sm text-[#d9e2dd]">
        <p><span className="font-medium text-[#aab4af]">Type :</span> {channel.kind === "buyer" ? "Acheteur direct" : "Canal de traitement"}</p>
        <p><span className="font-medium text-[#aab4af]">Localisation :</span> {channel.location}</p>
        <p><span className="font-medium text-[#aab4af]">Distance :</span> {Number(channel.distance_km || 0)} km</p>
        <p><span className="font-medium text-[#aab4af]">CoÃ»t / tonne :</span> {money(channel.estimated_cost_per_ton)} FCFA</p>
        <p><span className="font-medium text-[#aab4af]">Gain estimÃ© :</span> {money(channel.potential_gain_per_ton)} FCFA</p>
        <p><span className="font-medium text-[#aab4af]">Contact :</span> {channel.contact}</p>
      </div>

      {families.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#aab4af]">FiliÃ¨res acceptÃ©es</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {families.map((family) => (
              <span key={family} className="rounded-full bg-[#182127] px-3 py-1 text-xs font-medium text-[#d9e2dd]">
                {family}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {routeHints.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#aab4af]">Voies compatibles</p>
          <p className="mt-2 text-sm text-[#aab4af]">{routeHints.join(" Â· ")}</p>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => onContact?.(channel)}
          className="rounded-full bg-[#0a0e12] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1b2429]"
        >
          Contacter
        </button>
        <button
          type="button"
          onClick={() => onSelect?.(channel)}
          className="rounded-full border border-[#2a3a35] px-4 py-2 text-sm font-semibold text-[#d9e2dd] transition hover:border-slate-500 hover:text-[#f8fffb]"
        >
          Voir le dÃ©tail
        </button>
      </div>
    </article>
  )
}
