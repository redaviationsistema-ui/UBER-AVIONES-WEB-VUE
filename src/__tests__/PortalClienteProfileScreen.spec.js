/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PortalClienteProfileScreen from '../features/client/portal/PortalClienteProfileScreen.vue'

function buildProps(overrides = {}) {
  return {
    accessSource: {
      access_expires_at: '2026-07-29',
    },
    activePaymentBadge: '',
    activePlan: 'Acceso vencido 2026-07-29',
    commercialAccessCtaLabel: 'Reactivar acceso comercial',
    commercialAccessRenewalPanel: {
      tone: 'danger',
      title: 'Renovación automática vencida',
      message: 'La vigencia ya expiró y hace falta reactivar el pago.',
      outcome: 'El acceso requiere reactivación inmediata.',
      rows: [
        { label: 'Próximo corte', value: 'Reactivación inmediata' },
        { label: 'Último pago confirmado', value: '29 de junio de 2026' },
      ],
    },
    hasActiveClientAccess: false,
    isCommercialAccessExpired: () => true,
    otherSectionCardCopy: {},
    profileDisplayName: 'JOSE LUIS HERNANDEZ',
    profileEmail: 'red@gmail.com',
    profileInitials: 'JL',
    profilePhone: '1234567596',
    profileStats: [],
    section: 'perfil',
    shouldShowCommercialAccessCta: true,
    userFirstName: 'Jose',
    ...overrides,
  }
}

describe('PortalClienteProfileScreen', () => {
  it('shows the reactivation CTA when commercial access needs payment', async () => {
    const wrapper = mount(PortalClienteProfileScreen, {
      props: buildProps(),
    })

    expect(wrapper.text()).toContain('Renovación automática vencida')
    expect(wrapper.text()).toContain('Reactivar acceso comercial')

    await wrapper.get('button.profile-panel__action').trigger('click')

    expect(wrapper.emitted('go-commercial-access-payment')).toHaveLength(1)
  })

  it('hides the reactivation CTA when access does not require payment', () => {
    const wrapper = mount(PortalClienteProfileScreen, {
      props: buildProps({
        commercialAccessCtaLabel: '',
        shouldShowCommercialAccessCta: false,
        isCommercialAccessExpired: () => false,
      }),
    })

    expect(wrapper.find('button.profile-panel__action').exists()).toBe(false)
  })
})
