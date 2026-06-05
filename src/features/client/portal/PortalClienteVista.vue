<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ActiveTrips from '../ActiveTrips.vue'
import ClientContractPreview from '../ClientContractPreview.vue'
import ClientTopNav from '../ClientTopNav.vue'
import ConciergeFloatingButton from '../ConciergeFloatingButton.vue'
import DestinationCards from '../DestinationCards.vue'
import FlightSearchHero from '../FlightSearchHero.vue'
import { featuredAirports } from '../../../utils/airports'
import {
  buildCommercialSnapshot,
  buildFlightPricingFormula,
  normalizeAttentionLevel,
  normalizePackageCode,
} from '../../../utils/flightPricing'
import {
  createClientFlightRequest,
  createClientPaymentIntent,
  ensureClientReservation,
  createClientWireIntent,
  getClientDestinations,
  getClientFlightPackages,
  getClientTrip,
  markClientTripPaymentConfirmed,
  markClientTripReadyForPayment,
  getClientTrips,
  normalizeTrip,
  searchClientFlights,
} from '../clientBookingApi'
import { useAuthStore } from '../../../stores/auth'
import { useUiStore } from '../../../stores/ui'
import { subscribeWorkflowSync } from '../../../lib/workflowSync'
import {
  buildContractResultUrl,
  clearPendingContractContext,
  contractApi,
  generateAndSendContract,
  normalizeContractFrontendState,
  persistPendingContractContext,
  readPendingContractContext,
} from '../../../services/contractApi'

const props = defineProps({
  section: { type: String, required: true },
})

const CLIENT_QUOTES_CACHE_KEY = 'red_aviation_client_quotes_preview_v1'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()

const tripType = ref('Ida')
const selectedPriorityType = ref('essential')
const profileMenuOpen = ref(false)
const RESULTS_SURCHARGE_USD = 0
const searching = ref(false)
const loadingServerData = ref(false)
const serverSearchError = ref('')
const reservingAircraftId = ref('')
const featuredDestinations = ref([])
const flightPackages = ref([])
const aircraftOptions = ref([])
const reservations = ref([])
const refreshingReservations = ref(false)
const signingContract = ref(false)
const submittedItinerary = ref(null)
const quoteResultsVisible = ref(false)
const activeResultFilter = ref('best_value')
const technicalSheetOpen = ref(false)
const technicalAircraft = ref(null)
let removeWorkflowSyncSubscription = null
let workflowSyncRefreshTimer = null
let reservationsRequestPromise = null
const reservationDetailRequestIds = new Set()
let signedContractSyncTimer = null
const appliedSignedContractReturnKey = ref('')
const CLIENT_TRIPS_TIMEOUT_MS = Number(import.meta.env.VITE_CLIENT_TRIPS_TIMEOUT_MS || 45000)
const CLIENT_QUOTES_TIMEOUT_MS = Number(import.meta.env.VITE_CLIENT_QUOTES_TIMEOUT_MS || 45000)
const externalContractFlowEnabled = String(
  import.meta.env.VITE_CLIENT_CONTRACT_EXTERNAL_ENABLED || 'true',
)
  .trim()
  .toLowerCase() !== 'false'
const dedicatedDocusignSendPath = String(
  import.meta.env.VITE_CLIENT_CONTRACT_SEND_PATH || import.meta.env.VITE_CONTRACT_SEND_PATH || '',
).trim()

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
    {
      origin: '',
      originAirport: null,
      destination: '',
      destinationAirport: null,
      date: '',
      time: '',
    },
    {
      origin: '',
      originAirport: null,
      destination: '',
      destinationAirport: null,
      date: '',
      time: '',
    },
  ],
})

const topNavItems = [
  { label: 'Reservar', section: 'reservar' },
  { label: 'Mis vuelos', section: 'viajes' },
  { label: '  Perfil', section: 'perfil' },
]

function resolveContractRecordId(payload = {}) {
  return String(
    payload?.contract_id ||
      payload?.contractId ||
      payload?.id ||
      payload?.contract?.id ||
      payload?.data?.id ||
      '',
  ).trim()
}

function resolveDocusignEnvelopeId(payload = {}) {
  return String(
    payload?.docusign_envelope_id ||
      payload?.envelope_id ||
      payload?.envelopeId ||
      payload?.contract?.docusign_envelope_id ||
      payload?.contract?.envelope_id ||
      '',
  ).trim()
}

function resolveDocusignStatus(payload = {}) {
  return String(
    payload?.docusign_status ||
      payload?.envelope_status ||
      payload?.status ||
      payload?.contract?.docusign_status ||
      payload?.contract?.envelope_status ||
      payload?.contract?.status ||
      '',
  )
    .trim()
    .toLowerCase()
}

function resolveContractSigningUrl(payload = {}) {
  return String(
    payload?.signing_url ||
      payload?.signingUrl ||
      payload?.recipient_view_url ||
      payload?.recipientViewUrl ||
      payload?.embedded_signing_url ||
      payload?.data?.signing_url ||
      payload?.data?.recipient_view_url ||
      '',
  ).trim()
}

function isDocuSignRecipientSigningUrl(url = '') {
  const normalized = String(url || '').trim().toLowerCase()
  if (!normalized) return false

  const blockedTokens = [
    'tagger',
    'prepare',
    'sender',
    'correct',
    'edit',
    'documents/details',
    'addfields',
    'console',
  ]

  return !blockedTokens.some((token) => normalized.includes(token))
}

function canUseExternalContractFlow() {
  return externalContractFlowEnabled
}
const mobileNavItems = [
  { label: 'Buscar', section: 'reservar' },
  { label: 'Vuelos', section: 'viajes' },
  { label: 'Cuenta', section: 'perfil' },
]
const defaultPriorityConfig = {
  empty_leg: {
    multiplier: 0.95,
    headline: 'Ahorro inteligente',
    description: 'Ruta flexible con ahorro real',
  },
  essential: {
    multiplier: 1.1,
    headline: 'Margen standard',
    description: 'Precio comercial base del marketplace',
  },
  business: {
    multiplier: 1.2,
    headline: 'Margen priority',
    description: 'Atencion premium + flexibilidad',
  },
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
function resolveEntityIdentifier(value) {
  if (value === null || value === undefined) return ''

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim()
  }

  if (typeof value === 'object') {
    return (
      resolveEntityIdentifier(value.id) ||
      resolveEntityIdentifier(value.reservation_id) ||
      resolveEntityIdentifier(value.flight_request_id) ||
      resolveEntityIdentifier(value.request_id) ||
      ''
    )
  }

  return ''
}
const selectedReservation = computed(() => {
  const exactMatch = reservations.value.find(
    (reservation) => String(reservation.id) === selectedTripId.value,
  )

  if (exactMatch) return exactMatch

  const flightRequestMatch = reservations.value.find(
    (reservation) => String(reservation.flight_request_id || '') === selectedTripId.value,
  )

  if (flightRequestMatch) return flightRequestMatch
  if (selectedTripId.value) return null

  return reservations.value[0] || null
})
const selectedReservationFrontendState = computed(() =>
  normalizeContractFrontendState(selectedReservation.value || {}),
)
const paymentReadyForCheckout = computed(
  () => selectedReservationFrontendState.value.ready_for_payment === true,
)
const reservationContextId = computed(
  () =>
    resolveEntityIdentifier(selectedReservation.value?.id) || String(routeId.value || '').trim(),
)
const flightRequestContextId = computed(
  () =>
    resolveEntityIdentifier(selectedReservation.value?.flight_request_id) ||
    resolveEntityIdentifier(selectedReservation.value?.id) ||
    String(routeId.value || '').trim(),
)
const selectedReservationPriceLabel = computed(() => {
  const pricingContext =
    selectedReservation.value?.pricing_context &&
    typeof selectedReservation.value.pricing_context === 'object'
      ? selectedReservation.value.pricing_context
      : {}
  const snapshotRecord =
    selectedReservation.value?.aircraft_snapshot &&
    typeof selectedReservation.value.aircraft_snapshot === 'object'
      ? selectedReservation.value.aircraft_snapshot
      : {}

  return (
    (selectedReservation.value?.selected_card_price
      ? formatCurrency(selectedReservation.value.selected_card_price)
      : '') ||
    (pricingContext.selected_card_price
      ? formatCurrency(pricingContext.selected_card_price)
      : '') ||
    (snapshotRecord.selected_card_price
      ? formatCurrency(snapshotRecord.selected_card_price)
      : '') ||
    selectedReservation.value?.formatted_final_price ||
    selectedReservation.value?.final_price_display ||
    selectedReservation.value?.estimated_total ||
    selectedAircraftPricing.value?.formattedFinalPrice ||
    ''
  )
})
const selectedReservationPriceValue = computed(() => {
  const pricingContext =
    selectedReservation.value?.pricing_context &&
    typeof selectedReservation.value.pricing_context === 'object'
      ? selectedReservation.value.pricing_context
      : {}
  const snapshotRecord =
    selectedReservation.value?.aircraft_snapshot &&
    typeof selectedReservation.value.aircraft_snapshot === 'object'
      ? selectedReservation.value.aircraft_snapshot
      : {}

  return (
    Number(selectedReservation.value?.selected_card_price || 0) ||
    Number(pricingContext.selected_card_price || 0) ||
    Number(snapshotRecord.selected_card_price || 0) ||
    moneyValue(selectedReservation.value?.formatted_final_price) ||
    moneyValue(selectedReservation.value?.final_price_display) ||
    moneyValue(selectedReservation.value?.estimated_total) ||
    moneyValue(selectedAircraftPricing.value?.formattedFinalPrice) ||
    0
  )
})
const paymentSummaryAmountLabel = computed(() => {
  if (selectedReservationPriceValue.value > 0) {
    return formatCurrency(selectedReservationPriceValue.value)
  }
  return selectedReservationPriceLabel.value || 'Monto por confirmar'
})
const paymentReservationPassengerCount = computed(() => {
  return Number(
    selectedReservation.value?.passengers ||
      activeItinerarySummary.value?.passengers ||
      searchForm.passengers ||
      1,
  )
})
const customerDisplayName = computed(() => {
  const rawName =
    auth.user?.name ||
    auth.user?.company_name ||
    auth.user?.business_name ||
    auth.userName ||
    auth.access?.company_name ||
    ''

  return String(rawName || '').trim() || 'Cliente SKY Group'
})
const customerEmail = computed(() => {
  const rawEmail = auth.user?.email || auth.access?.email || ''
  return String(rawEmail || '').trim() || 'cliente@skygroup.com'
})
const customerPhone = computed(() => {
  const rawPhone = auth.user?.phone || auth.access?.phone || ''
  return String(rawPhone || '').trim()
})
const paymentHeroTitle = computed(() => {
  if (!selectedReservation.value) return 'Checkout seguro'
  return paymentReadyForCheckout.value ? 'Configura tu pago' : 'Pago bloqueado hasta firma'
})
const paymentHeroCopy = computed(() => {
  if (selectedReservation.value) {
    if (!paymentReadyForCheckout.value) {
      return (
        selectedReservationFrontendState.value.status_message ||
        'Primero necesitamos confirmar la firma del contrato antes de habilitar el pago.'
      )
    }
    return 'Confirma el metodo, revisa los datos de contacto y autoriza el cargo de tu reserva.'
  }
  return 'Pago protegido con tarjeta, transferencia, wire o wallet corporativa.'
})
const paymentRouteHeadline = computed(() => itineraryHeadline(activeItinerarySummary.value))
const paymentDateLabel = computed(() => itineraryDateLine(activeItinerarySummary.value))
const paymentFeatureList = [
  {
    icon: 'shield',
    title: 'Pago protegido',
    copy: 'Cobro seguro con trazabilidad operativa en tiempo real.',
  },
  {
    icon: 'route',
    title: 'Reserva priorizada',
    copy: 'Resumen final antes de liberar la operacion al proveedor.',
  },
]
const paymentMethodCards = [
  {
    id: 'card',
    label: 'Tarjeta corporativa',
    note: 'Checkout seguro hospedado .',
    icon: 'card',
  },
  {
    id: 'wire',
    label: 'Transferencia / wire',
    note: 'Instrucciones bancarias y validacion manual del comprobante.',
    icon: 'bank',
  },
]
const paymentForm = reactive({
  contactEmail: '',
})
const selectedPaymentMethod = ref('card')
const paymentCardBrand = ref('')
const paymentSubmitting = ref(false)
const paymentInlineError = ref('')
const wireInstructions = ref(null)
const paymentLastReference = ref('')
const paymentCardNumberHost = ref(null)
const paymentCardExpiryHost = ref(null)
const paymentCardCvcHost = ref(null)
const paymentElementReady = ref(false)
const paymentElementLoading = ref(false)
const paymentCardComplete = ref(false)

let stripeClient = null
let stripeElements = null
let stripeCardNumberElement = null
let stripeCardExpiryElement = null
let stripeCardCvcElement = null
let stripeIntentSecret = ''
let stripePublishableKey = ''

function normalizeCardBrand(value = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (!normalized || normalized === 'unknown') return ''
  if (normalized === 'visa') return 'Visa'
  if (normalized === 'mastercard') return 'Mastercard'
  if (normalized === 'amex' || normalized === 'american express') return 'American Express'
  if (normalized === 'discover') return 'Discover'
  if (normalized === 'diners' || normalized === 'diners club') return 'Diners Club'
  if (normalized === 'jcb') return 'JCB'
  if (normalized === 'unionpay') return 'UnionPay'

  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function svgDataUri(svg) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const CARD_BRAND_LOGOS = {
  Visa: svgDataUri(
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="32" viewBox="0 0 96 32"><rect width="96" height="32" rx="8" fill="#1A4FB8"/><path fill="#fff" d="M35.8 21h-3.7l2.3-14h3.7l-2.3 14Zm15.4-13.6a9.2 9.2 0 0 0-3.3-.6c-3.7 0-6.3 1.9-6.3 4.8 0 2.1 1.9 3.2 3.3 3.9 1.5.7 2 1.2 2 1.9 0 1-.9 1.5-2 1.5a7.2 7.2 0 0 1-3.5-.8l-.5-.2-.5 3.1a11.5 11.5 0 0 0 4.2.8c4 0 6.6-1.9 6.7-5 0-1.6-1-2.9-3.1-3.9-1.3-.6-2.1-1-2.1-1.7 0-.6.7-1.2 2-1.2a6.5 6.5 0 0 1 2.7.5l.3.1.5-3ZM61 7h-2.8c-.9 0-1.5.2-1.9 1.2l-5.4 12.8h4l.8-2.3h4.8l.5 2.3h3.6L61 7Zm-3.5 8.9 2-5.4 1.2 5.4h-3.2ZM28.7 7l-3.6 9.6-.4-2c-.7-2.2-2.8-4.6-5.2-5.7l3.3 12h4l6-14h-3.9Z"/><path fill="#F7B600" d="M24.4 7H18c-.2 0-.4 0-.5.2-.2.1-.2.3-.2.5l.1.2c5 1.2 8.4 4.2 9.8 7.8L25.8 8c-.2-.8-.8-1-1.4-1Z"/></svg>',
  ),
  Mastercard: svgDataUri(
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="32" viewBox="0 0 96 32"><rect width="96" height="32" rx="8" fill="#111111"/><circle cx="39" cy="16" r="8" fill="#EB001B"/><circle cx="49" cy="16" r="8" fill="#F79E1B"/><path fill="#FF5F00" d="M44 9.8a10 10 0 0 0 0 12.4 10 10 0 0 0 0-12.4Z"/></svg>',
  ),
  'American Express': svgDataUri(
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="32" viewBox="0 0 96 32"><rect width="96" height="32" rx="8" fill="#2A8DBF"/><path fill="#fff" d="M19 21V11h16v2h-6v2h6v2h-6v2h6v2H19Zm18 0 4.2-10h4L49 21h-3.6l-.7-1.8h-4.1L40 21h-3Zm6.9-4.3-1.2-3.2-1.2 3.2h2.4ZM50 21V11h4.2l2.7 5 2.7-5H64v10h-3v-6.2L58 20h-2.2l-3-5.1V21h-2.8Zm15 0V11h11v2h-8v1.8h7.8v2H68v2h8v2H65Z"/></svg>',
  ),
  Discover: svgDataUri(
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="32" viewBox="0 0 96 32"><rect width="96" height="32" rx="8" fill="#fff"/><rect x=".5" y=".5" width="95" height="31" rx="7.5" fill="none" stroke="rgba(17,17,17,.12)"/><path fill="#222" d="M18 21V11h4.8c3.7 0 5.9 1.9 5.9 5s-2.2 5-5.9 5H18Zm3-2.4h1.7c1.9 0 3-1 3-2.6s-1.1-2.6-3-2.6H21v5.2ZM30 21V11h3v10h-3Zm4.8-1.3 1.1-2a6.8 6.8 0 0 0 3.3.9c1.2 0 1.7-.3 1.7-.8 0-1.7-5.9-.5-5.9-4.1 0-1.9 1.6-3.5 4.7-3.5 1.4 0 2.9.3 4 .8l-1 2.1a6.4 6.4 0 0 0-3-.7c-1.2 0-1.7.4-1.7.9 0 1.6 5.9.4 5.9 4 0 1.8-1.6 3.4-4.7 3.4-1.8 0-3.5-.4-4.4-1Zm14.8 1.5c-3.2 0-5.6-2.2-5.6-5.2s2.4-5.2 5.6-5.2c1.9 0 3.5.7 4.5 2l-1.9 1.7c-.6-.8-1.4-1.2-2.4-1.2-1.6 0-2.7 1.1-2.7 2.7s1.1 2.7 2.7 2.7c1 0 1.8-.4 2.4-1.2l1.9 1.7c-1 1.3-2.6 2-4.5 2Zm10.8 0c-3.3 0-5.7-2.2-5.7-5.2s2.4-5.2 5.7-5.2 5.7 2.2 5.7 5.2-2.4 5.2-5.7 5.2Zm0-2.5c1.5 0 2.7-1.1 2.7-2.7s-1.2-2.7-2.7-2.7-2.7 1.1-2.7 2.7 1.2 2.7 2.7 2.7Z"/><path fill="#F58220" d="M71 18.8c4.5 0 8.6-1.6 11.7-4.2-2.5-2.2-6.1-3.6-10-3.6-4.5 0-8.6 1.6-11.7 4.2 2.5 2.2 6.1 3.6 10 3.6Z"/></svg>',
  ),
}

const paymentMethodSummaryLabel = computed(() => {
  if (selectedPaymentMethod.value === 'wire') {
    return paymentMethodCards.find((method) => method.id === 'wire')?.label || 'Transferencia / wire'
  }

  const persistedBrand =
    normalizeCardBrand(selectedReservation.value?.payment_order?.brand) ||
    normalizeCardBrand(selectedReservation.value?.payment_order?.card_brand) ||
    normalizeCardBrand(selectedReservation.value?.payment_brand) ||
    normalizeCardBrand(selectedReservation.value?.card_brand)

  const detectedBrand = normalizeCardBrand(paymentCardBrand.value)
  const brandLabel = detectedBrand || persistedBrand

  if (brandLabel) return brandLabel

  return paymentMethodCards.find((method) => method.id === selectedPaymentMethod.value)?.label
})

const paymentCardVisualLabel = computed(() => {
  if (selectedPaymentMethod.value !== 'card') return ''

  const persistedBrand =
    normalizeCardBrand(selectedReservation.value?.payment_order?.brand) ||
    normalizeCardBrand(selectedReservation.value?.payment_order?.card_brand) ||
    normalizeCardBrand(selectedReservation.value?.payment_brand) ||
    normalizeCardBrand(selectedReservation.value?.card_brand)

  return normalizeCardBrand(paymentCardBrand.value) || persistedBrand || 'Tarjeta'
})

const paymentCardVisualLogo = computed(() => CARD_BRAND_LOGOS[paymentCardVisualLabel.value] || '')

const accountAccessCopy = computed(() => {
  const access = auth.access || {}
  const user = auth.user || {}
  const subscription = access.subscription || access.membership || {}
  const normalizedSubscriptionStatus = String(
    subscription.status ||
      access.subscription_status ||
      access.membership_status ||
      user.subscription_status ||
      user.membership_status ||
      '',
  )
    .trim()
    .toLowerCase()
  const normalizedPlanName = String(
    subscription.plan_name ||
      subscription.plan ||
      subscription.name ||
      access.plan_name ||
      access.plan ||
      '',
  ).trim()
  const truthyStates = new Set([
    '1',
    'true',
    'yes',
    'si',
    'active',
    'activa',
    'vigente',
    'approved',
    'trial_active',
    'demo_activa',
  ])
  const activeStatuses = new Set(['active', 'activa', 'vigente', 'approved'])
  const demoStatuses = new Set(['trial_active', 'demo_active', 'demo_activa', 'trial', 'demo'])
  const flags = [
    access.has_access,
    access.active,
    access.is_active,
    access.subscription_active,
    access.demo_active,
    access.demo?.status,
    access.has_demo,
    access.can_book,
    access.can_request_flights,
    user.has_access,
    user.demo_active,
    user.demo?.status,
    user.has_demo,
  ]
  const normalizedFlags = flags.map((value) =>
    String(value ?? '')
      .trim()
      .toLowerCase(),
  )
  const hasTruthyFlag = normalizedFlags.some((value) => truthyStates.has(value))
  const hasActiveSubscription = activeStatuses.has(normalizedSubscriptionStatus)
  const hasDemo =
    demoStatuses.has(normalizedSubscriptionStatus) ||
    normalizedFlags.some((value) => demoStatuses.has(value))

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
const canQuoteFlights = computed(() => {
  const access = auth.access || {}
  const user = auth.user || {}
  const subscription = access.subscription || access.membership || {}
  const normalizedSubscriptionStatus = String(
    subscription.status ||
      access.subscription_status ||
      access.membership_status ||
      user.subscription_status ||
      user.membership_status ||
      '',
  )
    .trim()
    .toLowerCase()
  const truthyStates = new Set([
    '1',
    'true',
    'yes',
    'si',
    'active',
    'activa',
    'vigente',
    'approved',
    'trial_active',
    'demo_activa',
  ])
  const activeStatuses = new Set(['active', 'activa', 'vigente', 'approved'])
  const demoStatuses = new Set(['trial_active', 'demo_active', 'demo_activa', 'trial', 'demo'])
  const flags = [
    access.has_access,
    access.active,
    access.is_active,
    access.subscription_active,
    access.demo_active,
    access.demo?.status,
    access.has_demo,
    access.can_book,
    access.can_request_flights,
    user.has_access,
    user.demo_active,
    user.demo?.status,
    user.has_demo,
  ]
  const normalizedFlags = flags.map((value) =>
    String(value ?? '')
      .trim()
      .toLowerCase(),
  )

  return (
    activeStatuses.has(normalizedSubscriptionStatus) ||
    demoStatuses.has(normalizedSubscriptionStatus) ||
    normalizedFlags.some((value) => truthyStates.has(value) || demoStatuses.has(value))
  )
})
const activeSection = computed(() => {
  if (
    ['viajes', 'mis-vuelos', 'historial', 'contrato', 'pago', 'reserva-confirmada'].includes(
      props.section,
    )
  ) {
    return 'viajes'
  }
  if (props.section === 'soporte') return 'viajes'
  if (props.section === 'perfil') return 'perfil'
  return 'reservar'
})
const tripsInitialTab = computed(() => {
  if (props.section === 'historial') return 'historial'
  return 'proximos'
})
const needsReservationContext = computed(() =>
  ['contrato', 'pago', 'reserva-confirmada', 'soporte'].includes(props.section),
)
const hasReservationsLoaded = computed(
  () =>
    !loadingServerData.value && !refreshingReservations.value && Array.isArray(reservations.value),
)
const canRenderReservationWorkflow = computed(() => {
  if (!needsReservationContext.value) return true
  if (props.section === 'contrato') {
    return Boolean(selectedReservation.value?.is_reservation)
  }
  if (props.section === 'pago') {
    return Boolean(selectedReservation.value?.is_reservation) && paymentReadyForCheckout.value
  }
  return Boolean(selectedReservation.value)
})
const isResultsSection = computed(() =>
  ['resultados', 'paquete-vuelo', 'aeronave', 'reserva'].includes(props.section),
)
const userFirstName = computed(() => {
  const rawName = auth.user?.name || auth.user?.company_name || auth.userName || 'Kevin'
  return String(rawName).trim().split(/\s+/)[0] || 'Kevin'
})
const selectedPriorityMeta = computed(
  () => flightPackages.value.find((item) => item.code === selectedPriorityType.value) || null,
)

function redirectLegacyInProgressSection() {
  if (props.section !== 'en-proceso') return

  router.replace({
    name: route.params.subsection
      ? 'cliente-subdetalle'
      : route.params.id
        ? 'cliente-detalle'
        : 'cliente',
    params: {
      ...route.params,
      section: 'viajes',
    },
    query: route.query,
  })
}
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
        aircraftDecisionScore(next.aircraft, next.index) -
          aircraftDecisionScore(current.aircraft, current.index) || current.index - next.index,
    )
    .map(({ aircraft }) => aircraft)
})
const visibleAircraftOptions = computed(() => {
  return filteredAircraftOptions.value.filter((aircraft, index, all) =>
    aircraftVisibleForRoute(aircraft, all, index),
  )
})
const decoratedAircraftOptions = computed(() => visibleAircraftOptions.value)
const featuredAircraft = computed(() => decoratedAircraftOptions.value[0] || null)
const secondaryAircraftOptions = computed(() => decoratedAircraftOptions.value.slice(1))

const hasSearchContext = computed(() => {
  const legs = submittedItinerary.value?.legs?.length
    ? submittedItinerary.value.legs
    : itineraryLegs.value

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

function canUseQuoteStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

function persistQuotePreview() {
  if (!canUseQuoteStorage()) return

  if (!submittedItinerary.value || !aircraftOptions.value.length) {
    window.sessionStorage.removeItem(CLIENT_QUOTES_CACHE_KEY)
    return
  }

  window.sessionStorage.setItem(
    CLIENT_QUOTES_CACHE_KEY,
    JSON.stringify({
      tripType: tripType.value,
      selectedPriorityType: selectedPriorityType.value,
      submittedItinerary: submittedItinerary.value,
      aircraftOptions: aircraftOptions.value,
    }),
  )
}

function clearQuotePreviewState() {
  quoteResultsVisible.value = false
  submittedItinerary.value = null
  aircraftOptions.value = []
  serverSearchError.value = ''

  if (canUseQuoteStorage()) {
    window.sessionStorage.removeItem(CLIENT_QUOTES_CACHE_KEY)
  }
}

function restoreQuotePreview() {
  if (!canUseQuoteStorage()) return
  if (submittedItinerary.value || aircraftOptions.value.length) return

  const rawSnapshot = window.sessionStorage.getItem(CLIENT_QUOTES_CACHE_KEY)
  if (!rawSnapshot) return

  try {
    const snapshot = JSON.parse(rawSnapshot)

    if (!snapshot || typeof snapshot !== 'object') return

    if (typeof snapshot.tripType === 'string' && snapshot.tripType.trim()) {
      tripType.value = snapshot.tripType
    }

    if (typeof snapshot.selectedPriorityType === 'string' && snapshot.selectedPriorityType.trim()) {
      selectedPriorityType.value = snapshot.selectedPriorityType
    }

    if (snapshot.submittedItinerary && typeof snapshot.submittedItinerary === 'object') {
      submittedItinerary.value = snapshot.submittedItinerary
    }

    if (Array.isArray(snapshot.aircraftOptions) && snapshot.aircraftOptions.length) {
      aircraftOptions.value = snapshot.aircraftOptions
    }
  } catch {
    window.sessionStorage.removeItem(CLIENT_QUOTES_CACHE_KEY)
  }
}

function normalizeLegForQuote(leg = {}, fallback = {}) {
  const origin = leg.origin || fallback.origin || ''
  const destination = leg.destination || fallback.destination || ''

  return {
    ...leg,
    origin,
    originAirport: resolveAirportSelection(
      origin,
      leg.originAirport || fallback.originAirport || null,
    ),
    destination,
    destinationAirport: resolveAirportSelection(
      destination,
      leg.destinationAirport || fallback.destinationAirport || null,
    ),
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

async function sendPaymentInvoiceNotification({
  reservationId = '',
  paymentIntentId = '',
  paymentStatus = '',
} = {}) {
  const endpoint = 'https://redskyg.com/renta/send_payment_invoice.php'
  const formData = new FormData()
  const summary = activeItinerarySummary.value || {}

  formData.append('reservation_id', String(reservationId || reservationContextId.value || '').trim())
  formData.append(
    'flight_request_id',
    String(flightRequestContextId.value || reservationId || '').trim(),
  )
  formData.append('payment_intent_id', String(paymentIntentId || paymentLastReference.value || '').trim())
  formData.append('payment_status', String(paymentStatus || '').trim())
  formData.append('email', paymentForm.contactEmail.trim() || customerEmail.value)
  formData.append('customer_email', paymentForm.contactEmail.trim() || customerEmail.value)
  formData.append('customer_name', customerDisplayName.value)
  formData.append('customer_phone', customerPhone.value)
  formData.append('amount', String(selectedReservationPriceValue.value || 0))
  formData.append('amount_label', paymentSummaryAmountLabel.value)
  formData.append('route', paymentRouteHeadline.value)
  formData.append('date_label', paymentDateLabel.value)
  formData.append('trip_type', String(summary.tripType || ''))
  formData.append('passengers', String(paymentReservationPassengerCount.value || ''))

  const response = await fetch(endpoint, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`No se pudo enviar la notificacion de factura (${response.status}).`)
  }

  const payload = await response.json().catch(() => null)

  if (payload && payload.success === false) {
    throw new Error(payload.message || 'No se pudo enviar la factura al cliente.')
  }

  return payload || response
}

function resolveStripePublishableKey(preferredKey = '') {
  return (
    String(preferredKey || '').trim() ||
    String(stripePublishableKey || '').trim() ||
    String(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '').trim()
  )
}

function cacheStripePaymentIntent(payload = {}) {
  const nextClientSecret = String(payload?.client_secret || '').trim()
  const nextPublishableKey = resolveStripePublishableKey(payload?.publishable_key)
  const nextPaymentIntentId = String(payload?.payment_intent_id || '').trim()

  if (nextClientSecret) {
    stripeIntentSecret = nextClientSecret
  }

  if (nextPublishableKey) {
    stripePublishableKey = nextPublishableKey
  }

  if (nextPaymentIntentId) {
    paymentLastReference.value = nextPaymentIntentId
  }
}

async function ensureStripePaymentElement(publishableKeyOverride = '') {
  const flightRequestId = reservationContextId.value

  if (
    selectedPaymentMethod.value !== 'card' ||
    props.section !== 'pago' ||
    !flightRequestId ||
    !paymentCardNumberHost.value ||
    !paymentCardExpiryHost.value ||
    !paymentCardCvcHost.value
  ) {
    return
  }

  if (paymentElementLoading.value || paymentElementReady.value) {
    return
  }

  paymentElementLoading.value = true
  paymentInlineError.value = ''

  try {
    const { loadStripe } = await import('@stripe/stripe-js')
    const publishableKey = resolveStripePublishableKey(publishableKeyOverride)

    if (!publishableKey) {
      throw new Error(
        'No encontramos la llave publica de Stripe para renderizar el formulario de tarjeta.',
      )
    }

    if (stripeClient && paymentElementReady.value && stripePublishableKey === publishableKey) {
      return
    }

    if (stripePublishableKey && stripePublishableKey !== publishableKey) {
      destroyStripePaymentElement()
    }

    stripeClient = await loadStripe(publishableKey)

    if (!stripeClient) {
      throw new Error('No se pudo inicializar Stripe en esta vista.')
    }

    stripePublishableKey = publishableKey

    stripeElements = stripeClient.elements({
      locale: 'es',
    })

    const stripeFieldStyle = {
      base: {
        color: '#141414',
        fontFamily: 'Manrope, ui-sans-serif, system-ui, sans-serif',
        fontSize: '18px',
        fontWeight: '600',
        '::placeholder': {
          color: '#8e8a83',
        },
      },
      invalid: {
        color: '#b73838',
        iconColor: '#b73838',
      },
    }

    const secureFieldOptions = {
      style: stripeFieldStyle,
      disabled: false,
    }

    const cardNumberOptions = {
      ...secureFieldOptions,
      disableLink: true,
    }

    const fieldState = {
      number: false,
      expiry: false,
      cvc: false,
    }

    const syncFieldState = () => {
      paymentCardComplete.value = fieldState.number && fieldState.expiry && fieldState.cvc
    }

    const handleStripeFieldChange = (field) => (event) => {
      fieldState[field] = Boolean(event?.complete)

      if (field === 'number') {
        paymentCardBrand.value = normalizeCardBrand(event?.brand)
      }

      if (event?.empty && !event?.error) {
        paymentInlineError.value = ''
      } else {
        paymentInlineError.value = event?.error?.message || ''
      }

      syncFieldState()
    }

    stripeCardNumberElement = stripeElements.create('cardNumber', cardNumberOptions)
    stripeCardExpiryElement = stripeElements.create('cardExpiry', secureFieldOptions)
    stripeCardCvcElement = stripeElements.create('cardCvc', secureFieldOptions)

    stripeCardNumberElement.on('change', handleStripeFieldChange('number'))
    stripeCardExpiryElement.on('change', handleStripeFieldChange('expiry'))
    stripeCardCvcElement.on('change', handleStripeFieldChange('cvc'))

    stripeCardNumberElement.mount(paymentCardNumberHost.value)
    stripeCardExpiryElement.mount(paymentCardExpiryHost.value)
    stripeCardCvcElement.mount(paymentCardCvcHost.value)
    paymentElementReady.value = true
  } catch (error) {
    paymentInlineError.value =
      error?.message || 'No se pudo cargar el formulario seguro de tarjeta.'
  } finally {
    paymentElementLoading.value = false
  }
}

function destroyStripePaymentElement() {
  if (stripeCardNumberElement) stripeCardNumberElement.destroy()
  if (stripeCardExpiryElement) stripeCardExpiryElement.destroy()
  if (stripeCardCvcElement) stripeCardCvcElement.destroy()

  stripeCardNumberElement = null
  stripeCardExpiryElement = null
  stripeCardCvcElement = null
  stripeElements = null
  stripeClient = null
  stripeIntentSecret = ''
  stripePublishableKey = ''
  paymentCardBrand.value = ''
  paymentCardComplete.value = false
  paymentElementReady.value = false
  paymentElementLoading.value = false
}

function resultDisplayPrice(value = 0) {
  return formatCurrency(Number(value || 0) + RESULTS_SURCHARGE_USD)
}

function normalizePriorityCode(value = '') {
  return normalizePackageCode(value)
}

function airportDisplayName(code = '') {
  const normalizedCode = String(code || '')
    .trim()
    .toUpperCase()
  if (!normalizedCode) return 'Ruta por confirmar'

  const catalogAirport = featuredAirports.find((item) =>
    [item.code, item.iata]
      .filter(Boolean)
      .some((value) => String(value).trim().toUpperCase() === normalizedCode),
  )
  if (catalogAirport?.city) return catalogAirport.city

  const destination = featuredDestinations.value.find((item) =>
    [item.code, item.iata]
      .filter(Boolean)
      .some((value) => String(value).trim().toUpperCase() === normalizedCode),
  )

  return destination?.city || destination?.name || normalizedCode
}

function resolveAirportSelection(value = '', airport = null) {
  if (airport && (airport.latitude || airport.longitude || airport.code || airport.iata)) {
    return airport
  }

  const normalizedCode = String(value || '')
    .trim()
    .toUpperCase()
  if (!normalizedCode) return null

  const catalogAirport = featuredAirports.find((item) =>
    [item.code, item.iata]
      .filter(Boolean)
      .some((candidate) => String(candidate).trim().toUpperCase() === normalizedCode),
  )
  if (catalogAirport) return catalogAirport

  const destinationAirport = featuredDestinations.value.find((item) =>
    [item.code, item.iata]
      .filter(Boolean)
      .some((candidate) => String(candidate).trim().toUpperCase() === normalizedCode),
  )

  if (!destinationAirport) return null

  return (
    featuredAirports.find((item) =>
      [item.code, item.iata].filter(Boolean).some(
        (candidate) =>
          String(candidate).trim().toUpperCase() ===
          String(destinationAirport.code || destinationAirport.iata || '')
            .trim()
            .toUpperCase(),
      ),
    ) || destinationAirport
  )
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
  const legs = Array.isArray(summary?.legs)
    ? summary.legs.filter((leg) => leg?.origin || leg?.destination)
    : []
  if (!legs.length) return 'Tu vuelo privado'

  const tripType = String(summary?.tripType || '').trim()
  const firstLeg = legs[0]
  const lastLeg = legs[legs.length - 1]
  const firstOrigin = firstLeg.originAirport?.city || airportDisplayName(firstLeg.origin)
  const firstDestination =
    firstLeg.destinationAirport?.city || airportDisplayName(firstLeg.destination)
  const lastDestination =
    lastLeg.destinationAirport?.city || airportDisplayName(lastLeg.destination)

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
  return String(
    aircraft?.match_id ||
      aircraft?.matched_option_id ||
      aircraft?.aircraft_id ||
      aircraft?.id ||
      '',
  )
}

function isReservingAircraft(aircraft = {}) {
  return (
    Boolean(aircraftReservationKey(aircraft)) &&
    reservingAircraftId.value === aircraftReservationKey(aircraft)
  )
}

function routeDistanceKmForAircraft(aircraft = {}) {
  return Number(
    aircraft.distance_km ||
      aircraft.pricing_breakdown?.client_legs?.reduce(
        (sum, leg) => sum + Number(leg.distance_km || 0),
        0,
      ) ||
      0,
  )
}

function aircraftPricingContext() {
  const pendingMultiDestinationLegs =
    tripType.value === 'Multi-destino' &&
    searchForm.legs.some(
      (leg, index) => index > 0 && (!leg.origin || !leg.destination || !leg.date),
    )

  return {
    packageCode: selectedPriorityType.value,
    attentionLevel: 'normal',
    tripType:
      activeItinerarySummary.value?.tripType || activeItinerarySummary.value?.trip_type || '',
    segmentCount: Array.isArray(activeItinerarySummary.value?.legs)
      ? activeItinerarySummary.value.legs.length
      : 0,
    overnightNights: activeItinerarySummary.value?.days || 0,
    legs: activeItinerarySummary.value?.legs || [],
    catering: activeItinerarySummary.value?.catering || '',
    wifi: activeItinerarySummary.value?.wifi || 'none',
    groundTransport: activeItinerarySummary.value?.groundTransport || 'none',
    pets: activeItinerarySummary.value?.pets || '',
    specialBaggage: activeItinerarySummary.value?.specialBaggage || '',
    repositioningRequired: pendingMultiDestinationLegs ? true : undefined,
  }
}

function aircraftOperationalFlightHours(aircraft = {}) {
  if (hasBackendQuotedPricing(aircraft)) {
    const backendOperationalHours = Number(
      aircraft.operational_flight_hours || aircraft.billable_hours || 0,
    )
    if (Number.isFinite(backendOperationalHours) && backendOperationalHours > 0) {
      return backendOperationalHours
    }
  }

  const formula = buildFlightPricingFormula(aircraft, aircraftPricingContext())
  const operationalHours = formula.operationalFlightHours

  if (Number.isFinite(operationalHours) && operationalHours > 0) {
    return operationalHours
  }

  return 0
}

function aircraftDisplayFlightHours(aircraft = {}, includeRepositioning = false) {
  if (hasBackendQuotedPricing(aircraft)) {
    const explicitDisplayHours = Number(
      aircraft.trip_flight_hours ||
        aircraft.card_flight_hours ||
        aircraft.ui_flight_hours ||
        aircraft.client_display_flight_hours ||
      aircraft.display_flight_hours ||
        aircraft.real_flight_hours ||
        aircraft.flight_hours ||
        aircraft.estimated_hours ||
        0,
    )
    const repositioningHours = includeRepositioning ? Number(aircraft.repositioning_hours || 0) : 0

    if (explicitDisplayHours > 0) {
      return explicitDisplayHours + repositioningHours
    }
  }

  const formula = buildFlightPricingFormula(aircraft, aircraftPricingContext())
  const totalDisplayHours = Number(formula.displayFlightHours || 0)
  const repositioningHours = includeRepositioning ? Number(formula.repositioningHours || 0) : 0

  if (totalDisplayHours > 0) {
    return totalDisplayHours + repositioningHours
  }

  const operationalHours = aircraftOperationalFlightHours(aircraft)
  if (operationalHours > 0) return operationalHours

  const explicitVisibleHours = Number(aircraft.real_flight_hours || aircraft.flight_hours || 0)
  if (Number.isFinite(explicitVisibleHours) && explicitVisibleHours > 0) return explicitVisibleHours

  const distanceKm = routeDistanceKmForAircraft(aircraft)
  const speedKmh = Number(aircraft.speed_kmh || aircraft.speedKmh || 0)
  const climbDescentHours =
    Number(aircraft.climb_descent_hours || 0) ||
    Number(aircraft.climb_descent_minutes || aircraft.pricing_context?.climb_descent_minutes || 0) /
      60

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

  const rawTime = String(
    aircraft.trip_time ||
      aircraft.card_time ||
      aircraft.display_time ||
      aircraft.ui_time ||
      aircraft.time ||
      aircraft.flight_time ||
      '',
  )
  const hours = Number(rawTime.match(/(\d+(?:\.\d+)?)\s*h/i)?.[1] || 0)
  const minutes = Number(rawTime.match(/(\d+(?:\.\d+)?)\s*m/i)?.[1] || 0)
  const totalMinutes = hours * 60 + minutes
  return totalMinutes || Number.MAX_SAFE_INTEGER
}

function aircraftPremiumValue(aircraft) {
  const cabin = String(aircraft.cabin || aircraft.category || '').toLowerCase()
  const capacity = Number(aircraft.capacity || 0)
  const premiumCabin = [
    'premium',
    'heavy',
    'super midsize',
    'large',
    'long range',
    'vip',
    'elite',
  ].some((term) => cabin.includes(term))

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
  return (
    luxuryScore * 12 +
    amenityScore * 8 +
    timeScore * 1500 +
    priceScore * 250000 +
    (index === 0 ? 24 : 0)
  )
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
  if (cabin.includes('heavy') || cabin.includes('long'))
    return 'Cabina ideal para consejos, equipos senior y viajes VIP'
  if (cabin.includes('mid')) return 'Balance ideal entre presencia ejecutiva y eficiencia'
  if (cabin.includes('light'))
    return capacity >= 7
      ? 'Ideal para grupos ejecutivos compactos'
      : 'Excelente para juntas privadas y traslados agiles'
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
  const spreadHours = cabin.includes('helic')
    ? 0.08
    : cabin.includes('turbo')
      ? 0.06
      : cabin.includes('light')
        ? 0.05
        : cabin.includes('mid')
          ? 0.05
          : 0.06

  return {
    min: directHours,
    max: Math.max(directHours + spreadHours, directHours),
  }
}

function aircraftDurationLabel(aircraft = {}) {
  const backendVisibleHours = aircraftDisplayFlightHours(aircraft)
  const backendVisibleLabel = formatDurationFromHours(backendVisibleHours)
  if (backendVisibleLabel) return backendVisibleLabel

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

  return String(
    aircraft.trip_time ||
      aircraft.card_time ||
      aircraft.display_time ||
      aircraft.ui_time ||
      aircraft.time ||
      aircraft.flight_time ||
      activeItinerarySummary.value?.estimatedTime ||
      '42 min',
  )
}

function aircraftBillingNote(aircraft = {}) {
  if (hasBackendQuotedPricing(aircraft)) {
    return ''
  }

  const formula = buildFlightPricingFormula(aircraft, aircraftPricingContext())
  const minimumHours = Number(formula.minimumHours || aircraft.minimum_hours || 0)
  const operationalHours = Number(
    formula.operationalFlightHours || aircraft.operational_flight_hours || 0,
  )
  const billableHours = Number(formula.billableHours || aircraft.billable_hours || 0)

  if (minimumHours > 0 && billableHours >= minimumHours && minimumHours > operationalHours) {
    return `Tarifa calculada con minimo operativo de ${formatDurationFromHours(minimumHours)}.`
  }

  if (operationalHours > 0) {
    return 'Incluye ascenso, descenso y coordinacion operativa.'
  }

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
    .filter(
      (item) =>
        !String(item.cabin || item.category || '')
          .toLowerCase()
          .includes('helic'),
    )
    .reduce((min, item) => Math.min(min, aircraftPriceValue(item)), Number.POSITIVE_INFINITY)

  if (distanceKm > efficientLimitKm) return false
  if (aircraftRangeKm && distanceKm > aircraftRangeKm * 0.55) return false
  if (Number.isFinite(bestFixedWingPrice) && price > bestFixedWingPrice * 1.28 && index > 0)
    return false

  return true
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
    Number(aircraft.repositioning_cost || aircraft.repositioning_fee || 0) +
    Number(aircraft.return_to_base_cost || 0) +
    Number(aircraft.landing_fees || 0) +
    Number(aircraft.fbo_fees || 0) +
    Number(aircraft.fuel_surcharge || 0) +
    Number(aircraft.airport_expenses || aircraft.expense_fee || 0) +
    Number(aircraft.overnight_cost || aircraft.overnight_fees || 0) +
    Number(aircraft.margin_amount || 0) +
    Number(aircraft.taxes || 0)

  return explicitFees > 0 ? explicitFees : 0
}

function hasBackendQuotedPricing(aircraft = {}) {
  const hasMatchIdentity = Boolean(aircraft.match_id || aircraft.matched_option_id)
  const hasPrice =
    Number(aircraft.base_price || 0) > 0 ||
    Number(aircraft.total || 0) > 0 ||
    moneyValue(aircraft.final_price) > 0

  return hasMatchIdentity && hasPrice
}

function aircraftPricingForType(aircraft = {}, priorityType = 'essential') {
  const priorityMeta = resolvePriorityOption(priorityType)
  if (hasBackendQuotedPricing(aircraft)) {
    const basePrice = Number(aircraft.base_price || 0)
    const operationalFees = resolveAircraftOperationalFees(aircraft)
    const finalPrice =
      Number(aircraft.total || 0) || moneyValue(aircraft.final_price) || basePrice + operationalFees
    const displayFlightHours = Number(
      aircraft.display_flight_hours ||
        aircraft.real_flight_hours ||
        aircraft.flight_hours ||
        aircraft.estimated_hours ||
        0,
    )
    const billableHours = Number(aircraft.billable_hours || 0)
    const overnightCost = Number(
      aircraft.overnight_cost || aircraft.overnight_fees || aircraft.overnight_fee || 0,
    )
    const expenseFee = Number(aircraft.airport_expenses || aircraft.expense_fee || 0)
    const ivaAmount = Number(aircraft.iva_amount || aircraft.taxes || aircraft.tax || 0)
    const subtotalBeforeMultipliers =
      Number(
        aircraft.subtotal_before_margin ||
          aircraft.subtotal_before_multipliers ||
          aircraft.subtotal ||
          0,
      ) || basePrice + expenseFee

    return {
      basePrice,
      operationalFees,
      priorityMultiplier: 1,
      priorityPrice: 0,
      finalPrice,
      priorityType: priorityMeta.code,
      priorityName: priorityMeta.name,
      headline: 'Cotizacion backend aplicada',
      description: 'La tarjeta respeta los importes reales entregados por backend.',
      savings: 0,
      routeBand: aircraft.route_band || '',
      routeMultiplier: Number(aircraft.route_multiplier || 1),
      cruiseSpeedKmh: Number(aircraft.speed_kmh || aircraft.speedKmh || 0),
      reserveHours: Number(aircraft.reserve_hours || 0),
      displayFlightHours,
      operationalFlightHours: Number(
        aircraft.operational_flight_hours || billableHours || displayFlightHours || 0,
      ),
      rawFlightHours: Number(aircraft.raw_flight_hours || aircraft.real_flight_hours || 0),
      billableHours,
      realFlightHours: Number(
        aircraft.real_flight_hours || aircraft.flight_hours || aircraft.estimated_hours || 0,
      ),
      minimumHours: Number(aircraft.minimum_hours || 0),
      minimumRoutePrice: Number(aircraft.minimum_route_price || 0),
      rawBaseCost: basePrice,
      repositioning: Number(aircraft.repositioning_cost || aircraft.repositioning_fee || 0),
      repositioningHours: Number(aircraft.repositioning_hours || 0),
      repositioningRequired:
        Number(aircraft.repositioning_cost || aircraft.repositioning_fee || 0) > 0 ||
        Number(aircraft.repositioning_hours || 0) > 0,
      repositioningPolicy: null,
      operationalCostBreakdown: 0,
      overnightCost: Number(aircraft.overnight_cost || overnightCost || 0),
      extraServicesTotal: overnightCost,
      expenseFee,
      ivaRate: 0,
      ivaAmount,
      dynamicMarketFloor: null,
      commercialMargin: Number(aircraft.margin_percentage || 0),
      attentionFactor: 1,
      subtotalBeforeMultipliers,
      formattedBasePrice: formatCurrency(basePrice),
      formattedPriorityPrice: formatCurrency(0),
      formattedOperationalFees: formatCurrency(operationalFees),
      formattedFinalPrice: formatCurrency(finalPrice),
      formattedSavings: formatCurrency(0),
      formattedSubtotalBeforeMultipliers: formatCurrency(subtotalBeforeMultipliers),
    }
  }

  const formula = buildFlightPricingFormula(aircraft, {
    ...aircraftPricingContext(),
    packageCode: priorityType,
  })

  if (formula.hasFormulaInputs) {
    const repositioningRequired =
      Boolean(
        formula.repositioningPolicy?.chargeInitial || formula.repositioningPolicy?.chargeFinal,
      ) ||
      Number(formula.repositioningHours || 0) > 0 ||
      Number(formula.repositioning || 0) > 0

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
      cruiseSpeedKmh: formula.cruiseSpeedKmh,
      reserveHours: formula.reserveHours,
      displayFlightHours: formula.displayFlightHours,
      operationalFlightHours: formula.operationalFlightHours,
      rawFlightHours: formula.rawFlightHours,
      billableHours: formula.billableHours,
      realFlightHours: formula.realFlightHours,
      minimumHours: formula.minimumHours,
      minimumRoutePrice: formula.minimumRoutePrice,
      rawBaseCost: formula.rawBaseCost,
      repositioning: formula.repositioning,
      repositioningHours: formula.repositioningHours,
      repositioningRequired,
      repositioningPolicy: formula.repositioningPolicy,
      operationalCostBreakdown: formula.operationalCosts,
      overnightCost: formula.extraServices?.overnight || 0,
      extraServicesTotal: formula.extraServices.total,
      expenseFee: formula.expenseFee,
      ivaRate: formula.ivaRate,
      ivaAmount: formula.ivaAmount,
      dynamicMarketFloor: formula.dynamicMarketFloor,
      commercialMargin: formula.commercialMargin,
      attentionFactor: formula.priorityFactor,
      subtotalBeforeMultipliers: formula.subtotalBeforeMultipliers,
      formattedBasePrice: formatCurrency(formula.baseCost),
      formattedPriorityPrice: formatCurrency(
        Math.max(formula.finalPrice - formula.subtotalBeforeMultipliers, 0),
      ),
      formattedOperationalFees: formatCurrency(
        formula.airportFees + formula.ivaAmount + formula.expensesTotal,
      ),
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

  const pricing = calculatePriorityPricing(
    basePrice,
    operationalFees,
    Number(priorityMeta.multiplier || 1),
  )
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
  void aircraftList
  void quotePayload
}

const selectedAircraftPricing = computed(() => {
  return aircraftPricingForType(selectedAircraft.value || {}, selectedPriorityType.value)
})

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
  if (section === 'reservar') {
    quoteResultsVisible.value = false
  }
  if (['resultados', 'paquete-vuelo', 'aeronave', 'reserva'].includes(section)) {
    quoteResultsVisible.value = true
  }
  router.push(
    id
      ? {
          name: 'cliente-detalle',
          params: { section, id },
        }
      : {
          name: 'cliente',
          params: { section },
        },
  )
}

function alignReservationWorkflowRoute() {
  if (!needsReservationContext.value) return
  if (!hasReservationsLoaded.value) return

  const currentReservationId = String(routeId.value || '').trim()
  const fallbackReservationId = reservationContextId.value

  if (
    currentReservationId &&
    selectedReservation.value &&
    currentReservationId === fallbackReservationId
  )
    return

  if (!currentReservationId && fallbackReservationId) {
    router.replace(`/cliente/${props.section}/${fallbackReservationId}`)
    return
  }

  if (
    currentReservationId &&
    fallbackReservationId &&
    currentReservationId !== fallbackReservationId
  ) {
    router.replace(`/cliente/${props.section}/${fallbackReservationId}`)
    return
  }

  if (currentReservationId && !selectedReservation.value) {
    if (fallbackReservationId) {
      router.replace(`/cliente/${props.section}/${fallbackReservationId}`)
      return
    }

    router.replace({ name: 'cliente', params: { section: 'viajes' } })
    return
  }

  if (!fallbackReservationId) {
    router.replace({ name: 'cliente', params: { section: 'viajes' } })
  }
}

function goToPayment(reservationId = '') {
  if (!paymentReadyForCheckout.value) {
    ui.pushToast({
      tone: 'warning',
      title: 'Pago aun no disponible',
      message:
        selectedReservationFrontendState.value.status_message ||
        'Necesitamos confirmar la firma del contrato antes de abrir el pago.',
    })
    go('contrato', reservationId || reservationContextId.value)
    return
  }

  go('pago', reservationId || reservationContextId.value)
}

function goToConcierge(reservationId = '') {
  go('soporte', reservationId || reservationContextId.value)
}

function clearInlineContractPrintMode() {
  if (typeof document === 'undefined') return
  document.body.classList.remove('contract-print-mode')
}

function buildPrintableContractFileName() {
  if (typeof document === 'undefined') return 'contrato'

  const routeLabel = document.querySelector('.contract-cover__route')?.textContent || ''
  const reservationLabel = document.querySelector('.contract-cover .eyebrow')?.textContent || ''
  const rawName = [routeLabel, reservationLabel]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' - ')

  const normalizedName = rawName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return normalizedName || 'contrato'
}

function openInlineContractPrint(onAfterPrint = null) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false

  const contractPanel = document.querySelector('.document-panel')
  const contractPreview = document.querySelector('.contract-preview')

  if (!(contractPanel instanceof HTMLElement) || !(contractPreview instanceof HTMLElement)) {
    return false
  }

  clearInlineContractPrintMode()
  document.body.classList.add('contract-print-mode')
  const previousTitle = document.title
  document.title = buildPrintableContractFileName()

  const handleAfterPrint = () => {
    document.title = previousTitle
    clearInlineContractPrintMode()
    if (typeof onAfterPrint === 'function') {
      onAfterPrint()
    }
  }

  window.addEventListener('afterprint', handleAfterPrint, { once: true })
  window.setTimeout(() => {
    window.print()
    window.setTimeout(() => {
      document.title = previousTitle
    }, 1000)
  }, 80)

  return true
}

function mergeReservationUpdate(updatedReservation = null) {
  const normalizedReservationId = String(updatedReservation?.id || '').trim()
  if (!normalizedReservationId) return

  const nextReservation = {
    ...updatedReservation,
    id: normalizedReservationId,
  }
  const existingIndex = reservations.value.findIndex(
    (reservation) => String(reservation.id) === normalizedReservationId,
  )

  if (existingIndex === -1) return

  reservations.value = reservations.value.map((reservation, index) =>
    index === existingIndex ? { ...reservation, ...nextReservation } : reservation,
  )
}

function isTruthyQueryFlag(value) {
  const normalizedValue = String(value || '')
    .trim()
    .toLowerCase()

  return ['1', 'true', 'yes', 'ok'].includes(normalizedValue)
}

function findReservationRecordById(reservationId = '') {
  const normalizedReservationId = String(reservationId || '').trim()
  if (!normalizedReservationId) return null

  return (
    reservations.value.find(
      (reservation) =>
        String(reservation.id || '').trim() === normalizedReservationId ||
        String(reservation.flight_request_id || '').trim() === normalizedReservationId ||
        String(reservation.request_id || '').trim() === normalizedReservationId,
    ) || null
  )
}

async function applySignedContractReturnState() {
  if (!isTruthyQueryFlag(route.query.contract_signed)) return

  const reservationId =
    reservationContextId.value || String(route.query.reservation_id || '').trim()
  const contractId = String(route.query.contract_id || '').trim()
  const appliedKey = `${reservationId}:${contractId}:${String(route.query.contract_signed || '')}`

  if (!reservationId || appliedSignedContractReturnKey.value === appliedKey) return

  const pendingContext =
    readPendingContractContext({
      reservationId,
      contractId,
    }) || {}
  const currentReservation = findReservationRecordById(reservationId)

  if (!currentReservation) return

  let contractStatusPayload = null

  if (contractId || pendingContext.contractId || pendingContext.contract_id) {
    const effectiveContractId = String(
      contractId || pendingContext.contractId || pendingContext.contract_id || '',
    ).trim()

    if (effectiveContractId) {
      try {
        contractStatusPayload = await contractApi.getContractStatus(effectiveContractId, {
          timeoutMs: 30000,
        })
      } catch (error) {
        console.warn('[contract-status-sync-warning]', {
          reservationId,
          contractId: effectiveContractId,
          message: error?.message || 'No se pudo validar el estado del contrato.',
        })
      }
    }
  }

  const syncedFrontendState = normalizeContractFrontendState(contractStatusPayload || {})
  const readyForPayment =
    syncedFrontendState.ready_for_payment === true ||
    ['go_to_payment', 'go_to_history'].includes(
      String(syncedFrontendState.next_action || '').trim(),
    ) ||
    String(syncedFrontendState.docusign_status || '').trim().toLowerCase() === 'completed'

  if (!readyForPayment) {
    appliedSignedContractReturnKey.value = ''
    clearSignedContractSyncTimer()
    signedContractSyncTimer = window.setTimeout(() => {
      signedContractSyncTimer = null
      void refreshReservations({ silent: true })
    }, 4000)
    return
  }

  clearSignedContractSyncTimer()
  appliedSignedContractReturnKey.value = appliedKey

  let persistedReadyForPaymentReservation = null

  try {
    persistedReadyForPaymentReservation = await markClientTripReadyForPayment(
      reservationId,
      {
        reservation_id: reservationId,
        flight_request_id:
          currentReservation.flight_request_id ||
          pendingContext.flightRequestId ||
          pendingContext.flight_request_id ||
          '',
        contract_snapshot:
          pendingContext.contractPayload?.contract_snapshot ||
          pendingContext.contract_payload?.contract_snapshot ||
          null,
      },
      { timeoutMs: 30000 },
    )
  } catch (error) {
    console.warn('[contract-ready-for-payment-persist-warning]', {
      reservationId,
      contractId,
      message: error?.message || 'No se pudo persistir payment_pending en backend.',
    })
  }

  mergeReservationUpdate({
    ...currentReservation,
    ...(persistedReadyForPaymentReservation && typeof persistedReadyForPaymentReservation === 'object'
      ? persistedReadyForPaymentReservation
      : {}),
    id: String(currentReservation.id || reservationId).trim(),
    is_reservation: true,
    status: 'payment_pending',
    workflow_status: 'contrato firmado',
    contract_status: 'signed',
    payment_status:
      currentReservation.payment_status === 'Pagado' ? currentReservation.payment_status : 'Pendiente de pago',
    updated_at: new Date().toISOString(),
    contract:
      currentReservation.contract || contractId
        ? {
            ...currentReservation.contract,
            ...(contractStatusPayload?.contract && typeof contractStatusPayload.contract === 'object'
              ? contractStatusPayload.contract
              : {}),
            id:
              contractId ||
              currentReservation.contract?.id ||
              pendingContext.contractId ||
              contractStatusPayload?.contract?.id ||
              '',
            status: contractStatusPayload?.contract?.status || 'signed',
            docusign_status:
              contractStatusPayload?.contract?.docusign_status ||
              contractStatusPayload?.docusign_status ||
              'completed',
            docusign_envelope_id:
              currentReservation.contract?.docusign_envelope_id ||
              contractStatusPayload?.contract?.docusign_envelope_id ||
              contractStatusPayload?.docusign_envelope_id ||
              pendingContext.docusign_envelope_id ||
              '',
          }
        : currentReservation.contract,
    docusign_status:
      contractStatusPayload?.docusign_status ||
      contractStatusPayload?.contract?.docusign_status ||
      'completed',
    frontend_state: {
      ...currentReservation.frontend_state,
      ...syncedFrontendState,
      ui_status: syncedFrontendState.ui_status || 'completed',
      ready_for_payment: true,
      next_action: syncedFrontendState.next_action || 'go_to_payment',
      status_message:
        syncedFrontendState.status_message || 'El contrato ya quedo listo para continuar a pago.',
      docusign_status: syncedFrontendState.docusign_status || 'completed',
      docusign_envelope_id:
        syncedFrontendState.docusign_envelope_id ||
        currentReservation.frontend_state?.docusign_envelope_id ||
        pendingContext.docusign_envelope_id ||
        '',
    },
  })

  clearPendingContractContext({
    reservationId,
    contractId: contractId || pendingContext.contractId || pendingContext.contract_id || '',
  })
  void refreshReservations({ silent: true })
}

const signedContractReservationSignature = computed(() =>
  reservations.value
    .map((reservation) =>
      [
        resolveEntityIdentifier(reservation?.id),
        resolveEntityIdentifier(reservation?.flight_request_id),
        String(reservation?.status || '').trim(),
        String(reservation?.workflow_status || '').trim(),
        String(reservation?.contract_status || '').trim(),
        String(reservation?.payment_status || '').trim(),
        String(reservation?.contract?.status || '').trim(),
        String(reservation?.contract?.docusign_status || reservation?.docusign_status || '').trim(),
        String(reservation?.frontend_state?.ready_for_payment ?? '').trim(),
      ].join(':'),
    )
    .join('|'),
)

function applyExternalWorkflowSync(payload = {}) {
  const synchronizedId = String(payload.reservationId || payload.requestId || '').trim()
  const nextStage = String(payload.nextStage || '').trim()
  if (!synchronizedId || !nextStage) return

  const currentReservation = reservations.value.find(
    (reservation) =>
      String(reservation.id || '').trim() === synchronizedId ||
      String(reservation.requestId || '').trim() === synchronizedId ||
      String(reservation.reservationId || '').trim() === synchronizedId,
  )

  if (!currentReservation) return

  const patch = {
    id: String(currentReservation.id || synchronizedId).trim(),
    status: nextStage,
    workflow_status: nextStage,
    updated_at: new Date().toISOString(),
  }

  if (nextStage === 'contract_pending') {
    patch.contract_status = 'generated'
  }

  if (nextStage === 'payment_pending') {
    patch.contract_status = 'signed'
    patch.payment_status = 'Pendiente de pago'
  }

  if (nextStage === 'tracking_live') {
    patch.payment_status = currentReservation.payment_status || 'Pago confirmado'
  }

  if (nextStage === 'completed') {
    patch.payment_status = currentReservation.payment_status || 'Pago confirmado'
    patch.completed_at = new Date().toISOString()
  }

  mergeReservationUpdate({
    ...currentReservation,
    ...patch,
  })
}

async function handleContractConfirm(contractPayload = {}) {
  const reservationId = reservationContextId.value
  if (!reservationId || signingContract.value) return
  const baseReservation =
    (selectedReservation.value && String(selectedReservation.value.id) === String(reservationId)
      ? selectedReservation.value
      : null) || findReservationRecordById(reservationId) || {}

  const optimisticReservation = {
    ...baseReservation,
    id: reservationId,
    is_reservation: true,
    status: 'contract_pending',
    workflow_status: 'contrato pendiente',
    contract_status: 'pending',
    payment_status: 'Pendiente de firma',
    updated_at: new Date().toISOString(),
  }

  mergeReservationUpdate(optimisticReservation)
  signingContract.value = true

  try {
    if (!canUseExternalContractFlow()) {
      throw new Error('El flujo digital de contratos con DocuSign no esta habilitado.')
    }

    const flightRequestId = String(
      contractPayload?.flight_request_id || baseReservation.flight_request_id || baseReservation.request_id || '',
    ).trim()
    const existingContractId = String(
      contractPayload?.contract_id || baseReservation.contract?.id || baseReservation.contract_id || '',
    ).trim()

    let contractResponse = null
    let contractId = existingContractId

    if (contractId && dedicatedDocusignSendPath && !contractPayload?.full_contract_html) {
      contractResponse = await contractApi.sendToDocuSign(contractId, { timeoutMs: 120000 })
    } else {
      const callbackUrl = buildContractResultUrl({
        reservationId,
        flightRequestId,
      })
      const docusignPayload = {
        booking_id: reservationId,
        reservation_id: reservationId,
        flight_request_id: flightRequestId || undefined,
        client_name:
          baseReservation.client_name ||
          baseReservation.customer_name ||
          customerDisplayName.value,
        client_email:
          baseReservation.client_email ||
          baseReservation.customer_email ||
          paymentForm.contactEmail.trim() ||
          customerEmail.value,
        route: contractPayload?.contract_snapshot?.route || '',
        flight_date: contractPayload?.contract_snapshot?.departure_date || '',
        aircraft: contractPayload?.contract_snapshot?.aircraft || '',
        total:
          contractPayload?.contract_snapshot?.final_price ||
          baseReservation.final_price ||
          baseReservation.total ||
          '',
        currency: 'USD',
        return_url: callbackUrl,
        callback_url: callbackUrl,
        contract_snapshot: contractPayload?.contract_snapshot || null,
        contract_html: contractPayload?.contract_html || '',
        contract_markup: contractPayload?.contract_markup || '',
        contract_plain_text: contractPayload?.contract_plain_text || '',
        document_html: contractPayload?.document_html || contractPayload?.contract_html || '',
        full_contract_html:
          contractPayload?.full_contract_html ||
          contractPayload?.document_html ||
          contractPayload?.contract_html ||
          '',
        full_contract_text:
          contractPayload?.full_contract_text || contractPayload?.contract_plain_text || '',
        source_contract_path: contractPayload?.source_contract_path || '',
        document_source: contractPayload?.document_source || 'client_contract_full_html',
        regenerate: true,
        signature: null,
      }

      console.log('[docusign-request-payload]', docusignPayload)

      contractResponse = await generateAndSendContract(docusignPayload, { timeoutMs: 120000 })
      contractId = resolveContractRecordId(contractResponse)
    }

    const signingUrl = resolveContractSigningUrl(contractResponse)
    const docusignEnvelopeId = resolveDocusignEnvelopeId(contractResponse)
    const docusignStatus = resolveDocusignStatus(contractResponse) || 'sent'

    if (!signingUrl) {
      throw new Error('No se recibio la URL de firma de DocuSign.')
    }
    if (!isDocuSignRecipientSigningUrl(signingUrl)) {
      throw new Error(
        'DocuSign devolvio una vista de edicion del sobre, no la firma del cliente. El backend debe regresar la recipient view o signing_url correcta.',
      )
    }

    persistPendingContractContext({
      reservationId,
      reservation_id: reservationId,
      flightRequestId,
      flight_request_id: flightRequestId,
      contractId,
      contract_id: contractId,
      docusign_envelope_id: docusignEnvelopeId,
      docusign_status: docusignStatus,
      contractPayload,
      contract_payload: contractPayload,
      signedRedirectSection: 'contrato',
    })
    mergeReservationUpdate({
      ...optimisticReservation,
      contract:
        contractId || baseReservation.contract
          ? {
              ...baseReservation.contract,
              id: contractId || baseReservation.contract?.id || '',
              docusign_envelope_id: docusignEnvelopeId,
              docusign_status: docusignStatus,
            }
          : baseReservation.contract,
      workflow_status: 'contrato pendiente',
      contract_status: 'pending',
      payment_status: 'Pendiente de firma',
      docusign_envelope_id: docusignEnvelopeId,
      docusign_status: docusignStatus,
      frontend_state: {
        ui_status: 'sent',
        ready_for_payment: false,
        next_action: 'wait_for_signature',
        status_message: 'Esperando confirmacion de firma de DocuSign...',
        signed_pdf_url: '',
        docusign_envelope_id: docusignEnvelopeId,
        docusign_status: docusignStatus,
      },
    })
    window.location.assign(signingUrl)
    return
  } catch (error) {
    console.log('[docusign-init-error]', {
      error,
      message: error?.message || '',
      status: error?.status || null,
      payload: error?.payload || null,
      reservationId,
      contractPayload,
    })
    console.error('[docusign-init-error]', {
      error,
      message: error?.message || '',
      status: error?.status || null,
      payload: error?.payload || null,
      reservationId,
      contractPayload,
    })
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo iniciar la firma digital',
      message: error?.message || 'No fue posible iniciar DocuSign para este contrato.',
    })
  } finally {
    signingContract.value = false
  }
}

async function handlePaymentSubmit() {
  const flightRequestId = flightRequestContextId.value
  const reservationId = reservationContextId.value

  if (!flightRequestId) {
    paymentInlineError.value = 'No encontramos la reserva para iniciar el pago.'
    return
  }

  paymentInlineError.value = ''

  if (!paymentForm.contactEmail.trim()) {
    paymentInlineError.value = 'Agrega un correo electronico de contacto para continuar.'
    return
  }

  paymentSubmitting.value = true

  try {
    if (selectedPaymentMethod.value === 'wire') {
      destroyStripePaymentElement()

      const payload = await createClientWireIntent(
        flightRequestId,
        {
          contact_email: paymentForm.contactEmail.trim(),
          payment_method: 'wire',
        },
        { timeoutMs: 30000 },
      )

      wireInstructions.value =
        payload?.wire_instructions || payload?.instructions || payload?.data || null
      paymentLastReference.value =
        wireInstructions.value?.reference || payload?.reference || payload?.payment_reference || ''

      mergeReservationUpdate({
        id: flightRequestId,
        status: 'pending_payment',
        workflow_status: 'pago pendiente',
        payment_status: 'Pendiente de confirmacion bancaria',
        updated_at: new Date().toISOString(),
      })

      ui.pushToast({
        tone: 'success',
        title: 'Transferencia preparada',
        message:
          'Ya puedes copiar la referencia bancaria y subir tu comprobante con concierge o admin.',
      })

      return
    }

    if (!paymentCardComplete.value) {
      throw new Error('Completa correctamente los datos de la tarjeta antes de continuar.')
    }

    let paymentIntentPayload = null

    if (!stripeIntentSecret || !resolveStripePublishableKey()) {
      paymentIntentPayload = await createClientPaymentIntent(
        flightRequestId,
        {
          contact_email: paymentForm.contactEmail.trim() || customerEmail.value,
        },
        { timeoutMs: 30000 },
      )

      cacheStripePaymentIntent(paymentIntentPayload)
    }

    if (!stripeClient || !stripeElements || !stripeCardNumberElement) {
      await ensureStripePaymentElement(paymentIntentPayload?.publishable_key || '')
    }

    if (!stripeClient || !stripeCardNumberElement) {
      throw new Error('El formulario de tarjeta segura todavia no esta listo.')
    }

    if (!stripeIntentSecret) {
      const payload = await createClientPaymentIntent(
        flightRequestId,
        {
          contact_email: paymentForm.contactEmail.trim() || customerEmail.value,
        },
        { timeoutMs: 30000 },
      )

      cacheStripePaymentIntent(payload)

      if (!stripeIntentSecret) {
        throw new Error('El backend no devolvio client_secret para confirmar el pago.')
      }
    }

    const result = await stripeClient.confirmCardPayment(stripeIntentSecret, {
      payment_method: {
        card: stripeCardNumberElement,
        billing_details: {
          name: customerDisplayName.value,
          email: paymentForm.contactEmail.trim(),
        },
      },
      receipt_email: paymentForm.contactEmail.trim(),
    })

    if (result.error) {
      throw new Error(result.error.message || 'Stripe no pudo confirmar el pago.')
    }

    paymentLastReference.value = result.paymentIntent?.id || paymentLastReference.value

    mergeReservationUpdate({
      id: reservationId || flightRequestId,
      flight_request_id:
        resolveEntityIdentifier(selectedReservation.value?.flight_request_id) || flightRequestId,
      status:
        result.paymentIntent?.status === 'succeeded' ? 'payment_confirmed' : 'payment_pending',
      workflow_status:
        result.paymentIntent?.status === 'succeeded' ? 'pago confirmado' : 'pago pendiente',
      payment_status: result.paymentIntent?.status === 'succeeded' ? 'Pagado' : 'Pago en revision',
      updated_at: new Date().toISOString(),
    })

    if (result.paymentIntent?.status === 'succeeded') {
      let persistedConfirmedReservation = null

      try {
        persistedConfirmedReservation = await markClientTripPaymentConfirmed(
          reservationId || flightRequestId,
          {
            reservation_id: reservationId,
            flight_request_id: flightRequestId,
            payment_intent_id: result.paymentIntent?.id || '',
            brand: normalizeCardBrand(paymentCardBrand.value),
          },
          { timeoutMs: 30000 },
        )

        if (typeof console !== 'undefined') {
          console.log('[payment-confirmed-sync] Backend confirmo el pago', {
            reservation_id: reservationId || '',
            flight_request_id: flightRequestId || '',
            payment_intent_id: result.paymentIntent?.id || '',
            card_brand: normalizeCardBrand(paymentCardBrand.value),
            persisted_reservation: persistedConfirmedReservation,
          })
        }
      } catch (persistError) {
        if (typeof console !== 'undefined') {
          console.error('[payment-confirmed-sync] No se pudo guardar el pago confirmado en backend', {
            reservation_id: reservationId || '',
            flight_request_id: flightRequestId || '',
            payment_intent_id: result.paymentIntent?.id || '',
            card_brand: normalizeCardBrand(paymentCardBrand.value),
            error: persistError,
          })
        }

        ui.pushToast({
          tone: 'warning',
          title: 'Pago confirmado, sincronizacion pendiente',
          message:
            persistError?.message ||
            'Stripe confirmo el cargo, pero el backend todavia no guardo el nuevo estado del pago.',
        })
      }

      const confirmedPaymentReservation = {
        ...selectedReservation.value,
        ...persistedConfirmedReservation,
        id: reservationId || resolveEntityIdentifier(selectedReservation.value?.id) || flightRequestId,
        flight_request_id:
          resolveEntityIdentifier(
            persistedConfirmedReservation?.flight_request_id ||
              selectedReservation.value?.flight_request_id,
          ) || flightRequestId,
        is_reservation: true,
        status: 'payment_confirmed',
        workflow_status: 'payment_confirmed',
        contract_status: selectedReservation.value?.contract_status || 'signed',
        payment_status: 'Pagado',
        payment_order: {
          ...selectedReservation.value?.payment_order,
          status: 'paid',
          payment_intent_id: result.paymentIntent?.id || '',
          brand: normalizeCardBrand(paymentCardBrand.value),
        },
        payment_brand: normalizeCardBrand(paymentCardBrand.value),
        updated_at: new Date().toISOString(),
      }

      mergeReservationUpdate(confirmedPaymentReservation)

      try {
        await refreshReservations({ silent: true })
      } finally {
        // Si el webhook/backend tarda unos segundos, mantenemos la vista del cliente consistente.
        mergeReservationUpdate(confirmedPaymentReservation)
      }

      try {
        await sendPaymentInvoiceNotification({
          reservationId: flightRequestId,
          paymentIntentId: result.paymentIntent?.id || '',
          paymentStatus: result.paymentIntent?.status || '',
        })
      } catch (invoiceError) {
        ui.pushToast({
          tone: 'warning',
          title: 'Pago confirmado, factura pendiente',
          message:
            invoiceError?.message ||
            'El pago se confirmo, pero no logramos avisar al modulo de factura automaticamente.',
        })
      }

      ui.pushToast({
        tone: 'success',
        title: 'Pago confirmado',
        message: 'La tarjeta fue autorizada pago exitoso.',
      })
      go('viajes', confirmedPaymentReservation.id)
      return
    }

    ui.pushToast({
      tone: 'success',
      title: 'Pago enviado',
      message:
        'Stripe recibio la autorizacion. Estamos esperando la confirmacion final del webhook.',
    })
  } catch (error) {
    paymentInlineError.value =
      error?.message || 'No fue posible iniciar el flujo de pago. Intenta de nuevo.'
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo iniciar el pago',
      message: paymentInlineError.value,
    })
  } finally {
    paymentSubmitting.value = false
  }
}

async function ensureReservationForSelectedTrip(targetId = '') {
  const normalizedTargetId = resolveEntityIdentifier(targetId)
  const trip =
    reservations.value.find(
      (reservation) =>
        resolveEntityIdentifier(reservation.id) === normalizedTargetId ||
        resolveEntityIdentifier(reservation.flight_request_id) === normalizedTargetId,
    ) || selectedReservation.value

  if (!trip) {
    throw new Error('No encontramos un viaje activo para abrir el contrato.')
  }

  if (trip.is_reservation) {
    return trip
  }

  const flightRequestId = String(trip.flight_request_id || trip.id || '').trim()

  if (!flightRequestId) {
    throw new Error('La solicitud no tiene un identificador valido para generar la reserva.')
  }

  const payload = await ensureClientReservation(
    { flight_request_id: flightRequestId },
    { timeoutMs: 20000 },
  )
  const reservationRecord = payload?.reservation || payload?.data || payload

  if (!reservationRecord?.id) {
    throw new Error('No se pudo crear la reserva para abrir el contrato.')
  }

  await refreshReservations({ silent: true })

  return {
    ...trip,
    ...reservationRecord,
    id: reservationRecord.id,
    flight_request_id: reservationRecord.flight_request_id || flightRequestId,
    is_reservation: true,
  }
}

async function handleOpenContract(targetId = '') {
  try {
    const reservation = await ensureReservationForSelectedTrip(targetId)
    go('contrato', reservation.id)
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo abrir el contrato',
      message: error?.message || 'Necesitamos una reserva valida antes de mostrar el contrato.',
    })
  }
}

watch(
  customerEmail,
  (value) => {
    if (!paymentForm.contactEmail || paymentForm.contactEmail === 'cliente@skygroup.com') {
      paymentForm.contactEmail = value
    }
  },
  { immediate: true },
)

watch(
  () => [props.section, selectedPaymentMethod.value, routeId.value],
  async ([section, method]) => {
    if (section === 'pago' && method === 'card') {
      wireInstructions.value = null
      await nextTick()
      if (!resolveStripePublishableKey() && flightRequestContextId.value) {
        try {
          const payload = await createClientPaymentIntent(
            flightRequestContextId.value,
            {
              contact_email: paymentForm.contactEmail.trim() || customerEmail.value,
            },
            { timeoutMs: 30000 },
          )
          cacheStripePaymentIntent(payload)
        } catch (error) {
          paymentInlineError.value =
            error?.message || 'No se pudo preparar el pago seguro con Stripe.'
          return
        }
      }

      await ensureStripePaymentElement()
      return
    }

    if (method !== 'card') {
      destroyStripePaymentElement()
    }
  },
  { immediate: true },
)

function selectDestination(destination) {
  if (submittedItinerary.value || aircraftOptions.value.length) {
    clearQuotePreviewState()
  }
  const resolvedAirport = resolveAirportSelection(destination?.code, destination)

  if (tripType.value === 'Multi-destino') {
    const lastLeg = searchForm.legs[searchForm.legs.length - 1]
    const hasEmptyLastDestination = lastLeg && !lastLeg.destination

    if (hasEmptyLastDestination) {
      lastLeg.destination = destination.code
      lastLeg.destinationAirport = resolvedAirport
      syncMultiDestinationChain(searchForm.legs.length)
      return
    }

    searchForm.legs.push(
      createEmptyLeg({
        origin: lastLeg?.destination || searchForm.destination,
        originAirport: lastLeg?.destinationAirport || searchForm.destinationAirport,
        destination: destination.code,
        destinationAirport: resolvedAirport,
        date: lastLeg?.date || searchForm.departureDate,
        time: lastLeg?.time || searchForm.departureTime || '09:00',
      }),
    )
    return
  }

  searchForm.destination = destination.code
  searchForm.destinationAirport = resolvedAirport
}

function updateSearchField({ field, value }) {
  if (!Object.prototype.hasOwnProperty.call(searchForm, field)) return
  if (submittedItinerary.value || aircraftOptions.value.length) {
    clearQuotePreviewState()
  }
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
  if (
    !searchForm.legs[index] ||
    !Object.prototype.hasOwnProperty.call(searchForm.legs[index], field)
  )
    return
  if (submittedItinerary.value || aircraftOptions.value.length) {
    clearQuotePreviewState()
  }
  searchForm.legs[index][field] = value

  if (
    field === 'origin' &&
    Object.prototype.hasOwnProperty.call(searchForm.legs[index], 'originAirport')
  ) {
    searchForm.legs[index].originAirport = null
  }

  if (
    field === 'destination' &&
    Object.prototype.hasOwnProperty.call(searchForm.legs[index], 'destinationAirport')
  ) {
    searchForm.legs[index].destinationAirport = null
  }

  if (tripType.value === 'Multi-destino' && field === 'destination') {
    syncMultiDestinationChain(index + 1)
  }
}

function selectFormAirport({ field, airport }) {
  if (submittedItinerary.value || aircraftOptions.value.length) {
    clearQuotePreviewState()
  }
  if (field === 'origin') {
    searchForm.originAirport = airport
  }

  if (field === 'destination') {
    searchForm.destinationAirport = airport
  }
}

function selectLegAirport({ index, field, airport }) {
  if (!searchForm.legs[index]) return
  if (submittedItinerary.value || aircraftOptions.value.length) {
    clearQuotePreviewState()
  }

  if (
    field === 'origin' &&
    Object.prototype.hasOwnProperty.call(searchForm.legs[index], 'originAirport')
  ) {
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
  if (submittedItinerary.value || aircraftOptions.value.length) {
    clearQuotePreviewState()
  }
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
  if (submittedItinerary.value || aircraftOptions.value.length) {
    clearQuotePreviewState()
  }
  searchForm.legs.splice(index, 1)
  if (tripType.value === 'Multi-destino') {
    syncMultiDestinationChain(index)
  }
}

function buildItinerarySummary(payload) {
  const legs = Array.isArray(payload.legs)
    ? payload.legs.map((leg) => normalizeLegForQuote(leg))
    : []
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
    attentionLevel: normalizeAttentionLevel(
      payload.attention_level || payload.priority_level || '',
    ),
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

  return searchForm.legs.some(
    (leg, index) => index > 0 && (!leg.origin || !leg.destination || !leg.date),
  )
}

function validateSearchForm() {
  const firstLeg = itineraryLegs.value[0] || {}
  const secondLeg = itineraryLegs.value[1] || {}
  const incompleteMultiLeg = itineraryLegs.value.findIndex(
    (leg) => !leg.origin || !leg.destination || !leg.date,
  )
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

  if (
    tripType.value !== 'Ida' &&
    itineraryLegs.value.length < 2 &&
    !(tripType.value === 'Multi-destino' && pendingMultiDestinationLegs)
  ) {
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

  if (
    tripType.value === 'Redondo' &&
    (!secondLeg.date || !secondLeg.origin || !secondLeg.destination)
  ) {
    serverSearchError.value = 'Completa la fecha de regreso para cotizar tu viaje redondo.'
    ui.pushToast({
      tone: 'warning',
      title: 'Regreso pendiente',
      message: 'Agrega la fecha de regreso para completar el viaje redondo.',
    })
    return false
  }

  if (
    tripType.value === 'Multi-destino' &&
    incompleteMultiLeg !== -1 &&
    !pendingMultiDestinationLegs
  ) {
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
  if (!canQuoteFlights.value) {
    const blockedMessage = 'Necesitas demo activa o suscripcion vigente.'
    console.log('[bloqueo-cotizador-cliente]', {
      source: 'submitSearch',
      reason: 'canQuoteFlights=false',
      blockedMessage,
      access: auth.access,
      user: auth.user,
    })
    serverSearchError.value = blockedMessage
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo solicitar la reserva',
      message: blockedMessage,
    })
    return
  }

  if (!validateSearchForm()) return

  ui.pushToast({
    tone: 'success',
    title: 'Concierge Ejecutivo 24/7',
    message:
      'Recibimos tu solicitud de reserva. Estamos cotizando tu vuelo privado con seguimiento prioritario.',
  })

  searching.value = true
  quoteResultsVisible.value = true
  aircraftOptions.value = []
  try {
    const normalizedPassengers = Number(searchForm.passengers || 0) || 1
    const pendingMultiDestinationLegs = hasPendingMultiDestinationLegs()
    searchForm.passengers = String(normalizedPassengers)
    const quotePayload = {
      trip_type: tripTypeKey.value,
      trip_label: tripType.value,
      passengers: normalizedPassengers,
      days: itineraryDays.value,
      overnight_nights: itineraryDays.value,
      pets: searchForm.pets,
      special_baggage: searchForm.specialBaggage,
      preference: searchForm.preference,
      flight_package: selectedPriorityMeta.value?.name || '',
      priority_type: selectedPriorityType.value,
      legs: itineraryLegs.value.map((leg) => normalizeLegForQuote(leg)),
      repositioningRequired: pendingMultiDestinationLegs ? true : undefined,
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
    aircraftOptions.value = await searchClientFlights(quotePayload, {
      timeoutMs: CLIENT_QUOTES_TIMEOUT_MS,
    })
    persistQuotePreview()
    logRenderedQuoteBreakdown(aircraftOptions.value, quotePayload)
    if (!aircraftOptions.value.length) {
      serverSearchError.value =
        'No fue posible generar una cotizacion real para este itinerario con la informacion actual.'
    }
  } catch (error) {
    const message =
      error?.message || 'No fue posible consultar el cotizador en este momento. Intenta de nuevo.'
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
    const selectedAircraftModel =
      aircraft.aircraft || aircraft.model || aircraft.registration || aircraft.cabin || ''
    const normalizedPassengers =
      Number(activeItinerarySummary.value.passengers || searchForm.passengers || 0) || 1
    const pricing = aircraftPricingForType(aircraft, selectedPriorityType.value)
    const selectedCardPrice = Number((pricing.finalPrice + RESULTS_SURCHARGE_USD).toFixed(2))
    const basePricingContext = buildCommercialSnapshot(
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
    const pricingContext = {
      ...basePricingContext,
      selected_card_price: selectedCardPrice,
      total: selectedCardPrice,
      final_price: selectedCardPrice,
    }
    const reservationPayload = {
      trip_type: tripTypeKey.value,
      trip_label: tripType.value,
      passengers: normalizedPassengers,
      pets: activeItinerarySummary.value.pets,
      special_baggage: activeItinerarySummary.value.specialBaggage,
      preference: selectedAircraftModel || aircraft.cabin,
      aircraft_model: selectedAircraftModel,
      assigned_aircraft_model: selectedAircraftModel,
      aircraft_name: selectedAircraftModel,
      flight_package: selectedPriorityMeta.value?.name || '',
      service_tier: selectedPriorityMeta.value?.name || '',
      match_id: aircraft.match_id || aircraft.matched_option_id || aircraft.id || null,
      matched_option_id: aircraft.matched_option_id || aircraft.match_id || aircraft.id || null,
      aircraft_id: aircraft.aircraft_id || aircraft.id || null,
      provider_id: aircraft.provider_id || aircraft.provider?.id || null,
      priority_type: pricing.priorityType,
      priority_multiplier: pricing.priorityMultiplier,
      base_price: Number(pricing.basePrice.toFixed(2)),
      operational_fee: Number(pricing.operationalFees.toFixed(2)),
      priority_price: Number(pricing.priorityPrice.toFixed(2)),
      final_price: Number(selectedCardPrice.toFixed(2)),
      selected_card_price: Number(selectedCardPrice.toFixed(2)),
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
      subtotal: Number(
        (pricingContext.subtotal_before_multipliers || pricing.basePrice || 0).toFixed(2),
      ),
      total: Number(selectedCardPrice.toFixed(2)),
      estimated_total: Number(selectedCardPrice.toFixed(2)),
      aircraft_snapshot: {
        ...aircraft,
        aircraft: selectedAircraftModel,
        model: selectedAircraftModel,
        category: aircraft.category || aircraft.cabin || '',
        capacity: aircraft.capacity || '',
        base_price: Number(pricing.basePrice.toFixed(2)),
        operational_fee: Number(pricing.operationalFees.toFixed(2)),
        priority_price: Number(pricing.priorityPrice.toFixed(2)),
        subtotal_before_multipliers: Number(
          (pricingContext.subtotal_before_multipliers || pricing.basePrice || 0).toFixed(2),
        ),
        subtotal: Number(
          (pricingContext.subtotal_before_multipliers || pricing.basePrice || 0).toFixed(2),
        ),
        selected_card_price: Number(selectedCardPrice.toFixed(2)),
        total: Number(selectedCardPrice.toFixed(2)),
        final_price: Number(selectedCardPrice.toFixed(2)),
        estimated_total: Number(selectedCardPrice.toFixed(2)),
      },
      source_database: aircraft.source_database || null,
      source_table: aircraft.source_table || null,
      legs: activeItinerarySummary.value.legs.map((leg) => ({ ...leg })),
    }
    const reservation = await createClientFlightRequest(reservationPayload, { timeoutMs: 60000 })
    if (typeof console !== 'undefined') {
      const storedFlightRequest =
        reservation?.flight_request ||
        reservation?.data?.flight_request ||
        reservation?.data ||
        reservation
      console.log('[reserva-guardada] Costo del vuelo persistido en backend', {
        endpoint: '/client/flight-requests',
        tablas: ['flight_requests.final_price', 'request_matches.estimated_price'],
        flight_request_id:
          storedFlightRequest?.id ||
          reservation?.flight_request?.id ||
          reservation?.data?.id ||
          reservation?.id,
        selected_card_price: Number(selectedCardPrice.toFixed(2)),
        flight_request_final_price:
          storedFlightRequest?.final_price ||
          storedFlightRequest?.pricing_context?.final_price ||
          null,
        match_quote_total:
          storedFlightRequest?.matched_options?.[0]?.estimated_price ||
          storedFlightRequest?.matches?.[0]?.estimated_price ||
          null,
        response: reservation,
      })
    }
    const createdFlightRequestId =
      reservation?.flight_request?.id ||
      reservation?.data?.flight_request?.id ||
      reservation?.data?.id ||
      reservation?.id ||
      selectedTripId.value ||
      ''

    const createdReservation =
      reservation?.flight_request && typeof reservation.flight_request === 'object'
        ? reservation.flight_request
        : reservation?.data?.flight_request && typeof reservation.data.flight_request === 'object'
          ? reservation.data.flight_request
          : null

    if (createdReservation) {
      const normalizedCreatedReservation = normalizeTrip(createdReservation, {
        entityType: 'flight_request',
      })
      const createdReservationId = String(
        normalizedCreatedReservation.id ||
          normalizedCreatedReservation.flight_request_id ||
          createdFlightRequestId ||
          '',
      ).trim()

      reservations.value = [
        {
          ...normalizedCreatedReservation,
          summary_only: false,
        },
        ...reservations.value.filter(
          (item) => String(item.id || item.flight_request_id || '').trim() !== createdReservationId,
        ),
      ]
    }

    const matchedReservation = reservations.value.find(
      (item) =>
        String(item.flight_request_id || '') === String(createdFlightRequestId) ||
        String(item.id || '') === String(createdFlightRequestId),
    )
    const targetReservationId =
      matchedReservation?.id || reservations.value[0]?.id || createdFlightRequestId || ''
    ui.pushToast({
      tone: 'success',
      title: 'Tu vuelo esta siendo confirmado',
      message: 'Tu reserva ya entro al flujo comercial y operativo.',
    })
    go('reserva-confirmada', targetReservationId)
  } catch (error) {
    const message = error?.message || 'Intenta de nuevo o contacta a tu asesor privado.'
    console.log('[error-reserva-cliente]', {
      source: 'requestReservation',
      message,
      error,
      access: auth.access,
      user: auth.user,
    })
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
  auth.logout()
  ui.pushToast({
    tone: 'success',
    title: 'Sesion cerrada',
    message: 'Cerraste tu acceso de cliente correctamente.',
  })
  router.push({ name: 'home' })
}

function shouldAutoRefreshTrips() {
  return false
}

async function refreshReservations({ silent = false } = {}) {
  if (reservationsRequestPromise) return reservationsRequestPromise
  if (!silent) {
    loadingServerData.value = true
  }

  refreshingReservations.value = true

  reservationsRequestPromise = (async () => {
    try {
      const trips = await getClientTrips({
        timeoutMs: CLIENT_TRIPS_TIMEOUT_MS,
        query: { per_page: 10 },
      })
      reservations.value = trips
      return trips
    } finally {
      refreshingReservations.value = false
      reservationsRequestPromise = null
      if (!silent) {
        loadingServerData.value = false
      }
    }
  })()

  return reservationsRequestPromise
}

function upsertReservationDetail(reservation) {
  if (!reservation || typeof reservation !== 'object') return

  const resolvedId = String(reservation.id || reservation.flight_request_id || '').trim()

  if (!resolvedId) return

  const nextReservations = [...reservations.value]
  const index = nextReservations.findIndex(
    (item) =>
      String(item.id || '').trim() === resolvedId ||
      String(item.flight_request_id || '').trim() === resolvedId,
  )

  if (index >= 0) {
    nextReservations[index] = {
      ...nextReservations[index],
      ...reservation,
      summary_only: false,
    }
  } else {
    nextReservations.unshift({
      ...reservation,
      summary_only: false,
    })
  }

  reservations.value = nextReservations
}

async function hydrateSelectedReservationDetail() {
  const reservation = selectedReservation.value
  const reservationId = String(reservation?.id || reservation?.flight_request_id || '').trim()

  if (!reservation?.summary_only || !reservationId || reservationDetailRequestIds.has(reservationId)) {
    return
  }

  reservationDetailRequestIds.add(reservationId)

  try {
    const detail = await getClientTrip(reservationId, {
      timeoutMs: CLIENT_TRIPS_TIMEOUT_MS,
    })
    upsertReservationDetail(detail)
  } catch {
    // La vista puede seguir mostrando el resumen actual y reintentar despues.
  } finally {
    reservationDetailRequestIds.delete(reservationId)
  }
}

function clearReservationsPolling() {
  // El refresh ahora es manual desde la vista de viajes.
}

function clearWorkflowSyncRefreshTimer() {
  if (!workflowSyncRefreshTimer) return
  window.clearTimeout(workflowSyncRefreshTimer)
  workflowSyncRefreshTimer = null
}

function clearSignedContractSyncTimer() {
  if (!signedContractSyncTimer) return
  window.clearTimeout(signedContractSyncTimer)
  signedContractSyncTimer = null
}

function scheduleWorkflowSyncRefresh(payload = {}) {
  applyExternalWorkflowSync(payload)
  clearWorkflowSyncRefreshTimer()
  workflowSyncRefreshTimer = window.setTimeout(() => {
    workflowSyncRefreshTimer = null
    void refreshReservations({ silent: true })
  }, 900)
}

function startReservationsPolling() {
  return
}

async function handleManualReservationsRefresh() {
  await refreshReservations({ silent: true })
}

async function loadServerData() {
  loadingServerData.value = true
  serverSearchError.value = ''

  try {
    const [destinationsResult, plansResult] = await Promise.allSettled([
      getClientDestinations(),
      getClientFlightPackages(),
    ])

    const destinations = destinationsResult.status === 'fulfilled' ? destinationsResult.value : []
    const plans = plansResult.status === 'fulfilled' ? plansResult.value : []

    featuredDestinations.value = destinations
    flightPackages.value = plans
    ensureDefaultPriority(plans)
    await refreshReservations({ silent: true })
  } finally {
    loadingServerData.value = false
  }
}

onMounted(async () => {
  redirectLegacyInProgressSection()
  restoreQuotePreview()
  if (!auth.user?.id) {
    await auth.refreshSession()
  }
  await loadServerData()
  void hydrateSelectedReservationDetail()

  removeWorkflowSyncSubscription = subscribeWorkflowSync((payload = {}) => {
    if (payload.scope !== 'reservation-workflow') return
    scheduleWorkflowSyncRefresh(payload)
  })
})

watch(
  () => [
    props.section,
    route.query.contract_signed,
    route.query.contract_id,
    route.query.reservation_id,
    reservationContextId.value,
    signedContractReservationSignature.value,
  ],
  () => {
    void applySignedContractReturnState()
  },
  { immediate: true },
)

watch(
  () => selectedReservation.value?.id || selectedReservation.value?.flight_request_id || '',
  () => {
    void hydrateSelectedReservationDetail()
  },
  { immediate: true },
)

watch([submittedItinerary, aircraftOptions], () => {
  persistQuotePreview()
})

watch(
  () => props.section,
  () => {
    redirectLegacyInProgressSection()
  },
)

onBeforeUnmount(() => {
  clearReservationsPolling()
  clearWorkflowSyncRefreshTimer()
  clearSignedContractSyncTimer()
  destroyStripePaymentElement()

  if (removeWorkflowSyncSubscription) {
    removeWorkflowSyncSubscription()
    removeWorkflowSyncSubscription = null
  }
})

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
  [isResultsSection, hasSearchContext],
  ([resultsSection, hasContext]) => {
    if (resultsSection && !hasContext) {
      router.replace({ name: 'cliente', params: { section: 'reservar' } })
    }
  },
  { immediate: true },
)

watch(
  () => props.section,
  () => {
    startReservationsPolling()
    if (shouldAutoRefreshTrips()) {
      void refreshReservations({ silent: true })
    }
    alignReservationWorkflowRoute()
  },
)

watch(
  () => [
    props.section,
    routeId.value,
    reservations.value.length,
    loadingServerData.value,
    refreshingReservations.value,
  ],
  () => {
    alignReservationWorkflowRoute()
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

      <section v-if="activeSection === 'reservar' && !isResultsSection" class="screen">
        <FlightSearchHero
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
          v-if="featuredDestinations.length"
          :destinations="featuredDestinations"
          :trip-type="tripType"
          @select="selectDestination"
        />
      </section>

      <section v-else-if="activeSection === 'reservar' && isResultsSection" class="screen">
          <div class="screen-head results-head results-head-premium">
            <span class="eyebrow">Luxury concierge selection</span>
            <h2>{{ itineraryHeadline(activeItinerarySummary) }}</h2>
            <p>{{ itineraryDateLine(activeItinerarySummary) }}</p>
            <strong class="results-headline-hook"
              >Tu asesor privado ha seleccionado las mejores opciones para esta ruta.</strong
            >
            <span class="results-subhook"
              >Opciones verificadas segun velocidad, costo y nivel de experiencia.</span
            >
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
              <p class="aircraft-time-line">
                {{ aircraftSpeedLine(featuredAircraft, activeItinerarySummary) }}
              </p>
              <p v-if="aircraftBillingNote(featuredAircraft)" class="aircraft-billing-note">
                {{ aircraftBillingNote(featuredAircraft) }}
              </p>
              <p class="hero-price-label">Tarifa estimada total</p>
              <strong class="hero-price">{{ aircraftPriceCopy(featuredAircraft) }}</strong>
              <p class="hero-service-copy">Incluye operacion, logistica y servicio ejecutivo.</p>
              <div class="hero-includes">
                <span v-for="item in aircraftIncludes(featuredAircraft)" :key="item">{{
                  item
                }}</span>
              </div>
            </div>
            <div class="hero-actions">
              <button
                type="button"
                :disabled="Boolean(reservingAircraftId)"
                @click="requestReservation(featuredAircraft)"
              >
                {{ isReservingAircraft(featuredAircraft) ? 'Reservando...' : 'Reservar' }}
              </button>
            </div>
          </article>

          <div v-if="secondaryAircraftOptions.length" class="aircraft-list aircraft-list-compact">
            <article
              v-for="aircraft in secondaryAircraftOptions"
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
                    <p class="aircraft-time-line">
                      {{ aircraftSpeedLine(aircraft, activeItinerarySummary) }}
                    </p>
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
                <button
                  type="button"
                  :disabled="Boolean(reservingAircraftId)"
                  @click="requestReservation(aircraft)"
                >
                  {{ isReservingAircraft(aircraft) ? 'Reservando...' : 'Reservar' }}
                </button>
              </div>
            </article>
          </div>
      </section>

      <section v-else-if="activeSection === 'viajes'" class="screen">
        <article
          v-if="props.section === 'contrato' && canRenderReservationWorkflow"
          class="document-panel"
        >
          <ClientContractPreview
            :reservation="selectedReservation"
            :reservation-id="reservationContextId"
            :customer-name="customerDisplayName"
            :submitting="signingContract"
            @confirm="handleContractConfirm"
          />
        </article>

        <article
          v-else-if="props.section === 'contrato' && !canRenderReservationWorkflow"
          class="document-panel confirmation-panel"
        >
          <span class="eyebrow">Contrato</span>
          <h2>
            {{ hasReservationsLoaded ? 'No encontramos una reserva activa' : 'Cargando contrato' }}
          </h2>
          <p v-if="hasReservationsLoaded">
            Necesitamos una reserva valida para abrir el contrato. En cuanto tengas una reserva
            activa, aparecera aqui automaticamente.
          </p>
          <p v-else>Estamos sincronizando tus reservas para preparar el contrato correcto.</p>
          <div class="confirmation-actions">
            <button type="button" @click="go('viajes')">Ver mis vuelos</button>
            <button class="secondary-button" type="button" @click="go('reservar')">
              Reservar vuelo
            </button>
          </div>
        </article>

        <article
          v-else-if="props.section === 'pago' && canRenderReservationWorkflow"
          class="payment-checkout"
        >
          <div class="payment-checkout__main">
            <button
              class="payment-back"
              type="button"
              @click="go('contrato', reservationContextId)"
            >
              <span aria-hidden="true">←</span>
              <span>Volver al contrato</span>
            </button>

            <div class="payment-checkout__hero">
              <span class="eyebrow">Pago {{ reservationContextId }}</span>
              <h2>{{ paymentHeroTitle }}</h2>
              <p>{{ paymentHeroCopy }}</p>
              <div class="payment-trust-strip">
               
              </div>
            </div>

            <section class="payment-section">
              <h3>Informacion de contacto</h3>
              <label class="payment-field payment-field--stacked">
                <span>Correo electronico</span>
                <input
                  v-model="paymentForm.contactEmail"
                  type="email"
                  placeholder="cliente@empresa.com"
                />
              </label>
            </section>

            <section class="payment-section">
              <h3>Metodo de pago</h3>
              <div class="payment-mode-panel">
                <div v-if="selectedPaymentMethod === 'card'" class="payment-mode-panel__copy">
                  <strong>Metodo de pago</strong>
                  <div class="payment-card-frame">
                    <label class="payment-card-field payment-card-field--full payment-card-field--dark">
                      <span>Numero de tarjeta</span>
                      <div class="payment-card-field__brands" aria-hidden="true">
                        <span class="brand-chip brand-chip--detected">
                          <img
                            v-if="paymentCardVisualLogo"
                            :src="paymentCardVisualLogo"
                            :alt="paymentCardVisualLabel"
                            class="brand-chip__logo"
                          />
                          {{ paymentCardVisualLabel }}
                        </span>
                      </div>
                      <div
                        v-if="paymentElementLoading"
                        class="payment-element-shell payment-element-shell--loading payment-element-shell--full payment-element-shell--dark"
                      >
                        Cargando formulario seguro de tarjeta...
                      </div>
                      <div
                        v-show="!paymentElementLoading"
                        ref="paymentCardNumberHost"
                        class="payment-element-shell payment-element-shell--full payment-element-shell--dark"
                      ></div>
                    </label>

                    <div class="payment-card-field-grid payment-card-field-grid--dark">
                      <label class="payment-card-field payment-card-field--dark">
                        <span>Fecha de caducidad</span>
                        <div
                          v-if="paymentElementLoading"
                          class="payment-element-shell payment-element-shell--loading payment-element-shell--dark"
                        >
                          Cargando...
                        </div>
                        <div
                          v-show="!paymentElementLoading"
                          ref="paymentCardExpiryHost"
                          class="payment-element-shell payment-element-shell--dark"
                        ></div>
                      </label>

                      <label class="payment-card-field payment-card-field--dark payment-card-field--with-icon">
                        <span>Codigo de seguridad</span>
                        <span class="payment-card-field__security" aria-hidden="true">
                          <svg viewBox="0 0 24 24">
                            <rect
                              x="3"
                              y="5"
                              width="18"
                              height="14"
                              rx="2.5"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="1.8"
                            />
                            <path
                              d="M3 10h18"
                              fill="none"
                              stroke="currentColor"
                              stroke-linecap="round"
                              stroke-width="1.8"
                            />
                            <path
                              d="M13 15h6"
                              fill="none"
                              stroke="currentColor"
                              stroke-linecap="round"
                              stroke-width="1.8"
                            />
                            <text
                              x="13.5"
                              y="20"
                              fill="currentColor"
                              font-size="6"
                              font-weight="700"
                            >
                              123
                            </text>
                          </svg>
                        </span>
                        <div
                          v-if="paymentElementLoading"
                          class="payment-element-shell payment-element-shell--loading payment-element-shell--dark"
                        >
                          Cargando...
                        </div>
                        <div
                          v-show="!paymentElementLoading"
                          ref="paymentCardCvcHost"
                          class="payment-element-shell payment-element-shell--dark"
                        ></div>
                      </label>
                    </div>
                  </div>
                </div>

                <div v-else class="payment-mode-panel__copy">
                  <strong>Transferencia / wire manual</strong>
                  <p>
                    Generamos referencia bancaria y el pago queda pendiente hasta validar
                    comprobante. Puedes operar este flujo sin Stripe card checkout.
                  </p>
                </div>
              </div>

              <div
                v-if="selectedPaymentMethod === 'wire' && wireInstructions"
                class="payment-wire-card"
              >
                <p>
                  <span>Banco</span
                  ><strong>{{ wireInstructions.bank_name || 'Por configurar' }}</strong>
                </p>
                <p>
                  <span>Beneficiario</span
                  ><strong>{{ wireInstructions.beneficiary || 'Red Aviation' }}</strong>
                </p>
                <p>
                  <span>Cuenta / IBAN</span
                  ><strong>{{
                    wireInstructions.account_number || wireInstructions.iban || 'Por configurar'
                  }}</strong>
                </p>
                <p>
                  <span>CLABE / SWIFT</span
                  ><strong>{{
                    wireInstructions.clabe || wireInstructions.swift || 'Por configurar'
                  }}</strong>
                </p>
                <p>
                  <span>Referencia</span
                  ><strong>{{
                    wireInstructions.reference || paymentLastReference || 'Pendiente'
                  }}</strong>
                </p>
                <p>
                  <span>Monto</span
                  ><strong>{{ wireInstructions.amount || paymentSummaryAmountLabel }}</strong>
                </p>
              </div>

              <p v-if="paymentInlineError" class="payment-inline-error">{{ paymentInlineError }}</p>
            </section>
          </div>

          <aside class="payment-summary-card">
            <span class="payment-summary-card__eyebrow">Resumen de reserva</span>
            <h3>{{ customerDisplayName }}</h3>
            <p class="payment-summary-card__route">{{ paymentRouteHeadline }}</p>
            <div class="payment-summary-flight">
              <div class="payment-summary-flight__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path
                    d="M21 16l-8-4V5.5a1.5 1.5 0 0 0-3 0V12l-8 4 1 2 7-2.5V20l-2 1.5V23l4-1 4 1v-1.5L14 20v-4.5L21 18z"
                    fill="currentColor"
                  />
                </svg>
              </div>
              <div>
                <span>Vuelo privado protegido</span>
                <strong>{{ paymentDateLabel }}</strong>
              </div>
            </div>

            <div class="payment-feature-list">
              <article v-for="feature in paymentFeatureList" :key="feature">
                <span class="payment-feature-list__icon" aria-hidden="true">
                  <svg v-if="feature.icon === 'shield'" viewBox="0 0 24 24">
                    <path
                      d="M12 3l7 3v5c0 5.05-3.41 9.74-7 11-3.59-1.26-7-5.95-7-11V6l7-3z"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.8"
                    />
                  </svg>
                  <svg v-else-if="feature.icon === 'concierge'" viewBox="0 0 24 24">
                    <path
                      d="M6 17a6 6 0 0 1 12 0"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-width="1.8"
                    />
                    <path
                      d="M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 17h16"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.8"
                    />
                  </svg>
                  <svg v-else-if="feature.icon === 'team'" viewBox="0 0 24 24">
                    <path
                      d="M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.8"
                    />
                    <circle
                      cx="10"
                      cy="8"
                      r="3"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                    />
                    <path
                      d="M20 19v-1a4 4 0 0 0-3-3.87M16 5.13A3 3 0 0 1 16 11"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.8"
                    />
                  </svg>
                  <svg v-else viewBox="0 0 24 24">
                    <path
                      d="M5 19h14M7 16l3-3 2 2 5-5"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.8"
                    />
                    <circle
                      cx="7"
                      cy="8"
                      r="2"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                    />
                  </svg>
                </span>
                <p>
                  <strong>{{ feature.title }}</strong>
                  <span>{{ feature.copy }}</span>
                </p>
              </article>
            </div>

            <div class="payment-summary-meta">
              <p>
                <span>Fecha estimada</span>
                <strong>{{ paymentDateLabel }}</strong>
              </p>
              <p>
                <span>Metodo seleccionado</span>
                <strong>{{ paymentMethodSummaryLabel }}</strong>
              </p>
            </div>

            <div class="payment-totals">
              <p>
                <span>Subtotal</span>
                <strong>{{ paymentSummaryAmountLabel }}</strong>
              </p>
              <p>
                <span>Impuestos estimados</span>
                <strong>{{ formatCurrency(0) }}</strong>
              </p>
              <p class="payment-totals__total">
                <span>Importe a pagar hoy</span>
                <strong>{{ paymentSummaryAmountLabel }}</strong>
              </p>
            </div>

            <button
              class="payment-submit"
              type="button"
              :disabled="paymentSubmitting"
              @click="handlePaymentSubmit"
            >
              {{
                paymentSubmitting
                  ? 'Procesando...'
                  : selectedPaymentMethod === 'wire'
                    ? 'Generar instrucciones bancarias'
                    : 'Pagar ahora'
              }}
            </button>

            
          </aside>
        </article>

        <article
          v-else-if="props.section === 'pago' && !canRenderReservationWorkflow"
          class="document-panel confirmation-panel"
        >
          <span class="eyebrow">Pago</span>
          <h2>
            {{
              hasReservationsLoaded
                ? selectedReservation?.is_reservation
                  ? 'Pago disponible despues de la firma'
                  : 'No encontramos una reserva para pagar'
                : 'Preparando checkout'
            }}
          </h2>
          <p v-if="hasReservationsLoaded">
            {{
              selectedReservation?.is_reservation
                ? selectedReservationFrontendState.status_message ||
                  'El pago se habilitara cuando el contrato tenga ready_for_payment en true.'
                : 'Primero necesitamos identificar una reserva activa para abrir el checkout.'
            }}
          </p>
          <p v-else>Estamos cargando la informacion de tu reserva antes de abrir el pago.</p>
          <div class="confirmation-actions">
            <button
              v-if="selectedReservation?.is_reservation"
              type="button"
              @click="go('contrato', reservationContextId)"
            >
              Volver al contrato
            </button>
            <button v-else type="button" @click="go('viajes')">Ver mis vuelos</button>
            <button class="secondary-button" type="button" @click="go('reservar')">
              Reservar vuelo
            </button>
          </div>
        </article>

        <article
          v-else-if="props.section === 'reserva-confirmada' && canRenderReservationWorkflow"
          class="document-panel confirmation-panel"
        >
          <span class="eyebrow">Reserva registrada</span>
          <h2>Tu vuelo esta en proceso</h2>
          <p>
            Ya puedes dar seguimiento desde Mis vuelos. En este momento la solicitud sigue su flujo
            operativo mientras recibimos la respuesta del proveedor asignado.
          </p>
          <div class="signature-box confirmation-box">
            <strong>Estado actual</strong>
            <span>Respuesta del proveedor.</span>
          </div>
          <div class="confirmation-actions">
            <button type="button" @click="go('viajes', reservationContextId)">
              Ver mis vuelos
            </button>
            <button class="secondary-button" type="button" @click="go('soporte')">
              Asesor privado 24/7
            </button>
          </div>
        </article>

        <article
          v-else-if="props.section === 'reserva-confirmada' && !canRenderReservationWorkflow"
          class="document-panel confirmation-panel"
        >
          <span class="eyebrow">Reserva registrada</span>
          <h2>
            {{
              hasReservationsLoaded ? 'No encontramos esa reserva' : 'Cargando estado de reserva'
            }}
          </h2>
          <p v-if="hasReservationsLoaded">
            La reserva que intentas abrir ya no esta disponible o todavia no se sincroniza.
          </p>
          <p v-else>Estamos consultando el estado mas reciente de tu reserva.</p>
          <div class="confirmation-actions">
            <button type="button" @click="go('viajes')">Ver mis vuelos</button>
            <button class="secondary-button" type="button" @click="go('reservar')">
              Reservar vuelo
            </button>
          </div>
        </article>

        <ActiveTrips
          v-else
          :reservations="reservations"
          :selected-id="selectedTripId"
          :initial-tab="tripsInitialTab"
          :refreshing="refreshingReservations"
          :timeline="timeline"
          @refresh="handleManualReservationsRefresh"
          @open-concierge="goToConcierge($event)"
          @open-contract="handleOpenContract"
          @open-detail="go('viajes', $event)"
          @open-payment="goToPayment($event)"
        />
      </section>

      <section v-else class="screen">
        <div v-if="activeSection === 'perfil'" class="screen-head">
          <span class="eyebrow">Perfil</span>
          <h2>Tu cuenta vuela mejor cuando ya te conoce</h2>
          <p>
            Guarda datos, viajeros frecuentes y preferencias para reservar en segundos la siguiente
            vez.
          </p>
        </div>

        <template v-if="activeSection === 'perfil'">
          <div class="profile-cards">
            <article class="profile-highlight-card">
              <span class="eyebrow">Viajeros frecuentes</span>
              <h3>CEO, familia o equipo ejecutivo</h3>
              <p>
                Deja perfiles guardados para acelerar futuras reservas y reducir friccion operativa.
              </p>
            </article>
            <article class="profile-highlight-card">
              <span class="eyebrow">Facturacion</span>
              <h3>Pagos y datos listos</h3>
              <p>
                Metodo de pago, razon social y datos de contacto siempre a mano dentro del mismo
                flujo.
              </p>
            </article>
          </div>

          <form class="profile-form">
            <label>Nombre<input :value="auth.user?.name || 'Miembro Red Aviation'" /></label>
            <label>Telefono<input placeholder="+52 55 0000 0000" /></label>
            <label
              >Empresa<input :value="auth.user?.company_name || ''" placeholder="Empresa"
            /></label>
            <label>Correo<input :value="auth.user?.email || 'miembro@redaviation.test'" /></label>
            <label>Pasaporte / ID<input placeholder="Documento principal" /></label>
            <label>Metodo de pago<input placeholder="Tarjeta corporativa o transferencia" /></label>
            <label>Facturacion<input placeholder="RFC / razon social" /></label>
            <label>Seguridad<input placeholder="NDA, privacidad, requerimientos" /></label>
            <label class="wide"
              >Preferencias<textarea
                placeholder="Catering, mascotas, FBO, privacidad, asistencia especial"
              ></textarea>
            </label>
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
            <p>
              Usa el flujo de reserva para crear nuevas solicitudes y revisar tus vuelos vigentes.
            </p>
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
      <div
        v-if="technicalSheetOpen && technicalAircraft"
        class="technical-sheet-backdrop"
        @click.self="closeTechnicalSheet"
      >
        <section class="technical-sheet">
          <div class="technical-sheet__hero">
            <div
              class="technical-sheet__media"
              :style="aircraftVisualStyle(technicalAircraft.image_url)"
            >
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
            <button class="technical-sheet__close" type="button" @click="closeTechnicalSheet">
              Cerrar
            </button>
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
  background: linear-gradient(180deg, #fbfaf6 0%, #f3f1eb 100%), #f7f5ef;
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
  background: linear-gradient(
    125deg,
    rgba(255, 255, 255, 0.28),
    transparent 28%,
    transparent 72%,
    rgba(255, 255, 255, 0.16)
  );
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
    url('https://images.unsplash.com/photo-1540962351504-03099e0a754b?auto=format&fit=crop&w=1200&q=80')
      center/cover;
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

.payment-checkout {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(320px, 420px);
  gap: 1.5rem;
  align-items: start;
}

.payment-checkout__main {
  display: grid;
  gap: 1.35rem;
}

.payment-back {
  width: fit-content;
  min-height: auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: #111111;
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
}

.payment-back span {
  color: inherit;
  font-weight: 700;
}

.payment-back:hover {
  transform: translateX(-2px);
}

.payment-checkout__hero {
  display: grid;
  gap: 0.4rem;
}

.payment-checkout__hero p {
  margin: 0;
  max-width: 760px;
}

.payment-trust-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  padding-top: 0.2rem;
}

.payment-trust-strip span {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 2.2rem;
  padding: 0.45rem 0.8rem;
  border: 1px solid rgba(17, 17, 17, 0.08);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.8);
  color: #3d372e;
  font-size: 0.86rem;
  font-weight: 700;
}

.payment-trust-strip svg,
.payment-field__input-shell svg {
  width: 1rem;
  height: 1rem;
  color: #8b6a24;
  flex: 0 0 auto;
}

.payment-section {
  display: grid;
  gap: 0.8rem;
}

.payment-section h3,
.payment-summary-card h3 {
  color: #111111;
  font-size: clamp(1.2rem, 2vw, 1.7rem);
}

.payment-method-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
}

.payment-method-card,
.payment-quantity-card,
.payment-summary-card,
.payment-field--card,
.payment-field--stacked {
  border-radius: 24px;
}

.payment-method-card {
  display: grid;
  gap: 0.42rem;
  min-height: 128px;
  padding: 1.15rem;
  border: 1px solid rgba(17, 17, 17, 0.1);
  background: linear-gradient(180deg, #ffffff, #f8f5ee);
  text-align: left;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.payment-method-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.8rem;
  height: 2.8rem;
  border-radius: 16px;
  background: rgba(139, 106, 36, 0.08);
  color: #8b6a24;
}

.payment-method-card__icon svg,
.payment-feature-list__icon svg,
.payment-summary-flight__icon svg {
  width: 1.25rem;
  height: 1.25rem;
}

.payment-method-card strong,
.payment-quantity-card strong,
.payment-summary-card strong,
.payment-summary-card__route,
.payment-totals__total span,
.payment-totals__total strong {
  color: #111111;
}

.payment-method-card span,
.payment-quantity-card span,
.payment-quantity-card small,
.payment-field span,
.payment-field small,
.payment-summary-card__eyebrow,
.payment-summary-meta span,
.payment-totals span,
.payment-summary-card__legal {
  color: #655d52;
}

.payment-method-card--active {
  border-color: rgba(191, 151, 65, 0.52);
  box-shadow: 0 18px 44px rgba(17, 17, 17, 0.08);
  background: linear-gradient(180deg, #fffdf7, #ffffff);
}

.payment-method-card:hover {
  transform: translateY(-2px);
}

.payment-quantity-card {
  display: grid;
  gap: 0.6rem;
  padding: 1.15rem;
  border: 1px solid rgba(17, 17, 17, 0.08);
  background: #ffffff;
}

.payment-quantity-card__row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: baseline;
  justify-content: space-between;
}

.payment-quantity-card__row strong {
  font-size: 2rem;
  line-height: 1;
}

.payment-quantity-card__row small {
  font-size: 0.92rem;
  font-weight: 600;
}

.payment-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
}

.payment-field {
  display: grid;
  gap: 0.42rem;
}

.payment-field--full {
  grid-column: 1 / -1;
}

.payment-field--card,
.payment-field--stacked {
  padding: 1rem 1.1rem;
  border: 1px solid rgba(17, 17, 17, 0.08);
  background: #ffffff;
}

.payment-field__input-shell {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 3.2rem;
}

.payment-field__input-shell--compact {
  gap: 0.6rem;
}

.payment-mode-panel,
.payment-wire-card {
  padding: 1rem 1.1rem;
  border: 1px solid rgba(17, 17, 17, 0.08);
  border-radius: 24px;
  background: #ffffff;
}

.payment-mode-panel__copy {
  display: grid;
  gap: 1rem;
}

.payment-card-frame {
  display: grid;
  gap: 1rem;
}

.payment-card-field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem;
}

.payment-card-field {
  display: grid;
  gap: 0.55rem;
}

.payment-card-field--dark {
  position: relative;
  padding: 1.55rem 1.6rem 1.35rem;
  border-radius: 32px;
  background: #ffffff;
  border: 1px solid rgba(17, 17, 17, 0.08);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.payment-card-field--full {
  grid-column: 1 / -1;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  column-gap: 1.25rem;
  row-gap: 0.95rem;
}

.payment-card-field span {
  font-size: 0.95rem;
  color: #655d52;
}

.payment-card-field--dark > span {
  font-size: 1.05rem;
  color: #171717;
}

.payment-card-field__brands {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  justify-self: end;
}

.payment-card-field__security {
  position: absolute;
  right: 1.5rem;
  bottom: 1.25rem;
  color: rgba(23, 23, 23, 0.6);
}

.payment-card-field__security svg {
  width: 2.7rem;
  height: 2.7rem;
}

.payment-card-field__shell {
  position: relative;
}

.payment-card-field__hint {
  position: absolute;
  top: 50%;
  right: 1rem;
  transform: translateY(-50%);
  color: #9d9589;
  font-size: 0.95rem;
  font-weight: 700;
  pointer-events: none;
}

.payment-element-shell {
  min-height: 4.6rem;
  padding: 1.15rem 1.2rem;
  border: 1px solid rgba(17, 17, 17, 0.08);
  border-radius: 22px;
  background: #f8f6f2;
  display: block;
  width: 100%;
  cursor: text;
  overflow: hidden;
}

.payment-card-field--full .payment-element-shell {
  grid-column: 1 / -1;
}

.payment-element-shell--dark {
  min-height: 2rem;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.payment-element-shell--full {
  min-height: 5rem;
}

.payment-element-shell :deep(.StripeElement),
.payment-element-shell :deep(.__PrivateStripeElement) {
  width: 100%;
  display: block;
}

.payment-element-shell :deep(iframe) {
  width: 100% !important;
  min-height: 1.5rem;
}

.payment-element-shell--dark :deep(iframe) {
  min-height: 2rem;
}

.payment-element-shell--loading {
  display: grid;
  place-items: center;
  color: #655d52;
  font-weight: 600;
}

.payment-element-shell--dark.payment-element-shell--loading {
  min-height: 2rem;
  justify-content: start;
  color: #746b5f;
}

.payment-mode-panel__copy p,
.payment-wire-card p,
.payment-inline-error {
  margin: 0;
}

.payment-wire-card {
  display: grid;
  gap: 0.75rem;
}

.payment-wire-card p {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.75rem;
}

.payment-wire-card strong {
  text-align: right;
  color: #111111;
}

.payment-inline-error {
  color: #8e2d2d;
  font-weight: 700;
}

.payment-field input {
  width: 100%;
  min-height: 100%;
  padding: 0 0.1rem;
  border: 0;
  outline: none;
  background: transparent;
  color: #111111;
  font: inherit;
}

.payment-field input::placeholder {
  color: #9d9589;
}

.payment-card-brands {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

.payment-card-field-grid--dark {
  gap: 1rem;
}

.brand-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.6rem;
  height: 1.5rem;
  padding: 0 0.38rem;
  border-radius: 8px;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.brand-chip--detected {
  gap: 0.45rem;
  min-width: 7.2rem;
  min-height: 2.2rem;
  padding: 0 0.95rem;
  border-radius: 14px;
  border: 1px solid rgba(17, 17, 17, 0.08);
  color: #111111;
  background: linear-gradient(135deg, #f8f4eb 0%, #efe4c9 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.brand-chip__logo {
  width: auto;
  height: 1.15rem;
  display: block;
  flex: 0 0 auto;
}

.payment-summary-card {
  position: sticky;
  top: 6rem;
  display: grid;
  gap: 1rem;
  padding: 1.4rem;
  border: 1px solid rgba(17, 17, 17, 0.08);
  background:
    radial-gradient(circle at top right, rgba(191, 151, 65, 0.14), transparent 30%),
    linear-gradient(180deg, #fffdfa, #f6f0e5);
  box-shadow: 0 24px 64px rgba(17, 17, 17, 0.08);
}

.payment-summary-card__eyebrow {
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.payment-summary-card__route,
.payment-summary-card__legal {
  margin: 0;
}

.payment-summary-flight {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.85rem;
  padding: 1rem;
  border: 1px solid rgba(17, 17, 17, 0.08);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.58);
}

.payment-summary-flight__icon {
  display: grid;
  place-items: center;
  width: 2.8rem;
  height: 2.8rem;
  border-radius: 16px;
  background: #111111;
  color: #ffffff;
}

.payment-summary-flight span,
.payment-summary-flight strong {
  display: block;
}

.payment-summary-flight span {
  font-size: 0.82rem;
  color: #6a6153;
  font-weight: 700;
}

.payment-summary-flight strong {
  color: #111111;
  font-size: 1rem;
}

.payment-feature-list {
  display: grid;
  gap: 0.85rem;
  padding: 1rem 0;
  border-top: 1px solid rgba(17, 17, 17, 0.08);
  border-bottom: 1px solid rgba(17, 17, 17, 0.08);
}

.payment-feature-list article,
.payment-summary-meta p,
.payment-totals p {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.75rem;
  align-items: start;
  margin: 0;
}

.payment-feature-list p {
  display: grid;
  gap: 0.16rem;
  margin: 0;
}

.payment-feature-list p strong {
  font-size: 0.94rem;
}

.payment-feature-list p span {
  font-size: 0.9rem;
  line-height: 1.45;
}

.payment-feature-list__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.2rem;
  height: 2.2rem;
  margin-top: 0.1rem;
  border-radius: 14px;
  background: rgba(139, 106, 36, 0.08);
  color: #8b6a24;
}

.payment-summary-meta,
.payment-totals {
  display: grid;
  gap: 0.8rem;
}

.payment-summary-meta p,
.payment-totals p {
  grid-template-columns: minmax(0, 1fr) auto;
}

.payment-summary-meta strong,
.payment-totals strong {
  text-align: right;
}

.payment-totals__total {
  padding-top: 0.85rem;
  border-top: 1px solid rgba(17, 17, 17, 0.08);
}

.payment-submit {
  min-height: 3.6rem;
  border-radius: 999px;
  background: linear-gradient(135deg, #111111, #2b2925);
  box-shadow: 0 16px 32px rgba(17, 17, 17, 0.14);
}

.payment-submit:disabled {
  cursor: progress;
  opacity: 0.72;
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

  .payment-checkout {
    grid-template-columns: 1fr;
  }

  .payment-summary-card {
    position: static;
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
  .payment-checkout button,
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
  .payment-summary-card,
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
  .aircraft-card-compact,
  .payment-method-grid,
  .payment-form-grid,
  .payment-card-field-grid {
    grid-template-columns: 1fr;
    min-height: auto;
  }

  .payment-card-field--dark {
    padding: 1.2rem;
    border-radius: 24px;
  }

  .payment-card-field__brands {
    top: 1rem;
    right: 1rem;
    gap: 0.3rem;
  }

  .payment-card-field__security {
    right: 1rem;
    bottom: 1rem;
  }

  .payment-card-field-grid--dark {
    grid-template-columns: 1fr;
  }

  .payment-checkout {
    gap: 1rem;
  }

  .payment-checkout__main {
    gap: 1rem;
  }

  .payment-back {
    width: fit-content !important;
  }

  .payment-method-card,
  .payment-quantity-card,
  .payment-field--card,
  .payment-field--stacked,
  .payment-mode-panel,
  .payment-wire-card,
  .payment-summary-card {
    border-radius: 18px;
  }

  .payment-method-card,
  .payment-quantity-card,
  .payment-field--card,
  .payment-field--stacked,
  .payment-mode-panel,
  .payment-wire-card {
    padding: 0.9rem;
  }

  .payment-field input {
    min-height: 2.7rem;
  }

  .payment-summary-card {
    gap: 0.8rem;
  }

  .payment-feature-list article,
  .payment-summary-meta p,
  .payment-totals p {
    gap: 0.55rem;
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

@media print {
  @page {
    size: A4;
    margin: 0;
  }

  :global(body.contract-print-mode) {
    background: #ffffff !important;
  }

  :global(body.contract-print-mode *) {
    visibility: hidden !important;
  }

  :global(body.contract-print-mode .document-panel),
  :global(body.contract-print-mode .document-panel *) {
    visibility: visible !important;
  }

  :global(body.contract-print-mode .document-panel) {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #ffffff !important;
    box-shadow: none !important;
    border: 0 !important;
  }

  :global(body.contract-print-mode .contract-preview) {
    display: block !important;
    padding: 0 !important;
  }

  :global(body.contract-print-mode .contract-pdf) {
    width: 100% !important;
    max-width: 100% !important;
    font-size: 10.5px !important;
    line-height: 1.35 !important;
  }

  :global(body.contract-print-mode .contract-sheet) {
    width: 100% !important;
    max-width: 100% !important;
    min-height: auto !important;
    margin: 0 !important;
    box-shadow: none !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: #ffffff !important;
  }

  :global(body.contract-print-mode .contract-sheet__body) {
    padding: 10mm 12mm 12mm !important;
    border: 0 !important;
  }

  :global(body.contract-print-mode .contract-brandbar) {
    print-color-adjust: exact !important;
    -webkit-print-color-adjust: exact !important;
    min-height: 15rem !important;
    padding: 2.1rem 1.4rem !important;
    border-radius: 0 !important;
  }

  :global(body.contract-print-mode .contract-brandbar__banner) {
    display: block !important;
    width: 100% !important;
    height: auto !important;
  }

  :global(body.contract-print-mode .contract-block),
  :global(body.contract-print-mode .contract-summary),
  :global(body.contract-print-mode .contract-footer),
  :global(body.contract-print-mode .signature-card),
  :global(body.contract-print-mode .account-card),
  :global(body.contract-print-mode .annex-table),
  :global(body.contract-print-mode .signatures-grid),
  :global(body.contract-print-mode .accounts-grid) {
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  :global(body.contract-print-mode .signatures-grid),
  :global(body.contract-print-mode .accounts-grid) {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 6mm !important;
  }

  :global(body.contract-print-mode .signatures-grid) {
    grid-template-columns: minmax(0, 1fr) !important;
    justify-items: center !important;
  }

  :global(body.contract-print-mode .signature-card.signature-block) {
    width: min(100%, 160mm) !important;
    justify-items: center !important;
    text-align: center !important;
  }

  :global(body.contract-print-mode .signature-line) {
    min-height: 18mm !important;
  }

  :global(body.contract-print-mode .provider-signature-image),
  :global(body.contract-print-mode .signature-uploaded__image) {
    max-width: 56mm !important;
    max-height: 18mm !important;
    object-fit: contain !important;
  }

  :global(body.contract-print-mode .annex-table) {
    font-size: 10px !important;
    table-layout: fixed !important;
  }

  :global(body.contract-print-mode .annex-table th),
  :global(body.contract-print-mode .annex-table td) {
    padding: 6px 8px !important;
    word-break: normal !important;
    overflow-wrap: break-word !important;
  }

  :global(body.contract-print-mode .contract-table),
  :global(body.contract-print-mode .contract-table thead),
  :global(body.contract-print-mode .contract-table tbody),
  :global(body.contract-print-mode .contract-table tr),
  :global(body.contract-print-mode .contract-table th),
  :global(body.contract-print-mode .contract-table td) {
    display: revert !important;
  }

  :global(body.contract-print-mode .contract-watermark) {
    position: fixed !important;
    inset: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    opacity: 1 !important;
    pointer-events: none !important;
    z-index: 0 !important;
  }

  :global(body.contract-print-mode .contract-watermark img) {
    display: block !important;
    width: 72% !important;
    max-width: 34rem !important;
    opacity: 0.06 !important;
    filter: grayscale(1) !important;
  }

  :global(body.contract-print-mode .signature-panel),
  :global(body.contract-print-mode .signature-actions),
  :global(body.contract-print-mode .signature-input),
  :global(body.contract-print-mode .signature-panel__submit),
  :global(body.contract-print-mode .signature-note),
  :global(body.contract-print-mode .signature-uploaded__meta),
  :global(body.contract-print-mode .signature-ready-badge) {
    display: none !important;
  }
}
</style>
