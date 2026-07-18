<script setup>
import AdminCrewAvailabilitySection from '../../AdminCrewAvailabilitySection.vue'

defineProps({
  crewMembers: { type: Array, required: true },
  operations: { type: Array, required: true },
  auditEntries: { type: Array, required: true },
  statusOptions: { type: Array, default: () => [] },
})

defineEmits(['audit-crew', 'save-availability'])
</script>

<template>
  <AdminCrewAvailabilitySection
    :crew-members="crewMembers"
    :operations="operations"
    :audit-entries="auditEntries"
    :status-options="statusOptions"
    @audit-crew="$emit('audit-crew', $event)"
    @save-availability="$emit('save-availability', $event)"
  />
</template>
