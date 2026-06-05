<script setup>
import { computed, ref, watch } from 'vue'
import CrewUiIcon from './CrewUiIcon.vue'

const props = defineProps({
  availabilityBlocks: { type: Array, required: true },
  statusOptions: { type: Array, default: () => [] },
  assignments: { type: Array, required: true },
  base: { type: String, default: '' },
  coverage: { type: String, default: '' },
})

const emit = defineEmits(['save-day', 'request-review'])

const monthCursor = ref(startOfMonth(new Date()))
const selectedDateKey = ref(toDateKey(new Date()))
const selectedState = ref('DISPONIBLE')
const selectedReason = ref('')

const statusMeta = {
  DISPONIBLE: { tone: 'available', short: 'Disp.', accent: 'Disponible' },
  DESCANSO: { tone: 'rest', short: 'Desc.', accent: 'Descanso' },
  NO_DISPONIBLE: { tone: 'unavailable', short: 'No disp.', accent: 'No disponible' },
  BLOQUEO_SOLICITADO: { tone: 'pending', short: 'Bloqueo', accent: 'Bloqueo solicitado' },
  BLOQUEO_APROBADO: { tone: 'approved', short: 'Aprobado', accent: 'Bloqueo aprobado' },
  EN_OPERACION: { tone: 'operation', short: 'Operacion', accent: 'En operacion' },
  POR_CONFIRMAR: { tone: 'draft', short: 'Pend.', accent: 'Por confirmar' },
}

function toDateKey(value) {
  if (!value) return ''
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  if (typeof value === 'string') {
    const directMatch = value.match(/^(\d{4}-\d{2}-\d{2})/)
    if (directMatch?.[1]) return directMatch[1]
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function fromDateKey(key = '') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key || ''))) return null
  const [year, month, day] = String(key).split('-').map(Number)
  return new Date(year, month - 1, day)
}

function startOfMonth(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value)
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(value, amount) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1)
}

function formatDayLabel(key) {
  const date = new Date(`${key}T08:00:00`)
  if (Number.isNaN(date.getTime())) return key
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function formatRangeLabel(from, to) {
  const fromKey = toDateKey(from)
  const toKey = toDateKey(to || from)
  if (!fromKey) return ''
  if (fromKey === toKey) return formatDayLabel(fromKey)
  return `${formatDayLabel(fromKey)} - ${formatDayLabel(toKey)}`
}

function normalizeStatus(value = '') {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')

  if (!normalized) return 'DISPONIBLE'
  if (normalized.includes('OPER')) return 'EN_OPERACION'
  if (normalized.includes('APROB')) return 'BLOQUEO_APROBADO'
  if (normalized.includes('SOLICIT') || normalized.includes('PEND')) return 'BLOQUEO_SOLICITADO'
  if (normalized.includes('DESC')) return 'DESCANSO'
  if (normalized.includes('NO_DISPONIBLE') || normalized.includes('INACTIVO') || normalized.includes('BLOCK')) {
    return 'NO_DISPONIBLE'
  }
  if (normalized.includes('CONFIRM')) return 'POR_CONFIRMAR'
  if (normalized.includes('DISP')) return 'DISPONIBLE'
  return normalized
}

function humanizeStatus(value = '') {
  const normalized = normalizeStatus(value)
  if (normalized === 'DISPONIBLE') return 'Disponible'
  if (normalized === 'NO_DISPONIBLE') return 'No disponible'
  if (normalized === 'DESCANSO') return 'Descanso'
  if (normalized === 'EN_OPERACION') return 'En operacion'
  if (normalized === 'BLOQUEO_SOLICITADO') return 'Bloqueo solicitado'
  if (normalized === 'BLOQUEO_APROBADO') return 'Bloqueo aprobado'
  if (normalized === 'BLOQUEO_RECHAZADO') return 'Bloqueo rechazado'
  if (normalized === 'POR_CONFIRMAR') return 'Por confirmar'
  return value
}

const availableStatuses = computed(() => {
  const catalog = Array.isArray(props.statusOptions) ? props.statusOptions : []
  if (catalog.length) {
    return catalog.map((item) => {
      const key = normalizeStatus(item.clave || item.status || item.nombre)
      return {
        key,
        label: item.nombre || humanizeStatus(key),
      }
    })
  }

  return [
    { key: 'DISPONIBLE', label: 'Disponible' },
    { key: 'DESCANSO', label: 'Descanso' },
    { key: 'NO_DISPONIBLE', label: 'No disponible' },
    { key: 'BLOQUEO_SOLICITADO', label: 'Bloqueo solicitado' },
  ]
})

const statusPresentationMap = computed(() =>
  Object.fromEntries(
    availableStatuses.value.map((item) => [
      item.key,
      {
        tone: statusMeta[item.key]?.tone || 'draft',
        short: statusMeta[item.key]?.short || item.label,
        accent: item.label,
        color:
          props.statusOptions.find(
            (status) => normalizeStatus(status.clave || status.status || status.id) === item.key,
          )?.color || '',
      },
    ]),
  ),
)

const assignmentDays = computed(() => {
  const map = new Map()

  props.assignments.forEach((assignment) => {
    const key = toDateKey(assignment.date || assignment.from || assignment.departure)
    if (!key) return

    map.set(key, {
      state: 'EN_OPERACION',
      flight: assignment.flight || '',
      route: assignment.route || '',
      time: assignment.time || '',
      aircraft: assignment.aircraft || '',
      missionStatus: assignment.missionStatus || '',
    })
  })

  return map
})

const availabilityByDay = computed(() => {
  const map = new Map()

  props.availabilityBlocks.forEach((item) => {
    const startKey = toDateKey(item.from || item.starts_at || item.start_datetime || item.date || '')
    const endKey = toDateKey(item.to || item.ends_at || item.end_datetime || item.from || item.date || '')
    if (!startKey) return

    const startDate = fromDateKey(startKey)
    const safeEndDate = fromDateKey(endKey || startKey) || startDate
    if (!startDate || !safeEndDate) return

    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
    const endCursor = new Date(safeEndDate.getFullYear(), safeEndDate.getMonth(), safeEndDate.getDate())

    while (cursor <= endCursor) {
      const key = toDateKey(cursor)
      const existing = map.get(key)
      map.set(key, {
        id: item.id,
        state: normalizeStatus(item.statusKey || item.state),
        reason: item.restriction || item.reason || item.notes || '',
        base: item.base || '',
        coverage: item.coverage || '',
        createdBy: item.createdBy || item.origin || existing?.createdBy || 'Actualizado por mi',
      })
      cursor.setDate(cursor.getDate() + 1)
    }
  })

  return map
})

const selectedDateRecord = computed(() => {
  const operation = assignmentDays.value.get(selectedDateKey.value)
  if (operation) {
    return {
      date: selectedDateKey.value,
      state: operation.state,
      operation,
      reason: '',
      editable: false,
    }
  }

  const block = availabilityByDay.value.get(selectedDateKey.value)
  return {
    date: selectedDateKey.value,
    state: block?.state || 'DISPONIBLE',
    stateLabel: humanizeStatus(block?.state || 'DISPONIBLE'),
    reason: block?.reason || '',
    createdBy: block?.createdBy || '',
    operation: null,
    editable: true,
    blockId: block?.id || null,
  }
})

watch(
  selectedDateRecord,
  (record) => {
    selectedState.value = record.state
    selectedReason.value = record.reason
  },
  { immediate: true },
)

const summaryCards = computed(() => {
  const start = monthCursor.value
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
  const summary = {
    Disponible: 0,
    'No disponible': 0,
    Descanso: 0,
    'En operacion': 0,
    'Bloqueo solicitado': 0,
  }

  for (const [key, operation] of assignmentDays.value.entries()) {
    const date = new Date(`${key}T08:00:00`)
    if (date < start || date > end) continue
    summary[humanizeStatus(operation.state)] += 1
  }

  for (const [key, block] of availabilityByDay.value.entries()) {
    const date = new Date(`${key}T08:00:00`)
    if (date < start || date > end) continue
    if (assignmentDays.value.has(key)) continue

    const state = summary[humanizeStatus(block.state)] != null ? humanizeStatus(block.state) : 'Disponible'
    summary[state] += 1
  }

  return [
    { label: 'Disponible este mes', value: summary.Disponible },
    { label: 'No disponible', value: summary['No disponible'] },
    { label: 'Descanso', value: summary.Descanso },
    { label: 'En operacion', value: summary['En operacion'] },
    { label: 'Bloqueos pendientes', value: summary['Bloqueo solicitado'] },
  ]
})

const calendarDays = computed(() => {
  const start = monthCursor.value
  const month = start.getMonth()
  const gridStart = new Date(start)
  const weekDay = gridStart.getDay()
  const offset = (weekDay + 6) % 7
  gridStart.setDate(gridStart.getDate() - offset)

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    const key = toDateKey(date)
    const operation = assignmentDays.value.get(key)
    const block = availabilityByDay.value.get(key)
    const state = operation?.state || block?.state || 'POR_CONFIRMAR'
    return {
      key,
      day: date.getDate(),
      currentMonth: date.getMonth() === month,
      selected: key === selectedDateKey.value,
      state,
      reason: block?.reason || '',
      operation,
    }
  })
})

const activityLog = computed(() => {
  const entries = []

  props.availabilityBlocks.forEach((item) => {
    entries.push({
      id: `block-${item.id}`,
      date: toDateKey(item.from),
      range: formatRangeLabel(item.from, item.to),
      title: humanizeStatus(item.state),
      detail: item.reason || item.restriction || 'Actualizado por mi',
      actor: item.createdBy || item.origin || 'Actualizado por mi',
    })
  })

  props.assignments.forEach((item) => {
    entries.push({
      id: `assignment-${item.id}`,
      date: toDateKey(item.date),
      title: 'En operacion',
      detail: [item.flight, item.route].filter(Boolean).join(' · ') || 'Asignado por Admin / Red Sky',
      actor: 'Asignado por Admin / Red Sky',
    })
  })

  return entries
    .filter((entry) => entry.date)
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 8)
})

function selectDay(key) {
  selectedDateKey.value = key
}

function changeMonth(direction) {
  monthCursor.value = addMonths(monthCursor.value, direction)
}

function applyQuickState(state) {
  if (!selectedDateRecord.value.editable) return
  selectedState.value = state
}

function submitSelectedDay() {
  if (!selectedDateRecord.value.editable) return

  emit('save-day', {
    date: selectedDateKey.value,
    state: selectedState.value,
    reason: selectedReason.value,
  })
}

function resolveCalendarDayStyle(state = '') {
  const color = statusPresentationMap.value[state]?.color
  if (!color) return {}
  return {
    background: `${color}22`,
    boxShadow: `inset 0 0 0 1px ${color}55`,
  }
}
</script>

<template>
  <section class="availability-shell">
    <header class="surface availability-hero">
      <div class="hero-copy">
        <span class="eyebrow">Espacio de trabajo</span>
        <h3>Mi disponibilidad</h3>
        <p class="muted">
          Marca los dias en los que puedes recibir asignaciones. Los cambios quedan registrados en tu bitacora operativa.
        </p>
      </div>

      <div class="summary-grid">
        <article v-for="card in summaryCards" :key="card.label" class="summary-card">
          <strong>{{ card.value }}</strong>
          <span>{{ card.label }}</span>
        </article>
      </div>
    </header>

    <div class="availability-actions">
      <button type="button" class="ghost-action" @click="applyQuickState('DISPONIBLE')">Marcar disponible</button>
      <button type="button" class="ghost-action" @click="applyQuickState('DESCANSO')">Marcar descanso</button>
      <button type="button" class="ghost-action" @click="applyQuickState('NO_DISPONIBLE')">Marcar no disponible</button>
      <button type="button" class="ghost-action" @click="applyQuickState('BLOQUEO_SOLICITADO')">Solicitar bloqueo</button>
      <button type="button" class="primary-action action-button" @click="submitSelectedDay">Guardar disponibilidad</button>
    </div>

    <div class="availability-layout">
      <article class="surface calendar-card">
        <div class="card-head">
          <div>
            <span class="eyebrow">Calendario operativo</span>
            <h4>{{ monthCursor.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }) }}</h4>
          </div>

          <div class="month-controls">
            <button type="button" class="ghost-icon" @click="changeMonth(-1)">‹</button>
            <button type="button" class="ghost-icon" @click="changeMonth(1)">›</button>
          </div>
        </div>

        <div class="calendar-grid calendar-grid--labels">
          <span v-for="label in ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']" :key="label" class="weekday">
            {{ label }}
          </span>
        </div>

        <div class="calendar-grid">
          <button
            v-for="day in calendarDays"
            :key="day.key"
            type="button"
            class="calendar-day"
            :class="[`tone-${statusMeta[day.state]?.tone || 'draft'}`, { 'is-muted': !day.currentMonth, 'is-selected': day.selected }]"
            :style="resolveCalendarDayStyle(day.state)"
            @click="selectDay(day.key)"
          >
            <strong>{{ day.day }}</strong>
            <span>{{ statusPresentationMap[day.state]?.short || humanizeStatus(day.state) }}</span>
          </button>
        </div>
      </article>

      <aside class="surface detail-card">
        <div class="card-head">
          <div>
            <span class="eyebrow">Detalle del dia</span>
            <h4>{{ formatDayLabel(selectedDateKey) }}</h4>
          </div>
          <span class="status-chip" :class="`status-chip--${statusMeta[selectedDateRecord.state]?.tone || 'draft'}`">
            {{ humanizeStatus(selectedDateRecord.state) }}
          </span>
        </div>

        <template v-if="selectedDateRecord.operation">
          <div class="locked-day">
            <span class="icon-badge"><CrewUiIcon name="agenda" :size="18" /></span>
            <p>Este dia tiene una operacion asignada. Para cambiarlo, solicita revision a Admin / Red Sky.</p>
            <div class="locked-meta">
              <strong>{{ selectedDateRecord.operation.flight || 'Operacion activa' }}</strong>
              <span>{{ selectedDateRecord.operation.route || 'Ruta por definir' }}</span>
              <span>{{ selectedDateRecord.operation.time || 'Horario por definir' }}</span>
              <span>{{ selectedDateRecord.operation.aircraft || 'Aeronave por definir' }}</span>
            </div>
            <button type="button" class="ghost-action" @click="$emit('request-review', selectedDateRecord)">
              Solicitar cambio
            </button>
          </div>
        </template>

        <template v-else>
          <label class="field">
            <span>Estado</span>
            <select v-model="selectedState">
              <option v-for="option in availableStatuses" :key="option.key" :value="option.key">
                {{ option.label }}
              </option>
            </select>
          </label>

          <label class="field">
            <span>Comentario</span>
            <textarea v-model="selectedReason" rows="5" placeholder="Escribe un comentario para Admin / Red Sky"></textarea>
          </label>

          <div class="detail-meta">
            <span>Base: {{ base || 'Sin base' }}</span>
            <span>Cobertura: {{ coverage || 'Sin cobertura' }}</span>
            <span v-if="selectedDateRecord.createdBy">Registrado por: {{ selectedDateRecord.createdBy }}</span>
          </div>

          <button type="button" class="primary-action action-button action-button--full" @click="submitSelectedDay">
            Guardar disponibilidad
          </button>
        </template>
      </aside>
    </div>

    <article class="surface log-card">
      <div class="card-head">
        <div>
          <span class="eyebrow">Mi bitacora</span>
          <h4>Ultimos movimientos de disponibilidad</h4>
        </div>
      </div>

      <div v-if="activityLog.length" class="log-list">
        <article v-for="entry in activityLog" :key="entry.id" class="log-row">
          <strong>{{ entry.range || formatDayLabel(entry.date) }}</strong>
          <span>{{ entry.title }}</span>
          <small>{{ entry.detail }}</small>
          <small>{{ entry.actor }}</small>
        </article>
      </div>

      <p v-else class="empty-state">
        Aun no has registrado disponibilidad. Selecciona los dias del calendario para indicar si estas disponible, en descanso o no disponible.
      </p>
    </article>
  </section>
</template>

<style scoped>
.availability-shell {
  display: grid;
  gap: 1.25rem;
}

.availability-hero,
.calendar-card,
.detail-card,
.log-card {
  color: #000;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 28px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.96));
  box-shadow: 0 18px 40px rgba(148, 163, 184, 0.18);
}

.availability-hero {
  display: grid;
  gap: 1rem;
  padding: 1.5rem;
}

.summary-grid {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}

.summary-card {
  padding: 1rem;
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(219, 234, 254, 0.78), rgba(226, 232, 240, 0.9));
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.summary-card strong {
  display: block;
  font-size: 1.6rem;
  color: #000;
}

.summary-card span {
  color: #000;
  font-size: 0.92rem;
}

.availability-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.availability-layout {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1.7fr) minmax(300px, 0.95fr);
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.calendar-card,
.detail-card,
.log-card {
  padding: 1.4rem;
}

.month-controls {
  display: inline-flex;
  gap: 0.5rem;
}

.ghost-icon,
.ghost-action {
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(241, 245, 249, 0.98);
  color: #000;
  border-radius: 999px;
  padding: 0.72rem 1rem;
}

.ghost-icon {
  width: 2.6rem;
  height: 2.6rem;
  padding: 0;
}

.calendar-grid {
  display: grid;
  gap: 0.7rem;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}

.calendar-grid--labels {
  margin-bottom: 0.7rem;
}

.weekday {
  text-align: center;
  font-size: 0.82rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #64748b;
}

.calendar-day {
  min-height: 88px;
  border-radius: 20px;
  padding: 0.8rem;
  border: 1px solid rgba(148, 163, 184, 0.16);
  text-align: left;
  display: grid;
  align-content: space-between;
  gap: 0.5rem;
  color: #000;
}

.calendar-day strong {
  font-size: 1rem;
}

.calendar-day span {
  font-size: 0.78rem;
  color: #334155;
}

.calendar-day.is-muted {
  opacity: 0.48;
}

.calendar-day.is-selected {
  outline: 2px solid rgba(15, 23, 42, 0.72);
  outline-offset: 2px;
}

.tone-available {
  background: rgba(34, 197, 94, 0.24);
}

.tone-unavailable {
  background: rgba(239, 68, 68, 0.26);
}

.tone-rest {
  background: rgba(148, 163, 184, 0.26);
}

.tone-operation {
  background: rgba(59, 130, 246, 0.28);
}

.tone-pending {
  background: rgba(250, 204, 21, 0.3);
}

.tone-approved {
  background: rgba(168, 85, 247, 0.3);
}

.tone-draft {
  background: rgba(245, 158, 11, 0.24);
}

.status-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.38rem 0.8rem;
  font-size: 0.82rem;
  color: #000;
}

.status-chip--available {
  background: rgba(34, 197, 94, 0.2);
}

.status-chip--unavailable {
  background: rgba(239, 68, 68, 0.2);
}

.status-chip--rest {
  background: rgba(148, 163, 184, 0.2);
}

.status-chip--operation {
  background: rgba(59, 130, 246, 0.22);
}

.status-chip--pending {
  background: rgba(250, 204, 21, 0.22);
}

.status-chip--approved {
  background: rgba(168, 85, 247, 0.22);
}

.status-chip--draft {
  background: rgba(245, 158, 11, 0.18);
}

.field {
  display: grid;
  gap: 0.55rem;
  margin-bottom: 1rem;
}

.field span {
  color: #000;
  font-size: 0.9rem;
  font-weight: 700;
}

.field select,
.field textarea {
  width: 100%;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: rgba(255, 255, 255, 0.96);
  color: #000;
  padding: 0.9rem 1rem;
}

.detail-meta {
  display: grid;
  gap: 0.45rem;
  margin-bottom: 1rem;
  color: #000;
  font-size: 0.9rem;
}

.action-button--full {
  width: 100%;
  justify-content: center;
}

.locked-day {
  display: grid;
  gap: 1rem;
}

.locked-meta {
  display: grid;
  gap: 0.35rem;
  color: #000;
}

.log-list {
  display: grid;
  gap: 0.75rem;
}

.log-row {
  display: grid;
  gap: 0.2rem;
  padding: 0.95rem 1rem;
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.96);
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.log-row strong,
.log-row span {
  color: #000;
}

.log-row small,
.hero-copy p {
  color: #000;
}

@media (max-width: 980px) {
  .availability-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .calendar-grid {
    gap: 0.45rem;
  }

  .calendar-day {
    min-height: 72px;
    padding: 0.7rem;
  }
}
</style>
