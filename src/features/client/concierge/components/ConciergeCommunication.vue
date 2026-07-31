<script setup>
import ConciergeIcon from './ConciergeIcon.vue'

defineProps({
  communication: { type: Object, required: true },
})

defineEmits(['select'])
</script>

<template>
  <section class="concierge-section">
    <h4>{{ communication.title }}</h4>
    <div class="concierge-grid concierge-grid--communication">
      <button v-for="item in communication.options" :key="item.id" type="button" class="concierge-tile" @click="$emit('select', item)">
        <span class="concierge-tile__icon"><ConciergeIcon :name="item.icon" /></span>
        <strong>{{ item.title }}</strong>
        <small>{{ item.subtitle }}</small>
      </button>
    </div>
  </section>
</template>

<style scoped>
.concierge-section { display:grid; gap:1rem; }
.concierge-section h4 { margin:0; color:#fff; font-size:1.1rem; letter-spacing:.04em; }
.concierge-grid { display:grid; gap:.85rem; }
.concierge-grid--communication { grid-template-columns:repeat(2,minmax(0,1fr)); }
.concierge-tile { display:grid; gap:.55rem; align-content:start; min-height:7.75rem; padding:1rem; border-radius:20px; border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.05); color:#fff; text-align:left; box-shadow:0 16px 34px rgba(5,12,24,.18); transition:transform .3s ease,border-color .3s ease,box-shadow .3s ease,background .3s ease; }
.concierge-tile:hover { transform:translateY(-2px); border-color:rgba(201,161,59,.5); background:rgba(255,255,255,.08); box-shadow:0 22px 40px rgba(5,12,24,.28); }
.concierge-tile__icon { display:grid; place-items:center; width:2.8rem; height:2.8rem; border-radius:16px; color:#c9a13b; background:rgba(201,161,59,.1); }
.concierge-tile__icon :deep(svg) { width:1.35rem; height:1.35rem; }
.concierge-tile strong { font-size:1rem; }
.concierge-tile small { color:rgba(255,255,255,.68); font-size:.88rem; }
@media (max-width: 640px) { .concierge-grid--communication { grid-template-columns:1fr 1fr; } }
</style>
