/* @vitest-environment jsdom */

import { describe, expect, it, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ViajesActivos from '../features/client/viajes/ViajesActivos.vue'

function buildReservation(overrides = {}) {
  return {
    id: 142,
    origin: 'MMMM',
    destination: 'MMTO',
    date: '2026-06-27T03:00:00',
    passengers: 1,
    aircraft: 'GULFSTREAM G200',
    workflow_status: 'provider_pending',
    status: 'provider_pending',
    ...overrides,
  }
}

function mountTrips(props = {}) {
  return mount(ViajesActivos, {
    props: {
      reservations: [],
      selectedId: '',
      timeline: [],
      initialTab: 'proximos',
      refreshing: false,
      ...props,
    },
  })
}

describe('ViajesActivos', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps pending reservations in proximos even when the departure date has passed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-27T12:00:00'))

    const wrapper = mountTrips({
      reservations: [buildReservation()],
      initialTab: 'historial',
    })

    const activeTab = wrapper.findAll('.tabs button').find((button) => button.classes().includes('active'))

    expect(activeTab?.text()).toBe('Proximos')
    expect(wrapper.text()).toContain('Esperando proveedor')
  })

  it('does not mark a pending provider reservation as en curso after the departure time', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-27T12:00:00'))

    const wrapper = mountTrips({
      reservations: [buildReservation()],
    })

    expect(wrapper.text()).toContain('Pendiente de actualizar')
    expect(wrapper.text()).not.toContain('En curso')
  })
})
