<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { pickRecord, requestWithCandidates } from '../../lib/backendCrud'
import { resolveRoleSectionPath } from '../../data/roleFlows'
import CompanyCommercialCard from '../operator/validation/CompanyCommercialCard.vue'
import CompanyProfileCard from '../operator/validation/CompanyProfileCard.vue'
import FleetSummary from '../operator/validation/FleetSummary.vue'
import OperatorDocumentDrawer from '../operator/validation/OperatorDocumentDrawer.vue'
import OperatorDocumentList from '../operator/validation/OperatorDocumentList.vue'
import OperatorValidationSummary from '../operator/validation/OperatorValidationSummary.vue'
import { useUiStore } from '../../stores/ui'
import {
  buildOperatorCommercialConfig,
  buildOperatorCompanyProfile,
  buildOperatorFleetSummary,
  getOperatorDocumentVersions,
  normalizeValidationActivityEntry,
} from '../../lib/operatorValidationApi'
import {
  buildProviderReviewFlow,
  resolveProviderCompanyName,
  resolveProviderRepresentativeName,
  resolveProviderStatusMeta,
} from '../../lib/providerReview'
import { normalizeOperatorValidationDocument } from '../../lib/providerCompanyDocuments'

const props = defineProps({
  providers: { type: Array, required: true },
  aircraft: { type: Array, required: true },
})
const emit = defineEmits(['refresh'])

const router = useRouter()
const ui = useUiStore()
const searchTerm = ref('')
const selectedProvider = ref(null)
const activeDocumentActionKey = ref('')
const activeValidationActionKey = ref('')
const activeRequirementActionKey = ref('')
const loadingProviderDetail = ref(false)
const selectedProviderActivity = ref([])
const loadingSelectedProviderActivity = ref(false)
const selectedDocumentDrawer = ref(null)
const selectedDocumentVersions = ref([])
const loadingDocumentVersions = ref(false)
const activeProviderRequestToken = ref(0)
let providerDetailAbortController = null
let providerActivityAbortController = null
let providerDocumentVersionsAbortController = null

const ADMIN_PROVIDER_DETAIL_TIMEOUT_MS = 30000
const ADMIN_PROVIDER_ACTIVITY_TIMEOUT_MS = 30000
const ADMIN_PROVIDER_DOCUMENT_VERSIONS_TIMEOUT_MS = 20000


function missingValidationLabelsText() {
  const pendingItems = estadoExpediente.value?.requisitos?.filter(
    (item) => item.isComplete !== true || !isRequirementApproved(item),
  ) || []

  if (!pendingItems.length) {
    return 'Todos los requisitos administrativos ya fueron aprobados.'
  }

  return `Faltan requisitos por aprobar: ${pendingItems
    .map((item) => (item.isComplete === true ? `${item.label} (pendiente de validacion admin)` : `${item.label} (dato incompleto)`))
    .join(', ')}.`
}

function getValidationPanelHeadline() {
  if (!selectedProviderReview.value) return 'Expediente pendiente de validacion administrativa'
  if (selectedProviderReview.value.statusMeta.key === 'approved') return 'Operador validado por administracion'
  if (estadoExpediente.value.requisitosCompletosParaValidar) return 'Listo para validacion administrativa'
  return 'Expediente pendiente de validacion administrativa'
}

function getValidationPanelDetail() {
  if (!selectedProviderReview.value) return 'Admin debe revisar el expediente completo antes de tomar una decision.'
  if (selectedProviderReview.value.statusMeta.key === 'approved') {
    return 'La validacion del operador ya fue aprobada manualmente y el acceso operativo quedo habilitado.'
  }
  if (estadoExpediente.value.requisitosCompletosParaValidar) {
    return 'El backend ya considera completo el expediente obligatorio. Ya puedes validar formalmente al operador.'
  }
  return 'Cada requisito debe aprobarse o cancelarse por separado. Validar el operador completo solo se habilita cuando todos esten aprobados.'
}

function normalizeExpedienteToken(value = '') {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
}

function normalizeExplicitBoolean(value, options = {}) {
  const truthyValues = Array.isArray(options.truthyValues) ? options.truthyValues : []
  const falsyValues = Array.isArray(options.falsyValues) ? options.falsyValues : []

  if (value === true) return true
  if (value === false) return false
  if (value === null || value === undefined) return null

  const normalized = normalizeExpedienteToken(value)
  if (!normalized) return null
  if (truthyValues.includes(normalized)) return true
  if (falsyValues.includes(normalized)) return false

  return null
}

function normalizeDecisionStatus(value) {
  const normalized = normalizeExpedienteToken(value)

  if (!normalized || ['null', 'undefined', 'pending', 'pendiente', 'en revision', 'pending review'].includes(normalized)) {
    return 'pending'
  }
  if (['approved', 'aprobado', 'aprobada', 'validated', 'validado', 'validada'].includes(normalized)) {
    return 'approved'
  }
  if (['rejected', 'rechazado', 'rechazada', 'cancelled', 'canceled', 'cancelado', 'cancelada'].includes(normalized)) {
    return 'rejected'
  }

  return 'pending'
}

function normalizeRequirementComplete(item = {}) {
  const normalized = normalizeExplicitBoolean(item?.complete, {
    truthyValues: ['true', 'approved', 'aprobado', 'aprobada', 'validated', 'validado', 'validada', 'complete', 'completo', 'completa'],
    falsyValues: ['false', 'pending', 'pendiente', 'rejected', 'rechazado', 'rechazada', 'incomplete', 'incompleto', 'incompleta'],
  })

  if (normalized === true) return true
  if (normalized === false) return false

  const decisionStatus = normalizeDecisionStatus(item?.response_status ?? item?.responseStatus ?? null)
  if (decisionStatus === 'approved' || decisionStatus === 'rejected') return true

  return false
}

function normalizeWorkflowStatus(value) {
  const normalized = normalizeExpedienteToken(value)

  if (!normalized || ['null', 'undefined'].includes(normalized)) return 'draft'
  if (['approved', 'aprobado', 'aprobada', 'validated', 'validado', 'validada'].includes(normalized)) return 'approved'
  if (['pending review', 'under review', 'en revision'].includes(normalized)) return 'pending_review'
  if (['pending validation'].includes(normalized)) return 'pending_validation'
  if (['changes required', 'suspended', 'suspendido'].includes(normalized)) return 'changes_required'
  if (['rejected', 'rechazado', 'rechazada'].includes(normalized)) return 'rejected'
  if (['cancelled', 'canceled', 'cancelado', 'cancelada'].includes(normalized)) return 'cancelled'
  if (['draft', 'expediente incompleto', 'incomplete', 'incompleto', 'incompleta'].includes(normalized)) return 'draft'

  return normalized.replace(/\s+/g, '_')
}

function hasTextValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function isRequirementManagedByDocuments(item = {}) {
  return item?.key === 'legal_documents_approved' && Array.isArray(item?.sourceDocuments) && item.sourceDocuments.length > 0
}

function validationRequirementStateLabel(item = {}) {
  return item.isComplete === true ? 'Dato completo' : 'Dato pendiente'
}

function normalizeRequirementResponseStatus(item = {}) {
  return String(item.responseStatus || '').trim().toLowerCase()
}

function isRequirementApproved(item = {}) {
  return normalizeDecisionStatus(item.normalizedResponseStatus || normalizeRequirementResponseStatus(item)) === 'approved'
}

function isRequirementRejected(item = {}) {
  return normalizeDecisionStatus(item.normalizedResponseStatus || normalizeRequirementResponseStatus(item)) === 'rejected'
}

function validationRequirementTone(item = {}) {
  if (isRequirementApproved(item)) return 'success'
  if (isRequirementRejected(item)) return 'danger'
  return item.isComplete === true ? 'info' : 'warning'
}

function validationRequirementIcon(item = {}) {
  if (isRequirementApproved(item)) return '✓'
  if (isRequirementRejected(item)) return '×'
  return item.isComplete === true ? '•' : '!'
}

function validationRequirementResponseLabel(item = {}) {
  if (isRequirementApproved(item)) return 'Aprobado por administracion'
  if (isRequirementRejected(item)) return 'Cancelado por administracion'
  return 'Pendiente de decision administrativa'
}

function validationRequirementResponseTone(item = {}) {
  if (isRequirementApproved(item)) return 'success'
  if (isRequirementRejected(item)) return 'danger'
  return item.isComplete === true ? 'info' : 'warning'
}

function validationRequirementHint(item = {}) {
  if (isRequirementApproved(item)) return 'Este requisito ya fue aprobado de forma individual.'
  if (isRequirementRejected(item)) return 'Este requisito fue cancelado y requiere correccion o nueva revision.'
  if (isRequirementManagedByDocuments(item)) {
    return item.isComplete === true
      ? 'Este requisito depende de aprobar o rechazar los documentos legales pendientes del expediente.'
      : 'Aun faltan documentos legales obligatorios o aprobaciones administrativas en esos documentos.'
  }
  if (item.isComplete === true) return 'El dato ya esta completo y listo para que Admin lo valide o lo cancele.'
  return 'Aun faltan datos del operador para poder aprobar este requisito.'
}

function formatDateTime(value) {
  if (!value) return 'Sin registro'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed)
}

function isAnyValidationActionLoading() {
  return Boolean(activeValidationActionKey.value || activeRequirementActionKey.value)
}

function isAbortLikeError(error) {
  return (
    error?.name === 'AbortError' ||
    String(error?.message || '')
      .trim()
      .toLowerCase()
      .includes('aborted')
  )
}

function abortProviderDetailRequest() {
  if (providerDetailAbortController) {
    providerDetailAbortController.abort()
    providerDetailAbortController = null
  }
}

function abortProviderActivityRequest() {
  if (providerActivityAbortController) {
    providerActivityAbortController.abort()
    providerActivityAbortController = null
  }
}

function abortProviderDocumentVersionsRequest() {
  if (providerDocumentVersionsAbortController) {
    providerDocumentVersionsAbortController.abort()
    providerDocumentVersionsAbortController = null
  }
}

function resetProviderAsyncState() {
  loadingProviderDetail.value = false
  loadingSelectedProviderActivity.value = false
  loadingDocumentVersions.value = false
}

function nextProviderRequestToken() {
  activeProviderRequestToken.value += 1
  return activeProviderRequestToken.value
}

function providerLabel(provider = {}) {
  return resolveProviderCompanyName(provider)
}

function providerStatusMeta(provider = {}) {
  const meta = resolveProviderStatusMeta(provider)
  if (meta.key === 'approved') return { ...meta, icon: '●' }
  if (meta.key === 'changes_required') return { ...meta, key: 'changes_required', icon: '●' }
  if (meta.key === 'rejected') return { ...meta, key: 'rejected', icon: '●' }
  if (meta.key === 'pending') return { ...meta, key: 'pending', icon: '●' }
  return { ...meta, key: 'draft', icon: '●' }
}

function providerBase(provider = {}) {
  return provider.base_airport || provider.base || provider.location || 'Base pendiente'
}

function providerResponsible(provider = {}) {
  return resolveProviderRepresentativeName(provider)
}

function findFirstDocumentCollection(sources = []) {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue

    if (Array.isArray(source.documents) && source.documents.length) return source.documents
    if (Array.isArray(source.legal_documents) && source.legal_documents.length) return source.legal_documents
    if (Array.isArray(source.company_documents) && source.company_documents.length) return source.company_documents
    if (Array.isArray(source.documentos) && source.documentos.length) return source.documentos
    if (Array.isArray(source.files) && source.files.length) return source.files
  }

  for (const source of sources) {
    if (!source || typeof source !== 'object') continue

    if (Array.isArray(source.documents)) return source.documents
    if (Array.isArray(source.legal_documents)) return source.legal_documents
    if (Array.isArray(source.company_documents)) return source.company_documents
    if (Array.isArray(source.documentos)) return source.documentos
    if (Array.isArray(source.files)) return source.files
  }

  return []
}

function providerTaxDataSources(provider = {}) {
  return [
    provider.tax_data,
    provider.taxData,
    provider.profile?.tax_data,
    provider.profile?.taxData,
    provider.user?.tax_data,
    provider.user?.taxData,
    provider.user?.profile?.tax_data,
    provider.user?.profile?.taxData,
    provider.company?.tax_data,
    provider.company?.taxData,
    provider.data?.tax_data,
    provider.data?.taxData,
  ].filter((item) => item && typeof item === 'object')
}

function normalizeLegacyProviderDocument(document = {}, index = 0) {
  return normalizeOperatorValidationDocument(
    {
      id: document.id || `legacy-${index + 1}`,
      name: document.name || document.document_name || document.label || `Documento ${index + 1}`,
      document_name: document.document_name || document.name || document.label || `Documento ${index + 1}`,
      original_name: document.original_name || document.file_name || document.name || '',
      file_name: document.file_name || document.original_name || document.name || '',
      status: document.status || document.state || document.validation_status || 'pendiente',
      state: document.state || document.status || 'pendiente',
      notes: document.notes || document.observation || document.observacion || '',
      created_at: document.created_at || document.uploaded_at || document.updated_at || '',
      updated_at: document.updated_at || document.created_at || '',
      document_slot: document.document_slot || document.slot || '',
      document_type: document.document_type || document.type || '',
      document_category: document.document_category || document.category || '',
      document_section: document.document_section || document.section || '',
      definition_key: document.definition_key || document.document_slot || '',
      definition_label: document.definition_label || document.name || document.document_name || '',
      section_key: document.section_key || '',
      section_label: document.section_label || '',
      field_map: Array.isArray(document.field_map) ? document.field_map : [],
      file_url: document.file_url || document.document_url || document.url || '',
      document_url: document.document_url || document.file_url || document.url || '',
      download_url: document.download_url || document.downloadUrl || '',
      mime_type: document.mime_type || '',
      size: document.size || document.file_size || document.file_size_bytes || 0,
    },
    index,
  )
}

function providerDocuments(provider = {}) {
  const rawDocuments = findFirstDocumentCollection([
    provider,
    provider.company,
    provider.empresa,
    provider.provider,
    provider.proveedor,
    provider.profile,
    provider.user?.profile,
    provider.data,
  ])
  const legacyDocuments = providerTaxDataSources(provider).flatMap((source) =>
    Array.isArray(source.documents) ? source.documents : [],
  )
  const selectedDocuments = rawDocuments.length ? rawDocuments : legacyDocuments

  return selectedDocuments.map((item, index) =>
    rawDocuments.length
      ? normalizeOperatorValidationDocument(item, index)
      : normalizeLegacyProviderDocument(item, index),
  )
}

function readProviderCandidateValue(provider = {}, keys = []) {
  const sources = [
    provider,
    provider.company,
    provider.empresa,
    provider.provider,
    provider.proveedor,
    provider.profile,
    provider.user?.profile,
    provider.user,
    provider.data,
    ...providerTaxDataSources(provider),
  ]

  for (const source of sources) {
    if (!source || typeof source !== 'object') continue

    for (const key of keys) {
      const value = source[key]
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return value
      }
    }
  }

  return ''
}

function buildAdminProviderSnapshot(provider = {}) {
  const legalName =
    readProviderCandidateValue(provider, ['legal_name', 'razon_social']) ||
    readProviderCandidateValue(provider, ['company_name'])

  return {
    ...provider,
    company_name: readProviderCandidateValue(provider, ['company_name', 'commercial_name', 'legal_name', 'nombre_empresa']),
    commercial_name: readProviderCandidateValue(provider, ['commercial_name', 'trade_name', 'nombre_comercial', 'company_name', 'legal_name']),
    legal_name: legalName,
    company_phone: readProviderCandidateValue(provider, ['company_phone', 'phone', 'telefono']),
    company_email: readProviderCandidateValue(provider, ['company_email', 'email', 'correo']),
    rfc: readProviderCandidateValue(provider, ['rfc', 'tax_id']),
    base_airport: readProviderCandidateValue(provider, ['base_airport', 'base', 'airport', 'location']),
    address: readProviderCandidateValue(provider, ['address', 'direccion']),
    legal_representative: readProviderCandidateValue(provider, [
      'legal_representative',
      'representative_name',
      'representante_legal',
      'representative',
      'contact_name',
      'contact',
    ]),
    jet_a_price: readProviderCandidateValue(provider, ['jet_a_price', 'jetA', 'precio_jet_a']),
    margin_percent: readProviderCandidateValue(provider, ['margin_percent', 'utility_percent', 'porcentaje_utilidad']),
    fixed_fee: readProviderCandidateValue(provider, ['fixed_fee', 'fixedFee', 'fee_fijo']),
    sat_validation_status: readProviderCandidateValue(provider, ['sat_validation_status', 'satValidationStatus']),
    admin_notes: readProviderCandidateValue(provider, ['admin_notes', 'admin_validation_notes', 'observations', 'observaciones']),
    changes_notes: readProviderCandidateValue(provider, ['changes_notes', 'changesNotes']),
    rejection_reason: readProviderCandidateValue(provider, ['rejection_reason', 'rejectionReason']),
    documents: providerDocuments(provider),
  }
}

function extractDetailRecord(payload = {}) {
  const detailRecord = pickRecord(payload, [
    'provider',
    'proveedor',
    'company',
    'empresa',
    'operator',
    'data',
  ])

  if (!detailRecord || typeof detailRecord !== 'object' || Array.isArray(detailRecord)) {
    return null
  }

  return detailRecord
}

function extractDocumentsRecord(payload = {}) {
  const collections = [
    payload?.documents,
    payload?.legal_documents,
    payload?.company_documents,
    payload?.documentos,
    payload?.data,
  ]
  const collection = collections.find((value) => Array.isArray(value))

  if (!Array.isArray(collection) || !collection.length) return null

  return {
    documents: collection,
  }
}

const aircraftMetricsByProvider = computed(() => {
  const metrics = new Map()

  props.providers.forEach((provider) => {
    const providerId = Number(provider.id || provider.provider_id || 0)
    const providerKey = providerId > 0 ? `id:${providerId}` : `label:${providerLabel(provider)}`
    metrics.set(providerKey, {
      aircraft: 0,
      active: 0,
      trial: 0,
      pending: 0,
    })
  })

  props.aircraft.forEach((item) => {
    const aircraftProviderId = Number(item.provider_id || item.proveedor_id || item.provider?.id || 0)
    const fallbackLabel = providerLabel(item.provider || item)
    const key = aircraftProviderId > 0 ? `id:${aircraftProviderId}` : `label:${fallbackLabel}`
    const current = metrics.get(key) || {
      aircraft: 0,
      active: 0,
      trial: 0,
      pending: 0,
    }

    current.aircraft += 1
    if (String(item.status || '').toLowerCase() === 'active') current.active += 1
    if (String(item.status || '').toLowerCase() === 'trial_active') current.trial += 1
    if (!item.approved) current.pending += 1

    metrics.set(key, current)
  })

  return metrics
})

function providerMetrics(provider = {}) {
  if (provider?.aircraft_metrics && typeof provider.aircraft_metrics === 'object') {
    return {
      aircraft: Number(provider.aircraft_metrics.aircraft || 0),
      active: Number(provider.aircraft_metrics.active || 0),
      trial: Number(provider.aircraft_metrics.trial || 0),
      pending: Number(provider.aircraft_metrics.pending || 0),
    }
  }

  const providerId = Number(provider.id || provider.provider_id || 0)
  const providerKey = providerId > 0 ? `id:${providerId}` : `label:${providerLabel(provider)}`
  return (
    aircraftMetricsByProvider.value.get(providerKey) || {
      aircraft: 0,
      active: 0,
      trial: 0,
      pending: 0,
    }
  )
}

function matchesSearch(provider = {}) {
  const query = searchTerm.value.trim().toLowerCase()
  if (!query) return true

  return [
    providerLabel(provider),
    providerResponsible(provider),
    providerBase(provider),
    provider.company_email,
    provider.company_phone,
    provider.rfc,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query))
}

const filteredProviders = computed(() =>
  props.providers.filter((provider) => matchesSearch(provider)),
)

const dashboardKpis = computed(() => {
  const totals = filteredProviders.value.reduce(
    (acc, provider) => {
      const metrics = providerMetrics(provider)
      const status = providerStatusMeta(provider).key

      acc.providers += 1
      acc.aircraft += metrics.aircraft
      if (status === 'approved') acc.approved += 1
      else if (status === 'pending' || status === 'draft') acc.pending += 1
      else if (status === 'changes_required' || status === 'rejected') acc.suspended += 1
      return acc
    },
    { providers: 0, approved: 0, pending: 0, suspended: 0, aircraft: 0 },
  )

  return [
    { label: 'Proveedores totales', value: totals.providers, tone: 'default' },
    { label: 'Aprobados', value: totals.approved, tone: 'success' },
    { label: 'Pendientes', value: totals.pending, tone: 'warning' },
    { label: 'Aeronaves totales', value: totals.aircraft, tone: 'info' },
  ]
})

const providerGroups = computed(() => {
  const baseGroups = [
    { key: 'approved', title: 'Aprobados', providers: [] },
    { key: 'pending', title: 'Pendientes de revision', providers: [] },
    { key: 'changes_required', title: 'Cambios requeridos', providers: [] },
    { key: 'rejected', title: 'Validaciones canceladas', providers: [] },
    { key: 'draft', title: 'Expediente incompleto', providers: [] },
  ]

  filteredProviders.value.forEach((provider) => {
    const target = baseGroups.find((group) => group.key === providerStatusMeta(provider).key)
    if (target) target.providers.push(provider)
  })

  return baseGroups.filter((group) => group.providers.length)
})

const selectedProviderMetrics = computed(() =>
  selectedProvider.value ? providerMetrics(selectedProvider.value) : { aircraft: 0, active: 0, trial: 0, pending: 0 },
)

const selectedProviderSnapshot = computed(() =>
  selectedProvider.value ? buildAdminProviderSnapshot(selectedProvider.value) : null,
)

const selectedProviderReview = computed(() =>
  selectedProviderSnapshot.value ? buildProviderReviewFlow(selectedProviderSnapshot.value, selectedProviderMetrics.value) : null,
)

const estadoExpediente = computed(() => {
  const provider = selectedProvider.value
  const snapshot = selectedProviderSnapshot.value
  const review = selectedProviderReview.value
  const providerId = provider?.id || provider?.provider_id || null
  const reviewRequirements = Array.isArray(review?.validationRequirements) ? review.validationRequirements : []
  const requirementSource = reviewRequirements
  const requirementBusyProviderId = providerId || 'provider'
  const workflowFields = {
    admin_validation_status: provider?.admin_validation_status ?? snapshot?.admin_validation_status ?? null,
    review_status: provider?.review_status ?? snapshot?.review_status ?? null,
    approval_status: provider?.approval_status ?? snapshot?.approval_status ?? null,
    operator_status: provider?.operator_status ?? snapshot?.operator_status ?? null,
    access_enabled: provider?.access_enabled ?? snapshot?.access_enabled ?? null,
    admin_review_submitted_at: provider?.admin_review_submitted_at ?? snapshot?.admin_review_submitted_at ?? null,
    can_validate: provider?.can_validate ?? snapshot?.can_validate ?? null,
    documents_count:
      provider?.documents_count ??
      provider?.legal_documents_count ??
      provider?.company_documents_count ??
      snapshot?.documents_count ??
      null,
    validation_requirements_count: reviewRequirements.length,
  }

  const requisitos = requirementSource.map((item, index) => {
    const requirementKey = item?.key || item?.id || `requirement-${index + 1}`
    const responseStatus = item?.response_status ?? item?.responseStatus ?? null
    const normalizedResponseStatus = normalizeDecisionStatus(responseStatus)
    const isComplete = normalizeRequirementComplete(item)

    return {
      ...item,
      key: requirementKey,
      label: item?.label || item?.key || 'Requisito',
      message: item?.message || item?.reason || '',
      responseStatus: responseStatus || 'pending',
      normalizedResponseStatus,
      isComplete,
      complete: isComplete,
      adminNote: item?.admin_note || item?.adminNote || '',
      respondedAt: item?.responded_at || item?.respondedAt || '',
      actorName: item?.actor_name || item?.actorName || '',
      managedByDocuments: isRequirementManagedByDocuments(item),
      approveDisabled:
        loadingProviderDetail.value === true ||
        isRequirementManagedByDocuments(item) ||
        isRequirementBusy(requirementBusyProviderId, requirementKey) ||
        isComplete !== true,
      rejectDisabled:
        loadingProviderDetail.value === true ||
        isRequirementManagedByDocuments(item) ||
        isRequirementBusy(requirementBusyProviderId, requirementKey),
    }
  })

  const workflowStatuses = [
    workflowFields.admin_validation_status,
    workflowFields.review_status,
    workflowFields.approval_status,
    workflowFields.operator_status,
  ].map((value) => normalizeWorkflowStatus(value))

  const accessEnabledFlag = normalizeExplicitBoolean(workflowFields.access_enabled, {
    truthyValues: ['true', 'approved', 'aprobado', 'aprobada', 'validated', 'validado', 'validada'],
    falsyValues: ['false', 'pending', 'pendiente', 'rejected', 'rechazado', 'rechazada', 'cancelled', 'canceled', 'cancelado', 'cancelada'],
  })
  const canValidateFlag = normalizeExplicitBoolean(workflowFields.can_validate, {
    truthyValues: ['true', 'approved', 'aprobado', 'aprobada', 'validated', 'validado', 'validada'],
    falsyValues: ['false', 'pending', 'pendiente', 'rejected', 'rechazado', 'rechazada', 'cancelled', 'canceled', 'cancelado', 'cancelada'],
  })
  const hasReviewPayload =
    providerId !== null &&
    (requisitos.length > 0 ||
      hasTextValue(snapshot?.company_name) ||
      hasTextValue(snapshot?.legal_name) ||
      hasTextValue(snapshot?.rfc) ||
      hasTextValue(snapshot?.company_email) ||
      hasTextValue(snapshot?.company_phone) ||
      hasTextValue(snapshot?.base_airport) ||
      selectedProviderDocuments.value.length > 0)
  const expedienteCargado = loadingProviderDetail.value === false && hasReviewPayload
  const requisitosCompletosParaValidar =
    requisitos.length > 0 &&
    requisitos.every((item) => item.isComplete === true)
  const todosRequisitosObligatoriosAprobados =
    requisitos.length > 0 &&
    requisitos.every((item) => item.isComplete === true && item.normalizedResponseStatus === 'approved')
  const validacionIniciada =
    workflowStatuses.some((status) => ['pending_review', 'pending_validation', 'approved', 'changes_required', 'rejected', 'cancelled'].includes(status)) ||
    hasTextValue(workflowFields.admin_review_submitted_at)
  const operadorValido =
    accessEnabledFlag === true ||
    workflowStatuses.some((status) => status === 'approved')
  const loadingTerminado = loadingProviderDetail.value === false
  const accionEnCurso = isAnyValidationActionLoading() === true

  return {
    providerId,
    loading: {
      detalle: loadingProviderDetail.value === true,
      actividad: loadingSelectedProviderActivity.value === true,
      terminado: loadingTerminado,
      accionEnCurso,
    },
    camposSupabase: workflowFields,
    requisitos,
    expedienteCargado,
    validacionIniciada,
    operadorValido,
    requisitosCompletosParaValidar,
    todosRequisitosObligatoriosAprobados,
    canValidateExplicito: canValidateFlag,
    botones: {
      validarOperador: {
        enabled:
          loadingTerminado &&
          accionEnCurso === false &&
          (canValidateFlag === true || requisitosCompletosParaValidar),
      },
      solicitarCambios: {
        enabled: loadingTerminado && accionEnCurso === false && expedienteCargado,
      },
      cancelarValidacion: {
        enabled: loadingTerminado && accionEnCurso === false && validacionIniciada,
      },
      revisarAeronaves: {
        enabled: loadingTerminado && accionEnCurso === false && operadorValido,
      },
      continuarDespues: {
        enabled: loadingTerminado && accionEnCurso === false,
      },
    },
  }
})

const providerProgressStyle = computed(() => ({
  '--provider-progress': `${selectedProviderReview.value?.progress.percent || 0}%`,
}))

const selectedProviderDocuments = computed(() =>
  selectedProvider.value ? providerDocuments(selectedProvider.value) : [],
)

const selectedProviderHeader = computed(() => {
  if (!selectedProvider.value || !selectedProviderReview.value) return null

  return {
    companyName: selectedProviderReview.value.companyName,
    representative: selectedProviderReview.value.representative,
    base: selectedProviderReview.value.base,
    email: selectedProviderSnapshot.value?.company_email || 'Sin correo registrado',
    phone: selectedProviderSnapshot.value?.company_phone || 'Sin telefono registrado',
    rfc: selectedProviderSnapshot.value?.rfc || 'Sin RFC',
    legalName:
      selectedProviderSnapshot.value?.legal_name ||
      selectedProviderSnapshot.value?.company_name ||
      'Sin razon social registrada',
    statusMeta: selectedProviderReview.value.statusMeta,
  }
})

const selectedProviderCompanyProfile = computed(() =>
  selectedProviderSnapshot.value
    ? buildOperatorCompanyProfile({
        legal_name: selectedProviderSnapshot.value.legal_name || selectedProviderHeader.value?.legalName,
        rfc: selectedProviderSnapshot.value.rfc,
        commercial_name: selectedProviderSnapshot.value.commercial_name || selectedProviderHeader.value?.companyName,
        base_airport: selectedProviderSnapshot.value.base_airport || selectedProviderHeader.value?.base,
        address: selectedProviderSnapshot.value.address,
        legal_representative: selectedProviderHeader.value?.representative,
        company_phone: selectedProviderHeader.value?.phone,
        company_email: selectedProviderHeader.value?.email,
      })
    : [],
)

const selectedProviderCommercialConfig = computed(() =>
  selectedProviderSnapshot.value
    ? buildOperatorCommercialConfig({
        jet_a_price: selectedProviderSnapshot.value.jet_a_price,
        margin_percent: selectedProviderSnapshot.value.margin_percent,
        fixed_fee: selectedProviderSnapshot.value.fixed_fee,
      })
    : [],
)

const selectedProviderFleetSummary = computed(() =>
  buildOperatorFleetSummary(
    props.aircraft.filter((item) =>
      String(item.provider_id || item.proveedor_id || item.provider?.id || '') ===
      String(selectedProvider.value?.id || selectedProvider.value?.provider_id || ''),
    ),
  ),
)

const selectedProviderSharedActivity = computed(() =>
  selectedProviderActivity.value.map((entry, index) => normalizeValidationActivityEntry(entry, index)),
)

const selectedProviderDocumentLoadingState = computed(() => {
  const map = {}
  const key = activeDocumentActionKey.value
  if (!key) return map
  const parts = String(key).split(':')
  if (parts.length >= 3) {
    map[`${parts[1]}:${parts[2]}`] = true
  }
  return map
})

const selectedDocumentDrawerActivity = computed(() => {
  if (!selectedDocumentDrawer.value) return []
  return selectedProviderSharedActivity.value.filter((entry) =>
    String(entry.targetId || '') === String(selectedDocumentDrawer.value?.id || ''),
  )
})

function closeProviderDetail() {
  nextProviderRequestToken()
  abortProviderDetailRequest()
  abortProviderActivityRequest()
  closeProviderDocumentDrawer()
  selectedProvider.value = null
  selectedProviderActivity.value = []
  resetProviderAsyncState()
}

async function openProviderDocumentDrawer(provider, documentRecord) {
  const providerId = provider?.id || provider?.provider_id
  selectedDocumentDrawer.value = documentRecord
  selectedDocumentVersions.value = []
  loadingDocumentVersions.value = true
  abortProviderDocumentVersionsRequest()
  providerDocumentVersionsAbortController =
    typeof AbortController !== 'undefined' ? new AbortController() : null

  try {
    const versions = await getOperatorDocumentVersions(providerId, documentRecord?.id, {
      role: 'admin',
      signal: providerDocumentVersionsAbortController?.signal,
      timeoutMs: ADMIN_PROVIDER_DOCUMENT_VERSIONS_TIMEOUT_MS,
    })
    selectedDocumentVersions.value = Array.isArray(versions) ? versions : []
  } catch {
    selectedDocumentVersions.value = documentRecord?.versions || []
  } finally {
    providerDocumentVersionsAbortController = null
    loadingDocumentVersions.value = false
  }
}

function closeProviderDocumentDrawer() {
  abortProviderDocumentVersionsRequest()
  selectedDocumentDrawer.value = null
  selectedDocumentVersions.value = []
  loadingDocumentVersions.value = false
}

function mergeProviderDetailIntoSelection(baseProvider = {}, detailRecord = {}) {
  const detailDocuments = providerDocuments(detailRecord)
  const baseDocuments = providerDocuments(baseProvider)

  return {
    ...baseProvider,
    ...detailRecord,
    user:
      detailRecord.user && typeof detailRecord.user === 'object'
        ? { ...baseProvider.user, ...detailRecord.user }
        : baseProvider.user,
    profile:
      detailRecord.profile && typeof detailRecord.profile === 'object'
        ? { ...baseProvider.profile, ...detailRecord.profile }
        : baseProvider.profile,
    company:
      detailRecord.company && typeof detailRecord.company === 'object'
        ? { ...baseProvider.company, ...detailRecord.company }
        : baseProvider.company,
    empresa:
      detailRecord.empresa && typeof detailRecord.empresa === 'object'
        ? { ...baseProvider.empresa, ...detailRecord.empresa }
        : baseProvider.empresa,
    documents: detailDocuments.length ? detailDocuments : baseDocuments,
    legal_documents:
      Array.isArray(detailRecord.legal_documents) && detailRecord.legal_documents.length
        ? detailRecord.legal_documents
        : baseProvider.legal_documents,
    company_documents:
      Array.isArray(detailRecord.company_documents) && detailRecord.company_documents.length
        ? detailRecord.company_documents
        : baseProvider.company_documents,
  }
}

async function loadProviderDetail(provider = {}, options = {}) {
  const providerId = provider?.id || provider?.provider_id
  if (!providerId) return provider

  try {
    loadingProviderDetail.value = true
    abortProviderDetailRequest()
    providerDetailAbortController = typeof AbortController !== 'undefined' ? new AbortController() : null
    const [detailResponse, documentsResponse] = await Promise.allSettled([
      requestWithCandidates([
        { method: 'get', path: `/admin/providers/${providerId}/detail`, timeoutMs: ADMIN_PROVIDER_DETAIL_TIMEOUT_MS },
        { method: 'get', path: `/admin/proveedores/${providerId}/detalle`, timeoutMs: ADMIN_PROVIDER_DETAIL_TIMEOUT_MS },
        { method: 'get', path: `/admin/providers/${providerId}`, timeoutMs: ADMIN_PROVIDER_DETAIL_TIMEOUT_MS },
        { method: 'get', path: `/admin/proveedores/${providerId}`, timeoutMs: ADMIN_PROVIDER_DETAIL_TIMEOUT_MS },
        { method: 'get', path: `/admin/operators/${providerId}`, timeoutMs: ADMIN_PROVIDER_DETAIL_TIMEOUT_MS },
      ], { signal: providerDetailAbortController?.signal }),
      requestWithCandidates([
        { method: 'get', path: `/admin/providers/${providerId}/documents`, timeoutMs: ADMIN_PROVIDER_DETAIL_TIMEOUT_MS },
        { method: 'get', path: `/admin/proveedores/${providerId}/documentos`, timeoutMs: ADMIN_PROVIDER_DETAIL_TIMEOUT_MS },
        { method: 'get', path: `/admin/operators/${providerId}/documents`, timeoutMs: ADMIN_PROVIDER_DETAIL_TIMEOUT_MS },
      ], { signal: providerDetailAbortController?.signal }),
    ])

    if (options.requestToken != null && options.requestToken !== activeProviderRequestToken.value) {
      return provider
    }

    const detailRecord = extractDetailRecord(
      detailResponse.status === 'fulfilled' ? detailResponse.value : null,
    )
    const documentsRecord = extractDocumentsRecord(
      documentsResponse.status === 'fulfilled' ? documentsResponse.value : null,
    )
    const mergedRecord = {
      ...detailRecord,
      ...documentsRecord,
    }

    if (Object.keys(mergedRecord).length) {
      return mergeProviderDetailIntoSelection(provider, mergedRecord)
    }
  } catch (error) {
    if (isAbortLikeError(error)) return provider
    console.warn?.('[admin-provider-detail] no se pudo cargar detalle fresco', {
      providerId,
      message: error?.message || '',
    })
  } finally {
    providerDetailAbortController = null
    loadingProviderDetail.value = false
  }

  return provider
}

async function openProviderDetail(provider) {
  const providerId = String(provider?.id || provider?.provider_id || '')
  const requestToken = nextProviderRequestToken()
  abortProviderActivityRequest()
  closeProviderDocumentDrawer()
  selectedProvider.value = provider
  const [enrichedProvider] = await Promise.all([
    loadProviderDetail(provider, { requestToken }),
    loadSelectedProviderActivity(provider?.id || provider?.provider_id, { requestToken }),
  ])
  const selectedProviderId = String(selectedProvider.value?.id || selectedProvider.value?.provider_id || '')
  if (requestToken === activeProviderRequestToken.value && selectedProviderId === providerId) {
    selectedProvider.value = enrichedProvider
  }
}

function documentActionKey(providerId, documentId, action) {
  return `${providerId || 'provider'}:${documentId || 'document'}:${action}`
}

function validationActionKey(providerId, action) {
  return `${providerId || 'provider'}:${action}`
}

function isValidationActionLoading(providerId, action) {
  return activeValidationActionKey.value === validationActionKey(providerId, action)
}

function requirementActionKey(providerId, requirementKey, action) {
  return `${providerId || 'provider'}:${requirementKey || 'requirement'}:${action}`
}

function isRequirementActionLoading(providerId, requirementKey, action) {
  return activeRequirementActionKey.value === requirementActionKey(providerId, requirementKey, action)
}

function isRequirementBusy(providerId, requirementKey) {
  return (
    activeRequirementActionKey.value.startsWith(`${providerId || 'provider'}:${requirementKey || 'requirement'}:`) ||
    Boolean(activeValidationActionKey.value)
  )
}

async function loadSelectedProviderActivity(providerId, options = {}) {
  if (!providerId) {
    selectedProviderActivity.value = []
    return
  }

  try {
    loadingSelectedProviderActivity.value = true
    abortProviderActivityRequest()
    providerActivityAbortController = typeof AbortController !== 'undefined' ? new AbortController() : null
    const response = await requestWithCandidates([
      { method: 'get', path: `/admin/providers/${providerId}/activity`, timeoutMs: ADMIN_PROVIDER_ACTIVITY_TIMEOUT_MS },
      { method: 'get', path: `/admin/proveedores/${providerId}/actividad`, timeoutMs: ADMIN_PROVIDER_ACTIVITY_TIMEOUT_MS },
    ], { signal: providerActivityAbortController?.signal })

    if (options.requestToken != null && options.requestToken !== activeProviderRequestToken.value) {
      return
    }

    selectedProviderActivity.value = Array.isArray(response?.data)
      ? response.data
      : Array.isArray(response?.activity)
        ? response.activity
        : []
  } catch (error) {
    if (isAbortLikeError(error)) return
    selectedProviderActivity.value = []
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo cargar la actividad',
      message: error?.message || 'No se pudo cargar el registro del expediente.',
    })
  } finally {
    providerActivityAbortController = null
    loadingSelectedProviderActivity.value = false
  }
}

async function refreshSelectedProviderState(provider = selectedProvider.value) {
  const providerId = provider?.id || provider?.provider_id
  if (!providerId) return

  const refreshedProvider = await loadProviderDetail(provider)
  syncProviderRecord(refreshedProvider)
  await loadSelectedProviderActivity(providerId)
}

function syncProviderRecord(updatedProvider = {}) {
  const providerId = updatedProvider?.id || updatedProvider?.provider_id
  if (!providerId) return

  const localRecord = props.providers.find((item) => String(item.id || item.provider_id || '') === String(providerId))
  if (localRecord) Object.assign(localRecord, updatedProvider)
  if (selectedProvider.value && String(selectedProvider.value.id || selectedProvider.value.provider_id || '') === String(providerId)) {
    selectedProvider.value = mergeProviderDetailIntoSelection(selectedProvider.value, updatedProvider)
  }
}

async function downloadProviderDocument(provider, documentRecord) {
  const providerId = provider?.id || provider?.provider_id
  const documentId = documentRecord?.id

  try {
    activeDocumentActionKey.value = documentActionKey(providerId, documentId, 'download')
    const response = await requestWithCandidates([
      { method: 'download', path: `/admin/providers/${providerId}/documents/${documentId}/download` },
      { method: 'download', path: `/admin/proveedores/${providerId}/documentos/${documentId}/download` },
      { method: 'download', path: `/admin/company-documents/${documentId}/download` },
    ])
    const url = URL.createObjectURL(response.blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download =
      documentRecord?.fileName || documentRecord?.name || `documento-operador-${documentId || 'legal'}`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo descargar el documento',
      message: error?.message || 'El backend no devolvio el archivo solicitado.',
    })
  } finally {
    activeDocumentActionKey.value = ''
  }
}

async function updateProviderDocumentStatus(provider, documentRecord, status, notes = '', actionKey = status) {
  const providerId = provider?.id || provider?.provider_id
  const documentId = documentRecord?.id

  try {
    activeDocumentActionKey.value = documentActionKey(providerId, documentId, actionKey)
    const payload = {
      status,
      validation_status: status,
      review_status: status,
      notes,
      observation: notes,
      observacion: notes,
    }

    const response = await requestWithCandidates([
      { method: 'patch', path: `/admin/providers/${providerId}/documents/${documentId}`, body: payload },
      { method: 'patch', path: `/admin/proveedores/${providerId}/documentos/${documentId}`, body: payload },
      { method: 'post', path: `/admin/providers/${providerId}/documents/${documentId}/${status}`, body: payload },
      { method: 'post', path: `/admin/company-documents/${documentId}/${status}`, body: payload },
    ])

    const updatedDocument = response?.document && typeof response.document === 'object'
      ? providerDocuments({ documents: [response.document] })[0]
      : { ...documentRecord, status, notes: notes || documentRecord.notes }

    const nextDocuments = providerDocuments(provider).map((item) =>
      item.id === documentId ? { ...item, ...updatedDocument } : item,
    )

    provider.documents = nextDocuments
    if (selectedProvider.value === provider) {
      selectedProvider.value.documents = nextDocuments
    }

    await refreshSelectedProviderState(provider)

    ui.pushToast({
      tone: status === 'approved' ? 'success' : status === 'pending' ? 'info' : 'warning',
      title:
        status === 'approved'
          ? 'Documento aprobado'
          : status === 'pending'
            ? 'Aprobacion revocada'
            : 'Documento rechazado',
      message:
        status === 'approved'
          ? `${updatedDocument.name} ya quedo validado para el operador.`
          : status === 'pending'
            ? `${updatedDocument.name} regreso a revision administrativa.`
            : `${updatedDocument.name} quedo marcado con observaciones administrativas.`,
    })
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo actualizar el documento',
      message: error?.message || 'La validacion documental no pudo guardarse.',
    })
  } finally {
    activeDocumentActionKey.value = ''
  }
}

async function approveProviderDocument(provider, documentRecord) {
  await updateProviderDocumentStatus(provider, documentRecord, 'approved', '', 'approve')
}

async function rejectProviderDocument(provider, documentRecord) {
  if (typeof window === 'undefined') return
  const note = window.prompt('Observacion para rechazar el documento', documentRecord?.notes || '')
  if (note == null) return
  await updateProviderDocumentStatus(provider, documentRecord, 'rejected', note, 'reject')
}

async function cancelProviderDocument(provider, documentRecord) {
  await updateProviderDocumentStatus(provider, documentRecord, 'pending', '', 'cancel')
}

async function updateProviderValidation(provider, action, notes = '') {
  const providerId = provider?.id || provider?.provider_id
  if (!providerId) return

  try {
    activeValidationActionKey.value = validationActionKey(providerId, action)
    const trimmedNotes = String(notes || '').trim()
    const payload =
      action === 'request_changes'
        ? {
            notes: trimmedNotes,
            admin_notes: trimmedNotes,
            changes_notes: trimmedNotes,
          }
        : action === 'reject'
          ? {
              notes: trimmedNotes,
              admin_notes: trimmedNotes,
              rejection_reason: trimmedNotes,
            }
          : trimmedNotes
            ? {
                notes: trimmedNotes,
                admin_notes: trimmedNotes,
              }
            : {}
    const response = await requestWithCandidates([
      { method: 'post', path: `/admin/providers/${providerId}/validate`, body: payload, when: action === 'validate' },
      { method: 'post', path: `/admin/proveedores/${providerId}/validar`, body: payload, when: action === 'validate' },
      { method: 'post', path: `/admin/proveedores/${providerId}/aprobar`, body: payload, when: action === 'validate' },
      { method: 'post', path: `/admin/providers/${providerId}/request-changes`, body: payload, when: action === 'request_changes' },
      { method: 'post', path: `/admin/proveedores/${providerId}/solicitar-cambios`, body: payload, when: action === 'request_changes' },
      { method: 'post', path: `/admin/proveedores/${providerId}/suspender`, body: payload, when: action === 'request_changes' },
      { method: 'post', path: `/admin/providers/${providerId}/reject`, body: payload, when: action === 'reject' },
      { method: 'post', path: `/admin/proveedores/${providerId}/cancelar-validacion`, body: payload, when: action === 'reject' },
      { method: 'post', path: `/admin/proveedores/${providerId}/rechazar`, body: payload, when: action === 'reject' },
    ]
      .filter((candidate) => candidate.when !== false)
      .map((candidate) => {
        const nextCandidate = { ...candidate }
        delete nextCandidate.when
        return nextCandidate
      }))

    const updatedProvider = pickRecord(response, ['provider', 'proveedor', 'company', 'empresa', 'data'])
    if (updatedProvider && typeof updatedProvider === 'object') {
      syncProviderRecord(updatedProvider)
      const refreshedProvider = await loadProviderDetail(updatedProvider)
      syncProviderRecord(refreshedProvider)
    }

    await loadSelectedProviderActivity(providerId)

    emit('refresh')

    const messages = {
      validate: {
        tone: 'success',
        title: 'Operador validado correctamente',
        message: 'El expediente completo fue validado por administracion y el acceso operativo quedo habilitado.',
      },
      request_changes: {
        tone: 'warning',
        title: 'Cambios solicitados',
        message: 'El operador debera corregir el expediente antes de volver a revision.',
      },
      reject: {
        tone: 'warning',
        title: 'Validacion cancelada',
        message: 'El acceso operativo del operador quedo deshabilitado.',
      },
    }

    ui.pushToast(messages[action])
  } catch (error) {
    const validationErrors = error?.payload?.errors?.validation
    const details = Array.isArray(validationErrors)
      ? validationErrors.join(' ')
      : error?.message || 'La accion administrativa no pudo guardarse.'

    ui.pushToast({
      tone: 'error',
      title: 'No se pudo actualizar la validacion',
      message: details,
    })
  } finally {
    activeValidationActionKey.value = ''
  }
}

async function validateSelectedProvider() {
  if (!selectedProvider.value || !selectedProviderReview.value) return

  if (estadoExpediente.value.botones.validarOperador.enabled !== true) {
    const missingItems = estadoExpediente.value.requisitos.filter(
      (item) => item.isComplete !== true || item.normalizedResponseStatus !== 'approved',
    )
    ui.pushToast({
      tone: 'warning',
      title: 'No se puede validar todavia',
      message: missingItems.map((item) => item.message || `${item.label} pendiente.`).join(' '),
    })
    return
  }

  await updateProviderValidation(selectedProvider.value, 'validate')
}

async function requestChangesSelectedProvider() {
  if (!selectedProvider.value || typeof window === 'undefined') return
  const note = window.prompt('Comentarios obligatorios para solicitar cambios', selectedProvider.value.admin_validation_notes || '')
  if (note == null) return
  if (!String(note).trim()) {
    ui.pushToast({
      tone: 'warning',
      title: 'Comentario requerido',
      message: 'Debes indicar los cambios requeridos antes de guardar.',
    })
    return
  }

  await updateProviderValidation(selectedProvider.value, 'request_changes', note.trim())
}

async function rejectSelectedProvider() {
  if (!selectedProvider.value || typeof window === 'undefined') return
  const note = window.prompt('Motivo obligatorio para cancelar o rechazar al operador', selectedProvider.value.admin_validation_notes || '')
  if (note == null) return
  if (!String(note).trim()) {
    ui.pushToast({
      tone: 'warning',
      title: 'Motivo requerido',
      message: 'Debes indicar el motivo del rechazo antes de guardar.',
    })
    return
  }

  await updateProviderValidation(selectedProvider.value, 'reject', note.trim())
}

async function updateRequirementDecision(requirement, action) {
  const provider = selectedProvider.value
  const providerId = provider?.id || provider?.provider_id
  const requirementKey = requirement?.key
  if (!providerId || !requirementKey) return

  if (isRequirementManagedByDocuments(requirement)) {
    ui.pushToast({
      tone: 'info',
      title: 'Este requisito se actualiza desde los documentos',
      message: 'Documentación legal aprobada cambia automáticamente cuando apruebas o rechazas los documentos legales del expediente.',
    })
    return
  }

  let note = ''
  if (action === 'reject') {
    if (typeof window === 'undefined') return
    note = window.prompt(`Motivo obligatorio para cancelar ${requirement.label}`, requirement?.adminNote || '') || ''
    if (!String(note).trim()) {
      ui.pushToast({
        tone: 'warning',
        title: 'Comentario requerido',
        message: 'Debes indicar el motivo administrativo antes de guardar.',
      })
      return
    }
  }

  try {
    activeRequirementActionKey.value = requirementActionKey(providerId, requirementKey, action)
    const payload = note
      ? {
          notes: note.trim(),
          admin_notes: note.trim(),
        }
      : {}
    const response = await requestWithCandidates([
      { method: 'post', path: `/admin/providers/${providerId}/requirements/${requirementKey}/approve`, body: payload, when: action === 'approve' },
      { method: 'post', path: `/admin/proveedores/${providerId}/requisitos/${requirementKey}/aprobar`, body: payload, when: action === 'approve' },
      { method: 'post', path: `/admin/providers/${providerId}/requirements/${requirementKey}/reject`, body: payload, when: action === 'reject' },
      { method: 'post', path: `/admin/proveedores/${providerId}/requisitos/${requirementKey}/rechazar`, body: payload, when: action === 'reject' },
    ]
      .filter((candidate) => candidate.when !== false)
      .map((candidate) => {
        const nextCandidate = { ...candidate }
        delete nextCandidate.when
        return nextCandidate
      }))

    const updatedProvider = pickRecord(response, ['provider', 'proveedor', 'company', 'empresa', 'data'])
    if (updatedProvider && typeof updatedProvider === 'object') {
      syncProviderRecord(updatedProvider)
    }

    await refreshSelectedProviderState(provider)
    emit('refresh')

    ui.pushToast({
      tone: action === 'approve' ? 'success' : 'warning',
      title: action === 'approve' ? 'Requisito validado' : 'Requisito cancelado',
      message:
        action === 'approve'
          ? `${requirement.label} quedó validado por administración.`
          : `${requirement.label} quedó marcado con observaciones administrativas.`,
    })
  } catch (error) {
    const validationErrors = error?.payload?.errors?.validation
    const details = Array.isArray(validationErrors)
      ? validationErrors.join(' ')
      : error?.message || 'La decisión por requisito no pudo guardarse.'

    ui.pushToast({
      tone: 'error',
      title: 'No se pudo guardar la decisión',
      message: details,
    })
  } finally {
    activeRequirementActionKey.value = ''
  }
}

async function openProviderAircraft(provider) {
  const providerId = provider?.id || provider?.provider_id || ''
  const providerName = providerLabel(provider)

  await router.push({
    path: resolveRoleSectionPath('admin', 'aeronaves'),
    query: {
      providerId: providerId ? String(providerId) : undefined,
      providerName: providerName || undefined,
    },
  })
}

onBeforeUnmount(() => {
  abortProviderDetailRequest()
  abortProviderActivityRequest()
  abortProviderDocumentVersionsRequest()
})
</script>

<template>
  <section class="providers-page">
    <div class="surface page-head">
      <div class="page-head-copy">
        <span class="eyebrow">CRUD proveedores</span>
        <h3>Panel de control de proveedores</h3>
        <p class="muted">
          Supervisa altas, estado comercial y tamano de flota desde una vista operativa central.
        </p>
      </div>
    </div>

    <div class="kpi-grid">
      <article v-for="item in dashboardKpis" :key="item.label" :class="['surface', 'kpi-card', `tone-${item.tone}`]">
        <strong>{{ item.value }}</strong>
        <span>{{ item.label }}</span>
      </article>
    </div>

    <section class="surface filters-shell">
      <label class="search-field">
        <span>Buscar proveedor</span>
        <input v-model="searchTerm" type="search" placeholder="Buscar proveedor..." />
      </label>
    </section>

    <template v-if="filteredProviders.length">
      <section v-for="group in providerGroups" :key="group.key" class="provider-status-section">
        <div class="section-head">
          <h4>{{ group.title }}</h4>
          <span>{{ group.providers.length }} proveedor{{ group.providers.length === 1 ? '' : 'es' }}</span>
        </div>

        <div class="provider-grid">
          <article v-for="provider in group.providers" :key="provider.id || providerLabel(provider)" class="surface provider-card">
            <div class="provider-card-top">
              <div class="provider-heading">
                <div class="provider-title-row">
                  <span class="provider-dot" :class="`provider-dot-${providerStatusMeta(provider).tone}`">
                    {{ providerStatusMeta(provider).icon }}
                  </span>
                  <h5>{{ providerLabel(provider) }}</h5>
                </div>
                <span class="provider-id">Proveedor #{{ provider.id || 'N/A' }}</span>
              </div>
              <span :class="['status-pill', `status-pill-${providerStatusMeta(provider).tone}`]">
                {{ providerStatusMeta(provider).label }}
              </span>
            </div>

            <div class="provider-main-kpi">
              <strong>{{ providerMetrics(provider).aircraft }}</strong>
              <span>Aeronaves</span>
            </div>

            <div class="provider-stats-inline">
              <div class="provider-stat-card">
                <span>Activas</span>
                <strong>{{ providerMetrics(provider).active }}</strong>
              </div>
              <div class="provider-stat-card">
                <span>Pendientes</span>
                <strong>{{ providerMetrics(provider).pending }}</strong>
              </div>
              <div class="provider-stat-card">
                <span>Trial</span>
                <strong>{{ providerMetrics(provider).trial }}</strong>
              </div>
            </div>

            <div class="provider-meta">
              <div class="provider-meta-row">
                <span>Responsable</span>
                <strong>{{ providerResponsible(provider) }}</strong>
              </div>
              <div class="provider-meta-row">
                <span>Base</span>
                <strong>{{ providerBase(provider) }}</strong>
              </div>
            </div>

            <div class="provider-card-actions">
              <button type="button" class="provider-link provider-link-secondary" @click="openProviderDetail(provider)">
                Revisar expediente
              </button>
              <button type="button" class="provider-link" @click="openProviderAircraft(provider)">
                Ver aeronaves
              </button>
            </div>
          </article>
        </div>
      </section>
    </template>

    <div v-else class="surface empty-state">
      <strong>No encontramos proveedores con ese criterio.</strong>
      <p class="muted">Prueba con otro nombre o revisa si ya hay proveedores sincronizados en el backend.</p>
    </div>

    <div v-if="selectedProvider" class="provider-detail-backdrop" @click="closeProviderDetail"></div>
    <section v-if="selectedProvider && selectedProviderHeader && selectedProviderReview" class="surface provider-detail-modal" aria-label="Detalle de proveedor">
      <div class="provider-detail-head">
        <div>
          <span class="eyebrow">Centro de revision de operador</span>
          <h4>{{ selectedProviderHeader.companyName }}</h4>
          <p class="muted">Representante {{ selectedProviderHeader.representative }} · Base {{ selectedProviderHeader.base }}</p>
        </div>
        <div class="provider-detail-head-actions">
          <span :class="['status-pill', `status-pill-${selectedProviderHeader.statusMeta.tone}`]">
            {{ selectedProviderHeader.statusMeta.label }}
          </span>
          <button type="button" class="provider-detail-close" @click="closeProviderDetail">Cerrar</button>
        </div>
      </div>

      <div v-if="loadingProviderDetail" class="provider-detail-loading-note">
        Estamos actualizando el expediente y la documentación más reciente del proveedor.
      </div>

      <div class="provider-detail-layout">
        <div class="provider-detail-main">
          <section class="provider-detail-hero">
            <article class="provider-detail-hero-card">
              <span class="eyebrow">Perfil de empresa</span>
              <div class="provider-detail-title-row">
                <div>
                  <strong class="provider-detail-company">{{ selectedProviderHeader.companyName }}</strong>
                  <p class="provider-detail-subtitle">{{ selectedProviderHeader.legalName }}</p>
                </div>
                <div class="provider-detail-progress" :style="providerProgressStyle">
                  <div class="provider-detail-progress-ring">
                    <strong>{{ selectedProviderReview.progress.percent }}%</strong>
                    <span>Completo</span>
                  </div>
                </div>
              </div>

              <div class="provider-detail-checklist">
                <article
                  v-for="step in selectedProviderReview.checklist"
                  :key="step.id"
                  :class="[
                    'provider-check-item',
                    step.complete ? 'is-complete' : step.rejected ? 'is-rejected' : step.pending ? 'is-pending' : 'is-idle'
                  ]"
                >
                  <strong>{{ step.complete ? 'OK' : step.rejected ? 'Obs' : step.pending ? 'Pend' : 'Info' }}</strong>
                  <span>{{ step.label }}</span>
                </article>
              </div>
            </article>

            <article class="provider-detail-kpis">
              <article class="provider-detail-stat">
                <span>Aeronaves</span>
                <strong>{{ selectedProviderMetrics.aircraft }}</strong>
              </article>
              <article class="provider-detail-stat">
                <span>Activas</span>
                <strong>{{ selectedProviderMetrics.active }}</strong>
              </article>
              <article class="provider-detail-stat">
                <span>Pendientes</span>
                <strong>{{ selectedProviderMetrics.pending }}</strong>
              </article>
              <article class="provider-detail-stat">
                <span>Trial</span>
                <strong>{{ selectedProviderMetrics.trial }}</strong>
              </article>
            </article>
          </section>

          <section class="provider-detail-panel">
            <CompanyProfileCard
              eyebrow="Empresa"
              title="Informacion capturada por el proveedor"
              :items="selectedProviderCompanyProfile"
            />
          </section>

          <section class="provider-detail-panel">
            <CompanyCommercialCard
              eyebrow="Comercial"
              title="Configuracion comercial"
              :items="selectedProviderCommercialConfig"
            />
          </section>

          <section class="provider-detail-panel">
            <FleetSummary
              eyebrow="Flota"
              title="Aeronaves registradas"
              :fleet="selectedProviderFleetSummary"
            />
          </section>

          <section class="provider-detail-panel">
            <OperatorDocumentList
              role="admin"
              title="Documentacion legal"
              subtitle="Lista compacta para revision administrativa"
              :documents="selectedProviderDocuments"
              :loading-state-by-key="selectedProviderDocumentLoadingState"
              @view="openProviderDocumentDrawer(selectedProvider, $event)"
              @download="downloadProviderDocument(selectedProvider, $event)"
              @approve="approveProviderDocument(selectedProvider, $event)"
              @reject="rejectProviderDocument(selectedProvider, $event)"
              @cancel="cancelProviderDocument(selectedProvider, $event)"
            />
          </section>

       
        </div>

        <aside class="provider-detail-sidebar">
          <section class="provider-detail-panel provider-detail-summary">
            <OperatorValidationSummary
              :summary="selectedProviderReview.summary"
              :badge-label="selectedProviderHeader.statusMeta.label"
            />
          </section>
<section class="provider-detail-panel provider-admin-decision-panel">
  <div class="provider-admin-decision-head">
    <div>
      <span class="eyebrow">Control de validación del operador</span>
      <strong>{{ getValidationPanelHeadline() }}</strong>
      <p>
        {{ getValidationPanelDetail() }}
      </p>
    </div>

    <span
      :class="[
        'admin-decision-status',
        estadoExpediente.botones.validarOperador.enabled ? 'is-ready' : 'is-blocked'
      ]"
    >
      {{ estadoExpediente.botones.validarOperador.enabled ? 'Listo para validar' : 'Bloqueado por requisitos' }}
    </span>
  </div>

  <div
    v-if="!estadoExpediente.todosRequisitosObligatoriosAprobados"
    class="admin-decision-blocked-note"
  >
    <strong>Validación bloqueada</strong>
    <span>{{ missingValidationLabelsText() }}</span>
  </div>

  <div v-else-if="selectedProviderReview.statusMeta.key !== 'approved'" class="admin-decision-ready-note">
    <strong>Listo para validación administrativa</strong>
    <span>Todos los requisitos del checklist ya fueron aprobados individualmente.</span>
  </div>

  <section class="admin-validation-checklist">
    <div class="admin-validation-checklist__head">
      <strong>Checklist de validación administrativa</strong>
      <span>La validación del operador revisa todo el expediente de empresa.</span>
    </div>

    <div class="admin-validation-checklist__grid">
      <article
        v-for="item in estadoExpediente.requisitos"
        :key="item.key"
        :class="[
          'admin-validation-check',
          `tone-${validationRequirementTone(item)}`
        ]"
      >
        <span class="admin-validation-check__icon">{{ validationRequirementIcon(item) }}</span>
        <div class="admin-validation-check__copy">
          <strong>{{ item.label }}</strong>
          <small>{{ validationRequirementStateLabel(item) }}</small>
          <small
            :class="[
              'admin-validation-check__response',
              `tone-${validationRequirementResponseTone(item)}`
            ]"
          >
            {{ validationRequirementResponseLabel(item) }}
          </small>
          <small v-if="item.managedByDocuments" class="admin-validation-check__hint">
            Este requisito se sincroniza automaticamente con los documentos legales.
          </small>
          <small class="admin-validation-check__hint">{{ validationRequirementHint(item) }}</small>
          <small v-if="item.respondedAt || item.actorName">
            {{ formatDateTime(item.respondedAt) }}<span v-if="item.actorName"> · {{ item.actorName }}</span>
          </small>
          <small v-if="item.adminNote" class="admin-validation-check__note">Motivo: {{ item.adminNote }}</small>
        </div>
        <div class="admin-validation-check__actions">
          <button
            type="button"
            :class="[
              'admin-validation-check__button',
              'admin-validation-check__button--approve',
              { 'is-active': isRequirementApproved(item) }
            ]"
            :disabled="item.approveDisabled"
            @click="updateRequirementDecision(item, 'approve')"
          >
            {{ isRequirementActionLoading(selectedProvider.id || selectedProvider.provider_id, item.key, 'approve') ? 'Validando...' : 'Validar' }}
          </button>
          <button
            type="button"
            :class="[
              'admin-validation-check__button',
              'admin-validation-check__button--reject',
              { 'is-active': isRequirementRejected(item) }
            ]"
            :disabled="item.rejectDisabled"
            @click="updateRequirementDecision(item, 'reject')"
          >
            {{ isRequirementActionLoading(selectedProvider.id || selectedProvider.provider_id, item.key, 'reject') ? 'Guardando...' : 'Cancelar' }}
          </button>
        </div>
      </article>
    </div>
  </section>

  <div class="admin-validation-actions">
    <button
      type="button"
      class="admin-validation-actions__button admin-validation-actions__button--primary"
      :disabled="!estadoExpediente.botones.validarOperador.enabled"
      @click="validateSelectedProvider"
    >
      {{ isValidationActionLoading(selectedProvider.id || selectedProvider.provider_id, 'validate') ? 'Validando operador...' : 'Validar operador' }}
    </button>
    <button
      type="button"
      class="admin-validation-actions__button admin-validation-actions__button--warning"
      :disabled="!estadoExpediente.botones.solicitarCambios.enabled"
      @click="requestChangesSelectedProvider"
    >
      {{ isValidationActionLoading(selectedProvider.id || selectedProvider.provider_id, 'request_changes') ? 'Guardando...' : 'Solicitar cambios' }}
    </button>
    <button
      type="button"
      class="admin-validation-actions__button admin-validation-actions__button--danger"
      :disabled="!estadoExpediente.botones.cancelarValidacion.enabled"
      @click="rejectSelectedProvider"
    >
      {{ isValidationActionLoading(selectedProvider.id || selectedProvider.provider_id, 'reject') ? 'Cancelando...' : 'Cancelar validacion' }}
    </button>
    <button
      type="button"
      class="admin-validation-actions__button admin-validation-actions__button--ghost"
      :disabled="!estadoExpediente.botones.revisarAeronaves.enabled"
      @click="openProviderAircraft(selectedProvider)"
    >
      Revisar aeronaves
    </button>
  </div>

</section>

          <section class="provider-detail-panel">
            <div class="provider-detail-panel-head">
              <span class="eyebrow">Alertas</span>
              <strong>Prioridades del expediente</strong>
            </div>

            <div class="provider-alerts-list">
              <article
                v-for="alert in selectedProviderReview.alerts"
                :key="alert.title"
                :class="['provider-alert-row', `provider-alert-row-${alert.tone}`]"
              >
                {{ alert.title }}
              </article>
            </div>
          </section>

      
        </aside>
      </div>

      <OperatorDocumentDrawer
        :open="Boolean(selectedDocumentDrawer)"
        role="admin"
        :document="selectedDocumentDrawer"
        :versions="selectedDocumentVersions"
        :activity="selectedDocumentDrawerActivity"
        :loading-versions="loadingDocumentVersions"
        @close="closeProviderDocumentDrawer"
        @download="downloadProviderDocument(selectedProvider, $event)"
        @approve="approveProviderDocument(selectedProvider, $event)"
        @reject="rejectProviderDocument(selectedProvider, $event)"
        @cancel="cancelProviderDocument(selectedProvider, $event)"
      />
    </section>
  </section>
</template>

<style scoped>
/*------------------------------------------------------------------------------------------------------------------------------*/
.providers-page {
  --providers-ink: #15324d;
  --providers-ink-soft: #6f8096;
  --providers-line: rgba(132, 151, 177, 0.18);
  --providers-warm-line: rgba(226, 173, 71, 0.18);
  --providers-surface: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 246, 241, 0.96));
  --providers-panel: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 246, 242, 0.96));
  --providers-panel-soft: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(249, 248, 245, 0.96));
  --providers-shadow: 0 26px 54px rgba(27, 54, 82, 0.08);
  --providers-accent: #eda83a;
  --providers-accent-soft: #fff1d8;
  --providers-success: #2f9a6c;
  --providers-success-soft: #e8f8ef;
  --providers-warning: #de9b29;
  --providers-warning-soft: #fff4df;
  --providers-danger: #dc7a68;
  --providers-danger-soft: #feebe6;
  --providers-info: #5f87c7;
  --providers-info-soft: #e8f0fd;
  display: grid;
  gap: 1.25rem;
  padding: 0.25rem 0 1rem;
}

.page-head,
.filters-shell,
.provider-card,
.empty-state,
.kpi-card {
  padding: 1rem;
}

.page-head-copy,
.search-field,
.provider-card,
.provider-main-kpi,
.provider-meta {
  display: grid;
  gap: 0.5rem;
}

.page-head h3,
.provider-card h5,
.section-head h4 {
  margin: 0;
}

.page-head {
  position: relative;
  overflow: hidden;
  border-radius: 1.6rem;
  border: 1px solid rgba(132, 151, 177, 0.14);
  background:
    radial-gradient(circle at top right, rgba(237, 168, 58, 0.16), transparent 24%),
    radial-gradient(circle at bottom left, rgba(111, 164, 222, 0.14), transparent 26%),
    var(--providers-panel);
  box-shadow: var(--providers-shadow);
}

.page-head::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background:
    linear-gradient(rgba(232, 237, 244, 0.34) 1px, transparent 1px),
    linear-gradient(90deg, rgba(232, 237, 244, 0.34) 1px, transparent 1px);
  background-size: 100% 1.4rem, 1.4rem 100%;
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.26), transparent 58%);
  pointer-events: none;
}

.page-head-copy {
  max-width: 44rem;
  position: relative;
  z-index: 1;
}

.page-head :deep(.eyebrow) {
  color: #6483a8;
}

.page-head :deep(.muted),
.empty-state :deep(.muted) {
  color: var(--providers-ink-soft);
}

.page-head h3 {
  color: var(--providers-ink);
  font-size: clamp(1.6rem, 2vw, 2.1rem);
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
}

.kpi-card {
  border: 1px solid rgba(132, 151, 177, 0.14);
  border-radius: 1.45rem;
  background:
    radial-gradient(circle at top right, rgba(237, 168, 58, 0.08), transparent 34%),
    var(--providers-surface);
  box-shadow: 0 18px 38px rgba(27, 54, 82, 0.08);
}

.kpi-card strong {
  color: var(--providers-ink);
  font-size: 2.5rem;
  line-height: 0.95;
}

.kpi-card span {
  color: #8593a6;
  font-size: 0.76rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.tone-success {
  border-color: rgba(47, 154, 108, 0.18);
  background:
    radial-gradient(circle at top right, rgba(47, 154, 108, 0.08), transparent 30%),
    var(--providers-surface);
}

.tone-warning {
  border-color: rgba(222, 155, 41, 0.18);
  background:
    radial-gradient(circle at top right, rgba(222, 155, 41, 0.08), transparent 30%),
    var(--providers-surface);
}

.tone-info {
  border-color: rgba(95, 135, 199, 0.18);
  background:
    radial-gradient(circle at top right, rgba(95, 135, 199, 0.08), transparent 30%),
    var(--providers-surface);
}

.filters-shell {
  border-radius: 1.4rem;
  border: 1px solid rgba(132, 151, 177, 0.14);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(250, 248, 244, 0.96));
  box-shadow: 0 14px 30px rgba(27, 54, 82, 0.07);
}

.search-field span {
  color: #8593a6;
  font-size: 0.76rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.search-field input {
  width: 100%;
  min-height: 3.6rem;
  border: 1px solid rgba(132, 151, 177, 0.16);
  border-radius: 1.2rem;
  background: rgba(255, 255, 255, 0.96);
  padding: 0 1.1rem;
  color: var(--providers-ink);
  font-size: 1.02rem;
  outline: none;
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.04);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background 0.2s ease;
}
/*------------------------------------------------------------------------------------------------------------------------------*/


.search-field input:focus {
  border-color: rgba(70, 137, 181, 0.45);
  box-shadow:
    0 0 0 4px rgba(112, 168, 205, 0.12),
    inset 0 1px 2px rgba(15, 23, 42, 0.04);
}

.provider-status-section {
  display: grid;
  gap: 1rem;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid rgba(191, 166, 126, 0.24);
  padding-bottom: 0.6rem;
}

.section-head span {
  color: var(--providers-ink-soft);
  font-size: 0.86rem;
  font-weight: 700;
}

.section-head h4 {
  color: var(--providers-ink);
  font-size: 1.2rem;
}

.provider-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}

.provider-card {
  min-height: 150px;
  border: 1px solid rgba(132, 151, 177, 0.14);
  border-radius: 1.5rem;
  background:
    radial-gradient(circle at top right, rgba(237, 168, 58, 0.1), transparent 26%),
    radial-gradient(circle at bottom left, rgba(111, 164, 222, 0.08), transparent 24%),
    var(--providers-panel-soft);
  color: var(--providers-ink);
  box-shadow: 0 20px 40px rgba(27, 54, 82, 0.08);
  padding: 1.3rem;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.provider-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 26px 44px rgba(27, 54, 82, 0.12);
  border-color: rgba(95, 135, 199, 0.22);
}

.provider-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.provider-heading {
  display: grid;
  gap: 0.38rem;
}

.provider-title-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.provider-card h5 {
  color: var(--providers-ink);
  font-size: 1.12rem;
  font-weight: 800;
}

.provider-id {
  color: #8d9caf;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.provider-dot {
  flex: 0 0 auto;
  font-size: 0.9rem;
  line-height: 1;
}

.provider-dot-success {
  color: #61d69a;
}

.provider-dot-warning {
  color: #ffc85c;
}

.provider-dot-danger {
  color: #ff8d82;
}

.status-pill {
  border-radius: 999px;
  padding: 0.34rem 0.68rem;
  font-size: 0.68rem;
  font-weight: 800;
  white-space: nowrap;
}

.status-pill-success {
  color: #0f5b39;
  background: var(--providers-success-soft);
}

.status-pill-warning {
  color: #8f5a05;
  background: var(--providers-warning-soft);
}

.status-pill-danger {
  color: #8e3328;
  background: var(--providers-danger-soft);
}

.provider-main-kpi strong {
  font-size: 3.35rem;
  line-height: 0.95;
  letter-spacing: -0.04em;
}

.provider-main-kpi span,
.provider-stats-inline span,
.provider-meta-row span {
  color: #8091a6;
}

.provider-main-kpi span,
.provider-stats-inline span {
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.provider-stats-inline {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.provider-stat-card {
  display: grid;
  gap: 0.28rem;
  border: 1px solid rgba(132, 151, 177, 0.12);
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.72);
  padding: 0.72rem 0.8rem;
}

.provider-stat-card strong {
  font-size: 1.32rem;
  line-height: 1;
}

.provider-meta {
  gap: 0.65rem;
}

.provider-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-top: 1px solid rgba(132, 151, 177, 0.12);
  padding-top: 0.65rem;
}

.provider-meta-row strong {
  color: var(--providers-ink);
  font-size: 0.92rem;
  text-align: right;
}

.provider-link {
  width: fit-content;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(180deg, #f6dda0 0%, #ebc97a 100%);
  padding: 0.52rem 0.8rem;
  color: #533400;
  font-size: 0.82rem;
  font-weight: 800;
  box-shadow: 0 10px 18px rgba(215, 166, 77, 0.18);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    background 0.2s ease;
}

.provider-link:hover {
  transform: translateY(-1px);
  background: linear-gradient(180deg, #f9e6b8 0%, #efcf87 100%);
  box-shadow: 0 14px 28px rgba(215, 166, 77, 0.28);
}

.provider-link-secondary {
  border: 1px solid rgba(126, 151, 176, 0.22);
  background: linear-gradient(180deg, rgba(243, 247, 251, 0.96), rgba(231, 238, 245, 0.94));
  color: #45627f;
  box-shadow: 0 10px 20px rgba(79, 115, 149, 0.08);
}

.provider-link-secondary:hover {
  background: linear-gradient(180deg, rgba(248, 250, 253, 0.98), rgba(236, 242, 248, 0.96));
  color: #24425f;
  box-shadow: 0 14px 24px rgba(79, 115, 149, 0.12);
}

.provider-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.provider-link-danger {
  color: var(--providers-danger);
}

.empty-state {
  border-radius: 1.4rem;
  border: 1px solid rgba(132, 151, 177, 0.14);
  background:
    radial-gradient(circle at top right, rgba(237, 168, 58, 0.1), transparent 28%),
    var(--providers-panel);
  color: var(--providers-ink);
  box-shadow: var(--providers-shadow);
  padding: 0.95rem 1rem;
}

.provider-detail-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(17, 36, 55, 0.32);
  backdrop-filter: blur(10px);
  z-index: 30;
}

.provider-detail-modal {
  position: fixed;
  inset: 1.1rem;
  width: auto;
  overflow: hidden;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border: 1px solid rgba(132, 151, 177, 0.14);
  border-radius: 2rem;
  background:
    radial-gradient(circle at top right, rgba(237, 168, 58, 0.1), transparent 22%),
    radial-gradient(circle at left 30%, rgba(111, 164, 222, 0.08), transparent 28%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(248, 246, 241, 0.98));
  box-shadow: 0 34px 84px rgba(27, 54, 82, 0.16);
  z-index: 31;
  padding: 1.15rem 1.15rem 1rem;
}

.provider-detail-head,
.provider-detail-grid {
  display: grid;
  gap: 0.8rem;
}

.provider-detail-head {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  margin-bottom: 1rem;
  padding-bottom: 0.9rem;
  border-bottom: 1px solid rgba(132, 151, 177, 0.12);
}

.provider-detail-head-actions {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.provider-detail-head h4 {
  margin: 0.18rem 0 0;
  color: var(--providers-ink);
  font-size: 1.42rem;
}

.provider-detail-close {
  border: 1px solid rgba(132, 151, 177, 0.18);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.96);
  color: var(--providers-ink);
  padding: 0.56rem 0.85rem;
  font-size: 0.86rem;
  font-weight: 700;
  cursor: pointer;
}

.provider-detail-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.provider-detail-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(20rem, 0.92fr);
  gap: 1rem;
  min-height: 0;
  overflow: hidden;
}

.provider-detail-main,
.provider-detail-sidebar,
.provider-detail-hero,
.provider-detail-kpis,
.provider-detail-checklist,
.provider-data-grid,
.provider-documents-list,
.provider-summary-list,
.provider-alerts-list,
.provider-quick-actions {
  display: grid;
  gap: 0.65rem;
}

.provider-detail-main,
.provider-detail-sidebar {
  min-height: 0;
  align-content: start;
}

.provider-detail-main {
  overflow: auto;
  padding-right: 0.2rem;
}

.provider-detail-sidebar {
  overflow: auto;
  padding-right: 0.15rem;
}

.provider-detail-summary,
.provider-admin-decision-panel {
  position: sticky;
}

.provider-detail-summary {
  top: 0;
}

.provider-admin-decision-panel {
  top: 16rem;
}

.provider-detail-panel,
.provider-detail-hero-card {
  border: 1px solid rgba(132, 151, 177, 0.12);
  border-radius: 1.3rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(250, 248, 244, 0.94));
  box-shadow:
    0 14px 28px rgba(27, 54, 82, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.74);
  padding: 1rem;
}

.provider-detail-hero {
  grid-template-columns: minmax(0, 1.3fr) minmax(16rem, 0.8fr);
  gap: 1rem;
}

.provider-detail-title-row {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 0.75rem;
}

.provider-detail-company {
  display: block;
  color: var(--providers-ink);
  font-size: clamp(1.7rem, 2.6vw, 2.4rem);
  line-height: 0.95;
  letter-spacing: -0.04em;
}

.provider-detail-subtitle {
  margin: 0.28rem 0 0;
  color: var(--providers-ink-soft);
  font-size: 0.88rem;
}

.provider-detail-progress {
  display: grid;
  place-items: center;
  min-width: 6.6rem;
  min-height: 6.6rem;
  border-radius: 50%;
  background:
    conic-gradient(from 180deg, #2a6bb2 0 var(--provider-progress), rgba(221, 230, 240, 0.9) var(--provider-progress) 100%);
  padding: 0.42rem;
  box-shadow: 0 16px 28px rgba(42, 107, 178, 0.16);
}

.provider-detail-progress-ring {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 0.12rem;
  border-radius: 50%;
  background:
    radial-gradient(circle at top, rgba(97, 158, 221, 0.08), transparent 55%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(247, 249, 252, 0.96));
  text-align: center;
}

.provider-detail-progress strong {
  display: block;
  color: #295978;
  font-size: 1.45rem;
  line-height: 1;
}

.provider-detail-progress span {
  color: #7990ab;
  font-size: 0.62rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.provider-check-item,
.provider-summary-row,
.provider-alert-row,
.provider-data-card,
.provider-document-card {
  border-radius: 0.9rem;
  padding: 0.72rem 0.8rem;
}

.provider-detail-checklist {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.65rem;
}

.provider-check-item {
  border: 1px solid rgba(132, 151, 177, 0.12);
  background: linear-gradient(180deg, rgba(247, 250, 253, 0.98), rgba(241, 245, 250, 0.94));
  min-height: 0;
}

.provider-check-item strong,
.provider-data-card span {
  display: block;
  color: #8a6b36;
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.provider-check-item span,
.provider-data-card strong {
  color: var(--providers-ink);
  font-weight: 800;
  font-size: 0.88rem;
  line-height: 1.28;
}

.provider-check-item.is-complete {
  border-color: rgba(47, 143, 104, 0.24);
  background: linear-gradient(180deg, rgba(223, 245, 234, 0.98), rgba(211, 238, 226, 0.94));
}

.provider-check-item.is-pending {
  border-color: rgba(198, 134, 32, 0.24);
  background: linear-gradient(180deg, rgba(253, 240, 213, 0.98), rgba(249, 233, 196, 0.92));
}

.provider-check-item.is-rejected {
  border-color: rgba(207, 102, 91, 0.24);
  background: linear-gradient(180deg, rgba(254, 235, 231, 0.96), rgba(251, 222, 216, 0.92));
}

.provider-check-item.is-idle {
  border-color: rgba(135, 158, 181, 0.2);
  background: linear-gradient(180deg, rgba(240, 244, 248, 0.94), rgba(233, 239, 245, 0.9));
}

.provider-data-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
}

.provider-data-card {
  border: 1px solid rgba(132, 151, 177, 0.12);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.94));
  min-height: 0;
}

.provider-document-card {
  border: 1px solid rgba(132, 151, 177, 0.12);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(247, 249, 252, 0.96));
  display: grid;
  gap: 0.7rem;
}

.provider-data-card-wide {
  grid-column: 1 / -1;
}

.provider-detail-panel-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.55rem;
}

.provider-detail-panel-head strong {
  color: var(--providers-ink);
  font-size: 0.98rem;
  line-height: 1.25;
}

.provider-detail-kpis {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
}

.provider-detail-stat {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.18rem;
  min-height: 6.1rem;
  padding: 0.8rem 0.86rem;
  border: 1px solid rgba(132, 151, 177, 0.12);
  border-radius: 1.1rem;
  background:
    radial-gradient(circle at top right, rgba(95, 135, 199, 0.08), transparent 34%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(247, 249, 252, 0.95));
  text-align: center;
}

.provider-detail-stat span {
  color: var(--providers-ink-soft);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.provider-detail-stat strong {
  color: var(--providers-ink);
  font-size: 1.6rem;
  line-height: 1;
}

.provider-document-head,
.provider-document-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.provider-document-head {
  align-items: flex-start;
}

.provider-document-head__copy {
  display: grid;
  gap: 0.18rem;
  min-width: 0;
}

.provider-document-head__copy strong {
  color: var(--providers-ink);
}

.provider-document-summary {
  overflow-wrap: anywhere;
}

.provider-document-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.55rem;
}

.provider-document-meta-item {
  display: grid;
  gap: 0.14rem;
  min-width: 0;
  padding: 0.58rem 0.68rem;
  border: 1px solid rgba(132, 151, 177, 0.14);
  border-radius: 0.85rem;
  background: rgba(255, 255, 255, 0.86);
}

.provider-document-meta-item span {
  color: #8a6b36;
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.provider-document-meta-item strong {
  color: var(--providers-ink-soft);
  font-size: 0.8rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.provider-document-columns {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.provider-document-column-pill {
  border: 1px solid rgba(95, 122, 149, 0.22);
  border-radius: 999px;
  padding: 0.35rem 0.7rem;
  color: var(--providers-ink-soft);
  font-size: 0.78rem;
  background: rgba(255, 255, 255, 0.82);
}

.provider-document-actions {
  justify-content: flex-start;
  gap: 0.45rem;
}

.provider-documents-loading,
.provider-documents-empty {
  color: var(--providers-ink);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(249, 250, 252, 0.94));
  border-radius: 0.95rem;
  padding: 0.75rem 0.85rem;
  border: 1px solid rgba(132, 151, 177, 0.12);
  min-height: 0;
  font-size: 0.86rem;
}

.provider-summary-row,
.provider-alert-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border: 1px solid rgba(132, 151, 177, 0.12);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.94));
}

.provider-summary-row span {
  color: var(--providers-ink-soft);
  font-size: 0.8rem;
}

.provider-summary-row strong {
  color: var(--providers-ink);
  text-align: right;
  font-size: 0.84rem;
  line-height: 1.25;
}

.provider-summary-row.tone-success {
  border-color: rgba(47, 143, 104, 0.18);
  background: linear-gradient(180deg, rgba(243, 251, 247, 0.96), rgba(232, 246, 238, 0.92));
}

.provider-summary-row.tone-warning {
  border-color: rgba(198, 134, 32, 0.18);
  background: linear-gradient(180deg, rgba(255, 249, 236, 0.96), rgba(251, 241, 217, 0.92));
}

.provider-summary-row.tone-info {
  border-color: rgba(79, 135, 177, 0.18);
  background: linear-gradient(180deg, rgba(243, 248, 253, 0.96), rgba(228, 239, 249, 0.92));
}

.provider-summary-row.tone-neutral {
  border-color: rgba(132, 154, 176, 0.14);
  background: linear-gradient(180deg, rgba(252, 253, 254, 0.96), rgba(243, 247, 251, 0.92));
}

.provider-alert-row-warning {
  border-color: rgba(198, 134, 32, 0.24);
  background: linear-gradient(180deg, rgba(255, 244, 221, 0.9), rgba(251, 235, 196, 0.84));
  color: #8b5a08;
}

.provider-alert-row-info {
  border-color: rgba(79, 135, 177, 0.22);
  background: linear-gradient(180deg, rgba(230, 240, 249, 0.9), rgba(219, 233, 245, 0.84));
  color: #295978;
}

.provider-alert-row-success {
  border-color: rgba(47, 143, 104, 0.22);
  background: linear-gradient(180deg, rgba(224, 245, 234, 0.92), rgba(211, 238, 226, 0.84));
  color: #0f5b39;
}

.provider-alert-row-danger {
  border-color: rgba(207, 102, 91, 0.22);
  background: linear-gradient(180deg, rgba(254, 235, 231, 0.92), rgba(251, 222, 216, 0.84));
  color: #8e3328;
}
/*----------------------------------------------------------------------------------------------------*/
.provider-admin-decision-panel {
  border: 1px solid rgba(220, 125, 109, 0.14);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(252, 248, 247, 0.96));
  box-shadow:
    0 18px 38px rgba(27, 54, 82, 0.06),
    inset 0 3px 0 rgba(242, 156, 133, 0.5);
}

.provider-admin-decision-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: start;
  margin-bottom: 0.8rem;
  border-bottom: 1px solid rgba(132, 151, 177, 0.14);
  padding-bottom: 0.8rem;
}

.provider-admin-decision-head strong {
  display: block;
  color: var(--providers-ink);
  font-size: 0.98rem;
  font-weight: 900;
}

.provider-admin-decision-head p {
  max-width: 24rem;
  margin: 0.22rem 0 0;
  color: var(--providers-ink-soft);
  font-size: 0.78rem;
  line-height: 1.35;
}

.admin-decision-status {
  border-radius: 999px;
  padding: 0.42rem 0.7rem;
  font-size: 0.64rem;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
}

.admin-decision-status.is-ready {
  color: #0f5b39;
  background: #e4f6ec;
  border: 1px solid rgba(47, 143, 104, 0.24);
}

.admin-decision-status.is-blocked {
  color: #7c4d05;
  background: #fff1d6;
  border: 1px solid rgba(198, 134, 32, 0.3);
}

.admin-decision-blocked-note {
  display: grid;
  gap: 0.25rem;
  margin-bottom: 0.8rem;
  border: 1px solid rgba(198, 134, 32, 0.24);
  border-radius: 0.9rem;
  background: linear-gradient(180deg, #fff9eb 0%, #f9ecd0 100%);
  padding: 0.72rem 0.8rem;
}

.admin-decision-blocked-note strong {
  color: #7c4d05;
  font-size: 0.78rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.admin-decision-blocked-note span {
  color: #70480a;
  font-size: 0.78rem;
  line-height: 1.35;
}

.admin-decision-ready-note {
  display: grid;
  gap: 0.25rem;
  margin-bottom: 0.8rem;
  border: 1px solid rgba(47, 143, 104, 0.24);
  border-radius: 0.9rem;
  background: linear-gradient(180deg, #eefaf4 0%, #dcf2e6 100%);
  padding: 0.72rem 0.8rem;
}

.provider-detail-loading-note,
.provider-activity-loading-note {
  margin: 0 0 0.9rem;
  border-radius: 0.9rem;
  border: 1px solid rgba(21, 74, 127, 0.14);
  background: rgba(244, 248, 252, 0.92);
  color: var(--providers-ink-soft);
  font-size: 0.8rem;
  line-height: 1.4;
  padding: 0.72rem 0.84rem;
}

.provider-activity-loading-note {
  margin-top: 0.8rem;
  margin-bottom: 0;
}

.admin-decision-ready-note strong {
  color: #0f5b39;
  font-size: 0.78rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.admin-decision-ready-note span {
  color: #1f6c49;
  font-size: 0.78rem;
  line-height: 1.35;
}

.admin-validation-checklist {
  display: grid;
  gap: 0.7rem;
  margin-bottom: 0.8rem;
  border: 1px solid rgba(132, 151, 177, 0.12);
  border-radius: 1rem;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(247, 249, 251, 0.94));
  padding: 0.8rem;
}

.admin-validation-checklist__head {
  display: grid;
  gap: 0.25rem;
}

.admin-validation-checklist__head strong {
  color: var(--providers-ink);
  font-size: 0.92rem;
}

.admin-validation-checklist__head span {
  color: var(--providers-ink-soft);
  font-size: 0.76rem;
  line-height: 1.35;
}

.admin-validation-checklist__grid {
  display: grid;
  gap: 0.55rem;
}

.admin-validation-check {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 0.6rem;
  border: 1px solid rgba(132, 151, 177, 0.12);
  border-radius: 0.95rem;
  padding: 0.78rem 0.8rem;
}

.admin-validation-check__icon {
  display: grid;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 900;
}

.admin-validation-check__copy {
  display: grid;
  gap: 0.12rem;
}

.admin-validation-check__copy strong {
  color: var(--providers-ink);
  font-size: 0.86rem;
}

.admin-validation-check__copy small {
  color: var(--providers-ink-soft);
  font-size: 0.72rem;
  font-weight: 700;
}

.admin-validation-check__hint {
  color: var(--providers-ink-soft);
  font-weight: 600;
}

.admin-validation-check__response {
  width: fit-content;
  border-radius: 999px;
  padding: 0.14rem 0.48rem;
}

.admin-validation-check__response.tone-success {
  color: #0f5b39;
  background: rgba(47, 143, 104, 0.12);
}

.admin-validation-check__response.tone-danger {
  color: #8e3328;
  background: rgba(207, 102, 91, 0.12);
}

.admin-validation-check__response.tone-warning {
  color: #8f5a05;
  background: rgba(198, 134, 32, 0.12);
}

.admin-validation-check__response.tone-info {
  color: #295978;
  background: rgba(79, 135, 177, 0.12);
}

.admin-validation-check__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.4rem;
  min-width: 0;
  padding-left: 0.2rem;
}

.admin-validation-check__button {
  appearance: none;
  border: 1px solid rgba(132, 151, 177, 0.18);
  border-radius: 0.72rem;
  background: #ffffff;
  color: var(--providers-ink);
  font-size: 0.72rem;
  font-weight: 800;
  line-height: 1.2;
  padding: 0.5rem 0.68rem;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.admin-validation-check__button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 20px rgba(20, 44, 67, 0.08);
}

.admin-validation-check__button:focus-visible {
  outline: 3px solid rgba(215, 166, 77, 0.3);
  outline-offset: 2px;
}

.admin-validation-check__button:disabled {
  cursor: not-allowed;
  opacity: 0.56;
  box-shadow: none;
}

.admin-validation-check__button--approve {
  border-color: rgba(47, 143, 104, 0.28);
  color: #0f5b39;
  background: rgba(240, 250, 245, 0.92);
}

.admin-validation-check__button--approve.is-active {
  border-color: rgba(47, 143, 104, 0.46);
  background: linear-gradient(180deg, rgba(232, 247, 239, 0.98), rgba(220, 242, 230, 0.98));
  box-shadow: inset 0 0 0 1px rgba(47, 143, 104, 0.08);
}

.admin-validation-check__button--reject {
  border-color: rgba(207, 102, 91, 0.28);
  color: #8e3328;
  background: rgba(253, 239, 236, 0.96);
}

.admin-validation-check__button--reject.is-active {
  border-color: rgba(207, 102, 91, 0.48);
  background: linear-gradient(180deg, rgba(254, 232, 228, 0.98), rgba(251, 220, 214, 0.98));
  box-shadow: inset 0 0 0 1px rgba(207, 102, 91, 0.08);
}

.admin-validation-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: center;
}

.admin-validation-actions__button {
  appearance: none;
  border: 1px solid rgba(132, 151, 177, 0.18);
  border-radius: 0.85rem;
  padding: 0.7rem 0.95rem;
  font-size: 0.76rem;
  font-weight: 800;
  line-height: 1.2;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease,
    background 0.18s ease,
    color 0.18s ease;
}

.admin-validation-actions__button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 12px 22px rgba(20, 44, 67, 0.08);
}

.admin-validation-actions__button:focus-visible {
  outline: 3px solid rgba(215, 166, 77, 0.3);
  outline-offset: 2px;
}

.admin-validation-actions__button:disabled {
  cursor: not-allowed;
  opacity: 0.56;
  box-shadow: none;
}

.admin-validation-actions__button--primary {
  border-color: rgba(47, 143, 104, 0.28);
  background: linear-gradient(180deg, rgba(240, 250, 245, 0.98), rgba(227, 245, 236, 0.94));
  color: #0f5b39;
}

.admin-validation-actions__button--warning {
  border-color: rgba(198, 134, 32, 0.28);
  background: linear-gradient(180deg, rgba(255, 247, 231, 0.98), rgba(255, 239, 208, 0.94));
  color: #8f5a05;
}

.admin-validation-actions__button--danger {
  border-color: rgba(207, 102, 91, 0.28);
  background: linear-gradient(180deg, rgba(253, 239, 236, 0.98), rgba(251, 225, 219, 0.94));
  color: #8e3328;
}

.admin-validation-actions__button--ghost {
  background: rgba(255, 255, 255, 0.96);
  color: var(--providers-ink);
}

.admin-validation-check__note {
  color: #8e3328;
  font-weight: 800;
}

.admin-validation-check.tone-success {
  border-color: rgba(47, 143, 104, 0.18);
  background: linear-gradient(180deg, rgba(240, 250, 245, 0.96), rgba(227, 245, 236, 0.92));
}

.admin-validation-check.tone-success .admin-validation-check__icon {
  color: #0f5b39;
  background: rgba(47, 143, 104, 0.16);
}

.admin-validation-check.tone-info {
  border-color: rgba(79, 135, 177, 0.2);
  background: linear-gradient(180deg, rgba(244, 249, 253, 0.96), rgba(232, 242, 249, 0.92));
}

.admin-validation-check.tone-info .admin-validation-check__icon {
  color: #295978;
  background: rgba(79, 135, 177, 0.14);
}

.admin-validation-check.tone-warning {
  border-color: rgba(198, 134, 32, 0.22);
  background: linear-gradient(180deg, rgba(255, 249, 236, 0.96), rgba(251, 240, 214, 0.92));
}

.admin-validation-check.tone-warning .admin-validation-check__icon {
  color: #8f5a05;
  background: rgba(198, 134, 32, 0.14);
}

.admin-validation-check.tone-danger {
  border-color: rgba(207, 102, 91, 0.22);
  background: linear-gradient(180deg, rgba(254, 243, 241, 0.96), rgba(251, 231, 227, 0.92));
}

.admin-validation-check.tone-danger .admin-validation-check__icon {
  color: #8e3328;
  background: rgba(207, 102, 91, 0.12);
}

.provider-activity-list {
  display: grid;
  gap: 0.55rem;
}

.provider-activity-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.65rem;
  align-items: start;
  border: 1px solid rgba(132, 151, 177, 0.12);
  border-radius: 1rem;
  padding: 0.85rem 0.9rem;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(247, 249, 252, 0.95));
}

.provider-activity-item strong {
  color: var(--providers-ink);
}

.provider-activity-item p,
.provider-activity-item small,
.provider-activity-empty {
  margin: 0.18rem 0 0;
  color: var(--providers-ink-soft);
  font-size: 0.76rem;
  line-height: 1.35;
}

.provider-activity-item.tone-success {
  border-color: rgba(47, 143, 104, 0.18);
}

.provider-activity-item.tone-warning {
  border-color: rgba(198, 134, 32, 0.24);
}

.activity-dot {
  width: 0.72rem;
  height: 0.72rem;
  margin-top: 0.35rem;
  border-radius: 999px;
  background: linear-gradient(180deg, #f0b24f 0%, #ffd48d 100%);
  box-shadow: 0 0 0 6px rgba(237, 168, 58, 0.14);
}

.ghost-button-warning {
  border-color: rgba(198, 134, 32, 0.24);
  color: #8f5a05;
}

.admin-action-grid {
  display: grid;
  gap: 0.6rem;
}

.admin-action-card {
  width: 100%;
  display: grid;
  grid-template-columns: 2.2rem minmax(0, 1fr) auto;
  gap: 0.7rem;
  align-items: center;
  border: 1px solid rgba(132, 151, 177, 0.14);
  border-radius: 0.95rem;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(248, 250, 252, 0.95));
  padding: 0.72rem 0.78rem;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 12px 26px rgba(27, 54, 82, 0.06);
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease;
}

.admin-action-card:hover {
  transform: translateY(-2px);
  border-color: rgba(95, 135, 199, 0.24);
  box-shadow: 0 18px 34px rgba(27, 54, 82, 0.1);
}

.admin-action-card.is-selected {
  border-color: rgba(23, 50, 74, 0.52);
  background: linear-gradient(180deg, #ffffff 0%, #f4f7fa 100%);
  box-shadow:
    0 18px 34px rgba(20, 44, 67, 0.14),
    inset 4px 0 0 var(--providers-ink);
}

.admin-action-card.is-disabled {
  cursor: not-allowed;
  opacity: 0.68;
  background: linear-gradient(180deg, #f8fafc 0%, #eef2f6 100%);
}

.admin-action-card:focus-visible {
  outline: 3px solid rgba(215, 166, 77, 0.35);
  outline-offset: 3px;
}

.admin-action-icon {
  width: 2.2rem;
  height: 2.2rem;
  display: grid;
  place-items: center;
  border-radius: 0.72rem;
  font-size: 0.88rem;
  font-weight: 900;
}

.admin-action-copy {
  display: grid;
  gap: 0.18rem;
}

.admin-action-copy strong {
  color: var(--providers-ink);
  font-size: 0.86rem;
  font-weight: 900;
}

.admin-action-copy small {
  color: var(--providers-ink-soft);
  font-size: 0.72rem;
  line-height: 1.35;
}

.admin-action-selected {
  border-radius: 999px;
  background: rgba(23, 50, 74, 0.08);
  color: var(--providers-ink);
  padding: 0.26rem 0.5rem;
  font-size: 0.6rem;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.admin-action-primary .admin-action-icon {
  background: linear-gradient(180deg, #1d3a56 0%, #163047 100%);
  color: #ffffff;
}

.admin-action-warning .admin-action-icon {
  background: linear-gradient(180deg, #f6dda0 0%, #ebc97a 100%);
  color: #533400;
}

.admin-action-danger .admin-action-icon {
  background: linear-gradient(180deg, #fde5e1 0%, #f7cbc5 100%);
  color: #8e3328;
}

.admin-action-neutral .admin-action-icon {
  background: linear-gradient(180deg, #dfedf8 0%, #cfe2f1 100%);
  color: #295978;
}

.admin-action-secondary .admin-action-icon {
  background: linear-gradient(180deg, #eef3f7 0%, #dfe7ee 100%);
  color: #45627f;
}

.admin-action-primary.is-selected {
  border-color: rgba(23, 50, 74, 0.52);
}

.admin-action-warning.is-selected {
  border-color: rgba(215, 166, 77, 0.62);
  box-shadow:
    0 18px 34px rgba(215, 166, 77, 0.16),
    inset 4px 0 0 var(--providers-accent);
}

.admin-action-danger.is-selected {
  border-color: rgba(207, 102, 91, 0.52);
  box-shadow:
    0 18px 34px rgba(207, 102, 91, 0.14),
    inset 4px 0 0 var(--providers-danger);
}

@media (max-width: 760px) {
  .admin-validation-check {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .admin-validation-check__actions {
    grid-column: 1 / -1;
    min-width: 0;
    justify-content: stretch;
  }

  .admin-validation-check__button {
    flex: 1 1 0;
    justify-content: center;
  }

  .provider-admin-decision-head,
  .admin-action-card {
    grid-template-columns: 1fr;
  }

  .admin-action-selected {
    width: fit-content;
  }
}

@media (max-width: 1180px) {
  .provider-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .provider-detail-layout,
  .provider-detail-hero {
    grid-template-columns: 1fr;
  }

  .provider-detail-main,
  .provider-detail-sidebar {
    overflow: visible;
    padding-right: 0;
  }

  .provider-detail-summary,
  .provider-admin-decision-panel {
    position: static;
  }
}

@media (max-width: 760px) {
  .kpi-grid,
  .provider-grid,
  .provider-stats-inline,
  .provider-detail-grid,
  .provider-detail-kpis,
  .provider-data-grid,
  .provider-detail-checklist {
    grid-template-columns: 1fr;
  }

  .section-head,
  .provider-card-top,
  .provider-detail-head,
  .provider-detail-panel-head,
  .provider-detail-title-row,
  .provider-summary-row,
  .provider-alert-row,
  .provider-document-head,
  .provider-document-actions {
    display: grid;
  }

  .provider-document-meta {
    grid-template-columns: 1fr;
  }

  .provider-meta-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .provider-detail-modal {
    inset: 0.75rem;
    padding: 0.82rem 0.82rem 0.78rem;
    overflow: auto;
    display: block;
  }

  .provider-detail-head {
    margin-bottom: 0.7rem;
    padding-bottom: 0.65rem;
  }
}
</style>
