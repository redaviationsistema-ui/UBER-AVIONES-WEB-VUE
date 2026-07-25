/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PortalClienteTripsScreen from '../features/client/portal/PortalClienteTripsScreen.vue'

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

    expect(wrapper.text()).toContain('Seguimiento del vuelo en curso')
    expect(wrapper.text()).toContain('Hitos del servicio')
    expect(wrapper.text()).toContain('Tracking en curso')
    expect(wrapper.text()).toContain('FBO Toluca')
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

    expect(wrapper.text()).toContain('Tracking en curso')
    expect(wrapper.text()).toContain('22 de julio de 2026')
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
})
