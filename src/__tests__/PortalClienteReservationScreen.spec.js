/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PortalClienteReservationScreen from '../features/client/portal/PortalClienteReservationScreen.vue'

function buildProps(overrides = {}) {
  return {
    activeItinerarySummary: {
      passengers: 8,
      legs: [],
    },
    activeResultFilter: 'best_value',
    aircraftBillingNote: () => '',
    aircraftCapacityLabel: () => '8 pasajeros',
    aircraftClassLabel: () => 'Light Jet',
    aircraftSidebarFilters: {
      types: [],
      passengerMin: 1,
      priceMin: '',
      priceMax: '',
      speedMin: 0,
      services: [],
    },
    aircraftSidebarPassengerBounds: { min: 1, max: 16 },
    aircraftSidebarPriceBounds: { min: 3000, max: 12000 },
    aircraftSidebarServiceOptions: [],
    aircraftSidebarSpeedBounds: { min: 200, max: 600 },
    aircraftSidebarTypeOptions: [],
    aircraftIncludes: () => [],
    aircraftPriceCopy: () => 'USD 4,904',
    aircraftSpeedLine: () => '2 h',
    aircraftVisualStyle: () => ({}),
    commercialAccessActionDisabled: false,
    commercialAccessCtaLabel: 'Continuar',
    commercialTrialNotice: {
      tone: 'info',
      title: 'Acceso activo',
      message: 'Puedes reservar sin restricciones.',
    },
    featuredAircraft: {
      id: 'aircraft-1',
      aircraft: 'LEARJET 31A',
      image_url: 'https://example.com/aircraft.jpg',
      is_available: true,
    },
    isResultsSection: true,
    itineraryDateLine: () => '24 de julio de 2026',
    itineraryHeadline: () => 'Toluca a Monterrey',
    itinerarySummary: {},
    reservationActionLabel: () => 'Reservar',
    reservationLoadingState: {
      active: false,
      eyebrow: 'SOLICITUDES',
      title: 'Cargando solicitudes',
      message: 'Estamos sincronizando oportunidades activas y el backlog operativo del proveedor.',
    },
    reservingAircraftId: '',
    resultFilterOptions: [],
    searchForm: {
      origin: 'Toluca (MMTO)',
      destination: 'Monterrey (MMMY)',
    },
    searching: false,
    secondaryAircraftOptions: [],
    serverSearchError: '',
    shouldShowCommercialAccessCta: false,
    tripType: 'Ida',
    ...overrides,
  }
}

describe('PortalClienteReservationScreen', () => {
  it('shows the reservation loading overlay with the provided copy', () => {
    const wrapper = mount(PortalClienteReservationScreen, {
      props: buildProps({
        reservationLoadingState: {
          active: true,
          eyebrow: 'SOLICITUDES',
          title: 'Apartando aeronave',
          message: 'Estamos bloqueando temporalmente esta opcion para que nadie la tome mientras avanzas.',
        },
      }),
      global: {
        stubs: {
          FlightSearchHero: true,
        },
      },
    })

    expect(wrapper.find('.reservation-loading-modal').exists()).toBe(true)
    expect(wrapper.text()).toContain('CENTRO OPERATIVO')
    expect(wrapper.text()).toContain('Preparando Nuestra')
    expect(wrapper.text()).toContain('Cabina')
    expect(wrapper.find('.reservation-loading-spinner').exists()).toBe(true)
  })

  it('passes the commercial access activation state into the flight hero when payment is required', () => {
    const wrapper = mount(PortalClienteReservationScreen, {
      props: buildProps({
        isResultsSection: false,
        shouldShowCommercialAccessCta: true,
        commercialAccessCtaLabel: 'Reactivar acceso comercial',
        commercialTrialNotice: {
          tone: 'danger',
          title: 'Acceso comercial vencido',
          message: 'Tu acceso ya expiró. Reactiva el pago para volver a cotizar.',
        },
      }),
      global: {
        stubs: {
          FlightSearchHero: true,
        },
      },
    })

    const hero = wrapper.findComponent({ name: 'FlightSearchHero' })

    expect(hero.exists()).toBe(true)
    expect(hero.props('commercialAccessNotice')).toEqual({
      tone: 'danger',
      title: 'Acceso comercial vencido',
      message: 'Tu acceso ya expiró. Reactiva el pago para volver a cotizar.',
    })
    expect(hero.props('commercialAccessCtaLabel')).toBe('Reactivar acceso comercial')
    expect(hero.props('shouldShowCommercialAccessCta')).toBe(true)
    expect(hero.props('submitLabel')).toBe('Activar acceso para cotizar')
  })

  it('keeps the overlay hidden when the reservation flow is idle', () => {
    const wrapper = mount(PortalClienteReservationScreen, {
      props: buildProps(),
      global: {
        stubs: {
          FlightSearchHero: true,
        },
      },
    })

    expect(wrapper.find('.reservation-loading-modal').exists()).toBe(false)
  })

  it('renders skeleton cards while flight results are loading', () => {
    const wrapper = mount(PortalClienteReservationScreen, {
      props: buildProps({
        searching: true,
      }),
      global: {
        stubs: {
          FlightSearchHero: true,
        },
      },
    })

    expect(wrapper.find('.results-section--skeleton').exists()).toBe(true)
    expect(wrapper.findAll('.aircraft-skeleton-card').length).toBeGreaterThanOrEqual(2)
    expect(wrapper.text()).toContain('Buscando aeronaves disponibles...')
  })

  it('replaces the active-account trust copy with the payment warning when access needs reactivation', () => {
    const wrapper = mount(PortalClienteReservationScreen, {
      props: buildProps({
        shouldShowCommercialAccessCta: true,
        commercialTrialNotice: {
          tone: 'danger',
          title: 'Acceso comercial vencido',
          message: 'Tu acceso ya expiró. Reactiva el pago para volver a cotizar.',
        },
      }),
      global: {
        stubs: {
          FlightSearchHero: true,
        },
      },
    })

    expect(wrapper.find('.results-trust-bar__account--alert').exists()).toBe(true)
    expect(wrapper.text()).toContain('Tu acceso ya expiró. Reactiva el pago para volver a cotizar.')
    expect(wrapper.text()).not.toContain(
      'Tu cuenta ya puede cotizar, reservar, firmar contrato y pagar vuelos.',
    )
  })

  it('renders the empty result state with retry actions when no aircraft are available', () => {
    const wrapper = mount(PortalClienteReservationScreen, {
      props: buildProps({
        featuredAircraft: null,
        secondaryAircraftOptions: [],
      }),
      global: {
        stubs: {
          FlightSearchHero: true,
        },
      },
    })

    expect(wrapper.text()).toContain(
      'No hay aeronaves activas y elegibles con base en el aeropuerto de origen.',
    )
    expect(wrapper.text()).toContain('Modificar busqueda')
    expect(wrapper.text()).toContain('Intentar nuevamente')
    expect(wrapper.text()).toContain('Contactar Concierge')
  })

  it('identifies an aircraft whose canonical base matches the origin', () => {
    const wrapper = mount(PortalClienteReservationScreen, {
      props: buildProps({
        featuredAircraft: {
          id: 'aircraft-local',
          aircraft: 'LEARJET 31A',
          image_url: '',
          is_available: true,
          based_at_origin: true,
          source_origin: 'MMTO',
        },
      }),
      global: {
        stubs: {
          FlightSearchHero: true,
        },
      },
    })

    expect(wrapper.text()).toContain('Base en origen')
  })

  it('shows the real base when an eligible aircraft needs repositioning', () => {
    const wrapper = mount(PortalClienteReservationScreen, {
      props: buildProps({
        featuredAircraft: {
          id: 'aircraft-repositioned',
          aircraft: 'GULFSTREAM G-IV',
          image_url: '',
          is_available: true,
          based_at_origin: false,
          requires_repositioning: true,
          source_origin: 'MMTO',
        },
      }),
      global: {
        stubs: {
          FlightSearchHero: true,
        },
      },
    })

    expect(wrapper.text()).toContain('Reposicionamiento desde MMTO')
    expect(wrapper.text()).not.toContain('Base en origen')
  })
})
