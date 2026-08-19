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

const STATUS_PRIORITY = {
  out_of_service: 7,
  maintenance: 6,
  manual_block: 5,
  in_flight: 4,
  pending_payment: 3,
  paid: 2,
  reserved: 2,
  available: 1,
  released: 0,
  cancelled: 0,
}

const STATUS_META = {
  available: {
    label: 'Disponible',
    shortLabel: 'Disponible',
    dot: '#22c55e',
    chipBackground: '#dcfce7',
    chipColor: '#166534',
    cardTone: 'available',
  },
  paid: {
    label: 'Reservada',
    shortLabel: 'Reservada',
    dot: '#1d4ed8',
    chipBackground: '#dbeafe',
    chipColor: '#1e3a8a',
    cardTone: 'occupied',
  },
  reserved: {
    label: 'Reservada',
    shortLabel: 'Reservada',
    dot: '#1d4ed8',
    chipBackground: '#dbeafe',
    chipColor: '#1e3a8a',
    cardTone: 'occupied',
  },
  pending_payment: {
    label: 'Pago pendiente',
    shortLabel: 'Pago pendiente',
    dot: '#eab308',
    chipBackground: '#fef3c7',
    chipColor: '#854d0e',
    cardTone: 'pending',
  },
  in_flight: {
    label: 'Vuelo en curso',
    shortLabel: 'Vuelo',
    dot: '#3b82f6',
    chipBackground: '#dbeafe',
    chipColor: '#1d4ed8',
    cardTone: 'flight',
  },
  maintenance: {
    label: 'Mantenimiento',
    shortLabel: 'Mantenimiento',
    dot: '#8b5cf6',
    chipBackground: '#ede9fe',
    chipColor: '#6d28d9',
    cardTone: 'maintenance',
  },
  out_of_service: {
    label: 'Fuera de servicio',
    shortLabel: 'Fuera de servicio',
    dot: '#ef4444',
    chipBackground: '#fee2e2',
    chipColor: '#b91c1c',
    cardTone: 'out',
  },
  manual_block: {
    label: 'Bloqueo manual',
    shortLabel: 'Bloqueo manual',
    dot: '#111827',
    chipBackground: '#e2e8f0',
    chipColor: '#334155',
    cardTone: 'manual',
  },
  released: {
    label: 'Liberada',
    shortLabel: 'Liberada',
    dot: '#94a3b8',
    chipBackground: '#f1f5f9',
    chipColor: '#475569',
    cardTone: 'neutral',
  },
  cancelled: {
    label: 'Cancelada',
    shortLabel: 'Cancelada',
    dot: '#94a3b8',
    chipBackground: '#f1f5f9',
    chipColor: '#475569',
    cardTone: 'neutral',
  },
}

const blockTypeOptions = [
  { value: 'manual_block', label: 'Bloqueo manual' },
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'inspection', label: 'Inspeccion' },
  { value: 'out_of_service', label: 'Fuera de servicio' },
]

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
const selectedEvent = ref(null)
const manualBlockDrawerOpen = ref(false)
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
  { value: 'available', label: 'Disponible' },
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
  const normalized =
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value
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

function formatCalendarDay(value) {
  const parsedDate = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsedDate.getTime())) return ''

  const weekday = new Intl.DateTimeFormat('es-MX', {
    weekday: 'short',
  })
    .format(parsedDate)
    .replace('.', '')

  const day = new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
  }).format(parsedDate)

  const normalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1)

  return `${normalizedWeekday} ${day}`
}

function isTodayDate(value) {
  return toDateKey(value) === toDateKey(new Date())
}

function isSelectedDate(value) {
  return toDateKey(value) === anchorDate.value
}

function isWeekendDate(value) {
  const parsedDate = parseDate(value)
  if (!parsedDate) return false
  const day = parsedDate.getDay()
  return day === 0 || day === 6
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

function normalizeMediaUrl(value = '') {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith('/')) return raw
  return raw
}

function normalizeImageCollection(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'string') return [value]
  if (typeof value === 'object') return [value]
  return []
}

function getPrimaryImageValue(raw = {}) {
  return normalizeMediaUrl(
    raw.image_url ||
      raw.imageUrl ||
      raw.image ||
      raw.image_path ||
      raw.imagePath ||
      raw.photo ||
      raw.photo_url ||
      raw.photoUrl ||
      raw.cover_image ||
      raw.coverImage ||
      raw.cover_photo ||
      raw.coverPhoto ||
      raw.thumbnail ||
      raw.thumbnail_url ||
      raw.thumbnailUrl ||
      raw.url ||
      raw.path ||
      raw.src ||
      '',
  )
}

function primaryAircraftImage(item = {}) {
  const images = [
    ...normalizeImageCollection(item.images),
    ...normalizeImageCollection(item.aircraft_images),
    ...normalizeImageCollection(item.aircraftImages),
    ...normalizeImageCollection(item.gallery_images),
    ...normalizeImageCollection(item.galleryImages),
    ...normalizeImageCollection(item.gallery),
    ...normalizeImageCollection(item.photos),
    ...normalizeImageCollection(item.media),
  ]

  const firstImage = images
    .map((image) => {
      if (typeof image === 'string') return normalizeMediaUrl(image)
      return getPrimaryImageValue(image || {})
    })
    .find(Boolean)

  return getPrimaryImageValue(item) || firstImage || ''
}

function normalizeStatus(value = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')

  if (!normalized) return 'available'
  if (normalized === 'inspection') return 'maintenance'
  if (['blocked', 'manual', 'manualblock'].includes(normalized)) return 'manual_block'
  if (normalized === 'fuera_de_servicio') return 'out_of_service'
  if (normalized === 'pago_pendiente') return 'pending_payment'
  if (normalized === 'vuelo_en_curso') return 'in_flight'
  if (normalized === 'reserva_pagada') return 'paid'
  return STATUS_META[normalized] ? normalized : 'manual_block'
}

function getStatusMeta(value = '') {
  return STATUS_META[normalizeStatus(value)] || STATUS_META.manual_block
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
    photo_url: primaryAircraftImage(item),
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
    return { start: startOfDay(base), end: endOfDay(base) }
  }

  if (viewMode.value === 'week') {
    return { start: startOfWeek(base), end: endOfWeek(base) }
  }

  return { start: startOfMonth(base), end: endOfMonth(base) }
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

  return new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(start)
})

const slotWidth = computed(() => (viewMode.value === 'day' ? 52 : 48))

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
        secondary: '',
        start: new Date(date.getTime()),
        end: new Date(date.getTime() + 60 * 60 * 1000 - 1),
      }
    })
  }

  const days = []
  let cursor = new Date(start.getTime())

  while (cursor <= end) {
    days.push({
      key: toDateKey(cursor),
      primary: new Intl.DateTimeFormat('es-MX', { day: 'numeric' }).format(cursor),
      secondary: new Intl.DateTimeFormat('es-MX', { weekday: 'short' }).format(cursor),
      start: startOfDay(cursor),
      end: endOfDay(cursor),
    })
    cursor = addDays(cursor, 1)
  }

  return days
})

const mergedAircraftOptions = computed(() => {
  const map = new Map()

  ;[...props.aircraft.map(normalizeAircraftOption), ...aircraftOptions.value].forEach((item) => {
    const key = String(item.id || '')
    if (!key) return
    const current = map.get(key) || {}

    map.set(key, {
      ...current,
      ...item,
      company_name: item.company_name || current.company_name || 'Operador sin nombre',
      aircraft_name: item.aircraft_name || current.aircraft_name || 'Aeronave',
      model: item.model || current.model || '',
      registration: item.registration || current.registration || '',
      category: item.category || current.category || '',
      photo_url: item.photo_url || current.photo_url || '',
    })
  })

  return Array.from(map.values())
})

const normalizedEvents = computed(() =>
  calendarEvents.value
    .map((item) => {
      const start = parseDate(item.start || item.start_date)
      const end = parseDate(item.end || item.end_date)
      if (!start || !end) return null

      const status = normalizeStatus(item.status)
      const statusMeta = getStatusMeta(status)

      return {
        ...item,
        status,
        statusMeta,
        statusLabel: statusMeta.label,
        startDate: start,
        endDate: end,
        aircraft_name: item.aircraft_name || item.model || item.registration || 'Aeronave',
        registration: item.registration || '',
        model: item.model || '',
        company_name: item.company_name || 'Operador sin nombre',
        origin: item.origin || 'Origen por confirmar',
        destination: item.destination || 'Destino por confirmar',
      }
    })
    .filter(Boolean),
)

const activeAircraftOptions = computed(() => {
  if (filters.companyId === 'all') return mergedAircraftOptions.value
  return mergedAircraftOptions.value.filter((item) => String(item.company_id || '') === String(filters.companyId))
})

const visibleAircraftOptions = computed(() => {
  if (filters.aircraftId === 'all') return activeAircraftOptions.value
  return activeAircraftOptions.value.filter((item) => String(item.id || '') === String(filters.aircraftId))
})

const eventsByAircraft = computed(() => {
  const map = new Map()
  normalizedEvents.value.forEach((event) => {
    const key = String(event.aircraft_id || '')
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(event)
  })
  return map
})

function eventOverlapsSlot(event, slot) {
  return event.startDate.getTime() <= slot.end.getTime() && event.endDate.getTime() >= slot.start.getTime()
}

function pickPrimaryCellEvent(events = [], slot) {
  return [...events]
    .filter((event) => eventOverlapsSlot(event, slot))
    .sort((left, right) => {
      const priorityDelta = (STATUS_PRIORITY[right.status] || 0) - (STATUS_PRIORITY[left.status] || 0)
      if (priorityDelta !== 0) return priorityDelta
      return left.startDate.getTime() - right.startDate.getTime()
    })[0] || null
}

function rowMatchesStatus(row) {
  if (filters.status === 'all') return true
  if (viewMode.value === 'day') return row.cells.some((cell) => cell.status === filters.status)

  const selectedCell = row.cells.find((cell) => isSelectedDate(cell.slot.start))
  if (!selectedCell) return false

  if (filters.status === 'reserved') return ['reserved', 'paid'].includes(selectedCell.status)
  return selectedCell.status === filters.status
}

const calendarRows = computed(() =>
  visibleAircraftOptions.value
    .map((aircraft) => {
      const events = eventsByAircraft.value.get(String(aircraft.id || '')) || []
      const cells = timelineSlots.value.map((slot) => {
        const matchingEvents = events.filter((event) => eventOverlapsSlot(event, slot))
        const primaryEvent = pickPrimaryCellEvent(events, slot)
        const status = primaryEvent?.status || 'available'
        const meta = getStatusMeta(status)

        return {
          key: `${aircraft.id}-${slot.key}`,
          slot,
          event: primaryEvent,
          events: matchingEvents,
          status,
          label: meta.shortLabel,
          meta,
        }
      })

      return {
        ...aircraft,
        typeLabel: aircraft.category || aircraft.model || 'Aviacion privada',
        cells,
      }
    })
    .filter(rowMatchesStatus),
)

const timelineStyle = computed(() => ({
  '--slots': timelineSlots.value.length || 1,
  '--slot-width': `${slotWidth.value}px`,
  minWidth: `${Math.max(536 + (timelineSlots.value.length || 1) * slotWidth.value, 980)}px`,
}))

const visibleSummary = computed(() => {
  const visibleAircraftIds = new Set(calendarRows.value.map((item) => String(item.id || '')))
  const occupiedAircraftIds = new Set(
    normalizedEvents.value
      .filter((event) => ['paid', 'reserved', 'pending_payment', 'in_flight'].includes(event.status))
      .map((event) => String(event.aircraft_id || '')),
  )
  const maintenanceAircraftIds = new Set(
    normalizedEvents.value
      .filter((event) => ['maintenance', 'out_of_service', 'manual_block'].includes(event.status))
      .map((event) => String(event.aircraft_id || '')),
  )
  const unavailableAircraftIds = new Set([...occupiedAircraftIds, ...maintenanceAircraftIds])
  const today = toDateKey(new Date())

  return {
    total_aircraft: calendarRows.value.length,
    available_aircraft: Math.max(visibleAircraftIds.size - unavailableAircraftIds.size, 0),
    occupied_aircraft: occupiedAircraftIds.size,
    maintenance_aircraft: maintenanceAircraftIds.size,
    upcoming_flights_today: normalizedEvents.value.filter((event) => event.start_date === today).length,
  }
})

const stateLegendItems = computed(() =>
  ['available', 'reserved', 'pending_payment', 'in_flight', 'maintenance', 'out_of_service', 'manual_block'].map((status) => {
    const total =
      status === 'available'
        ? visibleSummary.value.available_aircraft
        : status === 'reserved'
          ? normalizedEvents.value.filter((event) => ['reserved', 'paid'].includes(event.status)).length
          : normalizedEvents.value.filter((event) => event.status === status).length

    return {
      status,
      label: getStatusMeta(status).label,
      color: getStatusMeta(status).dot,
      total,
    }
  }),
)

const lastUpdatedLabel = computed(() => {
  if (!lastUpdatedAt.value) return ''
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(lastUpdatedAt.value)
})

const manualBlockValidationMessage = computed(() => {
  if (manualBlockDraft.aircraftId === 'all') return 'Selecciona una aeronave para crear el bloqueo.'
  if (!manualBlockDraft.start || !manualBlockDraft.end) return 'Define fecha de inicio y fin.'
  const start = parseDate(manualBlockDraft.start)
  const end = parseDate(manualBlockDraft.end)
  if (!start || !end) return 'Revisa el formato de las fechas.'
  if (end.getTime() <= start.getTime()) return 'La fecha fin debe ser posterior al inicio.'
  return ''
})

const manualBlockCanSubmit = computed(
  () => !submittingManualBlock.value && !manualBlockValidationMessage.value,
)

const ADMIN_CALENDAR_TIMEOUT_MS = 60000

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
        timeoutMs: ADMIN_CALENDAR_TIMEOUT_MS,
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

    if (!companyOptions.value.length) {
      companyOptions.value = uniqueBy(
        props.providers.map(normalizeCompanyOption),
        (item) => String(item.id || item.name || ''),
      )
    }

    if (!aircraftOptions.value.length) {
      aircraftOptions.value = uniqueBy(
        props.aircraft.map(normalizeAircraftOption),
        (item) => String(item.id || ''),
      )
    }

    if (manualBlockDraft.aircraftId === 'all' && aircraftOptions.value.length === 1) {
      manualBlockDraft.aircraftId = String(aircraftOptions.value[0].id)
    }

    lastUpdatedAt.value = new Date()
  } catch (error) {
    if (requestId !== latestRequestId) return
    errorMessage.value = error?.message || 'No fue posible cargar el calendario de disponibilidad.'
  } finally {
    if (requestId === latestRequestId) loading.value = false
  }
}

async function loadOperationalPanels() {
  const companyId = filters.companyId !== 'all' ? filters.companyId : undefined

  const [dashboardResponse] = await Promise.allSettled([
    requestWithCandidates([
      {
        method: 'get',
        path: '/admin/operations/dashboard',
        query: companyId ? { company_id: companyId } : {},
        timeoutMs: ADMIN_CALENDAR_TIMEOUT_MS,
      },
    ]),
  ])

  if (dashboardResponse.status === 'fulfilled') {
    operationsDashboard.value = {
      ...operationsDashboard.value,
      ...dashboardResponse.value?.dashboard,
    }
  }
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

function selectAnchorDate(value) {
  const resolved = toDateKey(value)
  if (!resolved) return
  anchorDate.value = resolved
}

function openEvent(event) {
  selectedEvent.value = event
}

function closeEventModal() {
  selectedEvent.value = null
  releaseError.value = ''
}

function openManualBlockDrawer() {
  manualBlockDrawerOpen.value = true
}

function closeManualBlockDrawer() {
  manualBlockDrawerOpen.value = false
  manualBlockError.value = ''
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
  if (manualBlockValidationMessage.value) {
    manualBlockError.value = manualBlockValidationMessage.value
    return
  }

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
        timeoutMs: ADMIN_CALENDAR_TIMEOUT_MS,
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

    manualBlockDrawerOpen.value = false
    await loadOperationalWorkspace()
  } catch (error) {
    manualBlockError.value = error?.message || 'No fue posible crear el bloqueo administrativo.'
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
        timeoutMs: ADMIN_CALENDAR_TIMEOUT_MS,
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
    aircraftOptions.value = uniqueBy(
      props.aircraft.map(normalizeAircraftOption),
      (item) => String(item.id || ''),
    )
  }

  if (!companyOptions.value.length && props.providers.length) {
    companyOptions.value = uniqueBy(
      props.providers.map(normalizeCompanyOption),
      (item) => String(item.id || item.name || ''),
    )
  }

  if (manualBlockDraft.aircraftId === 'all' && aircraftOptions.value.length === 1) {
    manualBlockDraft.aircraftId = String(aircraftOptions.value[0].id)
  }
})
</script>

<template>
  <section class="surface aircraft-calendar-page">
    <header class="calendar-header-card">
      <div class="calendar-header-card__copy">
        <span class="eyebrow">Disponibilidad de aeronaves</span>
        <h3>Calendario Operativo de Flota</h3>
        <p>Consulta ocupacion real por operador usando bloques de disponibilidad.</p>
      </div>

      <button type="button" class="calendar-refresh-button" @click="refreshCalendar">
        <span class="calendar-button__icon" aria-hidden="true">↻</span>
        <span>Actualizar</span>
      </button>
    </header>

    <section class="calendar-shell-card">
      <div class="calendar-toolbar-row">
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

        <div class="calendar-view-toggle">
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

        <div class="calendar-nav-controls">
          <button type="button" @click="shiftRange(-1)">Anterior</button>
          <strong>{{ rangeTitle }}</strong>
          <button type="button" class="ghost" @click="goToday">Hoy</button>
          <button type="button" @click="shiftRange(1)">Siguiente</button>
        </div>

        <button type="button" class="calendar-primary-button" @click="openManualBlockDrawer">
          Nuevo bloqueo
        </button>
      </div>

      <div class="calendar-layout">
        <aside class="calendar-sidebar-card">
          <section class="sidebar-section">
            <div class="sidebar-section__head">
              <strong>Estados</strong>
              <span class="muted">Lectura operativa por estado actual.</span>
            </div>

            <div class="state-legend-list">
              <article v-for="item in stateLegendItems" :key="item.status" class="state-legend-item">
                <div class="state-legend-item__label">
                  <span class="state-dot" :style="{ backgroundColor: item.color }"></span>
                  <strong>{{ item.label }}</strong>
                </div>
                <small>{{ item.total }}</small>
              </article>
            </div>
          </section>

          <section class="sidebar-section">
            <div class="sidebar-section__head">
              <strong>Resumen</strong>
              <span v-if="lastUpdatedLabel" class="muted">Actualizado {{ lastUpdatedLabel }}</span>
            </div>

            <div class="sidebar-summary-grid">
              <article class="summary-stat-card">
                <span>Disponible</span>
                <strong>{{ visibleSummary.available_aircraft || 0 }}</strong>
              </article>
              <article class="summary-stat-card">
                <span>Ocupadas</span>
                <strong>{{ visibleSummary.occupied_aircraft || 0 }}</strong>
              </article>
              <article class="summary-stat-card">
                <span>Mantenimiento</span>
                <strong>{{ visibleSummary.maintenance_aircraft || 0 }}</strong>
              </article>
              <article class="summary-stat-card">
                <span>Pendientes</span>
                <strong>{{ operationsDashboard.payments_pending || 0 }}</strong>
              </article>
            </div>
          </section>
        </aside>

        <div class="calendar-main-column">
          <article class="fleet-calendar-card">
            <div class="fleet-calendar-card__head">
              <div>
                <strong>Calendario operativo</strong>
                <p class="muted">Consulta la ocupacion de cada aeronave por ventana seleccionada.</p>
              </div>
              <div class="fleet-calendar-card__actions">
                <span v-if="lastUpdatedLabel" class="fleet-calendar-card__stamp">Actualizado {{ lastUpdatedLabel }}</span>
                <button type="button" class="calendar-primary-button" @click="openManualBlockDrawer">
                  Nuevo bloqueo
                </button>
              </div>
            </div>

            <div v-if="loading" class="calendar-state">Cargando disponibilidad de flota...</div>
            <div v-else-if="errorMessage" class="calendar-state calendar-state--error">{{ errorMessage }}</div>
            <div v-else-if="!calendarRows.length" class="calendar-state">
              No hay aeronaves para este filtro.
            </div>
            <div v-else class="fleet-calendar-wrap">
              <div class="fleet-calendar-grid" :style="timelineStyle">
                <div class="fleet-calendar-grid__row fleet-calendar-grid__row--head">
                  <div class="fleet-calendar-grid__head fleet-calendar-grid__head--photo">Foto</div>
                  <div class="fleet-calendar-grid__head fleet-calendar-grid__head--registration">Matricula</div>
                  <div class="fleet-calendar-grid__head fleet-calendar-grid__head--model">Modelo</div>
                  <div class="fleet-calendar-grid__head fleet-calendar-grid__head--type">Tipo</div>
                  <div
                    v-for="slot in timelineSlots"
                    :key="slot.key"
                    class="fleet-calendar-grid__head fleet-calendar-grid__head--slot"
                    :title="viewMode === 'day' ? `${slot.primary}:00 horas` : formatCalendarDay(slot.start)"
                  >
                    <button
                      v-if="viewMode !== 'day'"
                      class="calendar-day-header"
                      :class="{
                        'is-today': isTodayDate(slot.start),
                        'is-weekend': isWeekendDate(slot.start),
                        'is-selected': isSelectedDate(slot.start),
                      }"
                      type="button"
                      @click="selectAnchorDate(slot.start)"
                    >
                      {{ formatCalendarDay(slot.start) }}
                    </button>
                    <strong v-else>{{ slot.primary }}</strong>
                  </div>
                </div>

                <div
                  v-for="row in calendarRows"
                  :key="row.id"
                  class="fleet-calendar-grid__row fleet-calendar-grid__row--body"
                  data-testid="availability-row"
                >
                  <div class="fleet-aircraft fleet-aircraft--photo">
                    <div class="fleet-aircraft__photo">
                      <img v-if="row.photo_url" :src="row.photo_url" :alt="row.aircraft_name" />
                      <span v-else>{{ (row.registration || row.model || 'AV').slice(0, 2) }}</span>
                    </div>
                  </div>

                  <div class="fleet-aircraft fleet-aircraft--registration">
                    <div class="fleet-aircraft__copy">
                      <strong>{{ row.registration || row.aircraft_name }}</strong>
                      <span>{{ row.company_name }}</span>
                    </div>
                  </div>

                  <div class="fleet-aircraft fleet-aircraft--model">
                    <div class="fleet-aircraft__copy">
                      <strong>{{ row.model || row.aircraft_name }}</strong>
                      <span>{{ row.aircraft_name }}</span>
                    </div>
                  </div>

                  <div class="fleet-aircraft-type">
                    <strong>{{ row.typeLabel }}</strong>
                  </div>

                  <component
                    v-for="cell in row.cells"
                    :is="cell.event ? 'button' : 'div'"
                    :key="cell.key"
                    class="fleet-calendar-cell"
                    :class="{
                      'is-empty': !cell.event,
                      'fleet-calendar-cell--interactive': cell.event,
                      'is-selected-slot': viewMode !== 'day' && isSelectedDate(cell.slot.start),
                    }"
                    :data-state="cell.meta.cardTone"
                    :data-has-event="cell.event ? 'true' : 'false'"
                    :title="cell.label"
                    @click="cell.event && openEvent(cell.event)"
                  >
                    <span
                      class="fleet-status-chip"
                      :style="{ backgroundColor: cell.meta.chipBackground, color: cell.meta.chipColor }"
                      :aria-label="cell.label"
                    >
                      <span class="fleet-status-chip__dot" :style="{ backgroundColor: cell.meta.dot }"></span>
                    </span>
                    <small v-if="cell.events.length > 1">+{{ cell.events.length - 1 }}</small>
                  </component>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>

    <div
      v-show="manualBlockDrawerOpen"
      class="calendar-modal-backdrop calendar-modal-backdrop--drawer"
      @click.self="closeManualBlockDrawer"
    >
      <aside class="surface manual-block-drawer" aria-label="Crear bloqueo de disponibilidad">
        <div class="calendar-modal__head">
          <div>
            <span class="eyebrow">Bloqueos</span>
            <h4>Crear bloqueo de disponibilidad</h4>
            <p>Completa el bloqueo sin salir del calendario operativo.</p>
          </div>
          <button type="button" class="close-button" @click="closeManualBlockDrawer">Cerrar</button>
        </div>

        <div class="manual-block-form">
          <label>
            <span>Aeronave</span>
            <select v-model="manualBlockDraft.aircraftId">
              <option value="all" disabled>Seleccionar aeronave</option>
              <option v-for="item in activeAircraftOptions" :key="`block-${item.id}`" :value="String(item.id)">
                {{ item.aircraft_name }}
              </option>
            </select>
          </label>

          <label>
            <span>Tipo</span>
            <select v-model="manualBlockDraft.blockType">
              <option v-for="item in blockTypeOptions" :key="item.value" :value="item.value">
                {{ item.label }}
              </option>
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
            <input v-model="manualBlockDraft.reason" type="text" placeholder="Motivo operativo o administrativo" />
          </label>

          <div class="manual-block-action">
            <button type="button" :disabled="!manualBlockCanSubmit" @click="submitManualBlock">
              {{ submittingManualBlock ? 'Creando bloqueo...' : 'Crear bloqueo' }}
            </button>
          </div>
        </div>

        <p class="muted">La aeronave quedara bloqueada en el rango seleccionado.</p>
        <p v-if="manualBlockError || manualBlockValidationMessage" class="calendar-inline-error">
          {{ manualBlockError || manualBlockValidationMessage }}
        </p>
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
          <button type="button" class="close-button" @click="closeEventModal">Cerrar</button>
        </div>

        <div class="calendar-modal__grid">
          <div><span>Matricula</span><strong>{{ selectedEvent.registration || 'Sin dato' }}</strong></div>
          <div><span>Modelo</span><strong>{{ selectedEvent.model || 'Sin dato' }}</strong></div>
          <div><span>Cliente</span><strong>{{ selectedEvent.client_name || 'Sin cliente asociado' }}</strong></div>
          <div><span>Ruta</span><strong>{{ selectedEvent.origin }} - {{ selectedEvent.destination }}</strong></div>
          <div><span>Salida</span><strong>{{ formatDateTime(selectedEvent.start) }}</strong></div>
          <div><span>Llegada</span><strong>{{ formatDateTime(selectedEvent.end) }}</strong></div>
          <div><span>Estado</span><strong>{{ selectedEvent.statusLabel || selectedEvent.status }}</strong></div>
          <div><span>Motivo</span><strong>{{ selectedEvent.reason || 'Sin motivo' }}</strong></div>
          <div><span>Reserva</span><strong>{{ selectedEvent.reservation_code || selectedEvent.reservation_id || 'Sin reserva' }}</strong></div>
          <div><span>Pago</span><strong>{{ selectedEvent.payment_status || 'Sin dato' }}</strong></div>
        </div>

        <div class="calendar-modal__actions">
          <button type="button" :disabled="!selectedEvent.reservation_id" @click="openReservationFlow">
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
:global(html),
:global(body),
:global(#app) {
  max-width: 100%;
  overflow-x: hidden;
}

.aircraft-calendar-page {
  display: grid;
  gap: 20px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 32px;
  overflow-x: hidden;
  background: #f8fafc;
  font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
  box-sizing: border-box;
}

.calendar-header-card,
.calendar-shell-card,
.calendar-sidebar-card,
.fleet-calendar-card,
.calendar-modal,
.manual-block-drawer {
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}

.calendar-header-card,
.calendar-shell-card,
.fleet-calendar-card,
.calendar-modal,
.manual-block-drawer {
  padding: 24px;
  box-sizing: border-box;
}

.calendar-shell-card,
.fleet-calendar-card,
.calendar-main-column {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.calendar-shell-card,
.fleet-calendar-card {
  overflow: hidden;
}

.calendar-header-card,
.calendar-layout,
.calendar-toolbar-row,
.calendar-view-toggle,
.calendar-nav-controls,
.calendar-modal__grid,
.calendar-modal__actions,
.manual-block-form,
.state-legend-list,
.sidebar-summary-grid,
.calendar-main-column {
  display: grid;
  gap: 16px;
}

.calendar-header-card {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
}

.calendar-header-card__copy,
.fleet-calendar-card__head,
.sidebar-section,
.sidebar-section__head,
.fleet-aircraft__copy,
.manual-block-card__head {
  display: grid;
  gap: 6px;
}

.calendar-header-card h3,
.manual-block-card h4,
.calendar-modal__head h4 {
  margin: 0;
  color: #0f172a;
}

.calendar-header-card h3 {
  font-size: clamp(1.85rem, 4vw, 2.35rem);
  line-height: 1;
}

.calendar-header-card p,
.muted,
.calendar-modal__head p {
  margin: 0;
  color: #64748b;
}

.eyebrow {
  color: #0f2347;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.calendar-refresh-button,
.calendar-view-toggle button,
.calendar-nav-controls button,
.calendar-primary-button,
.manual-block-action button,
.calendar-modal__actions button,
.close-button {
  min-height: 44px;
  padding: 0 16px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #0f172a;
  font-weight: 700;
  transition:
    background-color 0.25s ease,
    border-color 0.25s ease,
    transform 0.25s ease,
    box-shadow 0.25s ease;
}

.calendar-refresh-button:hover,
.calendar-view-toggle button:hover,
.calendar-nav-controls button:hover,
.calendar-primary-button:hover,
.manual-block-action button:hover,
.calendar-modal__actions button:hover,
.close-button:hover {
  background: #f1f5f9;
}

.calendar-refresh-button,
.calendar-view-toggle,
.calendar-nav-controls,
.calendar-primary-button,
.state-legend-item,
.fleet-aircraft,
.fleet-aircraft__photo,
.fleet-aircraft-type,
.calendar-modal__head {
  display: flex;
  align-items: center;
}

.calendar-refresh-button,
.calendar-view-toggle,
.calendar-nav-controls {
  gap: 12px;
}

.calendar-primary-button {
  justify-content: center;
}

.calendar-primary-button,
.manual-block-action button,
.calendar-nav-controls button:last-child {
  background: #0f2347;
  border-color: #0f2347;
  color: #ffffff;
}

.calendar-view-toggle {
  padding: 4px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #ffffff;
}

.calendar-view-toggle button.active {
  background: #0f2347;
  border-color: #0f2347;
  color: #ffffff;
}

.calendar-nav-controls {
  justify-content: flex-end;
  flex-wrap: wrap;
}

.calendar-nav-controls strong {
  color: #0f172a;
  font-size: 0.95rem;
  font-weight: 700;
}

.calendar-nav-controls .ghost {
  background: #f8fafc;
}

.calendar-toolbar-row {
  position: sticky;
  top: 0;
  z-index: 20;
  grid-template-columns: minmax(140px, 1fr) minmax(140px, 1fr) minmax(140px, 1fr) auto auto auto;
  align-items: end;
  padding: 8px 0 12px;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
}

.calendar-toolbar-row label,
.manual-block-form label {
  display: grid;
  gap: 8px;
}

.calendar-toolbar-row label > span,
.manual-block-form label > span,
.fleet-aircraft__copy span,
.fleet-aircraft__copy small,
.fleet-calendar-grid__head span,
.calendar-modal__grid span,
.summary-stat-card span {
  color: #64748b;
}

.calendar-toolbar-row select,
.manual-block-form select,
.manual-block-form input {
  min-height: 46px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0 14px;
  background: #ffffff;
  color: #0f172a;
}

.calendar-layout {
  grid-template-columns: 190px minmax(0, 1fr);
  align-items: start;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  gap: 12px;
}

.calendar-sidebar-card {
  display: grid;
  gap: 16px;
  padding: 16px;
  position: sticky;
  top: 24px;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.sidebar-section__head strong,
.fleet-calendar-card__head strong {
  color: #0f172a;
  font-size: 1.05rem;
}

.state-legend-list {
  gap: 10px;
}

.state-legend-item {
  justify-content: space-between;
  gap: 12px;
  min-height: 28px;
}

.state-legend-item__label {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.state-legend-item small {
  color: #64748b;
  font-weight: 700;
}

.state-legend-item strong {
  color: #0f172a;
  font-size: 0.9375rem;
}

.state-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
}

.sidebar-summary-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.summary-stat-card {
  display: grid;
  gap: 4px;
  min-height: 68px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #f8fafc;
}

.summary-stat-card strong {
  color: #0f172a;
  font-size: 1.5rem;
  font-weight: 800;
}

.calendar-main-column {
  min-width: 0;
}

.fleet-calendar-card__head {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
}

.fleet-calendar-card__actions {
  display: grid;
  gap: 10px;
  justify-items: end;
}

.fleet-calendar-card__stamp {
  color: #64748b;
  font-size: 0.82rem;
  font-weight: 600;
}

.fleet-calendar-wrap {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  overflow-y: auto;
  max-height: 70vh;
  overscroll-behavior-x: contain;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #ffffff;
}

.fleet-calendar-grid {
  display: grid;
  width: max-content;
  min-width: 100%;
  max-width: none;
  background: #ffffff;
}

.fleet-calendar-grid__row {
  display: grid;
  grid-template-columns: 56px 148px 188px 118px repeat(var(--slots, 1), var(--slot-width));
}

.fleet-calendar-grid__row--head {
  position: sticky;
  top: 0;
  z-index: 10;
}

.fleet-calendar-grid__head {
  display: grid;
  place-items: center;
  min-height: 48px;
  padding: 8px 6px;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  color: #64748b;
  font-size: 0.76rem;
  font-weight: 700;
}

.fleet-calendar-grid__head--photo,
.fleet-calendar-grid__head--registration,
.fleet-calendar-grid__head--model,
.fleet-calendar-grid__head--type {
  position: sticky;
  left: 0;
  z-index: 12;
  justify-items: start;
}

.fleet-calendar-grid__head--photo {
  left: 0;
  z-index: 13;
}

.fleet-calendar-grid__head--registration {
  left: 56px;
}

.fleet-calendar-grid__head--model {
  left: 204px;
}

.fleet-calendar-grid__head--type {
  left: 392px;
}

.fleet-calendar-grid__head--slot {
  text-align: center;
  border-left: 1px solid #e2e8f0;
  justify-items: center;
}

.calendar-day-header {
  width: 52px;
  min-width: 52px;
  height: 38px;
  padding: 0 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  appearance: none;
  cursor: pointer;
  white-space: nowrap;
  text-align: center;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  color: #475569;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-right: 1px solid #e2e8f0;
  border-radius: 8px;
  box-sizing: border-box;
}

.calendar-day-header.is-today {
  color: #ffffff;
  background: #173a6a;
  border-right-color: transparent;
}

.calendar-day-header.is-selected {
  color: #ffffff;
  background: #173a6a;
  border-color: #173a6a;
}

.calendar-day-header.is-weekend:not(.is-today) {
  background: #f1f5f9;
  color: #334155;
}

.calendar-day-header.is-selected.is-weekend,
.calendar-day-header.is-selected.is-today {
  color: #ffffff;
  background: #173a6a;
}

.fleet-calendar-grid__head strong,
.fleet-aircraft__copy strong,
.fleet-aircraft-type strong,
.calendar-modal__grid strong {
  color: #0f172a;
}

.fleet-aircraft,
.fleet-aircraft-type,
.fleet-calendar-cell {
  min-height: 58px;
  padding: 8px 10px;
  border-bottom: 1px solid #e2e8f0;
}

.fleet-aircraft,
.fleet-aircraft-type {
  position: sticky;
  left: 0;
  z-index: 8;
  background: #ffffff;
}

.fleet-aircraft--photo {
  left: 0;
  justify-content: center;
  z-index: 9;
}

.fleet-aircraft--registration {
  left: 56px;
}

.fleet-aircraft--model {
  left: 204px;
}

.fleet-aircraft-type {
  left: 392px;
  justify-content: flex-start;
}

.fleet-calendar-grid__row--body:nth-child(even) .fleet-aircraft,
.fleet-calendar-grid__row--body:nth-child(even) .fleet-aircraft-type,
.fleet-calendar-grid__row--body:nth-child(even) .fleet-calendar-cell {
  background: #fbfdff;
}

.fleet-calendar-grid__row--body:hover .fleet-aircraft,
.fleet-calendar-grid__row--body:hover .fleet-aircraft-type,
.fleet-calendar-grid__row--body:hover .fleet-calendar-cell {
  background: #f1f5f9;
}

.fleet-aircraft {
  gap: 10px;
}

.fleet-aircraft__photo {
  justify-content: center;
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
}

.fleet-aircraft__photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.fleet-aircraft__photo span {
  color: #0f2347;
  font-size: 0.72rem;
  font-weight: 800;
}

.fleet-aircraft__copy {
  min-width: 0;
  gap: 2px;
}

.fleet-aircraft__copy strong,
.fleet-aircraft__copy span,
.fleet-aircraft__copy small {
  overflow: hidden;
  text-overflow: ellipsis;
}

.fleet-aircraft__copy span,
.fleet-aircraft__copy small {
  white-space: nowrap;
}

.fleet-aircraft__copy strong {
  font-size: 0.88rem;
}

.fleet-aircraft__copy span {
  font-size: 0.8rem;
}

.fleet-aircraft-type strong {
  font-size: 0.78rem;
}

.fleet-calendar-cell {
  display: grid;
  place-items: center;
  gap: 2px;
  border: 0;
  border-left: 1px solid #e2e8f0;
  background: #ffffff;
  text-align: center;
}

.fleet-calendar-cell.is-selected-slot {
  background: #eff6ff;
}

.fleet-calendar-cell:not(:disabled) {
  cursor: pointer;
}

.fleet-calendar-cell.is-empty {
  cursor: default;
}

.fleet-status-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 24px;
  border-radius: 999px;
  border: 1px solid rgba(15, 23, 42, 0.06);
}

.fleet-status-chip__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
}

.fleet-calendar-cell small,
.fleet-calendar-cell em {
  color: #64748b;
  font-style: normal;
  font-size: 0.68rem;
}

.manual-block-form {
  grid-template-columns: 1fr;
  align-items: start;
}

.manual-block-action {
  display: flex;
  justify-content: flex-end;
}

.calendar-state {
  padding: 24px;
  border: 1px dashed #cbd5e1;
  border-radius: 16px;
  background: #f8fafc;
  color: #64748b;
}

.calendar-state--error,
.calendar-inline-error {
  color: #b91c1c;
}

.calendar-inline-error {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
}

.calendar-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.36);
}

.calendar-modal-backdrop--drawer {
  place-items: stretch end;
  padding: 0;
  background: rgba(15, 23, 42, 0.18);
}

.calendar-modal {
  width: min(920px, 100%);
  display: grid;
  gap: 24px;
}

.manual-block-drawer {
  width: min(420px, 100%);
  height: 100vh;
  border-radius: 0;
  border-top: 0;
  border-right: 0;
  border-bottom: 0;
  display: grid;
  align-content: start;
  gap: 16px;
  overflow-y: auto;
}

.calendar-modal__head {
  justify-content: space-between;
  gap: 16px;
}

.calendar-modal__grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.calendar-modal__grid div {
  display: grid;
  gap: 6px;
  padding: 16px;
  border-radius: 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.calendar-modal__actions {
  grid-auto-flow: column;
  justify-content: end;
  gap: 12px;
}

.calendar-modal__actions button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.calendar-button__icon {
  font-size: 0.95rem;
  line-height: 1;
}

@media (max-width: 1480px) {
  .calendar-toolbar-row {
    grid-template-columns: repeat(3, minmax(140px, 1fr));
  }

  .calendar-view-toggle,
  .calendar-nav-controls,
  .calendar-primary-button {
    justify-content: start;
  }
}

@media (max-width: 1120px) {
  .calendar-layout {
    grid-template-columns: 1fr;
  }

  .calendar-sidebar-card {
    display: none;
  }

  .calendar-toolbar-row {
    grid-template-columns: repeat(2, minmax(140px, 1fr));
  }
}

@media (max-width: 860px) {
  .aircraft-calendar-page,
  .calendar-header-card,
  .calendar-shell-card,
  .fleet-calendar-card,
  .calendar-modal,
  .manual-block-drawer {
    padding: 20px;
  }

  .calendar-header-card {
    grid-template-columns: 1fr;
  }

  .calendar-toolbar-row,
  .sidebar-summary-grid,
  .calendar-modal__grid {
    grid-template-columns: 1fr;
  }

  .calendar-nav-controls {
    grid-template-columns: 1fr 1fr;
  }

  .fleet-calendar-card__head {
    grid-template-columns: 1fr;
  }

  .fleet-calendar-card__actions {
    justify-items: start;
  }
}
</style>
