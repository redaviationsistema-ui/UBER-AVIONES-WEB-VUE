/* @vitest-environment jsdom */

import { RouterLinkStub, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const pushMock = vi.fn()
const replaceMock = vi.fn()

const authState = {
  initialized: true,
  initializing: false,
  isAuthenticated: false,
  logout: vi.fn(),
  getLoginRouteByRole: vi.fn((role) =>
    role === 'client' ? { name: 'login-cliente' } : { name: 'login' },
  ),
  user: { name: 'Operator Test' },
}

vi.mock('vue-router', async () => {
  const actual = await vi.importActual('vue-router')
  return {
    ...actual,
    useRouter: () => ({
      push: pushMock,
      replace: replaceMock,
      currentRoute: {
        value: {
          fullPath: '/operador/dashboard',
        },
      },
    }),
  }
})

vi.mock('../stores/auth', () => ({
  useAuthStore: () => authState,
}))

vi.mock('../stores/ui', () => ({
  useUiStore: () => ({
    pushToast: vi.fn(),
  }),
}))

vi.mock('../lib/companyDisplay', () => ({
  resolveBestCompanyDisplayName: () => 'Sky Group',
}))

describe('RoleWorkspace auth redirect', () => {
  beforeEach(() => {
    pushMock.mockReset()
    replaceMock.mockReset()
    authState.getLoginRouteByRole.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('redirects operator sessions to the internal login route instead of home', async () => {
    const RoleWorkspace = (await import('../components/RoleWorkspace.vue')).default

    mount(RoleWorkspace, {
      props: {
        activeRole: 'operator',
        role: { id: 'operator', label: 'Proveedor' },
        section: 'dashboard',
      },
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
          BrandLogo: true,
          OperatorPortal: true,
        },
      },
    })

    expect(authState.getLoginRouteByRole).toHaveBeenCalledWith('operator')
    expect(replaceMock).toHaveBeenCalledWith({ name: 'login' })
  })
})
