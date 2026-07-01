<script setup>
import { computed } from 'vue'
import { roleSections, resolveRoleSectionPath } from '../../data/roleFlows'

const props = defineProps({
  kpis: { type: Array, required: true },
  analytics: { type: Array, required: true },
})

const preferredSectionOrder = [
  'reservas',
  'clientes',
  'proveedores',
  'aeronaves',
  'sobrecargos',
  'disponibilidad',
  'contratos',
  'pagos',
]

const operationalSections = computed(() => {
  const adminSections = roleSections.admin || []
  const rankedSections = preferredSectionOrder
    .map((id) => adminSections.find((item) => item.id === id))
    .filter(Boolean)

  return rankedSections.slice(0, 8)
})

const visibleKpis = computed(() =>
  props.kpis.filter((item) => item?.label || item?.value).slice(0, 4),
)

const visibleAnalytics = computed(() =>
  props.analytics.filter((item) => item?.label || item?.value).slice(0, 4),
)

const leadKpi = computed(() => visibleKpis.value[0] || null)
const supportKpis = computed(() => visibleKpis.value.slice(1))
</script>

<template>
  <div class="admin-executive-page">
    <section v-if="visibleKpis.length" class="hero-section">
      <article v-if="leadKpi" class="hero-card">
        <span class="eyebrow">Admin</span>
        <h1>{{ leadKpi.value }}</h1>
        <p>{{ leadKpi.label }}</p>
      </article>

      <div v-if="supportKpis.length" class="hero-stats">
        <article v-for="item in supportKpis" :key="item.label" class="stat-card">
          <span class="card-label">{{ item.label }}</span>
          <strong class="stat-value">{{ item.value }}</strong>
        </article>
      </div>
    </section>

    <section class="panel-section">
      <div class="section-header">
        <h2>Modulos</h2>
      </div>

      <div class="link-grid">
        <RouterLink
          v-for="section in operationalSections"
          :key="section.id"
          :to="resolveRoleSectionPath('admin', section)"
          class="card link-card"
        >
          <strong>{{ section.label }}</strong>
          <span class="link-card__cta">Ver</span>
        </RouterLink>
      </div>
    </section>

    <section v-if="visibleAnalytics.length" class="panel-section">
      <div class="section-header">
        <h2>Indicadores</h2>
      </div>

      <div class="analytics-grid">
        <article v-for="item in visibleAnalytics" :key="item.label" class="card analytics-card">
          <span class="card-label">{{ item.label }}</span>
          <strong class="card-value">{{ item.value }}</strong>
          <div v-if="typeof item.score === 'number'" class="meter" aria-hidden="true">
            <span class="meter__fill" :style="{ width: `${Math.max(0, Math.min(item.score, 100))}%` }"></span>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.admin-executive-page {
  display: grid;
  gap: 1rem;
  padding: 1rem 1.25rem 1.5rem;
  color: #0f172a;
}

.hero-section {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.9fr);
  gap: 0.9rem;
}

.hero-card,
.stat-card,
.card {
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.88);
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.04),
    0 10px 30px rgba(15, 23, 42, 0.04);
}

.hero-card {
  display: grid;
  gap: 0.3rem;
  padding: 1.35rem;
  border-radius: 24px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(246, 249, 255, 0.96)),
    linear-gradient(135deg, #2563eb, #1d4ed8);
}

.hero-card h1 {
  margin: 0;
  font-size: clamp(2.4rem, 5vw, 4rem);
  line-height: 0.94;
  letter-spacing: -0.06em;
}

.hero-card p {
  margin: 0;
  font-size: 1rem;
  color: #475569;
}

.hero-stats {
  display: grid;
  gap: 0.9rem;
  grid-template-columns: repeat(1, minmax(0, 1fr));
}

.stat-card {
  display: grid;
  gap: 0.2rem;
  padding: 1rem 1.05rem;
  border-radius: 20px;
}

.eyebrow {
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #2563eb;
}

.panel-section {
  display: grid;
  gap: 0.75rem;
}

.section-header h1,
.section-header h2 {
  margin: 0;
  font-size: 0.98rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #0f172a;
}

.kpi-grid,
.link-grid,
.analytics-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.card {
  display: grid;
  gap: 0.45rem;
  padding: 1rem 1.05rem;
  border-radius: 20px;
}

.card-label {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #64748b;
}

.card-value {
  font-size: 1.55rem;
  line-height: 1.05;
  letter-spacing: -0.05em;
}

.link-card {
  color: inherit;
  text-decoration: none;
  align-content: space-between;
  min-height: 5rem;
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.link-card strong {
  font-size: 1.05rem;
  line-height: 1.2;
  letter-spacing: -0.03em;
}

.link-card:hover,
.link-card:focus-visible {
  transform: translateY(-1px);
  border-color: rgba(37, 99, 235, 0.18);
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.04),
    0 14px 32px rgba(37, 99, 235, 0.08);
}

.link-card__cta {
  color: #2563eb;
  font-size: 0.8rem;
  font-weight: 700;
}

.stat-value {
  font-size: 1.6rem;
  line-height: 1;
  letter-spacing: -0.05em;
}

.meter {
  overflow: hidden;
  height: 0.32rem;
  border-radius: 999px;
  background: #e2e8f0;
}

.meter__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #2563eb, #1d4ed8);
}

@media (max-width: 960px) {
  .hero-section {
    grid-template-columns: 1fr;
  }

  .hero-stats {
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  }
}

@media (max-width: 720px) {
  .admin-executive-page {
    padding: 1rem;
  }
}
</style>
