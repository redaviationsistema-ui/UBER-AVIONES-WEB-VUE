import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { requestWithCandidates, pickCollection, pickRecord } from '../../../lib/backendCrud'
import { api, resolveMediaUrl } from '../../../lib/api'
import {
  resolveProviderIdForUser,
} from '../../../lib/providerContext'
import { resolveProviderOperationalAccessState } from '../../../lib/providerAccess'
import { resolveBestCompanyDisplayName } from '../../../lib/companyDisplay'
import { normalizeOperatorValidationDocument } from '../../../lib/providerCompanyDocuments'
import { buildProviderReviewFlow, resolveProviderStatusMeta } from '../../../lib/providerReview'
import {
  buildOperatorCommercialConfig,
  buildOperatorCompanyProfile,
  buildOperatorFleetSummary,
  getOperatorDocumentVersions,
} from '../../../lib/operatorValidationApi'
import { buildFrontendUrl } from '../../../lib/frontendUrl'
import {
  buildSharedFlowStepStates,
  getSharedWorkflowActionCopy,
  getSharedWorkflowStepDescription,
  buildWorkflowApiPayload,
  normalizeWorkflowLabel,
  resolveSharedVisualWorkflowStepId,
  resolveSharedWorkflowStatus,
  resolveWorkflowState,
  SHARED_WORKFLOW_STEPS,
} from '../../../utils/flightWorkflow'
import { emitWorkflowSync, subscribeWorkflowSync } from '../../../lib/workflowSync'
import { echo, isEchoConfigured, syncEchoAuthToken } from '../../../plugins/echo'
import { getAdminReservations } from '../../admin/adminReservationsApi'
import { deriveClientWorkflowStatus } from '../../client/clientBookingApi'
import { useAuthStore } from '../../../stores/auth'
import { useUiStore } from '../../../stores/ui'
import {
  buildRequestFullRoute,
  buildRealtimeRequestPayload,
  buildRealtimeRequestsFromNotifications,
  findOperatorRequestByIdentifier,
  getRequestRouteLabel,
  hasOperatorTrackingActivity,
  isRequestSameOperationalDay,
  matchesOperatorRequestIdentifier,
  mergeRealtimeNotificationCollection,
  normalizeOperatorTrackingStatus,
  parseOperationalDate,
  resolveOperatorRequestQueue,
  shouldIgnoreOperatorRequestsRouteError,
  shouldKeepOperatorRealtimeRequestVisible,
  shouldShowRealtimeRequestInBanner,
  syncRealtimeRequestsWithRequestsCollection,
} from './portalOperador.utilidadesSolicitudes'
import {
  addDays,
  endOfAvailabilityDay,
  formatCurrency,
  formatDateCompact,
  formatDateTimeDisplay,
  formatDateTimeRange,
  formatDocumentExpiry,
  formatFileSize,
  formatOperationalTimelineTime,
  formatRelativeAccessLabel,
  isSameAvailabilityDay,
  normalizeAvailabilityStatusForBackend,
  startOfAvailabilityDay,
  startOfAvailabilityWeek,
  toDateTimeLocalValue,
} from './portalOperador.formateadores'
import {
  compactBillingReference,
  normalizePayment as normalizePaymentEntry,
} from './portalOperador.utilidadesPagos'
import { createIncidentUtils } from './portalOperador.utilidadesIncidencias'
import { createOperatorPortalBillingDomain } from './portalOperador.facturacion'
import { createOperatorPortalAircraftDomain } from './portalOperador.aeronaves'
import {
  aircraftMatchesOperationalTab,
  countAircraftByOperationalTab,
  getAircraftOperationalTabKey,
  isAircraftOperationallyActive,
  obtenerEstadoOperativoAeronave,
  resolveAircraftOperationalStatus,
} from './portalOperador.estados'
import { createOperatorPortalRequestsDomain } from './portalOperador.solicitudes'
import { createOperatorPortalReleaseDomain } from './portalOperador.dominioLiberacion'
import {
  createOperatorPortalCompanyHelpers,
  createEmptyCompany,
  isValidMexicanRfc,
  normalizeMexicanRfc,
} from './portalOperador.empresa'
import {
  createEmptyProviderOperationalReleaseForm,
  createOperatorPortalReleaseHelpers,
  normalizeProviderOperationalAircraftOverallStatus,
  normalizeProviderOperationalBinaryStatus,
  normalizeProviderOperationalCrewOverallStatus,
} from './portalOperador.liberacion'
import {
  buildCompanyFieldErrors,
  buildCompanyPayload,
  buildCompanyReviewCandidates,
  buildCompanyReviewFormData,
  buildCompanySaveCandidates,
  COMPANY_FORM_ERROR_KEYS,
  hasCompanyFieldErrors,
  sanitizeCompanyPayloadForSave,
} from './portalOperador.flujoEmpresa'
import { buildAircraftPayload, buildAircraftWizardStepErrors } from './utilidadesWizardAeronave'

export {
  findOperatorRequestByIdentifier,
  hasOperatorTrackingActivity,
  matchesOperatorRequestIdentifier,
  normalizeOperatorTrackingStatus,
  parseOperationalDate,
  resolveOperatorRequestQueue,
  shouldShowRealtimeRequestInBanner,
}

export const AIRCRAFT_WIZARD_ROUTE_QUERY_KEY = 'aircraft_wizard'
export const AIRCRAFT_WIZARD_ROUTE_CREATE_VALUE = 'new'

export const AIRCRAFT_REVIEW_WIZARD_STATES = {
  BORRADOR: 'BORRADOR',
  LISTO_PARA_REGISTRAR: 'LISTO_PARA_REGISTRAR',
  PENDIENTE_REVISION: 'PENDIENTE_REVISION',
  APROBADA: 'APROBADA',
  RECHAZADA: 'RECHAZADA',
  CAMBIOS_SOLICITADOS: 'CAMBIOS_SOLICITADOS',
}

export function normalizeAircraftWizardRouteMode(value = '') {
  return String(value || '').trim().toLowerCase()
}

export function normalizeAircraftValidationStatus(value = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (!normalized) return 'pending'

  if (['approved', 'aprobada', 'aprobado', 'active', 'trial_active'].includes(normalized)) {
    return 'approved'
  }

  if (['changes_requested', 'changes_required', 'cambios_solicitados', 'cambios_requeridos', 'needs_changes'].includes(normalized)) {
    return 'changes_requested'
  }

  if (['rejected', 'rechazada', 'rechazado'].includes(normalized)) {
    return 'rejected'
  }

  if (
    [
      'pending',
      'pendiente',
      'pending_review',
      'pendiente_revision',
      'review',
      'revision',
      'red_aviation_review',
      'draft',
      'borrador',
    ].includes(normalized)
  ) {
    return 'pending'
  }

  return normalized
}

export function deriveAircraftWizardReviewState({
  aircraftId = null,
  aircraftStatus = '',
  validationStatus = '',
  rejectionReason = '',
  changesRequestedNotes = '',
  isReadyForRegistration = false,
} = {}) {
  const hasPersistedRecord = Number(aircraftId || 0) > 0
  const normalizedValidationStatus = normalizeAircraftValidationStatus(validationStatus)
  const normalizedAircraftStatus = normalizeAircraftValidationStatus(aircraftStatus)
  const normalizedRejectionReason = String(rejectionReason || '').trim()
  const normalizedChangesRequestedNotes = String(changesRequestedNotes || '').trim()

  if (hasPersistedRecord === false) {
    if (isReadyForRegistration === true) {
      return {
        key: AIRCRAFT_REVIEW_WIZARD_STATES.LISTO_PARA_REGISTRAR,
        label: 'Lista para registrar',
        tone: 'info',
        message: 'Revisa la informacion antes de registrar la aeronave.',
        notes: 'Al registrarla, sera enviada a revision administrativa.',
      }
    }

    return {
      key: AIRCRAFT_REVIEW_WIZARD_STATES.BORRADOR,
      label: 'Borrador',
      tone: 'neutral',
      message: 'Continua completando la informacion antes de registrar la aeronave.',
      notes: '',
    }
  }

  if (
    normalizedValidationStatus === 'changes_requested' ||
    normalizedAircraftStatus === 'changes_requested'
  ) {
    return {
      key: AIRCRAFT_REVIEW_WIZARD_STATES.CAMBIOS_SOLICITADOS,
      label: 'Cambios solicitados',
      tone: 'warning',
      message: 'Administracion solicito cambios para esta aeronave.',
      notes:
        normalizedChangesRequestedNotes ||
        'Revisa las observaciones administrativas antes de volver a enviarla.',
    }
  }

  if (normalizedValidationStatus === 'rejected' || normalizedAircraftStatus === 'rejected') {
    return {
      key: AIRCRAFT_REVIEW_WIZARD_STATES.RECHAZADA,
      label: 'Rechazada',
      tone: 'danger',
      message: 'La aeronave fue rechazada por administracion.',
      notes: normalizedRejectionReason || 'No se registro un motivo de rechazo.',
    }
  }

  if (normalizedValidationStatus === 'approved' || normalizedAircraftStatus === 'approved') {
    return {
      key: AIRCRAFT_REVIEW_WIZARD_STATES.APROBADA,
      label: 'Aprobada',
      tone: 'success',
      message: 'Aeronave aprobada.',
      notes: '',
    }
  }

  return {
    key: AIRCRAFT_REVIEW_WIZARD_STATES.PENDIENTE_REVISION,
    label: 'Pendiente de revision',
    tone: 'warning',
    message: 'Aeronave registrada y pendiente de revision administrativa.',
    notes: '',
  }
}

export function hasCreateAircraftWizardIntent(section = '', query = {}) {
  if (String(section || '').trim().toLowerCase() !== 'aeronaves') return false

  return (
    normalizeAircraftWizardRouteMode(query?.[AIRCRAFT_WIZARD_ROUTE_QUERY_KEY]) ===
    AIRCRAFT_WIZARD_ROUTE_CREATE_VALUE
  )
}

export function removeAircraftWizardRouteIntent(query = {}) {
  const nextQuery = { ...query }
  delete nextQuery[AIRCRAFT_WIZARD_ROUTE_QUERY_KEY]
  return nextQuery
}

export function useOperatorPortalSetup(props) {
const route = useRoute()

const router = useRouter()

const auth = useAuthStore()

const ui = useUiStore()

const {
  getIncidentEvidenceKind,
  mergeIncidentCollections,
  normalizeIncident,
} = createIncidentUtils({
  normalizeMediaUrl,
})

const loading = ref(false)

const refreshingRequests = ref(false)
const isBootstrapping = ref(false)
const hasBootstrapped = ref(false)
const lastRequestsRefreshAt = ref(0)

const portalLoadSequence = ref(0)

let portalLoadScheduled = false
let providerFlightRequestsChannel = null
let providerFlightRequestsChannelName = ''
let portalBootstrapPromise = null
let requestsRefreshPromise = null
let notificationsRouteResolutionPromise = null

const OPERATOR_REQUESTS_POLL_INTERVAL_MS = 10000

const OPERATOR_BOOT_TIMEOUT_MS = 45000

const OPERATOR_SECTION_TIMEOUT_MS = 45000

const OPERATOR_BACKGROUND_TIMEOUT_MS = 15000
const PROVIDER_RELEASE_REQUEST_TIMEOUT_MS = 45000

const PROVIDER_OPERATIONAL_RELEASE_AUTOSAVE_MS = 700

const REQUEST_COLLECTION_KEYS = [
  'requests',
  'flight_requests',
  'reservations',
  'solicitudes',
  'items',
  'matches',
  'data',
]

const REQUESTS_ROUTE_CANDIDATES = [
  '/proveedor/mis-solicitudes',
  '/proveedor/solicitudes',
  '/operator/my-requests',
  '/operator/requests',
]

const NOTIFICATIONS_ROUTE_CANDIDATES = [
  '/proveedor/notificaciones',
]

const AIRCRAFT_LIST_ROUTE_CANDIDATES = [
  '/proveedor/mis-aeronaves',
  '/proveedor/aeronaves',
  '/operator/aircraft',
  '/operator/my-aircraft',
]

const AIRCRAFT_DETAIL_ROUTE_TEMPLATES = [
  '/proveedor/aeronaves/:id',
  '/operator/aircraft/:id',
]

const AIRCRAFT_COLLECTION_RESPONSE_KEYS = ['aircraft', 'aeronaves', 'fleet', 'data', 'items']
const AIRCRAFT_RECORD_RESPONSE_KEYS = ['aircraft', 'aeronave', 'data', 'item']

const CREW_ROUTE_CANDIDATES = [
  '/proveedor/tripulacion',
  '/proveedor/sobrecargos',
  '/operator/crew',
  '/operator/tripulation',
]

const REQUEST_MUTATION_ROUTE_FAMILIES = {
  proveedor: {
    basePath: '/proveedor/solicitudes/:id',
    workflowPath: '/proveedor/solicitudes/:id/workflow',
    statusPath: '/proveedor/solicitudes/:id/status',
    acceptPath: '/proveedor/solicitudes/:id/aceptar',
    rejectPath: '/proveedor/solicitudes/:id/rechazar',
  },
  operator: {
    basePath: '/operator/requests/:id',
    workflowPath: '/operator/requests/:id/workflow',
    statusPath: '/operator/requests/:id/status',
    acceptPath: '/operator/requests/:id/accept',
    rejectPath: '/operator/requests/:id/reject',
  },
}

let requestsPollTimer = null

let removeWorkflowSyncSubscription = null

let providerOperationalReleaseAutosaveTimer = null

const providerOperationalReleaseAutosaveTimerRef = {
  get value() {
    return providerOperationalReleaseAutosaveTimer
  },
  set value(nextValue) {
    providerOperationalReleaseAutosaveTimer = nextValue
  },
}

const aircraftDetailHydrationInFlight = new Set()

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
const realtimeRequests = ref([])
const unreadRealtimeCount = computed(() => {
  const unreadRequestIds = new Set()

  realtimeNotifications.value.forEach((notification) => {
    if (notification?.readAt) return

    const requestId = String(
      notification.requestId ||
        notification.payload?.request_id ||
        notification.payload?.id ||
        '',
    ).trim()

    if (requestId) unreadRequestIds.add(requestId)
  })

  return unreadRequestIds.size
})
const realtimeNotifications = ref([])
const realtimeNotificationsOpen = ref(false)
const notificationAudioUnlocked = ref(false)
const realtimeNotificationsInitialized = ref(false)
const validNotificationsRoute = ref('')
const notificationsRouteUnavailable = ref(false)

const activeRequestsRouteFamily = ref('proveedor')

const operations = ref([])

const selectedOperationId = ref('')

const crew = ref([])

const incidents = ref([])

const payments = ref([])

const visibleRealtimeRequests = computed(() =>
  realtimeRequests.value.filter((request) =>
    shouldKeepOperatorRealtimeRequestVisible(request, requests.value),
  ),
)

const activeRealtimeNotifications = computed(() =>
  realtimeNotifications.value.filter((notification) =>
    shouldKeepOperatorRealtimeNotificationVisible(notification, requests.value),
  ),
)

const unreadRealtimeNotifications = computed(
  () => activeRealtimeNotifications.value.filter((notification) => !notification.readAt).length,
)

const visibleUnreadRealtimeCount = computed(() => {
  const unreadRequestIds = new Set()

  visibleRealtimeRequests.value.forEach((request) => {
    const requestId = String(request.requestId || request.request_id || request.id || '').trim()
    if (!requestId) return

    const hasUnreadNotification = realtimeNotifications.value.some((notification) => {
      if (notification?.readAt) return false

      const notificationRequestId = String(
        notification.requestId ||
          notification.payload?.request_id ||
          notification.payload?.id ||
          '',
      ).trim()

      return notificationRequestId === requestId
    })

    if (hasUnreadNotification) unreadRequestIds.add(requestId)
  })

  return unreadRequestIds.size
})
const paymentsTab = ref('operations')

const history = ref([])

const providerAircraftBillingPlan = ref(null)
const providerAircraftBillingPlanLoaded = ref(false)

const loadingProviderAircraftBillingPlan = ref(false)

const billingFocusAircraftId = ref(null)

const activatingAircraftId = ref(null)

const billingStatusRefreshAircraftId = ref(null)
const aircraftBillingActionIds = ref([])
const billingStatusBackendCooldownUntil = ref(0)

const handledBillingReturnKey = ref('')

const editingAircraftId = ref(null)
const savingPricingAircraftId = ref(null)

const selectedAvailabilityCalendarAircraftId = ref('all')

const availabilityWeekAnchor = ref(startOfAvailabilityWeek(new Date()))

const companyForm = reactive({
  legalName: '',
  rfc: '',
  tradeName: '',
  phone: '',
  email: '',
  address: '',
  operationalBase: '',
  legalRepresentative: '',
  jetAPrice: '',
  marginPercent: '',
  fixedFee: '',
  newDocumentFile: null,
  newDocumentName: '',
})

const companyDocumentDrafts = reactive({})

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

const documentLibrarySearch = ref('')
const documentLibraryCategory = ref('all')
const documentLibraryState = ref('all')
const documentLibrarySort = ref('recent')
const documentLibraryMenuId = ref(null)

const documentPreview = reactive({
  open: false,
  file: null,
  url: '',
  canPreview: false,
})

const companyDocumentDrawer = reactive({
  open: false,
  document: null,
  versions: [],
  loadingVersions: false,
})

const incidentDetailModal = reactive({
  open: false,
  incident: null,
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
  files: [],
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

const savingCompany = ref(false)
const sendingCompanyToReview = ref(false)

const aircraftWizardOpen = ref(false)

const aircraftWizardStep = ref(1)

const aircraftWizardSubmitting = ref(false)

const aircraftWizardReadOnly = ref(false)

const aircraftWizardStepError = ref('')

const editingCrewId = ref(null)

const savingCrew = ref(false)

const operationCrewDrafts = reactive({})

const requestSearch = ref('')

const requestStatusFilter = ref('pending')

const requestPriorityFilter = ref('all')

const selectedRequestId = ref(null)

const requestInternalCommentDraft = ref('')

const archivedTrayOpen = ref(false)

const requestStatusUpdate = reactive({
  requestId: null,
  action: '',
})

const requestWorkflowLocalOverrides = reactive({})

const operationWorkflowOptions = [
  { value: 'reserved', label: 'Reserva solicitada' },
  { value: 'provider_pending', label: 'Proveedor' },
  { value: 'contract_pending', label: 'Contrato pendiente' },
  { value: 'payment_pending', label: 'Pago pendiente' },
  { value: 'payment_confirmed', label: 'Pago confirmado' },
  { value: 'flight_confirmed', label: 'Vuelo confirmado' },
  { value: 'tracking_live', label: 'Tracking activo' },
  { value: 'completed', label: 'Finalizado' },
]

const savingProviderOperationalRelease = ref(false)

const syncingProviderOperationalRelease = ref(false)

const savingProviderOperationalIssue = ref(false)

const providerOperationalReleaseFeedback = ref('')

const providerOperationalReleaseForm = reactive(createEmptyProviderOperationalReleaseForm())
const providerOperationalReleaseLocalOverrides = reactive({})

const providerOperationalReleaseDirty = ref(false)

const providerOperationalReleaseHydrating = ref(false)

const providerOperationalReleaseLoadedRequestId = ref('')
const providerOperationalReleaseLastHydratedSourceStamp = ref('')

const providerOperationalReleaseAutosaveQueued = ref(false)

const providerOperationalReleaseActiveStep = ref('aircraft')

const providerOperationalIssueOpen = ref(false)

const providerOperationalIssueForm = reactive({
  type: 'Aeronave no disponible',
  comment: '',
})

const requestsConnectionWarningShown = ref(false)
const loadedSections = reactive(new Set())
const sectionLoadPromises = new Map()

const sectionLoadState = reactive({
  dashboard: false,
  empresa: false,
  aeronaves: false,
  costos: false,
  solicitudes: false,
  operaciones: false,
  tripulacion: false,
  incidencias: false,
  pagos: false,
  historial: false,
  disponibilidad: false,
  configuracion: false,
  'release-provider': false,
})

function normalizeSectionKey(section = '') {
  return String(section || '').trim().toLowerCase()
}

function markSectionLoaded(...sections) {
  sections
    .map((section) => normalizeSectionKey(section))
    .filter(Boolean)
    .forEach((section) => {
      if (Object.prototype.hasOwnProperty.call(sectionLoadState, section)) {
        sectionLoadState[section] = true
      }
      loadedSections.add(section)
    })
}

function resetLoadedSection(...sections) {
  sections
    .map((section) => normalizeSectionKey(section))
    .filter(Boolean)
    .forEach((section) => {
      if (Object.prototype.hasOwnProperty.call(sectionLoadState, section)) {
        sectionLoadState[section] = false
      }
      loadedSections.delete(section)
      sectionLoadPromises.delete(section)
    })
}

function hasSectionLoaded(section = '') {
  const normalizedSection = normalizeSectionKey(section)
  if (!normalizedSection) return false
  return Boolean(sectionLoadState[normalizedSection]) || loadedSections.has(normalizedSection)
}

function shouldPrimeNotificationsAfterBootstrap() {
  return ['dashboard', 'solicitudes', 'release-provider'].includes(props.section)
}

const aircraftDecisionMode = ref('best_match')

const aircraftFilterBase = ref('all')

const aircraftFilterType = ref('all')

const aircraftFilterSort = ref('compatibility')

const aircraftCatalogSearch = ref('')

const aircraftCatalogStatus = ref('all')

const aircraftCatalogBase = ref('all')

const aircraftCatalogCategory = ref('all')

const aircraftCatalogView = ref('cards')

const aircraftCatalogMenuId = ref(null)

const aircraftDomain = createOperatorPortalAircraftDomain({
  aircraft,
  normalizeMediaUrl,
  getAircraftDocumentTypeMeta,
  getAvailabilityStatusMeta: (status = '') =>
    availabilityStatusCatalog[status] || {
      label: status || 'Bloqueo',
      tone: 'neutral',
      short: 'Info',
    },
  startOfAvailabilityDay,
  endOfAvailabilityDay,
  startOfAvailabilityWeek,
  addDays,
  toDateTimeLocalValue,
  selectedAvailabilityCalendarAircraftId,
  availabilityForm,
  availabilityWeekAnchor,
})

const {
  humanizeAircraftStatus,
  normalizeAircraftDocument,
  normalizeAircraftImage,
  normalizeAvailability,
} = aircraftDomain

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
  { id: 'airworthiness_certificate', label: 'Certificado de aeronavegabilidad', requiresExpiry: true, accepts: ['image', 'pdf'] },
  { id: 'matricula_aeronave', label: 'Matricula', requiresExpiry: false, accepts: ['image', 'pdf'] },
  { id: 'insurance_policy', label: 'Seguro', requiresExpiry: true, accepts: ['image', 'pdf'] },
  { id: 'maintenance_sticker', label: 'Sticker de mantenimiento', requiresExpiry: false, accepts: ['image', 'pdf'] },
  { id: 'flight_logbook', label: 'Bitacora de vuelo', requiresExpiry: false, accepts: ['image', 'pdf'] },
]

const AIRCRAFT_DOCUMENT_TYPE_LABELS = {
  maintenance_sticker: 'Sticker de mantenimiento',
  airworthiness_certificate: 'Certificado de aeronavegabilidad',
  registration_certificate: 'Certificado de matricula',
  matricula_aeronave: 'Matricula',
  insurance_policy: 'Poliza de seguro',
  operation_manual: 'Manual de operacion',
  maintenance_manual: 'Manual de mantenimiento',
  flight_logbook: 'Bitacora de vuelo',
}

const AIRCRAFT_DOCUMENT_CATEGORY_RULES = [
  { id: 'maintenance', label: 'Mantenimiento', matchers: ['maintenance', 'bitacora', 'logbook', 'inspection', 'service'] },
  { id: 'certificates', label: 'Certificados', matchers: ['certificate', 'certificado', 'airworthiness', 'matricula'] },
  { id: 'operation', label: 'Operacion', matchers: ['operation', 'operacion', 'manual', 'dispatch', 'flight'] },
  { id: 'legal', label: 'Legal', matchers: ['legal', 'permiso', 'licencia', 'compliance'] },
  { id: 'insurance', label: 'Seguro', matchers: ['insurance', 'seguro', 'policy', 'poliza'] },
  { id: 'commercial', label: 'Comercial', matchers: ['commercial', 'comercial', 'contract', 'invoice'] },
]

const maxAircraftDocumentFiles = 12

const maxImageDocumentBytes = 8 * 1024 * 1024

const maxPdfDocumentBytes = 25 * 1024 * 1024

const maxIncidentEvidenceFiles = 5

const maxIncidentEvidenceTotalBytes = 25 * 1024 * 1024

const providerId = computed(() =>
  Number(auth.providerId || resolveProviderIdForUser(auth.user) || 0),
)

const canLoadProviderData = computed(() => auth.initialized && auth.isAuthenticated)

const OPERATOR_OPERATIONAL_SECTIONS = new Set([
  'solicitudes',
  'operaciones',
  'incidencias',
  'pagos',
  'historial',
  'disponibilidad',
  'release-provider',
])

function resolveOperatorCompanyName(operator = {}) {
  return resolveBestCompanyDisplayName(
    operator.company_name,
    operator.commercial_name,
    operator.nombre_empresa,
    operator.nombre_comercial,
    operator.legal_name,
    operator.razon_social,
  )
}

const operatorIdentity = computed(() => {
  const providerProfile = auth.user?.provider && typeof auth.user.provider === 'object' ? auth.user.provider : {}
  const userProfile = auth.user?.profile && typeof auth.user.profile === 'object' ? auth.user.profile : {}
  const accessProfile = auth.access && typeof auth.access === 'object' ? auth.access : {}
  const loginProfile = auth.loginContext && typeof auth.loginContext === 'object' ? auth.loginContext : {}
  const authUser = auth.user && typeof auth.user === 'object' ? auth.user : {}
  const merged = {
    ...providerProfile,
    ...userProfile,
    ...accessProfile,
    ...loginProfile,
    ...authUser,
  }

  return {
    ...merged,
    company_name:
      merged.company_name ||
      merged.legal_name ||
      merged.nombre_empresa ||
      merged.commercial_name ||
      merged.nombre_comercial ||
      merged.razon_social ||
      company.legalName ||
      company.tradeName ||
      '',
    nombre_empresa:
      merged.nombre_empresa ||
      merged.company_name ||
      merged.legal_name ||
      merged.commercial_name ||
      merged.nombre_comercial ||
      merged.razon_social ||
      company.legalName ||
      company.tradeName ||
      '',
    commercial_name:
      merged.commercial_name ||
      merged.nombre_comercial ||
      merged.company_name ||
      merged.legal_name ||
      merged.nombre_empresa ||
      company.tradeName ||
      company.legalName ||
      '',
    nombre_comercial:
      merged.nombre_comercial ||
      merged.commercial_name ||
      merged.company_name ||
      merged.legal_name ||
      merged.nombre_empresa ||
      company.tradeName ||
      company.legalName ||
      '',
    razon_social:
      merged.razon_social ||
      merged.legal_name ||
      merged.company_name ||
      merged.nombre_empresa ||
      company.legalName ||
      '',
  }
})

const providerName = computed(() => resolveOperatorCompanyName(operatorIdentity.value))

const activeAircraft = computed(
  () => countAircraftByOperationalTab(aircraft.value, 'active'),
)

const billingFocusedAircraft = computed(() =>
  aircraft.value.find((item) => Number(item.id) === Number(billingFocusAircraftId.value)) || null,
)

const providerAircraftPlanAmount = computed(() =>
  Number(
    providerAircraftBillingPlan.value?.amount ||
      providerAircraftBillingPlan.value?.price_monthly ||
      providerAircraftBillingPlan.value?.price ||
      0,
  ),
)

const providerAircraftBillingCurrency = computed(() =>
  String(
    providerAircraftBillingPlan.value?.currency ||
      providerAircraftBillingPlan.value?.currency_code ||
      providerAircraftBillingPlan.value?.moneda ||
      'USD',
  ).toUpperCase(),
)

const providerAircraftBillingAmount = computed(() => providerAircraftPlanAmount.value || 100)

const selectedPaymentsAircraftId = computed(() => {
  const routeAircraftId = Number(route.query.aircraft_id || 0)
  if (routeAircraftId) return routeAircraftId
  return Number(billingFocusAircraftId.value || 0)
})

const selectedPaymentsAircraft = computed(() =>
  aircraft.value.find((item) => Number(item.id) === Number(selectedPaymentsAircraftId.value)) || null,
)

const providerAircraftFlowSubject = computed(() => {
  if (billingFocusedAircraft.value) return billingFocusedAircraft.value

  return (
    aircraft.value.find((item) => getAircraftBillingStatusMeta(item).action === 'pay') ||
    aircraft.value.find((item) => getAircraftBillingStatusMeta(item).action !== 'pay') ||
    null
  )
})

const providerAircraftActivationFlow = computed(() => {
  const targetAircraft = providerAircraftFlowSubject.value
  const isActive =
    targetAircraft && getAircraftBillingStatusMeta(targetAircraft).action !== 'pay'
  const hasPaymentSignal = Boolean(
    targetAircraft?.lastPaymentAt || targetAircraft?.subscriptionEndsAt || isActive,
  )

  return [
    {
      id: 'register',
      title: 'Proveedor registra avion',
      detail: targetAircraft
        ? `${targetAircraft.name} ya quedo capturada en la seccion del proveedor.`
        : 'El proveedor inicia el alta desde esta seccion.',
      state: targetAircraft ? 'done' : 'pending',
    },
    {
      id: 'pending_payment',
      title: 'Backend guarda avion pendiente de pago',
      detail: 'La aeronave queda registrada pero todavia no visible al cliente.',
      state: targetAircraft ? 'done' : 'pending',
    },
    {
      id: 'frontend_payment',
      title: 'Frontend muestra pago mensual',
      detail: `El portal proveedor expone la mensualidad de ${formatCurrency(providerAircraftBillingAmount.value)}.`,
      state: targetAircraft ? 'done' : 'pending',
    },
    {
      id: 'provider_paid',
      title: `Proveedor paga ${formatCurrency(providerAircraftBillingAmount.value)}`,
      detail: 'Stripe Checkout recibe el cobro de la aeronave.',
      state: hasPaymentSignal ? 'done' : targetAircraft ? 'current' : 'pending',
    },
    {
      id: 'webhook_confirmed',
      title: 'Webhook confirma',
      detail: 'El backend valida el cobro antes de cambiar la visibilidad operativa.',
      state: isActive ? 'done' : hasPaymentSignal ? 'current' : 'pending',
    },
    {
      id: 'backend_active',
      title: 'Backend activa avion',
      detail: 'La suscripcion queda activa y la aeronave sale del estado pendiente.',
      state: isActive ? 'done' : hasPaymentSignal ? 'current' : 'pending',
    },
    {
      id: 'frontend_active',
      title: 'Frontend muestra avion activo',
      detail: 'La tarjeta de la aeronave cambia a estado activo dentro del portal proveedor.',
      state: isActive ? 'done' : 'pending',
    },
    {
      id: 'client_visible',
      title: 'Cliente ya puede ver esa aeronave',
      detail: 'Solo las aeronaves activas quedan listas para matching y exposicion comercial.',
      state: isActive ? 'done' : 'pending',
    },
  ]
})

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

const aircraftSubscriptionPayments = computed(() =>
  payments.value.filter((payment) => payment.isAircraftSubscription),
)

const aircraftPaymentRows = computed(() =>
  aircraft.value.map((item) => {
    const billingMeta = getAircraftBillingStatusMeta(item)
    const relatedPayment =
      payments.value.find((payment) => {
      if (payment.aircraftId && Number(payment.aircraftId) === Number(item.id)) return true

      const aircraftNeedles = [
        item.name,
        item.registration,
        `${item.name} ${item.registration || ''}`.trim(),
      ]
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean)

      const haystack = [
        payment.aircraft,
        payment.description,
        payment.reference,
        payment.flight,
      ]
        .map((value) => String(value || '').trim().toLowerCase())
        .join(' · ')

      return aircraftNeedles.some((needle) => haystack.includes(needle))
      }) ||
      payments.value.find((payment) => {
        const normalizedType = String(payment.type || '').toLowerCase()
        const normalizedDescription = String(payment.description || '').toLowerCase()
        const looksLikeAircraftSubscription =
          normalizedType.includes('aircraft') ||
          normalizedType.includes('subscription') ||
          normalizedDescription.includes('subscription creation') ||
          normalizedDescription.includes('suscripcion')

        if (!looksLikeAircraftSubscription) return false

        if (selectedPaymentsAircraftId.value && Number(selectedPaymentsAircraftId.value) === Number(item.id)) {
          return true
        }

        return aircraft.value.length === 1
      }) ||
      null
    const renewalMeta = getAircraftRenewalMeta(item, relatedPayment)

  return {
      id: item.id,
      aircraftId: item.id,
      aircraft: item.name,
      registration: item.registration || 'Sin matricula',
      base: item.base || 'Sin base',
      status: billingMeta.label,
      tone: billingMeta.tone,
      amount: providerAircraftBillingAmount.value,
      amountLabel: formatCurrency(
        providerAircraftBillingAmount.value,
        providerAircraftBillingCurrency.value,
      ),
      description:
        relatedPayment?.description ||
        `Suscripcion mensual de ${item.name}${item.registration ? ` · ${item.registration}` : ''}`,
      reference:
        relatedPayment?.reference || item.paymentReference || item.subscriptionReference || 'Pendiente',
      displayReference: compactBillingReference(
        relatedPayment?.reference || item.paymentReference || item.subscriptionReference || 'Pendiente',
      ),
      paymentMethod: relatedPayment?.paymentMethod || 'Stripe Checkout',
      paymentStatus: relatedPayment?.status || billingMeta.label,
      lastPaymentAt: relatedPayment?.completedAt || item.lastPaymentAt || '',
      subscriptionEndsAt: item.subscriptionEndsAt || '',
      providerSubscriptionId:
        relatedPayment?.providerSubscriptionId || item.providerSubscriptionId || '',
      displayProviderSubscriptionId: compactBillingReference(
        relatedPayment?.providerSubscriptionId || item.providerSubscriptionId || '',
      ),
      providerCheckoutId:
        relatedPayment?.providerCheckoutId || item.providerCheckoutId || '',
      displayProviderCheckoutId: compactBillingReference(
        relatedPayment?.providerCheckoutId || item.providerCheckoutId || '',
      ),
      autoRenewEnabled: renewalMeta.autoRenewEnabled,
      paymentMethodReady: renewalMeta.paymentMethodReady,
      renewalMode: renewalMeta.mode,
      renewalModeLabel: renewalMeta.modeLabel,
      renewalReminderLabel: renewalMeta.reminderLabel,
      renewalReminderDetail: renewalMeta.reminderDetail,
      renewalTone: renewalMeta.tone,
      daysUntilExpiry: renewalMeta.daysUntilExpiry,
      canRenewNow: renewalMeta.canRenewNow,
      isRenewalUrgent: renewalMeta.isUrgent,
      flowDetail: billingMeta.detail,
      hasPaymentRecord: Boolean(relatedPayment),
      action: billingMeta.action,
    }
  }),
)

const filteredAircraftPaymentRows = computed(() => {
  if (!selectedPaymentsAircraftId.value) return aircraftPaymentRows.value

  return aircraftPaymentRows.value.filter(
    (item) => Number(item.aircraftId) === Number(selectedPaymentsAircraftId.value),
  )
})

const selectedAircraftPaymentTimeline = computed(() => {
  const aircraftId = Number(selectedPaymentsAircraftId.value || 0)
  if (!aircraftId) return []

  return aircraftSubscriptionPayments.value
    .filter((payment) => Number(payment.aircraftId || 0) === aircraftId)
    .sort((left, right) => {
      const leftTime = new Date(left.rawCreatedAt || left.completedAt || 0).getTime()
      const rightTime = new Date(right.rawCreatedAt || right.completedAt || 0).getTime()
      return rightTime - leftTime || Number(right.id || 0) - Number(left.id || 0)
    })
})

const latestSelectedAircraftPayment = computed(() => selectedAircraftPaymentTimeline.value[0] || null)

const aircraftPaymentsPending = computed(
  () => aircraftPaymentRows.value.filter((item) => item.action === 'pay').length,
)

const aircraftPaymentsActive = computed(
  () => aircraftPaymentRows.value.filter((item) => item.tone === 'success').length,
)

const aircraftRenewalsNeedingAction = computed(
  () => aircraftPaymentRows.value.filter((item) => item.canRenewNow && !item.autoRenewEnabled).length,
)

const aircraftAutoRenewActive = computed(
  () => aircraftPaymentRows.value.filter((item) => item.autoRenewEnabled).length,
)

const operationalPayments = computed(() =>
  payments.value.filter((payment) => !payment.isAircraftSubscription),
)

const paymentHistoryFeed = computed(() =>
  [...payments.value].sort((left, right) => {
    const leftTime = new Date(left.rawCreatedAt || left.completedAt || 0).getTime()
    const rightTime = new Date(right.rawCreatedAt || right.completedAt || 0).getTime()
    return rightTime - leftTime || Number(right.id || 0) - Number(left.id || 0)
  }),
)

const pendingPaymentRecords = computed(() => {
  const operationPending = operationalPayments.value
    .filter((payment) => payment.statusNormalized !== 'paid')
    .map((payment) => ({
      id: `operation-${payment.id}`,
      kind: 'operation',
      title: payment.flight,
      subtitle: payment.description,
      amountLabel: payment.amount,
      status: payment.status,
      tone:
        payment.statusNormalized === 'pending'
          ? 'warning'
          : payment.statusNormalized === 'failed'
            ? 'danger'
            : 'info',
      detail: payment.completedAt,
      actionLabel: 'Ver liquidacion',
      targetTab: 'operations',
    }))

  const aircraftPending = aircraftPaymentRows.value
    .filter((item) => item.action === 'pay' || item.isRenewalUrgent || item.canRenewNow)
    .map((item) => ({
      id: `aircraft-${item.aircraftId}`,
      kind: 'aircraft',
      title: item.aircraft,
      subtitle: item.base,
      amountLabel: `${item.amountLabel} / mes`,
      status: item.autoRenewEnabled ? item.renewalModeLabel : item.status,
      tone: item.autoRenewEnabled ? item.renewalTone : item.tone,
      detail: item.renewalReminderLabel || (item.subscriptionEndsAt
        ? `Vence ${formatDateCompact(item.subscriptionEndsAt)}`
        : 'Pendiente de activar'),
      actionLabel: item.canRenewNow ? 'Renovar aeronave' : 'Ver aeronave',
      targetTab: 'aircraft',
      aircraftId: item.aircraftId,
    }))

  return [...operationPending, ...aircraftPending]
})

const paymentExecutiveSummary = computed(() => {
  const now = new Date()
  const paidThisMonth = paymentHistoryFeed.value
    .filter((payment) => {
      if (payment.statusNormalized !== 'paid') return false
      const date = new Date(payment.paidAt || payment.rawCreatedAt || payment.completedAt || '')
      return !Number.isNaN(date.getTime()) && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
    })
    .reduce((total, payment) => total + Number(payment.amountValue || 0), 0)
  const paidThisMonthCurrency =
    paymentHistoryFeed.value.find((payment) => payment.statusNormalized === 'paid')?.currency ||
    providerAircraftBillingCurrency.value

  const pendingTotal = pendingPaymentRecords.value.reduce((total, item) => {
    const numeric = Number(String(item.amountLabel || '').replace(/[^0-9.-]+/g, ''))
    return total + (Number.isFinite(numeric) ? numeric : 0)
  }, 0)

  const renewalsSoon = aircraftPaymentRows.value.filter((item) => {
    if (!item.subscriptionEndsAt) return false
    const expiration = new Date(item.subscriptionEndsAt)
    if (Number.isNaN(expiration.getTime())) return false
    const diffDays = Math.ceil((expiration.getTime() - now.getTime()) / 86400000)
    return diffDays >= 0 && diffDays <= 45
  }).length

  return [
    {
      id: 'paid-month',
      icon: '💰',
      label: 'Cobrado este mes',
      value: formatCurrency(paidThisMonth, paidThisMonthCurrency),
      detail: `${paymentHistoryFeed.value.filter((item) => item.statusNormalized === 'paid').length} cobro(s) confirmados.`,
      tone: 'success',
    },
    {
      id: 'pending-total',
      icon: '⚠️',
      label: 'Pagos pendientes',
      value: formatCurrency(pendingTotal, providerAircraftBillingCurrency.value),
      detail: `${pendingPaymentRecords.value.length} seguimiento(s) por liberar.`,
      tone: pendingPaymentRecords.value.length ? 'warning' : 'success',
    },
    {
      id: 'aircraft-active',
      icon: '✈️',
      label: 'Aeronaves activas',
      value: String(aircraftPaymentsActive.value),
      detail: `${aircraftPaymentRows.value.length} aeronave(s) monitoreadas en total.`,
      tone: aircraftPaymentsActive.value ? 'info' : 'neutral',
    },
    {
      id: 'renewals',
      icon: '📈',
      label: 'Renovaciones proximas',
      value: String(renewalsSoon),
      detail: `${aircraftAutoRenewActive.value} con autopago y ${aircraftRenewalsNeedingAction.value} por revisar manualmente.`,
      tone: renewalsSoon ? 'warning' : 'success',
    },
    {
      id: 'balance',
      icon: 'BAL',
      label: 'Balance',
      value: formatCurrency(Math.max(paidThisMonth - pendingTotal, 0), paidThisMonthCurrency),
      detail: 'Balance operativo estimado con datos visibles.',
      tone: pendingTotal ? 'warning' : 'success',
    },
  ]
})

const paymentRevenueOverview = computed(() => {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)
  const paidRecords = paymentHistoryFeed.value.filter((payment) => payment.statusNormalized === 'paid')
  const currency = paidRecords[0]?.currency || providerAircraftBillingCurrency.value

  const thisMonth = paidRecords.reduce((total, payment) => {
    const date = new Date(payment.paidAt || payment.rawCreatedAt || payment.completedAt || '')
    if (Number.isNaN(date.getTime())) return total
    if (date.getMonth() !== now.getMonth() || date.getFullYear() !== now.getFullYear()) return total
    return total + Number(payment.amountValue || 0)
  }, 0)

  const lastThirtyDays = paidRecords.reduce((total, payment) => {
    const date = new Date(payment.paidAt || payment.rawCreatedAt || payment.completedAt || '')
    if (Number.isNaN(date.getTime()) || date < thirtyDaysAgo) return total
    return total + Number(payment.amountValue || 0)
  }, 0)

  const upcomingCharges = aircraftPaymentRows.value.filter((item) => item.subscriptionEndsAt).length
  const renewalCount = aircraftPaymentRows.value.filter((item) => item.canRenewNow || item.autoRenewEnabled).length
  const maxValue = Math.max(
    thisMonth,
    lastThirtyDays,
    upcomingCharges * providerAircraftBillingAmount.value,
    renewalCount * providerAircraftBillingAmount.value,
    1,
  )

  return [
    {
      id: 'month',
      label: 'Este mes',
      value: formatCurrency(thisMonth, currency),
      percent: Math.max(8, Math.round((thisMonth / maxValue) * 100)),
    },
    {
      id: 'last30',
      label: 'Ultimos 30 dias',
      value: formatCurrency(lastThirtyDays, currency),
      percent: Math.max(8, Math.round((lastThirtyDays / maxValue) * 100)),
    },
    {
      id: 'upcoming',
      label: 'Proximos cobros',
      value: String(upcomingCharges),
      percent: Math.max(8, Math.round(((upcomingCharges * providerAircraftBillingAmount.value) / maxValue) * 100)),
    },
    {
      id: 'renewals',
      label: 'Renovaciones',
      value: String(renewalCount),
      percent: Math.max(8, Math.round(((renewalCount * providerAircraftBillingAmount.value) / maxValue) * 100)),
    },
  ]
})

const renewalCenterRows = computed(() =>
  aircraftPaymentRows.value
    .filter((item) => item.subscriptionEndsAt || item.canRenewNow || item.autoRenewEnabled)
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      aircraft: item.aircraft,
      date: item.subscriptionEndsAt ? formatDateCompact(item.subscriptionEndsAt) : 'Sin fecha visible',
      status: item.renewalModeLabel,
      amount: item.amountLabel,
      tone: item.renewalTone,
    })),
)

const providerPaymentProfile = computed(() => {
  const rawName = providerName.value || 'Empresa operadora'
  const lastAccessRaw =
    auth.user?.last_login_at ||
    auth.user?.last_access_at ||
    auth.user?.updated_at ||
    auth.user?.created_at ||
    ''

  return {
    initials: rawName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((chunk) => chunk[0]?.toUpperCase() || '')
      .join('') || 'PR',
    company: company.tradeName || company.legalName || rawName,
    roleLabel: auth.user?.role_name || 'Proveedor',
    verification: companyStatusMeta.value.tone === 'success' ? 'Proveedor validado por admin' : 'Pendiente de revision admin',
    lastAccess: formatRelativeAccessLabel(lastAccessRaw),
    onlineLabel: loading.value ? 'Sincronizando' : 'Online',
  }
})

const paymentTabs = computed(() => [
  { id: 'operations', label: 'Liquidaciones', count: operationalPayments.value.length },
  { id: 'aircraft', label: 'Aeronaves', count: aircraftPaymentRows.value.length },
  { id: 'pending', label: 'Pagos pendientes', count: pendingPaymentRecords.value.length },
  { id: 'history', label: 'Historial', count: paymentHistoryFeed.value.length },
])

const showAircraftPaymentsTable = computed(() => filteredAircraftPaymentRows.value.length > 20)

const selectedPaymentTimeline = computed(() => {
  if (selectedAircraftPaymentTimeline.value.length) {
    const events = selectedAircraftPaymentTimeline.value.map((payment) => ({
      id: `paid-${payment.id}`,
      title:
        payment.statusNormalized === 'paid'
          ? 'Pago realizado'
          : payment.statusNormalized === 'pending'
            ? 'Cobro pendiente'
            : 'Evento de cobro',
      date: formatDateCompact(payment.paidAt || payment.rawCreatedAt || payment.completedAt),
      detail: payment.description || payment.amount,
      state: payment.statusNormalized === 'paid' ? 'done' : 'upcoming',
    }))

    const targetRow = filteredAircraftPaymentRows.value[0]
    if (targetRow?.subscriptionEndsAt) {
      events.push({
        id: `next-${targetRow.aircraftId}`,
        title: 'Proximo cobro',
        date: formatDateCompact(targetRow.subscriptionEndsAt),
        detail: `${targetRow.amountLabel} / mes`,
        state: 'upcoming',
      })
    }

    events.push({
      id: `mode-${targetRow?.aircraftId || 'general'}`,
      title: targetRow?.autoRenewEnabled ? 'Renovacion automatica activa' : 'Renovacion manual requerida',
      date: targetRow?.subscriptionEndsAt ? formatDateCompact(targetRow.subscriptionEndsAt) : 'Sin fecha visible',
      detail: targetRow?.renewalReminderDetail || 'Sin detalle visible',
      state: targetRow?.autoRenewEnabled ? 'done' : 'current',
    })

    return events
  }

  if (filteredAircraftPaymentRows.value[0]) {
    const targetRow = filteredAircraftPaymentRows.value[0]
    return [
      {
        id: `created-${targetRow.aircraftId}`,
        title: 'Suscripcion creada',
        date: targetRow.lastPaymentAt ? formatDateCompact(targetRow.lastPaymentAt) : 'Pendiente',
        detail: targetRow.flowDetail,
        state: targetRow.hasPaymentRecord ? 'done' : 'upcoming',
      },
      {
        id: `renewal-${targetRow.aircraftId}`,
        title: 'Proximo cobro',
        date: targetRow.subscriptionEndsAt ? formatDateCompact(targetRow.subscriptionEndsAt) : 'Sin fecha visible',
        detail: `${targetRow.amountLabel} / mes`,
        state: 'upcoming',
      },
      {
        id: `mode-${targetRow.aircraftId}`,
        title: targetRow.autoRenewEnabled ? 'Renovacion automatica activa' : 'Renovacion manual requerida',
        date: targetRow.subscriptionEndsAt ? formatDateCompact(targetRow.subscriptionEndsAt) : 'Sin fecha visible',
        detail: targetRow.renewalReminderDetail,
        state: targetRow.autoRenewEnabled ? 'done' : 'current',
      },
    ]
  }

  return paymentHistoryFeed.value.slice(0, 6).map((payment) => ({
    id: `history-${payment.id}`,
    title: payment.statusNormalized === 'paid' ? 'Pago realizado' : payment.status,
    date: formatDateCompact(payment.paidAt || payment.rawCreatedAt || payment.completedAt),
    detail: payment.description || payment.amount,
    state: payment.statusNormalized === 'paid' ? 'done' : 'upcoming',
  }))
})

const providerOpenIncidents = computed(() =>
  incidents.value.filter((item) => !['Resuelta', 'Cerrada'].includes(item.status)),
)

const isIncidentsSectionLoading = computed(
  () => props.section === 'incidencias' && loading.value && !sectionLoadState.incidencias,
)

const OPERATOR_SECTION_LOADING_COPY = {
  aeronaves: {
    eyebrow: 'Flota',
    title: 'Cargando aeronaves',
    detail: 'Estamos sincronizando inventario, estatus y datos operativos de la flota.',
  },
  costos: {
    eyebrow: 'Pricing',
    title: 'Cargando costos base',
    detail: 'Estamos preparando costos operativos, pricing y referencias por aeronave.',
  },
  disponibilidad: {
    eyebrow: 'Agenda',
    title: 'Cargando disponibilidad',
    detail: 'Estamos reuniendo bloqueos, ventanas y agenda operativa del proveedor.',
  },
  'release-provider': {
    eyebrow: 'Liberacion',
    title: 'Cargando liberacion operativa',
    detail: 'Estamos reuniendo solicitud, aeronave y contexto operativo para autorizar el vuelo.',
  },
  empresa: {
    eyebrow: 'Empresa',
    title: 'Cargando perfil corporativo',
    detail: 'Estamos sincronizando identidad, validacion y configuracion de empresa.',
  },
  operaciones: {
    eyebrow: 'Operaciones',
    title: 'Cargando operaciones',
    detail: 'Estamos preparando el seguimiento vivo de vuelos, etapas y trazabilidad.',
  },
  solicitudes: {
    eyebrow: 'Solicitudes',
    title: 'Cargando solicitudes',
    detail: 'Estamos sincronizando oportunidades activas y el backlog operativo del proveedor.',
  },
  incidencias: {
    eyebrow: 'Incidencias',
    title: 'Cargando incidencias',
    detail: 'Estamos reuniendo reportes, prioridades, responsables y seguimiento operativo.',
  },
  pagos: {
    eyebrow: 'Pagos',
    title: 'Cargando pagos',
    detail: 'Estamos sincronizando cobros, conciliacion y movimientos operativos del proveedor.',
  },
  historial: {
    eyebrow: 'Historial',
    title: 'Cargando historial',
    detail: 'Estamos preparando el registro historico de operaciones y actividad reciente.',
  },
  configuracion: {
    eyebrow: 'Configuracion',
    title: 'Cargando configuracion',
    detail: 'Estamos preparando parametros, alertas y preferencias del operador.',
  },
}

const operatorRouteSectionLoadingVisible = computed(() => {
  const normalizedSection = normalizeSectionKey(props.section)
  if (!loading.value || normalizedSection === 'dashboard') return false

  return Boolean(
    OPERATOR_SECTION_LOADING_COPY[normalizedSection] &&
      Object.prototype.hasOwnProperty.call(sectionLoadState, normalizedSection) &&
      !sectionLoadState[normalizedSection],
  )
})

const operatorRouteSectionLoadingMeta = computed(() => {
  const normalizedSection = normalizeSectionKey(props.section)
  return (
    OPERATOR_SECTION_LOADING_COPY[normalizedSection] || {
      eyebrow: 'Portal operador',
      title: 'Cargando seccion',
      detail: 'Estamos preparando la siguiente vista operativa.',
    }
  )
})

const providerPendingRequestRecords = computed(() =>
  requests.value.filter((item) => getRequestStatusMeta(item).queue === 'new'),
)

const providerUpcomingOperations = computed(() =>
  [...operations.value]
    .filter((item) => !['Finalizada', 'Cancelada'].includes(item.status))
    .sort((left, right) => {
      const leftDate = parseOperationalDate(left.departure) || parseOperationalDate(left.arrival)
      const rightDate = parseOperationalDate(right.departure) || parseOperationalDate(right.arrival)

      if (leftDate && rightDate) return leftDate.getTime() - rightDate.getTime()
      if (leftDate) return -1
      if (rightDate) return 1
      return Number(left.id || 0) - Number(right.id || 0)
    })
    .slice(0, 4),
)

const providerNextOperation = computed(() => providerUpcomingOperations.value[0] || null)

const flightTrackingOperations = computed(() =>
  [...operations.value].sort((left, right) => {
    const leftDate = parseOperationalDate(left.departure) || parseOperationalDate(left.arrival)
    const rightDate = parseOperationalDate(right.departure) || parseOperationalDate(right.arrival)

    if (leftDate && rightDate) return leftDate.getTime() - rightDate.getTime()
    if (leftDate) return -1
    if (rightDate) return 1
    return Number(left.id || 0) - Number(right.id || 0)
  }),
)

const selectedTrackingOperation = computed(() => {
  if (!flightTrackingOperations.value.length) return null
  return (
    flightTrackingOperations.value.find(
      (operation) => String(operation.id || '') === String(selectedOperationId.value || ''),
    ) || flightTrackingOperations.value[0]
  )
})

const flightTrackingKpis = computed(() => {
  const todayLabel = formatDateCompact(new Date())
  const active = operations.value.filter((item) => !['Finalizada', 'Cancelada'].includes(item.status))
  const enRoute = operations.value.filter((item) => normalizeFlightTrackingStatus(item).id === 'enroute')
  const upcoming = operations.value.filter((item) => normalizeFlightTrackingStatus(item).id === 'preparation')
  const finishedToday = operations.value.filter((item) => {
    if (normalizeFlightTrackingStatus(item).id !== 'finished') return false
    const completed = item.crewServiceCompletedAt || item.arrival || item.departure
    return completed ? formatDateCompact(completed) === todayLabel : false
  })
  const issueCount = operations.value.filter((item) => normalizeFlightTrackingStatus(item).id === 'delayed').length

  return [
    { label: 'Vuelos activos', value: String(active.length), detail: 'Operaciones en seguimiento', tone: 'info' },
    { label: 'En ruta', value: String(enRoute.length), detail: 'Vuelos actualmente activos', tone: 'success' },
    { label: 'Proximos despegues', value: String(upcoming.length), detail: 'Preparacion y confirmados', tone: 'warning' },
    { label: 'Finalizados hoy', value: String(finishedToday.length), detail: 'Cierres operativos del dia', tone: 'neutral' },
    { label: 'Incidencias', value: String(issueCount), detail: 'Vuelos con riesgo operativo', tone: issueCount ? 'danger' : 'success' },
  ]
})

const selectedTrackingOperationFacts = computed(() => {
  const operation = selectedTrackingOperation.value
  if (!operation) return []

  return [
    { label: 'Ruta', value: operation.route || 'Ruta pendiente' },
    { label: 'Aeronave', value: operation.aircraft || 'Aeronave por definir' },
    { label: 'Cliente', value: getOperationClientLabel(operation) },
    { label: 'Pasajeros', value: String(getOperationPassengerCount(operation)) },
  ]
})

const selectedTrackingTimeline = computed(() => {
  const operation = selectedTrackingOperation.value
  if (!operation) return []
  const status = normalizeFlightTrackingStatus(operation).id

  return [
    { id: 'reservation', label: 'Reserva', state: 'done' },
    { id: 'contract', label: 'Contrato', state: 'done' },
    { id: 'payment', label: 'Pago', state: 'done' },
    { id: 'release', label: 'Liberacion', state: status === 'preparation' ? 'active' : 'done' },
    { id: 'flight', label: 'Vuelo', state: ['enroute', 'delayed'].includes(status) ? 'active' : status === 'finished' ? 'done' : 'pending' },
    { id: 'tracking', label: 'Tracking', state: status === 'enroute' ? 'active' : status === 'finished' ? 'done' : 'pending' },
    { id: 'close', label: 'Cierre', state: status === 'finished' ? 'done' : 'pending' },
  ]
})

const selectedTrackingDetails = computed(() => {
  const operation = selectedTrackingOperation.value
  if (!operation) return []

  return [
    { label: 'Salida programada', value: formatDateTimeDisplay(operation.departure) },
    { label: 'Salida real', value: operation.crewServiceStartedAt ? formatDateTimeDisplay(operation.crewServiceStartedAt) : 'Pendiente' },
    { label: 'Llegada estimada', value: formatDateTimeDisplay(operation.arrival) },
    { label: 'Llegada real', value: operation.crewServiceCompletedAt ? formatDateTimeDisplay(operation.crewServiceCompletedAt) : 'Pendiente' },
    { label: 'Tripulacion', value: operation.crew || 'Por definir' },
    { label: 'Handling', value: operation.raw?.fbo || operation.raw?.handling || 'Coordinacion administrativa' },
    { label: 'FBO', value: operation.raw?.fbo || 'Pendiente' },
    { label: 'Concierge', value: operation.raw?.concierge || 'Coordinado por la plataforma' },
  ]
})

const selectedTrackingEvents = computed(() => buildFlightTrackingEvents(selectedTrackingOperation.value))

const providerIncidentOperationOptions = computed(() =>
  operations.value.map((item) => ({
    id: String(item.id || ''),
    requestId: String(item.requestId || ''),
    route: item.route || item.flight || '',
    label: `${item.route || item.flight || `Operacion #${item.id}`} · ${item.status || 'Pendiente'}`,
  })),
)

const providerOperationalSummary = computed(() => {
  const nextPendingRequest = providerPendingRequestRecords.value[0] || null

  return [
    {
      label: 'Aeronaves activas',
      value: String(activeAircraft.value),
      detail: `${aircraft.value.length} registradas en el portal proveedor.`,
    },
    {
      label: 'Solicitudes pendientes',
      value: String(pendingRequests.value),
      detail: nextPendingRequest
        ? getRequestRouteLabel(nextPendingRequest)
        : 'Sin solicitudes nuevas por atender.',
    },
    {
      label: 'Operaciones proximas',
      value: String(providerUpcomingOperations.value.length),
      detail: providerNextOperation.value
        ? `${providerNextOperation.value.route} · ${formatDateTimeDisplay(providerNextOperation.value.departure)}`
        : 'Sin operaciones confirmadas visibles.',
    },
    {
      label: 'Incidencias abiertas',
      value: String(providerOpenIncidents.value.length),
      detail: providerOpenIncidents.value.length
        ? 'Requieren respuesta operativa coordinada por la plataforma.'
        : 'No hay incidencias activas en seguimiento.',
    },
  ]
})

const lastResolvedIncident = computed(() =>
  [...incidents.value]
    .filter((incident) => isIncidentResolved(incident.status))
    .sort((left, right) => {
      const leftTime = new Date(left.updatedAt || left.createdAt || 0).getTime()
      const rightTime = new Date(right.updatedAt || right.createdAt || 0).getTime()
      return rightTime - leftTime || Number(right.id || 0) - Number(left.id || 0)
    })[0] || null,
)

const operationsStableState = computed(() => {
  const resolved = lastResolvedIncident.value
  const referenceDate = resolved?.updatedAt || resolved?.createdAt || ''
  const parsed = referenceDate ? new Date(referenceDate) : null
  const daysWithoutIncidents =
    parsed && !Number.isNaN(parsed.getTime())
      ? Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86400000))
      : null

  return {
    lastResolved: resolved
      ? `${resolved.type} - ${formatDateTimeDisplay(referenceDate)}`
      : 'Sin incidencias recientes',
    timeWithoutIncidents:
      daysWithoutIncidents === null
        ? 'Sin incidencias activas'
        : `${daysWithoutIncidents} dia(s) sin incidencias`,
    generalStatus: providerOpenIncidents.value.length ? 'Seguimiento activo' : 'Operacion estable',
  }
})

const operationalAlerts = computed(() => [
  {
    id: 'expirations',
    label: 'Vencimientos proximos',
    value: aircraftDueDocuments.value ? `${aircraftDueDocuments.value} doc(s)` : 'Sin vencimientos',
    detail: 'Documentos con vigencia dentro de 30 dias.',
    tone: aircraftDueDocuments.value ? 'warning' : 'success',
  },
  {
    id: 'documents',
    label: 'Documentos',
    value: company.documents.length ? `${company.documents.length} activos` : 'Por cargar',
    detail: 'Expediente legal y operativo del proveedor.',
    tone: company.documents.length ? 'success' : 'warning',
  },
  {
    id: 'maintenance',
    label: 'Mantenimiento',
    value: String(availability.value.filter((item) => getAvailabilityStatusMeta(item.status).tone === 'warning').length),
    detail: 'Ventanas tecnicas registradas en disponibilidad.',
    tone: availability.value.some((item) => getAvailabilityStatusMeta(item.status).tone === 'warning') ? 'warning' : 'success',
  },
  {
    id: 'availability',
    label: 'Disponibilidad',
    value: `${aircraftAvailableToday.value}/${aircraft.value.length || 0}`,
    detail: 'Aeronaves disponibles para coordinacion inmediata.',
    tone: aircraftAvailableToday.value ? 'success' : 'info',
  },
  {
    id: 'permits',
    label: 'Permisos',
    value: companyStatusMeta.value.label,
    detail: 'Validacion general de empresa y permisos visibles.',
    tone: companyStatusMeta.value.tone,
  },
])

const operationalActivityTimeline = computed(() => {
  const entries = history.value.slice(0, 4).map((entry) => ({
    id: `history-${entry.id}`,
    time: formatOperationalTimelineTime(entry.date),
    title: entry.action,
    detail: entry.module || entry.actor,
  }))

  if (entries.length) return entries

  return [
    { id: 'fallback-operator', time: '09:00', title: 'Revision administrativa', detail: companyStatusMeta.value.label },
    { id: 'fallback-availability', time: '09:15', title: 'Disponibilidad actualizada', detail: `${availabilityReadyCount.value} aeronave(s) listas` },
    { id: 'fallback-aircraft', time: '10:20', title: 'Aeronave registrada', detail: `${aircraft.value.length} en flota` },
    { id: 'fallback-coordination', time: '11:40', title: 'Coordinacion completada', detail: 'Centro operacional en espera activa' },
  ]
})

const operationalQuickActions = computed(() => [
  { id: 'aircraft', label: 'Registrar aeronave', detail: 'Alta y expediente de flota', section: 'aeronaves' },
  { id: 'availability', label: 'Actualizar disponibilidad', detail: 'Agenda, ventanas y bloqueos', section: 'disponibilidad' },
  { id: 'requests', label: 'Ver solicitudes', detail: `${pendingRequests.value} pendientes`, section: 'solicitudes' },
  { id: 'block', label: 'Crear bloqueo', detail: 'Reservar ventana operacional', section: 'disponibilidad' },
  { id: 'docs', label: 'Revisar documentacion', detail: `${aircraftDueDocuments.value} vencimiento(s)`, section: 'empresa' },
])

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

const documentLibraryCategoryOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'certificates', label: 'Certificados' },
  { value: 'operation', label: 'Operacion' },
  { value: 'legal', label: 'Legal' },
  { value: 'insurance', label: 'Seguro' },
  { value: 'commercial', label: 'Comercial' },
  { value: 'other', label: 'Otros' },
]

const documentLibraryStateOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'valid', label: 'Vigente' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'review', label: 'En revision' },
  { value: 'expired', label: 'Vencido' },
  { value: 'no_expiry', label: 'Sin vencimiento' },
]

const documentLibrarySortOptions = [
  { value: 'recent', label: 'Mas recientes' },
  { value: 'oldest', label: 'Mas antiguos' },
  { value: 'name_asc', label: 'Nombre A-Z' },
  { value: 'name_desc', label: 'Nombre Z-A' },
  { value: 'expiry_soon', label: 'Proximos a vencer' },
]

const storedAircraftDocuments = computed(() =>
  (selectedDocumentAircraft.value?.documents || []).map((document, index) =>
    normalizeStoredDocument(document, index),
  ),
)

const documentLibrarySummary = computed(() => {
  const documents = storedAircraftDocuments.value
  const valid = documents.filter((document) => document.stateMeta.key === 'valid').length
  const pending = documents.filter((document) =>
    ['pending', 'review'].includes(document.stateMeta.key),
  ).length
  const expired = documents.filter((document) => document.stateMeta.key === 'expired').length

  return {
    total: documents.length,
    valid,
    pending,
    expired,
  }
})

const filteredStoredAircraftDocuments = computed(() => {
  const query = String(documentLibrarySearch.value || '').trim().toLowerCase()

  return [...storedAircraftDocuments.value]
    .filter((document) => {
      const matchesQuery =
        !query ||
        [
          document.name,
          document.typeLabel,
          document.categoryLabel,
          document.fileExtension,
          document.stateMeta.label,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query))

      const matchesCategory =
        documentLibraryCategory.value === 'all' || document.categoryId === documentLibraryCategory.value

      const matchesState =
        documentLibraryState.value === 'all' || document.stateMeta.key === documentLibraryState.value

      return matchesQuery && matchesCategory && matchesState
    })
    .sort((left, right) => {
      if (documentLibrarySort.value === 'oldest') {
        return new Date(left.updatedAt || left.uploadedAt || 0).getTime() - new Date(right.updatedAt || right.uploadedAt || 0).getTime()
      }

      if (documentLibrarySort.value === 'name_asc') {
        return String(left.name || '').localeCompare(String(right.name || ''), 'es', { sensitivity: 'base' })
      }

      if (documentLibrarySort.value === 'name_desc') {
        return String(right.name || '').localeCompare(String(left.name || ''), 'es', { sensitivity: 'base' })
      }

      if (documentLibrarySort.value === 'expiry_soon') {
        const leftHasExpiry = left.expiresAt ? 1 : 0
        const rightHasExpiry = right.expiresAt ? 1 : 0
        if (leftHasExpiry !== rightHasExpiry) return rightHasExpiry - leftHasExpiry

        const leftExpiry = new Date(left.expiresAt || '2999-12-31').getTime()
        const rightExpiry = new Date(right.expiresAt || '2999-12-31').getTime()
        return leftExpiry - rightExpiry
      }

      return new Date(right.updatedAt || right.uploadedAt || 0).getTime() - new Date(left.updatedAt || left.uploadedAt || 0).getTime()
    })
})

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
  aprobadas: countAircraftByOperationalTab(aircraft.value, 'active'),
  revision: countAircraftByOperationalTab(aircraft.value, 'review'),
  bloqueadas: countAircraftByOperationalTab(aircraft.value, 'inactive'),
  archivo: countAircraftByOperationalTab(aircraft.value, 'hidden'),
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
    status: companyAdminDecisionCopy.value.title,
    detail: companyAdminDecisionCopy.value.detail,
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
  () => countAircraftByOperationalTab(aircraft.value, 'active'),
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

const aircraftCatalogBaseOptions = computed(() => [
  { value: 'all', label: 'Todas las bases' },
  ...[...new Set(aircraft.value.map((item) => String(item.base || '').trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'es'))
    .map((value) => ({ value, label: value })),
])

const aircraftCatalogCategoryOptions = computed(() => [
  { value: 'all', label: 'Todas las categorias' },
  ...[...new Set(aircraft.value.map((item) => String(item.category || '').trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'es'))
    .map((value) => ({ value, label: value })),
])

function getAircraftCatalogStatusKey(item = {}) {
  return getAircraftPortalState(item).tab || getAircraftOperationalTabKey(item)
}

const aircraftCatalogStatusTabs = computed(() => {
  const definitions = [
    { id: 'all', label: 'Todas' },
    { id: 'active', label: 'Activas' },
    { id: 'pending_payment', label: 'Pendientes de pago' },
    { id: 'review', label: 'En revision' },
    { id: 'hidden', label: 'Ocultas' },
    { id: 'inactive', label: 'Inactivas' },
  ]

  return definitions.map((tab) => ({
    ...tab,
    count:
      tab.id === 'pending_payment'
        ? aircraft.value.filter((item) => getAircraftCatalogStatusKey(item) === tab.id).length
        : countAircraftByOperationalTab(aircraft.value, tab.id),
  }))
})

const filteredAircraftCatalog = computed(() => {
  const query = String(aircraftCatalogSearch.value || '').trim().toLowerCase()

  return aircraft.value
    .filter((item) => {
      const matchesSearch =
        !query ||
        [
          item.name,
          item.registration,
          item.base,
          item.category,
          item.manufacturer,
          humanizeAircraftStatus(item.status),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query))

      const matchesStatus =
        aircraftCatalogStatus.value === 'pending_payment'
          ? getAircraftCatalogStatusKey(item) === 'pending_payment'
          : aircraftMatchesOperationalTab(item, aircraftCatalogStatus.value)

      const matchesBase =
        aircraftCatalogBase.value === 'all' || String(item.base || '') === aircraftCatalogBase.value

      const matchesCategory =
        aircraftCatalogCategory.value === 'all' || String(item.category || '') === aircraftCatalogCategory.value

      return matchesSearch && matchesStatus && matchesBase && matchesCategory
    })
    .sort((current, next) => {
      const currentLabel = String(current.name || current.model || current.registration || '').trim()
      const nextLabel = String(next.name || next.model || next.registration || '').trim()

      return (
        currentLabel.localeCompare(nextLabel, 'es', { sensitivity: 'base' }) ||
        String(current.registration || '').localeCompare(String(next.registration || ''), 'es', {
          sensitivity: 'base',
        })
      )
    })
})

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

const aircraftWizardCurrentStepMeta = computed(
  () =>
    aircraftWizardSteps.find((step) => step.id === aircraftWizardStep.value) ||
    aircraftWizardSteps[0],
)

const aircraftWizardCompletion = computed(() => {
  const total = aircraftWizardSteps.length || 1
  return Math.round((aircraftWizardStep.value / total) * 100)
})

const aircraftWizardReadyForRegistration = computed(
  () => Object.keys(getAircraftWizardStepErrors(5)).length === 0,
)

const selectedEditingAircraft = computed(
  () => aircraft.value.find((item) => Number(item.id) === Number(editingAircraftId.value || 0)) || null,
)

const aircraftWizardCurrentRecord = computed(() => {
  if (selectedEditingAircraft.value) return selectedEditingAircraft.value

  const scopedAircraftId = Number(imageForm.aircraftId || documentForm.aircraftId || 0)
  if (scopedAircraftId > 0) {
    return aircraft.value.find((item) => Number(item.id) === scopedAircraftId) || null
  }

  return null
})

const aircraftWizardModeMeta = computed(() => {
  if (aircraftWizardReadOnly.value) {
    return {
      label: 'Solo lectura',
      tone: 'neutral',
      detail: 'Vista ejecutiva de expediente, galeria y costos.',
    }
  }

  if (editingAircraftId.value) {
    return {
      label: 'Edicion activa',
      tone: 'warning',
      detail: 'Actualiza datos operativos y vuelve a sincronizar activos.',
    }
  }

  return {
    label: 'Alta nueva',
    tone: 'success',
    detail: 'El proveedor deja la aeronave lista para revision y activacion.',
  }
})

const aircraftWizardReviewState = computed(() =>
  deriveAircraftWizardReviewState({
    aircraftId: aircraftWizardCurrentRecord.value?.id || null,
    aircraftStatus: aircraftWizardCurrentRecord.value?.status || '',
    validationStatus:
      aircraftWizardCurrentRecord.value?.validationStatus ||
      aircraftWizardCurrentRecord.value?.reviewStatus ||
      '',
    rejectionReason:
      aircraftWizardCurrentRecord.value?.rejectionReason ||
      aircraftWizardCurrentRecord.value?.adminNotes ||
      '',
    changesRequestedNotes:
      aircraftWizardCurrentRecord.value?.changesRequestedNotes ||
      aircraftWizardCurrentRecord.value?.adminNotes ||
      '',
    isReadyForRegistration: aircraftWizardReadyForRegistration.value,
  }),
)

const aircraftWizardSnapshot = computed(() => [
  {
    label: 'Modelo',
    value: aircraftForm.name || 'Pendiente',
  },
  {
    label: 'Matricula',
    value: aircraftForm.registration || 'Sin matricula',
  },
  {
    label: 'Base',
    value: aircraftForm.base || 'Sin base definida',
  },
  {
    label: 'Capacidad',
    value: aircraftForm.capacity ? `${aircraftForm.capacity} pax` : 'Pendiente',
  },
  {
    label: 'Precio hora',
    value: Number(aircraftForm.hourlyPrice || 0)
      ? formatCurrency(aircraftForm.hourlyPrice)
      : 'Sin tarifa',
  },
  {
    label: 'Galeria',
    value: `${countSelectedImageFiles()} archivo(s)`,
  },
  {
    label: 'Documentos',
    value: `${documentForm.files.length || selectedDocumentAircraft.value?.documents?.length || 0} registro(s)`,
  },
  {
    label: 'Facturacion',
    value: providerAircraftPlanAmount.value
      ? `${formatCurrency(providerAircraftPlanAmount.value)} / mes`
      : 'Pendiente',
  },
])

const companyReviewFlow = computed(() =>
  buildProviderReviewFlow({
    legal_name: company.legalName,
    company_name: company.tradeName,
    commercial_name: company.tradeName,
    rfc: company.rfc,
    base_airport: company.base,
    address: company.address,
    representative_name: company.legalRepresentative,
    company_phone: company.phone,
    company_email: company.email,
    sat_validation_status: company.satValidationStatus,
    admin_validation_status: company.adminValidationStatus || company.reviewStatus,
    operator_status: company.operatorStatus,
    approval_status: company.approvalStatus || company.status,
    admin_review_submitted_at: company.adminReviewSubmittedAt,
    access_enabled: company.accessEnabled,
    provider_status_summary: company.statusSummary,
    validation_requirements: company.validationRequirements,
    documents: company.documents,
  }),
)

const companyStatusMeta = computed(() => companyReviewFlow.value.statusMeta || resolveProviderStatusMeta({}))

const providerOperationalAccess = computed(() =>
  resolveProviderOperationalAccessState({
    user: auth.user,
    access: auth.access,
    loginContext: auth.loginContext,
    company: {
      id: companyId.value || null,
      provider_id: companyId.value || providerId.value || null,
      adminValidationStatus: company.adminValidationStatus,
      admin_validation_status: company.adminValidationStatus,
      reviewStatus: company.reviewStatus,
      review_status: company.reviewStatus,
      approvalStatus: company.approvalStatus,
      approval_status: company.approvalStatus,
      operatorStatus: company.operatorStatus,
      operator_status: company.operatorStatus,
      accessEnabled: company.accessEnabled,
      access_enabled: company.accessEnabled,
      legalName: company.legalName,
      tradeName: company.tradeName,
      rfc: company.rfc,
    },
    fallbackProviderId: providerId.value,
  }),
)

const isOperationalAccessReady = computed(() => providerOperationalAccess.value.isOperationalReady)

const currentOperationalBlockNotice = computed(() => {
  if (!hasBootstrapped.value && !companyId.value) return null
  if (!OPERATOR_OPERATIONAL_SECTIONS.has(normalizeSectionKey(props.section))) return null
  if (!providerOperationalAccess.value.isBlocked) return null

  return {
    title: providerOperationalAccess.value.title,
    detail: providerOperationalAccess.value.detail,
    tone: providerOperationalAccess.value.tone,
  }
})

const providerIsApproved = computed(() => companyStatusMeta.value.tone === 'success')

const billingDomain = createOperatorPortalBillingDomain({
  formatCurrency,
  formatDateTimeRange,
  providerAircraftPlanAmount,
  isProviderApproved: providerIsApproved,
})

const {
  getAircraftUiState,
  getAircraftRenewalMeta,
  getAircraftBillingStatusMeta,
  isAircraftBillingActive,
} = billingDomain

const providerCanRegisterAircraft = computed(() => company.canRegisterAircraft !== false)
const companyCanSendForReview = computed(() => companyReviewFlow.value.canSubmit && !companyReviewFlow.value.submitted)

const companyRfcIsValid = computed(() => isValidMexicanRfc(companyForm.rfc))

const companyHasIdentityData = computed(
  () =>
    Boolean(
      String(companyForm.legalName || '').trim() &&
        String(companyForm.tradeName || '').trim() &&
        String(companyForm.address || '').trim() &&
        String(companyForm.operationalBase || '').trim(),
    ),
)

const companyHasContactData = computed(
  () => Boolean(String(companyForm.phone || '').trim() && String(companyForm.email || '').trim()),
)

const companySatApproved = computed(() =>
  ['approved', 'aprobado', 'validated', 'validado'].includes(
    String(company.satValidationStatus || '').toLowerCase(),
  ),
)

const companyDocumentsByDefinition = computed(() => {
  const entries = Object.fromEntries(
    companyDocumentDefinitions.map((definition) => [definition.id, null]),
  )

  company.documents.forEach((document) => {
    companyDocumentDefinitions.forEach((definition) => {
      if (!entries[definition.id] && matchesCompanyDocumentDefinition(document, definition)) {
        entries[definition.id] = document
      }
    })
  })

  return entries
})

const companySatDocument = computed(() => companyDocumentsByDefinition.value.sat_certificate || null)

const companyRequiredLegalDocuments = computed(() =>
  companyDocumentDefinitions.filter((definition) => definition.section === 'legal'),
)

const companyMandatoryLegalDocuments = computed(() =>
  companyRequiredLegalDocuments.value.filter((definition) => definition.required !== false),
)

const companyLegalDocumentsComplete = computed(() =>
  companyMandatoryLegalDocuments.value.every((definition) => companyDocumentsByDefinition.value[definition.id]),
)

const companyLegalDocumentsApproved = computed(() =>
  companyMandatoryLegalDocuments.value.every((definition) => {
    const document = companyDocumentsByDefinition.value[definition.id]
    return document && getCompanyDocumentStateTone(document.state) === 'success'
  }),
)

const companyAdminDecisionCopy = computed(() => {
  if (companyReviewFlow.value.status === 'approved' && company.accessEnabled) {
    return {
      title: 'Operador validado por administracion',
      detail: 'Acceso operativo habilitado',
      notes: company.adminNotes || 'La validacion administrativa ya fue aprobada manualmente.',
    }
  }

  if (['submitted', 'under_review'].includes(companyReviewFlow.value.status)) {
    return {
      title: 'Expediente enviado a revision administrativa',
      detail: 'Pendiente de decision admin',
      notes: company.adminNotes || 'El expediente esta en cola de revision administrativa.',
    }
  }

  if (['changes_required', 'changes_requested'].includes(company.adminValidationStatus)) {
    return {
      title: 'Cambios solicitados por administracion',
      detail: 'Acceso operativo deshabilitado hasta corregir el expediente',
      notes: company.changesNotes || company.adminNotes || 'Administracion solicito ajustes antes de validar al operador.',
    }
  }

  if (companyReviewFlow.value.status === 'rejected') {
    return {
      title: 'Expediente rechazado por administracion',
      detail: 'Acceso operativo deshabilitado',
      notes: company.rejectionReason || company.adminNotes || 'La validacion administrativa fue rechazada.',
    }
  }

  return {
    title: 'Expediente pendiente de validacion administrativa',
    detail: 'Readiness en captura; sin aprobacion final aun',
    notes: company.adminNotes || 'Completa el expediente y envialo a revision para que administracion tome la decision final.',
  }
})

const companyRequirementResponses = computed(() =>
  Array.isArray(company.validationRequirements)
    ? company.validationRequirements.filter((item) =>
        ['approved', 'rejected'].includes(String(item.response_status || item.responseStatus || '').toLowerCase()),
      )
    : [],
)

const companyLastAuditDate = computed(() => {
  const latestCompanyEntry = history.value.find((entry) =>
    ['Mi empresa', 'provider_company'].includes(String(entry.module || '')),
  )
  return latestCompanyEntry?.date || 'Sin revision registrada'
})

const companyOperationalBase = computed(() => aircraft.value[0]?.base || company.base || 'Base por definir')

const companyReadinessChecklist = computed(() => {
  const requirementMap = new Map(
    (companyReviewFlow.value.validationRequirements || []).map((item) => [String(item.key || item.id || ''), item]),
  )

  return [
    ['company_identity', 'Datos empresa'],
    ['contact_complete', 'Contacto'],
    ['rfc_valid', 'RFC valido'],
    ['sat_validation', 'Constancia SAT'],
    ['legal_documents_approved', 'Documentacion legal'],
    ['base_operativa', 'Base operativa'],
    ['legal_representative_complete', 'Representante legal'],
    ['review_submitted', 'Expediente enviado a revision'],
  ].map(([key, label]) => {
    const item = requirementMap.get(key) || {}

    return {
      id: key,
      key,
      label,
      complete: Boolean(item.complete),
      pending: !item.complete,
    }
  })
})

const companyOnboardingProgress = computed(() => {
  const completed = companyReadinessChecklist.value.filter((item) => item.complete).length
  const total = companyReadinessChecklist.value.length

  return companyReviewFlow.value.progress
    ? {
        completed,
        total,
        percent: Number(companyReviewFlow.value.progress.percent || 0),
      }
    : {
        completed,
        total,
        percent: total ? Math.round((completed / total) * 100) : 0,
      }
})

const companyValidationSummary = computed(() => companyReviewFlow.value.summary || [])

const companyProfileItems = computed(() =>
  buildOperatorCompanyProfile({
    legal_name: company.legalName,
    rfc: company.rfc,
    commercial_name: company.tradeName,
    base_airport: company.base,
    address: company.address,
    legal_representative: company.legalRepresentative,
    company_phone: company.phone,
    company_email: company.email,
  }),
)

const companyCommercialItems = computed(() =>
  buildOperatorCommercialConfig({
    jet_a_price: company.jetAPrice,
    margin_percent: company.marginPercent,
    fixed_fee: company.fixedFee,
  }),
)

const companyFleetSummary = computed(() =>
  buildOperatorFleetSummary(
    aircraft.value.map((item) => ({
      id: item.id,
      manufacturer: item.manufacturer,
      name: item.name,
      model: item.name,
      registration: item.registration,
      base: item.base,
    })),
  ),
)

const companySharedDocuments = computed(() => {
  const definitions = [
    {
      id: 'sat_certificate',
      label: getCompanyDocumentDefinition('sat_certificate')?.label || 'Constancia de situacion fiscal',
      section: 'sat',
    },
    ...companyRequiredLegalDocuments.value.map((definition) => ({
      id: definition.id,
      label: definition.label,
      section: definition.section,
    })),
  ]

  return definitions.map((definition, index) => {
    const currentDocument =
      definition.id === 'sat_certificate'
        ? companySatDocument.value
        : companyDocumentsByDefinition.value[definition.id]

    if (currentDocument) {
      return normalizeOperatorValidationDocument(
        {
          ...currentDocument,
          definition_key: definition.id,
          definition_label: definition.label,
          document_type: currentDocument.documentType || definition.id,
          document_section: definition.section,
          uploaded_at: currentDocument.createdAt,
          reviewed_at: currentDocument.reviewedAt || '',
          rejection_reason: currentDocument.rejectedReason || '',
          file_url: currentDocument.url,
          download_url: currentDocument.downloadUrl,
          mime_type: currentDocument.mimeType,
          file_size_bytes: currentDocument.size,
          status: currentDocument.state,
        },
        index,
      )
    }

    return normalizeOperatorValidationDocument(
      {
        id: `placeholder-${definition.id}`,
        definition_key: definition.id,
        definition_label: definition.label,
        document_type: definition.id,
        document_section: definition.section,
        status: 'pending',
        is_current: true,
      },
      index,
    )
  })
})

const companyAlerts = computed(() => {
  const alerts = []

  if (
    providerOperationalAccess.value.isBlocked &&
    !['pending-admin-review', 'changes-required', 'rejected'].includes(
      providerOperationalAccess.value.blockingReason,
    )
  ) {
    alerts.push({
      tone: providerOperationalAccess.value.tone,
      title: providerOperationalAccess.value.title,
      detail: providerOperationalAccess.value.detail,
    })
  }

  if (['changes_required', 'changes_requested'].includes(company.adminValidationStatus)) {
    alerts.push({
      tone: 'danger',
      title: company.changesNotes || company.adminNotes || 'Cambios solicitados por administracion.',
    })
  } else if (company.adminValidationStatus === 'rejected') {
    alerts.push({
      tone: 'danger',
      title: company.rejectionReason || company.adminNotes || 'Expediente rechazado por administracion.',
    })
  } else if (company.accessEnabled && company.adminValidationStatus === 'approved') {
    alerts.push({ tone: 'success', title: 'Operador validado por administracion. Acceso operativo habilitado.' })
  } else if (['pending_review', 'under_review', 'submitted'].includes(companyReviewFlow.value.status)) {
    alerts.push({ tone: 'info', title: 'Expediente enviado a revision administrativa.' })
  } else if (!company.accessEnabled && ['draft', 'incomplete'].includes(companyReviewFlow.value.status)) {
    alerts.push({
      tone: 'warning',
      title: 'Completa primero tu expediente de proveedor',
      detail: 'Faltan datos o validaciones obligatorias antes de enviarlo a revision administrativa.',
    })
  } else if (!company.accessEnabled) {
    alerts.push({
      tone: 'info',
      title: 'Tu expediente esta en revision administrativa.',
      detail: 'Cuando sea aprobado por un administrador se habilitaran automaticamente todas las funciones operativas.',
    })
  }

  const requirements = companyReviewFlow.value.requirementsByKey || {}

  if (!requirements.valid_rfc) {
    alerts.push({
      tone: 'warning',
      title: 'Falta RFC valido',
      actionLabel: 'Completar RFC',
      actionKey: 'company-rfc',
    })
  }

  if (!requirements.sat_validated) {
    alerts.push({
      tone: companySatDocument.value ? 'info' : 'warning',
      title: companySatDocument.value ? 'Validacion SAT pendiente' : 'Sube tu constancia fiscal',
      actionLabel: 'Subir constancia SAT',
      actionKey: 'sat',
    })
  }

  if (!requirements.legal_documents_approved) {
    alerts.push({
      tone: 'warning',
      title: 'Documentacion legal incompleta',
      actionLabel: 'Subir documentos',
      actionKey: 'legal-documents',
    })
  }

  if (!requirements.operational_base_defined) {
    alerts.push({
      tone: 'warning',
      title: 'Falta base operativa',
      actionLabel: 'Definir base',
      actionKey: 'company-identity',
    })
  }

  if (!activeAircraft.value) {
    alerts.push({
      tone: aircraft.value.length ? 'info' : 'warning',
      title: aircraft.value.length ? 'No hay aeronaves activas' : 'No hay aeronaves registradas',
      actionLabel: 'Agregar aeronave',
      actionKey: 'fleet',
    })
  }

  if (!alerts.length) {
    alerts.push({ tone: 'info', title: 'Expediente pendiente de validacion administrativa.' })
  }

  return alerts.slice(0, 6)
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

const companySharedActivity = computed(() =>
  companyAuditTimeline.value.map((entry) => ({
    id: entry.id,
    title: entry.action,
    description: entry.actor,
    createdAt: entry.date,
    createdBy: entry.actor,
    tone: 'info',
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
    title: 'Pendiente de revision administrativa',
    detail: 'El readiness mide avance del expediente, pero la habilitacion final depende del admin.',
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
        : 'Expediente pendiente de validacion admin',
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
    action: () => openAircraftRegistrationFlow(),
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

const providerAvailabilityUpdatesPending = computed(() =>
  Math.max(activeAircraft.value - availabilityReadyCount.value, 0),
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

const providerIncidentDashboardCards = computed(() => [
  {
    label: 'Aeronaves registradas',
    value: String(aircraft.value.length),
    detail: activeAircraft.value
      ? `${activeAircraft.value} activas para publicar y operar.`
      : 'Aun no hay flota activa en el portal.',
  },
  {
    label: 'Disponibles hoy',
    value: String(aircraftAvailableToday.value),
    detail: `${availabilityReadyCount.value} listas para respuesta inmediata.`,
  },
  {
    label: 'Solicitudes pendientes',
    value: String(pendingRequests.value),
    detail: providerPendingRequestRecords.value[0]
      ? getRequestRouteLabel(providerPendingRequestRecords.value[0])
      : 'Sin cola pendiente por confirmar.',
  },
  {
    label: 'Incidencias abiertas',
    value: String(providerOpenIncidents.value.length),
    detail: providerOpenIncidents.value.length
      ? 'Atencion operativa requerida.'
      : 'Sin incidencias activas.',
  },
  {
    label: 'Proxima operacion',
    value: providerNextOperation.value?.route || 'Sin programar',
    detail: providerNextOperation.value
      ? formatDateTimeDisplay(providerNextOperation.value.departure)
      : 'No hay salida inmediata registrada.',
  },
])

const providerPendingActions = computed(() => {
  const actions = []
  const nextPendingRequest = providerPendingRequestRecords.value[0] || null
  const nextOpenIncident = providerOpenIncidents.value[0] || null

  if (!aircraft.value.length) {
    actions.push({
      title: 'Registrar aeronaves',
      detail: 'Activa la flota para poder responder solicitudes.',
      section: 'aeronaves',
    })
  }

  if (!availability.value.length || providerAvailabilityUpdatesPending.value > 0) {
    actions.push({
      title: 'Actualizar disponibilidad de aeronaves',
      detail: providerAvailabilityUpdatesPending.value
        ? `${providerAvailabilityUpdatesPending.value} aeronave(s) requieren confirmacion operativa.`
        : 'Configura bloques y ventanas disponibles para la flota.',
      section: 'disponibilidad',
    })
  }

  if (nextPendingRequest) {
    actions.push({
      title: `Confirmar solicitud ${getRequestRouteLabel(nextPendingRequest)}`,
      detail: 'Revisa matching, tiempos y respuesta operativa.',
      section: 'solicitudes',
      requestId: String(nextPendingRequest.id || nextPendingRequest.requestId || ''),
    })
  }

  if (nextOpenIncident) {
    actions.push({
      title: 'Responder incidencia abierta',
      detail: `${nextOpenIncident.type} · ${nextOpenIncident.route || nextOpenIncident.flight}`,
      section: 'incidencias',
      incidentId: nextOpenIncident.id,
    })
  }

  if (!company.legalName || !company.rfc || !company.reviewStatus) {
    actions.push({
      title: 'Completar datos de empresa',
      detail: 'Mantiene la cuenta lista para revision y aprobacion.',
      section: 'empresa',
    })
  }

  if (aircraftDueDocuments.value > 0) {
    actions.push({
      title: 'Revisar documentos por vencer',
      detail: `${aircraftDueDocuments.value} documento(s) vencen dentro de 30 dias.`,
      section: 'aeronaves',
    })
  }

  return actions.slice(0, 4)
})

const availabilityFormSteps = computed(() => [
  { id: 1, label: 'Aeronave', complete: Boolean(availabilityForm.aircraftId) },
  { id: 2, label: 'Rango', complete: Boolean(availabilityForm.from && availabilityForm.to) },
  { id: 3, label: 'Motivo', complete: Boolean(availabilityForm.status) },
  { id: 4, label: 'Guardar', complete: false },
])

function sortRequestsByRecency(collection = []) {
  return [...collection].sort((left, right) => {
    const rightDate = parseOperationalDate(
      right.createdAt || right.updatedAt || right.date || right.responseLimit,
    )
    const leftDate = parseOperationalDate(
      left.createdAt || left.updatedAt || left.date || left.responseLimit,
    )
    if (leftDate && rightDate) return rightDate.getTime() - leftDate.getTime()
    if (rightDate) return 1
    if (leftDate) return -1
    return Number(right.id) - Number(left.id)
  })
}

const requestDerivedState = computed(() => {
  const search = requestSearch.value.trim().toLowerCase()
  const activeProviders = new Set()
  const statusCounts = {
    pending: 0,
    coordination: 0,
    tracking: 0,
    all: 0,
  }
  const kpis = {
    urgent: 0,
    pending: 0,
    tracking: 0,
    multiLeg: 0,
    pendingMargin: 0,
  }
  const archived = []
  const filtered = []

  requests.value.forEach((request) => {
    const statusMeta = getRequestStatusMeta(request)
    const priorityMeta = getRequestPriorityMeta(request)
    const queue = statusMeta.queue

    if (request.providerId) {
      activeProviders.add(request.providerId)
    }

    if (queue === 'rejected') {
      archived.push(request)
    }

    if (queue === 'pending') {
      statusCounts.pending += 1
      kpis.pending += 1
    }

    if (queue === 'coordination') {
      statusCounts.coordination += 1
    }

    if (queue === 'tracking') {
      statusCounts.tracking += 1
      kpis.tracking += 1
    }

    if (['pending', 'coordination', 'tracking'].includes(queue)) {
      statusCounts.all += 1
    }

    if (priorityMeta.tone === 'danger') {
      kpis.urgent += 1
    }

    if (buildRequestLegs(request).length > 1) {
      kpis.multiLeg += 1
    }

    if (!Number(request.priorityPrice || 0)) {
      kpis.pendingMargin += 1
    }

    const matchesStatus = requestMatchesStatusFilter(request, requestStatusFilter.value)
    const matchesPriority =
      requestPriorityFilter.value === 'all' || priorityMeta.key === requestPriorityFilter.value
    const haystack = [
      request.id,
      getRequestRouteLabel(request),
      request.aircraft,
      getRequestClientLabel(request),
      request.requestCode,
      request.tripType,
      request.workflowStatus,
    ]
      .join(' ')
      .toLowerCase()
    const matchesSearch = !search || haystack.includes(search)

    if (matchesStatus && matchesPriority && matchesSearch) {
      filtered.push(request)
    }
  })

  return {
    activeProviders: activeProviders.size,
    archivedRequests: sortRequestsByRecency(archived),
    filteredRequests: sortRequestsByRecency(filtered),
    kpis,
    statusCounts,
  }
})

const requestKpis = computed(() => {
  const readyAircraft = aircraft.value.filter((item) => getAircraftCommercialState(item).isAvailable).length

  return [
    {
      label: 'Nuevas',
      value: requestDerivedState.value.kpis.pending,
      tone: requestDerivedState.value.kpis.pending ? 'warning' : 'success',
      detail: requestDerivedState.value.kpis.pending
        ? 'Requieren respuesta operativa.'
        : 'Sin backlog nuevo en la bandeja.',
    },
    {
      label: 'SLA critico',
      value: requestDerivedState.value.kpis.urgent,
      tone: requestDerivedState.value.kpis.urgent ? 'danger' : 'success',
      detail: requestDerivedState.value.kpis.urgent
        ? 'Salen en menos de 4 horas.'
        : 'Sin salidas criticas inmediatas.',
    },
    {
      label: 'Tracking',
      value: requestDerivedState.value.kpis.tracking,
      tone: requestDerivedState.value.kpis.tracking ? 'info' : 'neutral',
      detail: requestDerivedState.value.kpis.tracking
        ? 'Vuelos con seguimiento activo.'
        : 'Sin tracking activo visible.',
    },
    {
      label: 'Proveedores activos',
      value: requestDerivedState.value.activeProviders,
      tone: requestDerivedState.value.activeProviders ? 'info' : 'neutral',
      detail: requestDerivedState.value.activeProviders
        ? 'Recibiendo solicitudes en cola.'
        : 'Sin proveedores activos.',
    },
    {
      label: 'Aeronaves listas',
      value: readyAircraft,
      tone: readyAircraft ? 'success' : 'warning',
      detail: readyAircraft ? 'Disponibles para armar propuesta.' : 'No hay disponibilidad inmediata.',
    },
    {
      label: 'Multi-tramo',
      value: requestDerivedState.value.kpis.multiLeg,
      tone: requestDerivedState.value.kpis.multiLeg ? 'info' : 'neutral',
      detail: requestDerivedState.value.kpis.multiLeg
        ? 'Operaciones compuestas por revisar.'
        : 'Sin solicitudes compuestas visibles.',
    },
    {
      label: 'Margen pendiente',
      value: requestDerivedState.value.kpis.pendingMargin,
      tone: requestDerivedState.value.kpis.pendingMargin ? 'warning' : 'success',
      detail: requestDerivedState.value.kpis.pendingMargin
        ? 'Solicitudes aun sin margen visible.'
        : 'Margen operativo visible en cola.',
    },
  ]
})

const requestsDomain = createOperatorPortalRequestsDomain({
  requests,
  aircraft,
  requestStatusUpdate,
  requestWorkflowLocalOverrides,
  selectedRequestId,
  requestStatusFilter,
  buildWorkflowApiPayload,
  resolveSharedWorkflowStatus,
  resolveSharedVisualWorkflowStepId,
  getSharedWorkflowActionCopy,
  getSharedWorkflowStepDescription,
  normalizeWorkflowLabel,
  resolveWorkflowState,
  buildSharedFlowStepStates,
  parseOperationalDate,
  isRequestSameOperationalDay,
  formatCurrency,
  getRequestRouteLabel,
  resolveOperatorRequestQueue,
  findOperatorRequestByIdentifier,
  findLinkedOperationForRequest,
  getAircraftLiveStatus,
  parseRequestAmount,
  emitWorkflowSync,
  ui,
  OPERATOR_FLOW_STEPS,
})

const {
  applyLocalRequestStatusUpdate,
  buildOperatorRequestFlowSteps,
  buildRequestLegs,
  getRequestClientLabel,
  getRequestPriorityMeta,
  getRequestQuoteLabel,
  getRequestResponseCountdown,
  getRequestServiceTierLabel,
  getRequestServiceTierTone,
  getRequestStatusCopy,
  getRequestStatusMeta,
  getRequestSuggestedAircraft,
  getRequestTripTypeLabel,
  isRequestAccepted,
  isRequestPendingValidation,
  isRequestRejected,
  operatorWorkflowRank,
  preferOperatorWorkflowValue,
  resolveOperatorVisualStepId,
  resolveRequestStatusFilterTarget,
  resolveRequestWorkflowValue,
  selectRequest,
} = requestsDomain

const requestStatusTabs = computed(() => [
  {
    id: 'pending',
    label: 'Pendientes',
    count: requestDerivedState.value.statusCounts.pending,
  },
  {
    id: 'coordination',
    label: 'Coordinacion',
    count: requestDerivedState.value.statusCounts.coordination,
  },
  {
    id: 'tracking',
    label: 'Tracking',
    count: requestDerivedState.value.statusCounts.tracking,
  },
  {
    id: 'all',
    label: 'Todo el flujo',
    count: requestDerivedState.value.statusCounts.all,
  },
])

const archivedRequests = computed(() => requestDerivedState.value.archivedRequests)

const filteredRequests = computed(() => requestDerivedState.value.filteredRequests)

function requestMatchesStatusFilter(request = {}, filter = 'all') {
  const statusMeta = getRequestStatusMeta(request)
  if (filter === 'all') return ['pending', 'coordination', 'tracking'].includes(statusMeta.queue)
  if (filter === 'pending') return statusMeta.queue === 'pending'
  if (filter === 'coordination') return statusMeta.queue === 'coordination'
  if (filter === 'tracking') return statusMeta.queue === 'tracking'
  return statusMeta.queue === filter
}

const selectedRequest = computed(() => {
  if (!filteredRequests.value.length) return null
  const targetId = String(selectedRequestId.value || '').trim()
  return (
    findOperatorRequestByIdentifier(filteredRequests.value, targetId) ||
    filteredRequests.value[0]
  )
})

const releaseProviderRequest = computed(() => {
  const routeRequestId = String(route.query.request || '').trim()
  const targetId = routeRequestId || String(selectedRequestId.value || '').trim()

  if (!requests.value.length) return null
  if (targetId) {
    return findOperatorRequestByIdentifier(requests.value, targetId)
  }

  return (
    requests.value.find(
      (request) => ['flight_confirmed', 'tracking_live', 'completed'].includes(
        resolveWorkflowState(resolveRequestWorkflowValue(request)).id,
      ),
    ) || null
  )
})

function getSelectedRequestOperationStage() {
  if (!selectedRequest.value) return 'reserved'
  const workflowValue = resolveRequestWorkflowValue(selectedRequest.value)
  const visualStepId = resolveOperatorVisualStepId(workflowValue)
  return operationWorkflowOptions.some((option) => option.value === visualStepId)
    ? visualStepId
    : 'reserved'
}

function applyLocalRequestWorkflowStageUpdate(id, workflowStage = '') {
  const normalizedId = String(id)
  const workflowPayload = buildWorkflowApiPayload(workflowStage)

  requests.value = requests.value.map((request) => {
    if (String(request.id) !== normalizedId) return request

    const nextRaw = {
      ...request.raw,
      status: workflowPayload.status,
      workflow_status: workflowStage,
      workflow: workflowStage,
    }

    return normalizeRequest(nextRaw, 0)
  })
}

function buildOperatorWorkflowUpdateCandidates(request, payload) {
  const family = REQUEST_MUTATION_ROUTE_FAMILIES[getOperatorMutationRouteFamily(request)]
  const targetIds = getOperatorFlightRequestTargetIds(request)

  if (!family || !targetIds.length) return []

  return targetIds.flatMap((targetId) => {
    const workflowPath = family.workflowPath.replace(':id', targetId)
    const statusPath = family.statusPath.replace(':id', targetId)
    const basePath = family.basePath.replace(':id', targetId)

    return [
      { method: 'patch', path: workflowPath, body: payload, timeoutMs: OPERATOR_SECTION_TIMEOUT_MS },
      { method: 'put', path: workflowPath, body: payload, timeoutMs: OPERATOR_SECTION_TIMEOUT_MS },
      { method: 'post', path: workflowPath, body: payload, timeoutMs: OPERATOR_SECTION_TIMEOUT_MS },
      { method: 'patch', path: statusPath, body: payload, timeoutMs: OPERATOR_SECTION_TIMEOUT_MS },
      { method: 'put', path: statusPath, body: payload, timeoutMs: OPERATOR_SECTION_TIMEOUT_MS },
      { method: 'patch', path: basePath, body: payload, timeoutMs: OPERATOR_SECTION_TIMEOUT_MS },
      { method: 'put', path: basePath, body: payload, timeoutMs: OPERATOR_SECTION_TIMEOUT_MS },
    ]
  })
}

async function updateSelectedRequestOperationStage(nextStage) {
  if (!selectedRequest.value) return

  const request = selectedRequest.value
  const workflowPayload = buildWorkflowApiPayload(nextStage)
  const payload = {
    ...workflowPayload,
    state: workflowPayload.status,
    workflow_stage: nextStage,
    operational_stage: nextStage,
  }

  requestStatusUpdate.requestId = request.id
  requestStatusUpdate.action = 'workflow'

  try {
    await requestWithCandidates(buildOperatorWorkflowUpdateCandidates(request, payload))
  } catch (error) {
    requestStatusUpdate.requestId = null
    requestStatusUpdate.action = ''
    if (isBackendConnectionError(error)) {
      clearRequestsPolling()
      return showError('Backend no disponible', getBackendConnectionMessage())
    }
    return showError(
      'No se pudo actualizar el workflow',
      error?.candidateAttempts?.length
        ? 'El backend no acepto ninguna ruta compatible para actualizar la etapa de la operacion.'
        : error.message || 'La etapa de la operacion no pudo guardarse en la base de datos.',
    )
  }

  applyLocalRequestWorkflowStageUpdate(request.id, nextStage)
  emitWorkflowSync({
    scope: 'reservation-workflow',
    reservationId: request.reservationId || request.requestId || request.id,
    requestId: request.requestId || request.id,
    nextStage,
    action: 'updated',
  })
  ui.pushToast({
    tone: 'success',
    title: 'Estado sincronizado',
    message: `La operacion ahora esta en ${operationWorkflowOptions.find((option) => option.value === nextStage)?.label || nextStage}.`,
  })
  requestStatusUpdate.requestId = null
  requestStatusUpdate.action = ''
  window.setTimeout(() => {
    void refreshRequestsList({ silent: true, force: true, cooldownMs: 0 })
  }, 400)
}

const selectedRequestWorkflowPreview = computed(() => {
  if (!selectedRequest.value) {
    return {
      label: 'Reserva solicitada',
      detail: 'La solicitud aun no tiene senales suficientes para avanzar en el flujo.',
    }
  }

  const request = selectedRequest.value
  const workflowValue = resolveRequestWorkflowValue(request)
  const visualStepId = resolveOperatorVisualStepId(workflowValue)
  const option = operationWorkflowOptions.find((item) => item.value === visualStepId)
  const workflowId = resolveWorkflowState(workflowValue).id

  if (workflowId === 'provider_pending' || workflowId === 'reserved') {
    return {
      label: 'Responder solicitud',
      detail: 'Pendiente de aceptar o rechazar antes de iniciar contrato.',
    }
  }

  return {
    label: option?.label || normalizeWorkflowLabel(workflowValue),
    detail:
      getSharedWorkflowStepDescription(visualStepId, 'current') ||
      getSharedWorkflowActionCopy(workflowValue).detail,
  }
})

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
const providerOperationalReleaseAircraftOptions = computed(() => {
  const request = getActiveProviderReleaseRequest()
  if (!request) return []

  const preferredAircraftIds = [
    request.aircraftId,
    providerOperationalReleaseForm.aircraftId,
    request.raw?.assigned_aircraft_id,
    request.raw?.aircraft_id,
    request.raw?.aircraft?.id,
    request.raw?.selected_aircraft_id,
    request.raw?.matched_aircraft_id,
    request.raw?.preferred_aircraft_id,
    request.raw?.provider_operational_release?.aircraft_id,
    request.raw?.operational_release?.aircraft_id,
    request.raw?.visibility_payload?.aircraft_id,
    request.raw?.visibility_payload?.selected_aircraft_id,
    request.raw?.visibility_payload?.provider_operational_release?.aircraft_id,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)

  const matchedById = preferredAircraftIds
    .map((targetId) => aircraft.value.find((item) => String(item.id || '') === targetId))
    .find(Boolean)

  if (matchedById) return [matchedById]

  const aircraftLabelCandidates = [
    request.aircraft,
    request.raw?.aircraft_model,
    request.raw?.assigned_aircraft,
    request.raw?.aircraft,
    request.raw?.visibility_payload?.aircraft_model,
    pickPreferredRequestMatch(request.raw?.matches)?.aircraft?.model,
    pickPreferredRequestMatch(request.raw?.matches)?.aircraft?.name,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)

  const matchedByLabel = aircraftLabelCandidates
    .map((label) =>
      aircraft.value.find((item) => {
        const itemName = String(item.name || '').trim().toLowerCase()
        const itemRegistration = String(item.registration || '').trim().toLowerCase()
        const normalizedLabel = label.toLowerCase()
        return (
          normalizedLabel === itemName ||
          normalizedLabel.includes(itemName) ||
          (itemRegistration && normalizedLabel.includes(itemRegistration))
        )
      }),
    )
    .find(Boolean)

  if (matchedByLabel) return [matchedByLabel]

  const suggestedAircraft = getRequestSuggestedAircraft(request)
  const matchedSuggestedAircraft =
    aircraft.value.find((item) => suggestedAircraft.label.includes(item.registration || '')) ||
    aircraft.value.find((item) => suggestedAircraft.label.includes(item.name || '')) ||
    null

  return matchedSuggestedAircraft ? [matchedSuggestedAircraft] : []
})

const providerOperationalBinaryStatusOptions = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'confirmed', label: 'Si' },
  { value: 'needs_support', label: 'Requiere apoyo' },
]

const providerOperationalCrewOverallOptions = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'confirmed', label: 'Confirmada' },
  { value: 'not_available', label: 'No disponible' },
  { value: 'red_aviation_review', label: 'Requiere revision administrativa' },
]

const providerOperationalAircraftOverallOptions = [
  { value: 'available', label: 'Disponible' },
  { value: 'preparing', label: 'En preparacion' },
  { value: 'not_available', label: 'No disponible' },
  { value: 'maintenance', label: 'Requiere mantenimiento' },
  { value: 'ready', label: 'Lista para operacion' },
]

const releaseDomain = createOperatorPortalReleaseDomain({
  props,
  aircraft,
  releaseProviderRequest,
  selectedRequest,
  providerOperationalReleaseForm,
  providerOperationalReleaseDirty,
  providerOperationalReleaseHydrating,
  providerOperationalReleaseLoadedRequestId,
  providerOperationalReleaseLastHydratedSourceStamp,
  providerOperationalReleaseAutosaveQueued,
  providerOperationalReleaseFeedback,
  providerOperationalReleaseActiveStep,
  providerOperationalIssueOpen,
  providerOperationalIssueForm,
  providerOperationalReleaseLocalOverrides,
  requestWorkflowLocalOverrides,
  providerOperationalReleaseAutosaveTimerRef,
  windowRef: window,
  createEmptyProviderOperationalReleaseForm,
  getRequestSuggestedAircraft,
  resolveWorkflowState,
  resolveRequestWorkflowValue,
  resolveOperatorRequestStatusSource,
  buildWorkflowApiPayload,
  normalizeProviderOperationalBinaryStatus,
  normalizeProviderOperationalCrewOverallStatus,
  normalizeProviderOperationalAircraftOverallStatus,
  PROVIDER_OPERATIONAL_RELEASE_AUTOSAVE_MS,
  persistProviderOperationalReleaseDraft,
  operatorWorkflowRank,
})

const {
  clearProviderOperationalReleaseAutosaveTimer,
  getActiveProviderReleaseRequest,
  getProviderOperationalReleaseAircraftLabel,
  getProviderOperationalReleaseAircraftRecord,
  getProviderOperationalReleaseOverrideKeys,
  getProviderOperationalReleaseRequestId,
  getProviderOperationalReleaseSourceStamp,
  getProviderOperationalReleaseStatusMeta,
  hydrateProviderOperationalReleaseForm,
  mergeRequestWithLocalOperationalRelease,
  mergeRequestWithLocalWorkflow,
  normalizeProviderOperationalRelease,
  resetProviderOperationalReleaseForm,
  scheduleProviderOperationalReleaseAutosave,
  syncProviderOperationalDerivedStatuses,
} = releaseDomain

const {
  buildProviderOperationalReleaseChecklist,
  buildProviderOperationalWizardSections,
  canManageProviderOperationalRelease,
  deriveProviderOperationalReleaseStatus,
  getProviderOperationalAircraftSectionStatus,
  getProviderOperationalCrewSectionStatus,
  getProviderOperationalDispatchSectionStatus,
  getProviderOperationalFinalSummary,
  getProviderOperationalReadinessSectionStatus,
  getProviderOperationalReleaseCurrentStatus,
  getProviderOperationalReleaseProgress,
  getProviderOperationalSectionCompletion,
  getProviderOperationalWorkflowStage,
  getProviderReleaseLoadingMessage,
  getProviderReleaseLoadingTitle,
  getProviderReleasePrimaryActionLabel,
  getProviderReleasePrimaryActionStatus,
  isProviderAircraftConfirmedReady,
  isProviderCrewConfirmedReady,
  isProviderOperationalReady,
  isProviderOperationalStatusConfirmed,
  isProviderReleaseFinalized,
  requestProviderOperationalSupport,
  setProviderOperationalActiveStep,
  toggleProviderOperationalIssuePanel,
} = createOperatorPortalReleaseHelpers({
  providerOperationalReleaseForm,
  providerOperationalIssueOpen,
  providerOperationalIssueForm,
  providerOperationalReleaseActiveStep,
  providerOperationalReleaseFeedback,
  getActiveProviderReleaseRequest,
  resolveWorkflowState,
  resolveRequestWorkflowValue,
  ui,
})

async function persistProviderOperationalReleaseDraft() {
  clearProviderOperationalReleaseAutosaveTimer()

  if (
    providerOperationalReleaseHydrating.value ||
    !providerOperationalReleaseDirty.value ||
    props.section !== 'release-provider'
  ) {
    return
  }

  if (!isProviderOperationalReady()) {
    providerOperationalReleaseAutosaveQueued.value = false
    return
  }

  if (syncingProviderOperationalRelease.value) {
    providerOperationalReleaseAutosaveQueued.value = true
    return
  }

  await saveProviderOperationalRelease('', {
    background: true,
    skipWorkflowPromotion: true,
  })
}

async function flushProviderOperationalReleaseDraft() {
  if (props.section !== 'release-provider') return
  if (!providerOperationalReleaseDirty.value) return
  await persistProviderOperationalReleaseDraft()
}

watch(
  selectedRequest,
  (request) => {
    if (props.section === 'release-provider') return
    requestInternalCommentDraft.value = request?.internalComment || request?.specialRequirements || ''
    hydrateProviderOperationalReleaseForm(request, { force: true })
  },
  { immediate: true },
)

watch(
  releaseProviderRequest,
  (request, previousRequest) => {
    if (props.section !== 'release-provider') return
    requestInternalCommentDraft.value = request?.internalComment || request?.specialRequirements || ''
    const requestId = getProviderOperationalReleaseRequestId(request)
    const previousRequestId = getProviderOperationalReleaseRequestId(previousRequest)
    const sourceStamp = getProviderOperationalReleaseSourceStamp(request)
    const hasLocalOverride = Boolean(
      requestId &&
        providerOperationalReleaseLocalOverrides[requestId] &&
        typeof providerOperationalReleaseLocalOverrides[requestId] === 'object',
    )

    if (
      requestId &&
      requestId === previousRequestId &&
      requestId === providerOperationalReleaseLoadedRequestId.value &&
      (hasLocalOverride || sourceStamp === providerOperationalReleaseLastHydratedSourceStamp.value)
    ) {
      return
    }

    hydrateProviderOperationalReleaseForm(request)

    if (requestId !== previousRequestId) {
      providerOperationalReleaseActiveStep.value = 'aircraft'
      providerOperationalIssueOpen.value = false
    }
  },
  { immediate: true },
)

watch(
  providerOperationalReleaseForm,
  () => {
    if (providerOperationalReleaseHydrating.value) return
    syncProviderOperationalDerivedStatuses()
    providerOperationalReleaseDirty.value = true
    scheduleProviderOperationalReleaseAutosave()
  },
  { deep: true },
)

watch(
  () => [route.query.request, props.section, requests.value.length],
  () => {
    if (!['release-provider', 'solicitudes'].includes(props.section)) return

    const queryRequestId = String(route.query.request || '').trim()
    if (queryRequestId) {
      const matchedRequest = findOperatorRequestByIdentifier(requests.value, queryRequestId)
      selectedRequestId.value = String(matchedRequest?.id || queryRequestId)
      if (props.section === 'solicitudes' && matchedRequest) {
        requestStatusFilter.value = resolveRequestStatusFilterTarget(
          matchedRequest,
          requestStatusFilter.value,
        )
        archivedTrayOpen.value = false
      }
      return
    }

    if (props.section === 'release-provider' && releaseProviderRequest.value?.id) {
      selectedRequestId.value = String(releaseProviderRequest.value.id)
    }
  },
  { immediate: true },
)

function applyLocalProviderOperationalRelease(requestId, releasePayload, sharedWorkflowStatus = '') {
  requests.value = requests.value.map((request) => {
    if (String(request.id) !== String(requestId)) return request

    const overrideKeys = getProviderOperationalReleaseOverrideKeys(request)

    overrideKeys.forEach((key) => {
      providerOperationalReleaseLocalOverrides[key] = {
        ...releasePayload,
      }
    })

    const nextRaw = {
      ...(request.raw && typeof request.raw === 'object' ? request.raw : {}),
      provider_operational_release: releasePayload,
      operational_release: releasePayload,
      visibility_payload: {
        ...(request.raw?.visibility_payload && typeof request.raw.visibility_payload === 'object'
          ? request.raw.visibility_payload
          : {}),
        provider_operational_release: releasePayload,
        operational_status: releasePayload.status,
      },
      operational_status: releasePayload.status,
      aircraft_confirmed: ['aircraft_confirmed', 'crew_confirmed', 'operational_ready'].includes(
        releasePayload.status,
      ),
      crew_confirmed: ['crew_confirmed', 'operational_ready'].includes(releasePayload.status),
      operational_ready: releasePayload.status === 'operational_ready',
    }

    if (sharedWorkflowStatus) {
      nextRaw.workflow_status = sharedWorkflowStatus
      nextRaw.status = sharedWorkflowStatus
    }

    return normalizeRequest(nextRaw)
  })
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

function getFriendlyOperatorErrorMessage(error, fallbackMessage, context = 'general') {
  const status = Number(error?.status || 0)
  const message = String(error?.message || '').trim()
  const normalizedMessage = message.toLowerCase()

  if ([502, 503, 504].includes(status)) {
    if (context === 'billing-plan') {
      return 'El backend no pudo devolver la mensualidad de la aeronave en este momento. Revisa la ruta de facturacion del proveedor en sistema.'
    }

    if (context === 'portal-load') {
      return 'El backend no pudo devolver los datos del portal operador en este momento. Revisa las rutas de aeronaves del proveedor en sistema.'
    }

    return 'El backend no pudo completar esta solicitud en este momento. Intenta de nuevo en unos segundos.'
  }

  if (
    error?.candidateAttempts?.length &&
    (status === 404 ||
      status === 405 ||
      (normalizedMessage.includes('route') && normalizedMessage.includes('could not be found')))
  ) {
    if (context === 'billing-plan') {
      return 'El backend todavia no expone una ruta compatible para consultar la mensualidad por aeronave.'
    }

    if (context === 'portal-load') {
      return 'El backend todavia no expone una ruta compatible para cargar una o mas secciones del portal operador.'
    }
  }

  if (status === 403 && providerOperationalAccess.value.isBlocked) {
    return providerOperationalAccess.value.detail || fallbackMessage
  }

  return message || fallbackMessage
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
  const configuredBaseUrl = String(
    import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1',
  ).replace(/\/$/, '')

  return `No hay conexion con el backend configurado en ${configuredBaseUrl}. Verifica que ese servidor este disponible.`
}

function isOperationalSection(section = '') {
  return OPERATOR_OPERATIONAL_SECTIONS.has(normalizeSectionKey(section))
}

function clearOperationalPortalCollections() {
  requests.value = []
  operations.value = []
  incidents.value = []
  payments.value = []
  history.value = []
  availability.value = []
  realtimeNotifications.value = []
  realtimeNotificationsOpen.value = false
}

function shouldBlockOperationalSectionLoad(section = props.section) {
  return isOperationalSection(section) && !isOperationalAccessReady.value
}

function markAircraftBillingBackendUnavailable(cooldownMs = 15000) {
  const nextCooldownUntil = Date.now() + Number(cooldownMs || 0)
  billingStatusBackendCooldownUntil.value = Math.max(
    billingStatusBackendCooldownUntil.value,
    nextCooldownUntil,
  )
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

  markSectionLoaded('dashboard', 'empresa')
}

function applyAircraftResponse(payload) {
  const collection = pickCollection(payload, AIRCRAFT_COLLECTION_RESPONSE_KEYS)
  aircraft.value = mergeAircraftCollection(collection)
  syncAircraftScopedForms()
  markSectionLoaded('aeronaves')
}

function mergeAircraftCollection(collection = []) {
  return collection.map((item) => {
    const normalizedRecord = normalizeAircraft(item)
    const existingRecord = aircraft.value.find((current) => current.id === normalizedRecord.id)

    if (!existingRecord) {
      return normalizedRecord
    }

    return {
      ...existingRecord,
      ...normalizedRecord,
      images:
        normalizedRecord.images.length > 1
          ? normalizedRecord.images
          : existingRecord.images?.length > normalizedRecord.images.length
            ? existingRecord.images
            : normalizedRecord.images,
      documents:
        normalizedRecord.documents.length > 0
          ? normalizedRecord.documents
          : existingRecord.documents || [],
      documentsCount:
        normalizedRecord.documentsCount || existingRecord.documentsCount || normalizedRecord.documents.length,
    }
  })
}

async function fetchAircraftListPayload(timeoutMs = OPERATOR_SECTION_TIMEOUT_MS) {
  return requestWithCandidates(
    AIRCRAFT_LIST_ROUTE_CANDIDATES.map((path) => ({
      method: 'get',
      path,
      timeoutMs,
      query: { per_page: 24 },
      redirectOnForbidden: false,
      retryOnStatuses: [403],
    })),
  )
}

async function fetchCrewPayload(timeoutMs = OPERATOR_SECTION_TIMEOUT_MS) {
  return requestWithCandidates(
    CREW_ROUTE_CANDIDATES.map((path) => ({
      method: 'get',
      path,
      timeoutMs,
      query: { per_page: 20 },
      redirectOnForbidden: false,
      retryOnStatuses: [403],
    })),
  )
}

async function hydrateAircraftDetail(aircraftId, options = {}) {
  const normalizedId = Number(aircraftId)
  if (!normalizedId || aircraftDetailHydrationInFlight.has(normalizedId)) {
    return null
  }

  const existingRecord = aircraft.value.find((item) => item.id === normalizedId)
  if (
    existingRecord &&
    Array.isArray(existingRecord.documents) &&
    existingRecord.documents.some((document) => document.fileUrl || document.fileType) &&
    Array.isArray(existingRecord.images) &&
    existingRecord.images.length > 1
  ) {
    return existingRecord
  }

  aircraftDetailHydrationInFlight.add(normalizedId)

  try {
    const payload = await requestWithCandidates(
      AIRCRAFT_DETAIL_ROUTE_TEMPLATES.map((path) => ({
        method: 'get',
        path: path.replace(':id', String(normalizedId)),
        timeoutMs: options.timeoutMs || OPERATOR_SECTION_TIMEOUT_MS,
      })),
    )
    const aircraftRecord = pickRecord(payload, AIRCRAFT_RECORD_RESPONSE_KEYS)
    if (!aircraftRecord || !Object.keys(aircraftRecord).length) {
      return null
    }

    return upsertAircraftRecord(aircraftRecord)
  } finally {
    aircraftDetailHydrationInFlight.delete(normalizedId)
  }
}

function pickRequestsCollectionState(payload) {
  if (Array.isArray(payload)) {
    return {
      collection: payload,
      found: true,
    }
  }

  const queue = [payload]
  const visited = new Set()
  let fallback = []
  let found = false

  while (queue.length) {
    const current = queue.shift()
    if (!current || typeof current !== 'object') continue
    if (visited.has(current)) continue
    visited.add(current)

    for (const key of REQUEST_COLLECTION_KEYS) {
      const direct = current?.[key]

      if (Array.isArray(direct)) {
        found = true
        if (!fallback.length) fallback = direct
        if (direct.length) {
          return {
            collection: direct,
            found: true,
          }
        }
        continue
      }

      if (Array.isArray(direct?.data)) {
        found = true
        if (!fallback.length) fallback = direct.data
        if (direct.data.length) {
          return {
            collection: direct.data,
            found: true,
          }
        }
      }
    }

    Object.values(current).forEach((value) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        queue.push(value)
      }
    })
  }

  return { collection: fallback, found }
}

function pickRequestsCollection(payload) {
  return pickRequestsCollectionState(payload).collection
}

function normalizeProviderReference(value) {
  const normalized = String(value ?? '').trim()
  return normalized || ''
}

function getCurrentProviderReferenceSet() {
  return new Set(
    [providerId.value, companyId.value]
      .map((value) => normalizeProviderReference(value))
      .filter(Boolean),
  )
}

function requestBelongsToCurrentProvider(request = {}) {
  const providerReferences = getCurrentProviderReferenceSet()
  if (!providerReferences.size) return false

  const candidates = [
    request.providerId,
    request.provider_id,
    request.proveedor_id,
    request.assigned_provider_id,
    request.provider?.id,
    request.proveedor?.id,
    request.raw?.providerId,
    request.raw?.provider_id,
    request.raw?.proveedor_id,
    request.raw?.assigned_provider_id,
    request.raw?.provider?.id,
    request.raw?.proveedor?.id,
    request.raw?.visibility_payload?.selected_provider_id,
  ]
    .map((value) => normalizeProviderReference(value))
    .filter(Boolean)

  return candidates.some((value) => providerReferences.has(value))
}

async function fetchFallbackProviderRequests(timeoutMs = OPERATOR_SECTION_TIMEOUT_MS) {
  try {
    const reservations = await getAdminReservations({ timeoutMs })
    const filteredReservations = reservations.filter((request) =>
      requestBelongsToCurrentProvider(request),
    )

    if (filteredReservations.length) {
      activeRequestsRouteFamily.value = 'operator'
    }

    return filteredReservations
  } catch (error) {
    if (isSkippableIncidentLoadError(error)) {
      return []
    }
    throw error
  }
}

function applyRequestsResponse(payload) {
  if (Array.isArray(payload?.__normalizedRequests)) {
    requests.value = payload.__normalizedRequests
    syncRealtimeRequestsWithRequests()
    markSectionLoaded('solicitudes')
    return
  }

  const { collection, found } = pickRequestsCollectionState(payload)
  if (found || !requests.value.length) {
    requests.value = collection.map(normalizeRequest)
    syncRealtimeRequestsWithRequests()
  }
  markSectionLoaded('solicitudes')
}

async function fetchRequestsPayload(timeoutMs = OPERATOR_SECTION_TIMEOUT_MS) {
  let firstSuccessfulPayload = null
  let firstSuccessfulPath = ''
  let lastError = null
  const providerPendingValidation = ['pending_review', 'pending_validation'].includes(
    String(company.adminValidationStatus || company.operatorStatus || '').trim().toLowerCase(),
  )

  for (const path of REQUESTS_ROUTE_CANDIDATES) {
    try {
      const payload = await api.get(path, {
        timeoutMs,
        redirectOnForbidden: false,
      })
      const collection = pickRequestsCollection(payload)

      if (!firstSuccessfulPayload) {
        firstSuccessfulPayload = payload
        firstSuccessfulPath = path
      }

      if (collection.length > 0) {
        activeRequestsRouteFamily.value = path.startsWith('/operator/') ? 'operator' : 'proveedor'
        return payload
      }
    } catch (error) {
      lastError = error
      const canTryNext = shouldIgnoreOperatorRequestsRouteError(error, {
        hasSuccessfulPayload: Boolean(firstSuccessfulPayload),
        providerPendingValidation,
      })

      if (!canTryNext) {
        throw error
      }
    }
  }

  const fallbackRequests = await fetchFallbackProviderRequests(timeoutMs)
  if (fallbackRequests.length) {
    return {
      __normalizedRequests: fallbackRequests,
    }
  }

  if (firstSuccessfulPayload) {
    activeRequestsRouteFamily.value = firstSuccessfulPath.startsWith('/operator/')
      ? 'operator'
      : 'proveedor'
    return firstSuccessfulPayload
  }

  if (lastError) {
    throw lastError
  }

  throw new Error('No se encontro una ruta compatible para cargar solicitudes del proveedor.')
}

function applyOperationsResponse(payload) {
  const collection = pickCollection(payload, ['operations', 'data', 'items'])
  operations.value = collection.map(normalizeOperation)
  markSectionLoaded('operaciones')
}

function applyIncidentsResponse(collection) {
  incidents.value = Array.isArray(collection) ? collection : []
  markSectionLoaded('incidencias')
}

function applyPaymentsResponse(payload) {
  const collection = pickCollection(payload, ['payments', 'liquidations', 'data'])
  const aircraftPayments = pickCollection(payload, ['aircraft_payments', 'aircraftBillingPayments'])
  payments.value = [...collection, ...aircraftPayments].map(normalizePayment)
  markSectionLoaded('pagos')
}

function applyHistoryResponse(payload) {
  const collection = pickCollection(payload, ['history', 'events', 'data'])
  history.value = collection.map(normalizeHistory)
  markSectionLoaded('historial')
}

function applyCrewResponse(payload) {
  const collection = pickCollection(payload, ['crew', 'tripulation', 'tripulacion'])
  crew.value = collection.map(normalizeCrew)
  markSectionLoaded('tripulacion')
}

function applyAvailabilityResponse(payload) {
  const collection = pickCollection(payload, ['availability', 'data', 'items'])
  availability.value = collection.map(normalizeAvailability)
  markSectionLoaded('disponibilidad')
}

function goToSection(section, query = {}) {
  return router.push({
    name: 'operador',
    params: { section },
    query,
  })
}

async function openAircraftRegistrationFlow() {
  if (props.section === 'aeronaves') {
    openAircraftWizard()
    return
  }

  await goToSection('aeronaves', {
    [AIRCRAFT_WIZARD_ROUTE_QUERY_KEY]: AIRCRAFT_WIZARD_ROUTE_CREATE_VALUE,
  })
}

async function clearAircraftWizardRouteIntent() {
  if (!Object.prototype.hasOwnProperty.call(route.query, AIRCRAFT_WIZARD_ROUTE_QUERY_KEY)) return

  await router.replace({
    name: 'operador',
    params: { section: 'aeronaves' },
    query: removeAircraftWizardRouteIntent(route.query),
  })
}

async function syncAircraftWizardRouteIntent() {
  if (!hasCreateAircraftWizardIntent(props.section, route.query)) return
  if (aircraftWizardOpen.value) {
    void clearAircraftWizardRouteIntent()
    return
  }

  openAircraftWizard()
  await nextTick()
  void clearAircraftWizardRouteIntent()
}

function openProviderRelease(requestOrId = null) {
  const requestId =
    typeof requestOrId === 'object' && requestOrId
      ? requestOrId.id || requestOrId.requestId || requestOrId.reservationId || ''
      : requestOrId

  const query = requestId ? { request: String(requestId) } : {}
  goToSection('release-provider', query)
}

function normalizeCompany(raw = {}) {
  const approvalStatus =
    raw.approval_status || raw.validation_status || raw.status || company.approvalStatus || company.status
  const adminValidationStatus =
    raw.admin_validation_status || raw.review_status || raw.reviewStatus || company.adminValidationStatus
  const operatorStatus = raw.operator_status || raw.operatorStatus || raw.provider_status || company.operatorStatus
  const companyDocuments = Array.isArray(raw.documents)
    ? raw.documents
    : Array.isArray(raw.legal_documents)
      ? raw.legal_documents
      : Array.isArray(raw.company_documents)
        ? raw.company_documents
        : Array.isArray(raw.documentos)
          ? raw.documentos
          : Array.isArray(raw.files)
            ? raw.files
            : []
  const accessEnabled = Boolean(raw.access_enabled ?? raw.accessEnabled ?? company.accessEnabled)
  const canRegisterAircraft = raw.can_register_aircraft ?? raw.canRegisterAircraft ?? true

  return {
    legalName:
      raw.legal_name || raw.razon_social || raw.company_name || raw.nombre_empresa || company.legalName,
    rfc: raw.rfc || raw.tax_id || company.rfc,
    tradeName:
      raw.company_name ||
      raw.commercial_name ||
      raw.nombre_empresa ||
      raw.nombre_comercial ||
      raw.trade_name ||
      company.tradeName,
    base: raw.base_airport || raw.base || raw.base_airport_code || company.base,
    phone: raw.company_phone || raw.phone || raw.telefono || company.phone,
    email: raw.company_email || raw.email || company.email,
    address: raw.address || raw.direccion || company.address,
    legalRepresentative:
      raw.representative_name ||
      raw.legal_representative ||
      raw.representante_legal ||
      company.legalRepresentative,
    status: operatorStatus || company.status,
    approvalStatus,
    jetAPrice: raw.jet_a_price ?? raw.jetA ?? raw.precio_jet_a ?? company.jetAPrice,
    marginPercent:
      raw.margin_percent ?? raw.utility_percent ?? raw.porcentaje_utilidad ?? company.marginPercent,
    fixedFee: raw.fixed_fee ?? raw.fee_fijo ?? company.fixedFee,
    reviewStatus: adminValidationStatus || raw.estado_validacion || company.reviewStatus,
    adminValidationStatus,
    operatorStatus,
    adminReviewSubmittedAt: raw.admin_review_submitted_at || raw.adminReviewSubmittedAt || company.adminReviewSubmittedAt,
    satValidationStatus: raw.sat_validation_status || raw.satValidationStatus || company.satValidationStatus,
    canRegisterAircraft: Boolean(canRegisterAircraft),
    accessEnabled,
    adminNotes:
      raw.admin_notes ||
      raw.admin_validation_notes ||
      raw.observations ||
      raw.observaciones ||
      company.adminNotes,
    changesNotes: raw.changes_notes || raw.changesNotes || company.changesNotes,
    rejectionReason: raw.rejection_reason || raw.rejectionReason || company.rejectionReason,
    statusSummary: raw.provider_status_summary || raw.providerStatusSummary || company.statusSummary,
    validationRequirements: Array.isArray(raw.validation_requirements)
      ? raw.validation_requirements
      : Array.isArray(raw.validationRequirements)
        ? raw.validationRequirements
        : company.validationRequirements,
    documents: companyDocuments.length
      ? companyDocuments.map((document, index) => normalizeCompanyDocument(document, index))
      : company.documents,
  }
}

function normalizeCompanyDocument(raw = {}, index = 0) {
  const resolvedPath =
    raw.download_url ||
    raw.downloadUrl ||
    raw.url ||
    raw.file_url ||
    raw.fileUrl ||
    raw.path ||
    raw.storage_path ||
    raw.full_path ||
    ''

  return {
    id: raw.id || index + 1,
    name:
      raw.original_name ||
      raw.document_name ||
      raw.name ||
      raw.file_name ||
      raw.filename ||
      `Documento ${index + 1}`,
    originalName: raw.original_name || raw.document_name || raw.name || raw.file_name || '',
    fileName: raw.file_name || raw.filename || '',
    path: raw.path || raw.storage_path || '',
    url: normalizeMediaUrl(resolvedPath),
    downloadUrl: normalizeMediaUrl(raw.download_url || raw.downloadUrl || resolvedPath),
    mimeType: raw.mime_type || raw.mime || raw.content_type || '',
    size: Number(raw.size || raw.file_size || 0),
    createdAt: raw.created_at || raw.uploaded_at || raw.updated_at || '',
    state: raw.status || raw.state || raw.validation_status || raw.review_status || 'pendiente',
    notes: raw.notes || raw.observation || raw.observacion || raw.admin_notes || '',
    documentType: raw.document_type || raw.documentType || raw.type || raw.category || '',
    rejectedReason: raw.rejection_reason || raw.rejectionReason || raw.admin_notes || raw.notes || '',
  }
}

function humanizeCompanyDocumentState(value = '') {
  const normalized = String(value || '').trim().toLowerCase()

  if (!normalized) return 'Pendiente'
  if (normalized.includes('aprob') || normalized === 'approved') return 'Aprobado'
  if (normalized.includes('rech') || normalized === 'rejected') return 'Rechazado'
  if (normalized.includes('review') || normalized.includes('revision')) return 'En revision'
  if (normalized.includes('pend')) return 'Pendiente'

  return String(value || 'Pendiente')
}

function getCompanyDocumentStateTone(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'warning'
  if (normalized.includes('aprob') || normalized === 'approved') return 'success'
  if (normalized.includes('rech') || normalized === 'rejected') return 'danger'
  if (normalized.includes('review') || normalized.includes('revision')) return 'info'
  if (normalized.includes('carg') || normalized.includes('uploaded')) return 'info'
  return 'warning'
}

function normalizeSearchToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function getCompanyDocumentDefinition(definitionId = '') {
  return companyDocumentDefinitions.find((definition) => definition.id === definitionId) || null
}

function matchesCompanyDocumentDefinition(document = {}, definition = {}) {
  const documentType = normalizeSearchToken(document.documentType)
  const name = normalizeSearchToken(
    document.originalName || document.name || document.fileName || document.path || '',
  )

  return (definition.matchers || []).some((matcher) => {
    const token = normalizeSearchToken(matcher)
    return documentType === token || name.includes(token)
  })
}

const minimumAircraftYear = 1900
const maximumAircraftYear = new Date().getFullYear() + 1

const companyDocumentDefinitions = [
  {
    id: 'sat_certificate',
    label: 'Constancia de situacion fiscal',
    section: 'sat',
    required: true,
    accepts: '.pdf,image/*',
    helper: 'Sube PDF o imagen de la constancia SAT.',
    matchers: ['sat_certificate', 'constancia_fiscal', 'constancia_sat', 'situacion_fiscal', 'sat'],
  },
  {
    id: 'articles_of_incorporation',
    label: 'Acta constitutiva',
    section: 'legal',
    required: true,
    accepts: '.pdf,image/*',
    helper: 'Documento legal de constitucion de la empresa.',
    matchers: ['articles_of_incorporation', 'acta_constitutiva', 'acta constitutiva'],
  },
  {
    id: 'legal_representative_power',
    label: 'Poder del representante legal',
    section: 'legal',
    required: true,
    accepts: '.pdf,image/*',
    helper: 'Poder notarial o documento equivalente del representante.',
    matchers: ['legal_representative_power', 'poder_representante', 'poder del representante', 'power'],
  },
  {
    id: 'legal_representative_id',
    label: 'Identificacion oficial del representante',
    section: 'legal',
    required: true,
    accepts: '.pdf,image/*',
    helper: 'INE, pasaporte u otra identificacion oficial vigente.',
    matchers: ['legal_representative_id', 'identificacion_representante', 'identificacion oficial', 'ine', 'pasaporte'],
  },
  {
    id: 'tax_address_proof',
    label: 'Comprobante de domicilio fiscal',
    section: 'legal',
    required: true,
    accepts: '.pdf,image/*',
    helper: 'Recibo o comprobante del domicilio fiscal registrado.',
    matchers: ['tax_address_proof', 'domicilio_fiscal', 'comprobante_domicilio', 'domicilio fiscal'],
  },
  {
    id: 'operational_permit',
    label: 'Permiso operativo o documentacion aeronautica',
    section: 'legal',
    required: false,
    accepts: '.pdf,image/*',
    helper: 'Solo si aplica a tu operacion o regulacion.',
    matchers: ['operational_permit', 'permiso_operativo', 'documentacion_aeronautica', 'permiso operativo'],
  },
]

const { clearCompanyDocumentDraft, syncCompanyForm } = createOperatorPortalCompanyHelpers({
  company,
  companyForm,
  companyDocumentDrafts,
  companyDocumentDefinitions,
})

companyDocumentDefinitions.forEach((definition) => {
  clearCompanyDocumentDraft(definition.id)
})

function normalizeAircraftYear(value) {
  const rawValue = String(value ?? '').trim()
  if (!/^\d{4}$/.test(rawValue)) return ''

  const year = Number(rawValue)
  if (year < minimumAircraftYear || year > maximumAircraftYear) return ''

  return String(year)
}

function resolveAircraftYearNumber(value) {
  const normalizedYear = normalizeAircraftYear(value)
  return normalizedYear ? Number(normalizedYear) : null
}

function aircraftYearValidationMessage() {
  return `Ingresa un ano valido entre ${minimumAircraftYear} y ${maximumAircraftYear}.`
}

function normalizeAircraft(raw = {}, index = 0) {
  const billingState =
    raw.billing_state && typeof raw.billing_state === 'object'
      ? raw.billing_state
      : raw.billingState && typeof raw.billingState === 'object'
        ? raw.billingState
        : null
  const statusRaw = resolveAircraftOperationalStatus(raw)
  const validationStatusRaw = String(
    raw.validation_status || raw.validationStatus || raw.review_status || raw.reviewStatus || '',
  ).toLowerCase()
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
  const status = statusRaw || ''
  const validationStatus = normalizeAircraftValidationStatus(validationStatusRaw || statusRaw)
  const derivedOperationallyActive = isAircraftOperationallyActive(raw)
  const billingStatus = String(
    billingState?.billing_status ||
      raw.billing_status ||
      raw.billingStatus ||
      raw.subscription_status ||
      raw.subscriptionStatus ||
      '',
  )
    .trim()
    .toLowerCase()
  const mainImage = normalizeMediaUrl(
    raw.main_image ||
      raw.image ||
      raw.image_url ||
      raw.mainImage ||
      normalizedImages.find((image) => image.kind === 'main')?.imageUrl ||
      normalizedImages[0]?.imageUrl ||
      '',
  )

  const derivedApproved =
    Boolean(raw.approved_at || raw.approved || raw.is_approved) ||
    validationStatus === 'approved' ||
    ['active', 'trial_active', 'approved', 'aprobada', 'aprobado', 'inactive', 'inactiva'].includes(statusRaw)

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
    year: normalizeAircraftYear(raw.year || raw.model_year || raw.ano || raw.anio),
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
    operationalStatus: statusRaw,
    validationStatus,
    reviewStatus: validationStatus,
    availability: raw.availability_status || raw.availability || 'Pendiente de confirmacion',
    trial: trialEndsAt
      ? `Activo hasta ${String(trialEndsAt).slice(0, 10)}`
      : raw.subscription_status || raw.billing_status || 'Aun no activo',
    trialStartsAt,
    trialEndsAt,
    trialDaysLeft: Number(raw.trial_days_left || raw.days_left || 0),
    billingStatus,
    subscriptionStatus: String(
      billingState?.subscription_status ||
      raw.subscription_status ||
      raw.subscriptionStatus ||
      billingStatus ||
      '',
    )
      .trim()
      .toLowerCase(),
    billingPlanId: raw.billing_plan_id || raw.billingPlanId || null,
    subscriptionStartedAt: raw.subscription_started_at || raw.subscriptionStartedAt || null,
    subscriptionEndsAt: raw.subscription_ends_at || raw.subscriptionEndsAt || null,
    providerSubscriptionId:
      billingState?.stripe_subscription_id ||
      raw.provider_subscription_id ||
      raw.subscription_id ||
      raw.stripe_subscription_id ||
      '',
    providerCheckoutId:
      billingState?.checkout_session_id ||
      raw.provider_checkout_id ||
      raw.checkout_session_id ||
      raw.stripe_checkout_session_id ||
      '',
    autoRenewEnabled:
      raw.auto_renew_enabled ??
      raw.autoRenewEnabled ??
      raw.subscription_auto_renew ??
      raw.subscriptionAutoRenew ??
      null,
    defaultPaymentMethodReady:
      raw.default_payment_method_ready ??
      raw.defaultPaymentMethodReady ??
      raw.has_default_payment_method ??
      raw.hasDefaultPaymentMethod ??
      null,
    lastPaymentAt: billingState?.last_payment_at || raw.last_payment_at || raw.lastPaymentAt || null,
    paymentStatus:
      String(
        billingState?.payment_status ||
        raw.payment_status ||
        raw.paymentStatus ||
        '',
      )
        .trim()
        .toLowerCase(),
    primaryBillingAction:
      String(
        billingState?.primary_action ||
        raw.primary_action ||
        raw.primaryAction ||
        '',
      )
        .trim()
        .toLowerCase(),
    hasPendingCheckout:
      billingState?.has_pending_checkout ??
      raw.has_pending_checkout ??
      raw.hasPendingCheckout ??
      false,
    canStartCheckout:
      billingState?.can_start_checkout ??
      raw.can_start_checkout ??
      raw.canStartCheckout ??
      false,
    canContinueCheckout:
      billingState?.can_continue_checkout ??
      raw.can_continue_checkout ??
      raw.canContinueCheckout ??
      false,
    canVerifyPayment:
      billingState?.can_verify_payment ??
      raw.can_verify_payment ??
      raw.canVerifyPayment ??
      false,
    canOperate:
      billingState?.can_operate ??
      raw.can_operate ??
      raw.canOperate ??
      false,
    billingState,
    isActive: Boolean(derivedOperationallyActive),
    is_active: Boolean(derivedOperationallyActive),
    approved: derivedApproved,
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
    rejectionReason:
      raw.rejection_reason ||
      raw.rejectionReason ||
      raw.rejected_reason ||
      raw.rejectedReason ||
      '',
    changesRequestedNotes:
      raw.changes_requested_notes ||
      raw.changesRequestedNotes ||
      raw.changes_notes ||
      raw.changesNotes ||
      '',
    adminNotes: raw.admin_notes || raw.observations || raw.notes || 'Sin observaciones',
  }
}

function wait(ms = 0) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function setPaymentsTab(tabId = 'operations') {
  const allowedTabs = new Set(['operations', 'aircraft', 'pending', 'history'])
  const nextTab = allowedTabs.has(tabId) ? tabId : 'operations'
  paymentsTab.value = nextTab

  if (props.section === 'pagos' && route.query.payments_tab !== nextTab) {
    router.replace({
      query: {
        ...route.query,
        payments_tab: nextTab,
      },
    })
  }
}

function focusAircraftBilling(aircraftId = null) {
  billingFocusAircraftId.value = aircraftId ? Number(aircraftId) : null
}

function clearAircraftBillingFocus() {
  billingFocusAircraftId.value = null
}

async function loadProviderAircraftBillingPlan(options = {}) {
  if (!providerIsApproved.value) {
    providerAircraftBillingPlan.value = null
    providerAircraftBillingPlanLoaded.value = true
    return null
  }

  if ((providerAircraftBillingPlanLoaded.value || providerAircraftBillingPlan.value) && options.force !== true) {
    return providerAircraftBillingPlan.value
  }

  if (shouldSkipAircraftBillingRefresh()) {
    return providerAircraftBillingPlan.value
  }

  if (loadingProviderAircraftBillingPlan.value) {
    return providerAircraftBillingPlan.value
  }

  loadingProviderAircraftBillingPlan.value = true

  try {
    const response = await requestWithCandidates([
      { method: 'get', path: '/billing/plans/provider-aircraft' },
    ])
    const plan = pickRecord(response, ['plan', 'data'])
    providerAircraftBillingPlan.value = plan && Object.keys(plan).length ? plan : null
    providerAircraftBillingPlanLoaded.value = true
    return providerAircraftBillingPlan.value
  } catch (error) {
    if (isAircraftBillingBackendUnavailable(error)) {
      markAircraftBillingBackendUnavailable()
      providerAircraftBillingPlanLoaded.value = true
      return providerAircraftBillingPlan.value
    }

    showError(
      'No se pudo consultar la mensualidad',
      getFriendlyOperatorErrorMessage(
        error,
        'El backend no devolvio el plan de facturacion por aeronave.',
        'billing-plan',
      ),
    )
    providerAircraftBillingPlanLoaded.value = true
    return null
  } finally {
    loadingProviderAircraftBillingPlan.value = false
  }
}

function applyAircraftBillingStatus(aircraftId, payload = {}) {
  const targetAircraft = aircraft.value.find((item) => Number(item.id) === Number(aircraftId))
  if (!targetAircraft) return null

  const rawAircraftPayload = payload.aircraft && typeof payload.aircraft === 'object' ? payload.aircraft : null
  if (!rawAircraftPayload) return null

  const statusPayload = {
    ...rawAircraftPayload,
    billing_state:
      payload.billing_state && typeof payload.billing_state === 'object'
        ? payload.billing_state
        : rawAircraftPayload.billing_state,
    images: Array.isArray(rawAircraftPayload.images) ? rawAircraftPayload.images : targetAircraft.images,
    documents: Array.isArray(rawAircraftPayload.documents)
      ? rawAircraftPayload.documents
      : targetAircraft.documents,
  }

  return upsertAircraftRecord({
    ...statusPayload,
    id: targetAircraft.id,
    model: statusPayload.model || targetAircraft.name,
    name: statusPayload.name || targetAircraft.name,
    registration: statusPayload.registration || targetAircraft.registration,
    base_airport: statusPayload.base_airport || targetAircraft.base,
  })
}

function isAircraftBillingBackendUnavailable(error) {
  const message = String(error?.message || '').toLowerCase()
  const detail = String(error?.response?.data?.message || '').toLowerCase()
  const causeMessage = String(error?.cause?.message || '').toLowerCase()
  return (
    Number(error?.status || 0) === 0 ||
    isBackendConnectionError(error) ||
    message.includes('econnrefused') ||
    message.includes('no fue posible conectar con el servicio local ni con el servidor remoto') ||
    message.includes('failed to fetch') ||
    message.includes('network error') ||
    detail.includes('econnrefused') ||
    causeMessage.includes('econnrefused') ||
    causeMessage.includes('failed to fetch')
  )
}

function shouldSkipAircraftBillingRefresh() {
  return billingStatusBackendCooldownUntil.value > Date.now()
}

function isAircraftBillingActionPending(aircraftId) {
  return aircraftBillingActionIds.value.includes(Number(aircraftId || 0))
}

function setAircraftBillingActionPending(aircraftId, isPending) {
  const normalizedId = Number(aircraftId || 0)
  if (!normalizedId) return

  if (isPending) {
    if (!aircraftBillingActionIds.value.includes(normalizedId)) {
      aircraftBillingActionIds.value = [...aircraftBillingActionIds.value, normalizedId]
    }
    return
  }

  aircraftBillingActionIds.value = aircraftBillingActionIds.value.filter((item) => item !== normalizedId)
}

async function refreshAircraftBillingStatus(aircraftId, options = {}) {
  if (!aircraftId) return null
  if (shouldSkipAircraftBillingRefresh()) return null
  if (!providerIsApproved.value) return null

  const rawSessionId = String(options.sessionId || '').trim()
  const sessionId =
    rawSessionId && !rawSessionId.includes('CHECKOUT_SESSION_ID') && !/[{}]/.test(rawSessionId)
      ? rawSessionId
      : ''

  billingStatusRefreshAircraftId.value = Number(aircraftId)

  try {
    const query = {}
    if (sessionId) {
      query.session_id = sessionId
    }

    const response = await requestWithCandidates([
      {
        method: 'get',
        path: `/provider/aircraft/${aircraftId}/billing`,
        query,
        timeoutMs: OPERATOR_BACKGROUND_TIMEOUT_MS,
      },
    ])
    const syncedAircraft = applyAircraftBillingStatus(aircraftId, response)

    if (options.reloadAircraftList) {
      await reloadAircraftList()
    }

    if (options.reloadPayments) {
      await ensureSectionDataLoaded('pagos', { force: true, timeoutMs: OPERATOR_BACKGROUND_TIMEOUT_MS })
    }

    if (options.successToast && syncedAircraft) {
      ui.pushToast({
        tone: 'success',
        title: 'Pago recibido',
        message: `La aeronave ${syncedAircraft.registration || syncedAircraft.name} ya quedo activa en el sistema.`,
      })
    }

    return response
  } catch (error) {
    if (isAircraftBillingBackendUnavailable(error)) {
      markAircraftBillingBackendUnavailable()
    }
    if (!options.silent) {
      showError(
        'No se pudo validar el cobro',
        error.message || 'No pudimos consultar el estado actual de facturacion de la aeronave.',
      )
    }
    return null
  } finally {
    billingStatusRefreshAircraftId.value = null
  }
}

function buildAircraftBillingReturnUrl(state, aircraftId) {
  const baseUrl = buildFrontendUrl('/operador/aeronaves')
  if (!baseUrl) return ''

  const separator = baseUrl.includes('?') ? '&' : '?'

  return `${baseUrl}${separator}billing=${encodeURIComponent(state)}&aircraft_id=${encodeURIComponent(
    aircraftId,
  )}`
}

async function activateAircraftBilling(item = {}) {
  const aircraftId = Number(item?.id || 0)
  if (!aircraftId) return
  if (isAircraftBillingActionPending(aircraftId)) {
    ui.pushToast({
      tone: 'info',
      title: 'Checkout en preparación',
      message: 'Ya existe un intento de pago en curso para esta aeronave. Espera la redirección actual.',
    })
    return
  }
  if (activatingAircraftId.value && Number(activatingAircraftId.value) !== aircraftId) return
  if (!providerIsApproved.value) {
    showError(
      'Facturacion bloqueada',
      'La facturacion estara disponible cuando el proveedor sea aprobado.',
    )
    return
  }

  activatingAircraftId.value = aircraftId
  setAircraftBillingActionPending(aircraftId, true)

  try {
    await loadProviderAircraftBillingPlan()

    const successUrl = buildAircraftBillingReturnUrl('success', aircraftId)
    const cancelUrl = buildAircraftBillingReturnUrl('cancelled', aircraftId)

    const response = await requestWithCandidates([
      {
        method: 'post',
        path: `/provider/aircraft/${aircraftId}/billing`,
        body: {
          success_url: successUrl,
          cancel_url: cancelUrl,
          aircraft_id: aircraftId,
          aircraft_name: item.name || item.model || '',
          aircraft_registration: item.registration || '',
          aircraft_label: `${item.name || item.model || 'Aeronave'}${item.registration ? ` · ${item.registration}` : ''}`,
          description: `Suscripcion mensual aeronave ${item.name || item.model || 'Aeronave'}${item.registration ? ` · ${item.registration}` : ''}`,
        },
      },
    ])

    const checkoutUrl = String(response?.checkout_url || response?.data?.checkout_url || '').trim()

    if (!checkoutUrl) {
      throw new Error('El backend no devolvio la URL de Stripe Checkout.')
    }

    focusAircraftBilling(aircraftId)
    window.location.href = checkoutUrl
  } catch (error) {
    showError(
      'No se pudo iniciar el pago',
      error.message || 'No fue posible redirigir a Stripe Checkout.',
    )
  } finally {
    setAircraftBillingActionPending(aircraftId, false)
    activatingAircraftId.value = null
  }
}

function openAircraftBillingPayments() {
  setPaymentsTab('aircraft')
  goToSection('pagos', {
    payments_tab: 'aircraft',
    ...(selectedPaymentsAircraftId.value ? { aircraft_id: String(selectedPaymentsAircraftId.value) } : {}),
  })
}

function runAircraftBillingPrimaryAction(item = {}) {
  const billingMeta = getAircraftBillingStatusMeta(item)

  if (billingMeta.action === 'pay') {
    void activateAircraftBilling(item)
    return
  }

  if (billingMeta.action === 'sync') {
    void refreshAircraftBillingStatus(item.id, {
      reloadAircraftList: true,
      reloadPayments: true,
    })
    return
  }

  focusAircraftBilling(item.id)
  openAircraftBillingPayments()
}

function syncAircraftBillingFocusFromRoute() {
  if (props.section !== 'aeronaves') return

  const aircraftId = Number(route.query.aircraft_id || 0)
  if (aircraftId) {
    focusAircraftBilling(aircraftId)
  }
}

async function syncAircraftBillingAfterCheckout(aircraftId, sessionId = '') {
  const attempts = 6

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const shouldUseSessionId = attempt === 0 && sessionId
    const response = await refreshAircraftBillingStatus(aircraftId, {
      silent: attempt > 0,
      reloadAircraftList: attempt === 0,
      reloadPayments: attempt === 0,
      successToast: attempt === 0,
      sessionId: shouldUseSessionId ? sessionId : '',
    })

    if (!response && shouldSkipAircraftBillingRefresh()) {
      break
    }

    const syncedAircraft =
      aircraft.value.find((item) => Number(item.id) === Number(aircraftId)) || null

    if (syncedAircraft && isAircraftBillingActive(syncedAircraft)) {
      return true
    }

    if (attempt < attempts - 1) {
      await wait(2000)
    }
  }

  ui.pushToast({
    tone: 'warning',
    title: 'Pago en verificacion',
    message:
      'Stripe ya regreso correctamente, pero el backend aun no refleja la activacion de la aeronave. Revisa la pestana de pagos de aeronaves y actualiza estado en unos segundos.',
  })

  return false
}

async function handleAircraftBillingReturnFromRoute() {
  if (props.section !== 'aeronaves') return

  const billingState = String(route.query.billing || '').trim().toLowerCase()
  const aircraftId = Number(route.query.aircraft_id || 0)
  const routeSessionId = String(route.query.session_id || '').trim()
  const sessionId =
    routeSessionId && !routeSessionId.includes('CHECKOUT_SESSION_ID') && !/[{}]/.test(routeSessionId)
      ? routeSessionId
      : ''
  const currentKey = `${billingState}:${aircraftId || 'none'}`

  if (!billingState || !aircraftId || handledBillingReturnKey.value === currentKey) {
    return
  }

  handledBillingReturnKey.value = currentKey
  focusAircraftBilling(aircraftId)

  const cleanedQuery = {
    ...route.query,
    aircraft_id: String(aircraftId),
    billing: undefined,
    session_id: undefined,
  }

  if (billingState === 'success') {
    await router.replace({ query: cleanedQuery })
    await syncAircraftBillingAfterCheckout(aircraftId, sessionId)
    return
  }

  if (billingState === 'cancelled') {
    ui.pushToast({
      tone: 'warning',
      title: 'Pago cancelado',
      message: 'La aeronave sigue pendiente de activacion. Puedes intentarlo de nuevo cuando quieras.',
    })
    await router.replace({ query: cleanedQuery })
  }
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
  const explicitWorkflowStatus = String(raw.workflow_status || raw.workflow || '').trim()
  if (explicitWorkflowStatus) {
    const guardedWorkflowStatus = resolveSharedWorkflowStatus({
      ...raw,
      workflow_status: explicitWorkflowStatus,
      status: raw.status || '',
    })
    if (resolveWorkflowState(guardedWorkflowStatus).id === 'provider_pending') {
      return guardedWorkflowStatus
    }

    return resolveWorkflowState(explicitWorkflowStatus).id === 'provider_accepted'
      ? 'contract_pending'
      : explicitWorkflowStatus
  }

  const resolvedStatus =
    (
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

  return resolveWorkflowState(resolvedStatus).id === 'provider_accepted'
    ? 'contract_pending'
    : resolvedStatus
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
  raw = mergeRequestWithLocalWorkflow(raw)
  raw = mergeRequestWithLocalOperationalRelease(raw)
  const sourceRouteFamily = activeRequestsRouteFamily.value === 'operator' ? 'operator' : 'proveedor'
  const sharedWorkflowStatus = resolveOperatorRequestStatusSource(raw) || 'reserved'
  const trackingStatus =
    raw.tracking_status ||
    raw.trackingStatus ||
    raw.operation?.tracking_status ||
    raw.operation?.trackingStatus ||
    raw.reservation?.tracking_status ||
    raw.reservation?.trackingStatus ||
    ''

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
    route: buildRequestFullRoute({
      ...raw,
      origin,
      destination,
      route: raw.route || '',
      requirements,
    }),
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
    providerStatus:
      raw.provider_status ||
      raw.providerStatus ||
      raw.operator_status ||
      raw.operatorStatus ||
      raw.reservation?.provider_status ||
      '',
    paymentStatus:
      raw.payment?.status ||
      raw.payment_status ||
      raw.payment_order?.status ||
      raw.reservation?.payment_status ||
      '',
    trackingStatus,
    operationId: raw.operation?.id || raw.operation_id || raw.operaciones?.[0]?.id || '',
    internalComment: raw.internal_comment || raw.notes || raw.comment || '',
    requestCode: raw.request_code || raw.code || '',
    providerId:
      raw.provider_id ||
      raw.assigned_provider_id ||
      raw.provider?.id ||
      raw.visibility_payload?.selected_provider_id ||
      '',
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
    sourceRouteFamily,
    raw: {
      ...raw,
      source_route_family: raw.source_route_family || sourceRouteFamily,
    },
  }
}

function syncRealtimeRequestsWithRequests() {
  realtimeRequests.value = syncRealtimeRequestsWithRequestsCollection(realtimeRequests.value, requests.value)
  pruneStaleRealtimeSignals()
}

function shouldKeepOperatorRealtimeNotificationVisible(notification = {}, collection = requests.value) {
  const payload =
    notification?.payload && typeof notification.payload === 'object'
      ? notification.payload
      : {}

  return shouldKeepOperatorRealtimeRequestVisible(
    {
      ...payload,
      id: notification.requestId || payload.request_id || payload.id,
      requestId: notification.requestId || payload.request_id || payload.id,
      request_id: payload.request_id || payload.id || notification.requestId,
      status: payload.status || notification.status || 'pending',
      raw: payload,
    },
    collection,
  )
}

function pruneStaleRealtimeSignals() {
  realtimeRequests.value = realtimeRequests.value.filter((request) =>
    shouldKeepOperatorRealtimeRequestVisible(request, requests.value),
  )

  realtimeNotifications.value = realtimeNotifications.value.filter((notification) =>
    shouldKeepOperatorRealtimeNotificationVisible(notification, requests.value),
  )
}

function mergeRealtimeNotifications(collection = []) {
  realtimeNotifications.value = mergeRealtimeNotificationCollection(
    collection,
    realtimeNotifications.value,
    {
      providerId: providerId.value,
      buildRealtimePayload: (payload) => buildRealtimeRequestPayload(payload, providerId.value),
    },
  )
  pruneStaleRealtimeSignals()
}

function syncRealtimeRequestsFromNotifications() {
  const nextRealtimeRequests = buildRealtimeRequestsFromNotifications(realtimeNotifications.value)
  realtimeRequests.value = nextRealtimeRequests
  syncRealtimeRequestsWithRequests()
}

async function resolveNotificationsRoute(timeoutMs = OPERATOR_BACKGROUND_TIMEOUT_MS) {
  if (validNotificationsRoute.value) {
    return validNotificationsRoute.value
  }

  if (notificationsRouteUnavailable.value) {
    return ''
  }

  if (notificationsRouteResolutionPromise) {
    return notificationsRouteResolutionPromise
  }

  notificationsRouteResolutionPromise = (async () => {
    let lastError = null

    for (const path of NOTIFICATIONS_ROUTE_CANDIDATES) {
      try {
        await api.get(path, {
          timeoutMs,
          redirectOnForbidden: false,
        })
        validNotificationsRoute.value = path
        notificationsRouteUnavailable.value = false
        return path
      } catch (error) {
        lastError = error
        if (!isSkippableNotificationLoadError(error)) {
          throw error
        }
      }
    }

    notificationsRouteUnavailable.value = true

    if (lastError && !isSkippableNotificationLoadError(lastError)) {
      throw lastError
    }

    return ''
  })()

  try {
    return await notificationsRouteResolutionPromise
  } finally {
    notificationsRouteResolutionPromise = null
  }
}

async function loadRealtimeNotifications(
  timeoutMs = OPERATOR_BACKGROUND_TIMEOUT_MS,
  options = {},
) {
  if (isBootstrapping.value) return

  const allowRouteDetection = options.allowRouteDetection === true

  if (!validNotificationsRoute.value && !allowRouteDetection) {
    return
  }

  try {
    let response = null

    if (validNotificationsRoute.value) {
      response = await api.get(validNotificationsRoute.value, { timeoutMs })
    } else {
      const routePath = await resolveNotificationsRoute(timeoutMs)
      if (!routePath) return
      response = await api.get(routePath, { timeoutMs })
    }

    const collection = pickCollection(response, ['notifications', 'data', 'items'])
      .filter((item) => String(item.type || '').trim() === 'flight.request.created')

    mergeRealtimeNotifications(collection)
    syncRealtimeRequestsFromNotifications()
    pruneStaleRealtimeSignals()
    realtimeNotificationsInitialized.value = true
  } catch (error) {
    if (isSkippableNotificationLoadError(error)) {
      realtimeNotifications.value = []
      realtimeRequests.value = []
      notificationsRouteUnavailable.value = true
      return
    }
  }
}

function pushRealtimeNotification(payload = {}) {
  const requestId = payload.request_id || payload.id
  const notification = {
    id: `flight-request-${requestId || Date.now()}`,
    backendNotificationId: null,
    requestId,
    title: 'Nueva solicitud de vuelo',
    message: `${payload.route || 'Ruta por confirmar'} · ${
      payload.aircraft_name || payload.aircraft || 'Aeronave por confirmar'
    }`,
    createdAt: payload.created_at || new Date().toISOString(),
    readAt: null,
    payload,
  }

  realtimeNotifications.value = [
    notification,
    ...realtimeNotifications.value.filter((item) => item.id !== notification.id),
  ].slice(0, 12)
  pruneStaleRealtimeSignals()
}

function playNotificationSound() {
  if (typeof window === 'undefined') return
  if (!notificationAudioUnlocked.value) return
  const AudioContext = window.AudioContext || window.webkitAudioContext
  if (!AudioContext) return

  try {
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, context.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(1320, context.currentTime + 0.12)
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.38)
    window.setTimeout(() => context.close(), 500)
  } catch {
    // Browser audio can be blocked until the first user gesture.
  }
}

function unlockNotificationAudio() {
  notificationAudioUnlocked.value = true
}

async function enableBrowserNotifications() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  const permission = await Notification.requestPermission()
  ui.pushToast({
    tone: permission === 'granted' ? 'success' : 'info',
    title: permission === 'granted' ? 'Notificaciones activadas' : 'Permiso pendiente',
    message:
      permission === 'granted'
        ? 'La cabina avisara cuando entre una nueva solicitud.'
        : 'Puedes activar las alertas del navegador desde la barra de permisos.',
  })
  return permission
}

function showBrowserFlightRequestNotification(payload = {}) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return

  new Notification('Nueva solicitud de vuelo', {
    body: `${payload.route || 'Ruta por confirmar'} · ${
      payload.aircraft_name || payload.aircraft || 'Aeronave por confirmar'
    }`,
  })
}

function handleRealtimeFlightRequestCreated(payload = {}) {
  const nextRaw = buildRealtimeRequestPayload(payload, providerId.value)
  const normalized = normalizeRequest(nextRaw)
  const requestKey = String(normalized.id || normalized.requestId || '').trim()
  const existingIndex = requests.value.findIndex((request) => {
    const currentKey = String(request.id || request.requestId || '').trim()
    return currentKey && currentKey === requestKey
  })

  if (existingIndex >= 0) {
    requests.value.splice(existingIndex, 1, normalized)
  } else {
    requests.value.unshift(normalized)
  }

  selectedRequestId.value = normalized.id
  realtimeRequests.value = [
    nextRaw,
    ...realtimeRequests.value.filter((request) => {
      const currentKey = String(request.id || request.requestId || request.request_id || '').trim()
      return !currentKey || currentKey !== requestKey
    }),
  ].slice(0, 8)
  pushRealtimeNotification(nextRaw)
  ui.pushToast({
    tone: 'success',
    title: 'Nueva solicitud de vuelo',
    message: `${nextRaw.route || normalized.route} · ${nextRaw.aircraft_name || normalized.aircraft}`,
  })
  playNotificationSound()
  showBrowserFlightRequestNotification(nextRaw)
}

async function persistRealtimeNotificationRead(notification = {}) {
  const notificationId = Number(notification.backendNotificationId || 0)
  if (!notificationId) return

  try {
    await requestWithCandidates([
      {
        method: 'put',
        path: `/proveedor/notificaciones/${notificationId}/leer`,
        timeoutMs: OPERATOR_BACKGROUND_TIMEOUT_MS,
      },
    ])
  } catch (error) {
    if (isSkippableNotificationLoadError(error)) {
      return
    }
  }
}

async function openRealtimeRequest(request = {}) {
  const requestId = String(
    request.requestId || request.request_id || request.id || request.raw?.request_id || request.raw?.id || '',
  ).trim()
  let matchedRequest = findOperatorRequestByIdentifier(requests.value, requestId)

  if (requestId) {
    markRealtimeNotificationsByRequestRead(requestId)
  }

  if (!matchedRequest && requestId) {
    await refreshRequestsList({ silent: true, force: true, cooldownMs: 0 })
    matchedRequest = findOperatorRequestByIdentifier(requests.value, requestId)
  }

  if (!matchedRequest) {
    if (requestId) {
      dismissRealtimeRequestById(requestId)
    }
    ui.pushToast({
      tone: 'info',
      title: 'Solicitud no disponible',
      message: 'La alerta ya no tiene una solicitud pendiente activa en backend.',
    })
    return
  }

  const canonicalRequestId = String(matchedRequest.id || requestId || '').trim()

  if (matchedRequest) {
    selectedRequestId.value = String(matchedRequest.id)
    requestStatusFilter.value = resolveRequestStatusFilterTarget(matchedRequest, 'all')
    archivedTrayOpen.value = false
  }

  goToSection('solicitudes', canonicalRequestId ? { request: canonicalRequestId } : {})
}

function subscribeProviderFlightRequests() {
  if (!isEchoConfigured() || !echo || !providerId.value) {
    return
  }

  syncEchoAuthToken()

  const nextChannelName = `provider.${providerId.value}`
  if (providerFlightRequestsChannelName === nextChannelName && providerFlightRequestsChannel) return

  unsubscribeProviderFlightRequests()
  providerFlightRequestsChannelName = nextChannelName

  providerFlightRequestsChannel = echo
    .private(nextChannelName)
    .subscribed(() => {})
    .listen('.flight.request.created', (payload) => {
      handleRealtimeFlightRequestCreated(payload)
    })
    .error(() => {})
}

function unsubscribeProviderFlightRequests() {
  if (!echo || !providerFlightRequestsChannelName) return
  echo.leave(providerFlightRequestsChannelName)
  providerFlightRequestsChannel = null
  providerFlightRequestsChannelName = ''
}

function toggleRealtimeNotifications() {
  realtimeNotificationsOpen.value = !realtimeNotificationsOpen.value
}

function markRealtimeNotificationRead(notificationId) {
  const targetNotification =
    realtimeNotifications.value.find((notification) => notification.id === notificationId) || null
  const readAt = new Date().toISOString()
  realtimeNotifications.value = realtimeNotifications.value.map((notification) =>
    notification.id === notificationId ? { ...notification, readAt } : notification,
  )
  if (targetNotification) {
    void persistRealtimeNotificationRead({ ...targetNotification, readAt })
  }
}

function markRealtimeNotificationsByRequestRead(requestId) {
  const normalizedRequestId = String(requestId || '').trim()
  if (!normalizedRequestId) return

  const readAt = new Date().toISOString()
  const unreadNotifications = realtimeNotifications.value.filter((notification) => {
    if (notification?.readAt) return false

    const notificationRequestId = String(
      notification.requestId ||
        notification.payload?.request_id ||
        notification.payload?.id ||
        '',
    ).trim()

    return notificationRequestId === normalizedRequestId
  })

  if (!unreadNotifications.length) return

  realtimeNotifications.value = realtimeNotifications.value.map((notification) => {
    const notificationRequestId = String(
      notification.requestId ||
        notification.payload?.request_id ||
        notification.payload?.id ||
        '',
    ).trim()

    if (notificationRequestId !== normalizedRequestId) return notification
    return {
      ...notification,
      readAt: notification.readAt || readAt,
    }
  })

  unreadNotifications.forEach((notification) => {
    void persistRealtimeNotificationRead({ ...notification, readAt })
  })
}

function dismissRealtimeRequestById(requestId) {
  const normalizedRequestId = String(requestId || '').trim()
  if (!normalizedRequestId) return

  realtimeRequests.value = realtimeRequests.value.filter(
    (request) => !matchesOperatorRequestIdentifier(request, normalizedRequestId),
  )
  realtimeNotifications.value = realtimeNotifications.value.filter(
    (notification) =>
      !matchesOperatorRequestIdentifier(
        {
          id: notification.requestId,
          requestId: notification.requestId,
          request_id: notification.payload?.request_id,
          raw: notification.payload,
        },
        normalizedRequestId,
      ),
  )
}

function markAllRealtimeNotificationsRead() {
  const readAt = new Date().toISOString()
  const unreadNotifications = realtimeNotifications.value.filter((notification) => !notification.readAt)
  realtimeNotifications.value = realtimeNotifications.value.map((notification) => ({
    ...notification,
    readAt: notification.readAt || readAt,
  }))
  unreadNotifications.forEach((notification) => {
    void persistRealtimeNotificationRead({ ...notification, readAt })
  })
}

async function openRealtimeNotification(notification = {}) {
  if (notification.id) {
    markRealtimeNotificationRead(notification.id)
  }

  const requestId = notification.requestId || notification.payload?.request_id || notification.payload?.id
  realtimeNotificationsOpen.value = false

  if (!requestId) {
    return
  }

  await openRealtimeRequest({
    id: requestId,
    requestId,
    request_id: requestId,
    raw: notification.payload,
  })
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

function normalizeFlightTrackingStatus(operation = {}) {
  const value = String(operation.status || operation.workflowStatus || '').toLowerCase()

  if (value.includes('final') || value.includes('complet') || value.includes('cerr')) {
    return { id: 'finished', label: 'Finalizado', tone: 'neutral' }
  }

  if (value.includes('incid') || value.includes('retras') || value.includes('delay')) {
    return { id: 'delayed', label: 'Retrasado', tone: 'danger' }
  }

  if (value.includes('vuelo') || value.includes('ruta') || value.includes('airborne')) {
    return { id: 'enroute', label: 'En ruta', tone: 'success' }
  }

  if (value.includes('prepar') || value.includes('lista')) {
    return { id: 'preparation', label: 'Preparacion', tone: 'warning' }
  }

  return { id: 'confirmed', label: 'Confirmado', tone: 'info' }
}

function getOperationPassengerCount(operation = {}) {
  return (
    operation.passengers ||
    operation.raw?.passengers ||
    operation.raw?.passenger_count ||
    operation.raw?.pax ||
    operation.raw?.reservation?.passengers ||
    1
  )
}

function getOperationClientLabel(operation = {}) {
  return (
    operation.raw?.client_tier ||
    operation.raw?.service_tier ||
    operation.raw?.client?.membership ||
    operation.raw?.membership ||
    operation.raw?.client_name ||
    'Essential'
  )
}

function getOperationTimeLabel(value, fallback = 'Pendiente') {
  const date = parseOperationalDate(value)
  if (!date) return fallback
  return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

function buildFlightTrackingEvents(operation = null) {
  if (!operation) return []

  const departure = getOperationTimeLabel(operation.departure, '03:00')
  const serviceStart = getOperationTimeLabel(operation.crewServiceStartedAt, '03:25')
  const arrival = getOperationTimeLabel(operation.arrival, '04:20')
  const completed = getOperationTimeLabel(operation.crewServiceCompletedAt, 'Pendiente')

  return [
    { id: 'release', time: departure, title: 'Vuelo liberado', detail: operation.status || 'Operacion confirmada' },
    { id: 'boarding', time: operation.crewCheckinAt ? getOperationTimeLabel(operation.crewCheckinAt) : '03:12', title: 'Pasajeros abordando', detail: `${getOperationPassengerCount(operation)} pax` },
    { id: 'pushback', time: '03:18', title: 'Pushback', detail: operation.raw?.fbo || 'FBO en coordinacion' },
    { id: 'takeoff', time: serviceStart, title: 'Despegue', detail: operation.route || 'Ruta activa' },
    { id: 'approach', time: arrival !== 'Pendiente' ? arrival : '04:15', title: 'Aproximacion', detail: 'Tracking operacional' },
    { id: 'landing', time: completed !== 'Pendiente' ? completed : arrival, title: 'Aterrizaje', detail: completed !== 'Pendiente' ? 'Servicio completado' : 'ETA activa' },
  ]
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

function hasAssignedCrewForRequest(request = {}) {
  const linkedOperation = findLinkedOperationForRequest(request)
  const linkedCrewId = String(
    linkedOperation?.crewId ||
      linkedOperation?.raw?.crew_id ||
      linkedOperation?.raw?.sobrecargo_id ||
      linkedOperation?.raw?.crew_member_id ||
      linkedOperation?.raw?.sobrecargo_user_id ||
      '',
  ).trim()
  const linkedCrewName = String(
    linkedOperation?.crew ||
      linkedOperation?.raw?.crew_name ||
      linkedOperation?.raw?.crew_label ||
      linkedOperation?.raw?.sobrecargo_name ||
      '',
  ).trim()
  const requestCrewId = String(
    request?.raw?.crew_id ||
      request?.raw?.sobrecargo_id ||
      request?.raw?.crew_member_id ||
      request?.raw?.sobrecargo_user_id ||
      '',
  ).trim()
  const requestCrewName = String(
    request?.raw?.crew_name || request?.raw?.crew_label || request?.raw?.sobrecargo_name || '',
  ).trim()

  return Boolean(linkedCrewId || linkedCrewName || requestCrewId || requestCrewName)
}

function validateIncidentEvidenceFile(file) {
  const kind = getDocumentKind(file)

  if (!['image', 'pdf'].includes(kind)) {
    return `${file.name}: solo se permiten imagenes o PDF.`
  }

  if (kind === 'image' && file.size > maxImageDocumentBytes) {
    return `${file.name}: la imagen supera ${formatFileSize(maxImageDocumentBytes)}.`
  }

  if (kind === 'pdf' && file.size > maxPdfDocumentBytes) {
    return `${file.name}: el PDF supera ${formatFileSize(maxPdfDocumentBytes)}.`
  }

  return ''
}

function setIncidentEvidenceFiles(fileList) {
  const incomingFiles = Array.from(fileList || []).filter((file) => file instanceof File)
  const acceptedFiles = []
  const errors = []
  let totalBytes = 0

  if (incomingFiles.length > maxIncidentEvidenceFiles) {
    errors.push(`Maximo ${maxIncidentEvidenceFiles} archivos por incidencia.`)
  }

  incomingFiles.slice(0, maxIncidentEvidenceFiles).forEach((file) => {
    const validationError = validateIncidentEvidenceFile(file)
    if (validationError) {
      errors.push(validationError)
      return
    }

    if (totalBytes + file.size > maxIncidentEvidenceTotalBytes) {
      errors.push(
        `${file.name}: el total adjunto supera ${formatFileSize(maxIncidentEvidenceTotalBytes)}.`,
      )
      return
    }

    acceptedFiles.push(file)
    totalBytes += file.size
  })

  incidentForm.files = acceptedFiles
  incidentForm.evidence = acceptedFiles.map((file) => file.name).join(', ')
  formErrors.incident.evidence = errors.join(' ')
}

function selectIncidentOperation(operationId = '') {
  const selectedOperation =
    operations.value.find((item) => String(item.id || '') === String(operationId || '')) || null

  if (!selectedOperation) {
    incidentForm.requestId = null
    incidentForm.flight = ''
    return
  }

  incidentForm.requestId = selectedOperation.requestId || null
  incidentForm.flight = selectedOperation.route || selectedOperation.flight || ''
}

function normalizeComparableId(value) {
  const normalized = String(value || '').trim()
  return normalized || ''
}

function buildProviderOperationReferenceSet() {
  const references = new Set()

  const append = (value) => {
    const normalized = normalizeComparableId(value)
    if (normalized) references.add(normalized)
  }

  operations.value.forEach((operation) => {
    append(operation.id)
    append(operation.requestId)
    append(operation.reservationId)
    append(operation.raw?.id)
    append(operation.raw?.request_id)
    append(operation.raw?.flight_request_id)
    append(operation.raw?.reservation_id)
    append(operation.raw?.booking_id)
  })

  requests.value.forEach((request) => {
    append(request.id)
    append(request.requestId)
    append(request.reservationId)
    append(request.operationId)
    append(request.raw?.id)
    append(request.raw?.request_id)
    append(request.raw?.flight_request_id)
    append(request.raw?.reservation_id)
    append(request.raw?.booking_id)
  })

  return references
}

function isSkippableIncidentLoadError(error) {
  const status = Number(error?.status || 0)
  const message = String(error?.message || '').toLowerCase()

  return (
    status === 0 ||
    [401, 403, 404, 405].includes(status) ||
    (status >= 500 && status <= 599) ||
    (message.includes('route') && message.includes('could not be found'))
  )
}

function isSkippableNotificationLoadError(error) {
  const status = Number(error?.status || 0)
  const message = String(error?.message || '').toLowerCase()

  return (
    status === 0 ||
    [401, 403, 404, 405].includes(status) ||
    (status >= 500 && status <= 599) ||
    (message.includes('route') && message.includes('could not be found')) ||
    message.includes('notifications') ||
    message.includes('notificaciones')
  )
}

async function fetchOptionalIncidentsPayload(loader) {
  try {
    return await loader()
  } catch (error) {
    if (isSkippableIncidentLoadError(error)) return null
    throw error
  }
}

function isCrewIncidentForCurrentProvider(raw = {}) {
  const providerReferences = new Set(
    [providerId.value, companyId.value]
      .map((value) => normalizeComparableId(value))
      .filter(Boolean),
  )

  const incidentProviderCandidates = [
    raw.provider_id,
    raw.proveedor_id,
    raw.provider?.id,
    raw.proveedor?.id,
  ]
    .map((value) => normalizeComparableId(value))
    .filter(Boolean)

  if (incidentProviderCandidates.some((value) => providerReferences.has(value))) {
    return true
  }

  const operationReferences = buildProviderOperationReferenceSet()
  const incidentOperationCandidates = [
    raw.operation_id,
    raw.crew_operation_id,
    raw.request_id,
    raw.flight_request_id,
    raw.reservation_id,
  ]
    .map((value) => normalizeComparableId(value))
    .filter(Boolean)

  return incidentOperationCandidates.some((value) => operationReferences.has(value))
}

async function fetchProviderIncidentCollection(timeoutMs) {
  const shouldLoadOperations = operations.value.length === 0
  const shouldLoadAircraft = aircraft.value.length === 0
  const shouldLoadRequests = requests.value.length === 0
  const shouldLoadAvailability = availability.value.length === 0

  const [crewPayload, operationsPayload, aircraftPayload, requestsPayload, availabilityPayload] = await Promise.all([
    fetchOptionalIncidentsPayload(() =>
      api.get('/crew-operation-incidents', {
        timeoutMs,
      }),
    ),
    shouldLoadOperations
      ? fetchOptionalIncidentsPayload(() =>
          requestWithCandidates([{ method: 'get', path: '/proveedor/operaciones', timeoutMs }]),
        )
      : Promise.resolve(null),
    shouldLoadAircraft
      ? fetchOptionalIncidentsPayload(() => fetchAircraftListPayload(timeoutMs))
      : Promise.resolve(null),
    shouldLoadRequests
      ? fetchOptionalIncidentsPayload(() => fetchRequestsPayload(timeoutMs))
      : Promise.resolve(null),
    shouldLoadAvailability
      ? fetchOptionalIncidentsPayload(() =>
          requestWithCandidates([{ method: 'get', path: '/proveedor/disponibilidad', timeoutMs }]),
        )
      : Promise.resolve(null),
  ])

  if (operationsPayload) {
    const operationCollection = pickCollection(operationsPayload, ['operations', 'data', 'items'])
    if (operationCollection.length) {
      operations.value = operationCollection.map(normalizeOperation)
    }
  }

  if (aircraftPayload) {
    applyAircraftResponse(aircraftPayload)
  }

  if (requestsPayload) {
    applyRequestsResponse(requestsPayload)
  }

  if (availabilityPayload) {
    applyAvailabilityResponse(availabilityPayload)
  }

  const crewIncidents = crewPayload
    ? pickCollection(crewPayload, ['incidents', 'incidencias', 'data', 'items']).filter(
        isCrewIncidentForCurrentProvider,
      )
    : []

  // Esta vista debe reflejar solo incidencias persistidas en la BD operativa
  // que consume Admin, sin mezclar colecciones auxiliares del portal proveedor.
  return mergeIncidentCollections(crewIncidents)
}

function normalizePayment(raw = {}, index = 0) {
  return normalizePaymentEntry(raw, index, {
    parseRequestAmount,
    compactBillingReference,
  })
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

function setCompanyDocumentDraft(definitionId, file) {
  const definition = getCompanyDocumentDefinition(definitionId)
  if (!definition) return

  companyDocumentDrafts[definitionId] = {
    file: file || null,
    name: file?.name || '',
  }
}

function getCompanyDocumentDraft(definitionId) {
  return companyDocumentDrafts[definitionId] || { file: null, name: '' }
}

function validateCompanyDocumentDraft(file, definitionId = '') {
  if (!(file instanceof File)) return 'Selecciona un archivo valido.'
  const definition = getCompanyDocumentDefinition(definitionId)
  const extension = String(file.name || '').toLowerCase()
  const kind = getDocumentKind(file)

  if (!['image', 'pdf'].includes(kind) && !extension.endsWith('.doc') && !extension.endsWith('.docx')) {
    return 'Solo se permiten PDF, imagen o Word.'
  }

  if (kind === 'image' && file.size > maxImageDocumentBytes) {
    return `La imagen supera ${formatFileSize(maxImageDocumentBytes)}.`
  }

  if (kind === 'pdf' && file.size > maxPdfDocumentBytes) {
    return `El PDF supera ${formatFileSize(maxPdfDocumentBytes)}.`
  }

  if (definition?.id === 'sat_certificate' && !['image', 'pdf'].includes(kind)) {
    return 'La constancia SAT solo acepta PDF o imagen.'
  }

  return ''
}

function buildCompanyDocumentDebugPayload(formData) {
  return Array.from(formData.entries()).map(([key, value]) => {
    if (value instanceof File) {
      return {
        key,
        kind: 'file',
        name: value.name,
        size: value.size,
        type: value.type,
      }
    }

    return {
      key,
      kind: typeof value,
      value,
    }
  })
}

function logCompanyReviewUpload(formData, file) {
  if (typeof console === 'undefined') return

  console.info('[provider-review] archivo seleccionado', file)
  console.info('[provider-review] nombre', file?.name || '')
  console.info('[provider-review] tamano', Number(file?.size || 0))
  console.info('[provider-review] mime', file?.type || '')
  console.info('[provider-review] form-data', buildCompanyDocumentDebugPayload(formData))
}

async function reloadCompany() {
  const response = await requestWithCandidates([
    { method: 'get', path: '/proveedor/profile-status' },
    { method: 'get', path: '/proveedor/dashboard' },
    { method: 'get', path: '/proveedor/empresa' },
    { method: 'get', path: '/operator/dashboard' },
  ])

  const providerRecord = pickRecord(response, ['provider', 'company', 'empresa'])
  if (providerRecord && Object.keys(providerRecord).length) {
    hydrateCompany(providerRecord)
  }
}

async function uploadCompanyDocument(options = {}) {
  const file = options.file || companyForm.newDocumentFile
  if (!(file instanceof File)) return false

  const formData = new FormData()
  const documentType = options.documentType || ''
  const documentName = options.documentName || companyForm.newDocumentName || file.name
  const existingDocumentId = options.existingDocumentId || ''

  formData.append('file', file)
  formData.append('document_name', documentName)
  if (documentType) {
    formData.append('document_type', documentType)
    formData.append('document_category', documentType)
    formData.append('document_slot', documentType)
  }
  if (existingDocumentId) {
    formData.append('replace_document_id', String(existingDocumentId))
  }

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

async function uploadCompanyDocumentDraft(definitionId) {
  const definition = getCompanyDocumentDefinition(definitionId)
  const draft = getCompanyDocumentDraft(definitionId)
  if (!definition || !(draft.file instanceof File)) return false

  const validationError = validateCompanyDocumentDraft(draft.file, definitionId)
  if (validationError) {
    setFormErrors('company', {
      ...formErrors.company,
      [definitionId]: validationError,
    })
    return false
  }

  const existingDocument = companyDocumentsByDefinition.value[definitionId]
  await uploadCompanyDocument({
    file: draft.file,
    documentType: definitionId,
    documentName: definition.label,
    existingDocumentId: existingDocument?.id || '',
  })
  clearCompanyDocumentDraft(definitionId)
  setFormErrors('company', {
    ...formErrors.company,
    [definitionId]: '',
  })
  return true
}

async function uploadPendingCompanyDocuments() {
  for (const definition of companyDocumentDefinitions) {
    const draft = getCompanyDocumentDraft(definition.id)
    if (draft.file instanceof File) {
      const uploaded = await uploadCompanyDocumentDraft(definition.id)
      if (!uploaded) {
        return false
      }
    }
  }

  if (companyForm.newDocumentFile instanceof File) {
    const uploaded = await uploadCompanyDocument()
    if (!uploaded) {
      return false
    }
  }

  return true
}

function capturePendingCompanyDocumentState() {
  return {
    newDocumentFile: companyForm.newDocumentFile instanceof File ? companyForm.newDocumentFile : null,
    newDocumentName: companyForm.newDocumentName || '',
    drafts: Object.fromEntries(
      companyDocumentDefinitions.map((definition) => {
        const draft = getCompanyDocumentDraft(definition.id)
        return [
          definition.id,
          {
            file: draft.file instanceof File ? draft.file : null,
            name: draft.name || '',
          },
        ]
      }),
    ),
  }
}

function restorePendingCompanyDocumentState(snapshot = {}) {
  companyForm.newDocumentFile = snapshot.newDocumentFile instanceof File ? snapshot.newDocumentFile : null
  companyForm.newDocumentName =
    snapshot.newDocumentName || snapshot.newDocumentFile?.name || ''

  companyDocumentDefinitions.forEach((definition) => {
    const draft = snapshot.drafts?.[definition.id]
    setCompanyDocumentDraft(definition.id, draft?.file instanceof File ? draft.file : null)
  })
}

function clearCompanyFieldErrors() {
  setFormErrors('company', {
    ...formErrors.company,
    ...Object.fromEntries(COMPANY_FORM_ERROR_KEYS.map((key) => [key, ''])),
  })
}

function validateCompanyForm(options = {}) {
  const normalizedRfc = normalizeMexicanRfc(companyForm.rfc)
  companyForm.rfc = normalizedRfc

  const fieldErrors = buildCompanyFieldErrors(companyForm, {
    normalizedRfc,
    isValidRfc: isValidMexicanRfc(normalizedRfc),
    requireReviewSubmission: options.requireReviewSubmission === true,
    hasRequiredLegalDocuments:
      options.hasRequiredLegalDocuments !== false,
    allowPartialSave: options.allowPartialSave === true,
  })

  if (hasCompanyFieldErrors(fieldErrors)) {
    setFormErrors('company', {
      ...formErrors.company,
      ...fieldErrors,
    })
    return {
      valid: false,
      normalizedRfc,
      fieldErrors,
    }
  }

  clearCompanyFieldErrors()

  return {
    valid: true,
    normalizedRfc,
    fieldErrors,
  }
}

async function persistCompanyProfile(options = {}) {
  const validation = validateCompanyForm({
    requireReviewSubmission: options.requireReviewSubmission === true,
    hasRequiredLegalDocuments: options.hasRequiredLegalDocuments,
    allowPartialSave: options.allowPartialSave === true,
  })

  if (!validation.valid) {
    if (validation.fieldErrors._form) {
      showError('Expediente incompleto', validation.fieldErrors._form)
    }
    return false
  }

  const pendingDocumentsSnapshot = capturePendingCompanyDocumentState()
  const basePayload = buildCompanyPayload(companyForm, validation.normalizedRfc)
  const payload = {
    ...(options.allowPartialSave === true
      ? sanitizeCompanyPayloadForSave(basePayload)
      : basePayload),
    ...(options.statusPatch && typeof options.statusPatch === 'object' ? options.statusPatch : {}),
  }

  try {
    const response = await requestWithCandidates(buildCompanySaveCandidates(payload))
    const record = pickRecord(response, ['provider', 'company', 'empresa'])
    if (record && Object.keys(record).length) {
      hydrateCompany(record)
    } else {
      hydrateCompany(payload)
      await reloadCompany()
    }

    restorePendingCompanyDocumentState(pendingDocumentsSnapshot)

    if (options.uploadPendingDocuments !== false) {
      const uploaded = await uploadPendingCompanyDocuments()
      if (!uploaded && options.failWhenDocumentUploadFails !== false) {
        return false
      }
    }

    return true
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
        base: 'operationalBase',
        base_airport: 'operationalBase',
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
    return false
  }
}

function openCompanyDocument(document = null) {
  const targetUrl = document?.downloadUrl || document?.url || ''
  if (!targetUrl || typeof window === 'undefined') return
  window.open(targetUrl, '_blank', 'noopener,noreferrer')
}

async function openCompanyDocumentDrawer(document = null) {
  if (!document) return

  companyDocumentDrawer.open = true
  companyDocumentDrawer.document = document
  companyDocumentDrawer.versions = []
  companyDocumentDrawer.loadingVersions = true

  try {
    const versions = await getOperatorDocumentVersions(companyId.value, document.id, { role: 'provider' })
    companyDocumentDrawer.versions = Array.isArray(versions) ? versions : []
  } catch {
    companyDocumentDrawer.versions = document?.versions || []
  } finally {
    companyDocumentDrawer.loadingVersions = false
  }
}

function closeCompanyDocumentDrawer() {
  companyDocumentDrawer.open = false
  companyDocumentDrawer.document = null
  companyDocumentDrawer.versions = []
  companyDocumentDrawer.loadingVersions = false
}

async function focusCompanySection(sectionId = '') {
  if (props.section !== 'empresa') {
    await goToSection('empresa')
  }

  await nextTick()
  if (typeof window === 'undefined') return

  const selector = `[data-company-section="${sectionId}"]`
  const target = document.querySelector(selector)
  if (target instanceof HTMLElement) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const focusable = target.querySelector('input, button, textarea, select')
    if (focusable instanceof HTMLElement) {
      window.setTimeout(() => focusable.focus({ preventScroll: true }), 220)
    }
  }
}

async function handleCompanyAlertAction(alert = {}) {
  const actionKey = String(alert.actionKey || '').trim()
  if (!actionKey) return

  if (actionKey === 'fleet') {
    await focusCompanySection('fleet')
    if (!aircraft.value.length) {
      openAircraftWizard()
    }
    return
  }

  await focusCompanySection(actionKey)
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
  closeDocumentLibraryMenu()
  clearDocumentLibraryFilters()
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
    year: normalizeAircraftYear(item.year),
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
  if (!item && mode !== 'view' && !providerCanRegisterAircraft.value) {
    ui.pushToast({
      tone: 'warning',
      title: 'Captura limitada',
      message: 'No fue posible habilitar el registro de aeronaves con la configuracion actual del proveedor.',
    })
    goToSection('empresa')
    return
  }

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
  aircraftWizardStepError.value = ''
  aircraftWizardOpen.value = true
}

function closeAircraftWizard() {
  aircraftWizardOpen.value = false
  aircraftWizardReadOnly.value = false
  aircraftWizardStep.value = 1
  aircraftWizardStepError.value = ''
  cancelEditingAircraft()
  resetImageForm()
  resetDocumentForm()
  clearFormFeedback('document')
}

function clearAircraftWizardStepFeedback() {
  aircraftWizardStepError.value = ''
}

function getAircraftWizardStepErrors(step = aircraftWizardStep.value) {
  return buildAircraftWizardStepErrors(step, aircraftForm, {
    resolveAircraftYearNumber,
    aircraftYearValidationMessage,
    selectedImageCount: countSelectedImageFiles(),
    existingImageCount: selectedImageAircraft.value?.images?.length || 0,
    selectedDocumentCount: documentForm.files.length,
    existingDocumentCount: selectedDocumentAircraft.value?.documents?.length || 0,
  })
}

function validateAircraftWizardStep(step = aircraftWizardStep.value) {
  clearAircraftWizardStepFeedback()
  clearFormFeedback('aircraft')
  clearFormFeedback('document')

  const errors = getAircraftWizardStepErrors(step)
  const aircraftErrors = {}

  ;['name', 'category', 'year', 'base', 'capacity', 'speedKnots', 'hourlyPrice'].forEach((key) => {
    if (errors[key]) aircraftErrors[key] = errors[key]
  })

  if (Object.keys(aircraftErrors).length) {
    setFormErrors('aircraft', {
      ...formErrors.aircraft,
      ...aircraftErrors,
    })
  }

  if (errors._documents) {
    setFormErrors('document', {
      ...formErrors.document,
      _form: errors._documents,
    })
  }

  aircraftWizardStepError.value =
    errors._gallery || errors._documents || Object.values(aircraftErrors)[0] || ''

  return Object.keys(errors).length === 0
}

function goToAircraftWizardStep(step) {
  const nextStep = Math.min(Math.max(Number(step || 1), 1), aircraftWizardSteps.length)

  if (aircraftWizardReadOnly.value || nextStep <= aircraftWizardStep.value) {
    clearAircraftWizardStepFeedback()
    aircraftWizardStep.value = nextStep
    return true
  }

  for (let currentStep = aircraftWizardStep.value; currentStep < nextStep; currentStep += 1) {
    if (!validateAircraftWizardStep(currentStep)) {
      aircraftWizardStep.value = currentStep
      return false
    }
  }

  aircraftWizardStep.value = nextStep
  return true
}

function nextAircraftWizardStep() {
  goToAircraftWizardStep(aircraftWizardStep.value + 1)
}

function previousAircraftWizardStep() {
  clearAircraftWizardStepFeedback()
  aircraftWizardStep.value = Math.max(aircraftWizardStep.value - 1, 1)
}

function getAircraftDocumentHealth(item) {
  const validationState = getAircraftDocumentValidationState(item)
  return {
    label: validationState.label,
    tone: validationState.tone,
    detail: validationState.detail,
  }
}

function normalizeAircraftDocumentState(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'pending'
  if (['approved', 'aprobado', 'aprobada', 'vigente', 'validado', 'validada'].includes(normalized)) return 'approved'
  if (['rejected', 'rechazado', 'rechazada', 'cancelled', 'canceled'].includes(normalized)) return 'rejected'
  if (['expired', 'vencido', 'vencida'].includes(normalized) || normalized.includes('expir') || normalized.includes('venc')) return 'expired'
  return 'pending'
}

const AIRCRAFT_DOCUMENT_REQUIREMENT_ALIASES = {
  airworthiness_certificate: 'airworthiness_certificate',
  certificate_airworthiness: 'airworthiness_certificate',
  airworthiness: 'airworthiness_certificate',
  aeronavegabilidad: 'airworthiness_certificate',
  certificado_aeronavegabilidad: 'airworthiness_certificate',
  certificado_de_aeronavegabilidad: 'airworthiness_certificate',
  matricula_aeronave: 'registration',
  aircraft_registration: 'registration',
  registration: 'registration',
  registro: 'registration',
  matricula: 'registration',
  insurance_policy: 'insurance',
  aircraft_insurance: 'insurance',
  insurance: 'insurance',
  seguro: 'insurance',
  poliza: 'insurance',
  poliza_seguro: 'insurance',
  maintenance_sticker: 'maintenance',
  maintenance_sticker_document: 'maintenance',
  maintenance: 'maintenance',
  mantenimiento: 'maintenance',
  flight_logbook: 'maintenance',
  logbook: 'maintenance',
  bitacora_vuelo: 'maintenance',
  bitacora: 'maintenance',
}

const AIRCRAFT_REQUIRED_DOCUMENTS = [
  { key: 'airworthiness_certificate', label: 'Certificado de aeronavegabilidad' },
  { key: 'registration', label: 'Matricula' },
  { key: 'insurance', label: 'Seguro' },
  { key: 'maintenance', label: 'Mantenimiento' },
]

function normalizeAircraftRequirementKey(value = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  return AIRCRAFT_DOCUMENT_REQUIREMENT_ALIASES[normalized] || normalized
}

function getAircraftDocumentRequirementKeys(document = {}) {
  return [
    document.documentType,
    document.document_type,
    document.documentCategory,
    document.document_category,
    document.category,
    document.type,
    document.kind,
    document.slot,
  ]
    .map((value) => normalizeAircraftRequirementKey(value))
    .filter(Boolean)
}

function isDocumentExpiredAt(value) {
  if (!value) return false
  const rawValue = String(value).trim()
  const normalizedValue = /^\d{4}-\d{2}-\d{2}$/.test(rawValue) ? `${rawValue}T23:59:59` : rawValue
  const expiration = new Date(normalizedValue)
  return !Number.isNaN(expiration.getTime()) && expiration.getTime() < Date.now()
}

function getAircraftDocumentValidationState(item = {}) {
  const documents = Array.isArray(item?.documents) ? item.documents : []
  const requirements = AIRCRAFT_REQUIRED_DOCUMENTS.map((requirement) => {
    const matchedDocuments = documents.filter((document) =>
      getAircraftDocumentRequirementKeys(document).includes(requirement.key),
    )
    if (!matchedDocuments.length) {
      return { ...requirement, status: 'missing', documents: [] }
    }

    const hasApprovedCurrent = matchedDocuments.some((document) => {
      const status = normalizeAircraftDocumentState(document.state || document.status)
      return status === 'approved' && !isDocumentExpiredAt(document.expiresAt || document.expires_at)
    })
    const hasExpired = matchedDocuments.some((document) => {
      const status = normalizeAircraftDocumentState(document.state || document.status)
      return status === 'expired' || (status === 'approved' && isDocumentExpiredAt(document.expiresAt || document.expires_at))
    })
    const hasRejected = matchedDocuments.some((document) => normalizeAircraftDocumentState(document.state || document.status) === 'rejected')

    return {
      ...requirement,
      status: hasApprovedCurrent ? 'approved' : hasExpired ? 'expired' : hasRejected ? 'rejected' : 'pending',
      documents: matchedDocuments,
    }
  })

  const allApproved = requirements.length > 0 && requirements.every((requirement) => requirement.status === 'approved')
  const hasExpired = requirements.some((requirement) => requirement.status === 'expired')
  const hasRejected = requirements.some((requirement) => requirement.status === 'rejected')
  const hasPending = requirements.some((requirement) => requirement.status === 'pending')
  const hasMissing = requirements.some((requirement) => requirement.status === 'missing')

  if (hasExpired) {
    return { requirements, approved: false, tone: 'danger', label: 'Vencido', detail: 'Hay documentos vencidos o fuera de vigencia.' }
  }
  if (hasRejected) {
    return { requirements, approved: false, tone: 'danger', label: 'Rechazado', detail: 'Hay documentos rechazados que requieren correccion.' }
  }
  if (hasPending) {
    return { requirements, approved: false, tone: 'warning', label: 'En revision', detail: 'Documentos cargados pendientes de revision.' }
  }
  if (hasMissing) {
    return { requirements, approved: false, tone: 'warning', label: 'Sin expediente', detail: 'Faltan documentos obligatorios para aprobar la aeronave.' }
  }
  if (allApproved) {
    return { requirements, approved: true, tone: 'success', label: 'Vigente', detail: `${requirements.length} documentos obligatorios aprobados.` }
  }

  return { requirements, approved: false, tone: 'warning', label: 'Sin expediente', detail: 'Aun no tiene documentos visibles.' }
}

function getAircraftPortalState(item = {}) {
  const billingMeta = getAircraftBillingStatusMeta(item)
  const operationalStatus = obtenerEstadoOperativoAeronave(item)
  const documentHealth = getAircraftDocumentValidationState(item)
  const providerApproved = providerIsApproved.value
  const aircraftApproved = Boolean(item?.approved)
  const missingRequirements = []

  if (!providerApproved) missingRequirements.push('proveedor pendiente de aprobacion')
  if (!aircraftApproved) missingRequirements.push('aeronave pendiente de aprobacion administrativa')
  if (!documentHealth.approved) missingRequirements.push(documentHealth.detail)

  if (operationalStatus === 'hidden' && billingMeta.ready) {
    return {
      code: 'PROVIDER_HIDDEN',
      label: 'Oculta',
      badgeType: 'info',
      menuAction: 'payments',
      menuLabel: 'Ver pagos',
      disabled: false,
      tab: 'hidden',
      detail: 'La aeronave esta oculta temporalmente por el proveedor, aunque su pago sigue vigente.',
      missingRequirements,
    }
  }

  if (billingMeta.ready && isAircraftOperationallyActive(item)) {
    return {
      code: 'ACTIVE',
      label: 'Activa',
      badgeType: 'success',
      menuAction: 'payments',
      menuLabel: 'Ver pagos',
      disabled: false,
      tab: 'active',
      detail: billingMeta.detail,
      missingRequirements: [],
    }
  }

  if (billingMeta.code === 'billing_sync_required') {
    if (missingRequirements.length) {
      return {
        code: 'PENDING_REQUIREMENTS',
        label: 'Pago confirmado, pendiente de validacion',
        badgeType: 'warning',
        menuAction: 'none',
        menuLabel: 'Pendiente de validacion',
        disabled: true,
        tab: 'review',
        detail: `Pago confirmado. Falta ${missingRequirements[0]}.`,
        missingRequirements,
      }
    }

    return {
      code: 'PAYMENT_CONFIRMED_SYNCING',
      label: 'Pago confirmado',
      badgeType: 'info',
      menuAction: 'sync',
      menuLabel: 'Verificar pago',
      disabled: false,
      tab: 'pending_payment',
      detail: 'Pago confirmado, actualizando estado.',
      missingRequirements: [],
    }
  }

  if (billingMeta.code === 'billing_under_review' || operationalStatus === 'under_review') {
    return {
      code: 'REVIEW',
      label: 'En revision',
      badgeType: 'warning',
      menuAction: 'none',
      menuLabel: 'Pendiente de validacion',
      disabled: true,
      tab: 'review',
      detail: aircraftApproved ? documentHealth.detail : 'La aeronave sigue pendiente de aprobacion administrativa.',
      missingRequirements,
    }
  }

  if (billingMeta.code === 'billing_syncing') {
    return {
      code: 'PAYMENT_PENDING',
      label: 'Pago pendiente',
      badgeType: 'warning',
      menuAction: billingMeta.action,
      menuLabel: billingMeta.action === 'pay' ? 'Continuar con el pago' : 'Verificar pago',
      disabled: billingMeta.action === 'none',
      tab: 'pending_payment',
      detail: billingMeta.detail,
      missingRequirements,
    }
  }

  if (['billing_failed', 'billing_cancelled'].includes(billingMeta.code)) {
    return {
      code: 'PAYMENT_FAILED',
      label: billingMeta.label,
      badgeType: billingMeta.tone,
      menuAction: 'pay',
      menuLabel: 'Regularizar pago',
      disabled: false,
      tab: 'pending_payment',
      detail: billingMeta.detail,
      missingRequirements,
    }
  }

  if (billingMeta.code === 'billing_expired') {
    return {
      code: 'EXPIRED',
      label: billingMeta.label,
      badgeType: billingMeta.tone,
      menuAction: 'pay',
      menuLabel: 'Regularizar pago',
      disabled: false,
      tab: 'pending_payment',
      detail: billingMeta.detail,
      missingRequirements,
    }
  }

  if (billingMeta.code === 'billing_missing_state' || billingMeta.code === 'billing_inactive') {
    return {
      code: 'PAYMENT_REQUIRED',
      label: 'Pago pendiente',
      badgeType: 'warning',
      menuAction: 'pay',
      menuLabel: 'Activar aeronave',
      disabled: false,
      tab: 'pending_payment',
      detail: billingMeta.detail,
      missingRequirements,
    }
  }

  return {
    code: 'BLOCKED',
    label: 'Inactiva',
    badgeType: 'warning',
    menuAction: 'payments',
    menuLabel: 'Ver pagos',
    disabled: false,
    tab: 'inactive',
    detail: billingMeta.detail || 'La aeronave no esta disponible comercialmente.',
    missingRequirements,
  }
}

function shouldShowAircraftOperationalMenuActions(item = {}) {
  return getAircraftPortalState(item).code === 'ACTIVE'
}

function shouldShowAircraftBillingMenuAction(item = {}) {
  const portalState = getAircraftPortalState(item)
  return portalState.code !== 'ACTIVE' && portalState.menuAction !== 'none'
}

function shouldShowAircraftDocumentMenuAction(item = {}) {
  const validationState = getAircraftDocumentValidationState(item)
  return validationState.requirements.some((requirement) =>
    ['missing', 'rejected', 'expired'].includes(requirement.status),
  )
}

function getAircraftDocumentMenuLabel(item = {}) {
  const validationState = getAircraftDocumentValidationState(item)
  const needsCorrection = validationState.requirements.some((requirement) =>
    ['rejected', 'expired'].includes(requirement.status),
  )
  return needsCorrection ? 'Corregir documentos' : 'Subir documentos'
}

function isAircraftBillingMenuActionDisabled(item = {}) {
  const portalState = getAircraftPortalState(item)
  const aircraftId = Number(item?.id || 0)
  const isSyncingPayment =
    portalState.menuAction === 'sync' &&
    Number(billingStatusRefreshAircraftId.value || 0) === aircraftId

  return portalState.disabled || isAircraftBillingActionPending(aircraftId) || isSyncingPayment
}

function getAircraftBillingMenuLabel(item = {}) {
  const portalState = getAircraftPortalState(item)
  const aircraftId = Number(item?.id || 0)

  if (isAircraftBillingActionPending(aircraftId)) {
    return 'Abriendo checkout...'
  }

  if (
    portalState.menuAction === 'sync' &&
    Number(billingStatusRefreshAircraftId.value || 0) === aircraftId
  ) {
    return 'Verificando pago...'
  }

  return portalState.menuLabel
}

function getAircraftCommercialState(item = {}, provider = companyStatusMeta.value, billingMeta = null) {
  const normalizedOperationalStatus = obtenerEstadoOperativoAeronave(item)
  const normalizedAvailability = String(item?.availability || normalizedOperationalStatus || item?.status || '').toLowerCase()
  const documentHealth = getAircraftDocumentValidationState(item)
  const resolvedBillingMeta = billingMeta || getAircraftBillingStatusMeta(item)
  const reasons = []
  const providerApproved = provider?.tone === 'success'
  const aircraftApproved = Boolean(item?.approved)
  const aircraftIsActive = isAircraftOperationallyActive(item)
  const hasRange = Number(item?.rangeKm || 0) > 0
  const hasValidPrice = Number(item?.hourlyPrice || 0) > 0
  const matchingEnabled = Boolean(item?.matching_visible ?? item?.matchingVisible ?? item?.marketplace_visible ?? item?.visible_for_matching ?? false)
  const billingReady = resolvedBillingMeta?.ready === true

  if (normalizedOperationalStatus === 'hidden') {
    reasons.push('Aeronave oculta manualmente')
    return { code: 'aircraft_hidden', label: 'Oculta', tone: 'info', isAvailable: false, isActive: false, canQuote: false, canReserve: false, canMatch: false, reasons }
  }
  if (normalizedOperationalStatus === 'under_review') {
    reasons.push('Aeronave pendiente de revision administrativa')
    return { code: 'aircraft_pending', label: 'En revision', tone: 'warning', isAvailable: false, isActive: false, canQuote: false, canReserve: false, canMatch: false, reasons }
  }
  if (normalizedAvailability.includes('bloque') || normalizedAvailability.includes('suspend')) {
    reasons.push('Aeronave suspendida o bloqueada manualmente')
    return { code: 'aircraft_blocked', label: 'Inactiva', tone: 'danger', isAvailable: false, isActive: false, canQuote: false, canReserve: false, canMatch: false, reasons }
  }
  if (!providerApproved) {
    reasons.push('Proveedor pendiente de aprobacion administrativa')
    return { code: 'provider_pending', label: 'Pendiente de aprobacion', tone: 'warning', isAvailable: false, isActive: false, canQuote: false, canReserve: false, canMatch: false, reasons }
  }
  if (!aircraftApproved) {
    reasons.push('Aeronave pendiente de revision administrativa')
    return { code: 'aircraft_pending', label: 'Aeronave pendiente de revision', tone: 'warning', isAvailable: false, isActive: false, canQuote: false, canReserve: false, canMatch: false, reasons }
  }
  if (!documentHealth.approved) {
    reasons.push(documentHealth.detail === 'Faltan documentos obligatorios para aprobar la aeronave.' ? 'Documentacion incompleta' : documentHealth.detail)
    return { code: 'documents_pending', label: 'Inactiva', tone: 'warning', isAvailable: false, isActive: false, canQuote: false, canReserve: false, canMatch: false, reasons }
  }
  if (!hasRange) {
    reasons.push('Rango pendiente')
    return { code: 'missing_range', label: 'Inactiva', tone: 'warning', isAvailable: false, isActive: false, canQuote: false, canReserve: false, canMatch: false, reasons }
  }
  if (!hasValidPrice) {
    reasons.push('Sin tarifa')
    return { code: 'missing_price', label: 'Inactiva', tone: 'warning', isAvailable: false, isActive: false, canQuote: false, canReserve: false, canMatch: false, reasons }
  }
  if (!billingReady) {
    reasons.push(resolvedBillingMeta?.reasonMessage || 'Disponible despues de la aprobacion administrativa')
    return {
      code: resolvedBillingMeta?.code || 'billing_blocked',
      label: resolvedBillingMeta?.label || 'Pendiente de pago',
      tone: resolvedBillingMeta?.tone || 'warning',
      isAvailable: false,
      isActive: false,
      canQuote: false,
      canReserve: false,
      canMatch: false,
      reasons,
    }
  }
  if (!aircraftIsActive) {
    reasons.push('Aeronave inactiva')
    return { code: 'inactive', label: 'Inactiva', tone: 'warning', isAvailable: false, isActive: false, canQuote: false, canReserve: false, canMatch: false, reasons }
  }
  if (!matchingEnabled) {
    reasons.push('Matching no habilitado')
    return { code: 'matching_disabled', label: 'Inactiva', tone: 'warning', isAvailable: false, isActive: false, canQuote: false, canReserve: false, canMatch: false, reasons }
  }
  if (normalizedAvailability.includes('mantenimiento') || normalizedAvailability.includes('maintenance')) {
    reasons.push('Aeronave en mantenimiento')
    return { code: 'maintenance', label: 'Mantenimiento', tone: 'warning', isAvailable: false, isActive: true, canQuote: false, canReserve: false, canMatch: false, reasons }
  }
  if (normalizedAvailability.includes('reserv') || normalizedAvailability.includes('ocupad') || normalizedAvailability.includes('en vuelo')) {
    reasons.push('Aeronave en operacion')
    return { code: 'mission', label: 'En mision', tone: 'info', isAvailable: false, isActive: true, canQuote: false, canReserve: false, canMatch: false, reasons }
  }

  return { code: 'available', label: 'Disponible', tone: 'success', isAvailable: true, isActive: true, canQuote: true, canReserve: true, canMatch: true, reasons: ['Lista para matching, cotizacion y reserva'] }
}

function getAircraftLiveStatus(item) {
  const uiState = getAircraftUiState(item)

  return {
    code: uiState.key,
    label: uiState.label,
    tone: uiState.tone,
  }
}

function hasAircraftCommercialImages(item) {
  return Boolean(item?.mainImage || (Array.isArray(item?.images) && item.images.length))
}

function getAircraftMissingItems(item = {}) {
  const missing = []
  const documentHealth = getAircraftDocumentValidationState(item)
  const commercialState = getAircraftCommercialState(item)

  if (!String(item.name || '').trim()) missing.push('modelo')
  if (!String(item.registration || '').trim()) missing.push('matricula')
  if (!String(item.base || '').trim()) missing.push('base')
  if (!Number(item.capacity || 0)) missing.push('capacidad')
  if (!Number(item.hourlyPrice || 0)) missing.push('sin tarifa')
  if (!Number(item.rangeKm || 0)) missing.push('rango')
  if (!hasAircraftCommercialImages(item)) missing.push('fotos')
  if (!documentHealth.approved) missing.push('documentacion')
  if (!item.approved) missing.push('aprobacion admin')
  if (!commercialState.canMatch) missing.push(...commercialState.reasons.map((reason) => reason.toLowerCase()))

  return [...new Set(missing)]
}

function getAircraftMissingItemsLabel(item = {}) {
  const missing = getAircraftMissingItems(item)
  if (!missing.length) return 'Sin faltantes criticos'
  return `Faltan ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? '...' : ''}`
}

function getAircraftReadinessSummary(item = {}) {
  const missing = getAircraftMissingItems(item)
  const commercialState = getAircraftCommercialState(item)

  if (commercialState.isAvailable) {
    return {
      tone: 'success',
      label: 'Lista para cotizar y reservar',
      detail: 'Completa en datos, expediente, aprobacion y activacion comercial.',
      missing,
    }
  }

  return {
    tone: commercialState.tone,
    label: commercialState.label,
    detail: commercialState.reasons[0] || getAircraftMissingItemsLabel(item),
    missing,
  }
}

function getAircraftApprovalMeta(item = {}) {
  if (!providerIsApproved.value) return { label: 'Proveedor pendiente', tone: 'warning' }
  if (item.approved) return { label: 'Aprobada', tone: 'success' }
  if (obtenerEstadoOperativoAeronave(item) === 'under_review') return { label: 'En revision', tone: 'warning' }
  return { label: 'Pendiente admin', tone: 'warning' }
}

function getAircraftCommercialMeta(item = {}) {
  const state = getAircraftCommercialState(item)
  return {
    label: state.isAvailable ? 'Visible para clientes' : state.label,
    tone: state.tone,
    detail: state.isAvailable
      ? 'Lista para cotizaciones y reservas dentro del sistema.'
      : state.reasons[0] || 'No disponible comercialmente.',
  }
}

function getAircraftHourlyPriceLabel(item = {}) {
  return Number(item?.hourlyPrice || 0) > 0 ? formatCurrency(item.hourlyPrice) : 'Sin tarifa'
}

function toggleAircraftCatalogMenu(aircraftId) {
  aircraftCatalogMenuId.value =
    Number(aircraftCatalogMenuId.value) === Number(aircraftId) ? null : Number(aircraftId)
}

function closeAircraftCatalogMenu() {
  aircraftCatalogMenuId.value = null
}

function openAircraftWizardAtStep(item = null, step = 1, mode = 'edit') {
  openAircraftWizard(item, mode)
  aircraftWizardStep.value = Math.min(Math.max(Number(step || 1), 1), aircraftWizardSteps.length)
  closeAircraftCatalogMenu()
}

function duplicateAircraft(item) {
  if (!item) return

  startEditingAircraft(item)
  editingAircraftId.value = null
  aircraftForm.registration = ''
  imageForm.aircraftId = null
  documentForm.aircraftId = null
  aircraftWizardReadOnly.value = false
  aircraftWizardStep.value = 1
  aircraftWizardStepError.value = ''
  aircraftWizardOpen.value = true
  closeAircraftCatalogMenu()
}

function exportAircraftCatalog() {
  const rows = [
    ['Aeronave', 'Categoria', 'Matricula', 'Base', 'Pax', 'Tarifa USD/hr', 'Estado', 'Disponibilidad'],
    ...filteredAircraftCatalog.value.map((item) => [
      item.name || '',
      item.category || '',
      item.registration || '',
      item.base || '',
      String(item.capacity || ''),
      String(item.hourlyPrice || ''),
      humanizeAircraftStatus(item.status),
      getAircraftLiveStatus(item).label,
    ]),
  ]

  const csv = rows
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `aeronaves-operador-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
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
  if (!aircraftWizardReadOnly.value && !validateAircraftWizardStep(5)) return

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

function titleCaseLabel(value = '') {
  const normalized = String(value || '').trim()
  if (!normalized) return ''

  return normalized
    .split(' ')
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(' ')
}

function formatDocumentType(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'Documento'
  if (AIRCRAFT_DOCUMENT_TYPE_LABELS[normalized]) return AIRCRAFT_DOCUMENT_TYPE_LABELS[normalized]

  return titleCaseLabel(normalized.replace(/[_-]+/g, ' '))
}

function getDocumentFileExtension(name = '', mimeType = '') {
  const normalizedName = String(name || '').trim().toLowerCase()
  const explicitExtension = normalizedName.includes('.') ? normalizedName.split('.').pop() : ''
  if (explicitExtension) return explicitExtension.toUpperCase()

  const normalizedMimeType = String(mimeType || '').trim().toLowerCase()
  if (normalizedMimeType.includes('pdf')) return 'PDF'
  if (normalizedMimeType.includes('word')) return 'DOC'
  if (normalizedMimeType.includes('sheet') || normalizedMimeType.includes('excel')) return 'XLS'
  if (normalizedMimeType.startsWith('image/')) return 'IMG'

  return 'FILE'
}

function getStoredDocumentKind(document) {
  const mimeType = String(document?.fileType || '').toLowerCase()
  const fileUrl = String(document?.fileUrl || '').toLowerCase()
  const fileName = String(document?.name || '').toLowerCase()

  if (
    mimeType.startsWith('image/') ||
    /\.(png|jpg|jpeg|webp|gif|bmp|svg|heic|heif)(\?|$)/i.test(fileUrl) ||
    /\.(png|jpg|jpeg|webp|gif|bmp|svg|heic|heif)$/i.test(fileName)
  ) {
    return 'image'
  }

  if (mimeType.includes('pdf') || /\.pdf(\?|$)/i.test(fileUrl) || /\.pdf$/i.test(fileName)) {
    return 'pdf'
  }

  if (
    mimeType.includes('word') ||
    /\.(doc|docx)(\?|$)/i.test(fileUrl) ||
    /\.(doc|docx)$/i.test(fileName)
  ) {
    return 'word'
  }

  if (
    mimeType.includes('sheet') ||
    mimeType.includes('excel') ||
    /\.(xls|xlsx|csv)(\?|$)/i.test(fileUrl) ||
    /\.(xls|xlsx|csv)$/i.test(fileName)
  ) {
    return 'excel'
  }

  return 'other'
}

function getDocumentKindLabel(kind = '') {
  if (kind === 'pdf') return 'PDF'
  if (kind === 'image') return 'Imagen'
  if (kind === 'word') return 'Word'
  if (kind === 'excel') return 'Excel'
  return 'Archivo'
}

function getDocumentKindIcon(kind = '') {
  if (kind === 'pdf') return 'PDF'
  if (kind === 'image') return 'IMG'
  if (kind === 'word') return 'DOC'
  if (kind === 'excel') return 'XLS'
  return 'FILE'
}

function resolveDocumentCategory(type = '') {
  const normalized = String(type || '').trim().toLowerCase()
  const rule = AIRCRAFT_DOCUMENT_CATEGORY_RULES.find((entry) =>
    entry.matchers.some((matcher) => normalized.includes(matcher)),
  )

  return rule || { id: 'other', label: 'Otros' }
}

function getDocumentStateMeta(document = {}) {
  const normalizedState = String(document?.state || '').trim().toLowerCase()
  const expiredByDate = Boolean(document?.expiresAt) && isDocumentExpiredAt(document.expiresAt)

  if (expiredByDate || ['expired', 'vencido', 'vencida', 'rejected'].includes(normalizedState)) {
    return { key: 'expired', label: 'Vencido', tone: 'danger', dot: 'danger' }
  }

  if (['approved', 'validado', 'validated', 'vigente', 'active'].includes(normalizedState)) {
    return { key: 'valid', label: 'Vigente', tone: 'success', dot: 'success' }
  }

  if (['review', 'in_review', 'en_revision'].includes(normalizedState)) {
    return { key: 'review', label: 'En revision', tone: 'info', dot: 'info' }
  }

  if (['pending', 'pendiente', 'draft', 'uploaded'].includes(normalizedState)) {
    return { key: 'pending', label: 'Pendiente', tone: 'warning', dot: 'warning' }
  }

  if (!document?.expiresAt) {
    return { key: 'no_expiry', label: 'Sin vencimiento', tone: 'neutral', dot: 'neutral' }
  }

  return { key: 'pending', label: 'Pendiente', tone: 'warning', dot: 'warning' }
}

function getDocumentUploadedAtLabel(document = {}) {
  const source = document.updatedAt || document.uploadedAt || ''
  if (!source) return 'Fecha no disponible'
  return `Actualizado el ${formatDateCompact(source)}`
}

function normalizeStoredDocument(document = {}, index = 0) {
  const kind = getStoredDocumentKind(document)
  const category = resolveDocumentCategory(document.type)
  const stateMeta = getDocumentStateMeta(document)
  const typeLabel = formatDocumentType(document.typeLabel || document.type)
  const fileExtension = getDocumentFileExtension(document.name, document.fileType)

  return {
    ...document,
    id: document.id || `stored-${index + 1}`,
    typeLabel,
    categoryId: category.id,
    categoryLabel: category.label,
    kind,
    kindLabel: getDocumentKindLabel(kind),
    kindIcon: getDocumentKindIcon(kind),
    stateMeta,
    fileExtension,
    uploadedAtLabel: getDocumentUploadedAtLabel(document),
    expiryLabel: document.expiresAt ? formatDocumentExpiry(document.expiresAt) : 'Sin vencimiento',
    previewSupported: ['image', 'pdf'].includes(kind),
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

function clearDocumentLibraryFilters() {
  documentLibrarySearch.value = ''
  documentLibraryCategory.value = 'all'
  documentLibraryState.value = 'all'
  documentLibrarySort.value = 'recent'
}

function toggleDocumentLibraryMenu(documentId) {
  documentLibraryMenuId.value =
    documentLibraryMenuId.value === documentId ? null : documentId
}

function closeDocumentLibraryMenu() {
  documentLibraryMenuId.value = null
}

async function removeStoredAircraftDocument(aircraftId, documentId) {
  if (!aircraftId || !documentId) return

  const documentRecord = storedAircraftDocuments.value.find(
    (item) => Number(item.id) === Number(documentId),
  )
  const documentName = documentRecord?.name || `documento #${documentId}`
  const confirmed = window.confirm(
    `Deseas eliminar ${documentName}? Esta accion no se puede deshacer.`,
  )

  if (!confirmed) return

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
      message: `${documentName} ya fue eliminado de la biblioteca.`,
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

  const normalizedDocument = {
    ...item,
    typeLabel: formatDocumentType(item.typeLabel || item.type),
    stateMeta: item.stateMeta || getDocumentStateMeta(item),
    categoryLabel: item.categoryLabel || resolveDocumentCategory(item.type).label,
    uploadedAtLabel: item.uploadedAtLabel || getDocumentUploadedAtLabel(item),
    expiryLabel: item.expiresAt ? formatDocumentExpiry(item.expiresAt) : 'Sin vencimiento',
    previewSupported:
      item.previewSupported ?? ['image', 'pdf'].includes(item.kind),
  }

  documentPreview.file = normalizedDocument
  documentPreview.url = item.previewUrl || item.fileUrl || URL.createObjectURL(item.file)
  documentPreview.canPreview = Boolean(normalizedDocument.previewSupported && documentPreview.url)
  documentPreview.open = true
  closeDocumentLibraryMenu()
}

function openStoredDocumentPreview(document) {
  openDocumentPreview({
    id: `stored-${document.id}`,
    name: document.name,
    type: document.type,
    typeLabel: document.typeLabel || formatDocumentType(document.type),
    kind: document.kind || getStoredDocumentKind(document),
    previewUrl: '',
    fileUrl: document.fileUrl || '',
    fileType: document.fileType || '',
    categoryLabel: document.categoryLabel,
    stateMeta: document.stateMeta,
    uploadedAt: document.uploadedAt,
    updatedAt: document.updatedAt,
    uploadedAtLabel: document.uploadedAtLabel,
    expiresAt: document.expiresAt,
    expiryLabel: document.expiryLabel,
    previewSupported: document.previewSupported,
  })
}

function downloadDocumentFile(document = null) {
  const targetUrl = document?.fileUrl || documentPreview.file?.fileUrl || documentPreview.url || ''
  if (!targetUrl) return

  window.open(targetUrl, '_blank', 'noopener,noreferrer')
}

function showDocumentLibraryComingSoon(actionLabel = 'accion', document = null) {
  ui.pushToast({
    tone: 'info',
    title: 'Accion en preparacion',
    message: `${actionLabel} estara disponible pronto para ${document?.name || 'este documento'}.`,
  })
  closeDocumentLibraryMenu()
}

function closeDocumentPreview() {
  if (documentPreview.url && documentPreview.url !== documentPreview.file?.previewUrl) {
    URL.revokeObjectURL(documentPreview.url)
  }

  documentPreview.open = false
  documentPreview.file = null
  documentPreview.url = ''
  documentPreview.canPreview = false
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
  const response = await fetchCrewPayload()
  const collection = pickCollection(response, [
    'crew',
    'tripulation',
    'tripulacion',
    'sobrecargos',
    'data',
  ])
  crew.value = collection.map(normalizeCrew)
  markSectionLoaded('tripulacion')
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
  const response = await fetchAircraftListPayload()
  const collection = pickCollection(response, AIRCRAFT_COLLECTION_RESPONSE_KEYS)
  aircraft.value = mergeAircraftCollection(collection)
  syncAircraftScopedForms()
  markSectionLoaded('aeronaves')
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

function getRequestPrimaryActionLabel(request = {}) {
  const workflowId = resolveWorkflowState(resolveRequestWorkflowValue(request)).id
  if (['flight_confirmed', 'tracking_live'].includes(workflowId)) return 'Abrir Liberacion'
  if (
    ['contract_pending', 'contract_signed', 'payment_pending', 'payment_confirmed', 'flight_confirmed', 'tracking_live', 'completed'].includes(
      workflowId,
    )
  ) {
    return 'Flujo avanzado'
  }
  return 'Aceptar'
}

function shouldDisableRequestPrimaryAction(request = {}) {
  return getRequestPrimaryActionLabel(request) === 'Flujo avanzado'
}

function canTriggerRequestPrimaryAction(request = {}) {
  const workflowId = resolveWorkflowState(resolveRequestWorkflowValue(request)).id

  if (['flight_confirmed', 'tracking_live'].includes(workflowId)) {
    return !isUpdatingRequestStatus(request.id)
  }

  return (
    canOperatorAcceptRequest(request) &&
    !isRequestPendingValidation(request) &&
    !isUpdatingRequestStatus(request.id) &&
    !shouldDisableRequestPrimaryAction(request)
  )
}

function handleRequestPrimaryAction(request = {}) {
  const workflowId = resolveWorkflowState(resolveRequestWorkflowValue(request)).id
  if (['flight_confirmed', 'tracking_live'].includes(workflowId)) {
    openProviderRelease(request)
    return
  }

  void updateRequestStatus(request.id, 'Aceptada')
}

function getRequestHelperCopy(request = {}) {
  if (!request || !Object.keys(request).length) {
    if (requestStatusFilter.value === 'tracking') {
      return 'Aqui solo aparecen solicitudes con workflow_status en tracking activo.'
    }
    if (requestStatusFilter.value === 'coordination') {
      return 'Aqui solo aparecen solicitudes que ya salieron de la decision inicial y siguen en coordinacion.'
    }
    return 'Aqui solo aparecen solicitudes pendientes de aceptar o rechazar por el proveedor.'
  }

  const workflowValue = resolveRequestWorkflowValue(request)
  const workflowId = resolveWorkflowState(workflowValue).id
  const visualStepId = resolveOperatorVisualStepId(workflowValue)

  if (workflowId === 'provider_pending' || workflowId === 'reserved') {
    return 'Pendiente de respuesta del proveedor. Acepta o rechaza la solicitud para continuar el flujo.'
  }

  if (hasOperatorTrackingActivity(request) || workflowId === 'tracking_live') {
    return 'La solicitud ya esta en tracking activo y se separa de la bandeja de decision del proveedor.'
  }

  if (workflowId === 'rejected' || workflowId === 'cancelled') {
    return getSharedWorkflowActionCopy(workflowValue).detail
  }

  return (
    getSharedWorkflowStepDescription(visualStepId, 'current') ||
    getSharedWorkflowActionCopy(workflowValue).detail
  )
}

function resolveOperatorDecisionState(request, status) {
  if (status !== 'Aceptada') return 'rejected'
  return 'contract_pending'
}

function canOperatorAcceptRequest(request = {}) {
  const workflowId = resolveWorkflowState(resolveRequestWorkflowValue(request)).id
  return ['reserved', 'provider_pending', 'provider_accepted'].includes(workflowId)
}

function normalizeOperatorRequestIdentifier(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function getOperatorMutationRouteFamily(request = null) {
  const explicitFamily = request?.raw?.source_route_family || request?.sourceRouteFamily || ''
  if (explicitFamily === 'operator' || explicitFamily === 'proveedor') return explicitFamily
  return activeRequestsRouteFamily.value === 'operator' ? 'operator' : 'proveedor'
}

function getOperatorFlightRequestTargetIds(request = null) {
  return [...new Set(
    [
      request?.requestId,
      request?.raw?.request_id,
      request?.raw?.flight_request_id,
      request?.id,
    ]
      .map(normalizeOperatorRequestIdentifier)
      .filter(Boolean),
  )]
}

function buildOperatorDecisionCandidates(request, payload, action) {
  const family = REQUEST_MUTATION_ROUTE_FAMILIES[getOperatorMutationRouteFamily(request)]
  const targetIds = getOperatorFlightRequestTargetIds(request)

  if (!family || !targetIds.length) return []

  const actionPath = action === 'accept' ? family.acceptPath : family.rejectPath

  return targetIds.map((targetId) => ({
    method: 'post',
    path: actionPath.replace(':id', targetId),
    body: payload,
  }))
}

function buildProviderReleaseCandidates(request, payload) {
  const targetIds = getOperatorFlightRequestTargetIds(request)
  return targetIds.map((targetId) => ({
    method: 'put',
    path: `/proveedor/solicitudes/${targetId}/release-provider`,
    body: payload,
    timeoutMs: PROVIDER_RELEASE_REQUEST_TIMEOUT_MS,
  }))
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
  const isCommerciallyAvailable = getAircraftCommercialState(plane).isAvailable

  if (capacity && requestPax && capacity >= requestPax) score += 12
  if (capacity && requestPax && capacity === requestPax) score += 4
  if (base && origin && base === origin) score += 8
  if (isCommerciallyAvailable) score += 10
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
  const commercialState = getAircraftCommercialState(plane)
  if (commercialState.isAvailable) return 'Si'
  if (commercialState.code === 'aircraft_pending' || commercialState.code === 'provider_pending') return 'Revisar'
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

function buildOperationalProposal(request = {}) {
  const summary = buildProposalSummary(request)
  ui.pushToast({
    tone: summary.adjustments ? 'warning' : 'success',
    title: 'Propuesta operativa armada',
    message: `Total estimado ${formatCurrency(summary.total)} · Margen ${formatCurrency(summary.margin)}${summary.adjustments ? ' · Requiere ajustes por disponibilidad.' : ''}`,
  })
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

function getBootstrapSections(section = props.section) {
  const normalizedSection = normalizeSectionKey(section)

  if (normalizedSection === 'dashboard') {
    return ['dashboard', 'aeronaves', 'solicitudes']
  }

  if (normalizedSection === 'disponibilidad') {
    return ['dashboard', 'aeronaves', 'disponibilidad']
  }

  if (normalizedSection === 'release-provider') {
    return ['dashboard', 'solicitudes', 'aeronaves', 'tripulacion', 'release-provider']
  }

  return ['dashboard', normalizedSection].filter(Boolean)
}

async function runPortalBootstrap() {
  const currentLoadSequence = ++portalLoadSequence.value
  const bootstrapSections = getBootstrapSections(props.section)

  loading.value = true
  isBootstrapping.value = true

  try {
    const dashboardPayload = await requestWithCandidates([
      { method: 'get', path: '/proveedor/dashboard', timeoutMs: OPERATOR_BOOT_TIMEOUT_MS },
      { method: 'get', path: '/proveedor/empresa', timeoutMs: OPERATOR_BOOT_TIMEOUT_MS },
      { method: 'get', path: '/operator/dashboard', timeoutMs: OPERATOR_BOOT_TIMEOUT_MS },
    ])

    if (currentLoadSequence !== portalLoadSequence.value) {
      return
    }

    applyDashboardResponse(dashboardPayload)
    if (!isOperationalAccessReady.value) {
      clearOperationalPortalCollections()
      clearRequestsPolling()
      validNotificationsRoute.value = ''
      notificationsRouteUnavailable.value = false
      realtimeNotificationsInitialized.value = false
    }

    const canPreloadOperationalData = isOperationalAccessReady.value
    const requestJobs = []

    if (
      bootstrapSections.includes('aeronaves') &&
      !hasSectionLoaded('aeronaves') &&
      canPreloadOperationalData
    ) {
      requestJobs.push({
        request: fetchAircraftListPayload(OPERATOR_BOOT_TIMEOUT_MS),
        apply: applyAircraftResponse,
      })
    }

    if (
      bootstrapSections.includes('solicitudes') &&
      !hasSectionLoaded('solicitudes') &&
      isOperationalAccessReady.value
    ) {
      requestJobs.push({
        request: fetchRequestsPayload(OPERATOR_BOOT_TIMEOUT_MS),
        apply: (payload) => {
          applyRequestsResponse(payload)
          lastRequestsRefreshAt.value = Date.now()
        },
      })
    }

    if (
      bootstrapSections.includes('tripulacion') &&
      !hasSectionLoaded('tripulacion') &&
      canPreloadOperationalData
    ) {
      requestJobs.push({
        request: fetchCrewPayload(OPERATOR_BOOT_TIMEOUT_MS),
        apply: applyCrewResponse,
      })
    }

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
      try {
        await auth.revalidateSession()
      } catch (sessionError) {
        if (Number(sessionError?.status) === 401) {
          auth.clearAuth()
          return
        }

        throw sessionError
      }

      showError(
        'No se pudo cargar la informacion operativa',
        'Tu sesion sigue activa. Intenta nuevamente o verifica tus permisos para los endpoints operativos del proveedor.',
      )
      return
    }

    await Promise.all(
      bootstrapSections
        .filter((section) => !['dashboard', 'aeronaves', 'solicitudes', 'tripulacion'].includes(section))
        .map((section) =>
          ensureSectionDataLoaded(section, {
            timeoutMs: OPERATOR_SECTION_TIMEOUT_MS,
            source: 'bootstrap',
          }),
        ),
    )

    bootstrapSections.forEach((section) => markSectionLoaded(section))
    hasBootstrapped.value = true
  } catch (error) {
    if (currentLoadSequence !== portalLoadSequence.value) {
      return
    }

    showError(
      'No se pudo cargar el portal',
      getFriendlyOperatorErrorMessage(
        error,
        'El backend no respondio con datos del proveedor.',
        'portal-load',
      ),
    )
  } finally {
    if (currentLoadSequence === portalLoadSequence.value) {
      syncAircraftScopedForms()
      loading.value = false
      isBootstrapping.value = false
      startRequestsPolling()
      if (
        hasBootstrapped.value &&
        shouldPrimeNotificationsAfterBootstrap() &&
        !realtimeNotificationsInitialized.value
      ) {
        void loadRealtimeNotifications(OPERATOR_BACKGROUND_TIMEOUT_MS, { allowRouteDetection: true })
      }
    }
  }
}

async function loadPortal() {
  if (!canLoadProviderData.value) {
    return
  }

  if (portalBootstrapPromise) {
    return portalBootstrapPromise
  }

  portalBootstrapPromise = runPortalBootstrap()

  try {
    await portalBootstrapPromise
  } finally {
    portalBootstrapPromise = null
  }
}

async function ensureSectionDataLoaded(section = props.section, options = {}) {
  if (!canLoadProviderData.value) return

  const normalizedSection = normalizeSectionKey(section)
  const force = options.force === true
  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Number(options.timeoutMs)
    : OPERATOR_SECTION_TIMEOUT_MS

  if (!normalizedSection || (!force && hasSectionLoaded(normalizedSection))) {
    return
  }

  if (shouldBlockOperationalSectionLoad(normalizedSection)) {
    clearOperationalPortalCollections()
    if (normalizedSection === 'solicitudes') {
      lastRequestsRefreshAt.value = 0
    }
    return
  }

  if (!force && sectionLoadPromises.has(normalizedSection)) {
    return sectionLoadPromises.get(normalizedSection)
  }

  const sectionPromise = (async () => {
    let request = null
    let apply = null

    if (normalizedSection === 'empresa') {
      request = requestWithCandidates([
        { method: 'get', path: '/proveedor/empresa', timeoutMs },
        { method: 'get', path: '/proveedor/dashboard', timeoutMs },
      ])
      apply = applyDashboardResponse
    } else if (normalizedSection === 'aeronaves') {
      request = fetchAircraftListPayload(timeoutMs)
      apply = applyAircraftResponse
    } else if (normalizedSection === 'costos') {
      request = fetchAircraftListPayload(timeoutMs)
      apply = applyAircraftResponse
    } else if (normalizedSection === 'solicitudes') {
      request = fetchRequestsPayload(timeoutMs)
      apply = (payload) => {
        applyRequestsResponse(payload)
        lastRequestsRefreshAt.value = Date.now()
      }
    } else if (normalizedSection === 'operaciones') {
      request = requestWithCandidates([{ method: 'get', path: '/proveedor/operaciones', timeoutMs }])
      apply = applyOperationsResponse
    } else if (normalizedSection === 'tripulacion') {
      request = fetchCrewPayload(timeoutMs)
      apply = applyCrewResponse
    } else if (normalizedSection === 'incidencias') {
      request = fetchProviderIncidentCollection(timeoutMs)
      apply = applyIncidentsResponse
    } else if (normalizedSection === 'pagos') {
      request = requestWithCandidates([{ method: 'get', path: '/proveedor/pagos', timeoutMs }])
      apply = applyPaymentsResponse
    } else if (normalizedSection === 'historial') {
      request = requestWithCandidates([{ method: 'get', path: '/proveedor/historial', timeoutMs }])
      apply = applyHistoryResponse
    } else if (normalizedSection === 'disponibilidad') {
      const jobs = []

      if (force || !hasSectionLoaded('aeronaves')) {
        jobs.push(
          fetchAircraftListPayload(timeoutMs).then((payload) => {
            applyAircraftResponse(payload)
          }),
        )
      }

      jobs.push(
        requestWithCandidates([{ method: 'get', path: '/proveedor/disponibilidad', timeoutMs }]).then(
          (payload) => {
            applyAvailabilityResponse(payload)
          },
        ),
      )

      await Promise.all(jobs)
      markSectionLoaded('disponibilidad')
      return
    } else if (normalizedSection === 'configuracion') {
      request = requestWithCandidates([
        { method: 'get', path: '/proveedor/empresa', timeoutMs },
        { method: 'get', path: '/proveedor/dashboard', timeoutMs },
      ])
      apply = applyDashboardResponse
    } else if (normalizedSection === 'release-provider') {
      const jobs = []

      if (force || !hasSectionLoaded('solicitudes')) {
        jobs.push(
          fetchRequestsPayload(timeoutMs).then((payload) => {
            applyRequestsResponse(payload)
            lastRequestsRefreshAt.value = Date.now()
          }),
        )
      }

      if (force || !hasSectionLoaded('aeronaves')) {
        jobs.push(
          fetchAircraftListPayload(timeoutMs).then((payload) => {
            applyAircraftResponse(payload)
          }),
        )
      }

      if (force || !hasSectionLoaded('tripulacion')) {
        jobs.push(
          fetchCrewPayload(timeoutMs).then((payload) => {
            applyCrewResponse(payload)
          }),
        )
      }

      if (jobs.length) {
        await Promise.all(jobs)
      }

      markSectionLoaded('release-provider')
      return
    }

    if (!request || !apply) return

    const payload = await request
    apply(payload)
    markSectionLoaded(normalizedSection)
  })()

  if (!force) {
    sectionLoadPromises.set(normalizedSection, sectionPromise)
  }

  try {
    await sectionPromise
  } finally {
    if (!force) {
      sectionLoadPromises.delete(normalizedSection)
    }
  }
}

function schedulePortalLoad() {
  if (portalLoadScheduled || isBootstrapping.value) {
    return
  }

  portalLoadScheduled = true

  queueMicrotask(() => {
    portalLoadScheduled = false

    if (!canLoadProviderData.value) {
      return
    }

    void loadPortal()
  })
}

async function saveCompany() {
  if (savingCompany.value || sendingCompanyToReview.value) return

  savingCompany.value = true
  clearFormFeedback('company')
  try {
    const persisted = await persistCompanyProfile({
      allowPartialSave: true,
    })
    if (!persisted) return

    const skippedFields = []
    if (String(companyForm.email || '').trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(companyForm.email || '').trim())) {
      skippedFields.push('email')
      setFormErrors('company', {
        ...formErrors.company,
        email: 'El correo no se envio porque no tiene un formato valido.',
      })
    }

    pushHistory('Mi empresa', 'Datos de empresa actualizados')
    setFormSuccess(
      'company',
      skippedFields.length
        ? 'Se guardaron los cambios disponibles. Algunos campos con formato invalido no se enviaron.'
        : 'Los cambios de la empresa se guardaron correctamente.',
    )
    ui.pushToast({
      tone: 'success',
      title: 'Empresa actualizada',
      message: skippedFields.length
        ? 'La empresa se actualizo. Los campos con formato invalido se omitieron para no bloquear el guardado.'
        : 'Los datos del proveedor ya quedaron sincronizados con backend.',
    })
  } finally {
    savingCompany.value = false
  }
}

async function sendCompanyToReview() {
  if (savingCompany.value || sendingCompanyToReview.value) return

  sendingCompanyToReview.value = true
  try {
    clearFormFeedback('company')
    const hadSelectedInlineDocument = companyForm.newDocumentFile instanceof File
    const persisted = await persistCompanyProfile({
      requireReviewSubmission: true,
      hasRequiredLegalDocuments: true,
      uploadPendingDocuments: true,
    })
    if (!persisted) return

    await reloadCompany()

    if (!companyCanSendForReview.value) {
      const reviewErrors = buildCompanyFieldErrors(companyForm, {
        normalizedRfc: normalizeMexicanRfc(companyForm.rfc),
        isValidRfc: companyRfcIsValid.value,
        requireReviewSubmission: true,
        hasRequiredLegalDocuments: Boolean(companyReviewFlow.value.requirementsByKey?.legal_documents_approved),
      })
      setFormErrors('company', {
        ...formErrors.company,
        ...reviewErrors,
      })
      showError('Expediente incompleto', reviewErrors._form)
      return
    }

    const selectedFile = companyForm.newDocumentFile instanceof File ? companyForm.newDocumentFile : null
    const selectedFileName = companyForm.newDocumentName || selectedFile?.name || ''
    const submittedAt = new Date().toISOString()
    const formData = buildCompanyReviewFormData({
      selectedFile,
      selectedFileName,
      submittedAt,
    })

    if (selectedFile) {
      logCompanyReviewUpload(formData, selectedFile)
    }

    const response = await requestWithCandidates(buildCompanyReviewCandidates(formData))

    const record = pickRecord(response, ['provider', 'company', 'empresa'])
    if (record && Object.keys(record).length) {
      hydrateCompany(record)
    } else {
      company.status = 'pending_review'
      company.reviewStatus = 'En revision por Admin'
      company.adminValidationStatus = 'pending_review'
      company.operatorStatus = 'pending_review'
      company.adminReviewSubmittedAt = submittedAt
      company.accessEnabled = false
    }

    await reloadCompany()

    pushHistory('Mi empresa', 'Empresa enviada a revision')
    setFormSuccess('company', 'La empresa fue enviada a revision administrativa.')
    ui.pushToast({
      tone: 'success',
      title: 'Revision solicitada',
      message: hadSelectedInlineDocument
        ? 'La empresa y su documento legal fueron enviados para revision administrativa.'
        : 'La empresa fue enviada para su revision administrativa.',
    })
  } catch (error) {
    showError(
      'No se pudo enviar a revision',
      error.message || 'La empresa no pudo enviarse a revision en la base de datos.',
    )
  } finally {
    sendingCompanyToReview.value = false
  }
}

async function createAircraft() {
  clearFormFeedback('aircraft')
  clearAircraftWizardStepFeedback()
  uppercaseAircraftFormTextFields()
  const validationErrors = getAircraftWizardStepErrors(5)
  if (Object.keys(validationErrors).length) {
    const aircraftErrors = Object.fromEntries(
      Object.entries(validationErrors).filter(([key]) => !key.startsWith('_')),
    )
    setFormErrors('aircraft', aircraftErrors)
    aircraftWizardStepError.value =
      validationErrors._gallery || validationErrors._documents || Object.values(aircraftErrors)[0] || ''
    return showError(
      'Campos incompletos',
      aircraftWizardStepError.value || 'Completa la informacion obligatoria antes de guardar.',
    )
  }

  const payload = buildAircraftPayload(aircraftForm, {
    inferredMinimumHours: inferredAircraftMinimumHours.value,
    inferAircraftEngineType,
    knotsToKmh,
    nullableText,
    resolveAircraftYearNumber,
  })

  try {
    const response = await requestWithCandidates([
      { method: 'post', path: '/proveedor/aeronaves', body: payload },
      { method: 'post', path: '/operator/aircraft', body: payload },
    ])

    const record = pickRecord(response, AIRCRAFT_RECORD_RESPONSE_KEYS)
    const redirectTo = String(response?.redirect_to || response?.redirectTo || '').trim()
    let createdAircraft = null
    if (record && Object.keys(record).length && record.id) {
      createdAircraft = upsertAircraftRecord({ ...record, redirect_to: redirectTo })
    } else {
      await reloadAircraftList()
      createdAircraft = aircraft.value[0] || null
    }
    imageForm.aircraftId = createdAircraft?.id || imageForm.aircraftId
    documentForm.aircraftId = createdAircraft?.id || documentForm.aircraftId
    focusAircraftBilling(createdAircraft?.id || null)
    if (props.section === 'aeronaves' && createdAircraft?.id) {
      router.replace({
        name: 'operador',
        params: { section: 'aeronaves' },
        query: {
          ...route.query,
          aircraft_id: String(createdAircraft.id),
        },
      })
    }
    void loadProviderAircraftBillingPlan()
    pushHistory('Aeronaves', 'Nueva aeronave registrada')
    syncAircraftScopedForms()
    const billingPending =
      String(
        createdAircraft?.billingStatus ||
          createdAircraft?.subscriptionStatus ||
          createdAircraft?.status ||
          '',
      ).toLowerCase() === 'pending_payment'
    setFormSuccess(
      'aircraft',
      billingPending
        ? 'La aeronave se creo y quedo pendiente de pago. Continua con la activacion mensual.'
        : 'La aeronave se creo y quedo lista para continuar con imagenes, documentos y activacion mensual.',
    )
    ui.pushToast({
      tone: billingPending ? 'info' : 'success',
      title: billingPending ? 'Aeronave registrada pendiente de pago' : 'Aeronave creada',
      message: billingPending
        ? 'La aeronave fue registrada y ahora necesita la mensualidad de activacion para quedar visible.'
        : 'La aeronave ya fue registrada en backend y quedo pendiente de activacion.',
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
  const target = aircraft.value.find((item) => Number(item.id) === Number(id))
  pushHistory('Aeronaves', `Intento bloqueado de archivar aeronave #${id}`)
  ui.pushToast({
    tone: 'warning',
    title: 'Cambio operativo bloqueado',
    message: `La aeronave ${target?.registration || target?.name || `#${id}`} ya no puede cambiarse por status desde el portal proveedor. Usa facturacion o soporte administrativo.`,
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
  clearAircraftWizardStepFeedback()
  uppercaseAircraftFormTextFields()
  const validationErrors = getAircraftWizardStepErrors(5)
  if (Object.keys(validationErrors).length) {
    const aircraftErrors = Object.fromEntries(
      Object.entries(validationErrors).filter(([key]) => !key.startsWith('_')),
    )
    setFormErrors('aircraft', aircraftErrors)
    aircraftWizardStepError.value =
      validationErrors._gallery || validationErrors._documents || Object.values(aircraftErrors)[0] || ''
    return showError(
      'Edicion incompleta',
      aircraftWizardStepError.value || 'Completa la informacion obligatoria antes de guardar.',
    )
  }

  const payload = buildAircraftPayload(aircraftForm, {
    inferredMinimumHours: inferredAircraftMinimumHours.value,
    inferAircraftEngineType,
    knotsToKmh,
    nullableText,
    resolveAircraftYearNumber,
  })

  try {
    const response = await requestWithCandidates([
      { method: 'put', path: `/proveedor/aeronaves/${id}`, body: payload },
      { method: 'put', path: `/operator/aircraft/${id}`, body: payload },
    ])

    const record = pickRecord(response, AIRCRAFT_RECORD_RESPONSE_KEYS)
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

const AIRCRAFT_PRICING_FIELD_MAP = [
  ['hourly_rate', 'hourlyPrice'],
  ['minimum_hours', 'minimumHours'],
  ['repositioning_cost', 'repositioningCost'],
  ['overnight_cost', 'overnightCost'],
  ['waiting_cost', 'waitingCost'],
  ['fbo_cost', 'fboCost'],
  ['permits_cost', 'permitsCost'],
  ['catering_base_cost', 'cateringBaseCost'],
]

function buildAircraftPricingPayload(row = {}) {
  return AIRCRAFT_PRICING_FIELD_MAP.reduce((payload, [apiField, localField]) => {
    payload[apiField] = Number(row?.[localField] || 0)
    return payload
  }, {})
}

function pricingFieldsSynced(row = {}, payload = {}) {
  return AIRCRAFT_PRICING_FIELD_MAP.every(([apiField, localField]) => {
    return Number(row?.[localField] || 0) === Number(payload?.[apiField] || 0)
  })
}

function unsyncedPricingFieldLabels(row = {}, payload = {}) {
  return AIRCRAFT_PRICING_FIELD_MAP
    .filter(([apiField, localField]) => Number(row?.[localField] || 0) !== Number(payload?.[apiField] || 0))
    .map(([apiField]) => {
      const labels = {
        hourly_rate: 'precio por hora',
        minimum_hours: 'horas minimas',
        repositioning_cost: 'repo',
        overnight_cost: 'pernocta',
        waiting_cost: 'espera',
        fbo_cost: 'FBO',
        permits_cost: 'permisos',
        catering_base_cost: 'catering',
      }
      return labels[apiField] || apiField
    })
}

async function savePricing(id) {
  const row = aircraft.value.find((item) => item.id === id)
  if (!row) return

  const payload = buildAircraftPricingPayload(row)

  try {
    savingPricingAircraftId.value = Number(id)
    await requestWithCandidates([
      { method: 'put', path: `/operator/aircraft/${id}`, body: payload },
      { method: 'put', path: `/proveedor/aeronaves/${id}`, body: payload },
    ])
    await reloadAircraftList()
    const refreshedRow = aircraft.value.find((item) => Number(item.id) === Number(id)) || row
    const allFieldsSynced = pricingFieldsSynced(refreshedRow, payload)
    const pendingLabels = unsyncedPricingFieldLabels(refreshedRow, payload)
    pushHistory('Costos y tarifas', `Tarifas actualizadas para aeronave #${id}`)
    ui.pushToast({
      tone: allFieldsSynced ? 'success' : 'warning',
      title: allFieldsSynced ? 'Costos sincronizados' : 'Sincronizacion parcial',
      message: allFieldsSynced
        ? `La matriz de costos de la aeronave #${id} ya quedo sincronizada con backend.`
        : `Se guardaron cambios para la aeronave #${id}, pero backend no reflejo todavia: ${pendingLabels.join(', ')}.`,
    })
  } catch (error) {
    showError(
      'No se pudo guardar',
      error.message || 'Las tarifas no pudieron guardarse en la base de datos.',
    )
  } finally {
    savingPricingAircraftId.value = null
  }
}

async function reloadRequestsList(timeoutMs = OPERATOR_SECTION_TIMEOUT_MS) {
  const response = await fetchRequestsPayload(timeoutMs)
  if (Array.isArray(response?.__normalizedRequests)) {
    requests.value = response.__normalizedRequests
    syncRealtimeRequestsWithRequests()
    markSectionLoaded('solicitudes')
    return
  }
  const { collection, found } = pickRequestsCollectionState(response)
  if (found || !requests.value.length) {
    requests.value = collection.map(normalizeRequest)
    syncRealtimeRequestsWithRequests()
  }
  markSectionLoaded('solicitudes')
}

function shouldAutoRefreshRequests() {
  return (
    isOperationalAccessReady.value &&
    ['dashboard', 'solicitudes', 'release-provider'].includes(props.section)
  )
}

async function refreshRequestsList({ silent = true, force = false, cooldownMs = 4000 } = {}) {
  const now = Date.now()

  if (isBootstrapping.value) return requestsRefreshPromise
  if (refreshingRequests.value) return requestsRefreshPromise
  if (silent && loading.value) return
  if (!force && now - lastRequestsRefreshAt.value < cooldownMs) return requestsRefreshPromise
  if (!silent) {
    loading.value = true
  }

  refreshingRequests.value = true
  lastRequestsRefreshAt.value = now

  requestsRefreshPromise = (async () => {
    try {
      await reloadRequestsList(OPERATOR_SECTION_TIMEOUT_MS)
      if (validNotificationsRoute.value) {
        await loadRealtimeNotifications(OPERATOR_BACKGROUND_TIMEOUT_MS)
      }
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
      requestsRefreshPromise = null
    }
  })()

  return requestsRefreshPromise
}

function clearRequestsPolling() {
  if (requestsPollTimer) {
    clearInterval(requestsPollTimer)
    requestsPollTimer = null
  }
}

function startRequestsPolling() {
  clearRequestsPolling()

  if (!hasBootstrapped.value || isBootstrapping.value || !shouldAutoRefreshRequests()) return

  requestsPollTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return
    void refreshRequestsList({ silent: true })
  }, OPERATOR_REQUESTS_POLL_INTERVAL_MS)
}

function handleRequestsVisibilityRefresh() {
  if (isBootstrapping.value || !hasBootstrapped.value) return
  if (typeof document !== 'undefined' && document.hidden) return
  if (shouldAutoRefreshRequests()) {
    if (!requestsPollTimer) {
      startRequestsPolling()
    }
    void refreshRequestsList({ silent: true })
  } else if (validNotificationsRoute.value) {
    void loadRealtimeNotifications(OPERATOR_BACKGROUND_TIMEOUT_MS)
  }
}

async function reloadOperationsList() {
  const response = await requestWithCandidates([
    { method: 'get', path: '/proveedor/operaciones', timeoutMs: OPERATOR_BACKGROUND_TIMEOUT_MS },
    { method: 'get', path: '/operator/operations', timeoutMs: OPERATOR_BACKGROUND_TIMEOUT_MS },
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
  const request = findOperatorRequestByIdentifier(requests.value, id)
  const action = status === 'Aceptada' ? 'accept' : 'reject'
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
      ...buildOperatorDecisionCandidates(request, statusPayload, action),
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

  applyLocalRequestStatusUpdate(id, status, backendStatus)
  if (status === 'Aceptada') {
    requestStatusFilter.value = 'pending'
  }
  if (status === 'Rechazada') {
    requestStatusFilter.value = 'pending'
  }
  if (status === 'Aceptada' || status === 'Rechazada') {
    dismissRealtimeRequestById(request?.id || id)
    dismissRealtimeRequestById(request?.requestId || id)
    const nextPendingRequest = filteredRequests.value[0] || null
    selectedRequestId.value = nextPendingRequest?.id ? String(nextPendingRequest.id) : null
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

  // Sincroniza en segundo plano sin bloquear la tarjeta que el operador acaba de actualizar.
  window.setTimeout(() => {
    void refreshRequestsList({ silent: true, force: true, cooldownMs: 0 })
  }, 600)
}

async function saveProviderOperationalRelease(statusOverride = '', options = {}) {
  const background = Boolean(options?.background)
  const skipWorkflowPromotion = Boolean(options?.skipWorkflowPromotion)
  const workflowStageOverride = String(options?.workflowStageOverride || '').trim()
  const request = getActiveProviderReleaseRequest()
  if (!request) return
  if (!canManageProviderOperationalRelease(request) || syncingProviderOperationalRelease.value) {
    return
  }

  const nextStatus =
    statusOverride ||
    (statusOverride === 'pending' ? 'pending' : getProviderOperationalReleaseCurrentStatus())

  if (statusOverride === 'aircraft_confirmed' && !isProviderAircraftConfirmedReady()) {
    return showError(
      'Falta validacion de aeronave',
      'Confirma disponibilidad real, mantenimiento y cobertura completa antes de marcar aircraft_confirmed.',
    )
  }

  if (statusOverride === 'crew_confirmed' && !isProviderCrewConfirmedReady()) {
    return showError(
      'Falta validar tripulacion',
      'Confirma capitan, copiloto, requisitos, horarios y documentacion operativa antes de confirmar la tripulacion.',
    )
  }

  if (statusOverride === 'operational_ready' && !isProviderOperationalReady()) {
    return showError(
      'Liberacion operativa incompleta',
      'Confirma aeronave, Tripulacion, permisos, handling y alistamiento final antes de marcar operational_ready.',
    )
  }

  const aircraftRecord = getProviderOperationalReleaseAircraftRecord()
  const releasePayload = {
    status: nextStatus,
    aircraft_id: providerOperationalReleaseForm.aircraftId || null,
    aircraft_label: aircraftRecord
      ? `${aircraftRecord.name}${aircraftRecord.registration ? ` · ${aircraftRecord.registration}` : ''}`
      : getProviderOperationalReleaseAircraftLabel(),
    availability_confirmed: providerOperationalReleaseForm.availabilityConfirmed,
    maintenance_clear: providerOperationalReleaseForm.maintenanceClear,
    route_coverage_confirmed: providerOperationalReleaseForm.routeCoverageConfirmed,
    aircraft_overall_status: providerOperationalReleaseForm.aircraftOverallStatus,
    captain_status: providerOperationalReleaseForm.captainStatus,
    copilot_status: providerOperationalReleaseForm.copilotStatus,
    crew_availability_status: providerOperationalReleaseForm.crewAvailabilityStatus,
    crew_requirements_status: providerOperationalReleaseForm.crewRequirementsStatus,
    crew_overall_status: providerOperationalReleaseForm.crewOverallStatus,
    crew_available: isProviderOperationalStatusConfirmed(
      providerOperationalReleaseForm.crewAvailabilityStatus,
    ),
    crew_requirements_confirmed: isProviderOperationalStatusConfirmed(
      providerOperationalReleaseForm.crewRequirementsStatus,
    ),
    crew_schedule_confirmed: providerOperationalReleaseForm.crewScheduleConfirmed,
    crew_documents_ready: providerOperationalReleaseForm.crewDocumentsReady,
    departure_airport: providerOperationalReleaseForm.departureAirport,
    arrival_airport: providerOperationalReleaseForm.arrivalAirport,
    fbo: providerOperationalReleaseForm.fbo,
    flight_plan_ready: providerOperationalReleaseForm.flightPlanReady,
    permits_ready: providerOperationalReleaseForm.permitsReady,
    handling_ready: providerOperationalReleaseForm.handlingReady,
    fuel_ready: providerOperationalReleaseForm.fuelReady,
    cleaning_ready: providerOperationalReleaseForm.cleaningReady,
    documents_ready: providerOperationalReleaseForm.documentsReady,
    insurance_ready: providerOperationalReleaseForm.insuranceReady,
    registration_ready: providerOperationalReleaseForm.registrationReady,
    logbook_ready: providerOperationalReleaseForm.logbookReady,
    notes: providerOperationalReleaseForm.notes,
    updated_at: new Date().toISOString(),
  }

  const payload = {
    provider_operational_release: releasePayload,
    operational_status: nextStatus,
    aircraft_confirmed: ['aircraft_confirmed', 'crew_confirmed', 'operational_ready'].includes(
      nextStatus,
    ),
    crew_confirmed: ['crew_confirmed', 'operational_ready'].includes(nextStatus),
    operational_ready: nextStatus === 'operational_ready',
  }

  let sharedWorkflowStatus = ''
  if (!skipWorkflowPromotion && (nextStatus === 'operational_ready' || workflowStageOverride)) {
    const requestWorkflowId = resolveWorkflowState(resolveRequestWorkflowValue(request)).id
    const nextWorkflowStage =
      workflowStageOverride ||
      (requestWorkflowId === 'flight_confirmed' ? 'tracking_live' : 'flight_confirmed')

    if (nextWorkflowStage === 'tracking_live' && !hasAssignedCrewForRequest(request)) {
      const assignmentMessage =
        'Asigna primero la sobrecargo desde administracion antes de mover el vuelo a tracking en vivo.'

      if (background) {
        providerOperationalReleaseFeedback.value = assignmentMessage
        return
      }

      return showError('Sobrecargo pendiente', assignmentMessage)
    }

    const sharedWorkflowPayload = buildWorkflowApiPayload(nextWorkflowStage)
    sharedWorkflowStatus = sharedWorkflowPayload.status
    Object.assign(payload, sharedWorkflowPayload, {
      state: sharedWorkflowPayload.status,
    })
  }

  syncingProviderOperationalRelease.value = true
  savingProviderOperationalRelease.value = !background

  try {
    await requestWithCandidates([
      ...buildProviderReleaseCandidates(request, payload),
    ])

    applyLocalProviderOperationalRelease(request.id, releasePayload, sharedWorkflowStatus)
    providerOperationalReleaseDirty.value = false
    providerOperationalReleaseLoadedRequestId.value = getProviderOperationalReleaseRequestId(request)

    try {
      await reloadRequestsList()
    } catch {
      // Dejamos la actualizacion local para no bloquear la UI si el backend tarda en reflejar cambios.
    }

    if (background) {
      providerOperationalReleaseFeedback.value =
        'Cambios guardados automaticamente en la base de datos.'
    } else {
      ui.pushToast({
        tone: nextStatus === 'operational_ready' ? 'success' : 'info',
        title:
          sharedWorkflowStatus === 'completed'
            ? 'Vuelo finalizado'
            : nextStatus === 'operational_ready'
            ? 'Liberacion operativa confirmada'
            : `Estado ${getProviderOperationalReleaseStatusMeta(nextStatus).label} guardado`,
        message:
          sharedWorkflowStatus === 'completed'
            ? 'El flujo compartido avanzo a completado.'
            : nextStatus === 'operational_ready'
            ? 'La operacion del proveedor ya quedo lista y el flujo compartido avanza a tracking activo.'
            : 'La liberacion operativa quedo registrada en la solicitud del proveedor.',
      })
      providerOperationalReleaseFeedback.value =
        sharedWorkflowStatus === 'completed'
          ? 'Vuelo finalizado correctamente. El flujo compartido quedo cerrado.'
          : nextStatus === 'operational_ready'
          ? 'Liberacion enviada al equipo administrativo. El flujo del vuelo fue actualizado y la operacion pasa a tracking activo.'
          : 'El avance operativo quedo guardado y el equipo administrativo puede seguir la coordinacion centralizada.'

      pushHistory(
        'Solicitudes',
        `Liberacion operativa ${nextStatus} registrada para solicitud #${request.id}`,
      )
    }

    if (sharedWorkflowStatus) {
      emitWorkflowSync({
        scope: 'reservation-workflow',
        reservationId: request.reservationId || request.requestId || request.id,
        requestId: request.requestId || request.id,
        nextStage: sharedWorkflowStatus,
        action: 'updated',
      })
    }
  } catch (error) {
    if (providerOperationalReleaseAutosaveQueued.value) {
      providerOperationalReleaseAutosaveQueued.value = false
      scheduleProviderOperationalReleaseAutosave()
    }
    if (isBackendConnectionError(error)) {
      clearRequestsPolling()
      if (background) {
        providerOperationalReleaseFeedback.value =
          'No se pudo guardar automaticamente porque el backend no esta disponible.'
        return
      }
      return showError('Backend no disponible', getBackendConnectionMessage())
    }

    const message = error?.candidateAttempts?.length
      ? 'El backend no acepto ninguna ruta compatible para la confirmacion operacional.'
      : error.message || 'La confirmacion operacional no pudo guardarse en la base de datos.'

    if (background) {
      providerOperationalReleaseFeedback.value = `No se pudo guardar automaticamente: ${message}`
      return
    }

    return showError('No se pudo guardar la liberacion operativa', message)
  } finally {
    syncingProviderOperationalRelease.value = false
    savingProviderOperationalRelease.value = false

    if (providerOperationalReleaseAutosaveQueued.value || providerOperationalReleaseDirty.value) {
      providerOperationalReleaseAutosaveQueued.value = false
      scheduleProviderOperationalReleaseAutosave()
    }
  }
}

async function submitProviderReleasePrimaryAction() {
  const workflowId = getProviderOperationalWorkflowStage()

  if (workflowId === 'completed') {
    return
  }

  if (workflowId === 'tracking_live') {
    await saveProviderOperationalRelease('operational_ready', {
      workflowStageOverride: 'completed',
    })
    return
  }

  await saveProviderOperationalRelease('operational_ready')
}

async function submitProviderOperationalIssue() {
  const request = getActiveProviderReleaseRequest()
  if (!request || savingProviderOperationalIssue.value) return

  if (!providerOperationalIssueForm.type || !providerOperationalIssueForm.comment.trim()) {
    return showError(
      'Incidencia incompleta',
      'Selecciona el tipo de incidencia y agrega una nota para que el equipo administrativo pueda coordinarla.',
    )
  }

  const linkedOperation =
    operations.value.find((item) => Number(item.requestId || 0) === Number(request.id || 0)) ||
    operations.value.find((item) => Number(item.id || 0) === Number(request.operationId || 0)) ||
    null

  if (!linkedOperation?.id) {
    return showError(
      'Operacion no encontrada',
      'No hay una operacion ligada a esta solicitud para reportar la incidencia al backend.',
    )
  }

  const payload = {
    operation_id: linkedOperation.id,
    type: providerOperationalIssueForm.type,
    flight: getRequestRouteLabel(request),
    status: 'Abierta',
    priority: 'Alta',
    comment: providerOperationalIssueForm.comment.trim(),
  }

  savingProviderOperationalIssue.value = true

  try {
    const response = await requestWithCandidates([
      { method: 'post', path: '/proveedor/incidencias', body: payload },
    ])
    incidents.value.unshift(normalizeIncident(pickRecord(response, ['incident', 'data'])))
  } catch (error) {
    savingProviderOperationalIssue.value = false
    return showError(
      'No se pudo reportar la incidencia',
      error.message || 'La incidencia operativa no pudo guardarse en la base de datos.',
    )
  }

  providerOperationalIssueForm.type = 'Aeronave no disponible'
  providerOperationalIssueForm.comment = ''
  providerOperationalReleaseFeedback.value =
    'Incidencia operativa enviada al equipo administrativo. Se dara seguimiento y se mantendra informado al cliente.'
  savingProviderOperationalIssue.value = false
  ui.pushToast({
    tone: 'warning',
    title: 'Incidencia reportada',
    message: 'El equipo administrativo ya recibio la incidencia operativa para coordinar la solucion.',
  })
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

  if (formErrors.incident.evidence) {
    return showError(
      'Evidencia invalida',
      'Ajusta los archivos adjuntos antes de enviar la incidencia al backend en AWS.',
    )
  }

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

  const formData = new FormData()
  formData.append('operation_id', linkedOperation.id)
  formData.append('type', incidentForm.type)
  formData.append('flight', incidentForm.flight)
  formData.append('status', incidentForm.status)
  formData.append('priority', incidentForm.priority)
  if (incidentForm.responsible) formData.append('responsible', incidentForm.responsible)
  if (incidentForm.evidence) formData.append('evidence', incidentForm.evidence)
  formData.append('comment', incidentForm.comment)
  if (incidentForm.actionTaken) formData.append('action_taken', incidentForm.actionTaken)
  ;(incidentForm.files || []).forEach((file) => {
    if (file instanceof File) {
      formData.append('files[]', file)
    }
  })

  try {
    const incidentFlight = incidentForm.flight
    const response = await requestWithCandidates([
      { method: 'postForm', path: '/proveedor/incidencias', formData },
    ])
    const createdIncident = pickRecord(response, ['incident', 'data'])
    if ((!Array.isArray(createdIncident?.files) || !createdIncident.files.length) && incidentForm.files.length) {
      createdIncident.files = incidentForm.files.map((file, index) => ({
        id: `local-${Date.now()}-${index}`,
        original_name: file.name,
        file_name: file.name,
        mime_type: file.type || '',
      }))
    }
    incidents.value.unshift(normalizeIncident(createdIncident))
    Object.assign(incidentForm, {
      requestId: null,
      type: 'Problema operativo',
      flight: '',
      status: 'Abierta',
      priority: 'Media',
      responsible: '',
      evidence: '',
      files: [],
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
        files: 'evidence',
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

async function respondToIncident(incident) {
  if (!incident || isIncidentResolved(incident.status)) return
  await updateIncidentStatus(incident.id, 'En revision')
}

function viewIncidentDetail(incident) {
  if (!incident) return
  incidentDetailModal.incident = incident
  incidentDetailModal.open = true
}

function closeIncidentDetail() {
  incidentDetailModal.open = false
  incidentDetailModal.incident = null
}

async function markIncidentInReview(incident) {
  if (!incident) return
  await updateIncidentStatus(incident.id, 'En revision')
  if (incidentDetailModal.incident?.id === incident.id) {
    incidentDetailModal.incident = {
      ...incidentDetailModal.incident,
      status: 'En revision',
    }
  }
}

function buildIncidentTimeline(incident = {}) {
  if (!incident) return []

  const timeline = [
    {
      id: `${incident.id}-created`,
      at: incident.createdAt,
      title: 'Incidencia creada',
      detail: incident.reporterName
        ? `Reportada por ${incident.reporterName}.`
        : 'Registro inicial de la incidencia operativa.',
    },
  ]

  if (incident.evidenceFiles?.length || (incident.evidence && incident.evidence !== 'Pendiente')) {
    timeline.push({
      id: `${incident.id}-evidence`,
      at: incident.createdAt,
      title: 'Evidencia adjunta',
      detail: incident.evidenceFiles?.length
        ? incident.evidenceFiles.map((file) => file.name).join(', ')
        : incident.evidence,
    })
  }

  timeline.push({
    id: `${incident.id}-status`,
    at: incident.updatedAt || incident.createdAt,
    title: `Estado actual: ${incident.status}`,
    detail: incident.responsible
      ? `Responsable visible: ${incident.responsible}.`
      : 'Pendiente de asignacion operativa.',
  })

  return timeline.filter((item) => item.at || item.title)
}

function openPendingAction(action = {}) {
  if (action.incidentId) {
    const incident = providerOpenIncidents.value.find((item) => item.id === action.incidentId)
    if (incident) {
      void respondToIncident(incident)
      return
    }
  }

  if (action.requestId) {
    selectedRequestId.value = action.requestId
  }

  goToSection(action.section || 'incidencias')
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

    if (nextProviderId !== previousProviderId && !isBootstrapping.value) {
      hasBootstrapped.value = false
      resetLoadedSection(
        'dashboard',
        'empresa',
        'aeronaves',
        'costos',
        'solicitudes',
        'operaciones',
        'tripulacion',
        'incidencias',
        'pagos',
        'historial',
        'disponibilidad',
        'configuracion',
        'release-provider',
      )
      validNotificationsRoute.value = ''
      notificationsRouteUnavailable.value = false
      realtimeNotificationsInitialized.value = false
      schedulePortalLoad()
    }
  },
  { immediate: true },
)

watch(
  () => [imageForm.aircraftId, documentForm.aircraftId],
  ([nextImageAircraftId, nextDocumentAircraftId]) => {
    const hydratedIds = [...new Set([nextImageAircraftId, nextDocumentAircraftId].filter(Boolean))]
    hydratedIds.forEach((aircraftId) => {
      void hydrateAircraftDetail(aircraftId)
    })
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

    if (
      !nextRequests.some(
        (request) => matchesOperatorRequestIdentifier(request, selectedRequestId.value),
      )
    ) {
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
    window.addEventListener('pointerdown', unlockNotificationAudio, { once: true })
    window.addEventListener('keydown', unlockNotificationAudio, { once: true })
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleRequestsVisibilityRefresh)
  }
  removeWorkflowSyncSubscription = subscribeWorkflowSync((payload = {}) => {
    if (payload.scope !== 'reservation-workflow') return
    if (!shouldAutoRefreshRequests()) return
    if (!hasBootstrapped.value || isBootstrapping.value) return
    void refreshRequestsList({ silent: true })
  })
  subscribeProviderFlightRequests()
  if (props.section === 'aeronaves') {
    void loadProviderAircraftBillingPlan()
  }
})

onBeforeUnmount(() => {
  clearRequestsPolling()
  unsubscribeProviderFlightRequests()
  clearProviderOperationalReleaseAutosaveTimer()
  if (removeWorkflowSyncSubscription) {
    removeWorkflowSyncSubscription()
    removeWorkflowSyncSubscription = null
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('focus', handleRequestsVisibilityRefresh)
    window.removeEventListener('pointerdown', unlockNotificationAudio)
    window.removeEventListener('keydown', unlockNotificationAudio)
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleRequestsVisibilityRefresh)
  }
})

watch(
  () => isOperationalAccessReady.value,
  (nextReady, previousReady) => {
    if (!nextReady) {
      clearOperationalPortalCollections()
      clearRequestsPolling()
      validNotificationsRoute.value = ''
      notificationsRouteUnavailable.value = false
      realtimeNotificationsInitialized.value = false
      return
    }

    if (previousReady === false && hasBootstrapped.value && !isBootstrapping.value) {
      resetLoadedSection(...Array.from(OPERATOR_OPERATIONAL_SECTIONS))
      if (isOperationalSection(props.section)) {
        void ensureSectionDataLoaded(props.section, {
          force: true,
          timeoutMs: OPERATOR_SECTION_TIMEOUT_MS,
        })
      }
      startRequestsPolling()
    }
  },
  { immediate: true },
)

watch(
  () => props.section,
  async (nextSection) => {
    if (nextSection !== 'release-provider') {
      clearProviderOperationalReleaseAutosaveTimer()
    }

    if (!hasBootstrapped.value) {
      schedulePortalLoad()
      return
    }

    startRequestsPolling()

    if (!hasSectionLoaded(nextSection)) {
      try {
        loading.value = true
        await ensureSectionDataLoaded(nextSection, {
          timeoutMs: OPERATOR_SECTION_TIMEOUT_MS,
          source: 'section-watch',
        })
      } catch (error) {
        showError(
          'No se pudo cargar la seccion',
          error.message || 'La seccion seleccionada no pudo sincronizarse con el backend.',
        )
      } finally {
        loading.value = false
      }
    }

    if (shouldAutoRefreshRequests() && !hasSectionLoaded('solicitudes')) {
      void refreshRequestsList({ silent: true, force: true, cooldownMs: 0 })
    } else if (validNotificationsRoute.value && !shouldAutoRefreshRequests()) {
      void loadRealtimeNotifications(OPERATOR_BACKGROUND_TIMEOUT_MS)
    }

    if (nextSection === 'aeronaves') {
      void loadProviderAircraftBillingPlan()
    }
  },
)

watch(
  () => providerId.value,
  () => {
    subscribeProviderFlightRequests()
    if (hasBootstrapped.value && !isBootstrapping.value && validNotificationsRoute.value) {
      void loadRealtimeNotifications(OPERATOR_BACKGROUND_TIMEOUT_MS)
    }
  },
)

watch(
  () => [props.section, route.query[AIRCRAFT_WIZARD_ROUTE_QUERY_KEY]],
  () => {
    void syncAircraftWizardRouteIntent()
  },
  { immediate: true },
)

watch(
  () => [props.section, route.query.billing, route.query.aircraft_id],
  () => {
    if (props.section !== 'aeronaves') return
    syncAircraftBillingFocusFromRoute()
    void handleAircraftBillingReturnFromRoute()
  },
  { immediate: true },
)

watch(
  () => [props.section, route.query.payments_tab],
  ([nextSection, nextTab]) => {
    if (nextSection !== 'pagos') return
    setPaymentsTab(String(nextTab || '').trim().toLowerCase() || 'operations')
  },
  { immediate: true },
)


    return {
      route,
      router,
      auth,
      ui,
      loading,
      refreshingRequests,
      portalLoadSequence,
      portalLoadScheduled,
      OPERATOR_REQUESTS_POLL_INTERVAL_MS,
      OPERATOR_BOOT_TIMEOUT_MS,
      OPERATOR_SECTION_TIMEOUT_MS,
      OPERATOR_BACKGROUND_TIMEOUT_MS,
      PROVIDER_OPERATIONAL_RELEASE_AUTOSAVE_MS,
      requestsPollTimer,
      removeWorkflowSyncSubscription,
      providerOperationalReleaseAutosaveTimer,
      OPERATOR_FLOW_STEPS,
      companyId,
      settings,
      availabilityStatusOptions,
      operationStatusOptions,
      incidentStatusOptions,
      incidentTypeOptions,
      crewRoleOptions,
      crewStateOptions,
      defaultCrewBases,
      company,
      aircraft,
      availability,
      requests,
      realtimeRequests,
      visibleRealtimeRequests,
      unreadRealtimeCount,
      visibleUnreadRealtimeCount,
      realtimeNotifications,
      activeRealtimeNotifications,
      realtimeNotificationsOpen,
      unreadRealtimeNotifications,
      operations,
      crew,
      incidents,
      payments,
      paymentsTab,
      paymentTabs,
      history,
      providerAircraftBillingPlan,
      loadingProviderAircraftBillingPlan,
      billingFocusAircraftId,
      billingFocusedAircraft,
      providerAircraftPlanAmount,
      providerAircraftBillingAmount,
      providerAircraftFlowSubject,
      providerAircraftActivationFlow,
      activatingAircraftId,
      billingStatusRefreshAircraftId,
      editingAircraftId,
      selectedAvailabilityCalendarAircraftId,
      availabilityWeekAnchor,
      companyForm,
      savingCompany,
      sendingCompanyToReview,
      aircraftForm,
      imageForm,
      documentForm,
      documentLibrarySearch,
      documentLibraryCategory,
      documentLibraryState,
      documentLibrarySort,
      documentLibraryMenuId,
      documentPreview,
      incidentDetailModal,
      availabilityForm,
      incidentForm,
      crewForm,
      formErrors,
      formSuccess,
      aircraftWizardOpen,
      aircraftWizardStep,
      aircraftWizardStepError,
      aircraftWizardSubmitting,
      aircraftWizardReadOnly,
      editingCrewId,
      savingCrew,
      operationCrewDrafts,
      requestSearch,
      requestStatusFilter,
      requestPriorityFilter,
      selectedRequestId,
      requestInternalCommentDraft,
      archivedTrayOpen,
      requestStatusUpdate,
      savingProviderOperationalRelease,
      syncingProviderOperationalRelease: computed(() => false),
      savingProviderOperationalIssue,
      providerOperationalReleaseFeedback,
      providerOperationalReleaseForm,
      providerOperationalReleaseDirty,
      providerOperationalReleaseHydrating,
      providerOperationalReleaseLoadedRequestId,
      providerOperationalReleaseAutosaveQueued,
      providerOperationalReleaseActiveStep,
      providerOperationalIssueOpen,
      providerOperationalIssueForm,
      requestsConnectionWarningShown,
      sectionLoadState,
      operatorRouteSectionLoadingVisible,
      operatorRouteSectionLoadingMeta,
      aircraftDecisionMode,
      aircraftFilterBase,
      aircraftFilterType,
      aircraftFilterSort,
      aircraftCatalogSearch,
      aircraftCatalogStatus,
      aircraftCatalogBase,
      aircraftCatalogCategory,
      aircraftCatalogView,
      aircraftCatalogMenuId,
      aircraftWizardSteps,
      aircraftCategoryOptions,
      aircraftCategoryRules,
      aircraftDocumentTypes,
      maxAircraftDocumentFiles,
      maxImageDocumentBytes,
      maxPdfDocumentBytes,
      maxIncidentEvidenceFiles,
      maxIncidentEvidenceTotalBytes,
      providerId,
      canLoadProviderData,
      providerOperationalAccess,
      isOperationalAccessReady,
      currentOperationalBlockNotice,
      isOperationalSection,
      providerName,
      activeAircraft,
      aircraftPaymentsActive,
      aircraftPaymentsPending,
      operationalPayments,
      aircraftPaymentRows,
      filteredAircraftPaymentRows,
      selectedPaymentsAircraftId,
      selectedPaymentsAircraft,
      selectedAircraftPaymentTimeline,
      selectedPaymentTimeline,
      latestSelectedAircraftPayment,
      providerAircraftBillingCurrency,
      pendingPaymentRecords,
      paymentExecutiveSummary,
      paymentRevenueOverview,
      renewalCenterRows,
      providerPaymentProfile,
      paymentHistoryFeed,
      showAircraftPaymentsTable,
      pendingRequests,
      activeOperations,
      flightTrackingOperations,
      selectedOperationId,
      selectedTrackingOperation,
      flightTrackingKpis,
      selectedTrackingOperationFacts,
      selectedTrackingTimeline,
      selectedTrackingDetails,
      selectedTrackingEvents,
      openIncidents,
      paymentsPending,
      providerOpenIncidents,
      isIncidentsSectionLoading,
      providerPendingRequestRecords,
      providerUpcomingOperations,
      providerNextOperation,
      providerIncidentOperationOptions,
      providerOperationalSummary,
      operationsStableState,
      operationalAlerts,
      operationalActivityTimeline,
      operationalQuickActions,
      aircraftOptions,
      selectedAvailabilityAircraft,
      availabilityCalendarAircraftOptions,
      availabilityCalendarWeekDays,
      availabilityCalendarRows,
      availabilityCalendarWindowLabel,
      selectedImageAircraft,
      selectedDocumentAircraft,
      selectedDocumentType,
      documentLibraryCategoryOptions,
      documentLibraryStateOptions,
      documentLibrarySortOptions,
      documentLibrarySummary,
      filteredStoredAircraftDocuments,
      crewBases,
      assignableCrewOptions,
      crewLastSyncLabel,
      crewBackendStatus,
      crewConnectedUsers,
      fleetGroupedByStatus,
      aircraftPricingRows,
      dashboardCards,
      aircraftDueDocuments,
      aircraftAvailableToday,
      aircraftOperationalKpis,
      aircraftCatalogBaseOptions,
      aircraftCatalogCategoryOptions,
      aircraftCatalogStatusTabs,
      filteredAircraftCatalog,
      aircraftOperationalTimeline,
      aircraftPriorityNotes,
      aircraftWizardTitle,
      aircraftWizardCurrentStepMeta,
      aircraftWizardCompletion,
      aircraftWizardModeMeta,
      aircraftWizardReviewState,
      aircraftWizardSnapshot,
      companyStatusMeta,
      companyRfcIsValid,
      companyHasIdentityData,
      companyHasContactData,
      companySatApproved,
      companyProfileItems,
      companyCommercialItems,
      companyFleetSummary,
      companyDocumentsByDefinition,
      companySharedDocuments,
      companySatDocument,
      companyRequiredLegalDocuments,
      companyLegalDocumentsComplete,
      companyLegalDocumentsApproved,
      companyAdminDecisionCopy,
      companyRequirementResponses,
      companyLastAuditDate,
      companyOperationalBase,
      companyReadinessChecklist,
      companyOnboardingProgress,
      companyValidationSummary,
      companyAlerts,
      companyAuditTimeline,
      companySharedActivity,
      companyDocumentDrawer,
      dashboardCompletion,
      dashboardGlobalStatus,
      dashboardAlerts,
      companyReviewFlow,
      companyCanSendForReview,
      providerCanRegisterAircraft,
      dashboardQuickActions,
      dashboardChecklist,
      dashboardRecentActivity,
      availabilityStatusCatalog,
      availabilityReadyCount,
      providerAvailabilityUpdatesPending,
      availabilityImmediatePercent,
      availabilityGlobalStatus,
      availabilitySummaryCards,
      providerIncidentDashboardCards,
      providerPendingActions,
      availabilityFormSteps,
      requestKpis,
      requestStatusTabs,
      archivedRequests,
      filteredRequests,
      selectedRequest,
      releaseProviderRequest,
      providerOperationalReleaseAircraftOptions,
      operationWorkflowOptions,
      requestOperationalAlerts,
      selectedRequestAircraftComparison,
      selectedRequestWorkflowPreview,
      providerOperationalBinaryStatusOptions,
      providerOperationalCrewOverallOptions,
      providerOperationalAircraftOverallOptions,
      createEmptyCompany,
      createEmptyProviderOperationalReleaseForm,
      resetProviderOperationalReleaseForm,
      getProviderOperationalReleaseRequestId,
      getProviderOperationalReleaseStatusMeta,
      normalizeProviderOperationalRelease,
      hydrateProviderOperationalReleaseForm,
      getProviderOperationalReleaseAircraftRecord,
      getActiveProviderReleaseRequest,
      getProviderOperationalReleaseAircraftLabel,
      clearProviderOperationalReleaseAutosaveTimer,
      scheduleProviderOperationalReleaseAutosave,
      persistProviderOperationalReleaseDraft,
      flushProviderOperationalReleaseDraft,
      isProviderOperationalStatusConfirmed,
      isProviderAircraftConfirmedReady,
      isProviderCrewConfirmedReady,
      isProviderOperationalReady,
      deriveProviderOperationalReleaseStatus,
      getProviderOperationalReleaseCurrentStatus,
      getProviderOperationalWorkflowStage,
      isProviderReleaseFinalized,
      getProviderReleasePrimaryActionLabel,
      getProviderReleasePrimaryActionStatus,
      canManageProviderOperationalRelease,
      buildProviderOperationalReleaseChecklist,
      getProviderOperationalReleaseProgress,
      getProviderOperationalAircraftSectionStatus,
      getProviderOperationalCrewSectionStatus,
      getProviderOperationalDispatchSectionStatus,
      getProviderOperationalReadinessSectionStatus,
      getProviderOperationalFinalSummary,
      getProviderOperationalSectionCompletion,
      buildProviderOperationalWizardSections,
      setProviderOperationalActiveStep,
      toggleProviderOperationalIssuePanel,
      requestProviderOperationalSupport,
      submitProviderReleasePrimaryAction,
      applyLocalProviderOperationalRelease,
      syncCompanyForm,
      pushHistory,
      showError,
      isBackendConnectionError,
      getBackendConnectionMessage,
      clearFormFeedback,
      setFormSuccess,
      setFormErrors,
      applyBackendValidationErrors,
      buildApiErrorMessage,
      applyDashboardResponse,
      applyAircraftResponse,
      applyRequestsResponse,
      applyOperationsResponse,
      applyIncidentsResponse,
      applyPaymentsResponse,
      applyHistoryResponse,
      applyCrewResponse,
      applyAvailabilityResponse,
      goToSection,
      openProviderRelease,
      normalizeCompany,
      normalizeCompanyDocument,
      normalizeMexicanRfc,
      isValidMexicanRfc,
      normalizeAircraft,
      normalizeAircraftImage,
      normalizeAircraftDocument,
      normalizeAvailability,
      normalizeFlightTrackingStatus,
      getOperationPassengerCount,
      getOperationClientLabel,
      getOperationTimeLabel,
      humanizeAircraftStatus,
      getAircraftBillingStatusMeta,
      getAircraftPortalState,
      shouldShowAircraftOperationalMenuActions,
      shouldShowAircraftBillingMenuAction,
      shouldShowAircraftDocumentMenuAction,
      getAircraftDocumentMenuLabel,
      isAircraftBillingMenuActionDisabled,
      getAircraftBillingMenuLabel,
      focusAircraftBilling,
      clearAircraftBillingFocus,
      loadProviderAircraftBillingPlan,
      isAircraftBillingActionPending,
      refreshAircraftBillingStatus,
      activateAircraftBilling,
      runAircraftBillingPrimaryAction,
      openAircraftBillingPayments,
      handleAircraftBillingReturnFromRoute,
      setPaymentsTab,
      normalizeMediaUrl,
      hasImage,
      getAircraftVisualStyle,
      normalizeClientLabel,
      resolveOperatorRequestStatusSource,
      pickPreferredRequestMatch,
      resolveRequestAircraftLabel,
      parseRequestAmount,
      resolveRequestFinalPriceValue,
      resolveRequestQuoteValue,
      resolveRequestResponseLimit,
      normalizeRequest,
      enableBrowserNotifications,
      openRealtimeRequest,
      toggleRealtimeNotifications,
      markRealtimeNotificationRead,
      markAllRealtimeNotificationsRead,
      openRealtimeNotification,
      normalizeOperation,
      findLinkedOperationForRequest,
      normalizeIncident,
      normalizePayment,
      normalizeCrew,
      normalizeCrewRole,
      normalizeCrewState,
      hydrateSettings,
      normalizeHistory,
      hydrateCompany,
      humanizeCompanyDocumentState,
      getCompanyDocumentStateTone,
      getCompanyDocumentDefinition,
      matchesCompanyDocumentDefinition,
      setCompanyDocumentFile,
      setCompanyDocumentDraft,
      getCompanyDocumentDraft,
      validateCompanyDocumentDraft,
      reloadCompany,
      uploadCompanyDocument,
      uploadCompanyDocumentDraft,
      uploadPendingCompanyDocuments,
      openCompanyDocument,
      openCompanyDocumentDrawer,
      closeCompanyDocumentDrawer,
      focusCompanySection,
      handleCompanyAlertAction,
      resetAircraftForm,
      uppercaseText,
      nullableText,
      knotsToKmh,
      inferAircraftMinimumHours,
      getAircraftCategoryRule,
      inferAircraftEngineType,
      kmhToKnots,
      inferredAircraftMinimumHours,
      uppercaseAircraftFormTextFields,
      setUppercaseAircraftField,
      applyAircraftCategoryRule,
      resetImageForm,
      resetDocumentForm,
      openAircraftRegistrationFlow,
      startEditingAircraft,
      cancelEditingAircraft,
      openAircraftWizard,
      closeAircraftWizard,
      goToAircraftWizardStep,
      nextAircraftWizardStep,
      previousAircraftWizardStep,
      getAircraftLiveStatus,
      getAircraftDocumentHealth,
      getAircraftDocumentValidationState,
      getAircraftCommercialState,
      getAircraftMissingItems,
      getAircraftMissingItemsLabel,
      getAircraftReadinessSummary,
      getAircraftCatalogStatusKey,
      getAircraftApprovalMeta,
      getAircraftCommercialMeta,
      getAircraftHourlyPriceLabel,
      getAircraftUpcomingOperation,
      getAircraftWeeklyAvailability,
      toggleAircraftCatalogMenu,
      closeAircraftCatalogMenu,
      openAircraftWizardAtStep,
      duplicateAircraft,
      exportAircraftCatalog,
      getAvailabilityStatusMeta,
      getAvailabilityOperationalStatus,
      submitAircraftWizard,
      syncAircraftScopedForms,
      setAircraftImageField,
      getAircraftDocumentTypeMeta,
      formatDocumentType,
      getDocumentKind,
      formatFileSize,
      revokeDocumentPreviewUrls,
      validateAircraftDocumentFile,
      addAircraftDocumentFiles,
      setAircraftDocumentFiles,
      handleDocumentDrop,
      removeAircraftDocumentFile,
      clearDocumentLibraryFilters,
      removeStoredAircraftDocument,
      openDocumentPreview,
      openStoredDocumentPreview,
      getStoredDocumentKind,
      downloadDocumentFile,
      toggleDocumentLibraryMenu,
      closeDocumentLibraryMenu,
      showDocumentLibraryComingSoon,
      getIncidentEvidenceKind,
      closeDocumentPreview,
      selectDocumentType,
      optimizeImageDocumentFile,
      updateCrewField,
      getOperationCrewDraft,
      resetCrewForm,
      populateCrewForm,
      upsertCrewRecord,
      reloadCrewList,
      upsertAircraftRecord,
      reloadAircraftList,
      formatDateTimeRange,
      startOfAvailabilityWeek,
      addDays,
      startOfAvailabilityDay,
      endOfAvailabilityDay,
      isSameAvailabilityDay,
      formatDateTimeDisplay,
      formatDateCompact,
      formatCurrency,
      formatDocumentExpiry,
      normalizeAvailabilityStatusForBackend,
      getAvailabilityEntriesForAircraft,
      buildAvailabilityCalendarCell,
      moveAvailabilityWeek,
      jumpAvailabilityWeekToToday,
      selectAvailabilityCalendarCell,
      toDateTimeLocalValue,
      getRequestRouteLabel,
      parseOperationalDate,
      isRequestSameOperationalDay,
      getRequestStatusMeta,
      applyLocalRequestStatusUpdate,
      getRequestPriorityMeta,
      getRequestStatusCopy,
      getSelectedRequestOperationStage,
      operatorWorkflowRank,
      preferOperatorWorkflowValue,
      resolveRequestWorkflowValue,
      normalizeWorkflowLabel,
      resolveWorkflowState,
      resolveOperatorVisualStepId,
      buildOperatorRequestFlowSteps,
      updateSelectedRequestOperationStage,
      getRequestPrimaryActionLabel,
      shouldDisableRequestPrimaryAction,
      canTriggerRequestPrimaryAction,
      handleRequestPrimaryAction,
      getRequestHelperCopy,
      resolveOperatorDecisionState,
      canOperatorAcceptRequest,
      getRequestResponseCountdown,
      getRequestClientLabel,
      getRequestQuoteLabel,
      getRequestSuggestedAircraft,
      getRequestServiceTierLabel,
      getRequestServiceTierTone,
      getRequestTripTypeLabel,
      buildRequestLegs,
      buildRequestAircraftComparison,
      getRequestPriorityDriver,
      computeAircraftCompatibilityScore,
      estimateAircraftOperationalQuote,
      formatInternalCostBand,
      getOperationalRiskLabel,
      getAvailabilitySymbol,
      buildRequestAircraftRows,
      buildProposalSummary,
      buildOperationalProposal,
      selectRequest,
      countSelectedImageFiles,
      getAircraftImageByKind,
      isRequestAccepted,
      isRequestRejected,
      isRequestPendingValidation,
      isIncidentResolved,
      mapIncidentTone,
      isUpdatingRequestStatus,
      loadPortal,
      ensureSectionDataLoaded,
      schedulePortalLoad,
      saveCompany,
      sendCompanyToReview,
      createAircraft,
      uploadAircraftImages,
      uploadAircraftDocument,
      archiveAircraft,
      deleteAircraft,
      sendAircraftToReview,
      saveAircraftEdits,
      savingPricingAircraftId,
      updatePricing,
      savePricing,
      reloadRequestsList,
      shouldAutoRefreshRequests,
      refreshRequestsList,
      clearRequestsPolling,
      startRequestsPolling,
      handleRequestsVisibilityRefresh,
      reloadOperationsList,
      getProviderReleaseLoadingTitle,
      getProviderReleaseLoadingMessage,
      createOrUpdateCrew,
      suspendCrewMember,
      activateCrewMember,
      assignCrewMemberToFlight,
      viewCrewDocuments,
      viewCrewHistory,
      markCrewAvailability,
      createAvailabilityBlock,
      releaseAvailability,
      updateRequestStatus,
      saveProviderOperationalRelease,
      submitProviderOperationalIssue,
      updateOperationStatus,
      assignCrewToOperation,
      setIncidentEvidenceFiles,
      selectIncidentOperation,
      createIncident,
      updateIncidentStatus,
      respondToIncident,
      viewIncidentDetail,
      closeIncidentDetail,
      markIncidentInReview,
      buildIncidentTimeline,
      openPendingAction,
      saveSettings
    }
}
