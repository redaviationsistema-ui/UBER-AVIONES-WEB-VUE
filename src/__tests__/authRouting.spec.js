import { describe, expect, it } from 'vitest'

import {
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
})
