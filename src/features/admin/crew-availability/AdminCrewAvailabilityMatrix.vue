<script setup>
import { computed } from 'vue'
import { normalizeState, toneClass } from './crewAvailabilityShared'

const props = defineProps({
  weeklyDays: { type: Array, required: true },
  filteredCrew: { type: Array, required: true },
  resolveMemberStateForDay: { type: Function, required: true },
  statusOptions: { type: Array, default: () => [] },
})

defineEmits(['select-cell'])

const colorMap = computed(() =>
  Object.fromEntries(
    (Array.isArray(props.statusOptions) ? props.statusOptions : []).map((item) => [
      normalizeState(item.clave || item.value || item.status || item.id),
      item.color || '',
    ]),
  ),
)

function resolvePillStyle(state = '') {
  const color = colorMap.value[normalizeState(state)]
  if (!color) return {}
  return {
    background: `${color}22`,
    boxShadow: `inset 0 0 0 1px ${color}55`,
  }
}
</script>

<template>
  <article class="surface matrix-card">
    <div class="table-head">
      <div>
        <span class="eyebrow">Disponibilidad semanal</span>
        <h4>Matriz operativa</h4>
      </div>
      <span class="badge badge-muted">{{ filteredCrew.length }} sobrecargos</span>
    </div>

    <div class="table-wrap">
      <table class="availability-table">
        <thead>
          <tr>
            <th>Sobrecargo</th>
            <th>Base</th>
            <th v-for="day in weeklyDays" :key="day.key">{{ day.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="member in filteredCrew" :key="member.id">
            <td>
              <div class="table-primary">
                <strong>{{ member.name }}</strong>
                <small>{{ member.providerName || 'Sin proveedor' }}</small>
              </div>
            </td>
            <td>{{ member.base || 'Sin base' }}</td>
            <td v-for="day in weeklyDays" :key="`${member.id}-${day.key}`">
              <button
                type="button"
                class="matrix-pill"
                :class="toneClass(resolveMemberStateForDay(member, day.key).state)"
                :style="resolvePillStyle(resolveMemberStateForDay(member, day.key).state)"
                @click="$emit('select-cell', member, day.key)"
              >
                {{ resolveMemberStateForDay(member, day.key).state }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="!filteredCrew.length" class="empty-state">
      No hay registros de disponibilidad para el periodo seleccionado. Puedes filtrar otro rango o registrar disponibilidad manualmente.
    </p>
  </article>
</template>

<style scoped>
.matrix-card {
  color: #000;
  padding: 1.4rem;
  border-radius: 28px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.98), rgba(241, 245, 249, 0.96));
}

.eyebrow {
  color: #c88412;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h4 {
  margin: 0.25rem 0 0;
  color: #000;
}

.table-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.table-wrap {
  overflow-x: auto;
}

.availability-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0 0.65rem;
}

.availability-table th {
  text-align: left;
  color: #000;
  font-size: 0.82rem;
  font-weight: 700;
}

.availability-table td {
  padding: 0.25rem 0;
  color: #000;
}

.table-primary {
  display: grid;
  gap: 0.15rem;
}

.table-primary strong,
.table-primary small,
.empty-state {
  color: #000;
}

.matrix-pill {
  width: 100%;
  border: 0;
  border-radius: 999px;
  padding: 0.72rem 0.8rem;
  font-size: 0.84rem;
  color: #000;
}

.tone-available {
  background: rgba(34, 197, 94, 0.18);
}

.tone-unavailable {
  background: rgba(239, 68, 68, 0.18);
}

.tone-rest {
  background: rgba(148, 163, 184, 0.2);
}

.tone-operation {
  background: rgba(59, 130, 246, 0.18);
}

.tone-pending {
  background: rgba(250, 204, 21, 0.24);
}

.tone-approved {
  background: rgba(168, 85, 247, 0.18);
}
</style>
