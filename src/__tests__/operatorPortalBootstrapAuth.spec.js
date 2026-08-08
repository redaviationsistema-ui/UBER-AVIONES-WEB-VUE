/* @vitest-environment jsdom */

import { flushPromises, mount } from '@vue/test-utils'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

const pushToastMock = vi.fn()
const replaceMock = vi.fn()
const pushMock = vi.fn()
const clearAuthMock = vi.fn()
const revalidateSessionMock = vi.fn()

const requestWithCandidatesMock = vi.fn()
const apiGetMock = vi.fn()

vi.mock('../plugins/echo', () => ({
  echo: null,
  isEchoConfigured: () => false,
  syncEchoAuthToken: () => {},
}))

vi.mock('../lib/workflowSync', () => ({
  emitWorkflowSync: vi.fn(),
  subscribeWorkflowSync: vi.fn(() => () => {}),
}))

vi.mock('../lib/backendCrud', () => ({
  requestWithCandidates: (...args) => requestWithCandidatesMock(...args),
  pickCollection: (payload, keys = []) => {
    if (Array.isArray(payload)) return payload
    for (const key of keys) {
      const direct = payload?.[key]
      if (Array.isArray(direct)) return direct
      if (Array.isArray(direct?.data)) return direct.data
    }
    return Array.isArray(payload?.data) ? payload.data : []
  },
  pickRecord: (payload, keys = []) => {
    for (const key of keys) {
      if (payload?.[key] && typeof payload[key] === 'object') return payload[key]
    }
    return payload
  },
}))

vi.mock('../lib/api', () => ({
  api: {
    get: (...args) => apiGetMock(...args),
    post: vi.fn(),
    postForm: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    download: vi.fn(),
  },
  resolveMediaUrl: (value) => value,
}))

vi.mock('vue-router', async () => {
  const actual = await vi.importActual('vue-router')
  return {
    ...actual,
    useRoute: () => ({
      query: {},
      params: {},
      fullPath: '/operador/dashboard',
    }),
    useRouter: () => ({
      replace: replaceMock,
      push: pushMock,
      currentRoute: {
        value: {
          fullPath: '/operador/dashboard',
        },
      },
    }),
  }
})

vi.mock('../stores/auth', () => ({
  useAuthStore: () => ({
    initialized: true,
    initializing: false,
    isAuthenticated: true,
    user: {
      id: 21,
      name: 'Proveedor Test',
      provider_id: 88,
      operational_role: 'provider',
      roles: [{ code: 'provider' }],
      ownedProvider: {
        id: 88,
        company_name: 'Sky Group Ops',
        approval_status: 'approved',
        admin_validation_status: 'approved',
        operator_status: 'validated',
        access_enabled: true,
      },
    },
    access: {
      effective_role: 'provider',
      roles: ['provider'],
    },
    loginContext: {
      effective_role: 'provider',
      roles: ['provider'],
    },
    providerId: 88,
    clearAuth: clearAuthMock,
    revalidateSession: revalidateSessionMock,
  }),
}))

vi.mock('../stores/ui', () => ({
  useUiStore: () => ({
    pushToast: pushToastMock,
  }),
}))

vi.mock('../features/admin/adminReservationsApi', () => ({
  getAdminReservations: vi.fn(async () => []),
}))

let useOperatorPortalSetup

beforeAll(async () => {
  const module = await import('../features/operator/portal/portalOperador.configuracion')
  useOperatorPortalSetup = module.useOperatorPortalSetup
})

describe('operator portal bootstrap auth handling', () => {
  beforeEach(() => {
    requestWithCandidatesMock.mockReset()
    apiGetMock.mockReset()
    pushToastMock.mockReset()
    replaceMock.mockReset()
    pushMock.mockReset()
    clearAuthMock.mockReset()
    revalidateSessionMock.mockReset()
  })

  function buildHarness() {
    return defineComponent({
      props: {
        section: {
          type: String,
          default: 'dashboard',
        },
      },
      setup(props) {
        return useOperatorPortalSetup(props)
      },
      template: '<div />',
    })
  }

  it('keeps the session active when operational endpoints fail with 401 but /auth/me stays valid', async () => {
    requestWithCandidatesMock
      .mockResolvedValueOnce({
        provider: {
          id: 88,
          company_name: 'Sky Group Ops',
          approval_status: 'approved',
          admin_validation_status: 'approved',
          operator_status: 'validated',
          access_enabled: true,
        },
      })
      .mockRejectedValueOnce(Object.assign(new Error('Unauthorized aircraft'), { status: 401 }))

    apiGetMock.mockRejectedValueOnce(Object.assign(new Error('Unauthorized requests'), { status: 401 }))
    revalidateSessionMock.mockResolvedValue({ id: 21 })

    const wrapper = mount(buildHarness(), {
      props: {
        section: 'dashboard',
      },
    })

    await flushPromises()
    await flushPromises()

    expect(revalidateSessionMock).toHaveBeenCalledTimes(1)
    expect(clearAuthMock).not.toHaveBeenCalled()
    expect(replaceMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'acceso' }),
    )
    expect(pushToastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'No se pudo cargar la informacion operativa',
      }),
    )
    expect(wrapper.vm.operationalInfoBubble.visible).toBe(true)
    expect(wrapper.vm.operationalInfoBubble.title).toBe('No se pudo cargar la informacion operativa')
  })

  it('cleans the session only when the explicit session revalidation also returns 401', async () => {
    requestWithCandidatesMock
      .mockResolvedValueOnce({
        provider: {
          id: 88,
          company_name: 'Sky Group Ops',
          approval_status: 'approved',
          admin_validation_status: 'approved',
          operator_status: 'validated',
          access_enabled: true,
        },
      })
      .mockRejectedValueOnce(Object.assign(new Error('Unauthorized aircraft'), { status: 401 }))

    apiGetMock.mockRejectedValueOnce(Object.assign(new Error('Unauthorized requests'), { status: 401 }))
    revalidateSessionMock.mockRejectedValueOnce(Object.assign(new Error('Unauthenticated.'), { status: 401 }))

    mount(buildHarness(), {
      props: {
        section: 'dashboard',
      },
    })

    await flushPromises()
    await flushPromises()

    expect(revalidateSessionMock).toHaveBeenCalledTimes(1)
    expect(clearAuthMock).toHaveBeenCalledTimes(1)
  })
})
