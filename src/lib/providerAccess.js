import { extractExplicitRoles, normalizeAuthRole } from './authRouting'
import { resolveProviderIdForUser } from './providerContext'
import { resolveProviderAdminValidationStatus } from './providerReview'

function normalizeProviderIdentifier(value) {
  const numericValue = Number(value || 0)
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null
}

function hasProviderCompanySignals(company = {}) {
  if (!company || typeof company !== 'object') return false

  return [
    company.id,
    company.provider_id,
    company.legalName,
    company.tradeName,
    company.rfc,
    company.adminValidationStatus,
    company.admin_validation_status,
    company.reviewStatus,
    company.review_status,
    company.approvalStatus,
    company.approval_status,
    company.operatorStatus,
    company.operator_status,
    company.accessEnabled,
    company.access_enabled,
  ].some((value) => value !== null && value !== undefined && String(value).trim() !== '')
}

export function buildProviderAccessCompanyFromSession(user = null) {
  if (!user || typeof user !== 'object') return null

  const providerRecord =
    (user.provider && typeof user.provider === 'object' ? user.provider : null) ||
    (user.ownedProvider && typeof user.ownedProvider === 'object' ? user.ownedProvider : null) ||
    (user.owned_provider && typeof user.owned_provider === 'object' ? user.owned_provider : null)

  if (!providerRecord) return null

  return {
    id: providerRecord.id ?? user.provider_id ?? user.proveedor_id ?? null,
    provider_id: providerRecord.id ?? user.provider_id ?? user.proveedor_id ?? null,
    legalName: providerRecord.legal_name ?? providerRecord.legalName ?? '',
    tradeName:
      providerRecord.commercial_name ??
      providerRecord.commercialName ??
      providerRecord.company_name ??
      providerRecord.companyName ??
      '',
    rfc: providerRecord.rfc ?? '',
    adminValidationStatus:
      providerRecord.admin_validation_status ?? providerRecord.adminValidationStatus ?? '',
    admin_validation_status:
      providerRecord.admin_validation_status ?? providerRecord.adminValidationStatus ?? '',
    reviewStatus:
      providerRecord.admin_validation_status ??
      providerRecord.adminValidationStatus ??
      providerRecord.review_status ??
      providerRecord.reviewStatus ??
      '',
    review_status:
      providerRecord.admin_validation_status ??
      providerRecord.adminValidationStatus ??
      providerRecord.review_status ??
      providerRecord.reviewStatus ??
      '',
    approvalStatus: providerRecord.approval_status ?? providerRecord.approvalStatus ?? '',
    approval_status: providerRecord.approval_status ?? providerRecord.approvalStatus ?? '',
    operatorStatus: providerRecord.operator_status ?? providerRecord.operatorStatus ?? '',
    operator_status: providerRecord.operator_status ?? providerRecord.operatorStatus ?? '',
    accessEnabled: providerRecord.access_enabled ?? providerRecord.accessEnabled ?? false,
    access_enabled: providerRecord.access_enabled ?? providerRecord.accessEnabled ?? false,
  }
}

export function resolveProviderOperationalAccessState({
  user = null,
  access = null,
  loginContext = null,
  company = null,
  fallbackProviderId = null,
} = {}) {
  const normalizedRoles = [
    ...new Set(
      [
        loginContext?.effective_role,
        access?.effective_role,
        user?.operational_role,
        user?.role,
        ...extractExplicitRoles({
          user,
          access,
          login_context: loginContext,
        }),
      ]
        .map((role) => normalizeAuthRole(role))
        .filter(Boolean),
    ),
  ]

  const effectiveRole = normalizedRoles[0] || ''
  const hasProviderRole = effectiveRole === 'operator' || normalizedRoles.includes('operator')
  const providerId =
    normalizeProviderIdentifier(
      resolveProviderIdForUser({
        ...(user && typeof user === 'object' ? user : {}),
        access,
      }),
    ) ||
    normalizeProviderIdentifier(fallbackProviderId) ||
    normalizeProviderIdentifier(company?.provider_id || company?.id)

  const providerLinked = providerId != null
  const companyKnown = hasProviderCompanySignals(company)
  const companyStatus = companyKnown ? resolveProviderAdminValidationStatus(company) : 'unknown'
  const accessEnabled = Boolean(company?.access_enabled ?? company?.accessEnabled ?? false)
  const isApproved = companyStatus === 'approved' || accessEnabled
  const isOperationalReady = hasProviderRole && providerLinked && (companyStatus === 'unknown' || isApproved)

  let blockingReason = ''
  let title = ''
  let detail = ''
  let tone = 'info'

  if (!hasProviderRole) {
    blockingReason = 'missing-provider-role'
    title = 'La sesion no tiene contexto de proveedor'
    detail = 'Esta cuenta no viene autenticada con rol operador/proveedor en la respuesta del backend.'
    tone = 'danger'
  } else if (!providerLinked) {
    blockingReason = 'missing-provider-id'
    title = 'La cuenta no esta ligada a un proveedor'
    detail =
      'El backend autentico al usuario, pero /auth/me no devolvio un provider_id utilizable para cargar el portal operativo.'
    tone = 'warning'
  } else if (companyStatus === 'pending_review' || companyStatus === 'pending_validation') {
    blockingReason = 'pending-admin-review'
    title = 'Tu expediente sigue en revision administrativa'
    detail =
      'Mientras administracion no apruebe el expediente y habilite el acceso operativo, algunas secciones permaneceran en modo restringido.'
    tone = 'info'
  } else if (companyStatus === 'draft' || companyStatus === 'incomplete') {
    blockingReason = 'incomplete-company-profile'
    title = 'Completa primero tu expediente de proveedor'
    detail =
      'La empresa aun no tiene la informacion o documentacion minima para activar las secciones operativas.'
    tone = 'warning'
  } else if (companyStatus === 'changes_required' || companyStatus === 'changes_requested') {
    blockingReason = 'changes-required'
    title = 'Administracion solicito cambios antes de habilitar la operacion'
    detail =
      'Corrige los pendientes del expediente para recuperar acceso a solicitudes, incidencias y seguimiento operativo.'
    tone = 'danger'
  } else if (companyStatus === 'rejected') {
    blockingReason = 'rejected'
    title = 'La validacion del proveedor fue rechazada'
    detail =
      'La cuenta puede entrar al portal, pero el backend no deberia habilitar recursos operativos hasta que el expediente sea corregido.'
    tone = 'danger'
  } else if (companyStatus !== 'unknown' && !isApproved) {
    blockingReason = 'access-disabled'
    title = 'El acceso operativo aun no esta habilitado'
    detail =
      'El proveedor existe y tiene rol correcto, pero backend todavia no marco access_enabled como activo.'
    tone = 'warning'
  }

  return {
    effectiveRole,
    roles: normalizedRoles,
    hasProviderRole,
    providerId,
    providerLinked,
    companyKnown,
    companyStatus,
    accessEnabled,
    isApproved,
    isOperationalReady,
    isBlocked: Boolean(blockingReason),
    blockingReason,
    title,
    detail,
    tone,
  }
}
