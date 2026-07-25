import { describe, expect, it } from 'vitest'

import {
  extractExplicitRoles,
  hasAdminAccess,
  normalizeAuthRole,
  resolveDashboardPathByRole,
  resolvePostRegistrationDashboard,
  sanitizePostLoginRedirect,
} from '../lib/authRouting'

describe('authRouting helpers', () => {
  it('normalizes provider aliases to operator', () => {
    expect(normalizeAuthRole('provider')).toBe('operator')
    expect(normalizeAuthRole('operator')).toBe('operator')
    expect(normalizeAuthRole('operador')).toBe('operator')
  })

  it('resolves the operator dashboard for provider registrations', () => {
    expect(resolveDashboardPathByRole('provider')).toBe('/operador/dashboard')
  })

  it('routes pending provider registrations to the operator company section', () => {
    expect(resolvePostRegistrationDashboard('provider', { provider_status: 'pending_validation' })).toBe(
      '/operador/empresa',
    )
  })

  it('routes approved providers and crew to their corresponding portals', () => {
    expect(resolvePostRegistrationDashboard('provider', { provider_status: 'approved' })).toBe(
      '/operador/dashboard',
    )
    expect(resolvePostRegistrationDashboard('sobrecargo')).toBe('/sobrecargo/dashboard')
  })

  it('keeps client redirects away from auth pages', () => {
    expect(sanitizePostLoginRedirect('/registro', '/operador/dashboard')).toBe('/operador/dashboard')
  })

  it('allows admin access when the session carries a direct admin role signal', () => {
    expect(
      hasAdminAccess({
        login_context: {
          effective_role: 'admin',
        },
      }),
    ).toBe(true)

    expect(
      hasAdminAccess({
        user: {
          role: 'admin',
        },
      }),
    ).toBe(true)

    expect(
      hasAdminAccess({
        user: {
          operational_role: 'administrador',
        },
      }),
    ).toBe(true)
  })

  it('extracts explicit roles without falling back to ambiguous user fields', () => {
    expect(
      extractExplicitRoles({
        access: {
          roles: ['admin', 'provider'],
        },
        user: {
          role: 'client',
        },
      }),
    ).toEqual(['admin', 'operator'])
  })
})
