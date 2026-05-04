import { memo } from "react"
import { useMarketplaceTraceabilityView } from "./MarketplaceContext"

const MarketplaceTraceabilitySection = memo(function MarketplaceTraceabilitySection() {
  const {
    styles,
    listings,
    traceListingId,
    setTraceListingId,
    fetchTraceabilityLots,
    traceLotForm,
    setTraceLotForm,
    createTraceabilityLot,
    traceLots,
    selectTraceLot,
    traceEventForm,
    setTraceEventForm,
    addTraceabilityEvent,
    traceFinalForm,
    setTraceFinalForm,
    addFinalDisposal,
    traceTimeline
  } = useMarketplaceTraceabilityView()

  const { section, h3, hint, grid2, inp, btnSecondary, convBtn } = styles

  return (
    <div style={section}>
      <h3 style={h3}>7) Tracabilite de bout en bout</h3>
      <p style={hint}>Suivi du lot depuis sa creation jusqu'a l'elimination finale.</p>
      <div style={grid2}>
        <select style={inp} value={traceListingId} onChange={e => setTraceListingId(e.target.value)}>
          <option value="">Selectionner une annonce</option>
          {listings.map(item => <option key={item.id} value={item.id}>{item.titre}</option>)}
        </select>
        <button style={btnSecondary} onClick={() => fetchTraceabilityLots(traceListingId)}>Charger lots</button>
      </div>
      <div style={grid2}>
        <input style={inp} placeholder="Code lot" value={traceLotForm.code_lot} onChange={e => setTraceLotForm({ ...traceLotForm, code_lot: e.target.value })} />
        <input style={inp} type="number" step="0.1" placeholder="Quantite kg" value={traceLotForm.quantite_kg} onChange={e => setTraceLotForm({ ...traceLotForm, quantite_kg: e.target.value })} />
        <input style={inp} placeholder="Unite" value={traceLotForm.unite} onChange={e => setTraceLotForm({ ...traceLotForm, unite: e.target.value })} />
        <input style={inp} placeholder="Localisation initiale" value={traceLotForm.localisation_initiale} onChange={e => setTraceLotForm({ ...traceLotForm, localisation_initiale: e.target.value })} />
      </div>
      <textarea style={{ ...inp, minHeight: 70 }} placeholder="Commentaire lot" value={traceLotForm.commentaire} onChange={e => setTraceLotForm({ ...traceLotForm, commentaire: e.target.value })} />
      <button style={btnSecondary} onClick={createTraceabilityLot}>Creer lot</button>
      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        {traceLots.map(lot => (
          <button key={lot.id} style={convBtn} onClick={() => selectTraceLot(lot.id)}>
            <p style={{ margin: 0, textAlign: "left", fontWeight: 700 }}>{lot.code_lot}</p>
            <p style={{ margin: "4px 0 0", textAlign: "left", fontSize: 12, color: "var(--muted)" }}>Statut: {lot.statut_courant}</p>
          </button>
        ))}
        {traceLots.length === 0 && <p style={hint}>Aucun lot pour cette annonce.</p>}
      </div>
      <div style={grid2}>
        <select style={inp} value={traceEventForm.lot_id} onChange={e => setTraceEventForm({ ...traceEventForm, lot_id: e.target.value })}>
          <option value="">Lot cible</option>
          {traceLots.map(lot => <option key={lot.id} value={lot.id}>{lot.code_lot}</option>)}
        </select>
        <select style={inp} value={traceEventForm.event_type} onChange={e => setTraceEventForm({ ...traceEventForm, event_type: e.target.value })}>
          {["collecte", "tri", "transport", "traitement", "elimination", "cloture"].map(step => <option key={step} value={step}>{step}</option>)}
        </select>
        <input style={inp} placeholder="Lieu" value={traceEventForm.location} onChange={e => setTraceEventForm({ ...traceEventForm, location: e.target.value })} />
        <input style={inp} placeholder="Acteur (nom)" value={traceEventForm.actor_name} onChange={e => setTraceEventForm({ ...traceEventForm, actor_name: e.target.value })} />
      </div>
      <button style={btnSecondary} onClick={addTraceabilityEvent}>Ajouter etape</button>
      <div style={grid2}>
        <select style={inp} value={traceFinalForm.lot_id} onChange={e => setTraceFinalForm({ ...traceFinalForm, lot_id: e.target.value })}>
          <option value="">Lot elimination finale</option>
          {traceLots.map(lot => <option key={lot.id} value={lot.id}>{lot.code_lot}</option>)}
        </select>
        <input style={inp} placeholder="Methode" value={traceFinalForm.disposal_method} onChange={e => setTraceFinalForm({ ...traceFinalForm, disposal_method: e.target.value })} />
        <input style={inp} placeholder="Installation" value={traceFinalForm.facility_name} onChange={e => setTraceFinalForm({ ...traceFinalForm, facility_name: e.target.value })} />
        <input style={inp} placeholder="Localisation" value={traceFinalForm.facility_location} onChange={e => setTraceFinalForm({ ...traceFinalForm, facility_location: e.target.value })} />
      </div>
      <button style={btnSecondary} onClick={addFinalDisposal}>Valider elimination finale</button>
      {!!traceTimeline && (
        <div style={{ marginTop: 10, border: "1px solid var(--line)", borderRadius: 8, padding: 10, background: "var(--surface)", color: "var(--text)" }}>
          <p style={{ margin: "0 0 6px", fontWeight: 700, color: "var(--text)" }}>Timeline lot {traceTimeline.lot?.code_lot}</p>
          {(traceTimeline.events || []).map(evt => (
            <p key={evt.id} style={{ margin: "0 0 4px", color: "var(--muted)", fontSize: 13 }}>
              {String(evt.event_at || "").slice(0, 19).replace("T", " ")} | {evt.event_type} | {evt.location}
            </p>
          ))}
          {traceTimeline.final_disposal && <p style={{ margin: 0, fontWeight: 700, color: "var(--brand-dark)" }}>Elimination finale: {traceTimeline.final_disposal.disposal_method}</p>}
        </div>
      )}
    </div>
  )
})

export default MarketplaceTraceabilitySection

