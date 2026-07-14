import { describe, expect, it } from 'vitest'

import {
  resolveProviderIdForUser,
  sanitizeProviderAircraftMutationPayload,
} from '../lib/providerContext'

describe('provider context helpers', () => {
  it('resolves provider id from ownedProvider when direct provider_id is absent', () => {
    expect(
      resolveProviderIdForUser({
        id: 9,
        ownedProvider: {
          id: 88,
        },
      }),
    ).toBe(88)
  })

  it('resolves provider id canonically across provider profile aliases', () => {
    expect(
      resolveProviderIdForUser({
        providerProfile: {
          provider_id: '144',
        },
        access: {
          provider_id: 999,
        },
      }),
    ).toBe(144)
  })

  it('sanitizes provider aircraft payloads before sending mutations', () => {
    const payload = sanitizeProviderAircraftMutationPayload({
      provider_id: 55,
      model: 'LEARJET 60',
      status: 'active',
      billing_status: 'active',
      approved: true,
      review_status: 'approved',
      stripe_customer_id: 'cus_123',
      stripe_session_id: 'cs_test_123',
      checkout_session_id: 'cs_test_123',
      hourly_rate: 7200,
    })

    expect(payload).toEqual({
      model: 'LEARJET 60',
      hourly_rate: 7200,
    })
  })

  it('blocks protected aircraft fields regardless of casing', () => {
    const payload = sanitizeProviderAircraftMutationPayload({
      Status: 'active',
      Operational_Status: 'active',
      Subscription_Ends_At: '2026-08-01',
      billingStatus: 'active',
      'Billing-Status': 'past_due',
      'BILLING STATUS': 'cancelled',
      billing__status: 'ignored',
      subscriptionStatus: 'active',
      reviewStatus: 'approved',
      stripeCustomerId: 'cus_123',
      stripe_customer_id: 'cus_456',
      stripeAnything: 'value',
      stripe_anything: 'value',
      'STRIPE-INVOICE-ID': 'in_123',
      model: 'PHENOM 300',
    })

    expect(payload).toEqual({
      model: 'PHENOM 300',
    })
  })
})
