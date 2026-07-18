<script setup>
import ReservationRow from './ReservationRow.vue'

defineProps({
  reservations: { type: Array, default: () => [] },
  selectedReservationId: { type: [String, Number, null], default: null },
})

defineEmits(['select'])
</script>

<template>
  <div class="reservation-list-compact">
    <ReservationRow
      v-for="reservation in reservations"
      :key="reservation.id"
      :reservation="reservation"
      :selected="String(reservation.id) === String(selectedReservationId ?? '')"
      @select="$emit('select', $event)"
    />
  </div>
</template>

<style scoped>
.reservation-list-compact {
  display: grid;
  gap: 0.75rem;
}
</style>
