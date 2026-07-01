/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'

const {
  routeMock,
  routerMock,
  pushToastMock,
  subscribeWorkflowSyncMock,
  authStoreMock,
  getClientTripsMock,
  getClientTripMock,
  getClientDestinationsMock,
  getClientFlightPackagesMock,
  getClientAccessStatusMock,
  getClientAccessPaymentSuccessMock,
  saveClientAssistedPaymentMock,
} = vi.hoisted(() => ({
  routeMock: {
    params: { id: 'res-1' },
    query: {},
  },
  routerMock: {
    push: vi.fn(),
    replace: vi.fn(),
  },
  pushToastMock: vi.fn(),
  subscribeWorkflowSyncMock: vi.fn(() => vi.fn()),
  authStoreMock: {
    user: {
      id: 'user-1',
      name: 'Cliente Prueba',
      email: 'cliente@skygroup.com',
      phone: '5555555555',
    },
    access: {
      commercial_access: {
        has_paid_access: true,
        remaining_free_quotes: 1,
        free_quotes_used: 0,
        status: 'active',
      },
    },
    userName: 'Cliente Prueba',
    refreshSession: vi.fn(),
    logout: vi.fn(),
  },
  getClientTripsMock: vi.fn(),
  getClientTripMock: vi.fn(),
  getClientDestinationsMock: vi.fn(),
  getClientFlightPackagesMock: vi.fn(),
  getClientAccessStatusMock: vi.fn(),
  getClientAccessPaymentSuccessMock: vi.fn(),
  saveClientAssistedPaymentMock: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => routerMock,
}))

vi.mock('../stores/auth', () => ({
  useAuthStore: () => authStoreMock,
}))

vi.mock('../stores/ui', () => ({
  useUiStore: () => ({
    pushToast: pushToastMock,
  }),
}))

vi.mock('../lib/workflowSync', () => ({
  subscribeWorkflowSync: subscribeWorkflowSyncMock,
}))

vi.mock('../services/contractApi', () => ({
  buildContractResultUrl: vi.fn(() => ''),
  clearPendingContractContext: vi.fn(),
  contractApi: {
    getContractStatus: vi.fn(),
  },
  generateAndSendContract: vi.fn(),
  normalizeContractFrontendState: vi.fn((value = {}) => value?.frontend_state || {}),
  persistPendingContractContext: vi.fn(),
  readPendingContractContext: vi.fn(() => null),
}))

vi.mock('../features/client/clientBookingApi', () => ({
  cancelClientAccessPayment: vi.fn(),
  createClientAccessCheckout: vi.fn(),
  createClientCheckout: vi.fn(),
  createClientFlightRequest: vi.fn(),
  createClientPaymentIntent: vi.fn(),
  ensureClientReservation: vi.fn(),
  getClientAccessPaymentSuccess: getClientAccessPaymentSuccessMock,
  getClientAccessStatus: getClientAccessStatusMock,
  getClientDestinations: getClientDestinationsMock,
  getClientFlightPackages: getClientFlightPackagesMock,
  getClientTrip: getClientTripMock,
  getClientTrips: getClientTripsMock,
  markClientTripPaymentConfirmed: vi.fn(),
  markClientTripReadyForPayment: vi.fn(),
  normalizeTrip: vi.fn((value) => value),
  saveClientAssistedPayment: saveClientAssistedPaymentMock,
  searchClientFlights: vi.fn(),
  uploadClientPaymentProof: vi.fn(),
}))

import PortalClienteVista from '../features/client/portal/PortalClienteVista.vue'

function buildReservation(overrides = {}) {
  return {
    id: 'res-1',
    flight_request_id: 'fr-1',
    status: 'payment_pending',
    workflow_status: 'contrato firmado',
    payment_status: 'pending',
    flight_cost: 12000,
    administrative_fee: 350,
    total_amount: 12350,
    passengers: 2,
    origin: 'TLC',
    destination: 'MTY',
    date: '2026-07-20T09:00:00',
    frontend_state: {
      ready_for_payment: true,
    },
    ...overrides,
  }
}

async function mountView() {
  const wrapper = shallowMount(PortalClienteVista, {
    props: {
      section: 'pago',
    },
    global: {
      stubs: {
        ActiveTrips: true,
        ClientContractPreview: true,
        ClientTopNav: true,
        ConciergeFloatingButton: true,
        FlightSearchHero: true,
      },
    },
  })

  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()

  routeMock.params.id = 'res-1'
  routeMock.query = {}

  getClientTripsMock.mockResolvedValue([buildReservation()])
  getClientTripMock.mockResolvedValue(buildReservation())
  getClientDestinationsMock.mockResolvedValue([])
  getClientFlightPackagesMock.mockResolvedValue([{ code: 'essential', name: 'Essential' }])
  getClientAccessStatusMock.mockResolvedValue({
    commercial_access: {
      has_paid_access: true,
      remaining_free_quotes: 1,
      free_quotes_used: 0,
      status: 'active',
    },
  })
  getClientAccessPaymentSuccessMock.mockResolvedValue({})
  saveClientAssistedPaymentMock.mockResolvedValue({
    id: 'res-1',
    flight_request_id: 'fr-1',
    payment_order: {
      reference: 'REF-123',
    },
  })

  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({ success: true }),
  })
})

describe('PortalClienteVista assisted payment notifications', () => {
  it('hydrates the selected reservation when the list payload arrives without aircraft image', async () => {
    getClientTripsMock.mockResolvedValue([
      buildReservation({
        aircraft: 'LEARJET 31A',
        aircraft_model: 'LEARJET 31A',
        aircraft_image: '',
        summary_only: false,
      }),
    ])
    getClientTripMock.mockResolvedValue(
      buildReservation({
        aircraft: 'LEARJET 31A',
        aircraft_model: 'LEARJET 31A',
        aircraft_image: 'https://example.com/learjet-31a.png',
      }),
    )

    await mountView()

    expect(getClientTripMock).toHaveBeenCalledWith(
      'fr-1',
      expect.objectContaining({
        timeoutMs: expect.any(Number),
      }),
    )
  })

  it('sends the assisted payment invoice email after registering the order', async () => {
    const wrapper = await mountView()

    wrapper.vm.selectedPaymentMethod = 'assisted'
    wrapper.vm.paymentForm.contactEmail = 'pagos@cliente.com'

    await wrapper.vm.handlePaymentSubmit()
    await flushPromises()

    expect(saveClientAssistedPaymentMock).toHaveBeenCalledWith(
      'res-1',
      expect.objectContaining({
        reservation_id: 'res-1',
        flight_request_id: 'fr-1',
        contact_email: 'pagos@cliente.com',
        payment_method: 'assisted_cash',
      }),
      expect.any(Object),
    )
    expect(global.fetch).toHaveBeenCalledTimes(1)

    const [endpoint, requestOptions] = global.fetch.mock.calls[0]

    expect(endpoint).toBe('https://redskyg.com/renta/send_payment_invoice.php')
    expect(requestOptions.method).toBe('POST')
    expect(requestOptions.body.get('reservation_id')).toBe('res-1')
    expect(requestOptions.body.get('flight_request_id')).toBe('fr-1')
    expect(requestOptions.body.get('payment_intent_id')).toBe('REF-123')
    expect(requestOptions.body.get('payment_status')).toBe('pending_manual_payment')
    expect(requestOptions.body.get('customer_email')).toBe('pagos@cliente.com')

    expect(pushToastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: 'success',
        title: 'Pago asistido registrado',
      }),
    )
  })

  it('keeps the assisted payment flow active when the email notification fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn(),
    })

    const wrapper = await mountView()

    wrapper.vm.selectedPaymentMethod = 'assisted'
    wrapper.vm.paymentForm.contactEmail = 'pagos@cliente.com'

    await wrapper.vm.handlePaymentSubmit()
    await flushPromises()

    expect(saveClientAssistedPaymentMock).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(pushToastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: 'warning',
        title: 'Pago asistido registrado',
        message: expect.stringContaining('correo no pudo enviarse'),
      }),
    )
  })
})
