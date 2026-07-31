<script setup>
import ConciergeIcon from './ConciergeIcon.vue'

defineProps({
  header: { type: Object, required: true },
  closeLabel: { type: String, required: true },
})

defineEmits(['close'])
</script>

<template>
  <header class="concierge-header">
    <div class="concierge-header__badge">
      <span class="concierge-header__icon">
        <ConciergeIcon :name="header.icon" />
      </span>
      <div class="concierge-header__copy">
        <span>{{ header.badge }}</span>
        <p>{{ header.subtitle }}</p>
      </div>
    </div>

    <button class="concierge-header__close" type="button" :aria-label="closeLabel" @click="$emit('close')">
      <ConciergeIcon name="close" />
    </button>
  </header>
</template>

<style scoped>
.concierge-header { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; }
.concierge-header__badge { display:flex; align-items:center; gap:1rem; }
.concierge-header__icon { display:grid; place-items:center; width:3.75rem; height:3.75rem; border-radius:999px; background:rgba(201,161,59,.16); color:#c9a13b; border:1px solid rgba(201,161,59,.24); }
.concierge-header__icon :deep(svg) { width:1.7rem; height:1.7rem; }
.concierge-header__copy span { display:block; color:#c9a13b; font-size:1.35rem; font-weight:800; letter-spacing:.08em; }
.concierge-header__copy p { margin:.2rem 0 0; color:rgba(255,255,255,.86); font-size:1rem; }
.concierge-header__close { display:grid; place-items:center; width:2.75rem; height:2.75rem; border-radius:999px; border:1px solid rgba(255,255,255,.14); background:transparent; color:#fff; }
.concierge-header__close :deep(svg) { width:1.15rem; height:1.15rem; }
</style>
