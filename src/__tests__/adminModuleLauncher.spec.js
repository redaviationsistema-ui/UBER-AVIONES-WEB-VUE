/* @vitest-environment jsdom */

import { RouterLinkStub, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AdminModuleLauncher from '../components/workspace/AdminModuleLauncher.vue'
import {
  adminAllModulesGroup,
  adminModuleGroups,
  resolveAdminModuleGroup,
} from '../data/adminModules'

describe('admin module launcher config', () => {
  it('keeps the four admin launchpad groups with existing routes', () => {
    expect(adminModuleGroups.map((group) => group.label)).toEqual([
      'Cliente y Comercial',
      'Operacion y Proveedores',
      'Sobrecargos',
      'Control Interno',
    ])

    expect(resolveAdminModuleGroup('Cliente y Comercial')?.modules[0]?.route).toBe('/admin/clientes')
    expect(resolveAdminModuleGroup('Sobrecargos')?.modules.some((item) => item.route === '/admin/sobrecargos/disponibilidad')).toBe(true)
  })

  it('builds an aggregate group without duplicating route definitions', () => {
    expect(adminAllModulesGroup.modules.length).toBeGreaterThan(10)
    expect(adminAllModulesGroup.modules.some((item) => item.route === '/admin/sobrecargos/incidencias')).toBe(true)
  })
})

describe('AdminModuleLauncher', () => {
  it('renders compact cards and emits the footer actions', async () => {
    const wrapper = mount(AdminModuleLauncher, {
      props: {
        group: adminModuleGroups[0],
        activeSection: 'clientes',
      },
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    })

    expect(wrapper.find('h2').text()).toBe('Cliente y Comercial')
    expect(wrapper.findAllComponents(RouterLinkStub)).toHaveLength(adminModuleGroups[0].modules.length)
    expect(wrapper.find('.admin-module-card--active').text()).toContain('Clientes')

    await wrapper.find('.admin-module-launcher__footer-action').trigger('click')
    expect(wrapper.emitted('show-all')).toHaveLength(1)

    await wrapper.find('.admin-module-launcher-backdrop').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
