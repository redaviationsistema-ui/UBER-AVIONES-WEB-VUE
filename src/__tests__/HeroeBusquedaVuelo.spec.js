/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import HeroeBusquedaVuelo from '../features/client/cotizador/HeroeBusquedaVuelo.vue'

function buildProps(overrides = {}) {
  return {
    commercialAccessActionDisabled: false,
    commercialAccessCtaLabel: 'Reactivar acceso comercial',
    commercialAccessNotice: {
      tone: 'danger',
      title: 'Acceso comercial vencido 2026-07-29',
      message: 'Tu acceso ya expiró. Reactiva el pago para volver a cotizar.',
    },
    form: {
      origin: '',
      destination: '',
      departureDate: '',
      departureTime: '',
      returnDate: '',
      returnTime: '',
      legs: [],
    },
    shouldShowCommercialAccessCta: true,
    submitBusy: false,
    submitLabel: 'Activar acceso para cotizar',
    summary: {},
    tripType: 'Ida',
    ...overrides,
  }
}

describe('HeroeBusquedaVuelo', () => {
  it('shows the activation warning in the hero status bar when payment is required', async () => {
    const wrapper = mount(HeroeBusquedaVuelo, {
      props: buildProps(),
    })

    expect(wrapper.find('.hero-status-bar--alert').exists()).toBe(true)
    expect(wrapper.text()).toContain('Acceso comercial vencido 2026-07-29')
    expect(wrapper.text()).toContain('Tu acceso ya expiró. Reactiva el pago para volver a cotizar.')
    expect(wrapper.text()).toContain('Reactivar acceso comercial')
    expect(wrapper.text()).toContain('Activar acceso para cotizar')

    await wrapper.get('.hero-status-bar__action').trigger('click')

    expect(wrapper.emitted('go-commercial-access-payment')).toHaveLength(1)
  })

  it('keeps the standard active-account header when access is already enabled', () => {
    const wrapper = mount(HeroeBusquedaVuelo, {
      props: buildProps({
        commercialAccessCtaLabel: '',
        commercialAccessNotice: {
          tone: 'success',
          title: 'Acceso comercial activo',
          message: 'Tu cuenta ya puede cotizar, reservar, firmar contrato y pagar vuelos.',
        },
        shouldShowCommercialAccessCta: false,
        submitLabel: 'Cotizar vuelo',
      }),
    })

    expect(wrapper.find('.hero-status-bar--alert').exists()).toBe(false)
    expect(wrapper.text()).toContain(
      'Tu cuenta ya puede cotizar, reservar, firmar contrato y pagar vuelos.',
    )
    expect(wrapper.find('.hero-status-bar__action').exists()).toBe(false)
  })
})
