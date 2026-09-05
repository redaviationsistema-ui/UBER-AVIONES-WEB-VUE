/*----------------------------------------------------------------------------------------------*/
//VISTA DE UTILIDADES PARA EL PORTAL DE OPERADOR
/*----------------------------------------------------------------------------------------------*/

import { normalizeWorkflowLabel, resolveWorkflowState } from '../../../utils/flightWorkflow'

const OPERATOR_PENDING_DECISION_WORKFLOW_IDS = new Set(['reserved', 'provider_pending'])
const OPERATOR_COORDINATION_WORKFLOW_IDS = new Set([
  'provider_accepted',
  'contract_pending',
  'contract_signed',
  'payment_pending',
  'payment_confirmed',
  'flight_confirmed',
])

const OPERATOR_TRACKING_ACTIVE_TOKENS = new Set([
  'tracking_live',
  'tracking',
  'tracking_active',
  'active',
  'activo',
  'live',
  'in_progress',
  'in_flight',
  'en_curso',
  'en_vuelo',
  'seguimiento',
])

export function normalizeOperatorTrackingStatus(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

export function hasOperatorTrackingActivity(request = {}) {
  const trackingToken = normalizeOperatorTrackingStatus(
    request?.trackingStatus ||
      request?.raw?.tracking_status ||
      request?.raw?.trackingStatus ||
      request?.raw?.operation?.tracking_status ||
      request?.raw?.operation?.trackingStatus ||
      request?.raw?.operation?.status ||
      request?.raw?.reservation?.tracking_status ||
      request?.raw?.reservation?.trackingStatus ||
      '',
  )

  return Boolean(trackingToken) && OPERATOR_TRACKING_ACTIVE_TOKENS.has(trackingToken)
}

export function resolveOperatorRequestQueue(request = {}, workflowValue = '') {
  const workflowId = resolveWorkflowState(workflowValue || request?.workflowStatus || request?.status || '').id

  if (workflowId === 'rejected') return 'rejected'
  if (hasOperatorTrackingActivity(request) || workflowId === 'tracking_live') return 'tracking'
  if (OPERATOR_PENDING_DECISION_WORKFLOW_IDS.has(workflowId)) return 'pending'
  if (OPERATOR_COORDINATION_WORKFLOW_IDS.has(workflowId)) return 'coordination'
  if (workflowId === 'completed') return 'completed'
  if (workflowId === 'cancelled') return 'cancelled'
  return 'other'
}

export function shouldShowRealtimeRequestInBanner(request = {}, matchedRequest = null) {
  const referenceRequest = matchedRequest || request
  return resolveOperatorRequestQueue(referenceRequest, referenceRequest?.status || '') === 'pending'
}

export function shouldKeepOperatorRealtimeRequestVisible(request = {}, requests = []) {
  const requestId = String(request.requestId || request.request_id || request.id || '').trim()
  if (!requestId) return false

  const matchedRequest = findOperatorRequestByIdentifier(requests, requestId)
  if (!matchedRequest) return false

  return shouldShowRealtimeRequestInBanner(request, matchedRequest)
}

export function collectOperatorRequestIdentityTokens(request = {}) {
  return [
    request.id,
    request.requestId,
    request.request_id,
    request.reservationId,
    request.reservation_id,
    request.raw?.id,
    request.raw?.request_id,
    request.raw?.flight_request_id,
    request.raw?.reservation_id,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
}

export function matchesOperatorRequestIdentifier(request = {}, targetId = '') {
  const normalizedTargetId = String(targetId || '').trim()
  if (!normalizedTargetId) return false
  return collectOperatorRequestIdentityTokens(request).includes(normalizedTargetId)
}

export function findOperatorRequestByIdentifier(collection = [], targetId = '') {
  const normalizedTargetId = String(targetId || '').trim()
  if (!normalizedTargetId) return null
  return collection.find((request) => matchesOperatorRequestIdentifier(request, normalizedTargetId)) || null
}

function normalizeRouteStop(value = '') {
  return String(value || '').trim()
}

function collectRouteLegs(request = {}) {
  const candidateCollections = [
    request.requirements,
    request.legs,
    request.segments,
    request.tramos,
    request.raw?.requirements,
    request.raw?.legs,
    request.raw?.segments,
    request.raw?.tramos,
  ]

  return candidateCollections.find((collection) => Array.isArray(collection) && collection.length) || []
}

function buildRouteStopsFromLegs(legs = []) {
  const stops = []

  legs.forEach((leg = {}) => {
    const origin = normalizeRouteStop(
      leg.origin || leg.origin_airport || leg.departure_airport || leg.base_airport || '',
    )
    const destination = normalizeRouteStop(
      leg.destination || leg.destination_airport || leg.arrival_airport || '',
    )

    if (origin && stops[stops.length - 1] !== origin) stops.push(origin)
    if (destination && stops[stops.length - 1] !== destination) stops.push(destination)
  })

  return stops
}

function appendUniqueRouteStop(stops = [], value = '') {
  const normalizedValue = normalizeRouteStop(value)
  if (!normalizedValue) return stops
  if (stops[stops.length - 1] !== normalizedValue) stops.push(normalizedValue)
  return stops
}

function parseRouteStops(route = '') {
  return String(route || '')
    .split(/\s*(?:→|->|\|)\s*|\s+-\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function buildRequestFullRoute(request = {}) {
  const legs = collectRouteLegs(request)
  const origin = normalizeRouteStop(
    request.origin || request.origin_airport || request.departure_airport || request.raw?.origin || '',
  )
  const destination = normalizeRouteStop(
    request.destination ||
      request.destination_airport ||
      request.arrival_airport ||
      request.raw?.destination ||
      '',
  )
  const routeStops = parseRouteStops(request.route || request.raw?.route || '')
  const legStops = buildRouteStopsFromLegs(legs)
  const fullStops =
    legStops.length >= 2 && legStops[0] === origin && legStops[1] === destination
      ? [...legStops]
      : []

  if (!fullStops.length) {
    appendUniqueRouteStop(fullStops, origin)
    appendUniqueRouteStop(fullStops, destination)
    legStops.forEach((stop) => appendUniqueRouteStop(fullStops, stop))
  }

  if (fullStops.length >= 2) return fullStops.join(' -> ')
  if (routeStops.length >= 2) return routeStops.join(' -> ')

  return [origin, destination].filter(Boolean).join(' -> ') || request.route || 'Sin ruta'
}

export function getRequestRouteLabel(request = {}) {
  return buildRequestFullRoute(request)
}

export function parseOperationalDate(value = '') {
  if (!value || value === 'Sin limite informado' || value === 'Sin fecha') return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function isRequestSameOperationalDay(value = '') {
  const parsed = parseOperationalDate(value)
  if (!parsed) return false

  return (
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
    }).format(parsed) ===
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
    }).format(new Date())
  )
}

export function buildRealtimeRequestPayload(payload = {}, providerId = '') {
  const requestId = payload.request_id || payload.flight_request_id || payload.id
  const route = buildRequestFullRoute(payload)
  const routeStops = parseRouteStops(route)
  const origin = routeStops[0] || payload.origin || ''
  const destination = routeStops[routeStops.length - 1] || payload.destination || ''

  return {
    ...payload,
    id: requestId,
    request_id: requestId,
    provider_id: payload.provider_id || providerId || '',
    route,
    origin: origin || 'N/D',
    destination: destination || 'N/D',
    aircraft_name: payload.aircraft_name || payload.aircraft || 'Aeronave por confirmar',
    status: payload.status || 'pending',
    priority_type: payload.priority || payload.priority_type || 'normal',
    response_deadline: payload.sla_deadline || payload.response_deadline || payload.response_limit,
    created_at: payload.created_at || new Date().toISOString(),
  }
}

export function shouldIgnoreOperatorRequestsRouteError(
  error,
  { hasSuccessfulPayload = false, providerPendingValidation = false } = {},
) {
  const status = Number(error?.status || 0)
  const message = String(error?.message || '').toLowerCase()

  if (
    status === 0 ||
    [404, 405].includes(status) ||
    (status >= 500 && status <= 599) ||
    (message.includes('route') && message.includes('could not be found'))
  ) {
    return true
  }

  if ([401, 403].includes(status) && (hasSuccessfulPayload || providerPendingValidation)) {
    return true
  }

  return false
}

export function syncRealtimeRequestsWithRequestsCollection(realtimeRequests = [], requests = []) {
  if (!realtimeRequests.length || !requests.length) return realtimeRequests

  return realtimeRequests.map((request) => {
    const targetId = String(request.requestId || request.request_id || request.id || '').trim()
    if (!targetId) return request

    const matchedRequest = findOperatorRequestByIdentifier(requests, targetId)
    if (!matchedRequest) return request

    return {
      ...request,
      id: matchedRequest.id || request.id,
      requestId: matchedRequest.requestId || request.requestId || request.request_id || request.id,
      request_id: matchedRequest.requestId || request.request_id || request.requestId || request.id,
      route: matchedRequest.route || request.route,
      origin: matchedRequest.origin || request.origin,
      destination: matchedRequest.destination || request.destination,
      aircraft_name: matchedRequest.aircraft || request.aircraft_name || request.aircraft,
      aircraft: matchedRequest.aircraft || request.aircraft || request.aircraft_name,
      status: matchedRequest.workflowStatus || matchedRequest.status || request.status,
      created_at: matchedRequest.createdAt || request.created_at,
      updated_at: matchedRequest.updatedAt || request.updated_at,
      raw: {
        ...request.raw,
        ...matchedRequest.raw,
      },
    }
  })
}

export const SUPPORTED_PROVIDER_NOTIFICATION_TYPES = ['flight.request.created', 'flight.confirmed']

export function providerNotificationEventKey(raw = {}, providerId = '') {
  const payload = raw.payload || raw.data || raw
  const type = raw.type || payload.type || 'flight.request.created'
  const requestId = raw.requestId || payload.flight_request_id || payload.request_id || payload.id
  return raw.eventKey || raw.event_key || payload.event_key || raw.idempotency_key || payload.idempotency_key ||
    `provider:${payload.provider_id || providerId}:flight:${requestId}:${type === 'flight.confirmed' ? 'flight-confirmed' : 'request-created'}`
}

export function normalizeRealtimeNotificationRecord(raw = {}, options = {}) {
  const providerId = options.providerId || ''
  const payload = raw.payload || raw.data || {}
  const type = raw.type || payload.type || 'flight.request.created'
  const requestId = payload.flight_request_id || payload.request_id || raw.requestId || payload.id
  const eventKey = providerNotificationEventKey(raw, providerId)
  const confirmed = type === 'flight.confirmed'
  return {
    id: eventKey,
    eventKey,
    type,
    backendNotificationId: raw.backendNotificationId || raw.notification_id || payload.notification_id || raw.id || null,
    requestId,
    title: raw.title || payload.title || (confirmed ? 'Vuelo confirmado' : 'Nueva solicitud de vuelo'),
    message: raw.message || payload.message || (confirmed
      ? 'El pago fue confirmado y el vuelo está listo para continuar con la preparación operacional.'
      : `${buildRequestFullRoute(payload)} · ${payload.aircraft_name || payload.aircraft || 'Aeronave por confirmar'}`),
    createdAt: raw.created_at || raw.createdAt || payload.occurred_at || payload.created_at || new Date().toISOString(),
    readAt: raw.read_at || raw.readAt || null,
    source: options.source || raw.source || 'http',
    payload: {
      ...(options.buildRealtimePayload || ((value) => buildRealtimeRequestPayload(value, providerId)))(payload),
      route: payload.route || buildRequestFullRoute(payload),
    },
  }
}

export function mergeRealtimeNotificationCollection(collection = [], existingNotifications = [], options = {}) {
  const byKey = new Map()
  existingNotifications.forEach((item) => {
    const key = providerNotificationEventKey(item, options.providerId)
    byKey.set(key, { ...item, id: key, eventKey: key })
  })
  collection.forEach((raw) => {
    const next = normalizeRealtimeNotificationRecord(raw, options)
    const previous = byKey.get(next.eventKey)
    byKey.set(next.eventKey, {
      ...previous, ...next,
      backendNotificationId: next.backendNotificationId || previous?.backendNotificationId || null,
      readAt: next.readAt || previous?.readAt || null,
    })
  })
  return [...byKey.values()].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))
}

export function isProviderNotificationVisible(notification, requests = []) {
  if (notification.type === 'flight.confirmed') return true
  const request = findOperatorRequestByIdentifier(requests, notification.requestId)
  // A paginated request list is not evidence that the notification is stale.
  return !request || resolveOperatorRequestQueue(request) === 'pending'
}

export function buildRealtimeRequestsFromNotifications(realtimeNotifications = []) {
  const nextRealtimeRequests = realtimeNotifications
    .filter((notification) => (notification.type || 'flight.request.created') === 'flight.request.created')
    .map((notification) => notification.payload)
    .filter((payload) => payload && payload.request_id)

  if (!nextRealtimeRequests.length) return []

  const uniqueByRequestId = new Map()
  nextRealtimeRequests.forEach((request) => {
    const requestId = String(request.request_id || request.id || '').trim()
    if (!requestId || uniqueByRequestId.has(requestId)) return
    uniqueByRequestId.set(requestId, request)
  })

  return [...uniqueByRequestId.values()].slice(0, 8)
}

export function getRealtimeBannerStatusLabel(request = {}) {
  return normalizeWorkflowLabel(request.workflowStatus || request.status || '')
}
