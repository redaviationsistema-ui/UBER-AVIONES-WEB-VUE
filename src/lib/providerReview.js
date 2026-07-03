import { looksLikePlaceholderCompany, resolveBestCompanyDisplayName } from './companyDisplay'

function normalizeToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeText(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function sameNormalizedValue(left = '', right = '') {
  return normalizeText(left).toLowerCase() === normalizeText(right).toLowerCase()
}

function isPlaceholderIdentity(value = '') {
  const normalized = normalizeText(value)
  if (!normalized) return true
  if (looksLikePlaceholderCompany(normalized)) return true

  return ['sin representante', 'sin contacto', 'n/a', 'na'].includes(normalized.toLowerCase())
}

function countDocuments(provider = {}) {
  if (Array.isArray(provider.documents)) return provider.documents.length
  if (Array.isArray(provider.legal_documents)) return provider.legal_documents.length
  if (Array.isArray(provider.files)) return provider.files.length

  return toNumber(
    provider.document_count ||
      provider.documents_count ||
      provider.legal_documents_count ||
      provider.files_count,
    0,
  )
}

function normalizeDocumentCollection(provider = {}) {
  if (Array.isArray(provider.documents)) return provider.documents
  if (Array.isArray(provider.legal_documents)) return provider.legal_documents
  if (Array.isArray(provider.company_documents)) return provider.company_documents
  if (Array.isArray(provider.files)) return provider.files
  return []
}

function areLegalDocumentsApproved(provider = {}) {
  const documents = normalizeDocumentCollection(provider)
  if (!documents.length) return false

  return documents.every((document) => {
    const normalized = normalizeToken(
      document.status || document.state || document.validation_status || document.review_status,
    )

    return ['approved', 'aprobado', 'aprobada', 'vigente', 'validado'].includes(normalized)
  })
}

function resolveSatValidationStatus(provider = {}) {
  const normalized = normalizeToken(
    provider.sat_validation_status ||
      provider.satValidationStatus ||
      provider.tax_data?.sat_validation_status ||
      provider.profile?.tax_data?.sat_validation_status,
  )

  if (normalized) return normalized
  return provider.rfc ? 'approved' : 'pending'
}

function requirementResponseApproved(item = {}) {
  return ['approved', 'aprobado', 'validated', 'validado'].includes(normalizeToken(item.responseStatus))
}

function resolveValidationRequirements(provider = {}, metrics = {}) {
  const backendRequirements = Array.isArray(provider.validation_requirements)
    ? provider.validation_requirements
    : Array.isArray(provider.validationRequirements)
      ? provider.validationRequirements
      : null

  if (backendRequirements?.length) {
    return backendRequirements.map((item) => ({
      key: item.key || item.id || item.label,
      label: item.label || item.key || 'Requisito',
      complete: Boolean(item.complete),
      message: item.message || item.reason || '',
      responseStatus: item.response_status || item.responseStatus || 'pending',
      adminNote: item.admin_note || item.adminNote || '',
      respondedAt: item.responded_at || item.respondedAt || '',
      actorId: item.actor_id || item.actorId || null,
      actorName: item.actor_name || item.actorName || '',
      actorType: item.actor_type || item.actorType || '',
    }))
  }

  const aircraft = toNumber(metrics.aircraft || provider.aircraft_count || 0)
  const active = toNumber(metrics.active || provider.active_aircraft_count || 0)
  const hasCompanyData = Boolean(
    provider.legal_name ||
      provider.razon_social ||
      provider.company_name ||
      provider.commercial_name ||
      provider.nombre_empresa,
  )
  const hasContact = Boolean(provider.company_phone || provider.phone) && Boolean(provider.company_email || provider.email)
  const hasFiscal = Boolean(provider.rfc)
  const satApproved = ['approved', 'aprobado', 'validated', 'validado'].includes(
    resolveSatValidationStatus(provider),
  )
  const representative = resolveProviderRepresentativeName(provider)
  const base = provider.base_airport || provider.base || provider.location || ''

  return [
    {
      key: 'company_identity',
      label: 'Datos de empresa completos',
      complete: hasCompanyData,
      message: 'Faltan datos corporativos del operador.',
    },
    {
      key: 'rfc_valid',
      label: 'RFC valido',
      complete: hasFiscal,
      message: 'Falta RFC valido del operador.',
    },
    {
      key: 'sat_validation',
      label: 'Validacion SAT',
      complete: satApproved,
      message: 'La validacion SAT sigue pendiente.',
    },
    {
      key: 'legal_documents_approved',
      label: 'Documentacion legal aprobada',
      complete: areLegalDocumentsApproved(provider),
      message: 'La documentacion legal aun no esta aprobada.',
    },
    {
      key: 'base_operativa',
      label: 'Base operativa definida',
      complete: Boolean(base),
      message: 'Falta base operativa definida.',
    },
    {
      key: 'aircraft_active',
      label: 'Aeronave activa o aprobada',
      complete: active > 0 || aircraft > 0,
      message: 'Se requiere al menos una aeronave activa o aprobada.',
    },
    {
      key: 'contact_complete',
      label: 'Datos de contacto completos',
      complete: hasContact,
      message: 'Faltan datos de contacto completos.',
    },
    {
      key: 'legal_representative_complete',
      label: 'Representante legal completo',
      complete: representative !== 'Sin representante',
      message: 'Falta representante legal completo.',
    },
  ]
}

export function resolveProviderCompanyName(provider = {}) {
  return resolveBestCompanyDisplayName(
    provider.company_name,
    provider.commercial_name,
    provider.nombre_empresa,
    provider.nombre_comercial,
    provider.legal_name,
    provider.razon_social,
    provider.display_name,
    provider.trade_name,
  )
}

export function resolveProviderRepresentativeName(provider = {}) {
  const companyName = resolveProviderCompanyName(provider)
  const candidates = [
    provider.representative_name,
    provider.legal_representative,
    provider.representante_legal,
    provider.contact_name,
    provider.contact,
    provider.owner_name,
    provider.user?.profile?.legal_representative,
    provider.user?.name,
  ]

  const realRepresentative = candidates
    .map((candidate) => normalizeText(candidate))
    .find((candidate) => candidate && !isPlaceholderIdentity(candidate) && !sameNormalizedValue(candidate, companyName))

  return realRepresentative || 'Sin representante'
}

export function resolveProviderAdminValidationStatus(provider = {}) {
  const explicit = normalizeToken(
    provider.admin_validation_status ||
      provider.adminValidationStatus ||
      provider.review_status ||
      provider.reviewStatus ||
      provider.validation_status ||
      provider.validationStatus ||
      provider.status,
  )

  if (explicit === 'expediente_incompleto') return 'draft'
  if (explicit) return explicit

  const accessEnabled = Boolean(provider.access_enabled ?? provider.accessEnabled)
  const operatorStatus = normalizeToken(provider.operator_status || provider.operatorStatus)
  const approval = normalizeToken(provider.approval_status || provider.validation_status || provider.status || provider.state)
  if (accessEnabled && (operatorStatus === 'validated' || approval === 'approved')) return 'approved'
  if (approval === 'rejected') return 'rejected'
  if (approval === 'suspended') return 'changes_required'
  if (provider.admin_review_submitted_at || provider.adminReviewSubmittedAt) return 'pending_review'
  return 'draft'
}

export function resolveProviderStatusMeta(provider = {}) {
  const normalized = resolveProviderAdminValidationStatus(provider)

  if (normalized === 'approved') {
    return {
      key: 'approved',
      label: 'Aprobado',
      tone: 'success',
      headline: 'Operador validado por administracion',
    }
  }

  if (normalized === 'changes_required') {
    return {
      key: 'changes_required',
      label: 'Cambios requeridos',
      tone: 'danger',
      headline: 'Cambios solicitados por administracion',
    }
  }

  if (normalized === 'rejected' || normalized === 'cancelled') {
    return {
      key: 'rejected',
      label: 'Validacion cancelada',
      tone: 'danger',
      headline: 'Expediente rechazado por administracion',
    }
  }

  if (normalized === 'pending_review' || normalized === 'pending_validation') {
    return {
      key: 'pending',
      label: 'En revision',
      tone: 'warning',
      headline: 'Expediente enviado a revision administrativa',
    }
  }

  return {
    key: 'draft',
    label: 'Expediente incompleto',
    tone: 'neutral',
    headline: 'Expediente pendiente de validacion administrativa',
  }
}

export function buildProviderReviewFlow(provider = {}, metrics = {}) {
  const statusMeta = resolveProviderStatusMeta(provider)
  const documentCount = countDocuments(provider)
  const aircraft = toNumber(metrics.aircraft || provider.aircraft_count || 0)
  const active = toNumber(metrics.active || provider.active_aircraft_count || 0)
  const pending = toNumber(metrics.pending || provider.pending_aircraft_count || 0)
  const trial = toNumber(metrics.trial || provider.trial_aircraft_count || 0)
  const hasCompanyData = Boolean(
    provider.legal_name ||
      provider.razon_social ||
      provider.company_name ||
      provider.commercial_name ||
      provider.nombre_empresa,
  )
  const hasContact = Boolean(provider.company_phone || provider.phone || provider.company_email || provider.email)
  const hasFiscal = Boolean(provider.rfc)
  const representative = resolveProviderRepresentativeName(provider)
  const base = provider.base_airport || provider.base || provider.location || 'Base pendiente'
  const satStatus = resolveSatValidationStatus(provider)
  const validationRequirements = resolveValidationRequirements(provider, metrics)
  const missingValidationItems = validationRequirements.filter((item) => !item.complete)
  const approvedValidationItems = validationRequirements.filter((item) => requirementResponseApproved(item))
  const allRequirementsApproved =
    validationRequirements.length > 0 && validationRequirements.every((item) => item.complete && requirementResponseApproved(item))
  const explicitCanValidate = provider.can_validate ?? provider.canValidate
  const canValidate = allRequirementsApproved && (explicitCanValidate == null ? true : Boolean(explicitCanValidate))

  const checklist = [
    { id: 'company', label: 'Datos empresa', complete: hasCompanyData },
    { id: 'contact', label: 'Contacto', complete: hasContact },
    { id: 'tax', label: 'RFC', complete: hasFiscal },
    { id: 'documents', label: 'Documentos', complete: documentCount > 0, pending: documentCount === 0 },
    { id: 'base', label: 'Base operativa', complete: base !== 'Base pendiente', pending: base === 'Base pendiente' },
    { id: 'representative', label: 'Representante legal', complete: representative !== 'Sin representante', pending: representative === 'Sin representante' },
    { id: 'aircraft', label: 'Aeronaves', complete: aircraft > 0, pending: aircraft === 0 },
  ]

  const completed = checklist.filter((step) => step.complete).length
  const progress = {
    completed,
    total: checklist.length,
    percent: Math.round((completed / checklist.length) * 100),
  }

  const summary = [
    { label: 'Estado empresa', value: statusMeta.label, tone: statusMeta.tone },
    {
      label: 'Validacion SAT',
      value: ['approved', 'aprobado', 'validated', 'validado'].includes(satStatus) ? 'Verificada' : 'Pendiente',
      tone: ['approved', 'aprobado', 'validated', 'validado'].includes(satStatus) ? 'success' : 'warning',
    },
    {
      label: 'Documentacion legal',
      value: documentCount ? (areLegalDocumentsApproved(provider) ? `${documentCount} documento(s)` : 'Pendiente de dictamen') : 'Sin documentos',
      tone: areLegalDocumentsApproved(provider) ? 'success' : documentCount ? 'warning' : 'warning',
    },
    {
      label: 'Requisitos admin aprobados',
      value: `${approvedValidationItems.length}/${validationRequirements.length}`,
      tone: allRequirementsApproved ? 'success' : approvedValidationItems.length ? 'warning' : 'neutral',
    },
    {
      label: 'Aeronaves activas',
      value: active ? `${active} activas` : aircraft ? `${aircraft} registradas` : '0 registradas',
      tone: active ? 'success' : aircraft ? 'info' : 'neutral',
    },
    {
      label: 'Trial',
      value: trial ? `${trial} en trial` : 'Sin trial visible',
      tone: trial ? 'info' : 'neutral',
    },
    {
      label: 'Base operativa',
      value: base,
      tone: base === 'Base pendiente' ? 'warning' : 'neutral',
    },
  ]

  const alerts = missingValidationItems.map((item) => ({
    tone: 'warning',
    title: item.message || `${item.label} pendiente`,
  }))

  if (statusMeta.key === 'changes_required') {
    alerts.unshift({
      tone: 'danger',
      title:
        provider.changes_notes ||
        provider.changesNotes ||
        provider.admin_notes ||
        provider.adminNotes ||
        'Administracion solicito cambios antes de validar al operador.',
    })
  }

  if (statusMeta.key === 'rejected') {
    alerts.unshift({
      tone: 'danger',
      title:
        provider.rejection_reason ||
        provider.rejectionReason ||
        provider.admin_notes ||
        provider.adminNotes ||
        'La validacion del operador fue cancelada o rechazada por administracion.',
    })
  }

  if (!alerts.length && statusMeta.key === 'approved') {
    alerts.push({ tone: 'success', title: 'Operador validado por administracion. Acceso operativo habilitado.' })
  } else if (!alerts.length) {
    alerts.push({ tone: 'info', title: 'Expediente pendiente de validacion administrativa.' })
  }

  return {
    statusMeta,
    progress,
    checklist,
    validationRequirements,
    summary,
    alerts: alerts.slice(0, 4),
    canValidate,
    missingValidationItems,
    accessEnabled: Boolean(provider.access_enabled ?? provider.accessEnabled ?? false),
    documentCount,
    representative,
    base,
    companyName: resolveProviderCompanyName(provider),
  }
}
