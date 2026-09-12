/* @vitest-environment jsdom */
import { beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  sessionStorage.clear()
})

it('uses the explicit bearer token without ambient cookies', async () => {
  globalThis.fetch = vi.fn(async () => ({
    ok: true, status: 200,
    headers: { get: (name) => name === 'content-type' ? 'application/json' : '' },
    json: async () => ({ success: true }),
  }))
  const { api, setStoredToken } = await import('../lib/api')
  setStoredToken('explicit-session-token')
  await api.post('/cliente/reservas', { flight_request_id: 41 }, { withCredentials: true })
  expect(fetch.mock.calls[0][1].credentials).toBe('omit')
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer explicit-session-token')
})
