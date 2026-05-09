<script setup>
import { useUiStore } from '../stores/ui'

const ui = useUiStore()
</script>

<template>
  <div class="toast-stack">
    <article
      v-for="toast in ui.toasts"
      :key="toast.id"
      class="toast"
      :class="toast.tone"
      @click="ui.dismissToast(toast.id)"
    >
      <strong>{{ toast.title }}</strong>
      <p>{{ toast.message }}</p>
    </article>
  </div>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 2400;
  display: grid;
  gap: 0.7rem;
  width: min(360px, calc(100vw - 2rem));
}

.toast {
  padding: 0.9rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  color: #f6f1e8;
  background: rgba(13, 18, 27, 0.96);
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.28);
}

.toast strong {
  display: block;
  margin-bottom: 0.2rem;
}

.toast p {
  margin: 0;
  color: #cfd5df;
}

.toast.success {
  border-color: rgba(101, 212, 160, 0.38);
}

.toast.error {
  border-color: rgba(255, 111, 105, 0.38);
}
</style>
