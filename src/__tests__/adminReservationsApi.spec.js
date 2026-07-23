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
      status: 'reserved',
    })
  })

  it('uses a request-safe status when the admin workflow update hits request endpoints', async () => {
    api.put.mockResolvedValueOnce({
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

    expect(api.put.mock.calls[0][0]).toBe('/admin/requests/176/workflow')
    expect(api.put.mock.calls[0][1]).toMatchObject({
      reservation_id: '28',
      flight_request_id: '176',
      status: 'reserved',
      workflow_status: 'pago pendiente',
    })
  })

  it('prefers the reservation id for reservation endpoints after request routes are unavailable', async () => {
    api.put.mockRejectedValue({
      status: 404,
      message: 'The route could not be found.',
    })
    api.post.mockRejectedValue({
      status: 404,
      message: 'The route could not be found.',
    })
    api.patch
      .mockRejectedValueOnce({
        status: 404,
        message: 'The route api/v1/admin/requests/177/workflow could not be found.',
      })
      .mockRejectedValueOnce({
        status: 404,
        message: 'The route api/v1/admin/requests/177 could not be found.',
      })
      .mockRejectedValueOnce({
        status: 404,
        message: 'The route api/v1/admin/reservas/29 could not be found.',
      })
      .mockRejectedValueOnce({
        status: 404,
        message: 'The route api/v1/admin/reservations/29 could not be found.',
      })
      .mockResolvedValueOnce({
        reservation: {
          id: 29,
          reservation_id: 29,
          flight_request_id: 177,
          payment_status: 'pending',
          workflow_status: 'pago pendiente',
        },
      })

    await updateAdminReservationStage(
      {
        id: 29,
        reservationId: 29,
        requestId: 177,
        raw: {
          id: 29,
          reservation_id: 29,
          flight_request_id: 177,
        },
      },
      'payment_pending',
    )

    const attemptedPaths = [
      ...api.patch.mock.calls.map(([path]) => path),
      ...api.put.mock.calls.map(([path]) => path),
      ...api.post.mock.calls.map(([path]) => path),
    ]
    const firstReservationPathIndex = attemptedPaths.findIndex((path) => path === '/admin/reservas/29')
    const fallbackReservationPathIndex = attemptedPaths.findIndex((path) => path === '/admin/reservas/177')

    expect(attemptedPaths).toContain('/admin/reservas/29')
    expect(firstReservationPathIndex).toBeGreaterThan(-1)
    expect(fallbackReservationPathIndex).toBeGreaterThan(firstReservationPathIndex)
    expect(api.patch.mock.calls[4][1]).toMatchObject({
      reservation_id: '29',
      flight_request_id: '177',
      status: 'pending_payment',
    })
  })

  it('uses a reservation-safe status when the admin update falls back to reservation endpoints', async () => {
    api.patch
      .mockRejectedValueOnce({
        status: 404,
        message: 'The route api/v1/admin/requests/177/workflow could not be found.',
      })
      .mockRejectedValueOnce({
        status: 404,
        message: 'The route api/v1/admin/requests/177 could not be found.',
      })
      .mockRejectedValueOnce({
        status: 404,
        message: 'The route api/v1/admin/solicitudes/177 could not be found.',
      })
      .mockResolvedValueOnce({
        reservation: {
          id: 29,
          reservation_id: 29,
          flight_request_id: 177,
          payment_status: 'pending',
          workflow_status: 'pago pendiente',
        },
      })

    await updateAdminReservationStage(
      {
        id: 29,
        reservationId: 29,
        requestId: 177,
        raw: {
          id: 29,
          reservation_id: 29,
          flight_request_id: 177,
        },
      },
      'payment_pending',
    )

    const reservationPaths = api.patch.mock.calls.map(([path]) => path)
    const canonicalReservationPathIndex = reservationPaths.findIndex((path) => path === '/admin/reservations/29')
    const fallbackReservationPathIndex = reservationPaths.findIndex((path) => path === '/admin/reservations/177')

    expect(canonicalReservationPathIndex).toBeGreaterThan(-1)
    expect(fallbackReservationPathIndex).toBeGreaterThan(canonicalReservationPathIndex)
    expect(api.patch.mock.calls[canonicalReservationPathIndex][1]).toMatchObject({
      reservation_id: '29',
      flight_request_id: '177',
      status: 'pending_payment',
      workflow_status: 'pago pendiente',
    })
  })
})
