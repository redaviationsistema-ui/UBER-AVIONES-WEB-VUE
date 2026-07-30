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
  getClientReservationPaymentAvailabilityMock,
  getClientDestinationsMock,
  getClientFlightPackagesMock,
  getClientAccessStatusMock,
  getClientAccessPaymentSuccessMock,
  getClientReservationCheckoutSuccessMock,
  ensureClientReservationMock,
  saveClientAssistedPaymentMock,
  searchClientFlightsMock,
  createClientAccessCheckoutMock,
  createClientFlightRequestMock,
  createClientAircraftHoldMock,
  validateClientAircraftHoldMock,
  releaseClientAircraftHoldMock,
  createClientCheckoutMock,
} = vi.hoisted(() => ({
  routeMock: {
    params: { id: 'res-1' },
    query: {},
  },
  routerMock: {
    push: vi.fn(),
    replace: vi.fn(),
    resolve: vi.fn((location = {}) => {
      const section = location?.params?.section ? `/${location.params.section}` : ''
      const id = location?.params?.id ? `/${location.params.id}` : ''
      const query = new URLSearchParams(location?.query || {}).toString()
      return {
        href: `/renta${section}${id}${query ? `?${query}` : ''}`,
      }
    }),
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
    syncUserContext: vi.fn(),
  },
  getClientTripsMock: vi.fn(),
  getClientTripMock: vi.fn(),
  getClientReservationMock: vi.fn(),
  getClientReservationPaymentAvailabilityMock: vi.fn(),
  getClientDestinationsMock: vi.fn(),
  getClientFlightPackagesMock: vi.fn(),
  getClientAccessStatusMock: vi.fn(),
  getClientAccessPaymentSuccessMock: vi.fn(),
  getClientReservationCheckoutSuccessMock: vi.fn(),
  ensureClientReservationMock: vi.fn(),
  saveClientAssistedPaymentMock: vi.fn(),
  searchClientFlightsMock: vi.fn(),
  createClientAccessCheckoutMock: vi.fn(),
  createClientFlightRequestMock: vi.fn(),
  createClientAircraftHoldMock: vi.fn(),
  validateClientAircraftHoldMock: vi.fn(),
  releaseClientAircraftHoldMock: vi.fn(),
  createClientCheckoutMock: vi.fn(),
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
  buildFlightRequestPayload: vi.fn((payload = {}) => ({
    ...payload,
    departure_date: '2026-07-20',
    departure_time: '09:00',
    departure_datetime: '2026-07-20T09:00:00',
    start_date: '2026-07-20',
    start_time: '09:00',
    start_datetime: '2026-07-20T09:00:00',
    return_datetime: null,
  })),
  cancelClientAccessPayment: vi.fn(),
  createClientAircraftHold: createClientAircraftHoldMock,
  createClientAccessCheckout: createClientAccessCheckoutMock,
  createClientCheckout: createClientCheckoutMock,
  createClientFlightRequest: createClientFlightRequestMock,
  createClientPaymentIntent: vi.fn(),
  ensureClientReservation: ensureClientReservationMock,
  getClientAccessPaymentSuccess: getClientAccessPaymentSuccessMock,
  getClientAccessStatus: getClientAccessStatusMock,
  getClientDestinations: getClientDestinationsMock,
  getClientFlightPackages: getClientFlightPackagesMock,
  getClientReservation: getClientReservationMock,
  getClientReservationPaymentAvailability: getClientReservationPaymentAvailabilityMock,
  getClientReservationCheckoutSuccess: getClientReservationCheckoutSuccessMock,
  getClientTrip: getClientTripMock,
  getClientTrips: getClientTripsMock,
  markClientTripPaymentConfirmed: vi.fn(),
  markClientTripReadyForPayment: vi.fn(),
  normalizeTrip: vi.fn((value) => value),
  releaseClientAircraftHold: releaseClientAircraftHoldMock,
  saveClientAssistedPayment: saveClientAssistedPaymentMock,
  searchClientFlights: searchClientFlightsMock,
  uploadClientPaymentProof: vi.fn(),
  validateClientAircraftHold: validateClientAircraftHoldMock,
}))

import PortalClienteVista from '../features/client/portal/PortalClienteVista.vue'
import ViajesActivos from '../features/client/viajes/ViajesActivos.vue'

function buildReservation(overrides = {}) {
  return {
    id: 'res-1',
    flight_request_id: 'fr-1',
    is_reservation: true,
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
  routeMock.params.subsection = undefined
  routeMock.query = {}
  authStoreMock.user = {
    id: 'user-1',
    name: 'Cliente Prueba',
    email: 'cliente@skygroup.com',
    phone: '5555555555',
  }
  authStoreMock.userName = 'Cliente Prueba'
  authStoreMock.access = {
    commercial_access: {
      has_paid_access: true,
      remaining_free_quotes: 1,
      free_quotes_used: 0,
      status: 'active',
    },
  }

  getClientTripsMock.mockResolvedValue([buildReservation()])
  getClientTripMock.mockResolvedValue(buildReservation())
  getClientReservationMock.mockResolvedValue(buildReservation())
  getClientReservationPaymentAvailabilityMock.mockResolvedValue({
    success: true,
    can_pay: true,
    hold_valid: true,
    reservation_booked: false,
    invalid_reason: null,
    hold: {
      id: 'hold-1',
      status: 'held',
      aircraft_id: '77',
      quote_id: '123',
      flight_request_id: 'fr-1',
      reservation_id: 'res-1',
      start_at: '2026-07-20T09:00:00Z',
      end_at: '2026-07-20T13:00:00Z',
      expires_at: '2099-07-20T09:15:00Z',
      is_valid: true,
      invalid_reason: null,
    },
    availability: {
      available: true,
      conflict_type: null,
      conflicting_block_id: null,
    },
    schedule: {
      start_at: '2026-07-20T09:00:00Z',
      end_at: '2026-07-20T13:00:00Z',
      source: 'hold_block',
    },
  })
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
  getClientReservationCheckoutSuccessMock.mockResolvedValue({})
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
      accepted_quote: {
        id: 123,
        quote_id: 123,
      },
    },
    accepted_quote: {
      id: 123,
      quote_id: 123,
    },
  })
  createClientAircraftHoldMock.mockResolvedValue({
    hold_id: 'hold-1',
    hold_expires_at: '2099-07-20T09:15:00Z',
    aircraft_id: 77,
  })
  validateClientAircraftHoldMock.mockResolvedValue({
    valid: true,
    hold_id: 'hold-1',
  })
  releaseClientAircraftHoldMock.mockResolvedValue({})
  createClientCheckoutMock.mockResolvedValue({
    checkout_url: 'https://checkout.stripe.com/pay/cs_test_hold_1',
    checkout_session_id: 'cs_test_hold_1',
  })
  createClientAccessCheckoutMock.mockResolvedValue({
    checkout_url: 'https://checkout.stripe.com/pay/cs_test_access_1',
    checkout_session_id: 'cs_test_access_1',
  })
  searchClientFlightsMock.mockResolvedValue([])

  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({ success: true }),
  })
  globalThis.requestAnimationFrame = vi.fn((callback) => {
    callback()
    return 1
  })
  globalThis.cancelAnimationFrame = vi.fn()
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
        summary_only: true,
        is_reservation: true,
      }),
    ])
    getClientReservationMock.mockResolvedValue(
      buildReservation({
        aircraft: 'LEARJET 31A',
        aircraft_model: 'LEARJET 31A',
        aircraft_image: 'https://example.com/learjet-31a.png',
      }),
    )

    await mountView()

    expect(getClientReservationMock).toHaveBeenCalledWith(
      'res-1',
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
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)

    const [endpoint, requestOptions] = globalThis.fetch.mock.calls[0]

    expect(endpoint).toBe('https://redskyg.com/renta/send_payment_invoice.php')
    expect(requestOptions.method).toBe('POST')
    expect(requestOptions.body.get('reservation_id')).toBe('res-1')
    expect(requestOptions.body.get('flight_request_id')).toBe('fr-1')
    expect(requestOptions.body.get('payment_intent_id')).toBe('REF-123')
    expect(requestOptions.body.get('payment_status')).toBeNull()
    expect(requestOptions.body.get('customer_email')).toBe('pagos@cliente.com')

    expect(pushToastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: 'success',
        title: 'Pago asistido registrado',
      }),
    )
  })

  it('keeps the assisted payment flow active when the email notification fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
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
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
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
    getClientReservationMock.mockRejectedValueOnce(new Error('Reservation not found'))
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
        regenerate: false,
      }),
      expect.objectContaining({ timeoutMs: 120000 }),
    )
    expect(sendToDocuSignMock).not.toHaveBeenCalled()
    expect(persistPendingContractContextMock).toHaveBeenCalled()
  })

  it('reuses the existing reservation when contract opens from a locked flight request flow', async () => {
    routeMock.params.id = 'fr-locked'

    getClientTripsMock.mockResolvedValue([
      buildReservation({
        id: 'fr-locked',
        flight_request_id: '',
        is_reservation: false,
        status: 'provider_accepted',
        workflow_status: 'contrato pendiente',
        contract_status: 'generated',
      }),
    ])
    getClientReservationMock.mockResolvedValue(
      buildReservation({
        id: 'res-locked',
        flight_request_id: 'fr-locked',
        is_reservation: true,
        status: 'pending_payment',
        workflow_status: 'contrato pendiente',
        contract_status: 'generated',
      }),
    )

    await mountView({ section: 'contrato' })

    expect(getClientReservationMock).toHaveBeenCalledWith(
      'fr-locked',
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    )
    expect(ensureClientReservationMock).not.toHaveBeenCalled()
    expect(routerMock.push).toHaveBeenCalledWith({
      name: 'cliente-detalle',
      params: { section: 'contrato', id: 'res-locked' },
    })
  })

  it('keeps the contract workflow renderable when reservation detail hydration runs in contract mode', async () => {
    routeMock.params.id = '177'

    getClientTripsMock.mockResolvedValue([
      buildReservation({
        id: '177',
        flight_request_id: '29',
        is_reservation: true,
        summary_only: true,
        status: 'reserved',
        workflow_status: 'contrato pendiente',
      }),
    ])
    getClientReservationMock.mockResolvedValue({
      id: '177',
      flight_request_id: '29',
      status: 'reserved',
      workflow_status: 'contrato pendiente',
      contract: {
        id: 'contract-177',
        status: 'generated',
      },
    })

    const wrapper = await mountView({ section: 'contrato' })

    expect(getClientReservationMock).toHaveBeenCalledWith(
      '177',
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    )
    expect(getClientTripMock).not.toHaveBeenCalledWith(
      '29',
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    )
    expect(wrapper.vm.selectedReservation?.is_reservation).toBe(true)
    expect(wrapper.vm.canRenderReservationWorkflow).toBe(true)
  })

  it('keeps the contract route pinned to the reservation id instead of the flight request id', async () => {
    routeMock.params.id = '177'

    getClientTripsMock.mockResolvedValue([
      buildReservation({
        id: '177',
        flight_request_id: '29',
        is_reservation: true,
        status: 'reserved',
        workflow_status: 'contrato pendiente',
      }),
    ])

    await mountView({ section: 'contrato' })

    expect(routerMock.replace).not.toHaveBeenCalledWith('/cliente/contrato/29')
  })
})

describe('PortalClienteVista reservation availability safeguards', () => {
  it('deduplicates repeated trips that share the same aircraft and departure signature', async () => {
    getClientTripsMock.mockResolvedValue([
      buildReservation({
        id: 'res-101',
        flight_request_id: 'fr-dup-1',
        assigned_aircraft_id: '77',
        aircraft_id: '77',
        origin: 'MMTO',
        destination: 'MMMM',
        date: '2026-07-25T17:00:00',
      }),
      buildReservation({
        id: 'res-102',
        flight_request_id: '',
        assigned_aircraft_id: '77',
        aircraft_id: '77',
        origin: 'MMTO',
        destination: 'MMMM',
        date: '2026-07-25T17:00:00',
      }),
    ])

    const wrapper = await mountView({ section: 'viajes' })

    expect(wrapper.vm.reservations).toHaveLength(1)
  })

  it('blocks reservation immediately when the selected aircraft is already unavailable', async () => {
    const wrapper = await mountView({ section: 'reservar' })

    await wrapper.vm.requestReservation({
      id: 'aircraft-1',
      aircraft: 'Learjet 31A',
      is_available: false,
    })

    expect(createClientFlightRequestMock).not.toHaveBeenCalled()
    expect(wrapper.vm.serverSearchError).toBe(
      'Esta aeronave acaba de dejar de estar disponible para el horario seleccionado. Te mostramos otras opciones.',
    )
    expect(pushToastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: 'error',
        title: 'Aeronave no disponible',
        message:
          'Esta aeronave acaba de dejar de estar disponible para el horario seleccionado. Te mostramos otras opciones.',
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
        title: 'Disponibilidad actualizada',
        message:
          'Esta aeronave acaba de dejar de estar disponible para el horario seleccionado. Te mostramos otras opciones.',
      }),
    )
    expect(wrapper.vm.serverSearchError).toBe(
      'Esta aeronave acaba de dejar de estar disponible para el horario seleccionado. Te mostramos otras opciones.',
    )
  })

  it('marks the trip as unavailable when opening the contract returns AIRCRAFT_NOT_AVAILABLE', async () => {
    routeMock.params.id = 'fr-77'

    getClientTripsMock.mockResolvedValue([
      buildReservation({
        id: 'fr-77',
        flight_request_id: '',
        is_reservation: false,
        status: 'provider_accepted',
        workflow_status: 'contrato pendiente',
        frontend_state: {
          ready_for_payment: false,
        },
      }),
    ])

    ensureClientReservationMock.mockRejectedValueOnce({
      status: 409,
      message: 'Esta aeronave ya no esta disponible para el horario seleccionado.',
      payload: {
        code: 'AIRCRAFT_NOT_AVAILABLE',
      },
    })
    getClientReservationMock.mockRejectedValueOnce(new Error('Reservation not found'))

    const wrapper = await mountView({ section: 'viajes' })

    await wrapper.vm.handleOpenContract('fr-77')
    await flushPromises()

    expect(ensureClientReservationMock).toHaveBeenCalledWith(
      { flight_request_id: 'fr-77' },
      expect.objectContaining({ timeoutMs: 20000 }),
    )
    expect(routerMock.push).not.toHaveBeenCalledWith({
      name: 'cliente-detalle',
      params: { section: 'contrato', id: 'fr-77' },
    })
  })

  it('prevents opening payment when the selected reservation already has an availability conflict', async () => {
    getClientTripsMock.mockResolvedValue([
      buildReservation({
        id: 'res-conflict',
        flight_request_id: 'fr-conflict',
        frontend_state: {
          ready_for_payment: false,
          availability_conflict: true,
          availability_conflict_message:
            'Esta aeronave ya no esta disponible para continuar con el pago.',
        },
      }),
    ])
    routeMock.params.id = 'res-conflict'

    const wrapper = await mountView({ section: 'viajes' })

    wrapper.vm.goToPayment('res-conflict')

    expect(pushToastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: 'warning',
        title: 'Disponibilidad actualizada',
        message: 'Esta aeronave ya no esta disponible para continuar con el pago.',
      }),
    )
    expect(routerMock.push).toHaveBeenCalledWith({
      name: 'cliente',
      params: { section: 'reservar', id: undefined },
    })
  })

  it('disables workflow rendering on contract and payment screens after an availability conflict', async () => {
    getClientTripsMock.mockResolvedValue([
      buildReservation({
        id: 'res-locked',
        flight_request_id: 'fr-locked',
        frontend_state: {
          ready_for_payment: false,
          availability_conflict: true,
          availability_conflict_message:
            'La disponibilidad de esta aeronave cambio y ya no podemos continuar con este flujo.',
        },
      }),
    ])
    routeMock.params.id = 'res-locked'

    const contractWrapper = await mountView({ section: 'contrato' })
    expect(contractWrapper.vm.canRenderReservationWorkflow).toBe(false)

    const paymentWrapper = await mountView({ section: 'pago' })
    expect(paymentWrapper.vm.canRenderReservationWorkflow).toBe(false)
  })

  it('does not re-request the same reservation in a loop after an availability conflict', async () => {
    routeMock.params.id = 'fr-loop'

    getClientTripsMock.mockResolvedValue([
      buildReservation({
        id: 'fr-loop',
        flight_request_id: '',
        is_reservation: false,
        status: 'provider_accepted',
        workflow_status: 'contrato pendiente',
        frontend_state: {
          ready_for_payment: false,
          availability_conflict: true,
          availability_conflict_message:
            'Esta aeronave ya no esta disponible para el horario seleccionado.',
        },
      }),
    ])

    const wrapper = await mountView({ section: 'contrato' })
    await flushPromises()

    expect(wrapper.vm.canRenderReservationWorkflow).toBe(false)
    expect(ensureClientReservationMock).not.toHaveBeenCalled()
  })

  it('navigates to booking search while preserving itinerary after resolving the availability conflict', async () => {
    getClientTripsMock.mockResolvedValue([
      buildReservation({
        id: 'res-search',
        flight_request_id: 'fr-search',
        origin: 'TLC',
        destination: 'MTY',
        date: '2026-07-20T09:00:00',
        passengers: 3,
        aircraft_id: '77',
        frontend_state: {
          availability_conflict: true,
          availability_conflict_message:
            'Esta aeronave ya no esta disponible para el horario seleccionado.',
        },
      }),
    ])
    routeMock.params.id = 'res-search'

    const wrapper = await mountView({ section: 'viajes' })

    await wrapper.vm.handleResolveAvailabilityConflict('res-search')
    await flushPromises()

    expect(routerMock.push).toHaveBeenCalledWith({
      name: 'cliente',
      params: { section: 'reservar' },
    })
    expect(wrapper.vm.searchForm.origin).toBe('TLC')
    expect(wrapper.vm.searchForm.destination).toBe('MTY')
    expect(wrapper.vm.searchForm.departureDate).toBe('2026-07-20')
    expect(wrapper.vm.searchForm.passengers).toBe('3')
  })

  it('keeps the conflicted aircraft out of the visible options after resolving the conflict', async () => {
    getClientTripsMock.mockResolvedValue([
      buildReservation({
        id: 'res-aircraft',
        flight_request_id: 'fr-aircraft',
        aircraft_id: '77',
        frontend_state: {
          availability_conflict: true,
          availability_conflict_message:
            'Esta aeronave ya no esta disponible para el horario seleccionado.',
        },
      }),
    ])
    routeMock.params.id = 'res-aircraft'

    const wrapper = await mountView({ section: 'viajes' })
    wrapper.vm.aircraftOptions = [
      { id: 'aircraft-77', aircraft_id: '77', provider_id: 1, cabin: 'Light Jet' },
      { id: 'aircraft-88', aircraft_id: '88', provider_id: 2, cabin: 'Midsize Jet' },
    ]

    await wrapper.vm.handleResolveAvailabilityConflict('res-aircraft')
    await flushPromises()

    const visibleIds = [
      wrapper.vm.featuredAircraft?.aircraft_id,
      ...wrapper.vm.secondaryAircraftOptions.map((item) => item.aircraft_id),
    ].filter(Boolean)

    expect(visibleIds).not.toContain('77')
  })

  it('persists the flight request before requesting the aircraft hold with the accepted quote', async () => {
    const wrapper = await mountView({ section: 'reservar' })

    await wrapper.vm.requestReservation({
      id: 'aircraft-2',
      aircraft: 'Citation XLS',
      cabin: 'Citation XLS',
      is_available: true,
      provider_id: 22,
      aircraft_id: 77,
    })

    expect(createClientAircraftHoldMock).toHaveBeenCalledTimes(1)
    expect(createClientFlightRequestMock).toHaveBeenCalledTimes(1)
    expect(createClientFlightRequestMock.mock.invocationCallOrder[0]).toBeLessThan(
      createClientAircraftHoldMock.mock.invocationCallOrder[0],
    )
    expect(createClientAircraftHoldMock).toHaveBeenCalledWith(
      expect.objectContaining({
        quote_id: 123,
        aircraft_id: 77,
        departure_date: '2026-07-20',
        departure_datetime: '2026-07-20T09:00:00',
        start_date: '2026-07-20',
        start_datetime: '2026-07-20T09:00:00',
      }),
      expect.any(Object),
    )
    expect(createClientFlightRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        aircraft_id: 77,
        provider_id: 22,
      }),
      expect.any(Object),
    )
  })

  it('does not create a second hold while the first selection is still in progress', async () => {
    let releaseHold
    createClientAircraftHoldMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseHold = resolve
        }),
    )

    const wrapper = await mountView({ section: 'reservar' })
    const aircraft = {
      id: 'aircraft-2',
      aircraft: 'Citation XLS',
      cabin: 'Citation XLS',
      is_available: true,
      provider_id: 22,
      aircraft_id: 77,
    }

    const firstRequest = wrapper.vm.requestReservation(aircraft)
    await flushPromises()
    const secondRequest = wrapper.vm.requestReservation(aircraft)

    expect(createClientAircraftHoldMock).toHaveBeenCalledTimes(1)

    releaseHold({
      hold_id: 'hold-1',
      hold_expires_at: '2099-07-20T09:15:00Z',
      aircraft_id: 77,
    })

    await Promise.all([firstRequest, secondRequest])
  })
})

describe('PortalClienteVista commercial access checkout', () => {
  it('activates the quote loading state immediately before the access refresh resolves', async () => {
    let resolveAccessStatus
    getClientAccessStatusMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAccessStatus = resolve
        }),
    )

    const wrapper = await mountView({ section: 'reservar' })

    wrapper.vm.searchForm.origin = 'MMMX'
    wrapper.vm.searchForm.destination = 'MMUN'
    wrapper.vm.searchForm.departureDate = '2026-07-30'
    wrapper.vm.searchForm.departureTime = '09:00 AM'
    wrapper.vm.searchForm.passengers = '2'

    const pendingSearch = wrapper.vm.submitSearch()

    expect(wrapper.vm.searching).toBe(true)

    resolveAccessStatus({
      commercial_access: {
        has_paid_access: true,
        remaining_free_quotes: 1,
        free_quotes_used: 0,
        status: 'active',
      },
    })

    await pendingSearch
    await flushPromises()
  })

  it('opens Stripe directly when quote preview responds with 402 for consumed trial', async () => {
    authStoreMock.access = {
      commercial_access: {
        has_paid_access: false,
        remaining_free_quotes: 1,
        free_quotes_used: 0,
        status: 'trial_active',
      },
    }
    searchClientFlightsMock.mockRejectedValue({
      status: 402,
      message: 'Necesitas activar tu acceso comercial para cotizar de nuevo.',
      payload: {
        access: {
          commercial_access: {
            has_paid_access: false,
            remaining_free_quotes: 0,
            free_quotes_used: 1,
            status: 'trial_used',
          },
        },
      },
    })

    const wrapper = await mountView({ section: 'reservar' })

    wrapper.vm.searchForm.origin = 'MMMX'
    wrapper.vm.searchForm.destination = 'MMUN'
    wrapper.vm.searchForm.departureDate = '2026-07-30'
    wrapper.vm.searchForm.departureTime = '09:00 AM'
    wrapper.vm.searchForm.passengers = '2'

    await wrapper.vm.submitSearch()
    await flushPromises()

    expect(searchClientFlightsMock).toHaveBeenCalledTimes(1)
    expect(createClientAccessCheckoutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contact_email: 'cliente@skygroup.com',
      }),
      expect.objectContaining({ timeoutMs: 30000 }),
    )
    expect(wrapper.vm.lastExternalRedirectUrl).toBe('https://checkout.stripe.com/pay/cs_test_access_1')
    expect(routerMock.push).not.toHaveBeenCalledWith({
      name: 'cliente',
      params: { section: 'pago' },
      query: { accessPayment: '1' },
    })
  })

  it('uses the authenticated user email dynamically for commercial access checkout', async () => {
    authStoreMock.user = {
      ...authStoreMock.user,
      email: 'otro.usuario@test.dev',
    }
    authStoreMock.access = {
      commercial_access: {
        has_paid_access: false,
        remaining_free_quotes: 0,
        free_quotes_used: 1,
        status: 'trial_used',
      },
    }
    routeMock.query = { accessPayment: '1' }

    await mountView({ section: 'pago' })
    await flushPromises()

    expect(createClientAccessCheckoutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contact_email: 'otro.usuario@test.dev',
      }),
      expect.objectContaining({ timeoutMs: 30000 }),
    )
  })

  it('auto-starts Stripe from the legacy accessPayment route without requiring a second click', async () => {
    routeMock.params.id = undefined
    routeMock.query = { accessPayment: '1' }
    authStoreMock.access = {
      commercial_access: {
        has_paid_access: false,
        remaining_free_quotes: 0,
        free_quotes_used: 1,
        status: 'trial_used',
      },
    }
    getClientAccessStatusMock.mockResolvedValue({
      access: {
        has_paid_access: false,
        remaining_free_quotes: 0,
        free_quotes_used: 1,
        status: 'trial_used',
      },
    })

    const wrapper = await mountView({ section: 'pago' })

    await flushPromises()

    expect(createClientAccessCheckoutMock).toHaveBeenCalledTimes(1)
    expect(wrapper.vm.lastExternalRedirectUrl).toBe('https://checkout.stripe.com/pay/cs_test_access_1')
  })

  it('does not call the access checkout endpoint when the authenticated user lacks a valid email', async () => {
    routeMock.query = { accessPayment: '1' }
    authStoreMock.user = {
      ...authStoreMock.user,
      email: 'Cliente Prueba',
    }
    authStoreMock.access = {
      commercial_access: {
        has_paid_access: false,
        remaining_free_quotes: 0,
        free_quotes_used: 1,
        status: 'trial_used',
      },
    }

    const wrapper = await mountView({ section: 'pago' })
    await flushPromises()

    expect(createClientAccessCheckoutMock).not.toHaveBeenCalled()
    expect(wrapper.vm.paymentInlineError).toBe('Tu cuenta no tiene un correo electrónico válido.')
    expect(pushToastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: 'warning',
        title: 'Correo requerido',
        message: 'Tu cuenta no tiene un correo electrónico válido.',
      }),
    )
  })

  it('shows the backend validation error instead of the generic Stripe error title body', async () => {
    routeMock.query = { accessPayment: '1' }
    authStoreMock.access = {
      commercial_access: {
        has_paid_access: false,
        remaining_free_quotes: 0,
        free_quotes_used: 1,
        status: 'trial_used',
      },
    }
    createClientAccessCheckoutMock.mockRejectedValueOnce({
      status: 422,
      message: 'Datos invalidos.',
      payload: {
        message: 'Datos invalidos.',
        errors: {
          contact_email: ['The contact email field must be a valid email address.'],
        },
      },
    })

    const wrapper = await mountView({ section: 'pago' })
    await flushPromises()

    expect(wrapper.vm.paymentInlineError).toBe(
      'The contact email field must be a valid email address.',
    )
    expect(pushToastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: 'error',
        title: 'No se pudo abrir Stripe',
        message: 'The contact email field must be a valid email address.',
      }),
    )
  })
})

describe('PortalClienteVista checkout hold validation', () => {
  it('uses backend payment availability before creating Stripe checkout', async () => {
    const wrapper = await mountView({ section: 'pago' })

    wrapper.vm.reservations = [
      buildReservation({
        id: 'res-1',
        flight_request_id: 'fr-1',
        frontend_state: {
          ready_for_payment: true,
          aircraft_hold: {
            hold_id: 'hold-1',
            hold_expires_at: '2099-07-20T09:15:00Z',
            aircraft_id: '77',
          },
        },
      }),
    ]
    await flushPromises()

    wrapper.vm.handlePaymentMethodSelection('stripe')
    wrapper.vm.paymentForm.contactEmail = 'cliente@skygroup.com'

    await wrapper.vm.handlePaymentSubmit()

    expect(getClientReservationPaymentAvailabilityMock).toHaveBeenCalledWith(
      'res-1',
      expect.any(Object),
    )
    expect(createClientCheckoutMock).toHaveBeenCalledWith(
      'fr-1',
      expect.objectContaining({
        reservation_id: 'res-1',
        hold_id: 'hold-1',
      }),
      expect.any(Object),
    )
    expect(wrapper.vm.paymentInlineError).not.toContain('retencion')
  })

  it('rebuilds the hold from checkout session context when the hydrated reservation no longer includes frontend_state.aircraft_hold', async () => {
    window.sessionStorage.setItem(
      'red_aviation_client_reservation_checkout_context_v1',
      JSON.stringify({
        routeId: 'res-1',
        reservationId: 'res-1',
        flightRequestId: 'fr-1',
        aircraftHold: {
          hold_id: 'hold-session-1',
          hold_expires_at: '2099-07-20T09:15:00Z',
          aircraft_id: '77',
        },
        reservation: buildReservation({
          id: 'res-1',
          flight_request_id: 'fr-1',
          accepted_quote: {
            id: 123,
            quote_id: 123,
          },
        }),
        savedAt: new Date().toISOString(),
      }),
    )

    const wrapper = await mountView({ section: 'pago' })

    wrapper.vm.reservations = [
      buildReservation({
        id: 'res-1',
        flight_request_id: 'fr-1',
        accepted_quote: {
          id: 123,
          quote_id: 123,
        },
        frontend_state: {
          ready_for_payment: true,
        },
      }),
    ]
    await flushPromises()

    wrapper.vm.handlePaymentMethodSelection('stripe')
    wrapper.vm.paymentForm.contactEmail = 'cliente@skygroup.com'

    await wrapper.vm.handlePaymentSubmit()

    expect(getClientReservationPaymentAvailabilityMock).toHaveBeenCalledWith(
      'res-1',
      expect.any(Object),
    )
    expect(createClientCheckoutMock).toHaveBeenCalledWith(
      'fr-1',
      expect.objectContaining({
        reservation_id: 'res-1',
        hold_id: 'hold-1',
      }),
      expect.any(Object),
    )
    expect(wrapper.vm.paymentInlineError).not.toContain('retencion')
  })

  it('preserves a known hold when reservation detail hydration updates the record without aircraft_hold', async () => {
    getClientTripsMock.mockResolvedValueOnce([
      buildReservation({
        id: 'res-1',
        flight_request_id: 'fr-1',
        summary_only: true,
        accepted_quote: {
          id: 123,
          quote_id: 123,
        },
        frontend_state: {
          ready_for_payment: true,
          aircraft_hold: {
            hold_id: 'hold-preserved-1',
            hold_expires_at: '2099-07-20T09:15:00Z',
            aircraft_id: '77',
          },
        },
      }),
    ])
    getClientReservationMock.mockResolvedValueOnce(
      buildReservation({
        id: 'res-1',
        flight_request_id: 'fr-1',
        accepted_quote: {
          id: 123,
          quote_id: 123,
        },
        frontend_state: {
          ready_for_payment: true,
        },
      }),
    )

    const wrapper = await mountView({ section: 'pago' })

    await flushPromises()
    await flushPromises()
    wrapper.vm.handlePaymentMethodSelection('stripe')
    wrapper.vm.paymentForm.contactEmail = 'cliente@skygroup.com'
    await wrapper.vm.handlePaymentSubmit()

    expect(getClientReservationPaymentAvailabilityMock).toHaveBeenCalledWith(
      'res-1',
      expect.any(Object),
    )
    expect(createClientCheckoutMock).toHaveBeenCalledWith(
      'fr-1',
      expect.objectContaining({
        reservation_id: 'res-1',
        hold_id: 'hold-1',
      }),
      expect.any(Object),
    )
    expect(wrapper.vm.paymentInlineError).not.toContain('retencion')
  })

  it('blocks Stripe when backend reports hold_expired', async () => {
    getClientReservationPaymentAvailabilityMock.mockResolvedValue({
      success: false,
      can_pay: false,
      hold_valid: false,
      reservation_booked: false,
      invalid_reason: 'hold_expired',
      message:
        'La retencion vencio. Estamos verificando nuevamente la disponibilidad de la aeronave.',
      hold: {
        id: 'hold-expired-1',
        status: 'expired',
        aircraft_id: '77',
        quote_id: '123',
        flight_request_id: 'fr-1',
        reservation_id: 'res-1',
        start_at: '2026-07-20T09:00:00Z',
        end_at: '2026-07-20T13:00:00Z',
        expires_at: '2026-07-20T09:15:00Z',
        is_valid: false,
        invalid_reason: 'hold_expired',
      },
      availability: {
        available: true,
        conflict_type: null,
        conflicting_block_id: null,
      },
      schedule: {
        start_at: '2026-07-20T09:00:00Z',
        end_at: '2026-07-20T13:00:00Z',
        source: 'hold_block',
      },
    })

    const wrapper = await mountView({ section: 'pago' })
    await wrapper.vm.handlePaymentSubmit()
    await flushPromises()

    expect(createClientCheckoutMock).not.toHaveBeenCalled()
    expect(wrapper.vm.paymentInlineError).toContain('retencion vencio')
  })

  it('omits hold_id when backend reports the reservation is already booked for its own window', async () => {
    getClientReservationPaymentAvailabilityMock.mockResolvedValue({
      success: true,
      can_pay: true,
      hold_valid: false,
      reservation_booked: true,
      invalid_reason: null,
      hold: null,
      availability: {
        available: true,
        conflict_type: null,
        conflicting_block_id: null,
      },
      schedule: {
        start_at: '2026-07-20T09:00:00Z',
        end_at: '2026-07-20T13:00:00Z',
        source: 'booked_block',
      },
    })

    const wrapper = await mountView({ section: 'pago' })

    wrapper.vm.handlePaymentMethodSelection('stripe')
    wrapper.vm.paymentForm.contactEmail = 'cliente@skygroup.com'

    await wrapper.vm.handlePaymentSubmit()

    expect(createClientCheckoutMock).toHaveBeenCalledWith(
      'fr-1',
      expect.objectContaining({
        reservation_id: 'res-1',
        hold_id: undefined,
      }),
      expect.any(Object),
    )
  })
})

describe('PortalClienteVista reservation checkout return flow', () => {
  it('redirects to reservation confirmed only when checkout success returns a confirmed payment state', async () => {
    routeMock.query = {
      checkout: 'success',
      session_id: 'cs_test_success_1',
    }
    getClientReservationCheckoutSuccessMock.mockResolvedValueOnce({
      reservation_id: 'res-1',
      payment_status: 'paid',
      booking_status: 'confirmed',
      reservation: buildReservation({
        id: 'res-1',
        flight_request_id: 'fr-1',
        payment_status: 'paid',
        status: 'confirmed',
        workflow_status: 'payment_confirmed',
      }),
    })

    await mountView({ section: 'pago' })

    expect(getClientReservationCheckoutSuccessMock).toHaveBeenCalledWith(
      {
        session_id: 'cs_test_success_1',
        reservation_id: 'res-1',
        flight_request_id: 'fr-1',
      },
      { timeoutMs: 30000 },
    )
    expect(pushToastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: 'success',
        title: 'Pago confirmado',
      }),
    )
    expect(routerMock.replace).toHaveBeenCalledWith({
      name: 'cliente-detalle',
      params: { section: 'reserva-confirmada', id: 'res-1' },
    })
  })

  it('does not redirect to reservation confirmed when checkout returns without a terminal payment confirmation', async () => {
    routeMock.query = {
      checkout: 'success',
      session_id: 'cs_test_pending_1',
    }
    window.sessionStorage.setItem(
      'red_aviation_client_reservation_checkout_context_v1',
      JSON.stringify({
        routeId: 'res-1',
        reservationId: 'res-1',
        flightRequestId: 'fr-1',
        checkoutSessionId: 'cs_test_pending_1',
        reservation: buildReservation({
          id: 'res-1',
          flight_request_id: 'fr-1',
          payment_status: 'pending',
          status: 'pending_payment',
          workflow_status: 'payment_pending',
          frontend_state: {
            ready_for_payment: true,
          },
        }),
        savedAt: new Date().toISOString(),
      }),
    )
    getClientReservationCheckoutSuccessMock.mockResolvedValueOnce({
      reservation_id: 'res-1',
      payment_status: 'processing',
      workflow_status: 'payment_pending',
      reservation: buildReservation({
        id: 'res-1',
        flight_request_id: 'fr-1',
        payment_status: 'processing',
        status: 'pending_payment',
        workflow_status: 'payment_pending',
        frontend_state: {
          ready_for_payment: true,
        },
      }),
    })
    getClientTripsMock.mockResolvedValue([
      buildReservation({
        id: 'res-1',
        flight_request_id: 'fr-1',
        payment_status: 'pending',
        status: 'payment_pending',
        workflow_status: 'payment_pending',
      }),
    ])

    await mountView({ section: 'pago' })

    expect(getClientReservationCheckoutSuccessMock).toHaveBeenCalledWith(
      {
        session_id: 'cs_test_pending_1',
        reservation_id: 'res-1',
        flight_request_id: 'fr-1',
      },
      { timeoutMs: 30000 },
    )
    expect(routerMock.replace).not.toHaveBeenCalledWith({
      name: 'cliente-detalle',
      params: { section: 'reserva-confirmada', id: 'res-1' },
    })
    expect(pushToastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        tone: 'success',
        title: 'Pago confirmado',
      }),
    )
  })
})

describe('PortalClienteVista tracking navigation', () => {
  it('routes the flight detail CTA to the reservation detail tracking view', async () => {
    getClientTripsMock.mockResolvedValueOnce([
      buildReservation({
        id: 'res-1',
        flight_request_id: 'fr-1',
        status: 'flight_confirmed',
        workflow_status: 'flight_confirmed',
        payment_status: 'paid',
      }),
    ])

    const wrapper = await mountView({ section: 'viajes' })

    wrapper.findComponent({ name: 'PortalClienteTripsScreen' }).vm.$emit('open-detail', 'res-1')
    await flushPromises()

    expect(routerMock.push).toHaveBeenCalledWith({
      name: 'cliente-subdetalle',
      params: { section: 'reserva-confirmada', id: 'res-1', subsection: 'tracking' },
    })
  })

  it('keeps the reservation detail screen open when the reservation is already in tracking flow', async () => {
    vi.useFakeTimers()
    routeMock.params = { id: 'res-1' }
    getClientTripsMock.mockResolvedValue([
      buildReservation({
        id: 'res-1',
        flight_request_id: 'fr-1',
        status: 'tracking_live',
        workflow_status: 'tracking_live',
        payment_status: 'paid',
      }),
    ])

    await mountView({ section: 'reserva-confirmada' })
    vi.advanceTimersByTime(3000)
    await flushPromises()

    expect(routerMock.push).not.toHaveBeenCalledWith({
      name: 'cliente-detalle',
      params: { section: 'viajes', id: 'res-1' },
    })
    expect(routerMock.replace).not.toHaveBeenCalledWith('/cliente/viajes/res-1')

    vi.useRealTimers()
  })
})

describe('ViajesActivos availability conflict CTA', () => {
  it('releases CTA loading and emits the safe conflict action instead of staying in Cargando', async () => {
    const reservation = buildReservation({
      id: 'res-cta',
      flight_request_id: 'fr-cta',
      status: 'contract_pending',
      workflow_status: 'contrato pendiente',
      frontend_state: {
        availability_conflict: true,
        availability_conflict_message:
          'Esta aeronave ya no esta disponible para el horario seleccionado.',
      },
    })

    const wrapper = shallowMount(ViajesActivos, {
      props: {
        reservations: [reservation],
        selectedId: 'res-cta',
        timeline: [],
        initialTab: 'proximos',
        refreshing: false,
      },
      global: {
        stubs: {
          ReservationActionCard: true,
        },
      },
    })

    wrapper.vm.runPrimaryAction(reservation)
    await flushPromises()

    expect(wrapper.emitted('resolve-availability-conflict')).toEqual([['res-cta']])
    expect(wrapper.vm.primaryActionConfig(reservation).title).toBe(
      'Esta aeronave ya no esta disponible',
    )
    expect(wrapper.vm.primaryActionConfig(reservation).buttonLabel).toBe('Ver otras opciones')
    expect(wrapper.vm.isPrimaryActionLoading(reservation)).toBe(false)
  })
})
