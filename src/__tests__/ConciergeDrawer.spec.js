/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ConciergeDrawer from '../features/client/concierge/ConciergeDrawer.vue'
import { buildConciergeConfig } from '../features/client/concierge/conciergeConfig'

describe('ConciergeDrawer', () => {
  it('renders premium concierge sections and emits close/actions', async () => {
    const wrapper = mount(ConciergeDrawer, {
      props: {
        config: buildConciergeConfig({ customerName: 'Jose Luis Hernandez' }),
        isOpen: true,
      },
    })

    expect(wrapper.text()).toContain('CONCIERGE 24/7')
    expect(wrapper.text()).toContain('Hola, Jose Luis Hernandez')
    expect(wrapper.text()).toContain('¿CÓMO DESEAS COMUNICARTE?')
    expect(wrapper.text()).toContain('SERVICIOS CONCIERGE')

    await wrapper.findAll('.concierge-tile')[1].trigger('click')
    expect(wrapper.emitted('communication')?.[0]?.[0]?.id).toBe('whatsapp')

    await wrapper.findAll('.concierge-service-card')[0].trigger('click')
    expect(wrapper.emitted('service')?.[0]?.[0]?.id).toBe('flight')

    await wrapper.find('.concierge-header__close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('closes when escape is pressed', async () => {
    const wrapper = mount(ConciergeDrawer, {
      props: {
        config: buildConciergeConfig({ customerName: 'Jose' }),
        isOpen: true,
      },
    })

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
