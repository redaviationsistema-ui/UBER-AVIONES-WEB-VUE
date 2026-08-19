///--------------------------------------------------------------------------------------------
/// VISTA DE PORTAL DE TRIPULACION
///--------------------------------------------------------------------------------------------


<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../../lib/api'
import { pickCollection, pickRecord, requestWithCandidates } from '../../lib/backendCrud'
import { roleBasePaths } from '../../data/roleFlows'
import { subscribeWorkflowSync } from '../../lib/workflowSync'
import {
  saveAvailabilityDate as persistAvailabilityDate,
} from '../../services/disponibilidadService'
import { useAuthStore } from '../../stores/auth'
import { useUiStore } from '../../stores/ui'
import { normalizeApiError } from '../../lib/apiError'
import CrewAvailabilitySection from './CrewAvailabilitySection.vue'
import CrewUiIcon from './CrewUiIcon.vue'
import CrewNotificationCenter from './CrewNotificationCenter.vue'

const props = defineProps({
  section: { type: String, required: true },
})

const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()
let removeCrewSyncSubscription = null
let loadPortalPromise = null
let backgroundCrewWarmupTimer = null
let checklistAssignmentsRefreshTimer = null
const CREW_PORTAL_TIMEOUT_MS = 15000
const IS_LOCAL_CREW_DEV =
  import.meta.env.DEV &&
  typeof window !== 'undefined' &&
  /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname || '')
const portalDataLoaded = reactive({
  dashboard: false,
  assignments: false,
  profile: false,
  documents: false,
  availability: false,
  incidents: false,
})
const portalDataLoading = reactive({
  dashboard: false,
  assignments: false,
  profile: false,
  documents: false,
  availability: false,
  incidents: false,
})
const portalDataErrors = reactive({
  dashboard: '', assignments: '', profile: '', documents: '', availability: '', incidents: '',
})
const portalLoadState = computed(() => {
  const keys = Object.keys(portalDataLoaded)
  const failedSections = keys.filter((key) => portalDataErrors[key])
  return {
    hasErrors: failedSections.length > 0,
    isPartial: failedSections.length > 0 && keys.some((key) => portalDataLoaded[key]),
    failedSections,
  }
})

if (IS_LOCAL_CREW_DEV && import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', (payload) => {
    const shouldReloadCrewPortal = Array.isArray(payload?.updates)
      ? payload.updates.some((update) => String(update.path || '').includes('/src/features/crew/'))
      : false

    if (shouldReloadCrewPortal) {
      window.location.reload()
    }
  })
}

const metrics = ref({
  asignaciones: 0,
  servicios_activos: 0,
})
const profileRating = ref('')
const backendDocumentsSummary = ref('')

const storedOperationalStatus = ref('')
const currentStatus = ref('')

const incidentTypes = ['catering', 'cabina', 'cliente', 'seguridad', 'horario', 'coordinacion', 'otro']
const incidentPriorities = ['baja', 'media', 'alta', 'critica']

const providerContext = reactive({
  providerName: '',
  operatorLabel: '',
  managedBy: '',
  approvalState: '',
})

const assignments = ref([])

const availabilityBlocks = ref([])
const availabilityStatusCatalog = ref([])

const documentItems = ref([])

const incidents = ref([])
const incidentApiErrors = ref({})
const incidentSubmissionInFlight = ref(false)
const flightIncidentOpen = ref(false)
const selectedFlightStepId = ref('')
const selectedChecklistItemId = ref('')
const selectedTrackingMilestoneId = ref('')
const checklistFailureSubmitting = ref(false)
const checklistFailureFormOpen = ref(false)
const checklistCollapsedGroups = reactive({})
const checklistFailureDraft = reactive({
  description: '',
  files: [],
  previews: [],
})

const historyEntries = ref([])

const assignmentResponseForm = reactive({
  response: '',
  rejectReason: '',
  comment: '',
  eta: '',
})
const assignmentActionState = reactive({
  active: false,
  title: '',
  detail: '',
  tone: 'success',
})

function openAssignmentActionState({
  title = 'Sincronizando operacion',
  detail = 'Estamos registrando tu respuesta con Admin / Red Sky.',
} = {}) {
  assignmentActionState.active = true
  assignmentActionState.title = title
  assignmentActionState.detail = detail
  assignmentActionState.tone = 'success'
}

async function showAssignmentActionSuccess({
  title = 'Movimiento confirmado',
  detail = 'La operacion ya se actualizo.',
  duration = 1700,
} = {}) {
  assignmentActionState.active = true
  assignmentActionState.title = title
  assignmentActionState.detail = detail
  assignmentActionState.tone = 'success'
  await new Promise((resolve) => window.setTimeout(resolve, duration))
  assignmentActionState.active = false
  assignmentActionState.title = ''
  assignmentActionState.detail = ''
  assignmentActionState.tone = 'success'
}

function closeAssignmentActionState() {
  assignmentActionState.active = false
  assignmentActionState.title = ''
  assignmentActionState.detail = ''
  assignmentActionState.tone = 'success'
}

const agendaBlockForm = reactive({
  state: 'No disponible',
  blockType: '',
  reason: '',
})

const availabilityForm = reactive({
  from: '',
  to: '',
  state: 'DISPONIBLE',
  base: '',
  coverage: '',
  restriction: '',
})

const incidentForm = reactive({
  flight: '',
  type: '',
  priority: '',
  description: '',
  evidence: '',
  files: [],
  state: 'open',
  actionTaken: '',
  phase: 'Pre-vuelo',
})

const maxCrewIncidentFileBytes = 10 * 1024 * 1024
const maxCrewIncidentTotalBytes = 25 * 1024 * 1024
const maxCrewIncidentFiles = 5

const documentForm = reactive({
  name: '',
  category: 'Certificacion',
  expiresAt: '',
  note: '',
})

const profileForm = reactive({
  name: '',
  phone: '',
  email: '',
  base: '',
  languages: '',
  certifications: '',
  experience: '',
  photo: '',
  weeklyAvailability: '',
  birthDate: '',
  nationality: '',
  documentType: '',
  documentNumber: '',
  documentExpiration: '',
  identityValidationRequired: '',
  documents: '',
  profileState: '',
})

const configForm = reactive({
  notifyAssignments: true,
  notifyIncidents: true,
  notifyScheduleChanges: true,
  personalCoverage: '',
  escalationMode: 'Admin primero',
})

const resolvedSection = computed(() => {
  const aliases = {
    agenda: 'calendario',
    checklist: 'calendario',
    pagos: 'historial',
  }

  return aliases[props.section] || props.section
})

const providerName = computed(
  () =>
    providerContext.providerName ||
    auth.user?.provider?.commercial_name ||
    auth.user?.provider?.company_name ||
    auth.user?.company_name ||
    '',
)

const crewMemberName = computed(() => auth.user?.name || profileForm.name || '')
const sortedAssignments = computed(() =>
  [...assignments.value].sort((left, right) => {
    const priority = {
      'En servicio': 0,
      Incidencia: 1,
      Preparacion: 2,
      'En aeropuerto/base': 3,
      'Cabina revisada': 4,
      'Pasajeros recibidos': 5,
      'En escala / siguiente tramo': 6,
      'Reporte enviado': 7,
      Confirmado: 3,
      Pendiente: 4,
      Finalizado: 5,
      Cancelado: 6,
    }

    const leftPriority = priority[left.missionStatus] ?? 99
    const rightPriority = priority[right.missionStatus] ?? 99

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority
    }

    const leftDate = new Date(`${left.date || '2100-01-01'}T${left.time || '23:59'}`)
    const rightDate = new Date(`${right.date || '2100-01-01'}T${right.time || '23:59'}`)

    return leftDate.getTime() - rightDate.getTime()
  }),
)
const currentAssignment = computed(() => sortedAssignments.value[0] || null)
const pendingDocuments = computed(() => documentItems.value.filter((item) => item.state !== 'Aprobado'))
const approvedDocuments = computed(() => documentItems.value.filter((item) => item.state === 'Aprobado'))

function normalizeCrewOperationalStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return ''
  if (['active', 'activo', 'available', 'disponible'].includes(normalized)) return 'Disponible'
  if (['en vuelo', 'in flight', 'vuelo'].includes(normalized)) return 'En vuelo'
  if (['blocked', 'bloqueado', 'inactive', 'inactivo', 'no disponible'].includes(normalized)) return 'No disponible'
  if (['suspended', 'suspendido'].includes(normalized)) return 'Suspendido'
  if (['rest', 'descanso'].includes(normalized)) return 'Descanso'
  return value
}

function formatProfileDate(value) {
  if (!value) return ''
  const normalized = String(value).includes('T') ? String(value) : `${value}T08:00`
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return String(value)

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}


function hasLoadedResources(keys = []) {
  return keys.every((key) => portalDataLoaded[key])
}

function hasLoadingResources(keys = []) {
  return keys.some((key) => portalDataLoading[key])
}

const isDashboardLoading = computed(
  () =>
    hasLoadingResources(['dashboard', 'assignments']) &&
    !hasLoadedResources(['dashboard', 'assignments']),
)
const isCalendarLoading = computed(
  () => portalDataLoading.assignments && !portalDataLoaded.assignments,
)
const isAvailabilityLoading = computed(
  () => portalDataLoading.availability && !portalDataLoaded.availability,
)
const isProfileLoading = computed(
  () =>
    hasLoadingResources(['profile', 'documents']) &&
    !hasLoadedResources(['profile', 'documents']),
)
const isDocumentsLoading = computed(
  () => portalDataLoading.documents && !portalDataLoaded.documents,
)
const isIncidentsLoading = computed(
  () =>
    hasLoadingResources(['incidents', 'assignments']) &&
    !hasLoadedResources(['incidents', 'assignments']),
)
const isHistoryLoading = computed(
  () =>
    hasLoadingResources(['assignments', 'incidents']) &&
    !hasLoadedResources(['assignments', 'incidents']),
)
const isConfigLoading = computed(
  () => portalDataLoading.profile && !portalDataLoaded.profile,
)

const activeCrewLoadingState = computed(() => {
  if (isDashboardLoading.value) {
    return {
      tone: 'operation',
      eyebrow: 'OPERACION',
      title: 'Preparando tablero de vuelo',
      detail: 'Sincronizando readiness, mision actual, estatus y alertas operativas.',
      stages: ['Readiness', 'Mision activa', 'Alertas'],
      activeStages: 2,
    }
  }

  if (isCalendarLoading.value) {
    return {
      tone: 'operation',
      eyebrow: 'OPERACION',
      title: 'Armando operacion del dia',
      detail: 'Traemos briefing, etapas activas y movimientos de agenda.',
      stages: ['Briefing', 'Agenda', 'Etapas'],
      activeStages: 2,
    }
  }

  if (isAvailabilityLoading.value) {
    return {
      tone: 'operation',
      eyebrow: 'OPERACION',
      title: 'Confirmando al Admin',
      detail: 'Estamos notificando tu disponibilidad y sincronizando la mision operativa.',
      stages: ['Cobertura', 'Disponibilidad', 'Sincronizacion'],
      activeStages: 2,
    }
  }

  if (isProfileLoading.value) {
    return {
      tone: 'operation',
      eyebrow: 'PERFIL',
      title: 'Preparando perfil de vuelo',
      detail: 'Estamos cargando datos personales, validaciones y alertas del expediente.',
      stages: ['Datos', 'Validaciones', 'Alertas'],
      activeStages: 2,
    }
  }

  if (isDocumentsLoading.value) {
    return {
      tone: 'operation',
      eyebrow: 'DOCUMENTOS',
      title: 'Organizando centro documental',
      detail: 'Sincronizando certificados, vencimientos y estado de validacion.',
      stages: ['Certificados', 'Vencimientos', 'Revision'],
      activeStages: 2,
    }
  }

  if (isIncidentsLoading.value) {
    return {
      tone: 'incidents',
      eyebrow: 'INCIDENCIAS',
      title: 'Cargando incidencias',
      detail: 'Estamos reuniendo reportes, prioridades, responsables y seguimiento operativo.',
      stages: ['Reportes', 'Prioridades', 'Seguimiento'],
      activeStages: 1,
    }
  }

  if (isHistoryLoading.value) {
    return {
      tone: 'operation',
      eyebrow: 'HISTORIAL',
      title: 'Recuperando trazabilidad',
      detail: 'Estamos armando resumen operativo, actividad cerrada y registro historico.',
      stages: ['Actividad', 'Resumen', 'Trazabilidad'],
      activeStages: 2,
    }
  }

  if (isConfigLoading.value) {
    return {
      tone: 'operation',
      eyebrow: 'CONFIGURACION',
      title: 'Preparando preferencias',
      detail: 'Sincronizando notificaciones, cobertura y reglas de escalamiento.',
      stages: ['Preferencias', 'Cobertura', 'Notificaciones'],
      activeStages: 2,
    }
  }

  return null
})

const canonicalCrewSection = computed(() => {
  if (['asignaciones', 'calendario', 'incidencias'].includes(resolvedSection.value)) return 'asignaciones'
  if (['perfil', 'documentos', 'historial', 'configuracion'].includes(resolvedSection.value)) return 'perfil'
  return resolvedSection.value
})

function formatCrewDate(value, options = {}) {
  if (!value) return ''
  const normalized = String(value).includes('T') ? String(value) : `${value}T08:00`
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...options,
  }).format(date)
}

function formatCrewDateTime(dateValue = '', timeValue = '') {
  const source = [dateValue, timeValue].filter(Boolean).join('T')
  if (!source) return 'Por definir'
  const parsed = new Date(source.includes('T') ? source : `${source}T08:00`)
  if (Number.isNaN(parsed.getTime())) return [dateValue, timeValue].filter(Boolean).join(' · ') || 'Por definir'
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

function normalizeChecklistItemState(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (['completed', 'correcto', 'ok', 'done', 'completado'].includes(normalized)) return 'Correcto'
  if (['not_applicable', 'not applicable', 'na', 'no aplica'].includes(normalized)) return 'No aplica'
  if (['failed', 'issue', 'falla', 'falla reportada'].includes(normalized)) return 'Falla reportada'
  return 'Pendiente'
}

function normalizeChecklistItem(item = {}) {
  return {
    id: item.id,
    code: item.code || '',
    title:
      item.label ||
      item.description ||
      item.name ||
      item.code ||
      'Checklist sin nombre',
    category: item.category || 'general',
    status: normalizeChecklistItemState(item.status),
    required: Boolean(item.is_required),
    critical: Boolean(item.is_critical),
    notes: item.notes || '',
    completedAt: item.completed_at || null,
  }
}

function normalizeChecklistType(value = '') {
  return String(value || '').trim().toLowerCase()
}

function humanizeChecklistType(value = '') {
  const normalized = normalizeChecklistType(value)
  const labels = {
    preparation: 'Preparacion',
    preflight: 'Checklist pre-vuelo',
    postflight: 'Checklist post-vuelo',
  }

  return labels[normalized] || value || 'Checklist'
}

const CREW_WORKFLOW_SEQUENCE = [
  'pending_confirmation',
  'pending_crew_response',
  'confirmed',
  'preparation_pending',
  'ready_for_operation',
  'checked_in',
  'preflight_in_progress',
  'cabin_ready',
  'boarding',
  'boarding_completed',
  'in_flight',
  'landed',
  'postflight_pending',
  'report_pending',
  'crew_completed',
  'administratively_closed',
]

function resolveWorkflowIndex(value = '') {
  return CREW_WORKFLOW_SEQUENCE.indexOf(normalizeStatusToken(value))
}

function hasReachedWorkflowStatus(currentStatus = '', targetStatuses = []) {
  const currentIndex = resolveWorkflowIndex(currentStatus)
  if (currentIndex === -1) return false

  return targetStatuses.some((status) => {
    const targetIndex = resolveWorkflowIndex(status)
    return targetIndex !== -1 && currentIndex >= targetIndex
  })
}

const currentFlightSummary = computed(() => {
  const assignment = currentAssignment.value
  if (!assignment) return null

  return {
    operationId: assignment.flight || `Vuelo ${assignment.operationId || assignment.id}`,
    route: assignment.route || 'Ruta pendiente',
    date: formatCrewDate(assignment.date),
    reportTime: assignment.briefingTime || assignment.time || 'Por definir',
    aircraft: assignment.aircraft || 'Pendiente por asignar',
    fbo: assignment.presentationPlace || assignment.originName || assignment.origin || 'Pendiente por confirmar',
    passengers: assignment.passengers ? `${assignment.passengers} pasajero${assignment.passengers === 1 ? '' : 's'}` : 'Sin dato',
    status: assignment.crewStatusLabel || assignment.missionStatus || assignment.responseStatus || 'Pendiente',
    observations:
      assignment.specialRequirements ||
      assignment.vipRequirements ||
      assignment.internalContact ||
      'Sin observaciones importantes registradas.',
  }
})

const flightChecklistGroups = computed(() => {
  const assignment = currentAssignment.value
  const checklists = Array.isArray(assignment?.checklists) ? assignment.checklists : []

  return checklists
    .map((group) => {
      const items = Array.isArray(group.items)
        ? group.items.map((item) => ({
          ...normalizeChecklistItem(item),
          checklistType: group.type || item.category || 'general',
        }))
        : []

      const resolvedCount = items.filter((item) => item.status !== 'Pendiente').length

      return {
        id: group.id || group.type || 'checklist-group',
        type: group.type || group.category || 'general',
        status: group.status || `${resolvedCount}/${items.length}`,
        items,
        resolvedCount,
      }
    })
    .filter((group) => group.items.length)
})

const checklistGroupsByType = computed(() => {
  const groups = new Map()

  flightChecklistGroups.value.forEach((group) => {
    groups.set(normalizeChecklistType(group.type), group)
  })

  return groups
})

function isChecklistGroupResolved(group = null) {
  if (!group || !Array.isArray(group.items) || !group.items.length) return false

  return group.items.every((item) => ['Correcto', 'No aplica'].includes(item.status))
}

const checklistProgressPercent = computed(() => (
  flightChecklistSummary.value.total
    ? Math.round((flightChecklistSummary.value.resolved / flightChecklistSummary.value.total) * 100)
    : 0
))

const checklistFlatItems = computed(() =>
  flightChecklistGroups.value.flatMap((group) =>
    group.items.map((item) => ({
      ...item,
      groupId: group.id,
      groupLabel: group.type,
    }))),
)

const selectedChecklistItem = computed(() => {
  if (!checklistFlatItems.value.length) return null

  return (
    checklistFlatItems.value.find((item) => item.id === selectedChecklistItemId.value)
    || checklistFlatItems.value.find((item) => item.status === 'Pendiente')
    || checklistFlatItems.value.find((item) => item.status === 'Falla reportada')
    || checklistFlatItems.value[0]
  )
})

const flightChecklistSummary = computed(() => {
  const items = flightChecklistGroups.value.flatMap((group) => group.items)
  const completed = items.filter((item) => item.status === 'Correcto').length
  const notApplicable = items.filter((item) => item.status === 'No aplica').length
  const failed = items.filter((item) => item.status === 'Falla reportada').length
  const pending = items.filter((item) => item.status === 'Pendiente').length

  return {
    total: items.length,
    completed,
    notApplicable,
    failed,
    pending,
    resolved: completed + notApplicable + failed,
  }
})

const linkedIncidents = computed(() =>
  incidents.value.filter((item) => String(item.operationId || '') === String(currentAssignment.value?.operationId || '')),
)

const flightEvidenceItems = computed(() => {
  const templates = ['Catering', 'Equipaje', 'Cabina lista']
  const evidenceIncidents = linkedIncidents.value.filter((item) => item.evidence || item.files?.length)

  return templates.map((label, index) => {
    const evidence = evidenceIncidents[index] || null
    return {
      id: label.toLowerCase().replace(/\s+/g, '-'),
      label,
      status: evidence ? 'Evidencia cargada' : 'Pendiente',
      meta: evidence ? formatCrewDateTime(String(evidence.createdAt || evidence.time || '').slice(0, 10), String(evidence.createdAt || evidence.time || '').slice(11, 16)) : '',
      detail: evidence?.description || 'Tomar o subir foto',
    }
  })
})

const flightEvidenceSummary = computed(() => ({
  total: flightEvidenceItems.value.length,
  completed: flightEvidenceItems.value.filter((item) => item.status === 'Evidencia cargada').length,
}))

function formatTrackingTime(value = '') {
  if (!value) return ''
  const parsed = new Date(String(value))
  if (Number.isNaN(parsed.getTime())) return ''

  return new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

function buildTimelineMatchKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
}

function findLatestTimelineEntry(timeline = [], { statuses = [], titleIncludes = [] } = {}) {
  const normalizedStatuses = statuses.map((status) => buildTimelineMatchKey(status)).filter(Boolean)
  const normalizedTitles = titleIncludes.map((title) => buildTimelineMatchKey(title)).filter(Boolean)

  const matches = timeline.filter((entry) => {
    const status = buildTimelineMatchKey(entry?.status || '')
    const title = buildTimelineMatchKey(entry?.title || '')

    return normalizedStatuses.includes(status)
      || normalizedTitles.some((value) => title.includes(value))
  })

  return matches
    .slice()
    .sort((left, right) => {
      const leftTime = Date.parse(left?.created_at || '')
      const rightTime = Date.parse(right?.created_at || '')
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0)
    })[0] || null
}

function milestoneHasLinkedIncident(keywords = []) {
  const normalizedKeywords = keywords.map((keyword) => String(keyword || '').trim().toLowerCase()).filter(Boolean)
  if (!normalizedKeywords.length) return false

  return linkedIncidents.value.some((incident) => {
    const haystack = [
      incident.type,
      incident.description,
      incident.phase,
      incident.actionTaken,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return normalizedKeywords.some((keyword) => haystack.includes(keyword))
  })
}

const canStartBoarding = computed(() => {
  const assignment = currentAssignment.value
  if (!assignment) return false

  return assignment.workflowStatus === 'cabin_ready'
    && !assignment.canReceivePassengers
    && !assignment.crewServiceStartedAt
})

const flightTrackingMilestones = computed(() => {
  const assignment = currentAssignment.value
  if (!assignment) return []

  const timeline = Array.isArray(assignment.timeline) ? assignment.timeline : []
  const workflowStatus = String(assignment.workflowStatus || '')
  const reachedCheckin = Boolean(assignment.crewCheckinAt) || hasReachedWorkflowStatus(workflowStatus, ['checked_in'])
  const reachedCabinReady = hasReachedWorkflowStatus(workflowStatus, ['cabin_ready'])
  const reachedBoarding = hasReachedWorkflowStatus(workflowStatus, ['boarding'])
  const reachedBoardingCompleted = hasReachedWorkflowStatus(workflowStatus, ['boarding_completed'])
  const reachedInFlight = hasReachedWorkflowStatus(workflowStatus, ['in_flight'])
  const reachedLanded = hasReachedWorkflowStatus(workflowStatus, ['landed'])
  const reachedDeboarding = hasReachedWorkflowStatus(workflowStatus, ['postflight_pending', 'report_pending', 'crew_completed', 'administratively_closed'])

  const airportEntry =
    findLatestTimelineEntry(timeline, {
      statuses: ['crew_checkin', 'checked_in'],
      titleIncludes: ['check in operativo', 'check-in operativo'],
    })
    || (assignment.crewCheckinAt ? { created_at: assignment.crewCheckinAt } : null)
  const cabinEntry = findLatestTimelineEntry(timeline, {
    statuses: ['cabina_lista', 'cabin_ready'],
    titleIncludes: ['cabina', 'catering e insumos'],
  })
  const boardingEntry = findLatestTimelineEntry(timeline, {
    statuses: ['boarding'],
    titleIncludes: ['avance operativo: boarding', 'abordaje'],
  })
  const passengersEntry = findLatestTimelineEntry(timeline, {
    statuses: ['pasajeros_recibidos', 'boarding_completed'],
    titleIncludes: ['recibe pasajeros'],
  })
  const takeoffEntry = findLatestTimelineEntry(timeline, {
    statuses: ['in_flight'],
    titleIncludes: ['despegue', 'servicio iniciado'],
  }) || (assignment.crewServiceStartedAt ? { created_at: assignment.crewServiceStartedAt } : null)
  const landingEntry = findLatestTimelineEntry(timeline, {
    statuses: ['landed'],
    titleIncludes: ['aterriz'],
  })
  const deboardingEntry = findLatestTimelineEntry(timeline, {
    statuses: ['postflight_pending', 'report_pending', 'crew_completed'],
    titleIncludes: ['desembar', 'postvuelo'],
  })

  const milestones = [
    {
      id: 'airport-arrival',
      label: 'Llegué al aeropuerto',
      detail: 'Cuando llegues a aeropuerto o FBO, registra este momento.',
      completed: reachedCheckin,
      timestamp: airportEntry?.created_at || assignment.crewCheckinAt || '',
      actor: 'Sobrecargo',
      actionLabel: assignment.canCheckin ? 'Registrar llegada' : '',
      action: assignment.canCheckin ? () => confirmBriefing(assignment.id) : null,
      incident: milestoneHasLinkedIncident(['aeropuerto', 'fbo', 'check in', 'check-in', 'llegada']),
    },
    {
      id: 'aircraft-ready',
      label: 'Aeronave lista',
      detail: 'Registra cuando la cabina, aeronave e insumos estén listos.',
      completed: reachedCabinReady,
      timestamp: cabinEntry?.created_at || '',
      actor: 'Sobrecargo',
      actionLabel: assignment.canMarkCabinReady ? 'Registrar aeronave lista' : '',
      action: assignment.canMarkCabinReady ? () => markCabinReady(assignment.id) : null,
      incident: milestoneHasLinkedIncident(['cabina', 'aeronave', 'insumos']),
    },
    {
      id: 'catering',
      label: 'Catering recibido',
      detail: 'Este momento se registra junto con la aeronave lista.',
      completed: reachedCabinReady,
      timestamp: cabinEntry?.created_at || '',
      actor: 'Sobrecargo',
      incident: milestoneHasLinkedIncident(['catering']),
    },
    {
      id: 'passengers-arrived',
      label: 'Pasajeros llegaron',
      detail: 'Cuando inicie el abordaje, registra la llegada de pasajeros.',
      completed: reachedBoarding,
      timestamp: boardingEntry?.created_at || passengersEntry?.created_at || '',
      actor: boardingEntry?.created_at ? 'Sobrecargo' : 'Operaciones',
      actionLabel: canStartBoarding.value ? 'Registrar pasajeros llegaron' : '',
      action: canStartBoarding.value
        ? () => transitionCrewOperation(assignment.id, 'boarding', {
          loadingTitle: 'Registrando llegada de pasajeros',
          loadingDetail: 'Estamos iniciando el abordaje en la linea de tiempo operativa.',
          successTitle: 'Llegada de pasajeros registrada',
          successDetail: 'El abordaje ya aparece en el seguimiento del vuelo.',
          errorTitle: 'No se pudo registrar',
          errorMessage: 'La llegada de pasajeros no pudo guardarse.',
          note: 'Inicio de abordaje registrado por sobrecargo.',
        })
        : null,
      incident: milestoneHasLinkedIncident(['pasajeros', 'abordaje']),
    },
    {
      id: 'passengers-boarded',
      label: 'Pasajeros a bordo',
      detail: 'Cuando todos los pasajeros estén a bordo, registra este momento.',
      completed: reachedBoardingCompleted,
      timestamp: passengersEntry?.created_at || '',
      actor: 'Sobrecargo',
      actionLabel: assignment.canReceivePassengers ? 'Registrar pasajeros a bordo' : '',
      action: assignment.canReceivePassengers ? () => markPassengersReceived(assignment.id) : null,
      incident: milestoneHasLinkedIncident(['pasajeros', 'abordaje']),
    },
    {
      id: 'takeoff',
      label: 'Despegue',
      detail: 'Se actualiza cuando Operaciones o el sistema confirma el inicio de vuelo.',
      completed: reachedInFlight,
      timestamp: takeoffEntry?.created_at || assignment.crewServiceStartedAt || '',
      actor: takeoffEntry?.created_at ? 'Operaciones' : 'Sistema',
      incident: milestoneHasLinkedIncident(['despegue', 'vuelo', 'salida']),
    },
    {
      id: 'landing',
      label: 'Aterrizaje',
      detail: 'Se actualiza cuando el aterrizaje queda registrado en el flujo operativo.',
      completed: reachedLanded,
      timestamp: landingEntry?.created_at || assignment.crewLandedAt || '',
      actor: landingEntry?.created_at ? 'Operaciones' : 'Sistema',
      incident: milestoneHasLinkedIncident(['aterrizaje', 'landing']),
    },
    {
      id: 'deboarding',
      label: 'Pasajeros desembarcaron',
      detail: 'Se completa al iniciar el post-vuelo y desembarque.',
      completed: reachedDeboarding,
      timestamp: deboardingEntry?.created_at || '',
      actor: deboardingEntry?.created_at ? 'Operaciones' : 'Sistema',
      incident: milestoneHasLinkedIncident(['desembarque', 'desembarcaron', 'postvuelo']),
    },
  ]

  const currentIndex = milestones.findIndex((item) => !item.completed)

  return milestones.map((item, index) => ({
    ...item,
    meta: item.timestamp ? formatTrackingTime(item.timestamp) : '',
    state: item.incident
      ? 'incident'
      : item.completed
        ? 'completed'
        : index === currentIndex
          ? 'current'
          : 'pending',
    isCurrent: index === currentIndex,
  }))
})

const flightTrackingSummary = computed(() => {
  const total = flightTrackingMilestones.value.length
  const completed = flightTrackingMilestones.value.filter((item) => item.completed).length

  return {
    total,
    completed,
    pending: Math.max(total - completed, 0),
  }
})

const trackingProgressPercent = computed(() => (
  flightTrackingSummary.value.total
    ? Math.round((flightTrackingSummary.value.completed / flightTrackingSummary.value.total) * 100)
    : 0
))

const currentTrackingMilestone = computed(() =>
  flightTrackingMilestones.value.find((item) => item.isCurrent) || flightTrackingMilestones.value.at(-1) || null,
)

const selectedTrackingMilestone = computed(() => {
  if (!flightTrackingMilestones.value.length) return null

  return (
    flightTrackingMilestones.value.find((item) => item.id === selectedTrackingMilestoneId.value)
    || currentTrackingMilestone.value
    || flightTrackingMilestones.value[0]
  )
})

const currentTrackingAction = computed(() => {
  const milestone = currentTrackingMilestone.value
  if (!milestone) return null

  if (milestone.actionLabel && milestone.action) {
    return {
      label: milestone.label,
      detail: milestone.detail,
      cta: milestone.actionLabel,
      action: milestone.action,
    }
  }

  return {
    label: milestone.label,
    detail: milestone.completed
      ? 'Todos los hitos visibles ya quedaron registrados.'
      : `${milestone.label} depende de la actualizacion del flujo operativo o de Operaciones.`,
    cta: '',
    action: null,
  }
})

const hasFlightAssigned = computed(() => Boolean(currentAssignment.value))
const activeWorkflowStatus = computed(() => normalizeStatusToken(currentAssignment.value?.workflowStatus || ''))
const preparationChecklistGroup = computed(
  () => checklistGroupsByType.value.get('preparation') || null,
)
const preflightChecklistGroup = computed(
  () => checklistGroupsByType.value.get('preflight') || null,
)
const postflightChecklistGroup = computed(
  () => checklistGroupsByType.value.get('postflight') || null,
)
const preparationCompleted = computed(() =>
  isChecklistGroupResolved(preparationChecklistGroup.value)
  || hasReachedWorkflowStatus(activeWorkflowStatus.value, [
    'ready_for_operation',
    'checked_in',
    'preflight_in_progress',
    'cabin_ready',
    'boarding',
    'boarding_completed',
    'in_flight',
    'landed',
    'postflight_pending',
    'report_pending',
    'crew_completed',
    'administratively_closed',
  ]),
)
const checklistCompleted = computed(() =>
  (
    flightChecklistSummary.value.total > 0 &&
    flightChecklistSummary.value.pending === 0
  )
  || isChecklistGroupResolved(preflightChecklistGroup.value)
  || hasReachedWorkflowStatus(activeWorkflowStatus.value, [
    'cabin_ready',
    'boarding',
    'boarding_completed',
    'in_flight',
    'landed',
    'postflight_pending',
    'report_pending',
    'crew_completed',
    'administratively_closed',
  ]),
)
const trackingCompleted = computed(() =>
  hasReachedWorkflowStatus(activeWorkflowStatus.value, [
    'postflight_pending',
    'report_pending',
    'crew_completed',
    'administratively_closed',
  ])
  || (
    flightTrackingSummary.value.total > 0 &&
    flightTrackingSummary.value.completed >= flightTrackingSummary.value.total
  ),
)

const flightFlowState = computed(() => {
  const hasAssignment = hasFlightAssigned.value
  const workflowStatus = activeWorkflowStatus.value
  const validationDone = Boolean(
    currentAssignment.value?.assignmentConfirmed
    || currentAssignment.value?.crewConfirmedAt
    || hasReachedWorkflowStatus(workflowStatus, ['confirmed']),
  )
  const checklistDone = checklistCompleted.value
  const evidenceDone =
    (
      flightEvidenceSummary.value.total > 0 &&
      flightEvidenceSummary.value.completed >= flightEvidenceSummary.value.total
    )
    || hasReachedWorkflowStatus(workflowStatus, ['report_pending', 'crew_completed', 'administratively_closed'])
  const closingDone = hasReachedWorkflowStatus(workflowStatus, [
    'report_pending',
    'crew_completed',
    'administratively_closed',
  ])

  const steps = [
    {
      id: 'validation',
      label: validationDone ? 'Vuelo validado' : 'Validar vuelo',
      complete: validationDone,
      available: hasAssignment,
    },
    {
      id: 'preparation',
      label: humanizeChecklistType(preparationChecklistGroup.value?.type || 'preparation'),
      complete: preparationCompleted.value,
      available: validationDone,
    },
    {
      id: 'checklist',
      label: humanizeChecklistType(preflightChecklistGroup.value?.type || 'preflight'),
      complete: checklistDone,
      available: validationDone,
    },
    {
      id: 'evidences',
      label: 'Evidencias',
      complete: evidenceDone,
      available: checklistDone || flightChecklistSummary.value.total === 0,
    },
    {
      id: 'tracking',
      label: 'Seguimiento',
      complete: trackingCompleted.value,
      available: validationDone,
    },
    {
      id: 'closure',
      label: humanizeChecklistType(postflightChecklistGroup.value?.type || 'postflight'),
      complete: closingDone,
      available: validationDone,
    },
  ]

  let currentId = hasAssignment ? 'validation' : ''
  const currentStep = steps.find((step) => !step.complete && step.available)
  if (currentStep) currentId = currentStep.id
  else if (closingDone) currentId = 'closure'

  return {
    currentId,
    steps: steps.map((step) => ({
      ...step,
      state: !step.available ? 'Bloqueado' : step.complete ? 'Completado' : step.id === currentId ? 'Actual' : 'Pendiente',
    })),
  }
})

const currentFlightStep = computed(() => {
  const manualStep = flightFlowState.value.steps.find(
    (step) => step.id === selectedFlightStepId.value && step.available,
  )

  if (manualStep) return manualStep

  return flightFlowState.value.steps.find((step) => step.id === flightFlowState.value.currentId) || null
})

const checklistStepState = computed(
  () => flightFlowState.value.steps.find((step) => step.id === 'checklist') || null,
)

function openFlightStep(stepId = '') {
  const targetStep = flightFlowState.value.steps.find((step) => step.id === stepId)
  if (!targetStep?.available) return
  selectedFlightStepId.value = targetStep.id
}

const currentPrimaryAction = computed(() => {
  const assignment = currentAssignment.value
  if (!assignment) {
    return {
      title: 'Sin vuelo asignado',
      detail: 'Cuando Admin / Red Sky te asigne una operacion, aqui apareceran tus pasos de trabajo.',
      cta: '',
      action: null,
    }
  }

  if (!assignment.assignmentConfirmed && assignment.canRespondToAssignment) {
    return {
      title: 'Accion requerida: Confirmar vuelo',
      detail: 'Primero confirma que recibiste la asignacion y que puedes operar este vuelo.',
      cta: 'Confirmar vuelo',
      action: () => respondAssignment(assignment.id, 'Confirmado'),
    }
  }

  if (!preparationCompleted.value) {
    return {
      title: 'Siguiente paso: Completar preparacion',
      detail: 'Valida briefing, llegada, FBO y cabina antes de avanzar al resto de la operacion.',
      cta: assignment.canCheckin ? 'Registrar llegada' : assignment.canMarkCabinReady ? 'Registrar preparacion' : '',
      action: assignment.canCheckin
        ? () => confirmBriefing(assignment.id)
        : assignment.canMarkCabinReady
          ? () => markCabinReady(assignment.id)
          : null,
    }
  }

  if (flightChecklistSummary.value.total && flightChecklistSummary.value.pending > 0) {
    return {
      title: 'Siguiente paso: Completar checklist',
      detail: `Checklist ${flightChecklistSummary.value.resolved} de ${flightChecklistSummary.value.total} completados.`,
      cta: '',
      action: null,
    }
  }

  if (flightEvidenceSummary.value.completed < flightEvidenceSummary.value.total) {
    return {
      title: 'Siguiente paso: Subir evidencias',
      detail: 'Carga o confirma las evidencias visuales requeridas del vuelo.',
      cta: 'Reportar incidencia',
      action: null,
    }
  }

  if (!trackingCompleted.value) {
    return {
      title: `Siguiente paso: ${currentTrackingAction.value?.label || 'Registrar seguimiento'}`,
      detail: currentTrackingAction.value?.detail || 'Sigue registrando hitos operativos para mantener trazabilidad clara del vuelo.',
      cta: currentTrackingAction.value?.cta || 'Abrir seguimiento',
      action: currentTrackingAction.value?.action || (() => openFlightStep('tracking')),
    }
  }

  return {
    title: 'Siguiente paso: Finalizar operacion',
    detail: 'Cuando todo este completo podras cerrar tu participacion operativa.',
    cta: currentAssignment.value?.workflowStatus === 'report_pending' ? 'Enviar cierre' : '',
    action: null,
  }
})

function getCrewPortalResourceKeys(section = resolvedSection.value) {
  switch (section) {
    case 'dashboard':
      return ['dashboard', 'assignments']
    case 'asignaciones':
    case 'calendario':
      return ['assignments']
    case 'disponibilidad':
      return ['availability', 'assignments']
    case 'perfil':
      return ['profile', 'documents']
    case 'documentos':
      return ['documents']
    case 'incidencias':
      return ['incidents', 'assignments']
    case 'historial':
      return ['assignments', 'incidents']
    case 'configuracion':
      return ['profile']
    default:
      return ['assignments']
  }
}

function getCrewPortalBackgroundResourceKeys(section = resolvedSection.value) {
  switch (section) {
    case 'dashboard':
      return ['profile', 'documents']
    default:
      return []
  }
}

function clearBackgroundCrewWarmup() {
  if (backgroundCrewWarmupTimer) {
    window.clearTimeout(backgroundCrewWarmupTimer)
    backgroundCrewWarmupTimer = null
  }
}

function scheduleBackgroundCrewWarmup(section = resolvedSection.value) {
  if (typeof window === 'undefined') return

  const resources = getCrewPortalBackgroundResourceKeys(section).filter(
    (key) => !portalDataLoaded[key] && !portalDataLoading[key],
  )

  if (!resources.length) return

  clearBackgroundCrewWarmup()
  backgroundCrewWarmupTimer = window.setTimeout(() => {
    backgroundCrewWarmupTimer = null
    void loadPortal({ force: false, resources })
  }, 450)
}

function finalizePortalState() {
  providerContext.providerName = providerName.value
  providerContext.operatorLabel = auth.user?.provider?.commercial_name
    ? 'Proveedor validado · coordinacion Admin / Red Sky'
    : 'Operacion coordinada por Admin / Red Sky'
  providerContext.managedBy = 'Admin / Red Sky'
  providerContext.approvalState = profileForm.profileState
  currentStatus.value = deriveCrewStatusFromAssignments()
  rebuildHistoryFromBackend()
}

const incidentErrors = computed(() => {
  const errors = {}
  if (!incidentForm.type) errors.type = 'Selecciona una categoria.'
  if (!incidentForm.description.trim()) errors.description = 'Describe lo sucedido.'
  if (!incidentForm.priority) errors.priority = 'Selecciona una prioridad.'
  if (!incidentForm.flight) errors.flight = 'Selecciona un vuelo asignado.'
  if (['alta', 'critica'].includes(incidentForm.priority) && !(incidentForm.files || []).length) {
    errors.evidence = 'Adjunta evidencia para prioridades altas o criticas.'
  }
  return {
    ...incidentApiErrors.value,
    ...errors,
  }
})

const profileErrors = computed(() => {
  const errors = {}
  if (!profileForm.phone.trim()) errors.phone = 'Telefono obligatorio.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileForm.email || '')) errors.email = 'Correo invalido.'
  if (!profileForm.certifications.trim()) errors.certifications = 'Certificaciones obligatorias.'
  return errors
})

function pushHistory(action, status, comment, flight = currentAssignment.value?.flight || '') {
  historyEntries.value.unshift({
    id: Date.now() + Math.random(),
    flight,
    action,
    status,
    date: new Date().toISOString().slice(0, 16).replace('T', ' '),
    comment,
  })
}

function normalizeMissionStatus(status = '') {
  const normalized = String(status || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
  if (['crew checkin', 'checkin operativo', 'check in operativo'].includes(normalized)) return 'En aeropuerto/base'
  if (['cabina lista', 'cabina revisada'].includes(normalized)) return 'Cabina revisada'
  if (['pasajeros recibidos'].includes(normalized)) return 'Pasajeros recibidos'
  if (['confirmada', 'confirmed'].includes(normalized)) return 'Confirmado'
  if (
    [
      'preparacion',
      'preparing',
      'lista',
      'tracking en vivo',
      'tracking live',
      'crew enroute',
      'crew_enroute',
      'operador asignado',
    ].includes(normalized)
  ) return 'Preparacion'
  if (['en vuelo', 'in progress', 'servicio iniciado', 'incidencia'].includes(normalized)) {
    return normalized === 'incidencia' ? 'Incidencia' : 'En servicio'
  }
  if (['finalizada', 'completed'].includes(normalized)) return 'Finalizado'
  if (['cancelada', 'cancelled'].includes(normalized)) return 'Cancelado'
  return 'Pendiente'
}

function resolveLatestTimelineStatus(detail = {}) {
  const timeline = Array.isArray(detail.timeline) ? detail.timeline : []
  if (!timeline.length) return ''

  const latestEntry = [...timeline].sort((left, right) => {
    const leftTime = Date.parse(left?.created_at || left?.updated_at || '')
    const rightTime = Date.parse(right?.created_at || right?.updated_at || '')
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0)
  })[0]

  return latestEntry?.status || ''
}

function buildTimelineStatusSet(detail = {}) {
  const timeline = Array.isArray(detail.timeline) ? detail.timeline : []
  return new Set(
    timeline
      .map((item) =>
        String(item?.status || '')
          .trim()
          .toLowerCase()
          .replace(/[_-]+/g, ' '),
      )
      .filter(Boolean),
  )
}

function normalizeStatusToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
}

function normalizeAssignmentResponseStatus(assignment = null, missionStatus = 'Pendiente') {
  const acceptedAt = assignment?.accepted_at || assignment?.acceptedAt || ''
  const rejectedAt = assignment?.rejected_at || assignment?.rejectedAt || ''
  const cancelledAt = assignment?.cancelled_at || assignment?.cancelledAt || ''
  const statusCandidate =
    assignment?.status ||
    assignment?.rawStatus ||
    ''
  const normalizedStatus = normalizeStatusToken(statusCandidate)

  if (acceptedAt || ['confirmed', 'accepted', 'aceptado', 'confirmado'].includes(normalizedStatus)) {
    return 'Confirmado'
  }
  if (rejectedAt || ['rejected', 'declined', 'rechazado'].includes(normalizedStatus)) {
    return 'Rechazado'
  }
  if (cancelledAt || ['cancelled', 'cancelada'].includes(normalizedStatus)) {
    return 'Cancelada'
  }
  if (['clarification requested', 'review requested', 'requested changes', 'solicitar revision', 'revision'].includes(normalizedStatus)) {
    return 'Solicitar revision'
  }

  if (assignment) {
    return 'Pendiente'
  }

  const responseCandidate =
    assignment?.response_status ||
    assignment?.assignment_response ||
    assignment?.assignmentStatus ||
    assignment?.response ||
    assignment?.status ||
    ''

  const normalized = normalizeStatusToken(responseCandidate)

  if (['confirmado', 'confirmed', 'accepted', 'aceptado'].includes(normalized)) return 'Confirmado'
  if (['rechazado', 'rejected', 'declined'].includes(normalized)) return 'Rechazado'
  if (['solicitar revision', 'revision', 'review_requested', 'requested_changes'].includes(normalized)) {
    return 'Solicitar revision'
  }

  return missionStatus === 'Pendiente' ? 'Pendiente' : 'Recibida'
}

function normalizeCrewLifecycleStatus(value = '') {
  const normalized = String(value || '').toLowerCase()
  if (['pending_crew_response', 'pending_confirmation'].includes(normalized)) return 'Pendiente'
  if (['crew_confirmed', 'confirmed'].includes(normalized)) return 'Confirmado'
  if (normalized === 'crew_declined') return 'Cancelado'
  if (normalized === 'crew_change_requested') return 'Incidencia'
  if (normalized === 'crew_enroute') return 'Preparacion'
  if (normalized === 'crew_active') return 'En servicio'
  if (['preparation_pending', 'ready_for_operation', 'checked_in', 'preflight_in_progress'].includes(normalized)) return 'Preparacion'
  if (normalized === 'cabin_ready') return 'Cabina revisada'
  if (['boarding', 'boarding_completed'].includes(normalized)) return 'Pasajeros recibidos'
  if (normalized === 'in_flight') return 'En servicio'
  if (['landed', 'postflight_pending', 'report_pending'].includes(normalized)) return 'Reporte enviado'
  if (['crew_completed', 'administratively_closed'].includes(normalized)) return 'Finalizado'
  if (normalized === 'crew_incident_reported') return 'Incidencia'
  return ''
}

function humanizeCrewLifecycleStatus(value = '') {
  const normalized = String(value || '').toLowerCase()
  const labels = {
    pending_confirmation: 'Pendiente de respuesta', confirmed: 'Asignacion confirmada', rejected: 'Rechazada',
    preparation_pending: 'Preparacion pendiente', ready_for_operation: 'Lista para operar', checked_in: 'Check-in confirmado',
    preflight_in_progress: 'Checklist pre-vuelo', cabin_ready: 'Cabina lista', boarding: 'Abordaje',
    boarding_completed: 'Abordaje completado', in_flight: 'En vuelo', landed: 'Aterrizado',
    postflight_pending: 'Postvuelo pendiente', report_pending: 'Reporte pendiente', crew_completed: 'Participacion completada',
    administratively_closed: 'Cierre administrativo', cancelled: 'Cancelada', no_show: 'No presentada',
  }
  if (labels[normalized]) return labels[normalized]
  if (normalized === 'pending_crew_response') return 'Sin responder'
  if (normalized === 'crew_confirmed') return 'Confirmado'
  if (normalized === 'crew_declined') return 'Rechazado'
  if (normalized === 'crew_change_requested') return 'Solicita cambio'
  if (normalized === 'crew_enroute') return 'En traslado'
  if (normalized === 'crew_active') return 'En servicio'
  if (normalized === 'crew_completed') return 'Finalizado'
  if (normalized === 'crew_incident_reported') return 'Con incidencia'
  return value || ''
}

function resolveAssignmentResponsePayload(response = '') {
  if (response === 'Confirmado') {
    return {
      response: 'Confirmado',
      status: 'crew_confirmed',
      crew_status: 'crew_confirmed',
    }
  }

  if (response === 'Rechazado') {
    return {
      response: 'Rechazado',
      status: 'crew_declined',
      crew_status: 'crew_declined',
    }
  }

  if (response === 'Solicitar revision') {
    return {
      response: 'Solicitar revision',
      status: 'crew_change_requested',
      crew_status: 'crew_change_requested',
    }
  }

  return {
    response,
    status: '',
    crew_status: '',
  }
}

function deriveCrewStatusFromAssignments() {
  if (assignments.value.some((item) => item.missionStatus === 'En servicio')) return 'En vuelo'
  if (assignments.value.some((item) => item.missionStatus === 'Incidencia')) return 'Incidencia'
  if (
    assignments.value.some((item) =>
      ['Confirmado', 'Preparacion', 'En aeropuerto/base', 'Cabina revisada', 'Pasajeros recibidos', 'En escala / siguiente tramo', 'Reporte enviado'].includes(item.missionStatus),
    )
  ) return 'Asignado'
  const explicitStatus = normalizeCrewOperationalStatus(storedOperationalStatus.value)
  if (explicitStatus) return explicitStatus
  if (availabilityBlocks.value.some((item) => item.state === 'Suspendido')) return 'Suspendido'
  if (availabilityBlocks.value.some((item) => item.state === 'No disponible')) return 'No disponible'
  return ''
}

function derivePresentationTimeFromDeparture(departureValue = '', offsetMinutes = 60) {
  if (!departureValue) return ''
  const departure = new Date(String(departureValue))
  if (Number.isNaN(departure.getTime())) return ''

  const presentation = new Date(departure.getTime() - Math.max(0, Number(offsetMinutes || 0)) * 60 * 1000)
  if (Number.isNaN(presentation.getTime())) return ''

  return `${String(presentation.getHours()).padStart(2, '0')}:${String(presentation.getMinutes()).padStart(2, '0')}`
}

function normalizeAssignment(raw = {}, detail = {}, index = 0) {
  const briefing = detail.briefing || {}
  const departure = briefing.salida || raw.departure_datetime || raw.started_at || ''
  const assignment = raw.assignment || detail.assignment || null
  const latestTimelineStatus = resolveLatestTimelineStatus(detail)
  const operationStatus = latestTimelineStatus || detail.status || raw.status || ''
  const persistedCrewStatus =
    detail.crew_status ||
    raw.crew_status ||
    raw.crewStatus ||
    detail.operation?.crew_status ||
    raw.operation?.crew_status ||
    ''
  const assignmentStatus =
    assignment?.status ||
    assignment?.rawStatus ||
    detail.assignment_status ||
    raw.assignment_status ||
    ''
  const crewLifecycleStatus =
    detail.workflow_status ||
    raw.workflow_status ||
    persistedCrewStatus ||
    assignmentStatus ||
    raw.crew_status_label ||
    ''
  const normalizedOperationStatus = String(operationStatus || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
  const normalizedCrewLifecycleStatus = String(crewLifecycleStatus || '').toLowerCase()
  const timelineStatuses = buildTimelineStatusSet(detail)
  const hasCheckin =
    Boolean(raw.crew_checkin_at || detail.crew_checkin_at) ||
    timelineStatuses.has('crew checkin') ||
    ['checked_in', 'preflight_in_progress', 'cabin_ready', 'boarding', 'boarding_completed', 'in_flight', 'landed', 'postflight_pending', 'report_pending', 'crew_completed', 'administratively_closed'].includes(normalizedCrewLifecycleStatus)
  const hasCabinReady = timelineStatuses.has('cabina lista') || ['cabin_ready', 'boarding', 'boarding_completed', 'in_flight', 'landed', 'postflight_pending', 'report_pending', 'crew_completed', 'administratively_closed'].includes(normalizedCrewLifecycleStatus)
  const hasPassengersReady = timelineStatuses.has('pasajeros recibidos') || ['boarding_completed', 'in_flight', 'landed', 'postflight_pending', 'report_pending', 'crew_completed', 'administratively_closed'].includes(normalizedCrewLifecycleStatus)
  const hasServiceStarted =
    Boolean(raw.crew_service_started_at || detail.crew_service_started_at) ||
    timelineStatuses.has('servicio iniciado') ||
    ['crew_active', 'crew_completed'].includes(String(crewLifecycleStatus || '').toLowerCase()) ||
    ['in_progress', 'completed'].includes(String(operationStatus || '').toLowerCase())
  const hasServiceCompleted =
    Boolean(raw.crew_service_completed_at || detail.crew_service_completed_at) ||
    timelineStatuses.has('servicio finalizado') ||
    normalizedCrewLifecycleStatus === 'crew_completed' ||
    normalizedOperationStatus === 'completed'
  const hasIncidentReported =
    normalizedCrewLifecycleStatus === 'crew_incident_reported' ||
    normalizedOperationStatus === 'incidencia' ||
    timelineStatuses.has('incidencia')
  const missionStatus =
    hasIncidentReported
      ? 'Incidencia'
      : hasServiceCompleted
      ? 'Finalizado'
      : hasServiceStarted
        ? 'En servicio'
        : hasPassengersReady
          ? 'Pasajeros recibidos'
          : hasCabinReady
            ? 'Cabina revisada'
            : hasCheckin
              ? 'En aeropuerto/base'
              : normalizeCrewLifecycleStatus(crewLifecycleStatus) || normalizeMissionStatus(operationStatus)
  const responseStatus = normalizeAssignmentResponseStatus(assignment, missionStatus)
  const origin = briefing.origen || raw.origin || ''
  const destination = briefing.destino || raw.destination || ''
  const originName =
    briefing.origen_name ||
    briefing.origen_nombre ||
    raw.origin_name ||
    raw.origin_label ||
    detail.origin_name ||
    detail.origin_label ||
    ''
  const destinationName =
    briefing.destino_name ||
    briefing.destino_nombre ||
    raw.destination_name ||
    raw.destination_label ||
    detail.destination_name ||
    detail.destination_label ||
    ''
  const route = origin && destination ? `${origin} -> ${destination}` : origin || destination || ''
  const derivedPresentationTime = derivePresentationTimeFromDeparture(departure)
  const presentationTime =
    assignment?.presentation_time ||
    assignment?.presentationTime ||
    derivedPresentationTime ||
    raw.presentation_time ||
    detail.presentation_time ||
    briefing.hora_presentacion ||
    ''
  const presentationPlace =
    raw.presentation_place ||
    raw.presentation_location ||
    detail.presentation_place ||
    detail.presentation_location ||
    briefing.lugar_presentacion ||
    ''
  const responseLocked = [
    'crew_confirmed',
    'crew_declined',
    'crew_change_requested',
    'crew_enroute',
    'crew_active',
    'crew_completed',
    'crew_incident_reported',
  ].includes(normalizedCrewLifecycleStatus)
  const workflowStatus = normalizedCrewLifecycleStatus
  const assignmentAccepted =
    Boolean(assignment?.accepted_at || assignment?.acceptedAt || raw.crew_confirmed_at || detail.crew_confirmed_at) ||
    ['confirmed', 'preparation_pending', 'ready_for_operation', 'checked_in', 'preflight_in_progress', 'cabin_ready', 'boarding', 'boarding_completed', 'in_flight', 'landed', 'postflight_pending', 'report_pending', 'crew_completed', 'administratively_closed'].includes(workflowStatus)
  const responseDeadlineValue = assignment?.response_deadline || assignment?.responseDeadline || ''
  const responseDeadlineTime = Date.parse(responseDeadlineValue)
  const responseDeadlinePassed =
    Number.isFinite(responseDeadlineTime) &&
    responseDeadlineTime < Date.now() &&
    ['pending_confirmation', 'pending_crew_response'].includes(workflowStatus)
  const canRespondToAssignment = ['pending_confirmation', 'pending_crew_response'].includes(workflowStatus) || !responseLocked && missionStatus === 'Pendiente'
  const canCheckin =
    ['ready_for_operation'].includes(workflowStatus) &&
    !hasCheckin &&
    !hasIncidentReported
  const canStartBoarding =
    workflowStatus === 'cabin_ready' &&
    hasCabinReady &&
    !hasPassengersReady &&
    !hasServiceStarted &&
    !hasIncidentReported
  const canMarkCabinReady = hasCheckin && !hasCabinReady && !hasServiceStarted && !hasIncidentReported
  const canReceivePassengers =
    workflowStatus === 'boarding' &&
    hasCabinReady &&
    !hasPassengersReady &&
    !hasServiceStarted &&
    !hasIncidentReported
  const canStartService = false
  const canFinalizeService = false

  return {
    id: raw.id || index + 1,
    flight: raw.flight || raw.code || raw.reference || (raw.id != null ? String(raw.id) : ''),
    route,
    date: departure ? String(departure).slice(0, 10) : '',
    time: departure && String(departure).includes('T') ? String(departure).slice(11, 16) : '',
    aircraft: raw.aircraft || raw.aircraft_model || '',
    briefing: presentationTime || (departure ? String(departure).slice(11, 16) : ''),
    briefingTime: presentationTime || '',
    presentationTime: presentationTime || '',
    presentationPlace: presentationPlace || '',
    serviceLevel: raw.service_level || '',
    vipRequirements: raw.notes || detail.notes || '',
    client: raw.client || raw.client_name || detail.client || '',
    passengers: Number(briefing.pasajeros_autorizados || raw.passengers || 0),
    specialRequirements: raw.special_requirements || detail.special_requirements || '',
    internalContact: raw.internal_contact || detail.internal_contact || '',
    responseStatus,
    crewStatus: raw.crew_status || detail.crew_status || '',
    crewStatusLabel: raw.crew_status_label || humanizeCrewLifecycleStatus(crewLifecycleStatus),
    crewConfirmedAt: raw.crew_confirmed_at || detail.crew_confirmed_at || null,
    crewDeclineReason: raw.crew_decline_reason || detail.crew_decline_reason || '',
    crewNotes: raw.crew_notes || detail.crew_notes || '',
    crewCheckinAt: raw.crew_checkin_at || detail.crew_checkin_at || null,
    crewServiceStartedAt: raw.crew_service_started_at || detail.crew_service_started_at || null,
    crewServiceCompletedAt: raw.crew_service_completed_at || detail.crew_service_completed_at || null,
    crewLandedAt: raw.crew_landed_at || detail.crew_landed_at || null,
    assignmentConfirmed: assignmentAccepted,
    operationActive: ['Preparacion', 'En servicio', 'Incidencia'].includes(missionStatus),
    responseDeadlinePassed,
    origin,
    originName,
    destination,
    destinationName,
    catering: raw.catering || detail.catering || '',
    amenities: raw.amenities || detail.amenities || '',
    missionStatus,
    operationStatus,
    providerName: providerName.value,
    timeline: Array.isArray(detail.timeline) ? detail.timeline : [],
    workflowStatus,
    assignment,
    checklists: Array.isArray(raw.checklists || detail.checklists) ? (raw.checklists || detail.checklists) : [],
    finalReport: raw.final_report || detail.final_report || null,
    canRespondToAssignment,
    canCheckin,
    canStartBoarding,
    canMarkCabinReady,
    canReceivePassengers,
    canStartService,
    canFinalizeService,
    operationId: raw.id || index + 1,
  }
}

function extractAssignmentsCollection(payload = {}) {
  return pickCollection(payload, ['assignments', 'asignaciones', 'operations', 'operaciones', 'data', 'items'])
}

async function fetchCrewAssignments() {
  const response = await requestWithCandidates([
    { method: 'get', path: '/sobrecargo/assignments', timeoutMs: CREW_PORTAL_TIMEOUT_MS },
  ])

  const collection = extractAssignmentsCollection(response)

  return collection.map((item, index) => normalizeAssignment(item, item, index))
}

function normalizeCrewAvailabilityRecord(raw = {}, index = 0) {
  const statusId = raw.estatus_id || raw.status_id || raw.availability_status_id || null
  const statusDefinitionById =
    availabilityStatusCatalog.value.find(
      (item) => String(item.id || item.estatus_id || '') === String(statusId || ''),
    ) || null
  const statusKey = normalizeAvailabilityStatusKey(
    raw.clave ||
      raw.status_key ||
      raw.status ||
      raw.availability_status ||
      raw.state ||
      raw.nombre ||
      statusDefinitionById?.clave ||
      statusDefinitionById?.status ||
      statusDefinitionById?.nombre ||
      '',
  )
  const statusDefinition = statusDefinitionById || getAvailabilityStatusDefinition(statusKey)

  return {
    id: raw.id || index + 1,
    from: raw.from || raw.fecha || raw.starts_at || raw.start_datetime || '',
    to: raw.to || raw.fecha || raw.ends_at || raw.end_datetime || '',
    statusId: statusId || statusDefinition?.id || null,
    state: raw.state || raw.nombre || statusDefinition?.nombre || humanizeAvailabilityStatusKey(statusKey) || 'Disponible',
    statusKey,
    base: raw.base || raw.city || profileForm.base || '',
    coverage: raw.coverage || raw.zone || configForm.personalCoverage || '',
    restriction: raw.restriction || raw.comentario || raw.reason || raw.notes || '',
    reason: raw.motivo || '',
    color: raw.color || statusDefinition?.color || '',
    icon: raw.icono || statusDefinition?.icono || '',
    allowsAssignment: Boolean(raw.permite_asignacion ?? statusDefinition?.permite_asignacion),
    origin: raw.origen || '',
    createdBy: raw.created_by_nombre || raw.created_by_name || '',
  }
}

function normalizeAvailabilityStatusKey(value = '') {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')

  if (!normalized) return 'DISPONIBLE'
  if (normalized === 'EN_OPERACION' || normalized === 'EN_VUELO' || normalized === 'OPERACION') return 'EN_OPERACION'
  if (normalized === 'NO_DISPONIBLE' || normalized === 'INACTIVO' || normalized === 'BLOCKED') return 'NO_DISPONIBLE'
  if (normalized === 'BLOQUEO' || normalized === 'PENDIENTE') return 'BLOQUEO_SOLICITADO'
  return normalized
}

function humanizeAvailabilityStatusKey(key = '') {
  const normalized = normalizeAvailabilityStatusKey(key)
  if (normalized === 'DISPONIBLE') return 'Disponible'
  if (normalized === 'NO_DISPONIBLE') return 'No disponible'
  if (normalized === 'DESCANSO') return 'Descanso'
  if (normalized === 'EN_OPERACION') return 'En operacion'
  if (normalized === 'BLOQUEO_SOLICITADO') return 'Bloqueo solicitado'
  if (normalized === 'BLOQUEO_APROBADO') return 'Bloqueo aprobado'
  if (normalized === 'BLOQUEO_RECHAZADO') return 'Bloqueo rechazado'
  if (normalized === 'POR_CONFIRMAR') return 'Por confirmar'
  return key
}

function getAvailabilityStatusDefinition(key = '') {
  const normalized = normalizeAvailabilityStatusKey(key)
  return availabilityStatusCatalog.value.find(
    (item) => normalizeAvailabilityStatusKey(item.clave || item.status || item.id) === normalized,
  ) || null
}

function normalizeCrewDocumentRecord(raw = {}, index = 0) {
  return {
    id: raw.id || index + 1,
    name: raw.document_name || raw.name || raw.file_name || '',
    category: raw.category || raw.type || '',
    state: raw.state || raw.status || '',
    expiresAt: raw.expires_at || raw.expiration_date || '',
    note: raw.note || raw.admin_notes || raw.observations || '',
  }
}

function normalizeCrewIncidentRecord(raw = {}, index = 0) {
  const files = Array.isArray(raw.files) ? raw.files : []
  return {
    id: raw.id || index + 1,
    flight: raw.flight || raw.reference || (raw.crew_operation_id || raw.operation_id != null ? String(raw.crew_operation_id || raw.operation_id) : ''),
    type: raw.category || raw.type || raw.title || '',
    priority: raw.priority || '',
    description: raw.description || raw.comment || '',
    evidence: files.map((file) => file.original_name || file.file_path).filter(Boolean).join(', ') || raw.evidence || '',
    files,
    adminResponse: raw.admin_response || '',
    time: raw.reported_at || raw.created_at || '',
    state: raw.status || raw.state || '',
    phase: raw.phase || '',
    providerId: raw.provider_id || null,
    providerName: raw.provider_name || '',
    actionTaken: raw.action_taken || raw.actionTaken || '',
    timeline: Array.isArray(raw.timeline) ? raw.timeline : [],
    operationId: raw.crew_operation_id || raw.operation_id || null,
    createdAt: raw.reported_at || raw.created_at || '',
  }
}

function dedupeCrewIncidentRecords(records = []) {
  const sortedRecords = [...records].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt || left.time || '')
    const rightTime = Date.parse(right.createdAt || right.time || '')
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0)
  })
  const seen = new Map()

  return sortedRecords.filter((record) => {
    const signature = [
      String(record.operationId || '').trim(),
      String(record.flight || '').trim().toLowerCase(),
      String(record.type || '').trim().toLowerCase(),
      String(record.priority || '').trim().toLowerCase(),
      String(record.phase || '').trim().toLowerCase(),
      String(record.description || '').trim().toLowerCase(),
      String(record.evidence || '').trim().toLowerCase(),
      String(record.state || '').trim().toLowerCase(),
    ].join('|')

    const recordTime = Date.parse(record.createdAt || record.time || '')
    const previousTime = seen.get(signature)

    if (
      Number.isFinite(recordTime) &&
      Number.isFinite(previousTime) &&
      Math.abs(previousTime - recordTime) <= 120000
    ) {
      return false
    }

    seen.set(signature, Number.isFinite(recordTime) ? recordTime : Number.POSITIVE_INFINITY)
    return true
  })
}

function syncDocumentSummary() {
  if (backendDocumentsSummary.value) {
    profileForm.documents = backendDocumentsSummary.value
    return
  }
  const approved = approvedDocuments.value.length
  const pending = pendingDocuments.value.length
  profileForm.documents = `${approved} aprobados / ${pending} pendientes`
}

function rebuildHistoryFromBackend() {
  const assignmentHistory = assignments.value.map((item) => ({
    id: `assignment-${item.id}`,
    flight: item.flight,
    action: 'Estado de mision',
    status: item.missionStatus,
    date: item.date && item.time && item.time !== 'Por definir' ? `${item.date} ${item.time}` : item.date || 'Por definir',
    comment: `${item.route} · ${item.responseStatus}`,
  }))

  const incidentHistory = incidents.value.map((item) => ({
    id: `incident-${item.id}`,
    flight: item.flight,
    action: 'Incidencia reportada',
    status: item.state,
    date: item.time || 'Sin hora',
    comment: item.type,
  }))

  historyEntries.value = [...assignmentHistory, ...incidentHistory]
}

function hydrateProfile(raw = {}) {
  const authProfile = auth.user?.profile || {}
  const resolvedOperationalStatus = normalizeCrewOperationalStatus(
    raw.current_status || raw.status || auth.user?.current_status || auth.user?.status || '',
  )

  providerContext.providerName =
    raw.provider?.commercial_name ||
    raw.provider?.company_name ||
    auth.user?.provider?.commercial_name ||
    auth.user?.provider?.company_name ||
    auth.user?.company_name ||
    raw.provider_name ||
    providerContext.providerName ||
    ''
  profileForm.name = raw.name || raw.full_name || auth.user?.name || ''
  profileForm.phone = raw.phone || raw.phone_number || auth.user?.phone || ''
  profileForm.email = raw.email || auth.user?.email || ''
  profileForm.base = raw.base || raw.city || authProfile.city || ''
  profileForm.languages = Array.isArray(raw.languages) ? raw.languages.join(', ') : raw.languages || ''
  profileForm.certifications = Array.isArray(raw.certifications)
    ? raw.certifications.join(', ')
    : raw.certifications || raw.licenses || ''
  profileForm.experience = raw.experience || raw.bio || ''
  profileForm.photo = raw.photo || raw.avatar || ''
  profileForm.weeklyAvailability = raw.weekly_availability || raw.schedule || ''
  profileForm.birthDate = formatProfileDate(raw.birth_date || authProfile.birth_date)
  profileForm.nationality = raw.nationality || authProfile.nationality || ''
  profileForm.documentType = raw.document_type || authProfile.document_type || ''
  profileForm.documentNumber = raw.document_number || authProfile.document_number || ''
  profileForm.documentExpiration = formatProfileDate(
    raw.document_expiration || authProfile.document_expiration,
  )
  const identityValidationRequired =
    raw.identity_validation_required ?? authProfile.identity_validation_required ?? false
  profileForm.identityValidationRequired =
    identityValidationRequired ? 'Si' : ''
  backendDocumentsSummary.value = raw.documents_summary || raw.documents_status || ''
  profileForm.documents = backendDocumentsSummary.value
  profileForm.profileState = raw.profile_state || raw.validation_status || raw.review_status || ''
  profileRating.value = raw.rating || raw.score || ''
  storedOperationalStatus.value = resolvedOperationalStatus
  currentStatus.value = resolvedOperationalStatus
  auth.syncUserContext({
    userPatch: {
      name: profileForm.name || auth.user?.name || '',
      phone: profileForm.phone || auth.user?.phone || '',
      email: profileForm.email || auth.user?.email || '',
      current_status: resolvedOperationalStatus,
    },
    profilePatch: {
      city: raw.base || raw.city || authProfile.city || '',
      base_airport: raw.base_airport || raw.base || raw.city || authProfile.base_airport || '',
      birth_date: raw.birth_date || authProfile.birth_date || '',
      nationality: raw.nationality || authProfile.nationality || '',
      document_type: raw.document_type || authProfile.document_type || '',
      document_number: raw.document_number || authProfile.document_number || '',
      document_expiration: raw.document_expiration || authProfile.document_expiration || '',
      identity_validation_required:
        raw.identity_validation_required ?? authProfile.identity_validation_required ?? false,
      profile_state:
        raw.profile_state || raw.validation_status || raw.review_status || authProfile.profile_state || '',
      validation_status:
        raw.validation_status || raw.profile_state || raw.review_status || authProfile.validation_status || '',
      current_status: resolvedOperationalStatus || authProfile.current_status || '',
    },
  })
  configForm.notifyAssignments = raw.preferences?.notify_assignments ?? configForm.notifyAssignments
  configForm.notifyIncidents = raw.preferences?.notify_incidents ?? configForm.notifyIncidents
  configForm.notifyScheduleChanges = raw.preferences?.notify_schedule_changes ?? configForm.notifyScheduleChanges
  configForm.personalCoverage = raw.preferences?.personal_coverage || configForm.personalCoverage
  configForm.escalationMode = raw.preferences?.escalation_mode || configForm.escalationMode
}

function updateField({ form, field, value }) {
  const forms = {
    assignmentResponse: assignmentResponseForm,
    agendaBlock: agendaBlockForm,
    availability: availabilityForm,
    incident: incidentForm,
    document: documentForm,
    profile: profileForm,
    config: configForm,
  }

  if (form === 'incident' && field === 'files') {
    const nextFiles = Array.isArray(value) ? value.filter((file) => file instanceof File) : []
    const acceptedFiles = []
    const errors = []
    let totalBytes = 0

    if (nextFiles.length > maxCrewIncidentFiles) {
      errors.push(`Maximo ${maxCrewIncidentFiles} archivos por incidencia.`)
    }

    nextFiles.slice(0, maxCrewIncidentFiles).forEach((file) => {
      if (file.size > maxCrewIncidentFileBytes) {
        errors.push(`${file.name}: supera ${formatFileSize(maxCrewIncidentFileBytes)} por archivo.`)
        return
      }

      if (totalBytes + file.size > maxCrewIncidentTotalBytes) {
        errors.push(`El total adjunto supera ${formatFileSize(maxCrewIncidentTotalBytes)}.`)
        return
      }

      acceptedFiles.push(file)
      totalBytes += file.size
    })

    forms[form][field] = acceptedFiles
    forms[form].evidence = acceptedFiles.map((file) => file.name).join(', ')
    incidentApiErrors.value = {
      ...Object.fromEntries(
        Object.entries(incidentApiErrors.value).filter(([key]) => key !== field && key !== 'evidence' && key !== '_form'),
      ),
      ...(errors.length ? { evidence: errors.join(' ') } : {}),
    }
    return
  }

  forms[form][field] = value

  if (form === 'incident') {
    incidentApiErrors.value = Object.fromEntries(
      Object.entries(incidentApiErrors.value).filter(([key]) => key !== field && key !== '_form'),
    )
  }
}

function formatFileSize(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes % (1024 * 1024) === 0 ? 0 : 1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${Math.round(bytes)} B`
}

function firstIncidentErrorMessage(errors = {}) {
  const priority = ['type', 'priority', 'flight', 'description', 'evidence', '_form']
  for (const key of priority) {
    const message = errors?.[key]
    if (typeof message === 'string' && message.trim()) return message
  }

  const fallback = Object.values(errors || {}).find((value) => typeof value === 'string' && value.trim())
  return fallback || 'Revisa los datos de la incidencia.'
}

function buildApiErrorMessage(error, fallbackMessage) {
  const validationErrors = error?.payload?.errors
  if (validationErrors && typeof validationErrors === 'object') {
    const firstIssue = Object.entries(validationErrors).find(
      ([, value]) => Array.isArray(value) && value.length,
    )
    if (firstIssue) {
      const [field, messages] = firstIssue
      return `${messages[0]} (${field})`
    }
  }

  return error?.message || fallbackMessage
}

function applyIncidentBackendErrors(error, fallbackMessage = '') {
  const validationErrors = error?.payload?.errors
  if (validationErrors && typeof validationErrors === 'object') {
    const fieldMap = {
      operation_id: 'flight',
      crew_operation_id: 'flight',
      crew_id: 'flight',
      request_id: 'flight',
      flight: 'flight',
      category: 'type',
      type: 'type',
      title: 'type',
      priority: 'priority',
      phase: 'phase',
      status: 'state',
      evidence: 'evidence',
      files: 'evidence',
      action_taken: 'actionTaken',
      comment: 'description',
      description: 'description',
    }
    const nextErrors = {}

    Object.entries(validationErrors).forEach(([field, messages]) => {
      if (!Array.isArray(messages) || !messages.length) return
      nextErrors[fieldMap[field] || field] = messages[0]
    })

    if (Object.keys(nextErrors).length) {
      incidentApiErrors.value = nextErrors
      return buildApiErrorMessage(error, fallbackMessage)
    }
  }

  incidentApiErrors.value = {
    _form: error?.message || fallbackMessage,
  }
  return error?.message || fallbackMessage
}

function goToSection(section) {
  router.push(`${roleBasePaths.crew}/${section}`)
}

async function respondAssignment(id, response) {
  const assignment = assignments.value.find((item) => item.id === id)
  if (!assignment) return

  const responsePayload = resolveAssignmentResponsePayload(response)
  const payload = {
    response: responsePayload.response,
    status: responsePayload.status,
    crew_status: responsePayload.crew_status,
    reject_reason: assignmentResponseForm.rejectReason || '',
    comment: assignmentResponseForm.comment || '',
    eta: assignmentResponseForm.eta || '',
  }

  const actionLabel =
    response === 'Confirmado'
      ? 'Confirmando al Admin'
      : response === 'Rechazado'
        ? 'Registrando rechazo'
        : 'Solicitando cambio'

  openAssignmentActionState({
    title: actionLabel,
    detail:
      response === 'Confirmado'
        ? 'Estamos notificando tu disponibilidad y sincronizando la mision operativa.'
        : response === 'Rechazado'
          ? 'Estamos registrando tu respuesta y actualizando el seguimiento con Admin / Red Sky.'
          : 'Estamos enviando tu solicitud para que Admin / Red Sky revise el cambio.',
  })

  try {
    await requestWithCandidates([
      {
        method: 'post',
        path: `/sobrecargo/operations/${assignment.operationId || id}/respond`,
        body: payload,
      },
      {
        method: 'post',
        path: `/sobrecargo/assignments/${assignment.operationId || id}/respond`,
        body: payload,
      },
      {
        method: 'post',
        path: `/sobrecargo/operations/${assignment.operationId || id}/assignment-response`,
        body: payload,
      },
    ])
  } catch (error) {
    closeAssignmentActionState()
    return ui.pushToast({
      tone: 'error',
      title: 'No se pudo responder',
      message: error.message || 'La respuesta no pudo registrarse .',
    })
  }

  await loadPortal()
  assignmentResponseForm.response = ''
  assignmentResponseForm.rejectReason = ''
  assignmentResponseForm.comment = ''
  assignmentResponseForm.eta = ''

  await showAssignmentActionSuccess({
    title: response === 'Confirmado' ? 'Confirmado al Admin' : response === 'Rechazado' ? 'Respuesta registrada' : 'Cambio solicitado',
    detail:
      response === 'Confirmado'
        ? 'Tu disponibilidad ya quedo confirmada con Admin / Red Sky.'
        : response === 'Rechazado'
          ? 'Tu rechazo ya quedo registrado en la operacion.'
          : 'La solicitud de cambio ya quedo enviada a Admin / Red Sky.',
  })
}

async function runAssignmentWorkflowAction(
  id,
  {
    loadingTitle,
    loadingDetail,
    successTitle,
    successDetail,
    errorTitle,
    errorMessage,
    request,
  },
) {
  const assignment = assignments.value.find((item) => item.id === id)
  if (!assignment) return

  openAssignmentActionState({
    title: loadingTitle,
    detail: loadingDetail,
  })

  try {
    await request(assignment)
  } catch (error) {
    closeAssignmentActionState()
    return ui.pushToast({
      tone: 'error',
      title: errorTitle,
      message: error.message || errorMessage,
    })
  }

  await loadPortal()
  goToSection('asignaciones')
  await showAssignmentActionSuccess({
    title: successTitle,
    detail: successDetail,
  })
}

async function confirmBriefing(id) {
  await runAssignmentWorkflowAction(id, {
    loadingTitle: 'Confirmando llegada',
    loadingDetail: 'Estamos registrando tu check-in y sincronizando el avance operativo.',
    successTitle: 'Llegada confirmada',
    successDetail: 'Tu llegada a aeropuerto/base ya quedo registrada con Admin / Red Sky.',
    errorTitle: 'No se pudo confirmar check-in',
    errorMessage: 'El check-in operativo no pudo registrarse .',
    request: (assignment) =>
      requestWithCandidates([
        {
          method: 'post',
          path: `/sobrecargo/operations/${assignment.operationId || id}/checkin`,
          body: {
            note: assignmentResponseForm.comment || 'Check-in operativo confirmado por sobrecargo.',
            base: assignment.origin || assignment.originName || '',
            fit_to_operate: true,
          },
        },
      ]),
  })
}

async function updateCrewChecklistItem({ assignmentId, checklistType, itemId, status, notes = '' }) {
  const assignment = assignments.value.find((item) => item.id === assignmentId)
  if (!assignment) return null

  openAssignmentActionState({
    title: 'Guardando checklist',
    detail: 'Registrando la verificacion operativa.',
  })

  try {
    const response = await requestWithCandidates([{
      method: 'put',
      path: `/sobrecargo/operations/${assignment.operationId || assignmentId}/checklists/${checklistType}/items/${itemId}`,
      body: { status, notes },
    }])

    patchCrewAssignmentChecklist({
      assignmentId,
      operationId: assignment.operationId || assignmentId,
      checklist: response?.checklist || null,
      operation: response?.operation || null,
    })

    closeAssignmentActionState()
    void showAssignmentActionSuccess({
      title: 'Checklist actualizado',
      detail: 'La verificacion quedo guardada.',
      duration: 900,
    })

    scheduleChecklistAssignmentsRefresh()

    return response
  } catch (error) {
    closeAssignmentActionState()
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo actualizar',
      message: error.message || 'El elemento del checklist no pudo guardarse.',
    })
    throw error
  }
}

function patchCrewAssignmentChecklist({ assignmentId, operationId, checklist, operation }) {
  const targetIndex = assignments.value.findIndex((item) =>
    String(item.id) === String(assignmentId)
    || String(item.operationId || '') === String(operationId || ''),
  )

  if (targetIndex < 0 || !checklist) return

  const current = assignments.value[targetIndex]
  const nextChecklists = Array.isArray(current.checklists) ? [...current.checklists] : []
  const checklistIndex = nextChecklists.findIndex((entry) =>
    String(entry.id || '') === String(checklist.id || '')
    || String(entry.type || '') === String(checklist.type || ''),
  )

  if (checklistIndex >= 0) {
    nextChecklists[checklistIndex] = checklist
  } else {
    nextChecklists.push(checklist)
  }

  assignments.value[targetIndex] = {
    ...current,
    checklists: nextChecklists,
    crewStatus: operation?.crew_status || current.crewStatus,
    workflowStatus: operation?.crew_status || current.workflowStatus,
  }
}

function clearChecklistAssignmentsRefresh() {
  if (checklistAssignmentsRefreshTimer) {
    window.clearTimeout(checklistAssignmentsRefreshTimer)
    checklistAssignmentsRefreshTimer = null
  }
}

function scheduleChecklistAssignmentsRefresh() {
  if (typeof window === 'undefined') return

  clearChecklistAssignmentsRefresh()
  checklistAssignmentsRefreshTimer = window.setTimeout(() => {
    checklistAssignmentsRefreshTimer = null
    void loadPortal({ force: true, resources: ['assignments'] })
  }, 250)
}

function toggleChecklistGroup(groupId) {
  checklistCollapsedGroups[groupId] = !checklistCollapsedGroups[groupId]
}

function selectChecklistItem(item) {
  if (!item?.id) return
  selectedChecklistItemId.value = item.id
  checklistFailureFormOpen.value = item.status === 'Falla reportada'
  checklistFailureDraft.description = item.status === 'Falla reportada' ? item.notes || '' : ''
  checklistFailureDraft.files = []
  checklistFailureDraft.previews.forEach((url) => URL.revokeObjectURL(url))
  checklistFailureDraft.previews = []
}

function getNextPendingChecklistItemId(currentItemId = '') {
  const pendingItems = checklistFlatItems.value.filter((item) => item.status === 'Pendiente')
  if (!pendingItems.length) return ''

  const currentIndex = pendingItems.findIndex((item) => item.id === currentItemId)
  if (currentIndex >= 0 && pendingItems[currentIndex + 1]) return pendingItems[currentIndex + 1].id
  return pendingItems[0]?.id || ''
}

async function markChecklistItem(status) {
  const item = selectedChecklistItem.value
  if (!item || !currentAssignment.value) return

  const nextItemId = getNextPendingChecklistItemId(item.id)

  await updateCrewChecklistItem({
    assignmentId: currentAssignment.value.id,
    checklistType: item.checklistType,
    itemId: item.id,
    status,
    notes: '',
  })

  selectedChecklistItemId.value = nextItemId || item.id
  checklistFailureFormOpen.value = false
  checklistFailureDraft.description = ''
  updateChecklistFailureFiles([])
}

function updateChecklistFailureFiles(fileList) {
  const files = Array.from(fileList || []).slice(0, 3)
  checklistFailureDraft.previews.forEach((url) => URL.revokeObjectURL(url))
  checklistFailureDraft.files = files
  checklistFailureDraft.previews = files.map((file) => URL.createObjectURL(file))
}

function removeChecklistFailureFile(index) {
  const preview = checklistFailureDraft.previews[index]
  if (preview) URL.revokeObjectURL(preview)
  checklistFailureDraft.files = checklistFailureDraft.files.filter((_, fileIndex) => fileIndex !== index)
  checklistFailureDraft.previews = checklistFailureDraft.previews.filter((_, fileIndex) => fileIndex !== index)
}

async function submitChecklistFailureReport() {
  const item = selectedChecklistItem.value
  const assignment = currentAssignment.value
  const description = String(checklistFailureDraft.description || '').trim()

  if (!item || !assignment?.operationId) return
  if (!description) {
    ui.pushToast({
      tone: 'error',
      title: 'Describe el problema',
      message: 'Agrega un comentario breve para registrar la falla del checklist.',
    })
    return
  }

  const formData = new FormData()
  formData.append('crew_operation_id', assignment.operationId)
  formData.append('crew_id', auth.user?.id || assignment.crewId || '')
  formData.append('category', 'cabina')
  formData.append('priority', item.critical ? 'alta' : 'media')
  formData.append('phase', 'Pre-vuelo')
  formData.append('description', `${item.title}: ${description}`.slice(0, 500))
  checklistFailureDraft.files.forEach((file) => {
    formData.append('files[]', file)
  })

  const nextItemId = getNextPendingChecklistItemId(item.id)

  try {
    checklistFailureSubmitting.value = true
    await api.postForm('/crew-operation-incidents', formData)
    await updateCrewChecklistItem({
      assignmentId: assignment.id,
      checklistType: item.checklistType,
      itemId: item.id,
      status: 'failed',
      notes: description,
    })
    await loadPortal({ force: true, resources: ['incidents'] })
    ui.pushToast({
      tone: 'success',
      title: 'Falla reportada',
      message: 'La incidencia del checklist ya quedo registrada para seguimiento operativo.',
    })
    checklistFailureFormOpen.value = false
    checklistFailureDraft.description = ''
    updateChecklistFailureFiles([])
    selectedChecklistItemId.value = nextItemId || item.id
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo guardar la falla',
      message: normalizeApiError(error, 'La falla del checklist no pudo registrarse.'),
    })
  } finally {
    checklistFailureSubmitting.value = false
  }
}

async function submitCrewReport({ assignmentId, report }) {
  await runAssignmentWorkflowAction(assignmentId, {
    loadingTitle: 'Enviando reporte final', loadingDetail: 'Cerrando tu participacion operativa.',
    successTitle: 'Reporte enviado', successDetail: 'Tu participacion quedo completada; el cierre final corresponde a Admin.',
    errorTitle: 'No se pudo enviar', errorMessage: 'Verifica los campos obligatorios del reporte.',
    request: (assignment) => requestWithCandidates([{
      method: 'post', path: `/sobrecargo/operations/${assignment.operationId || assignmentId}/report`, body: report,
    }]),
  })
}

async function markCabinReady(id) {
  await runAssignmentWorkflowAction(id, {
    loadingTitle: 'Registrando cabina',
    loadingDetail: 'Estamos guardando la revision de cabina, catering e insumos.',
    successTitle: 'Cabina registrada',
    successDetail: 'La revision de cabina y catering ya quedo sincronizada.',
    errorTitle: 'No se pudo registrar cabina',
    errorMessage: 'La revision de cabina no pudo registrarse .',
    request: (assignment) =>
      requestWithCandidates([
        {
          method: 'post',
          path: `/sobrecargo/operations/${assignment.operationId || id}/cabin-ready`,
          body: {
            note: assignmentResponseForm.comment || 'Cabina, catering e insumos revisados por sobrecargo.',
          },
        },
      ]),
  })
}

async function transitionCrewOperation(id, status, {
  loadingTitle = 'Actualizando seguimiento',
  loadingDetail = 'Estamos registrando el siguiente hito operativo.',
  successTitle = 'Seguimiento actualizado',
  successDetail = 'El seguimiento del vuelo ya quedo actualizado.',
  errorTitle = 'No se pudo actualizar',
  errorMessage = 'El hito operativo no pudo registrarse.',
  note = '',
} = {}) {
  await runAssignmentWorkflowAction(id, {
    loadingTitle,
    loadingDetail,
    successTitle,
    successDetail,
    errorTitle,
    errorMessage,
    request: (assignment) =>
      requestWithCandidates([
        {
          method: 'post',
          path: `/sobrecargo/operations/${assignment.operationId || id}/transition`,
          body: {
            status,
            notes: note,
          },
        },
      ]),
  })
}

async function markPassengersReceived(id) {
  await runAssignmentWorkflowAction(id, {
    loadingTitle: 'Registrando pasajeros',
    loadingDetail: 'Estamos notificando la recepcion de pasajeros y actualizando la mision.',
    successTitle: 'Pasajeros recibidos',
    successDetail: 'La recepcion de pasajeros ya quedo registrada en la operacion.',
    errorTitle: 'No se pudo registrar recepcion',
    errorMessage: 'La recepcion de pasajeros no pudo registrarse .',
    request: (assignment) =>
      requestWithCandidates([
        {
          method: 'post',
          path: `/sobrecargo/operations/${assignment.operationId || id}/passengers-ready`,
          body: {
            note: assignmentResponseForm.comment || 'Pasajeros recibidos por sobrecargo antes del vuelo.',
          },
        },
      ]),
  })
}

async function saveAvailabilityDay({ date, state, reason }) {
  if (!date) {
    ui.pushToast({
      tone: 'error',
      title: 'Fecha invalida',
      message: 'Selecciona un dia del calendario antes de guardar.',
    })
    return
  }

  const assignmentExists = assignments.value.some((item) => item.date === date)
  if (assignmentExists) {
    ui.pushToast({
      tone: 'warning',
      title: 'Dia en operacion',
      message: 'Este dia ya tiene una operacion asignada. Solicita revision a Admin / Red Sky.',
    })
    return
  }

  const overlappingBlocks = availabilityBlocks.value.filter((item) => {
    const from = String(item.from || '').slice(0, 10)
    const to = String(item.to || item.from || '').slice(0, 10)
    return from <= date && to >= date
  })

  try {
    await Promise.all(
      overlappingBlocks
        .filter((item) => item.recordId != null)
        .map((item) =>
          requestWithCandidates([{ method: 'delete', path: `/sobrecargo/availability/${item.recordId}` }]),
        ),
    )

    await persistAvailabilityDate({
      scope: 'crew',
      date,
      statusKey: state,
      comment: reason || 'Actualizado desde calendario de disponibilidad',
      base: profileForm.base,
      coverage: configForm.personalCoverage,
      audit: true,
    })
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo guardar',
      message: error.message || 'La disponibilidad no pudo actualizarse .',
    })
    return
  }

  await loadPortal()
  ui.pushToast({
    tone: 'success',
    title: 'Disponibilidad guardada',
    message: 'El dia seleccionado ya quedo actualizado en tu calendario operativo.',
  })
}

async function startAssignedService(id) {
  await runAssignmentWorkflowAction(id, {
    loadingTitle: 'Iniciando servicio',
    loadingDetail: 'Estamos marcando el inicio del servicio a bordo y sincronizando el seguimiento.',
    successTitle: 'Servicio iniciado',
    successDetail: 'El inicio del servicio ya quedo registrado con Admin / Red Sky.',
    errorTitle: 'No se pudo iniciar',
    errorMessage: 'El servicio no pudo iniciarse .',
    request: (assignment) =>
      requestWithCandidates([
        { method: 'post', path: `/sobrecargo/operations/${assignment.operationId}/start-service`, body: {} },
      ]),
  })
}

async function finalizeAssignedService(id) {
  await runAssignmentWorkflowAction(id, {
    loadingTitle: 'Cerrando servicio',
    loadingDetail: 'Estamos registrando el cierre del servicio y enviando la trazabilidad final.',
    successTitle: 'Servicio finalizado',
    successDetail: 'El cierre del servicio ya quedo registrado en la operacion.',
    errorTitle: 'No se pudo finalizar',
    errorMessage: 'El cierre del servicio no pudo registrarse .',
    request: (assignment) =>
      requestWithCandidates([
        { method: 'post', path: `/sobrecargo/operations/${assignment.operationId}/complete-service`, body: {} },
      ]),
  })
}

async function createIncident() {
  if (incidentSubmissionInFlight.value) return
  incidentApiErrors.value = {}

  if (Object.keys(incidentErrors.value).length) {
    return ui.pushToast({
      tone: 'error',
      title: 'Incidencia invalida',
      message: firstIncidentErrorMessage(incidentErrors.value),
    })
  }

  const linkedAssignment =
    assignments.value.find((item) => item.flight === incidentForm.flight) || currentAssignment.value

  if (!linkedAssignment?.operationId) {
    return ui.pushToast({
      tone: 'error',
      title: 'Operacion no encontrada',
      message: 'La incidencia debe vincularse a una operacion asignada del proveedor.',
    })
  }

  const formData = new FormData()
  formData.append('crew_operation_id', linkedAssignment.operationId)
  formData.append('crew_id', auth.user?.id || linkedAssignment.crewId || '')
  formData.append('category', incidentForm.type)
  formData.append('priority', incidentForm.priority)
  formData.append('phase', incidentForm.phase)
  formData.append('description', incidentForm.description)
  ;(incidentForm.files || []).forEach((file) => {
    formData.append('files[]', file)
  })

  try {
    incidentSubmissionInFlight.value = true
    await api.postForm('/crew-operation-incidents', formData)
    await loadPortal({ force: true, resources: ['incidents'] })
    ui.pushToast({
      tone: 'success',
      title: 'Incidencia creada',
      message: 'La incidencia ya quedo vinculada a tu operacion para seguimiento de Admin / Red Sky.',
    })
    incidentForm.flight = ''
    incidentForm.type = ''
    incidentForm.priority = ''
    incidentForm.description = ''
    incidentForm.evidence = ''
    incidentForm.files = []
    incidentForm.state = 'open'
    incidentForm.actionTaken = ''
    incidentForm.phase = 'Pre-vuelo'
    goToSection('dashboard')
  } catch (error) {
    const message = applyIncidentBackendErrors(error, 'No acepto la incidencia.')
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo crear',
      message,
    })
  } finally {
    incidentSubmissionInFlight.value = false
  }
}

async function addDocument() {
  if (!documentForm.name.trim()) {
    return ui.pushToast({
      tone: 'error',
      title: 'Documento incompleto',
      message: 'Captura al menos el nombre del documento o certificacion.',
    })
  }

  const payload = {
    document_name: documentForm.name,
    category: documentForm.category,
    expires_at: documentForm.expiresAt || undefined,
    note: documentForm.note || '',
  }

  try {
    const response = await requestWithCandidates([
      { method: 'post', path: '/sobrecargo/documents', body: payload },
    ])
    const created = pickRecord(response, ['document', 'data'])
    documentItems.value.unshift(
      Object.keys(created || {}).length
        ? normalizeCrewDocumentRecord(created, documentItems.value.length)
        : normalizeCrewDocumentRecord(payload, documentItems.value.length),
    )
    pushHistory('Documento cargado', 'Pendiente', `${documentForm.name} enviado a revision documental.`)
    ui.pushToast({
      tone: 'success',
      title: 'Documento agregado',
      message: 'El documento ya aparece en tu centro operativo y quedo pendiente de validacion.',
    })
    documentForm.name = ''
    documentForm.expiresAt = ''
    documentForm.note = ''
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo subir',
      message: error.message || 'El documento no pudo registrarse .',
    })
  }
}

async function updateDocumentState(id, nextState) {
  try {
    await requestWithCandidates([
      {
        method: 'put',
        path: `/sobrecargo/documents/${id}`,
        body: {
          state: nextState,
        },
      },
    ])
    await loadPortal()
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo actualizar',
      message: error.message || 'El documento no pudo actualizarse .',
    })
  }
}

async function saveProfile() {
  if (Object.keys(profileErrors.value).length) {
    return ui.pushToast({
      tone: 'error',
      title: 'Perfil invalido',
      message: 'Revisa correo, telefono, certificaciones y estado documental.',
    })
  }

  try {
    await requestWithCandidates([
      {
        method: 'put',
        path: '/sobrecargo/profile',
        body: {
          name: profileForm.name,
          phone: profileForm.phone,
          email: profileForm.email,
          base: profileForm.base,
          languages: profileForm.languages.split(',').map((item) => item.trim()).filter(Boolean),
          certifications: profileForm.certifications.split(',').map((item) => item.trim()).filter(Boolean),
          experience: profileForm.experience,
          weekly_availability: profileForm.weeklyAvailability,
        },
      },
    ])
  } catch (error) {
    return ui.pushToast({
      tone: 'error',
      title: 'No se pudo guardar',
      message: error.message || 'El perfil no pudo actualizarse .',
    })
  }

  await loadPortal()
  ui.pushToast({
    tone: 'success',
    title: 'Perfil actualizado',
    message: 'Los cambios del perfil quedaron reflejados .',
  })
}

async function saveConfig() {
  try {
    await requestWithCandidates([
      {
        method: 'put',
        path: '/sobrecargo/profile',
        body: {
          preferences: {
            notify_assignments: configForm.notifyAssignments,
            notify_incidents: configForm.notifyIncidents,
            notify_schedule_changes: configForm.notifyScheduleChanges,
            personal_coverage: configForm.personalCoverage,
            escalation_mode: configForm.escalationMode,
          },
        },
      },
    ])
    await loadPortal()
    ui.pushToast({
      tone: 'success',
      title: 'Configuracion actualizada',
      message: 'Las preferencias del portal ya quedaron guardadas .',
    })
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo guardar',
      message: error.message || 'Las preferencias no pudieron persistirse .',
    })
  }
}

async function loadPortal(options = {}) {
  const { force = true, resources = null } = options
  const requestedKeys = new Set(resources?.length ? resources : getCrewPortalResourceKeys())

  if (loadPortalPromise) {
    if (!force) return loadPortalPromise
    await loadPortalPromise
  }

  loadPortalPromise = (async () => {
    const requestEntries = []

    if (requestedKeys.has('dashboard') && (force || !portalDataLoaded.dashboard)) {
      requestEntries.push([
        'dashboard',
        () => api.get('/sobrecargo/dashboard', { timeoutMs: CREW_PORTAL_TIMEOUT_MS }),
      ])
    }

    if (requestedKeys.has('assignments') && (force || !portalDataLoaded.assignments)) {
      requestEntries.push(['assignments', () => fetchCrewAssignments()])
    }

    if (requestedKeys.has('profile') && (force || !portalDataLoaded.profile)) {
      requestEntries.push([
        'profile',
        () =>
          requestWithCandidates([
            { method: 'get', path: '/sobrecargo/profile', timeoutMs: CREW_PORTAL_TIMEOUT_MS },
          ]),
      ])
    }

    if (requestedKeys.has('documents') && (force || !portalDataLoaded.documents)) {
      requestEntries.push([
        'documents',
        () =>
          requestWithCandidates([
            { method: 'get', path: '/sobrecargo/documents', timeoutMs: CREW_PORTAL_TIMEOUT_MS },
          ]),
      ])
    }

    if (requestedKeys.has('availability') && (force || !portalDataLoaded.availability)) {
      requestEntries.push([
        'availability',
        () =>
          requestWithCandidates([
            { method: 'get', path: '/sobrecargo/availability', timeoutMs: CREW_PORTAL_TIMEOUT_MS },
          ]),
      ])
    }

    if (requestedKeys.has('incidents') && (force || !portalDataLoaded.incidents)) {
      const crewOperationId = currentAssignment.value?.operationId || currentAssignment.value?.id || ''
      requestEntries.push([
        'incidents',
        () =>
          requestWithCandidates([
            {
              method: 'get',
              path: '/crew-operation-incidents',
              query: {
                crew_operation_id: crewOperationId || undefined,
              },
              timeoutMs: CREW_PORTAL_TIMEOUT_MS,
            },
          ]),
      ])
    }

    if (!requestEntries.length) {
      finalizePortalState()
      return
    }

    requestEntries.forEach(([key]) => {
      portalDataLoading[key] = true
      portalDataErrors[key] = ''
    })

    const results = await Promise.allSettled(requestEntries.map(([, request]) => request()))

    results.forEach((result, index) => {
      const [key] = requestEntries[index]

      if (result.status !== 'fulfilled') {
        portalDataErrors[key] = normalizeApiError(result.reason).message
        return
      }

      if (key === 'dashboard') {
        metrics.value = result.value.metrics || metrics.value
        portalDataLoaded.dashboard = true
        return
      }

      if (key === 'assignments') {
        assignments.value = result.value
        portalDataLoaded.assignments = true
        return
      }

      if (key === 'profile') {
        hydrateProfile(pickRecord(result.value, ['profile', 'user', 'data']))
        portalDataLoaded.profile = true
        return
      }

      if (key === 'documents') {
        const collection = pickCollection(result.value, ['documents', 'documentos', 'data'])
        documentItems.value = collection.map(normalizeCrewDocumentRecord)
        syncDocumentSummary()
        portalDataLoaded.documents = true
        return
      }

      if (key === 'availability') {
        const availabilityResponse = result.value || {}
        const collection = pickCollection(availabilityResponse, ['availability', 'disponibilidad', 'data', 'items'])
        availabilityStatusCatalog.value = pickCollection(availabilityResponse, ['statuses', 'estatuses'])
        availabilityBlocks.value = collection.map(normalizeCrewAvailabilityRecord)
        portalDataLoaded.availability = true
        return
      }

      if (key === 'incidents') {
        const collection = pickCollection(result.value, ['incidents', 'incidencias', 'data', 'items'])
        incidents.value = dedupeCrewIncidentRecords(collection.map(normalizeCrewIncidentRecord))
        portalDataLoaded.incidents = true
      }
    })

    requestEntries.forEach(([key]) => {
      portalDataLoading[key] = false
    })

    finalizePortalState()
  })()

  try {
    await loadPortalPromise
  } finally {
    Object.keys(portalDataLoading).forEach((key) => {
      portalDataLoading[key] = false
    })
    loadPortalPromise = null
  }
}

function retryPortalResource(resource) {
  if (!resource || portalDataLoading[resource]) return
  void loadPortal({ force: true, resources: [resource] })
}

watch(
  resolvedSection,
  async (section) => {
    selectedFlightStepId.value = ''
    clearBackgroundCrewWarmup()
    await loadPortal({ force: false, resources: getCrewPortalResourceKeys(section) })
    scheduleBackgroundCrewWarmup(section)
  },
  { immediate: true },
)

watch(
  () => [resolvedSection.value, currentAssignment.value?.operationId || ''],
  ([section, operationId]) => {
    if (section !== 'incidencias' || !operationId || portalDataLoading.incidents) return
    void loadPortal({ force: true, resources: ['incidents'] })
  },
)

watch(
  currentAssignment,
  (assignment) => {
    if (!assignment) {
      selectedFlightStepId.value = ''
      selectedTrackingMilestoneId.value = ''
      return
    }
    if (!incidentForm.flight) {
      incidentForm.flight = assignment.flight || String(assignment.operationId || assignment.id || '')
    }
  },
  { immediate: true },
)

watch(
  flightTrackingMilestones,
  (milestones) => {
    if (!milestones.length) {
      selectedTrackingMilestoneId.value = ''
      return
    }

    const stillExists = milestones.some((item) => item.id === selectedTrackingMilestoneId.value)
    if (!stillExists) {
      selectedTrackingMilestoneId.value =
        milestones.find((item) => item.isCurrent)?.id
        || milestones[0]?.id
        || ''
    }
  },
  { immediate: true, deep: true },
)

watch(
  checklistFlatItems,
  (items) => {
    if (!items.length) {
      selectedChecklistItemId.value = ''
      return
    }

    items.forEach((item) => {
      if (!(item.groupId in checklistCollapsedGroups)) {
        checklistCollapsedGroups[item.groupId] = false
      }
    })

    const stillExists = items.some((item) => item.id === selectedChecklistItemId.value)
    if (!stillExists) {
      selectedChecklistItemId.value =
        items.find((item) => item.status === 'Pendiente')?.id
        || items.find((item) => item.status === 'Falla reportada')?.id
        || items[0]?.id
        || ''
    }
  },
  { immediate: true },
)

watch(
  () => flightFlowState.value.steps,
  (steps) => {
    if (!selectedFlightStepId.value) return

    const stillAvailable = steps.some(
      (step) => step.id === selectedFlightStepId.value && step.available,
    )

    if (!stillAvailable) {
      selectedFlightStepId.value = ''
    }
  },
  { deep: true },
)

onMounted(() => {
  removeCrewSyncSubscription = subscribeWorkflowSync(async (payload = {}) => {
    if (payload.scope !== 'crew-status') return
    if (Number(payload.crewUserId || 0) !== Number(auth.user?.id || 0)) return

    clearBackgroundCrewWarmup()
    await loadPortal({
      force: true,
      resources: getCrewPortalResourceKeys(resolvedSection.value),
    })
    scheduleBackgroundCrewWarmup(resolvedSection.value)
  })
})

onBeforeUnmount(() => {
  clearBackgroundCrewWarmup()
  clearChecklistAssignmentsRefresh()
  if (removeCrewSyncSubscription) {
    removeCrewSyncSubscription()
    removeCrewSyncSubscription = null
  }
  checklistFailureDraft.previews.forEach((url) => URL.revokeObjectURL(url))
})
</script>

<template>
  <div class="crew-portal-page">
    <CrewNotificationCenter />
    <aside v-if="portalLoadState.hasErrors" class="surface crew-partial-load-alert" role="alert">
      <div>
        <strong>{{ portalLoadState.isPartial ? 'El portal se cargó parcialmente' : 'No fue posible cargar el portal' }}</strong>
        <p>No se mostraron datos vacíos para las secciones que fallaron. Puedes reintentarlas individualmente.</p>
      </div>
      <div class="crew-partial-load-actions">
        <button
          v-for="resource in portalLoadState.failedSections"
          :key="resource"
          type="button"
          class="secondary-action"
          :disabled="portalDataLoading[resource]"
          @click="retryPortalResource(resource)"
        >
          {{ portalDataLoading[resource] ? 'Reintentando…' : `Reintentar ${resource}` }}
        </button>
      </div>
    </aside>
    <Teleport to="body">
      <section v-if="activeCrewLoadingState" class="crew-loading-scene" :data-tone="activeCrewLoadingState.tone">
        <div class="crew-loading-scene__backdrop" aria-hidden="true">
          <span class="crew-loading-scene__blur crew-loading-scene__blur--left"></span>
          <span class="crew-loading-scene__blur crew-loading-scene__blur--center"></span>
          <span class="crew-loading-scene__blur crew-loading-scene__blur--right"></span>
        </div>

        <article class="crew-loading-scene__card">
          <div class="crew-loading-scene__glow" aria-hidden="true"></div>
          <div class="crew-loading-scene__spinner-shell">
            <div class="crew-loading-scene__spinner" aria-hidden="true">
              <span v-for="segment in 12" :key="`crew-loading-segment-${segment}`"></span>
            </div>
          </div>
          <p class="crew-loading-scene__eyebrow">{{ activeCrewLoadingState.eyebrow }}</p>
          <h3>{{ activeCrewLoadingState.title }}</h3>
          <p class="crew-loading-scene__copy">{{ activeCrewLoadingState.detail }}</p>
          <div class="crew-loading-scene__progress" aria-hidden="true">
            <span
              v-for="(stage, index) in activeCrewLoadingState.stages"
              :key="stage"
              :class="{ 'is-active': index < activeCrewLoadingState.activeStages }"
            >
              {{ stage }}
            </span>
          </div>
        </article>
      </section>
    </Teleport>

    <section v-if="canonicalCrewSection === 'dashboard'" class="crew-home">
      <article class="surface crew-home-hero">
        <div class="crew-home-copy">
          <span class="eyebrow">Inicio</span>
          <h2>Que tengo que hacer ahora</h2>
          <p class="muted">Tu siguiente accion aparece primero para que no tengas que entrar a varios modulos.</p>
        </div>
        <div class="crew-home-status">
          <span class="badge">{{ currentPrimaryAction.title }}</span>
          <strong>{{ currentStatus || 'Sin estado operativo' }}</strong>
        </div>
      </article>

      <article class="surface crew-next-flight-card">
        <div class="section-head">
          <div>
            <span class="eyebrow">Proximo vuelo</span>
            <h3>{{ currentFlightSummary?.route || 'Sin vuelo asignado' }}</h3>
          </div>
          <button class="primary-action action-button" type="button" :disabled="!currentFlightSummary" @click="goToSection('asignaciones')">
            Revisar mi vuelo
          </button>
        </div>
        <template v-if="currentFlightSummary">
          <div class="crew-fact-grid">
            <article class="crew-fact-card"><span>Fecha</span><strong>{{ currentFlightSummary.date }}</strong></article>
            <article class="crew-fact-card"><span>Reporte</span><strong>{{ currentFlightSummary.reportTime }}</strong></article>
            <article class="crew-fact-card"><span>Aeronave</span><strong>{{ currentFlightSummary.aircraft }}</strong></article>
            <article class="crew-fact-card"><span>Operacion</span><strong>{{ currentFlightSummary.operationId }}</strong></article>
            <article class="crew-fact-card crew-fact-card--wide"><span>Estado actual</span><strong>{{ currentFlightSummary.status }}</strong></article>
          </div>
        </template>
        <p v-else class="muted">No tienes una operacion asignada por ahora.</p>
      </article>

      <article class="surface crew-progress-card">
        <div class="section-head">
          <div>
            <span class="eyebrow">Tu progreso</span>
            <h3>{{ currentPrimaryAction.title }}</h3>
          </div>
        </div>
        <div class="crew-progress-list">
          <article v-for="step in flightFlowState.steps" :key="step.id" class="crew-progress-step" :data-state="step.state.toLowerCase()">
            <span class="crew-progress-dot"></span>
            <div>
              <strong>{{ step.label }}</strong>
              <small>{{ step.state }}</small>
            </div>
          </article>
        </div>
      </article>
    </section>

    <CrewAvailabilitySection
      v-else-if="canonicalCrewSection === 'disponibilidad'"
      :availability-blocks="availabilityBlocks"
      :status-options="availabilityStatusCatalog"
      :assignments="assignments"
      :base="profileForm.base"
      :coverage="configForm.personalCoverage"
      @save-day="saveAvailabilityDay"
      @request-review="
        ui.pushToast({
          tone: 'info',
          title: 'Solicitud enviada',
          message: 'Este dia tiene una operacion asignada. Para solicitar un cambio contacta a Admin / Red Sky.',
        })
      "
    />

    <section v-else-if="canonicalCrewSection === 'asignaciones'" class="crew-flight-workspace">
      <article class="surface crew-flight-hero">
        <div class="title-row">
          <span class="icon-badge"><CrewUiIcon name="assignment" :size="20" /></span>
          <div>
            <span class="eyebrow">Mi vuelo</span>
            <h3>{{ currentFlightSummary?.operationId || 'Sin vuelo activo' }}</h3>
            <p class="muted">Validacion, preparacion, checklist, evidencias, seguimiento y cierre en una sola seccion.</p>
          </div>
        </div>
        <div class="crew-flight-hero__actions">
          <button class="primary-action action-button" type="button" :disabled="!currentPrimaryAction.action" @click="currentPrimaryAction.action?.()">
            {{ currentPrimaryAction.cta || 'Sin accion inmediata' }}
          </button>
          <button class="ghost-button action-button" type="button" @click="flightIncidentOpen = !flightIncidentOpen">
            Reportar incidencia
          </button>
        </div>
      </article>

      <article v-if="currentFlightSummary" class="surface crew-flight-summary">
        <div class="section-head">
          <div>
            <span class="eyebrow">Vuelo actual</span>
            <h3>{{ currentFlightSummary.route }}</h3>
          </div>
          <span class="badge">{{ currentFlightSummary.status }}</span>
        </div>

        <div class="crew-fact-grid">
          <article class="crew-fact-card"><span>Fecha</span><strong>{{ currentFlightSummary.date }}</strong></article>
          <article class="crew-fact-card"><span>Reporte</span><strong>{{ currentFlightSummary.reportTime }}</strong></article>
          <article class="crew-fact-card"><span>Aeronave</span><strong>{{ currentFlightSummary.aircraft }}</strong></article>
          <article class="crew-fact-card"><span>FBO</span><strong>{{ currentFlightSummary.fbo }}</strong></article>
          <article class="crew-fact-card"><span>Pasajeros</span><strong>{{ currentFlightSummary.passengers }}</strong></article>
          <article class="crew-fact-card crew-fact-card--wide"><span>Observaciones importantes</span><strong>{{ currentFlightSummary.observations }}</strong></article>
        </div>

        <div class="crew-stepper">
          <button
            v-for="(step, index) in flightFlowState.steps"
            :key="step.id"
            type="button"
            class="crew-stepper-item"
            :data-state="step.state.toLowerCase()"
            :data-selected="currentFlightStep?.id === step.id"
            :disabled="!step.available"
            @click="openFlightStep(step.id)"
          >
            <span>{{ index + 1 }}. {{ step.label }}</span>
            <strong>{{ step.state }}</strong>
          </button>
        </div>
      </article>

      <article v-else class="surface inner-card">
        <strong>Sin vuelo asignado</strong>
        <p class="muted">En cuanto se te asigne una operacion, aqui se habilitara todo el flujo de Mi vuelo.</p>
      </article>

      <article v-if="currentFlightSummary" class="surface crew-action-banner">
        <div>
          <span class="eyebrow">Accion principal</span>
          <h3>{{ currentPrimaryAction.title }}</h3>
          <p class="muted">{{ currentPrimaryAction.detail }}</p>
        </div>
        <div class="crew-action-banner__actions">
          <button
            v-if="currentPrimaryAction.cta && currentPrimaryAction.action"
            class="primary-action action-button"
            type="button"
            :disabled="assignmentActionState.active"
            @click="currentPrimaryAction.action"
          >
            {{ currentPrimaryAction.cta }}
          </button>
          <button
            class="ghost-button action-button"
            type="button"
            :disabled="!checklistStepState?.available"
            @click="openFlightStep('checklist')"
          >
            {{ checklistStepState?.available ? 'Ir al checklist' : 'Completa preparacion para habilitar checklist' }}
          </button>
        </div>
      </article>

      <article v-if="currentFlightStep?.id === 'validation' && currentAssignment" class="surface inner-card crew-step-card">
        <span class="eyebrow">Paso 1</span>
        <h3>Validar vuelo</h3>
        <p class="muted">Confirma que recibiste y puedes realizar esta asignacion.</p>
        <div class="crew-fact-grid">
          <article class="crew-fact-card"><span>Ruta</span><strong>{{ currentFlightSummary.route }}</strong></article>
          <article class="crew-fact-card"><span>Fecha</span><strong>{{ currentFlightSummary.date }}</strong></article>
          <article class="crew-fact-card"><span>Hora de reporte</span><strong>{{ currentFlightSummary.reportTime }}</strong></article>
          <article class="crew-fact-card"><span>Aeronave</span><strong>{{ currentFlightSummary.aircraft }}</strong></article>
          <article class="crew-fact-card"><span>FBO de salida</span><strong>{{ currentFlightSummary.fbo }}</strong></article>
          <article class="crew-fact-card"><span>Pasajeros</span><strong>{{ currentFlightSummary.passengers }}</strong></article>
        </div>
        <div class="action-row">
          <button class="primary-action action-button" type="button" :disabled="assignmentActionState.active" @click="respondAssignment(currentAssignment.id, 'Confirmado')">Confirmar vuelo</button>
          <button class="ghost-button action-button" type="button" @click="flightIncidentOpen = true">Reportar problema</button>
        </div>
      </article>

      <article v-else-if="currentFlightStep?.id === 'preparation' && currentAssignment" class="surface inner-card crew-step-card">
        <span class="eyebrow">Paso 2</span>
        <h3>Preparacion del vuelo</h3>
        <div class="crew-check-grid">
          <article class="crew-check-item" :data-done="Boolean(currentAssignment.assignmentConfirmed)"><strong>Briefing recibido</strong><small>{{ currentAssignment.assignmentConfirmed ? 'Completado' : 'Pendiente' }}</small></article>
          <article class="crew-check-item" :data-done="Boolean(currentFlightSummary.reportTime && currentFlightSummary.reportTime !== 'Por definir')"><strong>Hora de reporte confirmada</strong><small>{{ currentFlightSummary.reportTime }}</small></article>
          <article class="crew-check-item" :data-done="Boolean(currentFlightSummary.fbo && currentFlightSummary.fbo !== 'Pendiente por confirmar')"><strong>FBO confirmado</strong><small>{{ currentFlightSummary.fbo }}</small></article>
          <article class="crew-check-item" :data-done="flightTrackingMilestones.find((item) => item.id === 'cabin')?.done"><strong>Catering revisado</strong><small>{{ flightTrackingMilestones.find((item) => item.id === 'cabin')?.done ? 'Completado' : 'Pendiente' }}</small></article>
          <article class="crew-check-item" :data-done="Boolean(currentAssignment.internalContact)"><strong>Transporte confirmado</strong><small>{{ currentAssignment.internalContact || 'Pendiente por confirmar' }}</small></article>
          <article class="crew-check-item" :data-done="Boolean(currentAssignment.passengers)"><strong>Informacion de pasajeros revisada</strong><small>{{ currentFlightSummary.passengers }}</small></article>
        </div>
        <div class="action-row">
          <button v-if="currentAssignment.canCheckin" class="primary-action action-button" type="button" :disabled="assignmentActionState.active" @click="confirmBriefing(currentAssignment.id)">Registrar llegada</button>
          <button v-else-if="currentAssignment.canMarkCabinReady" class="primary-action action-button" type="button" :disabled="assignmentActionState.active" @click="markCabinReady(currentAssignment.id)">Continuar al checklist</button>
        </div>
      </article>

      <article v-else-if="currentFlightStep?.id === 'checklist' && currentAssignment" class="surface inner-card crew-step-card">
        <span class="eyebrow">Paso 3 · Checklist</span>
        <h3>Checklist operativo</h3>
        <div v-if="flightChecklistGroups.length" class="crew-checklist-layout">
          <section class="crew-checklist-master">
            <div class="crew-checklist-progress">
              <div>
                <strong>{{ flightChecklistSummary.resolved }} de {{ flightChecklistSummary.total }} completados</strong>
                <small>{{ checklistProgressPercent }}%</small>
              </div>
              <div class="crew-checklist-progress__bar" aria-hidden="true">
                <span :style="{ width: `${checklistProgressPercent}%` }"></span>
              </div>
            </div>

            <div class="crew-checklist-groups">
              <article v-for="group in flightChecklistGroups" :key="group.id" class="crew-checklist-group">
                <button type="button" class="crew-checklist-group__header" @click="toggleChecklistGroup(group.id)">
                  <div>
                    <strong>{{ group.type }}</strong>
                    <small>{{ group.resolvedCount }}/{{ group.items.length }}</small>
                  </div>
                  <span class="crew-checklist-group__status">
                    <span v-if="group.resolvedCount === group.items.length">✓</span>
                    <span>{{ checklistCollapsedGroups[group.id] ? '˅' : '˄' }}</span>
                  </span>
                </button>

                <div v-if="!checklistCollapsedGroups[group.id]" class="crew-checklist-items">
                  <button
                    v-for="item in group.items"
                    :key="item.id"
                    type="button"
                    class="crew-checklist-item"
                    :data-state="item.status.toLowerCase().replace(/\s+/g, '-')"
                    :data-selected="selectedChecklistItem?.id === item.id"
                    @click="selectChecklistItem(item)"
                  >
                    <div class="crew-checklist-item__main">
                      <span class="crew-checklist-item__indicator" aria-hidden="true">
                        {{ item.status === 'Correcto' ? '✓' : item.status === 'Falla reportada' ? '⚠' : selectedChecklistItem?.id === item.id ? '●' : '○' }}
                      </span>
                      <div>
                        <strong>{{ item.title }}</strong>
                        <small>{{ item.status }}</small>
                      </div>
                    </div>
                    <span class="crew-checklist-item__arrow" aria-hidden="true">›</span>
                  </button>
                </div>
              </article>
            </div>

            <div class="crew-checklist-footer">
              <strong v-if="flightChecklistSummary.pending">Faltan {{ flightChecklistSummary.pending }} elementos</strong>
              <strong v-else>Checklist completado ✓</strong>
              <button
                class="primary-action action-button"
                type="button"
                :disabled="flightChecklistSummary.pending > 0"
                @click="openFlightStep('evidences')"
              >
                {{ flightChecklistSummary.pending > 0 ? 'Continuar checklist' : 'Continuar a evidencias' }}
              </button>
            </div>
          </section>

          <aside v-if="selectedChecklistItem" class="crew-checklist-detail">
            <div class="crew-checklist-detail__head">
              <span class="eyebrow">{{ selectedChecklistItem.groupLabel }}</span>
              <h4>{{ selectedChecklistItem.title }}</h4>
              <p class="muted">¿Todo está correcto?</p>
            </div>

            <div class="crew-checklist-detail__actions">
              <button class="primary-action action-button" type="button" :disabled="assignmentActionState.active || checklistFailureSubmitting" @click="markChecklistItem('completed')">✓ Correcto</button>
              <button class="ghost-button action-button" type="button" :disabled="assignmentActionState.active || checklistFailureSubmitting" @click="markChecklistItem('not_applicable')">— No aplica</button>
              <button class="secondary-action action-button" type="button" :disabled="assignmentActionState.active || checklistFailureSubmitting" @click="checklistFailureFormOpen = true">⚠ Reportar falla</button>
            </div>

            <div class="crew-checklist-failure" :data-open="checklistFailureFormOpen || selectedChecklistItem.status === 'Falla reportada'">
              <label>
                <span>Describe el problema</span>
                <textarea v-model="checklistFailureDraft.description" rows="4" maxlength="500" placeholder="Describe el problema"></textarea>
              </label>
              <small>{{ checklistFailureDraft.description.length }}/500</small>
              <label class="crew-checklist-failure__upload">
                <span>Agregar foto</span>
                <input type="file" accept="image/*" multiple @change="updateChecklistFailureFiles($event.target.files)" />
              </label>
              <div v-if="checklistFailureDraft.previews.length" class="crew-checklist-failure__previews">
                <article v-for="(preview, index) in checklistFailureDraft.previews" :key="preview" class="crew-checklist-failure__preview">
                  <img :src="preview" alt="Vista previa de evidencia del checklist" />
                  <button type="button" class="ghost-button action-button" @click="removeChecklistFailureFile(index)">Eliminar</button>
                </article>
              </div>
              <button
                class="secondary-action action-button"
                type="button"
                :disabled="assignmentActionState.active || checklistFailureSubmitting || !checklistFailureDraft.description.trim()"
                @click="submitChecklistFailureReport"
              >
                {{ checklistFailureSubmitting ? 'Guardando...' : 'Guardar reporte' }}
              </button>
            </div>
          </aside>
        </div>
        <p v-else class="muted">No hay checklist detallado cargado para esta operacion.</p>
      </article>

      <article v-else-if="currentFlightStep?.id === 'evidences' && currentFlightSummary" class="surface inner-card crew-step-card">
        <span class="eyebrow">Paso 4</span>
        <h3>Evidencias del vuelo</h3>
        <div class="crew-evidence-grid">
          <article v-for="item in flightEvidenceItems" :key="item.id" class="crew-evidence-card">
            <div>
              <strong>{{ item.label }}</strong>
              <p class="muted">{{ item.detail }}</p>
            </div>
            <div class="crew-evidence-card__side">
              <span class="badge">{{ item.status }}</span>
              <small v-if="item.meta">{{ item.meta }}</small>
              <button class="ghost-button action-button" type="button" @click="flightIncidentOpen = true">{{ item.status === 'Evidencia cargada' ? 'Reemplazar foto' : 'Tomar o subir foto' }}</button>
            </div>
          </article>
        </div>
      </article>

      <article v-else-if="currentFlightStep?.id === 'tracking' && currentFlightSummary" class="surface inner-card crew-step-card">
        <span class="eyebrow">Paso 5 · Seguimiento</span>
        <h3>Progreso de la operación</h3>
        <div class="crew-tracking-progress">
          <div>
            <strong>{{ flightTrackingSummary.completed }} de {{ flightTrackingSummary.total }} eventos registrados</strong>
            <small>{{ trackingProgressPercent }}%</small>
          </div>
          <div class="crew-tracking-progress__bar" aria-hidden="true">
            <span :style="{ width: `${trackingProgressPercent}%` }"></span>
          </div>
        </div>

        <section v-if="currentTrackingMilestone" class="crew-tracking-next">
          <div>
            <span class="eyebrow">Siguiente acción</span>
            <h4>{{ currentTrackingMilestone.label }}</h4>
            <p class="muted">{{ currentTrackingMilestone.detail }}</p>
          </div>
          <div class="crew-tracking-next__actions">
            <button
              v-if="currentTrackingMilestone.action && currentTrackingMilestone.actionLabel"
              class="primary-action action-button"
              type="button"
              :disabled="assignmentActionState.active"
              @click="currentTrackingMilestone.action?.()"
            >
              {{ currentTrackingMilestone.actionLabel }}
            </button>
            <button class="ghost-button action-button" type="button" @click="flightIncidentOpen = true">
              Reportar incidencia
            </button>
          </div>
        </section>

        <div class="crew-tracking-layout">
          <div class="crew-tracking-list">
            <button
              v-for="item in flightTrackingMilestones"
              :key="item.id"
              type="button"
              class="crew-tracking-item"
              :data-state="item.state"
              :data-selected="selectedTrackingMilestone?.id === item.id"
              @click="selectedTrackingMilestoneId = item.id"
            >
              <span class="crew-tracking-item__marker" aria-hidden="true">
                {{ item.state === 'completed' ? '✓' : item.state === 'current' ? '●' : item.state === 'incident' ? '⚠' : '○' }}
              </span>
              <div class="crew-tracking-item__body">
                <strong>{{ item.label }}</strong>
                <small v-if="item.meta">{{ item.meta }}</small>
                <small v-else>{{ item.state === 'current' ? 'Siguiente acción' : item.state === 'incident' ? 'Con incidencia asociada' : 'Pendiente' }}</small>
              </div>
            </button>
          </div>

          <aside v-if="selectedTrackingMilestone" class="crew-tracking-detail">
            <span class="eyebrow">Detalle</span>
            <h4>{{ selectedTrackingMilestone.label }}</h4>
            <p class="muted">{{ selectedTrackingMilestone.detail }}</p>
            <dl class="crew-tracking-detail__meta">
              <div>
                <dt>Estado</dt>
                <dd>{{ selectedTrackingMilestone.state === 'completed' ? 'Registrado' : selectedTrackingMilestone.state === 'current' ? 'Siguiente acción' : selectedTrackingMilestone.state === 'incident' ? 'Con incidencia' : 'Pendiente' }}</dd>
              </div>
              <div>
                <dt>Registrado</dt>
                <dd>{{ selectedTrackingMilestone.timestamp ? formatCrewDateTime(selectedTrackingMilestone.timestamp.slice(0, 10), selectedTrackingMilestone.timestamp.slice(11, 16)) : 'Aún sin registro' }}</dd>
              </div>
              <div>
                <dt>Registrado por</dt>
                <dd>{{ selectedTrackingMilestone.timestamp ? selectedTrackingMilestone.actor : 'Pendiente' }}</dd>
              </div>
            </dl>
            <button
              v-if="selectedTrackingMilestone.action && selectedTrackingMilestone.actionLabel"
              class="primary-action action-button"
              type="button"
              :disabled="assignmentActionState.active"
              @click="selectedTrackingMilestone.action?.()"
            >
              {{ selectedTrackingMilestone.actionLabel }}
            </button>
            <button v-else class="ghost-button action-button" type="button" @click="flightIncidentOpen = true">
              Reportar incidencia
            </button>
            <p v-if="selectedTrackingMilestone.timestamp" class="muted">
              La corrección de este registro se gestiona con Admin / Red Sky.
            </p>
          </aside>
        </div>
      </article>

      <article v-else-if="currentFlightStep?.id === 'closure' && currentAssignment" class="surface inner-card crew-step-card">
        <span class="eyebrow">Paso 6</span>
        <h3>Cierre de operacion</h3>
        <div class="crew-close-summary">
          <article class="crew-close-item" :data-done="Boolean(currentAssignment.assignmentConfirmed)">Vuelo confirmado</article>
          <article class="crew-close-item" :data-done="preparationCompleted">Preparacion completa</article>
          <article class="crew-close-item" :data-done="flightChecklistSummary.total ? flightChecklistSummary.pending === 0 : false">Checklist {{ flightChecklistSummary.resolved }}/{{ flightChecklistSummary.total || 0 }}</article>
          <article class="crew-close-item" :data-done="flightEvidenceSummary.completed >= flightEvidenceSummary.total">Evidencias {{ flightEvidenceSummary.completed }}/{{ flightEvidenceSummary.total }}</article>
          <article class="crew-close-item" :data-done="trackingCompleted">Seguimiento completo</article>
        </div>
        <div v-if="currentAssignment.workflowStatus === 'report_pending'" class="crew-close-form">
          <label>
            <span>Comentario final</span>
            <textarea v-model="assignmentResponseForm.comment" rows="3" placeholder="Comentario final opcional"></textarea>
          </label>
          <button class="primary-action action-button" type="button" :disabled="assignmentActionState.active" @click="submitCrewReport({ assignmentId: currentAssignment.id, report: { general_notes: assignmentResponseForm.comment || 'Cierre operativo desde Mi vuelo.' } })">Finalizar operacion</button>
        </div>
      </article>

      <article v-if="flightIncidentOpen" class="surface inner-card crew-step-card">
        <div class="section-head">
          <div>
            <span class="eyebrow">Incidencias</span>
            <h3>Reportar incidencia</h3>
          </div>
          <button class="ghost-button action-button" type="button" @click="flightIncidentOpen = false">Cerrar</button>
        </div>
        <div class="form-grid">
          <label>
            <span>Categoria</span>
            <select v-model="incidentForm.type">
              <option disabled value="">Selecciona</option>
              <option v-for="item in incidentTypes" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>
          <label>
            <span>Prioridad</span>
            <select v-model="incidentForm.priority">
              <option disabled value="">Selecciona</option>
              <option v-for="item in incidentPriorities" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>
          <label>
            <span>Fase</span>
            <select v-model="incidentForm.phase">
              <option>Pre-vuelo</option>
              <option>Abordaje</option>
              <option>En vuelo</option>
              <option>Post-vuelo</option>
            </select>
          </label>
          <label>
            <span>Evidencia</span>
            <input type="file" multiple @change="updateField('incident', 'files', $event.target.files)" />
          </label>
          <label class="span-2">
            <span>Descripcion</span>
            <textarea v-model="incidentForm.description" rows="4" placeholder="Describe lo sucedido"></textarea>
          </label>
        </div>
        <div class="action-row">
          <button class="primary-action action-button" type="button" :disabled="incidentSubmissionInFlight" @click="createIncident">{{ incidentSubmissionInFlight ? 'Enviando...' : 'Enviar incidencia' }}</button>
        </div>
      </article>
    </section>

    <section v-else-if="canonicalCrewSection === 'perfil'" class="crew-account-page">
      <div class="documents-layout">
        <section class="surface inner-card">
          <div class="section-head">
            <div>
              <span class="eyebrow">Cuenta</span>
              <h4>{{ crewMemberName || 'Informacion personal' }}</h4>
              <p class="muted">Datos personales y de contacto para mantener tu expediente operativo al dia.</p>
            </div>
            <button class="primary-action action-button" type="button" @click="saveProfile">Guardar perfil</button>
          </div>
          <div class="form-grid">
            <label><span>Nombre</span><input v-model="profileForm.name" type="text" /></label>
            <label><span>Telefono</span><input v-model="profileForm.phone" type="text" /></label>
            <label><span>Correo</span><input v-model="profileForm.email" type="email" /></label>
            <label><span>Base operativa</span><input v-model="profileForm.base" type="text" /></label>
            <label class="span-2"><span>Fotografia</span><input v-model="profileForm.photo" type="text" placeholder="URL o referencia de foto" /></label>
          </div>
        </section>

        <section class="surface inner-card">
          <div class="section-head">
            <div>
              <span class="eyebrow">Mis documentos</span>
              <h4>Vigencias y revision</h4>
              <p class="muted">Consulta licencias, identificaciones y vencimientos sin salir de esta misma vista.</p>
            </div>
            <button class="primary-action action-button" type="button" @click="addDocument">Subir documento</button>
          </div>
          <div class="form-grid">
            <label><span>Nombre</span><input v-model="documentForm.name" type="text" /></label>
            <label>
              <span>Categoria</span>
              <select v-model="documentForm.category">
                <option>Licencia</option>
                <option>Identificacion</option>
                <option>Pasaporte</option>
                <option>Visa</option>
                <option>Otro</option>
              </select>
            </label>
            <label><span>Vencimiento</span><input v-model="documentForm.expiresAt" type="date" /></label>
            <label class="span-2"><span>Nota</span><textarea v-model="documentForm.note" rows="3"></textarea></label>
          </div>
          <div class="record-list">
            <article v-for="item in documentItems" :key="item.id" class="record-card">
              <div>
                <strong>{{ item.name }}</strong>
                <p>{{ item.category }} · {{ item.state }}</p>
                <small>Vence: {{ item.expiresAt }}</small>
                <small>{{ item.note }}</small>
              </div>
              <select :value="item.state" @change="updateDocumentState(item.id, $event.target.value)">
                <option>Pendiente</option>
                <option>En revision</option>
                <option>Aprobado</option>
                <option>Rechazado</option>
              </select>
            </article>
          </div>
        </section>

        <section class="surface inner-card">
          <div class="section-head">
            <div>
              <span class="eyebrow">Historial de vuelos</span>
              <h4>Solo lectura</h4>
              <p class="muted">Resumen operativo reciente para consultar movimientos, estados y comentarios registrados.</p>
            </div>
          </div>
          <div class="record-list">
            <article v-for="item in historyEntries" :key="item.id" class="record-card">
              <div>
                <strong>{{ item.flight }}</strong>
                <p>{{ item.status }}</p>
                <small>{{ item.date }}</small>
                <small>{{ item.comment }}</small>
              </div>
            </article>
          </div>
        </section>

        <section class="surface inner-card">
          <div class="section-head">
            <div>
              <span class="eyebrow">Configuracion</span>
              <h4>Notificaciones y seguridad</h4>
              <p class="muted">Preferencias basicas para avisos, cobertura personal y escalamiento operativo.</p>
            </div>
            <button class="primary-action action-button" type="button" @click="saveConfig">Guardar configuracion</button>
          </div>
          <div class="toggle-list">
            <label class="toggle-row">
              <div>
                <strong>Notificar nuevas asignaciones</strong>
                <small>Recepcion inmediata de nuevas misiones coordinadas por Admin / Red Sky.</small>
              </div>
              <input v-model="configForm.notifyAssignments" type="checkbox" />
            </label>
            <label class="toggle-row">
              <div>
                <strong>Notificar incidencias</strong>
                <small>Alertas cuando Admin actualice incidencias o coordinacion operativa.</small>
              </div>
              <input v-model="configForm.notifyIncidents" type="checkbox" />
            </label>
            <label class="toggle-row">
              <div>
                <strong>Cambios de agenda</strong>
                <small>Actualizaciones de briefing, horario o aeronave.</small>
              </div>
              <input v-model="configForm.notifyScheduleChanges" type="checkbox" />
            </label>
          </div>
          <div class="form-grid config-grid">
            <label><span>Cobertura personal</span><input v-model="configForm.personalCoverage" type="text" /></label>
            <label>
              <span>Modo de escalamiento</span>
              <select v-model="configForm.escalationMode">
                <option>Admin primero</option>
                <option>Admin y operador</option>
                <option>Solo admin en criticas</option>
              </select>
            </label>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>

<style scoped>
.crew-portal-page,
.section-stack,
.availability-layout,
.documents-layout,
.record-list,
.toggle-list,
.crew-loading-view,
.crew-loading-grid,
.crew-loading-form-grid,
.crew-loading-toggle-list {
  display: grid;
  gap: 1.5rem;
}

.crew-home,
.crew-flight-workspace,
.crew-account-page,
.crew-progress-list,
.crew-stepper,
.crew-check-grid,
.crew-checklist-groups,
.crew-checklist-items,
.crew-tracking-list,
.crew-close-summary,
.crew-evidence-grid {
  display: grid;
  gap: 1.25rem;
}

.crew-home-hero,
.crew-next-flight-card,
.crew-progress-card,
.crew-flight-hero,
.crew-flight-summary,
.crew-action-banner,
.crew-step-card {
  padding: 1.5rem;
}

.crew-home-hero,
.crew-flight-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.crew-home-copy,
.crew-home-status,
.crew-flight-hero__actions,
.crew-evidence-card__side,
.crew-checklist-item__side {
  display: grid;
  gap: 0.75rem;
}

.crew-home-status {
  justify-items: end;
  text-align: right;
}

.crew-home h2,
.crew-flight-workspace h3,
.crew-account-page h3 {
  margin: 0;
}

.crew-fact-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
}

.crew-fact-card,
.crew-progress-step,
.crew-stepper-item,
.crew-check-item,
.crew-evidence-card,
.crew-tracking-item,
.crew-close-item,
.crew-checklist-group,
.crew-checklist-item {
  border: 1px solid var(--crew-line);
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 251, 252, 0.95));
}

.crew-fact-card {
  display: grid;
  gap: 0.3rem;
  padding: 1rem;
}

.crew-fact-card span,
.crew-check-item small,
.crew-stepper-item span,
.crew-progress-step small,
.crew-close-item,
.crew-checklist-item small {
  color: var(--crew-muted);
}

.crew-fact-card strong,
.crew-progress-step strong,
.crew-stepper-item strong,
.crew-check-item strong,
.crew-evidence-card strong,
.crew-tracking-item strong,
.crew-checklist-item strong {
  color: var(--crew-ink);
}

.crew-fact-card--wide {
  grid-column: span 2;
}

.crew-progress-step {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 1rem 1.1rem;
}

.crew-progress-dot {
  width: 0.85rem;
  height: 0.85rem;
  border-radius: 999px;
  background: #d0d7de;
  flex: 0 0 auto;
}

.crew-progress-step[data-state='completado'] .crew-progress-dot,
.crew-stepper-item[data-state='completado'] {
  background: rgba(16, 163, 127, 0.12);
}

.crew-progress-step[data-state='actual'] .crew-progress-dot {
  background: #d6a84b;
}

.crew-progress-step[data-state='bloqueado'] .crew-progress-dot {
  background: #cbd5e1;
}

.crew-stepper {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.crew-stepper-item {
  display: grid;
  gap: 0.35rem;
  padding: 1rem;
  width: 100%;
  text-align: left;
  appearance: none;
  cursor: pointer;
}

.crew-stepper-item[data-state='completado'] {
  border-color: rgba(16, 163, 127, 0.18);
}

.crew-stepper-item[data-state='actual'] {
  border-color: rgba(214, 168, 75, 0.3);
  background: linear-gradient(180deg, #fff8eb, #fcf5e2);
}

.crew-stepper-item[data-selected='true'] {
  box-shadow: 0 0 0 2px rgba(16, 163, 127, 0.16);
}

.crew-stepper-item:disabled {
  cursor: not-allowed;
  opacity: 0.68;
}

.crew-action-banner__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.crew-check-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.crew-check-item {
  display: grid;
  gap: 0.35rem;
  padding: 1rem;
}

.crew-check-item[data-done='true'] {
  border-color: rgba(16, 163, 127, 0.18);
  background: linear-gradient(180deg, #f3fbf8, #edf8f4);
}

.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.crew-checklist-group,
.crew-step-card,
.crew-action-banner {
  padding: 1.25rem;
}

.crew-checklist-item,
.crew-evidence-card,
.crew-tracking-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
}

.crew-checklist-item__side,
.crew-evidence-card__side {
  min-width: min(18rem, 100%);
}

.crew-checklist-item textarea,
.crew-close-form textarea {
  width: 100%;
}

.crew-checklist-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
  gap: 1rem;
  align-items: start;
}

.crew-checklist-master,
.crew-checklist-detail {
  display: grid;
  gap: 1rem;
}

.crew-checklist-progress {
  display: grid;
  gap: 0.6rem;
  padding: 1rem;
  border: 1px solid var(--crew-line);
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 251, 252, 0.95));
}

.crew-checklist-progress > div:first-child {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.crew-checklist-progress__bar {
  width: 100%;
  height: 0.8rem;
  border-radius: 999px;
  background: rgba(203, 213, 225, 0.45);
  overflow: hidden;
}

.crew-checklist-progress__bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #10a37f, #6fd2b8);
  transition: width 180ms ease;
}

.crew-checklist-group {
  padding: 0.9rem;
}

.crew-checklist-group__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.crew-checklist-group__header strong,
.crew-checklist-group__header small,
.crew-checklist-group__status {
  color: var(--crew-ink);
}

.crew-checklist-group__header > div {
  display: grid;
  gap: 0.2rem;
}

.crew-checklist-group__status {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 800;
}

.crew-checklist-items {
  gap: 0.65rem;
  margin-top: 0.85rem;
}

.crew-checklist-item {
  align-items: center;
  width: 100%;
  border-radius: 18px;
  text-align: left;
  appearance: none;
  cursor: pointer;
}

.crew-checklist-item[data-selected='true'] {
  border-color: rgba(214, 168, 75, 0.32);
  background: linear-gradient(180deg, rgba(255, 248, 235, 0.95), rgba(252, 245, 226, 0.95));
}

.crew-checklist-item[data-state='correcto'] .crew-checklist-item__indicator {
  color: #15966f;
}

.crew-checklist-item[data-state='falla-reportada'] .crew-checklist-item__indicator {
  color: #d14343;
}

.crew-checklist-item[data-state='pendiente'] .crew-checklist-item__indicator {
  color: #94a3b8;
}

.crew-checklist-item__main {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.crew-checklist-item__indicator {
  flex: 0 0 auto;
  width: 1.2rem;
  text-align: center;
  font-size: 1rem;
  font-weight: 900;
}

.crew-checklist-item__main > div {
  display: grid;
  gap: 0.14rem;
}

.crew-checklist-item__arrow {
  color: rgba(17, 17, 17, 0.5);
  font-size: 1.2rem;
  font-weight: 700;
}

.crew-checklist-detail {
  position: sticky;
  top: 1rem;
  padding: 1rem;
  border: 1px solid rgba(214, 168, 75, 0.2);
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(252, 248, 240, 0.96));
  box-shadow: var(--crew-shadow-soft);
}

.crew-checklist-detail__head,
.crew-checklist-detail__actions,
.crew-checklist-failure {
  display: grid;
  gap: 0.85rem;
}

.crew-checklist-detail__head h4 {
  margin: 0;
  color: var(--crew-ink);
  font-size: clamp(1.35rem, 2vw, 1.7rem);
}

.crew-checklist-failure {
  padding-top: 0.9rem;
  border-top: 1px solid rgba(15, 20, 25, 0.08);
}

.crew-checklist-failure[data-open='false'] {
  display: none;
}

.crew-checklist-failure__upload {
  display: grid;
  gap: 0.5rem;
}

.crew-checklist-failure__upload input {
  padding: 0.7rem 0.9rem;
}

.crew-checklist-failure__previews {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.crew-checklist-failure__preview {
  display: grid;
  gap: 0.6rem;
  padding: 0.75rem;
  border: 1px solid var(--crew-line);
  border-radius: 18px;
  background: #ffffff;
}

.crew-checklist-failure__preview img {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 14px;
  object-fit: cover;
}

.crew-checklist-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid var(--crew-line);
  border-radius: 20px;
  background: #ffffff;
}

.crew-tracking-progress,
.crew-tracking-next,
.crew-tracking-detail {
  display: grid;
  gap: 0.85rem;
  padding: 1rem;
  border: 1px solid var(--crew-line);
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 251, 252, 0.95));
}

.crew-tracking-progress > div:first-child {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.crew-tracking-progress__bar {
  width: 100%;
  height: 0.8rem;
  border-radius: 999px;
  background: rgba(203, 213, 225, 0.45);
  overflow: hidden;
}

.crew-tracking-progress__bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #10a37f, #6fd2b8);
  transition: width 180ms ease;
}

.crew-tracking-next {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
}

.crew-tracking-next h4,
.crew-tracking-detail h4 {
  margin: 0;
  color: var(--crew-ink);
  font-size: clamp(1.2rem, 2vw, 1.5rem);
}

.crew-tracking-next__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.75rem;
}

.crew-tracking-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 0.9fr);
  gap: 1rem;
  align-items: start;
}

.crew-tracking-list {
  gap: 0.75rem;
}

.crew-tracking-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 0.85rem;
  width: 100%;
  padding: 0.95rem 1rem;
  text-align: left;
  appearance: none;
  cursor: pointer;
}

.crew-tracking-item[data-selected='true'] {
  border-color: rgba(214, 168, 75, 0.3);
  background: linear-gradient(180deg, rgba(255, 248, 235, 0.95), rgba(252, 245, 226, 0.95));
}

.crew-tracking-item[data-state='completed'] {
  border-color: rgba(16, 163, 127, 0.18);
  background: linear-gradient(180deg, #f3fbf8, #edf8f4);
}

.crew-tracking-item[data-state='current'] {
  border-color: rgba(214, 168, 75, 0.28);
  background: linear-gradient(180deg, #fff8eb, #fcf5e2);
}

.crew-tracking-item[data-state='incident'] {
  border-color: rgba(209, 67, 67, 0.24);
  background: linear-gradient(180deg, rgba(255, 244, 244, 0.98), rgba(252, 235, 235, 0.96));
}

.crew-tracking-item__marker {
  width: 1.1rem;
  text-align: center;
  font-size: 1rem;
  font-weight: 900;
}

.crew-tracking-item[data-state='completed'] .crew-tracking-item__marker {
  color: #15966f;
}

.crew-tracking-item[data-state='current'] .crew-tracking-item__marker {
  color: #d6a84b;
}

.crew-tracking-item[data-state='incident'] .crew-tracking-item__marker {
  color: #d14343;
}

.crew-tracking-item[data-state='pending'] .crew-tracking-item__marker {
  color: #94a3b8;
}

.crew-tracking-item__body {
  display: grid;
  gap: 0.18rem;
}

.crew-tracking-detail {
  position: sticky;
  top: 1rem;
}

.crew-tracking-detail__meta {
  display: grid;
  gap: 0.75rem;
  margin: 0;
}

.crew-tracking-detail__meta div {
  display: grid;
  gap: 0.18rem;
}

.crew-tracking-detail__meta dt {
  color: var(--crew-muted);
  font-size: 0.82rem;
  font-weight: 700;
}

.crew-tracking-detail__meta dd {
  margin: 0;
  color: var(--crew-ink);
  font-weight: 700;
}

.crew-evidence-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.crew-close-item[data-done='true'] {
  border-color: rgba(16, 163, 127, 0.18);
  background: linear-gradient(180deg, #f3fbf8, #edf8f4);
}

.crew-close-summary {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.crew-close-item {
  padding: 1rem;
  font-weight: 800;
  color: #111111;
}

.crew-close-form {
  display: grid;
  gap: 1rem;
  max-width: 36rem;
}

.crew-portal-page {
  --crew-bg: #f3f6f8;
  --crew-surface: rgba(255, 255, 255, 0.96);
  --crew-surface-strong: #ffffff;
  --crew-ink: #111111;
  --crew-muted: #111111;
  --crew-line: rgba(15, 20, 25, 0.08);
  --crew-line-strong: rgba(15, 20, 25, 0.14);
  --crew-accent: #10a37f;
  --crew-accent-deep: #0b7a60;
  --crew-accent-soft: rgba(16, 163, 127, 0.1);
  --crew-chip: #eef6f3;
  --crew-dark: #0d1117;
  --crew-dark-2: #1a232d;
  --crew-shadow: 0 24px 60px rgba(11, 18, 24, 0.08);
  --crew-shadow-soft: 0 16px 36px rgba(11, 18, 24, 0.06);
  padding: 0 0 2rem;
  background:
    radial-gradient(circle at top right, rgba(16, 163, 127, 0.07), transparent 20%),
    linear-gradient(180deg, #f7fafb 0%, #f1f5f7 100%);
}

.crew-portal-page :deep(.surface) {
  border: 1px solid var(--crew-line);
  border-radius: 26px;
  background: var(--crew-surface);
  box-shadow: var(--crew-shadow-soft);
  backdrop-filter: blur(12px);
}

.crew-portal-page :deep(.eyebrow) {
  margin: 0 0 0.3rem;
  color: var(--crew-accent-deep);
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.crew-portal-page :deep(.muted) {
  color: var(--crew-muted);
}

.crew-portal-page :deep(p),
.crew-portal-page :deep(label),
.crew-portal-page :deep(span),
.crew-portal-page :deep(small),
.crew-portal-page :deep(li) {
  color: var(--crew-ink);
}

.crew-portal-page :deep(input),
.crew-portal-page :deep(select),
.crew-portal-page :deep(textarea),
.crew-portal-page :deep(input::placeholder),
.crew-portal-page :deep(textarea::placeholder) {
  color: var(--crew-ink);
}

.crew-portal-page :deep(.badge) {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  width: fit-content;
  padding: 0 0.82rem;
  border: 1px solid rgba(16, 163, 127, 0.14);
  border-radius: 999px;
  color: var(--crew-accent-deep);
  background: var(--crew-accent-soft);
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.crew-portal-page :deep(.primary-action),
.crew-portal-page :deep(.ghost-button),
.crew-portal-page :deep(.secondary-action) {
  min-height: 3rem;
  border-radius: 16px;
  padding: 0.82rem 1.18rem;
  font-weight: 800;
  letter-spacing: 0.01em;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    border-color 180ms ease,
    background 180ms ease,
    color 180ms ease;
}

.crew-portal-page :deep(.primary-action) {
  color: #111111;
  border: 1px solid rgba(15, 127, 115, 0.22);
  background: linear-gradient(180deg, #dff5ef, #cdeee6);
  box-shadow:
    0 14px 26px rgba(15, 127, 115, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.82);
}

.crew-portal-page :deep(.primary-action:hover) {
  transform: translateY(-1px);
  border-color: rgba(15, 127, 115, 0.34);
  background: linear-gradient(180deg, #e8faf5, #d8f3ec);
  box-shadow:
    0 18px 30px rgba(15, 127, 115, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.88);
}

.crew-portal-page :deep(.ghost-button),
.crew-portal-page :deep(.secondary-action) {
  color: #111111;
  border: 1px solid rgba(20, 33, 43, 0.12);
  background: linear-gradient(180deg, #ffffff, #f5f8f9);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.88),
    0 8px 18px rgba(11, 18, 24, 0.04);
}

.crew-portal-page :deep(.secondary-action) {
  border-color: rgba(211, 169, 74, 0.22);
  background: linear-gradient(180deg, #fff8eb, #f8efd8);
}

.crew-portal-page :deep(.ghost-button:hover),
.crew-portal-page :deep(.secondary-action:hover) {
  transform: translateY(-1px);
  color: #111111;
  border-color: rgba(20, 33, 43, 0.18);
  box-shadow: 0 14px 28px rgba(11, 18, 24, 0.08);
}

.crew-portal-page :deep(.secondary-action:hover) {
  border-color: rgba(211, 169, 74, 0.3);
  background: linear-gradient(180deg, #fffaf0, #fbf2dd);
}

.crew-portal-page :deep(.primary-action:disabled),
.crew-portal-page :deep(.ghost-button:disabled),
.crew-portal-page :deep(.secondary-action:disabled) {
  color: rgba(17, 17, 17, 0.52);
  border-color: rgba(148, 163, 184, 0.2);
  background: linear-gradient(180deg, #f3f6f7, #eef2f4);
  box-shadow: none;
}

.crew-portal-page :deep(input),
.crew-portal-page :deep(select),
.crew-portal-page :deep(textarea) {
  min-height: 3.15rem;
  border: 1px solid var(--crew-line);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--crew-ink);
  padding: 0 1rem;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.crew-portal-page :deep(textarea) {
  padding: 0.95rem 1rem;
}

.crew-portal-page :deep(input:focus),
.crew-portal-page :deep(select:focus),
.crew-portal-page :deep(textarea:focus) {
  outline: none;
  border-color: rgba(16, 163, 127, 0.32);
  box-shadow:
    0 0 0 4px rgba(16, 163, 127, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.75);
}

.crew-loading-scene {
  position: fixed;
  inset: 0;
  z-index: 140;
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: 1.5rem;
  overflow: hidden;
  border-radius: 0;
  isolation: isolate;
}

.crew-loading-scene__backdrop,
.crew-loading-scene__glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.crew-loading-scene__backdrop {
  background:
    linear-gradient(180deg, rgba(248, 246, 240, 0.82), rgba(242, 239, 232, 0.86));
  backdrop-filter: blur(18px) saturate(112%);
}

.crew-loading-scene__blur {
  position: absolute;
  border-radius: 999px;
  filter: blur(48px);
  opacity: 0.8;
}

.crew-loading-scene__blur--left {
  left: 4%;
  top: 14%;
  width: 20rem;
  height: 26rem;
  background: rgba(129, 141, 168, 0.18);
}

.crew-loading-scene__blur--center {
  top: -6%;
  left: 50%;
  width: min(54vw, 44rem);
  height: min(54vw, 44rem);
  transform: translateX(-50%);
  background: radial-gradient(circle, rgba(233, 198, 111, 0.32), rgba(233, 198, 111, 0.04) 66%, transparent 76%);
}

.crew-loading-scene__blur--right {
  right: 5%;
  top: 14%;
  width: 18rem;
  height: 18rem;
  background: rgba(173, 180, 191, 0.16);
}

.crew-loading-scene__card {
  position: relative;
  z-index: 1;
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 1rem;
  width: min(100%, 42rem);
  min-height: 25rem;
  padding: 2.9rem 2rem 2.6rem;
  border: 1px solid rgba(216, 196, 154, 0.9);
  border-radius: 34px;
  background: linear-gradient(180deg, rgba(255, 252, 245, 0.98), rgba(248, 243, 232, 0.98));
  box-shadow:
    0 42px 90px rgba(41, 34, 21, 0.12),
    0 18px 40px rgba(150, 124, 72, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.85);
  text-align: center;
  overflow: hidden;
}

.crew-loading-scene__glow {
  inset: auto 50% 100%;
  width: 70%;
  height: 12rem;
  transform: translateX(-50%);
  background: radial-gradient(circle, rgba(239, 205, 129, 0.42), transparent 72%);
  filter: blur(24px);
}

.crew-loading-scene__spinner-shell {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 6.3rem;
  height: 6.3rem;
  margin: 0;
  border-radius: 999px;
  border: 1px solid rgba(229, 212, 176, 0.95);
  background: linear-gradient(180deg, rgba(255, 250, 239, 0.96), rgba(243, 229, 190, 0.96));
  box-shadow:
    0 12px 30px rgba(205, 171, 87, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.88);
}

.crew-loading-scene__spinner-shell::before {
  content: '';
  position: absolute;
  inset: 0.28rem;
  border-radius: inherit;
  border: 1px solid rgba(255, 255, 255, 0.68);
}

.crew-loading-scene__spinner {
  position: relative;
  width: 2.9rem;
  height: 2.9rem;
}

.crew-loading-scene__spinner span {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 0.5rem;
  height: 1rem;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(255, 253, 249, 0.98), rgba(208, 167, 71, 0.24));
  transform-origin: center center;
  animation: crew-loading-spinner-fade 1.15s linear infinite;
}

.crew-loading-scene__spinner span:nth-child(1) { transform: rotate(0deg) translateY(-0.92rem); animation-delay: -1.1s; }
.crew-loading-scene__spinner span:nth-child(2) { transform: rotate(30deg) translateY(-0.92rem); animation-delay: -1s; }
.crew-loading-scene__spinner span:nth-child(3) { transform: rotate(60deg) translateY(-0.92rem); animation-delay: -0.9s; }
.crew-loading-scene__spinner span:nth-child(4) { transform: rotate(90deg) translateY(-0.92rem); animation-delay: -0.8s; }
.crew-loading-scene__spinner span:nth-child(5) { transform: rotate(120deg) translateY(-0.92rem); animation-delay: -0.7s; }
.crew-loading-scene__spinner span:nth-child(6) { transform: rotate(150deg) translateY(-0.92rem); animation-delay: -0.6s; }
.crew-loading-scene__spinner span:nth-child(7) { transform: rotate(180deg) translateY(-0.92rem); animation-delay: -0.5s; }
.crew-loading-scene__spinner span:nth-child(8) { transform: rotate(210deg) translateY(-0.92rem); animation-delay: -0.4s; }
.crew-loading-scene__spinner span:nth-child(9) { transform: rotate(240deg) translateY(-0.92rem); animation-delay: -0.3s; }
.crew-loading-scene__spinner span:nth-child(10) { transform: rotate(270deg) translateY(-0.92rem); animation-delay: -0.2s; }
.crew-loading-scene__spinner span:nth-child(11) { transform: rotate(300deg) translateY(-0.92rem); animation-delay: -0.1s; }
.crew-loading-scene__spinner span:nth-child(12) { transform: rotate(330deg) translateY(-0.92rem); animation-delay: 0s; }

.crew-loading-scene__eyebrow {
  position: relative;
  z-index: 1;
  margin: 0;
  color: #0f7f73;
  font-size: 0.82rem;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.crew-loading-scene h3 {
  position: relative;
  z-index: 1;
  margin: 0;
  color: #161514;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  font-size: clamp(2.2rem, 4vw, 3.35rem);
  line-height: 0.98;
  letter-spacing: -0.06em;
  text-wrap: balance;
}

.crew-loading-scene__copy {
  position: relative;
  z-index: 1;
  max-width: 27rem;
  margin: 0;
  color: #a2adc0;
  font-size: 1rem;
  line-height: 1.55;
  text-wrap: balance;
}

.crew-loading-scene__progress {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.6rem;
  margin-top: 0.15rem;
}

.crew-loading-scene__progress span {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 2.2rem;
  padding: 0 0.9rem;
  border: 1px solid rgba(222, 210, 183, 0.9);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.58);
  color: #b6bea8;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.crew-loading-scene__progress span::before {
  content: '';
  width: 0.42rem;
  height: 0.42rem;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.44;
}

.crew-loading-scene__progress .is-active {
  color: #25211b;
  background: rgba(255, 255, 255, 0.8);
}

.crew-loading-scene[data-tone='operation'] .crew-loading-scene__progress .is-active {
  color: #0f7f73;
  border-color: rgba(15, 127, 115, 0.24);
  background: rgba(248, 255, 252, 0.92);
}

.crew-loading-scene[data-tone='operation'] .crew-loading-scene__backdrop {
  background:
    radial-gradient(circle at 50% 8%, rgba(15, 127, 115, 0.08), transparent 18%),
    linear-gradient(180deg, rgba(245, 250, 248, 0.8), rgba(242, 247, 245, 0.86));
}

.crew-loading-scene[data-tone='operation'] .crew-loading-scene__blur--left {
  background: rgba(149, 179, 173, 0.18);
}

.crew-loading-scene[data-tone='operation'] .crew-loading-scene__blur--center {
  background: radial-gradient(circle, rgba(15, 127, 115, 0.16), rgba(15, 127, 115, 0.03) 62%, transparent 76%);
}

.crew-loading-scene[data-tone='operation'] .crew-loading-scene__blur--right {
  background: rgba(170, 181, 177, 0.15);
}

.crew-loading-scene[data-tone='operation'] .crew-loading-scene__card {
  border-color: rgba(15, 127, 115, 0.2);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(245, 251, 249, 0.98));
  box-shadow:
    0 42px 90px rgba(23, 70, 62, 0.11),
    0 18px 40px rgba(15, 127, 115, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.88);
}

.crew-loading-scene[data-tone='operation'] .crew-loading-scene__glow {
  background: radial-gradient(circle, rgba(15, 127, 115, 0.18), transparent 72%);
}

.crew-loading-scene[data-tone='operation'] .crew-loading-scene__spinner-shell {
  border-color: rgba(15, 127, 115, 0.18);
  background: linear-gradient(180deg, rgba(242, 251, 249, 0.98), rgba(226, 243, 239, 0.98));
  box-shadow:
    0 12px 30px rgba(15, 127, 115, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

.crew-loading-scene[data-tone='operation'] .crew-loading-scene__spinner-shell::before {
  border-color: rgba(255, 255, 255, 0.74);
}

.crew-loading-scene[data-tone='operation'] .crew-loading-scene__spinner span {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(15, 127, 115, 0.22));
}

.crew-loading-scene[data-tone='operation'] h3 {
  color: #101615;
}

.crew-loading-scene[data-tone='operation'] .crew-loading-scene__copy {
  color: #8fa2b7;
}

.crew-loading-scene[data-tone='operation'] .crew-loading-scene__progress span {
  border-color: rgba(15, 127, 115, 0.16);
  background: rgba(255, 255, 255, 0.68);
  color: rgba(15, 127, 115, 0.34);
}

.crew-loading-scene[data-tone='incidents'] .crew-loading-scene__backdrop {
  background:
    linear-gradient(180deg, rgba(111, 118, 132, 0.74), rgba(113, 119, 132, 0.8));
}

.crew-loading-scene[data-tone='incidents'] .crew-loading-scene__blur--left,
.crew-loading-scene[data-tone='incidents'] .crew-loading-scene__blur--right {
  background: rgba(37, 52, 82, 0.34);
}

.crew-loading-scene[data-tone='incidents'] .crew-loading-scene__blur--center {
  background: radial-gradient(circle, rgba(225, 213, 183, 0.16), rgba(225, 213, 183, 0.02) 66%, transparent 76%);
}

.crew-loading-scene[data-tone='incidents'] .crew-loading-scene__card {
  border-color: rgba(39, 49, 74, 0.88);
  background: linear-gradient(180deg, rgba(17, 29, 54, 0.98), rgba(12, 23, 45, 0.985));
  box-shadow:
    0 42px 96px rgba(8, 14, 27, 0.34),
    0 18px 44px rgba(7, 15, 32, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.crew-loading-scene[data-tone='incidents'] .crew-loading-scene__glow {
  background: radial-gradient(circle, rgba(116, 136, 173, 0.18), transparent 72%);
}

.crew-loading-scene[data-tone='incidents'] .crew-loading-scene__spinner-shell {
  border-color: rgba(45, 58, 88, 0.95);
  background: linear-gradient(180deg, rgba(15, 28, 54, 0.94), rgba(10, 21, 42, 0.94));
  box-shadow:
    0 18px 38px rgba(6, 13, 28, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.crew-loading-scene[data-tone='incidents'] .crew-loading-scene__spinner-shell::before {
  border-color: rgba(255, 255, 255, 0.05);
}

.crew-loading-scene[data-tone='incidents'] .crew-loading-scene__spinner span {
  background: linear-gradient(180deg, rgba(255, 249, 236, 0.98), rgba(147, 155, 173, 0.18));
}

.crew-loading-scene[data-tone='incidents'] .crew-loading-scene__eyebrow {
  color: #b88a31;
}

.crew-loading-scene[data-tone='incidents'] h3 {
  color: #fff6ea;
}

.crew-loading-scene[data-tone='incidents'] .crew-loading-scene__copy {
  color: rgba(225, 217, 200, 0.84);
}

.crew-loading-scene[data-tone='incidents'] .crew-loading-scene__progress span {
  border-color: rgba(55, 69, 102, 0.95);
  background: rgba(255, 255, 255, 0.035);
  color: rgba(217, 210, 194, 0.44);
}

.crew-loading-scene[data-tone='incidents'] .crew-loading-scene__progress .is-active {
  color: #fff8eb;
  background: rgba(255, 255, 255, 0.08);
}

.crew-context-hero,
.crew-context-ribbon,
.availability-page,
.documents-page,
.config-page,
.inner-card,
.crew-loading-hero,
.crew-loading-panel,
.crew-loading-card {
  padding: 1.4rem;
}

.crew-loading-hero,
.crew-loading-panel,
.crew-loading-card {
  position: relative;
  overflow: hidden;
}

.crew-loading-hero {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
}

.crew-loading-hero h3 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.04em;
}

.crew-loading-hero p {
  margin: 0.4rem 0 0;
}

.crew-loading-grid--dashboard {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.crew-loading-grid--dashboard-main,
.crew-loading-grid--split {
  grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
}

.crew-loading-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
}

.crew-loading-form-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.crew-loading-toggle-list {
  gap: 1rem;
}

.crew-skeleton {
  position: relative;
  display: block;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(16, 163, 127, 0.08);
}

.crew-skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.74), transparent);
  animation: crew-shimmer 1.5s ease-in-out infinite;
}

.crew-skeleton-line--sm {
  width: 28%;
  height: 0.78rem;
}

.crew-skeleton-line--md {
  width: 52%;
  height: 0.95rem;
}

.crew-skeleton-line--lg {
  width: 72%;
  height: 1.15rem;
}

.crew-skeleton-pill {
  width: 6.8rem;
  height: 2rem;
}

.crew-skeleton-panel {
  min-height: 5rem;
  border-radius: 18px;
}

.crew-skeleton-panel--tall {
  min-height: 7rem;
}

.crew-skeleton-field {
  min-height: 3.15rem;
  border-radius: 16px;
}

.crew-portal-page .crew-context-hero {
  display: grid;
  gap: 1.1rem;
  padding: 1.45rem;
  border: 1px solid var(--crew-line);
  border-radius: 28px;
  min-height: 0;
  color: var(--crew-ink);
  background: #ffffff !important;
  box-shadow: var(--crew-shadow-soft);
}

.crew-context-ribbon {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border: 1px solid var(--crew-line);
  border-radius: 24px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(244, 249, 247, 0.98));
  box-shadow: 0 18px 40px rgba(8, 12, 18, 0.06);
}

.crew-context-copy h1,
.page-head h3 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.04em;
}

.crew-context-copy {
  display: grid;
  gap: 0.7rem;
}

.hero-badge-row,
.crew-identity-grid,
.hero-stats-grid,
.mission-assignment-banner,
.mission-assignment-meta {
  display: grid;
  gap: 0.85rem;
}

.hero-badge-row {
  grid-template-columns: repeat(2, max-content);
  align-items: center;
  justify-content: space-between;
}

.ribbon-copy {
  display: grid;
  gap: 0.22rem;
}

.ribbon-copy strong {
  color: var(--crew-ink);
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  font-size: clamp(1.05rem, 2vw, 1.35rem);
  letter-spacing: -0.03em;
}

.crew-context-copy h1 {
  color: var(--crew-ink);
  font-size: clamp(2rem, 4.8vw, 3.4rem);
  line-height: 0.95;
}

.crew-context-copy .muted {
  max-width: 70ch;
  line-height: 1.62;
  color: var(--crew-muted);
}

.mission-role-line {
  margin: 0;
  color: #10161c;
  font-size: 1.02rem;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.mission-status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 2.2rem;
  width: fit-content;
  padding: 0 0.9rem;
  border: 1px solid var(--crew-line);
  border-radius: 999px;
  color: #10161c;
  background: #ffffff;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.crew-context-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(320px, 0.9fr);
  gap: 1rem;
  align-items: stretch;
}

.crew-identity-grid,
.hero-stats-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.ribbon-metrics {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.7rem;
}

.ribbon-pill {
  display: inline-flex;
  align-items: center;
  min-height: 2.35rem;
  padding: 0 0.9rem;
  border: 1px solid rgba(16, 163, 127, 0.14);
  border-radius: 999px;
  color: var(--crew-accent-deep);
  background: rgba(16, 163, 127, 0.08);
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.context-card,
.record-card {
  display: grid;
  gap: 0.35rem;
  padding: 1rem;
  border: 1px solid rgba(10, 143, 91, 0.08);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 251, 248, 0.95));
}

.mini-label,
.record-card small,
.record-card p {
  color: #5d5d5d;
}

.context-card strong,
.record-card strong {
  color: #111111;
}

.context-card {
  border-color: var(--crew-line);
  background: #ffffff;
  box-shadow: none;
}

.context-card .mini-label,
.context-card p {
  color: var(--crew-muted);
}

.context-card strong {
  color: var(--crew-ink);
}

.mission-assignment-banner {
  align-content: space-between;
  padding: 1.2rem;
  border: 1px solid var(--crew-line);
  border-radius: 22px;
  background: #ffffff;
  min-height: 220px;
}

.mission-assignment-copy {
  display: grid;
  gap: 0.45rem;
}

.mission-kicker {
  color: #10161c;
  font-size: 0.76rem;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.mission-assignment-copy strong {
  color: var(--crew-ink);
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  font-size: clamp(1.4rem, 3vw, 2.1rem);
  letter-spacing: -0.04em;
}

.mission-assignment-copy p,
.mission-assignment-copy small {
  margin: 0;
  color: var(--crew-muted);
  line-height: 1.55;
}

.mission-assignment-meta {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.mission-progress {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 3rem;
  padding: 0.65rem 0.9rem;
  border-radius: 18px;
  border: 1px solid var(--crew-line);
  background: #ffffff;
  color: var(--crew-ink);
  font-size: 0.88rem;
  font-weight: 800;
}

.mission-progress--ghost {
  border-color: var(--crew-line);
  background: #ffffff;
  color: var(--crew-muted);
}

.hero-stat-card {
  display: grid;
  gap: 0.32rem;
  padding: 0.95rem;
  min-height: 108px;
  border-radius: 18px;
  border: 1px solid var(--crew-line);
  background: #ffffff;
}

.hero-stat-card strong {
  color: var(--crew-ink);
  font-size: 1.2rem;
  letter-spacing: -0.03em;
}

.hero-stat-card p {
  margin: 0;
  color: var(--crew-muted);
  line-height: 1.45;
  font-size: 0.88rem;
}

.hero-stat-card[data-tone='gold'] {
  border-color: var(--crew-line);
  background: #ffffff;
}

.hero-stat-card[data-tone='green'] {
  border-color: var(--crew-line);
}

.hero-stat-card[data-tone='amber'] {
  border-color: var(--crew-line);
}

.page-head,
.title-row,
.record-card,
.toggle-row {
  display: flex;
  gap: 1rem;
}

.page-head {
  align-items: end;
  justify-content: space-between;
}

.title-row {
  align-items: center;
}

.icon-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 16px;
  color: var(--crew-accent);
  border: 1px solid rgba(16, 163, 127, 0.12);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.94);
  background: linear-gradient(180deg, rgba(16, 163, 127, 0.12), rgba(16, 163, 127, 0.04));
}

.action-button {
  gap: 0.45rem;
}

.availability-page,
.documents-page,
.config-page,
.inner-card {
  border: 1px solid var(--crew-line);
  border-radius: 24px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(248, 251, 252, 0.97));
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}

.form-grid label {
  display: grid;
  gap: 0.35rem;
}

.span-2 {
  grid-column: 1 / -1;
}

.toggle-row {
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  border: 1px solid var(--crew-line);
  border-radius: 16px;
  background: linear-gradient(180deg, #ffffff, #f8fbfc);
}

.toggle-row div {
  display: grid;
  gap: 0.2rem;
}

.toggle-row small {
  color: #5d5d5d;
}

.record-card {
  align-items: start;
  justify-content: space-between;
}

.record-card select {
  min-width: 11rem;
}

.config-grid {
  margin-top: 1.2rem;
}

.inner-card h4 {
  margin: 0;
  color: var(--crew-ink);
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.03em;
}

.record-card {
  position: relative;
  overflow: hidden;
}

.record-card::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: linear-gradient(180deg, var(--crew-dark), var(--crew-accent));
  opacity: 0.9;
}

@media (max-width: 1080px) {
  .crew-context-grid,
  .crew-identity-grid,
  .hero-stats-grid,
  .availability-layout,
  .crew-checklist-layout,
  .crew-tracking-layout,
  .documents-layout,
  .form-grid,
  .crew-loading-grid--dashboard,
  .crew-loading-grid--dashboard-main,
  .crew-loading-grid--split,
  .crew-loading-form-grid {
    grid-template-columns: 1fr;
  }

  .crew-context-ribbon {
    display: grid;
  }

  .ribbon-metrics {
    justify-content: flex-start;
  }

  .hero-badge-row,
  .mission-assignment-meta {
    grid-template-columns: 1fr;
  }

  .crew-checklist-detail {
    position: static;
  }

  .crew-tracking-detail {
    position: static;
  }
}

@media (max-width: 760px) {
  .crew-context-hero,
  .crew-context-ribbon,
  .availability-page,
  .documents-page,
  .config-page,
  .inner-card,
  .crew-loading-hero,
  .crew-loading-panel,
  .crew-loading-card {
    padding: 1.05rem;
  }

  .page-head,
  .record-card,
  .toggle-row,
  .crew-checklist-footer,
  .crew-tracking-next {
    display: grid;
  }

  .record-card select,
  .page-head > .action-button {
    width: 100%;
  }

  .title-row,
  .ribbon-metrics {
    align-items: flex-start;
  }

  .crew-checklist-footer {
    justify-content: stretch;
  }

  .crew-tracking-next__actions {
    justify-content: stretch;
  }

  .crew-checklist-failure__previews {
    grid-template-columns: 1fr;
  }

  .mission-status-pill {
    width: 100%;
    justify-content: center;
  }

  .crew-loading-hero {
    display: grid;
    justify-content: stretch;
  }

  .crew-loading-scene {
    min-height: 100vh;
    padding: 1rem;
    border-radius: 0;
  }

  .crew-loading-scene__card {
    min-height: 21rem;
    padding: 2.25rem 1.15rem 1.55rem;
    border-radius: 26px;
  }

  .crew-loading-scene__spinner-shell {
    width: 5.9rem;
    height: 5.9rem;
    margin: 0;
  }

  .crew-loading-scene__copy {
    font-size: 0.92rem;
  }
}

@keyframes crew-shimmer {
  100% {
    transform: translateX(100%);
  }
}

@keyframes crew-loading-spinner-fade {
  0%,
  39%,
  100% {
    opacity: 0.18;
  }

  40% {
    opacity: 1;
  }
}
</style>
