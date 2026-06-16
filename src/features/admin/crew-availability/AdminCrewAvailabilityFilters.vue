<script setup>
/* eslint-disable vue/no-mutating-props */
defineProps({
  filters: { type: Object, required: true },
  baseOptions: { type: Array, required: true },
  stateOptions: { type: Array, default: () => [] },
})
</script>

<template>
  <article class="surface filters-card">
    <label class="field">
      <span>Fecha desde</span>
      <input v-model="filters.from" type="date" />
    </label>
    <label class="field">
      <span>Fecha hasta</span>
      <input v-model="filters.to" type="date" />
    </label>
    <label class="field">
      <span>Base</span>
      <select v-model="filters.base">
        <option value="all">Todas</option>
        <option v-for="base in baseOptions.slice(1)" :key="base" :value="base">{{ base }}</option>
      </select>
    </label>
    <label class="field">
      <span>Estado</span>
      <select v-model="filters.state">
        <option value="all">Todos</option>
        <option v-for="option in stateOptions" :key="option.value" :value="option.label">{{ option.label }}</option>
      </select>
    </label>
    <label class="field field--search">
      <span>Buscar sobrecargo</span>
      <input v-model="filters.search" type="search" placeholder="Nombre, base o proveedor" />
    </label>
  </article>
</template>

<style scoped>
.filters-card {
  color: #000;
  display: grid;
  gap: 0.9rem;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  padding: 1.4rem;
  border-radius: 28px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.98), rgba(241, 245, 249, 0.96));
}

.field {
  display: grid;
  gap: 0.45rem;
}

.field span {
  color: #000;
  font-weight: 700;
}

.field input,
.field select {
  width: 100%;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(255, 255, 255, 0.92);
  color: #000;
  padding: 0.85rem 0.95rem;
}

@media (max-width: 1100px) {
  .filters-card {
    grid-template-columns: 1fr;
  }
}
</style>
