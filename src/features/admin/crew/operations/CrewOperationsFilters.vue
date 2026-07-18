<script setup>
defineProps({
  searchTerm: { type: String, default: '' },
  operationStatusFilter: { type: String, default: 'all' },
  assignmentFilter: { type: String, default: 'all' },
  baseFilter: { type: String, default: 'all' },
  providerFilter: { type: String, default: 'all' },
  statusOptions: { type: Array, default: () => [] },
  baseOptions: { type: Array, default: () => [] },
  providerOptions: { type: Array, default: () => [] },
})

defineEmits([
  'update:searchTerm',
  'update:operationStatusFilter',
  'update:assignmentFilter',
  'update:baseFilter',
  'update:providerFilter',
])
</script>

<template>
  <div class="filters-shell">
    <label class="field field--search">
      <span>Buscar vuelo / cliente / sobrecargo</span>
      <div class="field__control">
        <input
          :value="searchTerm"
          type="text"
          placeholder="Folio, ruta, cliente, sobrecargo o aeronave"
          aria-label="Buscar vuelo, cliente, sobrecargo o aeronave"
          @input="$emit('update:searchTerm', $event.target.value)"
        />
        <span class="field__icon" aria-hidden="true">⌕</span>
      </div>
    </label>

    <label class="field">
      <span>Estado</span>
      <select :value="operationStatusFilter" @change="$emit('update:operationStatusFilter', $event.target.value)">
        <option v-for="option in statusOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </label>

    <label class="field">
      <span>Asignacion</span>
      <select :value="assignmentFilter" @change="$emit('update:assignmentFilter', $event.target.value)">
        <option value="all">Todas</option>
        <option value="assigned">Con sobrecargo</option>
        <option value="unassigned">Sin asignar</option>
      </select>
    </label>

    <label class="field">
      <span>Base</span>
      <select :value="baseFilter" @change="$emit('update:baseFilter', $event.target.value)">
        <option value="all">Todas</option>
        <option v-for="base in baseOptions.slice(1)" :key="base" :value="base">{{ base }}</option>
      </select>
    </label>

    <label class="field">
      <span>Proveedor</span>
      <select :value="providerFilter" @change="$emit('update:providerFilter', $event.target.value)">
        <option value="all">Todos</option>
        <option v-for="provider in providerOptions.slice(1)" :key="provider" :value="provider">
          {{ provider }}
        </option>
      </select>
    </label>
  </div>
</template>

<style scoped>
.filters-shell {
  display: grid;
  grid-template-columns: minmax(260px, 1.55fr) repeat(4, minmax(130px, 0.9fr));
  gap: 0.75rem;
  padding: 0.95rem 1rem;
  border-radius: 18px;
  border: 1px solid rgba(155, 176, 212, 0.22);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18px 34px rgba(17, 34, 68, 0.06);
}

.field {
  display: grid;
  gap: 0.35rem;
}

.field span {
  font-size: 0.76rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #5873a3;
}

.field input,
.field select,
.field__control {
  min-height: 46px;
}

.field input,
.field select {
  width: 100%;
  padding: 0 0.95rem;
  border-radius: 14px;
  border: 1px solid rgba(155, 176, 212, 0.34);
  background: #fff;
  font-size: 0.95rem;
  color: #152942;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}

.field input::placeholder {
  color: #8a99b2;
}

.field input:focus-visible,
.field select:focus-visible {
  outline: none;
  border-color: rgba(30, 78, 216, 0.45);
  box-shadow: 0 0 0 4px rgba(30, 78, 216, 0.12);
}

.field__control {
  position: relative;
}

.field__control input {
  padding-right: 2.9rem;
}

.field__icon {
  position: absolute;
  top: 50%;
  right: 0.95rem;
  transform: translateY(-50%);
  font-size: 1rem;
  color: #6e84ad;
}

@media (max-width: 1120px) {
  .filters-shell {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .filters-shell {
    grid-template-columns: 1fr;
    padding: 0.9rem;
  }
}
</style>
