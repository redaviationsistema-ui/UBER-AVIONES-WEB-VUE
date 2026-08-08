/* @vitest-environment jsdom */

import { effectScope, reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchAvailableCrewByRange } = vi.hoisted(() => ({
  fetchAvailableCrewByRange: vi.fn(),
}))

vi.mock('../services/disponibilidadService', async (importOriginal) => {
  const actual = await importOriginal()

  return {
    ...actual,
    fetchAvailableCrewByRange,
  }
})

import { useCrewOperations } from '../features/admin/crew/composables/useCrewOperations'
import CrewOperationDetailDrawer from '../features/admin/crew/operations/CrewOperationDetailDrawer.vue'

function buildCrewMember(id, name, overrides = {}) {
  return {
    id,
    name,
    base: 'MMTO',
    state: 'Disponible',
    profileState: 'Aprobado',
    ...overrides,
  }
}

function buildOperation(id, overrides = {}) {
  return {
    id,
    folio: `RA-${id}`,
    route: 'Ruta demo',
    departure: '2026-08-07T08:00:00',
    arrival: '2026-08-07T12:00:00',
    origin: 'MMTO',
    workflowStatus: 'flight_confirmed',
    status: 'flight_confirmed',
    crew: '',
    crewId: null,
    raw: {},
    ...overrides,
  }
}

function deferred() {
  let resolve
  let reject

  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, resolve, reject }
}

function mountDrawer(props = {}) {
  return mount(CrewOperationDetailDrawer, {
    props: {
      operation: buildOperation(197),
      draft: {
        crewId: '',
        note: '',
        presentationTime: '08:00',
        presentationPlaceType: 'FBO',
        presentationPlaceDetail: 'Toluca',
      },
      assignableCrew: [],
      selectedCrewMember: null,
      assignmentError: '',
      assignmentSuccessMessage: '',
      canAssign: true,
      isClosed: false,
      isInFlight: false,
      loadingAvailableCrew: false,
      formatDateTime: (value) => value,
      operationIncidentLabel: () => 'Sin incidencias',
      humanizeStatus: (value) => value,
      toneClass: () => '',
      operationStatusLabel: () => 'flight_confirmed',
      operationCrewStateLabel: () => 'Pendiente',
      ...props,
    },
  })
}

describe('crew availability lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts with the general crew list and then narrows the selected operation with remote availability', async () => {
    const props = reactive({
      crewMembers: [
        buildCrewMember(18, 'Jimena Alvarez Mejia'),
        buildCrewMember(17, 'VALERIA GARCIA RAMIREZ'),
      ],
      operations: [
        buildOperation(196, { origin: 'MMTO' }),
        buildOperation(197, { origin: 'MMJC' }),
      ],
      auditEntries: [],
    })

    const scope = effectScope()
    const controller = scope.run(() => useCrewOperations(props, { viewMode: 'operations' }))
    const operation = props.operations[1]

    expect(controller.assignableCrewMembers(operation).map((member) => member.name)).toEqual([
      'Jimena Alvarez Mejia',
      'VALERIA GARCIA RAMIREZ',
    ])

    fetchAvailableCrewByRange.mockResolvedValueOnce([
      { id: 18, name: 'Jimena Alvarez Mejia', base: 'MMTO' },
    ])

    await controller.ensureAvailableCrewForOperation(operation)

    expect(fetchAvailableCrewByRange).toHaveBeenCalledWith({
      from: '2026-08-07',
      to: '2026-08-07',
      base: 'MMJC',
    })
    expect(controller.assignableCrewMembers(operation).map((member) => member.name)).toEqual([
      'Jimena Alvarez Mejia',
    ])
    expect(controller.availableCrewState(operation).kind).toBe('idle')

    scope.stop()
  })

  it('shows an empty state when the remote availability lookup returns no assignable crew', async () => {
    const props = reactive({
      crewMembers: [buildCrewMember(18, 'Jimena Alvarez Mejia')],
      operations: [buildOperation(197, { origin: 'MMJC' })],
      auditEntries: [],
    })

    const scope = effectScope()
    const controller = scope.run(() => useCrewOperations(props, { viewMode: 'operations' }))
    const operation = props.operations[0]

    fetchAvailableCrewByRange.mockResolvedValueOnce([])
    await controller.ensureAvailableCrewForOperation(operation)

    expect(controller.assignableCrewMembers(operation)).toEqual([])
    expect(controller.availableCrewState(operation)).toMatchObject({
      kind: 'empty',
      disableSelect: true,
      message: 'No hay sobrecargos disponibles para MMJC',
    })

    scope.stop()
  })

  it('keeps availability responses isolated per operation key during rapid switching', async () => {
    const props = reactive({
      crewMembers: [
        buildCrewMember(18, 'Jimena Alvarez Mejia'),
        buildCrewMember(17, 'VALERIA GARCIA RAMIREZ'),
      ],
      operations: [
        buildOperation(196, { origin: 'MMTO' }),
        buildOperation(197, { origin: 'MMJC' }),
      ],
      auditEntries: [],
    })

    const scope = effectScope()
    const controller = scope.run(() => useCrewOperations(props, { viewMode: 'operations' }))
    const firstDeferred = deferred()
    const secondDeferred = deferred()

    fetchAvailableCrewByRange
      .mockReturnValueOnce(firstDeferred.promise)
      .mockReturnValueOnce(secondDeferred.promise)

    const requestA = controller.ensureAvailableCrewForOperation(props.operations[0])
    const requestB = controller.ensureAvailableCrewForOperation(props.operations[1])

    secondDeferred.resolve([{ id: 17, name: 'VALERIA GARCIA RAMIREZ', base: 'MMTO' }])
    await requestB

    firstDeferred.resolve([{ id: 18, name: 'Jimena Alvarez Mejia', base: 'MMTO' }])
    await requestA

    expect(controller.assignableCrewMembers(props.operations[1]).map((member) => member.name)).toEqual([
      'VALERIA GARCIA RAMIREZ',
    ])
    expect(controller.assignableCrewMembers(props.operations[0]).map((member) => member.name)).toEqual([
      'Jimena Alvarez Mejia',
    ])

    scope.stop()
  })

  it('renders loading, empty and error messages inside the selector', async () => {
    const wrapper = mountDrawer({
      availabilityState: {
        kind: 'loading',
        message: 'Consultando disponibilidad...',
        disableSelect: true,
      },
    })

    expect(wrapper.find('select').element.disabled).toBe(true)
    expect(wrapper.find('option').text()).toBe('Consultando disponibilidad...')
    expect(wrapper.text()).toContain('Consultando disponibilidad...')

    await wrapper.setProps({
      availabilityState: {
        kind: 'empty',
        message: 'No hay sobrecargos disponibles para MMJC',
        disableSelect: true,
      },
    })

    expect(wrapper.find('option').text()).toBe('No hay sobrecargos disponibles para MMJC')
    expect(wrapper.text()).toContain('No hay sobrecargos disponibles para MMJC')

    await wrapper.setProps({
      availabilityState: {
        kind: 'error',
        message: 'No fue posible consultar disponibilidad',
        disableSelect: false,
      },
    })
    await flushPromises()

    expect(wrapper.find('select').element.disabled).toBe(false)
    expect(wrapper.find('option').text()).toBe('No fue posible consultar disponibilidad')
    expect(wrapper.text()).toContain('No fue posible consultar disponibilidad')
  })
})
