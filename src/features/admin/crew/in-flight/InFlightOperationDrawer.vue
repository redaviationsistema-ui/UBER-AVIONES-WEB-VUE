<script setup>
import CrewOperationDetailDrawer from '../operations/CrewOperationDetailDrawer.vue'

defineProps({
  operation: { type: Object, default: null },
  draft: { type: Object, default: null },
  assignableCrew: { type: Array, default: () => [] },
  linkedCrewMember: { type: Object, default: null },
  availabilityState: {
    type: Object,
    default: () => ({
      kind: 'idle',
      message: 'Selecciona sobrecargo',
      disableSelect: false,
    }),
  },
  selectedCrewMember: { type: Object, default: null },
  assignmentError: { type: String, default: '' },
  canAssign: { type: Boolean, default: false },
  isClosed: { type: Boolean, default: false },
  loadingAvailableCrew: { type: Boolean, default: false },
  formatDateTime: { type: Function, required: true },
  operationIncidentLabel: { type: Function, required: true },
  humanizeStatus: { type: Function, required: true },
  toneClass: { type: Function, required: true },
  operationStatusLabel: { type: Function, required: true },
  operationCrewStateLabel: { type: Function, required: true },
  operationAssignmentBadgeLabel: { type: Function, required: true },
  isCrewReadyForOperation: { type: Function, required: true },
})

defineEmits(['update-draft', 'assign', 'load-available'])
</script>

<template>
  <CrewOperationDetailDrawer
    :operation="operation"
    :draft="draft"
    :assignable-crew="assignableCrew"
    :availability-state="availabilityState"
    :linked-crew-member="linkedCrewMember"
    :selected-crew-member="selectedCrewMember"
    :assignment-error="assignmentError"
    :can-assign="canAssign"
    :is-closed="isClosed"
    :is-in-flight="true"
    :loading-available-crew="loadingAvailableCrew"
    :format-date-time="formatDateTime"
    :operation-incident-label="operationIncidentLabel"
    :humanize-status="humanizeStatus"
    :tone-class="toneClass"
    :operation-status-label="operationStatusLabel"
    :operation-crew-state-label="operationCrewStateLabel"
    :operation-assignment-badge-label="operationAssignmentBadgeLabel"
    :is-crew-ready-for-operation="isCrewReadyForOperation"
    @update-draft="(operationId, key, value) => $emit('update-draft', operationId, key, value)"
    @assign="$emit('assign', $event)"
    @load-available="$emit('load-available', $event)"
  />
</template>
