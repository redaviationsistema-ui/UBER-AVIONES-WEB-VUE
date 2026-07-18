<script setup>
const props = defineProps({
  searchQuery: { type: String, default: '' },
  stateFilter: { type: String, default: 'all' },
  stageFilter: { type: String, default: 'all' },
  workflowOptions: { type: Array, default: () => [] },
  isRefreshing: { type: Boolean, default: false },
})

const emit = defineEmits(['update:search-query', 'update:state-filter', 'update:stage-filter', 'refresh'])
</script>

<template>
  <div class="reservation-filters">
    <label class="reservation-filters__search">
      <span aria-hidden="true">🔍</span>
      <input
        :value="searchQuery"
        type="text"
        placeholder="Buscar..."
        @input="emit('update:search-query', $event.target.value)"
      />
    </label>

    <select
      :value="stateFilter"
      class="reservation-filters__select"
      @change="emit('update:state-filter', $event.target.value)"
    >
      <option value="all">Estado</option>
      <option value="active">Activa</option>
      <option value="delayed">Retrasada</option>
      <option value="blocked">Bloqueada</option>
    </select>

    <select
      :value="stageFilter"
      class="reservation-filters__select"
      @change="emit('update:stage-filter', $event.target.value)"
    >
      <option value="all">Etapa</option>
      <option v-for="option in workflowOptions" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>

    <button type="button" class="reservation-filters__refresh" :disabled="isRefreshing" @click="emit('refresh')">
      {{ isRefreshing ? 'Actualizando...' : 'Actualizar' }}
    </button>
  </div>
</template>

<style scoped>
.reservation-filters {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) 180px 180px auto;
  gap: 0.75rem;
  align-items: center;
}

.reservation-filters__search,
.reservation-filters__select,
.reservation-filters__refresh {
  min-height: 3rem;
  border: 1px solid #dfe5ef;
  border-radius: 14px;
  background: #ffffff;
  font: inherit;
}

.reservation-filters__search {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0 0.9rem;
}

.reservation-filters__search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  font: inherit;
}

.reservation-filters__select {
  padding: 0 0.9rem;
  color: #111111;
}

.reservation-filters__refresh {
  padding: 0 1rem;
  color: #2759df;
  cursor: pointer;
}

@media (max-width: 980px) {
  .reservation-filters {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 720px) {
  .reservation-filters {
    grid-template-columns: 1fr;
  }
}
</style>
