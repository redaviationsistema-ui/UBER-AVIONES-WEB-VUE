import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal()

  return {
    ...actual,
    api: {
      ...actual.api,
      get: vi.fn(),
      post: vi.fn(),
      postForm: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      download: vi.fn(),
    },
  }
})

import {
  buildFlightRequestPayload,
  deriveClientWorkflowStatus,
  getClientTrips,
  inferDistanceUnit,
  inferEngineType,
  markClientTripReadyForPayment,
  normalizeTrip,
  searchClientFlights,
} from '../features/client/clientBookingApi'
import { api } from '../lib/api'
import {
  resolveMostAdvancedWorkflowValue,
  resolveSharedWorkflowStatus,
  resolveWorkflowState,
} from '../utils/flightWorkflow'

beforeEach(() => {
  vi.clearAllMocks()
})

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
  it('preserves the exact selected aircraft model and omits client-side price fields', () => {
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
    expect(payload.base_price).toBeUndefined()
    expect(payload.subtotal).toBeUndefined()
    expect(payload.total).toBeUndefined()
    expect(payload.estimated_total).toBeUndefined()
    expect(payload.final_price).toBeUndefined()
    expect(payload.selected_card_price).toBeUndefined()
    expect(payload.pricing_context).toBeUndefined()
  })
})

describe('searchClientFlights', () => {
  it('uses overnight_cost as the applied overnight charge when backend fee is only informational', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    api.post.mockResolvedValue({
      matches: [
        {
          id: 'match-overnight',
          aircraft_name: 'Learjet 31A',
          base_price: 19500,
          expense_fee: 1000,
          total: 23780,
          taxes: 3280,
          overnight_fee: 3000,
          overnight_cost: 0,
          overnight_nights: 0,
          pricing_breakdown: {
            overnight_fee: 3000,
            overnight_cost: 0,
            overnight_nights: 0,
          },
        },
      ],
    })
    api.get.mockResolvedValue({ aircraft: [] })

    const [quote] = await searchClientFlights({
      trip_type: 'one_way',
      passengers: 4,
      legs: [
        {
          origin: 'TLC',
          destination: 'CUN',
          date: '2026-06-20',
          time: '09:00',
        },
      ],
    })

    expect(quote.overnight_fee).toBe(3000)
    expect(quote.overnight_cost).toBe(0)
    expect(quote.overnight_fees).toBe(0)
    expect(quote.debug_pricing?.overnight_cost).toBe(0)
    expect(consoleSpy).toHaveBeenCalledWith('- Overnight fee:', 3000)
    expect(consoleSpy).toHaveBeenCalledWith('- Overnight nights:', 0)
    expect(consoleSpy).toHaveBeenCalledWith('- Overnight cost:', 0)

    consoleSpy.mockRestore()
  })

  it('does not show catalog fallback quotes when the backend preview is unavailable', async () => {
    api.post.mockRejectedValue(new Error('backend unavailable'))
    api.get.mockResolvedValue({
      aircraft: [
        {
          id: 1,
          name: 'Fallback Jet A',
          category: 'Light Jet',
          status: 'active',
          source_origin: 'TLC',
          capacity: 6,
          hourly_rate: 12000,
          overnight_fee: 3000,
          overnight_cost: 0,
        },
        {
          id: 2,
          name: 'Fallback Jet B',
          category: 'Light Jet',
          status: 'active',
          source_origin: 'TLC',
          capacity: 6,
          hourly_rate: 12000,
          overnight_fee: 0,
          overnight_cost: 0,
        },
      ],
    })

    await expect(
      searchClientFlights({
        trip_type: 'round_trip',
        passengers: 4,
        overnight_nights: 2,
        days: 2,
        legs: [
          {
            origin: 'TLC',
            destination: 'CUN',
            date: '2026-06-20',
            time: '09:00',
          },
          {
            origin: 'CUN',
            destination: 'TLC',
            date: '2026-06-22',
            time: '12:00',
          },
        ],
      }),
    ).rejects.toThrow('backend unavailable')

    expect(api.get).not.toHaveBeenCalled()
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

  it('prioritizes signed contract and pending payment over an outdated provider workflow', () => {
    expect(
      deriveClientWorkflowStatus({
        id: 111,
        workflow_status: 'proveedor aceptado',
        contract_status: 'signed',
        payment_status: 'Pendiente de pago',
      }),
    ).toBe('payment_pending')
  })

  it('prioritizes paid status over an outdated provider workflow', () => {
    expect(
      deriveClientWorkflowStatus({
        id: 112,
        workflow_status: 'proveedor aceptado',
        contract_status: 'signed',
        payment_status: 'Pagado',
      }),
    ).toBe('payment_confirmed')
  })

  it('prioritizes paid status over an outdated payment pending workflow', () => {
    expect(
      deriveClientWorkflowStatus({
        id: 1121,
        workflow_status: 'pago pendiente',
        contract_status: 'signed',
        payment_status: 'Pagado',
      }),
    ).toBe('payment_confirmed')
  })

  it('uses nested reservation payments when the top-level workflow is stale', () => {
    expect(
      deriveClientWorkflowStatus({
        id: 113,
        workflow_status: 'reserva solicitada',
        reservation: {
          status: 'pending_payment',
          contract: { status: 'generated' },
          payments: [{ status: 'paid', paid_at: '2026-05-21T21:11:31.000000Z' }],
        },
      }),
    ).toBe('payment_confirmed')
  })

  it('respects an explicit admin workflow in spanish even if payment is already paid', () => {
    expect(
      deriveClientWorkflowStatus({
        id: 114,
        workflow_status: 'contrato pendiente',
        contract_status: 'generated',
        payment_status: 'Pagado',
      }),
    ).toBe('contrato pendiente')
  })
})

describe('resolveWorkflowState', () => {
  it('keeps payment_confirmed out of the generic payment_pending matcher', () => {
    expect(resolveWorkflowState('payment_confirmed').id).toBe('payment_confirmed')
    expect(resolveWorkflowState('payment_confirmed').label).toBe('Pago confirmado')
  })

  it('maps pending_payment from the backend to the shared payment_pending step', () => {
    expect(resolveWorkflowState('pending_payment').id).toBe('payment_pending')
    expect(resolveWorkflowState('pending_payment').label).toBe('Pago pendiente')
  })

  it('labels provider_accepted as respuesta proveedor for client-facing workflow copy', () => {
    expect(resolveWorkflowState('accepted').id).toBe('provider_accepted')
    expect(resolveWorkflowState('accepted').label).toBe('Respuesta proveedor')
  })
})

describe('resolveSharedWorkflowStatus', () => {
  it('keeps waiting_provider requests out of contract_pending until the provider accepts', () => {
    expect(
      resolveSharedWorkflowStatus({
        id: 110,
        status: 'waiting_provider',
        workflow_status: 'contract_pending',
        provider_status: 'pending',
        contract_status: 'generated',
        operation_id: 9000,
      }),
    ).toBe('provider_pending')
  })

  it('moves the shared flow to contract_pending when provider accepted but contract generation already started', () => {
    expect(
      resolveSharedWorkflowStatus({
        id: 111,
        status: 'accepted',
        workflow_status: 'proveedor aceptado',
        contract_status: 'generated',
        payment_status: 'pending',
        operation_id: 9001,
        assigned_provider_id: 15,
        assigned_aircraft_id: 31,
      }),
    ).toBe('contract_pending')
  })

  it('keeps admin, client and provider on payment_pending when contract is signed and payment remains open', () => {
    expect(
      resolveSharedWorkflowStatus({
        id: 112,
        status: 'accepted',
        workflow_status: 'proveedor aceptado',
        contract_status: 'signed',
        payment_status: 'pending',
        operation_id: 9002,
      }),
    ).toBe('payment_pending')
  })

  it('keeps tracking_live when operational signals already exist even if payment data is what the backend exposes', () => {
    expect(
      resolveSharedWorkflowStatus({
        id: 113,
        status: 'payment_confirmed',
        contract_status: 'signed',
        payment_status: 'Pagado',
        operation_id: 9003,
        crew_id: 41,
        crew_name: 'Valeria Garcia Ramirez',
        briefing_time: '15:00',
      }),
    ).toBe('tracking_live')
  })
})

describe('resolveMostAdvancedWorkflowValue', () => {
  it('prefers contract_pending over an outdated provider accepted workflow', () => {
    expect(resolveMostAdvancedWorkflowValue('proveedor aceptado', 'contract_pending')).toBe(
      'contract_pending',
    )
  })

  it('keeps terminal states over older derived stages', () => {
    expect(resolveMostAdvancedWorkflowValue('rejected', 'contract_pending')).toBe('rejected')
  })
})

describe('normalizeTrip', () => {
  it('keeps an explicit workflow_status even when reservation payment data suggests a later stage', () => {
    const trip = normalizeTrip({
      id: 115,
      workflow_status: 'vuelo confirmado',
      status: 'pending_payment',
      payment_status: 'Pagado',
      contract_status: 'signed',
    })

    expect(trip.explicit_workflow_status).toBe('vuelo confirmado')
    expect(trip.workflow_status).toBe('vuelo confirmado')
  })

  it('maps accepted request status to respuesta proveedor when normalizing client trips', () => {
    const trip = normalizeTrip({
      id: 116,
      status: 'accepted',
    })

    expect(trip.workflow_status).toBe('provider_accepted')
    expect(resolveWorkflowState(trip.workflow_status).label).toBe('Respuesta proveedor')
  })

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

  it('resolves aircraft images from alternative backend fields used in visibility payloads', () => {
    const trip = normalizeTrip({
      id: 95,
      origin: 'MMTO',
      destination: 'MMSD',
      departure_datetime: '2026-05-19T09:00:00',
      aircraft_model: 'HAWKER 800XPI',
      visibility_payload: {
        aircraft: {
          model: 'HAWKER 800XPI',
          main_image_url: 'https://example.com/hawker-main.png',
        },
      },
    })

    expect(trip.aircraft).toBe('HAWKER 800XPI')
    expect(trip.aircraft_image).toBe('https://example.com/hawker-main.png')
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

describe('getClientTrips', () => {
  it('prefers the freshest reservation workflow when the request payload is stale', async () => {
    api.get.mockResolvedValue({
      reservations: [
        {
          id: 2,
          flight_request_id: 111,
          workflow_status: 'contrato pendiente',
          updated_at: '2026-05-21T23:57:00.000Z',
          contract_status: 'generated',
        },
      ],
      flight_requests: [
        {
          id: 111,
          workflow_status: 'proveedor aceptado',
          updated_at: '2026-05-21T23:40:00.000Z',
        },
      ],
    })

    const trips = await getClientTrips()

    expect(trips).toHaveLength(1)
    expect(trips[0].workflow_status).toBe('contrato pendiente')
    expect(resolveWorkflowState(trips[0].workflow_status).id).toBe('contract_pending')
  })
})

describe('markClientTripReadyForPayment', () => {
  it('sends backend-compatible payment status fields when signing the contract', async () => {
    api.post.mockResolvedValue({
      reservation: {
        id: 2,
        flight_request_id: 111,
        status: 'pending_payment',
        workflow_status: 'pago pendiente',
        contract_status: 'signed',
        payment_status: 'pending',
      },
    })

    const trip = await markClientTripReadyForPayment(2, {
      reservation_id: 2,
      flight_request_id: 111,
      contract_snapshot: {},
      signature: { data_url: 'data:image/png;base64,firma' },
    })

    expect(api.post).toHaveBeenCalledWith(
      '/cliente/reservas/2/contrato/firmar',
      expect.objectContaining({
        reservation_id: '2',
        flight_request_id: '111',
        status: 'pending_payment',
        workflow_status: 'pago pendiente',
        contract_status: 'signed',
        payment_status: 'pending',
      }),
      {},
    )
    expect(resolveWorkflowState(trip.status).id).toBe('payment_pending')
  })

  it('surfaces the signing error instead of pretending the reservation advanced', async () => {
    const error = new Error('SQLSTATE[23514]: Check violation')
    error.status = 500
    error.payload = { message: 'SQLSTATE[23514]: Check violation' }
    api.post.mockRejectedValue(error)

    await expect(
      markClientTripReadyForPayment(2, {
        reservation_id: 2,
        contract_snapshot: {},
        signature: { data_url: 'data:image/png;base64,firma' },
      }),
    ).rejects.toThrow('SQLSTATE[23514]: Check violation')
  })
})
