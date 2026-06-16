import { featuredAirports } from './airports'

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
    light: 0,
    premium: 0,
  },
  groundTransport: {
    none: 0,
    one_way: 0,
    round_trip: 0,
  },
  wifi: {
    none: 0,
    included: 0,
    required: 0,
  },
  overnight: {
    no: 0,
    yes: 0,
  },
  scheduleFlexibility: {
    flexible: 0,
    fixed: 0,
    urgent: 0,
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

const DEFAULT_EXPENSE_FEE = 400
const DEFAULT_IVA_RATE = 0.16
const AIRPORT_EXPENSE_BY_CATEGORY = {
  HEAVY_JET: 2000,
  HEAVYJET: 2000,
  MIDSIZE_JET: 1000,
  MID_JET: 1000,
  MIDJET: 1000,
  LIGHT_JET: 800,
  LIGHTJET: 800,
  TURBOPROP: 600,
  HELICOPTERO: 700,
  HELICÓPTERO: 700,
}

function parseDbNumber(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null

  const raw = String(value).trim()
  if (!raw) return null

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

function resolveHourlyRate(record = {}) {
  const hourlyRate = asNumber(
    record.hourly_rate ||
      record.hourly_price ||
      record.price_per_hour ||
      record.cost_per_hour ||
      record.costPerHour ||
      record.rental_price_usd ||
      record.rentalPriceUsd ||
      record.charter_rate ||
      record.charterRate ||
      record.rate_per_hour ||
      record.ratePerHour ||
      record.cost,
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

function convertDistanceToKm(distance = 0, unit = '') {
  const normalizedDistance = asNumber(distance)
  const normalizedUnit = normalizeDistanceUnit(unit)

  if (normalizedUnit === 'nm') return normalizedDistance * 1.852
  return normalizedDistance
}

function distanceKmBetweenAirports(origin = null, destination = null) {
  const originLat = asNumber(origin?.latitude || origin?.lat)
  const originLng = asNumber(origin?.longitude || origin?.lng)
  const destinationLat = asNumber(destination?.latitude || destination?.lat)
  const destinationLng = asNumber(destination?.longitude || destination?.lng)

  if (!originLat || !originLng || !destinationLat || !destinationLng) return 0

  const earthRadiusKm = 6371
  const latDelta = ((destinationLat - originLat) * Math.PI) / 180
  const lngDelta = ((destinationLng - originLng) * Math.PI) / 180
  const originLatRad = (originLat * Math.PI) / 180
  const destinationLatRad = (destinationLat * Math.PI) / 180

  const angle =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(originLatRad) * Math.cos(destinationLatRad) * Math.sin(lngDelta / 2) ** 2

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(angle), Math.sqrt(1 - angle))
}

function roundUpQuarterHours(hours = 0) {
  return Math.ceil(Math.max(asNumber(hours), 0) * 4) / 4
}

function normalizeCode(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function resolveAirportExpenseByCategory(record = {}) {
  const explicitAirportExpense = asNumber(
    record.airport_expenses_usd ||
      record.airport_expenses ||
      record.expense_fee ||
      record.expenseFee,
  )
  if (explicitAirportExpense > 0) {
    return explicitAirportExpense > 0 && explicitAirportExpense < 100
      ? explicitAirportExpense * 1000
      : explicitAirportExpense
  }

  const category = String(
    record.motor_clase || record.motorClase || record.category || record.cabin || record.aircraft_category || '',
  )
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')

  return AIRPORT_EXPENSE_BY_CATEGORY[category] || 0
}

function normalizeAirportToken(value = '') {
  return String(value || '')
    .trim()
    .toUpperCase()
}

function normalizeAirportLookupText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function tokenizeAirportValue(value = '') {
  return String(value || '')
    .split(/[\s,/()-]+/)
    .map((token) => normalizeAirportLookupText(token))
    .filter(Boolean)
}

function appendAirportTokens(tokens, value = '') {
  const normalizedValue = normalizeAirportLookupText(value)
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

  const normalizedValue = normalizeAirportLookupText(value)

  featuredAirports.forEach((airportRecord) => {
    const airportTokens = [
      airportRecord.code,
      airportRecord.iata,
      airportRecord.city,
      airportRecord.name,
      `${airportRecord.city} ${airportRecord.iata}`,
      `${airportRecord.city} ${airportRecord.code}`,
    ]
      .map((item) => normalizeAirportLookupText(item))
      .filter(Boolean)

    const matchesAirport = airportTokens.some((token) => token === normalizedValue || tokens.has(token))
    if (!matchesAirport) return

    airportTokens.forEach((token) => tokens.add(token))
  })

  return tokens
}

function resolveTripTypeKey(value = '') {
  const normalized = normalizeCode(value)

  if (['round_trip', 'redondo', 'roundtrip'].includes(normalized)) return 'round_trip'
  if (['multi_leg', 'multi_city', 'multi_destino', 'multidestino'].includes(normalized)) return 'multi_destination'
  return 'one_way'
}

function resolveBaseAirportCode(record = {}) {
  return (
    record.source_origin ||
    record.base_airport ||
    record.base ||
    record.base_airport_code ||
    record.home_base ||
    record.airport ||
    ''
  )
}

function airportMatchesRoute(baseAirport = '', routeAirport = '', routeAirportData = null) {
  const baseTokens = airportLookupTokens(baseAirport)
  const routeTokens = airportLookupTokens(routeAirport, routeAirportData)
  if (!baseTokens.size || !routeTokens.size) return false

  for (const token of routeTokens) {
    if (baseTokens.has(token)) return true
  }

  return false
}

function resolveClientRouteEndpoints(context = {}) {
  const legs = resolveFlightLegs(context)
  const firstLeg = legs[0] || {}
  const lastLeg = legs[legs.length - 1] || {}

  return {
    firstAirport: firstLeg.origin || context.origin || '',
    firstAirportData: firstLeg.originAirport || context.originAirport || null,
    lastAirport: lastLeg.destination || context.destination || '',
    lastAirportData: lastLeg.destinationAirport || context.destinationAirport || null,
  }
}

function resolveChargeFlag(value, fallback) {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false

  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  if (['true', 'yes', 'si', 'sí'].includes(normalized)) return true
  if (['false', 'no'].includes(normalized)) return false
  return fallback
}

function resolveRepositioningPolicy(record = {}, context = {}) {
  const baseAirport = resolveBaseAirportCode(record)
  const tripType = resolveTripTypeKey(context.tripType || context.trip_type || context.tripLabel || context.trip_label)
  const { firstAirport, firstAirportData, lastAirport, lastAirportData } = resolveClientRouteEndpoints(context)

  const initialRequired = baseAirport ? !airportMatchesRoute(baseAirport, firstAirport, firstAirportData) : false
  const finalRequired = baseAirport ? !airportMatchesRoute(baseAirport, lastAirport, lastAirportData) : false

  const explicitRequired = context.repositioningRequired
  const initialCharge = resolveChargeFlag(
    record.charge_initial_repositioning ?? context.chargeInitialRepositioning,
    initialRequired,
  )
  const defaultReturnCharge = tripType === 'multi_destination'
  const finalCharge = resolveChargeFlag(
    record.charge_return_to_base ?? context.chargeReturnToBase,
    defaultReturnCharge,
  )

  const chargeInitial = explicitRequired === false ? false : initialRequired && initialCharge
  const chargeFinal =
    explicitRequired === false
      ? false
      : finalRequired && (explicitRequired === true ? true : finalCharge)

  return {
    tripType,
    baseAirport,
    initialRequired,
    finalRequired,
    chargeInitial,
    chargeFinal,
    totalChargeableLegs: Number(chargeInitial) + Number(chargeFinal),
  }
}

function resolveRepositioningFactor(record = {}, context = {}) {
  const explicitFactor = asNumber(
    record.repositioning_factor ||
      record.repo_factor ||
      record.reposition_factor ||
      context.repositioningFactor ||
      context.repoFactor,
  )

  if (explicitFactor > 0) return explicitFactor
  return 0.8
}

function resolveExplicitRepositioningAmount(record = {}) {
  return asNumber(
    record.repositioning_fee ||
      record.repositioning_cost ||
      record.reposition_fee ||
      record.reposition_cost,
  )
}

function resolveExplicitRepositioningHours(record = {}, hourlyRate = 0, factor = 1) {
  const explicitHours = asNumber(
    record.repositioning_hours ||
      record.repo_hours ||
      record.reposition_hours,
  )
  if (explicitHours > 0) return explicitHours

  const explicitAmount = resolveExplicitRepositioningAmount(record)
  const normalizedHourlyRate = Math.max(asNumber(hourlyRate), 0)
  const normalizedFactor = Math.max(asNumber(factor, 1), 0.01)
  if (explicitAmount > 0 && normalizedHourlyRate > 0) {
    return explicitAmount / (normalizedHourlyRate * normalizedFactor)
  }

  return 0
}

function resolveFallbackRepositioningHours(policy = {}, context = {}, distanceKm = 0, perLegClientHours = 0) {
  const repoLegs = Math.max(asNumber(policy.totalChargeableLegs), 0)
  if (!repoLegs) return 0

  const reserveHours = operationalReserveHours(distanceKm)
  const fallbackPerLeg = Math.max(perLegClientHours * 0.6, reserveHours)

  return fallbackPerLeg * repoLegs
}

function resolveRepositioningAmount(record = {}, context = {}, hourlyRate = 0, distanceKm = 0, clientHours = 0, legCount = 1) {
  const factor = resolveRepositioningFactor(record, context)
  const policy = resolveRepositioningPolicy(record, context)
  if (!policy.chargeInitial && !policy.chargeFinal) {
    return {
      applies: false,
      factor,
      policy,
      hours: 0,
      amount: 0,
      initialHours: 0,
      finalHours: 0,
    }
  }

  const explicitAmount = resolveExplicitRepositioningAmount(record)
  const explicitHours = resolveExplicitRepositioningHours(record, hourlyRate, factor)
  const averageClientLegHours = legCount > 0 ? clientHours / legCount : 0
  const fallbackHours = resolveFallbackRepositioningHours(policy, context, distanceKm, averageClientLegHours)
  const hours = explicitHours > 0 ? explicitHours : fallbackHours
  const amount =
    explicitAmount > 0
      ? explicitAmount
      : Math.max(asNumber(hourlyRate), 0) > 0
        ? Number((hours * hourlyRate * factor).toFixed(2))
        : 0
  const divisor = Math.max(policy.totalChargeableLegs, 1)

  return {
    applies: amount > 0 || hours > 0,
    factor,
    policy,
    hours,
    amount,
    initialHours: policy.chargeInitial ? hours / divisor : 0,
    finalHours: policy.chargeFinal ? hours / divisor : 0,
  }
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

function normalizeAircraftCategory(record = {}) {
  return String(
    record.cabin ||
      record.category ||
      record.aircraft_category ||
      '',
  )
    .toLowerCase()
    .trim()
}

function hasInternationalRoute(context = {}) {
  const legs = Array.isArray(context.legs) ? context.legs : []
  if (!legs.length) return false

  return legs.some((leg) => {
    const originCountry = inferAirportCountry(leg.origin, leg.originAirport)
    const destinationCountry = inferAirportCountry(leg.destination, leg.destinationAirport)
    if (!originCountry || !destinationCountry) return false
    return originCountry !== 'mexico' || destinationCountry !== 'mexico'
  })
}

function inferMinimumHours(category = '', providedMinimum = 0, distanceKm = 0, context = {}) {
  const distanceNm = Math.max(asNumber(distanceKm), 0) / 1.852
  const explicitMinimum = asNumber(providedMinimum)
  const categoryKey = resolveAircraftCategoryKey(category)
  const internationalRoute = hasInternationalRoute(context)

  let dynamicMinimum = 2

  if (categoryKey === 'helicopter') {
    dynamicMinimum = 1
  } else if (categoryKey === 'light_jet' || categoryKey === 'turboprop') {
    dynamicMinimum = 2
  } else if (categoryKey === 'mid_jet') {
    dynamicMinimum = 2.5
  } else if (categoryKey === 'heavy_jet') {
    if (distanceNm < 500) dynamicMinimum = 3
    else if (distanceNm < 1200) dynamicMinimum = internationalRoute ? 4 : 3
    else dynamicMinimum = internationalRoute ? 5 : 4
  }

  if (explicitMinimum > 0) {
    if (categoryKey === 'heavy_jet') {
      return Math.min(explicitMinimum, dynamicMinimum)
    }
    return Math.max(explicitMinimum, dynamicMinimum)
  }

  return dynamicMinimum
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
  const normalizedModel = normalizeCode(record.model || record.aircraft || record.aircraft_name || '')

  const explicitKmh = asNumber(record.speed_kmh || record.speedKmh || record.cruise_speed_kmh)
  if (explicitKmh > 100) return explicitKmh

  const explicitKnots = asNumber(record.speed_knots || record.speedKnots || record.cruise_speed_knots)
  if (explicitKnots > 50) return explicitKnots * 1.852

  if (normalizedCategory.includes('helic')) return 245
  if (
    normalizedCategory.includes('turboprop') ||
    normalizedCategory.includes('turbo_prop') ||
    normalizedCategory.includes('turbo') ||
    normalizedCategory.includes('prop') ||
    normalizedModel.includes('king_air') ||
    normalizedModel.includes('pilatus') ||
    normalizedModel.includes('pc_12')
  ) {
    return 500
  }
  if (normalizedCategory.includes('ultra_long')) return 0.86 * 1062
  if (normalizedCategory.includes('heavy') || normalizedCategory.includes('long_range')) return 0.84 * 1062
  if (normalizedCategory.includes('mid') || normalizedCategory.includes('midsize') || normalizedCategory.includes('super_mid')) return 0.78 * 1062
  if (normalizedCategory.includes('light')) return 0.72 * 1062
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

function resolveLegCount(context = {}) {
  const legs = resolveFlightLegs(context)
  if (legs.length > 0) return legs.length

  const explicitLegs = asNumber(
    context.legsCount ||
      context.legCount ||
      context.segmentCount ||
      context.segment_count ||
      context.piernas,
  )
  if (explicitLegs > 0) return explicitLegs

  const tripType = normalizeCode(context.tripType || context.trip_type || context.tripLabel || context.trip_label)
  if (['round_trip', 'redondo'].includes(tripType)) return 2
  if (['multi_leg', 'multi_city', 'multi_destino', 'multidestino'].includes(tripType)) {
    return Math.max(explicitLegs, 1)
  }

  return 1
}

function resolveFlightLegs(context = {}) {
  const legs = Array.isArray(context.legs) ? context.legs.filter(Boolean) : []
  if (legs.length) return legs

  const hasOrigin = context.origin || context.originAirport
  const hasDestination = context.destination || context.destinationAirport

  if (hasOrigin && hasDestination) {
    return [
      {
        origin: context.origin || '',
        destination: context.destination || '',
        originAirport: context.originAirport || null,
        destinationAirport: context.destinationAirport || null,
        distance_km: context.distance_km || context.distanceKm || context.totalDistanceKm || 0,
        distance_unit: context.distance_unit || context.distanceUnit || '',
      },
    ]
  }

  return []
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

function resolveOvernightUnitFee(record = {}) {
  const explicitOvernightFee = asNumber(
    record.crew_overnight_usd ||
      record.crew_overnight_fee ||
      record.overnight_fee ||
      record.overnight_fees,
  )
  if (explicitOvernightFee > 0) return explicitOvernightFee

  const hourlyRate = resolveHourlyRate(record)
  return hourlyRate > 0 ? hourlyRate / 2 : 0
}

function resolvePriorityServiceFee(_context = {}, _record = {}) {
  return 0
}

function resolvePetFee(_context = {}, _record = {}) {
  return 0
}

function resolveSpecialBaggageFee(_context = {}, _record = {}) {
  return 0
}

function resolveContextDistanceKm(context = {}) {
  const legs = resolveFlightLegs(context)
  const totalFromLegs = legs.reduce(
    (sum, leg) =>
      sum +
      (() => {
        const explicitDistanceKm = convertDistanceToKm(
          leg.distance_km || leg.distanceKm,
          leg.distance_unit || leg.distanceUnit || context.distance_unit || context.distanceUnit,
        )
        if (explicitDistanceKm > 0) return explicitDistanceKm

        return distanceKmBetweenAirports(
          leg.originAirport || leg.origin_airport || null,
          leg.destinationAirport || leg.destination_airport || null,
        )
      })(),
    0,
  )
  if (totalFromLegs > 0) return totalFromLegs

  const totalFromBreakdownLegs = Array.isArray(context.clientLegs)
    ? context.clientLegs.reduce(
        (sum, leg) =>
          sum +
          convertDistanceToKm(
            leg.distance_km || leg.distanceKm,
            leg.distance_unit || leg.distanceUnit || context.distance_unit || context.distanceUnit,
          ),
        0,
      )
    : 0
  if (totalFromBreakdownLegs > 0) return totalFromBreakdownLegs

  return convertDistanceToKm(
    context.distance_km || context.distanceKm || context.totalDistanceKm,
    context.distance_unit || context.distanceUnit,
  )
}

function calculateClimbDescentMinutes({
  aircraftCategory = '',
}) {
  const baseByCategory = {
    helicopter: 9,
    turboprop: 11,
    light_jet: 10,
    mid_jet: 12,
    heavy_jet: 13,
    default: 10,
  }

  const categoryKey = resolveAircraftCategoryKey(aircraftCategory)

  return Math.max(
    9,
    baseByCategory[categoryKey] ?? baseByCategory.default,
  )
}

function resolveVisibleFlightMarginHours(distanceKm = 0, context = {}) {
  const explicitHours = asNumber(context.visibleMarginHours || context.visible_margin_hours)
  if (explicitHours > 0) return explicitHours

  const legs = resolveFlightLegs(context)
  const normalizedDistanceKm = Math.max(asNumber(distanceKm), 0)

  if (normalizedDistanceKm > 0) {
    if (normalizedDistanceKm < 250) return 0.03
    if (normalizedDistanceKm < 600) return 0.05
    if (normalizedDistanceKm < 1200) return 0.08
    return 0.1
  }

  if (legs.length > 1) return Math.min(0.03 + (legs.length - 1) * 0.02, 0.08)
  return 0.03
}

function applyRouteFlightTimeAdjustment({
  flightHours = 0,
  distanceKm = 0,
  aircraft = {},
}) {
  const category = normalizeAircraftCategory(aircraft)
  const normalizedDistanceKm = Math.max(asNumber(distanceKm), 0)
  const baseMinutes = Math.max(asNumber(flightHours), 0) * 60
  const isHelicopter = category.includes('heli')
  const isTurboprop = category.includes('turbo')

  let adjustedMinutes = baseMinutes

  if (isHelicopter) {
    if (normalizedDistanceKm < 100) adjustedMinutes += 5
    else if (normalizedDistanceKm < 200) adjustedMinutes += 3

    return Math.max(adjustedMinutes, 18) / 60
  }

  if (isTurboprop) {
    if (normalizedDistanceKm < 100) adjustedMinutes += 12
    else if (normalizedDistanceKm < 200) adjustedMinutes += 9
    else if (normalizedDistanceKm < 300) adjustedMinutes += 6

    return Math.max(adjustedMinutes, 25) / 60
  }

  if (normalizedDistanceKm < 100) adjustedMinutes += 18
  else if (normalizedDistanceKm < 200) adjustedMinutes += 14
  else if (normalizedDistanceKm < 300) adjustedMinutes += 10
  else if (normalizedDistanceKm < 500) adjustedMinutes += 6

  let minimumMinutes = 25

  if (category.includes('light')) {
    minimumMinutes = 24
  } else if (
    category.includes('mid') ||
    category.includes('midsize') ||
    category.includes('super')
  ) {
    minimumMinutes = 28
  } else if (
    category.includes('heavy') ||
    category.includes('long')
  ) {
    minimumMinutes = 30
  } else if (category.includes('ultra')) {
    minimumMinutes = 32
  }

  return Math.max(adjustedMinutes, minimumMinutes) / 60
}

function resolveClimbDescentMinutes(record = {}, context = {}, _distanceKm = 0) {
  const explicitMinutes = asNumber(
    record.climb_descent_minutes ||
      record.climbDescentMinutes ||
      context.climbDescentMinutes ||
      context.climb_descent_minutes,
  )
  if (explicitMinutes > 0) return explicitMinutes

  const legs = resolveFlightLegs(context)
  if (legs.length) {
    return legs.reduce((sum) => {
      return (
        sum +
        calculateClimbDescentMinutes({
          aircraftCategory: record.cabin || record.category || record.aircraft_category || '',
        })
      )
    }, 0)
  }

  return calculateClimbDescentMinutes({
    aircraftCategory: record.cabin || record.category || record.aircraft_category || '',
  })
}

function resolveAirportAdjustmentMinutes(context = {}) {
  const explicitMinutes = asNumber(context.airportAdjustmentMinutes || context.airport_adjustment_minutes)
  if (explicitMinutes > 0) return explicitMinutes

  const legs = resolveFlightLegs(context)
  if (legs.length) {
    return legs.reduce((sum, leg) => {
      const originAdjustment = asNumber(
        leg.originAirport?.climb_descent_adjustment_minutes ||
          leg.originAirport?.climbDescentAdjustmentMinutes ||
          leg.origin_airport?.climb_descent_adjustment_minutes ||
          leg.origin_airport?.climbDescentAdjustmentMinutes,
      )
      const destinationAdjustment = asNumber(
        leg.destinationAirport?.climb_descent_adjustment_minutes ||
          leg.destinationAirport?.climbDescentAdjustmentMinutes ||
          leg.destination_airport?.climb_descent_adjustment_minutes ||
          leg.destination_airport?.climbDescentAdjustmentMinutes,
      )

      return sum + Math.max(originAdjustment, destinationAdjustment)
    }, 0)
  }

  const originAdjustment = asNumber(
    context.originAirport?.climb_descent_adjustment_minutes ||
      context.originAirport?.climbDescentAdjustmentMinutes,
  )
  const destinationAdjustment = asNumber(
    context.destinationAirport?.climb_descent_adjustment_minutes ||
      context.destinationAirport?.climbDescentAdjustmentMinutes,
  )

  return Math.max(originAdjustment, destinationAdjustment)
}

function resolveCalculatedDisplayFlightHours(record = {}, context = {}, cruiseSpeedKmh = 0) {
  const legs = resolveFlightLegs(context)
  const totalDistanceKm =
    resolveContextDistanceKm(context) ||
    convertDistanceToKm(record.distance_km || record.distanceKm, record.distance_unit || record.distanceUnit)
  const visibleMarginHours = resolveVisibleFlightMarginHours(totalDistanceKm, context)
  const climbDescentMinutesPerLeg = calculateClimbDescentMinutes({
    aircraftCategory: record.cabin || record.category || record.aircraft_category || '',
  })
  const legsWithDistance = legs.filter((leg) =>
    convertDistanceToKm(
      leg.distance_km || leg.distanceKm,
      leg.distance_unit || leg.distanceUnit || context.distance_unit || context.distanceUnit,
    ) > 0,
  )

  if (legs.length && cruiseSpeedKmh > 0 && legsWithDistance.length === legs.length) {
    const legsHours = legsWithDistance.reduce((sum, leg) => {
      const legDistanceKm = convertDistanceToKm(
        leg.distance_km || leg.distanceKm,
        leg.distance_unit || leg.distanceUnit || context.distance_unit || context.distanceUnit,
      )
      const rawLegHours = legDistanceKm > 0 ? legDistanceKm / cruiseSpeedKmh : 0
      const adjustedLegHours = applyRouteFlightTimeAdjustment({
        flightHours: rawLegHours,
        distanceKm: legDistanceKm,
        aircraft: record,
      })
      const pureAdjustmentHours = Math.max(adjustedLegHours - rawLegHours, 0)

      return sum + rawLegHours + pureAdjustmentHours + climbDescentMinutesPerLeg / 60
    }, 0)

    return legsHours + visibleMarginHours
  }

  const distanceKm = totalDistanceKm
  const rawFlightHours = distanceKm > 0 && cruiseSpeedKmh > 0 ? distanceKm / cruiseSpeedKmh : 0
  const adjustedFlightHours = applyRouteFlightTimeAdjustment({
    flightHours: rawFlightHours,
    distanceKm,
    aircraft: record,
  })
  const climbDescentHours = resolveClimbDescentMinutes(record, context, distanceKm) / 60

  return adjustedFlightHours + climbDescentHours + visibleMarginHours
}

function resolveCalculatedLegMetrics(record = {}, context = {}, cruiseSpeedKmh = 0) {
  const legs = resolveFlightLegs(context)
  if (!legs.length || cruiseSpeedKmh <= 0) return []

  const climbDescentMinutesPerLeg = calculateClimbDescentMinutes({
    aircraftCategory: record.cabin || record.category || record.aircraft_category || '',
  })

  return legs
    .map((leg) => {
      const legDistanceKm =
        convertDistanceToKm(
          leg.distance_km || leg.distanceKm,
          leg.distance_unit || leg.distanceUnit || context.distance_unit || context.distanceUnit,
        ) ||
        distanceKmBetweenAirports(
          leg.originAirport || leg.origin_airport || null,
          leg.destinationAirport || leg.destination_airport || null,
        )

      if (!(legDistanceKm > 0)) return null

      const rawLegHours = legDistanceKm / cruiseSpeedKmh
      const adjustedLegHours = applyRouteFlightTimeAdjustment({
        flightHours: rawLegHours,
        distanceKm: legDistanceKm,
        aircraft: record,
      })
      const pureAdjustmentHours = Math.max(adjustedLegHours - rawLegHours, 0)
      const displayHours = rawLegHours + pureAdjustmentHours + climbDescentMinutesPerLeg / 60

      return {
        distanceKm: legDistanceKm,
        rawLegHours,
        displayHours,
        billableHours: roundUpQuarterHours(displayHours),
      }
    })
    .filter(Boolean)
}

function resolveExtraServices(record = {}, context = {}) {
  const overnightKey = normalizeCode(context.overnight || 'no')
  const overnightNights = Math.max(asNumber(context.overnightNights || context.itineraryDays), 0)
  const catering = 0
  const groundTransport = 0
  const wifi = 0
  const overnightUnitFee = Math.max(resolveOvernightUnitFee(record), DEFAULT_EXTRA_SERVICE_FEES.overnight.yes)
  const overnight =
    overnightNights > 0
      ? overnightUnitFee * overnightNights
      : overnightKey === 'yes'
        ? overnightUnitFee
        : 0
  const urgentSchedule = 0

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
  const hourlyRate = resolveHourlyRate(record)
  const distanceKm =
    resolveContextDistanceKm(context) ||
    convertDistanceToKm(record.distance_km || record.distanceKm, record.distance_unit || record.distanceUnit)
  const cruiseSpeedKmh = inferCruiseSpeedKmh(record)
  const routeBand = resolveRouteBand(distanceKm)
  const explicitRealHours = asNumber(record.real_flight_hours || record.flight_hours)
  const clientFlightHours = distanceKm > 0 && cruiseSpeedKmh > 0 ? distanceKm / cruiseSpeedKmh : 0
  const rawFlightHours = clientFlightHours
  const climbDescentMinutes = resolveClimbDescentMinutes(record, context, distanceKm)
  const climbDescentHours = climbDescentMinutes / 60
  const airportAdjustmentMinutes = resolveAirportAdjustmentMinutes(context)
  const airportAdjustmentHours = airportAdjustmentMinutes / 60
  const reserveHours = operationalReserveHours(distanceKm)
  const visibleMarginHours = resolveVisibleFlightMarginHours(distanceKm, context)
  const calculatedDisplayHours = resolveCalculatedDisplayFlightHours(record, context, cruiseSpeedKmh)
  const legCount = resolveLegCount(context)
  const calculatedRealFlightHours =
    clientFlightHours > 0
      ? clientFlightHours + climbDescentHours
      : explicitRealHours
  const visibleDurationHours =
    calculatedDisplayHours > 0
      ? calculatedDisplayHours
      : calculatedRealFlightHours
  const displayFlightHours = visibleDurationHours
  const operationalFlightHours = Math.max(visibleDurationHours + reserveHours, 0)
  const realFlightHours = calculatedRealFlightHours > 0 ? calculatedRealFlightHours : visibleDurationHours
  const flightMinutes = Math.max(visibleDurationHours * 60, 0)
  const costPerMinute = hourlyRate > 0 ? hourlyRate / 60 : 0
  const minimumHours = inferMinimumHours(
    record.cabin || record.category || record.aircraft_category || '',
    record.minimum_hours || record.min_hours,
    distanceKm,
    context,
  )
  const minimumRoutePrice = inferMinimumRoutePrice(record, distanceKm)
  const calculatedLegMetrics = resolveCalculatedLegMetrics(record, context, cruiseSpeedKmh)
  const repositioningBreakdown = resolveRepositioningAmount(
    record,
    context,
    hourlyRate,
    distanceKm,
    visibleDurationHours,
    legCount,
  )
  const repositioningHours = repositioningBreakdown.applies ? repositioningBreakdown.hours : 0
  const repositioningPolicy = repositioningBreakdown.applies
    ? repositioningBreakdown.policy
    : {
      ...repositioningBreakdown.policy,
      chargeInitial: false,
      chargeFinal: false,
      totalChargeableLegs: 0,
    }

  const outboundHours = legCount > 0 ? Math.max(asNumber(context.legs?.[0]?.estimated_hours || 0), 0) : 0
  const overnightHours = Math.max(asNumber(context.overnightNights || context.itineraryDays), 0) * 0.5
  const returnHours = Math.max(displayFlightHours - outboundHours, 0)
  const roundedClientLegHours = calculatedLegMetrics.reduce((sum, leg) => sum + leg.billableHours, 0)
  const clientBillableHours =
    roundedClientLegHours > 0 ? roundedClientLegHours : Math.max(outboundHours + returnHours, 0)
  const billableHours = Math.max(clientBillableHours + repositioningHours, 0)
  const billableMinutes = Math.max(billableHours * 60, 0)
  const rawBaseCost = billableMinutes * costPerMinute
  const subtotalFlight = rawBaseCost
  const baseCost = subtotalFlight
  const repositioning = repositioningHours * Math.max(hourlyRate, 0)
  const operationalCosts = 0
  const priorityServiceFee = resolvePriorityServiceFee(context, record)
  const petFee = resolvePetFee(context, record)
  const specialBaggageFee = resolveSpecialBaggageFee(context, record)
  const extraServices = resolveExtraServices(record, context)
  const overnightCrew = extraServices.overnight
  const extraServicesWithoutOvernight =
    extraServices.catering +
    extraServices.groundTransport +
    extraServices.wifi +
    extraServices.urgentSchedule +
    priorityServiceFee +
    petFee +
    specialBaggageFee
  const airportFees = resolveAirportExpenseByCategory(record)
  const expenseFee = airportFees
  const operationalExpenses = operationalCosts
  const extraServicesTotal = overnightCrew + extraServicesWithoutOvernight
  const expensesTotal = airportFees + overnightCrew + operationalExpenses
  const ivaRate = baseCost > 0 ? resolveIvaRateForRoute(context) : 0
  const taxableSubtotal = subtotalFlight + airportFees + overnightCrew
  const ivaAmount = taxableSubtotal * ivaRate
  const subtotalBeforeMultipliers = taxableSubtotal + extraServicesWithoutOvernight
  const commercialMargin = 1
  const priorityFactor = 1
  const dynamicMarketFloor = resolveDynamicMarketFloor(record, billableHours, distanceKm)
  const finalPrice = subtotalBeforeMultipliers + ivaAmount
  const hasFormulaInputs = subtotalBeforeMultipliers > 0 && (hourlyRate > 0 || distanceKm > 0 || explicitRealHours > 0)

  return {
    hasFormulaInputs,
    hourlyRate,
    minimumHours,
    minimumRoutePrice,
    distanceKm,
    routeBand,
    cruiseSpeedKmh,
    clientFlightHours,
    rawFlightHours,
    climbDescentMinutes,
    climbDescentHours,
    airportAdjustmentMinutes,
    airportAdjustmentHours,
    visibleMarginHours,
    visibleDurationHours,
    reserveHours,
    displayFlightHours,
    operationalFlightHours,
    realFlightHours,
    outboundHours,
    returnHours,
    overnightHours,
    flightMinutes,
    billableMinutes,
    legCount,
    costPerMinute,
    billableHours,
    flightBase: baseCost,
    rawBaseCost,
    subtotalFlight,
    baseCost,
    basePrice: baseCost,
    repositioning,
    repositioningHours,
    repositioningFactor: repositioningBreakdown.factor,
    repositioningPolicy,
    initialRepositioningHours: repositioningBreakdown.initialHours,
    finalRepositioningHours: repositioningBreakdown.finalHours,
    airportFees,
    operationalCosts,
    extraServices: {
      ...extraServices,
      priorityService: priorityServiceFee,
      pet: petFee,
      specialBaggage: specialBaggageFee,
    },
    extraServicesTotal,
    expenseFee,
    expensesTotal,
    ivaRate,
    ivaAmount,
    dynamicMarketFloor,
    commercialMargin,
    priorityFactor,
    subtotal: subtotalBeforeMultipliers,
    subtotalBeforeMultipliers,
    total: finalPrice,
    finalPrice,
    utility: 0,
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
    pricing_formula_version: 'private-flight-v6-minute-legs-fbo-tax-expenses',
    package_code: normalizePackageCode(context.priorityType || context.packageCode || aircraft.priority_type),
    attention_level: normalizeAttentionLevel(context.attentionLevel || context.priorityLevel),
    display_flight_hours: asNumber(pricing.displayFlightHours || pricing.realFlightHours),
    operational_flight_hours: asNumber(pricing.operationalFlightHours || pricing.billableHours),
    billable_hours: asNumber(pricing.billableHours),
    client_flight_hours: asNumber(pricing.clientFlightHours || pricing.rawFlightHours),
    leg_count: asNumber(pricing.legCount || context.legsCount || context.segmentCount, 1),
    flight_minutes: asNumber(pricing.flightMinutes),
    billable_minutes: asNumber(pricing.billableMinutes),
    cost_per_minute: asNumber(pricing.costPerMinute),
    route_band: pricing.routeBand?.code || '',
    route_multiplier: asNumber(pricing.routeBand?.multiplier, 1),
    real_flight_hours: asNumber(pricing.realFlightHours),
    raw_flight_hours: asNumber(pricing.rawFlightHours),
    climb_descent_minutes: asNumber(pricing.climbDescentMinutes),
    climb_descent_hours: asNumber(pricing.climbDescentHours),
    airport_adjustment_minutes: asNumber(pricing.airportAdjustmentMinutes),
    airport_adjustment_hours: asNumber(pricing.airportAdjustmentHours),
    visible_margin_hours: asNumber(pricing.visibleMarginHours),
    visible_duration_hours: asNumber(pricing.visibleDurationHours || pricing.displayFlightHours),
    reserve_hours: asNumber(pricing.reserveHours),
    minimum_hours: asNumber(pricing.minimumHours),
    minimum_route_price: asNumber(pricing.minimumRoutePrice),
    hourly_rate: resolveHourlyRate(aircraft),
    raw_base_cost: asNumber(pricing.rawBaseCost),
    flight_base: asNumber(pricing.flightBase || pricing.basePrice),
    subtotal_flight: asNumber(pricing.subtotalFlight),
    base_cost: asNumber(pricing.basePrice),
    repositioning_cost: asNumber(pricing.repositioning),
    repositioning_hours: asNumber(pricing.repositioningHours),
    repositioning_factor: asNumber(pricing.repositioningFactor, 0.8),
    fbo_total: asNumber(pricing.airportFees),
    operational_costs_total: asNumber(pricing.operationalCostBreakdown || pricing.operationalCosts),
    extra_services_total: asNumber(pricing.extraServicesTotal),
    expense_fee: asNumber(pricing.expenseFee, DEFAULT_EXPENSE_FEE),
    expenses_total: asNumber(pricing.expensesTotal),
    iva_rate: asNumber(pricing.ivaRate, DEFAULT_IVA_RATE),
    iva_amount: asNumber(pricing.ivaAmount),
    subtotal: asNumber(pricing.subtotal || pricing.subtotalBeforeMultipliers),
    subtotal_before_multipliers: asNumber(pricing.subtotalBeforeMultipliers),
    commercial_margin: asNumber(pricing.commercialMargin || pricing.priorityMultiplier, 1),
    priority_factor: asNumber(pricing.attentionFactor, 1),
    total: asNumber(pricing.total || pricing.finalPrice),
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
