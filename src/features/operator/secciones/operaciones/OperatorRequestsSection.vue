<script setup>
const props = defineProps({
  requestForm: { type: Object, required: true },
  requestErrors: { type: Object, required: true },
  requests: { type: Array, required: true },
  selectedRequest: { type: Object, default: null },
  flightTypes: { type: Array, required: true },
  packages: { type: Array, required: true },
  vipLevels: { type: Array, required: true },
  requestStates: { type: Array, required: true },
})

defineEmits(['update-field', 'create', 'validate', 'reject', 'view-detail', 'select'])

const detailRows = [
  { key: 'client_id', label: 'Cliente ID' },
  { key: 'request_code', label: 'Codigo' },
  { key: 'trip_type', label: 'Tipo real' },
  { key: 'estimated_distance_km', label: 'Distancia km' },
  { key: 'departure_datetime', label: 'Salida BD' },
  { key: 'return_datetime', label: 'Regreso BD' },
  { key: 'aircraft_type', label: 'Tipo de aeronave' },
  { key: 'status', label: 'Estado visible' },
  { key: 'raw_status', label: 'Estado backend' },
  { key: 'raw_workflow_status', label: 'Workflow backend' },
  { key: 'created_at', label: 'Creada' },
  { key: 'updated_at', label: 'Actualizada' },
]

function formatDetailValue(request, row) {
  if (!request) return 'N/D'

  if (row.key === 'return_datetime') {
    return request.return_datetime || request.return_date || 'Sin regreso'
  }

  const value = request[row.key]
  if (value === null || value === undefined || value === '') return 'N/D'
  if (typeof value === 'object') return JSON.stringify(value)
  return value
}
</script>

<template>
  <section class="requests-page">
    <div class="page-head surface">
      <div>
        <span class="eyebrow">Solicitudes</span>
        <h3>Centro de solicitudes operativas</h3>
        <p class="muted">
          Valida, corrige y canaliza solicitudes sin tocar pricing ni finanzas.
        </p>
      </div>

      <button class="primary-action" type="button" @click="$emit('create')">
        + Nueva solicitud
      </button>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card surface">
        <span>Pendientes</span>
        <strong>{{ requests.filter((r) => r.status === 'Pendiente').length }}</strong>
      </div>

      <div class="kpi-card surface">
        <span>En validacion</span>
        <strong>{{ requests.filter((r) => r.status === 'En validacion').length }}</strong>
      </div>

      <div class="kpi-card surface">
        <span>Aprobadas</span>
        <strong>{{ requests.filter((r) => r.status === 'Aprobada').length }}</strong>
      </div>

      <div class="kpi-card surface">
        <span>Activas</span>
        <strong>{{ requests.length }}</strong>
      </div>
    </div>

    <div class="content-grid">
      <section class="surface list-card">
        <div class="section-head">
          <div>
            <h4>Cola operativa</h4>
            <p class="muted">Solicitudes listas para revision del operador.</p>
          </div>
          <span class="badge">{{ requests.length }} activas</span>
        </div>

        <div class="request-list">
          <article
            v-for="request in requests"
            :key="request.id"
            class="request-row"
            :class="{
              'is-selected': selectedRequest?.id === request.id,
              'is-pending': request.status === 'Pendiente',
              'is-validation': request.status === 'En validacion',
              'is-approved': request.status === 'Aprobada',
              'is-rejected': request.status === 'Rechazada',
            }"
            @click="$emit('select', request)"
          >
            <div class="request-main">
              <span class="status-line"></span>

              <div>
                <div class="request-top">
                  <strong>#{{ request.id }} · {{ request.client }}</strong>
                  <span class="badge">{{ request.status }}</span>
                </div>

                <p>
                  {{ request.origin }} -> {{ request.destination }} ·
                  {{ request.date }} · {{ request.time }}
                </p>

                <small>
                  {{ request.flightType }} · {{ request.package }} ·
                  {{ request.vipLevel }} · {{ request.passengers }} pax
                </small>

                <small class="request-detail-line">
                  Cliente ID: {{ request.client_id || 'N/D' }} ·
                  Codigo: {{ request.request_code || 'Sin codigo' }} ·
                  Tipo real: {{ request.trip_type || 'N/D' }} ·
                  Distancia: {{ request.estimated_distance_km || 'N/D' }}
                </small>
              </div>
            </div>

            <div class="request-actions">
              <button
                class="validate-button"
                type="button"
                @click.stop="$emit('validate', request.id)"
              >
                Validar
              </button>

              <button
                class="ghost-button"
                type="button"
                @click.stop="$emit('view-detail', request)"
              >
                Ver
              </button>

              <button
                class="ghost-button danger-button"
                type="button"
                @click.stop="$emit('reject', request.id)"
              >
                Rechazar
              </button>
            </div>
          </article>
        </div>
      </section>

      <section class="surface detail-card">
        <div class="detail-head">
          <div>
            <h4>Detalle operativo</h4>
            <p class="muted">
              Lectura completa de la fila seleccionada para preparar validacion y asignacion.
            </p>
          </div>

          <button
            v-if="selectedRequest"
            class="primary-action"
            type="button"
            @click="$emit('validate', selectedRequest.id)"
          >
            Pasar a validacion
          </button>
        </div>

        <template v-if="selectedRequest">
          <div class="detail-hero">
            <strong>#{{ selectedRequest.id }} · {{ selectedRequest.client }}</strong>
            <span class="badge">{{ selectedRequest.status }}</span>
          </div>

          <div class="detail-grid">
            <article v-for="row in detailRows" :key="row.key" class="detail-item">
              <span>{{ row.label }}</span>
              <strong>{{ formatDetailValue(selectedRequest, row) }}</strong>
            </article>
          </div>

          <div v-if="selectedRequest.notes || selectedRequest.specialRequirements" class="detail-block">
            <span>Notas / requerimientos</span>
            <p>{{ selectedRequest.notes || selectedRequest.specialRequirements }}</p>
          </div>

          <div v-if="selectedRequest.requirements?.length" class="detail-block">
            <span>Requirements</span>
            <div class="pill-row">
              <span v-for="item in selectedRequest.requirements" :key="item" class="detail-pill">
                {{ item }}
              </span>
            </div>
          </div>

          <div
            v-if="selectedRequest.package_snapshot || selectedRequest.visibility_payload"
            class="detail-block"
          >
            <span>Payload estructurado</span>
            <pre>{{ JSON.stringify({ package_snapshot: selectedRequest.package_snapshot, visibility_payload: selectedRequest.visibility_payload }, null, 2) }}</pre>
          </div>
        </template>

        <div v-else class="empty-detail">
          Selecciona una solicitud para revisar todos sus campos.
        </div>
      </section>
    </div>

    <section class="surface form-card">
      <h4>Alta rapida</h4>
      <p class="muted">Crear solicitud manual solo cuando entre por canal operativo.</p>

      <div class="form-grid">
        <label>
          <span>Cliente</span>
          <input
            :value="props.requestForm.client"
            type="text"
            placeholder="Grupo Vertice"
            @input="$emit('update-field', { form: 'request', field: 'client', value: $event.target.value })"
          />
          <small v-if="props.requestErrors.client">{{ props.requestErrors.client }}</small>
        </label>

        <label>
          <span>Origen</span>
          <input
            :value="props.requestForm.origin"
            type="text"
            placeholder="MTY"
            @input="$emit('update-field', { form: 'request', field: 'origin', value: $event.target.value })"
          />
          <small v-if="props.requestErrors.origin">{{ props.requestErrors.origin }}</small>
        </label>

        <label>
          <span>Destino</span>
          <input
            :value="props.requestForm.destination"
            type="text"
            placeholder="TLC"
            @input="$emit('update-field', { form: 'request', field: 'destination', value: $event.target.value })"
          />
          <small v-if="props.requestErrors.destination">{{ props.requestErrors.destination }}</small>
        </label>

        <label>
          <span>Fecha</span>
          <input
            :value="props.requestForm.date"
            type="date"
            @input="$emit('update-field', { form: 'request', field: 'date', value: $event.target.value })"
          />
          <small v-if="props.requestErrors.date">{{ props.requestErrors.date }}</small>
        </label>

        <label>
          <span>Hora</span>
          <input
            :value="props.requestForm.time"
            type="time"
            @input="$emit('update-field', { form: 'request', field: 'time', value: $event.target.value })"
          />
          <small v-if="props.requestErrors.time">{{ props.requestErrors.time }}</small>
        </label>

        <label>
          <span>Pasajeros</span>
          <input
            :value="props.requestForm.passengers"
            type="number"
            min="1"
            @input="$emit('update-field', { form: 'request', field: 'passengers', value: $event.target.value })"
          />
          <small v-if="props.requestErrors.passengers">{{ props.requestErrors.passengers }}</small>
        </label>

        <label>
          <span>Tipo de vuelo</span>
          <select
            :value="props.requestForm.flightType"
            @change="$emit('update-field', { form: 'request', field: 'flightType', value: $event.target.value })"
          >
            <option value="">Selecciona</option>
            <option v-for="item in flightTypes" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>

        <label>
          <span>Paquete</span>
          <select
            :value="props.requestForm.package"
            @change="$emit('update-field', { form: 'request', field: 'package', value: $event.target.value })"
          >
            <option value="">Selecciona</option>
            <option v-for="item in packages" :key="item" :value="item">{{ item }}</option>
          </select>
          <small v-if="props.requestErrors.package">{{ props.requestErrors.package }}</small>
        </label>

        <label>
          <span>Nivel VIP</span>
          <select
            :value="props.requestForm.vipLevel"
            @change="$emit('update-field', { form: 'request', field: 'vipLevel', value: $event.target.value })"
          >
            <option v-for="item in vipLevels" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>

        <label>
          <span>Estado</span>
          <select
            :value="props.requestForm.status"
            @change="$emit('update-field', { form: 'request', field: 'status', value: $event.target.value })"
          >
            <option v-for="item in requestStates" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>

        <label class="full-width">
          <span>Requerimientos especiales</span>
          <textarea
            :value="props.requestForm.specialRequirements"
            rows="3"
            placeholder="Mascota autorizada, catering premium, traslados..."
            @input="$emit('update-field', { form: 'request', field: 'specialRequirements', value: $event.target.value })"
          ></textarea>
        </label>
      </div>
    </section>
  </section>
</template>

<style scoped>
.requests-page,
.content-grid,
.request-list,
.detail-card,
.detail-grid,
.form-grid {
  display: grid;
  gap: 1rem;
}

.page-head,
.form-card,
.list-card,
.kpi-card,
.detail-card {
  padding: 1rem;
}

.page-head,
.section-head,
.request-row,
.request-top,
.detail-head,
.detail-hero {
  display: flex;
  gap: 1rem;
}

.page-head,
.section-head,
.request-top,
.detail-head,
.detail-hero {
  align-items: center;
  justify-content: space-between;
}

.page-head h3,
.form-card h4,
.list-card h4,
.detail-card h4 {
  margin: 0;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
}

.kpi-card {
  border-radius: 18px;
}

.kpi-card span {
  display: block;
  color: #70675c;
  font-size: 0.85rem;
}

.kpi-card strong {
  display: block;
  margin-top: 0.35rem;
  font-size: 1.5rem;
}

.content-grid {
  grid-template-columns: minmax(0, 1.2fr) minmax(340px, 0.8fr);
  align-items: start;
}

.request-row {
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  border-radius: 18px;
  background: #faf8f3;
  border: 1px solid rgba(201, 169, 107, 0.18);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  cursor: pointer;
}

.request-row:hover,
.request-row.is-selected {
  transform: translateY(-2px);
  box-shadow: 0 14px 34px rgba(17, 17, 17, 0.08);
}

.request-row.is-selected {
  border-color: rgba(17, 17, 17, 0.18);
  background: #fffdf8;
}

.request-main {
  display: flex;
  gap: 0.9rem;
  align-items: stretch;
}

.status-line {
  width: 5px;
  border-radius: 999px;
  background: #c8a96b;
}

.is-pending .status-line {
  background: #2563eb;
}

.is-validation .status-line {
  background: #c8a96b;
}

.is-approved .status-line {
  background: #16a34a;
}

.is-rejected .status-line {
  background: #b42318;
}

.request-row p,
.request-row small,
.detail-block p {
  margin: 0.3rem 0 0;
}

.request-detail-line,
.detail-item span,
.detail-block span,
.empty-detail {
  color: #5d5d5d;
  line-height: 1.5;
}

.request-actions {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.validate-button {
  border: 0;
  border-radius: 14px;
  padding: 0.75rem 1rem;
  background: #111;
  color: white;
  font-weight: 800;
  cursor: pointer;
}

.danger-button {
  border-color: rgba(180, 35, 24, 0.2);
  color: #b42318;
}

.detail-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.detail-item {
  display: grid;
  gap: 0.35rem;
  padding: 0.9rem;
  border: 1px solid #ece5d6;
  border-radius: 16px;
  background: #fffdfa;
}

.detail-item strong {
  word-break: break-word;
}

.detail-block {
  display: grid;
  gap: 0.5rem;
  padding: 1rem;
  border: 1px solid #ece5d6;
  border-radius: 16px;
  background: #faf8f3;
}

.detail-block pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.84rem;
}

.pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.detail-pill {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0 0.7rem;
  border-radius: 999px;
  color: #8c6a1f;
  background: #f4ead1;
  font-size: 0.78rem;
  font-weight: 800;
}

.form-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 1rem;
}

.form-grid label {
  display: grid;
  gap: 0.35rem;
}

.full-width {
  grid-column: 1 / -1;
}

.form-grid small {
  color: #b42318;
}

@media (max-width: 1080px) {
  .content-grid,
  .form-grid,
  .kpi-grid,
  .detail-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .page-head,
  .section-head,
  .request-row,
  .request-actions,
  .detail-head,
  .detail-hero {
    display: grid;
  }

  .request-actions {
    justify-items: stretch;
  }
}
</style>
