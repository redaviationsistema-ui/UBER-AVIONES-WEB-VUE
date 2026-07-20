import { createClientFlightRequest, searchClientFlights } from '../features/client/clientBookingApi'
import { normalizeApiError } from '../lib/apiError'

const VALID_TRIP_TYPES = new Set(['one_way', 'round_trip'])
export const RENTAL_AIRCRAFT_TYPES = ['Jet ejecutivo', 'Turbohélice', 'Helicóptero', 'Long Range Jet']
let activeRentalRequest = null

export function normalizeRentalSearch(input = {}) {
  const tripType = VALID_TRIP_TYPES.has(input.tripType) ? input.tripType : 'round_trip'
  return {
    tripType, origin: String(input.origin || '').trim(), destination: String(input.destination || '').trim(),
    departureDate: String(input.departureDate || '').trim(), returnDate: tripType === 'one_way' ? '' : String(input.returnDate || '').trim(),
    differentReturnDestination: Boolean(input.differentReturnDestination), returnOrigin: String(input.returnOrigin || '').trim(),
    returnDestination: String(input.returnDestination || '').trim(), aircraftId: input.aircraftId || null,
    aircraftType: RENTAL_AIRCRAFT_TYPES.includes(input.aircraftType) ? input.aircraftType : null,
    passengers: Math.max(1, Number(input.passengers || 1)),
  }
}

export function buildRentalItinerary(search = {}) {
  const rental = normalizeRentalSearch(search)
  const legs = [{ origin: rental.origin, destination: rental.destination, date: rental.departureDate, time: '09:00', passengers: rental.passengers }]
  if (rental.tripType === 'round_trip') legs.push({
    origin: rental.differentReturnDestination ? rental.returnOrigin : rental.destination,
    destination: rental.differentReturnDestination ? rental.returnDestination : rental.origin,
    date: rental.returnDate, time: '09:00', passengers: rental.passengers,
  })
  return { trip_type: rental.tripType, passengers: rental.passengers, preference: rental.aircraftType, aircraft_id: rental.aircraftId, legs }
}

function controlledError(error) {
  const normalized = normalizeApiError(error)
  return Object.assign(new Error(normalized.message), normalized)
}

export async function checkAvailability(search, options = {}) {
  try { return await searchClientFlights(buildRentalItinerary(search), options) } catch (error) { throw controlledError(error) }
}
export async function createFlightRequest(search, options = {}) {
  try { return await createClientFlightRequest(buildRentalItinerary(search), options) } catch (error) { throw controlledError(error) }
}
export function extractRentalIdentifiers(response = {}) {
  return {
    reservationId: response?.reservation?.id || response?.data?.reservation?.id || response?.reservation_id || null,
    flightRequestId: response?.flight_request?.id || response?.data?.flight_request?.id || response?.flight_request_id || response?.data?.id || response?.id || null,
  }
}
export async function continueRentalFlow(search, options = {}) {
  if (activeRentalRequest) return activeRentalRequest
  activeRentalRequest = (async () => {
    const availability = await checkAvailability(search, options)
    if (!availability.length) throw new Error('No encontramos aeronaves disponibles para este itinerario.')
    const response = await createFlightRequest(search, options)
    const identifiers = extractRentalIdentifiers(response)
    if (!identifiers.flightRequestId && !identifiers.reservationId) throw new Error('El backend no devolvió el identificador de la solicitud.')
    return { ...identifiers, availability, response }
  })()
  try { return await activeRentalRequest } finally { activeRentalRequest = null }
}
