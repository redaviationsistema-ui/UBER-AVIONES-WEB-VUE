export function normalizeAuthRole(role) {
  const normalized = String(role || '').trim().toLowerCase()

  if (['client', 'cliente'].includes(normalized)) return 'client'
  if (['provider', 'operator', 'operador'].includes(normalized)) return 'operator'
  if (['sobrecargo', 'crew', 'cabina'].includes(normalized)) return 'crew'
  if (normalized === 'admin') return 'admin'

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
  return extractExplicitRoles(payload).includes('admin')
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
