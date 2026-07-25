<script setup>
import { computed } from 'vue'

const props = defineProps({
  hasError: { type: Boolean, default: false },
  countdownLabel: { type: String, default: '' },
  isWarning: { type: Boolean, default: false },
  isLoading: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  showTimer: { type: Boolean, default: true },
})

const totalSeconds = 15 * 60

const secondsRemaining = computed(() => {
  const match = String(props.countdownLabel || '').match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return totalSeconds
  return Number(match[1]) * 60 + Number(match[2])
})

const progressPercent = computed(() =>
  Math.max(0, Math.min(100, Math.round((secondsRemaining.value / totalSeconds) * 100))),
)

const importantPoints = [
  'Tu tarjeta nunca pasa por nuestros servidores.',
  'Stripe procesa el pago de forma segura.',
  'La confirmación llega en cuanto Stripe valida el cobro.',
]

const statusLabel = computed(() => {
  if (props.hasError) return 'ERROR'
  if (props.isLoading) return 'VALIDANDO'
  if (props.isWarning) return 'HOLD'
  return 'LISTO'
})

const summaryTitle = computed(() => {
  if (props.hasError) return 'Revisar disponibilidad'
  if (props.isLoading) return 'Validando pago'
  return 'Información importante'
})
</script>

<template>
  <details class="countdown-card" :class="{ 'countdown-card--warning': isWarning, 'countdown-card--compact': compact }">
    <summary class="countdown-card__summary">
      <div class="countdown-card__summary-copy">
        <span class="countdown-card__eyebrow">Información importante</span>
        <strong>{{ summaryTitle }}</strong>
      </div>
      <span class="countdown-card__status">
        {{ statusLabel }}
      </span>
    </summary>

    <div class="countdown-card__body">
      <ul class="countdown-card__list">
        <li v-for="point in importantPoints" :key="point">{{ point }}</li>
      </ul>

      <div v-if="showTimer" class="countdown-card__timer">
        <div class="countdown-card__timer-copy">
          <span>Tiempo restante</span>
          <strong>{{
            hasError
              ? 'Retención no disponible'
              : isLoading
                ? 'Validando disponibilidad...'
                : countdownLabel || '00:00'
          }}</strong>
        </div>
        <div class="countdown-card__track" aria-hidden="true">
          <span class="countdown-card__bar" :style="{ width: `${progressPercent}%` }"></span>
        </div>
      </div>
    </div>
  </details>
</template>

<style scoped>
.countdown-card {
  display: grid;
  gap: 0;
  padding: 1rem 1.1rem;
  border-radius: 24px;
  border: 1px solid rgba(18, 25, 38, 0.08);
  background: linear-gradient(180deg, #ffffff 0%, #f7f9fc 100%);
  box-shadow: 0 14px 32px rgba(18, 25, 38, 0.06);
}

.countdown-card--warning {
  border-color: rgba(217, 119, 6, 0.32);
  background: linear-gradient(180deg, #fffef8 0%, #fff8eb 100%);
}

.countdown-card__summary {
  display: flex;
  justify-content: space-between;
  gap: 0.85rem;
  align-items: center;
  cursor: pointer;
  list-style: none;
}

.countdown-card__eyebrow {
  color: #75819a;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.countdown-card__summary-copy {
  display: grid;
  gap: 0.1rem;
}

.countdown-card__summary-copy strong {
  color: #101828;
  font-size: 0.98rem;
}

.countdown-card--compact .countdown-card__summary-copy {
  grid-template-columns: auto auto;
  align-items: center;
  gap: 0.65rem;
}

.countdown-card--compact .countdown-card__eyebrow {
  margin: 0;
}

.countdown-card__status {
  padding: 0.38rem 0.68rem;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

ul {
  margin: 0;
}

.countdown-card__body {
  display: grid;
  gap: 0.8rem;
  padding-top: 0.85rem;
}

.countdown-card--compact .countdown-card__body {
  gap: 0.65rem;
  padding-top: 0.7rem;
}

.countdown-card__list {
  display: grid;
  gap: 0.55rem;
  padding-left: 1.1rem;
  color: #475467;
  line-height: 1.45;
  font-size: 0.9rem;
}

.countdown-card__timer {
  display: grid;
  gap: 0.65rem;
  padding: 0.85rem 0.95rem;
  border-radius: 16px;
  background: #eef4ff;
}

.countdown-card--compact .countdown-card__timer {
  padding: 0.75rem 0.85rem;
}

.countdown-card__timer-copy {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: end;
}

.countdown-card__timer-copy span {
  color: #475467;
  font-size: 0.86rem;
}

.countdown-card__timer-copy strong {
  color: #0f172a;
  font-size: clamp(1.05rem, 2vw, 1.3rem);
}

.countdown-card__track {
  height: 0.56rem;
  border-radius: 999px;
  background: rgba(15, 39, 71, 0.08);
  overflow: hidden;
}

.countdown-card__bar {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #163a63 0%, #2563eb 100%);
  transition: width 180ms ease;
}

@media (max-width: 640px) {
  .countdown-card__timer-copy {
    display: grid;
  }
}
</style>
