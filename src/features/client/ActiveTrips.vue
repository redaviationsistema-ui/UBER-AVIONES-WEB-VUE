<script setup>
import { computed, ref, watch } from 'vue'
import { featuredAirports } from '../../utils/airports'
import {
  buildSharedFlowStepStates,
  getSharedWorkflowActionCopy,
  getSharedWorkflowStatusMeta,
  resolveSharedWorkflowStatus,
  resolveWorkflowState,
  SHARED_WORKFLOW_STEPS,
} from '../../utils/flightWorkflow'

const props = defineProps({
  reservations: { type: Array, required: true },
  selectedId: { type: String, default: '' },
  timeline: { type: Array, required: true },
  initialTab: { type: String, default: 'proximos' },
  refreshing: { type: Boolean, default: false },
})

const emit = defineEmits([
  'open-contract',
  'open-detail',
  'open-payment',
  'open-concierge',
  'refresh',
])

const activeTab = ref('proximos')

const PROGRESS_STEPS = SHARED_WORKFLOW_STEPS.map((step) => ({
  key:
    step.id === 'reserved'
      ? 'booking'
      : step.id === 'provider_pending'
        ? 'provider'
        : step.id === 'contract_pending'
          ? 'contract'
          : step.id === 'payment_pending'
            ? 'payment'
            : step.id === 'flight_confirmed'
              ? 'flight'
              : 'tracking',
  id: step.id,
  label: step.clientLabel,
}))

function statusMeta(status = '') {
  return getSharedWorkflowStatusMeta(status)
}

function workflowId(status = '') {
  return resolveWorkflowState(status).id
}

function progressSteps(status = '') {
  const sharedStates = buildSharedFlowStepStates(status)

  return PROGRESS_STEPS.map((step) => {
    const sharedStep = sharedStates.find((item) => item.id === step.id)
    return {
      ...step,
      state: sharedStep?.state || 'todo',
    }
  })
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
  return `${reservation?.is_reservation ? 'Reserva' : 'Solicitud'} SKY-${numericId}`
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
  return getSharedWorkflowActionCopy(status).title
}

function nextActionDetail(status = '') {
  return getSharedWorkflowActionCopy(status).detail
}

function workflowSupportLines(reservation = {}) {
  const workflowValue = reservationWorkflowValue(reservation)
  const stateId = workflowId(workflowValue)
  const lines = []

  if (reservation.flight_package) {
    lines.push(`🎟 ${reservation.flight_package}`)
  }

  if (stateId === 'contract_pending' || stateId === 'contract_signed') {
    lines.push('📄 Contrato en gestion')
  } else if (stateId === 'payment_pending' || stateId === 'payment_confirmed') {
    lines.push(`💳 ${reservation.payment_status || 'Pago en proceso'}`)
  } else if (stateId === 'flight_confirmed' || stateId === 'tracking_live') {
    lines.push('🛫 Operacion en liberacion final')
  }

  if (reservation.operator) {
    lines.push(`🏢 Operado por: ${reservation.operator}`)
  }

  lines.push('🎧 Concierge 24/7 disponible')

  return lines
}

function flightActionLabel(reservation = {}) {
  const stateId = workflowId(reservationWorkflowValue(reservation))

  if (stateId === 'tracking_live') return '📡 Tracking en vivo'
  if (stateId === 'flight_confirmed') return '🛫 Vuelo confirmado'
  if (stateId === 'payment_confirmed') return '🛫 Liberando vuelo'
  if (stateId === 'payment_pending') return '🛫 Esperando validacion'
  return '🛫 Vuelo por confirmar'
}

function hasWorkflowIn(status = '', states = []) {
  return states.includes(resolveWorkflowState(status).id)
}

function reservationWorkflowValue(reservation = {}) {
  return (
    resolveSharedWorkflowStatus({
      ...(reservation || {}),
      workflow_status: reservation.workflow_status || reservation.status || '',
      contract_status: reservation.contract_status || '',
      payment_status: reservation.payment_status || '',
    }) ||
    reservation.workflow_status ||
    reservation.status ||
    ''
  )
}

function contractEnabled(reservation = {}) {
  return hasWorkflowIn(reservationWorkflowValue(reservation), [
    'provider_accepted',
    'contract_pending',
  ])
}

function paymentEnabled(reservation = {}) {
  if (!reservation?.is_reservation) return false

  return hasWorkflowIn(reservationWorkflowValue(reservation), [
    'contract_signed',
    'payment_pending',
    'payment_confirmed',
    'flight_confirmed',
    'tracking_live',
    'completed',
  ])
}

function conciergeEnabled(reservation = {}) {
  return hasWorkflowIn(reservationWorkflowValue(reservation), [
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

function reservationTab(reservation = {}) {
  const state = resolveWorkflowState(reservationWorkflowValue(reservation))

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
    return 'proximos'
  }

  return 'proximos'
}

const tabOptions = [
  { key: 'proximos', label: 'Historial' },
]

function normalizeTabKey(value = '') {
  return tabOptions.some((tab) => tab.key === value) ? value : 'proximos'
}

const filteredReservations = computed(() =>
  props.reservations.filter((reservation) => reservationTab(reservation) === activeTab.value),
)

watch(
  () => props.initialTab,
  (nextTab) => {
    activeTab.value = normalizeTabKey(nextTab)
  },
  { immediate: true },
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
    <div class="screen-head screen-head--actions">
      <div>
        <span class="eyebrow">Viajes</span>
        <h2>Activos, proximos e historial en un solo lugar.</h2>
        <p>Tu experiencia de vuelo privado, pagos y seguimiento viven dentro de cada reserva.</p>
      </div>

      <button
        class="refresh-button"
        type="button"
        :disabled="props.refreshing"
        @click="emit('refresh')"
      >
        {{ props.refreshing ? 'Recargando...' : 'Recargar viajes' }}
      </button>
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

    <article
      v-for="reservation in filteredReservations"
      :key="reservation.id || reservation.flight_request_id || reservation.created_at"
      class="hero-card"
    >
      <div class="hero-card__head">
        <div class="hero-copy">
          <span class="hero-kicker">{{ reservationCode(reservation) }}</span>
          <h3>{{ routeDisplay(reservation) }}</h3>
          <div class="hero-meta">
            <span v-if="reservation.date">📅 {{ departureLine(reservation) }}</span>
            <span v-if="reservation.passengers">👥 {{ reservation.passengers }} pasajeros</span>
            <span v-if="reservation.aircraft">🛩 {{ reservation.aircraft }}</span>
            <span v-if="itinerarySegments(reservation).length"
              >✈ {{ itinerarySegments(reservation).length }} tramos</span
            >
            <span v-if="routeSegmentsLabel(reservation)">🗺 {{ routeSegmentsLabel(reservation) }}</span>
            <span v-if="overnightLabel(reservation)">🌙 {{ overnightLabel(reservation) }}</span>
            <span v-if="countdownLabel(reservation.date)">⏳ {{ countdownLabel(reservation.date) }}</span>
          </div>
        </div>
        <span
          class="status-badge"
          :class="`status-badge--${statusMeta(reservationWorkflowValue(reservation)).tone}`"
        >
          {{ statusMeta(reservationWorkflowValue(reservation)).icon }}
          {{ statusMeta(reservationWorkflowValue(reservation)).label }}
        </span>
      </div>

      <div class="progress-shell">
        <div class="progress-track">
          <span
            class="progress-bar"
            :style="{
              width: `${statusMeta(reservationWorkflowValue(reservation)).progress}%`,
            }"
          ></span>
        </div>
        <strong>{{ statusMeta(reservationWorkflowValue(reservation)).progress }}%</strong>
      </div>

      <div class="progress-steps">
        <span
          v-for="step in progressSteps(reservationWorkflowValue(reservation))"
          :key="step.key"
          class="step-pill"
          :class="`step-pill--${step.state}`"
        >
          <span class="step-pill__icon">
            {{ step.state === 'done' ? '✓' : step.state === 'active' ? '●' : '○' }}
          </span>
          <span>{{ step.label }}</span>
        </span>
      </div>

      <div class="executive-grid">
        <article v-if="reservation.aircraft" class="executive-card executive-card--aircraft">
          <div
            class="executive-card__media"
            :class="{ 'executive-card__media--placeholder': !reservation.aircraft_image }"
          >
            <img
              v-if="reservation.aircraft_image"
              :src="reservation.aircraft_image"
              :alt="reservation.aircraft"
            />
            <span v-else>Jet privado</span>
          </div>
          <div class="executive-card__copy">
            <strong>🛩 {{ reservation.aircraft }}</strong>
            <span v-if="reservation.aircraft_capacity"
              >Capacidad: {{ reservation.aircraft_capacity }} pax</span
            >
            <span v-if="reservation.aircraft_category">Cabina: {{ reservation.aircraft_category }}</span>
            <span v-if="reservation.amenities?.length"
              >Servicios: {{ reservation.amenities.slice(0, 3).join(' • ') }}</span
            >
          </div>
        </article>

        <article class="executive-card">
          <strong>Siguiente paso:</strong>
          <span>{{ nextAction(reservationWorkflowValue(reservation)) }}</span>
          <span>{{ nextActionDetail(reservationWorkflowValue(reservation)) }}</span>
          <span v-for="line in workflowSupportLines(reservation)" :key="line">{{ line }}</span>
        </article>
      </div>

      <div v-if="itinerarySegments(reservation).length" class="legs-grid">
        <span v-for="leg in itinerarySegments(reservation)" :key="leg.key">
          Tramo {{ leg.order || '?' }} · {{ leg.origin }} → {{ leg.destination }}
          <template v-if="leg.departure"> · {{ shortTripDate(leg.departure) }}</template>
        </span>
      </div>

      <div class="card-actions card-actions--premium">
        <button
          type="button"
          :disabled="!contractEnabled(reservation)"
          @click="$emit('open-contract', reservation.id)"
        >
          📄 Contrato
        </button>
        <button
          type="button"
          :disabled="!paymentEnabled(reservation)"
          @click="$emit('open-payment', reservation.id)"
        >
          💳 Pago
        </button>
        <button type="button">{{ flightActionLabel(reservation) }}</button>
        <button
          type="button"
          :disabled="!conciergeEnabled(reservation)"
          @click="$emit('open-concierge', reservation.id)"
        >
          🎧 Concierge
        </button>
      </div>
    </article>

    <div v-if="reservations.length && !filteredReservations.length" class="empty-state">
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

.screen-head--actions {
  max-width: none;
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
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

.refresh-button {
  flex-shrink: 0;
  background: #111111;
  color: #ffffff;
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

.step-pill__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 999px;
  font-size: 0.9rem;
  line-height: 1;
  flex-shrink: 0;
}

.step-pill--done {
  background: #e5f7ea;
  color: #14673a;
}

.step-pill--done .step-pill__icon {
  background: #1b7a45;
  color: #ffffff;
}

.step-pill--active {
  background: #fff2d8;
  color: #9a6500;
}

.step-pill--active .step-pill__icon {
  background: #b57a00;
  color: #ffffff;
}

.step-pill--todo {
  background: #f1ede7;
  color: #7a7266;
}

.step-pill--todo .step-pill__icon {
  background: #ffffff;
  color: #8c8376;
  border: 1px solid #d7cfbf;
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

  .screen-head--actions {
    align-items: stretch;
    grid-template-columns: 1fr;
    display: grid;
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

  .refresh-button,
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
