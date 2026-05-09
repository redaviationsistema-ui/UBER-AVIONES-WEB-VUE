<script setup>
defineProps({
  cards: { type: Array, required: true },
})
</script>

<template>
  <section class="membership-status-bar" aria-label="Estado de membresia">
    <article v-for="[label, value] in cards" :key="label">
      <span>{{ label }}</span>
      <strong>{{ value }}</strong>
    </article>
  </section>
</template>

<style scoped>
.membership-status-bar {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.membership-status-bar article {
  display: grid;
  gap: 0.25rem;
  min-height: 4.6rem;
  padding: 0.9rem 1rem;
  border: 1px solid #e5e1d8;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.82);
}

.membership-status-bar span {
  color: #8b6a24;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.membership-status-bar strong {
  line-height: 1.25;
}

@media (max-width: 760px) {
  .membership-status-bar {
    grid-template-columns: 1fr;
  }
}
</style>
