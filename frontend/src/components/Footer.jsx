import React from "react"

export default function Footer({ apiOnline }) {
  return (
    <footer className="page-section">
      <section className="card footer-wrap">
        <div className="footer-grid">
          <article>
            <h3 style={{ marginTop: 0 }}>WasteAI</h3>
            <p style={{ color: "var(--muted)" }}>Plateforme de d?cision pour la valorisation des d?chets industriels en Afrique de l?Ouest.</p>
            <small>Con?u pour les industriels, HSE, exploitation et conformit?</small>
          </article>

          <article>
            <h4>Utilit?</h4>
            <div className="footer-links">
              <span>Valorisation</span>
              <span>Conformit?</span>
              <span>Tra?abilit?</span>
              <span>Canaux locaux</span>
            </div>
          </article>

          <article>
            <h4>?tat</h4>
            <div className="footer-links">
              <span>API: <strong>{apiOnline ? "Connect?e" : "Hors ligne"}</strong></span>
            </div>
            <p style={{ marginTop: 10 }}>Cadre CEDEAO et Convention de Bamako int?gr?s dans la logique de d?cision.</p>
          </article>
        </div>
      </section>
    </footer>
  )
}
