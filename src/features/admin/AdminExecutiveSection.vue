<script setup>
import { computed, defineComponent, h } from 'vue'
import { useRouter } from 'vue-router'
import { roleSections, resolveRoleSectionPath } from '../../data/roleFlows'

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

const periodOptions = ['Hoy', 'Ultimos 7 dias', 'Este mes', 'Mes anterior', 'Este ano']

const operationalSections = computed(() => {
  const adminSections = roleSections.admin || []
  const rankedSections = preferredSectionOrder
    .map((id) => adminSections.find((item) => item.id === id))
    .filter(Boolean)

  return rankedSections.slice(0, 8)
})

const visibleKpis = computed(() =>
  props.kpis.filter((item) => item?.label || item?.value).slice(0, 8),
)

const visibleAnalytics = computed(() =>
  props.analytics.filter((item) => item?.label || item?.value).slice(0, 8),
)

const leadKpi = computed(() => visibleKpis.value[0] || null)
const supportKpis = computed(() => visibleKpis.value.slice(1, 5))
const dashboardCards = computed(() => visibleKpis.value.slice(0, 8))
const quickSections = computed(() => operationalSections.value.slice(0, 6))
const normalizedDashboardCards = computed(() => dashboardCards.value.map((item, index) => normalizeKpiCard(item, index)).filter(Boolean))

const hasDashboardData = computed(() =>
  Boolean(visibleKpis.value.length || visibleAnalytics.value.length || props.recentActivity.length),
)

const showEmptyExecutiveState = computed(() =>
  !props.loading && !props.errorMessage && !hasDashboardData.value,
)

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Buenos dias, Admin'
  if (hour < 19) return 'Buenas tardes, Admin'
  return 'Buenas noches, Admin'
})

const heroSummary = computed(() => {
  if (props.errorMessage) return props.errorMessage
  if (props.loading) return 'Estamos sincronizando el pulso comercial, financiero y operativo del dashboard.'
  if (!hasDashboardData.value) return 'No hay movimientos registrados en el periodo seleccionado.'
  return 'Resumen ejecutivo de la operacion administrativa.'
})

const heroMetricCards = computed(() =>
  supportKpis.value.slice(0, 4).map((item) => normalizeInsightItem(item, 'kpi')).filter(Boolean),
)

const heroHighlight = computed(() => normalizeKpiCard(leadKpi.value, 0))

const insightCards = computed(() =>
  visibleAnalytics.value.slice(0, 4).map((item, index) => normalizeInsightItem(item, 'analytic', index)).filter(Boolean),
)

const recentActivity = computed(() => {
  if (props.recentActivity.length) {
    return props.recentActivity.slice(0, 6).map((entry, index) => normalizeActivityEntry(entry, index))
  }

  const fallbackActivity = [
    leadKpi.value && {
      id: 'headline',
      date: 'Ahora',
      title: leadKpi.value.label,
      detail: `Lectura principal disponible: ${leadKpi.value.value}.`,
    },
    ...visibleAnalytics.value.slice(0, 3).map((item, index) => ({
      id: `analytic-${index}`,
      date: index === 0 ? 'Hoy' : `Bloque ${index + 1}`,
      title: item.label,
      detail: `Indicador actualizado en ${item.value}.`,
    })),
  ].filter(Boolean)

  return fallbackActivity.slice(0, 4).map((entry, index) => normalizeActivityEntry(entry, index))
})

const moduleCards = computed(() =>
  operationalSections.value.map((section, index) => ({
    id: section.id,
    label: section.label,
    icon: sectionIcon(section.id),
    description: moduleDescription(section.id),
    stat: dashboardCards.value[index]?.value || visibleAnalytics.value[index]?.value || 'Sin dato',
    detail:
      dashboardCards.value[index]?.label ||
      visibleAnalytics.value[index]?.label ||
      'Seguimiento ejecutivo disponible desde el modulo.',
  })),
)

const workflowItems = computed(() => {
  const conversion = visibleAnalytics.value.find((item) => /conversion/i.test(String(item.label || '')))
  const utilization = visibleAnalytics.value.find((item) => /utilizacion|flota/i.test(String(item.label || '')))
  const incidents = visibleKpis.value.find((item) => /incidencias|alertas/i.test(String(item.label || '')))
  const crew = visibleKpis.value.find((item) => /sobrecargos|cabina/i.test(String(item.label || '')))
  const payments = visibleKpis.value.find((item) => /pago|cobranza/i.test(String(item.label || '')))

  return [
    {
      id: 'comercial',
      label: 'Pulso comercial',
      detail: conversion?.value || 'Sin dato',
      cta: conversion?.detail || 'Conversion y cierres',
      status: resolveStatusFromScore(conversion?.score, 55),
    },
    {
      id: 'operacion',
      label: 'Capacidad operativa',
      detail: utilization?.value || 'Sin dato',
      cta: utilization?.detail || 'Uso de flota y demanda',
      status: resolveStatusFromScore(utilization?.score, 60),
    },
    {
      id: 'cabina',
      label: 'Cobertura de cabina',
      detail: crew?.value || 'Sin dato',
      cta: crew?.detail || 'Sobrecargos listos',
      status: crew?.value && !String(crew.value).includes('0') ? 'complete' : 'warning',
    },
    {
      id: 'cobranza',
      label: 'Seguimiento de pagos',
      detail: payments?.value || 'Sin dato',
      cta: payments?.detail || 'Cobranza y conciliacion',
      status: payments?.value && !String(payments.value).includes('0') ? 'warning' : 'complete',
    },
    {
      id: 'riesgo',
      label: 'Riesgo operativo',
      detail: incidents?.value || 'Sin dato',
      cta: incidents?.detail || 'Incidencias criticas',
      status: incidents?.value && !String(incidents.value).includes('0') ? 'warning' : 'complete',
    },
  ]
})

const priorityItems = computed(() => [
  {
    title: 'Estado del negocio',
    detail: heroHighlight.value
      ? `${heroHighlight.value.label}: ${heroHighlight.value.value}`
      : 'Sin lectura principal disponible.',
    icon: 'chart',
  },
  {
    title: 'Frentes conectados',
    detail: `${operationalSections.value.length} modulos listos para seguimiento administrativo y operativo.`,
    icon: 'grid',
  },
  {
    title: 'Lectura analitica',
    detail: `${visibleAnalytics.value.length} indicadores visibles para decisiones rapidas del equipo ejecutivo.`,
    icon: 'pulse',
  },
  {
    title: 'Siguiente accion',
    detail: quickSections.value[0]?.label
      ? `Entrar a ${quickSections.value[0].label} para continuar el flujo de hoy.`
      : 'Mantener monitoreo ejecutivo.',
    icon: 'arrow-up-right',
  },
])

const statusPanel = computed(() => {
  if (props.errorMessage) {
    return {
      tone: 'danger',
      title: 'No fue posible cargar el dashboard',
      description: props.errorMessage,
    }
  }
  if (props.loading) {
    return {
      tone: 'info',
      title: 'Actualizando informacion ejecutiva',
      description: 'Estamos consultando el backend para poblar indicadores, actividad reciente y lecturas analiticas.',
    }
  }
  if (!hasDashboardData.value) {
    return {
      tone: 'neutral',
      title: 'Sin movimientos en el periodo',
      description: 'No hay movimientos registrados en el periodo seleccionado.',
    }
  }
  return {
    tone: 'success',
    title: 'Centro de control activo',
    description: 'Indicadores y modulos conectados para seguimiento administrativo, comercial y operativo.',
  }
})

const compactEmptyCards = computed(() => [
  {
    id: 'empty-kpi',
    title: 'Indicadores pendientes',
    description: 'Los KPI apareceran aqui en cuanto el backend entregue la lectura ejecutiva del periodo.',
  },
  {
    id: 'empty-activity',
    title: 'Bitacora sin eventos',
    description: 'La actividad reciente se mostrara automaticamente cuando existan movimientos registrados.',
  },
  {
    id: 'empty-analytics',
    title: 'Analitica sin contexto',
    description: 'No se mostraran porcentajes o comparativos hasta tener datos reales para evitar lecturas falsas.',
  },
])

const ICON_PATHS = {
  alert: [
    ['path', { d: 'M12 4L20 18H4L12 4Z' }],
    ['path', { d: 'M12 9V13' }],
    ['path', { d: 'M12 16H12.01' }],
  ],
  bell: [
    ['path', { d: 'M6 9A6 6 0 0 1 18 9V12.5L19.5 15H4.5L6 12.5V9' }],
    ['path', { d: 'M10 18A2 2 0 0 0 14 18' }],
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

function normalizeKpiCard(item, index = 0) {
  if (!item) return null
  return {
    id: item.id || `kpi-${index}-${String(item.label || '').toLowerCase()}`,
    label: item.label || 'Indicador',
    value: item.value || 'Sin dato',
    detail: item.detail || 'Sin comparativo disponible',
    icon: kpiIcon(item.label),
    tone: kpiTone(item.label, item.value),
    sectionId: resolveSectionFromLabel(item.label),
  }
}

function normalizeInsightItem(item, kind = 'kpi', index = 0) {
  if (!item) return null
  return {
    id: item.id || `${kind}-${index}-${String(item.label || '').toLowerCase()}`,
    label: item.label || 'Indicador',
    value: item.value || 'Sin dato',
    detail: item.detail || 'Sin comparativo disponible',
    icon: kind === 'analytic' ? 'pulse' : kpiIcon(item.label),
    score: typeof item.score === 'number' ? Math.max(0, Math.min(item.score, 100)) : null,
    tone: kind === 'analytic' ? analyticsTone(item.score) : kpiTone(item.label, item.value),
  }
}

function normalizeActivityEntry(entry = {}, index = 0) {
  return {
    id: entry.id || `entry-${index}`,
    date: formatActivityDate(entry.date || entry.createdAt || entry.timestamp || ''),
    title: entry.title || entry.label || 'Actividad',
    detail: entry.detail || entry.description || 'Sin detalle adicional.',
    icon: recentActivityIcon(entry.id, entry.title),
  }
}

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

function analyticsTone(score) {
  if (typeof score !== 'number') return 'neutral'
  if (score >= 75) return 'positive'
  if (score >= 45) return 'neutral'
  return 'warning'
}

function kpiTone(label = '', value = '') {
  const token = String(label || '').toLowerCase()
  const valueText = String(value || '').toLowerCase()
  if (/pago|alerta|incidencia|pendiente/.test(token) && !/^0+$/.test(valueText.replace(/\D/g, ''))) return 'warning'
  if (/ingreso|reserva|cliente|aeronave|vuelo|hora|conversion/.test(token)) return 'positive'
  return 'neutral'
}

function resolveSectionFromLabel(label = '') {
  const token = String(label || '').toLowerCase()
  if (/cotiz|reserva|vuelo/.test(token)) return 'reservas'
  if (/cliente/.test(token)) return 'clientes'
  if (/proveedor/.test(token)) return 'proveedores'
  if (/aeronave|flota|hora/.test(token)) return 'aeronaves'
  if (/sobrecargo|cabina|disponibilidad/.test(token)) return 'sobrecargos'
  if (/contrato/.test(token)) return 'contratos'
  if (/pago|ingreso|cobranza|finanza/.test(token)) return 'pagos'
  return operationalSections.value[0]?.id || ''
}

function kpiIcon(label = '') {
  const sectionId = resolveSectionFromLabel(label)
  return sectionIcon(sectionId)
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

function moduleDescription(sectionId = '') {
  const descriptionMap = {
    reservas: 'Cotizaciones, reservas y seguimiento del flujo comercial y operativo.',
    clientes: 'Base de clientes, accesos y relacion comercial activa.',
    proveedores: 'Network operativo, aprobaciones y control de terceros.',
    aeronaves: 'Flota, documentos, disponibilidad y estatus de aeronaves.',
    sobrecargos: 'Directorio, cobertura y readiness de cabina.',
    disponibilidad: 'Monitoreo de disponibilidad del equipo y la operacion.',
    contratos: 'Control contractual, firmas y seguimiento documental.',
    pagos: 'Cobranza, conciliacion y atencion financiera prioritaria.',
  }

  return descriptionMap[sectionId] || 'Seguimiento ejecutivo del modulo.'
}

function recentActivityIcon(entryId = '', title = '') {
  const token = `${entryId} ${title}`.toLowerCase()
  if (/pago|cobranza/.test(token)) return 'payments'
  if (/cliente/.test(token)) return 'clients'
  if (/proveedor|approval/.test(token)) return 'users'
  if (/aeronave|flota/.test(token)) return 'fleet'
  if (/contrato/.test(token)) return 'shield'
  if (/alerta|incidencia/.test(token)) return 'alert'
  if (/reserva|cotiz|vuelo/.test(token)) return 'reservations'
  return 'pulse'
}

function formatActivityDate(value = '') {
  const text = String(value || '').trim()
  if (!text) return 'Sin fecha'
  if (/^(ahora|hoy|ayer|bloque)/i.test(text)) return text

  const normalized = text.includes('T') ? text : text.replace(' ', 'T')
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return text

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
}

async function navigateToAdminSection(section, event) {
  const targetPath = resolveRoleSectionPath('admin', section)
  const sectionId = section?.id || section || ''
  const targetRoute = {
    name: 'admin',
    params: sectionId ? { section: sectionId } : {},
  }
  const currentPath = router.currentRoute.value.fullPath

  if (!targetPath || currentPath === targetPath) return

  event?.preventDefault?.()
  await router.push(targetRoute)
}

async function navigateFromKpi(card, event) {
  if (!card?.sectionId) return
  await navigateToAdminSection(card.sectionId, event)
}
</script>

<template>
  <div class="admin-executive-page admin-dashboard-luxury">
    <section class="dashboard-hero-premium">
      <div class="dashboard-hero-premium__copy">
        <div>
          <div class="eyebrow-row">
            <p class="eyebrow">Panel ejecutivo</p>
            <span class="hero-badge">Sky Group</span>
          </div>
          <h1>{{ greeting }}</h1>
          <p class="helper-copy">{{ heroSummary }}</p>
        </div>

        <div class="hero-meta-strip">
          <span class="hero-meta-pill">
            <AppIcon name="bell" :size="16" />
            {{ statusPanel.title }}
          </span>
          <div class="hero-periods" aria-label="Periodo visible">
            <span v-for="option in periodOptions" :key="option" :class="{ 'is-active': option === 'Este mes' }">
              {{ option }}
            </span>
          </div>
        </div>
      </div>

      <div class="dashboard-hero-premium__focus">
        <article class="hero-highlight-card" :data-tone="heroHighlight?.tone || 'neutral'">
          <p class="eyebrow">Lectura principal</p>
          <strong>{{ heroHighlight?.value || (loading ? 'Cargando...' : 'Sin dato') }}</strong>
          <span>{{ heroHighlight?.label || 'Indicador principal pendiente de sincronizar.' }}</span>
          <small>{{ heroHighlight?.detail || 'Sin comparativo disponible' }}</small>
        </article>

        <div v-if="heroMetricCards.length" class="hero-mini-grid">
          <article
            v-for="item in heroMetricCards"
            :key="item.id"
            class="hero-mini-card"
            :data-tone="item.tone"
          >
            <span class="hero-mini-card__icon" aria-hidden="true">
              <AppIcon :name="item.icon" :size="18" />
            </span>
            <div>
              <small>{{ item.label }}</small>
              <strong>{{ item.value }}</strong>
            </div>
          </article>
        </div>
        <div v-else class="hero-empty-grid">
          <article v-for="item in compactEmptyCards" :key="item.id" class="hero-empty-card">
            <strong>{{ item.title }}</strong>
            <p>{{ item.description }}</p>
          </article>
        </div>
      </div>

      <div v-if="quickSections.length" class="dashboard-quick-actions">
        <button
          v-for="section in quickSections"
          :key="section.id"
          type="button"
          class="quick-action-card"
          :data-action="section.id"
          @click="navigateToAdminSection(section, $event)"
        >
          <span class="quick-action-icon" aria-hidden="true">
            <AppIcon :name="sectionIcon(section.id)" :size="20" />
          </span>
          <strong>{{ section.label }}</strong>
          <small>Ver modulo</small>
        </button>
      </div>
    </section>

    <div class="status-banner" :data-tone="statusPanel.tone">
      <span class="status-banner__icon" aria-hidden="true">
        <AppIcon :name="props.errorMessage ? 'alert' : statusPanel.tone === 'success' ? 'shield' : 'pulse'" :size="18" />
      </span>
      <div>
        <strong>{{ statusPanel.title }}</strong>
        <p>{{ statusPanel.description }}</p>
      </div>
    </div>

    <div class="dashboard-layout">
      <div class="dashboard-main-column">
        <article class="surface dashboard-kpi-panel">
          <div class="section-head">
            <div>
              <p class="eyebrow">Indicadores principales</p>
              <h2>Lectura inmediata del negocio</h2>
            </div>
          </div>

          <div v-if="normalizedDashboardCards.length" class="kpi-grid">
            <button
              v-for="card in normalizedDashboardCards"
              :key="card.id"
              type="button"
              class="kpi-card"
              :data-tone="card.tone"
              @click="navigateFromKpi(card, $event)"
            >
              <span class="kpi-card__icon" aria-hidden="true">
                <AppIcon :name="card.icon" :size="18" />
              </span>
              <small>{{ card.label }}</small>
              <strong>{{ card.value }}</strong>
              <p>{{ card.detail }}</p>
              <span class="kpi-card__link">Abrir modulo</span>
            </button>
          </div>
          <div v-else class="empty-state-card">
            <strong>No hay indicadores visibles.</strong>
            <p>El backend no devolvio KPI para esta vista ejecutiva.</p>
          </div>
        </article>

        <div class="dashboard-double-grid">
          <article class="surface dashboard-insights-panel">
            <div class="section-head">
              <div>
                <p class="eyebrow">Lectura analitica</p>
                <h2>Conversion y comportamiento</h2>
              </div>
            </div>

            <div v-if="insightCards.length" class="insights-grid">
              <article
                v-for="item in insightCards"
                :key="item.id"
                class="insight-card"
                :data-tone="item.tone"
              >
                <div class="insight-card__head">
                  <span class="insight-card__icon" aria-hidden="true">
                    <AppIcon :name="item.icon" :size="18" />
                  </span>
                  <div>
                    <small>{{ item.label }}</small>
                    <strong>{{ item.value }}</strong>
                  </div>
                </div>
                <p>{{ item.detail }}</p>
                <div class="meter" aria-hidden="true">
                  <span class="meter__fill" :style="{ width: `${meterWidth(item)}%` }"></span>
                </div>
              </article>
            </div>
            <div v-else class="empty-state-card empty-state-card--compact">
              <strong>Sin lectura analitica disponible.</strong>
              <p>Este bloque se activara cuando el dashboard devuelva analitica procesable.</p>
            </div>
          </article>

          <article class="surface dashboard-workflow-panel">
            <div class="section-head">
              <div>
                <p class="eyebrow">Prioridades del dia</p>
                <h2>Alertas y readiness</h2>
              </div>
            </div>

            <div class="workflow-stack">
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
                  <p>{{ item.cta }}</p>
                </div>
                <div class="checklist-progress">
                  <strong>{{ item.detail }}</strong>
                  <span>{{ item.status === 'complete' ? 'Estable' : item.status === 'warning' ? 'Atencion' : 'Seguimiento' }}</span>
                </div>
              </article>
            </div>
          </article>
        </div>

        <article class="surface dashboard-modules-panel">
          <div class="section-head">
            <div>
              <p class="eyebrow">Modulos clave</p>
              <h2>Acceso transversal</h2>
            </div>
          </div>

          <div class="module-grid">
            <button
              v-for="module in moduleCards"
              :key="module.id"
              type="button"
              class="module-card"
              @click="navigateToAdminSection(module.id, $event)"
            >
              <div class="module-card__head">
                <span class="module-card__icon" aria-hidden="true">
                  <AppIcon :name="module.icon" :size="20" />
                </span>
                <span class="module-card__stat">{{ module.stat }}</span>
              </div>
              <strong>{{ module.label }}</strong>
              <p>{{ module.description }}</p>
              <small>{{ module.detail }}</small>
            </button>
          </div>
        </article>
      </div>

      <div class="dashboard-side-column">
        <article class="surface dashboard-feed-panel">
          <div class="section-head">
            <div>
              <p class="eyebrow">Actividad reciente</p>
              <h2>Bitacora ejecutiva</h2>
            </div>
          </div>

          <div v-if="recentActivity.length" class="timeline">
            <article
              v-for="entry in recentActivity"
              :key="entry.id"
              class="timeline-item"
            >
              <span class="timeline-item__icon" aria-hidden="true">
                <AppIcon :name="entry.icon" :size="16" />
              </span>
              <div class="timeline-item__body">
                <strong>{{ entry.title }}</strong>
                <time>{{ entry.date }}</time>
                <p>{{ entry.detail }}</p>
              </div>
            </article>
          </div>
          <div v-else class="empty-state-card empty-state-card--compact">
            <strong>Sin actividad reciente.</strong>
            <p>Cuando el backend reporte eventos, apareceran aqui en formato timeline.</p>
          </div>
        </article>

        <article class="surface dashboard-priority-panel">
          <div class="section-head">
            <div>
              <p class="eyebrow">Lectura ejecutiva</p>
              <h2>Proximas acciones</h2>
            </div>
          </div>

          <div class="priority-list">
            <article
              v-for="item in priorityItems"
              :key="item.title"
              class="priority-item"
            >
              <span class="priority-item__icon" aria-hidden="true">
                <AppIcon :name="item.icon" :size="18" />
              </span>
              <div>
                <strong>{{ item.title }}</strong>
                <p>{{ item.detail }}</p>
              </div>
            </article>
          </div>
        </article>
      </div>
    </div>

    <section v-if="showEmptyExecutiveState" class="executive-empty-strip">
      <article v-for="item in compactEmptyCards" :key="item.id" class="executive-empty-strip__card">
        <strong>{{ item.title }}</strong>
        <p>{{ item.description }}</p>
      </article>
    </section>
  </div>
</template>

<style scoped>
.admin-dashboard-luxury {
  --admin-bg: #eef3fb;
  --admin-surface: #ffffff;
  --admin-surface-soft: #f6f9ff;
  --admin-border: rgba(115, 139, 184, 0.16);
  --admin-border-strong: rgba(115, 139, 184, 0.3);
  --admin-text: #20344f;
  --admin-text-strong: #10233f;
  --admin-muted: #667a9a;
  --admin-accent: #bc8f2e;
  --admin-accent-soft: rgba(188, 143, 46, 0.12);
  --admin-blue-soft: rgba(53, 95, 169, 0.12);
  --admin-success: #2e8459;
  --admin-success-soft: rgba(46, 132, 89, 0.12);
  --admin-warning: #b77b1c;
  --admin-warning-soft: rgba(183, 123, 28, 0.14);
  --admin-danger: #b24b4b;
  --admin-danger-soft: rgba(178, 75, 75, 0.14);
  display: grid;
  gap: 1.2rem;
  color: var(--admin-text);
  background: transparent;
}

.dashboard-hero-premium,
.surface,
.quick-action-card,
.hero-highlight-card,
.hero-mini-card,
.kpi-card,
.insight-card,
.checklist-card,
.module-card,
.timeline-item,
.priority-item,
.status-banner {
  border: 1px solid var(--admin-border);
  background: var(--admin-surface);
  box-shadow:
    0 18px 42px rgba(35, 66, 117, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.85);
}

.dashboard-hero-premium {
  display: grid;
  gap: 1rem;
  padding: clamp(1.35rem, 2.6vw, 2rem);
  border-radius: 32px;
  background:
    radial-gradient(circle at top right, rgba(177, 201, 243, 0.42), transparent 24%),
    radial-gradient(circle at left center, rgba(233, 196, 106, 0.14), transparent 28%),
    linear-gradient(180deg, #ffffff, #f7faff);
}

.dashboard-hero-premium__copy,
.dashboard-hero-premium__focus {
  display: grid;
  gap: 1rem;
}

.dashboard-hero-premium__focus {
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
}

.eyebrow-row,
.hero-meta-strip,
.module-card__head,
.insight-card__head,
.timeline-item {
  display: flex;
  align-items: center;
}

.eyebrow-row,
.hero-meta-strip {
  justify-content: space-between;
  gap: 1rem;
}

.eyebrow {
  margin: 0;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--admin-accent);
}

.hero-badge,
.hero-meta-pill,
.hero-periods span,
.kpi-card__link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.75rem;
  border-radius: 999px;
  font-size: 0.74rem;
  font-weight: 700;
}

.hero-badge,
.hero-meta-pill,
.hero-periods span {
  border: 1px solid var(--admin-border);
  background: rgba(255, 255, 255, 0.72);
  color: var(--admin-text);
}

.hero-periods {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.45rem;
}

.hero-periods .is-active {
  border-color: rgba(188, 143, 46, 0.22);
  background: var(--admin-accent-soft);
  color: var(--admin-text-strong);
}

.dashboard-hero-premium h1 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 3.4rem);
  line-height: 0.95;
  letter-spacing: -0.05em;
  color: var(--admin-text-strong);
}

.helper-copy {
  margin: 0.45rem 0 0;
  max-width: 56rem;
  color: var(--admin-muted);
  font-size: 1rem;
  line-height: 1.6;
}

.hero-highlight-card,
.hero-mini-card,
.status-banner,
.empty-state-card {
  border-radius: 24px;
}

.hero-highlight-card {
  display: grid;
  gap: 0.6rem;
  padding: 1.3rem;
  align-content: start;
  background:
    radial-gradient(circle at top right, rgba(212, 228, 255, 0.4), transparent 28%),
    linear-gradient(180deg, #fdfefe, #f5f8ff);
}

.hero-highlight-card strong {
  font-size: clamp(2rem, 4vw, 3rem);
  line-height: 0.95;
  letter-spacing: -0.06em;
  color: var(--admin-text-strong);
}

.hero-highlight-card span,
.hero-highlight-card small,
.status-banner p,
.empty-state-card p,
.insight-card p,
.module-card p,
.module-card small,
.timeline-item p,
.priority-item p,
.checklist-card p,
.kpi-card p,
.hero-mini-card small {
  color: var(--admin-muted);
}

.hero-mini-grid {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.hero-empty-grid {
  display: grid;
  gap: 0.75rem;
}

.hero-empty-card,
.executive-empty-strip__card {
  padding: 1rem 1.05rem;
  border: 1px dashed rgba(115, 139, 184, 0.22);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.58);
}

.hero-empty-card strong,
.executive-empty-strip__card strong {
  color: var(--admin-text-strong);
}

.hero-empty-card p,
.executive-empty-strip__card p {
  margin: 0.35rem 0 0;
  color: var(--admin-muted);
  line-height: 1.5;
}

.hero-mini-card {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.75rem;
  padding: 1rem;
  background: linear-gradient(180deg, #ffffff, #f8fbff);
}

.hero-mini-card strong,
.kpi-card strong,
.insight-card strong,
.checklist-card strong,
.module-card strong,
.timeline-item strong,
.priority-item strong,
.section-head h2,
.status-banner strong,
.empty-state-card strong {
  color: var(--admin-text-strong);
}

.hero-mini-card__icon,
.kpi-card__icon,
.quick-action-icon,
.insight-card__icon,
.module-card__icon,
.timeline-item__icon,
.priority-item__icon,
.status-banner__icon,
.checklist-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 2.55rem;
  height: 2.55rem;
  border-radius: 16px;
  color: var(--admin-accent);
  background:
    radial-gradient(circle at 30% 30%, rgba(212, 175, 55, 0.2), transparent 50%),
    rgba(204, 219, 244, 0.42);
}

.dashboard-quick-actions {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.quick-action-card,
.kpi-card,
.module-card {
  text-align: left;
  color: inherit;
}

.quick-action-card,
.module-card,
.kpi-card {
  display: grid;
  gap: 0.55rem;
  padding: 1rem;
  border-radius: 24px;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease;
}

.quick-action-card:hover,
.quick-action-card:focus-visible,
.kpi-card:hover,
.kpi-card:focus-visible,
.module-card:hover,
.module-card:focus-visible {
  transform: translateY(-2px);
  border-color: var(--admin-border-strong);
  box-shadow:
    0 22px 40px rgba(35, 66, 117, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.status-banner {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.9rem;
  padding: 1rem 1.1rem;
}

.status-banner p,
.empty-state-card p {
  margin: 0.2rem 0 0;
  line-height: 1.55;
}

.status-banner[data-tone='danger'] {
  border-color: rgba(178, 75, 75, 0.2);
  background: linear-gradient(180deg, rgba(255, 249, 249, 0.98), rgba(255, 243, 243, 0.98));
}

.status-banner[data-tone='success'] {
  border-color: rgba(46, 132, 89, 0.18);
  background: linear-gradient(180deg, rgba(247, 253, 250, 0.98), rgba(242, 250, 246, 0.98));
}

.status-banner[data-tone='neutral'],
.status-banner[data-tone='info'] {
  background: linear-gradient(180deg, #ffffff, #f6f9ff);
}

.dashboard-layout {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1.55fr) minmax(320px, 0.9fr);
  align-items: start;
}

.dashboard-main-column,
.dashboard-side-column,
.surface {
  display: grid;
  gap: 1rem;
}

.dashboard-main-column,
.dashboard-side-column {
  align-content: start;
}

.surface {
  padding: 1.2rem;
  border-radius: 30px;
  align-content: start;
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

.kpi-grid,
.insights-grid,
.workflow-stack,
.module-grid,
.priority-list {
  display: grid;
  gap: 0.85rem;
  align-content: start;
}

.kpi-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.kpi-card {
  min-height: 11.5rem;
  align-content: start;
  background: linear-gradient(180deg, #ffffff, #f7faff);
}

.kpi-card small,
.insight-card small,
.hero-mini-card small,
.module-card small,
.timeline-item time {
  display: block;
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.kpi-card strong {
  font-size: 2rem;
  line-height: 1;
  letter-spacing: -0.05em;
}

.kpi-card p,
.insight-card p,
.module-card p,
.priority-item p,
.timeline-item p {
  margin: 0;
  line-height: 1.55;
}

.kpi-card__link {
  margin-top: auto;
  width: fit-content;
  border: 1px solid var(--admin-border);
  background: rgba(236, 242, 252, 0.9);
  color: var(--admin-text);
}

.kpi-card[data-tone='positive'],
.insight-card[data-tone='positive'],
.hero-highlight-card[data-tone='positive'] {
  border-color: rgba(46, 132, 89, 0.16);
}

.kpi-card[data-tone='warning'],
.insight-card[data-tone='warning'],
.hero-highlight-card[data-tone='warning'] {
  border-color: rgba(183, 123, 28, 0.2);
}

.dashboard-double-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.insights-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.insight-card {
  display: grid;
  gap: 0.8rem;
  padding: 1rem;
  border-radius: 22px;
  background: var(--admin-surface-soft);
}

.insight-card__head {
  gap: 0.75rem;
  align-items: flex-start;
}

.meter {
  overflow: hidden;
  height: 0.4rem;
  border-radius: 999px;
  background: rgba(152, 170, 201, 0.2);
}

.meter__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #cfa23f, #f0d487);
}

.workflow-stack {
  align-content: start;
}

.checklist-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.9rem;
  padding: 1rem;
  border-radius: 22px;
  background: linear-gradient(180deg, #ffffff, #f8fbff);
}

.checklist-card[data-tone='complete'] {
  border-color: rgba(46, 132, 89, 0.18);
  background: linear-gradient(180deg, rgba(247, 253, 250, 0.98), rgba(242, 250, 246, 0.98));
}

.checklist-card[data-tone='warning'] {
  border-color: rgba(183, 123, 28, 0.2);
  background: linear-gradient(180deg, rgba(255, 252, 246, 0.98), rgba(252, 248, 240, 0.98));
}

.checklist-progress {
  display: grid;
  gap: 0.2rem;
  justify-items: end;
  text-align: right;
}

.checklist-progress span {
  font-size: 0.78rem;
  color: var(--admin-muted);
}

.module-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
}

.module-card {
  min-height: 10.5rem;
  align-content: start;
  background: linear-gradient(180deg, #ffffff, #f8fbff);
}

.module-card__head {
  justify-content: space-between;
  gap: 0.75rem;
}

.module-card__stat {
  font-size: 1.25rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--admin-text-strong);
}

.timeline {
  position: relative;
  display: grid;
  gap: 0.85rem;
}

.timeline::before {
  content: '';
  position: absolute;
  top: 0.4rem;
  bottom: 0.4rem;
  left: 1.15rem;
  width: 1px;
  background: rgba(115, 139, 184, 0.22);
}

.timeline-item {
  position: relative;
  align-items: flex-start;
  gap: 0.85rem;
  padding: 1rem;
  border-radius: 22px;
  background: linear-gradient(180deg, #ffffff, #f8fbff);
}

.timeline-item__body {
  display: grid;
  gap: 0.25rem;
}

.timeline-item time {
  color: var(--admin-accent);
}

.priority-list {
  gap: 0.75rem;
}

.priority-item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.75rem;
  padding: 1rem;
  border-radius: 22px;
  background: linear-gradient(180deg, #ffffff, #f8fbff);
  align-items: start;
}

.empty-state-card {
  display: grid;
  gap: 0.25rem;
  padding: 1.1rem;
  background: linear-gradient(180deg, #fcfdff, #f6f9ff);
}

.empty-state-card--compact {
  min-height: 6.5rem;
  align-content: center;
}

.executive-empty-strip {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.app-icon-svg {
  display: block;
  color: currentColor;
}

@media (max-width: 1280px) {
  .dashboard-quick-actions {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 1080px) {
  .dashboard-layout,
  .dashboard-hero-premium__focus,
  .dashboard-double-grid {
    grid-template-columns: 1fr;
  }

  .executive-empty-strip,
  .module-grid,
  .insights-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .dashboard-quick-actions,
  .kpi-grid,
  .hero-mini-grid,
  .executive-empty-strip,
  .module-grid,
  .insights-grid {
    grid-template-columns: 1fr;
  }

  .eyebrow-row,
  .hero-meta-strip,
  .module-card__head {
    align-items: flex-start;
    flex-direction: column;
  }

  .hero-periods {
    justify-content: flex-start;
  }

  .checklist-card {
    grid-template-columns: 1fr;
  }

  .checklist-progress {
    justify-items: start;
    text-align: left;
  }

  .timeline::before {
    display: none;
  }
}
</style>
