<script setup>
defineProps({
  cards: { type: Array, default: () => [] },
})
</script>

<template>
  <section class="status-strip">
    <article v-for="item in cards" :key="item.label" class="signal-card">
      <span>{{ item.label }}</span>
      <strong>{{ item.value }}</strong>
      <p>{{ item.detail }}</p>
    </article>
  </section>
</template>
