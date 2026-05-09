<script setup>
import { computed } from 'vue'

const props = defineProps({
  kpis: { type: Array, required: true },
  quickActions: { type: Array, required: true },
  controlAreas: { type: Array, required: true },
  analytics: { type: Array, required: true },
  flowSteps: { type: Array, required: true },
  policies: { type: Array, required: true },
  reservationStates: { type: Array, required: true },
  paymentStates: { type: Array, required: true },
  incidentStates: { type: Array, required: true },
})

const executiveSignals = computed(() => props.kpis.slice(0, 4))
const featuredActions = computed(() => props.quickActions.slice(0, 4))
const featuredAreas = computed(() => props.controlAreas.slice(0, 4))
const featuredAnalytics = computed(() => props.analytics.slice(0, 3))
const featuredFlow = computed(() => props.flowSteps.slice(0, 4))
const featuredPolicies = computed(() => props.policies.slice(0, 3))

const stateGroups = computed(() => [
  { title: 'Estados de reserva', items: props.reservationStates },
  { title: 'Estados de pago', items: props.paymentStates },
  { title: 'Estados de incidencia', items: props.incidentStates },
])
</script>

<template>
  <div class="admin-executive-page">
    <section class="dashboard-hero">
      <div class="hero-center">
        <p class="eyebrow dark-eyebrow">Admin completo</p>
        <h1>Control ejecutivo del negocio desde una sola vista.</h1>
        <p class="hero-subtitle">
          Supervisa ingresos, reservas, flota, incidencias y reglas clave con el mismo lenguaje
          editorial premium del portal cliente, pero orientado a decisiones administrativas.
        </p>

        <div class="hero-actions">
          <button v-for="action in featuredActions" :key="action" class="hero-chip" type="button">
            {{ action }}
          </button>
        </div>
      </div>
    </section>

    <section class="status-strip">
      <article v-for="item in executiveSignals" :key="item.label" class="signal-card">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <p>{{ item.detail }}</p>
      </article>
    </section>

    <section class="editorial-section">
      <div class="editorial-heading">
        <h2>Frentes de control prioritario</h2>
        <p>
          En lugar de un tablero rigido, esta vista resume los dominios que mas impactan margen,
          cumplimiento y velocidad operativa.
        </p>
      </div>

      <div class="step-editorial refined-steps">
        <article v-for="area in featuredAreas" :key="area.title" class="step-row">
          <div class="step-index" aria-hidden="true">
            <span>{{ area.title.charAt(0) }}</span>
          </div>

          <div class="step-copy">
            <span class="step-meta">{{ area.meta }}</span>
            <strong>{{ area.title }}</strong>
            <p>{{ area.description }}</p>
          </div>
        </article>
      </div>
    </section>

    <section class="modes-section">
      <div class="section-heading">
        <h2>Indicadores con lectura ejecutiva</h2>
        <p>
          Los principales analytics del negocio se presentan como bloques de lectura rapida,
          manteniendo la misma experiencia limpia del frente cliente.
        </p>
      </div>

      <div class="modes-grid refined-modes-grid">
        <article v-for="metric in featuredAnalytics" :key="metric.label" class="mode-card">
          <div class="mode-copy">
            <span class="mode-label">Indicador clave</span>
            <h3>{{ metric.value }}</h3>
            <p>{{ metric.label }}</p>
            <div class="mode-meter">
              <span class="mode-meter-fill" :style="{ width: `${metric.score}%` }"></span>
            </div>
          </div>
        </article>

        <article class="mode-card accent-mode-card">
          <div class="mode-copy">
            <span class="mode-label">Decision flow</span>
            <h3>{{ flowSteps.length }} pasos orquestados</h3>
            <p>Desde la solicitud inicial hasta el cierre financiero y operativo del servicio.</p>
          </div>
        </article>
      </div>
    </section>

    <section class="discovery-section">
      <div class="section-heading">
        <h2>Recorrido operativo del admin</h2>
        <p>La operacion completa resumida en un flujo claro para decisiones de seguimiento.</p>
      </div>

      <div class="discovery-grid">
        <article v-for="(step, index) in featuredFlow" :key="step" class="discovery-card">
          <div class="discovery-copy">
            <span class="discovery-badge">Paso 0{{ index + 1 }}</span>
            <h3>{{ step }}</h3>
            <p>Parte del recorrido ejecutivo que conecta servicio, control y rentabilidad.</p>
          </div>
        </article>
      </div>
    </section>

    <section class="editorial-section compact-section">
      <div class="section-heading">
        <h2>Estados y reglas del sistema</h2>
        <p>
          Todo el lenguaje operativo centralizado en una sola capa para evitar friccion entre
          areas, pagos y seguimiento de incidencias.
        </p>
      </div>

      <div class="states-layout">
        <article v-for="group in stateGroups" :key="group.title" class="state-card">
          <h3>{{ group.title }}</h3>
          <div class="state-row">
            <span v-for="item in group.items" :key="item" class="state-pill">{{ item }}</span>
          </div>
        </article>
      </div>

      <div class="policies-grid">
        <article v-for="item in featuredPolicies" :key="item.title" class="policy-card">
          <strong>{{ item.title }}</strong>
          <p>{{ item.description }}</p>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.admin-executive-page {
  min-height: 100vh;
  background: #ffffff;
  color: #111111;
}

.dashboard-hero,
.editorial-section,
.modes-section,
.discovery-section {
  padding: 1.5rem clamp(1.25rem, 5vw, 4.5rem);
}

.dashboard-hero {
  display: grid;
  gap: 2rem;
  min-height: 62vh;
  padding-top: 1rem;
  background:
    radial-gradient(circle at top right, rgba(201, 164, 90, 0.12), transparent 18%),
    linear-gradient(180deg, #ffffff 0%, #faf8f2 100%);
}

.hero-center {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 1rem;
  text-align: center;
}

.dark-eyebrow {
  color: #8c6a1f;
}

.hero-center h1,
.editorial-heading h2,
.section-heading h2,
.mode-copy h3,
.discovery-copy h3,
.state-card h3 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.05em;
}

.hero-center h1 {
  max-width: 13ch;
  font-size: clamp(2.8rem, 7vw, 4.4rem);
  line-height: 0.96;
}

.hero-subtitle,
.editorial-heading p,
.section-heading p,
.step-copy p,
.mode-copy p,
.discovery-copy p,
.signal-card p,
.policy-card p {
  color: #5d5d5d;
  line-height: 1.7;
}

.hero-subtitle {
  max-width: 64ch;
  margin: 0;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem;
}

.hero-chip {
  min-height: 3rem;
  padding: 0 1rem;
  border: 1px solid #ebebeb;
  border-radius: 999px;
  color: #111111;
  background: rgba(255, 255, 255, 0.88);
  font-weight: 800;
}

.status-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
  padding: 0 clamp(1.25rem, 5vw, 4.5rem) 1.2rem;
  margin-top: -1.2rem;
}

.signal-card {
  display: grid;
  gap: 0.4rem;
  padding: 1rem 1.05rem;
  border: 1px solid #ebebeb;
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.05);
}

.signal-card span,
.discovery-badge,
.step-meta,
.mode-label,
.state-pill {
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.signal-card span {
  color: #666666;
}

.signal-card strong {
  font-size: 1rem;
}

.editorial-section,
.modes-section,
.discovery-section {
  display: grid;
  gap: 1.6rem;
}

.editorial-heading,
.section-heading {
  max-width: 760px;
}

.editorial-heading h2,
.section-heading h2 {
  font-size: clamp(2rem, 4vw, 3rem);
  line-height: 1.02;
}

.step-editorial {
  display: grid;
  gap: 1rem;
}

.refined-steps {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.step-row {
  display: grid;
  gap: 1rem;
  padding: 1.15rem;
  border: 1px solid #ebebeb;
  border-radius: 20px;
  background: #fafafa;
}

.step-index {
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  border-radius: 16px;
  color: #111111;
  background: #f0f0f0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  font-size: 1rem;
  font-weight: 800;
}

.step-meta,
.discovery-badge,
.mode-label {
  color: #8c6a1f;
}

.step-copy strong {
  display: block;
  margin-bottom: 0.45rem;
  font-size: 1.15rem;
}

.modes-grid {
  display: grid;
  gap: 1rem;
}

.refined-modes-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.mode-card,
.discovery-card,
.state-card,
.policy-card {
  display: grid;
  gap: 1rem;
  padding: 1rem;
  border-radius: 18px;
  background: #f5f5f5;
}

.accent-mode-card {
  background: linear-gradient(135deg, #f3ead2, #f8f5ee);
}

.mode-copy {
  display: grid;
  gap: 0.5rem;
}

.mode-label {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  min-height: 2rem;
  padding: 0 0.7rem;
  border-radius: 999px;
  background: #f3ead2;
}

.mode-copy h3,
.discovery-copy h3 {
  font-size: 1.2rem;
}

.mode-meter {
  display: flex;
  height: 0.55rem;
  overflow: hidden;
  border-radius: 999px;
  background: #e8ebf0;
}

.mode-meter-fill {
  border-radius: inherit;
  background: linear-gradient(90deg, #d8b45b, #516987);
}

.discovery-grid,
.states-layout,
.policies-grid {
  display: grid;
  gap: 1rem;
}

.discovery-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.discovery-card {
  border: 1px solid #ebebeb;
  background: #ffffff;
}

.discovery-copy {
  display: grid;
  gap: 0.65rem;
}

.compact-section {
  padding-top: 0;
}

.states-layout {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.state-card {
  background: #fafafa;
  border: 1px solid #ebebeb;
}

.state-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.state-pill {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0 0.7rem;
  border-radius: 999px;
  color: #8c6a1f;
  background: #f3ead2;
}

.policies-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.policy-card {
  background: #fafafa;
  border: 1px solid #ebebeb;
}

@media (max-width: 1080px) {
  .status-strip,
  .refined-steps,
  .refined-modes-grid,
  .discovery-grid,
  .states-layout,
  .policies-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .hero-center {
    justify-items: stretch;
    text-align: left;
  }

  .hero-center h1 {
    max-width: none;
  }

  .hero-actions {
    justify-content: stretch;
  }

  .hero-chip {
    width: 100%;
  }
}
</style>
