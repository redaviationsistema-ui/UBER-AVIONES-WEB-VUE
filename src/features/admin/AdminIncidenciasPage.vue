<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../../lib/api'
import {
  incidentLabels as labels,
  groupIncidents,
  incidentGroupKey,
  formatIncidentFlightDate,
  loadIncidentFlights,
} from './adminIncidentGroups'
import AdminClosureEvidence from './AdminClosureEvidence.vue'

const incidents = ref([])
const isLoading = ref(false)
const route = useRoute()
const isGroup = computed(() => route.name === 'admin-incidencias-grupo')
const isDetail = computed(() => Boolean(route.params.id) || isGroup.value)
const flights = ref({})
const flightError = ref('')
const flightLoading = ref(false)
const isEvidence = computed(() => route.name === 'admin-incidencias-evidencias')
const evidence = ref(null)
const error = ref('')
const saving = ref(false)
const reportPath = (id) => `/admin/incidencias/${encodeURIComponent(id)}`
const statusFilter = ref('all')
const priorityFilter = ref('all')
const providerFilter = ref('all')
const crewFilter = ref('all')
const searchQuery = ref('')
const updateDrafts = reactive({})

const statuses = ['open', 'in_review', 'resolved', 'closed']
const priorities = ['baja', 'media', 'alta', 'critica']


const filteredIncidents = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()

  return incidents.value
    .filter((incident) => statusFilter.value === 'all' || incident.status === statusFilter.value)
    .filter(
      (incident) => priorityFilter.value === 'all' || incident.priority === priorityFilter.value,
    )
    .filter(
      (incident) =>
        providerFilter.value === 'all' || resolveProviderKey(incident) === providerFilter.value,
    )
    .filter(
      (incident) => crewFilter.value === 'all' || resolveCrewKey(incident) === crewFilter.value,
    )
    .filter((incident) => {
      if (!query) return true
      return [
        flightFor(incident),
        incident.operation_departure_datetime,
        incident.id,
        incident.crew_operation_id,
        incident.operation_route,
        incident.crew_provider_company_name,
        incident.crew_provider_name,
        incident.provider_company_name,
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
  [
    ...new Map(
      incidents.value
        .map((incident) => {
          const key = resolveProviderKey(incident)
          return key ? [key, { key, label: resolveProviderLabel(incident) }] : null
        })
        .filter(Boolean),
    ).values(),
  ].sort((left, right) => left.label.localeCompare(right.label, 'es')),
)

const crewOptions = computed(() =>
  [
    ...new Map(
      incidents.value
        .map((incident) => {
          const key = resolveCrewKey(incident)
          return key ? [key, { key, label: resolveCrewLabel(incident) }] : null
        })
        .filter(Boolean),
    ).values(),
  ].sort((left, right) => left.label.localeCompare(right.label, 'es')),
)

const groups = computed(() => groupIncidents(filteredIncidents.value))
const selectedGroup = computed(
  () =>
    groupIncidents(incidents.value).find(
      (group) =>
        group.key ===
        JSON.stringify([String(route.params.operationId), String(route.params.crewId)]),
    ) || null,
)
function groupPath(incident) {
  const [operationId, crewId] = JSON.parse(incidentGroupKey(incident))
  return `/admin/incidencias/operaciones/${encodeURIComponent(operationId)}/sobrecargos/${encodeURIComponent(crewId)}`
}
function flightFor(incident) {
  return flights.value[incident.crew_operation_id]?.flight || 'N/D'
}
function dateFor(incident) {
  return formatIncidentFlightDate(
    incident.operation_departure_datetime ||
      flights.value[incident.crew_operation_id]?.departure ||
      incident.created_at,
  )
}

const selectedIncident = computed(
  () => incidents.value.find((incident) => String(incident.id) === String(route.params.id)) || null,
)

const summary = computed(() => ({
  total: incidents.value.length,
  open: incidents.value.filter((item) => item.status === 'open').length,
  inReview: incidents.value.filter((item) => item.status === 'in_review').length,
  closed: incidents.value.filter((item) => item.status === 'closed').length,
}))

function labelFor(value = '') {
  return labels[value] || value || 'Sin dato'
}

function resolveProviderKey(incident = {}) {
  return String(
    incident.crew_provider_id ||
      incident.provider_id ||
      incident.crew_provider_company_name ||
      incident.crew_provider_name ||
      incident.provider_company_name ||
      incident.provider_name ||
      '',
  )
    .trim()
    .toLowerCase()
}

function resolveProviderLabel(incident = {}) {
  return (
    String(
      incident.crew_provider_company_name ||
        incident.crew_provider_name ||
        incident.provider_company_name ||
        incident.provider_name ||
        '',
    ).trim() || 'Proveedor por definir'
  )
}

function resolveCrewKey(incident = {}) {
  return String(incident.crew_id || incident.crew_name || '')
    .trim()
    .toLowerCase()
}

function resolveCrewLabel(incident = {}) {
  return (
    String(incident.crew_name || '').trim() ||
    (incident.crew_id ? `Sobrecargo #${incident.crew_id}` : 'Sobrecargo por definir')
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
  if (isLoading.value) return
  isLoading.value = true
  error.value = ''
  try {
    const response = await api.get('/crew-operation-incidents')
    incidents.value = response.incidents || response.data || []
    flightError.value = ''
    flightLoading.value = true
    try {
      flights.value = await loadIncidentFlights(incidents.value)
    } catch {
      flightError.value = 'No se pudieron actualizar los datos de vuelo. Intenta actualizar.'
    } finally {
      flightLoading.value = false
    }
  } catch {
    error.value = 'No se pudieron cargar los reportes. Intenta actualizar.'
  } finally {
    isLoading.value = false
  }
}

async function updateIncident(incident, status = '') {
  if (!incident || saving.value) return
  saving.value = true
  error.value = ''
  try {
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
  } catch {
    error.value = 'No se pudo actualizar el reporte. Intenta nuevamente.'
  } finally {
    saving.value = false
  }
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

    <section v-if="!isDetail" class="summary-strip">
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

    <section v-if="!isDetail" class="filters-bar">
      <label>
        <span>Buscar</span>
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Operacion, sobrecargo, categoria..."
        />
      </label>
      <label>
        <span>Estado</span>
        <select v-model="statusFilter">
          <option value="all">Todos</option>
          <option v-for="status in statuses" :key="status" :value="status">
            {{ labelFor(status) }}
          </option>
        </select>
      </label>
      <label>
        <span>Prioridad</span>
        <select v-model="priorityFilter">
          <option value="all">Todas</option>
          <option v-for="priority in priorities" :key="priority" :value="priority">
            {{ labelFor(priority) }}
          </option>
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

    <p v-if="flightError && (!isDetail || isGroup)" role="alert">{{ flightError }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="isDetail && !isGroup">
      <nav class="button-row" aria-label="Breadcrumb">
        <RouterLink to="/admin/incidencias">Listado de incidencias</RouterLink>
        <template v-if="selectedIncident">
          <span>/</span>
          <RouterLink :to="groupPath(selectedIncident)">Reportes del vuelo</RouterLink>
        </template>
        <span>/</span
        ><RouterLink :to="reportPath(route.params.id)">Reporte #{{ route.params.id }}</RouterLink>
        <template v-if="isEvidence"><span>/</span><span>Evidencias</span></template>
      </nav>
      <nav class="button-row incident-tabs" aria-label="Vistas del reporte">
        <RouterLink
          :to="reportPath(route.params.id)"
          :aria-current="!isEvidence ? 'page' : undefined"
          :class="{ active: !isEvidence }"
          >Reporte</RouterLink
        >
        <RouterLink
          :to="`${reportPath(route.params.id)}/evidencias`"
          :aria-current="isEvidence ? 'page' : undefined"
          :class="{ active: isEvidence }"
          >Evidencias</RouterLink
        >
      </nav>
    </template>
    <section class="incidents-workspace">
      <article v-if="!isDetail" class="incident-table-card">
        <div class="table-head">
          <strong>{{ groups.length }} vuelos / operaciones visibles</strong>
          <small>{{ incidents.length }} reportes cargados</small>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Vuelo</th>
                <th>Fecha</th>
                <th>Operación</th>
                <th>Ruta</th>
                <th>Empresa</th>
                <th>Sobrecargo</th>
                <th>Reportes</th>
                <th>Abiertas</th>
                <th>En revisión</th>
                <th>Cerradas</th>
                <th>Acceso</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="group in groups" :key="group.key">
                <td>{{ flightLoading ? 'Cargando…' : flightFor(group.incident) }}</td>
                <td class="flight-date">{{ dateFor(group.incident) }}</td>
                <td>
                  {{
                    group.incident.crew_operation_id
                      ? `#${group.incident.crew_operation_id}`
                      : 'N/D'
                  }}
                </td>
                <td>{{ group.incident.operation_route || 'Ruta por definir' }}</td>
                <td>{{ resolveProviderLabel(group.incident) }}</td>
                <td>{{ resolveCrewLabel(group.incident) }}</td>
                <td>{{ group.reports.length }} reportes</td>
                <td>{{ group.open }} abiertas</td>
                <td>{{ group.inReview }} en revisión</td>
                <td>{{ group.closed }} cerradas</td>
                <td>
                  <RouterLink class="report-access group-access" :to="groupPath(group.incident)"
                    >Ver reportes</RouterLink
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="!isLoading && !filteredIncidents.length" class="empty-state">
          <strong>Sin incidencias visibles</strong>
          <p>Ajusta los filtros o actualiza la bandeja.</p>
        </div>
      </article>

      <article v-else-if="isGroup" class="detail-panel">
        <RouterLink to="/admin/incidencias">← Listado de incidencias</RouterLink>
        <template v-if="selectedGroup">
          <h3>Reportes del vuelo</h3>
          <div class="detail-grid group-details">
            <article>
              <span>Vuelo</span
              ><strong>{{
                flightLoading ? 'Cargando…' : flightFor(selectedGroup.incident)
              }}</strong>
            </article>
            <article>
              <span>Fecha</span><strong>{{ dateFor(selectedGroup.incident) }}</strong>
            </article>
            <article>
              <span>Operación</span
              ><strong>#{{ selectedGroup.incident.crew_operation_id || 'N/D' }}</strong>
            </article>
            <article>
              <span>Ruta</span
              ><strong>{{ selectedGroup.incident.operation_route || 'Ruta por definir' }}</strong>
            </article>
            <article>
              <span>Empresa</span
              ><strong>{{ resolveProviderLabel(selectedGroup.incident) }}</strong>
            </article>
            <article>
              <span>Sobrecargo</span><strong>{{ resolveCrewLabel(selectedGroup.incident) }}</strong>
            </article>
          </div>
          <strong>Total reportes: {{ selectedGroup.reports.length }}</strong>
          <article
            v-for="incident in selectedGroup.reports"
            :key="incident.id"
            class="detail-block flight-report"
          >
            <h3>Reporte #{{ incident.id }}</h3>
            <div>Categoría: {{ labelFor(incident.category) }}</div>
            <div>Prioridad: {{ labelFor(incident.priority) }}</div>
            <div>Estado: {{ labelFor(incident.status) }}</div>
            <p>Descripción: {{ incident.description }}</p>
            <div class="access-actions">
              <RouterLink class="report-access" :to="reportPath(incident.id)">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 16h6" /></svg
                >Ver reporte
              </RouterLink>
              <RouterLink class="evidence-access" :to="`${reportPath(incident.id)}/evidencias`">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 3h18v18H3z M3 17l6-6 4 4 3-3 5 5" />
                  <circle cx="16" cy="8" r="1" /></svg
                >Evidencias
              </RouterLink>
            </div>
          </article>
        </template>
        <p v-else>
          {{
            isLoading ? 'Cargando reportes…' : 'No hay reportes para esta operación y sobrecargo.'
          }}
        </p>
      </article>

      <article v-else class="detail-panel">
        <template v-if="selectedIncident">
          <div class="detail-head">
            <div>
              <span class="eyebrow"
                >{{ isEvidence ? 'Evidencias del reporte' : 'REPORTE' }} #{{
                  selectedIncident.id
                }}</span
              >
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
              <strong>{{
                selectedIncident.crew_provider_company_name ||
                selectedIncident.crew_provider_name ||
                selectedIncident.provider_company_name ||
                selectedIncident.provider_name ||
                'Proveedor por definir'
              }}</strong>
            </article>
            <article>
              <span>Sobrecargo</span>
              <strong>{{
                selectedIncident.crew_name || `Sobrecargo #${selectedIncident.crew_id}`
              }}</strong>
            </article>
            <article>
              <span>Prioridad</span>
              <strong>{{ labelFor(selectedIncident.priority) }}</strong>
            </article>
          </div>

          <AdminClosureEvidence
            ref="evidence"
            :operation-id="selectedIncident.crew_operation_id"
            :compact="!isEvidence"
            :hide-refresh="isEvidence"
          />
          <RouterLink
            v-if="!isEvidence"
            class="evidence-access"
            :to="`${reportPath(selectedIncident.id)}/evidencias`"
            >Ver evidencias</RouterLink
          >

          <template v-if="!isEvidence">
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

            <fieldset class="button-row" :disabled="saving">
              <button type="button" class="ghost-button" @click="updateIncident(selectedIncident)">
                Responder
              </button>
              <button
                type="button"
                class="ghost-button"
                @click="updateIncident(selectedIncident, 'in_review')"
              >
                En revision
              </button>
              <button
                type="button"
                class="ghost-button"
                @click="updateIncident(selectedIncident, 'resolved')"
              >
                Resolver
              </button>
              <button
                type="button"
                class="primary-action"
                @click="updateIncident(selectedIncident, 'closed')"
              >
                Cerrar
              </button>
            </fieldset>
          </template>
          <div v-else class="evidence-footer">
            <RouterLink :to="reportPath(selectedIncident.id)">← Volver al reporte</RouterLink>
            <div class="button-row">
              <button
                class="ghost-button"
                :disabled="evidence?.loading"
                @click="evidence?.refresh()"
              >
                Actualizar evidencias
              </button>
              <button
                class="primary-action"
                :disabled="saving"
                @click="updateIncident(selectedIncident, 'resolved')"
              >
                Resolver reporte
              </button>
            </div>
          </div>
        </template>

        <div v-else class="empty-state">
          <strong>{{ isLoading ? 'Cargando reporte…' : 'Reporte no disponible' }}</strong>
          <p v-if="!isLoading">No se encontró el reporte #{{ route.params.id }}.</p>
        </div>
      </article>
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
  grid-template-columns: minmax(0, 1fr);
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

tbody tr:hover {
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
  min-width: 0;
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
.access-actions {
  display: flex;
  gap: 0.5rem;
  white-space: nowrap;
}
.report-access,
.evidence-access,
.incident-tabs a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.65rem 0.85rem;
  border: 1px solid #173b65;
  border-radius: 10px;
  color: #173b65;
  background: white;
  text-decoration: none;
  font-weight: 700;
}
.report-access,
.incident-tabs a.active {
  background: #173b65;
  color: white;
}
.access-actions svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
}
.evidence-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
fieldset.button-row {
  border: 0;
  padding: 0;
  margin: 0;
}
button:disabled {
  opacity: 0.6;
  cursor: wait;
}
.flight-date,
.group-access {
  white-space: nowrap;
}
.flight-report h3 {
  margin: 0;
}
.group-details strong {
  display: block;
}
</style>
