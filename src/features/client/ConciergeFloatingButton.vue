<script setup>
defineEmits(['open'])
</script>

<template>
  <button class="floating-concierge" type="button" @click="$emit('open')">
    Concierge Ejecutivo 24/7
  </button>
</template>

<style scoped>
.floating-concierge {
  position: fixed;
  right: clamp(1rem, 3vw, 2rem);
  bottom: clamp(1rem, 3vw, 2rem);
  z-index: 30;
  width: auto;
  min-height: 3.1rem;
  border: 1px solid rgba(191, 151, 65, 0.42);
  border-radius: 999px;
  padding: 0 1.2rem;
  background: linear-gradient(135deg, #111111, #2d2920);
  color: #ffffff;
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.24);
  font-weight: 800;
  cursor: pointer;
}


@media (max-width: 720px) {
  .floating-concierge {
    right: 0.7rem;
    bottom: 3.25rem;
    min-width: 2.2rem;
    min-height: 2.2rem;
    padding: 0;
    border-radius: 999px;
    font-size: 0;
    box-shadow: 0 10px 22px rgba(0, 0, 0, 0.16);
  }

  .floating-concierge::before {
    content: 'VIP';
    font-size: 1rem;
    line-height: 1;
  }
}
</style>
