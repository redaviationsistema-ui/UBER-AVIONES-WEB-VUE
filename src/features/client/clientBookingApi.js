import { api } from '../../lib/api'

const configuredQuotesPreviewPath = String(import.meta.env.VITE_CLIENT_QUOTES_PREVIEW_PATH || '').trim()
const configuredTripsPath = String(import.meta.env.VITE_CLIENT_TRIPS_PATH || '').trim()
const configuredPlansPath = String(import.meta.env.VITE_CLIENT_MEMBERSHIPS_PATH || '').trim()
const configuredAircraftPath = String(import.meta.env.VITE_CLIENT_AIRCRAFT_PATH || '').trim()
const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || 'https://uber-aviones.onrender.com/api/v1').trim()
const QUOTES_PREVIEW_PATH = configuredQuotesPreviewPath || '/client/quotes/preview'
const CLIENT_TRIPS_PATH = configuredTripsPath || '/client/flight-requests'
const CLIENT_PLANS_PATH = configuredPlansPath || '/plans'
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

function normalizeMatches(payload) {
  const matches =
    payload?.data ||
    payload?.matches ||
    payload?.matched_options ||
    payload?.results ||
    payload?.options ||
    payload?.flight_request?.matched_options

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
    const imageUrl = normalizeMediaUrl(
      getPrimaryImageValue(match) ||
        getPrimaryImageValue(aircraftRecord) ||
        aircraftImages[0]?.imageUrl ||
        '',
    )

    return {
      id: match.id || `match-${index}`,
      aircraft_id: match.aircraft_id || match.aircraftId || aircraftRecord?.id || '',
      aircraft:
        match.aircraft_name ||
        match.name ||
        aircraftRecord?.name ||
        aircraftRecord?.model ||
        aircraftRecord?.category ||
        'Aeronave verificada',
      cabin: match.cabin || match.cabin_type || match.type || aircraftRecord?.category || '',
      time: match.time || match.flight_time || match.duration || '',
      final_price: match.final_price || match.price || match.quoted_price || asMoney(match.total || ''),
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
      total: match.total || '',
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
      aircraft_id: match.aircraft_id || catalogAircraft.aircraft_id || catalogAircraft.id,
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
    aircraft_id: raw.aircraft_id || raw.aircraftId || raw.id || '',
    aircraft: aircraftName,
    cabin: raw.category || raw.aircraft_category || raw.type || raw.cabin || 'Cabina verificada',
    time: raw.estimated_time || raw.flight_time || '',
    final_price: asMoney(raw.final_price || raw.price || raw.quoted_price || hourlyRate),
    hidden_operator: true,
    amenities: normalizeAmenities(raw),
    response_time: raw.response_time || '',
    capacity: raw.capacity || raw.passenger_capacity || '',
    priority: raw.priority || '',
    model: raw.manufacturer
      ? [raw.manufacturer, raw.registration || raw.matricula].filter(Boolean).join(' · ')
      : raw.registration || raw.matricula || '',
    registration: raw.registration || raw.matricula || '',
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
  const origin = normalizeText(originRaw)
  const passengers = Number(itinerary.passengers || 0)
  const activeStatuses = new Set(['', 'active', 'trial_active', 'approved', 'aprobada', 'available', 'disponible'])

  const filteredAircraft = aircraft
    .filter((item) => {
      const status = normalizeText(item.status).toLowerCase()
      return activeStatuses.has(status)
    })
    .filter((item) => !passengers || !Number(item.capacity || 0) || Number(item.capacity || 0) >= passengers)
    .map((item) => {
      const baseAirportMatches = Boolean(origin && normalizeText(item.source_origin) === origin)

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
      const firstBase = normalizeText(first.source_origin)
      const secondBase = normalizeText(second.source_origin)
      const firstMatchesOrigin = origin && firstBase === origin
      const secondMatchesOrigin = origin && secondBase === origin

      if (firstMatchesOrigin !== secondMatchesOrigin) return firstMatchesOrigin ? -1 : 1
      return Number(second.capacity || 0) - Number(first.capacity || 0)
    })

  const exactBaseAirportMatches = filteredAircraft.filter((item) => item.base_airport_match)
  return exactBaseAirportMatches.length ? exactBaseAirportMatches : filteredAircraft
}

function normalizePlan(plan = {}, index = 0) {
  const benefits = Array.isArray(plan.benefits)
    ? plan.benefits
    : Array.isArray(plan.features)
      ? plan.features.filter(Boolean)
      : [
          plan.has_priority ? 'Prioridad en solicitudes' : null,
          plan.has_concierge ? 'Concierge 24/7' : null,
          plan.has_reports ? 'Reportes operativos' : null,
        ].filter(Boolean)

  return {
    id: plan.id || `plan-${index}`,
    name: plan.name || plan.title || `Plan ${index + 1}`,
    badge: plan.is_enterprise ? 'Enterprise' : plan.code || '',
    price: plan.price || asMoney(plan.price_monthly || plan.price_yearly || ''),
    monthly_price: plan.price_monthly || plan.price || '',
    benefits,
    action: plan.action || 'Solicitar acceso',
    max_legs: plan.max_legs || plan.max_requests || null,
  }
}

function normalizeTrip(request = {}) {
  const route = [request.origin, request.destination].filter(Boolean).join(' -> ')
  const firstMatch = Array.isArray(request.matched_options) ? request.matched_options[0] : null

  return {
    id: request.id || '',
    route,
    title: route || `Solicitud ${request.id || ''}`,
    date: request.departure_datetime || request.departure_date || '',
    status: request.status || '',
    estimated_total: firstMatch?.total ? asMoney(firstMatch.total) : '',
    aircraft: firstMatch?.aircraft?.model || firstMatch?.aircraft?.category || '',
  }
}

function buildFlightRequestPayload(itinerary = {}) {
  const firstLeg = Array.isArray(itinerary.legs) ? itinerary.legs[0] || {} : {}
  const departureDate = firstLeg.date || ''
  const departureTime = firstLeg.time || '09:00'

  return {
    origin: firstLeg.origin || itinerary.origin || '',
    base_airport: firstLeg.origin || itinerary.origin || '',
    destination: firstLeg.destination || itinerary.destination || '',
    departure_datetime: departureDate ? `${departureDate} ${departureTime}` : '',
    passengers: Number(itinerary.passengers) || 1,
    trip_type: itinerary.trip_type || 'one_way',
    trip_label: itinerary.trip_label || 'Ida',
    aircraft_type: itinerary.preference || null,
    requirements: Array.isArray(itinerary.legs) && itinerary.legs.length > 1 ? itinerary.legs.slice(1) : [],
    notes: itinerary.trip_label || itinerary.trip_type || '',
  }
}

export async function getClientDestinations() {
  return FALLBACK_DESTINATIONS
}

export async function getClientMembershipPlans() {
  try {
    const payload = await api.get(CLIENT_PLANS_PATH)
    return normalizeArray(payload, ['memberships', 'plans']).map(normalizePlan)
  } catch {
    return []
  }
}

export async function getClientTrips() {
  try {
    const payload = await api.get(CLIENT_TRIPS_PATH)
    return normalizeArray(payload, ['trips', 'reservations', 'flight_requests']).map(normalizeTrip)
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
    matches = normalizeMatches(payload)
  } catch {
    // El preview no guarda solicitudes. Si falla, mostramos catalogo activo como respaldo visual.
  }

  const aircraft = await getAircraftFromDatabase(aircraftQuery)
  if (matches.length) {
    return filterAircraftByItinerary(mergeMatchesWithCatalogImages(matches, aircraft), itinerary)
  }

  return filterAircraftByItinerary(aircraft, itinerary)
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
