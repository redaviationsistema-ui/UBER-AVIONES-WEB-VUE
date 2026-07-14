/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

let storedToken = null

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    postForm: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    download: vi.fn(),
  },
  clearStoredToken: vi.fn(() => {
    storedToken = null
  }),
  getStoredToken: vi.fn(() => storedToken),
  setStoredToken: vi.fn((value) => {
    storedToken = value || null
  }),
}))

import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'

function buildAuthPayload() {
  return {
    token: 'session-token',
    user: {
      id: 7,
      name: 'Admin Test',
      email: 'admin@example.com',
      role: 'admin',
      operational_role: null,
      permissions: ['admin.providers.read'],
      roles: [{ code: 'admin', name: 'Admin' }],
    },
    access: {
      effective_role: 'admin',
      permissions: ['admin.contracts.read'],
    },
    login_context: {
      effective_role: 'admin',
      roles: ['admin'],
      permissions: ['admin.dashboard.read'],
    },
  }
}

describe('auth current user loading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
    storedToken = 'session-token'
    setActivePinia(createPinia())
  })

  it('deduplicates concurrent /auth/me requests through a shared promise', async () => {
    const payload = buildAuthPayload()
    let resolveRequest

    api.get.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = () => resolve(payload)
        }),
    )

    const auth = useAuthStore()
    await auth.initialize()

    const firstRequest = auth.loadCurrentUser({ preferCache: false })
    const secondRequest = auth.loadCurrentUser({ preferCache: false, force: true })

    resolveRequest()

    const [firstUser, secondUser] = await Promise.all([firstRequest, secondRequest])

    expect(api.get).toHaveBeenCalledTimes(1)
    expect(firstUser?.id).toBe(7)
    expect(secondUser?.id).toBe(7)
    expect(auth.loaded).toBe(true)
    expect(auth.role).toBe('admin')
    expect(auth.permissions).toEqual([
      'admin.dashboard.read',
      'admin.contracts.read',
      'admin.providers.read',
    ])
  })

  it('reuses the loaded user without a second network request', async () => {
    api.get.mockResolvedValue(buildAuthPayload())

    const auth = useAuthStore()
    await auth.initialize()

    await auth.loadCurrentUser({ preferCache: false })
    const loadedUser = await auth.loadCurrentUser()

    expect(api.get).toHaveBeenCalledTimes(1)
    expect(loadedUser?.email).toBe('admin@example.com')
  })
})
