/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadRouterWithAuthStore(authStore) {
  vi.resetModules()

  vi.doMock('../stores', () => ({
    pinia: {},
  }))

  vi.doMock('../stores/auth', () => ({
    useAuthStore: () => authStore,
  }))

  const module = await import('../router/index.js')
  return module.default
}

describe('admin router policy', () => {
  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('marks admin routes as explicit authenticated admin-only routes', async () => {
    const router = await loadRouterWithAuthStore({
      token: null,
      loaded: true,
      initialized: true,
      isAuthenticated: false,
      user: null,
      dashboardPath: '/cliente/reservar',
      initialize: vi.fn(),
      loadCurrentUser: vi.fn(),
      hasAdminAccess: vi.fn(() => false),
      hasRole: vi.fn(() => false),
    })

    const adminRoute = router.resolve('/admin/ejecutivo')
    const crewAvailabilityRoute = router.resolve('/admin/sobrecargos/disponibilidad')

    expect(adminRoute.meta.requiresAuth).toBe(true)
    expect(adminRoute.meta.requiresAdmin).toBe(true)
    expect(adminRoute.meta.role).toBe('admin')
    expect(crewAvailabilityRoute.meta.requiresAuth).toBe(true)
    expect(crewAvailabilityRoute.meta.requiresAdmin).toBe(true)
    expect(crewAvailabilityRoute.meta.role).toBe('admin')
  })

  it('reuses the initialized admin session on section changes without refetching auth', async () => {
    const authStore = {
      token: 'session-token',
      loaded: false,
      initialized: true,
      isAuthenticated: true,
      user: { id: 7, role: 'admin' },
      dashboardPath: '/admin/ejecutivo',
      initialize: vi.fn(),
      loadCurrentUser: vi.fn(async () => {
        authStore.loaded = true
        return authStore.user
      }),
      hasAdminAccess: vi.fn(() => true),
      hasRole: vi.fn(() => true),
    }

    const router = await loadRouterWithAuthStore(authStore)

    await router.push('/admin/ejecutivo')
    await router.push('/admin/proveedores')

    expect(authStore.initialize).not.toHaveBeenCalled()
    expect(authStore.loadCurrentUser).not.toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('admin')
    expect(router.currentRoute.value.params.section).toBe('proveedores')
  })

  it('waits for a single bootstrap on protected admin routes before resolving access', async () => {
    const authStore = {
      token: 'session-token',
      loaded: true,
      initialized: false,
      isAuthenticated: true,
      user: { id: 7, role: 'admin' },
      dashboardPath: '/admin/ejecutivo',
      initialize: vi.fn(async () => {
        authStore.initialized = true
        return authStore.user
      }),
      loadCurrentUser: vi.fn(),
      hasAdminAccess: vi.fn(() => true),
      hasRole: vi.fn(() => true),
    }

    const router = await loadRouterWithAuthStore(authStore)

    await router.push('/admin/ejecutivo')

    expect(authStore.initialize).toHaveBeenCalledTimes(1)
    expect(authStore.loadCurrentUser).not.toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('admin')
  })
})
