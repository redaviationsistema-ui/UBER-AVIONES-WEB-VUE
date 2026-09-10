<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../../../../lib/api'
import { buildCrewOperationWorkflowSnapshot } from '../../../operations/utils/crewOperationWorkflow'
import { groupIncidents, incidentLabels, loadIncidentFlights } from '../../adminIncidentGroups'
import { operationProviderName } from '../services/crewOperations.service'
import CrewOperationLogbookView from '../operations/CrewOperationLogbookView.vue'
import AdminClosureEvidence from '../../AdminClosureEvidence.vue'

const props = defineProps({
  operation: { type: Object, required: true },
  crewId: { type: [String, Number], required: true },
  formatDateTime: { type: Function, required: true },
})
const route = useRoute()
const router = useRouter()
const tabs = [
  { id: 'summary', label: 'Resumen' },
  { id: 'preparation', label: 'Preparación' },
  { id: 'preflight', label: 'Pre-vuelo' },
  { id: 'tracking', label: 'Seguimiento' },
  { id: 'postflight', label: 'Post-vuelo' },
  { id: 'evidence', label: 'Evidencias' },
  { id: 'incidents', label: 'Incidencias' },
]
const activeTab = computed(() =>
  tabs.some((tab) => tab.id === route.query.tab) ? route.query.tab : 'summary',
)
const workflow = ref(null)
const reports = ref([])
const flight = ref('')
const workflowError = ref('')
const reportsError = ref('')
const flightError = ref('')
const loading = ref(false)
let request = 0
const operationId = computed(() => props.operation.operationId || props.operation.id)
const currentOperation = computed(() => ({
  ...props.operation,
  ...(workflow.value
    ? {
        canonicalWorkflow: workflow.value,
        checklists: workflow.value.checklists,
        timeline: workflow.value.timeline,
        crewStatus: workflow.value.crew_status,
      }
    : {}),
}))
const snapshot = computed(() => buildCrewOperationWorkflowSnapshot(currentOperation.value))
const counters = computed(
  () => groupIncidents(reports.value)[0] || { open: 0, inReview: 0, closed: 0 },
)
const stageSummary = computed(() => [
  ...['preparation', 'preflight'].map((id) => ({
    id,
    ...snapshot.value.checklistGroupsByType.get(id)?.summary,
  })),
  { id: 'tracking', ...snapshot.value.tracking.summary },
  { id: 'postflight', ...snapshot.value.checklistGroupsByType.get('postflight')?.summary },
])
const flightLabel = computed(
  () =>
    flight.value ||
    props.operation.raw?.flight_code ||
    props.operation.raw?.folio ||
    props.operation.raw?.code ||
    props.operation.raw?.reference ||
    'N/D',
)
const label = (value) => incidentLabels[value] || value || 'Sin dato'
const reportPath = (id) => `/admin/incidencias/${encodeURIComponent(id)}`
function changeTab(tab) {
  router.replace({
    path: route.path,
    query: { ...route.query, operationId: String(operationId.value), tab },
  })
}
async function refresh() {
  const current = ++request
  const id = String(operationId.value)
  const crewId = String(props.crewId)
  workflow.value = null
  reports.value = []
  flight.value = ''
  workflowError.value = reportsError.value = flightError.value = ''
  loading.value = true
  await Promise.allSettled([
    (async () => {
      try {
        const response = await api.get(`/admin/crew/operations/${encodeURIComponent(id)}/workflow`)
        if (current !== request) return
        if (String(response.operation_id) !== id) throw new Error('Operation mismatch')
        workflow.value = response
      } catch {
        if (current === request)
          workflowError.value =
            'No se pudo actualizar la bitácora. Se muestran los últimos datos disponibles.'
      }
    })(),
    (async () => {
      try {
        const response = await api.get(
          `/crew-operation-incidents?crew_operation_id=${encodeURIComponent(id)}&crew_id=${encodeURIComponent(crewId)}`,
        )
        if (current !== request) return
        reports.value = (response.incidents || response.data || []).filter(
          (item) => String(item.crew_operation_id) === id && String(item.crew_id) === crewId,
        )
      } catch {
        if (current === request) reportsError.value = 'No se pudieron cargar las incidencias.'
      }
    })(),
    (async () => {
      try {
        const flights = await loadIncidentFlights([{ crew_operation_id: id }])
        if (current === request)
          flight.value = flights[id]?.flight === 'N/D' ? '' : flights[id]?.flight || ''
      } catch {
        if (current === request)
          flightError.value = 'Identificador de vuelo no disponible temporalmente.'
      }
    })(),
  ])
  if (current === request) loading.value = false
}
watch([operationId, () => props.crewId], refresh, { immediate: true })
onBeforeUnmount(() => {
  request++
})
</script>

<template>
  <section class="individual-logbook">
    <header class="operation-summary">
      <slot name="operation-selector" />
      <h3>Operación #{{ operationId }}</h3>
      <dl>
        <div>
          <dt>Vuelo</dt>
          <dd>{{ flightLabel }}</dd>
        </div>
        <div>
          <dt>Fecha</dt>
          <dd>{{ formatDateTime(operation.departure) }}</dd>
        </div>
        <div>
          <dt>Ruta</dt>
          <dd>{{ snapshot.route || operation.route || 'N/D' }}</dd>
        </div>
        <div>
          <dt>Aeronave</dt>
          <dd>{{ operation.aircraft || 'N/D' }}</dd>
        </div>
        <div>
          <dt>Empresa</dt>
          <dd>{{ operationProviderName(operation) || 'N/D' }}</dd>
        </div>
        <div>
          <dt>Sobrecargo</dt>
          <dd>{{ operation.crew || 'N/D' }}</dd>
        </div>
        <div>
          <dt>Estado de operación</dt>
          <dd>{{ snapshot.operationStatusLabel }}</dd>
        </div>
      </dl>
      <p v-if="flightError" role="status">{{ flightError }}</p>
      <button type="button" :disabled="loading" @click="refresh">
        {{ loading ? 'Actualizando…' : 'Actualizar bitácora' }}
      </button>
    </header>
    <nav class="logbook-tabs" aria-label="Secciones de la bitácora">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        :aria-current="activeTab === tab.id ? 'page' : undefined"
        @click="changeTab(tab.id)"
      >
        {{ tab.label }}
      </button>
    </nav>
    <p v-if="workflowError" role="alert">{{ workflowError }}</p>
    <section v-if="activeTab === 'summary'" class="summary-view" aria-label="Resumen">
      <article v-for="stage in stageSummary" :key="stage.id">
        <h4>{{ tabs.find((tab) => tab.id === stage.id)?.label }}</h4>
        <strong>{{ stage.resolved || 0 }}/{{ stage.total || 0 }}</strong>
        <p>{{ !stage.total ? 'Sin datos' : stage.isComplete ? 'Completado' : 'Pendiente' }}</p>
      </article>
      <AdminClosureEvidence :operation-id="operationId" compact />
      <article>
        <h4>Incidencias</h4>
        <p v-if="reportsError" role="alert">{{ reportsError }}</p>
        <strong v-else>{{ loading ? 'Cargando…' : reports.length }}</strong>
      </article>
    </section>
    <CrewOperationLogbookView
      v-else-if="['preparation', 'preflight', 'tracking', 'postflight'].includes(activeTab)"
      :key="`${operationId}-${activeTab}`"
      :operation="currentOperation"
      :stage="activeTab"
      :format-date-time="formatDateTime"
    />
    <section v-else-if="activeTab === 'evidence'">
      <h3>Evidencias de la operación #{{ operationId }}</h3>
      <AdminClosureEvidence :operation-id="operationId" />
    </section>
    <section v-else class="incidents-view">
      <h3>Incidencias de la operación #{{ operationId }}</h3>
      <p v-if="reportsError" role="alert">{{ reportsError }}</p>
      <p v-else-if="loading" role="status">Cargando incidencias…</p>
      <template v-else>
        <p>
          Total: {{ reports.length }} · Abiertas: {{ counters.open }} · En revisión:
          {{ counters.inReview }} · Cerradas: {{ counters.closed }}
        </p>
        <article v-for="report in reports" :key="report.id" class="report-card">
          <h4>Reporte #{{ report.id }}</h4>
          <p>
            Categoría: {{ label(report.category) }} · Prioridad: {{ label(report.priority) }} ·
            Estado: {{ label(report.status) }}
          </p>
          <p>{{ report.description }}</p>
          <div class="report-links">
            <RouterLink :to="reportPath(report.id)">Ver reporte</RouterLink
            ><RouterLink :to="`${reportPath(report.id)}/evidencias`">Evidencias</RouterLink>
          </div>
        </article>
        <p v-if="!reports.length">Sin incidencias para esta operación y sobrecargo.</p>
      </template>
    </section>
  </section>
</template>

<style scoped>
.individual-logbook {
  display: grid;
  gap: 1rem;
  min-width: 0;
}
.operation-summary,
.summary-view > article,
.report-card {
  border: 1px solid #c9d6ec;
  border-radius: 18px;
  padding: 1rem;
  background: #fff;
}
h3,
h4 {
  margin: 0 0 0.65rem;
}
dl,
.summary-view {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}
dt {
  color: #647a9b;
  font-size: 0.8rem;
}
dd {
  margin: 0.3rem 0 0;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.logbook-tabs,
.report-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
button,
.report-links a {
  padding: 0.65rem 0.85rem;
  border: 1px solid #c9d6ec;
  border-radius: 12px;
  background: #fff;
  color: #173b65;
  cursor: pointer;
  font: inherit;
  text-decoration: none;
}
button[aria-current='page'],
.report-links a:first-child {
  background: #173b65;
  color: white;
}
button:disabled {
  opacity: 0.6;
  cursor: wait;
}
.incidents-view {
  display: grid;
  gap: 0.75rem;
}
@media (max-width: 720px) {
  dl,
  .summary-view {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
