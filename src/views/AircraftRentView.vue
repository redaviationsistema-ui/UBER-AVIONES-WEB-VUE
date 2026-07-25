<script setup>
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import SiteFooter from '../components/SiteFooter.vue'
import { useAuthStore } from '../stores/auth'
import { useRentalFlowStore } from '../stores/rentalFlow'
import { continueRentalFlow, normalizeRentalSearch, RENTAL_AIRCRAFT_TYPES } from '../services/clientRentalService'
import { addOperationalDays, compareOperationalDates, getOperationalDate } from '../utils/operationalDate'

const router = useRouter()
const auth = useAuthStore()
const rentalFlow = useRentalFlowStore()
const hasDifferentDropoff = ref(false)
const submitting = ref(false)
const submitError = ref('')
const fieldErrors = reactive({})
const today = getOperationalDate()

const form = reactive({
  tripType: 'round_trip',
  origin: '',
  destination: '',
  returnOrigin: '',
  returnDestination: '',
  departureDate: addOperationalDays(new Date(), 1),
  returnDate: addOperationalDays(new Date(), 3),
  aircraftType: 'Jet ejecutivo',
  passengers: 1,
})

const rentalFleet = [
  {
    code: 'RA-RJ10',
    category: 'Jet ejecutivo',
    availability: 'Disponible hoy',
    status: 'Ideal corporativo',
    capacity: 'Hasta 7 pasajeros',
    range: 'CDMX · MTY · CUN',
  },
  {
    code: 'RA-HT22',
    category: 'Helicóptero',
    availability: 'Salida en horas',
    status: 'Traslado rápido',
    capacity: 'Hasta 5 pasajeros',
    range: 'Ciudad · helipuertos',
  },
  {
    code: 'RA-LR90',
    category: 'Long Range',
    availability: 'Reserva premium',
    status: 'Internacional',
    capacity: 'Hasta 13 pasajeros',
    range: 'México · USA · LATAM',
  },
]

const operationalAdvantages = [
  'Cotización ágil con disponibilidad priorizada',
  'Tripulación y concierge coordinados en un solo flujo',
  'Cobertura nacional e internacional según categoría',
]

const bookingSteps = [
  {
    title: 'Selecciona ruta y fechas',
    description:
      'Definimos la disponibilidad ideal según base operativa, tipo de aeronave y ventana de salida.',
  },
  {
    title: 'Recibe opciones filtradas',
    description:
      'Mostramos alternativas enfocadas en tiempo de respuesta, confort y rendimiento comercial.',
  },
  {
    title: 'Confirma tu operación',
    description:
      'El equipo termina la coordinación con operador, tripulación y detalles de embarque.',
  },
]

const rentalSummary = computed(() => {
  return `${form.origin || 'Origen'} → ${form.destination || 'Destino'} · ${form.departureDate}${form.tripType === 'round_trip' ? ` al ${form.returnDate}` : ''} · ${form.aircraftType}`
})

function validateRental() {
  Object.keys(fieldErrors).forEach((key) => delete fieldErrors[key])
  const search = normalizeRentalSearch({ ...form, differentReturnDestination: hasDifferentDropoff.value })
  if (!search.origin) fieldErrors.origin = 'La base de salida es obligatoria.'
  if (!search.destination) fieldErrors.destination = 'El destino es obligatorio.'
  if (search.origin && search.destination && search.origin.toLowerCase() === search.destination.toLowerCase()) fieldErrors.destination = 'El origen y el destino deben ser diferentes.'
  if (!search.departureDate) fieldErrors.departureDate = 'Selecciona la fecha de salida.'
  else if (compareOperationalDates(search.departureDate, today) < 0) fieldErrors.departureDate = 'La fecha de salida no puede estar en el pasado.'
  if (search.tripType === 'round_trip' && !search.returnDate) fieldErrors.returnDate = 'Selecciona la fecha de regreso.'
  else if (search.returnDate && compareOperationalDates(search.returnDate, search.departureDate) < 0) fieldErrors.returnDate = 'El regreso no puede ser anterior a la salida.'
  if (hasDifferentDropoff.value && !search.returnOrigin) fieldErrors.returnOrigin = 'Indica el origen del regreso.'
  if (hasDifferentDropoff.value && !search.returnDestination) fieldErrors.returnDestination = 'Indica el destino del regreso.'
  if (hasDifferentDropoff.value && search.returnOrigin && search.returnDestination && search.returnOrigin.toLowerCase() === search.returnDestination.toLowerCase()) fieldErrors.returnDestination = 'El origen y destino del regreso deben ser diferentes.'
  if (!search.aircraftType || !RENTAL_AIRCRAFT_TYPES.includes(search.aircraftType)) fieldErrors.aircraftType = 'Selecciona una categoría válida.'
  return Object.keys(fieldErrors).length ? null : search
}

function navigateRentalResult(result) {
  if (result.reservationId) return router.push({ name: 'cliente-detalle', params: { section: 'reserva-confirmada', id: result.reservationId } })
  return router.push({ name: 'cliente-detalle', params: { section: 'resultados', id: result.flightRequestId } })
}

async function searchRental() {
  if (submitting.value) return
  submitError.value = ''
  const search = validateRental()
  if (!search) return
  rentalFlow.savePendingSearch(search)
  if (!auth.isAuthenticated) {
    await router.push({ name: 'login-cliente', query: { redirect: '/cliente/reservar', rental: 'continue' } })
    return
  }
  submitting.value = true
  try {
    const result = await continueRentalFlow(search)
    rentalFlow.setFlightRequestId(result.flightRequestId)
    rentalFlow.setReservationId(result.reservationId)
    rentalFlow.clearPendingSearch()
    await navigateRentalResult(result)
  } catch (error) { submitError.value = error?.message || 'No fue posible iniciar la renta.' }
  finally { submitting.value = false }
}
</script>

<template>
  <div class="aviation-page">
    <nav class="flight-tabs">
      <RouterLink to="/renta-aeronaves" class="flight-tab">Renta de aeronaves</RouterLink>
      <RouterLink to="/membresias" class="flight-tab">Membresías</RouterLink>
    </nav>

    <section class="hero-shell">
      <aside class="booking-card">
        <span class="section-kicker">Operación privada</span>
        <h1>Renta aeronaves con una experiencia más clara y premium.</h1>
        <p class="booking-copy">
          Encuentra disponibilidad con foco en velocidad de respuesta, cobertura y categoría de
          cabina.
        </p>

        <button class="pill-btn" type="button" @click="hasDifferentDropoff = !hasDifferentDropoff">
          {{ hasDifferentDropoff ? 'Misma base de regreso' : 'Punto de devolución diferente' }}
        </button>

        <label class="field-label">Tipo de viaje</label>
        <select v-model="form.tripType" class="select-box">
          <option value="round_trip">Viaje redondo</option>
          <option value="one_way">Solo ida</option>
        </select>

        <label class="field-label">Tipo de aeronave</label>
        <select v-model="form.aircraftType" class="select-box">
          <option v-for="type in RENTAL_AIRCRAFT_TYPES" :key="type">{{ type }}</option>
        </select>
        <small v-if="fieldErrors.aircraftType" class="field-error">{{ fieldErrors.aircraftType }}</small>

        <label class="field-label">Base de salida</label>
        <div class="input-box">
          <span>●</span>
          <input v-model="form.origin" placeholder="" />
        </div>
        <small v-if="fieldErrors.origin" class="field-error">{{ fieldErrors.origin }}</small>

        <label class="field-label">Destino</label>
        <div class="input-box"><span>◎</span><input v-model="form.destination" placeholder="Ej. Cancún / CUN" /></div>
        <small v-if="fieldErrors.destination" class="field-error">{{ fieldErrors.destination }}</small>

        <template v-if="hasDifferentDropoff && form.tripType === 'round_trip'">
          <label class="field-label">Origen del regreso</label>
          <div class="input-box"><span>●</span><input v-model="form.returnOrigin" placeholder="Origen del regreso" /></div>
          <small v-if="fieldErrors.returnOrigin" class="field-error">{{ fieldErrors.returnOrigin }}</small>
          <label class="field-label">Destino del regreso</label>
          <div class="input-box"><span>◎</span><input v-model="form.returnDestination" placeholder="Destino del regreso" /></div>
          <small v-if="fieldErrors.returnDestination" class="field-error">{{ fieldErrors.returnDestination }}</small>
        </template>

        <div class="date-grid">
          <div>
            <label class="field-label">Salida</label>
            <div class="input-box">
              <span>↗</span>
              <input v-model="form.departureDate" type="date" :min="today" />
            </div>
            <small v-if="fieldErrors.departureDate" class="field-error">{{ fieldErrors.departureDate }}</small>
          </div>

          <div v-if="form.tripType === 'round_trip'">
            <label class="field-label">Regreso</label>
            <div class="input-box">
              <span>↩</span>
              <input v-model="form.returnDate" type="date" :min="form.departureDate || today" />
            </div>
            <small v-if="fieldErrors.returnDate" class="field-error">{{ fieldErrors.returnDate }}</small>
          </div>
        </div>

        <button class="primary-btn" type="button" :disabled="submitting" @click="searchRental">
          {{ submitting ? 'Consultando disponibilidad…' : 'Buscar disponibilidad' }}
        </button>
        <p v-if="submitError" class="field-error" role="alert">{{ submitError }}</p>

        <p class="summary">{{ rentalSummary }}</p>
      </aside>

      <main class="hero-stage">
        <div class="hero-panel">
          <div class="hero-backdrop"></div>
          <div class="orb orb-one"></div>
          <div class="orb orb-two"></div>

          <div class="hero-topline">
            <span class="availability-pill">Disponibilidad priorizada</span>
            <span class="coverage-pill">México · USA · LATAM</span>
          </div>

          <div class="hero-copy">
            <p class="eyebrow">Renta aérea ejecutiva</p>
            <h2>Disponibilidad diseñada para cerrar más rápido.</h2>
            <p>
              Una interfaz más limpia para mostrar categoría, cobertura y ritmo operativo sin
              fricción visual.
            </p>
          </div>

          <div class="hero-metrics">
            <article>
              <strong>24/7</strong>
              <span>Atención concierge</span>
            </article>
            <article>
              <strong>3</strong>
              <span>Perfiles de operación</span>
            </article>
            <article>
              <strong>Fast quote</strong>
              <span>Respuesta priorizada</span>
            </article>
          </div>

          <div class="map-card">
            <div class="grid-bg"></div>
            <div class="route route-one"></div>
            <div class="route route-two"></div>
            <div class="route route-three"></div>

            <div class="airport airport-a">TLC</div>
            <div class="airport airport-b">CUN</div>
            <div class="airport airport-c">MTY</div>
            <div class="airport airport-d">MIA</div>

            <div class="map-label">
              <strong>Mapa de cobertura</strong>
              <span>Rutas estratégicas con visual premium</span>
            </div>
          </div>
        </div>
      </main>
    </section>

    <section class="insights-section">
      <article class="insight-card">
        <span class="section-kicker">Ventaja operativa</span>
        <h3>Lo importante aparece primero.</h3>
        <ul class="advantage-list">
          <li v-for="advantage in operationalAdvantages" :key="advantage">{{ advantage }}</li>
        </ul>
      </article>

      <article class="insight-card dark">
        <span class="section-kicker inverted">Flujo recomendado</span>
        <h3>Un proceso breve para una renta más confiable.</h3>
        <div class="steps-list">
          <div v-for="(step, index) in bookingSteps" :key="step.title" class="step-item">
            <span>{{ String(index + 1).padStart(2, '0') }}</span>
            <div>
              <strong>{{ step.title }}</strong>
              <p>{{ step.description }}</p>
            </div>
          </div>
        </div>
      </article>
    </section>

    <section class="fleet-section">
      <div class="section-heading">
        <div>
          <span class="section-kicker">Flota destacada</span>
          <h2>Aeronaves presentadas con mejor jerarquía y lectura rápida.</h2>
        </div>
        <p>
          Cada tarjeta resume categoría, disponibilidad y alcance para que la decisión se sienta más
          ejecutiva.
        </p>
      </div>

      <div class="aircraft-list">
        <article v-for="aircraft in rentalFleet" :key="aircraft.code" class="aircraft-card">
          <div class="aircraft-code-row">
            <strong>{{ aircraft.code }}</strong>
            <span class="status-chip">{{ aircraft.status }}</span>
          </div>

          <h3>{{ aircraft.category }}</h3>
          <p class="aircraft-meta">{{ aircraft.availability }}</p>

          <div class="aircraft-stats">
            <div>
              <span>Capacidad</span>
              <strong>{{ aircraft.capacity }}</strong>
            </div>
            <div>
              <span>Cobertura</span>
              <strong>{{ aircraft.range }}</strong>
            </div>
          </div>
        </article>
      </div>
    </section>

    <SiteFooter />
  </div>
</template>

<style scoped>
.field-error {
  display: block;
  margin-top: 0.4rem;
  color: #b42318;
  font-size: 0.78rem;
  font-weight: 650;
}

.primary-btn:disabled {
  cursor: wait;
  opacity: 0.65;
}

.aviation-page {
  min-height: 100vh;
  background:
    radial-gradient(circle at top, rgba(176, 197, 255, 0.35), transparent 36%),
    linear-gradient(180deg, #f5f8ff 0%, #ffffff 32%, #f3f5f8 100%);
  color: #0e1726;
}

.flight-tabs {
  display: flex;
  align-items: center;
  gap: 2rem;
  padding: 0 4.5rem;
  min-height: 72px;
  border-bottom: 1px solid rgba(14, 23, 38, 0.08);
  backdrop-filter: blur(12px);
}

.flight-tab {
  display: inline-flex;
  align-items: center;
  min-height: 72px;
  color: #283446;
  font-size: 0.96rem;
  font-weight: 800;
  text-decoration: none;
  border-bottom: 3px solid transparent;
  transition:
    color 0.2s ease,
    border-color 0.2s ease;
}

.flight-tab.router-link-active {
  color: #08111f;
  border-bottom-color: #08111f;
}

.hero-shell {
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  gap: 1.8rem;
  padding: 2rem 4.5rem 1.5rem;
}

.booking-card,
.insight-card,
.aircraft-card {
  border: 1px solid rgba(18, 28, 45, 0.08);
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.08);
}

.booking-card {
  align-self: start;
  padding: 1.5rem;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(20px);
}

.section-kicker,
.availability-pill,
.coverage-pill,
.status-chip,
.inverted {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  font-weight: 900;
  letter-spacing: 0.02em;
}

.section-kicker {
  margin-bottom: 1rem;
  padding: 0.48rem 0.8rem;
  background: #e8eefc;
  color: #18407f;
  font-size: 0.78rem;
}

.inverted {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.84);
}

.booking-card h1 {
  margin: 0;
  font-size: clamp(2rem, 3vw, 2.7rem);
  line-height: 0.98;
  letter-spacing: -0.04em;
}

.booking-copy,
.summary,
.hero-copy p,
.section-heading p,
.aircraft-meta,
.step-item p {
  color: #5b677b;
}

.booking-copy {
  margin: 1rem 0 1.4rem;
  line-height: 1.65;
}

.pill-btn {
  margin-bottom: 1rem;
  padding: 0.8rem 1rem;
  border: 0;
  border-radius: 999px;
  background: #edf2fb;
  color: #10284d;
  font-weight: 800;
  text-align: left;
}

.field-label {
  display: block;
  margin: 0 0 0.5rem;
  color: #334155;
  font-size: 0.82rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.date-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.8rem;
}

.input-box,
.select-box {
  width: 100%;
  min-height: 56px;
  margin-bottom: 0.95rem;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 16px;
  background: #f7f9fc;
}

.input-box {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0 1rem;
}

.input-box span {
  color: #26436f;
  font-size: 0.9rem;
  font-weight: 900;
}

.input-box input,
.select-box {
  color: #08111f;
  font-size: 0.96rem;
  font-weight: 700;
}

.input-box input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
}

.select-box {
  padding: 0 1rem;
  outline: 0;
}

.primary-btn {
  width: 100%;
  min-height: 56px;
  margin-top: 0.3rem;
  border: 0;
  border-radius: 16px;
  background: linear-gradient(135deg, #09111f 0%, #143a74 100%);
  color: #fff;
  font-weight: 900;
  cursor: pointer;
  box-shadow: 0 20px 36px rgba(20, 58, 116, 0.28);
}

.summary {
  margin: 1rem 0 0;
  line-height: 1.5;
}

.hero-stage {
  min-width: 0;
}

.hero-panel {
  position: relative;
  overflow: hidden;
  min-height: 100%;
  padding: 1.8rem;
  border-radius: 36px;
  background: linear-gradient(145deg, #07111f 0%, #14325f 50%, #4f79b8 100%);
  color: white;
}

.hero-backdrop {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(160deg, rgba(255, 255, 255, 0.08), transparent 45%),
    radial-gradient(circle at 75% 18%, rgba(255, 255, 255, 0.18), transparent 22%);
}

.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(10px);
}

.orb-one {
  top: 9%;
  right: 10%;
  width: 180px;
  height: 180px;
  background: rgba(136, 173, 255, 0.18);
}

.orb-two {
  bottom: 18%;
  left: 12%;
  width: 120px;
  height: 120px;
  background: rgba(255, 255, 255, 0.09);
}

.hero-topline,
.hero-copy,
.hero-metrics,
.map-card {
  position: relative;
  z-index: 1;
}

.hero-topline {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
  justify-content: space-between;
}

.availability-pill,
.coverage-pill {
  padding: 0.5rem 0.85rem;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.88);
  font-size: 0.78rem;
}

.hero-copy {
  max-width: 680px;
  margin-top: 2.6rem;
}

.eyebrow {
  margin: 0 0 0.8rem;
  color: rgba(255, 255, 255, 0.72);
  font-size: 0.82rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.hero-copy h2 {
  margin: 0;
  font-size: clamp(2.6rem, 5vw, 4.7rem);
  line-height: 0.96;
  letter-spacing: -0.05em;
}

.hero-copy p:last-child {
  max-width: 560px;
  margin: 1rem 0 0;
  color: rgba(255, 255, 255, 0.74);
  line-height: 1.7;
}

.hero-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
  margin-top: 2rem;
}

.hero-metrics article {
  padding: 1rem 1.1rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.08);
}

.hero-metrics strong {
  display: block;
  font-size: 1.2rem;
}

.hero-metrics span {
  color: rgba(255, 255, 255, 0.72);
  font-size: 0.9rem;
}

.map-card {
  position: relative;
  height: 420px;
  margin-top: 1.5rem;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 28px;
  background: linear-gradient(180deg, rgba(240, 245, 255, 0.12), rgba(208, 224, 255, 0.08));
}

.grid-bg {
  position: absolute;
  inset: 0;
  opacity: 0.8;
  background-image:
    linear-gradient(rgba(191, 213, 255, 0.16) 1px, transparent 1px),
    linear-gradient(90deg, rgba(191, 213, 255, 0.16) 1px, transparent 1px);
  background-size: 38px 38px;
}

.route {
  position: absolute;
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.88), rgba(125, 181, 255, 0.6));
  box-shadow: 0 0 24px rgba(140, 190, 255, 0.35);
}

.route-one {
  top: 30%;
  left: 16%;
  width: 48%;
  transform: rotate(18deg);
}

.route-two {
  top: 56%;
  left: 41%;
  width: 34%;
  transform: rotate(-24deg);
}

.route-three {
  top: 44%;
  left: 26%;
  width: 38%;
  transform: rotate(-48deg);
}

.airport {
  position: absolute;
  width: 58px;
  height: 58px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #f8fbff;
  color: #0f2242;
  font-weight: 900;
  box-shadow: 0 18px 50px rgba(7, 17, 31, 0.22);
}

.airport-a {
  top: 23%;
  left: 18%;
}

.airport-b {
  top: 60%;
  right: 16%;
}

.airport-c {
  top: 31%;
  left: 48%;
}

.airport-d {
  bottom: 14%;
  left: 28%;
}

.map-label {
  position: absolute;
  left: 1rem;
  bottom: 1rem;
  display: grid;
  gap: 0.2rem;
  padding: 0.95rem 1rem;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.9);
  color: #08111f;
}

.map-label span {
  color: #516073;
  font-size: 0.9rem;
}

.insights-section,
.fleet-section {
  padding: 1.5rem 4.5rem 0;
}

.insights-section {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.4rem;
}

.insight-card {
  padding: 1.6rem;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.9);
}

.insight-card.dark {
  background: linear-gradient(160deg, #0a1220 0%, #172f56 100%);
  color: white;
}

.insight-card h3,
.section-heading h2,
.aircraft-card h3 {
  margin: 0;
  letter-spacing: -0.03em;
}

.insight-card h3 {
  font-size: 1.8rem;
  line-height: 1.05;
}

.advantage-list {
  margin: 1.2rem 0 0;
  padding: 0;
  list-style: none;
}

.advantage-list li {
  position: relative;
  padding: 0.95rem 0 0.95rem 1.8rem;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  color: #344256;
  line-height: 1.55;
}

.advantage-list li::before {
  content: '•';
  position: absolute;
  left: 0.35rem;
  color: #143a74;
  font-size: 1.2rem;
}

.steps-list {
  display: grid;
  gap: 1rem;
  margin-top: 1.2rem;
}

.step-item {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}

.step-item span {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-weight: 900;
}

.step-item strong {
  display: block;
  margin-bottom: 0.35rem;
}

.step-item p {
  margin: 0;
  color: rgba(255, 255, 255, 0.72);
  line-height: 1.6;
}

.section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 2rem;
  margin-bottom: 1.4rem;
}

.section-heading h2 {
  max-width: 720px;
  font-size: clamp(2rem, 4vw, 3.2rem);
  line-height: 0.98;
}

.section-heading p {
  max-width: 420px;
  margin: 0;
  line-height: 1.7;
}

.aircraft-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.2rem;
}

.aircraft-card {
  padding: 1.4rem;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.92);
}

.aircraft-code-row,
.aircraft-stats {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.aircraft-code-row strong {
  font-size: 1rem;
  letter-spacing: 0.08em;
}

.status-chip {
  padding: 0.5rem 0.75rem;
  background: #eef4ff;
  color: #1d4f98;
  font-size: 0.75rem;
}

.aircraft-card h3 {
  margin-top: 1rem;
  font-size: 1.55rem;
}

.aircraft-meta {
  margin: 0.45rem 0 1.1rem;
}

.aircraft-stats {
  align-items: stretch;
}

.aircraft-stats div {
  flex: 1;
  padding: 0.95rem 1rem;
  border-radius: 18px;
  background: #f4f7fb;
}

.aircraft-stats span {
  display: block;
  margin-bottom: 0.35rem;
  color: #6b7789;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}

.aircraft-stats strong {
  color: #0f172a;
  font-size: 0.96rem;
  line-height: 1.4;
}

@media (max-width: 1180px) {
  .hero-shell,
  .insights-section,
  .fleet-section,
  .flight-tabs {
    padding-left: 1.25rem;
    padding-right: 1.25rem;
  }

  .hero-shell {
    grid-template-columns: 1fr;
  }

  .booking-card {
    max-width: 720px;
  }

  .section-heading,
  .aircraft-stats {
    flex-direction: column;
    align-items: stretch;
  }

  .aircraft-list {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 820px) {
  .flight-tabs {
    gap: 1.2rem;
    overflow-x: auto;
  }

  .hero-panel,
  .booking-card,
  .insight-card,
  .aircraft-card {
    border-radius: 24px;
  }

  .hero-copy h2 {
    font-size: clamp(2.1rem, 11vw, 3.4rem);
  }

  .hero-metrics,
  .insights-section,
  .date-grid {
    grid-template-columns: 1fr;
  }

  .map-card {
    height: 340px;
  }

  .airport {
    width: 50px;
    height: 50px;
    font-size: 0.82rem;
  }
}
</style>
