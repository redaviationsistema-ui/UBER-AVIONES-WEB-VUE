/* @vitest-environment jsdom */

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

const pushMock = vi.fn()

vi.mock('vue-router', async () => {
  const actual = await vi.importActual('vue-router')
  return {
    ...actual,
    useRouter: () => ({
      push: pushMock,
      currentRoute: {
        value: {
          fullPath: '/admin/ejecutivo',
        },
      },
    }),
  }
})

describe('AdminExecutiveSection navigation', () => {
  afterEach(() => {
    pushMock.mockReset()
  })

  it('navigates to the selected admin section from executive cards', async () => {
    const AdminExecutiveSection = (await import('../features/admin/AdminExecutiveSection.vue')).default

    const wrapper = mount(AdminExecutiveSection, {
      props: {
        kpis: [
          { label: 'Ingresos netos', value: '$0', detail: 'Test' },
          { label: 'Cotizaciones emitidas', value: '0', detail: 'Test' },
        ],
        analytics: [{ label: 'Conversion', value: '0%', score: 0 }],
        recentActivity: [],
        loading: false,
        errorMessage: '',
      },
    })

    const target = wrapper
      .findAll('button')
      .find((node) => node.text().includes('Clientes'))

    expect(target).toBeTruthy()

    await target.trigger('click')

    expect(pushMock).toHaveBeenCalledWith({ name: 'admin', params: { section: 'clientes' } })
  })
})
