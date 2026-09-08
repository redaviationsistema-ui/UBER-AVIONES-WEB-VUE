<script setup>
defineProps({ action: { type: Object, default: null }, blockedReason: { type: String, default: '' }, busy: Boolean })
defineEmits(['execute', 'incident'])
</script>

<template>
  <div class="crew-workflow-actions">
    <p v-if="blockedReason" role="status" class="muted">{{ blockedReason }}</p>
    <button v-if="action && !blockedReason" class="primary-action action-button" type="button" :disabled="busy" @click="$emit('execute', action)">
      {{ action.label }}
    </button>
    <button class="ghost-button action-button" type="button" @click="$emit('incident')">Reportar incidencia</button>
  </div>
</template>
