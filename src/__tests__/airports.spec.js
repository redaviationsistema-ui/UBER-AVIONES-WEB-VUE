import { describe, expect, it } from 'vitest'
import { mapAirportPayload } from '../utils/airports'

describe('mapAirportPayload', () => {
  it('preserves the persisted backend id and canonical airport codes', () => {
    expect(
      mapAirportPayload({
        id: 5828,
        icao: 'MMTO',
        iata: 'TLC',
        name: 'Aeropuerto Internacional de Toluca',
      }),
    ).toMatchObject({
      id: 5828,
      code: 'MMTO',
      icao: 'MMTO',
      iata: 'TLC',
    })
  })
})
