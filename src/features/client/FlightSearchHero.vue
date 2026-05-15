<script setup>
import { reactive, ref } from 'vue'
import { searchAirports } from '../../lib/airportSearch'
import { formatAirportOption } from '../../utils/airports'

const activeLegIndex = ref(0)
const airportSuggestions = reactive({})
const airportLoading = reactive({})
const activeAirportKey = ref('')
const showDepartureTime = ref(false)
const showReturnTime = ref(false)
const airportTimers = {}
const hourOptions = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'))
const minuteOptions = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'))
const periodOptions = ['AM', 'PM']

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

function revealDepartureTime() {
  showDepartureTime.value = true
}

function revealReturnTime() {
  showReturnTime.value = true
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

function routePreview(origin = '', destination = '') {
  if (origin && destination) return `${origin} → ${destination}`
  if (origin) return `${origin} → Destino`
  if (destination) return `Origen → ${destination}`
  return 'Origen → Destino'
}
</script>

<template>
  <section class="flight-search-hero">
    <div class="search-copy">
      <span class="eyebrow">Planificador de aviacion privada</span>
      <h1>Busca. Reserva. Vuela.</h1>
      <p>Entra, elige y reserva tu vuelo privado con control total desde el primer paso.</p>

      <form class="flight-form" @submit.prevent="$emit('submit')">
        <div class="segmented-control">
          <button type="button" :class="{ active: tripType === 'Ida' }" @click="$emit('update-trip-type', 'Ida')">
            Ida
          </button>
          <button type="button" :class="{ active: tripType === 'Redondo' }" @click="$emit('update-trip-type', 'Redondo')">
            Redondo
          </button>
          <button
            type="button"
            :class="{ active: tripType === 'Multi-destino' }"
            @click="$emit('update-trip-type', 'Multi-destino')"
          >
            Multi-destino
          </button>
        </div>

        <div v-if="tripType === 'Redondo'" class="mode-intro mode-intro--roundtrip">
          <span class="mode-intro__eyebrow">Viaje redondo</span>
          <strong>Define salida y regreso en un mismo flujo ejecutivo.</strong>
          <p>Ideal para juntas, inspecciones o regreso el mismo día con control total del itinerario.</p>
        </div>

        <div v-else-if="tripType === 'Multi-destino'" class="mode-intro mode-intro--multi">
          <span class="mode-intro__eyebrow">Ruta multi-destino</span>
          <strong>Construye una gira privada tramo por tramo.</strong>
          <p>Perfecto para roadshows, visitas ejecutivas y agendas que combinan varias ciudades.</p>
        </div>

        <template v-if="tripType === 'Ida'">
          <label class="airport-field">
            Origen
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
          <label class="airport-field">
            Destino
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
          <label class="date-field">Fecha<input :value="form.departureDate" type="date" @input="updateFormField('departureDate', $event)" /></label>
          <button
            v-if="!showDepartureTime && !form.departureTime"
            class="time-toggle"
            type="button"
            @click="revealDepartureTime"
          >
            Agregar hora especifica
          </button>
          <label v-else class="time-field">
            Hora
            <div class="time-parts">
              <select :value="splitTimeParts(form.departureTime).hour" @change="updateFormTime('departureTime', 'hour', $event.target.value)">
                <option value="">Hora</option>
                <option v-for="hour in hourOptions" :key="`departure-hour-${hour}`" :value="hour">{{ hour }}</option>
              </select>
              <select :value="splitTimeParts(form.departureTime).minute" @change="updateFormTime('departureTime', 'minute', $event.target.value)">
                <option v-for="minute in minuteOptions" :key="`departure-minute-${minute}`" :value="minute">{{ minute }}</option>
              </select>
              <select :value="splitTimeParts(form.departureTime).period" @change="updateFormTime('departureTime', 'period', $event.target.value)">
                <option v-for="period in periodOptions" :key="`departure-period-${period}`" :value="period">{{ period }}</option>
              </select>
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
                <label class="airport-field">
                  Origen
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
                <label class="airport-field">
                  Destino
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
                <label class="date-field">Fecha salida<input :value="form.departureDate" type="date" @input="updateFormField('departureDate', $event)" /></label>
                <button
                  v-if="!showDepartureTime && !form.departureTime"
                  class="time-toggle"
                  type="button"
                  @click="revealDepartureTime"
                >
                  Agregar hora salida
                </button>
                <label v-else class="time-field">
                  Hora salida
                  <div class="time-parts">
                    <select :value="splitTimeParts(form.departureTime).hour" @change="updateFormTime('departureTime', 'hour', $event.target.value)">
                      <option value="">Hora</option>
                      <option v-for="hour in hourOptions" :key="`round-departure-hour-${hour}`" :value="hour">{{ hour }}</option>
                    </select>
                    <select :value="splitTimeParts(form.departureTime).minute" @change="updateFormTime('departureTime', 'minute', $event.target.value)">
                      <option v-for="minute in minuteOptions" :key="`round-departure-minute-${minute}`" :value="minute">{{ minute }}</option>
                    </select>
                    <select :value="splitTimeParts(form.departureTime).period" @change="updateFormTime('departureTime', 'period', $event.target.value)">
                      <option v-for="period in periodOptions" :key="`round-departure-period-${period}`" :value="period">{{ period }}</option>
                    </select>
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
              <div class="trip-panel__body">
                <label class="date-field">Fecha regreso<input :value="form.returnDate" type="date" @input="updateFormField('returnDate', $event)" /></label>
                <button
                  v-if="!showReturnTime && !form.returnTime"
                  class="time-toggle"
                  type="button"
                  @click="revealReturnTime"
                >
                  Agregar hora regreso
                </button>
                <label v-else class="time-field">
                  Hora regreso
                  <div class="time-parts">
                    <select :value="splitTimeParts(form.returnTime).hour" @change="updateFormTime('returnTime', 'hour', $event.target.value)">
                      <option value="">Hora</option>
                      <option v-for="hour in hourOptions" :key="`return-hour-${hour}`" :value="hour">{{ hour }}</option>
                    </select>
                    <select :value="splitTimeParts(form.returnTime).minute" @change="updateFormTime('returnTime', 'minute', $event.target.value)">
                      <option v-for="minute in minuteOptions" :key="`return-minute-${minute}`" :value="minute">{{ minute }}</option>
                    </select>
                    <select :value="splitTimeParts(form.returnTime).period" @change="updateFormTime('returnTime', 'period', $event.target.value)">
                      <option v-for="period in periodOptions" :key="`return-period-${period}`" :value="period">{{ period }}</option>
                    </select>
                  </div>
                </label>
                <div class="trip-panel__note">
                  <span>El tramo de regreso toma automáticamente el aeropuerto inverso del viaje de salida.</span>
                </div>
              </div>
            </article>
          </section>
        </template>

        <template v-else>
          <div class="builder-headline">
            <span>Mapa ejecutivo</span>
            <strong>{{ summary.legs.length }} tramos listos para tu gira privada</strong>
            <small>Ordena ciudades, fechas y horarios sin perder continuidad operativa.</small>
          </div>

          <section class="multi-leg-builder" aria-label="Tramos multi-destino">
            <article
              v-for="(leg, index) in form.legs"
              :key="index"
              class="timeline-leg"
              :class="{ active: activeLegIndex === index }"
            >
              <button class="leg-summary" type="button" @click="toggleLeg(index)">
                <span class="timeline-dot"></span>
                <span class="leg-copy">
                  <small>{{ legName(index, form.legs.length) }}</small>
                  <strong>{{ leg.origin || 'Origen' }} -> {{ leg.destination || 'Destino' }}</strong>
                  <em>{{ formatLegDate(leg.date) }} · {{ leg.time || 'Hora pendiente' }}</em>
                </span>
                <span class="edit-label">{{ activeLegIndex === index ? 'Cerrar' : 'Editar' }}</span>
              </button>

              <div v-if="activeLegIndex === index" class="leg-editor">
                <label class="airport-field">
                  Desde
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
                <label class="airport-field">
                  Hacia
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
                <label class="date-field">Fecha<input :value="leg.date" type="date" @input="updateLegField(index, 'date', $event)" /></label>
                <label class="time-field">
                  Hora
                  <div class="time-parts">
                    <select :value="splitTimeParts(leg.time).hour" @change="updateLegTime(index, 'hour', $event.target.value)">
                      <option value="">Hora</option>
                      <option v-for="hour in hourOptions" :key="`leg-${index}-hour-${hour}`" :value="hour">{{ hour }}</option>
                    </select>
                    <select :value="splitTimeParts(leg.time).minute" @change="updateLegTime(index, 'minute', $event.target.value)">
                      <option v-for="minute in minuteOptions" :key="`leg-${index}-minute-${minute}`" :value="minute">{{ minute }}</option>
                    </select>
                    <select :value="splitTimeParts(leg.time).period" @change="updateLegTime(index, 'period', $event.target.value)">
                      <option v-for="period in periodOptions" :key="`leg-${index}-period-${period}`" :value="period">{{ period }}</option>
                    </select>
                  </div>
                </label>
                <button v-if="form.legs.length > 2" type="button" @click="$emit('remove-leg', index)">Quitar destino</button>
              </div>
            </article>
          </section>

          <button class="secondary-action" type="button" @click="addLegAndOpen($emit, form.legs.length)">
            + Agregar destino
          </button>

        </template>

        <button class="primary-action" type="submit">Cotizar vuelo</button>
      </form>
    </div>

  </section>
</template>

<style scoped>
.flight-search-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: stretch;
}

.search-copy {
  border: 1px solid #e5e1d8;
  border-radius: 8px;
  background: #ffffff;
  overflow: visible;
}

.search-copy {
  padding: clamp(1.25rem, 4vw, 2rem);
}

.eyebrow {
  color: #8b6a24;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1 {
  max-width: 11ch;
  margin: 0.55rem 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  font-size: clamp(2.15rem, 5vw, 4rem);
  line-height: 0.98;
  letter-spacing: 0;
  overflow-wrap: anywhere;
}

p {
  margin: 0;
  color: #5f5f5f;
}

.flight-form {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem 0.7rem;
  margin-top: 1.05rem;
  overflow: visible;
}

.flight-form label {
  position: relative;
  display: grid;
  gap: 0.4rem;
  color: #2d2922;
  font-weight: 600;
}

.flight-form input {
  min-height: 2.95rem;
  width: 100%;
  min-width: 0;
  border: 1px solid #d8d2c4;
  border-radius: 8px;
  padding: 0 0.85rem;
  background: #fbfaf7;
  color: #111111;
  font: inherit;
}

.flight-form select {
  min-height: 2.95rem;
  width: 100%;
  border: 1px solid #d8d2c4;
  border-radius: 8px;
  padding: 0 0.85rem;
  background: #fbfaf7;
  color: #111111;
  font: inherit;
}

.flight-form textarea {
  width: 100%;
  min-height: 7rem;
  border: 1px solid #d8d2c4;
  border-radius: 8px;
  padding: 0.85rem;
  background: #fbfaf7;
  color: #111111;
  font: inherit;
  resize: vertical;
}

.flight-extras {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem 0.7rem;
}

.time-parts {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr) minmax(0, 0.9fr);
  gap: 0.55rem;
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
  border: 1px solid #d8d2c4;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.14);
}

.airport-options span {
  padding: 0.65rem;
  color: #6a604f;
  font-size: 0.82rem;
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

.segmented-control {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.35rem;
  padding: 0.22rem;
  border-radius: 999px;
  background: #f3efe7;
}

button {
  min-height: 2.8rem;
  border: 0;
  border-radius: 8px;
  padding: 0 1rem;
  font-weight: 600;
  cursor: pointer;
}

.segmented-control button {
  border-radius: 999px;
  background: transparent;
  color: #111111;
}

.segmented-control button.active,
.primary-action {
  background: #111111;
  color: #ffffff;
}

.primary-action,
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
  gap: 0.28rem;
  padding: 1rem 1.05rem;
  border: 1px solid #eadfcb;
  border-radius: 18px;
  background: linear-gradient(145deg, #fffdf8, #f7f2e9);
}

.mode-intro__eyebrow {
  color: #8b6a24;
  font-size: 0.74rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.mode-intro strong {
  color: #141414;
  font-size: 1rem;
}

.mode-intro p {
  color: #5f5f5f;
  font-size: 0.92rem;
  line-height: 1.45;
}

.roundtrip-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
}

.trip-panel {
  display: grid;
  gap: 0.85rem;
  padding: 0.95rem;
  border: 1px solid #e5e1d8;
  border-radius: 18px;
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
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.trip-panel__header strong {
  color: #111111;
  font-size: 1.05rem;
}

.trip-panel__header small {
  color: #6a604f;
  font-size: 0.88rem;
  font-weight: 700;
}

.trip-panel__body {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem 0.65rem;
}

.trip-panel__note {
  display: grid;
  grid-column: 1 / -1;
  padding: 0.8rem;
  border-radius: 14px;
  background: #f5f1e8;
}

.trip-panel__note span {
  color: #4e4333;
  font-size: 0.84rem;
  line-height: 1.4;
}

.time-toggle {
  min-height: 2.75rem;
  border: 1px dashed #d6cdbd;
  background: #fcfaf6;
  color: #3b3428;
}

.secondary-action {
  background: #ece8df;
  color: #111111;
}

.multi-leg-builder {
  position: relative;
  display: grid;
  gap: 0.85rem;
  padding-left: 0.35rem;
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
  position: relative;
  display: grid;
  gap: 0.65rem;
  padding-left: 1.35rem;
}

.timeline-leg::before {
  position: absolute;
  top: 2.4rem;
  bottom: -1rem;
  left: 0.4rem;
  width: 1px;
  background: #d8d2c4;
  content: '';
}

.timeline-leg:last-child::before {
  display: none;
}

.leg-summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.8rem;
  align-items: center;
  min-height: 4.8rem;
  padding: 0.85rem;
  border: 1px solid transparent;
  border-radius: 8px;
  background: #fbfaf7;
  color: #111111;
  text-align: left;
}

.timeline-leg.active .leg-summary {
  border-color: #d7c89f;
  background: #ffffff;
}

.timeline-dot {
  width: 0.85rem;
  height: 0.85rem;
  border-radius: 999px;
  background: #141414;
  box-shadow: 0 0 0 5px #f1ead9;
}

.leg-copy {
  display: grid;
  min-width: 0;
  gap: 0.15rem;
}

.leg-copy small {
  color: #8b6a24;
  font-size: 0.74rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.leg-copy strong {
  overflow: hidden;
  color: #141414;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.leg-copy em {
  overflow: hidden;
  color: #6f6a60;
  font-style: normal;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.edit-label {
  color: #141414;
  font-size: 0.84rem;
  font-weight: 900;
}

.leg-editor {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem 0.65rem;
  padding: 0.9rem;
  border: 1px solid #e5e1d8;
  border-radius: 8px;
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

.trust-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.85rem;
}

.trust-badges span {
  min-height: 1.95rem;
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0 0.75rem;
  background: #f3efe7;
  color: #3b3428;
  font-size: 0.8rem;
  font-weight: 600;
}

@media (max-width: 1080px) {
  .flight-search-hero,
  .preference-panel {
    grid-template-columns: 1fr;
  }

  .flight-form,
  .leg-editor,
  .roundtrip-grid,
  .trip-panel__body {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .flight-search-hero,
  .search-copy {
    overflow: visible;
  }

  .search-copy {
    padding: 1rem;
  }

  h1 {
    max-width: 10ch;
    font-size: clamp(1.7rem, 9vw, 2.45rem);
  }

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
    min-height: 2.8rem;
  }

  .segmented-control {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .segmented-control button,
  .primary-action,
  .secondary-action,
  .time-toggle {
    min-height: 2.55rem;
    font-size: 0.92rem;
  }

  .trust-badges {
    gap: 0.35rem;
  }

  .trust-badges span {
    min-height: 1.75rem;
    font-size: 0.72rem;
    padding: 0 0.6rem;
  }
  .multi-leg-builder {
    padding-left: 0;
  }

  .timeline-leg {
    padding-left: 1rem;
  }

  .leg-summary {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .edit-label {
    grid-column: 2;
  }

  .leg-editor {
    grid-template-columns: 1fr;
    padding: 0.8rem;
  }

  .roundtrip-grid,
  .trip-panel__body {
    grid-template-columns: 1fr;
  }

  .mode-intro,
  .trip-panel,
  .builder-headline {
    border-radius: 14px;
  }

}
</style>
