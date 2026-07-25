import { describe, expect, it } from 'vitest'

import { normalizeRoles, resolveAuthPayload, resolveEffectiveRole } from '../stores/auth'

describe('auth store role resolution', () => {
  it('includes effective roles when building route permissions', () => {
    const roles = normalizeRoles({
      login_context: {
        effective_role: 'provider',
      },
      user: {},
    })

    expect(roles).toContain('operator')
  })

  it('falls back to declared role collections when explicit role fields are missing', () => {
    const effectiveRole = resolveEffectiveRole({
      user: {
        roles: [{ code: 'provider' }],
      },
    })

    expect(effectiveRole).toBe('operator')
  })

  it('respects the backend client role even if the login intent was provider', () => {
    const payload = resolveAuthPayload(
      {
        token: 'provider-token',
        user: {
          id: 9,
          role: 'client',
        },
      },
      {
        intendedRole: 'provider',
      },
    )

    expect(payload.user?.operational_role ?? null).toBe(null)
    expect(payload.login_context).toBe(null)
    expect(normalizeRoles(payload)).toContain('client')
    expect(resolveEffectiveRole(payload)).toBe('client')
  })

  it('preserves the operator context while refreshing the session', () => {
    const payload = resolveAuthPayload(
      {
        token: 'provider-token',
        user: {
          id: 9,
        },
      },
      {
        currentSnapshot: {
          login_context: {
            effective_role: 'provider',
            roles: ['provider'],
          },
        },
      },
    )

    expect(payload.user?.operational_role).toBe('provider')
    expect(payload.login_context?.effective_role).toBe('provider')
    expect(resolveEffectiveRole(payload)).toBe('operator')
  })

  it('respects the backend client role even if the login intent was sobrecargo', () => {
    const payload = resolveAuthPayload(
      {
        token: 'crew-token',
        user: {
          id: 11,
          role: 'client',
        },
      },
      {
        intendedRole: 'sobrecargo',
      },
    )

    expect(payload.user?.operational_role ?? null).toBe(null)
    expect(payload.login_context).toBe(null)
    expect(resolveEffectiveRole(payload)).toBe('client')
  })

  it('still preserves operator context while refreshing an ambiguous session payload', () => {
    const payload = resolveAuthPayload(
      {
        token: 'provider-token',
        user: {
          id: 12,
          email: 'ops@example.com',
        },
      },
      {
        intendedRole: 'provider',
        currentSnapshot: {
          login_context: {
            effective_role: 'provider',
            roles: ['provider'],
          },
        },
      },
    )

    expect(payload.user?.operational_role).toBe('provider')
    expect(payload.login_context?.effective_role).toBe('provider')
    expect(resolveEffectiveRole(payload)).toBe('operator')
  })

  it('preserves direct admin role signals from the session payload', () => {
    const roles = normalizeRoles({
      user: {
        role: 'admin',
      },
    })

    expect(roles).toContain('admin')
    expect(
      resolveAuthPayload({
        token: 'admin-token',
        user: {
          id: 4,
          role: 'admin',
        },
      }).login_context,
    ).toBe(null)
    expect(
      resolveEffectiveRole({
        user: {
          id: 4,
          role: 'admin',
        },
      }),
    ).toBe('admin')
  })
})
