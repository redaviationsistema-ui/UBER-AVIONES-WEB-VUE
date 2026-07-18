<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import AdminCrewAvailabilityDetail from './crew-availability/AdminCrewAvailabilityDetail.vue'
import AdminCrewAvailabilityFilters from './crew-availability/AdminCrewAvailabilityFilters.vue'
import AdminCrewAvailabilityHeader from './crew-availability/AdminCrewAvailabilityHeader.vue'
import AdminCrewAvailabilityLog from './crew-availability/AdminCrewAvailabilityLog.vue'
import AdminCrewAvailabilityMatrix from './crew-availability/AdminCrewAvailabilityMatrix.vue'
import { addDays, normalizeState, normalizeToken, toDateKey } from './crew-availability/crewAvailabilityShared'
import {
  fetchAvailabilityDataset,
  normalizeAvailabilityStatusKey,
  saveAvailabilityRange,
} from '../../services/disponibilidadService'

const props = defineProps({
  crewMembers: { type: Array, required: true },
  operations: { type: Array, required: true },
  auditEntries: { type: Array, required: true },
  statusOptions: { type: Array, default: () => [] },
})

const emit = defineEmits(['audit-crew', 'save-availability'])

const filters = reactive({
  from: toDateKey(new Date()),
  to: toDateKey(addDays(new Date(), 6)),
  base: 'all',
  state: 'all',
  search: '',
})

const selectedCell = ref(null)
const draftFrom = ref(filters.from)
const draftTo = ref(filters.from)
const draftState = ref('DISPONIBLE')
const draftComment = ref('')
const localOverrides = reactive({})
const remoteAvailabilityRecords = ref([])
const remoteStatusOptions = ref([])
const remoteCrewMembers = ref([])
const availabilityErrorMessage = ref('')
const hasRequestedInitialAvailability = ref(false)
const availabilityRequestVersion = ref(0)
const availabilityCache = new Map()
const availabilityRequestsInFlight = new Map()
const AVAILABILITY_CACHE_TTL_MS = 45000
const ADMIN_AVAILABILITY_TIMEOUT_MS = Number(import.meta.env.VITE_ADMIN_AVAILABILITY_TIMEOUT_MS || 10000)
let availabilityReloadTimer = null
let activeAvailabilityController = null
const hasLoadedRemoteAvailability = ref(false)

function normalizeRemoteCrewMember(raw = {}) {
  return {
    id: raw.id || raw.user_id || raw.sobrecargo_id || raw.crew_id || null,
    name: raw.name || raw.full_name || raw.nombre || 'Sobrecargo',
    base: raw.base || raw.base_airport || raw.base_code || raw.city || '',
    providerName: raw.provider_name || raw.company_name || raw.operator_name || raw.proveedor || '',
    state: raw.state || raw.status || raw.current_status || '',
    operationalState: raw.operational_state || raw.current_status || raw.state || raw.status || '',
    profileState: raw.profile_state || raw.validation_status || '',
    adminNotes: raw.admin_notes || raw.comentario || raw.comment || '',
    raw,
  }
}

function normalizeDateKey(value = '') {
  if (!value) return ''
  if (typeof value === 'string') {
    const directMatch = value.match(/^(\d{4}-\d{2}-\d{2})/)
    if (directMatch?.[1]) return directMatch[1]
  }
  return toDateKey(value)
}

function fromDateKey(key = '') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key || ''))) return null
  const [year, month, day] = String(key).split('-').map(Number)
  return new Date(year, month - 1, day)
}

const effectiveCrewMembers = computed(() =>
  remoteCrewMembers.value.length ? remoteCrewMembers.value : props.crewMembers,
)

const weeklyDays = computed(() => {
  const start = new Date(`${filters.from}T08:00:00`)
  const requestedEnd = new Date(`${filters.to || filters.from}T08:00:00`)
  const end = requestedEnd >= start ? requestedEnd : addDays(start, 6)
  const days = Math.max(1, Math.min(31, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1))

  return Array.from({ length: days }, (_, index) => addDays(start, index)).map((date) => ({
    key: toDateKey(date),
    label: new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric' }).format(date),
  }))
})

function readAvailabilityRecords(member = {}) {
  const raw = member.raw || {}
  const sources = [
    raw.availability,
    raw.disponibilidad,
    raw.disponibilidades,
    raw.blocks,
    raw.blocked_dates,
    raw.schedule,
    raw.agenda,
    raw.profile?.availability,
    raw.profile?.disponibilidad,
  ]

  const collection = sources.find((item) => Array.isArray(item))
  if (!Array.isArray(collection)) return []

  return collection
    .map((item, index) => ({
      id: item.id || `${member.id}-${index}`,
      from: normalizeDateKey(item.from || item.fecha || item.starts_at || item.start_datetime || item.date || ''),
      to: normalizeDateKey(item.to || item.fecha || item.ends_at || item.end_datetime || item.date || ''),
      state: normalizeState(item.state || item.status || item.availability_status || item.label || ''),
      reason: item.reason || item.notes || item.comment || '',
    }))
    .filter((item) => item.from)
}

const memberAvailabilityMap = computed(() => {
  const map = new Map()

  effectiveCrewMembers.value.forEach((member) => {
    const entries = new Map()
    const sourceEntries = readAvailabilityRecords(member)

    sourceEntries.forEach((item) => {
      const start = fromDateKey(normalizeDateKey(item.from))
      const end = fromDateKey(normalizeDateKey(item.to || item.from))
      if (!start) return

      const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
      const endCursor = new Date(
        (end || start).getFullYear(),
        (end || start).getMonth(),
        (end || start).getDate(),
      )

      while (cursor <= endCursor) {
        entries.set(toDateKey(cursor), item)
        cursor.setDate(cursor.getDate() + 1)
      }
    })

    map.set(member.id, entries)
  })

  return map
})

const operationsByCrewDate = computed(() => {
  const map = new Map()

  props.operations.forEach((operation) => {
    const crewId = Number(operation.crewId || operation.sobrecargo_user_id || 0)
    const dayKey = toDateKey(operation.departure || operation.date || operation.raw?.operation?.departure_datetime || '')
    if (!crewId || !dayKey) return
    map.set(`${crewId}:${dayKey}`, operation)
  })

  return map
})

function resolveMemberStateForDay(member, dayKey) {
  const override = localOverrides[`${member.id}:${dayKey}`]
  if (override) return override

  const operation = operationsByCrewDate.value.get(`${member.id}:${dayKey}`)
  if (operation) {
    return {
      state: 'En operacion',
      comment: [operation.folio || operation.id, operation.route || operation.origin].filter(Boolean).join(' · '),
      operation,
    }
  }

  const availabilityRecord = memberAvailabilityMap.value.get(member.id)?.get(dayKey)
  if (availabilityRecord) return availabilityRecord

  if (dayKey === toDateKey(new Date()) && !hasLoadedRemoteAvailability.value) {
    return {
      state: normalizeState(member.state || member.operationalState || ''),
      comment: member.adminNotes || '',
    }
  }

  return { statusKey: 'POR_CONFIRMAR', state: 'Por confirmar', comment: '' }
}

const normalizedStatusOptions = computed(() => {
  const propOptions = Array.isArray(props.statusOptions) ? props.statusOptions : []
  const options = remoteStatusOptions.value.length ? remoteStatusOptions.value : propOptions
  if (options.length) {
    return options.map((option) => ({
      value: normalizeAvailabilityStatusKey(option.clave || option.value || option.code || 'DISPONIBLE'),
      label: option.nombre || option.label || option.name || option.clave || 'Disponible',
      color: option.color || '',
      clave: normalizeAvailabilityStatusKey(option.clave || option.value || option.code || 'DISPONIBLE'),
      selectableAdmin: option.seleccionable_admin ?? true,
    }))
  }

  return [
    { value: 'DISPONIBLE', label: 'Disponible', color: '#22c55e', clave: 'DISPONIBLE' },
    { value: 'NO_DISPONIBLE', label: 'No disponible', color: '#ef4444', clave: 'NO_DISPONIBLE' },
    { value: 'DESCANSO', label: 'Descanso', color: '#94a3b8', clave: 'DESCANSO' },
    { value: 'EN_OPERACION', label: 'En operacion', color: '#3b82f6', clave: 'EN_OPERACION' },
    { value: 'BLOQUEO_SOLICITADO', label: 'Bloqueo solicitado', color: '#facc15', clave: 'BLOQUEO_SOLICITADO' },
    { value: 'BLOQUEO_APROBADO', label: 'Bloqueo aprobado', color: '#a855f7', clave: 'BLOQUEO_APROBADO' },
    { value: 'BLOQUEO_RECHAZADO', label: 'Bloqueo rechazado', color: '#f97316', clave: 'BLOQUEO_RECHAZADO' },
    { value: 'POR_CONFIRMAR', label: 'Por confirmar', color: '#d6b98c', clave: 'POR_CONFIRMAR' },
  ]
})

const selectableStatusOptions = computed(() =>
  normalizedStatusOptions.value.filter((option) => option.selectableAdmin !== false),
)

const baseOptions = computed(() =>
  ['all', ...new Set(effectiveCrewMembers.value.map((item) => String(item.base || '').trim()).filter(Boolean))],
)

const filteredCrew = computed(() => {
  const query = normalizeToken(filters.search)

  return effectiveCrewMembers.value.filter((member) => {
    if (filters.base !== 'all' && member.base !== filters.base) return false

    if (query) {
      const haystack = normalizeToken([member.name, member.base, member.providerName].filter(Boolean).join(' '))
      if (!haystack.includes(query)) return false
    }

    if (filters.state !== 'all') {
      const hasState = weeklyDays.value.some((day) => normalizeToken(resolveMemberStateForDay(member, day.key).state) === normalizeToken(filters.state))
      if (!hasState) return false
    }

    return true
  })
})

const summaryCards = computed(() => {
  const counts = {
    Disponible: 0,
    'No disponible': 0,
    Descanso: 0,
    'En operacion': 0,
    'Bloqueo solicitado': 0,
  }

  filteredCrew.value.forEach((member) => {
    const record = resolveMemberStateForDay(member, weeklyDays.value[0]?.key)
    const state = counts[record.state] != null ? record.state : 'Disponible'
    counts[state] += 1
  })

  return [
    { label: 'Disponibles hoy', value: counts.Disponible },
    { label: 'No disponibles', value: counts['No disponible'] },
    { label: 'Descanso', value: counts.Descanso },
    { label: 'En operacion', value: counts['En operacion'] },
    { label: 'Bloqueos pendientes', value: counts['Bloqueo solicitado'] },
  ]
})

watch(
  selectedCell,
  (value) => {
    if (!value) return
    draftFrom.value = value.dayKey
    draftTo.value = value.dayKey
    draftState.value = normalizeAvailabilityStatusKey(value.record.statusKey || value.record.state)
    draftComment.value = value.record.comment || ''
  },
  { immediate: true },
)

async function loadAvailabilityByRange() {
  const cacheKey = `${filters.from || ''}:${filters.to || ''}`
  const now = Date.now()
  const cachedEntry = availabilityCache.get(cacheKey)

  if (cachedEntry && now - cachedEntry.savedAt <= AVAILABILITY_CACHE_TTL_MS) {
    availabilityErrorMessage.value = ''
    remoteAvailabilityRecords.value = []
    hasLoadedRemoteAvailability.value = true
    if (cachedEntry.dataset.statuses.length) {
      remoteStatusOptions.value = cachedEntry.dataset.statuses
    }
    remoteCrewMembers.value = (Array.isArray(cachedEntry.dataset.crewMembers) ? cachedEntry.dataset.crewMembers : [])
      .map(normalizeRemoteCrewMember)
      .filter((member) => member.id)
    return cachedEntry.dataset
  }

  if (availabilityRequestsInFlight.has(cacheKey)) {
    return availabilityRequestsInFlight.get(cacheKey)
  }

  if (activeAvailabilityController) {
    activeAvailabilityController.abort()
  }

  const requestController = typeof AbortController !== 'undefined' ? new AbortController() : null
  activeAvailabilityController = requestController
  const requestVersion = ++availabilityRequestVersion.value

  const requestPromise = (async () => {
    try {
      const dataset = await fetchAvailabilityDataset({
        scope: 'admin',
        from: filters.from,
        to: filters.to,
        statusCatalog: remoteStatusOptions.value,
        signal: requestController?.signal,
        timeoutMs: ADMIN_AVAILABILITY_TIMEOUT_MS,
        includeStatuses: false,
      })

      availabilityCache.set(cacheKey, {
        dataset,
        savedAt: Date.now(),
      })

      if (requestVersion !== availabilityRequestVersion.value) {
        return dataset
      }

      availabilityErrorMessage.value = ''
      remoteAvailabilityRecords.value = []
      hasLoadedRemoteAvailability.value = true
      if (dataset.statuses.length) {
        remoteStatusOptions.value = dataset.statuses
      }
      remoteCrewMembers.value = (Array.isArray(dataset.crewMembers) ? dataset.crewMembers : [])
        .map(normalizeRemoteCrewMember)
        .filter((member) => member.id)

      return dataset
    } catch (error) {
      if (error?.name === 'AbortError') {
        return null
      }

      if (requestVersion === availabilityRequestVersion.value) {
        availabilityErrorMessage.value =
          error?.message || 'No fue posible cargar la disponibilidad administrativa.'
      }

      throw error
    } finally {
      if (availabilityRequestsInFlight.get(cacheKey) === requestPromise) {
        availabilityRequestsInFlight.delete(cacheKey)
      }
      if (activeAvailabilityController === requestController) {
        activeAvailabilityController = null
      }
    }
  })()

  availabilityRequestsInFlight.set(cacheKey, requestPromise)
  return requestPromise
}

function scheduleAvailabilityReload({ immediate = false } = {}) {
  if (availabilityReloadTimer) {
    clearTimeout(availabilityReloadTimer)
    availabilityReloadTimer = null
  }

  if (!immediate && activeAvailabilityController) {
    activeAvailabilityController.abort()
    activeAvailabilityController = null
  }

  const runReload = () => {
    availabilityReloadTimer = null
    void loadAvailabilityByRange()
  }

  if (immediate) {
    runReload()
    return
  }

  availabilityReloadTimer = window.setTimeout(runReload, 350)
}

function retryAvailabilityLoad() {
  availabilityCache.delete(`${filters.from || ''}:${filters.to || ''}`)
  scheduleAvailabilityReload({ immediate: true })
}

function selectCell(member, dayKey) {
  selectedCell.value = {
    member,
    dayKey,
    record: resolveMemberStateForDay(member, dayKey),
  }
}

async function saveSelectedCell() {
  if (!selectedCell.value) return

  const { member, dayKey } = selectedCell.value
  const rangeStart = draftFrom.value || dayKey
  const rangeEnd = draftTo.value || rangeStart
  const normalizedRangeEnd = rangeEnd >= rangeStart ? rangeEnd : rangeStart

  try {
    await saveAvailabilityRange({
      scope: 'admin',
      crewId: member.id,
      date: rangeStart,
      from: rangeStart,
      to: normalizedRangeEnd,
      statusKey: draftState.value,
      comment: draftComment.value,
      base: member.base || '',
      audit: true,
    })
  } catch (error) {
    console.warn('No se pudo guardar la disponibilidad administrativa.', error)
    return
  }

  const cursor = new Date(`${rangeStart}T08:00:00`)
  const endDate = new Date(`${normalizedRangeEnd}T08:00:00`)
  while (cursor <= endDate) {
    localOverrides[`${member.id}:${toDateKey(cursor)}`] = {
      statusKey: draftState.value,
      state: normalizedStatusOptions.value.find((option) => option.value === draftState.value)?.label || draftState.value,
      comment: draftComment.value,
    }
    cursor.setDate(cursor.getDate() + 1)
  }

  emit('audit-crew', {
    member,
    note: `Disponibilidad ${rangeStart}${normalizedRangeEnd !== rangeStart ? ` a ${normalizedRangeEnd}` : ''}: ${draftState.value}.${draftComment.value ? ` ${draftComment.value}` : ''}`,
  })

  emit('save-availability', {
    member,
    dayKey: rangeStart,
    from: rangeStart,
    to: normalizedRangeEnd,
    state: draftState.value,
    comment: draftComment.value,
  })

  availabilityCache.delete(`${filters.from || ''}:${filters.to || ''}`)
  await loadAvailabilityByRange()

  selectedCell.value = {
    member,
    dayKey,
    record: resolveMemberStateForDay(member, dayKey),
  }
}

const recentAuditEntries = computed(() =>
  props.auditEntries
    .filter((entry) => normalizeToken(entry.title).includes('sobrecargo') || normalizeToken(entry.detail).includes('dispon'))
    .slice(0, 6),
)

watch(
  () => [filters.from, filters.to],
  (_, __, onCleanup) => {
    const isInitialLoad = !hasRequestedInitialAvailability.value
    if (isInitialLoad) {
      hasRequestedInitialAvailability.value = true
    }
    scheduleAvailabilityReload({ immediate: isInitialLoad })
    onCleanup(() => {
      if (availabilityReloadTimer) {
        clearTimeout(availabilityReloadTimer)
        availabilityReloadTimer = null
      }
    })
  },
  { immediate: true },
)

watch(
  () => remoteStatusOptions.value.length,
  (length) => {
    if (!length) return
    if (!selectableStatusOptions.value.some((option) => option.value === draftState.value)) {
      draftState.value = selectableStatusOptions.value[0]?.value || 'DISPONIBLE'
    }
  },
  { immediate: true },
)

watch(
  () => [draftFrom.value, draftTo.value],
  ([from, to]) => {
    if (!from) return
    if (!to || to < from) {
      draftTo.value = from
    }
  },
)

onBeforeUnmount(() => {
  if (availabilityReloadTimer) {
    clearTimeout(availabilityReloadTimer)
    availabilityReloadTimer = null
  }
  if (activeAvailabilityController) {
    activeAvailabilityController.abort()
    activeAvailabilityController = null
  }
})
</script>

<template>
  <section class="availability-admin-shell">
    <AdminCrewAvailabilityHeader :summary-cards="summaryCards" />

    <AdminCrewAvailabilityFilters
      :filters="filters"
      :base-options="baseOptions"
      :state-options="normalizedStatusOptions"
    />

    <div v-if="availabilityErrorMessage" class="availability-inline-alert">
      <div>
        <strong>No se pudo refrescar la disponibilidad remota.</strong>
        <p>Se conservan los datos anteriores o el fallback local mientras reintentamos.</p>
      </div>
      <button type="button" class="secondary-action" @click="retryAvailabilityLoad">
        Reintentar
      </button>
    </div>

    <div class="workspace-grid">
      <AdminCrewAvailabilityMatrix
        :weekly-days="weeklyDays"
        :filtered-crew="filteredCrew"
        :resolve-member-state-for-day="resolveMemberStateForDay"
        :status-options="normalizedStatusOptions"
        @select-cell="selectCell"
      />

      <AdminCrewAvailabilityDetail
        :selected-cell="selectedCell"
        :draft-from="draftFrom"
        :draft-to="draftTo"
        :draft-state="draftState"
        :draft-comment="draftComment"
        :status-options="selectableStatusOptions"
        @update:draft-from="draftFrom = $event"
        @update:draft-to="draftTo = $event"
        @update:draft-state="draftState = $event"
        @update:draft-comment="draftComment = $event"
        @save="saveSelectedCell"
      />
    </div>

    <AdminCrewAvailabilityLog :recent-audit-entries="recentAuditEntries" />
  </section>
</template>

<style scoped>
.availability-admin-shell {
  display: grid;
  gap: 1.25rem;
}

.availability-inline-alert {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.1rem;
  border-radius: 1rem;
  border: 1px solid rgba(226, 111, 111, 0.25);
  background: rgba(255, 244, 244, 0.95);
  color: #7f1d1d;
}

.availability-inline-alert strong {
  display: block;
  margin-bottom: 0.2rem;
}

.availability-inline-alert p {
  margin: 0;
  color: rgba(127, 29, 29, 0.82);
}

.workspace-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1.8fr) minmax(320px, 0.9fr);
}

@media (max-width: 1100px) {
  .workspace-grid {
    grid-template-columns: 1fr;
  }
}
</style>
