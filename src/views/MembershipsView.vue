<template>
  <main class="memberships-page">
    <section class="hero">
      <span class="eyebrow">Sky Group Memberships</span>
      <h1>Nuestro enfoque para membresías y paquetes de vuelo</h1>
      <p>
        Paga únicamente por el nivel de acceso, operación y beneficios que tu movilidad aérea
        necesita.
      </p>
    </section>

    <section class="benefits-section">
      <h2>Accede a funciones avanzadas sin costos operativos innecesarios</h2>

      <div class="benefits-grid">
        <article class="benefit-card">
          <div class="icon">▣</div>
          <h3>Paquetes personalizables</h3>
          <p>
            Configura límites, frecuencia, cobertura, rutas y acceso según tu perfil, empresa o
            necesidad operativa.
          </p>
        </article>

        <article class="benefit-card">
          <div class="icon">✦</div>
          <h3>Control administrativo</h3>
          <p>
            Sky Group centraliza uso, historial, prioridad, reservas y experiencia premium desde
            una sola plataforma.
          </p>
        </article>

        <article class="benefit-card">
          <div class="icon">◈</div>
          <h3>Opciones flexibles</h3>
          <p>
            Desde acceso ocasional hasta membresías elite con prioridad ejecutiva, concierge y
            cobertura internacional.
          </p>
        </article>
      </div>
    </section>

    <section class="plans-section">
  <span class="section-kicker">Paquetes Sky Group</span>
  <h2>Elige el nivel de movilidad aérea que necesitas</h2>

  <div class="plans">
    <article class="plan-card">
      <div class="plan-top">
        <span class="plan-badge">Inicio</span>
        <h3>Access</h3>
        <p>Para clientes que quieren comenzar a cotizar y reservar vuelos privados.</p>
      </div>

      <div class="plan-price">
        <strong>Acceso básico</strong>
        <span>Ideal para vuelos ocasionales</span>
      </div>

      <ul>
        <li>Cotización de vuelos privados</li>
        <li>Acceso a aeronaves disponibles</li>
        <li>Soporte estándar</li>
        <li>Reservas nacionales</li>
        <li>Historial de solicitudes</li>
      </ul>

      <RouterLink to="/membresias/registro" class="plan-button">
        Comenzar
      </RouterLink>
    </article>

    <article class="plan-card featured">
      <div class="popular-label">Recomendado</div>

      <div class="plan-top">
        <span class="plan-badge">Ejecutivo</span>
        <h3>Business</h3>
        <p>Para usuarios frecuentes, empresas pequeñas y movilidad ejecutiva.</p>
      </div>

      <div class="plan-price">
        <strong>Prioridad operativa</strong>
        <span>Mejor experiencia y seguimiento</span>
      </div>

      <ul>
        <li>Todo lo de Access</li>
        <li>Prioridad en disponibilidad</li>
        <li>Rutas preferentes</li>
        <li>Soporte premium</li>
        <li>Gestión para varios pasajeros</li>
        <li>Atención por concierge</li>
      </ul>

      <RouterLink to="/membresias/comenzar" class="plan-button">
        Elegir Business
      </RouterLink>
    </article>

    <article class="plan-card">
      <div class="plan-top">
        <span class="plan-badge">Elite</span>
        <h3>Black</h3>
        <p>Para clientes premium, empresas y operación aérea de alto nivel.</p>
      </div>

      <div class="plan-price">
        <strong>Experiencia completa</strong>
        <span>Máximo control y flexibilidad</span>
      </div>

      <ul>
        <li>Todo lo de Business</li>
        <li>Concierge dedicado</li>
        <li>Cobertura internacional</li>
        <li>Preferencias de aeronave</li>
        <li>Gestión corporativa</li>
        <li>Atención prioritaria 24/7</li>
      </ul>

      <RouterLink to="/membresias/contacto" class="plan-button">
        Contactar ventas
      </RouterLink>
    </article>
  </div>
</section>

    <section class="faq-section">
      <h2>Preguntas frecuentes</h2>

      <div class="faq-list">
        <details open>
          <summary>¿Qué incluye una membresía Sky Group?</summary>
          <p>
            Acceso a paquetes según nivel, beneficios operativos, prioridad y cobertura configurada.
          </p>
        </details>

        <details>
          <summary>¿Puedo cambiar de paquete?</summary>
          <p>Sí. Puedes escalar o ajustar tu nivel según uso, frecuencia y necesidades.</p>
        </details>

        <details>
          <summary>¿Las membresías incluyen vuelos?</summary>
          <p>
            La membresía habilita beneficios, prioridad y estructura; los vuelos dependen del uso y
            operación.
          </p>
        </details>

        <details>
          <summary>¿Existe membresía corporativa?</summary>
          <p>Sí. Empresas pueden centralizar movilidad aérea con paquetes ejecutivos.</p>
        </details>
      </div>
    </section>

    <section class="cta-section">
      <h2>Tu movilidad aérea puede escalar más rápido</h2>
      <p>Comienza con el paquete que mejor se adapte a tu operación.</p>
      <RouterLink to="/membresias/comenzar" class="cta-button"> Comienza ahora </RouterLink>
    </section>
  </main>
</template>

<style scoped>
.cta-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 260px;
  min-height: 52px;
  border-radius: 12px;
  background: white;
  color: black;
  font-weight: 900;
  text-decoration: none;
}
.memberships-page {
  min-height: 100vh;
  background: #f8f8f8;
  color: #111;
}

/* HERO */
.hero {
  padding: 7rem 2rem 5rem;
  text-align: center;
  max-width: 1000px;
  margin: auto;
}

.eyebrow {
  display: inline-block;
  margin-bottom: 1rem;
  color: #666;
  font-weight: 800;
}

.hero h1 {
  margin: 0;
  font-size: clamp(3rem, 6vw, 5.5rem);
  line-height: 0.95;
  letter-spacing: -0.05em;
}

.hero p {
  max-width: 700px;
  margin: 1.4rem auto 0;
  color: #555;
  font-size: 1.05rem;
  line-height: 1.7;
}

/* BENEFITS */
.benefits-section,
.plans-section,
.faq-section,
.cta-section {
  padding: 5rem 2rem;
  max-width: 1400px;
  margin: auto;
}

.benefits-section h2,
.plans-section h2,
.faq-section h2,
.cta-section h2 {
  max-width: 800px;
  margin: 0 0 3rem;
  font-size: clamp(2rem, 4vw, 3.2rem);
  line-height: 1.05;
}

.benefits-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
}

.benefit-card {
  padding: 2rem;
  border-radius: 24px;
  background: white;
}

.icon {
  width: 60px;
  height: 60px;
  display: grid;
  place-items: center;
  margin-bottom: 1rem;
  border-radius: 16px;
  background: #eef2ff;
  font-size: 1.5rem;
  font-weight: 900;
}

.benefit-card p {
  color: #555;
  line-height: 1.7;
}

/* PLANS */
.plans {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
}

.plan-card {
  padding: 2.2rem;
  border-radius: 28px;
  background: white;
  border: 1px solid #ececec;
}

.plan-badge {
  display: inline-block;
  margin-bottom: 1rem;
  color: #666;
  font-weight: 800;
}

.plan-card h3 {
  margin: 0;
  font-size: 2rem;
}

.plan-card p {
  margin: 0.8rem 0 1.4rem;
  color: #555;
}

.plan-card ul {
  padding: 0;
  margin: 0 0 2rem;
  list-style: none;
}

.plan-card li {
  padding: 0.5rem 0;
  border-bottom: 1px solid #eee;
}

.plan-card button,
.cta-section button {
  width: 100%;
  min-height: 52px;
  border: 0;
  border-radius: 12px;
  background: #000;
  color: white;
  font-weight: 900;
  cursor: pointer;
}

.featured {
  background: #050505;
  color: white;
}

.featured p,
.featured .plan-badge {
  color: rgba(255, 255, 255, 0.72);
}

.featured li {
  border-bottom-color: rgba(255, 255, 255, 0.12);
}

.featured button {
  background: white;
  color: black;
}

/* FAQ */
.faq-list {
  display: grid;
  gap: 1rem;
}

details {
  padding: 1.3rem 1.4rem;
  border-radius: 18px;
  background: white;
}

summary {
  cursor: pointer;
  font-weight: 800;
}

details p {
  margin: 1rem 0 0;
  color: #555;
  line-height: 1.7;
}

/* CTA */
.cta-section {
  text-align: center;
  background: #082e66;
  color: white;
  border-radius: 32px 32px 0 0;
}

.cta-section h2 {
  margin-inline: auto;
}

.cta-section p {
  color: rgba(255, 255, 255, 0.72);
  margin-bottom: 2rem;
}

.cta-section button {
  max-width: 260px;
  background: white;
  color: black;
  margin: auto;
}
.section-kicker {
  display: inline-flex;
  margin-bottom: 1rem;
  padding: .45rem .8rem;
  border-radius: 999px;
  background: #eef2ff;
  color: #0b3a7a;
  font-size: .82rem;
  font-weight: 900;
}

.plans {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.4rem;
  align-items: stretch;
}

.plan-card {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 2rem;
  border-radius: 28px;
  background: white;
  border: 1px solid #e7e7e7;
  box-shadow: 0 18px 50px rgba(0,0,0,.06);
}

.plan-card.featured {
  background: #050505;
  color: white;
  transform: translateY(-14px);
  box-shadow: 0 28px 70px rgba(0,0,0,.22);
}

.popular-label {
  position: absolute;
  top: 1rem;
  right: 1rem;
  padding: .45rem .75rem;
  border-radius: 999px;
  background: white;
  color: black;
  font-size: .78rem;
  font-weight: 900;
}

.plan-badge {
  display: inline-block;
  margin-bottom: 1rem;
  color: #666;
  font-weight: 900;
}

.featured .plan-badge {
  color: rgba(255,255,255,.72);
}

.plan-card h3 {
  margin: 0;
  font-size: 2.5rem;
  letter-spacing: -.04em;
}

.plan-card p {
  margin: .8rem 0 0;
  color: #555;
  line-height: 1.6;
}

.featured p {
  color: rgba(255,255,255,.72);
}

.plan-price {
  display: grid;
  gap: .2rem;
  margin: 1.6rem 0;
  padding: 1rem;
  border-radius: 18px;
  background: #f5f5f5;
}

.featured .plan-price {
  background: rgba(255,255,255,.1);
}

.plan-price strong {
  font-size: 1.1rem;
}

.plan-price span {
  color: #666;
  font-size: .9rem;
}

.featured .plan-price span {
  color: rgba(255,255,255,.65);
}

.plan-card ul {
  flex: 1;
  padding: 0;
  margin: 0 0 2rem;
  list-style: none;
}

.plan-card li {
  position: relative;
  padding: .7rem 0 .7rem 1.8rem;
  border-bottom: 1px solid #eee;
  color: #333;
}

.plan-card li::before {
  content: "✓";
  position: absolute;
  left: 0;
  font-weight: 900;
}

.featured li {
  color: rgba(255,255,255,.86);
  border-bottom-color: rgba(255,255,255,.12);
}

.plan-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 52px;
  border-radius: 14px;
  background: #000;
  color: white;
  font-weight: 900;
  text-decoration: none;
}

.featured .plan-button {
  background: white;
  color: black;
}

@media (max-width: 980px) {
  .plans {
    grid-template-columns: 1fr;
  }

  .plan-card.featured {
    transform: none;
  }

  .benefits-grid,
  .plans {
    grid-template-columns: 1fr;
  }

  .hero,
  .benefits-section,
  .plans-section,
  .faq-section,
  .cta-section {
    padding-inline: 1.2rem;
  }
}
</style>
