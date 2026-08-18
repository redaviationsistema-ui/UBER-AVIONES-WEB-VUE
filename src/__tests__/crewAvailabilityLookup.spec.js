/* @vitest-environment jsdom */

import { effectScope, reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
      operationAssignmentBadgeLabel: () => 'Sin asignar',
      isCrewReadyForOperation: () => false,
      ...props,
    },
  })
}

describe('crew availability lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it('enables assignment only when the selected crew is available and the derived presentation is still in the future', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-17T17:00:00-06:00'))

    const props = reactive({
      crewMembers: [buildCrewMember(17, 'VALERIA GARCIA RAMIREZ')],
      operations: [
        buildOperation(201, {
          departure: '2026-08-17T20:00:00-06:00',
        }),
      ],
      auditEntries: [],
    })

    const scope = effectScope()
    const controller = scope.run(() => useCrewOperations(props, { viewMode: 'operations' }))
    controller.updateDraft(201, 'crewId', 17)

    expect(controller.assignmentEligibilityState(props.operations[0])).toMatchObject({
      kind: 'ready',
      canAssign: true,
    })
    expect(controller.selectedCrewAvailabilityState(props.operations[0])).toMatchObject({
      kind: 'ready',
      message: 'Disponible para esta fecha',
    })
    expect(controller.canSubmitAssignment(props.operations[0])).toBe(true)

    scope.stop()
  })

  it('blocks assignment when the derived presentation time has already passed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-17T17:00:00-06:00'))

    const props = reactive({
      crewMembers: [buildCrewMember(17, 'VALERIA GARCIA RAMIREZ')],
      operations: [
        buildOperation(201, {
          departure: '2026-08-17T17:30:00-06:00',
        }),
      ],
      auditEntries: [],
    })

    const scope = effectScope()
    const controller = scope.run(() => useCrewOperations(props, { viewMode: 'operations' }))
    controller.updateDraft(201, 'crewId', 17)

    expect(controller.assignmentEligibilityState(props.operations[0])).toMatchObject({
      kind: 'blocked',
      message: 'No se puede asignar una sobrecargo porque la hora de presentacion de esta operacion ya paso.',
      canAssign: false,
    })
    expect(controller.canSubmitAssignment(props.operations[0])).toBe(false)

    scope.stop()
  })

  it('ignores stale visibility payload presentation snapshots when departure produces a future presentation', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-17T17:00:00-06:00'))

    const props = reactive({
      crewMembers: [buildCrewMember(17, 'VALERIA GARCIA RAMIREZ')],
      operations: [
        buildOperation(201, {
          departure: '2026-08-17T20:00:00-06:00',
          raw: {
            visibility_payload: {
              presentation_time: '11:00',
            },
          },
        }),
      ],
      auditEntries: [],
    })

    const scope = effectScope()
    const controller = scope.run(() => useCrewOperations(props, { viewMode: 'operations' }))
    controller.updateDraft(201, 'crewId', 17)

    expect(controller.getDraft(201).presentationTime).toBe('19:00')
    expect(controller.canSubmitAssignment(props.operations[0])).toBe(true)

    scope.stop()
  })

  it('recalculates eligibility immediately when departure changes from past to future', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-17T17:37:00-06:00'))

    const props = reactive({
      crewMembers: [buildCrewMember(17, 'VALERIA GARCIA RAMIREZ')],
      operations: [
        buildOperation(201, {
          departure: '2026-08-17T15:00:00-06:00',
        }),
      ],
      auditEntries: [],
    })

    const scope = effectScope()
    const controller = scope.run(() => useCrewOperations(props, { viewMode: 'operations' }))
    controller.updateDraft(201, 'crewId', 17)

    expect(controller.canSubmitAssignment(props.operations[0])).toBe(false)

    props.operations[0].departure = '2026-08-17T20:00:00-06:00'
    await flushPromises()

    expect(controller.getDraft(201).presentationTime).toBe('19:00')
    expect(controller.assignmentEligibilityState(props.operations[0]).canAssign).toBe(true)
    expect(controller.canSubmitAssignment(props.operations[0])).toBe(true)

    scope.stop()
  })

  it('blocks assignment when a real active assignment already exists', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-17T17:00:00-06:00'))

    const props = reactive({
      crewMembers: [buildCrewMember(17, 'VALERIA GARCIA RAMIREZ')],
      operations: [
        buildOperation(201, {
          departure: '2026-08-17T20:00:00-06:00',
          crewAssignment: {
            id: 901,
            status: 'pending_confirmation',
            assignedAt: '2026-08-17T12:00:00-06:00',
          },
        }),
      ],
      auditEntries: [],
    })

    const scope = effectScope()
    const controller = scope.run(() => useCrewOperations(props, { viewMode: 'operations' }))
    controller.updateDraft(201, 'crewId', 17)

    expect(controller.assignmentEligibilityState(props.operations[0])).toMatchObject({
      title: 'Operacion con sobrecargo asignada',
      canAssign: false,
    })
    expect(controller.canSubmitAssignment(props.operations[0])).toBe(false)

    scope.stop()
  })

  it('does not treat stale crew snapshots as active assignments when the real assignment row is missing', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-17T17:00:00-06:00'))

    const props = reactive({
      crewMembers: [buildCrewMember(17, 'VALERIA GARCIA RAMIREZ')],
      operations: [
        buildOperation(201, {
          departure: '2026-08-17T20:00:00-06:00',
          crew: 'VALERIA GARCIA RAMIREZ',
          crewId: 17,
          crewOperationalState: 'pending_confirmation',
          crewAssignment: null,
          raw: {
            operation: {
              sobrecargo_user_id: 17,
              crew_status: 'pending_confirmation',
            },
          },
        }),
      ],
      auditEntries: [],
    })

    const scope = effectScope()
    const controller = scope.run(() => useCrewOperations(props, { viewMode: 'operations' }))
    controller.updateDraft(201, 'crewId', 17)

    expect(controller.linkedCrewForOperation(props.operations[0])).toBeNull()
    expect(controller.selectedCrewAvailabilityState(props.operations[0])).toMatchObject({
      kind: 'ready',
    })
    expect(controller.canSubmitAssignment(props.operations[0])).toBe(true)

    scope.stop()
  })

  it('disables the button in the drawer when operational eligibility is blocked even if the crew is available', () => {
    const wrapper = mountDrawer({
      selectedCrewMember: buildCrewMember(17, 'VALERIA GARCIA RAMIREZ'),
      selectedCrewAvailabilityState: {
        kind: 'ready',
        title: 'Disponibilidad de sobrecargo',
        message: 'Disponible para esta fecha',
        detail: 'Base: MMTO',
      },
      assignmentEligibilityState: {
        kind: 'blocked',
        title: 'Asignacion no disponible',
        message: 'La hora de presentacion de esta operacion ya paso.',
        detail: '',
        canAssign: false,
      },
      canAssign: true,
      canSubmitAssignment: false,
      assignmentWindowMessage: 'La hora de presentacion de esta operacion ya paso.',
    })

    expect(wrapper.text()).toContain('Disponibilidad de sobrecargo')
    expect(wrapper.text()).toContain('Asignacion no disponible')
    expect(wrapper.find('button.primary-action').element.disabled).toBe(true)
  })
})
