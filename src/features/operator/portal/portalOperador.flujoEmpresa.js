/*----------------------------------------------------------------------------------------------*/
// VISTA DE UTILIDADES PARA EL PORTAL DE OPERADOR
/*----------------------------------------------------------------------------------------------*/  

const companyEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const COMPANY_FORM_ERROR_KEYS = [
  '_form',
  'legalName',
  'tradeName',
  'rfc',
  'phone',
  'email',
  'address',
  'operationalBase',
  'legalRepresentative',
]

function normalizeCompanyNumericValue(value) {
  const numericValue = Number(value || 0)
  return Number.isFinite(numericValue) ? numericValue : 0
}

export function buildCompanyFieldErrors(
  companyForm = {},
  {
    normalizedRfc = '',
    isValidRfc = false,
    requireReviewSubmission = false,
    hasRequiredLegalDocuments = true,
    allowPartialSave = false,
  } = {},
) {
  const errors = {
    _form: '',
    legalName: allowPartialSave
      ? ''
      : String(companyForm.legalName || '').trim()
        ? ''
        : 'Ingresa la razon social.',
    tradeName: allowPartialSave
      ? ''
      : String(companyForm.tradeName || '').trim()
        ? ''
        : 'Ingresa el nombre comercial.',
    rfc: allowPartialSave
      ? ''
      : normalizedRfc
        ? isValidRfc
          ? ''
          : 'Ingresa un RFC mexicano valido.'
        : 'El RFC es obligatorio.',
    phone: '',
    email: '',
    address: allowPartialSave
      ? ''
      : String(companyForm.address || '').trim()
        ? ''
        : 'Ingresa la direccion fiscal.',
    operationalBase: allowPartialSave
      ? ''
      : String(companyForm.operationalBase || '').trim()
        ? ''
        : 'Define la base operativa principal.',
    legalRepresentative: '',
  }

  const email = String(companyForm.email || '').trim()
  if (email && !companyEmailPattern.test(email)) {
    errors.email = 'Ingresa un correo valido.'
  }

  if (!requireReviewSubmission) {
    return errors
  }

  if (!String(companyForm.phone || '').trim()) {
    errors.phone = 'Ingresa un telefono de contacto.'
  }

  if (!email) {
    errors.email = 'Ingresa el correo corporativo.'
  }

  if (!String(companyForm.legalRepresentative || '').trim()) {
    errors.legalRepresentative = 'Ingresa el representante legal.'
  }

  if (!hasRequiredLegalDocuments) {
    errors._form =
      'Completa y carga los documentos legales obligatorios antes de enviar la empresa a revision.'
  }

  return errors
}

export function hasCompanyFieldErrors(errors = {}) {
  return Object.values(errors).some(Boolean)
}

export function buildCompanyPayload(companyForm = {}, normalizedRfc = '') {
  const operationalBaseLabel = String(companyForm.operationalBase || '').trim()
  const operationalBaseCode = String(companyForm.operationalBaseCode || operationalBaseLabel).trim()

  return {
    legal_name: companyForm.legalName,
    rfc: normalizedRfc,
    commercial_name: companyForm.tradeName,
    phone: companyForm.phone,
    email: companyForm.email,
    address: companyForm.address,
    base: operationalBaseLabel,
    base_airport: operationalBaseCode,
    representative_name: companyForm.legalRepresentative,
    legal_representative: companyForm.legalRepresentative,
    jet_a_price: normalizeCompanyNumericValue(companyForm.jetAPrice),
    margin_percent: normalizeCompanyNumericValue(companyForm.marginPercent),
    fixed_fee: normalizeCompanyNumericValue(companyForm.fixedFee),
  }
}

export function buildCompanyPendingValidationPatch({
  reviewStatus = 'pending_review',
  validationStatus = 'pending_validation',
  submittedAt = '',
} = {}) {
  const patch = {
    review_status: reviewStatus,
    validation_status: validationStatus,
    status: reviewStatus,
    admin_validation_status: reviewStatus,
    approval_status: reviewStatus,
    operator_status: validationStatus,
    access_enabled: false,
  }

  if (String(submittedAt || '').trim()) {
    patch.admin_review_submitted_at = submittedAt
  }

  return patch
}

export function sanitizeCompanyPayloadForSave(payload = {}) {
  const nextPayload = { ...payload }

  if (!String(nextPayload.rfc || '').trim()) {
    delete nextPayload.rfc
  }

  if (!companyEmailPattern.test(String(nextPayload.email || '').trim())) {
    delete nextPayload.email
    delete nextPayload.company_email
  }

  return nextPayload
}

export function buildCompanySaveCandidates(payload) {
  return [
    { method: 'put', path: '/proveedor/empresa', body: payload },
    { method: 'patch', path: '/proveedor/empresa', body: payload },
    { method: 'put', path: '/provider/company', body: payload },
    { method: 'patch', path: '/provider/company', body: payload },
    { method: 'put', path: '/operator/company', body: payload },
    { method: 'patch', path: '/operator/company', body: payload },
  ]
}

export function buildCompanyReviewFormData({
  selectedFile = null,
  selectedFileName = '',
  reviewStatus = 'pending_review',
  validationStatus = 'pending_validation',
  submittedAt = '',
} = {}) {
  const formData = new FormData()
  const reviewPatch = buildCompanyPendingValidationPatch({
    reviewStatus,
    validationStatus,
    submittedAt,
  })

  Object.entries(reviewPatch).forEach(([key, value]) => {
    formData.append(key, value)
  })

  if (selectedFile) {
    formData.append('file', selectedFile)
    formData.append('document', selectedFile)
    formData.append('documents[]', selectedFile)
    formData.append('legal_document', selectedFile)
    formData.append('document_name', selectedFileName || selectedFile.name || 'Documento legal')
    formData.append('original_name', selectedFileName || selectedFile.name || 'Documento legal')
  }

  return formData
}

export function buildCompanyReviewCandidates(formData) {
  return [
    { method: 'postForm', path: '/proveedor/empresa/enviar-revision', formData },
    { method: 'postForm', path: '/proveedor/empresa/send-review', formData },
    { method: 'postForm', path: '/proveedor/empresa/revision', formData },
    { method: 'postForm', path: '/provider/company/send-review', formData },
    { method: 'postForm', path: '/operator/company/send-review', formData },
  ]
}
