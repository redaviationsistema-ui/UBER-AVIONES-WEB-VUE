<script setup>
import { computed, defineComponent, h } from 'vue'
import { useRouter } from 'vue-router'
import { roleSections, resolveRoleSectionPath, resolveRoleSectionRoute } from '../../data/roleFlows'

const props = defineProps({
  kpis: { type: Array, required: true },
  analytics: { type: Array, required: true },
  recentActivity: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  errorMessage: { type: String, default: '' },
})

const router = useRouter()

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
  props.kpis.filter((item) => item?.label || item?.value).slice(0, 6),
)

const visibleAnalytics = computed(() =>
  props.analytics.filter((item) => item?.label || item?.value).slice(0, 6),
)

const leadKpi = computed(() => visibleKpis.value[0] || null)
const supportKpis = computed(() => visibleKpis.value.slice(1, 4))
const dashboardCards = computed(() => visibleKpis.value.slice(0, 4))
const quickSections = computed(() => operationalSections.value.slice(0, 4))

const heroFacts = computed(() => {
  const cards = supportKpis.value.length ? supportKpis.value : visibleAnalytics.value.slice(0, 3)
  return cards.slice(0, 3)
})

const workflowItems = computed(() => {
  const conversion = visibleAnalytics.value.find((item) => /conversion/i.test(String(item.label || '')))
  const utilization = visibleAnalytics.value.find((item) => /utilizacion|flota/i.test(String(item.label || '')))
  const incidents = visibleKpis.value.find((item) => /incidencias/i.test(String(item.label || '')))
  const crew = visibleKpis.value.find((item) => /sobrecargos/i.test(String(item.label || '')))
  const payments = visibleKpis.value.find((item) => /pago/i.test(String(item.label || '')))

  return [
    {
      id: 'comercial',
      label: 'Pulso comercial',
      detail: conversion?.value || 'Sin dato',
      cta: 'Conversion y cierres',
      status: resolveStatusFromScore(conversion?.score, 55),
    },
    {
      id: 'operacion',
      label: 'Capacidad operativa',
      detail: utilization?.value || 'Sin dato',
      cta: 'Uso de flota y demanda',
      status: resolveStatusFromScore(utilization?.score, 60),
    },
    {
      id: 'cabina',
      label: 'Cobertura de cabina',
      detail: crew?.value || 'Sin dato',
      cta: 'Sobrecargos listos',
      status: crew?.value && !String(crew.value).includes('0') ? 'complete' : 'warning',
    },
    {
      id: 'cobranza',
      label: 'Seguimiento de pagos',
      detail: payments?.value || 'Sin dato',
      cta: 'Cobranza y conciliacion',
      status: payments?.value && !String(payments.value).includes('0') ? 'warning' : 'complete',
    },
    {
      id: 'riesgo',
      label: 'Riesgo operativo',
      detail: incidents?.value || 'Sin dato',
      cta: 'Incidencias criticas',
      status: incidents?.value && !String(incidents.value).includes('0') ? 'warning' : 'complete',
    },
  ]
})

const recentActivity = computed(() => {
  if (props.recentActivity.length) {
    return props.recentActivity.slice(0, 4)
  }

  const activity = [
    leadKpi.value && {
      id: 'headline',
      date: 'Ahora',
      title: leadKpi.value.label,
      detail: `Lectura principal del dia: ${leadKpi.value.value}.`,
    },
    ...visibleAnalytics.value.slice(0, 3).map((item, index) => ({
      id: `analytic-${index}`,
      date: index === 0 ? 'Hoy' : `Bloque ${index + 1}`,
      title: item.label,
      detail: `Indicador actualizado en ${item.value}.`,
    })),
  ].filter(Boolean)

  return activity.slice(0, 4)
})

const priorityItems = computed(() => [
  {
    title: 'Estado del negocio',
    detail: leadKpi.value ? `${leadKpi.value.label}: ${leadKpi.value.value}` : 'Sin lectura principal disponible.',
    icon: 'chart',
  },
  {
    title: 'Frentes conectados',
    detail: `${operationalSections.value.length} modulos clave listos para seguimiento rapido.`,
    icon: 'grid',
  },
  {
    title: 'Analitica viva',
    detail: `${visibleAnalytics.value.length} indicadores ejecutivos visibles para control inmediato.`,
    icon: 'pulse',
  },
  {
    title: 'Siguiente accion',
    detail: quickSections.value[0]?.label
      ? `Entrar a ${quickSections.value[0].label} para continuar el flujo.`
      : 'Mantener monitoreo ejecutivo.',
    icon: 'arrow-up-right',
  },
])

const ICON_PATHS = {
  alert: [
    ['path', { d: 'M12 4L20 18H4L12 4Z' }],
    ['path', { d: 'M12 9V13' }],
    ['path', { d: 'M12 16H12.01' }],
  ],
  'arrow-up-right': [
    ['path', { d: 'M7 17L17 7' }],
    ['path', { d: 'M9 7H17V15' }],
  ],
  chart: [
    ['path', { d: 'M5 19V10' }],
    ['path', { d: 'M12 19V5' }],
    ['path', { d: 'M19 19V13' }],
  ],
  clients: [
    ['path', { d: 'M16 19V17C16 15.9 15.1 15 14 15H10C8.9 15 8 15.9 8 17V19' }],
    ['circle', { cx: '12', cy: '9', r: '3' }],
    ['path', { d: 'M18 19V17.5C18 16.7 17.6 16 17 15.6' }],
    ['path', { d: 'M6 19V17.5C6 16.7 6.4 16 7 15.6' }],
  ],
  crew: [
    ['path', { d: 'M8 19V17C8 15.9 8.9 15 10 15H14C15.1 15 16 15.9 16 17V19' }],
    ['circle', { cx: '12', cy: '9', r: '3' }],
    ['path', { d: 'M5 12C5.8 11.4 6.8 11 8 11' }],
    ['path', { d: 'M19 12C18.2 11.4 17.2 11 16 11' }],
  ],
  fleet: [
    ['path', { d: 'M4 15L11 12L20 14L13 17L4 15Z' }],
    ['path', { d: 'M11 12L13.5 7H15L14 13' }],
    ['path', { d: 'M9 15L7 18' }],
    ['path', { d: 'M16 15L18 18' }],
  ],
  grid: [
    ['rect', { x: '4', y: '4', width: '6', height: '6', rx: '1.5' }],
    ['rect', { x: '14', y: '4', width: '6', height: '6', rx: '1.5' }],
    ['rect', { x: '4', y: '14', width: '6', height: '6', rx: '1.5' }],
    ['rect', { x: '14', y: '14', width: '6', height: '6', rx: '1.5' }],
  ],
  payments: [
    ['rect', { x: '4', y: '6', width: '16', height: '12', rx: '2' }],
    ['path', { d: 'M4 10H20' }],
    ['path', { d: 'M8 15H11' }],
  ],
  pulse: [
    ['path', { d: 'M4 12H8L10.5 8L13.5 16L16 12H20' }],
  ],
  reservations: [
    ['rect', { x: '5', y: '6', width: '14', height: '14', rx: '2' }],
    ['path', { d: 'M8 4V8' }],
    ['path', { d: 'M16 4V8' }],
    ['path', { d: 'M5 10H19' }],
    ['path', { d: 'M9 13H9.01' }],
    ['path', { d: 'M12 13H12.01' }],
    ['path', { d: 'M15 13H15.01' }],
  ],
  search: [
    ['circle', { cx: '11', cy: '11', r: '5.5' }],
    ['path', { d: 'M16 16L20 20' }],
  ],
  shield: [
    ['path', { d: 'M12 4L18 7V11C18 15 15.5 18 12 20C8.5 18 6 15 6 11V7L12 4Z' }],
    ['path', { d: 'M9.5 12L11.2 13.7L14.8 10.2' }],
  ],
  users: [
    ['circle', { cx: '9', cy: '9', r: '3' }],
    ['circle', { cx: '16.5', cy: '10', r: '2.5' }],
    ['path', { d: 'M4.5 19V17.5C4.5 16.1 5.6 15 7 15H11C12.4 15 13.5 16.1 13.5 17.5V19' }],
    ['path', { d: 'M14.5 18.5V17.5C14.5 16.6 14.1 15.8 13.5 15.3' }],
  ],
}

const AppIcon = defineComponent({
  name: 'AppIcon',
  props: {
    name: { type: String, required: true },
    size: { type: Number, default: 20 },
  },
  setup(iconProps) {
    return () => {
      const nodes = ICON_PATHS[iconProps.name] || ICON_PATHS.grid
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          fill: 'none',
          xmlns: 'http://www.w3.org/2000/svg',
          width: iconProps.size,
          height: iconProps.size,
          'aria-hidden': 'true',
          class: 'app-icon-svg',
          stroke: 'currentColor',
          'stroke-width': '1.8',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        },
        nodes.map(([tag, attrs]) => h(tag, attrs)),
      )
    }
  },
})

function resolveStatusFromScore(score, threshold = 60) {
  if (typeof score !== 'number') return 'neutral'
  if (score >= threshold + 20) return 'complete'
  if (score >= threshold) return 'neutral'
  return 'warning'
}

function meterWidth(item) {
  if (typeof item?.score !== 'number') return 0
  return Math.max(0, Math.min(item.score, 100))
}

function sectionIcon(sectionId = '') {
  const iconMap = {
    reservas: 'reservations',
    clientes: 'clients',
    proveedores: 'users',
    aeronaves: 'fleet',
    sobrecargos: 'crew',
    disponibilidad: 'search',
    contratos: 'shield',
    pagos: 'payments',
  }

  return iconMap[sectionId] || 'grid'
}

function workflowIcon(itemId = '') {
  const iconMap = {
    comercial: 'chart',
    operacion: 'fleet',
    cabina: 'crew',
    cobranza: 'payments',
    riesgo: 'shield',
  }

  return iconMap[itemId] || 'grid'
}

function recentActivityIcon(entryId = '') {
  if (entryId === 'headline') return 'chart'
  return 'pulse'
}

async function navigateToAdminSection(section, event) {
  const targetPath = resolveRoleSectionPath('admin', section)
  const targetRoute = resolveRoleSectionRoute('admin', section)
  const currentPath = router.currentRoute.value.fullPath

  if (!targetPath || currentPath === targetPath) return

  event?.preventDefault?.()
  await router.push(targetRoute)
}
</script>

<template>
  <div class="admin-executive-page admin-dashboard-luxury">
    <section class="dashboard-hero-premium">
      <div class="section-head dashboard-hero-head">
        <div>
          <p class="eyebrow">Panel ejecutivo</p>
          <h1>{{ loading ? 'Cargando...' : leadKpi?.value || 'Sin dato' }}</h1>
          <p class="helper-copy">
            {{ errorMessage || leadKpi?.label || 'Resumen estrategico del frente administrativo.' }}
          </p>
        </div>
      </div>

      <div v-if="heroFacts.length" class="dashboard-hero-facts">
        <article v-for="item in heroFacts" :key="item.label">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </article>
      </div>

      <div class="dashboard-alert-strip">
        <article class="company-alert" data-tone="info">
          <span class="company-alert-icon" aria-hidden="true">
            <AppIcon name="alert" :size="16" />
          </span>
          <strong>Vista base alineada con operador</strong>
          <span>Hero premium, quick actions, KPI y panel lateral en la ruta admin.</span>
        </article>
      </div>

      <div v-if="quickSections.length" class="dashboard-quick-actions">
        <RouterLink
          v-for="section in quickSections"
          :key="section.id"
          :to="resolveRoleSectionRoute('admin', section)"
          class="quick-action-card"
          :data-action="section.id"
          @click="navigateToAdminSection(section, $event)"
        >
          <span class="quick-action-icon" aria-hidden="true">
            <AppIcon :name="sectionIcon(section.id)" :size="20" />
          </span>
          <strong>{{ section.label }}</strong>
          <small>Entrar al modulo</small>
        </RouterLink>
      </div>
    </section>

    <div class="dashboard-layout">
      <div class="dashboard-main-column">
        <article v-if="dashboardCards.length" class="surface dashboard-kpi-panel">
          <div class="section-head">
            <div>
              <p class="eyebrow">Indicadores</p>
              <h2>KPI ejecutivo admin</h2>
            </div>
          </div>

          <div class="metrics-grid dashboard-metric-grid">
            <article
              v-for="card in dashboardCards"
              :key="card.label"
              class="metric-card dashboard-metric-card"
            >
              <span>{{ card.label }}</span>
              <strong>{{ card.value }}</strong>
              <small>{{ card.detail }}</small>
            </article>
          </div>
        </article>

        <article class="surface dashboard-workflow-panel">
          <div class="section-head">
            <div>
              <p class="eyebrow">Workflow</p>
              <h2>Readiness de administracion</h2>
            </div>
          </div>

          <div class="dashboard-checklist">
            <article
              v-for="item in workflowItems"
              :key="item.id"
              class="checklist-card"
              :data-tone="item.status"
            >
              <span class="checklist-icon" :data-tone="item.status" aria-hidden="true">
                <AppIcon :name="workflowIcon(item.id)" :size="20" />
              </span>
              <div>
                <strong>{{ item.label }}</strong>
                <p>{{ item.detail }}</p>
              </div>
              <div class="checklist-progress">
                <strong>{{ item.cta }}</strong>
                <span>{{ item.status === 'complete' ? 'Estable' : item.status === 'warning' ? 'Atencion' : 'Seguimiento' }}</span>
              </div>
            </article>
          </div>
        </article>

        <article class="surface dashboard-modules-panel">
          <div class="section-head">
            <div>
              <p class="eyebrow">Modulos</p>
              <h2>Acceso transversal</h2>
            </div>
          </div>

          <div class="link-grid">
            <RouterLink
              v-for="section in operationalSections"
              :key="section.id"
              :to="resolveRoleSectionRoute('admin', section)"
              class="module-card"
              @click="navigateToAdminSection(section, $event)"
            >
              <span class="module-card__icon" aria-hidden="true">
                <AppIcon :name="sectionIcon(section.id)" :size="20" />
              </span>
              <strong>{{ section.label }}</strong>
              <span>Ver modulo</span>
            </RouterLink>
          </div>
        </article>
      </div>

      <div class="dashboard-side-column">
        <article v-if="recentActivity.length || errorMessage || loading" class="surface dashboard-executive-feed">
          <div class="section-head">
            <div>
              <p class="eyebrow">Bitacora</p>
              <h2>{{ errorMessage ? 'Estado del dashboard' : loading ? 'Sincronizando dashboard' : 'Actividad reciente' }}</h2>
            </div>
          </div>

          <p v-if="errorMessage" class="muted">
            {{ errorMessage }}
          </p>
          <p v-else-if="loading && !recentActivity.length" class="muted">
            Esperando la respuesta oficial de Laravel para poblar este panel.
          </p>
          <div v-else class="ops-timeline">
            <article
              v-for="entry in recentActivity"
              :key="entry.id"
              class="ops-timeline-item"
            >
              <div class="ops-timeline-item__head">
                <span class="ops-timeline-icon" aria-hidden="true">
                  <AppIcon :name="recentActivityIcon(entry.id)" :size="18" />
                </span>
                <span class="ops-timeline-time">{{ entry.date }}</span>
              </div>
              <div class="ops-timeline-item__body">
                <strong>{{ entry.title }}</strong>
                <p class="muted">{{ entry.detail }}</p>
              </div>
            </article>
          </div>
        </article>

        <article v-if="visibleAnalytics.length" class="surface dashboard-executive-panel">
          <div class="section-head">
            <div>
              <p class="eyebrow">Panel ejecutivo</p>
              <h2>Lectura analitica</h2>
            </div>
          </div>

          <div class="analytics-stack">
            <article
              v-for="item in visibleAnalytics"
              :key="item.label"
              class="analytics-card"
            >
              <div class="analytics-card__head">
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </div>
              <div class="meter" aria-hidden="true">
                <span class="meter__fill" :style="{ width: `${meterWidth(item)}%` }"></span>
              </div>
            </article>
          </div>

          <div class="priority-list">
            <article
              v-for="item in priorityItems"
              :key="item.title"
              class="priority-item priority-item--static"
            >
              <span class="priority-item__icon" aria-hidden="true">
                <AppIcon :name="item.icon" :size="18" />
              </span>
              <strong>{{ item.title }}</strong>
              <span>{{ item.detail }}</span>
            </article>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-dashboard-luxury {
  --admin-surface: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(246, 249, 255, 0.94));
  --admin-surface-soft: linear-gradient(180deg, rgba(251, 253, 255, 0.98), rgba(240, 246, 255, 0.96));
  --admin-border: rgba(109, 137, 189, 0.14);
  --admin-border-strong: rgba(109, 137, 189, 0.24);
  --admin-text: #142742;
  --admin-text-strong: #0f2037;
  --admin-muted: #617391;
  --admin-accent: #b98a1f;
  --admin-accent-soft: rgba(185, 138, 31, 0.12);
  --admin-success: rgba(61, 155, 107, 0.14);
  --admin-warning: rgba(219, 177, 64, 0.16);
  --admin-neutral: rgba(109, 137, 189, 0.12);
  display: grid;
  gap: 1.25rem;
  min-height: auto;
  padding: 0;
  color: var(--admin-text);
  background: transparent;
}

.dashboard-hero-premium,
.surface,
.quick-action-card,
.company-alert,
.ops-timeline-item,
.module-card,
.analytics-card,
.checklist-card,
.dashboard-hero-facts article {
  border: 1px solid var(--admin-border);
  background: var(--admin-surface);
  box-shadow:
    0 18px 40px rgba(52, 82, 134, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.dashboard-hero-premium {
  display: grid;
  gap: 1rem;
  padding: clamp(1.35rem, 3vw, 2rem);
  border-radius: 30px;
  background:
    radial-gradient(circle at top right, rgba(209, 223, 251, 0.42), transparent 24%),
    radial-gradient(circle at left center, rgba(240, 201, 99, 0.12), transparent 30%),
    var(--admin-surface);
}

.dashboard-hero-head h1 {
  margin: 0;
  font-size: clamp(2.8rem, 6vw, 4.8rem);
  line-height: 0.94;
  letter-spacing: -0.06em;
  color: var(--admin-text-strong);
}

.helper-copy,
.muted,
.company-alert span,
.metric-card small,
.checklist-card p,
.priority-item span,
.quick-action-card small {
  color: var(--admin-muted);
}

.eyebrow,
.analytics-card span,
.metric-card span,
.ops-timeline-time {
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--admin-accent);
}

.dashboard-hero-facts {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.dashboard-hero-facts article {
  display: grid;
  gap: 0.3rem;
  padding: 1rem 1.05rem;
  border-radius: 22px;
}

.dashboard-hero-facts strong {
  font-size: 1.45rem;
  line-height: 1.02;
  letter-spacing: -0.04em;
  color: var(--admin-text-strong);
}

.dashboard-alert-strip {
  display: grid;
}

.company-alert {
  display: grid;
  gap: 0.25rem;
  padding: 0.95rem 1rem;
  border-radius: 22px;
}

.company-alert strong {
  color: var(--admin-text-strong);
}

.company-alert-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 0.8rem;
  height: 0.8rem;
  color: var(--admin-accent);
}

.dashboard-quick-actions {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.quick-action-card,
.module-card {
  display: grid;
  gap: 0.5rem;
  align-content: space-between;
  min-height: 7rem;
  padding: 1rem;
  border-radius: 22px;
  color: inherit;
  text-decoration: none;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease;
}

.quick-action-card:hover,
.quick-action-card:focus-visible,
.module-card:hover,
.module-card:focus-visible {
  transform: translateY(-2px);
  border-color: var(--admin-border-strong);
  box-shadow:
    0 18px 34px rgba(52, 82, 134, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.76);
}

.quick-action-card strong,
.module-card strong,
.checklist-card strong,
.ops-timeline-item strong,
.priority-item strong,
.analytics-card strong,
.section-head h2 {
  color: var(--admin-text-strong);
}

.app-icon-svg {
  display: block;
  flex: none;
  color: currentColor;
}

.quick-action-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 18px;
  color: var(--admin-accent);
  background:
    radial-gradient(circle at 30% 30%, rgba(212, 175, 55, 0.22), transparent 48%),
    rgba(205, 221, 246, 0.32);
}

.dashboard-layout {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.92fr);
}

.dashboard-main-column,
.dashboard-side-column,
.surface {
  display: grid;
  gap: 1rem;
}

.surface {
  padding: 1.2rem;
  border-radius: 28px;
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.85rem;
}

.section-head h2,
.section-head p {
  margin: 0;
}

.metrics-grid,
.link-grid,
.dashboard-checklist,
.analytics-stack,
.priority-list,
.ops-timeline {
  display: grid;
  gap: 0.85rem;
}

.dashboard-metric-grid,
.link-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.metric-card,
.analytics-card,
.priority-item,
.ops-timeline-item,
.checklist-card {
  padding: 1rem;
  border-radius: 22px;
}

.metric-card {
  display: grid;
  gap: 0.35rem;
  background: var(--admin-surface-soft);
}

.metric-card strong {
  font-size: 2rem;
  line-height: 1;
  letter-spacing: -0.05em;
  color: var(--admin-text-strong);
}

.checklist-card {
  display: grid;
  gap: 0.9rem;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
}

.checklist-card[data-tone='complete'] {
  border-color: rgba(61, 155, 107, 0.2);
  background: linear-gradient(180deg, rgba(244, 252, 247, 0.96), rgba(238, 248, 242, 0.96));
}

.checklist-card[data-tone='warning'] {
  border-color: rgba(219, 177, 64, 0.24);
  background: linear-gradient(180deg, rgba(255, 252, 244, 0.96), rgba(250, 247, 236, 0.96));
}

.checklist-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.9rem;
  height: 2.9rem;
  border-radius: 18px;
  color: var(--admin-accent);
  background: var(--admin-neutral);
}

.checklist-icon[data-tone='complete'] {
  background: var(--admin-success);
}

.checklist-icon[data-tone='warning'] {
  background: var(--admin-warning);
}

.checklist-progress {
  display: grid;
  gap: 0.22rem;
  justify-items: end;
  text-align: right;
}

.checklist-progress span {
  font-size: 0.78rem;
  color: var(--admin-muted);
}

.module-card span,
.priority-item span,
.ops-timeline-item .muted {
  font-size: 0.92rem;
  line-height: 1.45;
}

.module-card__icon,
.ops-timeline-icon,
.priority-item__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 16px;
  color: var(--admin-accent);
  background: rgba(205, 221, 246, 0.28);
}

.ops-timeline-item {
  display: grid;
  gap: 0.35rem;
}

.ops-timeline-item__head {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.ops-timeline-item__body {
  display: grid;
  gap: 0.2rem;
}

.analytics-card {
  display: grid;
  gap: 0.7rem;
  background: var(--admin-surface-soft);
}

.analytics-card__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.85rem;
}

.meter {
  overflow: hidden;
  height: 0.38rem;
  border-radius: 999px;
  background: rgba(152, 170, 201, 0.24);
}

.meter__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #d4af37, #f2d78d);
}

.priority-list {
  margin-top: 0.25rem;
}

.priority-item {
  display: grid;
  gap: 0.25rem;
  grid-template-columns: auto 1fr;
  align-items: start;
}

.priority-item strong,
.priority-item span {
  grid-column: 2;
}

@media (max-width: 1080px) {
  .dashboard-layout,
  .dashboard-quick-actions,
  .dashboard-hero-facts {
    grid-template-columns: 1fr 1fr;
  }

  .dashboard-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .admin-dashboard-luxury {
    padding: 0;
  }

  .dashboard-hero-facts,
  .dashboard-quick-actions,
  .dashboard-metric-grid,
  .link-grid {
    grid-template-columns: 1fr;
  }

  .checklist-card {
    grid-template-columns: 1fr;
    justify-items: start;
  }

  .checklist-progress {
    justify-items: start;
    text-align: left;
  }
}
</style>
