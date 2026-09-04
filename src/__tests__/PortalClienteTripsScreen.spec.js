/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PortalClienteTripsScreen from '../features/client/portal/PortalClienteTripsScreen.vue'
import ClientFlightBrief from '../features/client/portal/components/ClientFlightBrief.vue'

function buildProps(overrides = {}) {
  return {
    activeAircraftHoldSummary: null,
    assistedPaymentProofFile: null,
    assistedPaymentProofName: '',
    assistedPaymentProofUploaded: false,
    assistedPrimaryCtaLabel: 'Enviar comprobante',
    backReservationId: 'res-29',
    backSection: 'contrato',
    canRenderReservationWorkflow: true,
    canUploadAssistedPaymentProof: false,
    commercialAccessCheckoutFacts: [],
    commercialAccessCheckoutScreenMode: false,
    commercialAccessCheckoutReturnMode: false,
    commercialAccessCheckoutReturnPending: false,
    commercialAccessCtaLabel: 'Continuar',
    customerDisplayName: 'Jose Luis Hernandez',
    formatDetailedCurrencyByCode: (value, currency = 'USD') => `${currency} ${value}`,
    flightBrief: null,
    flightBriefError: '',
    flightBriefLoading: false,
    hasReservationsLoaded: true,
    paymentBreakdownAmountMap: {},
    paymentBreakdownCurrency: 'USD',
    paymentBreakdownRows: [],
    paymentCanSubmit: true,
    paymentDateLabel: '22 de julio de 2026 a las 5:00 AM',
    paymentFeatureList: [],
    paymentForm: { contactEmail: 'red@gmail.com' },
    paymentAvailabilityLoading: false,
    paymentHeroCopy: '',
    paymentHeroTitle: '',
    paymentInlineError: '',
    paymentLastReference: '',
    paymentMethodCards: [],
    paymentMethodExplicitlySelected: true,
    paymentMethodSummaryLabel: '',
    paymentProofUploading: false,
    paymentRouteHeadline: 'Toluca (MMTO) -> Morelia (MMMM)',
    paymentSubmitting: false,
    paymentSummaryAmountLabel: 'USD 3,411.20',
    propsSection: 'reserva-confirmada',
    refreshingReservations: false,
    reservationCheckoutReturnPending: false,
    reservationContextId: 'res-29',
    reservations: [],
    routeSubsection: 'tracking',
    selectedPaymentMethod: 'stripe',
    selectedReservation: {
      id: 'res-29',
      workflow_status: 'tracking_live',
      tracking_status: 'En curso',
      route: 'Toluca (MMTO) -> Morelia (MMMM)',
      date: '22 de julio de 2026 a las 5:00 AM',
      aircraft: 'AGUSTA A109E POWER VIP',
      crew_name: 'Tripulacion asignada',
      terminal: 'FBO Toluca',
      briefing: {
        hora_presentacion: '4:15 AM',
      },
    },
    selectedReservationFrontendState: {},
    selectedTripId: 'res-29',
    signingContract: false,
    timeline: [],
    tripsInitialTab: 'activos',
    ...overrides,
  }
}

describe('PortalClienteTripsScreen tracking detail', () => {
  it('renders a dedicated tracking detail view when the subsection is tracking', () => {
    const wrapper = mount(PortalClienteTripsScreen, {
      props: buildProps(),
      global: {
        stubs: {
          ActiveTrips: true,
          ClientContractPreview: true,
          PaymentActionButton: true,
          PaymentCountdown: true,
          PaymentSummaryCard: true,
          ReservationSummarySidebar: true,
          SecureStripeCard: true,
        },
      },
    })

    expect(wrapper.text()).toContain('Información de tu vuelo')
    expect(wrapper.text()).not.toContain('Hitos del servicio')
    expect(wrapper.text()).not.toContain('FBO Toluca')
  })

  it('promotes the visible tracking status when the workflow is still flight_confirmed', () => {
    const wrapper = mount(PortalClienteTripsScreen, {
      props: buildProps({
        selectedReservation: {
          id: 'res-29',
          workflow_status: 'flight_confirmed',
          route: 'MMTO -> MMMM',
          date: '2026-07-22T11:00:00.000000Z',
          aircraft: 'AGUSTA A109E POWER VIP',
        },
      }),
      global: {
        stubs: {
          ActiveTrips: true,
          ClientContractPreview: true,
          PaymentActionButton: true,
          PaymentCountdown: true,
          PaymentSummaryCard: true,
          ReservationSummarySidebar: true,
          SecureStripeCard: true,
        },
      },
    })

    expect(wrapper.text()).not.toContain('Tracking en curso')
    expect(wrapper.text()).not.toContain('2026-07-22T11:00:00.000000Z')
  })

  it('keeps the Stripe action visible on the standalone commercial access screen', () => {
    const wrapper = mount(PortalClienteTripsScreen, {
      props: buildProps({
        commercialAccessCheckoutFacts: [
          { label: 'Estado de acceso', value: 'Prueba consumida', tone: 'warning' },
        ],
        commercialAccessCheckoutScreenMode: true,
        commercialAccessCheckoutReturnMode: false,
        paymentSummaryAmountLabel: 'USD 122.59',
        propsSection: 'pago',
      }),
      global: {
        stubs: {
          ActiveTrips: true,
          ClientContractPreview: true,
          PaymentCountdown: true,
          PaymentSummaryCard: true,
          ReservationSummarySidebar: true,
          SecureStripeCard: true,
        },
      },
    })

    expect(wrapper.text()).toContain('Configura tu pago')
    expect(wrapper.text()).toContain('Acceso comercial')
    expect(wrapper.text()).toContain('Prueba consumida')
    expect(wrapper.text()).toContain('USD 122.59')
  })

  it('shows the payment gate without operational data when the brief is not visible', () => {
    const wrapper = mount(PortalClienteTripsScreen, {
      props: buildProps({ flightBrief: { visible: false } }),
    })

    expect(wrapper.text()).toContain('Flight Brief disponible después de confirmar el pago.')
    expect(wrapper.findComponent(ClientFlightBrief).exists()).toBe(false)
  })

  it('renders the supplied visible brief and keeps null optional data safe', () => {
    const wrapper = mount(PortalClienteTripsScreen, {
      props: buildProps({
        flightBrief: {
          visible: true,
          flight_request_id: 'fr-1',
          payment: { confirmed: true, status: 'paid', paid_at: null },
          flight: { origin: null, destination: null, date: null, time: null, aircraft: null },
          provider: { assigned: false, visible_name: null, status: null },
          operation: null,
          crew: { required: false, assigned: false, confirmed: false, status: null, visible_name: null },
          checklist: { exists: false, completed: 0, total: 0, percentage: null, is_complete: false },
          readiness: { ready: false, code: null, label: null },
        },
      }),
    })

    expect(wrapper.findComponent(ClientFlightBrief).exists()).toBe(true)
    expect(wrapper.text()).not.toContain('undefined')
    expect(wrapper.text()).not.toContain('NaN')
    expect(wrapper.text()).not.toContain('0 / 0')
  })

  it('shows loading and retries after an error', async () => {
    const loadingWrapper = mount(PortalClienteTripsScreen, {
      props: buildProps({ flightBriefLoading: true }),
    })
    expect(loadingWrapper.find('.flight-brief-loading').exists()).toBe(true)

    const errorWrapper = mount(PortalClienteTripsScreen, {
      props: buildProps({ flightBriefError: 'No fue posible actualizar la información del vuelo.' }),
    })
    expect(errorWrapper.text()).toContain('No fue posible actualizar la información del vuelo.')
    await errorWrapper.get('.flight-brief-message--error button').trigger('click')
    expect(errorWrapper.emitted('retry-flight-brief')).toHaveLength(1)
  })

  it('keeps a valid brief visible and shows a discrete notice after a refresh error', () => {
    const wrapper = mount(PortalClienteTripsScreen, {
      props: buildProps({
        flightBriefRefreshError: true,
        flightBrief: {
          visible: true,
          flight: {}, payment: {}, provider: {}, operation: {}, crew: {}, checklist: {}, readiness: {},
        },
      }),
    })

    expect(wrapper.findComponent(ClientFlightBrief).exists()).toBe(true)
    expect(wrapper.text()).toContain('Mostrando la última información disponible.')
  })

  it('reuses the existing reservation detail action for the tracking CTA', async () => {
    const wrapper = mount(PortalClienteTripsScreen, {
      props: buildProps({
        flightBrief: {
          visible: true,
          flight: {},
          payment: {},
          provider: {},
          operation: {},
          crew: {},
          checklist: {},
          readiness: {},
        },
      }),
    })

    await wrapper.findComponent(ClientFlightBrief).vm.$emit('view-tracking')
    expect(wrapper.emitted('open-detail')).toEqual([['res-29']])
  })

  it('does not retain a previous visible brief when the selected trip changes', async () => {
    const wrapper = mount(PortalClienteTripsScreen, {
      props: buildProps({
        flightBrief: {
          visible: true,
          flight: { origin: 'TLC', destination: 'CUN' },
          payment: {},
          provider: {},
          operation: {},
          crew: {},
          checklist: {},
          readiness: {},
        },
      }),
    })

    expect(wrapper.findComponent(ClientFlightBrief).exists()).toBe(true)

    await wrapper.setProps({
      selectedTripId: 'res-30',
      reservationContextId: 'res-30',
      flightBrief: null,
      flightBriefLoading: true,
    })

    expect(wrapper.findComponent(ClientFlightBrief).exists()).toBe(false)
    expect(wrapper.find('.flight-brief-loading').exists()).toBe(true)
  })
})
