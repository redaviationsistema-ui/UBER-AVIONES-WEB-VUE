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

function normalizeTerm(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
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
