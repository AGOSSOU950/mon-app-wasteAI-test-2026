import React from "react"

export default function Footer({ apiOnline }) {
  return (
    <footer className="page-section">
      <section className="card footer-wrap">
        <div className="footer-grid">
          <article>
            <h3 style={{ marginTop: 0 }}>WasteAI</h3>
            <p style={{ color: "var(--muted)" }}>Plateforme d'aide a la decision pour la valorisation des dechets en Afrique de l'Ouest.</p>
            <small>Fait avec amour au Benin</small>
          </article>

          <article>
            <h4>Liens</h4>
            <div className="footer-links">
              <a href="#">A propos</a>
              <a href="#">Contact</a>
              <a href="#">CGU</a>
              <a href="#">Politique confidentialite</a>
            </div>
          </article>

          <article>
            <h4>Reseaux</h4>
            <div className="footer-links">
              <a href="#">LinkedIn</a>
              <a href="#">WhatsApp Business</a>
            </div>
            <p style={{ marginTop: 10 }}>API: <strong>{apiOnline ? "Connectee" : "Hors ligne"}</strong></p>
          </article>
        </div>
      </section>
    </footer>
  )
}
