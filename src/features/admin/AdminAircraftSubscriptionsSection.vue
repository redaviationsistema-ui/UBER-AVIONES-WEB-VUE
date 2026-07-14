<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { requestWithCandidates } from '../../lib/backendCrud'
import { resolveMediaUrl } from '../../lib/api'

const props = defineProps({
  aircraft: { type: Array, required: true },
  subscriptions: { type: Array, required: true },
  mode: { type: String, default: 'aircraft' },
})

const route = useRoute()
const router = useRouter()
const emit = defineEmits(['approve-aircraft', 'reject-aircraft', 'suspend-aircraft'])

const companyFilter = ref('Todas')
const approvalFilter = ref('Todas')
const matchingFilter = ref('Todos')
const documentsFilter = ref('Todos')
const trialFilter = ref('Todos')
const searchTerm = ref('')
const sortMode = ref('recent')
const showAdvancedFilters = ref(false)
const openActionMenuId = ref(null)
const selectedAircraft = ref(null)
const detailTab = ref('general')
const downloadingDocumentId = ref('')
const documentDownloadError = ref('')
const previewDocument = ref(null)

const approvalOptions = ['Todas', 'Aprobadas', 'Pendientes', 'Suspendidas']
const matchingOptions = ['Todos', 'Visibles', 'Bloqueados']
const documentOptions = ['Todos', 'Validos', 'Pendientes', 'Incompletos', 'Rechazados', 'Vencidos']
const trialOptions = ['Todos', 'Trial activo', 'Trial vencido', 'Sin trial']
const sortOptions = [
  { label: 'Mas recientes', value: 'recent' },
  { label: 'Trial proximo', value: 'trial' },
  { label: 'Nombre A-Z', value: 'az' },
  { label: 'Aprobadas primero', value: 'approved' },
]
const detailTabs = [
  { id: 'general', label: 'General' },
  { id: 'documents', label: 'Documentacion' },
  { id: 'operations', label: 'Operacion' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'media', label: 'Multimedia' },
]

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
  return String(
    item.provider_id || item.proveedor_id || item.provider?.id || item.provider?.provider_id || '',
  ).trim()
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

function buildAircraftDocumentIdentity(record = {}, index = 0) {
  if (record.storage_path != null && String(record.storage_path).trim() !== '') return `storage:${record.storage_path}`
  if (record.file_path != null && String(record.file_path).trim() !== '') return `path:${record.file_path}`
  if (record.path != null && String(record.path).trim() !== '') return `path:${record.path}`
  if (record.file_url != null && String(record.file_url).trim() !== '') return `url:${record.file_url}`
  if (record.document_url != null && String(record.document_url).trim() !== '') return `url:${record.document_url}`
  if (record.id != null && String(record.id).trim() !== '') return `id:${record.id}`
  if (record.uuid != null && String(record.uuid).trim() !== '') return `uuid:${record.uuid}`
  return `index:${index}:${record.document_name || record.name || record.file_name || 'documento'}`
}

function aircraftDocuments(item = {}) {
  const documents = [
    ...normalizeDocumentCollection(item.documents),
    ...normalizeDocumentCollection(item.aircraft_documents),
    ...normalizeDocumentCollection(item.aircraftDocuments),
    ...normalizeDocumentCollection(item.documentos),
    ...normalizeDocumentCollection(item.files),
    ...normalizeDocumentCollection(item.attachments),
  ]

  const normalizedDocuments = documents
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
        identityKey: buildAircraftDocumentIdentity(record, index),
        id: record.id || record.uuid || `document-${index}`,
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

  return [...new Map(normalizedDocuments.map((document) => [document.identityKey, document])).values()]
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

function isPrivateStorageUrl(url = '') {
  return /amazonaws\.com|s3[.-]|red-aviation-images/i.test(String(url || ''))
}

function cleanDownloadError(error) {
  const status = Number(error?.status || 0)
  if (status === 404 || /Rutas probadas|could not be found|route .* could not be found/i.test(error?.message || '')) {
    return 'El backend todavia no tiene registrada la ruta para abrir documentos privados. Agrega la ruta de descarga autenticada en Laravel y vuelve a intentar.'
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
  const headers = ['Matricula', 'Aeronave', 'Proveedor', 'Base', 'Estatus', 'Documentos', 'Trial']
  const rows = filteredAircraft.value.map((item) => [
    item.registration || '',
    aircraftName(item),
    providerName(item),
    baseLabel(item),
    statusChip(item).label,
    docsChip(item).label,
    trialChip(item).label,
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
    `Trial: ${trialChip(item).label}`,
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
  return String(value || '').toLowerCase()
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
  return hasTextValue(item.base_airport || item.base || item.airport || item.location || item.base_airport_code)
}

function hasRegistration(item) {
  return hasTextValue(item.registration || item.tail_number || item.matricula)
}

function hasCapacityValue(item) {
  return numericValue(item.capacity || item.passenger_capacity || item.pax) > 0
}

function hasHourlyRateValue(item) {
  return numericValue(item.hourly_rate || item.hourlyPrice || item.hourly_price || item.price_per_hour) > 0
}

function hasRangeValue(item) {
  return numericValue(item.range_km || item.rangeKm || item.range || item.max_range_km) > 0
}

function normalizedAircraftReviewStatus(item = {}) {
  return normalizeStatus(item.review_status || item.validation_status || item.approval_status || '')
}

function hasApprovedMarker(item = {}) {
  return Boolean(item.approved_at || item.approvedAt || item.approved === true)
}

function isApproved(item) {
  const status = normalizeStatus(item.status || '')
  const reviewStatus = normalizedAircraftReviewStatus(item)
  return (
    hasApprovedMarker(item) ||
    reviewStatus === 'approved' ||
    ['active', 'approved', 'aprobada', 'aprobado', 'trial_active'].includes(status)
  )
}

function isSuspended(item) {
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
  return normalizeStatus(item.billing_status || item.billingStatus || item.subscription_status || item.subscriptionStatus || '')
}

function hasActiveBilling(item = {}) {
  const status = billingStatusKey(item)
  return ['active', 'trialing', 'paid', 'vigente'].includes(status)
}

function hasPendingPayment(item = {}) {
  const status = billingStatusKey(item)
  return ['pending_payment', 'pending', 'inactive'].includes(status) && isApproved(item) && !hasActiveBilling(item)
}

function hasValidDocuments(item) {
  return resolveAircraftDocumentValidation(item).allApproved
}

function documentsState(item) {
  const validation = resolveAircraftDocumentValidation(item)
  if (validation.status === 'approved') return 'Validos'
  if (validation.status === 'expired') return 'Vencidos'
  if (validation.status === 'rejected') return 'Rechazados'
  if (validation.status === 'pending') return 'Pendientes'
  return 'Incompletos'
}

function trialState(item) {
  const status = normalizeStatus(item.status)
  if (!item.trial_ends_at && !status.includes('trial')) return 'Sin trial'
  if (status.includes('trial') && !status.includes('expired')) return 'Trial activo'
  if (!item.trial_ends_at) return 'Trial activo'

  const trialDate = new Date(item.trial_ends_at)
  if (Number.isNaN(trialDate.getTime())) return 'Trial activo'
  return trialDate >= new Date() ? 'Trial activo' : 'Trial vencido'
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

function matchingVisibilityFlag(item) {
  const candidate = item.matching_visible ?? item.matchingVisible ?? item.marketplace_visible ?? item.visible_for_matching
  if (candidate == null) return null
  if (typeof candidate === 'boolean') return candidate
  return ['1', 'true', 'visible', 'activo', 'active', 'approved'].includes(normalizeStatus(candidate))
}

function matchingVisible(item) {
  const validation = resolveAircraftDocumentValidation(item)
  const commerciallyEligible =
    isApproved(item) &&
    validation.allApproved &&
    hasActiveBilling(item) &&
    ['trial_active', 'active', 'approved'].includes(normalizeStatus(item.status))
  const explicitVisibility = matchingVisibilityFlag(item)
  if (explicitVisibility !== null) return explicitVisibility && commerciallyEligible
  return commerciallyEligible
}

function aircraftMissingFields(item) {
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
  const missing = aircraftMissingFields(item)
  const approved = isApproved(item)
  const suspended = isSuspended(item)
  const documentValidation = resolveAircraftDocumentValidation(item)
  const documented = documentValidation.allApproved
  const baseRegistered = hasRegisteredBase(item)
  const visibleForMatching = matchingVisible(item)
  const billingPending = hasPendingPayment(item)
  const billingActive = hasActiveBilling(item)
  const quoteReady = approved && !suspended && documented && baseRegistered && hasCapacityValue(item) && hasHourlyRateValue(item)
  const reservationReady = quoteReady && visibleForMatching && hasRegistration(item)

  return {
    approved,
    suspended,
    billingPending,
    billingActive,
    documented,
    visibleForMatching,
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
  if (readiness.suspended) return 'La aeronave esta bloqueada y no debe mostrarse en matching.'
  if (readiness.reservationReady) return 'Cumple aprobacion, base, documentos y datos comerciales para reservas.'
  if (readiness.billingPending) return 'La aeronave ya fue aprobada por administracion, pero no se activa hasta reflejar el pago mensual.'
  if (readiness.quoteReady) return 'Puede entrar a cotizaciones, pero aun requiere visibilidad final o ajuste operativo.'
  if (!documentValidation.allApproved) return `${documentValidation.label}.`
  if (readiness.missing.length) return `Faltan ${readiness.missing.slice(0, 3).join(', ')}${readiness.missing.length > 3 ? '...' : ''}.`
  return 'Requiere revision administrativa antes de habilitarla comercialmente.'
}

function readinessChecklist(item) {
  const readiness = aircraftReadiness(item)
  return [
    { label: 'Aprobada', complete: readiness.approved && !readiness.suspended },
    { label: 'Documentada', complete: readiness.documented },
    { label: 'Pago activo', complete: readiness.billingActive },
    { label: 'Matching', complete: readiness.visibleForMatching },
    { label: 'Base registrada', complete: readiness.baseRegistered },
  ]
}

function missingFieldLabel(field) {
  const labels = {
    matricula: 'Sin matricula',
    base: 'Sin base',
    capacidad: 'Sin capacidad',
    tarifa: 'Sin tarifa',
    rango: 'Sin rango',
    documentacion: 'Sin documentacion',
    fotografias: 'Sin fotos',
  }
  return labels[field] || field
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

function matchingChip(item) {
  return matchingVisible(item)
    ? { label: 'Matching visible', tone: 'info', icon: '•' }
    : { label: 'Matching bloqueado', tone: 'neutral', icon: '•' }
}

function trialChip(item) {
  const state = trialState(item)
  if (state === 'Trial activo') return { label: 'Trial activo', tone: 'info', icon: '•' }
  if (state === 'Trial vencido') return { label: 'Trial vencido', tone: 'danger', icon: '!' }
  return { label: 'Sin trial', tone: 'neutral', icon: '•' }
}

function companyInitials(name) {
  return String(name || 'NA')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
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
    matchingFilter.value !== 'Todos' ? `Matching: ${matchingFilter.value}` : '',
    trialFilter.value !== 'Todos' ? `Trial: ${trialFilter.value}` : '',
    sortMode.value !== 'recent' ? `Orden: ${sortOptions.find((item) => item.value === sortMode.value)?.label || sortMode.value}` : '',
  ].filter(Boolean),
)

const companyFilteredAircraft = computed(() => {
  const providerIdQuery = String(route.query.providerId || '').trim()
  const providerNameQuery = String(route.query.providerName || '').trim()

  return props.aircraft.filter((item) => {
    const matchesCompany = companyFilter.value === 'Todas' || providerName(item) === companyFilter.value
    if (!matchesCompany) return false

    if (providerIdQuery) {
      return providerIdValue(item) === providerIdQuery
    }

    if (providerNameQuery) {
      return providerName(item) === providerNameQuery
    }

    return true
  })
})

//REVISAMELO QUE SON LOS CAMBIOS 

const filteredAircraft = computed(() => {
  const items = companyFilteredAircraft.value.filter((item) => {
    const approvalMatches = approvalFilter.value === 'Todas' || approvalState(item) === approvalFilter.value
    const matchingMatches =
      matchingFilter.value === 'Todos' ||
      (matchingFilter.value === 'Visibles' && matchingVisible(item)) ||
      (matchingFilter.value === 'Bloqueados' && !matchingVisible(item))
    const documentMatches = documentsFilter.value === 'Todos' || documentsState(item) === documentsFilter.value
    const trialMatches = trialFilter.value === 'Todos' || trialState(item) === trialFilter.value
    return approvalMatches && matchingMatches && documentMatches && trialMatches && matchesText(item)
  })

  return [...items].sort((a, b) => {
    if (sortMode.value === 'az') return aircraftName(a).localeCompare(aircraftName(b))
    if (sortMode.value === 'approved') return Number(isApproved(b)) - Number(isApproved(a))
    if (sortMode.value === 'trial') {
      const aTime = a.trial_ends_at ? new Date(a.trial_ends_at).getTime() : Number.MAX_SAFE_INTEGER
      const bTime = b.trial_ends_at ? new Date(b.trial_ends_at).getTime() : Number.MAX_SAFE_INTEGER
      return aTime - bTime
    }
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
    { label: 'Matching visible', value: companyFilteredAircraft.value.filter(matchingVisible).length, tone: 'info' },
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
    visible: items.filter(matchingVisible).length,
  }))
})

function clearFilters() {
  companyFilter.value = 'Todas'
  approvalFilter.value = 'Todas'
  matchingFilter.value = 'Todos'
  documentsFilter.value = 'Todos'
  trialFilter.value = 'Todos'
  searchTerm.value = ''
  sortMode.value = 'recent'
  showAdvancedFilters.value = false
  openActionMenuId.value = null
  if (route.query.providerId || route.query.providerName) {
    router.replace({ query: {} })
  }
}

function selectAircraft(item) {
  selectedAircraft.value = item
  detailTab.value = 'general'
  openActionMenuId.value = null
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
  if (action === 'view') {
    selectAircraft(item)
  } else if (action === 'approve') {
    emit('approve-aircraft', item.id)
  } else if (action === 'reject') {
    emit('reject-aircraft', item.id)
  } else if (action === 'suspend') {
    emit('suspend-aircraft', item.id)
  }
  closeActionMenu()
}

const selectedAircraftIndex = computed(() =>
  selectedAircraft.value ? filteredAircraft.value.findIndex((item) => item.id === selectedAircraft.value.id) : -1,
)

const selectedAircraftDocuments = computed(() =>
  selectedAircraft.value ? aircraftDocuments(selectedAircraft.value) : [],
)

const selectedAircraftImages = computed(() =>
  selectedAircraft.value ? aircraftImages(selectedAircraft.value) : [],
)

const selectedAircraftDocumentSummary = computed(() =>
  selectedAircraft.value ? documentSummaryItems(selectedAircraft.value) : [],
)

function selectRelativeAircraft(direction = 1) {
  if (!filteredAircraft.value.length || selectedAircraftIndex.value < 0) return
  const nextIndex = (selectedAircraftIndex.value + direction + filteredAircraft.value.length) % filteredAircraft.value.length
  selectedAircraft.value = filteredAircraft.value[nextIndex]
  detailTab.value = 'general'
}

watch(
  () => props.aircraft,
  () => {
    if (selectedAircraft.value && !props.aircraft.some((item) => item.id === selectedAircraft.value.id)) {
      selectedAircraft.value = null
    }
    if (openActionMenuId.value && !props.aircraft.some((item) => item.id === openActionMenuId.value)) {
      openActionMenuId.value = null
    }
  },
)

watch(
  () => [route.query.providerId, route.query.providerName, props.aircraft.length],
  () => {
    const providerIdQuery = String(route.query.providerId || '').trim()
    const providerNameQuery = String(route.query.providerName || '').trim()

    if (!providerIdQuery && !providerNameQuery) return

    const matchedAircraft = props.aircraft.find((item) => {
      if (providerIdQuery) {
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
          <p>Revision ejecutiva de aprobacion, documentos, trial y visibilidad en marketplace.</p>
        </div>
        <button type="button" class="export-button" @click="exportAircraftCsv">Exportar</button>
      </header>

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

            <button type="button" class="more-filters-toggle" :class="{ active: showAdvancedFilters }" @click="showAdvancedFilters = !showAdvancedFilters">
              Mas filtros {{ showAdvancedFilters ? '▲' : '▼' }}
            </button>
          </div>
        </div>

        <div v-if="showAdvancedFilters" class="filter-groups filter-groups-advanced">
          <label class="toolbar-field">
            <span>Matching</span>
            <select v-model="matchingFilter">
              <option v-for="option in matchingOptions" :key="option" :value="option">
                {{ option }}
              </option>
            </select>
          </label>
          <label class="toolbar-field">
            <span>Trial</span>
            <select v-model="trialFilter">
              <option v-for="option in trialOptions" :key="option" :value="option">
                {{ option }}
              </option>
            </select>
          </label>
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
        <div class="company-head">
          <div class="company-avatar">{{ companyInitials(group.name) }}</div>
          <div class="company-head-copy">
            <h3>{{ group.name }}</h3>
            <p>{{ group.items.length }} aeronaves activas · {{ group.approved }} aprobadas · {{ group.pending }} pendientes · {{ group.visible }} en matching</p>
          </div>
          <div class="company-head-metrics">
            <span>{{ group.items.length }} total</span>
            <span>{{ group.approved }} aprobadas</span>
          </div>
        </div>

        <div class="aircraft-grid">
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
              <div class="aircraft-topline">
                <div class="aircraft-topline-left">
                  <span class="aircraft-icon">✈</span>
                  <span :class="['chip', `chip-${statusChip(item).tone}`]">
                    {{ statusChip(item).icon }} {{ statusChip(item).label }}
                  </span>
                </div>
                <button type="button" class="card-menu-trigger" @click.stop="toggleActionMenu(item.id)">⋮</button>
              </div>

              <div class="aircraft-title">
                <span>{{ item.registration || 'Sin matricula' }}</span>
                <h4>{{ aircraftName(item) }}</h4>
                <p>{{ providerName(item) }}</p>
              </div>

              <div class="aircraft-core-metrics">
                <div>
                  <span>Horas</span>
                  <strong>{{ formatHours(item.flight_hours || item.hours) }}</strong>
                </div>
                <div>
                  <span>Documentos</span>
                  <strong>{{ documentCompletion(item).completed }}/{{ documentCompletion(item).total }}</strong>
                </div>
                <div>
                  <span>Base</span>
                  <strong>{{ baseLabel(item) }}</strong>
                </div>
              </div>

              <div class="status-list compact-status-list">
                <span :class="['chip', `chip-${docsChip(item).tone}`]">
                  {{ docsChip(item).icon }} {{ docsChip(item).label }}
                </span>
                <span :class="['chip', `chip-${billingChip(item).tone}`]">
                  {{ billingChip(item).icon }} {{ billingChip(item).label }}
                </span>
                <span :class="['chip', `chip-${matchingChip(item).tone}`]">
                  {{ matchingChip(item).icon }} {{ matchingChip(item).label }}
                </span>
                <span :class="['chip', `chip-${trialChip(item).tone}`]">
                  {{ trialChip(item).icon }} {{ trialChip(item).label }}
                </span>
              </div>

              <div :class="['readiness-panel', `readiness-panel-${readinessTone(item)}`]">
                <div class="readiness-head">
                  <div>
                    <small>Estado comercial</small>
                    <strong>{{ readinessHeadline(item) }}</strong>
                  </div>
                  <span :class="['chip', `chip-${readinessTone(item)}`]">
                    {{ aircraftReadiness(item).reservationReady ? 'Reservable' : aircraftReadiness(item).quoteReady ? 'Cotizable' : 'Pendiente' }}
                  </span>
                </div>
                <p>{{ readinessDescription(item) }}</p>
                <div class="readiness-checklist">
                  <span
                    v-for="entry in readinessChecklist(item)"
                    :key="entry.label"
                    :class="['readiness-item', { complete: entry.complete }]"
                  >
                    {{ entry.complete ? '✓' : '!' }} {{ entry.label }}
                  </span>
                </div>
                <div v-if="aircraftReadiness(item).missing.length" class="missing-tags">
                  <span v-for="field in aircraftReadiness(item).missing" :key="field">
                    {{ missingFieldLabel(field) }}
                  </span>
                </div>
              </div>

              <div class="document-progress">
                <div class="document-progress-copy">
                  <small>Completitud documental</small>
                  <strong>{{ documentCompletion(item).percent }}%</strong>
                </div>
                <div class="document-progress-track">
                  <div class="document-progress-fill" :style="{ width: `${documentCompletion(item).percent}%` }"></div>
                </div>
              </div>

              <div class="card-foot compact-card-foot">
                <small>Trial vence: {{ formatDate(item.trial_ends_at) }}</small>
                <button type="button" @click.stop="selectAircraft(item)">Ver</button>
              </div>
            </div>

            <div v-if="openActionMenuId === item.id" class="card-action-menu" @click.stop>
              <button type="button" @click="runCardAction('view', item)">Ver detalle</button>
              <button type="button" @click="runCardAction('approve', item)">Aprobar</button>
              <button type="button" @click="runCardAction('reject', item)">Rechazar</button>
              <button type="button" @click="runCardAction('suspend', item)">Suspender</button>
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
          <section class="detail-hero">
            <div :class="['detail-hero-media', { 'drawer-media-empty': !primaryAircraftImage(selectedAircraft) }]">
              <img
                v-if="primaryAircraftImage(selectedAircraft)"
                :src="primaryAircraftImage(selectedAircraft)"
                :alt="`Imagen de ${aircraftName(selectedAircraft)}`"
                class="hero-image"
              />
              <span v-else>✈</span>
            </div>
            <aside class="detail-hero-side">
              <div class="detail-hero-card">
                <span class="mini-label">Resumen ejecutivo</span>
                <div class="drawer-chips">
                  <span :class="['chip', `chip-${statusChip(selectedAircraft).tone}`]">{{ statusChip(selectedAircraft).label }}</span>
                  <span :class="['chip', `chip-${docsChip(selectedAircraft).tone}`]">{{ docsChip(selectedAircraft).label }}</span>
                  <span :class="['chip', `chip-${billingChip(selectedAircraft).tone}`]">{{ billingChip(selectedAircraft).label }}</span>
                  <span :class="['chip', `chip-${matchingChip(selectedAircraft).tone}`]">{{ matchingChip(selectedAircraft).label }}</span>
                  <span :class="['chip', `chip-${trialChip(selectedAircraft).tone}`]">{{ trialChip(selectedAircraft).label }}</span>
                  <span :class="['chip', `chip-${readinessTone(selectedAircraft)}`]">{{ readinessHeadline(selectedAircraft) }}</span>
                </div>
                <dl class="hero-kpi-list">
                  <div>
                    <dt>Capacidad</dt>
                    <dd>{{ formatNumber(selectedAircraft.capacity || selectedAircraft.passenger_capacity, ' pax') }}</dd>
                  </div>
                  <div>
                    <dt>Rango</dt>
                    <dd>{{ formatNumber(selectedAircraft.range_km || selectedAircraft.rangeKm, ' km') }}</dd>
                  </div>
                  <div>
                    <dt>Tarifa hora</dt>
                    <dd>{{ formatMoney(selectedAircraft.hourly_rate || selectedAircraft.hourlyPrice || selectedAircraft.price_per_hour) }}</dd>
                  </div>
                  <div>
                    <dt>Actualizacion</dt>
                    <dd>{{ formatDate(selectedAircraft.updated_at || selectedAircraft.created_at) }}</dd>
                  </div>
                </dl>
                <div class="drawer-readiness-block">
                  <strong>Listo para cotizar: {{ aircraftReadiness(selectedAircraft).quoteReady ? 'Si' : 'No' }}</strong>
                  <strong>Listo para reservar: {{ aircraftReadiness(selectedAircraft).reservationReady ? 'Si' : 'No' }}</strong>
                  <p>{{ readinessDescription(selectedAircraft) }}</p>
                  <div v-if="aircraftReadiness(selectedAircraft).missing.length" class="missing-tags">
                    <span v-for="field in aircraftReadiness(selectedAircraft).missing" :key="field">
                      {{ missingFieldLabel(field) }}
                    </span>
                  </div>
                </div>
              </div>
            </aside>
          </section>

          <nav class="detail-tabs" aria-label="Navegacion de detalle">
            <button
              v-for="tab in detailTabs"
              :key="tab.id"
              type="button"
              :class="{ active: detailTab === tab.id }"
              @click="detailTab = tab.id"
            >
              {{ tab.label }}
            </button>
          </nav>

          <section v-if="detailTab === 'general'" class="detail-panel-grid">
            <article class="detail-panel">
              <h4>Datos de la aeronave</h4>
              <dl class="detail-definition-grid">
                <div>
                  <dt>Matricula</dt>
                  <dd>{{ selectedAircraft.registration || 'Pendiente' }}</dd>
                </div>
                <div>
                  <dt>Fabricante</dt>
                  <dd>{{ selectedAircraft.manufacturer || 'Pendiente' }}</dd>
                </div>
                <div>
                  <dt>Modelo</dt>
                  <dd>{{ aircraftName(selectedAircraft) }}</dd>
                </div>
                <div>
                  <dt>Año</dt>
                  <dd>{{ selectedAircraft.model_year || selectedAircraft.year || 'Pendiente' }}</dd>
                </div>
                <div>
                  <dt>Horas totales</dt>
                  <dd>{{ selectedAircraft.flight_hours || selectedAircraft.hours || 'Pendiente' }}</dd>
                </div>
                <div>
                  <dt>Ubicacion</dt>
                  <dd>{{ baseLabel(selectedAircraft) }}</dd>
                </div>
                <div>
                  <dt>Tipo</dt>
                  <dd>{{ selectedAircraft.type || selectedAircraft.category || 'Jet ejecutivo' }}</dd>
                </div>
                <div>
                  <dt>Proveedor</dt>
                  <dd>{{ providerName(selectedAircraft) }}</dd>
                </div>
              </dl>
            </article>

            <article class="detail-panel">
              <h4>Observaciones</h4>
              <p class="detail-copy">
                {{ selectedAircraft.notes || selectedAircraft.admin_notes || 'Sin observaciones registradas para esta aeronave.' }}
              </p>
              <h4>Disponibilidad comercial</h4>
              <p class="detail-copy">
                {{
                  aircraftReadiness(selectedAircraft).reservationReady
                    ? 'Visible y lista para entrar a matching, cotizaciones y reservas.'
                    : aircraftReadiness(selectedAircraft).quoteReady
                      ? 'Ya puede cotizarse, pero aun requiere cierre comercial para reservas.'
                      : 'Oculta hasta completar aprobacion, documentos, base y datos comerciales.'
                }}
              </p>
            </article>
          </section>

          <section v-else-if="detailTab === 'documents'" class="detail-panel-grid">
            <article class="detail-panel">
              <h4>Checklist documental</h4>
              <div class="document-summary-grid">
                <div
                  v-for="item in selectedAircraftDocumentSummary"
                  :key="item.label"
                  :class="['document-summary-card', `document-summary-card-${item.status || 'missing'}`, { complete: item.complete }]"
                >
                  <strong>{{ item.complete ? '✓' : '!' }} {{ item.label }}</strong>
                  <small>{{ item.detail }}</small>
                </div>
              </div>
            </article>

            <article class="detail-panel detail-panel-wide">
              <h4>Documentos cargados</h4>
              <div v-if="selectedAircraftDocuments.length" class="document-list">
                <article
                  v-for="document in selectedAircraftDocuments"
                  :key="document.id"
                  class="document-item"
                >
                  <div>
                    <span :class="['chip', `chip-${documentStatusMeta(document).tone}`]">{{ documentStatusMeta(document).label }}</span>
                    <strong>{{ document.name }}</strong>
                    <small>{{ documentTypeLabel(document.type) }} · Vence: {{ formatDate(document.expiresAt) }}</small>
                    <p v-if="document.notes">{{ document.notes }}</p>
                  </div>
                  <button
                    v-if="document.fileUrl || document.id"
                    type="button"
                    class="document-open"
                    :disabled="downloadingDocumentId === document.id"
                    @click="openAircraftDocument(document)"
                  >
                    {{ downloadingDocumentId === document.id ? 'Abriendo...' : 'Abrir' }}
                  </button>
                  <span v-else class="document-missing">Sin archivo</span>
                </article>
              </div>
              <p v-if="documentDownloadError" class="document-error">{{ documentDownloadError }}</p>
              <p v-if="!selectedAircraftDocuments.length" class="documents-empty">No hay documentos cargados para esta aeronave.</p>
            </article>
          </section>

          <section v-else-if="detailTab === 'operations'" class="detail-panel-grid">
            <article class="detail-panel">
              <h4>Operacion</h4>
              <dl class="detail-definition-grid">
                <div>
                  <dt>Estado backend</dt>
                  <dd>{{ selectedAircraft.status || 'Pendiente' }}</dd>
                </div>
                <div>
                  <dt>Trial vence</dt>
                  <dd>{{ formatDate(selectedAircraft.trial_ends_at) }}</dd>
                </div>
                <div>
                  <dt>Documentos</dt>
                  <dd>{{ selectedAircraftDocuments.length }} archivo(s)</dd>
                </div>
                <div>
                  <dt>Marketplace</dt>
                  <dd>{{ matchingVisible(selectedAircraft) ? 'Visible' : 'Bloqueado' }}</dd>
                </div>
                <div>
                  <dt>Base registrada</dt>
                  <dd>{{ aircraftReadiness(selectedAircraft).baseRegistered ? 'Completa' : 'Pendiente' }}</dd>
                </div>
                <div>
                  <dt>Cotizable</dt>
                  <dd>{{ aircraftReadiness(selectedAircraft).quoteReady ? 'Si' : 'No' }}</dd>
                </div>
                <div>
                  <dt>Reservable</dt>
                  <dd>{{ aircraftReadiness(selectedAircraft).reservationReady ? 'Si' : 'No' }}</dd>
                </div>
              </dl>
            </article>

            <article class="detail-panel">
              <h4>Historial rapido</h4>
              <div class="timeline-list">
                <div class="timeline-item">
                  <strong>Registro creado</strong>
                  <small>{{ formatDate(selectedAircraft.created_at) }}</small>
                </div>
                <div class="timeline-item">
                  <strong>Ultima actualizacion</strong>
                  <small>{{ formatDate(selectedAircraft.updated_at || selectedAircraft.created_at) }}</small>
                </div>
                <div class="timeline-item">
                  <strong>Estatus actual</strong>
                  <small>{{ statusChip(selectedAircraft).label }}</small>
                </div>
                <div class="timeline-item">
                  <strong>Faltantes criticos</strong>
                  <small>{{
                    aircraftReadiness(selectedAircraft).missing.length
                      ? aircraftReadiness(selectedAircraft).missing.map(missingFieldLabel).join(', ')
                      : 'Sin faltantes criticos'
                  }}</small>
                </div>
              </div>
            </article>
          </section>

          <section v-else-if="detailTab === 'pricing'" class="detail-panel-grid">
            <article class="detail-panel detail-panel-wide">
              <h4>Pricing y disponibilidad</h4>
              <dl class="detail-definition-grid">
                <div>
                  <dt>Tarifa hora</dt>
                  <dd>{{ formatMoney(selectedAircraft.hourly_rate || selectedAircraft.hourlyPrice || selectedAircraft.price_per_hour) }}</dd>
                </div>
                <div>
                  <dt>Minimo</dt>
                  <dd>{{ formatNumber(selectedAircraft.minimum_hours || selectedAircraft.min_hours, ' h') }}</dd>
                </div>
                <div>
                  <dt>Rango</dt>
                  <dd>{{ formatNumber(selectedAircraft.range_km || selectedAircraft.rangeKm, ' km') }}</dd>
                </div>
                <div>
                  <dt>Capacidad</dt>
                  <dd>{{ formatNumber(selectedAircraft.capacity || selectedAircraft.passenger_capacity, ' pasajeros') }}</dd>
                </div>
                <div>
                  <dt>Cobertura</dt>
                  <dd>{{ formatList(selectedAircraft.coverage) }}</dd>
                </div>
                <div>
                  <dt>Amenidades</dt>
                  <dd>{{ formatList(selectedAircraft.amenities) }}</dd>
                </div>
              </dl>
            </article>
          </section>

          <section v-else class="detail-panel-grid">
            <article class="detail-panel detail-panel-wide">
              <h4>Multimedia</h4>
              <div v-if="selectedAircraftImages.length" class="detail-media-grid">
                <img
                  v-for="image in selectedAircraftImages"
                  :key="image.id"
                  :src="image.imageUrl"
                  :alt="image.title"
                  loading="lazy"
                />
              </div>
              <p v-else class="documents-empty">No hay imagenes cargadas para esta aeronave.</p>
            </article>
          </section>
        </div>

        <footer class="detail-footer">
          <div class="detail-footer-copy">
            <strong>{{ aircraftName(selectedAircraft) }}</strong>
            <small>{{ providerName(selectedAircraft) }} · {{ baseLabel(selectedAircraft) }}</small>
          </div>
          <div class="detail-footer-actions">
            <button class="action-approve" type="button" @click="$emit('approve-aircraft', selectedAircraft.id)">✓ Aprobar</button>
            <button class="action-reject" type="button" @click="$emit('reject-aircraft', selectedAircraft.id)">× Rechazar</button>
            <button class="action-suspend" type="button" @click="$emit('suspend-aircraft', selectedAircraft.id)">! Suspender</button>
            <button type="button" class="export-button" @click="downloadSelectedAircraftSummary">Descargar resumen</button>
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
            <span class="mini-label">{{ documentTypeLabel(previewDocument.type) }}</span>
            <h3>{{ previewDocument.name }}</h3>
          </div>
          <button type="button" @click="closeDocumentPreview">Cerrar</button>
        </header>
        <iframe :src="previewDocument.url" :title="previewDocument.name"></iframe>
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
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
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
  border-radius: 8px;
  padding: 1rem;
  background: #ffffff;
}

.command-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.25rem 0.25rem 0;
}

.command-hero h2 {
  margin: 0;
  color: #0f172a;
  font-size: clamp(1.6rem, 3vw, 2.35rem);
  letter-spacing: 0;
}

.command-hero p {
  margin: 0.45rem 0 0;
  max-width: 44rem;
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
  padding: 0.75rem 1rem;
  color: #0f172a;
  background: #f1f5f9;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.75rem;
}

.kpi-card {
  min-height: 6rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0.9rem;
  background: #ffffff;
}

.kpi-card span {
  color: #64748b;
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
}

.kpi-card strong {
  display: block;
  margin-top: 0.45rem;
  color: #0f172a;
  font-size: 2rem;
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
  gap: 0.9rem;
  border-radius: 8px;
  padding: 1rem;
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
  gap: 0.75rem;
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
  padding: 0.75rem 1rem;
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
  min-height: 3.4rem;
  border: 1px solid #dbe3ef;
  border-radius: 18px;
  color: #0f172a;
  background: #f8fafc;
  padding: 0 1rem;
  font-size: 1rem;
  outline: none;
}

.toolbar-field select {
  width: 100%;
  min-height: 3rem;
  border: 1px solid #dbe3ef;
  border-radius: 14px;
  color: #0f172a;
  background: #ffffff;
  padding: 0 0.95rem;
  font-size: 0.94rem;
  outline: none;
}

.results-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-top: 1px solid #e5e7eb;
  padding-top: 0.95rem;
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
  color: #bfdbfe;
  background: rgba(59, 130, 246, 0.14);
}

.active-filter-row button {
  color: #ffffff;
  background: rgba(239, 68, 68, 0.18);
}

.company-group {
  display: grid;
  gap: 0.85rem;
}

.company-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  background: #f8fafc;
  padding: 1rem 1.1rem;
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

.company-head-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
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

.aircraft-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.85rem;
}

.aircraft-card {
  position: relative;
  display: grid;
  grid-template-columns: 148px minmax(0, 1fr);
  min-height: 260px;
  align-items: stretch;
  gap: 0.85rem;
  border-radius: 18px;
  padding: 0.85rem;
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
  min-height: 100%;
  overflow: hidden;
  place-items: center;
  border-radius: 14px;
  background: #f1f5f9;
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
  align-content: start;
  gap: 0.7rem;
  min-width: 0;
}

.aircraft-topline,
.card-foot {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.aircraft-topline {
  justify-content: space-between;
}

.aircraft-topline-left {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
}

.aircraft-icon {
  display: grid;
  width: 1.85rem;
  height: 1.85rem;
  place-items: center;
  border-radius: 8px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 0.86rem;
}

.aircraft-title span,
.mini-label {
  color: #2563eb;
  font-size: 0.72rem;
  font-weight: 900;
  text-transform: uppercase;
}

.aircraft-title h4 {
  margin: 0.16rem 0;
  color: #0f172a;
  font-size: 1rem;
  letter-spacing: 0;
}

.aircraft-title p {
  margin: 0;
  font-size: 0.84rem;
}

.aircraft-core-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
}

.aircraft-core-metrics div {
  display: grid;
  gap: 0.22rem;
  border-radius: 12px;
  background: #f8fafc;
  padding: 0.55rem 0.6rem;
}

.aircraft-core-metrics span {
  color: #64748b;
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
}

.aircraft-core-metrics strong {
  min-width: 0;
  overflow: hidden;
  color: #0f172a;
  font-size: 0.82rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-list,
.drawer-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.chip {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  gap: 0.32rem;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  padding: 0.28rem 0.5rem;
  color: #475569;
  background: #f8fafc;
  font-size: 0.7rem;
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

.compact-status-list .chip {
  font-size: 0.66rem;
}

.document-progress {
  display: grid;
  gap: 0.45rem;
}

.readiness-panel {
  display: grid;
  gap: 0.6rem;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 0.8rem;
  background: linear-gradient(180deg, #fffdf7, #ffffff);
}

.readiness-panel-success {
  border-color: rgba(34, 197, 94, 0.28);
  background: linear-gradient(180deg, rgba(240, 253, 244, 0.95), #ffffff);
}

.readiness-panel-warning {
  border-color: rgba(245, 158, 11, 0.28);
  background: linear-gradient(180deg, rgba(255, 251, 235, 0.95), #ffffff);
}

.readiness-panel-danger {
  border-color: rgba(239, 68, 68, 0.28);
  background: linear-gradient(180deg, rgba(254, 242, 242, 0.95), #ffffff);
}

.readiness-panel-info {
  border-color: rgba(59, 130, 246, 0.24);
  background: linear-gradient(180deg, rgba(239, 246, 255, 0.95), #ffffff);
}

.readiness-panel-neutral {
  border-color: rgba(148, 163, 184, 0.24);
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.98), #ffffff);
}

.readiness-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.6rem;
}

.readiness-head small {
  color: #64748b;
  font-size: 0.7rem;
  font-weight: 900;
  text-transform: uppercase;
}

.readiness-head strong {
  display: block;
  margin-top: 0.14rem;
  color: #0f172a;
  font-size: 0.88rem;
}

.readiness-panel p,
.drawer-readiness-block p {
  margin: 0;
  color: #475569;
  font-size: 0.78rem;
  line-height: 1.5;
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
  padding: 0.38rem 0.68rem;
  font-size: 1rem;
  line-height: 1;
}

.card-action-menu {
  position: absolute;
  top: 3.6rem;
  right: 0.85rem;
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
  height: calc(100vh - 160px);
  overflow-y: auto;
  padding: 1.25rem 1.5rem 7rem;
}

.detail-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.9fr) minmax(320px, 0.9fr);
  gap: 1rem;
}

.detail-hero-media {
  position: relative;
  min-height: 500px;
  overflow: hidden;
  border-radius: 24px;
  background:
    linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(15, 118, 110, 0.1)),
    #f8fafc;
}

.hero-image {
  width: 100%;
  height: 500px;
  object-fit: cover;
}

.detail-hero-side {
  display: grid;
}

.detail-hero-card,
.detail-panel {
  display: grid;
  gap: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 24px;
  background: #ffffff;
  padding: 1.25rem;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.06);
}

.hero-kpi-list {
  display: grid;
  gap: 0.85rem;
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

.hero-kpi-list div {
  justify-content: space-between;
  border-bottom: 1px solid #eef2f7;
  padding-bottom: 0.75rem;
}

.hero-kpi-list dt,
.detail-definition-grid dt {
  color: #64748b;
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
}

.hero-kpi-list dd,
.detail-definition-grid dd {
  margin: 0;
  color: #0f172a;
  font-weight: 800;
  text-align: right;
}

.detail-tabs {
  position: sticky;
  top: 0;
  z-index: 15;
  flex-wrap: wrap;
  gap: 0.5rem;
  border-bottom: 1px solid #e5e7eb;
  background: rgba(255, 255, 255, 0.98);
  padding: 1rem 0 0.85rem;
  margin-top: 1.2rem;
}

.detail-tabs button {
  border: 1px solid #dbe3ef;
  border-radius: 999px;
  color: #334155;
  background: #ffffff;
  padding: 0.7rem 0.95rem;
  font-weight: 800;
}

.detail-tabs button.active {
  border-color: rgba(96, 165, 250, 0.65);
  color: #ffffff;
  background: #2563eb;
}

.detail-panel-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  padding-top: 1.2rem;
}

.detail-panel-wide {
  grid-column: 1 / -1;
}

.detail-panel h4,
.detail-copy {
  margin: 0;
}

.detail-copy {
  color: #475569;
  line-height: 1.7;
}

.detail-definition-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem 1rem;
  margin: 0;
}

.detail-definition-grid div {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid #eef2f7;
  padding-bottom: 0.85rem;
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

.detail-media-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.85rem;
}

.detail-media-grid img {
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 18px;
  object-fit: cover;
  background: #f1f5f9;
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

.document-list {
  display: grid;
  gap: 0.6rem;
}

.document-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0.75rem;
  background: #f8fafc;
}

.document-item > div {
  display: grid;
  min-width: 0;
  gap: 0.35rem;
}

.document-item strong {
  overflow: hidden;
  color: #0f172a;
  font-size: 0.88rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-item small,
.document-item p,
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

  .detail-hero,
  .detail-panel-grid,
  .document-summary-grid,
  .detail-definition-grid,
  .detail-media-grid {
    grid-template-columns: 1fr;
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
  .meta-grid,
  .aircraft-core-metrics {
    grid-template-columns: 1fr;
  }

  .aircraft-card {
    grid-template-columns: 1fr;
  }

  .aircraft-photo {
    min-height: 160px;
  }

  .document-preview {
    inset: 0;
    border-radius: 0;
  }

  .results-toolbar,
  .company-head,
  .aircraft-core-metrics,
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

  .detail-media-grid,
  .detail-definition-grid,
  .document-summary-grid {
    grid-template-columns: 1fr;
  }

  .results-chips {
    justify-content: flex-start;
  }

  .company-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .document-item {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
