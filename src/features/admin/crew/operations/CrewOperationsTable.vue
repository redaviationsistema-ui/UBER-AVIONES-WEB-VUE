<script setup>
defineProps({
  operations: { type: Array, default: () => [] },
  selectedOperationId: { type: [String, Number, null], default: null },
  operationDisplayClient: { type: Function, required: true },
  operationDisplayCrew: { type: Function, required: true },
  operationCrewStateLabel: { type: Function, required: true },
  operationAssignmentBadgeLabel: { type: Function, required: true },
  operationDisplayState: { type: Function, required: true },
  formatDateTime: { type: Function, required: true },
})

defineEmits(['select', 'open-detail'])

function clientInitials(value) {
  const segments = String(value || 'Cliente')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)

  return segments.map((segment) => segment[0]).join('').toUpperCase() || 'CL'
}
</script>

<template>
  <div class="table-shell">
    <div class="table-head">
      <div>
        <p class="eyebrow">Operacion por vuelo</p>
        <h4>Asignacion y seguimiento de sobrecargos</h4>
      </div>
      <span class="badge badge-muted">{{ operations.length }} vuelos</span>
    </div>

    <div class="table-wrap">
      <table class="queue-table queue-table--ops">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Ruta</th>
            <th>Fecha</th>
            <th>Aeronave</th>
            <th>Sobrecargo</th>
            <th>Estado</th>
            <th>Asignacion</th>
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
              <div class="client-cell">
                <div class="client-avatar" aria-hidden="true">{{ clientInitials(operationDisplayClient(operation)) }}</div>
                <div class="table-primary">
                  <strong>{{ operation.folio || `RA-${operation.id}` }}</strong>
                  <small>Cliente</small>
                  <span>{{ operationDisplayClient(operation) }}</span>
                </div>
              </div>
            </td>
            <td>
              <div class="stack-cell">
                <strong>{{ operation.route }}</strong>
                <small>{{ operation.origin || 'Origen' }} a {{ operation.destination || 'Destino' }}</small>
              </div>
            </td>
            <td>
              <div class="stack-cell">
                <strong>{{ formatDateTime(operation.departure) }}</strong>
                <small>Salida programada</small>
              </div>
            </td>
            <td><span class="inline-badge inline-badge--aircraft">{{ operation.aircraft || 'Aeronave por definir' }}</span></td>
            <td>
              <div class="stack-cell">
                <strong>{{ operationDisplayCrew(operation) }}</strong>
                <small>{{ operationCrewStateLabel(operation) }}</small>
              </div>
            </td>
            <td><span class="inline-badge inline-badge--state">{{ operationDisplayState(operation) }}</span></td>
            <td><span class="inline-badge inline-badge--assignment">{{ operationAssignmentBadgeLabel(operation) }}</span></td>
            <td @click.stop>
              <button
                type="button"
                class="detail-link"
                :aria-label="`Ver detalle de ${operation.folio || `RA-${operation.id}`}`"
                @click="$emit('open-detail', operation.id)"
              >
                Ver detalle <span aria-hidden="true">→</span>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="!operations.length" class="empty-state">
      No hay vuelos operativos para mostrar con los filtros actuales.
    </p>
  </div>
</template>

<style scoped>
.table-shell {
  display: grid;
  gap: 0.9rem;
  padding: 0.95rem 0.95rem 0.8rem;
  border-radius: 20px;
  border: 1px solid rgba(155, 176, 212, 0.22);
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 22px 44px rgba(17, 34, 68, 0.07);
}

.table-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.15rem 0.2rem 0;
}

.table-head .eyebrow {
  margin: 0 0 0.2rem;
  font-size: 0.73rem;
  letter-spacing: 0.08em;
}

.table-head h4 {
  margin: 0;
  font-size: 1.05rem;
  color: #10233d;
}

.table-wrap {
  overflow-x: auto;
}

.queue-table {
  width: 100%;
  min-width: 980px;
  border-collapse: separate;
  border-spacing: 0;
}

.queue-table th {
  padding: 0.9rem 0.8rem;
  border-bottom: 1px solid rgba(155, 176, 212, 0.2);
  text-align: left;
  font-size: 0.73rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6a81ab;
}

.queue-table td {
  padding: 0.95rem 0.8rem;
  border-bottom: 1px solid rgba(229, 236, 247, 0.95);
  vertical-align: middle;
  color: #152942;
}

.queue-table tbody tr {
  cursor: pointer;
  transition: background 0.18s ease;
}

.queue-table tbody tr:hover {
  background: rgba(246, 249, 255, 0.88);
}

.queue-table tbody tr.is-selected {
  background: rgba(234, 242, 255, 0.92);
  box-shadow: inset 3px 0 0 #1e4ed8;
}

.client-cell {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  align-items: center;
  gap: 0.75rem;
}

.client-avatar {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(30, 78, 216, 0.12), rgba(212, 175, 55, 0.18));
  color: #1e4ed8;
  font-size: 0.8rem;
  font-weight: 800;
}

.table-primary,
.stack-cell {
  display: grid;
  gap: 0.18rem;
}

.table-primary strong,
.stack-cell strong {
  font-size: 0.94rem;
  color: #103055;
}

.table-primary small,
.stack-cell small {
  font-size: 0.75rem;
  color: #7b8ca9;
}

.table-primary span {
  font-size: 0.85rem;
  color: #233b5d;
}

.inline-badge {
  display: inline-flex;
  align-items: center;
  min-height: 1.9rem;
  padding: 0.3rem 0.75rem;
  border-radius: 999px;
  font-size: 0.77rem;
  font-weight: 700;
  white-space: nowrap;
}

.inline-badge--aircraft {
  background: rgba(148, 163, 184, 0.14);
  color: #445878;
}

.inline-badge--state {
  background: rgba(16, 185, 129, 0.12);
  color: #0f8e65;
}

.inline-badge--assignment {
  background: rgba(30, 78, 216, 0.1);
  color: #1e4ed8;
}

.detail-link {
  border: 0;
  background: transparent;
  padding: 0;
  color: #1e4ed8;
  font-size: 0.85rem;
  font-weight: 800;
  cursor: pointer;
  transition: color 0.18s ease, transform 0.18s ease;
}

.detail-link:hover {
  color: #173ca7;
  transform: translateX(1px);
}

.detail-link:focus-visible {
  outline: 3px solid rgba(30, 78, 216, 0.18);
  outline-offset: 4px;
  border-radius: 8px;
}

.empty-state {
  margin: 0;
  padding: 1rem 0.2rem 0.1rem;
  color: #6b7a93;
}

@media (max-width: 720px) {
  .table-shell {
    padding: 0.9rem;
  }
}
</style>
