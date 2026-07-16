import { describe, expect, it } from 'vitest'

import {
  buildProviderAccessCompanyFromSession,
  resolveProviderOperationalAccessState,
} from '../lib/providerAccess'

describe('resolveProviderOperationalAccessState', () => {
  it('allows operational access when provider role, provider id and approval are present', () => {
    const state = resolveProviderOperationalAccessState({
      user: {
        id: 7,
        operational_role: 'provider',
        ownedProvider: { id: 44 },
      },
      company: {
        id: 44,
        adminValidationStatus: 'approved',
        accessEnabled: true,
      },
    })

    expect(state.hasProviderRole).toBe(true)
    expect(state.providerId).toBe(44)
    expect(state.isOperationalReady).toBe(true)
    expect(state.isBlocked).toBe(false)
  })

  it('blocks access when the authenticated account has no provider link', () => {
    const state = resolveProviderOperationalAccessState({
      user: {
        id: 8,
        role: 'operator',
      },
      company: {
        adminValidationStatus: 'approved',
        accessEnabled: true,
      },
    })

    expect(state.hasProviderRole).toBe(true)
    expect(state.providerId).toBe(null)
    expect(state.blockingReason).toBe('missing-provider-id')
    expect(state.isOperationalReady).toBe(false)
  })

  it('keeps the portal in restricted mode while admin validation is pending', () => {
    const state = resolveProviderOperationalAccessState({
      loginContext: {
        effective_role: 'provider',
      },
      access: {
        provider_id: 91,
      },
      company: {
        provider_id: 91,
        adminValidationStatus: 'pending_review',
        accessEnabled: false,
      },
    })

    expect(state.providerId).toBe(91)
    expect(state.companyStatus).toBe('pending_review')
    expect(state.blockingReason).toBe('pending-admin-review')
    expect(state.isOperationalReady).toBe(false)
  })

  it('tolerates preloaded sessions before company state has been hydrated', () => {
    const state = resolveProviderOperationalAccessState({
      user: {
        role: 'operator',
      },
      access: {
        provider_id: 55,
      },
      company: null,
    })

    expect(state.providerId).toBe(55)
    expect(state.companyStatus).toBe('unknown')
    expect(state.isOperationalReady).toBe(true)
    expect(state.isBlocked).toBe(false)
  })

  it('builds a reusable provider company snapshot from ownedProvider session data', () => {
    const company = buildProviderAccessCompanyFromSession({
      provider_id: 73,
      ownedProvider: {
        id: 73,
        commercial_name: 'Sky Fleet',
        approval_status: 'approved',
        admin_validation_status: 'approved',
        operator_status: 'validated',
        access_enabled: true,
      },
    })

    expect(company).toMatchObject({
      id: 73,
      provider_id: 73,
      tradeName: 'Sky Fleet',
      approvalStatus: 'approved',
      adminValidationStatus: 'approved',
      operatorStatus: 'validated',
      accessEnabled: true,
    })
  })
})
