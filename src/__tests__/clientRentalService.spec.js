import { describe, expect, it } from 'vitest'
import { buildRentalItinerary, extractRentalIdentifiers, normalizeRentalSearch } from '../services/clientRentalService'

describe('client rental service', () => {
  it('normalizes one shared rental model and builds round-trip legs', () => {
    const search = normalizeRentalSearch({ tripType: 'round_trip', origin: ' TLC ', destination: 'CUN', departureDate: '2026-08-01', returnDate: '2026-08-03', aircraftType: 'Jet ejecutivo', passengers: 3 })
    expect(search.origin).toBe('TLC')
    expect(buildRentalItinerary(search).legs).toHaveLength(2)
    expect(buildRentalItinerary(search).legs[1]).toMatchObject({ origin: 'CUN', destination: 'TLC' })
  })

  it('keeps reservation and flight-request identifiers separate', () => {
    expect(extractRentalIdentifiers({ flight_request: { id: 'fr-10' }, reservation: { id: 'res-20' } })).toEqual({ flightRequestId: 'fr-10', reservationId: 'res-20' })
    expect(extractRentalIdentifiers({ flight_request: { id: 'fr-10' } }).reservationId).toBeNull()
  })
})
