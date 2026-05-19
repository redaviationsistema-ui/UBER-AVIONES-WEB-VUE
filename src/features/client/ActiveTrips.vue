<script setup>
import { computed, ref, watch } from 'vue'
import { featuredAirports } from '../../utils/airports'
import { resolveWorkflowState } from '../../utils/flightWorkflow'

const props = defineProps({
  reservations: { type: Array, required: true },
  selectedId: { type: String, default: '' },
  timeline: { type: Array, required: true },
})

defineEmits(['open-contract', 'open-detail', 'open-payment', 'open-concierge'])

const activeTab = ref('proximos')

const PROGRESS_STEPS = [
  { key: 'booking', label: 'Reserva' },
  { key: 'provider', label: 'Respuesta proveedor' },
  { key: 'contract', label: 'Contrato' },
  { key: 'payment', label: 'Pago' },
  { key: 'flight', label: 'Vuelo' },
  { key: 'tracking', label: 'Tracking' },
]

function statusMeta(status = '') {
  const state = resolveWorkflowState(status)

  const metaByState = {
    draft: { icon: '●', tone: 'neutral', step: 'booking', progress: 8 },
    quoted: { icon: '🧾', tone: 'info', step: 'booking', progress: 14 },
    package_selected: { icon: '🎯', tone: 'info', step: 'booking', progress: 22 },
    reserved: { icon: '📨', tone: 'info', step: 'booking', progress: 34 },
    provider_pending: { icon: '🔍', tone: 'searching', step: 'provider', progress: 48 },
    provider_accepted: { icon: '✅', tone: 'confirmed', step: 'provider', progress: 58 },
    contract_pending: { icon: '📄', tone: 'pending', step: 'contract', progress: 68 },
    contract_signed: { icon: '✍', tone: 'confirmed', step: 'contract', progress: 76 },
    payment_pending: { icon: '💳', tone: 'pending', step: 'payment', progress: 84 },
    payment_confirmed: { icon: '💳', tone: 'paid', step: 'payment', progress: 90 },
    flight_confirmed: { icon: '🛫', tone: 'confirmed', step: 'flight', progress: 95 },
    tracking_live: { icon: '📡', tone: 'confirmed', step: 'tracking', progress: 98 },
    completed: { icon: '✈', tone: 'completed', step: 'tracking', progress: 100 },
    cancelled: { icon: '✕', tone: 'cancelled', step: 'booking', progress: 0 },
    rejected: { icon: '✕', tone: 'cancelled', step: 'booking', progress: 0 },
  }

  return {
    label: state.label,
    ...(metaByState[state.id] || { icon: '●', tone: 'neutral', step: 'booking', progress: 10 }),
  }
}

function workflowId(status = '') {
  return resolveWorkflowState(status).id
}

function progressSteps(status = '') {
  const stateId = workflowId(status)
  const currentStep = statusMeta(status).step
  const currentIndex = PROGRESS_STEPS.findIndex((step) => step.key === currentStep)

  return PROGRESS_STEPS.map((step, index) => ({
    ...step,
    state:
      stateId === 'reserved' && step.key === 'booking'
        ? 'done'
        : stateId === 'reserved' && step.key === 'provider'
          ? 'active'
          : stateId === 'provider_accepted' && step.key === 'provider'
            ? 'done'
            : stateId === 'provider_accepted' && step.key === 'contract'
              ? 'active'
              : index < currentIndex
                ? 'done'
                : index === currentIndex
                  ? 'active'
                  : 'todo',
  }))
}

function formatTripDate(value = '') {
  if (!value) return ''

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
}

function shortTripDate(value = '') {
  if (!value) return ''

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
}

function reservationCode(reservation = {}) {
  const numericId = String(reservation.id || '').padStart(4, '0')
  return `Reserva SKY-${numericId}`
}

function airportMeta(code = '') {
  const normalizedCode = String(code || '')
    .trim()
    .toUpperCase()
  return (
    featuredAirports.find(
      (airport) =>
        String(airport.code || '')
          .trim()
          .toUpperCase() === normalizedCode ||
        String(airport.iata || '')
          .trim()
          .toUpperCase() === normalizedCode,
    ) || null
  )
}

function airportDisplay(code = '') {
  const airport = airportMeta(code)
  if (!airport) return code
  return `${airport.city} (${airport.code || airport.iata})`
}

function airportDisplayFromPayload(code = '', airportPayload = null) {
  if (airportPayload?.city && (airportPayload?.code || airportPayload?.iata)) {
    return `${airportPayload.city} (${airportPayload.code || airportPayload.iata})`
  }

  return airportDisplay(code)
}

function itinerarySegments(reservation = {}) {
  if (reservation.legs?.length) {
    return reservation.legs.map((leg) => ({
      key: leg.id || `leg-${leg.leg_order}`,
      order: leg.leg_order || '',
      origin: airportDisplay(leg.origin),
      destination: airportDisplay(leg.destination),
      departure: leg.departure_datetime || '',
    }))
  }

  if (reservation.requirements?.length) {
    return [
      {
        key: 'base-leg',
        order: 1,
        origin: airportDisplay(reservation.origin),
        destination: airportDisplay(reservation.destination),
        departure: reservation.date || '',
      },
      ...reservation.requirements.map((leg, index) => ({
        key: leg.id || `req-${index + 2}`,
        order: leg.leg_order || index + 2,
        origin: airportDisplayFromPayload(leg.origin, leg.originAirport),
        destination: airportDisplayFromPayload(leg.destination, leg.destinationAirport),
        departure: leg.departure_datetime || (leg.date ? `${leg.date}T${leg.time || '09:00'}` : ''),
      })),
    ]
  }

  return []
}

function routeDisplay(reservation = {}) {
  const segments = itinerarySegments(reservation)
  const firstLeg = segments[0]
  const lastLeg = segments[segments.length - 1]
  const origin = firstLeg?.origin || airportDisplay(reservation.origin || '')
  const destination = lastLeg?.destination || airportDisplay(reservation.destination || '')

  if (!origin && !destination)
    return reservation.route || reservation.title || `Vuelo privado #${reservation.id}`
  return `${origin} → ${destination}`
}

function routeSegmentsLabel(reservation = {}) {
  const segments = itinerarySegments(reservation)
  if (segments.length <= 1) return ''

  return segments.map((segment) => `${segment.origin} → ${segment.destination}`).join(' · ')
}

function overnightLabel(reservation = {}) {
  const nights = Number(reservation.overnight_nights || 0)
  if (!nights) return ''
  return `${nights} ${nights === 1 ? 'pernocta' : 'pernoctas'}`
}

function departureLine(reservation = {}) {
  return reservation.date ? formatTripDate(reservation.date) : 'Horario por confirmar'
}

function countdownLabel(value = '') {
  if (!value) return ''

  const target = new Date(value)
  if (Number.isNaN(target.getTime())) return ''

  const diffMs = target.getTime() - Date.now()
  if (diffMs <= 0) return 'En curso'

  const totalHours = Math.floor(diffMs / 3600000)
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24

  if (days > 0) return `Sale en ${days}d ${hours}h`
  return `Sale en ${hours}h`
}

function nextAction(status = '') {
  const meta = statusMeta(status)
  const stateId = workflowId(status)

  if (meta.step === 'booking') return 'Siguiente paso: cierre de reserva'
  if (stateId === 'provider_accepted') return 'Siguiente paso: firma de contrato'
  if (meta.step === 'provider') return 'Siguiente paso: respuesta del proveedor'
  if (meta.step === 'contract') return 'Siguiente paso: firma de contrato'
  if (meta.step === 'payment') return 'Siguiente paso: confirmacion de pago'
  if (meta.step === 'flight') return 'Siguiente paso: confirmacion de vuelo'
  return 'Siguiente paso: tracking y concierge'
}

function hasWorkflowIn(status = '', states = []) {
  return states.includes(resolveWorkflowState(status).id)
}

function contractEnabled(reservation = {}) {
  return hasWorkflowIn(reservation.workflow_status || reservation.status, [
    'provider_accepted',
    'contract_pending',
    'contract_signed',
    'payment_pending',
    'payment_confirmed',
    'flight_confirmed',
    'tracking_live',
    'completed',
  ])
}

function paymentEnabled(reservation = {}) {
  return hasWorkflowIn(reservation.workflow_status || reservation.status, [
    'payment_pending',
    'payment_confirmed',
    'flight_confirmed',
    'tracking_live',
    'completed',
  ])
}

function conciergeEnabled(reservation = {}) {
  return hasWorkflowIn(reservation.workflow_status || reservation.status, [
    'reserved',
    'provider_pending',
    'provider_accepted',
    'contract_pending',
    'contract_signed',
    'payment_pending',
    'payment_confirmed',
    'flight_confirmed',
    'tracking_live',
    'completed',
  ])
}

function aircraftEnabled(reservation = {}) {
  return Boolean(reservation.aircraft)
}

function reservationTab(reservation = {}) {
  const state = resolveWorkflowState(reservation.workflow_status || reservation.status)

  if (['completed', 'cancelled', 'rejected'].includes(state.id)) {
    return 'historial'
  }

  if (
    [
      'draft',
      'quoted',
      'package_selected',
      'reserved',
      'provider_pending',
      'provider_accepted',
      'contract_pending',
      'contract_signed',
      'payment_pending',
    ].includes(state.id)
  ) {
    return 'en_proceso'
  }

  return 'proximos'
}

const tabOptions = [
  { key: 'proximos', label: 'Proximos' },
  { key: 'en_proceso', label: 'En proceso' },
  { key: 'historial', label: 'Historial' },
]

const filteredReservations = computed(() =>
  props.reservations.filter((reservation) => reservationTab(reservation) === activeTab.value),
)

const selectedReservation = computed(
  () =>
    filteredReservations.value.find(
      (reservation) => String(reservation.id) === String(props.selectedId),
    ) ||
    filteredReservations.value[0] ||
    null,
)

watch(
  () => props.reservations,
  (reservations) => {
    const hasActiveTabReservations = reservations.some(
      (reservation) => reservationTab(reservation) === activeTab.value,
    )
    if (hasActiveTabReservations) return

    const fallbackTab = tabOptions.find((tab) =>
      reservations.some((reservation) => reservationTab(reservation) === tab.key),
    )
    activeTab.value = fallbackTab?.key || 'proximos'
  },
  { immediate: true },
)
</script>

<template>
  <section class="active-trips">
    <div class="screen-head">
      <span class="eyebrow">Viajes</span>
      <h2>Activos, proximos e historial en un solo lugar.</h2>
      <p>Tu experiencia de vuelo privado, pagos y seguimiento viven dentro de cada reserva.</p>
    </div>

    <div class="tabs">
      <button
        v-for="tab in tabOptions"
        :key="tab.key"
        :class="{ active: activeTab === tab.key }"
        type="button"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <article v-if="selectedReservation" class="hero-card">
      <div class="hero-card__head">
        <div class="hero-copy">
          <span class="hero-kicker">{{ reservationCode(selectedReservation) }}</span>
          <h3>{{ routeDisplay(selectedReservation) }}</h3>
          <div class="hero-meta">
            <span v-if="selectedReservation.date">📅 {{ departureLine(selectedReservation) }}</span>
            <span v-if="selectedReservation.passengers"
              >👥 {{ selectedReservation.passengers }} pasajeros</span
            >
            <span v-if="selectedReservation.aircraft">🛩 {{ selectedReservation.aircraft }}</span>
            <span v-if="itinerarySegments(selectedReservation).length"
              >✈ {{ itinerarySegments(selectedReservation).length }} tramos</span
            >
            <span v-if="routeSegmentsLabel(selectedReservation)"
              >🗺 {{ routeSegmentsLabel(selectedReservation) }}</span
            >
            <span v-if="overnightLabel(selectedReservation)"
              >🌙 {{ overnightLabel(selectedReservation) }}</span
            >
            <span v-if="countdownLabel(selectedReservation.date)"
              >⏳ {{ countdownLabel(selectedReservation.date) }}</span
            >
          </div>
        </div>
        <span
          class="status-badge"
          :class="`status-badge--${statusMeta(selectedReservation.workflow_status || selectedReservation.status).tone}`"
        >
          {{ statusMeta(selectedReservation.workflow_status || selectedReservation.status).icon }}
          {{ statusMeta(selectedReservation.workflow_status || selectedReservation.status).label }}
        </span>
      </div>

      <div class="progress-shell">
        <div class="progress-track">
          <span
            class="progress-bar"
            :style="{
              width: `${statusMeta(selectedReservation.workflow_status || selectedReservation.status).progress}%`,
            }"
          ></span>
        </div>
        <strong
          >{{
            statusMeta(selectedReservation.workflow_status || selectedReservation.status).progress
          }}%</strong
        >
      </div>

      <div class="progress-steps">
        <span
          v-for="step in progressSteps(
            selectedReservation.workflow_status || selectedReservation.status,
          )"
          :key="step.key"
          class="step-pill"
          :class="`step-pill--${step.state}`"
        >
          {{ step.state === 'done' ? '✓' : step.state === 'active' ? '●' : '○' }} {{ step.label }}
        </span>
      </div>

      <div class="executive-grid">
        <article
          v-if="selectedReservation.aircraft"
          class="executive-card executive-card--aircraft"
        >
          <div
            class="executive-card__media"
            :class="{ 'executive-card__media--placeholder': !selectedReservation.aircraft_image }"
          >
            <img
              v-if="selectedReservation.aircraft_image"
              :src="selectedReservation.aircraft_image"
              :alt="selectedReservation.aircraft"
            />
            <span v-else>Jet privado</span>
          </div>
          <div class="executive-card__copy">
            <strong>🛩 {{ selectedReservation.aircraft }}</strong>
            <span v-if="selectedReservation.aircraft_capacity"
              >Capacidad: {{ selectedReservation.aircraft_capacity }} pax</span
            >
            <span v-if="selectedReservation.aircraft_category"
              >Cabina: {{ selectedReservation.aircraft_category }}</span
            >
            <span v-if="selectedReservation.amenities?.length"
              >Servicios: {{ selectedReservation.amenities.slice(0, 3).join(' • ') }}</span
            >
          </div>
        </article>

        <article class="executive-card">
          <strong>Próximo paso</strong>
          <span>{{
            nextAction(selectedReservation.workflow_status || selectedReservation.status)
          }}</span>
          <span v-if="selectedReservation.flight_package"
            >🎟 {{ selectedReservation.flight_package }}</span
          >
          <span v-if="selectedReservation.payment_status"
            >💳 {{ selectedReservation.payment_status }}</span
          >
          <span v-if="selectedReservation.operator"
            >🏢 Operado por: {{ selectedReservation.operator }}</span
          >
          <span>🎧 Concierge 24/7 disponible</span>
        </article>
      </div>

      <div v-if="itinerarySegments(selectedReservation).length" class="legs-grid">
        <span v-for="leg in itinerarySegments(selectedReservation)" :key="leg.key">
          Tramo {{ leg.order || '?' }} · {{ leg.origin }} → {{ leg.destination }}
          <template v-if="leg.departure"> · {{ shortTripDate(leg.departure) }}</template>
        </span>
      </div>

      <div class="card-actions card-actions--premium">
        <button
          type="button"
          :disabled="!contractEnabled(selectedReservation)"
          @click="$emit('open-contract', selectedReservation.id)"
        >
          📄 Contrato
        </button>
        <button
          type="button"
          :disabled="!paymentEnabled(selectedReservation)"
          @click="$emit('open-payment', selectedReservation.id)"
        >
          💳 Pago
        </button>
        <button
          type="button"
          :disabled="!conciergeEnabled(selectedReservation)"
          @click="$emit('open-concierge', selectedReservation.id)"
        >
          🎧 Concierge
        </button>
        <button
          type="button"
          :disabled="!aircraftEnabled(selectedReservation)"
          @click="$emit('open-detail', selectedReservation.id)"
        >
          🛩 Ver aeronave
        </button>
      </div>
    </article>

    <div v-if="reservations.length && !selectedReservation" class="empty-state">
      No hay viajes en
      {{ tabOptions.find((tab) => tab.key === activeTab)?.label.toLowerCase() || 'esta sección' }}.
    </div>

    <div v-if="!reservations.length" class="empty-state">El servidor no devolvio viajes.</div>
  </section>
</template>

<style scoped>
.active-trips {
  display: grid;
  gap: 1.25rem;
}

.screen-head {
  max-width: 760px;
}

.eyebrow {
  color: #8b6a24;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h2,
h3 {
  margin: 0;
  color: #111111;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: 0;
}

h2 {
  font-size: clamp(2rem, 4vw, 3.2rem);
  line-height: 1;
}

h3 {
  font-size: clamp(1.55rem, 2vw, 2.2rem);
  line-height: 1.02;
}

p,
span {
  color: #625d55;
}

.tabs,
.card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
}

button {
  min-height: 2.8rem;
  border: 0;
  border-radius: 14px;
  padding: 0 1rem;
  background: #ece8df;
  color: #111111;
  font-weight: 800;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease;
}

button:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(17, 17, 17, 0.08);
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
  transform: none;
  box-shadow: none;
}

.tabs .active {
  background: #111111;
  color: #ffffff;
}

.hero-card,
.empty-state {
  border: 1px solid #e5e1d8;
  border-radius: 24px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 244, 237, 0.92)), #ffffff;
  box-shadow: 0 18px 45px rgba(77, 63, 27, 0.08);
}

.empty-state {
  padding: 1rem;
  color: #3b3428;
  font-weight: 800;
}

.hero-card {
  display: grid;
  gap: 1rem;
  padding: 1.35rem;
}

.executive-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem;
}

.executive-card {
  display: grid;
  gap: 0.45rem;
  padding: 1rem;
  border-radius: 18px;
  background: rgba(244, 240, 231, 0.92);
}

.executive-card--aircraft {
  grid-template-columns: 132px minmax(0, 1fr);
  align-items: center;
}

.executive-card__media {
  display: grid;
  place-items: center;
  min-height: 100px;
  overflow: hidden;
  border-radius: 16px;
  background: linear-gradient(135deg, #111111, #4b4233);
  color: #ffffff;
  font-weight: 800;
}

.executive-card__media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.executive-card__media--placeholder {
  background: linear-gradient(135deg, #6f6558, #111111);
}

.executive-card__copy {
  display: grid;
  gap: 0.35rem;
}

.hero-card__head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: start;
}

.hero-copy,
.legs-grid {
  display: grid;
  gap: 0.45rem;
}

.hero-kicker {
  color: #8b6a24;
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 2.2rem;
  border-radius: 999px;
  padding: 0.35rem 0.85rem;
  font-weight: 800;
  white-space: nowrap;
}

.status-badge--searching {
  background: #e8f1ff;
  color: #2351a8;
}

.status-badge--info {
  background: #eef4ff;
  color: #355da8;
}

.status-badge--pending {
  background: #fff2d8;
  color: #9a6500;
}

.status-badge--confirmed,
.status-badge--paid {
  background: #e5f7ea;
  color: #14673a;
}

.status-badge--completed {
  background: #ddf7e6;
  color: #0d6a34;
}

.status-badge--cancelled {
  background: #ffe6e2;
  color: #a13622;
}

.status-badge--neutral {
  background: #efebe4;
  color: #5d5448;
}

.progress-shell {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.progress-track {
  position: relative;
  flex: 1;
  height: 0.75rem;
  border-radius: 999px;
  background: #ebe3d4;
  overflow: hidden;
}

.progress-bar {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: linear-gradient(90deg, #111111, #8b6a24);
}

.progress-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.step-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 2rem;
  border-radius: 999px;
  padding: 0.25rem 0.75rem;
  font-size: 0.92rem;
  font-weight: 700;
}

.step-pill--done {
  background: #e5f7ea;
  color: #14673a;
}

.step-pill--active {
  background: #fff2d8;
  color: #9a6500;
}

.step-pill--todo {
  background: #f1ede7;
  color: #7a7266;
}

.legs-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.legs-grid span {
  padding: 0.8rem 0.95rem;
  border-radius: 16px;
  background: rgba(244, 240, 231, 0.9);
  color: #433c31;
}

.card-actions--premium button {
  background: #ffffff;
  color: #111111;
  border: 1px solid #ded6c8;
}

.card-actions--premium button:last-child {
  background: #111111;
  color: #ffffff;
  border-color: #111111;
}

.card-actions--premium button:disabled {
  background: #f2eee6;
  color: #8c8376;
  border-color: #e3dacd;
}

@media (max-width: 1080px) {
  .hero-card__head,
  .executive-grid,
  .executive-card--aircraft {
    grid-template-columns: 1fr;
    display: grid;
  }
}

@media (max-width: 760px) {
  .active-trips {
    gap: 0.9rem;
  }

  h2 {
    font-size: clamp(1.75rem, 9vw, 2.35rem);
  }

  .tabs,
  .card-actions,
  .hero-meta {
    display: grid;
    grid-template-columns: 1fr;
  }

  .tabs button,
  .card-actions button {
    width: 100%;
  }

  .hero-card {
    padding: 1rem;
    border-radius: 20px;
  }

  .progress-shell {
    align-items: start;
    flex-direction: column;
  }
}
</style>
