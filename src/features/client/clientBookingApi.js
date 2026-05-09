import { api } from '../../lib/api'

const configuredSearchPath = String(import.meta.env.VITE_CLIENT_SEARCH_FLIGHTS_PATH || '').trim()
const configuredTripsPath = String(import.meta.env.VITE_CLIENT_TRIPS_PATH || '').trim()
const configuredPlansPath = String(import.meta.env.VITE_CLIENT_MEMBERSHIPS_PATH || '').trim()
const SEARCH_FLIGHTS_PATH = configuredSearchPath || '/client/flight-requests'
const CLIENT_TRIPS_PATH = configuredTripsPath || '/client/flight-requests'
const CLIENT_PLANS_PATH = configuredPlansPath || '/plans'
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

  return matches.map((match, index) => ({
    id: match.id || `match-${index}`,
    aircraft:
      match.aircraft?.name ||
      match.aircraft_name ||
      match.name ||
      match.aircraft?.category ||
      match.aircraft?.model ||
      'Aeronave verificada',
    cabin: match.cabin || match.cabin_type || match.type || match.aircraft?.category || '',
    time: match.time || match.flight_time || match.duration || '',
    final_price: match.final_price || match.price || match.quoted_price || asMoney(match.total || ''),
    hidden_operator: match.hidden_operator ?? true,
    amenities: Array.isArray(match.amenities)
      ? match.amenities
      : Array.isArray(match.aircraft?.amenities)
        ? match.aircraft.amenities
        : [],
    response_time: match.response_time || '',
    capacity: match.capacity || match.aircraft?.capacity || '',
    priority: match.priority || '',
    model: match.model || match.aircraft_model || match.aircraft?.model || '',
    image_url:
      match.image_url ||
      match.aircraft?.main_image ||
      (Array.isArray(match.aircraft?.images) ? match.aircraft.images[0]?.image_url : '') ||
      '',
    images: Array.isArray(match.aircraft?.images) ? match.aircraft.images : [],
  }))
}

function normalizeArray(payload, keys = []) {
  if (Array.isArray(payload)) return payload

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key]
  }

  if (Array.isArray(payload?.data)) return payload.data
  return []
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
    destination: firstLeg.destination || itinerary.destination || '',
    departure_datetime: departureDate ? `${departureDate} ${departureTime}` : '',
    passengers: Number(itinerary.passengers) || 1,
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
  try {
    const payload = await api.post(SEARCH_FLIGHTS_PATH, buildFlightRequestPayload(itinerary))
    return normalizeMatches(payload)
  } catch {
    return []
  }
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
