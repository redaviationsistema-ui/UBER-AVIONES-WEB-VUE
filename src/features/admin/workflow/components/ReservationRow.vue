<script setup>
const props = defineProps({
  reservation: { type: Object, required: true },
  selected: { type: Boolean, default: false },
})

defineEmits(['select'])
</script>

<template>
  <button
    type="button"
    class="reservation-row"
    :class="{ 'reservation-row--selected': selected }"
    @click="$emit('select', reservation.id)"
  >
    <div class="reservation-row__main">
      <strong>#{{ reservation.id }}</strong>
      <h4>{{ reservation.clientName }}</h4>
      <p>{{ reservation.route }}</p>
      <span>{{ reservation.aircraft || 'Por definir' }}</span>
    </div>

    <div class="reservation-row__meta">
      <span class="reservation-row__stage">{{ reservation.currentStageLabel }}</span>
      <small>{{ reservation.departureShort }}</small>
    </div>
  </button>
</template>

<style scoped>
.reservation-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.9rem;
  width: 100%;
  min-height: 74px;
  padding: 0.9rem 1rem;
  border: 1px solid #e6ebf2;
  border-radius: 16px;
  background: #ffffff;
  text-align: left;
  cursor: pointer;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease;
}

.reservation-row:hover,
.reservation-row--selected {
  border-color: #2f69ff;
  box-shadow: 0 14px 28px rgba(39, 89, 223, 0.1);
  transform: translateY(-1px);
}

.reservation-row__main,
.reservation-row__meta {
  display: grid;
  gap: 0.2rem;
}

.reservation-row strong,
.reservation-row h4,
.reservation-row p,
.reservation-row span,
.reservation-row small {
  margin: 0;
  color: #111111;
}

.reservation-row h4 {
  font-size: 1rem;
  line-height: 1.1;
}

.reservation-row p,
.reservation-row span,
.reservation-row small {
  color: #4f5b6e;
}

.reservation-row__meta {
  justify-items: end;
}

.reservation-row__stage {
  color: #1b7d34 !important;
  font-weight: 800;
}

@media (max-width: 720px) {
  .reservation-row {
    grid-template-columns: 1fr;
  }

  .reservation-row__meta {
    justify-items: start;
  }
}
</style>
