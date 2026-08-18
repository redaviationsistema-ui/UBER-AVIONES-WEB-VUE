import { describe, expect, it } from 'vitest'

import {
  hasCrewAssignmentRecord,
  operationAssignmentBadgeLabel,
  operationCrewStateLabel,
  operationTimezone,
  resolveOperationPresentationDate,
  resolveAssignmentWindowValidation,
  resolveCrewAssignmentStatus,
} from '../features/admin/crew/services/crewOperations.service'

describe('crewOperations.service assignment truth source', () => {
  it('does not infer a real assignment from crew snapshots alone', () => {
    const operation = {
      crew: 'VALERIA GARCIA RAMIREZ',
      crewId: 17,
      crewOperationalState: 'confirmed',
      raw: {
        crew_status: 'confirmed',
        operation: {
          crew_status: 'confirmed',
        },
      },
      crewAssignment: null,
    }

    expect(resolveCrewAssignmentStatus(operation)).toBe('')
    expect(hasCrewAssignmentRecord(operation)).toBe(false)
    expect(operationCrewStateLabel(operation)).toBe('Sin asignar')
    expect(operationAssignmentBadgeLabel(operation)).toBe('Sin asignar')
  })

  it('keeps real assignment states when an assignment row exists', () => {
    const operation = {
      crew: 'VALERIA GARCIA RAMIREZ',
      crewId: 17,
      crewOperationalState: 'pending_confirmation',
      crewAssignment: {
        id: 901,
        status: 'pending_confirmation',
        rawStatus: 'pending_confirmation',
        assignedAt: '2026-08-17T10:00:00.000Z',
      },
    }

    expect(resolveCrewAssignmentStatus(operation)).toBe('pending_confirmation')
    expect(hasCrewAssignmentRecord(operation)).toBe(true)
    expect(operationCrewStateLabel(operation)).toBe('Pendiente de confirmacion')
    expect(operationAssignmentBadgeLabel(operation)).toBe('Apartada')
  })

  it('flags expired presentation times before calling the backend', () => {
    const operation = {
      departure: '2026-08-17T15:00:00',
    }

    expect(
      resolveAssignmentWindowValidation(operation, '11:00', new Date('2026-08-17T16:00:00')),
    ).toMatchObject({
      code: 'PRESENTATION_TIME_EXPIRED',
    })
  })

  it('flags missing confirmation windows before calling the backend', () => {
    const operation = {
      departure: '2026-08-17T18:00:00',
    }

    expect(
      resolveAssignmentWindowValidation(operation, '15:00', new Date('2026-08-17T16:45:00')),
    ).toMatchObject({
      code: 'NO_RESPONSE_WINDOW_AVAILABLE',
    })
  })

  it('prefers presentation_datetime and timezone from the normalized operation when available', () => {
    const operation = {
      departure: '2026-08-17T20:00:00-06:00',
      presentationDateTime: '2026-08-17T19:00:00-06:00',
      timezone: 'America/Mexico_City',
      raw: {
        visibility_payload: {
          presentation_time: '11:00',
        },
      },
    }

    expect(resolveOperationPresentationDate(operation)?.toISOString()).toBe('2026-08-18T01:00:00.000Z')
    expect(operationTimezone(operation)).toBe('America/Mexico_City')
  })
})
