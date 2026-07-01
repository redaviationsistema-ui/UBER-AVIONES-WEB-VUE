/* @vitest-environment jsdom */

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AdminWorkspaceHeader from '../components/workspace/AdminWorkspaceHeader.vue'

describe('AdminWorkspaceHeader', () => {
  it('renders the active admin section with principles and grouped items', () => {
    const wrapper = mount(AdminWorkspaceHeader, {
      props: {
        section: 'reservas',
        currentSectionLabel: 'Flujo del cliente',
        currentGroup: {
          label: 'Cliente y Comercial',
          items: [
            { id: 'clientes', label: 'Clientes' },
            { id: 'reservas', label: 'Flujo del cliente' },
            { id: 'contratos', label: 'Contratos' },
          ],
        },
        groupedMenu: [
          {
            label: 'Cliente y Comercial',
            items: [
              { id: 'clientes', label: 'Clientes' },
              { id: 'reservas', label: 'Flujo del cliente' },
              { id: 'contratos', label: 'Contratos' },
            ],
          },
        ],
      },
    })

    expect(wrapper.text()).toContain('Flujo del cliente')
    expect(wrapper.text()).toContain('Mesa comercial')
    expect(wrapper.text()).toContain('Cambios graduales y compatibles con flujos ya existentes.')
    expect(wrapper.find('.admin-workspace-sections__item--active').text()).toContain(
      'Flujo del cliente',
    )
  })
})
