import { looksLikePlaceholderCompany, resolveBestCompanyDisplayName } from './companyDisplay'
import { resolveCompanyDocumentDefinition } from './providerCompanyDocuments'

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

const APPROVED_AIRCRAFT_STATUSES = ['active', 'trial_active', 'inactive', 'approved', 'aprobado', 'aprobada']

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
  const backendRequirementMap = buildBackendRequirementMap(provider)
  const documents = normalizeReviewDocuments(provider)
  const aircraft = toNumber(metrics.aircraft || provider.aircraft_count || 0)
  const active = toNumber(metrics.active || provider.active_aircraft_count || 0)
  const hasCompanyData = Boolean(
    provider.legal_name ||
      provider.razon_social ||
      provider.company_name ||
      provider.commercial_name ||
      provider.nombre_empresa
  )
  const hasContact = Boolean(provider.company_phone || provider.phone) && Boolean(provider.company_email || provider.email)
  const hasFiscal = Boolean(provider.rfc)
  const representative = resolveProviderRepresentativeName(provider)
  const base = provider.base_airport || provider.base || provider.location || ''
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
  const satRequirementStatus =
    satDocuments.length > 0 || satDocumentState.complete
      ? satDocumentState.responseStatus
      : satFallbackStatus
  const satRequirementComplete = satRequirementStatus === 'approved'
  const legalRequirementComplete = legalDocumentState.responseStatus === 'approved'
  const providerAircraft = Array.isArray(provider.aircraft) ? provider.aircraft : []
  const approvedAircraftCount = providerAircraft.filter((item) =>
    APPROVED_AIRCRAFT_STATUSES.includes(normalizeToken(item?.status)),
  ).length
  const aircraftRequirementComplete = approvedAircraftCount > 0 || active > 0

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
        responseStatus: legalDocumentState.responseStatus,
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
        complete: Boolean(base),
      },
    ),
    buildRequirementRecord(
      { key: 'aircraft_active', label: 'Aeronave activa o aprobada', message: 'Se requiere al menos una aeronave activa o aprobada.' },
      backendRequirementMap.get('aircraft_active'),
      {
        complete: aircraftRequirementComplete,
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
  const baseStatusMeta = resolveProviderStatusMeta(provider)
  const documentCount = countDocuments(provider)
  const aircraft = toNumber(metrics.aircraft || provider.aircraft_count || 0)
  const active = toNumber(metrics.active || provider.active_aircraft_count || 0)
  const pending = toNumber(metrics.pending || provider.pending_aircraft_count || 0)
  const trial = toNumber(metrics.trial || provider.trial_aircraft_count || 0)
  const representative = resolveProviderRepresentativeName(provider)
  const base = provider.base_airport || provider.base || provider.location || 'Base pendiente'
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
    percent: checklist.length ? Math.round((completed / checklist.length) * 100) : 0,
  }
  const statusMeta =
    baseStatusMeta.key === 'draft' && allRequirementsApproved
      ? {
          key: 'pending',
          label: 'Listo para validar',
          tone: 'info',
          headline: 'Expediente listo para validacion administrativa',
        }
      : baseStatusMeta

  const summary = [
    { label: 'Estado empresa', value: statusMeta.label, tone: statusMeta.tone },
    {
      label: 'Expediente',
      value: allRequirementsApproved ? 'Completo' : rejectedValidationItems.length ? 'Con observaciones' : 'Incompleto',
      tone: allRequirementsApproved ? 'success' : rejectedValidationItems.length ? 'danger' : 'warning',
    },
    {
      label: 'Documentacion legal',
      value: (() => {
        const legalRequirement = validationRequirements.find((item) => item.key === 'legal_documents_approved')
        if (!legalRequirement) return documentCount ? `${documentCount} documento(s)` : 'Sin documentos'
        if (requirementResponseApproved(legalRequirement)) return 'Aprobada'
        if (requirementResponseRejected(legalRequirement)) return 'Rechazada'
        return legalRequirement.complete ? 'Pendiente de decision' : 'Incompleta'
      })(),
      tone: (() => {
        const legalRequirement = validationRequirements.find((item) => item.key === 'legal_documents_approved')
        if (!legalRequirement) return documentCount ? 'warning' : 'warning'
        if (requirementResponseApproved(legalRequirement)) return 'success'
        if (requirementResponseRejected(legalRequirement)) return 'danger'
        return legalRequirement.complete ? 'warning' : 'warning'
      })(),
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
