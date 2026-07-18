import { normalizeToken } from '../../crew-directory/crewDirectoryShared'

const STATUS_ALIAS_MAP = new Map([
  ['tracking live', 'tracking_live'],
  ['tracking en vivo', 'tracking_live'],
  ['tracking_live', 'tracking_live'],
  ['flight live', 'flight_live'],
  ['flight_live', 'flight_live'],
  ['in progress', 'in_progress'],
  ['in_progress', 'in_progress'],
  ['en curso', 'en_curso'],
  ['en_curso', 'en_curso'],
  ['in flight', 'in_flight'],
  ['in_flight', 'in_flight'],
  ['en vuelo', 'en_vuelo'],
  ['en_vuelo', 'en_vuelo'],
  ['boarding', 'boarding'],
  ['flight confirmed', 'flight_confirmed'],
  ['flight_confirmed', 'flight_confirmed'],
  ['vuelo confirmado', 'flight_confirmed'],
  ['operador asignado', 'operator_assigned'],
  ['operator assigned', 'operator_assigned'],
  ['operador_asignado', 'operator_assigned'],
  ['assigned', 'assigned'],
  ['asignada', 'assigned'],
  ['asignado', 'assigned'],
  ['scheduled', 'scheduled'],
  ['programado', 'scheduled'],
  ['pending', 'pending'],
  ['draft', 'draft'],
  ['completed', 'completed'],
  ['finalizada', 'completed'],
  ['closed', 'completed'],
  ['cerrada', 'completed'],
  ['landed', 'landed'],
  ['cancelled', 'cancelled'],
  ['canceled', 'cancelled'],
  ['cancelada', 'cancelled'],
  ['rejected', 'rejected'],
  ['rechazada', 'rejected'],
  ['expired', 'expired'],
])

export const ACTIVE_FLIGHT_STATUSES = [
  'tracking_live',
  'flight_live',
  'in_progress',
  'en_curso',
  'in_flight',
  'en_vuelo',
  'boarding',
]

export const INACTIVE_FLIGHT_STATUSES = [
  'draft',
  'pending',
  'scheduled',
  'assigned',
  'operator_assigned',
  'flight_confirmed',
  'completed',
  'landed',
  'cancelled',
  'rejected',
  'expired',
]

export function normalizeFlightStatus(value = '') {
  const normalized = normalizeToken(String(value || '').replace(/\./g, ' '))
  if (!normalized) return ''
  return STATUS_ALIAS_MAP.get(normalized) || normalized.replace(/\s+/g, '_')
}

export function resolveOperationFlightStatus(operation = {}) {
  const raw = operation?.raw && typeof operation.raw === 'object' ? operation.raw : {}
  const nestedOperation = raw.operation && typeof raw.operation === 'object' ? raw.operation : {}
  const flight = raw.flight && typeof raw.flight === 'object' ? raw.flight : {}
  const vuelo = raw.vuelo && typeof raw.vuelo === 'object' ? raw.vuelo : {}
  const visibilityPayload =
    raw.visibility_payload && typeof raw.visibility_payload === 'object' ? raw.visibility_payload : {}

  return normalizeFlightStatus(
    operation.flightStatus ||
      operation.flight_status ||
      operation.workflowStatus ||
      operation.status ||
      operation.bookingStatus ||
      nestedOperation.status ||
      nestedOperation.workflow_status ||
      raw.workflow_status ||
      raw.operational_status ||
      visibilityPayload.operational_status ||
      flight.status ||
      raw.flight_status ||
      vuelo.estado ||
      '',
  )
}

export function isActiveFlightOperation(operation = {}) {
  return ACTIVE_FLIGHT_STATUSES.includes(resolveOperationFlightStatus(operation))
}
