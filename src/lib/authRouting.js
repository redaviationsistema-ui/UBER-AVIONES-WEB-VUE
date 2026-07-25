export function normalizeAuthRole(role) {
  const normalized = String(role || '').trim().toLowerCase()

  if (['client', 'cliente'].includes(normalized)) return 'client'
  if (['provider', 'operator', 'operador'].includes(normalized)) return 'operator'
  if (['sobrecargo', 'crew', 'cabina'].includes(normalized)) return 'crew'
  if (
    [
      'admin',
      'administrador',
      'administrator',
      'super_admin',
      'super-admin',
      'super admin',
      'superadministrator',
      'super-administrator',
      'backoffice',
    ].includes(normalized)
  ) {
    return 'admin'
  }

  return ''
}

export function extractExplicitRoles(payload = {}) {
  return [
    payload.login_context?.effective_role,
    payload.access?.effective_role,
    ...(Array.isArray(payload.login_context?.roles) ? payload.login_context.roles : []),
    ...(Array.isArray(payload.access?.roles) ? payload.access.roles : []),
    ...(Array.isArray(payload.user?.roles)
      ? payload.user.roles.map((role) => role?.code || role?.key || role?.name).filter(Boolean)
      : []),
  ]
    .map((role) => normalizeAuthRole(role))
    .filter(Boolean)
}

export function hasAdminAccess(payload = {}) {
  const explicitAdmin = extractExplicitRoles(payload).includes('admin')
  if (explicitAdmin) return true

  const fallbackAdminSignals = [
    payload.user?.operational_role,
    payload.user?.operationalRole,
    payload.user?.role,
    payload.user?.effective_role,
    payload.user?.effectiveRole,
  ]

  return fallbackAdminSignals.some((role) => normalizeAuthRole(role) === 'admin')
}

export function resolveDashboardPathByRole(role) {
  const normalizedRole = normalizeAuthRole(role)

  if (normalizedRole === 'admin') return '/admin/ejecutivo'
  if (normalizedRole === 'operator') return '/operador/dashboard'
  if (normalizedRole === 'crew') return '/sobrecargo/dashboard'
  return '/cliente/reservar'
}

export function resolvePostRegistrationDashboard(role, payload = {}, fallbackPath = '') {
  const normalizedRole = normalizeAuthRole(role)

  if (normalizedRole === 'operator') {
    const providerStatus = String(
      payload?.provider_status || payload?.providerStatus || payload?.provider?.status || '',
    )
      .trim()
      .toLowerCase()

    if (providerStatus === 'pending_validation') {
      return '/operador/empresa'
    }
  }

  return resolveDashboardPathByRole(normalizedRole) || fallbackPath || '/cliente/reservar'
}

export function sanitizePostLoginRedirect(redirect, fallbackPath) {
  const normalizedRedirect = typeof redirect === 'string' ? redirect.trim() : ''

  if (!normalizedRedirect || normalizedRedirect === '/') {
    return fallbackPath
  }

  const blockedPrefixes = ['/login', '/login-cliente', '/acceso', '/registro']
  if (blockedPrefixes.some((prefix) => normalizedRedirect.startsWith(prefix))) {
    return fallbackPath
  }

  return normalizedRedirect
}
