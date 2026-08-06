import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useClientPortalPayments } from './useClientPortalPayments'
import { useClientPortalProfile } from './useClientPortalProfile'
import { useClientPortalTrips } from './useClientPortalTrips'
import { buildConciergeConfig } from '../concierge/conciergeConfig'
import {
  getOfficialBillableHours,
  getOfficialDisplayRouteHours,
  getOfficialFinalBillableHours,
  getOfficialOperationalFlightHours,
  formatOfficialDisplayTime,
  getOfficialPricing,
  getOfficialTotalAmount,
  hasOfficialQuotePricing,
} from '../officialQuotePricing'
import { featuredAirports } from '../../../utils/airports'
import {
  buildFlightPricingFormula,
  normalizeAttentionLevel,
  normalizePackageCode,
} from '../../../utils/flightPricing'
import { resolveWorkflowState } from '../../../utils/flightWorkflow'
import {
  buildFlightRequestPayload,
  cancelClientAccessPayment,
  createClientAircraftHold,
  createClientAccessCheckout,
  createClientCheckout,
  createClientFlightRequest,
  getClientAccessPaymentSuccess,
  getClientReservationCheckoutSuccess,
  getClientAccessStatus,
  getClientReservationPaymentAvailability,
  ensureClientReservation,
  getClientDestinations,
  getClientFlightPackages,
  getClientReservation,
  getClientTrip,
  markClientTripReadyForPayment,
  releaseClientAircraftHold,
  saveClientAssistedPayment,
  getClientTrips,
  normalizeTrip,
  searchClientFlights,
  uploadClientPaymentProof,
  validateClientAircraftHold,
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

export function usePortalClienteVista(props) {
  const CLIENT_QUOTES_CACHE_KEY = 'red_aviation_client_quotes_preview_v3_operational_time'
  const LEGACY_CLIENT_QUOTES_CACHE_KEY = 'red_aviation_client_quotes_preview_v2'
  const CLIENT_RESERVATION_CHECKOUT_CONTEXT_KEY =
    'red_aviation_client_reservation_checkout_context_v1'
  const CLIENT_AIRCRAFT_HOLD_CONTEXT_KEY = 'red_aviation_client_aircraft_hold_context_v1'

  const route = useRoute()
  const router = useRouter()
  const auth = useAuthStore()
  const ui = useUiStore()
  const COMMERCIAL_ACCESS_AMOUNT_LABEL = 'Monto por confirmar'

  const tripType = ref('Ida')
  const selectedPriorityType = ref('essential')
  const profileMenuOpen = ref(false)
  const RESULTS_SURCHARGE_USD = 0
  const searching = ref(false)
  const isCreatingAccessCheckout = ref(false)
  const lastExternalRedirectUrl = ref('')
  const loadingServerData = ref(false)
  const serverSearchError = ref('')
  const reservingAircraftId = ref('')
  const reservationLoadingState = reactive({
    active: false,
    eyebrow: 'SOLICITUDES',
    title: 'Cargando solicitudes',
    message: 'Estamos sincronizando oportunidades activas y el backlog operativo del proveedor.',
  })
  const featuredDestinations = ref([])
  const flightPackages = ref([])
  const aircraftOptions = ref([])
  const reservations = ref([])
  const hasBootstrappedReservations = ref(false)
  const refreshingReservations = ref(false)
  const signingContract = ref(false)
  const submittedItinerary = ref(null)
  const submittedQuotePayload = ref(null)
  const quoteResultsVisible = ref(false)
  const activeResultFilter = ref('best_value')
  const aircraftSidebarFilters = reactive({
    types: [],
    passengerMin: 0,
    priceMin: '',
    priceMax: '',
    speedMin: 0,
    services: [],
  })
  const technicalSheetOpen = ref(false)
  const technicalAircraft = ref(null)
  const aircraftHold = ref(null)
  const conflictedAircraftIds = ref([])
  const reservationDraftContexts = ref({})
  const quoteResultsNavigationPending = ref(false)
  const isConciergeOpen = ref(false)
  const isConciergeChatOpen = ref(false)
  const isConciergeScheduleOpen = ref(false)
  const conciergeChatDraft = ref('')
  const conciergeChatMessages = ref([])
  const selectedConciergeServiceId = ref('')
  const selectedConciergeServiceTitle = ref('')
  const conciergeScheduleForm = reactive({
    date: '',
    time: '',
    topic: 'flight',
  })
  const holdCountdownNow = ref(Date.now())
  let removeWorkflowSyncSubscription = null
  let workflowSyncRefreshTimer = null
  let reservationsRequestPromise = null
  let catalogRequestPromise = null
  let reservationPaymentAvailabilityRequestPromise = null
  const reservationDetailRequestIds = new Set()
  let signedContractSyncTimer = null
  let reservationConfirmedRedirectTimer = null
  const appliedSignedContractReturnKey = ref('')
  const appliedCommercialAccessCheckoutKey = ref('')
  const appliedReservationCheckoutKey = ref('')
  const activeContractReservationBootstrapKey = ref('')
  const lastContractReservationBootstrapKey = ref('')
  let commercialAccessStatusRequestPromise = null
  let aircraftHoldCountdownTimer = null
  let conciergeAutoReplyTimer = null
  const CLIENT_TRIPS_TIMEOUT_MS = Number(import.meta.env.VITE_CLIENT_TRIPS_TIMEOUT_MS || 45000)
  const CLIENT_QUOTES_TIMEOUT_MS = Number(import.meta.env.VITE_CLIENT_QUOTES_TIMEOUT_MS || 45000)
  const externalContractFlowEnabled =
    String(import.meta.env.VITE_CLIENT_CONTRACT_EXTERNAL_ENABLED || 'true')
      .trim()
      .toLowerCase() !== 'false'
  const dedicatedDocusignSendPath = String(
    import.meta.env.VITE_CLIENT_CONTRACT_SEND_PATH || import.meta.env.VITE_CONTRACT_SEND_PATH || '',
  ).trim()

  function updateReservationLoadingState(overrides = {}) {
    Object.assign(reservationLoadingState, overrides)
  }

  function startReservationLoadingState(overrides = {}) {
    updateReservationLoadingState({
      active: true,
      eyebrow: 'SOLICITUDES',
      title: 'Cargando solicitudes',
      message: 'Estamos sincronizando oportunidades activas y el backlog operativo del proveedor.',
      ...overrides,
    })
  }

  function stopReservationLoadingState() {
    updateReservationLoadingState({
      active: false,
      eyebrow: 'SOLICITUDES',
      title: 'Cargando solicitudes',
      message: 'Estamos sincronizando oportunidades activas y el backlog operativo del proveedor.',
    })
  }

  function isSearchTimeoutError(error) {
    const code = String(error?.code || '')
      .trim()
      .toLowerCase()
    const message = String(error?.message || '')
      .trim()
      .toLowerCase()

    return (
      code === 'timeout' ||
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('tiempo de espera') ||
      message.includes('tardó demasiado') ||
      message.includes('tardo demasiado')
    )
  }

  function isRetryableReservationHoldError(error) {
    const status = Number(error?.status || 0)

    return (
      isSearchTimeoutError(error) ||
      status === 408 ||
      status === 425 ||
      status === 429 ||
      status >= 500 ||
      status === 0
    )
  }

  function isAircraftHoldActive(hold = null) {
    const normalizedHold = normalizeAircraftHold(hold)
    if (!normalizedHold?.hold_id || !normalizedHold?.hold_expires_at) return false

    const expiresAt = new Date(normalizedHold.hold_expires_at).getTime()
    return Number.isFinite(expiresAt) && expiresAt > Date.now()
  }

  function doesAircraftHoldMatchSelection(hold = null, { quoteId = null, aircraftId = null } = {}) {
    const normalizedHold = normalizeAircraftHold(hold)
    if (!normalizedHold) return false

    const normalizedQuoteId = String(quoteId || '').trim()
    const normalizedAircraftId = String(aircraftId || '').trim()

    if (normalizedQuoteId && String(normalizedHold.quote_id || '').trim() !== normalizedQuoteId) {
      return false
    }

    if (
      normalizedAircraftId &&
      String(normalizedHold.aircraft_id || '').trim() !== normalizedAircraftId
    ) {
      return false
    }

    return isAircraftHoldActive(normalizedHold)
  }

  function normalizeRecoveredAircraftHold(
    payload = null,
    { holdPayload = {}, quoteKey = '', flightRequestId = '' } = {},
  ) {
    return normalizeAircraftHold({
      ...payload,
      quote_id: holdPayload.quote_id,
      aircraft_id: holdPayload.aircraft_id,
      provider_id: holdPayload.provider_id,
      quote_key: quoteKey,
      flight_request_id: flightRequestId,
    })
  }

  async function recoverAircraftHoldAfterFailure({
    holdPayload = {},
    previousHold = null,
    quoteKey = '',
    flightRequestId = '',
    maxAttempts = 3,
  } = {}) {
    const normalizedPreviousHold = normalizeAircraftHold(previousHold)

    if (
      doesAircraftHoldMatchSelection(normalizedPreviousHold, {
        quoteId: holdPayload.quote_id,
        aircraftId: holdPayload.aircraft_id,
      })
    ) {
      return normalizeRecoveredAircraftHold(normalizedPreviousHold, {
        holdPayload,
        quoteKey,
        flightRequestId,
      })
    }

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const validationResponse = await validateClientAircraftHold(
          normalizedPreviousHold?.hold_id || `quote-${holdPayload.quote_id || 'pending'}`,
          {
            quote_id: holdPayload.quote_id,
          },
          { timeoutMs: 10000 },
        )
        const recoveredHold = normalizeRecoveredAircraftHold(validationResponse, {
          holdPayload,
          quoteKey,
          flightRequestId,
        })

        if (recoveredHold) {
          return recoveredHold
        }
      } catch (validationError) {
        if (!isRetryableReservationHoldError(validationError) || attempt === maxAttempts - 1) {
          return null
        }
      }

      if (attempt < maxAttempts - 1) {
        await delay(1200)
      }
    }

    return null
  }

  function buildSearchResultsErrorMessage(error) {
    if (isSearchTimeoutError(error)) {
      return 'No pudimos consultar la disponibilidad. Intenta nuevamente.'
    }

    return error?.message || 'No pudimos consultar la disponibilidad. Intenta nuevamente.'
  }

  function waitForPortalFirstPaint() {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      return Promise.resolve()
    }

    return nextTick().then(
      () =>
        new Promise((resolve) => {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(resolve)
          })
        }),
    )
  }

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

  function hasLockedContractFlow(reservation = {}) {
    const workflowStatus = String(
      reservation?.workflow_status ||
        reservation?.status ||
        reservation?.frontend_state?.ui_status ||
        '',
    )
      .trim()
      .toLowerCase()
    const contractStatus = String(
      reservation?.contract_status ||
        reservation?.contract?.status ||
        reservation?.frontend_state?.docusign_status ||
        '',
    )
      .trim()
      .toLowerCase()
    const contractId = resolveContractRecordId(reservation)

    if (contractId) return true
    if (['generated', 'sent', 'completed', 'signed'].includes(contractStatus)) return true

    return [
      'contract_pending',
      'contrato pendiente',
      'in_contract',
      'en contrato',
      'firma pendiente',
      'contract_signed',
      'contrato firmado',
      'payment_pending',
      'payment_confirmed',
      'flight_confirmed',
      'tracking_live',
      'completed',
    ].includes(workflowStatus)
  }

  function resolveStripeCheckoutRedirectUrl(payload = {}, { intent = 'checkout' } = {}) {
    const normalizedIntent = String(intent || 'checkout')
      .trim()
      .toLowerCase()

    if (normalizedIntent === 'manage') {
      return String(
        payload?.management_url ||
          payload?.managementUrl ||
          payload?.url ||
          payload?.session_url ||
          payload?.sessionUrl ||
          payload?.data?.management_url ||
          payload?.data?.managementUrl ||
          payload?.data?.url ||
          payload?.data?.session_url ||
          payload?.data?.sessionUrl ||
          '',
      ).trim()
    }

    return String(
      payload?.checkout_url ||
        payload?.checkoutUrl ||
        payload?.url ||
        payload?.session_url ||
        payload?.sessionUrl ||
        payload?.data?.checkout_url ||
        payload?.data?.checkoutUrl ||
        payload?.data?.url ||
        payload?.data?.session_url ||
        payload?.data?.sessionUrl ||
        '',
    ).trim()
  }

  function isStripeHostedCheckoutUrl(url = '') {
    if (!url) return false

    try {
      const parsed = new URL(url, window.location.origin)
      return parsed.protocol === 'https:' && parsed.hostname.endsWith('stripe.com')
    } catch {
      return false
    }
  }

  function redirectToExternalUrl(url = '') {
    lastExternalRedirectUrl.value = String(url || '').trim()
    if (!lastExternalRedirectUrl.value || typeof window === 'undefined') return

    window.location.assign(lastExternalRedirectUrl.value)
  }

  function isApiCheckoutCreationUrl(url = '') {
    if (!url) return false

    try {
      const parsed = new URL(url, window.location.origin)
      const normalizedPath = String(parsed.pathname || '').toLowerCase()
      return normalizedPath.includes('/stripe/checkout/create')
    } catch {
      return String(url || '')
        .toLowerCase()
        .includes('/stripe/checkout/create')
    }
  }

  function resolveReservationRecordFromPayload(payload = null) {
    const candidates = [
      payload?.reservation,
      payload?.data?.reservation,
      payload?.booking,
      payload?.data?.booking,
      payload?.flight_request?.reservation,
      payload?.flightRequest?.reservation,
      payload?.data?.flight_request?.reservation,
      payload?.data?.flightRequest?.reservation,
      payload?.reservation?.data,
      payload?.data?.data,
      payload?.data,
      payload,
    ]

    return (
      candidates.find((candidate) => {
        if (!candidate || typeof candidate !== 'object') return false
        return Boolean(
          resolveEntityIdentifier(candidate) ||
          resolveEntityIdentifier(candidate?.reservation) ||
          resolveEntityIdentifier(candidate?.booking),
        )
      }) || null
    )
  }

  function isDocuSignRecipientSigningUrl(url = '') {
    const normalized = String(url || '')
      .trim()
      .toLowerCase()
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
  const holdExpiresAtDate = computed(() => parsedHoldExpiry(aircraftHold.value?.hold_expires_at))
  const holdRemainingMs = computed(() => {
    const expiresAt = holdExpiresAtDate.value
    if (!expiresAt) return 0
    return Math.max(expiresAt.getTime() - holdCountdownNow.value, 0)
  })
  const holdHasExpired = computed(
    () => holdRemainingMs.value <= 0 && Boolean(aircraftHold.value?.hold_id),
  )
  const holdWarningState = computed(
    () => holdRemainingMs.value > 0 && holdRemainingMs.value <= 120000,
  )
  const holdCountdownLabel = computed(() => {
    if (!holdRemainingMs.value) return ''
    const totalSeconds = Math.ceil(holdRemainingMs.value / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  })
  const activeAircraftHoldSummary = computed(() => {
    if (!aircraftHold.value?.hold_id || holdHasExpired.value) return null

    return {
      holdId: aircraftHold.value.hold_id,
      aircraftId: aircraftHold.value.aircraft_id,
      expiresAt: aircraftHold.value.hold_expires_at,
      countdownLabel: holdCountdownLabel.value,
      isWarning: holdWarningState.value,
    }
  })
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
    const pricing = aircraftPricingForType(
      aircraftOptions.value[0] || {},
      selectedPriorityType.value,
    )
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
  const routeSubsection = computed(() => String(route.params.subsection || '').trim())
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
  const commercialAccessPaymentMode = computed(
    () => props.section === 'pago' && isTruthyQueryFlag(route.query.accessPayment),
  )
  const commercialAccessCheckoutReturnMode = computed(() => {
    if (props.section !== 'pago') return false

    const checkoutState = normalizeRouteQueryValue(route.query.checkout).toLowerCase()
    if (!checkoutState) return false

    return !routeId.value
  })
  const commercialAccessCheckoutScreenMode = computed(
    () =>
      props.section === 'pago' &&
      (commercialAccessPaymentMode.value || commercialAccessCheckoutReturnMode.value),
  )
  const commercialAccessCheckoutReturnPending = computed(
    () =>
      commercialAccessCheckoutReturnMode.value &&
      Boolean(normalizeRouteQueryValue(route.query.checkout)),
  )
  const reservationCheckoutReturnMode = computed(() => {
    if (props.section !== 'pago') return false
    if (commercialAccessCheckoutReturnMode.value) return false
    if (!routeId.value) return false

    return Boolean(normalizeRouteQueryValue(route.query.checkout))
  })
  const reservationCheckoutReturnPending = computed(
    () =>
      reservationCheckoutReturnMode.value &&
      Boolean(normalizeRouteQueryValue(route.query.checkout)),
  )
  const reservationAllowsDirectPaymentAccess = computed(() => {
    return reservationQualifiesForCheckout(selectedReservation.value || {})
  })
  const paymentReadyForCheckout = computed(
    () =>
      selectedReservationFrontendState.value.ready_for_payment === true ||
      reservationAllowsDirectPaymentAccess.value,
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
  const contractRouteContextId = computed(
    () =>
      reservationContextId.value ||
      flightRequestContextId.value ||
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
      (selectedReservation.value?.total_amount
        ? formatCurrency(selectedReservation.value.total_amount)
        : '') ||
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
      Number(selectedReservation.value?.total_amount || 0) ||
      Number(selectedReservation.value?.selected_card_price || 0) ||
      Number(pricingContext.total_amount || 0) ||
      Number(pricingContext.selected_card_price || 0) ||
      Number(snapshotRecord.total_amount || 0) ||
      Number(snapshotRecord.selected_card_price || 0) ||
      moneyValue(selectedReservation.value?.formatted_final_price) ||
      moneyValue(selectedReservation.value?.final_price_display) ||
      moneyValue(selectedReservation.value?.estimated_total) ||
      moneyValue(selectedAircraftPricing.value?.formattedFinalPrice) ||
      0
    )
  })
  const paymentSummaryAmountLabel = computed(() => {
    if (paymentBreakdownTotalValue.value > 0) {
      return formatDetailedCurrencyByCode(
        paymentBreakdownTotalValue.value,
        paymentBreakdownCurrency.value,
      )
    }
    if (selectedReservationPriceValue.value > 0) {
      return formatDetailedCurrencyByCode(
        selectedReservationPriceValue.value,
        paymentBreakdownCurrency.value,
      )
    }
    if (selectedReservationPriceLabel.value) {
      return selectedReservationPriceLabel.value
    }
    return commercialAccessCheckoutReturnMode.value
      ? COMMERCIAL_ACCESS_AMOUNT_LABEL
      : 'Monto por confirmar'
  })
  const paymentBreakdownCurrency = computed(() => {
    if (commercialAccessCheckoutReturnMode.value) {
      return (
        commercialAccessSnapshot.value?.latestPayment?.currency ||
        commercialAccessSnapshot.value?.paymentPreview?.currency ||
        commercialAccessSnapshot.value?.paymentPreview?.billing_plan?.currency ||
        commercialAccessSnapshot.value?.latestPayment?.billing_plan?.currency ||
        'USD'
      )
    }

    return (
      selectedReservation.value?.currency ||
      selectedReservation.value?.pricing_context?.currency ||
      selectedReservation.value?.aircraft_snapshot?.currency ||
      'USD'
    )
  })
  const paymentBreakdownRows = computed(() => {
    if (commercialAccessCheckoutReturnMode.value) {
      const latestPayment = commercialAccessSnapshot.value?.latestPayment || {}
      const paymentPreview = commercialAccessSnapshot.value?.paymentPreview || {}
      const baseAmount = Number(
        latestPayment.base_amount ||
          paymentPreview.base_amount ||
          paymentPreview.billing_plan?.amount ||
          0,
      )
      const stripeFee = Number(latestPayment.stripe_fee || paymentPreview.stripe_fee || 0)
      const administrativeFee = Number(
        latestPayment.administrative_fee || paymentPreview.administrative_fee || 0,
      )
      const totalAmount = Number(
        latestPayment.total_amount || latestPayment.amount || paymentPreview.total_amount || 0,
      )

      return [
        baseAmount > 0
          ? {
              key: 'base_amount',
              label: 'Subtotal',
              value: formatDetailedCurrencyByCode(baseAmount, paymentBreakdownCurrency.value),
              amount: baseAmount,
            }
          : null,
        stripeFee > 0
          ? {
              key: 'stripe_fee',
              label: 'Cargo Stripe',
              value: formatDetailedCurrencyByCode(stripeFee, paymentBreakdownCurrency.value),
              amount: stripeFee,
            }
          : null,
        administrativeFee > 0
          ? {
              key: 'administrative_fee',
              label: 'Cargo administrativo',
              value: formatDetailedCurrencyByCode(
                administrativeFee,
                paymentBreakdownCurrency.value,
              ),
              amount: administrativeFee,
            }
          : null,
        totalAmount > 0
          ? {
              key: 'total_amount',
              label: 'Total',
              value: formatDetailedCurrencyByCode(totalAmount, paymentBreakdownCurrency.value),
              amount: totalAmount,
              total: true,
            }
          : null,
      ].filter(Boolean)
    }

    const reservation = selectedReservation.value || {}
    const pricingContext =
      reservation.pricing_context && typeof reservation.pricing_context === 'object'
        ? reservation.pricing_context
        : {}
    const snapshotRecord =
      reservation.aircraft_snapshot && typeof reservation.aircraft_snapshot === 'object'
        ? reservation.aircraft_snapshot
        : {}

    const flightCost = Number(
      reservation.flight_cost ||
        pricingContext.flight_cost ||
        snapshotRecord.flight_cost ||
        reservation.base_amount ||
        pricingContext.base_amount ||
        snapshotRecord.base_amount ||
        0,
    )
    const stripeFee = Number(
      reservation.stripe_fee || pricingContext.stripe_fee || snapshotRecord.stripe_fee || 0,
    )
    const administrativeFee = Number(
      reservation.administrative_fee ||
        pricingContext.administrative_fee ||
        snapshotRecord.administrative_fee ||
        0,
    )
    const totalAmount = Number(
      reservation.total_amount ||
        pricingContext.total_amount ||
        snapshotRecord.total_amount ||
        selectedReservationPriceValue.value ||
        0,
    )
    const useAssistedBreakdown =
      activeReservationPaymentMethod.value === 'assisted' ||
      resolveReservationPaymentMethod(reservation) === 'assisted_cash'
    const resolvedStripeFee = useAssistedBreakdown ? 0 : stripeFee
    const resolvedTotalAmount = useAssistedBreakdown ? flightCost + administrativeFee : totalAmount

    return [
      flightCost > 0
        ? {
            key: 'flight_cost',
            label: 'Subtotal vuelo',
            value: formatDetailedCurrencyByCode(flightCost, paymentBreakdownCurrency.value),
            amount: flightCost,
          }
        : null,
      resolvedStripeFee > 0
        ? {
            key: 'stripe_fee',
            label: 'Cargo Stripe',
            value: formatDetailedCurrencyByCode(resolvedStripeFee, paymentBreakdownCurrency.value),
            amount: resolvedStripeFee,
          }
        : null,
      administrativeFee > 0
        ? {
            key: 'administrative_fee',
            label: 'Cargo administrativo',
            value: formatDetailedCurrencyByCode(administrativeFee, paymentBreakdownCurrency.value),
            amount: administrativeFee,
          }
        : null,
      resolvedTotalAmount > 0
        ? {
            key: 'total_amount',
            label: 'Total',
            value: formatDetailedCurrencyByCode(
              resolvedTotalAmount,
              paymentBreakdownCurrency.value,
            ),
            amount: resolvedTotalAmount,
            total: true,
          }
        : null,
    ].filter(Boolean)
  })
  const paymentBreakdownTotalValue = computed(() => {
    const explicitTotal = paymentBreakdownRows.value.find((item) => item.total)
    if (explicitTotal) {
      return Number(explicitTotal.amount || 0)
    }

    return selectedReservationPriceValue.value
  })
  const paymentBreakdownAmountMap = computed(() =>
    paymentBreakdownRows.value.reduce((accumulator, item) => {
      accumulator[item.key] = Number(item.amount || 0)
      return accumulator
    }, {}),
  )
  const assistedPaymentProofUploaded = computed(() => {
    const paymentOrder = selectedReservation.value?.payment_order || {}
    return Boolean(
      paymentOrder?.proof_uploaded_at ||
      paymentOrder?.proof_name ||
      paymentOrder?.receipt_url ||
      paymentOrder?.proof_url,
    )
  })
  const canUploadAssistedPaymentProof = computed(
    () => assistedPaymentOrderReady.value || activeReservationPaymentMethod.value === 'assisted',
  )
  const assistedPrimaryCtaLabel = computed(() =>
    assistedPaymentOrderReady.value && assistedPaymentProofFile.value
      ? 'Enviar comprobante para validacion'
      : 'Registrar pago asistido',
  )
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
  const conciergeConfig = computed(() =>
    buildConciergeConfig({
      customerName: customerDisplayName.value,
    }),
  )
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const customerEmail = computed(() => {
    const rawEmail =
      auth?.user?.email ?? auth?.access?.email ?? auth?.access?.commercial_access?.email ?? ''
    return String(rawEmail || '')
      .trim()
      .toLowerCase()
  })
  const customerPhone = computed(() => {
    const rawPhone = auth.user?.phone || auth.access?.phone || ''
    return String(rawPhone || '').trim()
  })

  function resolveAuthenticatedContactEmail() {
    return String(
      paymentForm.contactEmail?.trim() ||
        auth?.user?.email ||
        auth?.access?.email ||
        auth?.access?.commercial_access?.email ||
        '',
    )
      .trim()
      .toLowerCase()
  }

  function hasValidEmailAddress(value = '') {
    return EMAIL_REGEX.test(
      String(value || '')
        .trim()
        .toLowerCase(),
    )
  }

  function currentIsoDate() {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }

  function currentTimeSlot() {
    const now = new Date()
    const nextHour = new Date(now.getTime() + 60 * 60 * 1000)
    return `${String(nextHour.getHours()).padStart(2, '0')}:00`
  }

  function closeConciergeDrawer() {
    isConciergeOpen.value = false
  }

  function openConciergeDrawer(context = {}) {
    if (context?.serviceId) {
      selectedConciergeServiceId.value = String(context.serviceId || '').trim()
    }
    if (context?.serviceTitle) {
      selectedConciergeServiceTitle.value = String(context.serviceTitle || '').trim()
    }
    isConciergeOpen.value = true
  }

  function closeConciergeChat() {
    isConciergeChatOpen.value = false
  }

  function openConciergeChat({ serviceId = '', serviceTitle = '' } = {}) {
    selectedConciergeServiceId.value = String(serviceId || '').trim()
    selectedConciergeServiceTitle.value = String(serviceTitle || '').trim()
    conciergeChatMessages.value = conciergeConfig.value.chat.initialMessages.map((item) => ({
      ...item,
    }))
    isConciergeOpen.value = false
    isConciergeScheduleOpen.value = false
    isConciergeChatOpen.value = true
  }

  function queueConciergeAutoReply() {
    if (conciergeAutoReplyTimer) {
      window.clearTimeout(conciergeAutoReplyTimer)
    }

    conciergeAutoReplyTimer = window.setTimeout(() => {
      conciergeChatMessages.value = [
        ...conciergeChatMessages.value,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          body: conciergeConfig.value.chat.responseTemplate,
          timestamp: 'Ahora',
        },
      ]
      conciergeAutoReplyTimer = null
    }, 800)
  }

  function sendConciergeChatMessage(message = conciergeChatDraft.value) {
    const normalizedMessage = String(message || '').trim()
    if (!normalizedMessage) return

    conciergeChatMessages.value = [
      ...conciergeChatMessages.value,
      {
        id: `user-${Date.now()}`,
        role: 'user',
        body: normalizedMessage,
        timestamp: 'Ahora',
      },
    ]
    conciergeChatDraft.value = ''
    queueConciergeAutoReply()
  }

  function openConciergeWhatsApp() {
    const { whatsappNumber, whatsappMessage } = conciergeConfig.value.channels
    const url = `https://wa.me/${encodeURIComponent(whatsappNumber)}?text=${encodeURIComponent(whatsappMessage)}`
    isConciergeOpen.value = false
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function callConciergePhone() {
    const { phoneNumber } = conciergeConfig.value.channels
    isConciergeOpen.value = false
    window.location.href = `tel:${phoneNumber}`
  }

  function openConciergeScheduleModal({ serviceId = '', serviceTitle = '' } = {}) {
    selectedConciergeServiceId.value = String(serviceId || '').trim()
    selectedConciergeServiceTitle.value = String(serviceTitle || '').trim()
    conciergeScheduleForm.date = currentIsoDate()
    conciergeScheduleForm.time = currentTimeSlot()
    conciergeScheduleForm.topic = selectedConciergeServiceId.value || 'flight'
    isConciergeOpen.value = false
    isConciergeScheduleOpen.value = true
  }

  function closeConciergeScheduleModal() {
    isConciergeScheduleOpen.value = false
  }

  function submitConciergeSchedule() {
    if (!conciergeScheduleForm.date || !conciergeScheduleForm.time) {
      ui.pushToast({
        tone: 'warning',
        title: 'Completa la agenda',
        message: 'Selecciona fecha y hora para programar la llamada.',
      })
      return
    }

    isConciergeScheduleOpen.value = false
    ui.pushToast({
      tone: 'success',
      title: conciergeConfig.value.schedule.confirmationTitle,
      message: conciergeConfig.value.schedule.confirmationMessage,
    })
  }

  function handleConciergeCommunicationSelection(option = {}) {
    const action = String(option?.action || '').trim()
    if (action === 'chat') {
      openConciergeChat()
      return
    }
    if (action === 'whatsapp') {
      openConciergeWhatsApp()
      return
    }
    if (action === 'call') {
      callConciergePhone()
      return
    }
    if (action === 'schedule') {
      openConciergeScheduleModal()
    }
  }

  function handleConciergeServiceSelection(service = {}) {
    openConciergeChat({
      serviceId: service.id,
      serviceTitle: service.title,
    })
  }

  function resolveValidationErrorMessage(error, fallbackMessage = '') {
    const firstFieldErrors = Object.values(error?.payload?.errors || {}).find(
      (value) => Array.isArray(value) && value.length,
    )

    return (
      firstFieldErrors?.[0] ||
      error?.payload?.message ||
      error?.message ||
      fallbackMessage ||
      'No fue posible completar la operación.'
    )
  }
  const reservationPaymentStartAt = computed(() =>
    resolveReservationPaymentStartAt(selectedReservation.value, paymentAvailabilityState.value),
  )
  const paymentRouteHeadline = computed(() =>
    commercialAccessCheckoutScreenMode.value
      ? 'Renovacion de acceso comercial SKY GROUP'
      : props.section === 'pago' && selectedReservation.value
        ? selectedReservation.value.route || itineraryHeadline(selectedReservation.value)
        : itineraryHeadline(activeItinerarySummary.value),
  )
  const paymentDateLabel = computed(() =>
    commercialAccessCheckoutScreenMode.value
      ? accessRenewalDateLabel.value
      : props.section === 'pago' && selectedReservation.value
        ? formatPaymentDateTimeLabel(reservationPaymentStartAt.value)
        : itineraryDateLine(activeItinerarySummary.value),
  )
  const paymentCanSubmit = computed(() => {
    if (commercialAccessCheckoutScreenMode.value) return true
    if (props.section !== 'pago') return true
    if (paymentAvailabilityLoading.value) return false
    if (!selectedReservation.value?.is_reservation) return true
    return paymentAvailabilityState.value?.can_pay !== false
  })
  const paymentMethodCards = [
    {
      id: 'stripe',
      label: 'Stripe',
      note: 'Checkout seguro fuera de la app con el total real del vuelo.',
      icon: 'card',
    },
    {
      id: 'assisted',
      label: 'Pago en efectivo',
      note: 'Orden manual, comprobante y validación administrativa.',
      icon: 'bank',
    },
  ]
  const paymentForm = reactive({
    contactEmail: '',
  })
  const selectedPaymentMethod = ref('')
  const paymentMethodExplicitlySelected = ref(false)
  const paymentCardBrand = ref('')
  const paymentSubmitting = ref(false)
  const paymentProofUploading = ref(false)
  const paymentInlineError = ref('')
  const paymentAvailabilityState = ref(null)
  const paymentAvailabilityLoading = ref(false)
  const paymentLastReference = ref('')
  const assistedPaymentOrderReady = ref(false)
  const assistedPaymentProofFile = ref(null)
  const assistedPaymentProofName = ref('')
  let stripeViewContext = ''

  const isStripeReservationPayment = computed(() => selectedPaymentMethod.value === 'stripe')
  const isAssistedReservationPayment = computed(() => selectedPaymentMethod.value === 'assisted')

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

  function normalizeCommercialAccessStatus(value = '') {
    return String(value || '')
      .trim()
      .toLowerCase()
  }

  function isCommercialAccessActiveStatus(status = '') {
    return new Set(['active', 'activa', 'vigente', 'approved', 'paid']).has(
      normalizeCommercialAccessStatus(status),
    )
  }

  function isCommercialAccessPastDueStatus(status = '') {
    return new Set([
      'past_due',
      'past due',
      'payment_failed',
      'failed',
      'retry_required',
      'retry_pending',
      'grace',
      'grace_period',
      'in_grace',
    ]).has(normalizeCommercialAccessStatus(status))
  }

  function isCommercialAccessSuspendedStatus(status = '') {
    return new Set([
      'unpaid',
      'suspended',
      'suspendida',
      'suspendido',
      'blocked',
      'inactive',
      'cancelled',
      'canceled',
    ]).has(normalizeCommercialAccessStatus(status))
  }

  function stateAllowsCommercialGraceAccess(status = '') {
    return isCommercialAccessPastDueStatus(status)
  }

  function formatAccessLongDate(value = '') {
    const calendarDate = normalizeCalendarDate(value)
    if (!calendarDate) {
      const normalized = String(value || '').trim()
      return normalized || 'Por confirmar'
    }

    const [year, month, day] = calendarDate.split('-').map((item) => Number(item))
    const parsed = new Date(Date.UTC(year, month - 1, day))

    return new Intl.DateTimeFormat('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(parsed)
  }

  function resolveReservationPaymentMethod(reservation = null) {
    return String(
      reservation?.payment_method ||
        reservation?.paymentMethod ||
        reservation?.payment_order?.payment_method ||
        reservation?.payment_order?.method ||
        '',
    )
      .trim()
      .toLowerCase()
  }

  const activeReservationPaymentMethod = computed(() => {
    const persistedMethod = resolveReservationPaymentMethod(selectedReservation.value)
    if (persistedMethod === 'assisted_cash') return 'assisted'
    if (persistedMethod === 'stripe') return 'stripe'
    return selectedPaymentMethod.value
  })

  function reservationQualifiesForCheckout(reservation = null) {
    if (reservation?.frontend_state?.availability_conflict === true) {
      return false
    }

    const workflowStage = resolveWorkflowState(
      reservation?.workflow_status || reservation?.status || '',
    ).id
    const contractStatus = String(
      reservation?.contract_status || reservation?.contract?.status || '',
    )
      .trim()
      .toLowerCase()
    const paymentStatus = String(
      reservation?.payment_status || reservation?.payment_order?.status || '',
    )
      .trim()
      .toLowerCase()
    const frontendReady = reservation?.frontend_state?.ready_for_payment === true

    return (
      frontendReady ||
      [
        'payment_pending',
        'payment_confirmed',
        'flight_confirmed',
        'tracking_live',
        'completed',
      ].includes(workflowStage) ||
      contractStatus === 'signed' ||
      [
        'pending',
        'pendiente de pago',
        'pending_manual_payment',
        'pending_manual_validation',
        'paid',
        'pagado',
      ].includes(paymentStatus)
    )
  }

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
  }

  function extractCommercialAccessFields(source = null) {
    const candidates = [
      source,
      source?.access,
      source?.data,
      source?.data?.access,
      source?.user,
      source?.data?.user,
      source?.commercial_access,
      source?.commercialAccess,
      source?.access?.commercial_access,
      source?.access?.commercialAccess,
      source?.data?.commercial_access,
      source?.data?.commercialAccess,
    ].filter(isPlainObject)

    for (const candidate of candidates) {
      const commercial = isPlainObject(candidate.commercial_access)
        ? candidate.commercial_access
        : isPlainObject(candidate.commercialAccess)
          ? candidate.commercialAccess
          : {}

      const status = commercial.status ?? candidate.access_status ?? candidate.status
      const hasPaidAccess = commercial.has_paid_access ?? candidate.has_paid_access
      const hasAccess = commercial.has_access ?? candidate.has_access
      const freeQuoteLimit = commercial.free_quote_limit ?? candidate.free_quote_limit
      const freeQuotesUsed = commercial.free_quotes_used ?? candidate.free_quotes_used
      const remainingFreeQuotes =
        commercial.remaining_free_quotes ?? candidate.remaining_free_quotes
      const accessExpiresAt = commercial.access_expires_at ?? candidate.access_expires_at
      const accessExpiresDate = commercial.access_expires_date ?? candidate.access_expires_date
      const accessExpiresFormatted =
        commercial.access_expires_formatted ?? candidate.access_expires_formatted
      const paidAccessAt = commercial.paid_access_at ?? candidate.paid_access_at
      const billingPeriodEnd = commercial.billing_period_end ?? candidate.billing_period_end
      const gracePeriodEndsAt =
        commercial.grace_period_ends_at ??
        commercial.grace_ends_at ??
        commercial.grace_period_end ??
        candidate.grace_period_ends_at ??
        candidate.grace_ends_at ??
        candidate.grace_period_end
      const accessIsActive = commercial.access_is_active ?? candidate.access_is_active
      const accessIsExpired = commercial.access_is_expired ?? candidate.access_is_expired
      const accessIsInGracePeriod =
        commercial.access_is_in_grace_period ?? candidate.access_is_in_grace_period
      const availableActions = commercial.available_actions ?? candidate.available_actions
      const accessMessage = commercial.access_message ?? candidate.access_message

      if (
        status !== undefined ||
        hasPaidAccess !== undefined ||
        hasAccess !== undefined ||
        freeQuoteLimit !== undefined ||
        freeQuotesUsed !== undefined ||
        remainingFreeQuotes !== undefined ||
        accessExpiresAt !== undefined ||
        accessExpiresDate !== undefined ||
        accessExpiresFormatted !== undefined ||
        paidAccessAt !== undefined ||
        billingPeriodEnd !== undefined ||
        gracePeriodEndsAt !== undefined ||
        accessIsActive !== undefined ||
        accessIsExpired !== undefined ||
        accessIsInGracePeriod !== undefined ||
        availableActions !== undefined ||
        accessMessage !== undefined
      ) {
        return {
          status,
          has_paid_access: hasPaidAccess,
          has_access: hasAccess,
          free_quote_limit: freeQuoteLimit,
          free_quotes_used: freeQuotesUsed,
          remaining_free_quotes: remainingFreeQuotes,
          access_expires_at: accessExpiresAt,
          access_expires_date: accessExpiresDate,
          access_expires_formatted: accessExpiresFormatted,
          paid_access_at: paidAccessAt,
          billing_period_end: billingPeriodEnd,
          grace_period_ends_at: gracePeriodEndsAt,
          access_is_active: accessIsActive,
          access_is_expired: accessIsExpired,
          access_is_in_grace_period: accessIsInGracePeriod,
          available_actions: availableActions,
          access_message: accessMessage,
        }
      }
    }

    return {}
  }

  function extractCommercialAccessLatestPayment(source = null) {
    const candidates = [
      source?.latest_payment,
      source?.latestPayment,
      source?.payment,
      source?.commercial_access?.latest_payment,
      source?.commercialAccess?.latest_payment,
      source?.access?.commercial_access?.latest_payment,
      source?.access?.commercialAccess?.latest_payment,
      auth.access?.commercial_access?.latest_payment,
      auth.access?.latest_payment,
    ].filter(isPlainObject)

    const payment = candidates[0] || null
    if (!payment) return null

    return {
      id: payment.id ?? null,
      status: payment.status ?? '',
      amount: payment.amount ?? null,
      base_amount: payment.base_amount ?? null,
      stripe_fee: payment.stripe_fee ?? null,
      total_amount: payment.total_amount ?? null,
      currency: payment.currency ?? '',
      card_brand: payment.card_brand ?? '',
      card_last4: payment.card_last4 ?? '',
      paid_at: payment.paid_at ?? '',
      billing_period_start: payment.billing_period_start ?? '',
      billing_period_end: payment.billing_period_end ?? '',
      billing_plan: isPlainObject(payment.billing_plan)
        ? {
            id: payment.billing_plan.id ?? null,
            code: payment.billing_plan.code ?? '',
            name: payment.billing_plan.name ?? '',
            amount: payment.billing_plan.amount ?? null,
            currency: payment.billing_plan.currency ?? '',
          }
        : isPlainObject(payment.billingPlan)
          ? {
              id: payment.billingPlan.id ?? null,
              code: payment.billingPlan.code ?? '',
              name: payment.billingPlan.name ?? '',
              amount: payment.billingPlan.amount ?? null,
              currency: payment.billingPlan.currency ?? '',
            }
          : null,
    }
  }

  function extractCommercialAccessPaymentPreview(source = null) {
    const candidates = [
      source?.payment_preview,
      source?.paymentPreview,
      source?.commercial_access?.payment_preview,
      source?.commercialAccess?.payment_preview,
      source?.access?.commercial_access?.payment_preview,
      source?.access?.commercialAccess?.payment_preview,
      auth.access?.commercial_access?.payment_preview,
      auth.access?.payment_preview,
    ].filter(isPlainObject)

    const preview = candidates[0] || null
    if (!preview) return null

    return {
      base_amount: preview.base_amount ?? null,
      stripe_fee: preview.stripe_fee ?? null,
      administrative_fee: preview.administrative_fee ?? null,
      total_amount: preview.total_amount ?? null,
      currency: preview.currency ?? '',
      billing_plan: isPlainObject(preview.billing_plan)
        ? {
            id: preview.billing_plan.id ?? null,
            code: preview.billing_plan.code ?? '',
            name: preview.billing_plan.name ?? '',
            amount: preview.billing_plan.amount ?? null,
            currency: preview.billing_plan.currency ?? '',
          }
        : null,
    }
  }

  const activePlan = computed(() => accountAccessCopy.value)

  function resolveCommercialAccessBillingIdentifiers(source = null) {
    const candidates = [source, auth.access?.commercial_access, auth.access, auth.user].filter(
      (candidate) => candidate && typeof candidate === 'object',
    )

    for (const candidate of candidates) {
      const commercial =
        candidate?.commercial_access && typeof candidate.commercial_access === 'object'
          ? candidate.commercial_access
          : candidate?.commercialAccess && typeof candidate.commercialAccess === 'object'
            ? candidate.commercialAccess
            : {}

      const subscriptionId =
        commercial.provider_subscription_id ||
        commercial.subscription_id ||
        candidate?.provider_subscription_id ||
        candidate?.subscription_id ||
        ''
      const customerId =
        commercial.provider_customer_id ||
        commercial.customer_id ||
        candidate?.provider_customer_id ||
        candidate?.customer_id ||
        ''

      if (subscriptionId || customerId) {
        return {
          subscriptionId: String(subscriptionId || '').trim(),
          customerId: String(customerId || '').trim(),
        }
      }
    }

    return {
      subscriptionId: '',
      customerId: '',
    }
  }

  function getDaysBetweenTodayAnd(value = '') {
    const calendarDate = normalizeCalendarDate(value)
    if (!calendarDate) return null

    const [year, month, day] = calendarDate.split('-').map((item) => Number(item))
    const today = new Date()
    const parsedUtc = Date.UTC(year, month - 1, day)
    const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())

    return Math.round((parsedUtc - todayUtc) / 86400000)
  }

  function normalizeCalendarDate(value = '') {
    const normalized = String(value || '').trim()
    if (!normalized) return ''

    const directMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (directMatch) {
      const [, year, month, day] = directMatch
      return `${year}-${month}-${day}`
    }

    const isoValue = normalized.includes('T') ? normalized : normalized.replace(' ', 'T')
    const parsed = new Date(isoValue)
    if (!Number.isFinite(parsed.getTime())) return ''

    const year = parsed.getFullYear()
    const month = String(parsed.getMonth() + 1).padStart(2, '0')
    const day = String(parsed.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  function latestCalendarDate(candidates = []) {
    let latest = ''

    for (const candidate of candidates) {
      const normalized = normalizeCalendarDate(candidate)
      if (!normalized) continue
      if (!latest || normalized > latest) {
        latest = normalized
      }
    }

    return latest
  }

  function detectRecentCommercialAccessRenewal(accessSource = null, latestPayment = null) {
    const paidAt = String(latestPayment?.paid_at || '').trim()
    const cycleStartsAt = String(latestPayment?.billing_period_start || '').trim()
    const cycleEndsAt = String(
      latestPayment?.billing_period_end || resolveCommercialAccessExpiryDate(accessSource) || '',
    ).trim()
    const currentExpiry = String(resolveCommercialAccessExpiryDate(accessSource) || '').trim()
    const daysSincePayment = paidAt ? getDaysBetweenTodayAnd(paidAt) : null
    const daysSinceCycleStart = cycleStartsAt ? getDaysBetweenTodayAnd(cycleStartsAt) : null
    const daysUntilCycleEnd = cycleEndsAt ? getDaysBetweenTodayAnd(cycleEndsAt) : null
    const cycleStartDate = normalizeCalendarDate(cycleStartsAt)
    const cycleEndDate = normalizeCalendarDate(cycleEndsAt)
    const currentExpiryDate = normalizeCalendarDate(currentExpiry)
    const cycleRangeDays =
      cycleStartDate && cycleEndDate
        ? Math.round(
            (new Date(`${cycleEndDate}T00:00:00`).getTime() -
              new Date(`${cycleStartDate}T00:00:00`).getTime()) /
              86400000,
          )
        : null

    return {
      paidAt,
      cycleStartsAt,
      cycleEndsAt,
      currentExpiry,
      // `daysSincePayment` is negative after the payment date passed.
      isRecentRenewal:
        daysSincePayment !== null &&
        daysSincePayment <= 0 &&
        daysSincePayment >= -7 &&
        daysSinceCycleStart !== null &&
        daysSinceCycleStart <= 0 &&
        daysSinceCycleStart >= -10 &&
        daysUntilCycleEnd !== null &&
        daysUntilCycleEnd >= 20 &&
        cycleRangeDays !== null &&
        cycleRangeDays >= 20 &&
        Boolean(cycleEndDate) &&
        cycleEndDate === currentExpiryDate,
    }
  }

  const accessRenewalDateLabel = computed(() => {
    const accessSource = auth.access?.commercial_access || auth.access
    const state = buildCommercialAccessUiState(accessSource)
    const expiryMeta = resolveCommercialAccessExpiryMeta(accessSource)
    if (!expiryMeta.label) return 'Activacion mensual inmediata'

    if (state.isPastDue) {
      const graceEndsAtLabel = formatAccessExpiryDate(
        resolveCommercialAccessGracePeriodEndDate(accessSource),
      )
      return graceEndsAtLabel
        ? `Periodo de gracia hasta ${formatAccessLongDate(graceEndsAtLabel)}`
        : 'Periodo de gracia activo'
    }

    if (isCommercialAccessExpired(accessSource)) {
      return `Reactivacion inmediata · vencio ${formatAccessLongDate(expiryMeta.label)}`
    }

    if (expiryMeta.daysUntil === 0) {
      return `Renovacion sugerida hoy · ${formatAccessLongDate(expiryMeta.label)}`
    }

    if (expiryMeta.daysUntil === 1) {
      return `Renovacion sugerida mañana · ${formatAccessLongDate(expiryMeta.label)}`
    }

    if (expiryMeta.daysUntil === 3) {
      return `Recordatorio en 3 dias · ${formatAccessLongDate(expiryMeta.label)}`
    }

    if (expiryMeta.daysUntil === 7) {
      return `Recordatorio en 7 dias · ${formatAccessLongDate(expiryMeta.label)}`
    }

    return `Vigencia actual hasta ${formatAccessLongDate(expiryMeta.label)}`
  })
  const activePaymentBadge = computed(() => {
    const value = String(accountAccessCopy.value || '').trim()
    if (!value.toLowerCase().startsWith('pago activo')) return ''
    return value.toUpperCase()
  })
  const topNavNotificationCount = computed(() => {
    const reservationAlerts = reservations.value.filter((reservation) => {
      const workflowStage = resolveWorkflowState(
        reservation?.workflow_status || reservation?.status || '',
      ).id
      const paymentStatus = String(
        reservation?.payment_status || reservation?.payment_order?.status || '',
      )
        .trim()
        .toLowerCase()

      return (
        ['provider_pending', 'contract_pending', 'payment_pending'].includes(workflowStage) ||
        ['pending', 'pending_manual_payment', 'pending_manual_validation'].includes(paymentStatus)
      )
    }).length

    return (
      reservationAlerts +
      (commercialAccessCheckoutReturnPending.value ? 1 : 0) +
      (reservationCheckoutReturnPending.value ? 1 : 0)
    )
  })
  const commercialAccessRenewalPanel = computed(() => {
    const accessSource = auth.access?.commercial_access || auth.access
    const state = buildCommercialAccessUiState(accessSource)
    const expiryMeta = resolveCommercialAccessExpiryMeta(accessSource)
    const latestPayment = commercialAccessSnapshot.value.latestPayment
    const identifiers = resolveCommercialAccessBillingIdentifiers(accessSource)
    const renewalCycle = detectRecentCommercialAccessRenewal(accessSource, latestPayment)
    const hasSubscription = Boolean(identifiers.subscriptionId)
    const tone = renewalCycle.isRecentRenewal
      ? 'success'
      : state.isSuspended
        ? 'danger'
        : state.isPastDue
          ? 'warning'
          : hasSubscription && state.hasPaidAccess
            ? 'success'
            : 'neutral'

    let title = 'Sin renovación automática confirmada'
    let message =
      'Todavía no vemos una suscripción vinculada para asegurar el siguiente cobro automático.'
    let outcome = 'Revisa el siguiente cobro manualmente.'

    if (renewalCycle.isRecentRenewal && hasSubscription && state.hasPaidAccess) {
      title = 'Se renovó correctamente'
      message =
        'El último cobro ya se registró y la vigencia del acceso avanzó al nuevo ciclo sin intervención manual.'
      outcome = renewalCycle.cycleEndsAt
        ? `La renovación quedó confirmada y este ciclo permanece activo hasta ${formatAccessLongDate(renewalCycle.cycleEndsAt)}.`
        : 'La renovación quedó confirmada y el nuevo ciclo ya está activo.'
    } else if (isCommercialAccessExpired(accessSource)) {
      title = 'Renovación automática vencida'
      message =
        'La suscripción sigue vinculada, pero la vigencia ya expiró. Hace falta reactivar el pago para recuperar cotizaciones, reservas y pagos.'
      outcome = expiryMeta.label
        ? `El acceso venció el ${formatAccessLongDate(expiryMeta.label)} y requiere reactivación inmediata.`
        : 'El acceso venció y requiere reactivación inmediata.'
    } else if (state.isSuspended) {
      title = 'Renovación automática detenida'
      message =
        'La suscripción ya no está cobrando de forma automática. Hace falta reactivar el acceso o actualizar el método de pago.'
      outcome = 'La cuenta puede quedar bloqueada hasta reactivarse.'
    } else if (state.isPastDue) {
      title = 'Renovación automática requiere atención'
      message =
        'Stripe intentó el cobro del nuevo ciclo, pero el pago no se confirmó. La cuenta sigue en gracia mientras se corrige.'
      outcome = 'Si el siguiente intento falla, el acceso puede suspenderse.'
    } else if (hasSubscription && state.hasPaidAccess) {
      title = 'Renovación automática configurada'
      message =
        'Ya existe una suscripción activa vinculada al cliente. Si el próximo cobro entra bien, la vigencia avanzará sola.'
      outcome = expiryMeta.label
        ? `Cuando Stripe renueve, la fecha actual ${formatAccessLongDate(expiryMeta.label)} debe extenderse al siguiente ciclo.`
        : 'Cuando Stripe renueve, la vigencia debe moverse al siguiente ciclo.'
    }

    return {
      tone,
      title,
      message,
      outcome,
      rows: [
        {
          label: 'Próximo corte',
          value: accessRenewalDateLabel.value,
        },
        {
          label: 'Último pago confirmado',
          value: renewalCycle.paidAt
            ? formatAccessLongDate(renewalCycle.paidAt)
            : 'Sin cargo confirmado',
        },
      ],
    }
  })
  const commercialAccessSnapshot = computed(() => {
    const access = auth.access || {}
    const user = auth.user || {}
    const commercial = extractCommercialAccessFields({
      access,
      user,
    })

    return {
      status: String(
        commercial.status || access.access_status || user.access_status || 'trial_active',
      )
        .trim()
        .toLowerCase(),
      hasPaidAccess: Boolean(
        commercial.has_paid_access ?? access.has_paid_access ?? user.has_paid_access ?? false,
      ),
      freeQuoteLimit: Number(
        commercial.free_quote_limit ?? access.free_quote_limit ?? user.free_quote_limit ?? 1,
      ),
      freeQuotesUsed: Number(
        commercial.free_quotes_used ?? access.free_quotes_used ?? user.free_quotes_used ?? 0,
      ),
      latestPayment: extractCommercialAccessLatestPayment({ access, user }),
      paymentPreview: extractCommercialAccessPaymentPreview({ access, user }),
    }
  })
  const {
    commercialAccessCheckoutFacts,
    paymentFeatureList,
    paymentHeroCopy,
    paymentHeroTitle,
    paymentMethodSummaryLabel,
  } = useClientPortalPayments({
    auth,
    buildCommercialAccessUiState,
    commercialAccessCheckoutReturnMode,
    commercialAccessSnapshot,
    isAssistedReservationPayment,
    isCommercialAccessExpired,
    isStripeReservationPayment,
    normalizeCardBrand,
    paymentBreakdownCurrency,
    paymentCardBrand,
    paymentMethodCards,
    paymentReadyForCheckout,
    resolveCommercialAccessExpiryMeta,
    resolveReservationPaymentMethod,
    selectedPaymentMethod,
    selectedReservation,
    selectedReservationFrontendState,
  })
  const hasCommercialTrialQuoteAvailable = computed(() => {
    const commercial = commercialAccessSnapshot.value
    const eligibleStatuses = new Set([
      'trial_active',
      'registered',
      'active',
      'activo',
      'activa',
      'payment_failed',
      'trial_used',
      'payment_pending',
    ])

    return (
      !commercial.hasPaidAccess &&
      eligibleStatuses.has(commercial.status) &&
      commercial.freeQuotesUsed < Math.max(1, commercial.freeQuoteLimit)
    )
  })
  const canQuoteFlights = computed(() => {
    const access = auth.access || {}
    const user = auth.user || {}
    const commercial = access.commercial_access || access.commercialAccess || {}
    const availableActions =
      commercial.available_actions && typeof commercial.available_actions === 'object'
        ? commercial.available_actions
        : {}
    if (typeof availableActions.can_quote === 'boolean') {
      return availableActions.can_quote
    }
    const accessSource = access.commercial_access || access.commercialAccess || access
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
    const normalizedCommercialStatus = String(
      commercial.status || access.access_status || user.access_status || '',
    )
      .trim()
      .toLowerCase()
    const activeStatuses = new Set(['active', 'activa', 'vigente', 'approved'])
    const demoStatuses = new Set(['trial_active', 'demo_active', 'demo_activa', 'trial', 'demo'])
    const normalizedDemoStatuses = [
      access.demo_active,
      access.demo?.status,
      access.has_demo,
      user.demo_active,
      user.demo?.status,
      user.has_demo,
    ]
      .map((value) =>
        String(value ?? '')
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean)

    if (isCommercialAccessExpired(accessSource)) {
      return false
    }

    if (access.has_access === true || accessSource.has_access === true) {
      return true
    }

    return (
      stateAllowsCommercialGraceAccess(normalizedCommercialStatus) ||
      activeStatuses.has(normalizedSubscriptionStatus) ||
      demoStatuses.has(normalizedSubscriptionStatus) ||
      demoStatuses.has(normalizedCommercialStatus) ||
      normalizedDemoStatuses.some((value) => demoStatuses.has(value)) ||
      commercialAccessSnapshot.value.hasPaidAccess ||
      hasCommercialTrialQuoteAvailable.value
    )
  })
  const canReserveFlights = computed(() => {
    const access = auth.access || {}
    const user = auth.user || {}
    const commercial = access.commercial_access || access.commercialAccess || {}
    const accessSource = access.commercial_access || access.commercialAccess || access
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
    const normalizedCommercialStatus = String(
      commercial.status || access.access_status || user.access_status || '',
    )
      .trim()
      .toLowerCase()
    const activeStatuses = new Set(['active', 'activa', 'vigente', 'approved'])

    if (isCommercialAccessExpired(accessSource)) {
      return false
    }

    if (access.has_access === true || accessSource.has_access === true) {
      return true
    }

    return (
      commercialAccessSnapshot.value.hasPaidAccess ||
      stateAllowsCommercialGraceAccess(normalizedCommercialStatus) ||
      activeStatuses.has(normalizedCommercialStatus) ||
      activeStatuses.has(normalizedSubscriptionStatus) ||
      String(access.subscription_active ?? '')
        .trim()
        .toLowerCase() === 'true'
    )
  })
  const hasActiveClientAccess = computed(() => canQuoteFlights.value)
  const commercialTrialNotice = computed(() => {
    const accessSource = auth.access?.commercial_access || auth.access
    const state = buildCommercialAccessUiState(accessSource)
    const expiryMeta = resolveCommercialAccessExpiryMeta(accessSource)
    const expiresAtLabel = expiryMeta.label
    const graceEndsAtLabel = formatAccessExpiryDate(
      resolveCommercialAccessGracePeriodEndDate(accessSource),
    )

    if (state.isSuspended) {
      return {
        tone: 'danger',
        title: graceEndsAtLabel
          ? `Acceso suspendido desde ${graceEndsAtLabel}`
          : 'Acceso suspendido',
        message:
          'Tu periodo de gracia terminó o la suscripcion quedó impaga. Actualiza el método de pago para reactivar cotizaciones, reservas y pagos.',
      }
    }

    if (isCommercialAccessExpired(accessSource)) {
      return {
        tone: 'danger',
        title: expiresAtLabel
          ? `Acceso comercial vencido ${expiresAtLabel}`
          : 'Acceso comercial vencido',
        message:
          'Tu acceso ya expiró. Reactiva el pago para volver a cotizar, reservar, firmar contrato y pagar vuelos.',
      }
    }

    if (state.hasPaidAccess && expiryMeta.daysUntil === 0) {
      return {
        tone: 'warn',
        title: expiresAtLabel
          ? `Acceso comercial vence hoy ${expiresAtLabel}`
          : 'Acceso comercial vence hoy',
        message:
          'Tu acceso sigue activo durante hoy. Puedes renovarlo ahora para no interrumpir cotizaciones, reservas y pagos.',
      }
    }

    if (state.hasPaidAccess && expiryMeta.daysUntil === 1) {
      return {
        tone: 'warn',
        title: expiresAtLabel
          ? `Acceso comercial vence mañana ${expiresAtLabel}`
          : 'Acceso comercial vence mañana',
        message:
          'Tu acceso sigue activo, pero vence mañana. Puedes renovarlo desde ahora para evitar interrupciones.',
      }
    }

    if (state.hasPaidAccess && expiryMeta.daysUntil === 3) {
      return {
        tone: 'info',
        title: expiresAtLabel
          ? `Recordatorio de renovación · faltan 3 días (${expiresAtLabel})`
          : 'Recordatorio de renovación · faltan 3 días',
        message:
          'Tu suscripción sigue activa. Conviene revisar ahora tu método de pago para evitar un fallo cerca del próximo cobro.',
      }
    }

    if (state.hasPaidAccess && expiryMeta.daysUntil === 7) {
      return {
        tone: 'info',
        title: expiresAtLabel
          ? `Recordatorio de renovación · faltan 7 días (${expiresAtLabel})`
          : 'Recordatorio de renovación · faltan 7 días',
        message:
          'Tu cuenta sigue activa. Ya puedes validar la renovación automática y el método de pago registrado.',
      }
    }

    if (state.isPastDue) {
      return {
        tone: 'warn',
        title: graceEndsAtLabel
          ? `Pago fallido · periodo de gracia hasta ${graceEndsAtLabel}`
          : 'Pago fallido · periodo de gracia activo',
        message:
          'Intentamos cobrar la renovación automática, pero el pago falló. Tu cuenta sigue activa temporalmente mientras actualizas el método de pago.',
      }
    }

    if (state.hasPaidAccess) {
      return {
        tone: 'success',
        title: 'Acceso comercial activo',
        message: 'Tu cuenta ya puede cotizar, reservar, firmar contrato y pagar vuelos.',
      }
    }

    if (state.remainingFreeQuotes > 0) {
      return {
        tone: 'info',
        title: `${state.remainingFreeQuotes} cotizacion gratis disponible${state.remainingFreeQuotes === 1 ? '' : 's'}`,
        message:
          'Tu prueba gratuita te permite cotizar una vez. Para reservar el vuelo necesitas activar el acceso comercial de USD 115.',
      }
    }

    if (['checkout_pending', 'payment_pending'].includes(state.status)) {
      return {
        tone: 'warn',
        title: 'Checkout de acceso pendiente',
        message:
          'Tu checkout sigue abierto en Stripe. Completa el pago y después vuelve para verificarlo.',
      }
    }

    if (state.status === 'payment_processing') {
      return {
        tone: 'warn',
        title: 'Pago de acceso en validacion',
        message:
          'Ya consumiste tu prueba gratuita. En cuanto Stripe confirme el pago de acceso podras reservar.',
      }
    }

    if (state.status === 'cancelled') {
      return {
        tone: 'warn',
        title: 'Pago cancelado',
        message:
          'El intento anterior fue cancelado antes de confirmarse. Puedes reintentar la activación cuando quieras.',
      }
    }

    return {
      tone: 'warn',
      title: 'Prueba gratuita consumida',
      message:
        'Tu siguiente paso es activar el acceso comercial para poder reservar, firmar contrato y pagar el vuelo.',
    }
  })

  const shouldShowCommercialAccessCta = computed(() =>
    requiresCommercialAccessPayment(auth.access?.commercial_access || auth.access),
  )

  const commercialAccessCtaLabel = computed(() => {
    if (isCreatingAccessCheckout.value) return 'Abriendo Stripe...'

    const accessSource = auth.access?.commercial_access || auth.access
    const state = buildCommercialAccessUiState(accessSource)
    if (state.isSuspended) return 'Reactivar suscripción'
    if (state.isPastDue) return 'Actualizar método de pago'
    if (state.isExpired) return 'Reactivar acceso comercial'
    if (isCommercialAccessExpired(accessSource)) return 'Reactivar acceso comercial'

    const { daysUntil } = resolveCommercialAccessExpiryMeta(accessSource)
    if ([0, 1, 3, 7].includes(daysUntil)) return 'Renovar acceso comercial'

    return 'Activar acceso comercial'
  })

  function buildCommercialAccessUiState(accessSource = null) {
    const fallback = commercialAccessSnapshot.value
    const commercial = extractCommercialAccessFields(accessSource)
    const status = String(commercial.status || fallback.status || 'trial_active')
      .trim()
      .toLowerCase()
    const hasPaidAccess = Boolean(commercial.has_paid_access ?? fallback.hasPaidAccess ?? false)
    const hasAccess = Boolean(commercial.has_access ?? fallback.hasAccess ?? hasPaidAccess)
    const freeQuoteLimit = Math.max(
      1,
      Number(commercial.free_quote_limit ?? fallback.freeQuoteLimit ?? 1),
    )
    const freeQuotesUsed = Math.max(
      0,
      Number(commercial.free_quotes_used ?? fallback.freeQuotesUsed ?? 0),
    )
    const remainingFreeQuotes = Math.max(
      0,
      Number(commercial.remaining_free_quotes ?? freeQuoteLimit - freeQuotesUsed),
    )
    const gracePeriodEndsAt = String(commercial.grace_period_ends_at || '').trim()
    const availableActions =
      commercial.available_actions && typeof commercial.available_actions === 'object'
        ? commercial.available_actions
        : {}
    const backendMessage = String(commercial.access_message || '').trim()
    const backendIsActive = commercial.access_is_active
    const backendIsExpired = commercial.access_is_expired
    const backendIsInGrace = commercial.access_is_in_grace_period

    return {
      status,
      hasPaidAccess,
      hasAccess,
      freeQuoteLimit,
      freeQuotesUsed,
      remainingFreeQuotes,
      gracePeriodEndsAt,
      availableActions,
      backendMessage,
      isPastDue:
        typeof backendIsInGrace === 'boolean'
          ? backendIsInGrace
          : isCommercialAccessPastDueStatus(status),
      isSuspended: isCommercialAccessSuspendedStatus(status),
      isActive:
        typeof backendIsActive === 'boolean'
          ? backendIsActive
          : hasPaidAccess || isCommercialAccessActiveStatus(status),
      isExpired: typeof backendIsExpired === 'boolean' ? backendIsExpired : false,
    }
  }

  function resolveCommercialAccessExpiryDate(accessSource = null) {
    const commercial = extractCommercialAccessFields(accessSource)
    const access = auth.access || {}
    const user = auth.user || {}

    return latestCalendarDate([
      commercial.access_expires_date,
      commercial.access_expires_at,
      access.commercial_access?.access_expires_date,
      access.commercial_access?.access_expires_at,
      access.access_expires_date,
      access.access_expires_at,
      user.access_expires_date,
      user.access_expires_at,
    ])
  }

  function resolveCommercialAccessGracePeriodEndDate(accessSource = null) {
    const commercial = extractCommercialAccessFields(accessSource)
    const access = auth.access || {}
    const user = auth.user || {}

    return String(
      commercial.grace_period_ends_at ||
        access.commercial_access?.grace_period_ends_at ||
        access.commercial_access?.grace_ends_at ||
        access.grace_period_ends_at ||
        access.grace_ends_at ||
        user.grace_period_ends_at ||
        user.grace_ends_at ||
        '',
    ).trim()
  }

  function formatAccessExpiryDate(value = '') {
    const normalized = String(value || '').trim()
    if (!normalized) return ''
    return normalizeCalendarDate(normalized) || normalized.slice(0, 10)
  }

  function resolveCommercialAccessExpiryLabel(accessSource = null) {
    const commercial = extractCommercialAccessFields(accessSource)
    const access = auth.access || {}
    const user = auth.user || {}

    return (
      String(
        commercial.access_expires_formatted ||
          commercial.access_expires_date ||
          access.commercial_access?.access_expires_formatted ||
          access.commercial_access?.access_expires_date ||
          access.access_expires_formatted ||
          access.access_expires_date ||
          user.access_expires_formatted ||
          user.access_expires_date ||
          '',
      ).trim() || formatAccessExpiryDate(resolveCommercialAccessExpiryDate(accessSource))
    )
  }

  function resolveCommercialAccessExpiryMeta(accessSource = null) {
    const expiresAt = resolveCommercialAccessExpiryDate(accessSource)
    const label = resolveCommercialAccessExpiryLabel(accessSource)
    if (!label) return { expiresAt, label: '', daysUntil: null }

    const [year, month, day] = label.split('-').map((value) => Number(value))
    if (!year || !month || !day) return { expiresAt, label, daysUntil: null }

    const expiryUtc = Date.UTC(year, month - 1, day)
    const now = new Date()
    const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())

    return {
      expiresAt,
      label,
      daysUntil: Math.round((expiryUtc - todayUtc) / 86400000),
    }
  }

  function isCommercialAccessExpired(accessSource = null) {
    const state = buildCommercialAccessUiState(accessSource)
    if (state.isExpired) return true
    if (state.isPastDue) return false
    if (state.isSuspended) return true

    const { daysUntil } = resolveCommercialAccessExpiryMeta(accessSource)
    return daysUntil !== null && daysUntil < 0
  }

  const accountAccessCopy = computed(() => {
    const accessSource = auth.access?.commercial_access || auth.access
    const state = buildCommercialAccessUiState(accessSource)
    const expiryMeta = resolveCommercialAccessExpiryMeta(accessSource)
    const expiresAtLabel = expiryMeta.label
    const graceEndsAtLabel = formatAccessExpiryDate(
      resolveCommercialAccessGracePeriodEndDate(accessSource),
    )

    if (state.isSuspended) {
      return graceEndsAtLabel
        ? `Acceso suspendido · gracia terminó ${graceEndsAtLabel}`
        : 'Acceso suspendido'
    }

    if (isCommercialAccessExpired(accessSource)) {
      return expiresAtLabel ? `Acceso vencido ${expiresAtLabel}` : 'Acceso vencido'
    }

    if (state.isPastDue) {
      return graceEndsAtLabel
        ? `Past due · gracia hasta ${graceEndsAtLabel}`
        : 'Past due · gracia activa'
    }

    if (state.hasPaidAccess && expiryMeta.daysUntil === 0) {
      return expiresAtLabel
        ? `Pago activo · vence hoy ${expiresAtLabel}`
        : 'Pago activo · vence hoy'
    }

    if (state.hasPaidAccess && expiryMeta.daysUntil === 1) {
      return expiresAtLabel
        ? `Pago activo · vence mañana ${expiresAtLabel}`
        : 'Pago activo · vence mañana'
    }

    if (state.hasPaidAccess && expiryMeta.daysUntil === 3) {
      return expiresAtLabel
        ? `Pago activo · recordatorio 3 días ${expiresAtLabel}`
        : 'Pago activo · recordatorio 3 días'
    }

    if (state.hasPaidAccess && expiryMeta.daysUntil === 7) {
      return expiresAtLabel
        ? `Pago activo · recordatorio 7 días ${expiresAtLabel}`
        : 'Pago activo · recordatorio 7 días'
    }

    if (state.hasPaidAccess || state.status === 'active') {
      return expiresAtLabel ? `Pago activo · vence ${expiresAtLabel}` : 'Pago activo'
    }

    if (['checkout_pending', 'payment_pending'].includes(state.status)) {
      return 'Checkout pendiente'
    }

    if (state.status === 'payment_processing') {
      return 'Pago en validacion'
    }

    if (state.remainingFreeQuotes > 0) {
      return `${state.remainingFreeQuotes} cotizacion gratis`
    }

    if (state.status === 'payment_failed') {
      return 'Pago rechazado'
    }

    return 'Prueba consumida'
  })

  function requiresCommercialAccessPayment(accessSource = null) {
    const state = buildCommercialAccessUiState(accessSource)
    if (typeof state.availableActions?.can_renew === 'boolean') {
      return state.availableActions.can_renew
    }
    if (state.isSuspended || state.isPastDue) return true
    if (isCommercialAccessExpired(accessSource)) return true
    const { daysUntil } = resolveCommercialAccessExpiryMeta(accessSource)
    if (state.hasPaidAccess && [0, 1, 3, 7].includes(daysUntil)) return true
    return !state.hasPaidAccess && state.remainingFreeQuotes <= 0
  }

  function buildCommercialAccessMessage(accessSource = null) {
    const state = buildCommercialAccessUiState(accessSource)
    if (state.backendMessage) return state.backendMessage
    const expiresAt = resolveCommercialAccessExpiryDate(accessSource)
    const expiresAtLabel = formatAccessExpiryDate(expiresAt)
    const graceEndsAtLabel = formatAccessExpiryDate(
      resolveCommercialAccessGracePeriodEndDate(accessSource),
    )

    if (state.isSuspended) {
      return graceEndsAtLabel
        ? `Tu periodo de gracia terminó el ${graceEndsAtLabel}. Actualiza el método de pago para reactivar el acceso comercial.`
        : 'Tu acceso comercial está suspendido. Actualiza el método de pago para reactivarlo.'
    }

    if (isCommercialAccessExpired(accessSource)) {
      return expiresAtLabel
        ? `Tu acceso comercial expiró el ${expiresAtLabel}. Reactiva el pago para continuar.`
        : 'Tu acceso comercial expiró. Reactiva el pago para continuar.'
    }

    if (state.isPastDue) {
      return graceEndsAtLabel
        ? `El cobro automático falló. Tu cuenta sigue activa en periodo de gracia hasta el ${graceEndsAtLabel}.`
        : 'El cobro automático falló. Tu cuenta sigue activa temporalmente mientras actualizas el método de pago.'
    }

    if (state.hasPaidAccess) {
      return 'Tu acceso comercial ya esta activo.'
    }

    if (state.remainingFreeQuotes > 0) {
      return `Tienes ${state.remainingFreeQuotes} cotizacion${state.remainingFreeQuotes === 1 ? '' : 'es'} de prueba disponible${state.remainingFreeQuotes === 1 ? '' : 's'}.`
    }

    if (['checkout_pending', 'payment_pending'].includes(state.status)) {
      return 'Tu checkout de acceso sigue abierto. Completa el pago en Stripe para continuar.'
    }

    if (state.status === 'payment_processing') {
      return 'Stripe ya recibió el pago, pero seguimos verificando la confirmación final con el backend.'
    }

    if (state.status === 'payment_failed') {
      return 'No pudimos validar el pago anterior. Intenta de nuevo para reactivar tu acceso comercial.'
    }

    if (state.status === 'cancelled') {
      return 'El pago fue cancelado antes de confirmarse. Puedes intentarlo de nuevo cuando quieras.'
    }

    return 'Tu cotizacion de prueba ya fue utilizada. Pantalla de pago para proceder.'
  }

  function buildReservationAccessMessage(accessSource = null) {
    const state = buildCommercialAccessUiState(accessSource)
    const expiresAt = resolveCommercialAccessExpiryDate(accessSource)
    const expiresAtLabel = formatAccessExpiryDate(expiresAt)
    const graceEndsAtLabel = formatAccessExpiryDate(
      resolveCommercialAccessGracePeriodEndDate(accessSource),
    )

    if (state.isSuspended) {
      return graceEndsAtLabel
        ? `Tu periodo de gracia terminó el ${graceEndsAtLabel}. Actualiza el método de pago para volver a reservar, firmar contrato y pagar el vuelo.`
        : 'Tu acceso comercial está suspendido. Actualiza el método de pago para volver a reservar, firmar contrato y pagar el vuelo.'
    }

    if (isCommercialAccessExpired(accessSource)) {
      return expiresAtLabel
        ? `Tu acceso comercial venció el ${expiresAtLabel}. Reactiva el pago para poder reservar, firmar contrato y pagar el vuelo.`
        : 'Tu acceso comercial venció. Reactiva el pago para poder reservar, firmar contrato y pagar el vuelo.'
    }

    if (state.isPastDue) {
      return graceEndsAtLabel
        ? `Tu pago automático falló, pero sigues activo hasta el ${graceEndsAtLabel}. Actualiza el método de pago para evitar el bloqueo.`
        : 'Tu pago automático falló, pero sigues activo temporalmente. Actualiza el método de pago para evitar el bloqueo.'
    }

    if (state.hasPaidAccess) {
      return 'Tu acceso comercial ya esta activo.'
    }

    if (state.remainingFreeQuotes > 0) {
      return 'Tu prueba gratis cubre la cotizacion inicial. Para reservar este vuelo primero activa el acceso comercial de USD 115.'
    }

    if (['checkout_pending', 'payment_pending'].includes(state.status)) {
      return 'Tu checkout de acceso sigue abierto. Completa el pago en Stripe para poder reservar.'
    }

    if (state.status === 'payment_processing') {
      return 'Tu pago de acceso está en verificación. En cuanto se confirme, podrás reservar.'
    }

    if (state.status === 'payment_failed') {
      return 'No pudimos validar el pago anterior. Intenta de nuevo para activar tu acceso comercial.'
    }

    if (state.status === 'cancelled') {
      return 'El pago fue cancelado antes de confirmarse. Puedes reintentar la activación para reservar.'
    }

    return 'Necesitas activar el acceso comercial para reservar, firmar contrato y pagar el vuelo.'
  }

  function syncCommercialAccessState(accessSource = null) {
    const state = buildCommercialAccessUiState(accessSource)
    const commercial = extractCommercialAccessFields(accessSource)
    const latestPayment = extractCommercialAccessLatestPayment(accessSource)
    const paymentPreview = extractCommercialAccessPaymentPreview(accessSource)
    const currentCommercial = auth.access?.commercial_access || {}
    const hasAccess = Boolean(
      commercial.has_access ??
      currentCommercial.has_access ??
      auth.access?.has_access ??
      auth.user?.access?.has_access ??
      state.hasAccess,
    )
    const accessExpiresAt =
      commercial.access_expires_at ??
      currentCommercial.access_expires_at ??
      auth.access?.access_expires_at ??
      auth.user?.access_expires_at
    const paidAccessAt =
      commercial.paid_access_at ??
      currentCommercial.paid_access_at ??
      auth.access?.paid_access_at ??
      auth.user?.paid_access_at
    const billingPeriodEnd =
      commercial.billing_period_end ??
      currentCommercial.billing_period_end ??
      auth.access?.billing_period_end ??
      auth.user?.billing_period_end
    const gracePeriodEndsAt =
      commercial.grace_period_ends_at ??
      currentCommercial.grace_period_ends_at ??
      auth.access?.grace_period_ends_at ??
      auth.user?.grace_period_ends_at
    const accessExpiresDate =
      commercial.access_expires_date ??
      currentCommercial.access_expires_date ??
      auth.access?.access_expires_date ??
      auth.user?.access_expires_date
    const accessExpiresFormatted =
      commercial.access_expires_formatted ??
      currentCommercial.access_expires_formatted ??
      auth.access?.access_expires_formatted ??
      auth.user?.access_expires_formatted
    const accessIsActive =
      commercial.access_is_active ??
      currentCommercial.access_is_active ??
      auth.access?.access_is_active
    const accessIsExpired =
      commercial.access_is_expired ??
      currentCommercial.access_is_expired ??
      auth.access?.access_is_expired
    const accessIsInGracePeriod =
      commercial.access_is_in_grace_period ??
      currentCommercial.access_is_in_grace_period ??
      auth.access?.access_is_in_grace_period
    const availableActions =
      commercial.available_actions ||
      currentCommercial.available_actions ||
      auth.access?.available_actions ||
      null
    const accessMessage =
      commercial.access_message ??
      currentCommercial.access_message ??
      auth.access?.access_message ??
      ''

    auth.syncUserContext({
      accessPatch: {
        commercial_access: {
          ...currentCommercial,
          status: state.status,
          has_paid_access: state.hasPaidAccess,
          has_access: hasAccess,
          free_quote_limit: state.freeQuoteLimit,
          free_quotes_used: state.freeQuotesUsed,
          remaining_free_quotes: state.remainingFreeQuotes,
          access_expires_at: accessExpiresAt,
          access_expires_date: accessExpiresDate,
          access_expires_formatted: accessExpiresFormatted,
          paid_access_at: paidAccessAt,
          billing_period_end: billingPeriodEnd,
          grace_period_ends_at: gracePeriodEndsAt,
          access_is_active: accessIsActive,
          access_is_expired: accessIsExpired,
          access_is_in_grace_period: accessIsInGracePeriod,
          available_actions: availableActions,
          access_message: accessMessage,
          latest_payment: latestPayment || currentCommercial.latest_payment || null,
          payment_preview: paymentPreview || currentCommercial.payment_preview || null,
        },
        access_status: state.status,
        has_paid_access: state.hasPaidAccess,
        has_access: hasAccess,
        free_quote_limit: state.freeQuoteLimit,
        free_quotes_used: state.freeQuotesUsed,
        access_expires_at: accessExpiresAt,
        access_expires_date: accessExpiresDate,
        access_expires_formatted: accessExpiresFormatted,
        paid_access_at: paidAccessAt,
        billing_period_end: billingPeriodEnd,
        grace_period_ends_at: gracePeriodEndsAt,
        access_is_active: accessIsActive,
        access_is_expired: accessIsExpired,
        access_is_in_grace_period: accessIsInGracePeriod,
        available_actions: availableActions,
        access_message: accessMessage,
        latest_payment: latestPayment || auth.access?.latest_payment || null,
        payment_preview: paymentPreview || auth.access?.payment_preview || null,
      },
      userPatch: {
        access_status: state.status,
        has_paid_access: state.hasPaidAccess,
        access: {
          ...(auth.user?.access || {}),
          has_access: hasAccess,
          access_is_active: accessIsActive,
          access_is_expired: accessIsExpired,
          access_is_in_grace_period: accessIsInGracePeriod,
          access_message: accessMessage,
          available_actions: availableActions,
        },
        free_quote_limit: state.freeQuoteLimit,
        free_quotes_used: state.freeQuotesUsed,
        access_expires_at: accessExpiresAt,
        access_expires_date: accessExpiresDate,
        access_expires_formatted: accessExpiresFormatted,
        paid_access_at: paidAccessAt,
        billing_period_end: billingPeriodEnd,
        grace_period_ends_at: gracePeriodEndsAt,
      },
    })
  }

  function hasRealQuoteResults(results = []) {
    return Array.isArray(results)
      ? results.some(
          (item) =>
            String(item?.source_table || '')
              .trim()
              .toLowerCase() !== 'catalog_fallback_quote',
        )
      : false
  }

  function consumeTrialQuoteLocally(accessSource = null) {
    const currentState = buildCommercialAccessUiState(accessSource)

    if (currentState.hasPaidAccess || currentState.remainingFreeQuotes <= 0) {
      return currentState
    }

    const nextFreeQuotesUsed = Math.min(
      currentState.freeQuoteLimit,
      currentState.freeQuotesUsed + 1,
    )
    const nextRemainingFreeQuotes = Math.max(0, currentState.freeQuoteLimit - nextFreeQuotesUsed)
    const nextStatus =
      nextRemainingFreeQuotes > 0
        ? currentState.status || 'trial_active'
        : currentState.status === 'payment_pending'
          ? 'payment_pending'
          : 'trial_used'

    syncCommercialAccessState({
      commercial_access: {
        ...auth.access?.commercial_access,
        status: nextStatus,
        has_paid_access: false,
        free_quote_limit: currentState.freeQuoteLimit,
        free_quotes_used: nextFreeQuotesUsed,
        remaining_free_quotes: nextRemainingFreeQuotes,
      },
      access_status: nextStatus,
      has_paid_access: false,
      free_quote_limit: currentState.freeQuoteLimit,
      free_quotes_used: nextFreeQuotesUsed,
      remaining_free_quotes: nextRemainingFreeQuotes,
    })

    return buildCommercialAccessUiState(auth.access?.commercial_access || auth.access)
  }

  function normalizeAccessPaymentStatus(value = '') {
    return String(value || '')
      .trim()
      .toLowerCase()
  }

  function isSuccessfulAccessPaymentStatus(value = '') {
    return [
      'paid',
      'succeeded',
      'success',
      'complete',
      'completed',
      'pagado',
      'pagada',
      'payment_confirmed',
      'payment confirmed',
      'pago confirmado',
      'pago aprobado',
      'exitoso',
    ].includes(normalizeAccessPaymentStatus(value))
  }

  async function refreshCommercialAccessStatus({ forceSessionRefresh = false } = {}) {
    if (!commercialAccessStatusRequestPromise) {
      commercialAccessStatusRequestPromise = (async () => {
        const payload = await getClientAccessStatus({
          timeoutMs: 30000,
          forceRefresh: forceSessionRefresh,
        })
        syncCommercialAccessState(payload)
        return payload
      })().finally(() => {
        commercialAccessStatusRequestPromise = null
      })
    }

    const payload = await commercialAccessStatusRequestPromise

    if (forceSessionRefresh) {
      await auth.refreshSession({ force: true, preferCache: false })
      syncCommercialAccessState(payload || auth.access?.commercial_access || auth.access)
    }

    return payload
  }

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
  const {
    canRenderReservationWorkflow,
    hasReservationsLoaded,
    isResultsSection,
    needsReservationContext,
    tripsInitialTab,
  } = useClientPortalTrips({
    commercialAccessCheckoutReturnMode,
    hasBootstrappedReservations,
    loadingServerData,
    paymentReadyForCheckout,
    props,
    refreshingReservations,
    reservations,
    selectedReservation,
  })
  const {
    otherSectionCardCopy,
    profileDisplayName,
    profileEmail,
    profileInitials,
    profilePhone,
    profileStats,
    userFirstName,
  } = useClientPortalProfile({
    auth,
    hasActiveClientAccess,
    reservations,
    searchForm,
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
  function sidebarAircraftTypeLabel(aircraft = {}) {
    const normalized = String(
      aircraft.cabin || aircraft.category || aircraft.aircraft_category || '',
    )
      .toLowerCase()
      .trim()

    if (!normalized) return 'Jet ejecutivo'
    if (normalized.includes('ultra')) return 'Ultra Long Range'
    if (normalized.includes('heavy') || normalized.includes('long')) return 'Heavy Jet'
    if (normalized.includes('super') && normalized.includes('mid')) return 'Super Midsize'
    if (normalized.includes('mid')) return 'Midsize Jet'
    if (normalized.includes('light')) return 'Light Jet'
    if (normalized.includes('turbo')) return 'Turbo Prop'
    if (normalized.includes('helic')) return 'Helicoptero'
    return aircraftClassLabel(aircraft)
  }

  function aircraftCapacityValue(aircraft = {}) {
    const raw = String(aircraft.capacity || aircraft.passenger_capacity || '').match(
      /(\d+(?:\.\d+)?)/,
    )
    return Number(raw?.[1] || 0)
  }

  function aircraftSpeedValue(aircraft = {}) {
    const speedKmh = Number(
      aircraft.speed_kmh || aircraft.speedKmh || aircraft.cruise_speed_kmh || 0,
    )
    if (Number.isFinite(speedKmh) && speedKmh > 0) return Math.round(speedKmh / 1.852)

    const normalized = String(aircraft.cabin || aircraft.category || '').toLowerCase()
    if (normalized.includes('ultra')) return 520
    if (normalized.includes('heavy') || normalized.includes('long')) return 500
    if (normalized.includes('super') && normalized.includes('mid')) return 470
    if (normalized.includes('mid')) return 450
    if (normalized.includes('light')) return 420
    if (normalized.includes('turbo')) return 300
    if (normalized.includes('helic')) return 140
    return 0
  }

  function normalizeSidebarServiceLabel(value = '') {
    const normalized = String(value || '')
      .trim()
      .toLowerCase()

    if (!normalized) return ''
    if (normalized.includes('wifi') || normalized.includes('wi-fi')) return 'Wi-Fi a bordo'
    if (normalized.includes('cater')) return 'Catering gourmet'
    if (normalized.includes('mascot') || normalized.includes('pet')) return 'Mascotas permitidas'
    if (normalized.includes('cama') || normalized.includes('bed')) return 'Cabina con cama'
    if (
      normalized.includes('bano') ||
      normalized.includes('baño') ||
      normalized.includes('lavatory')
    )
      return 'Bano completo'
    if (normalized.includes('equipaje')) return 'Equipaje especial'
    if (normalized.includes('traslado')) return 'Traslado terrestre'

    return String(value || '').trim()
  }

  function aircraftServiceLabels(aircraft = {}) {
    const amenities = Array.isArray(aircraft.amenities) ? aircraft.amenities : []
    return [...new Set(amenities.map((item) => normalizeSidebarServiceLabel(item)).filter(Boolean))]
  }

  const routeVisibleAircraftOptions = computed(() => {
    return aircraftOptions.value.filter(
      (aircraft, index, all) =>
        !conflictedAircraftIds.value.includes(String(resolveAircraftId(aircraft) || '').trim()) &&
        aircraftVisibleForRoute(aircraft, all, index),
    )
  })

  const aircraftSidebarTypeOptions = computed(() => {
    const counts = routeVisibleAircraftOptions.value.reduce((map, aircraft) => {
      const label = sidebarAircraftTypeLabel(aircraft)
      map.set(label, (map.get(label) || 0) + 1)
      return map
    }, new Map())

    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort(
        (current, next) => next.count - current.count || current.label.localeCompare(next.label),
      )
  })

  const aircraftSidebarServiceOptions = computed(() => {
    const counts = routeVisibleAircraftOptions.value.reduce((map, aircraft) => {
      aircraftServiceLabels(aircraft).forEach((label) => {
        map.set(label, (map.get(label) || 0) + 1)
      })
      return map
    }, new Map())

    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort(
        (current, next) => next.count - current.count || current.label.localeCompare(next.label),
      )
  })

  const aircraftSidebarPriceBounds = computed(() => {
    const values = routeVisibleAircraftOptions.value
      .map((aircraft) => aircraftPriceValue(aircraft))
      .filter((value) => Number.isFinite(value) && value !== Number.MAX_SAFE_INTEGER && value > 0)

    if (!values.length) return { min: 0, max: 0 }
    return { min: Math.min(...values), max: Math.max(...values) }
  })

  const aircraftSidebarPassengerBounds = computed(() => {
    const values = routeVisibleAircraftOptions.value
      .map((aircraft) => aircraftCapacityValue(aircraft))
      .filter((value) => Number.isFinite(value) && value > 0)

    if (!values.length) return { min: 0, max: 0 }
    return { min: Math.min(...values), max: Math.max(...values) }
  })

  const aircraftSidebarSpeedBounds = computed(() => {
    const values = routeVisibleAircraftOptions.value
      .map((aircraft) => aircraftSpeedValue(aircraft))
      .filter((value) => Number.isFinite(value) && value > 0)

    if (!values.length) return { min: 0, max: 0 }
    return { min: Math.min(...values), max: Math.max(...values) }
  })

  const sidebarFilteredAircraftOptions = computed(() => {
    const selectedTypes = new Set(aircraftSidebarFilters.types)
    const selectedServices = new Set(aircraftSidebarFilters.services)
    const passengerMin = Number(aircraftSidebarFilters.passengerMin || 0)
    const priceMin = Number(aircraftSidebarFilters.priceMin || 0)
    const priceMax = Number(aircraftSidebarFilters.priceMax || 0)
    const speedMin = Number(aircraftSidebarFilters.speedMin || 0)

    return routeVisibleAircraftOptions.value.filter((aircraft) => {
      const typeLabel = sidebarAircraftTypeLabel(aircraft)
      const capacity = aircraftCapacityValue(aircraft)
      const price = aircraftPriceValue(aircraft)
      const speed = aircraftSpeedValue(aircraft)
      const services = aircraftServiceLabels(aircraft)

      if (selectedTypes.size && !selectedTypes.has(typeLabel)) return false
      if (passengerMin > 0 && capacity > 0 && capacity < passengerMin) return false
      if (priceMin > 0 && (!Number.isFinite(price) || price < priceMin)) return false
      if (priceMax > 0 && (!Number.isFinite(price) || price > priceMax)) return false
      if (speedMin > 0 && speed > 0 && speed < speedMin) return false
      if (
        selectedServices.size &&
        ![...selectedServices].every((service) => services.includes(service))
      )
        return false

      return true
    })
  })
  const filteredAircraftOptions = computed(() => {
    const options = sidebarFilteredAircraftOptions.value.map((aircraft, index) => ({
      aircraft,
      index,
    }))

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
  const visibleAircraftOptions = computed(() => filteredAircraftOptions.value)
  const decoratedAircraftOptions = computed(() => visibleAircraftOptions.value)
  const featuredAircraft = computed(() => decoratedAircraftOptions.value[0] || null)
  const secondaryAircraftOptions = computed(() => decoratedAircraftOptions.value.slice(1))

  function updateAircraftSidebarFilter({ field, value }) {
    if (!Object.prototype.hasOwnProperty.call(aircraftSidebarFilters, field)) return
    aircraftSidebarFilters[field] = value
  }

  function clearAircraftSidebarFilters() {
    aircraftSidebarFilters.types = []
    aircraftSidebarFilters.passengerMin = 0
    aircraftSidebarFilters.priceMin = ''
    aircraftSidebarFilters.priceMax = ''
    aircraftSidebarFilters.speedMin = 0
    aircraftSidebarFilters.services = []
  }

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

  function canUseCheckoutContextStorage() {
    return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
  }

  function canUseAircraftHoldStorage() {
    return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
  }

  function normalizeAircraftHold(payload = null) {
    if (!payload || typeof payload !== 'object') return null

    const holdId = String(
      payload.hold_id ||
        payload.holdId ||
        payload.id ||
        payload.data?.hold_id ||
        payload.data?.id ||
        '',
    ).trim()
    const expiresAt = String(
      payload.hold_expires_at ||
        payload.holdExpiresAt ||
        payload.expires_at ||
        payload.expiresAt ||
        payload.data?.hold_expires_at ||
        payload.data?.expires_at ||
        '',
    ).trim()

    if (!holdId || !expiresAt) return null

    return {
      hold_id: holdId,
      hold_expires_at: expiresAt,
      quote_id: String(
        payload.quote_id || payload.quoteId || payload.quote?.id || payload.data?.quote_id || '',
      ).trim(),
      aircraft_id: String(
        payload.aircraft_id ||
          payload.aircraftId ||
          payload.aircraft?.id ||
          payload.data?.aircraft_id ||
          '',
      ).trim(),
      provider_id: String(
        payload.provider_id ||
          payload.providerId ||
          payload.provider?.id ||
          payload.data?.provider_id ||
          '',
      ).trim(),
      reservation_id: String(
        payload.reservation_id || payload.reservationId || payload.data?.reservation_id || '',
      ).trim(),
      flight_request_id: String(
        payload.flight_request_id ||
          payload.flightRequestId ||
          payload.data?.flight_request_id ||
          '',
      ).trim(),
      quote_key: String(payload.quote_key || payload.quoteKey || '').trim(),
      status: String(
        payload.status || payload.hold_status || payload.data?.status || 'active',
      ).trim(),
      source: payload.source || 'backend',
    }
  }

  function normalizePositiveInteger(value) {
    const normalizedValue = Number(value)
    return Number.isInteger(normalizedValue) && normalizedValue > 0 ? normalizedValue : null
  }

  function resolveQuoteId(...sources) {
    for (const source of sources) {
      const candidates = [
        source?.accepted_quote?.quote_id,
        source?.accepted_quote?.id,
        source?.quote_id,
        source?.quoteId,
        source?.quotation_id,
        source?.quotationId,
        source?.quote?.id,
        source?.quotation?.id,
        source?.booking?.quote_id,
        source?.flight_request?.accepted_quote?.quote_id,
        source?.flight_request?.accepted_quote?.id,
        source?.flight_request?.quote_id,
        source?.data?.accepted_quote?.quote_id,
        source?.data?.accepted_quote?.id,
        source?.data?.quote_id,
        source?.data?.id,
        source?.params?.quote,
        source?.params?.quote_id,
      ]

      for (const candidate of candidates) {
        const resolvedValue = normalizePositiveInteger(candidate)
        if (resolvedValue) return resolvedValue
      }
    }

    return null
  }

  function resolveAircraftId(...sources) {
    for (const source of sources) {
      const candidates = [
        source?.aircraft_id,
        source?.aircraftId,
        source?.selected_aircraft_id,
        source?.assigned_aircraft_id,
        source?.aircraft?.id,
        source?.data?.aircraft_id,
        source?.id,
      ]

      for (const candidate of candidates) {
        const resolvedValue = normalizePositiveInteger(candidate)
        if (resolvedValue) return resolvedValue
      }
    }

    return null
  }

  function buildReservationDraftKey({ aircraftId = null, providerId = null, quoteKey = '' } = {}) {
    return [
      'client-aircraft-selection',
      String(quoteKey || '').trim() || 'no-quote-key',
      String(aircraftId || ''),
      String(providerId || ''),
    ].join(':')
  }

  function createReservationAttemptIdempotencyKey() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `client-flight-request:${crypto.randomUUID()}`
    }

    return `client-flight-request:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`
  }

  function readReservationDraftContext(key = '') {
    return key ? reservationDraftContexts.value[key] || null : null
  }

  function writeReservationDraftContext(key = '', context = null) {
    if (!key) return

    reservationDraftContexts.value = context
      ? {
          ...reservationDraftContexts.value,
          [key]: context,
        }
      : Object.fromEntries(
          Object.entries(reservationDraftContexts.value).filter(
            ([currentKey]) => currentKey !== key,
          ),
        )
  }

  function buildAircraftHoldPayload({
    quoteId = null,
    aircraftId = null,
    aircraft = {},
    reservationSchedule = {},
    tripTypeKeyValue = '',
    tripLabelValue = '',
    passengers = 1,
    quoteKey = '',
    legs = [],
  } = {}) {
    const normalizedQuoteId = normalizePositiveInteger(quoteId)
    const normalizedAircraftId = normalizePositiveInteger(aircraftId)
    const normalizedDepartureDate = String(reservationSchedule.departure_date || '').trim()
    const normalizedDepartureDateTime = String(reservationSchedule.departure_datetime || '').trim()

    if (!normalizedQuoteId) {
      throw new Error('No se pudo persistir la cotización antes de solicitar la retención.')
    }

    if (!normalizedAircraftId) {
      throw new Error('No se encontró una aeronave válida para solicitar la reserva.')
    }

    if (!normalizedDepartureDate || !normalizedDepartureDateTime) {
      throw new Error('No se pudo resolver una fecha válida para solicitar la reserva.')
    }

    return {
      quote_id: normalizedQuoteId,
      aircraft_id: normalizedAircraftId,
      provider_id: aircraft.provider_id || aircraft.provider?.id || null,
      match_id: aircraft.match_id || aircraft.matched_option_id || aircraft.id || null,
      matched_option_id: aircraft.matched_option_id || aircraft.match_id || aircraft.id || null,
      trip_type: tripTypeKeyValue,
      trip_label: tripLabelValue,
      passengers,
      departure_date: reservationSchedule.departure_date,
      departure_time: reservationSchedule.departure_time,
      departure_datetime: reservationSchedule.departure_datetime,
      start_date: reservationSchedule.start_date,
      start_time: reservationSchedule.start_time,
      start_datetime: reservationSchedule.start_datetime,
      return_datetime: reservationSchedule.return_datetime,
      quote_key: quoteKey || undefined,
      legs,
    }
  }

  function logAircraftHoldRequest({
    quoteId = null,
    aircraftId = null,
    endpoint = '',
    payload = null,
  } = {}) {
    if (!import.meta.env.DEV || typeof console === 'undefined') return

    console.group('AIRCRAFT HOLD REQUEST')
    console.log('quoteId:', quoteId)
    console.log('aircraftId:', aircraftId)
    console.log('endpoint:', endpoint)
    console.log('payload:', payload)
    console.groupEnd()
  }

  function persistAircraftHoldContext(context = null) {
    if (!canUseAircraftHoldStorage()) return

    if (!context) {
      window.sessionStorage.removeItem(CLIENT_AIRCRAFT_HOLD_CONTEXT_KEY)
      return
    }

    window.sessionStorage.setItem(
      CLIENT_AIRCRAFT_HOLD_CONTEXT_KEY,
      JSON.stringify({
        ...context,
        savedAt: new Date().toISOString(),
      }),
    )
  }

  function readAircraftHoldContext() {
    if (!canUseAircraftHoldStorage()) return null

    const rawSnapshot = window.sessionStorage.getItem(CLIENT_AIRCRAFT_HOLD_CONTEXT_KEY)
    if (!rawSnapshot) return null

    try {
      const snapshot = JSON.parse(rawSnapshot)
      return snapshot && typeof snapshot === 'object' ? snapshot : null
    } catch {
      window.sessionStorage.removeItem(CLIENT_AIRCRAFT_HOLD_CONTEXT_KEY)
      return null
    }
  }

  function setAircraftHold(nextHold = null) {
    aircraftHold.value = normalizeAircraftHold(nextHold)
    persistAircraftHoldContext(aircraftHold.value)
  }

  function buildResolvedAircraftHold(...sources) {
    const normalizedHold = sources
      .map((source) => normalizeAircraftHold(source))
      .find((candidate) => candidate?.hold_id && candidate?.hold_expires_at)

    if (!normalizedHold) return null

    const fallbackQuoteId = resolveQuoteId(...sources)
    const fallbackAircraftId = resolveAircraftId(...sources)
    const fallbackReservationId = sources
      .map((source) =>
        resolveEntityIdentifier(source?.reservation_id || source?.reservationId || source),
      )
      .find(Boolean)
    const fallbackFlightRequestId = sources
      .map((source) =>
        resolveEntityIdentifier(source?.flight_request_id || source?.flightRequestId || source),
      )
      .find(Boolean)
    const fallbackQuoteKey = sources
      .map((source) => String(source?.quote_key || source?.quoteKey || '').trim())
      .find(Boolean)

    return {
      ...normalizedHold,
      quote_id: normalizedHold.quote_id || String(fallbackQuoteId || '').trim(),
      aircraft_id: normalizedHold.aircraft_id || String(fallbackAircraftId || '').trim(),
      reservation_id: normalizedHold.reservation_id || fallbackReservationId || '',
      flight_request_id: normalizedHold.flight_request_id || fallbackFlightRequestId || '',
      quote_key: normalizedHold.quote_key || fallbackQuoteKey || '',
    }
  }

  function resolveReservationAircraftHold({
    reservation = null,
    checkoutContext = null,
    activeHold = null,
  } = {}) {
    return buildResolvedAircraftHold(
      reservation?.frontend_state?.aircraft_hold,
      reservation?.aircraft_hold,
      checkoutContext?.aircraftHold,
      checkoutContext?.reservation?.frontend_state?.aircraft_hold,
      activeHold,
      reservation,
      checkoutContext?.reservation,
      checkoutContext,
    )
  }

  function parsedHoldExpiry(value = '') {
    const normalized = String(value || '').trim()
    if (!normalized) return null

    const isoValue = normalized.includes('T') ? normalized : normalized.replace(' ', 'T')
    const parsed = new Date(isoValue)
    return Number.isFinite(parsed.getTime()) ? parsed : null
  }

  function normalizeReservationPaymentAvailability(payload = null) {
    const source =
      payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object'
        ? payload.data
        : payload && typeof payload === 'object'
          ? payload
          : {}

    const hold =
      source.hold && typeof source.hold === 'object'
        ? {
            id: String(source.hold.id || source.hold.hold_id || '').trim(),
            status: String(source.hold.status || '')
              .trim()
              .toLowerCase(),
            aircraft_id: String(source.hold.aircraft_id || '').trim(),
            quote_id: String(source.hold.quote_id || '').trim(),
            flight_request_id: String(source.hold.flight_request_id || '').trim(),
            reservation_id: String(source.hold.reservation_id || '').trim(),
            start_at: String(source.hold.start_at || source.hold.starts_at || '').trim(),
            end_at: String(source.hold.end_at || source.hold.ends_at || '').trim(),
            expires_at: String(source.hold.expires_at || source.hold.hold_expires_at || '').trim(),
            released_at: String(source.hold.released_at || '').trim(),
            booked_at: String(source.hold.booked_at || '').trim(),
            is_valid: source.hold.is_valid === true,
            invalid_reason: String(source.hold.invalid_reason || '').trim(),
          }
        : null

    return {
      success: source.success === true,
      can_pay: source.can_pay === true,
      hold_valid: source.hold_valid === true,
      reservation_booked: source.reservation_booked === true,
      invalid_reason: String(source.invalid_reason || hold?.invalid_reason || '').trim(),
      message: String(source.message || '').trim(),
      hold,
      availability:
        source.availability && typeof source.availability === 'object'
          ? {
              available: source.availability.available === true,
              conflict_type: String(source.availability.conflict_type || '').trim(),
              conflicting_block_id: String(source.availability.conflicting_block_id || '').trim(),
            }
          : null,
      schedule:
        source.schedule && typeof source.schedule === 'object'
          ? {
              start_at: String(source.schedule.start_at || '').trim(),
              end_at: String(source.schedule.end_at || '').trim(),
              source: String(source.schedule.source || '').trim(),
            }
          : null,
    }
  }

  function reservationPaymentAvailabilityMessage(state = null) {
    const invalidReason = String(state?.invalid_reason || '').trim()
    if (state?.can_pay) return ''

    const explicitMessage = String(state?.message || '').trim()
    if (explicitMessage) return explicitMessage

    switch (invalidReason) {
      case 'hold_expired':
        return 'La retencion vencio. Estamos verificando nuevamente la disponibilidad de la aeronave.'
      case 'hold_released':
        return 'La retencion ya fue liberada y necesitamos validar una nueva disponibilidad.'
      case 'hold_not_found':
        return 'No encontramos una retencion valida asociada a esta reserva.'
      case 'aircraft_booked_by_other_reservation':
        return 'La aeronave ya fue reservada para ese horario. Selecciona otra opcion.'
      case 'reservation_missing_schedule':
      case 'hold_dates_missing':
        return 'No se encontro una fecha y hora confirmadas para esta reserva.'
      case 'hold_dates_mismatch':
        return 'La ventana de la retencion no coincide con la reserva actual.'
      case 'network_error':
        return 'No fue posible validar la disponibilidad. Intenta nuevamente.'
      default:
        return 'No fue posible validar la disponibilidad actual de la aeronave.'
    }
  }

  function shouldRefreshAvailabilityResults(invalidReason = '') {
    return [
      'hold_expired',
      'hold_released',
      'hold_not_found',
      'aircraft_booked_by_other_reservation',
      'hold_dates_mismatch',
    ].includes(String(invalidReason || '').trim())
  }

  function isAircraftAvailabilityConflictError(error = null) {
    const invalidReason = String(
      error?.payload?.invalid_reason || error?.payload?.reason || '',
    ).trim()
    const code = String(error?.payload?.code || '').trim()
    const message = String(error?.message || error?.payload?.message || '').toLowerCase()

    return (
      ['AIRCRAFT_NOT_AVAILABLE', 'AIRCRAFT_ALREADY_RESERVED'].includes(code) ||
      (Number(error?.status || 0) === 409 && shouldRefreshAvailabilityResults(invalidReason)) ||
      message.includes('aeronave ya no esta disponible') ||
      message.includes('aeronave ya no está disponible') ||
      message.includes('acaba de ser reservada')
    )
  }

  function parseDateTimeCandidate(value = '') {
    const normalized = String(value || '').trim()
    if (!normalized) return null

    const parsed = new Date(normalized.includes('T') ? normalized : normalized.replace(' ', 'T'))
    return Number.isFinite(parsed.getTime()) ? parsed : null
  }

  function formatPaymentDateTimeLabel(value = '') {
    const parsed = parseDateTimeCandidate(value)
    if (!parsed) return 'Fecha por confirmar'

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

    return `${dateLabel} a las ${timeLabel}`
  }

  function resolveReservationPaymentStartAt(reservation = null, paymentAvailability = null) {
    const explicitSchedule = String(paymentAvailability?.schedule?.start_at || '').trim()
    if (explicitSchedule) return explicitSchedule

    const holdSchedule = String(
      paymentAvailability?.hold?.start_at ||
        reservation?.frontend_state?.aircraft_hold?.start_at ||
        reservation?.frontend_state?.aircraft_hold?.starts_at ||
        '',
    ).trim()
    if (holdSchedule) return holdSchedule

    const reservationDate = String(
      reservation?.date ||
        reservation?.departure_datetime ||
        reservation?.legs?.[0]?.departure_datetime ||
        '',
    ).trim()
    if (reservationDate) return reservationDate

    const requirementDate = String(reservation?.requirements?.[0]?.date || '').trim()
    if (!requirementDate) return ''

    const requirementTime = String(
      reservation?.requirements?.[0]?.time || reservation?.departure_time || '09:00',
    ).trim()

    return `${requirementDate}T${requirementTime}`
  }

  function persistReservationCheckoutContext(context = {}) {
    if (!canUseCheckoutContextStorage()) return

    window.sessionStorage.setItem(
      CLIENT_RESERVATION_CHECKOUT_CONTEXT_KEY,
      JSON.stringify({
        routeId: String(context.routeId || '').trim(),
        reservationId: String(context.reservationId || '').trim(),
        flightRequestId: String(context.flightRequestId || '').trim(),
        checkoutSessionId: String(context.checkoutSessionId || '').trim(),
        aircraftHold:
          context.aircraftHold && typeof context.aircraftHold === 'object'
            ? context.aircraftHold
            : null,
        reservation:
          context.reservation && typeof context.reservation === 'object'
            ? context.reservation
            : null,
        savedAt: new Date().toISOString(),
      }),
    )
  }

  function readReservationCheckoutContext() {
    if (!canUseCheckoutContextStorage()) return null

    const rawSnapshot = window.sessionStorage.getItem(CLIENT_RESERVATION_CHECKOUT_CONTEXT_KEY)
    if (!rawSnapshot) return null

    try {
      const snapshot = JSON.parse(rawSnapshot)
      return snapshot && typeof snapshot === 'object' ? snapshot : null
    } catch {
      window.sessionStorage.removeItem(CLIENT_RESERVATION_CHECKOUT_CONTEXT_KEY)
      return null
    }
  }

  function clearReservationCheckoutContext() {
    if (!canUseCheckoutContextStorage()) return
    window.sessionStorage.removeItem(CLIENT_RESERVATION_CHECKOUT_CONTEXT_KEY)
  }

  function buildQuoteQueryKey(payload = {}) {
    const legs = Array.isArray(payload?.legs)
      ? payload.legs.map((leg) => ({
          origin: String(leg?.origin || '').trim(),
          destination: String(leg?.destination || '').trim(),
          date: String(leg?.date || '').trim(),
          time: String(leg?.time || '').trim(),
        }))
      : []

    return JSON.stringify({
      trip_type: String(payload?.trip_type || '').trim(),
      trip_label: String(payload?.trip_label || '').trim(),
      passengers: Number(payload?.passengers || 0),
      priority_type: String(payload?.priority_type || '').trim(),
      flight_package: String(payload?.flight_package || '').trim(),
      flight_base_source: String(payload?.flight_base_source || '').trim(),
      legs,
    })
  }

  function normalizeQuotePreviewPayload(payload = {}) {
    if (!payload || typeof payload !== 'object') return {}

    return {
      ...payload,
      flight_base_source:
        String(payload.flight_base_source || '').trim().toLowerCase() === 'billable_hours'
          ? 'pricing_trip_hours'
          : String(payload.flight_base_source || 'pricing_trip_hours').trim(),
    }
  }

  function persistQuotePreview() {
    if (!canUseQuoteStorage()) return

    if (!submittedItinerary.value || !submittedQuotePayload.value) {
      window.sessionStorage.removeItem(CLIENT_QUOTES_CACHE_KEY)
      return
    }

    window.sessionStorage.setItem(
      CLIENT_QUOTES_CACHE_KEY,
      JSON.stringify({
        tripType: tripType.value,
        selectedPriorityType: selectedPriorityType.value,
        submittedItinerary: submittedItinerary.value,
        submittedQuotePayload: submittedQuotePayload.value,
        queryKey: buildQuoteQueryKey(submittedQuotePayload.value),
        savedAt: new Date().toISOString(),
      }),
    )
  }

  function clearQuotePreviewState() {
    quoteResultsVisible.value = false
    submittedItinerary.value = null
    submittedQuotePayload.value = null
    aircraftOptions.value = []
    serverSearchError.value = ''
    clearAircraftSidebarFilters()

    if (canUseQuoteStorage()) {
      window.sessionStorage.removeItem(CLIENT_QUOTES_CACHE_KEY)
    }
  }

  function restoreQuotePreview() {
    if (!canUseQuoteStorage()) return
    window.sessionStorage.removeItem(LEGACY_CLIENT_QUOTES_CACHE_KEY)
    if (submittedItinerary.value || submittedQuotePayload.value || aircraftOptions.value.length)
      return

    const rawSnapshot = window.sessionStorage.getItem(CLIENT_QUOTES_CACHE_KEY)
    if (!rawSnapshot) return

    try {
      const snapshot = JSON.parse(rawSnapshot)

      if (!snapshot || typeof snapshot !== 'object') return

      if (typeof snapshot.tripType === 'string' && snapshot.tripType.trim()) {
        tripType.value = snapshot.tripType
      }

      if (
        typeof snapshot.selectedPriorityType === 'string' &&
        snapshot.selectedPriorityType.trim()
      ) {
        selectedPriorityType.value = snapshot.selectedPriorityType
      }

      if (snapshot.submittedItinerary && typeof snapshot.submittedItinerary === 'object') {
        submittedItinerary.value = snapshot.submittedItinerary
      }

      if (snapshot.submittedQuotePayload && typeof snapshot.submittedQuotePayload === 'object') {
        submittedQuotePayload.value = normalizeQuotePreviewPayload(snapshot.submittedQuotePayload)
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
      backgroundImage: 'linear-gradient(135deg, rgba(15, 23, 42, 0.24), rgba(15, 23, 42, 0.08))',
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

  function formatDetailedCurrencyByCode(value, currency = 'USD', maximumFractionDigits = 2) {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: String(currency || 'USD').toUpperCase(),
      maximumFractionDigits,
      minimumFractionDigits: maximumFractionDigits > 0 ? 2 : 0,
    }).format(Number(value || 0))
  }

  async function sendPaymentInvoiceNotification({ reservationId = '', paymentIntentId = '' } = {}) {
    const endpoint = 'https://redskyg.com/renta/send_payment_invoice.php'
    const formData = new FormData()
    const summary = activeItinerarySummary.value || {}

    formData.append(
      'reservation_id',
      String(reservationId || reservationContextId.value || '').trim(),
    )
    formData.append(
      'flight_request_id',
      String(flightRequestContextId.value || reservationId || '').trim(),
    )
    formData.append(
      'payment_intent_id',
      String(paymentIntentId || paymentLastReference.value || '').trim(),
    )
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

  function destroyStripePaymentElement() {
    stripeViewContext = ''
    paymentCardBrand.value = ''
  }

  function resultDisplayPrice(value = 0) {
    return formatCurrency(Number(value || 0) + RESULTS_SURCHARGE_USD)
  }

  function normalizePriorityCode(value = '') {
    return normalizePackageCode(value)
  }

  function airportHeadlineLabel(code = '', airport = null) {
    const normalizedCode = String(code || airport?.code || airport?.iata || '')
      .trim()
      .toUpperCase()

    const resolvedAirport = resolveAirportSelection(code, airport)
    const city =
      resolvedAirport?.city ||
      resolvedAirport?.name ||
      airport?.city ||
      airport?.name ||
      airportDisplayName(normalizedCode)

    const resolvedCode = String(
      resolvedAirport?.code ||
        resolvedAirport?.iata ||
        airport?.code ||
        airport?.iata ||
        normalizedCode,
    )
      .trim()
      .toUpperCase()

    if (city && resolvedCode) return `${city} (${resolvedCode})`
    if (city) return city
    return resolvedCode || 'Ruta por confirmar'
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
    const firstOrigin = airportHeadlineLabel(firstLeg.origin, firstLeg.originAirport)
    const firstDestination = airportHeadlineLabel(firstLeg.destination, firstLeg.destinationAirport)
    const lastDestination = airportHeadlineLabel(lastLeg.destination, lastLeg.destinationAirport)

    if (tripType === 'Redondo' && firstOrigin && firstDestination) {
      return `${firstOrigin} → ${firstDestination} → ${firstOrigin}`
    }

    if (tripType === 'Multi-destino') {
      const routeStops = legs.reduce((stops, leg, index) => {
        const origin = airportHeadlineLabel(leg.origin, leg.originAirport)
        const destination = airportHeadlineLabel(leg.destination, leg.destinationAirport)

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
    const pricing = getOfficialPricing(aircraft)
    return Number(aircraft.distance_km || pricing.distance_km || 0)
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
      const backendOperationalHours = getOfficialOperationalFlightHours(aircraft, Number.NaN)
      if (Number.isFinite(backendOperationalHours) && backendOperationalHours > 0) {
        return backendOperationalHours
      }
    }

    return 0
  }

  function aircraftDisplayFlightHours(aircraft = {}, includeRepositioning = false) {
    if (hasBackendQuotedPricing(aircraft)) {
      const explicitDisplayHours = getOfficialDisplayRouteHours(aircraft, Number.NaN)
      const repositioningHours = includeRepositioning
        ? Number(aircraft.repositioning_hours || 0)
        : 0

      if (Number.isFinite(explicitDisplayHours) && explicitDisplayHours > 0) {
        return explicitDisplayHours + repositioningHours
      }
    }

    return 0
  }

  function aircraftTimeValue(aircraft) {
    const explicitHours = aircraftDisplayFlightHours(aircraft)
    if (explicitHours) return explicitHours

    const formattedOfficialTime = formatOfficialDisplayTime(aircraft, '')
    if (!formattedOfficialTime) return Number.MAX_SAFE_INTEGER

    const hours = Number(formattedOfficialTime.match(/(\d+(?:\.\d+)?)\s*h/i)?.[1] || 0)
    const minutes = Number(formattedOfficialTime.match(/(\d+(?:\.\d+)?)\s*min/i)?.[1] || 0)
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

    if (wholeHours && minutes) return `${wholeHours} h ${String(minutes).padStart(2, '0')} min`
    if (wholeHours) return `${wholeHours} h`
    return `${minutes} min`
  }

  function normalizeDurationText(value = '') {
    const raw = String(value || '').trim()
    if (!raw) return ''

    const hhmmMatch = raw.match(/^(\d{1,2}):(\d{1,2})$/)
    if (hhmmMatch) {
      const hours = Number(hhmmMatch[1] || 0)
      const minutes = Number(hhmmMatch[2] || 0)
      if (Number.isFinite(hours) && Number.isFinite(minutes) && minutes >= 0 && minutes < 60) {
        return `${hours} h ${String(minutes).padStart(2, '0')} min`
      }
    }

    const compactMatch = raw
      .toLowerCase()
      .replaceAll(/\s+/g, ' ')
      .match(/^(\d+)\s*h(?:\s*(\d{1,2})\s*(?:m|min))?$/i)
    if (compactMatch) {
      const hours = Number(compactMatch[1] || 0)
      const minutes = Number(compactMatch[2] || 0)
      if (Number.isFinite(hours) && Number.isFinite(minutes) && minutes >= 0 && minutes < 60) {
        return `${hours} h ${String(minutes).padStart(2, '0')} min`
      }
    }

    return raw
  }

  function resolveAircraftCardBillableHours(aircraft = {}) {
    const pricingBreakdownBillableHours = Number(aircraft?.pricing_breakdown?.billable_hours || 0)
    if (Number.isFinite(pricingBreakdownBillableHours) && pricingBreakdownBillableHours > 0) {
      return {
        source: 'pricing_breakdown.billable_hours',
        hours: pricingBreakdownBillableHours,
      }
    }

    const topLevelBillableHours = Number(aircraft?.billable_hours || 0)
    if (Number.isFinite(topLevelBillableHours) && topLevelBillableHours > 0) {
      return {
        source: 'billable_hours',
        hours: topLevelBillableHours,
      }
    }

    return {
      source: 'default_zero',
      hours: 0,
    }
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

  function resolveAircraftVisibleDuration(aircraft = {}) {
    const preferredVisibleHours = getOfficialDisplayRouteHours(aircraft, Number.NaN)
    if (Number.isFinite(preferredVisibleHours) && preferredVisibleHours > 0) {
      return {
        source: 'preferred_visible_hours',
        formattedTime: formatDurationFromHours(preferredVisibleHours),
      }
    }

    const explicitText = normalizeDurationText(formatOfficialDisplayTime(aircraft, ''))
    if (explicitText) {
      return {
        source: 'visible_time_text',
        formattedTime: explicitText,
      }
    }

    return {
      source: 'default_zero',
      formattedTime: '0 h 00 min',
    }
  }

  function aircraftDurationLabel(aircraft = {}) {
    const resolved = resolveAircraftVisibleDuration(aircraft)

    return resolved.formattedTime
  }

  function aircraftPrimaryDurationLabel(aircraft = {}) {
    return aircraftDurationLabel(aircraft)
  }

  function aircraftBillingNote(aircraft = {}) {
    if (hasBackendQuotedPricing(aircraft)) return ''

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

  function aircraftBackendBillableHoursLabel(aircraft = {}) {
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

    const rawTime = String(firstLeg.time).trim()
    const match = rawTime.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i)
    if (!match) return `Salida ${rawTime}`

    let hour = Number(match[1])
    const minutes = match[2]
    const meridiem = String(match[3] || '').toUpperCase()
    if (meridiem === 'PM' && hour < 12) hour += 12
    if (meridiem === 'AM' && hour === 12) hour = 0
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return `Salida ${rawTime}`

    const displayHour = hour % 12 || 12
    return `Salida ${displayHour}:${minutes} ${hour >= 12 ? 'PM' : 'AM'}`
  }

  function aircraftSpeedLine(aircraft = {}, summary = {}) {
    const visibleDuration = resolveAircraftVisibleDuration(aircraft)
    const requestedDepartureTime = String(aircraft.requested_departure_time || '').trim()
    const selectedDepartureSummary = requestedDepartureTime
      ? { legs: [{ time: requestedDepartureTime }] }
      : Array.isArray(submittedQuotePayload.value?.legs)
        ? { legs: submittedQuotePayload.value.legs }
        : summary
    const renderedDeparture = itineraryDepartureLabel(selectedDepartureSummary)

    return `${visibleDuration.formattedTime} • ${renderedDeparture}`
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

  function resolveAircraftOfficialTotal(aircraft = {}) {
    return getOfficialTotalAmount(aircraft, 0)
  }

  function hasBackendQuotedPricing(aircraft = {}) {
    return hasOfficialQuotePricing(aircraft)
  }

  function aircraftPricingForType(aircraft = {}, priorityType = 'essential') {
    const priorityMeta = resolvePriorityOption(priorityType)
    if (hasBackendQuotedPricing(aircraft)) {
      const basePrice = Number(aircraft.base_price || 0)
      const operationalFees = resolveAircraftOperationalFees(aircraft)
      const officialTotal = resolveAircraftOfficialTotal(aircraft)
      const finalPrice =
        officialTotal ||
        basePrice + operationalFees
      const displayFlightHours = Number(
        aircraft.display_flight_hours ||
          aircraft.real_flight_hours ||
          aircraft.flight_hours ||
          aircraft.estimated_hours ||
          0,
      )
      const billableHours = Number(aircraft.billable_hours || 0)
      const overnightCost = Number(aircraft.overnight_cost || aircraft.overnight_fees || 0)
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

    const displayedPrice =
      resolveAircraftOfficialTotal(aircraft) || moneyValue(aircraft.final_price)
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
    if (reservationConfirmedRedirectTimer) {
      window.clearTimeout(reservationConfirmedRedirectTimer)
      reservationConfirmedRedirectTimer = null
    }
    if (['resultados', 'paquete-vuelo', 'aeronave', 'reserva'].includes(section)) {
      quoteResultsVisible.value = true
    } else {
      quoteResultsVisible.value = false
    }
    return router.push(
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

  function rememberConflictedAircraftId(aircraftId = '') {
    const normalizedAircraftId = String(aircraftId || '').trim()
    if (!normalizedAircraftId) return

    conflictedAircraftIds.value = [
      ...new Set([...conflictedAircraftIds.value, normalizedAircraftId]),
    ]
  }

  function resetAvailabilityConflictLoadingState() {
    signingContract.value = false
    paymentSubmitting.value = false
    paymentAvailabilityLoading.value = false
    searching.value = false
    reservingAircraftId.value = ''
    activeContractReservationBootstrapKey.value = ''
    reservationPaymentAvailabilityRequestPromise = null
  }

  function buildClientDetailLocation(section, id = '', subsection = '') {
    const normalizedSection = String(section || '').trim()
    const normalizedId = String(id || '').trim()
    const normalizedSubsection = String(subsection || '').trim()

    if (!normalizedSection) {
      return {
        name: 'cliente',
        params: { section: 'viajes' },
      }
    }

    if (!normalizedId) {
      return {
        name: 'cliente',
        params: { section: normalizedSection },
      }
    }

    if (normalizedSubsection) {
      return {
        name: 'cliente-subdetalle',
        params: { section: normalizedSection, id: normalizedId, subsection: normalizedSubsection },
      }
    }

    return {
      name: 'cliente-detalle',
      params: { section: normalizedSection, id: normalizedId },
    }
  }

  function resolveReservationExperienceSubsection(reservation = {}) {
    const workflowId = resolveWorkflowState(
      reservation?.workflow_status || reservation?.status || reservation?.booking_status || '',
    ).id

    if (['flight_confirmed', 'tracking_live'].includes(workflowId)) return 'tracking'
    if (workflowId === 'completed') return 'resumen'

    return ''
  }

  function goToReservationDetail(reservationId = '') {
    const targetReservation =
      findReservationRecordById(reservationId || reservationContextId.value) ||
      selectedReservation.value
    const targetId =
      resolveEntityIdentifier(targetReservation?.id) ||
      resolveEntityIdentifier(targetReservation?.flight_request_id) ||
      resolveEntityIdentifier(reservationId) ||
      resolveEntityIdentifier(reservationContextId.value)

    if (!targetId) {
      go('viajes')
      return
    }

    router.push(
      buildClientDetailLocation(
        'reserva-confirmada',
        targetId,
        resolveReservationExperienceSubsection(targetReservation || {}),
      ),
    )
  }

  async function startCommercialAccessCheckout({
    accessSource = auth.access?.commercial_access || auth.access,
    onErrorTitle = 'No se pudo activar el acceso comercial',
    syncStatusFirst = false,
    intent = 'checkout',
  } = {}) {
    if (isCreatingAccessCheckout.value) return false

    isCreatingAccessCheckout.value = true
    paymentInlineError.value = ''

    try {
      let resolvedAccessSource = accessSource

      if (syncStatusFirst) {
        const latestAccessStatus = await refreshCommercialAccessStatus({
          forceSessionRefresh: false,
        }).catch(() => null)
        resolvedAccessSource = latestAccessStatus?.access || resolvedAccessSource
      }

      const requiresPayment = requiresCommercialAccessPayment(resolvedAccessSource)
      if (!requiresPayment) {
        await auth.refreshSession({ force: true, preferCache: false }).catch(() => null)
        syncCommercialAccessState(auth.access?.commercial_access || auth.access)
        return false
      }

      const successUrl = buildReservationCheckoutReturnUrl('success')
      const cancelUrl = buildReservationCheckoutReturnUrl('cancelled')
      const contactEmail = resolveAuthenticatedContactEmail()

      if (!hasValidEmailAddress(contactEmail)) {
        paymentInlineError.value = 'Tu cuenta no tiene un correo electrónico válido.'
        ui.pushToast({
          tone: 'warning',
          title: 'Correo requerido',
          message: 'Tu cuenta no tiene un correo electrónico válido.',
        })
        return false
      }

      const requestPayload = {
        contact_email: contactEmail,
        intent,
        success_url: successUrl,
        cancel_url: cancelUrl,
        return_url: buildCommercialAccessReturnUrl(),
        successUrl,
        cancelUrl,
      }

      console.log('Access Payment Payload', JSON.stringify(requestPayload, null, 2))

      const payload = await createClientAccessCheckout(requestPayload, { timeoutMs: 30000 })

      const redirectUrl = resolveStripeCheckoutRedirectUrl(payload, { intent })
      const alreadyActive =
        payload?.already_active === true || payload?.data?.already_active === true
      const managementRequired =
        payload?.management_required === true || payload?.data?.management_required === true

      if (!redirectUrl && alreadyActive) {
        await auth.refreshSession({ force: true, preferCache: false }).catch(() => null)
        syncCommercialAccessState(payload?.access || auth.access?.commercial_access || auth.access)
        if (props.section === 'pago') {
          await router.replace({
            name: 'cliente',
            params: { section: 'reservar' },
          })
        }
        return false
      }

      if (!redirectUrl && managementRequired) {
        paymentInlineError.value =
          payload?.message ||
          payload?.data?.message ||
          'Tu suscripcion debe administrarse desde Facturacion o Metodo de pago.'
        ui.pushToast({
          tone: 'warning',
          title: 'Administra tu suscripcion',
          message: paymentInlineError.value,
        })
        return false
      }

      if (!redirectUrl) {
        throw new Error('No se recibio la URL de Stripe Checkout.')
      }

      if (isApiCheckoutCreationUrl(redirectUrl)) {
        throw new Error(
          'El backend devolvio el endpoint interno en lugar de la URL real de Stripe.',
        )
      }

      if (!isStripeHostedCheckoutUrl(redirectUrl)) {
        throw new Error('La URL recibida no corresponde a Stripe Checkout.')
      }

      redirectToExternalUrl(redirectUrl)
      return true
    } catch (error) {
      paymentInlineError.value = resolveValidationErrorMessage(
        error,
        'No fue posible iniciar el flujo de pago del acceso comercial.',
      )
      ui.pushToast({
        tone: 'error',
        title: onErrorTitle,
        message: paymentInlineError.value,
      })
      return false
    } finally {
      isCreatingAccessCheckout.value = false
    }
  }

  async function goToCommercialAccessPayment() {
    await router.push({
      name: 'cliente',
      params: { section: 'pago' },
      query: { accessPayment: '1' },
    })
  }

  function reservationActionLabel(aircraft = null) {
    if (aircraft && isReservingAircraft(aircraft)) return 'Reservando...'
    if (
      aircraft &&
      activeAircraftHoldSummary.value?.aircraftId &&
      String(activeAircraftHoldSummary.value.aircraftId) ===
        String(aircraft.aircraft_id || aircraft.id || '')
    ) {
      return 'Apartada para ti'
    }
    return canReserveFlights.value ? 'Reservar' : commercialAccessCtaLabel.value
  }

  function ensureCommercialAccessPaymentRouteEligibility() {
    if (!commercialAccessPaymentMode.value) return
    if (requiresCommercialAccessPayment(auth.access?.commercial_access || auth.access)) return

    router.replace({
      name: 'cliente',
      params: { section: 'reservar' },
    })
  }

  function alignReservationWorkflowRoute() {
    if (commercialAccessCheckoutReturnMode.value) return
    if (!needsReservationContext.value) return
    if (!hasReservationsLoaded.value) return

    const currentReservationId = String(routeId.value || '').trim()
    const currentSubsection = String(routeSubsection.value || '').trim()
    const fallbackReservationId =
      props.section === 'contrato' ? contractRouteContextId.value : reservationContextId.value
    const fallbackSubsection =
      props.section === 'reserva-confirmada'
        ? resolveReservationExperienceSubsection(selectedReservation.value || {})
        : ''

    if (
      currentReservationId &&
      selectedReservation.value &&
      currentReservationId === fallbackReservationId &&
      currentSubsection === fallbackSubsection
    )
      return

    if (!currentReservationId && fallbackReservationId) {
      router.replace(
        buildClientDetailLocation(props.section, fallbackReservationId, fallbackSubsection),
      )
      return
    }

    if (
      currentReservationId &&
      fallbackReservationId &&
      (currentReservationId !== fallbackReservationId || currentSubsection !== fallbackSubsection)
    ) {
      router.replace(
        buildClientDetailLocation(props.section, fallbackReservationId, fallbackSubsection),
      )
      return
    }

    if (currentReservationId && !selectedReservation.value) {
      if (fallbackReservationId) {
        router.replace(
          buildClientDetailLocation(props.section, fallbackReservationId, fallbackSubsection),
        )
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
    const targetReservation =
      findReservationRecordById(reservationId || reservationContextId.value) ||
      selectedReservation.value

    if (targetReservation?.frontend_state?.availability_conflict === true) {
      ui.pushToast({
        tone: 'warning',
        title: 'Disponibilidad actualizada',
        message:
          targetReservation?.frontend_state?.availability_conflict_message ||
          'Esta aeronave ya no esta disponible para continuar con el pago.',
      })
      go('reservar')
      return
    }

    if (!reservationQualifiesForCheckout(targetReservation)) {
      ui.pushToast({
        tone: 'warning',
        title: 'Pago aun no disponible',
        message:
          targetReservation?.frontend_state?.status_message ||
          selectedReservationFrontendState.value.status_message ||
          'Necesitamos confirmar la firma del contrato antes de abrir el pago.',
      })
      go('contrato', reservationId || reservationContextId.value)
      return
    }

    go('pago', reservationId || reservationContextId.value)
  }

  function goToConcierge(reservationId = '') {
    openConciergeDrawer({
      serviceId: reservationId ? 'modify' : selectedConciergeServiceId.value,
      serviceTitle: reservationId ? 'Modificar reserva' : selectedConciergeServiceTitle.value,
    })
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

  function normalizeRouteQueryValue(value) {
    if (Array.isArray(value)) {
      return String(value[0] || '').trim()
    }

    return String(value || '').trim()
  }

  function buildAbsoluteClientRoute(location = {}) {
    const baseUrl = window.location.origin || ''
    const canResolveRoute = router && typeof router.resolve === 'function'

    if (canResolveRoute) {
      const resolvedRoute = router.resolve(location)
      return new URL(resolvedRoute.href, baseUrl).toString()
    }

    const section = String(location?.params?.section || 'reservar').trim()
    const id = String(location?.params?.id || '').trim()
    const path = id ? `/cliente/${section}/${id}` : `/cliente/${section}`
    const searchParams = new URLSearchParams()

    Object.entries(location?.query || {}).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') return
      searchParams.set(key, String(value))
    })

    const queryString = searchParams.toString()
    return new URL(queryString ? `${path}?${queryString}` : path, baseUrl).toString()
  }

  function buildCommercialAccessReturnUrl() {
    return buildAbsoluteClientRoute({
      name: 'cliente',
      params: { section: 'perfil' },
    })
  }

  function buildReservationCheckoutReturnUrl(checkoutState = 'success', reservationId = '') {
    const targetId = String(
      reservationId || reservationContextId.value || flightRequestContextId.value || '',
    ).trim()
    return buildAbsoluteClientRoute({
      name: targetId ? 'cliente-detalle' : 'cliente',
      params: targetId ? { section: 'pago', id: targetId } : { section: 'pago' },
      query: {
        checkout: checkoutState,
      },
    })
  }

  function escapeHtml(value = '') {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
  }

  function maskEmailAddress(value = '') {
    const normalized = String(value || '').trim()
    const [localPart = '', domainPart = ''] = normalized.split('@')
    if (!localPart || !domainPart) return normalized || 'No disponible'
    if (localPart.length <= 2) return `${localPart.charAt(0) || '*'}***@${domainPart}`
    return `${localPart.slice(0, 2)}***${localPart.slice(-1)}@${domainPart}`
  }

  function sanitizeDocumentNamePart(value = '') {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s-]/g, ' ')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
  }

  function assistedOrderPaymentStatusMeta(value = '') {
    const normalized = String(value || '')
      .trim()
      .toLowerCase()
    if (['paid', 'pagado'].includes(normalized)) {
      return { label: 'Pagado', tone: 'paid' }
    }
    if (['pending_manual_validation', 'en revision', 'en revisión'].includes(normalized)) {
      return { label: 'En revisión', tone: 'review' }
    }
    if (['rejected', 'rechazado'].includes(normalized)) {
      return { label: 'Rechazado', tone: 'rejected' }
    }
    return { label: 'Pendiente', tone: 'pending' }
  }

  function resolveAssistedOrderPaymentMethod(reservation = {}) {
    return String(
      reservation?.payment_method ||
        reservation?.paymentMethod ||
        reservation?.payment_order?.payment_method ||
        reservation?.payment_order?.method ||
        selectedPaymentMethod.value ||
        'assisted_cash',
    )
      .trim()
      .toLowerCase()
  }

  function formatIssueDateTime(value = new Date()) {
    const parsed = value instanceof Date ? value : new Date(value)
    if (!Number.isFinite(parsed.getTime())) return 'Por confirmar'

    return new Intl.DateTimeFormat('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(parsed)
  }

  function buildPaymentMethodSectionMarkup(reservation = {}) {
    const paymentOrder = reservation?.payment_order || {}
    const paymentMethod = resolveAssistedOrderPaymentMethod(reservation)
    const checkoutUrl = String(
      paymentOrder?.checkout_url || paymentOrder?.checkoutUrl || reservation?.checkout_url || '',
    ).trim()

    if (paymentMethod === 'stripe') {
      return `
      <div class="method-box">
        <h3>Método de pago</h3>
        <p>Stripe seguro</p>
        ${checkoutUrl ? `<a class="method-link" href="${escapeHtml(checkoutUrl)}" target="_blank" rel="noreferrer">Abrir link de pago</a>` : '<p class="muted">El link de pago estará disponible al confirmar la orden.</p>'}
      </div>
    `
    }

    if (
      paymentMethod === 'wire' ||
      paymentMethod === 'transfer' ||
      paymentMethod === 'transferencia'
    ) {
      return `
      <div class="method-box">
        <h3>Método de pago</h3>
        <p>Transferencia bancaria</p>
        <div class="method-grid">
          <div><span>Banco</span><strong>${escapeHtml(paymentOrder?.bank_name || 'Por configurar')}</strong></div>
          <div><span>Cuenta</span><strong>${escapeHtml(paymentOrder?.account_number || paymentOrder?.iban || 'Por configurar')}</strong></div>
          <div><span>CLABE</span><strong>${escapeHtml(paymentOrder?.clabe || paymentOrder?.swift || 'Por configurar')}</strong></div>
          <div><span>Concepto</span><strong>${escapeHtml(paymentOrder?.concept || paymentOrder?.reference || paymentLastReference.value || 'Pendiente')}</strong></div>
        </div>
      </div>
    `
    }

    return `
    <div class="method-box">
      <h3>Método de pago</h3>
      <p>Efectivo / pago asistido</p>
      <p class="muted">Este flujo no muestra datos bancarios. El pago se valida con comprobante y revisión administrativa.</p>
    </div>
  `
  }

  function buildAssistedOrderEmailUrl() {
    const reservation = selectedReservation.value || {}
    const orderReference =
      paymentLastReference.value ||
      String(
        reservation?.payment_order?.reference ||
          reservation?.flight_request_id ||
          reservation?.id ||
          '',
      )
    const subject = `SKY Group · Orden de pago asistido ${orderReference || reservationContextId.value || ''}`
    const body = [
      'Comparto la orden de pago asistido de tu reserva SKY Group.',
      '',
      `Reserva: ${reservationContextId.value || 'N/D'}`,
      `Referencia: ${orderReference || 'Pendiente'}`,
      `Ruta: ${paymentRouteHeadline.value}`,
      `Fecha de salida: ${paymentDateLabel.value}`,
      `Total: ${paymentSummaryAmountLabel.value}`,
      '',
      'Conserva el comprobante y súbelo para validación manual.',
    ].join('\n')

    return `mailto:${encodeURIComponent(paymentForm.contactEmail.trim() || customerEmail.value)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  function buildAssistedOrderDocumentName() {
    const reservation = selectedReservation.value || {}
    const orderReference =
      paymentLastReference.value ||
      String(
        reservation?.payment_order?.reference ||
          reservation?.flight_request_id ||
          reservation?.id ||
          '',
      )
    const routeLabel = sanitizeDocumentNamePart(paymentRouteHeadline.value || 'ruta')
    const aircraftLabel = sanitizeDocumentNamePart(
      reservation?.aircraft ||
        reservation?.assigned_aircraft_model ||
        reservation?.aircraft_model ||
        'aeronave',
    )
    const referenceLabel = sanitizeDocumentNamePart(
      orderReference || reservationContextId.value || 'sin_referencia',
    )

    return `SKY_Group_Orden_Pago_${routeLabel}_${aircraftLabel}_${referenceLabel}`
  }

  function buildAssistedPaymentOrderMarkup() {
    const reservation = selectedReservation.value || {}
    const summary = activeItinerarySummary.value || {}
    const paymentOrder = reservation?.payment_order || {}
    const breakdown = paymentBreakdownAmountMap.value
    const flightCost = Number(breakdown.flight_cost || reservation.flight_cost || 0)
    const administrativeFee = Number(
      breakdown.administrative_fee || reservation.administrative_fee || 0,
    )
    const totalAmount = Number(
      paymentBreakdownTotalValue.value || flightCost + administrativeFee || 0,
    )
    const currency = 'USD'
    const orderReference =
      paymentLastReference.value ||
      String(
        reservation?.payment_order?.reference ||
          reservation?.flight_request_id ||
          reservation?.id ||
          '',
      )
    const statusMeta = assistedOrderPaymentStatusMeta(
      reservation?.payment_status || paymentOrder?.status || 'pending_manual_payment',
    )
    const issueDate = formatIssueDateTime(new Date())
    const tripTypeLabel = String(summary?.tripType || summary?.trip_type || 'Vuelo privado').trim()
    const aircraftLabel = String(
      reservation?.aircraft ||
        reservation?.assigned_aircraft_model ||
        reservation?.aircraft_model ||
        '',
    ).trim()
    const passengerLabel = String(paymentReservationPassengerCount.value || 1)
    const customerName = escapeHtml(customerDisplayName.value)
    const customerEmailMasked = escapeHtml(
      maskEmailAddress(paymentForm.contactEmail.trim() || customerEmail.value),
    )
    const paymentMethodMarkup = buildPaymentMethodSectionMarkup(reservation)
    const mailtoUrl = buildAssistedOrderEmailUrl()
    const documentName = buildAssistedOrderDocumentName()
    const logoUrl = `${window.location.origin}${import.meta.env.BASE_URL || '/'}logo.png`

    return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(documentName)}</title>
    <style>
      @page { size: A4; margin: 12mm; }
      * { box-sizing: border-box; }
      :root {
        --sky-ink: #171717;
        --sky-gold: #a67c28;
        --sky-gold-soft: #efe2c2;
        --sky-cream: #fbf7ef;
        --sky-sand: #eadfcf;
        --sky-muted: #655d52;
        --sky-line: #e7d7b9;
      }
      html, body { margin: 0; padding: 0; background: linear-gradient(180deg, #f7f1e7 0%, #efe7d9 100%); color: var(--sky-ink); font-family: "Helvetica Neue", Arial, sans-serif; }
      body { padding: 24px; }
      .toolbar { max-width: 920px; margin: 0 auto 16px; display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; }
      .toolbar button, .toolbar a {
        border: 0; border-radius: 999px; padding: 12px 18px; background: var(--sky-ink); color: #fff;
        text-decoration: none; font-size: 14px; font-weight: 700; cursor: pointer;
      }
      .toolbar .ghost { background: rgba(255,255,255,0.88); color: var(--sky-ink); border: 1px solid #ddd1be; }
      .sheet {
        max-width: 920px; margin: 0 auto; background: linear-gradient(180deg, #fffefb 0%, #fffaf3 100%);
        border: 1px solid #e4d7c5; border-radius: 28px; padding: 34px;
        box-shadow: 0 18px 50px rgba(20, 20, 20, 0.06);
        position: relative; overflow: hidden;
      }
      .sheet::before {
        content: ""; position: absolute; inset: 0 0 auto 0; height: 8px;
        background: linear-gradient(90deg, #171717 0%, #5e4b21 45%, #b58a2d 100%);
      }
      .hero {
        display: flex; flex-wrap: wrap; gap: 18px; justify-content: space-between; align-items: center;
        margin: -6px -6px 24px; padding: 18px 20px; border-radius: 22px;
        background: radial-gradient(circle at top left, rgba(181,138,45,0.18), transparent 45%), linear-gradient(135deg, #fffdfa 0%, #f7f0e3 100%);
        border: 1px solid rgba(181, 138, 45, 0.22);
      }
      .hero-brand { display: flex; align-items: center; gap: 16px; }
      .hero-brand img { width: 118px; height: auto; display: block; }
      .hero-brand-copy { display: grid; gap: 6px; }
      .hero-brand-copy strong { font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--sky-gold); }
      .hero-brand-copy span { color: var(--sky-muted); font-size: 14px; }
      .header { display: flex; flex-wrap: wrap; gap: 18px; justify-content: space-between; align-items: flex-start; }
      .brand { display: grid; gap: 8px; }
      .brand small, .meta-label, .section-label { color: #8d7e6b; text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px; font-weight: 800; }
      .brand h1 { margin: 0; font-size: 34px; line-height: 1.05; }
      .brand p { margin: 0; color: #5f564b; font-size: 16px; max-width: 620px; }
      .header-side { display: grid; gap: 12px; min-width: 260px; }
      .status-badge {
        justify-self: end; padding: 10px 14px; border-radius: 999px; font-size: 13px; font-weight: 800;
        background: #fff6dc; color: #9c6b00; border: 1px solid rgba(166,124,40,0.22);
      }
      .status-badge.review { background: #eef5ff; color: #245bb2; }
      .status-badge.paid { background: #ebf8ef; color: #217a44; }
      .status-badge.rejected { background: #fdeceb; color: #b63a36; }
      .meta-grid, .flight-grid, .method-grid {
        display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 24px;
      }
      .panel {
        border: 1px solid var(--sky-sand); border-radius: 18px; padding: 16px 18px; background: rgba(255,255,255,0.86);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.75);
      }
      .panel strong, .metric strong { display: block; font-size: 18px; margin-top: 6px; }
      .panel p, .method-box p, .instructions li { margin: 0; color: #4d473f; line-height: 1.5; }
      .section { margin-top: 28px; }
      .section h2 { margin: 0 0 14px; font-size: 18px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 14px 0; border-bottom: 1px solid #eee3d3; font-size: 16px; }
      td:last-child, th:last-child { text-align: right; font-weight: 700; }
      .total-box {
        margin-top: 16px; border-radius: 18px; background: linear-gradient(135deg, rgba(166,124,40,0.14), rgba(255,250,240,0.96));
        border: 1px solid var(--sky-line); padding: 18px 20px; display: flex; justify-content: space-between; gap: 16px; align-items: center;
      }
      .total-box span { color: #7d6d58; text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px; font-weight: 800; }
      .total-box strong { font-size: 30px; color: var(--sky-ink); }
      .instructions { margin: 0; padding-left: 20px; display: grid; gap: 10px; }
      .method-box {
        margin-top: 24px; border: 1px solid var(--sky-sand); border-radius: 18px; padding: 18px; background: rgba(255,255,255,0.88);
      }
      .method-box h3 { margin: 0 0 10px; font-size: 16px; }
      .method-link { display: inline-flex; margin-top: 6px; color: var(--sky-ink); font-weight: 700; }
      .footer-note { margin-top: 24px; color: #6a6155; font-size: 13px; line-height: 1.55; padding-top: 16px; border-top: 1px solid rgba(166,124,40,0.16); }
      .metric { display: grid; gap: 4px; }
      .muted { color: #6a6155; }
      @media (max-width: 720px) {
        body { padding: 14px; }
        .sheet { padding: 22px; border-radius: 22px; }
        .hero { padding: 16px; }
        .hero-brand { align-items: flex-start; }
        .hero-brand img { width: 96px; }
        .meta-grid, .flight-grid, .method-grid { grid-template-columns: 1fr; }
        .status-badge { justify-self: start; }
        .total-box { align-items: flex-start; flex-direction: column; }
      }
      @media print {
        html, body { background: #fff; }
        body { padding: 0; }
        .toolbar { display: none !important; }
        .sheet { box-shadow: none; border-radius: 0; border: 0; max-width: none; padding: 0; }
        .hero { border: 1px solid rgba(166,124,40,0.18); }
        a { color: inherit; text-decoration: none; }
      }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <button onclick="window.print()">Descargar PDF</button>
      <a class="ghost" href="${escapeHtml(mailtoUrl)}">Enviar por correo</a>
      <button class="ghost" onclick="window.close()">Cerrar vista</button>
    </div>
    <section class="sheet">
      <section class="hero">
        <div class="hero-brand">
          <img src="${escapeHtml(logoUrl)}" alt="SKY Group" />
          <div class="hero-brand-copy">
            <strong>SKY Group</strong>
            <span>Documento oficial de referencia comercial</span>
          </div>
        </div>
        <span class="status-badge ${statusMeta.tone}">Estado del pago: ${escapeHtml(statusMeta.label)}</span>
      </section>

      <header class="header">
        <div class="brand">
          <small>Orden asistida</small>
          <h1>Orden de pago asistido</h1>
          <p>Documento de referencia para pago manual sujeto a validación administrativa.</p>
        </div>
        <div class="header-side">
          <div class="panel">
            <div class="metric"><span class="meta-label">Reserva</span><strong>#${escapeHtml(reservationContextId.value || 'N/D')}</strong></div>
            <div class="metric"><span class="meta-label">Referencia</span><strong>#${escapeHtml(orderReference || 'Pendiente')}</strong></div>
            <div class="metric"><span class="meta-label">Fecha de emisión</span><strong>${escapeHtml(issueDate)}</strong></div>
          </div>
        </div>
      </header>

      <section class="meta-grid">
        <article class="panel">
          <span class="section-label">Cliente</span>
          <strong>${customerName}</strong>
        </article>
        <article class="panel">
          <span class="section-label">Correo</span>
          <strong>${customerEmailMasked}</strong>
        </article>
      </section>

      <section class="section">
        <h2>Detalle del vuelo</h2>
        <div class="flight-grid">
          <article class="panel"><span class="section-label">Ruta</span><strong>${escapeHtml(paymentRouteHeadline.value)}</strong></article>
          <article class="panel"><span class="section-label">Fecha y hora de salida</span><strong>${escapeHtml(paymentDateLabel.value)}</strong></article>
          <article class="panel"><span class="section-label">Tipo de vuelo</span><strong>${escapeHtml(tripTypeLabel || 'Vuelo privado')}</strong></article>
          <article class="panel"><span class="section-label">Pasajeros</span><strong>${escapeHtml(passengerLabel)}</strong></article>
          ${aircraftLabel ? `<article class="panel"><span class="section-label">Aeronave</span><strong>${escapeHtml(aircraftLabel)}</strong></article>` : ''}
        </div>
      </section>

      <section class="section">
        <h2>Resumen de costos</h2>
        <table>
          <tbody>
            <tr><td>Flight cost</td><td>${formatDetailedCurrencyByCode(flightCost, currency)}</td></tr>
            <tr><td>Administrative fee</td><td>${formatDetailedCurrencyByCode(administrativeFee, currency)}</td></tr>
          </tbody>
        </table>
        <div class="total-box">
          <div>
            <span>Total amount</span>
            <p class="muted">Importe total a validar en USD.</p>
          </div>
          <strong>${formatDetailedCurrencyByCode(totalAmount, currency)}</strong>
        </div>
      </section>

      <section class="section">
        <h2>Instrucciones de pago</h2>
        <ol class="instructions">
          <li>Realiza el pago correspondiente a esta orden.</li>
          <li>Conserva el comprobante de pago.</li>
          <li>Sube el comprobante para validación manual.</li>
          <li>El pago será revisado por administración antes de liberar el siguiente paso de la reserva.</li>
        </ol>
      </section>

      <section class="section">
        ${paymentMethodMarkup}
      </section>

      <p class="footer-note">
        Este documento resume la orden de pago asistido de SKY Group. Por seguridad solo se muestran datos mínimos del cliente.
        La validación final depende del comprobante y de la revisión administrativa.
      </p>
    </section>
  </body>
</html>`
  }

  function handleGenerateAssistedPaymentOrderPdf() {
    const html = buildAssistedPaymentOrderMarkup()
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const documentUrl = URL.createObjectURL(blob)
    const orderWindow = window.open(
      documentUrl,
      '_blank',
      'noopener,noreferrer,width=960,height=720',
    )
    if (!orderWindow) {
      paymentInlineError.value = 'Tu navegador bloqueo la ventana para generar la orden de pago.'
      URL.revokeObjectURL(documentUrl)
      return
    }

    try {
      paymentInlineError.value = ''
      window.setTimeout(() => {
        URL.revokeObjectURL(documentUrl)
      }, 60000)
    } catch (error) {
      console.error('No se pudo generar la orden de pago PDF', error)
      orderWindow.close()
      URL.revokeObjectURL(documentUrl)
      paymentInlineError.value =
        'No fue posible generar la orden de pago PDF en esta ventana. Intenta de nuevo.'
    }
  }

  function handleSendAssistedPaymentOrderEmail() {
    window.location.href = buildAssistedOrderEmailUrl()
  }

  function handleAssistedPaymentProofSelection(event) {
    const file = event?.target?.files?.[0] || null
    assistedPaymentProofFile.value = file
    assistedPaymentProofName.value = file?.name || ''
  }

  function delay(ms = 1000) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms)
    })
  }

  function startAircraftHoldCountdown() {
    if (aircraftHoldCountdownTimer || typeof window === 'undefined') return

    aircraftHoldCountdownTimer = window.setInterval(() => {
      holdCountdownNow.value = Date.now()
    }, 1000)
  }

  function clearAircraftHoldCountdown() {
    if (!aircraftHoldCountdownTimer || typeof window === 'undefined') return
    window.clearInterval(aircraftHoldCountdownTimer)
    aircraftHoldCountdownTimer = null
  }

  async function handleAircraftHoldExpiration() {
    if (!aircraftHold.value?.hold_id) return

    const expiredHold = aircraftHold.value
    setAircraftHold(null)
    clearReservationCheckoutContext()

    if (expiredHold.hold_id) {
      await releaseClientAircraftHold(expiredHold.hold_id, {
        quote_id: expiredHold.quote_id || undefined,
        reservation_id: expiredHold.reservation_id || undefined,
        flight_request_id: expiredHold.flight_request_id || undefined,
        reason: 'expired',
      }).catch(() => null)
    }

    serverSearchError.value =
      'La retencion expiro. Verificaremos nuevamente la disponibilidad para mostrarte opciones vigentes.'
    ui.pushToast({
      tone: 'warning',
      title: 'Retencion vencida',
      message: serverSearchError.value,
    })

    if (submittedQuotePayload.value) {
      await refreshSearchResults({ silent: true }).catch(() => null)
      go('resultados')
    }
  }

  function clearReservationConfirmedRedirectTimer() {
    if (reservationConfirmedRedirectTimer) {
      window.clearTimeout(reservationConfirmedRedirectTimer)
      reservationConfirmedRedirectTimer = null
    }
  }

  function scheduleReservationConfirmedRedirect() {
    clearReservationConfirmedRedirectTimer()

    if (props.section !== 'reserva-confirmada') return
    if (!canRenderReservationWorkflow.value) return
    if (routeSubsection.value) return

    const currentWorkflowId = resolveWorkflowState(
      selectedReservation.value?.workflow_status ||
        selectedReservation.value?.status ||
        selectedReservation.value?.booking_status ||
        '',
    ).id

    if (
      ['payment_confirmed', 'flight_confirmed', 'tracking_live', 'completed'].includes(
        currentWorkflowId,
      )
    ) {
      return
    }

    reservationConfirmedRedirectTimer = window.setTimeout(() => {
      reservationConfirmedRedirectTimer = null
      go('viajes', reservationContextId.value)
    }, 2500)
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
      String(syncedFrontendState.docusign_status || '')
        .trim()
        .toLowerCase() === 'completed'

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
      ...(persistedReadyForPaymentReservation &&
      typeof persistedReadyForPaymentReservation === 'object'
        ? persistedReadyForPaymentReservation
        : {}),
      id: String(currentReservation.id || reservationId).trim(),
      is_reservation: true,
      updated_at: new Date().toISOString(),
      contract:
        currentReservation.contract || contractId
          ? {
              ...currentReservation.contract,
              ...(contractStatusPayload?.contract &&
              typeof contractStatusPayload.contract === 'object'
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

  async function finalizeCommercialAccessCheckoutReturn() {
    const checkoutState = normalizeRouteQueryValue(route.query.checkout).toLowerCase()
    const rawSessionId = normalizeRouteQueryValue(
      route.query.session_id || route.query.checkout_session_id,
    )
    const sessionId =
      rawSessionId && !rawSessionId.includes('CHECKOUT_SESSION_ID') && !/[{}]/.test(rawSessionId)
        ? rawSessionId
        : ''

    if (!checkoutState) return
    if (!commercialAccessCheckoutReturnMode.value) return

    const appliedKey = `${checkoutState}:${sessionId}`
    if (appliedCommercialAccessCheckoutKey.value === appliedKey) return

    appliedCommercialAccessCheckoutKey.value = appliedKey
    paymentInlineError.value = ''

    try {
      if (['cancel', 'canceled', 'cancelled'].includes(checkoutState)) {
        await cancelClientAccessPayment(
          {
            session_id: sessionId,
          },
          { timeoutMs: 30000 },
        ).catch(() => null)

        const latestAccessStatus = await getClientAccessStatus({
          timeoutMs: 30000,
          forceRefresh: true,
        }).catch(() => null)

        await auth.refreshSession({ force: true, preferCache: false })
        syncCommercialAccessState(
          latestAccessStatus || auth.access?.commercial_access || auth.access,
        )

        ui.pushToast({
          tone: 'warning',
          title: 'Pago cancelado',
          message: 'La renovacion del acceso comercial fue cancelada antes de completarse.',
        })

        await router.replace({
          name: 'cliente',
          params: { section: 'reservar' },
        })
        return
      }

      if (checkoutState !== 'success') return

      let successPayload = null

      for (let attempt = 0; attempt < 4; attempt += 1) {
        const payload = await getClientAccessPaymentSuccess(
          {
            session_id: sessionId,
          },
          { timeoutMs: 30000 },
        )

        if (typeof console !== 'undefined') {
          console.log('[client-payment-registration] access-checkout-success:response', {
            session_id: sessionId,
            attempt: attempt + 1,
            response: payload,
          })
        }

        const accessStatus = String(payload?.access?.status || '')
          .trim()
          .toLowerCase()
        const paymentStatus = normalizeAccessPaymentStatus(payload?.payment?.status)

        successPayload = payload

        if (
          payload?.access?.has_paid_access === true ||
          accessStatus === 'active' ||
          isSuccessfulAccessPaymentStatus(paymentStatus)
        ) {
          break
        }

        if (attempt < 3) {
          await delay(1500)
        }
      }

      await auth.refreshSession({ force: true, preferCache: false })
      await refreshReservations({ silent: true }).catch(() => null)

      const successAccessStatus = String(successPayload?.access?.status || '')
        .trim()
        .toLowerCase()

      let latestAccessStatus =
        successPayload?.access?.has_paid_access === true || successAccessStatus === 'active'
          ? successPayload
          : await getClientAccessStatus({ timeoutMs: 30000, forceRefresh: true }).catch(() => null)

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const resolvedAccess =
          latestAccessStatus?.access || auth.access?.commercial_access || auth.access
        const isActiveAccess =
          resolvedAccess?.has_paid_access === true ||
          String(resolvedAccess?.status || auth.user?.access_status || '')
            .trim()
            .toLowerCase() === 'active'

        if (isActiveAccess) break

        await delay(1200)
        latestAccessStatus = await getClientAccessStatus({
          timeoutMs: 30000,
          forceRefresh: true,
        }).catch(() => latestAccessStatus)
      }

      const resolvedAccess =
        latestAccessStatus?.access || auth.access?.commercial_access || auth.access
      syncCommercialAccessState(latestAccessStatus || resolvedAccess)

      const isActiveAccess =
        resolvedAccess?.has_paid_access === true ||
        String(resolvedAccess?.status || auth.user?.access_status || '')
          .trim()
          .toLowerCase() === 'active'

      if (isActiveAccess) {
        ui.pushToast({
          tone: 'success',
          title: 'Acceso comercial activado',
          message: 'Tu pago fue validado y ya puedes reservar automaticamente.',
        })

        await router.replace({
          name: 'cliente',
          params: { section: 'reservar' },
        })
        return
      }

      ui.pushToast({
        tone: 'info',
        title: 'Pago en validacion',
        message:
          'Stripe recibio el pago, pero seguimos esperando la confirmacion final. Actualizaremos tu acceso en cuanto quede confirmado.',
      })
    } catch (error) {
      appliedCommercialAccessCheckoutKey.value = ''
      paymentInlineError.value =
        error?.message || 'No pudimos validar automaticamente el pago del acceso comercial.'

      ui.pushToast({
        tone: 'error',
        title: 'No se pudo validar el pago',
        message: paymentInlineError.value,
      })
    }
  }

  async function finalizeReservationCheckoutReturn() {
    const checkoutState = normalizeRouteQueryValue(route.query.checkout).toLowerCase()
    const pendingCheckoutContext = readReservationCheckoutContext()
    const rawSessionId = normalizeRouteQueryValue(
      route.query.session_id || route.query.checkout_session_id,
    )
    const sessionId =
      rawSessionId && !rawSessionId.includes('CHECKOUT_SESSION_ID') && !/[{}]/.test(rawSessionId)
        ? rawSessionId
        : String(pendingCheckoutContext?.checkoutSessionId || '').trim()

    if (!checkoutState) return
    if (!reservationCheckoutReturnMode.value) return

    const appliedKey = `${checkoutState}:${routeId.value}:${sessionId}`
    if (appliedReservationCheckoutKey.value === appliedKey) return

    appliedReservationCheckoutKey.value = appliedKey
    paymentInlineError.value = ''

    if (['cancel', 'canceled', 'cancelled'].includes(checkoutState)) {
      destroyStripePaymentElement()
      ui.pushToast({
        tone: 'warning',
        title: 'Pago cancelado',
        message: 'El checkout del vuelo fue cancelado antes de completarse.',
      })

      await router.replace({
        name: 'cliente-detalle',
        params: { section: 'pago', id: routeId.value },
      })
      return
    }

    if (checkoutState !== 'success') return

    paymentSubmitting.value = true

    try {
      const checkoutSuccessPayload = sessionId
        ? await getClientReservationCheckoutSuccess(
            {
              session_id: sessionId,
              reservation_id:
                pendingCheckoutContext?.reservationId || reservationContextId.value || undefined,
              flight_request_id:
                pendingCheckoutContext?.flightRequestId ||
                flightRequestContextId.value ||
                undefined,
            },
            { timeoutMs: 30000 },
          ).catch(() => null)
        : null

      const successReservation =
        checkoutSuccessPayload?.reservation &&
        typeof checkoutSuccessPayload.reservation === 'object'
          ? checkoutSuccessPayload.reservation
          : null
      const successFlightRequest =
        checkoutSuccessPayload?.flight_request &&
        typeof checkoutSuccessPayload.flight_request === 'object'
          ? checkoutSuccessPayload.flight_request
          : null
      const successPaymentStatus = String(
        checkoutSuccessPayload?.payment_status ||
          successReservation?.payment_status ||
          successFlightRequest?.payment_status ||
          '',
      )
        .trim()
        .toLowerCase()
      const successBookingStatus = String(checkoutSuccessPayload?.booking_status || '')
        .trim()
        .toLowerCase()
      const successWorkflowStatus = String(
        checkoutSuccessPayload?.workflow_status ||
          successReservation?.workflow_status ||
          successFlightRequest?.workflow_status ||
          '',
      )
        .trim()
        .toLowerCase()

      if (
        successReservation &&
        (isSuccessfulAccessPaymentStatus(successPaymentStatus) ||
          successBookingStatus === 'confirmed' ||
          ['payment_confirmed', 'vuelo confirmado', 'flight_confirmed'].includes(
            successWorkflowStatus,
          ))
      ) {
        clearReservationCheckoutContext()
        clearQuotePreviewState()
        mergeReservationUpdate({
          ...successReservation,
          id:
            resolveEntityIdentifier(successReservation?.id) ||
            resolveEntityIdentifier(checkoutSuccessPayload?.reservation_id) ||
            resolveEntityIdentifier(successFlightRequest?.reservation_id) ||
            routeId.value,
          flight_request_id:
            resolveEntityIdentifier(successReservation?.flight_request_id) ||
            resolveEntityIdentifier(successFlightRequest?.id) ||
            flightRequestContextId.value,
          is_reservation: true,
          updated_at: new Date().toISOString(),
        })
        setAircraftHold(null)

        ui.pushToast({
          tone: 'success',
          title: 'Pago confirmado',
          message: 'Stripe confirmo el pago del vuelo y la reserva ya quedo actualizada.',
        })

        await router.replace({
          name: 'cliente-detalle',
          params: {
            section: 'reserva-confirmada',
            id:
              resolveEntityIdentifier(successReservation?.id) ||
              resolveEntityIdentifier(checkoutSuccessPayload?.reservation_id) ||
              routeId.value,
          },
        })
        return
      }

      let paidReservation = null

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await refreshReservations({ silent: true }).catch(() => null)

        paidReservation =
          reservations.value.find((reservation) => {
            const reservationId = resolveEntityIdentifier(reservation?.id)
            const flightRequestId = resolveEntityIdentifier(reservation?.flight_request_id)
            const status = String(
              reservation?.payment_status ||
                reservation?.payment_order?.status ||
                reservation?.status ||
                reservation?.workflow_status ||
                '',
            )
              .trim()
              .toLowerCase()

            return (
              [reservationId, flightRequestId].includes(String(routeId.value || '').trim()) &&
              isSuccessfulAccessPaymentStatus(status)
            )
          }) || null

        if (paidReservation) break
        if (attempt < 4) await delay(1500)
      }

      if (paidReservation) {
        clearReservationCheckoutContext()
        clearQuotePreviewState()
        mergeReservationUpdate(paidReservation)
        setAircraftHold(null)

        ui.pushToast({
          tone: 'success',
          title: 'Pago confirmado',
          message: 'Stripe confirmo el pago del vuelo y la reserva ya quedo actualizada.',
        })

        await router.replace({
          name: 'cliente-detalle',
          params: { section: 'reserva-confirmada', id: paidReservation.id || routeId.value },
        })
        return
      }

      const fallbackReservation =
        pendingCheckoutContext?.reservation &&
        typeof pendingCheckoutContext.reservation === 'object'
          ? pendingCheckoutContext.reservation
          : selectedReservation.value && typeof selectedReservation.value === 'object'
            ? selectedReservation.value
            : null
      const fallbackReservationId = String(
        pendingCheckoutContext?.reservationId || fallbackReservation?.id || routeId.value || '',
      ).trim()
      const fallbackFlightRequestId = String(
        pendingCheckoutContext?.flightRequestId ||
          fallbackReservation?.flight_request_id ||
          routeId.value ||
          '',
      ).trim()

      if (fallbackReservation && (fallbackReservationId || fallbackFlightRequestId)) {
        mergeReservationUpdate({
          ...fallbackReservation,
          id: fallbackReservationId || fallbackFlightRequestId,
          flight_request_id: fallbackFlightRequestId || fallbackReservationId,
          is_reservation: true,
          status: 'pending_payment',
          workflow_status: 'payment_pending',
          payment_method: 'stripe',
          payment_status: 'pending_verification',
          frontend_state: {
            ...(fallbackReservation.frontend_state &&
            typeof fallbackReservation.frontend_state === 'object'
              ? fallbackReservation.frontend_state
              : {}),
            ready_for_payment: false,
            payment_verification_pending: true,
            next_action: 'sync_payment',
            status_message:
              'Pago en verificacion. Estamos esperando la confirmacion final del backend antes de cerrar la reserva.',
          },
          updated_at: new Date().toISOString(),
        })

        ui.pushToast({
          tone: 'info',
          title: 'Pago en verificacion',
          message:
            'Stripe recibio el pago. Estamos esperando la confirmacion final del backend antes de marcar el vuelo como confirmado.',
        })

        await router.replace({
          name: 'cliente-detalle',
          params: { section: 'pago', id: fallbackReservationId || fallbackFlightRequestId },
        })
        return
      }

      ui.pushToast({
        tone: 'info',
        title: 'Pago en validacion',
        message:
          'Stripe recibio el pago. Estamos esperando el webhook del backend para confirmar la reserva.',
      })
    } catch (error) {
      appliedReservationCheckoutKey.value = ''
      paymentInlineError.value =
        error?.message || 'No pudimos validar automaticamente el pago del vuelo.'

      ui.pushToast({
        tone: 'error',
        title: 'No se pudo validar el pago',
        message: paymentInlineError.value,
      })
    } finally {
      paymentSubmitting.value = false
    }
  }

  async function handleAssistedPaymentProofUpload() {
    const reservationId = reservationContextId.value
    const flightRequestId = flightRequestContextId.value

    if (!reservationId) {
      paymentInlineError.value = 'No encontramos la reserva para asociar el comprobante.'
      return
    }

    if (!assistedPaymentProofFile.value) {
      paymentInlineError.value = 'Selecciona un comprobante antes de subirlo.'
      return
    }

    paymentInlineError.value = ''
    paymentProofUploading.value = true

    try {
      const persistedReservation = await uploadClientPaymentProof(
        reservationId,
        {
          flight_request_id: flightRequestId,
          contact_email: paymentForm.contactEmail.trim() || customerEmail.value,
        },
        assistedPaymentProofFile.value,
        { timeoutMs: 30000 },
      )

      mergeReservationUpdate({
        ...persistedReservation,
        id: reservationId,
        updated_at: new Date().toISOString(),
      })

      ui.pushToast({
        tone: 'success',
        title: 'Comprobante recibido',
        message: 'El comprobante ya quedo cargado y la reserva pasa a validacion manual.',
      })

      assistedPaymentProofFile.value = null
      assistedPaymentProofName.value = ''
    } catch (error) {
      paymentInlineError.value =
        error?.message || 'No pudimos subir el comprobante del pago asistido.'
    } finally {
      paymentProofUploading.value = false
    }
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
          String(
            reservation?.contract?.docusign_status || reservation?.docusign_status || '',
          ).trim(),
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
        : null) ||
      findReservationRecordById(reservationId) ||
      {}

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
        contractPayload?.flight_request_id ||
          baseReservation.flight_request_id ||
          baseReservation.request_id ||
          '',
      ).trim()
      const existingContractId = String(
        contractPayload?.contract_id ||
          baseReservation.contract?.id ||
          baseReservation.contract_id ||
          '',
      ).trim()
      const lockedContractFlow =
        hasLockedContractFlow(baseReservation) ||
        hasLockedContractFlow(contractPayload) ||
        existingContractId !== ''
      const hasIncomingContractMarkup = Boolean(
        String(
          contractPayload?.full_contract_html ||
            contractPayload?.document_html ||
            contractPayload?.contract_html ||
            '',
        ).trim(),
      )

      let contractResponse = null
      let contractId = existingContractId

      if (contractId && dedicatedDocusignSendPath && !hasIncomingContractMarkup) {
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
          regenerate: !lockedContractFlow,
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
      redirectToExternalUrl(signingUrl)
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

  async function refreshReservationPaymentAvailability({ force = false } = {}) {
    if (commercialAccessCheckoutScreenMode.value || props.section !== 'pago') {
      paymentAvailabilityState.value = null
      paymentAvailabilityLoading.value = false
      return null
    }

    const reservationId = resolveEntityIdentifier(
      selectedReservation.value?.id || reservationContextId.value,
    )
    if (!reservationId || !selectedReservation.value?.is_reservation) {
      paymentAvailabilityState.value = null
      paymentAvailabilityLoading.value = false
      return null
    }

    if (reservationPaymentAvailabilityRequestPromise && !force) {
      return reservationPaymentAvailabilityRequestPromise
    }

    paymentAvailabilityLoading.value = true

    reservationPaymentAvailabilityRequestPromise = (async () => {
      try {
        const response = await getClientReservationPaymentAvailability(reservationId, {
          timeoutMs: 30000,
        })
        const normalizedAvailability = normalizeReservationPaymentAvailability(response)
        paymentAvailabilityState.value = normalizedAvailability

        if (
          !normalizedAvailability?.can_pay &&
          shouldRefreshAvailabilityResults(normalizedAvailability?.invalid_reason)
        ) {
          markReservationAvailabilityConflict(reservationId, {
            status: 409,
            payload: {
              code: 'AIRCRAFT_NOT_AVAILABLE',
              invalid_reason: normalizedAvailability?.invalid_reason,
              message: reservationPaymentAvailabilityMessage(normalizedAvailability),
            },
            message: reservationPaymentAvailabilityMessage(normalizedAvailability),
          })
        }

        if (normalizedAvailability?.hold?.id && normalizedAvailability.hold_valid) {
          setAircraftHold({
            hold_id: normalizedAvailability.hold.id,
            hold_expires_at: normalizedAvailability.hold.expires_at,
            aircraft_id: normalizedAvailability.hold.aircraft_id,
            quote_id: normalizedAvailability.hold.quote_id,
            reservation_id: normalizedAvailability.hold.reservation_id,
            flight_request_id: normalizedAvailability.hold.flight_request_id,
            status: normalizedAvailability.hold.status,
          })
        } else if (!normalizedAvailability?.reservation_booked) {
          setAircraftHold(null)
        }

        if (normalizedAvailability?.can_pay) {
          paymentInlineError.value = ''
          serverSearchError.value = ''
        } else {
          paymentInlineError.value = reservationPaymentAvailabilityMessage(normalizedAvailability)
        }

        return normalizedAvailability
      } catch (error) {
        if (isAircraftAvailabilityConflictError(error)) {
          markReservationAvailabilityConflict(reservationId, error)
        }

        const fallbackState = normalizeReservationPaymentAvailability({
          success: false,
          can_pay: false,
          invalid_reason: isAircraftAvailabilityConflictError(error)
            ? 'aircraft_booked_by_other_reservation'
            : 'network_error',
          message: error?.message || '',
        })
        paymentAvailabilityState.value = fallbackState
        paymentInlineError.value = reservationPaymentAvailabilityMessage(fallbackState)
        return fallbackState
      } finally {
        paymentAvailabilityLoading.value = false
        reservationPaymentAvailabilityRequestPromise = null
      }
    })()

    return reservationPaymentAvailabilityRequestPromise
  }

  async function handlePaymentSubmit() {
    if (paymentSubmitting.value) return

    if (commercialAccessCheckoutReturnPending.value) {
      await finalizeCommercialAccessCheckoutReturn()
      return
    }

    if (reservationCheckoutReturnPending.value) {
      await finalizeReservationCheckoutReturn()
      return
    }

    if (commercialAccessPaymentMode.value) {
      await startCommercialAccessCheckout({
        accessSource: auth.access?.commercial_access || auth.access,
        onErrorTitle: 'No se pudo activar el acceso comercial',
        intent: 'checkout',
      })
      return
    }

    const flightRequestId = flightRequestContextId.value
    const reservationId = reservationContextId.value

    if (!flightRequestId) {
      paymentInlineError.value = 'No encontramos la reserva para iniciar el pago.'
      return
    }

    paymentInlineError.value = ''
    if (!selectedPaymentMethod.value) selectedPaymentMethod.value = 'stripe'

    if (!paymentForm.contactEmail.trim()) {
      paymentInlineError.value = 'Agrega un correo electronico de contacto para continuar.'
      return
    }

    paymentSubmitting.value = true

    try {
      if (isAssistedReservationPayment.value) {
        if (assistedPaymentOrderReady.value && assistedPaymentProofFile.value) {
          await handleAssistedPaymentProofUpload()
          return
        }

        destroyStripePaymentElement()

        const persistedReservation = await saveClientAssistedPayment(
          reservationId || flightRequestId,
          {
            reservation_id: reservationId,
            flight_request_id: flightRequestId,
            contact_email: paymentForm.contactEmail.trim(),
            payment_method: 'assisted_cash',
          },
          { timeoutMs: 30000 },
        )

        paymentLastReference.value = String(
          persistedReservation?.payment_order?.reference ||
            persistedReservation?.flight_request_id ||
            flightRequestId ||
            '',
        ).trim()
        assistedPaymentOrderReady.value = true

        mergeReservationUpdate({
          ...persistedReservation,
          id: reservationId || flightRequestId,
          payment_method: 'assisted_cash',
          updated_at: new Date().toISOString(),
        })

        let paymentInvoiceNotificationError = ''

        try {
          await sendPaymentInvoiceNotification({
            reservationId: reservationId || flightRequestId,
            paymentIntentId: paymentLastReference.value,
          })
        } catch (notificationError) {
          paymentInvoiceNotificationError =
            notificationError?.message || 'No se pudo enviar la orden de pago por correo.'
          console.warn('[payment-invoice-notification-warning]', {
            reservationId: reservationId || flightRequestId,
            flightRequestId,
            message: paymentInvoiceNotificationError,
          })
        }

        ui.pushToast({
          tone: paymentInvoiceNotificationError ? 'warning' : 'success',
          title: 'Pago asistido registrado',
          message: paymentInvoiceNotificationError
            ? 'La orden de pago quedo registrada, pero el correo no pudo enviarse. Aun puedes generar el PDF y compartirlo manualmente.'
            : 'La orden de pago ya quedo registrada y fue enviada por correo. Ahora puedes generar el PDF y subir tu comprobante.',
        })

        return
      }

      destroyStripePaymentElement()

      const paymentAvailability = await refreshReservationPaymentAvailability({ force: true })
      const paymentAvailabilityMessage = reservationPaymentAvailabilityMessage(paymentAvailability)
      const reservationBooked = paymentAvailability?.reservation_booked === true

      if (!paymentAvailability?.can_pay) {
        if (shouldRefreshAvailabilityResults(paymentAvailability?.invalid_reason)) {
          await handleAircraftAvailabilityConflict({
            message: paymentAvailabilityMessage,
            title: 'Disponibilidad actualizada',
          })
          paymentInlineError.value = serverSearchError.value || paymentAvailabilityMessage
          return
        }

        paymentInlineError.value = paymentAvailabilityMessage
        ui.pushToast({
          tone: 'error',
          title: 'No se pudo iniciar el pago',
          message: paymentAvailabilityMessage,
        })
        return
      }

      const checkoutContext = readReservationCheckoutContext()
      const reservationHold = resolveReservationAircraftHold({
        reservation: selectedReservation.value,
        checkoutContext,
        activeHold: aircraftHold.value,
      })
      const activeCheckoutHold = paymentAvailability?.hold_valid
        ? buildResolvedAircraftHold(
            {
              hold_id: paymentAvailability?.hold?.id,
              hold_expires_at: paymentAvailability?.hold?.expires_at,
              quote_id: paymentAvailability?.hold?.quote_id,
              aircraft_id: paymentAvailability?.hold?.aircraft_id,
              reservation_id: paymentAvailability?.hold?.reservation_id,
              flight_request_id: paymentAvailability?.hold?.flight_request_id,
              status: paymentAvailability?.hold?.status,
            },
            reservationHold,
            selectedReservation.value,
          )
        : null

      if (activeCheckoutHold?.hold_id) {
        setAircraftHold(activeCheckoutHold)
      }

      const successUrl = buildReservationCheckoutReturnUrl(
        'success',
        reservationId || flightRequestId,
      )
      const cancelUrl = buildReservationCheckoutReturnUrl(
        'cancelled',
        reservationId || flightRequestId,
      )
      const payload = await createClientCheckout(
        flightRequestId,
        {
          reservation_id: reservationId || undefined,
          reservation: reservationId || undefined,
          booking_id: reservationId || flightRequestId,
          hold_id: reservationBooked ? undefined : activeCheckoutHold?.hold_id || undefined,
          contact_email: paymentForm.contactEmail.trim() || customerEmail.value,
          success_url: successUrl,
          cancel_url: cancelUrl,
          return_url: successUrl,
          successUrl,
          cancelUrl,
        },
        { timeoutMs: 30000 },
      )

      const redirectUrl = resolveStripeCheckoutRedirectUrl(payload)

      const checkoutSessionId = String(
        payload?.checkout_session_id ||
          payload?.checkoutSessionId ||
          payload?.data?.checkout_session_id ||
          payload?.data?.checkoutSessionId ||
          '',
      ).trim()

      paymentLastReference.value = checkoutSessionId || paymentLastReference.value

      mergeReservationUpdate({
        id: reservationId || flightRequestId,
        flight_request_id:
          resolveEntityIdentifier(selectedReservation.value?.flight_request_id) || flightRequestId,
        payment_method: 'stripe',
        payment_order: {
          ...selectedReservation.value?.payment_order,
          method: 'stripe',
          payment_method: 'stripe',
          checkout_session_id: checkoutSessionId || undefined,
          checkout_url: redirectUrl || undefined,
        },
        updated_at: new Date().toISOString(),
      })

      persistReservationCheckoutContext({
        routeId: routeId.value || reservationId || flightRequestId,
        reservationId,
        flightRequestId,
        checkoutSessionId,
        aircraftHold: activeCheckoutHold,
        reservation: {
          ...(selectedReservation.value && typeof selectedReservation.value === 'object'
            ? selectedReservation.value
            : {}),
          id: reservationId || flightRequestId,
          flight_request_id:
            resolveEntityIdentifier(selectedReservation.value?.flight_request_id) ||
            flightRequestId,
          is_reservation: true,
          status: 'pending_payment',
          workflow_status: 'payment_pending',
          payment_method: 'stripe',
          payment_status: 'pending',
        },
      })

      if (!redirectUrl) {
        throw new Error('El backend no devolvio la URL de Stripe Checkout para pagar el vuelo.')
      }

      if (isApiCheckoutCreationUrl(redirectUrl)) {
        throw new Error(
          'El backend devolvio el endpoint de creacion del checkout en lugar del link real de Stripe.',
        )
      }

      redirectToExternalUrl(redirectUrl)
      return
    } catch (error) {
      const invalidReason = String(
        error?.payload?.invalid_reason || error?.payload?.reason || '',
      ).trim()

      if (
        (Number(error?.status || 0) === 409 && shouldRefreshAvailabilityResults(invalidReason)) ||
        ['AIRCRAFT_NOT_AVAILABLE', 'AIRCRAFT_ALREADY_RESERVED'].includes(
          String(error?.payload?.code || '').trim(),
        ) ||
        String(error?.message || '')
          .toLowerCase()
          .includes('retencion')
      ) {
        await handleAircraftAvailabilityConflict({
          message:
            error?.message ||
            'La retencion expiro. Verificaremos nuevamente la disponibilidad para mostrarte opciones vigentes.',
          title: 'Disponibilidad actualizada',
        })
        paymentInlineError.value =
          serverSearchError.value ||
          error?.message ||
          'La retencion expiro. Verificaremos nuevamente la disponibilidad para mostrarte opciones vigentes.'
        return
      }

      if (Number(error?.status || 0) === 409 && invalidReason) {
        paymentInlineError.value = reservationPaymentAvailabilityMessage({
          invalid_reason: invalidReason,
          message: error?.message || error?.payload?.message || '',
        })
        ui.pushToast({
          tone: 'error',
          title: 'No se pudo iniciar el pago',
          message: paymentInlineError.value,
        })
        return
      }

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
      if (normalizedTargetId) {
        try {
          const reservationRecord = await getClientReservation(normalizedTargetId, {
            timeoutMs: CLIENT_TRIPS_TIMEOUT_MS,
          })
          upsertReservationDetail({
            ...reservationRecord,
            is_reservation: true,
          })
          return {
            ...reservationRecord,
            is_reservation: true,
          }
        } catch {
          // Si no existe como reserva, seguimos con el flujo normal y reportamos el error original.
        }
      }

      throw new Error('No encontramos un viaje activo para abrir el contrato.')
    }

    if (normalizedTargetId) {
      try {
        const reservationRecord = await getClientReservation(normalizedTargetId, {
          timeoutMs: CLIENT_TRIPS_TIMEOUT_MS,
        })
        if (!reservationRecord || typeof reservationRecord !== 'object') {
          throw new Error('Reservation lookup returned an empty payload.')
        }
        upsertReservationDetail({
          ...reservationRecord,
          is_reservation: true,
        })

        return {
          ...(trip && typeof trip === 'object' ? trip : {}),
          ...reservationRecord,
          id: resolveEntityIdentifier(reservationRecord) || normalizedTargetId,
          flight_request_id:
            resolveEntityIdentifier(reservationRecord?.flight_request_id) ||
            resolveEntityIdentifier(trip?.flight_request_id) ||
            normalizedTargetId,
          is_reservation: true,
        }
      } catch {
        // Si no existe una reserva consultable, solo entonces intentamos crearla.
      }
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
    const reservationRecord = resolveReservationRecordFromPayload(payload)
    const resolvedReservationId = resolveEntityIdentifier(reservationRecord)

    if (!resolvedReservationId) {
      throw new Error('No se pudo crear la reserva para abrir el contrato.')
    }

    await refreshReservations({ silent: true })

    return {
      ...trip,
      ...reservationRecord,
      id: resolvedReservationId,
      flight_request_id:
        resolveEntityIdentifier(reservationRecord?.flight_request_id) || flightRequestId,
      is_reservation: true,
    }
  }

  function markReservationAvailabilityConflict(targetId = '', error = null) {
    const normalizedTargetId = resolveEntityIdentifier(targetId)
    const selectedTargetId = resolveEntityIdentifier(selectedReservation.value?.id || '')
    const selectedFlightRequestId = resolveEntityIdentifier(
      selectedReservation.value?.flight_request_id || '',
    )
    const reservation =
      reservations.value.find((item) => {
        const reservationId = resolveEntityIdentifier(item?.id || '')
        const flightRequestId = resolveEntityIdentifier(item?.flight_request_id || '')
        return (
          (normalizedTargetId &&
            (reservationId === normalizedTargetId || flightRequestId === normalizedTargetId)) ||
          (selectedTargetId && reservationId === selectedTargetId) ||
          (selectedFlightRequestId && flightRequestId === selectedFlightRequestId)
        )
      }) || selectedReservation.value

    const reservationId = resolveEntityIdentifier(reservation?.id || normalizedTargetId)
    if (!reservationId) return

    const conflictedAircraftId = resolveEntityIdentifier(
      reservation?.aircraft_id ||
        reservation?.assigned_aircraft_id ||
        reservation?.frontend_state?.aircraft_hold?.aircraft_id ||
        error?.payload?.aircraft_id ||
        '',
    )
    rememberConflictedAircraftId(conflictedAircraftId)

    mergeReservationUpdate({
      ...(reservation && typeof reservation === 'object' ? reservation : {}),
      id: reservationId,
      frontend_state: {
        ...(reservation?.frontend_state || {}),
        availability_conflict: true,
        availability_conflict_code: String(
          error?.payload?.code || 'AIRCRAFT_ALREADY_RESERVED',
        ).trim(),
        availability_conflict_message: String(
          error?.message ||
            error?.payload?.message ||
            'Esta aeronave ya no esta disponible para el horario seleccionado.',
        ).trim(),
        next_action: 'contact_concierge',
        ready_for_payment: false,
      },
      current_action: 'contact_concierge',
      updated_at: new Date().toISOString(),
    })
  }

  function hydrateSearchFormFromReservation(reservation = null) {
    if (!reservation || typeof reservation !== 'object') return

    const primaryLeg =
      (Array.isArray(reservation.legs) && reservation.legs[0]) ||
      (Array.isArray(reservation.requirements) && reservation.requirements[0]) ||
      {}
    const primaryDeparture = String(
      primaryLeg.departure_datetime || reservation.departure_datetime || reservation.date || '',
    ).trim()
    const [departureDate = '', departureTime = ''] = primaryDeparture.split('T')

    searchForm.origin = String(
      reservation.origin || primaryLeg.origin || searchForm.origin || '',
    ).trim()
    searchForm.destination = String(
      reservation.destination || primaryLeg.destination || searchForm.destination || '',
    ).trim()
    searchForm.departureDate = String(
      reservation.departure_date || departureDate || searchForm.departureDate || '',
    ).trim()
    searchForm.departureTime = String(
      reservation.departure_time || departureTime.slice(0, 5) || searchForm.departureTime || '',
    ).trim()
    searchForm.passengers = String(reservation.passengers || searchForm.passengers || '1').trim()
  }

  function clearInvalidAircraftSelection() {
    technicalSheetOpen.value = false
    technicalAircraft.value = null

    if (['aeronave', 'reserva'].includes(activeSection.value)) {
      router.replace({ name: 'cliente', params: { section: 'resultados' } })
    }
  }

  async function handleResolveAvailabilityConflict(targetId = '') {
    const reservation =
      findReservationRecordById(targetId || reservationContextId.value) || selectedReservation.value

    resetAvailabilityConflictLoadingState()
    setAircraftHold(null)
    clearReservationCheckoutContext()
    clearInvalidAircraftSelection()

    if (reservation) {
      hydrateSearchFormFromReservation(reservation)
      markReservationAvailabilityConflict(
        targetId || reservation.id || reservation.flight_request_id || '',
        {
          payload: {
            code: 'AIRCRAFT_NOT_AVAILABLE',
            aircraft_id: reservation?.aircraft_id || reservation?.assigned_aircraft_id || '',
          },
          message:
            reservation?.frontend_state?.availability_conflict_message ||
            'Esta aeronave ya no esta disponible para el horario seleccionado.',
        },
      )
    }

    if (submittedQuotePayload.value) {
      try {
        await refreshSearchResults({ silent: true })
        go('resultados')
        return
      } catch {
        // Si no podemos refrescar resultados, llevamos al formulario con el itinerario precargado.
      } finally {
        resetAvailabilityConflictLoadingState()
      }
    }

    go('reservar')
  }

  async function handleOpenContract(targetId = '') {
    try {
      resetAvailabilityConflictLoadingState()
      const reservation = await ensureReservationForSelectedTrip(targetId)
      const reservationId = resolveEntityIdentifier(reservation?.id)
      if (!reservationId) throw new Error('El backend no devolvió el identificador de la reserva.')
      go('contrato', reservationId)
    } catch (error) {
      if (isAircraftAvailabilityConflictError(error)) {
        markReservationAvailabilityConflict(targetId, error)
        resetAvailabilityConflictLoadingState()
        await handleAircraftAvailabilityConflict({
          title: 'No se pudo abrir el contrato',
          message:
            error?.message || 'Esta aeronave ya no esta disponible para el horario seleccionado.',
        })
        return
      }

      ui.pushToast({
        tone: 'error',
        title: 'No se pudo abrir el contrato',
        message: error?.message || 'Necesitamos una reserva valida antes de mostrar el contrato.',
      })
    }
  }

  async function ensureContractReservationContext() {
    if (props.section !== 'contrato') return
    if (!hasReservationsLoaded.value) return
    if (commercialAccessCheckoutReturnMode.value) return
    if (selectedReservation.value?.frontend_state?.availability_conflict === true) return
    if (selectedReservation.value?.is_reservation) {
      activeContractReservationBootstrapKey.value = ''
      lastContractReservationBootstrapKey.value = ''
      return
    }

    const targetId =
      resolveEntityIdentifier(selectedReservation.value) ||
      resolveEntityIdentifier(routeId.value) ||
      resolveEntityIdentifier(reservations.value[0])

    if (!targetId) return

    const bootstrapKey = `contrato:${targetId}`
    if (
      activeContractReservationBootstrapKey.value === bootstrapKey ||
      lastContractReservationBootstrapKey.value === bootstrapKey
    ) {
      return
    }

    activeContractReservationBootstrapKey.value = bootstrapKey
    lastContractReservationBootstrapKey.value = bootstrapKey

    try {
      const reservation = await ensureReservationForSelectedTrip(targetId)
      const resolvedReservationId = resolveEntityIdentifier(reservation?.id)
      const resolvedContractRouteId = resolvedReservationId

      if (!resolvedReservationId) {
        throw new Error('No se pudo identificar la reserva del contrato.')
      }

      if (
        String(routeId.value || '').trim() !== resolvedContractRouteId ||
        !selectedReservation.value?.is_reservation
      ) {
        go('contrato', resolvedContractRouteId)
      }
    } catch (error) {
      ui.pushToast({
        tone: 'warning',
        title: 'Contrato en preparación',
        message:
          error?.message ||
          'Seguimos preparando tu reserva para abrir el contrato. Intenta de nuevo en unos segundos.',
      })
    } finally {
      if (activeContractReservationBootstrapKey.value === bootstrapKey) {
        activeContractReservationBootstrapKey.value = ''
      }
    }
  }

  watch(
    customerEmail,
    (value) => {
      if (!paymentForm.contactEmail || !hasValidEmailAddress(paymentForm.contactEmail)) {
        paymentForm.contactEmail = value
      }
    },
    { immediate: true },
  )

  watch(
    () => [props.section, selectedReservation.value?.id, selectedReservation.value?.payment_method],
    () => {
      if (props.section !== 'pago' || commercialAccessCheckoutScreenMode.value) return

      selectedPaymentMethod.value = 'stripe'
      paymentMethodExplicitlySelected.value = true
      assistedPaymentOrderReady.value = false
    },
    { immediate: true },
  )

  function handlePaymentMethodSelection(method = '') {
    selectedPaymentMethod.value = method === 'assisted' ? 'stripe' : method || 'stripe'
    paymentMethodExplicitlySelected.value = true
  }

  watch(
    () => selectedPaymentMethod.value,
    (method) => {
      if (method === 'assisted') {
        paymentInlineError.value = ''
      }
    },
  )

  watch(
    () => [props.section, selectedReservation.value?.id, selectedReservation.value?.updated_at],
    () => {
      if (props.section !== 'pago') {
        paymentAvailabilityState.value = null
        paymentAvailabilityLoading.value = false
        return
      }

      if (selectedReservation.value?.frontend_state?.availability_conflict === true) {
        paymentAvailabilityState.value = null
        paymentAvailabilityLoading.value = false
        paymentInlineError.value =
          selectedReservation.value?.frontend_state?.availability_conflict_message ||
          'Esta aeronave ya no esta disponible para el horario seleccionado.'
        return
      }

      void refreshReservationPaymentAvailability({ force: true })
    },
    { immediate: true },
  )

  watch(
    () => [
      props.section,
      selectedPaymentMethod.value,
      routeId.value,
      route.query.accessPayment,
      route.query.checkout,
      commercialAccessCheckoutScreenMode.value,
      commercialAccessCheckoutReturnMode.value,
    ],
    async ([section, method]) => {
      if (commercialAccessCheckoutScreenMode.value) {
        if (stripeViewContext !== 'client_access_checkout') {
          destroyStripePaymentElement()
          stripeViewContext = 'client_access_checkout'
        }

        return
      }

      if (section === 'pago' && method === 'stripe') {
        destroyStripePaymentElement()
        stripeViewContext = 'reservation_checkout'
        return
      }

      if (method !== 'stripe') {
        destroyStripePaymentElement()
      }
    },
    { immediate: true },
  )

  const portalBindings = {
    activeAircraftHoldSummary,
    props,
    activeItinerarySummary,
    activePaymentBadge,
    activePlan,
    activeResultFilter,
    activeSection,
    addLeg,
    auth,
    aircraftBillingNote,
    aircraftBackendBillableHoursLabel,
    aircraftCapacityLabel,
    aircraftClassLabel,
    aircraftSidebarFilters,
    aircraftSidebarPassengerBounds,
    aircraftSidebarPriceBounds,
    aircraftSidebarServiceOptions,
    aircraftSidebarSpeedBounds,
    aircraftSidebarTypeOptions,
    aircraftDurationLabel,
    aircraftIncludes,
    aircraftPriceCopy,
    aircraftSpeedLine,
    aircraftVisualStyle,
    assistedPaymentProofFile,
    assistedPaymentProofName,
    assistedPaymentProofUploaded,
    assistedPrimaryCtaLabel,
    canRenderReservationWorkflow,
    canUploadAssistedPaymentProof,
    clearAircraftSidebarFilters,
    closeTechnicalSheet,
    commercialAccessCheckoutFacts,
    commercialAccessCheckoutScreenMode,
    commercialAccessCheckoutReturnMode,
    commercialAccessCheckoutReturnPending,
    commercialAccessCtaLabel,
    commercialAccessRenewalPanel,
    commercialTrialNotice,
    conciergeChatDraft,
    conciergeChatMessages,
    conciergeConfig,
    conciergeScheduleForm,
    closeConciergeChat,
    closeConciergeDrawer,
    closeConciergeScheduleModal,
    customerDisplayName,
    featuredAircraft,
    formatDetailedCurrencyByCode,
    go,
    handleConciergeCommunicationSelection,
    handleConciergeServiceSelection,
    goToReservationDetail,
    goToConcierge,
    goToPayment,
    handleAssistedPaymentProofSelection,
    handleAssistedPaymentProofUpload,
    handleContractConfirm,
    handleGenerateAssistedPaymentOrderPdf,
    handleLogout,
    handleManualReservationsRefresh,
    handleOpenContract,
    handleResolveAvailabilityConflict,
    handlePaymentMethodSelection,
    handlePaymentSubmit,
    handleSendAssistedPaymentOrderEmail,
    hasActiveClientAccess,
    hasReservationsLoaded,
    itineraryDateLine,
    itineraryHeadline,
    itinerarySummary,
    isConciergeChatOpen,
    isConciergeOpen,
    isConciergeScheduleOpen,
    isCreatingAccessCheckout,
    isCommercialAccessExpired,
    isResultsSection,
    loadingServerData,
    lastExternalRedirectUrl,
    mobileNavItems,
    openConciergeDrawer,
    otherSectionCardCopy,
    paymentBreakdownAmountMap,
    paymentBreakdownCurrency,
    paymentBreakdownRows,
    paymentDateLabel,
    paymentFeatureList,
    paymentForm,
    paymentCanSubmit,
    paymentHeroCopy,
    paymentHeroTitle,
    paymentAvailabilityLoading,
    paymentInlineError,
    paymentLastReference,
    paymentMethodCards,
    paymentMethodExplicitlySelected,
    paymentMethodSummaryLabel,
    paymentProofUploading,
    paymentRouteHeadline,
    paymentSubmitting,
    paymentSummaryAmountLabel,
    profileDisplayName,
    profileEmail,
    profileInitials,
    profileMenuOpen,
    profilePhone,
    profileStats,
    goToCommercialAccessPayment,
    refreshingReservations,
    removeLeg,
    requestReservation,
    reservationActionLabel,
    reservationLoadingState,
    reservationCheckoutReturnPending,
    reservationContextId,
    reservations,
    reservingAircraftId,
    resultFilterOptions,
    routeDistanceKmForAircraft,
    routeSubsection,
    searchForm,
    searching,
    secondaryAircraftOptions,
    selectedConciergeServiceTitle,
    selectFormAirport,
    selectLegAirport,
    selectedPaymentMethod,
    selectedReservation,
    selectedReservationFrontendState,
    selectedTripId,
    serverSearchError,
    shouldShowCommercialAccessCta,
    signingContract,
    startCommercialAccessCheckout,
    submitSearch,
    submitConciergeSchedule,
    sendConciergeChatMessage,
    technicalAircraft,
    technicalSheetInsights,
    technicalSheetOpen,
    timeline,
    topNavItems,
    topNavNotificationCount,
    tripType,
    tripsInitialTab,
    updateAircraftSidebarFilter,
    updateLegField,
    updateSearchField,
    userFirstName,
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
    if (searchForm.legs.length <= 1) return
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
      dates.length >= 2
        ? Math.max(Math.round((dates[dates.length - 1] - dates[0]) / 86400000), 0)
        : 0

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

  async function refreshSearchResults({ silent = false } = {}) {
    if (!submittedQuotePayload.value) return []

    serverSearchError.value = ''

    if (!silent) {
      searching.value = true
    }

    try {
      submittedQuotePayload.value = normalizeQuotePreviewPayload(submittedQuotePayload.value)
      const results = await searchClientFlights(submittedQuotePayload.value, {
        timeoutMs: CLIENT_QUOTES_TIMEOUT_MS,
      })
      aircraftOptions.value = Array.isArray(results) ? results : []
      persistQuotePreview()
      return aircraftOptions.value
    } catch (error) {
      aircraftOptions.value = []

      if (!silent) {
        serverSearchError.value = buildSearchResultsErrorMessage(error)
      }

      return []
    } finally {
      if (!silent) {
        searching.value = false
      }
    }
  }

  async function handleAircraftAvailabilityConflict({
    message = 'Esta aeronave acaba de dejar de estar disponible para el horario seleccionado. Te mostramos otras opciones.',
    title = 'Aeronave no disponible',
  } = {}) {
    resetAvailabilityConflictLoadingState()
    serverSearchError.value = message
    setAircraftHold(null)
    clearReservationCheckoutContext()

    try {
      if (submittedQuotePayload.value) {
        await refreshSearchResults({ silent: true })
        go('resultados')
      } else if (['contrato', 'pago', 'reserva-confirmada'].includes(props.section)) {
        go('viajes', reservationContextId.value)
      }
    } catch {
      // Mantener el mensaje original si el refresco falla.
    } finally {
      resetAvailabilityConflictLoadingState()
    }

    ui.pushToast({
      tone: 'error',
      title,
      message,
    })
  }

  async function submitSearch() {
    if (searching.value) return

    serverSearchError.value = ''
    if (!validateSearchForm()) return

    quoteResultsNavigationPending.value = false
    searching.value = true
    await refreshCommercialAccessStatus({ forceSessionRefresh: false }).catch(() => null)

    if (!canQuoteFlights.value) {
      const blockedMessage = buildCommercialAccessMessage(
        auth.access?.commercial_access || auth.access,
      )
      console.log('[bloqueo-cotizador-cliente]', {
        source: 'submitSearch',
        reason: 'canQuoteFlights=false',
        blockedMessage,
        access: auth.access,
        user: auth.user,
      })
      serverSearchError.value = blockedMessage
      searching.value = false
      quoteResultsNavigationPending.value = false
      await goToCommercialAccessPayment()
      return
    }
    quoteResultsVisible.value = true
    aircraftOptions.value = []
    const previousCommercialState = buildCommercialAccessUiState(
      auth.access?.commercial_access || auth.access,
    )
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
        flight_base_source: 'pricing_trip_hours',
        legs: itineraryLegs.value.map((leg) => normalizeLegForQuote(leg)),
        repositioningRequired: pendingMultiDestinationLegs ? true : undefined,
      }
      submittedItinerary.value = buildItinerarySummary(quotePayload)
      submittedQuotePayload.value = normalizeQuotePreviewPayload(quotePayload)
      quoteResultsNavigationPending.value = true
      await go('resultados')
      const results = await searchClientFlights(submittedQuotePayload.value, {
        timeoutMs: CLIENT_QUOTES_TIMEOUT_MS,
      })
      aircraftOptions.value = Array.isArray(results) ? results : []
      persistQuotePreview()
      logRenderedQuoteBreakdown(aircraftOptions.value, submittedQuotePayload.value)
      if (isResultsSection.value) {
        quoteResultsNavigationPending.value = false
      }
      const quoteWasConsumed =
        previousCommercialState.remainingFreeQuotes > 0 &&
        !previousCommercialState.hasPaidAccess &&
        hasRealQuoteResults(aircraftOptions.value)

      if (quoteWasConsumed) {
        await refreshCommercialAccessStatus({ forceSessionRefresh: true }).catch(() => null)

        const refreshedCommercialState = buildCommercialAccessUiState(
          auth.access?.commercial_access || auth.access,
        )

        const nextCommercialState =
          refreshedCommercialState.freeQuotesUsed > previousCommercialState.freeQuotesUsed ||
          refreshedCommercialState.remainingFreeQuotes < previousCommercialState.remainingFreeQuotes
            ? refreshedCommercialState
            : consumeTrialQuoteLocally(auth.access?.commercial_access || auth.access)

        if (!nextCommercialState.hasPaidAccess && nextCommercialState.remainingFreeQuotes <= 0) {
          ui.pushToast({
            tone: 'info',
            title: 'Cotizacion gratis utilizada',
            message: buildReservationAccessMessage(auth.access?.commercial_access || auth.access),
          })
        }
      }
    } catch (error) {
      if (error?.payload?.access) {
        syncCommercialAccessState(error.payload.access?.commercial_access || error.payload.access)
      }

      if (Number(error?.status || 0) === 402) {
        const accessSource =
          error?.payload?.access?.commercial_access || error?.payload?.access || auth.access
        serverSearchError.value = buildCommercialAccessMessage(accessSource)
        aircraftOptions.value = []
        quoteResultsNavigationPending.value = false
        await goToCommercialAccessPayment()
        return
      }

      const message = buildSearchResultsErrorMessage(error)
      aircraftOptions.value = []
      serverSearchError.value = message
      ui.pushToast({
        tone: 'error',
        title: 'Cotizador no disponible',
        message,
      })
    } finally {
      if (isResultsSection.value && !searching.value) {
        quoteResultsNavigationPending.value = false
      }
      searching.value = false
    }
  }

  async function requestReservation(aircraft = selectedAircraft.value) {
    if (!aircraft || reservingAircraftId.value) return

    if (aircraft?.is_available === false) {
      await handleAircraftAvailabilityConflict()
      return
    }

    let createdFlightRequestId = ''
    let createdReservationId = ''

    try {
      await refreshCommercialAccessStatus({ forceSessionRefresh: false }).catch(() => null)

      if (!canReserveFlights.value) {
        const blockedMessage = buildReservationAccessMessage(
          auth.access?.commercial_access || auth.access,
        )
        serverSearchError.value = blockedMessage
        await goToCommercialAccessPayment()
        return
      }

      reservingAircraftId.value = aircraftReservationKey(aircraft)
      startReservationLoadingState({
        title: 'Validando solicitud',
        message:
          'Estamos preparando la aeronave seleccionada para apartarla sin duplicar registros.',
      })
      const selectedAircraftModel =
        aircraft.aircraft || aircraft.model || aircraft.registration || aircraft.cabin || ''
      const resolvedAircraftId = resolveAircraftId(aircraft)
      const normalizedPassengers =
        Number(activeItinerarySummary.value.passengers || searchForm.passengers || 0) || 1
      if (!resolvedAircraftId) {
        throw new Error('No se encontró una aeronave válida para solicitar la reserva.')
      }
      const pricing = aircraftPricingForType(aircraft, selectedPriorityType.value)
      const selectedCardPrice = Number((pricing.finalPrice + RESULTS_SURCHARGE_USD).toFixed(2))
      const quoteKey = submittedQuotePayload.value
        ? buildQuoteQueryKey(submittedQuotePayload.value)
        : ''
      const reservationDraftKey = buildReservationDraftKey({
        aircraftId: resolvedAircraftId,
        providerId: aircraft.provider_id || aircraft.provider?.id || null,
        quoteKey,
      })
      const reservationSchedule = buildFlightRequestPayload({
        ...activeItinerarySummary.value,
        trip_type: tripTypeKey.value,
        trip_label: tripType.value,
        passengers: normalizedPassengers,
      })
      const previousDraftContext = readReservationDraftContext(reservationDraftKey)
      const reservationIdempotencyKey = String(
        previousDraftContext?.idempotencyKey || createReservationAttemptIdempotencyKey(),
      ).trim()
      const normalizedHold = normalizeAircraftHold({
        ...previousDraftContext?.hold,
      })

      writeReservationDraftContext(reservationDraftKey, {
        ...previousDraftContext,
        aircraftId: resolvedAircraftId,
        idempotencyKey: reservationIdempotencyKey,
        quoteKey,
      })

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
        aircraft_id: resolvedAircraftId,
        provider_id: aircraft.provider_id || aircraft.provider?.id || null,
        priority_type: pricing.priorityType,
        priority_multiplier: pricing.priorityMultiplier,
        source_database: aircraft.source_database || null,
        source_table: aircraft.source_table || null,
        legs: activeItinerarySummary.value.legs.map((leg) => ({ ...leg })),
      }
      const previousCommercialState = buildCommercialAccessUiState(
        auth.access?.commercial_access || auth.access,
      )
      updateReservationLoadingState({
        title: 'Cargando solicitudes',
        message:
          'Estamos registrando tu solicitud y validando la disponibilidad real de la operacion.',
      })
      const reservation =
        previousDraftContext?.reservationResponse ||
        (await createClientFlightRequest(reservationPayload, {
          idempotencyKey: reservationIdempotencyKey,
          timeoutMs: 60000,
        }))

      if (reservation?.access) {
        syncCommercialAccessState(reservation.access?.commercial_access || reservation.access)
      }
      const nextCommercialState = buildCommercialAccessUiState(
        reservation?.access?.commercial_access || reservation?.access,
      )
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
          client_preview_total: Number(selectedCardPrice.toFixed(2)),
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
      createdFlightRequestId =
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
      const resolvedQuoteId = resolveQuoteId(
        reservation,
        createdReservation,
        previousDraftContext,
        aircraft,
        route,
      )

      writeReservationDraftContext(reservationDraftKey, {
        ...previousDraftContext,
        reservationResponse: reservation,
        reservationId: createdFlightRequestId,
        quoteId: resolvedQuoteId,
        aircraftId: resolvedAircraftId,
        idempotencyKey: reservationIdempotencyKey,
        quoteKey,
      })

      const holdPayload = buildAircraftHoldPayload({
        quoteId: resolvedQuoteId,
        aircraftId: resolvedAircraftId,
        aircraft,
        reservationSchedule,
        tripTypeKeyValue: tripTypeKey.value,
        tripLabelValue: tripType.value,
        passengers: normalizedPassengers,
        quoteKey,
        legs: activeItinerarySummary.value.legs.map((leg) => ({ ...leg })),
      })
      logAircraftHoldRequest({
        quoteId: resolvedQuoteId,
        aircraftId: resolvedAircraftId,
        endpoint: `/cliente/cotizaciones/${resolvedQuoteId}/aircraft-hold`,
        payload: holdPayload,
      })
      updateReservationLoadingState({
        title: 'Apartando aeronave',
        message:
          'Estamos bloqueando temporalmente esta opcion para que nadie la tome mientras avanzas.',
      })
      let finalHold = doesAircraftHoldMatchSelection(normalizedHold, {
        quoteId: holdPayload.quote_id,
        aircraftId: holdPayload.aircraft_id,
      })
        ? normalizeRecoveredAircraftHold(normalizedHold, {
            holdPayload,
            quoteKey,
            flightRequestId: createdFlightRequestId,
          })
        : null

      if (!finalHold) {
        try {
          const holdResponse = await createClientAircraftHold(holdPayload, { timeoutMs: 30000 })
          finalHold = normalizeRecoveredAircraftHold(holdResponse, {
            holdPayload,
            quoteKey,
            flightRequestId: createdFlightRequestId,
          })
        } catch (holdError) {
          finalHold = await recoverAircraftHoldAfterFailure({
            holdPayload,
            previousHold: normalizedHold,
            quoteKey,
            flightRequestId: createdFlightRequestId,
          })

          if (!finalHold) {
            throw holdError
          }
        }
      }

      if (!finalHold?.hold_id || !finalHold?.hold_expires_at) {
        finalHold = await recoverAircraftHoldAfterFailure({
          holdPayload,
          previousHold: normalizedHold,
          quoteKey,
          flightRequestId: createdFlightRequestId,
          maxAttempts: 1,
        })
      }

      if (!finalHold?.hold_id || !finalHold?.hold_expires_at) {
        throw new Error('No pudimos confirmar una retención válida para esta aeronave.')
      }

      writeReservationDraftContext(reservationDraftKey, {
        ...previousDraftContext,
        reservationResponse: reservation,
        reservationId: createdFlightRequestId,
        quoteId: resolvedQuoteId,
        aircraftId: resolvedAircraftId,
        idempotencyKey: reservationIdempotencyKey,
        quoteKey,
        hold: finalHold,
      })
      setAircraftHold(finalHold)

      if (createdReservation) {
        const normalizedCreatedReservation = normalizeTrip(createdReservation, {
          entityType: 'flight_request',
        })
        createdReservationId = String(
          normalizedCreatedReservation.id ||
            normalizedCreatedReservation.flight_request_id ||
            createdFlightRequestId ||
            '',
        ).trim()

        reservations.value = [
          {
            ...normalizedCreatedReservation,
            frontend_state: {
              ...normalizedCreatedReservation.frontend_state,
              aircraft_hold: finalHold,
              quote_key: quoteKey,
            },
            summary_only: false,
          },
          ...reservations.value.filter(
            (item) =>
              String(item.id || item.flight_request_id || '').trim() !== createdReservationId,
          ),
        ]
        hasBootstrappedReservations.value = true
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
        title: 'Aeronave apartada temporalmente',
        message: 'Apartamos esta aeronave mientras completas el contrato y el pago.',
      })
      if (
        !previousCommercialState.hasPaidAccess &&
        previousCommercialState.remainingFreeQuotes > 0 &&
        nextCommercialState.remainingFreeQuotes === 0
      ) {
        ui.pushToast({
          tone: 'info',
          title: 'Cotizacion de prueba utilizada',
          message:
            'Ya consumiste tu cotizacion de prueba. La siguiente solicitud requerira acceso comercial.',
        })
      }
      updateReservationLoadingState({
        title: 'Abriendo tu siguiente paso',
        message:
          'Ya dejamos la solicitud lista. Estamos enviandote al contrato y al pago para completar la reserva.',
      })
      go('reserva-confirmada', targetReservationId)
      await refreshSearchResults({ silent: true }).catch(() => null)
    } catch (error) {
      if (error?.payload?.access) {
        syncCommercialAccessState(error.payload.access?.commercial_access || error.payload.access)
      } else if (Number(error?.status || 0) === 402) {
        await auth.refreshSession({ force: true, preferCache: false })
      }

      const isAircraftUnavailableConflict = isAircraftAvailabilityConflictError(error)

      const message =
        Number(error?.status || 0) === 402
          ? buildCommercialAccessMessage(
              error?.payload?.access?.commercial_access || error?.payload?.access,
            )
          : isAircraftUnavailableConflict
            ? 'Esta aeronave acaba de dejar de estar disponible para el horario seleccionado. Te mostramos otras opciones.'
            : createdFlightRequestId && isRetryableReservationHoldError(error)
              ? 'Registramos tu solicitud, pero el apartado de la aeronave tardó demasiado en confirmarse. Intenta nuevamente para revalidar la disponibilidad.'
            : error?.message || 'Intenta de nuevo o contacta a tu asesor privado.'
      serverSearchError.value = message
      console.log('[error-reserva-cliente]', {
        source: 'requestReservation',
        message,
        error,
        access: auth.access,
        user: auth.user,
      })
      if (isAircraftUnavailableConflict) {
        markReservationAvailabilityConflict(
          createdReservationId || createdFlightRequestId || aircraft?.id || '',
          error,
        )
        await handleAircraftAvailabilityConflict({
          message,
          title: 'Disponibilidad actualizada',
        })
      } else {
        ui.pushToast({
          tone: 'error',
          title: 'No se pudo solicitar la reserva',
          message,
        })
      }
      if (Number(error?.status || 0) === 402) {
        await goToCommercialAccessPayment()
      }
    } finally {
      reservingAircraftId.value = ''
      stopReservationLoadingState()
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
          requireReservations: needsReservationContext.value,
        })
        reservations.value = dedupeClientReservations(trips)
        hasBootstrappedReservations.value = true
        return trips
      } finally {
        hasBootstrappedReservations.value = true
        refreshingReservations.value = false
        reservationsRequestPromise = null
        if (!silent) {
          loadingServerData.value = false
        }
      }
    })()

    return reservationsRequestPromise
  }

  function dedupeClientReservations(items = []) {
    const normalizedItems = Array.isArray(items) ? items.filter(Boolean) : []
    const deduped = []

    normalizedItems.forEach((item) => {
      const reservationId = String(item?.id || '').trim()
      const flightRequestId = String(item?.flight_request_id || '').trim()
      const businessKey = buildReservationBusinessDeduplicationKey(item)
      const identityKey = flightRequestId || reservationId || businessKey

      if (!identityKey) {
        deduped.push(item)
        return
      }

      const existingIndex = deduped.findIndex((current) => {
        const currentReservationId = String(current?.id || '').trim()
        const currentFlightRequestId = String(current?.flight_request_id || '').trim()

        return (
          identityKey === currentReservationId ||
          identityKey === currentFlightRequestId ||
          (businessKey && businessKey === buildReservationBusinessDeduplicationKey(current)) ||
          (reservationId &&
            (reservationId === currentReservationId || reservationId === currentFlightRequestId)) ||
          (flightRequestId &&
            (flightRequestId === currentReservationId ||
              flightRequestId === currentFlightRequestId))
        )
      })

      if (existingIndex === -1) {
        deduped.push(item)
        return
      }

      const current = deduped[existingIndex]
      const preferred = item?.is_reservation && !current?.is_reservation ? item : current
      const secondary = preferred === item ? current : item

      deduped[existingIndex] = {
        ...secondary,
        ...preferred,
        frontend_state: {
          ...(secondary?.frontend_state || {}),
          ...(preferred?.frontend_state || {}),
        },
        is_reservation: Boolean(current?.is_reservation || item?.is_reservation),
        entity_type:
          current?.entity_type === 'reservation' || item?.entity_type === 'reservation'
            ? 'reservation'
            : preferred?.entity_type || secondary?.entity_type || '',
        flight_request_id:
          preferred?.flight_request_id || secondary?.flight_request_id || flightRequestId || '',
      }
    })

    return deduped
  }

  function buildReservationBusinessDeduplicationKey(item = {}) {
    const aircraftId = String(item?.assigned_aircraft_id || item?.aircraft_id || '').trim()
    const origin = String(item?.origin || '')
      .trim()
      .toUpperCase()
    const destination = String(item?.destination || '')
      .trim()
      .toUpperCase()
    const departureDateTime = String(item?.date || item?.departure_datetime || '').trim()
    const passengers = String(item?.passengers || '').trim()

    if (!aircraftId || !origin || !destination || !departureDateTime) {
      return ''
    }

    return [aircraftId, origin, destination, departureDateTime, passengers].join('::')
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
      const currentReservation = nextReservations[index] || {}
      const mergedAircraftHold = buildResolvedAircraftHold(
        reservation?.frontend_state?.aircraft_hold,
        reservation?.aircraft_hold,
        currentReservation?.frontend_state?.aircraft_hold,
        currentReservation?.aircraft_hold,
        reservation,
        currentReservation,
      )
      nextReservations[index] = {
        ...currentReservation,
        ...reservation,
        frontend_state:
          currentReservation.frontend_state || reservation.frontend_state || mergedAircraftHold
            ? {
                ...(currentReservation.frontend_state || {}),
                ...(reservation.frontend_state || {}),
                ...(mergedAircraftHold ? { aircraft_hold: mergedAircraftHold } : {}),
                ...(String(
                  reservation?.frontend_state?.quote_key ||
                    currentReservation?.frontend_state?.quote_key ||
                    mergedAircraftHold?.quote_key ||
                    '',
                ).trim()
                  ? {
                      quote_key: String(
                        reservation?.frontend_state?.quote_key ||
                          currentReservation?.frontend_state?.quote_key ||
                          mergedAircraftHold?.quote_key ||
                          '',
                      ).trim(),
                    }
                  : {}),
              }
            : undefined,
        entity_type:
          currentReservation.entity_type === 'reservation' || reservation.is_reservation
            ? 'reservation'
            : reservation.entity_type || currentReservation.entity_type || '',
        is_reservation: Boolean(currentReservation.is_reservation || reservation.is_reservation),
        flight_request_id:
          reservation.flight_request_id || currentReservation.flight_request_id || '',
        summary_only: false,
      }
    } else {
      nextReservations.unshift({
        ...reservation,
        summary_only: false,
      })
    }

    reservations.value = dedupeClientReservations(nextReservations)
  }

  function reservationHasAircraftImage(reservation = {}) {
    if (!reservation || typeof reservation !== 'object') return false

    const snapshot =
      reservation.aircraft_snapshot && typeof reservation.aircraft_snapshot === 'object'
        ? reservation.aircraft_snapshot
        : {}
    const visibilityPayload =
      reservation.visibility_payload && typeof reservation.visibility_payload === 'object'
        ? reservation.visibility_payload
        : {}
    const aircraftRecord =
      visibilityPayload.aircraft && typeof visibilityPayload.aircraft === 'object'
        ? visibilityPayload.aircraft
        : {}
    const imageCollections = [
      reservation.images,
      reservation.matched_options,
      reservation.matches,
      snapshot.images,
      snapshot.gallery,
      snapshot.gallery_images,
      aircraftRecord.images,
      aircraftRecord.gallery,
      aircraftRecord.gallery_images,
    ]

    if (
      reservation.aircraft_image ||
      reservation.image_url ||
      visibilityPayload.aircraft_image ||
      snapshot.main_image ||
      snapshot.main_image_url ||
      snapshot.image_url ||
      aircraftRecord.main_image ||
      aircraftRecord.main_image_url ||
      aircraftRecord.image_url
    ) {
      return true
    }

    return imageCollections.some(
      (collection) =>
        Array.isArray(collection) && collection.some((item) => item && typeof item === 'object'),
    )
  }

  function reservationNeedsMediaHydration(reservation = {}) {
    if (reservationHasAircraftImage(reservation)) return false

    const reservationId = String(reservation?.flight_request_id || reservation?.id || '').trim()
    if (!reservationId) return false

    return Boolean(
      reservation?.summary_only ||
      reservation?.aircraft ||
      reservation?.aircraft_model ||
      reservation?.assigned_aircraft_model ||
      reservation?.visibility_payload?.aircraft_model,
    )
  }

  async function hydrateSelectedReservationDetail() {
    const reservation = selectedReservation.value
    const directReservationId = String(reservation?.id || '').trim()
    const reservationId = String(reservation?.flight_request_id || directReservationId || '').trim()

    if (reservation?.frontend_state?.availability_conflict === true) {
      return
    }

    const shouldHydrate = reservation?.summary_only || reservationNeedsMediaHydration(reservation)

    if (!shouldHydrate || !reservationId || reservationDetailRequestIds.has(reservationId)) {
      return
    }

    reservationDetailRequestIds.add(reservationId)

    try {
      const shouldLoadReservationDetail =
        Boolean(reservation?.is_reservation) ||
        ['contrato', 'pago', 'reserva-confirmada', 'soporte'].includes(props.section)

      const detail = shouldLoadReservationDetail
        ? await getClientReservation(directReservationId || reservationId, {
            timeoutMs: CLIENT_TRIPS_TIMEOUT_MS,
          })
        : await getClientTrip(reservationId, {
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

  async function loadCatalogData({ silent = false } = {}) {
    if (catalogRequestPromise) return catalogRequestPromise

    if (!silent) {
      loadingServerData.value = true
    }
    serverSearchError.value = ''

    catalogRequestPromise = (async () => {
      try {
        const [destinationsResult, plansResult] = await Promise.allSettled([
          getClientDestinations(),
          getClientFlightPackages(),
        ])

        const destinations =
          destinationsResult.status === 'fulfilled' ? destinationsResult.value : []
        const plans = plansResult.status === 'fulfilled' ? plansResult.value : []

        featuredDestinations.value = destinations
        flightPackages.value = plans
        ensureDefaultPriority(plans)
        return {
          destinations,
          plans,
        }
      } finally {
        catalogRequestPromise = null
        if (!silent) {
          loadingServerData.value = false
        }
      }
    })()

    return catalogRequestPromise
  }

  function shouldLoadReservationsForCurrentSection() {
    return activeSection.value === 'viajes' || needsReservationContext.value
  }

  async function loadReservationsAfterPaint({ silent = false } = {}) {
    await waitForPortalFirstPaint()
    return refreshReservations({ silent })
  }

  onMounted(async () => {
    redirectLegacyInProgressSection()
    restoreQuotePreview()
    setAircraftHold(readAircraftHoldContext())
    startAircraftHoldCountdown()
    await Promise.resolve(
      auth.refreshSession({
        force: true,
        preferCache: false,
        allowServerErrorFallback: false,
      }),
    ).catch(() => null)
    await refreshCommercialAccessStatus({ forceSessionRefresh: true }).catch(() => null)
    ensureCommercialAccessPaymentRouteEligibility()

    if (activeSection.value === 'reservar') {
      await loadCatalogData({ silent: false })
    } else if (isResultsSection.value && submittedQuotePayload.value) {
      await refreshSearchResults({ silent: false }).catch(() => null)
    } else if (shouldLoadReservationsForCurrentSection()) {
      void loadReservationsAfterPaint({ silent: false })
    }

    removeWorkflowSyncSubscription = subscribeWorkflowSync((payload = {}) => {
      if (payload.scope !== 'reservation-workflow') return
      scheduleWorkflowSyncRefresh(payload)
    })
  })

  watch(
    () => [
      props.section,
      route.query.accessPayment,
      auth.access?.commercial_access?.free_quotes_used,
      auth.access?.commercial_access?.remaining_free_quotes,
      auth.access?.commercial_access?.has_paid_access,
      auth.access?.free_quotes_used,
      auth.access?.remaining_free_quotes,
      auth.access?.has_paid_access,
      auth.user?.free_quotes_used,
      auth.user?.has_paid_access,
    ],
    () => {
      ensureCommercialAccessPaymentRouteEligibility()
    },
    { immediate: true },
  )

  watch(
    () => [props.section, route.query.accessPayment, commercialAccessPaymentMode.value],
    () => {
      if (!commercialAccessPaymentMode.value) return
      if (commercialAccessCheckoutReturnPending.value) return
      void refreshCommercialAccessStatus({ forceSessionRefresh: false }).catch(() => null)
    },
    { immediate: true },
  )

  watch(
    () => [
      props.section,
      route.query.checkout,
      route.query.session_id,
      route.query.checkout_session_id,
      routeId.value,
      commercialAccessPaymentMode.value,
      commercialAccessCheckoutReturnMode.value,
    ],
    () => {
      void finalizeCommercialAccessCheckoutReturn()
      void finalizeReservationCheckoutReturn()
    },
    { immediate: true },
  )

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

  watch(
    () => selectedReservation.value?.frontend_state?.aircraft_hold,
    (nextHold) => {
      const normalizedHold = normalizeAircraftHold(nextHold)
      if (normalizedHold?.hold_id) {
        setAircraftHold(normalizedHold)
      }
    },
    { immediate: true },
  )

  watch([submittedItinerary, aircraftOptions], () => {
    persistQuotePreview()
  })

  watch(
    () => [aircraftHold.value?.hold_id || '', holdHasExpired.value],
    ([holdId, expired]) => {
      if (holdId && expired) {
        void handleAircraftHoldExpiration()
      }
    },
    { immediate: true },
  )

  watch(
    () => props.section,
    () => {
      redirectLegacyInProgressSection()
    },
  )

  watch(
    () => [props.section, canRenderReservationWorkflow.value, reservationContextId.value],
    () => {
      scheduleReservationConfirmedRedirect()
    },
    { immediate: true },
  )

  watch(
    () => [
      props.section,
      hasReservationsLoaded.value,
      routeId.value,
      selectedReservation.value?.id || '',
      selectedReservation.value?.flight_request_id || '',
      selectedReservation.value?.is_reservation === true,
    ],
    () => {
      void ensureContractReservationContext()
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    clearReservationsPolling()
    clearWorkflowSyncRefreshTimer()
    clearSignedContractSyncTimer()
    clearReservationConfirmedRedirectTimer()
    clearAircraftHoldCountdown()
    destroyStripePaymentElement()
    if (conciergeAutoReplyTimer) {
      window.clearTimeout(conciergeAutoReplyTimer)
      conciergeAutoReplyTimer = null
    }

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
        searchForm.legs = [
          createEmptyLeg({
            origin: searchForm.origin,
            originAirport: searchForm.originAirport,
            destination: searchForm.destination,
            destinationAirport: searchForm.destinationAirport,
            date: searchForm.departureDate,
            time: searchForm.departureTime || '09:00',
          }),
        ]
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
    () => [
      props.section,
      quoteResultsNavigationPending.value,
      submittedQuotePayload.value ? 'ready' : '',
      commercialAccessPaymentMode.value,
      commercialAccessCheckoutReturnMode.value,
      reservationCheckoutReturnMode.value,
      needsReservationContext.value,
    ],
    ([
      section,
      pendingNavigation,
      hasQuotePayload,
      accessPaymentMode,
      accessCheckoutReturnMode,
      reservationCheckoutMode,
      hasReservationContext,
    ]) => {
      if (!pendingNavigation || !hasQuotePayload) return
      if (
        accessPaymentMode ||
        accessCheckoutReturnMode ||
        reservationCheckoutMode ||
        hasReservationContext
      )
        return
      if (
        !['viajes', 'historial', 'pago', 'contrato', 'reserva-confirmada'].includes(
          String(section || '').trim(),
        )
      )
        return

      router.replace({ name: 'cliente', params: { section: 'resultados' } })
    },
  )

  watch(
    () => [
      props.section,
      quoteResultsVisible.value,
      submittedQuotePayload.value ? 'ready' : '',
      routeId.value,
      selectedReservation.value?.id || '',
      selectedReservation.value?.flight_request_id || '',
      commercialAccessPaymentMode.value,
      commercialAccessCheckoutReturnMode.value,
      reservationCheckoutReturnMode.value,
    ],
    ([
      section,
      showingResults,
      hasQuotePayload,
      currentRouteId,
      reservationId,
      flightRequestId,
      accessPaymentMode,
      accessCheckoutReturnMode,
      reservationCheckoutMode,
    ]) => {
      if (String(section || '').trim() !== 'viajes') return
      if (!showingResults || !hasQuotePayload) return
      if (currentRouteId || reservationId || flightRequestId) return
      if (accessPaymentMode || accessCheckoutReturnMode || reservationCheckoutMode) return

      router.replace({ name: 'cliente', params: { section: 'resultados' } })
    },
  )

  watch(
    () => props.section,
    () => {
      startReservationsPolling()
      if (shouldAutoRefreshTrips()) {
        void refreshReservations({ silent: true })
      }
      if (
        isResultsSection.value &&
        submittedQuotePayload.value &&
        !aircraftOptions.value.length &&
        !searching.value
      ) {
        void refreshSearchResults({ silent: true })
      }
      if (activeSection.value === 'reservar' && !flightPackages.value.length) {
        void loadCatalogData({ silent: true })
      }
      if (shouldLoadReservationsForCurrentSection() && !reservations.value.length) {
        void loadReservationsAfterPaint({ silent: false })
      }
      alignReservationWorkflowRoute()
    },
  )

  watch(
    () => [
      props.section,
      routeId.value,
      routeSubsection.value,
      reservations.value.length,
      loadingServerData.value,
      refreshingReservations.value,
      selectedReservation.value?.id || '',
      selectedReservation.value?.flight_request_id || '',
      selectedReservation.value?.workflow_status || '',
      selectedReservation.value?.status || '',
      selectedReservation.value?.booking_status || '',
    ],
    () => {
      alignReservationWorkflowRoute()
    },
    { immediate: true },
  )

  return portalBindings
}
