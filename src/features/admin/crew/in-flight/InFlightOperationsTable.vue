<script setup>
defineProps({
  operations: { type: Array, default: () => [] },
  selectedOperationId: { type: [String, Number, null], default: null },
  operationDisplayClient: { type: Function, required: true },
  operationDisplayCrew: { type: Function, required: true },
  operationDisplayState: { type: Function, required: true },
  formatDateTime: { type: Function, required: true },
})

defineEmits(['select', 'open-detail'])
</script>

<template>
  <div class="table-shell">
    <div class="table-head">
      <div>
        <p class="eyebrow">Seguimiento activo</p>
        <h4>Sobrecargos actualmente en vuelo</h4>
      </div>
      <span class="badge badge-muted">{{ operations.length }} vuelos</span>
    </div>

    <div class="table-wrap">
      <table class="queue-table queue-table--ops">
        <thead>
          <tr>
            <th>Vuelo</th>
            <th>Fecha</th>
            <th>Aeronave</th>
            <th>Sobrecargo</th>
            <th>Estado</th>
            <th>Accion</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="operation in operations"
            :key="operation.id"
            :class="{ 'is-selected': operation.id === selectedOperationId }"
            @click="$emit('select', operation.id)"
          >
            <td>
              <div class="table-primary">
                <strong>{{ operation.folio || `RA-${operation.id}` }}</strong>
                <small>{{ operation.route }}</small>
                <small>{{ operationDisplayClient(operation) }}</small>
              </div>
            </td>
            <td>{{ formatDateTime(operation.departure) }}</td>
            <td>{{ operation.aircraft || 'Aeronave por definir' }}</td>
            <td>{{ operationDisplayCrew(operation) }}</td>
            <td>{{ operationDisplayState(operation) }}</td>
            <td @click.stop>
              <button type="button" class="ghost-button ghost-button--sm" @click="$emit('open-detail', operation.id)">
                Ver seguimiento
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="!operations.length" class="empty-state">
      No hay sobrecargos en vuelo para mostrar con los filtros actuales.
    </p>
  </div>
</template>
