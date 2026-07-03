/*----------------------------------------------------------------------------------------------*/
// VISTA DE SECCION DE FLOTA DEL PORTAL DE OPERADOR
/*----------------------------------------------------------------------------------------------*/
<script setup>
defineProps({
  fleet: { type: Array, required: true },
  loading: { type: Boolean, default: false },
})
</script>

<template>
  <section class="surface fleet-card">
    <h3>Gestion de flota</h3>
    <div v-for="item in fleet" :key="item.id" class="fleet-row">
      <span>#{{ item.id }}</span>
      <strong>{{ item.model }}</strong>
      <span class="badge" :class="{ success: item.status === 'active' }">{{ item.status }}</span>
    </div>
    <p v-if="loading" class="muted">Cargando flota desde API...</p>
  </section>
</template>

<style scoped>
.fleet-card { padding:1rem; }
.fleet-row { display:grid; grid-template-columns:0.4fr 1fr auto; gap:0.75rem; align-items:center; padding:0.75rem 0; border-top:1px solid rgba(255,255,255,0.08); }
</style>
