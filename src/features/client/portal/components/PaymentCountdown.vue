<script setup>
import { computed } from 'vue'

const props = defineProps({
  hasError: { type: Boolean, default: false },
  countdownLabel: { type: String, default: '' },
  isWarning: { type: Boolean, default: false },
  isLoading: { type: Boolean, default: false },
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
</script>

<template>
  <article class="countdown-card" :class="{ 'countdown-card--warning': isWarning }">
    <header class="countdown-card__header">
      <div>
        <span class="countdown-card__eyebrow">Card 3</span>
        <h3>Información importante</h3>
      </div>
      <span class="countdown-card__status">
        {{ hasError ? 'ERROR' : isLoading ? 'VALIDANDO' : isWarning ? 'HOLD' : 'LISTO' }}
      </span>
    </header>

    <ul class="countdown-card__list">
      <li>La aeronave permanecerá apartada durante el tiempo restante.</li>
      <li>El pago se confirma inmediatamente.</li>
      <li>Tu información bancaria nunca pasa por nuestros servidores.</li>
      <li>Stripe procesa toda la transacción.</li>
    </ul>

    <div class="countdown-card__timer">
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
  </article>
</template>

<style scoped>
.countdown-card {
  display: grid;
  gap: 1.15rem;
  padding: 1.5rem;
  border-radius: 28px;
  border: 1px solid rgba(18, 25, 38, 0.08);
  background: linear-gradient(180deg, #ffffff 0%, #f7f9fc 100%);
  box-shadow: 0 24px 60px rgba(18, 25, 38, 0.08);
}

.countdown-card--warning {
  border-color: rgba(217, 119, 6, 0.32);
  background: linear-gradient(180deg, #fffef8 0%, #fff8eb 100%);
}

.countdown-card__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: start;
}

.countdown-card__eyebrow {
  color: #75819a;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.countdown-card__status {
  padding: 0.45rem 0.75rem;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

h3,
ul {
  margin: 0;
}

h3 {
  color: #101828;
  font-size: 1.35rem;
}

.countdown-card__list {
  display: grid;
  gap: 0.75rem;
  padding-left: 1.1rem;
  color: #475467;
  line-height: 1.55;
}

.countdown-card__timer {
  display: grid;
  gap: 0.8rem;
  padding: 1rem 1.1rem;
  border-radius: 22px;
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
  font-size: 0.92rem;
}

.countdown-card__timer-copy strong {
  color: #0f172a;
  font-size: clamp(1.4rem, 3vw, 2rem);
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
