/* @vitest-environment jsdom */

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AdminReservationsSection from '../features/admin/AdminReservationsSection.vue'

const reservation = {
  id: 115,
  clientName: 'Cliente Prueba',
  clientCompany: 'Cuenta individual',
  route: 'MMTO -> MMMM',
  aircraft: 'LEGACY 600',
  departure: '2026-05-31T15:00:00.000000Z',
  status: 'contract_pending',
  workflowStatus: 'contract_pending',
  contractStatus: 'generated',
  paymentStatus: 'Pendiente de pago',
  adminFlowState: 'active',
  raw: {},
}

describe('AdminReservationsSection', () => {
  it('renders the backend flow error inside the admin flow form', () => {
    const wrapper = mount(AdminReservationsSection, {
      props: {
        reservations: [reservation],
        flowErrorMessage:
          'No puedes mover el vuelo a tracking en vivo sin una sobrecargo asignada.',
      },
    })

    expect(wrapper.text()).toContain(
      'No puedes mover el vuelo a tracking en vivo sin una sobrecargo asignada.',
    )
  })
})
