<script setup>
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { searchAirports } from '../../../lib/airportSearch'
import { formatAirportOption } from '../../../utils/airports'

const activeLegIndex = ref(0)
const airportSuggestions = reactive({})
const airportLoading = reactive({})
const activeAirportKey = ref('')
const activeTimePickerKey = ref('')
const pickerViews = reactive({})
const dateTimePickerRefs = reactive({})
const airportTimers = {}
const hourOptions = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'))
const minuteOptions = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'))
const periodOptions = ['AM', 'PM']
const weekdayHeaders = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

const props = defineProps({
  form: { type: Object, required: true },
  summary: { type: Object, required: true },
  tripType: { type: String, required: true },
})

const emit = defineEmits([
  'add-leg',
  'remove-leg',
  'submit',
  'select-form-airport',
  'select-leg-airport',
  'update-form-field',
  'update-leg-field',
  'update-trip-type',
])

const trustPillars = [
  'Sin comisiones ocultas',
  'Atencion 24/7',
  'Seguridad y privacidad',
  'Soporte personalizado',
]

const serviceHighlights = [
  { title: 'Cotiza al instante', copy: 'Recibe opciones en minutos.' },
  { title: 'Reserva segura', copy: 'Bloquea tu vuelo al instante.' },
  { title: 'Contrato digital', copy: 'Firma en linea desde tu cuenta.' },
  { title: 'Pago protegido', copy: 'Transacciones 100% seguras.' },
]

function formatLegDate(date = '') {
  if (!date) return 'Fecha pendiente'

  const parsedDate = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsedDate.getTime())) return date

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
  }).format(parsedDate)
}

function legName(index, total) {
  if (index === total - 1 && total > 2) return 'Regreso'
  return `Destino ${index + 1}`
}

function toggleLeg(index) {
  activeLegIndex.value = activeLegIndex.value === index ? -1 : index
}

function addLegAndOpen(emit, nextIndex) {
  activeLegIndex.value = nextIndex
  emit('add-leg')
}

function removeLastLeg(emit, legsLength) {
  if (legsLength <= 1) return
  activeLegIndex.value = Math.max(0, legsLength - 2)
  emit('remove-leg', legsLength - 1)
}

function updateFormField(field, event) {
  emit('update-form-field', { field, value: event.target.value })
}

function updateLegField(index, field, event) {
  emit('update-leg-field', { index, field, value: event.target.value })
}

function updateFormTime(field, part, value) {
  const nextTime = buildTimeValue(part, value, splitTimeParts(props.form?.[field]))
  emit('update-form-field', { field, value: nextTime })
}

function updateLegTime(index, part, value) {
  const nextTime = buildTimeValue(part, value, splitTimeParts(props.form?.legs?.[index]?.time))
  emit('update-leg-field', { index, field: 'time', value: nextTime })
}

function airportKey(scope, field, index = '') {
  return [scope, index, field].filter((part) => part !== '').join(':')
}

function airportCode(airport) {
  return airport?.code || airport?.iata || ''
}

function scheduleAirportSearch(key, query) {
  if (airportTimers[key]) {
    window.clearTimeout(airportTimers[key])
  }

  airportTimers[key] = window.setTimeout(async () => {
    const trimmedQuery = String(query || '').trim()

    if (!trimmedQuery) {
      airportSuggestions[key] = []
      airportLoading[key] = false
      return
    }

    airportLoading[key] = true

    try {
      const result = await searchAirports(trimmedQuery, 6)
      airportSuggestions[key] = result.items
    } catch {
      airportSuggestions[key] = []
    } finally {
      airportLoading[key] = false
    }
  }, 220)
}

function updateFormAirport(field, event) {
  const value = event.target.value
  const key = airportKey('form', field)
  activeAirportKey.value = key
  emit('update-form-field', { field, value })
  scheduleAirportSearch(key, value)
}

function updateLegAirport(index, field, event) {
  const value = event.target.value
  const key = airportKey('leg', field, index)
  activeAirportKey.value = key
  emit('update-leg-field', { index, field, value })
  scheduleAirportSearch(key, value)
}

function chooseFormAirport(field, airport) {
  emit('update-form-field', { field, value: airportCode(airport) })
  emit('select-form-airport', { field, airport })
  activeAirportKey.value = ''
}

function chooseLegAirport(index, field, airport) {
  emit('update-leg-field', { index, field, value: airportCode(airport) })
  emit('select-leg-airport', { index, field, airport })
  activeAirportKey.value = ''
}

function splitTimeParts(value = '') {
  const normalized = String(value || '').trim()

  if (!normalized || !normalized.includes(':')) {
    return {
      hour: '',
      minute: '00',
      period: 'AM',
    }
  }

  const [hourRaw = '00', minuteRaw = '00'] = normalized.split(':')
  const hours24 = Number(hourRaw)
  const minutes = Number(minuteRaw)

  if (!Number.isFinite(hours24) || !Number.isFinite(minutes)) {
    return {
      hour: '',
      minute: '00',
      period: 'AM',
    }
  }

  return {
    hour: String(hours24 % 12 || 12).padStart(2, '0'),
    minute: String(minutes).padStart(2, '0'),
    period: hours24 >= 12 ? 'PM' : 'AM',
  }
}

function buildTimeValue(part, value, currentParts) {
  const nextParts = {
    hour: currentParts?.hour || '',
    minute: currentParts?.minute || '00',
    period: currentParts?.period || 'AM',
  }

  nextParts[part] = value

  if (!nextParts.hour) {
    return ''
  }

  let hours24 = Number(nextParts.hour) % 12
  if (nextParts.period === 'PM') {
    hours24 += 12
  }

  return `${String(hours24).padStart(2, '0')}:${nextParts.minute}`
}

function formatTimeLabel(value = '') {
  const parts = splitTimeParts(value)
  if (!parts.hour) return 'Selecciona hora'
  return `${parts.hour}:${parts.minute} ${parts.period}`
}

function formatDisplayDate(value = '') {
  if (!value) return 'Selecciona fecha'

  const parsedDate = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsedDate.getTime())) return value

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsedDate)
}

function todayDateValue() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

function parseDateValue(value = '') {
  if (!value) return null
  const [yearRaw, monthRaw, dayRaw] = String(value).split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null

  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime())) return null

  return date
}

function formatDateValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatTriggerDateTime(dateValue = '', timeValue = '') {
  const dateCopy = dateValue ? formatDisplayDate(dateValue) : 'dd/mm/aaaa'
  const timeCopy = timeValue ? formatTimeLabel(timeValue).toLowerCase() : '--:-- ----'
  return `${dateCopy}, ${timeCopy}`
}

function hasDateTimeSelection(dateValue = '', timeValue = '') {
  return Boolean(String(dateValue || '').trim()) && Boolean(String(timeValue || '').trim())
}

function monthLabel(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''

  const label = new Intl.DateTimeFormat('es-MX', {
    month: 'long',
    year: 'numeric',
  }).format(date)

  return label.charAt(0).toUpperCase() + label.slice(1)
}

function ensurePickerView(key, dateValue = '') {
  const parsed = parseDateValue(dateValue) || parseDateValue(todayDateValue()) || new Date()

  if (!pickerViews[key]) {
    pickerViews[key] = {
      month: parsed.getMonth(),
      year: parsed.getFullYear(),
    }
  }

  return pickerViews[key]
}

function openDateTimePicker(key, dateValue = '') {
  ensurePickerView(key, dateValue)
  activeTimePickerKey.value = activeTimePickerKey.value === key ? '' : key
}

function changePickerMonth(key, step, dateValue = '') {
  const view = ensurePickerView(key, dateValue)
  const nextDate = new Date(view.year, view.month + step, 1)
  view.month = nextDate.getMonth()
  view.year = nextDate.getFullYear()
}

function calendarDays(key, selectedDateValue = '') {
  const view = ensurePickerView(key, selectedDateValue)
  const firstOfMonth = new Date(view.year, view.month, 1)
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7
  const gridStart = new Date(view.year, view.month, 1 - firstWeekday)
  const selectedDate = parseDateValue(selectedDateValue)
  const today = parseDateValue(todayDateValue())
  const days = []

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)

    const dateValue = formatDateValue(date)
    const sameMonth = date.getMonth() === view.month
    const isSelected =
      selectedDate &&
      date.getFullYear() === selectedDate.getFullYear() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getDate() === selectedDate.getDate()
    const isToday =
      today &&
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()

    days.push({
      key: `${key}-${dateValue}`,
      label: String(date.getDate()),
      value: dateValue,
      isCurrentMonth: sameMonth,
      isSelected: Boolean(isSelected),
      isToday: Boolean(isToday),
    })
  }

  return days
}

function pickerMonthLabel(key, dateValue = '') {
  const view = ensurePickerView(key, dateValue)
  return monthLabel(new Date(view.year, view.month, 1))
}

function timePickerKey(scope, index = '') {
  return [scope, index].filter((part) => part !== '').join(':')
}

function toggleTimePicker(key) {
  activeTimePickerKey.value = activeTimePickerKey.value === key ? '' : key
}

function closeTimePicker() {
  activeTimePickerKey.value = ''
}

function registerDateTimePickerRef(key, element) {
  if (element) {
    dateTimePickerRefs[key] = element
    return
  }

  delete dateTimePickerRefs[key]
}

function handleDocumentPointerDown(event) {
  const activeKey = activeTimePickerKey.value

  if (!activeKey) return

  const activeElement = dateTimePickerRefs[activeKey]
  if (activeElement?.contains(event.target)) return

  closeTimePicker()
}

function handleDocumentKeydown(event) {
  if (event.key === 'Escape') {
    closeTimePicker()
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentPointerDown)
  document.addEventListener('keydown', handleDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleDocumentPointerDown)
  document.removeEventListener('keydown', handleDocumentKeydown)
})

function selectFormTimePart(field, part, value) {
  updateFormTime(field, part, value)
}

function selectLegTimePart(index, part, value) {
  updateLegTime(index, part, value)
}

function selectFormDate(field, value) {
  emit('update-form-field', { field, value })
}

function selectLegDate(index, value) {
  emit('update-leg-field', { index, field: 'date', value })
}

function clearFormDateTime(dateField, timeField) {
  emit('update-form-field', { field: dateField, value: '' })
  emit('update-form-field', { field: timeField, value: '' })
}

function clearLegDateTime(index) {
  emit('update-leg-field', { index, field: 'date', value: '' })
  emit('update-leg-field', { index, field: 'time', value: '' })
}

function setFormToday(dateField) {
  emit('update-form-field', { field: dateField, value: todayDateValue() })
}

function setLegToday(index) {
  emit('update-leg-field', { index, field: 'date', value: todayDateValue() })
}

function routePreview(origin = '', destination = '') {
  if (origin && destination) return `${origin} → ${destination}`
  if (origin) return `${origin} → Destino`
  if (destination) return `Origen → ${destination}`
  return 'Origen → Destino'
}

function legStatus(leg = {}) {
  const hasOrigin = Boolean(String(leg.origin || '').trim())
  const hasDestination = Boolean(String(leg.destination || '').trim())
  const hasDate = Boolean(String(leg.date || '').trim())

  if (hasOrigin && hasDestination && hasDate) return 'Completo'
  if (hasOrigin || hasDestination || hasDate) return 'En captura'
  return 'Pendiente'
}

function legStatusClass(leg = {}) {
  return `leg-status--${legStatus(leg).toLowerCase().replace(/\s+/g, '-')}`
}
</script>

<template>
  <section class="flight-search-hero">
    <header class="hero-status-bar">
      <div class="hero-status-bar__account">
        <span class="hero-status-dot" aria-hidden="true"></span>
        <strong>Tu cuenta ya puede cotizar, reservar, firmar contrato y pagar vuelos.</strong>
      </div>

      <div class="hero-status-bar__pills">
        <span v-for="item in trustPillars" :key="item">{{ item }}</span>
      </div>
    </header>

    <div class="hero-layout">
      <aside class="hero-copy-panel">
        <span class="eyebrow">Planificador de aviacion privada</span>
        <h1>
          <span>Busca.</span>
          <span>Reserva.</span>
          <span>Vuela.</span>
        </h1>
        <p>
          Entra, elige y reserva tu vuelo privado con control total desde el primer paso.
        </p>

        <div class="hero-copy-panel__footer">
          <strong>Cabina premium para decisiones rapidas.</strong>
          <span>Todo el flujo vive en una misma experiencia: busqueda, contrato y pago.</span>
        </div>
      </aside>

      <div class="search-copy">
        <form class="flight-form" @submit.prevent="$emit('submit')">
          <div class="segmented-control">
            <button
              type="button"
              :class="{ active: tripType === 'Ida' }"
              @click="$emit('update-trip-type', 'Ida')"
            >
              <span class="control-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M21 16v-2l-8-5V4.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16Z" fill="currentColor"/></svg>
              </span>
              <span class="control-copy">
                <strong>Ida</strong>
                <small>Solo un destino</small>
              </span>
            </button>
            <button
              type="button"
              :class="{ active: tripType === 'Redondo' }"
              @click="$emit('update-trip-type', 'Redondo')"
            >
              <span class="control-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M7 7h8.5l-2.8-2.8L14 3l5 5-5 5-1.3-1.2L15.5 9H7V7Zm10 10H8.5l2.8 2.8L10 21l-5-5 5-5 1.3 1.2L8.5 15H17v2Z" fill="currentColor"/></svg>
              </span>
              <span class="control-copy">
                <strong>Redondo</strong>
                <small>Salida y regreso</small>
              </span>
            </button>
            <button
              type="button"
              :class="{ active: tripType === 'Multi-destino' }"
              @click="$emit('update-trip-type', 'Multi-destino')"
            >
              <span class="control-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M6 6a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm0 8a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm12-4a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM8 8h6v2H8V8Zm0 8h6v2H8v-2Zm8-4h-2v-2h2V7l4 4-4 4v-3Z" fill="currentColor"/></svg>
              </span>
              <span class="control-copy">
                <strong>Multi-destino</strong>
                <small>Varias paradas</small>
              </span>
            </button>
          </div>

          <div v-if="tripType === 'Ida'" class="mode-intro mode-intro--oneway">
            <div class="mode-intro__symbol" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M21 16v-2l-8-5V4.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16Z" fill="currentColor"/></svg>
            </div>
            <div>
              <span class="mode-intro__eyebrow">Viaje de ida</span>
              <strong>Define una salida directa en un flujo ejecutivo simple.</strong>
              <p>
                Ideal para traslados puntuales, agendas cerradas o vuelos privados con un solo
                destino.
              </p>
            </div>
          </div>

          <div v-else-if="tripType === 'Redondo'" class="mode-intro mode-intro--roundtrip">
            <div class="mode-intro__symbol" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M10.4 13.6a1 1 0 0 1 1.4 0l1.2 1.2 3.6-3.6a1 1 0 1 1 1.4 1.4l-4.3 4.3a1 1 0 0 1-1.4 0l-1.9-1.9a1 1 0 0 1 0-1.4ZM6 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm0 8a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm12-4a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" fill="currentColor"/></svg>
            </div>
            <div>
              <span class="mode-intro__eyebrow">Viaje redondo</span>
              <strong>Define salida y regreso en un mismo flujo ejecutivo.</strong>
              <p>
                Ideal para viajes con retorno previsto, aunque la hora exacta o la duracion total
                del vuelo aun esten por definirse.
              </p>
            </div>
          </div>

          <div v-else-if="tripType === 'Multi-destino'" class="mode-intro mode-intro--multi">
            <div class="mode-intro__symbol" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M6 6a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm0 8a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm12-4a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM8 8h6v2H8V8Zm0 8h6v2H8v-2Zm8-4h-2v-2h2V7l4 4-4 4v-3Z" fill="currentColor"/></svg>
            </div>
            <div>
              <span class="mode-intro__eyebrow">Ruta multi-destino</span>
              <strong>Construye una gira privada tramo por tramo.</strong>
              <p>
                Perfecto para roadshows, visitas ejecutivas y agendas que combinan varias ciudades.
              </p>
            </div>
          </div>

          <template v-if="tripType === 'Ida'">
          <label class="airport-field airport-field--compact">
            <span class="field-label">
              <span class="field-label__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s6-5.4 6-11a6 6 0 1 0-12 0c0 5.6 6 11 6 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>
              </span>
              <span class="field-label__copy"><strong>Origen</strong><small>Base de salida</small></span>
            </span>
            <input
              :value="form.origin"
              autocomplete="off"
              @focus="activeAirportKey = airportKey('form', 'origin')"
              @input="updateFormAirport('origin', $event)"
            />
            <div
              v-if="activeAirportKey === airportKey('form', 'origin') && (airportLoading[airportKey('form', 'origin')] || (airportSuggestions[airportKey('form', 'origin')] || []).length)"
              class="airport-options"
            >
              <span v-if="airportLoading[airportKey('form', 'origin')]">Buscando...</span>
              <button
                v-for="airport in airportSuggestions[airportKey('form', 'origin')] || []"
                :key="`${airport.code}-${airport.iata}-${airport.name}`"
                type="button"
                @click="chooseFormAirport('origin', airport)"
              >
                {{ formatAirportOption(airport) }}
              </button>
            </div>
          </label>
          <label class="airport-field airport-field--compact">
            <span class="field-label">
              <span class="field-label__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s6-5.4 6-11a6 6 0 1 0-12 0c0 5.6 6 11 6 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>
              </span>
              <span class="field-label__copy"><strong>Destino</strong><small>Aeropuerto de llegada</small></span>
            </span>
            <input
              :value="form.destination"
              autocomplete="off"
              @focus="activeAirportKey = airportKey('form', 'destination')"
              @input="updateFormAirport('destination', $event)"
            />
            <div
              v-if="activeAirportKey === airportKey('form', 'destination') && (airportLoading[airportKey('form', 'destination')] || (airportSuggestions[airportKey('form', 'destination')] || []).length)"
              class="airport-options"
            >
              <span v-if="airportLoading[airportKey('form', 'destination')]">Buscando...</span>
              <button
                v-for="airport in airportSuggestions[airportKey('form', 'destination')] || []"
                :key="`${airport.code}-${airport.iata}-${airport.name}`"
                type="button"
                @click="chooseFormAirport('destination', airport)"
              >
                {{ formatAirportOption(airport) }}
              </button>
            </div>
          </label>
          <label
            class="schedule-field schedule-field--full"
            :ref="(element) => registerDateTimePickerRef(timePickerKey('form'), element)"
          >
            <span class="field-label">
              <span class="field-label__copy"><strong>Fecha y hora de salida</strong><small>Selecciona la salida ejecutiva en un solo bloque</small></span>
            </span>
            <button
              type="button"
              class="schedule-field__trigger"
              :class="{ 'schedule-field__trigger--active': activeTimePickerKey === timePickerKey('form') }"
              @click="openDateTimePicker(timePickerKey('form'), form.departureDate)"
            >
              <span class="schedule-field__trigger-copy">{{ formatTriggerDateTime(form.departureDate, form.departureTime) }}</span>
              <span class="schedule-field__trigger-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>
              </span>
            </button>
            <div v-if="activeTimePickerKey === timePickerKey('form')" class="datetime-popover">
              <section class="datetime-popover__calendar">
                <header class="datetime-popover__header">
                  <button type="button" class="datetime-nav" @click="changePickerMonth(timePickerKey('form'), -1, form.departureDate)">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </button>
                  <strong>{{ pickerMonthLabel(timePickerKey('form'), form.departureDate) }}</strong>
                  <button type="button" class="datetime-nav" @click="changePickerMonth(timePickerKey('form'), 1, form.departureDate)">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </button>
                </header>
                <div class="datetime-popover__weekdays">
                  <span v-for="weekday in weekdayHeaders" :key="`form-weekday-${weekday}`">{{ weekday }}</span>
                </div>
                <div class="datetime-popover__days">
                  <button
                    v-for="day in calendarDays(timePickerKey('form'), form.departureDate)"
                    :key="day.key"
                    type="button"
                    class="datetime-day"
                    :class="{
                      'datetime-day--muted': !day.isCurrentMonth,
                      'datetime-day--selected': day.isSelected,
                      'datetime-day--today': day.isToday,
                    }"
                    @click="selectFormDate('departureDate', day.value)"
                  >
                    {{ day.label }}
                  </button>
                </div>
                <footer class="datetime-popover__footer">
                  <div class="datetime-popover__footer-actions">
                    <button type="button" class="datetime-link" @click="clearFormDateTime('departureDate', 'departureTime')">Borrar</button>
                    <button type="button" class="datetime-link" @click="setFormToday('departureDate')">Hoy</button>
                  </div>
                  <div class="datetime-popover__footer-actions">
                    <button type="button" class="datetime-close" @click="closeTimePicker">Cerrar</button>
                    <button
                      type="button"
                      class="datetime-accept"
                      :disabled="!hasDateTimeSelection(form.departureDate, form.departureTime)"
                      @click="closeTimePicker"
                    >
                      Aceptar
                    </button>
                  </div>
                </footer>
              </section>
              <section class="datetime-popover__time">
                <div class="datetime-column">
                  <button
                    v-for="hour in hourOptions"
                    :key="`form-hour-${hour}`"
                    type="button"
                    class="datetime-time-chip"
                    :class="{ 'datetime-time-chip--selected': splitTimeParts(form.departureTime).hour === hour }"
                    @click="selectFormTimePart('departureTime', 'hour', hour)"
                  >
                    {{ hour }}
                  </button>
                </div>
                <div class="datetime-column">
                  <button
                    v-for="minute in minuteOptions"
                    :key="`form-minute-${minute}`"
                    type="button"
                    class="datetime-time-chip"
                    :class="{ 'datetime-time-chip--selected': splitTimeParts(form.departureTime).minute === minute }"
                    @click="selectFormTimePart('departureTime', 'minute', minute)"
                  >
                    {{ minute }}
                  </button>
                </div>
                <div class="datetime-column datetime-column--period">
                  <button
                    v-for="period in periodOptions"
                    :key="`form-period-${period}`"
                    type="button"
                    class="datetime-time-chip"
                    :class="{ 'datetime-time-chip--selected': splitTimeParts(form.departureTime).period === period }"
                    @click="selectFormTimePart('departureTime', 'period', period)"
                  >
                    {{ period === 'AM' ? 'a.m.' : 'p.m.' }}
                  </button>
                </div>
              </section>
            </div>
          </label>
          </template>

          <template v-else-if="tripType === 'Redondo'">
          <section class="roundtrip-grid">
            <article class="trip-panel trip-panel--primary">
              <div class="trip-panel__header">
                <span class="trip-panel__eyebrow">Tramo 1</span>
                <strong>Salida</strong>
                <small>{{ routePreview(form.origin, form.destination) }}</small>
              </div>
              <div class="trip-panel__body">
                <label class="airport-field airport-field--compact">
                  <span class="field-label"><span class="field-label__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s6-5.4 6-11a6 6 0 1 0-12 0c0 5.6 6 11 6 11Z"/><circle cx="12" cy="10" r="2.5"/></svg></span><span class="field-label__copy"><strong>Origen</strong><small>Base de salida</small></span></span>
                  <input
                    :value="form.origin"
                    autocomplete="off"
                    @focus="activeAirportKey = airportKey('form', 'origin')"
                    @input="updateFormAirport('origin', $event)"
                  />
                  <div
                    v-if="activeAirportKey === airportKey('form', 'origin') && (airportLoading[airportKey('form', 'origin')] || (airportSuggestions[airportKey('form', 'origin')] || []).length)"
                    class="airport-options"
                  >
                    <span v-if="airportLoading[airportKey('form', 'origin')]">Buscando...</span>
                    <button
                      v-for="airport in airportSuggestions[airportKey('form', 'origin')] || []"
                      :key="`${airport.code}-${airport.iata}-${airport.name}`"
                      type="button"
                      @click="chooseFormAirport('origin', airport)"
                    >
                      {{ formatAirportOption(airport) }}
                    </button>
                  </div>
                </label>
                <label class="airport-field airport-field--compact">
                  <span class="field-label"><span class="field-label__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s6-5.4 6-11a6 6 0 1 0-12 0c0 5.6 6 11 6 11Z"/><circle cx="12" cy="10" r="2.5"/></svg></span><span class="field-label__copy"><strong>Destino</strong><small>Aeropuerto de llegada</small></span></span>
                  <input
                    :value="form.destination"
                    autocomplete="off"
                    @focus="activeAirportKey = airportKey('form', 'destination')"
                    @input="updateFormAirport('destination', $event)"
                  />
                  <div
                    v-if="activeAirportKey === airportKey('form', 'destination') && (airportLoading[airportKey('form', 'destination')] || (airportSuggestions[airportKey('form', 'destination')] || []).length)"
                    class="airport-options"
                  >
                    <span v-if="airportLoading[airportKey('form', 'destination')]">Buscando...</span>
                    <button
                      v-for="airport in airportSuggestions[airportKey('form', 'destination')] || []"
                      :key="`${airport.code}-${airport.iata}-${airport.name}`"
                      type="button"
                      @click="chooseFormAirport('destination', airport)"
                    >
                      {{ formatAirportOption(airport) }}
                    </button>
                  </div>
                </label>
                <label
                  class="schedule-field schedule-field--full"
                  :ref="(element) => registerDateTimePickerRef(timePickerKey('round-form'), element)"
                >
                  <span class="field-label"><span class="field-label__copy"><strong>Fecha y hora de salida</strong><small>Define despegue en un solo control</small></span></span>
                  <button
                    type="button"
                    class="schedule-field__trigger"
                    :class="{ 'schedule-field__trigger--active': activeTimePickerKey === timePickerKey('round-form') }"
                    @click="openDateTimePicker(timePickerKey('round-form'), form.departureDate)"
                  >
                    <span class="schedule-field__trigger-copy">{{ formatTriggerDateTime(form.departureDate, form.departureTime) }}</span>
                    <span class="schedule-field__trigger-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>
                    </span>
                  </button>
                  <div v-if="activeTimePickerKey === timePickerKey('round-form')" class="datetime-popover">
                    <section class="datetime-popover__calendar">
                      <header class="datetime-popover__header">
                        <button type="button" class="datetime-nav" @click="changePickerMonth(timePickerKey('round-form'), -1, form.departureDate)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </button>
                        <strong>{{ pickerMonthLabel(timePickerKey('round-form'), form.departureDate) }}</strong>
                        <button type="button" class="datetime-nav" @click="changePickerMonth(timePickerKey('round-form'), 1, form.departureDate)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </button>
                      </header>
                      <div class="datetime-popover__weekdays">
                        <span v-for="weekday in weekdayHeaders" :key="`round-weekday-${weekday}`">{{ weekday }}</span>
                      </div>
                      <div class="datetime-popover__days">
                        <button
                          v-for="day in calendarDays(timePickerKey('round-form'), form.departureDate)"
                          :key="day.key"
                          type="button"
                          class="datetime-day"
                          :class="{
                            'datetime-day--muted': !day.isCurrentMonth,
                            'datetime-day--selected': day.isSelected,
                            'datetime-day--today': day.isToday,
                          }"
                          @click="selectFormDate('departureDate', day.value)"
                        >
                          {{ day.label }}
                        </button>
                      </div>
                      <footer class="datetime-popover__footer">
                        <div class="datetime-popover__footer-actions">
                          <button type="button" class="datetime-link" @click="clearFormDateTime('departureDate', 'departureTime')">Borrar</button>
                          <button type="button" class="datetime-link" @click="setFormToday('departureDate')">Hoy</button>
                        </div>
                        <div class="datetime-popover__footer-actions">
                          <button type="button" class="datetime-close" @click="closeTimePicker">Cerrar</button>
                          <button
                            type="button"
                            class="datetime-accept"
                            :disabled="!hasDateTimeSelection(form.departureDate, form.departureTime)"
                            @click="closeTimePicker"
                          >
                            Aceptar
                          </button>
                        </div>
                      </footer>
                    </section>
                    <section class="datetime-popover__time">
                      <div class="datetime-column">
                        <button
                          v-for="hour in hourOptions"
                          :key="`round-form-hour-${hour}`"
                          type="button"
                          class="datetime-time-chip"
                          :class="{ 'datetime-time-chip--selected': splitTimeParts(form.departureTime).hour === hour }"
                          @click="selectFormTimePart('departureTime', 'hour', hour)"
                        >
                          {{ hour }}
                        </button>
                      </div>
                      <div class="datetime-column">
                        <button
                          v-for="minute in minuteOptions"
                          :key="`round-form-minute-${minute}`"
                          type="button"
                          class="datetime-time-chip"
                          :class="{ 'datetime-time-chip--selected': splitTimeParts(form.departureTime).minute === minute }"
                          @click="selectFormTimePart('departureTime', 'minute', minute)"
                        >
                          {{ minute }}
                        </button>
                      </div>
                      <div class="datetime-column datetime-column--period">
                        <button
                          v-for="period in periodOptions"
                          :key="`round-form-period-${period}`"
                          type="button"
                          class="datetime-time-chip"
                          :class="{ 'datetime-time-chip--selected': splitTimeParts(form.departureTime).period === period }"
                          @click="selectFormTimePart('departureTime', 'period', period)"
                        >
                          {{ period === 'AM' ? 'a.m.' : 'p.m.' }}
                        </button>
                      </div>
                    </section>
                  </div>
                </label>
              </div>
            </article>

            <article class="trip-panel">
              <div class="trip-panel__header">
                <span class="trip-panel__eyebrow">Tramo 2</span>
                <strong>Regreso</strong>
                <small>{{ routePreview(form.destination, form.origin) }}</small>
              </div>
              <div class="trip-panel__body trip-panel__body--return">
                <label class="date-field airport-field--compact"><span class="field-label"><span class="field-label__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg></span><span class="field-label__copy"><strong>Fecha regreso</strong><small>Ruta inversa automatica</small></span></span><input :value="form.returnDate" type="date" @input="updateFormField('returnDate', $event)" /></label>
                <div class="trip-panel__note">
                  <span>Tomamos automaticamente la ruta inversa del tramo de salida para que solo definas la fecha estimada de regreso.</span>
                </div>
              </div>
            </article>
          </section>
          </template>

          <template v-else>
          <section class="multi-leg-builder" aria-label="Tramos multi-destino">
            <article
              v-for="(leg, index) in form.legs"
              :key="index"
              class="timeline-leg"
              :class="{ active: activeLegIndex === index }"
            >
              <button class="leg-summary" type="button" @click="toggleLeg(index)">
                <span class="timeline-marker">
                  <span class="timeline-step">{{ index + 1 }}</span>
                </span>
                <span class="leg-copy">
                  <span class="leg-copy__top">
                    <small>{{ legName(index, form.legs.length) }}</small>
                    <span class="leg-status" :class="legStatusClass(leg)">
                      {{ legStatus(leg) }}
                    </span>
                  </span>
                  <strong>{{ routePreview(leg.origin, leg.destination) }}</strong>
                  <em>{{ formatLegDate(leg.date) }} · {{ leg.time || 'Hora pendiente' }}</em>
                </span>
                <span class="edit-label">{{ activeLegIndex === index ? 'Ocultar detalles' : 'Editar tramo' }}</span>
              </button>

              <div v-if="activeLegIndex === index" class="leg-editor">
                <label class="airport-field airport-field--compact">
                  <span class="field-label"><span class="field-label__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s6-5.4 6-11a6 6 0 1 0-12 0c0 5.6 6 11 6 11Z"/><circle cx="12" cy="10" r="2.5"/></svg></span><span class="field-label__copy"><strong>Desde</strong><small>Inicio del tramo</small></span></span>
                  <input
                    :value="leg.origin"
                    autocomplete="off"
                    :readonly="index > 0"
                    :placeholder="index > 0 ? 'Se llena con el destino anterior' : ''"
                    @focus="index === 0 ? (activeAirportKey = airportKey('leg', 'origin', index)) : null"
                    @input="updateLegAirport(index, 'origin', $event)"
                  />
                  <div
                    v-if="index === 0 && activeAirportKey === airportKey('leg', 'origin', index) && (airportLoading[airportKey('leg', 'origin', index)] || (airportSuggestions[airportKey('leg', 'origin', index)] || []).length)"
                    class="airport-options"
                  >
                    <span v-if="airportLoading[airportKey('leg', 'origin', index)]">Buscando...</span>
                    <button
                      v-for="airport in airportSuggestions[airportKey('leg', 'origin', index)] || []"
                      :key="`${airport.code}-${airport.iata}-${airport.name}`"
                      type="button"
                      @click="chooseLegAirport(index, 'origin', airport)"
                    >
                      {{ formatAirportOption(airport) }}
                    </button>
                  </div>
                </label>
                <label class="airport-field airport-field--compact">
                  <span class="field-label"><span class="field-label__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s6-5.4 6-11a6 6 0 1 0-12 0c0 5.6 6 11 6 11Z"/><circle cx="12" cy="10" r="2.5"/></svg></span><span class="field-label__copy"><strong>Hacia</strong><small>Destino del tramo</small></span></span>
                  <input
                    :value="leg.destination"
                    autocomplete="off"
                    @focus="activeAirportKey = airportKey('leg', 'destination', index)"
                    @input="updateLegAirport(index, 'destination', $event)"
                  />
                  <div
                    v-if="activeAirportKey === airportKey('leg', 'destination', index) && (airportLoading[airportKey('leg', 'destination', index)] || (airportSuggestions[airportKey('leg', 'destination', index)] || []).length)"
                    class="airport-options"
                  >
                    <span v-if="airportLoading[airportKey('leg', 'destination', index)]">Buscando...</span>
                    <button
                      v-for="airport in airportSuggestions[airportKey('leg', 'destination', index)] || []"
                      :key="`${airport.code}-${airport.iata}-${airport.name}`"
                      type="button"
                      @click="chooseLegAirport(index, 'destination', airport)"
                    >
                      {{ formatAirportOption(airport) }}
                    </button>
                  </div>
                </label>
                <label
                  class="schedule-field schedule-field--full"
                  :ref="(element) => registerDateTimePickerRef(timePickerKey('leg', index), element)"
                >
                  <span class="field-label"><span class="field-label__copy"><strong>Fecha y hora de salida</strong><small>Bloque unificado del tramo</small></span></span>
                  <button
                    type="button"
                    class="schedule-field__trigger"
                    :class="{ 'schedule-field__trigger--active': activeTimePickerKey === timePickerKey('leg', index) }"
                    @click="openDateTimePicker(timePickerKey('leg', index), leg.date)"
                  >
                    <span class="schedule-field__trigger-copy">{{ formatTriggerDateTime(leg.date, leg.time) }}</span>
                    <span class="schedule-field__trigger-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>
                    </span>
                  </button>
                  <div v-if="activeTimePickerKey === timePickerKey('leg', index)" class="datetime-popover">
                    <section class="datetime-popover__calendar">
                      <header class="datetime-popover__header">
                        <button type="button" class="datetime-nav" @click="changePickerMonth(timePickerKey('leg', index), -1, leg.date)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </button>
                        <strong>{{ pickerMonthLabel(timePickerKey('leg', index), leg.date) }}</strong>
                        <button type="button" class="datetime-nav" @click="changePickerMonth(timePickerKey('leg', index), 1, leg.date)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </button>
                      </header>
                      <div class="datetime-popover__weekdays">
                        <span v-for="weekday in weekdayHeaders" :key="`leg-${index}-weekday-${weekday}`">{{ weekday }}</span>
                      </div>
                      <div class="datetime-popover__days">
                        <button
                          v-for="day in calendarDays(timePickerKey('leg', index), leg.date)"
                          :key="day.key"
                          type="button"
                          class="datetime-day"
                          :class="{
                            'datetime-day--muted': !day.isCurrentMonth,
                            'datetime-day--selected': day.isSelected,
                            'datetime-day--today': day.isToday,
                          }"
                          @click="selectLegDate(index, day.value)"
                        >
                          {{ day.label }}
                        </button>
                      </div>
                      <footer class="datetime-popover__footer">
                        <div class="datetime-popover__footer-actions">
                          <button type="button" class="datetime-link" @click="clearLegDateTime(index)">Borrar</button>
                          <button type="button" class="datetime-link" @click="setLegToday(index)">Hoy</button>
                        </div>
                        <div class="datetime-popover__footer-actions">
                          <button type="button" class="datetime-close" @click="closeTimePicker">Cerrar</button>
                          <button
                            type="button"
                            class="datetime-accept"
                            :disabled="!hasDateTimeSelection(leg.date, leg.time)"
                            @click="closeTimePicker"
                          >
                            Aceptar
                          </button>
                        </div>
                      </footer>
                    </section>
                    <section class="datetime-popover__time">
                      <div class="datetime-column">
                        <button
                          v-for="hour in hourOptions"
                          :key="`leg-datetime-hour-${index}-${hour}`"
                          type="button"
                          class="datetime-time-chip"
                          :class="{ 'datetime-time-chip--selected': splitTimeParts(leg.time).hour === hour }"
                          @click="selectLegTimePart(index, 'hour', hour)"
                        >
                          {{ hour }}
                        </button>
                      </div>
                      <div class="datetime-column">
                        <button
                          v-for="minute in minuteOptions"
                          :key="`leg-datetime-minute-${index}-${minute}`"
                          type="button"
                          class="datetime-time-chip"
                          :class="{ 'datetime-time-chip--selected': splitTimeParts(leg.time).minute === minute }"
                          @click="selectLegTimePart(index, 'minute', minute)"
                        >
                          {{ minute }}
                        </button>
                      </div>
                      <div class="datetime-column datetime-column--period">
                        <button
                          v-for="period in periodOptions"
                          :key="`leg-datetime-period-${index}-${period}`"
                          type="button"
                          class="datetime-time-chip"
                          :class="{ 'datetime-time-chip--selected': splitTimeParts(leg.time).period === period }"
                          @click="selectLegTimePart(index, 'period', period)"
                        >
                          {{ period === 'AM' ? 'a.m.' : 'p.m.' }}
                        </button>
                      </div>
                    </section>
                  </div>
                </label>
              </div>
            </article>
          </section>

          <div class="multi-leg-actions">
            <button class="secondary-action" type="button" @click="addLegAndOpen($emit, form.legs.length)">
              + Agregar destino
            </button>
            <button
              v-if="form.legs.length > 1"
              class="danger-action"
              type="button"
              @click="removeLastLeg($emit, form.legs.length)"
            >
              Eliminar destino
            </button>
          </div>

          </template>

          

          <button class="primary-action" type="submit">
            <span class="primary-action__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16.5 13 12l8-4.5-8-1.5L10.5 2H9l1 4-7 1.5L1 9l7 3-1 4h1.5L13 12l8 4.5Z"/></svg>
            </span>
            <span>Cotizar vuelo</span>
          </button>
        </form>
      </div>

      <aside class="hero-side-rail">
        <article class="concierge-card">
          <div class="concierge-card__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 3a4 4 0 0 1 4 4v1h1a3 3 0 0 1 3 3v4a4 4 0 0 1-4 4h-1v2h-2v-2h-2v2H9v-2H8a4 4 0 0 1-4-4v-4a3 3 0 0 1 3-3h1V7a4 4 0 0 1 4-4Zm2 5V7a2 2 0 1 0-4 0v1h4Zm-7 3a1 1 0 0 0-1 1v4a2 2 0 0 0 2 2h1v-4h2v4h2v-4h2v4h1a2 2 0 0 0 2-2v-4a1 1 0 0 0-1-1H7Z" fill="currentColor"/></svg>
          </div>
          <div class="concierge-card__copy">
            <span>Concierge 24/7</span>
            <strong>Estamos para ayudarte en cada detalle de tu viaje.</strong>
          </div>
          <button type="button" class="concierge-card__action">Contactar Concierge</button>
        </article>

        <article class="benefits-card">
          <article v-for="item in serviceHighlights" :key="item.title" class="benefits-card__item">
            <span class="benefits-card__bullet" aria-hidden="true"></span>
            <div>
              <strong>{{ item.title }}</strong>
              <p>{{ item.copy }}</p>
            </div>
          </article>
        </article>

        <article class="testimonial-card">
          <span class="testimonial-card__quote" aria-hidden="true">“</span>
          <p>La mejor experiencia en aviacion privada, siempre a tiempo y con el mejor servicio.</p>
          <strong>Cliente SkyGroup</strong>
        </article>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.flight-search-hero {
  display: grid;
  gap: 1.5rem;
  padding: clamp(1.1rem, 2vw, 1.8rem);
  border: 0;
  border-radius: 34px;
  background: #ffffff;
  box-shadow: none;
}

.hero-status-bar {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  padding: 0.1rem 0;
}

.hero-status-bar__account,
.hero-status-bar__pills,
.hero-status-bar__pills span {
  display: flex;
  align-items: center;
}

.hero-status-bar__account {
  gap: 0.7rem;
  color: #3c3a35;
  font-size: 0.8rem;
  font-weight: 700;
}

.hero-status-dot {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 999px;
  background: #b58a34;
  box-shadow: 0 0 0 6px rgba(181, 138, 52, 0.12);
}

.hero-status-bar__pills {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.55rem;
}

.hero-status-bar__pills span {
  min-height: 2.1rem;
  padding: 0 0.85rem;
  border-radius: 999px;
  background: rgba(255, 250, 241, 0.88);
  border: 1px solid rgba(181, 138, 52, 0.2);
  color: #6e5622;
  font-size: 0.74rem;
  font-weight: 800;
}

.hero-layout {
  display: grid;
  grid-template-columns: minmax(250px, 0.78fr) minmax(780px, 2fr) minmax(210px, 0.6fr);
  column-gap: 2.35rem;
  row-gap: 1.5rem;
  align-items: start;
  padding: clamp(0.35rem, 1vw, 0.6rem);
  border-radius: 30px;
  background: #ffffff;
  box-shadow: none;
}

.hero-copy-panel {
  display: grid;
  gap: 1rem;
  padding-top: 0.75rem;
  justify-self: start;
  margin-left: 2.1rem;
  margin-right: 0.9rem;
}

.hero-copy-panel__footer {
  display: grid;
  gap: 0.35rem;
  padding: 1rem 1.05rem;
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(255, 251, 243, 0.96), rgba(247, 240, 226, 0.92));
  border: 1px solid rgba(181, 138, 52, 0.16);
}

.hero-copy-panel__footer strong {
  color: #171410;
  font-size: 0.82rem;
  line-height: 1.25;
}

.hero-copy-panel__footer span {
  color: #655f56;
  font-size: 0.76rem;
  line-height: 1.45;
}

.search-copy {
  border: 1px solid rgba(223, 210, 183, 0.72);
  border-radius: 28px;
  background: linear-gradient(180deg, #ffffff, #fffdfa);
  box-shadow: 0 24px 60px rgba(75, 60, 31, 0.06);
  padding: clamp(1.2rem, 2vw, 1.7rem);
  overflow: visible;
}

.eyebrow {
  color: #8b6a24;
  font-size: 0.7rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1 {
  display: grid;
  gap: 0.06em;
  max-width: 7ch;
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  font-size: clamp(3.2rem, 4.8vw, 4.9rem);
  line-height: 0.88;
  letter-spacing: -0.05em;
  color: rgba(7, 27, 54, 0.86);
  overflow-wrap: normal;
  word-break: normal;
  hyphens: none;
}

h1 span {
  display: block;
  color: rgba(7, 27, 54, 0.86);
}

p {
  margin: 0;
  color: #5f5f5f;
  font-size: 0.95rem;
  line-height: 1.45;
}

.flight-form {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.72rem 0.72rem;
  overflow: visible;
}

.flight-form label {
  position: relative;
  display: grid;
  gap: 0.38rem;
  color: #2d2922;
  font-size: 0.82rem;
  font-weight: 600;
}

.flight-form input {
  min-height: 3.6rem;
  width: 100%;
  min-width: 0;
  border: 1px solid #dfd4bf;
  border-radius: 18px;
  padding: 0 1rem;
  background: #fffefb;
  color: rgba(7, 27, 54, 0.86);
  font: inherit;
  font-size: 1.05rem;
  font-weight: 500;
}

.flight-form select {
  min-height: 3.6rem;
  width: 100%;
  border: 1px solid #dfd4bf;
  border-radius: 18px;
  padding: 0 1rem;
  background: #fffefb;
  color: rgba(7, 27, 54, 0.86);
  font: inherit;
  font-size: 1.05rem;
  font-weight: 500;
  appearance: none;
}

.flight-form textarea {
  width: 100%;
  min-height: 7rem;
  border: 1px solid #d8d2c4;
  border-radius: 8px;
  padding: 0.85rem;
  background: #fbfaf7;
  color: rgba(7, 27, 54, 0.86);
  font: inherit;
  resize: vertical;
}

.flight-extras {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem 0.7rem;
}

.airport-field {
  z-index: 4;
}

.airport-field:focus-within {
  z-index: 30;
}

.airport-options {
  position: absolute;
  top: calc(100% + 0.35rem);
  right: 0;
  left: 0;
  z-index: 40;
  display: grid;
  gap: 0.25rem;
  max-height: 16rem;
  overflow: auto;
  padding: 0.45rem;
  border: 1px solid #dfd4bf;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.14);

}

.airport-options span {
  padding: 0.65rem;
  color: #6a604f;
  font-size: 0.76rem;
}

.airport-options button {
  min-height: 2.55rem;
  justify-content: start;
  padding: 0.55rem 0.65rem;
  background: #fbfaf7;
  color: #141414;
  text-align: left;
}

.airport-options button:hover {
  background: #ece8df;
}

.field-label {
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
}

.field-label__icon,
.control-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

.field-label__icon {
  width: 2.1rem;
  height: 2.1rem;
  border-radius: 999px;
  background: #f5efe2;
  color: #7f8fa6;
}

.field-label__icon svg,
.control-icon svg {
  width: 1rem;
  height: 1rem;
}

.field-label__copy {
  display: grid;
  gap: 0.08rem;
}

.field-label__copy strong {
  color: #1c2b43;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.15;
}

.field-label__copy small {
  color: #7d8491;
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.2;
}

.airport-field--compact,
.schedule-field {
  align-self: start;
}

.schedule-field {
  padding: 0.1rem 0 0;
  position: relative;
}

.schedule-field--full {
  grid-column: 1 / -1;
}

.schedule-field__trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 3.75rem;
  padding: 0 1rem 0 1.15rem;
  border: 1px solid #dfd4bf;
  border-radius: 20px;
  background: #ffffff;
  color: #16263f;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.schedule-field__trigger-copy {
  color: #2f3d53;
  font-size: 1rem;
  font-weight: 500;
  letter-spacing: 0.01em;
}

.schedule-field__trigger-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #121212;
}

.schedule-field__trigger-icon svg {
  width: 1.2rem;
  height: 1.2rem;
}

.schedule-field__trigger--active,
.airport-field input:focus,
.date-field input:focus,
.time-field select:focus,
.flight-form input:focus,
.flight-form select:focus {
  border-color: #1f57c3;
  box-shadow: 0 0 0 4px rgba(31, 87, 195, 0.08);
  outline: none;
}

.schedule-field__trigger:hover,
.flight-form input:hover,
.flight-form select:hover {
  border-color: #1f57c3;
}

.datetime-popover {
  position: absolute;
  top: calc(100% + 0.55rem);
  left: 0;
  min-width: min(31rem, 82vw);
  z-index: 50;
  display: grid;
  grid-template-columns: minmax(12.5rem, 1fr) minmax(6.8rem, 0.52fr);
  gap: 0.65rem;
  padding: 0.65rem;
  border: 1px solid #cfd8e6;
  border-radius: 0;
  background: #ffffff;
  box-shadow: 0 24px 40px rgba(17, 31, 56, 0.16);
}

.datetime-popover__calendar {
  display: grid;
  gap: 0.42rem;
}

.datetime-popover__header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.45rem;
}

.datetime-popover__header strong {
  color: #121212;
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: lowercase;
}

.datetime-nav {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 1.55rem;
  min-width: 1.55rem;
  padding: 0;
  background: transparent;
  color: #202834;
}

.datetime-nav svg {
  width: 0.82rem;
  height: 0.82rem;
}

.datetime-popover__weekdays,
.datetime-popover__days {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.2rem;
}

.datetime-popover__weekdays span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 1.15rem;
  color: #111111;
  font-size: 0.62rem;
  font-weight: 500;
}

.datetime-day {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 1.72rem;
  padding: 0;
  border-radius: 6px;
  background: transparent;
  color: #151515;
  font-size: 0.72rem;
  font-weight: 500;
}

.datetime-day--muted {
  color: #7e7e7e;
}

.datetime-day--selected {
  background: #1f73e8;
  color: #ffffff;
  font-weight: 700;
}

.datetime-day--today:not(.datetime-day--selected) {
  box-shadow: inset 0 0 0 1px rgba(31, 115, 232, 0.38);
}

.datetime-popover__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 0.05rem;
}

.datetime-popover__footer-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
}

.datetime-link {
  min-height: auto;
  padding: 0;
  background: transparent;
  color: #1f73e8;
  font-size: 0.68rem;
  font-weight: 500;
}

.datetime-close {
  min-height: 1.9rem;
  padding: 0 0.75rem;
  border: 1px solid #d6dfec;
  border-radius: 999px;
  background: #ffffff;
  color: #42536d;
  font-size: 0.7rem;
  font-weight: 600;
}

.datetime-close:hover {
  border-color: #1f57c3;
  color: #1f57c3;
}

.datetime-accept {
  min-height: 1.9rem;
  padding: 0 0.8rem;
  border-radius: 999px;
  background: #1f73e8;
  color: #ffffff;
  font-size: 0.7rem;
  font-weight: 700;
}

.datetime-accept:disabled {
  background: #d7deea;
  color: #7e8898;
  cursor: not-allowed;
}

.datetime-popover__time {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.32rem;
  align-items: start;
}

.datetime-column {
  display: grid;
  gap: 0.25rem;
  max-height: 14.5rem;
  overflow-y: auto;
  padding-right: 0.1rem;
}

.datetime-column--period {
  max-height: none;
}

.datetime-time-chip {
  min-height: 1.95rem;
  border-radius: 6px;
  background: transparent;
  color: #171717;
  font-size: 0.72rem;
  font-weight: 600;
}

.datetime-time-chip--selected {
  background: #1f73e8;
  color: #ffffff;
}

.segmented-control {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.4rem;
  padding: 0.35rem;
  border-radius: 24px;
  background: #ffffff;
  border: 1px solid rgba(221, 211, 190, 0.9);
}

button {
  min-height: 2.8rem;
  border: 0;
  border-radius: 14px;
  padding: 0 1rem;
  font-weight: 600;
  cursor: pointer;
}

.segmented-control button {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  justify-content: start;
  gap: 0.7rem;
  padding: 0.85rem 1rem;
  min-height: 4.6rem;
  border-radius: 18px;
  background: transparent;
  color: rgba(7, 27, 54, 0.86);
  text-align: left;
}

.segmented-control button.active,
.primary-action {
  background: rgba(7, 27, 54, 0.86);
  color: #ffffff;
}

.segmented-control button.active .control-copy strong,
.segmented-control button.active .control-copy small,
.segmented-control button.active .control-icon,
.segmented-control button.active .control-icon svg,
.primary-action {
  color: #ffffff;
}

.control-copy {
  display: grid;
  gap: 0.15rem;
}

.control-copy strong,
.control-copy small {
  display: block;
}

.control-copy small {
  color: inherit;
  opacity: 0.78;
  font-size: 0.74rem;
  font-weight: 600;
}

.segmented-control button.active .control-copy small {
  opacity: 0.9;
}

.control-copy strong {
  font-size: 0.92rem;
  font-weight: 800;
}

.primary-action,
.advanced-options,
.secondary-action,
.time-toggle,
.wide-field,
.multi-leg-builder,
.builder-headline,
.preference-panel,
.mode-intro,
.roundtrip-grid {
  grid-column: 1 / -1;
}

.mode-intro {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 1rem;
  padding: 1.15rem 1.1rem;
  border: 1px solid #eadfcb;
  border-radius: 22px;
  background: linear-gradient(145deg, #fffdf8, #f7f2e9);
}

.mode-intro__symbol {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4.2rem;
  height: 4.2rem;
  border-radius: 999px;
  border: 2px solid rgba(181, 138, 52, 0.7);
  color: #9c7421;
}

.mode-intro__symbol svg {
  width: 1.6rem;
  height: 1.6rem;
}

.mode-intro__eyebrow {
  color: #8b6a24;
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.mode-intro strong {
  display: block;
  margin-bottom: 0.2rem;
  color: #141414;
  font-size: 0.88rem;
  line-height: 1.3;
}

.mode-intro p {
  color: #5f5f5f;
  font-size: 0.74rem;
  line-height: 1.45;
}

.roundtrip-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.trip-panel {
  display: grid;
  gap: 0.85rem;
  padding: 1.15rem;
  border: 1px solid #e5dcc8;
  border-radius: 22px;
  background: linear-gradient(180deg, #ffffff, #fbfaf7);
}

.trip-panel--primary {
  border-color: #d9c79b;
  box-shadow: 0 14px 32px rgba(17, 17, 17, 0.05);
}

.trip-panel__header {
  display: grid;
  gap: 0.2rem;
}

.trip-panel__eyebrow {
  color: #8b6a24;
  font-size: 0.7rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.trip-panel__header strong {
  color: rgba(7, 27, 54, 0.86);
  font-size: 0.92rem;
}

.trip-panel__header small {
  color: #6a604f;
  font-size: 0.76rem;
  font-weight: 700;
}

.trip-panel__body {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.72rem;
}

.trip-panel__body > .date-field,
.trip-panel__body > .trip-panel__note {
  align-self: start;
}

.trip-panel__note {
  display: grid;
  grid-column: 1 / -1;
  padding: 0.95rem 1rem;
  border-radius: 16px;
  background: #f5f1e8;
}

.trip-panel__note--compact {
  margin-top: -0.1rem;
}

.trip-panel__note span {
  color: #4e4333;
  font-size: 0.76rem;
  line-height: 1.4;
}

.trip-panel__inline-toggle {
  min-height: 3.2rem;
}

.trip-panel__time-field--return .time-parts {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.time-toggle {
  min-height: 3rem;
  border: 1px dashed #d6cdbd;
  border-radius: 14px;
  background: #fcfaf6;
  color: #3b3428;
  font-size: 0.76rem;
  font-weight: 700;
}

.secondary-action {
  background: #ece8df;
  color: rgba(7, 27, 54, 0.86);
}

.danger-action {
  background: #fff0ed;
  color: #8f1f1f;
}

.multi-leg-builder {
  display: grid;
  gap: 1rem;
}

.multi-leg-actions {
  display: grid;
  grid-column: 1 / -1;
  gap: 0.75rem;
}

.builder-headline {
  display: grid;
  gap: 0.25rem;
  padding: 1rem;
  border-radius: 18px;
  background: linear-gradient(145deg, #141414, #24211b);
}

.builder-headline span {
  color: #d8b45b;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.builder-headline strong {
  color: #ffffff;
  font-size: 1.1rem;
}

.builder-headline small {
  color: rgba(255, 255, 255, 0.78);
  font-size: 0.88rem;
  line-height: 1.4;
}

.timeline-leg {
  display: grid;
  gap: 0.75rem;
}

.leg-summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: start;
  min-height: 5.25rem;
  padding: 1rem 1.15rem;
  border: 1px solid #e1d5bc;
  border-radius: 22px;
  background: linear-gradient(180deg, #fffdf9, #f8f4ec);
  color: rgba(7, 27, 54, 0.86);
  text-align: left;
  box-shadow: 0 10px 24px rgba(50, 38, 15, 0.04);
}

.timeline-leg.active .leg-summary {
  border-color: #b7903c;
  background: #ffffff;
  box-shadow: 0 18px 36px rgba(50, 38, 15, 0.1);
}

.timeline-marker {
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 0.1rem;
}

.timeline-step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 999px;
  background: #141414;
  color: #ffffff;
  font-size: 0.9rem;
  font-weight: 900;
  box-shadow: 0 0 0 6px #f5ecda;
}

.leg-copy {
  display: grid;
  min-width: 0;
  gap: 0.32rem;
}

.leg-copy__top {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  align-items: center;
}

.leg-copy small {
  color: #8b6a24;
  font-size: 0.74rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.leg-copy strong {
  color: #141414;
  font-size: 1.05rem;
  line-height: 1.2;
}

.leg-copy em {
  color: #6f6a60;
  font-style: normal;
  font-weight: 700;
}

.leg-status {
  display: inline-flex;
  align-items: center;
  min-height: 1.5rem;
  padding: 0 0.55rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.leg-status--completo {
  background: #e5f4ea;
  color: #1c6a39;
}

.leg-status--en-captura {
  background: #fff1d8;
  color: #9a6200;
}

.leg-status--pendiente {
  background: #f1ede5;
  color: #6f6657;
}

.edit-label {
  align-self: center;
  color: #4d4332;
  font-size: 0.8rem;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.leg-editor {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.72rem;
  padding: 1rem;
  border: 1px solid #eadfcb;
  border-radius: 22px;
  background: #ffffff;
}

.leg-editor button {
  min-height: 3.2rem;
  background: #fff0ed;
  color: #8f1f1f;
}

.preference-panel {
  display: grid;
  grid-template-columns: minmax(0, 0.45fr) minmax(0, 1fr);
  gap: 0.75rem;
  padding: 1rem;
  border-radius: 8px;
  background: #fbfaf7;
}

.advanced-options {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  min-height: 3.1rem;
  border: 1px solid rgba(221, 211, 190, 0.95);
  background: #f6f1e8;
  color: #342d22;
  font-size: 0.8rem;
}

.primary-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.7rem;
  min-height: 3.7rem;
  border-radius: 18px;
  color: #ffffff !important;
  font-size: 0.98rem;
  font-weight: 800;
  box-shadow: 0 14px 24px rgba(17, 17, 17, 0.14);
  transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
}

.primary-action span,
.primary-action svg {
  color: #ffffff !important;
  fill: none;
  stroke: currentColor;
}

.primary-action:hover {
  transform: translateY(-1px);
  box-shadow: 0 18px 28px rgba(17, 17, 17, 0.18);
  filter: brightness(1.02);
}

.primary-action__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.primary-action__icon svg {
  width: 1rem;
  height: 1rem;
}

.form-assurance {
  grid-column: 1 / -1;
  color: #5f5a52;
  text-align: center;
  font-size: 0.92rem;
  font-weight: 600;
}

.hero-side-rail {
  display: grid;
  gap: 1rem;
}

.concierge-card,
.benefits-card,
.testimonial-card {
  border-radius: 24px;
  border: 1px solid rgba(224, 212, 188, 0.86);
  background: #ffffff;
  box-shadow: 0 20px 44px rgba(75, 60, 31, 0.06);
}

.concierge-card {
  display: grid;
  gap: 1rem;
  padding: 1.25rem;
  background:
    radial-gradient(circle at top left, rgba(218, 186, 114, 0.14), transparent 26%),
    linear-gradient(180deg, #172844, #0f1d35);
  color: #ffffff;
  box-shadow: 0 22px 44px rgba(20, 35, 62, 0.2);
}

.concierge-card__icon {
  width: 3rem;
  height: 3rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(212, 178, 103, 0.18);
  color: #ddb45c;
}

.concierge-card__icon svg {
  width: 1.4rem;
  height: 1.4rem;
}

.concierge-card__copy {
  display: grid;
  gap: 0.35rem;
}

.concierge-card__copy span {
  color: #ddb45c;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.concierge-card__copy strong {
  font-size: 0.84rem;
  line-height: 1.45;
}

.concierge-card__action {
  min-height: 3rem;
  background: linear-gradient(180deg, #c59a3d, #b4872a);
  color: #ffffff;
}

.benefits-card {
  display: grid;
  gap: 0.8rem;
  padding: 1.15rem;
}

.benefits-card__item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.8rem;
  align-items: start;
}

.benefits-card__bullet {
  width: 0.75rem;
  height: 0.75rem;
  margin-top: 0.4rem;
  border-radius: 999px;
  background: #c59d46;
  box-shadow: 0 0 0 6px rgba(197, 157, 70, 0.12);
}

.benefits-card__item strong {
  display: block;
  color: #181511;
  margin-bottom: 0.2rem;
}

.benefits-card__item p {
  color: #656056;
  font-size: 0.74rem;
  line-height: 1.4;
}

.benefits-card__item strong {
  font-size: 0.84rem;
}

.testimonial-card {
  display: grid;
  gap: 0.7rem;
  padding: 1.2rem;
}

.testimonial-card__quote {
  color: #b48a34;
  font-size: 2.2rem;
  line-height: 1;
}

.testimonial-card p {
  color: #302b23;
  font-size: 0.8rem;
  line-height: 1.55;
}

.testimonial-card strong {
  color: #6e5622;
  font-size: 0.78rem;
}

@media (max-width: 1080px) {
  .hero-status-bar,
  .hero-layout,
  .preference-panel {
    grid-template-columns: 1fr;
  }

  .hero-status-bar {
    display: grid;
  }

  .hero-status-bar__pills {
    justify-content: flex-start;
  }

  .flight-form,
  .leg-editor,
  .roundtrip-grid,
  .trip-panel__body {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .datetime-popover {
    grid-template-columns: 1fr;
    min-width: min(24rem, 90vw);
  }

  .datetime-popover__time {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .hero-copy-panel {
    padding-top: 0;
    margin-left: 0;
    margin-right: 0;
  }

  h1 {
    max-width: 8ch;
  }
}

@media (min-width: 1081px) and (max-width: 1360px) {
  .hero-copy-panel {
    max-width: 15.5rem;
    margin-left: -3rem;
    margin-right: 1.2rem;
  }
}

@media (max-width: 760px) {
  .flight-search-hero {
    padding: 0.9rem;
    border-radius: 24px;
  }

  .hero-copy-panel {
    margin-left: 0;
    margin-right: 0;
  }

  .search-copy {
    overflow: visible;
  }

  .hero-layout {
    padding: 0;
    background: transparent;
  }

  .hero-status-bar__account {
    font-size: 0.88rem;
  }

  .search-copy {
    padding: 1rem;
    border-radius: 22px;
  }

  h1 {
    max-width: 8ch;
    font-size: clamp(2.2rem, 11vw, 3.2rem);
  }

  .hero-copy-panel p,
  .search-copy p {
    font-size: 0.92rem;
    line-height: 1.35;
  }

  .flight-form {
    grid-template-columns: 1fr;
    gap: 0.55rem;
    margin-top: 0.85rem;
    overflow: visible;
  }

  .flight-extras {
    grid-template-columns: 1fr;
  }

  .flight-form input,
  .flight-form select,
  .flight-form textarea {
    min-height: 3.5rem;
  }

  .segmented-control {
    grid-template-columns: 1fr;
  }

  .hero-status-bar__pills {
    gap: 0.45rem;
  }

  .hero-status-bar__pills span {
    font-size: 0.76rem;
  }

  .segmented-control button,
  .primary-action,
  .secondary-action,
  .time-toggle,
  .advanced-options {
    min-height: 2.8rem;
    font-size: 0.92rem;
  }

  .mode-intro {
    grid-template-columns: 1fr;
  }

  .leg-summary {
    grid-template-columns: auto minmax(0, 1fr);
    padding: 0.95rem;
    border-radius: 16px;
  }

  .edit-label {
    grid-column: 2;
    justify-self: start;
  }

  .leg-editor {
    grid-template-columns: 1fr;
    padding: 0.8rem;
  }

  .roundtrip-grid,
  .trip-panel__body {
    grid-template-columns: 1fr;
  }

  .datetime-popover {
    left: 0;
    right: auto;
    min-width: min(18rem, calc(100vw - 1rem));
    padding: 0.6rem;
    gap: 0.6rem;
  }

  .datetime-popover__time {
    grid-template-columns: 1fr;
  }

  .datetime-column {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    max-height: none;
    overflow: visible;
  }

  .datetime-column--period {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .mode-intro,
  .trip-panel,
  .builder-headline,
  .concierge-card,
  .benefits-card,
  .testimonial-card {
    border-radius: 14px;
  }
}
</style>
