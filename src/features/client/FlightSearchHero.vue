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

defineProps({
  form: { type: Object, required: true },
  summary: { type: Object, required: true },
  tripType: { type: String, required: true },
  trustSignals: { type: Array, required: true },
})

const emit = defineEmits([
  'add-leg',
  'remove-leg',
  'submit',
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
  activeAirportKey.value = ''
}

function chooseLegAirport(index, field, airport) {
  emit('update-leg-field', { index, field, value: airportCode(airport) })
  activeAirportKey.value = ''
}

function revealDepartureTime() {
  showDepartureTime.value = true
}

function revealReturnTime() {
  showReturnTime.value = true
}
</script>

<template>
  <section class="flight-search-hero">
    <div class="search-copy">
      <span class="eyebrow">Planificador de aviacion privada</span>
      <h1>Tu tiempo merece otra altitud.</h1>
      <p>Cotiza, compara y reserva aviacion privada en minutos.</p>

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

        <template v-if="tripType === 'Ida'">
          <label class="airport-field">
            De
            <input
              :value="form.origin"
              autocomplete="off"
              @focus="activeAirportKey = airportKey('form', 'origin')"
              @input="updateFormAirport('origin', $event)"
            />
            <div v-if="activeAirportKey === airportKey('form', 'origin')" class="airport-options">
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
            A
            <input
              :value="form.destination"
              autocomplete="off"
              @focus="activeAirportKey = airportKey('form', 'destination')"
              @input="updateFormAirport('destination', $event)"
            />
            <div v-if="activeAirportKey === airportKey('form', 'destination')" class="airport-options">
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
          <label v-else class="time-field">Hora<input :value="form.departureTime" type="time" @input="updateFormField('departureTime', $event)" /></label>
          <label>Pasajeros<input :value="form.passengers" min="1" type="number" @input="updateFormField('passengers', $event)" /></label>
          <button class="primary-action" type="submit">Cotizar vuelo</button>
        </template>

        <template v-else-if="tripType === 'Redondo'">
          <label class="airport-field">
            De
            <input
              :value="form.origin"
              autocomplete="off"
              @focus="activeAirportKey = airportKey('form', 'origin')"
              @input="updateFormAirport('origin', $event)"
            />
            <div v-if="activeAirportKey === airportKey('form', 'origin')" class="airport-options">
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
            A
            <input
              :value="form.destination"
              autocomplete="off"
              @focus="activeAirportKey = airportKey('form', 'destination')"
              @input="updateFormAirport('destination', $event)"
            />
            <div v-if="activeAirportKey === airportKey('form', 'destination')" class="airport-options">
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
          <label v-else class="time-field">Hora salida<input :value="form.departureTime" type="time" @input="updateFormField('departureTime', $event)" /></label>
          <label class="date-field">Fecha regreso<input :value="form.returnDate" type="date" @input="updateFormField('returnDate', $event)" /></label>
          <button
            v-if="!showReturnTime && !form.returnTime"
            class="time-toggle"
            type="button"
            @click="revealReturnTime"
          >
            Agregar hora regreso
          </button>
          <label v-else class="time-field">Hora regreso<input :value="form.returnTime" type="time" @input="updateFormField('returnTime', $event)" /></label>
          <label>Pasajeros<input :value="form.passengers" min="1" type="number" @input="updateFormField('passengers', $event)" /></label>
          <button class="primary-action" type="submit">Cotizar redondo</button>
        </template>

        <template v-else>
          <div class="builder-headline">
            <span>Agrega ruta</span>
            <strong>{{ summary.legs.length }} destinos · {{ summary.days }} dias · {{ summary.passengers }} pasajeros</strong>
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
                    @focus="activeAirportKey = airportKey('leg', 'origin', index)"
                    @input="updateLegAirport(index, 'origin', $event)"
                  />
                  <div v-if="activeAirportKey === airportKey('leg', 'origin', index)" class="airport-options">
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
                  <div v-if="activeAirportKey === airportKey('leg', 'destination', index)" class="airport-options">
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
                <label class="time-field">Hora<input :value="leg.time" type="time" @input="updateLegField(index, 'time', $event)" /></label>
                <button v-if="form.legs.length > 2" type="button" @click="$emit('remove-leg', index)">Quitar destino</button>
              </div>
            </article>
          </section>

          <button class="secondary-action" type="button" @click="addLegAndOpen($emit, form.legs.length)">
            + Agregar destino
          </button>

          <section class="preference-panel">
            <label>Pasajeros<input :value="form.passengers" min="1" type="number" @input="updateFormField('passengers', $event)" /></label>
            <label>
              Preferencia
              <select :value="form.preference" @change="updateFormField('preference', $event)">
                <option>Mejor precio</option>
                <option>Menor tiempo</option>
                <option>Mayor confort</option>
              </select>
            </label>
          </section>
          <button class="primary-action" type="submit">Cotizar itinerario</button>
        </template>
      </form>

      <div v-if="trustSignals.length" class="trust-badges" aria-label="Confianza">
        <span v-for="signal in trustSignals" :key="signal">{{ signal }}</span>
      </div>
    </div>

    <aside class="booking-map">
      <div class="summary-visual" aria-hidden="true"></div>
      <div class="map-card">
        <span>{{ summary.membership ? `Itinerario ${summary.membership}` : 'Itinerario' }}</span>
        <strong>{{ summary.legs.length }} {{ summary.legs.length === 1 ? 'tramo' : 'tramos' }}</strong>
        <div class="summary-lines">
          <small v-if="tripType === 'Ida'">Ruta: {{ summary.legs[0]?.origin }} -> {{ summary.legs[0]?.destination }}</small>
          <template v-else-if="tripType === 'Redondo'">
            <small>Salida: {{ summary.legs[0]?.origin }} -> {{ summary.legs[0]?.destination }}</small>
            <small>Regreso: {{ summary.legs[1]?.origin }} -> {{ summary.legs[1]?.destination }}</small>
            <small>Dias en destino: {{ summary.days }}</small>
          </template>
          <template v-else>
            <small>{{ summary.days }} dias de itinerario</small>
            <small>{{ summary.passengers }} pasajeros</small>
            <small>Preferencia: {{ summary.preference }}</small>
          </template>
          <small v-if="summary.cabin">Cabina sugerida: {{ summary.cabin }}</small>
          <small v-if="summary.estimatedTime">Tiempo estimado: {{ summary.estimatedTime }}</small>
          <small v-if="summary.estimatedTotal">Precio estimado: {{ summary.estimatedTotal }}</small>
          <small v-if="summary.legs.length >= 4">Este viaje puede optimizarse con Concierge.</small>
          <small v-if="summary.maxLegs && summary.legs.length > summary.maxLegs">Tu acceso requiere mas tramos disponibles.</small>
        </div>
      </div>
    </aside>
  </section>
</template>

<style scoped>
.flight-search-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.06fr) minmax(300px, 0.72fr);
  gap: 1rem;
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
.preference-panel {
  grid-column: 1 / -1;
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
  border-radius: 8px;
  background: #141414;
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

.booking-map {
  display: grid;
  grid-template-rows: minmax(150px, 0.4fr) minmax(0, 0.6fr);
  gap: 0;
  min-height: 420px;
  overflow: hidden;
  border: 1px solid #e5e1d8;
  border-radius: 8px;
  background: #ffffff;
}

.summary-visual {
  min-height: 160px;
  background:
    linear-gradient(180deg, rgba(9, 10, 12, 0.02), rgba(9, 10, 12, 0.36)),
    url('https://images.unsplash.com/photo-1540962351504-03099e0a754b?auto=format&fit=crop&w=1200&q=80') center/cover;
}

.map-card {
  display: grid;
  gap: 0.55rem;
  align-content: start;
  padding: 1rem;
  border-radius: 0;
  background: #ffffff;
}

.map-card span,
.map-card small {
  color: #6a604f;
  font-size: 0.82rem;
  font-weight: 800;
}

.map-card strong {
  color: #141414;
  font-size: clamp(1.45rem, 3vw, 2.1rem);
}

.summary-lines {
  display: grid;
  gap: 0.35rem;
}

@media (max-width: 1080px) {
  .flight-search-hero,
  .preference-panel {
    grid-template-columns: 1fr;
  }

  .flight-form,
  .leg-editor {
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

  .flight-form input,
  .flight-form select {
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

  .booking-map {
    min-height: 0;
    display: none;
  }

  .summary-visual {
    min-height: 120px;
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

}
</style>
