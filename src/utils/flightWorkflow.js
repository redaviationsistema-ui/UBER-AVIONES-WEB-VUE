const WORKFLOW_ORDER = [
  'draft',
  'quoted',
  'package_selected',
  'reserved',
  'provider_pending',
  'provider_accepted',
  'contract_pending',
  'contract_signed',
  'payment_pending',
  'payment_confirmed',
  'flight_confirmed',
  'tracking_live',
  'completed',
  'rejected',
  'cancelled',
]

const WORKFLOW_DEFINITIONS = {
  draft: {
    label: 'Cotizacion',
    apiStatus: 'draft',
    apiWorkflow: 'borrador',
    matches: ['draft', 'borrador', 'created', 'new', 'nueva', 'nuevo'],
  },
  quoted: {
    label: 'Cotizacion',
    apiStatus: 'quoted',
    apiWorkflow: 'cotizada',
    matches: ['quoted', 'cotizada', 'cotizado', 'quote', 'propuesta'],
  },
  package_selected: {
    label: 'Pendiente',
    apiStatus: 'package_selected',
    apiWorkflow: 'paquete elegido',
    matches: ['package_selected', 'paquete elegido', 'paquete seleccionado', 'service tier'],
  },
  reserved: {
    label: 'Reserva solicitada',
    apiStatus: 'reserved',
    apiWorkflow: 'reserva solicitada',
    matches: ['reserved', 'reserva', 'reservada', 'reservado', 'solicitada', 'pending', 'pendiente'],
  },
  provider_pending: {
    label: 'Esperando proveedor',
    apiStatus: 'provider_pending',
    apiWorkflow: 'proveedor por confirmar',
    matches: [
      'provider_pending',
      'buscando operador',
      'buscando aeronave',
      'matching',
      'matching en proceso',
      'in_validation',
      'en validacion',
      'revision operativa',
    ],
  },
  provider_accepted: {
    label: 'Respuesta proveedor',
    apiStatus: 'provider_accepted',
    apiWorkflow: 'proveedor aceptado',
    matches: [
      'provider_accepted',
      'accepted',
      'aceptada',
      'aceptado',
      'operador asignado',
      'operador confirmado',
      'approved',
      'aprobada',
      'aprobado',
      'matched',
    ],
  },
  contract_pending: {
    label: 'Contrato pendiente',
    apiStatus: 'contract_pending',
    apiWorkflow: 'contrato pendiente',
    matches: ['contract_pending', 'contrato pendiente', 'in_contract', 'en contrato', 'firma pendiente'],
  },
  contract_signed: {
    label: 'Contrato firmado',
    apiStatus: 'contract_signed',
    apiWorkflow: 'contrato firmado',
    matches: ['contract_signed', 'contrato firmado', 'firma completada', 'signed'],
  },
  payment_pending: {
    label: 'Pago pendiente',
    apiStatus: 'payment_pending',
    apiWorkflow: 'pago pendiente',
    matches: ['payment_pending', 'pago pendiente', 'checkout', 'payment'],
  },
  payment_confirmed: {
    label: 'Pago confirmado',
    apiStatus: 'payment_confirmed',
    apiWorkflow: 'pago confirmado',
    matches: ['payment_confirmed', 'paid', 'pagada', 'pagado', 'pago aprobado'],
  },
  flight_confirmed: {
    label: 'Vuelo confirmado',
    apiStatus: 'flight_confirmed',
    apiWorkflow: 'vuelo confirmado',
    matches: ['flight_confirmed', 'vuelo confirmado', 'operacion confirmada'],
  },
  tracking_live: {
    label: 'En operacion',
    apiStatus: 'tracking_live',
    apiWorkflow: 'tracking en vivo',
    matches: [
      'tracking_live',
      'tracking',
      'en operacion',
      'en vuelo',
      'boarding',
      'briefing',
      'concierge asignado',
    ],
  },
  completed: {
    label: 'Completado',
    apiStatus: 'completed',
    apiWorkflow: 'finalizada',
    matches: ['completed', 'completada', 'finalizada', 'finalizado', 'cerrada', 'post-vuelo'],
  },
  rejected: {
    label: 'Vuelo rechazado',
    apiStatus: 'rejected',
    apiWorkflow: 'rechazada',
    matches: [
      'rejected',
      'rechazada',
      'rechazado',
      'declined',
      'no viable',
      'sin opciones disponibles',
      'no options available',
      'operador rechazo',
      'proveedor rechazo',
    ],
  },
  cancelled: {
    label: 'Cancelada',
    apiStatus: 'cancelled',
    apiWorkflow: 'cancelada',
    matches: ['cancelled', 'cancelada', 'cancelado'],
  },
}

export const SHARED_WORKFLOW_STEPS = [
  {
    id: 'reserved',
    shortLabel: 'Reserva',
    title: 'Reserva solicitada',
    clientLabel: 'Reserva',
  },
  {
    id: 'provider_accepted',
    shortLabel: 'Proveedor',
    title: 'Respuesta proveedor',
    clientLabel: 'Respuesta proveedor',
  },
  {
    id: 'contract_pending',
    shortLabel: 'Contrato',
    title: 'Contrato pendiente',
    clientLabel: 'Contrato',
  },
  {
    id: 'payment_pending',
    shortLabel: 'Pago',
    title: 'Pago pendiente',
    clientLabel: 'Pago',
  },
  {
    id: 'flight_confirmed',
    shortLabel: 'Vuelo',
    title: 'Vuelo confirmado',
    clientLabel: 'Vuelo',
  },
  {
    id: 'tracking_live',
    shortLabel: 'Tracking',
    title: 'Tracking activo',
    clientLabel: 'Tracking',
  },
]

function normalizeTerm(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

export function normalizeWorkflowToken(value) {
  return normalizeTerm(value)
}

export function resolveWorkflowState(value) {
  const normalized = normalizeTerm(value)

  if (!normalized) {
    return { id: 'draft', ...WORKFLOW_DEFINITIONS.draft }
  }

  const exactMatch = Object.entries(WORKFLOW_DEFINITIONS).find(([, definition]) =>
    definition.matches.some((token) => normalized === normalizeTerm(token)),
  )

  if (exactMatch) {
    return { id: exactMatch[0], ...exactMatch[1] }
  }

  const partialMatch = Object.entries(WORKFLOW_DEFINITIONS).find(([, definition]) =>
    [...definition.matches]
      .sort((first, second) => normalizeTerm(second).length - normalizeTerm(first).length)
      .some((token) => normalized.includes(normalizeTerm(token))),
  )

  if (partialMatch) {
    return { id: partialMatch[0], ...partialMatch[1] }
  }

  return { id: 'draft', ...WORKFLOW_DEFINITIONS.draft }
}

function nestedReservationRecord(record = {}) {
  if (!record || typeof record !== 'object') return null

  return (
    record.reservation ||
    record.flight_request ||
    record.request ||
    record.trip ||
    null
  )
}

function listRequestMatches(record = {}) {
  if (!record || typeof record !== 'object') return []

  const matches = [
    ...(Array.isArray(record.matches) ? record.matches : []),
    ...(Array.isArray(record.matched_options) ? record.matched_options : []),
    ...(Array.isArray(record.request_matches) ? record.request_matches : []),
  ]

  return matches.filter((item) => item && typeof item === 'object')
}

function pickAcceptedRequestMatch(record = {}) {
  const matches = listRequestMatches(record)
  return (
    matches.find((match) =>
      ['accepted', 'aceptada', 'aceptado', 'approved', 'aprobada', 'aprobado'].includes(
        normalizeWorkflowToken(match?.status || match?.workflow_status || match?.state),
      ),
    ) || null
  )
}

export function resolveSharedWorkflowStatus(record = {}) {
  if (!record || typeof record !== 'object') {
    return ''
  }

  const nestedReservation = nestedReservationRecord(record)
  const rawWorkflow =
    record.workflow_status ||
    record.workflow ||
    nestedReservation?.workflow_status ||
    record.status ||
    nestedReservation?.status ||
    ''
  const normalizedWorkflow = normalizeWorkflowToken(rawWorkflow)
  const normalizedContractStatus = normalizeWorkflowToken(
    record.contract?.status ||
      record.contract_status ||
      nestedReservation?.contract?.status ||
      nestedReservation?.contract_status ||
      '',
  )
  const normalizedPaymentStatus = normalizeWorkflowToken(
    record.payment?.status ||
      record.payment_status ||
      record.payment_order?.status ||
      nestedReservation?.payment?.status ||
      nestedReservation?.payment_status ||
      '',
  )
  const hasExplicitAssignedProvider = Boolean(record.assigned_provider_id)
  const hasExplicitAssignedAircraft = Boolean(record.assigned_aircraft_id)
  const hasSelectedProvider = Boolean(record.provider_id)
  const hasSelectedAircraft = Boolean(record.aircraft_id)
  const hasSelectedMatch = Boolean(record.match_id || record.matched_option_id)
  const hasOperation = Boolean(
    record.operation?.id ||
      record.operation_id ||
      nestedReservation?.operation?.id ||
      nestedReservation?.operation_id ||
      record.operaciones?.[0]?.id,
  )
  const acceptedMatch = pickAcceptedRequestMatch(record)
  const hasAcceptedMatch = Boolean(acceptedMatch)
  const matches = listRequestMatches(record)
  const hasRejectedMatch = matches.some((match) =>
    ['rejected', 'rechazada', 'rechazado', 'declined'].includes(
      normalizeWorkflowToken(match?.status || match?.workflow_status || match?.state),
    ),
  )
  const hasPendingMatch = matches.some((match) =>
    ['pending', 'pendiente', 'sent to provider', 'sent_to_provider'].includes(
      normalizeWorkflowToken(match?.status || match?.workflow_status || match?.state),
    ),
  )

  const contractOrLaterStates = new Set([
    'contract pending',
    'contrato pendiente',
    'contract signed',
    'contrato firmado',
    'payment pending',
    'pago pendiente',
    'payment confirmed',
    'pago confirmado',
    'flight confirmed',
    'vuelo confirmado',
    'tracking live',
    'tracking en vivo',
    'completed',
    'finalizada',
    'finalizado',
    'cancelled',
    'cancelada',
    'cancelado',
    'rejected',
    'rechazada',
    'rechazado',
  ])
  const rejectedSignals = new Set([
    'rejected',
    'rechazada',
    'rechazado',
    'declined',
    'sin opciones disponibles',
    'no options available',
  ])
  const providerAcceptedSignals = new Set([
    'aceptada',
    'aceptado',
    'accepted',
    'approved',
    'aprobada',
    'aprobado',
    'provider accepted',
    'provider_accepted',
    'operador confirmado',
    'matched',
  ])
  const providerPendingSignals = new Set([
    'provider pending',
    'provider_pending',
    'buscando operador',
    'buscando aeronave',
    'matching',
    'matching en proceso',
    'in validation',
    'en validacion',
    'revision operativa',
    'operador asignado',
  ])
  const genericConfirmedSignals = new Set(['confirmada', 'confirmado'])
  const paymentConfirmedSignals = new Set([
    'paid',
    'pagado',
    'pagada',
    'payment confirmed',
    'payment_confirmed',
  ])
  const paymentPendingSignals = new Set([
    'pending',
    'pendiente',
    'pendiente de pago',
    'payment pending',
    'payment_pending',
    'requires payment method',
    'requires_payment_method',
  ])

  if (contractOrLaterStates.has(normalizedWorkflow)) {
    return rawWorkflow
  }

  if (paymentConfirmedSignals.has(normalizedPaymentStatus)) {
    return 'payment_confirmed'
  }

  if (paymentPendingSignals.has(normalizedPaymentStatus) && normalizedContractStatus === 'signed') {
    return 'payment_pending'
  }

  if (normalizedContractStatus === 'signed') {
    return 'contract_signed'
  }

  if (['generated', 'en firma', 'firma pendiente'].includes(normalizedContractStatus)) {
    return 'contract_pending'
  }

  if (rejectedSignals.has(normalizedWorkflow)) {
    return 'rejected'
  }

  if (providerAcceptedSignals.has(normalizedWorkflow) || hasAcceptedMatch) {
    return 'provider_accepted'
  }

  if (hasOperation) {
    return 'contract_pending'
  }

  if (providerPendingSignals.has(normalizedWorkflow)) {
    return 'provider_pending'
  }

  if (genericConfirmedSignals.has(normalizedWorkflow)) {
    if (hasAcceptedMatch || hasExplicitAssignedProvider || hasExplicitAssignedAircraft) {
      return 'provider_accepted'
    }

    return 'provider_pending'
  }

  if (hasRejectedMatch && !hasAcceptedMatch && !hasPendingMatch) {
    return 'rejected'
  }

  if ((hasSelectedProvider || hasSelectedAircraft || hasSelectedMatch) && !normalizedWorkflow) {
    return 'provider_pending'
  }

  if ((hasExplicitAssignedProvider || hasExplicitAssignedAircraft) && !normalizedWorkflow) {
    return 'provider_pending'
  }

  return rawWorkflow
}

export function resolveSharedVisualWorkflowStepId(value = '') {
  const workflowId = resolveWorkflowState(value).id

  if (workflowId === 'provider_pending') return 'provider_accepted'
  if (workflowId === 'contract_signed') return 'contract_pending'
  if (workflowId === 'payment_confirmed') return 'payment_pending'
  if (workflowId === 'completed') return 'tracking_live'

  return workflowId
}

export function resolveSharedWorkflowStageTitle(value = '') {
  const workflowId = resolveWorkflowState(value).id

  if (workflowId === 'provider_pending') return 'Esperando proveedor'
  if (workflowId === 'contract_pending') return 'Contrato pendiente'
  if (workflowId === 'contract_signed') return 'Contrato firmado'
  if (workflowId === 'payment_pending') return 'Pago pendiente'
  if (workflowId === 'payment_confirmed') return 'Pago confirmado'

  return normalizeWorkflowLabel(value)
}

export function buildSharedFlowStepStates(value = '') {
  const visualStepId = resolveSharedVisualWorkflowStepId(value)
  const currentIndex = SHARED_WORKFLOW_STEPS.findIndex((step) => step.id === visualStepId)

  return SHARED_WORKFLOW_STEPS.map((step, index) => ({
    ...step,
    state:
      currentIndex === -1
        ? index === 0
          ? 'active'
          : 'todo'
        : index < currentIndex
          ? 'done'
          : index === currentIndex
            ? 'active'
            : 'todo',
  }))
}

export function normalizeWorkflowLabel(value) {
  return resolveWorkflowState(value).label
}

export function buildWorkflowApiPayload(value) {
  const state = resolveWorkflowState(value)
  return {
    status: state.apiStatus,
    workflow_status: state.apiWorkflow,
  }
}

function getWorkflowIndex(value) {
  const state = resolveWorkflowState(value)
  const index = WORKFLOW_ORDER.indexOf(state.id)
  return index === -1 ? 0 : index
}

export function hasReachedWorkflowStage(value, stageId) {
  return getWorkflowIndex(value) >= getWorkflowIndex(stageId)
}

export function buildClientWorkflowTimeline(value, hasRequests = false) {
  return [
    {
      title: 'Buscar y cotizar',
      description: 'Red Aviation valida ruta, cobertura, capacidad y opciones para entregarte alternativas claras.',
      meta: 'Reservar',
      done: hasRequests && hasReachedWorkflowStage(value, 'quoted'),
    },
    {
      title: 'Elegir y reservar',
      description: 'Seleccionas la mejor opcion, completas pasajeros y dejas tu vuelo listo para confirmacion.',
      meta: 'Conversion',
      done: hasRequests && hasReachedWorkflowStage(value, 'reserved'),
    },
    {
      title: 'Proveedor responde la solicitud',
      description: 'Red Aviation coordina con el proveedor la aceptacion o rechazo operativo sin exponer contacto directo.',
      meta: 'Proveedor',
      done: hasRequests && hasReachedWorkflowStage(value, 'provider_accepted'),
    },
    {
      title: 'Tu vuelo esta siendo confirmado',
      description: 'Contrato, pago y coordinacion comercial viven en un solo flujo hasta cerrar la operacion.',
      meta: 'Control',
      done: hasRequests && hasReachedWorkflowStage(value, 'flight_confirmed'),
    },
    {
      title: 'Volar con seguimiento total',
      description: 'Tienes estado, terminal, tripulacion y tracking dentro de Mis vuelos hasta el cierre.',
      meta: 'Seguimiento',
      done: hasRequests && hasReachedWorkflowStage(value, 'tracking_live'),
    },
  ]
}
