/* @vitest-environment jsdom */

import { effectScope, reactive } from 'vue'
import { describe, expect, it } from 'vitest'

import { useCrewOperations } from '../features/admin/crew/composables/useCrewOperations'
import {
  ACTIVE_FLIGHT_STATUSES,
  INACTIVE_FLIGHT_STATUSES,
  isActiveFlightOperation,
  normalizeFlightStatus,
  resolveOperationFlightStatus,
} from '../features/admin/crew/constants/flightStatuses'

function buildOperation(id, overrides = {}) {
  return {
    id,
    folio: `RA-${id}`,
    route: 'MMTO -> MMMX',
    departure: `2026-07-${String(10 + id).padStart(2, '0')}T08:00:00`,
    origin: 'MMTO',
    destination: 'MMMX',
    providerName: 'Proveedor Demo',
    workflowStatus: 'flight_confirmed',
    status: 'flight_confirmed',
    crew: '',
    crewId: null,
    raw: {},
    ...overrides,
  }
}

describe('flight status normalization and in-flight filtering', () => {
  it('normalizes the real active statuses used by the module', () => {
    expect(ACTIVE_FLIGHT_STATUSES).toEqual([
      'tracking_live',
      'flight_live',
      'in_progress',
      'en_curso',
      'in_flight',
      'en_vuelo',
      'boarding',
    ])

    expect(INACTIVE_FLIGHT_STATUSES).toContain('flight_confirmed')
    expect(INACTIVE_FLIGHT_STATUSES).toContain('completed')
    expect(INACTIVE_FLIGHT_STATUSES).toContain('landed')
    expect(INACTIVE_FLIGHT_STATUSES).toContain('cancelled')
  })

  it('includes only truly active flights in the in-flight controller', () => {
    const props = reactive({
      crewMembers: [
        { id: 8, name: 'Sofía Crew', state: 'Disponible', profileState: 'Aprobado' },
      ],
      operations: [
        buildOperation(1, { workflowStatus: 'flight_confirmed', status: 'flight_confirmed', crew: 'Sofía Crew', crewId: 8 }),
        buildOperation(2, { workflowStatus: 'scheduled', status: 'scheduled' }),
        buildOperation(3, { workflowStatus: 'tracking_live', status: 'tracking_live' }),
        buildOperation(4, { workflowStatus: 'landed', status: 'landed', crew: 'Sofía Crew', crewId: 8 }),
        buildOperation(5, { workflowStatus: 'completed', status: 'completed', crew: 'Sofía Crew', crewId: 8 }),
        buildOperation(6, { workflowStatus: 'cancelled', status: 'cancelled' }),
      ],
      auditEntries: [],
    })

    const scope = effectScope()
    const controller = scope.run(() => useCrewOperations(props, { viewMode: 'in-flight' }))

    expect(controller.filteredOperations.value.map((item) => item.id)).toEqual([3])
    scope.stop()
  })

  it('does not classify flights as active based only on crew assignment fields', () => {
    const futureWithCrew = buildOperation(10, {
      workflowStatus: 'flight_confirmed',
      status: 'flight_confirmed',
      crew: 'Tripulante Asignada',
      crewId: 77,
    })

    const futureWithOnlyLegacyCrewId = buildOperation(11, {
      workflowStatus: 'scheduled',
      status: 'scheduled',
      crew: '',
      crewId: null,
      crew_id: 88,
    })

    expect(isActiveFlightOperation(futureWithCrew)).toBe(false)
    expect(isActiveFlightOperation(futureWithOnlyLegacyCrewId)).toBe(false)
  })

  it('resolves active status from operational payload aliases before checking visibility', () => {
    const operation = buildOperation(12, {
      workflowStatus: '',
      status: '',
      raw: {
        visibility_payload: {
          operational_status: 'Tracking en vivo',
        },
      },
    })

    expect(normalizeFlightStatus('Tracking en vivo')).toBe('tracking_live')
    expect(resolveOperationFlightStatus(operation)).toBe('tracking_live')
    expect(isActiveFlightOperation(operation)).toBe(true)
  })
})
