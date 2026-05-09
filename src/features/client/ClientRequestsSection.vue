<script setup>
import { computed } from 'vue'
import { formatAirportRoute } from '../../utils/airports'
import { buildClientWorkflowTimeline, normalizeWorkflowLabel } from '../../utils/flightWorkflow'

const props = defineProps({
  requests: { type: Array, required: true },
  latestRequest: { type: Object, default: null },
  matchedAircraft: { type: Array, default: () => [] },
  matchSummary: { type: Object, default: () => ({ eligible: 0, trial: 0, active: 0 }) },
})

defineEmits(['open-concierge'])

function formatRoute(request) {
  return formatAirportRoute(request)
}

const activeStatus = computed(
  () => normalizeWorkflowLabel(props.latestRequest?.workflow_status || props.latestRequest?.status),
)

const requestSignals = computed(() => [
  {
    label: 'Solicitud activa',
    value: props.latestRequest ? `#${props.latestRequest.id}` : 'Sin solicitud',
  },
  {
    label: 'Ruta activa',
    value: props.latestRequest ? formatRoute(props.latestRequest) : 'Pendiente por definir',
  },
  {
    label: 'Salida',
    value: props.latestRequest?.departure_datetime || props.latestRequest?.departure_date || 'Sin fecha',
  },
  {
    label: 'Estado',
    value: activeStatus.value,
  },
])

const timelineSteps = computed(() => {
  return buildClientWorkflowTimeline(activeStatus.value, props.requests.length > 0)
})

const requestMoments = computed(() =>
  props.requests.slice(0, 3).map((request, index) => ({
    id: request.id,
    title: formatRoute(request),
    label: index === 0 ? 'Mas reciente' : index === 1 ? 'Seguimiento' : 'Historial',
    description: normalizeWorkflowLabel(request.workflow_status || request.status),
    departure: request.departure_datetime || request.departure_date || 'Sin fecha',
    passengers: `${request.passengers || 'N/D'} pax`,
  })),
)

const coordinationHighlights = computed(() => [
  {
    title: 'Canal protegido',
    description: 'Todo el seguimiento vive dentro de Sky Group sin exponer contacto directo externo.',
    action: 'Continuar por concierge',
  },
  {
    title: 'Checklist premium',
    description: 'Catering, traslados, NDA y requerimientos especiales quedan amarrados al flujo.',
    action: 'Revisar siguiente paso',
  },
  {
    title: 'Historial ordenado',
    description: 'Tu equipo puede revisar solicitudes activas y cerradas con una lectura mucho mas clara.',
    action: 'Ver historial completo',
  },
])

const eligibleAircraftCards = computed(() =>
  props.matchedAircraft.slice(0, 3).map((item) => ({
    id: item.id,
    model: item.model,
    detail: `${item.capacity || 'N/D'} pax · ${item.range || item.range_km || 'N/D'} km`,
    category: item.category || 'Cabina ejecutiva',
    status: item.status,
    price: item.indicative_price || 'Tarifa privada',
    mainImage: item.main_image || item.image || item.images?.[0]?.image_url || null,
    gallery: (item.gallery_images || item.images || []).filter((image) => image?.image_url).slice(0, 3),
    amenities:
      item.amenity_labels?.length
        ? item.amenity_labels.slice(0, 3)
        : ['Cabina privada', 'Asientos ejecutivos', 'Amenidades premium'],
  })),
)
</script>

<template>
  <div class="client-requests-page">
    <section class="dashboard-hero">
      <div class="hero-center">
        <p class="eyebrow dark-eyebrow">Seguimiento premium</p>
        <h1>Manten tus solicitudes bajo el mismo flujo editorial del portal.</h1>
        <p class="hero-subtitle">
          Revisa estados, proximos movimientos y coordinacion privada con una lectura mas limpia,
          premium y consistente con tu dashboard.
        </p>

        <div class="hero-callout">
          <div class="hero-callout-copy">
            <span class="callout-label">Vista activa</span>
            <strong>
              {{
                latestRequest
                  ? `Solicitud #${latestRequest.id} en ${activeStatus}`
                  : 'Aun no existe una solicitud activa'
              }}
            </strong>
            <p>
              {{
                latestRequest
                  ? 'Tu operacion sigue protegida mientras se validan opciones, servicio y cierre comercial.'
                  : 'Cuando registres una solicitud, aqui aparecera el seguimiento integral de la operacion.'
              }}
            </p>
          </div>

          <button class="hero-action" type="button" @click="$emit('open-concierge')">
            Hablar con concierge
          </button>
        </div>
      </div>
    </section>

    <section class="status-strip">
      <article v-for="item in requestSignals" :key="item.label" class="signal-card">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
      </article>
    </section>

    <section class="editorial-section">
      <div class="editorial-heading">
        <h2>Como avanza una solicitud privada</h2>
        <p>
          Este bloque toma el mismo lenguaje de producto del dashboard para que seguimiento,
          lectura y accion se sientan parte del mismo recorrido.
        </p>
      </div>

      <div class="step-editorial refined-steps">
        <article
          v-for="(step, index) in timelineSteps"
          :key="step.title"
          class="step-row"
          :class="{ done: step.done }"
        >
          <div class="step-index" aria-hidden="true">0{{ index + 1 }}</div>

          <div class="step-copy">
            <span class="step-meta">{{ step.meta }}</span>
            <strong>{{ step.title }}</strong>
            <p>{{ step.description }}</p>
          </div>
        </article>
      </div>
    </section>

    <section class="modes-section">
      <div class="section-heading">
        <h2>Momentos clave de tus ultimas solicitudes</h2>
        <p>
          En vez de una tabla aislada al inicio, primero resumimos el estado de tus movimientos
          mas relevantes con cards faciles de escanear.
        </p>
      </div>

      <div class="modes-grid refined-modes-grid">
        <article v-for="moment in requestMoments" :key="moment.id" class="mode-card">
          <div class="mode-copy">
            <span class="mode-label">{{ moment.label }}</span>
            <h3>{{ moment.title }}</h3>
            <p>{{ moment.description }}</p>
            <div class="mode-meta">
              <span>{{ moment.departure }}</span>
              <span>{{ moment.passengers }}</span>
            </div>
          </div>
        </article>

        <article v-if="!requestMoments.length" class="mode-card empty-mode-card">
          <div class="mode-copy">
            <span class="mode-label">Sin historial</span>
            <h3>No hay solicitudes registradas</h3>
            <p>Cuando inicies una reserva, este espacio mostrara sus momentos principales.</p>
          </div>
        </article>
      </div>
    </section>

    <section class="table-section">
      <div class="section-heading">
        <h2>Historial de vuelos y seguimiento</h2>
        <p>{{ requests.length }} registros disponibles dentro del flujo protegido del cliente.</p>
      </div>

      <div class="request-table">
        <div class="table-row table-head-row">
          <span>Solicitud</span>
          <span>Ruta</span>
          <span>Salida</span>
          <span>Pasajeros</span>
          <span>Estado</span>
        </div>

        <div v-for="request in requests" :key="request.id" class="table-row">
          <span>#{{ request.id }}</span>
          <span>{{ formatRoute(request) }}</span>
          <span>{{ request.departure_datetime || request.departure_date }}</span>
          <span>{{ request.passengers }} pax</span>
          <span class="row-status">{{ normalizeWorkflowLabel(request.workflow_status || request.status) }}</span>
        </div>

        <div v-if="!requests.length" class="empty-row">
          Aun no hay solicitudes registradas.
        </div>
      </div>
    </section>

    <section class="modes-section">
      <div class="section-heading">
        <h2>Matching elegible para esta etapa</h2>
        <p>
          Solo entran aeronaves aprobadas, con documentos validos y en estado activo o trial activo.
        </p>
      </div>

      <div class="status-strip match-strip">
        <article class="signal-card">
          <span>Elegibles</span>
          <strong>{{ matchSummary.eligible }}</strong>
        </article>
        <article class="signal-card">
          <span>Activas</span>
          <strong>{{ matchSummary.active }}</strong>
        </article>
        <article class="signal-card">
          <span>En trial</span>
          <strong>{{ matchSummary.trial }}</strong>
        </article>
        <article class="signal-card">
          <span>Filtro</span>
          <strong>Aprobacion + documentos</strong>
        </article>
      </div>

      <div class="refined-modes-grid">
        <article v-for="item in eligibleAircraftCards" :key="item.id" class="mode-card mode-card--aircraft">
          <div class="aircraft-visual">
            <img
              :src="item.mainImage || 'https://images.unsplash.com/photo-1540962351504-03099e0a754b?auto=format&fit=crop&w=1200&q=82'"
              :alt="item.model"
            />
            <div class="aircraft-visual-copy">
              <span class="mode-label">{{ item.status }}</span>
              <strong>{{ item.category }}</strong>
            </div>
          </div>

          <div class="mode-copy mode-copy--aircraft">
            <h3>{{ item.model }}</h3>
            <p>{{ item.detail }}</p>
            <div class="mode-meta">
              <span>{{ item.price }}</span>
              <span>Galeria aprobada</span>
            </div>

            <div v-if="item.gallery.length" class="aircraft-thumbs">
              <img
                v-for="image in item.gallery"
                :key="image.id"
                :src="image.image_url"
                :alt="image.title || item.model"
              />
            </div>

            <div class="aircraft-amenities">
              <span v-for="amenity in item.amenities" :key="amenity">{{ amenity }}</span>
            </div>
          </div>
        </article>

        <article v-if="!eligibleAircraftCards.length" class="mode-card empty-mode-card">
          <div class="mode-copy">
            <span class="mode-label">Sin opciones</span>
            <h3>No hay aeronaves elegibles ahora mismo</h3>
            <p>El sistema esta protegiendo el matching hasta que existan aprobaciones y documentos validos.</p>
          </div>
        </article>
      </div>
    </section>

    <section class="discovery-section">
      <div class="section-heading">
        <h2>Coordinacion privada dentro de Sky Group</h2>
        <p>
          Conservamos el estilo de bloques editoriales del dashboard para dejar claro que el
          seguimiento tambien forma parte de una experiencia premium.
        </p>
      </div>

      <div class="discovery-grid">
        <article v-for="item in coordinationHighlights" :key="item.title" class="discovery-card">
          <div class="discovery-copy">
            <span class="discovery-badge">{{ item.action }}</span>
            <h3>{{ item.title }}</h3>
            <p>{{ item.description }}</p>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.client-requests-page {
  min-height: 100vh;
  background: #ffffff;
  color: #111111;
}

.dashboard-hero,
.editorial-section,
.modes-section,
.table-section,
.discovery-section {
  padding: 1.5rem clamp(1.25rem, 5vw, 4.5rem);
}

.dashboard-hero {
  display: grid;
  gap: 2rem;
  min-height: 66vh;
  padding-top: 1rem;
  background:
    radial-gradient(circle at top right, rgba(201, 164, 90, 0.12), transparent 18%),
    linear-gradient(180deg, #ffffff 0%, #faf8f2 100%);
}

.hero-center {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 1rem;
  text-align: center;
}

.dark-eyebrow {
  color: #8c6a1f;
}

.hero-center h1,
.editorial-heading h2,
.section-heading h2,
.mode-copy h3,
.discovery-copy h3 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.05em;
}

.hero-center h1 {
  max-width: 14ch;
  font-size: clamp(2.8rem, 7vw, 4.4rem);
  line-height: 0.96;
}

.hero-subtitle,
.editorial-heading p,
.section-heading p,
.step-copy p,
.mode-copy p,
.discovery-copy p,
.hero-callout p {
  color: #5d5d5d;
  line-height: 1.7;
}

.hero-subtitle,
.editorial-heading,
.section-heading {
  max-width: 760px;
}

.hero-subtitle {
  margin: 0;
}

.hero-callout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1rem;
  width: min(100%, 980px);
  padding: 1.25rem;
  border: 1px solid #ebebeb;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.05);
  text-align: left;
}

.hero-callout-copy {
  display: grid;
  gap: 0.35rem;
}

.callout-label,
.step-meta,
.discovery-badge {
  color: #8c6a1f;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-callout strong {
  font-size: 1.15rem;
}

.hero-action {
  min-height: 3.6rem;
  border: 0;
  border-radius: 14px;
  padding: 0 1.35rem;
  color: #ffffff;
  background: #000000;
  font-weight: 800;
}

.status-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
  padding: 0 clamp(1.25rem, 5vw, 4.5rem) 1.2rem;
  margin-top: -1.2rem;
}

.match-strip {
  padding: 0;
  margin-top: 0;
}

.signal-card {
  display: grid;
  gap: 0.4rem;
  padding: 1rem 1.05rem;
  border: 1px solid #ebebeb;
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.05);
}

.signal-card span {
  color: #666666;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.signal-card strong {
  font-size: 1rem;
}

.editorial-section,
.modes-section,
.table-section,
.discovery-section {
  display: grid;
  gap: 1.6rem;
}

.editorial-heading h2,
.section-heading h2 {
  font-size: clamp(2rem, 4vw, 3rem);
  line-height: 1.02;
}

.step-editorial {
  display: grid;
  gap: 1rem;
}

.refined-steps {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.step-row {
  display: grid;
  gap: 1rem;
  padding: 1.15rem;
  border: 1px solid #ebebeb;
  border-radius: 20px;
  background: #fafafa;
}

.step-row.done {
  background: linear-gradient(180deg, #faf6ea 0%, #fafafa 100%);
  border-color: #e7d7ac;
}

.step-index {
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  border-radius: 16px;
  color: #111111;
  background: #f0f0f0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: -0.04em;
}

.step-row.done .step-index {
  background: #f3ead2;
}

.step-copy strong {
  display: block;
  margin-bottom: 0.45rem;
  font-size: 1.15rem;
}

.modes-grid,
.discovery-grid {
  display: grid;
  gap: 1rem;
}

.refined-modes-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.mode-card,
.discovery-card {
  display: grid;
  gap: 1rem;
  padding: 1rem;
  border-radius: 18px;
  background: #f5f5f5;
}

.mode-card--aircraft {
  padding: 0;
  overflow: hidden;
  background: #ffffff;
  border: 1px solid #ebebeb;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.05);
}

.mode-copy,
.discovery-copy {
  display: grid;
  gap: 0.5rem;
}

.mode-copy--aircraft {
  padding: 1rem;
  gap: 0.75rem;
}

.mode-label,
.row-status {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  min-height: 2rem;
  padding: 0 0.7rem;
  border-radius: 999px;
  color: #8c6a1f;
  background: #f3ead2;
  font-size: 0.76rem;
  font-weight: 800;
}

.mode-copy h3,
.discovery-copy h3 {
  font-size: 1.2rem;
}

.mode-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 0.25rem;
}

.mode-meta span {
  padding: 0.45rem 0.7rem;
  border-radius: 999px;
  background: #ffffff;
  color: #222222;
  font-size: 0.82rem;
  font-weight: 700;
}

.aircraft-visual {
  position: relative;
  min-height: 220px;
  background: #efefef;
}

.aircraft-visual img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.aircraft-visual-copy {
  position: absolute;
  inset: auto 1rem 1rem 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.aircraft-visual-copy strong {
  padding: 0.55rem 0.8rem;
  border-radius: 999px;
  color: #ffffff;
  background: rgba(17, 17, 17, 0.72);
  backdrop-filter: blur(12px);
  font-size: 0.78rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.aircraft-thumbs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.6rem;
}

.aircraft-thumbs img {
  width: 100%;
  height: 78px;
  object-fit: cover;
  border-radius: 14px;
  display: block;
}

.aircraft-amenities {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.aircraft-amenities span {
  padding: 0.45rem 0.7rem;
  border-radius: 999px;
  background: #f7f7f7;
  color: #222222;
  font-size: 0.8rem;
  font-weight: 700;
}

.empty-mode-card {
  background: #fafafa;
  border: 1px dashed #d9d9d9;
}

.request-table {
  overflow: hidden;
  border: 1px solid #ebebeb;
  border-radius: 24px;
  background: #fafafa;
}

.table-row,
.empty-row {
  display: grid;
  grid-template-columns: 120px 1.2fr 1fr 120px 220px;
  gap: 1rem;
  align-items: center;
  padding: 1rem 1.1rem;
  background: #ffffff;
}

.table-row + .table-row {
  border-top: 1px solid #ebebeb;
}

.table-head-row {
  color: #666666;
  font-size: 0.8rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: #f6f6f6;
}

.empty-row {
  grid-template-columns: 1fr;
  color: #666666;
}

.discovery-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.discovery-card {
  background: #ffffff;
  border: 1px solid #ebebeb;
}

@media (max-width: 1080px) {
  .status-strip,
  .refined-steps,
  .refined-modes-grid,
  .discovery-grid,
  .table-row,
  .hero-callout,
  .aircraft-thumbs {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .hero-center {
    justify-items: stretch;
    text-align: left;
  }

  .hero-center h1 {
    max-width: none;
  }

  .hero-action {
    width: 100%;
  }

  .aircraft-visual-copy {
    display: grid;
    justify-content: start;
  }
}
</style>
