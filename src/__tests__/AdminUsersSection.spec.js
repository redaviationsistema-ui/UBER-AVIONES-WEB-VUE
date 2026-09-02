/* @vitest-environment jsdom */

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import AdminUsersSection from '../features/admin/AdminUsersSection.vue'

const { requestWithCandidates } = vi.hoisted(() => ({
  requestWithCandidates: vi.fn(),
}))

vi.mock('../lib/backendCrud', async (importOriginal) => ({
  ...(await importOriginal()),
  requestWithCandidates,
}))

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

function detailUser(id, overrides = {}) {
  return {
    id,
    name: `Cliente ${id}`,
    email: `cliente${id}@test.com`,
    role: 'client',
    status: 'active',
    profile: {
      document_type: 'INE',
      ine_front_path: `identity/ine/front/${id}.jpg`,
      ine_back_path: `identity/ine/back/${id}.jpg`,
    },
    has_biometric_selfie: true,
    biometric_image_saved: true,
    biometric_selfie_path: `clientes/${id}/biometria/selfie.jpg`,
    identity_verification_status: 'approved',
    identity_verifications: [
      {
        status: 'approved',
        face_detected: true,
        faces_count: 1,
        face_confidence: 100,
      },
    ],
    ...overrides,
  }
}

async function openDetail(wrapper) {
  await wrapper.get('[aria-label="Abrir acciones"]').trigger('click')
  await wrapper.get('.mini-action-item').trigger('click')
  await vi.waitFor(() => expect(wrapper.find('.detail-panel').exists()).toBe(true))
}

describe('AdminUsersSection biometric state', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    requestWithCandidates.mockReset()
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

  it('keeps the complete modal layout when identity assets are missing', async () => {
    const user = biometricUser(94)
    requestWithCandidates.mockResolvedValue({ user: detailUser(94) })
    const wrapper = mountUsers([user])

    await openDetail(wrapper)

    expect(wrapper.find('.modal-panel.detail-panel').exists()).toBe(true)
    expect(wrapper.text()).toContain('Cuenta')
    expect(wrapper.findAll('.document-unavailable')).toHaveLength(2)
    expect(wrapper.find('.biometric-preview-card').text()).toContain('Archivo no disponible')
    expect(wrapper.text()).toContain('Confianza')
    expect(wrapper.text()).toContain('Numero de rostros')
    expect(wrapper.findAll('.biometric-preview-card strong').filter((node) => node.text() === 'Archivo no disponible')).toHaveLength(1)

    wrapper.unmount()
  })

  it('renders available identity assets without unavailable states', async () => {
    const user = biometricUser(95)
    requestWithCandidates.mockResolvedValue({
      user: detailUser(95, {
        profile: {
          document_type: 'INE',
          ine_front_path: 'identity/ine/front/95.jpg',
          ine_back_path: 'identity/ine/back/95.jpg',
          ine_front_url: '/api/v1/public/identity/ine/95/front?signature=front',
          ine_back_url: '/api/v1/public/identity/ine/95/back?signature=back',
        },
        biometric_selfie_url: '/api/v1/public/biometric/selfies/95?signature=selfie',
      }),
    })
    const wrapper = mountUsers([user])

    await openDetail(wrapper)

    expect(wrapper.findAll('.detail-media-image')).toHaveLength(2)
    expect(wrapper.find('.biometric-preview-image').attributes('src')).toContain('/api/v1/public/biometric/selfies/95')
    expect(wrapper.findAll('.document-unavailable')).toHaveLength(0)
    expect(wrapper.find('.biometric-preview-card').text()).not.toContain('Archivo no disponible')

    wrapper.unmount()
  })
})
