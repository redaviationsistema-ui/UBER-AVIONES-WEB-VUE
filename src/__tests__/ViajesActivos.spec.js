/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'
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

    const activeTab = wrapper
      .findAll('.tabs button')
      .find((button) => button.classes().includes('active'))

    expect(activeTab?.text()).toContain('Proximos')
    expect(wrapper.text()).toContain('Esperando proveedor')
  })

  it('does not mark a pending provider reservation as en curso after the departure time', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-27T12:00:00'))

    const wrapper = mountTrips({
      reservations: [buildReservation()],
    })

    expect(wrapper.find('.status-badge').text()).toContain('Esperando proveedor')
  })

  it('renders the aircraft image from visibility payload aircraft records', () => {
    const wrapper = mountTrips({
      reservations: [
        buildReservation({
          status: 'flight_confirmed',
          workflow_status: 'flight_confirmed',
          visibility_payload: {
            aircraft: {
              model: 'LEARJET 31A',
              main_image_url: 'https://example.com/learjet-visibility.png',
            },
          },
        }),
      ],
      initialTab: 'activos',
    })

    const aircraftImage = wrapper.find('.executive-card__media img')

    expect(aircraftImage.exists()).toBe(true)
    expect(aircraftImage.attributes('src')).toBe('https://example.com/learjet-visibility.png')
    expect(wrapper.text()).not.toContain('Jet privado')
  })

  it('renders the aircraft image from matched option aircraft records', () => {
    const wrapper = mountTrips({
      reservations: [
        buildReservation({
          status: 'tracking_live',
          workflow_status: 'tracking_live',
          matched_options: [
            {
              id: 'match-learjet',
              aircraft: {
                model: 'LEARJET 31A',
                main_image: 'https://example.com/learjet-match.png',
              },
            },
          ],
        }),
      ],
      initialTab: 'activos',
    })

    const aircraftImage = wrapper.find('.executive-card__media img')

    expect(aircraftImage.exists()).toBe(true)
    expect(aircraftImage.attributes('src')).toBe('https://example.com/learjet-match.png')
    expect(wrapper.text()).not.toContain('Jet privado')
  })

  it('renders a safe generated aircraft image when the reservation has no aircraft photo', () => {
    const wrapper = mountTrips({
      reservations: [
        buildReservation({
          status: 'flight_confirmed',
          workflow_status: 'flight_confirmed',
          aircraft: 'LEARJET 31A',
          aircraft_category: 'Light Jet',
        }),
      ],
      initialTab: 'activos',
    })

    const aircraftImage = wrapper.find('.executive-card__media img')

    expect(aircraftImage.exists()).toBe(true)
    expect(aircraftImage.attributes('src')).toContain('data:image/svg+xml')
    expect(wrapper.text()).not.toContain('Jet privado')
  })

  it('falls back to a generated aircraft image when the remote image fails to load', async () => {
    const wrapper = mountTrips({
      reservations: [
        buildReservation({
          status: 'tracking_live',
          workflow_status: 'tracking_live',
          aircraft: 'LEARJET 31A',
          visibility_payload: {
            aircraft: {
              main_image_url: 'https://example.com/broken-learjet.png',
            },
          },
        }),
      ],
      initialTab: 'activos',
    })

    const aircraftImage = wrapper.find('.executive-card__media img')

    expect(aircraftImage.attributes('src')).toBe('https://example.com/broken-learjet.png')

    await aircraftImage.trigger('error')

    expect(aircraftImage.element.getAttribute('src')).toContain('data:image/svg+xml')
    expect(aircraftImage.element.dataset.fallbackApplied).toBe('true')
  })

  it('shows the paid and reserved aircraft copy when payment_status is paid', () => {
    const wrapper = mountTrips({
      reservations: [
        buildReservation({
          status: 'payment_confirmed',
          workflow_status: 'payment_confirmed',
          payment_status: 'paid',
        }),
      ],
      initialTab: 'proximos',
    })

    expect(wrapper.text()).toContain('Pagado · Aeronave reservada')
  })
})
