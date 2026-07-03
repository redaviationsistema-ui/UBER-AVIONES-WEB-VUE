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
  'en_curso',
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
        ...(request.raw || {}),
        ...(matchedRequest.raw || {}),
      },
    }
  })
}

export function normalizeRealtimeNotificationRecord(raw = {}, options = {}) {
  const providerId = options.providerId || ''
  const payloadBuilder =
    typeof options.buildRealtimePayload === 'function'
      ? options.buildRealtimePayload
      : (payload) => buildRealtimeRequestPayload(payload, providerId)

  const payload =
    raw.payload && typeof raw.payload === 'object'
      ? raw.payload
      : raw.data && typeof raw.data === 'object'
        ? raw.data
        : {}
  const requestId = payload.request_id || payload.flight_request_id || payload.id || raw.request_id || raw.id
  const title = raw.title || payload.title || 'Nueva solicitud de vuelo'
  const route = buildRequestFullRoute(payload)
  const message =
    raw.message ||
    `${route || 'Ruta por confirmar'} · ${
      payload.aircraft_name || payload.aircraft || 'Aeronave por confirmar'
    }`

  return {
    id: raw.id ? `backend-notification-${raw.id}` : `flight-request-${requestId || Date.now()}`,
    backendNotificationId: raw.id || null,
    requestId,
    title,
    message,
    createdAt: raw.created_at || payload.created_at || new Date().toISOString(),
    readAt: raw.read_at || raw.readAt || null,
    payload: payloadBuilder(payload),
  }
}

export function mergeRealtimeNotificationCollection(collection = [], existingNotifications = [], options = {}) {
  const normalizedCollection = collection.map((item) => normalizeRealtimeNotificationRecord(item, options))
  const merged = [...normalizedCollection, ...existingNotifications]
  const uniqueById = new Map()

  merged.forEach((notification) => {
    if (!notification?.id) return
    const existing = uniqueById.get(notification.id)
    if (!existing) {
      uniqueById.set(notification.id, notification)
      return
    }

    const existingTime = Date.parse(existing.createdAt || '') || 0
    const nextTime = Date.parse(notification.createdAt || '') || 0
    if (nextTime >= existingTime) {
      uniqueById.set(notification.id, {
        ...existing,
        ...notification,
        readAt: notification.readAt || existing.readAt,
      })
    }
  })

  return [...uniqueById.values()]
    .sort((left, right) => (Date.parse(right.createdAt || '') || 0) - (Date.parse(left.createdAt || '') || 0))
    .slice(0, 12)
}

export function buildRealtimeRequestsFromNotifications(realtimeNotifications = []) {
  const nextRealtimeRequests = realtimeNotifications
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
