<script setup>
import { computed } from 'vue'

const props = defineProps({
  badge: { type: String, default: '' },
  eyebrow: { type: String, default: '' },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  helperText: { type: String, default: '' },
  buttonLabel: { type: String, default: '' },
  buttonLoadingLabel: { type: String, default: 'Cargando...' },
  buttonDisabledReason: { type: String, default: '' },
  buttonIcon: { type: String, default: '' },
  buttonArrow: { type: String, default: '→' },
  estimatedTime: { type: String, default: '' },
  enabled: { type: Boolean, default: true },
  loading: { type: Boolean, default: false },
  variant: { type: String, default: 'contract' },
  illustration: { type: String, default: 'contract' },
  errorText: { type: String, default: '' },
})

const illustrationVariant = computed(() =>
  ['payment', 'contract'].includes(props.illustration) ? props.illustration : 'contract',
)

const buttonLabelText = computed(() =>
  props.loading ? props.buttonLoadingLabel || 'Cargando...' : props.buttonLabel,
)

const buttonDisabled = computed(() => !props.enabled || props.loading)

defineEmits(['action'])
</script>

<template>
  <article class="reservation-action-card" :class="`reservation-action-card--${variant}`">
    <div class="reservation-action-card__content">
      <div class="reservation-action-card__copy">
        <span class="reservation-action-card__badge">
          <span class="reservation-action-card__badge-dot" aria-hidden="true"></span>
          {{ badge }}
        </span>
        <span class="reservation-action-card__eyebrow">{{ eyebrow }}</span>
        <h4>{{ title }}</h4>
        <p>{{ description }}</p>
        <span v-if="helperText" class="reservation-action-card__helper">{{ helperText }}</span>
      </div>

      <div class="reservation-action-card__illustration" aria-hidden="true">
        <div
          class="reservation-action-illustration"
          :class="`reservation-action-illustration--${illustrationVariant}`"
        >
          <div class="reservation-action-illustration__glow"></div>

          <template v-if="illustrationVariant === 'payment'">
            <div class="reservation-action-illustration__spark reservation-action-illustration__spark--one"></div>
            <div class="reservation-action-illustration__spark reservation-action-illustration__spark--two"></div>
            <div class="reservation-action-illustration__card">
              <span></span>
              <span></span>
              <strong>4242</strong>
            </div>
            <div class="reservation-action-illustration__payment-check">✓</div>
            <div class="reservation-action-illustration__payment-shield">
              <div class="reservation-action-illustration__payment-lock"></div>
            </div>
          </template>

          <template v-else>
            <div class="reservation-action-illustration__shield">✓</div>
            <div class="reservation-action-illustration__document">
              <span></span>
              <span></span>
              <span></span>
              <div class="reservation-action-illustration__signature"></div>
            </div>
            <div class="reservation-action-illustration__pen"></div>
          </template>
        </div>
      </div>
    </div>

    <p v-if="errorText" class="reservation-action-card__error">{{ errorText }}</p>

    <button
      type="button"
      class="reservation-action-card__button"
      :class="[
        `reservation-action-card__button--${variant}`,
        { 'reservation-action-card__button--loading': loading },
      ]"
      :disabled="buttonDisabled"
      :aria-busy="loading ? 'true' : 'false'"
      @click="$emit('action')"
    >
      <span
        v-if="loading"
        class="reservation-action-card__spinner"
        aria-hidden="true"
      ></span>
      <span v-else class="reservation-action-card__button-icon">{{ buttonIcon }}</span>
      <span class="reservation-action-card__button-label">{{ buttonLabelText }}</span>
      <span class="reservation-action-card__button-arrow">{{ loading ? '…' : buttonArrow }}</span>
    </button>

    <p
      v-if="!enabled && buttonDisabledReason"
      class="reservation-action-card__disabled-reason"
    >
      {{ buttonDisabledReason }}
    </p>

    <p v-if="estimatedTime" class="reservation-action-card__estimated-time">
      ⏱ Tiempo estimado: {{ estimatedTime }}
    </p>
  </article>
</template>

<style scoped>
.reservation-action-card {
  display: grid;
  gap: 1.1rem;
  padding: 1.35rem;
  border-radius: 18px;
  border: 1px solid rgba(240, 210, 158, 0.6);
  background:
    radial-gradient(circle at top right, rgba(255, 198, 92, 0.16), transparent 30%),
    linear-gradient(180deg, #fffdfa, #fff7eb);
  box-shadow:
    0 16px 34px rgba(182, 126, 20, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.85);
}

.reservation-action-card__content {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(170px, 220px);
  gap: 1rem;
  align-items: center;
}

.reservation-action-card__copy {
  display: grid;
  gap: 0.55rem;
}

.reservation-action-card__badge {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  justify-content: center;
  width: fit-content;
  min-height: 2rem;
  padding: 0.2rem 0.75rem;
  border: 1px solid rgba(240, 170, 51, 0.3);
  border-radius: 999px;
  background: rgba(255, 243, 220, 0.92);
  color: #d27c00;
  font-size: 0.82rem;
  font-weight: 900;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.reservation-action-card__badge-dot {
  width: 0.72rem;
  height: 0.72rem;
  border-radius: 50%;
  background: linear-gradient(180deg, #ffca65, #df9412);
  box-shadow: 0 4px 10px rgba(223, 148, 18, 0.22);
}

.reservation-action-card__eyebrow {
  color: #3d372d;
  font-size: 0.98rem;
  font-weight: 800;
}

.reservation-action-card h4 {
  margin: 0;
  color: #111111;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  font-size: clamp(1.5rem, 2vw, 2.3rem);
  line-height: 1.05;
}

.reservation-action-card p {
  margin: 0;
  max-width: 36rem;
  color: #5f584e;
  font-size: 1rem;
  line-height: 1.55;
}

.reservation-action-card__helper {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: #746d64;
  font-size: 1rem;
  font-weight: 700;
}

.reservation-action-card__helper::before {
  content: '🔒';
  font-size: 1.05rem;
}

.reservation-action-card--contract .reservation-action-card__helper::before {
  content: '🎧';
}

.reservation-action-card__illustration {
  display: grid;
  justify-items: end;
}

.reservation-action-illustration {
  position: relative;
  width: 180px;
  height: 180px;
}

.reservation-action-illustration__glow {
  position: absolute;
  inset: 18px 20px 28px 32px;
  border-radius: 30px;
  background: radial-gradient(circle, rgba(255, 196, 79, 0.22), rgba(255, 196, 79, 0));
}

.reservation-action-illustration__document {
  position: absolute;
  right: 18px;
  bottom: 12px;
  width: 108px;
  height: 136px;
  border-radius: 24px;
  background: linear-gradient(180deg, #ffffff, #f8f2e8);
  box-shadow:
    0 14px 30px rgba(176, 143, 83, 0.16),
    inset 0 -1px 0 rgba(210, 190, 155, 0.3);
  transform: rotate(6deg);
}

.reservation-action-illustration__document::before {
  content: '';
  position: absolute;
  inset: 10px;
  border: 1px solid rgba(230, 220, 204, 0.9);
  border-radius: 18px;
}

.reservation-action-illustration__document span {
  position: absolute;
  left: 26px;
  right: 28px;
  height: 5px;
  border-radius: 999px;
  background: rgba(167, 173, 184, 0.7);
}

.reservation-action-illustration__document span:nth-child(1) {
  top: 28px;
}

.reservation-action-illustration__document span:nth-child(2) {
  top: 44px;
  right: 36px;
}

.reservation-action-illustration__document span:nth-child(3) {
  top: 60px;
  right: 48px;
}

.reservation-action-illustration__signature {
  position: absolute;
  left: 24px;
  right: 28px;
  bottom: 26px;
  height: 32px;
}

.reservation-action-illustration__signature::before,
.reservation-action-illustration__signature::after {
  content: '';
  position: absolute;
  border-radius: 999px;
  background: #d89318;
}

.reservation-action-illustration__signature::before {
  left: 0;
  width: 54px;
  height: 3px;
  bottom: 7px;
  transform: rotate(-18deg);
  box-shadow: 16px -6px 0 0 #e5ad4d;
}

.reservation-action-illustration__signature::after {
  left: 38px;
  width: 18px;
  height: 18px;
  bottom: 0;
  border-radius: 50%;
  background: #f2c262;
}

.reservation-action-illustration__pen {
  position: absolute;
  right: 8px;
  bottom: 34px;
  width: 14px;
  height: 82px;
  border-radius: 999px;
  background: linear-gradient(180deg, #1d2530, #49515b);
  transform: rotate(32deg);
  box-shadow: 0 10px 22px rgba(30, 37, 48, 0.18);
}

.reservation-action-illustration__pen::before {
  content: '';
  position: absolute;
  top: 9px;
  left: 2px;
  width: 10px;
  height: 16px;
  border-radius: 999px;
  background: linear-gradient(180deg, #f8fafc, #b6bec8);
}

.reservation-action-illustration__pen::after {
  content: '';
  position: absolute;
  left: 3px;
  bottom: -8px;
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 12px solid #c99329;
}

.reservation-action-illustration__shield,
.reservation-action-illustration__payment-check {
  position: absolute;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  color: #ffffff;
  font-weight: 900;
}

.reservation-action-illustration__shield {
  right: 60px;
  bottom: 44px;
  background: linear-gradient(180deg, #ffca65, #df9412);
  box-shadow: 0 10px 20px rgba(223, 148, 18, 0.22);
}

.reservation-action-illustration__card {
  position: absolute;
  right: 34px;
  bottom: 40px;
  width: 126px;
  height: 76px;
  padding: 14px 16px;
  border-radius: 18px;
  background: linear-gradient(135deg, #2a2e35, #11151d);
  box-shadow: 0 18px 36px rgba(36, 42, 56, 0.22);
}

.reservation-action-illustration__card span {
  display: block;
  border-radius: 999px;
}

.reservation-action-illustration__card span:nth-child(1) {
  width: 22px;
  height: 16px;
  background: linear-gradient(180deg, #f2c262, #ca9217);
}

.reservation-action-illustration__card span:nth-child(2) {
  width: 52px;
  height: 6px;
  margin-top: 22px;
  background: rgba(255, 255, 255, 0.9);
}

.reservation-action-illustration__card strong {
  position: absolute;
  right: 16px;
  bottom: 14px;
  color: rgba(255, 255, 255, 0.92);
  font-size: 1rem;
  letter-spacing: 0.06em;
}

.reservation-action-illustration__payment-check {
  right: 22px;
  bottom: 88px;
  background: linear-gradient(180deg, #33c36b, #11954a);
  box-shadow: 0 10px 20px rgba(17, 149, 74, 0.22);
}

.reservation-action-illustration__payment-shield {
  position: absolute;
  right: 4px;
  bottom: 26px;
  width: 58px;
  height: 66px;
  clip-path: polygon(50% 0%, 95% 18%, 95% 55%, 50% 100%, 5% 55%, 5% 18%);
  background: linear-gradient(180deg, #8f939d, #626771);
  box-shadow: 0 12px 28px rgba(67, 74, 85, 0.18);
}

.reservation-action-illustration__payment-lock {
  position: absolute;
  left: 50%;
  top: 54%;
  width: 18px;
  height: 13px;
  border-radius: 5px;
  background: #ffffff;
  transform: translate(-50%, -50%);
}

.reservation-action-illustration__payment-lock::before {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 10px;
  width: 10px;
  height: 9px;
  border: 2px solid #ffffff;
  border-bottom: 0;
  border-radius: 999px 999px 0 0;
  transform: translateX(-50%);
}

.reservation-action-illustration__spark {
  position: absolute;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background:
    linear-gradient(90deg, transparent 45%, rgba(255, 196, 79, 0.95) 45%, rgba(255, 196, 79, 0.95) 55%, transparent 55%),
    linear-gradient(0deg, transparent 45%, rgba(255, 196, 79, 0.95) 45%, rgba(255, 196, 79, 0.95) 55%, transparent 55%);
  opacity: 0.78;
}

.reservation-action-illustration__spark--one {
  right: 12px;
  top: 34px;
}

.reservation-action-illustration__spark--two {
  right: 66px;
  top: 18px;
  transform: scale(0.75);
}

.reservation-action-card__error,
.reservation-action-card__disabled-reason,
.reservation-action-card__estimated-time {
  text-align: center;
}

.reservation-action-card__error {
  color: #a13622;
  font-weight: 700;
}

.reservation-action-card__disabled-reason {
  color: #7b6f60;
  font-size: 0.93rem;
  font-weight: 700;
}

.reservation-action-card__estimated-time {
  color: #6d665c;
  font-size: 0.95rem;
  font-weight: 700;
}

.reservation-action-card__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.9rem;
  width: 100%;
  min-height: 56px;
  border: 0;
  border-radius: 16px;
  padding: 0.8rem 1.2rem;
  font-size: 0.96rem;
  font-weight: 900;
  letter-spacing: 0.01em;
  color: #ffffff;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease;
}

.reservation-action-card__button,
.reservation-action-card__button span {
  color: inherit;
}

.reservation-action-card__button--contract {
  background: linear-gradient(135deg, #07244b, #123869 62%, #0d2f5d);
  box-shadow: 0 14px 30px rgba(7, 36, 75, 0.2);
}

.reservation-action-card__button--contract:hover {
  background: linear-gradient(135deg, #061d3d, #0f3059 62%, #0b2850);
  box-shadow: 0 16px 34px rgba(7, 36, 75, 0.24);
}

.reservation-action-card__button--payment {
  background: linear-gradient(135deg, #cd7b00, #efa200 62%, #d88900);
  box-shadow: 0 14px 30px rgba(205, 123, 0, 0.24);
}

.reservation-action-card__button--payment:hover {
  background: linear-gradient(135deg, #b06a00, #d18d00 62%, #be7700);
  box-shadow: 0 16px 34px rgba(205, 123, 0, 0.28);
}

.reservation-action-card__button--flight,
.reservation-action-card__button--concierge,
.reservation-action-card__button--default {
  background: linear-gradient(135deg, #07244b, #123869 62%, #0d2f5d);
  box-shadow: 0 14px 30px rgba(7, 36, 75, 0.2);
}

.reservation-action-card__button--flight:hover,
.reservation-action-card__button--concierge:hover,
.reservation-action-card__button--default:hover {
  background: linear-gradient(135deg, #061d3d, #0f3059 62%, #0b2850);
  box-shadow: 0 16px 34px rgba(7, 36, 75, 0.24);
}

.reservation-action-card__button:focus-visible {
  outline: 3px solid rgba(20, 35, 62, 0.18);
  outline-offset: 3px;
}

.reservation-action-card__button:hover {
  transform: translateY(-1px);
}

.reservation-action-card__button:disabled {
  cursor: not-allowed;
  opacity: 0.88;
  transform: none;
}

.reservation-action-card__button--loading,
.reservation-action-card__button--loading:hover {
  transform: none;
}

.reservation-action-card__button-icon,
.reservation-action-card__button-arrow {
  color: inherit;
  font-size: 1.05rem;
}

.reservation-action-card__button-arrow {
  margin-left: auto;
}

.reservation-action-card__spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid rgba(255, 255, 255, 0.28);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: reservation-action-spin 0.8s linear infinite;
}

@keyframes reservation-action-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 900px) {
  .reservation-action-card__content {
    grid-template-columns: 1fr;
  }

  .reservation-action-card__illustration {
    justify-items: center;
  }
}
</style>
