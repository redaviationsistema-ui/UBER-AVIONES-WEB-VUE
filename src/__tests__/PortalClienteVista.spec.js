/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'

const {
  routeMock,
  routerMock,
  pushToastMock,
  subscribeWorkflowSyncMock,
  authStoreMock,
  sendToDocuSignMock,
  generateAndSendContractMock,
  persistPendingContractContextMock,
  getClientTripsMock,
  getClientTripMock,
  getClientReservationMock,
  getClientDestinationsMock,
  getClientFlightPackagesMock,
  getClientAccessStatusMock,
  getClientAccessPaymentSuccessMock,
  ensureClientReservationMock,
  saveClientAssistedPaymentMock,
  createClientFlightRequestMock,
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
  sendToDocuSignMock: vi.fn(),
  generateAndSendContractMock: vi.fn(),
  persistPendingContractContextMock: vi.fn(),
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
  getClientReservationMock: vi.fn(),
  getClientDestinationsMock: vi.fn(),
  getClientFlightPackagesMock: vi.fn(),
  getClientAccessStatusMock: vi.fn(),
  getClientAccessPaymentSuccessMock: vi.fn(),
  ensureClientReservationMock: vi.fn(),
  saveClientAssistedPaymentMock: vi.fn(),
  createClientFlightRequestMock: vi.fn(),
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
    sendToDocuSign: sendToDocuSignMock,
    getContractStatus: vi.fn(),
  },
  generateAndSendContract: generateAndSendContractMock,
  normalizeContractFrontendState: vi.fn((value = {}) => value?.frontend_state || {}),
  persistPendingContractContext: persistPendingContractContextMock,
  readPendingContractContext: vi.fn(() => null),
}))

vi.mock('../features/client/clientBookingApi', () => ({
  cancelClientAccessPayment: vi.fn(),
  createClientAccessCheckout: vi.fn(),
  createClientCheckout: vi.fn(),
  createClientFlightRequest: createClientFlightRequestMock,
  createClientPaymentIntent: vi.fn(),
  ensureClientReservation: ensureClientReservationMock,
  getClientAccessPaymentSuccess: getClientAccessPaymentSuccessMock,
  getClientAccessStatus: getClientAccessStatusMock,
  getClientDestinations: getClientDestinationsMock,
  getClientFlightPackages: getClientFlightPackagesMock,
  getClientReservation: getClientReservationMock,
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

async function mountView(props = { section: 'pago' }) {
  const wrapper = shallowMount(PortalClienteVista, {
    props,
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
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()

  routeMock.params.id = 'res-1'
  routeMock.query = {}

  getClientTripsMock.mockResolvedValue([buildReservation()])
  getClientTripMock.mockResolvedValue(buildReservation())
  getClientReservationMock.mockResolvedValue(buildReservation())
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
  ensureClientReservationMock.mockResolvedValue({
    reservation: {
      id: 'res-1',
      flight_request_id: 'fr-1',
      workflow_status: 'contrato pendiente',
    },
  })
  saveClientAssistedPaymentMock.mockResolvedValue({
    id: 'res-1',
    flight_request_id: 'fr-1',
    payment_order: {
      reference: 'REF-123',
    },
  })
  createClientFlightRequestMock.mockResolvedValue({
    flight_request: {
      id: 'fr-created-1',
      flight_request_id: 'fr-created-1',
      workflow_status: 'provider_pending',
      payment_status: 'pending',
    },
  })

  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({ success: true }),
  })
  global.requestAnimationFrame = vi.fn((callback) => {
    callback()
    return 1
  })
  global.cancelAnimationFrame = vi.fn()
  sendToDocuSignMock.mockResolvedValue({
    signing_url: 'https://demo.docusign.net/Signing/start',
    docusign_status: 'sent',
    contract: {
      id: 'contract-1',
    },
  })
  generateAndSendContractMock.mockResolvedValue({
    signing_url: 'https://demo.docusign.net/Signing/start',
    docusign_status: 'sent',
    contract: {
      id: 'contract-1',
    },
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

describe('PortalClienteVista contract bootstrap', () => {
  it('auto-creates the reservation when contract opens from a flight request context', async () => {
    routeMock.params.id = 'fr-77'

    getClientTripsMock.mockResolvedValue([
      buildReservation({
        id: 'fr-77',
        flight_request_id: '',
        is_reservation: false,
        status: 'provider_accepted',
        workflow_status: 'contrato pendiente',
      }),
    ])
    ensureClientReservationMock.mockResolvedValue({
      data: {
        reservation: {
          id: 'res-77',
          flight_request_id: 'fr-77',
          workflow_status: 'contrato pendiente',
        },
      },
    })

    await mountView({ section: 'contrato' })

    expect(ensureClientReservationMock).toHaveBeenCalledWith(
      { flight_request_id: 'fr-77' },
      expect.objectContaining({ timeoutMs: 20000 }),
    )
    expect(routerMock.push).toHaveBeenCalledWith({
      name: 'cliente-detalle',
      params: { section: 'contrato', id: 'res-77' },
    })
  })

  it('hydrates a direct contract route from reservation detail when the list payload misses that reservation', async () => {
    routeMock.params.id = '25'

    getClientTripsMock.mockResolvedValue([
      buildReservation({
        id: '161',
        flight_request_id: '',
        is_reservation: false,
        status: 'provider_accepted',
        workflow_status: 'contrato pendiente',
      }),
    ])
    getClientReservationMock.mockResolvedValue(
      buildReservation({
        id: '25',
        flight_request_id: '161',
        is_reservation: true,
        status: 'pending_payment',
        workflow_status: 'contrato pendiente',
      }),
    )

    await mountView({ section: 'contrato' })

    expect(getClientReservationMock).toHaveBeenCalledWith(
      '25',
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    )
    expect(routerMock.push).not.toHaveBeenCalledWith({
      name: 'cliente',
      params: { section: 'viajes' },
    })
  })

  it('forwards the persisted backend contract payload when the contract already exists', async () => {
    const wrapper = await mountView({ section: 'contrato' })

    await wrapper.vm.handleContractConfirm({
      contract_id: 'contract-1',
      document_source: 'backend_contract_snapshot',
      full_contract_html: '<html><body>Contrato backend</body></html>',
      contract_snapshot: {
        final_price: '$12,350.00',
      },
    })
    await flushPromises()

    expect(generateAndSendContractMock).toHaveBeenCalledWith(
      expect.objectContaining({
        full_contract_html: '<html><body>Contrato backend</body></html>',
        document_source: 'backend_contract_snapshot',
      }),
      expect.objectContaining({ timeoutMs: 120000 }),
    )
    expect(sendToDocuSignMock).not.toHaveBeenCalled()
    expect(persistPendingContractContextMock).toHaveBeenCalled()
  })
})

describe('PortalClienteVista reservation availability safeguards', () => {
  it('blocks reservation immediately when the selected aircraft is already unavailable', async () => {
    const wrapper = await mountView({ section: 'reservar' })

    await wrapper.vm.requestReservation({
      id: 'aircraft-1',
      aircraft: 'Learjet 31A',
      is_available: false,
    })

    expect(createClientFlightRequestMock).not.toHaveBeenCalled()
    expect(wrapper.vm.serverSearchError).toBe(
      'La aeronave ya no está disponible para ese horario. Por favor selecciona otra opción.',
    )
    expect(pushToastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: 'error',
        title: 'Aeronave no disponible',
        message: 'La aeronave ya no está disponible para ese horario. Por favor selecciona otra opción.',
      }),
    )
  })

  it('shows the availability conflict message when backend returns HTTP 409 AIRCRAFT_NOT_AVAILABLE', async () => {
    createClientFlightRequestMock.mockRejectedValueOnce({
      status: 409,
      message: 'Conflict',
      payload: {
        code: 'AIRCRAFT_NOT_AVAILABLE',
      },
    })

    const wrapper = await mountView({ section: 'reservar' })

    await wrapper.vm.requestReservation({
      id: 'aircraft-2',
      aircraft: 'Citation XLS',
      cabin: 'Citation XLS',
      is_available: true,
      provider_id: 22,
      aircraft_id: 77,
    })
    await flushPromises()

    expect(pushToastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: 'error',
        title: 'No se pudo solicitar la reserva',
        message: 'La aeronave ya no está disponible para ese horario. Por favor selecciona otra opción.',
      }),
    )
    expect(wrapper.vm.serverSearchError).toBe(
      'La aeronave ya no está disponible para ese horario. Por favor selecciona otra opción.',
    )
  })
})
