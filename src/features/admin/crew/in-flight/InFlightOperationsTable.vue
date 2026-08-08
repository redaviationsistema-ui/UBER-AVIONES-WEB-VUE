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

<style scoped>
.table-shell {
  display: grid;
  gap: 1rem;
  padding: 1.1rem;
  border-radius: 30px;
  border: 1px solid rgba(196, 209, 232, 0.55);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.97), rgba(244, 248, 255, 0.94));
  box-shadow: 0 28px 50px rgba(30, 55, 90, 0.09);
}

.table-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.table-head .eyebrow {
  margin: 0 0 0.25rem;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #c6922b;
}

.table-head h4 {
  margin: 0;
  font-size: clamp(1.25rem, 1.8vw, 1.55rem);
  color: #10233d;
}

.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.25rem;
  padding: 0.3rem 0.85rem;
  border-radius: 999px;
  font-weight: 800;
}

.badge-muted {
  border: 1px solid rgba(160, 182, 219, 0.35);
  background: rgba(236, 243, 255, 0.9);
  color: #365787;
}

.table-wrap {
  overflow: auto;
}

.queue-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0 0.75rem;
}

.queue-table th {
  padding: 0 0.65rem 0.4rem;
  text-align: left;
  font-size: 0.8rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #5b7397;
}

.queue-table td {
  padding: 1rem 0.65rem;
  vertical-align: top;
  background: rgba(255, 255, 255, 0.94);
  color: #132844;
  border-top: 1px solid rgba(210, 222, 243, 0.8);
  border-bottom: 1px solid rgba(210, 222, 243, 0.8);
}

.queue-table td:first-child {
  border-left: 1px solid rgba(210, 222, 243, 0.8);
  border-radius: 18px 0 0 18px;
}

.queue-table td:last-child {
  border-right: 1px solid rgba(210, 222, 243, 0.8);
  border-radius: 0 18px 18px 0;
}

.queue-table tbody tr {
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.queue-table tbody tr:hover td,
.queue-table tbody tr.is-selected td {
  background: linear-gradient(180deg, rgba(248, 251, 255, 0.98), rgba(239, 245, 255, 0.96));
}

.queue-table tbody tr:hover {
  transform: translateY(-1px);
}

.queue-table tbody tr.is-selected td {
  border-color: rgba(112, 149, 215, 0.45);
  box-shadow: inset 0 0 0 1px rgba(112, 149, 215, 0.12);
}

.table-primary {
  display: grid;
  gap: 0.22rem;
}

.table-primary strong {
  font-size: 1.02rem;
  color: #10233d;
}

.table-primary small {
  color: #667d9f;
}

.ghost-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.6rem 0.9rem;
  border-radius: 999px;
  border: 1px solid rgba(110, 148, 214, 0.3);
  background: rgba(239, 246, 255, 0.92);
  color: #2b558d;
  font-weight: 800;
  cursor: pointer;
  transition: transform 0.18s ease, background 0.18s ease, border-color 0.18s ease;
}

.ghost-button:hover {
  transform: translateY(-1px);
  background: rgba(226, 238, 255, 0.98);
  border-color: rgba(84, 126, 202, 0.45);
}

.empty-state {
  margin: 0;
  padding: 2.7rem 1.2rem;
  border-radius: 24px;
  border: 1px dashed rgba(173, 191, 222, 0.75);
  background:
    radial-gradient(circle at top, rgba(238, 245, 255, 0.8), transparent 56%),
    rgba(250, 252, 255, 0.95);
  text-align: center;
  font-size: 1rem;
  color: #516887;
}

@media (max-width: 820px) {
  .table-shell {
    padding: 0.95rem;
    border-radius: 24px;
  }

  .table-head {
    flex-direction: column;
  }
}
</style>
