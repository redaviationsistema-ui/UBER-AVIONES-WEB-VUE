<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ActiveTrips from './ActiveTrips.vue'
import ClientTopNav from './ClientTopNav.vue'
import ConciergeFloatingButton from './ConciergeFloatingButton.vue'
import DestinationCards from './DestinationCards.vue'
import FlightSearchHero from './FlightSearchHero.vue'
import MembershipBanner from './MembershipBanner.vue'
import MembershipStatusBar from './MembershipStatusBar.vue'
import {
  createClientFlightRequest,
  getClientDestinations,
  getClientMembershipPlans,
  getClientTrips,
  requestConcierge,
  searchClientFlights,
} from './clientBookingApi'
import { useAuthStore } from '../../stores/auth'
import { useUiStore } from '../../stores/ui'

const props = defineProps({
  section: { type: String, required: true },
})

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()

const tripType = ref('Ida')
const selectedFlightPackage = ref('')
const supportDraft = ref('')
const profileMenuOpen = ref(false)
const searching = ref(false)
const loadingServerData = ref(false)
const serverSearchError = ref('')
const featuredDestinations = ref([])
const membershipPlans = ref([])
const aircraftOptions = ref([])
const reservations = ref([])
const submittedItinerary = ref(null)
const activeResultFilter = ref('recommended')

const searchForm = reactive({
  origin: '',
  destination: '',
  departureDate: '',
  departureTime: '',
  returnDate: '',
  returnTime: '',
  passengers: '',
  preference: '',
  legs: [
    { origin: '', destination: '', date: '', time: '' },
    { origin: '', destination: '', date: '', time: '' },
  ],
})

const topNavItems = [
  { label: 'Reservar', section: 'reservar' },
  { label: 'Membresias', section: 'membresia' },
  { label: 'Mis vuelos', section: 'viajes' },
]
const mobileNavItems = [
  { label: 'Reservar', section: 'reservar' },
]

const activeMembership = computed(
  () =>
    auth.user?.membership ||
    auth.user?.user_membership ||
    auth.user?.active_membership ||
    auth.user?.activeSuscripcion?.plan ||
    auth.user?.active_suscripcion?.plan ||
    auth.access?.subscription ||
    null,
)
const activePlan = computed(
  () =>
    activeMembership.value?.name ||
    activeMembership.value?.membership?.name ||
    auth.user?.activeSuscripcion?.plan?.name ||
    auth.user?.active_suscripcion?.plan?.name ||
    '',
)

const statusCards = computed(() => {
  if (!activeMembership.value) return []

  return [
    ['Tu acceso', activePlan.value || activeMembership.value.status || ''],
    ['Beneficio disponible', activeMembership.value.remaining_itineraries || activeMembership.value.remaining_quotes || ''],
    ['Siguiente paso', activeMembership.value.next_step || activeMembership.value.upsell_message || ''],
  ].filter(([, value]) => value !== '')
})

const trustSignals = ref(['Operadores verificados', 'Asesor privado', 'Reserva segura'])
const timeline = computed(() => [])

const selectedAircraft = computed(
  () => aircraftOptions.value.find((item) => String(item.id) === String(route.params.id)) || null,
)
const itineraryLegs = computed(() => {
  if (tripType.value === 'Ida') {
    return [
      {
        origin: searchForm.origin,
        destination: searchForm.destination,
        date: searchForm.departureDate,
        time: searchForm.departureTime,
      },
    ]
  }

  if (tripType.value === 'Redondo') {
    return [
      {
        origin: searchForm.origin,
        destination: searchForm.destination,
        date: searchForm.departureDate,
        time: searchForm.departureTime,
      },
      {
        origin: searchForm.destination,
        destination: searchForm.origin,
        date: searchForm.returnDate,
        time: searchForm.returnTime,
      },
    ]
  }

  return searchForm.legs.filter((leg) => leg.origin && leg.destination && leg.date && leg.time)
})
const itineraryDays = computed(() => {
  const dates = itineraryLegs.value
    .map((leg) => new Date(`${leg.date}T00:00:00`))
    .filter((date) => !Number.isNaN(date.getTime()))

  if (dates.length < 2) return 0

  const first = dates[0]
  const last = dates[dates.length - 1]
  return Math.max(Math.round((last - first) / 86400000), 0)
})
const estimatedTotal = computed(() => {
  return aircraftOptions.value[0]?.final_price || ''
})
const estimatedTime = computed(() => {
  return aircraftOptions.value[0]?.time || ''
})
const suggestedCabin = computed(() => {
  return aircraftOptions.value[0]?.cabin || ''
})
const itinerarySummary = computed(() => ({
  tripType: tripType.value,
  legs: itineraryLegs.value,
  days: itineraryDays.value,
  passengers: searchForm.passengers,
  preference: searchForm.preference,
  cabin: suggestedCabin.value,
  estimatedTime: estimatedTime.value,
  estimatedTotal: estimatedTotal.value,
  membership: activePlan.value,
  maxLegs: activeMembership.value?.max_legs || activeMembership.value?.membership?.max_legs || null,
}))
const activeItinerarySummary = computed(() => submittedItinerary.value || itinerarySummary.value)
const tripTypeKey = computed(() => {
  const keys = {
    Ida: 'one_way',
    Redondo: 'round_trip',
    'Multi-destino': 'multi_city',
  }

  return keys[tripType.value] || 'one_way'
})
const routeId = computed(() => String(route.params.id || ''))
const selectedTripId = computed(() => String(route.params.id || ''))
const activeSection = computed(() => {
  if (['viajes', 'mis-vuelos', 'historial', 'contrato', 'pago', 'reserva-confirmada'].includes(props.section)) {
    return 'viajes'
  }
  if (['membresia', 'comparar', 'soporte'].includes(props.section)) return 'membresia'
  if (props.section === 'perfil') return 'perfil'
  return 'reservar'
})
const bookingStep = computed(() => {
  if (['resultados', 'aeronave', 'paquete-vuelo', 'reserva'].includes(props.section)) return props.section
  return 'reservar'
})
const userFirstName = computed(() => {
  const rawName = auth.user?.name || auth.user?.company_name || auth.userName || 'Kevin'
  return String(rawName).trim().split(/\s+/)[0] || 'Kevin'
})
const packageFee = computed(() => {
  const selectedPlan = membershipPlans.value.find((plan) => plan.name === selectedFlightPackage.value)
  return selectedPlan?.price || selectedPlan?.monthly_price || ''
})
const quotesRemaining = computed(() =>
  Number(
    activeMembership.value?.remaining_itineraries ||
      activeMembership.value?.remaining_quotes ||
      activeMembership.value?.max_requests ||
      0,
  ),
)
const reservationsRemaining = computed(() =>
  Number(activeMembership.value?.remaining_reservations || 0),
)
const recommendedAircraftId = computed(() => String(aircraftOptions.value[0]?.id || ''))
const resultFilterOptions = [
  { key: 'economy', label: 'Económico' },
  { key: 'fast', label: 'Rápido' },
  { key: 'premium', label: 'Premium' },
  { key: 'recommended', label: 'Recomendado' },
]
const filteredAircraftOptions = computed(() => {
  const options = aircraftOptions.value.map((aircraft, index) => ({ aircraft, index }))

  if (activeResultFilter.value === 'economy') {
    return options
      .sort(
        (current, next) =>
          aircraftPriceValue(current.aircraft) - aircraftPriceValue(next.aircraft) ||
          current.index - next.index,
      )
      .map(({ aircraft }) => aircraft)
  }

  if (activeResultFilter.value === 'fast') {
    return options
      .sort(
        (current, next) =>
          aircraftTimeValue(current.aircraft) - aircraftTimeValue(next.aircraft) ||
          current.index - next.index,
      )
      .map(({ aircraft }) => aircraft)
  }

  if (activeResultFilter.value === 'premium') {
    return options
      .sort(
        (current, next) =>
          aircraftPremiumValue(next.aircraft) - aircraftPremiumValue(current.aircraft) ||
          aircraftPriceValue(current.aircraft) - aircraftPriceValue(next.aircraft) ||
          current.index - next.index,
      )
      .map(({ aircraft }) => aircraft)
  }

  return options.map(({ aircraft }) => aircraft)
})

function aircraftVisualStyle(imageUrl) {
  if (!imageUrl) {
    return {}
  }

  return {
    backgroundImage: `linear-gradient(135deg, rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.45)), url('${imageUrl}')`,
  }
}

function airportDisplayName(code = '') {
  const normalizedCode = String(code || '').trim().toUpperCase()
  if (!normalizedCode) return 'Ruta por confirmar'

  const destination = featuredDestinations.value.find(
    (item) => String(item.code || '').trim().toUpperCase() === normalizedCode,
  )

  return destination?.city || destination?.name || normalizedCode
}

function formatTravelDate(date = '', time = '') {
  if (!date) return 'Fecha por confirmar'

  const rawTime = time || '09:00'
  const parsed = new Date(`${date}T${rawTime}`)
  if (Number.isNaN(parsed.getTime())) return [date, time].filter(Boolean).join(' · ')

  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
}

function formatPassengerCopy(value) {
  const amount = Number(value || 0)
  if (!amount) return 'Vuelo privado'
  return `${amount} ${amount === 1 ? 'pasajero' : 'pasajeros'}`
}

function itineraryHeadline(summary) {
  const firstLeg = summary?.legs?.[0]
  if (!firstLeg) return 'Tu vuelo privado'

  return `${airportDisplayName(firstLeg.origin)} → ${airportDisplayName(firstLeg.destination)}`
}

function itineraryDateLine(summary) {
  const firstLeg = summary?.legs?.[0]
  if (!firstLeg) return 'Fecha por confirmar'

  return formatTravelDate(firstLeg.date, firstLeg.time)
}

function recommendationBadge(aircraft, index) {
  if (index === 0) return 'Recomendado'
  if (aircraft.priority) return 'Prioridad'
  if (aircraft.response_time) return 'Respuesta rapida'
  if (aircraft.capacity && Number(aircraft.capacity) >= 8) return 'Premium'
  return 'Opcion verificada'
}

function recommendationNote(aircraft, index) {
  if (index === 0) return 'Equilibrio ideal entre cabina, disponibilidad y experiencia privada.'
  if (aircraft.response_time) return `Respuesta estimada ${aircraft.response_time}.`
  if (aircraft.amenities?.length) return 'Cabina ejecutiva configurada para una experiencia privada.'
  return 'Selección sujeta a confirmación ejecutiva.'
}

function aircraftPriceCopy(aircraft) {
  if (aircraft.final_price) return `Desde ${aircraft.final_price}`
  return 'Cotización inmediata'
}

function aircraftPriceValue(aircraft) {
  const explicitPrice = Number(aircraft.total || aircraft.price || aircraft.estimated_price || 0)
  if (explicitPrice) return explicitPrice

  const rawPrice = String(aircraft.final_price || '').replace(/[^\d.,]/g, '')
  if (!rawPrice) return Number.MAX_SAFE_INTEGER

  const normalizedPrice = rawPrice.replace(/,/g, '')
  const parsedPrice = Number(normalizedPrice)
  return Number.isFinite(parsedPrice) ? parsedPrice : Number.MAX_SAFE_INTEGER
}

function aircraftTimeValue(aircraft) {
  const explicitHours = Number(aircraft.estimated_hours || aircraft.billable_hours || 0)
  if (explicitHours) return explicitHours

  const rawTime = String(aircraft.time || aircraft.flight_time || '')
  const hours = Number(rawTime.match(/(\d+(?:\.\d+)?)\s*h/i)?.[1] || 0)
  const minutes = Number(rawTime.match(/(\d+(?:\.\d+)?)\s*m/i)?.[1] || 0)
  const totalMinutes = hours * 60 + minutes
  return totalMinutes || Number.MAX_SAFE_INTEGER
}

function aircraftPremiumValue(aircraft) {
  const cabin = String(aircraft.cabin || aircraft.category || '').toLowerCase()
  const capacity = Number(aircraft.capacity || 0)
  const premiumCabin = ['premium', 'heavy', 'super midsize', 'large', 'long range', 'vip', 'elite'].some((term) =>
    cabin.includes(term),
  )

  return capacity + (premiumCabin ? 20 : 0)
}

function aircraftShortMeta(aircraft) {
  return [
    aircraft.cabin || 'Jet privado',
    aircraft.capacity ? `${aircraft.capacity} pasajeros` : '',
    estimatedFlightTime(aircraft),
  ].filter(Boolean)
}

function aircraftBenefits(aircraft) {
  const amenities = Array.isArray(aircraft.amenities) ? aircraft.amenities : []
  const defaults = ['WiFi', 'Cabina premium']
  return [...amenities, ...defaults].filter(Boolean).slice(0, 2)
}

function optimizedDepartureCopy(aircraft) {
  const origin = aircraft.source_origin || aircraft.queried_base_airport || activeItinerarySummary.value?.legs?.[0]?.origin || ''
  if (!origin) return 'Salida optimizada para tu ruta'
  return `Salida optimizada desde ${airportDisplayName(origin)}`
}

function availabilityStatus(aircraft, index) {
  if (index === 0) {
    return { label: 'Disponible hoy', tone: 'available' }
  }
  if (aircraft.response_time) {
    return { label: `Confirmación ${aircraft.response_time}`, tone: 'soon' }
  }
  if (aircraft.capacity && Number(aircraft.capacity) >= 8) {
    return { label: 'Alta demanda', tone: 'demand' }
  }
  return { label: 'Confirmación en 15 min', tone: 'soon' }
}

function estimatedFlightTime(aircraft) {
  return aircraft.time || estimatedTime.value || '2h 15m'
}

function experienceLevel(aircraft, index) {
  if (index === 0) return 'Premium'
  if (aircraft.capacity && Number(aircraft.capacity) >= 9) return 'Elite'
  return 'Business'
}

function compactRouteSummary(summary) {
  const firstLeg = summary?.legs?.[0] || {}
  return [
    `${airportDisplayName(firstLeg.origin)} → ${airportDisplayName(firstLeg.destination)}`,
    formatPassengerCopy(summary?.passengers),
    firstLeg.date ? formatTravelDate(firstLeg.date, firstLeg.time).replace(/\s+de\s+\d{4}/, '') : '',
    'Salida optimizada',
  ].filter(Boolean).join(' • ')
}

function go(section, id = '') {
  profileMenuOpen.value = false
  router.push(id ? `/cliente/${section}/${id}` : `/cliente/${section}`)
}

function chooseMembership(plan) {
  ui.pushToast({
    tone: 'success',
    title: 'Solicitud enviada',
    message: plan.name ? `El servidor recibio tu interes por ${plan.name}.` : 'El servidor recibio tu solicitud.',
  })
}

function selectDestination(destination) {
  if (tripType.value === 'Multi-destino') {
    const lastLeg = searchForm.legs[searchForm.legs.length - 1]
    const hasEmptyLastDestination = lastLeg && !lastLeg.destination

    if (hasEmptyLastDestination) {
      lastLeg.destination = destination.code
      return
    }

    searchForm.legs.push({
      origin: lastLeg?.destination || searchForm.destination,
      destination: destination.code,
      date: lastLeg?.date || searchForm.departureDate,
      time: lastLeg?.time || searchForm.departureTime,
    })
    return
  }

  searchForm.destination = destination.code
}

function updateSearchField({ field, value }) {
  if (!Object.prototype.hasOwnProperty.call(searchForm, field)) return
  searchForm[field] = value
}

function updateLegField({ index, field, value }) {
  if (!searchForm.legs[index] || !Object.prototype.hasOwnProperty.call(searchForm.legs[index], field)) return
  searchForm.legs[index][field] = value
}

function addLeg() {
  const lastLeg = searchForm.legs[searchForm.legs.length - 1] || {}
  searchForm.legs.push({
    origin: lastLeg.destination || '',
    destination: '',
    date: lastLeg.date || searchForm.departureDate,
    time: lastLeg.time || '09:00',
  })
}

function removeLeg(index) {
  if (searchForm.legs.length <= 2) return
  searchForm.legs.splice(index, 1)
}

function buildItinerarySummary(payload) {
  const legs = Array.isArray(payload.legs) ? payload.legs.map((leg) => ({ ...leg })) : []
  const dates = legs
    .map((leg) => new Date(`${leg.date}T00:00:00`))
    .filter((date) => !Number.isNaN(date.getTime()))
  const days =
    dates.length >= 2 ? Math.max(Math.round((dates[dates.length - 1] - dates[0]) / 86400000), 0) : 0

  return {
    tripType: payload.trip_label,
    legs,
    days,
    passengers: payload.passengers,
    preference: payload.preference,
    cabin: '',
    estimatedTime: '',
    estimatedTotal: '',
    membership: activePlan.value,
    maxLegs: activeMembership.value?.max_legs || activeMembership.value?.membership?.max_legs || null,
  }
}

function resetSearchForm() {
  Object.assign(searchForm, {
    origin: '',
    destination: '',
    departureDate: '',
    departureTime: '',
    returnDate: '',
    returnTime: '',
    passengers: '',
    preference: '',
    legs: [
      { origin: '', destination: '', date: '', time: '' },
      { origin: '', destination: '', date: '', time: '' },
    ],
  })
}

function validateSearchForm() {
  const firstLeg = itineraryLegs.value[0] || {}

  if (!firstLeg.origin || !firstLeg.destination || !firstLeg.date) {
    serverSearchError.value = 'Completa origen, destino y fecha para ver opciones disponibles.'
    ui.pushToast({
      tone: 'warning',
      title: 'Datos del viaje incompletos',
      message: 'Necesitamos origen, destino y fecha para preparar opciones privadas.',
    })
    return false
  }

  if (tripType.value !== 'Ida' && itineraryLegs.value.length < 2) {
    serverSearchError.value =
      tripType.value === 'Redondo'
        ? 'Completa fecha y hora de regreso para cotizar viaje redondo.'
        : 'Agrega al menos dos tramos completos para cotizar multi-destino.'
    ui.pushToast({
      tone: 'warning',
      title: 'Tramos incompletos',
      message: serverSearchError.value,
    })
    return false
  }

  if (!Number(searchForm.passengers || 0)) {
    serverSearchError.value = 'Indica cuántos pasajeros viajarán.'
    ui.pushToast({
      tone: 'warning',
      title: 'Pasajeros pendientes',
      message: 'Agrega el número de pasajeros para sugerir cabinas adecuadas.',
    })
    return false
  }

  return true
}

async function submitSearch() {
  serverSearchError.value = ''
  if (!validateSearchForm()) return

  searching.value = true
  const quotePayload = {
    trip_type: tripTypeKey.value,
    trip_label: tripType.value,
    passengers: searchForm.passengers,
    preference: searchForm.preference,
    legs: itineraryLegs.value.map((leg) => ({ ...leg })),
  }
  submittedItinerary.value = buildItinerarySummary(quotePayload)
  ui.pushToast({
    tone: 'success',
    title: 'Cotizando itinerario',
    message: 'Validando membresia, aeropuertos, tramos y operadores activos.',
  })
  aircraftOptions.value = await searchClientFlights(quotePayload)
  if (!aircraftOptions.value.length) {
    serverSearchError.value = 'El servidor no devolvio opciones para este itinerario.'
  }
  searching.value = false
  go('resultados')
}

async function requestReservation() {
  if (!selectedAircraft.value) return

  try {
    await createClientFlightRequest({
      trip_type: tripTypeKey.value,
      trip_label: tripType.value,
      passengers: activeItinerarySummary.value.passengers,
      preference: selectedAircraft.value.cabin || selectedAircraft.value.aircraft,
      legs: activeItinerarySummary.value.legs.map((leg) => ({ ...leg })),
    })
    reservations.value = await getClientTrips()
    ui.pushToast({
      tone: 'success',
      title: 'Reserva solicitada',
      message: 'Tu vuelo quedo en espera de confirmacion del operador verificado.',
    })
    go('viajes')
  } catch {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo solicitar la reserva',
      message: 'Intenta de nuevo o contacta a tu asesor privado.',
    })
  }
}

async function sendSupport() {
  if (!supportDraft.value.trim()) return
  await requestConcierge(supportDraft.value)

  ui.pushToast({
    tone: 'success',
    title: 'Concierge activado',
    message: 'El equipo recibio tu solicitud dentro del portal privado.',
  })
  supportDraft.value = ''
}

async function handleLogout() {
  profileMenuOpen.value = false
  await auth.logout()
  ui.pushToast({
    tone: 'success',
    title: 'Sesion cerrada',
    message: 'Cerraste tu acceso de cliente correctamente.',
  })
  router.push('/')
}

async function loadServerData() {
  loadingServerData.value = true

  const [destinations, plans, trips] = await Promise.all([
    getClientDestinations(),
    getClientMembershipPlans(),
    getClientTrips(),
  ])

  featuredDestinations.value = destinations
  membershipPlans.value = plans
  reservations.value = trips
  loadingServerData.value = false
}

onMounted(loadServerData)
</script>

<template>
  <div class="client-app-shell">
    <ClientTopNav
      :active-plan="activePlan"
      :active-section="activeSection"
      :items="topNavItems"
      :profile-open="profileMenuOpen"
      :user-first-name="userFirstName"
      @logout="handleLogout"
      @navigate="go"
      @toggle-profile="profileMenuOpen = !profileMenuOpen"
    />

    <main class="client-page">
      <div v-if="loadingServerData" class="loading-band">Cargando informacion del servidor...</div>
      <MembershipStatusBar v-if="statusCards.length && bookingStep === 'reservar'" :cards="statusCards" />

      <section v-if="activeSection === 'reservar'" class="screen">
        <MembershipBanner
          v-if="activePlan && bookingStep === 'reservar'"
          :plan="activePlan"
          :quotes-remaining="quotesRemaining"
          :reservations-remaining="reservationsRemaining"
          @upgrade="go('membresia')"
        />

        <FlightSearchHero
          v-if="bookingStep === 'reservar'"
          :form="searchForm"
          :summary="itinerarySummary"
          :trip-type="tripType"
          :trust-signals="trustSignals"
          @add-leg="addLeg"
          @remove-leg="removeLeg"
          @submit="submitSearch"
          @update-form-field="updateSearchField"
          @update-leg-field="updateLegField"
          @update-trip-type="tripType = $event"
        />

        <DestinationCards
          v-if="bookingStep === 'reservar' && featuredDestinations.length"
          :destinations="featuredDestinations"
          :trip-type="tripType"
          @select="selectDestination"
        />

        <template v-else-if="bookingStep === 'resultados'">
          <form class="results-search-bar" @submit.prevent="submitSearch">
            <label>
              <span>Origen</span>
              <input :value="searchForm.origin" autocomplete="off" @input="updateSearchField({ field: 'origin', value: $event.target.value })" />
            </label>
            <label>
              <span>Destino</span>
              <input
                :value="searchForm.destination"
                autocomplete="off"
                @input="updateSearchField({ field: 'destination', value: $event.target.value })"
              />
            </label>
            <label>
              <span>Viaje</span>
              <select :value="tripType" @change="tripType = $event.target.value">
                <option>Ida</option>
                <option>Redondo</option>
                <option>Multi-destino</option>
              </select>
            </label>
            <label>
              <span>Fecha</span>
              <input :value="searchForm.departureDate" type="date" @input="updateSearchField({ field: 'departureDate', value: $event.target.value })" />
            </label>
            <label>
              <span>Pasajeros</span>
              <input :value="searchForm.passengers" min="1" type="number" @input="updateSearchField({ field: 'passengers', value: $event.target.value })" />
            </label>
            <button type="submit">Buscar</button>
          </form>

          <div class="screen-head results-head">
            <span class="eyebrow">Resultados verificados para tu ruta</span>
            <h2>{{ itineraryHeadline(activeItinerarySummary) }}</h2>
            <p>{{ formatPassengerCopy(activeItinerarySummary.passengers) }} · {{ itineraryDateLine(activeItinerarySummary) }}</p>
          </div>

          <article v-if="activeItinerarySummary.legs.length" class="route-summary-bar">
            <strong>{{ compactRouteSummary(activeItinerarySummary) }}</strong>
          </article>

          <div class="filter-row">
            <button
              v-for="filter in resultFilterOptions"
              :key="filter.key"
              :aria-pressed="activeResultFilter === filter.key"
              :class="{ 'active-filter': activeResultFilter === filter.key }"
              type="button"
              @click="activeResultFilter = filter.key"
            >
              {{ filter.label }}
            </button>
          </div>

          <div v-if="searching" class="loading-band">Haciendo match con operadores activos...</div>
          <div v-else-if="serverSearchError" class="empty-state">{{ serverSearchError }}</div>

          <div v-if="filteredAircraftOptions.length" class="results-recommendation">
            <span class="eyebrow">Nuestra recomendacion</span>
            <strong>{{ aircraftPriceCopy(filteredAircraftOptions[0]) }}</strong>
          </div>

          <div v-if="filteredAircraftOptions.length" class="aircraft-list">
            <article
              v-for="(aircraft, index) in filteredAircraftOptions"
              :key="aircraft.id"
              class="aircraft-card"
              :class="{ 'aircraft-card--featured': String(aircraft.id) === recommendedAircraftId }"
            >
              <div
                class="aircraft-thumb"
                :class="{ 'aircraft-thumb--placeholder': !aircraft.image_url }"
                :style="aircraftVisualStyle(aircraft.image_url)"
              >
                <img
                  v-if="aircraft.image_url"
                  :src="aircraft.image_url"
                  :alt="aircraft.aircraft"
                  loading="lazy"
                />
                <span v-else class="aircraft-thumb__empty">Imagen en validación</span>
                <span class="aircraft-thumb__badge">{{ aircraft.cabin || 'Cabina verificada' }}</span>
                <span v-if="aircraft.image_url" class="aircraft-image-source">Cabina premium</span>
              </div>
              <div class="aircraft-copy">
                <span class="tag">{{ recommendationBadge(aircraft, index) }}</span>
                <h3>{{ aircraft.aircraft }}</h3>
                <div class="aircraft-premium-meta">
                  <span>{{ experienceLevel(aircraft, index) }}</span>
                  <span v-for="item in aircraftShortMeta(aircraft)" :key="item">{{ item }}</span>
                </div>
                <p class="aircraft-price-line">
                  <strong>{{ aircraftPriceCopy(aircraft) }}</strong>
                  <span>{{ availabilityStatus(aircraft, index).label }}</span>
                </p>
                <div class="benefit-row">
                  <span v-for="benefit in aircraftBenefits(aircraft)" :key="benefit">{{ benefit }}</span>
                </div>
              </div>
              <div class="aircraft-facts">
                <span class="availability-pill" :class="`availability-pill--${availabilityStatus(aircraft, index).tone}`">
                  {{ availabilityStatus(aircraft, index).label }}
                </span>
                <span class="fact-pill">{{ aircraft.capacity || activeItinerarySummary.passengers || 'Privado' }} pasajeros</span>
                <span class="fact-pill">{{ estimatedFlightTime(aircraft) }}</span>
              </div>
              <div class="card-actions">
                <button type="button" @click="go('aeronave', aircraft.id)">Ver detalles</button>
                <button type="button" @click="go('paquete-vuelo', aircraft.id)">Cotizar ahora</button>
              </div>
            </article>
          </div>
        </template>

        <article v-else-if="bookingStep === 'aeronave' && selectedAircraft" class="aircraft-detail">
          <div
            class="aircraft-visual"
            :class="{ 'aircraft-visual--placeholder': !selectedAircraft.image_url }"
            :style="aircraftVisualStyle(selectedAircraft.image_url)"
          >
            <img
              v-if="selectedAircraft.image_url"
              :src="selectedAircraft.image_url"
              :alt="selectedAircraft.aircraft"
              loading="lazy"
            />
            <span>{{ selectedAircraft.cabin }}</span>
          </div>
          <div class="detail-copy">
            <span class="eyebrow">Cabina seleccionada</span>
            <h2>Resumen del viaje</h2>
            <p>Tramos, aeronave, precio, servicios incluidos y condiciones antes de contrato y pago.</p>
            <div class="detail-grid">
              <span v-for="(leg, index) in activeItinerarySummary.legs" :key="`detail-${index}`">
                Tramo {{ index + 1 }}: {{ leg.origin }} -> {{ leg.destination }} / {{ leg.date }} {{ leg.time }}
              </span>
              <span>Aeronave: {{ selectedAircraft.aircraft }}{{ selectedAircraft.model ? ` / ${selectedAircraft.model}` : '' }}</span>
              <span v-if="selectedAircraft.capacity">Capacidad: {{ selectedAircraft.capacity }}</span>
              <span v-if="selectedAircraft.source_database">
                {{ optimizedDepartureCopy(selectedAircraft) }}
              </span>
              <span>Operador: oculto hasta confirmacion</span>
              <span v-if="selectedAircraft.time || activeItinerarySummary.estimatedTime">
                Tiempo total: {{ selectedAircraft.time || activeItinerarySummary.estimatedTime }}
              </span>
              <span>Total: {{ aircraftPriceCopy(selectedAircraft) }}</span>
              <span v-if="selectedAircraft.amenities?.length">Servicios incluidos: {{ selectedAircraft.amenities.join(' / ') }}</span>
              <span>Condiciones: contrato pendiente y pago pendiente.</span>
            </div>
            <div v-if="selectedAircraft.images?.length > 1" class="aircraft-gallery">
              <span v-for="image in selectedAircraft.images.slice(0, 4)" :key="image.id" class="aircraft-gallery-item">
                <img :src="image.imageUrl" :alt="`${selectedAircraft.aircraft} ${image.title}`" loading="lazy" />
              </span>
            </div>
            <button type="button" @click="go('paquete-vuelo', selectedAircraft.id)">Cotizar ahora</button>
          </div>
        </article>
        <div v-else-if="bookingStep === 'aeronave'" class="empty-state">El servidor no devolvio detalle para esta opcion.</div>

        <template v-else-if="bookingStep === 'paquete-vuelo'">
          <div class="screen-head">
            <span class="eyebrow">Membresia para este vuelo</span>
            <h2>Elige el nivel de experiencia</h2>
          </div>

          <div class="plan-grid">
            <article v-for="plan in membershipPlans" :key="plan.name" class="plan-card">
              <span v-if="plan.badge" class="tag">{{ plan.badge }}</span>
              <h3>{{ plan.name }}</h3>
              <p v-if="plan.benefits?.length">{{ plan.benefits.join(' / ') }}</p>
              <button type="button" @click="selectedFlightPackage = plan.name">
                {{ selectedFlightPackage === plan.name ? 'Seleccionado' : `Elegir ${plan.name}` }}
              </button>
            </article>
          </div>

          <div class="summary-band">
            <span>Acceso de servicio</span>
            <strong v-if="packageFee">{{ packageFee }}</strong>
            <button type="button" @click="go('reserva', routeId)">Continuar</button>
          </div>
        </template>

        <article v-else-if="selectedAircraft" class="reservation-summary">
          <span class="eyebrow">Confirmacion</span>
          <h2>Resumen del vuelo</h2>
          <span>Cabina: {{ selectedAircraft.aircraft }}</span>
          <span v-for="(leg, index) in activeItinerarySummary.legs" :key="`reserve-${index}`">
            Tramo {{ index + 1 }}: {{ leg.origin }} -> {{ leg.destination }} / {{ leg.date }} {{ leg.time }}
          </span>
          <span v-if="activeItinerarySummary.passengers">Pasajeros: {{ activeItinerarySummary.passengers }}</span>
          <strong v-if="selectedAircraft.final_price">Precio final: {{ selectedAircraft.final_price }}</strong>
          <button type="button" @click="requestReservation">Confirmar reserva</button>
        </article>
        <div v-else class="empty-state">El servidor no devolvio una opcion para reservar.</div>
      </section>

      <section v-else-if="activeSection === 'viajes'" class="screen">
        <article v-if="props.section === 'contrato'" class="document-panel">
          <span class="eyebrow">Contrato {{ routeId }}</span>
          <h2>Firma digital</h2>
          <p>Datos del vuelo, condiciones, total y firma protegida.</p>
          <div class="signature-box">Firma pendiente</div>
          <button type="button" @click="go('pago', routeId)">Firmar contrato</button>
        </article>

        <article v-else-if="props.section === 'pago'" class="document-panel">
          <span class="eyebrow">Pago {{ routeId }}</span>
          <h2>Checkout seguro</h2>
          <p>Pago protegido con tarjeta, transferencia, wire o wallet corporativa.</p>
          <strong v-if="selectedAircraft?.final_price">{{ selectedAircraft.final_price }}</strong>
          <button type="button" @click="go('reserva-confirmada', routeId)">Pagar</button>
        </article>

        <ActiveTrips
          v-else
          :reservations="reservations"
          :selected-id="selectedTripId"
          :timeline="timeline"
          @open-concierge="go('soporte')"
          @open-contract="go('contrato', selectedTripId)"
          @open-detail="go('viajes', $event)"
          @open-payment="go('pago', selectedTripId)"
        />
      </section>

      <section v-else-if="activeSection === 'membresia'" class="screen">
        <div class="screen-head">
          <span class="eyebrow">Membresia</span>
          <h2>Explorer, Business o Elite segun tu ritmo.</h2>
          <p>Menos administracion. Mas reserva, prioridad y control.</p>
        </div>

        <div class="plan-grid">
          <article v-for="plan in membershipPlans" :key="plan.name" class="plan-card">
            <span v-if="plan.badge" class="tag">{{ plan.badge }}</span>
            <h3>{{ plan.name }}</h3>
            <strong>{{ plan.price || plan.monthly_price }}</strong>
            <ul>
              <li v-for="benefit in plan.benefits || []" :key="benefit">{{ benefit }}</li>
            </ul>
            <button type="button" @click="chooseMembership(plan)">
              {{ plan.action }}
            </button>
          </article>
        </div>
        <div v-if="!membershipPlans.length" class="empty-state">El servidor no devolvio membresias.</div>

        <div class="support-grid">
          <article class="support-card">
            <h3>Asesor privado</h3>
            <textarea v-model="supportDraft" placeholder="Describe que necesitas"></textarea>
            <button type="button" @click="sendSupport">Enviar solicitud</button>
          </article>
          <article class="support-card">
            <h3>Beneficios activos</h3>
            <span>Operadores verificados</span>
            <span>Firma digital</span>
            <span>Pago protegido</span>
          </article>
        </div>
      </section>

      <section v-else class="screen">
        <div class="screen-head">
          <span class="eyebrow">Perfil</span>
          <h2>Preferencias de vuelo</h2>
        </div>
        <form class="profile-form">
          <label>Nombre<input :value="auth.user?.name || 'Miembro Red Aviation'" /></label>
          <label>Telefono<input placeholder="+52 55 0000 0000" /></label>
          <label>Empresa<input placeholder="Empresa" /></label>
          <label>Correo<input :value="auth.user?.email || 'miembro@redaviation.test'" /></label>
          <label class="wide">Preferencias<textarea placeholder="Catering, asiento, FBO, privacidad"></textarea></label>
        </form>
      </section>
    </main>

    <nav class="mobile-bottom-nav" aria-label="Navegacion movil">
      <button
        v-for="item in mobileNavItems"
        :key="item.section"
        type="button"
        :class="{ active: activeSection === item.section }"
        @click="go(item.section)"
      >
        {{ item.section === 'membresia' ? 'Plan' : item.label }}
      </button>
    </nav>

    <ConciergeFloatingButton @open="go('soporte')" />
  </div>
</template>

<style scoped>
.client-app-shell {
  display: block;
  width: 100%;
  min-height: 100vh;
  padding-top: 4.7rem;
  background:
    linear-gradient(180deg, #fbfaf6 0%, #f3f1eb 100%),
    #f7f5ef;
  color: #141414;
}

.client-page {
  display: grid;
  gap: 1rem;
  width: min(100%, 1240px);
  margin: 0 auto;
  padding: clamp(1rem, 3vw, 2rem);
}

.screen {
  display: grid;
  gap: 1rem;
}

.screen-head {
  max-width: 760px;
}

.eyebrow,
.tag {
  color: #8b6a24;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h2,
h3 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: 0;
  font-weight: 600;
}

h2 {
  font-size: clamp(2rem, 4vw, 3.2rem);
  line-height: 1;
}

p,
li,
span {
  color: #626262;
}

button {
  min-height: 2.8rem;
  border: 0;
  border-radius: 8px;
  padding: 0 1rem;
  background: #111111;
  color: #ffffff;
  font-weight: 600;
  cursor: pointer;
}

.filter-row,
.card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.filter-row button,
.card-actions button:first-child {
  border: 1px solid #deded8;
  background: #ffffff;
  color: #111111;
}

.results-search-bar {
  position: sticky;
  top: 5.4rem;
  z-index: 8;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr)) auto;
  gap: 0.85rem;
  padding: 1rem;
  border: 1px solid rgba(17, 17, 17, 0.08);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 22px 60px rgba(17, 17, 17, 0.12);
  backdrop-filter: blur(18px);
}

.results-search-bar label {
  display: grid;
  gap: 0.35rem;
}

.results-search-bar span {
  color: #7a6851;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.results-search-bar input {
  min-height: 3.35rem;
  border: 1px solid #deded9;
  border-radius: 16px;
  padding: 0 1rem;
  background: #fbfbfa;
  color: #111111;
  font: inherit;
}

.results-search-bar select {
  min-height: 3.35rem;
  border: 1px solid #deded9;
  border-radius: 16px;
  padding: 0 1rem;
  background: #fbfbfa;
  color: #111111;
  font: inherit;
}

.results-search-bar button {
  align-self: end;
  min-width: 10rem;
  min-height: 3.35rem;
  border-radius: 16px;
  background: linear-gradient(135deg, #111111, #2b2925);
}

.aircraft-list {
  display: grid;
  gap: 1rem;
}

.route-summary-bar {
  display: flex;
  align-items: center;
  min-height: 3.1rem;
  padding: 0.75rem 1rem;
  border: 1px solid rgba(191, 151, 65, 0.22);
  border-radius: 14px;
  background: linear-gradient(135deg, #ffffff, #f8f6f0);
}

.route-summary-bar strong {
  color: #171717;
  font-size: 0.98rem;
  line-height: 1.25;
}

.leg-list {
  display: grid;
  gap: 0.35rem;
}

.itinerary-meta {
  margin: 0;
  color: #3a332a;
  font-size: 1rem;
  font-weight: 500;
}

.loading-band {
  padding: 1rem;
  border: 1px solid #e5e1d8;
  border-radius: 8px;
  background: #ffffff;
  color: #3b3428;
  font-weight: 800;
}

.results-recommendation {
  display: none;
}

.aircraft-card,
.plan-card,
.support-card,
.document-panel,
.reservation-summary,
.summary-band,
.aircraft-detail {
  border: 1px solid #e5e1d8;
  border-radius: 8px;
  background: #ffffff;
}

.aircraft-card {
  display: grid;
  grid-template-columns: minmax(300px, 390px) minmax(0, 1fr) minmax(150px, 190px) minmax(150px, auto);
  gap: 1rem;
  align-items: center;
  padding: 0.9rem;
  border-radius: 20px;
  box-shadow: 0 16px 44px rgba(17, 17, 17, 0.08);
}

.aircraft-card--featured {
  border-color: rgba(191, 151, 65, 0.5);
  box-shadow: 0 24px 64px rgba(17, 17, 17, 0.12);
}

.aircraft-card > div {
  min-width: 0;
}

.aircraft-thumb {
  position: relative;
  overflow: hidden;
  min-height: 250px;
  border-radius: 16px;
  background: linear-gradient(135deg, #242424, #0f0f0f);
}

.aircraft-thumb img,
.aircraft-visual img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.aircraft-thumb img {
  display: block;
  min-height: 250px;
}

.aircraft-thumb::after,
.aircraft-visual::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.04), rgba(0, 0, 0, 0.42));
  pointer-events: none;
}

.aircraft-thumb__badge {
  position: absolute;
  top: 0.85rem;
  left: 0.85rem;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0.35rem 0.8rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: #141414;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.aircraft-thumb__empty {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: grid;
  place-items: center;
  padding: 1rem;
  color: rgba(255, 255, 255, 0.82);
  font-size: 0.86rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-align: center;
  text-transform: uppercase;
}

.aircraft-image-source {
  position: absolute;
  right: 0.85rem;
  bottom: 0.85rem;
  z-index: 1;
  max-width: calc(100% - 1.7rem);
  overflow-wrap: anywhere;
  padding: 0.32rem 0.62rem;
  border-radius: 999px;
  background: rgba(17, 17, 17, 0.78);
  color: #ffffff;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.aircraft-thumb--placeholder,
.aircraft-visual--placeholder {
  background: linear-gradient(135deg, #242424, #0f0f0f);
}

.aircraft-copy {
  display: grid;
  gap: 0.48rem;
}

.aircraft-model {
  color: #5e5b55;
  font-size: 0.94rem;
  font-weight: 700;
}

.aircraft-premium-meta,
.benefit-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.42rem;
}

.aircraft-premium-meta span,
.benefit-row span,
.fact-pill {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 1.7rem;
  padding: 0.24rem 0.58rem;
  border: 1px solid #e3e0d8;
  border-radius: 999px;
  background: #faf9f6;
  color: #3d3a35;
  font-size: 0.78rem;
  font-weight: 700;
}

.aircraft-price-line {
  display: flex;
  flex-wrap: wrap;
  gap: 0.28rem;
  flex-direction: column;
  align-items: flex-start;
  margin: 0;
}

.aircraft-price-line strong {
  color: #111111;
  font-size: clamp(1.5rem, 2.2vw, 2rem);
  line-height: 1;
}

.aircraft-price-line span {
  color: #6d6252;
  font-size: 0.92rem;
  font-weight: 500;
}

.aircraft-meta,
.aircraft-note {
  margin: 0;
}

.aircraft-meta {
  color: #3a332a;
  font-weight: 500;
}

.aircraft-note {
  color: #746652;
}

.aircraft-db-origin {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  max-width: 100%;
  padding: 0.52rem 0.78rem;
  border: 1px solid rgba(191, 151, 65, 0.28);
  border-radius: 999px;
  background: #fffaf0;
}

.aircraft-db-origin span {
  color: #7a5c1a;
  font-size: 0.8rem;
  font-weight: 800;
}

.aircraft-card h3,
.plan-card h3,
.support-card h3 {
  margin: 0;
}

.aircraft-facts,
.detail-grid,
.reservation-summary {
  display: grid;
  gap: 0.55rem;
}

.aircraft-facts {
  align-content: center;
}

.verified-pill {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  width: fit-content;
  padding: 0.35rem 0.8rem;
  border-radius: 999px;
  background: #edf6f0;
  color: #1e6a3b;
  font-weight: 600;
}

.availability-pill {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 2rem;
  padding: 0.35rem 0.78rem;
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 800;
}

.availability-pill--available {
  background: #eaf6ef;
  color: #17683a;
}

.availability-pill--soon {
  background: #fff7df;
  color: #87610d;
}

.availability-pill--demand {
  background: #fff0ea;
  color: #a34218;
}

.aircraft-detail {
  display: grid;
  grid-template-columns: minmax(320px, 0.9fr) minmax(0, 1fr);
  gap: 1rem;
  align-items: center;
  padding: clamp(1rem, 3vw, 1.5rem);
}

.aircraft-visual {
  position: relative;
  overflow: hidden;
  display: grid;
  min-height: 330px;
  place-items: center;
  border-radius: 8px;
  color: #ffffff;
  background:
    linear-gradient(135deg, rgba(0, 0, 0, 0.18), rgba(0, 0, 0, 0.52)),
    url('https://images.unsplash.com/photo-1540962351504-03099e0a754b?auto=format&fit=crop&w=1200&q=80') center/cover;
}

.aircraft-visual span {
  position: relative;
  z-index: 1;
  align-self: end;
  justify-self: start;
  margin: 1rem;
  padding: 0.45rem 0.85rem;
  border-radius: 999px;
  background: rgba(17, 17, 17, 0.72);
  color: #ffffff;
  font-weight: 800;
}

.detail-copy,
.document-panel,
.support-card,
.plan-card,
.reservation-summary {
  display: grid;
  gap: 0.75rem;
  padding: 1rem;
}

.card-actions {
  justify-content: end;
}

.card-actions button {
  min-width: 9rem;
}

.card-actions button:first-child {
  background: #ffffff;
}

.card-actions button:last-child {
  min-width: 10rem;
  background: linear-gradient(135deg, #111111, #2b2925);
}

.aircraft-gallery {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.5rem;
}

.aircraft-gallery-item {
  position: relative;
  overflow: hidden;
  display: block;
  aspect-ratio: 4 / 3;
  border: 1px solid #e5e1d8;
  border-radius: 8px;
  background: #f1eee7;
}

.aircraft-gallery-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.plan-grid,
.support-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}

.plan-card ul {
  display: grid;
  gap: 0.45rem;
  margin: 0;
  padding-left: 1rem;
}

.support-grid {
  grid-template-columns: minmax(0, 1fr) minmax(280px, 0.75fr);
}

.support-card textarea,
.profile-form textarea {
  min-height: 130px;
  padding: 0.85rem;
  resize: vertical;
}

.summary-band {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 1rem;
  align-items: center;
  padding: 1rem;
}

.signature-box {
  display: grid;
  min-height: 170px;
  place-items: center;
  border: 1px dashed #b9ad96;
  border-radius: 8px;
  background: #fbf8ef;
  color: #6b5a3b;
  font-weight: 800;
}

.profile-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  padding: 1rem;
  border: 1px solid #e5e1d8;
  border-radius: 8px;
  background: #ffffff;
}

.profile-form label {
  display: grid;
  gap: 0.42rem;
  color: #3a332a;
  font-weight: 800;
}

.profile-form input,
.profile-form textarea,
.support-card textarea {
  width: 100%;
  border: 1px solid #d8d2c4;
  border-radius: 8px;
  background: #fbfaf7;
  color: #111111;
  font: inherit;
}

.profile-form input {
  min-height: 3rem;
  padding: 0 0.85rem;
}

.wide {
  grid-column: 1 / -1;
}

.mobile-bottom-nav {
  display: none !important;
}

.active-filter {
  background: #111111 !important;
  color: #ffffff !important;
}

@media (min-width: 761px) {
  .mobile-bottom-nav {
    display: none !important;
  }
}

@media (max-width: 1080px) {
  .results-search-bar,
  .aircraft-card,
  .aircraft-detail,
  .plan-grid,
  .support-grid,
  .summary-band,
  .profile-form {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .client-app-shell {
    padding-top: 3.8rem;
  }

  .client-page {
    gap: 0.5rem;
    padding: 0.5rem 0.5rem 5.55rem;
  }

  .results-search-bar {
    position: static;
    top: auto;
    grid-template-columns: 1fr 1fr;
    gap: 0.35rem;
    padding: 0.45rem;
    border-radius: 10px;
    box-shadow: 0 6px 14px rgba(24, 24, 24, 0.04);
  }

  .results-search-bar label {
    gap: 0.12rem;
  }

  .results-search-bar span {
    font-size: 0.58rem;
    letter-spacing: 0.05em;
  }

  .results-search-bar input {
    min-height: 2.1rem;
    padding: 0 0.5rem;
    border-radius: 8px;
    font-size: 0.88rem;
  }

  .results-search-bar select {
    min-height: 2.1rem;
    padding: 0 0.5rem;
    border-radius: 8px;
    font-size: 0.88rem;
  }

  .results-search-bar button {
    grid-column: 1 / -1;
    min-height: 2.2rem;
    border-radius: 8px;
    font-size: 0.88rem;
  }

  .screen {
    gap: 0.5rem;
  }

  h2 {
    font-size: clamp(0.98rem, 6.8vw, 1.55rem);
    line-height: 0.98;
  }

  .filter-row {
    display: flex;
    flex-wrap: nowrap;
    gap: 0.3rem;
    overflow-x: auto;
    padding-bottom: 0.15rem;
    scrollbar-width: none;
  }

  .filter-row::-webkit-scrollbar {
    display: none;
  }

  .filter-row button {
    flex: 0 0 auto;
    min-height: 1.9rem;
    padding: 0 0.8rem;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 500;
  }

  .card-actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .results-search-bar button,
  .filter-row button,
  .card-actions button,
  .summary-band button,
  .reservation-summary button,
  .document-panel button,
  .support-card button,
  .plan-card button {
    width: 100%;
  }

  .eyebrow,
  .tag {
    font-size: 0.6rem;
    letter-spacing: 0.06em;
  }

  .screen-head {
    max-width: none;
  }

  .results-head {
    padding: 0.2rem 0 0;
  }

  .results-head h2 {
    max-width: none;
    font-size: 1.02rem;
    line-height: 1.08;
  }

  .screen-head p {
    display: block;
    margin-top: 0.16rem;
    font-size: 0.72rem;
    line-height: 1.2;
  }

  .route-summary-bar {
    min-height: 2.4rem;
    padding: 0.55rem 0.65rem;
    border-radius: 10px;
  }

  .route-summary-bar strong {
    font-size: 0.72rem;
    line-height: 1.2;
  }

  .results-recommendation {
    display: grid;
    gap: 0.18rem;
    padding: 0.62rem 0.7rem;
    border: 1px solid rgba(139, 106, 36, 0.14);
    border-radius: 10px;
    background: #ffffff;
  }

  .results-recommendation strong {
    color: #141414;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .leg-list span,
  .aircraft-note,
  .aircraft-meta,
  .aircraft-facts span {
    font-size: 0.72rem;
    line-height: 1.2;
  }

  .aircraft-db-origin {
    width: 100%;
    gap: 0.08rem;
    padding: 0.35rem 0.45rem;
  }

  .aircraft-db-origin span {
    font-size: 0.52rem;
  }

  .aircraft-list {
    display: flex;
    gap: 0.55rem;
    overflow-x: auto;
    padding: 0.05rem 0.05rem 0.3rem;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
  }

  .aircraft-list::-webkit-scrollbar {
    display: none;
  }

  .aircraft-card,
  .plan-card,
  .support-card,
  .document-panel,
  .reservation-summary,
  .summary-band,
  .aircraft-detail,
  .profile-form {
    padding: 0.72rem;
  }

  .aircraft-card {
    flex: 0 0 86%;
    gap: 0.45rem;
    border-radius: 12px;
    padding: 0.55rem;
    scroll-snap-align: start;
  }

  .aircraft-thumb {
    min-height: 94px;
    border-radius: 8px;
  }

  .aircraft-thumb img {
    min-height: 94px;
  }

  .aircraft-thumb__badge {
    top: 0.35rem;
    left: 0.35rem;
    min-height: 1.2rem;
    padding: 0.12rem 0.42rem;
    font-size: 0.52rem;
  }

  .aircraft-image-source {
    right: 0.35rem;
    bottom: 0.35rem;
    max-width: calc(100% - 0.7rem);
    padding: 0.12rem 0.36rem;
    font-size: 0.48rem;
  }

  .aircraft-copy {
    gap: 0.12rem;
  }

  .aircraft-copy h3 {
    font-size: 0.84rem;
    line-height: 1.05;
    font-weight: 600;
  }

  .aircraft-copy > strong {
    font-size: 0.72rem;
    line-height: 1.1;
    display: none;
  }

  .aircraft-price-line {
    gap: 0.1rem;
    flex-direction: column;
    align-items: flex-start;
  }

  .aircraft-price-line strong {
    font-size: 0.84rem;
    line-height: 1.05;
  }

  .aircraft-price-line span {
    font-size: 0.64rem;
  }

  .aircraft-facts {
    grid-template-columns: 1fr;
    gap: 0.14rem;
    padding-top: 0.05rem;
  }

  .verified-pill {
    width: 100%;
    justify-content: center;
    text-align: center;
    min-height: 1.4rem;
    padding: 0.15rem 0.42rem;
    font-size: 0.64rem;
  }

  .card-actions {
    gap: 0.28rem;
  }

  .card-actions button {
    min-height: 2rem;
    border-radius: 8px;
    font-size: 0.82rem;
  }

  .aircraft-facts .fact-pill {
    display: none;
  }

  .aircraft-visual {
    min-height: 170px;
  }

  .aircraft-gallery {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.35rem;
  }

  .mobile-bottom-nav {
    display: none !important;
  }

  .mobile-bottom-nav button.active {
    background: #111111;
    color: #ffffff;
  }
}
</style>
