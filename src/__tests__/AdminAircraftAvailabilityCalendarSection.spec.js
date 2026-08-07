/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import AdminAircraftAvailabilityCalendarSection from '../features/admin/AdminAircraftAvailabilityCalendarSection.vue'

const { push, requestWithCandidates } = vi.hoisted(() => ({
  push: vi.fn(),
  requestWithCandidates: vi.fn(),
}))

vi.mock('../lib/backendCrud', async (importOriginal) => {
  const actual = await importOriginal()

  return {
    ...actual,
    requestWithCandidates,
  }
})

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push,
  }),
}))

function mountCalendar(props = {}) {
  return mount(AdminAircraftAvailabilityCalendarSection, {
    props: {
      providers: [],
      aircraft: [],
      ...props,
    },
  })
}

function findFirstEventCell(wrapper) {
  return wrapper.find('[data-has-event="true"]')
}

describe('AdminAircraftAvailabilityCalendarSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-10T10:00:00'))

    requestWithCandidates.mockImplementation(async (candidates = []) => {
      const path = candidates[0]?.path || ''

      if (path === '/admin/aircraft-calendar') {
        return {
          calendar: [
            {
              id: 101,
              aircraft_id: 12,
              aircraft_name: 'XA-RED1 · Learjet 31A',
              registration: 'XA-RED1',
              model: 'Learjet 31A',
              company_id: 3,
              company_name: 'Red Aviation',
              reservation_id: 154,
              reservation_code: 'PV-TEST-154',
              client_name: 'Juan Perez',
              origin: 'MMTO',
              destination: 'MMMX',
              start: '2026-07-10T09:00:00',
              end: '2026-07-10T13:30:00',
              start_date: '2026-07-10',
              status: 'paid',
              block_status: 'active',
              payment_status: 'paid',
              reason: 'Reserva pagada',
              color: '#22c55e',
            },
          ],
          aircraft: [
            {
              id: 12,
              company_id: 3,
              company_name: 'Red Aviation',
              aircraft_name: 'XA-RED1 · Learjet 31A',
              registration: 'XA-RED1',
              model: 'Learjet 31A',
            },
          ],
          companies: [{ id: 3, name: 'Red Aviation' }],
          summary: {
            total_aircraft: 1,
            available_aircraft: 0,
            occupied_aircraft: 1,
            maintenance_aircraft: 0,
            upcoming_flights_today: 0,
            flights_by_company: [{ company_id: 3, company_name: 'Red Aviation', total: 1 }],
          },
        }
      }

      if (path === '/admin/operations/dashboard') {
        return {
          dashboard: {
            flights_today: 1,
            aircraft_available: 0,
            aircraft_occupied: 1,
            aircraft_maintenance: 0,
            payments_pending: 2,
            contracts_pending: 1,
            upcoming_flights: [
              {
                block_id: 101,
                aircraft_name: 'XA-RED1 · Learjet 31A',
                client_name: 'Juan Perez',
                start: '2026-07-10T09:00:00',
              },
            ],
            operational_alerts: [
              {
                type: 'availability_conflict',
                title: 'Conflicto de disponibilidad detectado',
                message: 'La aeronave 12 tiene bloques solapados.',
              },
            ],
          },
        }
      }

      if (path === '/admin/operations/history') {
        return {
          history: {
            data: [
              {
                id: 77,
                action: 'reservation_rescheduled',
                description: 'Reserva reprogramada.',
                created_at: '2026-07-10T08:00:00',
                user: { name: 'Admin' },
              },
            ],
          },
        }
      }

      if (path === '/admin/operations/notifications') {
        return {
          notifications: {
            data: [
              {
                id: 88,
                title: 'Vuelo reprogramado',
                message: 'La reserva PV-TEST-154 fue reprogramada.',
                created_at: '2026-07-10T08:05:00',
              },
            ],
          },
        }
      }

      if (path === '/admin/operations/aircraft-blocks') {
        return {
          block: { id: 201, aircraft_id: 12 },
        }
      }

      if (path === '/admin/operations/aircraft-blocks/101/release') {
        return {
          block: { id: 101, status: 'released' },
        }
      }

      return {}
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders calendar events, opens the detail modal and navigates to reservation flow', async () => {
    const wrapper = mountCalendar()
    await flushPromises()

    expect(wrapper.text()).toContain('Calendario Operativo de Flota')
    expect(wrapper.text()).toContain('Red Aviation')
    expect(wrapper.text()).toContain('XA-RED1')
    expect(wrapper.text()).toContain('Pendientes')
    expect(wrapper.text()).toContain('Resumen')
    expect(wrapper.text()).toContain('Nuevo bloqueo')
    expect(wrapper.text()).toContain('Disponible')

    const firstEventCell = findFirstEventCell(wrapper)
    expect(firstEventCell).toBeTruthy()
    await firstEventCell?.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Detalle del evento')
    expect(wrapper.text()).toContain('Juan Perez')
    expect(wrapper.text()).toContain('PV-TEST-154')

    const actionButton = wrapper
      .findAll('.calendar-modal__actions button')
      .find((button) => button.text().includes('Ir al flujo de reserva'))

    await actionButton.trigger('click')

    expect(push).toHaveBeenCalledWith({
      path: '/admin/reservas',
      query: {
        reservation: '154',
      },
    })
  })

  it('uses fallback provider and aircraft props without crashing when the API responds with sparse payloads', async () => {
    requestWithCandidates.mockImplementation(async (candidates = []) => {
      const path = candidates[0]?.path || ''
      if (path === '/admin/aircraft-calendar') {
        return {
          calendar: [],
          summary: {
            total_aircraft: 0,
            available_aircraft: 0,
            occupied_aircraft: 0,
            maintenance_aircraft: 0,
            upcoming_flights_today: 0,
            flights_by_company: [],
          },
        }
      }

      if (path === '/admin/operations/dashboard') {
        return { dashboard: { upcoming_flights: [], operational_alerts: [] } }
      }

      if (path === '/admin/operations/history') {
        return { history: { data: [] } }
      }

      if (path === '/admin/operations/notifications') {
        return { notifications: { data: [] } }
      }

      return {}
    })

    const wrapper = mountCalendar({
      providers: [{ id: 7, commercial_name: 'Fallback Operator' }],
      aircraft: [{ id: 55, provider_id: 7, registration: 'XA-FALL', model: 'Citation XLS' }],
    })

    await flushPromises()

    const companyOptions = wrapper.findAll('select').at(0)?.findAll('option') || []
    const aircraftOptions = wrapper.findAll('select').at(1)?.findAll('option') || []

    expect(companyOptions.some((option) => option.text().includes('Fallback Operator'))).toBe(true)
    expect(aircraftOptions.some((option) => option.text().includes('XA-FALL'))).toBe(true)
    expect(wrapper.text()).toContain('XA-FALL')
    expect(wrapper.text()).toContain('Citation XLS')
    expect(wrapper.text()).not.toContain('No hay aeronaves para este filtro.')
  })

  it('creates and releases manual aircraft blocks from the calendar workspace', async () => {
    const wrapper = mountCalendar()
    await flushPromises()

    await wrapper.find('.calendar-primary-button').trigger('click')
    await flushPromises()

    const selects = wrapper.findAll('select')
    await selects.at(3)?.setValue('12')
    await selects.at(4)?.setValue('maintenance')
    await wrapper.find('input[type="datetime-local"]').setValue('2026-07-12T08:00')
    await wrapper.findAll('input[type="datetime-local"]').at(1)?.setValue('2026-07-12T18:00')
    await wrapper.find('input[type="text"]').setValue('Mantenimiento preventivo')
    await wrapper.find('.manual-block-form button').trigger('click')
    await flushPromises()

    expect(requestWithCandidates).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'post',
          path: '/admin/operations/aircraft-blocks',
        }),
      ]),
    )

    const firstEventCell = findFirstEventCell(wrapper)
    expect(firstEventCell).toBeTruthy()
    await firstEventCell?.trigger('click')
    await flushPromises()
    const releaseButton = wrapper
      .findAll('.calendar-modal__actions button')
      .find((button) => button.text().includes('Liberar bloqueo'))
    await releaseButton.trigger('click')
    await flushPromises()

    expect(requestWithCandidates).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'post',
          path: '/admin/operations/aircraft-blocks/101/release',
        }),
      ]),
    )
  })

  it('validates the manual block form before posting when end is before start', async () => {
    const wrapper = mountCalendar()
    await flushPromises()

    await wrapper.find('.calendar-primary-button').trigger('click')
    await flushPromises()

    const selects = wrapper.findAll('select')
    await selects.at(3)?.setValue('12')
    await wrapper.find('input[type="datetime-local"]').setValue('2026-07-12T18:00')
    await wrapper.findAll('input[type="datetime-local"]').at(1)?.setValue('2026-07-12T08:00')
    await wrapper.find('.manual-block-form button').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('La fecha fin debe ser posterior al inicio.')
    expect(requestWithCandidates).not.toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'post',
          path: '/admin/operations/aircraft-blocks',
        }),
      ]),
    )
  })

  it('keeps the calendar usable when the dashboard endpoint fails', async () => {
    requestWithCandidates.mockImplementation(async (candidates = []) => {
      const path = candidates[0]?.path || ''

      if (path === '/admin/aircraft-calendar') {
        return {
          calendar: [
            {
              id: 101,
              aircraft_id: 12,
              aircraft_name: 'XA-RED1 · Learjet 31A',
              registration: 'XA-RED1',
              model: 'Learjet 31A',
              company_id: 3,
              company_name: 'Red Aviation',
              reservation_id: 154,
              reservation_code: 'PV-TEST-154',
              client_name: 'Juan Perez',
              origin: 'MMTO',
              destination: 'MMMX',
              start: '2026-07-10T09:00:00',
              end: '2026-07-10T13:30:00',
              start_date: '2026-07-10',
              status: 'paid',
              block_status: 'active',
              payment_status: 'paid',
              reason: 'Reserva pagada',
              color: '#22c55e',
            },
          ],
          aircraft: [
            {
              id: 12,
              company_id: 3,
              company_name: 'Red Aviation',
              aircraft_name: 'XA-RED1 · Learjet 31A',
              registration: 'XA-RED1',
              model: 'Learjet 31A',
            },
          ],
          companies: [{ id: 3, name: 'Red Aviation' }],
        }
      }

      if (path === '/admin/operations/dashboard') {
        throw new Error('dashboard unavailable')
      }

      return {}
    })

    const wrapper = mountCalendar()
    await flushPromises()

    expect(wrapper.text()).toContain('XA-RED1')
    expect(wrapper.text()).toContain('Calendario operativo')
    expect(wrapper.text()).not.toContain('No fue posible cargar el calendario de disponibilidad.')
  })
})
