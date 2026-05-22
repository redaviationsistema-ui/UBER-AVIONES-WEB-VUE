<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { requestWithCandidates, pickCollection, pickRecord } from '../../lib/backendCrud'
import { resolveMediaUrl } from '../../lib/api'
import { resolveProviderIdForUser } from '../../lib/providerContext'
import {
  buildSharedFlowStepStates,
  buildWorkflowApiPayload,
  normalizeWorkflowLabel,
  resolveSharedVisualWorkflowStepId,
  resolveSharedWorkflowStatus,
  resolveWorkflowState,
  SHARED_WORKFLOW_STEPS,
} from '../../utils/flightWorkflow'
import { emitWorkflowSync, subscribeWorkflowSync } from '../../lib/workflowSync'
import { deriveClientWorkflowStatus } from '../client/clientBookingApi'
import OperatorCrewSection from './OperatorCrewSection.vue'
import { useAuthStore } from '../../stores/auth'
import { useUiStore } from '../../stores/ui'

const props = defineProps({
  section: { type: String, required: true },
})

const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()

const loading = ref(false)
const refreshingRequests = ref(false)
const portalLoadSequence = ref(0)
let portalLoadScheduled = false
const OPERATOR_REQUESTS_POLL_INTERVAL_MS = 10000
let requestsPollTimer = null
let removeWorkflowSyncSubscription = null
const OPERATOR_FLOW_STEPS = SHARED_WORKFLOW_STEPS
const companyId = ref(null)
const settings = reactive({
  emailNotifications: false,
  paymentAlerts: false,
  opsAlerts: false,
  crewApprovalMode: 'suggest_only',
})

const availabilityStatusOptions = [
  'Disponible',
  'No disponible',
  'En mantenimiento',
  'Reservado',
  'Pendiente de confirmacion',
]
const operationStatusOptions = [
  'Confirmada',
  'En preparacion',
  'Lista',
  'En vuelo',
  'Finalizada',
  'Con incidencia',
  'Cancelada',
]
const incidentStatusOptions = ['Abierta', 'En revision', 'Resuelta', 'Cerrada']
const incidentTypeOptions = [
  'Retraso',
  'Mantenimiento',
  'Cambio de aeronave',
  'Problema de tripulacion',
  'Problema climatico',
  'Problema operativo',
  'Servicio al cliente',
]
const crewRoleOptions = ['Sobrecargo', 'Piloto', 'Copiloto', 'Coordinador']
const crewStateOptions = ['Disponible', 'Descanso', 'Asignado', 'No disponible', 'Suspendido']
const defaultCrewBases = ['Toluca', 'CDMX', 'Monterrey', 'Cancun', 'Guadalajara', 'Internacional']

const company = reactive(createEmptyCompany())
const aircraft = ref([])
const availability = ref([])
const requests = ref([])
const operations = ref([])
const crew = ref([])
const incidents = ref([])
const payments = ref([])
const history = ref([])
const editingAircraftId = ref(null)
const selectedAvailabilityCalendarAircraftId = ref('all')
const availabilityWeekAnchor = ref(startOfAvailabilityWeek(new Date()))

const companyForm = reactive({
  legalName: '',
  rfc: '',
  tradeName: '',
  phone: '',
  email: '',
  address: '',
  legalRepresentative: '',
  jetAPrice: '',
  marginPercent: '',
  fixedFee: '',
  newDocumentFile: null,
  newDocumentName: '',
})

const aircraftForm = reactive({
  name: '',
  manufacturer: '',
  category: '',
  engineType: '',
  engineClass: '',
  registration: '',
  year: '',
  capacity: 1,
  speedKnots: '',
  amenities: '',
  base: '',
  coverage: '',
  airportExpensesUsd: '',
  hourlyPrice: '',
  minimumHours: '',
  operationalCost: '',
  fuelBurnGallonsPerHour: '',
  engineReserveRate: '',
  insuranceRate: '',
  maintenanceRate: '',
  crewRate: '',
  repositioningFee: '',
  overnightFee: '',
})

const imageForm = reactive({
  aircraftId: null,
  mainFile: null,
  cabinFile: null,
  seatsFile: null,
  amenitiesFile: null,
})

const documentForm = reactive({
  aircraftId: null,
  type: 'maintenance_sticker',
  file: null,
  files: [],
  fileName: '',
  expiresAt: '',
  dragActive: false,
})
const documentPreview = reactive({
  open: false,
  file: null,
  url: '',
})

const availabilityForm = reactive({
  aircraftId: null,
  from: '',
  to: '',
  status: 'No disponible',
  reason: '',
})

const incidentForm = reactive({
  requestId: null,
  type: 'Problema operativo',
  flight: '',
  status: 'Abierta',
  priority: 'Media',
  responsible: '',
  evidence: '',
  comment: '',
  actionTaken: '',
})

const crewForm = reactive({
  name: '',
  role: 'Sobrecargo',
  phone: '',
  email: '',
  base: '',
  state: 'Disponible',
  certifications: '',
  certificationExpiry: '',
  flightHours: '',
  authorizedAircraft: '',
  validationStatus: 'Pendiente',
  internalRating: '',
  documentsCount: '',
  lastUpdated: '',
  languages: '',
  availability: 'Inmediata',
  rating: '4.9/5',
})

const formErrors = reactive({
  company: {},
  aircraft: {},
  document: {},
  availability: {},
  incident: {},
  crew: {},
  settings: {},
})

const formSuccess = reactive({
  company: '',
  aircraft: '',
  document: '',
  availability: '',
  incident: '',
  crew: '',
  settings: '',
})

const aircraftWizardOpen = ref(false)
const aircraftWizardStep = ref(1)
const aircraftWizardSubmitting = ref(false)
const aircraftWizardReadOnly = ref(false)
const editingCrewId = ref(null)
const savingCrew = ref(false)
const operationCrewDrafts = reactive({})
const requestSearch = ref('')
const requestStatusFilter = ref('all')
const requestPriorityFilter = ref('all')
const selectedRequestId = ref(null)
const requestInternalCommentDraft = ref('')
const archivedTrayOpen = ref(false)
const requestStatusUpdate = reactive({
  requestId: null,
  action: '',
})
const requestsConnectionWarningShown = ref(false)
const aircraftDecisionMode = ref('best_match')
const aircraftFilterBase = ref('all')
const aircraftFilterType = ref('all')
const aircraftFilterSort = ref('compatibility')
const aircraftWizardSteps = [
  { id: 1, label: 'General', description: 'Modelo, fabricante, matricula y base operativa.' },
  { id: 2, label: 'Operacion', description: 'Capacidad, cobertura y costos base.' },
  { id: 3, label: 'Galeria', description: 'Imagen principal, cabina, asientos y amenidades.' },
  { id: 4, label: 'Documentacion', description: 'Seguro, vigencias y expediente tecnico.' },
  { id: 5, label: 'Revision', description: 'Resumen final antes de publicar o revisar.' },
]
const aircraftCategoryOptions = [
  { value: 'Helicoptero', label: 'Helicóptero' },
  { value: 'Turboprop', label: 'Turboprop' },
  { value: 'Light Jet', label: 'Light Jet' },
  { value: 'Mid Jet', label: 'Mid Jet' },
  { value: 'Heavy Jet', label: 'Heavy Jet' },
]
const aircraftCategoryRules = {
  TURBOPROP: {
    engineType: 'turboprop',
    engineClass: 'TURBOPROP',
    airportExpensesUsd: 600,
  },
  'LIGHT JET': {
    engineType: 'turbofan',
    engineClass: 'LIGHT_JET',
    airportExpensesUsd: 800,
  },
  'MID JET': {
    engineType: 'turbofan',
    engineClass: 'MIDSIZE_JET',
    airportExpensesUsd: 1000,
  },
  'HEAVY JET': {
    engineType: 'turbofan',
    engineClass: 'HEAVY_JET',
    airportExpensesUsd: 2000,
  },
  HELICOPTERO: {
    engineType: 'turboshaft',
    engineClass: 'HELICOPTER',
    airportExpensesUsd: 700,
  },
}
const aircraftDocumentTypes = [
  { id: 'maintenance_sticker', label: 'Sticker de mantenimiento', requiresExpiry: false, accepts: ['image', 'pdf'] },
  { id: 'flight_logbook', label: 'Bitacora de vuelo', requiresExpiry: false, accepts: ['image', 'pdf'] },
]
const maxAircraftDocumentFiles = 12
const maxImageDocumentBytes = 8 * 1024 * 1024
const maxPdfDocumentBytes = 25 * 1024 * 1024
const configuredTripWorkflowPath = String(
  import.meta.env.VITE_CLIENT_TRIP_WORKFLOW_PATH || '',
).trim()
const operatorWorkflowPathCandidates = [
  configuredTripWorkflowPath,
  '/operator/requests/:id/workflow',
  '/proveedor/solicitudes/:id/workflow',
].filter((path) => Boolean(path) && !String(path).includes('/admin/'))

const providerId = computed(() =>
  Number(auth.providerId || resolveProviderIdForUser(auth.user) || 0),
)
const canLoadProviderData = computed(() => auth.initialized && auth.isAuthenticated)
const providerName = computed(
  () => auth.user?.company_name || auth.user?.name || company.tradeName || 'Proveedor',
)
const activeAircraft = computed(
  () =>
    aircraft.value.filter((item) => ['aprobada', 'trial_active', 'active'].includes(item.status))
      .length,
)
const pendingRequests = computed(
  () => requests.value.filter((item) => item.status === 'Pendiente').length,
)
const activeOperations = computed(
  () =>
    operations.value.filter((item) => !['Finalizada', 'Cancelada'].includes(item.status)).length,
)
const openIncidents = computed(
  () => incidents.value.filter((item) => !['Resuelta', 'Cerrada'].includes(item.status)).length,
)
const paymentsPending = computed(
  () => payments.value.filter((item) => item.status === 'Pendiente').length,
)
const aircraftOptions = computed(() =>
  aircraft.value.map((item) => ({
    id: item.id,
    label: `${item.name} - ${item.registration || 'Sin matricula'} - ${item.base || 'Sin base'}`,
  })),
)
const selectedAvailabilityAircraft = computed(
  () => aircraft.value.find((item) => item.id === Number(availabilityForm.aircraftId)) || null,
)
const availabilityCalendarAircraftOptions = computed(() => [
  { id: 'all', label: 'Toda la flota' },
  ...aircraft.value.map((item) => ({
    id: String(item.id),
    label: `${item.name} · ${item.registration || 'Sin matricula'}`,
  })),
])
const availabilityCalendarWeekDays = computed(() =>
  Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(availabilityWeekAnchor.value, offset)
    return {
      key: date.toISOString(),
      date,
      shortLabel: new Intl.DateTimeFormat('es-MX', {
        weekday: 'short',
        timeZone: 'America/Mexico_City',
      }).format(date),
      dayNumber: new Intl.DateTimeFormat('es-MX', {
        day: '2-digit',
        timeZone: 'America/Mexico_City',
      }).format(date),
      monthLabel: new Intl.DateTimeFormat('es-MX', {
        month: 'short',
        timeZone: 'America/Mexico_City',
      }).format(date),
      isToday: isSameAvailabilityDay(date, new Date()),
    }
  }),
)
const availabilityCalendarRows = computed(() => {
  const selectedAircraftId = selectedAvailabilityCalendarAircraftId.value
  const visibleAircraft =
    selectedAircraftId === 'all'
      ? aircraft.value
      : aircraft.value.filter((item) => String(item.id) === String(selectedAircraftId))

  return visibleAircraft.map((plane) => ({
    plane,
    cells: availabilityCalendarWeekDays.value.map((day) =>
      buildAvailabilityCalendarCell(plane, day.date, availability.value),
    ),
  }))
})
const availabilityCalendarWindowLabel = computed(() => {
  const firstDay = availabilityCalendarWeekDays.value[0]?.date
  const lastDay = availabilityCalendarWeekDays.value[availabilityCalendarWeekDays.value.length - 1]?.date
  if (!firstDay || !lastDay) return 'Semana operativa'

  const formatter = new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Mexico_City',
  })

  return `${formatter.format(firstDay)} - ${formatter.format(lastDay)}`
})
const selectedImageAircraft = computed(
  () => aircraft.value.find((item) => item.id === Number(imageForm.aircraftId)) || null,
)
const selectedDocumentAircraft = computed(
  () => aircraft.value.find((item) => item.id === Number(documentForm.aircraftId)) || null,
)
const selectedDocumentType = computed(
  () => aircraftDocumentTypes.find((item) => item.id === documentForm.type) || aircraftDocumentTypes[0],
)
const crewBases = computed(() => {
  const uniqueBases = new Set([
    ...defaultCrewBases,
    ...aircraft.value.map((item) => String(item.base || '').trim()).filter(Boolean),
    ...crew.value.map((item) => String(item.base || '').trim()).filter(Boolean),
  ])
  return Array.from(uniqueBases)
})
const assignableCrewOptions = computed(() =>
  crew.value.filter(
    (member) => !['Suspendido', 'No disponible'].includes(member.state || member.availability),
  ),
)
const crewLastSyncLabel = computed(() => {
  const latestTimestamp = crew.value
    .map((item) => new Date(item.lastUpdated || ''))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((first, second) => second.getTime() - first.getTime())[0]

  if (latestTimestamp) {
    return formatDateTimeDisplay(latestTimestamp.toISOString())
  }

  return loading.value ? 'Sincronizando...' : 'Sin registros'
})
const crewBackendStatus = computed(() => (loading.value ? 'Sincronizando backend' : 'Backend operativo'))
const crewConnectedUsers = computed(() => Math.max(assignableCrewOptions.value.length, 1))
const fleetGroupedByStatus = computed(() => ({
  aprobadas: aircraft.value.filter((item) => humanizeAircraftStatus(item.status) === 'Aprobada')
    .length,
  revision: aircraft.value.filter(
    (item) => humanizeAircraftStatus(item.status) === 'Pendiente revision',
  ).length,
  bloqueadas: aircraft.value.filter((item) => humanizeAircraftStatus(item.status) === 'Bloqueada')
    .length,
  archivo: aircraft.value.filter((item) =>
    ['Archivada', 'Suspendida', 'Inactiva', 'Rechazada'].includes(
      humanizeAircraftStatus(item.status),
    ),
  ).length,
}))
const aircraftPricingRows = computed(() =>
  aircraft.value.map((item) => ({
    id: item.id,
    name: item.name,
    hourlyPrice: item.hourlyPrice,
    minimumHours: item.minimumHours,
    repositioningCost: item.repositioningCost,
    overnightCost: item.overnightCost,
    waitingCost: item.waitingCost,
    fboCost: item.fboCost,
    permitsCost: item.permitsCost,
    cateringBaseCost: item.cateringBaseCost,
  })),
)
const dashboardCards = computed(() => [
  {
    icon: '✈',
    label: 'Aeronaves activas',
    value: activeAircraft.value,
    tone: activeAircraft.value ? 'success' : 'neutral',
    status: activeAircraft.value ? 'Flota disponible' : 'Sin flota activa',
    detail: activeAircraft.value
      ? `${fleetGroupedByStatus.value.revision} en revision y ${fleetGroupedByStatus.value.bloqueadas} bloqueadas.`
      : 'Registra aeronaves para activar la operacion.',
  },
  {
    icon: '📄',
    label: 'Solicitudes pendientes',
    value: pendingRequests.value,
    tone: pendingRequests.value ? 'warning' : 'success',
    status: pendingRequests.value ? 'Pendientes por atender' : 'Sin solicitudes activas',
    detail: pendingRequests.value
      ? 'Revisa matching, respuesta y SLA operativo.'
      : 'Sistema listo para recibir nuevas solicitudes.',
  },
  {
    icon: '📡',
    label: 'Operaciones activas',
    value: activeOperations.value,
    tone: activeOperations.value ? 'info' : 'success',
    status: activeOperations.value ? 'Vuelos en seguimiento' : 'Sistema listo para operar',
    detail: activeOperations.value
      ? 'Hay operaciones en curso con trazabilidad viva.'
      : 'No hay operaciones abiertas en este momento.',
  },
  {
    icon: '💳',
    label: 'Pagos pendientes',
    value: paymentsPending.value,
    tone: paymentsPending.value ? 'warning' : 'success',
    status: paymentsPending.value ? 'Pendientes por liberar' : 'Sin pagos pendientes',
    detail: paymentsPending.value
      ? 'Valida liquidaciones y conciliacion con administracion.'
      : 'La cartera operativa esta al corriente.',
  },
  {
    icon: '🛡',
    label: 'Estado empresa',
    value: companyStatusMeta.value.label,
    tone: companyStatusMeta.value.tone,
    status: companyStatusMeta.value.headline,
    detail: company.reviewStatus || 'Sin estado visible',
  },
  {
    icon: '⚠',
    label: 'Incidencias abiertas',
    value: openIncidents.value,
    tone: openIncidents.value ? 'danger' : 'success',
    status: openIncidents.value ? 'Seguimiento activo' : 'Operacion limpia',
    detail: openIncidents.value
      ? 'Hay incidencias que requieren atencion operativa.'
      : 'No hay incidencias abiertas en la linea operativa.',
  },
])
const aircraftDueDocuments = computed(() =>
  aircraft.value.reduce((total, item) => {
    const expiringDocuments = (item.documents || []).filter((document) => {
      if (!document.expiresAt) return false
      const expiration = new Date(document.expiresAt)
      if (Number.isNaN(expiration.getTime())) return false
      const diffDays = Math.ceil((expiration.getTime() - Date.now()) / 86400000)
      return diffDays >= 0 && diffDays <= 30
    })
    return total + expiringDocuments.length
  }, 0),
)
const aircraftAvailableToday = computed(
  () => aircraft.value.filter((item) => getAircraftLiveStatus(item).label === 'Disponible').length,
)
const aircraftOperationalKpis = computed(() => [
  {
    label: 'Aeronaves activas',
    value: activeAircraft.value,
    detail: `${fleetGroupedByStatus.value.revision} en revision y ${fleetGroupedByStatus.value.bloqueadas} bloqueadas.`,
    tone: 'success',
  },
  {
    label: 'Disponibles hoy',
    value: aircraftAvailableToday.value,
    detail: `${activeOperations.value} operaciones siguen en curso hoy.`,
    tone: 'info',
  },
  {
    label: 'Proximos vuelos',
    value: activeOperations.value,
    detail: `${pendingRequests.value} solicitudes aun esperan respuesta operativa.`,
    tone: 'neutral',
  },
  {
    label: 'Docs por vencer',
    value: aircraftDueDocuments.value,
    detail: 'Vencimientos dentro de los proximos 30 dias.',
    tone: aircraftDueDocuments.value ? 'warning' : 'success',
  },
])
const aircraftOperationalTimeline = computed(() =>
  [
    ...operations.value.slice(0, 3).map((operation) => ({
      id: `operation-${operation.id}`,
      time: formatDateTimeDisplay(operation.departure),
      title: operation.status,
      detail: `${operation.route} · ${operation.aircraft || 'Aeronave por definir'}`,
      tone: 'info',
    })),
    ...requests.value.slice(0, 2).map((request) => ({
      id: `request-${request.id}`,
      time: formatDateTimeDisplay(request.date),
      title: `Solicitud #${request.id}`,
      detail: `${getRequestRouteLabel(request)} · ${normalizeWorkflowLabel(resolveRequestWorkflowValue(request))}`,
      tone: isRequestAccepted(request)
        ? 'success'
        : isRequestRejected(request)
          ? 'danger'
          : 'warning',
    })),
    ...incidents.value.slice(0, 2).map((incident) => ({
      id: `incident-${incident.id}`,
      time: formatDateTimeDisplay(incident.createdAt),
      title: `Incidencia: ${incident.type}`,
      detail: `${incident.flight} · ${incident.status}`,
      tone: 'danger',
    })),
  ].slice(0, 6),
)
const aircraftPriorityNotes = computed(() => [
  {
    id: 'review',
    label: 'En revision',
    value: fleetGroupedByStatus.value.revision,
    detail: 'Aeronaves listas para seguimiento administrativo o documental.',
  },
  {
    id: 'blocked',
    label: 'Bloqueadas',
    value: fleetGroupedByStatus.value.bloqueadas,
    detail: 'Unidades que requieren accion operativa o tecnica inmediata.',
  },
  {
    id: 'documents',
    label: 'Documentos sensibles',
    value: aircraftDueDocuments.value,
    detail: 'Expedientes con vencimiento cercano que conviene atender hoy.',
  },
])
const aircraftWizardTitle = computed(() =>
  editingAircraftId.value ? 'Editar aeronave y control documental' : 'Registrar nueva aeronave',
)
const companyStatusMeta = computed(() => {
  const normalized = String(company.status || company.reviewStatus || '').toLowerCase()
  if (['approved', 'aprobada', 'aprobado', 'active'].includes(normalized)) {
    return { label: 'Aprobado', tone: 'success', headline: 'Operador verificado' }
  }
  if (normalized.includes('revision') || normalized.includes('pending')) {
    return { label: 'En revision', tone: 'warning', headline: 'Validacion en proceso' }
  }
  if (
    normalized.includes('reject') ||
    normalized.includes('cambio') ||
    normalized.includes('suspend')
  ) {
    return { label: 'Requiere cambios', tone: 'danger', headline: 'Accion requerida' }
  }

  return { label: company.status || 'Sin estado', tone: 'neutral', headline: 'Perfil operativo' }
})
const companyLastAuditDate = computed(() => {
  const latestCompanyEntry = history.value.find((entry) =>
    ['Mi empresa', 'provider_company'].includes(String(entry.module || '')),
  )
  return latestCompanyEntry?.date || 'Sin revision registrada'
})
const companyOperationalBase = computed(() => aircraft.value[0]?.base || 'Base por definir')
const companyOnboardingSteps = computed(() => {
  const hasCompanyData = Boolean(companyForm.legalName && companyForm.address)
  const hasContact = Boolean(companyForm.phone && companyForm.email)
  const hasFiscal = Boolean(companyForm.rfc)
  const hasDocuments = company.documents.length > 0
  const hasAircraft = aircraft.value.length > 0

  return [
    { id: 'company', label: 'Datos empresa', complete: hasCompanyData },
    { id: 'contact', label: 'Contacto', complete: hasContact },
    { id: 'tax', label: 'RFC', complete: hasFiscal },
    { id: 'documents', label: 'Documentos', complete: hasDocuments, pending: !hasDocuments },
    { id: 'aircraft', label: 'Aeronaves', complete: hasAircraft, pending: !hasAircraft },
  ]
})
const companyOnboardingProgress = computed(() => {
  const completed = companyOnboardingSteps.value.filter((step) => step.complete).length
  return {
    completed,
    total: companyOnboardingSteps.value.length,
    percent: Math.round((completed / companyOnboardingSteps.value.length) * 100),
  }
})
const companyValidationSummary = computed(() => [
  {
    label: 'Estado empresa',
    value: companyStatusMeta.value.label,
    tone: companyStatusMeta.value.tone,
  },
  {
    label: 'Validacion SAT',
    value: companyForm.rfc ? 'Verificada' : 'Pendiente',
    tone: companyForm.rfc ? 'success' : 'warning',
  },
  {
    label: 'Documentacion legal',
    value: company.documents.length ? `${company.documents.length} documento(s)` : 'Sin documentos',
    tone: company.documents.length ? 'success' : 'warning',
  },
  {
    label: 'Aeronaves activas',
    value: `${activeAircraft.value} registradas`,
    tone: activeAircraft.value ? 'success' : 'neutral',
  },
  {
    label: 'Trial',
    value: aircraft.value[0]?.trialDaysLeft
      ? `${aircraft.value[0].trialDaysLeft} dias restantes`
      : 'Sin trial visible',
    tone: aircraft.value[0]?.trialDaysLeft ? 'info' : 'neutral',
  },
  {
    label: 'Ultima revision admin',
    value: companyLastAuditDate.value,
    tone: 'neutral',
  },
])
const companyAlerts = computed(() => {
  const alerts = []

  if (!company.documents.length) {
    alerts.push({ tone: 'warning', title: 'Falta cargar documentacion legal' })
  }
  if (!aircraft.value.length) {
    alerts.push({ tone: 'info', title: 'Empresa lista para registrar aeronaves' })
  }
  if (company.documents.length && aircraft.value.length) {
    alerts.push({ tone: 'success', title: 'Perfil listo para seguir con flota y validacion' })
  }

  return alerts.slice(0, 2)
})
const companyAuditTimeline = computed(() =>
  history.value
    .filter((entry) => ['Mi empresa', 'provider_company'].includes(String(entry.module || '')))
    .slice(0, 4)
    .map((entry) => ({
      id: entry.id,
      date: entry.date,
      action: entry.action,
      actor: entry.actor,
    })),
)
const dashboardCompletion = computed(() => {
  const modules = [
    Boolean(companyForm.legalName && companyForm.rfc && companyForm.email),
    company.documents.length > 0,
    aircraft.value.length > 0,
    Boolean(availability.value.length > 0),
    Boolean(aircraftPricingRows.value.some((row) => Number(row.hourlyPrice || 0) > 0)),
  ]
  const completed = modules.filter(Boolean).length
  return {
    completed,
    total: modules.length,
    percent: Math.round((completed / modules.length) * 100),
  }
})
const dashboardGlobalStatus = computed(() => {
  if (
    companyStatusMeta.value.tone === 'success' &&
    aircraft.value.length &&
    availability.value.length
  ) {
    return {
      tone: 'success',
      title: 'Operador listo para recibir solicitudes',
      detail: 'La empresa, la flota y la disponibilidad minima ya estan configuradas.',
    }
  }

  return {
    tone: 'warning',
    title: 'Completa configuracion para activar operaciones',
    detail: 'Aun faltan pasos de onboarding para dejar el operador completamente operativo.',
  }
})
const dashboardAlerts = computed(() => {
  const alerts = []
  if (aircraftDueDocuments.value) {
    alerts.push({
      tone: 'warning',
      title: `${aircraftDueDocuments.value} documento(s) vencen pronto`,
      action: 'Revisar flota',
      section: 'aeronaves',
    })
  }
  alerts.push({
    tone: companyStatusMeta.value.tone === 'success' ? 'success' : 'warning',
    title:
      companyStatusMeta.value.tone === 'success'
        ? 'Operador aprobado'
        : 'Validacion de empresa en proceso',
    action: 'Ver empresa',
    section: 'empresa',
  })
  if (!availability.value.length) {
    alerts.push({
      tone: 'warning',
      title: 'Falta configurar disponibilidad',
      action: 'Actualizar',
      section: 'disponibilidad',
    })
  }
  return alerts.slice(0, 3)
})
const dashboardQuickActions = computed(() => [
  {
    id: 'fleet',
    icon: '✈',
    label: 'Registrar aeronave',
    detail: 'Alta premium de flota',
    action: () => goToSection('aeronaves'),
  },
  {
    id: 'requests',
    icon: '📄',
    label: 'Ver solicitudes',
    detail: `${pendingRequests.value} pendientes`,
    action: () => goToSection('solicitudes'),
  },
  {
    id: 'availability',
    icon: '🗓',
    label: 'Actualizar disponibilidad',
    detail: 'Bloqueos y agenda operativa',
    action: () => goToSection('disponibilidad'),
  },
  {
    id: 'docs',
    icon: '📁',
    label: 'Subir documento',
    detail: 'Expediente legal y flota',
    action: () => goToSection('empresa'),
  },
])
const dashboardChecklist = computed(() => [
  {
    id: 'empresa',
    icon: '🛡',
    label: 'Mi empresa',
    status: companyForm.legalName && companyForm.rfc ? 'complete' : 'pending',
    detail:
      companyForm.legalName && companyForm.rfc
        ? 'Perfil corporativo completo'
        : 'Completa identidad fiscal',
    cta: 'Abrir empresa',
    section: 'empresa',
  },
  {
    id: 'aeronaves',
    icon: '✈',
    label: 'Aeronaves',
    status: aircraft.value.length ? 'complete' : 'pending',
    detail: aircraft.value.length
      ? `${aircraft.value.length} registradas`
      : 'Pendiente registrar flota',
    cta: 'Gestionar flota',
    section: 'aeronaves',
  },
  {
    id: 'costos',
    icon: '💳',
    label: 'Costos base',
    status: aircraftPricingRows.value.some((row) => Number(row.hourlyPrice || 0) > 0)
      ? 'warning'
      : 'pending',
    detail: aircraftPricingRows.value.some((row) => Number(row.hourlyPrice || 0) > 0)
      ? 'Costos capturados'
      : 'Falta configurar costos',
    cta: 'Configurar',
    section: 'costos',
  },
  {
    id: 'disponibilidad',
    icon: '📡',
    label: 'Disponibilidad',
    status: availability.value.length ? 'complete' : 'pending',
    detail: availability.value.length
      ? `${availability.value.length} bloqueos activos`
      : 'Falta disponibilidad base',
    cta: 'Actualizar',
    section: 'disponibilidad',
  },
  {
    id: 'solicitudes',
    icon: '📄',
    label: 'Solicitudes',
    status: pendingRequests.value ? 'warning' : 'neutral',
    detail: pendingRequests.value
      ? `${pendingRequests.value} por responder`
      : 'Sin backlog operativo',
    cta: 'Revisar',
    section: 'solicitudes',
  },
])
const dashboardRecentActivity = computed(() =>
  history.value.slice(0, 5).map((entry) => ({
    id: entry.id,
    date: entry.date,
    title: entry.action,
    detail: `${entry.module} · ${entry.actor}`,
  })),
)
const availabilityStatusCatalog = {
  Disponible: { label: 'Disponible', tone: 'success', short: 'Disp' },
  'No disponible': { label: 'Bloqueo manual', tone: 'dark', short: 'Bloq' },
  'En mantenimiento': { label: 'Mantenimiento', tone: 'warning', short: 'Mx' },
  Reservado: { label: 'Reserva tentativa', tone: 'info', short: 'Tent' },
  'Pendiente de confirmacion': { label: 'Vuelo confirmado', tone: 'danger', short: 'Vuelo' },
}
const availabilityReadyCount = computed(
  () =>
    aircraft.value.filter((item) => getAvailabilityOperationalStatus(item).label === 'Disponible')
      .length,
)
const availabilityImmediatePercent = computed(() =>
  aircraft.value.length
    ? Math.round((availabilityReadyCount.value / aircraft.value.length) * 100)
    : 0,
)
const availabilityGlobalStatus = computed(() => {
  if (!aircraft.value.length) {
    return {
      tone: 'warning',
      title: 'Aun no hay flota operativa',
      detail: 'Registra aeronaves antes de gestionar disponibilidad.',
    }
  }
  if (availabilityReadyCount.value === aircraft.value.length) {
    return {
      tone: 'success',
      title: 'Fleet ready',
      detail: 'Toda la flota registrada aparece disponible hoy.',
    }
  }
  if (!availabilityReadyCount.value) {
    return {
      tone: 'danger',
      title: 'Fully occupied',
      detail: 'No hay aeronaves disponibles de forma inmediata.',
    }
  }
  return {
    tone: 'warning',
    title: 'Partial availability',
    detail: 'Solo una parte de la flota esta libre para asignacion inmediata.',
  }
})
const availabilitySummaryCards = computed(() => [
  {
    label: 'Disponibilidad inmediata',
    value: `${availabilityImmediatePercent.value}%`,
    detail: `${availabilityReadyCount.value} de ${aircraft.value.length || 0} aeronaves listas hoy.`,
    tone: availabilityGlobalStatus.value.tone,
  },
  {
    label: 'Bloqueos activos',
    value: availability.value.length,
    detail: 'Slots que ya afectan matching o agenda de flota.',
    tone: availability.value.length ? 'warning' : 'success',
  },
  {
    label: 'Vuelos / reservas',
    value: availability.value.filter(
      (item) => getAvailabilityStatusMeta(item.status).tone === 'danger',
    ).length,
    detail: 'Rangos con ocupacion o confirmacion fuerte.',
    tone: 'danger',
  },
  {
    label: 'Mantenimiento',
    value: availability.value.filter(
      (item) => getAvailabilityStatusMeta(item.status).tone === 'warning',
    ).length,
    detail: 'Ventanas tecnicas registradas para la flota.',
    tone: 'warning',
  },
])
const availabilityFormSteps = computed(() => [
  { id: 1, label: 'Aeronave', complete: Boolean(availabilityForm.aircraftId) },
  { id: 2, label: 'Rango', complete: Boolean(availabilityForm.from && availabilityForm.to) },
  { id: 3, label: 'Motivo', complete: Boolean(availabilityForm.status) },
  { id: 4, label: 'Guardar', complete: false },
])
const availabilityActivityFeed = computed(() =>
  [
    ...availability.value.slice(0, 4).map((item) => ({
      id: `availability-${item.id}`,
      date: formatDateTimeDisplay(item.from),
      title: `${item.aircraft} · ${getAvailabilityStatusMeta(item.status).label}`,
      detail: `${formatDateTimeDisplay(item.from)} → ${formatDateTimeDisplay(item.to)}`,
    })),
    ...operations.value.slice(0, 3).map((item) => ({
      id: `operation-${item.id}`,
      date: formatDateTimeDisplay(item.departure),
      title: `Vuelo confirmado · ${item.aircraft || 'Aeronave'}`,
      detail: item.route,
    })),
  ].slice(0, 6),
)
const requestKpis = computed(() => {
  const urgent = requests.value.filter(
    (request) => getRequestPriorityMeta(request).tone === 'danger',
  ).length
  const pending = requests.value.filter(
    (request) => getRequestStatusMeta(request).queue === 'new',
  ).length
  const multiLeg = requests.value.filter((request) => buildRequestLegs(request).length > 1).length
  const activeProviders = new Set(requests.value.map((request) => request.providerId).filter(Boolean)).size
  const readyAircraft = aircraft.value.filter((item) => getAircraftLiveStatus(item).label === 'Disponible').length
  const pendingMargin = requests.value.filter((request) => !Number(request.priorityPrice || 0)).length

  return [
    {
      label: 'Nuevas',
      value: pending,
      tone: pending ? 'warning' : 'success',
      detail: pending ? 'Requieren respuesta operativa.' : 'Sin backlog nuevo en la bandeja.',
    },
    {
      label: 'SLA critico',
      value: urgent,
      tone: urgent ? 'danger' : 'success',
      detail: urgent ? 'Salen en menos de 4 horas.' : 'Sin salidas criticas inmediatas.',
    },
    {
      label: 'Multi-tramo',
      value: multiLeg,
      tone: multiLeg ? 'info' : 'neutral',
      detail: multiLeg ? 'Operaciones compuestas por revisar.' : 'Sin solicitudes compuestas visibles.',
    },
    {
      label: 'Proveedores activos',
      value: activeProviders,
      tone: activeProviders ? 'info' : 'neutral',
      detail: activeProviders ? 'Recibiendo solicitudes en cola.' : 'Sin proveedores activos.',
    },
    {
      label: 'Aeronaves listas',
      value: readyAircraft,
      tone: readyAircraft ? 'success' : 'warning',
      detail: readyAircraft ? 'Disponibles para armar propuesta.' : 'No hay disponibilidad inmediata.',
    },
    {
      label: 'Margen pendiente',
      value: pendingMargin,
      tone: pendingMargin ? 'warning' : 'success',
      detail: pendingMargin ? 'Solicitudes aun sin margen visible.' : 'Margen operativo visible en cola.',
    },
  ]
})
const requestStatusTabs = computed(() => [
  {
    id: 'all',
    label: 'Activas',
    count: requests.value.filter((request) => getRequestStatusMeta(request).queue !== 'rejected')
      .length,
  },
  {
    id: 'new',
    label: 'Nuevas',
    count: requests.value.filter((request) => getRequestStatusMeta(request).queue === 'new')
      .length,
  },
  {
    id: 'coordination',
    label: 'Coordinacion',
    count: requests.value.filter(
      (request) => getRequestStatusMeta(request).queue === 'coordination',
    ).length,
  },
  {
    id: 'confirmed',
    label: 'Aceptadas',
    count: requests.value.filter(
      (request) => getRequestStatusMeta(request).queue === 'confirmed',
    ).length,
  },
])
const archivedRequests = computed(() =>
  [...requests.value]
    .filter((request) => getRequestStatusMeta(request).queue === 'rejected')
    .sort((left, right) => {
      const rightDate = parseOperationalDate(right.updatedAt || right.responseLimit || right.date)
      const leftDate = parseOperationalDate(left.updatedAt || left.responseLimit || left.date)
      if (leftDate && rightDate) return rightDate.getTime() - leftDate.getTime()
      if (rightDate) return 1
      if (leftDate) return -1
      return Number(right.id) - Number(left.id)
    }),
)
const filteredRequests = computed(() => {
  const search = requestSearch.value.trim().toLowerCase()

  return [...requests.value]
    .filter((request) => {
      const statusMeta = getRequestStatusMeta(request)
      const priorityMeta = getRequestPriorityMeta(request)
      const matchesStatus =
        requestStatusFilter.value === 'all'
          ? statusMeta.queue !== 'rejected'
          : statusMeta.queue === requestStatusFilter.value
      const matchesPriority =
        requestPriorityFilter.value === 'all' || priorityMeta.key === requestPriorityFilter.value
      const haystack = [
        request.id,
        getRequestRouteLabel(request),
        request.aircraft,
        getRequestClientLabel(request),
        request.requestCode,
        request.tripType,
      ]
        .join(' ')
        .toLowerCase()
      const matchesSearch = !search || haystack.includes(search)

      return matchesStatus && matchesPriority && matchesSearch
    })
    .sort((left, right) => {
      const priorityDiff = getRequestPriorityMeta(right).rank - getRequestPriorityMeta(left).rank
      if (priorityDiff !== 0) return priorityDiff

      const leftDate = parseOperationalDate(left.responseLimit || left.date)
      const rightDate = parseOperationalDate(right.responseLimit || right.date)
      if (leftDate && rightDate) return leftDate.getTime() - rightDate.getTime()
      if (leftDate) return -1
      if (rightDate) return 1
      return Number(right.id) - Number(left.id)
    })
})
const selectedRequest = computed(() => {
  if (!filteredRequests.value.length) return null
  return (
    filteredRequests.value.find((request) => request.id === selectedRequestId.value) ||
    filteredRequests.value[0]
  )
})
watch(
  selectedRequest,
  (request) => {
    requestInternalCommentDraft.value = request?.internalComment || request?.specialRequirements || ''
  },
  { immediate: true },
)
const requestOperationalAlerts = computed(() => {
  if (!selectedRequest.value) return []

  const request = selectedRequest.value
  const alerts = []
  const priorityMeta = getRequestPriorityMeta(request)
  const countdown = getRequestResponseCountdown(request)
  const suggestedAircraft = getRequestSuggestedAircraft(request)

  if (priorityMeta.tone === 'danger') {
    alerts.push({
      id: 'priority',
      tone: 'danger',
      text: `${priorityMeta.label}: ${priorityMeta.detail}`,
    })
  }
  if (countdown.tone !== 'neutral') {
    alerts.push({
      id: 'sla',
      tone: countdown.tone,
      text: countdown.label,
    })
  }
  if (suggestedAircraft.available) {
    alerts.push({
      id: 'match',
      tone: 'success',
      text: `Match operacional alto con ${suggestedAircraft.label}.`,
    })
  }

  return alerts.slice(0, 3)
})
const selectedRequestAircraftComparison = computed(() => buildRequestAircraftComparison(selectedRequest.value))
function createEmptyCompany() {
  return {
    legalName: '',
    rfc: '',
    tradeName: '',
    phone: '',
    email: '',
    address: '',
    legalRepresentative: '',
    jetAPrice: '',
    marginPercent: '',
    fixedFee: '',
    status: 'pendiente',
    reviewStatus: 'Sin datos',
    adminNotes: '',
    documents: [],
  }
}

function syncCompanyForm() {
  companyForm.legalName = company.legalName
  companyForm.rfc = company.rfc
  companyForm.tradeName = company.tradeName
  companyForm.phone = company.phone
  companyForm.email = company.email
  companyForm.address = company.address
  companyForm.legalRepresentative = company.legalRepresentative
  companyForm.jetAPrice = company.jetAPrice
  companyForm.marginPercent = company.marginPercent
  companyForm.fixedFee = company.fixedFee
  companyForm.newDocumentFile = null
  companyForm.newDocumentName = ''
}

function pushHistory(module, action) {
  history.value.unshift({
    id: Date.now(),
    date: new Date().toISOString().slice(0, 16).replace('T', ' '),
    module,
    action,
    actor: auth.user?.name || providerName.value,
  })
}

function showError(title, message) {
  ui.pushToast({ tone: 'error', title, message })
}

function isBackendConnectionError(error) {
  const message = String(error?.message || '').toLowerCase()
  return (
    message.includes('no fue posible conectar con el servicio local ni con el servidor remoto') ||
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('err_connection_refused')
  )
}

function getBackendConnectionMessage() {
  return 'No hay conexion con el backend local en http://127.0.0.1:8000. Verifica que Laravel este corriendo.'
}

function clearFormFeedback(formKey) {
  formErrors[formKey] = {}
  formSuccess[formKey] = ''
}

function setFormSuccess(formKey, message) {
  formErrors[formKey] = {}
  formSuccess[formKey] = message
}

function setFormErrors(formKey, errors) {
  formErrors[formKey] = errors
  formSuccess[formKey] = ''
}

function applyBackendValidationErrors(formKey, error, fieldMap = {}, fallbackMessage = '') {
  const validationErrors = error?.payload?.errors
  if (validationErrors && typeof validationErrors === 'object') {
    const nextErrors = {}

    Object.entries(validationErrors).forEach(([field, messages]) => {
      if (!Array.isArray(messages) || !messages.length) return
      nextErrors[fieldMap[field] || field] = messages[0]
    })

    if (Object.keys(nextErrors).length) {
      setFormErrors(formKey, nextErrors)
      return buildApiErrorMessage(error, fallbackMessage)
    }
  }

  setFormErrors(formKey, { _form: error?.message || fallbackMessage })
  return error?.message || fallbackMessage
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

function applyDashboardResponse(dashboard) {
  const providerRecord = pickRecord(dashboard, ['provider', 'company', 'empresa'])
  if (providerRecord && Object.keys(providerRecord).length) {
    hydrateCompany(providerRecord)
  }

  const dashboardCrew = pickCollection(dashboard, ['crew', 'tripulation', 'tripulacion'])
  if (dashboardCrew.length) {
    crew.value = dashboardCrew.map(normalizeCrew)
  }
}

function applyAircraftResponse(payload) {
  const collection = pickCollection(payload, ['aircraft', 'data', 'items'])
  aircraft.value = collection.map(normalizeAircraft)
  syncAircraftScopedForms()
}

function applyRequestsResponse(payload) {
  const collection = pickCollection(payload, [
    'requests',
    'flight_requests',
    'reservations',
    'solicitudes',
    'items',
    'matches',
    'data',
  ])
  requests.value = collection.map(normalizeRequest)
}

function applyOperationsResponse(payload) {
  const collection = pickCollection(payload, ['operations', 'data', 'items'])
  operations.value = collection.map(normalizeOperation)
}

function applyIncidentsResponse(payload) {
  const collection = pickCollection(payload, ['incidents', 'data', 'items'])
  incidents.value = collection.map(normalizeIncident)
}

function applyPaymentsResponse(payload) {
  const collection = pickCollection(payload, ['payments', 'liquidations', 'data'])
  payments.value = collection.map(normalizePayment)
}

function applyHistoryResponse(payload) {
  const collection = pickCollection(payload, ['history', 'events', 'data'])
  history.value = collection.map(normalizeHistory)
}

function applyCrewResponse(payload) {
  const collection = pickCollection(payload, ['crew', 'tripulation', 'tripulacion'])
  crew.value = collection.map(normalizeCrew)
}

function applySettingsResponse(payload) {
  hydrateSettings(pickRecord(payload, ['settings', 'data']))
}

function applyAvailabilityResponse(payload) {
  const collection = pickCollection(payload, ['availability', 'data', 'items'])
  availability.value = collection.map(normalizeAvailability)
}

function goToSection(section) {
  router.push(`/operador/${section}`)
}

function normalizeCompany(raw = {}) {
  return {
    legalName: raw.legal_name || raw.company_name || raw.razon_social || company.legalName,
    rfc: raw.rfc || raw.tax_id || company.rfc,
    tradeName: raw.commercial_name || raw.trade_name || raw.nombre_comercial || company.tradeName,
    phone: raw.phone || raw.telefono || company.phone,
    email: raw.email || company.email,
    address: raw.address || raw.direccion || company.address,
    legalRepresentative:
      raw.legal_representative || raw.representante_legal || company.legalRepresentative,
    status: raw.status || company.status,
    jetAPrice: raw.jet_a_price ?? raw.jetA ?? raw.precio_jet_a ?? company.jetAPrice,
    marginPercent:
      raw.margin_percent ?? raw.utility_percent ?? raw.porcentaje_utilidad ?? company.marginPercent,
    fixedFee: raw.fixed_fee ?? raw.fee_fijo ?? company.fixedFee,
    reviewStatus:
      raw.validation_status || raw.review_status || raw.estado_validacion || company.reviewStatus,
    adminNotes: raw.admin_notes || raw.observations || raw.observaciones || company.adminNotes,
    documents: Array.isArray(raw.documents)
      ? raw.documents.map((document, index) => normalizeCompanyDocument(document, index))
      : company.documents,
  }
}

function normalizeCompanyDocument(raw = {}, index = 0) {
  return {
    id: raw.id || index + 1,
    name: raw.document_name || raw.name || raw.file_name || `Documento ${index + 1}`,
    state: raw.status || raw.state || 'pendiente',
  }
}

function normalizeAircraft(raw = {}, index = 0) {
  const statusRaw = String(raw.status || raw.aircraft_status || 'draft').toLowerCase()
  const statusMap = {
    draft: 'borrador',
    pending_review: 'pendiente_revision',
    rejected: 'rechazada',
    archived: 'archivada',
    active: 'aprobada',
    trial_active: 'aprobada',
    suspended: 'suspendida',
  }
  const normalizedImages = Array.isArray(raw.images)
    ? raw.images
        .map((image, imageIndex) => normalizeAircraftImage(image, imageIndex))
        .filter((image) => image.imageUrl)
    : []
  const normalizedDocuments = Array.isArray(raw.documents)
    ? raw.documents.map((document, documentIndex) =>
        normalizeAircraftDocument(document, documentIndex),
      )
    : []
  const trialEndsAt = raw.trial_ends_at || raw.trialEndsAt || null
  const trialStartsAt = raw.trial_starts_at || raw.trialStartsAt || null
  const status = statusMap[statusRaw] || statusRaw || 'borrador'
  const mainImage = normalizeMediaUrl(
    raw.main_image ||
      raw.image ||
      raw.image_url ||
      raw.mainImage ||
      normalizedImages.find((image) => image.kind === 'main')?.imageUrl ||
      normalizedImages[0]?.imageUrl ||
      '',
  )

  return {
    id: raw.id || index + 1,
    name: raw.model || raw.name || raw.aircraft_name || `Aeronave ${index + 1}`,
    manufacturer: raw.manufacturer || '',
    category: raw.category || raw.aircraft_category || raw.type || '',
    engineType:
      raw.engine_type ||
      raw.engineType ||
      raw.motor_tipo ||
      inferAircraftEngineType({
        category: raw.category || raw.aircraft_category || raw.type || '',
        model: raw.model || raw.name || raw.aircraft_name || '',
        engineType: raw.engine_type || raw.engineType || raw.motor_tipo || '',
      }),
    engineClass: raw.engine_class || raw.engineClass || raw.motor_clase || '',
    registration: raw.registration || raw.matricula || '',
    year: raw.year || raw.model_year || '',
    capacity: Number(raw.capacity || raw.passenger_capacity || 0),
    rangeKm: Number(raw.range_km || raw.rangeKm || 0),
    speedKmh: Number(raw.speed_kmh || raw.speedKmh || 0),
    speedKnots: Number(raw.speed_knots || raw.speedKnots || kmhToKnots(raw.speed_kmh || raw.speedKmh) || 0),
    amenities: Array.isArray(raw.amenities) ? raw.amenities.join(', ') : raw.amenities || '',
    base: raw.base || raw.base_airport || raw.base_airport_code || '',
    coverage: Array.isArray(raw.coverage) ? raw.coverage.join(', ') : raw.coverage || '',
    airportExpensesUsd: Number(raw.airport_expenses_usd || raw.airport_expenses || raw.expense_fee || 0),
    hourlyPrice: Number(raw.hourly_rate || raw.hourly_price || raw.price_per_hour || 0),
    minimumHours: Number(raw.minimum_hours || raw.min_hours || 0),
    fuelBurnGallonsPerHour: Number(raw.fuel_burn_gph || raw.fuel_consumption_gph || 0),
    engineReserveRate: Number(raw.engine_reserve_rate || raw.reserve_motor_rate || 0),
    insuranceRate: Number(raw.insurance_rate || 0),
    maintenanceRate: Number(raw.maintenance_rate || 0),
    crewRate: Number(raw.crew_rate || 0),
    repositioningFee: Number(raw.repositioning_fee || 0),
    overnightFee: Number(raw.overnight_fee || 0),
    repositioningCost: Number(raw.repositioning_cost || 0),
    overnightCost: Number(raw.overnight_cost || 0),
    waitingCost: Number(raw.waiting_cost || 0),
    fboCost: Number(raw.fbo_cost || 0),
    permitsCost: Number(raw.permits_cost || 0),
    cateringBaseCost: Number(raw.catering_base_cost || 0),
    operationalCost: Number(raw.operational_cost || raw.cost || 0),
    status,
    availability: raw.availability_status || raw.availability || 'Pendiente de confirmacion',
    trial: trialEndsAt
      ? `Activo hasta ${String(trialEndsAt).slice(0, 10)}`
      : raw.subscription_status || 'Aun no activo',
    trialStartsAt,
    trialEndsAt,
    trialDaysLeft: Number(raw.trial_days_left || raw.days_left || 0),
    approved: Boolean(raw.approved_at || raw.approved || raw.is_approved),
    approvedAt: raw.approved_at || raw.approvedAt || null,
    mainImage,
    images: normalizedImages,
    documents: normalizedDocuments,
    documentsValid:
      raw.documents_valid ??
      raw.documentsValid ??
      normalizedDocuments.some((document) =>
        ['vigente', 'validado', 'approved'].includes(String(document.state).toLowerCase()),
      ),
    adminNotes: raw.admin_notes || raw.observations || raw.notes || 'Sin observaciones',
  }
}

function normalizeAircraftImage(raw = {}, index = 0) {
  return {
    id: raw.id || index + 1,
    title: raw.title || raw.name || raw.kind || `Imagen ${index + 1}`,
    kind: String(raw.kind || raw.slot || (index === 0 ? 'main' : 'gallery')).toLowerCase(),
    imageUrl: normalizeMediaUrl(raw.image_url || raw.url || raw.path || ''),
  }
}

function normalizeAircraftDocument(raw = {}, index = 0) {
  const type = raw.type || raw.document_type || 'documento'
  return {
    id: raw.id || index + 1,
    type,
    typeLabel: getAircraftDocumentTypeMeta(type).label,
    name: raw.document_name || raw.name || raw.file_name || `Documento ${index + 1}`,
    state: raw.status || raw.state || 'pendiente',
    expiresAt: raw.expires_at || raw.expiration_date || null,
    fileUrl: normalizeMediaUrl(raw.file_url || raw.document_url || raw.url || ''),
    fileType: raw.file_type || raw.mime_type || '',
  }
}

function normalizeAvailability(raw = {}, index = 0) {
  return {
    id: raw.id ?? raw.availability_id ?? raw.block_id ?? null,
    aircraftId: raw.aircraft_id ?? raw.aircraft?.id ?? raw.aircraftId ?? null,
    aircraft:
      raw.aircraft?.model ||
      raw.aircraft?.name ||
      aircraft.value.find(
        (plane) => plane.id === Number(raw.aircraft_id ?? raw.aircraft?.id ?? raw.aircraftId),
      )?.name ||
      `Aeronave ${index + 1}`,
    from: raw.start_datetime || raw.starts_at || raw.start_at || raw.from || '',
    to: raw.end_datetime || raw.ends_at || raw.end_at || raw.to || '',
    status: raw.status || 'Disponible',
    reason: raw.notes || raw.reason || 'Estado actual',
  }
}

function humanizeAircraftStatus(status = '') {
  const normalized = String(status).toLowerCase()

  if (['blocked', 'bloqueada'].includes(normalized)) return 'Bloqueada'
  if (['active', 'aprobada', 'trial_active'].includes(normalized)) return 'Aprobada'
  if (['pending_review', 'pendiente_revision'].includes(normalized)) return 'Pendiente revision'
  if (['draft', 'borrador'].includes(normalized)) return 'Borrador'
  if (['archived', 'archivada'].includes(normalized)) return 'Archivada'
  if (['suspended', 'suspendida'].includes(normalized)) return 'Suspendida'
  if (['rejected', 'rechazada'].includes(normalized)) return 'Rechazada'
  if (['inactive', 'inactiva'].includes(normalized)) return 'Inactiva'

  return status || 'Sin estado'
}

function normalizeMediaUrl(url = '') {
  return resolveMediaUrl(url)
}

function hasImage(url = '') {
  return typeof normalizeMediaUrl(url) === 'string' && normalizeMediaUrl(url).length > 0
}

function getAircraftVisualStyle(item) {
  const imageUrl = normalizeMediaUrl(item?.mainImage || '')
  return imageUrl ? { backgroundImage: `linear-gradient(180deg, rgba(8, 11, 18, 0.08) 0%, rgba(8, 11, 18, 0.72) 100%), url("${imageUrl}")` } : {}
}

function normalizeClientLabel(rawClient) {
  if (!rawClient) return 'Cliente'
  if (typeof rawClient === 'string') return rawClient
  if (typeof rawClient === 'object') {
    return (
      rawClient.name ||
      rawClient.full_name ||
      rawClient.company_name ||
      rawClient.email ||
      `Cliente #${rawClient.id || 'N/D'}`
    )
  }
  return String(rawClient)
}

function resolveOperatorRequestStatusSource(raw = {}) {
  return (
    resolveSharedWorkflowStatus({
      ...raw,
      workflow_status: raw.workflow_status || raw.state || '',
      status: raw.status || '',
    }) ||
    deriveClientWorkflowStatus(raw) ||
    raw.workflow_status ||
    raw.state ||
    raw.status ||
    ''
  )
}

function pickPreferredRequestMatch(matches = []) {
  if (!Array.isArray(matches) || !matches.length) return null

  const normalizedMatches = matches.filter((item) => item && typeof item === 'object')
  if (!normalizedMatches.length) return null

  const acceptedMatch = normalizedMatches.find((item) =>
    ['accepted', 'aceptada', 'approved'].includes(String(item.status || '').toLowerCase()),
  )
  if (acceptedMatch) return acceptedMatch

  const sentMatch = normalizedMatches.find((item) =>
    ['sent_to_provider', 'pending', 'pendiente'].includes(String(item.status || '').toLowerCase()),
  )
  if (sentMatch) return sentMatch

  return normalizedMatches[0]
}

function resolveRequestAircraftLabel(raw = {}) {
  const directAircraft = raw.aircraft_model || raw.aircraft || raw.assigned_aircraft || ''
  if (String(directAircraft || '').trim()) return directAircraft

  const preferredMatch = pickPreferredRequestMatch(raw.matches)
  const matchAircraft = preferredMatch?.aircraft
  const aircraftLabel =
    matchAircraft?.model ||
    matchAircraft?.name ||
    preferredMatch?.visibility_payload?.aircraft_model ||
    raw.visibility_payload?.aircraft_model ||
    ''

  return String(aircraftLabel || '').trim() || 'Por definir'
}

function parseRequestAmount(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback
  }

  const normalized = String(value).replace(/[^0-9.,-]+/g, '').trim()
  if (!normalized) return fallback

  const decimalSeparator = normalized.lastIndexOf(',') > normalized.lastIndexOf('.') ? ',' : '.'
  const sanitized =
    decimalSeparator === ','
      ? normalized.replace(/\./g, '').replace(',', '.')
      : normalized.replace(/,/g, '')

  const numericValue = Number(sanitized)
  return Number.isFinite(numericValue) ? numericValue : fallback
}

function resolveRequestFinalPriceValue(raw = {}) {
  const pricingContext =
    raw.pricing_context && typeof raw.pricing_context === 'object' ? raw.pricing_context : {}
  const preferredMatch = pickPreferredRequestMatch(raw.matches)

  return parseRequestAmount(
    raw.selected_card_price ||
      raw.final_price ||
      raw.total ||
      raw.estimated_total ||
      raw.final_price_display ||
      raw.formatted_final_price ||
      raw.total_price ||
      raw.quote_total ||
      raw.quote ||
      pricingContext.total ||
      pricingContext.final_price ||
      preferredMatch?.final_price ||
      preferredMatch?.total ||
      preferredMatch?.total_price ||
      preferredMatch?.estimated_price ||
      preferredMatch?.price,
    0,
  )
}

function resolveRequestQuoteValue(raw = {}) {
  const directQuote =
    raw.selected_card_price ||
    raw.final_price ||
    raw.total ||
    raw.estimated_total ||
    raw.total_price ||
    raw.quote_total ||
    raw.quote ||
    raw.final_price_display ||
    raw.formatted_final_price
  if (directQuote !== null && directQuote !== undefined && directQuote !== '') return directQuote

  const pricingContext =
    raw.pricing_context && typeof raw.pricing_context === 'object' ? raw.pricing_context : {}
  const preferredMatch = pickPreferredRequestMatch(raw.matches)
  return (
    pricingContext.selected_card_price ||
    pricingContext.total ||
    pricingContext.final_price ||
    preferredMatch?.final_price ||
    preferredMatch?.total ||
    preferredMatch?.estimated_price ||
    preferredMatch?.price ||
    preferredMatch?.total_price ||
    'Pendiente'
  )
}

function resolveRequestResponseLimit(raw = {}) {
  const directResponseLimit = raw.response_deadline || raw.response_limit || raw.expires_at
  if (directResponseLimit) return directResponseLimit

  const preferredMatch = pickPreferredRequestMatch(raw.matches)
  return preferredMatch?.response_deadline || 'Sin limite informado'
}

function normalizeRequest(raw = {}, index = 0) {
  const sharedWorkflowStatus = resolveOperatorRequestStatusSource(raw) || 'reserved'

  const origin = raw.origin || raw.origin_airport || raw.departure_airport || 'N/D'
  const destination = raw.destination || raw.destination_airport || raw.arrival_airport || 'N/D'
  const departureDateTime =
    raw.departure_datetime || raw.departure_date || raw.flight_date || raw.date || ''
  const requirements = Array.isArray(raw.requirements)
    ? raw.requirements
    : Array.isArray(raw.legs)
      ? raw.legs
      : []
  const serviceTier =
    raw.service_tier || raw.flight_package || raw.package_name || raw.package || raw.priority_type || ''

  return {
    id: raw.id || index + 1,
    requestId: raw.request_id || raw.flight_request_id || raw.id || '',
    reservationId: raw.reservation_id || raw.booking_id || raw.id || '',
    client:
      raw.client_name ||
      raw.customer_name ||
      raw.passenger_name ||
      normalizeClientLabel(raw.client || raw.customer || raw.user),
    route: raw.route || `${origin} - ${destination}`,
    origin,
    destination,
    date: departureDateTime || 'Sin fecha',
    time:
      raw.departure_time ||
      (departureDateTime.includes('T') ? departureDateTime.slice(11, 16) : ''),
    passengers: Number(raw.passengers || raw.passenger_count || 0),
    aircraft: resolveRequestAircraftLabel(raw),
    quote: resolveRequestQuoteValue(raw),
    responseLimit: resolveRequestResponseLimit(raw),
    status: sharedWorkflowStatus,
    workflowStatus: sharedWorkflowStatus,
    contractStatus:
      raw.contract?.status || raw.contract_status || raw.reservation?.contract_status || '',
    paymentStatus:
      raw.payment?.status ||
      raw.payment_status ||
      raw.payment_order?.status ||
      raw.reservation?.payment_status ||
      '',
    operationId: raw.operation?.id || raw.operation_id || raw.operaciones?.[0]?.id || '',
    internalComment: raw.internal_comment || raw.notes || raw.comment || '',
    requestCode: raw.request_code || raw.code || '',
    tripType: raw.trip_type || raw.flight_type || '',
    flightPackage: raw.flight_package || raw.package_name || raw.package || '',
    serviceTier,
    priorityType: raw.priority_type || '',
    basePrice: parseRequestAmount(raw.base_price, 0),
    operationalFee: parseRequestAmount(raw.operational_fee, 0),
    priorityPrice: parseRequestAmount(raw.priority_price, 0),
    finalPrice: resolveRequestFinalPriceValue(raw),
    overnightRequired: Boolean(raw.overnight_required || raw.requires_overnight),
    waitingAtDestination: Boolean(raw.wait_at_destination || raw.destination_wait),
    airportChange: Boolean(raw.airport_change_required || raw.change_airport),
    specialRequest: Boolean(raw.special_request || raw.is_special_request),
    requirements,
    rawStatus: raw.status || '',
    rawWorkflowStatus: resolveOperatorRequestStatusSource(raw),
    specialRequirements:
      raw.special_requirements || raw.requirements_notes || raw.notes || raw.internal_comment || '',
    createdAt: raw.created_at || null,
    updatedAt: raw.updated_at || null,
    raw,
  }
}

function normalizeRequestStatus(status = '') {
  const normalized = String(status || '').trim().toLowerCase()
  if (['pending_validation', 'en validacion', 'validating'].includes(normalized)) {
    return 'contract_pending'
  }

  const workflowState = resolveWorkflowState(status).id
  if (workflowState !== 'draft') return workflowState
  if (['rejected', 'rechazada', 'declined'].includes(normalized)) return 'rejected'
  if (['accepted', 'aceptada', 'approved'].includes(normalized)) return 'provider_accepted'
  if (['pending', 'pendiente'].includes(normalized)) return 'reserved'
  return 'reserved'
}

function normalizeOperation(raw = {}, index = 0) {
  return {
    id: raw.id || index + 1,
    requestId: raw.request_id || raw.flight_request_id || raw.reservation_id || '',
    reservationId: raw.reservation_id || raw.booking_id || '',
    route: raw.route || `${raw.origin || 'N/D'} - ${raw.destination || 'N/D'}`,
    aircraft: raw.aircraft_model || raw.aircraft || 'Por definir',
    crew: raw.crew_label || raw.crew || raw.tripulation || 'Por definir',
    crewId: raw.crew_id || raw.sobrecargo_id || raw.crew_member_id || '',
    departure: raw.departure_datetime || raw.departure || 'Pendiente',
    arrival: raw.arrival_datetime || raw.arrival || 'Pendiente',
    status: raw.status || 'Confirmada',
    workflowStatus: raw.workflow_status || raw.workflow || raw.status || '',
    contractStatus: raw.contract?.status || raw.contract_status || '',
    paymentStatus: raw.payment?.status || raw.payment_status || raw.payment_order?.status || '',
    notes: raw.notes || raw.comment || 'Sin comentarios',
    crewStatus: raw.crew_status || raw.crewStatus || '',
    crewStatusLabel: raw.crew_status_label || raw.crewStatusLabel || 'Sin responder',
    crewConfirmedAt: raw.crew_confirmed_at || raw.crewConfirmedAt || null,
    crewDeclineReason: raw.crew_decline_reason || raw.crewDeclineReason || '',
    crewNotes: raw.crew_notes || raw.crewNotes || '',
    crewCheckinAt: raw.crew_checkin_at || raw.crewCheckinAt || null,
    crewServiceStartedAt: raw.crew_service_started_at || raw.crewServiceStartedAt || null,
    crewServiceCompletedAt: raw.crew_service_completed_at || raw.crewServiceCompletedAt || null,
    raw,
  }
}

function findLinkedOperationForRequest(request = {}) {
  const candidateIds = [
    request.id,
    request.requestId,
    request.reservationId,
    request.operationId,
    request.raw?.id,
    request.raw?.request_id,
    request.raw?.flight_request_id,
    request.raw?.reservation_id,
    request.raw?.booking_id,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)

  if (!candidateIds.length) return null

  return (
    operations.value.find((operation) => {
      const operationIds = [
        operation.id,
        operation.requestId,
        operation.reservationId,
        operation.raw?.id,
        operation.raw?.request_id,
        operation.raw?.flight_request_id,
        operation.raw?.reservation_id,
        operation.raw?.booking_id,
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean)

      return operationIds.some((value) => candidateIds.includes(value))
    }) || null
  )
}

function normalizeIncident(raw = {}, index = 0) {
  return {
    id: raw.id || index + 1,
    requestId: raw.request_id || raw.flight_request_id || raw.reservation_id || null,
    type: raw.type || 'Problema operativo',
    flight: raw.flight || raw.route || raw.operation || 'Sin vuelo',
    status: raw.status || 'Abierta',
    priority: raw.priority || 'Media',
    evidence: raw.evidence || raw.attachment || 'Pendiente',
    comment: raw.comment || raw.description || '',
    responsible: raw.responsible || raw.assigned_to || raw.owner || 'Por asignar',
    createdAt: raw.created_at || null,
  }
}

function normalizePayment(raw = {}, index = 0) {
  return {
    id: raw.id || index + 1,
    flight: raw.flight || raw.route || raw.operation || 'Vuelo',
    completedAt: raw.completed_at || raw.flight_date || raw.date || 'Pendiente',
    amount: raw.amount || raw.total || raw.net_amount || 'Pendiente',
    status: raw.status || 'Pendiente',
    receipt: raw.receipt || raw.document || raw.voucher || 'Sin comprobante',
  }
}

function normalizeCrew(raw = {}, index = 0) {
  const normalizedRole = normalizeCrewRole(raw.role || raw.position || raw.rol || raw.tipo)
  const normalizedState = normalizeCrewState(raw.state || raw.status || raw.availability_status)
  const certificationsArray = Array.isArray(raw.certifications)
    ? raw.certifications
    : Array.isArray(raw.licenses)
      ? raw.licenses
      : typeof raw.certifications === 'string'
        ? raw.certifications.split(',').map((item) => item.trim()).filter(Boolean)
        : []
  const languagesArray = Array.isArray(raw.languages)
    ? raw.languages
    : typeof raw.languages === 'string'
      ? raw.languages.split(',').map((item) => item.trim()).filter(Boolean)
      : typeof raw.idiomas === 'string'
        ? raw.idiomas.split(',').map((item) => item.trim()).filter(Boolean)
        : []
  const documents = Array.isArray(raw.documents)
    ? raw.documents
    : Array.isArray(raw.files)
      ? raw.files
      : []

  return {
    id: raw.id || index + 1,
    name: raw.name || 'Tripulante',
    role: normalizedRole,
    base: raw.base || raw.city || 'N/D',
    state: normalizedState,
    availability: raw.availability || raw.schedule || normalizedState,
    phone: raw.phone || '',
    note: raw.note || raw.notes || '',
    email: raw.email || '',
    certifications: certificationsArray.length
      ? certificationsArray.join(', ')
      : raw.certifications || raw.license || raw.licenses || '',
    certificationsList: certificationsArray,
    certificationExpiry:
      raw.certification_expiry ||
      raw.certifications_expire_at ||
      raw.license_expiration ||
      raw.expires_at ||
      '',
    flightHours: Number(raw.flight_hours || raw.hours_flown || raw.total_hours || 0),
    authorizedAircraft:
      Array.isArray(raw.authorized_aircraft)
        ? raw.authorized_aircraft.join(', ')
        : raw.authorized_aircraft || raw.aircraft_type_authorized || raw.fleet_authorization || '',
    documents,
    documentsCount: Number(raw.documents_count || documents.length || 0),
    validationStatus:
      raw.validation_status || raw.approval_status || raw.review_status || raw.status_label || 'Pendiente',
    lastUpdated: raw.updated_at || raw.last_updated || raw.modified_at || raw.created_at || '',
    internalRating: String(raw.internal_rating || raw.rating_internal || raw.score_internal || raw.rating || '4.9'),
    languages: languagesArray.length ? languagesArray.join(', ') : raw.languages || raw.idiomas || 'ES',
    languagesList: languagesArray,
    rating: String(raw.rating || raw.score || '4.9/5'),
  }
}

function normalizeCrewRole(value = '') {
  const normalized = String(value || '').toLowerCase()
  if (
    normalized.includes('sobrecargo') ||
    normalized.includes('cabin') ||
    normalized.includes('crew')
  ) {
    return 'Sobrecargo'
  }
  if (
    normalized.includes('copilot') ||
    normalized.includes('co-pilot') ||
    normalized.includes('copiloto')
  ) {
    return 'Copiloto'
  }
  if (
    normalized.includes('pilot') ||
    normalized.includes('capitan') ||
    normalized.includes('piloto')
  ) {
    return 'Piloto'
  }
  if (normalized.includes('coord')) return 'Coordinador'
  return crewRoleOptions.includes(String(value)) ? String(value) : 'Sobrecargo'
}

function normalizeCrewState(value = '') {
  const normalized = String(value || '').toLowerCase()
  if (normalized.includes('suspend')) return 'Suspendido'
  if (normalized.includes('rest') || normalized.includes('descanso')) return 'Descanso'
  if (normalized.includes('assign') || normalized.includes('asign')) return 'Asignado'
  if (normalized.includes('no disponible') || normalized.includes('unavailable'))
    return 'No disponible'
  if (normalized.includes('available') || normalized.includes('disponible')) return 'Disponible'
  return crewStateOptions.includes(String(value)) ? String(value) : 'Disponible'
}

function hydrateSettings(raw = {}) {
  settings.emailNotifications = Boolean(
    raw.email_notifications ?? raw.emailNotifications ?? settings.emailNotifications,
  )
  settings.paymentAlerts = Boolean(
    raw.payment_alerts ?? raw.paymentAlerts ?? settings.paymentAlerts,
  )
  settings.opsAlerts = Boolean(raw.ops_alerts ?? raw.opsAlerts ?? settings.opsAlerts)
  settings.crewApprovalMode =
    raw.crew_approval_mode ?? raw.crewApprovalMode ?? settings.crewApprovalMode
}

function normalizeHistory(raw = {}, index = 0) {
  return {
    id: raw.id || index + 1,
    date: raw.date || raw.created_at || raw.timestamp || '',
    module: raw.module || raw.area || 'Portal',
    action: raw.action || raw.description || raw.event || 'Actualizacion',
    actor: raw.actor || raw.user_name || raw.user || 'Sistema',
  }
}

function hydrateCompany(rawCompany = {}) {
  Object.assign(company, normalizeCompany(rawCompany))
  companyId.value = rawCompany.id || rawCompany.provider_id || companyId.value
  syncCompanyForm()
}

function setCompanyDocumentFile(file) {
  companyForm.newDocumentFile = file || null
  companyForm.newDocumentName = file?.name || ''
}

async function reloadCompany() {
  const response = await requestWithCandidates([
    { method: 'get', path: '/proveedor/dashboard' },
    { method: 'get', path: '/proveedor/empresa' },
    { method: 'get', path: '/operator/dashboard' },
  ])

  const providerRecord = pickRecord(response, ['provider', 'company', 'empresa'])
  if (providerRecord && Object.keys(providerRecord).length) {
    hydrateCompany(providerRecord)
  }
}

async function uploadCompanyDocument() {
  if (!companyForm.newDocumentFile) return false

  const formData = new FormData()
  formData.append('file', companyForm.newDocumentFile)
  formData.append('document_name', companyForm.newDocumentName || companyForm.newDocumentFile.name)

  const response = await requestWithCandidates([
    { method: 'postForm', path: '/proveedor/empresa/documentos', formData },
  ])

  const companyRecord = pickRecord(response, ['provider', 'company', 'empresa'])
  if (companyRecord && Object.keys(companyRecord).length) {
    hydrateCompany(companyRecord)
    return true
  }

  const documentRecord = pickRecord(response, ['document', 'data'])
  if (documentRecord && Object.keys(documentRecord).length) {
    company.documents.unshift(normalizeCompanyDocument(documentRecord, company.documents.length))
    syncCompanyForm()
    return true
  }

  await reloadCompany()
  return true
}

function resetAircraftForm() {
  Object.assign(aircraftForm, {
    name: '',
    manufacturer: '',
    category: '',
    engineType: '',
    engineClass: '',
    registration: '',
    year: '',
    capacity: 1,
    speedKnots: '',
    amenities: '',
    base: '',
    coverage: '',
    airportExpensesUsd: '',
    hourlyPrice: '',
    minimumHours: '',
    operationalCost: '',
    fuelBurnGallonsPerHour: '',
    engineReserveRate: '',
    insuranceRate: '',
    maintenanceRate: '',
    crewRate: '',
    repositioningFee: '',
    overnightFee: '',
  })
}

function uppercaseText(value) {
  return String(value || '').toLocaleUpperCase('es-MX')
}

function nullableText(value) {
  const normalized = String(value || '').trim()
  return normalized === '' ? null : normalized
}

function knotsToKmh(value) {
  const knots = Number(value || 0)
  return knots > 0 ? Math.round(knots * 1.852) : 0
}

function inferAircraftMinimumHours(category = '') {
  const normalizedCategory = String(category || '').trim().toLowerCase()

  if (normalizedCategory.includes('turboprop')) return 1.5
  if (normalizedCategory.includes('heavy')) return 3
  if (normalizedCategory.includes('light')) return 2
  if (normalizedCategory.includes('mid')) return 2
  return 2
}

function getAircraftCategoryRule(category = '') {
  const normalizedCategory = String(category || '').trim().toLocaleUpperCase('es-MX')
  return aircraftCategoryRules[normalizedCategory] || null
}

function inferAircraftEngineType({ category = '', model = '', engineType = '' } = {}) {
  const categoryRule = getAircraftCategoryRule(category)
  if (categoryRule?.engineType) return categoryRule.engineType

  const explicitEngineType = String(engineType || '').trim().toLowerCase()
  if (['turbofan', 'turboprop', 'turboshaft'].includes(explicitEngineType)) return explicitEngineType

  const normalizedCategory = String(category || '').trim().toLowerCase()
  const normalizedModel = String(model || '').trim().toLowerCase()

  if (
    normalizedCategory.includes('helicopter') ||
    normalizedCategory.includes('helicoptero') ||
    normalizedModel.includes('agusta') ||
    normalizedModel.includes('bell')
  ) {
    return 'turboshaft'
  }

  if (
    normalizedCategory.includes('turboprop') ||
    normalizedCategory.includes('turbo prop') ||
    normalizedModel.includes('king air') ||
    normalizedModel.includes('pilatus') ||
    normalizedModel.includes('pc-12')
  ) {
    return 'turboprop'
  }

  if (
    normalizedCategory.includes('jet') ||
    normalizedModel.includes('gulfstream') ||
    normalizedModel.includes('learjet') ||
    normalizedModel.includes('hawker') ||
    normalizedModel.includes('citation')
  ) {
    return 'turbofan'
  }

  return 'unknown'
}

function kmhToKnots(value) {
  const kmh = Number(value || 0)
  return kmh > 0 ? Math.round(kmh / 1.852) : ''
}

const inferredAircraftMinimumHours = computed(() => inferAircraftMinimumHours(aircraftForm.category))

function uppercaseAircraftFormTextFields() {
  ;['name', 'manufacturer', 'registration', 'amenities', 'base', 'coverage'].forEach((field) => {
    aircraftForm[field] = uppercaseText(aircraftForm[field])
  })
}

function setUppercaseAircraftField(field, value) {
  if (!(field in aircraftForm)) return
  aircraftForm[field] = uppercaseText(value)
}

function applyAircraftCategoryRule(category) {
  const categoryRule = getAircraftCategoryRule(category)
  if (!categoryRule) {
    aircraftForm.engineType = inferAircraftEngineType({
      category,
      model: aircraftForm.name,
      engineType: aircraftForm.engineType,
    })
    aircraftForm.engineClass = ''
    aircraftForm.airportExpensesUsd = ''
    return
  }

  aircraftForm.engineType = categoryRule.engineType
  aircraftForm.engineClass = categoryRule.engineClass
  aircraftForm.airportExpensesUsd = categoryRule.airportExpensesUsd
}

function resetImageForm() {
  Object.assign(imageForm, {
    aircraftId: aircraft.value[0]?.id || null,
    mainFile: null,
    cabinFile: null,
    seatsFile: null,
    amenitiesFile: null,
  })
}

function resetDocumentForm() {
  revokeDocumentPreviewUrls()
  Object.assign(documentForm, {
    aircraftId: aircraft.value[0]?.id || null,
    type: 'maintenance_sticker',
    file: null,
    files: [],
    fileName: '',
    expiresAt: '',
    dragActive: false,
  })
}

function startEditingAircraft(item) {
  editingAircraftId.value = item.id
  clearFormFeedback('aircraft')
  const categoryRule = getAircraftCategoryRule(item.category || '')
  Object.assign(aircraftForm, {
    name: uppercaseText(item.name),
    manufacturer: uppercaseText(item.manufacturer),
    category: item.category || '',
    engineType:
      item.engineType ||
      item.engine_type ||
      categoryRule?.engineType ||
      inferAircraftEngineType({
        category: item.category || '',
        model: item.name || '',
        engineType: item.engineType || item.engine_type || '',
      }),
    engineClass: item.engineClass || item.engine_class || item.motor_clase || categoryRule?.engineClass || '',
    registration: uppercaseText(item.registration),
    year: item.year || '',
    capacity: item.capacity || 1,
    speedKnots: item.speedKnots || '',
    amenities: uppercaseText(item.amenities),
    base: uppercaseText(item.base),
    coverage: uppercaseText(item.coverage),
    airportExpensesUsd:
      item.airportExpensesUsd ||
      item.airport_expenses_usd ||
      item.airport_expenses ||
      item.expense_fee ||
      categoryRule?.airportExpensesUsd ||
      '',
    hourlyPrice: item.hourlyPrice || '',
    minimumHours: item.minimumHours || '',
    operationalCost: item.operationalCost || '',
    fuelBurnGallonsPerHour: item.fuelBurnGallonsPerHour || '',
    engineReserveRate: item.engineReserveRate || '',
    insuranceRate: item.insuranceRate || '',
    maintenanceRate: item.maintenanceRate || '',
    crewRate: item.crewRate || '',
    repositioningFee: item.repositioningFee || '',
    overnightFee: item.overnightFee || '',
  })
}

function cancelEditingAircraft() {
  editingAircraftId.value = null
  resetAircraftForm()
  clearFormFeedback('aircraft')
}

function openAircraftWizard(item = null, mode = 'edit') {
  if (item) {
    startEditingAircraft(item)
    imageForm.aircraftId = item.id
    documentForm.aircraftId = item.id
  } else {
    cancelEditingAircraft()
    resetImageForm()
    resetDocumentForm()
    clearFormFeedback('document')
  }

  aircraftWizardReadOnly.value = mode === 'view'
  aircraftWizardStep.value = 1
  aircraftWizardOpen.value = true
}

function closeAircraftWizard() {
  aircraftWizardOpen.value = false
  aircraftWizardReadOnly.value = false
  aircraftWizardStep.value = 1
  cancelEditingAircraft()
  resetImageForm()
  resetDocumentForm()
  clearFormFeedback('document')
}

function nextAircraftWizardStep() {
  aircraftWizardStep.value = Math.min(aircraftWizardStep.value + 1, aircraftWizardSteps.length)
}

function previousAircraftWizardStep() {
  aircraftWizardStep.value = Math.max(aircraftWizardStep.value - 1, 1)
}

function getAircraftLiveStatus(item) {
  const normalized = String(item?.availability || item?.status || '').toLowerCase()

  if (normalized.includes('mantenimiento') || normalized.includes('maintenance')) {
    return { label: 'Mantenimiento', tone: 'warning' }
  }
  if (
    normalized.includes('reserv') ||
    normalized.includes('ocupad') ||
    normalized.includes('en vuelo')
  ) {
    return { label: 'En mision', tone: 'info' }
  }
  if (
    normalized.includes('bloque') ||
    normalized.includes('suspend') ||
    normalized.includes('archiv')
  ) {
    return { label: 'Bloqueada', tone: 'danger' }
  }

  return { label: 'Disponible', tone: 'success' }
}

function getAircraftDocumentHealth(item) {
  const documents = Array.isArray(item?.documents) ? item.documents : []
  if (!documents.length) {
    return { label: 'Sin expediente', tone: 'warning', detail: 'Aun no tiene documentos visibles.' }
  }

  const hasExpired = documents.some((document) => {
    if (!document.expiresAt) return false
    const expiration = new Date(document.expiresAt)
    return !Number.isNaN(expiration.getTime()) && expiration.getTime() < Date.now()
  })

  if (hasExpired) {
    return {
      label: 'Vencido',
      tone: 'danger',
      detail: 'Hay documentos vencidos o fuera de vigencia.',
    }
  }

  const hasPending = documents.some((document) =>
    ['pendiente', 'pending', 'needs_update'].includes(String(document.state || '').toLowerCase()),
  )

  if (hasPending) {
    return {
      label: 'En revision',
      tone: 'warning',
      detail: 'Documentos cargados pendientes de revision.',
    }
  }

  return { label: 'Vigente', tone: 'success', detail: `${documents.length} documentos listos.` }
}

function getAircraftUpcomingOperation(item) {
  return (
    operations.value.find(
      (operation) =>
        String(operation.aircraft || '').toLowerCase() === String(item.name || '').toLowerCase() &&
        !['Finalizada', 'Cancelada'].includes(operation.status),
    ) || null
  )
}

function getAircraftWeeklyAvailability(item) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)

  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(start)
    date.setDate(start.getDate() + offset)
    const dayStart = new Date(date)
    const dayEnd = new Date(date)
    dayEnd.setHours(23, 59, 59, 999)

    const matchingBlock = availability.value.find((entry) => {
      if (Number(entry.aircraftId) !== Number(item.id)) return false
      const from = new Date(entry.from)
      const to = new Date(entry.to)
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return false
      return from <= dayEnd && to >= dayStart
    })

    const normalizedStatus = String(matchingBlock?.status || '').toLowerCase()
    let tone = 'success'
    if (normalizedStatus.includes('mantenimiento')) tone = 'warning'
    else if (matchingBlock) tone = 'danger'

    return {
      key: `${item.id}-${offset}`,
      label: ['L', 'M', 'M', 'J', 'V', 'S', 'D'][offset],
      tone,
    }
  })
}

function getAvailabilityStatusMeta(status = '') {
  return (
    availabilityStatusCatalog[status] || {
      label: status || 'Bloqueo',
      tone: 'neutral',
      short: 'Info',
    }
  )
}

function getAvailabilityOperationalStatus(item) {
  const relatedEntries = availability.value.filter(
    (entry) => Number(entry.aircraftId) === Number(item.id),
  )
  if (!relatedEntries.length) {
    return { label: 'Disponible', tone: 'success', short: 'Disp' }
  }

  const latest = relatedEntries[0]
  return getAvailabilityStatusMeta(latest.status)
}

async function submitAircraftWizard() {
  if (aircraftWizardSubmitting.value) return

  aircraftWizardSubmitting.value = true

  try {
    let aircraftRecord = null

    if (editingAircraftId.value) {
      aircraftRecord = await saveAircraftEdits(editingAircraftId.value)
    } else {
      aircraftRecord = await createAircraft()
      if (aircraftRecord?.id) {
        editingAircraftId.value = aircraftRecord.id
        imageForm.aircraftId = aircraftRecord.id
        documentForm.aircraftId = aircraftRecord.id
      }
    }

    if (!aircraftRecord?.id) {
      return
    }

    if (countSelectedImageFiles()) {
      const uploadedImages = await uploadAircraftImages()
      if (!uploadedImages) return
    }

    if (documentForm.files.length) {
      const uploadedDocument = await uploadAircraftDocument()
      if (!uploadedDocument) return
    }

    closeAircraftWizard()
  } finally {
    aircraftWizardSubmitting.value = false
  }
}

function syncAircraftScopedForms() {
  if (!aircraft.value.length) {
    availabilityForm.aircraftId = null
    imageForm.aircraftId = null
    documentForm.aircraftId = null
    return
  }

  const defaultAircraftId = aircraft.value[0].id
  if (!aircraft.value.some((item) => item.id === Number(availabilityForm.aircraftId))) {
    availabilityForm.aircraftId = defaultAircraftId
  }
  if (!aircraft.value.some((item) => item.id === Number(imageForm.aircraftId))) {
    imageForm.aircraftId = defaultAircraftId
  }
  if (!aircraft.value.some((item) => item.id === Number(documentForm.aircraftId))) {
    documentForm.aircraftId = defaultAircraftId
  }

  if (!availabilityForm.reason) {
    availabilityForm.reason = 'Bloqueo manual'
  }
}

function setAircraftImageField(field, value) {
  if (!(field in imageForm)) return
  imageForm[field] = value
}

function getAircraftDocumentTypeMeta(type) {
  return aircraftDocumentTypes.find((item) => item.id === type) || {
    id: type || 'documento',
    label: type || 'Documento',
    requiresExpiry: false,
    accepts: ['pdf', 'image'],
  }
}

function getDocumentKind(file = {}) {
  const type = String(file.type || '').toLowerCase()
  const name = String(file.name || '').toLowerCase()
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (
    type.startsWith('image/') ||
    ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'].some((extension) => name.endsWith(extension))
  ) {
    return 'image'
  }
  return 'other'
}

function formatFileSize(bytes = 0) {
  const value = Number(bytes || 0)
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  if (value >= 1024) return `${Math.round(value / 1024)} KB`
  return `${value} B`
}

function revokeDocumentPreviewUrls() {
  ;(documentForm.files || []).forEach((item) => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
  })
}

function validateAircraftDocumentFile(file, typeMeta = selectedDocumentType.value) {
  const kind = getDocumentKind(file)
  if (!typeMeta.accepts.includes(kind)) {
    return `${file.name}: formato no permitido para ${typeMeta.label}.`
  }
  if (kind === 'image' && file.size > maxImageDocumentBytes) {
    return `${file.name}: las imagenes no pueden superar 8 MB.`
  }
  if (kind === 'pdf' && file.size > maxPdfDocumentBytes) {
    return `${file.name}: los PDF no pueden superar 25 MB.`
  }
  return ''
}

function addAircraftDocumentFiles(fileList) {
  const incomingFiles = Array.from(fileList || [])
  if (!incomingFiles.length) return

  const availableSlots = maxAircraftDocumentFiles - documentForm.files.length
  const acceptedFiles = incomingFiles.slice(0, Math.max(availableSlots, 0))
  const rejectedByCount = incomingFiles.length - acceptedFiles.length
  const errors = []
  const typeMeta = selectedDocumentType.value

  acceptedFiles.forEach((file) => {
    const validationError = validateAircraftDocumentFile(file, typeMeta)
    if (validationError) {
      errors.push(validationError)
      return
    }

    const kind = getDocumentKind(file)
    documentForm.files.push({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      file,
      kind,
      type: typeMeta.id,
      typeLabel: typeMeta.label,
      name: file.name,
      size: file.size,
      previewUrl: kind === 'image' ? URL.createObjectURL(file) : '',
    })
  })

  if (rejectedByCount > 0) {
    errors.push(`Maximo ${maxAircraftDocumentFiles} archivos por carga.`)
  }

  documentForm.file = documentForm.files[0]?.file || null
  documentForm.fileName = documentForm.files.map((item) => item.name).join(', ')
  formErrors.document.file = errors.join(' ')
}

function setAircraftDocumentFiles(event) {
  addAircraftDocumentFiles(event.target.files)
  event.target.value = ''
}

function handleDocumentDrop(event) {
  documentForm.dragActive = false
  addAircraftDocumentFiles(event.dataTransfer?.files)
}

function removeAircraftDocumentFile(id) {
  const target = documentForm.files.find((item) => item.id === id)
  if (documentPreview.file?.id === id) {
    closeDocumentPreview()
  }
  if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
  documentForm.files = documentForm.files.filter((item) => item.id !== id)
  documentForm.file = documentForm.files[0]?.file || null
  documentForm.fileName = documentForm.files.map((item) => item.name).join(', ')
}

async function removeStoredAircraftDocument(aircraftId, documentId) {
  if (!aircraftId || !documentId) return

  if (documentPreview.file?.id === `stored-${documentId}`) {
    closeDocumentPreview()
  }

  try {
    await requestWithCandidates([
      { method: 'delete', path: `/proveedor/aeronaves/${aircraftId}/documentos/${documentId}` },
      { method: 'delete', path: `/operator/aircraft/${aircraftId}/documents/${documentId}` },
    ])

    await reloadAircraftList()
    pushHistory('Aeronaves', `Documento #${documentId} eliminado de aeronave #${aircraftId}`)
    ui.pushToast({
      tone: 'success',
      title: 'Documento eliminado',
      message: `El documento #${documentId} ya fue eliminado de la biblioteca.`,
    })
  } catch (error) {
    showError(
      'No se pudo eliminar el documento',
      error.message || 'El documento no pudo eliminarse del backend.',
    )
  }
}

function openDocumentPreview(item) {
  if (documentPreview.url && documentPreview.url !== item.previewUrl) {
    URL.revokeObjectURL(documentPreview.url)
  }

  documentPreview.file = item
  documentPreview.url = item.previewUrl || item.fileUrl || URL.createObjectURL(item.file)
  documentPreview.open = true
}

function openStoredDocumentPreview(document) {
  openDocumentPreview({
    id: `stored-${document.id}`,
    name: document.name,
    typeLabel: document.typeLabel || getAircraftDocumentTypeMeta(document.type).label,
    kind: getStoredDocumentKind(document),
    previewUrl: '',
    fileUrl: document.fileUrl || '',
  })
}

function getStoredDocumentKind(document) {
  const mimeType = String(document?.fileType || '').toLowerCase()
  const fileUrl = String(document?.fileUrl || '').toLowerCase()

  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.includes('pdf')) return 'pdf'
  if (/\.(png|jpg|jpeg|webp|gif|bmp|svg)(\?|$)/i.test(fileUrl)) return 'image'
  return 'pdf'
}

function closeDocumentPreview() {
  if (documentPreview.url && documentPreview.url !== documentPreview.file?.previewUrl) {
    URL.revokeObjectURL(documentPreview.url)
  }

  documentPreview.open = false
  documentPreview.file = null
  documentPreview.url = ''
}

function selectDocumentType(type) {
  documentForm.type = type
  formErrors.document.type = ''
  formErrors.document.file = ''
  if (!selectedDocumentType.value.requiresExpiry) {
    documentForm.expiresAt = ''
  }
}

async function optimizeImageDocumentFile(file) {
  const kind = getDocumentKind(file)
  const type = String(file.type || '').toLowerCase()
  if (kind !== 'image' || type.includes('heic') || type.includes('heif')) {
    return file
  }

  const imageUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'async'
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = reject
      image.src = imageUrl
    })

    const maxSide = 1600
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.84))
    if (!blob) return file

    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, { type: 'image/webp' })
  } catch {
    return file
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

function updateCrewField({ field, value }) {
  if (!(field in crewForm)) return
  crewForm[field] = value
}

function getOperationCrewDraft(operationId) {
  if (!operationCrewDrafts[operationId]) {
    operationCrewDrafts[operationId] = { crewId: '', note: '' }
  }
  return operationCrewDrafts[operationId]
}

function resetCrewForm() {
  editingCrewId.value = null
  clearFormFeedback('crew')
  crewForm.name = ''
  crewForm.role = 'Sobrecargo'
  crewForm.phone = ''
  crewForm.email = ''
  crewForm.base = crewBases.value[0] || ''
  crewForm.state = 'Disponible'
  crewForm.certifications = ''
  crewForm.certificationExpiry = ''
  crewForm.flightHours = ''
  crewForm.authorizedAircraft = ''
  crewForm.validationStatus = 'Pendiente'
  crewForm.internalRating = '4.9'
  crewForm.documentsCount = ''
  crewForm.lastUpdated = ''
  crewForm.languages = ''
  crewForm.availability = 'Inmediata'
  crewForm.rating = '4.9/5'
}

function populateCrewForm(member) {
  if (!member) return
  editingCrewId.value = member.id
  clearFormFeedback('crew')
  crewForm.name = member.name || ''
  crewForm.role = normalizeCrewRole(member.role)
  crewForm.phone = member.phone || ''
  crewForm.email = member.email || ''
  crewForm.base = member.base || crewBases.value[0] || ''
  crewForm.state = normalizeCrewState(member.state || member.availability)
  crewForm.certifications = member.certifications || ''
  crewForm.certificationExpiry = member.certificationExpiry || ''
  crewForm.flightHours = member.flightHours || ''
  crewForm.authorizedAircraft = member.authorizedAircraft || ''
  crewForm.validationStatus = member.validationStatus || 'Pendiente'
  crewForm.internalRating = member.internalRating || '4.9'
  crewForm.documentsCount = member.documentsCount || ''
  crewForm.lastUpdated = member.lastUpdated || ''
  crewForm.languages = member.languages || ''
  crewForm.availability = member.availability || member.state || 'Inmediata'
  crewForm.rating = member.rating || '4.9/5'
}

function upsertCrewRecord(record) {
  const normalizedRecord = normalizeCrew(record)
  const index = crew.value.findIndex((item) => item.id === normalizedRecord.id)

  if (index >= 0) {
    crew.value.splice(index, 1, {
      ...crew.value[index],
      ...normalizedRecord,
    })
    return crew.value[index]
  }

  crew.value.unshift(normalizedRecord)
  return crew.value[0]
}

async function reloadCrewList() {
  const response = await requestWithCandidates([
    { method: 'get', path: '/proveedor/tripulacion' },
    { method: 'get', path: '/proveedor/sobrecargos' },
    { method: 'get', path: '/operator/crew' },
    { method: 'get', path: '/operator/tripulation' },
  ])
  const collection = pickCollection(response, [
    'crew',
    'tripulation',
    'tripulacion',
    'sobrecargos',
    'data',
  ])
  crew.value = collection.map(normalizeCrew)
}

function upsertAircraftRecord(record) {
  const normalizedRecord = normalizeAircraft(record)
  const index = aircraft.value.findIndex((item) => item.id === normalizedRecord.id)
  if (index >= 0) {
    aircraft.value.splice(index, 1, {
      ...aircraft.value[index],
      ...normalizedRecord,
    })
    return aircraft.value[index]
  }

  aircraft.value.unshift(normalizedRecord)
  return aircraft.value[0]
}

async function reloadAircraftList() {
  const response = await requestWithCandidates([
    { method: 'get', path: '/proveedor/mis-aeronaves' },
    { method: 'get', path: '/proveedor/aeronaves' },
    { method: 'get', path: '/operator/my-aircraft' },
    { method: 'get', path: '/operator/aircraft' },
  ])
  const collection = pickCollection(response, ['aircraft', 'data', 'items'])
  aircraft.value = collection.map(normalizeAircraft)
  syncAircraftScopedForms()
}

function formatDateTimeRange(value = '') {
  if (!value) return 'Sin fecha'
  const normalized = String(value)
  if (!/\d{4}-\d{2}-\d{2}/.test(normalized)) return normalized
  return normalized.replace('T', ' ').slice(0, 16)
}

function startOfAvailabilityWeek(date = new Date()) {
  const baseDate = new Date(date)
  baseDate.setHours(0, 0, 0, 0)
  const day = baseDate.getDay()
  const diff = day === 0 ? -6 : 1 - day
  baseDate.setDate(baseDate.getDate() + diff)
  return baseDate
}

function addDays(date, amount) {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + amount)
  return nextDate
}

function startOfAvailabilityDay(date) {
  const value = new Date(date)
  value.setHours(0, 0, 0, 0)
  return value
}

function endOfAvailabilityDay(date) {
  const value = new Date(date)
  value.setHours(23, 59, 59, 999)
  return value
}

function isSameAvailabilityDay(firstDate, secondDate) {
  return startOfAvailabilityDay(firstDate).getTime() === startOfAvailabilityDay(secondDate).getTime()
}

function formatDateTimeDisplay(value = '') {
  if (!value) return 'Sin fecha'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return formatDateTimeRange(value)
  }

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City',
  }).format(parsed)
}

function formatCurrency(value) {
  const numericValue =
    typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.-]+/g, ''))

  if (!Number.isFinite(numericValue)) {
    return value || 'Pendiente'
  }

  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(numericValue)
}

function formatDocumentExpiry(value = '') {
  if (!value) return 'Sin vencimiento'
  return String(value).slice(0, 10)
}

function normalizeAvailabilityStatusForBackend(status = '') {
  const normalized = String(status).toLowerCase()

  if (['disponible', 'available'].includes(normalized)) return 'available'
  if (['no disponible', 'unavailable', 'blocked'].includes(normalized)) return 'blocked'
  if (['en mantenimiento', 'maintenance'].includes(normalized)) return 'maintenance'
  if (['reservado', 'reserved', 'occupied'].includes(normalized)) return 'occupied'
  if (
    ['pendiente de confirmacion', 'pending confirmation', 'pending_confirmation'].includes(
      normalized,
    )
  ) {
    return 'blocked'
  }

  return 'blocked'
}

function getAvailabilityEntriesForAircraft(plane, entries = []) {
  return entries.filter((entry) => Number(entry.aircraftId) === Number(plane.id))
}

function buildAvailabilityCalendarCell(plane, date, entries = []) {
  const dayStart = startOfAvailabilityDay(date)
  const dayEnd = endOfAvailabilityDay(date)
  const matchingEntries = getAvailabilityEntriesForAircraft(plane, entries).filter((entry) => {
    const from = new Date(entry.from)
    const to = new Date(entry.to)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return false
    return from <= dayEnd && to >= dayStart
  })

  const primaryEntry = matchingEntries[0] || null
  const statusMeta = getAvailabilityStatusMeta(primaryEntry?.status || 'Disponible')

  return {
    key: `${plane.id}-${dayStart.toISOString()}`,
    date: dayStart,
    tone: primaryEntry ? statusMeta.tone : 'success',
    label: primaryEntry ? statusMeta.short : 'Libre',
    title: primaryEntry ? statusMeta.label : 'Disponible',
    detail: primaryEntry ? primaryEntry.reason : 'Sin bloqueos registrados',
    entries: matchingEntries,
    primaryEntry,
    isAvailable: !primaryEntry,
  }
}

function moveAvailabilityWeek(offset) {
  availabilityWeekAnchor.value = startOfAvailabilityWeek(addDays(availabilityWeekAnchor.value, offset * 7))
}

function jumpAvailabilityWeekToToday() {
  availabilityWeekAnchor.value = startOfAvailabilityWeek(new Date())
}

function selectAvailabilityCalendarCell(plane, cell) {
  availabilityForm.aircraftId = plane.id
  selectedAvailabilityCalendarAircraftId.value = String(plane.id)

  const startDate = startOfAvailabilityDay(cell.date)
  startDate.setHours(9, 0, 0, 0)
  const endDate = new Date(startDate)
  endDate.setHours(18, 0, 0, 0)

  availabilityForm.from = toDateTimeLocalValue(startDate)
  availabilityForm.to = toDateTimeLocalValue(endDate)
  availabilityForm.status = cell.primaryEntry?.status || 'No disponible'
  availabilityForm.reason = cell.primaryEntry?.reason || 'Bloqueo manual'
}

function toDateTimeLocalValue(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const pad = (part) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function getRequestRouteLabel(request) {
  return (
    [request.origin, request.destination].filter(Boolean).join(' - ') || request.route || 'Sin ruta'
  )
}

function parseOperationalDate(value = '') {
  if (!value || value === 'Sin limite informado' || value === 'Sin fecha') return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function isRequestSameOperationalDay(value = '') {
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

function getRequestStatusMeta(statusOrRequest = '') {
  const status = resolveRequestWorkflowValue(statusOrRequest)
  const workflowState = resolveWorkflowState(status).id
  const label = normalizeWorkflowLabel(status)

  if (isRequestRejected(status)) {
    return {
      label: 'Archivada',
      tone: 'neutral',
      queue: 'rejected',
      headline: 'Solicitud archivada',
    }
  }
  if (isRequestPendingValidation(status)) {
    return {
      label,
      tone: 'info',
      queue: 'coordination',
      headline: label,
    }
  }
  if (workflowState === 'provider_accepted' || isRequestAccepted(status)) {
    return {
      label,
      tone: 'success',
      queue: 'confirmed',
      headline: label,
    }
  }

  return {
    label,
    tone: 'warning',
    queue: 'new',
    headline: label,
  }
}

function applyLocalRequestStatusUpdate(id, status, workflowStatus = '') {
  const normalizedId = String(id)
  requests.value = requests.value.map((request) => {
    if (String(request.id) !== normalizedId) return request

    const normalizedStatus =
      status === 'Aceptada' ? workflowStatus || 'accepted' : 'rejected'
    return {
      ...request,
      status: status === 'Aceptada' ? normalizedStatus : 'rejected',
      workflowStatus: status === 'Aceptada' ? normalizedStatus : 'rejected',
      rawStatus: normalizedStatus,
      rawWorkflowStatus: normalizedStatus,
    }
  })
}

function getRequestPriorityMeta(request = {}) {
  const referenceDate =
    parseOperationalDate(request.responseLimit) || parseOperationalDate(request.date)
  if (!referenceDate) {
    return {
      key: 'normal',
      label: 'Programada',
      tone: 'neutral',
      detail: 'Sin SLA visible en backend.',
      rank: 1,
    }
  }

  const diffMs = referenceDate.getTime() - Date.now()
  if (diffMs <= 0) {
    return {
      key: 'expired',
      label: 'SLA vencido',
      tone: 'danger',
      detail: 'La ventana de respuesta ya expiro.',
      rank: 4,
    }
  }
  if (diffMs <= 4 * 60 * 60 * 1000) {
    return {
      key: 'urgent',
      label: 'Urgente',
      tone: 'danger',
      detail: 'Sale en menos de 4 horas.',
      rank: 3,
    }
  }
  if (isRequestSameOperationalDay(request.date) || diffMs <= 12 * 60 * 60 * 1000) {
    return {
      key: 'high',
      label: 'Alta prioridad',
      tone: 'warning',
      detail: 'Salida programada para hoy.',
      rank: 2,
    }
  }

  return {
    key: 'normal',
    label: 'Programada',
    tone: 'info',
    detail: 'Ventana operativa normal.',
    rank: 1,
  }
}

function getRequestStatusCopy(status = '') {
  const workflowState = resolveWorkflowState(resolveRequestWorkflowValue(status)).id
  if (workflowState === 'reserved' || workflowState === 'provider_pending')
    return 'La solicitud ya esta en flujo y espera respuesta operativa del proveedor.'
  if (workflowState === 'provider_accepted' || isRequestAccepted(status))
    return 'La respuesta operativa ya se registro y el siguiente paso compartido es contrato / firma.'
  if (workflowState === 'contract_pending')
    return 'La reserva ya avanzo a contrato y firma del cliente.'
  if (workflowState === 'contract_signed')
    return 'El contrato ya fue firmado y el siguiente paso es validar el pago.'
  if (workflowState === 'payment_pending')
    return 'El pago esta pendiente o en revision antes de liberar el vuelo.'
  if (workflowState === 'payment_confirmed')
    return 'El pago ya fue confirmado y la operacion sigue a liberacion final.'
  if (workflowState === 'flight_confirmed')
    return 'La aeronave, tripulacion y salida ya estan confirmadas.'
  if (workflowState === 'tracking_live')
    return 'El vuelo ya esta en seguimiento activo.'
  if (isRequestRejected(status)) return 'Rechazada por proveedor'
  if (isRequestPendingValidation(status)) return 'La reserva ya avanzo en el flujo compartido.'
  return 'Pendiente de decision'
}

function resolveRequestWorkflowValue(requestOrStatus = '') {
  if (requestOrStatus && typeof requestOrStatus === 'object') {
    const linkedOperation = findLinkedOperationForRequest(requestOrStatus)
    return (
      resolveSharedWorkflowStatus({
        ...(requestOrStatus.raw && typeof requestOrStatus.raw === 'object' ? requestOrStatus.raw : {}),
        ...(linkedOperation?.raw && typeof linkedOperation.raw === 'object' ? linkedOperation.raw : {}),
        workflow_status:
          linkedOperation?.workflowStatus ||
          requestOrStatus.workflowStatus ||
          requestOrStatus.rawWorkflowStatus ||
          requestOrStatus.status ||
          '',
        status: linkedOperation?.status || requestOrStatus.status || requestOrStatus.rawStatus || '',
        contract_status: linkedOperation?.contractStatus || requestOrStatus.contractStatus || '',
        payment_status: linkedOperation?.paymentStatus || requestOrStatus.paymentStatus || '',
        operation_id: linkedOperation?.id || requestOrStatus.operationId || '',
      }) ||
      requestOrStatus.workflowStatus ||
      requestOrStatus.status ||
      ''
    )
  }
  return requestOrStatus
}

function resolveOperatorVisualStepId(value = '') {
  return resolveSharedVisualWorkflowStepId(value)
}

function buildOperatorRequestFlowSteps(request = {}) {
  const workflowValue = resolveRequestWorkflowValue(request)
  return buildSharedFlowStepStates(workflowValue).map((step) => ({
    ...step,
    shortLabel: OPERATOR_FLOW_STEPS.find((item) => item.id === step.id)?.shortLabel || step.shortLabel,
  }))
}

function getRequestPrimaryActionLabel(request = {}) {
  const workflowId = resolveWorkflowState(resolveRequestWorkflowValue(request)).id
  if (workflowId === 'provider_accepted') return 'Pasar a contrato'
  if (
    ['contract_pending', 'contract_signed', 'payment_pending', 'payment_confirmed', 'flight_confirmed', 'tracking_live', 'completed'].includes(
      workflowId,
    )
  ) {
    return 'Flujo avanzado'
  }
  return 'Aceptar'
}

function getRequestHelperCopy(request = {}) {
  const workflowId = resolveWorkflowState(resolveRequestWorkflowValue(request)).id
  if (workflowId === 'provider_accepted') {
    return 'La respuesta operativa ya quedo registrada en la base de datos. Desde este punto admin y cliente deben ver la misma respuesta del proveedor.'
  }
  if (
    ['contract_pending', 'contract_signed', 'payment_pending', 'payment_confirmed', 'flight_confirmed', 'tracking_live', 'completed'].includes(
      workflowId,
    )
  ) {
    return 'Esta solicitud ya avanzo mas alla de la respuesta del proveedor y ahora forma parte del mismo flujo compartido que ven admin y cliente.'
  }
  return 'Esta es la zona del proveedor para responder la solicitud. Si aceptas, la operacion se asigna; si rechazas, Red Aviation puede reintentar con otra opcion sin exponer tu rechazo al cliente.'
}

function resolveOperatorDecisionState(request, status) {
  if (status !== 'Aceptada') return 'rejected'
  const workflowId = resolveWorkflowState(resolveRequestWorkflowValue(request)).id
  if (workflowId === 'provider_accepted') return 'contract_pending'
  return 'accepted'
}

function canOperatorAcceptRequest(request = {}) {
  const workflowId = resolveWorkflowState(resolveRequestWorkflowValue(request)).id
  return ['reserved', 'provider_pending', 'provider_accepted'].includes(workflowId)
}

function buildOperatorWorkflowCandidates(request, payload) {
  const targetIds = [
    request?.requestId,
    request?.reservationId,
    request?.raw?.request_id,
    request?.raw?.flight_request_id,
    request?.raw?.reservation_id,
    request?.raw?.booking_id,
    request?.id,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)

  return [...new Set(targetIds)].flatMap((targetId) =>
    operatorWorkflowPathCandidates.map((path) => ({
      method: 'put',
      path: path.replace(':id', targetId),
      body: payload,
    })),
  )
}

function getRequestResponseCountdown(request = {}) {
  const referenceDate = parseOperationalDate(request.responseLimit)
  if (!referenceDate) {
    return { label: 'Sin SLA visible', tone: 'neutral' }
  }

  const diffMs = referenceDate.getTime() - Date.now()
  if (diffMs <= 0) {
    return { label: 'Respuesta vencida', tone: 'danger' }
  }

  const totalMinutes = Math.max(1, Math.round(diffMs / 60000))
  if (totalMinutes < 60) {
    return {
      label: `Responder en ${totalMinutes} min`,
      tone: totalMinutes <= 20 ? 'danger' : 'warning',
    }
  }

  const totalHours = Math.round(totalMinutes / 60)
  return { label: `Responder en ${totalHours} h`, tone: totalHours <= 4 ? 'warning' : 'info' }
}

function getRequestClientLabel(request = {}) {
  const label = String(request.client || '').trim()
  if (!label || ['Cliente', 'N/D', 'Cliente #N/D'].includes(label)) {
    return 'Cliente protegido por plataforma'
  }
  return label
}

function getRequestQuoteLabel(request = {}) {
  const rawValue = request.quote ?? request.finalPrice ?? request.basePrice
  const numericValue = parseRequestAmount(rawValue, 0)

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 'Cotizacion en proceso'
  }

  return formatCurrency(numericValue)
}

function getRequestSuggestedAircraft(request = {}) {
  const explicitAircraft = String(request.aircraft || '').trim()
  if (explicitAircraft && explicitAircraft !== 'Por definir') {
    return {
      label: explicitAircraft,
      detail: 'Compatible con la solicitud enviada por la plataforma.',
      available: true,
    }
  }

  const passengers = Number(request.passengers || 0)
  const matchedAircraft =
    aircraft.value.find(
      (item) =>
        Number(item.capacity || 0) >= passengers &&
        getAircraftLiveStatus(item).label === 'Disponible',
    ) ||
    aircraft.value.find((item) => Number(item.capacity || 0) >= passengers) ||
    null

  if (!matchedAircraft) {
    return {
      label: 'Sin sugerencia automatica',
      detail: 'No hay aeronave registrada compatible o disponible para este request.',
      available: false,
    }
  }

  return {
    label: `${matchedAircraft.name} · ${matchedAircraft.registration || matchedAircraft.base || 'Sin matricula'}`,
    detail:
      getAircraftLiveStatus(matchedAircraft).label === 'Disponible'
        ? 'Compatible, disponible y con cobertura operativa.'
        : 'Compatible, pero requiere revisar disponibilidad antes de aceptar.',
    available: getAircraftLiveStatus(matchedAircraft).label === 'Disponible',
  }
}

function getRequestServiceTierLabel(request = {}) {
  const raw = String(request.serviceTier || request.flightPackage || request.priorityType || '').trim()
  if (!raw) return 'Essential'

  const normalized = raw.toLowerCase().replace(/[\s-]+/g, '_')
  if (normalized === 'business') return 'Business'
  if (normalized === 'elite') return 'Elite'
  if (normalized === 'empty_leg') return 'Empty Leg'
  if (normalized === 'essential') return 'Essential'
  return raw
}

function getRequestServiceTierTone(request = {}) {
  const normalized = String(request.priorityType || request.serviceTier || request.flightPackage || '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_')

  if (normalized === 'elite') return 'danger'
  if (normalized === 'business') return 'warning'
  return 'neutral'
}

function getRequestTripTypeLabel(request = {}) {
  const normalized = String(request.tripType || '').toLowerCase().trim()
  if (normalized === 'round_trip') return 'Round trip'
  if (normalized === 'multi_leg' || normalized === 'multi_city') return 'Multi-destino'
  if (normalized === 'one_way') return 'One way'
  return request.tripType || 'One way'
}

function buildRequestLegs(request = {}) {
  if (!request?.id) return []

  const rawLegs = Array.isArray(request.requirements) ? request.requirements : []
  const primaryLeg = {
    id: `${request.id}-0`,
    index: 1,
    origin: request.origin,
    destination: request.destination,
    date: request.date,
    passengers: request.passengers || 0,
    status: getRequestSuggestedAircraft(request).available ? 'Disponible' : 'Revisar',
    action: getRequestSuggestedAircraft(request).available ? 'Listo para aceptar' : 'Revisar disponibilidad',
    aircraft: getRequestSuggestedAircraft(request).label,
    comments: request.internalComment || '',
    operationalCost: request.finalPrice || request.quote || 0,
  }

  const extraLegs = rawLegs.map((leg, index) => {
    const legDate = leg.departure_datetime || leg.date || leg.departure_date || request.date
    const legPassengers = Number(leg.passengers || leg.passenger_count || request.passengers || 0)
    const needsReview = !leg.origin || !leg.destination || !legDate

    return {
      id: `${request.id}-${index + 1}`,
      index: index + 2,
      origin: leg.origin || leg.base_airport || 'N/D',
      destination: leg.destination || leg.arrival_airport || 'N/D',
      date: legDate,
      passengers: legPassengers,
      status: needsReview ? 'Pendiente' : index % 2 === 0 ? 'Disponible' : 'Revisar',
      action:
        needsReview
          ? 'Esperando datos'
          : index % 2 === 0
            ? 'Listo para aceptar'
            : 'Revisar disponibilidad',
      aircraft: leg.aircraft || leg.assigned_aircraft || primaryLeg.aircraft,
      comments: leg.comment || leg.notes || '',
      operationalCost: Number(leg.operational_fee || leg.cost || 0),
    }
  })

  return [primaryLeg, ...extraLegs]
}

function buildRequestAircraftComparison(request = {}) {
  const suggestedAircraft = getRequestSuggestedAircraft(request)
  const alternatives = aircraft.value
    .filter((item) => item.name && item.name !== suggestedAircraft.label)
    .slice(0, 2)

  return {
    label: suggestedAircraft.label,
    detail: suggestedAircraft.detail,
    capacity: Number(request.passengers || 0) ? `${request.passengers} pax objetivo` : 'Capacidad por validar',
    base: request.origin || 'Base por confirmar',
    available: suggestedAircraft.available ? 'Si' : 'Revisar',
    compatibility: suggestedAircraft.available ? '92%' : '74%',
    risk: suggestedAircraft.available ? 'Bajo' : 'Medio',
    alternatives: alternatives.map((item) => item.name || item.registration || 'Alternativa operativa'),
  }
}

function getRequestPriorityDriver(request = {}) {
  const tier = String(request.priorityType || request.serviceTier || request.flightPackage || '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_')

  if (tier === 'elite') return 'premium'
  if (tier === 'business') return 'fast'
  return 'cost'
}

function computeAircraftCompatibilityScore(request = {}, plane = {}) {
  let score = 70
  const requestPax = Number(request.passengers || 0)
  const capacity = Number(plane.capacity || 0)
  const base = String(plane.base || '').trim().toUpperCase()
  const origin = String(request.origin || '').trim().toUpperCase()
  const liveStatus = getAircraftLiveStatus(plane).label

  if (capacity && requestPax && capacity >= requestPax) score += 12
  if (capacity && requestPax && capacity === requestPax) score += 4
  if (base && origin && base === origin) score += 8
  if (liveStatus === 'Disponible') score += 10
  if (plane.documentsValid) score += 4
  if (Number(plane.minimumHours || 0) <= 2) score += 2

  return Math.max(45, Math.min(98, score))
}

function estimateAircraftOperationalQuote(request = {}, plane = {}) {
  const legs = buildRequestLegs(request).length || 1
  const baseHours = Math.max(1.5, legs * 1.6)
  const hourly = Number(plane.hourlyPrice || 0)
  const minimumHours = Math.max(Number(plane.minimumHours || 0), baseHours)
  const core = hourly ? hourly * minimumHours : Number(plane.operationalCost || 0)
  const extras =
    Number(plane.repositioningFee || plane.repositioningCost || 0) +
    Number(plane.overnightFee || plane.overnightCost || 0) +
    Number(plane.fboCost || 0) +
    Number(plane.permitsCost || 0)
  return core + extras
}

function formatInternalCostBand(value = 0) {
  if (!value) return '$$$'
  if (value < 12000) return '$$$'
  if (value < 22000) return '$$$$'
  return '$$$$$'
}

function getOperationalRiskLabel(request = {}, plane = {}) {
  const score = computeAircraftCompatibilityScore(request, plane)
  if (score >= 92) return 'Bajo'
  if (score >= 84) return 'Medio'
  return 'Alto'
}

function getAvailabilitySymbol(plane = {}) {
  const label = getAircraftLiveStatus(plane).label
  if (label === 'Disponible') return 'Si'
  if (label === 'Pendiente de confirmacion') return 'Revisar'
  return 'No'
}

function buildRequestAircraftRows(request = {}, filters = {}) {
  if (!request?.id) return []

  const priorityDriver = filters.mode || getRequestPriorityDriver(request)
  const rows = aircraft.value
    .filter((plane) => Number(plane.capacity || 0) >= Number(request.passengers || 0))
    .filter((plane) => filters.base === 'all' || String(plane.base || '') === String(filters.base || ''))
    .filter((plane) => filters.type === 'all' || String(plane.category || '') === String(filters.type || ''))
    .map((plane) => {
      const compatibility = computeAircraftCompatibilityScore(request, plane)
      const estimatedCost = estimateAircraftOperationalQuote(request, plane)
      const marginProxy = Math.max(Math.round(estimatedCost * 0.12), 0)
      const risk = getOperationalRiskLabel(request, plane)
      const availability = getAvailabilitySymbol(plane)
      const repositioning = String(plane.base || '').trim().toUpperCase() === String(request.origin || '').trim().toUpperCase() ? 0 : 1

      return {
        id: plane.id,
        label: plane.name,
        type: plane.category || 'Jet privado',
        base: plane.base || 'Base',
        pax: plane.capacity || 0,
        compatibility,
        estimatedCost,
        costBand: formatInternalCostBand(estimatedCost),
        risk,
        availability,
        marginProxy,
        repositioning,
        slaRank: availability === 'Si' ? 1 : availability === 'Revisar' ? 2 : 3,
        action: availability === 'Si' ? 'Seleccionar' : availability === 'Revisar' ? 'Revisar' : 'No compatible',
      }
    })

  const sort = filters.sort || 'compatibility'
  rows.sort((left, right) => {
    if (priorityDriver === 'fast') {
      if (left.slaRank !== right.slaRank) return left.slaRank - right.slaRank
      return right.compatibility - left.compatibility
    }
    if (priorityDriver === 'premium') {
      if (right.compatibility !== left.compatibility) return right.compatibility - left.compatibility
      return left.risk.localeCompare(right.risk)
    }
    if (priorityDriver === 'cost') {
      if (left.estimatedCost !== right.estimatedCost) return left.estimatedCost - right.estimatedCost
      return right.compatibility - left.compatibility
    }

    if (sort === 'cost') return left.estimatedCost - right.estimatedCost
    if (sort === 'base') return left.repositioning - right.repositioning
    if (sort === 'margin') return right.marginProxy - left.marginProxy
    if (sort === 'sla') return left.slaRank - right.slaRank
    return right.compatibility - left.compatibility
  })

  return rows
}


function buildProposalSummary(request = {}) {
  const rows = buildRequestAircraftRows(request, {
    base: aircraftFilterBase.value,
    type: aircraftFilterType.value,
    sort: aircraftFilterSort.value,
    mode: aircraftDecisionMode.value,
  })
  const selected = rows.slice(0, Math.max(buildRequestLegs(request).length, 1))
  const total = selected.reduce((sum, item) => sum + Number(item.estimatedCost || 0), 0)
  const margin = selected.reduce((sum, item) => sum + Number(item.marginProxy || 0), 0)
  const adjustments = selected.filter((item) => item.availability !== 'Si').length
  return { total, margin, adjustments }
}

// eslint-disable-next-line no-unused-vars
function buildOperationalProposal(request = {}) {
  const summary = buildProposalSummary(request)
  ui.pushToast({
    tone: summary.adjustments ? 'warning' : 'success',
    title: 'Propuesta operativa armada',
    message: `Total estimado ${formatCurrency(summary.total)} · Margen ${formatCurrency(summary.margin)}${summary.adjustments ? ' · Requiere ajustes por disponibilidad.' : ''}`,
  })
}

function selectRequest(id) {
  selectedRequestId.value = id
}

function countSelectedImageFiles() {
  return ['mainFile', 'cabinFile', 'seatsFile', 'amenitiesFile'].filter((field) => imageForm[field])
    .length
}

function getAircraftImageByKind(aircraftItem, kind) {
  if (!aircraftItem?.images?.length) return null

  if (kind === 'main') {
    return (
      aircraftItem.images.find((image) => image.kind === 'main') || aircraftItem.images[0] || null
    )
  }

  return aircraftItem.images.find((image) => image.kind === kind) || null
}

function isRequestAccepted(status = '') {
  const workflowState = resolveWorkflowState(resolveRequestWorkflowValue(status)).id
  return (
    ['Aceptada', 'Aprobada', 'Respuesta proveedor'].includes(
      typeof status === 'string' ? status : '',
    ) ||
    workflowState === 'provider_accepted'
  )
}

function isRequestRejected(status = '') {
  return (
    (typeof status === 'string' ? status : '') === 'Rechazada' ||
    resolveWorkflowState(resolveRequestWorkflowValue(status)).id === 'rejected'
  )
}

function isRequestPendingValidation(status = '') {
  const workflowState = resolveWorkflowState(resolveRequestWorkflowValue(status)).id
  return (
    ['contract_pending', 'contract_signed', 'payment_pending', 'payment_confirmed', 'flight_confirmed', 'tracking_live', 'completed'].includes(workflowState)
  )
}

function isIncidentResolved(status = '') {
  return ['Resuelta', 'Cerrada'].includes(status)
}

function mapIncidentTone(priority = '') {
  const normalized = String(priority).toLowerCase()
  if (normalized === 'alta') return 'Alta prioridad'
  if (normalized === 'critica') return 'Critica'
  return 'Seguimiento'
}

function isUpdatingRequestStatus(requestId, action = '') {
  if (!requestStatusUpdate.requestId) return false
  if (String(requestStatusUpdate.requestId) !== String(requestId)) return false
  return action ? requestStatusUpdate.action === action : true
}

async function loadPortal() {
  if (!canLoadProviderData.value) {
    return
  }

  const currentLoadSequence = ++portalLoadSequence.value
  const portalLoadTimeoutMs = 45000
  loading.value = true

  try {
    const requestJobs = [
      {
        request: requestWithCandidates([
          { method: 'get', path: '/proveedor/dashboard', timeoutMs: portalLoadTimeoutMs },
          { method: 'get', path: '/proveedor/empresa', timeoutMs: portalLoadTimeoutMs },
          { method: 'get', path: '/operator/dashboard', timeoutMs: portalLoadTimeoutMs },
        ]),
        apply: applyDashboardResponse,
      },
      {
        request: requestWithCandidates([
          { method: 'get', path: '/proveedor/mis-aeronaves', timeoutMs: portalLoadTimeoutMs },
          { method: 'get', path: '/proveedor/aeronaves', timeoutMs: portalLoadTimeoutMs },
          { method: 'get', path: '/operator/my-aircraft', timeoutMs: portalLoadTimeoutMs },
          { method: 'get', path: '/operator/aircraft', timeoutMs: portalLoadTimeoutMs },
        ]),
        apply: applyAircraftResponse,
      },
      {
        request: requestWithCandidates([
          { method: 'get', path: '/proveedor/mis-solicitudes', timeoutMs: portalLoadTimeoutMs },
          { method: 'get', path: '/proveedor/solicitudes', timeoutMs: portalLoadTimeoutMs },
          { method: 'get', path: '/operator/my-requests', timeoutMs: portalLoadTimeoutMs },
          { method: 'get', path: '/operator/requests', timeoutMs: portalLoadTimeoutMs },
        ]),
        apply: applyRequestsResponse,
      },
      {
        request: requestWithCandidates([{ method: 'get', path: '/proveedor/operaciones', timeoutMs: portalLoadTimeoutMs }]),
        apply: applyOperationsResponse,
      },
      {
        request: requestWithCandidates([{ method: 'get', path: '/proveedor/incidencias', timeoutMs: portalLoadTimeoutMs }]),
        apply: applyIncidentsResponse,
      },
      {
        request: requestWithCandidates([{ method: 'get', path: '/proveedor/pagos', timeoutMs: portalLoadTimeoutMs }]),
        apply: applyPaymentsResponse,
      },
      {
        request: requestWithCandidates([{ method: 'get', path: '/proveedor/historial', timeoutMs: portalLoadTimeoutMs }]),
        apply: applyHistoryResponse,
      },
      {
        request: requestWithCandidates([{ method: 'get', path: '/proveedor/tripulacion', timeoutMs: portalLoadTimeoutMs }]),
        apply: applyCrewResponse,
      },
      {
        request: requestWithCandidates([{ method: 'get', path: '/proveedor/configuracion', timeoutMs: portalLoadTimeoutMs }]),
        apply: applySettingsResponse,
      },
      {
        request: requestWithCandidates([{ method: 'get', path: '/proveedor/disponibilidad', timeoutMs: portalLoadTimeoutMs }]),
        apply: applyAvailabilityResponse,
      },
    ]

    const settledResults = await Promise.all(
      requestJobs.map(({ request, apply }) =>
        request
          .then((payload) => {
            if (currentLoadSequence !== portalLoadSequence.value) {
              return { status: 'ignored' }
            }

            apply(payload)
            return { status: 'fulfilled' }
          })
          .catch((reason) => ({ status: 'rejected', reason })),
      ),
    )

    if (currentLoadSequence !== portalLoadSequence.value) {
      return
    }

    const unauthorizedResults = settledResults.filter(
      (result) => result.status === 'rejected' && Number(result.reason?.status) === 401,
    )

    if (unauthorizedResults.length === settledResults.length) {
      auth.clearAuth()
      router.replace({
        name: 'acceso',
        query: { redirect: router.currentRoute.value.fullPath },
      })
      return
    }
  } catch (error) {
    if (currentLoadSequence !== portalLoadSequence.value) {
      return
    }

    showError(
      'No se pudo cargar el portal',
      error.message || 'El backend no respondio con datos del proveedor.',
    )
  } finally {
    if (currentLoadSequence === portalLoadSequence.value) {
      syncAircraftScopedForms()
      loading.value = false
    }
  }
}

function schedulePortalLoad() {
  if (portalLoadScheduled) {
    return
  }

  portalLoadScheduled = true

  queueMicrotask(() => {
    portalLoadScheduled = false

    if (!canLoadProviderData.value) {
      return
    }

    loadPortal()
  })
}

async function saveCompany() {
  clearFormFeedback('company')
  const payload = {
    legal_name: companyForm.legalName,
    rfc: companyForm.rfc,
    commercial_name: companyForm.tradeName,
    phone: companyForm.phone,
    email: companyForm.email,
    address: companyForm.address,
    legal_representative: companyForm.legalRepresentative,
    jet_a_price: Number(companyForm.jetAPrice || 0),
    margin_percent: Number(companyForm.marginPercent || 0),
    fixed_fee: Number(companyForm.fixedFee || 0),
  }

  try {
    const response = await requestWithCandidates([
      { method: 'put', path: '/proveedor/empresa', body: payload },
    ])

    const record = pickRecord(response, ['provider', 'company', 'empresa'])
    if (record && Object.keys(record).length) {
      hydrateCompany(record)
    } else {
      hydrateCompany(payload)
    }

    if (companyForm.newDocumentFile) {
      await uploadCompanyDocument()
    }

    pushHistory('Mi empresa', 'Datos de empresa actualizados')
    setFormSuccess('company', 'Los cambios de la empresa se guardaron correctamente.')
    ui.pushToast({
      tone: 'success',
      title: 'Empresa actualizada',
      message: 'Los datos del proveedor ya quedaron sincronizados con backend.',
    })
  } catch (error) {
    const message = applyBackendValidationErrors(
      'company',
      error,
      {
        legal_name: 'legalName',
        rfc: 'rfc',
        commercial_name: 'tradeName',
        phone: 'phone',
        email: 'email',
        address: 'address',
        legal_representative: 'legalRepresentative',
        jet_a_price: 'jetAPrice',
        margin_percent: 'marginPercent',
        fixed_fee: 'fixedFee',
        file: 'newDocumentFile',
        document_name: 'newDocumentName',
      },
      'La empresa no pudo guardarse en la base de datos.',
    )
    showError('No se pudo guardar', message)
  }
}

async function sendCompanyToReview() {
  try {
    await requestWithCandidates([
      { method: 'post', path: '/proveedor/empresa/enviar-revision', body: {} },
    ])
    company.status = 'pendiente'
    company.reviewStatus = 'En revision por Admin'
    pushHistory('Mi empresa', 'Empresa enviada a revision')
    ui.pushToast({
      tone: 'success',
      title: 'Revision solicitada',
      message: 'La empresa fue enviada al backend para revision administrativa.',
    })
  } catch (error) {
    showError(
      'No se pudo enviar a revision',
      error.message || 'La empresa no pudo enviarse a revision en la base de datos.',
    )
  }
}

async function createAircraft() {
  clearFormFeedback('aircraft')
  uppercaseAircraftFormTextFields()
  if (!aircraftForm.name || !aircraftForm.base) {
    setFormErrors('aircraft', {
      ...(!aircraftForm.name ? { name: 'El modelo es obligatorio.' } : {}),
      ...(!aircraftForm.base ? { base: 'La base es obligatoria.' } : {}),
    })
    return showError(
      'Campos incompletos',
      'Completa modelo y base para crear la aeronave.',
    )
  }

  const payload = {
    provider_id: providerId.value || undefined,
    model: aircraftForm.name,
    manufacturer: aircraftForm.manufacturer,
    category: aircraftForm.category,
    engine_type: aircraftForm.engineType || inferAircraftEngineType({
      category: aircraftForm.category,
      model: aircraftForm.name,
      engineType: aircraftForm.engineType,
    }),
    motor_tipo: String(aircraftForm.engineType || '').toUpperCase(),
    engine_class: aircraftForm.engineClass,
    motor_clase: aircraftForm.engineClass,
    registration: nullableText(aircraftForm.registration),
    year: Number(aircraftForm.year || 0),
    capacity: Number(aircraftForm.capacity || 1),
    speed_kmh: knotsToKmh(aircraftForm.speedKnots),
    amenities: aircraftForm.amenities
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    base_airport: aircraftForm.base,
    coverage: aircraftForm.coverage,
    airport_expenses_usd: Number(aircraftForm.airportExpensesUsd || 0),
    airport_expenses: Number(aircraftForm.airportExpensesUsd || 0),
    expense_fee: Number(aircraftForm.airportExpensesUsd || 0),
    hourly_rate: Number(aircraftForm.hourlyPrice || 0),
    minimum_hours: inferredAircraftMinimumHours.value,
    operational_cost: Number(aircraftForm.operationalCost || 0),
    fuel_burn_gph: Number(aircraftForm.fuelBurnGallonsPerHour || 0),
    engine_reserve_rate: Number(aircraftForm.engineReserveRate || 0),
    insurance_rate: Number(aircraftForm.insuranceRate || 0),
    maintenance_rate: Number(aircraftForm.maintenanceRate || 0),
    crew_rate: Number(aircraftForm.crewRate || 0),
    repositioning_fee: Number(aircraftForm.repositioningFee || 0),
    overnight_fee: Number(aircraftForm.overnightFee || 0),
  }

  try {
    const response = await requestWithCandidates([
      { method: 'post', path: '/operator/aircraft', body: payload },
      { method: 'post', path: '/proveedor/aeronaves', body: payload },
    ])

    const record = pickRecord(response, ['aircraft', 'data'])
    let createdAircraft = null
    if (record && Object.keys(record).length && record.id) {
      createdAircraft = upsertAircraftRecord(record)
    } else {
      await reloadAircraftList()
      createdAircraft = aircraft.value[0] || null
    }
    imageForm.aircraftId = createdAircraft?.id || imageForm.aircraftId
    documentForm.aircraftId = createdAircraft?.id || documentForm.aircraftId
    pushHistory('Aeronaves', 'Nueva aeronave registrada')
    syncAircraftScopedForms()
    const aircraftBlocked = String(createdAircraft?.status || '').toLowerCase() === 'blocked'
    setFormSuccess(
      'aircraft',
      aircraftBlocked
        ? 'La aeronave se creo y quedo bloqueada hasta que admin la active.'
        : 'La aeronave se creo y quedo lista para continuar con imagenes y documentos.',
    )
    ui.pushToast({
      tone: aircraftBlocked ? 'info' : 'success',
      title: aircraftBlocked ? 'Aeronave registrada y bloqueada' : 'Aeronave creada',
      message: aircraftBlocked
        ? 'La aeronave fue registrada y quedo bloqueada hasta activacion admin.'
        : 'La aeronave ya fue registrada en backend.',
    })
    return createdAircraft
  } catch (error) {
    const message = applyBackendValidationErrors(
      'aircraft',
      error,
      {
        model: 'name',
        manufacturer: 'manufacturer',
        category: 'category',
        registration: 'registration',
        year: 'year',
        capacity: 'capacity',
        amenities: 'amenities',
        base_airport: 'base',
        coverage: 'coverage',
        hourly_rate: 'hourlyPrice',
        minimum_hours: 'minimumHours',
        operational_cost: 'operationalCost',
        fuel_burn_gph: 'fuelBurnGallonsPerHour',
        engine_reserve_rate: 'engineReserveRate',
        insurance_rate: 'insuranceRate',
        maintenance_rate: 'maintenanceRate',
        crew_rate: 'crewRate',
        repositioning_fee: 'repositioningFee',
        overnight_fee: 'overnightFee',
      },
      'La aeronave no pudo guardarse en la base de datos.',
    )
    showError('No se pudo crear', message)
    return null
  }
}

async function uploadAircraftImages() {
  const targetAircraftId = Number(imageForm.aircraftId)
  if (!targetAircraftId) {
    showError('Imagenes incompletas', 'Selecciona una aeronave antes de cargar imagenes.')
    return false
  }

  if (!countSelectedImageFiles()) {
    showError('Imagenes incompletas', 'Selecciona al menos una imagen para enviar al backend.')
    return false
  }
  const uploads = [
    {
      file: imageForm.mainFile,
      kind: 'main',
      title: 'Imagen principal',
      isMain: true,
      sortOrder: 0,
    },
    {
      file: imageForm.cabinFile,
      kind: 'cabin',
      title: 'Cabina',
      isMain: false,
      sortOrder: 1,
    },
    {
      file: imageForm.seatsFile,
      kind: 'seats',
      title: 'Asientos',
      isMain: false,
      sortOrder: 2,
    },
    {
      file: imageForm.amenitiesFile,
      kind: 'amenities',
      title: 'Amenidades',
      isMain: false,
      sortOrder: 3,
    },
  ].filter((entry) => entry.file instanceof File)

  try {
    for (const entry of uploads) {
      const formData = new FormData()
      formData.append('image', entry.file)
      formData.append('kind', entry.kind)
      formData.append('title', entry.title)
      formData.append('sort_order', String(entry.sortOrder))
      formData.append('visible_to_client', '1')
      if (entry.isMain) {
        formData.append('is_main', '1')
      }

      await requestWithCandidates([
        { method: 'postForm', path: `/proveedor/aeronaves/${targetAircraftId}/imagenes`, formData },
        { method: 'postForm', path: `/operator/aircraft/${targetAircraftId}/images`, formData },
      ])
    }

    await reloadAircraftList()
    resetImageForm()
    pushHistory('Aeronaves', `Imagenes actualizadas para aeronave #${targetAircraftId}`)
    ui.pushToast({
      tone: 'success',
      title: 'Imagenes cargadas',
      message: 'La galeria de la aeronave ya quedo sincronizada con backend.',
    })
    return true
  } catch (error) {
    showError(
      'No se pudieron cargar las imagenes',
      error.message || 'Las imagenes no pudieron enviarse al backend.',
    )
    return false
  }
}

async function uploadAircraftDocument() {
  clearFormFeedback('document')
  const targetAircraftId = Number(documentForm.aircraftId)
  const selectedFiles = documentForm.files || []
  if (!targetAircraftId || !selectedFiles.length) {
    setFormErrors('document', {
      ...(!targetAircraftId ? { aircraftId: 'Selecciona una aeronave.' } : {}),
      ...(!selectedFiles.length ? { file: 'Selecciona uno o varios archivos.' } : {}),
    })
    return showError(
      'Documento incompleto',
      'Selecciona categoria y uno o varios archivos antes de guardar.',
    )
  }

  try {
    let uploadedCount = 0
    const filesByType = selectedFiles.reduce((groups, item) => {
      const key = item.type || documentForm.type
      groups[key] = groups[key] || []
      groups[key].push(item)
      return groups
    }, {})

    for (const [documentType, groupedFiles] of Object.entries(filesByType)) {
      for (const item of groupedFiles) {
        const formData = new FormData()
        formData.append('type', documentType)
        formData.append('document_type', documentType)
        formData.append('category', documentType)
        formData.append('document_name', item.name || item.file?.name || 'Documento')
        if (documentForm.expiresAt) {
          formData.append('expires_at', documentForm.expiresAt)
        }

        const uploadFile = item.kind === 'image' ? await optimizeImageDocumentFile(item.file) : item.file
        formData.append('file', uploadFile)
        formData.append('document', uploadFile)
        formData.append('documents[]', uploadFile)

        const response = await requestWithCandidates([
          { method: 'postForm', path: `/provider/aircraft/${targetAircraftId}/documents`, formData },
          { method: 'postForm', path: `/proveedor/aeronaves/${targetAircraftId}/documentos`, formData },
          { method: 'postForm', path: `/operator/aircraft/${targetAircraftId}/documents`, formData },
        ])
        uploadedCount += Number(response.uploaded || 1)
      }
    }

    await reloadAircraftList()
    resetDocumentForm()
    pushHistory('Aeronaves', `${uploadedCount} documento(s) cargados para aeronave #${targetAircraftId}`)
    setFormSuccess('document', `${uploadedCount} archivo(s) sincronizados con S3 y backend.`)
    ui.pushToast({
      tone: 'success',
      title: 'Biblioteca actualizada',
      message: `${uploadedCount} archivo(s) registrados en la categoria ${selectedDocumentType.value.label}.`,
    })
    return true
  } catch (error) {
    const message = applyBackendValidationErrors(
      'document',
      error,
      {
        aircraft_id: 'aircraftId',
        type: 'type',
        file: 'file',
        document_name: 'fileName',
        expires_at: 'expiresAt',
      },
      'El documento no pudo enviarse al backend.',
    )
    showError('No se pudo guardar el documento', message)
    return false
  }
}

async function archiveAircraft(id) {
  try {
    await requestWithCandidates([
      { method: 'put', path: `/proveedor/aeronaves/${id}`, body: { status: 'inactive' } },
      { method: 'put', path: `/operator/aircraft/${id}`, body: { status: 'inactive' } },
    ])
  } catch (error) {
    return showError(
      'No se pudo archivar',
      error.message || 'La aeronave no pudo actualizarse en la base de datos.',
    )
  }

  aircraft.value = aircraft.value.map((item) =>
    item.id === id ? { ...item, status: 'inactiva', availability: 'No disponible' } : item,
  )
  availability.value = availability.value.map((item) =>
    item.aircraftId === id ? { ...item, status: 'No disponible' } : item,
  )
  pushHistory('Aeronaves', `Aeronave #${id} archivada`)
  ui.pushToast({
    tone: 'success',
    title: 'Aeronave desactivada',
    message:
      'El backend no maneja archivado directo; la aeronave quedó inactiva y fuera de operación.',
  })
}

async function deleteAircraft(id) {
  const target = aircraft.value.find((item) => Number(item.id) === Number(id))
  const label = target?.registration || target?.name || `#${id}`
  const confirmed = window.confirm(`Eliminar aeronave ${label}? Esta accion no se puede deshacer.`)

  if (!confirmed) return

  try {
    await requestWithCandidates([
      { method: 'delete', path: `/proveedor/aeronaves/${id}` },
      { method: 'delete', path: `/operator/aircraft/${id}` },
    ])
  } catch (error) {
    return showError(
      'No se pudo eliminar',
      error.message || 'La aeronave no pudo eliminarse de la base de datos.',
    )
  }

  aircraft.value = aircraft.value.filter((item) => Number(item.id) !== Number(id))
  availability.value = availability.value.filter((item) => Number(item.aircraftId) !== Number(id))
  if (Number(availabilityForm.aircraftId) === Number(id)) {
    availabilityForm.aircraftId = aircraft.value[0]?.id || null
  }
  if (Number(imageForm.aircraftId) === Number(id)) {
    imageForm.aircraftId = aircraft.value[0]?.id || null
  }
  if (Number(documentForm.aircraftId) === Number(id)) {
    documentForm.aircraftId = aircraft.value[0]?.id || null
  }

  pushHistory('Aeronaves', `Aeronave ${label} eliminada`)
  ui.pushToast({
    tone: 'success',
    title: 'Aeronave eliminada',
    message: `La aeronave ${label} fue eliminada correctamente.`,
  })
}

async function sendAircraftToReview(id) {
  ui.pushToast({
    tone: 'info',
    title: 'Acción no disponible',
    message: `La aeronave #${id} no se marcó localmente porque este backend aún no expone un endpoint para enviarla a revisión.`,
  })
}

async function saveAircraftEdits(id) {
  clearFormFeedback('aircraft')
  uppercaseAircraftFormTextFields()
  if (!aircraftForm.name || !aircraftForm.base) {
    setFormErrors('aircraft', {
      ...(!aircraftForm.name ? { name: 'El modelo es obligatorio.' } : {}),
      ...(!aircraftForm.base ? { base: 'La base es obligatoria.' } : {}),
    })
    return showError(
      'Edicion incompleta',
      'Modelo y base son obligatorios para guardar la aeronave.',
    )
  }

  const payload = {
    model: aircraftForm.name,
    manufacturer: aircraftForm.manufacturer,
    category: aircraftForm.category,
    engine_type: aircraftForm.engineType || inferAircraftEngineType({
      category: aircraftForm.category,
      model: aircraftForm.name,
      engineType: aircraftForm.engineType,
    }),
    motor_tipo: String(aircraftForm.engineType || '').toUpperCase(),
    engine_class: aircraftForm.engineClass,
    motor_clase: aircraftForm.engineClass,
    registration: nullableText(aircraftForm.registration),
    year: Number(aircraftForm.year || 0),
    capacity: Number(aircraftForm.capacity || 1),
    speed_kmh: knotsToKmh(aircraftForm.speedKnots),
    amenities: aircraftForm.amenities
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    base_airport: aircraftForm.base,
    coverage: aircraftForm.coverage,
    airport_expenses_usd: Number(aircraftForm.airportExpensesUsd || 0),
    airport_expenses: Number(aircraftForm.airportExpensesUsd || 0),
    expense_fee: Number(aircraftForm.airportExpensesUsd || 0),
    hourly_rate: Number(aircraftForm.hourlyPrice || 0),
    minimum_hours: inferredAircraftMinimumHours.value,
    operational_cost: Number(aircraftForm.operationalCost || 0),
    fuel_burn_gph: Number(aircraftForm.fuelBurnGallonsPerHour || 0),
    engine_reserve_rate: Number(aircraftForm.engineReserveRate || 0),
    insurance_rate: Number(aircraftForm.insuranceRate || 0),
    maintenance_rate: Number(aircraftForm.maintenanceRate || 0),
    crew_rate: Number(aircraftForm.crewRate || 0),
    repositioning_fee: Number(aircraftForm.repositioningFee || 0),
    overnight_fee: Number(aircraftForm.overnightFee || 0),
  }

  try {
    const response = await requestWithCandidates([
      { method: 'put', path: `/proveedor/aeronaves/${id}`, body: payload },
      { method: 'put', path: `/operator/aircraft/${id}`, body: payload },
    ])

    const record = pickRecord(response, ['aircraft', 'data'])
    const updatedAircraft = upsertAircraftRecord({
      ...aircraft.value.find((item) => item.id === id),
      ...(record && Object.keys(record).length ? record : payload),
      id,
    })
    editingAircraftId.value = null
    resetAircraftForm()
    pushHistory('Aeronaves', `Aeronave #${id} actualizada`)
    setFormSuccess('aircraft', `La aeronave #${id} se actualizo correctamente.`)
    ui.pushToast({
      tone: 'success',
      title: 'Aeronave actualizada',
      message: `La aeronave #${id} ya quedo editada y sincronizada con backend.`,
    })
    return updatedAircraft
  } catch (error) {
    const message = applyBackendValidationErrors(
      'aircraft',
      error,
      {
        model: 'name',
        manufacturer: 'manufacturer',
        category: 'category',
        registration: 'registration',
        year: 'year',
        capacity: 'capacity',
        amenities: 'amenities',
        base_airport: 'base',
        coverage: 'coverage',
        hourly_rate: 'hourlyPrice',
        minimum_hours: 'minimumHours',
        operational_cost: 'operationalCost',
        fuel_burn_gph: 'fuelBurnGallonsPerHour',
        engine_reserve_rate: 'engineReserveRate',
        insurance_rate: 'insuranceRate',
        maintenance_rate: 'maintenanceRate',
        crew_rate: 'crewRate',
        repositioning_fee: 'repositioningFee',
        overnight_fee: 'overnightFee',
      },
      'La aeronave no pudo actualizarse en la base de datos.',
    )
    showError('No se pudo guardar la edicion', message)
    return null
  }
}

function updatePricing(id, field, value) {
  aircraft.value = aircraft.value.map((item) =>
    item.id === id ? { ...item, [field]: Number(value || 0) } : item,
  )
}

async function savePricing(id) {
  const row = aircraft.value.find((item) => item.id === id)
  if (!row) return

  const payload = {
    hourly_rate: row.hourlyPrice,
    minimum_hours: row.minimumHours,
  }

  try {
    await requestWithCandidates([
      { method: 'put', path: `/operator/aircraft/${id}`, body: payload },
      { method: 'put', path: `/proveedor/aeronaves/${id}`, body: payload },
    ])
    pushHistory('Costos y tarifas', `Tarifas actualizadas para aeronave #${id}`)
    ui.pushToast({
      tone: 'info',
      title: 'Tarifa sincronizada',
      message: `La tarifa por hora y las horas minimas de la aeronave #${id} ya quedaron sincronizadas con backend. Los costos avanzados siguen pendientes de soporte del API.`,
    })
  } catch (error) {
    showError(
      'No se pudo guardar',
      error.message || 'Las tarifas no pudieron guardarse en la base de datos.',
    )
  }
}

async function reloadRequestsList() {
  const response = await requestWithCandidates([
    { method: 'get', path: '/proveedor/mis-solicitudes' },
    { method: 'get', path: '/proveedor/solicitudes' },
    { method: 'get', path: '/operator/my-requests' },
    { method: 'get', path: '/operator/requests' },
  ])

  const collection = pickCollection(response, [
    'requests',
    'flight_requests',
    'reservations',
    'solicitudes',
    'items',
    'matches',
    'data',
  ])
  requests.value = collection.map(normalizeRequest)
}

function shouldAutoRefreshRequests() {
  return ['dashboard', 'solicitudes'].includes(props.section)
}

async function refreshRequestsList({ silent = true } = {}) {
  if (refreshingRequests.value) return
  if (!silent) {
    loading.value = true
  }

  refreshingRequests.value = true

  try {
    await reloadRequestsList()
    requestsConnectionWarningShown.value = false
  } catch (error) {
    if (isBackendConnectionError(error)) {
      clearRequestsPolling()
      if (!requestsConnectionWarningShown.value) {
        requestsConnectionWarningShown.value = true
        showError('Backend no disponible', getBackendConnectionMessage())
      }
      return
    }

    if (!silent) {
      showError(
        'No se pudieron recargar las solicitudes',
        error.message || 'Las solicitudes no pudieron sincronizarse con la base de datos.',
      )
    }
  } finally {
    refreshingRequests.value = false
    if (!silent) {
      loading.value = false
    }
  }
}

function clearRequestsPolling() {
  if (requestsPollTimer) {
    clearInterval(requestsPollTimer)
    requestsPollTimer = null
  }
}

function startRequestsPolling() {
  clearRequestsPolling()

  if (!shouldAutoRefreshRequests()) return

  requestsPollTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return
    void refreshRequestsList({ silent: true })
  }, OPERATOR_REQUESTS_POLL_INTERVAL_MS)
}

function handleRequestsVisibilityRefresh() {
  if (typeof document !== 'undefined' && document.hidden) return
  if (!shouldAutoRefreshRequests()) return
  if (!requestsPollTimer) {
    startRequestsPolling()
  }
  void refreshRequestsList({ silent: true })
}

async function reloadOperationsList() {
  const response = await requestWithCandidates([
    { method: 'get', path: '/proveedor/operaciones' },
    { method: 'get', path: '/operator/operations' },
  ])

  const collection = pickCollection(response, ['operations', 'operaciones', 'data', 'items'])
  operations.value = collection.map(normalizeOperation)
}

async function createOrUpdateCrew() {
  clearFormFeedback('crew')

  const errors = {
    ...(!crewForm.name ? { name: 'El nombre es obligatorio.' } : {}),
    ...(!crewForm.phone ? { phone: 'El telefono es obligatorio.' } : {}),
    ...(!crewForm.email ? { email: 'El correo es obligatorio.' } : {}),
    ...(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(crewForm.email || '')
      ? { email: 'Captura un correo valido.' }
      : {}),
    ...(!crewForm.base ? { base: 'La base es obligatoria.' } : {}),
    ...(!crewForm.certifications ? { certifications: 'Captura al menos una certificacion.' } : {}),
  }

  if (Object.keys(errors).length) {
    setFormErrors('crew', errors)
    return showError(
      'Tripulacion incompleta',
      'Completa nombre, contacto, base y certificaciones antes de guardar.',
    )
  }

  const payload = {
    provider_id: providerId.value || undefined,
    name: crewForm.name,
    role: normalizeCrewRole(crewForm.role),
    position: normalizeCrewRole(crewForm.role),
    phone: crewForm.phone,
    email: crewForm.email,
    base: crewForm.base,
    status: normalizeCrewState(crewForm.state),
    availability: crewForm.availability || normalizeCrewState(crewForm.state),
    certifications: crewForm.certifications
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    languages: crewForm.languages
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    rating: crewForm.rating,
    internal_rating: crewForm.internalRating,
    validation_status: crewForm.validationStatus,
    certification_expiry: crewForm.certificationExpiry || null,
    flight_hours: Number(crewForm.flightHours || 0),
    authorized_aircraft: crewForm.authorizedAircraft
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    documents_count: Number(crewForm.documentsCount || 0),
    updated_at: crewForm.lastUpdated || null,
  }

  savingCrew.value = true

  try {
    const response = editingCrewId.value
      ? await requestWithCandidates([
          { method: 'put', path: `/proveedor/tripulacion/${editingCrewId.value}`, body: payload },
          { method: 'put', path: `/proveedor/sobrecargos/${editingCrewId.value}`, body: payload },
          { method: 'put', path: `/operator/crew/${editingCrewId.value}`, body: payload },
          { method: 'put', path: `/operator/tripulation/${editingCrewId.value}`, body: payload },
        ])
      : await requestWithCandidates([
          { method: 'post', path: '/proveedor/tripulacion', body: payload },
          { method: 'post', path: '/proveedor/sobrecargos', body: payload },
          { method: 'post', path: '/operator/crew', body: payload },
          { method: 'post', path: '/operator/tripulation', body: payload },
        ])

    const record = pickRecord(response, [
      'crew',
      'tripulacion',
      'tripulation',
      'sobrecargo',
      'data',
    ])
    if (record && Object.keys(record).length) {
      upsertCrewRecord(record)
    } else {
      await reloadCrewList()
    }

    pushHistory(
      'Tripulacion',
      editingCrewId.value
        ? `Tripulante #${editingCrewId.value} actualizado`
        : 'Nuevo tripulante registrado',
    )
    setFormSuccess(
      'crew',
      editingCrewId.value
        ? 'El tripulante se actualizo correctamente.'
        : 'El tripulante se creo correctamente.',
    )
    ui.pushToast({
      tone: 'success',
      title: editingCrewId.value ? 'Tripulante actualizado' : 'Tripulante creado',
      message: editingCrewId.value
        ? 'Los cambios del tripulante ya quedaron sincronizados con backend.'
        : 'El nuevo tripulante ya aparece en la tripulacion del proveedor.',
    })
    resetCrewForm()
  } catch (error) {
    const message = applyBackendValidationErrors(
      'crew',
      error,
      {
        provider_id: 'providerId',
        name: 'name',
        role: 'role',
        position: 'role',
        phone: 'phone',
        email: 'email',
        base: 'base',
        status: 'state',
        availability: 'availability',
        certifications: 'certifications',
        languages: 'languages',
        rating: 'rating',
        internal_rating: 'internalRating',
        validation_status: 'validationStatus',
        certification_expiry: 'certificationExpiry',
        flight_hours: 'flightHours',
        authorized_aircraft: 'authorizedAircraft',
        documents_count: 'documentsCount',
      },
      'La tripulacion no pudo guardarse en la base de datos.',
    )
    showError(editingCrewId.value ? 'No se pudo actualizar' : 'No se pudo crear', message)
  } finally {
    savingCrew.value = false
  }
}

async function suspendCrewMember(id) {
  const member = crew.value.find((item) => item.id === id)
  if (!member) return

  try {
    await requestWithCandidates([
      {
        method: 'put',
        path: `/proveedor/tripulacion/${id}`,
        body: { status: 'Suspendido', availability: 'Suspendido' },
      },
      {
        method: 'put',
        path: `/proveedor/sobrecargos/${id}`,
        body: { status: 'Suspendido', availability: 'Suspendido' },
      },
      {
        method: 'put',
        path: `/operator/crew/${id}`,
        body: { status: 'Suspendido', availability: 'Suspendido' },
      },
      {
        method: 'put',
        path: `/operator/tripulation/${id}`,
        body: { status: 'Suspendido', availability: 'Suspendido' },
      },
    ])
  } catch (error) {
    return showError(
      'No se pudo suspender',
      error.message || 'El tripulante no pudo actualizarse en la base de datos.',
    )
  }

  crew.value = crew.value.map((item) =>
    item.id === id ? { ...item, state: 'Suspendido', availability: 'Suspendido' } : item,
  )

  if (editingCrewId.value === id) {
    populateCrewForm({ ...member, state: 'Suspendido', availability: 'Suspendido' })
  }

  pushHistory('Tripulacion', `Tripulante #${id} suspendido`)
  ui.pushToast({
    tone: 'success',
    title: 'Tripulante suspendido',
    message: `${member.name} ya quedo suspendido dentro del proveedor.`,
  })
}

async function activateCrewMember(id) {
  const member = crew.value.find((item) => item.id === id)
  if (!member) return

  try {
    await requestWithCandidates([
      {
        method: 'put',
        path: `/proveedor/tripulacion/${id}`,
        body: { status: 'Disponible', availability: 'Inmediata' },
      },
      {
        method: 'put',
        path: `/proveedor/sobrecargos/${id}`,
        body: { status: 'Disponible', availability: 'Inmediata' },
      },
      {
        method: 'put',
        path: `/operator/crew/${id}`,
        body: { status: 'Disponible', availability: 'Inmediata' },
      },
      {
        method: 'put',
        path: `/operator/tripulation/${id}`,
        body: { status: 'Disponible', availability: 'Inmediata' },
      },
    ])
  } catch (error) {
    return showError(
      'No se pudo activar',
      error.message || 'El tripulante no pudo reactivarse en la base de datos.',
    )
  }

  crew.value = crew.value.map((item) =>
    item.id === id ? { ...item, state: 'Disponible', availability: 'Inmediata' } : item,
  )

  pushHistory('Tripulacion', `Tripulante #${id} reactivado`)
  ui.pushToast({
    tone: 'success',
    title: 'Tripulante activado',
    message: `${member.name} vuelve a estar disponible para operación.`,
  })
}

function assignCrewMemberToFlight(member) {
  const openOperation = operations.value.find((item) => !['Finalizada', 'Cancelada'].includes(item.status))
  if (!openOperation) {
    return ui.pushToast({
      tone: 'warning',
      title: 'Sin operación abierta',
      message: 'No hay operaciones activas para asignar a este tripulante ahora mismo.',
    })
  }

  const draft = getOperationCrewDraft(openOperation.id)
  draft.crewId = member.id
  draft.note = draft.note || `Asignación sugerida desde directorio: ${member.name}`
  goToSection('operaciones')
  ui.pushToast({
    tone: 'info',
    title: 'Asignación preparada',
    message: `${member.name} quedó precargado en la operación #${openOperation.id}.`,
  })
}

function viewCrewDocuments(member) {
  ui.pushToast({
    tone: 'info',
    title: 'Documentos de tripulación',
    message: `${member.name} registra ${member.documentsCount || 0} documento(s).`,
  })
}

function viewCrewHistory(member) {
  ui.pushToast({
    tone: 'info',
    title: 'Historial de vuelos',
    message: `${member.name} tiene ${member.flightHours || 0} horas registradas.`,
  })
}

function markCrewAvailability(member) {
  populateCrewForm(member)
  crewForm.state = 'Disponible'
  crewForm.availability = 'Inmediata'
  ui.pushToast({
    tone: 'success',
    title: 'Disponibilidad preparada',
    message: `El perfil de ${member.name} quedó listo para actualizar su disponibilidad.`,
  })
}

async function createAvailabilityBlock() {
  clearFormFeedback('availability')
  const selectedAircraft = aircraft.value.find(
    (item) => item.id === Number(availabilityForm.aircraftId),
  )
  if (!selectedAircraft || !availabilityForm.from || !availabilityForm.to) {
    setFormErrors('availability', {
      ...(!selectedAircraft ? { aircraftId: 'Selecciona una aeronave.' } : {}),
      ...(!availabilityForm.from ? { from: 'Indica la fecha de inicio.' } : {}),
      ...(!availabilityForm.to ? { to: 'Indica la fecha de fin.' } : {}),
    })
    return showError(
      'Bloqueo incompleto',
      'Selecciona aeronave, inicio y fin para registrar disponibilidad.',
    )
  }

  if (new Date(availabilityForm.from) >= new Date(availabilityForm.to)) {
    setFormErrors('availability', {
      to: 'La fecha de fin debe ser posterior al inicio.',
    })
    return showError(
      'Rango invalido',
      'La fecha de fin debe ser posterior a la fecha de inicio del bloqueo.',
    )
  }

  const payload = {
    aircraft_id: selectedAircraft.id,
    aircraftId: selectedAircraft.id,
    starts_at: availabilityForm.from,
    ends_at: availabilityForm.to,
    start_datetime: availabilityForm.from,
    end_datetime: availabilityForm.to,
    from: availabilityForm.from,
    to: availabilityForm.to,
    status: normalizeAvailabilityStatusForBackend(availabilityForm.status),
    availability_status: normalizeAvailabilityStatusForBackend(availabilityForm.status),
    reason: availabilityForm.reason || 'Bloqueo manual',
    notes: availabilityForm.reason || 'Bloqueo manual',
  }

  try {
    const response = await requestWithCandidates([
      { method: 'post', path: '/proveedor/disponibilidad', body: payload },
      { method: 'post', path: '/operator/availability', body: payload },
    ])

    const createdBlock = normalizeAvailability(
      pickRecord(response, ['availability', 'block', 'data']),
      availability.value.length,
    )

    if (createdBlock.id == null) {
      const availabilityResponse = await requestWithCandidates([
        { method: 'get', path: '/proveedor/disponibilidad' },
      ])
      const collection = pickCollection(availabilityResponse, ['availability', 'data', 'items'])
      availability.value = collection.map(normalizeAvailability)
    } else {
      availability.value.unshift({
        ...createdBlock,
        aircraftId: createdBlock.aircraftId ?? selectedAircraft.id,
        aircraft: createdBlock.aircraft || selectedAircraft.name,
        from: createdBlock.from || availabilityForm.from,
        to: createdBlock.to || availabilityForm.to,
        status: createdBlock.status || availabilityForm.status,
        reason: createdBlock.reason || availabilityForm.reason || 'Bloqueo manual',
      })
    }
    aircraft.value = aircraft.value.map((item) =>
      item.id === selectedAircraft.id ? { ...item, availability: availabilityForm.status } : item,
    )
  } catch (error) {
    const message = applyBackendValidationErrors(
      'availability',
      error,
      {
        aircraft_id: 'aircraftId',
        starts_at: 'from',
        ends_at: 'to',
        start_datetime: 'from',
        end_datetime: 'to',
        from: 'from',
        to: 'to',
        status: 'status',
        availability_status: 'status',
        reason: 'reason',
        notes: 'reason',
      },
      'La disponibilidad no pudo guardarse en la base de datos.',
    )
    return showError('No se pudo guardar', message)
  }

  pushHistory('Disponibilidad', `Calendario actualizado para ${selectedAircraft.name}`)
  setFormSuccess('availability', 'La disponibilidad se guardo correctamente.')
  ui.pushToast({
    tone: 'success',
    title: 'Disponibilidad actualizada',
    message: 'El calendario operativo fue actualizado.',
  })
  availabilityForm.from = ''
  availabilityForm.to = ''
  availabilityForm.reason = 'Bloqueo manual'
}

async function releaseAvailability(id) {
  if (id == null) {
    return showError(
      'No se pudo liberar',
      'Este bloqueo no tiene un ID valido del backend. Recarga el portal para sincronizar disponibilidad.',
    )
  }

  try {
    await requestWithCandidates([{ method: 'delete', path: `/proveedor/disponibilidad/${id}` }])
  } catch (error) {
    return showError(
      'No se pudo liberar',
      error.message || 'La disponibilidad no pudo eliminarse en la base de datos.',
    )
  }

  const row = availability.value.find((item) => item.id === id)
  availability.value = availability.value.filter((item) => item.id !== id)
  if (row) pushHistory('Disponibilidad', `Bloqueo liberado para ${row.aircraft}`)
}

async function updateRequestStatus(id, status) {
  const request = requests.value.find((item) => String(item.id) === String(id)) || null
  const action = status === 'Aceptada' ? 'accept' : 'reject'
  const translatedAction = status === 'Aceptada' ? 'aceptar' : 'rechazar'
  const backendStatus = resolveOperatorDecisionState(request, status)
  const workflowPayload = buildWorkflowApiPayload(backendStatus)
  const statusPayload = {
    ...workflowPayload,
    state: workflowPayload.status,
    decision: action,
    action,
  }
  requestStatusUpdate.requestId = id
  requestStatusUpdate.action = action

  try {
    await requestWithCandidates([
      ...buildOperatorWorkflowCandidates(request, statusPayload),
      {
        method: 'post',
        path: `/proveedor/solicitudes/${id}/${translatedAction}`,
        body: statusPayload,
      },
      {
        method: 'post',
        path: `/operator/requests/${id}/${action}`,
        body: statusPayload,
      },
      { method: 'put', path: `/proveedor/solicitudes/${id}`, body: statusPayload },
      { method: 'put', path: `/operator/requests/${id}`, body: statusPayload },
      { method: 'put', path: `/proveedor/mis-solicitudes/${id}`, body: statusPayload },
      { method: 'put', path: `/operator/my-requests/${id}`, body: statusPayload },
      {
        method: 'post',
        path: `/proveedor/solicitudes/${id}/status`,
        body: statusPayload,
      },
      { method: 'post', path: `/operator/requests/${id}/status`, body: statusPayload },
    ])
  } catch (error) {
    requestStatusUpdate.requestId = null
    requestStatusUpdate.action = ''
    if (isBackendConnectionError(error)) {
      clearRequestsPolling()
      return showError('Backend no disponible', getBackendConnectionMessage())
    }
    const conciseMessage =
      error?.candidateAttempts?.length
        ? 'El backend no acepto ninguna ruta compatible para actualizar la solicitud.'
        : error.message
    return showError(
      status === 'Aceptada' ? 'No se pudo aceptar' : 'No se pudo rechazar',
      conciseMessage ||
        'La solicitud no pudo actualizarse en la base de datos. Si persiste, el backend aun no expone la ruta de cambio de estado.',
    )
  }

  try {
    await reloadRequestsList()
  } catch (error) {
    requestStatusUpdate.requestId = null
    requestStatusUpdate.action = ''
    return showError(
      'Estado actualizado pero no sincronizado',
      error.message ||
        'La solicitud si pudo cambiar en backend, pero no se pudo recargar el estado real del portal.',
    )
  }

  applyLocalRequestStatusUpdate(id, status, backendStatus)
  if (status === 'Aceptada') {
    requestStatusFilter.value = 'confirmed'
    selectedRequestId.value = String(id)
  }
  pushHistory('Solicitudes', `Solicitud #${id} ${status === 'Aceptada' ? 'aceptada' : 'rechazada'}`)
  ui.pushToast({
    tone: status === 'Aceptada' ? 'success' : 'info',
    title:
      status === 'Aceptada'
        ? backendStatus === 'contract_pending'
          ? 'Contrato iniciado'
          : 'Respuesta proveedor registrada'
        : 'Solicitud rechazada',
    message:
      status === 'Aceptada'
        ? backendStatus === 'contract_pending'
          ? 'La solicitud avanzo a contrato pendiente usando el estado real de la base de datos.'
          : 'La respuesta del proveedor ya quedo registrada en la base de datos.'
        : 'La plataforma podra reasignar otra aeronave sin exponer el rechazo al cliente.',
  })
  emitWorkflowSync({
    scope: 'reservation-workflow',
    reservationId: request?.reservationId || request?.requestId || id,
    requestId: request?.requestId || id,
    nextStage: backendStatus,
    action: status === 'Aceptada' ? 'updated' : 'rejected',
  })
  requestStatusUpdate.requestId = null
  requestStatusUpdate.action = ''
}

async function updateOperationStatus(id, status) {
  try {
    await requestWithCandidates([
      { method: 'put', path: `/proveedor/operaciones/${id}`, body: { status } },
    ])
  } catch (error) {
    return showError(
      'No se pudo actualizar',
      error.message || 'La operacion no pudo actualizarse en la base de datos.',
    )
  }

  try {
    await reloadOperationsList()
  } catch (error) {
    return showError(
      'Estado actualizado pero no sincronizado',
      error.message ||
        'La operacion si cambio en backend, pero no se pudo recargar el estado real.',
    )
  }

  pushHistory('Operaciones', `Operacion #${id} movida a ${status}`)
}

async function assignCrewToOperation(operationId) {
  const draft = getOperationCrewDraft(operationId)
  const member = crew.value.find((item) => item.id === Number(draft.crewId))

  if (!member) {
    return showError(
      'Asignacion incompleta',
      'Selecciona un sobrecargo disponible antes de confirmar la asignacion.',
    )
  }

  const payload = {
    crew_id: member.id,
    sobrecargo_id: member.id,
    crew_name: member.name,
    crew_label: member.name,
    note: draft.note || '',
  }

  try {
    await requestWithCandidates([
      { method: 'put', path: `/proveedor/operaciones/${operationId}`, body: payload },
      { method: 'put', path: `/operator/operations/${operationId}`, body: payload },
    ])
  } catch (error) {
    return showError(
      'No se pudo asignar',
      error.message || 'La asignacion del sobrecargo no pudo guardarse en la base de datos.',
    )
  }

  try {
    await Promise.all([reloadOperationsList(), reloadCrewList()])
  } catch (error) {
    return showError(
      'Asignacion guardada pero no sincronizada',
      error.message ||
        'La asignacion se guardo en backend, pero no se pudo refrescar la operacion real.',
    )
  }

  operationCrewDrafts[operationId] = { crewId: '', note: '' }
  pushHistory('Operaciones', `Sobrecargo ${member.name} asignado a operacion #${operationId}`)
  ui.pushToast({
    tone: 'success',
    title: 'Sobrecargo asignado',
    message: `${member.name} ya quedo vinculado a la operacion #${operationId}.`,
  })
}

async function createIncident() {
  clearFormFeedback('incident')
  if (!incidentForm.flight || !incidentForm.comment) {
    setFormErrors('incident', {
      ...(!incidentForm.flight ? { flight: 'Captura el vuelo.' } : {}),
      ...(!incidentForm.comment ? { comment: 'Captura el comentario.' } : {}),
    })
    return showError(
      'Incidencia incompleta',
      'Captura vuelo y comentario para registrar la incidencia.',
    )
  }

  const linkedOperation = operations.value.find((item) => {
    if (incidentForm.requestId && Number(item.requestId || 0) === Number(incidentForm.requestId)) {
      return true
    }

    return String(item.route || '').trim() === String(incidentForm.flight || '').trim()
  })

  if (!linkedOperation?.id) {
    setFormErrors('incident', {
      requestId:
        'Selecciona una solicitud con operación activa o captura una ruta que ya exista en operaciones.',
    })
    return showError(
      'Incidencia sin operación',
      'La incidencia no se enviará al backend hasta vincularla con una operación real del operador.',
    )
  }

  const payload = {
    operation_id: linkedOperation.id,
    type: incidentForm.type,
    flight: incidentForm.flight,
    status: incidentForm.status,
    priority: incidentForm.priority,
    responsible: incidentForm.responsible || undefined,
    evidence: incidentForm.evidence,
    comment: incidentForm.comment,
    action_taken: incidentForm.actionTaken || undefined,
  }

  try {
    const incidentFlight = incidentForm.flight
    const response = await requestWithCandidates([
      { method: 'post', path: '/proveedor/incidencias', body: payload },
    ])
    incidents.value.unshift(normalizeIncident(pickRecord(response, ['incident', 'data'])))
    Object.assign(incidentForm, {
      requestId: null,
      type: 'Problema operativo',
      flight: '',
      status: 'Abierta',
      priority: 'Media',
      responsible: '',
      evidence: '',
      comment: '',
      actionTaken: '',
    })
    pushHistory('Incidencias', `Incidencia creada para ${incidentFlight}`)
    setFormSuccess('incident', 'La incidencia se guardo correctamente.')
    ui.pushToast({
      tone: 'success',
      title: 'Incidencia registrada',
      message: 'La incidencia ya quedo guardada en backend.',
    })
  } catch (error) {
    const message = applyBackendValidationErrors(
      'incident',
      error,
      {
        operation_id: 'requestId',
        request_id: 'requestId',
        type: 'type',
        flight: 'flight',
        status: 'status',
        priority: 'priority',
        responsible: 'responsible',
        evidence: 'evidence',
        comment: 'comment',
        description: 'comment',
        action_taken: 'actionTaken',
      },
      'La incidencia no pudo guardarse en la base de datos.',
    )
    showError('No se pudo crear', message)
  }
}

async function updateIncidentStatus(id, status) {
  try {
    await requestWithCandidates([
      { method: 'put', path: `/proveedor/incidencias/${id}`, body: { status } },
    ])
  } catch (error) {
    return showError(
      'No se pudo actualizar',
      error.message || 'La incidencia no pudo actualizarse en la base de datos.',
    )
  }

  incidents.value = incidents.value.map((item) => (item.id === id ? { ...item, status } : item))
  pushHistory('Incidencias', `Incidencia #${id} movida a ${status}`)
}

async function saveSettings() {
  clearFormFeedback('settings')
  try {
    const response = await requestWithCandidates([
      {
        method: 'put',
        path: '/proveedor/configuracion',
        body: {
          email_notifications: settings.emailNotifications,
          payment_alerts: settings.paymentAlerts,
          ops_alerts: settings.opsAlerts,
          crew_approval_mode: settings.crewApprovalMode,
        },
      },
    ])
    hydrateSettings(pickRecord(response, ['settings', 'data']))
    pushHistory('Configuracion', 'Preferencias del portal actualizadas')
    setFormSuccess('settings', 'La configuracion se guardo correctamente.')
    ui.pushToast({
      tone: 'success',
      title: 'Configuracion guardada',
      message: 'Las preferencias del proveedor ya quedaron registradas en la base de datos.',
    })
  } catch (error) {
    const message = applyBackendValidationErrors(
      'settings',
      error,
      {
        email_notifications: 'emailNotifications',
        payment_alerts: 'paymentAlerts',
        ops_alerts: 'opsAlerts',
        crew_approval_mode: 'crewApprovalMode',
      },
      'La configuracion no pudo guardarse en la base de datos.',
    )
    showError('No se pudo guardar', message)
  }
}

watch(
  () => aircraftForm.category,
  (nextCategory) => {
    applyAircraftCategoryRule(nextCategory)
  },
)

watch(
  () => [canLoadProviderData.value, providerId.value],
  ([canLoad, nextProviderId], previous = []) => {
    const [previousCanLoad, previousProviderId] = previous

    if (!canLoad) {
      return
    }

    if (!previousCanLoad || previousProviderId == null) {
      schedulePortalLoad()
      return
    }

    if (nextProviderId !== previousProviderId) {
      schedulePortalLoad()
    }
  },
  { immediate: true },
)

watch(
  filteredRequests,
  (nextRequests) => {
    if (!nextRequests.length) {
      selectedRequestId.value = null
      return
    }

    if (!nextRequests.some((request) => request.id === selectedRequestId.value)) {
      selectedRequestId.value = nextRequests[0].id
    }
  },
  { immediate: true },
)

onMounted(() => {
  syncCompanyForm()
  resetCrewForm()
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleRequestsVisibilityRefresh)
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleRequestsVisibilityRefresh)
  }
  removeWorkflowSyncSubscription = subscribeWorkflowSync((payload = {}) => {
    if (payload.scope !== 'reservation-workflow') return
    if (!shouldAutoRefreshRequests()) return
    void refreshRequestsList({ silent: true })
  })
  startRequestsPolling()
})

onBeforeUnmount(() => {
  clearRequestsPolling()
  if (removeWorkflowSyncSubscription) {
    removeWorkflowSyncSubscription()
    removeWorkflowSyncSubscription = null
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('focus', handleRequestsVisibilityRefresh)
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleRequestsVisibilityRefresh)
  }
})

watch(
  () => props.section,
  () => {
    startRequestsPolling()
    if (shouldAutoRefreshRequests()) {
      void refreshRequestsList({ silent: true })
    }
  },
)
</script>

<template>
  <div class="operator-portal-page">
    <section class="hero surface">
      <div>
        <p class="eyebrow">Portal proveedor</p>
        <h1>{{ providerName }}</h1>
        <p class="muted">
          Administra empresa, aeronaves, disponibilidad y respuesta operativa bajo la capa comercial de Red Aviation.
        </p>
      </div>

      <div class="hero-actions">
        <span v-if="loading" class="badge">Sincronizando backend...</span>
        <button type="button" class="ghost-button" @click="goToSection('empresa')">
          Mi empresa
        </button>
        <button type="button" class="primary-action" @click="goToSection('aeronaves')">
          Crear / gestionar aeronaves
        </button>
      </div>
    </section>

    <section v-if="section === 'dashboard'" class="page-grid">
      <article class="surface dashboard-hero-premium">
        <div class="section-head">
          <div>
            <p class="eyebrow">Centro operativo</p>
            <h2>{{ providerName }}</h2>
            <p class="muted">
              Operador {{ companyStatusMeta.label.toLowerCase() }} · {{ aircraft.length }} aeronaves
              · {{ companyOperationalBase }}
            </p>
          </div>
          <span class="status-pill" :data-tone="dashboardGlobalStatus.tone">
            {{ dashboardGlobalStatus.title }}
          </span>
        </div>

        <p class="muted helper-copy">{{ dashboardGlobalStatus.detail }}</p>

        <div class="company-progress-card">
          <div class="company-progress-head">
            <div>
              <span class="mini-label">Configuracion del operador</span>
              <strong
                >{{ dashboardCompletion.completed }} de {{ dashboardCompletion.total }} modulos
                completados</strong
              >
            </div>
            <strong>{{ dashboardCompletion.percent }}%</strong>
          </div>
          <div class="progress-bar">
            <span
              class="progress-bar-fill"
              :style="{ width: `${dashboardCompletion.percent}%` }"
            ></span>
          </div>
        </div>

        <div class="dashboard-alert-strip">
          <article
            v-for="alert in dashboardAlerts"
            :key="alert.title"
            class="company-alert"
            :data-tone="alert.tone"
          >
            <strong>{{ alert.title }}</strong>
            <button type="button" class="ghost-link-button" @click="goToSection(alert.section)">
              {{ alert.action }}
            </button>
          </article>
        </div>

        <div class="dashboard-quick-actions">
          <button
            v-for="action in dashboardQuickActions"
            :key="action.id"
            type="button"
            class="quick-action-card"
            @click="action.action()"
          >
            <span>{{ action.icon }}</span>
            <strong>{{ action.label }}</strong>
            <small>{{ action.detail }}</small>
          </button>
        </div>
      </article>

      <div class="dashboard-layout">
        <div class="dashboard-main-column">
          <article class="surface">
            <div class="section-head">
              <div>
                <p class="eyebrow">Estado operacional</p>
                <h2>Indicadores vivos del operador</h2>
              </div>
            </div>

            <div class="metrics-grid dashboard-metric-grid">
              <article
                v-for="card in dashboardCards"
                :key="card.label"
                class="metric-card dashboard-metric-card"
                :data-tone="card.tone"
              >
                <span>{{ card.icon }} {{ card.label }}</span>
                <strong>{{ card.value }}</strong>
                <p class="metric-status">{{ card.status }}</p>
                <small>{{ card.detail }}</small>
              </article>
            </div>
          </article>

          <article class="surface">
            <div class="section-head">
              <div>
                <p class="eyebrow">Checklist</p>
                <h2>Por donde empezar</h2>
              </div>
            </div>

            <div class="dashboard-checklist">
              <button
                v-for="item in dashboardChecklist"
                :key="item.id"
                type="button"
                class="checklist-card"
                :data-tone="item.status"
                @click="goToSection(item.section)"
              >
                <div>
                  <strong>{{ item.icon }} {{ item.label }}</strong>
                  <p>{{ item.detail }}</p>
                </div>
                <span>{{ item.cta }}</span>
              </button>
            </div>
          </article>
        </div>

        <div class="dashboard-side-column">
          <article class="surface">
            <div class="section-head">
              <div>
                <p class="eyebrow">Actividad reciente</p>
                <h2>Sistema vivo</h2>
              </div>
            </div>

            <div class="ops-timeline">
              <article
                v-for="entry in dashboardRecentActivity"
                :key="entry.id"
                class="ops-timeline-item"
              >
                <span class="ops-timeline-time">{{ entry.date }}</span>
                <div>
                  <strong>{{ entry.title }}</strong>
                  <p class="muted">{{ entry.detail }}</p>
                </div>
              </article>
              <p v-if="!dashboardRecentActivity.length" class="empty-state">
                La actividad reciente aparecera aqui conforme el operador use la plataforma.
              </p>
            </div>
          </article>

          <article class="surface">
            <div class="section-head">
              <div>
                <p class="eyebrow">Prioridades</p>
                <h2>Lectura rapida</h2>
              </div>
            </div>

            <div class="priority-list">
              <article class="priority-item priority-item--static">
                <strong>Empresa</strong>
                <span>{{ companyStatusMeta.headline }}</span>
              </article>
              <article class="priority-item priority-item--static">
                <strong>Flota</strong>
                <span
                  >{{ activeAircraft }} aeronaves activas y {{ fleetGroupedByStatus.revision }} en
                  revision.</span
                >
              </article>
              <article class="priority-item priority-item--static">
                <strong>Operacion</strong>
                <span
                  >{{ pendingRequests }} solicitudes pendientes y {{ activeOperations }} operaciones
                  activas.</span
                >
              </article>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section v-else-if="section === 'empresa'" class="page-grid two-columns">
      <article class="surface company-shell">
        <div class="section-head">
          <div>
            <p class="eyebrow">Perfil de operador</p>
            <h2>{{ providerName }}</h2>
            <p class="muted">
              Operador activo · {{ companyOperationalBase }} · {{ aircraft.length }} aeronaves ·
              {{ companyStatusMeta.label }}
            </p>
          </div>
          <span class="status-pill" :data-tone="companyStatusMeta.tone">{{
            companyStatusMeta.label
          }}</span>
        </div>

        <div class="company-progress-card">
          <div class="company-progress-head">
            <div>
              <span class="mini-label">Onboarding</span>
              <strong
                >{{ companyOnboardingProgress.completed }} de
                {{ companyOnboardingProgress.total }} pasos completados</strong
              >
            </div>
            <strong>{{ companyOnboardingProgress.percent }}%</strong>
          </div>
          <div class="progress-bar">
            <span
              class="progress-bar-fill"
              :style="{ width: `${companyOnboardingProgress.percent}%` }"
            ></span>
          </div>
          <div class="company-progress-steps">
            <span
              v-for="step in companyOnboardingSteps"
              :key="step.id"
              class="progress-chip"
              :data-tone="step.complete ? 'success' : step.pending ? 'warning' : 'neutral'"
            >
              {{ step.complete ? 'OK' : step.pending ? 'Pend' : 'Info' }} · {{ step.label }}
            </span>
          </div>
        </div>

        <div class="company-form-sections">
          <section class="company-form-section">
            <div class="section-head compact-head">
              <div>
                <p class="eyebrow">Informacion fiscal</p>
                <h3>Identidad corporativa</h3>
              </div>
            </div>

            <div class="form-grid">
              <label>
                <span>Razon social</span>
                <input
                  v-model="companyForm.legalName"
                  type="text"
                  :class="{ 'input-error': formErrors.company.legalName }"
                />
                <small v-if="formErrors.company.legalName" class="field-error">{{
                  formErrors.company.legalName
                }}</small>
              </label>
              <label>
                <span>RFC</span>
                <input
                  v-model="companyForm.rfc"
                  type="text"
                  :class="{ 'input-error': formErrors.company.rfc }"
                />
                <small v-if="formErrors.company.rfc" class="field-error">{{
                  formErrors.company.rfc
                }}</small>
              </label>
              <label class="span-2">
                <span>Direccion</span>
                <input
                  v-model="companyForm.address"
                  type="text"
                  :class="{ 'input-error': formErrors.company.address }"
                />
                <small v-if="formErrors.company.address" class="field-error">{{
                  formErrors.company.address
                }}</small>
              </label>
              <label class="span-2">
                <span>Nombre comercial</span>
                <input
                  v-model="companyForm.tradeName"
                  type="text"
                  :class="{ 'input-error': formErrors.company.tradeName }"
                />
                <small v-if="formErrors.company.tradeName" class="field-error">{{
                  formErrors.company.tradeName
                }}</small>
              </label>
            </div>
          </section>

          <section class="company-form-section">
            <div class="section-head compact-head">
              <div>
                <p class="eyebrow">Contacto operativo</p>
                <h3>Canal de coordinacion</h3>
              </div>
            </div>

            <div class="form-grid">
              <label>
                <span>Telefono</span>
                <input
                  v-model="companyForm.phone"
                  type="text"
                  :class="{ 'input-error': formErrors.company.phone }"
                />
                <small v-if="formErrors.company.phone" class="field-error">{{
                  formErrors.company.phone
                }}</small>
              </label>
              <label>
                <span>Email</span>
                <input
                  v-model="companyForm.email"
                  type="email"
                  :class="{ 'input-error': formErrors.company.email }"
                />
                <small v-if="formErrors.company.email" class="field-error">{{
                  formErrors.company.email
                }}</small>
              </label>
            </div>
          </section>

          <section class="company-form-section">
            <div class="section-head compact-head">
              <div>
                <p class="eyebrow">Representante legal</p>
                <h3>Responsable autorizado</h3>
              </div>
            </div>

            <div class="form-grid">
              <label class="span-2">
                <span>Nombre</span>
                <input
                  v-model="companyForm.legalRepresentative"
                  type="text"
                  :class="{ 'input-error': formErrors.company.legalRepresentative }"
                />
                <small v-if="formErrors.company.legalRepresentative" class="field-error">{{
                  formErrors.company.legalRepresentative
                }}</small>
              </label>
            </div>
          </section>

          <section class="company-form-section">
            <div class="section-head compact-head">
              <div>
                <p class="eyebrow">Pricing global</p>
                <h3>Jet A, utilidad y fee fijo</h3>
              </div>
            </div>

            <div class="form-grid">
              <label>
                <span>Jet A USD/gal</span>
                <input
                  v-model="companyForm.jetAPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  :class="{ 'input-error': formErrors.company.jetAPrice }"
                />
                <small v-if="formErrors.company.jetAPrice" class="field-error">{{
                  formErrors.company.jetAPrice
                }}</small>
              </label>
              <label>
                <span>Utilidad %</span>
                <input
                  v-model="companyForm.marginPercent"
                  type="number"
                  min="0"
                  step="0.01"
                  :class="{ 'input-error': formErrors.company.marginPercent }"
                />
                <small v-if="formErrors.company.marginPercent" class="field-error">{{
                  formErrors.company.marginPercent
                }}</small>
              </label>
              <label class="span-2">
                <span>Fee fijo global USD</span>
                <input
                  v-model="companyForm.fixedFee"
                  type="number"
                  min="0"
                  step="0.01"
                  :class="{ 'input-error': formErrors.company.fixedFee }"
                />
                <small v-if="formErrors.company.fixedFee" class="field-error">{{
                  formErrors.company.fixedFee
                }}</small>
              </label>
            </div>
          </section>

          <section class="company-form-section">
            <div class="section-head compact-head">
              <div>
                <p class="eyebrow">Documentacion</p>
                <h3>Carga legal y respaldo</h3>
              </div>
            </div>

            <label
              class="upload-dropzone"
              :class="{ 'input-error': formErrors.company.newDocumentFile }"
            >
              <input
                type="file"
                class="upload-dropzone-input"
                @change="setCompanyDocumentFile($event.target.files?.[0] || null)"
              />
              <strong>Arrastra documentos aqui</strong>
              <span>o selecciona un archivo para subir al expediente de empresa</span>
              <small>PDF, DOCX o imagen · maximo 10 MB</small>
            </label>
            <small v-if="formErrors.company.newDocumentFile" class="field-error">{{
              formErrors.company.newDocumentFile
            }}</small>
          </section>
        </div>

        <p v-if="formErrors.company._form" class="form-feedback form-feedback-error">
          {{ formErrors.company._form }}
        </p>
        <p v-if="formSuccess.company" class="form-feedback form-feedback-success">
          {{ formSuccess.company }}
        </p>
        <p v-if="companyForm.newDocumentName" class="muted helper-copy">
          Documento listo: {{ companyForm.newDocumentName }}
        </p>

        <div class="inline-actions">
          <button type="button" class="ghost-button" @click="saveCompany">Guardar cambios</button>
          <button type="button" class="primary-action" @click="sendCompanyToReview">
            Enviar empresa a revision
          </button>
        </div>
      </article>

      <article class="surface company-status-shell">
        <div class="section-head">
          <div>
            <p class="eyebrow">Validacion operativa</p>
            <h2>Centro de validacion de operador aeronautico</h2>
          </div>
          <span class="status-pill" :data-tone="companyStatusMeta.tone">{{
            companyStatusMeta.label
          }}</span>
        </div>

        <article class="company-verification-card">
          <span class="mini-label">Confidence</span>
          <h3>{{ companyStatusMeta.headline }}</h3>
          <p class="muted">
            Tu empresa esta habilitada para operar dentro del ecosistema Red Aviation con foco en
            cumplimiento legal, readiness documental y alta de flota.
          </p>
          <div class="company-checklist">
            <span class="progress-chip" :data-tone="companyForm.legalName ? 'success' : 'warning'"
              >Empresa validada</span
            >
            <span class="progress-chip" :data-tone="companyForm.rfc ? 'success' : 'warning'"
              >RFC aprobado</span
            >
            <span
              class="progress-chip"
              :data-tone="company.documents.length ? 'success' : 'warning'"
              >Documentacion legal</span
            >
            <span class="progress-chip" :data-tone="companyStatusMeta.tone">Acceso habilitado</span>
          </div>
          <p class="muted">Ultima revision: {{ companyLastAuditDate }}</p>
        </article>

        <div class="company-summary-grid">
          <article
            v-for="item in companyValidationSummary"
            :key="item.label"
            class="company-summary-row"
          >
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </article>
        </div>

        <div class="company-alert-stack">
          <article
            v-for="alert in companyAlerts"
            :key="alert.title"
            class="company-alert"
            :data-tone="alert.tone"
          >
            <strong>{{ alert.title }}</strong>
          </article>
        </div>

        <div class="status-list">
          <div class="status-row">
            <span>Observaciones Admin</span>
            <strong>{{
              company.adminNotes || 'Sin observaciones de administracion por ahora.'
            }}</strong>
          </div>
        </div>

        <div class="document-list company-document-list">
          <article v-for="document in company.documents" :key="document.id" class="list-card">
            <div>
              <strong>{{ document.name }}</strong>
              <p class="muted">Estado: {{ document.state }}</p>
            </div>
          </article>
          <p v-if="!company.documents.length" class="empty-state">
            Aun no hay documentos visibles en el expediente legal del operador.
          </p>
        </div>

        <div class="ops-timeline">
          <article v-for="entry in companyAuditTimeline" :key="entry.id" class="ops-timeline-item">
            <span class="ops-timeline-time">{{ entry.date }}</span>
            <div>
              <strong>{{ entry.action }}</strong>
              <p class="muted">{{ entry.actor }}</p>
            </div>
          </article>
          <p v-if="!companyAuditTimeline.length" class="empty-state">
            El historial administrativo aparecera aqui conforme avance la validacion.
          </p>
        </div>
      </article>
    </section>

    <section v-else-if="section === 'aeronaves'" class="page-grid">
      <article class="surface fleet-hero">
        <div>
          <p class="eyebrow">Centro de flota</p>
          <h2>Operaciones, disponibilidad y alta premium de aeronaves</h2>
          <p class="muted">
            La flota vive primero como activo operativo: disponibilidad hoy, estado documental,
            siguiente mision y capacidad comercial en una sola lectura.
          </p>
        </div>

        <div class="hero-actions">
          <span class="badge">Empresa: {{ company.reviewStatus }}</span>
          <button type="button" class="primary-action" @click="openAircraftWizard()">
            + Registrar aeronave
          </button>
        </div>
      </article>

      <div class="fleet-kpi-grid">
        <article
          v-for="kpi in aircraftOperationalKpis"
          :key="kpi.label"
          class="fleet-kpi-card"
          :data-tone="kpi.tone"
        >
          <span>{{ kpi.label }}</span>
          <strong>{{ kpi.value }}</strong>
          <p>{{ kpi.detail }}</p>
        </article>
      </div>

      <div class="fleet-layout">
        <div class="fleet-main-column">
          <article class="surface fleet-section-card">
            <div class="section-head">
              <div>
                <p class="eyebrow">Flota activa</p>
                <h2>Aeronaves operativas y readiness comercial</h2>
              </div>
              <span class="badge">Total {{ aircraft.length }}</span>
            </div>

            <div v-if="aircraft.length" class="fleet-premium-grid">
              <article v-for="item in aircraft" :key="item.id" class="fleet-premium-card">
                <div
                  class="fleet-visual"
                  :style="getAircraftVisualStyle(item)"
                >
                  <img
                    v-if="hasImage(item.mainImage)"
                    :src="normalizeMediaUrl(item.mainImage)"
                    :alt="`Imagen de ${item.name}`"
                    class="fleet-visual-image"
                  />
                  <div class="fleet-visual-top">
                    <span class="status-pill" :data-tone="getAircraftLiveStatus(item).tone">
                      {{ getAircraftLiveStatus(item).label }}
                    </span>
                    <span class="status-pill status-pill--ghost">
                      {{ humanizeAircraftStatus(item.status) }}
                    </span>
                  </div>

                  <div class="fleet-visual-copy">
                    <strong>{{ item.name }}</strong>
                    <p>
                      {{ item.registration || 'Sin matricula' }} · Base
                      {{ item.base || 'Sin base' }}
                    </p>
                    <div class="fleet-inline-metrics">
                      <span>{{ item.capacity || 'N/D' }} pax</span>
                      <span>{{ item.rangeKm || 'N/D' }} km</span>
                      <span>{{ formatCurrency(item.hourlyPrice) }}</span>
                    </div>
                  </div>
                </div>

                <div class="fleet-card-body">
                  <div class="fleet-card-row">
                    <div>
                      <span class="mini-label">Proxima mision</span>
                      <strong>{{
                        getAircraftUpcomingOperation(item)?.route || 'Sin vuelo asignado'
                      }}</strong>
                    </div>
                    <div>
                      <span class="mini-label">Horario</span>
                      <strong>
                        {{
                          getAircraftUpcomingOperation(item)?.departure
                            ? formatDateTimeDisplay(getAircraftUpcomingOperation(item).departure)
                            : 'Disponible hoy'
                        }}
                      </strong>
                    </div>
                  </div>

                  <div class="fleet-card-row">
                    <div>
                      <span class="mini-label">Expediente</span>
                      <strong>{{ getAircraftDocumentHealth(item).label }}</strong>
                    </div>
                    <p class="muted compact-copy">{{ getAircraftDocumentHealth(item).detail }}</p>
                  </div>

                  <div class="weekly-strip">
                    <span class="mini-label">Disponibilidad semanal</span>
                    <div class="weekly-dots">
                      <span
                        v-for="slot in getAircraftWeeklyAvailability(item)"
                        :key="slot.key"
                        class="weekly-dot"
                        :data-tone="slot.tone"
                        :title="slot.label"
                      >
                        {{ slot.label }}
                      </span>
                    </div>
                  </div>

                  <div class="fleet-inline-metrics">
                    <span>{{ item.manufacturer || 'Fabricante pendiente' }}</span>
                    <span>{{ item.coverage || 'Cobertura por definir' }}</span>
                    <span>{{ item.documents?.length || 0 }} docs</span>
                  </div>

                  <div class="inline-actions">
                    <button type="button" class="ghost-button" @click="openAircraftWizard(item, 'view')">
                      Ver
                    </button>
                    <button type="button" class="ghost-button" @click="openAircraftWizard(item, 'edit')">
                      Editar
                    </button>
                    <button
                      type="button"
                      class="ghost-button gold-button"
                      @click="sendAircraftToReview(item.id)"
                    >
                      Enviar revision
                    </button>
                    <button type="button" class="ghost-button" @click="archiveAircraft(item.id)">
                      Archivar
                    </button>
                    <button
                      type="button"
                      class="ghost-button danger-button"
                      @click="deleteAircraft(item.id)"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </article>
            </div>
            <p v-else class="empty-state">Aun no hay aeronaves registradas para este proveedor.</p>
          </article>
        </div>

        <div class="fleet-side-column">
          <article class="surface fleet-section-card">
            <div class="section-head">
              <div>
                <p class="eyebrow">Timeline</p>
                <h2>Actividad operativa</h2>
              </div>
            </div>

            <div class="ops-timeline">
              <article
                v-for="entry in aircraftOperationalTimeline"
                :key="entry.id"
                class="ops-timeline-item"
              >
                <span class="ops-timeline-time">{{ entry.time }}</span>
                <div>
                  <strong>{{ entry.title }}</strong>
                  <p class="muted">{{ entry.detail }}</p>
                </div>
              </article>
              <p v-if="!aircraftOperationalTimeline.length" class="empty-state">
                Aun no hay actividad suficiente para construir el timeline operativo.
              </p>
            </div>
          </article>

          <article class="surface fleet-section-card">
            <div class="section-head">
              <div>
                <p class="eyebrow">Atencion inmediata</p>
                <h2>Alertas de flota</h2>
              </div>
            </div>

            <div class="priority-list">
              <article
                v-for="note in aircraftPriorityNotes"
                :key="note.id"
                class="priority-item priority-item--static"
              >
                <strong>{{ note.label }} · {{ note.value }}</strong>
                <span>{{ note.detail }}</span>
              </article>
            </div>
          </article>
        </div>
      </div>

      <div v-if="aircraftWizardOpen" class="wizard-overlay">
        <article class="wizard-modal surface">
          <div class="wizard-sticky-head">
            <div class="wizard-header">
              <div>
                <p class="eyebrow">Registro premium</p>
                <h2>{{ aircraftWizardTitle }}</h2>
                <p class="muted">
                  {{
                    aircraftWizardReadOnly
                      ? 'Consulta completa de la aeronave: navega por general, operacion, galeria, documentacion y revision sin editar.'
                      : 'Onboarding operativo estilo dispatch: primero datos, luego galeria, expediente y revision.'
                  }}
                </p>
              </div>

              <button type="button" class="ghost-button" @click="closeAircraftWizard">
                Cerrar
              </button>
            </div>

            <div class="wizard-stepper">
              <button
                v-for="step in aircraftWizardSteps"
                :key="step.id"
                type="button"
                class="wizard-step"
                :class="{
                  active: aircraftWizardStep === step.id,
                  complete: aircraftWizardStep > step.id,
                }"
                :disabled="aircraftWizardSubmitting"
                @click="aircraftWizardStep = step.id"
              >
                <span>{{ String(step.id).padStart(2, '0') }}</span>
                <strong>{{ step.label }}</strong>
                <small>{{ step.description }}</small>
              </button>
            </div>
          </div>

          <div class="wizard-body">
            <div v-if="aircraftWizardStep === 1" class="wizard-panel">
              <div class="section-head">
                <div>
                  <p class="eyebrow">Paso 1</p>
                  <h3>Informacion general</h3>
                </div>
              </div>

              <div class="form-grid">
                <label>
                  <span>Modelo</span>
                  <input
                    v-model="aircraftForm.name"
                    type="text"
                    :disabled="aircraftWizardReadOnly"
                    :class="{ 'input-error': formErrors.aircraft.name }"
                    @input="setUppercaseAircraftField('name', $event.target.value)"
                  />
                  <small v-if="formErrors.aircraft.name" class="field-error">{{
                    formErrors.aircraft.name
                  }}</small>
                </label>
                <label>
                  <span>Fabricante</span>
                  <input
                    v-model="aircraftForm.manufacturer"
                    type="text"
                    :disabled="aircraftWizardReadOnly"
                    :class="{ 'input-error': formErrors.aircraft.manufacturer }"
                    @input="setUppercaseAircraftField('manufacturer', $event.target.value)"
                  />
                  <small v-if="formErrors.aircraft.manufacturer" class="field-error">{{
                    formErrors.aircraft.manufacturer
                  }}</small>
                </label>
                <label>
                  <span>Categoria</span>
                  <select
                    v-model="aircraftForm.category"
                    :disabled="aircraftWizardReadOnly"
                    :class="{ 'input-error': formErrors.aircraft.category }"
                  >
                    <option value="">Selecciona</option>
                    <option v-for="option in aircraftCategoryOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                  <small v-if="formErrors.aircraft.category" class="field-error">{{
                    formErrors.aircraft.category
                  }}</small>
                </label>
                <label>
                  <span>Matricula <small>opcional</small></span>
                  <input
                    v-model="aircraftForm.registration"
                    type="text"
                    :disabled="aircraftWizardReadOnly"
                    :class="{ 'input-error': formErrors.aircraft.registration }"
                    @input="setUppercaseAircraftField('registration', $event.target.value)"
                  />
                  <small v-if="formErrors.aircraft.registration" class="field-error">{{
                    formErrors.aircraft.registration
                  }}</small>
                </label>
                <label>
                  <span>Anio</span>
                  <input
                    v-model="aircraftForm.year"
                    type="number"
                    min="1900"
                    :disabled="aircraftWizardReadOnly"
                    :class="{ 'input-error': formErrors.aircraft.year }"
                  />
                  <small v-if="formErrors.aircraft.year" class="field-error">{{
                    formErrors.aircraft.year
                  }}</small>
                </label>
                <label class="span-2">
                  <span>Base operativa</span>
                  <input
                    v-model="aircraftForm.base"
                    type="text"
                    :disabled="aircraftWizardReadOnly"
                    :class="{ 'input-error': formErrors.aircraft.base }"
                    @input="setUppercaseAircraftField('base', $event.target.value)"
                  />
                  <small v-if="formErrors.aircraft.base" class="field-error">{{
                    formErrors.aircraft.base
                  }}</small>
                </label>
              </div>
            </div>

            <div v-else-if="aircraftWizardStep === 2" class="wizard-panel">
              <div class="section-head">
                <div>
                  <p class="eyebrow">Paso 2</p>
                  <h3>Operacion y pricing</h3>
                </div>
              </div>

              <div class="form-grid">
                <label>
                  <span>Tipo de motor</span>
                  <input v-model="aircraftForm.engineType" type="text" disabled />
                </label>
                <label>
                  <span>Clase de motor</span>
                  <input v-model="aircraftForm.engineClass" type="text" disabled />
                </label>
                <label>
                  <span>Gastos aeroportuarios USD</span>
                  <input
                    v-model="aircraftForm.airportExpensesUsd"
                    type="number"
                    min="0"
                    disabled
                  />
                </label>
                <label>
                  <span>Capacidad</span>
                  <input
                    v-model="aircraftForm.capacity"
                    type="number"
                    min="1"
                    :disabled="aircraftWizardReadOnly"
                    :class="{ 'input-error': formErrors.aircraft.capacity }"
                  />
                  <small v-if="formErrors.aircraft.capacity" class="field-error">{{
                    formErrors.aircraft.capacity
                  }}</small>
                </label>
                <label>
                  <span>Velocidad crucero (knots)</span>
                  <input
                    v-model="aircraftForm.speedKnots"
                    type="number"
                    min="0"
                    :disabled="aircraftWizardReadOnly"
                    :class="{ 'input-error': formErrors.aircraft.speedKnots }"
                  />
                  <small v-if="formErrors.aircraft.speedKnots" class="field-error">{{
                    formErrors.aircraft.speedKnots
                  }}</small>
                </label>
                <label>
                  <span>Precio por hora</span>
                  <input
                    v-model="aircraftForm.hourlyPrice"
                    type="number"
                    min="0"
                    :disabled="aircraftWizardReadOnly"
                    :class="{ 'input-error': formErrors.aircraft.hourlyPrice }"
                  />
                  <small v-if="formErrors.aircraft.hourlyPrice" class="field-error">{{
                    formErrors.aircraft.hourlyPrice
                  }}</small>
                </label>
              </div>
            </div>

            <div v-else-if="aircraftWizardStep === 3" class="wizard-panel">
              <div class="section-head">
                <div>
                  <p class="eyebrow">Paso 3</p>
                  <h3>Galeria comercial</h3>
                </div>
                <span class="badge">{{ countSelectedImageFiles() }} archivo(s)</span>
              </div>

              <div class="form-grid">
                <label>
                  <span>Imagen principal</span>
                  <input
                    type="file"
                    :disabled="aircraftWizardReadOnly"
                    accept="image/*"
                    @change="setAircraftImageField('mainFile', $event.target.files?.[0] || null)"
                  />
                </label>
                <label>
                  <span>Cabina</span>
                  <input
                    type="file"
                    :disabled="aircraftWizardReadOnly"
                    accept="image/*"
                    @change="setAircraftImageField('cabinFile', $event.target.files?.[0] || null)"
                  />
                </label>
                <label>
                  <span>Asientos</span>
                  <input
                    type="file"
                    :disabled="aircraftWizardReadOnly"
                    accept="image/*"
                    @change="setAircraftImageField('seatsFile', $event.target.files?.[0] || null)"
                  />
                </label>
                <label>
                  <span>Servicios proporcionados</span>
                  <input
                    type="file"
                    :disabled="aircraftWizardReadOnly"
                    accept="image/*"
                    @change="
                      setAircraftImageField('amenitiesFile', $event.target.files?.[0] || null)
                    "
                  />
                </label>
              </div>

              <div v-if="selectedImageAircraft?.images?.length" class="stored-images-grid">
                <article class="stored-image-card">
                  <span>Principal guardada</span>
                  <img
                    v-if="getAircraftImageByKind(selectedImageAircraft, 'main')?.imageUrl"
                    :src="getAircraftImageByKind(selectedImageAircraft, 'main').imageUrl"
                    alt="Imagen principal guardada"
                    class="stored-image-preview"
                  />
                </article>
                <article class="stored-image-card">
                  <span>Cabina guardada</span>
                  <img
                    v-if="getAircraftImageByKind(selectedImageAircraft, 'cabin')?.imageUrl"
                    :src="getAircraftImageByKind(selectedImageAircraft, 'cabin').imageUrl"
                    alt="Imagen de cabina guardada"
                    class="stored-image-preview"
                  />
                </article>
              </div>
            </div>

            <div v-else-if="aircraftWizardStep === 4" class="wizard-panel">
              <div class="section-head">
                <div>
                  <p class="eyebrow">Paso 4</p>
                  <h3>Biblioteca documental y multimedia</h3>
                  <p class="muted compact-copy">
                    Carga multiples imagenes o PDF por categoria. Las imagenes compatibles se optimizan a WebP antes de enviarse.
                  </p>
                </div>
                <span class="badge"
                  >{{ selectedDocumentAircraft?.documents?.length || 0 }} registro(s)</span
                >
              </div>

              <div class="document-type-grid">
                <button
                  v-for="type in aircraftDocumentTypes"
                  :key="type.id"
                  type="button"
                  class="document-type-card"
                  :class="{ active: documentForm.type === type.id }"
                  @click="selectDocumentType(type.id)"
                >
                  <strong>{{ type.label }}</strong>
                  <span>PDF + IMG</span>
                  <small>{{ type.requiresExpiry ? 'Vencimiento requerido' : 'Sin vencimiento obligatorio' }}</small>
                </button>
              </div>

              <div class="document-upload-grid">
                <label class="field">
                  <span>Tipo de archivo</span>
                  <select v-model="documentForm.type" :class="{ 'input-error': formErrors.document.type }" @change="selectDocumentType($event.target.value)">
                    <option v-for="type in aircraftDocumentTypes" :key="type.id" :value="type.id">
                      {{ type.label }}
                    </option>
                  </select>
                  <small v-if="formErrors.document.type" class="field-error">{{ formErrors.document.type }}</small>
                </label>

                <label
                  class="document-dropzone"
                  :class="{ active: documentForm.dragActive, 'input-error': formErrors.document.file }"
                  @dragover.prevent="documentForm.dragActive = true"
                  @dragleave.prevent="documentForm.dragActive = false"
                  @drop.prevent="handleDocumentDrop"
                >
                  <input
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf,image/*,application/pdf"
                    @change="setAircraftDocumentFiles"
                  />
                  <strong>Arrastra archivos aqui o selecciona multiples</strong>
                  <span>Imagen max 8MB. PDF max 25MB. Hasta {{ maxAircraftDocumentFiles }} archivos por carga.</span>
                  <small>Categoria activa: {{ selectedDocumentType.label }}</small>
                </label>
              </div>

              <p v-if="formErrors.document._form" class="form-feedback form-feedback-error">
                {{ formErrors.document._form }}
              </p>
              <p v-if="formErrors.document.file" class="form-feedback form-feedback-error">
                {{ formErrors.document.file }}
              </p>
              <p v-if="formSuccess.document" class="form-feedback form-feedback-success">
                {{ formSuccess.document }}
              </p>

              <div v-if="documentForm.files.length" class="document-preview-grid">
                <article
                  v-for="item in documentForm.files"
                  :key="item.id"
                  class="document-preview-card"
                  role="button"
                  tabindex="0"
                  @click="openDocumentPreview(item)"
                  @keydown.enter.prevent="openDocumentPreview(item)"
                >
                  <img v-if="item.previewUrl" :src="item.previewUrl" :alt="item.name" />
                  <div v-else class="pdf-preview">PDF</div>
                  <strong>{{ item.name }}</strong>
                  <span>{{ item.typeLabel }} · {{ item.kind.toUpperCase() }} · {{ formatFileSize(item.size) }}</span>
                  <button type="button" class="ghost-button danger-button" @click.stop="removeAircraftDocumentFile(item.id)">
                    Eliminar
                  </button>
                </article>
              </div>

              <div class="document-library-header">
                <div>
                  <span class="mini-label">Contenido documental</span>
                  <strong>Biblioteca guardada de la aeronave</strong>
                </div>
                <span class="badge">{{ selectedDocumentAircraft?.documents?.length || 0 }} archivo(s)</span>
              </div>

              <div v-if="selectedDocumentAircraft?.documents?.length" class="stored-documents-list document-library">
                <article
                  v-for="document in selectedDocumentAircraft.documents"
                  :key="document.id"
                  class="stored-document-card"
                  role="button"
                  tabindex="0"
                  @click="openStoredDocumentPreview(document)"
                  @keydown.enter.prevent="openStoredDocumentPreview(document)"
                >
                  <div class="card-top">
                    <div>
                      <strong>{{ document.name }}</strong>
                      <p class="muted">
                        {{ document.type }} · {{ formatDocumentExpiry(document.expiresAt) }}
                      </p>
                    </div>
                    <span class="badge">{{ document.state }}</span>
                  </div>
                  <div class="fleet-inline-metrics">
                    <span>{{ document.typeLabel }}</span>
                    <span>{{ document.fileType || (getStoredDocumentKind(document) === 'image' ? 'Imagen' : 'PDF') }}</span>
                    <span>{{ document.expiresAt ? 'Con vencimiento' : 'Sin vencimiento' }}</span>
                  </div>
                  <div class="inline-actions">
                    <button
                      type="button"
                      class="ghost-button danger-button"
                      @click.stop="removeStoredAircraftDocument(selectedDocumentAircraft?.id, document.id)"
                    >
                      Eliminar
                    </button>
                  </div>
                  <a v-if="document.fileUrl" class="admin-text-link" :href="document.fileUrl" target="_blank" rel="noreferrer">
                    Ver archivo
                  </a>
                </article>
              </div>
              <p v-else class="empty-state">
                Aun no hay documentos guardados para esta aeronave. Cuando subas archivos aqui se iran mostrando en esta biblioteca.
              </p>
            </div>

            <div v-else class="wizard-panel">
              <div class="section-head">
                <div>
                  <p class="eyebrow">Paso 5</p>
                  <h3>Resumen y envio</h3>
                </div>
              </div>

              <div class="wizard-review-grid">
                <article class="wizard-review-card">
                  <span class="mini-label">Aeronave</span>
                  <strong>{{ aircraftForm.name || 'Sin modelo' }}</strong>
                  <p class="muted">
                    {{ aircraftForm.registration || 'Sin matricula' }} ·
                    {{ aircraftForm.base || 'Sin base' }}
                  </p>
                </article>
                <article class="wizard-review-card">
                  <span class="mini-label">Operacion</span>
                  <strong
                    >{{ aircraftForm.capacity || 0 }} pax ·
                    {{ aircraftForm.speedKnots || 0 }} kt</strong
                  >
                  <p class="muted">
                    {{ formatCurrency(aircraftForm.hourlyPrice) }} · Min
                    {{ inferredAircraftMinimumHours }} hr
                  </p>
                </article>
                <article class="wizard-review-card">
                  <span class="mini-label">Galeria</span>
                  <strong>{{ countSelectedImageFiles() }} archivos listos</strong>
                  <p class="muted">
                    Principal, cabina, asientos y amenidades listas para sincronizar.
                  </p>
                </article>
                <article class="wizard-review-card">
                  <span class="mini-label">Expediente</span>
                  <strong>{{ documentForm.files.length ? `${documentForm.files.length} archivo(s) listos` : 'Sin nuevo documento' }}</strong>
                  <p class="muted">
                    {{ documentForm.type }} ·
                    
                  </p>
                </article>
              </div>

              <p v-if="formErrors.aircraft._form" class="form-feedback form-feedback-error">
                {{ formErrors.aircraft._form }}
              </p>
              <p v-if="formSuccess.aircraft" class="form-feedback form-feedback-success">
                {{ formSuccess.aircraft }}
              </p>
            </div>
          </div>

          <div class="wizard-footer">
            <button
              type="button"
              class="ghost-button"
              :disabled="aircraftWizardStep === 1 || aircraftWizardSubmitting"
              @click="previousAircraftWizardStep"
            >
              Anterior
            </button>
            <div class="wizard-footer-actions">
              <button
                v-if="aircraftWizardStep < aircraftWizardSteps.length"
                type="button"
                class="primary-action"
                :disabled="aircraftWizardSubmitting"
                @click="nextAircraftWizardStep"
              >
                Continuar
              </button>
              <button
                v-else
                type="button"
                class="primary-action"
                :disabled="aircraftWizardSubmitting"
                @click="aircraftWizardReadOnly ? closeAircraftWizard() : submitAircraftWizard()"
              >
                {{
                  aircraftWizardSubmitting
                    ? 'Guardando...'
                    : aircraftWizardReadOnly
                      ? 'Cerrar'
                    : editingAircraftId
                      ? 'Guardar cambios'
                      : 'Registrar aeronave'
                }}
              </button>
            </div>
          </div>
        </article>

        <div v-if="documentPreview.open" class="document-preview-overlay" @click.self="closeDocumentPreview">
          <article class="document-preview-modal">
            <div class="document-preview-head">
              <div>
                <span class="mini-label">{{ documentPreview.file?.typeLabel }}</span>
                <h3>{{ documentPreview.file?.name }}</h3>
              </div>
              <button type="button" class="ghost-button" @click="closeDocumentPreview">Cerrar</button>
            </div>

            <img
              v-if="documentPreview.file?.kind === 'image'"
              :src="documentPreview.url"
              :alt="documentPreview.file?.name"
              class="document-preview-full"
            />
            <iframe
              v-else
              :src="documentPreview.url"
              class="document-preview-frame"
              title="Vista previa PDF"
            ></iframe>
          </article>
        </div>
      </div>
    </section>

    <section v-else-if="section === 'costos'" class="page-grid">
      <article class="surface">
        <div class="section-head">
          <div>
            <p class="eyebrow">Costos base</p>
            <h2>Matriz operativa para capturar costos por aeronave</h2>
          </div>
          <span class="badge">Multiples aeronaves en una sola vista</span>
        </div>

        <p class="muted helper-copy">
          Cada fila representa una aeronave. Aqui capturas costos base y parametros operativos; Red Aviation conserva el control del precio final y los margenes.
        </p>

        <div v-if="aircraftPricingRows.length" class="table-shell pricing-table-shell">
          <div class="pricing-table-head">
            <span>Aeronave</span>
            <span>Precio/hr</span>
            <span>Min hrs</span>
            <span>Repo</span>
            <span>Pernocta</span>
            <span>Espera</span>
            <span>FBO</span>
            <span>Permisos</span>
            <span>Catering</span>
            <span>Accion</span>
          </div>

          <div v-for="row in aircraftPricingRows" :key="row.id" class="pricing-table-row">
            <div class="pricing-aircraft-cell">
              <strong>{{ row.name }}</strong>
              <span class="muted">Tarifa base y costos operativos</span>
            </div>
            <input
              :value="row.hourlyPrice"
              type="number"
              min="0"
              @input="updatePricing(row.id, 'hourlyPrice', $event.target.value)"
            />
            <input
              :value="row.minimumHours"
              type="number"
              min="0"
              step="0.1"
              @input="updatePricing(row.id, 'minimumHours', $event.target.value)"
            />
            <input
              :value="row.repositioningCost"
              type="number"
              min="0"
              @input="updatePricing(row.id, 'repositioningCost', $event.target.value)"
            />
            <input
              :value="row.overnightCost"
              type="number"
              min="0"
              @input="updatePricing(row.id, 'overnightCost', $event.target.value)"
            />
            <input
              :value="row.waitingCost"
              type="number"
              min="0"
              @input="updatePricing(row.id, 'waitingCost', $event.target.value)"
            />
            <input
              :value="row.fboCost"
              type="number"
              min="0"
              @input="updatePricing(row.id, 'fboCost', $event.target.value)"
            />
            <input
              :value="row.permitsCost"
              type="number"
              min="0"
              @input="updatePricing(row.id, 'permitsCost', $event.target.value)"
            />
            <input
              :value="row.cateringBaseCost"
              type="number"
              min="0"
              @input="updatePricing(row.id, 'cateringBaseCost', $event.target.value)"
            />
            <button
              type="button"
              class="primary-action pricing-save-button"
              @click="savePricing(row.id)"
            >
              Guardar
            </button>
          </div>
        </div>
        <p v-else class="empty-state">
          Todavia no hay aeronaves registradas para construir la matriz de cotizacion.
        </p>
      </article>
    </section>

    <section v-else-if="section === 'disponibilidad'" class="page-grid">
      <article class="surface availability-hero">
        <div>
          <p class="eyebrow">Control de disponibilidad</p>
          <h2>Centro de control operativo de flota</h2>
          <p class="muted">Gestiona disponibilidad y bloqueos operativos.</p>
        </div>
        <span class="status-pill" :data-tone="availabilityGlobalStatus.tone">{{
          availabilityGlobalStatus.title
        }}</span>
      </article>

      <div class="fleet-kpi-grid">
        <article
          v-for="card in availabilitySummaryCards"
          :key="card.label"
          class="fleet-kpi-card"
          :data-tone="card.tone"
        >
          <span>{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
          <p>{{ card.detail }}</p>
        </article>
      </div>

      <div class="fleet-layout">
        <div class="fleet-main-column">
          <article class="surface fleet-section-card">
            <div class="section-head">
              <div>
                <p class="eyebrow">Bloqueo operativo</p>
                <h2>Wizard compacto de disponibilidad</h2>
              </div>
            </div>

            <div class="company-progress-steps">
              <span
                v-for="step in availabilityFormSteps"
                :key="step.id"
                class="progress-chip"
                :data-tone="step.complete ? 'success' : 'neutral'"
              >
                {{ String(step.id).padStart(2, '0') }} · {{ step.label }}
              </span>
            </div>

            <div class="form-grid">
              <label class="span-2">
                <span>Aeronave</span>
                <select
                  v-model="availabilityForm.aircraftId"
                  :disabled="!aircraftOptions.length"
                  :class="{ 'input-error': formErrors.availability.aircraftId }"
                >
                  <option :value="null" disabled>Selecciona una aeronave</option>
                  <option v-for="item in aircraftOptions" :key="item.id" :value="item.id">
                    {{ item.label }}
                  </option>
                </select>
                <small v-if="formErrors.availability.aircraftId" class="field-error">{{
                  formErrors.availability.aircraftId
                }}</small>
              </label>
              <label>
                <span>Inicio</span>
                <input
                  v-model="availabilityForm.from"
                  type="datetime-local"
                  :class="{ 'input-error': formErrors.availability.from }"
                />
                <small v-if="formErrors.availability.from" class="field-error">{{
                  formErrors.availability.from
                }}</small>
              </label>
              <label>
                <span>Fin</span>
                <input
                  v-model="availabilityForm.to"
                  type="datetime-local"
                  :class="{ 'input-error': formErrors.availability.to }"
                />
                <small v-if="formErrors.availability.to" class="field-error">{{
                  formErrors.availability.to
                }}</small>
              </label>
              <label>
                <span>Estado operacional</span>
                <select
                  v-model="availabilityForm.status"
                  :class="{ 'input-error': formErrors.availability.status }"
                >
                  <option v-for="option in availabilityStatusOptions" :key="option" :value="option">
                    {{ getAvailabilityStatusMeta(option).label }}
                  </option>
                </select>
                <small v-if="formErrors.availability.status" class="field-error">{{
                  formErrors.availability.status
                }}</small>
              </label>
              <label>
                <span>Motivo</span>
                <input
                  v-model="availabilityForm.reason"
                  type="text"
                  :class="{ 'input-error': formErrors.availability.reason }"
                />
                <small v-if="formErrors.availability.reason" class="field-error">{{
                  formErrors.availability.reason
                }}</small>
              </label>
            </div>

            <p v-if="formErrors.availability._form" class="form-feedback form-feedback-error">
              {{ formErrors.availability._form }}
            </p>
            <p v-if="formSuccess.availability" class="form-feedback form-feedback-success">
              {{ formSuccess.availability }}
            </p>
            <p v-if="selectedAvailabilityAircraft" class="muted helper-copy">
              Trabajando sobre: {{ selectedAvailabilityAircraft.name }} ·
              {{ selectedAvailabilityAircraft.registration || 'Sin matricula' }} ·
              {{ selectedAvailabilityAircraft.base || 'Sin base' }}
            </p>
            <p v-else class="empty-state">
              Primero necesitas tener al menos una aeronave registrada para gestionar
              disponibilidad.
            </p>

            <div class="inline-actions">
              <button
                type="button"
                class="primary-action"
                :disabled="!selectedAvailabilityAircraft"
                @click="createAvailabilityBlock"
              >
                Guardar bloqueo
              </button>
            </div>
          </article>

          <article class="surface fleet-section-card">
            <div class="section-head">
              <div>
                <p class="eyebrow">Calendario semanal</p>
                <h2>Disponibilidad visual de la flota</h2>
              </div>
            </div>

            <div v-if="aircraft.length" class="availability-calendar-shell">
              <div class="availability-calendar-toolbar">
                <div>
                  <strong>{{ availabilityCalendarWindowLabel }}</strong>
                  <p class="muted">Haz click en una celda para precargar el bloqueo en el wizard.</p>
                </div>
                <div class="availability-calendar-actions">
                  <label class="availability-calendar-filter">
                    <span>Aeronave</span>
                    <select v-model="selectedAvailabilityCalendarAircraftId">
                      <option
                        v-for="option in availabilityCalendarAircraftOptions"
                        :key="option.id"
                        :value="option.id"
                      >
                        {{ option.label }}
                      </option>
                    </select>
                  </label>
                  <button type="button" class="ghost-button" @click="moveAvailabilityWeek(-1)">
                    Semana previa
                  </button>
                  <button type="button" class="ghost-button" @click="jumpAvailabilityWeekToToday()">
                    Hoy
                  </button>
                  <button type="button" class="ghost-button" @click="moveAvailabilityWeek(1)">
                    Siguiente
                  </button>
                </div>
              </div>

              <div class="availability-calendar-grid">
                <div class="availability-calendar-row availability-calendar-row--head">
                  <div class="availability-calendar-aircraft-head">Flota</div>
                  <div
                    v-for="day in availabilityCalendarWeekDays"
                    :key="day.key"
                    class="availability-calendar-day-head"
                    :class="{ 'is-today': day.isToday }"
                  >
                    <strong>{{ day.shortLabel }}</strong>
                    <span>{{ day.dayNumber }} {{ day.monthLabel }}</span>
                  </div>
                </div>

                <article
                  v-for="row in availabilityCalendarRows"
                  :key="row.plane.id"
                  class="availability-calendar-row availability-calendar-row--body"
                >
                  <div class="availability-calendar-aircraft">
                    <strong>{{ row.plane.name }}</strong>
                    <span class="muted">
                      {{ getAvailabilityOperationalStatus(row.plane).label }} ·
                      {{ row.plane.base || 'Sin base' }}
                    </span>
                  </div>
                  <button
                    v-for="cell in row.cells"
                    :key="cell.key"
                    type="button"
                    class="availability-calendar-cell"
                    :data-tone="cell.tone"
                    :class="{ 'is-available': cell.isAvailable }"
                    :title="`${cell.title} · ${cell.detail}`"
                    @click="selectAvailabilityCalendarCell(row.plane, cell)"
                  >
                    <strong>{{ cell.label }}</strong>
                    <span>{{ cell.detail }}</span>
                  </button>
                </article>
              </div>
            </div>
            <p v-else class="empty-state">
              Sin aeronaves registradas para construir el calendario.
            </p>
          </article>
        </div>

        <div class="fleet-side-column">
          <article class="surface fleet-section-card">
            <div class="section-head">
              <div>
                <p class="eyebrow">Agenda operacional</p>
                <h2>Bloqueos y ocupacion</h2>
              </div>
            </div>

            <div v-if="availability.length" class="availability-records">
              <article v-for="item in availability" :key="item.id" class="availability-record-card">
                <div class="card-top">
                  <div>
                    <strong>{{ item.aircraft }}</strong>
                    <p class="muted">{{ item.reason }}</p>
                  </div>
                  <span
                    class="status-pill"
                    :data-tone="getAvailabilityStatusMeta(item.status).tone"
                  >
                    {{ getAvailabilityStatusMeta(item.status).label }}
                  </span>
                </div>
                <div class="fleet-inline-metrics">
                  <span
                    >📍
                    {{
                      aircraft.find((plane) => plane.id === Number(item.aircraftId))?.base ||
                      'Base pendiente'
                    }}</span
                  >
                  <span>🕓 {{ formatDateTimeDisplay(item.from) }}</span>
                  <span>→ {{ formatDateTimeDisplay(item.to) }}</span>
                </div>
                <div class="inline-actions">
                  <button
                    type="button"
                    class="ghost-button availability-action"
                    @click="releaseAvailability(item.id)"
                  >
                    Liberar
                  </button>
                </div>
              </article>
            </div>
            <p v-else class="empty-state">
              No hay registros de disponibilidad guardados para esta flota.
            </p>
          </article>

          <article class="surface fleet-section-card">
            <div class="section-head">
              <div>
                <p class="eyebrow">Actividad operacional</p>
                <h2>Sistema vivo</h2>
              </div>
            </div>

            <div class="ops-timeline">
              <article
                v-for="entry in availabilityActivityFeed"
                :key="entry.id"
                class="ops-timeline-item"
              >
                <span class="ops-timeline-time">{{ entry.date }}</span>
                <div>
                  <strong>{{ entry.title }}</strong>
                  <p class="muted">{{ entry.detail }}</p>
                </div>
              </article>
              <p v-if="!availabilityActivityFeed.length" class="empty-state">
                La actividad operacional aparecera aqui conforme se registren bloqueos y vuelos.
              </p>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section v-else-if="section === 'solicitudes'" class="page-grid">
      <article class="surface requests-dispatch-surface">
        <div class="section-head">
          <div>
            <p class="eyebrow">Centro de despacho</p>
            <h2>Solicitudes operativas</h2>
            <p v-if="false" class="muted helper-copy">
              Escanea la cola, prioriza urgencias y acepta o rechaza solicitudes desde una sola bandeja.
            </p>
            <p class="muted helper-copy">{{ getRequestHelperCopy(selectedRequest) }}</p>
          </div>
          <div class="requests-head-actions">
            <button
              type="button"
              class="archive-toggle"
              :class="{ 'is-active': archivedTrayOpen }"
              @click="archivedTrayOpen = !archivedTrayOpen"
            >
              <span class="archive-toggle__icon" aria-hidden="true">🗂</span>
              <span class="archive-toggle__label">Archivadas</span>
              <strong>{{ archivedRequests.length }}</strong>
            </button>
            <span class="badge">Proveedor decide aqui: aceptar o rechazar</span>
          </div>
        </div>

        <div class="fleet-kpi-grid request-kpi-grid">
          <article
            v-for="card in requestKpis"
            :key="card.label"
            class="metric-card request-kpi-card"
            :data-tone="card.tone"
          >
            <span>{{ card.label }}</span>
            <strong>{{ card.value }}</strong>
            <small>{{ card.detail }}</small>
          </article>
        </div>

        <div class="requests-toolbar">
          <label class="request-search">
            <span>Buscar</span>
            <input
              v-model="requestSearch"
              type="search"
              placeholder="Ruta, codigo, cliente o aeronave"
            />
          </label>

          <div class="requests-tab-row">
            <button
              v-for="tab in requestStatusTabs"
              :key="tab.id"
              type="button"
              class="request-tab"
              :class="{ 'is-active': requestStatusFilter === tab.id }"
              @click="requestStatusFilter = tab.id"
            >
              <span>{{ tab.label }}</span>
              <strong>{{ tab.count }}</strong>
            </button>
          </div>

          <label class="request-priority-filter">
            <span>Prioridad</span>
            <select v-model="requestPriorityFilter">
              <option value="all">Todas</option>
              <option value="urgent">Urgente</option>
              <option value="high">Alta prioridad</option>
              <option value="normal">Programada</option>
              <option value="expired">SLA vencido</option>
            </select>
          </label>
        </div>

        <section v-if="archivedTrayOpen" class="archived-requests-panel">
          <div class="section-head compact-head">
            <div>
              <p class="eyebrow">Archivadas</p>
              <h3>Solicitudes rechazadas</h3>
            </div>
            <span class="badge">Solo lectura</span>
          </div>

          <div v-if="archivedRequests.length" class="archived-requests-list">
            <article
              v-for="request in archivedRequests"
              :key="`archived-${request.id}`"
              class="archived-request-card"
            >
              <div class="request-queue-top">
                <strong>Solicitud #{{ request.id }}</strong>
                <span class="status-pill status-pill--ghost" data-tone="neutral">Archivada</span>
              </div>
              <p class="request-queue-route">{{ getRequestRouteLabel(request) }}</p>
              <div class="request-queue-meta">
                <span>{{ request.passengers || 0 }} pax</span>
                <span>{{ formatDateTimeDisplay(request.date) }}</span>
              </div>
              <div class="request-queue-meta">
                <span class="package-chip" :data-tone="getRequestServiceTierTone(request)">
                  {{ getRequestServiceTierLabel(request) }}
                </span>
                <span>{{ getRequestQuoteLabel(request) }}</span>
                <span>Rechazada por proveedor</span>
              </div>
            </article>
          </div>

          <p v-else class="empty-state">No hay solicitudes archivadas por el momento.</p>
        </section>

        <div
          v-if="requests.length && (filteredRequests.length || !archivedTrayOpen)"
          class="requests-dispatch-layout"
        >
          <aside class="requests-queue">
            <article
              v-for="request in filteredRequests"
              :key="request.id"
              class="request-queue-card"
              :class="{ 'is-active': selectedRequest?.id === request.id }"
              @click="selectRequest(request.id)"
            >
              <div class="request-queue-top">
                <span class="status-pill" :data-tone="getRequestPriorityMeta(request).tone">
                  {{ getRequestPriorityMeta(request).label }}
                </span>
                <span
                  class="status-pill status-pill--ghost"
                  :data-tone="getRequestStatusMeta(request).tone"
                >
                  {{ getRequestStatusMeta(request).label }}
                </span>
              </div>

              <strong>Solicitud #{{ request.id }}</strong>
              <p class="request-queue-route">{{ getRequestRouteLabel(request) }}</p>

              <div class="request-queue-meta">
                <span>{{ request.passengers || 0 }} pax</span>
                <span>{{ formatDateTimeDisplay(request.date) }}</span>
              </div>

              <div class="request-queue-meta">
                <span class="package-chip" :data-tone="getRequestServiceTierTone(request)">
                  {{ getRequestServiceTierLabel(request) }}
                </span>
                <span>{{ getRequestQuoteLabel(request) }}</span>
                <span>{{ getRequestResponseCountdown(request).label }}</span>
              </div>
            </article>

            <p v-if="!filteredRequests.length" class="empty-state">
              No hay solicitudes activas que coincidan con los filtros actuales.
            </p>
          </aside>

          <article v-if="selectedRequest" class="request-detail-surface">
            <div class="request-detail-head">
              <div>
                <p class="eyebrow">Detalle operativo</p>
                <h3>{{ getRequestRouteLabel(selectedRequest) }}</h3>
                <p class="muted">
                  {{ getRequestClientLabel(selectedRequest) }} ·
                  {{ selectedRequest.passengers || 0 }} pax ·
                  {{ formatDateTimeDisplay(selectedRequest.date) }} ·
                  {{ getRequestServiceTierLabel(selectedRequest) }}
                </p>
              </div>

              <div class="request-detail-actions">
                <button
                  type="button"
                  class="ghost-button"
                  :disabled="
                    isRequestRejected(selectedRequest) ||
                    isRequestAccepted(selectedRequest) ||
                    isRequestPendingValidation(selectedRequest) ||
                    isUpdatingRequestStatus(selectedRequest.id)
                  "
                  @click="updateRequestStatus(selectedRequest.id, 'Rechazada')"
                >
                  <span
                    v-if="isUpdatingRequestStatus(selectedRequest.id, 'reject')"
                    class="button-spinner"
                    aria-hidden="true"
                  ></span>
                  {{ isUpdatingRequestStatus(selectedRequest.id, 'reject') ? 'Rechazando...' : 'Rechazar' }}
                </button>
                <button
                  type="button"
                  class="primary-action"
                  :disabled="
                    !canOperatorAcceptRequest(selectedRequest) ||
                    isRequestPendingValidation(selectedRequest) ||
                    isUpdatingRequestStatus(selectedRequest.id)
                  "
                  @click="updateRequestStatus(selectedRequest.id, 'Aceptada')"
                >
                  <span
                    v-if="isUpdatingRequestStatus(selectedRequest.id, 'accept')"
                    class="button-spinner"
                    aria-hidden="true"
                  ></span>
                  {{ isUpdatingRequestStatus(selectedRequest.id, 'accept') ? 'Guardando...' : getRequestPrimaryActionLabel(selectedRequest) }}
                </button>
              </div>
            </div>

            <p class="muted helper-copy">
              Esta es la zona del proveedor para responder la solicitud. Si aceptas, la operación
              se asigna; si rechazas, Red Aviation puede reintentar con otra opción sin exponer tu
              rechazo al cliente.
            </p>

            <div
              v-if="requestOperationalAlerts.length"
              class="dashboard-alert-strip request-alert-strip"
            >
              <article
                v-for="alert in requestOperationalAlerts"
                :key="alert.id"
                class="alert-chip"
                :data-tone="alert.tone"
              >
                <strong>{{ alert.text }}</strong>
              </article>
            </div>

            <div class="request-flow-strip">
              <article
                v-for="step in buildOperatorRequestFlowSteps(selectedRequest)"
                :key="step.id"
                class="request-flow-pill"
                :data-state="step.state"
              >
                <span class="request-flow-pill__index">{{ step.shortLabel }}</span>
                <strong>{{ step.title }}</strong>
              </article>
            </div>

            <div class="request-summary-grid">
              <article class="request-summary-card">
                <span class="mini-label">Estado</span>
                <strong>{{ getRequestStatusMeta(selectedRequest).headline }}</strong>
                <p class="muted">{{ getRequestStatusCopy(selectedRequest) }}</p>
              </article>
              <article class="request-summary-card">
                <span class="mini-label">Etapa compartida</span>
                <strong>{{ normalizeWorkflowLabel(resolveRequestWorkflowValue(selectedRequest)) }}</strong>
                <p class="muted">La misma etapa que consumen cliente y admin.</p>
              </article>
              <article class="request-summary-card">
                <span class="mini-label">Paquete / servicio</span>
                <strong>{{ getRequestServiceTierLabel(selectedRequest) }}</strong>
                <p class="muted">{{ getRequestTripTypeLabel(selectedRequest) }}</p>
              </article>
              <article class="request-summary-card">
                <span class="mini-label">SLA</span>
                <strong>{{ getRequestResponseCountdown(selectedRequest).label }}</strong>
                <p class="muted">{{ formatDateTimeDisplay(selectedRequest.responseLimit) }}</p>
              </article>
              <article class="request-summary-card">
                <span class="mini-label">Aeronave sugerida</span>
                <strong>{{ selectedRequestAircraftComparison.label }}</strong>
                <p class="muted">{{ selectedRequestAircraftComparison.detail }}</p>
              </article>
            </div>
          </article>
        </div>

        <p v-if="!requests.length" class="empty-state">
          No hay solicitudes operativas disponibles para este proveedor.
        </p>
      </article>
    </section>

    <section v-else-if="section === 'operaciones'" class="page-grid">
      <article class="surface">
        <div class="section-head">
          <div>
            <p class="eyebrow">Operaciones</p>
            <h2>Seguimiento de vuelos confirmados</h2>
          </div>
        </div>

        <div class="list-grid">
          <article v-for="operation in operations" :key="operation.id" class="list-card">
            <div class="card-top">
              <div>
                <strong>Operacion #{{ operation.id }} · {{ operation.route }}</strong>
                <p class="muted">
                  {{ operation.aircraft }} - {{ operation.departure }} -> {{ operation.arrival }}
                </p>
              </div>
              <span class="badge">{{ operation.status }}</span>
            </div>

            <p class="muted">Tripulacion: {{ operation.crew }}</p>
            <p class="muted">Estado crew: {{ operation.crewStatusLabel }}</p>
            <p v-if="operation.crewConfirmedAt" class="muted">
              Confirmado: {{ operation.crewConfirmedAt }}
            </p>
            <p v-if="operation.crewCheckinAt" class="muted">
              Check-in: {{ operation.crewCheckinAt }}
            </p>
            <p v-if="operation.crewServiceStartedAt" class="muted">
              Servicio iniciado: {{ operation.crewServiceStartedAt }}
            </p>
            <p v-if="operation.crewServiceCompletedAt" class="muted">
              Servicio completado: {{ operation.crewServiceCompletedAt }}
            </p>
            <p v-if="operation.crewDeclineReason" class="muted">
              Motivo rechazo: {{ operation.crewDeclineReason }}
            </p>
            <p class="muted">{{ operation.crewNotes || operation.notes }}</p>

            <div class="form-grid compact">
              <label>
                <span>Sobrecargo</span>
                <select v-model="getOperationCrewDraft(operation.id).crewId">
                  <option value="">Selecciona</option>
                  <option
                    v-for="member in assignableCrewOptions"
                    :key="member.id"
                    :value="member.id"
                  >
                    {{ member.name }} · {{ member.base }}
                  </option>
                </select>
              </label>
              <label>
                <span>Nota de asignacion</span>
                <input
                  v-model="getOperationCrewDraft(operation.id).note"
                  type="text"
                  placeholder="VIP, base, briefing..."
                />
              </label>
            </div>

            <div class="chips">
              <button
                v-for="status in operationStatusOptions"
                :key="status"
                type="button"
                class="chip-button"
                @click="updateOperationStatus(operation.id, status)"
              >
                {{ status }}
              </button>
              <button
                type="button"
                class="primary-action"
                @click="assignCrewToOperation(operation.id)"
              >
                Asignar sobrecargo
              </button>
            </div>
          </article>
        </div>
      </article>
    </section>

    <section v-else-if="section === 'tripulacion'" class="page-grid">
      <OperatorCrewSection
        :crew-form="crewForm"
        :crew-errors="formErrors.crew"
        :tripulation="crew"
        :crew-roles="crewRoleOptions"
        :crew-states="crewStateOptions"
        :crew-bases="crewBases"
        :aircraft-options="aircraftOptions"
        :editing-crew-id="editingCrewId"
        :loading="loading"
        :backend-status="crewBackendStatus"
        :last-sync-label="crewLastSyncLabel"
        :saving-crew="savingCrew"
        @update-field="updateCrewField"
        @activate="activateCrewMember"
        @assign-flight="assignCrewMemberToFlight"
        @create="createOrUpdateCrew"
        @mark-availability="markCrewAvailability"
        @select-person="populateCrewForm"
        @suspend="suspendCrewMember"
        @reset-form="resetCrewForm"
        @view-documents="viewCrewDocuments"
        @view-history="viewCrewHistory"
      />

      <p v-if="formSuccess.crew" class="form-feedback form-feedback-success">
        {{ formSuccess.crew }}
      </p>

      <article class="surface">
        <div class="section-head">
          <div>
            <p class="eyebrow">Control</p>
            <h2>Politica operacional</h2>
          </div>
        </div>

        <div class="request-detail-grid">
          <div class="status-list">
            <div class="status-row">
              <span>Horas maximas vuelo</span>
              <strong>Segun rol, fatiga y operacion vigente</strong>
            </div>
            <div class="status-row">
              <span>Descanso obligatorio</span>
              <strong>Bloquear antes de reasignar tripulacion</strong>
            </div>
            <div class="status-row">
              <span>Certificaciones requeridas</span>
              <strong>Licencia, medico, visa, pasaporte y habilitacion</strong>
            </div>
            <div class="status-row">
              <span>Reglas FAA / DGAC</span>
              <strong>Aplican segun ruta y operador</strong>
            </div>
          </div>

          <div class="status-list">
            <div class="status-row">
              <span>Modo de aprobacion</span>
              <strong>{{
                settings.crewApprovalMode === 'suggest_only'
                  ? 'Proveedor sugiere / Admin confirma'
                  : 'Proveedor confirma'
              }}</strong>
            </div>
            <div class="status-row">
              <span>Ultima sincronizacion</span>
              <strong>{{ crewLastSyncLabel }}</strong>
            </div>
            <div class="status-row">
              <span>Backend status</span>
              <strong>{{ crewBackendStatus }}</strong>
            </div>
            <div class="status-row">
              <span>Usuarios conectados</span>
              <strong>{{ crewConnectedUsers }} operativo(s)</strong>
            </div>
          </div>
        </div>

        <div class="status-list">
          <div class="status-row">
            <span>Funcion del proveedor</span>
            <strong>Asignar piloto, copiloto y sobrecargo segun disponibilidad</strong>
          </div>
          <div class="status-row">
            <span>Equipo registrado</span>
            <strong>{{ crew.length }} tripulante(s) sincronizados</strong>
          </div>
        </div>
      </article>
    </section>

    <section v-else-if="section === 'incidencias'" class="page-grid two-columns">
      <article class="surface">
        <div class="section-head">
          <div>
            <p class="eyebrow">Incidencias</p>
            <h2>Registrar nueva incidencia</h2>
          </div>
        </div>

        <div class="form-grid">
          <label>
            <span>Solicitud</span>
            <select
              v-model="incidentForm.requestId"
              :class="{ 'input-error': formErrors.incident.requestId }"
            >
              <option :value="null">Sin solicitud ligada</option>
              <option v-for="request in requests" :key="request.id" :value="request.id">
                #{{ request.id }} - {{ request.client }}
              </option>
            </select>
            <small v-if="formErrors.incident.requestId" class="field-error">{{
              formErrors.incident.requestId
            }}</small>
          </label>
          <label>
            <span>Tipo</span>
            <select
              v-model="incidentForm.type"
              :class="{ 'input-error': formErrors.incident.type }"
            >
              <option v-for="type in incidentTypeOptions" :key="type" :value="type">
                {{ type }}
              </option>
            </select>
            <small v-if="formErrors.incident.type" class="field-error">{{
              formErrors.incident.type
            }}</small>
          </label>
          <label>
            <span>Estado</span>
            <select
              v-model="incidentForm.status"
              :class="{ 'input-error': formErrors.incident.status }"
            >
              <option v-for="status in incidentStatusOptions" :key="status" :value="status">
                {{ status }}
              </option>
            </select>
            <small v-if="formErrors.incident.status" class="field-error">{{
              formErrors.incident.status
            }}</small>
          </label>
          <label>
            <span>Vuelo</span>
            <input
              v-model="incidentForm.flight"
              type="text"
              :class="{ 'input-error': formErrors.incident.flight }"
            />
            <small v-if="formErrors.incident.flight" class="field-error">{{
              formErrors.incident.flight
            }}</small>
          </label>
          <label>
            <span>Prioridad</span>
            <input
              v-model="incidentForm.priority"
              type="text"
              :class="{ 'input-error': formErrors.incident.priority }"
            />
            <small v-if="formErrors.incident.priority" class="field-error">{{
              formErrors.incident.priority
            }}</small>
          </label>
          <label>
            <span>Responsable</span>
            <input
              v-model="incidentForm.responsible"
              type="text"
              placeholder="Coordinacion, mantenimiento..."
              :class="{ 'input-error': formErrors.incident.responsible }"
            />
            <small v-if="formErrors.incident.responsible" class="field-error">{{
              formErrors.incident.responsible
            }}</small>
          </label>
          <label>
            <span>Evidencia</span>
            <input
              v-model="incidentForm.evidence"
              type="text"
              :class="{ 'input-error': formErrors.incident.evidence }"
            />
            <small v-if="formErrors.incident.evidence" class="field-error">{{
              formErrors.incident.evidence
            }}</small>
          </label>
          <label class="span-2">
            <span>Comentario</span>
            <textarea
              v-model="incidentForm.comment"
              rows="4"
              :class="{ 'input-error': formErrors.incident.comment }"
            ></textarea>
            <small v-if="formErrors.incident.comment" class="field-error">{{
              formErrors.incident.comment
            }}</small>
          </label>
          <label class="span-2">
            <span>Accion tomada</span>
            <textarea
              v-model="incidentForm.actionTaken"
              rows="3"
              :class="{ 'input-error': formErrors.incident.actionTaken }"
            ></textarea>
            <small v-if="formErrors.incident.actionTaken" class="field-error">{{
              formErrors.incident.actionTaken
            }}</small>
          </label>
        </div>

        <p v-if="formErrors.incident._form" class="form-feedback form-feedback-error">
          {{ formErrors.incident._form }}
        </p>
        <p v-if="formSuccess.incident" class="form-feedback form-feedback-success">
          {{ formSuccess.incident }}
        </p>
        <div class="inline-actions">
          <button type="button" class="primary-action" @click="createIncident">
            Crear incidencia
          </button>
        </div>
      </article>

      <article class="surface">
        <div class="section-head">
          <div>
            <p class="eyebrow">Seguimiento</p>
            <h2>Incidencias abiertas</h2>
          </div>
        </div>

        <div class="list-grid">
          <article v-for="incident in incidents" :key="incident.id" class="list-card">
            <div class="card-top">
              <div>
                <strong>{{ incident.type }} - {{ incident.flight }}</strong>
                <p class="muted">{{ incident.comment }}</p>
              </div>
              <span class="badge">{{ incident.status }}</span>
            </div>
            <div class="fleet-summary">
              <span class="badge">{{ mapIncidentTone(incident.priority) }}</span>
              <span class="badge">Responsable: {{ incident.responsible }}</span>
              <span class="badge">Solicitud: {{ incident.requestId || 'N/D' }}</span>
            </div>
            <p class="muted">
              Prioridad: {{ incident.priority }} - Evidencia: {{ incident.evidence }} - Alta:
              {{ formatDateTimeRange(incident.createdAt) }}
            </p>
            <div class="inline-actions">
              <button
                type="button"
                class="ghost-button"
                :disabled="isIncidentResolved(incident.status)"
                @click="updateIncidentStatus(incident.id, 'Resuelta')"
              >
                Resolver
              </button>
              <button
                type="button"
                class="ghost-button"
                :disabled="incident.status === 'Cerrada'"
                @click="updateIncidentStatus(incident.id, 'Cerrada')"
              >
                Cerrar
              </button>
            </div>
          </article>
        </div>
      </article>
    </section>

    <section v-else-if="section === 'pagos'" class="page-grid">
      <article class="surface">
        <div class="section-head">
          <div>
            <p class="eyebrow">Pagos / liquidaciones</p>
            <h2>Vuelos completados por pagar</h2>
          </div>
          <span class="badge">El proveedor no cobra directo al cliente</span>
        </div>

        <div class="list-grid">
          <article v-for="payment in payments" :key="payment.id" class="list-card">
            <div class="card-top">
              <div>
                <strong>{{ payment.flight }}</strong>
                <p class="muted">{{ payment.completedAt }} - {{ payment.amount }}</p>
              </div>
              <span class="badge">{{ payment.status }}</span>
            </div>

            <p class="muted">Comprobante: {{ payment.receipt }}</p>
            <div class="inline-actions">
              <span class="badge">Solo lectura</span>
            </div>
          </article>
        </div>
      </article>
    </section>

    <section v-else-if="section === 'historial'" class="page-grid">
      <article class="surface">
        <div class="section-head">
          <div>
            <p class="eyebrow">Historial</p>
            <h2>Vista solo lectura</h2>
          </div>
          <span class="badge">No editable</span>
        </div>

        <div class="timeline">
          <article v-for="entry in history" :key="entry.id" class="timeline-item">
            <strong>{{ entry.action }}</strong>
            <p class="muted">{{ entry.date }} - {{ entry.module }} - {{ entry.actor }}</p>
          </article>
        </div>
      </article>
    </section>

    <section v-else class="page-grid two-columns">
      <article class="surface">
        <div class="section-head">
          <div>
            <p class="eyebrow">Configuracion</p>
            <h2>Preferencias del portal</h2>
          </div>
        </div>

        <div class="toggle-list">
          <label class="toggle-row">
            <span>Notificaciones por email</span>
            <input v-model="settings.emailNotifications" type="checkbox" />
          </label>
          <label class="toggle-row">
            <span>Alertas de pagos</span>
            <input v-model="settings.paymentAlerts" type="checkbox" />
          </label>
          <label class="toggle-row">
            <span>Alertas operativas</span>
            <input v-model="settings.opsAlerts" type="checkbox" />
          </label>
          <label class="toggle-row">
            <span>Modo de tripulacion</span>
            <select
              v-model="settings.crewApprovalMode"
              :class="{ 'input-error': formErrors.settings.crewApprovalMode }"
            >
              <option value="suggest_only">Proveedor sugiere / Admin confirma</option>
              <option value="provider_confirms">Proveedor confirma directo</option>
            </select>
          </label>
        </div>

        <p v-if="formErrors.settings._form" class="form-feedback form-feedback-error">
          {{ formErrors.settings._form }}
        </p>
        <p v-if="formSuccess.settings" class="form-feedback form-feedback-success">
          {{ formSuccess.settings }}
        </p>
        <div class="inline-actions">
          <button type="button" class="primary-action" @click="saveSettings">
            Guardar configuracion
          </button>
        </div>
      </article>

      <article class="surface">
        <div class="section-head">
          <div>
            <p class="eyebrow">Alcance del rol</p>
            <h2>Lo que si y no hace el proveedor</h2>
          </div>
        </div>

        <div class="status-list">
          <div class="status-row">
            <span>Si hace</span>
            <strong>
              Publica aeronaves, mantiene disponibilidad, captura costos base y responde solicitudes
            </strong>
          </div>
          <div class="status-row">
            <span>No hace</span>
            <strong>
              No define precio final, no habla directo con cliente y no controla reglas comerciales
            </strong>
          </div>
        </div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.operator-portal-page {
  display: grid;
  gap: 1rem;
  padding: 1rem;
  background: linear-gradient(180deg, #f6f0e5 0%, #fffdfa 18%, #ffffff 100%);
  color: #111111;
}

.surface {
  border: 1px solid #eadfcb;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 18px 44px rgba(80, 56, 22, 0.08);
}

.hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.4rem;
  background:
    radial-gradient(circle at top right, rgba(213, 174, 88, 0.28), transparent 28%),
    linear-gradient(135deg, #fff7ea 0%, #ffffff 55%);
}

.hero h1,
.section-head h2 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.04em;
}

.eyebrow {
  margin: 0 0 0.35rem;
  color: #9b6d16;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.muted {
  color: #6d665c;
}

.helper-copy {
  margin: 0.9rem 0 0;
}

.compact-copy {
  margin: 0;
}

.company-shell,
.company-status-shell {
  display: grid;
  gap: 1.1rem;
}

.company-progress-card,
.company-form-section,
.company-verification-card,
.company-alert,
.company-summary-row {
  border: 1px solid #efe2ca;
  border-radius: 20px;
  background: #fffdfa;
}

.company-progress-card,
.company-verification-card {
  padding: 1rem 1.1rem;
}

.company-progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.progress-bar {
  margin-top: 0.85rem;
  height: 0.72rem;
  overflow: hidden;
  border-radius: 999px;
  background: #eee4d2;
}

.progress-bar-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #111111 0%, #c8a96b 100%);
}

.company-progress-steps,
.company-checklist,
.company-alert-stack,
.company-form-sections {
  display: grid;
  gap: 0.75rem;
}

.company-progress-steps {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 0.95rem;
}

.progress-chip {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0 0.8rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 700;
  background: #f4ecde;
  color: #6f5a30;
}

.progress-chip[data-tone='success'] {
  background: rgba(46, 139, 87, 0.14);
  color: #1d6b42;
}

.progress-chip[data-tone='warning'] {
  background: rgba(200, 169, 107, 0.2);
  color: #916c1f;
}

.progress-chip[data-tone='danger'] {
  background: rgba(184, 61, 54, 0.15);
  color: #9f2f28;
}

.progress-chip[data-tone='neutral'] {
  background: #f4ecde;
  color: #6f5a30;
}

.company-form-section {
  padding: 1rem 1.1rem;
}

.upload-dropzone {
  position: relative;
  display: grid;
  gap: 0.35rem;
  padding: 1.25rem;
  border: 1px dashed #cdb58a;
  border-radius: 20px;
  background: linear-gradient(180deg, #fffdf8 0%, #faf5eb 100%);
  text-align: center;
  cursor: pointer;
}

.upload-dropzone-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.upload-dropzone strong {
  font-size: 1rem;
}

.upload-dropzone span,
.upload-dropzone small {
  color: #6d665c;
}

.company-verification-card h3 {
  margin: 0.35rem 0 0;
}

.company-verification-card p {
  margin: 0.65rem 0 0;
}

.company-summary-grid {
  display: grid;
  gap: 0.75rem;
}

.company-summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.95rem 1rem;
}

.company-summary-row span {
  color: #75684e;
}

.company-alert {
  padding: 0.95rem 1rem;
}

.company-alert[data-tone='success'] {
  border-color: rgba(46, 139, 87, 0.18);
  background: #edfdf3;
}

.company-alert[data-tone='warning'] {
  border-color: rgba(200, 169, 107, 0.22);
  background: #fff7e8;
}

.company-alert[data-tone='info'] {
  border-color: rgba(28, 92, 164, 0.16);
  background: #eef5ff;
}

.company-document-list {
  margin-top: 0;
}

.dashboard-hero-premium {
  display: grid;
  gap: 1rem;
}

.dashboard-alert-strip,
.dashboard-quick-actions,
.dashboard-layout,
.dashboard-checklist {
  display: grid;
  gap: 1rem;
}

.dashboard-quick-actions {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.quick-action-card,
.checklist-card {
  display: grid;
  gap: 0.35rem;
  padding: 1rem;
  border: 1px solid #efe2ca;
  border-radius: 20px;
  background: #fffdfa;
  text-align: left;
}

.quick-action-card span {
  font-size: 1.1rem;
}

.quick-action-card small,
.checklist-card p,
.dashboard-metric-card small {
  color: #6d665c;
  line-height: 1.5;
}

.dashboard-layout {
  grid-template-columns: minmax(0, 1.6fr) minmax(320px, 0.9fr);
  align-items: start;
}

.dashboard-main-column,
.dashboard-side-column {
  display: grid;
  gap: 1rem;
}

.dashboard-metric-grid {
  margin-top: 1rem;
}

.dashboard-metric-card {
  display: grid;
  gap: 0.35rem;
}

.dashboard-metric-card span {
  font-size: 0.82rem;
}

.metric-status {
  margin: 0;
  color: #111111;
  font-weight: 700;
}

.ghost-link-button {
  border: 0;
  padding: 0;
  background: transparent;
  color: #111111;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.dashboard-checklist {
  margin-top: 1rem;
}

.checklist-card {
  grid-template-columns: 1fr auto;
  align-items: center;
}

.checklist-card[data-tone='complete'] {
  border-color: rgba(46, 139, 87, 0.2);
  background: #edfdf3;
}

.checklist-card[data-tone='warning'] {
  border-color: rgba(200, 169, 107, 0.24);
  background: #fff7e8;
}

.checklist-card[data-tone='pending'] {
  border-color: #efe2ca;
  background: #fffdfa;
}

.checklist-card[data-tone='neutral'] {
  border-color: rgba(28, 92, 164, 0.16);
  background: #eef5ff;
}

.checklist-card span {
  color: #8f6919;
  font-size: 0.82rem;
  font-weight: 800;
  text-transform: uppercase;
}

.empty-state {
  margin: 1rem 0 0;
  color: #6d665c;
}

.empty-state--actionable {
  display: grid;
  gap: 0.85rem;
}

.empty-state--actionable p {
  margin: 0;
}

.archive-inline-button {
  justify-self: start;
}

.field-error {
  color: #b42318;
  font-size: 0.82rem;
}

.form-feedback {
  margin: 1rem 0 0;
  padding: 0.85rem 1rem;
  border-radius: 14px;
  font-size: 0.92rem;
}

.form-feedback-error {
  border: 1px solid rgba(180, 35, 24, 0.22);
  background: #fff3f2;
  color: #912018;
}

.form-feedback-success {
  border: 1px solid rgba(18, 122, 67, 0.22);
  background: #edfdf3;
  color: #0f6b3b;
}

.nested-surface {
  margin-top: 1rem;
  padding: 1rem;
  border: 1px solid #efe2ca;
  border-radius: 18px;
  background: #fffdfa;
}

.compact-head h3 {
  margin: 0;
}

.inline-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0.85rem 0 0;
}

.mini-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.38rem 0.65rem;
  border-radius: 999px;
  background: #f4ecde;
  color: #6f5a30;
  font-size: 0.82rem;
  font-weight: 700;
}

.stored-images-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
  margin: 1rem 0 0;
}

.stored-image-card {
  display: grid;
  gap: 0.45rem;
  padding: 0.85rem;
  border: 1px solid #efe2ca;
  border-radius: 16px;
  background: #fff;
}

.stored-image-card span,
.stored-image-card small {
  color: #6f5a30;
}

.stored-image-preview {
  width: 100%;
  height: 9rem;
  object-fit: cover;
  border-radius: 12px;
  background: #f7f2e8;
}

.stored-documents-list {
  display: grid;
  gap: 0.75rem;
  margin: 1rem 0 0;
}

.document-library-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-top: 1.25rem;
}

.document-type-grid,
.document-preview-grid {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: 1rem;
}

.document-type-card,
.document-preview-card {
  cursor: zoom-in;
  transition:
    border-color 0.16s ease,
    transform 0.16s ease,
    box-shadow 0.16s ease;
}

.document-preview-card:hover,
.document-preview-card:focus-visible {
  border-color: rgba(200, 169, 107, 0.7);
  box-shadow: 0 16px 34px rgba(47, 39, 21, 0.1);
  transform: translateY(-1px);
  outline: none;
}

.document-preview-card {
  display: grid;
  gap: 0.4rem;
  padding: 0.95rem;
  border: 1px solid #efe2ca;
  border-radius: 16px;
  background: #fffdfa;
  text-align: left;
}

.document-type-card.active {
  border-color: rgba(200, 169, 107, 0.72);
  background: linear-gradient(180deg, #fff7e5 0%, #fffdfa 100%);
  box-shadow: inset 0 0 0 1px rgba(200, 169, 107, 0.18);
}

.document-type-card span,
.document-type-card small,
.document-preview-card span {
  color: #6d665c;
  line-height: 1.45;
}

.document-upload-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}

.document-dropzone {
  position: relative;
  grid-column: 1 / -1;
  display: grid;
  place-items: center;
  gap: 0.35rem;
  min-height: 9rem;
  padding: 1.2rem;
  border: 1.5px dashed #c8a96b;
  border-radius: 18px;
  background: #fffaf0;
  text-align: center;
}

.document-dropzone.active {
  background: #f7edd8;
  border-color: #8f6919;
}

.document-dropzone input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.document-dropzone span,
.document-dropzone small {
  color: #6d665c;
}

.document-preview-card img,
.pdf-preview {
  width: 100%;
  height: 8rem;
  border-radius: 12px;
  background: #f4ecde;
  object-fit: cover;
}

.pdf-preview {
  display: grid;
  place-items: center;
  color: #8f6919;
  font-weight: 900;
}

.admin-text-link {
  color: #8f6919;
  font-weight: 800;
  text-decoration: none;
}

.document-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 2300;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(10, 13, 18, 0.62);
  backdrop-filter: blur(10px);
}

.document-preview-modal {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 1rem;
  width: min(100%, 980px);
  height: min(90vh, 780px);
  padding: 1rem;
  border: 1px solid #efe2ca;
  border-radius: 22px;
  background: #fffdfa;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.28);
}

.document-preview-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.document-preview-head h3 {
  margin: 0.2rem 0 0;
  overflow-wrap: anywhere;
}

.document-preview-full,
.document-preview-frame {
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 0;
  border-radius: 16px;
  background: #f4ecde;
}

.document-preview-full {
  object-fit: contain;
}

.fleet-hero,
.fleet-section-card {
  padding: 1.35rem;
}

.fleet-kpi-grid,
.fleet-layout,
.fleet-premium-grid,
.wizard-stepper,
.wizard-review-grid {
  display: grid;
  gap: 1rem;
}

.fleet-kpi-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.fleet-kpi-card {
  padding: 1.1rem 1.15rem;
  border: 1px solid #efe2ca;
  border-radius: 20px;
  background: linear-gradient(180deg, #fffdf8 0%, #ffffff 100%);
}

.fleet-kpi-card span,
.mini-label,
.ops-timeline-time {
  color: #7a6b53;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.fleet-kpi-card strong {
  display: block;
  margin-top: 0.45rem;
  font-size: 2rem;
  line-height: 1;
}

.fleet-kpi-card p {
  margin: 0.55rem 0 0;
  color: #6d665c;
}

.fleet-layout {
  grid-template-columns: minmax(0, 1.7fr) minmax(320px, 0.9fr);
  align-items: start;
}

.fleet-main-column,
.fleet-side-column {
  display: grid;
  gap: 1rem;
}

.fleet-premium-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 1rem;
}

.fleet-premium-card {
  overflow: hidden;
  border: 1px solid #efe2ca;
  border-radius: 24px;
  background: #fffdfa;
}

.fleet-visual {
  position: relative;
  display: grid;
  align-content: space-between;
  min-height: 17rem;
  padding: 1rem;
  background:
    linear-gradient(180deg, rgba(8, 11, 18, 0.05) 0%, rgba(8, 11, 18, 0.72) 100%),
    linear-gradient(135deg, #f6efe2 0%, #d9c8aa 100%);
  background-size: cover;
  background-position: center;
}

.fleet-visual-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
}

.fleet-visual-top,
.fleet-inline-metrics,
.weekly-dots,
.wizard-footer,
.wizard-footer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0 0.8rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 800;
}

.status-pill[data-tone='success'] {
  background: rgba(46, 139, 87, 0.14);
  color: #1d6b42;
}

.status-pill[data-tone='info'] {
  background: rgba(28, 92, 164, 0.16);
  color: #184f8d;
}

.status-pill[data-tone='warning'] {
  background: rgba(200, 169, 107, 0.2);
  color: #916c1f;
}

.status-pill[data-tone='danger'] {
  background: rgba(184, 61, 54, 0.15);
  color: #9f2f28;
}

.status-pill--ghost {
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff;
  backdrop-filter: blur(8px);
}

.fleet-visual-copy {
  position: relative;
  z-index: 1;
  color: #ffffff;
}

.fleet-visual-top {
  position: relative;
  z-index: 1;
}

.fleet-visual-copy strong {
  display: block;
  font-size: 1.55rem;
}

.fleet-visual-copy p {
  margin: 0.3rem 0 0.75rem;
  color: rgba(255, 255, 255, 0.8);
}

.fleet-inline-metrics span,
.weekly-dot {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0 0.72rem;
  border-radius: 999px;
  background: #f4ecde;
  color: #6f5a30;
  font-size: 0.82rem;
  font-weight: 700;
}

.fleet-card-body {
  display: grid;
  gap: 1rem;
  padding: 1rem;
}

.fleet-card-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  align-items: start;
}

.weekly-strip {
  display: grid;
  gap: 0.55rem;
}

.weekly-dot {
  justify-content: center;
  min-width: 2rem;
  padding: 0;
}

.weekly-dot[data-tone='success'] {
  background: rgba(46, 139, 87, 0.14);
  color: #1d6b42;
}

.weekly-dot[data-tone='warning'] {
  background: rgba(200, 169, 107, 0.2);
  color: #916c1f;
}

.weekly-dot[data-tone='danger'] {
  background: rgba(184, 61, 54, 0.15);
  color: #9f2f28;
}

.ops-timeline {
  display: grid;
  gap: 0.9rem;
  margin-top: 1rem;
}

.ops-timeline-item {
  display: grid;
  grid-template-columns: 6.5rem 1fr;
  gap: 0.9rem;
  padding-bottom: 0.9rem;
  border-bottom: 1px solid #efe2ca;
}

.ops-timeline-item:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.priority-item--static {
  cursor: default;
}

.gold-button {
  border-color: rgba(200, 169, 107, 0.4);
  color: #8f6919;
  background: rgba(240, 199, 92, 0.12);
}

.danger-button {
  border-color: rgba(185, 28, 28, 0.28);
  color: #991b1b;
  background: rgba(254, 226, 226, 0.52);
}

.wizard-overlay {
  position: fixed;
  inset: 0;
  z-index: 2200;
  display: grid;
  place-items: center;
  padding: 1.2rem;
  background: rgba(10, 13, 18, 0.48);
  backdrop-filter: blur(10px);
}

.wizard-modal {
  width: min(1200px, 100%);
  max-height: calc(100vh - 2.4rem);
  overflow: auto;
  padding: 1.35rem;
}

.wizard-sticky-head {
  position: sticky;
  top: -1.35rem;
  z-index: 5;
  margin: -1.35rem -1.35rem 0;
  padding: 1.35rem 1.35rem 1rem;
  border-bottom: 1px solid rgba(239, 226, 202, 0.72);
  background: rgba(255, 253, 250, 0.96);
  backdrop-filter: blur(10px);
}

.wizard-header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.wizard-stepper {
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin-top: 1rem;
}

.wizard-step {
  display: grid;
  gap: 0.35rem;
  padding: 1rem;
  border: 1px solid #efe2ca;
  border-radius: 18px;
  background: #fffdfa;
  text-align: left;
}

.wizard-step.active {
  border-color: rgba(200, 169, 107, 0.65);
  background: linear-gradient(180deg, #fffaf0 0%, #fffdfa 100%);
}

.wizard-step.complete {
  background: #f6f1e7;
}

.wizard-step span {
  color: #8f6919;
  font-size: 0.8rem;
  font-weight: 800;
}

.wizard-step small {
  color: #6d665c;
  line-height: 1.5;
}

.wizard-body {
  margin-top: 1rem;
}

.wizard-panel {
  padding: 1.2rem;
  border: 1px solid #efe2ca;
  border-radius: 24px;
  background: #fffdfa;
}

.wizard-review-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 1rem;
}

.wizard-review-card {
  padding: 1rem;
  border: 1px solid #efe2ca;
  border-radius: 18px;
  background: #ffffff;
}

.wizard-review-card strong {
  display: block;
  margin-top: 0.4rem;
}

.wizard-review-card p {
  margin: 0.35rem 0 0;
}

.wizard-footer {
  justify-content: space-between;
  align-items: center;
  margin-top: 1rem;
}

.availability-hero,
.availability-heatmap,
.availability-records {
  display: grid;
  gap: 1rem;
}

.availability-calendar-shell {
  display: grid;
  gap: 1rem;
}

.availability-calendar-toolbar,
.availability-calendar-actions,
.availability-calendar-row,
.availability-calendar-aircraft,
.availability-calendar-day-head,
.availability-calendar-cell,
.availability-calendar-filter {
  display: flex;
}

.availability-calendar-toolbar,
.availability-calendar-actions {
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.availability-calendar-filter {
  flex-direction: column;
  gap: 0.35rem;
  min-width: 16rem;
}

.availability-calendar-filter span {
  color: #6f6250;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.availability-calendar-grid {
  display: grid;
  gap: 0.7rem;
}

.availability-calendar-row {
  gap: 0.7rem;
}

.availability-calendar-row--head,
.availability-calendar-row--body {
  display: grid;
  grid-template-columns: minmax(14rem, 1.1fr) repeat(7, minmax(7.5rem, 1fr));
  align-items: stretch;
}

.availability-calendar-aircraft-head,
.availability-calendar-day-head,
.availability-calendar-aircraft,
.availability-calendar-cell {
  border: 1px solid #efe2ca;
  border-radius: 18px;
  background: #fffdfa;
  min-height: 6.2rem;
  padding: 0.9rem;
}

.availability-calendar-aircraft-head,
.availability-calendar-day-head {
  background: #faf4e8;
}

.availability-calendar-aircraft-head {
  display: flex;
  align-items: center;
  font-weight: 800;
  color: #5e4d2e;
}

.availability-calendar-day-head,
.availability-calendar-aircraft,
.availability-calendar-cell {
  flex-direction: column;
  justify-content: space-between;
  gap: 0.35rem;
}

.availability-calendar-day-head strong,
.availability-calendar-cell strong {
  text-transform: capitalize;
}

.availability-calendar-day-head.is-today {
  border-color: #111111;
  box-shadow: inset 0 0 0 1px rgba(17, 17, 17, 0.08);
}

.availability-calendar-cell {
  cursor: pointer;
  text-align: left;
  transition:
    transform 0.16s ease,
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}

.availability-calendar-cell:hover,
.availability-calendar-cell:focus-visible {
  border-color: #c8a96b;
  box-shadow: 0 16px 30px rgba(28, 22, 12, 0.08);
  transform: translateY(-1px);
  outline: none;
}

.availability-calendar-cell span,
.availability-calendar-day-head span {
  color: #6d6151;
  font-size: 0.82rem;
  line-height: 1.3;
}

.availability-calendar-cell[data-tone='success'] {
  background: linear-gradient(180deg, #f5fff8, #eefbf1);
}

.availability-calendar-cell[data-tone='warning'] {
  background: linear-gradient(180deg, #fff8eb, #fff1d2);
}

.availability-calendar-cell[data-tone='danger'] {
  background: linear-gradient(180deg, #fff1ef, #ffe0da);
}

.availability-calendar-cell[data-tone='info'] {
  background: linear-gradient(180deg, #eff7ff, #dfeefe);
}

.availability-calendar-cell[data-tone='dark'] {
  background: linear-gradient(180deg, #f0ede8, #e4ddd3);
}

.availability-calendar-cell.is-available strong {
  color: #17663a;
}

.availability-heatmap-row,
.availability-record-card {
  padding: 1rem;
  border: 1px solid #efe2ca;
  border-radius: 20px;
  background: #fffdfa;
}

.availability-record-card {
  display: grid;
  gap: 0.8rem;
}

.stored-document-card {
  display: grid;
  gap: 0.7rem;
  padding: 0.9rem;
  border: 1px solid #efe2ca;
  border-radius: 16px;
  background: #fffdfa;
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    transform 0.16s ease,
    box-shadow 0.16s ease;
}

.stored-document-card:hover,
.stored-document-card:focus-visible {
  border-color: rgba(200, 169, 107, 0.7);
  box-shadow: 0 16px 34px rgba(47, 39, 21, 0.1);
  transform: translateY(-1px);
  outline: none;
}

.hero-actions,
.inline-actions,
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.fleet-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin: 1rem 0;
}

.page-grid {
  display: grid;
  gap: 1rem;
}

.two-columns {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.section-head,
.card-top,
.status-row,
.toggle-row {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.surface,
.metric-card,
.list-card,
.timeline-item {
  padding: 1.2rem;
}

.metrics-grid,
.list-grid,
.document-list,
.priority-list,
.pricing-list,
.timeline,
.toggle-list,
.status-list {
  display: grid;
  gap: 0.9rem;
}

.metrics-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: 1rem;
}

.metric-card {
  border: 1px solid #efe2ca;
  border-radius: 18px;
  background: #fffaf2;
}

.metric-card span {
  display: block;
  color: #75684e;
  font-size: 0.9rem;
}

.metric-card strong {
  display: block;
  margin-top: 0.5rem;
  font-size: 1.4rem;
}

.priority-item,
.chip-button,
.ghost-button,
.primary-action {
  border-radius: 14px;
  cursor: pointer;
}

.priority-item {
  display: grid;
  gap: 0.25rem;
  padding: 1rem;
  border: 1px solid #efe2ca;
  background: #fffdfa;
  text-align: left;
}

.priority-item strong,
.list-card strong,
.timeline-item strong {
  font-size: 1rem;
}

.badge {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0 0.8rem;
  border: 1px solid rgba(213, 174, 88, 0.26);
  border-radius: 999px;
  color: #8f6919;
  background: rgba(213, 174, 88, 0.12);
  font-size: 0.78rem;
  font-weight: 700;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem;
  margin-top: 1rem;
}

.form-grid.compact {
  margin-top: 0;
}

.form-grid label,
.coverage-field,
.toggle-row {
  display: grid;
  gap: 0.35rem;
}

.span-2 {
  grid-column: span 2;
}

input,
textarea,
select {
  min-height: 2.9rem;
  border: 1px solid #dccfb9;
  border-radius: 14px;
  background: #ffffff;
  color: #111111;
  padding: 0 0.85rem;
}

input.input-error,
textarea.input-error,
select.input-error {
  border-color: #d92d20;
  box-shadow: 0 0 0 1px rgba(217, 45, 32, 0.08);
}

.coverage-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.65rem;
}

.coverage-option {
  min-height: 2.9rem;
  display: flex !important;
  align-items: center;
  gap: 0.55rem !important;
  border: 1px solid #dccfb9;
  border-radius: 14px;
  padding: 0 0.85rem;
  background: #ffffff;
  color: #111111;
  font-weight: 800;
}

.coverage-option input {
  width: 1rem;
  min-height: 1rem;
  accent-color: #111111;
}

.coverage-options.input-error .coverage-option {
  border-color: #d92d20;
  box-shadow: 0 0 0 1px rgba(217, 45, 32, 0.08);
}

textarea {
  padding: 0.8rem;
}

.ghost-button,
.chip-button {
  min-height: 2.7rem;
  padding: 0 0.95rem;
  border: 1px solid #dccfb9;
  background: #fffdfa;
  color: #2e2a22;
}

.primary-action {
  min-height: 2.9rem;
  padding: 0 1.1rem;
  border: 1px solid #111111;
  background: #111111;
  color: #ffffff;
}

.ghost-button,
.primary-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
}

.button-spinner {
  width: 0.95rem;
  height: 0.95rem;
  border-radius: 999px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  animation: operator-button-spin 0.7s linear infinite;
}

.primary-action:disabled,
.ghost-button:disabled,
.chip-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

@keyframes operator-button-spin {
  to {
    transform: rotate(360deg);
  }
}

.list-card,
.timeline-item {
  border: 1px solid #efe2ca;
  border-radius: 18px;
  background: #fffdfa;
}

.aircraft-image-wrap {
  margin: 0.9rem 0;
  overflow: hidden;
  border: 1px solid #efe2ca;
  border-radius: 16px;
  background: #f5efe4;
  aspect-ratio: 16 / 9;
}

.aircraft-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.pricing-card {
  gap: 1rem;
}

.table-shell {
  margin-top: 1rem;
  overflow: auto;
  border: 1px solid #efe2ca;
  border-radius: 18px;
  background: #fffdfa;
}

.pricing-table-head,
.pricing-table-row {
  display: grid;
  grid-template-columns: 1.7fr repeat(8, minmax(7rem, 0.8fr)) minmax(7rem, 0.9fr);
  gap: 0.75rem;
  align-items: center;
  min-width: 78rem;
  padding: 0.95rem 1rem;
}

.availability-table-head,
.availability-table-row {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr 0.9fr 1.3fr 0.8fr;
  gap: 0.9rem;
  align-items: center;
  min-width: 58rem;
  padding: 0.95rem 1rem;
}

.pricing-table-head,
.availability-table-head {
  border-bottom: 1px solid #efe2ca;
  background: #faf4e8;
  color: #7b6840;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.pricing-table-row + .pricing-table-row,
.availability-table-row + .availability-table-row {
  border-top: 1px solid #f1e7d6;
}

.pricing-table-row input {
  min-width: 0;
}

.pricing-aircraft-cell {
  display: grid;
  gap: 0.2rem;
}

.pricing-save-button,
.availability-action {
  min-height: 2.5rem;
}

.requests-dispatch-surface {
  gap: 1.4rem;
}

.request-kpi-grid {
  margin-top: 1.2rem;
}

.request-kpi-card {
  min-height: 9.2rem;
}

.requests-toolbar {
  display: grid;
  grid-template-columns: minmax(16rem, 1.1fr) minmax(0, 1.9fr) minmax(12rem, 0.7fr);
  gap: 1rem;
  align-items: end;
  margin-top: 1.4rem;
}

.requests-head-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.archive-toggle,
.archive-inline-button {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 3rem;
  padding: 0.75rem 1rem;
  border: 1px solid #e4d3b2;
  border-radius: 16px;
  background: #fff8ed;
  color: #2c241b;
  font-weight: 700;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.archive-toggle:hover,
.archive-toggle.is-active,
.archive-inline-button:hover {
  border-color: #c8a96b;
  box-shadow: 0 16px 28px rgba(31, 24, 16, 0.08);
  transform: translateY(-1px);
}

.archive-toggle__icon,
.archive-inline-button span[aria-hidden='true'] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  background: #f3e3c1;
  font-size: 1rem;
}

.archive-toggle__label {
  color: #6f5a30;
}

.archive-toggle strong,
.archive-inline-button strong {
  min-width: 1.9rem;
  padding: 0.2rem 0.45rem;
  border-radius: 999px;
  background: #1c1711;
  color: #fffaf1;
  text-align: center;
  font-size: 0.84rem;
}

.request-search,
.request-priority-filter {
  display: grid;
  gap: 0.45rem;
}

.request-search span,
.request-priority-filter span {
  color: #6f6250;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.requests-tab-row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.75rem;
}

.request-tab {
  min-height: 4.2rem;
  border: 1px solid #eadcc2;
  border-radius: 18px;
  background: #fffaf1;
  color: #211b14;
  display: grid;
  gap: 0.2rem;
  justify-items: start;
  padding: 0.85rem 1rem;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.request-tab strong {
  font-size: 1.15rem;
}

.request-tab.is-active {
  border-color: #c8a96b;
  box-shadow: 0 18px 30px rgba(31, 24, 16, 0.08);
  transform: translateY(-1px);
}

.archived-requests-panel {
  margin-top: 1.25rem;
  padding: 1.1rem;
  border: 1px solid #ebdcc4;
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(255, 250, 241, 0.92), rgba(247, 238, 223, 0.82));
}

.archived-requests-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: 0.95rem;
  margin-top: 1rem;
}

.archived-request-card {
  display: grid;
  gap: 0.7rem;
  padding: 1rem;
  border: 1px solid #ead9be;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.88);
}

.requests-dispatch-layout {
  display: grid;
  grid-template-columns: minmax(20rem, 0.85fr) minmax(0, 1.45fr);
  gap: 1.2rem;
  margin-top: 1.5rem;
  align-items: start;
}

.requests-queue,
.request-side-stack {
  display: grid;
  gap: 1rem;
}

.request-queue-card {
  border: 1px solid #efe2ca;
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(250, 244, 232, 0.88));
  padding: 1rem 1.05rem;
  display: grid;
  gap: 0.75rem;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.request-queue-card:hover,
.request-queue-card.is-active {
  border-color: #c8a96b;
  box-shadow: 0 22px 38px rgba(21, 18, 14, 0.08);
  transform: translateY(-1px);
}

.request-queue-top,
.request-detail-head,
.request-detail-actions,
.request-queue-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.request-queue-route {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: #16110d;
}

.request-queue-meta {
  color: #6c6355;
  font-size: 0.92rem;
}

.request-detail-surface,
.request-detail-card {
  display: grid;
  gap: 1rem;
}

.request-detail-surface {
  border: 1px solid #efe2ca;
  border-radius: 26px;
  background: #fffdfa;
  padding: 1.3rem;
}

.request-alert-strip {
  margin-top: 0.25rem;
}

.request-flow-strip {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0.75rem;
}

.request-flow-pill {
  display: grid;
  gap: 0.25rem;
  padding: 0.9rem 1rem;
  border-radius: 18px;
  border: 1px solid #eadfcd;
  background: #fffdfa;
}

.request-flow-pill[data-state='done'] {
  border-color: #d7ead8;
  background: #eef9ef;
}

.request-flow-pill[data-state='active'] {
  border-color: #f0cf85;
  background: #fff5d9;
}

.request-flow-pill__index {
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #7c6a4a;
}

.request-summary-grid,
.request-detail-grid,
.request-detail-blocks,
.request-match-hints {
  display: grid;
  gap: 1rem;
}

.request-summary-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.request-summary-card,
.request-detail-block,
.request-match-hint,
.request-match-card {
  border: 1px solid #f0e5d1;
  border-radius: 18px;
  background: #fffaf4;
  padding: 1rem;
}

.request-summary-card strong,
.request-detail-block strong,
.request-match-card strong {
  color: #16110d;
}

.request-detail-grid {
  grid-template-columns: minmax(0, 1.25fr) minmax(18rem, 0.9fr);
  align-items: start;
}

.request-detail-card {
  padding: 1.1rem;
  border-radius: 22px;
}

.request-detail-blocks {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.request-detail-note {
  margin: 0;
}

.package-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.74rem;
  font-weight: 800;
  border: 1px solid #ead8b7;
  background: #fff3de;
  color: #8a6220;
}

.package-chip[data-tone='warning'] {
  background: #fff6df;
  color: #9b6f17;
}

.package-chip[data-tone='danger'] {
  background: #fff1e7;
  color: #a35323;
}

.request-itinerary-table,
.request-validation-list,
.request-cost-grid,
.request-comparison-list,
.request-inline-actions,
.request-decision-toolbar,
.request-aircraft-table,
.request-route-assignment-table,
.request-executive-strip {
  display: grid;
  gap: 0.75rem;
}

.request-itinerary-head,
.request-itinerary-row,
.request-aircraft-head,
.request-aircraft-row,
.request-route-assignment-head,
.request-route-assignment-row {
  display: grid;
  gap: 0.75rem;
  align-items: center;
}

.request-itinerary-head,
.request-itinerary-row {
  grid-template-columns: 3.5rem 1.4fr 1.2fr 4rem 7rem 8rem;
}

.request-aircraft-head,
.request-aircraft-row {
  grid-template-columns: 1.35fr 5rem 4rem 6.5rem 4.5rem 4.5rem 7rem 7.5rem;
}

.request-route-assignment-head,
.request-route-assignment-row {
  grid-template-columns: 1.2fr 1fr 1fr 4rem;
}

.request-itinerary-head {
  color: #7f715c;
  font-size: 0.76rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.request-itinerary-row {
  padding: 0.9rem 1rem;
  border: 1px solid #f0e5d1;
  border-radius: 16px;
  background: #fffaf4;
}

.request-aircraft-head,
.request-route-assignment-head {
  color: #7f715c;
  font-size: 0.76rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.request-aircraft-row,
.request-route-assignment-row {
  padding: 0.9rem 1rem;
  border: 1px solid #f0e5d1;
  border-radius: 16px;
  background: #fffaf4;
}

.request-aircraft-row-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.4rem;
  padding: 0.45rem 0.75rem;
  border: 1px solid #dccfb9;
  border-radius: 14px;
  background: #fffdfa;
  color: #2e2a22;
  font-size: 0.85rem;
  font-weight: 700;
}

.request-aircraft-row-action[data-tone='success'] {
  border-color: rgba(22, 163, 74, 0.24);
  background: rgba(22, 163, 74, 0.08);
  color: #166534;
}

.request-aircraft-row-action[data-tone='warning'] {
  border-color: rgba(202, 138, 4, 0.24);
  background: rgba(202, 138, 4, 0.08);
  color: #8f6919;
}

.request-aircraft-row-action[data-tone='danger'] {
  border-color: rgba(185, 28, 28, 0.24);
  background: rgba(185, 28, 28, 0.08);
  color: #991b1b;
}

.request-validation-item,
.request-cost-item {
  border: 1px solid #f0e5d1;
  border-radius: 16px;
  background: #fffaf4;
  padding: 0.9rem 1rem;
}

.request-validation-item[data-state='ok'] {
  border-color: rgba(100, 170, 120, 0.35);
  background: #f7fcf8;
}

.request-validation-item[data-state='review'] {
  border-color: rgba(210, 164, 65, 0.34);
  background: #fffaf0;
}

.request-validation-item[data-state='blocked'] {
  border-color: rgba(212, 110, 96, 0.3);
  background: #fff6f4;
}

.request-validation-item span {
  display: inline-flex;
  width: fit-content;
  margin: 0.35rem 0;
  font-size: 0.8rem;
  font-weight: 800;
}

.request-semaphore-summary {
  padding: 0.95rem 1rem;
  border-radius: 16px;
  border: 1px solid #f0e5d1;
  background: #fffaf4;
}

.request-semaphore-summary[data-tone='success'] {
  border-color: rgba(100, 170, 120, 0.35);
  background: #f7fcf8;
}

.request-semaphore-summary[data-tone='warning'] {
  border-color: rgba(210, 164, 65, 0.34);
  background: #fffaf0;
}

.request-semaphore-summary[data-tone='danger'] {
  border-color: rgba(212, 110, 96, 0.3);
  background: #fff6f4;
}

.request-cost-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.request-cost-item span,
.request-comparison-list span {
  color: #6c5d47;
  font-size: 0.9rem;
}

.request-comparison-list {
  margin-top: 0.75rem;
}

.request-inline-actions {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.request-decision-toolbar {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.request-priority-reco {
  padding: 0.95rem 1rem;
  border: 1px solid #f0e5d1;
  border-radius: 16px;
  background: linear-gradient(180deg, #fffdf9, #fff8ee);
}

.request-executive-strip {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.request-cost-details {
  border: 1px solid #f0e5d1;
  border-radius: 16px;
  background: #fffdfa;
  padding: 0.9rem 1rem;
}

.request-cost-details summary {
  cursor: pointer;
  font-weight: 800;
  color: #241b13;
}

.request-internal-comment {
  width: 100%;
  border: 1px solid #dbcdb5;
  border-radius: 16px;
  padding: 0.9rem 1rem;
  background: #fffdfa;
  color: #201914;
  font: inherit;
  resize: vertical;
}

.toggle-row {
  min-height: 3.2rem;
  padding: 0.9rem 1rem;
  border: 1px solid #efe2ca;
  border-radius: 16px;
  background: #fffdfa;
}

.toggle-row input[type='checkbox'] {
  min-height: auto;
  width: 1.1rem;
  height: 1.1rem;
  margin: 0;
}

@media (max-width: 1080px) {
  .metrics-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .two-columns {
    grid-template-columns: 1fr;
  }

  .fleet-kpi-grid,
  .fleet-layout,
  .fleet-premium-grid,
  .document-type-grid,
  .document-preview-grid,
  .document-upload-grid,
  .wizard-stepper,
  .wizard-review-grid,
  .company-progress-steps,
  .dashboard-quick-actions,
  .dashboard-layout,
  .request-summary-grid,
  .request-detail-grid,
  .request-detail-blocks,
  .request-cost-grid,
  .request-inline-actions,
  .request-decision-toolbar,
  .request-executive-strip {
    grid-template-columns: 1fr;
  }

  .request-itinerary-head,
  .request-itinerary-row,
  .request-aircraft-head,
  .request-aircraft-row,
  .request-route-assignment-head,
  .request-route-assignment-row {
    grid-template-columns: 1fr;
  }

  .requests-toolbar,
  .requests-dispatch-layout,
  .requests-tab-row {
    grid-template-columns: 1fr;
  }

  .wizard-modal {
    max-height: calc(100vh - 1.4rem);
  }
}

@media (max-width: 720px) {
  .operator-portal-page {
    padding: 0.75rem;
  }

  .hero,
  .section-head,
  .card-top,
  .status-row,
  .toggle-row,
  .request-detail-head,
  .request-detail-actions,
  .request-queue-top,
  .request-queue-meta {
    flex-direction: column;
    align-items: stretch;
  }

  .form-grid,
  .metrics-grid {
    grid-template-columns: 1fr;
  }

  .fleet-card-row,
  .ops-timeline-item {
    grid-template-columns: 1fr;
  }

  .wizard-header,
  .wizard-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .span-2 {
    grid-column: auto;
  }
}
</style>
