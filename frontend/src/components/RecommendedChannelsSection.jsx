import React from "react"
import LocalWasteChannelsSection from "./LocalWasteChannelsSection"

export default function RecommendedChannelsSection({ result, form }) {
  return (
    <section className="recommended-channels">
      <div className="recommended-channels-intro card">
        <p className="eyebrow">Canaux recommandés</p>
        <h3>Opérateurs cohérents avec la voie retenue</h3>
        <p>
          Les contacts affichés ci-dessous sont filtrés pour rester compatibles avec la nature du flux, ses contraintes
          techniques et la recommandation principale.
        </p>
      </div>
      <LocalWasteChannelsSection result={result} form={form} />
    </section>
  )
}
