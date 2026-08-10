<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { pickCollection, requestWithCandidates } from '../../lib/backendCrud'
import { resolveMediaUrl } from '../../lib/api'
import { getAircraftChecklist, updateAircraftChecklist } from '../../lib/adminAircraftChecklist'
import { useUiStore } from '../../stores/ui'
import {
  deduplicateAircraftDocuments,
  getAircraftDocumentId,
  getAircraftDocumentKey,
} from '../../utils/aircraftDocuments'
import {
  isAdminAircraftActive,
  isAdminAircraftApproved,
  normalizeAdminAircraftStatus,
  resolvePrimaryAdminAircraftAction,
} from '../../utils/adminAircraftStatus'

const props = defineProps({
  aircraft: { type: Array, required: true },
  subscriptions: { type: Array, required: true },
  mode: { type: String, default: 'aircraft' },
  aircraftLoading: { type: Boolean, default: false },
  documentsLoading: { type: Boolean, default: false },
  subscriptionsLoading: { type: Boolean, default: false },
  paymentsLoading: { type: Boolean, default: false },
  activatingAircraftId: { type: Number, default: null },
  activationRefreshVersion: { type: Number, default: 0 },
  sectionErrors: {
    type: Object,
    default: () => ({
      aircraft: '',
      documents: '',
      subscriptions: '',
      payments: '',
    }),
  },
})

const route = useRoute()
const router = useRouter()
const ui = useUiStore()
const emit = defineEmits([
  'approve-provider',
  'approve-aircraft',
  'activate-aircraft',
  'deactivate-aircraft',
  'reject-aircraft',
  'suspend-aircraft',
  'approve-aircraft-document',
  'reject-aircraft-document',
])

const companyFilter = ref('Todas')
const approvalFilter = ref('Todas')
const documentsFilter = ref('Todos')
const searchTerm = ref('')
const sortMode = ref('recent')
const showAdvancedFilters = ref(false)
const openActionMenuId = ref(null)
const selectedAircraft = ref(null)
const detailTab = ref('general')
const downloadingDocumentId = ref('')
const documentDownloadError = ref('')
const previewDocument = ref(null)
const expandedCompanyGroups = ref([])

const approvalOptions = ['Todas', 'Aprobadas', 'Pendientes', 'Suspendidas']
const documentOptions = ['Todos', 'Validos', 'Pendientes', 'Incompletos', 'Rechazados', 'Vencidos']
const sortOptions = [
  { label: 'Mas recientes', value: 'recent' },
  { label: 'Nombre A-Z', value: 'az' },
  { label: 'Aprobadas primero', value: 'approved' },
]
const CHECKLIST_ALLOWED_STATES = ['pending', 'approved', 'rejected', 'missing']
const CHECKLIST_STATE_META = {
  approved: { label: 'Aprobado', tone: 'success', icon: '✓' },
  pending: { label: 'Pendiente', tone: 'warning', icon: '!' },
  rejected: { label: 'Rechazado', tone: 'danger', icon: '×' },
  missing: { label: 'Faltante', tone: 'neutral', icon: '•' },
}
const checklistLoading = ref(false)
const checklistSaving = ref(false)
const checklistError = ref('')
const checklistLoadedAircraftId = ref(0)
const checklistDirty = ref(false)
const checklistUnsupported = ref(false)
const checklistDraft = reactive({})

function providerName(item) {
  return (
    item.provider_display_name ||
    item.provider?.display_name ||
    item.provider?.commercial_name ||
    item.provider?.user?.profile?.company_name ||
    item.provider?.company_name ||
    item.provider_name ||
    'Proveedor sin ligar'
  )
}

function providerIdValue(item = {}) {
  const normalized = Number(
    item.provider_id ||
      item.proveedor_id ||
      item.provider?.id ||
      item.provider?.provider_id ||
      item.provider?.provider_id ||
      0,
  )

  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0
}

function routeProviderIdValue() {
  const normalized = Number(route.query.providerId || 0)
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0
}

function aircraftName(item) {
  return item.model || item.name || item.registration || 'Aeronave'
}

function baseLabel(item) {
  return item.base_airport || item.base || item.airport || item.location || 'Base pendiente'
}

function normalizeMediaUrl(url = '') {
  return resolveMediaUrl(url)
}

function getPrimaryImageValue(raw = {}) {
  if (typeof raw === 'string') return raw
  return (
    raw.main_image ||
    raw.mainImage ||
    raw.image_url ||
    raw.imageUrl ||
    raw.image ||
    raw.image_path ||
    raw.imagePath ||
    raw.photo ||
    raw.photo_url ||
    raw.photoUrl ||
    raw.cover_image ||
    raw.coverImage ||
    raw.cover_photo ||
    raw.coverPhoto ||
    raw.thumbnail ||
    raw.thumbnail_url ||
    raw.thumbnailUrl ||
    raw.exterior_image ||
    raw.exteriorImage ||
    raw.interior_image ||
    raw.interiorImage ||
    ''
  )
}

function normalizeImageCollection(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'string') return [value]
  if (typeof value === 'object') return [value]
  return []
}

function aircraftImages(item = {}) {
  const images = [
    ...normalizeImageCollection(item.images),
    ...normalizeImageCollection(item.aircraft_images),
    ...normalizeImageCollection(item.aircraftImages),
    ...normalizeImageCollection(item.gallery_images),
    ...normalizeImageCollection(item.galleryImages),
    ...normalizeImageCollection(item.gallery),
    ...normalizeImageCollection(item.photos),
    ...normalizeImageCollection(item.media),
    ...normalizeImageCollection(item.multimedia),
    ...normalizeImageCollection(item.pictures),
    ...normalizeImageCollection(item.files),
  ]

  const normalizedImages = images
    .map((image, index) => {
      const imageRecord = typeof image === 'string' ? { url: image } : image || {}
      const imageUrl = normalizeMediaUrl(
        getPrimaryImageValue(imageRecord) ||
          imageRecord.url ||
          imageRecord.path ||
          imageRecord.file_url ||
          imageRecord.fileUrl ||
          imageRecord.public_url ||
          imageRecord.publicUrl ||
          imageRecord.src ||
          '',
      )
      if (!imageUrl) return null

      return {
        id: imageRecord.id || `image-${index}`,
        title: imageRecord.title || imageRecord.name || imageRecord.kind || `Imagen ${index + 1}`,
        kind: String(imageRecord.kind || imageRecord.slot || (index === 0 ? 'main' : 'gallery')).toLowerCase(),
        imageUrl,
      }
    })
    .filter(Boolean)

  const mainImage = normalizeMediaUrl(getPrimaryImageValue(item))
  if (mainImage && !normalizedImages.some((image) => image.imageUrl === mainImage)) {
    normalizedImages.unshift({
      id: 'main-image',
      title: 'Imagen principal',
      kind: 'main',
      imageUrl: mainImage,
    })
  }

  return normalizedImages
}

function primaryAircraftImage(item = {}) {
  const images = aircraftImages(item)
  return images.find((image) => image.kind === 'main')?.imageUrl || images[0]?.imageUrl || ''
}

function mediaFileExtension(url = '') {
  const cleanUrl = String(url || '').split('?')[0].split('#')[0]
  const extension = cleanUrl.includes('.') ? cleanUrl.slice(cleanUrl.lastIndexOf('.') + 1).toLowerCase() : ''
  return extension
}

function detectMediaKind(record = {}, url = '') {
  const token = compactToken(
    record.mime_type ||
      record.mimeType ||
      record.type ||
      record.kind ||
      record.category ||
      record.document_type ||
      record.title ||
      record.name ||
      '',
  )
  const extension = mediaFileExtension(url)

  if (token.includes('video') || ['mp4', 'mov', 'm4v', 'webm', 'avi'].includes(extension)) return 'video'
  if (token.includes('pdf') || extension === 'pdf') return 'pdf'
  return 'image'
}

function aircraftMediaAssets(item = {}) {
  const mixedMedia = [
    ...normalizeImageCollection(item.images),
    ...normalizeImageCollection(item.aircraft_images),
    ...normalizeImageCollection(item.aircraftImages),
    ...normalizeImageCollection(item.gallery_images),
    ...normalizeImageCollection(item.galleryImages),
    ...normalizeImageCollection(item.gallery),
    ...normalizeImageCollection(item.photos),
    ...normalizeImageCollection(item.media),
    ...normalizeImageCollection(item.multimedia),
    ...normalizeImageCollection(item.pictures),
    ...normalizeImageCollection(item.files),
  ]

  const normalizedMixedMedia = mixedMedia
    .map((entry, index) => {
      const record = typeof entry === 'string' ? { url: entry } : entry || {}
      const url = normalizeMediaUrl(
        getPrimaryImageValue(record) ||
          record.url ||
          record.path ||
          record.file_url ||
          record.fileUrl ||
          record.public_url ||
          record.publicUrl ||
          record.src ||
          '',
      )
      if (!url) return null

      const kind = detectMediaKind(record, url)

      return {
        id: record.id || `mixed-media-${index}`,
        title: record.title || record.name || record.kind || `Media ${index + 1}`,
        kind,
        url,
        thumbUrl: kind === 'image' ? url : '',
        meta: record,
      }
    })
    .filter(Boolean)

  const documentMedia = aircraftDocuments(item)
    .filter((document) => ['video', 'pdf'].includes(detectMediaKind(document, document.fileUrl)))
    .map((document) => ({
      id: `document-${document.id}`,
      title: document.name,
      kind: detectMediaKind(document, document.fileUrl),
      url: document.fileUrl,
      thumbUrl: '',
      meta: document,
    }))

  return [...new Map([...normalizedMixedMedia, ...documentMedia].map((entry) => [entry.id, entry])).values()]
}

function formatNumber(value, suffix = '') {
  const number = Number(value || 0)
  if (!number) return 'Pendiente'
  return `${new Intl.NumberFormat('es-MX').format(number)}${suffix}`
}

function formatMoney(value) {
  const number = Number(value || 0)
  if (!number) return 'Pendiente'
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(number)
}

function formatList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ') || 'Por completar'
  return value || 'Por completar'
}

function documentCompletion(item = {}) {
  const validation = resolveAircraftDocumentValidation(item)
  const backendTotal = Number(validation.totalRequired || 0)
  const backendCompleted = Number(validation.approved || 0)

  if (backendTotal > 0) {
    return {
      completed: backendCompleted,
      total: backendTotal,
      percent: Math.round((backendCompleted / backendTotal) * 100),
    }
  }

  const summary = documentSummaryItems(item)
  const completed = summary.filter((entry) => entry.complete).length
  const total = summary.length || 1

  return {
    completed,
    total,
    percent: Math.round((completed / total) * 100),
  }
}

function formatHours(value) {
  const amount = Number(value || 0)
  if (!amount) return 'Pendiente'
  return `${new Intl.NumberFormat('es-MX').format(amount)} hrs`
}

function compactToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_')
}

function aircraftImagesByToken(item = {}, token = '') {
  const normalizedToken = compactToken(token)
  return aircraftImages(item).filter((image) => {
    const candidate = compactToken(`${image.kind || ''} ${image.title || ''}`)
    return candidate.includes(normalizedToken)
  })
}

function hasExteriorPhotos(item = {}) {
  const exteriorImages = aircraftImagesByToken(item, 'exterior')
  if (exteriorImages.length) return true
  return aircraftImages(item).length > 0
}

function hasCrewConfigured(item = {}) {
  const candidates = [
    item.crew_count,
    item.crewCount,
    item.required_crew,
    item.minimum_crew,
    Array.isArray(item.crew) ? item.crew.length : 0,
  ]

  return candidates.some((value) => Number(value || 0) > 0)
}

function hasAvailabilityConfigured(item = {}) {
  const candidates = [
    item.availability_configured,
    item.availabilityConfigured,
    item.has_availability,
    item.calendar_enabled,
    item.schedule_enabled,
  ]

  const explicit = candidates.find((value) => value != null)
  if (explicit != null) return Boolean(explicit)

  return Boolean(item.availability || item.calendar || item.schedules)
}

function hasCruiseSpeedValue(item = {}) {
  return Number(
    item.cruise_speed ||
      item.cruiseSpeed ||
      item.cruise_speed_kts ||
      item.cruiseSpeedKts ||
      item.speed ||
      0,
  ) > 0
}

function hasModelYearValue(item = {}) {
  return Number(item.model_year || item.year || 0) > 0
}

function hasManufacturerValue(item = {}) {
  return hasTextValue(item.manufacturer || item.make || item.brand)
}

function hasModelValue(item = {}) {
  return hasTextValue(item.model || item.name)
}

function hasCurrencyValue(item = {}) {
  return hasTextValue(item.currency || item.pricing_currency || item.hourly_rate_currency)
}

function hasDomesticExpensesValue(item = {}) {
  return Number(
    item.national_expenses ||
      item.domestic_expenses ||
      item.expenses_national ||
      item.expenses_domestic ||
      0,
  ) > 0
}

function hasFixedFeeValue(item = {}) {
  return Number(item.fixed_fee || item.fee_fijo || item.global_fixed_fee || 0) > 0
}

function hasMarginValue(item = {}) {
  return Number(item.margin_percent || item.profit_percent || item.utility_percent || item.utilidad || 0) > 0
}

function hasAdminReviewedPrice(item = {}) {
  const pricingState = adminAircraftPricingState(item)
  const reviewedValue =
    pricingState.reviewed_by_admin ??
    pricingState.reviewed ??
    pricingState.admin_reviewed ??
    item.price_reviewed_by_admin ??
    item.pricing_reviewed

  return reviewedValue === true || compactToken(reviewedValue).includes('approved')
}

function normalizeChecklistState(value = '') {
  const normalized = compactToken(value)
  if (['approved', 'aprobado', 'aprobada'].includes(normalized)) return 'approved'
  if (['rejected', 'rechazado', 'rechazada', 'cancelled', 'canceled'].includes(normalized)) return 'rejected'
  if (['missing', 'faltante', 'faltantes'].includes(normalized)) return 'missing'
  return 'pending'
}

function checklistStateMeta(state = 'pending') {
  return CHECKLIST_STATE_META[normalizeChecklistState(state)] || CHECKLIST_STATE_META.pending
}

function normalizeChecklistBackendItems(payload = {}) {
  if (Array.isArray(payload?.data?.items)) return payload.data.items
  const collection = pickCollection(payload, ['items', 'checklist_items', 'checklist', 'data'])
  return Array.isArray(collection) ? collection : []
}

function checklistDraftRecord(itemId) {
  return checklistDraft[itemId] && typeof checklistDraft[itemId] === 'object'
    ? checklistDraft[itemId]
    : null
}

function documentSummaryItems(item = {}) {
  const validation = resolveAircraftDocumentValidation(item)
  const summary = validation.requirements.map((requirement) => ({
    label: requirement.label,
    complete: requirement.complete,
    status: requirement.status,
    detail: requirement.detail,
  }))

  summary.push({
    label: 'Fotografias',
    complete: aircraftImages(item).length > 0,
    status: aircraftImages(item).length > 0 ? 'approved' : 'missing',
    detail: aircraftImages(item).length ? `${aircraftImages(item).length} archivo(s)` : 'No cargado',
  })

  return summary
}

function normalizeDocumentCollection(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'object') return Object.values(value)
  return []
}

function aircraftDocuments(item = {}) {
  const primaryDocuments = normalizeDocumentCollection(item.documents)
  const fallbackDocuments = primaryDocuments.length
    ? []
    : [
        ...normalizeDocumentCollection(item.aircraft_documents),
        ...normalizeDocumentCollection(item.aircraftDocuments),
        ...normalizeDocumentCollection(item.documentos),
        ...normalizeDocumentCollection(item.files),
        ...normalizeDocumentCollection(item.attachments),
      ]

  return deduplicateAircraftDocuments([...primaryDocuments, ...fallbackDocuments])
    .map((document, index) => {
      const record = typeof document === 'string' ? { document_name: document } : document || {}
      const fileUrl = normalizeMediaUrl(
        record.file_url ||
          record.fileUrl ||
          record.document_url ||
          record.documentUrl ||
          record.url ||
          record.path ||
          record.file_path ||
          record.filePath ||
          '',
      )

      return {
        identityKey: getAircraftDocumentKey(record),
        id: getAircraftDocumentId(record) || record.uuid || `document-${index}`,
        aircraftId: record.aircraft_id || record.aircraftId || item.id || '',
        filename: record.file_name || record.filename || '',
        type: record.document_type || record.type || record.kind || 'documento',
        kind: record.kind || '',
        slot: record.slot || record.document_slot || '',
        category: record.document_category || record.category || '',
        document_type: record.document_type || '',
        document_category: record.document_category || '',
        requirement_key: record.requirement_key || record.requirementKey || '',
        requirement_code: record.requirement_code || record.requirementCode || '',
        name:
          record.document_name ||
          record.name ||
          record.file_name ||
          record.fileName ||
          record.title ||
          `Documento ${index + 1}`,
        status: record.status || record.state || record.validation_status || 'Pendiente',
        approval_status: record.approval_status || record.review_status || record.validation_status || '',
        expiresAt: record.expires_at || record.expiration_date || record.expirationDate || null,
        notes: record.notes || record.observations || record.observaciones || '',
        storagePath: record.storage_path || record.file_path || record.path || '',
        fileUrl,
      }
    })
    .filter((document) => document.name || document.fileUrl)
}

function documentTypeLabel(type = '') {
  const normalized = normalizeStatus(type)
  const labels = {
    insurance: 'Seguro',
    airworthiness: 'Aeronavegabilidad',
    maintenance: 'Mantenimiento',
    maintenance_sticker: 'Sticker mantenimiento',
    flight_logbook: 'Bitacora de vuelo',
    certificate: 'Certificado',
    registration: 'Registro',
    documento: 'Documento',
  }
  return labels[normalized] || type || 'Documento'
}

function previewMediaAsset(asset = {}) {
  if (!asset?.url) return
  if (previewDocument.value?.objectUrl) {
    URL.revokeObjectURL(previewDocument.value.objectUrl)
  }

  previewDocument.value = {
    url: asset.url,
    objectUrl: '',
    name: asset.title || 'Archivo',
    type: asset.kind || 'documento',
  }
}

function isPrivateStorageUrl(url = '') {
  return /amazonaws\.com|s3[.-]|red-aviation-images/i.test(String(url || ''))
}

function cleanDownloadError(error) {
  const status = Number(error?.status || 0)
  if (status === 404 || /Rutas probadas|could not be found|route .* could not be found/i.test(error?.message || '')) {
    return 'El backend todavia no tiene registrada la ruta para abrir documentos privados. Agrega la ruta de descarga autenticada en sistema y vuelve a intentar.'
  }

  if (status === 403) {
    return 'No tienes permisos para abrir este documento con la sesion actual.'
  }

  return (
    error?.message ||
    'El archivo esta privado en S3. Necesitas una ruta backend que entregue el documento autenticado o una URL firmada.'
  )
}

function showDocumentPreview(url, documentRecord) {
  if (previewDocument.value?.objectUrl) {
    URL.revokeObjectURL(previewDocument.value.objectUrl)
  }

  previewDocument.value = {
    url,
    objectUrl: url.startsWith('blob:') ? url : '',
    name: documentRecord.name || 'Documento',
    type: documentRecord.type || 'documento',
  }
}

function closeDocumentPreview() {
  if (previewDocument.value?.objectUrl) {
    URL.revokeObjectURL(previewDocument.value.objectUrl)
  }

  previewDocument.value = null
}

function triggerBrowserDownload(content, fileName, mimeType = 'text/plain;charset=utf-8') {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function exportAircraftCsv() {
  const headers = ['Matricula', 'Aeronave', 'Proveedor', 'Base', 'Estatus', 'Documentos', 'Pago']
  const rows = filteredAircraft.value.map((item) => [
    item.registration || '',
    aircraftName(item),
    providerName(item),
    baseLabel(item),
    statusChip(item).label,
    docsChip(item).label,
    billingChip(item).label,
  ])
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
    .join('\n')

  triggerBrowserDownload(csv, 'aeronaves-admin.csv', 'text/csv;charset=utf-8')
}

function downloadSelectedAircraftSummary() {
  if (!selectedAircraft.value) return

  const item = selectedAircraft.value
  const summary = [
    `Aeronave: ${aircraftName(item)}`,
    `Matricula: ${item.registration || 'Pendiente'}`,
    `Proveedor: ${providerName(item)}`,
    `Base: ${baseLabel(item)}`,
    `Estatus: ${statusChip(item).label}`,
    `Documentos: ${docsChip(item).label}`,
    `Pago: ${billingChip(item).label}`,
    `Tarifa: ${formatMoney(item.hourly_rate || item.hourlyPrice || item.price_per_hour)}`,
  ].join('\n')

  const safeName = String(item.registration || aircraftName(item) || 'aeronave')
    .replace(/\s+/g, '-')
    .toLowerCase()
  triggerBrowserDownload(summary, `${safeName}-resumen.txt`)
}

function previewBlob(blob, documentRecord) {
  const url = URL.createObjectURL(blob)
  showDocumentPreview(url, documentRecord)
}

async function openAircraftDocument(documentRecord) {
  documentDownloadError.value = ''
  downloadingDocumentId.value = documentRecord.id

  try {
    if (!isPrivateStorageUrl(documentRecord.fileUrl) && documentRecord.fileUrl) {
      showDocumentPreview(documentRecord.fileUrl, documentRecord)
      return
    }

    const aircraftId = documentRecord.aircraftId || selectedAircraft.value?.id
    const response = await requestWithCandidates([
      { method: 'download', path: `/admin/aircraft-documents/${documentRecord.id}/download` },
      { method: 'download', path: `/admin/aeronaves/documentos/${documentRecord.id}/descargar` },
      { method: 'download', path: `/operator/aircraft/${aircraftId}/documents/${documentRecord.id}/download` },
      { method: 'download', path: `/provider/aircraft/${aircraftId}/documents/${documentRecord.id}/download` },
      { method: 'download', path: `/proveedor/aeronaves/${aircraftId}/documentos/${documentRecord.id}/descargar` },
    ])

    previewBlob(response.blob, documentRecord)
  } catch (error) {
    documentDownloadError.value = cleanDownloadError(error)
  } finally {
    downloadingDocumentId.value = ''
  }
}

function normalizeStatus(value) {
  return normalizeAdminAircraftStatus(value)
}

function adminAircraftSnapshot(item = {}) {
  if (item?.admin_state_snapshot && typeof item.admin_state_snapshot === 'object') {
    return item.admin_state_snapshot
  }

  if (item?.aircraft_state && typeof item.aircraft_state === 'object') {
    return item.aircraft_state
  }

  return {}
}

function adminAircraftReviewState(item = {}) {
  const snapshot = adminAircraftSnapshot(item)
  return snapshot.review && typeof snapshot.review === 'object' ? snapshot.review : {}
}

function adminAircraftBillingState(item = {}) {
  const snapshot = adminAircraftSnapshot(item)
  if (snapshot.billing && typeof snapshot.billing === 'object') return snapshot.billing
  if (item?.billing_state && typeof item.billing_state === 'object') return item.billing_state
  return {}
}

function adminAircraftDocumentsState(item = {}) {
  const snapshot = adminAircraftSnapshot(item)
  return snapshot.documents && typeof snapshot.documents === 'object' ? snapshot.documents : {}
}

function adminAircraftOperationState(item = {}) {
  const snapshot = adminAircraftSnapshot(item)
  return snapshot.operation && typeof snapshot.operation === 'object' ? snapshot.operation : {}
}

function adminAircraftPricingState(item = {}) {
  const snapshot = adminAircraftSnapshot(item)
  return snapshot.pricing && typeof snapshot.pricing === 'object' ? snapshot.pricing : {}
}

function adminAircraftActivationState(item = {}) {
  const snapshot = adminAircraftSnapshot(item)
  return snapshot.activation && typeof snapshot.activation === 'object' ? snapshot.activation : {}
}

function normalizeMissingRequirement(value = '') {
  const normalized = normalizeStatus(value).trim().replace(/[\s-]+/g, '_')
  const aliases = {
    provider_not_approved: 'provider_not_approved',
    aircraft_not_approved: 'aircraft_not_approved',
    documents: 'documentacion',
    documents_pending: 'documentacion',
    documentation: 'documentacion',
    documents_required: 'documentacion',
    commercial_information_incomplete: 'tarifa',
    pricing: 'tarifa',
    hourly_rate: 'tarifa',
    minimum_hours: 'minimo',
    range_missing: 'rango',
    range: 'rango',
    range_nm: 'rango',
    range_km: 'rango',
    base_missing: 'base',
    base: 'base',
    base_registered: 'base',
    capacity_missing: 'capacidad',
    capacity: 'capacidad',
    capacity_configured: 'capacidad',
    registration: 'matricula',
    tail_number: 'matricula',
    photos: 'fotografias',
    images: 'fotografias',
    payment_pending: 'payment_pending',
  }

  return aliases[normalized] || normalized
}

function normalizeDocumentReviewStatus(value = '') {
  const status = normalizeStatus(value).trim()

  if (!status) return 'pending'
  if (['approved', 'aprobado', 'aprobada', 'valid', 'validado', 'validada', 'vigente', 'activo', 'active'].includes(status)) {
    return 'approved'
  }
  if (['rejected', 'rechazado', 'rechazada', 'cancelled', 'canceled', 'cancelado', 'cancelada'].includes(status)) {
    return 'rejected'
  }
  if (['expired', 'vencido', 'vencida'].includes(status) || status.includes('expir') || status.includes('venc')) {
    return 'expired'
  }
  if (
    [
      'pending',
      'pendiente',
      'pending review',
      'pending_review',
      'en revision',
      'en revisión',
      'under review',
    ].includes(status)
  ) {
    return 'pending'
  }

  return 'pending'
}

function documentStatusMeta(document = {}) {
  const normalizedStatus = normalizeDocumentReviewStatus(
    document.status || document.approval_status || document.review_status || document.validation_status,
  )

  if (normalizedStatus === 'approved') {
    return { key: 'approved', label: 'Aprobado', tone: 'success' }
  }
  if (normalizedStatus === 'rejected') {
    return { key: 'rejected', label: 'Rechazado', tone: 'danger' }
  }
  if (normalizedStatus === 'expired') {
    return { key: 'expired', label: 'Vencido', tone: 'danger' }
  }

  return { key: 'pending', label: 'Pendiente', tone: 'warning' }
}

function canReviewAircraftDocument(document = {}) {
  const key = documentStatusMeta(document).key
  return ['pending', 'rejected', 'expired'].includes(key)
}

function canApproveAircraftDocument(document = {}) {
  const key = documentStatusMeta(document).key
  return ['pending', 'rejected', 'expired'].includes(key)
}

function canRejectAircraftDocument(document = {}) {
  const key = documentStatusMeta(document).key
  return ['pending', 'approved', 'expired'].includes(key)
}

const AIRCRAFT_DOCUMENT_REQUIREMENTS = [
  {
    key: 'airworthiness',
    label: 'Certificado de aeronavegabilidad',
    aliases: [
      'airworthiness',
      'aeronavegabilidad',
      'airworthiness_certificate',
      'certificate_airworthiness',
      'certificado_aeronavegabilidad',
      'certificado_de_aeronavegabilidad',
    ],
  },
  {
    key: 'registration',
    label: 'Matricula',
    aliases: [
      'registration',
      'registro',
      'matricula',
      'aircraft_registration',
      'registro_aeronave',
      'matricula_aeronave',
    ],
  },
  {
    key: 'insurance',
    label: 'Seguro',
    aliases: ['insurance', 'seguro', 'insurance_policy', 'policy', 'poliza', 'poliza_seguro'],
  },
  {
    key: 'maintenance',
    label: 'Mantenimiento',
    aliases: [
      'maintenance',
      'mantenimiento',
      'maintenance_sticker',
      'sticker_mantenimiento',
      'maintenance_sticker_document',
      'flight_logbook',
      'logbook',
      'bitacora_vuelo',
      'bitacora',
    ],
  },
]

const DOCUMENT_REQUIREMENT_ALIASES = {
  airworthiness: 'airworthiness',
  aeronavegabilidad: 'airworthiness',
  airworthiness_certificate: 'airworthiness',
  certificate_airworthiness: 'airworthiness',
  certificado_aeronavegabilidad: 'airworthiness',
  certificado_de_aeronavegabilidad: 'airworthiness',
  registration: 'registration',
  registro: 'registration',
  matricula: 'registration',
  aircraft_registration: 'registration',
  registro_aeronave: 'registration',
  matricula_aeronave: 'registration',
  insurance: 'insurance',
  seguro: 'insurance',
  insurance_policy: 'insurance',
  policy: 'insurance',
  poliza: 'insurance',
  poliza_seguro: 'insurance',
  maintenance: 'maintenance',
  mantenimiento: 'maintenance',
  maintenance_sticker: 'maintenance',
  sticker_mantenimiento: 'maintenance',
  maintenance_sticker_document: 'maintenance',
  flight_logbook: 'maintenance',
  logbook: 'maintenance',
  bitacora_vuelo: 'maintenance',
  bitacora: 'maintenance',
  photos: 'photos',
  fotografias: 'photos',
}

function normalizeDocumentRequirementKey(value = '') {
  const normalized = normalizeStatus(value)
    .trim()
    .replace(/[\s-]+/g, '_')
  return DOCUMENT_REQUIREMENT_ALIASES[normalized] || normalized
}

function documentRequirementKeys(document = {}) {
  return [
    document.requirement_key,
    document.requirement_code,
    document.document_type,
    document.document_category,
    document.type,
    document.category,
    document.slot,
    document.kind,
  ]
    .map((value) => normalizeDocumentRequirementKey(value))
    .filter(Boolean)
}

function documentMatchesRequirement(document = {}, requirement = {}) {
  const requirementKey = normalizeDocumentRequirementKey(requirement.key)
  const keys = documentRequirementKeys(document)
  if (keys.includes(requirementKey)) return true

  // Fallback temporal para registros legacy sin tipo persistido.
  return Array.isArray(requirement.aliases)
    ? requirement.aliases.some((alias) => normalizeStatus(document.name).includes(normalizeStatus(alias)))
    : false
}

function requirementDocuments(item = {}, requirement = {}) {
  return aircraftDocuments(item).filter((document) => documentMatchesRequirement(document, requirement))
}

function isExpiredDocument(document = {}) {
  const rawDate = String(document.expiresAt || '').trim()
  if (!rawDate) return false

  const normalizedDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? `${rawDate}T23:59:59` : rawDate
  const date = new Date(normalizedDate)
  if (Number.isNaN(date.getTime())) return false

  return date.getTime() < Date.now()
}

function aircraftRequirementSummary(item = {}) {
  return AIRCRAFT_DOCUMENT_REQUIREMENTS.map((requirement) => {
    const documents = requirementDocuments(item, requirement)
    let status = 'missing'

    if (documents.length) {
      const hasApprovedCurrent = documents.some((document) => {
        const meta = documentStatusMeta(document)
        return meta.key === 'approved' && !isExpiredDocument(document)
      })
      const hasExpired = documents.some((document) => {
        const meta = documentStatusMeta(document)
        return meta.key === 'expired' || (meta.key === 'approved' && isExpiredDocument(document))
      })
      const hasApprovedExpired = documents.some((document) => {
        const meta = documentStatusMeta(document)
        return meta.key === 'approved' && isExpiredDocument(document)
      })
      const hasRejected = documents.some((document) => documentStatusMeta(document).key === 'rejected')

      if (hasApprovedCurrent) status = 'approved'
      else if (hasExpired || hasApprovedExpired) status = 'expired'
      else if (hasRejected) status = 'rejected'
      else status = 'pending'
    }

    const statusLabel =
      status === 'approved'
        ? 'Aprobado'
        : status === 'pending'
          ? 'Pendiente'
          : status === 'rejected'
            ? 'Rechazado'
            : status === 'expired'
              ? 'Vencido'
              : 'No cargado'
    return {
      key: requirement.key,
      label: requirement.label,
      complete: status === 'approved',
      status,
      statusLabel,
      detail: statusLabel,
      hasDanger: ['rejected', 'expired'].includes(status),
      documents,
    }
  })
}

function getAircraftDocumentValidation(item = {}) {
  const documentsState = adminAircraftDocumentsState(item)
  const backendRequired = Number(
    documentsState.required ?? documentsState.total_required ?? documentsState.total ?? 0,
  )
  const backendUploaded = Number(
    documentsState.uploaded ?? documentsState.total_uploaded ?? documentsState.documents_uploaded ?? 0,
  )
  const backendApproved = Number(
    documentsState.approved ?? documentsState.valid ?? documentsState.documents_approved ?? 0,
  )
  const backendPending = Number(documentsState.pending ?? documentsState.documents_pending ?? 0)
  const backendRejected = Number(documentsState.rejected ?? documentsState.documents_rejected ?? 0)
  const backendExpired = Number(documentsState.expired ?? documentsState.documents_expired ?? 0)
  const backendMissing = Number(
    documentsState.missing ??
      Math.max(backendRequired - backendApproved - backendPending - backendRejected - backendExpired, 0),
  )
  const backendComplete =
    documentsState.complete ??
    documentsState.valid ??
    (backendRequired > 0 &&
      backendApproved === backendRequired &&
      backendPending === 0 &&
      backendRejected === 0 &&
      backendExpired === 0 &&
      backendMissing === 0)

  if (
    backendRequired > 0 ||
    backendUploaded > 0 ||
    backendApproved > 0 ||
    backendPending > 0 ||
    backendRejected > 0 ||
    backendExpired > 0
  ) {
    let status = 'incomplete'
    let label = 'Documentacion incompleta'

    if (backendComplete) {
      status = 'approved'
      label = 'Docs validos'
    } else if (backendExpired > 0) {
      status = 'expired'
      label = 'Documentacion vencida'
    } else if (backendRejected > 0) {
      status = 'rejected'
      label = 'Documentacion rechazada'
    } else if (backendUploaded > 0 && backendApproved === 0 && backendPending > 0) {
      status = 'pending'
      label = 'Documentacion pendiente'
    } else if (backendPending > 0) {
      status = 'pending'
      label = 'Documentacion pendiente'
    }

    return {
      requirements: aircraftRequirementSummary(item),
      totalRequired: backendRequired,
      approved: backendApproved,
      pending: backendPending,
      rejected: backendRejected,
      expired: backendExpired,
      missing: backendMissing,
      uploaded: backendUploaded,
      allApproved: Boolean(backendComplete),
      hasDocuments: backendUploaded > 0,
      status,
      label,
    }
  }

  const requirements = aircraftRequirementSummary(item)
  const totals = requirements.reduce(
    (accumulator, requirement) => {
      accumulator.totalRequired += 1
      if (requirement.status === 'approved') accumulator.approved += 1
      else if (requirement.status === 'pending') accumulator.pending += 1
      else if (requirement.status === 'rejected') accumulator.rejected += 1
      else if (requirement.status === 'expired') accumulator.expired += 1
      else accumulator.missing += 1
      return accumulator
    },
    {
      totalRequired: 0,
      approved: 0,
      pending: 0,
      rejected: 0,
      expired: 0,
      missing: 0,
    },
  )
  const hasDocuments = aircraftDocuments(item).length > 0
  const allApproved =
    totals.totalRequired > 0 &&
    totals.approved === totals.totalRequired &&
    totals.pending === 0 &&
    totals.rejected === 0 &&
    totals.expired === 0 &&
    totals.missing === 0

  let status = 'incomplete'
  let label = 'Documentacion incompleta'

  if (allApproved) {
    status = 'approved'
    label = 'Docs validos'
  } else if (totals.expired > 0) {
    status = 'expired'
    label = 'Documentacion vencida'
  } else if (totals.rejected > 0) {
    status = 'rejected'
    label = 'Documentacion rechazada'
  } else if (totals.pending > 0) {
    status = 'pending'
    label = 'Documentacion pendiente'
  }

  return {
    requirements,
    totalRequired: totals.totalRequired,
    approved: totals.approved,
    pending: totals.pending,
    rejected: totals.rejected,
    expired: totals.expired,
    missing: totals.missing,
    allApproved,
    hasDocuments,
    status,
    label,
  }
}

function aircraftDocumentValidationKey(item = {}) {
  return String(item.id || item.uuid || item.registration || '').trim()
}

const aircraftDocumentValidationMap = computed(() => {
  const validationMap = new Map()

  props.aircraft.forEach((item) => {
    const key = aircraftDocumentValidationKey(item)
    if (!key) return
    validationMap.set(key, getAircraftDocumentValidation(item))
  })

  return validationMap
})

function resolveAircraftDocumentValidation(item = {}) {
  const key = aircraftDocumentValidationKey(item)
  if (key && aircraftDocumentValidationMap.value.has(key)) {
    return aircraftDocumentValidationMap.value.get(key)
  }

  return getAircraftDocumentValidation(item)
}

function hasTextValue(value) {
  return Boolean(String(value || '').trim())
}

function numericValue(value) {
  const normalized = Number(value || 0)
  return Number.isFinite(normalized) ? normalized : 0
}

function hasRegisteredBase(item) {
  const operationState = adminAircraftOperationState(item)
  if (operationState.base_registered != null) return Boolean(operationState.base_registered)
  return hasTextValue(item.base_airport || item.base || item.airport || item.location || item.base_airport_code)
}

function hasRegistration(item) {
  return hasTextValue(item.registration || item.tail_number || item.matricula)
}

function hasCapacityValue(item) {
  const operationState = adminAircraftOperationState(item)
  if (operationState.capacity_configured != null) return Boolean(operationState.capacity_configured)
  return numericValue(item.capacity || item.passenger_capacity || item.pax) > 0
}

function hasHourlyRateValue(item) {
  const pricingState = adminAircraftPricingState(item)
  if (pricingState.complete != null && numericValue(item.hourly_rate || item.hourlyPrice || item.hourly_price || item.price_per_hour) > 0) {
    return Boolean(pricingState.complete)
  }
  return numericValue(item.hourly_rate || item.hourlyPrice || item.hourly_price || item.price_per_hour) > 0
}

function hasRangeValue(item) {
  const operationState = adminAircraftOperationState(item)
  if (operationState.range_configured != null) return Boolean(operationState.range_configured)
  if (numericValue(operationState.range_nm || operationState.range_km) > 0) return true
  return numericValue(item.range_km || item.rangeKm || item.range || item.max_range_km) > 0
}

function normalizedAircraftReviewStatus(item = {}) {
  const reviewState = adminAircraftReviewState(item)
  return normalizeStatus(reviewState.status || item.review_status || item.validation_status || item.approval_status || '')
}

function normalizeAircraftPaymentStatus(value = '') {
  const normalized = normalizeStatus(value)

  if (!normalized) return ''
  if (['active', 'paid', 'approved', 'confirmed', 'current'].includes(normalized)) return 'active'
  if (['pending', 'pending_payment', 'payment_pending', 'open', 'requires_action', 'incomplete'].includes(normalized)) {
    return 'pending'
  }
  if (['verifying', 'processing', 'pending_review', 'requires_confirmation'].includes(normalized)) {
    return 'verifying'
  }
  if (['expired', 'past_due', 'unpaid', 'incomplete_expired'].includes(normalized)) return 'expired'
  if (['rejected', 'failed', 'declined'].includes(normalized)) return 'rejected'
  if (['suspended', 'cancelled', 'canceled', 'paused'].includes(normalized)) return 'suspended'

  return normalized
}

function isApproved(item) {
  return isAdminAircraftApproved(item)
}

function isSuspended(item) {
  const activationState = adminAircraftActivationState(item)
  const commercialStatus = normalizeStatus(activationState.commercial_status || '')
  if (['suspended', 'blocked', 'rejected'].includes(commercialStatus)) return true
  const status = normalizeStatus(item.status || '')
  const reviewStatus = normalizedAircraftReviewStatus(item)
  return (
    status.includes('suspend') ||
    status.includes('block') ||
    status.includes('archiv') ||
    reviewStatus.includes('reject') ||
    reviewStatus.includes('rechaz')
  )
}

function billingStatusKey(item = {}) {
  const billingState = adminAircraftBillingState(item)
  return normalizeAircraftPaymentStatus(
    billingState.payment_status ||
      item.payment_status ||
      item.paymentStatus ||
      billingState.status ||
      billingState.payment_status ||
      item.billing_status ||
      item.billingStatus ||
      '',
  )
}

function hasActiveBilling(item = {}) {
  const billingState = adminAircraftBillingState(item)
  if (billingState.is_active === true || billingState.payment_confirmed === true) return true
  const status = billingStatusKey(item)
  return status === 'active'
}

function hasPendingPayment(item = {}) {
  const billingState = adminAircraftBillingState(item)
  const activationState = adminAircraftActivationState(item)
  if (billingState.is_active === false && normalizeStatus(billingState.status) === 'pending') {
    return true
  }
  if (normalizeStatus(activationState.commercial_status) === 'pending_payment') return true
  const status = billingStatusKey(item)
  return ['pending', 'verifying'].includes(status) && isApproved(item) && !hasActiveBilling(item)
}

function documentsState(item) {
  const validation = resolveAircraftDocumentValidation(item)
  if (validation.status === 'approved') return 'Validos'
  if (validation.status === 'expired') return 'Vencidos'
  if (validation.status === 'rejected') return 'Rechazados'
  if (validation.status === 'pending') return 'Pendientes'
  return 'Incompletos'
}

function isExpiredAircraftSubscription(item = {}) {
  const rawEndsAt = String(item.ends_at || item.subscription_ends_at || '').trim()
  if (!rawEndsAt) return false

  const normalizedEndsAt = /^\d{4}-\d{2}-\d{2}$/.test(rawEndsAt)
    ? `${rawEndsAt}T23:59:59`
    : rawEndsAt

  const endsAt = new Date(normalizedEndsAt)
  if (Number.isNaN(endsAt.getTime())) return false

  return endsAt.getTime() < Date.now()
}

function aircraftSubscriptionStatusLabel(item = {}) {
  if (isExpiredAircraftSubscription(item)) return 'Vencida'
  return item.status || 'Sin estado'
}

function marketplaceAvailable(item = {}) {
  const snapshot = adminAircraftSnapshot(item)
  if (snapshot.ready_to_book != null) return Boolean(snapshot.ready_to_book)
  const activationState = adminAircraftActivationState(item)
  if (activationState.is_active != null) return Boolean(activationState.is_active)
  return isApproved(item) && hasActiveBilling(item) && resolveAircraftDocumentValidation(item).allApproved
}

function aircraftMissingFields(item) {
  const activationState = adminAircraftActivationState(item)
  const backendMissing = Array.isArray(activationState.missing_requirements)
    ? activationState.missing_requirements.map((entry) => normalizeMissingRequirement(entry)).filter(Boolean)
    : []
  if (backendMissing.length) return [...new Set(backendMissing)]

  const missing = []
  const documentValidation = resolveAircraftDocumentValidation(item)

  if (!hasRegistration(item)) missing.push('matricula')
  if (!hasRegisteredBase(item)) missing.push('base')
  if (!hasCapacityValue(item)) missing.push('capacidad')
  if (!hasHourlyRateValue(item)) missing.push('tarifa')
  if (!hasRangeValue(item)) missing.push('rango')
  if (!documentValidation.allApproved) missing.push('documentacion')
  if (!aircraftImages(item).length) missing.push('fotografias')

  return missing
}

function aircraftReadiness(item) {
  const snapshot = adminAircraftSnapshot(item)
  const missing = aircraftMissingFields(item)
  const approved = isApproved(item)
  const suspended = isSuspended(item)
  const documentValidation = resolveAircraftDocumentValidation(item)
  const documented = documentValidation.allApproved
  const baseRegistered = hasRegisteredBase(item)
  const marketplaceReady = marketplaceAvailable(item)
  const billingPending = hasPendingPayment(item)
  const billingActive = hasActiveBilling(item)
  const quoteReady =
    snapshot.ready_to_quote ??
    (approved && !suspended && documented && baseRegistered && hasCapacityValue(item) && hasHourlyRateValue(item))
  const reservationReady =
    snapshot.ready_to_book ??
    (quoteReady && marketplaceReady && hasRegistration(item))

  return {
    approved,
    suspended,
    billingPending,
    billingActive,
    documented,
    marketplaceReady,
    baseRegistered,
    quoteReady,
    reservationReady,
    missing,
  }
}

function readinessTone(item) {
  const readiness = aircraftReadiness(item)
  if (readiness.suspended) return 'danger'
  if (readiness.reservationReady) return 'success'
  if (readiness.billingPending) return 'warning'
  if (readiness.quoteReady) return 'info'
  return readiness.missing.length ? 'warning' : 'neutral'
}

function readinessHeadline(item) {
  const readiness = aircraftReadiness(item)
  if (readiness.suspended) return 'Suspendida'
  if (readiness.reservationReady) return 'Lista para reservar'
  if (readiness.billingPending) return 'Pendiente de pago'
  if (readiness.quoteReady) return 'Lista para cotizar'
  if (readiness.approved) return 'En integracion comercial'
  return 'Pendiente de validacion'
}

function readinessDescription(item) {
  const readiness = aircraftReadiness(item)
  const documentValidation = resolveAircraftDocumentValidation(item)
  const activationState = adminAircraftActivationState(item)
  if (readiness.suspended) return 'La aeronave esta bloqueada y no esta disponible comercialmente.'
  if (readiness.reservationReady) return 'Cumple aprobacion, base, documentos y datos comerciales para reservas.'
  if (readiness.billingPending) return 'La aeronave ya fue aprobada por administracion, pero no se activa hasta reflejar el pago mensual.'
  if (readiness.quoteReady) return 'Puede entrar a cotizaciones, pero aun requiere disponibilidad comercial final.'
  if (Array.isArray(activationState.missing_requirements) && activationState.missing_requirements.length) {
    return `Faltan ${activationState.missing_requirements.map((entry) => missingFieldLabel(normalizeMissingRequirement(entry))).join(', ')}.`
  }
  if (!documentValidation.allApproved) return `${documentValidation.label}.`
  if (readiness.missing.length) return `Faltan ${readiness.missing.slice(0, 3).join(', ')}${readiness.missing.length > 3 ? '...' : ''}.`
  return 'Requiere revision administrativa antes de habilitarla comercialmente.'
}

function missingFieldLabel(field) {
  const labels = {
    provider_not_approved: 'Proveedor no aprobado',
    aircraft_not_approved: 'Aeronave no aprobada',
    matricula: 'Sin matricula',
    base: 'Sin base',
    capacidad: 'Sin capacidad',
    tarifa: 'Sin tarifa',
    minimo: 'Sin minimo',
    rango: 'Sin rango',
    documentacion: 'Sin documentacion',
    fotografias: 'Sin fotos',
    payment_pending: 'Pago pendiente',
    pricing: 'Informacion comercial incompleta',
    documents: 'Documentacion incompleta',
    provider: 'Proveedor no aprobado',
  }
  return labels[field] || field
}

function buildChecklistRequirement(item = {}, config = {}) {
  const autoState = normalizeChecklistState(typeof config.resolveState === 'function' ? config.resolveState(item) : 'pending')
  const persistedRecord = checklistDraftRecord(config.id)
  const persistedState = normalizeChecklistState(persistedRecord?.state || '')
  const state =
    persistedRecord && CHECKLIST_ALLOWED_STATES.includes(persistedState)
      ? persistedState
      : autoState
  const evidence = typeof config.resolveEvidence === 'function' ? config.resolveEvidence(item) : null
  const relatedDocument = typeof config.resolveDocument === 'function' ? config.resolveDocument(item) : null

  return {
    id: config.id,
    sectionId: config.sectionId,
    label: config.label,
    state,
    autoState,
    mandatory: config.mandatory !== false,
    manual: config.manual !== false,
    completed: state === 'approved',
    evidence,
    relatedDocument,
    reviewedAt: persistedRecord?.reviewedAt || persistedRecord?.reviewed_at || '',
    reviewedBy: persistedRecord?.reviewedBy || persistedRecord?.reviewed_by || '',
    notes: persistedRecord?.notes || persistedRecord?.observation || persistedRecord?.observations || '',
    source: persistedRecord ? 'manual' : 'automatic',
  }
}

function checklistDocumentStatus(item = {}, requirement = {}) {
  return requirementDocuments(item, requirement).some((document) => {
    const meta = documentStatusMeta(document)
    return meta.key === 'approved' && !isExpiredDocument(document)
  })
}

function checklistDocumentEvidence(item = {}, requirement = {}) {
  const currentDocuments = requirementDocuments(item, requirement)
  if (!currentDocuments.length) return null
  const document = currentDocuments[0]

  return {
    label: document.name || requirement.label,
    detail: `${documentStatusMeta(document).label} · Vence ${formatDate(document.expiresAt)}`,
    document,
  }
}

function automaticChecklistSections(item = {}) {
  const readiness = aircraftReadiness(item)

  return [
    {
      id: 'general',
      label: 'Informacion general',
      items: [
        buildChecklistRequirement(item, { id: 'registration_present', sectionId: 'general', label: 'Matricula registrada', resolveState: (record) => (hasRegistration(record) ? 'approved' : 'pending') }),
        buildChecklistRequirement(item, { id: 'manufacturer_present', sectionId: 'general', label: 'Fabricante informado', resolveState: (record) => (hasManufacturerValue(record) ? 'approved' : 'pending') }),
        buildChecklistRequirement(item, { id: 'model_present', sectionId: 'general', label: 'Modelo informado', resolveState: (record) => (hasModelValue(record) ? 'approved' : 'pending') }),
        buildChecklistRequirement(item, { id: 'year_present', sectionId: 'general', label: 'Ano informado', resolveState: (record) => (hasModelYearValue(record) ? 'approved' : 'pending') }),
        buildChecklistRequirement(item, { id: 'base_configured', sectionId: 'general', label: 'Base operativa configurada', resolveState: (record) => (hasRegisteredBase(record) ? 'approved' : 'pending') }),
        buildChecklistRequirement(item, { id: 'capacity_configured', sectionId: 'general', label: 'Capacidad de pasajeros configurada', resolveState: (record) => (hasCapacityValue(record) ? 'approved' : 'pending') }),
        buildChecklistRequirement(item, { id: 'range_configured', sectionId: 'general', label: 'Rango configurado', resolveState: (record) => (hasRangeValue(record) ? 'approved' : 'pending') }),
        buildChecklistRequirement(item, { id: 'cruise_speed_configured', sectionId: 'general', label: 'Velocidad crucero configurada', resolveState: (record) => (hasCruiseSpeedValue(record) ? 'approved' : 'pending') }),
      ],
    },
    {
      id: 'documents',
      label: 'Documentacion',
      items: [
        buildChecklistRequirement(item, {
          id: 'airworthiness_certificate',
          sectionId: 'documents',
          label: 'Certificado de aeronavegabilidad',
          resolveState: (record) => (checklistDocumentStatus(record, { key: 'airworthiness', aliases: ['airworthiness', 'aeronavegabilidad'] }) ? 'approved' : 'pending'),
          resolveEvidence: (record) => checklistDocumentEvidence(record, { key: 'airworthiness', aliases: ['airworthiness', 'aeronavegabilidad'] }),
          resolveDocument: (record) => checklistDocumentEvidence(record, { key: 'airworthiness', aliases: ['airworthiness', 'aeronavegabilidad'] })?.document || null,
        }),
        buildChecklistRequirement(item, {
          id: 'registration',
          sectionId: 'documents',
          label: 'Matricula',
          resolveState: (record) => (checklistDocumentStatus(record, { key: 'registration', aliases: ['registration', 'matricula', 'registro'] }) ? 'approved' : 'pending'),
          resolveEvidence: (record) => checklistDocumentEvidence(record, { key: 'registration', aliases: ['registration', 'matricula', 'registro'] }),
          resolveDocument: (record) => checklistDocumentEvidence(record, { key: 'registration', aliases: ['registration', 'matricula', 'registro'] })?.document || null,
        }),
        buildChecklistRequirement(item, {
          id: 'insurance',
          sectionId: 'documents',
          label: 'Seguro vigente',
          resolveState: (record) => (checklistDocumentStatus(record, { key: 'insurance', aliases: ['insurance', 'seguro', 'poliza'] }) ? 'approved' : 'pending'),
          resolveEvidence: (record) => checklistDocumentEvidence(record, { key: 'insurance', aliases: ['insurance', 'seguro', 'poliza'] }),
          resolveDocument: (record) => checklistDocumentEvidence(record, { key: 'insurance', aliases: ['insurance', 'seguro', 'poliza'] })?.document || null,
        }),
        buildChecklistRequirement(item, {
          id: 'maintenance',
          sectionId: 'documents',
          label: 'Programa o evidencia de mantenimiento',
          resolveState: (record) => (checklistDocumentStatus(record, { key: 'maintenance', aliases: ['maintenance', 'mantenimiento', 'maintenance_sticker'] }) ? 'approved' : 'pending'),
          resolveEvidence: (record) => checklistDocumentEvidence(record, { key: 'maintenance', aliases: ['maintenance', 'mantenimiento', 'maintenance_sticker'] }),
          resolveDocument: (record) => checklistDocumentEvidence(record, { key: 'maintenance', aliases: ['maintenance', 'mantenimiento', 'maintenance_sticker'] })?.document || null,
        }),
        buildChecklistRequirement(item, {
          id: 'exterior_photos',
          sectionId: 'documents',
          label: 'Fotografias exteriores',
          resolveState: (record) => (hasExteriorPhotos(record) ? 'approved' : 'pending'),
          resolveEvidence: (record) => ({ label: `${aircraftImages(record).length} imagen(es)`, detail: hasExteriorPhotos(record) ? 'Galeria disponible' : 'Sin evidencia' }),
        }),
      ],
    },
    {
      id: 'operations',
      label: 'Operacion',
      items: [
        buildChecklistRequirement(item, { id: 'base_airport_configured', sectionId: 'operations', label: 'Aeropuerto base configurado', resolveState: (record) => (hasRegisteredBase(record) ? 'approved' : 'pending') }),
        buildChecklistRequirement(item, { id: 'crew_configured', sectionId: 'operations', label: 'Tripulacion configurada', resolveState: (record) => (hasCrewConfigured(record) ? 'approved' : 'pending') }),
        buildChecklistRequirement(item, { id: 'availability_configured', sectionId: 'operations', label: 'Disponibilidad configurada', resolveState: (record) => (hasAvailabilityConfigured(record) ? 'approved' : 'pending') }),
        buildChecklistRequirement(item, { id: 'operations_complete', sectionId: 'operations', label: 'Datos operativos completos', resolveState: (record) => (hasRegisteredBase(record) && hasCapacityValue(record) && hasRangeValue(record) && hasCruiseSpeedValue(record) ? 'approved' : 'pending') }),
        buildChecklistRequirement(item, { id: 'ready_to_quote', sectionId: 'operations', label: 'Aeronave habilitada para cotizar', resolveState: () => (readiness.quoteReady ? 'approved' : 'pending') }),
        buildChecklistRequirement(item, { id: 'ready_to_book', sectionId: 'operations', label: 'Aeronave habilitada para reservar', resolveState: () => (readiness.reservationReady ? 'approved' : 'pending') }),
      ],
    },
    {
      id: 'pricing',
      label: 'Pricing',
      items: [
        buildChecklistRequirement(item, { id: 'hourly_rate_registered', sectionId: 'pricing', label: 'Tarifa por hora registrada', resolveState: (record) => (hasHourlyRateValue(record) ? 'approved' : 'pending') }),
        buildChecklistRequirement(item, { id: 'currency_configured', sectionId: 'pricing', label: 'Moneda configurada', resolveState: (record) => (hasCurrencyValue(record) ? 'approved' : 'pending') }),
        buildChecklistRequirement(item, { id: 'domestic_expenses_configured', sectionId: 'pricing', label: 'Gastos nacionales configurados', resolveState: (record) => (hasDomesticExpensesValue(record) ? 'approved' : 'pending') }),
        buildChecklistRequirement(item, { id: 'fixed_fee_configured', sectionId: 'pricing', label: 'Fee fijo configurado', resolveState: (record) => (hasFixedFeeValue(record) ? 'approved' : 'pending') }),
        buildChecklistRequirement(item, { id: 'margin_configured', sectionId: 'pricing', label: 'Porcentaje de utilidad configurado', resolveState: (record) => (hasMarginValue(record) ? 'approved' : 'pending') }),
        buildChecklistRequirement(item, { id: 'price_reviewed_admin', sectionId: 'pricing', label: 'Precio revisado por administrador', resolveState: (record) => (hasAdminReviewedPrice(record) ? 'approved' : 'pending') }),
      ],
    },
  ]
    .map((section) => ({
      ...section,
      items: [...section.items].sort((left, right) => Number(left.completed) - Number(right.completed)),
    }))
    .map((section) => {
      const completed = section.items.filter((requirement) => requirement.completed).length
      const total = section.items.length || 1
      return {
        ...section,
        completed,
        total,
        percent: Math.round((completed / total) * 100),
        complete: completed === total,
      }
    })
}

const selectedAircraftChecklistSections = computed(() =>
  selectedAircraft.value ? automaticChecklistSections(selectedAircraft.value) : [],
)

const selectedAircraftChecklistSummary = computed(() => {
  const sections = selectedAircraftChecklistSections.value
  const items = sections.flatMap((section) => section.items)
  const completed = items.filter((item) => item.completed).length
  const total = items.length || 1
  const mandatoryPending = items.filter((item) => item.mandatory !== false && !item.completed)
  const documentationSection = sections.find((section) => section.id === 'documents')
  const generalSection = sections.find((section) => section.id === 'general')
  const operationsSection = sections.find((section) => section.id === 'operations')
  const pricingSection = sections.find((section) => section.id === 'pricing')

  return {
    completed,
    total,
    percent: Math.round((completed / total) * 100),
    mandatoryPendingCount: mandatoryPending.length,
    status: mandatoryPending.length ? 'pending' : 'approved',
    documentationComplete: Boolean(documentationSection?.complete),
    quoteReady: Boolean(generalSection?.complete && operationsSection?.complete && pricingSection?.complete),
    reservationReady: Boolean(documentationSection?.complete && operationsSection?.complete),
  }
})

function applyChecklistBackendItems(records = []) {
  Object.keys(checklistDraft).forEach((key) => delete checklistDraft[key])

  records.forEach((record, index) => {
    const itemId = String(
      record.item_id || record.key || record.requirement_id || record.requirement_key || record.slug || `item-${index}`,
    ).trim()
    if (!itemId) return
    checklistDraft[itemId] = {
      id: itemId,
      state: normalizeChecklistState(record.state || record.status),
      notes: record.notes || record.observation || record.observations || '',
      reviewedAt: record.reviewed_at || record.updated_at || record.created_at || '',
      reviewedBy: record.reviewed_by_name || record.reviewed_by || record.admin_name || 'Administrador',
    }
  })

  checklistDirty.value = false
}

async function loadChecklistForAircraft(aircraftId) {
  if (!aircraftId) return

  checklistLoading.value = true
  checklistError.value = ''
  checklistUnsupported.value = false

  try {
    const response = await getAircraftChecklist(aircraftId)

    applyChecklistBackendItems(normalizeChecklistBackendItems(response))
    checklistLoadedAircraftId.value = Number(aircraftId)
  } catch (error) {
    Object.keys(checklistDraft).forEach((key) => delete checklistDraft[key])
    checklistLoadedAircraftId.value = Number(aircraftId)

    if ([404, 405].includes(Number(error?.status || 0))) {
      checklistUnsupported.value = true
      checklistError.value = 'El endpoint oficial del checklist administrativo no esta disponible en este ambiente.'
      return
    }

    checklistError.value = error?.message || 'No fue posible cargar el checklist administrativo.'
  } finally {
    checklistLoading.value = false
  }
}

function resetChecklistDraft() {
  if (selectedAircraft.value) {
    void loadChecklistForAircraft(selectedAircraft.value.id)
  }
}

function updateChecklistItemState(itemId, nextState) {
  const normalizedState = normalizeChecklistState(nextState)
  const current = checklistDraftRecord(itemId) || {}
  checklistDraft[itemId] = {
    ...current,
    id: itemId,
    state: normalizedState,
    reviewedAt: new Date().toISOString(),
    reviewedBy: current.reviewedBy || 'Administrador',
  }
  checklistDirty.value = true
}

async function saveChecklist() {
  if (!selectedAircraft.value) return

  checklistSaving.value = true
  checklistError.value = ''

  try {
    await updateAircraftChecklist(selectedAircraft.value.id, {
      items: Object.values(checklistDraft).map((item) => ({
        key: item.id,
        status: normalizeChecklistState(item.state || 'pending'),
        notes: item.notes || null,
      })),
    })

    checklistDirty.value = false
    ui.pushToast({
      tone: 'success',
      title: 'Checklist guardado',
      message: 'La revision administrativa de la aeronave quedo actualizada.',
    })
  } catch (error) {
    checklistError.value = error?.message || 'No fue posible guardar el checklist.'
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo guardar el checklist',
      message: checklistError.value,
    })
  } finally {
    checklistSaving.value = false
  }
}

function approvalState(item) {
  if (isSuspended(item)) return 'Suspendidas'
  return isApproved(item) ? 'Aprobadas' : 'Pendientes'
}

function statusChip(item) {
  const state = approvalState(item)
  if (state === 'Aprobadas') return { label: 'Aprobada', tone: 'success', icon: '✓' }
  if (state === 'Suspendidas') return { label: 'Suspendida', tone: 'danger', icon: '!' }
  return { label: 'Pendiente', tone: 'warning', icon: '!' }
}

function billingChip(item) {
  if (hasActiveBilling(item)) return { label: 'Pago activo', tone: 'success', icon: '✓' }
  if (hasPendingPayment(item)) return { label: 'Pendiente de pago', tone: 'warning', icon: '!' }
  return { label: 'Sin cobro activo', tone: 'neutral', icon: '•' }
}

function docsChip(item) {
  const validation = resolveAircraftDocumentValidation(item)
  if (validation.status === 'approved') return { label: 'Docs validos', tone: 'success', icon: '✓' }
  if (validation.status === 'expired') return { label: 'Docs vencidos', tone: 'danger', icon: '!' }
  if (validation.status === 'rejected') return { label: 'Docs rechazados', tone: 'danger', icon: '!' }
  if (validation.status === 'pending') return { label: 'Docs pendientes', tone: 'warning', icon: '!' }
  return { label: 'Documentacion incompleta', tone: 'warning', icon: '!' }
}

function operationalChip(item) {
  return aircraftReadiness(item).reservationReady
    ? { label: 'Activa', tone: 'success', icon: '✓' }
    : { label: 'Inactiva', tone: 'warning', icon: '!' }
}

function companyInitials(name) {
  return String(name || 'NA')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function aircraftChecklistPercent(item = {}) {
  const sections = automaticChecklistSections(item)
  const items = sections.flatMap((section) => section.items)
  const total = items.length || 1
  const completed = items.filter((entry) => entry.completed).length
  return Math.round((completed / total) * 100)
}

function providerCompliancePercent(items = []) {
  if (!items.length) return 0
  const total = items.reduce((sum, item) => sum + aircraftChecklistPercent(item), 0)
  return Math.round(total / items.length)
}

function providerOverallStatus(group) {
  if (!group?.items?.length) return { label: 'Sin aeronaves', tone: 'neutral' }
  if (group.pending > 0) return { label: 'Requiere revision', tone: 'warning' }
  if (group.active === group.items.length) return { label: 'Operativa', tone: 'success' }
  if (group.approved > 0) return { label: 'Parcial', tone: 'info' }
  return { label: 'En proceso', tone: 'neutral' }
}

function yesNoLabel(value) {
  return value ? 'Si' : 'No'
}

function detailMetricTone(value) {
  return value ? 'success' : 'neutral'
}

function detailStatusRows(item = {}) {
  const readiness = aircraftReadiness(item)
  const validation = resolveAircraftDocumentValidation(item)
  return [
    { label: 'Capacidad', value: formatNumber(item.capacity || item.passenger_capacity, ' pax') },
    {
      label: 'Rango máximo',
      value: hasRangeValue(item) ? formatNumber(item.range_km || item.rangeKm, ' km') : 'Pendiente',
    },
    { label: 'Tarifa', value: formatMoney(item.hourly_rate || item.hourlyPrice || item.price_per_hour) },
    { label: 'Ultima actualizacion', value: formatDate(item.updated_at || item.created_at) },
    { label: 'Cotizable', value: yesNoLabel(readiness.quoteReady), tone: detailMetricTone(readiness.quoteReady) },
    { label: 'Reservable', value: yesNoLabel(readiness.reservationReady), tone: detailMetricTone(readiness.reservationReady) },
    { label: 'Documentacion', value: validation.label, tone: docsChip(item).tone },
    { label: 'Pago', value: billingChip(item).label, tone: billingChip(item).tone },
    { label: 'Estado operativo', value: operationalChip(item).label, tone: operationalChip(item).tone },
  ]
}

function detailGeneralRows(item = {}) {
  return [
    { label: 'Modelo', value: aircraftName(item) },
    { label: 'Fabricante', value: item.manufacturer || 'Pendiente' },
    { label: 'Tipo', value: item.type || item.category || 'Jet ejecutivo' },
    { label: 'Ano', value: item.model_year || item.year || 'Pendiente' },
    { label: 'Matricula', value: item.registration || 'Pendiente' },
    { label: 'Proveedor', value: providerName(item) },
    { label: 'Base', value: baseLabel(item) },
    { label: 'Horas', value: formatHours(item.flight_hours || item.hours) },
    { label: 'Estado', value: statusChip(item).label, tone: statusChip(item).tone },
  ]
}

function detailOperationRows(item = {}) {
  const readiness = aircraftReadiness(item)
  return [
    { label: 'Estado Backend', value: item.status || 'Pendiente' },
    { label: 'Marketplace', value: readiness.reservationReady ? 'Disponible' : 'Bloqueado', tone: detailMetricTone(readiness.reservationReady) },
    { label: 'Reservable', value: yesNoLabel(readiness.reservationReady), tone: detailMetricTone(readiness.reservationReady) },
    { label: 'Cotizable', value: yesNoLabel(readiness.quoteReady), tone: detailMetricTone(readiness.quoteReady) },
    { label: 'Base registrada', value: yesNoLabel(readiness.baseRegistered), tone: detailMetricTone(readiness.baseRegistered) },
    { label: 'Pago', value: billingChip(item).label, tone: billingChip(item).tone },
  ]
}

function firstDefinedText(...values) {
  return values.find((value) => String(value || '').trim()) || ''
}

function lastApprovalDate(item = {}) {
  const reviewState = adminAircraftReviewState(item)
  return (
    reviewState.approved_at ||
    reviewState.last_approved_at ||
    item.approved_at ||
    item.approvedAt ||
    item.last_approved_at ||
    ''
  )
}

function lastRejectionDate(item = {}) {
  const reviewState = adminAircraftReviewState(item)
  return (
    reviewState.rejected_at ||
    reviewState.last_rejected_at ||
    item.rejected_at ||
    item.rejectedAt ||
    item.last_rejected_at ||
    ''
  )
}

function selectedAircraftAdminName(item = {}) {
  const reviewState = adminAircraftReviewState(item)
  const snapshot = adminAircraftSnapshot(item)
  const reviewedByDraft = Object.values(checklistDraft)
    .map((entry) => entry?.reviewedBy || '')
    .find(Boolean)

  return (
    firstDefinedText(
      reviewState.reviewed_by_name,
      reviewState.admin_name,
      reviewState.approved_by_name,
      reviewState.rejected_by_name,
      snapshot.updated_by_name,
      item.updated_by_name,
      item.admin_name,
      reviewedByDraft,
    ) || 'Administrador'
  )
}

function detailHistoryRows(item = {}) {
  return [
    { label: 'Registro creado', value: formatDate(item.created_at) },
    { label: 'Ultima actualizacion', value: formatDate(item.updated_at || item.created_at) },
    { label: 'Ultima aprobacion', value: formatDate(lastApprovalDate(item)) },
    { label: 'Ultimo rechazo', value: formatDate(lastRejectionDate(item)) },
  ]
}

function detailPricingCards(item = {}) {
  return [
    { label: 'Tarifa hora', value: formatMoney(item.hourly_rate || item.hourlyPrice || item.price_per_hour) },
    { label: 'Minimo', value: formatNumber(item.minimum_hours || item.min_hours, ' h') },
    { label: 'Capacidad', value: formatNumber(item.capacity || item.passenger_capacity, ' pasajeros') },
    { label: 'Cobertura', value: formatList(item.coverage) },
    { label: 'Amenidades', value: formatList(item.amenities) },
    { label: 'Comisiones', value: formatNumber(item.commission_percent || item.commission || item.comisiones, '%') },
    { label: 'Fee', value: formatMoney(item.fixed_fee || item.fee_fijo || item.global_fixed_fee) },
    { label: 'Utilidad', value: formatNumber(item.margin_percent || item.profit_percent || item.utility_percent || item.utilidad, '%') },
    { label: 'Combustible', value: formatMoney(item.fuel_surcharge || item.fuel_cost || item.combustible) },
  ]
}

async function scrollDetailSection(sectionId = 'general') {
  await nextTick()
  const target = globalThis.document?.querySelector?.(`[data-detail-section="${sectionId}"]`)
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function isCompanyExpanded(name) {
  return expandedCompanyGroups.value.includes(name)
}

function toggleCompanyGroup(name) {
  expandedCompanyGroups.value = isCompanyExpanded(name)
    ? expandedCompanyGroups.value.filter((value) => value !== name)
    : [...expandedCompanyGroups.value, name]
}

function openAircraftDetail(item, tab = 'general') {
  selectedAircraft.value = item
  detailTab.value = tab
  openActionMenuId.value = null
  void scrollDetailSection(tab)
}

function formatDate(value) {
  if (!value) return 'Sin fecha'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10)
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function matchesText(item) {
  const query = searchTerm.value.trim().toLowerCase()
  if (!query) return true
  return [aircraftName(item), item.registration, providerName(item), baseLabel(item), item.type, item.category]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query))
}

const companyOptions = computed(() => {
  const names = [...new Set(props.aircraft.map(providerName))]
  return ['Todas', ...names.sort((a, b) => a.localeCompare(b))]
})

const companyCounts = computed(() =>
  props.aircraft.reduce(
    (counts, item) => {
      const name = providerName(item)
      counts[name] = (counts[name] || 0) + 1
      counts.Todas += 1
      return counts
    },
    { Todas: 0 },
  ),
)

const activeFilters = computed(() =>
  [
    companyFilter.value !== 'Todas' ? `Empresa: ${companyFilter.value}` : '',
    approvalFilter.value !== 'Todas' ? `Estado: ${approvalFilter.value}` : '',
    documentsFilter.value !== 'Todos' ? `Docs: ${documentsFilter.value}` : '',
    sortMode.value !== 'recent' ? `Orden: ${sortOptions.find((item) => item.value === sortMode.value)?.label || sortMode.value}` : '',
  ].filter(Boolean),
)

const companyFilteredAircraft = computed(() => {
  const providerIdQuery = routeProviderIdValue()
  const providerNameQuery = String(route.query.providerName || '').trim()

  return props.aircraft.filter((item) => {
    const matchesCompany = companyFilter.value === 'Todas' || providerName(item) === companyFilter.value
    if (!matchesCompany) return false

    if (providerIdQuery > 0) {
      return providerIdValue(item) === providerIdQuery
    }

    if (providerNameQuery) {
      return providerName(item) === providerNameQuery
    }

    return true
  })
})

const sectionStatusItems = computed(() =>
  [
    props.aircraftLoading ? 'Cargando aeronaves...' : '',
    props.documentsLoading ? 'Cargando documentos...' : '',
    props.subscriptionsLoading ? 'Cargando suscripciones...' : '',
    props.paymentsLoading ? 'Cargando pagos...' : '',
  ].filter(Boolean),
)

const sectionErrorMessages = computed(() =>
  [
    props.sectionErrors?.aircraft || '',
    props.sectionErrors?.documents || '',
    props.sectionErrors?.subscriptions || '',
    props.sectionErrors?.payments || '',
  ].filter(Boolean),
)



const filteredAircraft = computed(() => {
  const items = companyFilteredAircraft.value.filter((item) => {
    const approvalMatches = approvalFilter.value === 'Todas' || approvalState(item) === approvalFilter.value
    const documentMatches = documentsFilter.value === 'Todos' || documentsState(item) === documentsFilter.value
    return approvalMatches && documentMatches && matchesText(item)
  })

  return [...items].sort((a, b) => {
    if (sortMode.value === 'az') return aircraftName(a).localeCompare(aircraftName(b))
    if (sortMode.value === 'approved') return Number(isApproved(b)) - Number(isApproved(a))
    return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime()
  })
})

const kpis = computed(() => {
  const total = companyFilteredAircraft.value.length || 1
  const items = [
    { label: 'Aeronaves', value: companyFilteredAircraft.value.length, tone: 'default' },
    { label: 'Aprobadas', value: companyFilteredAircraft.value.filter(isApproved).length, tone: 'success' },
    { label: 'Pendientes', value: companyFilteredAircraft.value.filter((item) => approvalState(item) === 'Pendientes').length, tone: 'warning' },
    { label: 'Suspendidas', value: companyFilteredAircraft.value.filter(isSuspended).length, tone: 'danger' },
    { label: 'Activas', value: companyFilteredAircraft.value.filter((item) => aircraftReadiness(item).reservationReady).length, tone: 'info' },
  ]

  return items.map((item) => ({
    ...item,
    progress: Math.round((item.value / total) * 100),
  }))
})

const companyGroups = computed(() => {
  const groups = new Map()
  filteredAircraft.value.forEach((item) => {
    const name = providerName(item)
    if (!groups.has(name)) groups.set(name, [])
    groups.get(name).push(item)
  })
  return [...groups.entries()].map(([name, items]) => ({
    name,
    items,
    approved: items.filter(isApproved).length,
    pending: items.filter((item) => approvalState(item) === 'Pendientes').length,
    active: items.filter((item) => aircraftReadiness(item).reservationReady).length,
    compliance: providerCompliancePercent(items),
  }))
})

function clearFilters() {
  companyFilter.value = 'Todas'
  approvalFilter.value = 'Todas'
  documentsFilter.value = 'Todos'
  searchTerm.value = ''
  sortMode.value = 'recent'
  showAdvancedFilters.value = false
  openActionMenuId.value = null
  if (route.query.providerId || route.query.providerName) {
    router.replace({ query: {} })
  }
}

function selectAircraft(item) {
  openAircraftDetail(item, 'general')
}

function closeDrawer() {
  selectedAircraft.value = null
  detailTab.value = 'general'
}

function toggleActionMenu(id) {
  openActionMenuId.value = openActionMenuId.value === id ? null : id
}

function closeActionMenu() {
  openActionMenuId.value = null
}

function runCardAction(action, item) {
  if (!item) return
  if (action === 'activate' && props.activatingAircraftId === Number(item.id)) return
  if (action === 'view') {
    selectAircraft(item)
  } else if (action === 'activate') {
    emit('activate-aircraft', item.id)
  } else if (action === 'deactivate') {
    emit('deactivate-aircraft', item.id)
  } else if (action === 'reject') {
    emit('reject-aircraft', item.id)
  } else if (action === 'suspend') {
    emit('suspend-aircraft', item.id)
  }
  closeActionMenu()
}

function aircraftIsActive(item = {}) {
  return isAdminAircraftActive(item)
}

function activationRequirements(item = {}) {
  const activationState = adminAircraftActivationState(item)
  return Array.isArray(activationState.missing_requirements) ? activationState.missing_requirements : []
}

function activationRequirementsLabel(item = {}) {
  const requirements = activationRequirements(item)
  if (!requirements.length) return ''

  const labels = requirements
    .map((entry) =>
      typeof entry === 'string'
        ? missingFieldLabel(normalizeMissingRequirement(entry))
        : entry.label || missingFieldLabel(normalizeMissingRequirement(entry?.code || ''))
    )
    .filter(Boolean)

  if (!labels.length) return ''
  if (labels.length === 1) return `Bloqueada por: ${labels[0]}.`
  return `Bloqueada por: ${labels.slice(0, 2).join(', ')}${labels.length > 2 ? '...' : ''}.`
}

function hasActivationRequirement(item = {}, code = '') {
  const normalizedCode = normalizeMissingRequirement(code)
  return activationRequirements(item).some((entry) => {
    const currentCode = typeof entry === 'string' ? entry : String(entry?.code || '').trim()
    return normalizeMissingRequirement(currentCode) === normalizedCode
  })
}

function primaryAdminAction(item = {}) {
  return resolvePrimaryAdminAircraftAction(item)
}

const selectedAircraftIndex = computed(() =>
  selectedAircraft.value ? filteredAircraft.value.findIndex((item) => item.id === selectedAircraft.value.id) : -1,
)

const selectedAircraftDocuments = computed(() =>
  selectedAircraft.value ? aircraftDocuments(selectedAircraft.value) : [],
)

const selectedAircraftMediaAssets = computed(() =>
  selectedAircraft.value ? aircraftMediaAssets(selectedAircraft.value) : [],
)

const selectedAircraftPrimaryMedia = computed(() => {
  const media = selectedAircraftMediaAssets.value
  return media.find((asset) => asset.kind === 'image') || media[0] || null
})

const selectedAircraftGalleryMedia = computed(() => {
  const primaryId = selectedAircraftPrimaryMedia.value?.id
  return selectedAircraftMediaAssets.value.filter((asset) => asset.id !== primaryId)
})

function selectRelativeAircraft(direction = 1) {
  if (!filteredAircraft.value.length || selectedAircraftIndex.value < 0) return
  const nextIndex = (selectedAircraftIndex.value + direction + filteredAircraft.value.length) % filteredAircraft.value.length
  selectedAircraft.value = filteredAircraft.value[nextIndex]
  detailTab.value = 'general'
  void scrollDetailSection('general')
}

watch(
  () => props.aircraft,
  () => {
    if (selectedAircraft.value) {
      const refreshedSelectedAircraft =
        props.aircraft.find((item) => Number(item.id) === Number(selectedAircraft.value.id)) || null
      selectedAircraft.value = refreshedSelectedAircraft
    }
    if (openActionMenuId.value && !props.aircraft.some((item) => item.id === openActionMenuId.value)) {
      openActionMenuId.value = null
    }
  },
)

watch(
  () => selectedAircraft.value?.id || 0,
  (aircraftId) => {
    checklistError.value = ''
    checklistUnsupported.value = false
    if (!aircraftId) {
      Object.keys(checklistDraft).forEach((key) => delete checklistDraft[key])
      checklistLoadedAircraftId.value = 0
      checklistDirty.value = false
      return
    }

    void loadChecklistForAircraft(aircraftId)
  },
)

watch(
  () => props.activationRefreshVersion,
  () => {
    if (selectedAircraft.value?.id) {
      void loadChecklistForAircraft(selectedAircraft.value.id)
    }
  },
)

watch(
  () => [route.query.providerId, route.query.providerName, props.aircraft.length],
  () => {
    const providerIdQuery = routeProviderIdValue()
    const providerNameQuery = String(route.query.providerName || '').trim()

    if (!providerIdQuery && !providerNameQuery) return

    const matchedAircraft = props.aircraft.find((item) => {
      if (providerIdQuery > 0) {
        return providerIdValue(item) === providerIdQuery
      }

      return providerName(item) === providerNameQuery
    })

    if (!matchedAircraft) return

    const matchedProviderName = providerName(matchedAircraft)
    if (matchedProviderName && companyFilter.value !== matchedProviderName) {
      companyFilter.value = matchedProviderName
    }
  },
  { immediate: true },
)

watch(
  () => companyGroups.value.map((group) => group.name),
  (names) => {
    const nextExpanded = expandedCompanyGroups.value.filter((name) => names.includes(name))
    if (!nextExpanded.length && names.length) {
      expandedCompanyGroups.value = [names[0]]
      return
    }
    if (nextExpanded.length !== expandedCompanyGroups.value.length) {
      expandedCompanyGroups.value = nextExpanded
    }
  },
  { immediate: true },
)
</script>

<template>
  <section v-if="mode === 'subscriptions'" class="aircraft-page">
    <div class="surface page-head">
      <div>
        <span class="eyebrow">Suscripciones por avion</span>
        <h3>Cobro y vigencias por aeronave</h3>
        <p class="muted">Cada avion vive con su propia suscripcion y referencia de pago.</p>
      </div>
    </div>

    <div class="subscription-grid">
      <article v-for="item in subscriptions" :key="item.id" class="surface subscription-card">
        <span class="badge">{{ item.plan?.name || 'Plan' }}</span>
        <h4>{{ item.aircraft?.registration || 'Aeronave' }} · {{ item.aircraft?.model || 'N/D' }}</h4>
        <p class="muted">{{
          item.aircraft?.provider?.commercial_name ||
            item.aircraft?.provider?.company_name ||
            item.provider?.commercial_name ||
            item.provider?.company_name
        }}</p>
        <div class="meta-grid">
          <div>
            <span>Estado</span>
            <strong>{{ aircraftSubscriptionStatusLabel(item) }}</strong>
          </div>
          <div>
            <span>Periodo</span>
            <strong>{{ item.starts_at?.slice(0, 10) }} a {{ item.ends_at?.slice(0, 10) }}</strong>
          </div>
          <div>
            <span>Pago</span>
            <strong>{{ item.payment_provider }}</strong>
          </div>
          <div>
            <span>Referencia</span>
            <strong>{{ item.payment_reference }}</strong>
          </div>
        </div>
      </article>
    </div>
  </section>

  <section v-else class="aircraft-admin-shell">
    <div class="aircraft-command">
      <header class="command-hero">
        <div>
          <span class="eyebrow">Dashboard aeronaves</span>
          <h2>Control de la flota</h2>
          <p>Revision ejecutiva de aprobacion, documentos, pago y estado operativo.</p>
        </div>
        <button type="button" class="admin-button admin-button--download" @click="exportAircraftCsv">
          <span class="admin-button__icon" aria-hidden="true">⬇</span>
          <span>Exportar</span>
        </button>
      </header>

      <div v-if="sectionStatusItems.length || sectionErrorMessages.length" class="section-runtime-panel">
        <p v-if="sectionStatusItems.length" class="section-runtime-copy">
          {{ sectionStatusItems.join(' · ') }}
        </p>
        <p v-for="message in sectionErrorMessages" :key="message" class="section-runtime-error">
          {{ message }}
        </p>
      </div>

      <div class="kpi-grid" aria-label="Resumen de aeronaves">
        <article v-for="item in kpis" :key="item.label" :class="['kpi-card', `tone-${item.tone}`]">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
          <small>{{ item.progress }}%</small>
          <div class="kpi-progress-track">
            <div class="kpi-progress-fill" :style="{ width: `${item.progress}%` }"></div>
          </div>
        </article>
      </div>

      <section class="filter-panel">
        <div class="search-row">
          <label>
            <span>Buscar</span>
            <input v-model="searchTerm" type="search" placeholder="Buscar matricula, modelo o empresa..." />
          </label>
        </div>

        <div class="primary-filters">
          <div class="toolbar-select-grid">
            <label class="toolbar-field">
              <span>Empresa</span>
              <select v-model="companyFilter">
                <option v-for="company in companyOptions" :key="company" :value="company">
                  {{ company }} ({{ companyCounts[company] || 0 }})
                </option>
              </select>
            </label>

            <label class="toolbar-field">
              <span>Estado</span>
              <select v-model="approvalFilter">
                <option v-for="option in approvalOptions" :key="option" :value="option">
                  {{ option }}
                </option>
              </select>
            </label>

            <label class="toolbar-field">
              <span>Documentacion</span>
              <select v-model="documentsFilter">
                <option v-for="option in documentOptions" :key="option" :value="option">
                  {{ option }}
                </option>
              </select>
            </label>

            <button type="button" class="admin-button admin-button--outline more-filters-toggle" :class="{ active: showAdvancedFilters }" @click="showAdvancedFilters = !showAdvancedFilters">
              <span class="admin-button__icon" aria-hidden="true">{{ showAdvancedFilters ? '−' : '+' }}</span>
              <span>Mas filtros</span>
            </button>
          </div>
        </div>

        <div v-if="showAdvancedFilters" class="filter-groups filter-groups-advanced">
          <label class="toolbar-field sort-control">
            <span>Orden</span>
            <select v-model="sortMode">
              <option v-for="item in sortOptions" :key="item.value" :value="item.value">
                {{ item.label }}
              </option>
            </select>
          </label>
        </div>

        <div class="results-toolbar">
          <div class="results-copy">
            <strong>{{ filteredAircraft.length }} aeronaves visibles</strong>
            <small>Vista operativa compacta para revision, documentos y estado comercial.</small>
          </div>
          <div class="results-chips">
            <span>Empresa: {{ companyFilter }}</span>
            <span>Estado: {{ approvalFilter }}</span>
          </div>
        </div>

        <div v-if="activeFilters.length" class="active-filter-row">
          <span v-for="filter in activeFilters" :key="filter">{{ filter }}</span>
          <button type="button" @click="clearFilters">Limpiar filtros</button>
        </div>
      </section>

      <div v-if="!filteredAircraft.length" class="empty-state">
        <strong>No hay aeronaves con estos filtros.</strong>
        <button type="button" @click="clearFilters">Mostrar todo</button>
      </div>

      <section v-for="group in companyGroups" :key="group.name" class="company-group">
        <button
          type="button"
          class="company-head"
          :class="{ expanded: isCompanyExpanded(group.name) }"
          @click="toggleCompanyGroup(group.name)"
        >
          <div class="company-head-leading">
            <span class="company-head-chevron">{{ isCompanyExpanded(group.name) ? '▼' : '▶' }}</span>
            <div class="company-avatar">{{ companyInitials(group.name) }}</div>
            <div class="company-head-copy">
              <h3>{{ group.name }}</h3>
              <p>{{ group.items.length }} aeronaves</p>
            </div>
          </div>
          <div class="company-head-metrics">
            <span>{{ group.items.length }} aeronaves</span>
            <span>Cumplimiento {{ group.compliance }}%</span>
            <span :class="['company-status-pill', `company-status-pill-${providerOverallStatus(group).tone}`]">
              {{ providerOverallStatus(group).label }}
            </span>
          </div>
        </button>

        <div v-if="isCompanyExpanded(group.name)" class="aircraft-grid">
          <article
            v-for="item in group.items"
            :key="item.id"
            class="aircraft-card"
            @click="selectAircraft(item)"
          >
            <div :class="['aircraft-photo', { 'aircraft-photo-empty': !primaryAircraftImage(item) }]">
              <img
                v-if="primaryAircraftImage(item)"
                :src="primaryAircraftImage(item)"
                :alt="`Imagen de ${aircraftName(item)}`"
                loading="lazy"
              />
              <span v-else>Imagen pendiente</span>
            </div>

            <div class="aircraft-card-body">
              <div class="aircraft-title">
                <h4>{{ aircraftName(item) }}</h4>
                <span>{{ item.registration || 'Sin matricula' }}</span>
              </div>

              <div class="aircraft-facts">
                <p>📍 {{ baseLabel(item) }}</p>
                <p>✈ {{ item.type || item.category || 'Jet ejecutivo' }}</p>
                <p class="aircraft-state-line">Estado: {{ statusChip(item).label }}</p>
              </div>

              <div class="status-list compact-status-list compact-status-list-single">
                <span :class="['chip', `chip-${statusChip(item).tone}`]">
                  {{ statusChip(item).label }}
                </span>
                <span :class="['chip', `chip-${docsChip(item).tone}`]">
                  Docs {{ documentCompletion(item).completed }}/{{ documentCompletion(item).total }}
                </span>
                <span :class="['chip', `chip-${readinessTone(item)}`]">
                  Checklist {{ aircraftChecklistPercent(item) }}%
                </span>
              </div>

              <div class="aircraft-readiness-copy">
                <p>{{ readinessHeadline(item) }}</p>
                <small>{{ readinessDescription(item) }}</small>
              </div>

              <div class="document-progress compact-document-progress">
                <div class="document-progress-copy compact-document-progress-copy">
                  <small>Ultima actualizacion</small>
                  <strong>{{ formatDate(item.updated_at || item.created_at) }}</strong>
                </div>
              </div>

              <div class="card-foot compact-card-foot">
                <div class="card-foot-actions">
                  <button type="button" class="admin-button admin-button--outline" @click.stop="openAircraftDetail(item, 'general')">
                    <span class="admin-button__icon" aria-hidden="true">📄</span>
                    <span>Abrir</span>
                  </button>
                  <button type="button" class="admin-button admin-button--neutral secondary-card-button" @click.stop="openAircraftDetail(item, 'checklist')">
                    <span class="admin-button__icon" aria-hidden="true">✏</span>
                    <span>Editar</span>
                  </button>
                </div>
                <button type="button" class="admin-button admin-button--icon admin-button--neutral card-menu-trigger" aria-label="Mas acciones" @click.stop="toggleActionMenu(item.id)">⋯</button>
              </div>
            </div>

            <div v-if="openActionMenuId === item.id" class="card-action-menu" @click.stop>
              <button type="button" class="admin-button admin-button--outline admin-button--menu" @click="runCardAction('view', item)">
                <span class="admin-button__icon" aria-hidden="true">📄</span>
                <span>Abrir detalle</span>
              </button>
              <button
                type="button"
                :class="['admin-button', aircraftIsActive(item) ? 'admin-button--reject' : 'admin-button--approve', 'admin-button--menu']"
                :disabled="props.activatingAircraftId === Number(item.id)"
                :aria-busy="props.activatingAircraftId === Number(item.id)"
                @click="runCardAction(aircraftIsActive(item) ? 'deactivate' : 'activate', item)"
              >
                <span v-if="props.activatingAircraftId === Number(item.id)" class="button-spinner" aria-hidden="true"></span>
                <span v-else class="admin-button__icon" aria-hidden="true">{{ aircraftIsActive(item) ? '⛔' : '✔' }}</span>
                <span>{{ props.activatingAircraftId === Number(item.id) ? 'Activando aeronave...' : aircraftIsActive(item) ? 'Desactivar aeronave' : 'Activar aeronave' }}</span>
              </button>
              <button type="button" class="admin-button admin-button--reject admin-button--menu" @click="runCardAction('reject', item)">
                <span class="admin-button__icon" aria-hidden="true">✕</span>
                <span>Rechazar</span>
              </button>
              <button type="button" class="admin-button admin-button--suspend admin-button--menu" @click="runCardAction('suspend', item)">
                <span class="admin-button__icon" aria-hidden="true">⛔</span>
                <span>Suspender</span>
              </button>
            </div>
          </article>
        </div>
      </section>
    </div>

    <Transition name="drawer-fade">
      <section v-if="selectedAircraft" class="detail-fullscreen" aria-label="Detalle de aeronave">
        <header class="detail-header">
          <div class="detail-header-left">
            <button type="button" class="detail-back" @click="closeDrawer">← Regresar</button>
            <div>
              <span class="mini-label">{{ selectedAircraft.registration || 'Sin matricula' }}</span>
              <h3>{{ aircraftName(selectedAircraft) }}</h3>
              <p>{{ providerName(selectedAircraft) }} · {{ baseLabel(selectedAircraft) }}</p>
            </div>
          </div>
          <div class="detail-header-right">
            <button type="button" class="detail-nav" @click="selectRelativeAircraft(-1)">Anterior</button>
            <button type="button" class="detail-nav" @click="selectRelativeAircraft(1)">Siguiente</button>
            <span :class="['chip', `chip-${statusChip(selectedAircraft).tone}`]">{{ statusChip(selectedAircraft).label }}</span>
          </div>
        </header>

        <div class="detail-body">
          <section class="detail-dashboard-grid detail-dashboard-grid-top" data-detail-section="general">
            <article class="detail-panel detail-panel-gallery">
              <div class="detail-section-heading">
                <div>
                  <span class="mini-label">Galeria</span>
                  <h4>Galeria operativa</h4>
                </div>
              </div>

              <button
                type="button"
                :class="['detail-hero-media', { 'drawer-media-empty': !selectedAircraftPrimaryMedia }]"
                @click="selectedAircraftPrimaryMedia ? previewMediaAsset(selectedAircraftPrimaryMedia) : null"
              >
                <img
                  v-if="selectedAircraftPrimaryMedia && selectedAircraftPrimaryMedia.kind === 'image'"
                  :src="selectedAircraftPrimaryMedia.url"
                  :alt="selectedAircraftPrimaryMedia.title"
                  class="hero-image"
                />
                <video
                  v-else-if="selectedAircraftPrimaryMedia && selectedAircraftPrimaryMedia.kind === 'video'"
                  :src="selectedAircraftPrimaryMedia.url"
                  class="hero-image"
                  muted
                ></video>
                <div v-else-if="selectedAircraftPrimaryMedia && selectedAircraftPrimaryMedia.kind === 'pdf'" class="detail-media-placeholder">
                  <strong>PDF</strong>
                  <small>{{ selectedAircraftPrimaryMedia.title }}</small>
                </div>
                <span v-else>✈</span>
              </button>

              <div v-if="selectedAircraftGalleryMedia.length" class="detail-media-thumb-grid">
                <button
                  v-for="asset in selectedAircraftGalleryMedia"
                  :key="asset.id"
                  type="button"
                  class="detail-media-thumb"
                  @click="previewMediaAsset(asset)"
                >
                  <img v-if="asset.kind === 'image'" :src="asset.url" :alt="asset.title" loading="lazy" />
                  <div v-else class="detail-media-thumb-badge">
                    <strong>{{ asset.kind === 'video' ? 'Play' : 'PDF' }}</strong>
                  </div>
                  <span>{{ asset.title }}</span>
                </button>
              </div>
            </article>

            <article class="detail-panel detail-panel-executive">
              <div class="detail-section-heading">
                <div>
                  <span class="mini-label">Resumen Ejecutivo</span>
                  <h4>Estado comercial</h4>
                </div>
              </div>

              <div class="drawer-chips">
                <span :class="['chip', `chip-${statusChip(selectedAircraft).tone}`]">{{ statusChip(selectedAircraft).label }}</span>
                <span :class="['chip', `chip-${docsChip(selectedAircraft).tone}`]">{{ docsChip(selectedAircraft).label }}</span>
                <span :class="['chip', `chip-${billingChip(selectedAircraft).tone}`]">{{ billingChip(selectedAircraft).label }}</span>
                <span :class="['chip', `chip-${operationalChip(selectedAircraft).tone}`]">{{ operationalChip(selectedAircraft).label }}</span>
              </div>

              <div class="executive-stats-grid">
                <div
                  v-for="metric in detailStatusRows(selectedAircraft)"
                  :key="metric.label"
                  :class="['executive-stat-card', metric.tone ? `tone-${metric.tone}` : '']"
                >
                  <span>{{ metric.label }}</span>
                  <strong>{{ metric.value }}</strong>
                </div>
              </div>

              <div class="drawer-readiness-block">
                <strong>{{ readinessHeadline(selectedAircraft) }}</strong>
                <p>{{ readinessDescription(selectedAircraft) }}</p>
                <div v-if="aircraftReadiness(selectedAircraft).missing.length" class="missing-tags">
                  <span v-for="field in aircraftReadiness(selectedAircraft).missing" :key="field">
                    {{ missingFieldLabel(field) }}
                  </span>
                </div>
              </div>

              <div
                v-if="!aircraftIsActive(selectedAircraft) && activationRequirements(selectedAircraft).length"
                class="drawer-required-actions"
              >
                <strong>Acciones requeridas</strong>
                <p v-if="primaryAdminAction(selectedAircraft) === 'approve_provider'">El proveedor está pendiente de aprobación administrativa.</p>
                <p v-else-if="primaryAdminAction(selectedAircraft) === 'approve_aircraft'">Aeronave pendiente de aprobación administrativa.</p>
                <p v-else-if="primaryAdminAction(selectedAircraft) === 'activate_aircraft'">La aeronave está aprobada y lista para activación.</p>
                <ul class="required-actions-list">
                  <li
                    v-for="requirement in activationRequirements(selectedAircraft)"
                    :key="typeof requirement === 'string' ? requirement : requirement.code"
                  >
                    {{ typeof requirement === 'string' ? missingFieldLabel(normalizeMissingRequirement(requirement)) : requirement.label }}
                  </li>
                </ul>
                <div class="detail-inline-actions">
                  <button
                    v-if="primaryAdminAction(selectedAircraft) === 'approve_provider'"
                    type="button"
                    class="admin-button admin-button--approve"
                    @click="$emit('approve-provider', selectedAircraft.provider?.id || selectedAircraft.provider_id)"
                  >
                    <span class="admin-button__icon" aria-hidden="true">✔</span>
                    <span>Aprobar proveedor</span>
                  </button>
                  <button
                    v-else-if="primaryAdminAction(selectedAircraft) === 'approve_aircraft'"
                    type="button"
                    class="admin-button admin-button--approve"
                    @click="$emit('approve-aircraft', selectedAircraft.id)"
                  >
                    <span class="admin-button__icon" aria-hidden="true">✔</span>
                    <span>Aprobar aeronave</span>
                  </button>
                  <button
                    v-if="primaryAdminAction(selectedAircraft) === 'activate_aircraft' && (hasActivationRequirement(selectedAircraft, 'tarifa') || hasActivationRequirement(selectedAircraft, 'rango'))"
                    type="button"
                    class="admin-button admin-button--outline"
                    @click="openAircraftDetail(selectedAircraft, 'pricing')"
                  >
                    <span class="admin-button__icon" aria-hidden="true">✏</span>
                    <span>Editar aeronave</span>
                  </button>
                  <button
                    v-if="primaryAdminAction(selectedAircraft) === 'activate_aircraft' && hasActivationRequirement(selectedAircraft, 'documentacion')"
                    type="button"
                    class="admin-button admin-button--outline"
                    @click="scrollDetailSection('documents')"
                  >
                    <span class="admin-button__icon" aria-hidden="true">📄</span>
                    <span>Revisar documentos</span>
                  </button>
                </div>
              </div>
            </article>

            <article class="detail-panel detail-panel-settings">
              <div class="detail-section-heading">
                <div>
                  <span class="mini-label">Informacion General</span>
                  <h4>Ficha de aeronave</h4>
                </div>
              </div>

              <div class="settings-list">
                <div v-for="row in detailGeneralRows(selectedAircraft)" :key="row.label" class="settings-row">
                  <span>{{ row.label }}</span>
                  <strong :class="row.tone ? `text-${row.tone}` : ''">{{ row.value }}</strong>
                </div>
              </div>
            </article>
          </section>

          <section class="detail-dashboard-grid detail-dashboard-grid-middle" data-detail-section="checklist">
            <article class="detail-panel detail-panel-checklist">
              <div class="detail-section-heading">
                <div>
                  <span class="mini-label">Checklist documental</span>
                  <h4>{{ selectedAircraftChecklistSummary.completed }}/{{ selectedAircraftChecklistSummary.total }} completos</h4>
                </div>
                <span :class="['chip', `chip-${checklistStateMeta(selectedAircraftChecklistSummary.status).tone}`]">
                  {{ selectedAircraftChecklistSummary.percent }}%
                </span>
              </div>

              <div class="checklist-progress-track">
                <span class="checklist-progress-fill" :style="{ width: `${selectedAircraftChecklistSummary.percent}%` }"></span>
              </div>

              <p v-if="checklistLoading" class="documents-empty">Cargando checklist administrativo...</p>
              <p v-else-if="checklistError" class="document-error">{{ checklistError }}</p>
              <p v-else-if="checklistUnsupported" class="documents-empty">
                El backend todavia no expone la persistencia del checklist para esta aeronave.
              </p>

              <div class="checklist-toolbar">
                <button type="button" class="admin-button admin-button--primary admin-button--save" :disabled="checklistSaving || checklistLoading || checklistUnsupported" @click="saveChecklist">
                  <span v-if="checklistSaving" class="button-spinner" aria-hidden="true"></span>
                  <span v-else class="admin-button__icon" aria-hidden="true">💾</span>
                  <span>{{ checklistSaving ? 'Guardando cambios...' : 'Guardar cambios' }}</span>
                </button>
                <button type="button" class="admin-button admin-button--neutral" :disabled="checklistLoading" @click="resetChecklistDraft">
                  <span class="admin-button__icon" aria-hidden="true">↺</span>
                  <span>Restablecer</span>
                </button>
              </div>

              <div class="compact-checklist-list">
                <article
                  v-for="item in selectedAircraftChecklistSections.find((section) => section.id === 'documents')?.items || []"
                  :key="item.id"
                  :class="['compact-checklist-item', `tone-${checklistStateMeta(item.state).tone}`]"
                >
                  <div class="compact-checklist-item-head">
                    <span class="compact-checklist-icon">
                      {{ item.state === 'approved' || item.state === 'not_applicable' ? '✔' : item.state === 'rejected' ? '✕' : '⚠' }}
                    </span>
                    <div>
                      <strong>{{ item.label }}</strong>
                      <small>{{ checklistStateMeta(item.state).label }}</small>
                    </div>
                  </div>
                  <label class="checklist-state-select">
                    <span>Estado</span>
                    <select :value="item.state" @change="updateChecklistItemState(item.id, $event.target.value)">
                      <option value="pending">Pendiente</option>
                      <option value="approved">Aprobado</option>
                      <option value="rejected">Rechazado</option>
                      <option value="missing">Faltante</option>
                    </select>
                  </label>
                </article>
              </div>
            </article>

            <article class="detail-panel detail-panel-documents" data-detail-section="documents">
              <div class="detail-section-heading">
                <div>
                  <span class="mini-label">Documentos</span>
                  <h4>Documentos cargados</h4>
                </div>
              </div>

              <div v-if="selectedAircraftDocuments.length" class="document-card-grid">
                <article v-for="document in selectedAircraftDocuments" :key="getAircraftDocumentKey(document)" class="document-card">
                  <div class="document-card-head document-card-head--toolbar">
                    <div class="document-card-head-copy">
                      <strong>{{ document.name }}</strong>
                      <small>{{ documentTypeLabel(document.type) }}</small>
                    </div>
                    <span :class="['chip', `chip-${documentStatusMeta(document).tone}`]">{{ documentStatusMeta(document).label }}</span>
                  </div>
                  <div class="document-card-body">
                    <div class="document-card-meta">
                      <span class="document-card-meta-item">Fecha: {{ formatDate(document.expiresAt) }}</span>
                      <span v-if="document.updatedAt" class="document-card-meta-item">Actualizado: {{ formatDate(document.updatedAt) }}</span>
                    </div>
                    <p v-if="document.notes" class="document-card-note">{{ document.notes }}</p>
                  </div>
                  <div class="document-card-actions">
                    <button
                      v-if="document.fileUrl || document.id"
                      type="button"
                      class="admin-button admin-button--outline"
                      :disabled="downloadingDocumentId === document.id"
                      @click="openAircraftDocument(document)"
                    >
                      <span v-if="downloadingDocumentId === document.id" class="button-spinner" aria-hidden="true"></span>
                      <span v-else class="admin-button__icon" aria-hidden="true">📄</span>
                      <span>{{ downloadingDocumentId === document.id ? 'Abriendo...' : 'Abrir' }}</span>
                    </button>
                    <button
                      v-if="canApproveAircraftDocument(document)"
                      type="button"
                      class="admin-button admin-button--approve"
                      @click="$emit('approve-aircraft-document', { aircraftId: selectedAircraft.id, document })"
                    >
                      <span class="admin-button__icon" aria-hidden="true">✔</span>
                      <span>Aprobar</span>
                    </button>
                    <button
                      v-if="canRejectAircraftDocument(document)"
                      type="button"
                      class="admin-button admin-button--reject"
                      @click="$emit('reject-aircraft-document', { aircraftId: selectedAircraft.id, document })"
                    >
                      <span class="admin-button__icon" aria-hidden="true">✕</span>
                      <span>Rechazar</span>
                    </button>
                    <button v-else type="button" class="admin-button admin-button--neutral admin-button--compact" disabled>
                      <span class="admin-button__icon" aria-hidden="true">🕘</span>
                      <span>Historial</span>
                    </button>
                    <button type="button" class="admin-button admin-button--icon admin-button--neutral document-card-menu-button" disabled aria-label="Mas acciones">⋯</button>
                  </div>
                </article>
              </div>
              <p v-if="documentDownloadError" class="document-error">{{ documentDownloadError }}</p>
              <p v-if="!selectedAircraftDocuments.length" class="documents-empty">No hay documentos cargados para esta aeronave.</p>
            </article>

            <article class="detail-panel detail-panel-operations" data-detail-section="operations">
              <div class="detail-section-heading">
                <div>
                  <span class="mini-label">Operacion</span>
                  <h4>Operacion y auditoria</h4>
                </div>
              </div>

              <div class="settings-list">
                <div v-for="row in detailOperationRows(selectedAircraft)" :key="row.label" class="settings-row">
                  <span>{{ row.label }}</span>
                  <strong :class="row.tone ? `text-${row.tone}` : ''">{{ row.value }}</strong>
                </div>
              </div>

              <div class="timeline-list">
                <div v-for="row in detailHistoryRows(selectedAircraft)" :key="row.label" class="timeline-item">
                  <strong>{{ row.label }}</strong>
                  <small>{{ row.value }}</small>
                </div>
              </div>
            </article>
          </section>

          <section class="detail-dashboard-grid-single" data-detail-section="pricing">
            <article class="detail-panel detail-panel-wide">
              <div class="detail-section-heading">
                <div>
                  <span class="mini-label">Pricing</span>
                  <h4>Informacion comercial</h4>
                </div>
              </div>

              <div class="pricing-card-grid">
                <article v-for="card in detailPricingCards(selectedAircraft)" :key="card.label" class="pricing-info-card">
                  <span>{{ card.label }}</span>
                  <strong>{{ card.value }}</strong>
                </article>
              </div>
            </article>
          </section>

          <section class="detail-dashboard-grid-single" data-detail-section="media">
            <article class="detail-panel detail-panel-wide">
              <div class="detail-section-heading">
                <div>
                  <span class="mini-label">Multimedia</span>
                  <h4>Galeria expandida</h4>
                </div>
              </div>

              <div v-if="selectedAircraftMediaAssets.length" class="detail-media-masonry">
                <button
                  v-for="asset in selectedAircraftMediaAssets"
                  :key="asset.id"
                  type="button"
                  class="detail-media-masonry-item"
                  @click="previewMediaAsset(asset)"
                >
                  <img v-if="asset.kind === 'image'" :src="asset.url" :alt="asset.title" loading="lazy" />
                  <div v-else class="detail-media-masonry-placeholder">
                    <strong>{{ asset.kind === 'video' ? 'Video' : 'PDF' }}</strong>
                    <small>{{ asset.title }}</small>
                  </div>
                </button>
              </div>
              <p v-else class="documents-empty">No hay imagenes, videos o PDFs disponibles para esta aeronave.</p>
            </article>
          </section>
        </div>

        <footer class="detail-footer">
          <div class="detail-footer-copy">
            <small>{{ providerName(selectedAircraft) }} · {{ baseLabel(selectedAircraft) }}</small>
            <small>Actualizacion: {{ formatDate(selectedAircraft.updated_at || selectedAircraft.created_at) }}</small>
          </div>
          <div class="detail-footer-actions">
            <button
              v-if="primaryAdminAction(selectedAircraft) === 'approve_provider'"
              class="admin-button admin-button--approve detail-footer-button"
              type="button"
              @click="$emit('approve-provider', selectedAircraft.provider?.id || selectedAircraft.provider_id)"
            >
              <span class="admin-button__icon" aria-hidden="true">✔</span>
              <span>Aprobar proveedor</span>
            </button>
            <button
              v-else-if="primaryAdminAction(selectedAircraft) === 'approve_aircraft'"
              class="admin-button admin-button--approve detail-footer-button"
              type="button"
              @click="$emit('approve-aircraft', selectedAircraft.id)"
            >
              <span class="admin-button__icon" aria-hidden="true">✔</span>
              <span>Aprobar aeronave</span>
            </button>
            <button
              v-else-if="primaryAdminAction(selectedAircraft) === 'deactivate_aircraft'"
              class="admin-button admin-button--reject detail-footer-button"
              type="button"
              @click="$emit('deactivate-aircraft', selectedAircraft.id)"
            >
              <span class="admin-button__icon" aria-hidden="true">⛔</span>
              <span>Desactivar aeronave</span>
            </button>
            <button
              v-else
              class="admin-button admin-button--approve detail-footer-button"
              type="button"
              :disabled="activationRequirements(selectedAircraft).length > 0 || props.activatingAircraftId === Number(selectedAircraft.id)"
              :title="activationRequirementsLabel(selectedAircraft)"
              :aria-busy="props.activatingAircraftId === Number(selectedAircraft.id)"
              @click="$emit('activate-aircraft', selectedAircraft.id)"
            >
              <span v-if="props.activatingAircraftId === Number(selectedAircraft.id)" class="button-spinner" aria-hidden="true"></span>
              <span v-else class="admin-button__icon" aria-hidden="true">✔</span>
              <span>{{ props.activatingAircraftId === Number(selectedAircraft.id) ? 'Activando aeronave...' : 'Activar aeronave' }}</span>
            </button>
            <button class="admin-button admin-button--reject detail-footer-button" type="button" @click="$emit('reject-aircraft', selectedAircraft.id)">
              <span class="admin-button__icon" aria-hidden="true">✕</span>
              <span>Rechazar</span>
            </button>
            <button class="admin-button admin-button--suspend detail-footer-button" type="button" @click="$emit('suspend-aircraft', selectedAircraft.id)">
              <span class="admin-button__icon" aria-hidden="true">⛔</span>
              <span>Suspender</span>
            </button>
            <button type="button" class="admin-button admin-button--download detail-footer-button" @click="downloadSelectedAircraftSummary">
              <span class="admin-button__icon" aria-hidden="true">⬇</span>
              <span>Descargar resumen</span>
            </button>
          </div>
          <p
            v-if="primaryAdminAction(selectedAircraft) === 'activate_aircraft' && activationRequirements(selectedAircraft).length"
            class="detail-footer-note"
          >
            {{ activationRequirementsLabel(selectedAircraft) }}
          </p>
          <div class="detail-footer-meta">
            <span>Admin: {{ selectedAircraftAdminName(selectedAircraft) }}</span>
            <span>Estado: {{ statusChip(selectedAircraft).label }}</span>
          </div>
        </footer>
      </section>
    </Transition>

    <Transition name="drawer-fade">
      <div v-if="previewDocument" class="document-preview-scrim" @click="closeDocumentPreview"></div>
    </Transition>
    <Transition name="drawer-slide">
      <section v-if="previewDocument" class="document-preview" aria-label="Vista previa de documento">
        <header>
          <div>
            <span class="mini-label">{{ previewDocument.type === 'image' ? 'Imagen' : previewDocument.type === 'video' ? 'Video' : documentTypeLabel(previewDocument.type) }}</span>
            <h3>{{ previewDocument.name }}</h3>
          </div>
          <button type="button" @click="closeDocumentPreview">Cerrar</button>
        </header>
        <img v-if="previewDocument.type === 'image'" :src="previewDocument.url" :alt="previewDocument.name" class="document-preview-image" />
        <video v-else-if="previewDocument.type === 'video'" :src="previewDocument.url" class="document-preview-video" controls autoplay></video>
        <iframe v-else :src="previewDocument.url" :title="previewDocument.name"></iframe>
      </section>
    </Transition>
  </section>
</template>

<style scoped>
.aircraft-page,
.subscription-grid,
.meta-grid {
  display: grid;
  gap: 1rem;
}

.page-head,
.subscription-card {
  padding: 1rem;
}

.subscription-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.subscription-card h4,
.page-head h3 {
  margin: 0;
}

.meta-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 1rem;
}

.meta-grid div {
  display: grid;
  gap: 0.35rem;
}

.meta-grid span {
  color: #9ca3af;
  font-size: 0.8rem;
  text-transform: uppercase;
}

.aircraft-admin-shell {
  display: grid;
  min-height: calc(100vh - 108px);
  color: #0f172a;
  background: #ffffff;
}

.aircraft-command,
.filter-panel,
.aircraft-card,
.empty-state {
  border: 1px solid #e5e7eb;
  background: #ffffff;
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.06);
}

.company-avatar {
  display: grid;
  width: 2.45rem;
  height: 2.45rem;
  place-items: center;
  border-radius: 999px;
  color: #0f172a;
  background: #e0f2fe;
  font-size: 0.8rem;
  font-weight: 900;
}

.command-hero p,
.company-head p,
.aircraft-title p,
.card-foot small,
.drawer-head p,
.drawer-section dt {
  color: #64748b;
}

.aircraft-command {
  display: grid;
  gap: 1rem;
  border-radius: 18px;
  padding: 1.1rem;
  background:
    radial-gradient(circle at top left, rgba(59, 130, 246, 0.08), transparent 24%),
    linear-gradient(180deg, #ffffff, #fbfdff);
}

.command-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.15rem 0.15rem 0;
}

.command-hero h2 {
  margin: 0;
  color: #0f172a;
  font-size: clamp(1.45rem, 2.5vw, 2rem);
  letter-spacing: 0;
}

.command-hero p {
  margin: 0.45rem 0 0;
  max-width: 44rem;
}

.section-runtime-panel {
  display: grid;
  gap: 0.45rem;
  margin: 0.75rem 0 0;
  padding: 0.9rem 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #f8fafc;
}

.section-runtime-copy {
  margin: 0;
  color: #475569;
  font-size: 0.94rem;
  font-weight: 700;
}

.section-runtime-error {
  margin: 0;
  color: #b45309;
  font-size: 0.92rem;
  font-weight: 700;
}

.checklist-overview-panel {
  display: grid;
  gap: 1rem;
}

.checklist-overview-head,
.checklist-item-head,
.checklist-item-actions,
.checklist-toolbar,
.checklist-section-head,
.checklist-item-meta,
.checklist-section-actions {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.9rem;
}

.checklist-overview-score,
.checklist-evidence {
  display: grid;
  gap: 0.25rem;
}

.checklist-overview-score {
  justify-items: end;
  text-align: right;
}

.checklist-overview-score strong,
.checklist-evidence strong {
  color: #0f172a;
}

.checklist-overview-score span,
.checklist-item-meta span,
.checklist-evidence small,
.checklist-section-head small,
.checklist-state-select span {
  color: #64748b;
  font-size: 0.9rem;
}

.checklist-progress-track {
  width: 100%;
  height: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: #e2e8f0;
}

.checklist-progress-track.compact {
  height: 8px;
}

.checklist-progress-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #2563eb 0%, #0f766e 100%);
}

.checklist-toolbar {
  flex-wrap: wrap;
}

.checklist-section-card,
.checklist-item-card {
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  background: #fff;
}

.checklist-section-card {
  display: grid;
  gap: 0.85rem;
  padding: 1rem;
}

.checklist-section-head {
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
}

.checklist-section-head strong,
.checklist-item-title strong,
.checklist-approval-banner strong {
  color: #0f172a;
}

.checklist-requirements {
  display: grid;
  gap: 0.85rem;
}

.checklist-item-card {
  display: grid;
  gap: 0.85rem;
  padding: 1rem;
}

.checklist-item-card.tone-success {
  border-color: #bbf7d0;
  background: #f0fdf4;
}

.checklist-item-card.tone-warning {
  border-color: #fed7aa;
  background: #fff7ed;
}

.checklist-item-card.tone-danger {
  border-color: #fecaca;
  background: #fef2f2;
}

.checklist-item-card.tone-neutral {
  border-color: #e2e8f0;
  background: #f8fafc;
}

.checklist-item-title {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.checklist-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  min-width: 2rem;
  height: 2rem;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
  color: #0f172a;
  font-weight: 800;
}

.checklist-state-select,
.checklist-notes-field {
  min-width: 200px;
}

.checklist-state-select select,
.checklist-notes-field textarea {
  width: 100%;
}

.checklist-item-meta {
  flex-wrap: wrap;
}

.checklist-item-actions {
  align-items: flex-end;
  flex-wrap: wrap;
}

.checklist-notes-field textarea {
  min-height: 84px;
  resize: vertical;
  padding: 0.85rem 1rem;
  border: 1px solid #cbd5e1;
  border-radius: 16px;
  color: #0f172a;
  background: #fff;
  font: inherit;
}

.checklist-approval-banner {
  display: grid;
  gap: 0.35rem;
  padding: 1rem 1.1rem;
  border: 1px solid #bbf7d0;
  border-radius: 18px;
  background: #f0fdf4;
}

.checklist-approval-banner.blocked {
  border-color: #fed7aa;
  background: #fff7ed;
}

.export-button,
.card-foot button,
.filter-panel button,
.empty-state button,
.detail-footer-actions button,
.detail-back,
.detail-nav {
  border: 0;
  border-radius: 999px;
  font-weight: 800;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    background 0.2s ease,
    border-color 0.2s ease;
}

.export-button {
  padding: 0.68rem 0.95rem;
  color: #0f172a;
  background: #f3f6fb;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.85rem;
}

.kpi-card {
  min-height: 5.15rem;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 0.8rem 0.9rem;
  background: rgba(255, 255, 255, 0.9);
}

.kpi-card span {
  color: #64748b;
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
}

.kpi-card strong {
  display: block;
  margin-top: 0.3rem;
  color: #0f172a;
  font-size: 1.55rem;
}

.kpi-card small {
  color: #64748b;
  font-size: 0.82rem;
  font-weight: 800;
}

.kpi-progress-track,
.document-progress-track {
  width: 100%;
  height: 0.42rem;
  overflow: hidden;
  border-radius: 999px;
  background: #e2e8f0;
}

.kpi-progress-fill,
.document-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #2563eb, #38bdf8);
}

.tone-success {
  border-color: rgba(34, 197, 94, 0.3);
}

.tone-warning {
  border-color: rgba(245, 158, 11, 0.35);
}

.tone-danger {
  border-color: rgba(239, 68, 68, 0.35);
}

.tone-info {
  border-color: rgba(59, 130, 246, 0.35);
}

.filter-panel {
  display: grid;
  gap: 0.8rem;
  border-radius: 18px;
  padding: 0.95rem;
  background: rgba(255, 255, 255, 0.88);
}

.primary-filters,
.filter-block,
.compact-actions {
  display: grid;
  gap: 0.75rem;
}

.toolbar-select-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.7rem;
  align-items: end;
}

.toolbar-field {
  display: grid;
  gap: 0.4rem;
}

.filter-block > span,
.compact-actions > div > span,
.sort-control > span,
.toolbar-field > span {
  color: #64748b;
  font-size: 0.74rem;
  font-weight: 900;
  text-transform: uppercase;
}

.filter-row-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.more-filters-toggle {
  justify-self: start;
  border: 1px dashed #cbd5e1;
  border-radius: 999px;
  color: #0f172a;
  background: #f8fafc;
  padding: 0.72rem 0.95rem;
  font-weight: 900;
}

.search-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.75rem;
}

.search-row label,
.sort-control {
  display: grid;
  gap: 0.4rem;
}

.search-row span,
.filter-groups > div > span {
  color: #64748b;
  font-size: 0.74rem;
  font-weight: 900;
  text-transform: uppercase;
}

.search-row input {
  width: 100%;
  min-height: 3rem;
  border: 1px solid #dbe3ef;
  border-radius: 14px;
  color: #0f172a;
  background: #f8fafc;
  padding: 0 1rem;
  font-size: 0.96rem;
  outline: none;
}

.toolbar-field select {
  width: 100%;
  min-height: 2.8rem;
  border: 1px solid #dbe3ef;
  border-radius: 12px;
  color: #0f172a;
  background: #ffffff;
  padding: 0 0.95rem;
  font-size: 0.9rem;
  outline: none;
}

.results-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-top: 1px solid #e5e7eb;
  padding-top: 0.8rem;
}

.results-copy {
  display: grid;
  gap: 0.15rem;
}

.results-copy strong {
  color: #0f172a;
  font-size: 0.96rem;
}

.results-copy small {
  color: #64748b;
}

.results-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.45rem;
}

.results-chips span {
  border: 1px solid #dbe3ef;
  border-radius: 999px;
  color: #334155;
  background: #f8fafc;
  padding: 0.5rem 0.7rem;
  font-size: 0.72rem;
  font-weight: 800;
}

.sort-control > div {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.active-filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.active-filter-row span,
.active-filter-row button {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  border: 1px solid #dbe3ef;
  color: #334155;
  background: #ffffff;
  padding: 0.5rem 0.68rem;
}

.filter-groups {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.filter-groups > div {
  display: grid;
  gap: 0.45rem;
  align-content: flex-start;
}

.filter-groups > div > span {
  width: 100%;
}

.filter-groups-advanced {
  border-top: 1px solid #e5e7eb;
  padding-top: 0.9rem;
}

.active-filter-row span {
  color: #1d4ed8;
  border-color: #bfdbfe;
  background: #eff6ff;
}

.active-filter-row button {
  color: #b91c1c;
  border-color: #fecaca;
  background: #fef2f2;
  font-weight: 900;
}

.company-group {
  display: grid;
  gap: 1rem;
}

.company-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  background:
    linear-gradient(135deg, rgba(248, 250, 252, 0.98), rgba(255, 255, 255, 0.98)),
    #ffffff;
  padding: 0.95rem 1rem;
  text-align: left;
  cursor: pointer;
}

.company-head h3,
.company-head p {
  margin: 0;
}

.company-head h3 {
  color: #0f172a;
}

.company-head-copy {
  flex: 1;
  min-width: 0;
}

.company-head-leading {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-width: 0;
}

.company-head-chevron {
  color: #64748b;
  font-size: 0.76rem;
  font-weight: 900;
}

.company-head-metrics {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.55rem;
}

.company-head-metrics span {
  border: 1px solid #dbe3ef;
  border-radius: 999px;
  color: #334155;
  background: #ffffff;
  padding: 0.45rem 0.75rem;
  font-size: 0.76rem;
  font-weight: 800;
}

.company-status-pill-success {
  border-color: rgba(34, 197, 94, 0.28);
  color: #166534;
  background: rgba(34, 197, 94, 0.1);
}

.company-status-pill-warning {
  border-color: rgba(245, 158, 11, 0.28);
  color: #92400e;
  background: rgba(245, 158, 11, 0.1);
}

.company-status-pill-info {
  border-color: rgba(59, 130, 246, 0.28);
  color: #1d4ed8;
  background: rgba(59, 130, 246, 0.1);
}

.company-status-pill-neutral {
  border-color: rgba(148, 163, 184, 0.3);
  color: #475569;
  background: rgba(148, 163, 184, 0.1);
}

.aircraft-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 24px;
}

.aircraft-card {
  position: relative;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: 90px minmax(0, 1fr);
  width: 100%;
  max-width: 330px;
  min-height: 250px;
  height: 250px;
  align-items: stretch;
  gap: 0;
  overflow: hidden;
  border-radius: 20px;
  padding: 0;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.aircraft-card:hover {
  border-color: rgba(96, 165, 250, 0.36);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.14);
  transform: translateY(-3px);
}

.aircraft-photo {
  position: relative;
  display: grid;
  min-height: 90px;
  max-height: 90px;
  overflow: hidden;
  place-items: center;
  border-radius: 12px 12px 0 0;
  background: #e2e8f0;
}

.aircraft-photo img,
.drawer-media img,
.drawer-gallery img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.aircraft-photo span,
.drawer-media-empty span {
  color: #64748b;
  font-size: 0.78rem;
  font-weight: 900;
  text-transform: uppercase;
}

.aircraft-photo-empty {
  border: 1px dashed #cbd5e1;
}

.aircraft-card-body {
  display: grid;
  grid-template-rows: auto auto auto 1fr auto auto;
  align-content: start;
  gap: 0.45rem;
  min-width: 0;
  padding: 0.85rem 0.9rem 0.8rem;
}

.aircraft-topline,
.card-foot {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.aircraft-title span,
.mini-label {
  color: #2563eb;
  font-size: 0.72rem;
  font-weight: 900;
  text-transform: uppercase;
}

.aircraft-title h4 {
  margin: 0;
  color: #0f172a;
  font-size: 1rem;
  letter-spacing: 0;
  line-height: 1.2;
}

.aircraft-facts {
  display: grid;
  gap: 0.18rem;
}

.aircraft-facts p,
.aircraft-readiness-copy p,
.aircraft-readiness-copy small {
  margin: 0;
}

.aircraft-facts p {
  overflow: hidden;
  color: #475569;
  font-size: 0.79rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.aircraft-state-line {
  color: #0f172a;
  font-weight: 700;
}

.status-list,
.drawer-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.compact-status-list-single {
  flex-wrap: nowrap;
  overflow: hidden;
}

.compact-status-list-single .chip {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  gap: 0.32rem;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  padding: 0.26rem 0.48rem;
  color: #475569;
  background: #f8fafc;
  font-size: 0.68rem;
  font-weight: 900;
}

.chip-success {
  border-color: rgba(34, 197, 94, 0.28);
  color: #166534;
  background: rgba(34, 197, 94, 0.12);
}

.chip-warning {
  border-color: rgba(245, 158, 11, 0.3);
  color: #92400e;
  background: rgba(245, 158, 11, 0.12);
}

.chip-danger {
  border-color: rgba(239, 68, 68, 0.3);
  color: #991b1b;
  background: rgba(239, 68, 68, 0.12);
}

.chip-info {
  border-color: rgba(59, 130, 246, 0.3);
  color: #1d4ed8;
  background: rgba(59, 130, 246, 0.12);
}

.chip-neutral {
  border-color: rgba(148, 163, 184, 0.35);
  color: #475569;
  background: rgba(148, 163, 184, 0.12);
}

.card-foot button {
  color: #1d4ed8;
  background: #eff6ff;
  padding: 0.45rem 0.65rem;
}

.compact-card-foot {
  justify-content: space-between;
  margin-top: auto;
}

.card-foot-actions {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.compact-status-list .chip {
  font-size: 0.66rem;
}

.document-progress {
  display: grid;
  gap: 0.2rem;
}

.aircraft-readiness-copy,
.drawer-readiness-block {
  display: grid;
  gap: 0.15rem;
}

.aircraft-readiness-copy p,
.drawer-readiness-block p {
  margin: 0;
  color: #475569;
  font-size: 0.77rem;
  line-height: 1.35;
}

.aircraft-readiness-copy p {
  color: #0f172a;
  font-weight: 700;
}

.aircraft-readiness-copy small {
  color: #64748b;
  font-size: 0.72rem;
  line-height: 1.25;
}

.readiness-checklist,
.missing-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.readiness-item,
.missing-tags span {
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  border-radius: 999px;
  padding: 0.34rem 0.52rem;
  font-size: 0.69rem;
  font-weight: 900;
}

.readiness-item {
  border: 1px solid #dbe3ef;
  color: #64748b;
  background: rgba(248, 250, 252, 0.92);
}

.readiness-item.complete {
  border-color: rgba(34, 197, 94, 0.24);
  color: #166534;
  background: rgba(34, 197, 94, 0.12);
}

.missing-tags span {
  border: 1px solid rgba(245, 158, 11, 0.24);
  color: #92400e;
  background: rgba(254, 243, 199, 0.7);
}

.document-progress-copy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.compact-document-progress-copy {
  justify-content: flex-start;
}

.document-progress-copy small {
  color: #64748b;
  font-size: 0.72rem;
  font-weight: 800;
}

.document-progress-copy strong {
  color: #0f172a;
  font-size: 0.8rem;
}

.card-menu-trigger {
  border: 1px solid #dbe3ef;
  border-radius: 999px;
  color: #334155;
  background: #ffffff;
  padding: 0.32rem 0.58rem;
  font-size: 0.95rem;
  line-height: 1;
}

.secondary-card-button {
  color: #334155;
  background: #f8fafc;
}

.card-action-menu {
  position: absolute;
  right: 0.8rem;
  bottom: 3.2rem;
  z-index: 5;
  display: grid;
  gap: 0.35rem;
  min-width: 180px;
  border: 1px solid #dbe3ef;
  border-radius: 14px;
  background: #ffffff;
  padding: 0.45rem;
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.18);
}

.card-action-menu button {
  justify-content: flex-start;
  border: 0;
  border-radius: 10px;
  color: #0f172a;
  background: #f8fafc;
  padding: 0.72rem 0.85rem;
  font-weight: 800;
  text-align: left;
}

.card-action-menu button:hover {
  color: #0f172a;
  background: #eef4ff;
}

.action-approve {
  background: #16a34a;
}

.action-reject {
  background: #64748b;
}

.action-suspend {
  background: #dc2626;
}

.export-button:hover,
.card-foot button:hover,
.card-menu-trigger:hover,
.card-action-menu button:hover,
.filter-panel button:hover,
.empty-state button:hover,
.detail-footer-actions button:hover,
.detail-back:hover,
.detail-nav:hover {
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.22);
  transform: translateY(-1px);
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-radius: 8px;
  padding: 1rem;
}

.empty-state button {
  color: #111827;
  background: #bfdbfe;
  padding: 0.7rem 0.9rem;
}

.document-preview-scrim {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(15, 23, 42, 0.55);
}

.detail-fullscreen {
  position: fixed;
  z-index: 41;
  display: grid;
  inset: 0;
  grid-template-rows: auto minmax(0, 1fr) auto;
  color: #0f172a;
  background: #ffffff;
}

.detail-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 80px;
  border-bottom: 1px solid #e5e7eb;
  background: rgba(255, 255, 255, 0.96);
  padding: 1rem 1.5rem;
  backdrop-filter: blur(14px);
}

.detail-header-left,
.detail-header-right,
.detail-footer-actions,
.detail-tabs,
.hero-kpi-list div,
.timeline-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.detail-header-left {
  min-width: 0;
}

.detail-header-left > div {
  min-width: 0;
}

.detail-header h3,
.detail-header p,
.detail-footer-copy strong,
.detail-footer-copy small {
  margin: 0;
}

.detail-back,
.detail-nav {
  border: 1px solid #dbe3ef;
  border-radius: 999px;
  color: #0f172a;
  background: #ffffff;
  padding: 0.72rem 0.95rem;
  font-weight: 800;
}

.detail-body {
  width: min(1700px, 100%);
  height: calc(100vh - 160px);
  overflow-y: auto;
  margin: 0 auto;
  padding: 1.5rem 1.5rem 10rem;
}

.detail-hero-media {
  position: relative;
  min-height: 360px;
  overflow: hidden;
  border-radius: 24px;
  border: 0;
  background:
    linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(15, 118, 110, 0.1)),
    #f8fafc;
  cursor: pointer;
}

.hero-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.detail-panel {
  display: grid;
  gap: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 24px;
  background: linear-gradient(180deg, #ffffff, #fbfdff);
  padding: 24px;
  box-shadow: 0 14px 40px rgba(15, 23, 42, 0.06);
}

.detail-panel-gallery,
.detail-panel-checklist,
.detail-panel-operations {
  align-self: start;
}

.drawer-readiness-block {
  display: grid;
  gap: 0.55rem;
  border-top: 1px solid #eef2f7;
  padding-top: 0.95rem;
}

.drawer-readiness-block strong {
  color: #0f172a;
  font-size: 0.85rem;
}

.detail-dashboard-grid,
.detail-dashboard-grid-single {
  display: grid;
  gap: 24px;
}

.detail-dashboard-grid {
  grid-template-columns: minmax(0, 1.17fr) minmax(0, 1.17fr) minmax(0, 1fr);
  margin-bottom: 24px;
}

.detail-dashboard-grid-middle {
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.45fr) minmax(0, 0.95fr);
}

.detail-dashboard-grid-single {
  grid-template-columns: minmax(0, 1fr);
  margin-bottom: 24px;
}

.detail-panel-wide {
  grid-column: 1 / -1;
}

.detail-panel h4,
.detail-copy,
.detail-section-heading h4 {
  margin: 0;
}

.detail-copy {
  color: #475569;
  line-height: 1.7;
}

.detail-section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.detail-media-placeholder,
.detail-media-masonry-placeholder {
  display: grid;
  place-items: center;
  gap: 0.45rem;
  height: 100%;
  color: #334155;
  text-align: center;
}

.detail-media-placeholder strong,
.detail-media-masonry-placeholder strong {
  font-size: 1.2rem;
}

.detail-media-thumb-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.detail-media-thumb {
  display: grid;
  gap: 0.5rem;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  padding: 0.55rem;
  background: #f8fafc;
  text-align: left;
}

.detail-media-thumb img,
.detail-media-thumb-badge {
  width: 100%;
  height: 88px;
  border-radius: 14px;
}

.detail-media-thumb img {
  object-fit: cover;
}

.detail-media-thumb-badge {
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #0f172a, #334155);
  color: #ffffff;
}

.detail-media-thumb span {
  overflow: hidden;
  color: #475569;
  font-size: 0.74rem;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.executive-stats-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.executive-stat-card,
.pricing-info-card {
  display: grid;
  gap: 0.35rem;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  background: #f8fafc;
  padding: 0.9rem;
}

.executive-stat-card span,
.pricing-info-card span,
.settings-row span {
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 800;
  text-transform: uppercase;
}

.executive-stat-card strong,
.pricing-info-card strong,
.settings-row strong {
  color: #0f172a;
  font-size: 0.92rem;
}

.settings-list {
  display: grid;
  gap: 0.25rem;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid #eef2f7;
  padding: 0.9rem 0;
}

.settings-row:first-child {
  padding-top: 0.2rem;
}

.settings-row:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.document-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
}

.document-summary-card {
  display: grid;
  gap: 0.35rem;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  background: #f8fafc;
  padding: 1rem;
}

.document-summary-card.complete {
  border-color: rgba(34, 197, 94, 0.32);
  background: rgba(34, 197, 94, 0.08);
}

.document-summary-card strong,
.timeline-item strong {
  color: #0f172a;
}

.document-summary-card small,
.timeline-item small {
  color: #64748b;
}

.compact-checklist-list {
  display: grid;
  gap: 0.75rem;
}

.compact-checklist-item {
  display: grid;
  gap: 0.8rem;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  background: #ffffff;
  padding: 0.9rem;
}

.compact-checklist-item-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.compact-checklist-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  min-width: 2rem;
  height: 2rem;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  font-weight: 900;
}

.compact-checklist-item strong,
.document-card-body strong {
  color: #0f172a;
}

.compact-checklist-item small,
.document-card-body small,
.document-card-body p {
  margin: 0;
  color: #64748b;
}

.document-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.document-card {
  display: grid;
  gap: 0.6rem;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  background: #f8fafc;
  padding: 0.85rem;
  align-content: start;
}

.document-card-head,
.document-card-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
}

.document-card-actions {
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.document-card-body {
  display: grid;
  gap: 0.25rem;
}

.timeline-list {
  display: grid;
  gap: 0.85rem;
}

.timeline-item {
  justify-content: space-between;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  background: #f8fafc;
  padding: 1rem;
}

.pricing-card-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.detail-media-masonry {
  column-count: 4;
  column-gap: 16px;
}

.detail-media-masonry-item {
  display: block;
  width: 100%;
  margin-bottom: 16px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 22px;
  background: #f8fafc;
}

.detail-media-masonry-item img {
  width: 100%;
  display: block;
  object-fit: cover;
}

.detail-media-masonry-placeholder {
  min-height: 210px;
  padding: 1rem;
}

.text-success {
  color: #166534;
}

.text-neutral {
  color: #475569;
}

.text-warning {
  color: #92400e;
}

.text-danger {
  color: #991b1b;
}

.text-info {
  color: #1d4ed8;
}

.detail-footer {
  position: sticky;
  bottom: 0;
  z-index: 25;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-top: 1px solid #e5e7eb;
  background: rgba(255, 255, 255, 0.97);
  padding: 1rem 1.5rem;
  backdrop-filter: blur(14px);
}

.detail-footer-actions {
  flex-wrap: wrap;
}

.detail-footer-actions button {
  min-height: 3rem;
  border-radius: 999px;
  padding: 0 1.2rem;
  font-size: 0.92rem;
  font-weight: 900;
  letter-spacing: -0.01em;
}

.detail-footer-actions .export-button {
  background: #eef2ff;
}

.detail-footer-copy {
  display: grid;
  gap: 0.2rem;
}

.detail-footer-copy small {
  color: #64748b;
}

.detail-footer-meta {
  display: grid;
  gap: 0.3rem;
  justify-items: end;
  color: #475569;
  font-size: 0.8rem;
  font-weight: 800;
}

.document-preview {
  position: fixed;
  inset: 3vh 3vw;
  z-index: 51;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 28px 90px rgba(15, 23, 42, 0.35);
}

.document-preview header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid #e5e7eb;
  padding: 0.85rem 1rem;
}

.document-preview h3 {
  margin: 0.15rem 0 0;
  color: #0f172a;
  font-size: 1rem;
}

.document-preview button {
  border: 0;
  border-radius: 8px;
  padding: 0.6rem 0.85rem;
  color: #0f172a;
  background: #f1f5f9;
  font-weight: 900;
}

.document-preview iframe {
  width: 100%;
  height: 100%;
  border: 0;
  background: #f8fafc;
}

.document-preview-image,
.document-preview-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #0f172a;
}

.documents-empty,
.document-missing {
  margin: 0;
  color: #64748b;
  font-size: 0.76rem;
  font-weight: 700;
}

.document-open,
.document-missing {
  flex: 0 0 auto;
  border: 0;
  border-radius: 8px;
  padding: 0.45rem 0.65rem;
  font-size: 0.76rem;
  font-weight: 900;
  text-decoration: none;
}

.document-open {
  color: #ffffff;
  background: #2563eb;
}

.document-open:disabled {
  cursor: wait;
  opacity: 0.7;
}

.document-missing {
  color: #64748b;
  background: #e2e8f0;
}

.documents-empty,
.document-error {
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  padding: 0.75rem;
  background: #f8fafc;
}

.document-error {
  border-color: #fecaca;
  color: #991b1b;
  background: #fef2f2;
}

.drawer-fade-enter-active,
.drawer-fade-leave-active,
.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: all 0.2s ease;
}

.drawer-fade-enter-from,
.drawer-fade-leave-to {
  opacity: 0;
}

.drawer-slide-enter-from,
.drawer-slide-leave-to {
  opacity: 0;
  transform: scale(0.985);
}

@media (max-width: 1180px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .aircraft-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .toolbar-select-grid,
  .filter-groups {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .detail-dashboard-grid,
  .document-summary-grid,
  .document-card-grid,
  .pricing-card-grid {
    grid-template-columns: 1fr;
  }

  .detail-media-masonry {
    column-count: 3;
  }
}

@media (max-width: 760px) {
  .aircraft-command,
  .filter-panel {
    padding: 0.85rem;
  }

  .command-hero,
  .search-row,
  .empty-state {
    display: grid;
  }

  .kpi-grid,
  .aircraft-grid,
  .toolbar-select-grid,
  .filter-groups,
  .subscription-grid,
  .meta-grid {
    grid-template-columns: 1fr;
  }

  .aircraft-card {
    max-width: none;
  }

  .aircraft-photo {
    min-height: 90px;
  }

  .document-preview {
    inset: 0;
    border-radius: 0;
  }

  .results-toolbar,
  .company-head,
  .detail-footer,
  .detail-header,
  .detail-header-left,
  .detail-header-right,
  .detail-footer-actions {
    grid-template-columns: 1fr;
  }

  .detail-header,
  .detail-footer {
    display: grid;
  }

  .detail-body {
    padding: 1rem 1rem 8rem;
  }

  .detail-hero-media,
  .hero-image {
    min-height: 260px;
    height: 260px;
  }

  .detail-dashboard-grid,
  .detail-dashboard-grid-middle,
  .document-card-grid,
  .pricing-card-grid,
  .detail-media-thumb-grid,
  .executive-stats-grid {
    grid-template-columns: 1fr;
  }

  .document-card-actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .results-chips {
    justify-content: flex-start;
  }

  .company-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .company-head-metrics {
    justify-content: flex-start;
  }

  .detail-media-masonry {
    column-count: 1;
  }

  .detail-footer-meta {
    justify-items: start;
  }
}

.admin-button,
.detail-back,
.detail-nav,
.document-preview button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  height: 40px;
  padding: 0 18px;
  border: 1px solid transparent;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
  text-decoration: none;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease,
    opacity 0.2s ease;
}

.admin-button {
  color: #0f172a;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
}

.admin-button__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.96rem;
  line-height: 1;
}

.admin-button--icon {
  width: 40px;
  min-width: 40px;
  padding: 0;
  font-size: 1rem;
}

.admin-button--menu {
  width: 100%;
  justify-content: flex-start;
}

.admin-button--primary {
  border-color: #1d4ed8;
  color: #ffffff;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  box-shadow: 0 10px 24px rgba(37, 99, 235, 0.2);
}

.admin-button--outline,
.detail-back,
.detail-nav {
  border-color: rgba(37, 99, 235, 0.18);
  color: #1d4ed8;
  background: #ffffff;
}

.admin-button--outline:hover,
.detail-back:hover,
.detail-nav:hover {
  background: #eff6ff;
}

.admin-button--approve {
  border-color: #16a34a;
  color: #ffffff;
  background: #16a34a;
  box-shadow: 0 10px 24px rgba(22, 163, 74, 0.18);
}

.admin-button--approve:hover {
  border-color: #15803d;
  background: #15803d;
}

.admin-button--reject {
  border-color: #374151;
  color: #ffffff;
  background: #374151;
  box-shadow: 0 10px 24px rgba(55, 65, 81, 0.18);
}

.admin-button--reject:hover {
  border-color: #1f2937;
  background: #1f2937;
}

.admin-button--suspend {
  border-color: #dc2626;
  color: #ffffff;
  background: #dc2626;
  box-shadow: 0 10px 24px rgba(220, 38, 38, 0.18);
}

.admin-button--suspend:hover {
  border-color: #b91c1c;
  background: #b91c1c;
}

.admin-button--download,
.admin-button--neutral {
  border-color: #e5e7eb;
  color: #374151;
  background: #f3f4f6;
}

.admin-button--download:hover,
.admin-button--neutral:hover {
  background: #e5e7eb;
}

.admin-button--save {
  min-width: 190px;
}

.admin-button:hover,
.detail-back:hover,
.detail-nav:hover,
.document-preview button:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
}

.admin-button:focus-visible,
.detail-back:focus-visible,
.detail-nav:focus-visible,
.document-preview button:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 3px rgba(191, 219, 254, 0.92),
    0 10px 24px rgba(15, 23, 42, 0.12);
}

.admin-button:active,
.detail-back:active,
.detail-nav:active,
.document-preview button:active {
  transform: translateY(0);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
}

.admin-button:disabled,
.detail-back:disabled,
.detail-nav:disabled,
.document-preview button:disabled {
  cursor: not-allowed;
  opacity: 0.58;
  box-shadow: none;
  transform: none;
}

.detail-footer-note {
  margin: 0;
  font-size: 0.9rem;
  color: #92400e;
}

.button-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.34);
  border-top-color: currentColor;
  border-radius: 999px;
  animation: admin-button-spin 0.75s linear infinite;
}

.admin-button--outline .button-spinner,
.admin-button--download .button-spinner,
.admin-button--neutral .button-spinner {
  border-color: rgba(55, 65, 81, 0.2);
  border-top-color: currentColor;
}

@keyframes admin-button-spin {
  to {
    transform: rotate(360deg);
  }
}

.more-filters-toggle {
  justify-self: start;
}

.more-filters-toggle.active {
  border-color: rgba(37, 99, 235, 0.26);
  color: #1d4ed8;
  background: #eff6ff;
}

.card-foot-actions {
  flex-wrap: wrap;
}

.card-menu-trigger {
  font-size: 1rem;
}

.card-action-menu .admin-button {
  box-shadow: none;
}

.checklist-toolbar {
  align-items: center;
}

.document-card {
  gap: 0.7rem;
  border-radius: 18px;
  background: linear-gradient(180deg, #ffffff, #f9fbff);
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.06);
}

.document-card-head--toolbar {
  align-items: center;
}

.document-card-head-copy {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
}

.document-card-head-copy strong {
  color: #0f172a;
  font-size: 0.94rem;
  line-height: 1.2;
  word-break: break-word;
}

.document-card-head-copy small {
  margin: 0;
  color: #64748b;
  font-size: 0.8rem;
}

.document-card-body {
  gap: 0.35rem;
}

.document-card-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-top: 1px solid #e5e7eb;
  padding-top: 0.7rem;
}

.document-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.document-card-meta-item {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0.18rem 0.55rem;
  border-radius: 999px;
  background: #eef4ff;
  color: #526581;
  font-size: 0.78rem;
  line-height: 1.1;
}

.document-card-note {
  display: -webkit-box;
  overflow: hidden;
  color: #64748b;
  font-size: 0.86rem;
  line-height: 1.3;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.document-card-actions .admin-button {
  min-height: 42px;
  padding: 0.58rem 0.7rem;
  font-size: 0.88rem;
  justify-content: flex-start;
}

.document-card-actions .admin-button span:last-child {
  overflow: visible;
  text-overflow: clip;
  white-space: nowrap;
}

.document-card-menu-button {
  justify-self: stretch;
  width: 100%;
  justify-content: center !important;
}

.admin-button--compact {
  opacity: 0.9;
}

.detail-footer-actions {
  flex-wrap: wrap;
  justify-content: center;
}

.detail-footer-button {
  min-width: 205px;
  flex: 1 1 205px;
}

@media (max-width: 760px) {
  .admin-button,
  .detail-back,
  .detail-nav,
  .document-preview button {
    width: 100%;
  }

  .card-foot-actions,
  .document-card-actions,
  .checklist-toolbar,
  .detail-footer-actions {
    display: grid;
    grid-template-columns: 1fr;
    width: 100%;
  }

  .detail-header-right {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .detail-footer-button {
    min-width: 0;
    width: 100%;
  }
}
</style>
