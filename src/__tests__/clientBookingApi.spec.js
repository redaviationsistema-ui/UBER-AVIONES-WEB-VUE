import { describe, expect, it } from 'vitest'

import {
  buildFlightRequestPayload,
  deriveClientWorkflowStatus,
  inferDistanceUnit,
  inferEngineType,
  normalizeTrip,
} from '../features/client/clientBookingApi'

describe('inferDistanceUnit', () => {
  it('keeps matched_options distance_km values in kilometers by default', () => {
    expect(
      inferDistanceUnit(
        {
          distance_km: 1291.73,
        },
        'matched_options',
      ),
    ).toBe('km')
  })

  it('respects explicit nautical-mile units when provided', () => {
    expect(
      inferDistanceUnit({
        distance_km: 697.48,
        distance_unit: 'nm',
      }),
    ).toBe('nm')
  })
})

describe('inferEngineType', () => {
  it('infers turbofan for current jet models', () => {
    expect(inferEngineType({ category: 'Heavy Jet', model: 'GULFSTREAM G-IV' })).toBe('turbofan')
    expect(inferEngineType({ category: 'Heavy Jet', model: 'GULFSTREAM G450' })).toBe('turbofan')
    expect(inferEngineType({ category: 'Light Jet', model: 'LEARJET 31A' })).toBe('turbofan')
    expect(inferEngineType({ category: 'Mid Jet', model: 'HAWKER 800XPI' })).toBe('turbofan')
    expect(inferEngineType({ category: 'Mid Jet', model: 'HAWKER 800A' })).toBe('turbofan')
    expect(inferEngineType({ category: 'Mid Jet', model: 'GULFSTREAM G200' })).toBe('turbofan')
    expect(inferEngineType({ category: 'Light Jet', model: 'CESSNA CITATION II (550)' })).toBe(
      'turbofan',
    )
    expect(inferEngineType({ category: 'Heavy Jet', model: 'CESSNA CITATION 750' })).toBe(
      'turbofan',
    )
  })

  it('infers turboprop for current prop models', () => {
    expect(inferEngineType({ category: 'Turboprop', model: 'KING AIR' })).toBe('turboprop')
    expect(inferEngineType({ category: 'Turboprop', model: 'KING AIR C90GT' })).toBe('turboprop')
    expect(inferEngineType({ category: 'Turboprop', model: 'PILATUS PC-12' })).toBe('turboprop')
  })

  it('infers turboshaft for current helicopter models', () => {
    expect(inferEngineType({ category: 'Helicoptero', model: 'AGUSTA A109E POWER VIP' })).toBe(
      'turboshaft',
    )
    expect(inferEngineType({ category: 'Helicoptero', model: 'BELL 505' })).toBe('turboshaft')
  })
})

describe('buildFlightRequestPayload', () => {
  it('preserves the exact selected aircraft model in the reservation payload', () => {
    const payload = buildFlightRequestPayload({
      trip_type: 'one_way',
      trip_label: 'Ida',
      passengers: 4,
      preference: 'Midsize Jet',
      aircraft: 'HAWKER 800XPI',
      aircraft_model: 'HAWKER 800XPI',
      aircraft_id: 91,
      provider_id: 14,
      match_id: 'match-91',
      base_price: 11000,
      operational_fee: 2400,
      subtotal_before_multipliers: 13400,
      final_price: 15900,
      legs: [
        {
          origin: 'TLC',
          destination: 'MTY',
          date: '2026-05-19',
          time: '09:00',
        },
      ],
    })

    expect(payload.aircraft_type).toBe('HAWKER 800XPI')
    expect(payload.aircraft_model).toBe('HAWKER 800XPI')
    expect(payload.assigned_aircraft_model).toBe('HAWKER 800XPI')
    expect(payload.aircraft_name).toBe('HAWKER 800XPI')
    expect(payload.aircraft_id).toBe(91)
    expect(payload.provider_id).toBe(14)
    expect(payload.match_id).toBe('match-91')
    expect(payload.base_price).toBe(11000)
    expect(payload.subtotal).toBe(13400)
    expect(payload.total).toBe(15900)
    expect(payload.estimated_total).toBe(15900)
    expect(payload.final_price).toBe(15900)
  })
})

describe('deriveClientWorkflowStatus', () => {
  it('keeps new reservations waiting on provider response when only the selected quote is stored', () => {
    expect(
      deriveClientWorkflowStatus({
        id: 89,
        provider_id: 14,
        aircraft_id: 91,
        match_id: 'match-91',
      }),
    ).toBe('provider_pending')
  })

  it('keeps backend assignments as provider pending until there is a real acceptance signal', () => {
    expect(
      deriveClientWorkflowStatus({
        id: 89,
        assigned_provider_id: 14,
        assigned_aircraft_id: 91,
      }),
    ).toBe('provider_pending')
  })

  it('keeps operador_asignado as provider pending while the provider reply is still outstanding', () => {
    expect(
      deriveClientWorkflowStatus({
        id: 91,
        status: 'operador_asignado',
        assigned_provider_id: 2,
        assigned_aircraft_id: 17,
        matched_options: [{ id: 449, aircraft_id: 13, status: 'pending' }],
      }),
    ).toBe('provider_pending')
  })

  it('marks provider accepted when the backend includes an accepted match', () => {
    expect(
      deriveClientWorkflowStatus({
        id: 92,
        matched_options: [{ id: 501, aircraft_id: 17, status: 'accepted' }],
      }),
    ).toBe('provider_accepted')
  })

  it('treats generic confirmed statuses as provider pending until there is a real acceptance signal', () => {
    expect(
      deriveClientWorkflowStatus({
        id: 90,
        status: 'confirmada',
        provider_id: 22,
        aircraft_id: 7,
        match_id: 'match-7',
      }),
    ).toBe('provider_pending')
  })
})

describe('normalizeTrip', () => {
  it('preserves the confirmed contract amount for the client contract view', () => {
    const trip = normalizeTrip({
      id: 91,
      origin: 'TLC',
      destination: 'CUN',
      departure_datetime: '2026-05-19T09:00:00',
      final_price: 12500,
      base_price: 11000,
      assigned_aircraft_model: 'GULFSTREAM G200',
      matched_options: [{ id: 501, status: 'accepted' }],
    })

    expect(trip.final_price).toBe(12500)
    expect(trip.base_price).toBe(11000)
    expect(trip.formatted_final_price).toContain('12,500')
    expect(trip.estimated_total).toContain('12,500')
    expect(trip.pricing_context).toBe(null)
  })

  it('normalizes currency-formatted totals so the contract can still show the price', () => {
    const trip = normalizeTrip({
      id: 94,
      origin: 'TLC',
      destination: 'CUN',
      departure_datetime: '2026-05-19T09:00:00',
      estimated_total: '$12,500 USD',
      base_price: '$11,000 USD',
    })

    expect(trip.final_price).toBe(12500)
    expect(trip.formatted_final_price).toContain('12,500')
    expect(trip.base_price).toBe(11000)
  })

  it('prefers the exact reserved match and snapshot aircraft over unrelated matched options', () => {
    const trip = normalizeTrip({
      id: 92,
      origin: 'MMTO',
      destination: 'MMUN',
      departure_datetime: '2026-05-19T09:00:00',
      aircraft_model: 'GULFSTREAM G200',
      match_id: 'match-g200',
      aircraft_snapshot: {
        aircraft: 'GULFSTREAM G200',
        model: 'GULFSTREAM G200',
        category: 'Mid Jet',
        capacity: 10,
        main_image: 'https://example.com/g200.png',
        amenities: ['Cabina', 'Asientos'],
      },
      matched_options: [
        {
          id: 'match-kingair',
          aircraft_id: 21,
          status: 'pending',
          aircraft: {
            model: 'KING AIR C90GT',
            category: 'Turboprop',
            capacity: 6,
            main_image: 'https://example.com/kingair.png',
            amenities: ['Cabina'],
          },
        },
        {
          id: 'match-g200',
          aircraft_id: 17,
          status: 'pending',
          aircraft: {
            model: 'GULFSTREAM G200',
            category: 'Mid Jet',
            capacity: 10,
            main_image: 'https://example.com/g200-match.png',
            amenities: ['Cabina', 'Asientos', 'Amenidades'],
          },
        },
      ],
    })

    expect(trip.aircraft).toBe('GULFSTREAM G200')
    expect(trip.aircraft_category).toBe('Mid Jet')
    expect(trip.aircraft_capacity).toBe(10)
    expect(trip.aircraft_image).toBe('https://example.com/g200.png')
    expect(trip.amenities).toEqual(['Cabina', 'Asientos'])
  })

  it('keeps pricing context and aircraft snapshot so the contract can render the stored total', () => {
    const trip = normalizeTrip({
      id: 93,
      origin: 'MMTO',
      destination: 'MMUN',
      departure_datetime: '2026-05-19T09:00:00',
      pricing_context: {
        total: 15400,
        final_price: 15400,
      },
      aircraft_snapshot: {
        model: 'GULFSTREAM G200',
        total: 15400,
        final_price: 15400,
      },
    })

    expect(trip.pricing_context).toEqual({
      total: 15400,
      final_price: 15400,
    })
    expect(trip.aircraft_snapshot).toEqual({
      model: 'GULFSTREAM G200',
      total: 15400,
      final_price: 15400,
    })
  })

  it('falls back to pricing context totals when the reservation total is only stored there', () => {
    const trip = normalizeTrip({
      id: 95,
      origin: 'MMTO',
      destination: 'MMUN',
      departure_datetime: '2026-05-19T09:00:00',
      pricing_context: {
        total: '$15,400 USD',
      },
    })

    expect(trip.final_price).toBe(15400)
    expect(trip.formatted_final_price).toContain('15,400')
  })
})
