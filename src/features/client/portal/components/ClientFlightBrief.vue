<script setup>
import { computed } from 'vue'
import { getCustomerFlightPresentation } from './clientFlightBriefStage'

const props = defineProps({ flightBrief: { type: Object, default: null } })
defineEmits(['view-tracking'])

function textOrFallback(value, fallback) {
  const normalized = String(value ?? '').trim()
  return normalized || fallback
}

function positiveInteger(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0
}

function formatDateTime(value, options = {}) {
  const parsed = new Date(String(value ?? '').trim())
  if (Number.isNaN(parsed.getTime())) return 'Por confirmar'
  return new Intl.DateTimeFormat('es-MX', options).format(parsed)
}

function formatDuration(value) {
  const hours = Number(value)
  if (!Number.isFinite(hours) || hours <= 0) return 'Por confirmar'
  const totalMinutes = Math.round(hours * 60)
  const wholeHours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (!wholeHours) return `${minutes} min`
  if (!minutes) return `${wholeHours} h`
  return `${wholeHours} h ${minutes.toString().padStart(2, '0')} min`
}

const brief = computed(() => props.flightBrief || {})
const flight = computed(() => brief.value.flight || {})
const departure = computed(() => brief.value.departure || {})
const arrival = computed(() => brief.value.arrival || {})
const aircraft = computed(() => brief.value.aircraft || {})
const payment = computed(() => brief.value.payment || {})
const provider = computed(() => brief.value.provider || {})
const operation = computed(() => brief.value.operation || {})
const crew = computed(() => brief.value.crew || {})
const checklist = computed(() => brief.value.checklist || {})
const services = computed(() => brief.value.services || {})
const presentation = computed(() => brief.value.presentation || {})
const support = computed(() => brief.value.support || {})

const route = computed(() => ({
  departure: {
    code: textOrFallback(departure.value.code || flight.value.origin, 'Origen por confirmar'),
    airport: textOrFallback(departure.value.airport_name, 'Aeropuerto por confirmar'),
    city: textOrFallback(departure.value.city, 'Ciudad por confirmar'),
  },
  arrival: {
    code: textOrFallback(arrival.value.code || flight.value.destination, 'Destino por confirmar'),
    airport: textOrFallback(arrival.value.airport_name, 'Aeropuerto por confirmar'),
    city: textOrFallback(arrival.value.city, 'Ciudad por confirmar'),
  },
}))

const checklistTotal = computed(() => positiveInteger(checklist.value.total))
const checklistHasCounts = computed(() => checklist.value.exists === true && checklistTotal.value > 0)
const checklistPercentage = computed(() => {
  const percentage = Number(checklist.value.percentage)
  return Number.isFinite(percentage) ? Math.max(0, Math.min(100, Math.round(percentage))) : 0
})
const customerPresentation = computed(() => getCustomerFlightPresentation(brief.value))
const isCancelled = computed(() => customerPresentation.value.stage === 'cancelled')
const isCompleted = computed(() => customerPresentation.value.stage === 'completed')
const isInFlight = computed(() => customerPresentation.value.stage === 'in_flight')
const isLanded = computed(() => customerPresentation.value.stage === 'landed')
const isReadyForDeparture = computed(() => customerPresentation.value.stage === 'ready')

const crewState = computed(() => {
  if (crew.value.confirmed === true) return { label: 'Tripulación confirmada', detail: 'Confirmada', state: 'completed' }
  if (crew.value.assigned === true) return { label: 'Tripulación en confirmación', detail: 'Pendiente de confirmación', state: 'current' }
  return { label: 'Tripulación pendiente', detail: 'Sin asignación todavía', state: 'pending' }
})
const checklistState = computed(() => {
  if (isReadyForDeparture.value) return { label: 'Todo listo para la salida', state: 'completed' }
  if (checklist.value.is_complete === true) return { label: 'Preparación completada', state: 'completed' }
  if (checklist.value.exists === true) return { label: 'Preparación en curso', state: 'current' }
  return { label: 'Preparación pendiente', state: 'pending' }
})
const checklistOperationalLabel = computed(() => {
  if (isReadyForDeparture.value || checklist.value.is_complete === true) return 'Preparación completada'
  if (checklist.value.exists === true) return 'Preparación en curso'
  return 'Preparación pendiente'
})
const timelineSteps = computed(() => {
  const confirmed = payment.value.confirmed === true
  const terminal = isCompleted.value
  const preparationInProgress = checklist.value.exists === true && checklist.value.is_complete !== true

  return [
    { label: 'Pago', detail: confirmed ? 'Confirmado' : 'Pendiente', state: confirmed ? 'completed' : 'current' },
    { label: 'Reserva', detail: confirmed ? 'Confirmada' : 'En confirmación', state: confirmed ? 'completed' : 'pending' },
    { label: 'Detalles del vuelo', detail: confirmed ? 'Disponibles' : 'En preparación', state: confirmed ? 'completed' : 'pending' },
    { label: 'Flight Brief', detail: brief.value.visible === true ? 'Actual' : 'Disponible al confirmar pago', state: brief.value.visible === true && !terminal && !isCancelled.value ? 'current' : confirmed ? 'completed' : 'pending' },
    { label: 'Preparación', detail: isReadyForDeparture.value ? 'Lista' : preparationInProgress ? 'En proceso' : 'Pendiente', state: terminal || isInFlight.value || isLanded.value || isReadyForDeparture.value ? 'completed' : preparationInProgress && !isCancelled.value ? 'current' : 'pending' },
    { label: 'Seguimiento', detail: terminal ? 'Finalizado' : isInFlight.value ? 'En curso' : operation.value.id && isReadyForDeparture.value ? 'Disponible' : 'Pendiente', state: terminal ? 'completed' : isInFlight.value || isLanded.value || isCancelled.value ? 'current' : 'pending' },
  ]
})
const timelineProgress = computed(() => {
  const currentStepIndex = timelineSteps.value.findIndex((step) => step.state === 'current')
  return currentStepIndex < 0 ? 0 : currentStepIndex / Math.max(timelineSteps.value.length - 1, 1)
})
const operationalItems = computed(() => [
  { label: payment.value.confirmed ? 'Pago confirmado' : 'Pago pendiente', state: payment.value.confirmed ? 'completed' : 'pending' },
  { label: aircraft.value.model ? 'Aeronave asignada' : 'Aeronave pendiente', state: aircraft.value.model ? 'completed' : 'pending' },
  { label: provider.value.assigned ? 'Operador asignado' : 'Operador pendiente', state: provider.value.assigned ? 'completed' : 'pending' },
  { label: crewState.value.label, state: crewState.value.state },
  { label: checklistOperationalLabel.value, state: checklistState.value.state },
])
const aircraftModel = computed(() => textOrFallback(aircraft.value.model || flight.value.aircraft, 'Aeronave por confirmar'))
const requestedServices = computed(() => [
  { key: 'catering', label: 'Catering', requested: services.value.catering?.requested === true },
  {
    key: 'special_baggage',
    label: 'Equipaje especial',
    requested: services.value.special_baggage?.requested === true,
    description: textOrFallback(services.value.special_baggage?.description, ''),
  },
  { key: 'ground_transport', label: 'Transporte terrestre', requested: services.value.ground_transport?.requested === true },
].filter((service) => service.requested))
const hasRequestedServices = computed(() => requestedServices.value.length > 0)
const presentationLocation = computed(() => textOrFallback(presentation.value.location_name, 'Por confirmar'))
const presentationTime = computed(() => formatDateTime(presentation.value.presentation_datetime, { hour: 'numeric', minute: '2-digit' }))
const hasSupport = computed(() => ['name', 'phone', 'whatsapp', 'email'].some((key) => Boolean(String(support.value[key] ?? '').trim())))
const customerAction = computed(() =>
  presentation.value.is_complete === true
    ? 'No necesitas realizar ninguna acción por el momento. Nuestro equipo continuará coordinando tu vuelo y te notificaremos cuando exista una actualización.'
    : 'No necesitas hacer nada por ahora. Te avisaremos cuando confirmemos dónde y a qué hora debes presentarte.',
)
</script>

<template>
  <article class="flight-brief" aria-labelledby="flight-brief-title">
    <ol class="flight-brief__timeline" :style="{ '--timeline-progress': timelineProgress }" aria-label="Progreso del vuelo">
      <li v-for="step in timelineSteps" :key="step.label" :data-state="step.state"><span class="flight-brief__timeline-mark" aria-hidden="true"><svg v-if="step.state === 'current'" viewBox="0 0 24 24" focusable="false"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5Z" /></svg></span><span><strong>{{ step.label }}</strong><small>{{ step.detail }}</small></span></li>
    </ol>
    <header class="flight-brief__hero">
      <div><span class="flight-brief__eyebrow">Flight Brief · Información de tu vuelo</span><h1 id="flight-brief-title">{{ customerPresentation.title }}</h1><p>{{ customerPresentation.description }}</p><strong class="flight-brief__hero-status" :data-ready="isReadyForDeparture">{{ customerPresentation.badge }}</strong></div>
      <div class="flight-brief__aircraft-visual"><img v-if="aircraft.image_url" :src="aircraft.image_url" :alt="`Aeronave ${aircraftModel}`" /><span v-else aria-hidden="true">✈</span></div>
    </header>
    <section class="flight-brief__route-card" aria-labelledby="flight-brief-route-title">
      <div class="flight-brief__section-heading"><h3 id="flight-brief-route-title">Ruta</h3></div>
      <div class="flight-brief__route"><div><strong>{{ route.departure.code }}</strong><span>{{ route.departure.airport }}</span><small>{{ route.departure.city }}</small></div><span class="flight-brief__route-line" aria-hidden="true"><span>✈</span></span><div><strong>{{ route.arrival.code }}</strong><span>{{ route.arrival.airport }}</span><small>{{ route.arrival.city }}</small></div></div>
      <dl class="flight-brief__schedule"><div><dt>Fecha</dt><dd>{{ formatDateTime(flight.departure_datetime, { day: '2-digit', month: 'short', year: 'numeric' }) }}</dd></div><div><dt>Salida</dt><dd>{{ formatDateTime(flight.departure_datetime, { hour: 'numeric', minute: '2-digit' }) }}</dd></div><div><dt>Llegada</dt><dd>{{ formatDateTime(flight.arrival_datetime, { hour: 'numeric', minute: '2-digit' }) }}</dd></div><div><dt>Duración</dt><dd>{{ formatDuration(flight.duration_hours) }}</dd></div></dl>
    </section>
    <section class="flight-brief__presentation-card" aria-labelledby="flight-brief-presentation-title">
      <h3 id="flight-brief-presentation-title">Dónde presentarte</h3>
      <strong>{{ textOrFallback(presentation.airport_name, route.departure.airport) }}</strong>
      <span>{{ textOrFallback(presentation.airport_code, route.departure.code) }} · {{ textOrFallback(presentation.city, route.departure.city) }}</span>
      <dl><div><dt><span aria-hidden="true">●</span>Punto de presentación</dt><dd>{{ presentationLocation }}</dd></div><div><dt><span aria-hidden="true">◷</span>Hora de presentación</dt><dd>{{ presentationTime }}</dd></div><div v-if="presentation.address"><dt><span aria-hidden="true">⌖</span>Dirección</dt><dd>{{ presentation.address }}</dd></div></dl>
      <a v-if="presentation.maps_url" :href="presentation.maps_url" target="_blank" rel="noopener noreferrer">Cómo llegar</a>
      <p v-if="presentation.is_complete !== true">Te avisaremos cuando estén confirmados todos los detalles de presentación.</p>
    </section>
    <section class="flight-brief__operational-card" aria-labelledby="flight-brief-operational-title"><h3 id="flight-brief-operational-title">Estado del vuelo</h3><ul><li v-for="item in operationalItems" :key="item.label" :data-state="item.state"><span aria-hidden="true"></span>{{ item.label }}</li></ul></section>
    <section class="flight-brief__readiness-card" aria-labelledby="flight-brief-readiness-title"><span>Próximo paso</span><h3 id="flight-brief-readiness-title" :data-ready="isReadyForDeparture">{{ customerPresentation.title }}</h3><p>{{ customerPresentation.description }}</p><strong v-if="!isCancelled" class="flight-brief__readiness-status">No necesitas realizar ninguna acción.</strong><button v-if="operation.id && (isReadyForDeparture || isInFlight || isLanded || isCompleted)" type="button" @click="$emit('view-tracking')">{{ isInFlight ? 'Seguir mi vuelo' : isCompleted ? 'Ver resumen del vuelo' : 'Ver seguimiento' }}</button><small v-else-if="!isCancelled">El seguimiento estará disponible cuando inicie la preparación operacional.</small></section>
    <section class="flight-brief__preparation-card" aria-labelledby="flight-brief-preparation-title">
      <div class="flight-brief__section-heading"><h3 id="flight-brief-preparation-title">Preparación de tu vuelo</h3><strong v-if="checklistHasCounts">Preparación {{ checklistPercentage }}%</strong></div>
      <p>{{ checklistHasCounts ? checklistState.label : checklist.exists ? 'Preparación operacional en proceso.' : 'Estamos coordinando los preparativos necesarios antes de tu salida.' }}</p>
      <div v-if="checklistHasCounts" class="flight-brief__progress" :aria-valuemax="100" :aria-valuemin="0" :aria-valuenow="checklistPercentage" role="progressbar"><span :style="{ width: `${checklistPercentage}%` }"></span></div><div v-else class="flight-brief__preparation-indicator" :data-state="checklistState.state" aria-hidden="true"><span></span></div>
      <strong class="flight-brief__checklist-state" :data-state="checklistState.state">{{ checklistState.label }}</strong>
    </section>
    <section class="flight-brief__crew-card" aria-labelledby="flight-brief-crew-title"><h3 id="flight-brief-crew-title">Tripulación</h3><div class="flight-brief__crew-profile"><span class="flight-brief__crew-avatar" aria-hidden="true">✦</span><div><span>Sobrecargo</span><strong>{{ crew.assigned ? textOrFallback(crew.visible_name, 'Asignación en proceso') : 'Sin asignación' }}</strong><small :data-state="crewState.state">Estado: {{ crewState.detail }}</small></div></div></section>
    <section class="flight-brief__action-card" aria-labelledby="flight-brief-action-title"><h3 id="flight-brief-action-title">¿Necesitas hacer algo?</h3><p>{{ customerAction }}</p></section>
    <section v-if="hasRequestedServices" class="flight-brief__services-card" aria-labelledby="flight-brief-services-title"><h3 id="flight-brief-services-title">Servicios de tu vuelo</h3><ul><li v-for="service in requestedServices" :key="service.key"><strong>{{ service.label }}</strong><span>Solicitado</span><small v-if="service.description">{{ service.description }}</small></li></ul></section>
    <section v-if="presentation.instructions" class="flight-brief__instructions-card flight-brief__passenger-guidance" aria-labelledby="flight-brief-instructions-title"><span class="flight-brief__guidance-icon" aria-hidden="true">i</span><div><h3 id="flight-brief-instructions-title">Indicaciones para pasajeros</h3><p>{{ presentation.instructions }}</p></div></section>
    <aside class="flight-brief__gratitude-card" aria-label="Mensaje de agradecimiento"><span aria-hidden="true">✈</span><h3>Gracias por elegir<br />aviación privada.</h3><p>Estamos listos para que disfrutes de tu vuelo.</p></aside>
    <section v-if="hasSupport" class="flight-brief__support-card" aria-labelledby="flight-brief-support-title"><h3 id="flight-brief-support-title">Asistencia operativa</h3><strong v-if="support.name">{{ support.name }}</strong><p>Disponible para asistencia relacionada con tu vuelo.</p><div><a v-if="support.phone" :href="`tel:${support.phone}`">Llamar</a><a v-if="support.whatsapp" :href="support.whatsapp" target="_blank" rel="noopener noreferrer">WhatsApp</a><a v-if="support.email" :href="`mailto:${support.email}`">Correo</a></div></section>
  </article>
</template>

<style scoped>
.flight-brief { --brief-ink:#10293f; --brief-muted:#607489; --brief-line:#e3e8ec; --brief-paper:#fffdf9; --brief-sand:#f8f3e9; --brief-ready:#187456; --brief-active:#05778c; display:grid; gap:10px; color:var(--brief-ink); }.flight-brief > * { border:1px solid var(--brief-line); border-radius:16px; background:var(--brief-paper); box-shadow:0 4px 18px rgba(15,35,55,.04); }.flight-brief__timeline { display:flex; gap:.9rem; margin:0; padding:.7rem .95rem; overflow-x:auto; list-style:none; background:#f7faf9; }.flight-brief__timeline li { display:flex; align-items:center; gap:.45rem; flex:0 0 auto; color:var(--brief-muted); font-size:.72rem; white-space:nowrap; }.flight-brief__timeline li strong,.flight-brief__timeline li small { display:block; }.flight-brief__timeline li strong { color:var(--brief-ink); font-weight:800; }.flight-brief__timeline li small { margin-top:.08rem; color:#8494a1; font-size:.68rem; }.flight-brief__timeline-mark,.flight-brief__operational-card li > span { display:inline-grid; width:1.05rem; height:1.05rem; flex:0 0 1.05rem; place-items:center; border:1px solid #c6d1d8; border-radius:50%; background:#fff; }.flight-brief__timeline li[data-state='completed'] .flight-brief__timeline-mark,.flight-brief__operational-card li[data-state='completed'] > span { border-color:var(--brief-ready); background:var(--brief-ready); }.flight-brief__timeline li[data-state='completed'] .flight-brief__timeline-mark::after,.flight-brief__operational-card li[data-state='completed'] > span::after { color:#fff; content:'✓'; font-size:.66rem; }.flight-brief__timeline li[data-state='current'] .flight-brief__timeline-mark,.flight-brief__operational-card li[data-state='current'] > span { border:3px solid var(--brief-active); box-shadow:0 0 0 3px rgba(5,119,140,.1); }
.flight-brief__hero { display:grid; grid-template-columns:minmax(0,1fr) minmax(240px,48%); gap:1.2rem; align-items:center; padding:1.05rem 1.2rem; background:linear-gradient(115deg,#fffdf9 0%,#f2f7f7 100%); }.flight-brief__eyebrow,.flight-brief h3,.flight-brief__readiness-card > span { color:var(--brief-muted); font-size:.72rem; font-weight:850; letter-spacing:.105em; text-transform:uppercase; }.flight-brief__hero h1 { max-width:23ch; margin:.38rem 0 0; font-family:Georgia,'Times New Roman',serif; font-size:clamp(1.55rem,3vw,2.2rem); letter-spacing:-.04em; line-height:1.07; }.flight-brief__hero p { max-width:48ch; margin:.38rem 0 0; color:var(--brief-muted); font-size:.91rem; line-height:1.42; }.flight-brief__hero-status { display:inline-flex; margin-top:.62rem; padding:.35rem .58rem; border-radius:999px; background:rgba(5,119,140,.1); color:#075f70; font-size:.7rem; font-weight:800; letter-spacing:.07em; text-transform:uppercase; }.flight-brief__hero-status[data-ready='true'] { background:rgba(24,116,86,.12); color:var(--brief-ready); }.flight-brief__aircraft-visual { aspect-ratio:16/9; min-height:220px; overflow:hidden; border-radius:12px; background:#f4f7f8; color:#173951; font-size:2.4rem; }.flight-brief__aircraft-visual,.flight-brief__aircraft-visual span { display:grid; place-items:center; }.flight-brief__aircraft-visual img { display:block; width:100%; height:100%; padding:.55rem; box-sizing:border-box; object-fit:contain; object-position:center; }
.flight-brief__route-card,.flight-brief__presentation-card,.flight-brief__preparation-card,.flight-brief__operational-card,.flight-brief__crew-card,.flight-brief__readiness-card,.flight-brief__action-card,.flight-brief__instructions-card,.flight-brief__gratitude-card,.flight-brief__support-card,.flight-brief__services-card { padding:1.15rem; }.flight-brief h3 { margin:0; }.flight-brief__section-heading { display:flex; align-items:baseline; justify-content:space-between; gap:1rem; }.flight-brief__section-heading > strong { color:var(--brief-active); font-size:.8rem; font-weight:800; }.flight-brief__route { display:grid; grid-template-columns:minmax(0,1fr) minmax(420px,.76fr) minmax(0,1fr); align-items:center; gap:.7rem; margin-top:.85rem; }.flight-brief__route > div:last-child { text-align:right; }.flight-brief__route strong { display:block; font-size:clamp(2rem,4.2vw,3.15rem); letter-spacing:-.06em; line-height:1; }.flight-brief__route > div > span,.flight-brief__route > div > small { display:block; overflow:hidden; margin-top:.32rem; color:var(--brief-muted); font-size:.8rem; line-height:1.3; text-overflow:ellipsis; white-space:nowrap; }.flight-brief__route-line { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; height:3.6rem; color:var(--brief-active); }.flight-brief__route-line::before,.flight-brief__route-line::after { height:2px; background:#bdccd4; content:''; }.flight-brief__route-line::before { grid-column:1; }.flight-brief__route-line::after { grid-column:3; }.flight-brief__route-line > span { grid-column:2; z-index:1; padding:0 1.25rem; background:var(--brief-paper); font-family:Arial,sans-serif; font-size:3.4rem; line-height:1; }.flight-brief__schedule { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:.7rem; margin:1rem 0 0; }.flight-brief__presentation-card dl { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.8rem; max-width:70%; margin:1rem 0 0; }.flight-brief__schedule div,.flight-brief__presentation-card dl div { padding-top:.85rem; border-top:1px solid var(--brief-line); }.flight-brief__schedule dt,.flight-brief__presentation-card dt { color:var(--brief-muted); font-size:.72rem; font-weight:750; letter-spacing:.07em; text-transform:uppercase; }.flight-brief__presentation-card dt span { margin-right:.35rem; color:var(--brief-active); }.flight-brief__schedule dd,.flight-brief__presentation-card dd { margin:.3rem 0 0; font-size:.9rem; font-weight:800; line-height:1.35; }.flight-brief__presentation-card { background:#f4f9f9; }.flight-brief__presentation-card > strong { display:block; margin-top:.6rem; font-size:1rem; }.flight-brief__presentation-card > span,.flight-brief__presentation-card > p { color:var(--brief-muted); font-size:.84rem; }.flight-brief__presentation-card > a,.flight-brief__support-card a { display:inline-flex; margin-top:.85rem; color:var(--brief-active); font-size:.82rem; font-weight:850; }.flight-brief__presentation-card > p { margin:.65rem 0 0; line-height:1.45; }
.flight-brief__operational-card ul,.flight-brief__services-card ul { display:grid; gap:.6rem; margin:.9rem 0 0; padding:0; list-style:none; }.flight-brief__operational-card li { display:flex; align-items:center; gap:.7rem; padding:.38rem 0; color:#405568; font-size:.88rem; font-weight:750; }.flight-brief__operational-card li[data-state='current'] { padding:.58rem .65rem; border-radius:10px; background:rgba(5,119,140,.07); color:var(--brief-ink); }.flight-brief__operational-card li[data-state='pending'] { color:#70818e; }.flight-brief__preparation-card p,.flight-brief__action-card p,.flight-brief__instructions-card p,.flight-brief__support-card p { margin:.55rem 0 0; color:var(--brief-muted); font-size:.88rem; line-height:1.45; }.flight-brief__progress { overflow:hidden; height:.5rem; margin-top:.8rem; border-radius:999px; background:#dfe8eb; }.flight-brief__progress span { display:block; min-width:0; height:100%; border-radius:inherit; background:linear-gradient(90deg,var(--brief-active),#3c99a3); transition:width 220ms ease; }.flight-brief__preparation-indicator { height:2px; margin-top:.95rem; background:#dfe8eb; }.flight-brief__preparation-indicator span { display:block; width:2.6rem; height:100%; background:#9ab4c0; }.flight-brief__preparation-indicator[data-state='current'] span { background:var(--brief-active); }.flight-brief__preparation-indicator[data-state='completed'] span { width:100%; background:var(--brief-ready); }.flight-brief__checklist-state { display:inline-block; margin-top:.65rem; color:var(--brief-muted); font-size:.8rem; font-weight:800; }.flight-brief__checklist-state[data-state='completed'] { color:var(--brief-ready); }.flight-brief__checklist-state[data-state='current'] { color:var(--brief-active); }
.flight-brief__crew-card { background:#fbfcfb; }.flight-brief__crew-profile { display:flex; align-items:center; gap:.8rem; margin-top:.85rem; }.flight-brief__crew-avatar { display:grid; width:2.7rem; height:2.7rem; flex:0 0 2.7rem; place-items:center; border-radius:50%; background:#e5eff0; color:var(--brief-active); font-size:1.1rem; }.flight-brief__crew-profile > div { display:grid; gap:.18rem; min-width:0; }.flight-brief__crew-profile span { color:var(--brief-muted); font-size:.78rem; }.flight-brief__crew-profile strong { overflow:hidden; font-size:1.04rem; font-weight:850; text-overflow:ellipsis; white-space:nowrap; }.flight-brief__crew-profile small { color:var(--brief-muted); font-size:.74rem; }.flight-brief__crew-profile small[data-state='completed'] { color:var(--brief-ready); font-weight:800; }.flight-brief__crew-profile small[data-state='current'] { color:var(--brief-active); font-weight:800; }
.flight-brief__readiness-card { display:grid; gap:.7rem; padding:1.3rem; background:var(--brief-ink); color:#fff; }.flight-brief__readiness-card > span { color:rgba(255,255,255,.64); }.flight-brief__readiness-card h3 { color:#fff; font-size:1.27rem; letter-spacing:-.015em; line-height:1.25; text-transform:none; }.flight-brief__readiness-card h3[data-ready='true'] { color:#a8e0c8; }.flight-brief__readiness-card p { margin:0; color:rgba(255,255,255,.76); font-size:.86rem; line-height:1.45; }.flight-brief__readiness-status { margin-top:.25rem; color:#cce5e8; font-size:.8rem; }.flight-brief__readiness-card small { color:rgba(255,255,255,.54); font-size:.69rem; line-height:1.4; }.flight-brief__readiness-card button { justify-self:start; margin-top:.35rem; padding:.62rem .9rem; border:1px solid rgba(255,255,255,.55); border-radius:999px; background:transparent; color:#fff; font:inherit; font-size:.8rem; font-weight:850; }.flight-brief__readiness-card button:hover,.flight-brief__readiness-card button:focus-visible { background:#fff; color:var(--brief-ink); }
.flight-brief__action-card { background:#f8faf9; }.flight-brief__passenger-guidance { display:grid; grid-template-columns:auto minmax(0,1fr); gap:1rem; align-items:start; border-color:#e3edf4; background:#f1f7fc; }.flight-brief__guidance-icon { display:grid; width:2rem; height:2rem; place-items:center; border-radius:50%; background:var(--brief-ink); color:#fff; font-family:Georgia,serif; font-size:1.15rem; font-weight:800; }.flight-brief__passenger-guidance h3 { color:var(--brief-ink); font-size:.95rem; letter-spacing:0; text-transform:none; }.flight-brief__passenger-guidance p { margin-top:.45rem; color:#4c6b88; }.flight-brief__gratitude-card { display:grid; align-content:center; gap:.45rem; min-height:100%; overflow:hidden; border-color:#183854; background:radial-gradient(circle at 94% 0%,rgba(96,157,184,.36),transparent 38%),linear-gradient(135deg,#0c2945,#173b5d); color:#fff; }.flight-brief__gratitude-card > span { color:#dbeef1; font-size:1.15rem; }.flight-brief__gratitude-card h3 { color:#fff; font-size:1rem; letter-spacing:-.015em; line-height:1.3; text-transform:none; }.flight-brief__gratitude-card p { margin:0; color:rgba(255,255,255,.82); font-size:.8rem; line-height:1.45; }.flight-brief__services-card ul { grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); }.flight-brief__services-card li { display:grid; gap:.2rem; padding:.7rem; border-radius:10px; background:#f1f7f8; }.flight-brief__services-card strong { font-size:.82rem; }.flight-brief__services-card span,.flight-brief__services-card small { color:var(--brief-muted); font-size:.74rem; }.flight-brief__support-card { display:grid; gap:.25rem; }.flight-brief__support-card div { display:flex; flex-wrap:wrap; gap:.75rem; }.flight-brief__support-card a { margin-top:.65rem; }
.flight-brief__timeline li[data-state='current'] .flight-brief__timeline-mark { width:2rem; height:2rem; border:0; border-radius:50%; background:rgba(5,119,140,.08); box-shadow:none; }.flight-brief__timeline li[data-state='current'] .flight-brief__timeline-mark::before { content:none; }.flight-brief__timeline li[data-state='current'] .flight-brief__timeline-mark svg { width:1.5rem; height:1.5rem; fill:#155d78; transform:rotate(-8deg); }
@media (min-width:561px) { .flight-brief__timeline { position:relative; display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:0; margin:0; padding:.8rem 1.2rem 1rem; overflow:visible; background:#f7faf9; }.flight-brief__timeline::before,.flight-brief__timeline::after { position:absolute; top:1.8rem; left:8.33%; z-index:0; height:2px; content:''; }.flight-brief__timeline::before { width:83.34%; background:#d4e0e5; }.flight-brief__timeline::after { width:calc(83.34% * var(--timeline-progress)); background:var(--brief-ready); }.flight-brief__timeline li { position:relative; z-index:1; display:grid; grid-template-rows:2rem auto; justify-items:center; min-width:0; text-align:center; white-space:normal; }.flight-brief__timeline li > span:last-child { display:grid; gap:.08rem; min-width:0; }.flight-brief__timeline-mark { display:grid; width:1.25rem; height:1.25rem; align-self:center; place-items:center; border:1px solid #c6d1d8; border-radius:50%; background:#fff; }.flight-brief__timeline li strong { overflow:hidden; color:var(--brief-ink); font-size:.76rem; font-weight:800; text-overflow:ellipsis; white-space:nowrap; }.flight-brief__timeline li small { margin:0; color:#8494a1; font-size:.68rem; }.flight-brief__timeline li[data-state='current'] .flight-brief__timeline-mark { width:2rem; height:2rem; }.flight-brief__timeline li[data-state='current'] .flight-brief__timeline-mark svg { width:1.5rem; height:1.5rem; } }
@media (min-width:760px) { .flight-brief { grid-template-columns:minmax(0,1.9fr) minmax(260px,1fr); }.flight-brief__timeline,.flight-brief__hero { grid-column:1/-1; }.flight-brief__route-card { order:1; grid-column:1; }.flight-brief__operational-card { order:2; grid-column:2; }.flight-brief__presentation-card { order:3; grid-column:1; }.flight-brief__readiness-card { order:4; grid-column:2; }.flight-brief__preparation-card { order:5; grid-column:1; }.flight-brief__crew-card { order:6; grid-column:2; }.flight-brief__action-card { order:7; grid-column:1; }.flight-brief__support-card { order:8; grid-column:2; }.flight-brief__services-card { order:9; grid-column:1; }.flight-brief__instructions-card { order:10; grid-column:1; }.flight-brief__gratitude-card { order:10; grid-column:2; } }
@media (max-width:980px) and (min-width:561px) { .flight-brief__route { grid-template-columns:minmax(0,1fr) minmax(180px,.48fr) minmax(0,1fr); }.flight-brief__route-line { height:2.6rem; }.flight-brief__route-line > span { padding:0 .85rem; font-size:2.25rem; } }
@media (max-width:560px) { .flight-brief { gap:10px; }.flight-brief__timeline { gap:.8rem; padding:.7rem .8rem; }.flight-brief__timeline li { font-size:.68rem; }.flight-brief__hero { grid-template-columns:1fr; gap:.8rem; padding:1rem; }.flight-brief__hero h1 { font-size:1.45rem; }.flight-brief__aircraft-visual { min-height:0; aspect-ratio:16/9; }.flight-brief__route-card,.flight-brief__presentation-card,.flight-brief__preparation-card,.flight-brief__operational-card,.flight-brief__crew-card,.flight-brief__readiness-card,.flight-brief__action-card,.flight-brief__instructions-card,.flight-brief__gratitude-card,.flight-brief__support-card,.flight-brief__services-card { padding:1rem; }.flight-brief__route { grid-template-columns:minmax(0,1fr) 74px minmax(0,1fr); gap:.3rem; }.flight-brief__route strong { font-size:1.9rem; }.flight-brief__route span:not(.flight-brief__route-line),.flight-brief__route small { font-size:.72rem; }.flight-brief__schedule,.flight-brief__presentation-card dl { grid-template-columns:repeat(2,minmax(0,1fr)); max-width:none; } }
</style>
