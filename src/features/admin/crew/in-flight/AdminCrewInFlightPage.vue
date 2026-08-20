<script setup>
import { computed, reactive } from 'vue'
import CrewOperationLogbookView from '../operations/CrewOperationLogbookView.vue'
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
        crewAssignment: {
          status: 'pending_confirmation',
          rawStatus: 'pending_confirmation',
          assignedAt: new Date().toISOString(),
          presentationTime: payload.presentation_time || '',
        },
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
      <div class="workspace-hero">
        <div class="workspace-hero__copy">
          <p class="eyebrow">Seguimiento activo</p>
          <h3>Sobrecargos en vuelo</h3>
          <p class="muted">Monitorea operaciones vivas, detecta respuestas pendientes y mantén el pulso operativo sin cambiar de módulo.</p>
        </div>
        <div class="workspace-hero__callout">
          <span>Cabina en tiempo real</span>
          <strong>{{ controller.filteredOperations.length }}</strong>
          <small>operaciones activas visibles ahora</small>
        </div>
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
      <button
        type="button"
        class="tab-button"
        :class="{ 'tab-button--active': controller.activeTab === 'logbook' }"
        :disabled="!controller.selectedOperation"
        @click="controller.selectedOperation && (controller.activeTab = 'logbook')"
      >
        <span>Bitácora del vuelo</span>
        <strong>{{ controller.selectedOperation ? controller.selectedOperation.folio || `RA-${controller.selectedOperation.id}` : 'Selecciona un vuelo' }}</strong>
      </button>
    </div>

    <CrewOperationLogbookView
      v-if="controller.activeTab === 'logbook' && controller.selectedOperation"
      :operation="controller.selectedOperation"
      :format-date-time="formatDateTime"
    />

    <div v-else class="workspace-grid" :class="{ 'workspace-grid--assigned': controller.activeTab === 'operations' && controller.selectedOperation }">
      <InFlightOperationsTable
        v-if="controller.activeTab === 'operations'"
        :operations="controller.filteredOperations"
        :selected-operation-id="controller.selectedOperation?.id || null"
        :operation-display-client="controller.operationDisplayClient"
        :operation-display-crew="(operation) => controller.operationDisplayCrew(operation, controller.linkedCrewForOperation(operation))"
        :operation-crew-state-label="(operation) => controller.operationCrewStateLabel(operation, controller.linkedCrewForOperation(operation))"
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
        :availability-state="controller.availableCrewState(controller.selectedOperation)"
        :linked-crew-member="controller.linkedCrewForOperation(controller.selectedOperation)"
        :selected-crew-member="controller.selectedDraftCrew(controller.selectedOperation)"
        :selected-crew-availability-state="controller.selectedCrewAvailabilityState(controller.selectedOperation)"
        :assignment-eligibility-state="controller.assignmentEligibilityState(controller.selectedOperation)"
        :assignment-error="controller.assignmentErrors[controller.selectedOperation.id] || ''"
        :assignment-window-message="controller.assignmentWindowMessage(controller.selectedOperation)"
        :can-assign="controller.operationAllowsAssignment(controller.selectedOperation)"
        :can-submit-assignment="controller.canSubmitAssignment(controller.selectedOperation)"
        :is-closed="controller.isOperationClosed(controller.selectedOperation)"
        :loading-available-crew="controller.isLoadingAvailableCrewForOperation(controller.selectedOperation)"
        :format-date-time="formatDateTime"
        :operation-incident-label="controller.operationIncidentLabel"
        :humanize-status="controller.humanizeStatus"
        :tone-class="controller.toneClass"
        :operation-status-label="operationStatusLabel"
        :operation-crew-state-label="(operation) => controller.operationCrewStateLabel(operation, controller.linkedCrewForOperation(operation))"
        :operation-assignment-badge-label="controller.operationAssignmentBadgeLabel"
        :is-crew-ready-for-operation="controller.isCrewReadyForOperation"
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
  gap: 1.15rem;
  color: #000;
  padding: 0.25rem 0 1rem;
  --crew-page-bg:
    radial-gradient(circle at top left, rgba(202, 223, 255, 0.72), transparent 28%),
    radial-gradient(circle at top right, rgba(255, 231, 183, 0.58), transparent 24%),
    linear-gradient(180deg, #eef4ff 0%, #e8f0fb 45%, #edf3ff 100%);
}

.crew-workspace :deep(*),
.crew-workspace :deep(h1),
.crew-workspace :deep(h2),
.crew-workspace :deep(h3),
.crew-workspace :deep(h4),
.crew-workspace :deep(p),
.crew-workspace :deep(span),
.crew-workspace :deep(strong),
.crew-workspace :deep(small),
.crew-workspace :deep(label),
.crew-workspace :deep(th),
.crew-workspace :deep(td),
.crew-workspace :deep(button),
.crew-workspace :deep(input),
.crew-workspace :deep(select),
.crew-workspace :deep(textarea),
.crew-workspace :deep(option) {
  color: #000;
}

.crew-workspace :deep(input::placeholder),
.crew-workspace :deep(textarea::placeholder) {
  color: rgba(0, 0, 0, 0.68);
  opacity: 1;
}

.workspace-head {
  position: relative;
  overflow: hidden;
  padding: 1.4rem 1.45rem;
  border-radius: 34px;
  border: 1px solid rgba(197, 211, 237, 0.65);
  background: var(--crew-page-bg);
  box-shadow: 0 34px 60px rgba(36, 63, 98, 0.09);
}

.workspace-head::after {
  content: '';
  position: absolute;
  right: -3rem;
  top: -2rem;
  width: 220px;
  height: 220px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.46);
  filter: blur(4px);
}

.workspace-hero {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(220px, 0.65fr);
  gap: 1rem;
  align-items: stretch;
}

.workspace-hero__copy {
  display: grid;
  align-content: center;
  gap: 0.45rem;
}

.workspace-head .eyebrow {
  margin: 0;
  font-size: 0.76rem;
  font-weight: 900;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #c08a24;
}

.workspace-head h3 {
  margin: 0;
  font-size: clamp(2rem, 3.2vw, 2.8rem);
  line-height: 0.98;
  color: #10233d;
}

.workspace-head .muted {
  margin: 0;
  max-width: 46rem;
  font-size: 1rem;
  line-height: 1.6;
  color: #536984;
}

.workspace-hero__callout {
  display: grid;
  align-content: center;
  justify-items: start;
  gap: 0.3rem;
  padding: 1rem 1.1rem;
  border-radius: 26px;
  border: 1px solid rgba(177, 197, 232, 0.42);
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(10px);
}

.workspace-hero__callout span {
  font-size: 0.75rem;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #5e79a0;
}

.workspace-hero__callout strong {
  font-size: clamp(2rem, 3vw, 2.6rem);
  line-height: 1;
  color: #16345d;
}

.workspace-hero__callout small {
  color: #5d7391;
}

.tabs-strip {
  display: flex;
  gap: 0.75rem;
  padding: 0.4rem;
  border-radius: 22px;
  border: 1px solid rgba(195, 209, 233, 0.5);
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
}

.tab-button {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.75rem 1rem;
  border-radius: 999px;
  border: 1px solid rgba(154, 176, 215, 0.25);
  background: transparent;
  cursor: pointer;
  color: #35527e;
  font-weight: 800;
  transition: background 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
}

.tab-button:hover {
  transform: translateY(-1px);
}

.tab-button--active {
  background: linear-gradient(180deg, #eff5ff, #e2ecff);
  box-shadow: 0 10px 22px rgba(53, 90, 145, 0.14);
}

.workspace-grid {
  display: grid;
  gap: 1.1rem;
  grid-template-columns: minmax(0, 1.15fr) minmax(340px, 0.85fr);
}

@media (max-width: 1100px) {
  .workspace-hero {
    grid-template-columns: 1fr;
  }

  .workspace-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .workspace-head {
    padding: 1.1rem 1rem;
    border-radius: 26px;
  }

  .workspace-head h3 {
    font-size: 1.8rem;
  }

  .tabs-strip {
    overflow: auto;
  }
}
</style>
