<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { searchAirports } from '../../lib/airportSearch'
import { normalizeWorkflowLabel } from '../../utils/flightWorkflow'
import { formatAirportLabel, formatAirportOption, formatAirportRoute } from '../../utils/airports'

const props = defineProps({
  access: { type: Object, required: true },
  aircraft: { type: Array, required: true },
  activeOperation: { type: Object, default: null },
  clientDocuments: { type: Array, default: () => [] },
  commercialDocuments: { type: Array, default: () => [] },
  commercialEvents: { type: Array, default: () => [] },
  commercialProfile: { type: Object, default: () => ({}) },
  commercialStatus: { type: Object, default: () => ({}) },
  commercialTimeline: { type: Array, default: () => [] },
  conciergeChat: { type: Object, default: null },
  conciergeLoading: { type: Boolean, default: false },
  conciergeSending: { type: Boolean, default: false },
  latestRequest: { type: Object, default: null },
  metrics: { type: Object, required: true },
  documentStats: { type: Object, default: () => ({ total: 0, approved: 0, pending: 0, needsUpdate: 0 }) },
  loading: { type: Boolean, default: false },
  form: { type: Object, required: true },
  operationLoading: { type: Boolean, default: false },
  paymentSummary: { type: Object, default: () => ({}) },
  profile: { type: Object, default: () => ({}) },
  requests: { type: Array, default: () => [] },
  submitting: { type: Boolean, default: false },
  usingFallbackData: { type: Boolean, default: false },
})

const showAdvanced = ref(false)
const activeAirportField = ref('')
const conciergeDraft = ref('')
const documentType = ref('nda')
const documentTitle = ref('')
const documentNotes = ref('')
const documentVisibility = ref('Privado')
const documentFile = ref(null)
const airportSuggestions = ref({
  origin: [],
  destination: [],
})
const airportLoading = ref({
  origin: false,
  destination: false,
})
const airportSource = ref({
  origin: 'remote',
  destination: 'remote',
})
const debounceTimers = {
  origin: null,
  destination: null,
}
const requestTokens = {
  origin: 0,
  destination: 0,
}

const emit = defineEmits([
  'submit-request',
  'activate-access',
  'open-concierge',
  'review-aircraft',
  'send-concierge-message',
  'save-commercial-profile',
  'toggle-commercial-document',
  'trigger-commercial-action',
  'update-form',
  'update-commercial-field',
  'upload-client-document',
  'update-client-document-status',
  'remove-client-document',
  'download-client-document',
])

const currentRouteLabel = computed(() =>
  props.latestRequest
    ? formatAirportRoute(props.latestRequest)
    : `${formatAirportLabel(props.form, 'origin')} -> ${formatAirportLabel(props.form, 'destination')}`,
)

const shouldShowRouteCaption = computed(() => !currentRouteLabel.value.includes('Pendiente -> Pendiente'))

const currentStatus = computed(
  () => normalizeWorkflowLabel(props.latestRequest?.workflow_status || props.latestRequest?.status),
)

const originSuggestions = computed(() => airportSuggestions.value.origin)
const destinationSuggestions = computed(() => airportSuggestions.value.destination)
const frequentRoutes = computed(() => {
  const seen = new Set()
  const historyRoutes = props.requests
    .map((request) => {
      const origin = request.origin_iata || request.origin_icao || request.origin
      const destination = request.destination_iata || request.destination_icao || request.destination
      const label = `${origin} -> ${destination}`
      return { label, origin, destination }
    })
    .filter((route) => route.origin && route.destination)
    .filter((route) => {
      if (seen.has(route.label)) return false
      seen.add(route.label)
      return true
    })

  return historyRoutes.slice(0, 6)
})

const heroSnapshot = computed(() => {
  const request = props.latestRequest || {}

  return [
    {
      label: 'Solicitud activa',
      value: request.id ? `#${request.id}` : 'Sin solicitud abierta',
    },
    {
      label: 'Estado operativo',
      value: currentStatus.value,
    },
    {
      label: 'Operaciones activas',
      value: String(props.metrics?.operaciones_activas || 0),
    },
    {
      label: 'Historial total',
      value: `${props.metrics?.solicitudes || 0} solicitudes`,
    },
  ]
})

const experienceSignals = computed(() => [
  {
    label: 'Salida sugerida',
    value: props.latestRequest?.departure_datetime || props.form.departure_datetime,
  },
  {
    label: 'Ruta activa',
    value: currentRouteLabel.value,
  },
  {
    label: 'Pasajeros',
    value: `${props.latestRequest?.passengers || props.form.passengers} pax`,
  },
  {
    label: 'Concierge',
    value: props.access?.has_access ? 'Disponible' : 'Disponible bajo solicitud',
  },
])

const accountCards = computed(() => [
  {
    label: 'Cliente',
    value: props.profile?.company_name || props.profile?.name || 'Cuenta privada',
  },
  {
    label: 'Telefono',
    value: props.profile?.phone || props.profile?.telefono || 'Por completar',
  },
  {
    label: 'Correo',
    value: props.profile?.email || 'Por completar',
  },
  {
    label: 'Empresa',
    value: props.profile?.company_name || props.profile?.company || 'Opcional',
  },
  {
    label: 'Metodo de pago',
    value: props.profile?.payment_method || 'Pendiente de configuracion',
  },
  {
    label: 'Privacidad / NDA',
    value: props.access?.has_access ? 'Perfil protegido' : 'Configurable al reservar',
  },
])

const operationsFlow = computed(() => [
  {
    step: '01',
    title: 'Registro y reserva libre',
    description: 'Perfil unico con datos de contacto, empresa, preferencias y capa de privacidad.',
    status: props.access?.has_access ? 'Activo' : 'Pendiente',
  },
  {
    step: '02',
    title: 'Dashboard cliente',
    description: 'Vista central para solicitud activa, historial, membresia, concierge y facturacion.',
    status: 'Disponible',
  },
  {
    step: '03',
    title: 'Nueva solicitud de vuelo',
    description: 'Origen, destino, fecha, pasajeros, cabina, mascotas, catering, equipaje y traslado.',
    status: props.latestRequest ? 'En uso' : 'Listo',
  },
  {
    step: '04',
    title: 'Validacion interna',
    description: 'Operador y admin revisan viabilidad, proveedor, precio, restricciones y documentos.',
    status: props.latestRequest ? 'En validacion' : 'Esperando solicitud',
  },
  {
    step: '05',
    title: 'Concierge privado',
    description: 'Canal protegido para catering, hotel, blindaje, cambios y transporte terrestre.',
    status: props.access?.has_access ? 'Disponible' : 'Opcional',
  },
  {
    step: '06',
    title: 'Cierre comercial',
    description: 'Contrato digital, firma, pago, factura y NDA antes de confirmar la reserva.',
    status: 'Listo para activar',
  },
  {
    step: '07',
    title: 'Pre-operacion',
    description: 'Itinerario, crew briefing, checklist, FBO, tail interno y detalles finales.',
    status: 'Automatizable',
  },
  {
    step: '08',
    title: 'Dia de vuelo',
    description: 'Hora exacta, terminal, concierge, requisitos y tracking premium opcional.',
    status: 'Seguimiento en tiempo real',
  },
  {
    step: '09',
    title: 'Post-vuelo',
    description: 'Historial, factura, feedback, recompra, membresia y opciones recurrentes.',
    status: 'Retencion',
  },
])

const matchingSignals = computed(() => [
  'Aeronaves disponibles',
  'Capacidad y rango',
  'Operadores y proveedor',
  'Costos y margen',
  'FBO y clima',
  'Permisos y restricciones',
])

const clientModules = computed(() => [
  {
    title: 'Solicitudes activas',
    description: 'Cada reserva entra a un flujo controlado hasta llegar a validacion, firma y pago.',
    action: 'Crear o actualizar solicitud',
  },
  {
    title: 'Facturacion y pagos',
    description: 'El cliente permanece dentro del ecosistema para pagar, descargar factura y confirmar.',
    action: 'Preparado para cierre comercial',
  },
  {
    title: 'Historial y recompra',
    description: 'Las rutas frecuentes y operaciones anteriores se convierten en recurrencia.',
    action: 'Reservar de nuevo',
  },
  {
    title: 'Membresia y concierge',
    description: 'La cuenta escala a prioridad premium sin salir del portal.',
    action: 'Hablar con concierge',
  },
])

const commercialSteps = computed(() => [
  {
    title: 'Cierre listo',
    description: `${props.commercialStatus?.completed || 0} de ${props.commercialStatus?.total || 0} puntos cubiertos para cierre comercial.`,
  },
  {
    title: 'Cobro protegido',
    description: props.paymentSummary?.paymentStatus || 'Pendiente de preparacion',
  },
  {
    title: 'Factura y NDA',
    description: props.paymentSummary?.invoiceStatus || 'Pendiente de datos fiscales',
  },
])

const operationMoments = computed(() => props.activeOperation?.timeline || [])
const conciergeMessages = computed(() => props.conciergeChat?.mensajes || [])
const commercialDocumentsReady = computed(
  () => props.commercialDocuments.filter((item) => item.status === 'ready').length,
)
const documentTypeOptions = computed(() => [
  { value: 'nda', label: 'NDA / privacidad' },
  { value: 'identity', label: 'Identidad / autorizacion' },
  { value: 'invoice', label: 'Factura / datos fiscales' },
  { value: 'payment', label: 'Comprobante de pago' },
  { value: 'manifest', label: 'Itinerario / pasajeros' },
  { value: 'support', label: 'Adjunto operativo' },
])

function updateField(field, event) {
  emit('update-form', {
    field,
    value: event.target.value,
  })
}

function updateCommercialField(field, event) {
  const target = event.target
  const value = target.type === 'checkbox' ? target.checked : target.value

  emit('update-commercial-field', {
    field,
    value,
  })
}

function handleDocumentSelection(event) {
  const file = event.target.files?.[0] || null
  documentFile.value = file

  if (file && !documentTitle.value.trim()) {
    documentTitle.value = file.name.replace(/\.[^.]+$/, '')
  }
}

function submitClientDocument() {
  if (!documentFile.value) return

  emit('upload-client-document', {
    type: documentType.value,
    title: String(documentTitle.value || '').trim() || documentFile.value.name.replace(/\.[^.]+$/, ''),
    notes: String(documentNotes.value || '').trim(),
    visibility: documentVisibility.value,
    file_name: documentFile.value.name,
    file_size_label:
      documentFile.value.size >= 1024 * 1024
        ? `${(documentFile.value.size / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.max(1, Math.round(documentFile.value.size / 1024))} KB`,
    request_id: props.latestRequest?.id || null,
  })

  documentType.value = 'nda'
  documentTitle.value = ''
  documentNotes.value = ''
  documentVisibility.value = 'Privado'
  documentFile.value = null
}

function focusAirportField(field) {
  activeAirportField.value = field
}

function clearAirportSuggestions() {
  window.setTimeout(() => {
    activeAirportField.value = ''
  }, 120)
}

function applyAirport(field, airport) {
  const oppositeField = field === 'origin' ? 'destination' : 'origin'
  const codeValue = airport.iata || airport.code

  emit('update-form', { field, value: codeValue })
  emit('update-form', { field: `${field}_iata`, value: airport.iata || '' })
  emit('update-form', { field: `${field}_icao`, value: airport.code || '' })
  emit('update-form', { field: `${field}_airport_name`, value: airport.name || '' })
  emit('update-form', { field: `${field}_airport_city`, value: airport.city || '' })
  emit('update-form', { field: `${field}_airport_country`, value: airport.country || '' })

  if (props.form[oppositeField] === codeValue) {
    emit('update-form', { field: oppositeField, value: '' })
  }

  activeAirportField.value = ''
}

function applyFrequentRoute(route) {
  emit('update-form', { field: 'origin', value: route.origin })
  emit('update-form', { field: 'destination', value: route.destination })
}

function submitConciergeMessage() {
  const message = String(conciergeDraft.value || '').trim()
  if (!message) return
  emit('send-concierge-message', message)
  conciergeDraft.value = ''
}

function scheduleAirportSearch(field, query) {
  if (debounceTimers[field]) {
    window.clearTimeout(debounceTimers[field])
  }

  debounceTimers[field] = window.setTimeout(async () => {
    const token = ++requestTokens[field]
    airportLoading.value[field] = true

    try {
      const result = await searchAirports(query, 6)
      if (requestTokens[field] !== token) return
      airportSuggestions.value[field] = result.items
      airportSource.value[field] = result.source
    } catch {
      if (requestTokens[field] !== token) return
      airportSuggestions.value[field] = []
      airportSource.value[field] = 'remote'
    } finally {
      if (requestTokens[field] === token) {
        airportLoading.value[field] = false
      }
    }
  }, 220)
}

watch(
  () => props.form.origin,
  (value) => {
    scheduleAirportSearch('origin', value)
  },
  { immediate: true },
)

watch(
  () => props.form.destination,
  (value) => {
    scheduleAirportSearch('destination', value)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  Object.values(debounceTimers).forEach((timer) => {
    if (timer) {
      window.clearTimeout(timer)
    }
  })
})
</script>

<template>
  <div class="client-dashboard-page">
    <section class="dashboard-hero">
      <div class="hero-center">
        <p class="eyebrow dark-eyebrow">Sistema cliente operativo</p>
        <h1>Controla toda tu operacion privada desde un solo dashboard</h1>
        <p class="hero-subtitle">
          Este portal ya no vive como una web informativa: concentra captacion, solicitud,
          validacion, concierge, cobro, ejecucion y retencion dentro del mismo ecosistema.
        </p>

        <div v-if="access.has_access" class="hero-snapshot">
          <article v-for="item in heroSnapshot" :key="item.label" class="snapshot-card">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </article>
        </div>

        <p v-if="access.has_access && shouldShowRouteCaption" class="hero-route-caption">
          {{ currentRouteLabel }}
        </p>

        <template v-if="access.has_access">
          <div class="hero-search">
            <label class="search-field search-field--stack">
              <span class="field-icon">O</span>
              <input
                :value="form.origin"
                placeholder="Origen"
                @focus="focusAirportField('origin')"
                @blur="clearAirportSuggestions"
                @input="updateField('origin', $event)"
              />
              <div
                v-if="activeAirportField === 'origin' && originSuggestions.length"
                class="airport-suggestions"
              >
                <div class="airport-search-meta">
                  <span>{{ airportLoading.origin ? 'Buscando aeropuertos...' : airportSource.origin === 'remote' ? 'Resultados conectados al backend' : 'Sugerencias locales de apoyo' }}</span>
                </div>
                <button
                  v-for="airport in originSuggestions"
                  :key="`origin-${airport.code}`"
                  class="airport-option"
                  type="button"
                  @mousedown.prevent="applyAirport('origin', airport)"
                >
                  <strong>{{ formatAirportOption(airport) }}</strong>
                  <span>{{ airport.name }} - {{ airport.code }}</span>
                </button>
              </div>
            </label>

            <label class="search-field search-field--stack">
              <span class="field-icon">D</span>
              <input
                :value="form.destination"
                placeholder="Destino"
                @focus="focusAirportField('destination')"
                @blur="clearAirportSuggestions"
                @input="updateField('destination', $event)"
              />
              <div
                v-if="activeAirportField === 'destination' && destinationSuggestions.length"
                class="airport-suggestions"
              >
                <div class="airport-search-meta">
                  <span>{{ airportLoading.destination ? 'Buscando aeropuertos...' : airportSource.destination === 'remote' ? 'Resultados conectados al backend' : 'Sugerencias locales de apoyo' }}</span>
                </div>
                <button
                  v-for="airport in destinationSuggestions"
                  :key="`destination-${airport.code}`"
                  class="airport-option"
                  type="button"
                  @mousedown.prevent="applyAirport('destination', airport)"
                >
                  <strong>{{ formatAirportOption(airport) }}</strong>
                  <span>{{ airport.name }} · {{ airport.code }}</span>
                </button>
              </div>
            </label>

            <button class="hero-action" type="button" :disabled="submitting" @click="$emit('submit-request')">
              {{ submitting ? 'Consultando...' : 'Ver tarifas sugeridas' }}
            </button>
          </div>

          <div class="quick-routes">
            <span class="quick-routes-label">Autobusquedas frecuentes</span>
            <button
              v-for="route in frequentRoutes"
              :key="route.label"
              class="quick-route-chip"
              type="button"
              @click="applyFrequentRoute(route)"
            >
              {{ route.label }}
            </button>
          </div>

          <div class="hero-meta-row hero-meta-row--four">
            <label class="inline-field">
              <span>Fecha y hora</span>
              <input
                :value="form.departure_datetime"
                type="datetime-local"
                @input="updateField('departure_datetime', $event)"
              />
            </label>

            <label class="inline-field small">
              <span>Pasajeros</span>
              <input :value="form.passengers" type="number" min="1" @input="updateField('passengers', $event)" />
            </label>

            <label class="inline-field">
              <span>Cabina</span>
              <input :value="form.aircraft_type" placeholder="Light, midsize, heavy..." @input="updateField('aircraft_type', $event)" />
            </label>

            <button class="ghost-link-button" type="button" @click="showAdvanced = !showAdvanced">
              {{ showAdvanced ? 'Ocultar operacion' : 'Completar operacion' }}
            </button>
          </div>

          <div v-if="showAdvanced" class="advanced-panel">
            <label class="inline-field">
              <span>Mascotas</span>
              <input :value="form.pets" placeholder="Si / No / Detalles" @input="updateField('pets', $event)" />
            </label>

            <label class="inline-field">
              <span>Catering</span>
              <input :value="form.catering" placeholder="Preferencias a bordo" @input="updateField('catering', $event)" />
            </label>

            <label class="inline-field">
              <span>Equipaje</span>
              <input :value="form.baggage" placeholder="Cantidad o restricciones" @input="updateField('baggage', $event)" />
            </label>

            <label class="inline-field">
              <span>Traslado terrestre</span>
              <input
                :value="form.ground_transport"
                placeholder="Blindado, ejecutivo, hotel..."
                @input="updateField('ground_transport', $event)"
              />
            </label>

            <label class="inline-field inline-field--wide">
              <span>Notas operativas</span>
              <input :value="form.notes" placeholder="Requerimientos adicionales del vuelo" @input="updateField('notes', $event)" />
            </label>
          </div>
        </template>

        <template v-else>
          <div class="inactive-shell">
            <p>Tu cuenta ya puede reservar. Si necesitas mas apoyo, activa beneficios premium o continua por concierge.</p>
            <button class="hero-action" type="button" @click="$emit('activate-access')">
              Ver beneficios premium
            </button>
          </div>
        </template>
      </div>
    </section>

    <section class="status-strip">
      <article v-for="item in experienceSignals" :key="item.label" class="signal-card">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
      </article>
    </section>

    <section class="profile-section">
      <div class="section-heading">
        <h2>Perfil cliente listo para operar</h2>
        <p>
          La cuenta funciona como un expediente vivo: identidad, preferencias, pago y privacidad
          quedan listos para ejecutar operaciones recurrentes.
        </p>
      </div>

      <div class="profile-grid">
        <article v-for="item in accountCards" :key="item.label" class="profile-card">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </article>
      </div>
    </section>

    <section class="editorial-section">
      <div class="editorial-heading">
        <h2>Flujo real del sistema cliente</h2>
        <p>
          El dashboard ya representa el recorrido completo del negocio: captar, procesar,
          validar, coordinar, cobrar, ejecutar y retener.
        </p>
      </div>

      <div class="flow-grid">
        <article v-for="item in operationsFlow" :key="item.step" class="flow-card">
          <div class="flow-step">{{ item.step }}</div>
          <div class="flow-copy">
            <span class="flow-status">{{ item.status }}</span>
            <strong>{{ item.title }}</strong>
            <p>{{ item.description }}</p>
          </div>
        </article>
      </div>
    </section>

    <section class="matching-section">
      <div class="section-heading">
        <h2>Motor de matching y coordinacion premium</h2>
        <p>
          Al solicitar una ruta, el sistema puede evaluar la viabilidad operativa antes de pasar
          a cierre comercial y concierge.
        </p>
      </div>

      <div class="matching-shell">
        <div class="matching-copy">
          <span class="matching-label">Evaluacion interna</span>
          <h3>Lo que el sistema debe revisar por cada solicitud</h3>
          <p>
            No solo buscamos una aeronave. Cruzamos operacion, proveedor, margen, experiencia de
            cabina y restricciones para devolver opciones premium.
          </p>
          <button class="mini-action mini-action-dark" type="button" @click="$emit('open-concierge')">
            Coordinar con concierge
          </button>
        </div>

        <div class="matching-list">
          <span v-for="item in matchingSignals" :key="item" class="matching-pill">{{ item }}</span>
        </div>
      </div>
    </section>

    <section class="modes-section">
      <div class="section-heading">
        <h2>Modulos que monetizan y retienen al cliente</h2>
        <p>
          La experiencia cliente se mueve sobre CRM, operacion, concierge, facturacion y recompra
          para mantener toda la relacion dentro del portal.
        </p>
      </div>

      <div class="modes-grid refined-modes-grid">
        <article v-for="item in clientModules" :key="item.title" class="mode-card">
          <div class="mode-copy">
            <span class="mode-label">{{ item.action }}</span>
            <h3>{{ item.title }}</h3>
            <p>{{ item.description }}</p>
            <button
              class="mini-action"
              type="button"
              @click="item.action === 'Hablar con concierge' ? $emit('open-concierge') : $emit('submit-request')"
            >
              {{ item.action }}
            </button>
          </div>
        </article>
      </div>
    </section>

    <section class="discovery-section">
      <div class="section-heading">
        <h2>Opciones premium para tu ruta</h2>
        <p>
          {{
            loading
              ? 'Actualizando sugerencias premium...'
              : usingFallbackData
                ? `${aircraft.length} opciones de referencia disponibles`
                : `${aircraft.length} aeronaves sugeridas para continuar`
          }}
        </p>
      </div>

      <div class="discovery-grid">
        <article v-for="item in aircraft.slice(0, 4)" :key="item.id || item.code" class="discovery-card">
          <div class="discovery-image">
            <img
              :src="
                item.images?.[0]?.image_url ||
                item.images?.[0]?.url ||
                item.image ||
                'https://images.unsplash.com/photo-1540962351504-03099e0a754b?auto=format&fit=crop&w=1200&q=82'
              "
              :alt="item.model || item.code"
            />
          </div>

          <div class="discovery-copy">
            <span class="discovery-badge">{{ item.status || item.category || 'Verificada' }}</span>
            <h3>{{ item.model || item.code }}</h3>
            <p>
              {{ item.capacity }} - {{ item.range_km || item.range || 'N/D' }} -
              {{ item.cabin_service || 'Cabina premium' }}
            </p>
            <div class="discovery-meta">
              <span>{{ item.indicative_price || 'Tarifa bajo validacion' }}</span>
              <span>ETA {{ item.eta_minutes || item.eta || 'N/D' }}</span>
            </div>
            <button class="mini-action" type="button" @click="$emit('review-aircraft', item)">
              Ver detalle premium
            </button>
          </div>
        </article>
      </div>
    </section>

    <section class="closing-section">
      <div class="section-heading">
        <h2>Cierre comercial, seguridad y post-vuelo</h2>
        <p>
          El cliente no sale del ecosistema: firma, paga, recibe factura, vuela y vuelve a
          reservar desde la misma experiencia.
        </p>
      </div>

      <div class="closing-grid">
        <article v-for="item in commercialSteps" :key="item.title" class="closing-card">
          <span class="closing-label">{{ item.title }}</span>
          <p>{{ item.description }}</p>
        </article>
      </div>

      <div class="commercial-grid">
        <article class="commercial-card commercial-card-wide">
          <div class="commercial-head">
            <div>
              <span class="closing-label">Readiness comercial</span>
              <h3>Preparacion de factura, NDA y cobro dentro del dashboard</h3>
            </div>
            <strong>{{ commercialStatus.progress || 0 }}%</strong>
          </div>

          <p class="live-copy">
            {{ commercialStatus.requestLabel }} - {{ commercialStatus.readinessLabel }} -
            {{ commercialStatus.paymentLabel }}
          </p>

          <div class="commercial-metrics">
            <article class="commercial-metric">
              <span>Checklist</span>
              <strong>{{ commercialDocumentsReady }}/{{ commercialStatus.total || 0 }}</strong>
            </article>
            <article class="commercial-metric">
              <span>Factura</span>
              <strong>{{ commercialStatus.invoiceMode }}</strong>
            </article>
            <article class="commercial-metric">
              <span>Privacidad</span>
              <strong>{{ commercialStatus.ndaMode }}</strong>
            </article>
            <article class="commercial-metric">
              <span>Estimado</span>
              <strong>{{ paymentSummary.estimate || 'Pendiente' }}</strong>
            </article>
          </div>

          <div class="commercial-timeline">
            <article
              v-for="item in commercialTimeline"
              :key="item.id"
              class="commercial-timeline-item"
            >
              <div class="commercial-timeline-copy">
                <span>{{ item.status }}</span>
                <strong>{{ item.title }}</strong>
                <p>{{ item.description }}</p>
              </div>

              <button
                class="mini-action"
                type="button"
                :disabled="item.disabled"
                @click="$emit('trigger-commercial-action', item.id)"
              >
                {{ item.action }}
              </button>
            </article>
          </div>
        </article>

        <article class="commercial-card">
          <div class="commercial-head">
            <div>
              <span class="closing-label">Perfil fiscal</span>
              <h3>Cuenta lista para facturar</h3>
            </div>
          </div>

          <div class="commercial-form">
            <label class="commercial-field">
              <span>Razon social</span>
              <input
                :value="commercialProfile.legal_name"
                type="text"
                placeholder="Empresa o titular"
                @input="updateCommercialField('legal_name', $event)"
              />
            </label>

            <label class="commercial-field">
              <span>RFC / Tax ID</span>
              <input
                :value="commercialProfile.tax_id"
                type="text"
                placeholder="RFC o tax id"
                @input="updateCommercialField('tax_id', $event)"
              />
            </label>

            <label class="commercial-field">
              <span>Correo de facturacion</span>
              <input
                :value="commercialProfile.billing_email"
                type="email"
                placeholder="billing@empresa.com"
                @input="updateCommercialField('billing_email', $event)"
              />
            </label>

            <label class="commercial-field">
              <span>Metodo de pago</span>
              <input
                :value="commercialProfile.payment_method"
                type="text"
                placeholder="Transferencia, tarjeta, corporativo..."
                @input="updateCommercialField('payment_method', $event)"
              />
            </label>

            <label class="commercial-field commercial-field-wide">
              <span>Domicilio fiscal</span>
              <input
                :value="commercialProfile.billing_address"
                type="text"
                placeholder="Direccion fiscal o administrativa"
                @input="updateCommercialField('billing_address', $event)"
              />
            </label>

            <label class="commercial-toggle">
              <input
                :checked="Boolean(commercialProfile.invoice_required)"
                type="checkbox"
                @change="updateCommercialField('invoice_required', $event)"
              />
              <span>Requiere factura en el cierre de esta operacion</span>
            </label>

            <label class="commercial-toggle">
              <input
                :checked="Boolean(commercialProfile.nda_required)"
                type="checkbox"
                @change="updateCommercialField('nda_required', $event)"
              />
              <span>Requiere NDA o capa reforzada de privacidad</span>
            </label>
          </div>

          <button class="hero-action" type="button" @click="$emit('save-commercial-profile')">
            Guardar perfil comercial
          </button>
        </article>

        <article class="commercial-card">
          <div class="commercial-head">
            <div>
              <span class="closing-label">Documentos y cobro</span>
              <h3>Checklist de cierre protegido</h3>
            </div>
          </div>

          <div class="commercial-checklist">
            <article
              v-for="item in commercialDocuments"
              :key="item.id"
              class="document-row"
              :class="{ 'document-row-ready': item.status === 'ready' }"
            >
              <div class="document-copy">
                <span>{{ item.status === 'ready' ? 'Listo' : 'Pendiente' }}</span>
                <strong>{{ item.title }}</strong>
                <p>{{ item.description }}</p>
              </div>

              <button
                class="mini-action"
                type="button"
                @click="$emit('toggle-commercial-document', item.id)"
              >
                {{ item.status === 'ready' ? 'Regresar a revision' : 'Marcar listo' }}
              </button>
            </article>
          </div>

          <div class="payment-breakdown">
            <article class="payment-line">
              <span>Base estimada</span>
              <strong>{{ paymentSummary.baseRate || 'Pendiente' }}</strong>
            </article>
            <article class="payment-line">
              <span>Concierge / privacidad</span>
              <strong>{{ paymentSummary.conciergeFee || 'Pendiente' }}</strong>
            </article>
            <article class="payment-line">
              <span>Impuestos</span>
              <strong>{{ paymentSummary.taxes || 'Pendiente' }}</strong>
            </article>
            <article class="payment-line payment-line-total">
              <span>Total estimado</span>
              <strong>{{ paymentSummary.estimate || 'Pendiente' }}</strong>
            </article>
          </div>

          <div class="timeline-list">
            <article
              v-for="item in commercialEvents.slice(0, 4)"
              :key="item.id"
              class="timeline-item"
            >
              <span>Comercial</span>
              <strong>{{ item.title }}</strong>
              <p>{{ item.description }}</p>
              <small>{{ item.created_at }}</small>
            </article>
          </div>
        </article>
      </div>

      <div class="documents-shell">
        <article class="documents-card documents-card-wide">
          <div class="commercial-head">
            <div>
              <span class="closing-label">Biblioteca documental</span>
              <h3>Adjuntos por solicitud dentro del mismo portal</h3>
            </div>
            <strong>{{ documentStats.total || 0 }}</strong>
          </div>

          <p class="live-copy">
            {{
              latestRequest?.id
                ? `La solicitud #${latestRequest.id} ya puede concentrar NDA, factura, pagos y adjuntos operativos.`
                : 'Carga documentos a tu expediente y quedaran listos para ligarse a la siguiente solicitud.'
            }}
          </p>

          <div class="document-stats-grid">
            <article class="commercial-metric">
              <span>Aprobados</span>
              <strong>{{ documentStats.approved || 0 }}</strong>
            </article>
            <article class="commercial-metric">
              <span>En revision</span>
              <strong>{{ documentStats.pending || 0 }}</strong>
            </article>
            <article class="commercial-metric">
              <span>Actualizar</span>
              <strong>{{ documentStats.needsUpdate || 0 }}</strong>
            </article>
            <article class="commercial-metric">
              <span>Solicitud activa</span>
              <strong>{{ latestRequest?.id ? `#${latestRequest.id}` : 'Sin asignar' }}</strong>
            </article>
          </div>

          <div class="document-library">
            <article
              v-for="item in clientDocuments"
              :key="item.id"
              class="document-library-row"
              :class="`document-library-row--${item.status}`"
            >
              <div class="document-library-copy">
                <span>{{ item.visibility }} - {{ item.status }}</span>
                <strong>{{ item.title }}</strong>
                <p>
                  {{ item.file_name }} - {{ item.file_size_label }} -
                  {{ item.request_id ? `Solicitud #${item.request_id}` : 'Perfil general' }}
                </p>
                <small>{{ item.notes || 'Sin notas adicionales.' }}</small>
              </div>

              <div class="document-actions">
                <button
                  class="mini-action"
                  type="button"
                  @click="$emit('download-client-document', item.id)"
                >
                  Descargar
                </button>
                <button
                  class="mini-action"
                  type="button"
                  @click="$emit('update-client-document-status', item.id)"
                >
                  Cambiar estado
                </button>
                <button
                  class="mini-action"
                  type="button"
                  @click="$emit('remove-client-document', item.id)"
                >
                  Retirar
                </button>
              </div>
            </article>

            <div v-if="!clientDocuments.length" class="timeline-empty">
              Aun no hay documentos ligados a esta solicitud o al expediente cliente.
            </div>
          </div>
        </article>

        <article class="documents-card">
          <div class="commercial-head">
            <div>
              <span class="closing-label">Nuevo adjunto</span>
              <h3>Subir documento protegido</h3>
            </div>
          </div>

          <div class="commercial-form">
            <label class="commercial-field">
              <span>Tipo</span>
              <select :value="documentType" @change="documentType = $event.target.value">
                <option v-for="item in documentTypeOptions" :key="item.value" :value="item.value">
                  {{ item.label }}
                </option>
              </select>
            </label>

            <label class="commercial-field">
              <span>Visibilidad</span>
              <select :value="documentVisibility" @change="documentVisibility = $event.target.value">
                <option value="Privado">Privado</option>
                <option value="Compartido interno">Compartido interno</option>
                <option value="Fiscal">Fiscal</option>
              </select>
            </label>

            <label class="commercial-field commercial-field-wide">
              <span>Titulo</span>
              <input
                :value="documentTitle"
                type="text"
                placeholder="Ejemplo: NDA firmado abril"
                @input="documentTitle = $event.target.value"
              />
            </label>

            <label class="commercial-field commercial-field-wide">
              <span>Adjunto</span>
              <input type="file" @change="handleDocumentSelection" />
            </label>

            <label class="commercial-field commercial-field-wide">
              <span>Notas</span>
              <input
                :value="documentNotes"
                type="text"
                placeholder="Observaciones para operador, admin o facturacion"
                @input="documentNotes = $event.target.value"
              />
            </label>
          </div>

          <p class="live-copy">
            {{
              documentFile
                ? `${documentFile.name} listo para asociarse ${latestRequest?.id ? `a la solicitud #${latestRequest.id}` : 'al expediente general'}.`
                : 'Selecciona un archivo para incorporarlo al flujo documental.'
            }}
          </p>

          <button
            class="hero-action"
            type="button"
            :disabled="!documentFile"
            @click="submitClientDocument"
          >
            Cargar adjunto
          </button>
        </article>
      </div>
    </section>

    <section class="operations-live-section">
      <div class="section-heading">
        <h2>Seguimiento operativo y concierge en vivo</h2>
        <p>
          Cuando una solicitud ya avanza dentro del sistema, aqui concentramos timeline real,
          canal privado y seguimiento operativo sin sacar al cliente del ecosistema.
        </p>
      </div>

      <div class="live-grid">
        <article class="live-card">
          <div class="live-card-head">
            <span class="closing-label">Tracking premium</span>
            <strong>
              {{
                activeOperation?.id
                  ? `Operacion #${activeOperation.id} en ${activeOperation.status || 'seguimiento'}`
                  : 'Sin operacion activa'
              }}
            </strong>
          </div>

          <p class="live-copy">
            {{
              operationLoading
                ? 'Actualizando timeline operativo...'
                : activeOperation?.id
                  ? 'El cliente puede seguir hitos clave de validacion, asignacion y ejecucion.'
                  : 'La operacion aparecera aqui cuando admin u operador asignen la reserva.'
            }}
          </p>

          <div v-if="operationMoments.length" class="timeline-list">
            <article v-for="item in operationMoments" :key="item.id" class="timeline-item">
              <span>{{ item.status || 'actualizacion' }}</span>
              <strong>{{ item.title }}</strong>
              <p>{{ item.description }}</p>
              <small>{{ item.created_at }}</small>
            </article>
          </div>

          <div v-else class="timeline-empty">
            Aun no hay hitos operativos visibles para esta solicitud.
          </div>
        </article>

        <article class="live-card">
          <div class="live-card-head">
            <span class="closing-label">Concierge privado</span>
            <strong>
              {{
                conciergeChat?.id
                  ? `Canal protegido #${conciergeChat.id}`
                  : 'Canal concierge pendiente'
              }}
            </strong>
          </div>

          <p class="live-copy">
            {{
              conciergeLoading
                ? 'Cargando mensajes protegidos...'
                : conciergeChat?.id
                  ? 'Solicita catering, cambios de horario, hotel o traslado terrestre dentro del canal privado.'
                  : 'El chat protegido se activa cuando la solicitud entra al flujo operativo.'
            }}
          </p>

          <div v-if="conciergeMessages.length" class="message-list">
            <article v-for="item in conciergeMessages.slice(-4)" :key="item.id" class="message-item">
              <strong>{{ item.sanitized_message || item.message }}</strong>
              <p v-if="item.has_blocked_content" class="message-warning">
                Se detecto y sanitizo contenido no permitido por anti-broker.
              </p>
              <small>{{ item.created_at }}</small>
            </article>
          </div>

          <div v-else class="timeline-empty">
            Aun no hay mensajes dentro del concierge.
          </div>

          <div class="concierge-compose">
            <textarea
              v-model="conciergeDraft"
              :disabled="!conciergeChat?.id || conciergeSending"
              placeholder="Ejemplo: necesito catering ejecutivo, cambio de horario y traslado blindado."
            ></textarea>

            <button
              class="hero-action"
              type="button"
              :disabled="!conciergeChat?.id || conciergeSending || !conciergeDraft.trim()"
              @click="submitConciergeMessage"
            >
              {{ conciergeSending ? 'Enviando...' : 'Enviar a concierge' }}
            </button>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.client-dashboard-page {
  min-height: 100vh;
  background: #ffffff;
  color: #111111;
}

.dashboard-hero,
.profile-section,
.editorial-section,
.matching-section,
.modes-section,
.discovery-section,
.closing-section,
.operations-live-section {
  padding: 2.2rem clamp(1.25rem, 5vw, 4.5rem);
}

.dashboard-hero {
  display: grid;
  gap: 2rem;
  min-height: 76vh;
  padding-top: 1.5rem;
  background:
    radial-gradient(circle at top right, rgba(201, 164, 90, 0.18), transparent 20%),
    radial-gradient(circle at left 20%, rgba(17, 17, 17, 0.03), transparent 26%),
    linear-gradient(180deg, #ffffff 0%, #faf8f2 100%);
}

.hero-center {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 1.15rem;
  text-align: center;
}

.dark-eyebrow {
  color: #8c6a1f;
}

.hero-center h1,
.editorial-heading h2,
.section-heading h2,
.mode-copy h3,
.discovery-copy h3,
.matching-copy h3 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.05em;
}

.hero-center h1 {
  max-width: 12ch;
  font-size: clamp(3rem, 7vw, 5.05rem);
  line-height: 0.9;
}

.hero-subtitle,
.editorial-heading p,
.section-heading p,
.flow-copy p,
.mode-copy p,
.discovery-copy p,
.inactive-shell p,
.matching-copy p,
.closing-card p {
  color: #5d5d5d;
  line-height: 1.7;
}

.hero-subtitle {
  max-width: 58ch;
  margin: 0;
  font-size: 1.04rem;
}

.hero-route-caption {
  width: min(100%, 1120px);
  margin: -0.15rem 0 0;
  color: #8c6a1f;
  font-size: 0.94rem;
  font-weight: 700;
  text-align: center;
}

.hero-snapshot {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
  width: min(100%, 1120px);
}

.snapshot-card,
.signal-card,
.profile-card,
.closing-card,
.commercial-metric {
  display: grid;
  gap: 0.42rem;
  padding: 1.1rem 1.1rem;
  border: 1px solid rgba(140, 106, 31, 0.12);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 16px 34px rgba(17, 17, 17, 0.04);
  text-align: left;
}

.snapshot-card span,
.signal-card span,
.profile-card span {
  color: #8c6a1f;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.snapshot-card strong,
.signal-card strong,
.profile-card strong {
  font-size: 1.04rem;
  line-height: 1.35;
}

.hero-search {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: 0.85rem;
  width: min(100%, 1120px);
  margin-top: 1rem;
}

.search-field,
.inline-field {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 3.9rem;
  padding: 0 1.1rem;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #ebe3d2;
  box-shadow: 0 10px 24px rgba(17, 17, 17, 0.03);
}

.search-field {
  position: relative;
}

.search-field--stack {
  align-items: center;
}

.search-field input,
.inline-field input {
  width: 100%;
  border: 0;
  padding: 0;
  color: #111111;
  background: transparent;
  outline: none;
}

.field-icon {
  color: #111111;
  font-size: 1rem;
  font-weight: 800;
  flex-shrink: 0;
}

.airport-suggestions {
  position: absolute;
  top: calc(100% + 0.45rem);
  left: 0;
  right: 0;
  z-index: 20;
  display: grid;
  gap: 0.3rem;
  padding: 0.45rem;
  border: 1px solid #e6e1d4;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.12);
}

.airport-search-meta {
  padding: 0.15rem 0.45rem 0.35rem;
}

.airport-search-meta span {
  color: #8c6a1f;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.airport-option {
  display: grid;
  gap: 0.18rem;
  width: 100%;
  padding: 0.75rem 0.8rem;
  border: 0;
  border-radius: 14px;
  color: #111111;
  background: #f8f7f2;
  text-align: left;
}

.airport-option strong {
  font-size: 0.92rem;
}

.airport-option span {
  color: #686868;
  font-size: 0.78rem;
  line-height: 1.35;
}

.quick-routes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  width: min(100%, 1120px);
  align-items: center;
}

.quick-routes-label {
  color: #8c6a1f;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.quick-route-chip {
  min-height: 2.35rem;
  padding: 0 0.95rem;
  border: 1px solid #ece2c7;
  border-radius: 999px;
  color: #111111;
  background: #fffaf0;
  font-size: 0.82rem;
  font-weight: 700;
}

.hero-action {
  min-height: 3.9rem;
  border: 0;
  border-radius: 18px;
  padding: 0 1.45rem;
  color: #ffffff;
  background: linear-gradient(180deg, #111111 0%, #000000 100%);
  font-weight: 800;
  box-shadow: 0 18px 34px rgba(17, 17, 17, 0.14);
}

.hero-action:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.hero-meta-row,
.advanced-panel {
  display: grid;
  gap: 0.85rem;
  width: min(100%, 1120px);
}

.hero-meta-row--four {
  grid-template-columns: minmax(0, 1.3fr) 160px minmax(0, 1fr) auto;
}

.advanced-panel {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.inline-field {
  justify-content: space-between;
}

.inline-field span {
  color: #666666;
  font-size: 0.84rem;
  font-weight: 700;
  white-space: nowrap;
}

.inline-field.small {
  min-width: 0;
}

.inline-field--wide {
  grid-column: 1 / -1;
}

.ghost-link-button,
.mini-action {
  border: 0;
  background: transparent;
  font-weight: 800;
}

.ghost-link-button {
  color: #111111;
  min-height: 3.2rem;
  border-radius: 16px;
  background: #f6f1e6;
  box-shadow: inset 0 0 0 1px #ece2c7;
}

.inactive-shell {
  display: grid;
  gap: 0.8rem;
  width: min(100%, 560px);
  padding: 1.4rem;
  border-radius: 24px;
  background: #f5f2ea;
}

.status-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
  padding: 0 clamp(1.25rem, 5vw, 4.5rem) 1.2rem;
  margin-top: -1.2rem;
}

.signal-card {
  border-color: #ebebeb;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.05);
}

.profile-section,
.editorial-section,
.matching-section,
.modes-section,
.discovery-section,
.closing-section,
.operations-live-section {
  display: grid;
  gap: 1.9rem;
}

.editorial-heading,
.section-heading {
  max-width: 700px;
}

.editorial-heading h2,
.section-heading h2 {
  font-size: clamp(2.15rem, 4vw, 3.15rem);
  line-height: 0.98;
}

.profile-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.1rem;
}

.profile-card {
  border-color: #ebebeb;
}

.flow-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.1rem;
}

.flow-card,
.mode-card,
.discovery-card {
  display: grid;
  gap: 0.9rem;
  padding: 1.15rem;
  border-radius: 24px;
  background: #f8f7f4;
}

.flow-card {
  grid-template-columns: auto 1fr;
  align-items: start;
  border: 1px solid #ece8dc;
  background: linear-gradient(180deg, #ffffff 0%, #fbfaf7 100%);
  box-shadow: 0 14px 28px rgba(17, 17, 17, 0.03);
}

.flow-step {
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  border-radius: 16px;
  color: #111111;
  background: #f3ead2;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  font-size: 0.92rem;
  font-weight: 800;
}

.flow-copy {
  display: grid;
  gap: 0.45rem;
}

.flow-status,
.mode-label,
.discovery-badge,
.matching-label,
.closing-label {
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
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.flow-copy strong {
  font-size: 1.02rem;
  line-height: 1.3;
}

.flow-copy p,
.mode-copy p,
.discovery-copy p,
.commercial-timeline-copy p,
.document-copy p,
.document-library-copy p,
.timeline-item p,
.message-item p {
  display: -webkit-box;
  line-clamp: 3;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.matching-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
  gap: 1.1rem;
  padding: 1.45rem;
  border-radius: 28px;
  border: 1px solid #ebebeb;
  background:
    radial-gradient(circle at top right, rgba(201, 164, 90, 0.16), transparent 28%),
    linear-gradient(180deg, #ffffff 0%, #faf9f5 100%);
  box-shadow: 0 18px 38px rgba(17, 17, 17, 0.04);
}

.matching-copy {
  display: grid;
  gap: 0.75rem;
}

.matching-list {
  display: flex;
  flex-wrap: wrap;
  align-content: start;
  gap: 0.65rem;
}

.matching-pill {
  display: inline-flex;
  align-items: center;
  min-height: 2.4rem;
  padding: 0 0.9rem;
  border-radius: 999px;
  color: #222222;
  background: #ffffff;
  border: 1px solid #ebebeb;
  font-size: 0.88rem;
  font-weight: 700;
}

.modes-grid {
  display: grid;
  gap: 1rem;
}

.refined-modes-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.mode-copy,
.discovery-copy {
  display: grid;
  gap: 0.5rem;
}

.mode-copy h3,
.discovery-copy h3,
.matching-copy h3 {
  font-size: 1.16rem;
  line-height: 1.15;
}

.mini-action {
  width: fit-content;
  min-height: 2.45rem;
  padding: 0 1rem;
  border-radius: 999px;
  color: #111111;
  background: #ffffff;
  box-shadow: inset 0 0 0 1px #ece6d8;
}

.mini-action-dark {
  color: #ffffff;
  background: #111111;
}

.discovery-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1.1rem;
}

.discovery-card {
  padding: 0;
  overflow: hidden;
  background: #ffffff;
  border: 1px solid #ebebeb;
  box-shadow: 0 16px 32px rgba(17, 17, 17, 0.04);
}

.discovery-image {
  min-height: 250px;
  background: #f1f1f1;
}

.discovery-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.discovery-copy {
  padding: 1.2rem;
}

.discovery-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.discovery-meta span {
  padding: 0.4rem 0.7rem;
  border-radius: 999px;
  background: #f7f7f7;
  color: #222222;
  font-size: 0.8rem;
  font-weight: 700;
}

.closing-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.1rem;
}

.closing-card {
  border-color: #ebebeb;
  background: linear-gradient(180deg, #ffffff 0%, #fafafa 100%);
}

.commercial-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr);
  gap: 1.1rem;
}

.commercial-card {
  display: grid;
  gap: 1rem;
  padding: 1.25rem;
  border: 1px solid #ebebeb;
  border-radius: 28px;
  background: linear-gradient(180deg, #ffffff 0%, #fbfaf7 100%);
  box-shadow: 0 16px 34px rgba(17, 17, 17, 0.04);
}

.commercial-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.commercial-head h3 {
  margin: 0.35rem 0 0;
  font-size: 1.15rem;
  line-height: 1.15;
}

.commercial-head strong {
  font-size: 2rem;
  line-height: 1;
}

.commercial-metrics,
.commercial-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
}

.commercial-field,
.commercial-toggle {
  display: grid;
  gap: 0.45rem;
}

.commercial-field input {
  min-height: 3rem;
  width: 100%;
  padding: 0 0.9rem;
  border: 1px solid #e3dccf;
  border-radius: 14px;
  background: #ffffff;
  color: #111111;
}

.commercial-field select {
  min-height: 3rem;
  width: 100%;
  padding: 0 0.9rem;
  border: 1px solid #e3dccf;
  border-radius: 14px;
  background: #ffffff;
  color: #111111;
}

.commercial-field span,
.commercial-toggle span,
.commercial-metric span,
.document-copy span {
  color: #8c6a1f;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.commercial-field-wide {
  grid-column: 1 / -1;
}

.commercial-toggle {
  grid-template-columns: auto 1fr;
  align-items: center;
}

.commercial-toggle input {
  width: 1rem;
  height: 1rem;
  margin: 0.1rem 0 0;
}

.commercial-timeline,
.commercial-checklist {
  display: grid;
  gap: 0.75rem;
}

.commercial-timeline-item,
.document-row {
  display: grid;
  gap: 0.75rem;
  padding: 1rem;
  border-radius: 20px;
  border: 1px solid #ece6d8;
  background: #fffdfa;
}

.document-row-ready {
  background: #f7fbf8;
  border-color: #d8e8df;
}

.commercial-timeline-copy,
.document-copy {
  display: grid;
  gap: 0.3rem;
}

.payment-breakdown {
  display: grid;
  gap: 0.55rem;
}

.payment-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.8rem 0.9rem;
  border-radius: 14px;
  background: #f6f6f6;
}

.payment-line-total {
  background: #111111;
}

.payment-line-total span,
.payment-line-total strong {
  color: #ffffff;
}

.documents-shell {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.8fr);
  gap: 1.1rem;
}

.documents-card {
  display: grid;
  gap: 1rem;
  padding: 1.25rem;
  border: 1px solid #ebebeb;
  border-radius: 28px;
  background: linear-gradient(180deg, #ffffff 0%, #fbfaf7 100%);
  box-shadow: 0 16px 34px rgba(17, 17, 17, 0.04);
}

.document-stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
}

.document-library {
  display: grid;
  gap: 0.75rem;
}

.document-library-row {
  display: grid;
  gap: 0.9rem;
  padding: 1rem;
  border-radius: 18px;
  border: 1px solid #ece6d8;
  background: #fffdfa;
}

.document-library-row--approved {
  border-color: #d8e8df;
  background: #f7fbf8;
}

.document-library-row--needs_update {
  border-color: #f0d4c2;
  background: #fff6f2;
}

.document-library-copy {
  display: grid;
  gap: 0.28rem;
}

.document-library-copy span {
  color: #8c6a1f;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.document-library-copy strong {
  font-size: 1rem;
}

.document-library-copy p,
.document-library-copy small {
  color: #5d5d5d;
  line-height: 1.55;
}

.document-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.live-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.1rem;
}

.live-card {
  display: grid;
  gap: 1rem;
  padding: 1.25rem;
  border: 1px solid #ebebeb;
  border-radius: 28px;
  background: linear-gradient(180deg, #ffffff 0%, #fbfaf7 100%);
  box-shadow: 0 16px 34px rgba(17, 17, 17, 0.04);
}

.live-card-head {
  display: grid;
  gap: 0.45rem;
}

.live-card-head strong {
  font-size: 1.18rem;
}

.live-copy,
.timeline-item p,
.message-item p,
.timeline-empty {
  color: #5d5d5d;
  line-height: 1.65;
}

.timeline-list,
.message-list {
  display: grid;
  gap: 0.7rem;
}

.timeline-item,
.message-item {
  display: grid;
  gap: 0.25rem;
  padding: 0.95rem;
  border-radius: 18px;
  background: #f6f6f6;
}

.timeline-item span {
  color: #8c6a1f;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.timeline-item strong,
.message-item strong {
  font-size: 0.98rem;
}

.timeline-item small,
.message-item small {
  color: #7a7a7a;
  font-size: 0.76rem;
  font-weight: 700;
}

.message-warning {
  color: #8a5b00;
}

.concierge-compose {
  display: grid;
  gap: 0.75rem;
}

.concierge-compose textarea {
  min-height: 138px;
  width: 100%;
  padding: 1rem;
  border: 1px solid #e6e0d3;
  border-radius: 18px;
  resize: vertical;
  font: inherit;
  color: #111111;
  background: #ffffff;
}

.timeline-empty {
  padding: 1rem;
  border-radius: 16px;
  background: #f6f6f6;
}

.profile-section,
.matching-section,
.closing-section,
.operations-live-section {
  position: relative;
}

.profile-section::before,
.matching-section::before,
.closing-section::before,
.operations-live-section::before {
  content: '';
  position: absolute;
  inset: 0 clamp(1.25rem, 5vw, 4.5rem);
  border-radius: 30px;
  background: linear-gradient(180deg, rgba(248, 247, 244, 0.9), rgba(255, 255, 255, 0.75));
  z-index: 0;
}

.profile-section > *,
.matching-section > *,
.closing-section > *,
.operations-live-section > * {
  position: relative;
  z-index: 1;
}

@media (max-width: 1180px) {
  .hero-snapshot,
  .status-strip,
  .profile-grid,
  .flow-grid,
  .refined-modes-grid,
  .discovery-grid,
  .closing-grid,
  .commercial-grid,
  .documents-shell,
  .document-stats-grid,
  .live-grid,
  .matching-shell,
  .hero-search,
  .hero-meta-row--four,
  .advanced-panel,
  .commercial-metrics,
  .commercial-form {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .hero-center {
    justify-items: stretch;
    text-align: left;
  }

  .hero-search,
  .hero-meta-row,
  .advanced-panel,
  .hero-snapshot {
    width: 100%;
  }

  .hero-center h1 {
    max-width: none;
  }

  .hero-route-caption {
    text-align: left;
  }

  .dashboard-hero,
  .profile-section,
  .editorial-section,
  .matching-section,
  .modes-section,
  .discovery-section,
  .closing-section,
  .operations-live-section {
    padding-top: 1.65rem;
    padding-bottom: 1.65rem;
  }

  .hero-action,
  .ghost-link-button {
    width: 100%;
  }
}
</style>
