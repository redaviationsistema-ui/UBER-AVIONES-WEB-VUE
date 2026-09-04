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

  return [
    { label: 'Pago', detail: confirmed ? 'Confirmado' : 'Pendiente', state: confirmed ? 'completed' : 'current' },
    { label: 'Reserva', detail: confirmed ? 'Confirmada' : 'En confirmación', state: confirmed ? 'completed' : 'pending' },
    { label: 'Detalles del vuelo', detail: confirmed ? 'Disponibles' : 'En preparación', state: confirmed ? 'completed' : 'pending' },
    { label: 'Flight Brief', detail: brief.value.visible === true ? 'Actualizado' : 'Disponible al confirmar pago', state: brief.value.visible === true && !terminal && !isCancelled.value ? 'current' : confirmed ? 'completed' : 'pending' },
    { label: 'Preparación', detail: isReadyForDeparture.value ? 'Lista' : operation.value.id ? 'En proceso' : 'Pendiente', state: terminal || isInFlight.value || isLanded.value || isReadyForDeparture.value ? 'completed' : operation.value.id && !isCancelled.value ? 'current' : 'pending' },
    { label: 'Seguimiento', detail: terminal ? 'Finalizado' : isInFlight.value ? 'En curso' : operation.value.id && isReadyForDeparture.value ? 'Disponible' : 'Pendiente', state: terminal ? 'completed' : isInFlight.value || isLanded.value || isCancelled.value ? 'current' : 'pending' },
  ]
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
    ? 'No necesitas realizar ninguna acción por el momento. Nosotros continuamos preparando tu vuelo.'
    : 'No necesitas hacer nada por ahora. Te avisaremos cuando confirmemos dónde y a qué hora debes presentarte.',
)
</script>

<template>
  <article class="flight-brief" aria-labelledby="flight-brief-title">
    <ol class="flight-brief__timeline" aria-label="Progreso del vuelo">
      <li v-for="step in timelineSteps" :key="step.label" :data-state="step.state"><span class="flight-brief__timeline-mark" aria-hidden="true"></span><span><strong>{{ step.label }}</strong><small>{{ step.detail }}</small></span></li>
    </ol>
    <header class="flight-brief__hero">
      <div><span class="flight-brief__eyebrow">Flight Brief · Resumen de tu vuelo</span><h2 id="flight-brief-title">{{ customerPresentation.title }}</h2><p>{{ customerPresentation.description }}</p><strong class="flight-brief__hero-status" :data-ready="isReadyForDeparture">{{ customerPresentation.badge }}</strong></div>
      <div class="flight-brief__aircraft-visual"><img v-if="aircraft.image_url" :src="aircraft.image_url" :alt="`Aeronave ${aircraftModel}`" /><span v-else aria-hidden="true">✈</span></div>
    </header>
    <section class="flight-brief__route-card" aria-labelledby="flight-brief-route-title">
      <div class="flight-brief__section-heading"><h3 id="flight-brief-route-title">Ruta</h3><span>{{ formatDateTime(flight.departure_datetime, { day: '2-digit', month: 'short', year: 'numeric' }) }}</span></div>
      <div class="flight-brief__route"><div><strong>{{ route.departure.code }}</strong><span>{{ route.departure.airport }}</span><small>{{ route.departure.city }}</small></div><span class="flight-brief__route-line" aria-hidden="true">✈</span><div><strong>{{ route.arrival.code }}</strong><span>{{ route.arrival.airport }}</span><small>{{ route.arrival.city }}</small></div></div>
      <dl class="flight-brief__schedule"><div><dt>Salida</dt><dd>{{ formatDateTime(flight.departure_datetime, { hour: 'numeric', minute: '2-digit' }) }}</dd></div><div><dt>Llegada</dt><dd>{{ formatDateTime(flight.arrival_datetime, { hour: 'numeric', minute: '2-digit' }) }}</dd></div><div><dt>Duración</dt><dd>{{ formatDuration(flight.duration_hours) }}</dd></div></dl>
    </section>
    <section class="flight-brief__presentation-card" aria-labelledby="flight-brief-presentation-title">
      <h3 id="flight-brief-presentation-title">Dónde presentarte</h3>
      <strong>{{ textOrFallback(presentation.airport_name, route.departure.airport) }}</strong>
      <span>{{ textOrFallback(presentation.airport_code, route.departure.code) }} · {{ textOrFallback(presentation.city, route.departure.city) }}</span>
      <dl><div><dt>Punto de presentación</dt><dd>{{ presentationLocation }}</dd></div><div><dt>Hora de presentación</dt><dd>{{ presentationTime }}</dd></div><div v-if="presentation.address"><dt>Dirección</dt><dd>{{ presentation.address }}</dd></div></dl>
      <a v-if="presentation.maps_url" :href="presentation.maps_url" target="_blank" rel="noopener noreferrer">Cómo llegar</a>
      <p v-if="presentation.is_complete !== true">Te avisaremos cuando estén confirmados todos los detalles de presentación.</p>
    </section>
    <section class="flight-brief__preparation-card" aria-labelledby="flight-brief-preparation-title">
      <div class="flight-brief__section-heading"><h3 id="flight-brief-preparation-title">Preparación de tu vuelo</h3><strong v-if="checklistHasCounts">Preparación {{ checklistPercentage }}%</strong></div>
      <div class="flight-brief__progress" :aria-valuemax="checklistHasCounts ? 100 : undefined" :aria-valuemin="checklistHasCounts ? 0 : undefined" :aria-valuenow="checklistHasCounts ? checklistPercentage : undefined" :role="checklistHasCounts ? 'progressbar' : undefined"><span :style="{ width: `${checklistHasCounts ? checklistPercentage : 0}%` }"></span></div>
      <p v-if="checklistHasCounts">{{ checklistState.label }}</p><p v-else>{{ checklist.exists ? 'Preparación en curso' : 'Estamos organizando los preparativos del vuelo.' }}</p><strong class="flight-brief__checklist-state" :data-state="checklistState.state">{{ checklistState.label }}</strong>
    </section>
    <section class="flight-brief__operational-card" aria-labelledby="flight-brief-operational-title"><h3 id="flight-brief-operational-title">Qué está listo</h3><ul><li v-for="item in operationalItems" :key="item.label" :data-state="item.state"><span aria-hidden="true"></span>{{ item.label }}</li></ul></section>
    <section class="flight-brief__crew-card" aria-labelledby="flight-brief-crew-title"><h3 id="flight-brief-crew-title">Tripulación</h3><span>Sobrecargo</span><strong>{{ crew.assigned ? textOrFallback(crew.visible_name, 'Asignación en proceso') : 'Sin asignación' }}</strong><small :data-state="crewState.state">{{ crewState.detail }}</small></section>
    <section class="flight-brief__readiness-card" aria-labelledby="flight-brief-readiness-title"><span>Próximo paso</span><h3 id="flight-brief-readiness-title" :data-ready="isReadyForDeparture">{{ customerPresentation.title }}</h3><p>{{ customerPresentation.description }}</p><button type="button" :disabled="!operation.id || !isReadyForDeparture && !isInFlight && !isLanded && !isCompleted" @click="$emit('view-tracking')">{{ isInFlight ? 'Seguir mi vuelo' : isCompleted ? 'Ver resumen del vuelo' : isReadyForDeparture ? 'Ver seguimiento' : 'Seguimiento aún no disponible' }}</button></section>
    <section class="flight-brief__action-card" aria-labelledby="flight-brief-action-title"><h3 id="flight-brief-action-title">¿Necesitas hacer algo?</h3><p>{{ customerAction }}</p></section>
    <section v-if="hasRequestedServices" class="flight-brief__services-card" aria-labelledby="flight-brief-services-title"><h3 id="flight-brief-services-title">Servicios de tu vuelo</h3><ul><li v-for="service in requestedServices" :key="service.key"><strong>{{ service.label }}</strong><span>Solicitado</span><small v-if="service.description">{{ service.description }}</small></li></ul></section>
    <section v-if="presentation.instructions" class="flight-brief__instructions-card" aria-labelledby="flight-brief-instructions-title"><h3 id="flight-brief-instructions-title">Antes de tu vuelo</h3><p>{{ presentation.instructions }}</p></section>
    <section v-if="hasSupport" class="flight-brief__support-card" aria-labelledby="flight-brief-support-title"><h3 id="flight-brief-support-title">¿Necesitas ayuda?</h3><strong v-if="support.name">{{ support.name }}</strong><div><a v-if="support.phone" :href="`tel:${support.phone}`">Llamar</a><a v-if="support.whatsapp" :href="support.whatsapp" target="_blank" rel="noopener noreferrer">WhatsApp</a><a v-if="support.email" :href="`mailto:${support.email}`">Correo</a></div></section>
    <aside class="flight-brief__brand-card"><strong>Viaja con tranquilidad.</strong><span>{{ isReadyForDeparture ? 'Todo está listo para que disfrutes tu vuelo.' : 'Nosotros nos encargamos de coordinar los detalles de tu vuelo.' }}</span></aside>
  </article>
</template>

<style scoped>
.flight-brief { --brief-ink:#10293f; --brief-muted:#607489; --brief-line:#dce6ec; --brief-sand:#f8f3e9; --brief-ready:#187456; --brief-active:#05778c; display:grid; gap:1px; overflow:hidden; border:1px solid rgba(18,50,72,.14); border-radius:24px; background:var(--brief-line); box-shadow:0 20px 42px rgba(20,48,68,.09); color:var(--brief-ink); }
.flight-brief > * { background:#fffdf9; }.flight-brief__timeline { display:flex; gap:.65rem; margin:0; padding:1rem 1.35rem; overflow-x:auto; list-style:none; background:#f6f8f7; }.flight-brief__timeline li { display:flex; align-items:center; gap:.38rem; flex:0 0 auto; color:var(--brief-muted); font-size:.7rem; white-space:nowrap; }.flight-brief__timeline li strong,.flight-brief__timeline li small { display:block; }.flight-brief__timeline li strong { font-weight:800; }.flight-brief__timeline li small { margin-top:.08rem; color:#8494a1; font-size:.62rem; font-weight:650; }.flight-brief__timeline-mark,.flight-brief__operational-card li > span { display:inline-grid; width:1rem; height:1rem; place-items:center; border:1px solid #afbdc7; border-radius:50%; }.flight-brief__timeline li[data-state='completed'] .flight-brief__timeline-mark,.flight-brief__operational-card li[data-state='completed'] > span { border-color:var(--brief-ready); background:var(--brief-ready); }.flight-brief__timeline li[data-state='completed'] .flight-brief__timeline-mark::after,.flight-brief__operational-card li[data-state='completed'] > span::after { color:#fff; content:'✓'; font-size:.65rem; }.flight-brief__timeline li[data-state='current'] .flight-brief__timeline-mark,.flight-brief__operational-card li[data-state='current'] > span { border:3px solid var(--brief-active); }
.flight-brief__hero { display:grid; grid-template-columns:minmax(0,1fr) minmax(120px,.42fr); gap:1rem; padding:1.6rem; background:radial-gradient(circle at 90% 15%,rgba(85,170,190,.34),transparent 34%),linear-gradient(135deg,#fffaf1,var(--brief-sand)); }.flight-brief__eyebrow,.flight-brief h3,.flight-brief__readiness-card > span { color:var(--brief-muted); font-size:.71rem; font-weight:850; letter-spacing:.12em; text-transform:uppercase; }.flight-brief__hero h2 { max-width:19ch; margin:.72rem 0 0; font-family:Georgia,'Times New Roman',serif; font-size:clamp(1.65rem,4vw,2.3rem); letter-spacing:-.045em; line-height:1.03; }.flight-brief__hero p { margin:.7rem 0 0; color:var(--brief-muted); font-size:.9rem; }.flight-brief__hero-status { display:inline-flex; margin-top:1.2rem; padding:.45rem .65rem; border-radius:999px; background:rgba(5,119,140,.1); color:#075f70; font-size:.72rem; text-transform:uppercase; }.flight-brief__hero-status[data-ready='true'] { background:rgba(24,116,86,.12); color:var(--brief-ready); }.flight-brief__aircraft-visual { display:grid; min-height:132px; place-items:center; overflow:hidden; border-radius:17px; background:linear-gradient(145deg,#13334b,#357a89); color:#e9f8f8; font-size:3rem; }.flight-brief__aircraft-visual img { width:100%; height:100%; object-fit:cover; }
.flight-brief__route-card,.flight-brief__presentation-card,.flight-brief__preparation-card,.flight-brief__operational-card,.flight-brief__crew-card,.flight-brief__readiness-card,.flight-brief__brand-card,.flight-brief__action-card,.flight-brief__instructions-card,.flight-brief__support-card { padding:1.35rem; }.flight-brief__section-heading { display:flex; align-items:baseline; justify-content:space-between; gap:1rem; }.flight-brief h3 { margin:0; }.flight-brief__section-heading > span,.flight-brief__section-heading > strong { color:var(--brief-active); font-size:.78rem; font-weight:800; }.flight-brief__route { display:grid; grid-template-columns:minmax(0,1fr) 42px minmax(0,1fr); align-items:center; gap:.5rem; margin-top:1.2rem; }.flight-brief__route > div:last-child { text-align:right; }.flight-brief__route strong { display:block; font-size:clamp(1.42rem,4vw,2rem); letter-spacing:-.04em; }.flight-brief__route span:not(.flight-brief__route-line),.flight-brief__route small { display:block; overflow:hidden; margin-top:.2rem; color:var(--brief-muted); font-size:.76rem; text-overflow:ellipsis; white-space:nowrap; }.flight-brief__route-line { display:grid; height:1.8rem; place-items:center; color:var(--brief-active); }.flight-brief__schedule,.flight-brief__presentation-card dl { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.45rem; margin:1.35rem 0 0; }.flight-brief__schedule div,.flight-brief__presentation-card dl div { padding-top:.7rem; border-top:1px solid var(--brief-line); }.flight-brief__schedule dt,.flight-brief__presentation-card dt { color:var(--brief-muted); font-size:.68rem; text-transform:uppercase; }.flight-brief__schedule dd,.flight-brief__presentation-card dd { margin:.24rem 0 0; font-size:.8rem; font-weight:750; }.flight-brief__presentation-card { background:#f1f7f8; }.flight-brief__presentation-card > strong { display:block; margin-top:.8rem; }.flight-brief__presentation-card > span,.flight-brief__presentation-card > p { color:var(--brief-muted); font-size:.82rem; }.flight-brief__presentation-card > a,.flight-brief__support-card a { display:inline-flex; margin-top:1rem; color:var(--brief-active); font-size:.82rem; font-weight:800; }.flight-brief__presentation-card > p { margin:.8rem 0 0; }.flight-brief__action-card,.flight-brief__instructions-card { background:#f9fbfb; }.flight-brief__action-card p,.flight-brief__instructions-card p { margin:.7rem 0 0; color:var(--brief-muted); font-size:.84rem; line-height:1.5; }.flight-brief__support-card { display:grid; gap:.5rem; }.flight-brief__support-card div { display:flex; flex-wrap:wrap; gap:.75rem; }.flight-brief__support-card a { margin-top:0; }
.flight-brief__progress { overflow:hidden; height:.58rem; margin-top:1rem; border-radius:999px; background:#e1e9ec; }.flight-brief__progress span { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg,var(--brief-active),#45aaae); transition:width 220ms ease; }.flight-brief__preparation-card p { margin:.65rem 0 0; color:var(--brief-muted); font-size:.84rem; }.flight-brief__checklist-state { display:inline-block; margin-top:.8rem; color:var(--brief-muted); font-size:.78rem; }.flight-brief__checklist-state[data-state='completed'] { color:var(--brief-ready); }.flight-brief__checklist-state[data-state='current'] { color:var(--brief-active); }.flight-brief__operational-card ul,.flight-brief__services-card ul { display:grid; gap:.72rem; margin:1rem 0 0; padding:0; list-style:none; }.flight-brief__operational-card li { display:flex; align-items:center; gap:.55rem; color:#405568; font-size:.86rem; font-weight:700; }.flight-brief__crew-card { display:grid; gap:.28rem; background:#f9fbfb; }.flight-brief__crew-card > span { margin-top:.65rem; color:var(--brief-muted); font-size:.78rem; }.flight-brief__crew-card strong { font-size:1rem; }.flight-brief__crew-card small { color:var(--brief-muted); font-size:.78rem; }.flight-brief__crew-card small[data-state='completed'] { color:var(--brief-ready); font-weight:750; }.flight-brief__crew-card small[data-state='current'] { color:var(--brief-active); font-weight:750; }.flight-brief__services-card ul { grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); }.flight-brief__services-card li { display:grid; gap:.2rem; padding:.65rem; border-radius:12px; background:#f1f7f8; }.flight-brief__services-card strong { font-size:.82rem; }.flight-brief__services-card span,.flight-brief__services-card small { color:var(--brief-muted); font-size:.74rem; }.flight-brief__readiness-card { display:grid; gap:.55rem; background:var(--brief-ink); color:#fff; }.flight-brief__readiness-card > span { color:rgba(255,255,255,.63); }.flight-brief__readiness-card h3 { color:#fff; font-size:1rem; letter-spacing:normal; line-height:1.35; text-transform:none; }.flight-brief__readiness-card h3[data-ready='true'] { color:#9ce1c4; }.flight-brief__readiness-card p { margin:0; color:rgba(255,255,255,.74); font-size:.82rem; line-height:1.45; }.flight-brief__readiness-card button { justify-self:start; margin-top:.5rem; padding:.68rem .95rem; border:1px solid rgba(255,255,255,.55); border-radius:999px; background:transparent; color:#fff; font:inherit; font-size:.84rem; font-weight:800; }.flight-brief__readiness-card button:hover,.flight-brief__readiness-card button:focus-visible { background:#fff; color:var(--brief-ink); }.flight-brief__readiness-card button:disabled { cursor:not-allowed; opacity:.48; }.flight-brief__brand-card { display:grid; gap:.35rem; background:linear-gradient(135deg,#e6f0eb,#f6f2e9); }.flight-brief__brand-card strong { font-family:Georgia,'Times New Roman',serif; font-size:1.1rem; }.flight-brief__brand-card span { color:var(--brief-muted); font-size:.82rem; }
@media (min-width:720px) { .flight-brief { grid-template-columns:minmax(0,1.85fr) minmax(250px,1fr); }.flight-brief__timeline,.flight-brief__hero,.flight-brief__route-card,.flight-brief__presentation-card,.flight-brief__brand-card { grid-column:1 / -1; }.flight-brief__route-card { padding:1.55rem; }.flight-brief__preparation-card,.flight-brief__crew-card { border-top:1px solid var(--brief-line); } }
@media (min-width:1050px) { .flight-brief { grid-template-columns:minmax(0,1.85fr) minmax(280px,1fr); }.flight-brief__route-card,.flight-brief__presentation-card { grid-column:1 / -1; }.flight-brief__preparation-card,.flight-brief__crew-card,.flight-brief__services-card,.flight-brief__action-card,.flight-brief__instructions-card { grid-column:1; }.flight-brief__operational-card,.flight-brief__readiness-card,.flight-brief__support-card { grid-column:2; }.flight-brief__brand-card { grid-column:1 / -1; } }
@media (max-width:420px) { .flight-brief__hero,.flight-brief__route-card,.flight-brief__presentation-card,.flight-brief__preparation-card,.flight-brief__operational-card,.flight-brief__crew-card,.flight-brief__readiness-card,.flight-brief__brand-card,.flight-brief__action-card,.flight-brief__instructions-card,.flight-brief__support-card { padding:1.15rem; }.flight-brief__hero { grid-template-columns:minmax(0,1fr) 96px; }.flight-brief__aircraft-visual { min-height:105px; }.flight-brief__schedule,.flight-brief__presentation-card dl { grid-template-columns:1fr; } }
</style>
