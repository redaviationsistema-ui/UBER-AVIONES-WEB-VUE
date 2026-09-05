/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ClientFlightBrief from '../features/client/portal/components/ClientFlightBrief.vue'

function buildFlightBrief(overrides = {}) {
  return {
    flight_request_id: 27,
    visible: true,
    payment: { confirmed: true, status: 'paid', paid_at: '2026-09-12T16:30:00.000000Z' },
    flight: {
      origin: 'TLC',
      destination: 'CUN',
      date: '2026-09-12',
      time: '10:30',
      aircraft: 'Gulfstream G-IV',
      departure_datetime: '2026-09-12T10:30:00.000000Z',
      arrival_datetime: '2026-09-12T12:35:00.000000Z',
      duration_hours: 2.083333,
    },
    departure: { code: 'TLC', airport_name: 'Aeropuerto de Toluca', city: 'Toluca' },
    arrival: { code: 'CUN', airport_name: 'Aeropuerto de Cancun', city: 'Cancun' },
    aircraft: {
      model: 'Gulfstream G-IV',
      registration: 'XA-TEST',
      image_url: 'https://cdn.example.test/giv.jpg',
    },
    passengers: { count: 5 },
    provider: { assigned: true, visible_name: null, status: null },
    operation: { id: 88, status: 'confirmada', crew_status: 'preflight_in_progress' },
    crew: {
      required: null,
      assigned: true,
      confirmed: true,
      status: 'confirmed',
      visible_name: 'Sofia Herrera',
    },
    checklist: {
      exists: true,
      completed: 7,
      total: 10,
      required_completed: 7,
      required_total: 10,
      percentage: 70,
      is_complete: false,
      submitted_at: null,
    },
    readiness: {
      ready: false,
      code: 'checklist_in_progress',
      label: 'Preparación en progreso.',
    },
    ...overrides,
  }
}

describe('ClientFlightBrief', () => {
  it('renders the supplied flight brief without exposing unavailable provider data', () => {
    const wrapper = mount(ClientFlightBrief, { props: { flightBrief: buildFlightBrief() } })

    expect(wrapper.text()).toContain('Flight Brief')
    expect(wrapper.text()).toContain('TLC')
    expect(wrapper.text()).toContain('CUN')
    expect(wrapper.text()).toContain('Pago confirmado')
    expect(wrapper.text()).toContain('Preparación en curso')
    expect(wrapper.text()).toContain('Preparación 70%')
    expect(wrapper.text()).not.toContain('Matrícula')
    expect(wrapper.text()).not.toContain('Tu aeronave')
    expect(wrapper.text()).toContain('Sofia Herrera')
    expect(wrapper.text()).not.toContain('null')
    expect(wrapper.text()).not.toContain('undefined')
  })

  it('renders a partial checklist using the backend percentage and explains when tracking is unavailable', async () => {
    const wrapper = mount(ClientFlightBrief, { props: { flightBrief: buildFlightBrief() } })

    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('70')
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.text()).toContain('El seguimiento estará disponible cuando inicie la preparación operacional.')
  })

  it('handles a completed checklist and no assigned crew', () => {
    const wrapper = mount(ClientFlightBrief, {
      props: {
        flightBrief: buildFlightBrief({
          crew: { assigned: false, confirmed: false, status: null, visible_name: null },
          checklist: {
            exists: true,
            completed: 10,
            total: 10,
            required_completed: 10,
            required_total: 10,
            percentage: 100,
            is_complete: true,
            submitted_at: '2026-09-12T15:00:00.000000Z',
          },
          readiness: { ready: true, code: 'ready', label: 'Listo para salida.' },
        }),
      },
    })

    expect(wrapper.text()).toContain('Sin asignación')
    expect(wrapper.text()).toContain('Todo listo para la salida')
    expect(wrapper.text()).toContain('100%')
    expect(wrapper.text()).toContain('Listo para salida')
  })

  it('renders safe placeholders without a brief or checklist counts', () => {
    const wrapper = mount(ClientFlightBrief, { props: { flightBrief: null } })

    expect(wrapper.text()).toContain('Por confirmar')
    expect(wrapper.text()).toContain('Estamos coordinando los preparativos necesarios antes de tu salida.')
    expect(wrapper.text()).not.toContain('NaN')
    expect(wrapper.text()).not.toContain('0 / 0')
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false)
  })

  it('replaces every dynamic value when the selected flight brief changes', async () => {
    const wrapper = mount(ClientFlightBrief, { props: { flightBrief: buildFlightBrief() } })

    expect(wrapper.text()).toContain('TLC')
    expect(wrapper.text()).toContain('Preparación 70%')

    await wrapper.setProps({
      flightBrief: buildFlightBrief({
        flight: {
          departure_datetime: '2026-10-04T14:00:00.000000Z',
          arrival_datetime: '2026-10-04T15:30:00.000000Z',
          duration_hours: 1.5,
        },
        departure: { code: 'GDL', airport_name: 'Aeropuerto de Guadalajara', city: 'Guadalajara' },
        arrival: { code: 'ZLO', airport_name: 'Aeropuerto de Manzanillo', city: 'Manzanillo' },
        aircraft: {
          model: 'Citation XLS',
          registration: 'XA-NEXT',
          image_url: 'https://cdn.example.test/xls.jpg',
        },
        passengers: { count: 8 },
        checklist: {
          exists: true,
          completed: 10,
          total: 10,
          required_completed: 10,
          required_total: 10,
          percentage: 100,
          is_complete: true,
          submitted_at: '2026-10-04T12:00:00.000000Z',
        },
      }),
    })

    expect(wrapper.text()).toContain('GDL')
    expect(wrapper.text()).toContain('Preparación 100%')
    expect(wrapper.findAll('.flight-brief__aircraft-visual img')).toHaveLength(1)
  })

  it('updates the displayed checklist after successive fresh payloads', async () => {
    const wrapper = mount(ClientFlightBrief, {
      props: { flightBrief: buildFlightBrief({ checklist: { exists: true, completed: 3, total: 10, percentage: 30, is_complete: false } }) },
    })

    expect(wrapper.text()).toContain('Preparación 30%')
    await wrapper.setProps({ flightBrief: buildFlightBrief({ checklist: { exists: true, completed: 7, total: 10, percentage: 70, is_complete: false } }) })
    expect(wrapper.text()).toContain('Preparación 70%')
    await wrapper.setProps({ flightBrief: buildFlightBrief({ checklist: { exists: true, completed: 10, total: 10, percentage: 100, is_complete: true } }) })
    expect(wrapper.text()).toContain('Preparación completada')
    expect(wrapper.text()).toContain('Preparación 100%')
  })

  it('adds and removes optional aircraft and schedule values without retaining stale output', async () => {
    const wrapper = mount(ClientFlightBrief, {
      props: {
        flightBrief: buildFlightBrief({
          aircraft: { model: 'Aircraft A', registration: null, image_url: null },
          flight: { departure_datetime: '2026-09-12T10:30:00.000000Z', arrival_datetime: null, duration_hours: 1.25 },
        }),
      },
    })

    expect(wrapper.text()).not.toContain('Matrícula')
    expect(wrapper.find('.flight-brief__aircraft-visual img').exists()).toBe(false)
    expect(wrapper.text()).toContain('Por confirmar')

    await wrapper.setProps({
      flightBrief: buildFlightBrief({
        aircraft: { model: 'Aircraft B', registration: 'XA-NEW', image_url: 'https://cdn.example.test/new.jpg' },
        flight: { departure_datetime: '2026-09-12T11:30:00.000000Z', arrival_datetime: '2026-09-12T13:00:00.000000Z', duration_hours: 1.5 },
      }),
    })
    expect(wrapper.find('.flight-brief__aircraft-visual img').attributes('src')).toContain('new.jpg')

    await wrapper.setProps({
      flightBrief: buildFlightBrief({
        aircraft: { model: 'Aircraft C', registration: null, image_url: null },
        flight: { departure_datetime: '2026-09-12T12:30:00.000000Z', arrival_datetime: null, duration_hours: 1.75 },
      }),
    })
    expect(wrapper.text()).not.toContain('Matrícula')
    expect(wrapper.find('.flight-brief__aircraft-visual img').exists()).toBe(false)
  })

  it('derives hero and timeline states from real in-flight, landed and completed statuses', async () => {
    const wrapper = mount(ClientFlightBrief, {
      props: {
        flightBrief: buildFlightBrief({ operation: { id: 88, status: 'en_vuelo', crew_status: 'in_flight' } }),
      },
    })

    expect(wrapper.text()).toContain('Tu vuelo está en curso')
    expect(wrapper.findAll('.flight-brief__timeline li').find((item) => item.text().startsWith('Seguimiento')).attributes('data-state')).toBe('current')

    await wrapper.setProps({
      flightBrief: buildFlightBrief({
        operation: { id: 88, status: 'en_vuelo', crew_status: 'landed' },
        crew: { assigned: true, confirmed: true, status: 'landed', visible_name: 'Sofia Herrera' },
      }),
    })
    expect(wrapper.text()).toContain('Tu vuelo ha aterrizado')

    await wrapper.setProps({
      flightBrief: buildFlightBrief({ operation: { id: 88, status: 'finalizada', crew_status: 'crew_completed' } }),
    })
    expect(wrapper.text()).toContain('Resumen de tu vuelo')
    expect(wrapper.findAll('.flight-brief__timeline li').every((item) => item.attributes('data-state') === 'completed')).toBe(true)
  })

  it('shows cancellation without presenting readiness or an unavailable tracking action', () => {
    const wrapper = mount(ClientFlightBrief, {
      props: {
        flightBrief: buildFlightBrief({
          flight: { status: 'cancelled' },
          operation: { id: null, status: null, crew_status: null },
          readiness: { ready: true, code: 'ready', label: 'Listo para salida.' },
        }),
      },
    })

    expect(wrapper.text()).toContain('Tu vuelo fue cancelado')
    expect(wrapper.text()).not.toContain('Listo para salida')
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('No necesitas realizar ninguna acción.')
  })

  it('renders only requested services and never labels them as confirmed', () => {
    const wrapper = mount(ClientFlightBrief, {
      props: {
        flightBrief: buildFlightBrief({
          services: {
            catering: { requested: true },
            special_baggage: { requested: false, description: null },
            ground_transport: { requested: true },
          },
        }),
      },
    })

    expect(wrapper.text()).toContain('Servicios de tu vuelo')
    expect(wrapper.text()).toContain('Catering')
    expect(wrapper.text()).toContain('Transporte terrestre')
    expect(wrapper.text()).not.toContain('Equipaje especial')
    expect(wrapper.text()).not.toContain('No solicitado')
    expect(wrapper.text()).not.toContain('Servicio confirmado')
  })

  it('renders practical presentation details and removes stale optional values after a refetch', async () => {
    const wrapper = mount(ClientFlightBrief, {
      props: {
        flightBrief: buildFlightBrief({
          presentation: {
            airport_code: 'TLC', airport_name: 'Aeropuerto de Toluca', city: 'Toluca',
            location_name: 'FBO Norte', address: 'Acceso norte 100', presentation_datetime: '2026-09-12T09:30:00.000000Z',
            instructions: 'Sigue las indicaciones del acceso norte.', maps_url: 'https://maps.example.test/fbo', is_complete: true,
          },
          support: { name: 'Operaciones Sky', phone: '+525500000000', whatsapp: 'https://wa.me/525500000000', email: 'ops@example.test' },
        }),
      },
    })

    expect(wrapper.text()).toContain('Dónde presentarte')
    expect(wrapper.text()).toContain('FBO Norte')
    expect(wrapper.text()).toContain('Acceso norte 100')
    expect(wrapper.get('a[href="https://maps.example.test/fbo"]').attributes('target')).toBe('_blank')
    expect(wrapper.get('a[href="https://maps.example.test/fbo"]').attributes('rel')).toBe('noopener noreferrer')
    expect(wrapper.text()).toContain('Indicaciones para pasajeros')
    expect(wrapper.text()).toContain('Gracias por elegir')
    expect(wrapper.text()).toContain('Asistencia operativa')
    expect(wrapper.text()).toContain('Llamar')
    expect(wrapper.text()).toContain('WhatsApp')
    expect(wrapper.text()).toContain('Correo')

    await wrapper.setProps({
      flightBrief: buildFlightBrief({
        presentation: { airport_code: 'TLC', airport_name: 'Aeropuerto de Toluca', city: 'Toluca', location_name: null, address: null, presentation_datetime: null, instructions: null, maps_url: null, is_complete: false },
        support: { name: null, phone: null, whatsapp: null, email: null },
      }),
    })

    expect(wrapper.text()).toContain('Por confirmar')
    expect(wrapper.text()).not.toContain('FBO Norte')
    expect(wrapper.text()).not.toContain('Acceso norte 100')
    expect(wrapper.text()).not.toContain('Cómo llegar')
    expect(wrapper.text()).not.toContain('Indicaciones para pasajeros')
    expect(wrapper.text()).not.toContain('Asistencia operativa')

    await wrapper.setProps({
      flightBrief: buildFlightBrief({
        presentation: { airport_code: 'TLC', airport_name: 'Aeropuerto de Toluca', city: 'Toluca', location_name: 'Sala ejecutiva', address: 'Acceso sur 12', presentation_datetime: '2026-09-12T09:45:00.000000Z', instructions: 'Regístrate al llegar.', maps_url: 'https://maps.example.test/sur', is_complete: true },
        support: { name: 'Atención Sky', phone: '+525511111111', whatsapp: null, email: null },
      }),
    })

    expect(wrapper.text()).toContain('Sala ejecutiva')
    expect(wrapper.text()).toContain('Acceso sur 12')
    expect(wrapper.get('a[href="https://maps.example.test/sur"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Atención Sky')
  })

  it('uses customer-stage language for the next step without showing positive states early', async () => {
    const wrapper = mount(ClientFlightBrief, {
      props: {
        flightBrief: buildFlightBrief({
          crew: { assigned: true, confirmed: false, status: 'pending_confirmation', visible_name: null },
          checklist: { exists: false, completed: 0, total: 0, percentage: 0, is_complete: false },
          readiness: { ready: false, code: 'crew_pending_confirmation', label: null },
        }),
      },
    })

    expect(wrapper.text()).toContain('Confirmación de tu tripulación')
    expect(wrapper.text()).toContain('Estamos finalizando la coordinación del equipo que atenderá tu vuelo.')
    expect(wrapper.text()).not.toContain('Todo listo para tu vuelo')

    await wrapper.setProps({
      flightBrief: buildFlightBrief({
        checklist: { exists: true, completed: 10, total: 10, percentage: 100, is_complete: true },
        readiness: { ready: true, code: 'ready', label: 'Listo para salida.' },
      }),
    })

    expect(wrapper.text()).toContain('Todo listo para tu vuelo')
    expect(wrapper.text()).toContain('Tu vuelo está preparado para la salida.')
  })
})
