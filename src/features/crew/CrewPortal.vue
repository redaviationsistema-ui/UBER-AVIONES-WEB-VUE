<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../../lib/api'
import { pickCollection, pickRecord, requestWithCandidates } from '../../lib/backendCrud'
import { roleBasePaths } from '../../data/roleFlows'
import { useAuthStore } from '../../stores/auth'
import { useUiStore } from '../../stores/ui'
import CrewAgendaSection from './CrewAgendaSection.vue'
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
const crewStatusOptions = ['Disponible', 'Descanso', 'No disponible']
const responseOptions = ['Confirmado', 'Rechazado', 'Solicitar revision']
const rejectReasons = ['No disponible', 'Empalme de agenda', 'Base distinta', 'Certificacion pendiente', 'Otro']
const incidentTypes = ['Catering', 'Cabina', 'Cliente', 'Seguridad', 'Horario', 'Proveedor', 'Otro']
const incidentPriorities = ['Baja', 'Media', 'Alta', 'Critica']
const incidentStates = ['Nueva', 'En revision', 'Escalada', 'Resuelta por admin', 'Cerrada']
const availabilityStates = ['Disponible', 'Descanso', 'No disponible']
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

const documentItems = ref([])

const incidents = ref([])
const incidentApiErrors = ref({})

const historyEntries = ref([])

const assignmentResponseForm = reactive({
  response: '',
  rejectReason: '',
  comment: '',
})

const agendaBlockForm = reactive({
  state: 'No disponible',
  blockType: '',
  reason: '',
})

const availabilityForm = reactive({
  from: '',
  to: '',
  state: 'Disponible',
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
const availabilitySummary = computed(() => {
  if (currentStatus.value === 'En vuelo') {
    return 'En vuelo'
  }
  if (currentStatus.value === 'Asignado') {
    return 'Asignado'
  }
  if (availabilityBlocks.value.some((item) => item.state === 'Suspendido')) {
    return 'Suspendido'
  }
  if (availabilityBlocks.value.some((item) => item.state === 'No disponible')) {
    return 'No disponible'
  }
  return storedOperationalStatus.value || ''
})

function formatPortalDate(value, options = {}) {
  if (!value || value === 'Pendiente') return 'Por definir'
  const normalized = String(value).includes('T') ? String(value) : `${value}T08:00`
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    ...options,
  }).format(date)
}

const checklistProgress = computed(() => {
  const statusMap = {
    Pendiente: 36,
    Confirmado: 58,
    Preparacion: 78,
    'En servicio': 94,
    Finalizado: 100,
    Incidencia: 71,
    Cancelado: 0,
  }

  return currentAssignment.value ? statusMap[currentAssignment.value.missionStatus] || 0 : 0
})

const validDocumentsCount = computed(() => approvedDocuments.value.length)
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
  base: profileForm.base || '',
  languages: activeLanguages.value.length ? activeLanguages.value.join(' / ') : '',
  hours: experienceHours.value ? `${experienceHours.value.toLocaleString('es-MX')} hrs` : '',
  certifications: profileForm.certifications || '',
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

const sectionLabelMap = {
  dashboard: 'Mi operacion',
  asignaciones: 'Asignaciones activas',
  calendario: 'Operacion del dia',
  disponibilidad: 'Disponibilidad personal',
  perfil: 'Perfil de vuelo',
  documentos: 'Centro operativo',
  incidencias: 'Incidencias operativas',
  historial: 'Historial de servicio',
  configuracion: 'Configuracion del portal',
}

const activeSectionLabel = computed(() => sectionLabelMap[resolvedSection.value] || 'Portal de sobrecargo')

const agendaItems = computed(() =>
  assignments.value.map((item) => ({
    id: item.id,
    flight: item.flight,
    route: item.route,
    date: item.date,
    time: item.time,
    aircraft: item.aircraft,
    briefing: item.briefing,
    serviceLevel: item.serviceLevel,
    vipRequirements: item.vipRequirements,
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

const assignmentErrors = computed(() => {
  const errors = {}
  if (currentAssignment.value?.responseDeadlinePassed) {
    errors.deadline = 'La ventana de respuesta ya vencio y requiere seguimiento de Admin / Red Sky.'
  }
  if (assignmentResponseForm.response === 'Rechazado' && !assignmentResponseForm.rejectReason) {
    errors.rejectReason = 'Selecciona un motivo para rechazar la asignacion.'
  }
  return errors
})

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

function currentMissionTime() {
  return new Date().toISOString().slice(11, 16)
}

function appendIncidentTimeline(incident, label) {
  const timeline = Array.isArray(incident.timeline) ? incident.timeline : []
  return [
    ...timeline,
    {
      id: `${incident.id}-${timeline.length + 1}`,
      time: currentMissionTime(),
      label,
    },
  ]
}

function normalizeMissionStatus(status = '') {
  const normalized = String(status).toLowerCase()
  if (['confirmada', 'confirmed'].includes(normalized)) return 'Confirmado'
  if (['preparacion', 'preparing', 'lista'].includes(normalized)) return 'Preparacion'
  if (['en_vuelo', 'in_progress', 'servicio_iniciado', 'incidencia'].includes(normalized)) {
    return normalized === 'incidencia' ? 'Incidencia' : 'En servicio'
  }
  if (['finalizada', 'completed'].includes(normalized)) return 'Finalizado'
  if (['cancelada', 'cancelled'].includes(normalized)) return 'Cancelado'
  return 'Pendiente'
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

function deriveCrewStatusFromAssignments() {
  if (assignments.value.some((item) => item.missionStatus === 'En servicio')) return 'En vuelo'
  if (assignments.value.some((item) => ['Confirmado', 'Preparacion'].includes(item.missionStatus))) return 'Asignado'
  if (availabilityBlocks.value.some((item) => item.state === 'Suspendido')) return 'Suspendido'
  if (availabilityBlocks.value.some((item) => item.state === 'No disponible')) return 'No disponible'
  return storedOperationalStatus.value || ''
}

function normalizeAssignment(raw = {}, detail = {}, index = 0) {
  const briefing = detail.briefing || {}
  const departure = briefing.salida || raw.departure_datetime || raw.started_at || ''
  const crewLifecycleStatus =
    detail.crew_status || raw.crew_status || raw.crewStatus || raw.crew_status_label || ''
  const missionStatus =
    normalizeCrewLifecycleStatus(crewLifecycleStatus) || normalizeMissionStatus(detail.status || raw.status)
  const responseStatus = normalizeAssignmentResponseStatus(raw, missionStatus)
  const origin = briefing.origen || raw.origin || ''
  const destination = briefing.destino || raw.destination || ''
  const route = origin && destination ? `${origin} -> ${destination}` : origin || destination || ''

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
    destination,
    catering: raw.catering || detail.catering || '',
    amenities: raw.amenities || detail.amenities || '',
    missionStatus,
    providerName: providerName.value,
    timeline: Array.isArray(detail.timeline) ? detail.timeline : [],
    operationId: raw.id || index + 1,
  }
}

function extractAssignmentsCollection(payload = {}) {
  return pickCollection(payload, ['assignments', 'asignaciones', 'operations', 'operaciones', 'data', 'items'])
}

async function fetchCrewAssignments() {
  const response = await requestWithCandidates([
    { method: 'get', path: '/sobrecargo/assignments' },
    { method: 'get', path: '/sobrecargo/asignaciones' },
    { method: 'get', path: '/sobrecargo/operations' },
    { method: 'get', path: '/sobrecargo/operaciones' },
  ])

  const collection = extractAssignmentsCollection(response)
  const detailResults = await Promise.allSettled(
    collection.map((item) =>
      requestWithCandidates([
        { method: 'get', path: `/sobrecargo/operations/${item.id}` },
        { method: 'get', path: `/sobrecargo/operaciones/${item.id}` },
      ]),
    ),
  )

  return collection.map((item, index) =>
    normalizeAssignment(
      item,
      detailResults[index]?.status === 'fulfilled'
        ? pickRecord(detailResults[index].value, ['operation', 'operacion', 'assignment', 'data'])
        : {},
      index,
    ),
  )
}

function normalizeCrewAvailabilityRecord(raw = {}, index = 0) {
  return {
    id: raw.id || index + 1,
    from: raw.from || raw.starts_at || raw.start_datetime || '',
    to: raw.to || raw.ends_at || raw.end_datetime || '',
    state: raw.state || raw.status || raw.availability_status || 'Disponible',
    base: raw.base || raw.city || profileForm.base || '',
    coverage: raw.coverage || raw.zone || configForm.personalCoverage || '',
    restriction: raw.restriction || raw.reason || raw.notes || '',
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
  providerContext.providerName =
    raw.provider?.commercial_name ||
    raw.provider?.company_name ||
    raw.provider_name ||
    providerContext.providerName ||
    ''
  profileForm.name = raw.name || raw.full_name || ''
  profileForm.phone = raw.phone || raw.phone_number || ''
  profileForm.email = raw.email || ''
  profileForm.base = raw.base || raw.city || ''
  profileForm.languages = Array.isArray(raw.languages) ? raw.languages.join(', ') : raw.languages || ''
  profileForm.certifications = Array.isArray(raw.certifications)
    ? raw.certifications.join(', ')
    : raw.certifications || raw.licenses || ''
  profileForm.experience = raw.experience || raw.bio || ''
  profileForm.photo = raw.photo || raw.avatar || ''
  profileForm.weeklyAvailability = raw.weekly_availability || raw.schedule || ''
  backendDocumentsSummary.value = raw.documents_summary || raw.documents_status || ''
  profileForm.documents = backendDocumentsSummary.value
  profileForm.profileState = raw.profile_state || raw.validation_status || raw.review_status || ''
  profileRating.value = raw.rating || raw.score || ''
  storedOperationalStatus.value = raw.current_status || ''
  currentStatus.value = raw.current_status || ''
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
  const backendStatus = next === 'Descanso' ? 'No disponible' : next
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
    storedOperationalStatus.value = backendStatus
    statusError.value = ''
    await loadPortal()
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

function updateAgendaState(id, next) {
  assignments.value = assignments.value.map((item) =>
    item.id === id
      ? {
          ...item,
          missionStatus: next === 'En briefing' ? 'Preparacion' : next === 'En servicio' ? 'En servicio' : next,
          assignmentConfirmed: next !== 'Pendiente',
          operationActive: ['Preparacion', 'En servicio', 'Incidencia'].includes(
            next === 'En briefing' ? 'Preparacion' : next,
          ),
        }
      : item,
  )
  currentStatus.value = deriveCrewStatusFromAssignments()
  const assignment = assignments.value.find((item) => item.id === id)
  pushHistory('Calendario actualizado', next, `La mision ${id} cambio a ${next}.`, assignment?.flight || String(id))
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
    await requestWithCandidates([
      {
        method: 'post',
        path: '/sobrecargo/availability',
        body: {
          from: `${referenceDate}T00:00`,
          to: `${referenceDate}T23:59`,
          state: agendaBlockForm.state,
          status: agendaBlockForm.state,
          base: profileForm.base,
          coverage: configForm.personalCoverage,
          restriction: [agendaBlockForm.blockType, agendaBlockForm.reason].filter(Boolean).join(' · '),
          notes: [agendaBlockForm.blockType, agendaBlockForm.reason].filter(Boolean).join(' · '),
        },
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

  if (response === 'Rechazado' && !assignmentResponseForm.rejectReason) {
    return ui.pushToast({
      tone: 'error',
      title: 'Motivo obligatorio',
      message: 'Debes capturar el motivo antes de rechazar la asignacion.',
    })
  }

  try {
    await requestWithCandidates([
      {
        method: 'post',
        path: `/sobrecargo/operations/${assignment.operationId || id}/respond`,
        body: {
          response,
          reject_reason: assignmentResponseForm.rejectReason || undefined,
          comment: assignmentResponseForm.comment || undefined,
        },
      },
      {
        method: 'post',
        path: `/sobrecargo/assignments/${assignment.operationId || id}/respond`,
        body: {
          response,
          reject_reason: assignmentResponseForm.rejectReason || undefined,
          comment: assignmentResponseForm.comment || undefined,
        },
      },
      {
        method: 'post',
        path: `/sobrecargo/operations/${assignment.operationId || id}/assignment-response`,
        body: {
          response,
          reject_reason: assignmentResponseForm.rejectReason || undefined,
          comment: assignmentResponseForm.comment || undefined,
        },
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

async function createAvailabilityBlock() {
  if (!availabilityForm.from || !availabilityForm.to) {
    return ui.pushToast({
      tone: 'error',
      title: 'Disponibilidad incompleta',
      message: 'Captura inicio y fin antes de guardar la disponibilidad personal.',
    })
  }

  const payload = {
    from: availabilityForm.from,
    to: availabilityForm.to,
    starts_at: availabilityForm.from,
    ends_at: availabilityForm.to,
    status: availabilityForm.state,
    state: availabilityForm.state,
    base: availabilityForm.base,
    coverage: availabilityForm.coverage,
    restriction: availabilityForm.restriction || 'Sin restriccion adicional',
    notes: availabilityForm.restriction || 'Sin restriccion adicional',
  }

  try {
    const response = await requestWithCandidates([
      { method: 'post', path: '/sobrecargo/availability', body: payload },
    ])

    const created = pickRecord(response, ['availability', 'block', 'data'])
    availabilityBlocks.value.unshift(
      Object.keys(created || {}).length
        ? normalizeCrewAvailabilityRecord(created, availabilityBlocks.value.length)
        : normalizeCrewAvailabilityRecord(payload, availabilityBlocks.value.length),
    )
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

async function loadPortal() {
  const [dashboardResult, assignmentsResult, profileResult, documentsResult, availabilityResult, incidentsResult] = await Promise.allSettled([
    api.get('/sobrecargo/dashboard'),
    fetchCrewAssignments(),
    requestWithCandidates([{ method: 'get', path: '/sobrecargo/profile' }]),
    requestWithCandidates([{ method: 'get', path: '/sobrecargo/documents' }]),
    requestWithCandidates([{ method: 'get', path: '/sobrecargo/availability' }]),
    requestWithCandidates([{ method: 'get', path: '/sobrecargo/incidents' }]),
  ])

  metrics.value =
    dashboardResult.status === 'fulfilled'
      ? dashboardResult.value.metrics || metrics.value
      : metrics.value

  if (assignmentsResult.status === 'fulfilled') {
    assignments.value = assignmentsResult.value
  }

  if (profileResult.status === 'fulfilled') {
    hydrateProfile(pickRecord(profileResult.value, ['profile', 'user', 'data']))
  }

  if (documentsResult.status === 'fulfilled') {
    const collection = pickCollection(documentsResult.value, ['documents', 'documentos', 'data'])
    documentItems.value = collection.map(normalizeCrewDocumentRecord)
    syncDocumentSummary()
  }

  if (availabilityResult.status === 'fulfilled') {
    const collection = pickCollection(availabilityResult.value, ['availability', 'disponibilidad', 'data', 'items'])
    availabilityBlocks.value = collection.map(normalizeCrewAvailabilityRecord)
  }

  if (incidentsResult.status === 'fulfilled') {
    const collection = pickCollection(incidentsResult.value, ['incidents', 'incidencias', 'data', 'items'])
    incidents.value = collection.map(normalizeCrewIncidentRecord)
  }

  providerContext.providerName = providerName.value
  providerContext.operatorLabel = auth.user?.provider?.commercial_name
    ? 'Proveedor validado · coordinacion Admin / Red Sky'
    : 'Operacion coordinada por Admin / Red Sky'
  providerContext.managedBy = 'Admin / Red Sky'
  providerContext.approvalState = profileForm.profileState
  currentStatus.value = deriveCrewStatusFromAssignments()
  rebuildHistoryFromBackend()
}

onMounted(loadPortal)
</script>

<template>
  <div class="crew-portal-page">
    <section v-if="resolvedSection !== 'dashboard'" class="surface crew-context-ribbon">
      <div class="ribbon-copy">
        <p class="eyebrow">Operacion premium sincronizada</p>
        <strong>{{ activeSectionLabel }}</strong>
        <p>Tu perfil de vuelo define prioridad de matching, preparacion operativa y visibilidad ante Admin / Red Sky.</p>
      </div>
      <div class="ribbon-metrics">
        <span class="ribbon-pill">{{ providerName }}</span>
        <span class="ribbon-pill">{{ profileForm.profileState }}</span>
        <span class="ribbon-pill">{{ currentStatus }}</span>
      </div>
    </section>

    <CrewDashboardSection
      v-if="resolvedSection === 'dashboard'"
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
      :assignment-response-form="assignmentResponseForm"
      :assignment-errors="assignmentErrors"
      :response-options="responseOptions"
      :reject-reasons="rejectReasons"
      @update-field="updateField"
      @confirm="(id) => respondAssignment(id, 'Confirmado')"
      @reject="(id) => respondAssignment(id, 'Rechazado')"
      @request-change="(id) => respondAssignment(id, 'Solicitar revision')"
      @confirm-briefing="confirmBriefing"
    />

    <section v-else-if="resolvedSection === 'calendario'" class="section-stack">
      <CrewAgendaSection
        :agenda-items="agendaItems"
        :agenda-block-form="agendaBlockForm"
        :agenda-errors="agendaErrors"
        :agenda-states="assignmentStatusOptions"
        :block-types="blockTypes"
        @update-field="updateField"
        @confirm-flight="(id) => updateAgendaState(id, 'Confirmado')"
        @mark-en-camino="(id) => updateAgendaState(id, 'Preparacion')"
        @mark-briefing="(id) => updateAgendaState(id, 'Preparacion')"
        @mark-service="startAssignedService"
        @mark-finalizado="finalizeAssignedService"
        @request-block="requestBlock"
      />
    </section>

    <section v-else-if="resolvedSection === 'disponibilidad'" class="surface availability-page">
      <div class="page-head">
        <div class="title-row">
          <span class="icon-badge"><CrewUiIcon name="agenda" :size="20" /></span>
          <div>
            <span class="eyebrow">Disponibilidad</span>
            <h3>Disponibilidad personal del sobrecargo</h3>
          </div>
        </div>
        <button class="primary-action action-button" type="button" @click="createAvailabilityBlock">
          <CrewUiIcon name="checklist" :size="16" />
          Guardar disponibilidad
        </button>
      </div>

      <div class="availability-layout">
        <section class="surface inner-card">
          <h4>Calendario y cobertura</h4>
          <div class="form-grid">
            <label>
              <span>Inicio</span>
              <input v-model="availabilityForm.from" type="datetime-local" />
            </label>
            <label>
              <span>Fin</span>
              <input v-model="availabilityForm.to" type="datetime-local" />
            </label>
            <label>
              <span>Estado</span>
              <select v-model="availabilityForm.state">
                <option v-for="item in availabilityStates" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label>
              <span>Base</span>
              <input v-model="availabilityForm.base" type="text" />
            </label>
            <label>
              <span>Cobertura</span>
              <input v-model="availabilityForm.coverage" type="text" />
            </label>
            <label class="span-2">
              <span>Restricciones</span>
              <textarea v-model="availabilityForm.restriction" rows="3"></textarea>
            </label>
          </div>
        </section>

        <section class="surface inner-card">
          <h4>Bloqueos y estados actuales</h4>
          <div class="record-list">
            <article v-for="item in availabilityBlocks" :key="item.id" class="record-card">
              <div>
                <strong>{{ item.state }}</strong>
                <p>{{ item.base }} · {{ item.coverage }}</p>
                <small>{{ item.from || 'Sin inicio' }} → {{ item.to || 'Sin fin' }}</small>
                <small>{{ item.restriction }}</small>
              </div>
              <button type="button" class="ghost-button" @click="removeAvailabilityBlock(item.id)">
                Liberar
              </button>
            </article>
          </div>
        </section>
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

    <CrewHistorySection
      v-else-if="resolvedSection === 'historial'"
      :history-summary="historySummary"
      :history-entries="historyEntries"
    />

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
.toggle-list {
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
.inner-card {
  padding: 1.4rem;
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
  .form-grid {
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
  .inner-card {
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
}
</style>
