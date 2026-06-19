import { defineComponent } from 'vue'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { requestWithCandidates, pickCollection, pickRecord } from '../../../lib/backendCrud'
import { api, resolveMediaUrl } from '../../../lib/api'
import { resolveProviderIdForUser } from '../../../lib/providerContext'
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
import { deriveClientWorkflowStatus } from '../../client/clientBookingApi'
import OperatorCrewSection from '../secciones/personal/OperatorCrewSection.vue'
import { useAuthStore } from '../../../stores/auth'
import { useUiStore } from '../../../stores/ui'

export default defineComponent({
  name: 'OperatorPortal',
  components: {
    OperatorCrewSection,
  },
  props: {
    section: { type: String, required: true },
  },
  setup(props) {
const route = useRoute()

const router = useRouter()

const auth = useAuthStore()

const ui = useUiStore()

const loading = ref(false)

const refreshingRequests = ref(false)

const portalLoadSequence = ref(0)

let portalLoadScheduled = false

const OPERATOR_REQUESTS_POLL_INTERVAL_MS = 10000
const OPERATOR_AIRCRAFT_BILLING_POLL_INTERVAL_MS = 8000

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
let aircraftBillingPollTimer = null
let aircraftBillingSyncInFlight = false

let removeWorkflowSyncSubscription = null

let providerOperationalReleaseAutosaveTimer = null

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

const activeRequestsRouteFamily = ref('proveedor')

const operations = ref([])

const crew = ref([])

const incidents = ref([])

const payments = ref([])
const paymentsTab = ref('operations')

const history = ref([])

const providerAircraftBillingPlan = ref(null)

const loadingProviderAircraftBillingPlan = ref(false)

const billingFocusAircraftId = ref(null)

const activatingAircraftId = ref(null)

const billingStatusRefreshAircraftId = ref(null)
const paymentsAircraftSyncKey = ref('')
const billingStatusBackendCooldownUntil = ref(0)

const handledBillingReturnKey = ref('')

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

const sectionLoadState = reactive({
  dashboard: false,
  empresa: false,
  aeronaves: false,
  solicitudes: false,
  operaciones: false,
  tripulacion: false,
  incidencias: false,
  pagos: false,
  historial: false,
  disponibilidad: false,
  'release-provider': false,
})

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

const maxIncidentEvidenceFiles = 5

const maxIncidentEvidenceTotalBytes = 25 * 1024 * 1024

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
    aircraft.value.find((item) => getAircraftBillingStatusMeta(item).action === 'activate') ||
    aircraft.value.find((item) => getAircraftBillingStatusMeta(item).action !== 'activate') ||
    null
  )
})

const providerAircraftActivationFlow = computed(() => {
  const targetAircraft = providerAircraftFlowSubject.value
  const isActive =
    targetAircraft && getAircraftBillingStatusMeta(targetAircraft).action !== 'activate'
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
      paymentMethod: relatedPayment?.paymentMethod || 'Stripe Checkout',
      paymentStatus: relatedPayment?.status || billingMeta.label,
      lastPaymentAt: relatedPayment?.completedAt || item.lastPaymentAt || '',
      subscriptionEndsAt: item.subscriptionEndsAt || '',
      providerSubscriptionId:
        relatedPayment?.providerSubscriptionId || item.providerSubscriptionId || '',
      providerCheckoutId:
        relatedPayment?.providerCheckoutId || item.providerCheckoutId || '',
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
  () => aircraftPaymentRows.value.filter((item) => item.action === 'activate').length,
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
    .filter((item) => item.action === 'activate' || item.isRenewalUrgent || item.canRenewNow)
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
  ]
})

const providerPaymentProfile = computed(() => {
  const rawName = providerName.value || auth.user?.name || 'Proveedor'
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
    verification: companyStatusMeta.value.tone === 'success' ? 'Proveedor verificado' : 'Proveedor en revision',
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
        ? 'Requieren respuesta operativa coordinada con Red Aviation.'
        : 'No hay incidencias activas en seguimiento.',
    },
  ]
})

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
  const backendStatus = humanizeAircraftStatus(item.status)
  const liveStatus = getAircraftLiveStatus(item).label
  const billingStatus = getAircraftBillingStatusMeta(item)
  const documentHealth = getAircraftDocumentHealth(item)

  if (['Bloqueada', 'Archivada', 'Suspendida', 'Inactiva', 'Rechazada'].includes(backendStatus)) return 'inactive'
  if (billingStatus.action === 'activate') return 'pending_payment'
  if (backendStatus === 'Pendiente revision') return 'review'
  if (documentHealth.tone !== 'success' || !item.approved) return 'review'
  if (liveStatus === 'En mision' || liveStatus === 'Mantenimiento') return 'active'
  if (billingStatus.action === 'payments' && liveStatus === 'Disponible' && item.approved) return 'active'
  if (billingStatus.action === 'payments') return 'hidden'
  return 'all'
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
      tab.id === 'all'
        ? aircraft.value.length
        : aircraft.value.filter((item) => getAircraftCatalogStatusKey(item) === tab.id).length,
  }))
})

const filteredAircraftCatalog = computed(() => {
  const query = String(aircraftCatalogSearch.value || '').trim().toLowerCase()

  return aircraft.value.filter((item) => {
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
      aircraftCatalogStatus.value === 'all' ||
      getAircraftCatalogStatusKey(item) === aircraftCatalogStatus.value

    const matchesBase =
      aircraftCatalogBase.value === 'all' || String(item.base || '') === aircraftCatalogBase.value

    const matchesCategory =
      aircraftCatalogCategory.value === 'all' || String(item.category || '') === aircraftCatalogCategory.value

    return matchesSearch && matchesStatus && matchesBase && matchesCategory
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
      : 'Pendiente backend',
  },
])

const companyStatusMeta = computed(() => {
  const normalized = String(company.status || company.reviewStatus || '').toLowerCase()
  if (['approved', 'aprobada', 'aprobado', 'active'].includes(normalized)) {
    return { label: 'Aprobado', tone: 'success', headline: 'Operador verificado' }
  }
  if (
    normalized.includes('pending_validation') ||
    normalized.includes('revision') ||
    normalized.includes('pending')
  ) {
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

const providerCanRegisterAircraft = computed(
  () => Boolean(company.canRegisterAircraft) || companyStatusMeta.value.tone === 'success',
)

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
    count: requests.value.filter((request) => requestMatchesStatusFilter(request, 'coordination'))
      .length,
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
          : requestMatchesStatusFilter(request, requestStatusFilter.value)
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
})

function requestMatchesStatusFilter(request = {}, filter = 'all') {
  const statusMeta = getRequestStatusMeta(request)
  if (filter === 'all') return statusMeta.queue !== 'rejected'
  if (filter === 'coordination') {
    const workflowId = resolveWorkflowState(resolveRequestWorkflowValue(request)).id
    return statusMeta.queue === 'coordination' || ['reserved', 'provider_pending'].includes(workflowId)
  }
  return statusMeta.queue === filter
}

const selectedRequest = computed(() => {
  if (!filteredRequests.value.length) return null
  const targetId = String(selectedRequestId.value || '').trim()
  return (
    filteredRequests.value.find((request) => String(request.id || '').trim() === targetId) ||
    filteredRequests.value[0]
  )
})

const releaseProviderRequest = computed(() => {
  const routeRequestId = String(route.query.request || '').trim()
  const targetId = routeRequestId || String(selectedRequestId.value || '').trim()

  if (!requests.value.length) return null
  if (targetId) {
    return requests.value.find((request) => String(request.id) === targetId) || null
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
      ...(request.raw || {}),
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
    void refreshRequestsList({ silent: true })
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

const providerOperationalBinaryStatusOptions = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'confirmed', label: 'Si' },
  { value: 'needs_support', label: 'Requiere apoyo' },
]

const providerOperationalCrewOverallOptions = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'confirmed', label: 'Confirmada' },
  { value: 'not_available', label: 'No disponible' },
  { value: 'red_aviation_review', label: 'Requiere revision de Red Aviation' },
]

const providerOperationalAircraftOverallOptions = [
  { value: 'available', label: 'Disponible' },
  { value: 'preparing', label: 'En preparacion' },
  { value: 'not_available', label: 'No disponible' },
  { value: 'maintenance', label: 'Requiere mantenimiento' },
  { value: 'ready', label: 'Lista para operacion' },
]

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
    if (props.section !== 'release-provider') return

    const queryRequestId = String(route.query.request || '').trim()
    if (queryRequestId) {
      selectedRequestId.value = queryRequestId
      return
    }

    if (releaseProviderRequest.value?.id) {
      selectedRequestId.value = String(releaseProviderRequest.value.id)
    }
  },
  { immediate: true },
)

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
    canRegisterAircraft: false,
    adminNotes: '',
    documents: [],
  }
}

function createEmptyProviderOperationalReleaseForm() {
  return {
    status: 'pending',
    aircraftId: '',
    aircraftOverallStatus: 'preparing',
    availabilityConfirmed: false,
    maintenanceClear: false,
    routeCoverageConfirmed: false,
    captainStatus: 'pending',
    copilotStatus: 'pending',
    crewAvailabilityStatus: 'pending',
    crewRequirementsStatus: 'pending',
    crewOverallStatus: 'pending',
    crewScheduleConfirmed: false,
    crewDocumentsReady: false,
    departureAirport: '',
    arrivalAirport: '',
    fbo: '',
    flightPlanReady: false,
    permitsReady: false,
    handlingReady: false,
    fuelReady: false,
    cleaningReady: false,
    documentsReady: false,
    insuranceReady: false,
    registrationReady: false,
    logbookReady: false,
    notes: '',
  }
}

function syncProviderOperationalDerivedStatuses() {
  if (providerOperationalReleaseHydrating.value) return

  const aircraftReady =
    providerOperationalReleaseForm.availabilityConfirmed &&
    providerOperationalReleaseForm.maintenanceClear &&
    providerOperationalReleaseForm.routeCoverageConfirmed

  const crewReady =
    isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.captainStatus) &&
    isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.copilotStatus) &&
    isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.crewAvailabilityStatus) &&
    isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.crewRequirementsStatus) &&
    providerOperationalReleaseForm.crewScheduleConfirmed &&
    providerOperationalReleaseForm.crewDocumentsReady

  if (
    aircraftReady &&
    !['ready', 'available'].includes(providerOperationalReleaseForm.aircraftOverallStatus)
  ) {
    providerOperationalReleaseForm.aircraftOverallStatus = 'ready'
  }

  if (crewReady && providerOperationalReleaseForm.crewOverallStatus !== 'confirmed') {
    providerOperationalReleaseForm.crewOverallStatus = 'confirmed'
  }
}

function resetProviderOperationalReleaseForm() {
  clearProviderOperationalReleaseAutosaveTimer()
  providerOperationalReleaseHydrating.value = true
  Object.assign(providerOperationalReleaseForm, createEmptyProviderOperationalReleaseForm())
  providerOperationalReleaseHydrating.value = false
  providerOperationalReleaseDirty.value = false
  providerOperationalReleaseLoadedRequestId.value = ''
  providerOperationalReleaseLastHydratedSourceStamp.value = ''
  providerOperationalReleaseAutosaveQueued.value = false
  providerOperationalReleaseFeedback.value = ''
}

function getProviderOperationalReleaseRequestId(request = null) {
  return String(
    request?.id || request?.requestId || request?.reservationId || request?.raw?.id || '',
  ).trim()
}

function getProviderOperationalReleaseStatusMeta(status = 'pending') {
  if (status === 'operational_ready') {
    return {
      label: 'Operational ready',
      tone: 'success',
      detail: 'Aeronave, Tripulaciony despacho ya quedaron listos para confirmar vuelo.',
    }
  }

  if (status === 'crew_confirmed') {
    return {
      label: 'Crew confirmed',
      tone: 'info',
      detail: 'La Tripulacionya fue validada y falta cerrar despacho final de la aeronave.',
    }
  }

  if (status === 'aircraft_confirmed') {
    return {
      label: 'Aircraft confirmed',
      tone: 'warning',
      detail: 'La aeronave ya fue validada y falta completar Tripulaciony liberacion final.',
    }
  }

  return {
    label: 'Pendiente operativa',
    tone: 'neutral',
    detail: 'La liberacion operativa aun no ha sido cerrada por el proveedor.',
  }
}

function normalizeProviderOperationalRelease(request = {}) {
  const raw = request?.raw && typeof request.raw === 'object' ? request.raw : request || {}
  const source = resolveProviderOperationalReleaseSource(raw) || {}

  const aircraftCandidate =
    source.aircraft_id ||
    source.aircraftId ||
    raw.assigned_aircraft_id ||
    raw.aircraft_id ||
    ''
  const operationalStatus =
    source.status ||
    raw.operational_status ||
    raw.operation_release_status ||
    (raw.operational_ready || source.operational_ready
      ? 'operational_ready'
      : raw.crew_confirmed || source.crew_confirmed
        ? 'crew_confirmed'
        : raw.aircraft_confirmed || source.aircraft_confirmed
          ? 'aircraft_confirmed'
          : 'pending')

  return {
    status: ['aircraft_confirmed', 'crew_confirmed', 'operational_ready'].includes(
      operationalStatus,
    )
      ? operationalStatus
      : 'pending',
    aircraftId: aircraftCandidate ? String(aircraftCandidate) : '',
    aircraftOverallStatus:
      source.aircraft_overall_status ||
      source.aircraft_operational_status ||
      source.aircraftOverallStatus ||
      (raw.operational_ready || source.operational_ready
        ? 'ready'
        : raw.aircraft_confirmed || source.aircraft_confirmed
          ? 'available'
          : 'preparing'),
    availabilityConfirmed: Boolean(
      source.availability_confirmed ?? source.availabilityConfirmed ?? raw.aircraft_confirmed,
    ),
    maintenanceClear: Boolean(source.maintenance_clear ?? source.maintenanceClear),
    routeCoverageConfirmed: Boolean(
      source.route_coverage_confirmed ?? source.routeCoverageConfirmed,
    ),
    captainStatus:
      source.captain_status ||
      source.captain_assigned_status ||
      source.captainStatus ||
      (source.pilot_id || source.pilotId ? 'confirmed' : 'pending'),
    copilotStatus:
      source.copilot_status ||
      source.copilot_assigned_status ||
      source.copilotStatus ||
      (source.copilot_id || source.copilotId ? 'confirmed' : 'pending'),
    crewAvailabilityStatus:
      source.crew_availability_status ||
      source.crewAvailabilityStatus ||
      ((source.crew_available ?? source.crewAvailable) ? 'confirmed' : 'pending'),
    crewRequirementsStatus:
      source.crew_requirements_status ||
      source.crewRequirementsStatus ||
      ((source.crew_requirements_confirmed ?? source.crewRequirementsConfirmed) ? 'confirmed' : 'pending'),
    crewOverallStatus:
      source.crew_overall_status ||
      source.crew_general_status ||
      source.crewOverallStatus ||
      (raw.crew_confirmed || source.crew_confirmed ? 'confirmed' : 'pending'),
    crewScheduleConfirmed: Boolean(
      source.crew_schedule_confirmed ?? source.crewScheduleConfirmed,
    ),
    crewDocumentsReady: Boolean(source.crew_documents_ready ?? source.crewDocumentsReady),
    departureAirport:
      source.departure_airport || source.departureAirport || request.origin || raw.origin || '',
    arrivalAirport:
      source.arrival_airport || source.arrivalAirport || request.destination || raw.destination || '',
    fbo: source.fbo || source.fbo_name || source.handling_fbo || '',
    flightPlanReady: Boolean(source.flight_plan_ready ?? source.flightPlanReady),
    permitsReady: Boolean(source.permits_ready ?? source.permitsReady),
    handlingReady: Boolean(source.handling_ready ?? source.handlingReady),
    fuelReady: Boolean(source.fuel_ready ?? source.fuelReady),
    cleaningReady: Boolean(source.cleaning_ready ?? source.cleaningReady),
    documentsReady: Boolean(source.documents_ready ?? source.documentsReady),
    insuranceReady: Boolean(source.insurance_ready ?? source.insuranceReady),
    registrationReady: Boolean(source.registration_ready ?? source.registrationReady),
    logbookReady: Boolean(source.logbook_ready ?? source.logbookReady),
    notes: source.notes || source.comment || raw.operational_notes || '',
  }
}

function resolveProviderOperationalReleaseSource(raw = {}) {
  return (
    (raw.provider_operational_release &&
    typeof raw.provider_operational_release === 'object'
      ? raw.provider_operational_release
      : null) ||
    (raw.operational_release && typeof raw.operational_release === 'object'
      ? raw.operational_release
      : null) ||
    (raw.release_checklist && typeof raw.release_checklist === 'object'
      ? raw.release_checklist
      : null) ||
    (raw.visibility_payload?.provider_operational_release &&
    typeof raw.visibility_payload.provider_operational_release === 'object'
      ? raw.visibility_payload.provider_operational_release
      : null) ||
    null
  )
}

function getProviderOperationalReleaseSourceStamp(request = {}) {
  const raw = request?.raw && typeof request.raw === 'object' ? request.raw : request || {}
  const source = resolveProviderOperationalReleaseSource(raw)

  return String(
    source?.updated_at ||
      raw.visibility_payload?.provider_operational_release?.updated_at ||
      raw.visibility_payload?.operational_release_updated_at ||
      raw.provider_operational_release_updated_at ||
      raw.operational_release_updated_at ||
      '',
  ).trim()
}

function getProviderOperationalReleaseOverrideKeys(request = {}) {
  return [
    request?.id,
    request?.requestId,
    request?.reservationId,
    request?.flight_request_id,
    request?.request_id,
    request?.booking_id,
    request?.reservation_id,
    request?.raw?.id,
    request?.raw?.request_id,
    request?.raw?.flight_request_id,
    request?.raw?.reservation_id,
    request?.raw?.booking_id,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
}

function mergeRequestWithLocalOperationalRelease(raw = {}) {
  const overrideKeys = getProviderOperationalReleaseOverrideKeys(raw)
  const localOverride = overrideKeys
    .map((key) => providerOperationalReleaseLocalOverrides[key])
    .find((candidate) => candidate && typeof candidate === 'object')

  if (!localOverride || typeof localOverride !== 'object') {
    return raw
  }

  const backendRelease = resolveProviderOperationalReleaseSource(raw)
  const backendTimestamp = String(backendRelease?.updated_at || '').trim()
  const localTimestamp = String(localOverride.updated_at || '').trim()

  if (backendRelease && backendTimestamp && localTimestamp && backendTimestamp >= localTimestamp) {
    overrideKeys.forEach((key) => {
      delete providerOperationalReleaseLocalOverrides[key]
    })
    return raw
  }

  return {
    ...raw,
    provider_operational_release: {
      ...(backendRelease && typeof backendRelease === 'object' ? backendRelease : {}),
      ...localOverride,
    },
    operational_release: {
      ...(backendRelease && typeof backendRelease === 'object' ? backendRelease : {}),
      ...localOverride,
    },
    visibility_payload: {
      ...(raw.visibility_payload && typeof raw.visibility_payload === 'object'
        ? raw.visibility_payload
        : {}),
      provider_operational_release: {
        ...(raw.visibility_payload?.provider_operational_release &&
        typeof raw.visibility_payload.provider_operational_release === 'object'
          ? raw.visibility_payload.provider_operational_release
          : {}),
        ...(backendRelease && typeof backendRelease === 'object' ? backendRelease : {}),
        ...localOverride,
      },
      operational_status: localOverride.status || raw.visibility_payload?.operational_status,
    },
    operational_status: localOverride.status || raw.operational_status,
    aircraft_confirmed:
      ['aircraft_confirmed', 'crew_confirmed', 'operational_ready'].includes(localOverride.status) ||
      raw.aircraft_confirmed,
    crew_confirmed:
      ['crew_confirmed', 'operational_ready'].includes(localOverride.status) || raw.crew_confirmed,
    operational_ready:
      localOverride.status === 'operational_ready' || raw.operational_ready,
  }
}

function hydrateProviderOperationalReleaseForm(request = null, options = {}) {
  if (!request) {
    resetProviderOperationalReleaseForm()
    return
  }

  const requestId = getProviderOperationalReleaseRequestId(request)
  const shouldForce = Boolean(options?.force)
  if (
    !shouldForce &&
    providerOperationalReleaseDirty.value &&
    providerOperationalReleaseLoadedRequestId.value &&
    providerOperationalReleaseLoadedRequestId.value === requestId
  ) {
    return
  }

  const normalized = normalizeProviderOperationalRelease(request)
  const suggestedAircraft = getRequestSuggestedAircraft(request)
  const suggestedAircraftId =
    aircraft.value.find((item) => suggestedAircraft.label.includes(item.registration || ''))?.id ||
    aircraft.value.find((item) => suggestedAircraft.label.includes(item.name || ''))?.id ||
    ''

  providerOperationalReleaseHydrating.value = true
  Object.assign(providerOperationalReleaseForm, {
    ...createEmptyProviderOperationalReleaseForm(),
    ...normalized,
    aircraftId: normalized.aircraftId || (suggestedAircraftId ? String(suggestedAircraftId) : ''),
    departureAirport: normalized.departureAirport || request.origin || '',
    arrivalAirport: normalized.arrivalAirport || request.destination || '',
  })
  providerOperationalReleaseHydrating.value = false
  providerOperationalReleaseDirty.value = false
  providerOperationalReleaseLoadedRequestId.value = requestId
  providerOperationalReleaseLastHydratedSourceStamp.value = getProviderOperationalReleaseSourceStamp(
    request,
  )
}

function getProviderOperationalReleaseAircraftRecord() {
  return (
    aircraft.value.find(
      (item) => String(item.id || '') === String(providerOperationalReleaseForm.aircraftId || ''),
    ) || null
  )
}

function getActiveProviderReleaseRequest() {
  return props.section === 'release-provider' ? releaseProviderRequest.value : selectedRequest.value
}

function getProviderOperationalReleaseAircraftLabel() {
  const plane = getProviderOperationalReleaseAircraftRecord()
  if (plane) {
    return `${plane.name}${plane.registration ? ` · ${plane.registration}` : ''}`
  }

  const request = getActiveProviderReleaseRequest()
  return request ? getRequestSuggestedAircraft(request).label : 'Aeronave por definir'
}

function clearProviderOperationalReleaseAutosaveTimer() {
  if (providerOperationalReleaseAutosaveTimer) {
    window.clearTimeout(providerOperationalReleaseAutosaveTimer)
    providerOperationalReleaseAutosaveTimer = null
  }
}

function scheduleProviderOperationalReleaseAutosave() {
  if (props.section !== 'release-provider') return

  const request = getActiveProviderReleaseRequest()
  if (!request || !canManageProviderOperationalRelease(request)) return

  clearProviderOperationalReleaseAutosaveTimer()
  providerOperationalReleaseAutosaveTimer = window.setTimeout(() => {
    void persistProviderOperationalReleaseDraft()
  }, PROVIDER_OPERATIONAL_RELEASE_AUTOSAVE_MS)
}

async function persistProviderOperationalReleaseDraft() {
  clearProviderOperationalReleaseAutosaveTimer()

  if (
    providerOperationalReleaseHydrating.value ||
    !providerOperationalReleaseDirty.value ||
    props.section !== 'release-provider'
  ) {
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

function isProviderOperationalStatusConfirmed(value = '') {
  return String(value || '').trim().toLowerCase() === 'confirmed'
}

function isProviderAircraftConfirmedReady() {
  return Boolean(
    providerOperationalReleaseForm.aircraftId &&
      ['available', 'ready'].includes(providerOperationalReleaseForm.aircraftOverallStatus) &&
      providerOperationalReleaseForm.availabilityConfirmed &&
      providerOperationalReleaseForm.maintenanceClear &&
      providerOperationalReleaseForm.routeCoverageConfirmed,
  )
}

function isProviderCrewConfirmedReady() {
  return Boolean(
    isProviderAircraftConfirmedReady() &&
      isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.captainStatus) &&
      isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.copilotStatus) &&
      isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.crewAvailabilityStatus) &&
      isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.crewRequirementsStatus) &&
      providerOperationalReleaseForm.crewOverallStatus === 'confirmed' &&
      providerOperationalReleaseForm.crewScheduleConfirmed &&
      providerOperationalReleaseForm.crewDocumentsReady,
  )
}

function isProviderOperationalReady() {
  return Boolean(
    isProviderCrewConfirmedReady() &&
      providerOperationalReleaseForm.departureAirport &&
      providerOperationalReleaseForm.arrivalAirport &&
      providerOperationalReleaseForm.fbo &&
      providerOperationalReleaseForm.flightPlanReady &&
      providerOperationalReleaseForm.permitsReady &&
      providerOperationalReleaseForm.handlingReady &&
      providerOperationalReleaseForm.fuelReady &&
      providerOperationalReleaseForm.cleaningReady &&
      providerOperationalReleaseForm.documentsReady &&
      providerOperationalReleaseForm.insuranceReady &&
      providerOperationalReleaseForm.registrationReady &&
      providerOperationalReleaseForm.logbookReady,
  )
}

function deriveProviderOperationalReleaseStatus() {
  if (isProviderOperationalReady()) return 'operational_ready'
  if (isProviderCrewConfirmedReady()) return 'crew_confirmed'
  if (isProviderAircraftConfirmedReady()) return 'aircraft_confirmed'
  return 'pending'
}

function getProviderOperationalReleaseCurrentStatus() {
  const order = ['pending', 'aircraft_confirmed', 'crew_confirmed', 'operational_ready']
  const storedStatus = providerOperationalReleaseForm.status || 'pending'
  const derivedStatus = deriveProviderOperationalReleaseStatus()
  return order.indexOf(derivedStatus) > order.indexOf(storedStatus) ? derivedStatus : storedStatus
}

function getProviderOperationalWorkflowStage(request = getActiveProviderReleaseRequest()) {
  return resolveWorkflowState(resolveRequestWorkflowValue(request)).id
}

function isProviderReleaseFinalized(request = getActiveProviderReleaseRequest()) {
  return getProviderOperationalWorkflowStage(request) === 'completed'
}

function getProviderReleasePrimaryActionLabel(request = getActiveProviderReleaseRequest()) {
  const workflowId = getProviderOperationalWorkflowStage(request)
  if (workflowId === 'completed') return 'Vuelo finalizado'
  if (workflowId === 'tracking_live') return 'Finalizar vuelo'
  return 'Confirmar liberacion operativa'
}

function getProviderReleasePrimaryActionStatus(request = getActiveProviderReleaseRequest()) {
  const workflowId = getProviderOperationalWorkflowStage(request)
  if (workflowId === 'completed') return 'completed'
  if (workflowId === 'tracking_live') return 'tracking_live'
  return 'operational_ready'
}

function canManageProviderOperationalRelease(request = {}) {
  const workflowId = resolveWorkflowState(resolveRequestWorkflowValue(request)).id
  return [
    'contract_pending',
    'contract_signed',
    'payment_pending',
    'payment_confirmed',
    'flight_confirmed',
    'tracking_live',
    'completed',
  ].includes(workflowId)
}

function buildProviderOperationalReleaseChecklist() {
  return [
    {
      title: 'Disponibilidad real de aeronave',
      items: [
        { label: 'Aeronave sigue disponible', done: providerOperationalReleaseForm.availabilityConfirmed },
        { label: 'Sin mantenimiento pendiente', done: providerOperationalReleaseForm.maintenanceClear },
        { label: 'Puede cubrir la ruta completa', done: providerOperationalReleaseForm.routeCoverageConfirmed },
      ],
    },
    {
      title: 'Tripulacion',
      items: [
        { label: 'Capitan asignado', done: isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.captainStatus) },
        { label: 'Copiloto asignado', done: isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.copilotStatus) },
        { label: 'Tripulacion disponible para la fecha', done: isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.crewAvailabilityStatus) },
        { label: 'Tripulacion cumple requisitos', done: isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.crewRequirementsStatus) },
        { label: 'Horarios confirmados', done: providerOperationalReleaseForm.crewScheduleConfirmed },
        { label: 'Documentacion operativa validada', done: providerOperationalReleaseForm.crewDocumentsReady },
      ],
    },
    {
      title: 'Permisos, slots y handling',
      items: [
        { label: 'Aeropuerto de salida confirmado', done: Boolean(providerOperationalReleaseForm.departureAirport) },
        { label: 'Aeropuerto de llegada confirmado', done: Boolean(providerOperationalReleaseForm.arrivalAirport) },
        { label: 'FBO / handling confirmado', done: Boolean(providerOperationalReleaseForm.fbo) && providerOperationalReleaseForm.handlingReady },
        { label: 'Plan de vuelo listo', done: providerOperationalReleaseForm.flightPlanReady },
        { label: 'Permisos / slots listos', done: providerOperationalReleaseForm.permitsReady },
      ],
    },
    {
      title: 'Aeronave lista',
      items: [
        { label: 'Combustible', done: providerOperationalReleaseForm.fuelReady },
        { label: 'Limpieza', done: providerOperationalReleaseForm.cleaningReady },
        { label: 'Documentos', done: providerOperationalReleaseForm.documentsReady },
        { label: 'Seguro', done: providerOperationalReleaseForm.insuranceReady },
        { label: 'Matricula', done: providerOperationalReleaseForm.registrationReady },
        { label: 'Bitacora', done: providerOperationalReleaseForm.logbookReady },
      ],
    },
  ]
}

function getProviderOperationalReleaseProgress() {
  const sections = buildProviderOperationalReleaseChecklist()
  const items = sections.flatMap((section) => section.items)
  const done = items.filter((item) => item.done).length
  return {
    done,
    total: items.length,
    percentage: items.length ? Math.round((done / items.length) * 100) : 0,
  }
}

function getProviderOperationalAircraftSectionStatus() {
  if (['not_available', 'maintenance'].includes(providerOperationalReleaseForm.aircraftOverallStatus)) {
    return { label: 'No disponible', tone: 'danger', detail: 'La aeronave requiere atencion antes de operar.' }
  }
  if (isProviderAircraftConfirmedReady()) {
    return { label: 'Confirmada', tone: 'success', detail: 'Disponibilidad, mantenimiento y cobertura ya fueron validados.' }
  }
  if (providerOperationalReleaseForm.aircraftOverallStatus === 'preparing') {
    return { label: 'En preparacion', tone: 'warning', detail: 'La aeronave sigue en preparacion operativa.' }
  }
  return { label: 'Pendiente', tone: 'neutral', detail: 'Aun faltan confirmaciones de disponibilidad real.' }
}

function getProviderOperationalCrewSectionStatus() {
  if (isProviderCrewConfirmedReady()) {
    return { label: 'Confirmada', tone: 'success', detail: 'La Tripulacionya quedo validada sin exponer datos personales.' }
  }
  if (providerOperationalReleaseForm.crewOverallStatus === 'not_available') {
    return { label: 'No disponible', tone: 'danger', detail: 'No hay tripulacion completa para esta operacion.' }
  }
  if (providerOperationalReleaseForm.crewOverallStatus === 'red_aviation_review') {
    return { label: 'Revision Red Aviation', tone: 'warning', detail: 'Red Aviation debe coordinar apoyo o validacion adicional.' }
  }
  if (
    isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.captainStatus) ||
    isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.copilotStatus) ||
    isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.crewAvailabilityStatus)
  ) {
    return { label: 'En proceso', tone: 'warning', detail: 'La Tripulacionavanza, pero aun faltan validaciones.' }
  }
  return { label: 'Pendiente', tone: 'neutral', detail: 'La validacion tecnica de tripulacion aun no inicia.' }
}

function getProviderOperationalDispatchSectionStatus() {
  const doneCount = [
    providerOperationalReleaseForm.departureAirport,
    providerOperationalReleaseForm.arrivalAirport,
    providerOperationalReleaseForm.fbo,
    providerOperationalReleaseForm.flightPlanReady,
    providerOperationalReleaseForm.permitsReady,
    providerOperationalReleaseForm.handlingReady,
  ].filter(Boolean).length

  if (
    providerOperationalReleaseForm.departureAirport &&
    providerOperationalReleaseForm.arrivalAirport &&
    providerOperationalReleaseForm.fbo &&
    providerOperationalReleaseForm.flightPlanReady &&
    providerOperationalReleaseForm.permitsReady &&
    providerOperationalReleaseForm.handlingReady
  ) {
    return { label: 'Confirmado', tone: 'success', detail: 'Despacho, permisos y handling ya estan listos.' }
  }

  if (doneCount > 0) return { label: 'En proceso', tone: 'warning', detail: 'Permisos, slots y handling siguen en curso.' }
  return { label: 'Pendiente', tone: 'neutral', detail: 'Todavia no hay confirmacion operativa de despacho.' }
}

function getProviderOperationalReadinessSectionStatus() {
  if (
    providerOperationalReleaseForm.fuelReady &&
    providerOperationalReleaseForm.cleaningReady &&
    providerOperationalReleaseForm.documentsReady &&
    providerOperationalReleaseForm.insuranceReady &&
    providerOperationalReleaseForm.registrationReady &&
    providerOperationalReleaseForm.logbookReady
  ) {
    return { label: 'Lista', tone: 'success', detail: 'Combustible, documentos y alistamiento final ya estan completos.' }
  }

  return { label: 'Falta alistamiento', tone: 'warning', detail: 'Aun quedan pendientes de combustible, documentacion o bitacora.' }
}

function getProviderOperationalFinalSummary() {
  return [
    {
      label: 'Aeronave',
      statusLabel: getProviderOperationalAircraftSectionStatus().label,
      detail: getProviderOperationalAircraftSectionStatus().detail,
      tone: getProviderOperationalAircraftSectionStatus().tone,
    },
    {
      label: 'Tripulacion',
      statusLabel: getProviderOperationalCrewSectionStatus().label,
      detail: getProviderOperationalCrewSectionStatus().detail,
      tone: getProviderOperationalCrewSectionStatus().tone,
    },
    {
      label: 'Permisos, slots y handling',
      statusLabel: getProviderOperationalDispatchSectionStatus().label,
      detail: getProviderOperationalDispatchSectionStatus().detail,
      tone: getProviderOperationalDispatchSectionStatus().tone,
    },
    {
      label: 'Aeronave lista',
      statusLabel: getProviderOperationalReadinessSectionStatus().label,
      detail: getProviderOperationalReadinessSectionStatus().detail,
      tone: getProviderOperationalReadinessSectionStatus().tone,
    },
  ]
}

function getProviderOperationalSectionCompletion(items = []) {
  const done = items.filter((item) => item.done).length
  return {
    done,
    total: items.length,
  }
}

function buildProviderOperationalWizardSections() {
  const checklist = buildProviderOperationalReleaseChecklist()
  const aircraftSection = checklist[0]
  const crewSection = checklist[1]
  const dispatchSection = checklist[2]
  const readinessSection = checklist[3]
  const aircraftCompletion = getProviderOperationalSectionCompletion(aircraftSection?.items || [])
  const crewCompletion = getProviderOperationalSectionCompletion(crewSection?.items || [])
  const dispatchCompletion = getProviderOperationalSectionCompletion(dispatchSection?.items || [])
  const readinessCompletion = getProviderOperationalSectionCompletion(readinessSection?.items || [])

  return [
    {
      id: 'aircraft',
      number: 1,
      title: 'Disponibilidad real de aeronave',
      shortTitle: 'Aeronave',
      status: getProviderOperationalAircraftSectionStatus(),
      completion: aircraftCompletion,
      optional: false,
      locked: false,
    },
    {
      id: 'crew',
      number: 2,
      title: 'Tripulacion',
      shortTitle: 'Tripulacion',
      status: getProviderOperationalCrewSectionStatus(),
      completion: crewCompletion,
      optional: false,
      locked: false,
    },
    {
      id: 'dispatch',
      number: 3,
      title: 'Permisos / slots / handling',
      shortTitle: 'Handling',
      status: getProviderOperationalDispatchSectionStatus(),
      completion: dispatchCompletion,
      optional: false,
      locked: false,
    },
    {
      id: 'readiness',
      number: 4,
      title: 'Aeronave lista',
      shortTitle: 'Alistamiento',
      status: getProviderOperationalReadinessSectionStatus(),
      completion: readinessCompletion,
      optional: false,
      locked: false,
    },
    {
      id: 'issue',
      number: 5,
      title: 'Incidencia operativa',
      shortTitle: 'Incidencia',
      status: {
        label: providerOperationalIssueOpen.value || providerOperationalIssueForm.comment.trim() ? 'Atencion abierta' : 'Opcional',
        tone: providerOperationalIssueOpen.value || providerOperationalIssueForm.comment.trim() ? 'warning' : 'neutral',
        detail: 'Usa este bloque solo si existe un bloqueo operativo real.',
      },
      completion: { done: providerOperationalIssueForm.comment.trim() ? 1 : 0, total: 1 },
      optional: true,
      locked: false,
    },
    {
      id: 'final',
      number: 6,
      title: 'Confirmacion final',
      shortTitle: 'Confirmacion',
      status: {
        label: isProviderOperationalReady() ? 'Lista' : 'Bloqueada',
        tone: isProviderOperationalReady() ? 'success' : 'neutral',
        detail: isProviderOperationalReady()
          ? 'Todo esta listo para confirmar la liberacion operativa.'
          : 'Faltan validaciones antes de confirmar la liberacion.',
      },
      completion: {
        done: isProviderOperationalReady() ? 1 : 0,
        total: 1,
      },
      optional: false,
      locked: !isProviderOperationalReady(),
    },
  ]
}

function setProviderOperationalActiveStep(stepId = 'aircraft') {
  providerOperationalReleaseActiveStep.value = stepId
}

function toggleProviderOperationalIssuePanel(forceValue) {
  providerOperationalIssueOpen.value =
    typeof forceValue === 'boolean' ? forceValue : !providerOperationalIssueOpen.value
  if (providerOperationalIssueOpen.value) {
    providerOperationalReleaseActiveStep.value = 'issue'
  }
}

function requestProviderOperationalSupport() {
  providerOperationalReleaseFeedback.value =
    'Red Aviation fue notificada para apoyar con tripulacion y coordinacion operativa.'
  providerOperationalReleaseForm.crewOverallStatus = 'red_aviation_review'
  ui.pushToast({
    tone: 'info',
    title: 'Apoyo solicitado',
    message: 'Red Aviation dara seguimiento a tripulacion, sobrecargo y liberacion final.',
  })
}

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

function getFriendlyOperatorErrorMessage(error, fallbackMessage, context = 'general') {
  const status = Number(error?.status || 0)
  const message = String(error?.message || '').trim()
  const normalizedMessage = message.toLowerCase()

  if ([502, 503, 504].includes(status)) {
    if (context === 'billing-plan') {
      return 'El backend no pudo devolver la mensualidad de la aeronave en este momento. Revisa la ruta de facturacion del proveedor en Laravel.'
    }

    if (context === 'portal-load') {
      return 'El backend no pudo devolver los datos del portal operador en este momento. Revisa las rutas de aeronaves del proveedor en Laravel.'
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
  return 'No hay conexion con el backend local en http://127.0.0.1:8000. Verifica que Laravel este corriendo.'
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

  sectionLoadState.dashboard = true
  sectionLoadState.empresa = true
}

function applyAircraftResponse(payload) {
  const collection = pickCollection(payload, ['aircraft', 'data', 'items'])
  aircraft.value = mergeAircraftCollection(collection)
  syncAircraftScopedForms()
  sectionLoadState.aeronaves = true
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
    const aircraftRecord = pickRecord(payload, ['aircraft', 'data', 'item'])
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

function applyRequestsResponse(payload) {
  const { collection, found } = pickRequestsCollectionState(payload)
  if (found || !requests.value.length) {
    requests.value = collection.map(normalizeRequest)
  }
  sectionLoadState.solicitudes = true
}

async function fetchRequestsPayload(timeoutMs = OPERATOR_SECTION_TIMEOUT_MS) {
  let firstSuccessfulPayload = null
  let firstSuccessfulPath = ''
  let lastError = null

  for (const path of REQUESTS_ROUTE_CANDIDATES) {
    try {
      const payload = await api.get(path, { timeoutMs })
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
      const status = Number(error?.status || 0)
      const message = String(error?.message || '').toLowerCase()
      const canTryNext =
        status === 0 ||
        [404, 405].includes(status) ||
        (status >= 500 && status <= 599) ||
        (message.includes('route') && message.includes('could not be found'))

      if (!canTryNext) {
        throw error
      }
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
  sectionLoadState.operaciones = true
}

function applyIncidentsResponse(collection) {
  incidents.value = Array.isArray(collection) ? collection : []
  sectionLoadState.incidencias = true
}

function applyPaymentsResponse(payload) {
  const collection = pickCollection(payload, ['payments', 'liquidations', 'data'])
  const aircraftPayments = pickCollection(payload, ['aircraft_payments', 'aircraftBillingPayments'])
  payments.value = [...collection, ...aircraftPayments].map(normalizePayment)
  sectionLoadState.pagos = true
}

function applyHistoryResponse(payload) {
  const collection = pickCollection(payload, ['history', 'events', 'data'])
  history.value = collection.map(normalizeHistory)
  sectionLoadState.historial = true
}

function applyCrewResponse(payload) {
  const collection = pickCollection(payload, ['crew', 'tripulation', 'tripulacion'])
  crew.value = collection.map(normalizeCrew)
  sectionLoadState.tripulacion = true
}

function applyAvailabilityResponse(payload) {
  const collection = pickCollection(payload, ['availability', 'data', 'items'])
  availability.value = collection.map(normalizeAvailability)
  sectionLoadState.disponibilidad = true
}

function goToSection(section, query = {}) {
  router.push({
    name: 'operador',
    params: { section },
    query,
  })
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
    raw.approval_status || raw.validation_status || raw.review_status || raw.status || company.status
  const providerStatus = raw.provider_status || approvalStatus
  const canRegisterAircraft =
    raw.can_register_aircraft ??
    ['approved', 'aprobada', 'aprobado', 'active'].includes(String(approvalStatus || '').toLowerCase())

  return {
    legalName: raw.legal_name || raw.company_name || raw.razon_social || company.legalName,
    rfc: raw.rfc || raw.tax_id || company.rfc,
    tradeName: raw.commercial_name || raw.trade_name || raw.nombre_comercial || company.tradeName,
    phone: raw.phone || raw.telefono || company.phone,
    email: raw.email || company.email,
    address: raw.address || raw.direccion || company.address,
    legalRepresentative:
      raw.legal_representative || raw.representante_legal || company.legalRepresentative,
    status: providerStatus || company.status,
    jetAPrice: raw.jet_a_price ?? raw.jetA ?? raw.precio_jet_a ?? company.jetAPrice,
    marginPercent:
      raw.margin_percent ?? raw.utility_percent ?? raw.porcentaje_utilidad ?? company.marginPercent,
    fixedFee: raw.fixed_fee ?? raw.fee_fijo ?? company.fixedFee,
    reviewStatus: approvalStatus || raw.estado_validacion || company.reviewStatus,
    canRegisterAircraft: Boolean(canRegisterAircraft),
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

const minimumAircraftYear = 1900
const maximumAircraftYear = new Date().getFullYear() + 1

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
  const billingStatus = String(
    raw.billing_status || raw.billingStatus || raw.subscription_status || raw.subscriptionStatus || '',
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
    availability: raw.availability_status || raw.availability || 'Pendiente de confirmacion',
    trial: trialEndsAt
      ? `Activo hasta ${String(trialEndsAt).slice(0, 10)}`
      : raw.subscription_status || raw.billing_status || 'Aun no activo',
    trialStartsAt,
    trialEndsAt,
    trialDaysLeft: Number(raw.trial_days_left || raw.days_left || 0),
    billingStatus,
    subscriptionStatus: String(raw.subscription_status || raw.subscriptionStatus || billingStatus || '')
      .trim()
      .toLowerCase(),
    billingPlanId: raw.billing_plan_id || raw.billingPlanId || null,
    subscriptionStartedAt: raw.subscription_started_at || raw.subscriptionStartedAt || null,
    subscriptionEndsAt: raw.subscription_ends_at || raw.subscriptionEndsAt || null,
    providerSubscriptionId:
      raw.provider_subscription_id || raw.subscription_id || raw.stripe_subscription_id || '',
    providerCheckoutId:
      raw.provider_checkout_id || raw.checkout_session_id || raw.stripe_checkout_session_id || '',
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
    lastPaymentAt: raw.last_payment_at || raw.lastPaymentAt || null,
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

function getDateDiffInDays(value) {
  if (!value) return null
  const target = new Date(value)
  if (Number.isNaN(target.getTime())) return null

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const endDate = new Date(target)
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value).trim())) {
    endDate.setHours(23, 59, 59, 999)
  }

  return Math.ceil((endDate.getTime() - startOfToday.getTime()) / 86400000)
}

function hasExpiredAircraftSubscription(item = {}) {
  const rawEndsAt = String(item.subscriptionEndsAt || item.subscription_ends_at || item.ends_at || '')
    .trim()

  if (!rawEndsAt) return false

  const normalizedEndsAt = /^\d{4}-\d{2}-\d{2}$/.test(rawEndsAt)
    ? `${rawEndsAt}T23:59:59`
    : rawEndsAt

  const endsAt = new Date(normalizedEndsAt)
  if (Number.isNaN(endsAt.getTime())) return false

  return endsAt.getTime() < Date.now()
}

function resolveAircraftAutoRenewState(item = {}, relatedPayment = null) {
  const explicitFlag = [
    item.autoRenewEnabled,
    item.auto_renew_enabled,
    item.subscriptionAutoRenew,
    item.subscription_auto_renew,
    item.billingAutoRenew,
    item.billing_auto_renew,
    relatedPayment?.autoRenewEnabled,
    relatedPayment?.auto_renew_enabled,
  ].find((value) => value === true || value === false)

  const providerSubscriptionId =
    item.providerSubscriptionId ||
    item.provider_subscription_id ||
    relatedPayment?.providerSubscriptionId ||
    relatedPayment?.provider_subscription_id ||
    ''

  const paymentMethodReadyCandidate = [
    item.defaultPaymentMethodReady,
    item.default_payment_method_ready,
    item.paymentMethodReady,
    item.payment_method_ready,
    item.hasDefaultPaymentMethod,
    item.has_default_payment_method,
    relatedPayment?.defaultPaymentMethodReady,
    relatedPayment?.default_payment_method_ready,
  ].find((value) => value === true || value === false)

  const normalizedStatus = String(
    item.subscriptionStatus || item.billingStatus || item.status || '',
  )
    .trim()
    .toLowerCase()

  const autoRenewEnabled =
    explicitFlag === true ||
    (!hasExpiredAircraftSubscription(item) &&
      Boolean(providerSubscriptionId) &&
      ['active', 'paid', 'current', 'trialing'].includes(normalizedStatus))

  const paymentMethodReady =
    paymentMethodReadyCandidate === true ||
    (paymentMethodReadyCandidate !== false && Boolean(providerSubscriptionId))

  return {
    autoRenewEnabled,
    paymentMethodReady,
    providerSubscriptionId: providerSubscriptionId || '',
  }
}

function getAircraftRenewalMeta(item = {}, relatedPayment = null) {
  const { autoRenewEnabled, paymentMethodReady, providerSubscriptionId } = resolveAircraftAutoRenewState(
    item,
    relatedPayment,
  )
  const daysUntilExpiry = getDateDiffInDays(item.subscriptionEndsAt || item.subscription_ends_at || item.ends_at || '')

  if (daysUntilExpiry === null) {
    return {
      autoRenewEnabled,
      mode: autoRenewEnabled ? 'automatic' : 'manual',
      modeLabel: autoRenewEnabled ? 'Renovacion automatica' : 'Renovacion manual',
      reminderLabel: 'Sin vigencia visible',
      reminderDetail: autoRenewEnabled
        ? 'La suscripcion esta ligada a Stripe, pero no hay fecha visible de vigencia.'
        : 'Conviene revisar backend antes de que la aeronave quede sin renovacion trazable.',
      tone: autoRenewEnabled ? 'info' : 'warning',
      daysUntilExpiry: null,
      isUrgent: !autoRenewEnabled,
      canRenewNow: !autoRenewEnabled,
      paymentMethodReady,
      providerSubscriptionId,
    }
  }

  if (daysUntilExpiry < 0) {
    return {
      autoRenewEnabled,
      mode: autoRenewEnabled ? 'automatic' : 'manual',
      modeLabel: autoRenewEnabled ? 'Cobro automatico vencido' : 'Renovacion manual vencida',
      reminderLabel: 'Suscripcion vencida',
      reminderDetail: autoRenewEnabled
        ? 'Stripe debio renovar esta suscripcion; conviene validar metodo de pago y webhook.'
        : 'La aeronave requiere un nuevo cobro para volver a activarse.',
      tone: 'danger',
      daysUntilExpiry,
      isUrgent: true,
      canRenewNow: true,
      paymentMethodReady,
      providerSubscriptionId,
    }
  }

  if (autoRenewEnabled) {
    if (!paymentMethodReady) {
      return {
        autoRenewEnabled,
        mode: 'automatic',
        modeLabel: 'Autopago con alerta',
        reminderLabel: `Vence en ${daysUntilExpiry} dia(s)`,
        reminderDetail: 'Hay suscripcion Stripe, pero no hay metodo de pago confirmado para renovar con seguridad.',
        tone: daysUntilExpiry <= 7 ? 'danger' : 'warning',
        daysUntilExpiry,
        isUrgent: true,
        canRenewNow: true,
        paymentMethodReady,
        providerSubscriptionId,
      }
    }

    return {
      autoRenewEnabled,
      mode: 'automatic',
      modeLabel: 'Renovacion automatica',
      reminderLabel:
        daysUntilExpiry <= 0
          ? 'Renovacion en curso'
          : `Cobro automatico en ${daysUntilExpiry} dia(s)`,
      reminderDetail:
        daysUntilExpiry <= 7
          ? 'La aeronave debe renovarse automaticamente en Stripe. Solo monitorea el resultado del cobro.'
          : 'La renovacion esta ligada a Stripe y no requiere accion manual por ahora.',
      tone: daysUntilExpiry <= 7 ? 'info' : 'success',
      daysUntilExpiry,
      isUrgent: false,
      canRenewNow: false,
      paymentMethodReady,
      providerSubscriptionId,
    }
  }

  if (daysUntilExpiry <= 3) {
    return {
      autoRenewEnabled,
      mode: 'manual',
      modeLabel: 'Renovacion manual',
      reminderLabel: `Vence en ${daysUntilExpiry} dia(s)`,
      reminderDetail: 'Se recomienda pagar ahora para evitar que la aeronave salga de visibilidad.',
      tone: 'danger',
      daysUntilExpiry,
      isUrgent: true,
      canRenewNow: true,
      paymentMethodReady,
      providerSubscriptionId,
    }
  }

  if (daysUntilExpiry <= 15) {
    return {
      autoRenewEnabled,
      mode: 'manual',
      modeLabel: 'Renovacion manual',
      reminderLabel: `Renovar en los proximos ${daysUntilExpiry} dia(s)`,
      reminderDetail: 'La suscripcion sigue activa, pero ya conviene lanzar el cobro anticipado.',
      tone: 'warning',
      daysUntilExpiry,
      isUrgent: true,
      canRenewNow: true,
      paymentMethodReady,
      providerSubscriptionId,
    }
  }

  return {
    autoRenewEnabled,
    mode: 'manual',
    modeLabel: 'Renovacion manual',
    reminderLabel: `Vigente por ${daysUntilExpiry} dia(s)`,
    reminderDetail: 'No hay autopago ligado. La renovacion tendra que dispararse manualmente antes del vencimiento.',
    tone: 'info',
    daysUntilExpiry,
    isUrgent: false,
    canRenewNow: daysUntilExpiry <= 30,
    paymentMethodReady,
    providerSubscriptionId,
  }
}

function getAircraftBillingStatusMeta(item = {}) {
  const normalizedStatus = String(
    item.subscriptionStatus || item.billingStatus || item.status || '',
  )
    .trim()
    .toLowerCase()

  if (
    hasExpiredAircraftSubscription(item) &&
    !['cancelled', 'canceled'].includes(normalizedStatus)
  ) {
    return {
      label: 'Pago vencido',
      tone: 'danger',
      detail: 'La mensualidad expiro. La aeronave queda desactivada hasta confirmar un nuevo pago.',
      cta: providerAircraftPlanAmount.value
        ? `Renovar por ${formatCurrency(providerAircraftPlanAmount.value)}`
        : 'Renovar mensualidad',
      action: 'activate',
    }
  }

  if (['active', 'paid', 'current'].includes(normalizedStatus)) {
    return {
      label: 'Activa',
      tone: 'success',
      detail: item.subscriptionEndsAt
        ? `Visible en el sistema hasta ${formatDateTimeRange(item.subscriptionEndsAt)}.`
        : 'La aeronave ya esta visible en el sistema.',
      cta: 'Ver pagos',
      action: 'payments',
    }
  }

  if (['past_due', 'expired'].includes(normalizedStatus)) {
    return {
      label: 'Pago vencido',
      tone: 'danger',
      detail: 'La aeronave no esta visible actualmente. Renueva la mensualidad para reactivarla.',
      cta: providerAircraftPlanAmount.value
        ? `Renovar por ${formatCurrency(providerAircraftPlanAmount.value)}`
        : 'Renovar mensualidad',
      action: 'activate',
    }
  }

  if (['cancelled', 'canceled'].includes(normalizedStatus)) {
    return {
      label: 'Cancelada',
      tone: 'danger',
      detail: 'La suscripcion fue cancelada. Necesita un nuevo cobro para reactivarse.',
      cta: providerAircraftPlanAmount.value
        ? `Reactivar por ${formatCurrency(providerAircraftPlanAmount.value)}`
        : 'Reactivar aeronave',
      action: 'activate',
    }
  }

  if (['inactive'].includes(normalizedStatus)) {
    return {
      label: 'Inactiva',
      tone: 'warning',
      detail: 'La aeronave sigue registrada, pero todavia no esta visible para clientes.',
      cta: providerAircraftPlanAmount.value
        ? `Activar por ${formatCurrency(providerAircraftPlanAmount.value)}`
        : 'Activar aeronave',
      action: 'activate',
    }
  }

  return {
    label: 'Pendiente de pago',
    tone: 'warning',
    detail: 'La aeronave fue registrada correctamente y queda pendiente de activacion mensual.',
    cta: providerAircraftPlanAmount.value
      ? `Pagar y activar por ${formatCurrency(providerAircraftPlanAmount.value)}`
      : 'Pagar y activar aeronave',
    action: 'activate',
  }
}

function isAircraftBillingActive(item = {}) {
  return getAircraftBillingStatusMeta(item).action !== 'activate'
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

function shouldAutoRefreshAircraftBilling() {
  if (props.section !== 'aeronaves') return false

  return aircraft.value.some((item) => !isAircraftBillingActive(item))
}

async function loadProviderAircraftBillingPlan(options = {}) {
  if (providerAircraftBillingPlan.value && options.force !== true) {
    return providerAircraftBillingPlan.value
  }

  if (shouldSkipAircraftBillingRefresh()) {
    return providerAircraftBillingPlan.value
  }

  loadingProviderAircraftBillingPlan.value = true

  try {
    const response = await requestWithCandidates([
      { method: 'get', path: '/billing/plans/provider-aircraft' },
    ])
    const plan = pickRecord(response, ['plan', 'data'])
    providerAircraftBillingPlan.value = plan && Object.keys(plan).length ? plan : null
    return providerAircraftBillingPlan.value
  } catch (error) {
    if (isAircraftBillingBackendUnavailable(error)) {
      markAircraftBillingBackendUnavailable()
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
    return null
  } finally {
    loadingProviderAircraftBillingPlan.value = false
  }
}

function applyAircraftBillingStatus(aircraftId, payload = {}) {
  const targetAircraft = aircraft.value.find((item) => Number(item.id) === Number(aircraftId))
  if (!targetAircraft) return null

  const statusPayload = {
    ...targetAircraft,
    ...(payload.aircraft && typeof payload.aircraft === 'object' ? payload.aircraft : {}),
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

async function refreshAircraftBillingStatus(aircraftId, options = {}) {
  if (!aircraftId) return null
  if (shouldSkipAircraftBillingRefresh()) return null

  const rawSessionId = String(options.sessionId || '').trim()
  const sessionId =
    rawSessionId && !rawSessionId.includes('CHECKOUT_SESSION_ID') && !/[{}]/.test(rawSessionId)
      ? rawSessionId
      : ''

  billingStatusRefreshAircraftId.value = Number(aircraftId)

  try {
    const response = await requestWithCandidates([
      {
        method: 'get',
        path: `/provider/aircraft/${aircraftId}/billing`,
        query: {
          session_id: sessionId,
        },
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
  if (!aircraftId || activatingAircraftId.value) return

  activatingAircraftId.value = aircraftId

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
    const response = await refreshAircraftBillingStatus(aircraftId, {
      silent: attempt > 0,
      reloadAircraftList: true,
      reloadPayments: true,
      successToast: attempt === 0,
      sessionId,
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

  if (billingState === 'success') {
    await syncAircraftBillingAfterCheckout(aircraftId, sessionId)
    return
  }

  if (billingState === 'cancelled') {
    ui.pushToast({
      tone: 'warning',
      title: 'Pago cancelado',
      message: 'La aeronave sigue pendiente de activacion. Puedes intentarlo de nuevo cuando quieras.',
    })
  }
}

async function refreshPendingAircraftBillingStatuses() {
  if (aircraftBillingSyncInFlight || !shouldAutoRefreshAircraftBilling()) return

  aircraftBillingSyncInFlight = true

  try {
    const pendingAircraftIds = aircraft.value
      .filter((item) => !isAircraftBillingActive(item))
      .map((item) => Number(item.id || 0))
      .filter(Boolean)

    for (const aircraftId of pendingAircraftIds) {
      const response = await refreshAircraftBillingStatus(aircraftId, { silent: true })
      if (!response && shouldSkipAircraftBillingRefresh()) break
    }
  } finally {
    aircraftBillingSyncInFlight = false
  }
}

async function syncAircraftBillingPaymentsView() {
  if (props.section !== 'pagos' || paymentsTab.value !== 'aircraft') return

  const aircraftIds = selectedPaymentsAircraftId.value
    ? [Number(selectedPaymentsAircraftId.value)]
    : filteredAircraftPaymentRows.value
        .filter((item) => item.action === 'activate' || !item.hasPaymentRecord)
        .map((item) => Number(item.aircraftId || 0))
        .filter(Boolean)

  if (!aircraftIds.length) return

  const syncKey = `${paymentsTab.value}:${aircraftIds.join(',')}`
  if (paymentsAircraftSyncKey.value === syncKey) return

  paymentsAircraftSyncKey.value = syncKey

  try {
    for (const aircraftId of aircraftIds) {
      const response = await refreshAircraftBillingStatus(aircraftId, {
        silent: true,
        reloadAircraftList: true,
      })
      if (!response && shouldSkipAircraftBillingRefresh()) break
    }

    if (!shouldSkipAircraftBillingRefresh()) {
      await ensureSectionDataLoaded('pagos', { force: true, timeoutMs: OPERATOR_BACKGROUND_TIMEOUT_MS })
    }
  } finally {
    window.setTimeout(() => {
      if (paymentsAircraftSyncKey.value === syncKey) {
        paymentsAircraftSyncKey.value = ''
      }
    }, 1200)
  }
}

function clearAircraftBillingPolling() {
  if (aircraftBillingPollTimer) {
    clearInterval(aircraftBillingPollTimer)
    aircraftBillingPollTimer = null
  }
}

function startAircraftBillingPolling() {
  clearAircraftBillingPolling()

  if (!shouldAutoRefreshAircraftBilling()) return

  aircraftBillingPollTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return
    void refreshPendingAircraftBillingStatuses()
  }, OPERATOR_AIRCRAFT_BILLING_POLL_INTERVAL_MS)
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
  raw = mergeRequestWithLocalOperationalRelease(raw)
  const sourceRouteFamily = activeRequestsRouteFamily.value === 'operator' ? 'operator' : 'proveedor'
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
    operationId: raw.operation?.id || raw.operation_id || raw.operaciones?.[0]?.id || '',
    internalComment: raw.internal_comment || raw.notes || raw.comment || '',
    requestCode: raw.request_code || raw.code || '',
    providerId: raw.provider_id || raw.provider?.id || raw.visibility_payload?.selected_provider_id || '',
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

function normalizeIncidentFile(raw = {}, index = 0) {
  return {
    id: raw.id || index + 1,
    name:
      raw.original_name ||
      raw.document_name ||
      raw.file_name ||
      raw.name ||
      raw.file_path ||
      `Evidencia ${index + 1}`,
    // Solo aceptamos URLs reales devueltas por backend/AWS; no armamos rutas locales de Render.
    fileUrl: normalizeMediaUrl(raw.file_url || raw.document_url || raw.url || ''),
    fileType: raw.file_type || raw.mime_type || '',
  }
}

function getIncidentEvidenceKind(file = {}) {
  const mimeType = String(file?.fileType || '').toLowerCase()
  const fileUrl = String(file?.fileUrl || '').toLowerCase()
  const fileName = String(file?.name || '').toLowerCase()

  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType === 'application/pdf' || fileName.endsWith('.pdf') || fileUrl.endsWith('.pdf')) return 'pdf'
  if (/\.(png|jpg|jpeg|webp|gif|bmp|svg)(\?|$)/i.test(fileUrl || fileName)) return 'image'

  return 'other'
}

function extractIncidentLabeledValue(text = '', label = '') {
  const source = String(text || '')
  const normalizedLabel = String(label || '').trim()
  if (!source || !normalizedLabel) return ''

  const escapedLabel = normalizedLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`${escapedLabel}:\\s*([^|]+)`, 'i'))
  return String(match?.[1] || '').trim()
}

function buildIncidentSourceText(raw = {}) {
  return [
    raw.title,
    raw.type,
    raw.category,
    raw.comment,
    raw.description,
    raw.evidence,
    raw.attachment,
  ]
    .filter(Boolean)
    .join(' | ')
}

function resolveIncidentPhase(raw = {}) {
  return (
    raw.phase ||
    raw.flight_phase ||
    raw.operation_phase ||
    extractIncidentLabeledValue(buildIncidentSourceText(raw), 'Fase') ||
    'Por definir'
  )
}

function resolveIncidentCategory(raw = {}) {
  const embedded = extractIncidentLabeledValue(buildIncidentSourceText(raw), 'Categoria')
  return normalizeIncidentType(embedded || raw.category || raw.type || raw.title)
}

function resolveIncidentSourceLabel(raw = {}) {
  const embedded = extractIncidentLabeledValue(buildIncidentSourceText(raw), 'Origen')
  if (embedded) return embedded
  return normalizeIncidentSource(raw)
}

function resolveIncidentReporter(raw = {}) {
  return (
    raw.reported_by ||
    raw.reported_by_name ||
    raw.created_by_name ||
    raw.user_name ||
    raw.crew_name ||
    raw.crew?.name ||
    extractIncidentLabeledValue(buildIncidentSourceText(raw), 'Sobrecargo') ||
    extractIncidentLabeledValue(buildIncidentSourceText(raw), 'Usuario que reporto') ||
    ''
  )
}

function resolveIncidentDescription(raw = {}) {
  const explicit = String(raw.comment || raw.description || '').trim()
  const embedded = extractIncidentLabeledValue(buildIncidentSourceText(raw), 'Descripcion')
  const candidate = explicit || embedded
  if (!candidate) return 'Sin descripcion visible.'
  if (candidate.includes('|')) return embedded || 'Sin descripcion visible.'
  return candidate
}

function buildIncidentFolio(raw = {}, normalizedId = 0, createdAt = '') {
  const sourceYear = String(createdAt || '').slice(0, 4)
  const year = /^\d{4}$/.test(sourceYear) ? sourceYear : String(new Date().getFullYear())
  const numericId = Number(raw.folio_id || raw.incident_number || normalizedId || raw.id || 0)
  const suffix = String(Math.max(numericId, 0)).padStart(5, '0')
  return `INC-${year}-${suffix}`
}

function normalizeIncident(raw = {}, index = 0) {
  const normalizedId = raw.id || index + 1
  const fallbackFlight =
    raw.flight ||
    raw.route ||
    raw.operation_route ||
    raw.operation ||
    (raw.crew_operation_id || raw.operation_id != null
      ? `Operacion #${raw.crew_operation_id || raw.operation_id}`
      : 'Sin vuelo')
  const evidenceFiles = Array.isArray(raw.files)
    ? raw.files.map((file, fileIndex) => normalizeIncidentFile(file, fileIndex))
    : []
  const evidenceLabel =
    raw.evidence ||
    raw.attachment ||
    evidenceFiles.map((file) => file.name).filter(Boolean).join(', ') ||
    'Pendiente'
  const createdAt = raw.created_at || raw.reported_at || null
  const sourceText = buildIncidentSourceText(raw)

  return {
    id: normalizedId,
    requestId: raw.request_id || raw.flight_request_id || raw.reservation_id || null,
    type: normalizeIncidentType(raw.type || raw.category || raw.title, raw),
    flight: fallbackFlight,
    route: raw.route || raw.flight || raw.operation_route || raw.operation || fallbackFlight,
    status: normalizeIncidentStatus(raw.status || raw.state),
    priority: normalizeIncidentPriority(raw.priority),
    phase: resolveIncidentPhase(raw),
    category: resolveIncidentCategory(raw),
    folio: buildIncidentFolio(raw, normalizedId, createdAt),
    evidence: evidenceLabel,
    evidenceFiles,
    comment: resolveIncidentDescription(raw),
    responsible: raw.responsible || raw.assigned_to || raw.owner || 'Por asignar',
    source: resolveIncidentSourceLabel(raw),
    crewName: raw.crew_name || raw.crew?.name || extractIncidentLabeledValue(sourceText, 'Sobrecargo') || '',
    reporterName: resolveIncidentReporter(raw),
    providerId: raw.provider_id || raw.provider?.id || null,
    providerName:
      raw.provider_name ||
      raw.provider?.name ||
      extractIncidentLabeledValue(sourceText, 'Empresa') ||
      '',
    operationId: raw.operation_id || raw.crew_operation_id || null,
    createdAt,
    updatedAt: raw.updated_at || raw.modified_at || createdAt,
    raw,
  }
}

function normalizeIncidentStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase()

  if (!normalized) return 'Abierta'
  if (['open', 'abierta'].includes(normalized)) return 'Abierta'
  if (['in_review', 'en revision', 'en revisión', 'review'].includes(normalized)) return 'En revision'
  if (['answered', 'respondida', 'respondido'].includes(normalized)) return 'Respondida'
  if (['escalated', 'escalada', 'escalado'].includes(normalized)) return 'Escalada'
  if (['resolved', 'resuelta'].includes(normalized)) return 'Resuelta'
  if (['closed', 'cerrada'].includes(normalized)) return 'Cerrada'

  return value
}

function normalizeIncidentPriority(value = '') {
  const normalized = String(value || '').trim().toLowerCase()

  if (!normalized) return 'Media'
  if (['low', 'baja'].includes(normalized)) return 'Baja'
  if (['medium', 'media'].includes(normalized)) return 'Media'
  if (['high', 'alta'].includes(normalized)) return 'Alta'
  if (['critical', 'critica', 'crítica'].includes(normalized)) return 'Critica'

  return value
}

function normalizeIncidentType(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  const labels = {
    catering: 'Catering',
    cabina: 'Cabina',
    cliente: 'Cliente',
    seguridad: 'Seguridad',
    horario: 'Horario',
    coordinacion: 'Coordinacion',
    coordinación: 'Coordinacion',
    otro: 'Otro',
  }

  if (!normalized) return 'Problema operativo'
  const embeddedCategory = extractIncidentLabeledValue(value, 'Categoria')
  if (embeddedCategory) {
    const normalizedCategory = String(embeddedCategory).trim().toLowerCase()
    return labels[normalizedCategory] || embeddedCategory
  }

  if (normalized.includes('|')) {
    const compactSegment = String(value)
      .split('|')[0]
      .split('·')
      .map((item) => item.trim())
      .filter(Boolean)
      .find((item) => {
        const candidate = item.toLowerCase()
        return candidate && !candidate.includes('mmto') && !candidate.includes('mmmy')
      })

    if (compactSegment) return compactSegment
  }

  return labels[normalized] || value
}

function normalizeIncidentSource(raw = {}) {
  if (raw.source) return raw.source
  if (raw.crew_operation_id || raw.crew_id || raw.crew_name) return 'Tripulacion / Sobrecargo'
  return 'Proveedor'
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

function buildNormalizedIncidentDedupKey(incident = {}) {
  return [
    normalizeComparableId(incident.operationId || incident.requestId),
    String(incident.category || incident.type || '').trim().toLowerCase(),
    String(incident.priority || '').trim().toLowerCase(),
    String(incident.route || incident.flight || '').trim().toLowerCase(),
    String(incident.comment || '').trim().toLowerCase(),
    String(incident.evidence || '').trim().toLowerCase(),
  ]
    .filter(Boolean)
    .join('::')
}

function scoreNormalizedIncident(incident = {}) {
  return [
    incident.providerId,
    incident.providerName,
    incident.reporterName,
    incident.crewName,
    incident.evidenceFiles?.length,
    incident.updatedAt,
    incident.raw?.admin_response,
  ].filter(Boolean).length
}

function mergeIncidentCollections(...collections) {
  const merged = []
  const dedupedBySignature = new Map()

  collections.flat().forEach((raw) => {
    if (!raw || typeof raw !== 'object') return

    const normalizedIncident = normalizeIncident(raw, merged.length)
    const signature = buildNormalizedIncidentDedupKey(normalizedIncident)
    const normalizedTime = Date.parse(normalizedIncident.createdAt || normalizedIncident.updatedAt || '') || 0
    const existing = dedupedBySignature.get(signature)

    if (existing) {
      const existingTime = Date.parse(existing.createdAt || existing.updatedAt || '') || 0
      const looksDuplicated =
        signature &&
        normalizedTime &&
        existingTime &&
        Math.abs(normalizedTime - existingTime) <= 120000

      if (looksDuplicated) {
        if (scoreNormalizedIncident(normalizedIncident) > scoreNormalizedIncident(existing)) {
          const targetIndex = merged.findIndex((item) => item.id === existing.id)
          if (targetIndex >= 0) {
            merged.splice(targetIndex, 1, normalizedIncident)
          }
          dedupedBySignature.set(signature, normalizedIncident)
        }
        return
      }
    }

    if (signature) {
      dedupedBySignature.set(signature, normalizedIncident)
    }

    merged.push(normalizedIncident)
  })

  return merged.sort((left, right) => {
    const rightTime = Date.parse(right.createdAt || '') || 0
    const leftTime = Date.parse(left.createdAt || '') || 0
    if (rightTime !== leftTime) return rightTime - leftTime
    return Number(right.id || 0) - Number(left.id || 0)
  })
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
  const amountValue = parseRequestAmount(raw.amount || raw.total || raw.net_amount || raw.value || 0, 0)
  const amountCurrency = String(raw.currency || raw.moneda || 'USD').toUpperCase()
  const rawStatus = String(raw.status || 'Pendiente')
  const normalizedStatus = rawStatus.trim().toLowerCase()
  const aircraft =
    raw.aircraft_name ||
    raw.aircraft_model ||
    raw.aircraft ||
    raw.subscription_item_name ||
    raw.metadata?.aircraft_name ||
    raw.description ||
    'Aeronave por identificar'

  const isAircraftSubscription =
    String(raw.type || raw.payment_type || raw.category || '').toLowerCase().includes('aircraft') ||
    String(raw.type || raw.payment_type || raw.category || '').toLowerCase().includes('subscription') ||
    String(raw.description || '').toLowerCase().includes('subscription creation') ||
    String(raw.description || '').toLowerCase().includes('suscripcion mensual aeronave') ||
    Boolean(raw.aircraft_id || raw.aircraftId || raw.aircraft?.id)

  return {
    id: raw.id || index + 1,
    flight: raw.flight || raw.route || raw.operation || 'Vuelo',
    completedAt: raw.completed_at || raw.flight_date || raw.date || 'Pendiente',
    rawCreatedAt: raw.created_at || raw.completed_at || raw.flight_date || raw.date || '',
    amount: amountValue ? `${amountCurrency} ${amountValue.toFixed(2)}` : raw.amount || raw.total || raw.net_amount || 'Pendiente',
    status: rawStatus,
    statusNormalized: normalizedStatus,
    receipt: raw.receipt || raw.document || raw.voucher || 'Sin comprobante',
    reference:
      raw.reference ||
      raw.payment_reference ||
      raw.checkout_session_id ||
      raw.subscription_id ||
      raw.invoice_id ||
      raw.intent_id ||
      '',
    description:
      raw.description ||
      raw.concept ||
      raw.reason ||
      raw.type_label ||
      raw.subscription_label ||
      'Pago sin descripcion visible',
    paymentMethod:
      raw.payment_method_brand ||
      raw.payment_method ||
      raw.card_brand ||
      raw.method ||
      raw.payment_provider ||
      'Metodo no visible',
    client:
      raw.client_name ||
      raw.customer_name ||
      raw.customer_email ||
      raw.client ||
      raw.user_email ||
      'Sin cliente',
    aircraft,
    aircraftId:
      raw.aircraft_id ||
      raw.subscription_target_id ||
      raw.metadata?.aircraft_id ||
      null,
    type:
      raw.type ||
      raw.payment_type ||
      raw.category ||
      (String(raw.description || '').toLowerCase().includes('subscription') ? 'aircraft_subscription' : 'operation'),
    currency: amountCurrency,
    amountValue,
    providerCheckoutId: raw.checkout_session_id || raw.provider_checkout_id || '',
    providerSubscriptionId: raw.subscription_id || raw.provider_subscription_id || '',
    paidAt: raw.paid_at || '',
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
    isAircraftSubscription,
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
      title: 'Validacion pendiente',
      message: 'Primero necesitamos que Admin apruebe la cuenta del proveedor antes de registrar aeronaves.',
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

function hasAircraftCommercialImages(item) {
  return Boolean(item?.mainImage || (Array.isArray(item?.images) && item.images.length))
}

function getAircraftMissingItems(item = {}) {
  const missing = []
  const documentHealth = getAircraftDocumentHealth(item)

  if (!String(item.name || '').trim()) missing.push('modelo')
  if (!String(item.registration || '').trim()) missing.push('matricula')
  if (!String(item.base || '').trim()) missing.push('base')
  if (!Number(item.capacity || 0)) missing.push('capacidad')
  if (!Number(item.hourlyPrice || 0)) missing.push('tarifa')
  if (!Number(item.rangeKm || 0)) missing.push('rango')
  if (!hasAircraftCommercialImages(item)) missing.push('fotos')
  if (documentHealth.tone !== 'success') missing.push('documentos')
  if (!item.approved) missing.push('aprobacion admin')
  if (!isAircraftBillingActive(item)) missing.push('activacion mensual')

  return missing
}

function getAircraftMissingItemsLabel(item = {}) {
  const missing = getAircraftMissingItems(item)
  if (!missing.length) return 'Sin faltantes criticos'
  return `Faltan ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? '...' : ''}`
}

function getAircraftReadinessSummary(item = {}) {
  const missing = getAircraftMissingItems(item)
  const liveStatus = getAircraftLiveStatus(item)
  const documentHealth = getAircraftDocumentHealth(item)
  const billingActive = isAircraftBillingActive(item)

  if (liveStatus.tone === 'danger') {
    return {
      tone: 'danger',
      label: 'Bloqueada',
      detail: 'La aeronave esta bloqueada y no puede entrar a cotizaciones o reservas.',
      missing,
    }
  }

  if (!missing.length) {
    return {
      tone: 'success',
      label: 'Lista para cotizar y reservar',
      detail: 'Completa en datos, expediente, aprobacion y activacion comercial.',
      missing,
    }
  }

  if (item.approved && documentHealth.tone === 'success' && billingActive) {
    return {
      tone: 'info',
      label: 'Casi lista',
      detail: 'Ya tiene validacion operativa; solo faltan datos comerciales complementarios.',
      missing,
    }
  }

  return {
    tone: 'warning',
    label: 'Pendiente de completar',
    detail: getAircraftMissingItemsLabel(item),
    missing,
  }
}

function getAircraftApprovalMeta(item = {}) {
  if (item.approved) return { label: 'Aprobada', tone: 'success' }
  if (humanizeAircraftStatus(item.status) === 'Pendiente revision') return { label: 'En revision', tone: 'warning' }
  return { label: 'Pendiente admin', tone: 'warning' }
}

function getAircraftCommercialMeta(item = {}) {
  const billingMeta = getAircraftBillingStatusMeta(item)
  const readiness = getAircraftReadinessSummary(item)

  if (billingMeta.action === 'activate') {
    return {
      label: 'Pendiente de activacion',
      tone: billingMeta.tone,
      detail: 'No visible para clientes hasta confirmar mensualidad.',
    }
  }

  if (readiness.missing.length) {
    return {
      label: 'Visible con restricciones',
      tone: 'warning',
      detail: getAircraftMissingItemsLabel(item),
    }
  }

  return {
    label: 'Visible para clientes',
    tone: 'success',
    detail: 'Lista para cotizaciones y reservas dentro del sistema.',
  }
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
  const response = await fetchCrewPayload()
  const collection = pickCollection(response, [
    'crew',
    'tripulation',
    'tripulacion',
    'sobrecargos',
    'data',
  ])
  crew.value = collection.map(normalizeCrew)
  sectionLoadState.tripulacion = true
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
  const collection = pickCollection(response, ['aircraft', 'data', 'items'])
  aircraft.value = mergeAircraftCollection(collection)
  syncAircraftScopedForms()
  sectionLoadState.aeronaves = true
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

function formatDateCompact(value = '') {
  if (!value) return 'Sin fecha'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return formatDateTimeRange(value).slice(0, 10) || String(value)
  }

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Mexico_City',
  }).format(parsed)
}

function formatRelativeAccessLabel(value = '') {
  if (!value) return 'Hoy'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Hoy'

  const now = new Date()
  const sameDay =
    parsed.getDate() === now.getDate() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getFullYear() === now.getFullYear()

  const timeLabel = new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Mexico_City',
  }).format(parsed)

  return sameDay ? `Hoy ${timeLabel}` : `${formatDateCompact(parsed.toISOString())} ${timeLabel}`
}

function formatCurrency(value, currency = 'MXN') {
  const numericValue =
    typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.-]+/g, ''))

  if (!Number.isFinite(numericValue)) {
    return value || 'Pendiente'
  }

  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: String(currency || 'MXN').toUpperCase(),
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
  if (workflowState === 'provider_pending' || workflowState === 'reserved') {
    return {
      label: 'Solicitud nueva',
      tone: 'warning',
      queue: 'new',
      headline: 'Pendiente de aceptar o rechazar',
    }
  }
  if (
    workflowState === 'provider_accepted' ||
    workflowState === 'contract_pending' ||
    workflowState === 'contract_signed' ||
    workflowState === 'payment_pending' ||
    workflowState === 'payment_confirmed' ||
    workflowState === 'flight_confirmed' ||
    workflowState === 'tracking_live' ||
    workflowState === 'completed' ||
    isRequestAccepted(status)
  ) {
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
/*       detail: 'La ventana de respuesta ya expiro.',*/ 
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
    return 'Pago confirmado. El proveedor confirma aeronave y operacion; Red Aviation coordina con la sobrecargo y mantiene informado al cliente.'
  if (workflowState === 'flight_confirmed')
    return 'La aeronave y la operacion ya quedaron confirmadas por el proveedor; el admin sigue la coordinacion con sobrecargo y cliente.'
  if (workflowState === 'tracking_live')
    return 'El vuelo ya esta en seguimiento activo.'
  if (isRequestRejected(status)) return 'Rechazada por proveedor'
  if (isRequestPendingValidation(status)) return 'La reserva ya avanzo en el flujo compartido.'
  return 'Pendiente de decision'
}

function operatorWorkflowRank(value = '') {
  const workflowId = resolveWorkflowState(value).id
  const order = [
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
  const index = order.indexOf(workflowId)
  return index === -1 ? 0 : index
}

function preferOperatorWorkflowValue(baseValue = '', detailValue = '') {
  if (!String(baseValue || '').trim()) return detailValue
  if (!String(detailValue || '').trim()) return baseValue

  return operatorWorkflowRank(detailValue) >= operatorWorkflowRank(baseValue)
    ? detailValue
    : baseValue
}

function resolveRequestWorkflowValue(requestOrStatus = '') {
  if (requestOrStatus && typeof requestOrStatus === 'object') {
    const linkedOperation = findLinkedOperationForRequest(requestOrStatus)
    const requestWorkflowValue =
      requestOrStatus.workflowStatus ||
      requestOrStatus.rawWorkflowStatus ||
      requestOrStatus.status ||
      ''
    const linkedOperationWorkflowValue =
      linkedOperation?.workflowStatus ||
      linkedOperation?.rawWorkflowStatus ||
      linkedOperation?.status ||
      ''
    const explicitWorkflowValue = preferOperatorWorkflowValue(
      requestWorkflowValue,
      linkedOperationWorkflowValue,
    )
    const derivedWorkflowValue =
      resolveSharedWorkflowStatus({
        ...(requestOrStatus.raw && typeof requestOrStatus.raw === 'object' ? requestOrStatus.raw : {}),
        ...(linkedOperation?.raw && typeof linkedOperation.raw === 'object' ? linkedOperation.raw : {}),
        workflow_status: explicitWorkflowValue,
        status: linkedOperation?.status || requestOrStatus.status || requestOrStatus.rawStatus || '',
        contract_status: linkedOperation?.contractStatus || requestOrStatus.contractStatus || '',
        provider_status: requestOrStatus.providerStatus || requestOrStatus.raw?.provider_status || '',
        payment_status: linkedOperation?.paymentStatus || requestOrStatus.paymentStatus || '',
        operation_id: linkedOperation?.id || requestOrStatus.operationId || '',
      }) ||
      explicitWorkflowValue

    if (explicitWorkflowValue && resolveWorkflowState(explicitWorkflowValue).id !== 'draft') {
      return preferOperatorWorkflowValue(explicitWorkflowValue, derivedWorkflowValue)
    }

    return derivedWorkflowValue
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
  if (workflowId === 'flight_confirmed') return 'Abrir Liberacion'
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

  if (workflowId === 'flight_confirmed') {
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
  if (workflowId === 'flight_confirmed') {
    openProviderRelease(request)
    return
  }

  void updateRequestStatus(request.id, 'Aceptada')
}

function getRequestHelperCopy(request = {}) {
  if (!request || !Object.keys(request).length) {
    return 'Escanea la cola, prioriza urgencias y acepta o rechaza solicitudes desde una sola bandeja.'
  }

  const workflowValue = resolveRequestWorkflowValue(request)
  const workflowId = resolveWorkflowState(workflowValue).id
  const visualStepId = resolveOperatorVisualStepId(workflowValue)

  if (workflowId === 'provider_pending' || workflowId === 'reserved') {
    return 'Pendiente de respuesta del proveedor. Acepta o rechaza la solicitud para continuar el flujo.'
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
  loading.value = true

  try {
    const requestJobs = [
      {
        request: requestWithCandidates([
          { method: 'get', path: '/proveedor/dashboard', timeoutMs: OPERATOR_BOOT_TIMEOUT_MS },
          { method: 'get', path: '/proveedor/empresa', timeoutMs: OPERATOR_BOOT_TIMEOUT_MS },
          { method: 'get', path: '/operator/dashboard', timeoutMs: OPERATOR_BOOT_TIMEOUT_MS },
        ]),
        apply: applyDashboardResponse,
      },
    ]

    if (props.section === 'dashboard') {
      requestJobs.push(
        {
          request: fetchAircraftListPayload(OPERATOR_BOOT_TIMEOUT_MS),
          apply: applyAircraftResponse,
        },
        {
          request: fetchRequestsPayload(OPERATOR_BOOT_TIMEOUT_MS),
          apply: applyRequestsResponse,
        },
      )
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
      auth.clearAuth()
      router.replace({
        name: 'acceso',
        query: { redirect: router.currentRoute.value.fullPath },
      })
      return
    }

    if (!sectionLoadState[props.section]) {
      await ensureSectionDataLoaded(props.section, { timeoutMs: OPERATOR_SECTION_TIMEOUT_MS })
    }
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
    }
  }
}

async function ensureSectionDataLoaded(section = props.section, options = {}) {
  if (!canLoadProviderData.value) return

  const normalizedSection = String(section || '').trim().toLowerCase()
  const force = options.force === true
  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Number(options.timeoutMs)
    : OPERATOR_SECTION_TIMEOUT_MS

  if (!normalizedSection || (!force && sectionLoadState[normalizedSection])) {
    return
  }

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
  } else if (normalizedSection === 'solicitudes') {
    request = fetchRequestsPayload(timeoutMs)
    apply = applyRequestsResponse
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
    request = requestWithCandidates([{ method: 'get', path: '/proveedor/disponibilidad', timeoutMs }])
    apply = applyAvailabilityResponse
  } else if (normalizedSection === 'release-provider') {
    const jobs = []

    if (force || !sectionLoadState.solicitudes) {
      jobs.push(
        fetchRequestsPayload(timeoutMs).then((payload) => {
          applyRequestsResponse(payload)
        }),
      )
    }

    if (force || !sectionLoadState.aeronaves) {
      jobs.push(
        fetchAircraftListPayload(timeoutMs).then((payload) => {
          applyAircraftResponse(payload)
        }),
      )
    }

    if (force || !sectionLoadState.tripulacion) {
      jobs.push(
        fetchCrewPayload(timeoutMs).then((payload) => {
          applyCrewResponse(payload)
        }),
      )
    }

    if (jobs.length) {
      await Promise.all(jobs)
    }

    sectionLoadState['release-provider'] = true
    return
  }

  if (!request || !apply) return

  const payload = await request
  apply(payload)
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

  const aircraftYear = resolveAircraftYearNumber(aircraftForm.year)
  if (aircraftYear == null) {
    setFormErrors('aircraft', { year: aircraftYearValidationMessage() })
    return showError('Ano invalido', aircraftYearValidationMessage())
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
    year: aircraftYear,
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
      { method: 'post', path: '/proveedor/aeronaves', body: payload },
      { method: 'post', path: '/operator/aircraft', body: payload },
    ])

    const record = pickRecord(response, ['aircraft', 'data'])
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

  const aircraftYear = resolveAircraftYearNumber(aircraftForm.year)
  if (aircraftYear == null) {
    setFormErrors('aircraft', { year: aircraftYearValidationMessage() })
    return showError('Ano invalido', aircraftYearValidationMessage())
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
    year: aircraftYear,
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

async function reloadRequestsList(timeoutMs = OPERATOR_SECTION_TIMEOUT_MS) {
  const response = await fetchRequestsPayload(timeoutMs)
  const { collection, found } = pickRequestsCollectionState(response)
  if (found || !requests.value.length) {
    requests.value = collection.map(normalizeRequest)
  }
}

function shouldAutoRefreshRequests() {
  return ['dashboard', 'solicitudes', 'release-provider'].includes(props.section)
}

async function refreshRequestsList({ silent = true } = {}) {
  if (refreshingRequests.value) return
  if (silent && loading.value) return
  if (!silent) {
    loading.value = true
  }

  refreshingRequests.value = true

  try {
    await reloadRequestsList(OPERATOR_SECTION_TIMEOUT_MS)
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
  if (shouldAutoRefreshRequests()) {
    if (!requestsPollTimer) {
      startRequestsPolling()
    }
    void refreshRequestsList({ silent: true })
  }

  if (props.section === 'aeronaves') {
    if (!aircraftBillingPollTimer) {
      startAircraftBillingPolling()
    }
    void refreshPendingAircraftBillingStatuses()
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

  // Sincroniza en segundo plano sin bloquear la tarjeta que el operador acaba de actualizar.
  window.setTimeout(() => {
    void refreshRequestsList({ silent: true })
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
    const sharedWorkflowPayload = buildWorkflowApiPayload(nextWorkflowStage)
    sharedWorkflowStatus = sharedWorkflowPayload.status
    Object.assign(payload, sharedWorkflowPayload, {
      state: sharedWorkflowPayload.status,
    })
  }

  syncingProviderOperationalRelease.value = true
  savingProviderOperationalRelease.value = !background

  try {
    const response = await requestWithCandidates([
      ...buildProviderReleaseCandidates(request, payload),
    ])
    console.log('[provider-release-response]', {
      requestId: request?.id || request?.requestId || request?.reservationId || null,
      nextStatus,
      sharedWorkflowStatus,
      response,
    })

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
          ? 'Liberacion enviada a Red Aviation. El flujo del vuelo fue actualizado y la operacion pasa a tracking activo.'
          : 'El avance operativo quedo guardado y Red Aviation puede seguir la coordinacion centralizada.'

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
      'Selecciona el tipo de incidencia y agrega una nota para que Red Aviation pueda coordinarla.',
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
    'Incidencia operativa enviada a Red Aviation. El equipo administrativo dara seguimiento y mantendra informado al cliente.'
  savingProviderOperationalIssue.value = false
  ui.pushToast({
    tone: 'warning',
    title: 'Incidencia reportada',
    message: 'Red Aviation ya recibio la incidencia operativa para coordinar la solucion.',
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

    if (nextProviderId !== previousProviderId) {
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
        (request) =>
          String(request.id || '').trim() === String(selectedRequestId.value || '').trim(),
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
  if (props.section === 'aeronaves') {
    syncAircraftBillingFocusFromRoute()
    void loadProviderAircraftBillingPlan()
    void handleAircraftBillingReturnFromRoute()
    startAircraftBillingPolling()
    void refreshPendingAircraftBillingStatuses()
  }
})

onBeforeUnmount(() => {
  clearRequestsPolling()
  clearAircraftBillingPolling()
  clearProviderOperationalReleaseAutosaveTimer()
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
  async (nextSection) => {
    if (nextSection !== 'release-provider') {
      clearProviderOperationalReleaseAutosaveTimer()
    }
    startRequestsPolling()
    if (shouldAutoRefreshRequests()) {
      void refreshRequestsList({ silent: true })
    }

    if (!sectionLoadState[nextSection]) {
      try {
        loading.value = true
        await ensureSectionDataLoaded(nextSection, { timeoutMs: OPERATOR_SECTION_TIMEOUT_MS })
      } catch (error) {
        showError(
          'No se pudo cargar la seccion',
          error.message || 'La seccion seleccionada no pudo sincronizarse con el backend.',
        )
      } finally {
        loading.value = false
      }
    }

    if (nextSection === 'aeronaves') {
      syncAircraftBillingFocusFromRoute()
      void loadProviderAircraftBillingPlan()
      void handleAircraftBillingReturnFromRoute()
      startAircraftBillingPolling()
      void refreshPendingAircraftBillingStatuses()
    } else {
      clearAircraftBillingPolling()
    }
  },
)

watch(
  () => [props.section, route.query.billing, route.query.aircraft_id],
  () => {
    if (props.section !== 'aeronaves') return
    syncAircraftBillingFocusFromRoute()
    void handleAircraftBillingReturnFromRoute()
    startAircraftBillingPolling()
    void refreshPendingAircraftBillingStatuses()
  },
  { immediate: true },
)

watch(
  () => aircraft.value.map((item) => `${item.id}:${getAircraftBillingStatusMeta(item).action}`).join('|'),
  () => {
    if (props.section !== 'aeronaves') return
    startAircraftBillingPolling()
  },
)

watch(
  () => [props.section, route.query.payments_tab],
  ([nextSection, nextTab]) => {
    if (nextSection !== 'pagos') return
    setPaymentsTab(String(nextTab || '').trim().toLowerCase() || 'operations')
  },
  { immediate: true },
)

watch(
  () => [props.section, paymentsTab.value, selectedPaymentsAircraftId.value, payments.value.length],
  ([nextSection, nextTab]) => {
    if (nextSection !== 'pagos' || nextTab !== 'aircraft') return
    void syncAircraftBillingPaymentsView()
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
      aircraftForm,
      imageForm,
      documentForm,
      documentPreview,
      incidentDetailModal,
      availabilityForm,
      incidentForm,
      crewForm,
      formErrors,
      formSuccess,
      aircraftWizardOpen,
      aircraftWizardStep,
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
      providerPaymentProfile,
      paymentHistoryFeed,
      showAircraftPaymentsTable,
      pendingRequests,
      activeOperations,
      openIncidents,
      paymentsPending,
      providerOpenIncidents,
      isIncidentsSectionLoading,
      providerPendingRequestRecords,
      providerUpcomingOperations,
      providerNextOperation,
      providerIncidentOperationOptions,
      providerOperationalSummary,
      aircraftOptions,
      selectedAvailabilityAircraft,
      availabilityCalendarAircraftOptions,
      availabilityCalendarWeekDays,
      availabilityCalendarRows,
      availabilityCalendarWindowLabel,
      selectedImageAircraft,
      selectedDocumentAircraft,
      selectedDocumentType,
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
      aircraftWizardSnapshot,
      companyStatusMeta,
      companyLastAuditDate,
      companyOperationalBase,
      companyOnboardingSteps,
      companyOnboardingProgress,
      companyValidationSummary,
      companyAlerts,
      companyAuditTimeline,
      dashboardCompletion,
      dashboardGlobalStatus,
      dashboardAlerts,
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
      normalizeAircraft,
      normalizeAircraftImage,
      normalizeAircraftDocument,
      normalizeAvailability,
      humanizeAircraftStatus,
      getAircraftBillingStatusMeta,
      focusAircraftBilling,
      clearAircraftBillingFocus,
      loadProviderAircraftBillingPlan,
      refreshAircraftBillingStatus,
      activateAircraftBilling,
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
      setCompanyDocumentFile,
      reloadCompany,
      uploadCompanyDocument,
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
      startEditingAircraft,
      cancelEditingAircraft,
      openAircraftWizard,
      closeAircraftWizard,
      nextAircraftWizardStep,
      previousAircraftWizardStep,
      getAircraftLiveStatus,
      getAircraftDocumentHealth,
      getAircraftMissingItems,
      getAircraftMissingItemsLabel,
      getAircraftReadinessSummary,
      getAircraftCatalogStatusKey,
      getAircraftApprovalMeta,
      getAircraftCommercialMeta,
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
      getDocumentKind,
      formatFileSize,
      revokeDocumentPreviewUrls,
      validateAircraftDocumentFile,
      addAircraftDocumentFiles,
      setAircraftDocumentFiles,
      handleDocumentDrop,
      removeAircraftDocumentFile,
      removeStoredAircraftDocument,
      openDocumentPreview,
      openStoredDocumentPreview,
      getStoredDocumentKind,
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
      updatePricing,
      savePricing,
      reloadRequestsList,
      shouldAutoRefreshRequests,
      refreshRequestsList,
      clearRequestsPolling,
      startRequestsPolling,
      handleRequestsVisibilityRefresh,
      reloadOperationsList,
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
  },
})
