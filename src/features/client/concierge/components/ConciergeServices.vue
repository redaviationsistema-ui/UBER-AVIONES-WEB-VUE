<script setup>
import ConciergeIcon from './ConciergeIcon.vue'

defineProps({
  services: { type: Object, required: true },
})

defineEmits(['select'])
</script>

<template>
  <section class="concierge-section">
    <h4>{{ services.title }}</h4>
    <div class="concierge-grid concierge-grid--services">
      <button v-for="item in services.items" :key="item.id" type="button" class="concierge-service-card" @click="$emit('select', item)">
        <span class="concierge-service-card__icon"><ConciergeIcon :name="item.icon" /></span>
        <strong>{{ item.title }}</strong>
        <small>{{ item.subtitle }}</small>
      </button>
    </div>
  </section>
</template>

<style scoped>
.concierge-section { display:grid; gap:1rem; }
.concierge-section h4 { margin:0; color:#fff; font-size:1.1rem; letter-spacing:.04em; }
.concierge-grid--services { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.85rem; }
.concierge-service-card { display:grid; gap:.5rem; min-height:8.3rem; align-content:start; padding:1rem; border-radius:20px; border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.05); color:#fff; text-align:left; transition:transform .3s ease,border-color .3s ease,box-shadow .3s ease,background .3s ease; }
.concierge-service-card:hover { transform:translateY(-2px); border-color:rgba(201,161,59,.5); background:rgba(255,255,255,.08); box-shadow:0 20px 38px rgba(5,12,24,.26); }
.concierge-service-card__icon { display:grid; place-items:center; width:3rem; height:3rem; border-radius:18px; color:#c9a13b; background:rgba(201,161,59,.1); }
.concierge-service-card__icon :deep(svg) { width:1.45rem; height:1.45rem; }
.concierge-service-card small { color:rgba(255,255,255,.68); line-height:1.45; }
@media (max-width: 640px) { .concierge-grid--services { grid-template-columns:1fr 1fr; } }
</style>
