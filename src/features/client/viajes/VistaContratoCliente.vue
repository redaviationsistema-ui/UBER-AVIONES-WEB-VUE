<script setup>
import { computed, ref } from 'vue'
import { buildFrontendUrl } from '../../../lib/frontendUrl'
import { featuredAirports } from '../../../utils/airports'

const props = defineProps({
  reservation: { type: Object, default: null },
  reservationId: { type: [String, Number], default: '' },
  customerName: { type: String, default: '' },
  submitting: { type: Boolean, default: false },
  readOnly: { type: Boolean, default: false },
})



const emit = defineEmits(['confirm'])
const baseUrl = import.meta.env.BASE_URL
const logoSrc = `${baseUrl}logo.png`
const contractHeaderSrc = `${baseUrl}MARGEN/image.png`
const contractRoot = ref(null)
const supportPhones = ['+52 558 618 6576', '+52 722 112 6671', '+1 305 464 6394']
const supportEmail = 'sales@redskyg.com'
const supportWebsite = 'https://redskyg.com/mx'
const supportPhonesLabel = supportPhones.join(' | ')
const clientSignatureAnchor = '/sig_cliente/'
const signatureError = ref('')

function resolvePublicAssetUrl(assetPath = '') {
  const normalizedPath = String(assetPath || '').replace(/^\/+/, '')
  const normalizedBase = String(import.meta.env.BASE_URL || '/')
  const basePrefix = normalizedBase.endsWith('/') ? normalizedBase : `${normalizedBase}/`
  const relativePath = `${basePrefix}${normalizedPath}`.replace(/([^:]\/)\/+/g, '$1')

  if (typeof window === 'undefined') {
    return relativePath
  }

  return new URL(relativePath, window.location.origin).toString()
}

async function convertPublicAssetToDataUrl(assetPath = '') {
  if (typeof window === 'undefined') {
    return resolvePublicAssetUrl(assetPath)
  }

  try {
    const assetUrl = resolvePublicAssetUrl(assetPath)
    const response = await fetch(assetUrl)
    if (!response.ok) return assetUrl

    const blob = await response.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(String(reader.result || assetUrl))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  } catch {
    return resolvePublicAssetUrl(assetPath)
  }
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

function airportDisplay(code = '', airportPayload = null) {
  if (airportPayload?.city && (airportPayload?.code || airportPayload?.iata)) {
    return `${airportPayload.city} (${airportPayload.code || airportPayload.iata})`
  }

  const airport = airportMeta(code)
  if (!airport) return String(code || 'Por confirmar')
  return `${airport.city} (${airport.code || airport.iata})`
}

const SPANISH_MONTH_INDEX = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
}

function parseFlexibleDate(value = '') {
  if (!value) return null

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value
  }

  const parsed = new Date(value)
  if (!Number.isNaN(parsed.getTime())) return parsed

  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
  const spanishMatch = normalized.match(
    /(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})(?:.*?(\d{1,2}):(\d{2})(?:\s*([ap])\.?\s*m\.?)?)?/i,
  )

  if (!spanishMatch) return null

  const [, dayRaw, monthRaw, yearRaw, hourRaw = '0', minuteRaw = '0', meridiem = ''] = spanishMatch
  const normalizedMonth = monthRaw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const monthIndex = SPANISH_MONTH_INDEX[normalizedMonth]
  if (monthIndex === undefined) return null

  let hours = Number(hourRaw)
  const minutes = Number(minuteRaw)
  if (meridiem === 'p' && hours < 12) hours += 12
  if (meridiem === 'a' && hours === 12) hours = 0

  const date = new Date(Number(yearRaw), monthIndex, Number(dayRaw), hours, minutes)
  return Number.isNaN(date.getTime()) ? null : date
}

function padTwoDigits(value) {
  return String(value).padStart(2, '0')
}

function formatDateTime(value = '') {
  if (!value) return 'Fecha por confirmar'

  const parsed = parseFlexibleDate(value)
  if (!parsed || Number.isNaN(parsed.getTime())) return String(value)

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
}

function formatDate(value = '') {
  if (!value) return 'Fecha por confirmar'

  const parsed = parseFlexibleDate(value)
  if (!parsed || Number.isNaN(parsed.getTime())) return String(value)

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(parsed)
}

function formatTime(value = '') {
  if (!value) return 'Por confirmar'

  const parsed = parseFlexibleDate(value)
  if (!parsed || Number.isNaN(parsed.getTime())) return String(value)

  const hours = parsed.getHours()
  const minutes = parsed.getMinutes()
  const meridiem = hours >= 12 ? 'p.m.' : 'a.m.'
  const hour12 = hours % 12 || 12

  return `${padTwoDigits(hour12)}:${padTwoDigits(minutes)} ${meridiem}`
}

function formatPrintableDate(value = '') {
  if (!value) return 'Fecha por confirmar'

  const parsed = parseFlexibleDate(value)
  if (!parsed || Number.isNaN(parsed.getTime())) return String(value)

  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parsed)
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0))
}

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

function parsePrice(value) {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0

  const normalized = String(value)
    .trim()
    .replace(/[^\d,.-]/g, '')

  if (!normalized) return 0

  if (normalized.includes(',') && normalized.includes('.')) {
    const parsed =
      normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
        ? Number(normalized.replace(/\./g, '').replace(',', '.'))
        : Number(normalized.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }

  if (/^\d{1,3}(,\d{3})+$/.test(normalized)) {
    const parsed = Number(normalized.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }

  if (/^\d{1,3}(\.\d{3})+$/.test(normalized)) {
    const parsed = Number(normalized.replace(/\./g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }

  const parsed = Number(normalized.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function pickFirstNonEmptyString(...candidates) {
  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim()
    if (normalized) return normalized
  }

  return ''
}

function contractHtmlContainsClientSignatureAnchor(html = '') {
  return String(html || '').includes(clientSignatureAnchor)
}

function injectClientSignatureAnchorIntoHtml(html = '') {
  const normalizedHtml = String(html || '')
  if (!normalizedHtml) return ''
  if (contractHtmlContainsClientSignatureAnchor(normalizedHtml)) return normalizedHtml

  const anchorMarkup = `
    <div data-docusign-anchor="client-signature" style="margin-top:8px;text-align:center;">
      <span style="display:inline-block;color:#f8f2e6;font-size:2px;line-height:2px;">${clientSignatureAnchor}</span>
    </div>
  `

  if (normalizedHtml.includes('</body>')) {
    return normalizedHtml.replace('</body>', `${anchorMarkup}\n</body>`)
  }

  return `${normalizedHtml}\n${anchorMarkup}`
}

function parsePassengerCount(value) {
  if (value === null || value === undefined || value === '') return 0

  const rawMatch = String(value).match(/(\d+(?:\.\d+)?)/)
  const amount = Number(rawMatch?.[1] || 0)
  return Number.isFinite(amount) ? amount : 0
}

function listRequestMatches(reservation = {}) {
  const collections = [reservation.matches, reservation.matched_options]
  return collections.flatMap((items) =>
    Array.isArray(items) ? items.filter((item) => item && typeof item === 'object') : [],
  )
}

function normalizeWorkflowToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function pickPreferredClientMatch(reservation = {}) {
  const matches = listRequestMatches(reservation)
  if (!matches.length) return null

  const assignedMatchId = reservation.match_id || reservation.matched_option_id || null
  if (assignedMatchId) {
    const exactMatch = matches.find(
      (match) =>
        String(match?.match_id || match?.matched_option_id || match?.id || '') ===
        String(assignedMatchId),
    )
    if (exactMatch) return exactMatch
  }

  const assignedAircraftId = reservation.assigned_aircraft_id || reservation.aircraft_id || null
  if (assignedAircraftId) {
    const assignedMatch = matches.find(
      (match) =>
        String(match?.aircraft_id || match?.aircraft?.id || '') === String(assignedAircraftId),
    )
    if (assignedMatch) return assignedMatch
  }

  const acceptedMatch =
    matches.find((match) => {
      const normalizedStatus = normalizeWorkflowToken(
        match.status || match.workflow_status || match.state,
      )
      return ['accepted', 'aceptada', 'aceptado', 'approved', 'aprobada', 'matched'].includes(
        normalizedStatus,
      )
    }) || null

  return acceptedMatch || matches[0]
}

function resolveReservationFinalPrice(reservation = {}) {
  const pricingContext =
    reservation.pricing_context && typeof reservation.pricing_context === 'object'
      ? reservation.pricing_context
      : {}
  const snapshotRecord =
    reservation.aircraft_snapshot && typeof reservation.aircraft_snapshot === 'object'
      ? reservation.aircraft_snapshot
      : {}
  const preferredMatch = pickPreferredClientMatch(reservation) || {}

  return (
    reservation.total_amount ||
    reservation.selected_card_price ||
    pricingContext.selected_card_price ||
    reservation.final_price ||
    reservation.total ||
    reservation.estimated_total ||
    reservation.final_price_display ||
    reservation.formatted_final_price ||
    reservation.quote_total ||
    reservation.quote ||
    reservation.amount ||
    reservation.net_amount ||
    pricingContext.total ||
    pricingContext.final_price ||
    snapshotRecord.selected_card_price ||
    snapshotRecord.total ||
    snapshotRecord.final_price ||
    preferredMatch.selected_card_price ||
    preferredMatch.total ||
    preferredMatch.final_price ||
    preferredMatch.estimated_price ||
    preferredMatch.price ||
    preferredMatch.quote_total ||
    preferredMatch.quote ||
    0
  )
}

function resolveReservationChargeBreakdown(reservation = {}) {
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
      0,
  )

  return {
    flightCost,
    stripeFee,
    administrativeFee,
    totalAmount,
  }
}

const reservationCode = computed(() => {
  const liveReservationCode = String(props.reservation?.reservation_code || '').trim()
  if (liveReservationCode) return liveReservationCode

  if (resolvedContractSnapshot.value.reservation_code) {
    return resolvedContractSnapshot.value.reservation_code
  }

  const baseId = String(props.reservationId || props.reservation?.id || '').trim()
  return baseId ? `SKY-${baseId.padStart(4, '0')}` : 'SKY-PENDIENTE'
})

const itinerarySegments = computed(() => {
  const reservation = props.reservation || {}

  if (Array.isArray(reservation.legs) && reservation.legs.length) {
    return reservation.legs.map((leg, index) => ({
      key: leg.id || `leg-${index + 1}`,
      order: leg.leg_order || index + 1,
      origin: airportDisplay(leg.origin),
      destination: airportDisplay(leg.destination),
      departure: leg.departure_datetime || '',
    }))
  }

  if (Array.isArray(reservation.requirements) && reservation.requirements.length) {
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
        origin: airportDisplay(leg.origin, leg.originAirport),
        destination: airportDisplay(leg.destination, leg.destinationAirport),
        departure: leg.departure_datetime || (leg.date ? `${leg.date}T${leg.time || '09:00'}` : ''),
      })),
    ]
  }

  if (resolvedContractSnapshot.value.itinerary_segments.length) {
    return resolvedContractSnapshot.value.itinerary_segments.map((segment, index) => ({
      key: `snapshot-leg-${index + 1}`,
      order: segment.order || index + 1,
      origin: segment.origin || 'Origen por confirmar',
      destination: segment.destination || 'Destino por confirmar',
      departure: segment.departure || '',
    }))
  }

  return [
    {
      key: 'single-leg',
      order: 1,
      origin: airportDisplay(reservation.origin),
      destination: airportDisplay(reservation.destination),
      departure: reservation.date || '',
    },
  ].filter(
    (segment) => segment.origin !== 'Por confirmar' || segment.destination !== 'Por confirmar',
  )
})

const routePath = computed(() => {
  const segments = itinerarySegments.value.filter(
    (segment) => segment.origin || segment.destination,
  )
  if (!segments.length) return []

  const path = []
  const firstOrigin = String(segments[0]?.origin || '').trim()
  if (firstOrigin) path.push(firstOrigin)

  segments.forEach((segment) => {
    const destination = String(segment.destination || '').trim()
    if (!destination) return
    if (path[path.length - 1] !== destination) {
      path.push(destination)
    }
  })

  return path
})

const routeDisplay = computed(() => {
  if (routePath.value.length >= 2) {
    return routePath.value.join(' → ')
  }

  const reservation = props.reservation || {}
  const origin = airportDisplay(reservation.origin)
  const destination = airportDisplay(reservation.destination)
  const liveRoute = [origin, destination].filter(Boolean).join(' → ')
  if (liveRoute) return liveRoute

  if (resolvedContractSnapshot.value.route) {
    return resolvedContractSnapshot.value.route
  }

  return `Contrato ${props.reservationId || reservation.id || ''}`
})

const passengerLabel = computed(() => {
  const aircraftCapacity =
    parsePassengerCount(props.reservation?.aircraft_capacity) ||
    parsePassengerCount(props.reservation?.aircraft_snapshot?.capacity)
  if (aircraftCapacity) {
    return `${aircraftCapacity} ${aircraftCapacity === 1 ? 'pasajero' : 'pasajeros'}`
  }

  const amount = parsePassengerCount(props.reservation?.passengers)
  if (amount) {
    return `${amount} ${amount === 1 ? 'pasajero' : 'pasajeros'}`
  }

  if (resolvedContractSnapshot.value.passengers) {
    return resolvedContractSnapshot.value.passengers
  }

  return 'Pasajeros por confirmar'
})

const aircraftLabel = computed(() => {
  return (
    props.reservation?.assigned_aircraft_model ||
    props.reservation?.aircraft_model ||
    props.reservation?.aircraft_name ||
    props.reservation?.aircraft ||
    props.reservation?.aircraft_category ||
    resolvedContractSnapshot.value.aircraft ||
    'Aeronave por confirmar'
  )
})

const aircraftCategory = computed(
  () =>
    props.reservation?.aircraft_category ||
    resolvedContractSnapshot.value.aircraft_category ||
    'Categoría ejecutiva validada',
)
const serviceTier = computed(
  () =>
    props.reservation?.flight_package ||
    props.reservation?.service_tier ||
    resolvedContractSnapshot.value.service_tier ||
    'Servicio ejecutivo privado',
)
const operatorLabel = computed(
  () =>
    props.reservation?.operator ||
    props.reservation?.provider_name ||
    resolvedContractSnapshot.value.operator ||
    'Asignado por Sky Group previo a la operación',
)
const commercialProviderLabel = 'RED AVIATION COMPANY S.A. DE C.V.'
const customerLabel = computed(
  () =>
    props.customerName ||
    props.reservation?.client_name ||
    props.reservation?.customer_name ||
    props.reservation?.company_name ||
    resolvedContractSnapshot.value.customer_name ||
    'Cliente de SKY Group',
)
const customerAddress = computed(
  () =>
    props.reservation?.client_address ||
    props.reservation?.billing_address ||
    resolvedContractSnapshot.value.customer_address ||
    'Domicilio por confirmar',
)
const customerRepresentative = computed(
  () =>
    props.reservation?.client_representative ||
    props.reservation?.representative_name ||
    resolvedContractSnapshot.value.customer_representative ||
    customerLabel.value,
)
const contractRecord = computed(() =>
  props.reservation?.contract && typeof props.reservation.contract === 'object'
    ? props.reservation.contract
    : {},
)
const termsSnapshot = computed(() =>
  contractRecord.value.terms_snapshot && typeof contractRecord.value.terms_snapshot === 'object'
    ? contractRecord.value.terms_snapshot
    : {},
)
const persistedContractSnapshot = computed(() =>
  termsSnapshot.value.client_contract_snapshot &&
  typeof termsSnapshot.value.client_contract_snapshot === 'object'
    ? termsSnapshot.value.client_contract_snapshot
    : {},
)
const persistedBackendContractHtml = computed(() =>
  pickFirstNonEmptyString(
    termsSnapshot.value.full_contract_html,
    termsSnapshot.value.document_html,
    termsSnapshot.value.contract_html,
    contractRecord.value.full_contract_html,
    contractRecord.value.document_html,
    contractRecord.value.contract_html,
    contractRecord.value.html,
  ),
)
const preparedBackendContractHtml = computed(() =>
  injectClientSignatureAnchorIntoHtml(persistedBackendContractHtml.value),
)
const persistedBackendContractText = computed(() =>
  pickFirstNonEmptyString(
    termsSnapshot.value.full_contract_text,
    termsSnapshot.value.contract_plain_text,
    contractRecord.value.full_contract_text,
    contractRecord.value.contract_plain_text,
    contractRecord.value.plain_text,
  ),
)
const persistedDocumentSource = computed(() =>
  pickFirstNonEmptyString(
    termsSnapshot.value.document_source,
    contractRecord.value.document_source,
    persistedBackendContractHtml.value ? 'backend_contract_snapshot' : '',
  ),
)
const persistedSourceContractPath = computed(() =>
  pickFirstNonEmptyString(
    termsSnapshot.value.source_contract_path,
    contractRecord.value.source_contract_path,
    contractRecord.value.document_url,
    contractRecord.value.pdf_url,
  ),
)
const hasBackendContractHtml = computed(() => Boolean(persistedBackendContractHtml.value))
const backendContractNeedsInjectedAnchor = computed(
  () =>
    Boolean(persistedBackendContractHtml.value) &&
    !contractHtmlContainsClientSignatureAnchor(persistedBackendContractHtml.value),
)
const resolvedContractSnapshot = computed(() => ({
  contract_version:
    persistedContractSnapshot.value.contract_version ||
    termsSnapshot.value.contract_version ||
    'client_contract_v1',
  reservation_id:
    persistedContractSnapshot.value.reservation_id ||
    String(props.reservationId || props.reservation?.id || '').trim(),
  flight_request_id:
    persistedContractSnapshot.value.flight_request_id ||
    String(props.reservation?.flight_request_id || props.reservation?.request_id || '').trim(),
  reservation_code:
    persistedContractSnapshot.value.reservation_code ||
    termsSnapshot.value.reservation_code ||
    props.reservation?.reservation_code ||
    reservationCode.value,
  route: persistedContractSnapshot.value.route || '',
  departure_date: persistedContractSnapshot.value.departure_date || '',
  aircraft: persistedContractSnapshot.value.aircraft || '',
  aircraft_category: persistedContractSnapshot.value.aircraft_category || '',
  service_tier: persistedContractSnapshot.value.service_tier || '',
  passengers: persistedContractSnapshot.value.passengers || '',
  operator:
    persistedContractSnapshot.value.operator ||
    termsSnapshot.value.operator_name ||
    termsSnapshot.value.provider_name ||
    '',
  customer_name: persistedContractSnapshot.value.customer_name || '',
  customer_representative: persistedContractSnapshot.value.customer_representative || '',
  customer_address: persistedContractSnapshot.value.customer_address || '',
  contract_date: persistedContractSnapshot.value.contract_date || '',
  overnight: persistedContractSnapshot.value.overnight || '',
  final_price:
    persistedContractSnapshot.value.final_price ||
    termsSnapshot.value.amount ||
    termsSnapshot.value.total_amount ||
    '',
  deposit_amount: persistedContractSnapshot.value.deposit_amount || '',
  itinerary_segments: Array.isArray(persistedContractSnapshot.value.itinerary_segments)
    ? persistedContractSnapshot.value.itinerary_segments
    : [],
}))
const contractDate = computed(
  () =>
    resolvedContractSnapshot.value.contract_date ||
    formatDate(
      contractRecord.value.signed_at ||
        contractRecord.value.generated_at ||
        props.reservation?.updated_at ||
        props.reservation?.created_at ||
        new Date(),
    ),
)
const docusignStatusLabel = computed(() => {
  const rawValue = String(
    contractRecord.value?.docusign_status ||
      termsSnapshot.value?.docusign_status ||
      contractRecord.value?.status ||
      '',
  )
    .trim()
    .toLowerCase()

  if (!rawValue || rawValue === 'generated') return 'Pendiente de envio a firma digital'
  if (rawValue === 'completed') return 'Firmado digitalmente'
  if (rawValue === 'sent') return 'Pendiente de firma digital mediante DocuSign'
  if (rawValue === 'delivered') return 'Firma solicitada mediante DocuSign'
  return rawValue
})
const departureDate = computed(() => {
  const liveDeparture = props.reservation?.date || itinerarySegments.value[0]?.departure || ''
  if (liveDeparture) {
    return formatDateTime(liveDeparture)
  }

  return resolvedContractSnapshot.value.departure_date || 'Fecha por confirmar'
})

function looksLikePendingDeposit(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .includes('por confirmar')
}

function inferOvernightNights(segments = []) {
  if (!Array.isArray(segments) || segments.length < 2) return 0

  const timestamps = segments
    .map((segment) => parseFlexibleDate(segment.departure))
    .filter((value) => value instanceof Date && !Number.isNaN(value.getTime()))
    .map((value) => value.getTime())

  if (timestamps.length < 2) return 0

  const first = Math.min(...timestamps)
  const last = Math.max(...timestamps)
  const millisecondsPerDay = 1000 * 60 * 60 * 24
  return Math.max(Math.round((last - first) / millisecondsPerDay), 0)
}

const overnightLabel = computed(() => {
  const reservation = props.reservation || {}
  const pricingContext =
    reservation.pricing_context && typeof reservation.pricing_context === 'object'
      ? reservation.pricing_context
      : {}
  const nights = Number(
    reservation.overnight_nights ||
      reservation.itinerary_days ||
      pricingContext.overnight_nights ||
      pricingContext.itinerary_days ||
      pricingContext?.extras?.overnight_nights ||
      inferOvernightNights(itinerarySegments.value) ||
      0,
  )

  if (nights) {
    return `${nights} ${nights === 1 ? 'pernocta' : 'pernoctas'}`
  }

  if (
    resolvedContractSnapshot.value.overnight &&
    !String(resolvedContractSnapshot.value.overnight).toLowerCase().includes('sin pernocta')
  ) {
    return resolvedContractSnapshot.value.overnight
  }

  return 'Sin pernocta registrada'
})

const finalPrice = computed(() => {
  const reservation = props.reservation || {}
  const resolvedFinalPrice = resolveReservationFinalPrice(reservation)
  const numericFinalPrice = parsePrice(resolvedFinalPrice)

  return (
    reservation.formatted_final_price ||
    reservation.final_price_display ||
    (typeof resolvedFinalPrice === 'string' && resolvedFinalPrice.trim()
      ? resolvedFinalPrice
      : '') ||
    resolvedContractSnapshot.value.final_price ||
    (numericFinalPrice > 0 ? formatCurrency(numericFinalPrice) : 'Monto por confirmar')
  )
})

const finalPriceValue = computed(() => {
  const reservation = props.reservation || {}
  return parsePrice(
    reservation.formatted_final_price ||
      reservation.final_price_display ||
      resolveReservationFinalPrice(reservation) ||
      resolvedContractSnapshot.value.final_price ||
      0,
  )
})

const depositAmount = computed(() => {
  const reservation = props.reservation || {}
  const rawAmount = Number(reservation.deposit_amount || reservation.deposit || 0)
  if (rawAmount > 0) {
    return formatCurrency(rawAmount)
  }

  if (
    resolvedContractSnapshot.value.deposit_amount &&
    !looksLikePendingDeposit(resolvedContractSnapshot.value.deposit_amount)
  ) {
    return resolvedContractSnapshot.value.deposit_amount
  }

  const resolvedAmount =
    rawAmount > 0 ? rawAmount : finalPriceValue.value > 0 ? finalPriceValue.value * 0.5 : 0
  return resolvedAmount > 0 ? formatCurrency(resolvedAmount) : 'Depósito por definir'
})

const depositAmountValue = computed(() => {
  const reservation = props.reservation || {}
  const rawAmount = Number(reservation.deposit_amount || reservation.deposit || 0)
  if (rawAmount > 0) return rawAmount

  if (
    resolvedContractSnapshot.value.deposit_amount &&
    !looksLikePendingDeposit(resolvedContractSnapshot.value.deposit_amount)
  ) {
    const snapshotAmount = parsePrice(resolvedContractSnapshot.value.deposit_amount)
    if (snapshotAmount > 0) return snapshotAmount
  }

  return rawAmount > 0 ? rawAmount : finalPriceValue.value > 0 ? finalPriceValue.value * 0.5 : 0
})

const balanceAmount = computed(() => {
  const balance = Math.max(finalPriceValue.value - depositAmountValue.value, 0)
  return balance > 0 ? formatCurrency(balance) : formatCurrency(0)
})

const includesItems = [
  'Aeronave y tripulación asignada para la ruta contratada.',
  'Coordinación operativa y seguimiento comercial de SKY Group .',
  'Combustible y operación contemplados en la cotización validada.',
  'Uso de aeronave conforme al itinerario confirmado en este Anexo A.',
]

const excludesItems = [
  'Catering especial no contemplado expresamente.',
  'Transporte terrestre, hospedaje o concierge fuera del alcance contratado.',
  'Cambios de itinerario solicitados por el Cliente después de la firma.',
  'Tiempos de espera extraordinarios, permisos especiales o costos por reprogramación.',
]

const coverSummaryRows = computed(() => {
  const breakdown = resolveReservationChargeBreakdown(props.reservation || {})

  return [
    { label: 'Cliente', value: customerLabel.value },
    { label: 'Reserva', value: reservationCode.value },
    { label: 'Ruta', value: routeDisplay.value },
    { label: 'Aeronave', value: aircraftLabel.value },
    { label: 'Salida', value: departureDate.value },
    ...(breakdown.flightCost > 0
      ? [{ label: 'Flight cost', value: formatCurrency(breakdown.flightCost) }]
      : []),
    ...(breakdown.stripeFee > 0
      ? [{ label: 'Stripe fee', value: formatCurrency(breakdown.stripeFee) }]
      : []),
    ...(breakdown.administrativeFee > 0
      ? [{ label: 'Administrative fee', value: formatCurrency(breakdown.administrativeFee) }]
      : []),
    { label: 'Total', value: finalPrice.value },
  ]
})

const bankAccounts = [
  {
    bank: 'BANBAJÍO',
    account: '046 76313 20201',
    clabe: '0304 209000 4337 2636',
    beneficiary: 'TRANSPORTACIÓN EXITOSA BELLIKAI S.A. DE C.V.',
    rfc: 'TEB231030NU9',
  },
  {
    bank: 'BANREGIO',
    account: '247 96234 0011',
    clabe: '05842 0000 150761410',
    beneficiary: 'TRANSPORTACIÓN EXITOSA BELLIKAI S.A. DE C.V.',
    rfc: 'TEB231030NU9',
  },
  {
    bank: 'BBVA',
    account: '0122 912627',
    clabe: '01243 800122 9126272',
    beneficiary: 'TRANSPORTACIÓN EXITOSA BELLIKAI S.A. DE C.V.',
    rfc: 'TEB231030NU9',
  },
]

const considerations = computed(() => [
  'El Prestador del Servicio declara y garantiza que cuenta con las autorizaciones, permisos, licencias, certificaciones y capacidades operativas necesarias para proporcionar y/o coordinar servicios de aviación ejecutiva conforme a la legislación aplicable y a las condiciones operativas correspondientes, mismos que serán realizados conforme al itinerario establecido en la cotización correspondiente.',
  'El Prestador del Servicio declara y garantiza que cuenta con la capacidad corporativa, comercial y de coordinación necesarias para proporcionar y/o coordinar servicios de aviación ejecutiva conforme a la legislación aplicable y a las condiciones operativas correspondientes, pudiendo para tales efectos apoyarse en operadores aéreos autorizados, contratistas y/o terceros especializados para el cumplimiento de las obligaciones derivadas del presente Contrato.',
  `El Cliente declara que cuenta con la capacidad jurídica y, en su caso, con las facultades suficientes para celebrar el presente Contrato y obligarse en los términos del mismo, incluyendo la contratación de los servicios objeto del presente instrumento. Para efectos de esta reserva, el Cliente se identifica como ${customerLabel.value}.`,
])

const definitions = computed(() => [
  '1.1 “Aeronave”: Se refiere a cualquier aeronave asignada y especificada por el Prestador del Servicio en el Anexo A y/o cotización correspondiente para la ejecución de los servicios objeto del presente Contrato, incluyendo cualquier aeronave sustituta que resulte necesaria por razones operativas, técnicas, logísticas o de disponibilidad.',
  '1.2 “Autoridad de Aviación”: Se refiere a cualquier persona que de tiempo en tiempo esté facultada con control y supervisión, o tenga jurisdicción sobre el registro, aeronavegabilidad, operación u otros asuntos relacionados con la aviación civil en México o en cualquier otro país aplicable, incluyendo el país de destino y los países sobre los cuales la Aeronave deba volar para efectos del presente Contrato.',
  '1.3 “Día hábil”: Día en el cual los bancos en los Estados Unidos Mexicanos se encuentran abiertos para realizar transacciones del tipo requerido por este Contrato.',
  '1.4 “Depósito”: Monto en dólares referido en la Sección 4 de este Contrato y detallado en el Anexo A, requerido por el Prestador del Servicio para garantizar el cumplimiento por parte del Cliente de sus obligaciones conforme al presente Contrato.',
  '1.5 “Dólares” y el signo “USD$”: Cada uno hace referencia a la moneda de curso legal de los Estados Unidos de América, salvo que se indique expresamente lo contrario. En caso de que el Cliente realice pagos en moneda nacional, el Prestador del Servicio indicará el tipo de cambio aplicable para efectos de conversión y pago correspondiente.',
  '1.6 “Fecha de Entrada en Vigencia”: Fecha de firma del presente Contrato por las partes.',
  '1.7 “Servicios Complementarios”: Se refiere a los servicios adicionales que, en su caso, podrán ser coordinados o proporcionados por el Prestador del Servicio en relación con la operación del vuelo, incluyendo bebidas, alimentos ligeros, catering ejecutivo, asistencia personalizada u otros servicios similares, sujetos a disponibilidad operativa, logística aplicable y al tipo de servicio contratado.',
  '1.8 “Impuestos y Tasas”: Incluye, respecto de los servicios descritos en el Anexo A y/o en la cotización correspondiente, todos los impuestos presentes o futuros, derechos, tarifas aeroportuarias, contribuciones, cargos operativos, recargos y demás conceptos aplicables derivados de la operación de los servicios objeto del presente Contrato, conforme a la legislación aplicable.',
  '1.9 “Costo Total del Servicio”: Se refiere al monto total establecido en la cotización correspondiente por los servicios objeto del presente Contrato.',
])

const clauses = computed(() => [
  {
    title: '2. DURACIÓN',
    paragraphs: [
      'Las disposiciones de este Contrato entrarán en vigor a partir de la Fecha de Entrada en Vigencia y permanecerán vigentes hasta la finalización del vuelo.',
    ],
  },
  {
    title: '3. SERVICIOS CONTRATADOS',
    paragraphs: [
      `Con sujeción a la Sección 5 del presente Contrato, el Prestador del Servicio proporcionará y/o coordinará a favor del Cliente los servicios de aviación ejecutiva descritos en el Anexo A y/o en la cotización correspondiente, sujetos a disponibilidad operativa, condiciones aeronáuticas aplicables y demás términos y condiciones establecidos en el presente Contrato. Para esta reserva, el servicio corresponde a la ruta ${routeDisplay.value}, con salida programada para ${departureDate.value}, aeronave ${aircraftLabel.value}, categoría ${aircraftCategory.value} y ${passengerLabel.value}.`,
    ],
  },
  {
    title: '4. COSTO TOTAL DEL SERVICIO Y DEPÓSITO',
    paragraphs: [
      `Con sujeción a las Secciones 5 y 15 del presente Contrato, el Cliente pagará al Prestador del Servicio el Costo Total del Servicio respecto de los servicios objeto del presente Contrato, conforme al Anexo A, más los Impuestos y Tasas. Para esta operación, el costo total identificado en el flujo es ${finalPrice.value}.`,
    ],
  },
  {
    title: '5. CONDICIONES DE PAGO',
    paragraphs: [
      'El Cliente se compromete a pagar íntegramente al Prestador del Servicio, al menos siete (7) días naturales antes de la fecha de salida de cada vuelo, el Costo Total del Servicio establecido en el Anexo A respecto del vuelo correspondiente. Los Impuestos y Tasas deberán pagarse al Prestador del Servicio dentro de los siete (7) días posteriores al vuelo correspondiente.',
      'Todos los pagos del Costo Total del Servicio, más Impuestos y Tasas, así como cualquier otra cantidad a cargo del Cliente derivada del presente Contrato, deberán realizarse en dólares estadounidenses (USD$). En caso de que el Cliente efectúe el pago en moneda nacional, el Prestador del Servicio indicará el tipo de cambio aplicable para efectos de conversión correspondiente.',
      'Si algún pago vence en un día que no sea hábil, la fecha de vencimiento se trasladará al siguiente día hábil; siempre que, si dicho día cae en el mes siguiente, el vencimiento será el día hábil inmediatamente anterior.',
    ],
  },
  {
    title: '6. IMPUESTOS Y TASAS',
    paragraphs: [
      '6.1 El Cliente se compromete a pagar todos los Impuestos y Tasas definidos en la Sección 1.8 del presente Contrato, respecto de los servicios descritos en el Anexo A y/o en la cotización correspondiente, conforme a los términos y plazos establecidos en las Secciones 4 y 5 del presente Contrato.',
      '6.2 El Cliente será responsable del pago de los Impuestos y Tasas aplicables derivados de la operación del vuelo conforme a la cotización correspondiente. Dichos pagos deberán realizarse en dólares estadounidenses (USD$). En caso de efectuarse en moneda nacional, el Prestador del Servicio indicará el tipo de cambio aplicable para efectos de conversión y pago correspondiente.',
    ],
  },
  {
    title: '7. PUBLICIDAD',
    paragraphs: [
      'El Cliente no podrá utilizar el nombre, logotipo, imagen comercial, fotografías, videos, material audiovisual, denominaciones comerciales o marcas del Prestador del Servicio, ni imágenes relacionadas con la Aeronave o con la operación objeto del presente Contrato, en ningún material publicitario, promocional o comercial, sin el consentimiento previo y por escrito del Prestador del Servicio, el cual no podrá ser negado de manera irrazonable. Esta disposición será igualmente aplicable a cualquier tercero relacionado con el Cliente que tenga acceso a información, imágenes o material relacionado con la operación objeto del presente Contrato.',
    ],
  },
  {
    title: '8. EQUIPAJE',
    paragraphs: [
      'El transporte de equipaje estará sujeto a las limitaciones operativas, de seguridad y capacidad de la Aeronave asignada. El Prestador del Servicio podrá establecer restricciones razonables respecto del peso, dimensiones o contenido del equipaje conforme a criterios operativos y aeronáuticos aplicables.',
    ],
  },
  {
    title: '9. DECLARACIONES DEL PRESTADOR DEL SERVICIO',
    paragraphs: [
      'El Prestador del Servicio declara y garantiza al Cliente que las siguientes declaraciones y garantías serán verdaderas y correctas durante todo el período de vigencia de este Contrato:',
    ],
    items: [
      '9.1 El Prestador del Servicio está debidamente constituido, existe válidamente y se encuentra en buena situación legal conforme a las leyes de México.',
      'a. La Aeronave utilizada para las operaciones objeto de este Contrato será mantenida y operada en condiciones seguras y aeronavegables.',
      'i. Para cada vuelo, la Aeronave cumplirá y será operada de acuerdo con todas las leyes, normas y regulaciones de cualquier autoridad gubernamental a la que esté sujeta.',
      'ii. El Prestador del Servicio proporcionará personal suficiente, debidamente calificado, tanto de tripulación de vuelo como de cabina, así como personal de mantenimiento y otro necesario para operar y mantener la Aeronave según los horarios de vuelo establecidos en el Anexo A del presente Contrato.',
      '9.2 El Prestador del Servicio proporcionará el personal operativo, técnico y de vuelo razonablemente necesario para la correcta ejecución de los servicios objeto del presente Contrato.',
      '9.3 El Prestador del Servicio cumplirá con las disposiciones de cualquier póliza de seguro aplicable a la Aeronave y con sus obligaciones conforme a la Sección 10 del presente Contrato.',
      '9.4 El Prestador del Servicio mantendrá y conservará en vigor todas las licencias y permisos requeridos, incluyendo, sin limitación, el certificado de aeronavegabilidad y todas las licencias exigidas por ley.',
      '9.5 La firma de este Contrato por el Prestador del Servicio no contraviene ningún otro acuerdo u obligación a la que el Prestador del Servicio esté sujeto.',
      '9.6 Consentimientos y Aprobaciones: este Contrato está condicionado a la recepción oportuna por parte del Prestador del Servicio de todos los consentimientos y aprobaciones de cualquier autoridad gubernamental y de instalaciones de aterrizaje requeridos para operar los vuelos. El Prestador del Servicio hará esfuerzos comerciales razonables para obtenerlos, pero no tendrá otra responsabilidad que la devolución de cualquier pago recibido si no se obtienen los consentimientos a tiempo para la operación del vuelo contratado.',
      '9.7 Las operaciones internacionales realizadas conforme al presente Contrato podrán sujetarse a las disposiciones y limitaciones de responsabilidad previstas en los tratados internacionales aplicables en materia de aviación civil.',
    ],
  },
  {
    title: '10. SEGUROS',
    paragraphs: [
      '10.1 El Prestador del Servicio se compromete a mantener vigente, a su propio costo y durante toda la vigencia de este Contrato, seguros sobre la Aeronave que cubran responsabilidad civil frente a terceros, daños corporales y materiales, así como responsabilidad derivada de la operación de la Aeronave conforme a la legislación aplicable.',
    ],
  },
  {
    title: '11. EVENTOS DE INCUMPLIMIENTO Y TERMINACIÓN',
    paragraphs: ['11.1 Se considerará Evento de Incumplimiento cualquiera de los siguientes:'],
    items: [
      'a. Que el Cliente no pague el Costo Total del Servicio ni cualquier otra cantidad adeudada dentro de los cinco (5) Días Hábiles siguientes a la fecha de vencimiento.',
      'b. Que el Prestador del Servicio no opere un vuelo o incumpla con las obligaciones establecidas en el presente Contrato y no subsane dicho incumplimiento dentro de las veinticuatro (24) horas posteriores a la notificación escrita del Cliente.',
      'c. Que cualquiera de las partes no cumpla con cualquier otro convenio, condición o disposición de este Contrato y no subsane dicho incumplimiento dentro de siete (7) días naturales posteriores a la notificación de la parte no incumplidora.',
      'd. Que cualquiera de las partes suspenda voluntariamente todas o sustancialmente todas sus operaciones comerciales.',
      'e. Que cualquiera de las partes inicie procedimientos de quiebra, insolvencia, liquidación o protección de deudas, consienta tales procedimientos o se someta a ellos, y dichos procedimientos no sean objetados de buena fe dentro de cinco (5) días naturales, o consienta la designación de un receptor sobre su negocio y activos, o haga una cesión general en beneficio de los acreedores.',
      'f. Que un acreedor garantizado, receptor o autoridad judicial tome posesión de activos materiales de cualquiera de las partes.',
      'g. Que cualquiera de las partes suspenda pagos, no pague sus deudas en general o admita por escrito su imposibilidad de pago conforme venzan.',
      'h. Cancelación, terminación o no renovación de cualquier licencia, permiso o autorización requerida para el cumplimiento de las obligaciones bajo este Contrato.',
    ],
  },
  {
    title: '11.2 DERECHOS DE LA PARTE NO INCUMPLIDORA',
    paragraphs: [
      'Ante un Evento de Incumplimiento, la parte no incumplidora tendrá, además de otros derechos legales, el derecho de:',
    ],
    items: [
      'a. Hacer cumplir este Contrato y ser indemnizada conforme a la Sección 14.1.',
      'b. Terminar este Contrato sin responsabilidad hacia la parte incumplidora, mediante simple aviso, cesando todos los derechos de la parte incumplidora.',
      'i. Todos los montos adeudados.',
      'ii. Costos y gastos incurridos para ejercer derechos y remedios.',
      'iii. Cualquier daño directo.',
      'iv. Compensación de montos adeudados entre las partes.',
    ],
  },
  {
    title: '12. FUERZA MAYOR',
    paragraphs: [
      '12.1 Ninguna de las partes será responsable por retrasos o incumplimientos debido a causas fuera de su control, incluyendo, sin limitación: actos de Dios, actos gubernamentales, guerra civil, incendios, inundaciones, explosiones, terremotos, accidentes graves, epidemias, cuarentenas, huelgas, embargos, disturbios, insurrecciones, actos del enemigo público o daños a la Aeronave o instalaciones por causas fuera de su control razonable.',
      'El Prestador del Servicio no será responsable por modificaciones operativas, cambios de itinerario, desvíos, retrasos o cancelaciones derivados de eventos de fuerza mayor o circunstancias fuera de su control razonable.',
      'En caso de fuerza mayor, el Prestador del Servicio reembolsará al Cliente cualquier monto pagado, menos costos administrativos, operativos y fiscales con la documentación adecuada, por vuelos no operados.',
      '12.2 Ante fuerza mayor, el Cliente podrá cancelar uno o varios vuelos según el Anexo A, con intención de reanudar tan pronto se supere la fuerza mayor; o terminar el Contrato mediante aviso escrito con efecto inmediato, sin responsabilidad.',
    ],
  },
  {
    title: '13. INDEMNIZACIÓN',
    paragraphs: [
      '13.1 El Prestador del Servicio indemnizará y mantendrá indemne al Cliente, sus empleados, agentes, directores, contratistas y representantes frente a cualquier responsabilidad, costo, pérdida, daño, reclamación, demanda, acción judicial o gasto derivado total o parcialmente de este Contrato o de la operación de la Aeronave, salvo cuando sea atribuible directamente a negligencia grave o conducta dolosa del Cliente o sus representantes.',
      '13.2 El Cliente indemnizará y mantendrá indemne al Prestador del Servicio frente a pérdidas, gastos, daños, demandas y reclamaciones originadas por negligencia grave o conducta dolosa del Cliente.',
      '13.3 Las disposiciones de indemnización sobrevivirán la terminación de este Contrato.',
      '13.4 El Prestador del Servicio será responsable conforme a la legislación aplicable por daños derivados directamente de la operación de la Aeronave, salvo en los casos atribuibles a negligencia grave o conducta dolosa del Cliente.',
      '13.5 El Prestador del Servicio será responsable conforme a la legislación aplicable por daños ocasionados a terceros derivados de la operación de la Aeronave, salvo en los casos atribuibles a negligencia grave o conducta dolosa del Cliente.',
    ],
  },
  {
    title: '14. LEY APLICABLE',
    paragraphs: [
      '14.1 Este Contrato se interpretará y hará cumplir de acuerdo con las leyes de los Estados Unidos Mexicanos. Las partes se someten irrevocablemente a la jurisdicción de los tribunales de la Ciudad de México para cualquier acción o procedimiento derivado o relacionado con este Contrato.',
    ],
  },
  {
    title: '15. DISPOSICIONES VARIAS',
    items: [
      '15.1 Acuerdo Completo: Este Contrato y sus Anexos constituyen el acuerdo completo entre las partes y reemplazan cualquier acuerdo previo. Solo podrá modificarse mediante escrito firmado por representantes autorizados de ambas partes.',
      '15.2 No Renuncia: Ninguna renuncia será válida a menos que se realice por escrito y no constituirá renuncia continua ni de otras disposiciones.',
      '15.3 Separabilidad: Si alguna disposición fuera inválida o inaplicable en alguna jurisdicción, no afectará la validez de las demás disposiciones.',
      '15.4 No Agencia: Este Contrato no crea relación de mandato, agencia, sociedad, empresa conjunta ni otra asociación entre las partes.',
      '15.5 Políticas Operativas: El presente Contrato estará sujeto a las políticas operativas y de seguridad aplicables del Prestador del Servicio. En caso de conflicto, prevalecerán los términos del presente Contrato.',
      '15.6 Confidencialidad: Las partes se comprometen a mantener estricta confidencialidad sobre los términos del Contrato, incluyendo información financiera, operativa o comercial. El acceso se limitará a personal directivo y no se divulgará a terceros salvo necesidad para cumplir obligaciones contractuales o acuerdo escrito.',
      '15.7 Cesión: Ninguna parte puede ceder este Contrato sin consentimiento escrito de la otra parte. El Contrato será vinculante para los sucesores y cesionarios.',
      '15.8 Tiempo Esencial: El tiempo es esencial para el cumplimiento de las obligaciones de ambas partes.',
      '15.9 Ejecución en Contrapartes: El presente Contrato podrá firmarse en uno o varios ejemplares, incluyendo mediante medios electrónicos, considerándose cada uno de ellos como original y conjuntamente como un mismo instrumento jurídico.',
      '15.10 Notificaciones: Todas las notificaciones derivadas del presente Contrato deberán realizarse por escrito y entregarse personalmente en los domicilios señalados en el presente instrumento, mediante correo electrónico u otros medios electrónicos previamente autorizados por las partes. Dichas notificaciones se tendrán por recibidas en la fecha de su entrega personal o, tratándose de medios electrónicos, en la fecha de confirmación de envío o recepción correspondiente.',
      '15.11 Idioma: Las partes han solicitado expresamente que este Contrato y documentos relacionados estén redactados en español.',
    ],
  },
  {
    title: '16. POLÍTICA DE CANCELACIÓN',
    paragraphs: [
      '16.1 Sujeto a la Sección 15.1, si el Cliente cancela el vuelo, pagará al Prestador del Servicio las siguientes tarifas de cancelación, considerando como fecha de cancelación el día en que el Prestador del Servicio reciba aviso escrito:',
    ],
    items: [
      'a. Más de siete (7) días naturales antes del vuelo: 0% del Costo Total del Servicio.',
      'b. Menos de siete (7) días: 15%.',
      'c. Menos de cinco (5) días: 50%.',
      'd. Desde tres (3) días naturales: 100%, sin reembolso.',
    ],
  },
  {
    title: '17. VALIDEZ DE FIRMAS ELECTRÓNICAS',
    paragraphs: [
      'Las partes acuerdan que la firma del presente Contrato podrá realizarse de manera electrónica. RED AVIATION COMPANY S.A. DE C.V. hará uso de la plataforma DocuSign para la firma electrónica, la cual tendrá plena validez legal. El Cliente podrá firmar por cualquier medio digital que elija, y al hacerlo, reconoce y acepta expresamente la legalidad, validez y plena eficacia del acto de firma electrónica, asumiendo toda responsabilidad derivada de su utilización. Las firmas electrónicas tendrán la misma fuerza y efecto que una firma autógrafa para todos los efectos legales.',
    ],
  },
  {
    title: '18. CUENTAS RECAUDADORAS AUTORIZADAS',
    paragraphs: [
      'El Cliente reconoce que las cuentas bancarias señaladas corresponden a terceros autorizados por el Prestador del Servicio exclusivamente para fines de cobranza, administración operativa o coordinación del servicio, sin que ello modifique la identidad del Prestador del Servicio ni las obligaciones asumidas en el presente Contrato.',
    ],
  },
])

function buildContractSnapshot() {
  const resolvedReservationId =
    resolveEntityIdentifier(props.reservationId) || resolveEntityIdentifier(props.reservation)
  const resolvedFlightRequestId =
    resolveEntityIdentifier(props.reservation?.flight_request_id) ||
    resolveEntityIdentifier(props.reservation?.request_id)

  return {
    contract_version: 'client_contract_v1',
    reservation_id: resolvedReservationId,
    flight_request_id: resolvedFlightRequestId,
    contract_provider: 'docusign',
    client_signature_anchor: clientSignatureAnchor,
    reservation_code: reservationCode.value,
    route: routeDisplay.value,
    departure_date: departureDate.value,
    aircraft: aircraftLabel.value,
    aircraft_category: aircraftCategory.value,
    service_tier: serviceTier.value,
    passengers: passengerLabel.value,
    operator: operatorLabel.value,
    customer_name: customerLabel.value,
    customer_representative: customerRepresentative.value,
    customer_address: customerAddress.value,
    contract_date: contractDate.value,
    overnight: overnightLabel.value,
    final_price: finalPrice.value,
    deposit_amount: depositAmount.value,
    itinerary_segments: itinerarySegments.value.map((segment) => ({
      order: segment.order,
      origin: segment.origin,
      destination: segment.destination,
      departure: segment.departure,
      departure_label: formatDateTime(segment.departure),
    })),
  }
}

function buildContractPlainText() {
  const sections = [
    `Contrato de prestacion de servicios de aviacion ejecutiva`,
    `Reserva: ${reservationCode.value}`,
    `Ruta: ${routeDisplay.value}`,
    `Salida: ${departureDate.value}`,
    `Cliente: ${customerLabel.value}`,
    `Representante: ${customerRepresentative.value}`,
    
    `Aeronave: ${aircraftLabel.value}`,
    `Categoria: ${aircraftCategory.value}`,
    `Servicio: ${serviceTier.value}`,
    `Pasajeros: ${passengerLabel.value}`,
    
    `Costo total: ${finalPrice.value}`,
    `Deposito: ${depositAmount.value}`,
    `Saldo: ${balanceAmount.value}`,
    '',
    'Consideraciones:',
    ...considerations.value.map((item) => `- ${item}`),
    '',
    'Definiciones:',
    ...definitions.value.map((item) => `- ${item}`),
    '',
    ...clauses.value.flatMap((clause) => [
      clause.title,
      ...(clause.paragraphs || []).map((paragraph) => paragraph),
      ...(clause.items || []).map((item) => `- ${item}`),
      '',
    ]),
  ]

  return sections.join('\n').trim()
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildContractHtmlDocument(exportAssets = {}) {
  const exportContractHeaderSrc =
    exportAssets.headerSrc || resolvePublicAssetUrl('MARGEN/image.png')
  const coverCards = coverSummaryRows.value
    .map(
      (row) => `
        <td class="mini-card">
          <span>${escapeHtml(row.label)}</span>
          <strong>${escapeHtml(row.value)}</strong>
        </td>
      `,
    )
    .join('')

  const itineraryRows = itinerarySegments.value
    .map(
      (segment) => `
        <tr>
          <td>${escapeHtml(segment.order)}</td>
          <td>${escapeHtml(segment.origin)}</td>
          <td>${escapeHtml(segment.destination)}</td>
          <td>${escapeHtml(formatPrintableDate(segment.departure))}</td>
          <td>${escapeHtml(formatTime(segment.departure))}</td>
        </tr>
      `,
    )
    .join('')

  const includesRows = includesItems
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('')
  const excludesRows = excludesItems
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('')
  const considerationsRows = considerations.value
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('')
  const definitionsRows = definitions.value
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('')
  const clausesHtml = clauses.value
    .map((clause) => {
      const paragraphs = (clause.paragraphs || [])
        .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
        .join('')
      const items = (clause.items || []).length
        ? `<ul>${clause.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
        : ''

      return `
        <section class="clause-block">
          <h3>${escapeHtml(clause.title)}</h3>
          ${paragraphs}
          ${items}
        </section>
      `
    })
    .join('')

  const accountCards = bankAccounts
    .map(
      (account) => `
        <td>
        <div class="account-card-print">
          <strong>${escapeHtml(account.bank)}</strong>
          <div>Cuenta: ${escapeHtml(account.account)}</div>
          <div>CLABE: ${escapeHtml(account.clabe)}</div>
          <div>Beneficiario: ${escapeHtml(account.beneficiary)}</div>
          <div>RFC: ${escapeHtml(account.rfc)}</div>
        </div>
        </td>
      `,
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Contrato ${reservationCode.value}</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 18px; background: #f6f1e7; color: #111; font-family: DejaVu Sans, Arial, sans-serif; font-size: 12px; line-height: 1.5; }
      .sheet { border: 1px solid #ddd4c6; border-radius: 18px; overflow: hidden; background: #fff; }
      .brandbar { background: #17212b; }
      .brandbar-banner { display: block; width: 100%; }
      .body { padding: 18px; background: #fffdf9; }
      .eyebrow { color: #8b6a24; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
      .badge { float: right; padding: 5px 10px; border-radius: 999px; background: #f7ebcc; color: #8b6a24; font-size: 10px; font-weight: 700; }
      h1 { margin: 8px 0 6px; font-size: 28px; line-height: 1.08; }
      .route { margin: 0 0 10px; font-size: 18px; font-weight: 700; color: #3c3328; }
      .meta span { display: inline-block; margin: 0 14px 6px 0; color: #625d55; font-weight: 600; }
      .mini-grid { width: 100%; border-collapse: separate; border-spacing: 8px 8px; margin: 10px -8px 0; }
      .mini-grid td { width: 33.33%; border: 1px solid #e1d8ca; border-radius: 10px; background: #fcfaf6; padding: 10px 12px; vertical-align: top; }
      .mini-grid span { display: block; color: #8c7b63; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
      .mini-grid strong { display: block; margin-top: 4px; color: #1a1816; font-size: 13px; line-height: 1.35; }
      .section { margin-top: 16px; page-break-inside: avoid; }
      .section-title { margin: 0 0 8px; font-size: 15px; font-weight: 700; }
      .head-center { text-align: center; margin-bottom: 10px; }
      .head-center strong { display: block; font-size: 18px; letter-spacing: .03em; }
      .summary { width: 100%; border-collapse: collapse; margin-top: 10px; }
      .summary th, .summary td { border: 1px solid #e9e2d4; padding: 8px 10px; vertical-align: top; text-align: left; }
      .summary th { background: #f4eee3; color: #625d55; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
      .summary td { background: #faf8f3; font-weight: 600; }
      .two-cols { width: 100%; border-collapse: separate; border-spacing: 10px 0; margin: 10px -10px 0; }
      .two-cols td { width: 50%; vertical-align: top; }
      .note-box { border: 1px solid #e1d8ca; border-radius: 10px; background: #fcfaf6; padding: 10px 12px; }
      .note-box strong { display: block; margin-bottom: 6px; }
      .note-box ul { margin: 0; padding-left: 18px; }
      .note-box li { margin-bottom: 6px; }
      .copy p { margin: 0 0 8px; }
      .copy ul { margin: 0; padding-left: 18px; }
      .copy li { margin-bottom: 6px; }
      .accounts { width: 100%; border-collapse: separate; border-spacing: 10px 10px; margin: 0 -10px; }
      .accounts td { width: 33.33%; vertical-align: top; }
      .account-card-print { border: 1px solid #e1d8ca; border-radius: 10px; background: #fcfaf6; padding: 10px 12px; min-height: 94px; }
      .account-card-print strong { display: block; margin-bottom: 6px; }
      .signature-summary-table { width: 100%; border-collapse: collapse; margin: 10px 0 12px; border: 1px solid #e2d8c9; background: #fbf8f1; }
      .signature-summary-table td { width: 33.33%; padding: 10px 12px; vertical-align: top; color: #5d5448; border-right: 1px solid #e2d8c9; }
      .signature-summary-table td:last-child { border-right: 0; }
      .signature-summary-table .summary-label { display: block; color: #8d7c64; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
      .signature-summary-table .summary-value { display: block; margin-top: 4px; color: #1a1816; font-size: 13px; font-weight: 700; line-height: 1.35; }
      .signature-card-table { width: 100%; max-width: 620px; margin: 0 auto; border-collapse: collapse; border: 1px solid #e1d8ca; background: #fcfaf6; }
      .signature-card-table td { padding: 0; border: 0; }
      .signature-card-body { padding: 14px 16px 12px; text-align: center; }
      .signature-card-body .role { display: block; color: #8b6a24; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
      .signature-card-body .name { display: block; margin-top: 8px; font-size: 18px; font-weight: 700; }
      .signature-card-body .meta-line { display: block; margin-top: 4px; color: #625d55; }
      .signature-box-wrap { padding: 14px 18px 10px; }
      .signature-box-table { width: 100%; border-collapse: collapse; border: 1px dashed #d3c6ab; background: #f8f2e6; }
      .signature-box-table td { padding: 16px 18px; text-align: center; }
      .signature-box-table .kicker { display: block; color: #6f6557; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
      .signature-box-table .title { display: block; margin-top: 8px; color: #1a1816; font-size: 16px; font-weight: 700; }
      .signature-anchor-slot { height: 58px; padding-top: 8px; text-align: center; vertical-align: middle; }
      .anchor-holder { display: inline-block; color: #f8f2e6; font-size: 2px; line-height: 2px; }
      .signature-rule { padding: 0 18px; }
      .signature-rule div { height: 2px; background: #111; }
      .signature-caption-row td { padding: 10px 16px 14px; text-align: center; color: #756958; font-size: 13px; }
      .contact-bar { margin-top: 14px; padding-top: 12px; border-top: 1px solid #ddd4c6; }
      .contact-row { margin-bottom: 8px; }
      .contact-row .label { color: #8d7c64; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
      .contact-row .value, .contact-row a { color: #1a1816; font-size: 14px; font-weight: 700; text-decoration: none; }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="brandbar">
        <img class="brandbar-banner" src="${escapeHtml(exportContractHeaderSrc)}" alt="Sky Group" />
      </div>

      <div class="body">
        <div>
          <span class="eyebrow">Reserva ${escapeHtml(reservationCode.value)}</span>
          <span class="badge">Confidencial · Documento para firma</span>
        </div>
        <h1>Contrato de prestación de servicios de aviación ejecutiva</h1>
        <p class="route">${escapeHtml(routeDisplay.value)}</p>
        <div class="meta">
          <span>Salida: ${escapeHtml(departureDate.value)}</span>
          <span>Pasajeros: ${escapeHtml(passengerLabel.value)}</span>
          <span>Aeronave: ${escapeHtml(aircraftLabel.value)}</span>
          <span>Tramos: ${escapeHtml(itinerarySegments.value.length)}</span>
          <span>Total: ${escapeHtml(finalPrice.value)}</span>
        </div>

        <table class="mini-grid">
          <tr>${coverCards}</tr>
        </table>

        <section class="section">
          <div class="head-center">
            <span class="eyebrow">Contrato ${escapeHtml(props.reservationId || props.reservation?.id || '')}</span>
            <strong>Anexo A — Datos comerciales de la reserva</strong>
          </div>
        </section>

        <section class="section copy">
          <p>El presente Contrato se celebra en la fecha <strong>${escapeHtml(contractDate.value)}</strong>.</p>
          <p>ENTRE <strong>RED AVIATION COMPANY S.A. DE C.V.</strong>, sociedad constituida conforme a las leyes de los Estados Unidos Mexicanos, con domicilio en Circuito Alfonso G. de Orozco, Manzana 007, C.P. 50225, San Miguel Totoltepec, Toluca de Lerdo, Estado de México, legalmente representada en este acto por José Luis Hernández Ortiz, quien cuenta con facultades suficientes para este acto, en lo sucesivo el <strong>Prestador del Servicio</strong>.</p>
          <p>Y <strong>${escapeHtml(customerLabel.value)}</strong>, persona física o moral según corresponda, con domicilio en <strong>${escapeHtml(customerAddress.value)}</strong>, por su propio derecho o representada en este acto por <strong>${escapeHtml(customerRepresentative.value)}</strong>, quien declara contar con la capacidad jurídica y/o facultades suficientes para obligarse en los términos del presente Contrato, en lo sucesivo el <strong>Cliente</strong>.</p>
        </section>

        <section class="section copy">
          <h3 class="section-title">CONSIDERANDO QUE</h3>
          <ul>${considerationsRows}</ul>
        </section>

        <section class="section">
          <h3 class="section-title">ANEXO A — RESUMEN COMERCIAL</h3>
          <table class="summary">
            <tbody>
              <tr><th>Reserva</th><td>${escapeHtml(reservationCode.value)}</td><th>Cliente</th><td>${escapeHtml(customerLabel.value)}</td><th>Prestador comercial</th><td>${escapeHtml(commercialProviderLabel)}</td></tr>
              <tr><th>Operador aéreo</th><td>${escapeHtml(operatorLabel.value)}</td><th>Ruta</th><td>${escapeHtml(routeDisplay.value)}</td><th>Salida</th><td>${escapeHtml(departureDate.value)}</td></tr>
              <tr><th>Aeronave</th><td>${escapeHtml(aircraftLabel.value)}</td><th>Cabina</th><td>${escapeHtml(aircraftCategory.value)}</td><th>Pasajeros</th><td>${escapeHtml(passengerLabel.value)}</td></tr>
              <tr><th>Pernocta</th><td>${escapeHtml(overnightLabel.value)}</td><th>Servicio</th><td>${escapeHtml(serviceTier.value)}</td><th>Tramos</th><td>${escapeHtml(itinerarySegments.value.length)}</td></tr>
              <tr><th>Costo total</th><td>${escapeHtml(finalPrice.value)}</td><th colspan="4"></th></tr>
            </tbody>
          </table>
        </section>

        <section class="section">
          <strong>Itinerario</strong>
          <table class="summary" style="margin-top:8px;">
            <thead>
              <tr><th>Tramo</th><th>Origen</th><th>Destino</th><th>Fecha</th><th>Hora</th></tr>
            </thead>
            <tbody>${itineraryRows}</tbody>
          </table>
        </section>

        <section class="section">
          <table class="two-cols">
            <tr>
              <td><div class="note-box"><strong>Incluye</strong><ul>${includesRows}</ul></div></td>
              <td><div class="note-box"><strong>No incluye, salvo pacto expreso</strong><ul>${excludesRows}</ul></div></td>
            </tr>
          </table>
        </section>

        <section class="section copy">
          <h3 class="section-title">1. DEFINICIONES</h3>
          <ul>${definitionsRows}</ul>
        </section>

        <section class="section copy">
          ${clausesHtml}
        </section>

        <section class="section">
          <h3 class="section-title">CUENTAS PARA PAGO</h3>
          <table class="accounts"><tr>${accountCards}</tr></table>
        </section>

        <section class="section copy">
          <div class="head-center" style="text-align:left;">
            <span class="eyebrow">Formalización</span>
            <strong style="font-size:24px;">FIRMAS</strong>
            <p>Las partes aceptan el presente contrato mediante firma electrónica.</p>
            <p>La firma de este contrato se realizará de forma digital mediante DocuSign. Al completar la firma, el documento quedará registrado y asociado a esta reserva <strong>${escapeHtml(reservationCode.value)}</strong>.</p>
          </div>
          <table class="signature-summary-table">
            <tr>
              <td>
                <span class="summary-label">Cliente</span>
                <span class="summary-value">${escapeHtml(customerLabel.value)}</span>
              </td>
              <td>
                <span class="summary-label">Ruta</span>
                <span class="summary-value">${escapeHtml(routeDisplay.value)}</span>
              </td>
              <td>
                <span class="summary-label">Total</span>
                <span class="summary-value">${escapeHtml(finalPrice.value)}</span>
              </td>
            </tr>
          </table>
          <table class="signature-card-table">
            <tr>
              <td class="signature-card-body">
                <span class="role">Cliente</span>
                <span class="name">${escapeHtml(customerLabel.value)}</span>
                <span class="meta-line">Representante: ${escapeHtml(customerRepresentative.value)}</span>
                <span class="meta-line">Cargo: Cliente / Representante</span>
              </td>
            </tr>
            <tr>
              <td class="signature-box-wrap">
                <table class="signature-box-table">
                  <tr>
                    <td>
                      <span class="kicker">Espacio reservado para firma digital</span>
                      <span class="title">Firma digital del cliente</span>
                    </td>
                  </tr>
                  <tr>
                    <td class="signature-anchor-slot">
                      <span class="anchor-holder">${escapeHtml(clientSignatureAnchor)}</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="signature-rule">
                <div></div>
              </td>
            </tr>
            <tr class="signature-caption-row">
              <td>${escapeHtml(docusignStatusLabel.value)}</td>
            </tr>
          </table>
          <div class="contact-bar">
            <div class="contact-row"><span class="label">Contacto comercial</span> <span class="value">${escapeHtml(supportEmail)}</span></div>
            <div class="contact-row"><span class="label">Sitio web</span> <span class="value">${escapeHtml(supportWebsite)}</span></div>
            <div class="contact-row"><span class="label">Teléfonos</span> <span class="value">${escapeHtml(supportPhonesLabel)}</span></div>
          </div>
        </section>
      </div>
    </div>
  </body>
</html>`
}

function buildContractSourcePath(resolvedReservationId = '') {
  const normalizedReservationId = String(resolvedReservationId || '').trim()
  if (!normalizedReservationId) return ''

  return buildFrontendUrl(`/cliente/contrato/${normalizedReservationId}`)
}

async function handleConfirmClick() {
  const resolvedReservationId =
    resolveEntityIdentifier(props.reservationId) || resolveEntityIdentifier(props.reservation)
  const resolvedFlightRequestId =
    resolveEntityIdentifier(props.reservation?.flight_request_id) ||
    resolveEntityIdentifier(props.reservation?.request_id)
  let fullContractHtml = preparedBackendContractHtml.value
  let fullContractPlainText = persistedBackendContractText.value

  if (!fullContractHtml) {
    const [embeddedLogoSrc, embeddedHeaderSrc] = await Promise.all([
      convertPublicAssetToDataUrl('logo.png'),
      convertPublicAssetToDataUrl('MARGEN/image.png'),
    ])

    fullContractHtml = buildContractHtmlDocument({
      logoSrc: embeddedLogoSrc,
      headerSrc: embeddedHeaderSrc,
    })
  }

  if (!fullContractPlainText) {
    fullContractPlainText = buildContractPlainText()
  }

  signatureError.value = ''
  emit('confirm', {
    contract_snapshot: buildContractSnapshot(),
    contract_html: fullContractHtml,
    contract_markup: fullContractHtml,
    contract_plain_text: fullContractPlainText,
    document_html: fullContractHtml,
    full_contract_html: fullContractHtml,
    full_contract_text: fullContractPlainText,
    source_contract_path:
      persistedSourceContractPath.value || buildContractSourcePath(resolvedReservationId),
    document_source:
      persistedDocumentSource.value && backendContractNeedsInjectedAnchor.value
        ? `${persistedDocumentSource.value}_with_client_anchor`
        : persistedDocumentSource.value || 'client_contract_full_html',
    id: resolvedReservationId,
    reservation: resolvedReservationId,
    reservation_id: resolvedReservationId,
    booking_id: resolvedReservationId,
    flight_request: resolvedFlightRequestId,
    flight_request_id: resolvedFlightRequestId,
    signature: null,
    docusign: {
      provider: 'docusign',
      client_signature_anchor: clientSignatureAnchor,
    },
  })
}
</script>

<template>
  <article ref="contractRoot" class="contract-preview contract-pdf">
    <section v-if="hasBackendContractHtml" class="backend-contract-shell contract-card">
      <div class="backend-contract-shell__header">
        <div>
          <span class="eyebrow">Contrato desde backend</span>
          <strong>Documento oficial listo para firma</strong>
        </div>
        <span class="contract-badge">SINCRONIZADO</span>
      </div>
      <p v-if="backendContractNeedsInjectedAnchor" class="backend-contract-shell__note">
        El contrato del backend no traia anchor de firma DocuSign; se agrego de forma compatible
        para conservar la firma embebida.
      </p>
      <iframe
        class="backend-contract-shell__frame"
        :srcdoc="preparedBackendContractHtml"
        title="Contrato del backend"
      />
    </section>

    <section v-else class="contract-sheet">
      <header class="contract-brandbar">
        <img :src="contractHeaderSrc" alt="Sky Group" class="contract-brandbar__banner" />
      </header>

      <div class="contract-sheet__body">
        <div class="contract-watermark" aria-hidden="true">
          <img :src="logoSrc" alt="" />
        </div>

        <section class="contract-cover">
          <div class="contract-cover__eyebrow-row">
            <span class="eyebrow">Reserva {{ reservationCode }}</span>
            <span class="contract-badge">CONFIDENCIAL · DOCUMENTO PARA FIRMA</span>
          </div>
          <h1>Contrato de prestación de servicios de aviación ejecutiva</h1>
          <p class="contract-cover__route">{{ routeDisplay }}</p>
          <div class="contract-cover__meta">
            <span>Salida: {{ departureDate }}</span>
            <span>Pasajeros: {{ passengerLabel }}</span>
            <span>Aeronave: {{ aircraftLabel }}</span>
            <span
              >Tramos: {{ itinerarySegments.length }}
              {{ itinerarySegments.length === 1 ? 'tramo' : 'tramos' }}</span
            >
            <span>Total: {{ finalPrice }}</span>
          </div>
          <div class="contract-cover__brief">
            <article
              v-for="row in coverSummaryRows"
              :key="row.label"
              class="cover-brief-card contract-card"
            >
              <span>{{ row.label }}</span>
              <strong>{{ row.value }}</strong>
            </article>
          </div>
        </section>

        <section class="contract-commercial-intro contract-section">
          <div class="contract-sheet__head">
            <span class="eyebrow">Contrato {{ reservationId || reservation?.id || '' }}</span>
            <strong>ANEXO A — DATOS COMERCIALES DE LA RESERVA</strong>
            <small>
              <span v-if="contractRecord.signed_at || contractRecord.generated_at">
                {{ formatDate(contractRecord.signed_at || contractRecord.generated_at) }}
              </span>
            </small>
          </div>

          <div class="contract-summary">
            <article class="summary-card summary-card--route contract-card">
              <span>Ruta contratada</span>
              <strong>{{ routeDisplay }}</strong>
              <small>{{ departureDate }}</small>
            </article>
            <article class="summary-card contract-card">
              <span>Aeronave</span>
              <strong>{{ aircraftLabel }}</strong>
              <small>{{ aircraftCategory }}</small>
            </article>
            <article class="summary-card contract-card">
              <span>Servicio</span>
              <strong>{{ serviceTier }}</strong>
              <small>{{ passengerLabel }}</small>
            </article>
            <article class="summary-card contract-card">
              <span>Costo total</span>
              <strong>{{ finalPrice }}</strong>
            </article>
          </div>
        </section>

        <div class="contract-block contract-section">
          <p class="contract-opening">
            El presente Contrato se celebra en la fecha <strong>{{ contractDate }}</strong
            >.
          </p>
          <p>
            ENTRE <strong>RED AVIATION COMPANY S.A. DE C.V.</strong>, sociedad constituida conforme
            a las leyes de los Estados Unidos Mexicanos, con domicilio en Circuito Alfonso G. de
            Orozco, Manzana 007, C.P. 50225, San Miguel Totoltepec, Toluca de Lerdo, Estado de
            México, legalmente representada en este acto por José Luis Hernández Ortiz, quien cuenta
            con facultades suficientes para este acto, en lo sucesivo el
            
          </p>
        </div>

        <div class="contract-block contract-section">
          <h3>CONSIDERANDO QUE</h3>
          <ul class="contract-list">
            <li v-for="item in considerations" :key="item">{{ item }}</li>
          </ul>
        </div>

        <div class="contract-block contract-section">
          <h3>ANEXO A — RESUMEN COMERCIAL</h3>
          <div class="annex-table-wrap">
            <table class="annex-table contract-table">
              <tbody>
                <tr>
                  <th scope="row">Reserva</th>
                  <td>{{ reservationCode }}</td>
                  <th scope="row">Cliente</th>
                  <td>{{ customerLabel }}</td>
                  <th scope="row">Prestador comercial</th>
                  <td>{{ commercialProviderLabel }}</td>
                </tr>
                <tr>
                  <th scope="row">Operador aéreo</th>
                  <td>{{ operatorLabel }}</td>
                  <th scope="row">Ruta</th>
                  <td>{{ routeDisplay }}</td>
                  <th scope="row">Salida</th>
                  <td>{{ departureDate }}</td>
                </tr>
                <tr>
                  <th scope="row">Aeronave</th>
                  <td>{{ aircraftLabel }}</td>
                  <th scope="row">Cabina</th>
                  <td>{{ aircraftCategory }}</td>
                  <th scope="row">Pasajeros</th>
                  <td>{{ passengerLabel }}</td>
                </tr>
                <tr>
                  <th scope="row">Pernocta</th>
                  <td>{{ overnightLabel }}</td>
                  <th scope="row">Servicio</th>
                  <td>{{ serviceTier }}</td>
                  <th scope="row">Tramos</th>
                  <td>{{ itinerarySegments.length }}</td>
                </tr>
                <tr>
                  <th scope="row">Costo total</th>
                  <td>{{ finalPrice }}</td>
                  <td colspan="4" class="annex-table__spacer"></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="annex-legs">
            <strong>Itinerario</strong>
            <div class="annex-table-wrap">
              <table class="annex-table contract-table">
                <thead>
                  <tr>
                    <th>Tramo</th>
                    <th>Origen</th>
                    <th>Destino</th>
                    <th>Fecha</th>
                    <th>Hora</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="segment in itinerarySegments" :key="segment.key">
                    <td>{{ segment.order }}</td>
                    <td>{{ segment.origin }}</td>
                    <td>{{ segment.destination }}</td>
                    <td>{{ formatPrintableDate(segment.departure) }}</td>
                    <td>{{ formatTime(segment.departure) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="annex-grid">
            <article class="annex-note-card contract-card">
              <strong>Incluye</strong>
              <ul class="contract-list">
                <li v-for="item in includesItems" :key="item">{{ item }}</li>
              </ul>
            </article>
            <article class="annex-note-card contract-card">
              <strong>No incluye, salvo pacto expreso</strong>
              <ul class="contract-list">
                <li v-for="item in excludesItems" :key="item">{{ item }}</li>
              </ul>
            </article>
          </div>
        </div>

        <div class="contract-block contract-section">
          <h3>1. DEFINICIONES</h3>
          <ul class="contract-list">
            <li v-for="item in definitions" :key="item">{{ item }}</li>
          </ul>
        </div>

        <div v-for="clause in clauses" :key="clause.title" class="contract-block contract-section">
          <h3>{{ clause.title }}</h3>
          <p v-for="paragraph in clause.paragraphs || []" :key="paragraph">{{ paragraph }}</p>
          <ul v-if="clause.items?.length" class="contract-list">
            <li v-for="item in clause.items" :key="item">{{ item }}</li>
          </ul>
        </div>

        <div class="contract-block contract-section">
          <h3>CUENTAS PARA PAGO</h3>
          <div class="accounts-grid">
            <article
              v-for="account in bankAccounts"
              :key="account.bank"
              class="account-card contract-card"
            >
              <strong>{{ account.bank }}</strong>
              <span>Cuenta: {{ account.account }}</span>
              <span>CLABE: {{ account.clabe }}</span>
              <span>Beneficiario: {{ account.beneficiary }}</span>
              <span>RFC: {{ account.rfc }}</span>
            </article>
          </div>
        </div>

        <div class="contract-block contract-section signatures-section">
          <div class="signature-sheet__header">
            <span class="eyebrow">Formalización</span>
            <h3>FIRMAS</h3>
            <p>
              Las partes aceptan el presente contrato mediante firma electrónica.
            </p>
            <p>
              La firma de este contrato se realizará de forma digital mediante DocuSign. Al
              completar la firma, el documento quedará registrado y asociado a esta reserva
              <strong>{{ reservationCode }}</strong>.
            </p>
          </div>

          <div class="signature-sheet__summary">
            <span><strong>Cliente:</strong> {{ customerLabel }}</span>
            <span><strong>Ruta:</strong> {{ routeDisplay }}</span>
            <span><strong>Total:</strong> {{ finalPrice }}</span>
          </div>

          <div class="signatures-grid">
            <article class="signature-card contract-card signature-block">
              <span class="signature-card__role">Cliente</span>
              <strong>{{ customerLabel }}</strong>
              <small>Representante: {{ customerRepresentative }}</small>
              <small>Cargo: Cliente / Representante</small>
              <div class="signature-line signature-line--client">
                <div class="signature-external-placeholder signature-external-placeholder--anchor" aria-hidden="true">
                  <span>Espacio reservado para firma digital</span>
                  <strong>Firma digital del cliente</strong>
                  <span class="docusign-anchor">{{ clientSignatureAnchor }}</span>
                </div>
              </div>
              <small class="signature-card__caption">
                {{ docusignStatusLabel }}
              </small>
            </article>
          </div>

          <div class="signature-contact-bar">
            <div class="signature-contact-bar__item">
              <span>Contacto comercial</span>
              <strong>
                <a :href="`mailto:${supportEmail}`">{{ supportEmail }}</a>
              </strong>
            </div>
            <div class="signature-contact-bar__item">
              <span>Sitio web</span>
              <strong>
                <a :href="supportWebsite" target="_blank" rel="noreferrer">{{ supportWebsite }}</a>
              </strong>
            </div>
            <div class="signature-contact-bar__item">
              <span>Teléfonos</span>
              <strong>{{ supportPhonesLabel }}</strong>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section v-if="!props.readOnly" class="signature-panel">
      <div class="signature-box signature-box--external">
        <div class="signature-box__copy">
          <strong>Contrato listo para firma con DocuSign</strong>
          <span>
            La firma de este contrato se realizará de forma digital mediante DocuSign. Al
            completar la firma, el documento quedará registrado y asociado a esta reserva.
          </span>
        </div>
        <div class="signature-external-steps">
          <span>1. Generar contrato</span>
          <span>2. Firmar digitalmente</span>
          <span>3. Continuar a pago</span>
        </div>
      </div>
      <small v-if="signatureError" class="signature-error">{{ signatureError }}</small>
      <button
        type="button"
        class="signature-panel__submit"
        :disabled="props.submitting"
        @click="handleConfirmClick"
      >
        {{ props.submitting ? 'Iniciando DocuSign...' : 'Firmar digitalmente' }}
      </button>
      <small class="signature-note">
        Se abrira DocuSign con este contrato y el pago seguira bloqueado hasta que el estado
        regrese como completed.
      </small>
    </section>
  </article>
</template>

<style scoped>
.contract-preview {
  display: grid;
  gap: 0.8rem;
  padding: 0.9rem;
  border-radius: 18px;
  background: #efebe3;
}

.backend-contract-shell {
  display: grid;
  gap: 0.9rem;
  padding: 1rem;
  border: 1px solid #ded3c1;
  border-radius: 22px;
  background: #fffdfa;
}

.backend-contract-shell__header {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  justify-content: space-between;
}

.backend-contract-shell__header strong {
  display: block;
  margin-top: 0.15rem;
  color: #17120c;
  font-size: 1rem;
}

.backend-contract-shell__frame {
  width: 100%;
  min-height: 78rem;
  border: 1px solid #e7dccd;
  border-radius: 18px;
  background: #ffffff;
}

.backend-contract-shell__note {
  margin: 0;
  padding: 0.75rem 0.9rem;
  border: 1px solid #eadcb8;
  border-radius: 14px;
  background: #faf2dd;
  color: #6b5422;
  font-size: 0.9rem;
}

.contract-block h3 {
  margin: 0;
  color: #111111;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1rem;
  letter-spacing: 0.02em;
}

.contract-block p,
.contract-list li,
.signature-box__copy span,
.signature-note,
.account-card span,
.signature-card small,
.annex-table th {
  margin: 0;
  color: #625d55;
}

.eyebrow {
  color: #8b6a24;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.contract-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  background: #f3ead7;
  color: #8b6a24;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.contract-cover {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 0.55rem;
  padding: 0.05rem 0 0.35rem;
}

.contract-cover__eyebrow-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  justify-content: space-between;
}

.contract-cover h1 {
  margin: 0;
  color: #111111;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(1.7rem, 3vw, 2.15rem);
  line-height: 1.08;
  font-weight: 700;
}

.contract-cover__route {
  margin: 0;
  color: #3c3328;
  font-size: clamp(1rem, 1.7vw, 1.2rem);
  font-weight: 700;
}

.contract-cover__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1rem;
  color: #625d55;
  font-size: 0.84rem;
  font-weight: 600;
}

.contract-cover__brief {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.55rem;
  margin-top: 0.2rem;
}

.cover-brief-card {
  display: grid;
  align-content: start;
  gap: 0.32rem;
  min-height: 4.3rem;
  padding: 0.75rem 0.85rem 0.8rem;
  border: 1px solid #e3dac9;
  border-radius: 10px;
  background: #fbf8f2;
  box-shadow: none;
}

.cover-brief-card span {
  color: #8c7b63;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.cover-brief-card strong {
  color: #1a1816;
  font-size: 0.98rem;
  line-height: 1.28;
  word-break: break-word;
}

.contract-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.6rem;
}

.summary-card,
.contract-sheet,
.signature-panel {
  border: 1px solid #dfd6c8;
  border-radius: 12px;
  background: #ffffff;
}

.summary-card {
  position: relative;
  display: grid;
  gap: 0.3rem;
  padding: 0.8rem 0.9rem;
  background: #fcfaf6;
}

.summary-card span,
.summary-card small,
.signature-card span {
  color: #6d6252;
}

.summary-card strong,
.contract-opening strong,
.contract-block strong,
.annex-table td,
.signature-card strong {
  color: #111111;
}

.summary-card strong {
  font-size: 0.98rem;
}

.summary-card--route strong {
  font-size: 1.08rem;
}

.contract-sheet {
  display: grid;
  gap: 0.7rem;
  overflow: hidden;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 8px 20px rgba(54, 44, 29, 0.08);
}

.contract-brandbar {
  overflow: hidden;
  background: #16202a;
}

.contract-brandbar__topline {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.85rem 1rem 0.55rem;
}

.contract-brandbar__logo {
  width: 88px;
  height: auto;
  object-fit: contain;
  flex: 0 0 auto;
}

.contract-brandbar__legend {
  display: grid;
  gap: 0.12rem;
}

.contract-brandbar__legend strong {
  color: #ffffff;
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.contract-brandbar__legend span {
  color: rgba(255, 255, 255, 0.78);
  font-size: 0.76rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.contract-brandbar__banner {
  display: block;
  width: 100%;
  height: auto;
}

.contract-sheet__body {
  position: relative;
  display: grid;
  gap: 0.8rem;
  padding: clamp(1rem, 2vw, 1.25rem);
  border: 1px solid #cfc4b4;
  border-top: 0;
}

.contract-watermark {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 0;
}

.contract-watermark img {
  width: min(74%, 760px);
  opacity: 0.05;
  filter: grayscale(1);
}

.contract-sheet__head {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 0.3rem;
  justify-items: center;
  padding: 0.2rem 0 0.45rem;
  text-align: center;
}

.contract-sheet__head strong {
  font-size: clamp(1.15rem, 1.5vw, 1.4rem);
  letter-spacing: 0.03em;
}

.contract-sheet__head small {
  color: #625d55;
  font-weight: 700;
}

.contract-commercial-intro {
  display: grid;
  gap: 0.45rem;
  break-inside: avoid;
  page-break-inside: avoid;
}

.contract-block {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 0.42rem;
}

.contract-list {
  display: grid;
  gap: 0.28rem;
  margin: 0;
  padding-left: 1.15rem;
}

.annex-table-wrap,
.accounts-grid,
.signatures-grid {
  display: grid;
  gap: 0.75rem;
}

.annex-table-wrap {
  overflow-x: auto;
}

.annex-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid #ddd4c6;
  border-radius: 8px;
  overflow: hidden;
  background: #fcfaf6;
}

.annex-table th,
.annex-table td {
  padding: 0.6rem 0.7rem;
  border-bottom: 1px solid #e2d8c9;
  text-align: left;
  vertical-align: top;
}

.annex-table tr:last-child th,
.annex-table tr:last-child td {
  border-bottom: 0;
}

.annex-table th {
  width: 16%;
  background: #f1eadc;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.annex-table td {
  font-weight: 600;
  font-size: 0.88rem;
  line-height: 1.35;
}

.annex-table__total {
  color: #8b6a24 !important;
  font-size: 1rem;
}

.annex-table__spacer {
  background: #faf8f3;
}

.account-card,
.signature-card {
  display: grid;
  gap: 0.45rem;
  padding: 1rem;
  border: 1px solid #e1d8ca;
  border-radius: 10px;
  background: #fcfaf6;
  box-shadow: none;
  break-inside: avoid;
  page-break-inside: avoid;
}

.accounts-grid,
.signatures-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.signatures-grid {
  grid-template-columns: minmax(0, 1fr);
  justify-items: center;
}

.annex-legs {
  display: grid;
  gap: 0.45rem;
}

.annex-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
}

.annex-note-card {
  display: grid;
  gap: 0.55rem;
  padding: 0.85rem;
  border: 1px solid #e1d8ca;
  border-radius: 10px;
  background: #fcfaf6;
}

.signature-line {
  min-height: 5.5rem;
  margin-top: 0.45rem;
  padding: 0 0.2rem 0.35rem;
  border-bottom: 1.5px solid #111111;
}

.signature-line--provider {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  overflow: hidden;
}

.signature-line--client {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  overflow: hidden;
}

.provider-signature-image {
  max-width: 240px;
  max-height: 72px;
  width: auto;
  height: auto;
  object-fit: contain;
}

.contract-footer {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 0.65rem;
  padding-top: 1.2rem;
}

.contract-footer__line {
  height: 3px;
  background: #2f2f2f;
}

.contract-footer__meta {
  display: grid;
  gap: 0.4rem;
  color: #2f2f2f;
  font-size: 0.92rem;
}

.contract-footer__meta p {
  margin: 0;
}

.contract-footer__meta a {
  color: #2b69d6;
}

.signatures-section {
  gap: 0.85rem;
  padding: 0.25rem 0 0.05rem;
}

.signature-sheet__header {
  display: grid;
  gap: 0.3rem;
  max-width: 42rem;
}

.signature-sheet__header h3 {
  font-size: 1.45rem;
  line-height: 1.05;
  font-family: Georgia, 'Times New Roman', serif;
}

.signature-sheet__header p {
  margin: 0;
  color: #625d55;
  line-height: 1.55;
}

.signature-sheet__summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.55rem;
  padding: 0.7rem 0.8rem;
  border: 1px solid #e2d8c9;
  border-radius: 10px;
  background: #fbf8f1;
}

.signature-sheet__summary span {
  color: #5d5448;
  font-size: 0.92rem;
  line-height: 1.45;
}

.signature-sheet__summary strong {
  color: #151515;
}

.signature-card__role {
  color: #8b6a24 !important;
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.signature-card.signature-block {
  width: min(100%, 58rem);
  justify-items: center;
  text-align: center;
}

.signature-card.signature-block .signature-card__role,
.signature-card.signature-block strong,
.signature-card.signature-block small {
  justify-self: center;
  text-align: center;
}

.signature-card__caption {
  color: #756958 !important;
  font-size: 0.9rem;
}

.signature-external-placeholder {
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 0.3rem;
  min-height: 4.75rem;
  padding: 0.75rem;
  border: 1px dashed #d9cba8;
  border-radius: 14px;
  background: rgba(139, 106, 36, 0.06);
  text-align: center;
}

.signature-external-placeholder span {
  color: #6f6557;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.signature-external-placeholder strong {
  color: #1a1816;
  font-size: 0.95rem;
}

.docusign-anchor {
  color: transparent;
  font-size: 1px;
  line-height: 1px;
  user-select: none;
}

.signature-card.signature-block .signature-line--client {
  width: min(100%, 54rem);
}

.signature-contact-bar {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
  margin-top: 0.15rem;
  padding-top: 0.75rem;
  border-top: 1px solid #ddd4c6;
}

.signature-contact-bar__item {
  display: grid;
  align-content: start;
  gap: 0.45rem;
}

.signature-contact-bar__item span {
  color: #8d7c64;
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.signature-contact-bar__item strong,
.signature-contact-bar__item a {
  color: #1a1816;
  font-size: 1.18rem;
  line-height: 1.35;
  font-weight: 800;
  text-decoration: none;
  overflow-wrap: anywhere;
}

.contract-footer__page {
  justify-self: end;
  color: #2b69d6;
  font-size: 0.96rem;
}

.signature-panel {
  display: grid;
  gap: 0.65rem;
  padding: 0.8rem;
}

.signature-box {
  display: grid;
  min-height: 120px;
  place-items: center;
  padding: 1rem;
  border: 1px dashed #d3c6ab;
  border-radius: 10px;
  background: #fcfaf6;
}

.signature-box--external {
  gap: 1rem;
  place-items: stretch;
  border-style: solid;
  border-color: #e8dbc0;
  background:
    radial-gradient(circle at top right, rgba(139, 106, 36, 0.12), transparent 32%),
    linear-gradient(180deg, #fffaf1 0%, #fff 100%);
}

.signature-input {
  display: none;
}

.signature-box__copy {
  display: grid;
  gap: 0.35rem;
  text-align: center;
}

.signature-external-steps {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.55rem;
}

.signature-external-steps span {
  display: inline-flex;
  align-items: center;
  padding: 0.55rem 0.8rem;
  border-radius: 999px;
  background: rgba(21, 32, 42, 0.08);
  color: #15202a;
  font-size: 0.82rem;
  font-weight: 700;
}

.signature-ready-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  width: fit-content;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  background: #e5f7ea;
  color: #14673a;
}

.signature-uploaded {
  display: grid;
  gap: 0.9rem;
  width: 100%;
  justify-items: center;
}

.signature-uploaded__image,
.signature-image {
  display: block;
  max-width: min(100%, 320px);
  object-fit: contain;
}

.signature-uploaded__image {
  max-height: 132px;
}

.signature-image {
  max-height: 54px;
}

.signature-uploaded__meta {
  display: grid;
  gap: 0.2rem;
  text-align: center;
}

.signature-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.signature-action {
  min-height: 2.85rem;
  padding: 0.8rem 1rem;
  border-radius: 14px;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
}

.signature-action--secondary {
  border: 1px solid rgba(139, 106, 36, 0.24);
  background: #fbf8ef;
  color: #3c3328;
}

.signature-action--ghost {
  border: 1px solid rgba(17, 17, 17, 0.12);
  background: #ffffff;
  color: #625d55;
}

.signature-error {
  color: #a63e2f;
}

.signature-panel__submit {
  min-height: 3rem;
  border: 0;
  border-radius: 10px;
  background: #111111;
  color: #ffffff;
  font-size: 0.96rem;
  font-weight: 800;
  cursor: pointer;
}

@media (max-width: 900px) {
  .contract-summary,
  .annex-grid,
  .accounts-grid,
  .signatures-grid,
  .signature-sheet__summary {
    grid-template-columns: 1fr;
  }

  .contract-cover__brief {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .signature-contact-bar {
    gap: 1rem;
  }

  .signature-contact-bar__item strong,
  .signature-contact-bar__item a {
    font-size: 1rem;
  }

  .signature-actions {
    flex-direction: column;
  }

  .annex-table,
  .annex-table tbody,
  .annex-table tr,
  .annex-table th,
  .annex-table td {
    display: block;
    width: 100%;
  }

  .annex-table tr {
    border-bottom: 1px solid #e9e2d4;
  }

  .annex-table tr:last-child {
    border-bottom: 0;
  }

  .annex-table th,
  .annex-table td {
    border-bottom: 0;
  }
}

@media (max-width: 640px) {
  .contract-preview {
    padding: 0.7rem;
    border-radius: 24px;
    background: linear-gradient(180deg, #16202a 0, #16202a 8.5rem, #f6f1e7 8.5rem, #f6f1e7 100%);
  }

  .contract-cover__brief {
    grid-template-columns: 1fr;
  }

  .contract-sheet__body {
    padding: 1rem;
  }
}

@media print {
  @page {
    size: A4;
    margin: 0;
  }

  :global(body) {
    margin: 0;
    font-size: 10.5px !important;
    line-height: 1.35 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .signature-panel {
    display: none;
  }

  .contract-pdf {
    width: 100%;
    max-width: 100%;
    padding: 0;
    background: transparent !important;
    font-size: 10.5px !important;
    line-height: 1.35 !important;
  }

  .contract-pdf h1 {
    font-size: 22px !important;
    line-height: 1.15 !important;
    margin: 8px 0 10px !important;
  }

  .contract-pdf h2 {
    font-size: 16px !important;
    line-height: 1.2 !important;
    margin: 12px 0 8px !important;
  }

  .contract-pdf h3 {
    font-size: 13px !important;
    line-height: 1.2 !important;
    margin: 10px 0 6px !important;
  }

  .contract-pdf p,
  .contract-pdf li,
  .contract-pdf td,
  .contract-pdf th,
  .contract-pdf div,
  .contract-pdf span,
  .contract-pdf small {
    font-size: 10.5px !important;
    line-height: 1.35 !important;
  }

  .contract-sheet__body {
    position: relative;
    isolation: isolate;
    padding: 10mm 12mm 12mm !important;
    border: 0 !important;
  }

  .contract-watermark {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 0;
    opacity: 1;
    pointer-events: none;
  }

  .contract-watermark img {
    width: 72%;
    max-width: 34rem;
    opacity: 0.06;
    filter: grayscale(1);
  }

  .contract-cover,
  .contract-sheet__head,
  .contract-block,
  .contract-footer {
    position: relative;
    z-index: 1;
  }

  .contract-sheet {
    box-shadow: none;
    border-radius: 0 !important;
  }

  .contract-brandbar {
    margin: 0 !important;
    border-radius: 0 !important;
  }

  .contract-brandbar__banner {
    display: block !important;
    width: 100% !important;
    height: auto !important;
  }

  .contract-brandbar__topline {
    padding: 8px 12px 6px !important;
  }

  .contract-brandbar__logo {
    width: 72px !important;
  }

  .contract-brandbar__legend strong {
    color: #ffffff !important;
    font-size: 11px !important;
  }

  .contract-brandbar__legend span {
    color: rgba(255, 255, 255, 0.82) !important;
    font-size: 8px !important;
    letter-spacing: 0.08em !important;
    text-transform: uppercase !important;
  }

  .contract-card {
    padding: 10px 14px !important;
    margin-bottom: 8px !important;
    border-radius: 10px !important;
  }

  .contract-card span,
  .contract-card label,
  .contract-card .label,
  .contract-card small {
    font-size: 9px !important;
    letter-spacing: 0.06em;
  }

  .signature-contact-bar {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    gap: 12px !important;
    padding-top: 12px !important;
    border-top: 1.5px solid #e4dbcd !important;
  }

  .signature-contact-bar__item {
    gap: 3px !important;
  }

  .signature-contact-bar__item span {
    font-size: 9px !important;
    letter-spacing: 0.05em !important;
  }

  .contract-card strong,
  .contract-card .value {
    font-size: 11px !important;
    line-height: 1.3 !important;
  }

  .contract-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 10px !important;
  }

  .contract-table th,
  .contract-table td {
    padding: 6px 8px !important;
    font-size: 10px !important;
    text-align: left;
    vertical-align: top;
    word-break: normal;
    overflow-wrap: break-word;
  }

  .contract-table,
  .contract-table thead,
  .contract-table tbody,
  .contract-table tr,
  .contract-table th,
  .contract-table td {
    display: revert !important;
  }

  .contract-badge {
    background: rgba(139, 106, 36, 0.16) !important;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }

  .signatures-section {
    break-before: page;
    page-break-before: always;
    min-height: calc(100vh - 6rem);
    align-content: start;
  }

  .signature-card {
    box-shadow: none;
  }

  .contract-card,
  .contract-section,
  .contract-commercial-intro,
  .signature-block,
  .contract-table {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .signature-contact-bar__item strong,
  .signature-contact-bar__item a {
    color: #111111 !important;
    font-size: 15px !important;
    line-height: 1.28 !important;
    font-weight: 800 !important;
  }
}
</style>
