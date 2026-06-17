import { api, resolveApiRequestUrl, resolveMediaUrl } from '../../lib/api'
import { featuredAirports } from '../../utils/airports'
import {
  buildWorkflowApiPayload,
  resolveSharedWorkflowStatus,
  resolveWorkflowState,
} from '../../utils/flightWorkflow'
import {
  buildCommercialSnapshot,
  buildFlightPricingFormula,
  normalizeAttentionLevel,
  normalizePackageCode,
} from '../../utils/flightPricing'
import { requestWithCandidates } from '../../lib/backendCrud'

const configuredQuotesPreviewPath = String(
  import.meta.env.VITE_CLIENT_QUOTES_PREVIEW_PATH || '',
).trim()
const configuredTripsPath = String(import.meta.env.VITE_CLIENT_TRIPS_PATH || '').trim()
const configuredTripCreatePath = String(import.meta.env.VITE_CLIENT_TRIP_CREATE_PATH || '').trim()
const configuredTripWorkflowPath = String(
  import.meta.env.VITE_CLIENT_TRIP_WORKFLOW_PATH || '',
).trim()
const configuredContractSignPath = String(
  import.meta.env.VITE_CLIENT_RESERVATION_CONTRACT_SIGN_PATH || '',
).trim()
const configuredContractDownloadPath = String(
  import.meta.env.VITE_CLIENT_RESERVATION_CONTRACT_DOWNLOAD_PATH || '',
).trim()
const configuredFlightPackagesPath = String(
  import.meta.env.VITE_CLIENT_FLIGHT_PACKAGES_PATH ||
    import.meta.env.VITE_CLIENT_MEMBERSHIPS_PATH ||
    '',
).trim()
const configuredAircraftPath = String(import.meta.env.VITE_CLIENT_AIRCRAFT_PATH || '').trim()
const configuredCheckoutPath = String(import.meta.env.VITE_CLIENT_CHECKOUT_PATH || '').trim()
const configuredPaymentIntentPath = String(
  import.meta.env.VITE_CLIENT_PAYMENT_INTENT_PATH || '',
).trim()
const configuredWirePath = String(import.meta.env.VITE_CLIENT_WIRE_PATH || '').trim()
const configuredPaymentConfirmPath = String(
  import.meta.env.VITE_CLIENT_PAYMENT_CONFIRM_PATH || '',
).trim()
const CLIENT_QUOTES_TIMEOUT_MS = Number(import.meta.env.VITE_CLIENT_QUOTES_TIMEOUT_MS || 45000)

const QUOTES_PREVIEW_PATH = configuredQuotesPreviewPath || '/client/quotes/preview'
const CLIENT_TRIPS_PATHS = [
  ...new Set(
    [configuredTripsPath, '/cliente/historial', '/client/flight-requests'].filter(Boolean),
  ),
]
let preferredClientTripsPath = ''
const CLIENT_TRIP_SHOW_PATHS = CLIENT_TRIPS_PATHS.filter((path) => path.includes('/flight-requests'))
const CLIENT_TRIP_CREATE_PATH =
  configuredTripCreatePath ||
  (configuredTripsPath && !configuredTripsPath.includes('/historial') ? configuredTripsPath : '') ||
  '/client/flight-requests'
const CLIENT_FLIGHT_PACKAGES_PATH = configuredFlightPackagesPath || '/plans'
const CLIENT_AIRCRAFT_PATHS = [
  ...new Set([configuredAircraftPath, '/client/aircraft'].filter(Boolean)),
]
const CLIENT_RESERVATION_CONTRACT_SIGN_PATHS = [
  ...new Set([configuredContractSignPath, '/cliente/reservas/:id/contrato/firmar'].filter(Boolean)),
]
const CLIENT_RESERVATION_CONTRACT_DOWNLOAD_PATHS = [
  ...new Set(
    [
      configuredContractDownloadPath,
      '/cliente/reservas/:id/contrato/pdf',
      '/cliente/reservas/:id/contrato/download',
      '/cliente/reservas/:id/contrato/descargar',
      '/client/reservations/:id/contract/pdf',
      '/client/reservations/:id/contract/download',
    ].filter(Boolean),
  ),
]
const CLIENT_RESERVATIONS_PATH = '/cliente/reservas'
const CLIENT_CHECKOUT_PATHS = [
  ...new Set(
    [configuredCheckoutPath, '/cliente/stripe/checkout/create', '/stripe/checkout/create'].filter(
      Boolean,
    ),
  ),
]
const CLIENT_PAYMENT_INTENT_PATHS = [
  ...new Set(
    [
      configuredPaymentIntentPath,
      '/cliente/stripe/payment-intent',
      '/client/stripe/payment-intent',
      '/stripe/payment-intent',
    ].filter(Boolean),
  ),
]
const CLIENT_WIRE_PATHS = [
  ...new Set(
    [
      configuredWirePath,
      '/cliente/stripe/wire-intent',
      '/client/stripe/wire-intent',
      '/stripe/wire-intent',
    ].filter(Boolean),
  ),
]
const CLIENT_PAYMENT_CONFIRM_PATHS = [
  ...new Set(
    [
      configuredPaymentConfirmPath,
      '/cliente/reservas/:id/pago/confirmar',
      '/cliente/reservas/:id/payment/confirm',
      '/client/reservations/:id/payment/confirm',
      '/client/reservations/:id/payments/confirm',
    ].filter(Boolean),
  ),
]
const CLIENT_ACCESS_CHECKOUT_PATHS = [
  ...new Set(
    [
      '/client/access-payment/create',
    ].filter(Boolean),
  ),
]
const CLIENT_ACCESS_PAYMENT_SUCCESS_PATHS = [
  ...new Set(
    [
      '/client/access-payment/success',
    ].filter(Boolean),
  ),
]
const CLIENT_ACCESS_PAYMENT_CANCEL_PATHS = [
  ...new Set(
    [
      '/client/access-payment/cancel',
    ].filter(Boolean),
  ),
]
const CLIENT_ACCESS_STATUS_PATHS = [
  ...new Set(
    [
      '/client/access-status',
    ].filter(Boolean),
  ),
]

function logClientPaymentRegistration(label, details = {}) {
  if (typeof console === 'undefined') return
  console.log(`[client-payment-registration] ${label}`, details)
}
const FALLBACK_DESTINATIONS = [
  {
    code: 'CUN',
    city: 'Cancun',
    country: 'Mexico',
    badge: 'Ruta sugerida',
    route_title: 'Ciudad de Mexico -> Cancun',
    price: '$48,000 MXN',
    time: 'Jet mediano',
    capacity: '6 pasajeros',
    context: 'Opcion popular para escapadas y reuniones privadas.',
  },
  {
    code: 'MTY',
    city: 'Monterrey',
    country: 'Mexico',
    badge: 'Ruta sugerida',
    route_title: 'Toluca -> Monterrey',
    price: '$39,500 MXN',
    time: 'Light jet',
    capacity: '5 pasajeros',
    context: 'Ideal para ejecutivos que buscan salir y regresar el mismo dia.',
  },
  {
    code: 'SJD',
    city: 'Los Cabos',
    country: 'Mexico',
    badge: 'Ruta sugerida',
    route_title: 'Guadalajara -> Los Cabos',
    price: '$52,000 MXN',
    time: 'Jet mediano',
    capacity: '8 pasajeros',
    context: 'Alta demanda para fines de semana y viajes premium.',
  },
]

const FALLBACK_FLIGHT_PACKAGES = [
  {
    id: 'empty-leg',
    code: 'empty_leg',
    name: 'Empty Leg',
    badge: 'Oportunidad',
    multiplier: 0.8,
    category: 'Ahorro tactico',
    benefits: ['Precio preferente', 'Ruta sujeta a disponibilidad', 'Ideal para vuelos flexibles'],
    action: 'Elegir Empty Leg',
  },
  {
    id: 'essential',
    code: 'essential',
    name: 'Essential',
    badge: 'Base',
    multiplier: 1.1,
    category: 'Servicio privado',
    benefits: ['Coordinacion esencial', 'Cabina validada', 'Cierre comercial agil'],
    action: 'Elegir Essential',
  },
  {
    id: 'business',
    code: 'business',
    name: 'Business',
    badge: 'Ejecutivo',
    multiplier: 1.2,
    category: 'Operacion premium',
    benefits: ['Concierge operativo', 'Flexibilidad prioritaria', 'Seguimiento reforzado'],
    action: 'Elegir Business',
  },
  {
    id: 'elite',
    code: 'elite',
    name: 'Elite',
    badge: 'Signature',
    multiplier: 1.35,
    category: 'Experiencia total',
    benefits: ['Concierge dedicado', 'Prioridad maxima', 'Tracking y soporte integral'],
    action: 'Elegir Elite',
  },
]

const DEFAULT_FLIGHT_PACKAGE_NAMES = new Set(
  FALLBACK_FLIGHT_PACKAGES.map((item) =>
    String(item.name || '')
      .trim()
      .toLowerCase(),
  ),
)

function preserveExplicitBoolean(value) {
  return typeof value === 'boolean' ? value : undefined
}

function extractErrorMessage(error) {
  return String(error?.payload?.message || error?.message || '').trim()
}

function isAccessRestrictionError(error) {
  const message = extractErrorMessage(error).toLowerCase()

  return (
    message.includes('demo activa') ||
    message.includes('suscripcion vigente') ||
    message.includes('suscripción vigente') ||
    message.includes('membresia activa') ||
    message.includes('membresía activa') ||
    message.includes('acceso activo')
  )
}

function asMoney(value) {
  if (value === null || value === undefined || value === '') return ''
  const amount = parseDbNumber(value)

  if (Number.isNaN(amount)) {
    return String(value)
  }

  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

function parseDbNumber(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null

  const raw = String(value).trim()
  if (!raw) return null
  const sanitized = raw.replace(/[^\d,.-]/g, '')

  if (sanitized && sanitized !== raw) {
    return parseDbNumber(sanitized)
  }

  if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
    const amount = Number(raw.replace(/\./g, ''))
    return Number.isFinite(amount) ? amount : null
  }

  if (/^\d{1,3}(,\d{3})+$/.test(raw)) {
    const amount = Number(raw.replace(/,/g, ''))
    return Number.isFinite(amount) ? amount : null
  }

  if (raw.includes(',') && raw.includes('.')) {
    const normalized =
      raw.lastIndexOf(',') > raw.lastIndexOf('.')
        ? raw.replace(/\./g, '').replace(',', '.')
        : raw.replace(/,/g, '')
    const amount = Number(normalized)
    return Number.isFinite(amount) ? amount : null
  }

  if (raw.includes(',') && !raw.includes('.')) {
    const amount = Number(raw.replace(',', '.'))
    return Number.isFinite(amount) ? amount : null
  }

  const amount = Number(raw)
  return Number.isFinite(amount) ? amount : null
}

function asNumber(value, fallback = 0) {
  const amount = parseDbNumber(value)
  return Number.isFinite(amount) ? amount : fallback
}

function resolveHourlyRate(raw = {}) {
  const hourlyRate = asNumber(
    raw.hourly_rate ||
      raw.hourly_price ||
      raw.price_per_hour ||
      raw.cost_per_hour ||
      raw.costPerHour ||
      raw.rental_price_usd ||
      raw.rentalPriceUsd ||
      raw.charter_rate ||
      raw.charterRate ||
      raw.rate_per_hour ||
      raw.ratePerHour ||
      raw.cost,
    0,
  )

  return hourlyRate > 0 && hourlyRate < 100 ? hourlyRate * 1000 : hourlyRate
}

function normalizeDistanceUnit(value = '') {
  const unit = String(value || '')
    .trim()
    .toLowerCase()

  if (['nm', 'nmi', 'nautical_miles', 'nautical-mile', 'nautical miles'].includes(unit)) return 'nm'
  if (['km', 'kilometer', 'kilometers', 'kilometres'].includes(unit)) return 'km'
  return ''
}

export function inferDistanceUnit(raw = {}, _sourceTable = '') {
  const explicitUnit = normalizeDistanceUnit(
    raw.distance_unit || raw.distanceUnit || raw.route_distance_unit || raw.routeDistanceUnit,
  )
  if (explicitUnit) return explicitUnit

  return 'km'
}

export function inferEngineType(aircraft = {}) {
  const category = String(
    aircraft.category || aircraft.cabin || aircraft.aircraft_category || aircraft.type || '',
  ).toLowerCase()
  const model = String(
    aircraft.model ||
      aircraft.aircraft ||
      aircraft.aircraft_model ||
      aircraft.aircraft_name ||
      aircraft.name ||
      '',
  ).toLowerCase()
  const explicitEngineType = String(aircraft.engine_type || aircraft.engineType || '')
    .trim()
    .toLowerCase()

  if (['turbofan', 'turboprop', 'turboshaft'].includes(explicitEngineType))
    return explicitEngineType

  if (
    category.includes('helicopter') ||
    category.includes('helicoptero') ||
    model.includes('agusta') ||
    model.includes('bell')
  ) {
    return 'turboshaft'
  }

  if (
    category.includes('turboprop') ||
    category.includes('turbo prop') ||
    model.includes('king air') ||
    model.includes('pilatus') ||
    model.includes('pc-12')
  ) {
    return 'turboprop'
  }

  if (
    category.includes('jet') ||
    model.includes('gulfstream') ||
    model.includes('learjet') ||
    model.includes('hawker') ||
    model.includes('citation')
  ) {
    return 'turbofan'
  }

  return 'unknown'
}

function normalizePriorityType(value = '') {
  return normalizePackageCode(value)
}

function normalizeTripType(value = '', label = '') {
  const normalizedValue = String(value || '')
    .trim()
    .toLowerCase()
  const normalizedLabel = String(label || '')
    .trim()
    .toLowerCase()

  if (['round_trip', 'redondo'].includes(normalizedValue) || normalizedLabel === 'redondo') {
    return 'round_trip'
  }

  if (
    ['multi_leg', 'multi_city', 'multi-destino', 'multidestino'].includes(normalizedValue) ||
    normalizedLabel === 'multi-destino'
  ) {
    return 'multi_leg'
  }

  return 'one_way'
}

function resolveSegmentCount(payload = {}, itinerary = {}) {
  const previewPayload =
    payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
      ? payload.data
      : payload
  const tripType = normalizeTripType(
    previewPayload?.trip_type || itinerary?.trip_type,
    previewPayload?.trip_label || itinerary?.trip_label,
  )
  const payloadSegmentCount = asNumber(
    previewPayload?.segment_count || previewPayload?.segments || 0,
  )
  if (payloadSegmentCount > 0) return payloadSegmentCount

  const payloadLegs = Array.isArray(previewPayload?.legs) ? previewPayload.legs.length : 0
  if (payloadLegs > 0) return payloadLegs

  const itineraryLegs = Array.isArray(itinerary?.legs) ? itinerary.legs.length : 0
  if (itineraryLegs > 0) return itineraryLegs

  if (tripType === 'round_trip') return 2
  return 1
}

function buildPricingBreakdown(match = {}, aircraftRecord = {}, payload = {}, itinerary = {}) {
  const backendPricing =
    match.pricing_breakdown && typeof match.pricing_breakdown === 'object'
      ? match.pricing_breakdown
      : null
  if (backendPricing) {
    const billableHours = asNumber(match.billable_hours || backendPricing.billable_hours)
    const segmentCount = asNumber(
      match.segment_count || backendPricing.segment_count || backendPricing.client_legs?.length,
      1,
    )
    const subtotal = asNumber(match.subtotal || backendPricing.subtotal)
    const total = asNumber(match.total || backendPricing.total)

    return {
      hasFormulaInputs: total > 0 || subtotal > 0,
      source: 'backend',
      billableHours,
      segmentCount,
      jetAPrice: asNumber(match.jet_a_price || backendPricing.jet_a_price),
      fuelBurnGallonsPerHour: 0,
      engineReserveRate: 0,
      insuranceRate: 0,
      maintenanceRate: 0,
      crewRate: 0,
      repositioningFee: asNumber(
        match.repositioning_cost ||
          match.repositioning_fee ||
          backendPricing.initial_repositioning_cost ||
          backendPricing.repositioning_cost,
      ),
      overnightFee: asNumber(
        match.overnight_fee || backendPricing.overnight_fee || backendPricing.crew_overnight_fee,
      ),
      overnightCost: asNumber(
        match.overnight_cost || match.overnight_fees || backendPricing.overnight_cost,
      ),
      additionalOperationalCost: asNumber(
        match.return_to_base_cost || backendPricing.return_to_base_cost,
      ),
      fixedFee: 0,
      fixedFeeTotal: 0,
      marginPercent: asNumber(
        match.margin_percentage ||
          backendPricing.margin_percentage ||
          backendPricing.margin_percent,
      ),
      operational: asNumber(
        match.base_price || backendPricing.client_flight_cost || backendPricing.base_price,
      ),
      fuel: 0,
      engineReserve: 0,
      insurance: 0,
      maintenance: 0,
      crew: 0,
      subtotal,
      utility: asNumber(
        match.margin_amount || backendPricing.margin_amount || backendPricing.utility,
      ),
      total,
      subtotalBeforeMargin: asNumber(
        match.subtotal_before_margin ||
          backendPricing.subtotal_before_margin ||
          backendPricing.subtotal_operativo,
      ),
      minimumRoutePrice: asNumber(match.minimum_route_price || backendPricing.minimum_route_price),
      minimumAdjustment: asNumber(match.minimum_adjustment || backendPricing.minimum_adjustment),
      airportExpenses: asNumber(match.airport_expenses || backendPricing.airport_expenses),
      returnToBaseCost: asNumber(match.return_to_base_cost || backendPricing.return_to_base_cost),
      returnToBaseHours: asNumber(
        match.return_to_base_hours || backendPricing.return_to_base_hours,
      ),
      repositioningHours: asNumber(match.repositioning_hours || backendPricing.repositioning_hours),
      overnightNights: asNumber(match.overnight_nights || backendPricing.overnight_nights),
      overnightHours: asNumber(match.overnight_hours || backendPricing.overnight_hours),
    }
  }

  const billableHours = asNumber(
    match.billable_hours || match.estimated_hours || match.hours || match.flight_hours,
  )
  const operationalHourlyRate = resolveHourlyRate({
    ...aircraftRecord,
    ...match,
  })
  const fuelBurnGallonsPerHour = asNumber(
    match.fuel_burn_gph ||
      match.fuel_consumption_gph ||
      match.consumption_gph ||
      aircraftRecord.fuel_burn_gph ||
      aircraftRecord.fuel_consumption_gph,
  )
  const jetAPrice = asNumber(
    match.jet_a_price ||
      match.jet_a ||
      match.fuel_price ||
      match.provider?.jet_a_price ||
      aircraftRecord.jet_a_price ||
      aircraftRecord.provider?.jet_a_price,
  )
  const engineReserveRate = asNumber(
    match.engine_reserve_rate || match.reserve_motor_rate || aircraftRecord.engine_reserve_rate,
  )
  const insuranceRate = asNumber(match.insurance_rate || aircraftRecord.insurance_rate)
  const maintenanceRate = asNumber(match.maintenance_rate || aircraftRecord.maintenance_rate)
  const crewRate = asNumber(match.crew_rate || aircraftRecord.crew_rate)
  const repositioningFee = asNumber(match.repositioning_fee || aircraftRecord.repositioning_fee)
  const overnightFee = asNumber(match.overnight_fee || aircraftRecord.overnight_fee)
  const overnightCost = asNumber(
    match.overnight_cost ||
      match.overnight_fees ||
      aircraftRecord.overnight_cost ||
      aircraftRecord.overnight_fees,
  )
  const overnightNights = asNumber(match.overnight_nights || aircraftRecord.overnight_nights)
  const additionalOperationalCost = asNumber(
    match.operational_cost || aircraftRecord.operational_cost || aircraftRecord.cost,
  )
  const fixedFee = asNumber(
    match.fixed_fee ||
      match.fee_fijo ||
      match.provider?.fixed_fee ||
      match.provider?.fee_fijo ||
      aircraftRecord.fixed_fee ||
      aircraftRecord.fee_fijo ||
      aircraftRecord.provider?.fixed_fee ||
      aircraftRecord.provider?.fee_fijo,
  )
  const marginPercent = asNumber(
    match.margin_percent ||
      match.utility_percent ||
      match.porcentaje_utilidad ||
      match.provider?.margin_percent ||
      match.provider?.porcentaje_utilidad ||
      aircraftRecord.margin_percent ||
      aircraftRecord.provider?.margin_percent,
  )
  const segmentCount = resolveSegmentCount(payload, itinerary)

  const operational = billableHours * operationalHourlyRate
  const fuel = billableHours * fuelBurnGallonsPerHour * jetAPrice
  const engineReserve = billableHours * engineReserveRate
  const insurance = billableHours * insuranceRate
  const maintenance = billableHours * maintenanceRate
  const crew = billableHours * crewRate
  const fixedFeeTotal = fixedFee * segmentCount
  const subtotal =
    operational +
    fuel +
    engineReserve +
    insurance +
    maintenance +
    crew +
    repositioningFee +
    overnightCost +
    additionalOperationalCost +
    fixedFeeTotal
  const utility = subtotal * marginPercent
  const total = subtotal + utility
  const hasFormulaInputs =
    billableHours > 0 &&
    operationalHourlyRate > 0 &&
    (fuelBurnGallonsPerHour > 0 ||
      engineReserveRate > 0 ||
      insuranceRate > 0 ||
      maintenanceRate > 0 ||
      crewRate > 0 ||
      repositioningFee > 0 ||
      overnightCost > 0 ||
      additionalOperationalCost > 0 ||
      fixedFee > 0 ||
      marginPercent > 0)

  return {
    hasFormulaInputs,
    billableHours,
    segmentCount,
    jetAPrice,
    fuelBurnGallonsPerHour,
    engineReserveRate,
    insuranceRate,
    maintenanceRate,
    crewRate,
    repositioningFee,
    overnightFee,
    overnightCost,
    overnightNights,
    additionalOperationalCost,
    fixedFee,
    fixedFeeTotal,
    marginPercent,
    operational,
    fuel,
    engineReserve,
    insurance,
    maintenance,
    crew,
    subtotal,
    utility,
    total,
  }
}

function normalizeMatches(payload, itinerary = {}, requestMeta = {}) {
  const previewPayload =
    payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
      ? payload.data
      : payload
  const matches =
    previewPayload?.matches ||
    previewPayload?.matched_options ||
    previewPayload?.results ||
    previewPayload?.options ||
    previewPayload?.flight_request?.matched_options ||
    (Array.isArray(payload?.data) ? payload.data : null)

  if (!Array.isArray(matches) || matches.length === 0) {
    return []
  }

  return matches.map((match, index) => {
    const backendPricing =
      match.pricing_breakdown && typeof match.pricing_breakdown === 'object'
        ? match.pricing_breakdown
        : null
    const aircraftRecord =
      match.aircraft ||
      match.aeronave ||
      match.aircraft_record ||
      match.aircraftRecord ||
      match.plane ||
      match.avion ||
      {}
    const imageRecord = { ...match, ...aircraftRecord }
    const aircraftImages = normalizeAircraftImages(imageRecord)
    const pricing = buildPricingBreakdown(match, aircraftRecord, payload, itinerary)
    const normalizedOvernightFee = asNumber(
      match.overnight_fee || backendPricing?.overnight_fee || aircraftRecord?.overnight_fee,
    )
    const normalizedOvernightNights = asNumber(
      match.overnight_nights ||
        backendPricing?.overnight_nights ||
        itinerary?.overnight_nights ||
        itinerary?.days,
    )
    const normalizedOvernightCost = backendPricing
      ? asNumber(
          match.overnight_cost || match.overnight_fees || backendPricing.overnight_cost,
        )
      : asNumber(match.overnight_cost || match.overnight_fees || pricing.overnightCost)
    const resolvedTotal = pricing.hasFormulaInputs
      ? pricing.total
      : asNumber(match.total || match.price, 0)
    const hourlyRate = resolveHourlyRate({
      ...aircraftRecord,
      ...match,
    })
    const sourceTable =
      match.source_table || match.table || aircraftRecord?.source_table || 'matched_options'
    const distanceUnit = inferDistanceUnit({ ...aircraftRecord, ...match }, sourceTable)
    const engineType = inferEngineType({ ...aircraftRecord, ...match })
    const imageUrl = normalizeMediaUrl(
      getPrimaryImageValue(match) ||
        getPrimaryImageValue(aircraftRecord) ||
        aircraftImages[0]?.imageUrl ||
        '',
    )
    const finalBillableHours = asNumber(
      match.billable_hours || backendPricing?.final_billable_hours || backendPricing?.billable_hours,
    )
    const hoursSource =
      match.hours_source ||
      backendPricing?.hours_source ||
      match.flight_base_source ||
      backendPricing?.flight_base_source ||
      'backend_preview'
    const expenseFeeSource =
      match.expense_fee_source ||
      backendPricing?.expense_fee_source ||
      (asNumber(match.expense_fee || match.airport_expenses || backendPricing?.expense_fee) > 0
        ? 'backend_preview'
        : '')
    const pricingSource =
      match.quote_strategy ||
      backendPricing?.quote_strategy ||
      requestMeta.pricingSource ||
      'official_backend_pricing_v2'

    return {
      id: match.id || `match-${index}`,
      match_id: match.match_id || match.matched_option_id || match.id || '',
      matched_option_id: match.matched_option_id || match.match_id || match.id || '',
      aircraft_id: match.aircraft_id || match.aircraftId || aircraftRecord?.id || '',
      provider_id:
        match.provider_id ||
        match.providerId ||
        match.provider?.id ||
        aircraftRecord?.provider_id ||
        aircraftRecord?.provider?.id ||
        '',
      aircraft:
        match.aircraft_name ||
        match.name ||
        aircraftRecord?.name ||
        aircraftRecord?.model ||
        aircraftRecord?.category ||
        'Aeronave verificada',
      cabin: match.cabin || match.cabin_type || match.type || aircraftRecord?.category || '',
      time:
        match.trip_time ||
        match.card_time ||
        match.display_time ||
        match.ui_time ||
        match.time ||
        match.flight_time ||
        match.duration ||
        '',
      trip_time:
        match.trip_time ||
        match.card_time ||
        match.display_time ||
        match.ui_time ||
        match.time ||
        match.flight_time ||
        match.duration ||
        '',
      billed_time: match.billed_time || '',
      operative_time: match.operative_time || '',
      repositioning_time: match.repositioning_time || '',
      return_to_base_time: match.return_to_base_time || '',
      time_display_mode:
        match.time_display_mode || backendPricing?.time_display_mode || 'direct',
      billing_hours_mode:
        match.billing_hours_mode || backendPricing?.billing_hours_mode || 'direct',
      flight_base_source:
        match.flight_base_source || backendPricing?.flight_base_source || 'billable_hours',
      include_repositioning_in_billed_hours:
        match.include_repositioning_in_billed_hours ??
        backendPricing?.include_repositioning_in_billed_hours ??
        false,
      include_return_to_base_in_billed_hours:
        match.include_return_to_base_in_billed_hours ??
        backendPricing?.include_return_to_base_in_billed_hours ??
        true,
      include_overnight_in_billed_hours:
        match.include_overnight_in_billed_hours ??
        backendPricing?.include_overnight_in_billed_hours ??
        false,
      final_price:
        match.final_price ||
        match.price ||
        match.quoted_price ||
        (resolvedTotal ? asMoney(resolvedTotal) : asMoney(match.total || '')),
      base_price: asNumber(
        match.base_cost ||
          match.client_flight_cost ||
          match.flight_base ||
          match.base_price ||
          backendPricing?.client_flight_cost ||
          backendPricing?.base_price ||
          aircraftRecord?.base_price ||
          resolvedTotal ||
          match.total ||
          0,
      ),
      priority_type: normalizePriorityType(
        match.priority_type || match.service_tier || match.flight_package,
      ),
      priority_multiplier: asNumber(match.priority_multiplier || match.service_multiplier || 1, 1),
      priority_price: asNumber(match.priority_price || 0, 0),
      landing_fees: asNumber(match.landing_fees || match.landing_fee || 0, 0),
      fbo_fees: asNumber(match.fbo_fees || match.fbo || 0, 0),
      fuel_surcharge: asNumber(match.fuel_surcharge || 0, 0),
      expense_fee: asNumber(match.expense_fee || match.airport_expenses || 0, 0),
      overnight_fees: normalizedOvernightCost,
      overnight_fee: normalizedOvernightFee,
      overnight_cost: normalizedOvernightCost,
      overnight_nights: normalizedOvernightNights,
      taxes: asNumber(match.iva_amount || match.taxes || match.tax || 0, 0),
      hidden_operator: match.hidden_operator ?? true,
      amenities: Array.isArray(match.amenities)
        ? match.amenities
        : Array.isArray(aircraftRecord?.amenities)
          ? aircraftRecord.amenities
          : [],
      response_time: match.response_time || '',
      capacity: match.capacity || aircraftRecord?.capacity || '',
      priority: match.priority || '',
      model: match.model || match.aircraft_model || aircraftRecord?.model || '',
      hourly_rate: hourlyRate || '',
      total: pricing.hasFormulaInputs
        ? Number(pricing.total.toFixed(2))
        : match.total || match.final_price || '',
      subtotal: pricing.hasFormulaInputs
        ? Number(pricing.subtotal.toFixed(2))
        : match.subtotal || '',
      utility: pricing.hasFormulaInputs
        ? Number(pricing.utility.toFixed(2))
        : match.utility || match.margin || '',
      margin_percent:
        pricing.marginPercent ||
        match.margin_percentage ||
        match.margin_percent ||
        match.utility_percent ||
        match.porcentaje_utilidad ||
        '',
      fixed_fee: pricing.fixedFee || match.fixed_fee || match.fee_fijo || '',
      fixed_fee_total: pricing.hasFormulaInputs ? Number(pricing.fixedFeeTotal.toFixed(2)) : '',
      segment_count: pricing.segmentCount,
      jet_a_price: pricing.jetAPrice || match.jet_a_price || match.jet_a || '',
      fuel_burn_gph:
        pricing.fuelBurnGallonsPerHour ||
        match.fuel_burn_gph ||
        match.fuel_consumption_gph ||
        aircraftRecord?.fuel_burn_gph ||
        '',
      engine_type: engineType,
      speed_kmh:
        match.speed_kmh ||
        match.speedKmh ||
        aircraftRecord?.speed_kmh ||
        aircraftRecord?.speedKmh ||
        '',
      speed_knots:
        match.speed_knots ||
        match.speedKnots ||
        aircraftRecord?.speed_knots ||
        aircraftRecord?.speedKnots ||
        '',
      minimum_hours:
        match.minimum_hours ||
        match.min_hours ||
        aircraftRecord?.minimum_hours ||
        aircraftRecord?.min_hours ||
        '',
      minimum_route_price:
        match.minimum_route_price ||
        match.min_route_price ||
        pricing.minimumRoutePrice ||
        aircraftRecord?.minimum_route_price ||
        aircraftRecord?.min_route_price ||
        '',
      trip_support_fee:
        match.trip_support_fee ||
        match.trip_support ||
        aircraftRecord?.trip_support_fee ||
        aircraftRecord?.trip_support ||
        '',
      permits_fee:
        match.permits_fee ||
        match.permits ||
        aircraftRecord?.permits_fee ||
        aircraftRecord?.permits ||
        '',
      handling_fee:
        match.handling_fee ||
        match.handling_fees ||
        aircraftRecord?.handling_fee ||
        aircraftRecord?.handling_fees ||
        '',
      catering_fee: match.catering_fee || aircraftRecord?.catering_fee || '',
      ground_transport_fee:
        match.ground_transport_fee ||
        match.ground_transfer_fee ||
        aircraftRecord?.ground_transport_fee ||
        '',
      wifi_fee: match.wifi_fee || aircraftRecord?.wifi_fee || '',
      urgent_schedule_fee:
        match.urgent_schedule_fee || match.rush_fee || aircraftRecord?.urgent_schedule_fee || '',
      commercial_margin:
        match.commercial_margin ||
        match.margin_percentage ||
        match.margin_factor ||
        aircraftRecord?.commercial_margin ||
        aircraftRecord?.margin_factor ||
        '',
      priority_factor: match.priority_factor || aircraftRecord?.priority_factor || '',
      attention_level: normalizeAttentionLevel(match.attention_level || match.priority_level || ''),
      engine_reserve_rate:
        pricing.engineReserveRate || match.engine_reserve_rate || match.reserve_motor_rate || '',
      insurance_rate: pricing.insuranceRate || match.insurance_rate || '',
      maintenance_rate: pricing.maintenanceRate || match.maintenance_rate || '',
      crew_rate: pricing.crewRate || match.crew_rate || '',
      repositioning_fee:
        pricing.repositioningFee || match.repositioning_cost || match.repositioning_fee || '',
      repositioning_cost:
        pricing.repositioningFee || match.repositioning_cost || match.repositioning_fee || '',
      return_to_base_cost: pricing.returnToBaseCost || match.return_to_base_cost || '',
      return_to_base_hours: pricing.returnToBaseHours || match.return_to_base_hours || '',
      overnight_fee: normalizedOvernightFee,
      overnight_cost: normalizedOvernightCost,
      airport_expenses:
        pricing.airportExpenses || match.airport_expenses || match.expense_fee || '',
      minimum_adjustment: pricing.minimumAdjustment || match.minimum_adjustment || '',
      margin_amount: pricing.utility || match.margin_amount || '',
      subtotal_before_margin: pricing.subtotalBeforeMargin || match.subtotal_before_margin || '',
      source: requestMeta.source || 'backend_preview',
      pricing_source: pricingSource,
      endpoint_url: requestMeta.endpointUrl || '',
      debug_pricing: {
        ...(backendPricing || {}),
        hours_source: hoursSource,
        expense_fee_source: expenseFeeSource,
        final_billable_hours: finalBillableHours,
        overnight_fee: normalizedOvernightFee,
        overnight_nights: normalizedOvernightNights,
        overnight_cost: normalizedOvernightCost,
      },
      pricing_context: backendPricing || null,
      pricing_breakdown: backendPricing
        ? backendPricing
        : pricing.hasFormulaInputs
          ? {
              billable_hours: Number(pricing.billableHours.toFixed(2)),
              segment_count: pricing.segmentCount,
              operational: Number(pricing.operational.toFixed(2)),
              fuel: Number(pricing.fuel.toFixed(2)),
              engine_reserve: Number(pricing.engineReserve.toFixed(2)),
              insurance: Number(pricing.insurance.toFixed(2)),
              maintenance: Number(pricing.maintenance.toFixed(2)),
              crew: Number(pricing.crew.toFixed(2)),
              repositioning: Number(pricing.repositioningFee.toFixed(2)),
              overnight: Number((pricing.overnightCost || 0).toFixed(2)),
              overnight_fee: Number(normalizedOvernightFee.toFixed(2)),
              overnight_nights: Number(normalizedOvernightNights.toFixed(2)),
              overnight_cost: Number(normalizedOvernightCost.toFixed(2)),
              additional_operational_cost: Number(pricing.additionalOperationalCost.toFixed(2)),
              fixed_fee: Number(pricing.fixedFee.toFixed(2)),
              fixed_fee_total: Number(pricing.fixedFeeTotal.toFixed(2)),
              subtotal: Number(pricing.subtotal.toFixed(2)),
              utility: Number(pricing.utility.toFixed(2)),
              total: Number(pricing.total.toFixed(2)),
            }
          : null,
      currency: match.currency || aircraftRecord?.currency || '',
      distance_km: match.distance_km || '',
      distance_unit: distanceUnit,
      estimated_hours: match.real_flight_hours || match.flight_hours || match.estimated_hours || '',
      billable_hours: match.billable_hours || '',
      real_flight_hours: match.real_flight_hours || match.flight_hours || '',
      climb_descent_minutes: match.climb_descent_minutes || '',
      registration:
        match.registration ||
        match.matricula ||
        aircraftRecord?.registration ||
        aircraftRecord?.matricula ||
        '',
      image_url: imageUrl,
      images: aircraftImages,
      image_source_database: aircraftImages[0]?.sourceDatabase || '',
      image_source_table: aircraftImages[0]?.sourceTable || '',
      source_database:
        match.source_database ||
        match.database ||
        match.connection ||
        aircraftRecord?.source_database ||
        aircraftRecord?.database ||
        'flight_requests.matched_options',
      source_table: sourceTable,
      source_origin:
        match.source_origin ||
        match.origin ||
        aircraftRecord?.base_airport ||
        aircraftRecord?.base ||
        aircraftRecord?.base_airport_code ||
        '',
      match_reason: match.match_reason || '',
      provider: match.provider || aircraftRecord?.provider || null,
    }
  })
}

function normalizeMediaUrl(url = '') {
  return resolveMediaUrl(url)
}

function getPrimaryImageValue(raw = {}) {
  if (typeof raw === 'string') return raw

  return (
    raw.main_image ||
    raw.mainImage ||
    raw.image_url ||
    raw.imageUrl ||
    raw.image ||
    raw.image_path ||
    raw.imagePath ||
    raw.photo ||
    raw.photo_url ||
    raw.photoUrl ||
    raw.cover_image ||
    raw.coverImage ||
    raw.cover_photo ||
    raw.coverPhoto ||
    raw.thumbnail ||
    raw.thumbnail_url ||
    raw.thumbnailUrl ||
    raw.exterior_image ||
    raw.exteriorImage ||
    raw.interior_image ||
    raw.interiorImage ||
    ''
  )
}

function normalizeImageCollection(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'string') return [value]
  if (typeof value === 'object') return [value]
  return []
}

function normalizeAircraftImages(raw = {}) {
  const images = [
    ...normalizeImageCollection(raw.images),
    ...normalizeImageCollection(raw.aircraft_images),
    ...normalizeImageCollection(raw.aircraftImages),
    ...normalizeImageCollection(raw.gallery_images),
    ...normalizeImageCollection(raw.galleryImages),
    ...normalizeImageCollection(raw.gallery),
    ...normalizeImageCollection(raw.photos),
    ...normalizeImageCollection(raw.media),
    ...normalizeImageCollection(raw.multimedia),
    ...normalizeImageCollection(raw.pictures),
    ...normalizeImageCollection(raw.files),
  ]
  const normalizedImages = images
    .map((image, index) => {
      const imageRecord = typeof image === 'string' ? { url: image } : image || {}
      const imageUrl = normalizeMediaUrl(
        getPrimaryImageValue(imageRecord) ||
          imageRecord.url ||
          imageRecord.path ||
          imageRecord.file_url ||
          imageRecord.fileUrl ||
          imageRecord.public_url ||
          imageRecord.publicUrl ||
          imageRecord.src ||
          '',
      )
      if (!imageUrl) return null

      return {
        id: imageRecord.id || `image-${index}`,
        title: imageRecord.title || imageRecord.name || imageRecord.kind || `Imagen ${index + 1}`,
        kind: String(
          imageRecord.kind || imageRecord.slot || (index === 0 ? 'main' : 'gallery'),
        ).toLowerCase(),
        imageUrl,
        sourceDatabase:
          imageRecord.source_database ||
          imageRecord.database ||
          imageRecord.connection ||
          raw.source_database ||
          raw.database ||
          '',
        sourceTable: imageRecord.source_table || imageRecord.table || 'aircraft_images',
      }
    })
    .filter(Boolean)

  const mainImage = normalizeMediaUrl(getPrimaryImageValue(raw))
  if (mainImage && !normalizedImages.some((image) => image.imageUrl === mainImage)) {
    normalizedImages.unshift({
      id: 'main-image',
      title: 'Imagen principal',
      kind: 'main',
      imageUrl: mainImage,
      sourceDatabase: raw.source_database || raw.database || raw.connection || '',
      sourceTable: raw.main_image || raw.mainImage ? 'aircraft.main_image' : 'aircraft_images',
    })
  }

  return normalizedImages
}

function resolvePrimaryAircraftImage(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return ''
  }

  const normalizedImages = normalizeAircraftImages(raw)
  return normalizedImages[0]?.imageUrl || normalizeMediaUrl(getPrimaryImageValue(raw)) || ''
}

function normalizeText(value = '') {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function tokenizeAirportValue(value = '') {
  const rawValue = String(value || '').trim()
  if (!rawValue) return []

  return rawValue
    .split(/[\s,/()-]+/)
    .map((token) => normalizeText(token))
    .filter(Boolean)
}

function appendAirportTokens(tokens, value = '') {
  const normalizedValue = normalizeText(value)
  if (!normalizedValue) return

  tokens.add(normalizedValue)
  tokenizeAirportValue(value).forEach((token) => tokens.add(token))
}

function airportLookupTokens(value = '', airport = null) {
  const tokens = new Set()
  appendAirportTokens(tokens, value)
  appendAirportTokens(tokens, airport?.code)
  appendAirportTokens(tokens, airport?.iata)
  appendAirportTokens(tokens, airport?.city)
  appendAirportTokens(tokens, airport?.name)

  if (!tokens.size) return tokens

  const normalizedValue = normalizeText(value)

  featuredAirports.forEach((airport) => {
    const airportTokens = [
      airport.code,
      airport.iata,
      airport.city,
      airport.name,
      `${airport.city} ${airport.iata}`,
      `${airport.city} ${airport.code}`,
    ]
      .map((item) => normalizeText(item))
      .filter(Boolean)

    const matchesAirport = airportTokens.some(
      (token) => token === normalizedValue || tokens.has(token),
    )
    if (!matchesAirport) return

    airportTokens.forEach((token) => tokens.add(token))
  })

  return tokens
}

function airportBaseMatches(originValue = '', baseValue = '', originAirport = null) {
  const originTokens = airportLookupTokens(originValue, originAirport)
  const baseTokens = airportLookupTokens(baseValue)
  if (!originTokens.size || !baseTokens.size) return false

  for (const token of originTokens) {
    if (baseTokens.has(token)) return true
  }

  return false
}

function aircraftBase(raw = {}) {
  return raw.base_airport || raw.base || raw.base_airport_code || raw.home_base || raw.airport || ''
}

function aircraftLookupValues(aircraft = {}) {
  return [
    aircraft.aircraft_id,
    aircraft.id,
    aircraft.aircraft,
    aircraft.model,
    aircraft.registration,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean)
}

function findMatchingCatalogAircraft(match = {}, catalog = []) {
  const matchValues = new Set(aircraftLookupValues(match))
  if (!matchValues.size) return null

  return (
    catalog.find((aircraft) =>
      aircraftLookupValues(aircraft).some((value) => matchValues.has(value)),
    ) || null
  )
}

function mergeMatchesWithCatalogImages(matches = [], catalog = []) {
  if (!catalog.length) return matches

  return matches.map((match) => {
    const catalogAircraft = findMatchingCatalogAircraft(match, catalog)
    if (!catalogAircraft) return match

    const catalogImages = Array.isArray(catalogAircraft.images) ? catalogAircraft.images : []
    const matchImages = Array.isArray(match.images) ? match.images : []
    const images = catalogImages.length ? catalogImages : matchImages

    return {
      ...match,
      match_id: match.match_id || match.matched_option_id || match.id || '',
      matched_option_id: match.matched_option_id || match.match_id || match.id || '',
      aircraft_id: match.aircraft_id || catalogAircraft.aircraft_id || catalogAircraft.id,
      provider_id:
        match.provider_id ||
        match.provider?.id ||
        catalogAircraft.provider_id ||
        catalogAircraft.provider?.id ||
        '',
      aircraft: match.aircraft || catalogAircraft.aircraft,
      cabin: match.cabin || catalogAircraft.cabin,
      capacity: match.capacity || catalogAircraft.capacity,
      amenities: match.amenities?.length ? match.amenities : catalogAircraft.amenities,
      model: match.model || catalogAircraft.model,
      registration: match.registration || catalogAircraft.registration,
      hourly_rate: match.hourly_rate || catalogAircraft.hourly_rate || '',
      minimum_hours: match.minimum_hours || catalogAircraft.minimum_hours || '',
      minimum_route_price: match.minimum_route_price || catalogAircraft.minimum_route_price || '',
      speed_kmh: match.speed_kmh || catalogAircraft.speed_kmh || '',
      speed_knots: match.speed_knots || catalogAircraft.speed_knots || '',
      climb_descent_minutes:
        match.climb_descent_minutes || catalogAircraft.climb_descent_minutes || '',
      image_url: catalogAircraft.image_url || match.image_url,
      images,
      image_source_database: catalogAircraft.image_source_database || match.image_source_database,
      image_source_table: catalogAircraft.image_source_table || match.image_source_table,
      source_database: catalogAircraft.source_database || match.source_database,
      source_table: catalogAircraft.source_table || match.source_table,
      source_endpoint: catalogAircraft.source_endpoint || match.source_endpoint,
      source_origin: catalogAircraft.source_origin || match.source_origin,
      match_reason: catalogAircraft.source_origin
        ? catalogAircraft.match_reason
        : match.match_reason,
      status: match.status || catalogAircraft.status,
    }
  })
}

function normalizeAmenities(raw = {}) {
  const amenities = raw.amenities || raw.features || raw.services || []
  if (Array.isArray(amenities)) return amenities.filter(Boolean)
  if (typeof amenities === 'string') {
    return amenities
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

function normalizeAircraftFromDatabase(raw = {}, index = 0, sourcePath = '') {
  const base = aircraftBase(raw)
  const images = normalizeAircraftImages(raw)
  const aircraftName =
    raw.model ||
    raw.name ||
    raw.aircraft_name ||
    raw.registration ||
    raw.matricula ||
    `Aeronave privada ${index + 1}`
  const hourlyRate = resolveHourlyRate(raw)
  const distanceUnit = inferDistanceUnit(raw, raw.source_table || raw.table || 'aircraft')
  const engineType = inferEngineType(raw)

  return {
    id: raw.id || `aircraft-db-${index}`,
    match_id: '',
    matched_option_id: '',
    aircraft_id: raw.aircraft_id || raw.aircraftId || raw.id || '',
    provider_id: raw.provider_id || raw.provider?.id || '',
    aircraft: aircraftName,
    cabin: raw.category || raw.aircraft_category || raw.type || raw.cabin || 'Cabina verificada',
    time: raw.estimated_time || raw.flight_time || '',
    final_price: asMoney(
      raw.final_price || raw.total || raw.price || raw.quoted_price || hourlyRate,
    ),
    base_price: asNumber(
      raw.flight_base ||
        raw.base_price ||
        raw.final_price ||
        raw.price ||
        raw.quoted_price ||
        hourlyRate ||
        0,
    ),
    priority_type: normalizePriorityType(
      raw.priority_type || raw.service_tier || raw.flight_package,
    ),
    priority_multiplier: asNumber(raw.priority_multiplier || raw.service_multiplier || 1, 1),
    priority_price: asNumber(raw.priority_price || 0, 0),
    landing_fees: asNumber(raw.landing_fees || raw.landing_fee || 0, 0),
    fbo_fees: asNumber(raw.fbo_fees || raw.fbo || 0, 0),
    fuel_surcharge: asNumber(raw.fuel_surcharge || 0, 0),
    expense_fee: asNumber(raw.expense_fee || raw.airport_expenses || 0, 0),
    overnight_fees: asNumber(raw.overnight_cost || raw.overnight_fees || 0, 0),
    overnight_cost: asNumber(raw.overnight_cost || raw.overnight_fees || 0, 0),
    taxes: asNumber(raw.iva_amount || raw.taxes || raw.tax || 0, 0),
    hidden_operator: true,
    amenities: normalizeAmenities(raw),
    response_time: raw.response_time || '',
    capacity: raw.capacity || raw.passenger_capacity || '',
    priority: raw.priority || '',
    model: raw.manufacturer
      ? [raw.manufacturer, raw.registration || raw.matricula].filter(Boolean).join(' · ')
      : raw.registration || raw.matricula || '',
    registration: raw.registration || raw.matricula || '',
    hourly_rate: hourlyRate || '',
    minimum_hours: raw.minimum_hours || raw.min_hours || '',
    minimum_route_price: raw.minimum_route_price || raw.min_route_price || '',
    distance_unit: distanceUnit,
    engine_type: engineType,
    climb_descent_minutes: raw.climb_descent_minutes || raw.climbDescentMinutes || '',
    operational_cost: raw.operational_cost || raw.cost || '',
    speed_kmh: raw.speed_kmh || raw.speedKmh || '',
    speed_knots: raw.speed_knots || raw.speedKnots || '',
    fuel_burn_gph: raw.fuel_burn_gph || raw.fuel_consumption_gph || '',
    engine_reserve_rate: raw.engine_reserve_rate || raw.reserve_motor_rate || '',
    insurance_rate: raw.insurance_rate || '',
    maintenance_rate: raw.maintenance_rate || '',
    crew_rate: raw.crew_rate || '',
    trip_support_fee: raw.trip_support_fee || raw.trip_support || '',
    permits_fee: raw.permits_fee || raw.permits || '',
    handling_fee: raw.handling_fee || raw.handling_fees || '',
    catering_fee: raw.catering_fee || '',
    ground_transport_fee: raw.ground_transport_fee || raw.ground_transfer_fee || '',
    wifi_fee: raw.wifi_fee || '',
    urgent_schedule_fee: raw.urgent_schedule_fee || raw.rush_fee || '',
    commercial_margin: raw.commercial_margin || raw.margin_factor || '',
    priority_factor: raw.priority_factor || '',
    attention_level: normalizeAttentionLevel(raw.attention_level || raw.priority_level || ''),
    repositioning_fee: raw.repositioning_fee || '',
    overnight_fee: raw.overnight_fee || '',
    overnight_nights: asNumber(raw.overnight_nights || 0, 0),
    provider: raw.provider || null,
    image_url: images[0]?.imageUrl || '',
    images,
    image_source_database:
      images[0]?.sourceDatabase ||
      raw.source_database ||
      raw.database ||
      raw.connection ||
      'aircraft',
    image_source_table: images[0]?.sourceTable || 'aircraft_images',
    source_database: raw.source_database || raw.database || raw.connection || 'aircraft',
    source_table: raw.source_table || raw.table || 'aircraft',
    source_endpoint: sourcePath,
    source_origin: base,
    match_reason: base ? `Salida optimizada desde ${base}` : 'Opción verificada',
    status: raw.status || raw.aircraft_status || '',
  }
}

function normalizeArray(payload, keys = []) {
  if (Array.isArray(payload)) return payload

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key]
  }

  if (Array.isArray(payload?.data)) return payload.data
  return []
}

async function getAircraftFromDatabase(query = {}) {
  if (!CLIENT_AIRCRAFT_PATHS.length) return []

  for (const path of CLIENT_AIRCRAFT_PATHS) {
    try {
      const payload = await api.get(path, {
        query: {
          per_page: 18,
          ...query,
        },
        timeoutMs: 15000,
      })
      const collection = normalizeArray(payload, ['aircraft', 'fleet', 'items', 'aeronaves'])

      if (collection.length) {
        return collection.map((item, index) => normalizeAircraftFromDatabase(item, index, path))
      }
    } catch {
      // Sigue probando rutas compatibles: cada backend puede exponer el catalogo con nombre distinto.
    }
  }

  return []
}

function filterAircraftByItinerary(aircraft = [], itinerary = {}) {
  const firstLeg = Array.isArray(itinerary.legs) ? itinerary.legs[0] || {} : {}
  const originRaw = firstLeg.origin || itinerary.origin || ''
  const originAirport = firstLeg.originAirport || itinerary.originAirport || null
  const hasOrigin = Boolean(String(originRaw || '').trim())
  const passengers = Number(itinerary.passengers || 0)
  const activeStatuses = new Set([
    '',
    'active',
    'trial_active',
    'approved',
    'aprobada',
    'available',
    'disponible',
  ])

  const filteredAircraft = aircraft
    .filter((item) => {
      const status = normalizeText(item.status).toLowerCase()
      return activeStatuses.has(status)
    })
    .filter(
      (item) =>
        !passengers || !Number(item.capacity || 0) || Number(item.capacity || 0) >= passengers,
    )
    .map((item) => {
      const baseAirportMatches = airportBaseMatches(originRaw, item.source_origin, originAirport)

      return {
        ...item,
        queried_base_airport: originRaw,
        base_airport_match: baseAirportMatches,
        match_reason: baseAirportMatches
          ? `Coincide con base_airport ${item.source_origin}`
          : item.match_reason ||
            (item.source_origin
              ? `Salida optimizada desde ${item.source_origin}`
              : 'Opción verificada'),
      }
    })
    .sort((first, second) => {
      const firstMatchesOrigin = airportBaseMatches(originRaw, first.source_origin, originAirport)
      const secondMatchesOrigin = airportBaseMatches(originRaw, second.source_origin, originAirport)

      if (firstMatchesOrigin !== secondMatchesOrigin) return firstMatchesOrigin ? -1 : 1
      return Number(second.capacity || 0) - Number(first.capacity || 0)
    })

  const exactBaseAirportMatches = filteredAircraft.filter((item) => item.base_airport_match)
  if (hasOrigin && exactBaseAirportMatches.length) {
    return exactBaseAirportMatches
  }

  return filteredAircraft
}

function formatDurationFromHours(hours = 0) {
  const normalizedHours = Number(hours || 0)
  if (!Number.isFinite(normalizedHours) || normalizedHours <= 0) return ''

  const totalMinutes = Math.max(Math.round(normalizedHours * 60), 0)
  const wholeHours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (wholeHours && minutes) return `${wholeHours} h ${minutes} m`
  if (wholeHours) return `${wholeHours} h`
  return `${minutes} m`
}

function buildCatalogFallbackQuotes(catalog = [], itinerary = {}) {
  const filteredCatalog = filterAircraftByItinerary(catalog, itinerary)
  const packageCode = normalizePriorityType(itinerary.priority_type || itinerary.flight_package)
  const attentionLevel = normalizeAttentionLevel(
    itinerary.attention_level || itinerary.priority_level || '',
  )
  const overnightNights = itinerary.overnight_nights || itinerary.days || 0

  return filteredCatalog
    .map((aircraft) => {
      const pricing = buildFlightPricingFormula(aircraft, {
        packageCode,
        priorityType: packageCode,
        attentionLevel,
        tripType: itinerary.trip_type || itinerary.trip_label || '',
        segmentCount: Array.isArray(itinerary.legs)
          ? itinerary.legs.length
          : itinerary.segment_count || itinerary.segments || 0,
        overnightNights,
        legs: itinerary.legs || [],
        origin: itinerary.origin || '',
        originAirport: itinerary.originAirport || null,
        repositioningRequired: preserveExplicitBoolean(itinerary.repositioningRequired),
        catering: itinerary.catering || '',
        wifi: itinerary.wifi || 'none',
        groundTransport: itinerary.groundTransport || itinerary.ground_transport || 'none',
        pets: itinerary.pets || '',
        specialBaggage: itinerary.special_baggage || itinerary.specialBaggage || '',
      })

      const fallbackBasePrice = asNumber(aircraft.base_price || resolveHourlyRate(aircraft))
      const fallbackFinalPrice = asNumber(
        aircraft.final_price || aircraft.price || aircraft.quoted_price || fallbackBasePrice,
      )
      const appliedOvernightCost = asNumber(aircraft.overnight_cost || aircraft.overnight_fees)
      const formulaOvernightCost = asNumber(pricing.extraServices?.overnight)
      const overnightDelta = appliedOvernightCost - formulaOvernightCost
      const adjustedIvaAmount = Math.max(
        asNumber(pricing.ivaAmount) + overnightDelta * asNumber(pricing.ivaRate),
        0,
      )
      const basePrice = pricing.baseCost > 0 ? pricing.baseCost : fallbackBasePrice
      const finalPrice =
        pricing.finalPrice > 0
          ? Math.max(pricing.finalPrice + overnightDelta * (1 + asNumber(pricing.ivaRate)), 0)
          : fallbackFinalPrice
      const billableHours =
        pricing.billableHours > 0 ? pricing.billableHours : asNumber(aircraft.billable_hours)
      const estimatedHours =
        pricing.realFlightHours > 0
          ? pricing.realFlightHours
          : asNumber(
              aircraft.real_flight_hours || aircraft.flight_hours || aircraft.estimated_hours,
            )

      if (!finalPrice) return null

      if (typeof console !== 'undefined') {
        const aircraftLabel =
          aircraft.aircraft ||
          aircraft.model ||
          aircraft.cabin ||
          `Aeronave ${aircraft.id || ''}`.trim()
        const quoteLines = [
          `[Cotizador mercado] ${aircraftLabel}`,
          `- Aircraft id: ${aircraft.aircraft_id || aircraft.id || ''}`,
          `- Aircraft name: ${aircraft.aircraft || aircraft.model || aircraft.name || aircraftLabel}`,
          `- Source: catalog_fallback_quote`,
          `- Pricing source: frontend_catalog_fallback`,
          `- Endpoint URL: ${aircraft.source_endpoint || CLIENT_AIRCRAFT_PATHS[0] || ''}`,
          `- Hours source: frontend_formula_fallback`,
          `- Expense fee source: ${
            aircraft.airport_expenses_usd || aircraft.airport_expenses || aircraft.expense_fee
              ? 'catalog_aircraft_record'
              : 'category_default'
          }`,
          `- Final billable hours: ${Number((billableHours || 0).toFixed(2))}`,
          `- Vuelo base: ${Number(basePrice.toFixed(2))}`,
          `- Overnight: ${Number(appliedOvernightCost.toFixed(2))}`,
          `- Expense fee: ${Number((pricing.expenseFee || 0).toFixed(2))}`,
          `- IVA: ${Number(adjustedIvaAmount.toFixed(2))}`,
          `- Total: ${Number(finalPrice.toFixed(2))}`,
          `- Horas cobrables: ${Number((billableHours || 0).toFixed(2))}`,
        ]
        console.log(quoteLines.join('\n'))
      }

      return {
        ...aircraft,
        match_id: aircraft.match_id || `catalog-${aircraft.id}`,
        matched_option_id: aircraft.matched_option_id || `catalog-${aircraft.id}`,
        base_price: basePrice,
        final_price: asMoney(finalPrice),
        priority_type: packageCode || aircraft.priority_type || 'essential',
        priority_multiplier:
          pricing.commercialMargin > 0
            ? pricing.commercialMargin
            : asNumber(aircraft.priority_multiplier || 1, 1),
        priority_price:
          pricing.finalPrice > 0 && pricing.subtotalBeforeMultipliers > 0
            ? Math.max(pricing.finalPrice - pricing.subtotalBeforeMultipliers, 0)
            : asNumber(aircraft.priority_price || 0, 0),
        operational_cost:
          pricing.operationalCosts > 0
            ? pricing.operationalCosts
            : asNumber(aircraft.operational_cost),
        repositioning_fee:
          pricing.repositioning > 0 ? pricing.repositioning : asNumber(aircraft.repositioning_fee),
        taxes: pricing.ivaAmount > 0 ? adjustedIvaAmount : asNumber(aircraft.taxes || aircraft.tax),
        time: aircraft.time || formatDurationFromHours(estimatedHours),
        estimated_hours: estimatedHours || '',
        billable_hours: billableHours || '',
        real_flight_hours:
          pricing.realFlightHours > 0
            ? pricing.realFlightHours
            : asNumber(aircraft.real_flight_hours) || '',
        minimum_hours:
          pricing.minimumHours > 0 ? pricing.minimumHours : aircraft.minimum_hours || '',
        climb_descent_minutes:
          pricing.climbDescentMinutes > 0
            ? pricing.climbDescentMinutes
            : asNumber(aircraft.climb_descent_minutes) || '',
        minimum_route_price:
          pricing.minimumRoutePrice > 0
            ? pricing.minimumRoutePrice
            : aircraft.minimum_route_price || '',
        route_band: pricing.routeBand?.code || '',
        route_multiplier: pricing.routeBand?.multiplier || 1,
        commercial_margin:
          pricing.commercialMargin > 0
            ? pricing.commercialMargin
            : asNumber(aircraft.commercial_margin, 1),
        priority_factor:
          pricing.priorityFactor > 0
            ? pricing.priorityFactor
            : asNumber(aircraft.priority_factor, 1),
        subtotal_before_multipliers:
          pricing.subtotalBeforeMultipliers > 0
            ? Math.max(pricing.subtotalBeforeMultipliers + overnightDelta, 0)
            : asNumber(aircraft.subtotal_before_multipliers),
        extra_services_total:
          pricing.extraServicesTotal > 0 || appliedOvernightCost > 0
            ? Math.max(pricing.extraServicesTotal + overnightDelta, 0)
            : asNumber(aircraft.extra_services_total),
        overnight_fees: appliedOvernightCost,
        overnight_cost: appliedOvernightCost,
        source: 'catalog_fallback_quote',
        pricing_source: 'frontend_catalog_fallback',
        endpoint_url: aircraft.source_endpoint || CLIENT_AIRCRAFT_PATHS[0] || '',
        source_table: aircraft.source_table || 'catalog_fallback_quote',
        match_reason: aircraft.match_reason || 'Cotizacion generada desde la base de salida',
        debug_pricing: {
          ...(aircraft.debug_pricing && typeof aircraft.debug_pricing === 'object'
            ? aircraft.debug_pricing
            : {}),
          hours_source: 'frontend_formula_fallback',
          expense_fee_source:
            aircraft.airport_expenses_usd || aircraft.airport_expenses || aircraft.expense_fee
              ? 'catalog_aircraft_record'
              : 'category_default',
          final_billable_hours: Number((billableHours || 0).toFixed(2)),
        },
      }
    })
    .filter(Boolean)
    .sort(
      (first, second) =>
        asNumber(first.base_airport_match ? 0 : 1) - asNumber(second.base_airport_match ? 0 : 1) ||
        basePriceSort(first, second),
    )
}

function basePriceSort(first = {}, second = {}) {
  return (
    asNumber(first.base_price || first.final_price, Number.MAX_SAFE_INTEGER) -
    asNumber(second.base_price || second.final_price, Number.MAX_SAFE_INTEGER)
  )
}

function normalizeFlightPackage(flightPackage = {}, index = 0) {
  const benefits = Array.isArray(flightPackage.benefits)
    ? flightPackage.benefits
    : Array.isArray(flightPackage.features)
      ? flightPackage.features.filter(Boolean)
      : [
          flightPackage.has_priority ? 'Prioridad operativa' : null,
          flightPackage.has_concierge ? 'Concierge activo' : null,
          flightPackage.has_reports ? 'Tracking y reportes' : null,
        ].filter(Boolean)

  return {
    id: flightPackage.id || flightPackage.code || `package-${index}`,
    code: normalizePriorityType(
      flightPackage.code || flightPackage.id || flightPackage.slug || flightPackage.name,
    ),
    name: flightPackage.name || flightPackage.title || `Paquete ${index + 1}`,
    badge: flightPackage.badge || flightPackage.code || '',
    category: flightPackage.category || flightPackage.segment || 'Servicio privado',
    price:
      flightPackage.price || asMoney(flightPackage.price_total || flightPackage.price_from || ''),
    multiplier: asNumber(
      flightPackage.multiplier || flightPackage.priority_multiplier || flightPackage.factor || 1,
      1,
    ),
    benefits,
    action: flightPackage.action || 'Elegir paquete',
  }
}

function isFlightPackageRecord(flightPackage = {}) {
  const normalizedName = String(flightPackage.name || flightPackage.title || '')
    .trim()
    .toLowerCase()
  const normalizedCode = String(flightPackage.code || flightPackage.id || '')
    .trim()
    .toLowerCase()
  const normalizedCategory = String(flightPackage.category || flightPackage.segment || '')
    .trim()
    .toLowerCase()

  if (DEFAULT_FLIGHT_PACKAGE_NAMES.has(normalizedName)) return true
  if (['empty-leg', 'empty_leg', 'essential', 'business', 'elite'].includes(normalizedCode))
    return true
  if (normalizedCategory.includes('servicio') || normalizedCategory.includes('flight package'))
    return true

  return false
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

function nestedReservationRecord(request = {}) {
  return request.reservation && typeof request.reservation === 'object' ? request.reservation : null
}

function collectPayments(request = {}) {
  const nestedReservation = nestedReservationRecord(request)
  const directPayments = Array.isArray(request.payments) ? request.payments : []
  const nestedPayments = Array.isArray(nestedReservation?.payments)
    ? nestedReservation.payments
    : []

  return [...directPayments, ...nestedPayments].filter(
    (payment) => payment && typeof payment === 'object',
  )
}

function latestPaymentStatus(request = {}) {
  const payments = collectPayments(request)

  if (!payments.length) return ''

  const latestPayment = [...payments].sort((first, second) => {
    const firstDate = Date.parse(first?.updated_at || first?.paid_at || first?.created_at || '')
    const secondDate = Date.parse(second?.updated_at || second?.paid_at || second?.created_at || '')
    return (
      (Number.isFinite(secondDate) ? secondDate : 0) - (Number.isFinite(firstDate) ? firstDate : 0)
    )
  })[0]

  return latestPayment?.status || ''
}

function listRequestMatches(request = {}) {
  const collections = [request.matches, request.matched_options]
  return collections.flatMap((items) =>
    Array.isArray(items) ? items.filter((item) => item && typeof item === 'object') : [],
  )
}

function pickAcceptedRequestMatch(request = {}) {
  return (
    listRequestMatches(request).find((match) => {
      const normalizedStatus = normalizeWorkflowToken(
        match.status || match.workflow_status || match.state,
      )
      return ['accepted', 'aceptada', 'aceptado', 'approved', 'aprobada', 'matched'].includes(
        normalizedStatus,
      )
    }) || null
  )
}

function pickPreferredClientMatch(request = {}) {
  const matches = listRequestMatches(request)
  if (!matches.length) return null

  const assignedMatchId = request.match_id || request.matched_option_id || null
  if (assignedMatchId) {
    const exactMatch = matches.find(
      (match) =>
        String(match?.match_id || match?.matched_option_id || match?.id || '') ===
        String(assignedMatchId),
    )
    if (exactMatch) return exactMatch
  }

  const assignedAircraftId = request.assigned_aircraft_id || request.aircraft_id || null
  if (assignedAircraftId) {
    const assignedMatch = matches.find(
      (match) =>
        String(match?.aircraft_id || match?.aircraft?.id || '') === String(assignedAircraftId),
    )
    if (assignedMatch) return assignedMatch
  }

  const assignedAircraftModel = String(
    request.assigned_aircraft_model || request.aircraft_model || request.aircraft_name || '',
  ).trim()
  if (assignedAircraftModel) {
    const modelMatch = matches.find((match) => {
      const matchModel = String(
        match?.aircraft_model ||
          match?.model ||
          match?.visibility_payload?.aircraft_model ||
          match?.aircraft?.model ||
          '',
      ).trim()

      return matchModel && matchModel.toLowerCase() === assignedAircraftModel.toLowerCase()
    })
    if (modelMatch) return modelMatch
  }

  return pickAcceptedRequestMatch(request) || matches[0]
}

export function deriveClientWorkflowStatus(request = {}) {
  return (
    resolveSharedWorkflowStatus({
      ...request,
      payment_status:
        request.payment_status ||
        request.payment_order?.status ||
        latestPaymentStatus(request) ||
        '',
    }) || ''
  )
}

export function normalizeTrip(request = {}, options = {}) {
  const entityType = String(options.entityType || '').trim() || 'trip'
  const explicitWorkflowValue = request.workflow_status || request.workflow || ''
  const legs = Array.isArray(request.legs)
    ? request.legs
        .map((leg) => ({
          id: leg.id || '',
          leg_order: leg.leg_order || '',
          origin: leg.origin || '',
          destination: leg.destination || '',
          departure_datetime: leg.departure_datetime || '',
          arrival_datetime: leg.arrival_datetime || '',
          passengers: leg.passengers || '',
          distance_km: leg.distance_km || '',
        }))
        .filter((leg) => leg.origin && leg.destination)
    : []
  const requirements = Array.isArray(request.requirements)
    ? request.requirements
        .map((leg, index) => ({
          id: leg.id || '',
          leg_order: leg.leg_order || index + 2,
          origin: leg.origin || '',
          destination: leg.destination || '',
          date: leg.date || '',
          time: leg.time || '',
          departure_datetime: leg.departure_datetime || '',
          originAirport: leg.originAirport || null,
          destinationAirport: leg.destinationAirport || null,
        }))
        .filter((leg) => leg.origin && leg.destination)
    : []
  const route = legs.length
    ? legs
        .map((leg, index) =>
          index === 0 ? `${leg.origin} -> ${leg.destination}` : leg.destination,
        )
        .join(' -> ')
    : [request.origin, request.destination].filter(Boolean).join(' -> ')
  const preferredMatch = pickPreferredClientMatch(request)
  const visibilityPayload =
    request.visibility_payload && typeof request.visibility_payload === 'object'
      ? request.visibility_payload
      : {}
  const snapshotRecord =
    request.aircraft_snapshot && typeof request.aircraft_snapshot === 'object'
      ? request.aircraft_snapshot
      : visibilityPayload.aircraft_snapshot &&
          typeof visibilityPayload.aircraft_snapshot === 'object'
        ? visibilityPayload.aircraft_snapshot
        : {}
  const visibilitySnapshotRecord =
    visibilityPayload.aircraft && typeof visibilityPayload.aircraft === 'object'
      ? visibilityPayload.aircraft
      : {}
  const visibilityAircraftRecord = Object.keys(visibilitySnapshotRecord).length
    ? visibilitySnapshotRecord
    : {}
  const pricingContext =
    request.pricing_context && typeof request.pricing_context === 'object'
      ? request.pricing_context
      : null
  const aircraftRecord =
    (Object.keys(snapshotRecord).length ? snapshotRecord : null) ||
    (Object.keys(visibilityAircraftRecord).length ? visibilityAircraftRecord : null) ||
    preferredMatch?.aircraft ||
    {}
  const resolvedFinalPrice = asNumber(
    request.selected_card_price ||
      pricingContext?.selected_card_price ||
      request.final_price ||
      request.total ||
      request.estimated_total ||
      request.final_price_display ||
      request.formatted_final_price ||
      request.amount ||
      request.net_amount ||
      pricingContext?.total ||
      pricingContext?.final_price ||
      snapshotRecord?.selected_card_price ||
      snapshotRecord?.total ||
      snapshotRecord?.final_price ||
      preferredMatch?.selected_card_price ||
      preferredMatch?.total ||
      preferredMatch?.final_price ||
      preferredMatch?.estimated_price ||
      preferredMatch?.quote_total ||
      preferredMatch?.quote ||
      preferredMatch?.price,
    0,
  )
  const resolvedBasePrice = asNumber(
    request.base_price ||
      request.flight_base ||
      preferredMatch?.base_price ||
      preferredMatch?.flight_base,
    0,
  )
  const resolvedAircraftModel = String(
    request.assigned_aircraft_model ||
      request.aircraft_model ||
      request.aircraft_name ||
      snapshotRecord?.aircraft_model ||
      snapshotRecord?.aircraft ||
      snapshotRecord?.model ||
      preferredMatch?.visibility_payload?.aircraft_model ||
      request.visibility_payload?.aircraft_model ||
      aircraftRecord?.model ||
      aircraftRecord?.name ||
      aircraftRecord?.aircraft ||
      aircraftRecord?.category ||
      '',
  ).trim()

  return {
    id: request.id || '',
    flight_request_id: request.flight_request_id || request.request_id || '',
    client_id: request.client_id || request.customer_id || request.user_id || request.client?.id || '',
    entity_type: entityType,
    is_reservation: entityType === 'reservation',
    summary_only: Boolean(request.summary_only),
    route,
    title: route || `Solicitud ${request.id || ''}`,
    origin: request.origin || legs[0]?.origin || '',
    destination: request.destination || legs[legs.length - 1]?.destination || '',
    date: request.departure_datetime || request.departure_date || '',
    created_at: request.created_at || request.createdAt || '',
    updated_at: request.updated_at || request.updatedAt || '',
    assigned_aircraft_id:
      request.assigned_aircraft_id ||
      request.aircraft_id ||
      preferredMatch?.aircraft_id ||
      aircraftRecord?.id ||
      '',
    assigned_provider_id:
      request.assigned_provider_id ||
      request.provider_id ||
      preferredMatch?.provider_id ||
      aircraftRecord?.provider_id ||
      '',
    status: request.status || '',
    explicit_workflow_status: explicitWorkflowValue,
    workflow_status: explicitWorkflowValue || deriveClientWorkflowStatus(request),
    trip_type: request.trip_type || '',
    passengers: request.passengers || '',
    flight_package:
      request.flight_package ||
      request.service_tier ||
      request.package_name ||
      request.package ||
      '',
    overnight_nights: Number(request.overnight_nights || request.days || 0) || 0,
    legs,
    requirements,
    estimated_total: resolvedFinalPrice > 0 ? asMoney(resolvedFinalPrice) : '',
    final_price: resolvedFinalPrice,
    final_price_display: resolvedFinalPrice > 0 ? asMoney(resolvedFinalPrice) : '',
    formatted_final_price: resolvedFinalPrice > 0 ? asMoney(resolvedFinalPrice) : '',
    selected_card_price:
      asNumber(
        request.selected_card_price ||
          pricingContext?.selected_card_price ||
          snapshotRecord?.selected_card_price ||
          preferredMatch?.selected_card_price ||
          resolvedFinalPrice ||
          0,
        0,
      ) || null,
    base_price: resolvedBasePrice,
    pricing_context: pricingContext,
    aircraft_snapshot: Object.keys(snapshotRecord).length ? snapshotRecord : null,
    aircraft: resolvedAircraftModel,
    aircraft_category:
      request.aircraft_category ||
      snapshotRecord?.cabin ||
      snapshotRecord?.category ||
      aircraftRecord?.category ||
      '',
    aircraft_capacity:
      request.aircraft_capacity || snapshotRecord?.capacity || aircraftRecord?.capacity || '',
    aircraft_image: resolveMediaUrl(
      request.aircraft_image ||
        resolvePrimaryAircraftImage(snapshotRecord) ||
        resolvePrimaryAircraftImage(aircraftRecord) ||
        preferredMatch?.image_url ||
        '',
    ),
    amenities: Array.isArray(snapshotRecord?.amenities)
      ? snapshotRecord.amenities
      : Array.isArray(aircraftRecord?.amenities)
        ? aircraftRecord.amenities
        : [],
    operator:
      request.operator ||
      request.provider_name ||
      preferredMatch?.provider_name ||
      preferredMatch?.provider?.name ||
      aircraftRecord?.provider_name ||
      '',
    payment_status: request.payment_status || '',
    contract: request.contract && typeof request.contract === 'object' ? request.contract : null,
    contract_status: request.contract?.status || request.contract_status || '',
    contract_signed_at: request.contract?.signed_at || request.contract_signed_at || '',
    payment_order:
      request.payment_order && typeof request.payment_order === 'object'
        ? request.payment_order
        : null,
  }
}

function tripSortValue(trip = {}) {
  const updatedAt = Date.parse(trip.updated_at || '')
  if (Number.isFinite(updatedAt)) return updatedAt

  const createdAt = Date.parse(trip.created_at || '')
  if (Number.isFinite(createdAt)) return createdAt

  const departureDate = Date.parse(trip.date || '')
  if (Number.isFinite(departureDate)) return departureDate

  const numericId = Number(trip.id || 0)
  if (Number.isFinite(numericId)) return numericId

  return 0
}

function hasMeaningfulValue(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return String(value).trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

function parseComparableTimestamp(value = '') {
  const timestamp = Date.parse(String(value || '').trim())
  return Number.isFinite(timestamp) ? timestamp : 0
}

function workflowRank(value = '') {
  const state = resolveWorkflowState(value)
  const order = [
    'draft',
    'quoted',
    'package_selected',
    'reserved',
    'provider_pending',
    'provider_accepted',
    'contract_pending',
    'contract_signed',
    'payment_pending',
    'payment_confirmed',
    'flight_confirmed',
    'tracking_live',
    'completed',
    'rejected',
    'cancelled',
  ]
  const index = order.indexOf(state.id)
  return index === -1 ? 0 : index
}

function preferMostAdvancedWorkflowValue(baseValue = '', detailValue = '') {
  if (!hasMeaningfulValue(baseValue)) return detailValue
  if (!hasMeaningfulValue(detailValue)) return baseValue

  return workflowRank(detailValue) >= workflowRank(baseValue) ? detailValue : baseValue
}

function paymentStatusRank(value = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (!normalized) return 0
  if (
    [
      'paid',
      'pagado',
      'pagada',
      'payment_confirmed',
      'payment confirmed',
      'pago confirmado',
      'pago aprobado',
    ].includes(normalized)
  ) {
    return 3
  }
  if (
    [
      'pending',
      'pendiente',
      'pendiente de pago',
      'pending_payment',
      'payment_pending',
      'payment pending',
      'pago pendiente',
      'pago en revision',
    ].includes(normalized)
  ) {
    return 2
  }

  return 1
}

function preferMostRelevantPaymentStatus(baseValue = '', detailValue = '') {
  if (!hasMeaningfulValue(baseValue)) return detailValue
  if (!hasMeaningfulValue(detailValue)) return baseValue

  return paymentStatusRank(detailValue) >= paymentStatusRank(baseValue) ? detailValue : baseValue
}

function pickMostRelevantExplicitWorkflow(baseRecord = {}, detailRecord = {}) {
  const baseWorkflow = baseRecord.explicit_workflow_status || baseRecord.workflow_status || ''
  const detailWorkflow = detailRecord.explicit_workflow_status || detailRecord.workflow_status || ''

  if (!hasMeaningfulValue(baseWorkflow)) return detailWorkflow
  if (!hasMeaningfulValue(detailWorkflow)) return baseWorkflow

  const baseUpdatedAt = parseComparableTimestamp(baseRecord.updated_at || baseRecord.updatedAt)
  const detailUpdatedAt = parseComparableTimestamp(
    detailRecord.updated_at || detailRecord.updatedAt,
  )

  if (baseUpdatedAt && detailUpdatedAt && baseUpdatedAt !== detailUpdatedAt) {
    return baseUpdatedAt > detailUpdatedAt ? baseWorkflow : detailWorkflow
  }

  return preferMostAdvancedWorkflowValue(baseWorkflow, detailWorkflow)
}

function mergeTripRecords(baseRecord = {}, detailRecord = {}) {
  const preferredDetailKeys = new Set([
    'client_id',
    'route',
    'title',
    'matches',
    'matched_options',
    'aircraft',
    'aircraft_image',
    'aircraft_category',
    'aircraft_capacity',
    'aircraft_snapshot',
    'requirements',
    'legs',
    'origin',
    'destination',
    'date',
    'departure_datetime',
    'overnight_nights',
    'trip_type',
    'passengers',
    'flight_package',
    'service_tier',
    'payment_status',
    'selected_card_price',
    'final_price',
    'final_price_display',
    'formatted_final_price',
    'estimated_total',
    'pricing_context',
    'operator',
  ])
  const merged = { ...baseRecord }
  const mostRelevantExplicitWorkflow = pickMostRelevantExplicitWorkflow(baseRecord, detailRecord)

  merged.status = preferMostAdvancedWorkflowValue(baseRecord.status, detailRecord.status)
  merged.explicit_workflow_status = mostRelevantExplicitWorkflow
  merged.workflow_status = merged.explicit_workflow_status
    ? merged.explicit_workflow_status
    : preferMostAdvancedWorkflowValue(baseRecord.workflow_status, detailRecord.workflow_status)

  if (
    hasMeaningfulValue(detailRecord.contract_status) &&
    !hasMeaningfulValue(baseRecord.contract_status)
  ) {
    merged.contract_status = detailRecord.contract_status
  }

  if (
    hasMeaningfulValue(detailRecord.payment_status) &&
    !hasMeaningfulValue(baseRecord.payment_status)
  ) {
    merged.payment_status = detailRecord.payment_status
  }

  Object.entries(detailRecord || {}).forEach(([key, value]) => {
    if (preferredDetailKeys.has(key) && hasMeaningfulValue(value)) {
      if (key === 'payment_status') {
        merged[key] = preferMostRelevantPaymentStatus(baseRecord.payment_status, value)
        return
      }

      merged[key] = value
      return
    }

    if (!hasMeaningfulValue(merged[key]) && hasMeaningfulValue(value)) {
      merged[key] = value
    }
  })

  merged.payment_status = preferMostRelevantPaymentStatus(
    baseRecord.payment_status,
    detailRecord.payment_status,
  )

  return merged
}

export function buildFlightRequestPayload(itinerary = {}) {
  const normalizedLegs = Array.isArray(itinerary.legs)
    ? itinerary.legs
        .map((leg) => {
          const date = String(leg?.date || '').trim()
          const time = String(leg?.time || '09:00').trim() || '09:00'

          return {
            origin: leg?.origin || '',
            destination: leg?.destination || '',
            date,
            time,
            departure_datetime: date ? `${date} ${time}` : '',
            passengers: Number(leg?.passengers || itinerary.passengers) || 1,
          }
        })
        .filter((leg) => leg.origin && leg.destination)
    : []
  const firstLeg = normalizedLegs[0] || {}
  const lastLeg = normalizedLegs[normalizedLegs.length - 1] || {}
  const inferredClosedRoute =
    normalizedLegs.length > 1 &&
    String(firstLeg.origin || '').trim() !== '' &&
    String(lastLeg.destination || '').trim() !== '' &&
    String(firstLeg.origin || '').trim().toUpperCase() ===
      String(lastLeg.destination || '').trim().toUpperCase()
  const explicitTripType = normalizeTripType(itinerary.trip_type, itinerary.trip_label)
  const tripType =
    explicitTripType !== 'one_way'
      ? explicitTripType
      : normalizedLegs.length > 2 || (normalizedLegs.length > 1 && !inferredClosedRoute)
        ? 'multi_leg'
        : normalizedLegs.length === 2 && inferredClosedRoute
          ? 'round_trip'
          : 'one_way'
  const hasExplicitOpenRoute =
    itinerary.open_route !== undefined && itinerary.open_route !== null
      ? Boolean(itinerary.open_route)
      : false
  const shouldCloseRoute =
    tripType === 'multi_leg' &&
    !hasExplicitOpenRoute &&
    (Boolean(itinerary.return_to_origin) ||
      Boolean(itinerary.return_to_start) ||
      Boolean(itinerary.close_route) ||
      Boolean(itinerary.return_datetime) ||
      inferredClosedRoute ||
      normalizedLegs.length > 1)
  const departureDate = firstLeg.date || ''
  const departureTime = firstLeg.time || '09:00'
  const returnDepartureDatetime =
    String(itinerary.return_datetime || '').trim() ||
    (inferredClosedRoute ? String(lastLeg.departure_datetime || '').trim() : '')
  const flightPackage = String(itinerary.flight_package || itinerary.service_tier || '').trim()
  const priorityType = normalizePriorityType(itinerary.priority_type || flightPackage)
  const attentionLevel = normalizeAttentionLevel(
    itinerary.attention_level || itinerary.priority_level || '',
  )
  const priorityMultiplier = asNumber(itinerary.priority_multiplier || 1, 1)
  const basePrice = asNumber(itinerary.flight_base || itinerary.base_price || 0, 0)
  const operationalFee = asNumber(itinerary.expense_fee || itinerary.operational_fee || 0, 0)
  const priorityPrice = asNumber(itinerary.priority_price || 0, 0)
  const finalPrice = asNumber(itinerary.total || itinerary.final_price || 0, 0)
  const subtotalBeforeMultipliers = asNumber(
    itinerary.subtotal || itinerary.subtotal_before_multipliers || basePrice,
    0,
  )
  const selectedAircraftModel = String(
    itinerary.assigned_aircraft_model ||
      itinerary.aircraft_model ||
      itinerary.aircraft_name ||
      itinerary.aircraft ||
      itinerary.model ||
      itinerary.preference ||
      '',
  ).trim()
  const pricingContext =
    itinerary.pricing_context && typeof itinerary.pricing_context === 'object'
      ? itinerary.pricing_context
      : buildCommercialSnapshot(
          {
            packageCode: priorityType,
            priorityType,
            attentionLevel,
            overnightNights: itinerary.overnight_nights || itinerary.days || 0,
            repositioningRequired: preserveExplicitBoolean(itinerary.repositioningRequired),
            catering: itinerary.catering || '',
            wifi: itinerary.wifi || 'none',
            groundTransport: itinerary.ground_transport || itinerary.groundTransport || 'none',
            pets: itinerary.pets || '',
            specialBaggage: itinerary.special_baggage || itinerary.specialBaggage || '',
          },
          {
            billableHours: itinerary.billable_hours,
            realFlightHours: itinerary.real_flight_hours,
            minimumHours: itinerary.minimum_hours,
            flightBase: basePrice,
            basePrice,
            repositioning: itinerary.repositioning_cost || itinerary.repositioning_fee,
            expenseFee: operationalFee,
            ivaAmount: itinerary.iva_amount || itinerary.taxes || itinerary.tax,
            subtotal: itinerary.subtotal || itinerary.subtotal_before_multipliers,
            operationalCostBreakdown: operationalFee,
            extraServicesTotal: itinerary.extra_services_total,
            subtotalBeforeMultipliers: itinerary.subtotal_before_multipliers,
            commercialMargin: itinerary.commercial_margin || priorityMultiplier,
            attentionFactor: itinerary.priority_factor,
            total: finalPrice,
            finalPrice,
          },
          itinerary.aircraft_snapshot || itinerary,
        )

  return {
    origin: firstLeg.origin || itinerary.origin || '',
    base_airport: firstLeg.origin || itinerary.origin || '',
    destination: firstLeg.destination || itinerary.destination || '',
    departure_datetime: departureDate ? `${departureDate} ${departureTime}` : '',
    return_datetime: returnDepartureDatetime || null,
    passengers: Number(itinerary.passengers) || 1,
    trip_type: tripType,
    trip_label: itinerary.trip_label || 'Ida',
    return_to_origin:
      tripType === 'multi_leg' ? shouldCloseRoute : Boolean(itinerary.return_to_origin),
    return_to_start:
      tripType === 'multi_leg' ? shouldCloseRoute : Boolean(itinerary.return_to_start),
    close_route: tripType === 'multi_leg' ? shouldCloseRoute : Boolean(itinerary.close_route),
    open_route: tripType === 'multi_leg' ? !shouldCloseRoute : Boolean(itinerary.open_route),
    aircraft_type: selectedAircraftModel || itinerary.preference || null,
    aircraft_model: selectedAircraftModel || null,
    assigned_aircraft_model: selectedAircraftModel || null,
    aircraft_name: selectedAircraftModel || null,
    aircraft_id: itinerary.aircraft_id || null,
    provider_id: itinerary.provider_id || null,
    match_id: itinerary.match_id || itinerary.matched_option_id || null,
    matched_option_id: itinerary.matched_option_id || itinerary.match_id || null,
    flight_package: flightPackage || priorityType || null,
    service_tier: flightPackage || priorityType || null,
    priority_type: priorityType,
    attention_level: attentionLevel || null,
    priority_multiplier: priorityMultiplier,
    base_price: basePrice || null,
    operational_fee: operationalFee || null,
    priority_price: priorityPrice,
    subtotal: subtotalBeforeMultipliers || null,
    estimated_total: finalPrice || null,
    total: finalPrice || null,
    final_price: finalPrice || null,
    time_display_mode: itinerary.time_display_mode || 'direct',
    billing_hours_mode: itinerary.billing_hours_mode || 'operational',
    flight_base_source: itinerary.flight_base_source || 'billable_hours',
    include_repositioning_in_billed_hours:
      itinerary.include_repositioning_in_billed_hours ?? true,
    include_return_to_base_in_billed_hours:
      itinerary.include_return_to_base_in_billed_hours ?? true,
    include_overnight_in_billed_hours:
      itinerary.include_overnight_in_billed_hours ?? false,
    selected_card_price: asNumber(itinerary.selected_card_price || finalPrice || 0, 0) || null,
    pricing_formula_version: pricingContext.pricing_formula_version,
    pricing_context: pricingContext,
    commercial_margin: pricingContext.commercial_margin || null,
    priority_factor: pricingContext.priority_factor || null,
    billable_hours: pricingContext.billable_hours || null,
    real_flight_hours: pricingContext.real_flight_hours || null,
    minimum_hours: pricingContext.minimum_hours || null,
    minimum_route_price: pricingContext.minimum_route_price || null,
    extra_services_total: pricingContext.extra_services_total || null,
    subtotal_before_multipliers: pricingContext.subtotal_before_multipliers || null,
    source_database: itinerary.source_database || null,
    source_table: itinerary.source_table || null,
    aircraft_snapshot:
      itinerary.aircraft_snapshot && typeof itinerary.aircraft_snapshot === 'object'
        ? itinerary.aircraft_snapshot
        : null,
    requirements:
      normalizedLegs.length > 1
        ? inferredClosedRoute && tripType === 'multi_leg'
          ? normalizedLegs.slice(1, -1)
          : normalizedLegs.slice(1)
        : [],
    pets: itinerary.pets || null,
    special_baggage: itinerary.special_baggage || itinerary.specialBaggage || null,
    overnight_nights:
      pricingContext.extras?.overnight_nights ||
      itinerary.overnight_nights ||
      itinerary.days ||
      null,
    notes: [
      itinerary.trip_label || tripType || '',
      flightPackage || priorityType,
      attentionLevel,
      pricingContext.pricing_formula_version || '',
      itinerary.pets === 'Si' ? 'Mascotas a bordo' : '',
      itinerary.special_baggage || itinerary.specialBaggage || '',
      `Minimo ruta ${pricingContext.minimum_route_price || 0}`,
      `Noches ${pricingContext.extras?.overnight_nights || itinerary.overnight_nights || itinerary.days || 0}`,
      `Subtotal ${pricingContext.subtotal_before_multipliers || 0}`,
      `Total ${pricingContext.final_price || finalPrice || 0}`,
    ]
      .filter(Boolean)
      .join(' · '),
  }
}

export async function getClientDestinations() {
  return FALLBACK_DESTINATIONS
}

export async function getClientFlightPackages() {
  try {
    if (!configuredFlightPackagesPath || configuredFlightPackagesPath === '/plans') {
      return FALLBACK_FLIGHT_PACKAGES.map(normalizeFlightPackage)
    }

    const payload = await api.get(CLIENT_FLIGHT_PACKAGES_PATH)
    const packages = normalizeArray(payload, [
      'packages',
      'flight_packages',
      'plans',
      'memberships',
    ]).filter(isFlightPackageRecord)

    if (!packages.length) {
      return FALLBACK_FLIGHT_PACKAGES.map(normalizeFlightPackage)
    }

    return packages.map(normalizeFlightPackage)
  } catch {
    return FALLBACK_FLIGHT_PACKAGES.map(normalizeFlightPackage)
  }
}

export const getClientMembershipPlans = getClientFlightPackages

export async function getClientTrips(options = {}) {
  const mergedQuery = {
    per_page: 10,
    ...options.query,
  }
  const candidatePaths = preferredClientTripsPath
    ? [
        preferredClientTripsPath,
        ...CLIENT_TRIPS_PATHS.filter((path) => path !== preferredClientTripsPath),
      ]
    : CLIENT_TRIPS_PATHS

  for (const path of candidatePaths) {
    try {
      const payload = await api.get(path, { ...options, query: mergedQuery })
      const reservations = normalizeArray(payload, ['reservations']).map((item) =>
        normalizeTrip(item, { entityType: 'reservation' }),
      )
      const flightRequests = normalizeArray(payload, ['flight_requests']).map((item) =>
        normalizeTrip(item, { entityType: 'flight_request' }),
      )

      let trips = []

      if (reservations.length || flightRequests.length) {
        const flightRequestMap = new Map(
          flightRequests.map((item) => [
            String(item.id || item.flight_request_id || '').trim(),
            item,
          ]),
        )
        const seenKeys = new Set()
        const normalizedReservations = reservations.map((item) => {
          const mergeKey = String(item.flight_request_id || item.id || '').trim()
          const requestRecord = mergeKey ? flightRequestMap.get(mergeKey) || null : null
          const mergedRecord = requestRecord ? mergeTripRecords(item, requestRecord) : item
          const requestWorkflowStatus = requestRecord
            ? requestRecord.explicit_workflow_status ||
              requestRecord.workflow_status ||
              deriveClientWorkflowStatus(requestRecord) ||
              ''
            : ''
          const reservationWorkflowStatus =
            item.explicit_workflow_status ||
            item.workflow_status ||
            deriveClientWorkflowStatus(item) ||
            ''
          const freshestExplicitWorkflowStatus = requestRecord
            ? pickMostRelevantExplicitWorkflow(item, requestRecord)
            : item.explicit_workflow_status || ''
          const freshestWorkflowStatus = preferMostAdvancedWorkflowValue(
            reservationWorkflowStatus,
            requestWorkflowStatus,
          )
          const resolvedWorkflowStatus =
            freshestExplicitWorkflowStatus ||
            freshestWorkflowStatus ||
            deriveClientWorkflowStatus(mergedRecord) ||
            mergedRecord.workflow_status ||
            mergedRecord.status ||
            ''

          return {
            ...mergedRecord,
            flight_request_id: item.flight_request_id || requestRecord?.id || item.id || '',
            is_reservation: true,
            id: item.id,
            workflow_status: resolvedWorkflowStatus,
            contract_status:
              mergedRecord.contract?.status ||
              mergedRecord.contract_status ||
              item.contract?.status ||
              '',
            contract_signed_at:
              mergedRecord.contract?.signed_at ||
              mergedRecord.contract_signed_at ||
              item.contract?.signed_at ||
              '',
          }
        })

        trips.push(...normalizedReservations)

        normalizedReservations.forEach((item) => {
          const mergeKey = String(item.flight_request_id || item.id || '').trim()
          if (mergeKey) seenKeys.add(mergeKey)
        })

        flightRequests.forEach((item) => {
          const mergeKey = String(item.id || item.flight_request_id || '').trim()
          if (mergeKey && seenKeys.has(mergeKey)) return
          trips.push(item)
        })
      } else {
        const fallbackEntityType = path.includes('/reservas') ? 'reservation' : 'flight_request'
        trips = normalizeArray(payload, ['trips', 'reservations', 'flight_requests']).map((item) =>
          normalizeTrip(item, { entityType: fallbackEntityType }),
        )
      }

      trips = trips.sort((first, second) => tripSortValue(second) - tripSortValue(first))

      preferredClientTripsPath = path
      return trips
    } catch {
      continue
    }
  }

  return []
}

export async function getClientTrip(flightRequestId, options = {}) {
  const normalizedId = normalizeEntityIdentifier(flightRequestId)

  if (!normalizedId) {
    throw new Error('No encontramos la solicitud del cliente.')
  }

  for (const path of CLIENT_TRIP_SHOW_PATHS) {
    try {
      const payload = await api.get(`${path}/${normalizedId}`, options)
      const tripPayload =
        payload?.flight_request || payload?.reservation || payload?.trip || payload?.data || payload

      if (tripPayload && typeof tripPayload === 'object') {
        return normalizeTrip(tripPayload, { entityType: 'flight_request' })
      }
    } catch {
      continue
    }
  }

  throw new Error('No se pudo cargar el detalle del viaje.')
}

function replaceRouteId(path, reservationId) {
  return String(path || '').replace(':id', String(reservationId || '').trim())
}

function normalizeEntityIdentifier(value) {
  if (value === null || value === undefined) return ''

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim()
  }

  if (typeof value === 'object') {
    return (
      normalizeEntityIdentifier(value.id) ||
      normalizeEntityIdentifier(value.reservation_id) ||
      normalizeEntityIdentifier(value.flight_request_id) ||
      normalizeEntityIdentifier(value.request_id) ||
      ''
    )
  }

  return ''
}

function buildContractSignSnapshot(
  snapshot = {},
  fallbackReservationId = '',
  fallbackFlightRequestId = '',
) {
  const baseSnapshot = snapshot && typeof snapshot === 'object' ? { ...snapshot } : {}
  const normalizedReservationId =
    normalizeEntityIdentifier(baseSnapshot.reservation_id) || fallbackReservationId
  const normalizedFlightRequestId =
    normalizeEntityIdentifier(baseSnapshot.flight_request_id) || fallbackFlightRequestId

  return {
    ...baseSnapshot,
    reservation_id: normalizedReservationId || undefined,
    flight_request_id: normalizedFlightRequestId || undefined,
  }
}

function isMissingOrUnsupportedRoute(error) {
  return [404, 405].includes(Number(error?.status || 0))
}

function isRestrictedWorkflowRoute(path = '') {
  return String(path || '').includes('/admin/')
}

function isRecoverableWorkflowSyncError(error) {
  const message = String(error?.payload?.message || error?.message || '').toLowerCase()

  return (
    message.includes('flight_requests_status_check') ||
    message.includes('violates check constraint') ||
    message.includes('payment_pending') ||
    message.includes('workflow')
  )
}

export async function markClientTripReadyForPayment(
  reservationId,
  contractPayload = {},
  options = {},
) {
  const normalizedReservationId = normalizeEntityIdentifier(reservationId)
  const normalizedFlightRequestId = normalizeEntityIdentifier(
    contractPayload?.flight_request_id || contractPayload?.contract_snapshot?.flight_request_id,
  )

  if (!normalizedReservationId) {
    throw new Error('No se encontro la reserva para avanzar a pago.')
  }

  const signPayload =
    contractPayload && typeof contractPayload === 'object'
      ? {
          id: normalizedReservationId,
          reservation: normalizedReservationId,
          reservation_id:
            normalizeEntityIdentifier(contractPayload.reservation_id) || normalizedReservationId,
          booking_id: normalizedReservationId,
          flight_request: normalizedFlightRequestId || undefined,
          flight_request_id: normalizedFlightRequestId || undefined,
          status: 'pending_payment',
          workflow_status: 'pago pendiente',
          contract_status: 'signed',
          payment_status: 'pending',
          contract_snapshot: buildContractSignSnapshot(
            contractPayload.contract_snapshot,
            normalizedReservationId,
            normalizedFlightRequestId,
          ),
          signature: contractPayload.signature || null,
        }
      : {}
  let contractSignError = null

  for (const path of CLIENT_RESERVATION_CONTRACT_SIGN_PATHS) {
    try {
      const payload = await api.post(
        replaceRouteId(path, normalizedReservationId),
        signPayload,
        options,
      )
      const record =
        payload?.reservation || payload?.trip || payload?.data || payload?.flight_request || payload
      const normalizedRecord = normalizeTrip(
        {
          ...(record && typeof record === 'object' ? record : {}),
          id: record?.id || normalizedReservationId,
          contract:
            payload?.contract && typeof payload.contract === 'object'
              ? payload.contract
              : record?.contract || null,
          payment_order:
            payload?.payment_order && typeof payload.payment_order === 'object'
              ? payload.payment_order
              : null,
          payment_status:
            record?.payment_status || payload?.payment_order?.status || 'Pendiente de pago',
        },
        {
          entityType: payload?.reservation ? 'reservation' : 'trip',
        },
      )

      if (normalizedRecord?.id) {
        return normalizedRecord
      }
    } catch (error) {
      if (isMissingOrUnsupportedRoute(error)) continue
      contractSignError = error
      break
    }
  }

  const workflowPayload = {
    ...buildWorkflowApiPayload('payment_pending'),
    status: 'pending_payment',
    contract_status: 'signed',
    payment_status: 'pending',
  }
  const workflowTargetId = normalizedFlightRequestId || normalizedReservationId
  const canUseWorkflowFallback =
    configuredTripWorkflowPath && !isRestrictedWorkflowRoute(configuredTripWorkflowPath)

  if (contractSignError && !isRecoverableWorkflowSyncError(contractSignError)) {
    throw contractSignError
  }

  if (!canUseWorkflowFallback) {
    if (contractSignError) throw contractSignError
    return normalizeTrip({
      id: normalizedReservationId,
      ...workflowPayload,
    })
  }

  const candidateRequests = [
    { method: 'patch', path: configuredTripWorkflowPath.replace(':id', workflowTargetId) },
    { method: 'put', path: configuredTripWorkflowPath.replace(':id', workflowTargetId) },
    { method: 'post', path: configuredTripWorkflowPath.replace(':id', workflowTargetId) },
  ]
  let lastError = contractSignError

  for (const candidate of candidateRequests) {
    try {
      const request =
        candidate.method === 'patch'
          ? api.patch(candidate.path, workflowPayload, options)
          : candidate.method === 'put'
            ? api.put(candidate.path, workflowPayload, options)
            : api.post(candidate.path, workflowPayload, options)
      const payload = await request
      const record =
        payload?.flight_request || payload?.reservation || payload?.trip || payload?.data || payload

      return normalizeTrip(
        {
          ...(record && typeof record === 'object' ? record : {}),
          id: record?.id || workflowTargetId,
          ...workflowPayload,
        },
        {
          entityType: payload?.reservation ? 'reservation' : 'trip',
        },
      )
    } catch (error) {
      lastError = error
    }
  }

  if (lastError) {
    throw lastError
  }

  return normalizeTrip(
    {
      id: normalizedReservationId,
      ...workflowPayload,
    },
    {
      entityType: 'reservation',
    },
  )
}

export async function markClientTripPaymentConfirmed(
  reservationId,
  paymentPayload = {},
  options = {},
) {
  const normalizedReservationId = normalizeEntityIdentifier(reservationId)
  const normalizedFlightRequestId = normalizeEntityIdentifier(
    paymentPayload?.flight_request_id || paymentPayload?.flightRequestId,
  )

  if (!normalizedReservationId) {
    throw new Error('No se encontro la reserva para confirmar el pago.')
  }

  const normalizedBrand = String(
    paymentPayload?.brand || paymentPayload?.card_brand || paymentPayload?.payment_brand || '',
  ).trim()
  const normalizedIntentId = String(
    paymentPayload?.payment_intent_id || paymentPayload?.paymentIntentId || '',
  ).trim()

  const workflowPayload = {
    ...buildWorkflowApiPayload('payment_confirmed'),
    status: 'payment_confirmed',
    reservation: normalizedReservationId,
    reservation_id: normalizedReservationId,
    booking_id: normalizedReservationId,
    flight_request: normalizedFlightRequestId || undefined,
    flight_request_id: normalizedFlightRequestId || undefined,
    contract_status: 'signed',
    payment_status: 'paid',
    payment_brand: normalizedBrand || undefined,
    payment_intent_id: normalizedIntentId || undefined,
    payment_order: {
      status: 'paid',
      brand: normalizedBrand || undefined,
      card_brand: normalizedBrand || undefined,
      payment_intent_id: normalizedIntentId || undefined,
    },
  }

  logClientPaymentRegistration('confirm-payment:request', {
    reservation_id: normalizedReservationId,
    flight_request_id: normalizedFlightRequestId || '',
    workflowPayload,
  })

  const directCandidates = CLIENT_PAYMENT_CONFIRM_PATHS.flatMap((path) => [
    { method: 'post', path: replaceRouteId(path, normalizedReservationId), body: workflowPayload },
    { method: 'patch', path: replaceRouteId(path, normalizedReservationId), body: workflowPayload },
    { method: 'put', path: replaceRouteId(path, normalizedReservationId), body: workflowPayload },
  ])

  let directError = null

  if (directCandidates.length) {
    try {
      const payload = await requestWithCandidates(
        directCandidates.map((candidate) => ({
          ...candidate,
          timeoutMs: options.timeoutMs,
        })),
      )
      logClientPaymentRegistration('confirm-payment:response', {
        reservation_id: normalizedReservationId,
        flight_request_id: normalizedFlightRequestId || '',
        workflowPayload,
        response: payload,
      })
      const record =
        payload?.reservation || payload?.trip || payload?.data || payload?.flight_request || payload

      return normalizeTrip(
        {
          ...(record && typeof record === 'object' ? record : {}),
          id: record?.id || normalizedReservationId,
          ...workflowPayload,
        },
        {
          entityType: payload?.reservation ? 'reservation' : 'trip',
        },
      )
    } catch (error) {
      logClientPaymentRegistration('confirm-payment:error', {
        reservation_id: normalizedReservationId,
        flight_request_id: normalizedFlightRequestId || '',
        workflowPayload,
        error,
      })
      directError = error
    }
  }

  const workflowTargetId = normalizedFlightRequestId || normalizedReservationId
  const canUseWorkflowFallback =
    configuredTripWorkflowPath && !isRestrictedWorkflowRoute(configuredTripWorkflowPath)

  if (!canUseWorkflowFallback) {
    if (directError) throw directError
    return normalizeTrip(
      {
        id: normalizedReservationId,
        ...workflowPayload,
      },
      {
        entityType: 'reservation',
      },
    )
  }

  const workflowCandidates = [
    {
      method: 'patch',
      path: configuredTripWorkflowPath.replace(':id', workflowTargetId),
      body: workflowPayload,
    },
    {
      method: 'put',
      path: configuredTripWorkflowPath.replace(':id', workflowTargetId),
      body: workflowPayload,
    },
    {
      method: 'post',
      path: configuredTripWorkflowPath.replace(':id', workflowTargetId),
      body: workflowPayload,
    },
  ]

  try {
    const payload = await requestWithCandidates(
      workflowCandidates.map((candidate) => ({
        ...candidate,
        timeoutMs: options.timeoutMs,
      })),
    )
    const record =
      payload?.flight_request || payload?.reservation || payload?.trip || payload?.data || payload

    return normalizeTrip(
      {
        ...(record && typeof record === 'object' ? record : {}),
        id: record?.id || workflowTargetId,
        ...workflowPayload,
      },
      {
        entityType: payload?.reservation ? 'reservation' : 'trip',
      },
    )
  } catch (error) {
    throw directError || error
  }
}

export async function ensureClientReservation(payload = {}, options = {}) {
  return api.post(CLIENT_RESERVATIONS_PATH, payload, options)
}

export async function downloadClientReservationContract(reservationId, options = {}) {
  const normalizedReservationId = normalizeEntityIdentifier(reservationId)

  if (!normalizedReservationId) {
    throw new Error('No encontramos la reserva para descargar el contrato.')
  }

  return requestWithCandidates(
    CLIENT_RESERVATION_CONTRACT_DOWNLOAD_PATHS.map((path) => ({
      method: 'download',
      path: replaceRouteId(path, normalizedReservationId),
      timeoutMs: options.timeoutMs,
    })),
  )
}

export async function searchClientFlights(itinerary, options = {}) {
  const firstLeg = Array.isArray(itinerary?.legs) ? itinerary.legs[0] || {} : {}
  const aircraftQuery = {
    origin: firstLeg.origin || itinerary?.origin || '',
    base_airport: firstLeg.origin || itinerary?.origin || '',
    passengers: itinerary?.passengers || '',
  }
  let matches = []
  const quoteEndpointUrl = resolveApiRequestUrl(QUOTES_PREVIEW_PATH)

  try {
    const payload = await api.post(QUOTES_PREVIEW_PATH, buildFlightRequestPayload(itinerary), {
      timeoutMs: options.timeoutMs || CLIENT_QUOTES_TIMEOUT_MS,
    })
    matches = normalizeMatches(payload, itinerary, {
      endpointUrl: quoteEndpointUrl,
      source: 'backend_preview',
      pricingSource: 'official_backend_pricing_v2',
    })

    if (typeof console !== 'undefined') {
      matches.forEach((item, index) => {
        const aircraftLabel =
          item.aircraft ||
          item.model ||
          item.cabin ||
          item.aircraft_category ||
          `Aeronave ${index + 1}`
        const basePrice = Number(item.base_price || 0)
        const debugPricing =
          item.debug_pricing && typeof item.debug_pricing === 'object' ? item.debug_pricing : {}
        const overnightFee = Number(debugPricing.overnight_fee || item.overnight_fee || 0)
        const overnightNights = Number(
          debugPricing.overnight_nights || item.overnight_nights || 0,
        )
        const overnightCost = Number(
          debugPricing.overnight_cost ||
            item.overnight_cost ||
            item.pricing_breakdown?.overnight_cost ||
            item.overnight_fees ||
            0,
        )
        const expenseFee = Number(item.expense_fee || 0)
        const ivaAmount = Number(item.taxes || item.tax || 0)
        const finalPrice = Number(item.total || item.final_price || 0)
        const billableHours = Number(item.billable_hours || 0)
        const rawHours = Number(
          item.flight_base_hours ||
            item.pricing_breakdown?.flight_base_hours ||
            item.pricing_breakdown?.time_breakdown?.flight_base_hours ||
            item.trip_flight_hours ||
            0,
        )
        const hourlyRate = Number(
          item.hourly_rate || item.pricing_breakdown?.hourly_rate || 0,
        )
        const source = String(item.source || item.source_table || 'backend_preview')
        const pricingSource = String(item.pricing_source || item.quote_strategy || 'backend')
        const endpointUrl = String(item.endpoint_url || quoteEndpointUrl || '')
        const finalBillableHours = Number(
          item.debug_pricing?.final_billable_hours || item.billable_hours || 0,
        )
        const hoursSource = String(
          item.debug_pricing?.hours_source ||
            item.flight_base_source ||
            item.pricing_breakdown?.flight_base_source ||
            'backend_preview',
        )
        const expenseFeeSource = String(
          item.debug_pricing?.expense_fee_source ||
            (expenseFee > 0 ? 'backend_preview' : ''),
        )

        console.log(`[Cotizador backend crudo] ${aircraftLabel}`)
        console.log(`- Aircraft id: ${item.aircraft_id || ''}`)
        console.log(`- Aircraft name: ${item.aircraft || item.model || aircraftLabel}`)
        console.log(`- Source: ${source}`)
        console.log(`- Pricing source: ${pricingSource}`)
        console.log(`- Endpoint URL: ${endpointUrl}`)
        console.log(`- Hours source: ${hoursSource}`)
        console.log(`- Expense fee source: ${expenseFeeSource}`)
        console.log(`- Final billable hours: ${finalBillableHours}`)
        console.log(`- Horas exactas usadas: ${rawHours}`)
        console.log(`- Horas mostradas/redondeadas: ${billableHours}`)
        console.log(`- Precio por hora: ${hourlyRate}`)
        console.log(`- Vuelo base backend: ${basePrice}`)
        console.log('- Overnight fee:', overnightFee)
        console.log('- Overnight nights:', overnightNights)
        console.log('- Overnight cost:', overnightCost)

        console.log(
          [
            `[Cotizador backend crudo] ${aircraftLabel}`,
            `- Aircraft id: ${item.aircraft_id || ''}`,
            `- Aircraft name: ${item.aircraft || item.model || aircraftLabel}`,
            `- Source: ${source}`,
            `- Pricing source: ${pricingSource}`,
            `- Endpoint URL: ${endpointUrl}`,
            `- Hours source: ${hoursSource}`,
            `- Expense fee source: ${expenseFeeSource}`,
            `- Final billable hours: ${finalBillableHours.toFixed(2)}`,
            `- Vuelo base backend: ${basePrice.toFixed(2)}`,
            `- Overnight backend: ${overnightCost.toFixed(2)}`,
            `- Expense fee backend: ${expenseFee.toFixed(2)}`,
            `- IVA backend: ${ivaAmount.toFixed(2)}`,
            `- Total backend: ${finalPrice.toFixed(2)}`,
            `- Horas cobrables backend: ${billableHours.toFixed(2)}`,
          ].join('\n'),
        )
      })

      // console.log('[client-quote] desglose de cotizacion', {
      //   itinerary: {
      //     origin: firstLeg.origin || itinerary?.origin || '',
      //     destination: firstLeg.destination || itinerary?.destination || '',
      //     passengers: itinerary?.passengers || '',
      //     overnight_nights: itinerary?.overnight_nights || itinerary?.days || 0,
      //     trip_type: itinerary?.trip_type || '',
      //   },
      //   matches: matches.map((item) => ({
      //     match_id: item.match_id || item.id,
      //     aircraft_id: item.aircraft_id,
      //     aircraft: item.aircraft,
      //     category: item.cabin || item.aircraft_category || '',
      //     hourly_rate: Number(item.hourly_rate || 0),
      //     billable_hours: Number(item.billable_hours || 0),
      //     real_flight_hours: Number(item.real_flight_hours || item.estimated_hours || 0),
      //     base_price: Number(item.base_price || 0),
      //     repositioning_fee: Number(item.repositioning_fee || 0),
      //     taxes: Number(item.taxes || 0),
      //     airport_fees: Number(
      //       item.pricing_breakdown?.airport_fees ||
      //         item.landing_fees ||
      //         item.fbo_fees ||
      //         0,
      //     ),
      //     operational_cost: Number(item.operational_cost || 0),
      //     extra_services_total: Number(item.extra_services_total || 0),
      //     expense_fee: Number(item.expense_fee || 0),
      //     overnight_fee: Number(item.overnight_fee || 0),
      //     overnight_nights:
      //       Number(
      //         item.pricing_breakdown?.overnight > 0 && Number(item.overnight_fee || 0) > 0
      //           ? item.pricing_breakdown.overnight / Number(item.overnight_fee || 1)
      //           : itinerary?.overnight_nights || itinerary?.days || 0,
      //       ) || 0,
      //     overnight_cost: Number(
      //       item.pricing_breakdown?.overnight ||
      //         item.overnight_fees ||
      //         0,
      //     ),
      //     subtotal_before_multipliers: Number(item.subtotal_before_multipliers || item.subtotal || 0),
      //     subtotal: Number(item.subtotal || 0),
      //     total: Number(item.total || 0),
      //     final_price: item.final_price || '',
      //     pricing_breakdown: item.pricing_breakdown || null,
      //   })),
      // })
    }
  } catch (error) {
    if (isAccessRestrictionError(error)) {
      throw error
    }

    // La vista de resultados solo debe mostrar cotizacion real calculada por backend.
  }

  const aircraft = await getAircraftFromDatabase(aircraftQuery)
  if (matches.length) {
    return filterAircraftByItinerary(mergeMatchesWithCatalogImages(matches, aircraft), itinerary)
  }

  return buildCatalogFallbackQuotes(aircraft, itinerary)
}

export async function createClientFlightRequest(itinerary, options = {}) {
  return api.post(CLIENT_TRIP_CREATE_PATH, buildFlightRequestPayload(itinerary), options)
}

export async function createClientCheckout(flightRequestId, payload = {}, options = {}) {
  const normalizedId = String(flightRequestId || '').trim()

  if (!normalizedId) {
    throw new Error('No se encontro la solicitud para iniciar el checkout.')
  }

  const body = {
    flight_request_id: normalizedId,
    booking_id: normalizedId,
    ...payload,
  }
  let lastError = null

  for (const path of CLIENT_CHECKOUT_PATHS) {
    try {
      return await api.post(path, body, options)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('No se pudo iniciar  Checkout.')
}

export async function createClientPaymentIntent(flightRequestId, payload = {}, options = {}) {
  const normalizedId = String(flightRequestId || '').trim()

  if (!normalizedId) {
    throw new Error('No se encontro la solicitud para iniciar el pago con tarjeta.')
  }

  const body = {
    flight_request_id: normalizedId,
    booking_id: normalizedId,
    ...payload,
  }
  let lastError = null

  for (const path of CLIENT_PAYMENT_INTENT_PATHS) {
    try {
      logClientPaymentRegistration('create-payment-intent:request', {
        path,
        body,
      })
      const response = await api.post(path, body, options)
      logClientPaymentRegistration('create-payment-intent:response', {
        path,
        body,
        response,
      })
      return response
    } catch (error) {
      logClientPaymentRegistration('create-payment-intent:error', {
        path,
        body,
        error,
      })
      lastError = error
    }
  }

  throw lastError || new Error('No se pudo crear el PaymentIntent.')
}

export async function createClientWireIntent(flightRequestId, payload = {}, options = {}) {
  const normalizedId = String(flightRequestId || '').trim()

  if (!normalizedId) {
    throw new Error('No se encontro la solicitud para generar la referencia bancaria.')
  }

  const body = {
    flight_request_id: normalizedId,
    booking_id: normalizedId,
    ...payload,
  }
  let lastError = null

  for (const path of CLIENT_WIRE_PATHS) {
    try {
      logClientPaymentRegistration('create-wire-intent:request', {
        path,
        body,
      })
      const response = await api.post(path, body, options)
      logClientPaymentRegistration('create-wire-intent:response', {
        path,
        body,
        response,
      })
      return response
    } catch (error) {
      logClientPaymentRegistration('create-wire-intent:error', {
        path,
        body,
        error,
      })
      lastError = error
    }
  }

  throw lastError || new Error('No se pudieron generar las instrucciones bancarias.')
}

export async function createClientAccessCheckout(payload = {}, options = {}) {
  let lastError = null

  for (const path of CLIENT_ACCESS_CHECKOUT_PATHS) {
    try {
      logClientPaymentRegistration('create-access-checkout:request', {
        path,
        body: payload,
      })
      const response = await api.post(path, payload, options)
      logClientPaymentRegistration('create-access-checkout:response', {
        path,
        body: payload,
        response,
      })
      return response
    } catch (error) {
      logClientPaymentRegistration('create-access-checkout:error', {
        path,
        body: payload,
        error,
      })
      lastError = error
    }
  }

  throw lastError || new Error('No se pudo iniciar Stripe Checkout para el acceso comercial.')
}

export async function getClientAccessPaymentSuccess(payload = {}, options = {}) {
  const sessionId = String(payload?.session_id || payload?.sessionId || payload?.checkout_session_id || payload?.checkoutSessionId || '').trim()
  let lastError = null

  for (const path of CLIENT_ACCESS_PAYMENT_SUCCESS_PATHS) {
    try {
      return await api.get(path, {
        ...options,
        query: sessionId
          ? {
              session_id: sessionId,
            }
          : undefined,
      })
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('No se pudo validar el pago del acceso comercial.')
}

export async function cancelClientAccessPayment(payload = {}, options = {}) {
  const sessionId = String(payload?.session_id || payload?.sessionId || payload?.checkout_session_id || payload?.checkoutSessionId || '').trim()
  let lastError = null

  for (const path of CLIENT_ACCESS_PAYMENT_CANCEL_PATHS) {
    try {
      return await api.get(path, {
        ...options,
        query: sessionId
          ? {
              session_id: sessionId,
            }
          : undefined,
      })
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('No se pudo cancelar el pago del acceso comercial.')
}

export async function getClientAccessStatus(options = {}) {
  let lastError = null

  for (const path of CLIENT_ACCESS_STATUS_PATHS) {
    try {
      return await api.get(path, options)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('No se pudo consultar el estado del acceso comercial.')
}

export async function requestConcierge(message) {
  if (!message.trim()) return null

  try {
    return await api.post('/client/concierge/request', {
      message,
    })
  } catch {
    return null
  }
}
