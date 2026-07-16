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

  it('deduplicates concurrent session bootstrap requests through a shared promise', async () => {
    const payload = buildAuthPayload()
    let resolveRequest

    api.get.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = () => resolve(payload)
        }),
    )

    const auth = useAuthStore()
    const firstRequest = auth.initialize()
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

  it('tracks an explicit session state across bootstrap and login', async () => {
    api.post.mockResolvedValue(buildAuthPayload())

    const auth = useAuthStore()

    expect(auth.sessionState).toBe('initializing')

    await auth.initialize()

    expect(auth.sessionState).toBe('authenticated')

    auth.clearAuth()
    expect(auth.sessionState).toBe('unauthenticated')

    await auth.login({ email: 'admin@example.com', password: 'secret', role: 'admin' })

    expect(auth.initialized).toBe(true)
    expect(auth.loaded).toBe(true)
    expect(auth.sessionState).toBe('authenticated')
  })

  it('derives provider operational access from the shared auth session state', async () => {
    api.get.mockResolvedValue({
      token: 'session-token',
      user: {
        id: 21,
        name: 'Proveedor Test',
        email: 'proveedor@example.com',
        role: 'client',
        operational_role: 'provider',
        provider_id: 88,
        ownedProvider: {
          id: 88,
          company_name: 'Sky Group Ops',
          approval_status: 'approved',
          admin_validation_status: 'approved',
          operator_status: 'validated',
          access_enabled: true,
        },
        roles: [{ code: 'provider', name: 'Proveedor' }],
      },
      access: {
        effective_role: 'provider',
      },
      login_context: {
        effective_role: 'provider',
        roles: ['provider'],
      },
    })

    const auth = useAuthStore()
    await auth.initialize()
    await auth.loadCurrentUser({ preferCache: false })

    expect(auth.providerId).toBe(88)
    expect(auth.providerOperationalAccess.providerId).toBe(88)
    expect(auth.providerOperationalAccess.isOperationalReady).toBe(true)
    expect(auth.hasOperationalProviderAccess).toBe(true)
  })
})
