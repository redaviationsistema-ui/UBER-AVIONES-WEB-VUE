import { api } from '../../lib/api'
import { pickCollection, pickRecord, requestWithCandidates } from '../../lib/backendCrud'
import {
  buildWorkflowApiPayload,
  resolveMostAdvancedWorkflowValue,
  resolveSharedWorkflowStatus,
  resolveWorkflowState,
} from '../../utils/flightWorkflow'
import { deriveClientWorkflowStatus, normalizeTrip } from '../client/clientBookingApi'

const configuredTripWorkflowPath = String(
  import.meta.env.VITE_CLIENT_TRIP_WORKFLOW_PATH || '',
).trim()
const configuredAdminRequestsPath = String(import.meta.env.VITE_ADMIN_REQUESTS_PATH || '').trim()
const normalizedConfiguredAdminRequestsPath = configuredAdminRequestsPath.startsWith('/admin/')
  ? configuredAdminRequestsPath
  : ''
const normalizedConfiguredWorkflowPath = configuredTripWorkflowPath.startsWith('/admin/')
  ? configuredTripWorkflowPath
  : ''
const normalizedConfiguredAdminRequestDetailPath =
  normalizedConfiguredAdminRequestsPath && !normalizedConfiguredAdminRequestsPath.includes(':id')
    ? `${normalizedConfiguredAdminRequestsPath.replace(/\/$/, '')}/:id`
    : normalizedConfiguredAdminRequestsPath
const ADMIN_REQUESTS_PATH_CANDIDATES = [
  '/admin/requests',
  '/admin/solicitudes',
  normalizedConfiguredAdminRequestsPath,
].filter(Boolean)

const ADMIN_RELEASES_PATH_CANDIDATES = [
  '/admin/releases',
  '/admin/reservas',
]

const ADMIN_OPERATION_WORKFLOW_PATH_CANDIDATES = [
  '/admin/crew/operations/:id/workflow',
]

const ADMIN_UPDATE_PATH_CANDIDATES = [
  '/admin/requests/:id/workflow',
  normalizedConfiguredWorkflowPath,
  '/admin/requests/:id',
  normalizedConfiguredAdminRequestDetailPath,
  '/admin/solicitudes/:id',
  '/admin/reservations/:id',
  '/admin/reservas/:id',
].filter(Boolean)

const ADMIN_DETAIL_PATH_CANDIDATES = [
  '/admin/requests/:id',
  normalizedConfiguredAdminRequestDetailPath,
  '/admin/solicitudes/:id',
  '/admin/reservations/:id',
  '/admin/reservas/:id',
].filter(Boolean)

function shouldTryNextWorkflowCandidate(error) {
  const status = Number(error?.status || 0)
  return status === 404 || status === 405
}

function normalizeEntityIdentifier(value) {
  if (value === null || value === undefined) return ''

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim()
  }

  if (typeof value === 'object') {
    return (
      normalizeEntityIdentifier(value.id) ||
      normalizeEntityIdentifier(value.reservation_id) ||
      normalizeEntityIdentifier(value.flight_request_id) ||
      normalizeEntityIdentifier(value.request_id) ||
      ''
    )
  }

  return ''
}

function replaceRouteId(path, reservationId) {
  return String(path || '').replace(':id', normalizeEntityIdentifier(reservationId))
}

function buildTargetIds(record = {}, rawPath = '') {
  const identifiers = buildAdminIdentifiers(record)

  if (
    String(rawPath).includes('/requests/') ||
    String(rawPath).includes('/solicitudes/') ||
    String(rawPath).includes('/workflow')
  ) {
    return [...new Set([identifiers.requestId].filter(Boolean))]
  }

  if (String(rawPath).includes('/reservas/') || String(rawPath).includes('/reservations/')) {
    return [...new Set([identifiers.reservationId, identifiers.requestId].filter(Boolean))]
  }

  return [...new Set([identifiers.reservationId, identifiers.requestId].filter(Boolean))]
}

function buildCandidatePaths(rawPath, targetIds = []) {
  return [...new Set(targetIds.map((targetId) => replaceRouteId(rawPath, targetId)).filter(Boolean))]
}

function buildAdminIdentifiers(record = {}) {
  return {
    reservationId:
      normalizeEntityIdentifier(record.reservationId) ||
      normalizeEntityIdentifier(record.id) ||
      normalizeEntityIdentifier(record.reservation_id) ||
      normalizeEntityIdentifier(record.booking_id) ||
      normalizeEntityIdentifier(record.reservation?.id),
    requestId:
      normalizeEntityIdentifier(record.requestId) ||
      normalizeEntityIdentifier(record.flight_request_id) ||
      normalizeEntityIdentifier(record.request_id) ||
      normalizeEntityIdentifier(record.flight_request?.id) ||
      normalizeEntityIdentifier(record.request?.id) ||
      normalizeEntityIdentifier(record.id),
  }
}

function resolveAdminOperationId(record = {}) {
  const nestedReservation =
    record.reservation && typeof record.reservation === 'object'
      ? record.reservation
      : record.flight_request && typeof record.flight_request === 'object'
        ? record.flight_request
        : record.request && typeof record.request === 'object'
          ? record.request
          : {}
  const visibilityPayload =
    record.visibility_payload && typeof record.visibility_payload === 'object'
      ? record.visibility_payload
      : {}
  const visibilityOperation =
    visibilityPayload.operation && typeof visibilityPayload.operation === 'object'
      ? visibilityPayload.operation
      : {}
  const directOperation = record.operation && typeof record.operation === 'object' ? record.operation : {}
  const latestOperation = record.latestOperation && typeof record.latestOperation === 'object' ? record.latestOperation : {}
  const nestedOperation =
    nestedReservation.operation && typeof nestedReservation.operation === 'object'
      ? nestedReservation.operation
      : {}
  const nestedLatestOperation =
    nestedReservation.latestOperation && typeof nestedReservation.latestOperation === 'object'
      ? nestedReservation.latestOperation
      : {}

  return (
    normalizeEntityIdentifier(record.operationId) ||
    normalizeEntityIdentifier(record.operation_id) ||
    normalizeEntityIdentifier(directOperation.id) ||
    normalizeEntityIdentifier(latestOperation.id) ||
    normalizeEntityIdentifier(nestedOperation.id) ||
    normalizeEntityIdentifier(nestedLatestOperation.id) ||
    normalizeEntityIdentifier(visibilityOperation.id)
  )
}

function collectCrewSources(record = {}, nestedReservation = {}) {
  const visibilityPayload =
    record.visibility_payload && typeof record.visibility_payload === 'object'
      ? record.visibility_payload
      : {}
  const nestedVisibilityPayload =
    nestedReservation.visibility_payload && typeof nestedReservation.visibility_payload === 'object'
      ? nestedReservation.visibility_payload
      : {}
  const directOperation = record.operation && typeof record.operation === 'object' ? record.operation : {}
  const nestedOperation = nestedReservation.operation && typeof nestedReservation.operation === 'object'
    ? nestedReservation.operation
    : {}
  const latestOperation = record.latestOperation && typeof record.latestOperation === 'object'
    ? record.latestOperation
    : {}
  const nestedLatestOperation =
    nestedReservation.latestOperation && typeof nestedReservation.latestOperation === 'object'
      ? nestedReservation.latestOperation
      : {}
  const visibilityOperation =
    visibilityPayload.operation && typeof visibilityPayload.operation === 'object'
      ? visibilityPayload.operation
      : {}
  const nestedVisibilityOperation =
    nestedVisibilityPayload.operation && typeof nestedVisibilityPayload.operation === 'object'
      ? nestedVisibilityPayload.operation
      : {}

  return [
    directOperation,
    latestOperation,
    visibilityOperation,
    record,
    nestedOperation,
    nestedLatestOperation,
    nestedVisibilityOperation,
    nestedReservation,
  ]
}

function normalizeCrewAssignmentStatus(value = '', timestamps = {}) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')

  if (timestamps.acceptedAt) return 'accepted'
  if (timestamps.rejectedAt) return 'rejected'
  if (timestamps.cancelledAt) return 'cancelled'
  if (!normalized) return ''
  if (['confirmed', 'accepted', 'aceptado', 'confirmado', 'confirmada', 'crew confirmed'].includes(normalized)) {
    return 'accepted'
  }
  if (['pending confirmation', 'pending crew response', 'pending', 'assigned', 'asignado'].includes(normalized)) {
    return 'pending_confirmation'
  }
  if (['rejected', 'rechazado', 'rechazada', 'crew declined'].includes(normalized)) return 'rejected'
  if (['cancelled', 'cancelada'].includes(normalized)) return 'cancelled'
  return normalized.replace(/\s+/g, '_')
}

function buildAdminReservationRecord(record = {}) {
  const normalizedTrip = normalizeTrip(record, {
    entityType: record.is_reservation ? 'reservation' : 'flight_request',
  })
  const nestedReservation =
    record.reservation && typeof record.reservation === 'object'
      ? record.reservation
      : record.flight_request && typeof record.flight_request === 'object'
        ? record.flight_request
        : record.request && typeof record.request === 'object'
          ? record.request
          : {}
  const explicitWorkflowValue = record.workflow_status || record.workflow || ''
  const explicitWorkflowId = resolveWorkflowState(explicitWorkflowValue).id
  const enrichedRecord = {
    ...record,
    payment_status:
      normalizedTrip.payment_status ||
      record.payment_status ||
      record.payment?.status ||
      '',
    contract_status:
      normalizedTrip.contract_status ||
      record.contract_status ||
      record.contract?.status ||
      '',
  }
  const identifiers = buildAdminIdentifiers(record)
  const operationId = resolveAdminOperationId(record)
  const adminFlow = record.visibility_payload?.admin_flow && typeof record.visibility_payload.admin_flow === 'object'
    ? record.visibility_payload.admin_flow
    : {}
  const briefing = record.briefing && typeof record.briefing === 'object' ? record.briefing : {}
  const visibilityPayload =
    record.visibility_payload && typeof record.visibility_payload === 'object'
      ? record.visibility_payload
      : {}
  const directOperation = record.operation && typeof record.operation === 'object' ? record.operation : {}
  const latestOperation = record.latestOperation && typeof record.latestOperation === 'object' ? record.latestOperation : {}
  const nestedOperation =
    nestedReservation.operation && typeof nestedReservation.operation === 'object'
      ? nestedReservation.operation
      : {}
  const nestedLatestOperation =
    nestedReservation.latestOperation && typeof nestedReservation.latestOperation === 'object'
      ? nestedReservation.latestOperation
      : {}
  const visibilityOperation =
    visibilityPayload.operation && typeof visibilityPayload.operation === 'object'
      ? visibilityPayload.operation
      : {}
  const resolvedChecklists =
    [
      record.checklists,
      directOperation.checklists,
      latestOperation.checklists,
      nestedReservation.checklists,
      nestedOperation.checklists,
      nestedLatestOperation.checklists,
      visibilityPayload.checklists,
      visibilityOperation.checklists,
    ]
      .find(Array.isArray) || []
  const departureValue =
    normalizedTrip.departure_datetime ||
    record.departure_datetime ||
    record.departure_date ||
    record.departure ||
    briefing.salida ||
    'Pendiente'
  const sharedWorkflowValue =
    resolveSharedWorkflowStatus(enrichedRecord) ||
    deriveClientWorkflowStatus(enrichedRecord) ||
    record.workflow_status ||
    record.workflow ||
    record.status ||
    ''
  const resolvedWorkflowValue =
    explicitWorkflowValue && explicitWorkflowId !== 'draft'
      ? resolveMostAdvancedWorkflowValue(explicitWorkflowValue, sharedWorkflowValue)
      : sharedWorkflowValue
  const crewSources = collectCrewSources(record, nestedReservation)
  const resolvedCrewName =
    crewSources
      .map((source) =>
        source?.crew_name ||
        source?.crew ||
        source?.tripulation ||
        source?.sobrecargo_name ||
        source?.sobrecargo?.name ||
        source?.assignment?.sobrecargo?.name ||
        source?.latestCrewAssignment?.sobrecargo?.name ||
        source?.crew_assignment?.sobrecargo?.name ||
        source?.crew_member?.name ||
        source?.crew_user?.name ||
        '',
      )
      .find((value) => String(value || '').trim()) || ''
  const resolvedCrewId =
    crewSources
      .map((source) =>
        source?.crew_id ||
        source?.sobrecargo_user_id ||
        source?.sobrecargo_id ||
        source?.assignment?.sobrecargo_user_id ||
        source?.latestCrewAssignment?.sobrecargo_user_id ||
        source?.crew_assignment?.sobrecargo_user_id ||
        source?.assignment?.sobrecargo?.id ||
        source?.latestCrewAssignment?.sobrecargo?.id ||
        source?.crew_assignment?.sobrecargo?.id ||
        source?.crew_member_id ||
        source?.sobrecargo?.id ||
        source?.crew_member?.id ||
        source?.crew_user?.id ||
        '',
      )
      .find((value) => String(value || '').trim()) || ''
  const resolvedAssignmentSource =
    crewSources
      .map((source) => source?.assignment || source?.latestCrewAssignment || source?.crew_assignment || null)
      .find((source) => source && typeof source === 'object' && Object.keys(source).length) || null
  const resolvedAssignmentAcceptedAt =
    resolvedAssignmentSource?.accepted_at ||
    record.accepted_at ||
    record.operation?.assignment?.accepted_at ||
    ''
  const resolvedAssignmentRejectedAt =
    resolvedAssignmentSource?.rejected_at ||
    record.rejected_at ||
    record.operation?.assignment?.rejected_at ||
    ''
  const resolvedAssignmentCancelledAt =
    resolvedAssignmentSource?.cancelled_at ||
    record.cancelled_at ||
    record.operation?.assignment?.cancelled_at ||
    ''
  const normalizedAssignmentStatus = normalizeCrewAssignmentStatus(
    resolvedAssignmentSource?.status || '',
    {
      acceptedAt: resolvedAssignmentAcceptedAt,
      rejectedAt: resolvedAssignmentRejectedAt,
      cancelledAt: resolvedAssignmentCancelledAt,
    },
  )
  const crewAssignment =
    resolvedAssignmentSource
      && (
        normalizedAssignmentStatus ||
        resolvedAssignmentAcceptedAt ||
        resolvedAssignmentRejectedAt ||
        resolvedAssignmentCancelledAt ||
        resolvedAssignmentSource?.id
      )
      ? {
          id: resolvedAssignmentSource?.id || null,
          role: resolvedAssignmentSource?.role || '',
          rawStatus: resolvedAssignmentSource?.status || '',
          status: normalizedAssignmentStatus,
          assignedAt: resolvedAssignmentSource?.assigned_at || '',
          responseDeadline: resolvedAssignmentSource?.response_deadline || '',
          presentationTime: resolvedAssignmentSource?.presentation_time || '',
          presentationDateTime: resolvedAssignmentSource?.presentation_datetime || '',
          timezone:
            resolvedAssignmentSource?.timezone ||
            record.timezone ||
            record.departure_timezone ||
            record.operation?.timezone ||
            '',
          acceptedAt: resolvedAssignmentAcceptedAt || '',
          rejectedAt: resolvedAssignmentRejectedAt || '',
          rejectionReason: resolvedAssignmentSource?.rejection_reason || '',
          cancelledAt: resolvedAssignmentCancelledAt || '',
          cancellationReason: resolvedAssignmentSource?.cancellation_reason || '',
        }
      : null

  return {
    id: identifiers.reservationId || identifiers.requestId || normalizedTrip.id,
    requestId: identifiers.requestId || identifiers.reservationId || normalizedTrip.flight_request_id || normalizedTrip.id,
    reservationId: identifiers.reservationId || identifiers.requestId || normalizedTrip.id,
    operationId,
    flightRequestId: identifiers.requestId || identifiers.reservationId || normalizedTrip.flight_request_id || normalizedTrip.id,
    folio:
      record.folio ||
      record.code ||
      record.reference ||
      record.flight_code ||
      `RA-${identifiers.reservationId || identifiers.requestId || normalizedTrip.id}`,
    clientName:
      record.client_name ||
      record.customer_name ||
      record.passenger_name ||
      record.user?.name ||
      record.client?.name ||
      record.customer?.name ||
      normalizedTrip.customer_name ||
      'Cliente por confirmar',
    clientCompany:
      record.client_company ||
      record.company_name ||
      record.client?.company ||
      record.customer?.company ||
      record.user?.company ||
      '',
    route: normalizedTrip.route || [record.origin, record.destination].filter(Boolean).join(' - '),
    origin:
      record.origin ||
      record.departure_airport ||
      briefing.origen ||
      normalizedTrip.origin ||
      '',
    destination:
      record.destination ||
      record.arrival_airport ||
      briefing.destino ||
      normalizedTrip.destination ||
      '',
    providerId:
      record.provider_id ||
      record.proveedor_id ||
      record.provider?.id ||
      record.assigned_provider_id ||
      '',
    providerName:
      record.provider_name ||
      record.provider_company_name ||
      record.provider_commercial_name ||
      record.provider?.commercial_name ||
      record.provider?.company_name ||
      '',
    aircraftId:
      record.aircraft_id ||
      record.aeronave_id ||
      record.assigned_aircraft_id ||
      record.aircraft?.id ||
      '',
    aircraft: normalizedTrip.aircraft || record.aircraft_model || 'Por definir',
    crew: resolvedCrewName,
    crewId: resolvedCrewId,
    departure: departureValue,
    departureDateTime: departureValue,
    presentationDateTime:
      record.presentation_datetime ||
      nestedReservation.presentation_datetime ||
      visibilityPayload.presentation_datetime ||
      crewAssignment?.presentationDateTime ||
      '',
    timezone:
      record.timezone ||
      record.departure_timezone ||
      nestedReservation.timezone ||
      nestedReservation.departure_timezone ||
      visibilityPayload.timezone ||
      'America/Mexico_City',
    departureDate: String(departureValue).includes('T') ? String(departureValue).slice(0, 10) : String(departureValue).slice(0, 10),
    departureTime: String(departureValue).includes('T') ? String(departureValue).slice(11, 16) : '',
    briefingTime:
      record.briefing_time ||
      record.presentation_time ||
      nestedReservation.briefing_time ||
      nestedReservation.presentation_time ||
      visibilityPayload.presentation_time ||
      visibilityPayload.briefing?.hora_presentacion ||
      adminFlow.presentation_time ||
      briefing.hora_presentacion ||
      (String(departureValue).includes('T') ? String(departureValue).slice(11, 16) : ''),
    presentationPlace:
      record.presentation_place ||
      record.presentation_location ||
      nestedReservation.presentation_place ||
      nestedReservation.presentation_location ||
      visibilityPayload.presentation_place ||
      visibilityPayload.presentation_location ||
      visibilityPayload.briefing?.lugar_presentacion ||
      adminFlow.presentation_place ||
      briefing.lugar_presentacion ||
      record.departure_airport ||
      briefing.origen ||
      '',
    arrival: record.arrival_datetime || record.return_date || 'Pendiente',
    status: resolvedWorkflowValue || record.status || '',
    workflowStatus: resolvedWorkflowValue || record.status || '',
    paymentStatus:
      normalizedTrip.payment_status ||
      record.payment_status ||
      record.payment?.status ||
      'Pendiente',
    paymentMethod:
      normalizedTrip.payment_method ||
      record.payment_method ||
      record.payment?.method ||
      record.payment_order?.payment_method ||
      record.payment_order?.method ||
      '',
    bookingStatus:
      normalizedTrip.booking_status ||
      record.booking_status ||
      record.status ||
      '',
    contractStatus:
      normalizedTrip.contract_status ||
      record.contract_status ||
      record.contract?.status ||
      'Pendiente',
    paymentOrder:
      normalizedTrip.payment_order ||
      (record.payment_order && typeof record.payment_order === 'object' ? record.payment_order : null),
    adminFlowState: record.admin_flow_state || record.flow_control_state || adminFlow.state || 'active',
    adminDelayReason:
      record.admin_delay_reason || record.hold_reason || record.delay_reason || adminFlow.reason || '',
    adminDelayEta: record.admin_delay_eta || record.hold_eta || record.delay_eta || adminFlow.eta || '',
    passengers:
      Number(
        normalizedTrip.passengers ||
        record.passengers ||
        record.authorized_passengers ||
        briefing.pasajeros_autorizados ||
        0,
      ) || 0,
    catering:
      record.catering ||
      visibilityPayload.catering ||
      briefing.catering ||
      '',
    specialRequirements:
      record.special_requirements ||
      record.vip_requirements ||
      visibilityPayload.special_requirements ||
      visibilityPayload.vip_requirements ||
      '',
    crewAssignment,
    assignment: crewAssignment,
    internalContact:
      record.internal_contact ||
      record.admin_contact ||
      adminFlow.internal_contact ||
      visibilityPayload.internal_contact ||
      '',
    crewOperationalState:
      record.crew_status ||
      record.operation?.crew_status ||
      record.crew_overall_status ||
      crewAssignment?.rawStatus ||
      record.crew_status_label ||
      '',
    incidentsLabel:
      record.incident_status ||
      record.incidents_label ||
      (Number(record.incidents_count || visibilityPayload.incidents_count || 0) > 0
        ? `${Number(record.incidents_count || visibilityPayload.incidents_count || 0)} incidencia(s)`
        : 'Sin incidencias'),
    incidentsCount: Number(record.incidents_count || visibilityPayload.incidents_count || 0) || 0,
    notes: normalizedTrip.notes || record.notes || record.comment || 'Sin comentarios',
    crewNotes:
      record.crew_notes ||
      record.operation?.crew_notes ||
      visibilityPayload.crew_notes ||
      '',
    checklists: resolvedChecklists,
    raw: record,
  }
}

function buildUnifiedReservationPayload(record, patch = {}) {
  const requestId = normalizeEntityIdentifier(record?.requestId || record?.flight_request_id || record?.id)
  const reservationId = normalizeEntityIdentifier(record?.reservationId || record?.id)

  return {
    id: reservationId || requestId || undefined,
    reservation_id: reservationId || undefined,
    reservation: reservationId || undefined,
    booking_id: reservationId || requestId || undefined,
    flight_request_id: requestId || undefined,
    flight_request: requestId || undefined,
    request_id: requestId || undefined,
    ...patch,
  }
}

function normalizeWorkflowToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
}

function resolveFlightRequestStatusForAdminPatch(statusValue = '', workflowValue = '') {
  const normalizedStatus = normalizeWorkflowToken(statusValue)
  const normalizedWorkflow = normalizeWorkflowToken(workflowValue || statusValue)

  if (['pending', 'matched', 'quoted', 'reserved', 'cancelled', 'expired'].includes(normalizedStatus)) {
    return normalizedStatus
  }

  switch (normalizedWorkflow) {
    case 'quoted':
    case 'cotizada':
      return 'quoted'
    case 'cancelled':
    case 'cancelada':
      return 'cancelled'
    case 'expired':
    case 'expirada':
      return 'expired'
    case 'provider accepted':
    case 'provider accepted':
    case 'provider accepted ':
    case 'provider_accepted':
    case 'proveedor aceptado':
    case 'accepted':
    case 'aceptada':
    case 'operador asignado':
    case 'operador asignado ':
    case 'operador_asignado':
      return 'matched'
    case 'contract pending':
    case 'contract_pending':
    case 'contrato pendiente':
    case 'contract signed':
    case 'contract_signed':
    case 'contrato firmado':
    case 'payment pending':
    case 'payment_pending':
    case 'pago pendiente':
    case 'pending payment':
    case 'pending_payment':
    case 'payment confirmed':
    case 'payment_confirmed':
    case 'pago confirmado':
    case 'flight confirmed':
    case 'flight_confirmed':
    case 'vuelo confirmado':
    case 'tracking live':
    case 'tracking_live':
    case 'tracking en vivo':
    case 'completed':
    case 'finalizada':
      return 'reserved'
    default:
      return ''
  }
}

function resolveReservationStatusForAdminPatch(statusValue = '', workflowValue = '', paymentStatus = '') {
  const normalizedStatus = normalizeWorkflowToken(statusValue)
  const normalizedWorkflow = normalizeWorkflowToken(workflowValue || statusValue)
  const normalizedPayment = normalizeWorkflowToken(paymentStatus)

  if (['cancelled', 'completed', 'confirmed', 'in progress', 'in_progress', 'paid', 'pending payment', 'pending_payment'].includes(normalizedStatus)) {
    if (normalizedStatus === 'pending payment') return 'pending_payment'
    if (normalizedStatus === 'in progress') return 'in_progress'
    return normalizedStatus
  }

  if (['paid', 'pagado', 'payment confirmed', 'payment_confirmed', 'pago confirmado'].includes(normalizedPayment)) {
    return 'confirmed'
  }

  switch (normalizedWorkflow) {
    case 'cancelled':
    case 'cancelada':
      return 'cancelled'
    case 'completed':
    case 'finalizada':
      return 'completed'
    case 'tracking live':
    case 'tracking_live':
    case 'tracking en vivo':
      return 'in_progress'
    case 'payment confirmed':
    case 'payment_confirmed':
    case 'pago confirmado':
    case 'flight confirmed':
    case 'flight_confirmed':
    case 'vuelo confirmado':
      return 'confirmed'
    case 'contract pending':
    case 'contract_pending':
    case 'contrato pendiente':
    case 'contract signed':
    case 'contract_signed':
    case 'contrato firmado':
    case 'payment pending':
    case 'payment_pending':
    case 'pago pendiente':
    case 'pending payment':
    case 'pending_payment':
    case 'provider accepted':
    case 'provider_accepted':
    case 'proveedor aceptado':
    case 'reserved':
      return 'pending_payment'
    default:
      return ''
  }
}

function buildScopedAdminPatch(rawPath = '', patch = {}) {
  const scopedPatch = { ...patch }
  const normalizedPath = String(rawPath || '')

  if (
    normalizedPath.includes('/requests/') ||
    normalizedPath.includes('/solicitudes/') ||
    normalizedPath.includes('/workflow')
  ) {
    const nextStatus = resolveFlightRequestStatusForAdminPatch(scopedPatch.status, scopedPatch.workflow_status)
    if (nextStatus) {
      scopedPatch.status = nextStatus
    } else {
      delete scopedPatch.status
    }
    return scopedPatch
  }

  const reservationStatus = resolveReservationStatusForAdminPatch(
    scopedPatch.status,
    scopedPatch.workflow_status,
    scopedPatch.payment_status,
  )

  if (reservationStatus) {
    scopedPatch.status = reservationStatus
  } else {
    delete scopedPatch.status
  }

  return scopedPatch
}

function extractUpdatedRecord(payload = {}, fallback = {}) {
  return (
    payload?.reservation ||
    payload?.trip ||
    payload?.flight_request ||
    payload?.request ||
    payload?.data ||
    fallback
  )
}

function normalizeWorkflowRecord(payload = {}) {
  const workflow = pickRecord(payload, ['workflow', 'operation', 'data'])
  return workflow && typeof workflow === 'object' ? workflow : {}
}

function extractWorkflowChecklists(workflow = {}) {
  return (
    workflow?.checklists ||
    workflow?.assignment?.checklists ||
    workflow?.operation?.checklists ||
    []
  )
}

function hasMeaningfulAdminDetailPayload(payload = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false

  return Object.keys(payload).length > 0
}

function mergeAdminOperationDetail(operation = {}, detailedOperation = {}) {
  const mergedRaw = {
    ...(operation.raw && typeof operation.raw === 'object' ? operation.raw : {}),
    ...(detailedOperation.raw && typeof detailedOperation.raw === 'object' ? detailedOperation.raw : {}),
  }

  return {
    ...operation,
    ...detailedOperation,
    raw: mergedRaw,
    id: operation.id || detailedOperation.id,
    requestId: operation.requestId || detailedOperation.requestId,
    reservationId: operation.reservationId || detailedOperation.reservationId,
    operationId: operation.operationId || detailedOperation.operationId,
    flightRequestId: operation.flightRequestId || detailedOperation.flightRequestId || operation.requestId,
  }
}

function applyWorkflowSnapshotToAdminOperation(operation = {}, workflowPayload = {}) {
  const crewWorkflowStatus = String(
    workflowPayload.crew_status ||
    workflowPayload.status ||
    workflowPayload.workflow_status ||
    '',
  ).trim()
  const preservedWorkflowStatus = String(operation.workflowStatus || '').trim()
  const preservedStatus = String(operation.status || '').trim()
  const timeline = Array.isArray(workflowPayload.timeline) ? workflowPayload.timeline : operation.timeline || []
  const checklists = Array.isArray(workflowPayload.checklists) ? workflowPayload.checklists : operation.checklists || []
  const finalReport =
    workflowPayload.final_report ??
    workflowPayload.report ??
    operation.finalReport ??
    null

  const mergedOperation = {
    ...operation,
    operationId: operation.operationId || resolveAdminOperationId(operation.raw || {}) || '',
    flightRequestId: operation.flightRequestId || operation.requestId || '',
    timeline,
    checklists,
    finalReport,
    workflowStatus: preservedWorkflowStatus || crewWorkflowStatus,
    status: preservedStatus || crewWorkflowStatus,
    crewStatus: crewWorkflowStatus || operation.crewStatus || '',
    crewOperationalState: crewWorkflowStatus || operation.crewOperationalState || '',
    canonicalWorkflow: workflowPayload,
  }

  return mergedOperation
}

async function fetchAdminOperationWorkflow(record = {}, options = {}) {
  const operationId = resolveAdminOperationId(record)
  if (!operationId) {
    console.warn('ADMIN WORKFLOW UNAVAILABLE', {
      operationId: null,
      message: 'No se puede cargar workflow: falta operationId',
    })
    return null
  }

  const candidates = ADMIN_OPERATION_WORKFLOW_PATH_CANDIDATES.map((path) => ({
    method: 'get',
    path: replaceRouteId(path, operationId),
    timeoutMs: options.timeoutMs,
  }))

  let lastError = null

  for (const candidate of candidates) {
    try {
      const response = await requestWithCandidates([candidate], { signal: options.signal })
      const workflowRecord = normalizeWorkflowRecord(response)

      if (!hasMeaningfulAdminDetailPayload(workflowRecord)) {
        continue
      }
      return workflowRecord
    } catch (error) {
      lastError = error
      console.error('ADMIN WORKFLOW ERROR', {
        operationId: operationId || null,
        url: candidate.path,
        status: error?.status || error?.response?.status || null,
        response: error?.payload || error?.response?.data || null,
        message: error?.message || 'Unknown admin workflow error',
      })

      const status = Number(error?.status || 0)
      const shouldTryNext =
        status === 404 ||
        status === 405 ||
        status === 0

      if (!shouldTryNext) {
        throw error
      }
    }
  }

  if (lastError) {
    console.warn('ADMIN WORKFLOW UNAVAILABLE', {
      operationId: operationId || null,
      message: lastError?.message || 'No workflow/detail payload available for admin operation.',
    })
  }

  return null
}

async function hydrateAdminReservationsWithWorkflow(records = [], options = {}) {
  const hydrated = await Promise.all(
    records.map(async (operation) => {
      const workflowPayload = await fetchAdminOperationWorkflow(operation, options)
      if (!workflowPayload || !Object.keys(workflowPayload).length) return operation
      return applyWorkflowSnapshotToAdminOperation(operation, workflowPayload)
    }),
  )

  return hydrated
}

export async function getAdminReservations(options = {}) {
  const response = await requestWithCandidates(
    ADMIN_REQUESTS_PATH_CANDIDATES.map((path) => ({
      method: 'get',
      path,
      query: { skip_total: 1 },
      timeoutMs: options.timeoutMs,
    })),
    { signal: options.signal },
  )
  const records = pickCollection(response, ['operations', 'operaciones', 'requests', 'solicitudes', 'flight_requests', 'data']).map(
    buildAdminReservationRecord,
  )
  return hydrateAdminReservationsWithWorkflow(records, options)
}

export async function getAdminReleases(options = {}) {
  const response = await requestWithCandidates(
    ADMIN_RELEASES_PATH_CANDIDATES.map((path) => ({
      method: 'get',
      path,
      timeoutMs: options.timeoutMs,
    })),
    { signal: options.signal },
  )

  return pickCollection(response, ['releases', 'requests', 'solicitudes', 'data']).map(
    buildAdminReservationRecord,
  )
}

export async function persistAdminReservationPatch(record, patch = {}, options = {}) {
  const targetIds = buildTargetIds(record)

  if (!targetIds.length) {
    throw new Error('No encontramos el identificador de la reserva para sincronizar cambios.')
  }

  let lastError = null
  let mergedRecord = record?.raw && typeof record.raw === 'object' ? { ...record.raw } : {}
  let hasSuccessfulSync = false

  for (const rawPath of ADMIN_UPDATE_PATH_CANDIDATES) {
    const scopedTargetIds = buildTargetIds(record, rawPath)
    const candidatePaths = buildCandidatePaths(rawPath, scopedTargetIds.length ? scopedTargetIds : targetIds)

    for (const path of candidatePaths) {
      const methods = path.includes('/workflow') ? ['put'] : ['patch', 'put', 'post']

      for (const method of methods) {
        try {
          const scopedPatch = buildScopedAdminPatch(rawPath, patch)
          const unifiedPayload = buildUnifiedReservationPayload(record, scopedPatch)
          const payload =
            method === 'patch'
              ? await api.patch(path, unifiedPayload, options)
              : method === 'put'
                ? await api.put(path, unifiedPayload, options)
                : await api.post(path, unifiedPayload, options)

          hasSuccessfulSync = true
          mergedRecord = {
            ...mergedRecord,
            ...extractUpdatedRecord(payload, mergedRecord),
            ...patch,
          }
          break
        } catch (error) {
          lastError = error
          if (!shouldTryNextWorkflowCandidate(error)) {
            throw error
          }
        }
      }
    }
  }

  if (hasSuccessfulSync) {
    return buildAdminReservationRecord(mergedRecord)
  }

  throw lastError || new Error('No se pudo sincronizar la reserva con el backend.')
}

export async function updateAdminReservationStage(record, nextStage, note = '', options = {}) {
  const workflowPayload = buildWorkflowApiPayload(nextStage)
  if (workflowPayload.status === 'payment_pending') {
    workflowPayload.status = 'pending_payment'
  }
  const patch = {
    ...workflowPayload,
    admin_flow_state: 'active',
    flow_control_state: 'active',
    admin_delay_reason: '',
    delay_reason: '',
    hold_reason: '',
    admin_delay_eta: '',
    delay_eta: '',
    hold_eta: '',
    admin_note: note || '',
    notes: note ? `${record?.notes || ''} · ${note}`.replace(/^ · /, '') : record?.notes || '',
  }

  if (['reserved', 'provider_pending'].includes(nextStage)) {
    patch.contract_status = ''
    patch.payment_status = ''
  }

  if (nextStage === 'provider_accepted') {
    patch.contract_status = 'generated'
    patch.payment_status = ''
  }

  if (nextStage === 'contract_pending') {
    patch.contract_status = 'generated'
    patch.payment_status = ''
  }

  if (nextStage === 'contract_signed') {
    patch.contract_status = 'signed'
    patch.payment_status = ''
  }

  if (nextStage === 'payment_pending') {
    patch.contract_status = 'signed'
    patch.payment_status = 'pending'
  }

  if (['payment_confirmed', 'flight_confirmed', 'tracking_live', 'completed'].includes(nextStage)) {
    patch.contract_status = 'signed'
    patch.payment_status = 'paid'
  }

  return persistAdminReservationPatch(record, patch, options)
}

export async function delayAdminReservation(record, payload = {}, options = {}) {
  const mode = payload.mode === 'blocked' ? 'blocked' : 'delayed'

  return persistAdminReservationPatch(
    record,
    {
      admin_flow_state: mode,
      flow_control_state: mode,
      admin_delay_reason: payload.reason || '',
      delay_reason: payload.reason || '',
      hold_reason: payload.reason || '',
      admin_delay_eta: payload.eta || '',
      delay_eta: payload.eta || '',
      hold_eta: payload.eta || '',
      admin_note: payload.note || '',
      notes: payload.note ? `${record?.notes || ''} · ${payload.note}`.replace(/^ · /, '') : record?.notes || '',
    },
    options,
  )
}

export async function resumeAdminReservation(record, note = '', options = {}) {
  return persistAdminReservationPatch(
    record,
    {
      admin_flow_state: 'active',
      flow_control_state: 'active',
      admin_delay_reason: '',
      delay_reason: '',
      hold_reason: '',
      admin_delay_eta: '',
      delay_eta: '',
      hold_eta: '',
      admin_note: note || '',
      notes: note ? `${record?.notes || ''} · ${note}`.replace(/^ · /, '') : record?.notes || '',
    },
    options,
  )
}
