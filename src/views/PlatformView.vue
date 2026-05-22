<script setup>
import SiteFooter from '../components/SiteFooter.vue'
</script>

<template>
  <main class="platform-page">
    <section class="hero">
      <div class="hero-copy">
        <span class="eyebrow">Plataforma cliente</span>
        <h1>La plataforma privada para cotizar, reservar y seguir cada vuelo con claridad.</h1>
        <p>
          Sky Group concentra solicitudes, estados, membresias y coordinacion premium en una sola
          experiencia clara para el cliente.
        </p>

        <div class="hero-actions">
          <RouterLink to="/login-cliente" class="primary-btn">Entrar como cliente</RouterLink>
          <RouterLink to="/renta-aeronaves" class="secondary-btn">Explorar renta</RouterLink>
        </div>
      </div>

      <div class="hero-visual">
        <div class="app-card main-card">
          <small>Solicitud activa</small>
          <strong>Toluca a Cancun</strong>
          <span>Jet ejecutivo · 6 pasajeros</span>
        </div>

        <div class="app-card floating-card">
          <small>Estado</small>
          <strong>Revision premium activa</strong>
        </div>
      </div>
    </section>

    <section class="stats-section">
      <h2>Una plataforma pensada para clientes que necesitan visibilidad y control</h2>

      <div class="stats-grid">
        <article>
          <strong>01</strong>
          <h3>Solicita</h3>
          <p>Define ruta, fecha, pasajeros y necesidades desde una sola vista.</p>
        </article>

        <article>
          <strong>02</strong>
          <h3>Recibe opciones</h3>
          <p>Obtienes alternativas sugeridas con una lectura premium y profesional.</p>
        </article>

        <article>
          <strong>03</strong>
          <h3>Da seguimiento</h3>
          <p>Consulta estados, cambios y coordinacion protegida dentro del portal.</p>
        </article>

        <article>
          <strong>04</strong>
          <h3>Escala beneficios</h3>
          <p>Activa membresias, concierge y prioridad cuando tu operacion lo necesite.</p>
        </article>
      </div>
    </section>

    <section class="use-section">
      <h2>Todo lo importante para tu experiencia cliente vive aqui</h2>

      <div class="use-grid">
        <article>
          <div class="circle">✈</div>
          <h3>Renta de aeronaves</h3>
          <p>Disponibilidad y solicitud con un flujo claro, premium y facil de seguir.</p>
        </article>

        <article>
          <div class="circle">◫</div>
          <h3>Seguimiento protegido</h3>
          <p>Monitorea estados y coordinacion sin salir del ecosistema Sky Group.</p>
        </article>

        <article>
          <div class="circle">★</div>
          <h3>Membresias</h3>
          <p>Paquetes para clientes frecuentes, empresas y perfiles premium.</p>
        </article>
      </div>
    </section>

    <section class="steps-section">
      <div class="steps-media"></div>

      <div class="steps-content">
        <h2>Una experiencia cliente que se entiende desde el primer paso</h2>

        <div class="step">
          <strong>1</strong>
          <div>
            <h3>Tu cuenta solicita</h3>
            <p>Indicas origen, destino, fecha, pasajeros y preferencias de salida.</p>
          </div>
        </div>

        <div class="step">
          <strong>2</strong>
          <div>
            <h3>Sky Group coordina</h3>
            <p>Validamos disponibilidad, experiencia de cabina y condiciones operativas.</p>
          </div>
        </div>

        <div class="step">
          <strong>3</strong>
          <div>
            <h3>Das seguimiento</h3>
            <p>Monitoreas tu solicitud, beneficios y estado completo desde la plataforma.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="trust-section">
      <h2>Una plataforma lista para clientes, familias y equipos ejecutivos</h2>

      <div class="trust-logos">
        <span>Clientes VIP</span>
        <span>Empresas</span>
        <span>Viajes ejecutivos</span>
      </div>
    </section>

    <section class="cta-section">
      <h2>Centraliza tu experiencia aerea privada en una sola plataforma</h2>
      <RouterLink to="/login-cliente" class="cta-btn">Comenzar</RouterLink>
    </section>
  </main>
  <SiteFooter />
</template>

<style scoped>
.platform-page {
  min-height: 100vh;
  background: #ffffff !important;
  color: #111111 !important;
}

.hero {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4rem;
  align-items: center;
  padding: 6rem 8%;
  background:
    radial-gradient(circle at top right, rgba(217, 170, 83, 0.14), transparent 26%),
    linear-gradient(180deg, #ffffff 0%, #faf8f2 100%) !important;
  color: #111111 !important;
}

.eyebrow {
  display: inline-block;
  margin-bottom: 1rem;
  color: #8c6a1f;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero h1,
.stats-section h2,
.use-section h2,
.steps-content h2,
.trust-section h2,
.cta-section h2 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.05em;
}

.hero h1 {
  max-width: 11ch;
  font-size: clamp(3rem, 7vw, 5.4rem);
  line-height: 0.95;
}

.hero p {
  max-width: 580px;
  margin: 1.4rem 0 0;
  color: #5d5d5d;
  font-size: 1.05rem;
  line-height: 1.7;
}

.hero-actions {
  display: flex;
  gap: 1rem;
  margin-top: 2rem;
}

.primary-btn,
.secondary-btn,
.cta-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  padding: 0 1.25rem;
  border-radius: 999px;
  font-weight: 900;
  text-decoration: none;
}

.primary-btn,
.cta-btn {
  background: #111111;
  color: #ffffff;
}

.secondary-btn {
  color: #111111;
  border: 1px solid #dddddd;
  background: #ffffff;
}

.hero-visual {
  position: relative;
  min-height: 420px;
  border-radius: 28px;
  background:
    radial-gradient(circle at 70% 20%, rgba(255, 255, 255, 0.36), transparent 26%),
    linear-gradient(135deg, #e8d5ad, #f6efe0);
  overflow: hidden;
  box-shadow: 0 28px 50px rgba(0, 0, 0, 0.08);
}

.hero-visual::before {
  content: '';
  position: absolute;
  inset: 10%;
  border-radius: 32px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.16), transparent),
    url('https://images.unsplash.com/photo-1540962351504-03099e0a754b?auto=format&fit=crop&w=1200&q=80');
  background-size: cover;
  background-position: center;
  opacity: 0.86;
}

.app-card {
  position: absolute;
  display: grid;
  gap: 0.35rem;
  padding: 1rem;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.96);
  color: #050505;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.14);
}

.app-card small {
  color: #666666;
  font-weight: 800;
}

.main-card {
  left: 2rem;
  bottom: 2rem;
  min-width: 260px;
}

.floating-card {
  right: 2rem;
  top: 2rem;
}

.stats-section,
.use-section,
.steps-section,
.trust-section {
  padding: 5rem 8%;
}

.stats-section h2,
.use-section h2,
.trust-section h2,
.cta-section h2 {
  max-width: 820px;
  margin: 0 0 3rem;
  font-size: clamp(2rem, 4vw, 3rem);
  line-height: 1.05;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 2rem;
}

.stats-grid article {
  padding: 1.5rem;
  border-radius: 22px;
  background: #fafafa;
  border: 1px solid #ebebeb;
}

.stats-grid strong {
  color: #8c6a1f;
}

.stats-grid p,
.use-grid p,
.step p {
  color: #5d5d5d;
  line-height: 1.6;
}

.use-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
}

.use-grid article {
  padding: 1.4rem;
  border-radius: 22px;
  background: #ffffff;
  border: 1px solid #ebebeb;
}

.circle {
  width: 92px;
  height: 92px;
  display: grid;
  place-items: center;
  margin-bottom: 1rem;
  border-radius: 50%;
  background: #f1f1f1;
  font-size: 2rem;
}

.steps-section {
  display: grid;
  grid-template-columns: 0.9fr 1.1fr;
  gap: 4rem;
  background: #faf8f2;
}

.steps-media {
  min-height: 420px;
  border-radius: 24px;
  background:
    linear-gradient(135deg, rgba(0, 0, 0, 0.15), transparent),
    url('https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1200&q=80');
  background-size: cover;
  background-position: center;
}

.step {
  display: grid;
  grid-template-columns: 52px 1fr;
  gap: 1rem;
  padding: 1.3rem 0;
  border-bottom: 1px solid #ddd;
}

.step strong {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #111111;
  color: #ffffff;
}

.step h3 {
  margin: 0;
}

.trust-section {
  text-align: center;
}

.trust-section h2 {
  margin-inline: auto;
}

.trust-logos {
  display: flex;
  justify-content: center;
  gap: 4rem;
  flex-wrap: wrap;
  color: #111111;
  font-size: clamp(1.7rem, 4vw, 3rem);
  font-weight: 900;
}

.cta-section {
  padding: 4rem 8%;
  text-align: center;
  background: #ffffff;
  color: #111111;
  border-top: 1px solid #ebebeb;
}

.cta-section h2 {
  margin-inline: auto;
}

.cta-btn {
  margin-top: 0.5rem;
}

@media (max-width: 980px) {
  .hero,
  .steps-section,
  .stats-grid,
  .use-grid {
    grid-template-columns: 1fr;
  }

  .hero {
    padding: 4rem 1.4rem;
  }

  .stats-section,
  .use-section,
  .steps-section,
  .trust-section,
  .cta-section {
    padding: 4rem 1.4rem;
  }
}
</style>
