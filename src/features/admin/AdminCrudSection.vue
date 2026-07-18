<script setup>
import { computed } from 'vue'

const props = defineProps({
  eyebrow: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  highlights: { type: Array, default: () => [] },
  frontendFields: { type: Array, default: () => [] },
  backendFields: { type: Array, default: () => [] },
  databaseFields: { type: Array, default: () => [] },
  actions: { type: Array, default: () => [] },
  fields: { type: Array, default: () => [] },
  details: { type: Array, default: () => [] },
  edits: { type: Array, default: () => [] },
  deactivation: { type: Array, default: () => [] },
  states: { type: Array, default: () => [] },
})

const keySignals = computed(() => props.highlights.slice(0, 4))

const workstreams = computed(() => [
  { title: 'Crear', items: props.fields },
  { title: 'Ver', items: props.details },
  { title: 'Editar', items: props.edits },
  { title: 'Acciones clave', items: props.actions },
  { title: 'Desactivar / cerrar', items: props.deactivation },
])

const synchronizedFields = computed(() =>
  [
    { title: 'Frontend', items: props.frontendFields },
    { title: 'Backend / API', items: props.backendFields },
    { title: 'BD / relaciones', items: props.databaseFields },
  ].filter((group) => group.items.length),
)
</script>

<template>
  <div class="admin-crud-page">
    <section class="dashboard-hero">
      <div class="hero-center">
        <p class="eyebrow dark-eyebrow">{{ eyebrow }}</p>
        <h1>{{ title }}</h1>
        <p class="hero-subtitle">{{ description }}</p>
      </div>
    </section>

    <section v-if="keySignals.length" class="status-strip">
      <article v-for="item in keySignals" :key="item.label" class="signal-card">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <p>{{ item.detail }}</p>
      </article>
    </section>

    <section v-if="synchronizedFields.length" class="editorial-section compact-section">
      <div class="section-heading">
        <h2>Campos sincronizados</h2>
        <p>
          Estos campos salen de los registros reales ya cargados en el portal. No son una lista
          estatica: cambian segun el payload disponible en frontend, backend y relaciones.
        </p>
      </div>

      <div class="workstreams-grid">
        <article v-for="group in synchronizedFields" :key="group.title" class="workstream-card">
          <span class="workstream-label">{{ group.title }}</span>
          <ul>
            <li v-for="item in group.items" :key="item">{{ item }}</li>
          </ul>
        </article>
      </div>
    </section>

    <section class="editorial-section">
      <div class="section-heading">
        <h2>Flujos principales del modulo</h2>
        <p>
          Cada area administrativa se organiza en tareas claras para que el equipo sepa que crear,
          revisar, editar y cerrar sin depender de una lectura tecnica.
        </p>
      </div>

      <div class="workstreams-grid">
        <article v-for="stream in workstreams" :key="stream.title" class="workstream-card">
          <span class="workstream-label">{{ stream.title }}</span>
          <ul>
            <li v-for="item in stream.items" :key="item">{{ item }}</li>
            <li v-if="!stream.items.length">Sin elementos configurados.</li>
          </ul>
        </article>
      </div>
    </section>

    <section v-if="states.length" class="editorial-section compact-section">
      <div class="section-heading">
        <h2>Estados del flujo</h2>
        <p>Las etapas visibles del modulo para seguimiento administrativo y lectura operativa.</p>
      </div>

      <div class="states-panel">
        <span v-for="item in states" :key="item" class="state-pill">{{ item }}</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.admin-crud-page {
  min-height: 100vh;
  background: #ffffff;
  color: #111111;
}

.dashboard-hero,
.editorial-section {
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
  color: #000000;
}

.hero-center h1,
.section-heading h2 {
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
.workstream-card li {
  color: #000000;
  line-height: 1.7;
}

.hero-subtitle {
  max-width: 62ch;
  margin: 0;
}

.status-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
  padding: 0 clamp(1.25rem, 5vw, 4.5rem) 1.2rem;
  margin-top: -1.2rem;
}

.signal-card,
.workstream-card,
.states-panel {
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
.workstream-label {
  color: #000000;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.section-heading {
  max-width: 760px;
}

.section-heading h2 {
  font-size: clamp(2rem, 4vw, 3rem);
  line-height: 1.02;
}

.editorial-section {
  display: grid;
  gap: 1.5rem;
}

.workstreams-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}

.workstream-card {
  display: grid;
  gap: 0.7rem;
  padding: 1rem;
  background: #fafafa;
}

.workstream-label {
  color: #000000;
}

.workstream-card ul {
  display: grid;
  gap: 0.55rem;
  margin: 0;
  padding-left: 1rem;
}

.compact-section {
  padding-top: 0;
}

.states-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  padding: 1rem;
}

.state-pill {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0 0.75rem;
  border-radius: 999px;
  color: #000000;
  background: #f3ead2;
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

@media (max-width: 1080px) {
  .status-strip,
  .workstreams-grid {
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
