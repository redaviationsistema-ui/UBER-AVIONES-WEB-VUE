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
    const crewDirectoryRoute = router.resolve('/admin/sobrecargos')
    const crewAvailabilityRoute = router.resolve('/admin/sobrecargos/disponibilidad')
    const crewOperationsRoute = router.resolve('/admin/sobrecargos/operaciones')
    const crewInFlightRoute = router.resolve('/admin/sobrecargos/en-vuelo')
    const crewIncidentsRoute = router.resolve('/admin/sobrecargos/incidencias')

    expect(adminRoute.meta.requiresAuth).toBe(true)
    expect(adminRoute.meta.requiresAdmin).toBe(true)
    expect(adminRoute.meta.role).toBe('admin')
    expect(crewDirectoryRoute.meta.requiresAuth).toBe(true)
    expect(crewDirectoryRoute.meta.requiresAdmin).toBe(true)
    expect(crewAvailabilityRoute.meta.requiresAuth).toBe(true)
    expect(crewAvailabilityRoute.meta.requiresAdmin).toBe(true)
    expect(crewAvailabilityRoute.meta.role).toBe('admin')
    expect(crewOperationsRoute.meta.requiresAuth).toBe(true)
    expect(crewInFlightRoute.meta.requiresAuth).toBe(true)
    expect(crewIncidentsRoute.meta.requiresAuth).toBe(true)
  })

  it('supports direct admin crew URLs through redirects to the canonical admin section route', async () => {
    const authStore = {
      token: 'session-token',
      loaded: true,
      initialized: true,
      isAuthenticated: true,
      user: { id: 7, role: 'admin' },
      dashboardPath: '/admin/ejecutivo',
      initialize: vi.fn(),
      loadCurrentUser: vi.fn(),
      hasAdminAccess: vi.fn(() => true),
      hasRole: vi.fn(() => true),
    }

    const router = await loadRouterWithAuthStore(authStore)

    await router.push('/admin/sobrecargos')
    expect(router.currentRoute.value.name).toBe('admin')
    expect(router.currentRoute.value.params.section).toBe('sobrecargos')

    await router.push('/admin/sobrecargos/operaciones')
    expect(router.currentRoute.value.name).toBe('admin')
    expect(router.currentRoute.value.params.section).toBe('sobrecargo-operaciones')

    await router.push('/admin/sobrecargos/en-vuelo')
    expect(router.currentRoute.value.name).toBe('admin')
    expect(router.currentRoute.value.params.section).toBe('sobrecargos-en-vuelo')

    await router.push('/admin/sobrecargos/incidencias')
    expect(router.currentRoute.value.name).toBe('admin')
    expect(router.currentRoute.value.params.section).toBe('incidencias')
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

  it('uses the explicit admin check as the authority for admin routes', async () => {
    const authStore = {
      token: 'session-token',
      loaded: true,
      initialized: true,
      isAuthenticated: true,
      user: { id: 7 },
      dashboardPath: '/admin/ejecutivo',
      initialize: vi.fn(),
      loadCurrentUser: vi.fn(),
      hasAdminAccess: vi.fn(() => true),
      hasRole: vi.fn(() => false),
    }

    const router = await loadRouterWithAuthStore(authStore)

    await router.push('/admin/ejecutivo')

    expect(router.currentRoute.value.name).toBe('admin')
    expect(authStore.hasAdminAccess).toHaveBeenCalledTimes(1)
    expect(authStore.hasRole).not.toHaveBeenCalled()
  })
})
