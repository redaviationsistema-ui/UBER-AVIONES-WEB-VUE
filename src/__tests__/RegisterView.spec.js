/* @vitest-environment jsdom */

import { flushPromises, mount } from '@vue/test-utils'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const pushMock = vi.fn()
const registerMock = vi.fn()
const clearAuthMock = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
  useRoute: () => ({
    query: {
      role: 'provider',
    },
  }),
  RouterLink: {
    template: '<a><slot /></a>',
  },
}))

vi.mock('../stores/auth', () => ({
  useAuthStore: () => ({
    loading: false,
    register: registerMock,
    clearAuth: clearAuthMock,
  }),
}))

import RegisterView from '../views/RegisterView.vue'

beforeAll(() => {
  Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
})

describe('RegisterView', () => {
  it('keeps provider registration on step 2 when company email is invalid', async () => {
    const wrapper = mount(RegisterView, {
      global: {
        stubs: {
          BrandLogo: { template: '<div />' },
        },
      },
    })

    await flushPromises()
    await wrapper.find('.wizard-actions .primary-button').trigger('click')
    await flushPromises()

    Object.assign(wrapper.vm.form, {
      companyName: 'Sky Group',
      legalName: 'Sky Group SA de CV',
      companyPhone: '+52 55 1234 5678',
      companyEmail: '98765432',
      name: 'JUAN PEREZ',
      phone: '+52 55 7654 3210',
      birthDate: '1990-01-10',
      documentType: 'INE o identificacion oficial',
      documentNumber: 'ABC123456',
      documentExpiration: '2030-10-10',
      nationality: 'Mexicana',
      ineCurp: 'PEPJ900110HDFRRN09',
      ineFront: new File(['front'], 'front.jpg', { type: 'image/jpeg' }),
      ineBack: new File(['back'], 'back.jpg', { type: 'image/jpeg' }),
      identificationUploadStatus: 'saved',
      identificationDocumentId: 'doc-123',
    })

    await wrapper.find('.wizard-actions .primary-button').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Empresa y representante legal')
    expect(wrapper.text()).toContain('Ingresa un correo electrónico válido.')
    expect(wrapper.vm.currentStep).toBe(1)
    expect(registerMock).not.toHaveBeenCalled()
    expect(pushMock).not.toHaveBeenCalled()
    expect(clearAuthMock).not.toHaveBeenCalled()
  })
})
