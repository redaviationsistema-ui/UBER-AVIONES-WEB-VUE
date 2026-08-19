///--------------------------------------------------------------------------------------------
/// VISTA DE DASHBOARD DE TRIPULACION, CON RESUMEN DE ESTADO, PROXIMA MISION, CHECKLIST DE PREPARACION Y CENTRO DE CONTROL OPERATIVO. PERMITE ACTUALIZAR ESTADO, VER DOCUMENTOS, VER MISION ASIGNADA Y ACCEDER A SECCION DE INCIDENTES.
///--------------------------------------------------------------------------------------------

<script setup>
import { computed } from 'vue'
import CrewUiIcon from './CrewUiIcon.vue'

const props = defineProps({
  crewName: { type: String, required: true },
  providerName: { type: String, required: true },
  profileState: { type: String, default: 'En revision' },
  summary: { type: Array, required: true },
  currentStatus: { type: String, required: true },
  statusOptions: { type: Array, required: true },
  nextFlight: { type: Object, default: null },
  statusError: { type: String, default: '' },
  checklistProgress: { type: Number, default: 0 },
  documentsValidity: { type: Number, default: 100 },
  dayOfFlightDetails: { type: Array, default: () => [] },
  readinessScore: { type: Number, default: 0 },
  readinessLabel: { type: String, default: 'Requiere atencion' },
  identitySummary: { type: Object, default: () => ({}) },
  expiringDocuments: { type: Array, default: () => [] },
  premiumAlerts: { type: Array, default: () => [] },
})

defineEmits([
  'update-status',
  'view-flight',
  'start-checklist',
  'open-documents',
  'open-availability',
  'open-incidents',
])

function stringifyMetric(value, fallback = '0') {
  if (value == null) return fallback
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return String(value.length)
  if (typeof value === 'object') {
    if (typeof value.value === 'string' || typeof value.value === 'number') {
      return String(value.value)
    }
    if (typeof value.count === 'string' || typeof value.count === 'number') {
      return String(value.count)
    }
    if (Array.isArray(value.items)) return String(value.items.length)
    return fallback
  }
  return fallback
}

function stringifyDetail(value, fallback = '') {
  if (value == null) return fallback
  if (typeof value === 'string') return value.replace(/\[object Object\]/g, '').trim() || fallback
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) return `${value.length} registro(s)`
  if (typeof value === 'object') {
    const candidate = value.detail ?? value.message ?? value.label
    return typeof candidate === 'string' ? candidate : fallback
  }
  return fallback
}

const visibleStatusOptions = computed(() => [
  { value: 'Disponible', label: 'Disponible', tone: 'green' },
  { value: 'Descanso', label: 'Descanso', tone: 'slate' },
  { value: 'En vuelo', label: 'En vuelo', tone: 'green' },
  { value: 'No disponible', label: 'No disponible', tone: 'red' },
])

const missionTitle = computed(() =>
  props.nextFlight?.route || 'Sin vuelo asignado',
)

const missionMeta = computed(() => {
  if (!props.nextFlight) return 'Sin operacion activa'
  const fragments = [props.nextFlight.date, props.nextFlight.briefingTime || props.nextFlight.time].filter(Boolean)
  return fragments.length ? fragments.join(' · Reporte ') : 'Sin horario confirmado'
})

const missionSupport = computed(() => {
  if (!props.nextFlight) return 'Admin / Red Sky te contactara cuando exista una asignacion compatible.'
  return [props.nextFlight.aircraft, props.nextFlight.serviceLevel, 'Coordinacion Admin / Red Sky'].filter(Boolean).join(' · ')
})

const nextAction = computed(() => {
  if (!props.nextFlight) {
    return {
      title: 'Proxima accion',
      detail: 'Manten tu disponibilidad activa. Admin / Red Sky te contactara cuando exista una mision compatible.',
    }
  }

  if (props.nextFlight.missionStatus === 'Pendiente') {
    return {
      title: 'Proxima accion',
      detail: 'Confirma disponibilidad con Admin / Red Sky para asegurar tu asignacion.',
    }
  }

  if (['Confirmado', 'Preparacion'].includes(props.nextFlight.missionStatus)) {
    return {
      title: 'Proxima accion',
      detail: 'Revisa briefing operativo y documentacion del servicio antes del reporte.',
    }
  }

  if (props.nextFlight.missionStatus === 'En servicio') {
    return {
      title: 'Proxima accion',
      detail: 'Mantente en coordinacion con Admin / Red Sky y reporta cualquier incidencia.',
    }
  }

  return {
    title: 'Proxima accion',
    detail: 'Confirma cierre operativo y deja evidencia o comentarios si aplica.',
  }
})

const checklistItems = computed(() => [
  {
    label: 'Perfil validado',
    state: props.documentsValidity >= 90 ? 'ok' : props.documentsValidity >= 70 ? 'warn' : 'block',
  },
  {
    label: 'Disponibilidad confirmada para hoy',
    state: props.currentStatus === 'Disponible' ? 'ok' : props.currentStatus === 'Asignado' ? 'warn' : 'block',
  },
  {
    label: 'Briefing y protocolo listos',
    state: props.checklistProgress >= 70 ? 'ok' : 'warn',
  },
  {
    label: 'Base operativa registrada',
    state: props.identitySummary.level === 'Elite Internacional' ? 'ok' : 'warn',
  },
])

const summaryMap = computed(() => Object.fromEntries(props.summary.map((item) => [item.label, item])))

const kpiCards = computed(() => [
  {
    title: 'Estado actual',
    value: props.currentStatus === 'Asignado' ? 'Asignada' : props.currentStatus || 'Sin definir',
  },
  {
    title: 'Proxima vuelo',
    value: props.nextFlight ? props.nextFlight.route || 'Asignada' : 'Sin vuelo asignado',
  },
  {
    title: 'Documentos',
    value: props.documentsValidity ? `${props.documentsValidity}% validados` : 'Pendiente de revision',
  },
  {
    title: 'Alertas',
    value: stringifyMetric(summaryMap.value['Alertas activas']?.value, '0'),
  },
])

const quickActions = computed(() => [
  {
    label: props.currentStatus === 'Disponible' ? 'Disponibilidad' : 'Actualizar disponibilidad',
    icon: 'status',
    event: 'open-availability',
  },
  {
    label: 'Documentos y licencia',
    icon: 'report',
    event: 'open-documents',
  },
  {
    label: props.nextFlight ? 'Mi mision asignada' : 'Operacion',
    icon: 'route',
    event: props.nextFlight ? 'view-flight' : 'start-checklist',
  },
  {
    label: 'Seguimiento y reportes',
    icon: 'incident',
    event: 'open-incidents',
  },
])

const operationsStrip = computed(() => [
  {
    label: 'Estado actual',
    value:
      props.currentStatus === 'Disponible'
        ? 'Disponible'
        : props.currentStatus === 'Asignado'
          ? 'Asignada'
          : props.currentStatus || 'Sin definir',
  },
  {
    label: 'Proxima vuelo',
    value: props.nextFlight ? props.nextFlight.route || 'Asignada' : 'Sin vuelo asignado',
  },
  { label: 'Base operativa', value: props.identitySummary.base || 'Pendiente de registro' },
  { label: 'Canal de coordinacion', value: 'Admin / Red Sky' },
  {
    label: 'Documentos',
    value: props.documentsValidity ? `${props.documentsValidity}% validados` : 'Pendiente de revision',
  },
  {
    label: 'Disponibilidad',
    value: props.currentStatus === 'Disponible' ? 'Activa' : props.currentStatus || 'Por confirmar',
  },
])

const readinessBreakdown = computed(() => [
  { label: 'Documentos', value: `${props.documentsValidity}%`, tone: props.documentsValidity >= 90 ? 'green' : 'amber' },
  {
    label: 'Disponibilidad',
    value: props.currentStatus === 'Disponible' ? 'Activa' : props.currentStatus || 'Sin dato',
    tone: ['Disponible', 'Asignado', 'En vuelo'].includes(props.currentStatus) ? 'green' : 'slate',
  },
  {
    label: 'Validacion',
    value: props.identitySummary.validationState || props.profileState || 'Sin dato',
    tone: String(props.profileState || '').toLowerCase().includes('aprobado') ? 'green' : 'amber',
  },
  {
    label: 'Checklist',
    value: props.checklistProgress ? `${props.checklistProgress}%` : 'Sin dato',
    tone: props.checklistProgress >= 80 ? 'green' : 'amber',
  },
])

const alertCards = computed(() => [
  ...props.premiumAlerts.map((message, index) => ({
    id: `alert-${index}`,
    title: 'Alerta inteligente',
    detail: message,
    tone: 'amber',
  })),
  ...props.expiringDocuments.map((item) => ({
    id: `doc-${item.id}`,
    title: item.name,
    detail:
      item.daysRemaining == null
        ? 'Sin vencimiento registrado'
        : item.daysRemaining < 0
          ? 'Documento vencido'
          : `Vence en ${item.daysRemaining} dia${item.daysRemaining === 1 ? '' : 's'}`,
    tone: item.tone,
  })),
].slice(0, 4))

const missionTimeline = computed(() => [
  { label: 'Asignado', done: !!props.nextFlight },
  { label: 'Preparacion', done: props.checklistProgress >= 55 },
  { label: 'Documentacion', done: props.documentsValidity >= 100 },
  { label: 'En ruta', done: props.currentStatus === 'Asignado' || props.currentStatus === 'En vuelo' },
  { label: 'En mision', done: props.currentStatus === 'En vuelo' },
  { label: 'Cierre', done: false },
])

const controlCards = computed(() => [
  {
    title: 'Operacion',
    value: props.nextFlight ? 'Operativo' : 'Stand by',
    detail: props.nextFlight ? 'Ruta, briefing y servicio visibles.' : 'Sin servicio activo. Esperando coordinacion de Red Sky.',
    tone: props.nextFlight ? 'green' : 'slate',
    icon: 'flight',
  },
  {
    title: 'Alertas',
    value: stringifyMetric(summaryMap.value['Alertas activas']?.value, '0'),
    detail: stringifyDetail(summaryMap.value['Alertas activas']?.detail, 'Sin bloqueos criticos activos.'),
    tone: stringifyMetric(summaryMap.value['Alertas activas']?.value, '0') === '0' ? 'green' : 'amber',
    icon: 'incident',
  },
  {
    title: 'Coordinacion',
    value: props.documentsValidity >= 100 ? 'Validado' : 'Seguimiento',
    detail:
      props.documentsValidity >= 100
        ? 'Documentacion lista y coordinacion centralizada con Admin / Red Sky.'
        : props.documentsValidity
          ? 'Requiere accion antes de que Admin priorice nuevos servicios.'
          : 'Sin informacion documental disponible.',
    tone: props.documentsValidity >= 100 ? 'green' : 'red',
    icon: 'report',
  },
])

function checklistIcon(state) {
  if (state === 'ok') return 'checklist'
  if (state === 'block') return 'incident'
  return 'status'
}

function checklistTone(state) {
  if (state === 'ok') return 'ok'
  if (state === 'block') return 'block'
  return 'warn'
}
</script>

<template>
  <section class="dashboard-page">
    <section class="dashboard-shell mission-control-header">
      <div class="operations-strip">
        <article v-for="item in operationsStrip" :key="item.label" class="strip-item">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </article>
      </div>

      <div class="header-main">
        <div class="identity-block">
          <p class="eyebrow">Mi operacion</p>
          <h2>Hola, {{ crewName || 'Sobrecargo' }}</h2>
          <p class="identity-copy">
            {{ [identitySummary.level, identitySummary.hours, identitySummary.languages].filter(Boolean).join(' · ') || 'Sin datos de perfil cargados' }}
          </p>
          <p class="identity-rule">
            Tu estado actual es: {{ props.currentStatus || 'Sin definir' }}. Admin / Red Sky te contactara cuando exista una asignacion compatible.
          </p>
        </div>

        <div class="header-priority-grid">
          <article class="priority-panel">
            <span class="mini-label">Proxima vuelo</span>
            <strong>{{ missionTitle }}</strong>
            <p>{{ missionMeta }}</p>
            <small>{{ missionSupport }}</small>
          </article>

          <article class="priority-panel priority-panel-compact">
            <span class="mini-label">Canal de coordinacion</span>
            <strong>{{ props.currentStatus === 'Disponible' ? 'Lista para operar' : props.currentStatus || 'Pendiente operativo' }}</strong>
            <p>{{ nextAction.detail }}</p>
            <small>Coordinacion unica: Admin / Red Sky</small>
          </article>

          <article class="priority-panel priority-panel-cta">
            <span class="mini-label">Listo para operar</span>
            <div class="ready-ring" :style="{ '--ready-score': readinessScore }">
              <div class="ready-ring-core">
                <strong>{{ readinessScore }}%</strong>
                <small>{{ readinessLabel }}</small>
              </div>
            </div>
          </article>
        </div>
      </div>

      <div class="status-selector">
        <button
          v-for="item in visibleStatusOptions"
          :key="item.value"
          class="status-chip"
          type="button"
          :data-active="currentStatus === item.value"
          :data-tone="item.tone"
          @click="$emit('update-status', item.value)"
        >
          {{ item.label }}
        </button>
      </div>
      <small v-if="statusError" class="status-error">{{ statusError }}</small>
    </section>

    <section class="kpi-row">
      <article v-for="item in kpiCards" :key="item.title" class="dashboard-shell kpi-card">
        <span>{{ item.title }}</span>
        <strong>{{ item.value }}</strong>
      </article>
    </section>

    <section class="quick-actions-row">
      <button
        v-for="item in quickActions"
        :key="item.label"
        class="quick-action"
        type="button"
        @click="$emit(item.event)"
      >
        <span class="quick-action-icon"><CrewUiIcon :name="item.icon" :size="16" /></span>
        <strong>{{ item.label }}</strong>
      </button>
    </section>

    <div class="focus-grid">
      <article class="dashboard-shell checklist-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Preparacion operativa</p>
            <h3>Listo para volar</h3>
          </div>
          <strong class="checklist-score">{{ checklistProgress }}%</strong>
        </div>

        <div class="progress-track" aria-hidden="true">
          <span class="progress-fill" :style="{ width: `${checklistProgress}%` }"></span>
        </div>

        <div class="checklist-list">
          <article
            v-for="item in checklistItems"
            :key="item.label"
            class="checklist-item"
            :data-tone="checklistTone(item.state)"
          >
            <span class="mini-icon"><CrewUiIcon :name="checklistIcon(item.state)" :size="15" /></span>
            <strong>{{ item.label }}</strong>
          </article>
        </div>

        <button class="action-button action-button-primary" type="button" @click="$emit('start-checklist')">
          <CrewUiIcon name="checklist" :size="16" />
          Ver misiones y checklist
        </button>
      </article>

      <article class="dashboard-shell timeline-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Operacion activa</p>
            <h3>Proxima vuelo y seguimiento</h3>
          </div>
        </div>

        <div class="timeline-list">
          <article v-for="item in missionTimeline" :key="item.label" class="timeline-step" :data-done="item.done">
            <span class="timeline-dot"></span>
            <strong>{{ item.label }}</strong>
          </article>
        </div>

        <div v-if="dayOfFlightDetails.length" class="mission-detail-grid">
          <article v-for="item in dayOfFlightDetails.slice(0, 4)" :key="item.label" class="mission-detail-item">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </article>
        </div>

        <div v-if="expiringDocuments.length" class="expiry-list">
          <article v-for="item in expiringDocuments" :key="item.id" class="expiry-item" :data-tone="item.tone">
            <span>{{ item.name }}</span>
            <strong>
              {{
                item.daysRemaining == null
                  ? 'Sin fecha'
                  : item.daysRemaining < 0
                    ? 'Vencido'
                    : `${item.daysRemaining} dias`
              }}
            </strong>
          </article>
        </div>
      </article>
    </div>

    <section class="dashboard-shell control-center">
      <div class="section-head">
        <div>
          <p class="eyebrow">Centro Operativo</p>
          <h3>Alertas, coordinacion y estado de cuenta operativa</h3>
        </div>
      </div>

      <div class="control-grid">
        <article v-for="item in controlCards" :key="item.title" class="control-card" :data-tone="item.tone">
          <span class="control-icon"><CrewUiIcon :name="item.icon" :size="16" /></span>
          <div>
            <strong>{{ item.title }}</strong>
            <p class="control-value">{{ item.value }}</p>
            <small>{{ item.detail }}</small>
          </div>
        </article>
      </div>

      <div v-if="alertCards.length" class="alert-grid">
        <article v-for="item in alertCards" :key="item.id" class="alert-card" :data-tone="item.tone">
          <span>{{ item.title }}</span>
          <strong>{{ item.detail }}</strong>
        </article>
      </div>

      <div class="readiness-grid">
        <article v-for="item in readinessBreakdown" :key="item.label" class="readiness-card" :data-tone="item.tone">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </article>
      </div>
    </section>
  </section>
</template>

<style scoped>
.dashboard-page,
.operations-strip,
.header-priority-grid,
.kpi-row,
.quick-actions-row,
.focus-grid,
.checklist-list,
.timeline-list,
.mission-detail-grid,
.control-grid,
.alert-grid,
.readiness-grid,
.expiry-list {
  display: grid;
  gap: 0.85rem;
}

.mission-control-header,
.kpi-card,
.quick-action,
.checklist-card,
.timeline-card,
.control-center {
  padding: 0.95rem;
}

.dashboard-shell {
  border: 1px solid rgba(16, 22, 28, 0.08);
  border-radius: 22px;
  box-shadow: 0 18px 46px rgba(11, 18, 24, 0.07);
}

.mission-control-header {
  background:
    radial-gradient(circle at top right, rgba(212, 177, 84, 0.18), transparent 24%),
    linear-gradient(180deg, #12171d, #1a2128 55%, #10161c);
  color: #f8fafc;
}

.operations-strip {
  grid-template-columns: repeat(6, minmax(0, 1fr));
  margin-bottom: 0.9rem;
}

.strip-item,
.priority-panel,
.kpi-card,
.quick-action,
.expiry-item,
.alert-card,
.readiness-card {
  border-radius: 18px;
}

.strip-item {
  display: grid;
  gap: 0.24rem;
  padding: 0.75rem 0.82rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.strip-item span,
.ready-ring-core small,
.kpi-card span,
.mini-label,
.mission-detail-item span,
.control-card small,
.expiry-item span,
.alert-card span,
.readiness-card span {
  color: #667085;
  font-size: 0.8rem;
}

.strip-item span,
.ready-ring-core small {
  color: rgba(241, 245, 249, 0.72);
}

.strip-item strong {
  color: #ffffff;
  font-size: 0.96rem;
  line-height: 1.2;
}

.header-main,
.identity-block,
.priority-panel,
.section-head,
.control-card,
.checklist-item {
  display: grid;
  gap: 0.55rem;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
}

.mission-control-header h2,
.checklist-card h3,
.timeline-card h3,
.control-center h3 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.04em;
}

.mission-control-header h2 {
  font-size: clamp(1.5rem, 3vw, 2rem);
}

.identity-copy,
.identity-rule,
.priority-panel p,
.priority-panel small {
  margin: 0;
  color: rgba(241, 245, 249, 0.78);
}

.identity-rule {
  max-width: 46rem;
  font-size: 0.95rem;
  line-height: 1.55;
}

.header-priority-grid {
  grid-template-columns: 1.2fr 0.9fr 0.9fr;
  margin-top: 0.85rem;
}

.priority-panel {
  min-height: 6.8rem;
  padding: 0.9rem;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.priority-panel strong {
  color: #fff;
  font-size: 1.22rem;
  line-height: 1.08;
}

.ready-ring {
  --ready-score: 0;
  display: grid;
  place-items: center;
  width: 7.4rem;
  height: 7.4rem;
  margin-top: 0.2rem;
  border-radius: 999px;
  background:
    radial-gradient(circle at center, rgba(16, 22, 28, 0.88) 0 58%, transparent 59%),
    conic-gradient(#15916a calc(var(--ready-score) * 1%), rgba(255, 255, 255, 0.14) 0);
}

.ready-ring-core {
  display: grid;
  justify-items: center;
  gap: 0.12rem;
  text-align: center;
}

.ready-ring-core strong {
  font-size: 1.38rem;
}

.status-selector {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.7rem;
  margin-top: 0.85rem;
}

.status-chip {
  min-height: 2.7rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: #d9e2ec;
  font-weight: 800;
}

.status-chip[data-active='true'][data-tone='green'] {
  background: rgba(21, 145, 106, 0.18);
  color: #d1fadf;
}

.status-chip[data-active='true'][data-tone='gold'] {
  background: rgba(212, 177, 84, 0.18);
  color: #fef0c7;
}

.status-chip[data-active='true'][data-tone='slate'] {
  background: rgba(148, 163, 184, 0.16);
  color: #e2e8f0;
}

.status-chip[data-active='true'][data-tone='red'] {
  background: rgba(202, 87, 70, 0.18);
  color: #fee2e2;
}

.status-error {
  color: #fecaca;
  margin-top: 0.55rem;
}

.kpi-row,
.quick-actions-row {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.kpi-card,
.checklist-card,
.timeline-card,
.control-center,
.quick-action {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(248, 250, 252, 0.98));
}

.kpi-card {
  min-height: 4.5rem;
}

.kpi-card strong,
.checklist-score,
.control-card strong,
.quick-action strong,
.expiry-item strong,
.alert-card strong,
.readiness-card strong {
  color: #10161c;
}

.kpi-card strong {
  font-size: 1.45rem;
}

.quick-action {
  display: inline-grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 0.7rem;
  min-height: 4rem;
  padding: 0 1rem;
  border: 1px solid rgba(16, 22, 28, 0.08);
  color: #10161c;
  text-align: left;
  box-shadow: 0 14px 32px rgba(11, 18, 24, 0.06);
}

.quick-action-icon,
.control-icon,
.checklist-item .mini-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.quick-action-icon {
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 14px;
  color: #15916a;
  background: rgba(21, 145, 106, 0.1);
}

.focus-grid {
  grid-template-columns: minmax(0, 1fr) minmax(360px, 0.95fr);
}

.progress-track {
  position: relative;
  height: 0.72rem;
  border-radius: 999px;
  background: rgba(16, 22, 28, 0.08);
  overflow: hidden;
}

.progress-fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: linear-gradient(90deg, #d4b154, #15916a);
}

.action-button {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  width: fit-content;
  padding: 0.8rem 1.15rem;
  font-weight: 800;
  transition: transform 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease, border-color 0.18s ease;
}

.action-button-primary {
  border: 1px solid rgba(21, 145, 106, 0.28);
  border-radius: 16px;
  background: linear-gradient(135deg, #15916a, #0f7a5f);
  color: #f8fffc;
  box-shadow: 0 12px 26px rgba(21, 145, 106, 0.24);
}

.action-button-primary :deep(svg),
.action-button-primary svg {
  color: currentColor;
}

.action-button-primary:hover {
  transform: translateY(-1px);
  border-color: rgba(15, 122, 95, 0.9);
  box-shadow: 0 16px 30px rgba(21, 145, 106, 0.3);
  background: linear-gradient(135deg, #18a277, #0d6d55);
}

.action-button-primary:focus-visible {
  outline: 3px solid rgba(21, 145, 106, 0.18);
  outline-offset: 2px;
}

.checklist-item {
  grid-template-columns: 1.5rem 1fr;
  align-items: center;
  padding: 0.8rem;
  border-radius: 16px;
  border: 1px solid rgba(16, 22, 28, 0.08);
  background: #fff;
}

.checklist-item[data-tone='ok'] {
  border-color: rgba(21, 145, 106, 0.18);
}

.checklist-item[data-tone='warn'] {
  border-color: rgba(230, 168, 55, 0.18);
}

.checklist-item[data-tone='block'] {
  border-color: rgba(202, 87, 70, 0.2);
}

.checklist-item .mini-icon,
.control-icon {
  width: 2rem;
  height: 2rem;
  border-radius: 12px;
  background: rgba(16, 22, 28, 0.06);
  color: #10161c;
}

.timeline-step {
  display: grid;
  grid-template-columns: 1.1rem 1fr;
  align-items: center;
  gap: 0.75rem;
  color: #667085;
}

.timeline-step strong {
  color: #344054;
}

.timeline-step[data-done='true'] strong {
  color: #10161c;
}

.timeline-dot {
  width: 0.9rem;
  height: 0.9rem;
  border-radius: 999px;
  background: rgba(16, 22, 28, 0.12);
}

.timeline-step[data-done='true'] .timeline-dot {
  background: #15916a;
}

.mission-detail-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 0.5rem;
}

.mission-detail-item,
.expiry-item,
.alert-card,
.readiness-card {
  padding: 0.8rem;
  background: #fff;
  border: 1px solid rgba(16, 22, 28, 0.08);
}

.mission-detail-item {
  display: grid;
  gap: 0.28rem;
  border-radius: 16px;
}

.expiry-item[data-tone='green'],
.readiness-card[data-tone='green'],
.control-card[data-tone='green'] {
  border-color: rgba(21, 145, 106, 0.18);
}

.expiry-item[data-tone='amber'],
.alert-card[data-tone='amber'],
.readiness-card[data-tone='amber'],
.control-card[data-tone='amber'] {
  border-color: rgba(230, 168, 55, 0.2);
}

.expiry-item[data-tone='red'],
.alert-card[data-tone='red'],
.readiness-card[data-tone='red'],
.control-card[data-tone='red'] {
  border-color: rgba(202, 87, 70, 0.2);
}

.control-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.control-card {
  grid-template-columns: 2rem 1fr;
  padding: 0.9rem;
  border-radius: 18px;
  border: 1px solid rgba(16, 22, 28, 0.08);
  background: #fff;
}

.control-value {
  margin: 0.1rem 0;
  color: #10161c;
  font-weight: 800;
}

.alert-grid,
.readiness-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 0.85rem;
}

@media (max-width: 1080px) {
  .operations-strip,
  .header-priority-grid,
  .kpi-row,
  .quick-actions-row,
  .focus-grid,
  .mission-detail-grid,
  .control-grid,
  .alert-grid,
  .readiness-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .mission-control-header,
  .kpi-card,
  .quick-action,
  .checklist-card,
  .timeline-card,
  .control-center {
    padding: 0.9rem;
  }

  .section-head {
    flex-direction: column;
    align-items: stretch;
  }

  .status-selector {
    overflow-x: auto;
    grid-auto-flow: column;
    grid-auto-columns: minmax(8.75rem, 1fr);
    padding-bottom: 0.15rem;
  }

  .status-chip {
    white-space: nowrap;
  }
}
</style>
