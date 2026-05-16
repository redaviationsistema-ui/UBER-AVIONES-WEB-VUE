<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ActiveTrips from './ActiveTrips.vue'
import ClientTopNav from './ClientTopNav.vue'
import ConciergeFloatingButton from './ConciergeFloatingButton.vue'
import DestinationCards from './DestinationCards.vue'
import FlightSearchHero from './FlightSearchHero.vue'
import { featuredAirports } from '../../utils/airports'
import {
  buildCommercialSnapshot,
  buildFlightPricingFormula,
  normalizeAttentionLevel,
  normalizePackageCode,
} from '../../utils/flightPricing'
import {
  createClientFlightRequest,
  getClientDestinations,
  getClientFlightPackages,
  getClientTrips,
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
const selectedPriorityType = ref('essential')
const profileMenuOpen = ref(false)
const RESULTS_SURCHARGE_USD = 500
const searching = ref(false)
const loadingServerData = ref(false)
const serverSearchError = ref('')
const reservingAircraftId = ref('')
const featuredDestinations = ref([])
const flightPackages = ref([])
const aircraftOptions = ref([])
const reservations = ref([])
const submittedItinerary = ref(null)
const activeResultFilter = ref('best_value')
const technicalSheetOpen = ref(false)
const technicalAircraft = ref(null)

const searchForm = reactive({
  origin: '',
  originAirport: null,
  destination: '',
  destinationAirport: null,
  departureDate: '',
  departureTime: '',
  returnDate: '',
  returnTime: '',
  passengers: '1',
  pets: '',
  specialBaggage: '',
  preference: '',
  legs: [
    { origin: '', originAirport: null, destination: '', destinationAirport: null, date: '', time: '' },
    { origin: '', originAirport: null, destination: '', destinationAirport: null, date: '', time: '' },
  ],
})

const topNavItems = [
  { label: 'Reservar', section: 'reservar' },
  { label: 'Mis vuelos', section: 'viajes' },
  { label: 'Perfil', section: 'perfil' },
]
const mobileNavItems = [
  { label: 'Buscar', section: 'reservar' },
  { label: 'Vuelos', section: 'viajes' },
  { label: 'Cuenta', section: 'perfil' },
]
const defaultPriorityConfig = {
  empty_leg: { multiplier: 0.95, headline: 'Ahorro inteligente', description: 'Ruta flexible con ahorro real' },
  essential: { multiplier: 1.1, headline: 'Margen standard', description: 'Precio comercial base del marketplace' },
  business: { multiplier: 1.2, headline: 'Margen priority', description: 'Atencion premium + flexibilidad' },
  elite: { multiplier: 1.35, headline: 'Margen VIP', description: 'Concierge dedicado' },
}

const timeline = computed(() => [])

const selectedAircraft = computed(
  () => aircraftOptions.value.find((item) => String(item.id) === String(route.params.id)) || null,
)
const itineraryLegs = computed(() => {
  if (tripType.value === 'Ida') {
    return [
      normalizeLegForQuote({
        origin: searchForm.origin,
        originAirport: searchForm.originAirport,
        destination: searchForm.destination,
        destinationAirport: searchForm.destinationAirport,
        date: searchForm.departureDate,
        time: searchForm.departureTime,
      }),
    ]
  }

  if (tripType.value === 'Redondo') {
    return [
      normalizeLegForQuote({
        origin: searchForm.origin,
        originAirport: searchForm.originAirport,
        destination: searchForm.destination,
        destinationAirport: searchForm.destinationAirport,
        date: searchForm.departureDate,
        time: searchForm.departureTime,
      }),
      normalizeLegForQuote({
        origin: searchForm.destination,
        originAirport: searchForm.destinationAirport,
        destination: searchForm.origin,
        destinationAirport: searchForm.originAirport,
        date: searchForm.returnDate,
        time: searchForm.returnTime,
      }),
    ]
  }

  return searchForm.legs
    .filter((leg) => leg.origin && leg.destination && leg.date)
    .map((leg, index) =>
      normalizeLegForQuote(leg, {
        time: index === 0 ? searchForm.departureTime || '09:00' : '09:00',
      }),
    )
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
  const pricing = aircraftPricingForType(aircraftOptions.value[0] || {}, selectedPriorityType.value)
  return pricing.formattedFinalPrice || ''
})
const estimatedTime = computed(() => {
  return aircraftDurationLabel(aircraftOptions.value[0] || {})
})
const suggestedCabin = computed(() => {
  return aircraftOptions.value[0]?.cabin || ''
})
const itinerarySummary = computed(() => ({
  tripType: tripType.value,
  legs: itineraryLegs.value,
  days: itineraryDays.value,
  passengers: searchForm.passengers,
  pets: searchForm.pets,
  specialBaggage: searchForm.specialBaggage,
  preference: searchForm.preference,
  cabin: suggestedCabin.value,
  estimatedTime: estimatedTime.value,
  estimatedTotal: estimatedTotal.value,
  flightPackage: selectedPriorityMeta.value?.name || '',
  priorityType: selectedPriorityType.value,
}))
const activeItinerarySummary = computed(() => submittedItinerary.value || itinerarySummary.value)
const tripTypeKey = computed(() => {
  const keys = {
    Ida: 'one_way',
    Redondo: 'round_trip',
    'Multi-destino': 'multi_leg',
  }

  return keys[tripType.value] || 'one_way'
})
const routeId = computed(() => String(route.params.id || ''))
const selectedTripId = computed(() => String(route.params.id || ''))
const accountAccessCopy = computed(() => {
  const access = auth.access || {}
  const subscription = access.subscription || access.membership || {}
  const normalizedSubscriptionStatus = String(
    subscription.status || access.subscription_status || access.membership_status || '',
  )
    .trim()
    .toLowerCase()
  const normalizedPlanName = String(
    subscription.plan_name || subscription.plan || subscription.name || access.plan_name || access.plan || '',
  ).trim()
  const truthyStates = new Set(['1', 'true', 'yes', 'si', 'active', 'activa', 'vigente', 'approved', 'trial_active'])
  const activeStatuses = new Set(['active', 'activa', 'vigente', 'approved'])
  const demoStatuses = new Set(['trial_active', 'demo_active', 'trial', 'demo'])
  const flags = [
    access.has_access,
    access.active,
    access.is_active,
    access.subscription_active,
    access.demo_active,
    access.has_demo,
    access.can_book,
    access.can_request_flights,
  ]
  const normalizedFlags = flags.map((value) => String(value ?? '').trim().toLowerCase())
  const hasTruthyFlag = normalizedFlags.some((value) => truthyStates.has(value))
  const hasActiveSubscription = activeStatuses.has(normalizedSubscriptionStatus)
  const hasDemo = demoStatuses.has(normalizedSubscriptionStatus) || normalizedFlags.some((value) => demoStatuses.has(value))

  if (normalizedPlanName) {
    return normalizedPlanName
  }

  if (hasActiveSubscription || hasTruthyFlag) {
    return 'Acceso activo'
  }

  if (hasDemo) {
    return 'Demo activa'
  }

  return 'Sin demo ni suscripcion'
})
const activePlan = computed(() => accountAccessCopy.value)
const activeSection = computed(() => {
  if (['viajes', 'mis-vuelos', 'historial', 'contrato', 'pago', 'reserva-confirmada'].includes(props.section)) {
    return 'viajes'
  }
  if (props.section === 'soporte') return 'viajes'
  if (props.section === 'perfil') return 'perfil'
  return 'reservar'
})
const bookingStep = computed(() => {
  if (['paquete-vuelo', 'aeronave', 'reserva'].includes(props.section)) return 'resultados'
  if (props.section === 'resultados') return 'resultados'
  return 'reservar'
})
const userFirstName = computed(() => {
  const rawName = auth.user?.name || auth.user?.company_name || auth.userName || 'Kevin'
  return String(rawName).trim().split(/\s+/)[0] || 'Kevin'
})
const selectedPriorityMeta = computed(
  () => flightPackages.value.find((item) => item.code === selectedPriorityType.value) || null,
)
const recommendedAircraftId = computed(() => String(aircraftOptions.value[0]?.id || ''))
const resultFilterOptions = [
  { key: 'best_value', label: 'Recomendado por asesor' },
  { key: 'price', label: 'Mejor inversion' },
  { key: 'time', label: 'Salida mas rapida' },
  { key: 'luxury', label: 'Mayor exclusividad' },
]
const filteredAircraftOptions = computed(() => {
  const options = aircraftOptions.value.map((aircraft, index) => ({ aircraft, index }))

  if (activeResultFilter.value === 'price') {
    return options
      .sort(
        (current, next) =>
          aircraftPriceValue(current.aircraft) - aircraftPriceValue(next.aircraft) ||
          current.index - next.index,
      )
      .map(({ aircraft }) => aircraft)
  }

  if (activeResultFilter.value === 'time') {
    return options
      .sort(
        (current, next) =>
          aircraftTimeValue(current.aircraft) - aircraftTimeValue(next.aircraft) ||
          current.index - next.index,
      )
      .map(({ aircraft }) => aircraft)
  }

  if (activeResultFilter.value === 'luxury') {
    return options
      .sort(
        (current, next) =>
          aircraftPremiumValue(next.aircraft) - aircraftPremiumValue(current.aircraft) ||
          aircraftPriceValue(current.aircraft) - aircraftPriceValue(next.aircraft) ||
          current.index - next.index,
      )
      .map(({ aircraft }) => aircraft)
  }

  return options
    .sort(
      (current, next) =>
        aircraftDecisionScore(next.aircraft, next.index) - aircraftDecisionScore(current.aircraft, current.index) ||
        current.index - next.index,
    )
    .map(({ aircraft }) => aircraft)
})
const visibleAircraftOptions = computed(() => {
  return filteredAircraftOptions.value.filter((aircraft, index, all) => aircraftVisibleForRoute(aircraft, all, index))
})
const decoratedAircraftOptions = computed(() => visibleAircraftOptions.value)
const featuredAircraft = computed(() => decoratedAircraftOptions.value[0] || null)
const secondaryAircraftOptions = computed(() => decoratedAircraftOptions.value.slice(1))

const hasSearchContext = computed(() => {
  const legs = submittedItinerary.value?.legs?.length ? submittedItinerary.value.legs : itineraryLegs.value

  return legs.some((leg) => {
    const origin = String(leg?.origin || '').trim()
    const destination = String(leg?.destination || '').trim()
    return origin && destination
  })
})

function createEmptyLeg(overrides = {}) {
  return {
    origin: '',
    originAirport: null,
    destination: '',
    destinationAirport: null,
    date: '',
    time: '',
    ...overrides,
  }
}

function normalizeLegForQuote(leg = {}, fallback = {}) {
  return {
    ...leg,
    origin: leg.origin || fallback.origin || '',
    originAirport: leg.originAirport || fallback.originAirport || null,
    destination: leg.destination || fallback.destination || '',
    destinationAirport: leg.destinationAirport || fallback.destinationAirport || null,
    date: leg.date || fallback.date || '',
    time: leg.time || fallback.time || '09:00',
  }
}

function aircraftVisualStyle(imageUrl) {
  if (!imageUrl) {
    return {}
  }

  return {
    backgroundImage: `linear-gradient(135deg, rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.45)), url('${imageUrl}')`,
  }
}

function moneyValue(value) {
  const raw = String(value ?? '')
  if (!raw) return 0
  const normalized = raw.replace(/[^\d.-]/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function resultDisplayPrice(value = 0) {
  return formatCurrency(Number(value || 0) + RESULTS_SURCHARGE_USD)
}

function normalizePriorityCode(value = '') {
  return normalizePackageCode(value)
}

function airportDisplayName(code = '') {
  const normalizedCode = String(code || '').trim().toUpperCase()
  if (!normalizedCode) return 'Ruta por confirmar'

  const catalogAirport = featuredAirports.find((item) =>
    [item.code, item.iata].filter(Boolean).some((value) => String(value).trim().toUpperCase() === normalizedCode),
  )
  if (catalogAirport?.city) return catalogAirport.city

  const destination = featuredDestinations.value.find(
    (item) =>
      [item.code, item.iata].filter(Boolean).some((value) => String(value).trim().toUpperCase() === normalizedCode),
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

function formatTravelDateLabel(date = '', time = '') {
  if (!date) return 'Fecha por confirmar'

  const rawTime = time || '09:00'
  const parsed = new Date(`${date}T${rawTime}`)
  if (Number.isNaN(parsed.getTime())) return [date, time].filter(Boolean).join(' • ')

  const dateLabel = new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parsed)
  const timeLabel = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(parsed)

  return `${dateLabel} • Salida ${timeLabel}`
}

function itineraryHeadline(summary) {
  const legs = Array.isArray(summary?.legs) ? summary.legs.filter((leg) => leg?.origin || leg?.destination) : []
  if (!legs.length) return 'Tu vuelo privado'

  const tripType = String(summary?.tripType || '').trim()
  const firstLeg = legs[0]
  const lastLeg = legs[legs.length - 1]
  const firstOrigin = firstLeg.originAirport?.city || airportDisplayName(firstLeg.origin)
  const firstDestination = firstLeg.destinationAirport?.city || airportDisplayName(firstLeg.destination)
  const lastDestination = lastLeg.destinationAirport?.city || airportDisplayName(lastLeg.destination)

  if (tripType === 'Redondo' && firstOrigin && firstDestination) {
    return `${firstOrigin} → ${firstDestination} → ${firstOrigin}`
  }

  if (tripType === 'Multi-destino') {
    const routeStops = legs.reduce((stops, leg, index) => {
      const origin = leg.originAirport?.city || airportDisplayName(leg.origin)
      const destination = leg.destinationAirport?.city || airportDisplayName(leg.destination)

      if (index === 0 && origin) stops.push(origin)
      if (destination) stops.push(destination)

      return stops
    }, [])

    return routeStops.join(' → ')
  }

  return `${firstOrigin} → ${lastDestination || firstDestination}`
}

function itineraryDateLine(summary) {
  const legs = Array.isArray(summary?.legs) ? summary.legs.filter(Boolean) : []
  const firstLeg = legs[0]
  if (!firstLeg) return 'Fecha por confirmar'

  const datedLegs = legs.filter((leg) => String(leg?.date || '').trim())
  const firstDate = datedLegs[0]?.date || firstLeg.date || ''
  const lastDate = datedLegs[datedLegs.length - 1]?.date || firstDate
  const hasDateRange = firstDate && lastDate && firstDate !== lastDate
  const dateLabel = hasDateRange
    ? `${formatTravelDate(firstDate).split(',')[0]} - ${formatTravelDate(lastDate).split(',')[0]}`
    : formatTravelDateLabel(firstLeg.date, firstLeg.time)

  return dateLabel
}

function aircraftPriceCopy(aircraft) {
  const activePricing = aircraftPricingForType(aircraft, selectedPriorityType.value)
  if (activePricing.finalPrice) return resultDisplayPrice(activePricing.finalPrice)
  return 'Cotización inmediata'
}

function aircraftPriceValue(aircraft) {
  const activePricing = aircraftPricingForType(aircraft, selectedPriorityType.value)
  return activePricing.finalPrice || Number.MAX_SAFE_INTEGER
}

function aircraftReservationKey(aircraft = {}) {
  return String(aircraft?.match_id || aircraft?.matched_option_id || aircraft?.aircraft_id || aircraft?.id || '')
}

function isReservingAircraft(aircraft = {}) {
  return Boolean(aircraftReservationKey(aircraft)) && reservingAircraftId.value === aircraftReservationKey(aircraft)
}

function routeDistanceKmForAircraft(aircraft = {}) {
  return Number(
    aircraft.distance_km ||
      aircraft.pricing_breakdown?.client_legs?.reduce((sum, leg) => sum + Number(leg.distance_km || 0), 0) ||
      0,
  )
}

function aircraftPricingContext() {
  const pendingMultiDestinationLegs =
    tripType.value === 'Multi-destino' &&
    searchForm.legs.some((leg, index) => index > 0 && (!leg.origin || !leg.destination || !leg.date))

  return {
    packageCode: selectedPriorityType.value,
    attentionLevel: 'normal',
    tripType: activeItinerarySummary.value?.tripType || activeItinerarySummary.value?.trip_type || '',
    segmentCount: Array.isArray(activeItinerarySummary.value?.legs) ? activeItinerarySummary.value.legs.length : 0,
    overnightNights: activeItinerarySummary.value?.days || 0,
    legs: activeItinerarySummary.value?.legs || [],
    catering: activeItinerarySummary.value?.catering || '',
    wifi: activeItinerarySummary.value?.wifi || 'none',
    groundTransport: activeItinerarySummary.value?.groundTransport || 'none',
    pets: activeItinerarySummary.value?.pets || '',
    specialBaggage: activeItinerarySummary.value?.specialBaggage || '',
    repositioningRequired: pendingMultiDestinationLegs,
  }
}

function aircraftOperationalFlightHours(aircraft = {}) {
  const formula = buildFlightPricingFormula(aircraft, aircraftPricingContext())
  const operationalHours = formula.realFlightHours

  if (Number.isFinite(operationalHours) && operationalHours > 0) {
    return operationalHours
  }

  return 0
}

function aircraftDisplayFlightHours(aircraft = {}) {
  const operationalHours = aircraftOperationalFlightHours(aircraft)
  if (operationalHours > 0) return operationalHours

  const explicitVisibleHours = Number(aircraft.real_flight_hours || aircraft.flight_hours || 0)
  if (Number.isFinite(explicitVisibleHours) && explicitVisibleHours > 0) return explicitVisibleHours

  const distanceKm = routeDistanceKmForAircraft(aircraft)
  const speedKmh = Number(aircraft.speed_kmh || aircraft.speedKmh || 0)
  const climbDescentHours =
    Number(aircraft.climb_descent_hours || 0) ||
    Number(aircraft.climb_descent_minutes || aircraft.pricing_context?.climb_descent_minutes || 0) / 60

  if (distanceKm > 0 && speedKmh > 0) {
    return distanceKm / speedKmh + climbDescentHours
  }

  const estimatedHours = Number(aircraft.estimated_hours || 0)
  if (Number.isFinite(estimatedHours) && estimatedHours > 0) return estimatedHours

  return 0
}

function aircraftTimeValue(aircraft) {
  const explicitHours = aircraftDisplayFlightHours(aircraft)
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

function normalizeAmenityTerms(aircraft = {}) {
  return (Array.isArray(aircraft.amenities) ? aircraft.amenities : [])
    .filter(Boolean)
    .map((item) => String(item).toLowerCase())
}

function aircraftDecisionScore(aircraft = {}, index = 0) {
  const priceScore = 1 / Math.max(aircraftPriceValue(aircraft), 1)
  const timeScore = 1 / Math.max(aircraftTimeValue(aircraft), 1)
  const luxuryScore = aircraftPremiumValue(aircraft)
  const amenityScore = normalizeAmenityTerms(aircraft).length ? 1 : 0
  return luxuryScore * 12 + amenityScore * 8 + timeScore * 1500 + priceScore * 250000 + (index === 0 ? 24 : 0)
}

function aircraftClassLabel(aircraft = {}) {
  const normalized = String(aircraft.cabin || aircraft.category || '').toLowerCase()
  if (normalized.includes('helic')) return 'Helicoptero ejecutivo'
  if (normalized.includes('heavy') || normalized.includes('long')) return 'Heavy Jet'
  if (normalized.includes('mid')) return 'Midsize Jet'
  if (normalized.includes('light')) return 'Light Jet'
  if (normalized.includes('turbo')) return 'Turbo Prop Ejecutivo'
  return 'Jet ejecutivo'
}

function aircraftEmotionalCopy(aircraft = {}) {
  const cabin = String(aircraft.cabin || aircraft.category || '').toLowerCase()
  const capacity = Number(aircraft.capacity || 0)

  if (cabin.includes('helic')) return 'Perfecto para traslados ejecutivos de acceso rapido'
  if (cabin.includes('heavy') || cabin.includes('long')) return 'Cabina ideal para consejos, equipos senior y viajes VIP'
  if (cabin.includes('mid')) return 'Balance ideal entre presencia ejecutiva y eficiencia'
  if (cabin.includes('light')) return capacity >= 7 ? 'Ideal para grupos ejecutivos compactos' : 'Excelente para juntas privadas y traslados agiles'
  if (cabin.includes('turbo')) return 'Solucion eficiente para rutas regionales con valor real'
  return 'Experiencia privada lista para cerrar agenda sin friccion'
}

function formatDurationFromHours(hours = 0) {
  const normalizedHours = Number(hours || 0)
  if (!Number.isFinite(normalizedHours) || normalizedHours <= 0) return ''

  const totalMinutes = Math.max(Math.round(normalizedHours * 60), 0)
  const wholeHours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (wholeHours && minutes) return `${wholeHours} h ${minutes} min`
  if (wholeHours) return `${wholeHours} h`
  return `${minutes} min`
}

function inferredFlightWindowHours(aircraft = {}) {
  const directHours = aircraftDisplayFlightHours(aircraft)
  if (!Number.isFinite(directHours) || directHours <= 0) return null

  const cabin = String(aircraft.cabin || aircraft.category || '').toLowerCase()
  let spreadHours = 0.05

  if (cabin.includes('helic')) spreadHours = 0.08
  else if (cabin.includes('turbo')) spreadHours = 0.06
  else if (cabin.includes('light')) spreadHours = 0.05
  else if (cabin.includes('mid')) spreadHours = 0.05
  else spreadHours = 0.06

  return {
    min: directHours,
    max: Math.max(directHours + spreadHours, directHours),
  }
}

function aircraftDurationLabel(aircraft = {}) {
  const flightWindow = inferredFlightWindowHours(aircraft)
  if (flightWindow) {
    const minLabel = formatDurationFromHours(flightWindow.min)
    const maxLabel = formatDurationFromHours(flightWindow.max)
    if (minLabel && maxLabel && minLabel !== maxLabel) return `${minLabel} – ${maxLabel}`
    if (minLabel) return minLabel
  }

  const estimatedFlightHours = aircraftDisplayFlightHours(aircraft)
  const estimatedFlightLabel = formatDurationFromHours(estimatedFlightHours)
  if (estimatedFlightLabel) return estimatedFlightLabel

  return String(aircraft.time || aircraft.flight_time || activeItinerarySummary.value?.estimatedTime || '42 min')
}

function aircraftBillingHours(aircraft = {}) {
  const explicitBillableHours = Number(aircraft.billable_hours || 0)
  if (Number.isFinite(explicitBillableHours) && explicitBillableHours > 0) return explicitBillableHours

  const minimumHours = Number(aircraft.minimum_hours || 0)
  const displayHours = aircraftDisplayFlightHours(aircraft)
  return Math.max(displayHours, minimumHours, 0)
}

function aircraftBillingNote(aircraft = {}) {
  return ''
}

function aircraftCapacityLabel(aircraft = {}) {
  const raw = String(aircraft.capacity || '').match(/(\d+(?:\.\d+)?)/)
  const amount = Number(raw?.[1] || activeItinerarySummary.value?.passengers || 0)
  return amount ? `${amount} pasajeros` : 'Cabina privada'
}

function itineraryDepartureLabel(summary = {}) {
  const firstLeg = summary?.legs?.[0]
  if (!firstLeg?.time) return 'Salida por confirmar'
  const parsed = new Date(`${firstLeg.date || '2026-01-01'}T${firstLeg.time}`)
  if (Number.isNaN(parsed.getTime())) return `Salida ${firstLeg.time}`
  return `Salida ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(parsed)}`
}

function aircraftSpeedLine(aircraft = {}, summary = {}) {
  return `${aircraftDurationLabel(aircraft)} • ${itineraryDepartureLabel(summary)}`
}

function aircraftAvailabilityLabel(aircraft = {}, index = 0) {
  if (aircraft.response_time) return `Salida en ${String(aircraft.response_time).replace(/^[-\s]+/, '')}`
  if (index === 0) return 'Salida en 35 min'
  return 'Prioridad Alta'
}

function aircraftIncludes(aircraft = {}) {
  const amenities = Array.isArray(aircraft.amenities) ? aircraft.amenities.filter(Boolean) : []
  const hiddenAmenities = new Set(['wifi', 'catering', 'equipaje', 'traslado terrestre'])

  return [...new Set(amenities)]
    .filter((item) => !hiddenAmenities.has(String(item).trim().toLowerCase()))
    .slice(0, 4)
}

function aircraftVisibleForRoute(aircraft = {}, allAircraft = [], index = 0) {
  const normalizedCabin = String(aircraft.cabin || aircraft.category || '').toLowerCase()
  const isHelicopter = normalizedCabin.includes('helic')
  if (!isHelicopter) return true

  const distanceKm = routeDistanceKmForAircraft(aircraft)
  const efficientLimitKm = 320
  const aircraftRangeKm = Number(aircraft.range_km || aircraft.aircraft?.range_km || 0)
  const price = aircraftPriceValue(aircraft)
  const bestFixedWingPrice = allAircraft
    .filter((item) => !String(item.cabin || item.category || '').toLowerCase().includes('helic'))
    .reduce((min, item) => Math.min(min, aircraftPriceValue(item)), Number.POSITIVE_INFINITY)

  if (distanceKm > efficientLimitKm) return false
  if (aircraftRangeKm && distanceKm > aircraftRangeKm * 0.55) return false
  if (Number.isFinite(bestFixedWingPrice) && price > bestFixedWingPrice * 1.28 && index > 0) return false

  return true
}

function openTechnicalSheet(aircraft) {
  technicalAircraft.value = aircraft
  technicalSheetOpen.value = true
}

function closeTechnicalSheet() {
  technicalSheetOpen.value = false
  technicalAircraft.value = null
}

const technicalSheetInsights = computed(() => {
  const aircraft = technicalAircraft.value
  if (!aircraft) return []

  return [
    `Tiempo estimado ${aircraftDurationLabel(aircraft)} para esta ruta.`,
    aircraftBillingNote(aircraft) || 'Tarifa alineada a la operacion publicada por el operador.',
    `${aircraftEmotionalCopy(aircraft)}.`,
    `${aircraftPriceCopy(aircraft)} con una presentacion premium lista para cliente final.`,
  ].filter(Boolean)
})


function resolvePriorityOption(priorityType = 'essential') {
  const normalizedType = normalizePriorityCode(priorityType) || 'essential'
  const serverOption = flightPackages.value.find((item) => item.code === normalizedType)
  if (serverOption) return serverOption

  const fallback = defaultPriorityConfig[normalizedType] || defaultPriorityConfig.essential
  return {
    code: normalizedType,
    name:
      normalizedType === 'empty_leg'
        ? 'Empty Leg'
        : normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1),
    multiplier: fallback.multiplier,
    category: fallback.headline,
    benefits: [fallback.description],
  }
}

function calculatePriorityPricing(basePrice = 0, operationalFees = 0, multiplier = 1) {
  const normalizedBasePrice = Number(basePrice || 0)
  const normalizedOperationalFees = Number(operationalFees || 0)
  const normalizedMultiplier = Number(multiplier || 1)
  const priorityPrice = normalizedBasePrice * (normalizedMultiplier - 1)
  const finalPrice = normalizedBasePrice * normalizedMultiplier + normalizedOperationalFees

  return {
    basePrice: normalizedBasePrice,
    operationalFees: normalizedOperationalFees,
    priorityMultiplier: normalizedMultiplier,
    priorityPrice,
    finalPrice,
  }
}

function resolveAircraftOperationalFees(aircraft = {}) {
  const explicitFees =
    Number(aircraft.landing_fees || 0) +
    Number(aircraft.fbo_fees || 0) +
    Number(aircraft.fuel_surcharge || 0) +
    Number(aircraft.overnight_fees || 0) +
    Number(aircraft.taxes || 0)

  return explicitFees > 0 ? explicitFees : 0
}

function aircraftPricingForType(aircraft = {}, priorityType = 'essential') {
  const priorityMeta = resolvePriorityOption(priorityType)
  const formula = buildFlightPricingFormula(aircraft, {
    ...aircraftPricingContext(),
    packageCode: priorityType,
  })

  if (formula.hasFormulaInputs) {
    return {
      basePrice: formula.baseCost,
      operationalFees: formula.airportFees + formula.ivaAmount + formula.expensesTotal,
      priorityMultiplier: formula.commercialMargin,
      priorityPrice: Math.max(formula.finalPrice - formula.subtotalBeforeMultipliers, 0),
      finalPrice: formula.finalPrice,
      priorityType: priorityMeta.code,
      priorityName: priorityMeta.name,
      headline: 'Formula comercial aplicada',
      description: 'Incluye operacion, logistica y servicio ejecutivo.',
      savings: 0,
      routeBand: formula.routeBand?.code || '',
      routeMultiplier: formula.routeBand?.multiplier || 1,
      reserveHours: formula.reserveHours,
      rawFlightHours: formula.rawFlightHours,
      billableHours: formula.billableHours,
      realFlightHours: formula.realFlightHours,
      minimumHours: formula.minimumHours,
      minimumRoutePrice: formula.minimumRoutePrice,
      rawBaseCost: formula.rawBaseCost,
      repositioning: formula.repositioning,
      operationalCostBreakdown: formula.operationalCosts,
      extraServicesTotal: formula.extraServices.total,
      expenseFee: formula.expenseFee,
      ivaRate: formula.ivaRate,
      ivaAmount: formula.ivaAmount,
      dynamicMarketFloor: formula.dynamicMarketFloor,
      commercialMargin: formula.commercialMargin,
      attentionFactor: formula.priorityFactor,
      subtotalBeforeMultipliers: formula.subtotalBeforeMultipliers,
      formattedBasePrice: formatCurrency(formula.baseCost),
      formattedPriorityPrice: formatCurrency(Math.max(formula.finalPrice - formula.subtotalBeforeMultipliers, 0)),
      formattedOperationalFees: formatCurrency(formula.airportFees + formula.ivaAmount + formula.expensesTotal),
      formattedFinalPrice: formatCurrency(formula.finalPrice),
      formattedSavings: formatCurrency(0),
      formattedSubtotalBeforeMultipliers: formatCurrency(formula.subtotalBeforeMultipliers),
    }
  }

  const displayedPrice = moneyValue(aircraft.final_price)
  const operationalFees = resolveAircraftOperationalFees(aircraft)
  const currentType = normalizePriorityCode(aircraft.priority_type || 'essential')
  const currentMultiplier = Number(aircraft.priority_multiplier || 1) || 1
  let basePrice = Number(aircraft.base_price || 0)

  if (!basePrice) {
    if (currentType === 'essential') {
      basePrice = Math.max(displayedPrice - operationalFees, 0)
    } else if (displayedPrice && currentMultiplier) {
      basePrice = Math.max((displayedPrice - operationalFees) / currentMultiplier, 0)
    } else {
      basePrice = Number(aircraft.total || aircraft.subtotal || displayedPrice || 0)
    }
  }

  const pricing = calculatePriorityPricing(basePrice, operationalFees, Number(priorityMeta.multiplier || 1))
  const essentialPricing = calculatePriorityPricing(basePrice, operationalFees, 1)
  const savings = Math.max(essentialPricing.finalPrice - pricing.finalPrice, 0)

  return {
    ...pricing,
    priorityType: priorityMeta.code,
    priorityName: priorityMeta.name,
    headline: priorityMeta.category || '',
    description: priorityMeta.benefits?.[0] || '',
    savings,
    formattedBasePrice: formatCurrency(pricing.basePrice),
    formattedPriorityPrice: formatCurrency(pricing.priorityPrice),
    formattedOperationalFees: formatCurrency(pricing.operationalFees),
    formattedFinalPrice: formatCurrency(pricing.finalPrice),
    formattedSavings: formatCurrency(savings),
  }
}

function logRenderedQuoteBreakdown(aircraftList = [], quotePayload = {}) {
  if (typeof console === 'undefined' || !aircraftList.length) return

  const rows = aircraftList.map((aircraft, index) => {
    const pricing = aircraftPricingForType(aircraft, selectedPriorityType.value)
    const firstLeg = Array.isArray(quotePayload.legs) ? quotePayload.legs[0] || {} : {}
    const lastLeg = Array.isArray(quotePayload.legs) ? quotePayload.legs[quotePayload.legs.length - 1] || {} : {}
    const baseAirport = aircraft.source_origin || aircraft.base_airport || ''
    let repositioningReason = 'Sin reposicionamiento'

    if (Number(pricing.repositioning || 0) > 0) {
      if (quotePayload.repositioningRequired === true) {
        repositioningReason = 'Reposicionamiento preventivo por multi-destino incompleto'
      } else if (baseAirport && firstLeg.origin && baseAirport !== firstLeg.origin) {
        repositioningReason = `Salida fuera de base: ${baseAirport} -> ${firstLeg.origin}`
      } else if (baseAirport && lastLeg.destination && baseAirport !== lastLeg.destination) {
        repositioningReason = `Regreso a base pendiente desde ${lastLeg.destination} hacia ${baseAirport}`
      } else {
        repositioningReason = 'Reposicionamiento aplicado por reglas de cotizacion'
      }
    }

    return {
      option: index + 1,
      aircraft: aircraft.aircraft || aircraft.model || aircraft.cabin || 'Aeronave',
      category: aircraft.cabin || aircraft.category || '',
      base_price: Number(pricing.basePrice || 0),
      repositioning: Number(pricing.repositioning || 0),
      operational_fees: Number(pricing.operationalFees || 0),
      operational_costs: Number(pricing.operationalCostBreakdown || 0),
      extra_services_total: Number(pricing.extraServicesTotal || 0),
      expense_fee: Number(pricing.expenseFee || 0),
      iva_amount: Number(pricing.ivaAmount || 0),
      subtotal_before_multipliers: Number(pricing.subtotalBeforeMultipliers || 0),
      final_price: Number(pricing.finalPrice || 0),
      billable_hours: Number(pricing.billableHours || 0),
      real_flight_hours: Number(pricing.realFlightHours || 0),
      repositioning_required: quotePayload.repositioningRequired === true,
      repositioning_reason: repositioningReason,
      source_origin: aircraft.source_origin || aircraft.base_airport || '',
    }
  })

  console.log('[client-quote-ui] payload enviado al cotizador', quotePayload)
  console.table(rows)
}

const selectedAircraftPricing = computed(() => {
  return aircraftPricingForType(selectedAircraft.value || {}, selectedPriorityType.value)
})

function packageFlowCopy(packageCode = '') {
  const normalized = normalizePriorityCode(packageCode)

  if (normalized === 'business') {
    return {
      priceLabel: 'Sin costo adicional',
      headline: 'Atencion prioritaria, mayor flexibilidad y coordinacion mas agil.',
      support: 'Ideal para respuesta rapida y mayor personalizacion.',
      accent: '+ Prioridad + Flexibilidad',
    }
  }

  if (normalized === 'elite') {
    return {
      priceLabel: 'Sin costo adicional',
      headline: 'Prioridad maxima, concierge dedicado y gestion personalizada.',
      support: 'Ideal para control total y asistencia premium.',
      accent: '+ Concierge + Prioridad Maxima',
    }
  }

  return {
    priceLabel: 'Incluido en tu reserva',
    headline: 'Proceso privado estandar con cotizacion, validacion y confirmacion.',
    support: 'Ideal para una reserva clara y eficiente.',
    accent: 'Incluido en tu reserva',
  }
}

function packagePriceLabel(flightPackage) {
  return packageFlowCopy(flightPackage?.code).priceLabel
}

function packageButtonLabel(flightPackage) {
  const normalized = normalizePriorityCode(flightPackage?.code)
  const isSelected = selectedPriorityType.value === normalized

  if (normalized === 'essential') {
    return isSelected ? 'Plan Actual' : 'Elegir Essential'
  }

  if (normalized === 'business') {
    return isSelected ? 'Seleccionado' : 'Mejorar a Business'
  }

  if (normalized === 'elite') {
    return isSelected ? 'Seleccionado' : 'Acceder a Elite'
  }

  return isSelected ? 'Seleccionado' : `Elegir ${flightPackage?.name || 'plan'}`
}

function selectPriority(flightPackage) {
  if (!flightPackage?.code) return
  selectedPriorityType.value = flightPackage.code
}

function ensureDefaultPriority(packages = []) {
  if (!packages.length) {
    if (!selectedPriorityType.value) selectedPriorityType.value = 'essential'
    return
  }
  const hasCurrent = packages.some((item) => item.code === selectedPriorityType.value)
  if (hasCurrent) return

  const essentialPackage = packages.find((item) => item.code === 'essential')
  selectedPriorityType.value = essentialPackage?.code || packages[0]?.code || 'essential'
}

function go(section, id = '') {
  profileMenuOpen.value = false
  router.push(id ? `/cliente/${section}/${id}` : `/cliente/${section}`)
}

function selectDestination(destination) {
  if (tripType.value === 'Multi-destino') {
    const lastLeg = searchForm.legs[searchForm.legs.length - 1]
    const hasEmptyLastDestination = lastLeg && !lastLeg.destination

    if (hasEmptyLastDestination) {
      lastLeg.destination = destination.code
      lastLeg.destinationAirport = destination
      syncMultiDestinationChain(searchForm.legs.length)
      return
    }

    searchForm.legs.push(
      createEmptyLeg({
        origin: lastLeg?.destination || searchForm.destination,
        originAirport: lastLeg?.destinationAirport || searchForm.destinationAirport,
        destination: destination.code,
        destinationAirport: destination,
        date: lastLeg?.date || searchForm.departureDate,
        time: lastLeg?.time || searchForm.departureTime || '09:00',
      }),
    )
    return
  }

  searchForm.destination = destination.code
}

function updateSearchField({ field, value }) {
  if (!Object.prototype.hasOwnProperty.call(searchForm, field)) return
  searchForm[field] = value

  if (field === 'origin') {
    searchForm.originAirport = null
  }

  if (field === 'destination') {
    searchForm.destinationAirport = null
  }
}

function syncMultiDestinationChain(startIndex = 1) {
  for (let index = Math.max(startIndex, 1); index < searchForm.legs.length; index += 1) {
    const previousLeg = searchForm.legs[index - 1]
    const currentLeg = searchForm.legs[index]

    if (!previousLeg || !currentLeg) continue

    currentLeg.origin = previousLeg.destination || ''
    currentLeg.originAirport = previousLeg.destinationAirport || null
  }
}

function updateLegField({ index, field, value }) {
  if (!searchForm.legs[index] || !Object.prototype.hasOwnProperty.call(searchForm.legs[index], field)) return
  searchForm.legs[index][field] = value

  if (field === 'origin' && Object.prototype.hasOwnProperty.call(searchForm.legs[index], 'originAirport')) {
    searchForm.legs[index].originAirport = null
  }

  if (field === 'destination' && Object.prototype.hasOwnProperty.call(searchForm.legs[index], 'destinationAirport')) {
    searchForm.legs[index].destinationAirport = null
  }

  if (tripType.value === 'Multi-destino' && field === 'destination') {
    syncMultiDestinationChain(index + 1)
  }
}

function selectFormAirport({ field, airport }) {
  if (field === 'origin') {
    searchForm.originAirport = airport
  }

  if (field === 'destination') {
    searchForm.destinationAirport = airport
  }
}

function selectLegAirport({ index, field, airport }) {
  if (!searchForm.legs[index]) return

  if (field === 'origin' && Object.prototype.hasOwnProperty.call(searchForm.legs[index], 'originAirport')) {
    searchForm.legs[index].originAirport = airport
  }

  if (
    field === 'destination' &&
    Object.prototype.hasOwnProperty.call(searchForm.legs[index], 'destinationAirport')
  ) {
    searchForm.legs[index].destinationAirport = airport
  }

  if (tripType.value === 'Multi-destino' && field === 'destination') {
    syncMultiDestinationChain(index + 1)
  }
}

function addLeg() {
  const lastLeg = searchForm.legs[searchForm.legs.length - 1] || {}
  searchForm.legs.push(
    createEmptyLeg({
    origin: lastLeg.destination || '',
    originAirport: lastLeg.destinationAirport || null,
    destination: '',
    destinationAirport: null,
    date: lastLeg.date || searchForm.departureDate,
    time: lastLeg.time || '09:00',
    }),
  )
  syncMultiDestinationChain(searchForm.legs.length - 1)
}

function removeLeg(index) {
  if (searchForm.legs.length <= 2) return
  searchForm.legs.splice(index, 1)
  if (tripType.value === 'Multi-destino') {
    syncMultiDestinationChain(index)
  }
}

function buildItinerarySummary(payload) {
  const legs = Array.isArray(payload.legs) ? payload.legs.map((leg) => normalizeLegForQuote(leg)) : []
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
    pets: payload.pets || '',
    specialBaggage: payload.special_baggage || '',
    catering: payload.catering || '',
    groundTransport: payload.ground_transport || payload.groundTransport || 'none',
    wifi: payload.wifi || 'none',
    overnight: (Number(payload.overnight_nights || payload.days || 0) || 0) > 0 ? 'yes' : 'no',
    attentionLevel: normalizeAttentionLevel(payload.attention_level || payload.priority_level || ''),
    scheduleFlexibility: payload.schedule_flexibility || 'flexible',
    preference: payload.preference,
    cabin: '',
    estimatedTime: '',
    estimatedTotal: '',
    flightPackage: payload.flight_package || '',
    priorityType: payload.priority_type || 'essential',
  }
}

function hasPendingMultiDestinationLegs() {
  if (tripType.value !== 'Multi-destino') return false

  return searchForm.legs.some((leg, index) => index > 0 && (!leg.origin || !leg.destination || !leg.date))
}

function validateSearchForm() {
  const firstLeg = itineraryLegs.value[0] || {}
  const secondLeg = itineraryLegs.value[1] || {}
  const incompleteMultiLeg = itineraryLegs.value.findIndex((leg) => !leg.origin || !leg.destination || !leg.date)
  const pendingMultiDestinationLegs = hasPendingMultiDestinationLegs()

  if (!firstLeg.origin || !firstLeg.destination || !firstLeg.date) {
    serverSearchError.value = 'Completa origen, destino y fecha para ver opciones disponibles.'
    ui.pushToast({
      tone: 'warning',
      title: 'Datos del viaje incompletos',
      message: 'Necesitamos origen, destino y fecha para preparar opciones privadas.',
    })
    return false
  }

  if (tripType.value !== 'Ida' && itineraryLegs.value.length < 2 && !(tripType.value === 'Multi-destino' && pendingMultiDestinationLegs)) {
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

  if (tripType.value === 'Redondo' && (!secondLeg.date || !secondLeg.origin || !secondLeg.destination)) {
    serverSearchError.value = 'Completa la fecha de regreso para cotizar tu viaje redondo.'
    ui.pushToast({
      tone: 'warning',
      title: 'Regreso pendiente',
      message: 'Agrega la fecha de regreso para completar el viaje redondo.',
    })
    return false
  }

  if (tripType.value === 'Multi-destino' && incompleteMultiLeg !== -1 && !pendingMultiDestinationLegs) {
    serverSearchError.value = `Completa origen, destino y fecha del tramo ${incompleteMultiLeg + 1}.`
    ui.pushToast({
      tone: 'warning',
      title: 'Tramo pendiente',
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
  aircraftOptions.value = []
  try {
    const normalizedPassengers = Number(searchForm.passengers || 0) || 1
    const pendingMultiDestinationLegs = hasPendingMultiDestinationLegs()
    searchForm.passengers = String(normalizedPassengers)
    const quotePayload = {
      trip_type: tripTypeKey.value,
      trip_label: tripType.value,
      passengers: normalizedPassengers,
      pets: searchForm.pets,
      special_baggage: searchForm.specialBaggage,
      preference: searchForm.preference,
      flight_package: selectedPriorityMeta.value?.name || '',
      priority_type: selectedPriorityType.value,
      legs: itineraryLegs.value.map((leg) => normalizeLegForQuote(leg)),
      repositioningRequired: pendingMultiDestinationLegs,
    }
    submittedItinerary.value = buildItinerarySummary(quotePayload)
    ui.pushToast({
      tone: 'success',
      title: 'Cotizando itinerario',
      message: pendingMultiDestinationLegs
        ? 'Cotizando el tramo confirmado con reposicionamiento preventivo.'
        : 'Validando aeropuertos, tramos y operadores activos.',
    })
    go('resultados')
    aircraftOptions.value = await searchClientFlights(quotePayload)
    logRenderedQuoteBreakdown(aircraftOptions.value, quotePayload)
    if (!aircraftOptions.value.length) {
      serverSearchError.value = 'No fue posible generar una cotizacion real para este itinerario con la informacion actual.'
    }
  } catch (error) {
    const message = error?.message || 'No fue posible consultar el cotizador en este momento. Intenta de nuevo.'
    aircraftOptions.value = []
    serverSearchError.value = message
    ui.pushToast({
      tone: 'error',
      title: 'Cotizador no disponible',
      message,
    })
  } finally {
    searching.value = false
  }
}

async function requestReservation(aircraft = selectedAircraft.value) {
  if (!aircraft || reservingAircraftId.value) return

  try {
    reservingAircraftId.value = aircraftReservationKey(aircraft)
    const normalizedPassengers = Number(activeItinerarySummary.value.passengers || searchForm.passengers || 0) || 1
    const pricing = aircraftPricingForType(aircraft, selectedPriorityType.value)
    const pricingContext = buildCommercialSnapshot(
      {
        packageCode: pricing.priorityType,
        priorityType: pricing.priorityType,
        attentionLevel: 'normal',
        overnightNights: activeItinerarySummary.value.days || 0,
        catering: activeItinerarySummary.value.catering || '',
        wifi: activeItinerarySummary.value.wifi || 'none',
        groundTransport: activeItinerarySummary.value.groundTransport || 'none',
        pets: activeItinerarySummary.value.pets || '',
        specialBaggage: activeItinerarySummary.value.specialBaggage || '',
      },
      pricing,
      aircraft,
    )
    const reservationPayload = {
      trip_type: tripTypeKey.value,
      trip_label: tripType.value,
      passengers: normalizedPassengers,
      pets: activeItinerarySummary.value.pets,
      special_baggage: activeItinerarySummary.value.specialBaggage,
      preference: aircraft.cabin || aircraft.aircraft,
      flight_package: selectedPriorityMeta.value?.name || '',
      service_tier: selectedPriorityMeta.value?.name || '',
      match_id: aircraft.match_id || aircraft.matched_option_id || aircraft.id || null,
      matched_option_id:
        aircraft.matched_option_id || aircraft.match_id || aircraft.id || null,
      aircraft_id: aircraft.aircraft_id || aircraft.id || null,
      provider_id: aircraft.provider_id || aircraft.provider?.id || null,
      priority_type: pricing.priorityType,
      priority_multiplier: pricing.priorityMultiplier,
      base_price: Number(pricing.basePrice.toFixed(2)),
      operational_fee: Number(pricing.operationalFees.toFixed(2)),
      priority_price: Number(pricing.priorityPrice.toFixed(2)),
      final_price: Number(pricing.finalPrice.toFixed(2)),
      pricing_context: pricingContext,
      pricing_formula_version: pricingContext.pricing_formula_version,
      commercial_margin: pricingContext.commercial_margin,
      priority_factor: pricingContext.priority_factor,
      billable_hours: pricingContext.billable_hours,
      real_flight_hours: pricingContext.real_flight_hours,
      minimum_hours: pricingContext.minimum_hours,
      minimum_route_price: pricingContext.minimum_route_price,
      subtotal_before_multipliers: pricingContext.subtotal_before_multipliers,
      extra_services_total: pricingContext.extra_services_total,
      aircraft_snapshot: aircraft,
      source_database: aircraft.source_database || null,
      source_table: aircraft.source_table || null,
      legs: activeItinerarySummary.value.legs.map((leg) => ({ ...leg })),
    }
    const reservation = await createClientFlightRequest(reservationPayload, { timeoutMs: 60000 })
    const createdReservationId = reservation?.data?.id || reservation?.id || selectedTripId.value || ''
    const refreshedReservations = await getClientTrips({ timeoutMs: 20000 })
    if (refreshedReservations.length) {
      reservations.value = refreshedReservations
    }
    const targetReservationId = createdReservationId || refreshedReservations[0]?.id || ''
    ui.pushToast({
      tone: 'success',
      title: 'Tu vuelo esta siendo confirmado por Red Aviation',
      message: 'Tu reserva ya entro al flujo comercial y operativo.',
    })
    go('reserva-confirmada', targetReservationId)
  } catch (error) {
    const message = error?.message || 'Intenta de nuevo o contacta a tu asesor privado.'
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo solicitar la reserva',
      message,
    })
  } finally {
    reservingAircraftId.value = ''
  }
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
  serverSearchError.value = ''

  try {
    const [destinationsResult, plansResult, tripsResult] = await Promise.allSettled([
      getClientDestinations(),
      getClientFlightPackages(),
      getClientTrips(),
    ])

    const destinations = destinationsResult.status === 'fulfilled' ? destinationsResult.value : []
    const plans = plansResult.status === 'fulfilled' ? plansResult.value : []
    const trips = tripsResult.status === 'fulfilled' ? tripsResult.value : []

    featuredDestinations.value = destinations
    flightPackages.value = plans
    ensureDefaultPriority(plans)
    reservations.value = trips
  } finally {
    loadingServerData.value = false
  }
}

onMounted(loadServerData)

watch(
  tripType,
  (nextType) => {
    if (nextType === 'Ida') {
      return
    }

    if (nextType === 'Redondo') {
      searchForm.returnDate = searchForm.returnDate || searchForm.departureDate
      searchForm.returnTime = searchForm.returnTime || searchForm.departureTime || '09:00'
      return
    }

    if (nextType === 'Multi-destino') {
      const firstLeg = createEmptyLeg({
        origin: searchForm.origin,
        originAirport: searchForm.originAirport,
        destination: searchForm.destination,
        destinationAirport: searchForm.destinationAirport,
        date: searchForm.departureDate,
        time: searchForm.departureTime || '09:00',
      })
      const secondLeg = createEmptyLeg({
        origin: firstLeg.destination || '',
        originAirport: firstLeg.destinationAirport || null,
        destination: '',
        destinationAirport: null,
        date: searchForm.departureDate,
        time: searchForm.departureTime || '09:00',
      })

      searchForm.legs = [firstLeg, secondLeg]
    }
  },
  { immediate: true },
)

watch(
  [bookingStep, hasSearchContext],
  ([step, hasContext]) => {
    if (step === 'resultados' && !hasContext) {
      router.replace('/cliente/reservar')
    }
  },
  { immediate: true },
)
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

      <section v-if="activeSection === 'reservar'" class="screen">
        <FlightSearchHero
          v-if="bookingStep === 'reservar'"
          :form="searchForm"
          :summary="itinerarySummary"
          :trip-type="tripType"
          @add-leg="addLeg"
          @remove-leg="removeLeg"
          @submit="submitSearch"
          @select-form-airport="selectFormAirport"
          @select-leg-airport="selectLegAirport"
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
        <div class="screen-head results-head results-head-premium">
          <span class="eyebrow">Luxury concierge selection</span>
          <h2>{{ itineraryHeadline(activeItinerarySummary) }}</h2>
          <p>{{ itineraryDateLine(activeItinerarySummary) }}</p>
          <strong class="results-headline-hook">Tu asesor privado ha seleccionado las mejores opciones para esta ruta.</strong>
          <span class="results-subhook">Opciones verificadas segun velocidad, costo y nivel de experiencia.</span>
        </div>

          <div class="filter-toolbar">
            <div class="filter-toolbar__copy">
              <span>Comparar por</span>
              <strong>Prioriza criterio experto, inversion, rapidez o exclusividad.</strong>
            </div>
            <div class="filter-row">
              <button
                v-for="filter in resultFilterOptions"
                :key="filter.key"
                :aria-pressed="activeResultFilter === filter.key"
                :class="{ 'active-filter': activeResultFilter === filter.key }"
                type="button"
                @click="activeResultFilter = filter.key"
              >
                <strong>{{ filter.label }}</strong>
              </button>
            </div>
          </div>

          <div v-if="searching" class="loading-band">Haciendo match con operadores activos...</div>
          <div v-else-if="serverSearchError" class="empty-state">{{ serverSearchError }}</div>

          <article v-if="featuredAircraft" class="aircraft-hero-card">
            <div
              class="aircraft-thumb aircraft-thumb-hero"
              :class="{ 'aircraft-thumb--placeholder': !featuredAircraft.image_url }"
              :style="aircraftVisualStyle(featuredAircraft.image_url)"
            >
              <img
                v-if="featuredAircraft.image_url"
                :src="featuredAircraft.image_url"
                :alt="featuredAircraft.aircraft"
                loading="lazy"
              />
              <span v-else class="aircraft-thumb__empty">Imagen en validación</span>
              <span class="aircraft-thumb__badge">{{ aircraftClassLabel(featuredAircraft) }}</span>
            </div>

            <div class="aircraft-hero-copy">
              <h3>{{ featuredAircraft.aircraft }}</h3>
              <p class="aircraft-time-line">{{ aircraftSpeedLine(featuredAircraft, activeItinerarySummary) }}</p>
              <p v-if="aircraftBillingNote(featuredAircraft)" class="aircraft-billing-note">
                {{ aircraftBillingNote(featuredAircraft) }}
              </p>
              <p class="hero-price-label">Tarifa estimada total</p>
              <strong class="hero-price">{{ aircraftPriceCopy(featuredAircraft) }}</strong>
              <p class="hero-service-copy">Incluye operacion, logistica y servicio ejecutivo.</p>
              <div class="hero-includes">
                <span v-for="item in aircraftIncludes(featuredAircraft)" :key="item">{{ item }}</span>
              </div>
            </div>
            <div class="hero-actions">
             
              <button type="button" :disabled="Boolean(reservingAircraftId)" @click="requestReservation(featuredAircraft)">
                {{ isReservingAircraft(featuredAircraft) ? 'Reservando...' : 'Reservar' }}
              </button>
            </div>
          </article>

          <div v-if="secondaryAircraftOptions.length" class="aircraft-list aircraft-list-compact">
            <article
              v-for="(aircraft, index) in secondaryAircraftOptions"
              :key="aircraft.id"
              class="aircraft-card aircraft-card-compact"
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
                <span class="aircraft-thumb__badge">{{ aircraftClassLabel(aircraft) }}</span>
              </div>
              <div class="aircraft-copy">
                <div class="aircraft-card-head">
                  <div class="aircraft-card-head__copy">
                    <span class="eyebrow">Opcion privada</span>
                    <h3>{{ aircraft.aircraft }}</h3>
                    <p class="aircraft-time-line">{{ aircraftSpeedLine(aircraft, activeItinerarySummary) }}</p>
                    <p v-if="aircraftBillingNote(aircraft)" class="aircraft-billing-note">
                      {{ aircraftBillingNote(aircraft) }}
                    </p>
                  </div>
                </div>
                <p class="aircraft-price-line">
                  <span>Tarifa estimada total</span>
                  <strong>{{ aircraftPriceCopy(aircraft) }}</strong>
                </p>
              </div>
              <div class="card-actions">
                
                <button type="button" :disabled="Boolean(reservingAircraftId)" @click="requestReservation(aircraft)">
                  {{ isReservingAircraft(aircraft) ? 'Reservando...' : 'Reservar' }}
                </button>
              </div>
            </article>
          </div>
        </template>

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
          <strong v-if="selectedAircraftPricing?.formattedFinalPrice">{{ selectedAircraftPricing.formattedFinalPrice }}</strong>
          <button type="button" @click="go('reserva-confirmada', routeId)">Pagar</button>
        </article>

        <article v-else-if="props.section === 'reserva-confirmada'" class="document-panel confirmation-panel">
          <span class="eyebrow">Reserva confirmada</span>
          <h2>Tu vuelo esta siendo confirmado por Red Aviation</h2>
          <p>
            Ya puedes dar seguimiento desde Mis vuelos. Cuando la operacion quede cerrada veras
            el estado como confirmado junto con terminal, tripulacion y tracking.
          </p>
          <div class="signature-box confirmation-box">
            <strong>Estado actual</strong>
            <span>Reserva registrada y seguimiento activado.</span>
          </div>
          <div class="confirmation-actions">
            <button type="button" @click="go('viajes', routeId)">Ver mis vuelos</button>
            <button class="secondary-button" type="button" @click="go('soporte')">Asesor privado 24/7</button>
          </div>
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

      <section v-else class="screen">
        <div v-if="activeSection === 'perfil'" class="screen-head">
          <span class="eyebrow">Perfil</span>
          <h2>Tu cuenta vuela mejor cuando ya te conoce</h2>
          <p>Guarda datos, viajeros frecuentes y preferencias para reservar en segundos la siguiente vez.</p>
        </div>

        <template v-if="activeSection === 'perfil'">
          <div class="profile-cards">
            <article class="profile-highlight-card">
              <span class="eyebrow">Viajeros frecuentes</span>
              <h3>CEO, familia o equipo ejecutivo</h3>
              <p>Deja perfiles guardados para acelerar futuras reservas y reducir friccion operativa.</p>
            </article>
            <article class="profile-highlight-card">
              <span class="eyebrow">Facturacion</span>
              <h3>Pagos y datos listos</h3>
              <p>Metodo de pago, razon social y datos de contacto siempre a mano dentro del mismo flujo.</p>
            </article>
          </div>

          <form class="profile-form">
            <label>Nombre<input :value="auth.user?.name || 'Miembro Red Aviation'" /></label>
            <label>Telefono<input placeholder="+52 55 0000 0000" /></label>
            <label>Empresa<input :value="auth.user?.company_name || ''" placeholder="Empresa" /></label>
            <label>Correo<input :value="auth.user?.email || 'miembro@redaviation.test'" /></label>
            <label>Pasaporte / ID<input placeholder="Documento principal" /></label>
            <label>Metodo de pago<input placeholder="Tarjeta corporativa o transferencia" /></label>
            <label>Facturacion<input placeholder="RFC / razon social" /></label>
            <label>Seguridad<input placeholder="NDA, privacidad, requerimientos" /></label>
            <label class="wide">Preferencias<textarea placeholder="Catering, mascotas, FBO, privacidad, asistencia especial"></textarea></label>
          </form>
        </template>

        <div v-else class="profile-cards">
          <article class="profile-highlight-card">
            <span class="eyebrow">Reserva activa</span>
            <h3>Tu cuenta ya puede buscar y cotizar</h3>
            <p>Centraliza rutas, preferencias y seguimiento sin depender de una vista adicional.</p>
          </article>
          <article class="profile-highlight-card">
            <span class="eyebrow">Siguiente paso</span>
            <h3>Vuelve al cotizador</h3>
            <p>Usa el flujo de reserva para crear nuevas solicitudes y revisar tus vuelos vigentes.</p>
          </article>
        </div>
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
        {{ item.label }}
      </button>
    </nav>

    <transition name="sheet-fade">
      <div v-if="technicalSheetOpen && technicalAircraft" class="technical-sheet-backdrop" @click.self="closeTechnicalSheet">
        <section class="technical-sheet">
          <div class="technical-sheet__hero">
            <div class="technical-sheet__media" :style="aircraftVisualStyle(technicalAircraft.image_url)">
              <img
                v-if="technicalAircraft.image_url"
                :src="technicalAircraft.image_url"
                :alt="technicalAircraft.aircraft"
                loading="lazy"
              />
            </div>
            <div class="technical-sheet__copy">
              <span class="eyebrow">Ficha ejecutiva</span>
              <h3>{{ technicalAircraft.aircraft }}</h3>
              <p>{{ aircraftDurationLabel(technicalAircraft) }}</p>
              <strong>{{ aircraftPriceCopy(technicalAircraft) }}</strong>
            </div>
            <button class="technical-sheet__close" type="button" @click="closeTechnicalSheet">Cerrar</button>
          </div>

          <div class="technical-sheet__body">
            <div class="technical-sheet__map">
              <span>{{ itineraryHeadline(activeItinerarySummary) }}</span>
              <strong>{{ routeDistanceKmForAircraft(technicalAircraft) || 'Ruta' }} km</strong>
            </div>

            <div class="technical-sheet__stats">
              <article>
                <span>Ventana de vuelo</span>
                <strong>{{ aircraftDurationLabel(technicalAircraft) }}</strong>
              </article>
              <article>
                <span>Cabina</span>
                <strong>{{ aircraftClassLabel(technicalAircraft) }}</strong>
              </article>
              <article>
                <span>Capacidad</span>
                <strong>{{ aircraftCapacityLabel(technicalAircraft) }}</strong>
              </article>
            </div>

            <div class="technical-sheet__insights">
              <span class="eyebrow">Insights automáticos</span>
              <ul>
                <li v-for="insight in technicalSheetInsights" :key="insight">{{ insight }}</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </transition>

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
  grid-template-columns: minmax(280px, 350px) minmax(0, 1fr) minmax(180px, 220px);
  gap: 0.85rem;
  align-items: stretch;
  padding: 0.85rem;
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(249, 246, 240, 0.96));
  box-shadow:
    0 18px 46px rgba(17, 17, 17, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.92);
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    border-color 180ms ease;
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
  min-height: 240px;
  border-radius: 18px;
  background:
    radial-gradient(circle at top right, rgba(255, 255, 255, 0.32), transparent 24%),
    linear-gradient(135deg, #242424, #0f0f0f);
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

.aircraft-thumb::before,
.aircraft-visual::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(125deg, rgba(255, 255, 255, 0.28), transparent 28%, transparent 72%, rgba(255, 255, 255, 0.16));
  mix-blend-mode: screen;
  pointer-events: none;
  z-index: 0;
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

.aircraft-smart-badges {
  position: absolute;
  right: 0.85rem;
  bottom: 0.85rem;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.4rem;
  max-width: calc(100% - 1.7rem);
}

.aircraft-smart-badges span {
  display: inline-flex;
  align-items: center;
  min-height: 1.85rem;
  padding: 0.28rem 0.68rem;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 999px;
  background: rgba(17, 17, 17, 0.6);
  color: #ffffff;
  font-size: 0.72rem;
  font-weight: 800;
  backdrop-filter: blur(14px);
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
  gap: 0.72rem;
  align-content: start;
}

.aircraft-model {
  color: #5e5b55;
  font-size: 0.94rem;
  font-weight: 700;
}

.aircraft-price-line {
  display: flex;
  flex-wrap: wrap;
  gap: 0.18rem;
  flex-direction: column;
  align-items: flex-start;
  margin: 0;
}

.aircraft-price-line > span {
  color: #7a6a53;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.aircraft-price-line strong {
  color: #111111;
  font-size: clamp(1.7rem, 2.2vw, 2.2rem);
  line-height: 0.95;
}

.aircraft-price-line small {
  color: #6d6252;
  font-size: 0.92rem;
  font-weight: 600;
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

.aircraft-card:hover,
.aircraft-hero-card:hover {
  transform: translateY(-2px);
  box-shadow:
    0 24px 54px rgba(17, 17, 17, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.96);
}

.results-head-premium {
  gap: 0.8rem;
}

.results-headline-hook {
  color: #171717;
  font-size: 1.02rem;
  font-weight: 800;
}

.results-subhook {
  color: #746652;
  font-size: 0.96rem;
}

.filter-toolbar__copy span {
  margin: 0.18rem 0 0;
  color: #63584a;
  font-size: 0.92rem;
  line-height: 1.45;
}

.filter-toolbar {
  display: grid;
  gap: 0.75rem;
  padding: 1rem 1.05rem;
  border: 1px solid #ece4d5;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255, 250, 242, 0.9), #ffffff);
}

.filter-toolbar__copy {
  display: grid;
  gap: 0.18rem;
}

.filter-toolbar__copy span {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.filter-toolbar__copy strong {
  color: #171717;
  font-size: 1rem;
}

.filter-row button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 3.35rem;
  padding: 0.75rem 1.1rem;
  border: 1px solid #e5ddcf;
  border-radius: 16px;
  background: #fffdfa;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.filter-row button strong {
  font-size: 0.88rem;
  font-weight: 800;
  color: #171717;
  text-align: center;
}

.filter-row button:hover {
  border-color: rgba(191, 151, 65, 0.38);
  box-shadow: 0 10px 24px rgba(17, 17, 17, 0.06);
  transform: translateY(-1px);
}

.aircraft-hero-card {
  display: grid;
  grid-template-columns: minmax(220px, 270px) minmax(0, 1fr) minmax(170px, 210px);
  gap: 0.75rem;
  min-height: 300px;
  padding: 0.8rem;
  border: 1px solid rgba(191, 151, 65, 0.34);
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(252, 248, 240, 0.96));
  box-shadow:
    0 18px 46px rgba(17, 17, 17, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

.aircraft-thumb-hero {
  min-height: 300px;
}

.aircraft-hero-copy {
  display: grid;
  gap: 0.72rem;
  align-content: center;
  min-height: 100%;
}

.aircraft-hero-copy h3,
.aircraft-copy h3 {
  margin: 0;
  color: #111111;
  font-size: clamp(1.4rem, 2.2vw, 2rem);
  line-height: 1;
}

.hero-meta,
.hero-availability,
.hero-price-label {
  margin: 0;
}

.hero-meta {
  color: #42392d;
  font-size: 1rem;
  font-weight: 600;
}

.hero-availability {
  color: #8f6613;
  font-size: 0.94rem;
  font-weight: 800;
}

.hero-price-label {
  color: #746652;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.hero-price {
  color: #111111;
  font-size: clamp(2rem, 2.8vw, 2.6rem);
  line-height: 0.95;
}

.hero-service-copy {
  margin: 0;
  color: #5f5f5f;
  font-size: 0.95rem;
}

.hero-emotional-copy,
.aircraft-emotional-copy {
  margin: 0;
  color: #2f2821;
  font-size: 0.92rem;
  font-weight: 700;
}

.aircraft-time-line {
  margin: 0;
  color: #6c604f;
  font-size: 0.92rem;
  font-weight: 600;
}

.aircraft-billing-note {
  margin: 0;
  color: #8f6613;
  font-size: 0.82rem;
  font-weight: 700;
}

.hero-includes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.hero-includes span {
  display: inline-flex;
  align-items: center;
  min-height: 1.9rem;
  padding: 0.3rem 0.7rem;
  border: 1px solid #e4ddd1;
  border-radius: 999px;
  background: #faf8f3;
  color: #40382d;
  font-size: 0.78rem;
  font-weight: 700;
}

.hero-actions {
  display: grid;
  gap: 0.6rem;
  align-content: center;
  justify-items: end;
}

.hero-actions button {
  width: 100%;
  min-width: 11rem;
  min-height: 3.25rem;
  color: #ffffff;
}

.secondary-ghost-button {
  border: 1px solid rgba(191, 151, 65, 0.28) !important;
  background: rgba(255, 255, 255, 0.68) !important;
  color: #181512 !important;
  backdrop-filter: blur(12px);
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

.aircraft-card-head {
  display: flex;
  gap: 0.8rem;
  align-items: start;
  justify-content: space-between;
}

.aircraft-card-head__copy {
  display: grid;
  gap: 0.2rem;
}

.aircraft-trust-copy {
  margin: 0;
  color: #2f2821;
  font-size: 0.96rem;
  font-weight: 700;
}

.aircraft-quick-meta {
  margin: 0;
  color: #6d6252;
  font-size: 0.9rem;
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

.plan-card--selected {
  border-color: rgba(191, 151, 65, 0.52);
  box-shadow: 0 18px 44px rgba(17, 17, 17, 0.08);
  background: linear-gradient(180deg, #fffdf8, #ffffff);
}

.price-stack {
  display: grid;
  gap: 0.22rem;
}

.price-stack small,
.plan-card small {
  color: #6d6252;
  font-size: 0.84rem;
  font-weight: 600;
}

.plan-accent {
  color: #9a7322;
  font-size: 0.9rem;
  font-weight: 800;
  letter-spacing: 0.01em;
}

.card-actions {
  display: grid;
  gap: 0.7rem;
  align-content: center;
  justify-items: end;
}

.card-actions button {
  min-width: 12rem;
}

.card-actions button:first-child {
  min-height: 3rem;
  background: rgba(255, 255, 255, 0.7);
  color: #111111;
}

.card-actions button:last-child:not(:only-child) {
  min-height: 3.25rem;
  background: linear-gradient(135deg, #111111, #2b2925);
  color: #ffffff;
}

.aircraft-list-compact {
  display: grid;
  gap: 0.85rem;
}

.aircraft-card-compact {
  grid-template-columns: minmax(220px, 260px) minmax(0, 1fr) minmax(170px, 210px);
  min-height: 290px;
  padding: 0.8rem;
  border-radius: 18px;
}

.aircraft-card-compact .aircraft-thumb {
  min-height: 290px;
}

.aircraft-card-compact .aircraft-copy {
  display: grid;
  align-content: center;
  gap: 0.85rem;
  min-height: 100%;
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

.profile-cards,
.confirmation-actions {
  display: grid;
  gap: 1rem;
}

.profile-cards {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.profile-highlight-card,
.confirmation-box {
  padding: 1rem;
  border: 1px solid #e5e1d8;
  border-radius: 8px;
  background: #ffffff;
}

.profile-highlight-card {
  display: grid;
  gap: 0.45rem;
}

.confirmation-actions {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.secondary-button {
  background: #ece8df;
  color: #111111;
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
  display: none;
}

.technical-sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: rgba(8, 8, 8, 0.62);
  backdrop-filter: blur(20px);
}

.technical-sheet {
  width: min(100%, 1040px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 28px;
  background: linear-gradient(145deg, rgba(22, 22, 22, 0.96), rgba(9, 9, 9, 0.94));
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.35);
  color: #f4efe7;
  overflow: hidden;
}

.technical-sheet__hero {
  display: grid;
  grid-template-columns: minmax(280px, 360px) minmax(0, 1fr) auto;
  gap: 1rem;
  padding: 1rem;
  align-items: center;
}

.technical-sheet__media {
  position: relative;
  min-height: 220px;
  border-radius: 22px;
  overflow: hidden;
  background: linear-gradient(135deg, #1f1f1f, #0f0f0f);
}

.technical-sheet__media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.technical-sheet__copy {
  display: grid;
  gap: 0.4rem;
}

.technical-sheet__copy p,
.technical-sheet__copy strong,
.technical-sheet__map span,
.technical-sheet__map strong,
.technical-sheet__stats span,
.technical-sheet__stats strong,
.technical-sheet__insights li,
.technical-sheet__insights .eyebrow {
  color: #f4efe7;
}

.technical-sheet__copy strong {
  font-size: 2rem;
}

.technical-sheet__close {
  align-self: start;
  background: rgba(255, 255, 255, 0.08);
}

.technical-sheet__body {
  display: grid;
  grid-template-columns: 1.15fr 1fr;
  gap: 1rem;
  padding: 0 1rem 1rem;
}

.technical-sheet__map,
.technical-sheet__stats,
.technical-sheet__insights {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(16px);
}

.technical-sheet__map {
  display: grid;
  gap: 0.5rem;
  min-height: 240px;
  padding: 1rem;
  background:
    radial-gradient(circle at top left, rgba(191, 151, 65, 0.24), transparent 28%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02));
}

.technical-sheet__stats {
  display: grid;
  gap: 0.75rem;
  padding: 1rem;
}

.technical-sheet__stats article {
  display: grid;
  gap: 0.18rem;
  padding: 0.8rem;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
}

.technical-sheet__insights {
  display: grid;
  gap: 0.5rem;
  padding: 1rem;
}

.technical-sheet__insights ul {
  display: grid;
  gap: 0.55rem;
  margin: 0;
  padding-left: 1rem;
}

.sheet-fade-enter-active,
.sheet-fade-leave-active {
  transition: opacity 180ms ease;
}

.sheet-fade-enter-from,
.sheet-fade-leave-to {
  opacity: 0;
}

.active-filter {
  background: #111111 !important;
  border-color: #111111 !important;
  color: #ffffff !important;
  box-shadow: 0 14px 30px rgba(17, 17, 17, 0.14);
}

.active-filter strong {
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
  .profile-cards,
  .confirmation-actions,
  .support-grid,
  .summary-band,
  .profile-form {
    grid-template-columns: 1fr;
  }

  .technical-sheet__hero,
  .technical-sheet__body {
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

  .results-headline-hook {
    font-size: 0.78rem;
  }

  .screen-head p {
    display: block;
    margin-top: 0.16rem;
    font-size: 0.72rem;
    line-height: 1.2;
  }

  .filter-toolbar {
    padding: 0.72rem;
    border-radius: 12px;
  }

  .filter-toolbar__copy strong {
    font-size: 0.76rem;
    line-height: 1.3;
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
    display: grid;
    gap: 0.75rem;
    overflow: visible;
    padding: 0;
    scroll-snap-type: none;
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
    gap: 0.55rem;
    border-radius: 18px;
    padding: 0.65rem;
    scroll-snap-align: none;
  }

  .aircraft-card-head {
    flex-direction: column;
    gap: 0.35rem;
  }

  .aircraft-thumb {
    min-height: 220px;
    border-radius: 14px;
  }

  .aircraft-thumb img {
    min-height: 220px;
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
    gap: 0.3rem;
  }

  .aircraft-copy h3,
  .aircraft-hero-copy h3 {
    font-size: 1rem;
    line-height: 1.08;
    font-weight: 700;
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
    font-size: 1.5rem;
    line-height: 1;
  }

  .aircraft-price-line > span,
  .aircraft-price-line small {
    font-size: 0.68rem;
  }

  .aircraft-time-line,
  .hero-service-copy,
  .hero-emotional-copy,
  .aircraft-emotional-copy {
    font-size: 0.78rem;
    line-height: 1.35;
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
    min-height: 2.9rem;
    border-radius: 12px;
    font-size: 0.9rem;
  }

  .aircraft-facts .fact-pill {
    display: none;
  }

  .aircraft-visual {
    min-height: 170px;
  }

  .aircraft-hero-card,
  .aircraft-card-compact {
    grid-template-columns: 1fr;
    min-height: auto;
  }

  .aircraft-thumb-hero,
  .aircraft-card-compact .aircraft-thumb {
    min-height: 220px;
  }

  .hero-actions,
  .card-actions {
    justify-items: stretch;
    align-content: stretch;
  }

  .hero-actions button,
  .card-actions button {
    width: 100%;
    min-width: 0;
  }

  .aircraft-gallery {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.35rem;
  }

  .mobile-bottom-nav {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 35;
    display: grid !important;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.35rem;
    padding: 0.55rem;
    border-top: 1px solid #e5e1d8;
    background: rgba(255, 255, 255, 0.96);
    backdrop-filter: blur(16px);
  }

  .technical-sheet-backdrop {
    padding: 0.75rem;
  }

  .technical-sheet {
    border-radius: 22px;
  }

  .technical-sheet__hero,
  .technical-sheet__body {
    padding: 0.75rem;
  }

  .technical-sheet__media {
    min-height: 200px;
  }

  .mobile-bottom-nav button {
    min-height: 2.6rem;
    padding: 0 0.35rem;
    border-radius: 999px;
    background: #f3efe7;
    color: #111111;
    font-size: 0.74rem;
    font-weight: 800;
  }

  .mobile-bottom-nav button.active {
    background: #111111;
    color: #ffffff;
  }
}
</style>
