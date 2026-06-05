import { describe, expect, it } from 'vitest'

import { flushPromises, mount } from '@vue/test-utils'
import App from '../App.vue'
import router from '../router'
import { pinia } from '../stores'

describe('App', () => {
  it('mounts the Sky Group platform', async () => {
    window.scrollTo = () => {}
    await router.push('/')
    await router.isReady()

    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Sky Group')
    expect(wrapper.text()).toContain('Membresias')
    expect(wrapper.text()).toContain('Reservar')
  })
})
