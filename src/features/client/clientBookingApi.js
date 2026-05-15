import { api } from '../../lib/api'
import { featuredAirports } from '../../utils/airports'
import {
  buildCommercialSnapshot,
  buildFlightPricingFormula,
  normalizeAttentionLevel,
  normalizePackageCode,
} from '../../utils/flightPricing'

const configuredQuotesPreviewPath = String(import.meta.env.VITE_CLIENT_QUOTES_PREVIEW_PATH || '').trim()
const configuredTripsPath = String(import.meta.env.VITE_CLIENT_TRIPS_PATH || '').trim()
const configuredFlightPackagesPath = String(
  import.meta.env.VITE_CLIENT_FLIGHT_PACKAGES_PATH || import.meta.env.VITE_CLIENT_MEMBERSHIPS_PATH || '',
).trim()
const configuredAircraftPath = String(import.meta.env.VITE_CLIENT_AIRCRAFT_PATH || '').trim()

//
//const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || 'https://uber-aviones.onrender.com/api/v1').trim()
const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1').trim()

const QUOTES_PREVIEW_PATH = configuredQuotesPreviewPath || '/client/quotes/preview'
const CLIENT_TRIPS_PATH = configuredTripsPath || '/client/flight-requests'
const CLIENT_FLIGHT_PACKAGES_PATH = configuredFlightPackagesPath || '/plans'
const CLIENT_AIRCRAFT_PATHS = configuredAircraftPath ? [configuredAircraftPath] : []
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
  FALLBACK_FLIGHT_PACKAGES.map((item) => String(item.name || '').trim().toLowerCase()),
)

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
  const amount = Number(value)

  if (Number.isNaN(amount)) {
    return String(value)
  }

  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

function asNumber(value, fallback = 0) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : fallback
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
    payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data) ? payload.data : payload
  const tripType = normalizeTripType(
    previewPayload?.trip_type || itinerary?.trip_type,
    previewPayload?.trip_label || itinerary?.trip_label,
  )
  const payloadSegmentCount = asNumber(previewPayload?.segment_count || previewPayload?.segments || 0)
  if (payloadSegmentCount > 0) return payloadSegmentCount

  const payloadLegs = Array.isArray(previewPayload?.legs) ? previewPayload.legs.length : 0
  if (payloadLegs > 0) return payloadLegs

  const itineraryLegs = Array.isArray(itinerary?.legs) ? itinerary.legs.length : 0
  if (itineraryLegs > 0) return itineraryLegs

  if (tripType === 'round_trip') return 2
  return 1
}

function buildPricingBreakdown(match = {}, aircraftRecord = {}, payload = {}, itinerary = {}) {
  const billableHours = asNumber(match.billable_hours || match.estimated_hours || match.hours || match.flight_hours)
  const operationalHourlyRate = asNumber(
    match.hourly_rate || match.hourly_price || match.price_per_hour || aircraftRecord.hourly_rate,
  )
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
    overnightFee +
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
      overnightFee > 0 ||
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

function normalizeMatches(payload, itinerary = {}) {
  const previewPayload =
    payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data) ? payload.data : payload
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
    const resolvedTotal = pricing.hasFormulaInputs ? pricing.total : asNumber(match.total || match.price, 0)
    const imageUrl = normalizeMediaUrl(
      getPrimaryImageValue(match) ||
        getPrimaryImageValue(aircraftRecord) ||
        aircraftImages[0]?.imageUrl ||
        '',
    )

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
      time: match.time || match.flight_time || match.duration || '',
      final_price:
        match.final_price ||
        match.price ||
        match.quoted_price ||
        (resolvedTotal ? asMoney(resolvedTotal) : asMoney(match.total || '')),
      base_price: asNumber(match.base_price || aircraftRecord?.base_price || resolvedTotal || match.total || 0),
      priority_type: normalizePriorityType(match.priority_type || match.service_tier || match.flight_package),
      priority_multiplier: asNumber(match.priority_multiplier || match.service_multiplier || 1, 1),
      priority_price: asNumber(match.priority_price || 0, 0),
      landing_fees: asNumber(match.landing_fees || match.landing_fee || 0, 0),
      fbo_fees: asNumber(match.fbo_fees || match.fbo || 0, 0),
      fuel_surcharge: asNumber(match.fuel_surcharge || 0, 0),
      overnight_fees: asNumber(match.overnight_fees || match.overnight_fee || 0, 0),
      taxes: asNumber(match.taxes || match.tax || 0, 0),
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
      total: pricing.hasFormulaInputs ? Number(pricing.total.toFixed(2)) : match.total || '',
      subtotal: pricing.hasFormulaInputs ? Number(pricing.subtotal.toFixed(2)) : match.subtotal || '',
      utility: pricing.hasFormulaInputs ? Number(pricing.utility.toFixed(2)) : match.utility || match.margin || '',
      margin_percent:
        pricing.marginPercent || match.margin_percent || match.utility_percent || match.porcentaje_utilidad || '',
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
      speed_kmh: match.speed_kmh || match.speedKmh || aircraftRecord?.speed_kmh || aircraftRecord?.speedKmh || '',
      speed_knots:
        match.speed_knots || match.speedKnots || aircraftRecord?.speed_knots || aircraftRecord?.speedKnots || '',
      minimum_hours: match.minimum_hours || match.min_hours || aircraftRecord?.minimum_hours || aircraftRecord?.min_hours || '',
      minimum_route_price:
        match.minimum_route_price ||
        match.min_route_price ||
        aircraftRecord?.minimum_route_price ||
        aircraftRecord?.min_route_price ||
        '',
      trip_support_fee:
        match.trip_support_fee || match.trip_support || aircraftRecord?.trip_support_fee || aircraftRecord?.trip_support || '',
      permits_fee: match.permits_fee || match.permits || aircraftRecord?.permits_fee || aircraftRecord?.permits || '',
      handling_fee:
        match.handling_fee || match.handling_fees || aircraftRecord?.handling_fee || aircraftRecord?.handling_fees || '',
      catering_fee: match.catering_fee || aircraftRecord?.catering_fee || '',
      ground_transport_fee:
        match.ground_transport_fee || match.ground_transfer_fee || aircraftRecord?.ground_transport_fee || '',
      wifi_fee: match.wifi_fee || aircraftRecord?.wifi_fee || '',
      urgent_schedule_fee: match.urgent_schedule_fee || match.rush_fee || aircraftRecord?.urgent_schedule_fee || '',
      commercial_margin:
        match.commercial_margin || match.margin_factor || aircraftRecord?.commercial_margin || aircraftRecord?.margin_factor || '',
      priority_factor: match.priority_factor || aircraftRecord?.priority_factor || '',
      attention_level: normalizeAttentionLevel(match.attention_level || match.priority_level || ''),
      engine_reserve_rate:
        pricing.engineReserveRate || match.engine_reserve_rate || match.reserve_motor_rate || '',
      insurance_rate: pricing.insuranceRate || match.insurance_rate || '',
      maintenance_rate: pricing.maintenanceRate || match.maintenance_rate || '',
      crew_rate: pricing.crewRate || match.crew_rate || '',
      repositioning_fee: pricing.repositioningFee || match.repositioning_fee || '',
      overnight_fee: pricing.overnightFee || match.overnight_fee || '',
      pricing_breakdown: pricing.hasFormulaInputs
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
            overnight: Number(pricing.overnightFee.toFixed(2)),
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
      estimated_hours: match.estimated_hours || '',
      billable_hours: match.billable_hours || '',
      registration: match.registration || match.matricula || aircraftRecord?.registration || aircraftRecord?.matricula || '',
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
      source_table: match.source_table || match.table || aircraftRecord?.source_table || 'matched_options',
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
  const rawUrl = String(url || '').trim()
  if (!rawUrl) return ''

  if (/^(blob:|data:|https?:\/\/|\/\/)/i.test(rawUrl)) {
    return rawUrl
  }

  if (rawUrl.startsWith('/') && !rawUrl.startsWith('/storage')) {
    return rawUrl
  }

  try {
    const apiOrigin = new URL(apiBaseUrl, window.location.origin).origin
    return `${apiOrigin}/${rawUrl.replace(/^\.?\//, '')}`
  } catch {
    return `/${rawUrl.replace(/^\.?\//, '')}`
  }
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
        kind: String(imageRecord.kind || imageRecord.slot || (index === 0 ? 'main' : 'gallery')).toLowerCase(),
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
    .split(/[\s,/()\-]+/)
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

    const matchesAirport = airportTokens.some((token) => token === normalizedValue || tokens.has(token))
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
    catalog.find((aircraft) => aircraftLookupValues(aircraft).some((value) => matchValues.has(value))) || null
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
      image_url: catalogAircraft.image_url || match.image_url,
      images,
      image_source_database: catalogAircraft.image_source_database || match.image_source_database,
      image_source_table: catalogAircraft.image_source_table || match.image_source_table,
      source_database: catalogAircraft.source_database || match.source_database,
      source_table: catalogAircraft.source_table || match.source_table,
      source_endpoint: catalogAircraft.source_endpoint || match.source_endpoint,
      source_origin: catalogAircraft.source_origin || match.source_origin,
      match_reason: catalogAircraft.source_origin ? catalogAircraft.match_reason : match.match_reason,
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
  const hourlyRate = raw.hourly_rate || raw.hourly_price || raw.price_per_hour || raw.cost || ''

  return {
    id: raw.id || `aircraft-db-${index}`,
    match_id: '',
    matched_option_id: '',
    aircraft_id: raw.aircraft_id || raw.aircraftId || raw.id || '',
    provider_id: raw.provider_id || raw.provider?.id || '',
    aircraft: aircraftName,
    cabin: raw.category || raw.aircraft_category || raw.type || raw.cabin || 'Cabina verificada',
    time: raw.estimated_time || raw.flight_time || '',
    final_price: asMoney(raw.final_price || raw.price || raw.quoted_price || hourlyRate),
    base_price: asNumber(raw.base_price || raw.final_price || raw.price || raw.quoted_price || hourlyRate || 0),
    priority_type: normalizePriorityType(raw.priority_type || raw.service_tier || raw.flight_package),
    priority_multiplier: asNumber(raw.priority_multiplier || raw.service_multiplier || 1, 1),
    priority_price: asNumber(raw.priority_price || 0, 0),
    landing_fees: asNumber(raw.landing_fees || raw.landing_fee || 0, 0),
    fbo_fees: asNumber(raw.fbo_fees || raw.fbo || 0, 0),
    fuel_surcharge: asNumber(raw.fuel_surcharge || 0, 0),
    overnight_fees: asNumber(raw.overnight_fees || raw.overnight_fee || 0, 0),
    taxes: asNumber(raw.taxes || raw.tax || 0, 0),
    hidden_operator: true,
    amenities: normalizeAmenities(raw),
    response_time: raw.response_time || '',
    capacity: raw.capacity || raw.passenger_capacity || '',
    priority: raw.priority || '',
    model: raw.manufacturer
      ? [raw.manufacturer, raw.registration || raw.matricula].filter(Boolean).join(' · ')
      : raw.registration || raw.matricula || '',
    registration: raw.registration || raw.matricula || '',
    hourly_rate: raw.hourly_rate || raw.hourly_price || raw.price_per_hour || '',
    minimum_hours: raw.minimum_hours || raw.min_hours || '',
    minimum_route_price: raw.minimum_route_price || raw.min_route_price || '',
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
    provider: raw.provider || null,
    image_url: images[0]?.imageUrl || '',
    images,
    image_source_database: images[0]?.sourceDatabase || raw.source_database || raw.database || raw.connection || 'aircraft',
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
      const payload = await api.get(path, { query })
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
  const activeStatuses = new Set(['', 'active', 'trial_active', 'approved', 'aprobada', 'available', 'disponible'])

  const filteredAircraft = aircraft
    .filter((item) => {
      const status = normalizeText(item.status).toLowerCase()
      return activeStatuses.has(status)
    })
    .filter((item) => !passengers || !Number(item.capacity || 0) || Number(item.capacity || 0) >= passengers)
    .map((item) => {
      const baseAirportMatches = airportBaseMatches(originRaw, item.source_origin, originAirport)

      return {
        ...item,
        queried_base_airport: originRaw,
        base_airport_match: baseAirportMatches,
        match_reason: baseAirportMatches
          ? `Coincide con base_airport ${item.source_origin}`
          : item.match_reason || (item.source_origin ? `Salida optimizada desde ${item.source_origin}` : 'Opción verificada'),
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
  const attentionLevel = normalizeAttentionLevel(itinerary.attention_level || itinerary.priority_level || '')
  const overnightNights = itinerary.overnight_nights || itinerary.days || 0

  return filteredCatalog
    .map((aircraft) => {
      const pricing = buildFlightPricingFormula(aircraft, {
        packageCode,
        priorityType: packageCode,
        attentionLevel,
        overnightNights,
        legs: itinerary.legs || [],
        origin: itinerary.origin || '',
        originAirport: itinerary.originAirport || null,
        catering: itinerary.catering || '',
        wifi: itinerary.wifi || 'none',
        groundTransport: itinerary.groundTransport || itinerary.ground_transport || 'none',
        pets: itinerary.pets || '',
        specialBaggage: itinerary.special_baggage || itinerary.specialBaggage || '',
      })

      const fallbackBasePrice = asNumber(aircraft.base_price || aircraft.hourly_rate || aircraft.hourly_price || aircraft.price_per_hour)
      const fallbackFinalPrice = asNumber(
        aircraft.final_price || aircraft.price || aircraft.quoted_price || fallbackBasePrice,
      )
      const basePrice = pricing.baseCost > 0 ? pricing.baseCost : fallbackBasePrice
      const finalPrice = pricing.finalPrice > 0 ? pricing.finalPrice : fallbackFinalPrice
      const billableHours = pricing.billableHours > 0 ? pricing.billableHours : asNumber(aircraft.billable_hours)
      const estimatedHours =
        pricing.rawFlightHours > 0
          ? pricing.rawFlightHours
          : asNumber(aircraft.estimated_hours || aircraft.real_flight_hours)

      if (!finalPrice) return null

      return {
        ...aircraft,
        match_id: aircraft.match_id || `catalog-${aircraft.id}`,
        matched_option_id: aircraft.matched_option_id || `catalog-${aircraft.id}`,
        base_price: basePrice,
        final_price: asMoney(finalPrice),
        priority_type: packageCode || aircraft.priority_type || 'essential',
        priority_multiplier: pricing.commercialMargin > 0 ? pricing.commercialMargin : asNumber(aircraft.priority_multiplier || 1, 1),
        priority_price:
          pricing.finalPrice > 0 && pricing.subtotalBeforeMultipliers > 0
            ? Math.max(pricing.finalPrice - pricing.subtotalBeforeMultipliers, 0)
            : asNumber(aircraft.priority_price || 0, 0),
        operational_cost: pricing.operationalCosts > 0 ? pricing.operationalCosts : asNumber(aircraft.operational_cost),
        repositioning_fee: pricing.repositioning > 0 ? pricing.repositioning : asNumber(aircraft.repositioning_fee),
        taxes: pricing.ivaAmount > 0 ? pricing.ivaAmount : asNumber(aircraft.taxes || aircraft.tax),
        time: aircraft.time || formatDurationFromHours(estimatedHours || billableHours),
        estimated_hours: estimatedHours || billableHours || '',
        billable_hours: billableHours || '',
        real_flight_hours:
          pricing.realFlightHours > 0 ? pricing.realFlightHours : asNumber(aircraft.real_flight_hours) || '',
        minimum_hours: pricing.minimumHours > 0 ? pricing.minimumHours : aircraft.minimum_hours || '',
        minimum_route_price: pricing.minimumRoutePrice > 0 ? pricing.minimumRoutePrice : aircraft.minimum_route_price || '',
        route_band: pricing.routeBand?.code || '',
        route_multiplier: pricing.routeBand?.multiplier || 1,
        commercial_margin:
          pricing.commercialMargin > 0 ? pricing.commercialMargin : asNumber(aircraft.commercial_margin, 1),
        priority_factor:
          pricing.priorityFactor > 0 ? pricing.priorityFactor : asNumber(aircraft.priority_factor, 1),
        subtotal_before_multipliers:
          pricing.subtotalBeforeMultipliers > 0
            ? pricing.subtotalBeforeMultipliers
            : asNumber(aircraft.subtotal_before_multipliers),
        extra_services_total:
          pricing.extraServicesTotal > 0 ? pricing.extraServicesTotal : asNumber(aircraft.extra_services_total),
        source_table: aircraft.source_table || 'catalog_fallback_quote',
        match_reason: aircraft.match_reason || 'Cotizacion generada desde la base de salida',
      }
    })
    .filter(Boolean)
    .sort((first, second) => asNumber(first.base_airport_match ? 0 : 1) - asNumber(second.base_airport_match ? 0 : 1) || basePriceSort(first, second))
}

function basePriceSort(first = {}, second = {}) {
  return asNumber(first.base_price || first.final_price, Number.MAX_SAFE_INTEGER) -
    asNumber(second.base_price || second.final_price, Number.MAX_SAFE_INTEGER)
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
    code: normalizePriorityType(flightPackage.code || flightPackage.id || flightPackage.slug || flightPackage.name),
    name: flightPackage.name || flightPackage.title || `Paquete ${index + 1}`,
    badge: flightPackage.badge || flightPackage.code || '',
    category: flightPackage.category || flightPackage.segment || 'Servicio privado',
    price: flightPackage.price || asMoney(flightPackage.price_total || flightPackage.price_from || ''),
    multiplier: asNumber(flightPackage.multiplier || flightPackage.priority_multiplier || flightPackage.factor || 1, 1),
    benefits,
    action: flightPackage.action || 'Elegir paquete',
  }
}

function isFlightPackageRecord(flightPackage = {}) {
  const normalizedName = String(flightPackage.name || flightPackage.title || '').trim().toLowerCase()
  const normalizedCode = String(flightPackage.code || flightPackage.id || '').trim().toLowerCase()
  const normalizedCategory = String(flightPackage.category || flightPackage.segment || '').trim().toLowerCase()

  if (DEFAULT_FLIGHT_PACKAGE_NAMES.has(normalizedName)) return true
  if (['empty-leg', 'empty_leg', 'essential', 'business', 'elite'].includes(normalizedCode)) return true
  if (normalizedCategory.includes('servicio') || normalizedCategory.includes('flight package')) return true

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

function deriveClientWorkflowStatus(request = {}) {
  const rawWorkflow = request.workflow_status || request.workflow || request.status || ''
  const normalizedWorkflow = normalizeWorkflowToken(rawWorkflow)
  const hasAssignedProvider = Boolean(request.assigned_provider_id || request.provider_id)
  const hasAssignedAircraft = Boolean(request.assigned_aircraft_id || request.aircraft_id)
  const hasOperation = Boolean(request.operation?.id || request.operation_id)

  const contractOrLaterStates = new Set([
    'contract pending',
    'contract signed',
    'payment pending',
    'payment confirmed',
    'flight confirmed',
    'tracking live',
    'completed',
    'cancelled',
    'rejected',
  ])

  const providerAcceptedSignals = new Set([
    'aceptada',
    'aceptado',
    'accepted',
    'approved',
    'provider accepted',
    'provider_accepted',
    'operador asignado',
    'operador_asignado',
    'operador confirmado',
    'pending',
    'reserved',
    'reserva',
    'reservada',
    'reservado',
    'provider pending',
    'provider_pending',
  ])

  if (
    (hasAssignedProvider || hasAssignedAircraft || hasOperation) &&
    (!normalizedWorkflow || providerAcceptedSignals.has(normalizedWorkflow)) &&
    !contractOrLaterStates.has(normalizedWorkflow)
  ) {
    return 'contract_pending'
  }

  return rawWorkflow
}

function normalizeTrip(request = {}) {
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
    ? legs.map((leg, index) => (index === 0 ? `${leg.origin} -> ${leg.destination}` : leg.destination)).join(' -> ')
    : [request.origin, request.destination].filter(Boolean).join(' -> ')
  const matchedOptions = Array.isArray(request.matched_options) ? request.matched_options : []
  const assignedAircraftId = request.assigned_aircraft_id || request.aircraft_id || null
  const preferredMatch =
    matchedOptions.find((match) => String(match?.aircraft_id || '') === String(assignedAircraftId || '')) ||
    matchedOptions[0] ||
    null
  const aircraftRecord = preferredMatch?.aircraft || {}

  return {
    id: request.id || '',
    route,
    title: route || `Solicitud ${request.id || ''}`,
    date: request.departure_datetime || request.departure_date || '',
    created_at: request.created_at || request.createdAt || '',
    updated_at: request.updated_at || request.updatedAt || '',
    assigned_aircraft_id: request.assigned_aircraft_id || request.aircraft_id || '',
    assigned_provider_id: request.assigned_provider_id || request.provider_id || '',
    status: request.status || '',
    workflow_status: deriveClientWorkflowStatus(request),
    trip_type: request.trip_type || '',
    passengers: request.passengers || '',
    flight_package:
      request.flight_package ||
      request.service_tier ||
      request.package_name ||
      request.package ||
      '',
    legs,
    requirements,
    estimated_total: preferredMatch?.total ? asMoney(preferredMatch.total) : '',
    aircraft: request.aircraft_model || aircraftRecord?.model || aircraftRecord?.category || '',
    aircraft_category: request.aircraft_category || aircraftRecord?.category || '',
    aircraft_capacity: request.aircraft_capacity || aircraftRecord?.capacity || '',
    aircraft_image: request.aircraft_image || aircraftRecord?.main_image || aircraftRecord?.images?.[0]?.image_url || '',
    amenities: Array.isArray(aircraftRecord?.amenities) ? aircraftRecord.amenities : [],
    operator: request.operator || request.provider_name || preferredMatch?.provider_name || '',
    payment_status: request.payment_status || '',
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

function buildFlightRequestPayload(itinerary = {}) {
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
  const departureDate = firstLeg.date || ''
  const departureTime = firstLeg.time || '09:00'
  const tripType = normalizeTripType(itinerary.trip_type, itinerary.trip_label)
  const flightPackage = String(itinerary.flight_package || itinerary.service_tier || '').trim()
  const priorityType = normalizePriorityType(itinerary.priority_type || flightPackage)
  const attentionLevel = normalizeAttentionLevel(itinerary.attention_level || itinerary.priority_level || '')
  const priorityMultiplier = asNumber(itinerary.priority_multiplier || 1, 1)
  const basePrice = asNumber(itinerary.base_price || 0, 0)
  const operationalFee = asNumber(itinerary.operational_fee || 0, 0)
  const priorityPrice = asNumber(itinerary.priority_price || 0, 0)
  const finalPrice = asNumber(itinerary.final_price || 0, 0)
  const pricingContext =
    itinerary.pricing_context && typeof itinerary.pricing_context === 'object'
      ? itinerary.pricing_context
      : buildCommercialSnapshot(
          {
            packageCode: priorityType,
            priorityType,
            attentionLevel,
            overnightNights: itinerary.overnight_nights || itinerary.days || 0,
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
            basePrice,
            repositioning: itinerary.repositioning_cost || itinerary.repositioning_fee,
            operationalCostBreakdown: operationalFee,
            extraServicesTotal: itinerary.extra_services_total,
            subtotalBeforeMultipliers: itinerary.subtotal_before_multipliers,
            commercialMargin: itinerary.commercial_margin || priorityMultiplier,
            attentionFactor: itinerary.priority_factor,
            finalPrice,
          },
          itinerary.aircraft_snapshot || itinerary,
        )

  return {
    origin: firstLeg.origin || itinerary.origin || '',
    base_airport: firstLeg.origin || itinerary.origin || '',
    destination: firstLeg.destination || itinerary.destination || '',
    departure_datetime: departureDate ? `${departureDate} ${departureTime}` : '',
    passengers: Number(itinerary.passengers) || 1,
    trip_type: tripType,
    trip_label: itinerary.trip_label || 'Ida',
    aircraft_type: itinerary.preference || null,
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
    final_price: finalPrice || null,
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
    requirements: normalizedLegs.length > 1 ? normalizedLegs.slice(1) : [],
    pets: itinerary.pets || null,
    special_baggage: itinerary.special_baggage || itinerary.specialBaggage || null,
    overnight_nights: pricingContext.extras?.overnight_nights || itinerary.overnight_nights || itinerary.days || null,
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
    const packages = normalizeArray(payload, ['packages', 'flight_packages', 'plans', 'memberships'])
      .filter(isFlightPackageRecord)

    if (!packages.length) {
      return FALLBACK_FLIGHT_PACKAGES.map(normalizeFlightPackage)
    }

    return packages.map(normalizeFlightPackage)
  } catch {
    return FALLBACK_FLIGHT_PACKAGES.map(normalizeFlightPackage)
  }
}

export const getClientMembershipPlans = getClientFlightPackages

export async function getClientTrips() {
  try {
    const payload = await api.get(CLIENT_TRIPS_PATH)
    return normalizeArray(payload, ['trips', 'reservations', 'flight_requests'])
      .map(normalizeTrip)
      .sort((first, second) => tripSortValue(second) - tripSortValue(first))
  } catch {
    return []
  }
}

export async function searchClientFlights(itinerary) {
  const firstLeg = Array.isArray(itinerary?.legs) ? itinerary.legs[0] || {} : {}
  const aircraftQuery = {
    origin: firstLeg.origin || itinerary?.origin || '',
    base_airport: firstLeg.origin || itinerary?.origin || '',
    passengers: itinerary?.passengers || '',
  }
  let matches = []

  try {
    const payload = await api.post(QUOTES_PREVIEW_PATH, buildFlightRequestPayload(itinerary))
    matches = normalizeMatches(payload, itinerary)
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

export async function createClientFlightRequest(itinerary) {
  return api.post(CLIENT_TRIPS_PATH, buildFlightRequestPayload(itinerary))
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
