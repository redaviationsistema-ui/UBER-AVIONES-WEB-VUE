<script setup>
import { computed } from 'vue'

const props = defineProps({
  flags: { type: Array, required: true },
})

const alertSignals = computed(() => [
  { label: 'Flags abiertos', value: props.flags.length || '0', detail: 'Eventos visibles para revision inmediata.' },
  {
    label: 'Escaladas',
    value: props.flags.filter((flag) => String(flag.status || '').toLowerCase().includes('escal')).length || '0',
    detail: 'Casos con impacto alto o seguimiento reforzado.',
  },
  { label: 'Canales unificados', value: '100%', detail: 'Soporte y seguimiento bajo control central.' },
])

const latestFlags = computed(() => props.flags.slice(0, 6))
</script>

<template>
  <div class="admin-alerts-page">
    <section class="dashboard-hero">
      <div class="hero-center">
        <p class="eyebrow dark-eyebrow">Alertas y soporte</p>
        <h1>Supervisa riesgo, soporte y fuga operativa desde un solo tablero.</h1>
        <p class="hero-subtitle">
          Esta vista concentra flags, trazabilidad y criterios de escalamiento con una lectura
          mas clara para actuar rapido sin perder contexto.
        </p>
      </div>
    </section>

    <section class="status-strip">
      <article v-for="item in alertSignals" :key="item.label" class="signal-card">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <p>{{ item.detail }}</p>
      </article>
    </section>

    <section class="content-section">
      <div class="section-heading">
        <h2>Flags recientes</h2>
        <p>Los eventos visibles para auditoria, escalamiento y seguimiento operativo.</p>
      </div>

      <div class="alert-grid">
        <article v-for="flag in latestFlags" :key="flag.id" class="alert-card">
          <span class="alert-badge">Flag #{{ flag.id }}</span>
          <h3>{{ flag.status || 'En revision' }}</h3>
          <p>{{ flag.created_at || 'Sin fecha visible' }}</p>
        </article>

        <article v-if="!latestFlags.length" class="alert-card empty-card">
          <h3>Sin alertas abiertas</h3>
          <p>No hay alertas anti-broker visibles en este momento.</p>
        </article>
      </div>
    </section>

    <section class="content-section compact-section">
      <div class="section-heading">
        <h2>Ruta de soporte centralizado</h2>
        <p>Todo el servicio pasa por Sky Group con control editorial y sin fuga de contexto.</p>
      </div>

      <div class="support-layout">
        <article class="support-card">
          <span class="support-label">Canal 01</span>
          <h3>Auditar mensajes</h3>
          <p>Revision de conversaciones, patrones y relacion comercial sensible.</p>
        </article>

        <article class="support-card">
          <span class="support-label">Canal 02</span>
          <h3>Detectar fuga</h3>
          <p>Identificacion de desviaciones fuera del flujo oficial y del frente de marca.</p>
        </article>

        <article class="support-card">
          <span class="support-label">Canal 03</span>
          <h3>Escalar soporte</h3>
          <p>Activacion de acciones, responsables y cierre de seguimiento interno.</p>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.admin-alerts-page {
  min-height: 100vh;
  background: #ffffff;
  color: #111111;
}

.dashboard-hero,
.content-section {
  padding: 1.5rem clamp(1.25rem, 5vw, 4.5rem);
}

.dashboard-hero {
  display: grid;
  min-height: 44vh;
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
.section-heading h2,
.alert-card h3,
.support-card h3 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.05em;
}

.hero-center h1 {
  max-width: 14ch;
  font-size: clamp(2.5rem, 6vw, 4rem);
  line-height: 0.98;
}

.hero-subtitle,
.section-heading p,
.signal-card p,
.alert-card p,
.support-card p {
  color: #5d5d5d;
  line-height: 1.7;
}

.hero-subtitle {
  max-width: 62ch;
  margin: 0;
}

.status-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
  padding: 0 clamp(1.25rem, 5vw, 4.5rem) 1.2rem;
  margin-top: -1.2rem;
}

.signal-card,
.alert-card,
.support-card {
  border: 1px solid #ebebeb;
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.05);
}

.signal-card {
  display: grid;
  gap: 0.4rem;
  padding: 1rem 1.05rem;
}

.signal-card span,
.alert-badge,
.support-label {
  color: #666666;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.content-section {
  display: grid;
  gap: 1.5rem;
}

.section-heading {
  max-width: 760px;
}

.section-heading h2 {
  font-size: clamp(2rem, 4vw, 3rem);
  line-height: 1.02;
}

.alert-grid,
.support-layout {
  display: grid;
  gap: 1rem;
}

.alert-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.support-layout {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.alert-card,
.support-card {
  display: grid;
  gap: 0.6rem;
  padding: 1rem;
  background: #fafafa;
}

.alert-badge,
.support-label {
  color: #8c6a1f;
}

@media (max-width: 1080px) {
  .status-strip,
  .alert-grid,
  .support-layout {
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
}
</style>
