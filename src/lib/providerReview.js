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

export function resolveProviderStatusMeta(provider = {}) {
  const normalized = normalizeToken(
    provider.review_status ||
      provider.reviewStatus ||
      provider.validation_status ||
      provider.approval_status ||
      provider.status ||
      provider.state,
  )

  if (
    normalized.includes('approv') ||
    normalized.includes('aprob') ||
    normalized.includes('active') ||
    normalized.includes('activo')
  ) {
    return {
      key: 'approved',
      label: 'Aprobado',
      tone: 'success',
      headline: 'Operador validado',
    }
  }

  if (
    normalized.includes('reject') ||
    normalized.includes('rech') ||
    normalized.includes('suspend') ||
    normalized.includes('block') ||
    normalized.includes('cambio')
  ) {
    return {
      key: 'changes_required',
      label: 'Requiere cambios',
      tone: 'danger',
      headline: 'Accion requerida',
    }
  }

  if (
    normalized.includes('revision') ||
    normalized.includes('review') ||
    normalized.includes('pending') ||
    normalized.includes('pendiente') ||
    normalized.includes('validat')
  ) {
    return {
      key: 'in_review',
      label: 'En revision',
      tone: 'warning',
      headline: 'Validacion en proceso',
    }
  }

  return {
    key: 'neutral',
    label: provider.status || provider.approval_status || 'Sin estado',
    tone: 'neutral',
    headline: 'Perfil operativo',
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

  const checklist = [
    { id: 'company', label: 'Datos empresa', complete: hasCompanyData },
    { id: 'contact', label: 'Contacto', complete: hasContact },
    { id: 'tax', label: 'RFC', complete: hasFiscal },
    { id: 'documents', label: 'Documentos', complete: documentCount > 0, pending: documentCount === 0 },
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
    { label: 'Validacion SAT', value: hasFiscal ? 'Verificada' : 'Pendiente', tone: hasFiscal ? 'success' : 'warning' },
    {
      label: 'Documentacion legal',
      value: documentCount ? `${documentCount} documento(s)` : 'Sin documentos',
      tone: documentCount ? 'success' : 'warning',
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

  const alerts = []

  if (!hasFiscal) alerts.push({ tone: 'warning', title: 'Falta RFC para completar validacion fiscal' })
  if (!documentCount) alerts.push({ tone: 'warning', title: 'Falta cargar documentacion legal' })
  if (!aircraft) alerts.push({ tone: 'info', title: 'Empresa lista para registrar aeronaves' })
  if (statusMeta.key === 'changes_required') {
    alerts.push({ tone: 'danger', title: 'La cuenta requiere ajustes antes de aprobarse' })
  }
  if (!alerts.length) {
    alerts.push({ tone: 'success', title: 'Perfil listo para continuar con la revision operativa' })
  }

  return {
    statusMeta,
    progress,
    checklist,
    summary,
    alerts: alerts.slice(0, 3),
    documentCount,
    representative,
    base,
    companyName: resolveProviderCompanyName(provider),
  }
}
