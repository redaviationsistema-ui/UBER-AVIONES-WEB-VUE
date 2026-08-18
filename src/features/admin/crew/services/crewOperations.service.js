import { resolveWorkflowState } from '../../../../utils/flightWorkflow'
import {
  certificationLabel,
  humanizeStatus,
  includesAny,
  normalizeOperationalState,
  normalizeToken,
} from '../../crew-directory/crewDirectoryShared'
import { isActiveFlightOperation, resolveOperationFlightStatus } from '../constants/flightStatuses'

export const PRESENTATION_PLACE_TYPES = ['FBO', 'Base', 'Aeropuerto', 'Hangar', 'Otro']

export function operationProviderName(operation = {}) {
  const raw = operation?.raw && typeof operation.raw === 'object' ? operation.raw : {}
  return String(
    operation.providerName ||
      raw.provider_name ||
      raw.provider_company_name ||
      raw.provider_commercial_name ||
      raw.provider?.commercial_name ||
      raw.provider?.company_name ||
      '',
  ).trim()
}

export function operationFlightBase(operation = {}) {
  const raw = operation?.raw && typeof operation.raw === 'object' ? operation.raw : {}
  const visibilityPayload =
    raw.visibility_payload && typeof raw.visibility_payload === 'object' ? raw.visibility_payload : {}
  const briefing = raw.briefing && typeof raw.briefing === 'object' ? raw.briefing : {}
  const operationPayload = raw.operation && typeof raw.operation === 'object' ? raw.operation : {}

  return String(
    operation.base ||
    operation.origin ||
      raw.base ||
      raw.origin ||
      raw.departure_airport ||
      raw.base_airport ||
      operationPayload.base ||
      operationPayload.origin ||
      visibilityPayload.presentation_place ||
      visibilityPayload.presentation_location ||
      briefing.lugar_presentacion ||
      briefing.origen ||
      '',
  ).trim()
}

export function operationPresentationTime(operation = {}) {
  const raw = operation?.raw && typeof operation.raw === 'object' ? operation.raw : {}
  const visibilityPayload =
    raw.visibility_payload && typeof raw.visibility_payload === 'object' ? raw.visibility_payload : {}
  const briefing = raw.briefing && typeof raw.briefing === 'object' ? raw.briefing : {}
  const assignment = operation?.crewAssignment && typeof operation.crewAssignment === 'object'
    ? operation.crewAssignment
    : null
  const derivedTime = derivePresentationTimeFromDeparture(operation)

  return String(
    assignment?.presentationTime ||
      assignment?.presentation_time ||
      operation.briefingTime ||
      derivedTime ||
      raw.briefing_time ||
      raw.presentation_time ||
      visibilityPayload.presentation_time ||
      briefing.hora_presentacion ||
      '',
  ).trim()
}

export function operationTimezone(operation = {}) {
  const raw = operation?.raw && typeof operation.raw === 'object' ? operation.raw : {}
  const assignment = operation?.crewAssignment && typeof operation.crewAssignment === 'object'
    ? operation.crewAssignment
    : null

  return String(
    operation.timezone ||
      operation.departureTimezone ||
      assignment?.timezone ||
      raw.timezone ||
      raw.departure_timezone ||
      raw.operation?.timezone ||
      raw.operation?.departure_timezone ||
      'America/Mexico_City',
  ).trim() || 'America/Mexico_City'
}

export function operationPresentationPlace(operation = {}) {
  const raw = operation?.raw && typeof operation.raw === 'object' ? operation.raw : {}
  const visibilityPayload =
    raw.visibility_payload && typeof raw.visibility_payload === 'object' ? raw.visibility_payload : {}
  const briefing = raw.briefing && typeof raw.briefing === 'object' ? raw.briefing : {}

  return String(
    operation.presentationPlace ||
      raw.presentation_place ||
      raw.presentation_location ||
      visibilityPayload.presentation_place ||
      visibilityPayload.presentation_location ||
      briefing.lugar_presentacion ||
      '',
  ).trim()
}

export function buildPresentationPlaceValue(type = '', detail = '', fallback = '') {
  const resolvedType = String(type || '').trim()
  const resolvedDetail = String(detail || '').trim()
  const combined = [resolvedType, resolvedDetail].filter(Boolean).join(' · ')

  return combined || String(fallback || '').trim()
}

export function resolvePresentationPlaceDraft(operation = {}) {
  const storedValue = operationPresentationPlace(operation)
  const segments = storedValue.split('·').map((segment) => segment.trim()).filter(Boolean)
  const firstSegment = segments[0] || ''
  const type = PRESENTATION_PLACE_TYPES.includes(firstSegment) ? firstSegment : ''
  const detail = type ? segments.slice(1).join(' · ') : storedValue

  return {
    presentationPlaceType: type,
    presentationPlaceDetail: detail,
  }
}

export function operationDateRange(operation = {}) {
  const raw = operation?.raw && typeof operation.raw === 'object' ? operation.raw : {}
  const nestedOperation = raw.operation && typeof raw.operation === 'object' ? raw.operation : {}

  const from =
    String(operation.departureDate || '').slice(0, 10) ||
    String(operation.departure || '').slice(0, 10) ||
    String(nestedOperation.departure_datetime || '').slice(0, 10) ||
    String(raw.departure_datetime || '').slice(0, 10)
  const to =
    String(operation.arrival || '').slice(0, 10) ||
    String(nestedOperation.arrival_datetime || '').slice(0, 10) ||
    String(raw.arrival_datetime || '').slice(0, 10) ||
    from

  return {
    from: /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : '',
    to: /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : from,
  }
}

export function derivePresentationTimeFromDeparture(operation = {}, offsetMinutes = 60) {
  const presentation = resolveOperationPresentationDate(operation, offsetMinutes)
  if (!presentation || Number.isNaN(presentation.getTime())) return ''

  return `${String(presentation.getHours()).padStart(2, '0')}:${String(presentation.getMinutes()).padStart(2, '0')}`
}

function buildLocalDateFromParts(datePart = '', timePart = '00:00') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(datePart || ''))) return null
  const normalizedTime = /^\d{2}:\d{2}$/.test(String(timePart || '')) ? String(timePart) : '00:00'
  const composed = `${datePart}T${normalizedTime}:00`
  const candidate = new Date(composed)

  return Number.isNaN(candidate.getTime()) ? null : candidate
}

export function resolveOperationDepartureDate(operation = {}) {
  const raw = operation?.raw && typeof operation.raw === 'object' ? operation.raw : {}
  const nestedOperation = raw.operation && typeof raw.operation === 'object' ? raw.operation : {}
  const departure =
    operation.departure ||
    operation.departureDate ||
    nestedOperation.departure_datetime ||
    raw.departure_datetime ||
    ''

  const normalized = String(departure || '')
  if (!normalized) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return buildLocalDateFromParts(normalized)
  }

  const candidate = new Date(normalized)
  return Number.isNaN(candidate.getTime()) ? null : candidate
}

export function resolveOperationPresentationDate(operation = {}, offsetMinutes = 60) {
  const raw = operation?.raw && typeof operation.raw === 'object' ? operation.raw : {}
  const nestedOperation = raw.operation && typeof raw.operation === 'object' ? raw.operation : {}
  const visibilityPayload =
    raw.visibility_payload && typeof raw.visibility_payload === 'object' ? raw.visibility_payload : {}
  const assignment = operation?.crewAssignment && typeof operation.crewAssignment === 'object'
    ? operation.crewAssignment
    : null
  const explicitPresentation =
    operation.presentationDateTime ||
    operation.presentation_datetime ||
    assignment?.presentationDateTime ||
    assignment?.presentation_datetime ||
    raw.presentation_datetime ||
    nestedOperation.presentation_datetime ||
    visibilityPayload.presentation_datetime ||
    ''

  if (explicitPresentation) {
    const candidate = new Date(String(explicitPresentation))
    if (!Number.isNaN(candidate.getTime())) return candidate
  }

  const departure = resolveOperationDepartureDate(operation)
  if (!departure) return null

  const presentation = new Date(departure.getTime() - Math.max(0, Number(offsetMinutes || 0)) * 60 * 1000)
  return Number.isNaN(presentation.getTime()) ? null : presentation
}

export function availabilityQueryKey(operation = {}) {
  const range = operationDateRange(operation)
  return `${range.from || 'sin-fecha'}:${range.to || 'sin-fecha'}:${operationFlightBase(operation) || 'sin-base'}`
}

export function operationStatusLabel(operation = {}) {
  return operation.workflowStatus || operation.status || ''
}

export function isOperationClosed(operation = {}) {
  const normalized = normalizeToken(operation.workflowStatus || operation.status || '')
  return normalized.includes('cancel') || normalized.includes('finaliz') || normalized.includes('cerrad') || normalized.includes('closed')
}

export function canAssignCrew(operation = {}) {
  return ['flight_confirmed', 'tracking_live'].includes(
    resolveWorkflowState(operation.workflowStatus || operation.status || '').id,
  )
}

export function operationAllowsAssignment(operation = {}) {
  return canAssignCrew(operation)
}

export function summarizePersonName(value = '', fallback = 'Sin asignar') {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return fallback
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${String(parts[1] || '').charAt(0)}.`
}

export function operationDisplayClient(operation = {}) {
  return operation.clientName ? `Cliente: ${summarizePersonName(operation.clientName, 'Cliente privado')}` : 'Cliente privado'
}

export function resolveCrewAssignment(operation = {}) {
  const assignment = operation?.crewAssignment && typeof operation.crewAssignment === 'object'
    ? operation.crewAssignment
    : null
  if (!assignment) return null
  return assignment
}

export function resolveCrewAssignmentStatus(operation = {}) {
  const assignment = resolveCrewAssignment(operation)
  const normalized = normalizeToken(assignment?.status || assignment?.rawStatus || '')

  if (assignment?.acceptedAt) return 'accepted'
  if (assignment?.rejectedAt) return 'rejected'
  if (assignment?.cancelledAt) return 'cancelled'
  if (normalized === 'confirmed' || normalized === 'accepted' || normalized === 'crew confirmed') return 'accepted'
  if (normalized === 'pending confirmation' || normalized === 'pending crew response' || normalized === 'pending') {
    return 'pending_confirmation'
  }
  if (normalized === 'rejected' || normalized === 'crew declined') return 'rejected'
  if (normalized === 'cancelled') return 'cancelled'
  return normalized.replace(/\s+/g, '_')
}

export function hasCrewAssignmentRecord(operation = {}) {
  const assignment = resolveCrewAssignment(operation)
  const status = resolveCrewAssignmentStatus(operation)

  return Boolean(
    assignment &&
      (
        assignment.id ||
        assignment.assignedAt ||
        assignment.responseDeadline ||
        assignment.acceptedAt ||
        assignment.rejectedAt ||
        assignment.cancelledAt ||
        status
      ),
  )
}

export function isCrewReadyForOperation(operation = {}) {
  const assignment = resolveCrewAssignment(operation)
  return resolveCrewAssignmentStatus(operation) === 'accepted' && Boolean(assignment?.acceptedAt)
}

export function operationDisplayCrew(operation = {}, linkedCrew = null) {
  if (!hasCrewAssignmentRecord(operation)) return 'Pendiente asignar'

  const raw = operation?.raw && typeof operation.raw === 'object' ? operation.raw : {}
  const resolvedCrewName = String(
    operation.crew ||
      linkedCrew?.name ||
      raw.crew_name ||
      raw.sobrecargo_name ||
      raw.sobrecargo?.name ||
      raw.operation?.sobrecargo?.name ||
      raw.latestOperation?.sobrecargo?.name ||
      '',
  ).trim()

  return resolvedCrewName ? summarizePersonName(resolvedCrewName) : 'Pendiente asignar'
}

export function operationCrewStateLabel(operation = {}, linkedCrew = null) {
  if (!hasCrewAssignmentRecord(operation)) return 'Sin asignar'

  switch (resolveCrewAssignmentStatus(operation)) {
    case 'pending_confirmation':
      return 'Pendiente de confirmacion'
    case 'accepted':
      return 'Lista'
    case 'rejected':
      return 'Rechazada'
    case 'cancelled':
      return 'Cancelada'
    default:
      break
  }
  if (operation.crewOperationalState) return humanizeStatus(operation.crewOperationalState)
  if (linkedCrew) return humanizeStatus(linkedCrew.state || linkedCrew.operationalState || '')
  return 'Asignada'
}

export function operationAssignmentBadgeLabel(operation = {}) {
  switch (resolveCrewAssignmentStatus(operation)) {
    case 'pending_confirmation':
      return 'Apartada'
    case 'accepted':
      return 'Lista'
    case 'rejected':
      return 'Rechazada'
    case 'cancelled':
      return 'Cancelada'
    default:
      return hasCrewAssignmentRecord(operation) ? 'Con sobrecargo' : 'Sin asignar'
  }
}

export function operationDisplayState(operation = {}, linkedCrew = null) {
  const operationLabel = humanizeStatus(operationStatusLabel(operation))
  const crewLabel = humanizeStatus(operationCrewStateLabel(operation, linkedCrew))
  return `${operationLabel}${crewLabel ? ` · ${crewLabel}` : ''}`.trim()
}

export function operationIncidentLabel(operation = {}) {
  return operation.incidentsLabel || (operation.incidentsCount ? `${operation.incidentsCount} incidencia(s)` : 'Sin incidencias')
}

export function buildNormalizedCrewMember(member = {}, linkedOperation = null) {
  const validationState = member.profileState || member.validationStatus || ''
  const operationalState = normalizeOperationalState(member.state || member.operationalState || '')
  const isApproved = includesAny(validationState, ['aprob'])
  const isPendingValidation = includesAny(validationState, ['pend', 'revision', 'cambio', 'valid'])
  const isSuspended = normalizeOperationalState(operationalState) === 'Suspendido'
  const isAssigned = Boolean(linkedOperation) || operationalState === 'Asignado' || operationalState === 'En vuelo'
  const hasBlockedValidationState =
    normalizeToken(validationState).includes('rech') ||
    normalizeToken(validationState).includes('pend') ||
    normalizeToken(validationState).includes('suspend')
  const isAvailableToday =
    !hasBlockedValidationState &&
    !isSuspended &&
    !isAssigned &&
    normalizeOperationalState(operationalState) === 'Disponible'

  return {
    ...member,
    validationState,
    operationalState,
    certificationStatus: certificationLabel(member),
    assignedOperation: linkedOperation,
    isApproved,
    isPendingValidation,
    isSuspended,
    isAssigned,
    isAvailableToday,
  }
}

export function buildCrewAssignmentPayload({ operation = {}, member = {}, draft = {} } = {}) {
  const presentationTime = String(draft.presentationTime || operationPresentationTime(operation) || '').trim()
  const presentationPlace = buildPresentationPlaceValue(
    draft.presentationPlaceType,
    draft.presentationPlaceDetail,
    operationPresentationPlace(operation) || operation.origin || '',
  )
  const note = String(draft.note || '').trim()

  return {
    provider_id: operation.providerId || undefined,
    aircraft_id: operation.aircraftId || undefined,
    sobrecargo_user_id: member.id,
    crew_id: member.id,
    sobrecargo_id: member.id,
    crew_name: member.name,
    note: note || undefined,
    presentation_time: presentationTime || undefined,
    presentation_place: presentationPlace || undefined,
  }
}

export function isActiveOperationForInFlight(operation = {}) {
  return isActiveFlightOperation(operation)
}

export function buildOperationStatusBucket(operation = {}) {
  const normalized = resolveOperationFlightStatus(operation)

  if (isOperationClosed(operation)) {
    return normalized === 'cancelled' ? 'cancelled' : 'completed'
  }

  if (isActiveFlightOperation(operation)) return 'tracking'
  if (normalized === 'flight_confirmed') return 'confirmed'
  if (hasCrewAssignmentRecord(operation)) return 'assigned'
  return 'pending'
}
