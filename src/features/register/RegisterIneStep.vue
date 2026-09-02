<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { canvasToFile, captureVideoFrame } from './identityVerification'
import { scanDocumentFiles } from './ineScanner'
import { api } from '../../lib/api'
import { searchAirports } from '../../lib/airportSearch'
import { formatAirportOption } from '../../utils/airports'
import {
  buildIdentificationUploadFormData,
  generateIdentificationPdf,
  IDENTIFICATION_ALLOWED_MIME_TYPES,
  identificationDocumentNeedsExpiration,
  uploadIdentificationDocument,
  validateIdentificationForm,
  validateIdentificationFiles,
} from './identificationUpload'
import { DOCUMENT_TYPE_OPTIONS, normalizeDocumentType } from './documentScannerConfig'

const props = defineProps({
  form: { type: Object, required: true },
  errors: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['file-selected', 'update-field', 'merge-fields'])

const cameraLoading = ref(false)
const capturing = ref(false)
const validating = ref(false)
const scanning = ref(false)
const scanStageLabel = ref('Preparando imagen')
const scanStageProgress = ref(0)
const scanWarnings = ref([])
const scanReviewFields = ref([])
const scanAbortController = ref(null)
const airportSuggestions = ref([])
const airportLoading = ref(false)
const airportOptionsOpen = ref(false)
let airportSearchTimer = null
const cameraActive = ref(false)
const videoRef = ref(null)
const activeStream = ref(null)
const frontUploadInputRef = ref(null)
const frontCameraInputRef = ref(null)
const backUploadInputRef = ref(null)
const backCameraInputRef = ref(null)
const cameraStatus = ref('')
const verificationMessage = ref('')
const scanMessage = ref('')
const identificationInputAccept = IDENTIFICATION_ALLOWED_MIME_TYPES.join(',')
const BIOMETRIC_DETECT_FACE_PATH = String(
  import.meta.env.VITE_BIOMETRIC_DETECT_FACE_PATH || '/public/biometric/detect-face',
).trim()
const isCrewRole = computed(() => props.form.role === 'sobrecargo')
const isProviderRole = computed(() => props.form.role === 'provider')
const showBiometricPanel = computed(() => !isCrewRole.value && !isProviderRole.value)
const documentTypeOptions = computed(() => DOCUMENT_TYPE_OPTIONS)
const normalizedSelectedDocumentType = computed(() =>
  isCrewRole.value ? 'driver_license' : normalizeDocumentType(props.form.documentType),
)
const selectedDocumentOption = computed(
  () =>
    documentTypeOptions.value.find((option) => option.value === normalizedSelectedDocumentType.value) ||
    documentTypeOptions.value[0],
)
const activeDocumentLabel = computed(() =>
  isCrewRole.value ? 'licencia' : selectedDocumentOption.value.label,
)
const activeDocumentLabelUpper = computed(() => activeDocumentLabel.value.toUpperCase())
const activeDocumentFrontLabel = computed(() =>
  isCrewRole.value ? 'Licencia frente' : `${selectedDocumentOption.value.label} frente`,
)
const activeDocumentBackLabel = computed(() => `${selectedDocumentOption.value.label} reverso`)
const activeScanButtonLabel = computed(() =>
  isCrewRole.value ? 'Escanear licencia' : `Escanear ${selectedDocumentOption.value.label.toLowerCase()}`,
)
const activeRescanButtonLabel = computed(() =>
  isCrewRole.value ? 'Reescanear y corregir datos' : 'Reescanear y corregir',
)
const activeScanningLabel = computed(() =>
  isCrewRole.value ? 'Escaneando licencia...' : `Escaneando ${selectedDocumentOption.value.label.toLowerCase()}...`,
)
const identificationStatusLabel = computed(() => {
  const status = String(props.form.identificationUploadStatus || 'pending').trim()

  if (status === 'generating') return 'Generando PDF'
  if (status === 'uploading') return 'Guardando documento'
  if (status === 'saved') return 'Documento guardado'
  if (status === 'error') return 'Error'
  return 'Documento pendiente'
})
const identificationStatusTone = computed(() => {
  const status = String(props.form.identificationUploadStatus || 'pending').trim()

  if (status === 'saved') return 'validated'
  if (status === 'error') return 'searching'
  if (status === 'generating' || status === 'uploading') return 'pending-review'
  return 'searching'
})
const WARNING_MESSAGES = {
  excessive_glare: 'La imagen tiene reflejos que dificultan leer algunos datos.',
  moderate_glare: 'Se detecto un reflejo leve; revisa los campos marcados.',
  manual_review_required: 'Algunos datos necesitan revision.',
  document_out_of_frame: 'Parte del documento quedo fuera de la fotografia.',
  image_blurry: 'La imagen esta borrosa. Toma nuevamente la fotografia.',
  document_not_detected: 'No se detecto correctamente el documento en la imagen.',
  image_too_dark: 'La imagen esta muy oscura para leer todos los datos.',
  image_overexposed: 'La imagen tiene demasiada luz y puede ocultar texto.',
  missing_optional_curp: 'No se detecto la CURP automaticamente.',
  missing_optional_cic: 'No se detecto el CIC automaticamente.',
  missing_optional_ocr: 'No se detecto el OCR automaticamente.',
  missing_optional_expiration_date: 'No se detecto la vigencia automaticamente.',
  missing_optional_document_status: 'No se pudo calcular el estado del documento.',
}
const REVIEW_FIELD_MESSAGES = {
  document_type: 'Tipo de documento',
  document_number: 'Numero de documento',
  name: 'Nombre completo',
  birth_date: 'Fecha de nacimiento',
  expiration_date: 'Vigencia',
  document_capture: 'Captura del documento',
}
function revokePreviewUrl(url) {
  if (typeof url === 'string' && url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

const flowSteps = computed(() => [
  { number: 1, label: 'Abrir camara', complete: cameraActive.value || Boolean(props.form.selfiePreviewUrl) },
  { number: 2, label: 'Capturar selfie', complete: Boolean(props.form.selfieFile) },
  { number: 3, label: 'Mostrar preview', complete: Boolean(props.form.selfiePreviewUrl) },
  {
    number: 4,
    label: 'Validar rostro',
    complete: ['pending_backend_validation', 'approved', 'rejected'].includes(
      String(props.form.identityVerificationStatus || '').trim(),
    ),
  },
  {
    number: 5,
    label: 'Mostrar resultado',
    complete: ['approved', 'rejected'].includes(String(props.form.identityVerificationStatus || '').trim()),
  },
])

const responseState = computed(() => {
  const status = String(props.form.identityVerificationStatus || '').trim()

  if (status === 'approved') {
    return {
      label: 'Aprobado',
      detail: props.form.identityVerificationMessage || 'El backend aprobo la selfie enviada.',
      tone: 'validated',
    }
  }

  if (status === 'rejected' || status === 'capture_rejected') {
    return {
      label: 'Rechazado',
      detail:
        props.form.identityVerificationMessage ||
        'El backend rechazo la selfie o la captura no fue valida.',
      tone: 'searching',
    }
  }

  if (status === 'selfie_captured' || status === 'pending_backend_validation') {
    return {
      label: status === 'pending_backend_validation' ? 'Validando' : 'Selfie capturada',
      detail:
        props.form.identityVerificationMessage ||
        'La selfie se esta validando en backend.',
      tone: 'pending-review',
    }
  }

  return {
    label: 'Pendiente',
    detail: 'Abre la camara y captura una selfie para que el registro la envie al backend.',
    tone: 'searching',
  }
})

function updateField(field, value) {
  const normalizedValue = field === 'name' ? String(value || '').toUpperCase() : value

  emit('update-field', field, normalizedValue)

  if (
    !isCrewRole.value &&
    [
      'name',
      'phone',
      'birthDate',
      'documentType',
      'documentNumber',
      'documentExpiration',
      'nationality',
      'ineCurp',
      'identityValidationRequired',
    ].includes(field)
  ) {
    markIdentificationDraftChanged()
  }
}

function fieldError(field) {
  return props.errors?.[field] || ''
}

function setIdentificationUploadState(patch = {}) {
  emit('merge-fields', patch)
}

function markIdentificationDraftChanged() {
  if (isCrewRole.value) return

  setIdentificationUploadState({
    identificationUploadStatus: 'pending',
    identificationUploadError: '',
    identificationDocumentId: '',
    identificationStorageDisk: '',
    identificationStoragePath: '',
    identificationFileUrl: '',
    identificationDocumentUrl: '',
    identificationPdfName: '',
  })
}

function previewKindForFile(file) {
  return String(file?.type || '').trim().toLowerCase() === 'application/pdf' ? 'pdf' : 'image'
}

function openIdentificationPicker(side, mode = 'upload') {
  const pickerMap = {
    front: {
      upload: frontUploadInputRef.value,
      camera: frontCameraInputRef.value,
    },
    back: {
      upload: backUploadInputRef.value,
      camera: backCameraInputRef.value,
    },
  }

  pickerMap[side]?.[mode]?.click?.()
}

function resolveIdentificationUploadError(error) {
  return (
    error?.payload?.message ||
    error?.message ||
    'No fue posible guardar la identificación.'
  )
}

async function saveIdentificationDocument() {
  try {
    validateIdentificationForm(props.form)
    await validateIdentificationFiles({
      frontFile: props.form.ineFront,
      backFile: props.form.ineBack,
    })
  } catch (error) {
    setIdentificationUploadState({
      identificationUploadStatus: 'error',
      identificationUploadError: resolveIdentificationUploadError(error),
    })
    return
  }

  try {
    setIdentificationUploadState({
      identificationUploadStatus: 'generating',
      identificationUploadError: '',
    })

    const pdfFile = await generateIdentificationPdf({
      frontFile: props.form.ineFront,
      backFile: props.form.ineBack,
    })

    setIdentificationUploadState({
      identificationUploadStatus: 'uploading',
      identificationUploadError: '',
      identificationPdfName: pdfFile.name,
    })

    const formData = buildIdentificationUploadFormData(
      props.form,
      pdfFile,
      props.form.identificationDocumentId,
    )
    const uploadResult = await uploadIdentificationDocument(api, formData)

    setIdentificationUploadState({
      identificationUploadStatus: uploadResult.status,
      identificationUploadError: '',
      identificationDocumentId: uploadResult.documentId,
      identificationStorageDisk: uploadResult.storageDisk,
      identificationStoragePath: uploadResult.storagePath,
      identificationFileUrl: uploadResult.fileUrl,
      identificationDocumentUrl: uploadResult.documentUrl,
      identificationPdfName: pdfFile.name,
    })
  } catch (error) {
    setIdentificationUploadState({
      identificationUploadStatus: 'error',
      identificationUploadError: resolveIdentificationUploadError(error),
    })
  }
}

function identificationPreviewAlt(label = '') {
  return `Vista previa de ${String(label || '').toLowerCase()}`
}

function showIdentificationExpirationField() {
  return identificationDocumentNeedsExpiration(normalizedSelectedDocumentType.value)
}

function identificationChangeActionLabel(file) {
  return previewKindForFile(file) === 'pdf' ? 'Cambiar archivo' : 'Cambiar fotografia'
}

function renderPdfPreviewLabel(fileName = '') {
  return fileName || 'PDF cargado'
}

function sanitizeBackendName(value = '') {
  return String(value || '')
    .replace(/^(?:iw|i\s*w|jw|ivv)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function clearTimer(timerId) {
  if (timerId) {
    clearTimeout(timerId)
  }
}

function clearAirportTimer() {
  clearTimer(airportSearchTimer)
  airportSearchTimer = null
}

function closeAirportOptions() {
  airportOptionsOpen.value = false
}

function scheduleAirportSearch(query) {
  clearAirportTimer()

  const trimmedQuery = String(query || '').trim()
  if (!trimmedQuery) {
    airportSuggestions.value = []
    airportLoading.value = false
    airportOptionsOpen.value = false
    return
  }

  airportLoading.value = true
  airportOptionsOpen.value = true

  airportSearchTimer = setTimeout(async () => {
    try {
      const result = await searchAirports(trimmedQuery, 6)
      airportSuggestions.value = Array.isArray(result?.items) ? result.items : []
      airportOptionsOpen.value = airportSuggestions.value.length > 0
    } catch {
      airportSuggestions.value = []
      airportOptionsOpen.value = false
    } finally {
      airportLoading.value = false
      airportSearchTimer = null
    }
  }, 220)
}

function handleBaseInput(event) {
  const value = event?.target?.value || ''
  updateField('base', value)
  scheduleAirportSearch(value)
}

function selectBaseAirport(airport) {
  updateField('base', airport?.code || airport?.iata || formatAirportOption(airport))
  airportSuggestions.value = []
  airportOptionsOpen.value = false
}

function handleIneFileSelected(field, event) {
  const previousPreviewUrl = props.form?.[`${field}PreviewUrl`]
  revokePreviewUrl(previousPreviewUrl)
  emit('file-selected', field, event)
  const file = event?.target?.files?.[0] || null
  emit('merge-fields', {
    [`${field}PreviewUrl`]: file ? URL.createObjectURL(file) : '',
  })

  if (!isCrewRole.value) {
    markIdentificationDraftChanged()
    return
  }

  scanMessage.value = ''
  scanWarnings.value = []
  scanReviewFields.value = []
  emit('merge-fields', {
    ineScanStatus: '',
    ineScanRaw: '',
    ineCurp: '',
    ineCic: '',
    ineOcr: '',
    documentNumber: '',
    documentIssueDate: '',
    documentExpiration: '',
    documentStatus: '',
    licenseType: isCrewRole.value ? 'Licencia de sobrecargo' : '',
    licenseCategory: '',
    issuingCountry: '',
    ...(isCrewRole.value
      ? {
          name: '',
          birthDate: '',
          nationality: '',
        }
      : {}),
  })

  if (isCrewRole.value && field === 'ineFront') {
    emit('merge-fields', {
      ineBack: null,
      ineBackName: '',
      ineBackPreviewUrl: '',
    })
  }
}

function clearDocumentFile(field) {
  revokePreviewUrl(props.form?.[`${field}PreviewUrl`])
  emit('merge-fields', {
    [field]: null,
    [`${field}Name`]: '',
    [`${field}PreviewUrl`]: '',
  })

  if (!isCrewRole.value) {
    markIdentificationDraftChanged()
  }
}

function mergeIneData(form, detectedData) {
  return {
    ineScanRaw: detectedData.raw || form.ineScanRaw,
    ineCurp: detectedData.curp || form.ineCurp,
    documentNumber: detectedData.clave || form.documentNumber,
    documentExpiration: detectedData.expirationDate || form.documentExpiration,
    ineCic: detectedData.cic || form.ineCic,
    ineOcr: detectedData.ocr || form.ineOcr,
    name: form.name || detectedData.name || '',
    birthDate: form.birthDate || detectedData.birthDate || '',
    nationality: form.nationality || (detectedData.curp ? 'Mexicana' : ''),
  }
}

function hasUsefulScanData(data) {
  return Boolean(data.curp || data.clave || data.cic || data.ocr || data.name)
}

function detectedFieldsLabel(data) {
  const fields = [
    data.clave ? 'numero de documento' : '',
    data.expirationDate ? 'vigencia' : '',
    data.curp ? 'CURP' : '',
    data.cic ? 'CIC' : '',
    data.ocr ? 'OCR' : '',
    data.name ? 'nombre' : '',
    data.birthDate ? 'fecha de nacimiento' : '',
  ].filter(Boolean)

  return fields.join(', ')
}

function hasDetectedEditableData(form) {
  if (isCrewRole.value) {
    return Boolean(
      form.name ||
        form.birthDate ||
        form.nationality ||
        form.documentNumber ||
        form.documentIssueDate ||
        form.documentExpiration ||
        form.licenseCategory ||
        form.issuingCountry,
    )
  }

  return Boolean(
    form.name ||
      form.birthDate ||
      form.nationality ||
      form.documentExpiration ||
      form.documentNumber ||
      form.ineCurp ||
      form.ineCic ||
      form.ineOcr,
  )
}

function parseDateCandidate(value = '') {
  const normalized = String(value || '').trim()
  if (!normalized) return ''

  const isoMatch = normalized.match(/^(\d{4})[-/.](\d{2})[-/.](\d{2})$/)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`

  const latinMatch = normalized.match(/^(\d{2})[-/.](\d{2})[-/.](\d{4})$/)
  if (latinMatch) return `${latinMatch[3]}-${latinMatch[2]}-${latinMatch[1]}`

  const monthNames = {
    ENE: '01',
    ENERO: '01',
    FEB: '02',
    FEBRERO: '02',
    MAR: '03',
    MARZO: '03',
    ABR: '04',
    ABRIL: '04',
    APR: '04',
    MAY: '05',
    MAYO: '05',
    JUN: '06',
    JUNIO: '06',
    JUL: '07',
    JULIO: '07',
    AGO: '08',
    AGOSTO: '08',
    AUG: '08',
    SEP: '09',
    SEPT: '09',
    SEPTIEMBRE: '09',
    OCT: '10',
    OCTUBRE: '10',
    NOV: '11',
    NOVIEMBRE: '11',
    DIC: '12',
    DICIEMBRE: '12',
    DEC: '12',
  }

  const textualMonthMatch = normalized
    .toUpperCase()
    .match(/^(\d{1,2})[-/. ]([A-Z]{3,10})[-/. ](\d{4})$/)

  if (textualMonthMatch) {
    const month = monthNames[textualMonthMatch[2]]
    if (!month) return ''

    return `${textualMonthMatch[3]}-${month}-${textualMonthMatch[1].padStart(2, '0')}`
  }

  const spanishTextualMonthMatch = normalized
    .toUpperCase()
    .match(/^(\d{1,2})\s+DE\s+([A-Z]{3,10})\s+DE\s+(\d{4})$/)

  if (spanishTextualMonthMatch) {
    const month = monthNames[spanishTextualMonthMatch[2]]
    if (!month) return ''

    return `${spanishTextualMonthMatch[3]}-${month}-${spanishTextualMonthMatch[1].padStart(2, '0')}`
  }

  return ''
}

function calculateDocumentStatus(expirationDate = '') {
  if (!expirationDate) return ''

  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const expiration = new Date(`${expirationDate}T00:00:00`)
  if (Number.isNaN(expiration.getTime())) return ''

  const diffDays = Math.ceil((expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'Vencida'
  if (diffDays <= 30) return 'Por vencer'
  return 'Vigente'
}

function isEmptyValue(value) {
  return value === null || value === undefined || String(value).trim() === ''
}

function isIsoDate(value = '') {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim())
}

function getMergeModeLabel(mode = 'safe_overwrite') {
  return mode === 'force_overwrite' ? 'force_overwrite' : 'safe_overwrite'
}

function shouldReplaceDetectedField(field, currentValue, nextValue) {
  if (isEmptyValue(nextValue)) return false

  const current = String(currentValue || '').trim()
  const next = String(nextValue || '').trim()

  if (!current) return true
  if (current === next) return false

  if (field === 'documentNumber') {
    if (/^\d{8,}-\d{2,}$/.test(next)) return true
    return next.replace(/[^A-Z0-9]/gi, '').length > current.replace(/[^A-Z0-9]/gi, '').length
  }

  if (['birthDate', 'documentIssueDate', 'documentExpiration'].includes(field)) {
    return isIsoDate(next)
  }

  if (field === 'name') {
    const currentScore = current.split(/\s+/).filter((token) => token.length > 1).length
    const nextScore = next.split(/\s+/).filter((token) => token.length > 1).length
    return nextScore >= Math.max(2, currentScore)
  }

  if (field === 'nationality') {
    return /mexican|mexican[ao]|mexicana|mexicano/i.test(next) || next.length > current.length
  }

  if (field === 'licenseCategory') {
    return /sobrecargo|cabin crew/i.test(next) || next.length > current.length
  }

  if (field === 'issuingCountry') {
    return /mexico/i.test(next) || next.length > current.length
  }

  return next.length >= current.length
}

function mergeDetectedFields(currentData, detectedData, mode = 'safe_overwrite') {
  const normalizedMode = getMergeModeLabel(mode)
  const merged = { ...detectedData }

  Object.entries(detectedData || {}).forEach(([field, nextValue]) => {
    const currentValue = currentData?.[field]

    if (field === 'ineScanRaw' || field === 'ineScanStatus' || field === 'documentStatus') {
      merged[field] = nextValue
      return
    }

    if (isEmptyValue(nextValue)) {
      merged[field] = currentValue || nextValue
      return
    }

    if (normalizedMode === 'force_overwrite') {
      merged[field] = nextValue
      return
    }

    if (isEmptyValue(currentValue)) {
      merged[field] = nextValue
      return
    }

    merged[field] = shouldReplaceDetectedField(field, currentValue, nextValue) ? nextValue : currentValue
  })

  return merged
}

function pickFirstValue(source = {}, paths = []) {
  for (const path of paths) {
    const value = path.split('.').reduce((current, key) => current?.[key], source)
    if (!isEmptyValue(value)) return value
  }

  return ''
}

function mapStructuredScanResult(scanResult = {}) {
  const legacy = scanResult?.legacy && typeof scanResult.legacy === 'object' ? scanResult.legacy : {}
  const documentStatus = legacy.documentStatus || calculateDocumentStatus(legacy.documentExpiration || '')
  const detectedName = scanResult?.fields?.name

  return {
    ...legacy,
    name:
      detectedName?.value &&
      Number(detectedName.confidence || 0) >= 70 &&
      detectedName.requiresReview !== true
        ? sanitizeBackendName(detectedName.value)
        : '',
    birthDate: parseDateCandidate(legacy.birthDate) || '',
    documentIssueDate: parseDateCandidate(legacy.documentIssueDate) || '',
    documentExpiration: parseDateCandidate(legacy.documentExpiration) || '',
    documentStatus,
    scanWarnings: Array.isArray(legacy.scanWarnings) ? legacy.scanWarnings : [],
    scanReviewFields: Array.isArray(legacy.scanReviewFields) ? legacy.scanReviewFields : [],
    scanDocumentType: legacy.scanDocumentType || scanResult.documentType || normalizedSelectedDocumentType.value,
    scanQuality: legacy.scanQuality || scanResult.quality || {},
    scanProcessingTimeMs: Number(legacy.scanProcessingTimeMs || scanResult.processingTimeMs || 0),
  }
}

function translateScanWarning(code = '') {
  return WARNING_MESSAGES[code] || String(code || '').replace(/_/g, ' ')
}

function translateReviewField(field = '') {
  return REVIEW_FIELD_MESSAGES[field] || String(field || '').replace(/_/g, ' ')
}

const userFacingWarnings = computed(() =>
  scanWarnings.value
    .filter((warning) => !/^missing_optional_(cic|ocr|document_status)$/.test(String(warning || '')))
    .map((warning) => translateScanWarning(warning)),
)

const userFacingReviewFields = computed(() =>
  scanReviewFields.value.map((field) => translateReviewField(field)),
)

function buildScanSummary(scanResult = {}, mapped = {}) {
  const warnings = Array.isArray(scanResult?.warnings) ? scanResult.warnings : []
  const reviewFields = Array.isArray(scanResult?.reviewFields) ? scanResult.reviewFields : []
  const fieldsCount = Object.values(scanResult?.fields || {}).filter((field) => field?.value).length
  const optionalWarnings = warnings.filter((warning) => !String(warning || '').startsWith('missing_optional_'))
  const warningMessage = optionalWarnings.length
    ? ` Alertas: ${optionalWarnings.map((warning) => translateScanWarning(warning)).join(' ')}`
    : ''
  const reviewMessage = reviewFields.length
    ? ` Revisar manualmente: ${reviewFields.map((field) => translateReviewField(field)).join(', ')}.`
    : ''

  if (!fieldsCount) {
    return `No se detectaron campos confiables.${warningMessage}${reviewMessage}`.trim()
  }

  return `Escaneo completado con ${fieldsCount} campo(s) detectado(s).${warningMessage}${reviewMessage}`.trim()
}

function cancelDocumentScan() {
  scanAbortController.value?.abort()
}

async function scanIne(form, mode = 'safe_overwrite') {
  scanMessage.value = ''
  scanWarnings.value = []
  scanReviewFields.value = []

  if (!form.ineFront || (!isCrewRole.value && !form.ineBack)) {
    scanMessage.value = isCrewRole.value
      ? `Sube la imagen de la ${activeDocumentLabel.value} para escanearla.`
      : `Sube la imagen de frente y reverso para escanear la ${activeDocumentLabel.value}.`
    return
  }

  scanning.value = true
  scanStageLabel.value = 'Preparando imagen'
  scanStageProgress.value = 0
  scanAbortController.value = new AbortController()
  scanMessage.value = `Escaneando ${activeDocumentLabel.value}...`

  try {
    const scanResult = await scanDocumentFiles(
      {
        frontFile: form.ineFront,
        backFile: !isCrewRole.value ? form.ineBack : null,
        documentType: isCrewRole.value ? 'driver_license' : form.documentType,
      },
      {
        signal: scanAbortController.value.signal,
        onStageChange(stage) {
          scanStageLabel.value = stage.label
          scanStageProgress.value = stage.progress
        },
      },
    )
    const mapped = mapStructuredScanResult(scanResult)
    scanWarnings.value = mapped.scanWarnings || []
    scanReviewFields.value = mapped.scanReviewFields || []

    emit('merge-fields', mergeDetectedFields(form, {
      ...mapped,
      ineScanStatus: scanResult.success ? 'scanned' : 'partial',
    }, mode))

    scanMessage.value =
      mode === 'force_overwrite'
        ? `Reescaneo completado. ${buildScanSummary(scanResult, mapped)}`
        : buildScanSummary(scanResult, mapped)
  } catch (error) {
    emit('merge-fields', { ineScanStatus: 'pending' })
    const fallbackResult = error?.structuredResult || null
    if (fallbackResult) {
      scanWarnings.value = fallbackResult.warnings || []
      scanReviewFields.value = fallbackResult.reviewFields || []
    }

    if (error?.name === 'AbortError') {
      scanMessage.value = 'Escaneo cancelado. Puedes intentarlo nuevamente.'
    } else {
      scanMessage.value =
        error?.message ||
        `No fue posible leer la ${activeDocumentLabel.value}. Intenta con una imagen mas nitida o captura los datos manualmente.`
    }
  } finally {
    scanAbortController.value = null
    scanStageProgress.value = 100
    scanning.value = false
  }
}

function resetBiometricCapture(message = '') {
  verificationMessage.value = message
  cameraStatus.value = ''
  revokePreviewUrl(props.form.selfiePreviewUrl)
  emit('merge-fields', {
    selfieFile: null,
    selfieFileName: '',
    selfiePreviewUrl: '',
    identityVerificationStatus: '',
    identityVerificationMessage: message,
    identityVerified: false,
    faceDetected: false,
    faceMatchScore: null,
    livenessScore: null,
    imageStorageScore: 0,
    biometricImageSaved: false,
    biometricCapturedAt: '',
    biometricProvider: '',
    biometricTemplateType: '',
    facesCount: 0,
    faceConfidence: null,
    qualityBrightness: null,
    qualitySharpness: null,
    poseYaw: null,
    posePitch: null,
    poseRoll: null,
    faceOccluded: null,
  })
}

function applyBiometricValidationResult(result = {}, file, previewUrl) {
  const quality = result.quality && typeof result.quality === 'object' ? result.quality : {}
  const pose = result.pose && typeof result.pose === 'object' ? result.pose : {}

  emit('merge-fields', {
    selfieFile: file,
    selfieFileName: file?.name || '',
    selfiePreviewUrl: previewUrl,
    identityVerificationStatus: result.identityVerificationStatus || '',
    identityVerificationMessage: result.message || '',
    identityVerified: Boolean(result.identityVerified),
    faceDetected: Boolean(result.faceDetected),
    faceMatchScore: null,
    livenessScore: null,
    // The final upload happens atomically in /auth/register; this file is ready to send.
    imageStorageScore: file ? 100 : 0,
    biometricImageSaved: Boolean(file),
    biometricCapturedAt: new Date().toISOString(),
    biometricProvider: result.biometricProvider || 'aws_rekognition',
    biometricTemplateType: result.biometricTemplateType || 'selfie-photo',
    facesCount: Number(result.facesCount || 0),
    faceConfidence:
      result.faceConfidence === undefined || result.faceConfidence === null
        ? null
        : Number(result.faceConfidence),
    qualityBrightness:
      quality.brightness === undefined || quality.brightness === null
        ? null
        : Number(quality.brightness),
    qualitySharpness:
      quality.sharpness === undefined || quality.sharpness === null
        ? null
        : Number(quality.sharpness),
    poseYaw: pose.yaw === undefined || pose.yaw === null ? null : Number(pose.yaw),
    posePitch: pose.pitch === undefined || pose.pitch === null ? null : Number(pose.pitch),
    poseRoll: pose.roll === undefined || pose.roll === null ? null : Number(pose.roll),
    faceOccluded:
      result.faceOccluded === undefined || result.faceOccluded === null
        ? null
        : Boolean(result.faceOccluded),
  })
}

async function validateCapturedSelfie(file, previewUrl) {
  validating.value = true
  cameraStatus.value = 'Validando rostro...'

  try {
    const formData = new FormData()
    formData.append('selfie', file)

    const result = await api.postForm(BIOMETRIC_DETECT_FACE_PATH, formData, {
      timeoutMs: 45000,
      preserveAuthOnUnauthorized: true,
    })

    applyBiometricValidationResult(result, file, previewUrl)
    verificationMessage.value = result.message || ''
    cameraStatus.value = result.identityVerified
      ? 'Rostro validado correctamente.'
      : 'La selfie fue analizada pero no quedo aprobada.'
  } catch (error) {
    const rejectionMessage =
      error?.status === 401
        ? 'La validacion del rostro fue rechazada por el backend.'
        : error?.payload?.message || error?.message || 'No se pudo validar el rostro.'

    applyBiometricValidationResult(
      {
        message: rejectionMessage,
        identityVerified: false,
        identityVerificationStatus: 'rejected',
        biometricProvider: 'aws_rekognition',
        biometricTemplateType: 'selfie-photo',
        biometricImageSaved: true,
        faceDetected: false,
        facesCount: 0,
        faceConfidence: null,
        faceOccluded: null,
      },
      file,
      previewUrl,
    )
    verificationMessage.value = rejectionMessage
    cameraStatus.value = 'Validacion rechazada. Captura una nueva selfie.'
  } finally {
    validating.value = false
  }
}

async function startCamera() {
  cameraLoading.value = true
  verificationMessage.value = ''
  cameraStatus.value = 'Abriendo camara...'

  try {
    if (!navigator?.mediaDevices?.getUserMedia) {
      throw new Error('Este dispositivo no permite abrir la camara desde el navegador.')
    }

    stopCamera()

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    })

    activeStream.value = stream
    cameraActive.value = true

    await nextTick()

    if (videoRef.value) {
      videoRef.value.srcObject = stream
      await videoRef.value.play()
    }

    cameraStatus.value = 'Camara lista. Toma tu selfie.'
  } catch (error) {
    cameraActive.value = false
    verificationMessage.value =
      error?.name === 'NotAllowedError'
        ? 'Necesitamos permiso de camara para registrar la selfie.'
        : error?.message || 'No fue posible abrir la camara.'
  } finally {
    cameraLoading.value = false
  }
}

function stopCamera() {
  if (videoRef.value) {
    videoRef.value.pause()
    videoRef.value.srcObject = null
  }

  activeStream.value?.getTracks?.().forEach((track) => track.stop())
  activeStream.value = null
  cameraActive.value = false
}

async function captureBiometricSelfie() {
  if (!videoRef.value || !cameraActive.value) {
    verificationMessage.value = 'Abre la camara antes de capturar la selfie.'
    return
  }

  capturing.value = true
  verificationMessage.value = ''

  try {
    const canvas = captureVideoFrame(videoRef.value)
    const file = await canvasToFile(canvas, 'selfie-biometrica.jpg')

    revokePreviewUrl(props.form.selfiePreviewUrl)

    const previewUrl = canvas.toDataURL('image/jpeg', 0.92)
    emit('merge-fields', {
      selfieFile: file,
      selfieFileName: file.name,
      selfiePreviewUrl: previewUrl,
      identityVerificationStatus: 'pending_backend_validation',
      identityVerificationMessage: 'Selfie capturada. Validando rostro...',
      identityVerified: false,
      faceDetected: false,
      faceMatchScore: null,
      livenessScore: null,
      imageStorageScore: 100,
      biometricImageSaved: true,
      biometricCapturedAt: new Date().toISOString(),
      biometricProvider: 'camera_capture',
      biometricTemplateType: 'selfie-photo',
    })

    cameraStatus.value = 'Preview lista. Enviando selfie a validacion.'
    await validateCapturedSelfie(file, previewUrl)
  } catch (error) {
    resetBiometricCapture(error?.message || 'No pudimos capturar la selfie desde la camara.')
  } finally {
    capturing.value = false
  }
}

onBeforeUnmount(() => {
  scanAbortController.value?.abort()
  stopCamera()
  revokePreviewUrl(props.form.selfiePreviewUrl)
  revokePreviewUrl(props.form.ineFrontPreviewUrl)
  revokePreviewUrl(props.form.ineBackPreviewUrl)
  clearAirportTimer()
})
</script>

<template>
  <div class="step-fields">
    <transition name="ine-loading-fade">
      <div
        v-if="scanning"
        class="ine-loading-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ine-loading-title"
      >
        <div class="ine-loading-backdrop"></div>
        <div class="ine-loading-card">
          <span class="ine-loading-orb" aria-hidden="true"></span>
          <p class="eyebrow">Escaneo en proceso</p>
          <h3 id="ine-loading-title">Leyendo tu {{ activeDocumentLabelUpper }}</h3>
          <p class="muted">{{ scanStageLabel }}</p>
          <div class="ine-loading-progress" aria-hidden="true">
            <span :style="{ width: `${scanStageProgress}%` }"></span>
          </div>
          <small class="muted">{{ scanStageProgress }}%</small>
          <button type="button" class="scan-button scan-button-secondary" @click="cancelDocumentScan">
            Cancelar
          </button>
        </div>
      </div>
    </transition>

    <template v-if="isCrewRole">
      <section class="register-block">
        <div class="block-head">
          <p class="eyebrow">Licencia de sobrecargo</p>
          <p class="block-copy">Sube la licencia y escaneala para completar automaticamente los datos del documento.</p>
        </div>

        <div class="license-upload-row">
          <label class="file-card">
            <span>{{ activeDocumentFrontLabel }}</span>
            <strong>{{ props.form.ineFrontName || 'Seleccionar archivo' }}</strong>
            <input type="file" accept="image/*" capture="environment" @change="handleIneFileSelected('ineFront', $event)" />
          </label>

          <div class="license-scan-actions">
            <button
              type="button"
              class="scan-button"
              :disabled="scanning"
              @click="scanIne(props.form, 'safe_overwrite')"
            >
              {{ scanning ? activeScanningLabel : activeScanButtonLabel }}
            </button>

            <button
              type="button"
              class="scan-button scan-button-secondary"
              :disabled="scanning"
              @click="scanIne(props.form, 'force_overwrite')"
            >
              {{ activeRescanButtonLabel }}
            </button>
          </div>
        </div>

        <div v-if="props.form.ineFrontPreviewUrl" class="document-preview-grid">
          <article class="document-preview-card">
            <span>{{ activeDocumentFrontLabel }}</span>
            <img :src="props.form.ineFrontPreviewUrl" :alt="activeDocumentFrontLabel" />
            <button type="button" class="secondary-button" @click="clearDocumentFile('ineFront')">Tomar nuevamente</button>
          </article>
        </div>

        <div class="form-grid">
          <label>
            Numero de licencia
            <input :value="props.form.documentNumber" type="text" placeholder="Se llena al escanear" @input="updateField('documentNumber', $event.target.value)" />
          </label>

          <label>
            Tipo de documento
            <input :value="props.form.licenseType || props.form.documentType" type="text" @input="updateField('licenseType', $event.target.value)" />
          </label>

          <label>
            Categoria / cargo
            <input :value="props.form.licenseCategory" type="text" placeholder="Pendiente por detectar" @input="updateField('licenseCategory', $event.target.value)" />
          </label>

          <label>
            Fecha de emision
            <input
              :value="props.form.documentIssueDate"
              type="date"
              @input="updateField('documentIssueDate', $event.target.value)"
            />
          </label>

          <label>
            Fecha de vencimiento / vigencia
            <input
              :value="props.form.documentExpiration"
              type="date"
              @input="updateField('documentExpiration', $event.target.value)"
            />
          </label>

          <label>
            Pais emisor del documento
            <input :value="props.form.issuingCountry" type="text" placeholder="Pendiente por detectar" @input="updateField('issuingCountry', $event.target.value)" />
          </label>

          <label>
            Fecha de nacimiento
            <input
              :value="props.form.birthDate"
              type="date"
              @input="updateField('birthDate', $event.target.value)"
            />
          </label>

          <label>
            Nacionalidad del titular
            <input
              :value="props.form.nationality"
              type="text"
              placeholder="Pendiente por detectar"
              @input="updateField('nationality', $event.target.value)"
            />
          </label>

          <label>
            Estado del documento
            <input :value="props.form.documentStatus" type="text" @input="updateField('documentStatus', $event.target.value)" />
          </label>

          <label class="airport-field">
            Base del sobrecargo
            <input
              :value="props.form.base"
              type="text"
              placeholder="Selecciona aeropuerto base"
              autocomplete="off"
              @focus="scheduleAirportSearch(props.form.base)"
              @blur="closeAirportOptions"
              @input="handleBaseInput"
            />
            <div
              v-if="airportLoading || (airportOptionsOpen && airportSuggestions.length)"
              class="airport-options"
            >
              <span v-if="airportLoading">Buscando aeropuertos...</span>
              <button
                v-for="airport in airportSuggestions"
                v-else
                :key="`${airport.code}-${airport.iata}-${airport.name}`"
                type="button"
                @mousedown.prevent="selectBaseAirport(airport)"
              >
                {{ formatAirportOption(airport) }}
              </button>
            </div>
          </label>
        </div>

        <label class="checkbox-field">
          <input
            :checked="props.form.identityValidationRequired"
            type="checkbox"
            @change="updateField('identityValidationRequired', $event.target.checked)"
          />
          <span>Requiere validar identidad con foto del documento</span>
        </label>
      </section>

    </template>

    <template v-else>
      <section class="register-block">
        <div class="block-head">
          <p class="eyebrow">Identificación oficial</p>
          <p class="block-copy">
            Captura los datos manualmente, sube frente y reverso, y guarda un solo PDF antes de continuar.
          </p>
        </div>

        <div class="form-grid">
          <label data-field="documentType" :class="{ 'has-error': fieldError('documentType') }">
            Tipo de identificación
            <select :value="props.form.documentType" @change="updateField('documentType', $event.target.value)">
              <option v-for="option in documentTypeOptions" :key="option.value" :value="option.label">
                {{ option.label }}
              </option>
            </select>
            <small v-if="fieldError('documentType')" class="field-error">{{ fieldError('documentType') }}</small>
          </label>

          <label data-field="documentNumber" :class="{ 'has-error': fieldError('documentNumber') }">
            Número de documento
            <input
              :value="props.form.documentNumber"
              type="text"
              placeholder="Captura el número de documento"
              @input="updateField('documentNumber', $event.target.value)"
            />
            <small v-if="fieldError('documentNumber')" class="field-error">{{ fieldError('documentNumber') }}</small>
          </label>

          <label
            v-if="showIdentificationExpirationField()"
            data-field="documentExpiration"
            :class="{ 'has-error': fieldError('documentExpiration') }"
          >
            Vigencia
            <input
              :value="props.form.documentExpiration"
              type="date"
              @input="updateField('documentExpiration', $event.target.value)"
            />
            <small v-if="fieldError('documentExpiration')" class="field-error">
              {{ fieldError('documentExpiration') }}
            </small>
          </label>

          <label data-field="nationality" :class="{ 'has-error': fieldError('nationality') }">
            Nacionalidad
            <input
              :value="props.form.nationality"
              type="text"
              placeholder="Mexicana"
              @input="updateField('nationality', $event.target.value)"
            />
            <small v-if="fieldError('nationality')" class="field-error">{{ fieldError('nationality') }}</small>
          </label>

          <label data-field="ineCurp" :class="{ 'has-error': fieldError('ineCurp') }">
            CURP
            <input
              :value="props.form.ineCurp"
              type="text"
              placeholder="Captura tu CURP"
              @input="updateField('ineCurp', $event.target.value)"
            />
            <small v-if="fieldError('ineCurp')" class="field-error">{{ fieldError('ineCurp') }}</small>
          </label>

          <label class="checkbox-field">
            <input
              :checked="props.form.identityValidationRequired"
              type="checkbox"
              @change="updateField('identityValidationRequired', $event.target.checked)"
            />
            <span>Requiere validar identidad con selfie</span>
          </label>
        </div>

        <div class="identification-upload-grid">
          <article
            data-field="ineFront"
            class="document-side-card"
            :class="{ 'has-error': fieldError('ineFront') }"
          >
            <div class="document-side-head">
              <strong>Frente de la identificación</strong>
              <small>{{ props.form.ineFrontName || 'Aún no has seleccionado un archivo' }}</small>
            </div>

            <div class="document-side-actions">
              <button type="button" class="secondary-button" @click="openIdentificationPicker('front', 'upload')">
                Subir archivo
              </button>
              <button type="button" class="secondary-button" @click="openIdentificationPicker('front', 'camera')">
                Tomar fotografía
              </button>
            </div>

            <input
              ref="frontUploadInputRef"
              class="sr-only"
              type="file"
              :accept="identificationInputAccept"
              @change="handleIneFileSelected('ineFront', $event)"
            />
            <input
              ref="frontCameraInputRef"
              class="sr-only"
              type="file"
              :accept="identificationInputAccept"
              capture="environment"
              @change="handleIneFileSelected('ineFront', $event)"
            />
            <small v-if="fieldError('ineFront')" class="field-error">{{ fieldError('ineFront') }}</small>
          </article>

          <article
            data-field="ineBack"
            class="document-side-card"
            :class="{ 'has-error': fieldError('ineBack') }"
          >
            <div class="document-side-head">
              <strong>Reverso de la identificación</strong>
              <small>{{ props.form.ineBackName || 'Aún no has seleccionado un archivo' }}</small>
            </div>

            <div class="document-side-actions">
              <button type="button" class="secondary-button" @click="openIdentificationPicker('back', 'upload')">
                Subir archivo
              </button>
              <button type="button" class="secondary-button" @click="openIdentificationPicker('back', 'camera')">
                Tomar fotografía
              </button>
            </div>

            <input
              ref="backUploadInputRef"
              class="sr-only"
              type="file"
              :accept="identificationInputAccept"
              @change="handleIneFileSelected('ineBack', $event)"
            />
            <input
              ref="backCameraInputRef"
              class="sr-only"
              type="file"
              :accept="identificationInputAccept"
              capture="environment"
              @change="handleIneFileSelected('ineBack', $event)"
            />
            <small v-if="fieldError('ineBack')" class="field-error">{{ fieldError('ineBack') }}</small>
          </article>
        </div>

        <div v-if="props.form.ineFrontPreviewUrl || props.form.ineBackPreviewUrl" class="document-preview-grid">
          <article v-if="props.form.ineFrontPreviewUrl" class="document-preview-card">
            <span>{{ activeDocumentFrontLabel }}</span>
            <img
              v-if="previewKindForFile(props.form.ineFront) === 'image'"
              :src="props.form.ineFrontPreviewUrl"
              :alt="identificationPreviewAlt(activeDocumentFrontLabel)"
            />
            <div v-else class="pdf-preview-card">
              <strong>{{ renderPdfPreviewLabel(props.form.ineFrontName) }}</strong>
              <small>Se usará la primera página del PDF en el documento final.</small>
            </div>
            <button type="button" class="secondary-button" @click="clearDocumentFile('ineFront')">
              {{ identificationChangeActionLabel(props.form.ineFront) }}
            </button>
          </article>

          <article v-if="props.form.ineBackPreviewUrl" class="document-preview-card">
            <span>{{ activeDocumentBackLabel }}</span>
            <img
              v-if="previewKindForFile(props.form.ineBack) === 'image'"
              :src="props.form.ineBackPreviewUrl"
              :alt="identificationPreviewAlt(activeDocumentBackLabel)"
            />
            <div v-else class="pdf-preview-card">
              <strong>{{ renderPdfPreviewLabel(props.form.ineBackName) }}</strong>
              <small>Se usará la primera página del PDF en el documento final.</small>
            </div>
            <button type="button" class="secondary-button" @click="clearDocumentFile('ineBack')">
              {{ identificationChangeActionLabel(props.form.ineBack) }}
            </button>
          </article>
        </div>

        <div
          data-field="identificationUpload"
          class="identification-save-row"
          :class="{ 'has-error': fieldError('identificationUpload') }"
        >
          <button
            type="button"
            class="primary-button"
            :disabled="['generating', 'uploading'].includes(String(props.form.identificationUploadStatus || ''))"
            @click="saveIdentificationDocument"
          >
            {{
              props.form.identificationUploadStatus === 'generating'
                ? 'Generando PDF...'
                : props.form.identificationUploadStatus === 'uploading'
                  ? 'Guardando identificación...'
                  : 'Guardar identificación'
            }}
          </button>

          <article class="score-card" :class="['status-card', identificationStatusTone, { active: true }]">
            <span>Estado</span>
            <strong>{{ identificationStatusLabel }}</strong>
            <small v-if="props.form.identificationUploadError">{{ props.form.identificationUploadError }}</small>
            <small v-else-if="props.form.identificationDocumentUrl">
              Documento listo para registro.
            </small>
            <small v-else>
              Genera y guarda el PDF antes de continuar.
            </small>
          </article>
        </div>
        <small v-if="fieldError('identificationUpload')" class="field-error">
          {{ fieldError('identificationUpload') }}
        </small>
      </section>
    </template>

    <section v-if="showBiometricPanel" class="verification-panel">
      <div class="verification-head">
        <div>
          <p class="eyebrow">Registro biometrico</p>
        </div>
        <strong
          class="verification-badge"
          :class="responseState.tone === 'validated' ? 'is-success' : 'is-pending'"
        >
          {{ responseState.label }}
        </strong>
      </div>

      <div class="verification-steps">
        <span
          v-for="step in flowSteps"
          :key="step.number"
          class="verification-step-chip"
          :class="{ complete: step.complete }"
        >
          {{ step.number }}. {{ step.label }}
        </span>
      </div>

      <div class="camera-grid">
        <div class="camera-stage">
          <div v-if="cameraActive" class="camera-frame">
            <div class="camera-live-pill">Live</div>
            <video ref="videoRef" playsinline muted autoplay></video>
          </div>

          <div v-else class="camera-placeholder">
            <strong>Validacion facial</strong>
            <span>
              Abrimos la camara del navegador, capturamos la selfie y la enviamos al backend al
              completar el registro. No instalamos nada extra.
            </span>
          </div>

          <div class="camera-actions">
            <button
              v-if="!cameraActive"
              type="button"
              class="secondary-button"
              :disabled="cameraLoading"
              @click="startCamera"
            >
              {{ cameraLoading ? 'Abriendo camara...' : 'Abrir camara' }}
            </button>

            <button
              v-if="cameraActive"
              type="button"
              class="primary-button"
              :disabled="capturing || validating"
              @click="captureBiometricSelfie"
            >
              {{ capturing ? 'Capturando selfie...' : validating ? 'Validando rostro...' : 'Capturar selfie' }}
            </button>

            <button
              v-if="cameraActive"
              type="button"
              class="secondary-button"
              :disabled="capturing || validating"
              @click="stopCamera"
            >
              Cerrar camara
            </button>

            <button
              v-if="props.form.selfieFile"
              type="button"
              class="secondary-button"
              :disabled="capturing || validating"
              @click="resetBiometricCapture('Selfie eliminada. Puedes capturar una nueva imagen.')"
            >
              Quitar selfie
            </button>
          </div>

          <p v-if="cameraStatus" class="scan-message">{{ cameraStatus }}</p>
          <p class="scan-message">
            La selfie se valida de inmediato contra el backend al momento de capturarla.
          </p>
        </div>

        <div class="verification-summary">
          <div class="summary-headline">
            <p class="eyebrow">Respuesta</p>
            <h4>Estado del backend</h4>
          </div>

          <article
            class="score-card"
            :class="['status-card', responseState.tone, { active: Boolean(props.form.selfiePreviewUrl) }]"
          >
            <span>Estado</span>
            <strong>{{ responseState.label }}</strong>
            <small>{{ responseState.detail }}</small>
          </article>

          <article v-if="props.form.faceConfidence !== null" class="score-card">
            <span>Confianza facial</span>
            <strong>{{ props.form.faceConfidence }}%</strong>
            <small>
              {{ props.form.facesCount || 0 }} rostro detectado, oclusion:
              {{ props.form.faceOccluded === null ? 'sin dato' : props.form.faceOccluded ? 'si' : 'no' }}.
            </small>
          </article>

          <article
            v-if="props.form.qualityBrightness !== null || props.form.qualitySharpness !== null"
            class="score-card"
          >
            <span>Calidad</span>
            <strong>
              {{ props.form.qualityBrightness ?? '-' }} / {{ props.form.qualitySharpness ?? '-' }}
            </strong>
            <small>Brightness / Sharpness reportados por el proveedor biometrico.</small>
          </article>

          <article
            v-if="props.form.poseYaw !== null || props.form.posePitch !== null || props.form.poseRoll !== null"
            class="score-card"
          >
            <span>Pose</span>
            <strong>
              {{ props.form.poseYaw ?? '-' }} / {{ props.form.posePitch ?? '-' }} / {{ props.form.poseRoll ?? '-' }}
            </strong>
            <small>Yaw / Pitch / Roll detectados en la selfie validada.</small>
          </article>

          <div v-if="props.form.selfiePreviewUrl" class="selfie-preview-card">
            <span>Preview de la selfie</span>
            <img :src="props.form.selfiePreviewUrl" alt="Preview de selfie seleccionada" />
          </div>

          <p v-if="verificationMessage || props.form.identityVerificationMessage" class="scan-message">
            {{ verificationMessage || props.form.identityVerificationMessage }}
          </p>
        </div>
      </div>

    </section>
  </div>
</template>

<style scoped>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.airport-field {
  position: relative;
}

.airport-options {
  position: absolute;
  top: calc(100% + 0.45rem);
  left: 0;
  right: 0;
  z-index: 30;
  display: grid;
  gap: 0.2rem;
  padding: 0.45rem;
  border: 1px solid rgba(16, 22, 28, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 42px rgba(16, 22, 28, 0.12);
}

.airport-options span {
  padding: 0.8rem 0.95rem;
  color: #75685d;
  font-size: 0.94rem;
}

.airport-options button {
  border: 0;
  background: transparent;
  border-radius: 14px;
  padding: 0.8rem 0.95rem;
  text-align: left;
  font: inherit;
  color: #181312;
  cursor: pointer;
}

.airport-options button:hover {
  background: rgba(191, 150, 56, 0.08);
}

.document-preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.9rem;
  margin: 1rem 0 1.2rem;
}

.document-preview-card {
  display: grid;
  gap: 0.75rem;
  padding: 0.9rem;
  border: 1px solid rgba(16, 22, 28, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.96);
}

.document-preview-card span {
  color: #75685d;
  font-size: 0.82rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.document-preview-card img {
  width: 100%;
  height: 180px;
  object-fit: cover;
  border-radius: 14px;
  background: #f7f2e8;
}

.identification-upload-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 0.9rem;
  margin-top: 1rem;
}

.document-side-card,
.pdf-preview-card {
  display: grid;
  gap: 0.8rem;
  padding: 1rem;
  border: 1px solid rgba(16, 22, 28, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.96);
}

.document-side-head {
  display: grid;
  gap: 0.2rem;
}

.document-side-head strong,
.pdf-preview-card strong {
  color: #181312;
}

.document-side-head small,
.pdf-preview-card small {
  color: #75685d;
}

.document-side-actions,
.identification-save-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

.identification-save-row {
  margin-top: 1rem;
}

.identification-save-row .primary-button {
  min-height: 2.9rem;
  padding: 0.65rem 1rem;
  border-radius: 12px;
  font-size: 0.88rem;
  white-space: nowrap;
  box-shadow: 0 10px 20px rgba(217, 161, 46, 0.18);
}

.identification-save-row .score-card {
  min-height: auto;
  padding: 0.9rem 1rem;
  border-radius: 18px;
  align-content: center;
  flex: 1 1 18rem;
}

.identification-save-row .score-card strong {
  font-size: clamp(1.2rem, 2.2vw, 1.8rem);
  line-height: 1.05;
}

.identification-save-row .score-card small {
  font-size: 0.78rem;
}
</style>
