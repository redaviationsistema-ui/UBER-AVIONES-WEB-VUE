<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ActiveTrips from './ActiveTrips.vue'
import ClientMembershipSection from './ClientMembershipSection.vue'
import ClientTopNav from './ClientTopNav.vue'
import ConciergeFloatingButton from './ConciergeFloatingButton.vue'
import DestinationCards from './DestinationCards.vue'
import FlightSearchHero from './FlightSearchHero.vue'
import { featuredAirports } from '../../utils/airports'
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
const searching = ref(false)
const loadingServerData = ref(false)
const serverSearchError = ref('')
const reserving = ref(false)
const featuredDestinations = ref([])
const flightPackages = ref([])
const aircraftOptions = ref([])
const reservations = ref([])
const submittedItinerary = ref(null)
const activeResultFilter = ref('best_value')

const searchForm = reactive({
  origin: '',
  originAirport: null,
  destination: '',
  destinationAirport: null,
  departureDate: '',
  departureTime: '',
  returnDate: '',
  returnTime: '',
  passengers: '',
  pets: '',
  specialBaggage: '',
  catering: '',
  scheduleFlexibility: '',
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
  { label: 'Membresia', section: 'membresia' },
]
const mobileNavItems = [
  { label: 'Buscar', section: 'reservar' },
  { label: 'Vuelos', section: 'viajes' },
  { label: 'Cuenta', section: 'perfil' },
  { label: 'VIP', section: 'membresia' },
]
const activePlan = computed(() => (auth.user?.company_name ? 'Business Club' : 'Sin membresia'))
const defaultPriorityConfig = {
  empty_leg: { multiplier: 0.8, headline: 'Ahorro inteligente', description: 'Ruta flexible con ahorro real' },
  essential: { multiplier: 1, headline: 'Precio base incluido', description: 'Incluido como precio estandar' },
  business: { multiplier: 1.1, headline: 'Prioridad alta', description: 'Atencion premium + flexibilidad' },
  elite: { multiplier: 1.2, headline: 'Prioridad maxima', description: 'Concierge dedicado' },
}

const timeline = computed(() => [])

const selectedAircraft = computed(
  () => aircraftOptions.value.find((item) => String(item.id) === String(route.params.id)) || null,
)
const itineraryLegs = computed(() => {
  if (tripType.value === 'Ida') {
    return [
      {
        origin: searchForm.origin,
        originAirport: searchForm.originAirport,
        destination: searchForm.destination,
        destinationAirport: searchForm.destinationAirport,
        date: searchForm.departureDate,
        time: searchForm.departureTime,
      },
    ]
  }

  if (tripType.value === 'Redondo') {
    return [
      {
        origin: searchForm.origin,
        originAirport: searchForm.originAirport,
        destination: searchForm.destination,
        destinationAirport: searchForm.destinationAirport,
        date: searchForm.departureDate,
        time: searchForm.departureTime,
      },
      {
        origin: searchForm.destination,
        originAirport: searchForm.destinationAirport,
        destination: searchForm.origin,
        destinationAirport: searchForm.originAirport,
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
const priorityOptions = computed(() =>
  flightPackages.value.filter((item) => ['essential', 'business', 'elite'].includes(item.code)),
)
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
  pets: searchForm.pets,
  specialBaggage: searchForm.specialBaggage,
  catering: searchForm.catering,
  scheduleFlexibility: searchForm.scheduleFlexibility,
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
const activeSection = computed(() => {
  if (['viajes', 'mis-vuelos', 'historial', 'contrato', 'pago', 'reserva-confirmada'].includes(props.section)) {
    return 'viajes'
  }
  if (props.section === 'soporte') return 'viajes'
  if (props.section === 'perfil') return 'perfil'
  if (props.section === 'membresia') return 'membresia'
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
  () => priorityOptions.value.find((item) => item.code === selectedPriorityType.value) || priorityOptions.value[0] || null,
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
const featuredAircraft = computed(() => filteredAircraftOptions.value[0] || null)
const secondaryAircraftOptions = computed(() => filteredAircraftOptions.value.slice(1))

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

function normalizePriorityCode(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
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
  const firstLeg = summary?.legs?.[0]
  if (!firstLeg) return 'Tu vuelo privado'

  return `${firstLeg.originAirport?.city || airportDisplayName(firstLeg.origin)} → ${
    firstLeg.destinationAirport?.city || airportDisplayName(firstLeg.destination)
  }`
}

function itineraryDateLine(summary) {
  const firstLeg = summary?.legs?.[0]
  if (!firstLeg) return 'Fecha por confirmar'

  return `${formatPassengerCopy(summary?.passengers)} • ${formatTravelDateLabel(firstLeg.date, firstLeg.time)}`
}

function aircraftPriceCopy(aircraft) {
  const essentialPricing = aircraftPricingForType(aircraft, 'essential')
  if (essentialPricing.finalPrice) return essentialPricing.formattedFinalPrice
  return 'Cotización inmediata'
}

function aircraftPriceValue(aircraft) {
  const essentialPricing = aircraftPricingForType(aircraft, 'essential')
  return essentialPricing.finalPrice || Number.MAX_SAFE_INTEGER
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

function aircraftDurationLabel(aircraft = {}) {
  return String(aircraft.time || aircraft.flight_time || activeItinerarySummary.value?.estimatedTime || '42 min')
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
  return `${aircraftDurationLabel(aircraft)} • ${aircraftCapacityLabel(aircraft)} • ${itineraryDepartureLabel(summary)}`
}

function aircraftAvailabilityLabel(aircraft = {}, index = 0) {
  if (aircraft.response_time) return `Salida en ${String(aircraft.response_time).replace(/^[-\s]+/, '')}`
  if (index === 0) return 'Salida en 35 min'
  return 'Prioridad Alta'
}

function aircraftIncludes(aircraft = {}) {
  const amenities = Array.isArray(aircraft.amenities) ? aircraft.amenities.filter(Boolean) : []
  const defaults = ['WiFi', 'Catering', 'Equipaje', 'Traslado terrestre']
  return [...new Set([...amenities, ...defaults])].slice(0, 4)
}


function resolvePriorityOption(priorityType = 'essential') {
  const normalizedType = normalizePriorityCode(priorityType) || 'essential'
  const serverOption = priorityOptions.value.find((item) => item.code === normalizedType)
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

  const priorityMeta = resolvePriorityOption(priorityType)
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
  if (!packages.length) return
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
  searchForm.legs.push({
    origin: lastLeg.destination || '',
    originAirport: lastLeg.destinationAirport || null,
    destination: '',
    destinationAirport: null,
    date: lastLeg.date || searchForm.departureDate,
    time: lastLeg.time || '09:00',
  })
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
    pets: payload.pets || '',
    specialBaggage: payload.special_baggage || '',
    catering: payload.catering || '',
    scheduleFlexibility: payload.schedule_flexibility || '',
    preference: payload.preference,
    cabin: '',
    estimatedTime: '',
    estimatedTotal: '',
    flightPackage: payload.flight_package || '',
    priorityType: payload.priority_type || 'essential',
  }
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
    pets: searchForm.pets,
    special_baggage: searchForm.specialBaggage,
    catering: searchForm.catering,
    schedule_flexibility: searchForm.scheduleFlexibility,
    preference: searchForm.preference,
    flight_package: selectedPriorityMeta.value?.name || '',
    priority_type: selectedPriorityType.value,
    legs: itineraryLegs.value.map((leg) => ({ ...leg })),
  }
  submittedItinerary.value = buildItinerarySummary(quotePayload)
  ui.pushToast({
    tone: 'success',
    title: 'Cotizando itinerario',
    message: 'Validando aeropuertos, tramos y operadores activos.',
  })
  aircraftOptions.value = await searchClientFlights(quotePayload)
  if (!aircraftOptions.value.length) {
    serverSearchError.value = 'No fue posible generar una cotizacion real para este itinerario con la informacion actual.'
  }
  searching.value = false
  go('resultados')
}

async function requestReservation(aircraft = selectedAircraft.value) {
  if (!aircraft || reserving.value) return

  try {
    reserving.value = true
    const pricing = aircraftPricingForType(aircraft, selectedPriorityType.value)
    const reservation = await createClientFlightRequest({
      trip_type: tripTypeKey.value,
      trip_label: tripType.value,
      passengers: activeItinerarySummary.value.passengers,
      pets: activeItinerarySummary.value.pets,
      special_baggage: activeItinerarySummary.value.specialBaggage,
      catering: activeItinerarySummary.value.catering,
      schedule_flexibility: activeItinerarySummary.value.scheduleFlexibility,
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
      source_database: aircraft.source_database || null,
      source_table: aircraft.source_table || null,
      legs: activeItinerarySummary.value.legs.map((leg) => ({ ...leg })),
    })
    reservations.value = await getClientTrips()
    const createdReservationId =
      reservation?.data?.id || reservation?.id || reservations.value[0]?.id || selectedTripId.value || ''
    ui.pushToast({
      tone: 'success',
      title: 'Tu vuelo esta siendo confirmado por Red Aviation',
      message: 'Tu reserva ya entro al flujo comercial y operativo.',
    })
    go('reserva-confirmada', createdReservationId)
  } catch {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo solicitar la reserva',
      message: 'Intenta de nuevo o contacta a tu asesor privado.',
    })
  } finally {
    reserving.value = false
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

  const [destinations, plans, trips] = await Promise.all([
    getClientDestinations(),
    getClientFlightPackages(),
    getClientTrips(),
  ])

  featuredDestinations.value = destinations
  flightPackages.value = plans
  ensureDefaultPriority(plans)
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
              <p class="hero-price-label">Tarifa estimada total</p>
              <strong class="hero-price">{{ aircraftPriceCopy(featuredAircraft) }}</strong>
              <div class="hero-includes">
                <span v-for="item in aircraftIncludes(featuredAircraft)" :key="item">{{ item }}</span>
              </div>
            </div>
            <div class="hero-actions">
              <button type="button" :disabled="reserving" @click="requestReservation(featuredAircraft)">
                {{ reserving ? 'Reservando...' : 'Reservar' }}
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
                  </div>
                </div>
                <p class="aircraft-price-line">
                  <span>Tarifa estimada total</span>
                  <strong>{{ aircraftPriceCopy(aircraft) }}</strong>
                </p>
              </div>
              <div class="card-actions">
                <button type="button" :disabled="reserving" @click="requestReservation(aircraft)">
                  {{ reserving ? 'Reservando...' : 'Reservar' }}
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
          <strong v-if="selectedAircraft?.final_price">{{ selectedAircraft.final_price }}</strong>
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

        <ClientMembershipSection
          v-else
          :access="{ has_access: true, demo: { status: 'Activa' }, subscription: { status: activePlan } }"
          @activate-access="go('reservar')"
          @go-section="go"
          @open-concierge="go('soporte')"
          @select-plan="go('membresia')"
        />
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
  grid-template-columns: minmax(300px, 390px) minmax(0, 1fr) minmax(220px, 260px);
  gap: 1rem;
  align-items: stretch;
  padding: 1rem;
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
  font-size: clamp(2rem, 2.8vw, 2.6rem);
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
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr) minmax(190px, 230px);
  gap: 0.8rem;
  min-height: 320px;
  padding: 0.8rem;
  border: 1px solid rgba(191, 151, 65, 0.34);
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 16px 44px rgba(17, 17, 17, 0.08);
}

.aircraft-thumb-hero {
  min-height: 320px;
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
  align-content: center;
  justify-items: end;
}

.hero-actions button {
  min-width: 12rem;
  min-height: 3.25rem;
  color: #ffffff;
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
  min-height: 3.25rem;
  background: linear-gradient(135deg, #111111, #2b2925);
  color: #ffffff;
}

.card-actions button:last-child:not(:only-child) {
  min-height: 3rem;
  background: #ffffff;
  color: #111111;
}

.aircraft-list-compact {
  display: grid;
  gap: 0.85rem;
}

.aircraft-card-compact {
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr) minmax(190px, 230px);
  min-height: 320px;
  padding: 0.8rem;
  border-radius: 18px;
}

.aircraft-card-compact .aircraft-thumb {
  min-height: 320px;
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

  .aircraft-card-head {
    flex-direction: column;
    gap: 0.35rem;
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

  .aircraft-copy h3,
  .aircraft-hero-copy h3 {
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

  .aircraft-price-line > span,
  .aircraft-price-line small {
    font-size: 0.64rem;
  }

  .aircraft-trust-copy,
  .aircraft-quick-meta {
    font-size: 0.7rem;
    line-height: 1.25;
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
