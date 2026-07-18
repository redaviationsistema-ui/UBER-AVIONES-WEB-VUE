<script setup>
import { computed, reactive } from 'vue'
import CrewOperationsAuditLog from '../operations/CrewOperationsAuditLog.vue'
import CrewOperationsFilters from '../operations/CrewOperationsFilters.vue'
import InFlightOperationDrawer from './InFlightOperationDrawer.vue'
import InFlightOperationsTable from './InFlightOperationsTable.vue'
import InFlightSummary from './InFlightSummary.vue'
import { useCrewInFlight } from '../composables/useCrewInFlight'

const props = defineProps({
  crewMembers: { type: Array, required: true },
  operations: { type: Array, required: true },
  auditEntries: { type: Array, required: true },
})

const emit = defineEmits(['assign-crew'])

const controller = reactive(useCrewInFlight(props))

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
    onSuccess: () => {
      controller.clearAssignmentError(operationId)
      controller.updateOperationLocalState(operationId, {
        crew: controller.selectedDraftCrew(operation)?.name || operation.crew,
        crewId: payload.sobrecargo_user_id,
        crewOperationalState: 'pending_crew_response',
        briefingTime: payload.presentation_time || '',
        presentationPlace: payload.presentation_place || '',
      })
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
        <p class="eyebrow">Seguimiento activo</p>
        <h3>Sobrecargos en vuelo</h3>
        <p class="muted">Esta vista solo muestra operaciones activas segun el estado real del vuelo.</p>
      </div>
    </header>

    <InFlightSummary :cards="controller.summaryCards" />

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

    <div class="tabs-strip" role="tablist" aria-label="Seguimiento de sobrecargos en vuelo">
      <button
        type="button"
        class="tab-button"
        :class="{ 'tab-button--active': controller.activeTab === 'operations' }"
        @click="controller.activeTab = 'operations'"
      >
        <span>En vuelo</span>
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
      <InFlightOperationsTable
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

      <InFlightOperationDrawer
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
  gap: 1rem;
}

.tabs-strip {
  display: flex;
  gap: 0.75rem;
}

.tab-button {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.75rem 1rem;
  border-radius: 999px;
  border: 1px solid rgba(154, 176, 215, 0.25);
  background: #fff;
  cursor: pointer;
}

.tab-button--active {
  background: #eaf2ff;
}

.workspace-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1.15fr) minmax(340px, 0.85fr);
}

@media (max-width: 1100px) {
  .workspace-grid {
    grid-template-columns: 1fr;
  }
}
</style>
