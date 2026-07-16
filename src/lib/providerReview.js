import { looksLikePlaceholderCompany, resolveBestCompanyDisplayName } from './companyDisplay'
import { resolveCompanyDocumentDefinition } from './providerCompanyDocuments'
import {
  areLegalDocumentsApproved,
  buildProviderDocumentSummary,
  buildProviderStatusSummary,
  isProviderReviewSubmitted,
  isProviderRequirementApproved,
  isProviderRequirementRejected,
  resolveProviderRepresentativeName as resolveProviderRepresentativeNameFromStatus,
} from '../utils/providerStatus'

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

function isValidMexicanRfc(value = '') {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')

  return /^([A-Z&Ñ]{3,4})\d{6}[A-Z0-9]{3}$/.test(normalized)
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

function normalizeRequirementDecisionStatus(value = '') {
  const normalized = normalizeToken(value)
  if (['approved', 'aprobado', 'aprobada', 'validated', 'validado', 'validada'].includes(normalized)) return 'approved'
  if (['rejected', 'rechazado', 'rechazada', 'cancelled', 'canceled', 'cancelado', 'cancelada'].includes(normalized)) return 'rejected'
  return 'pending'
}

function normalizeExplicitBoolean(value) {
  if (value === true) return true
  if (value === false) return false

  const normalized = normalizeToken(value)
  if (!normalized) return null
  if (['true', '1', 'yes', 'si', 'approved', 'aprobado', 'aprobada', 'validated', 'validado', 'validada', 'complete', 'completo', 'completa'].includes(normalized)) {
    return true
  }
  if (['false', '0', 'no', 'pending', 'pendiente', 'rejected', 'rechazado', 'rechazada', 'incomplete', 'incompleto', 'incompleta'].includes(normalized)) {
    return false
  }

  return null
}

function normalizeRequirementComplete(item = {}) {
  const explicit = normalizeExplicitBoolean(item.complete)
  if (explicit !== null) return explicit

  const decisionStatus = normalizeRequirementDecisionStatus(item.response_status || item.responseStatus)
  if (decisionStatus === 'approved' || decisionStatus === 'rejected') return true

  return false
}

function hasOperationalBase(provider = {}) {
  const candidates = [
    provider.base_airport,
    provider.base,
    provider.location,
    provider.user?.profile?.base_airport,
    provider.user?.profile?.base,
  ]

  return candidates.some((value) => {
    const normalized = normalizeText(value).toLowerCase()
    return normalized && !['base pendiente', 'sin base operativa', 'pendiente', 'n/a', 'na'].includes(normalized)
  })
}

function requirementResponseApproved(item = {}) {
  return normalizeRequirementDecisionStatus(item.responseStatus || item.response_status) === 'approved'
}

function requirementResponseRejected(item = {}) {
  return normalizeRequirementDecisionStatus(item.responseStatus || item.response_status) === 'rejected'
}

function normalizeReviewDocumentStatus(document = {}) {
  return normalizeRequirementDecisionStatus(
    document.status || document.state || document.validation_status || document.review_status || document.currentStatus,
  )
}

function normalizeReviewDocuments(provider = {}) {
  return normalizeDocumentCollection(provider).map((document, index) => {
    const definition = resolveCompanyDocumentDefinition(document)

    return {
      ...document,
      _index: index,
      _definitionKey: document.definitionKey || document.definition_key || definition?.id || '',
      _sectionKey: document.sectionKey || document.section_key || document.document_section || definition?.sectionKey || '',
      _normalizedStatus: normalizeReviewDocumentStatus(document),
      _reviewedAt: document.reviewedAt || document.reviewed_at || document.validated_at || document.validatedAt || '',
      _reviewedBy: document.reviewedBy || document.reviewed_by || document.validated_by || document.validatedBy || '',
      _rejectionReason: document.rejectionReason || document.rejection_reason || '',
    }
  })
}

const LEGAL_REQUIREMENT_DOCUMENT_KEYS = [
  'articles_of_incorporation',
  'legal_representative_power',
  'legal_representative_id',
  'tax_address_proof',
  'operational_permit',
]

function latestReviewedDocument(documents = []) {
  return [...documents].sort((left, right) => {
    const leftTime = new Date(left._reviewedAt || 0).getTime()
    const rightTime = new Date(right._reviewedAt || 0).getTime()
    return rightTime - leftTime
  })[0] || null
}

function resolveDocumentRequirementState(documents = [], options = {}) {
  const expectedKeys = Array.isArray(options.expectedKeys) ? options.expectedKeys : []
  const availableDocuments = Array.isArray(documents) ? documents : []
  const hasAllExpectedDocuments =
    expectedKeys.length === 0
      ? availableDocuments.length > 0
      : expectedKeys.every((key) => availableDocuments.some((document) => document._definitionKey === key))
  const approvedCount = availableDocuments.filter((document) => document._normalizedStatus === 'approved').length
  const rejectedCount = availableDocuments.filter((document) => document._normalizedStatus === 'rejected').length

  if (!availableDocuments.length || !hasAllExpectedDocuments) {
    return {
      complete: false,
      responseStatus: 'pending',
    }
  }

  if (rejectedCount > 0) {
    return {
      complete: true,
      responseStatus: 'rejected',
    }
  }

  if (approvedCount === availableDocuments.length) {
    return {
      complete: true,
      responseStatus: 'approved',
    }
  }

  return {
    complete: true,
    responseStatus: 'pending',
  }
}

function buildBackendRequirementMap(provider = {}) {
  const backendRequirements = Array.isArray(provider.validation_requirements)
    ? provider.validation_requirements
    : Array.isArray(provider.validationRequirements)
      ? provider.validationRequirements
      : []

  return new Map(
    backendRequirements.map((item, index) => [
      item.key || item.id || item.label || `backend-${index + 1}`,
      item,
    ]),
  )
}

function buildRequirementRecord(base, backendItem = {}, overrides = {}) {
  return {
    key: base.key,
    label: backendItem.label || base.label,
    complete: overrides.complete ?? normalizeRequirementComplete(backendItem),
    message: backendItem.message || backendItem.reason || base.message,
    responseStatus:
      overrides.responseStatus ||
      backendItem.response_status ||
      backendItem.responseStatus ||
      'pending',
    adminNote:
      overrides.adminNote ??
      backendItem.admin_note ??
      backendItem.adminNote ??
      '',
    respondedAt:
      overrides.respondedAt ??
      backendItem.responded_at ??
      backendItem.respondedAt ??
      '',
    actorId: backendItem.actor_id || backendItem.actorId || null,
    actorName:
      overrides.actorName ??
      backendItem.actor_name ??
      backendItem.actorName ??
      '',
    actorType: backendItem.actor_type || backendItem.actorType || '',
    sourceDocuments: Array.isArray(overrides.sourceDocuments) ? overrides.sourceDocuments : [],
  }
}

function resolveValidationRequirements(provider = {}, metrics = {}) {
  const providerStatus = buildProviderStatusSummary(provider, metrics)
  const backendRequirementMap = buildBackendRequirementMap(provider)
  const documents = normalizeReviewDocuments(provider)
  const hasCompanyData = Boolean(
    provider.legal_name ||
      provider.razon_social ||
      provider.company_name ||
      provider.commercial_name ||
      provider.nombre_empresa
  )
  const hasContact = Boolean(provider.company_phone || provider.phone) && Boolean(provider.company_email || provider.email)
  const hasFiscal = isValidMexicanRfc(provider.rfc || provider.tax_id)
  const representative = providerStatus.representative || resolveProviderRepresentativeNameFromStatus(provider)
  const base = provider.base_airport || provider.base || provider.location || provider.user?.profile?.base_airport || ''
  const documentSummary = providerStatus.documentSummary || buildProviderDocumentSummary(provider)
  const satDocuments = documents.filter((document) => document._definitionKey === 'sat_certificate')
  const legalDocuments = documents.filter(
    (document) =>
      LEGAL_REQUIREMENT_DOCUMENT_KEYS.includes(document._definitionKey) ||
      (document._sectionKey === 'legal' && document._definitionKey !== 'sat_certificate'),
  )
  const satDocumentState = resolveDocumentRequirementState(satDocuments, { expectedKeys: ['sat_certificate'] })
  const legalDocumentState = resolveDocumentRequirementState(legalDocuments, { expectedKeys: LEGAL_REQUIREMENT_DOCUMENT_KEYS })
  const latestSatDocument = latestReviewedDocument(satDocuments)
  const latestLegalDocument = latestReviewedDocument(legalDocuments)
  const satFallbackStatus = normalizeRequirementDecisionStatus(resolveSatValidationStatus(provider))
  const satRequirementApproved = isProviderRequirementApproved(
    provider,
    ['sat_validation', 'sat_validated'],
    providerStatus.requirementsByKey?.sat_validated === true,
  )
  const satRequirementRejected = isProviderRequirementRejected(provider, ['sat_validation', 'sat_validated'])
  const satRequirementStatus = satRequirementApproved
    ? 'approved'
    : satRequirementRejected
      ? 'rejected'
      : satDocuments.length > 0 || satDocumentState.complete
        ? satDocumentState.responseStatus
        : satFallbackStatus
  const satRequirementComplete = satRequirementStatus === 'approved'
  const legalRequirementApproved = isProviderRequirementApproved(
    provider,
    'legal_documents_approved',
    providerStatus.requirementsByKey?.legal_documents_approved === true || areLegalDocumentsApproved(documentSummary),
  )
  const legalRequirementRejected =
    isProviderRequirementRejected(provider, 'legal_documents_approved') ||
    legalDocumentState.responseStatus === 'rejected' ||
    documentSummary.rejected > 0
  const legalRequirementStatus = legalRequirementApproved
    ? 'approved'
    : legalRequirementRejected
      ? 'rejected'
      : 'pending'
  const legalRequirementComplete = legalRequirementStatus === 'approved'
  const requirements = [
    buildRequirementRecord(
      { key: 'company_identity', label: 'Datos de empresa completos', message: 'Faltan datos corporativos del operador.' },
      backendRequirementMap.get('company_identity'),
      {
        complete: hasCompanyData,
      },
    ),
    buildRequirementRecord(
      { key: 'rfc_valid', label: 'RFC valido', message: 'Falta RFC valido del operador.' },
      backendRequirementMap.get('rfc_valid'),
      {
        complete: hasFiscal,
      },
    ),
    buildRequirementRecord(
      { key: 'sat_validation', label: 'Validacion SAT', message: 'La validacion SAT sigue pendiente.' },
      backendRequirementMap.get('sat_validation'),
      {
        complete: satRequirementComplete,
        responseStatus: satRequirementStatus,
        respondedAt: latestSatDocument?._reviewedAt,
        actorName: latestSatDocument?._reviewedBy,
        adminNote: latestSatDocument?._rejectionReason,
        sourceDocuments: satDocuments.map((document) => document.id || document._index),
      },
    ),
    buildRequirementRecord(
      { key: 'legal_documents_approved', label: 'Documentacion legal aprobada', message: 'La documentacion legal aun no esta aprobada.' },
      backendRequirementMap.get('legal_documents_approved'),
      {
        complete: legalRequirementComplete,
        responseStatus: legalRequirementStatus,
        respondedAt: latestLegalDocument?._reviewedAt,
        actorName: latestLegalDocument?._reviewedBy,
        adminNote:
          latestLegalDocument?._rejectionReason ||
          legalDocuments.find((document) => document._normalizedStatus === 'rejected')?._rejectionReason,
        sourceDocuments: legalDocuments.map((document) => document.id || document._index),
      },
    ),
    buildRequirementRecord(
      { key: 'base_operativa', label: 'Base operativa definida', message: 'Falta base operativa definida.' },
      backendRequirementMap.get('base_operativa'),
      {
        complete: hasOperationalBase(provider),
      },
    ),
    buildRequirementRecord(
      { key: 'contact_complete', label: 'Datos de contacto completos', message: 'Faltan datos de contacto completos.' },
      backendRequirementMap.get('contact_complete'),
      {
        complete: hasContact,
      },
    ),
    buildRequirementRecord(
      { key: 'legal_representative_complete', label: 'Representante legal completo', message: 'Falta representante legal completo.' },
      backendRequirementMap.get('legal_representative_complete'),
      {
        complete: representative !== 'Sin representante',
      },
    ),
    buildRequirementRecord(
      { key: 'review_submitted', label: 'Expediente enviado a revision', message: 'El proveedor aun no envia el expediente a revision administrativa.' },
      backendRequirementMap.get('review_submitted'),
      {
        complete: isProviderReviewSubmitted(provider),
      },
    ),
  ]

  backendRequirementMap.forEach((item, key) => {
    if (requirements.some((requirement) => requirement.key === key)) return
    requirements.push(
      buildRequirementRecord(
        { key, label: item.label || item.key || 'Requisito', message: item.message || item.reason || '' },
        item,
      ),
    )
  })

  return requirements
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
  return resolveProviderRepresentativeNameFromStatus(provider)
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
  if (accessEnabled && ['active', 'validated'].includes(operatorStatus)) return 'approved'
  if (accessEnabled && approval === 'approved') return 'approved'
  if (approval === 'rejected') return 'rejected'
  if (['changes_requested', 'changes_required', 'suspended'].includes(approval)) return 'changes_required'
  if (['changes_requested', 'changes_required'].includes(explicit)) return 'changes_required'
  if (provider.admin_review_submitted_at || provider.adminReviewSubmittedAt) return 'pending_review'
  return 'draft'
}

export function resolveProviderStatusMeta(provider = {}) {
  const summary = buildProviderStatusSummary(provider)
  const headlineMap = {
    draft: 'Expediente pendiente de validacion administrativa',
    incomplete: 'Expediente pendiente de validacion administrativa',
    submitted: 'Expediente enviado a revision administrativa',
    under_review: 'Operador en revision administrativa',
    observations: 'Cambios solicitados por administracion',
    approved: 'Operador validado por administracion',
    rejected: 'Expediente rechazado por administracion',
    suspended: 'Operador suspendido administrativamente',
  }

  return {
    ...summary.statusMeta,
    headline: headlineMap[summary.status] || headlineMap.draft,
  }
}

export function buildProviderReviewFlow(provider = {}, metrics = {}) {
  const providerStatus = buildProviderStatusSummary(provider, metrics)
  const baseStatusMeta = {
    ...providerStatus.statusMeta,
    headline: resolveProviderStatusMeta(provider).headline,
  }
  const documentCount = countDocuments(provider)
  const aircraft = providerStatus.fleetSummary.total
  const active = providerStatus.fleetSummary.active
  const trial = providerStatus.fleetSummary.trial
  const representative = providerStatus.representative
  const base = providerStatus.base
  const validationRequirements = resolveValidationRequirements(provider, metrics)
  const approvedValidationItems = validationRequirements.filter((item) => requirementResponseApproved(item))
  const rejectedValidationItems = validationRequirements.filter((item) => requirementResponseRejected(item))
  const pendingValidationItems = validationRequirements.filter(
    (item) => !requirementResponseApproved(item) && !requirementResponseRejected(item),
  )
  const missingValidationItems = validationRequirements.filter((item) => !requirementResponseApproved(item))
  const allRequirementsApproved =
    validationRequirements.length > 0 && validationRequirements.every((item) => item.complete && requirementResponseApproved(item))
  const explicitCanValidate = normalizeExplicitBoolean(provider.can_validate ?? provider.canValidate)
  const canValidate = allRequirementsApproved && (explicitCanValidate == null ? true : explicitCanValidate === true)
  const checklist = validationRequirements.map((item) => ({
    id: item.key,
    label: item.label,
    complete: requirementResponseApproved(item),
    pending: !requirementResponseApproved(item) && !requirementResponseRejected(item) && item.complete,
    rejected: requirementResponseRejected(item),
  }))

  const completed = checklist.filter((step) => step.complete).length
  const progress = {
    completed,
    total: checklist.length,
    percent: providerStatus.progress,
  }
  const statusMeta = baseStatusMeta

  const summary = [
    { label: 'Estado del proveedor', value: statusMeta.label, tone: statusMeta.tone },
    {
      label: 'Documentacion',
      value: `${providerStatus.documentSummary.approved}/${providerStatus.documentSummary.total} aprobados`,
      tone: providerStatus.documentSummary.approved === providerStatus.documentSummary.total ? 'success' : providerStatus.documentSummary.rejected ? 'danger' : 'warning',
    },
    {
      label: 'Pendientes documentales',
      value: `${providerStatus.documentSummary.pending}`,
      tone: providerStatus.documentSummary.pending ? 'warning' : 'success',
    },
    {
      label: 'Requisitos admin aprobados',
      value: `${approvedValidationItems.length}/${validationRequirements.length}`,
      tone: allRequirementsApproved ? 'success' : approvedValidationItems.length ? 'warning' : 'neutral',
    },
    {
      label: 'Requisitos pendientes',
      value: `${pendingValidationItems.length}`,
      tone: pendingValidationItems.length ? 'warning' : 'success',
    },
    {
      label: 'Requisitos rechazados',
      value: `${rejectedValidationItems.length}`,
      tone: rejectedValidationItems.length ? 'danger' : 'neutral',
    },
    {
      label: 'Estado operativo',
      value: providerStatus.fleetSummary.label,
      tone: providerStatus.fleetSummary.status === 'active_fleet' ? 'success' : providerStatus.fleetSummary.status === 'mixed_fleet' ? 'info' : 'warning',
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

  const alerts = [
    ...rejectedValidationItems.map((item) => ({
      tone: 'danger',
      title: item.adminNote || item.message || `${item.label} rechazado`,
    })),
    ...pendingValidationItems.map((item) => ({
      tone: item.complete ? 'warning' : 'info',
      title:
        item.complete
          ? `${item.label} pendiente de decision administrativa.`
          : item.message || `${item.label} pendiente`,
    })),
  ]

  if (statusMeta.key === 'observations') {
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
    alerts.push({ tone: 'info', title: statusMeta.description || 'Expediente pendiente de validacion administrativa.' })
  }

  return {
    status: providerStatus.status,
    statusMeta,
    progress,
    checklist,
    validationRequirements,
    summary,
    alerts: alerts.slice(0, 4),
    canValidate,
    missingValidationItems,
    missingRequirements: providerStatus.missingRequirements,
    requirementsByKey: providerStatus.requirementsByKey,
    canSubmit: providerStatus.canSubmit,
    submitted: providerStatus.submitted,
    accessEnabled: Boolean(provider.access_enabled ?? provider.accessEnabled ?? false),
    documentCount,
    documentSummary: providerStatus.documentSummary,
    fleetSummary: providerStatus.fleetSummary,
    representative,
    base,
    companyName: resolveProviderCompanyName(provider),
  }
}

export function buildProviderReviewFlowFromBackend(summary = {}, validationSummary = {}) {
  const statusMeta =
    summary.statusMeta ||
    resolveProviderStatusMeta({
      admin_validation_status: summary.expedienteStatus || validationSummary.expedienteStatus || summary.status,
      access_enabled: summary.accessEnabled || validationSummary.accessEnabled,
    })

  const checklist = Array.isArray(summary.checklist)
    ? summary.checklist
    : Array.isArray(validationSummary.checklist)
      ? validationSummary.checklist
      : []
  const progress =
    summary.progress ||
    validationSummary.progress || {
      completed: checklist.filter((item) => item.complete).length,
      total: checklist.length,
      percent: checklist.length ? Math.round((checklist.filter((item) => item.complete).length / checklist.length) * 100) : 0,
    }
  const validationRequirements = Array.isArray(validationSummary.validationRequirements)
    ? validationSummary.validationRequirements
    : Array.isArray(summary.validationRequirements)
      ? summary.validationRequirements
      : []
  const alerts = Array.isArray(validationSummary.alerts)
    ? validationSummary.alerts
    : Array.isArray(summary.alerts)
      ? summary.alerts
      : []
  const summaryItems = Array.isArray(summary.summary)
    ? summary.summary
    : Array.isArray(validationSummary.summary)
      ? validationSummary.summary
      : []

  return {
    statusMeta,
    progress,
    checklist,
    validationRequirements,
    summary: summaryItems,
    alerts,
    canValidate: Boolean(summary.canValidate ?? validationSummary.canValidate ?? false),
    missingValidationItems: Array.isArray(validationSummary.missingValidationItems)
      ? validationSummary.missingValidationItems
      : validationRequirements.filter((item) => !item.complete),
    accessEnabled: Boolean(summary.accessEnabled ?? validationSummary.accessEnabled ?? false),
    documentCount: Number(summary.documentCount || validationSummary.documentCount || 0),
    representative: summary.representative || validationSummary.representative || 'Sin representante',
    base: summary.base || validationSummary.base || 'Base pendiente',
    companyName: summary.companyName || validationSummary.companyName || 'Operador',
  }
}
