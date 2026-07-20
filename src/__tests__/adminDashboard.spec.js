import { describe, expect, it } from 'vitest'

import {
  buildAdminDashboardEmptyState,
  normalizeAdminDashboardPayload,
} from '../features/admin/adminDashboard'

describe('admin dashboard normalization', () => {
  it('maps backend metrics into display cards without relying on frontend calculations', () => {
    const payload = normalizeAdminDashboardPayload({
      metrics: {
        gross_revenue: 120000,
        refunds: 20000,
        net_revenue: 100000,
        quotes_issued: 15,
        confirmed_reservations: 8,
        payments_pending: 3,
        active_aircraft: 11,
        active_providers: 5,
        active_subscriptions: 7,
        expired_subscriptions: 2,
        upcoming_flights: 6,
      },
      series: {
        revenue: [{ label: 'Hoy', value: 100000 }],
      },
      recent_activity: [
        { id: 1, title: 'Pago confirmado', description: 'Reserva #8', created_at: '2026-07-14 12:00:00' },
      ],
    })

    expect(payload.cards[0].label).toBe('Ingresos netos')
    expect(payload.cards[0].value).toContain('$')
    expect(payload.cards.some((item) => item.label === 'Reservas confirmadas')).toBe(true)
    expect(payload.analytics.some((item) => item.label === 'Suscripciones activas')).toBe(true)
    expect(payload.analytics.find((item) => item.label === 'Tasa de reembolso')).toMatchObject({
      value: '17%',
      score: expect.closeTo(16.67, 1),
    })
    expect(payload.recentActivity[0].title).toBe('Pago confirmado')
  })

  it('provides a stable empty state', () => {
    expect(buildAdminDashboardEmptyState()).toEqual({
      currency: 'MXN',
      cards: [],
      analytics: [],
      recentActivity: [],
      series: {
        revenue: [],
        reservations: [],
        flights: [],
      },
      raw: {},
    })
  })
})
