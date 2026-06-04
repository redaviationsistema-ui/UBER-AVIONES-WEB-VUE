import { api } from '../../lib/api'
import { pickCollection, requestWithCandidates } from '../../lib/backendCrud'
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
const ADMIN_REQUESTS_PATH_CANDIDATES = [
  '/admin/requests',
  normalizedConfiguredAdminRequestsPath,
].filter(Boolean)

const ADMIN_RELEASES_PATH_CANDIDATES = ['/admin/releases']

const ADMIN_UPDATE_PATH_CANDIDATES = [
  '/admin/requests/:id/workflow',
  normalizedConfiguredWorkflowPath,
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

  if (String(rawPath).includes('/requests/') || String(rawPath).includes('/workflow')) {
    return [...new Set([identifiers.requestId].filter(Boolean))]
  }

  return [...new Set([identifiers.requestId, identifiers.reservationId].filter(Boolean))]
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

function buildAdminReservationRecord(record = {}) {
  const normalizedTrip = normalizeTrip(record, {
    entityType: record.is_reservation ? 'reservation' : 'flight_request',
  })
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
  const adminFlow = record.visibility_payload?.admin_flow && typeof record.visibility_payload.admin_flow === 'object'
    ? record.visibility_payload.admin_flow
    : {}
  const briefing = record.briefing && typeof record.briefing === 'object' ? record.briefing : {}
  const visibilityPayload =
    record.visibility_payload && typeof record.visibility_payload === 'object'
      ? record.visibility_payload
      : {}
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

  return {
    id: identifiers.reservationId || identifiers.requestId || normalizedTrip.id,
    requestId: identifiers.requestId || identifiers.reservationId || normalizedTrip.flight_request_id || normalizedTrip.id,
    reservationId: identifiers.reservationId || identifiers.requestId || normalizedTrip.id,
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
    aircraftId:
      record.aircraft_id ||
      record.aeronave_id ||
      record.assigned_aircraft_id ||
      record.aircraft?.id ||
      '',
    aircraft: normalizedTrip.aircraft || record.aircraft_model || 'Por definir',
    crew:
      record.crew_name ||
      record.crew ||
      record.tripulation ||
      record.sobrecargo?.name ||
      'Por definir',
    crewId:
      record.crew_id ||
      record.sobrecargo_id ||
      record.crew_member_id ||
      record.sobrecargo?.id ||
      '',
    departure: departureValue,
    departureDate: String(departureValue).includes('T') ? String(departureValue).slice(0, 10) : String(departureValue).slice(0, 10),
    departureTime: String(departureValue).includes('T') ? String(departureValue).slice(11, 16) : '',
    briefingTime:
      record.briefing_time ||
      record.presentation_time ||
      adminFlow.presentation_time ||
      briefing.hora_presentacion ||
      (String(departureValue).includes('T') ? String(departureValue).slice(11, 16) : ''),
    presentationPlace:
      record.presentation_place ||
      record.presentation_location ||
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
    contractStatus:
      normalizedTrip.contract_status ||
      record.contract_status ||
      record.contract?.status ||
      'Pendiente',
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
    internalContact:
      record.internal_contact ||
      record.admin_contact ||
      adminFlow.internal_contact ||
      visibilityPayload.internal_contact ||
      '',
    crewOperationalState:
      record.crew_status_label ||
      record.crew_status ||
      record.crew_overall_status ||
      '',
    incidentsLabel:
      record.incident_status ||
      record.incidents_label ||
      (Number(record.incidents_count || visibilityPayload.incidents_count || 0) > 0
        ? `${Number(record.incidents_count || visibilityPayload.incidents_count || 0)} incidencia(s)`
        : 'Sin incidencias'),
    incidentsCount: Number(record.incidents_count || visibilityPayload.incidents_count || 0) || 0,
    notes: normalizedTrip.notes || record.notes || record.comment || 'Sin comentarios',
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

export async function getAdminReservations(options = {}) {
  const response = await requestWithCandidates(
    ADMIN_REQUESTS_PATH_CANDIDATES.map((path) => ({
      method: 'get',
      path,
      timeoutMs: options.timeoutMs,
    })),
  )

  return pickCollection(response, ['operations', 'operaciones', 'requests', 'solicitudes', 'data']).map(
    buildAdminReservationRecord,
  )
}

export async function getAdminReleases(options = {}) {
  const response = await requestWithCandidates(
    ADMIN_RELEASES_PATH_CANDIDATES.map((path) => ({
      method: 'get',
      path,
      timeoutMs: options.timeoutMs,
    })),
  )

  return pickCollection(response, ['releases', 'requests', 'solicitudes', 'data']).map(
    buildAdminReservationRecord,
  )
}

export async function persistAdminReservationPatch(record, patch = {}, options = {}) {
  const unifiedPayload = buildUnifiedReservationPayload(record, patch)
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
    patch.payment_status = 'Pendiente de pago'
  }

  if (['payment_confirmed', 'flight_confirmed', 'tracking_live', 'completed'].includes(nextStage)) {
    patch.contract_status = 'signed'
    patch.payment_status = 'Pagado'
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
