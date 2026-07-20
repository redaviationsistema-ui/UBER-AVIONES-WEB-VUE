/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('api unauthorized handling', () => {
  beforeEach(() => {
    vi.resetModules()
    window.sessionStorage.clear()
    window.sessionStorage.setItem('red_aviation_auth_token', 'session-token')
  })

  it('clears the expired session and emits one central redirect signal', async () => {
    const sessionExpired = vi.fn()
    window.addEventListener('skygroup:session-expired', sessionExpired, { once: true })
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      headers: {
        get: (name) => (name === 'content-type' ? 'application/json' : ''),
      },
      json: async () => ({
        message: 'Unauthenticated.',
      }),
    }))

    const { api } = await import('../lib/api')

    await expect(api.get('/proveedor/solicitudes')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    })

    expect(window.sessionStorage.getItem('red_aviation_auth_token')).toBeNull()
    expect(sessionExpired).toHaveBeenCalledOnce()
    expect(sessionExpired.mock.calls[0][0].detail.message).toContain('sesión terminó')
  })
})
