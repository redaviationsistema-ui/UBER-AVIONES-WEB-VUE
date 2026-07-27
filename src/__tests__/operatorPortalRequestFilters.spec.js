import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../plugins/echo', () => ({
  echo: null,
  isEchoConfigured: () => false,
}))

let resolveOperatorRequestQueue
let hasOperatorTrackingActivity
let shouldShowRealtimeRequestInBanner
let shouldKeepOperatorRealtimeRequestVisible
let buildRequestFullRoute
let buildRealtimeRequestPayload
let shouldIgnoreOperatorRequestsRouteError

beforeAll(async () => {
  const module = await import('../features/operator/portal/PortalOperador.componente.js')
  const requestUtils = await import('../features/operator/portal/portalOperador.utilidadesSolicitudes.js')
  resolveOperatorRequestQueue = module.resolveOperatorRequestQueue
  hasOperatorTrackingActivity = module.hasOperatorTrackingActivity
  shouldShowRealtimeRequestInBanner = module.shouldShowRealtimeRequestInBanner
  shouldKeepOperatorRealtimeRequestVisible = module.shouldKeepOperatorRealtimeRequestVisible
  buildRequestFullRoute = requestUtils.buildRequestFullRoute
  buildRealtimeRequestPayload = requestUtils.buildRealtimeRequestPayload
  shouldIgnoreOperatorRequestsRouteError = requestUtils.shouldIgnoreOperatorRequestsRouteError
})

describe('operator portal request filters', () => {
  it('classifies reserved and provider_pending requests as pending decision', () => {
    expect(resolveOperatorRequestQueue({ workflowStatus: 'reserved' })).toBe('pending')
    expect(resolveOperatorRequestQueue({ workflowStatus: 'provider_pending' })).toBe('pending')
  })

  it('classifies tracking requests using workflow state', () => {
    expect(resolveOperatorRequestQueue({ workflowStatus: 'tracking_live' })).toBe('tracking')
  })

  it('classifies tracking requests using tracking_status even when workflow is earlier', () => {
    expect(
      resolveOperatorRequestQueue({
        workflowStatus: 'payment_confirmed',
        trackingStatus: 'activo',
      }),
    ).toBe('tracking')
    expect(
      hasOperatorTrackingActivity({
        trackingStatus: 'tracking active',
      }),
    ).toBe(true)
  })

  it('classifies backend operations in flight as tracking', () => {
    expect(
      resolveOperatorRequestQueue({
        workflowStatus: 'flight_confirmed',
        raw: {
          operation: {
            status: 'en_vuelo',
          },
        },
      }),
    ).toBe('tracking')
    expect(
      hasOperatorTrackingActivity({
        raw: {
          operation: {
            status: 'in_flight',
          },
        },
      }),
    ).toBe(true)
  })

  it('keeps pending requests in the pending queue when no tracking activity exists', () => {
    expect(
      resolveOperatorRequestQueue({
        workflowStatus: 'provider_pending',
        raw: {
          operation: {
            status: 'confirmada',
          },
        },
      }),
    ).toBe('pending')
  })

  it('does not treat confirmed or completed operations as active tracking', () => {
    expect(
      hasOperatorTrackingActivity({
        raw: {
          operation: {
            status: 'confirmada',
          },
        },
      }),
    ).toBe(false)
    expect(
      hasOperatorTrackingActivity({
        raw: {
          operation: {
            status: 'finalizada',
          },
        },
      }),
    ).toBe(false)
  })

  it('keeps payment confirmed inside coordination when workflow_status is not tracking yet', () => {
    expect(
      resolveOperatorRequestQueue({
        workflowStatus: 'payment_confirmed',
      }),
    ).toBe('coordination')
  })

  it('keeps contract and payment stages inside coordination', () => {
    expect(resolveOperatorRequestQueue({ workflowStatus: 'contract_pending' })).toBe('coordination')
    expect(resolveOperatorRequestQueue({ workflowStatus: 'flight_confirmed' })).toBe('coordination')
  })

  it('shows the realtime banner only for pending-decision requests', () => {
    expect(shouldShowRealtimeRequestInBanner({ status: 'reserved' })).toBe(true)
    expect(shouldShowRealtimeRequestInBanner({ status: 'provider_pending' })).toBe(true)
    expect(shouldShowRealtimeRequestInBanner({ status: 'flight_confirmed' })).toBe(false)
    expect(shouldShowRealtimeRequestInBanner({ status: 'tracking_live' })).toBe(false)
    expect(shouldShowRealtimeRequestInBanner({ status: 'completed' })).toBe(false)
  })

  it('uses the synchronized request stage when realtime payload is stale', () => {
    expect(
      shouldShowRealtimeRequestInBanner(
        { status: 'provider_pending' },
        { workflowStatus: 'flight_confirmed' },
      ),
    ).toBe(false)
  })

  it('hides realtime requests when there is no matching live request in the queue', () => {
    expect(
      shouldKeepOperatorRealtimeRequestVisible(
        { requestId: 156, status: 'provider_pending' },
        [],
      ),
    ).toBe(false)
  })

  it('hides realtime requests when the matched request is no longer pending', () => {
    expect(
      shouldKeepOperatorRealtimeRequestVisible(
        { requestId: 156, status: 'provider_pending' },
        [{ id: 156, workflowStatus: 'flight_confirmed' }],
      ),
    ).toBe(false)
  })

  it('keeps realtime requests visible only when the matched queue item is still pending', () => {
    expect(
      shouldKeepOperatorRealtimeRequestVisible(
        { requestId: 156, status: 'provider_pending' },
        [{ id: 156, workflowStatus: 'provider_pending' }],
      ),
    ).toBe(true)
  })

  it('builds the full route label from all request legs', () => {
    expect(
      buildRequestFullRoute({
        origin: 'MMTO',
        destination: 'MMGL',
        requirements: [
          { origin: 'MMGL', destination: 'MMMX' },
          { origin: 'MMMX', destination: 'MMTO' },
        ],
      }),
    ).toBe('MMTO -> MMGL -> MMMX -> MMTO')
  })

  it('keeps the full multi-leg route inside realtime payloads', () => {
    const payload = buildRealtimeRequestPayload({
      request_id: 160,
      origin: 'MMTO',
      destination: 'MMGL',
      legs: [
        { origin: 'MMTO', destination: 'MMGL' },
        { origin: 'MMGL', destination: 'MMMX' },
        { origin: 'MMMX', destination: 'MMTO' },
      ],
    })

    expect(payload.route).toBe('MMTO -> MMGL -> MMMX -> MMTO')
    expect(payload.origin).toBe('MMTO')
    expect(payload.destination).toBe('MMTO')
  })

  it('ignores 403 request-route errors when an earlier route already returned usable data', () => {
    expect(
      shouldIgnoreOperatorRequestsRouteError(
        { status: 403, message: 'Proveedor no autorizado' },
        { hasSuccessfulPayload: true },
      ),
    ).toBe(true)
  })

  it('ignores 403 request-route errors while the provider is still pending validation', () => {
    expect(
      shouldIgnoreOperatorRequestsRouteError(
        { status: 403, message: 'Proveedor no autorizado' },
        { providerPendingValidation: true },
      ),
    ).toBe(true)
  })

  it('still surfaces 403 request-route errors when there is no usable fallback', () => {
    expect(
      shouldIgnoreOperatorRequestsRouteError(
        { status: 403, message: 'Proveedor no autorizado' },
        {},
      ),
    ).toBe(false)
  })
})
