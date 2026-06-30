/* @vitest-environment jsdom */

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AdminCrewOperationsSection from '../features/admin/AdminCrewOperationsSection.vue'

const crewMembers = [
  {
    id: 7,
    name: 'Jimena A.',
    providerName: 'Proveedor Demo',
    base: 'MMTO',
    state: 'en vuelo',
    profileState: 'aprobado',
  },
]

const operations = [
  {
    id: 151,
    folio: 'RA-151',
    route: 'MMVR -> MMTO',
    departure: '2026-06-29T09:00:00',
    aircraft: 'GULFSTREAM G450',
    crew: 'Jimena A.',
    crewId: 7,
    workflowStatus: 'tracking_live',
  },
  {
    id: 150,
    folio: 'RA-150',
    route: 'MMMM -> MMTO',
    departure: '2026-06-29T10:00:00',
    aircraft: 'LEARJET 31A',
    workflowStatus: 'flight_confirmed',
  },
]

describe('AdminCrewOperationsSection', () => {
  it('renders the in-flight workspace as a dedicated assigned-only view', () => {
    const wrapper = mount(AdminCrewOperationsSection, {
      props: {
        crewMembers,
        operations,
        auditEntries: [],
        viewMode: 'in-flight',
      },
    })

    expect(wrapper.text()).toContain('Vista dedicada para seguir vuelos con sobrecargo asignado')
    expect(wrapper.text()).toContain('Sobrecargos actualmente en vuelo')
    expect(wrapper.text()).toContain('RA-151')
    expect(wrapper.text()).not.toContain('RA-150')
    expect(wrapper.text()).toContain('En vuelo')
    expect(wrapper.text()).not.toContain('Sobrecargos listos para asignarse')
  })
})
