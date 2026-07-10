/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadApiModule() {
  vi.resetModules()
  return import('../lib/api')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('resolveApiRequestUrl', () => {
  it('uses the direct local backend when the dev proxy is disabled', async () => {
    vi.stubEnv('VITE_API_URL', 'http://127.0.0.1:8000/api/v1')
    vi.stubEnv('VITE_API_BASE_URL', 'http://127.0.0.1:8000/api/v1')
    vi.stubEnv('VITE_BACKEND_ORIGIN', 'http://127.0.0.1:8000')
    vi.stubEnv('VITE_USE_DEV_API_PROXY', 'false')

    const { getBackendOrigin, resolveApiRequestUrl } = await loadApiModule()

    expect(resolveApiRequestUrl('/admin/providers/26/documents')).toBe(
      'http://127.0.0.1:8000/api/v1/admin/providers/26/documents',
    )
    expect(getBackendOrigin()).toBe('http://127.0.0.1:8000')
  })

  it('uses the local dev origin when the proxy mode is enabled', async () => {
    vi.stubEnv('VITE_API_URL', 'http://127.0.0.1:8000/api/v1')
    vi.stubEnv('VITE_API_BASE_URL', 'http://127.0.0.1:8000/api/v1')
    vi.stubEnv('VITE_BACKEND_ORIGIN', 'http://127.0.0.1:8000')
    vi.stubEnv('VITE_USE_DEV_API_PROXY', 'true')

    const { getBackendOrigin, resolveApiRequestUrl } = await loadApiModule()

    expect(resolveApiRequestUrl('/admin/providers/26/documents')).toBe(
      `${window.location.origin}/api/v1/admin/providers/26/documents`,
    )
    expect(getBackendOrigin()).toBe(window.location.origin)
  })
})
