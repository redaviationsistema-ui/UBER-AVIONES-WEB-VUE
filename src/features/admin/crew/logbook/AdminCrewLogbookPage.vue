<script setup>
import { computed, reactive, ref, watch } from 'vue'
import CrewOperationLogbookView from '../operations/CrewOperationLogbookView.vue'
import { buildCrewOperationWorkflowSnapshot } from '../../../operations/utils/crewOperationWorkflow'
import { ACTIVE_FLIGHT_STATUSES, resolveOperationFlightStatus } from '../constants/flightStatuses'
import {
  hasCrewAssignmentRecord,
  operationFlightBase,
  operationProviderName,
  summarizePersonName,
} from '../services/crewOperations.service'
import { humanizeStatus, normalizeOperationalState, normalizeToken, toneClass } from '../../crew-directory/crewDirectoryShared'

const props = defineProps({
  crewMembers: { type: Array, required: true },
  operations: { type: Array, required: true },
  auditEntries: { type: Array, required: true },
})

const filters = reactive({
  searchTerm: '',
  status: 'all',
  base: 'all',
  operationMode: 'all',
  incidents: 'all',
  dateFrom: '',
  dateTo: '',
})

const selection = reactive({
  crewId: null,
  operationId: null,
})

const operationsVisibleCount = ref(8)
const allowAutoSelect = ref(true)

function formatDate(value, options = {}) {
  if (!value) return '—'
  const normalized = String(value).includes('T') ? String(value) : `${value}T08:00`
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return String(value)

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...options,
  }).format(date)
}

function formatDateTime(value) {
  return formatDate(value, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRelativeActivity(value) {
  if (!value) return '—'
  const normalized = String(value).includes('T') ? String(value) : `${value}T08:00`
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return formatDate(value)

  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000))
  if (diffMinutes < 1) return 'Hace unos segundos'
  if (diffMinutes < 60) return `Hace ${diffMinutes} min`

  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `Hace ${diffHours} h`

  return formatDate(value)
}

function resolveOperationDate(operation = {}) {
  return (
    operation.arrival ||
    operation.departure ||
    operation.updatedAt ||
    operation.createdAt ||
    operation.raw?.updated_at ||
    operation.raw?.created_at ||
    ''
  )
}

function normalizeChecklistState(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (['completed', 'correcto', 'ok', 'done', 'completado'].includes(normalized)) return 'completed'
  if (['not_applicable', 'not applicable', 'na', 'no aplica'].includes(normalized)) return 'not_applicable'
  if (['failed', 'issue', 'falla', 'falla reportada'].includes(normalized)) return 'failed'
  return 'pending'
}

function normalizeCrewKey(member = {}) {
  const id = String(member.id || '').trim()
  if (id) return `id:${id}`
  return `name:${normalizeToken(member.name || '')}`
}

function operationCrewKey(operation = {}) {
  const crewId = String(operation.crewId || operation.crew_id || '').trim()
  if (crewId) return `id:${crewId}`
  return `name:${normalizeToken(operation.crew || '')}`
}

function operationChecklistSummary(operation = {}) {
  const snapshot = buildCrewOperationWorkflowSnapshot(operation)
  const items = snapshot.checklistGroups.flatMap((group) => group.items || [])
  const resolved = items.filter((item) => normalizeChecklistState(item?.status) !== 'pending').length
  const pending = items.filter((item) => normalizeChecklistState(item?.status) === 'pending').length

  return {
    total: items.length,
    resolved,
    pending,
  }
}

function isActiveOperation(operation = {}) {
  return ACTIVE_FLIGHT_STATUSES.includes(resolveOperationFlightStatus(operation))
}

function matchesDateRange(operation = {}) {
  const dateValue = String(resolveOperationDate(operation) || '').slice(0, 10)
  if (!filters.dateFrom && !filters.dateTo) return true
  if (!dateValue) return false
  if (filters.dateFrom && dateValue < filters.dateFrom) return false
  if (filters.dateTo && dateValue > filters.dateTo) return false
  return true
}

function chipLabelForMemberState(value = '') {
  const normalized = normalizeToken(normalizeOperationalState(value) || value)
  if (normalized.includes('en vuelo') || normalized.includes('tracking') || normalized.includes('operacion')) return 'En operación'
  if (normalized.includes('descanso')) return 'Descanso'
  if (normalized.includes('no disponible') || normalized.includes('suspend')) return 'No disponible'
  if (normalized.includes('disponible')) return 'Disponible'
  return humanizeStatus(value || 'Disponible')
}

function operationStatusChip(operation = {}) {
  const snapshot = buildCrewOperationWorkflowSnapshot(operation)
  if (snapshot.workflow?.steps?.every((step) => step.complete)) {
    return { label: snapshot.operationStatusLabel || 'Completada', tone: 'chip-success' }
  }
  if (snapshot.assignmentStatus === 'cancelled' || normalizeToken(operation.status || operation.workflowStatus || '').includes('cancel')) {
    return { label: 'Cancelada', tone: 'chip-danger' }
  }
  if (Number(operation.incidentsCount || 0) > 0) return { label: 'Con incidencia', tone: 'chip-danger' }
  if (snapshot.workflow?.currentId && snapshot.workflow.currentId !== 'validation') {
    return { label: snapshot.operationStatusLabel || 'En operación', tone: 'chip-warning' }
  }
  return {
    label: snapshot.operationStatusLabel || humanizeStatus(operation.status || operation.workflowStatus || 'Programada'),
    tone: snapshot.assignmentStatus === 'confirmed' ? 'chip-warning' : 'chip-neutral',
  }
}

const operationsSorted = computed(() =>
  [...props.operations].sort((left, right) =>
    String(resolveOperationDate(right) || '').localeCompare(String(resolveOperationDate(left) || '')),
  ),
)

const operationsByCrewKey = computed(() => {
  const map = new Map()
  operationsSorted.value.forEach((operation) => {
    if (!hasCrewAssignmentRecord(operation) && !String(operation.crew || '').trim()) return
    const key = operationCrewKey(operation)
    if (!key || key.endsWith(':')) return
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(operation)
  })
  return map
})

const baseOptions = computed(() => [
  'all',
  ...new Set(
    [
      ...props.crewMembers.map((member) => String(member.base || '').trim()),
      ...props.operations.map((operation) => operationFlightBase(operation)),
    ].filter(Boolean),
  ),
])

const crewRows = computed(() => {
  const rows = props.crewMembers.map((member) => {
    const operations = operationsByCrewKey.value.get(normalizeCrewKey(member)) || []
    const activeOperation = operations.find((operation) => isActiveOperation(operation)) || null
    const latestOperation = operations[0] || null
    const checklistMetrics = operations.reduce(
      (acc, operation) => {
        const summary = operationChecklistSummary(operation)
        acc.total += summary.total
        acc.resolved += summary.resolved
        acc.pending += summary.pending
        return acc
      },
      { total: 0, resolved: 0, pending: 0 },
    )
    const currentState = activeOperation
      ? 'En operación'
      : chipLabelForMemberState(member.state || member.operationalState || latestOperation?.status || 'Disponible')
    const latestSnapshot = latestOperation ? buildCrewOperationWorkflowSnapshot(latestOperation) : null
    const activeSnapshot = activeOperation ? buildCrewOperationWorkflowSnapshot(activeOperation) : null

    return {
      ...member,
      key: normalizeCrewKey(member),
      displayName: String(member.name || 'Sobrecargo sin nombre').trim(),
      shortName: summarizePersonName(member.name || '', 'Sin asignar'),
      base: String(member.base || operationFlightBase(activeOperation || latestOperation || {}) || '—').trim() || '—',
      currentState,
      currentFlightLabel:
        activeSnapshot?.route ||
        activeOperation?.route ||
        latestSnapshot?.route ||
        latestOperation?.route ||
        '—',
      lastActivity: latestSnapshot?.latestActivityAt || (latestOperation ? resolveOperationDate(latestOperation) : member.updatedAt || member.createdAt || ''),
      operations,
      operationsCount: operations.length,
      activeCount: operations.filter((operation) => isActiveOperation(operation)).length,
      incidentsCount: operations.reduce((sum, operation) => sum + Number(operation.incidentsCount || 0), 0),
      checklistPending: checklistMetrics.pending,
    }
  })

  operationsByCrewKey.value.forEach((operations, key) => {
    if (rows.some((member) => member.key === key)) return
    const latestOperation = operations[0] || null
    const activeOperation = operations.find((operation) => isActiveOperation(operation)) || null
    const crewName = String(activeOperation?.crew || latestOperation?.crew || 'Sobrecargo asignado').trim()
    const latestSnapshot = latestOperation ? buildCrewOperationWorkflowSnapshot(latestOperation) : null
    const activeSnapshot = activeOperation ? buildCrewOperationWorkflowSnapshot(activeOperation) : null

    rows.push({
      id: key,
      key,
      displayName: crewName,
      shortName: summarizePersonName(crewName, 'Sin asignar'),
      base: operationFlightBase(activeOperation || latestOperation || {}) || '—',
      currentState: activeOperation ? 'En operación' : 'Con historial',
      currentFlightLabel:
        activeSnapshot?.route ||
        activeOperation?.route ||
        latestSnapshot?.route ||
        latestOperation?.route ||
        '—',
      lastActivity: latestSnapshot?.latestActivityAt || (latestOperation ? resolveOperationDate(latestOperation) : ''),
      operations,
      operationsCount: operations.length,
      activeCount: operations.filter((operation) => isActiveOperation(operation)).length,
      incidentsCount: operations.reduce((sum, operation) => sum + Number(operation.incidentsCount || 0), 0),
      checklistPending: operations.reduce((sum, operation) => sum + operationChecklistSummary(operation).pending, 0),
    })
  })

  return rows.sort((left, right) => {
    const leftActive = left.activeCount > 0 ? 0 : 1
    const rightActive = right.activeCount > 0 ? 0 : 1
    if (leftActive !== rightActive) return leftActive - rightActive
    return String(left.displayName || '').localeCompare(String(right.displayName || ''))
  })
})

const statusOptions = computed(() => [
  { value: 'all', label: 'Todos' },
  ...Array.from(new Set(crewRows.value.map((member) => member.currentState).filter(Boolean))).map((value) => ({
    value,
    label: value,
  })),
])

const filteredCrewRows = computed(() => {
  const query = normalizeToken(filters.searchTerm)

  return crewRows.value.filter((member) => {
    const visibleOperations = member.operations.filter((operation) => matchesDateRange(operation))
    const hasActiveOperation = visibleOperations.some((operation) => isActiveOperation(operation))
    const incidentsCount = visibleOperations.reduce((sum, operation) => sum + Number(operation.incidentsCount || 0), 0)

    if (query) {
      const haystack = normalizeToken([
        member.displayName,
        member.base,
        member.currentState,
        ...visibleOperations.map((operation) => [
          operation.id,
          operation.folio,
          operation.route,
          operation.aircraft,
          operationProviderName(operation),
        ].join(' ')),
      ].join(' '))

      if (!haystack.includes(query)) return false
    }

    if (filters.status !== 'all' && member.currentState !== filters.status) return false
    if (filters.base !== 'all' && member.base !== filters.base) return false
    if (filters.operationMode === 'active' && !hasActiveOperation) return false
    if (filters.operationMode === 'inactive' && hasActiveOperation) return false
    if (filters.incidents === 'with' && incidentsCount <= 0) return false
    if (filters.incidents === 'without' && incidentsCount > 0) return false
    if ((filters.dateFrom || filters.dateTo) && !visibleOperations.length) return false

    return true
  })
})

const selectedCrew = computed(() => {
  const rows = filteredCrewRows.value
  return rows.find((member) => member.key === selection.crewId) || null
})

const selectedCrewOperations = computed(() => {
  if (!selectedCrew.value) return []

  return selectedCrew.value.operations
    .filter((operation) => matchesDateRange(operation))
    .map((operation) => {
      const summary = operationChecklistSummary(operation)
      const statusChip = operationStatusChip(operation)
      const snapshot = buildCrewOperationWorkflowSnapshot(operation)
      return {
        ...operation,
        route: snapshot.route || operation.route,
        folio: snapshot.folio || operation.folio,
        latestActivityAt: snapshot.latestActivityAt,
        checklist: summary,
        statusChip,
        isActive: isActiveOperation(operation),
      }
    })
    .sort((left, right) => {
      const leftActive = left.isActive ? 0 : 1
      const rightActive = right.isActive ? 0 : 1
      if (leftActive !== rightActive) return leftActive - rightActive
      return String(resolveOperationDate(right) || '').localeCompare(String(resolveOperationDate(left) || ''))
    })
})

const visibleOperations = computed(() => selectedCrewOperations.value.slice(0, operationsVisibleCount.value))

const selectedOperation = computed(() =>
  selectedCrewOperations.value.find((operation) => String(operation.id) === String(selection.operationId)) || null,
)

const summaryCards = computed(() => {
  const visibleOperations = filteredCrewRows.value.flatMap((member) => member.operations.filter((operation) => matchesDateRange(operation)))
  return [
    {
      label: 'Sobrecargos visibles',
      value: filteredCrewRows.value.length,
      detail: 'Con filtros aplicados.',
    },
    {
      label: 'En operación',
      value: filteredCrewRows.value.filter((member) => member.activeCount > 0).length,
      detail: 'Sobrecargos con vuelo activo.',
    },
    {
      label: 'Checklist pendientes',
      value: visibleOperations.reduce((sum, operation) => sum + operationChecklistSummary(operation).pending, 0),
      detail: 'Items pendientes visibles.',
    },
    {
      label: 'Incidencias abiertas',
      value: visibleOperations.reduce((sum, operation) => sum + Number(operation.incidentsCount || 0), 0),
      detail: 'Incidencias reportadas.',
    },
  ]
})

function selectCrew(crewKey) {
  selection.crewId = crewKey
  selection.operationId = null
  operationsVisibleCount.value = 8
}

function selectOperation(operationId) {
  selection.operationId = operationId
}

function clearSelection() {
  allowAutoSelect.value = false
  selection.crewId = null
  selection.operationId = null
  operationsVisibleCount.value = 8
}

watch(
  filteredCrewRows,
  (rows) => {
    if (!rows.length) {
      selection.crewId = null
      selection.operationId = null
      return
    }

    if (!selection.crewId && allowAutoSelect.value) {
      selection.crewId = rows[0].key
      return
    }

    if (selection.crewId && !rows.some((member) => member.key === selection.crewId)) {
      selection.crewId = null
      selection.operationId = null
    }
  },
  { immediate: true },
)

watch(
  selectedCrewOperations,
  (operations) => {
    if (!selection.crewId) {
      selection.operationId = null
      return
    }

    if (!operations.length) {
      selection.operationId = null
      return
    }

    if (!operations.some((operation) => String(operation.id) === String(selection.operationId))) {
      selection.operationId = operations[0].id
    }
  },
  { immediate: true },
)
</script>

<template>
  <section class="crew-logbook-page">
    <header class="page-head">
      <div>
        <p class="eyebrow">Sobrecargos</p>
        <h2>Bitácora de Sobrecargos</h2>
        <p>Consulta el avance operativo, checklist, seguimiento, evidencias e incidencias de cada sobrecargo por operación.</p>
      </div>
    </header>

    <section class="kpi-strip">
      <article v-for="card in summaryCards" :key="card.label" class="kpi-card">
        <span>{{ card.label }}</span>
        <strong>{{ card.value }}</strong>
        <small>{{ card.detail }}</small>
      </article>
    </section>

    <section class="filters-bar">
      <label class="filter filter--search">
        <span>Buscar</span>
        <input
          v-model="filters.searchTerm"
          type="text"
          placeholder="Nombre, ruta, matrícula o aeronave"
          aria-label="Buscar nombre, ruta, matrícula o aeronave"
        />
      </label>

      <label class="filter">
        <span>Estado</span>
        <select v-model="filters.status">
          <option v-for="option in statusOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>

      <label class="filter">
        <span>Base</span>
        <select v-model="filters.base">
          <option value="all">Todas</option>
          <option v-for="base in baseOptions.slice(1)" :key="base" :value="base">{{ base }}</option>
        </select>
      </label>

      <label class="filter">
        <span>Operación</span>
        <select v-model="filters.operationMode">
          <option value="all">Todas</option>
          <option value="active">Con operación activa</option>
          <option value="inactive">Sin operación activa</option>
        </select>
      </label>

      <label class="filter">
        <span>Incidencias</span>
        <select v-model="filters.incidents">
          <option value="all">Todas</option>
          <option value="with">Con incidencias</option>
          <option value="without">Sin incidencias</option>
        </select>
      </label>

      <label class="filter">
        <span>Desde</span>
        <input v-model="filters.dateFrom" type="date" />
      </label>

      <label class="filter">
        <span>Hasta</span>
        <input v-model="filters.dateTo" type="date" />
      </label>
    </section>

    <section class="crew-table-card">
      <div class="section-head">
        <div>
          <p class="eyebrow">Sobrecargos</p>
          <h3>Consulta general</h3>
        </div>
        <span class="badge">{{ filteredCrewRows.length }}</span>
      </div>

      <div class="table-wrap">
        <table class="crew-table">
          <thead>
            <tr>
              <th>Sobrecargo</th>
              <th>Base</th>
              <th>Estado</th>
              <th>Vuelo actual</th>
              <th>Última actividad</th>
              <th>Pendientes</th>
              <th>Incidencias</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="member in filteredCrewRows"
              :key="member.key"
              :class="{ 'is-selected': selectedCrew?.key === member.key }"
            >
              <td>
                <div class="cell-primary">
                  <strong>{{ member.displayName }}</strong>
                </div>
              </td>
              <td>{{ member.base }}</td>
              <td>
                <span class="chip" :class="toneClass(member.currentState)">{{ member.currentState }}</span>
              </td>
              <td>{{ member.currentFlightLabel }}</td>
              <td>{{ formatRelativeActivity(member.lastActivity) }}</td>
              <td>{{ member.checklistPending }}</td>
              <td>{{ member.incidentsCount }}</td>
              <td>
                <button type="button" class="action-link" @click="selectCrew(member.key)">
                  {{ member.operationsCount ? 'Ver bitácora' : 'Ver historial' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p v-if="!filteredCrewRows.length" class="empty-state">No hay sobrecargos visibles con los filtros actuales.</p>
    </section>

    <section v-if="selectedCrew" class="selected-crew-shell">
      <header class="selected-crew-head">
        <button type="button" class="back-link" @click="clearSelection">← Todas las sobrecargos</button>
        <div class="selected-crew-title">
          <h3>{{ selectedCrew.displayName }}</h3>
          <div class="selected-crew-stats">
            <span><small>Estado</small><strong>{{ selectedCrew.currentState }}</strong></span>
            <span><small>Base</small><strong>{{ selectedCrew.base }}</strong></span>
            <span><small>Operaciones</small><strong>{{ selectedCrew.operationsCount }}</strong></span>
            <span><small>Activas</small><strong>{{ selectedCrew.activeCount }}</strong></span>
            <span><small>Incidencias</small><strong>{{ selectedCrew.incidentsCount }}</strong></span>
          </div>
        </div>
      </header>

      <div class="master-detail-layout">
        <aside class="operations-panel">
          <div class="section-head">
            <div>
              <p class="eyebrow">Operaciones</p>
              <h3>{{ selectedCrew.shortName }}</h3>
            </div>
            <span class="badge">{{ selectedCrewOperations.length }}</span>
          </div>

          <div v-if="visibleOperations.length" class="operations-list">
            <button
              v-for="operation in visibleOperations"
              :key="operation.id"
              type="button"
              class="operation-row"
              :class="{ 'is-selected': String(selectedOperation?.id) === String(operation.id) }"
              @click="selectOperation(operation.id)"
            >
              <div class="operation-row__head">
                <strong>{{ operation.folio || `OP-${operation.id}` }}</strong>
                <span class="chip" :class="operation.statusChip.tone">{{ operation.statusChip.label }}</span>
              </div>
              <span>{{ operation.route || '—' }}</span>
              <span>{{ formatDateTime(operation.departure) }}</span>
              <span>{{ operation.aircraft || 'Aeronave por definir' }}</span>
            </button>
          </div>

          <button
            v-if="selectedCrewOperations.length > visibleOperations.length"
            type="button"
            class="show-more-button"
            @click="operationsVisibleCount += 8"
          >
            Ver más operaciones
          </button>

          <div v-if="!selectedCrewOperations.length" class="empty-panel">
            <strong>Sin operaciones registradas</strong>
            <p>Esta sobrecargo todavía no tiene operaciones asociadas.</p>
          </div>
        </aside>

        <section class="detail-panel">
          <CrewOperationLogbookView
            v-if="selectedOperation"
            :operation="selectedOperation"
            :format-date-time="formatDateTime"
          />
          <div v-else class="empty-panel">
            <strong>Cargando operaciones...</strong>
            <p>Selecciona una operación para abrir la bitácora completa.</p>
          </div>
        </section>
      </div>
    </section>
  </section>
</template>

<style scoped>
.crew-logbook-page {
  display: grid;
  gap: 1rem;
  color: #132844;
}

.page-head,
.kpi-card,
.filters-bar,
.crew-table-card,
.selected-crew-shell,
.operations-panel,
.detail-panel {
  border: 1px solid rgba(201, 214, 236, 0.78);
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 16px 34px rgba(18, 35, 61, 0.06);
}

.page-head,
.crew-table-card,
.selected-crew-shell,
.operations-panel,
.detail-panel {
  border-radius: 28px;
}

.page-head,
.crew-table-card,
.selected-crew-shell,
.operations-panel,
.detail-panel {
  padding: 1.15rem;
}

.eyebrow {
  margin: 0 0 0.22rem;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #6280af;
}

.page-head h2,
.section-head h3,
.selected-crew-title h3 {
  margin: 0;
  color: #10233d;
}

.page-head p,
.empty-panel p,
.empty-state {
  margin: 0.28rem 0 0;
  color: #647a9b;
}

.kpi-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.8rem;
}

.kpi-card {
  display: grid;
  gap: 0.28rem;
  padding: 0.95rem 1rem;
  border-radius: 22px;
}

.kpi-card span {
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #6a81aa;
}

.kpi-card strong {
  font-size: 1.9rem;
  line-height: 1;
  color: #10233d;
}

.kpi-card small {
  color: #7387a8;
}

.filters-bar {
  display: grid;
  grid-template-columns: minmax(250px, 2fr) repeat(4, minmax(130px, 1fr)) repeat(2, minmax(140px, 0.9fr));
  gap: 0.75rem;
  padding: 0.9rem 1rem;
  border-radius: 22px;
}

.filter {
  display: grid;
  gap: 0.3rem;
}

.filter span {
  font-size: 0.74rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #6a81aa;
}

.filter input,
.filter select {
  min-height: 44px;
  width: 100%;
  padding: 0 0.9rem;
  border-radius: 14px;
  border: 1px solid rgba(181, 197, 225, 0.72);
  background: #fff;
  color: #132844;
}

.section-head,
.selected-crew-head,
.operation-row__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.8rem;
}

.badge,
.chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.32rem 0.72rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 800;
}

.badge {
  border: 1px solid rgba(180, 198, 228, 0.72);
  background: rgba(238, 244, 255, 0.92);
  color: #3a5f96;
}

.chip {
  border: 1px solid transparent;
}

.chip-success {
  border-color: rgba(16, 185, 129, 0.22);
  background: rgba(236, 253, 245, 0.96);
  color: #0f8e65;
}

.chip-warning {
  border-color: rgba(245, 158, 11, 0.22);
  background: rgba(255, 247, 237, 0.96);
  color: #c17b11;
}

.chip-neutral {
  border-color: rgba(148, 163, 184, 0.28);
  background: rgba(248, 250, 252, 0.98);
  color: #64748b;
}

.chip-info {
  border-color: rgba(91, 126, 199, 0.24);
  background: rgba(236, 242, 255, 0.96);
  color: #365fba;
}

.chip-danger {
  border-color: rgba(239, 68, 68, 0.22);
  background: rgba(254, 242, 242, 0.96);
  color: #dc2626;
}

.table-wrap {
  overflow: auto;
}

.crew-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0 0.65rem;
}

.crew-table th {
  padding: 0 0.6rem 0.35rem;
  text-align: left;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #627b9f;
}

.crew-table td {
  padding: 0.9rem 0.6rem;
  background: rgba(255, 255, 255, 0.98);
  border-top: 1px solid rgba(210, 223, 244, 0.85);
  border-bottom: 1px solid rgba(210, 223, 244, 0.85);
}

.crew-table td:first-child {
  border-left: 1px solid rgba(210, 223, 244, 0.85);
  border-radius: 18px 0 0 18px;
}

.crew-table td:last-child {
  border-right: 1px solid rgba(210, 223, 244, 0.85);
  border-radius: 0 18px 18px 0;
}

.crew-table tr.is-selected td {
  border-color: rgba(123, 154, 219, 0.56);
}

.cell-primary {
  display: grid;
}

.action-link,
.back-link,
.show-more-button {
  border: 0;
  background: transparent;
  font-weight: 800;
  cursor: pointer;
}

.action-link,
.show-more-button {
  color: #32599a;
}

.back-link {
  color: #5f7eae;
}

.selected-crew-shell {
  display: grid;
  gap: 1rem;
}

.selected-crew-title {
  display: grid;
  gap: 0.55rem;
  flex: 1;
}

.selected-crew-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
}

.selected-crew-stats span {
  display: grid;
  gap: 0.1rem;
  min-width: 110px;
}

.selected-crew-stats small {
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6e84ab;
}

.master-detail-layout {
  display: grid;
  grid-template-columns: minmax(280px, 30%) minmax(0, 70%);
  gap: 1rem;
}

.operations-panel,
.detail-panel {
  display: grid;
  gap: 0.9rem;
  align-content: start;
}

.operations-list {
  display: grid;
  gap: 0.7rem;
}

.operation-row {
  display: grid;
  gap: 0.28rem;
  padding: 0.95rem;
  border-radius: 18px;
  border: 1px solid rgba(205, 218, 240, 0.84);
  background: rgba(255, 255, 255, 0.98);
  text-align: left;
  cursor: pointer;
}

.operation-row.is-selected {
  border-color: rgba(118, 151, 219, 0.62);
  background: rgba(244, 248, 255, 0.98);
  box-shadow: inset 0 0 0 1px rgba(118, 151, 219, 0.12);
}

.operation-row span {
  color: #6b81a4;
}

.empty-panel {
  display: grid;
  gap: 0.35rem;
  padding: 1.1rem;
  border-radius: 18px;
  border: 1px dashed rgba(185, 201, 228, 0.8);
  background: rgba(249, 251, 255, 0.96);
}

@media (max-width: 1180px) {
  .filters-bar {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .master-detail-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 860px) {
  .kpi-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .filters-bar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .kpi-strip,
  .filters-bar {
    grid-template-columns: 1fr;
  }

  .selected-crew-head,
  .section-head,
  .operation-row__head {
    display: grid;
  }

  .selected-crew-stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
