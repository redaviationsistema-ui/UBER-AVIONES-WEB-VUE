<script setup>
import { certificationTone, formatShortDate, toneClass } from './crewDirectoryShared'

defineProps({
  title: { type: String, required: true },
  eyebrow: { type: String, required: true },
  items: { type: Array, required: true },
  selectedCrewId: { type: [String, Number, null], default: null },
})

const emit = defineEmits(['select'])
</script>

<template>
  <article class="surface panel-card">
    <div class="panel-head">
      <div>
        <p class="eyebrow">{{ eyebrow }}</p>
        <h4>{{ title }}</h4>
      </div>
      <span class="badge badge-muted">{{ items.length }} registros</span>
    </div>

    <div class="table-wrap">
      <table class="queue-table">
        <thead>
          <tr>
            <th>Sobrecargo</th>
            <th>Proveedor</th>
            <th>Estado</th>
            <th>Certificaciones</th>
            <th>Rating</th>
            <th>Ultima revision</th>
            <th>Alertas</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="member in items"
            :key="member.id"
            :class="{ 'is-selected': member.id === selectedCrewId }"
            @click="$emit('select', member.id)"
          >
            <td>
              <div class="table-primary">
                <strong>{{ member.name }}</strong>
                <small>{{ member.base || 'Sin base' }}</small>
              </div>
            </td>
            <td>{{ member.providerName || 'Sin proveedor' }}</td>
            <td>
              <div class="status-stack-inline">
                <span v-if="member.validationState" class="status-chip" :class="toneClass(member.validationState)">
                  {{ member.validationState }}
                </span>
                <span v-if="member.operationalState" class="status-chip" :class="toneClass(member.operationalState)">
                  {{ member.operationalState }}
                </span>
              </div>
            </td>
            <td>
              <span v-if="member.certificationStatus" class="status-chip" :class="certificationTone(member.certificationStatus)">
                {{ member.certificationStatus }}
              </span>
            </td>
            <td>{{ member.rating || '' }}</td>
            <td>{{ formatShortDate(member.lastAudit) || '' }}</td>
            <td>
              <span v-if="member.alertsCount" class="mini-alert">{{ member.alertsCount }} alerta(s)</span>
              <span v-else class="muted-lite">Sin alertas</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="!items.length" class="empty-state">No hay sobrecargos para esta vista con los filtros actuales.</p>
  </article>
</template>

<style scoped>
.panel-card {
  color: #0f172a;
  padding: 1.3rem;
  border-radius: 24px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.92);
}

.eyebrow {
  color: #c88412;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h4 {
  margin: 0.25rem 0 0;
  color: #0f172a;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.table-wrap {
  overflow-x: auto;
}

.queue-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

.queue-table th,
.queue-table td {
  padding: 0.95rem 0.85rem;
  border-bottom: 1px solid rgba(226, 232, 240, 0.95);
  text-align: left;
}

.queue-table th {
  color: rgba(71, 85, 105, 0.95);
  font-weight: 700;
}

.queue-table td {
  color: rgba(15, 23, 42, 0.92);
}

.queue-table tbody tr {
  cursor: pointer;
}

.queue-table tbody tr.is-selected {
  background: linear-gradient(90deg, rgba(15, 23, 42, 0.08), rgba(59, 130, 246, 0.06));
}

.table-primary {
  display: grid;
  gap: 0.2rem;
}

.table-primary strong {
  color: #0f172a;
}

.table-primary small,
.muted-lite {
  color: rgba(71, 85, 105, 0.88);
}

.status-stack-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.mini-alert {
  color: #9a3412;
  font-weight: 700;
}
</style>
