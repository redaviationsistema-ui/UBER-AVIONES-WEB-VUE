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

import { getAdminReservations, updateAdminReservationStage } from '../features/admin/adminReservationsApi'
import { api } from '../lib/api'

describe('adminReservationsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes assigned crew when the backend only returns it inside operation payloads', async () => {
    api.get.mockResolvedValueOnce({
      requests: [
        {
          id: 177,
          request_id: 177,
          flight_request_id: 177,
          reservation_id: 29,
          origin: 'MMTO',
          destination: 'MMMM',
          departure_datetime: '2026-07-22T11:00:00.000000Z',
          aircraft_model: 'AGUSTA A109E POWER VIP',
          workflow_status: 'tracking_live',
          operation: {
            id: 12,
            sobrecargo_user_id: 44,
            crew_status: 'pending_crew_response',
            crew_notes: 'Briefing listo',
            sobrecargo: {
              id: 44,
              name: 'VALERIA GARCIA RAMIREZ',
            },
          },
        },
      ],
    })

    const [reservation] = await getAdminReservations()

    expect(reservation).toMatchObject({
      id: '177',
      requestId: '177',
      reservationId: '177',
      crew: 'VALERIA GARCIA RAMIREZ',
      crewId: 44,
      crewOperationalState: 'pending_crew_response',
    })
  })

  it('sends canonical paid status when admin confirms payment', async () => {
    api.patch.mockResolvedValueOnce({
      request: {
        id: 176,
        flight_request_id: 176,
        reservation_id: 28,
        payment_status: 'paid',
        workflow_status: 'pago confirmado',
      },
    })

    await updateAdminReservationStage(
      {
        id: 28,
        reservationId: 28,
        requestId: 176,
        notes: 'Caso real',
        raw: {
          id: 28,
          flight_request_id: 176,
          reservation_id: 28,
        },
      },
      'payment_confirmed',
      'Pago sincronizado',
    )

    expect(api.patch.mock.calls.length).toBeGreaterThan(0)
    expect(
      api.patch.mock.calls.every(([, payload]) => payload.payment_status === 'paid' && payload.contract_status === 'signed'),
    ).toBe(true)
    expect(api.patch.mock.calls[0][1]).toMatchObject({
      reservation_id: '28',
      flight_request_id: '176',
    })
  })

  it('sends canonical pending status when admin moves reservation back to pending payment', async () => {
    api.patch.mockResolvedValueOnce({
      request: {
        id: 176,
        flight_request_id: 176,
        reservation_id: 28,
        payment_status: 'pending',
        workflow_status: 'pago pendiente',
      },
    })

    await updateAdminReservationStage(
      {
        id: 28,
        reservationId: 28,
        requestId: 176,
        raw: {
          id: 28,
          flight_request_id: 176,
          reservation_id: 28,
        },
      },
      'payment_pending',
    )

    expect(api.patch.mock.calls.length).toBeGreaterThan(0)
    expect(
      api.patch.mock.calls.every(([, payload]) => payload.payment_status === 'pending' && payload.contract_status === 'signed'),
    ).toBe(true)
    expect(api.patch.mock.calls[0][1]).toMatchObject({
      reservation_id: '28',
      flight_request_id: '176',
    })
  })
})
