<script setup>
import SiteFooter from '../components/SiteFooter.vue'

const serviceCategories = [
  {
    key: 'renta',
    eyebrow: 'Acceso privado',
    title: 'Renta de aeronaves',
    description:
      'Solicita disponibilidad nacional e internacional con una experiencia premium, clara y acompanada.',
    cta: 'Explorar renta',
    items: ['Cotizacion guiada', 'Rutas sugeridas', 'Seguimiento premium', 'Concierge'],
    image:
      'https://images.unsplash.com/photo-1517479149777-5f3b1511d5ad?auto=format&fit=crop&w=1200&q=80',
  },
  {
    key: 'membresias',
    eyebrow: 'Mas solicitado',
    title: 'Membresias',
    description:
      'Paquetes para clientes frecuentes, empresas y perfiles que necesitan prioridad y mejor cobertura.',
    cta: 'Ver membresias',
    items: ['Cuenta cliente', 'Prioridad', 'Beneficios premium', 'Escalamiento'],
    image:
      'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=1200&q=80',
  },
  {
    key: 'concierge',
    eyebrow: 'Experiencia',
    title: 'Concierge y coordinacion',
    description:
      'Centralizamos catering, traslados, NDA y necesidades especiales dentro del mismo flujo.',
    cta: 'Hablar con concierge',
    items: ['Catering', 'Traslados', 'Atencion ejecutiva', 'Coordinacion protegida'],
    image:
      'https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1200&q=80',
  },
  {
    key: 'seguimiento',
    eyebrow: 'Cuenta cliente',
    title: 'Seguimiento de solicitudes',
    description:
      'Monitorea estados, proximos pasos y coordinacion privada desde una sola vista ordenada.',
    cta: 'Ver plataforma',
    items: ['Timeline claro', 'Historial', 'Estados', 'Visibilidad protegida'],
    image:
      'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80',
  },
]

const audienceProfiles = [
  {
    title: 'Cliente ejecutivo',
    summary: 'Acceso a vuelos privados, concierge y seguimiento con una lectura premium.',
    outcome: 'Reserva con mas control y menos friccion.',
  },
  {
    title: 'Empresa',
    summary: 'Movilidad privada para directivos, invitados y rutas sensibles.',
    outcome: 'Centraliza viajes con mejor orden operativo.',
  },
  {
    title: 'Familia premium',
    summary: 'Experiencia privada con acompanamiento y coordinacion a detalle.',
    outcome: 'Vuela con comodidad y mayor tranquilidad.',
  },
]

const flowSteps = [
  {
    title: 'Solicitas tu salida',
    description: 'Definimos ruta, fecha, pasajeros y preferencias desde la cuenta cliente.',
  },
  {
    title: 'Recibes opciones',
    description: 'Sky Group filtra alternativas sugeridas para tu necesidad.',
  },
  {
    title: 'Coordinamos detalles',
    description: 'Catering, concierge y requerimientos especiales quedan integrados.',
  },
  {
    title: 'Das seguimiento',
    description: 'Monitoreas el progreso completo de la experiencia desde la plataforma.',
  },
]

const differentiators = [
  'Atencion premium',
  'Seguimiento claro',
  'Concierge',
  'Membresias',
  'Rutas privadas',
  'Control cliente',
]
</script>

<template>
  <div class="services-page">
    <main>
      <section class="hero-section">
        <div class="hero-copy">
          <p class="eyebrow">Servicios para clientes</p>
          <h1>Todo lo que necesitas para volar en privado dentro de una sola experiencia.</h1>
          <p class="hero-summary">
            Sky Group reune vuelos privados, membresias, concierge y seguimiento premium en una
            propuesta orientada al cliente.
          </p>

          <div class="hero-actions">
            <RouterLink to="/renta-aeronaves" class="primary-action">Explorar renta</RouterLink>
            <RouterLink to="/plataforma" class="secondary-action">Ver plataforma</RouterLink>
            <RouterLink to="/login-cliente" class="ghost-action">Entrar como cliente</RouterLink>
          </div>

          <div class="hero-indicators">
            <article>
              <strong>Renta de aeronaves</strong>
              <span>Reserva con una lectura mas clara y premium.</span>
            </article>
            <article>
              <strong>Cuenta cliente</strong>
              <span>Seguimiento, historial y beneficios en el mismo flujo.</span>
            </article>
          </div>
        </div>

        <div class="hero-visual">
          <div class="visual-panel panel-main">
            <span class="panel-kicker">Experiencia premium</span>
            <strong>Una capa cliente pensada para reservar mejor</strong>
            <p>Solicitudes, membresias y concierge dentro de un mismo recorrido.</p>
          </div>

          <div class="visual-panel panel-float">
            <span class="panel-kicker">Estado</span>
            <strong>Cuenta lista para operar</strong>
          </div>
        </div>
      </section>

      <section class="section-shell services-section">
        <div class="section-head">
          <p class="eyebrow">Servicios centrales</p>
          <h2>Una experiencia cliente que mezcla movilidad privada, beneficios y coordinacion.</h2>
          <p>
            Estas soluciones estan disenadas para clientes que quieren menos friccion y mas claridad
            antes, durante y despues de cada solicitud.
          </p>
        </div>

        <div class="services-grid">
          <article v-for="category in serviceCategories" :key="category.key" class="service-card">
            <div class="card-top">
              <span class="badge">{{ category.eyebrow }}</span>
            </div>

            <div class="service-media">
              <img :src="category.image" :alt="category.title" />
            </div>

            <h3>{{ category.title }}</h3>
            <p class="card-summary">{{ category.description }}</p>

            <ul class="feature-list">
              <li v-for="item in category.items" :key="item">{{ item }}</li>
            </ul>

            <RouterLink
              :to="
                category.key === 'renta'
                  ? '/renta-aeronaves'
                  : category.key === 'seguimiento'
                    ? '/plataforma'
                    : '/membresias'
              "
              class="card-link"
            >
              {{ category.cta }}
            </RouterLink>
          </article>
        </div>
      </section>

      <section class="section-shell audience-section">
        <div class="section-head">
          <p class="eyebrow">Pensado para ti</p>
          <h2>Servicios orientados a clientes, familias y equipos ejecutivos.</h2>
        </div>

        <div class="audience-grid">
          <article v-for="profile in audienceProfiles" :key="profile.title" class="audience-card">
            <span class="audience-tag">Perfil cliente</span>
            <h3>{{ profile.title }}</h3>
            <p>{{ profile.summary }}</p>
            <strong>{{ profile.outcome }}</strong>
          </article>
        </div>
      </section>

      <section class="section-shell flow-section">
        <div class="section-head">
          <p class="eyebrow">Como funciona</p>
          <h2>Un recorrido claro desde la solicitud hasta el seguimiento premium.</h2>
        </div>

        <div class="timeline-grid">
          <article v-for="(step, index) in flowSteps" :key="step.title" class="timeline-card">
            <span class="timeline-index">0{{ index + 1 }}</span>
            <h3>{{ step.title }}</h3>
            <p>{{ step.description }}</p>
          </article>
        </div>
      </section>

      <section class="section-shell differential-section">
        <div class="differential-copy">
          <p class="eyebrow">Diferencial</p>
          <h2>Todo esta organizado para que el cliente entienda, decida y avance mejor.</h2>
          <p>
            El foco aqui no es la complejidad operacional interna, sino la experiencia del cliente y
            la confianza al reservar.
          </p>
        </div>

        <div class="differential-grid">
          <article v-for="item in differentiators" :key="item" class="differential-chip">
            <span></span>
            <strong>{{ item }}</strong>
          </article>
        </div>
      </section>

      <section class="final-cta">
        <div class="final-cta-shell">
          <p class="eyebrow">Sky Group</p>
          <h2>Activa tu experiencia cliente con renta, membresias y seguimiento premium.</h2>
          <p>
            Entra al portal cliente o explora la plataforma para entender mejor como se ve el
            recorrido completo.
          </p>

          <div class="hero-actions">
            <RouterLink to="/login-cliente" class="primary-action"
              >Entrar al portal cliente</RouterLink
            >
            <RouterLink to="/plataforma" class="secondary-action">Ver plataforma</RouterLink>
          </div>
        </div>
      </section>
    </main>

    <SiteFooter />
  </div>
</template>

<style scoped>
.services-page {
  --bg-main: #ffffff;
  --bg-panel: #faf8f2;
  --bg-soft: #fafafa;
  --bg-card: #ffffff;
  --bg-card-strong: #ffffff;
  --border-soft: #ebebeb;
  --text-main: #111111;
  --text-soft: #5d5d5d;
  --text-muted: #767676;
  --accent: #d9aa53;
  --accent-strong: #8c6a1f;
  min-height: 100vh;
  background:
    radial-gradient(circle at top right, rgba(217, 170, 83, 0.12), transparent 22%),
    linear-gradient(180deg, #ffffff 0%, #fffdf8 100%) !important;
  color: var(--text-main) !important;
}

.hero-section,
.section-shell,
.final-cta {
  padding: 2rem clamp(1.2rem, 4vw, 3rem);
}

.hero-section {
  display: grid;
  grid-template-columns: minmax(0, 1.04fr) minmax(320px, 0.96fr);
  gap: 2rem;
  align-items: center;
  min-height: calc(100vh - 4.6rem);
  padding-top: 3rem;
  background: transparent !important;
  color: #111111 !important;
}

.eyebrow {
  margin: 0 0 0.85rem;
  color: var(--accent-strong);
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-copy h1,
.section-head h2,
.differential-copy h2,
.final-cta-shell h2,
.service-card h3,
.audience-card h3,
.timeline-card h3 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.05em;
}

.hero-copy h1 {
  max-width: 12ch;
  font-size: clamp(3rem, 7vw, 5.1rem);
  line-height: 0.95;
}

.hero-summary,
.section-head p:last-child,
.panel-main p,
.card-summary,
.audience-card p,
.timeline-card p,
.differential-copy p:last-child,
.final-cta-shell p:last-of-type {
  color: var(--text-soft);
  line-height: 1.7;
}

.hero-summary {
  max-width: 58ch;
  margin: 1.15rem 0 0;
  font-size: 1.05rem;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  margin-top: 1.8rem;
}

.primary-action,
.secondary-action,
.ghost-action,
.card-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 3.2rem;
  border-radius: 999px;
  padding: 0 1.2rem;
  font-weight: 800;
  text-decoration: none;
}

.primary-action {
  color: #ffffff;
  background: #111111;
}

.secondary-action,
.card-link {
  border: 1px solid #dddddd;
  color: #111111;
  background: #ffffff;
}

.ghost-action {
  border: 1px solid rgba(217, 170, 83, 0.28);
  color: var(--accent-strong);
  background: rgba(217, 170, 83, 0.08);
}

.hero-indicators {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem;
  margin-top: 2rem;
}

.hero-indicators article,
.timeline-card,
.audience-card,
.service-card {
  border: 1px solid var(--border-soft);
  background: var(--bg-card);
  box-shadow: 0 20px 42px rgba(0, 0, 0, 0.05);
}

.hero-indicators article {
  display: grid;
  gap: 0.35rem;
  padding: 1rem;
  border-radius: 18px;
}

.hero-indicators span {
  color: var(--text-soft);
  line-height: 1.6;
}

.hero-visual {
  position: relative;
  min-height: 560px;
  border-radius: 30px;
  overflow: hidden;
  background:
    linear-gradient(145deg, rgba(217, 170, 83, 0.18), transparent 32%),
    linear-gradient(180deg, #f5ebd5 0%, #f8f3e6 100%);
}

.hero-visual::before {
  content: '';
  position: absolute;
  inset: 10%;
  border-radius: 26px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(17, 17, 17, 0.18)),
    url('https://images.unsplash.com/photo-1517479149777-5f3b1511d5ad?auto=format&fit=crop&w=1200&q=80');
  background-size: cover;
  background-position: center;
}

.visual-panel {
  position: absolute;
  display: grid;
  gap: 0.4rem;
  padding: 1.2rem;
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 24px 50px rgba(0, 0, 0, 0.08);
}

.panel-main {
  left: 1.5rem;
  right: 5rem;
  bottom: 1.5rem;
}

.panel-float {
  top: 1.5rem;
  right: 1.5rem;
  max-width: 230px;
}

.panel-kicker,
.audience-tag,
.timeline-index {
  color: var(--accent-strong);
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.panel-main strong,
.panel-float strong {
  font-size: 1.4rem;
  letter-spacing: -0.04em;
}

.section-shell {
  max-width: 1280px;
  margin: 0 auto;
}

.section-head {
  display: grid;
  gap: 0.75rem;
  max-width: 760px;
  margin-bottom: 1.5rem;
}

.section-head h2,
.differential-copy h2,
.final-cta-shell h2 {
  font-size: clamp(2rem, 4.4vw, 3.2rem);
  line-height: 1.02;
}

.services-grid,
.audience-grid {
  display: grid;
  gap: 1rem;
}

.services-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.service-card {
  display: grid;
  gap: 1rem;
  padding: 1.35rem;
  border-radius: 26px;
  overflow: hidden;
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 2rem;
  padding: 0 0.75rem;
  border: 1px solid rgba(217, 170, 83, 0.2);
  border-radius: 999px;
  color: var(--accent-strong);
  background: rgba(217, 170, 83, 0.08);
  font-size: 0.78rem;
  font-weight: 800;
}

.service-media {
  position: relative;
  overflow: hidden;
  border-radius: 18px;
  min-height: 210px;
}

.service-media::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(6, 8, 12, 0.02), rgba(6, 8, 12, 0.28));
}

.service-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.service-card h3,
.audience-card h3,
.timeline-card h3 {
  font-size: 1.5rem;
}

.feature-list {
  display: grid;
  gap: 0.65rem;
  margin: 0;
  padding-left: 1.1rem;
  color: var(--text-soft);
}

.card-link {
  width: fit-content;
  min-height: 2.95rem;
}

.audience-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.audience-card {
  display: grid;
  gap: 0.8rem;
  padding: 1.2rem;
  border-radius: 24px;
}

.audience-card strong {
  color: var(--text-main);
  font-size: 0.98rem;
}

.timeline-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.9rem;
}

.timeline-card {
  display: grid;
  gap: 0.7rem;
  padding: 1.1rem;
  border-radius: 22px;
}

.differential-section {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 1.2rem;
  align-items: start;
}

.differential-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.8rem;
}

.differential-chip {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 1rem 1.05rem;
  border: 1px solid var(--border-soft);
  border-radius: 18px;
  background: #ffffff;
}

.differential-chip span {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--accent-strong), #9f6c1f);
}

.final-cta {
  padding-bottom: 4rem;
}

.final-cta-shell {
  max-width: 1280px;
  margin: 0 auto;
  padding: clamp(1.5rem, 4vw, 2.5rem);
  border: 1px solid rgba(217, 170, 83, 0.18);
  border-radius: 30px;
  background:
    radial-gradient(circle at top right, rgba(217, 170, 83, 0.14), transparent 22%),
    linear-gradient(135deg, #ffffff, #faf8f2);
  text-align: center;
}

.final-cta-shell h2,
.final-cta-shell p:last-of-type {
  margin-inline: auto;
}

.final-cta-shell p:last-of-type {
  max-width: 62ch;
  margin-top: 1rem;
}

.final-cta-shell .hero-actions {
  justify-content: center;
}

@media (max-width: 1180px) {
  .hero-section,
  .differential-section,
  .services-grid,
  .audience-grid,
  .timeline-grid {
    grid-template-columns: 1fr;
  }

  .hero-copy h1,
  .section-head h2,
  .differential-copy h2,
  .final-cta-shell h2 {
    max-width: none;
  }
}

@media (max-width: 760px) {
  .hero-section {
    min-height: auto;
    padding-top: 2rem;
  }

  .hero-indicators,
  .differential-grid {
    grid-template-columns: 1fr;
  }

  .hero-actions,
  .final-cta-shell .hero-actions {
    flex-direction: column;
  }

  .primary-action,
  .secondary-action,
  .ghost-action {
    width: 100%;
  }

  .hero-visual {
    min-height: 420px;
  }

  .panel-main {
    right: 1.5rem;
  }
}
</style>
