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
  gap: 0.55rem;
}

.action-button {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.95rem;
  align-items: center;
  width: 100%;
  min-height: 3.85rem;
  padding: 0.95rem 1.2rem;
  border: 0;
  border-radius: 18px;
  background: linear-gradient(135deg, #102b4d 0%, #173d68 100%);
  color: #ffffff;
  box-shadow: 0 24px 48px rgba(16, 43, 77, 0.3);
  transition:
    transform 160ms ease,
    box-shadow 160ms ease,
    opacity 160ms ease;
}

.action-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 28px 56px rgba(16, 43, 77, 0.34);
}

.action-button:disabled {
  cursor: not-allowed;
  opacity: 1;
  background: linear-gradient(135deg, #17385f 0%, #214a7b 100%);
  box-shadow: 0 20px 42px rgba(16, 43, 77, 0.24);
}

.action-button__icon,
.action-button__spinner {
  display: grid;
  place-items: center;
  width: 2.3rem;
  height: 2.3rem;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.14);
}

.action-button__spinner {
  border: 3px solid rgba(255, 255, 255, 0.25);
  border-top-color: #ffffff;
  animation: spin 0.85s linear infinite;
}

.action-button__copy {
  display: block;
  justify-items: start;
}

.action-button__copy strong {
  color: #ffffff;
}

.action-button__copy strong {
  font-size: 1rem;
  line-height: 1.2;
}

.action-shell__status {
  margin: 0;
  color: #667085;
  font-size: 0.84rem;
  text-align: left;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
