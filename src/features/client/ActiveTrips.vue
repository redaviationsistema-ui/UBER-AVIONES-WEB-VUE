<script setup>
import ViajesActivos from './viajes/ViajesActivos.vue'

defineProps({
  reservations: { type: Array, required: true },
  activeTab: { type: String, default: 'proximos' },
  selectedReservationId: { type: [String, Number], default: '' },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['open-detail', 'change-tab', 'refresh'])
</script>

<template>
  <ViajesActivos
    v-bind="$props"
    @open-detail="emit('open-detail', $event)"
    @change-tab="emit('change-tab', $event)"
    @refresh="emit('refresh', $event)"
  />
</template>
