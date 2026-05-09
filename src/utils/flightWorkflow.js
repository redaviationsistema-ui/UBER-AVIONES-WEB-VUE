const WORKFLOW_ORDER = [
  'created',
  'validating',
  'quoted',
  'contract',
  'paid',
  'confirmed',
  'operating',
  'completed',
  'rejected',
  'cancelled',
]

const WORKFLOW_DEFINITIONS = {
  created: {
    label: 'Pendiente',
    apiStatus: 'pending',
    apiWorkflow: 'pendiente',
    matches: ['pending', 'pendiente', 'nueva', 'nuevo', 'new', 'created', 'registrada', 'solicitada'],
  },
  validating: {
    label: 'En validacion',
    apiStatus: 'in_validation',
    apiWorkflow: 'en validacion',
    matches: [
      'en validacion',
      'validacion',
      'revision',
      'en revision',
      'review',
      'processing',
      'proceso',
      'matching',
      'matching en proceso',
      'revision operativa',
      'slot internacional',
    ],
  },
  quoted: {
    label: 'Cotizada',
    apiStatus: 'quoted',
    apiWorkflow: 'cotizada',
    matches: ['quoted', 'cotizada', 'cotizado', 'quote', 'propuesta', 'tarifa bajo validacion'],
  },
  contract: {
    label: 'En contrato',
    apiStatus: 'in_contract',
    apiWorkflow: 'en contrato',
    matches: ['contract', 'contrato', 'firma', 'nda', 'documentos', 'en firma'],
  },
  paid: {
    label: 'Pagada',
    apiStatus: 'paid',
    apiWorkflow: 'pagada',
    matches: ['paid', 'pagada', 'pagado', 'pago', 'payment'],
  },
  confirmed: {
    label: 'Confirmada',
    apiStatus: 'confirmed',
    apiWorkflow: 'confirmada',
    matches: ['approved', 'aprobada', 'aprobado', 'matched', 'confirmada', 'confirmado'],
  },
  operating: {
    label: 'En operacion',
    apiStatus: 'operating',
    apiWorkflow: 'en operacion',
    matches: [
      'operacion',
      'operacion confirmada',
      'en operacion',
      'asignada',
      'asignado',
      'briefing',
      'boarding',
      'en vuelo',
      'tracking',
      'concierge asignado',
      'catering confirmado',
      'mascota autorizada',
    ],
  },
  completed: {
    label: 'Finalizada',
    apiStatus: 'completed',
    apiWorkflow: 'finalizada',
    matches: ['completed', 'completada', 'finalizada', 'finalizado', 'cerrada', 'post-vuelo'],
  },
  rejected: {
    label: 'Rechazada',
    apiStatus: 'rejected',
    apiWorkflow: 'rechazada',
    matches: ['rejected', 'rechazada', 'rechazado', 'declined', 'no viable'],
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
}

export function resolveWorkflowState(value) {
  const normalized = normalizeTerm(value)

  if (!normalized) {
    return { id: 'created', ...WORKFLOW_DEFINITIONS.created }
  }

  const match = Object.entries(WORKFLOW_DEFINITIONS).find(([, definition]) =>
    definition.matches.some((token) => normalized.includes(token)),
  )

  if (match) {
    return { id: match[0], ...match[1] }
  }

  return {
    id: 'created',
    ...WORKFLOW_DEFINITIONS.created,
  }
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
      title: 'Solicitud registrada',
      description: 'Tu salida entra al flujo protegido con ruta, pasajeros y prioridad operativa.',
      meta: 'Inicio del proceso',
      done: hasRequests,
    },
    {
      title: 'Matching y validacion',
      description: 'Se revisan disponibilidad, tipo de cabina, restricciones y cobertura sugerida.',
      meta: 'Filtro premium',
      done: hasRequests && hasReachedWorkflowStage(value, 'validating'),
    },
    {
      title: 'Cierre comercial',
      description: 'Contrato, NDA, pago y confirmacion comercial antes de liberar la operacion.',
      meta: 'Control comercial',
      done: hasRequests && hasReachedWorkflowStage(value, 'contract'),
    },
    {
      title: 'Operacion confirmada',
      description: 'La reserva avanza a asignacion, concierge, tracking y ejecucion final.',
      meta: 'Ultima milla',
      done: hasRequests && hasReachedWorkflowStage(value, 'confirmed'),
    },
  ]
}
