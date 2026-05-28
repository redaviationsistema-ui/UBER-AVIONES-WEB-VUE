<script setup>
import { computed, reactive, ref } from 'vue'

const props = defineProps({
  crewForm: { type: Object, required: true },
  crewErrors: { type: Object, required: true },
  tripulation: { type: Array, required: true },
  crewRoles: { type: Array, required: true },
  crewStates: { type: Array, required: true },
  crewBases: { type: Array, required: true },
  aircraftOptions: { type: Array, default: () => [] },
  editingCrewId: { type: [Number, String, null], default: null },
  savingCrew: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  backendStatus: { type: String, default: 'Operativo' },
  lastSyncLabel: { type: String, default: 'Sin sincronización' },
})

const filters = reactive({
  search: '',
  base: 'all',
  role: 'all',
  state: 'all',
  aircraft: 'all',
  certification: 'all',
  availability: 'all',
  rating: 'all',
})

const formTab = ref('perfil')
const calendarAnchor = ref(startOfWeek(new Date()))

const emits = defineEmits([
  'update-field',
  'create',
  'select-person',
  'suspend',
  'activate',
  'assign-flight',
  'mark-availability',
  'view-documents',
  'view-history',
  'reset-form',
])

const formTabs = [
  { id: 'perfil', label: 'Perfil', icon: '👨‍✈️' },
  { id: 'certificaciones', label: 'Certificaciones', icon: '📄' },
  { id: 'documentos', label: 'Documentos', icon: '🗂' },
  { id: 'historial', label: 'Historial', icon: '🛫' },
]

const totalCrew = computed(() => props.tripulation.length)
const availableCrew = computed(() => props.tripulation.filter((item) => item.state === 'Disponible').length)
const activeOperationsCrew = computed(() =>
  props.tripulation.filter((item) => ['Asignado', 'En vuelo'].includes(item.state)).length,
)
const restingCrew = computed(() => props.tripulation.filter((item) => item.state === 'Descanso').length)
const expiringCertifications = computed(() =>
  props.tripulation.filter((item) => {
    if (!item.certificationExpiry) return false
    const expiry = new Date(item.certificationExpiry)
    if (Number.isNaN(expiry.getTime())) return false
    const diffDays = Math.ceil((expiry.getTime() - Date.now()) / 86400000)
    return diffDays >= 0 && diffDays <= 45
  }).length,
)

const crewRows = computed(() => {
  const search = String(filters.search || '').trim().toLowerCase()

  return props.tripulation.filter((item) => {
    const haystack = [
      item.name,
      item.role,
      item.base,
      item.state,
      item.authorizedAircraft,
      item.certifications,
      item.languages,
      item.validationStatus,
    ]
      .join(' ')
      .toLowerCase()

    if (search && !haystack.includes(search)) return false
    if (filters.base !== 'all' && item.base !== filters.base) return false
    if (filters.role !== 'all' && item.role !== filters.role) return false
    if (filters.state !== 'all' && item.state !== filters.state) return false
    if (
      filters.aircraft !== 'all' &&
      !String(item.authorizedAircraft || '').toLowerCase().includes(filters.aircraft.toLowerCase())
    ) {
      return false
    }
    if (
      filters.certification !== 'all' &&
      !String(item.certifications || '').toLowerCase().includes(filters.certification.toLowerCase())
    ) {
      return false
    }
    if (
      filters.availability !== 'all' &&
      !String(item.availability || '').toLowerCase().includes(filters.availability.toLowerCase())
    ) {
      return false
    }

    const ratingValue = Number(String(item.internalRating || item.rating || '').replace(/[^\d.]+/g, ''))
    if (filters.rating === 'high' && !(ratingValue >= 4.8)) return false
    if (filters.rating === 'mid' && !(ratingValue >= 4.5 && ratingValue < 4.8)) return false
    if (filters.rating === 'low' && !(ratingValue < 4.5)) return false

    return true
  })
})

const certificationOptions = computed(() => {
  const values = new Set()
  props.tripulation.forEach((item) => {
    String(item.certifications || '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => values.add(part))
  })
  return Array.from(values)
})

const calendarDays = computed(() =>
  Array.from({ length: 7 }, (_, index) => {
    const date = addDays(calendarAnchor.value, index)
    return {
      key: date.toISOString(),
      date,
      label: new Intl.DateTimeFormat('es-MX', {
        weekday: 'short',
        day: 'numeric',
        timeZone: 'America/Mexico_City',
      }).format(date),
      isToday: isSameDay(date, new Date()),
    }
  }),
)

const calendarRows = computed(() =>
  crewRows.value.slice(0, 6).map((person) => ({
    person,
    cells: calendarDays.value.map((day) => buildCalendarCell(person, day.date)),
  })),
)

const emptyStateVisible = computed(() => !props.loading && !props.tripulation.length)

function startOfWeek(date = new Date()) {
  const value = new Date(date)
  value.setHours(0, 0, 0, 0)
  const day = value.getDay()
  const diff = day === 0 ? -6 : 1 - day
  value.setDate(value.getDate() + diff)
  return value
}

function addDays(date, amount) {
  const value = new Date(date)
  value.setDate(value.getDate() + amount)
  return value
}

function isSameDay(firstDate, secondDate) {
  return new Date(firstDate).toDateString() === new Date(secondDate).toDateString()
}

function moveCalendarWeek(offset) {
  calendarAnchor.value = startOfWeek(addDays(calendarAnchor.value, offset * 7))
}

function jumpCalendarToToday() {
  calendarAnchor.value = startOfWeek(new Date())
}

function buildCalendarCell(person, date) {
  const certificationToneValue = certificationTone(person.certificationExpiry)
  const state = String(person.state || '').toLowerCase()

  if (state.includes('suspend')) {
    return { key: `${person.id}-${date.toISOString()}`, label: 'Suspendido', tone: 'danger' }
  }
  if (state.includes('descanso')) {
    return { key: `${person.id}-${date.toISOString()}`, label: 'Descanso', tone: 'warning' }
  }
  if (state.includes('asign') || state.includes('vuelo')) {
    return { key: `${person.id}-${date.toISOString()}`, label: 'Asignado', tone: 'info' }
  }
  if (certificationToneValue === 'warning') {
    return { key: `${person.id}-${date.toISOString()}`, label: 'Por vencer', tone: 'warning' }
  }
  return { key: `${person.id}-${date.toISOString()}`, label: 'Disponible', tone: 'success' }
}

function stateTone(state = '') {
  const normalized = String(state || '').toLowerCase()
  if (normalized.includes('disponible')) return 'success'
  if (normalized.includes('asign') || normalized.includes('vuelo')) return 'info'
  if (normalized.includes('descanso')) return 'warning'
  if (normalized.includes('suspend')) return 'danger'
  return 'neutral'
}

function validationTone(value = '') {
  const normalized = String(value || '').toLowerCase()
  if (normalized.includes('valid') || normalized.includes('aprob')) return 'success'
  if (normalized.includes('revision') || normalized.includes('pend')) return 'warning'
  if (normalized.includes('rechaz') || normalized.includes('suspend')) return 'danger'
  return 'neutral'
}

function certificationTone(value = '') {
  if (!value) return 'neutral'
  const expiry = new Date(value)
  if (Number.isNaN(expiry.getTime())) return 'neutral'
  const diffDays = Math.ceil((expiry.getTime() - Date.now()) / 86400000)
  if (diffDays < 0) return 'danger'
  if (diffDays <= 45) return 'warning'
  return 'success'
}

function certificationLabel(value = '') {
  if (!value) return 'Sin fecha'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeZone: 'America/Mexico_City',
  }).format(parsed)
}

function lastUpdatedLabel(value = '') {
  if (!value) return 'Sin actualizar'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City',
  }).format(parsed)
}

function quickCreate() {
  formTab.value = 'perfil'
  emits('reset-form')
}
</script>
<template>
  <section class="crew-page">
    <article class="surface crew-hero">
      <div class="crew-hero-copy">
        <div class="crew-breadcrumbs">Operador / Tripulación</div>
        <div class="crew-hero-title">
          <span class="crew-icon">👨‍✈️</span>
          <div>
            <h2>Centro operativo de tripulación</h2>
            <p class="muted">Coordina perfiles, validación documental y asignación de vuelos.</p>
          </div>
        </div>
      </div>

      <div class="crew-hero-meta">
        <span class="status-pill" :data-tone="loading ? 'warning' : 'success'">
          {{ loading ? 'Sincronizando' : backendStatus }}
        </span>
        <small>Última sincronización: {{ lastSyncLabel }}</small>
      </div>
    </article>

    <div class="crew-kpi-grid">
      <article class="metric-card metric-card--neutral">
        <strong>{{ totalCrew }}</strong>
        <span>Tripulación total</span>
        <small>Perfiles activos y en revisión.</small>
      </article>
      <article class="metric-card metric-card--success">
        <strong>{{ availableCrew }}</strong>
        <span>Disponibles</span>
        <small>Listos para asignación.</small>
      </article>
      <article class="metric-card metric-card--info">
        <strong>{{ activeOperationsCrew }}</strong>
        <span>En operación</span>
        <small>Ya comprometidos a vuelo.</small>
      </article>
      <article class="metric-card metric-card--warning">
        <strong>{{ restingCrew }}</strong>
        <span>En descanso</span>
        <small>Fuera de disponibilidad inmediata.</small>
      </article>
      <article class="metric-card metric-card--danger">
        <strong>{{ expiringCertifications }}</strong>
        <span>Por vencer</span>
        <small>Certificaciones dentro de 45 días.</small>
      </article>
    </div>

    <div class="quick-actions-row">
      <button type="button" class="ghost-button" @click="quickCreate">➕ Crear tripulante</button>
      <button type="button" class="ghost-button" @click="emits('create')">💾 Guardar perfil</button>
      <button type="button" class="ghost-button" @click="jumpCalendarToToday()">📅 Ver calendario</button>
      <button type="button" class="ghost-button" @click="formTab = 'documentos'">🗂 Validar documentos</button>
      <button type="button" class="ghost-button" @click="formTab = 'certificaciones'">📄 Revisar certificaciones</button>
      <button type="button" class="ghost-button" @click="formTab = 'historial'">🛫 Ver historial</button>
    </div>

    <div class="crew-layout">
      <div class="crew-main-column">
        <article class="surface crew-filters">
          <div class="section-head">
            <div>
              <p class="eyebrow">Filtros</p>
              <h3>Tripulación viva y disponible</h3>
            </div>
          </div>

          <div class="filters-grid">
            <label class="span-2">
              <span>Buscar</span>
              <input v-model="filters.search" type="search" placeholder="Nombre, rol, base, certificación..." />
            </label>
            <label>
              <span>Base</span>
              <select v-model="filters.base">
                <option value="all">Todas</option>
                <option v-for="item in crewBases" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label>
              <span>Rol</span>
              <select v-model="filters.role">
                <option value="all">Todos</option>
                <option v-for="item in crewRoles" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label>
              <span>Estado</span>
              <select v-model="filters.state">
                <option value="all">Todos</option>
                <option v-for="item in crewStates" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label>
              <span>Tipo aeronave</span>
              <select v-model="filters.aircraft">
                <option value="all">Todos</option>
                <option
                  v-for="item in aircraftOptions"
                  :key="item.id"
                  :value="String(item.label).split(' - ')[0]"
                >
                  {{ String(item.label).split(' - ')[0] }}
                </option>
              </select>
            </label>
            <label>
              <span>Certificación</span>
              <select v-model="filters.certification">
                <option value="all">Todas</option>
                <option v-for="item in certificationOptions" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label>
              <span>Disponibilidad</span>
              <select v-model="filters.availability">
                <option value="all">Todas</option>
                <option value="inmediata">Inmediata</option>
                <option value="24">24 hrs</option>
                <option value="programada">Programada</option>
              </select>
            </label>
            <label>
              <span>Rating</span>
              <select v-model="filters.rating">
                <option value="all">Todos</option>
                <option value="high">4.8 o más</option>
                <option value="mid">4.5 a 4.79</option>
                <option value="low">Menor a 4.5</option>
              </select>
            </label>
          </div>
        </article>

        <article class="surface crew-table-surface">
          <div class="section-head">
            <div>
              <p class="eyebrow">Tabla central</p>
              <h3>Directorio profesional de tripulación</h3>
            </div>
            <span class="badge">{{ crewRows.length }} resultado(s)</span>
          </div>

          <div v-if="loading" class="crew-skeleton-list">
            <article v-for="index in 5" :key="index" class="crew-skeleton-row">
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </article>
          </div>

          <div v-else-if="emptyStateVisible" class="crew-empty-state">
            <div class="crew-empty-icon">👨‍✈️</div>
            <strong>No hay tripulación registrada aún</strong>
            <p>Comienza creando un piloto, copiloto o sobrecargo para activar la operación.</p>
            <button type="button" class="primary-action" @click="quickCreate">Crear tripulante</button>
          </div>

          <div v-else class="crew-table-wrap">
            <div class="crew-table-head">
              <span>Nombre</span>
              <span>Rol</span>
              <span>Base</span>
              <span>Estado</span>
              <span>Certificación</span>
              <span>Vence</span>
              <span>Rating</span>
              <span>Acción</span>
            </div>

            <div v-for="person in crewRows" :key="person.id" class="crew-table-row">
              <div class="crew-name-cell">
                <strong>{{ person.name }}</strong>
                <small>{{ person.email || 'Sin correo' }}</small>
                <small>{{ person.phone || 'Sin teléfono' }}</small>
              </div>
              <span>{{ person.role }}</span>
              <span>{{ person.base }}</span>
              <span class="status-pill" :data-tone="stateTone(person.state)">{{ person.state }}</span>
              <div class="crew-cert-cell">
                <strong>{{ person.certifications || 'Sin certificación' }}</strong>
                <small>{{ person.authorizedAircraft || 'Tipo por definir' }}</small>
              </div>
              <span class="status-pill" :data-tone="certificationTone(person.certificationExpiry)">
                {{ certificationLabel(person.certificationExpiry) }}
              </span>
              <div class="crew-rating-cell">
                <strong>{{ person.internalRating }}</strong>
                <small>{{ person.rating }}</small>
              </div>
              <div class="crew-actions-cell">
                <button type="button" class="ghost-button" @click="emits('select-person', person)">Ver perfil</button>
                <button type="button" class="ghost-button" @click="emits('assign-flight', person)">Asignar vuelo</button>
                <button type="button" class="ghost-button" @click="emits('mark-availability', person)">Bloquear fechas</button>
                <button type="button" class="ghost-button" @click="emits('view-documents', person)">Documentos</button>
                <button type="button" class="ghost-button" @click="emits('view-history', person)">Historial</button>
                <button
                  v-if="person.state === 'Suspendido'"
                  type="button"
                  class="ghost-button"
                  @click="emits('activate', person.id)"
                >
                  🟢 Activar
                </button>
                <button
                  v-else
                  type="button"
                  class="ghost-button ghost-button-danger"
                  @click="emits('suspend', person.id)"
                >
                  🔴 Suspender
                </button>
              </div>
            </div>
          </div>
        </article>

        <article class="surface crew-calendar-surface">
          <div class="section-head">
            <div>
              <p class="eyebrow">Calendario operativo</p>
              <h3>Disponibilidad semanal de crew</h3>
            </div>
            <div class="calendar-actions">
              <button type="button" class="ghost-button" @click="moveCalendarWeek(-1)">Semana previa</button>
              <button type="button" class="ghost-button" @click="jumpCalendarToToday()">Hoy</button>
              <button type="button" class="ghost-button" @click="moveCalendarWeek(1)">Siguiente</button>
            </div>
          </div>

          <div class="crew-calendar-wrap">
            <div class="crew-calendar-head">
              <span>Tripulante</span>
              <span v-for="day in calendarDays" :key="day.key" :class="{ 'is-today': day.isToday }">
                {{ day.label }}
              </span>
            </div>
            <div v-for="row in calendarRows" :key="row.person.id" class="crew-calendar-row">
              <strong>{{ row.person.name }}</strong>
              <span
                v-for="cell in row.cells"
                :key="cell.key"
                class="crew-calendar-cell"
                :data-tone="cell.tone"
              >
                {{ cell.label }}
              </span>
            </div>
          </div>
        </article>
      </div>

      <aside class="crew-side-column">
        <article class="surface crew-form-shell">
          <div class="section-head">
            <div>
              <p class="eyebrow">Perfil activo</p>
              <h3>{{ editingCrewId ? 'Editar tripulante' : 'Alta nueva' }}</h3>
            </div>
            <span class="status-pill" :data-tone="validationTone(crewForm.validationStatus)">
              {{
                String(crewForm.validationStatus || '').toLowerCase().includes('valid')
                  ? '🟢 Validado'
                  : String(crewForm.validationStatus || '').toLowerCase().includes('revision')
                    ? '🟡 En revisión'
                    : String(crewForm.validationStatus || '').toLowerCase().includes('suspend')
                      ? '🔴 Suspendido'
                      : '🟡 Pendiente'
              }}
            </span>
          </div>

          <div class="form-tabs">
            <button
              v-for="tab in formTabs"
              :key="tab.id"
              type="button"
              class="form-tab"
              :class="{ 'is-active': formTab === tab.id }"
              @click="formTab = tab.id"
            >
              {{ tab.icon }} {{ tab.label }}
            </button>
          </div>

          <div class="crew-form-scroll">
            <div v-if="formTab === 'perfil'" class="form-grid">
              <label class="span-2">
                <span>Nombre completo</span>
                <input :value="crewForm.name" type="text" @input="emits('update-field', { form: 'crew', field: 'name', value: $event.target.value })" />
                <small v-if="crewErrors.name">{{ crewErrors.name }}</small>
              </label>
              <label>
                <span>Rol</span>
                <select :value="crewForm.role" @change="emits('update-field', { form: 'crew', field: 'role', value: $event.target.value })">
                  <option v-for="item in crewRoles" :key="item" :value="item">{{ item }}</option>
                </select>
              </label>
              <label>
                <span>Base operativa</span>
                <select :value="crewForm.base" @change="emits('update-field', { form: 'crew', field: 'base', value: $event.target.value })">
                  <option value="">Selecciona</option>
                  <option v-for="item in crewBases" :key="item" :value="item">{{ item }}</option>
                </select>
                <small v-if="crewErrors.base">{{ crewErrors.base }}</small>
              </label>
              <label>
                <span>Teléfono</span>
                <input :value="crewForm.phone" type="text" @input="emits('update-field', { form: 'crew', field: 'phone', value: $event.target.value })" />
                <small v-if="crewErrors.phone">{{ crewErrors.phone }}</small>
              </label>
              <label>
                <span>Correo</span>
                <input :value="crewForm.email" type="email" @input="emits('update-field', { form: 'crew', field: 'email', value: $event.target.value })" />
                <small v-if="crewErrors.email">{{ crewErrors.email }}</small>
              </label>
              <label>
                <span>Estado</span>
                <select :value="crewForm.state" @change="emits('update-field', { form: 'crew', field: 'state', value: $event.target.value })">
                  <option v-for="item in crewStates" :key="item" :value="item">{{ item }}</option>
                </select>
              </label>
              <label>
                <span>Rating interno</span>
                <input :value="crewForm.internalRating" type="text" @input="emits('update-field', { form: 'crew', field: 'internalRating', value: $event.target.value })" />
              </label>
              <label class="span-2">
                <span>Disponibilidad</span>
                <input :value="crewForm.availability" type="text" placeholder="Inmediata / 24 hrs / Programada" @input="emits('update-field', { form: 'crew', field: 'availability', value: $event.target.value })" />
              </label>
            </div>

            <div v-else-if="formTab === 'certificaciones'" class="form-grid">
              <label class="span-2">
                <span>Certificaciones</span>
                <input :value="crewForm.certifications" type="text" placeholder="ATP, Seguridad, Cabina ejecutiva" @input="emits('update-field', { form: 'crew', field: 'certifications', value: $event.target.value })" />
                <small v-if="crewErrors.certifications">{{ crewErrors.certifications }}</small>
              </label>
              <label>
                <span>Vencimiento</span>
                <input :value="crewForm.certificationExpiry" type="date" @input="emits('update-field', { form: 'crew', field: 'certificationExpiry', value: $event.target.value })" />
              </label>
              <label>
                <span>Horas de vuelo</span>
                <input :value="crewForm.flightHours" type="number" min="0" @input="emits('update-field', { form: 'crew', field: 'flightHours', value: $event.target.value })" />
              </label>
              <label class="span-2">
                <span>Tipo de aeronave autorizado</span>
                <input :value="crewForm.authorizedAircraft" type="text" placeholder="Learjet 45, Hawker 800, Gulfstream G200" @input="emits('update-field', { form: 'crew', field: 'authorizedAircraft', value: $event.target.value })" />
              </label>
              <label class="span-2">
                <span>Idiomas</span>
                <input :value="crewForm.languages" type="text" placeholder="ES, EN" @input="emits('update-field', { form: 'crew', field: 'languages', value: $event.target.value })" />
              </label>
              <article class="match-card span-2">
                <span class="mini-label">Match operativo</span>
                <strong>✅ Compatible con</strong>
                <p>{{ crewForm.authorizedAircraft || 'Aún sin aeronaves autorizadas registradas.' }}</p>
                <strong>❌ No autorizado</strong>
                <p>Tipos no incluidos en la habilitación capturada.</p>
              </article>
            </div>

            <div v-else-if="formTab === 'documentos'" class="form-grid">
              <article class="document-checklist span-2">
                <div>
                  <strong>📄 Licencia</strong>
                  <small>Requerida para operar.</small>
                </div>
                <span class="status-pill" :data-tone="Number(crewForm.documentsCount || 0) > 0 ? 'success' : 'warning'">
                  {{ Number(crewForm.documentsCount || 0) > 0 ? 'Cargado' : 'Pendiente' }}
                </span>
              </article>
              <article class="document-checklist span-2">
                <div>
                  <strong>🩺 Médico</strong>
                  <small>Control de vigencia operacional.</small>
                </div>
                <span class="status-pill" :data-tone="certificationTone(crewForm.certificationExpiry)">
                  {{ certificationLabel(crewForm.certificationExpiry) }}
                </span>
              </article>
              <article class="document-checklist span-2">
                <div>
                  <strong>🛂 Visa / Pasaporte</strong>
                  <small>Necesarios para operación internacional.</small>
                </div>
                <span class="status-pill" data-tone="neutral">Pendiente de carga PDF</span>
              </article>
              <label>
                <span>Documentos cargados</span>
                <input :value="crewForm.documentsCount" type="number" min="0" @input="emits('update-field', { form: 'crew', field: 'documentsCount', value: $event.target.value })" />
              </label>
              <label>
                <span>Estado de validación</span>
                <input :value="crewForm.validationStatus" type="text" @input="emits('update-field', { form: 'crew', field: 'validationStatus', value: $event.target.value })" />
              </label>
              <button type="button" class="ghost-button span-2" @click="emits('view-documents', crewForm)">
                Subir / revisar PDFs
              </button>
            </div>

            <div v-else class="form-grid">
              <article class="history-card span-2">
                <span class="mini-label">Última actualización</span>
                <strong>{{ lastUpdatedLabel(crewForm.lastUpdated) }}</strong>
                <small>Sincronización más reciente del perfil operativo.</small>
              </article>
              <article class="history-card">
                <span class="mini-label">Horas</span>
                <strong>{{ crewForm.flightHours || 0 }}</strong>
                <small>Horas totales registradas.</small>
              </article>
              <article class="history-card">
                <span class="mini-label">Crew Score</span>
                <strong>{{ crewForm.internalRating || '4.9' }}</strong>
                <small>Puntualidad, operaciones y feedback.</small>
              </article>
              <button type="button" class="ghost-button span-2" @click="emits('view-history', crewForm)">
                Ver historial de vuelos e incidencias
              </button>
            </div>
          </div>

          <small v-if="crewErrors._form" class="form-error">{{ crewErrors._form }}</small>

          <div class="form-actions">
            <button type="button" class="primary-action" :disabled="savingCrew" @click="emits('create')">
              {{ savingCrew ? 'Guardando...' : editingCrewId ? 'Guardar cambios' : 'Crear tripulante' }}
            </button>
            <button v-if="editingCrewId" type="button" class="ghost-button" :disabled="savingCrew" @click="emits('reset-form')">
              Cancelar edición
            </button>
          </div>
        </article>
      </aside>
    </div>
  </section>
</template>

<style scoped src="./OperatorCrewSection.css"></style>
