import { api, resolveMediaUrl } from './api'
import { pickCollection, pickRecord, requestWithCandidates } from './backendCrud'
import { normalizeOperatorValidationDocument } from './providerCompanyDocuments'
import { buildProviderReviewFlow, buildProviderReviewFlowFromBackend } from './providerReview'

function compactStatus(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function filterCandidates(candidates = []) {
  return candidates.filter((candidate) => candidate && candidate.when !== false)
}

function buildOperatorPath(operatorId, suffix = '') {
  const baseId = operatorId == null ? 'me' : String(operatorId)
  return `/operators/${baseId}${suffix}`
}

function isProviderRole(role = 'provider') {
  return String(role || '').trim().toLowerCase() === 'provider'
}

function getDocumentCollectionFromPayload(payload = {}) {
  return pickCollection(payload, ['documents', 'company_documents', 'legal_documents', 'documentos', 'data'])
}

function getActivityCollectionFromPayload(payload = {}) {
  return pickCollection(payload, ['activity', 'logs', 'timeline', 'audit_logs', 'data'])
}

function humanizeValidationStatus(status = '') {
  const normalized = compactStatus(status)
  if (normalized === 'approved') return 'Aprobado'
  if (normalized === 'rejected') return 'Rechazado'
  if (normalized === 'cancelled' || normalized === 'canceled') return 'Cancelado'
  if (normalized === 'expired') return 'Vencido'
  if (normalized === 'under_review' || normalized === 'pending_review') return 'En revision'
  if (normalized === 'blocked') return 'Bloqueado'
  if (normalized === 'incomplete') return 'Incompleto'
  return 'Pendiente'
}

export function getValidationTone(status = '') {
  const normalized = compactStatus(status)
  if (['approved'].includes(normalized)) return 'success'
  if (['rejected', 'cancelled', 'canceled', 'blocked'].includes(normalized)) return 'danger'
  if (['expired'].includes(normalized)) return 'warning'
  if (['under_review', 'pending_review'].includes(normalized)) return 'info'
  return 'warning'
}

export function buildValidationStatusMeta(status = '') {
  return {
    key: compactStatus(status) || 'pending',
    label: humanizeValidationStatus(status),
    tone: getValidationTone(status),
  }
}

export function formatValidationFileSize(size = 0) {
  const bytes = Number(size || 0)
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Sin tamano'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function formatValidationDate(value = '') {
  if (!value) return 'Sin fecha'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed)
}

export function normalizeValidationActivityEntry(raw = {}, index = 0) {
  const actionType =
    raw.action_type ||
    raw.actionType ||
    raw.event_type ||
    raw.eventType ||
    raw.action ||
    'activity'
  const createdAt = raw.created_at || raw.createdAt || raw.date || raw.at || ''

  return {
    id: raw.id || `${actionType}-${index}`,
    actionType,
    title: raw.title || raw.label || raw.description || humanizeValidationStatus(actionType),
    description: raw.comment || raw.notes || raw.detail || raw.message || '',
    createdAt,
    createdBy: raw.created_by_name || raw.actor_name || raw.actor || raw.created_by || '',
    targetType: raw.target_type || raw.targetType || '',
    targetId: raw.target_id || raw.targetId || null,
    oldStatus: raw.old_status || raw.oldStatus || '',
    newStatus: raw.new_status || raw.newStatus || '',
    tone: getValidationTone(raw.new_status || raw.action_type || raw.event_type || ''),
  }
}

function formatMoneyValue(value, suffix = '') {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 'Sin dato'
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric)
  return suffix ? `${formatted} ${suffix}` : formatted
}

export function buildOperatorCompanyProfile(raw = {}) {
  return [
    {
      label: 'Razon social',
      value: raw.legal_name || raw.razon_social || raw.legalName || raw.companyName || 'Sin razon social',
    },
    {
      label: 'RFC',
      value: raw.rfc || raw.tax_id || 'Sin RFC',
    },
    {
      label: 'Nombre comercial',
      value: raw.commercial_name || raw.company_name || raw.trade_name || raw.nombre_comercial || 'Sin nombre comercial',
    },
    {
      label: 'Base operativa',
      value: raw.base_airport || raw.base || raw.location || 'Sin base operativa',
    },
    {
      label: 'Direccion fiscal',
      value: raw.address || raw.direccion || 'Sin direccion fiscal',
    },
    {
      label: 'Representante legal',
      value: raw.legal_representative || raw.representative_name || raw.representante_legal || raw.representative || 'Sin representante legal',
    },
    {
      label: 'Telefono',
      value: raw.company_phone || raw.phone || raw.telefono || 'Sin telefono',
    },
    {
      label: 'Email',
      value: raw.company_email || raw.email || 'Sin email',
    },
  ]
}

export function buildOperatorCommercialConfig(raw = {}) {
  return [
    {
      label: 'Jet A USD/Gal',
      value: formatMoneyValue(raw.jet_a_price ?? raw.jetAPrice, 'USD'),
    },
    {
      label: 'Utilidad (%)',
      value: Number.isFinite(Number(raw.margin_percent ?? raw.marginPercent))
        ? `${Number(raw.margin_percent ?? raw.marginPercent).toFixed(2)} %`
        : 'Sin dato',
    },
    {
      label: 'Fee fijo global',
      value: formatMoneyValue(raw.fixed_fee ?? raw.fixedFee, 'USD'),
    },
  ]
}

export function buildOperatorFleetSummary(aircraft = []) {
  if (!Array.isArray(aircraft) || !aircraft.length) {
    return {
      count: 0,
      emptyLabel: 'No existen aeronaves registradas',
      items: [],
    }
  }

  return {
    count: aircraft.length,
    emptyLabel: '',
    items: aircraft.map((item, index) => ({
      id: item.id || index + 1,
      label:
        [item.manufacturer, item.name || item.model].filter(Boolean).join(' ') ||
        item.registration ||
        `Aeronave ${index + 1}`,
      detail: item.registration || item.base || '',
    })),
  }
}

export function normalizeValidationSummary(payload = {}) {
  const raw = pickRecord(payload, ['summary', 'validation_summary', 'validationSummary', 'data'])
  const checklist = Array.isArray(raw?.checklist) ? raw.checklist : []
  const summary = Array.isArray(raw?.summary) ? raw.summary : []
  const alerts = Array.isArray(raw?.alerts) ? raw.alerts : []
  const validationRequirements = Array.isArray(raw?.validation_requirements)
    ? raw.validation_requirements
    : Array.isArray(raw?.validationRequirements)
      ? raw.validationRequirements
      : []

  return {
    expedienteStatus: raw?.expediente_status || raw?.expedienteStatus || raw?.status || 'incomplete',
    canValidate: Boolean(raw?.can_validate ?? raw?.canValidate ?? false),
    progress: raw?.progress || {
      completed: checklist.filter((item) => item.complete).length,
      total: checklist.length,
      percent: checklist.length
        ? Math.round((checklist.filter((item) => item.complete).length / checklist.length) * 100)
        : 0,
    },
    checklist,
    summary,
    alerts,
    validationRequirements,
    missingValidationItems: Array.isArray(raw?.missing_validation_items)
      ? raw.missing_validation_items
      : Array.isArray(raw?.missingValidationItems)
        ? raw.missingValidationItems
        : validationRequirements.filter((item) => !item.complete),
    accessEnabled: Boolean(raw?.access_enabled ?? raw?.accessEnabled ?? false),
    representative: raw?.representative || '',
    base: raw?.base || '',
    companyName: raw?.company_name || raw?.companyName || '',
    documentCount: Number(raw?.document_count || raw?.documentCount || 0),
    statusMeta: buildValidationStatusMeta(raw?.expediente_status || raw?.status),
  }
}

export function normalizeOperatorSummary(payload = {}, options = {}) {
  const rawSummary = pickRecord(payload, ['summary', 'operator', 'provider', 'company', 'empresa', 'data'])
  const rawValidationSummary = pickRecord(payload, ['validation_summary', 'validationSummary'])
  const backendSummary = buildProviderReviewFlowFromBackend(rawSummary, normalizeValidationSummary(rawValidationSummary))
  const fallbackReview = buildProviderReviewFlow(rawSummary, options.metrics || {})

  return {
    id: rawSummary.id || rawSummary.provider_id || options.operatorId || null,
    companyName: rawSummary.company_name || rawSummary.commercial_name || rawSummary.legal_name || backendSummary.companyName || fallbackReview.companyName,
    representative: rawSummary.representative_name || rawSummary.legal_representative || backendSummary.representative || fallbackReview.representative,
    base: rawSummary.base_airport || rawSummary.base || backendSummary.base || fallbackReview.base,
    status: rawSummary.expediente_status || rawSummary.admin_validation_status || rawSummary.status || 'incomplete',
    statusMeta: backendSummary.statusMeta?.key ? backendSummary.statusMeta : fallbackReview.statusMeta,
    progress: backendSummary.progress?.total ? backendSummary.progress : fallbackReview.progress,
    checklist: backendSummary.checklist?.length ? backendSummary.checklist : fallbackReview.checklist,
    summary: backendSummary.summary?.length ? backendSummary.summary : fallbackReview.summary,
    alerts: backendSummary.alerts?.length ? backendSummary.alerts : fallbackReview.alerts,
    validationRequirements:
      backendSummary.validationRequirements?.length
        ? backendSummary.validationRequirements
        : fallbackReview.validationRequirements,
    canValidate: backendSummary.canValidate ?? fallbackReview.canValidate,
    accessEnabled: backendSummary.accessEnabled ?? fallbackReview.accessEnabled,
    documentCount:
      Number(rawSummary.document_count || rawSummary.documents_count || backendSummary.documentCount || fallbackReview.documentCount || 0),
    raw: rawSummary,
  }
}

export function normalizeOperatorDocuments(payload = {}) {
  return getDocumentCollectionFromPayload(payload).map((item, index) => {
    const normalized = normalizeOperatorValidationDocument(item, index)

    return {
      ...normalized,
      fileUrl: resolveMediaUrl(normalized.fileUrl),
      downloadUrl: resolveMediaUrl(normalized.downloadUrl),
    }
  })
}

async function runActionCandidates(candidates = [], requestOptions = {}) {
  return requestWithCandidates(filterCandidates(candidates), requestOptions)
}

export async function getOperatorSummary(operatorId, options = {}) {
  const role = options.role || 'provider'
  const response = await runActionCandidates([
    { method: 'get', path: buildOperatorPath(operatorId, '/summary'), timeoutMs: options.timeoutMs },
    { method: 'get', path: buildOperatorPath(operatorId), when: !isProviderRole(role), timeoutMs: options.timeoutMs },
    { method: 'get', path: '/proveedor/empresa', when: isProviderRole(role), timeoutMs: options.timeoutMs },
    { method: 'get', path: `/admin/providers/${operatorId}`, when: !isProviderRole(role), timeoutMs: options.timeoutMs },
    { method: 'get', path: `/admin/providers/${operatorId}/detail`, when: !isProviderRole(role), timeoutMs: options.timeoutMs },
    { method: 'get', path: '/proveedor/dashboard', when: isProviderRole(role), timeoutMs: options.timeoutMs },
  ], { signal: options.signal })

  return normalizeOperatorSummary(response, { operatorId })
}

export async function getOperatorCurrentDocuments(operatorId, options = {}) {
  const role = options.role || 'provider'
  const response = await runActionCandidates([
    { method: 'get', path: buildOperatorPath(operatorId, '/documents/current'), timeoutMs: options.timeoutMs },
    { method: 'get', path: buildOperatorPath(operatorId, '/documents'), when: !isProviderRole(role), timeoutMs: options.timeoutMs },
    { method: 'get', path: '/proveedor/empresa', when: isProviderRole(role), timeoutMs: options.timeoutMs },
    { method: 'get', path: `/admin/providers/${operatorId}/documents`, when: !isProviderRole(role), timeoutMs: options.timeoutMs },
    { method: 'get', path: `/admin/providers/${operatorId}`, when: !isProviderRole(role), timeoutMs: options.timeoutMs },
  ], { signal: options.signal })

  return normalizeOperatorDocuments(response).filter((item) => item.isCurrent !== false)
}

export async function getOperatorValidationSummary(operatorId, options = {}) {
  const role = options.role || 'provider'
  const response = await runActionCandidates([
    { method: 'get', path: buildOperatorPath(operatorId, '/validation-summary'), timeoutMs: options.timeoutMs },
    { method: 'get', path: buildOperatorPath(operatorId, '/summary'), timeoutMs: options.timeoutMs },
    { method: 'get', path: '/proveedor/empresa', when: isProviderRole(role), timeoutMs: options.timeoutMs },
    { method: 'get', path: `/admin/providers/${operatorId}`, when: !isProviderRole(role), timeoutMs: options.timeoutMs },
  ], { signal: options.signal })

  return normalizeValidationSummary(response)
}

export async function getOperatorActivity(operatorId, options = {}) {
  const role = options.role || 'provider'
  const response = await runActionCandidates([
    { method: 'get', path: buildOperatorPath(operatorId, '/activity'), timeoutMs: options.timeoutMs },
    { method: 'get', path: `/admin/providers/${operatorId}/activity`, when: !isProviderRole(role), timeoutMs: options.timeoutMs },
  ], { signal: options.signal })

  return getActivityCollectionFromPayload(response).map(normalizeValidationActivityEntry)
}

export async function getOperatorDocumentVersions(operatorId, documentId, options = {}) {
  const role = options.role || 'provider'
  const response = await runActionCandidates([
    { method: 'get', path: buildOperatorPath(operatorId, `/documents/${documentId}/versions`), timeoutMs: options.timeoutMs },
    { method: 'get', path: buildOperatorPath(operatorId, '/documents/current'), timeoutMs: options.timeoutMs },
    { method: 'get', path: '/proveedor/empresa', when: isProviderRole(role), timeoutMs: options.timeoutMs },
    { method: 'get', path: `/admin/providers/${operatorId}/documents`, when: !isProviderRole(role), timeoutMs: options.timeoutMs },
  ], { signal: options.signal })

  const documents = normalizeOperatorDocuments(response)
  const target = documents.find((item) => String(item.id) === String(documentId))
  if (target?.versions?.length) return target.versions.map((item, index) => normalizeOperatorValidationDocument(item, index))

  const fallbackVersions = documents
    .filter((item) => item.definitionKey === target?.definitionKey || String(item.id) === String(documentId))
    .sort((left, right) => Number(right.version || 0) - Number(left.version || 0))

  return fallbackVersions.length ? fallbackVersions : target ? [target] : []
}

export async function submitOperatorForReview(operatorId, options = {}) {
  const formData = options.formData instanceof FormData ? options.formData : null
  const body = options.body || {}

  return runActionCandidates([
    { method: formData ? 'postForm' : 'post', path: buildOperatorPath(operatorId, '/submit-review'), formData, body },
    { method: formData ? 'postForm' : 'post', path: '/proveedor/empresa/enviar-revision', formData, body },
    { method: formData ? 'postForm' : 'post', path: '/proveedor/empresa/send-review', formData, body },
    { method: formData ? 'postForm' : 'post', path: '/proveedor/empresa/revision', formData, body },
  ])
}

export async function validateOperatorSat(operatorId, body = {}) {
  return runActionCandidates([
    { method: 'post', path: buildOperatorPath(operatorId, '/validate-sat'), body },
    { method: 'post', path: `/admin/providers/${operatorId}/validate`, body },
  ])
}

export async function approveOperatorExpediente(operatorId, body = {}) {
  return runActionCandidates([
    { method: 'post', path: buildOperatorPath(operatorId, '/approve-expediente'), body },
    { method: 'post', path: `/admin/providers/${operatorId}/validate`, body },
  ])
}

export async function cancelOperatorExpediente(operatorId, body = {}) {
  return runActionCandidates([
    { method: 'post', path: buildOperatorPath(operatorId, '/cancel-expediente'), body },
    { method: 'post', path: `/admin/providers/${operatorId}/reject`, body },
    { method: 'post', path: `/admin/providers/${operatorId}/request-changes`, body },
  ])
}

export async function approveOperatorDocument(documentId, options = {}) {
  return runActionCandidates([
    { method: 'post', path: `/operator-documents/${documentId}/approve`, body: options.body || {} },
    {
      method: 'post',
      path: `/admin/providers/${options.operatorId}/documents/${documentId}/approve`,
      body: options.body || {},
      when: options.operatorId != null,
    },
  ])
}

export async function rejectOperatorDocument(documentId, options = {}) {
  return runActionCandidates([
    { method: 'post', path: `/operator-documents/${documentId}/reject`, body: options.body || {} },
    {
      method: 'post',
      path: `/admin/providers/${options.operatorId}/documents/${documentId}/reject`,
      body: options.body || {},
      when: options.operatorId != null,
    },
  ])
}

export async function cancelOperatorDocument(documentId, options = {}) {
  return runActionCandidates([
    { method: 'post', path: `/operator-documents/${documentId}/cancel`, body: options.body || {} },
    {
      method: 'post',
      path: `/admin/providers/${options.operatorId}/documents/${documentId}/reject`,
      body: options.body || {},
      when: options.operatorId != null,
    },
  ])
}

export async function replaceOperatorDocument(documentId, formData, options = {}) {
  return runActionCandidates([
    { method: 'postForm', path: `/operator-documents/${documentId}/replace`, formData },
    { method: 'postForm', path: '/proveedor/empresa/documentos', formData },
  ])
}

export async function downloadOperatorDocument(document, options = {}) {
  const operatorId = options.operatorId || document?.providerId || document?.operatorId
  const candidates = filterCandidates([
    { method: 'download', path: document?.downloadUrl || document?.fileUrl, when: /^\/.+/.test(String(document?.downloadUrl || document?.fileUrl || '')) },
    { method: 'download', path: `/admin/providers/${operatorId}/documents/${document?.id}/download`, when: operatorId != null && document?.id != null },
  ])

  if (candidates.length) {
    return requestWithCandidates(candidates)
  }

  if (document?.downloadUrl) {
    return api.download(document.downloadUrl)
  }

  throw new Error('El backend no expone una ruta de descarga compatible para este documento.')
}
