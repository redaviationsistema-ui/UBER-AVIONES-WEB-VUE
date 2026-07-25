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

const hasValidCountdown = computed(() => /^(\d{1,2}):(\d{2})$/.test(String(props.countdownLabel || '').trim()))

const expirationMessage = computed(() => {
  if (!hasValidCountdown.value) return ''
  return `Tu reserva vence en ${props.countdownLabel}`
})

const helperMessage = computed(() => {
  if (props.hasError) return 'No pudimos validar la disponibilidad para continuar.'
  if (props.isLoading) return 'Estamos validando la disponibilidad antes de enviarte a Stripe.'
  if (props.isWarning && hasValidCountdown.value) return expirationMessage.value
  if (props.showTimer && hasValidCountdown.value) return expirationMessage.value
  return ''
})
</script>

<template>
  <div
    class="countdown-card"
    :class="{ 'countdown-card--warning': isWarning, 'countdown-card--compact': compact }"
  >
    <div class="countdown-card__summary-copy">
      <strong>{{ helperMessage }}</strong>
    </div>

    <div v-if="showTimer && hasValidCountdown" class="countdown-card__timer">
      <div class="countdown-card__timer-copy">
        <span>Tiempo restante</span>
        <strong>{{ countdownLabel }}</strong>
      </div>
      <div class="countdown-card__track" aria-hidden="true">
        <span class="countdown-card__bar" :style="{ width: `${progressPercent}%` }"></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.countdown-card {
  display: grid;
  gap: 0.65rem;
  padding: 0.95rem 1.05rem;
  border-radius: 20px;
  border: 1px solid rgba(18, 25, 38, 0.08);
  background: linear-gradient(180deg, #ffffff 0%, #f7f9fc 100%);
  box-shadow: 0 12px 28px rgba(18, 25, 38, 0.06);
}

.countdown-card--warning {
  border-color: rgba(217, 119, 6, 0.32);
  background: linear-gradient(180deg, #fffef8 0%, #fff8eb 100%);
}

.countdown-card__summary-copy {
  display: grid;
  gap: 0.15rem;
}

.countdown-card__summary-copy strong {
  color: #101828;
  font-size: 0.94rem;
  line-height: 1.4;
}

.countdown-card__timer {
  display: grid;
  gap: 0.65rem;
  padding: 0.75rem 0.85rem;
  border-radius: 16px;
  background: #eef4ff;
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
