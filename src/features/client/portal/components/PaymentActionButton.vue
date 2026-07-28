<script setup>
defineProps({
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  statusLabel: { type: String, default: '' },
  title: { type: String, default: 'Activar acceso comercial' },
})

defineEmits(['click'])
</script>

<template>
  <div class="action-shell">
    <button
      class="action-button"
      :class="{ 'action-button--loading': loading }"
      type="button"
      :disabled="disabled"
      @click="$emit('click')"
    >
      <span v-if="loading" class="action-button__spinner" aria-hidden="true"></span>
      <span v-else class="action-button__icon" aria-hidden="true">→</span>

      <span class="action-button__copy">
        <strong>{{ loading ? 'Abriendo Stripe…' : title }}</strong>
      </span>
    </button>

    <p v-if="statusLabel" class="action-shell__status">{{ statusLabel }}</p>
  </div>
</template>

<style scoped>
.action-shell {
  display: grid;
  gap: 8px;
}

.action-button {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  width: 100%;
  min-height: 48px;
  padding: 0 18px 0 20px;
  border: 0;
  border-radius: 14px;
  background: #173a6a;
  color: #ffffff;
  box-shadow: 0 10px 24px rgba(23, 58, 106, 0.18);
  transition:
    background-color 0.25s ease,
    box-shadow 0.25s ease,
    opacity 0.25s ease;
}

.action-button:hover:not(:disabled) {
  background: #214d8f;
  box-shadow: 0 12px 26px rgba(23, 58, 106, 0.22);
}

.action-button:disabled {
  cursor: not-allowed;
  opacity: 0.88;
  background: #284c79;
  box-shadow: 0 8px 18px rgba(23, 58, 106, 0.16);
}

.action-button__icon,
.action-button__spinner {
  display: grid;
  place-items: center;
  grid-column: 2;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 999px;
}

.action-button__spinner {
  border: 2px solid rgba(255, 255, 255, 0.25);
  border-top-color: #ffffff;
  animation: spin 0.85s linear infinite;
}

.action-button__copy {
  display: block;
  grid-column: 1;
  text-align: center;
}

.action-button__copy strong {
  color: #ffffff;
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.2;
}

.action-shell__status {
  margin: 0;
  color: #64748b;
  font-size: 0.8125rem;
  text-align: center;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
