<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { resolveRoleSectionPath } from '../../data/roleFlows'
import { pickCollection, requestWithCandidates } from '../../lib/backendCrud'

const props = defineProps({
  providers: { type: Array, default: () => [] },
  aircraft: { type: Array, default: () => [] },
})

const router = useRouter()

const filters = reactive({
  companyId: 'all',
  aircraftId: 'all',
  status: 'all',
})

const loading = ref(false)
const errorMessage = ref('')
const lastUpdatedAt = ref(null)
const viewMode = ref('month')
const anchorDate = ref(toDateKey(new Date()))
const calendarEvents = ref([])
const aircraftOptions = ref([])
const companyOptions = ref([])
const summary = ref({
  total_aircraft: 0,
  available_aircraft: 0,
  occupied_aircraft: 0,
  maintenance_aircraft: 0,
  upcoming_flights_today: 0,
  flights_by_company: [],
})
const operationsDashboard = ref({
  flights_today: 0,
  aircraft_available: 0,
  aircraft_occupied: 0,
  aircraft_maintenance: 0,
  payments_pending: 0,
  contracts_pending: 0,
  upcoming_flights: [],
  operational_alerts: [],
})
const operationHistory = ref([])
const adminNotifications = ref([])
const selectedEvent = ref(null)
const submittingManualBlock = ref(false)
const submittingRelease = ref(false)
const manualBlockError = ref('')
const releaseError = ref('')
const manualBlockDraft = reactive({
  aircraftId: 'all',
  blockType: 'manual_block',
  start: '',
  end: '',
  reason: '',
})
let latestRequestId = 0

const statusOptions = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'paid', label: 'Reserva pagada' },
  { value: 'pending_payment', label: 'Pago pendiente' },
  { value: 'in_flight', label: 'Vuelo en curso' },
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'out_of_service', label: 'Fuera de servicio' },
  { value: 'manual_block', label: 'Bloqueo manual' },
  { value: 'reserved', label: 'Reservada' },
  { value: 'released', label: 'Liberada' },
  { value: 'cancelled', label: 'Cancelada' },
]

const legendItems = [
  { label: 'Reserva pagada', color: '#22c55e' },
  { label: 'Pago pendiente', color: '#eab308' },
  { label: 'Vuelo en curso', color: '#3b82f6' },
  { label: 'Mantenimiento', color: '#f97316' },
  { label: 'Fuera de servicio', color: '#ef4444' },
  { label: 'Bloqueo manual', color: '#9ca3af' },
]

function pad(value) {
  return String(value).padStart(2, '0')
}

function toDateKey(date) {
  const resolved = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(resolved.getTime())) return ''
  return `${resolved.getFullYear()}-${pad(resolved.getMonth() + 1)}-${pad(resolved.getDate())}`
}

function parseDate(value) {
  if (!value) return null
  if (value instanceof Date) return new Date(value.getTime())
  const normalized = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function startOfDay(value) {
  const date = parseDate(value)
  if (!date) return null
  date.setHours(0, 0, 0, 0)
  return date
}

function endOfDay(value) {
  const date = parseDate(value)
  if (!date) return null
  date.setHours(23, 59, 59, 999)
  return date
}

function addDays(value, amount) {
  const date = parseDate(value)
  if (!date) return null
  date.setDate(date.getDate() + amount)
  return date
}

function addMonths(value, amount) {
  const date = parseDate(value)
  if (!date) return null
  date.setMonth(date.getMonth() + amount)
  return date
}

function startOfWeek(value) {
  const date = startOfDay(value)
  if (!date) return null
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  return date
}

function endOfWeek(value) {
  return endOfDay(addDays(startOfWeek(value), 6))
}

function startOfMonth(value) {
  const date = startOfDay(value)
  if (!date) return null
  date.setDate(1)
  return date
}

function endOfMonth(value) {
  const date = startOfMonth(value)
  if (!date) return null
  date.setMonth(date.getMonth() + 1, 0)
  return endOfDay(date)
}

function formatDateTime(value) {
  const date = parseDate(value)
  if (!date) return 'Sin horario'
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatHistoryDate(value) {
  const date = parseDate(value)
  if (!date) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function normalizeAircraftOption(item = {}) {
  return {
    id: item.id || item.aircraft_id || null,
    company_id: item.company_id || item.provider_id || item.provider?.id || null,
    company_name:
      item.company_name ||
      item.provider_name ||
      item.provider?.commercial_name ||
      item.provider?.company_name ||
      'Operador sin nombre',
    aircraft_name:
      item.aircraft_name ||
      [item.registration, item.model].filter(Boolean).join(' · ') ||
      item.model ||
      'Aeronave',
    registration: item.registration || '',
    model: item.model || item.aircraft_model || '',
    category: item.category || '',
    status: item.status || '',
    base_airport: item.base_airport || '',
  }
}

function normalizeCompanyOption(item = {}) {
  return {
    id: item.id || item.company_id || null,
    name: item.name || item.company_name || item.commercial_name || 'Operador sin nombre',
  }
}

function uniqueBy(collection = [], keyBuilder) {
  const seen = new Set()
  return collection.filter((item) => {
    const key = keyBuilder(item)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const visibleRange = computed(() => {
  const base = parseDate(anchorDate.value) || new Date()

  if (viewMode.value === 'day') {
    return {
      start: startOfDay(base),
      end: endOfDay(base),
    }
  }

  if (viewMode.value === 'week') {
    return {
      start: startOfWeek(base),
      end: endOfWeek(base),
    }
  }

  return {
    start: startOfMonth(base),
    end: endOfMonth(base),
  }
})

const rangeTitle = computed(() => {
  const { start, end } = visibleRange.value
  if (!start || !end) return ''

  if (viewMode.value === 'day') {
    return new Intl.DateTimeFormat('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(start)
  }

  if (viewMode.value === 'week') {
    return `${new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(start)} - ${new Intl.DateTimeFormat('es-MX', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(end)}`
  }

  return new Intl.DateTimeFormat('es-MX', {
    month: 'long',
    year: 'numeric',
  }).format(start)
})

const slotWidth = computed(() => (viewMode.value === 'day' ? 88 : viewMode.value === 'week' ? 120 : 44))

const timelineSlots = computed(() => {
  const { start, end } = visibleRange.value
  if (!start || !end) return []

  if (viewMode.value === 'day') {
    return Array.from({ length: 24 }, (_, hour) => {
      const date = new Date(start.getTime())
      date.setHours(hour, 0, 0, 0)
      return {
        key: `${toDateKey(date)}-${hour}`,
        primary: pad(hour),
        secondary: 'h',
      }
    })
  }

  const days = []
  let cursor = new Date(start.getTime())
  while (cursor <= end) {
    days.push({
      key: toDateKey(cursor),
      primary: new Intl.DateTimeFormat('es-MX', { weekday: 'short' }).format(cursor),
      secondary: new Intl.DateTimeFormat('es-MX', { day: '2-digit' }).format(cursor),
    })
    cursor = addDays(cursor, 1)
  }
  return days
})

const normalizedEvents = computed(() =>
  calendarEvents.value
    .map((item) => {
      const start = parseDate(item.start)
      const end = parseDate(item.end)
      if (!start || !end) return null

      return {
        ...item,
        startDate: start,
        endDate: end,
      }
    })
    .filter(Boolean),
)

const filteredEvents = computed(() => {
  if (filters.status === 'all') return normalizedEvents.value
  return normalizedEvents.value.filter((event) => event.status === filters.status)
})

const activeAircraftOptions = computed(() => {
  if (filters.companyId === 'all') return aircraftOptions.value
  return aircraftOptions.value.filter((item) => String(item.company_id || '') === String(filters.companyId))
})

const visibleAircraftOptions = computed(() => {
  if (filters.aircraftId === 'all') return activeAircraftOptions.value
  return activeAircraftOptions.value.filter((item) => String(item.id || '') === String(filters.aircraftId))
})

const eventsByAircraft = computed(() => {
  const map = new Map()
  filteredEvents.value.forEach((event) => {
    const key = String(event.aircraft_id || '')
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(event)
  })
  return map
})

const totalVisibleMs = computed(() => {
  const { start, end } = visibleRange.value
  return Math.max((end?.getTime() || 0) - (start?.getTime() || 0), 1)
})

function buildEventStyle(event, track) {
  const startMs = Math.max(event.startDate.getTime(), visibleRange.value.start.getTime())
  const endMs = Math.min(event.endDate.getTime(), visibleRange.value.end.getTime())
  const left = ((startMs - visibleRange.value.start.getTime()) / totalVisibleMs.value) * 100
  const width = Math.max(((endMs - startMs) / totalVisibleMs.value) * 100, 1.8)

  return {
    left: `${left}%`,
    width: `${width}%`,
    top: `${track * 40 + 8}px`,
    backgroundColor: event.color || '#9ca3af',
  }
}

function assignTracks(events = []) {
  const sorted = [...events].sort((left, right) => left.startDate - right.startDate)
  const tracks = []
  const items = []

  sorted.forEach((event) => {
    let trackIndex = tracks.findIndex((trackEnd) => event.startDate.getTime() >= trackEnd)
    if (trackIndex === -1) {
      trackIndex = tracks.length
      tracks.push(event.endDate.getTime())
    } else {
      tracks[trackIndex] = event.endDate.getTime()
    }

    items.push({
      ...event,
      track: trackIndex,
      style: buildEventStyle(event, trackIndex),
    })
  })

  return {
    items,
    trackCount: Math.max(tracks.length, 1),
  }
}

const calendarRows = computed(() =>
  visibleAircraftOptions.value.map((aircraft) => {
    const events = eventsByAircraft.value.get(String(aircraft.id || '')) || []
    const trackLayout = assignTracks(events)

    return {
      ...aircraft,
      events: trackLayout.items,
      rowHeight: Math.max(trackLayout.trackCount * 40 + 12, 54),
    }
  }),
)

const timelineStyle = computed(() => ({
  '--slots': timelineSlots.value.length || 1,
  minWidth: `${Math.max((timelineSlots.value.length || 1) * slotWidth.value, 720)}px`,
}))

const flightsByCompany = computed(() => {
  return Array.from(
    filteredEvents.value.reduce((accumulator, event) => {
      const key = String(event.company_id || 'sin-empresa')
      const current = accumulator.get(key) || {
        company_id: event.company_id || null,
        company_name: event.company_name || 'Operador sin nombre',
        total: 0,
      }
      current.total += 1
      accumulator.set(key, current)
      return accumulator
    }, new Map()).values(),
  )
    .sort((left, right) => right.total - left.total)
})

const visibleSummary = computed(() => {
  const visibleAircraftIds = new Set(visibleAircraftOptions.value.map((item) => String(item.id || '')))
  const occupiedAircraftIds = new Set(filteredEvents.value.map((event) => String(event.aircraft_id || '')))
  const maintenanceAircraftIds = new Set(
    filteredEvents.value
      .filter((event) => ['maintenance', 'out_of_service'].includes(event.status))
      .map((event) => String(event.aircraft_id || '')),
  )
  const today = toDateKey(new Date())

  return {
    total_aircraft: visibleAircraftOptions.value.length,
    available_aircraft: Math.max(visibleAircraftIds.size - occupiedAircraftIds.size, 0),
    occupied_aircraft: occupiedAircraftIds.size,
    maintenance_aircraft: maintenanceAircraftIds.size,
    upcoming_flights_today: filteredEvents.value.filter((event) => event.start_date === today).length,
  }
})

const lastUpdatedLabel = computed(() => {
  if (!lastUpdatedAt.value) return ''
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(lastUpdatedAt.value)
})

async function loadCalendar() {
  const requestId = ++latestRequestId
  loading.value = true
  errorMessage.value = ''

  try {
    const response = await requestWithCandidates([
      {
        method: 'get',
        path: '/admin/aircraft-calendar',
        query: {
          start_date: toDateKey(visibleRange.value.start),
          end_date: toDateKey(visibleRange.value.end),
          ...(filters.companyId !== 'all' ? { company_id: filters.companyId } : {}),
          ...(filters.aircraftId !== 'all' ? { aircraft_id: filters.aircraftId } : {}),
        },
        timeoutMs: 20000,
      },
    ])

    if (requestId !== latestRequestId) return

    calendarEvents.value = pickCollection(response, ['calendar'])
    aircraftOptions.value = uniqueBy(
      pickCollection(response, ['aircraft']).map(normalizeAircraftOption),
      (item) => String(item.id || ''),
    )
    companyOptions.value = uniqueBy(
      pickCollection(response, ['companies']).map(normalizeCompanyOption),
      (item) => String(item.id || item.name || ''),
    )
    summary.value = response.summary || summary.value
    lastUpdatedAt.value = new Date()

    if (!companyOptions.value.length) {
      companyOptions.value = uniqueBy(props.providers.map(normalizeCompanyOption), (item) => String(item.id || item.name || ''))
    }

    if (!aircraftOptions.value.length) {
      aircraftOptions.value = uniqueBy(props.aircraft.map(normalizeAircraftOption), (item) => String(item.id || ''))
    }

    if (manualBlockDraft.aircraftId === 'all' && aircraftOptions.value.length === 1) {
      manualBlockDraft.aircraftId = String(aircraftOptions.value[0].id)
    }
  } catch (error) {
    if (requestId !== latestRequestId) return
    errorMessage.value = error?.message || 'No fue posible cargar el calendario de disponibilidad.'
  } finally {
    if (requestId === latestRequestId) {
      loading.value = false
    }
  }
}

async function loadOperationalPanels() {
  const companyId = filters.companyId !== 'all' ? filters.companyId : undefined

  const [dashboardResponse, historyResponse, notificationsResponse] = await Promise.all([
    requestWithCandidates([
      {
        method: 'get',
        path: '/admin/operations/dashboard',
        query: {
          ...(companyId ? { company_id: companyId } : {}),
        },
        timeoutMs: 20000,
      },
    ]),
    requestWithCandidates([
      {
        method: 'get',
        path: '/admin/operations/history',
        query: { per_page: 8 },
        timeoutMs: 20000,
      },
    ]),
    requestWithCandidates([
      {
        method: 'get',
        path: '/admin/operations/notifications',
        query: { per_page: 8 },
        timeoutMs: 20000,
      },
    ]),
  ])

  operationsDashboard.value = dashboardResponse.dashboard || operationsDashboard.value
  operationHistory.value = pickCollection(historyResponse, ['history', 'data'])
  adminNotifications.value = pickCollection(notificationsResponse, ['notifications', 'data'])
}

async function loadOperationalWorkspace() {
  await Promise.all([loadCalendar(), loadOperationalPanels()])
}

function refreshCalendar() {
  void loadOperationalWorkspace()
}

function shiftRange(direction = 1) {
  const base = parseDate(anchorDate.value) || new Date()

  if (viewMode.value === 'day') {
    anchorDate.value = toDateKey(addDays(base, direction))
    return
  }

  if (viewMode.value === 'week') {
    anchorDate.value = toDateKey(addDays(base, direction * 7))
    return
  }

  anchorDate.value = toDateKey(addMonths(base, direction))
}

function goToday() {
  anchorDate.value = toDateKey(new Date())
}

function openEvent(event) {
  selectedEvent.value = event
}

function closeEventModal() {
  selectedEvent.value = null
  releaseError.value = ''
}

function openReservationFlow() {
  if (!selectedEvent.value?.reservation_id) return
  router.push({
    path: resolveRoleSectionPath('admin', 'reservas'),
    query: {
      reservation: String(selectedEvent.value.reservation_id),
    },
  })
}

async function submitManualBlock() {
  if (submittingManualBlock.value) return

  manualBlockError.value = ''
  submittingManualBlock.value = true

  try {
    const response = await requestWithCandidates([
      {
        method: 'post',
        path: '/admin/operations/aircraft-blocks',
        body: {
          aircraft_id: manualBlockDraft.aircraftId,
          block_type: manualBlockDraft.blockType,
          start_datetime: manualBlockDraft.start,
          end_datetime: manualBlockDraft.end,
          reason: manualBlockDraft.reason || undefined,
        },
        timeoutMs: 20000,
      },
    ])

    const block = response.block || {}
    manualBlockDraft.aircraftId = filters.aircraftId !== 'all' ? filters.aircraftId : 'all'
    manualBlockDraft.blockType = 'manual_block'
    manualBlockDraft.start = ''
    manualBlockDraft.end = ''
    manualBlockDraft.reason = ''

    if (block.aircraft_id) {
      filters.aircraftId = String(block.aircraft_id)
    }

    await loadOperationalWorkspace()
  } catch (error) {
    manualBlockError.value =
      error?.message || 'No fue posible crear el bloqueo administrativo.'
  } finally {
    submittingManualBlock.value = false
  }
}

async function releaseSelectedBlock() {
  if (!selectedEvent.value?.id || submittingRelease.value) return

  releaseError.value = ''
  submittingRelease.value = true

  try {
    await requestWithCandidates([
      {
        method: 'post',
        path: `/admin/operations/aircraft-blocks/${selectedEvent.value.id}/release`,
        body: {
          reason: `Bloqueo liberado desde calendario admin${selectedEvent.value.reason ? `: ${selectedEvent.value.reason}` : '.'}`,
        },
        timeoutMs: 20000,
      },
    ])
    closeEventModal()
    await loadOperationalWorkspace()
  } catch (error) {
    releaseError.value = error?.message || 'No fue posible liberar el bloqueo.'
  } finally {
    submittingRelease.value = false
  }
}

watch(
  [viewMode, anchorDate, () => filters.companyId, () => filters.aircraftId],
  () => {
    if (manualBlockDraft.aircraftId === 'all' && filters.aircraftId !== 'all') {
      manualBlockDraft.aircraftId = filters.aircraftId
    }
    void loadOperationalWorkspace()
  },
  { immediate: true },
)

watch(
  () => filters.companyId,
  () => {
    if (
      filters.aircraftId !== 'all' &&
      !activeAircraftOptions.value.some((item) => String(item.id) === String(filters.aircraftId))
    ) {
      filters.aircraftId = 'all'
    }
  },
)

onMounted(() => {
  if (!aircraftOptions.value.length && props.aircraft.length) {
    aircraftOptions.value = uniqueBy(props.aircraft.map(normalizeAircraftOption), (item) => String(item.id || ''))
  }

  if (!companyOptions.value.length && props.providers.length) {
    companyOptions.value = uniqueBy(props.providers.map(normalizeCompanyOption), (item) => String(item.id || item.name || ''))
  }

  if (manualBlockDraft.aircraftId === 'all' && aircraftOptions.value.length === 1) {
    manualBlockDraft.aircraftId = String(aircraftOptions.value[0].id)
  }
})
</script>

<template>
  <section class="surface aircraft-calendar-page">
    <header class="calendar-page__head">
      <div>
        <span class="eyebrow">Disponibilidad de aeronaves</span>
        <h3>Calendario operativo de flota</h3>
        <p>
          Consulta ocupacion real por operador usando los bloques de disponibilidad y la reserva asociada.
        </p>
      </div>

      <div class="calendar-page__actions">
        <div class="view-switch">
          <button
            v-for="mode in ['month', 'week', 'day']"
            :key="mode"
            type="button"
            :class="{ active: viewMode === mode }"
            @click="viewMode = mode"
          >
            {{ mode === 'month' ? 'Mes' : mode === 'week' ? 'Semana' : 'Dia' }}
          </button>
        </div>

        <div class="range-switch">
          <button type="button" @click="shiftRange(-1)">Anterior</button>
          <strong>{{ rangeTitle }}</strong>
          <button type="button" @click="shiftRange(1)">Siguiente</button>
          <button type="button" class="ghost" @click="goToday">Hoy</button>
          <button type="button" class="ghost" @click="refreshCalendar">Actualizar</button>
        </div>
      </div>
    </header>

    <section class="calendar-toolbar">
      <label>
        <span>Empresa</span>
        <select v-model="filters.companyId">
          <option value="all">Todas</option>
          <option v-for="company in companyOptions" :key="company.id" :value="String(company.id)">
            {{ company.name }}
          </option>
        </select>
      </label>

      <label>
        <span>Aeronave</span>
        <select v-model="filters.aircraftId">
          <option value="all">Todas</option>
          <option v-for="item in activeAircraftOptions" :key="item.id" :value="String(item.id)">
            {{ item.aircraft_name }}
          </option>
        </select>
      </label>

      <label>
        <span>Estado</span>
        <select v-model="filters.status">
          <option v-for="option in statusOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
    </section>

    <section class="calendar-legend">
      <article v-for="item in legendItems" :key="item.label">
        <span :style="{ backgroundColor: item.color }"></span>
        <strong>{{ item.label }}</strong>
      </article>
    </section>

    <div class="calendar-layout">
      <section class="calendar-stage">
        <div v-if="loading" class="calendar-state">Cargando disponibilidad de flota...</div>
        <div v-else-if="errorMessage" class="calendar-state calendar-state--error">{{ errorMessage }}</div>
        <div v-else-if="!calendarRows.length" class="calendar-state">
          No hay aeronaves para este filtro.
        </div>
        <div v-else class="calendar-grid-wrap">
          <div class="calendar-grid" :style="timelineStyle">
            <div class="calendar-grid__row calendar-grid__row--head">
              <div class="calendar-aircraft-head">Flota</div>
              <div v-for="slot in timelineSlots" :key="slot.key" class="calendar-slot-head">
                <strong>{{ slot.primary }}</strong>
                <span>{{ slot.secondary }}</span>
              </div>
            </div>

            <div
              v-for="row in calendarRows"
              :key="row.id"
              class="calendar-grid__row calendar-grid__row--body"
              :style="{ '--row-height': `${row.rowHeight}px` }"
            >
              <div class="calendar-aircraft-card">
                <strong>{{ row.registration || row.model || row.aircraft_name }}</strong>
                <span>{{ row.model || row.aircraft_name }}</span>
                <small>{{ row.company_name }}</small>
              </div>

              <div
                class="calendar-row-track"
                :style="{ gridColumn: `span ${timelineSlots.length}`, minHeight: `${row.rowHeight}px` }"
              >
                <div class="calendar-row-track__slots">
                  <div v-for="slot in timelineSlots" :key="`${row.id}-${slot.key}`" class="calendar-slot-cell"></div>
                </div>

                <button
                  v-for="event in row.events"
                  :key="event.id"
                  type="button"
                  class="calendar-event"
                  :style="event.style"
                  @click="openEvent(event)"
                >
                  <strong>{{ event.registration || event.model || event.aircraft_name }}</strong>
                  <span>{{ event.client_name || event.company_name }}</span>
                  <small>{{ event.origin }} - {{ event.destination }}</small>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <aside class="calendar-sidebar">
        <article class="sidebar-card">
          <span class="eyebrow">Resumen</span>
          <p v-if="lastUpdatedLabel" class="muted">Actualizado: {{ lastUpdatedLabel }}</p>
          <div class="sidebar-stats">
            <div>
              <span>Aeronaves disponibles</span>
              <strong>{{ visibleSummary.available_aircraft || 0 }}</strong>
            </div>
            <div>
              <span>Aeronaves ocupadas</span>
              <strong>{{ visibleSummary.occupied_aircraft || 0 }}</strong>
            </div>
            <div>
              <span>En mantenimiento</span>
              <strong>{{ visibleSummary.maintenance_aircraft || 0 }}</strong>
            </div>
            <div>
              <span>Proximos vuelos hoy</span>
              <strong>{{ visibleSummary.upcoming_flights_today || 0 }}</strong>
            </div>
            <div>
              <span>Pagos pendientes</span>
              <strong>{{ operationsDashboard.payments_pending || 0 }}</strong>
            </div>
            <div>
              <span>Contratos pendientes</span>
              <strong>{{ operationsDashboard.contracts_pending || 0 }}</strong>
            </div>
          </div>
        </article>

        <article class="sidebar-card">
          <span class="eyebrow">Bloqueo administrativo</span>
          <div class="manual-block-form">
            <label>
              <span>Aeronave</span>
              <select v-model="manualBlockDraft.aircraftId">
                <option value="all" disabled>Selecciona una aeronave</option>
                <option v-for="item in activeAircraftOptions" :key="`block-${item.id}`" :value="String(item.id)">
                  {{ item.aircraft_name }}
                </option>
              </select>
            </label>
            <label>
              <span>Tipo</span>
              <select v-model="manualBlockDraft.blockType">
                <option value="manual_block">Bloqueo manual</option>
                <option value="maintenance">Mantenimiento</option>
                <option value="inspection">Inspeccion</option>
                <option value="out_of_service">Fuera de servicio</option>
              </select>
            </label>
            <label>
              <span>Inicio</span>
              <input v-model="manualBlockDraft.start" type="datetime-local" />
            </label>
            <label>
              <span>Fin</span>
              <input v-model="manualBlockDraft.end" type="datetime-local" />
            </label>
            <label>
              <span>Motivo</span>
              <textarea v-model="manualBlockDraft.reason" rows="3" placeholder="Motivo operativo o administrativo"></textarea>
            </label>
            <p v-if="manualBlockError" class="calendar-inline-error">{{ manualBlockError }}</p>
            <button
              type="button"
              :disabled="submittingManualBlock || manualBlockDraft.aircraftId === 'all' || !manualBlockDraft.start || !manualBlockDraft.end"
              @click="submitManualBlock"
            >
              {{ submittingManualBlock ? 'Guardando...' : 'Crear bloqueo' }}
            </button>
          </div>
        </article>

        <article class="sidebar-card">
          <span class="eyebrow">Vuelos por empresa</span>
          <div v-if="flightsByCompany.length" class="company-totals">
            <div v-for="item in flightsByCompany" :key="`${item.company_id}-${item.company_name}`">
              <span>{{ item.company_name }}</span>
              <strong>{{ item.total }}</strong>
            </div>
          </div>
          <p v-else class="muted">Sin vuelos bloqueados en la ventana actual.</p>
        </article>

        <article class="sidebar-card">
          <span class="eyebrow">Proximos vuelos</span>
          <div v-if="operationsDashboard.upcoming_flights?.length" class="activity-list">
            <div v-for="flight in operationsDashboard.upcoming_flights" :key="`flight-${flight.block_id}`">
              <strong>{{ flight.aircraft_name || 'Aeronave' }}</strong>
              <span>{{ flight.client_name || flight.company_name || 'Sin cliente' }}</span>
              <small>{{ formatDateTime(flight.start) }}</small>
            </div>
          </div>
          <p v-else class="muted">Sin salidas proximas registradas.</p>
        </article>

        <article class="sidebar-card">
          <span class="eyebrow">Alertas operativas</span>
          <div v-if="operationsDashboard.operational_alerts?.length" class="activity-list">
            <div v-for="alert in operationsDashboard.operational_alerts" :key="`${alert.type}-${alert.aircraft_id || alert.title}`">
              <strong>{{ alert.title }}</strong>
              <span>{{ alert.message }}</span>
            </div>
          </div>
          <p v-else class="muted">Sin alertas activas.</p>
        </article>

        <article class="sidebar-card">
          <span class="eyebrow">Bitacora operativa</span>
          <div v-if="operationHistory.length" class="activity-list">
            <div v-for="entry in operationHistory" :key="`history-${entry.id}`">
              <strong>{{ entry.description || entry.action }}</strong>
              <span>{{ entry.user?.name || 'Sistema' }}</span>
              <small>{{ formatHistoryDate(entry.created_at) }}</small>
            </div>
          </div>
          <p v-else class="muted">Sin movimientos recientes.</p>
        </article>

        <article class="sidebar-card">
          <span class="eyebrow">Notificaciones admin</span>
          <div v-if="adminNotifications.length" class="activity-list">
            <div v-for="notification in adminNotifications" :key="`notification-${notification.id}`">
              <strong>{{ notification.title || notification.type }}</strong>
              <span>{{ notification.message || 'Sin detalle' }}</span>
              <small>{{ formatHistoryDate(notification.created_at) }}</small>
            </div>
          </div>
          <p v-else class="muted">Sin notificaciones recientes.</p>
        </article>
      </aside>
    </div>

    <div v-if="selectedEvent" class="calendar-modal-backdrop" @click.self="closeEventModal">
      <section class="surface calendar-modal" role="dialog" aria-modal="true" aria-label="Detalle de bloqueo">
        <div class="calendar-modal__head">
          <div>
            <span class="eyebrow">Detalle del evento</span>
            <h4>{{ selectedEvent.aircraft_name }}</h4>
            <p>{{ selectedEvent.company_name }}</p>
          </div>
          <button type="button" class="button-reset close-button" @click="closeEventModal">Cerrar</button>
        </div>

        <div class="calendar-modal__grid">
          <div><span>Matricula</span><strong>{{ selectedEvent.registration || 'Sin dato' }}</strong></div>
          <div><span>Modelo</span><strong>{{ selectedEvent.model || 'Sin dato' }}</strong></div>
          <div><span>Cliente</span><strong>{{ selectedEvent.client_name || 'Sin cliente asociado' }}</strong></div>
          <div><span>Ruta</span><strong>{{ selectedEvent.origin }} - {{ selectedEvent.destination }}</strong></div>
          <div><span>Salida</span><strong>{{ formatDateTime(selectedEvent.start) }}</strong></div>
          <div><span>Llegada</span><strong>{{ formatDateTime(selectedEvent.end) }}</strong></div>
          <div><span>Estado</span><strong>{{ selectedEvent.status }}</strong></div>
          <div><span>Motivo</span><strong>{{ selectedEvent.reason || 'Sin motivo' }}</strong></div>
          <div><span>Reserva</span><strong>{{ selectedEvent.reservation_code || selectedEvent.reservation_id || 'Sin reserva' }}</strong></div>
          <div><span>Pago</span><strong>{{ selectedEvent.payment_status || 'Sin dato' }}</strong></div>
        </div>

        <div class="calendar-modal__actions">
          <button
            type="button"
            :disabled="!selectedEvent.reservation_id"
            @click="openReservationFlow"
          >
            Ir al flujo de reserva
          </button>
          <button
            v-if="selectedEvent.block_status === 'active'"
            type="button"
            class="ghost"
            :disabled="submittingRelease"
            @click="releaseSelectedBlock"
          >
            {{ submittingRelease ? 'Liberando...' : 'Liberar bloqueo' }}
          </button>
        </div>
        <p v-if="releaseError" class="calendar-inline-error">{{ releaseError }}</p>
      </section>
    </div>
  </section>
</template>

<style scoped>
.aircraft-calendar-page {
  display: grid;
  gap: 1.25rem;
  padding: 1.25rem;
    background-color: #fff;
}

.calendar-page__head,
.calendar-page__actions,
.calendar-toolbar,
.calendar-layout,
.calendar-legend,
.range-switch,
.view-switch,
.sidebar-stats,
.company-totals,
.calendar-modal__grid,
.calendar-modal__actions,
.manual-block-form,
.activity-list {
  display: grid;
  gap: 0.9rem;
}

.calendar-page__head {
  grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.9fr);
  align-items: start;
}

.calendar-page__head h3,
.calendar-modal__head h4 {
  margin: 0.2rem 0 0;
  color: #0f172a;
}

.calendar-page__head p,
.calendar-modal__head p,
.muted {
  margin: 0;
  color: #64748b;
}

.calendar-page__actions {
  justify-items: end;
}

.view-switch,
.range-switch {
  grid-auto-flow: column;
  align-items: center;
  justify-content: end;
}

.view-switch button,
.range-switch button,
.calendar-modal__actions button,
.manual-block-form button {
  min-height: 42px;
  padding: 0.7rem 1rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.32);
  background: #fff;
  color: #0f172a;
  font-weight: 700;
}

.view-switch button.active {
  background: #0f172a;
  border-color: #0f172a;
  color: #fff;
}

.range-switch strong {
  color: #0f172a;
}

.range-switch .ghost {
  background: rgba(15, 23, 42, 0.04);
}

.calendar-toolbar {
  grid-template-columns: repeat(3, minmax(180px, 1fr));
}

.calendar-toolbar label {
  display: grid;
  gap: 0.45rem;
}

.calendar-toolbar span,
.calendar-aircraft-card span,
.calendar-aircraft-card small,
.calendar-slot-head span,
.sidebar-card span,
.calendar-modal__grid span {
  color: #64748b;
}

.calendar-toolbar select {
  min-height: 46px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  padding: 0.75rem 0.9rem;
  background: #fff;
}

.manual-block-form label {
  display: grid;
  gap: 0.45rem;
}

.manual-block-form select,
.manual-block-form input,
.manual-block-form textarea {
  width: 100%;
  min-height: 46px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  padding: 0.75rem 0.9rem;
  background: #fff;
  color: #0f172a;
}

.manual-block-form textarea {
  min-height: 96px;
  resize: vertical;
}

.manual-block-form button {
  background: #0f172a;
  border-color: #0f172a;
  color: #fff;
}

.calendar-legend {
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

.calendar-legend article,
.sidebar-stats div,
.company-totals div,
.activity-list div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.calendar-legend article {
  padding: 0.8rem 0.9rem;
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.96);
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.calendar-legend span {
  width: 14px;
  height: 14px;
  border-radius: 999px;
}

.calendar-layout {
  grid-template-columns: minmax(0, 1fr) 300px;
  align-items: start;
}

.calendar-stage,
.calendar-sidebar {
  min-width: 0;
}

.calendar-grid-wrap {
  overflow: auto;
  border-radius: 24px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(248, 250, 252, 0.98));
}

.calendar-grid {
  display: grid;
}

.calendar-grid__row {
  display: grid;
  grid-template-columns: 240px repeat(var(--slots, 1), minmax(0, 1fr));
}

.calendar-grid__row--head {
  position: sticky;
  top: 0;
  z-index: 4;
}

.calendar-aircraft-head,
.calendar-slot-head {
  padding: 0.95rem 0.7rem;
  background: #f8fafc;
  border-bottom: 1px solid rgba(148, 163, 184, 0.22);
}

.calendar-aircraft-head {
  position: sticky;
  left: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  color: #0f172a;
  font-weight: 800;
}

.calendar-slot-head {
  min-width: 0;
  border-left: 1px solid rgba(148, 163, 184, 0.16);
  text-align: center;
}

.calendar-slot-head strong,
.calendar-aircraft-card strong,
.sidebar-card strong,
.calendar-modal__grid strong {
  color: #0f172a;
}

.activity-list div {
  align-items: flex-start;
  flex-direction: column;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.activity-list div:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.calendar-grid__row--body {
  position: relative;
}

.calendar-aircraft-card {
  position: sticky;
  left: 0;
  z-index: 3;
  display: grid;
  gap: 0.2rem;
  align-content: center;
  padding: 0.95rem 0.85rem;
  background: rgba(255, 255, 255, 0.98);
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
}

.calendar-row-track {
  position: relative;
  overflow: hidden;
  border-left: 1px solid rgba(148, 163, 184, 0.1);
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.6), rgba(255, 255, 255, 0.96));
}

.calendar-row-track__slots {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(var(--slots, 1), minmax(0, 1fr));
}

.calendar-slot-cell {
  border-left: 1px solid rgba(148, 163, 184, 0.12);
}

.calendar-event {
  position: absolute;
  display: grid;
  gap: 0.1rem;
  padding: 0.45rem 0.6rem;
  border: 0;
  border-radius: 14px;
  color: #fff;
  text-align: left;
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.14);
}

.calendar-event strong,
.calendar-event span,
.calendar-event small {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.calendar-event strong {
  color: inherit;
}

.calendar-event span,
.calendar-event small {
  color: rgba(255, 255, 255, 0.92);
}

.calendar-state {
  padding: 1.2rem;
  border-radius: 22px;
  background: rgba(248, 250, 252, 0.98);
  border: 1px dashed rgba(148, 163, 184, 0.4);
  color: #475569;
}

.calendar-state--error {
  color: #b91c1c;
}

.calendar-sidebar {
  display: grid;
  gap: 1rem;
}

.sidebar-card {
  display: grid;
  gap: 0.85rem;
  padding: 1rem;
  border-radius: 22px;
  background: rgba(248, 250, 252, 0.96);
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.sidebar-stats div,
.company-totals div {
  padding-bottom: 0.65rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.sidebar-stats div:last-child,
.company-totals div:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.calendar-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: rgba(15, 23, 42, 0.55);
}

.calendar-modal {
  width: min(880px, 100%);
  display: grid;
  gap: 1rem;
  padding: 1.25rem;
  border-radius: 28px;
  background: #fff;
}

.calendar-modal__head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.calendar-modal__grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.calendar-modal__grid div {
  display: grid;
  gap: 0.25rem;
  padding: 0.85rem;
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.98);
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.calendar-modal__actions {
  grid-auto-flow: column;
  justify-content: end;
}

.calendar-modal__actions button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.calendar-inline-error {
  margin: 0;
  color: #b91c1c;
}

.close-button {
  color: #475569;
}

@media (max-width: 1180px) {
  .calendar-layout,
  .calendar-page__head {
    grid-template-columns: 1fr;
  }

  .calendar-page__actions {
    justify-items: start;
  }
}

@media (max-width: 760px) {
  .calendar-toolbar,
  .calendar-modal__grid {
    grid-template-columns: 1fr;
  }

  .view-switch,
  .range-switch,
  .calendar-modal__actions {
    grid-auto-flow: row;
    justify-content: stretch;
  }

  .calendar-grid__row {
    grid-template-columns: 180px repeat(var(--slots, 1), minmax(0, 1fr));
  }
}
</style>
