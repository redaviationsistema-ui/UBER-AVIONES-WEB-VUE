<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { api } from '../../../../lib/api'
import { normalizeApiError } from '../../../../lib/apiError'
import CrewOperationsAuditLog from './CrewOperationsAuditLog.vue'
import CrewOperationDetailDrawer from './CrewOperationDetailDrawer.vue'
import CrewOperationsFilters from './CrewOperationsFilters.vue'
import CrewOperationsTable from './CrewOperationsTable.vue'
import { useCrewOperations } from '../composables/useCrewOperations'

const props = defineProps({
  crewMembers: { type: Array, required: true },
  operations: { type: Array, required: true },
  auditEntries: { type: Array, required: true },
})

const emit = defineEmits(['assign-crew'])

const controller = reactive(useCrewOperations(props, { viewMode: 'operations' }))
const metricsPeriod = ref('month')
const metricsLoading = ref(false)
const metricsError = ref('')
const operationalMetrics = ref(null)
const assignmentSuccessMessage = ref('')

async function loadMetrics() {
  metricsLoading.value = true
  metricsError.value = ''
  try {
    const response = await api.get('/admin/crew/metrics', { query: { period: metricsPeriod.value } })
    operationalMetrics.value = response.metrics || response.data?.metrics || null
  } catch (error) {
    operationalMetrics.value = null
    metricsError.value = normalizeApiError(error).message
  } finally {
    metricsLoading.value = false
  }
}

function rateLabel(rate) {
  return rate?.percentage == null ? 'Sin datos' : `${rate.percentage}%`
}

onMounted(loadMetrics)

function formatDateTime(value) {
  if (!value) return 'Por definir'
  const normalized = String(value).includes('T') ? String(value) : `${value}T08:00`
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return String(value)

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function operationStatusLabel(operation = {}) {
  return operation.workflowStatus || operation.status || 'Pendiente'
}

function operationCrewStateLabel(operation = {}) {
  return (
    operation.crewOperationalState ||
    (String(operation.crew || operation.crewId || '').trim() ? 'Asignada' : 'Pendiente')
  )
}

function auditEntrySummary(entry = {}) {
  const detail = String(entry.detail || '').trim()
  const segments = detail.split('·').map((segment) => segment.trim()).filter(Boolean)

  return {
    headline: segments[0] || detail || 'Movimiento operativo',
    meta: segments.slice(1),
  }
}

function auditEntryTone(entry = {}) {
  const normalized = String(`${entry.title || ''} ${entry.detail || ''}`).toLowerCase()
  if (normalized.includes('rechaz')) return 'chip-danger'
  if (normalized.includes('confirm')) return 'chip-success'
  if (normalized.includes('cambio') || normalized.includes('revision')) return 'chip-warning'
  return 'chip-info'
}

async function handleAssign(operationId) {
  const operation = controller.filteredOperations.find((item) => Number(item.id || 0) === Number(operationId || 0))
  if (!operation) return

  const error = controller.validateAssignmentDraft(operation)
  controller.assignmentErrors[operationId] = error
  assignmentSuccessMessage.value = ''
  if (error) return

  const payload = controller.assignmentPayloadFor(operation)
  if (!payload) return

  emit('assign-crew', {
    operationId,
    crewId: Number(payload.sobrecargo_user_id || 0),
    presentationTime: payload.presentation_time || '',
    presentationPlace: payload.presentation_place || '',
    presentationPlaceType: controller.getDraft(operationId).presentationPlaceType,
    presentationPlaceDetail: controller.getDraft(operationId).presentationPlaceDetail,
    note: controller.getDraft(operationId).note || '',
    onSuccess: ({ title, message } = {}) => {
      controller.clearAssignmentError(operationId)
      assignmentSuccessMessage.value = message || title || 'Sobrecargo listo.'
      controller.updateOperationLocalState(operationId, {
        crew: controller.selectedDraftCrew(operation)?.name || operation.crew,
        crewId: payload.sobrecargo_user_id,
        crewOperationalState: 'pending_crew_response',
        briefingTime: payload.presentation_time || '',
        presentationPlace: payload.presentation_place || '',
      })
      return { title, message }
    },
    onError: ({ message } = {}) => {
      controller.assignmentErrors[operationId] = message || 'No fue posible completar la asignacion.'
    },
  })
}

const selectedDraft = computed(() =>
  controller.selectedOperation ? controller.getDraft(controller.selectedOperation.id) : null,
)
</script>

<template>
  <section class="crew-workspace">
    <header class="section-head workspace-head">
      <div>
        <p class="eyebrow">Centro de despacho</p>
        <h3>Operaciones de sobrecargos</h3>
        <p class="muted">Vuelos futuros y programados, asignacion, reasignacion y bitacora en una sola mesa operativa.</p>
      </div>
    </header>

    <section class="status-strip">
      <article v-for="item in controller.summaryCards" :key="item.label" class="signal-card">
        <div class="signal-card__icon" aria-hidden="true">{{ item.label.slice(0, 1) }}</div>
        <div class="signal-card__body">
          <strong>{{ item.value }}</strong>
          <span>{{ item.label }}</span>
          <p>{{ item.detail }}</p>
        </div>
      </article>
    </section>

    <section class="crew-metrics-panel" aria-labelledby="crew-metrics-title">
      <header>
        <div><h4 id="crew-metrics-title">Métricas operativas</h4><p>Datos persistentes · America/Mexico_City</p></div>
        <label>Periodo
          <select v-model="metricsPeriod" @change="loadMetrics"><option value="today">Hoy</option><option value="week">Semana</option><option value="month">Mes</option></select>
        </label>
      </header>
      <p v-if="metricsLoading" aria-live="polite">Cargando métricas…</p>
      <div v-else-if="metricsError" role="alert"><p>{{ metricsError }}</p><button type="button" @click="loadMetrics">Reintentar</button></div>
      <div v-else-if="operationalMetrics" class="crew-metrics-grid">
        <article><span>Tasa de aceptación</span><strong>{{ rateLabel(operationalMetrics.response?.acceptance_rate) }}</strong><small>{{ operationalMetrics.response?.acceptance_rate?.numerator }} de {{ operationalMetrics.response?.acceptance_rate?.denominator }} respuestas</small></article>
        <article><span>Puntualidad</span><strong>{{ rateLabel(operationalMetrics.punctuality?.rate) }}</strong><small>{{ operationalMetrics.punctuality?.rate?.numerator }} de {{ operationalMetrics.punctuality?.rate?.denominator }} check-ins</small></article>
        <article><span>Asignaciones pendientes</span><strong>{{ operationalMetrics.assignments?.pending ?? 0 }}</strong><small>{{ operationalMetrics.assignments?.created ?? 0 }} creadas</small></article>
        <article><span>Incidencias abiertas</span><strong>{{ operationalMetrics.incidents?.open ?? 0 }}</strong><small>{{ operationalMetrics.incidents?.critical ?? 0 }} críticas</small></article>
      </div>
      <p v-else class="muted">Sin datos para el periodo.</p>
    </section>

    <CrewOperationsFilters
      :search-term="controller.searchTerm"
      :operation-status-filter="controller.operationStatusFilter"
      :assignment-filter="controller.assignmentFilter"
      :base-filter="controller.baseFilter"
      :provider-filter="controller.providerFilter"
      :status-options="controller.statusOptions"
      :base-options="controller.baseOptions"
      :provider-options="controller.providerOptions"
      @update:search-term="controller.searchTerm = $event"
      @update:operation-status-filter="controller.operationStatusFilter = $event"
      @update:assignment-filter="controller.assignmentFilter = $event"
      @update:base-filter="controller.baseFilter = $event"
      @update:provider-filter="controller.providerFilter = $event"
    />

    <div class="tabs-strip" role="tablist" aria-label="Operaciones de sobrecargos">
      <button
        type="button"
        class="tab-button"
        :class="{ 'tab-button--active': controller.activeTab === 'operations' }"
        @click="controller.activeTab = 'operations'"
      >
        <span>Vuelos</span>
        <strong>{{ controller.filteredOperations.length }}</strong>
      </button>
      <button
        type="button"
        class="tab-button"
        :class="{ 'tab-button--active': controller.activeTab === 'audit' }"
        @click="controller.activeTab = 'audit'"
      >
        <span>Bitacora</span>
        <strong>{{ controller.auditQueue.length }}</strong>
      </button>
    </div>

    <div class="workspace-grid" :class="{ 'workspace-grid--assigned': controller.activeTab === 'operations' && controller.selectedOperation }">
      <CrewOperationsTable
        v-if="controller.activeTab === 'operations'"
        :operations="controller.filteredOperations"
        :selected-operation-id="controller.selectedOperation?.id || null"
        :operation-display-client="controller.operationDisplayClient"
        :operation-display-crew="controller.operationDisplayCrew"
        :operation-display-state="(operation) => controller.operationDisplayState(operation, controller.linkedCrewForOperation(operation))"
        :format-date-time="formatDateTime"
        @select="controller.selectedOperationId = $event"
        @open-detail="controller.selectedOperationId = $event"
      />

      <CrewOperationsAuditLog
        v-else
        :entries="controller.auditQueue"
        :selected-audit-id="controller.selectedAuditEntry?.id || null"
        :audit-entry-tone="auditEntryTone"
        :audit-entry-summary="auditEntrySummary"
        @select="controller.selectedAuditId = $event"
      />

      <CrewOperationDetailDrawer
        v-if="controller.activeTab === 'operations' && controller.selectedOperation"
        :operation="controller.selectedOperation"
        :draft="selectedDraft"
        :assignable-crew="controller.assignableCrewMembers(controller.selectedOperation)"
        :selected-crew-member="controller.selectedDraftCrew(controller.selectedOperation)"
        :assignment-error="controller.assignmentErrors[controller.selectedOperation.id] || ''"
        :can-assign="controller.canAssignCrew(controller.selectedOperation)"
        :is-closed="controller.isOperationClosed(controller.selectedOperation)"
        :loading-available-crew="controller.isLoadingAvailableCrewForOperation(controller.selectedOperation)"
        :format-date-time="formatDateTime"
        :operation-incident-label="controller.operationIncidentLabel"
        :humanize-status="controller.humanizeStatus"
        :tone-class="controller.toneClass"
        :operation-status-label="operationStatusLabel"
        :operation-crew-state-label="operationCrewStateLabel"
        :assignment-success-message="assignmentSuccessMessage"
        @update-draft="(operationId, key, value) => controller.updateDraft(operationId, key, value)"
        @assign="handleAssign"
        @load-available="controller.ensureAvailableCrewForOperation(controller.selectedOperation)"
      />
    </div>
  </section>
</template>

<style scoped>
.crew-workspace {
  display: grid;
  gap: 0.85rem;
  --crew-primary: #1e4ed8;
  --crew-ink: #000000;
  --crew-muted: #000000;
  --crew-border: rgba(155, 176, 212, 0.24);
  --crew-shadow: 0 18px 40px rgba(17, 34, 68, 0.08);
  color: #000000;
}

.crew-workspace :deep(*),
.crew-workspace :deep(input),
.crew-workspace :deep(select),
.crew-workspace :deep(textarea),
.crew-workspace :deep(option),
.crew-workspace :deep(button),
.crew-workspace :deep(label),
.crew-workspace :deep(span),
.crew-workspace :deep(small),
.crew-workspace :deep(strong),
.crew-workspace :deep(h3),
.crew-workspace :deep(h4),
.crew-workspace :deep(p),
.crew-workspace :deep(td),
.crew-workspace :deep(th) {
  color: #000000;
}

.crew-workspace :deep(input::placeholder),
.crew-workspace :deep(textarea::placeholder) {
  color: #000000;
  opacity: 1;
}

.workspace-head {
  padding: 0.15rem 0 0.1rem;
}

.workspace-head .eyebrow {
  margin: 0 0 0.22rem;
  font-size: 0.74rem;
  letter-spacing: 0.1em;
}

.workspace-head h3 {
  margin: 0;
  font-size: clamp(1.55rem, 2vw, 2rem);
  line-height: 1.05;
  color: var(--crew-ink);
}

.workspace-head .muted {
  margin: 0.3rem 0 0;
  max-width: 52rem;
  font-size: 0.94rem;
  line-height: 1.45;
  color: var(--crew-muted);
}

.status-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.8rem;
}
.crew-metrics-panel{display:grid;gap:.8rem;padding:1rem;border:1px solid var(--crew-border);border-radius:18px;background:#fff}.crew-metrics-panel header{display:flex;justify-content:space-between;align-items:flex-end;gap:1rem}.crew-metrics-panel h4,.crew-metrics-panel p{margin:0}.crew-metrics-panel label{display:grid;gap:.25rem;font-weight:700}.crew-metrics-panel select,.crew-metrics-panel button{min-height:44px}.crew-metrics-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem}.crew-metrics-grid article{display:grid;gap:.3rem;padding:.85rem;border-radius:14px;background:#f8fafc}.crew-metrics-grid strong{font-size:1.4rem}.crew-metrics-grid small{color:var(--crew-muted)}@media(max-width:768px){.crew-metrics-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:390px){.crew-metrics-panel header{align-items:stretch;flex-direction:column}.crew-metrics-grid{grid-template-columns:1fr}}

.signal-card {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr);
  align-items: center;
  gap: 0.85rem;
  min-height: 90px;
  padding: 0.95rem 1rem;
  border-radius: 18px;
  border: 1px solid var(--crew-border);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 251, 255, 0.96));
  box-shadow: var(--crew-shadow);
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.signal-card:hover {
  transform: translateY(-2px);
  border-color: rgba(30, 78, 216, 0.26);
  box-shadow: 0 22px 44px rgba(17, 34, 68, 0.12);
}

.signal-card__icon {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(30, 78, 216, 0.12), rgba(212, 175, 55, 0.16));
  color: var(--crew-primary);
  font-size: 1.05rem;
  font-weight: 800;
}

.signal-card__body {
  display: grid;
  gap: 0.12rem;
}

.signal-card__body strong {
  font-size: 1.55rem;
  line-height: 1;
  color: var(--crew-ink);
}

.signal-card__body span {
  font-size: 0.9rem;
  font-weight: 700;
  color: #46628d;
}

.signal-card__body p {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.3;
  color: var(--crew-muted);
}

.tabs-strip {
  display: flex;
  gap: 0.55rem;
  padding: 0.25rem;
  width: fit-content;
  border-radius: 999px;
  background: rgba(231, 238, 249, 0.84);
}

.tab-button {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.7rem 0.95rem;
  border-radius: 999px;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  font-weight: 700;
  color: #57709d;
  transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
}

.tab-button:hover {
  transform: translateY(-1px);
  color: var(--crew-ink);
}

.tab-button--active {
  background: #fff;
  color: var(--crew-ink);
  border-color: rgba(30, 78, 216, 0.14);
  box-shadow: 0 10px 20px rgba(16, 35, 61, 0.08);
}

.tab-button strong {
  display: inline-grid;
  place-items: center;
  min-width: 1.65rem;
  height: 1.65rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: rgba(30, 78, 216, 0.1);
  color: var(--crew-primary);
  font-size: 0.78rem;
}

.tab-button:focus-visible {
  outline: 3px solid rgba(30, 78, 216, 0.22);
  outline-offset: 2px;
}

.workspace-grid {
  display: grid;
  gap: 0.9rem;
  grid-template-columns: minmax(0, 1.45fr) minmax(360px, 0.72fr);
}

.workspace-grid--assigned {
  align-items: start;
}

@media (max-width: 1100px) {
  .workspace-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 960px) {
  .status-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .status-strip {
    grid-template-columns: 1fr;
  }

  .tabs-strip {
    width: 100%;
    justify-content: stretch;
  }

  .tab-button {
    flex: 1 1 0;
    justify-content: center;
  }
}
</style>
