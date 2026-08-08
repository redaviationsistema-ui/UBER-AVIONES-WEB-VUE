<script setup>
import { computed, defineAsyncComponent, nextTick, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BrandLogo from '../components/BrandLogo.vue'
import RegisterProgress from '../features/register/RegisterProgress.vue'
import {
  allowedRoles,
  buildRegistrationSteps,
  roleLabels,
} from '../features/register/registrationSteps'
import {
  validateProviderProfileStep,
} from '../features/register/registerValidation'
import { validateIdentificationFiles } from '../features/register/identificationUpload'
import '../features/register/registerWizard.css'
import { useAuthStore } from '../stores/auth'

const RegisterClientStep = defineAsyncComponent(
  () => import('../features/register/RegisterClientStep.vue'),
)
const RegisterCredentialsStep = defineAsyncComponent(
  () => import('../features/register/RegisterCredentialsStep.vue'),
)
const RegisterIneStep = defineAsyncComponent(
  () => import('../features/register/RegisterIneStep.vue'),
)
const RegisterRoleStep = defineAsyncComponent(
  () => import('../features/register/RegisterRoleStep.vue'),
)

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const currentStep = ref(0)
const errorMessage = ref('')
const successMessage = ref('')
const errorModalOpen = ref(false)
const errorModalTitle = ref('No fue posible crear la cuenta')
const errorModalMessage = ref('')
const errorModalDetails = ref([])
const formErrors = reactive({})
const form = reactive({
  name: '',
  companyName: '',
  commercialName: '',
  legalName: '',
  companyPhone: '',
  companyEmail: '',
  email: '',
  phone: '',
  birthDate: '',
  nationality: '',
  base: '',
  password: '',
  passwordConfirmation: '',
  role:
    typeof route.query.role === 'string' && allowedRoles.includes(route.query.role)
      ? route.query.role
      : 'client',
  documentType: 'INE',
  documentNumber: '',
  documentIssueDate: '',
  documentExpiration: '',
  documentStatus: '',
  identityValidationRequired: true,
  ineCurp: '',
  ineCic: '',
  ineOcr: '',
  ineScanRaw: '',
  ineScanStatus: '',
  licenseType: '',
  licenseCategory: '',
  issuingCountry: '',
  ineFront: null,
  ineFrontName: '',
  ineFrontPreviewUrl: '',
  ineBack: null,
  ineBackName: '',
  ineBackPreviewUrl: '',
  identificationUploadStatus: 'pending',
  identificationUploadError: '',
  identificationDocumentId: '',
  identificationStorageDisk: '',
  identificationStoragePath: '',
  identificationFileUrl: '',
  identificationDocumentUrl: '',
  identificationPdfName: '',
  scanWarnings: [],
  scanReviewFields: [],
  scanDocumentType: '',
  scanQuality: null,
  scanProcessingTimeMs: 0,
  scanProgressStages: [],
  selfieFile: null,
  selfieFileName: '',
  selfiePreviewUrl: '',
  identityVerificationStatus: '',
  identityVerificationMessage: '',
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
  billingRfc: '',
  billingName: '',
  billingRegime: '',
  billingPostalCode: '',
  billingCfdiUse: '',
})

const wizardSteps = computed(() => buildRegistrationSteps(form.role))
const selectedStep = computed(() => wizardSteps.value[currentStep.value] || wizardSteps.value[0])
const selectedRoleLabel = computed(() => roleLabels[form.role] || 'Cliente')
const isLastStep = computed(() => currentStep.value === wizardSteps.value.length - 1)
const isProviderRole = computed(() => form.role === 'provider')
const registerIntroCopy = computed(() =>
  form.role === 'sobrecargo'
    ? 'Define primero el rol de acceso, completa los datos del usuario, registra la licencia de sobrecargo y al final crea el correo y la contrasena.'
    : isProviderRole.value
      ? 'Define primero el rol de acceso, captura la empresa y su representante legal, registra la documentacion y al final crea el correo y la contrasena.'
      : 'Define primero el rol de acceso, completa los datos del usuario, registra la selfie biometrica y al final crea el correo y la contrasena. Si el rol es cliente, entrara primero a una cotizacion gratis y despues podra activar la membresia mensual de USD $115.',
)
const loginRoute = computed(() =>
  form.role === 'client'
    ? { name: 'login-cliente' }
    : { name: 'login-cliente' },
)
const backRoute = computed(() =>
  form.role === 'client'
    ? { name: 'login-cliente' }
    : { name: 'login-cliente' },
)

const currentStepId = computed(() => selectedStep.value?.id || wizardSteps.value[0]?.id || '')
const isCrewRole = computed(() => form.role === 'sobrecargo')

function documentTypeForRole(role) {
  return role === 'sobrecargo' ? 'Licencia de sobrecargo' : 'INE'
}

function calculateDocumentStatus(expirationDate) {
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

watch(
  wizardSteps,
  (steps) => {
    if (currentStep.value > steps.length - 1) {
      currentStep.value = Math.max(steps.length - 1, 0)
    }
  },
  { immediate: true },
)

watch(
  () => form.role,
  (role) => {
    form.documentType = documentTypeForRole(role)
    if (role !== 'sobrecargo') {
      form.licenseType = ''
      form.licenseCategory = ''
      form.documentIssueDate = ''
      form.issuingCountry = ''
    } else {
      form.licenseType = form.licenseType || 'Licencia de sobrecargo'
    }
    form.documentStatus = calculateDocumentStatus(form.documentExpiration)
  },
  { immediate: true },
)

function setFile(field, event) {
  const file = event.target.files?.[0] || null
  clearFieldError(field)
  clearFieldError('identificationUpload')
  form[field] = file
  form[`${field}Name`] = file?.name || ''
  form.selfieFile = null
  form.selfieFileName = ''
  form.selfiePreviewUrl = ''
  form.identityVerificationStatus = ''
  form.identityVerificationMessage = ''
  form.identityVerified = false
  form.faceDetected = false
  form.faceMatchScore = null
  form.livenessScore = null
  form.imageStorageScore = 0
  form.biometricImageSaved = false
  form.biometricCapturedAt = ''
  form.biometricProvider = ''
  form.biometricTemplateType = ''
  form.facesCount = 0
  form.faceConfidence = null
  form.qualityBrightness = null
  form.qualitySharpness = null
  form.poseYaw = null
  form.posePitch = null
  form.poseRoll = null
  form.faceOccluded = null
}

function setFormField(field, value) {
  clearFieldError(field)

  if (field === 'identityValidationRequired' && !value) {
    resetFieldErrors([
      'documentType',
      'documentNumber',
      'documentExpiration',
      'nationality',
      'ineCurp',
      'ineFront',
      'ineBack',
      'identificationUpload',
    ])
  }

  if (field === 'documentType' && form.documentType !== value) {
    form.selfieFile = null
    form.selfieFileName = ''
    form.selfiePreviewUrl = ''
    form.identityVerificationStatus = ''
    form.identityVerificationMessage = ''
    form.identityVerified = false
    form.faceDetected = false
    form.faceMatchScore = null
    form.livenessScore = null
    form.imageStorageScore = 0
    form.biometricImageSaved = false
    form.biometricCapturedAt = ''
    form.biometricProvider = ''
    form.biometricTemplateType = ''
    form.facesCount = 0
    form.faceConfidence = null
    form.qualityBrightness = null
    form.qualitySharpness = null
    form.poseYaw = null
    form.posePitch = null
    form.poseRoll = null
    form.faceOccluded = null
  }

  if (field === 'identityValidationRequired') {
    form.identityVerificationStatus = ''
    form.identityVerificationMessage = ''
    form.identityVerified = false
    form.faceDetected = false
    form.faceMatchScore = null
    form.livenessScore = null
    form.imageStorageScore = 0
    form.biometricImageSaved = false
    form.biometricCapturedAt = ''
    form.biometricProvider = ''
    form.biometricTemplateType = ''
    form.facesCount = 0
    form.faceConfidence = null
    form.qualityBrightness = null
    form.qualitySharpness = null
    form.poseYaw = null
    form.posePitch = null
    form.poseRoll = null
    form.faceOccluded = null
    if (!value) {
      form.selfieFile = null
      form.selfieFileName = ''
      form.selfiePreviewUrl = ''
    }
  }

  form[field] = value

  if (field === 'documentExpiration') {
    form.documentStatus = calculateDocumentStatus(value)
  }
}

function mergeFormFields(patch = {}) {
  Object.entries(patch || {}).forEach(([field, value]) => {
    clearFieldError(field)
    form[field] = value
  })

  if (Object.prototype.hasOwnProperty.call(patch, 'documentExpiration')) {
    form.documentStatus = calculateDocumentStatus(form.documentExpiration)
  }
}

function clearFieldError(field) {
  if (!field) return
  formErrors[field] = ''
}

function resetFieldErrors(fields = []) {
  fields.forEach((field) => {
    formErrors[field] = ''
  })
}

function applySanitizedFormValues(sanitized = {}) {
  Object.entries(sanitized).forEach(([field, value]) => {
    if (Object.prototype.hasOwnProperty.call(form, field) && form[field] !== value) {
      form[field] = value
    }
  })
}

function getStepFieldOrder() {
  if (currentStepId.value !== 'perfil' || !isProviderRole.value) return []

  return [
    'companyName',
    'legalName',
    'companyPhone',
    'companyEmail',
    'name',
    'phone',
    'birthDate',
    'documentType',
    'documentNumber',
    'documentExpiration',
    'nationality',
    'ineCurp',
    'ineFront',
    'ineBack',
    'identificationUpload',
  ]
}

async function focusFirstInvalidField() {
  await nextTick()

  const firstInvalidField = getStepFieldOrder().find((field) => String(formErrors[field] || '').trim())
  if (!firstInvalidField || typeof document === 'undefined') return

  const fieldContainer = document.querySelector(`[data-field="${firstInvalidField}"]`)
  if (!fieldContainer) return

  fieldContainer.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  const focusTarget = fieldContainer.querySelector('input, select, textarea, button')
  focusTarget?.focus?.()
}

async function validateProviderProfileFields() {
  resetFieldErrors(getStepFieldOrder())

  const { errors, sanitized } = validateProviderProfileStep(form, {
    requireIdentification: form.identityValidationRequired !== false,
  })

  applySanitizedFormValues(sanitized)

  if (form.identityValidationRequired !== false) {
    if (!form.ineFront) {
      errors.ineFront = 'Carga el frente de la identificación.'
    }

    if (!form.ineBack) {
      errors.ineBack = 'Carga el reverso de la identificación.'
    }

    if (form.ineFront && form.ineBack) {
      try {
        await validateIdentificationFiles({
          frontFile: form.ineFront,
          backFile: form.ineBack,
        })
      } catch (error) {
        const targetField = error?.message?.toLowerCase().includes('reverso') ? 'ineBack' : 'ineFront'
        errors[targetField] = error?.message || 'Revisa los archivos de identificación.'
      }
    }

    if (form.identificationUploadStatus !== 'saved' || !form.identificationDocumentId) {
      errors.identificationUpload =
        form.identificationUploadError || 'Guarda la identificación antes de continuar.'
    }
  }

  Object.entries(errors).forEach(([field, message]) => {
    formErrors[field] = message
  })

  if (Object.keys(errors).length > 0) {
    errorMessage.value = 'Corrige los campos marcados para continuar.'
    await focusFirstInvalidField()
    return false
  }

  return true
}

async function validateCurrentStep() {
  errorMessage.value = ''

  if (currentStepId.value === 'rol') {
    if (!allowedRoles.includes(form.role)) {
      errorMessage.value = 'Selecciona un rol valido para la cuenta.'
      return false
    }
  }

  if (currentStepId.value === 'perfil') {
    if (isProviderRole.value) {
      return validateProviderProfileFields()
    }

    if (!form.name.trim() || !form.phone.trim()) {
      errorMessage.value = isProviderRole.value
        ? 'Completa nombre y telefono del representante legal.'
        : 'Completa nombre y telefono del usuario.'
      return false
    }

    if (isProviderRole.value && !form.companyName.trim()) {
      errorMessage.value = 'Completa el nombre comercial de la empresa para continuar con el registro.'
      return false
    }

    if (isProviderRole.value && (!form.companyPhone.trim() || !form.companyEmail.trim())) {
      errorMessage.value = 'Completa telefono y email de la empresa.'
      return false
    }

    if (!form.birthDate || !form.nationality.trim()) {
      errorMessage.value = 'Completa fecha de nacimiento y nacionalidad.'
      return false
    }

    if (form.identityValidationRequired) {
      if (!form.ineFront || (!isCrewRole.value && !form.ineBack)) {
        errorMessage.value =
          form.role === 'sobrecargo'
            ? 'Sube la imagen de la licencia para escanearla.'
            : 'Sube frente y reverso de la identificación.'
        return false
      }

      if (form.role === 'sobrecargo') {
        if (
          !form.licenseType.trim() ||
          !form.documentNumber.trim() ||
          !form.licenseCategory.trim() ||
          !form.documentIssueDate ||
          !form.documentExpiration ||
          !form.issuingCountry.trim()
        ) {
          errorMessage.value =
            'Completa tipo, numero, categoria, emision, vigencia y pais emisor de la licencia.'
          return false
        }
      } else if (!form.documentNumber.trim()) {
        errorMessage.value = 'Completa el numero de documento antes de continuar.'
        return false
      } else if (form.identificationUploadStatus !== 'saved' || !form.identificationDocumentId) {
        errorMessage.value =
          form.identificationUploadError || 'Guarda la identificación en PDF antes de continuar.'
        return false
      }
    }

    if (!isCrewRole.value && !isProviderRole.value) {
      const biometricCaptureReady =
        Boolean(form.selfieFile) &&
        Boolean(form.selfiePreviewUrl) &&
        String(form.identityVerificationStatus || '').trim() === 'approved' &&
        Boolean(form.identityVerified)

      if (form.identityValidationRequired && !biometricCaptureReady) {
        errorMessage.value =
          form.identityVerificationMessage || 'Valida la selfie biometrica antes de continuar.'
        return false
      }
    }
  }

  if (currentStepId.value === 'acceso') {
    if (!form.email.trim()) {
      errorMessage.value = 'Completa el correo de acceso.'
      return false
    }

    if (form.password.length < 8) {
      errorMessage.value = 'La contrasena debe tener al menos 8 caracteres.'
      return false
    }

    if (form.password !== form.passwordConfirmation) {
      errorMessage.value = 'Las contrasenas no coinciden.'
      return false
    }
  }

  return true
}

function normalizeErrorDetails(error) {
  const fieldErrors = error?.payload?.errors

  if (!fieldErrors || typeof fieldErrors !== 'object') {
    return []
  }

  function resolveFieldLabel(field) {
    if (field === 'email') return 'Correo electrónico'
    if (field === 'company_name') return 'Nombre comercial de la empresa'
    return field
  }

  function translateFieldMessage(field, message) {
    const normalizedMessage = String(message || '').trim().toLowerCase()

    if (field === 'email' && normalizedMessage.includes('has already been taken')) {
      return 'El correo electrónico ingresado ya se encuentra registrado.'
    }

    if (
      field === 'company_name' &&
      normalizedMessage.includes('company name field is required when role is provider')
    ) {
      return 'El nombre comercial de la empresa es obligatorio para continuar con el registro de operador.'
    }

    return String(message || '').replace(/^The\s+/i, '')
  }

  return Object.entries(fieldErrors).flatMap(([field, messages]) => {
    const fieldLabel = resolveFieldLabel(field)

    if (!Array.isArray(messages)) {
      return []
    }

    return messages
      .filter(Boolean)
      .map((message) => `${fieldLabel}: ${translateFieldMessage(field, message)}`)
  })
}

function openErrorModal(error) {
  errorModalTitle.value = 'No fue posible completar el registro'
  errorModalMessage.value = 'Detectamos información que requiere corrección antes de crear la cuenta.'
  errorModalDetails.value = normalizeErrorDetails(error)
  errorModalOpen.value = true
}

function closeErrorModal() {
  errorModalOpen.value = false
}

async function nextStep() {
  if (!(await validateCurrentStep())) return
  currentStep.value = Math.min(currentStep.value + 1, wizardSteps.value.length - 1)
}

function previousStep() {
  errorMessage.value = ''
  if (currentStep.value === 0) {
    router.push(backRoute.value)
    return
  }

  currentStep.value = Math.max(currentStep.value - 1, 0)
}

function appendFormValue(formData, key, value) {
  if (value === undefined || value === null) return

  if (value instanceof File) {
    formData.append(key, value)
    return
  }

  if (typeof value === 'boolean') {
    formData.append(key, value ? '1' : '0')
    return
  }

  formData.append(key, String(value))
}

function limitTextPayload(value, maxLength = 4000) {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized
}

function resolveRegistrationRoleFields(role) {
  if (role === 'sobrecargo') {
    return {
      role: 'sobrecargo',
      operationalRole: '',
      companyName: '',
      commercialName: '',
      legalName: '',
    }
  }

  return {
    role,
    operationalRole: '',
    companyName: form.companyName,
    commercialName: form.commercialName,
    legalName: form.legalName,
  }
}

function buildRegistrationPayload() {
  const formData = new FormData()
  const limitedScanRaw = limitTextPayload(form.ineScanRaw, isCrewRole.value ? 4000 : 12000)
  const registrationRole = resolveRegistrationRoleFields(form.role)
  const representativeName = isProviderRole.value ? form.name : form.name
  const representativePhone = isProviderRole.value ? form.phone : form.phone

  const baseFields = {
    name: representativeName,
    email: form.email,
    phone: representativePhone,
    birth_date: form.birthDate,
    nationality: form.nationality,
    base: form.base,
    city: form.base,
    base_airport: form.base,
    password: form.password,
    password_confirmation: form.passwordConfirmation,
    role: registrationRole.role,
    operational_role: registrationRole.operationalRole,
    company_name: registrationRole.companyName,
    nombre_empresa: registrationRole.companyName,
    commercial_name: registrationRole.commercialName,
    nombre_comercial: registrationRole.commercialName,
    legal_name: registrationRole.legalName,
    razon_social: registrationRole.legalName,
    company_phone: form.companyPhone,
    company_email: form.companyEmail,
    rfc: form.billingRfc,
    representative_name: representativeName,
    representative_phone: representativePhone,
    legal_representative: representativeName,
    document_type: form.documentType,
    document_number: form.documentNumber,
    document_issue_date: form.documentIssueDate,
    document_expiration: form.documentExpiration,
    document_status: form.documentStatus,
    identification_document_id: form.identificationDocumentId,
    identification_storage_disk: form.identificationStorageDisk,
    identification_storage_path: form.identificationStoragePath,
    identification_file_url: form.identificationFileUrl,
    identification_document_url: form.identificationDocumentUrl,
    identification_pdf_name: form.identificationPdfName,
    identity_validation_required: form.identityValidationRequired,
    curp: form.ineCurp,
    ine_curp: form.ineCurp,
    ine_cic: form.ineCic,
    ine_ocr: form.ineOcr,
    ine_scan_raw: limitedScanRaw,
    ine_scan_status: form.ineScanStatus,
    scan_document_type: form.scanDocumentType,
    scan_warnings: JSON.stringify(form.scanWarnings || []),
    scan_review_fields: JSON.stringify(form.scanReviewFields || []),
    scan_quality: form.scanQuality ? JSON.stringify(form.scanQuality) : '',
    scan_processing_time_ms: form.scanProcessingTimeMs,
    license_type: form.licenseType,
    license_number: form.documentNumber,
    license_category: form.licenseCategory,
    license_birth_date: form.birthDate,
    license_nationality: form.nationality,
    license_issue_date: form.documentIssueDate,
    license_expiration_date: form.documentExpiration,
    license_issuing_country: form.issuingCountry,
    license_document_status: form.documentStatus,
  }

  if (!isCrewRole.value && !isProviderRole.value) {
    Object.assign(baseFields, {
      identity_verification_status: form.identityVerificationStatus,
      identity_verification_message: form.identityVerificationMessage,
      identity_verified: form.identityVerified,
      face_detected: form.faceDetected,
      face_match_score: form.faceMatchScore,
      liveness_score: form.livenessScore,
      image_storage_score: form.imageStorageScore,
      biometric_image_saved: form.biometricImageSaved,
      biometric_captured_at: form.biometricCapturedAt,
      biometric_provider: form.biometricProvider || 'camera_capture',
      biometric_template_type: form.biometricTemplateType || 'selfie-photo',
      biometric_version: 'v1',
      faces_count: form.facesCount,
      face_confidence: form.faceConfidence,
      quality_brightness: form.qualityBrightness,
      quality_sharpness: form.qualitySharpness,
      pose_yaw: form.poseYaw,
      pose_pitch: form.posePitch,
      pose_roll: form.poseRoll,
      face_occluded: form.faceOccluded,
    })
  }

  Object.entries(baseFields).forEach(([key, value]) => appendFormValue(formData, key, value))

  if (isCrewRole.value) {
    appendFormValue(formData, 'license_file', form.ineFront)
  } else {
    if (!isProviderRole.value) {
      appendFormValue(formData, 'selfie_biometric', form.selfieFile)
    }
  }

  return formData
}

function logRegistrationPayload(formData) {
  const printablePayload = {}

  for (const [key, value] of formData.entries()) {
    printablePayload[key] =
      value instanceof File
        ? {
            type: 'file',
            name: value.name,
            size: value.size,
            mime: value.type,
          }
        : value
  }

  console.log('[registro-biometrico] payload enviado al backend', printablePayload)
}

async function submit() {
  if (!(await validateCurrentStep())) return

  successMessage.value = ''
  errorMessage.value = ''
  closeErrorModal()

  try {
    const payload = buildRegistrationPayload()
    logRegistrationPayload(payload)
    const registerPath = form.role === 'provider' ? '/provider/register' : '/auth/register'
    const response = await auth.register(payload, {
      intendedRole: form.role,
      path: registerPath,
    })
    const providerStatus = String(response?.provider_status || '').trim().toLowerCase()

    successMessage.value =
      form.role === 'client'
        ? 'Usuario cliente creado. Redirigiendo al acceso de clientes.'
        : form.role === 'provider'
          ? providerStatus === 'pending_validation'
            ? 'Proveedor creado correctamente. Redirigiendo al acceso de clientes.'
            : 'Operador creado correctamente. Redirigiendo al acceso de clientes.'
          : 'Sobrecargo creado correctamente. Redirigiendo al acceso de clientes.'

    auth.clearAuth()
    router.push({ name: 'login-cliente' })
  } catch (error) {
    errorMessage.value = error.message || 'No fue posible crear el usuario.'
    openErrorModal(error)
  }
}
</script>

<template>
  <main class="register-page">
    <transition name="register-error-fade">
      <div
        v-if="errorModalOpen"
        class="register-error-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="register-error-title"
        @click.self="closeErrorModal"
      >
        <div class="register-error-backdrop"></div>
        <div class="register-error-card">
          <span class="register-error-orb" aria-hidden="true">!</span>
          <p class="eyebrow">Registro no completado</p>
          <h3 id="register-error-title">{{ errorModalTitle }}</h3>
          <p class="register-error-copy">{{ errorModalMessage }}</p>

          <ul v-if="errorModalDetails.length" class="register-error-list">
            <li v-for="detail in errorModalDetails" :key="detail">{{ detail }}</li>
          </ul>

          <div class="register-error-actions">
            <button type="button" class="primary-button" @click="closeErrorModal">
              Entendido
            </button>
          </div>
        </div>
      </div>
    </transition>

    <section class="register-shell">
      <aside class="register-aside">
        <RouterLink to="/" class="brand" aria-label="Sky Group">
          <BrandLogo variant="dark" :width="280" />
        </RouterLink>

        <div class="aside-copy">
          <p class="eyebrow">Nuevo usuario</p>
          <h1>Crea una cuenta por pasos.</h1>
          <p>{{ registerIntroCopy }}</p>
        </div>

        <RegisterProgress :steps="wizardSteps" :current-step="currentStep" />
      </aside>

      <section class="register-panel">
        <div class="panel-head">
          <p class="eyebrow">{{ selectedStep.eyebrow }} - Alta de cuenta</p>
          <h2>{{ selectedStep.title }}</h2>
          <p class="panel-copy">{{ selectedStep.description }}</p>
        </div>

        <form class="register-form" @submit.prevent="submit">
          <RegisterRoleStep v-if="currentStepId === 'rol'" :form="form" />
          <div v-else-if="currentStepId === 'perfil'" class="step-fields">
            <RegisterClientStep :form="form" :errors="formErrors" @update-field="setFormField" />
            <RegisterIneStep
              :form="form"
              :errors="formErrors"
              @file-selected="setFile"
              @update-field="setFormField"
              @merge-fields="mergeFormFields"
            />
          </div>
          <RegisterCredentialsStep
            v-else
            :form="form"
            :loading="auth.loading"
            @update-field="setFormField"
            @merge-fields="mergeFormFields"
          />

          <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
          <p v-if="successMessage" class="success">{{ successMessage }}</p>

          <div class="wizard-actions">
            <button
              type="button"
              class="secondary-button"
              :disabled="auth.loading"
              @click="previousStep"
            >
              Regresar
            </button>

            <button
              v-if="!isLastStep"
              type="button"
              class="primary-button"
              @click="nextStep"
            >
              Continuar
            </button>
          </div>

          <div class="register-links">
            <span>Rol seleccionado: {{ selectedRoleLabel }}.</span>
            <span>Ya tienes cuenta?</span>
            <RouterLink :to="loginRoute">Iniciar sesion</RouterLink>
          </div>
        </form>
      </section>
    </section>
  </main>
</template>
