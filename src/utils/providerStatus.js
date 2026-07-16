import { resolveBestCompanyDisplayName } from '../lib/companyDisplay'
import { resolveCompanyDocumentDefinition } from '../lib/providerCompanyDocuments'

export const REQUIRED_PROVIDER_DOCUMENT_KEYS = [
  'sat_certificate',
  'articles_of_incorporation',
  'legal_representative_power',
  'legal_representative_id',
  'tax_address_proof',
  'operational_permit',
]

export const PROVIDER_STATUS_GROUPS = [
  { key: 'draft', title: 'Registro iniciado' },
  { key: 'incomplete', title: 'Expediente incompleto' },
  { key: 'submitted', title: 'Enviado a revision' },
  { key: 'under_review', title: 'En revision' },
  { key: 'observations', title: 'Requiere correcciones' },
  { key: 'approved', title: 'Aprobados' },
  { key: 'rejected', title: 'Rechazados' },
  { key: 'suspended', title: 'Suspendidos' },
]

export const PROVIDER_PENDING_STATUS_KEYS = new Set(['draft', 'incomplete', 'submitted', 'under_review', 'observations'])

function normalizeToken(value = '') {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_')
}

function normalizeText(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function isValidMexicanRfc(value = '') {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')

  return /^([A-Z&Ñ]{3,4})\d{6}[A-Z0-9]{3}$/.test(normalized)
}

function normalizeBoolean(value) {
  if (value === true) return true
  if (value === false) return false

  const normalized = normalizeToken(value)
  if (!normalized) return null
  if (['true', '1', 'yes', 'si', 'approved', 'validated', 'complete', 'completo', 'completa'].includes(normalized)) return true
  if (['false', '0', 'no', 'pending', 'pendiente', 'rejected', 'incomplete', 'incompleto', 'incompleta'].includes(normalized)) return false
  return null
}

function normalizeResponseStatus(value = '') {
  const normalized = normalizeToken(value)
  if (['approved', 'validated', 'aprobado', 'aprobada', 'validado', 'validada'].includes(normalized)) return 'approved'
  if (['rejected', 'rechazado', 'rechazada', 'cancelled', 'canceled', 'cancelado', 'cancelada'].includes(normalized)) return 'rejected'
  return 'pending'
}

function normalizeWorkflowStatus(value = '') {
  const normalized = normalizeToken(value)
  if (!normalized) return ''
  if (['active', 'validated'].includes(normalized)) return 'approved'
  if (['approved', 'aprobado', 'aprobada'].includes(normalized)) return 'approved'
  if (['rejected', 'rechazado', 'rechazada'].includes(normalized)) return 'rejected'
  if (['suspended', 'suspendido', 'suspendida'].includes(normalized)) return 'suspended'
  if (['changes_requested', 'changes_required', 'needs_changes', 'observations', 'observacion', 'observaciones', 'cambios_solicitados', 'cambios_requeridos'].includes(normalized)) {
    return 'observations'
  }
  if (['under_review', 'pending_review', 'en_revision', 'reviewing'].includes(normalized)) return 'under_review'
  if (['submitted', 'sent', 'enviado', 'pending_validation'].includes(normalized)) return 'submitted'
  if (['incomplete', 'incompleto', 'incompleta', 'expediente_incompleto'].includes(normalized)) return 'incomplete'
  if (['draft', 'registro_iniciado', 'started'].includes(normalized)) return 'draft'
  return normalized
}

function readProviderDocuments(provider = {}) {
  if (Array.isArray(provider.documents)) return provider.documents
  if (Array.isArray(provider.company_documents)) return provider.company_documents
  if (Array.isArray(provider.legal_documents)) return provider.legal_documents
  if (Array.isArray(provider.files)) return provider.files
  return []
}

function resolveProviderCompanyName(provider = {}) {
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

function isPlaceholderIdentity(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  if (!normalized) return true
  return ['sin representante', 'sin contacto', 'n/a', 'na'].includes(normalized)
}

export function resolveProviderRepresentativeName(provider = {}) {
  const candidates = [
    provider.representative_name,
    provider.legal_representative,
    provider.representante_legal,
    provider.user?.profile?.tax_data?.legal_representative,
    provider.contact_name,
    provider.contact,
    provider.owner_name,
    provider.user?.profile?.legal_representative,
    provider.user?.name,
  ]

  const representative = candidates
    .map((candidate) => normalizeText(candidate))
    .find((candidate) => candidate && !isPlaceholderIdentity(candidate))

  return representative || 'Sin representante'
}

function buildRequirementMap(provider = {}) {
  const items = Array.isArray(provider.validation_requirements)
    ? provider.validation_requirements
    : Array.isArray(provider.validationRequirements)
      ? provider.validationRequirements
      : []

  return new Map(
    items.map((item, index) => [item.key || item.id || item.label || `requirement-${index + 1}`, item]),
  )
}

function findRequirement(provider = {}, keys = []) {
  const requirementKeys = Array.isArray(keys) ? keys : [keys]
  const requirementMap = buildRequirementMap(provider)
  return requirementKeys
    .map((key) => requirementMap.get(key))
    .find(Boolean) || null
}

export function isProviderRequirementApproved(provider = {}, keys, fallback = false) {
  const requirement = findRequirement(provider, keys)
  if (!requirement) return fallback

  const explicit = normalizeBoolean(requirement.complete)
  const responseStatus = normalizeResponseStatus(requirement.response_status || requirement.responseStatus)

  if (responseStatus === 'approved') return true
  if (responseStatus === 'rejected') return false
  if (explicit === true) return true

  return fallback
}

export function isProviderRequirementRejected(provider = {}, keys) {
  const requirement = findRequirement(provider, keys)
  if (!requirement) return false
  return normalizeResponseStatus(requirement.response_status || requirement.responseStatus) === 'rejected'
}

function normalizeDocumentStatus(document = {}) {
  return normalizeResponseStatus(
    document.status || document.state || document.validation_status || document.review_status || document.current_status,
  )
}

function buildDocumentSummaryFromRecords(provider = {}) {
  const documents = readProviderDocuments(provider)
  const byKey = new Map()

  documents.forEach((document) => {
    const definition = resolveCompanyDocumentDefinition(document)
    const key = document.definitionKey || document.definition_key || definition?.id || document.document_slot || ''
    if (!key || byKey.has(key)) return
    byKey.set(key, normalizeDocumentStatus(document))
  })

  const total = REQUIRED_PROVIDER_DOCUMENT_KEYS.length
  let approved = 0
  let rejected = 0
  let missing = 0

  REQUIRED_PROVIDER_DOCUMENT_KEYS.forEach((key) => {
    const status = byKey.get(key)
    if (status === 'approved') approved += 1
    else if (status === 'rejected') rejected += 1
    else if (!status) missing += 1
  })

  return {
    total,
    approved,
    pending: Math.max(total - approved - rejected, 0),
    rejected,
    missing,
  }
}

function hasApprovedSatCertificate(provider = {}) {
  return readProviderDocuments(provider).some((document) => {
    const definition = resolveCompanyDocumentDefinition(document)
    const key = document.definitionKey || document.definition_key || definition?.id || document.document_slot || ''
    return key === 'sat_certificate' && normalizeDocumentStatus(document) === 'approved'
  })
}

function normalizeDocumentSummaryShape(summary = {}, fallbackTotal = REQUIRED_PROVIDER_DOCUMENT_KEYS.length) {
  const totalCandidate = toNumber(summary.required ?? summary.total, 0)
  const approved = toNumber(summary.approved, 0)
  const pending = toNumber(summary.pending, 0)
  const rejected = toNumber(summary.rejected, 0)
  const missing = toNumber(summary.missing, 0)
  const inferredTotal = totalCandidate || approved + pending + rejected + missing || fallbackTotal

  return {
    total: inferredTotal,
    approved,
    pending: pending || Math.max(inferredTotal - approved - rejected - missing, 0),
    rejected,
    missing: missing || Math.max(inferredTotal - approved - pending - rejected, 0),
  }
}

export function areLegalDocumentsApproved(summary = {}) {
  const required = toNumber(summary?.required ?? summary?.total, 0)
  const approved = toNumber(summary?.approved, 0)
  const pending = toNumber(summary?.pending, 0)
  const rejected = toNumber(summary?.rejected, 0)
  const missing = toNumber(summary?.missing, 0)

  return required > 0
    && approved >= required
    && pending === 0
    && rejected === 0
    && missing === 0
}

export function buildProviderDocumentSummary(provider = {}) {
  const explicit =
    provider.provider_status_summary?.documentSummary ||
    provider.provider_status_summary?.document_summary ||
    provider.documentSummary ||
    provider.document_summary ||
    provider.legalDocumentSummary ||
    provider.legal_document_summary

  if (explicit && typeof explicit === 'object') {
    return normalizeDocumentSummaryShape(explicit)
  }

  const countedSummary = {
    required: firstNonZero(
      provider.required_documents_count,
      provider.requiredDocumentsCount,
      provider.company_documents_count,
      provider.companyDocumentsCount,
      provider.documents_count,
      provider.legal_documents_count,
      provider.legalDocumentsCount,
    ),
    approved: provider.approved_documents_count ?? provider.approvedDocumentsCount,
    pending: provider.pending_documents_count ?? provider.pendingDocumentsCount,
    rejected: provider.rejected_documents_count ?? provider.rejectedDocumentsCount,
    missing: provider.missing_documents_count ?? provider.missingDocumentsCount,
  }
  const hasCountedSummary = Object.values(countedSummary).some((value) => toNumber(value, 0) > 0)

  if (hasCountedSummary) {
    return normalizeDocumentSummaryShape(countedSummary)
  }

  const documents = readProviderDocuments(provider)
  if (documents.length) return buildDocumentSummaryFromRecords(provider)

  const legalRequirementRejected = isProviderRequirementRejected(provider, 'legal_documents_approved')
  const legalRequirementApproved = isProviderRequirementApproved(provider, 'legal_documents_approved', false)
  const total = REQUIRED_PROVIDER_DOCUMENT_KEYS.length

  if (legalRequirementApproved && !legalRequirementRejected) {
    return { total, approved: total, pending: 0, rejected: 0, missing: 0 }
  }

  if (legalRequirementRejected) {
    return { total, approved: 0, pending: total - 1, rejected: 1, missing: total - 1 }
  }

  return { total, approved: 0, pending: total, rejected: 0, missing: total }
}

function firstNonZero(...values) {
  return values.find((value) => toNumber(value, 0) > 0) ?? 0
}

function buildDocumentSummary(provider = {}) {
  const explicit = buildProviderDocumentSummary(provider)
  if (explicit && typeof explicit === 'object') {
    return {
      total: toNumber(explicit.total, REQUIRED_PROVIDER_DOCUMENT_KEYS.length),
      approved: toNumber(explicit.approved, 0),
      pending: toNumber(explicit.pending, 0),
      rejected: toNumber(explicit.rejected, 0),
      missing: toNumber(explicit.missing, 0),
    }
  }
  return buildDocumentSummaryFromRecords(provider)
}

export function readProviderReviewSubmittedAt(provider = {}) {
  return provider.admin_review_submitted_at || provider.adminReviewSubmittedAt || ''
}

export function isProviderReviewSubmitted(provider = {}) {
  if (readProviderReviewSubmittedAt(provider)) return true

  const normalizedStates = [
    provider.provider_status,
    provider.providerStatus,
    provider.admin_validation_status,
    provider.adminValidationStatus,
    provider.review_status,
    provider.reviewStatus,
    provider.approval_status,
    provider.validation_status,
    provider.validationStatus,
    provider.status,
    provider.operator_status,
    provider.operatorStatus,
  ]
    .map((value) => normalizeWorkflowStatus(value))
    .filter(Boolean)

  return normalizedStates.some((status) => ['submitted', 'under_review', 'approved', 'observations', 'rejected', 'suspended'].includes(status))
}

export function isProviderSatApproved(provider = {}) {
  const normalizedStatus = normalizeToken(
    provider.sat_validation_status ||
      provider.satValidationStatus ||
      provider.tax_data?.sat_validation_status ||
      provider.profile?.tax_data?.sat_validation_status,
  )

  return isProviderRequirementApproved(
    provider,
    ['sat_validation', 'sat_validated'],
    ['approved', 'validated', 'aprobado'].includes(normalizedStatus) || hasApprovedSatCertificate(provider),
  )
}

function buildFleetSummary(provider = {}, metrics = {}) {
  const explicit = provider.provider_status_summary?.fleetSummary || provider.provider_status_summary?.fleet_summary
  if (explicit && typeof explicit === 'object') {
    return {
      total: toNumber(explicit.total, 0),
      active: toNumber(explicit.active, 0),
      pending: toNumber(explicit.pending, 0),
      trial: toNumber(explicit.trial, 0),
      status: explicit.status || explicit.key || 'no_aircraft',
      label: explicit.label || 'Sin aeronaves',
      operationalLabel: explicit.operationalLabel || explicit.operational_label || '',
    }
  }

  const total = toNumber(metrics.aircraft ?? provider.aircraft_count ?? provider.aircraft_metrics?.aircraft, 0)
  const active = toNumber(metrics.active ?? provider.active_aircraft_count ?? provider.aircraft_metrics?.active, 0)
  const pending = toNumber(metrics.pending ?? provider.pending_aircraft_count ?? provider.aircraft_metrics?.pending, 0)
  const trial = toNumber(metrics.trial ?? provider.trial_aircraft_count ?? provider.aircraft_metrics?.trial, 0)

  let status = 'no_aircraft'
  let label = 'Sin aeronaves'
  if (total > 0 && active === 0) {
    status = 'pending_fleet'
    label = 'Flota pendiente'
  } else if (total > 0 && active === total && pending === 0 && trial === 0) {
    status = 'active_fleet'
    label = 'Flota activa'
  } else if (active > 0 && (pending > 0 || trial > 0 || active < total)) {
    status = 'mixed_fleet'
    label = 'Flota mixta'
  }

  return {
    total,
    active,
    pending,
    trial,
    status,
    label,
    operationalLabel: '',
  }
}

function readExplicitProviderStatusSummary(provider = {}) {
  const explicit = provider.provider_status_summary || provider.providerStatusSummary
  return explicit && typeof explicit === 'object' ? explicit : null
}

export function providerStatusMetaByKey(status = 'draft') {
  switch (status) {
    case 'approved':
      return { key: status, label: 'Aprobado', description: 'El expediente fue validado y aprobado por el administrador.', tone: 'success', icon: '●' }
    case 'rejected':
      return { key: status, label: 'Rechazado', description: 'El proveedor no cumple los requisitos.', tone: 'danger', icon: '●' }
    case 'suspended':
      return { key: status, label: 'Suspendido', description: 'El proveedor aprobado fue suspendido administrativamente.', tone: 'neutral', icon: '●' }
    case 'observations':
      return { key: status, label: 'Requiere correcciones', description: 'El administrador encontro datos o documentos que deben corregirse.', tone: 'danger', icon: '●' }
    case 'under_review':
      return { key: status, label: 'En revision', description: 'El administrador esta revisando el expediente.', tone: 'info', icon: '●' }
    case 'submitted':
      return { key: status, label: 'Enviado a revision', description: 'El proveedor termino la captura y envio el expediente.', tone: 'info', icon: '●' }
    case 'incomplete':
      return { key: status, label: 'Expediente incompleto', description: 'Faltan datos, documentos o validaciones obligatorias.', tone: 'warning', icon: '●' }
    default:
      return { key: 'draft', label: 'Registro iniciado', description: 'El proveedor comenzo su registro, pero aun faltan varios datos obligatorios.', tone: 'neutral', icon: '●' }
  }
}

export function buildProviderStatusSummary(provider = {}, metrics = {}) {
  const explicitSummary = readExplicitProviderStatusSummary(provider)
  const documentSummary = buildDocumentSummary(provider)
  const fleetSummary = buildFleetSummary(provider, metrics)
  const representative = resolveProviderRepresentativeName(provider)
  const address = provider.address || provider.direccion || provider.user?.profile?.address || ''
  const companyName = resolveProviderCompanyName(provider)
  const companyDataComplete = isProviderRequirementApproved(
    provider,
    'company_identity',
    Boolean(provider.legal_name || provider.razon_social || provider.company_name)
      && Boolean(provider.commercial_name || provider.trade_name || provider.nombre_comercial || provider.company_name)
      && Boolean(address),
  )
  const validRfc = isProviderRequirementApproved(provider, 'rfc_valid', isValidMexicanRfc(provider.rfc || provider.tax_id))
  const satValidated = isProviderSatApproved(provider)
  const baseDefined = isProviderRequirementApproved(provider, 'base_operativa', Boolean(provider.base_airport || provider.base || provider.location || provider.user?.profile?.base_airport))
  const contactComplete = isProviderRequirementApproved(provider, 'contact_complete', Boolean((provider.company_phone || provider.phone) && (provider.company_email || provider.email)))
  const legalRepresentativeComplete = isProviderRequirementApproved(provider, 'legal_representative_complete', representative !== 'Sin representante')
  const legalDocumentsApproved = isProviderRequirementApproved(provider, 'legal_documents_approved', areLegalDocumentsApproved(documentSummary))
  const reviewSubmitted = isProviderReviewSubmitted(provider)

  const requirements = [
    { key: 'company_data_complete', label: 'Datos de empresa completos', complete: companyDataComplete },
    { key: 'valid_rfc', label: 'RFC valido', complete: validRfc },
    { key: 'sat_validated', label: 'Validacion SAT', complete: satValidated },
    { key: 'operational_base_defined', label: 'Base operativa definida', complete: baseDefined },
    { key: 'contact_data_complete', label: 'Datos de contacto completos', complete: contactComplete },
    { key: 'legal_representative_complete', label: 'Representante legal completo', complete: legalRepresentativeComplete },
    { key: 'legal_documents_approved', label: 'Documentacion legal aprobada', complete: legalDocumentsApproved },
    { key: 'expediente_submitted', label: 'Expediente enviado a revision', complete: reviewSubmitted },
  ]

  const missingRequirements = requirements.filter((item) => !item.complete).map((item) => item.label)
  const completedChecks = requirements.filter((item) => item.complete).length
  const progress = explicitSummary ? toNumber(explicitSummary.progress, 0) : (requirements.length ? Math.round((completedChecks / requirements.length) * 100) : 0)

  const normalizedStates = [
    provider.provider_status,
    provider.providerStatus,
    provider.admin_validation_status,
    provider.adminValidationStatus,
    provider.review_status,
    provider.reviewStatus,
    provider.approval_status,
    provider.validation_status,
    provider.status,
    provider.operator_status,
    provider.operatorStatus,
  ]
    .map((value) => normalizeWorkflowStatus(value))
    .filter(Boolean)

  const hasRejectedRequirement = ['sat_validation', 'sat_validated', 'legal_documents_approved', 'legal_representative_complete', 'review_submitted', 'rfc_valid', 'contact_complete', 'base_operativa', 'company_identity']
    .some((key) => isProviderRequirementRejected(provider, key))
  const hasRejectedDocuments = documentSummary.rejected > 0
  const accessEnabled = Boolean(provider.access_enabled ?? provider.accessEnabled ?? false)
  const operatorActive = ['active', 'validated'].includes(normalizeToken(provider.operator_status || provider.operatorStatus))
  const startedSignals = [
    provider.company_name,
    provider.commercial_name,
    provider.legal_name,
    provider.rfc,
    address,
    provider.base_airport,
    provider.company_phone,
    provider.company_email,
    representative !== 'Sin representante' ? representative : '',
  ].filter((value) => normalizeText(value)).length + (documentSummary.total - documentSummary.missing > 0 ? 1 : 0)

  let status = explicitSummary?.status ? normalizeWorkflowStatus(explicitSummary.status) : ''
  if (!status) {
    status = 'draft'
    if (normalizedStates.includes('suspended')) status = 'suspended'
    else if (normalizedStates.includes('rejected')) status = 'rejected'
    else if (normalizedStates.includes('observations') || hasRejectedRequirement || hasRejectedDocuments) status = 'observations'
    else if (normalizedStates.includes('approved') || (accessEnabled && operatorActive)) status = 'approved'
    else if (normalizedStates.includes('under_review')) status = 'under_review'
    else if (normalizedStates.includes('submitted') || (reviewSubmitted && normalizedStates.length === 0)) status = 'submitted'
    else if (startedSignals > 1 || missingRequirements.length < requirements.length) status = 'incomplete'
  }

  const statusMeta = providerStatusMetaByKey(status)
  const operationalLabel = status === 'approved' && fleetSummary.active > 0 && status !== 'suspended' ? 'Operando' : ''

  return {
    status,
    statusMeta,
    progress,
    documentSummary,
    fleetSummary: {
      ...fleetSummary,
      operationalLabel,
    },
    missingRequirements: Array.isArray(explicitSummary?.missing_requirements) ? explicitSummary.missing_requirements : missingRequirements,
    requirements,
    requirementsByKey: {
      company_data_complete: companyDataComplete,
      valid_rfc: validRfc,
      sat_validated: satValidated,
      sat_validation: satValidated,
      legal_documents_approved: legalDocumentsApproved,
      operational_base_defined: baseDefined,
      base_operativa: baseDefined,
      contact_complete: contactComplete,
      legal_representative_complete: legalRepresentativeComplete,
      review_submitted: reviewSubmitted,
      expediente_submitted: reviewSubmitted,
    },
    canSubmit:
      companyDataComplete
      && validRfc
      && satValidated
      && legalDocumentsApproved
      && baseDefined
      && contactComplete
      && legalRepresentativeComplete,
    submitted: reviewSubmitted,
    representative,
    companyName,
    base: provider.base_airport || provider.base || provider.location || 'Base pendiente',
    accessEnabled,
  }
}
