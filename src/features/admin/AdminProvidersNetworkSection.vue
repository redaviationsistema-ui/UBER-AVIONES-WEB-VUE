<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { pickRecord, requestWithCandidates } from '../../lib/backendCrud'
import { resolveRoleSectionPath } from '../../data/roleFlows'
import { useUiStore } from '../../stores/ui'
import {
  buildProviderReviewFlow,
  resolveProviderCompanyName,
  resolveProviderRepresentativeName,
  resolveProviderStatusMeta,
} from '../../lib/providerReview'
import { normalizeAdminProviderDocument } from '../../lib/providerCompanyDocuments'

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
const selectedAdminActionKey = ref('')
const loadingProviderDetail = ref(false)
const selectedProviderActivity = ref([])
const loadingSelectedProviderActivity = ref(false)


function missingValidationLabelsText() {
  const pendingItems =
    selectedProviderReview.value?.validationRequirements?.filter(
      (item) => !item.complete || !isRequirementApproved(item),
    ) || []

  if (!pendingItems.length) {
    return 'Todos los requisitos administrativos ya fueron aprobados.'
  }

  return `Faltan requisitos por aprobar: ${pendingItems
    .map((item) => (item.complete ? `${item.label} (pendiente de validacion admin)` : `${item.label} (dato incompleto)`))
    .join(', ')}.`
}

function getValidationPanelHeadline() {
  if (!selectedProviderReview.value) return 'Expediente pendiente de validacion administrativa'
  if (selectedProviderReview.value.statusMeta.key === 'approved') return 'Operador validado por administracion'
  if (selectedProviderReview.value.canValidate) return 'Listo para validacion administrativa'
  return 'Expediente pendiente de validacion administrativa'
}

function getValidationPanelDetail() {
  if (!selectedProviderReview.value) return 'Admin debe revisar el expediente completo antes de tomar una decision.'
  if (selectedProviderReview.value.statusMeta.key === 'approved') {
    return 'La validacion del operador ya fue aprobada manualmente y el acceso operativo quedo habilitado.'
  }
  if (selectedProviderReview.value.canValidate) {
    return 'Todos los requisitos del checklist ya fueron aprobados individualmente. Ya puedes validar formalmente al operador.'
  }
  return 'Cada requisito debe aprobarse o cancelarse por separado. Validar el operador completo solo se habilita cuando todos esten aprobados.'
}

function validationRequirementStateLabel(item = {}) {
  return item.complete ? 'Dato completo' : 'Dato pendiente'
}

function normalizeRequirementResponseStatus(item = {}) {
  return String(item.responseStatus || '').trim().toLowerCase()
}

function isRequirementApproved(item = {}) {
  return ['approved', 'aprobado', 'validated', 'validado'].includes(normalizeRequirementResponseStatus(item))
}

function isRequirementRejected(item = {}) {
  return ['rejected', 'rechazado', 'rechazada', 'cancelled', 'canceled', 'cancelado'].includes(
    normalizeRequirementResponseStatus(item),
  )
}

function validationRequirementTone(item = {}) {
  if (isRequirementApproved(item)) return 'success'
  if (isRequirementRejected(item)) return 'danger'
  return item.complete ? 'info' : 'warning'
}

function validationRequirementIcon(item = {}) {
  if (isRequirementApproved(item)) return '✓'
  if (isRequirementRejected(item)) return '×'
  return item.complete ? '•' : '!'
}

function validationRequirementResponseLabel(item = {}) {
  if (isRequirementApproved(item)) return 'Aprobado por administracion'
  if (isRequirementRejected(item)) return 'Cancelado por administracion'
  return 'Pendiente de decision administrativa'
}

function validationRequirementResponseTone(item = {}) {
  if (isRequirementApproved(item)) return 'success'
  if (isRequirementRejected(item)) return 'danger'
  return item.complete ? 'info' : 'warning'
}

function validationRequirementHint(item = {}) {
  if (isRequirementApproved(item)) return 'Este requisito ya fue aprobado de forma individual.'
  if (isRequirementRejected(item)) return 'Este requisito fue cancelado y requiere correccion o nueva revision.'
  if (item.complete) return 'El dato ya esta completo y listo para que Admin lo valide o lo cancele.'
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

function resolveActivityTone(eventType = '') {
  const normalized = String(eventType || '').trim().toLowerCase()
  if (normalized.includes('rejected') || normalized.includes('changes')) return 'warning'
  if (normalized.includes('approved') || normalized.includes('validated')) return 'success'
  return 'info'
}

function isAdminActionSelected(action) {
  return selectedAdminActionKey.value === action
}

function isAnyValidationActionLoading() {
  return Boolean(activeValidationActionKey.value || activeRequirementActionKey.value)
}

async function handleCorporateAdminAction(action) {
  if (!selectedProvider.value) return

  selectedAdminActionKey.value = action

  if (action === 'validate') {
    await validateSelectedProvider()
    return
  }

  if (action === 'request_changes') {
    await requestChangesSelectedProvider()
    return
  }

  if (action === 'reject') {
    await rejectSelectedProvider()
    return
  }

  if (action === 'aircraft') {
    await openProviderAircraft(selectedProvider.value)
    return
  }

  if (action === 'close') {
    closeProviderDetail()
  }
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

  return rawDocuments.map((item, index) => {
    const metadata = normalizeAdminProviderDocument(item, index)
    const rawUrl =
      item.download_url ||
      item.downloadUrl ||
      item.url ||
      item.file_url ||
      item.fileUrl ||
      item.path ||
      item.storage_path ||
      ''

    return {
      ...item,
      ...metadata,
      id: item.id || index + 1,
      name:
        item.original_name || item.document_name || item.name || item.file_name || `Documento ${index + 1}`,
      fileName: item.file_name || item.filename || '',
      mimeType: item.mime_type || item.mime || item.content_type || '',
      size: Number(item.size || item.file_size || 0),
      status: item.status || item.state || item.validation_status || item.review_status || 'Pendiente',
      createdAt: item.created_at || item.uploaded_at || item.updated_at || '',
      url: item.url || rawUrl || '',
      downloadUrl: item.download_url || item.downloadUrl || rawUrl || '',
      notes: item.notes || item.observation || item.observacion || item.admin_notes || '',
    }
  })
}

function formatDocumentSize(size) {
  const value = Number(size || 0)
  if (!Number.isFinite(value) || value <= 0) return 'Tamano no disponible'
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${value} B`
}

function formatDocumentDate(value) {
  if (!value) return 'Fecha no disponible'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function documentStatusLabel(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized.includes('aprob')) return 'Aprobado'
  if (normalized.includes('rech')) return 'Rechazado'
  if (normalized.includes('pend') || normalized.includes('review') || normalized.includes('revision')) {
    return 'Pendiente'
  }
  return value || 'Pendiente'
}

function documentStatusTone(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized.includes('aprob')) return 'success'
  if (normalized.includes('rech')) return 'danger'
  return 'warning'
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

const selectedProviderReview = computed(() =>
  selectedProvider.value ? buildProviderReviewFlow(selectedProvider.value, selectedProviderMetrics.value) : null,
)

const selectedProviderDocuments = computed(() =>
  selectedProvider.value ? providerDocuments(selectedProvider.value) : [],
)

const selectedProviderHeader = computed(() => {
  if (!selectedProvider.value || !selectedProviderReview.value) return null

  return {
    companyName: selectedProviderReview.value.companyName,
    representative: selectedProviderReview.value.representative,
    base: selectedProviderReview.value.base,
    email: selectedProvider.value.company_email || selectedProvider.value.email || 'Sin correo registrado',
    phone: selectedProvider.value.company_phone || selectedProvider.value.phone || 'Sin telefono registrado',
    rfc: selectedProvider.value.rfc || 'Sin RFC',
    legalName:
      selectedProvider.value.legal_name ||
      selectedProvider.value.razon_social ||
      selectedProvider.value.company_name ||
      'Sin razon social registrada',
    statusMeta: selectedProviderReview.value.statusMeta,
  }
})

function closeProviderDetail() {
  selectedProvider.value = null
  selectedProviderActivity.value = []
}

function mergeProviderDetailIntoSelection(baseProvider = {}, detailRecord = {}) {
  const detailDocuments = providerDocuments(detailRecord)
  const baseDocuments = providerDocuments(baseProvider)

  return {
    ...baseProvider,
    ...detailRecord,
    user:
      detailRecord.user && typeof detailRecord.user === 'object'
        ? { ...(baseProvider.user || {}), ...detailRecord.user }
        : baseProvider.user,
    profile:
      detailRecord.profile && typeof detailRecord.profile === 'object'
        ? { ...(baseProvider.profile || {}), ...detailRecord.profile }
        : baseProvider.profile,
    company:
      detailRecord.company && typeof detailRecord.company === 'object'
        ? { ...(baseProvider.company || {}), ...detailRecord.company }
        : baseProvider.company,
    empresa:
      detailRecord.empresa && typeof detailRecord.empresa === 'object'
        ? { ...(baseProvider.empresa || {}), ...detailRecord.empresa }
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

async function loadProviderDetail(provider = {}) {
  const providerId = provider?.id || provider?.provider_id
  if (!providerId) return provider

  try {
    loadingProviderDetail.value = true
    const response = await requestWithCandidates([
      { method: 'get', path: `/admin/providers/${providerId}` },
      { method: 'get', path: `/admin/providers/${providerId}/detail` },
      { method: 'get', path: `/admin/providers/${providerId}/documents` },
      { method: 'get', path: `/admin/proveedores/${providerId}` },
      { method: 'get', path: `/admin/proveedores/${providerId}/detalle` },
      { method: 'get', path: `/admin/proveedores/${providerId}/documentos` },
      { method: 'get', path: `/admin/operators/${providerId}` },
      { method: 'get', path: `/admin/operators/${providerId}/documents` },
    ])

    const detailRecord = pickRecord(response, [
      'provider',
      'proveedor',
      'company',
      'empresa',
      'operator',
      'data',
    ])

    if (detailRecord && typeof detailRecord === 'object') {
      return mergeProviderDetailIntoSelection(provider, detailRecord)
    }
  } catch (error) {
    console.warn?.('[admin-provider-detail] no se pudo cargar detalle fresco', {
      providerId,
      message: error?.message || '',
    })
  } finally {
    loadingProviderDetail.value = false
  }

  return provider
}

async function openProviderDetail(provider) {
  selectedProvider.value = provider
  const [enrichedProvider] = await Promise.all([
    loadProviderDetail(provider),
    loadSelectedProviderActivity(provider?.id || provider?.provider_id),
  ])
  if (selectedProvider.value?.id === provider?.id) {
    selectedProvider.value = enrichedProvider
  }
}

function documentActionKey(providerId, documentId, action) {
  return `${providerId || 'provider'}:${documentId || 'document'}:${action}`
}

function isDocumentActionLoading(providerId, documentId, action) {
  return activeDocumentActionKey.value === documentActionKey(providerId, documentId, action)
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

async function loadSelectedProviderActivity(providerId) {
  if (!providerId) {
    selectedProviderActivity.value = []
    return
  }

  try {
    loadingSelectedProviderActivity.value = true
    const response = await requestWithCandidates([
      { method: 'get', path: `/admin/providers/${providerId}/activity` },
      { method: 'get', path: `/admin/proveedores/${providerId}/actividad` },
    ])

    selectedProviderActivity.value = Array.isArray(response?.data)
      ? response.data
      : Array.isArray(response?.activity)
        ? response.activity
        : []
  } catch (error) {
    selectedProviderActivity.value = []
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo cargar la actividad',
      message: error?.message || 'No se pudo cargar el registro del expediente.',
    })
  } finally {
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

async function previewProviderDocument(provider, documentRecord) {
  const providerId = provider?.id || provider?.provider_id
  const documentId = documentRecord?.id
  const directUrl = documentRecord?.url || documentRecord?.downloadUrl

  if (directUrl && typeof window !== 'undefined') {
    window.open(directUrl, '_blank', 'noopener,noreferrer')
    return
  }

  try {
    activeDocumentActionKey.value = documentActionKey(providerId, documentId, 'preview')
    const response = await requestWithCandidates([
      { method: 'download', path: `/admin/providers/${providerId}/documents/${documentId}/download` },
      { method: 'download', path: `/admin/proveedores/${providerId}/documentos/${documentId}/download` },
      { method: 'download', path: `/admin/company-documents/${documentId}/download` },
    ])
    const url = URL.createObjectURL(response.blob)
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer')
      window.setTimeout(() => URL.revokeObjectURL(url), 60000)
    }
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo abrir el documento',
      message: error?.message || 'El backend no devolvio el archivo solicitado.',
    })
  } finally {
    activeDocumentActionKey.value = ''
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

async function updateProviderDocumentStatus(provider, documentRecord, status, notes = '') {
  const providerId = provider?.id || provider?.provider_id
  const documentId = documentRecord?.id

  try {
    activeDocumentActionKey.value = documentActionKey(providerId, documentId, status)
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
      tone: status === 'approved' ? 'success' : 'warning',
      title: status === 'approved' ? 'Documento aprobado' : 'Documento rechazado',
      message:
        status === 'approved'
          ? `${updatedDocument.name} ya quedo validado para el operador.`
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
  await updateProviderDocumentStatus(provider, documentRecord, 'approved')
}

async function rejectProviderDocument(provider, documentRecord) {
  if (typeof window === 'undefined') return
  const note = window.prompt('Observacion para rechazar el documento', documentRecord?.notes || '')
  if (note == null) return
  await updateProviderDocumentStatus(provider, documentRecord, 'rejected', note)
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

  if (!selectedProviderReview.value.canValidate) {
    ui.pushToast({
      tone: 'warning',
      title: 'No se puede validar todavia',
      message: selectedProviderReview.value.missingValidationItems.map((item) => item.message).join(' '),
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
                <div class="provider-detail-progress">
                  <strong>{{ selectedProviderReview.progress.percent }}%</strong>
                  <span>Readiness</span>
                </div>
              </div>

              <div class="provider-detail-checklist">
                <article
                  v-for="step in selectedProviderReview.checklist"
                  :key="step.id"
                  :class="['provider-check-item', step.complete ? 'is-complete' : step.pending ? 'is-pending' : 'is-idle']"
                >
                  <strong>{{ step.complete ? 'OK' : step.pending ? 'Pend' : 'Info' }}</strong>
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
            <div class="provider-detail-panel-head">
              <span class="eyebrow">Identidad corporativa</span>
              <strong>{{ selectedProviderHeader.statusMeta.headline }}</strong>
            </div>
            <div class="provider-data-grid">
              <article class="provider-data-card">
                <span>Razon social</span>
                <strong>{{ selectedProviderHeader.legalName }}</strong>
              </article>
              <article class="provider-data-card">
                <span>RFC</span>
                <strong>{{ selectedProviderHeader.rfc }}</strong>
              </article>
              <article class="provider-data-card">
                <span>Nombre comercial</span>
                <strong>{{ selectedProviderHeader.companyName }}</strong>
              </article>
              <article class="provider-data-card">
                <span>Base operativa</span>
                <strong>{{ selectedProviderHeader.base }}</strong>
              </article>
            </div>
          </section>

          <section class="provider-detail-panel">
            <div class="provider-detail-panel-head">
              <span class="eyebrow">Representante legal</span>
              <strong>Contacto principal para validacion</strong>
            </div>
            <div class="provider-data-grid">
              <article class="provider-data-card">
                <span>Nombre completo</span>
                <strong>{{ selectedProviderHeader.representative }}</strong>
              </article>
              <article class="provider-data-card">
                <span>Telefono</span>
                <strong>{{ selectedProviderHeader.phone }}</strong>
              </article>
              <article class="provider-data-card provider-data-card-wide">
                <span>Email</span>
                <strong>{{ selectedProviderHeader.email }}</strong>
              </article>
            </div>
          </section>

          <section class="provider-detail-panel">
            <div class="provider-detail-panel-head">
              <span class="eyebrow">Documentacion legal del operador</span>
              <strong>Revision, descarga y dictamen documental</strong>
            </div>

            <p v-if="loadingProviderDetail" class="provider-documents-loading">
              Cargando expediente documental del proveedor...
            </p>

            <div v-else-if="selectedProviderDocuments.length" class="provider-documents-list">
              <article
                v-for="documentRecord in selectedProviderDocuments"
                :key="documentRecord.id"
                class="provider-document-card"
              >
                <div class="provider-document-head">
                  <div class="provider-document-head__copy">
                    <strong>{{ documentRecord.definitionLabel }}</strong>
                    <p class="muted">{{ documentRecord.sectionLabel }}</p>
                    <p class="muted provider-document-summary">
                      {{ documentRecord.name }} ·
                      {{ documentRecord.mimeType || 'Tipo no disponible' }} ·
                      {{ formatDocumentSize(documentRecord.size) }}
                    </p>
                  </div>
                  <span :class="['status-pill', `status-pill-${documentStatusTone(documentRecord.status)}`]">
                    {{ documentStatusLabel(documentRecord.status) }}
                  </span>
                </div>

                <div class="provider-document-meta">
                  <article class="provider-document-meta-item">
                    <span>Archivo</span>
                    <strong>{{ documentRecord.fileName || 'Sin file_name' }}</strong>
                  </article>
                  <article class="provider-document-meta-item">
                    <span>Clave</span>
                    <strong>{{ documentRecord.definitionKey || 'Sin clave' }}</strong>
                  </article>
                  <article class="provider-document-meta-item">
                    <span>Fecha de carga</span>
                    <strong>{{ formatDocumentDate(documentRecord.createdAt) }}</strong>
                  </article>
                </div>

                <div v-if="documentRecord.fieldMap.length" class="provider-document-columns">
                  <span
                    v-for="field in documentRecord.fieldMap"
                    :key="`${documentRecord.id}-${field.column}`"
                    class="provider-document-column-pill"
                  >
                    {{ field.column }}: {{ field.value }}
                  </span>
                </div>

                <p v-if="documentRecord.notes" class="muted">Observacion: {{ documentRecord.notes }}</p>

                <div class="provider-document-actions">
                  <button
                    type="button"
                    class="provider-link provider-link-secondary"
                    :disabled="isDocumentActionLoading(selectedProvider.id, documentRecord.id, 'preview')"
                    @click="previewProviderDocument(selectedProvider, documentRecord)"
                  >
                    Ver documento
                  </button>
                  <button
                    type="button"
                    class="provider-link provider-link-secondary"
                    :disabled="isDocumentActionLoading(selectedProvider.id, documentRecord.id, 'download')"
                    @click="downloadProviderDocument(selectedProvider, documentRecord)"
                  >
                    Descargar
                  </button>
                  <button
                    type="button"
                    class="provider-link"
                    :disabled="isDocumentActionLoading(selectedProvider.id, documentRecord.id, 'approved')"
                    @click="approveProviderDocument(selectedProvider, documentRecord)"
                  >
                    Aprobar documento
                  </button>
                  <button
                    type="button"
                    class="provider-link provider-link-danger"
                    :disabled="isDocumentActionLoading(selectedProvider.id, documentRecord.id, 'rejected')"
                    @click="rejectProviderDocument(selectedProvider, documentRecord)"
                  >
                    Rechazar documento
                  </button>
                </div>
              </article>
            </div>

            <p v-else class="empty-state provider-documents-empty">Sin documentos cargados</p>
          </section>
        </div>

        <aside class="provider-detail-sidebar">
          <section class="provider-detail-panel provider-detail-summary">
            <div class="provider-detail-panel-head">
              <span class="eyebrow">Resumen de validacion</span>
              <strong>{{ selectedProviderHeader.statusMeta.headline }}</strong>
            </div>

            <div class="provider-summary-list">
              <article
                v-for="item in selectedProviderReview.summary"
                :key="item.label"
                :class="['provider-summary-row', `tone-${item.tone || 'default'}`]"
              >
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </article>
            </div>
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
        selectedProviderReview.canValidate ? 'is-ready' : 'is-blocked'
      ]"
    >
      {{ selectedProviderReview.canValidate ? 'Listo para validar' : 'Bloqueado por requisitos' }}
    </span>
  </div>

  <div
    v-if="!selectedProviderReview.canValidate"
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
        v-for="item in selectedProviderReview.validationRequirements"
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
            :disabled="isRequirementBusy(selectedProvider.id || selectedProvider.provider_id, item.key) || !item.complete"
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
            :disabled="isRequirementBusy(selectedProvider.id || selectedProvider.provider_id, item.key)"
            @click="updateRequirementDecision(item, 'reject')"
          >
            {{ isRequirementActionLoading(selectedProvider.id || selectedProvider.provider_id, item.key, 'reject') ? 'Guardando...' : 'Cancelar' }}
          </button>
        </div>
      </article>
    </div>
  </section>

  <div class="admin-action-grid">
    <button
      type="button"
      :class="[
        'admin-action-card',
        'admin-action-primary',
        {
          'is-selected': isAdminActionSelected('validate'),
          'is-disabled': !selectedProviderReview.canValidate,
          'is-loading': isValidationActionLoading(selectedProvider.id, 'validate')
        }
      ]"
      :aria-disabled="!selectedProviderReview.canValidate || isAnyValidationActionLoading()"
      @click="handleCorporateAdminAction('validate')"
    >
      <span class="admin-action-icon">✓</span>
      <span class="admin-action-copy">
        <strong>
          {{ isValidationActionLoading(selectedProvider.id, 'validate') ? 'Validando operador...' : 'Validar operador' }}
        </strong>
        <small v-if="selectedProviderReview.canValidate">
          Aprueba formalmente al operador y habilita su acceso a la plataforma.
        </small>
        <small v-else>
          Bloqueado hasta completar los requisitos obligatorios.
        </small>
      </span>
      <span v-if="isAdminActionSelected('validate')" class="admin-action-selected">
        Seleccionado
      </span>
    </button>

    <button
      type="button"
      :class="[
        'admin-action-card',
        'admin-action-warning',
        {
          'is-selected': isAdminActionSelected('request_changes'),
          'is-loading': isValidationActionLoading(selectedProvider.id, 'request_changes')
        }
      ]"
      :disabled="isAnyValidationActionLoading()"
      @click="handleCorporateAdminAction('request_changes')"
    >
      <span class="admin-action-icon">!</span>
      <span class="admin-action-copy">
        <strong>
          {{ isValidationActionLoading(selectedProvider.id, 'request_changes') ? 'Registrando cambios...' : 'Solicitar cambios' }}
        </strong>
        <small>
          Envía observaciones formales al operador para corregir información pendiente.
        </small>
      </span>
      <span v-if="isAdminActionSelected('request_changes')" class="admin-action-selected">
        Seleccionado
      </span>
    </button>

    <button
      type="button"
      :class="[
        'admin-action-card',
        'admin-action-danger',
        {
          'is-selected': isAdminActionSelected('reject'),
          'is-loading': isValidationActionLoading(selectedProvider.id, 'reject')
        }
      ]"
      :disabled="isAnyValidationActionLoading()"
      @click="handleCorporateAdminAction('reject')"
    >
      <span class="admin-action-icon">×</span>
      <span class="admin-action-copy">
        <strong>
          {{ isValidationActionLoading(selectedProvider.id, 'reject') ? 'Cancelando validación...' : 'Cancelar validación' }}
        </strong>
        <small>
          Rechaza o cancela el proceso de validación administrativa del operador.
        </small>
      </span>
      <span v-if="isAdminActionSelected('reject')" class="admin-action-selected">
        Seleccionado
      </span>
    </button>

    <button
      type="button"
      :class="[
        'admin-action-card',
        'admin-action-neutral',
        { 'is-selected': isAdminActionSelected('aircraft') }
      ]"
      :disabled="isAnyValidationActionLoading()"
      @click="handleCorporateAdminAction('aircraft')"
    >
      <span class="admin-action-icon">✈</span>
      <span class="admin-action-copy">
        <strong>Revisar aeronaves</strong>
        <small>
          Abre el módulo de revisión de aeronaves registradas por este operador.
        </small>
      </span>
      <span v-if="isAdminActionSelected('aircraft')" class="admin-action-selected">
        Seleccionado
      </span>
    </button>

    <button
      type="button"
      :class="[
        'admin-action-card',
        'admin-action-secondary',
        { 'is-selected': isAdminActionSelected('close') }
      ]"
      :disabled="isAnyValidationActionLoading()"
      @click="handleCorporateAdminAction('close')"
    >
      <span class="admin-action-icon">↗</span>
      <span class="admin-action-copy">
        <strong>Continuar después</strong>
        <small>
          Cierra la revisión sin modificar el estado administrativo del operador.
        </small>
      </span>
      <span v-if="isAdminActionSelected('close')" class="admin-action-selected">
        Seleccionado
      </span>
    </button>
  </div>
</section>

          <section class="provider-detail-panel provider-activity-panel">
            <div class="provider-detail-panel-head">
              <span class="eyebrow">Actividad del proveedor</span>
              <strong>Registro del expediente</strong>
            </div>

            <div class="provider-activity-list">
              <p v-if="loadingSelectedProviderActivity" class="provider-activity-empty">
                Cargando actividad del expediente...
              </p>

              <article
                v-for="entry in selectedProviderActivity"
                :key="entry.id"
                :class="[
                  'provider-activity-item',
                  `tone-${resolveActivityTone(entry.event_type)}`
                ]"
              >
                <span class="activity-dot"></span>
                <div>
                  <strong>{{ entry.title }}</strong>
                  <p>{{ entry.description }}</p>
                  <p v-if="entry.metadata?.document_slot || entry.metadata?.document_definition_label" class="muted">
                    {{ entry.metadata?.document_definition_label || 'Documento' }}
                    <span v-if="entry.metadata?.document_section_label"> · {{ entry.metadata.document_section_label }}</span>
                  </p>
                  <small>{{ formatDateTime(entry.created_at) }} · {{ entry.actor_name || 'Proveedor' }}</small>
                </div>
              </article>

              <p v-if="!loadingSelectedProviderActivity && !selectedProviderActivity.length" class="provider-activity-empty">
                Todavía no hay actividad registrada para este expediente.
              </p>
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
    </section>
  </section>
</template>

<style scoped>
/*------------------------------------------------------------------------------------------------------------------------------*/
.providers-page {
  --providers-ink: #17324a;
  --providers-ink-soft: #60758b;
  --providers-line: rgba(95, 122, 149, 0.22);
  --providers-warm-line: rgba(185, 147, 87, 0.2);
  --providers-surface: linear-gradient(180deg, rgba(252, 250, 245, 0.98), rgba(242, 238, 230, 0.96));
  --providers-panel: linear-gradient(145deg, #1b3448 0%, #243f55 52%, #305168 100%);
  --providers-panel-soft: linear-gradient(180deg, rgba(30, 53, 72, 0.96), rgba(23, 42, 58, 0.98));
  --providers-shadow: 0 24px 56px rgba(18, 37, 55, 0.14);
  --providers-accent: #d7a64d;
  --providers-accent-soft: #f9edd2;
  --providers-success: #2f8f68;
  --providers-success-soft: #dff5ea;
  --providers-warning: #c68620;
  --providers-warning-soft: #fdf0d5;
  --providers-danger: #cf665b;
  --providers-danger-soft: #fde5e1;
  --providers-info: #4f87b1;
  --providers-info-soft: #dfedf8;
  display: grid;
  gap: 1.25rem;
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
  border-radius: 1.6rem;
  border: 1px solid rgba(114, 145, 174, 0.18);
  background:
    radial-gradient(circle at top right, rgba(227, 179, 91, 0.18), transparent 26%),
    radial-gradient(circle at bottom left, rgba(113, 194, 205, 0.12), transparent 22%),
    var(--providers-panel);
  box-shadow: var(--providers-shadow);
}

.page-head-copy {
  max-width: 44rem;
}

.page-head :deep(.eyebrow) {
  color: var(--providers-accent);
}

.page-head :deep(.muted),
.empty-state :deep(.muted) {
  color: rgba(236, 242, 247, 0.8);
}

.page-head h3 {
  color: #ffffff;
  font-size: clamp(1.5rem, 2vw, 2rem);
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
}

.kpi-card {
  border: 1px solid var(--providers-warm-line);
  border-radius: 1.4rem;
  background:
    radial-gradient(circle at top right, rgba(227, 179, 91, 0.08), transparent 30%),
    var(--providers-surface);
  box-shadow: 0 16px 36px rgba(36, 58, 84, 0.08);
}

.kpi-card strong {
  color: var(--providers-ink);
  font-size: 2.5rem;
  line-height: 0.95;
}

.kpi-card span {
  color: #7d6b55;
  font-size: 0.82rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.tone-success {
  border-color: rgba(47, 163, 107, 0.24);
  background:
    radial-gradient(circle at top right, rgba(47, 163, 107, 0.1), transparent 30%),
    var(--providers-surface);
}

.tone-warning {
  border-color: rgba(207, 138, 28, 0.26);
  background:
    radial-gradient(circle at top right, rgba(207, 138, 28, 0.1), transparent 30%),
    var(--providers-surface);
}

.tone-info {
  border-color: rgba(70, 137, 181, 0.24);
  background:
    radial-gradient(circle at top right, rgba(70, 137, 181, 0.1), transparent 30%),
    var(--providers-surface);
}

.filters-shell {
  border-radius: 1.4rem;
  border: 1px solid rgba(223, 212, 194, 0.65);
  background: linear-gradient(180deg, #fffdf9 0%, #fbf7ef 100%);
  box-shadow: 0 14px 30px rgba(36, 58, 84, 0.08);
}

.search-field span {
  color: #7d6b55;
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.search-field input {
  width: 100%;
  min-height: 3.6rem;
  border: 1px solid rgba(191, 166, 126, 0.28);
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
  border: 1px solid rgba(121, 153, 181, 0.18);
  border-radius: 1.5rem;
  background:
    radial-gradient(circle at top right, rgba(227, 179, 91, 0.14), transparent 24%),
    radial-gradient(circle at bottom left, rgba(113, 194, 205, 0.12), transparent 24%),
    var(--providers-panel-soft);
  color: #ffffff;
  box-shadow: 0 22px 44px rgba(20, 44, 67, 0.16);
  padding: 1.3rem;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.provider-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 24px 48px rgba(20, 44, 67, 0.22);
  border-color: rgba(171, 203, 227, 0.3);
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
  color: #ffffff;
  font-size: 1.12rem;
  font-weight: 800;
}

.provider-id {
  color: rgba(224, 234, 242, 0.62);
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
  color: rgba(229, 238, 245, 0.76);
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
  border: 1px solid rgba(183, 208, 227, 0.12);
  border-radius: 1rem;
  background: rgba(244, 249, 252, 0.06);
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
  border-top: 1px solid rgba(183, 208, 227, 0.12);
  padding-top: 0.65rem;
}

.provider-meta-row strong {
  color: #ffffff;
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
  border: 1px solid rgba(114, 145, 174, 0.18);
  background:
    radial-gradient(circle at top right, rgba(227, 179, 91, 0.12), transparent 28%),
    var(--providers-panel);
  color: #ffffff;
  box-shadow: var(--providers-shadow);
  padding: 0.95rem 1rem;
}

.provider-detail-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(12, 24, 37, 0.45);
  backdrop-filter: blur(4px);
  z-index: 30;
}

.provider-detail-modal {
  position: fixed;
  inset: 1.5rem;
  width: auto;
  overflow: hidden;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border: 1px solid rgba(126, 151, 176, 0.18);
  border-radius: 1.8rem;
  background:
    radial-gradient(circle at top right, rgba(215, 166, 77, 0.12), transparent 24%),
    radial-gradient(circle at top left, rgba(92, 142, 176, 0.08), transparent 28%),
    linear-gradient(180deg, rgba(253, 251, 246, 0.99), rgba(240, 236, 228, 0.99));
  box-shadow: 0 30px 70px rgba(20, 44, 67, 0.24);
  z-index: 31;
  padding: 1rem 1rem 0.95rem;
}

.provider-detail-head,
.provider-detail-grid {
  display: grid;
  gap: 0.8rem;
}

.provider-detail-head {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  margin-bottom: 0.8rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid rgba(132, 154, 176, 0.14);
}

.provider-detail-head-actions {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.provider-detail-head h4 {
  margin: 0.18rem 0 0;
  color: var(--providers-ink);
  font-size: 1.28rem;
}

.provider-detail-close {
  border: 1px solid rgba(137, 161, 187, 0.24);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
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
  grid-template-columns: minmax(0, 1.7fr) minmax(20rem, 0.95fr);
  gap: 0.85rem;
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

.provider-detail-panel,
.provider-detail-hero-card {
  border: 1px solid rgba(132, 154, 176, 0.14);
  border-radius: 1.1rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(247, 246, 242, 0.76));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65);
  padding: 0.82rem 0.88rem;
}

.provider-detail-hero {
  grid-template-columns: minmax(0, 1.25fr) minmax(14rem, 0.75fr);
  gap: 0.75rem;
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
  font-size: clamp(1.45rem, 2.5vw, 2.1rem);
  line-height: 0.95;
  letter-spacing: -0.04em;
}

.provider-detail-subtitle {
  margin: 0.28rem 0 0;
  color: var(--providers-ink-soft);
  font-size: 0.88rem;
}

.provider-detail-progress {
  min-width: 5.7rem;
  border-radius: 0.95rem;
  background:
    radial-gradient(circle at top, rgba(92, 142, 176, 0.18), transparent 44%),
    linear-gradient(180deg, #1d3a56 0%, #163047 100%);
  padding: 0.72rem 0.8rem;
  color: #ffffff;
  text-align: center;
  box-shadow: 0 12px 22px rgba(20, 44, 67, 0.16);
}

.provider-detail-progress strong {
  display: block;
  font-size: 1.55rem;
  line-height: 1;
}

.provider-detail-progress span {
  color: rgba(234, 241, 246, 0.72);
  font-size: 0.7rem;
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
  gap: 0.55rem;
}

.provider-check-item {
  border: 1px solid rgba(128, 152, 177, 0.18);
  background: linear-gradient(180deg, rgba(243, 247, 251, 0.92), rgba(238, 243, 248, 0.88));
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

.provider-check-item.is-idle {
  border-color: rgba(135, 158, 181, 0.2);
  background: linear-gradient(180deg, rgba(240, 244, 248, 0.94), rgba(233, 239, 245, 0.9));
}

.provider-data-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
}

.provider-data-card {
  border: 1px solid rgba(132, 154, 176, 0.14);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(249, 250, 252, 0.88));
  min-height: 0;
}

.provider-document-card {
  border: 1px solid rgba(132, 154, 176, 0.14);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(244, 247, 251, 0.92));
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
  font-size: 0.94rem;
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
  min-height: 5.25rem;
  padding: 0.72rem 0.8rem;
  border: 1px solid rgba(132, 154, 176, 0.14);
  border-radius: 0.95rem;
  background:
    radial-gradient(circle at top right, rgba(92, 142, 176, 0.08), transparent 34%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.86), rgba(246, 248, 251, 0.84));
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
  border: 1px solid rgba(132, 154, 176, 0.16);
  border-radius: 0.85rem;
  background: rgba(255, 255, 255, 0.74);
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
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(249, 250, 252, 0.88));
  border-radius: 0.95rem;
  padding: 0.75rem 0.85rem;
  border: 1px solid rgba(132, 154, 176, 0.14);
  min-height: 0;
  font-size: 0.86rem;
}

.provider-summary-row,
.provider-alert-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border: 1px solid rgba(132, 154, 176, 0.12);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(248, 250, 252, 0.9));
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
  border: 1px solid rgba(23, 50, 74, 0.18);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(247, 248, 250, 0.96));
  box-shadow:
    0 18px 38px rgba(20, 44, 67, 0.08),
    inset 0 3px 0 rgba(215, 166, 77, 0.62);
}

.provider-admin-decision-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: start;
  margin-bottom: 0.8rem;
  border-bottom: 1px solid rgba(132, 154, 176, 0.16);
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
  border: 1px solid rgba(132, 154, 176, 0.14);
  border-radius: 1rem;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(247, 249, 251, 0.92));
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
  border: 1px solid rgba(132, 154, 176, 0.14);
  border-radius: 0.85rem;
  padding: 0.68rem 0.75rem;
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
  border: 1px solid rgba(23, 50, 74, 0.18);
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
  border: 1px solid rgba(132, 154, 176, 0.14);
  border-radius: 0.9rem;
  padding: 0.72rem 0.8rem;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(247, 249, 251, 0.92));
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
  background: linear-gradient(180deg, #d7a64d 0%, #f1c974 100%);
  box-shadow: 0 0 0 6px rgba(215, 166, 77, 0.14);
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
  border: 1px solid rgba(132, 154, 176, 0.18);
  border-radius: 0.95rem;
  background: #ffffff;
  padding: 0.72rem 0.78rem;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 12px 26px rgba(20, 44, 67, 0.06);
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease;
}

.admin-action-card:hover {
  transform: translateY(-2px);
  border-color: rgba(23, 50, 74, 0.3);
  box-shadow: 0 18px 34px rgba(20, 44, 67, 0.12);
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


-------------------------------------------------------------------------------
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
