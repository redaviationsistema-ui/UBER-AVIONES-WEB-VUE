<script setup>
/* eslint-disable vue/no-mutating-props */
defineProps({
  filters: { type: Object, required: true },
  statusOptions: { type: Array, required: true },
  baseOptions: { type: Array, required: true },
  providerOptions: { type: Array, required: true },
})
</script>

<template>
  <article class="surface filters-card">
    <label class="field field--search">
      <span>Buscar sobrecargo / proveedor / base</span>
      <input v-model="filters.searchTerm" type="text" placeholder="Nombre, proveedor o base" />
    </label>

    <label class="field">
      <span>Estado</span>
      <select v-model="filters.statusFilter">
        <option v-for="option in statusOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
    </label>

    <label class="field">
      <span>Base</span>
      <select v-model="filters.baseFilter">
        <option value="all">Todas</option>
        <option v-for="base in baseOptions.slice(1)" :key="base" :value="base">{{ base }}</option>
      </select>
    </label>

    <label class="field">
      <span>Proveedor</span>
      <select v-model="filters.providerFilter">
        <option value="all">Todos</option>
        <option v-for="provider in providerOptions.slice(1)" :key="provider" :value="provider">{{ provider }}</option>
      </select>
    </label>

    <label class="field">
      <span>Certificacion</span>
      <select v-model="filters.certificationFilter">
        <option value="all">Todas</option>
        <option value="complete">Completas</option>
        <option value="incomplete">Incompletas</option>
        <option value="expired">Vencidas</option>
      </select>
    </label>

    <label class="field">
      <span>Disponibilidad</span>
      <select v-model="filters.availabilityFilter">
        <option value="all">Todas</option>
        <option value="available">Disponibles hoy</option>
        <option value="assigned">Asignadas a vuelo</option>
        <option value="unavailable">No disponibles</option>
      </select>
    </label>
  </article>
</template>

<style scoped>
.filters-card {
  padding: 1.2rem;
  border-radius: 24px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.9);
  display: grid;
  gap: 0.9rem;
  grid-template-columns: 1.5fr repeat(5, minmax(0, 1fr));
}

.field {
  display: grid;
  gap: 0.4rem;
}

.field input,
.field select {
  width: 100%;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  padding: 0.85rem 0.95rem;
  background: rgba(248, 250, 252, 0.95);
  color: #0f172a;
}

@media (max-width: 1100px) {
  .filters-card {
    grid-template-columns: 1fr;
  }
}
</style>
