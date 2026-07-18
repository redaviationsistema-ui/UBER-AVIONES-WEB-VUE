<script setup>
import AdminCrewInFlightPage from './crew/in-flight/AdminCrewInFlightPage.vue'
import AdminCrewOperationsPage from './crew/operations/AdminCrewOperationsPage.vue'

const props = defineProps({
  crewMembers: { type: Array, required: true },
  operations: { type: Array, required: true },
  auditEntries: { type: Array, required: true },
  viewMode: { type: String, default: 'operations' },
})

defineEmits(['approve-crew', 'reject-crew', 'suspend-crew', 'assign-crew', 'audit-crew'])
</script>

<template>
  <AdminCrewInFlightPage
    v-if="viewMode === 'in-flight'"
    :crew-members="props.crewMembers"
    :operations="props.operations"
    :audit-entries="props.auditEntries"
    @assign-crew="$emit('assign-crew', $event)"
  />
  <AdminCrewOperationsPage
    v-else
    :crew-members="props.crewMembers"
    :operations="props.operations"
    :audit-entries="props.auditEntries"
    @assign-crew="$emit('assign-crew', $event)"
  />
</template>
