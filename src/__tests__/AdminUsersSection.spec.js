/* @vitest-environment jsdom */

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AdminUsersSection from '../features/admin/AdminUsersSection.vue'

function mountUsers(users) {
  const pinia = createPinia()
  setActivePinia(pinia)

  return mount(AdminUsersSection, {
    props: {
      users,
      scope: 'client',
      hideRolePanel: true,
    },
    global: {
      plugins: [pinia],
    },
  })
}

function biometricUser(id, overrides = {}) {
  return {
    id,
    name: `Cliente ${id}`,
    email: `cliente${id}@test.com`,
    role: 'client',
    status: 'active',
    has_biometric_selfie: true,
    biometric_image_saved: true,
    biometric_selfie_path: `clientes/${id}/biometria/selfie.jpg`,
    identity_verification_status: 'approved',
    ...overrides,
  }
}

describe('AdminUsersSection biometric state', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders the biometric statuses exposed by Laravel', () => {
    const wrapper = mountUsers([
      biometricUser(1),
      biometricUser(2, { identity_verification_status: 'pending' }),
      biometricUser(3, { identity_verification_status: 'rejected' }),
      biometricUser(4, {
        has_biometric_selfie: false,
        biometric_image_saved: false,
        biometric_selfie_path: null,
        identity_verification_status: null,
      }),
    ])

    expect(wrapper.text()).toContain('Validada')
    expect(wrapper.text()).toContain('Pendiente de validacion')
    expect(wrapper.text()).toContain('Rechazada')
    expect(wrapper.text()).toContain('Sin selfie')

    wrapper.unmount()
  })

  it('treats the official string value zero as false even when fallback fields are truthy', () => {
    const wrapper = mountUsers([
      biometricUser(5, {
        has_biometric_selfie: '0',
        biometric_image_saved: '1',
        biometric_selfie_path: 'clientes/5/biometria/selfie.jpg',
      }),
    ])

    expect(wrapper.text()).toContain('Sin selfie')
    expect(wrapper.text()).not.toContain('Validada')

    wrapper.unmount()
  })
})
