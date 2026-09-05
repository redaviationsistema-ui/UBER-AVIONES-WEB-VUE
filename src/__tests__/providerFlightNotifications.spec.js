/* @vitest-environment jsdom */

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, provide } from 'vue'
import PortalOperadorAlertas from '../features/operator/portal/secciones/PortalOperadorAlertas.vue'
import PortalOperadorDashboardSection from '../features/operator/portal/secciones/PortalOperadorDashboardSection.vue'

const pushToastMock = vi.fn()
const replaceMock = vi.fn()
const pushMock = vi.fn()
const clearAuthMock = vi.fn()
const revalidateSessionMock = vi.fn()

const requestWithCandidatesMock = vi.fn()
const apiGetMock = vi.fn()
const apiPatchMock = vi.fn()
const listeners = new Map()
const audioMock = vi.fn()
const browserMock = vi.fn()
const channel = { subscribed: () => channel, listen: (name, callback) => { listeners.set(name, callback); return channel }, error: () => channel }

vi.mock('../plugins/echo', () => ({
  echo: { private: () => channel, leave: vi.fn() },
  isEchoConfigured: () => true,
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
    patch: (...args) => apiPatchMock(...args),
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


let wrappers = []
let rows = []
let requestRows = []
let nextId = 300

function payload(type = 'flight.confirmed', requestId = nextId) {
  return {
    type, notification_id: requestId + 1000, provider_id: 88,
    flight_request_id: requestId, request_id: requestId,
    event_key: `provider:88:flight:${requestId}:${type === 'flight.confirmed' ? 'flight-confirmed' : 'request-created'}`,
    workflow_status: type === 'flight.confirmed' ? 'vuelo confirmado' : 'provider_pending',
    payment_status: type === 'flight.confirmed' ? 'paid' : 'pending',
    route: 'MMTO → MMMM → MMTO', origin: 'MMTO', destination: 'MMMM',
    occurred_at: new Date().toISOString(),
  }
}
function row(data) {
  return { id: data.notification_id, type: data.type, payload: data, idempotency_key: data.event_key, read_at: null }
}
async function boot(section = 'dashboard') {
  const harness = defineComponent({
    components: { PortalOperadorAlertas, PortalOperadorDashboardSection },
    props: { section: { type: String, default: 'dashboard' } },
    setup(props) { const portal = useOperatorPortalSetup(props); provide('operatorPortalContext', portal); return portal },
    template: '<div><PortalOperadorAlertas /><PortalOperadorDashboardSection v-if="section === \'dashboard\'" /></div>',
  })
  const wrapper = mount(harness, { props: { section } })
  wrappers.push(wrapper)
  await flushPromises()
  await flushPromises()
  window.dispatchEvent(new Event('pointerdown'))
  return wrapper
}

beforeEach(() => {
  nextId += 1
  rows = []
  requestRows = [{ id: nextId, workflow_status: 'vuelo confirmado', payment_status: 'paid', provider_id: 88 }]
  const storage = new Map()
  vi.stubGlobal('localStorage', {
    get length() { return storage.size }, key: (index) => [...storage.keys()][index],
    getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key), clear: () => storage.clear(),
  })
  listeners.clear()
  pushToastMock.mockReset()
  apiGetMock.mockReset()
  apiPatchMock.mockReset()
  browserMock.mockReset()
  audioMock.mockReset()
  requestWithCandidatesMock.mockReset()
  requestWithCandidatesMock.mockImplementation(async (candidates) => {
    if (candidates[0].path === '/proveedor/dashboard') return { provider: {
      id: 88, company_name: 'Sky Group Ops', approval_status: 'approved', admin_validation_status: 'approved',
      operator_status: 'validated', access_enabled: true,
    } }
    return { aircraft: [] }
  })
  apiGetMock.mockImplementation(async (path, options = {}) => {
    if (path === '/proveedor/notificaciones') {
      const page = options.query?.page || 1
      return { notifications: { data: rows.slice((page - 1) * 100, page * 100), last_page: Math.max(1, Math.ceil(rows.length / 100)) }, unread_count: rows.filter((item) => !item.read_at).length }
    }
    if (path.startsWith('/proveedor/solicitudes/')) return { flight_request: requestRows.find((item) => String(item.id) === path.split('/').at(-1)) }
    return { requests: requestRows }
  })
  apiPatchMock.mockImplementation(async (path) => {
    const at = new Date().toISOString()
    if (path === '/notifications/read-all') rows.forEach((item) => { item.read_at = at })
    else {
      const item = rows.find((item) => String(item.id) === path.split('/').at(-2))
      if (item) item.read_at = at
    }
    return { notification: { read_at: at } }
  })
  class BrowserNotice {
    static permission = 'granted'
    constructor(...args) { browserMock(...args); this.close = vi.fn() }
  }
  vi.stubGlobal('Notification', BrowserNotice)
  vi.stubGlobal('AudioContext', class {
    constructor() { audioMock(); this.currentTime = 0; this.destination = {} }
    createOscillator() { return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} } }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} } }
    close() {}
  })
})
afterEach(() => { wrappers.forEach((wrapper) => wrapper.unmount()); wrappers = []; vi.unstubAllGlobals() })

describe('provider notification end-to-end frontend behavior', () => {
  it('keeps polling and recovers notifications after a temporary request connection failure', async () => {
    const wrapper = await boot()
    const clearTimer = vi.spyOn(globalThis, 'clearInterval')
    const get = apiGetMock.getMockImplementation()
    try {
      apiGetMock.mockImplementation((path, options) => {
        if (path !== '/proveedor/notificaciones') return Promise.reject(new TypeError('Failed to fetch'))
        return get(path, options)
      })
      rows = [row(payload())]
      await wrapper.vm.refreshRequestsList({ silent: true, force: true })
      expect(clearTimer).not.toHaveBeenCalled()
      expect(wrapper.vm.unreadRealtimeNotifications).toBe(1)
      expect(browserMock).not.toHaveBeenCalled()
      expect(audioMock).not.toHaveBeenCalled()
      apiGetMock.mockImplementation(get)
      await wrapper.vm.refreshRequestsList({ silent: true, force: true })
      expect(wrapper.vm.unreadRealtimeNotifications).toBe(1)
    } finally {
      apiGetMock.mockImplementation(get)
      clearTimer.mockRestore()
    }
  })
  it('shows confirmed in dashboard and Alertas while in coordination', async () => {
    rows = [row(payload())]
    const wrapper = await boot()
    expect(wrapper.vm.confirmedFlightNotifications).toHaveLength(1)
    expect(wrapper.vm.activeRealtimeNotifications).toHaveLength(1)
    expect(wrapper.vm.unreadRealtimeNotifications).toBe(1)
    expect(wrapper.find('button[aria-label="Abrir notificaciones"]').exists()).toBe(true)
    await wrapper.vm.toggleRealtimeNotifications()
    expect(document.body.textContent).toContain('Vuelo confirmado')
    expect(document.body.textContent).toContain('MMTO → MMMM → MMTO')
    expect(browserMock).not.toHaveBeenCalled()
    expect(audioMock).not.toHaveBeenCalled()
    expect(pushToastMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Vuelo confirmado' }))
  })

  it('reconciles duplicate Echo plus HTTP without repeating live effects', async () => {
    const wrapper = await boot()
    const data = payload()
    const listener = listeners.get('.flight.confirmed')
    listener(data)
    listener(data)
    await flushPromises()
    rows = [row(data)]
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(wrapper.vm.realtimeNotifications).toHaveLength(1)
    expect(wrapper.vm.realtimeNotifications[0].backendNotificationId).toBe(data.notification_id)
    expect(browserMock).toHaveBeenCalledTimes(1)
    expect(audioMock).toHaveBeenCalledTimes(1)
    expect(pushToastMock.mock.calls.filter(([item]) => item.title === 'Vuelo confirmado')).toHaveLength(1)
    expect(browserMock).toHaveBeenCalledWith('Red Aviation — Vuelo confirmado', expect.objectContaining({ tag: 'flight-confirmed-302' }))
  })

  it('keeps request-created working and distinct from confirmation for the same flight', async () => {
    requestRows[0].workflow_status = 'provider_pending'
    const wrapper = await boot('solicitudes')
    listeners.get('.flight.request.created')(payload('flight.request.created'))
    listeners.get('.flight.confirmed')(payload())
    await flushPromises()
    expect(wrapper.vm.realtimeNotifications).toHaveLength(2)
    expect(wrapper.vm.unreadRealtimeNotifications).toBe(2)
    expect(browserMock).toHaveBeenCalledTimes(2)
  })

  it('persists read through real API paths and preserves it after remount', async () => {
    rows = [row(payload())]
    const wrapper = await boot()
    await wrapper.vm.markRealtimeNotificationRead(rows[0].payload.event_key)
    expect(apiPatchMock).toHaveBeenCalledWith(`/notifications/${rows[0].id}/read`)
    expect(wrapper.vm.unreadRealtimeNotifications).toBe(0)
    wrapper.unmount()
    const reloaded = await boot()
    expect(reloaded.vm.unreadRealtimeNotifications).toBe(0)
    expect(reloaded.vm.realtimeNotifications[0].readAt).toBeTruthy()
  })

  it('marks all through the bulk endpoint, including beyond the first page', async () => {
    rows = Array.from({ length: 105 }, (_, index) => row(payload('flight.confirmed', nextId + index)))
    const wrapper = await boot()
    expect(wrapper.vm.unreadRealtimeNotifications).toBe(105)
    await wrapper.vm.markAllRealtimeNotificationsRead()
    expect(apiPatchMock).toHaveBeenCalledWith('/notifications/read-all', { types: ['flight.request.created', 'flight.confirmed'] })
    expect(wrapper.vm.unreadRealtimeNotifications).toBe(0)
    expect(apiGetMock.mock.calls.some(([, options]) => options?.query?.page === 2)).toBe(true)
  })

  it('does not claim read success if persistence fails', async () => {
    rows = [row(payload())]
    const wrapper = await boot()
    apiPatchMock.mockRejectedValueOnce(new Error('Offline'))
    await wrapper.vm.markRealtimeNotificationRead(rows[0].payload.event_key)
    expect(wrapper.vm.unreadRealtimeNotifications).toBe(1)
    expect(pushToastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'No se pudo marcar como leída' }))
  })

  it('handles denied browser permission and constructor errors without losing alerts', async () => {
    const wrapper = await boot()
    Notification.permission = 'denied'
    listeners.get('.flight.confirmed')(payload())
    await flushPromises()
    expect(browserMock).not.toHaveBeenCalled()
    Notification.permission = 'granted'
    browserMock.mockImplementationOnce(() => { throw new Error('Unsupported browser') })
    listeners.get('.flight.confirmed')(payload('flight.confirmed', nextId + 1))
    await flushPromises()
    expect(wrapper.vm.realtimeNotifications).toHaveLength(2)
  })

  it('opens the exact flight through detail and then the solicitudes section', async () => {
    rows = [row(payload())]
    const wrapper = await boot()
    await wrapper.vm.openRealtimeNotification(wrapper.vm.realtimeNotifications[0])
    expect(apiGetMock).toHaveBeenCalledWith(`/proveedor/solicitudes/${nextId}`)
    expect(pushMock).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ section: 'solicitudes' }), query: expect.objectContaining({ request: String(nextId) }) }))
  })
})
