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
import CrewAgendaSection from './CrewAgendaSection.vue'
import CrewAvailabilitySection from './CrewAvailabilitySection.vue'
import CrewAssignmentsSection from './CrewAssignmentsSection.vue'
import CrewDashboardSection from './CrewDashboardSection.vue'
import CrewHistorySection from './CrewHistorySection.vue'
import CrewIncidentSection from './CrewIncidentSection.vue'
import CrewProfileSection from './CrewProfileSection.vue'
import CrewUiIcon from './CrewUiIcon.vue'

const props = defineProps({
  section: { type: String, required: true },
})

const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()
let removeCrewSyncSubscription = null
let loadPortalPromise = null
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
const statusError = ref('')

const assignmentStatusOptions = [
  'Pendiente',
  'Confirmado',
  'Preparacion',
  'En servicio',
  'Finalizado',
  'Incidencia',
  'Cancelado',
]
const crewStatusOptions = ['Disponible', 'Descanso', 'En vuelo', 'No disponible']
const incidentTypes = ['Catering', 'Cabina', 'Cliente', 'Seguridad', 'Horario', 'Proveedor', 'Otro']
const incidentPriorities = ['Baja', 'Media', 'Alta', 'Critica']
const incidentStates = ['Nueva', 'En revision', 'Escalada', 'Resuelta por admin', 'Cerrada']
const availabilityStates = ['DISPONIBLE', 'DESCANSO', 'NO_DISPONIBLE', 'BLOQUEO_SOLICITADO']
const blockTypes = ['Descanso', 'Capacitacion', 'Medico', 'Personal', 'Restriccion operativa']
const bases = []
const languages = []
const profileStates = ['Pendiente', 'En revision', 'Aprobado', 'Rechazado', 'Suspendido']

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

const historyEntries = ref([])

const assignmentResponseForm = reactive({
  response: '',
  rejectReason: '',
  comment: '',
  eta: '',
})

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
  state: 'Nueva',
  actionTaken: '',
  phase: 'Pre-vuelo',
})

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
const nextAssignments = computed(() =>
  sortedAssignments.value.filter((item) => !['Finalizado', 'Cancelado'].includes(item.missionStatus)).slice(0, 3),
)
const openIncidents = computed(() => incidents.value.filter((item) => !['Resuelta', 'Cerrada'].includes(item.state)))
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


const checklistProgress = computed(() => {
  const statusMap = {
    Pendiente: 36,
    Confirmado: 58,
    Preparacion: 78,
    'En aeropuerto/base': 82,
    'Cabina revisada': 88,
    'Pasajeros recibidos': 92,
    'En servicio': 94,
    Finalizado: 100,
    Incidencia: 71,
    Cancelado: 0,
  }

  return currentAssignment.value ? statusMap[currentAssignment.value.missionStatus] || 0 : 0
})

const documentsValidity = computed(() => {
  if (!documentItems.value.length) return 0
  return Math.round((approvedDocuments.value.length / documentItems.value.length) * 100)
})
const activeLanguages = computed(() =>
  String(profileForm.languages || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
)
const experienceHours = computed(() => {
  const numeric = Number(String(profileForm.experience || '').replace(/[^\d]/g, ''))
  if (numeric > 100) return numeric
  return 0
})
const crewLevel = computed(() => {
  if (!documentItems.value.length && !experienceHours.value) return ''
  if (documentsValidity.value >= 95 && experienceHours.value >= 1000) return 'Elite Internacional'
  if (documentsValidity.value >= 80 && experienceHours.value >= 500) return 'Ejecutivo'
  return 'Basico'
})
const readinessScore = computed(() => {
  const documentWeight = documentsValidity.value * 0.45
  const checklistWeight = checklistProgress.value * 0.25
  const availabilityWeight =
    currentStatus.value === 'Disponible' ? 20 : currentStatus.value === 'Asignado' ? 14 : currentStatus.value ? 8 : 0
  const profileWeight = !profileForm.profileState
    ? 0
    : String(profileForm.profileState || '').toLowerCase().includes('aprobado')
      ? 10
      : String(profileForm.profileState || '').toLowerCase().includes('revision')
        ? 6
        : 4

  return Math.max(0, Math.min(100, Math.round(documentWeight + checklistWeight + availabilityWeight + profileWeight)))
})
const readinessLabel = computed(() => {
  if (!readinessScore.value) return 'Sin datos'
  if (readinessScore.value >= 90) return 'Listo para volar'
  if (readinessScore.value >= 75) return 'Listo con seguimiento'
  return 'Requiere atencion'
})
const identitySummary = computed(() => ({
  level: crewLevel.value,
  base: auth.user?.profile?.base_airport || profileForm.base || '',
  languages: activeLanguages.value.length ? activeLanguages.value.join(' / ') : '',
  hours: experienceHours.value ? `${experienceHours.value.toLocaleString('es-MX')} hrs` : '',
  certifications: profileForm.certifications || '',
  validationState: profileForm.profileState || auth.user?.profile?.profile_state || '',
  operationalState: currentStatus.value || auth.user?.current_status || '',
}))
const expiringDocuments = computed(() => {
  const now = new Date()

  return documentItems.value
    .map((item) => {
      const expires = item.expiresAt ? new Date(item.expiresAt) : null
      const daysRemaining =
        expires && !Number.isNaN(expires.getTime())
          ? Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : null

      return {
        ...item,
        daysRemaining,
        tone:
          daysRemaining == null || daysRemaining > 60
            ? 'green'
            : daysRemaining > 15
              ? 'amber'
              : 'red',
      }
    })
    .sort((left, right) => {
      const leftDays = left.daysRemaining ?? Number.POSITIVE_INFINITY
      const rightDays = right.daysRemaining ?? Number.POSITIVE_INFINITY
      return leftDays - rightDays
    })
    .slice(0, 3)
})
const premiumAlerts = computed(() => {
  const alerts = []

  if (documentsValidity.value < 100) {
    alerts.push('Tu expediente aun tiene validaciones pendientes antes de prioridad internacional.')
  }
  if (expiringDocuments.value.some((item) => item.daysRemaining != null && item.daysRemaining <= 15)) {
    alerts.push('Tienes documentos criticos por vencer en menos de 15 dias.')
  }
  if (currentStatus.value !== 'Disponible' && !currentAssignment.value) {
    alerts.push('Activa disponibilidad para volver a aparecer en vuelos asignables.')
  }
  if (!currentAssignment.value) {
    alerts.push('Sin mision asignada. Mantener score alto mejora prioridad de matching.')
  }

  return alerts.slice(0, 3)
})

const servicesCompletedThisMonth = computed(
  () => historyEntries.value.filter((item) => item.status === 'Finalizado').length,
)
const monthlyFlightHours = computed(() => servicesCompletedThisMonth.value * 9 + nextAssignments.value.length * 4)
const punctualityRate = computed(() =>
  historyEntries.value.length ? `${Math.max(0, 100 - openIncidents.value.length)}%` : '',
)
const dashboardSummary = computed(() => [
  {
    label: 'Servicios completados',
    value: servicesCompletedThisMonth.value,
    detail: currentAssignment.value ? '1 activa o en preparacion.' : 'Sin mision activa en este momento.',
  },
  {
    label: 'Puntualidad',
    value: punctualityRate.value,
    detail: punctualityRate.value ? 'Calculado con la actividad registrada.' : 'Sin actividad suficiente para calcularla.',
  },
  {
    label: 'Checklist promedio',
    value: `${checklistProgress.value}%`,
    detail: 'Preparacion tactica para briefing y cabina.',
  },
  {
    label: 'Alertas activas',
    value: `${openIncidents.value + pendingDocuments.value.length}`,
    detail: `${openIncidents.value} incidencia${openIncidents.value === 1 ? '' : 's'} abierta${openIncidents.value === 1 ? '' : 's'} | ${pendingDocuments.value.length} alerta${pendingDocuments.value.length === 1 ? '' : 's'} documental${pendingDocuments.value.length === 1 ? '' : 'es'}`,
  },
])

const dayOfFlightDetails = computed(() => {
  if (!currentAssignment.value) return []

  return [
    { label: 'Hora reporte', value: currentAssignment.value.briefingTime || currentAssignment.value.time || '' },
    { label: 'FBO', value: currentAssignment.value.origin || profileForm.base || '' },
    { label: 'Catering', value: currentAssignment.value.catering || '' },
    { label: 'Pasajeros especiales', value: currentAssignment.value.passengers ? `${currentAssignment.value.passengers} pasajeros autorizados` : '' },
    { label: 'Amenidades', value: currentAssignment.value.amenities || '' },
    { label: 'Incidencias', value: openIncidents.value.length ? `${openIncidents.value.length} abiertas` : 'Sin alertas criticas' },
  ].filter((item) => item.value)
})

const historySummary = computed(() => ({
  completedFlights: historyEntries.value.filter((item) => item.status === 'Finalizado').length,
  hoursWorked: monthlyFlightHours.value ? `${monthlyFlightHours.value} h` : '',
  rating: '',
  incidents: incidents.value.length,
  reportsSent: historyEntries.value.filter((item) => item.action.toLowerCase().includes('servicio')).length,
}))

const crewProfileAlerts = computed(() => {
  const alerts = []

  if (!providerName.value) alerts.push('Proveedor sin ligar')
  if (!profileForm.base) alerts.push('Base pendiente')

  const normalizedProfileState = String(profileForm.profileState || '').toLowerCase()
  if (normalizedProfileState.includes('pend') || normalizedProfileState.includes('revision')) {
    alerts.push('Requiere validacion administrativa')
  }
  if (normalizedProfileState.includes('rech')) {
    alerts.push('Perfil rechazado')
  }
  if (pendingDocuments.value.length) {
    alerts.push('Expediente incompleto')
  }
  if (expiringDocuments.value.some((item) => item.daysRemaining != null && item.daysRemaining <= 15)) {
    alerts.push('Documento proximo a vencer')
  }

  return [...new Set(alerts)]
})

function hasLoadedResources(keys = []) {
  return keys.every((key) => portalDataLoaded[key])
}

function hasLoadingResources(keys = []) {
  return keys.some((key) => portalDataLoading[key])
}

const isDashboardLoading = computed(
  () =>
    hasLoadingResources(['dashboard', 'assignments', 'profile', 'documents', 'incidents']) &&
    !hasLoadedResources(['dashboard', 'assignments', 'profile', 'documents', 'incidents']),
)
const isAssignmentsLoading = computed(
  () => portalDataLoading.assignments && !portalDataLoaded.assignments,
)
const isCalendarLoading = computed(
  () => portalDataLoading.assignments && !portalDataLoaded.assignments,
)
const isAvailabilityLoading = computed(
  () => portalDataLoading.availability && !portalDataLoaded.availability,
)
const isProfileLoading = computed(
  () =>
    hasLoadingResources(['profile', 'documents', 'assignments']) &&
    !hasLoadedResources(['profile', 'documents', 'assignments']),
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

function getCrewPortalResourceKeys(section = resolvedSection.value) {
  switch (section) {
    case 'dashboard':
      return ['dashboard', 'assignments', 'profile', 'documents', 'incidents']
    case 'asignaciones':
    case 'calendario':
      return ['assignments']
    case 'disponibilidad':
      return ['availability', 'assignments']
    case 'perfil':
      return ['profile', 'documents', 'assignments']
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

const agendaItems = computed(() =>
  assignments.value.map((item) => ({
    ...item,
    state: item.missionStatus,
    confirmed: item.assignmentConfirmed,
  })),
)

const incidentFlightOptions = computed(() =>
  assignments.value
    .filter((item) => !['Cancelado'].includes(item.missionStatus))
    .map((item) => ({
      id: item.id,
      flight: item.flight,
      route: item.route,
      phase:
        item.missionStatus === 'En servicio'
          ? 'En vuelo'
          : item.missionStatus === 'Finalizado'
            ? 'Post-vuelo'
            : 'Pre-vuelo',
    })),
)

const agendaErrors = computed(() => {
  const errors = {}
  if (agendaBlockForm.state === 'No disponible' && !agendaBlockForm.reason.trim()) {
    errors.reason = 'Describe el motivo del bloqueo para que Admin / Red Sky lo audite.'
  }
  if (nextAssignments.value.some((item) => item.assignmentConfirmed) && agendaBlockForm.state === 'No disponible') {
    errors.conflict = 'Ya tienes una mision confirmada; el bloqueo debe revisarlo Admin / Red Sky.'
  }
  return errors
})

const incidentErrors = computed(() => {
  const errors = {}
  if (!incidentForm.description.trim()) errors.description = 'Describe lo sucedido.'
  if (!incidentForm.priority) errors.priority = 'Selecciona una prioridad.'
  if (!incidentForm.flight) errors.flight = 'Selecciona un vuelo asignado.'
  if (['Alta', 'Critica'].includes(incidentForm.priority) && !incidentForm.evidence.trim()) {
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

function normalizeAssignmentResponseStatus(raw = {}, missionStatus = 'Pendiente') {
  const responseCandidate =
    raw.response_status ||
    raw.assignment_response ||
    raw.assignmentStatus ||
    raw.response ||
    raw.status ||
    ''

  const normalized = String(responseCandidate).toLowerCase()

  if (['confirmado', 'confirmed', 'accepted', 'aceptado'].includes(normalized)) return 'Confirmado'
  if (['rechazado', 'rejected', 'declined'].includes(normalized)) return 'Rechazado'
  if (['solicitar revision', 'revision', 'review_requested', 'requested_changes'].includes(normalized)) {
    return 'Solicitar revision'
  }

  return missionStatus === 'Pendiente' ? 'Pendiente' : 'Recibida'
}

function normalizeCrewLifecycleStatus(value = '') {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'pending_crew_response') return 'Pendiente'
  if (normalized === 'crew_confirmed') return 'Confirmado'
  if (normalized === 'crew_declined') return 'Cancelado'
  if (normalized === 'crew_change_requested') return 'Incidencia'
  if (normalized === 'crew_enroute') return 'Preparacion'
  if (normalized === 'crew_active') return 'En servicio'
  if (normalized === 'crew_completed') return 'Finalizado'
  if (normalized === 'crew_incident_reported') return 'Incidencia'
  return ''
}

function humanizeCrewLifecycleStatus(value = '') {
  const normalized = String(value || '').toLowerCase()
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

function normalizeAssignment(raw = {}, detail = {}, index = 0) {
  const briefing = detail.briefing || {}
  const departure = briefing.salida || raw.departure_datetime || raw.started_at || ''
  const latestTimelineStatus = resolveLatestTimelineStatus(detail)
  const operationStatus = latestTimelineStatus || detail.status || raw.status || ''
  const crewLifecycleStatus =
    detail.crew_status || raw.crew_status || raw.crewStatus || raw.crew_status_label || ''
  const timelineStatuses = buildTimelineStatusSet(detail)
  const hasCheckin =
    Boolean(raw.crew_checkin_at || detail.crew_checkin_at) ||
    timelineStatuses.has('crew checkin')
  const hasCabinReady = timelineStatuses.has('cabina lista')
  const hasPassengersReady = timelineStatuses.has('pasajeros recibidos')
  const hasServiceStarted =
    Boolean(raw.crew_service_started_at || detail.crew_service_started_at) ||
    timelineStatuses.has('servicio iniciado') ||
    ['crew_active', 'crew_completed'].includes(String(crewLifecycleStatus || '').toLowerCase()) ||
    ['in_progress', 'completed'].includes(String(operationStatus || '').toLowerCase())
  const hasServiceCompleted =
    Boolean(raw.crew_service_completed_at || detail.crew_service_completed_at) ||
    timelineStatuses.has('servicio finalizado') ||
    String(crewLifecycleStatus || '').toLowerCase() === 'crew_completed' ||
    String(operationStatus || '').toLowerCase() === 'completed'
  const missionStatus =
    hasServiceCompleted
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
  const responseStatus = normalizeAssignmentResponseStatus(raw, missionStatus)
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
  const normalizedCrewLifecycleStatus = String(crewLifecycleStatus || '').toLowerCase()
  const responseLocked = [
    'crew_confirmed',
    'crew_declined',
    'crew_change_requested',
    'crew_enroute',
    'crew_active',
    'crew_completed',
  ].includes(normalizedCrewLifecycleStatus)
  const canRespondToAssignment = !responseLocked
  const canCheckin =
    ['crew_confirmed', 'crew_enroute', 'crew_active', 'crew_completed'].includes(normalizedCrewLifecycleStatus) &&
    !hasCheckin
  const canMarkCabinReady = hasCheckin && !hasCabinReady && !hasServiceStarted
  const canReceivePassengers = hasCabinReady && !hasPassengersReady && !hasServiceStarted
  const canStartService = hasPassengersReady && !hasServiceStarted
  const canFinalizeService = hasServiceStarted && !hasServiceCompleted

  return {
    id: raw.id || index + 1,
    flight: raw.flight || raw.code || raw.reference || (raw.id != null ? String(raw.id) : ''),
    route,
    date: departure ? String(departure).slice(0, 10) : '',
    time: departure && String(departure).includes('T') ? String(departure).slice(11, 16) : '',
    aircraft: raw.aircraft || raw.aircraft_model || '',
    briefing: departure ? String(departure).slice(11, 16) : '',
    briefingTime: departure ? String(departure).slice(11, 16) : '',
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
    assignmentConfirmed: ['Confirmado', 'Recibida'].includes(responseStatus) || missionStatus !== 'Pendiente',
    operationActive: ['Preparacion', 'En servicio', 'Incidencia'].includes(missionStatus),
    responseDeadlinePassed: false,
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
    canRespondToAssignment,
    canCheckin,
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

function resolveAvailabilityPayload(statusKey, comment = '', reason = '') {
  const normalized = normalizeAvailabilityStatusKey(statusKey)
  const definition = getAvailabilityStatusDefinition(normalized)
  return {
    fecha: '',
    status_key: normalized,
    clave: normalized,
    status: definition?.nombre || humanizeAvailabilityStatusKey(normalized),
    state: definition?.nombre || humanizeAvailabilityStatusKey(normalized),
    motivo: reason || '',
    comentario: comment || '',
    notes: comment || '',
  }
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
  return {
    id: raw.id || index + 1,
    flight: raw.flight || raw.reference || (raw.operation_id != null ? String(raw.operation_id) : ''),
    type: raw.type || raw.title || '',
    priority: raw.priority || '',
    description: raw.description || raw.comment || '',
    evidence: raw.evidence || '',
    time: raw.created_at || '',
    state: raw.status || raw.state || '',
    phase: raw.phase || '',
    actionTaken: raw.action_taken || raw.actionTaken || '',
    timeline: Array.isArray(raw.timeline) ? raw.timeline : [],
    operationId: raw.operation_id || null,
  }
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

  forms[form][field] = value

  if (form === 'incident') {
    incidentApiErrors.value = Object.fromEntries(
      Object.entries(incidentApiErrors.value).filter(([key]) => key !== field && key !== '_form'),
    )
  }
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
      request_id: 'flight',
      flight: 'flight',
      type: 'type',
      title: 'type',
      priority: 'priority',
      phase: 'phase',
      status: 'state',
      evidence: 'evidence',
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

async function updateStatus(next) {
  const backendStatus = next
  const computedStatus = deriveCrewStatusFromAssignments()
  if (backendStatus === 'Disponible' && computedStatus === 'En vuelo') {
    statusError.value = 'No puedes ponerte disponible mientras exista una operacion activa.'
    return
  }

  try {
    await requestWithCandidates([
      {
        method: 'put',
        path: '/sobrecargo/profile',
        body: {
          current_status: backendStatus,
        },
      },
    ])
    storedOperationalStatus.value = normalizeCrewOperationalStatus(backendStatus)
    currentStatus.value = normalizeCrewOperationalStatus(backendStatus)
    statusError.value = ''
    auth.syncUserContext({
      userPatch: {
        current_status: backendStatus,
      },
      profilePatch: {
        current_status: backendStatus,
      },
    })
    ui.pushToast({
      tone: 'success',
      title: 'Estado operativo actualizado',
      message: 'La disponibilidad operativa ya quedo registrada en backend.',
    })
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo actualizar',
      message: error.message || 'El backend no acepto el cambio de estado.',
    })
  }
}

function viewFlight() {
  if (!currentAssignment.value) return
  router.push(`${roleBasePaths.crew}/asignaciones`)
}

function goToSection(section) {
  router.push(`${roleBasePaths.crew}/${section}`)
}

async function requestBlock() {
  if (Object.keys(agendaErrors.value).length) {
    return ui.pushToast({
      tone: 'error',
      title: 'Bloqueo invalido',
      message: 'Revisa motivo y conflictos con misiones confirmadas.',
    })
  }

  const referenceDate = currentAssignment.value?.date && currentAssignment.value.date !== 'Pendiente'
    ? currentAssignment.value.date
    : new Date().toISOString().slice(0, 10)

  try {
    const payload = resolveAvailabilityPayload(
      agendaBlockForm.state,
      [agendaBlockForm.blockType, agendaBlockForm.reason].filter(Boolean).join(' · '),
      agendaBlockForm.blockType || 'Bloqueo solicitado',
    )

    payload.fecha = referenceDate

    await requestWithCandidates([
      {
        method: 'post',
        path: '/sobrecargo/availability',
        body: payload,
      },
    ])
    await loadPortal()
    ui.pushToast({
      tone: 'success',
      title: 'Bloqueo registrado',
      message: 'La restriccion operativa ya quedo guardada en backend.',
    })
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo bloquear',
      message: error.message || 'El bloqueo no pudo registrarse en backend.',
    })
  }
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
    return ui.pushToast({
      tone: 'error',
      title: 'No se pudo responder',
      message: error.message || 'La respuesta no pudo registrarse en backend.',
    })
  }

  await loadPortal()
  assignmentResponseForm.response = ''
  assignmentResponseForm.rejectReason = ''
  assignmentResponseForm.comment = ''
  assignmentResponseForm.eta = ''
  ui.pushToast({
    tone: response === 'Confirmado' ? 'success' : 'info',
    title: `Asignacion ${response.toLowerCase()}`,
    message: 'La respuesta ya quedo registrada en backend operativo.',
  })
}

async function confirmBriefing(id) {
  const assignment = assignments.value.find((item) => item.id === id)
  if (!assignment) return

  try {
    await requestWithCandidates([
      {
        method: 'post',
        path: `/sobrecargo/operations/${assignment.operationId || id}/checkin`,
        body: {
          note: assignmentResponseForm.comment || 'Check-in operativo confirmado por sobrecargo.',
        },
      },
    ])
  } catch (error) {
    return ui.pushToast({
      tone: 'error',
      title: 'No se pudo confirmar check-in',
      message: error.message || 'El check-in operativo no pudo registrarse en backend.',
    })
  }

  await loadPortal()
  goToSection('asignaciones')
}

async function markCabinReady(id) {
  const assignment = assignments.value.find((item) => item.id === id)
  if (!assignment) return

  try {
    await requestWithCandidates([
      {
        method: 'post',
        path: `/sobrecargo/operations/${assignment.operationId || id}/cabin-ready`,
        body: {
          note: assignmentResponseForm.comment || 'Cabina, catering e insumos revisados por sobrecargo.',
        },
      },
    ])
  } catch (error) {
    return ui.pushToast({
      tone: 'error',
      title: 'No se pudo registrar cabina',
      message: error.message || 'La revision de cabina no pudo registrarse en backend.',
    })
  }

  await loadPortal()
  goToSection('asignaciones')
}

async function markPassengersReceived(id) {
  const assignment = assignments.value.find((item) => item.id === id)
  if (!assignment) return

  try {
    await requestWithCandidates([
      {
        method: 'post',
        path: `/sobrecargo/operations/${assignment.operationId || id}/passengers-ready`,
        body: {
          note: assignmentResponseForm.comment || 'Pasajeros recibidos por sobrecargo antes del vuelo.',
        },
      },
    ])
  } catch (error) {
    return ui.pushToast({
      tone: 'error',
      title: 'No se pudo registrar recepcion',
      message: error.message || 'La recepcion de pasajeros no pudo registrarse en backend.',
    })
  }

  await loadPortal()
  goToSection('asignaciones')
}

async function createAvailabilityBlock() {
  if (!availabilityForm.from || !availabilityForm.to) {
    return ui.pushToast({
      tone: 'error',
      title: 'Disponibilidad incompleta',
      message: 'Captura inicio y fin antes de guardar la disponibilidad personal.',
    })
  }

  const payload = {
    ...resolveAvailabilityPayload(
      availabilityForm.state,
      availabilityForm.restriction || 'Sin restriccion adicional',
      '',
    ),
    from: availabilityForm.from,
    to: availabilityForm.to,
  }

  try {
    await requestWithCandidates([
      { method: 'post', path: '/sobrecargo/availability', body: payload },
    ])
  } catch (error) {
    return ui.pushToast({
      tone: 'error',
      title: 'No se pudo guardar',
      message: error.message || 'La disponibilidad no pudo guardarse en backend.',
    })
  }
  await loadPortal()
  ui.pushToast({
    tone: 'success',
    title: 'Disponibilidad guardada',
    message: 'La disponibilidad personal quedo actualizada en el portal del sobrecargo.',
  })
  availabilityForm.from = ''
  availabilityForm.to = ''
  availabilityForm.restriction = ''
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
      message: error.message || 'La disponibilidad no pudo actualizarse en backend.',
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

async function removeAvailabilityBlock(id) {
  try {
    await requestWithCandidates([{ method: 'delete', path: `/sobrecargo/availability/${id}` }])
  } catch (error) {
    return ui.pushToast({
      tone: 'error',
      title: 'No se pudo liberar',
      message: error.message || 'El bloqueo sigue activo en backend.',
    })
  }
  await loadPortal()
}

async function startAssignedService(id) {
  const assignment = assignments.value.find((item) => item.id === id)
  if (!assignment) return

  try {
    await requestWithCandidates([
      { method: 'post', path: `/sobrecargo/operations/${assignment.operationId}/start-service`, body: {} },
    ])
  } catch (error) {
    return ui.pushToast({
      tone: 'error',
      title: 'No se pudo iniciar',
      message: error.message || 'El servicio no pudo iniciarse en backend.',
    })
  }

  await loadPortal()
}

async function finalizeAssignedService(id) {
  const assignment = assignments.value.find((item) => item.id === id)
  if (!assignment) return

  try {
    await requestWithCandidates([
      { method: 'post', path: `/sobrecargo/operations/${assignment.operationId}/complete-service`, body: {} },
    ])
  } catch (error) {
    return ui.pushToast({
      tone: 'error',
      title: 'No se pudo finalizar',
      message: error.message || 'El cierre del servicio no pudo registrarse en backend.',
    })
  }

  await loadPortal()
}

async function createIncident(options = {}) {
  incidentApiErrors.value = {}

  if (Object.keys(incidentErrors.value).length) {
    return ui.pushToast({
      tone: 'error',
      title: 'Incidencia invalida',
      message: 'Revisa descripcion, prioridad, evidencia y resolucion.',
    })
  }

  const shouldEscalate = Boolean(options.escalate)
  const linkedAssignment =
    assignments.value.find((item) => item.flight === incidentForm.flight) || currentAssignment.value

  if (!linkedAssignment?.operationId) {
    return ui.pushToast({
      tone: 'error',
      title: 'Operacion no encontrada',
      message: 'La incidencia debe vincularse a una operacion asignada del proveedor.',
    })
  }

  const resolvedStatus = shouldEscalate ? 'Escalada' : incidentForm.state || 'Nueva'
  const resolvedActionTaken = shouldEscalate ? 'Escalado' : incidentForm.actionTaken || 'Reportado'
  const payload = {
    operation_id: linkedAssignment.operationId,
    type: incidentForm.type || 'Incidencia operativa',
    title: incidentForm.type || 'Incidencia operativa',
    flight: incidentForm.flight,
    reference: incidentForm.flight,
    priority: incidentForm.priority,
    phase: incidentForm.phase,
    status: resolvedStatus,
    evidence: incidentForm.evidence || undefined,
    comment: incidentForm.description,
    description: incidentForm.description,
    action_taken: resolvedActionTaken,
  }

  try {
    await requestWithCandidates([
      {
        method: 'post',
        path: `/sobrecargo/operations/${linkedAssignment.operationId}/incident`,
        body: payload,
      },
      {
        method: 'post',
        path: '/sobrecargo/incidents',
        body: payload,
      },
    ])
    await loadPortal()
    ui.pushToast({
      tone: 'success',
      title: 'Incidencia creada',
      message: shouldEscalate
        ? 'La incidencia ya quedo vinculada a tu operacion y fue escalada a Admin / Red Sky.'
        : 'La incidencia ya quedo vinculada a tu operacion.',
    })
    incidentForm.flight = ''
    incidentForm.type = ''
    incidentForm.priority = ''
    incidentForm.description = ''
    incidentForm.evidence = ''
    incidentForm.state = 'Nueva'
    incidentForm.actionTaken = ''
    incidentForm.phase = 'Pre-vuelo'
    goToSection('dashboard')
  } catch (error) {
    const message = applyIncidentBackendErrors(error, 'El backend no acepto la incidencia.')
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo crear',
      message,
    })
  }
}

async function addEvidence(id) {
  const incident = incidents.value.find((item) => item.id === id)
  if (!incident) return

  try {
    await requestWithCandidates([
      {
        method: 'put',
        path: `/sobrecargo/incidents/${id}`,
        body: {
          evidence: incident.evidence || 'evidencia-operativa.jpg',
        },
      },
    ])
    await loadPortal()
    ui.pushToast({
      tone: 'success',
      title: 'Evidencia actualizada',
      message: 'La evidencia ya quedo ligada a la incidencia en backend.',
    })
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo actualizar',
      message: error.message || 'La evidencia no pudo guardarse en backend.',
    })
  }
}

async function addComment(id) {
  const incident = incidents.value.find((item) => item.id === id)
  if (!incident) return

  try {
    await requestWithCandidates([
      {
        method: 'put',
        path: `/sobrecargo/incidents/${id}`,
        body: {
          comment: 'Accion actualizada desde el portal de sobrecargo.',
          action_taken: incident.actionTaken || 'Atendido en cabina',
        },
      },
    ])
    await loadPortal()
    ui.pushToast({
      tone: 'success',
      title: 'Accion actualizada',
      message: 'El seguimiento de la incidencia ya quedo registrado en backend.',
    })
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo actualizar',
      message: error.message || 'La accion no pudo registrarse en backend.',
    })
  }
}

async function markAttended(id) {
  try {
    await requestWithCandidates([
      {
        method: 'put',
        path: `/sobrecargo/incidents/${id}`,
        body: {
          status: 'En revision',
          action_taken: 'Atendido en cabina',
        },
      },
    ])
    await loadPortal()
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo actualizar',
      message: error.message || 'La incidencia no pudo marcarse en revision.',
    })
  }
}

async function escalateIncident(id) {
  try {
    await requestWithCandidates([
      {
        method: 'put',
        path: `/sobrecargo/incidents/${id}`,
        body: {
          status: 'Escalada',
          action_taken: 'Escalado',
          comment: 'Admin / Red Sky notificado desde el portal de sobrecargo.',
        },
      },
    ])
    await loadPortal()
    ui.pushToast({
      tone: 'success',
      title: 'Incidencia escalada',
      message: 'La incidencia ya fue marcada para seguimiento de Admin / Red Sky.',
    })
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo escalar',
      message: error.message || 'La incidencia no pudo escalarse en backend.',
    })
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
      message: error.message || 'El documento no pudo registrarse en backend.',
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
      message: error.message || 'El documento no pudo actualizarse en backend.',
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
      message: error.message || 'El perfil no pudo actualizarse en backend.',
    })
  }

  await loadPortal()
  ui.pushToast({
    tone: 'success',
    title: 'Perfil actualizado',
    message: 'Los cambios del perfil quedaron reflejados en backend.',
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
      message: 'Las preferencias del portal ya quedaron guardadas en backend.',
    })
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo guardar',
      message: error.message || 'Las preferencias no pudieron persistirse en backend.',
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
      requestEntries.push([
        'incidents',
        () =>
          requestWithCandidates([
            { method: 'get', path: '/sobrecargo/incidents', timeoutMs: CREW_PORTAL_TIMEOUT_MS },
          ]),
      ])
    }

    if (!requestEntries.length) {
      finalizePortalState()
      return
    }

    requestEntries.forEach(([key]) => {
      portalDataLoading[key] = true
    })

    const results = await Promise.allSettled(requestEntries.map(([, request]) => request()))

    results.forEach((result, index) => {
      const [key] = requestEntries[index]

      if (result.status !== 'fulfilled') return

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
        incidents.value = collection.map(normalizeCrewIncidentRecord)
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

watch(
  resolvedSection,
  () => {
    void loadPortal({ force: false })
  },
  { immediate: true },
)

onMounted(() => {
  removeCrewSyncSubscription = subscribeWorkflowSync(async (payload = {}) => {
    if (payload.scope !== 'crew-status') return
    if (Number(payload.crewUserId || 0) !== Number(auth.user?.id || 0)) return

    await loadPortal({ force: true, resources: ['dashboard', 'assignments', 'profile', 'documents', 'availability', 'incidents'] })
  })
})

onBeforeUnmount(() => {
  if (removeCrewSyncSubscription) {
    removeCrewSyncSubscription()
    removeCrewSyncSubscription = null
  }
})
</script>

<template>
  <div class="crew-portal-page">
    <section v-if="resolvedSection === 'dashboard' && isDashboardLoading" class="crew-loading-view">
      <div class="surface crew-loading-hero">
        <div>
          <span class="eyebrow">Operacion</span>
          <h3>Preparando tablero de vuelo</h3>
          <p class="muted">Sincronizando readiness, mision actual, estatus y alertas operativas.</p>
        </div>
        <span class="badge">Cargando dashboard</span>
      </div>
      <div class="crew-loading-grid crew-loading-grid--dashboard">
        <article v-for="item in 4" :key="`dashboard-stat-${item}`" class="surface crew-loading-card">
          <span class="crew-skeleton crew-skeleton-line crew-skeleton-line--sm"></span>
          <span class="crew-skeleton crew-skeleton-line crew-skeleton-line--md"></span>
          <span class="crew-skeleton crew-skeleton-line crew-skeleton-line--lg"></span>
        </article>
      </div>
      <div class="crew-loading-grid crew-loading-grid--dashboard-main">
        <article class="surface crew-loading-panel">
          <span class="crew-skeleton crew-skeleton-line crew-skeleton-line--lg"></span>
          <span class="crew-skeleton crew-skeleton-line crew-skeleton-line--md"></span>
          <div class="crew-loading-chip-row">
            <span v-for="item in 5" :key="`dashboard-chip-${item}`" class="crew-skeleton crew-skeleton-pill"></span>
          </div>
        </article>
        <article class="surface crew-loading-panel">
          <span class="crew-skeleton crew-skeleton-line crew-skeleton-line--md"></span>
          <span v-for="item in 4" :key="`dashboard-side-${item}`" class="crew-skeleton crew-skeleton-panel"></span>
        </article>
      </div>
    </section>

    <CrewDashboardSection
      v-else-if="resolvedSection === 'dashboard'"
      :crew-name="crewMemberName"
      :provider-name="providerName"
      :profile-state="profileForm.profileState"
      :summary="dashboardSummary"
      :current-status="currentStatus"
      :status-options="crewStatusOptions"
      :next-flight="currentAssignment"
      :status-error="statusError"
      :checklist-progress="checklistProgress"
      :documents-validity="documentsValidity"
      :day-of-flight-details="dayOfFlightDetails"
      :readiness-score="readinessScore"
      :readiness-label="readinessLabel"
      :identity-summary="identitySummary"
      :expiring-documents="expiringDocuments"
      :premium-alerts="premiumAlerts"
      @update-status="updateStatus"
      @view-flight="viewFlight"
      @start-checklist="goToSection('asignaciones')"
      @open-documents="goToSection('documentos')"
      @open-availability="goToSection('disponibilidad')"
      @open-incidents="goToSection('incidencias')"
    />

    <CrewAssignmentsSection
      v-else-if="resolvedSection === 'asignaciones'"
      :assignments="assignments"
      :is-loading="isAssignmentsLoading"
      @confirm="(id) => respondAssignment(id, 'Confirmado')"
      @reject="(id) => respondAssignment(id, 'Rechazado')"
      @request-change="(id) => respondAssignment(id, 'Solicitar revision')"
      @confirm-briefing="confirmBriefing"
      @mark-cabin-ready="markCabinReady"
      @mark-passengers-ready="markPassengersReceived"
      @start-service="startAssignedService"
      @finalize-service="finalizeAssignedService"
    />

    <section v-else-if="resolvedSection === 'calendario' && isCalendarLoading" class="crew-loading-view">
      <div class="surface crew-loading-hero">
        <div>
          <span class="eyebrow">Calendario</span>
          <h3>Armando operacion del dia</h3>
          <p class="muted">Traemos briefing, etapas activas y movimientos de agenda.</p>
        </div>
        <span class="badge">Cargando agenda</span>
      </div>
      <div class="crew-loading-grid crew-loading-grid--split">
        <article class="surface crew-loading-panel">
          <span class="crew-skeleton crew-skeleton-line crew-skeleton-line--lg"></span>
          <span v-for="item in 5" :key="`calendar-row-${item}`" class="crew-skeleton crew-skeleton-panel"></span>
        </article>
        <article class="surface crew-loading-panel">
          <span class="crew-skeleton crew-skeleton-line crew-skeleton-line--md"></span>
          <div class="crew-loading-chip-row">
            <span v-for="item in 6" :key="`calendar-chip-${item}`" class="crew-skeleton crew-skeleton-pill"></span>
          </div>
          <span v-for="item in 3" :key="`calendar-card-${item}`" class="crew-skeleton crew-skeleton-panel crew-skeleton-panel--tall"></span>
        </article>
      </div>
    </section>

    <section v-else-if="resolvedSection === 'calendario'" class="section-stack">
      <CrewAgendaSection
        :agenda-items="agendaItems"
        :agenda-block-form="agendaBlockForm"
        :agenda-errors="agendaErrors"
        :agenda-states="assignmentStatusOptions"
        :block-types="blockTypes"
        @update-field="updateField"
        @confirm-flight="(id) => respondAssignment(id, 'Confirmado')"
        @mark-en-camino="confirmBriefing"
        @mark-briefing="confirmBriefing"
        @mark-cabin-ready="markCabinReady"
        @mark-passengers-ready="markPassengersReceived"
        @mark-service="startAssignedService"
        @mark-finalizado="finalizeAssignedService"
        @request-block="requestBlock"
      />
    </section>

    <section v-else-if="resolvedSection === 'disponibilidad' && isAvailabilityLoading" class="crew-loading-view">
      <div class="surface crew-loading-hero">
        <div>
          <span class="eyebrow">Disponibilidad</span>
          <h3>Sincronizando cobertura personal</h3>
          <p class="muted">Consultando bloques, base operativa y periodos disponibles.</p>
        </div>
        <span class="badge">Cargando disponibilidad</span>
      </div>
      <div class="crew-loading-grid crew-loading-grid--split">
        <article class="surface crew-loading-panel">
          <span class="crew-skeleton crew-skeleton-line crew-skeleton-line--lg"></span>
          <div class="crew-loading-form-grid">
            <span v-for="item in 6" :key="`availability-field-${item}`" class="crew-skeleton crew-skeleton-field"></span>
          </div>
        </article>
        <article class="surface crew-loading-panel">
          <span class="crew-skeleton crew-skeleton-line crew-skeleton-line--md"></span>
          <span v-for="item in 4" :key="`availability-block-${item}`" class="crew-skeleton crew-skeleton-panel"></span>
        </article>
      </div>
    </section>

    <CrewAvailabilitySection
      v-else-if="resolvedSection === 'disponibilidad'"
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
          message: 'Comparte el cambio con Admin / Red Sky para revisar la operacion asignada.',
        })
      "
    />

    <section v-else-if="resolvedSection === 'perfil' && isProfileLoading" class="crew-loading-view">
      <div class="surface crew-loading-hero">
        <div>
          <span class="eyebrow">Perfil</span>
          <h3>Preparando perfil de vuelo</h3>
          <p class="muted">Estamos cargando datos personales, validaciones y alertas del expediente.</p>
        </div>
        <span class="badge">Cargando perfil</span>
      </div>
      <div class="crew-loading-grid crew-loading-grid--split">
        <article class="surface crew-loading-panel">
          <span class="crew-skeleton crew-skeleton-line crew-skeleton-line--lg"></span>
          <div class="crew-loading-form-grid">
            <span v-for="item in 8" :key="`profile-field-${item}`" class="crew-skeleton crew-skeleton-field"></span>
          </div>
        </article>
        <article class="surface crew-loading-panel">
          <span class="crew-skeleton crew-skeleton-line crew-skeleton-line--md"></span>
          <span v-for="item in 5" :key="`profile-side-${item}`" class="crew-skeleton crew-skeleton-panel"></span>
        </article>
      </div>
    </section>

    <CrewProfileSection
      v-else-if="resolvedSection === 'perfil'"
      :profile-form="profileForm"
      :profile-errors="profileErrors"
      :provider-name="providerName"
      :current-status="currentStatus"
      :documents-validity="documentsValidity"
      :profile-alerts="crewProfileAlerts"
      :profile-rating="profileRating"
      :bases="bases"
      :languages="languages"
      :profile-states="profileStates"
      @update-field="updateField"
      @save="saveProfile"
    />

    <section v-else-if="resolvedSection === 'documentos' && isDocumentsLoading" class="crew-loading-view">
      <div class="surface crew-loading-hero">
        <div>
          <span class="eyebrow">Documentos</span>
          <h3>Organizando centro documental</h3>
          <p class="muted">Sincronizando certificados, vencimientos y estado de validacion.</p>
        </div>
        <span class="badge">Cargando documentos</span>
      </div>
      <div class="crew-loading-grid crew-loading-grid--split">
        <article class="surface crew-loading-panel">
          <span class="crew-skeleton crew-skeleton-line crew-skeleton-line--lg"></span>
          <div class="crew-loading-form-grid">
            <span v-for="item in 4" :key="`docs-field-${item}`" class="crew-skeleton crew-skeleton-field"></span>
          </div>
        </article>
        <article class="surface crew-loading-panel">
          <span class="crew-skeleton crew-skeleton-line crew-skeleton-line--md"></span>
          <span v-for="item in 4" :key="`docs-row-${item}`" class="crew-skeleton crew-skeleton-panel"></span>
        </article>
      </div>
    </section>

    <section v-else-if="resolvedSection === 'documentos'" class="surface documents-page">
      <div class="page-head">
        <div class="title-row">
          <span class="icon-badge"><CrewUiIcon name="report" :size="20" /></span>
          <div>
            <span class="eyebrow">Documentos</span>
            <h3>Centro operativo de vuelo</h3>
          </div>
        </div>
        <button class="primary-action action-button" type="button" @click="addDocument">
          <CrewUiIcon name="certificate" :size="16" />
          Subir certificado
        </button>
      </div>

      <div class="documents-layout">
        <section class="surface inner-card">
          <h4>Alta documental</h4>
          <div class="form-grid">
            <label>
              <span>Nombre</span>
              <input v-model="documentForm.name" type="text" />
            </label>
            <label>
              <span>Categoria</span>
              <select v-model="documentForm.category">
                <option>Certificacion</option>
                <option>Identidad</option>
                <option>Idioma</option>
                <option>Experiencia</option>
              </select>
            </label>
            <label>
              <span>Vencimiento</span>
              <input v-model="documentForm.expiresAt" type="date" />
            </label>
            <label class="span-2">
              <span>Nota</span>
              <textarea v-model="documentForm.note" rows="3"></textarea>
            </label>
          </div>
        </section>

        <section class="surface inner-card">
          <h4>Vencimientos y validacion</h4>
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
      </div>
    </section>

    <section v-else-if="resolvedSection === 'incidencias' && isIncidentsLoading" class="crew-loading-view">
      <div class="surface crew-loading-hero">
        <div>
          <span class="eyebrow">Incidencias</span>
          <h3>Conectando bitacora operativa</h3>
          <p class="muted">Estamos reuniendo incidentes, prioridades, vuelos y estados de seguimiento.</p>
        </div>
        <span class="badge">Cargando incidencias</span>
      </div>
      <div class="crew-loading-grid crew-loading-grid--split">
        <article class="surface crew-loading-panel">
          <span class="crew-skeleton crew-skeleton-line crew-skeleton-line--lg"></span>
          <div class="crew-loading-form-grid">
            <span v-for="item in 5" :key="`incident-field-${item}`" class="crew-skeleton crew-skeleton-field"></span>
          </div>
          <span class="crew-skeleton crew-skeleton-panel crew-skeleton-panel--tall"></span>
        </article>
        <article class="surface crew-loading-panel">
          <span class="crew-skeleton crew-skeleton-line crew-skeleton-line--md"></span>
          <span v-for="item in 4" :key="`incident-row-${item}`" class="crew-skeleton crew-skeleton-panel"></span>
        </article>
      </div>
    </section>

    <CrewIncidentSection
      v-else-if="resolvedSection === 'incidencias'"
      :incident-form="incidentForm"
      :incident-errors="incidentErrors"
      :incidents="incidents"
      :incident-types="incidentTypes"
      :incident-priorities="incidentPriorities"
      :incident-states="incidentStates"
      :incident-flight-options="incidentFlightOptions"
      @update-field="updateField"
      @create="createIncident"
      @add-evidence="addEvidence"
      @add-comment="addComment"
      @mark-attended="markAttended"
      @escalate="escalateIncident"
    />

    <section v-else-if="resolvedSection === 'historial' && isHistoryLoading" class="crew-loading-view">
      <div class="surface crew-loading-hero">
        <div>
          <span class="eyebrow">Historial</span>
          <h3>Recuperando trazabilidad de servicio</h3>
          <p class="muted">Estamos armando resumen operativo, actividad cerrada y registro historico.</p>
        </div>
        <span class="badge">Cargando historial</span>
      </div>
      <div class="crew-loading-grid crew-loading-grid--dashboard">
        <article v-for="item in 4" :key="`history-stat-${item}`" class="surface crew-loading-card">
          <span class="crew-skeleton crew-skeleton-line crew-skeleton-line--sm"></span>
          <span class="crew-skeleton crew-skeleton-line crew-skeleton-line--md"></span>
          <span class="crew-skeleton crew-skeleton-line crew-skeleton-line--lg"></span>
        </article>
      </div>
      <article class="surface crew-loading-panel">
        <span class="crew-skeleton crew-skeleton-line crew-skeleton-line--md"></span>
        <span v-for="item in 5" :key="`history-row-${item}`" class="crew-skeleton crew-skeleton-panel"></span>
      </article>
    </section>

    <CrewHistorySection
      v-else-if="resolvedSection === 'historial'"
      :history-summary="historySummary"
      :history-entries="historyEntries"
    />

    <section v-else-if="resolvedSection === 'configuracion' && isConfigLoading" class="crew-loading-view">
      <div class="surface crew-loading-hero">
        <div>
          <span class="eyebrow">Configuracion</span>
          <h3>Preparando preferencias del portal</h3>
          <p class="muted">Sincronizando notificaciones, cobertura y reglas de escalamiento.</p>
        </div>
        <span class="badge">Cargando configuracion</span>
      </div>
      <article class="surface crew-loading-panel">
        <span class="crew-skeleton crew-skeleton-line crew-skeleton-line--lg"></span>
        <div class="crew-loading-toggle-list">
          <span v-for="item in 3" :key="`config-toggle-${item}`" class="crew-skeleton crew-skeleton-panel"></span>
        </div>
        <div class="crew-loading-form-grid">
          <span v-for="item in 2" :key="`config-field-${item}`" class="crew-skeleton crew-skeleton-field"></span>
        </div>
      </article>
    </section>

    <section v-else-if="resolvedSection === 'configuracion'" class="surface config-page">
      <div class="page-head">
        <div class="title-row">
          <span class="icon-badge"><CrewUiIcon name="dashboard" :size="20" /></span>
          <div>
            <span class="eyebrow">Configuracion</span>
            <h3>Preferencias del portal del sobrecargo</h3>
          </div>
        </div>
        <button class="primary-action action-button" type="button" @click="saveConfig">
          Guardar configuracion
        </button>
      </div>

      <section class="surface inner-card">
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
          <label>
            <span>Cobertura personal</span>
            <input v-model="configForm.personalCoverage" type="text" />
          </label>
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

.crew-portal-page {
  --crew-bg: #f3f6f8;
  --crew-surface: rgba(255, 255, 255, 0.96);
  --crew-surface-strong: #ffffff;
  --crew-ink: #0f1419;
  --crew-muted: #64707d;
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
  padding: 0.25rem 0 2rem;
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
  font-weight: 800;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    border-color 180ms ease,
    background 180ms ease;
}

.crew-portal-page :deep(.primary-action) {
  color: #ffffff;
  border: 1px solid transparent;
  background: linear-gradient(135deg, var(--crew-dark), var(--crew-dark-2));
  box-shadow: 0 16px 32px rgba(15, 20, 25, 0.18);
}

.crew-portal-page :deep(.primary-action:hover) {
  transform: translateY(-1px);
  box-shadow: 0 20px 36px rgba(15, 20, 25, 0.22);
}

.crew-portal-page :deep(.ghost-button),
.crew-portal-page :deep(.secondary-action) {
  color: var(--crew-ink);
  border: 1px solid var(--crew-line);
  background: linear-gradient(180deg, #ffffff, #f8fbfc);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.crew-portal-page :deep(.ghost-button:hover),
.crew-portal-page :deep(.secondary-action:hover) {
  transform: translateY(-1px);
  border-color: var(--crew-line-strong);
  box-shadow: 0 14px 28px rgba(11, 18, 24, 0.08);
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
  .toggle-row {
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

  .mission-status-pill {
    width: 100%;
    justify-content: center;
  }

  .crew-loading-hero {
    display: grid;
    justify-content: stretch;
  }
}

@keyframes crew-shimmer {
  100% {
    transform: translateX(100%);
  }
}
</style>
