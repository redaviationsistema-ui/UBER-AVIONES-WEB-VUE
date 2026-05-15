const COMMERCIAL_MARGIN_BY_PACKAGE = {
  empty_leg: 0.95,
  essential: 1.1,
  business: 1.2,
  elite: 1.35,
}

const PRIORITY_FACTOR_BY_LEVEL = {
  normal: 1,
  priority: 1.15,
  urgent: 1.3,
}

const DEFAULT_EXTRA_SERVICE_FEES = {
  catering: {
    none: 0,
    light: 250,
    premium: 600,
  },
  groundTransport: {
    none: 0,
    one_way: 180,
    round_trip: 320,
  },
  wifi: {
    none: 0,
    included: 0,
    required: 150,
  },
  overnight: {
    no: 0,
    yes: 450,
  },
  scheduleFlexibility: {
    flexible: 0,
    fixed: 0,
    urgent: 350,
  },
}

const DISTANCE_ROUTE_BANDS = [
  { code: 'regional_short', minKm: 0, maxKm: 300, multiplier: 1, reserveHours: 0.35 },
  { code: 'medium', minKm: 301, maxKm: 700, multiplier: 1.25, reserveHours: 0.6 },
  { code: 'long', minKm: 701, maxKm: 1500, multiplier: 2.1, reserveHours: 1.15 },
  { code: 'ultra_long', minKm: 1501, maxKm: Number.POSITIVE_INFINITY, multiplier: 2.8, reserveHours: 1.5 },
]

const ROUTE_MARKET_FLOOR_BY_BAND = {
  regional_short: { hourlyFloor: 900, minimumTotal: 1800 },
  medium: { hourlyFloor: 1400, minimumTotal: 3200 },
  long: { hourlyFloor: 2200, minimumTotal: 7800 },
  ultra_long: { hourlyFloor: 2800, minimumTotal: 9800 },
}

const SHORT_ROUTE_CATEGORY_MINIMUM_PRICE = {
  helicopter: 2200,
  turboprop: 2800,
  light_jet: 3800,
  mid_jet: 4800,
  heavy_jet: 7000,
  default: 3000,
}

const DEFAULT_EXPENSE_FEE = 100
const DEFAULT_IVA_RATE = 0.16
const DEFAULT_PET_FEE = 250
const DEFAULT_SPECIAL_BAGGAGE_FEE = 180

function asNumber(value, fallback = 0) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : fallback
}

function normalizeCode(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function normalizeAirportToken(value = '') {
  return String(value || '')
    .trim()
    .toUpperCase()
}

function airportMatchesRoute(baseAirport = '', routeAirport = '', routeAirportData = null) {
  const normalizedBase = normalizeAirportToken(baseAirport)
  if (!normalizedBase) return false

  const candidates = [
    routeAirport,
    routeAirportData?.code,
    routeAirportData?.iata,
  ]
    .map((value) => normalizeAirportToken(value))
    .filter(Boolean)

  return candidates.includes(normalizedBase)
}

function resolveRepositioningApplies(record = {}, context = {}) {
  if (context.repositioningRequired === true) return true
  if (context.repositioningRequired === false) return false

  if (record.base_airport_match === true) return false

  const firstLeg = Array.isArray(context.legs) ? context.legs[0] || {} : {}
  const requestedOrigin = firstLeg.origin || context.origin || ''
  const requestedOriginAirport = firstLeg.originAirport || context.originAirport || null
  const baseAirport =
    record.source_origin ||
    record.base_airport ||
    record.base ||
    record.base_airport_code ||
    record.home_base ||
    record.airport ||
    ''

  if (!baseAirport || !requestedOrigin) return true

  return !airportMatchesRoute(baseAirport, requestedOrigin, requestedOriginAirport)
}

function normalizeCountry(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function inferAirportCountry(airportCode = '', airportData = null) {
  const explicitCountry = normalizeCountry(airportData?.country || airportData?.pais)
  if (explicitCountry) return explicitCountry

  const normalizedCode = normalizeAirportToken(airportCode || airportData?.code || airportData?.iata)
  if (normalizedCode.startsWith('MM')) return 'mexico'
  return ''
}

function resolveIvaRateForRoute(context = {}) {
  const legs = Array.isArray(context.legs) ? context.legs : []
  if (!legs.length) return DEFAULT_IVA_RATE

  const hasInternationalLeg = legs.some((leg) => {
    const originCountry = inferAirportCountry(leg.origin, leg.originAirport)
    const destinationCountry = inferAirportCountry(leg.destination, leg.destinationAirport)

    if (!originCountry || !destinationCountry) return false
    return originCountry !== 'mexico' || destinationCountry !== 'mexico'
  })

  return hasInternationalLeg ? 0.04 : 0.16
}

function resolveAircraftCategoryKey(category = '') {
  const normalizedCategory = normalizeCode(category)

  if (normalizedCategory.includes('helic')) return 'helicopter'
  if (normalizedCategory.includes('turboprop') || normalizedCategory.includes('turbo_prop')) return 'turboprop'
  if (normalizedCategory === 'mid_jet') return 'mid_jet'
  if (normalizedCategory === 'light_jet') return 'light_jet'
  if (normalizedCategory === 'heavy_jet') return 'heavy_jet'
  if (normalizedCategory.includes('heavy') || normalizedCategory.includes('long_range')) return 'heavy_jet'
  if (
    normalizedCategory.includes('mid') ||
    normalizedCategory.includes('midsize') ||
    normalizedCategory.includes('super_mid')
  ) {
    return 'mid_jet'
  }
  if (normalizedCategory.includes('light')) return 'light_jet'
  return 'default'
}

function inferMinimumHours(category = '', providedMinimum = 0) {
  const explicitMinimum = asNumber(providedMinimum)
  if (explicitMinimum > 0) return explicitMinimum

  const normalizedCategory = normalizeCode(category)

  if (normalizedCategory.includes('turboprop') || normalizedCategory.includes('turbo_prop')) return 1.5
  if (normalizedCategory.includes('heavy')) return 3
  if (normalizedCategory.includes('light')) return 2
  return 2
}

function inferMinimumRoutePrice(record = {}, distanceKm = 0) {
  const explicitMinimumRoutePrice = asNumber(
    record.minimum_route_price ||
      record.min_route_price ||
      record.minimum_short_route_price ||
      record.short_route_minimum_price,
  )
  if (explicitMinimumRoutePrice > 0) return explicitMinimumRoutePrice

  if (asNumber(distanceKm) >= 300) return 0

  const categoryKey = resolveAircraftCategoryKey(
    record.cabin || record.category || record.aircraft_category || '',
  )

  return SHORT_ROUTE_CATEGORY_MINIMUM_PRICE[categoryKey] || SHORT_ROUTE_CATEGORY_MINIMUM_PRICE.default
}

function inferCruiseSpeedKmh(record = {}) {
  const normalizedCategory = normalizeCode(record.cabin || record.category || record.aircraft_category || '')

  if (normalizedCategory.includes('helic')) return 0.35 * 1062
  if (normalizedCategory.includes('ultra_long')) return 0.92 * 1062
  if (normalizedCategory.includes('heavy') || normalizedCategory.includes('long_range')) return 0.87 * 1062
  if (normalizedCategory.includes('mid') || normalizedCategory.includes('midsize') || normalizedCategory.includes('super_mid')) return 0.81 * 1062
  if (normalizedCategory.includes('light')) return 0.75 * 1062

  const explicitKmh = asNumber(record.speed_kmh || record.speedKmh || record.cruise_speed_kmh)
  if (explicitKmh > 0) return explicitKmh

  const explicitKnots = asNumber(record.speed_knots || record.speedKnots || record.cruise_speed_knots)
  if (explicitKnots > 0) return explicitKnots * 1.852

  if (normalizedCategory.includes('turboprop') || normalizedCategory.includes('turbo_prop')) return 500
  return 740
}

function resolveRouteBand(distanceKm = 0) {
  const normalizedDistanceKm = Math.max(asNumber(distanceKm), 0)

  return (
    DISTANCE_ROUTE_BANDS.find(
      (band) => normalizedDistanceKm >= band.minKm && normalizedDistanceKm <= band.maxKm,
    ) || DISTANCE_ROUTE_BANDS[0]
  )
}

function operationalReserveHours(distanceKm = 0) {
  return resolveRouteBand(distanceKm).reserveHours
}

function resolveAircraftTierFactor(record = {}) {
  const normalizedModel = normalizeCode(record.model || record.aircraft || record.aircraft_name || '')
  const normalizedCategory = normalizeCode(record.cabin || record.category || record.aircraft_category || '')
  const capacity = asNumber(record.capacity || record.passenger_capacity)
  const rangeKm = asNumber(record.range_km || record.rangeKm)
  const hourlyRate = asNumber(record.hourly_rate || record.hourly_price || record.price_per_hour)
  const speedKmh = inferCruiseSpeedKmh(record)

  let factor = 1

  if (normalizedCategory.includes('helic')) factor -= 0.1
  if (normalizedCategory.includes('turboprop') || normalizedCategory.includes('turbo_prop')) factor += 0.02
  if (normalizedCategory.includes('light')) factor += 0.1
  if (normalizedCategory.includes('mid') || normalizedCategory.includes('super_mid')) factor += 0.28
  if (normalizedCategory.includes('heavy') || normalizedCategory.includes('long_range')) factor += 0.7
  if (normalizedCategory.includes('ultra_long')) factor += 1.05

  if (rangeKm >= 6500) factor += 0.75
  else if (rangeKm >= 5000) factor += 0.45
  else if (rangeKm >= 4000) factor += 0.22
  else if (rangeKm >= 2500) factor += 0.08

  if (capacity >= 13) factor += 0.35
  else if (capacity >= 9) factor += 0.18
  else if (capacity >= 6) factor += 0.08

  if (hourlyRate >= 9000) factor += 1.2
  else if (hourlyRate >= 7000) factor += 0.75
  else if (hourlyRate >= 5500) factor += 0.35
  else if (hourlyRate >= 4200) factor += 0.12

  if (speedKmh >= 850) factor += 0.12
  else if (speedKmh >= 760) factor += 0.06

  const specComposite = (rangeKm / 1000) * 0.06 + capacity * 0.015 + (hourlyRate / 1000) * 0.04
  factor += Math.min(specComposite, 0.95)

  if (normalizedModel.includes('g450')) {
    factor += 0.45
  } else if (
    normalizedModel.includes('g_iv') ||
    normalizedModel.includes('g-iv') ||
    normalizedModel.includes('gulfstream_iv') ||
    normalizedModel.includes('gulfstream_g_iv')
  ) {
    factor += 0.35
  } else if (normalizedModel.includes('g200') || normalizedModel.includes('gulfstream_200')) {
    factor += 0.18
  } else if (normalizedModel.includes('hawker_800') || normalizedModel.includes('800xp')) {
    factor += 0.08
  } else if (normalizedModel.includes('learjet_31') || normalizedModel.includes('31a')) {
    factor -= 0.06
  }

  if (normalizedModel.includes('750') || normalizedModel.includes('citation_x') || normalizedModel.includes('latitude')) {
    factor += 0.16
  } else if (normalizedModel.includes('550') || normalizedModel.includes('citation_ii') || normalizedModel.includes('ii')) {
    factor += 0.04
  }

  return Math.max(factor, 1)
}

function resolveDynamicMarketFloor(record = {}, billableHours = 0, distanceKm = 0) {
  const routeBand = resolveRouteBand(distanceKm)
  const marketBand = ROUTE_MARKET_FLOOR_BY_BAND[routeBand.code] || ROUTE_MARKET_FLOOR_BY_BAND.regional_short
  const tierFactor = resolveAircraftTierFactor(record)
  const normalizedBillableHours = Math.max(asNumber(billableHours), 0)

  return {
    routeBand,
    tierFactor,
    floorFromHours: normalizedBillableHours * marketBand.hourlyFloor * tierFactor,
    minimumTotal: marketBand.minimumTotal * tierFactor,
  }
}

function resolveOperationalCosts(record = {}) {
  return (
    asNumber(record.landing_fees || record.landing_fee) +
    asNumber(record.handling_fee || record.handling_fees || record.fbo_fees || record.fbo) +
    asNumber(record.trip_support_fee || record.trip_support || record.dispatch_fee) +
    asNumber(record.crew_cost || record.crew_rate || record.crew_fee) +
    asNumber(record.permits_fee || record.permits) +
    asNumber(record.operational_cost)
  )
}

function resolveAirportFees(record = {}) {
  return (
    asNumber(record.landing_fees || record.landing_fee) +
    asNumber(record.handling_fee || record.handling_fees || record.fbo_fees || record.fbo)
  )
}

function resolveAdditionalOperationalCosts(record = {}) {
  return (
    asNumber(record.trip_support_fee || record.trip_support || record.dispatch_fee) +
    asNumber(record.crew_cost || record.crew_rate || record.crew_fee) +
    asNumber(record.permits_fee || record.permits) +
    asNumber(record.operational_cost)
  )
}

function resolvePriorityServiceFee(context = {}, record = {}) {
  const explicitFee = asNumber(record.priority_fee || record.priority_service_fee || context.priorityFee)
  if (explicitFee > 0) return explicitFee

  const level = normalizeCode(context.attentionLevel || context.priorityLevel || record.attention_level)
  if (level === 'urgent') return 450
  if (level === 'priority' || level === 'prioridad') return 220
  return 0
}

function resolvePetFee(context = {}, record = {}) {
  const explicitFee = asNumber(record.pet_fee || record.pets_fee || context.petFee)
  if (explicitFee > 0) return explicitFee

  const rawPets = String(context.pets || '').trim().toLowerCase()
  if (!rawPets) return 0
  if (['no', 'ninguno', 'ninguna', 'false'].includes(rawPets)) return 0
  return DEFAULT_PET_FEE
}

function resolveSpecialBaggageFee(context = {}, record = {}) {
  const explicitFee = asNumber(record.special_baggage_fee || record.baggage_fee || context.specialBaggageFee)
  if (explicitFee > 0) return explicitFee

  return String(context.specialBaggage || '').trim() ? DEFAULT_SPECIAL_BAGGAGE_FEE : 0
}

function resolveContextDistanceKm(context = {}) {
  const legs = Array.isArray(context.legs) ? context.legs : []
  const totalFromLegs = legs.reduce((sum, leg) => sum + asNumber(leg.distance_km || leg.distanceKm), 0)
  if (totalFromLegs > 0) return totalFromLegs

  const totalFromBreakdownLegs = Array.isArray(context.clientLegs)
    ? context.clientLegs.reduce((sum, leg) => sum + asNumber(leg.distance_km || leg.distanceKm), 0)
    : 0
  if (totalFromBreakdownLegs > 0) return totalFromBreakdownLegs

  return asNumber(context.distance_km || context.distanceKm || context.totalDistanceKm)
}

function resolveExtraServices(record = {}, context = {}) {
  const cateringKey = normalizeCode(context.catering || 'none')
  const groundTransportKey = normalizeCode(context.groundTransport || 'none')
  const wifiKey = normalizeCode(context.wifi || 'none')
  const overnightKey = normalizeCode(context.overnight || 'no')
  const overnightNights = Math.max(asNumber(context.overnightNights || context.itineraryDays), 0)
  const flexibilityKey = normalizeCode(context.scheduleFlexibility || 'flexible')

  const catering =
    asNumber(record.catering_fee) +
    (DEFAULT_EXTRA_SERVICE_FEES.catering[cateringKey] ?? 0)
  const groundTransport =
    asNumber(record.ground_transport_fee || record.ground_transfer_fee) +
    (DEFAULT_EXTRA_SERVICE_FEES.groundTransport[groundTransportKey] ?? 0)
  const wifi =
    asNumber(record.wifi_fee) +
    (DEFAULT_EXTRA_SERVICE_FEES.wifi[wifiKey] ?? 0)
  const overnight =
    overnightNights > 0
      ? Math.max(asNumber(record.overnight_fee), DEFAULT_EXTRA_SERVICE_FEES.overnight.yes) * overnightNights
      : Math.max(asNumber(record.overnight_fee), overnightKey === 'yes' ? DEFAULT_EXTRA_SERVICE_FEES.overnight.yes : 0)
  const urgentSchedule =
    asNumber(record.urgent_schedule_fee || record.rush_fee) +
    (DEFAULT_EXTRA_SERVICE_FEES.scheduleFlexibility[flexibilityKey] ?? 0)

  return {
    catering,
    groundTransport,
    wifi,
    overnight,
    urgentSchedule,
    total: catering + groundTransport + wifi + overnight + urgentSchedule,
  }
}

export function resolveCommercialMargin(packageCode = 'essential', explicitFactor = null) {
  const explicit = asNumber(explicitFactor)
  if (explicit > 0) return explicit

  return COMMERCIAL_MARGIN_BY_PACKAGE[normalizeCode(packageCode)] || COMMERCIAL_MARGIN_BY_PACKAGE.essential
}

export function resolvePriorityFactor(level = 'normal', explicitFactor = null) {
  const explicit = asNumber(explicitFactor)
  if (explicit > 0) return explicit

  return PRIORITY_FACTOR_BY_LEVEL[normalizeCode(level)] || PRIORITY_FACTOR_BY_LEVEL.normal
}

export function buildFlightPricingFormula(record = {}, context = {}) {
  const hourlyRate = asNumber(
    record.hourly_rate || record.hourly_price || record.price_per_hour || record.cost_per_hour || record.cost,
  )
  const distanceKm = resolveContextDistanceKm(context) || asNumber(record.distance_km || record.distanceKm)
  const cruiseSpeedKmh = inferCruiseSpeedKmh(record)
  const routeBand = resolveRouteBand(distanceKm)
  const explicitRealHours = asNumber(record.real_flight_hours || record.flight_hours || record.estimated_hours)
  const rawFlightHours = distanceKm > 0 && cruiseSpeedKmh > 0 ? distanceKm / cruiseSpeedKmh : 0
  const reserveHours = 0
  const realFlightHours = explicitRealHours > 0 ? explicitRealHours : rawFlightHours
  const billableHours = realFlightHours
  const minimumHours = 0
  const minimumRoutePrice = 0
  const rawBaseCost = realFlightHours * hourlyRate
  const baseCost = rawBaseCost
  const repositioning = 0
  const operationalCosts = 0
  const extraServices = {
    catering: 0,
    groundTransport: 0,
    wifi: 0,
    overnight: 0,
    urgentSchedule: 0,
    total: 0,
  }
  const extraServicesTotal = 0
  const expenseFee = 0
  const ivaRate = 0
  const subtotalBeforeMultipliers = baseCost + operationalCosts
  const ivaAmount = 0
  const commercialMargin = 1
  const priorityFactor = 1
  const dynamicMarketFloor = resolveDynamicMarketFloor(record, billableHours, distanceKm)
  const marginMultiplier = 1
  const totalBeforeTax = subtotalBeforeMultipliers
  const finalPrice = totalBeforeTax
  const hasFormulaInputs = subtotalBeforeMultipliers > 0 && (hourlyRate > 0 || distanceKm > 0 || explicitRealHours > 0)

  return {
    hasFormulaInputs,
    hourlyRate,
    minimumHours,
    minimumRoutePrice,
    distanceKm,
    routeBand,
    cruiseSpeedKmh,
    rawFlightHours,
    reserveHours,
    realFlightHours,
    billableHours,
    rawBaseCost,
    baseCost,
    repositioning,
    operationalCosts,
    extraServices,
    extraServicesTotal,
    expenseFee,
    ivaRate,
    ivaAmount,
    dynamicMarketFloor,
    commercialMargin,
    priorityFactor,
    subtotalBeforeMultipliers,
    finalPrice,
  }
}

export function normalizeAttentionLevel(value = '') {
  const normalized = normalizeCode(value)

  if (['priority', 'prioridad'].includes(normalized)) return 'priority'
  if (['urgent', 'urgente'].includes(normalized)) return 'urgent'
  return 'normal'
}

export function normalizePackageCode(value = '') {
  const normalized = normalizeCode(value)

  if (normalized === 'emptyleg') return 'empty_leg'
  if (['empty_leg', 'essential', 'business', 'elite'].includes(normalized)) return normalized
  return 'essential'
}

export function buildCommercialSnapshot(context = {}, pricing = {}, aircraft = {}) {
  return {
    pricing_formula_version: 'private-flight-v5-broker-distance',
    package_code: normalizePackageCode(context.priorityType || context.packageCode || aircraft.priority_type),
    attention_level: normalizeAttentionLevel(context.attentionLevel || context.priorityLevel),
    billable_hours: asNumber(pricing.billableHours),
    route_band: pricing.routeBand?.code || '',
    route_multiplier: asNumber(pricing.routeBand?.multiplier, 1),
    real_flight_hours: asNumber(pricing.realFlightHours),
    raw_flight_hours: asNumber(pricing.rawFlightHours),
    reserve_hours: asNumber(pricing.reserveHours),
    minimum_hours: asNumber(pricing.minimumHours),
    minimum_route_price: asNumber(pricing.minimumRoutePrice),
    hourly_rate: asNumber(aircraft.hourly_rate || aircraft.hourly_price || aircraft.price_per_hour),
    raw_base_cost: asNumber(pricing.rawBaseCost),
    base_cost: asNumber(pricing.basePrice),
    repositioning_cost: asNumber(pricing.repositioning),
    operational_costs_total: asNumber(pricing.operationalCostBreakdown || pricing.operationalFees),
    extra_services_total: asNumber(pricing.extraServicesTotal),
    expense_fee: asNumber(pricing.expenseFee, DEFAULT_EXPENSE_FEE),
    iva_rate: asNumber(pricing.ivaRate, DEFAULT_IVA_RATE),
    iva_amount: asNumber(pricing.ivaAmount),
    subtotal_before_multipliers: asNumber(pricing.subtotalBeforeMultipliers),
    commercial_margin: asNumber(pricing.commercialMargin || pricing.priorityMultiplier, 1),
    priority_factor: asNumber(pricing.attentionFactor, 1),
    final_price: asNumber(pricing.finalPrice),
    extras: {
      catering: context.catering || 'none',
      ground_transport: context.groundTransport || 'none',
      wifi: context.wifi || 'none',
      pets: context.pets || '',
      special_baggage: context.specialBaggage || '',
      overnight: context.overnight || 'no',
      overnight_nights: asNumber(context.overnightNights || context.itineraryDays),
      schedule_flexibility: context.scheduleFlexibility || 'flexible',
    },
  }
}
