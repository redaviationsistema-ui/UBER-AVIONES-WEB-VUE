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

  it('forces provider context during registration even if the backend responds with an ambiguous role', () => {
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

    expect(payload.user?.operational_role).toBe('provider')
    expect(payload.login_context?.effective_role).toBe('provider')
    expect(normalizeRoles(payload)).toContain('operator')
    expect(resolveEffectiveRole(payload)).toBe('operator')
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

  it('forces crew context when the intended role is sobrecargo', () => {
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

    expect(payload.user?.operational_role).toBe('sobrecargo')
    expect(payload.login_context?.effective_role).toBe('sobrecargo')
    expect(resolveEffectiveRole(payload)).toBe('crew')
  })

  it('does not infer admin from fallback user.role when explicit metadata is missing', () => {
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
  })
})
