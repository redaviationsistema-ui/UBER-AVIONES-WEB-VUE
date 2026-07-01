/* @vitest-environment jsdom */

import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { describe, expect, it } from 'vitest'

import AdminSectionScaffold from '../features/admin/AdminSectionScaffold.vue'

describe('AdminSectionScaffold', () => {
  it('renders shared admin framing for any section view', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/admin/clientes', component: { template: '<div />' } },
        { path: '/admin/reservas', component: { template: '<div />' } },
      ],
    })

    await router.push('/admin/clientes')
    await router.isReady()

    const wrapper = mount(AdminSectionScaffold, {
      props: {
        title: 'Clientes',
        description: 'Cuentas activas, pagos, historial comercial y seguimiento VIP.',
        descriptor: {
          title: 'Mesa comercial',
          headline: 'Conversion, contratos y dinero bajo una misma lectura.',
          pattern: 'Comercial',
        },
        activeSection: {
          id: 'clientes',
          label: 'Clientes',
        },
        siblingSections: [
          { id: 'clientes', label: 'Clientes', description: 'Vista comercial activa.' },
          { id: 'reservas', label: 'Flujo del cliente', description: 'Pipeline operativo.' },
        ],
        metrics: [
          { label: 'Grupo activo', value: 'Cliente y Comercial' },
          { label: 'Secciones visibles', value: '2' },
          { label: 'Vista actual', value: 'Clientes' },
        ],
      },
      slots: {
        default: '<div class="inner-view">Contenido interno</div>',
      },
      global: {
        plugins: [router],
      },
    })

    expect(wrapper.text()).toContain('Mesa comercial')
    expect(wrapper.text()).toContain('Clientes')
    expect(wrapper.text()).toContain('Contenido interno')
    expect(wrapper.find('.admin-section-scaffold__rail-link--active').text()).toContain('Clientes')
  })
})
