<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { api } from '../../lib/api'

const incidents = ref([])
const isLoading = ref(false)
const selectedIncidentId = ref(null)
const statusFilter = ref('all')
const priorityFilter = ref('all')
const providerFilter = ref('all')
const crewFilter = ref('all')
const searchQuery = ref('')
const updateDrafts = reactive({})

const statuses = ['open', 'in_review', 'resolved', 'closed']
const priorities = ['baja', 'media', 'alta', 'critica']
const labels = {
  catering: 'Catering',
  cabina: 'Cabina',
  cliente: 'Cliente',
  seguridad: 'Seguridad',
  horario: 'Horario',
  coordinacion: 'Coordinacion',
  otro: 'Otro',
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  critica: 'Critica',
  open: 'Abierta',
  in_review: 'En revision',
  resolved: 'Resuelta',
  closed: 'Cerrada',
}

const filteredIncidents = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()

  return incidents.value
    .filter((incident) => statusFilter.value === 'all' || incident.status === statusFilter.value)
    .filter((incident) => priorityFilter.value === 'all' || incident.priority === priorityFilter.value)
    .filter((incident) => providerFilter.value === 'all' || resolveProviderKey(incident) === providerFilter.value)
    .filter((incident) => crewFilter.value === 'all' || resolveCrewKey(incident) === crewFilter.value)
    .filter((incident) => {
      if (!query) return true
      return [
        incident.id,
        incident.crew_operation_id,
        incident.operation_route,
        incident.provider_name,
        incident.crew_id,
        incident.crew_name,
        labelFor(incident.category),
        labelFor(incident.priority),
        labelFor(incident.status),
        incident.description,
        incident.admin_response,
      ]
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
    .sort((left, right) => Number(right.id || 0) - Number(left.id || 0))
})

const providerOptions = computed(() =>
  [...new Map(
    incidents.value
      .map((incident) => {
        const key = resolveProviderKey(incident)
        return key ? [key, { key, label: resolveProviderLabel(incident) }] : null
      })
      .filter(Boolean),
  ).values()].sort((left, right) => left.label.localeCompare(right.label, 'es')),
)

const crewOptions = computed(() =>
  [...new Map(
    incidents.value
      .map((incident) => {
        const key = resolveCrewKey(incident)
        return key ? [key, { key, label: resolveCrewLabel(incident) }] : null
      })
      .filter(Boolean),
  ).values()].sort((left, right) => left.label.localeCompare(right.label, 'es')),
)

const selectedIncident = computed(
  () =>
    filteredIncidents.value.find((incident) => incident.id === selectedIncidentId.value) ||
    filteredIncidents.value[0] ||
    null,
)

const summary = computed(() => ({
  total: incidents.value.length,
  open: incidents.value.filter((item) => item.status === 'open').length,
  inReview: incidents.value.filter((item) => item.status === 'in_review').length,
  closed: incidents.value.filter((item) => item.status === 'closed').length,
}))

watch(
  filteredIncidents,
  (items) => {
    if (!items.length) {
      selectedIncidentId.value = null
      return
    }

    if (!items.some((incident) => incident.id === selectedIncidentId.value)) {
      selectedIncidentId.value = items[0].id
    }
  },
  { immediate: true },
)

function labelFor(value = '') {
  return labels[value] || value || 'Sin dato'
}

function resolveProviderKey(incident = {}) {
  return String(incident.provider_id || incident.provider_name || '')
    .trim()
    .toLowerCase()
}

function resolveProviderLabel(incident = {}) {
  return String(incident.provider_name || '').trim() || 'Proveedor por definir'
}

function resolveCrewKey(incident = {}) {
  return String(incident.crew_id || incident.crew_name || '')
    .trim()
    .toLowerCase()
}

function resolveCrewLabel(incident = {}) {
  return String(incident.crew_name || '').trim() || (incident.crew_id ? `Sobrecargo #${incident.crew_id}` : 'Sobrecargo por definir')
}

function filesLabel(incident = {}) {
  return (
    (incident.files || [])
      .map((file) => file.original_name || file.file_path)
      .filter(Boolean)
      .join(', ') || 'Sin evidencia'
  )
}

function draftFor(incident) {
  if (!incident) return { status: 'open', admin_response: '' }

  if (!updateDrafts[incident.id]) {
    updateDrafts[incident.id] = {
      status: incident.status || 'open',
      admin_response: incident.admin_response || '',
    }
  }

  return updateDrafts[incident.id]
}

async function fetchIncidents() {
  isLoading.value = true
  try {
    const response = await api.get('/crew-operation-incidents')
    incidents.value = response.incidents || response.data || []
  } finally {
    isLoading.value = false
  }
}

async function updateIncident(incident, status = '') {
  if (!incident) return
  const draft = draftFor(incident)
  const response = await api.put(`/crew-operation-incidents/${incident.id}`, {
    status: status || draft.status,
    admin_response: draft.admin_response,
  })
  const updated = response.incident
  incidents.value = incidents.value.map((item) => (item.id === updated.id ? updated : item))
  updateDrafts[incident.id] = {
    status: updated.status || 'open',
    admin_response: updated.admin_response || '',
  }
  selectedIncidentId.value = updated.id
}

onMounted(fetchIncidents)
</script>

<template>
  <section class="admin-incidents-page">
    <div class="page-head">
      <div>
        <span class="eyebrow">Incidencias</span>
        <h2>Incidencias de sobrecargo</h2>
        <p>Vista compacta para revisar varios reportes y responder sin perder contexto.</p>
      </div>
      <button type="button" class="ghost-button" @click="fetchIncidents">
        {{ isLoading ? 'Cargando' : 'Actualizar' }}
      </button>
    </div>

    <section class="summary-strip">
      <article>
        <span>Total</span>
        <strong>{{ summary.total }}</strong>
      </article>
      <article>
        <span>Abiertas</span>
        <strong>{{ summary.open }}</strong>
      </article>
      <article>
        <span>En revision</span>
        <strong>{{ summary.inReview }}</strong>
      </article>
      <article>
        <span>Cerradas</span>
        <strong>{{ summary.closed }}</strong>
      </article>
    </section>

    <section class="filters-bar">
      <label>
        <span>Buscar</span>
        <input v-model="searchQuery" type="search" placeholder="Operacion, sobrecargo, categoria..." />
      </label>
      <label>
        <span>Estado</span>
        <select v-model="statusFilter">
          <option value="all">Todos</option>
          <option v-for="status in statuses" :key="status" :value="status">{{ labelFor(status) }}</option>
        </select>
      </label>
      <label>
        <span>Prioridad</span>
        <select v-model="priorityFilter">
          <option value="all">Todas</option>
          <option v-for="priority in priorities" :key="priority" :value="priority">{{ labelFor(priority) }}</option>
        </select>
      </label>
      <label>
        <span>Empresa</span>
        <select v-model="providerFilter">
          <option value="all">Todas</option>
          <option v-for="provider in providerOptions" :key="provider.key" :value="provider.key">
            {{ provider.label }}
          </option>
        </select>
      </label>
      <label>
        <span>Sobrecargo</span>
        <select v-model="crewFilter">
          <option value="all">Todas</option>
          <option v-for="crew in crewOptions" :key="crew.key" :value="crew.key">
            {{ crew.label }}
          </option>
        </select>
      </label>
    </section>

    <section class="incidents-workspace">
      <article class="incident-table-card">
        <div class="table-head">
          <strong>{{ filteredIncidents.length }} visibles</strong>
          <small>{{ incidents.length }} reportes cargados</small>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Folio</th>
                <th>Categoria</th>
                <th>Prioridad</th>
                <th>Estado</th>
                <th>Ruta</th>
                <th>Empresa</th>
                <th>Sobrecargo</th>
                <th>Descripcion</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="incident in filteredIncidents"
                :key="incident.id"
                :class="{ selected: selectedIncident?.id === incident.id }"
                @click="selectedIncidentId = incident.id"
              >
                <td>#{{ incident.id }}</td>
                <td>{{ labelFor(incident.category) }}</td>
                <td><span class="pill">{{ labelFor(incident.priority) }}</span></td>
                <td><span class="pill pill-status">{{ labelFor(incident.status) }}</span></td>
                <td>{{ incident.operation_route || `Operacion #${incident.crew_operation_id}` }}</td>
                <td>{{ incident.provider_name || 'Proveedor por definir' }}</td>
                <td>{{ incident.crew_name || `Sobrecargo #${incident.crew_id}` }}</td>
                <td class="description-cell">{{ incident.description }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="!isLoading && !filteredIncidents.length" class="empty-state">
          <strong>Sin incidencias visibles</strong>
          <p>Ajusta los filtros o actualiza la bandeja.</p>
        </div>
      </article>

      <aside class="detail-panel">
        <template v-if="selectedIncident">
          <div class="detail-head">
            <div>
              <span class="eyebrow">Reporte #{{ selectedIncident.id }}</span>
              <h3>{{ labelFor(selectedIncident.category) }}</h3>
            </div>
            <span class="pill pill-status">{{ labelFor(selectedIncident.status) }}</span>
          </div>

          <div class="detail-grid">
            <article>
              <span>Operacion</span>
              <strong>#{{ selectedIncident.crew_operation_id }}</strong>
            </article>
            <article>
              <span>Ruta</span>
              <strong>{{ selectedIncident.operation_route || 'Ruta por definir' }}</strong>
            </article>
            <article>
              <span>Empresa</span>
              <strong>{{ selectedIncident.provider_name || 'Proveedor por definir' }}</strong>
            </article>
            <article>
              <span>Sobrecargo</span>
              <strong>{{ selectedIncident.crew_name || `Sobrecargo #${selectedIncident.crew_id}` }}</strong>
            </article>
            <article>
              <span>Prioridad</span>
              <strong>{{ labelFor(selectedIncident.priority) }}</strong>
            </article>
            <article>
              <span>Evidencia</span>
              <strong>{{ filesLabel(selectedIncident) }}</strong>
            </article>
          </div>

          <div class="detail-block">
            <span>Descripcion</span>
            <p>{{ selectedIncident.description }}</p>
          </div>

          <div class="detail-block">
            <span>Respuesta actual</span>
            <p>{{ selectedIncident.admin_response || 'Pendiente' }}</p>
          </div>

          <label>
            <span>Estado</span>
            <select v-model="draftFor(selectedIncident).status">
              <option v-for="status in statuses" :key="status" :value="status">
                {{ labelFor(status) }}
              </option>
            </select>
          </label>

          <label>
            <span>Respuesta del Admin</span>
            <textarea v-model="draftFor(selectedIncident).admin_response" rows="5"></textarea>
          </label>

          <div class="button-row">
            <button type="button" class="ghost-button" @click="updateIncident(selectedIncident)">
              Responder
            </button>
            <button type="button" class="ghost-button" @click="updateIncident(selectedIncident, 'in_review')">
              En revision
            </button>
            <button type="button" class="ghost-button" @click="updateIncident(selectedIncident, 'resolved')">
              Resolver
            </button>
            <button type="button" class="primary-action" @click="updateIncident(selectedIncident, 'closed')">
              Cerrar
            </button>
          </div>
        </template>

        <div v-else class="empty-state">
          <strong>Sin seleccion</strong>
          <p>Selecciona una incidencia de la bandeja para responderla.</p>
        </div>
      </aside>
    </section>
  </section>
</template>

<style scoped>
.admin-incidents-page,
.summary-strip,
.filters-bar,
.incidents-workspace,
.detail-panel,
.detail-grid {
  display: grid;
  gap: 1rem;
}

.admin-incidents-page {
  padding: 1rem;
  color: #171717;
}

.page-head,
.filters-bar,
.table-head,
.detail-head,
.button-row {
  display: flex;
  gap: 1rem;
}

.page-head,
.table-head,
.detail-head {
  align-items: center;
  justify-content: space-between;
}

.page-head,
.incident-table-card,
.detail-panel,
.summary-strip article,
.filters-bar,
.empty-state {
  border: 1px solid #e7e1d5;
  border-radius: 18px;
  background: #fffdf9;
}

.page-head,
.incident-table-card,
.detail-panel,
.filters-bar,
.empty-state {
  padding: 1rem;
}

.page-head h2,
.detail-head h3 {
  margin: 0.2rem 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
}

.page-head p,
.table-head small,
.empty-state p,
.detail-block p,
.eyebrow {
  color: #6b6255;
}

.summary-strip {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.summary-strip article {
  padding: 0.85rem 1rem;
}

.summary-strip span,
.filters-bar span,
.detail-grid span,
.detail-block span,
.detail-panel label span {
  color: #6b6255;
  font-size: 0.78rem;
}

.summary-strip strong {
  display: block;
  margin-top: 0.25rem;
  font-size: 1.35rem;
}

.filters-bar {
  align-items: end;
  grid-template-columns: minmax(220px, 1fr) repeat(4, minmax(150px, 180px));
}

.filters-bar label,
.detail-panel label,
.detail-block {
  display: grid;
  gap: 0.35rem;
}

input,
select,
textarea {
  width: 100%;
  min-height: 2.7rem;
  border: 1px solid #d8d0c3;
  border-radius: 12px;
  padding: 0.75rem;
  background: #fff;
  color: #111;
}

.incidents-workspace {
  grid-template-columns: minmax(0, 1.45fr) minmax(340px, 0.75fr);
  align-items: start;
}

.incident-table-card {
  min-width: 0;
}

.table-wrap {
  max-height: 560px;
  overflow: auto;
  border: 1px solid #eee6da;
  border-radius: 14px;
  background: #fff;
}

table {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
}

th,
td {
  padding: 0.75rem 0.8rem;
  border-bottom: 1px solid #f0e7da;
  text-align: left;
  vertical-align: middle;
}

thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #fbf6ed;
  color: #695b48;
  font-size: 0.76rem;
  text-transform: uppercase;
}

tbody tr {
  cursor: pointer;
}

tbody tr:hover,
tbody tr.selected {
  background: #fff3d8;
}

.description-cell {
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pill {
  display: inline-flex;
  align-items: center;
  min-height: 1.8rem;
  padding: 0 0.65rem;
  border-radius: 999px;
  background: #f6f1e8;
  color: #5f513f;
  font-size: 0.76rem;
  font-weight: 800;
  white-space: nowrap;
}

.pill-status {
  background: #eef5ef;
  color: #23603f;
}

.detail-panel {
  position: sticky;
  top: 1rem;
}

.detail-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.detail-grid article,
.detail-block {
  padding: 0.8rem;
  border: 1px solid #eee6da;
  border-radius: 14px;
  background: #fff;
}

.detail-grid strong,
.detail-block p {
  overflow-wrap: anywhere;
}

.button-row {
  flex-wrap: wrap;
}

.ghost-button,
.primary-action {
  min-height: 2.6rem;
  border-radius: 12px;
  padding: 0 0.9rem;
  cursor: pointer;
}

.ghost-button {
  border: 1px solid #d8d0c3;
  background: #fffdf9;
  color: #171717;
}

.primary-action {
  border: 1px solid #111;
  background: #111;
  color: #fff;
}

@media (max-width: 1120px) {
  .incidents-workspace,
  .filters-bar,
  .summary-strip {
    grid-template-columns: 1fr;
  }

  .detail-panel {
    position: static;
  }
}

@media (max-width: 720px) {
  .page-head,
  .table-head,
  .detail-head {
    display: grid;
    justify-content: stretch;
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
