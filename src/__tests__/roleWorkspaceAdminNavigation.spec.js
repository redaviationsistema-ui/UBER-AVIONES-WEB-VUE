/* @vitest-environment jsdom */

import { RouterLinkStub, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

const pushMock = vi.fn()
const replaceMock = vi.fn()

vi.mock('vue-router', async () => {
  const actual = await vi.importActual('vue-router')
  return {
    ...actual,
    useRouter: () => ({
      push: pushMock,
      replace: replaceMock,
      currentRoute: {
        value: {
          fullPath: '/admin/ejecutivo',
        },
      },
    }),
  }
})

vi.mock('../stores/auth', () => ({
  useAuthStore: () => ({
    initialized: true,
    isAuthenticated: true,
    logout: vi.fn(),
    user: { name: 'Admin Test' },
  }),
}))

vi.mock('../stores/ui', () => ({
  useUiStore: () => ({
    pushToast: vi.fn(),
  }),
}))

vi.mock('../lib/companyDisplay', () => ({
  resolveBestCompanyDisplayName: () => 'Sky Group',
}))

describe('RoleWorkspace admin navigation', () => {
  afterEach(() => {
    pushMock.mockReset()
    replaceMock.mockReset()
  })

  it('pushes the admin route when a desktop admin submenu card is clicked', async () => {
    const RoleWorkspace = (await import('../components/RoleWorkspace.vue')).default

    const wrapper = mount(RoleWorkspace, {
      props: {
        activeRole: 'admin',
        role: { id: 'admin', label: 'Admin' },
        section: 'ejecutivo',
      },
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
          BrandLogo: true,
          AdminPortal: true,
        },
      },
    })

    const groupButton = wrapper
      .findAll('button.workspace-menu-group')
      .find((node) => node.text().includes('Cliente y Comercial'))

    expect(groupButton).toBeTruthy()

    await groupButton.trigger('click')

    const targetLink = wrapper
      .findAllComponents(RouterLinkStub)
      .find((node) => node.props('to')?.name === 'admin' && node.props('to')?.params?.section === 'clientes')

    expect(targetLink).toBeTruthy()

    await targetLink.trigger('click')

    expect(pushMock).toHaveBeenCalledWith({ name: 'admin', params: { section: 'clientes' } })
  })
})
