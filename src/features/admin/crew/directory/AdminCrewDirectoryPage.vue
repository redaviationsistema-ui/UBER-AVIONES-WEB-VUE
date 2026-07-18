<script setup>
import AdminCrewDirectorySection from '../../AdminCrewDirectorySection.vue'

defineProps({
  crewMembers: { type: Array, required: true },
  operations: { type: Array, required: true },
  auditEntries: { type: Array, required: true },
})

defineEmits(['approve-crew', 'reject-crew', 'suspend-crew', 'audit-crew'])
</script>

<template>
  <AdminCrewDirectorySection
    :crew-members="crewMembers"
    :operations="operations"
    :audit-entries="auditEntries"
    @approve-crew="$emit('approve-crew', $event)"
    @reject-crew="$emit('reject-crew', $event)"
    @suspend-crew="$emit('suspend-crew', $event)"
    @audit-crew="$emit('audit-crew', $event)"
  />
</template>
