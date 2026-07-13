import { computed, ref } from 'vue'
import { describe, expect, it } from 'vitest'

import { createOperatorPortalBillingDomain } from '../features/operator/portal/portalOperador.facturacion.js'

function buildDomain(providerApproved = false) {
  return createOperatorPortalBillingDomain({
    formatCurrency: (amount) => `$${amount}`,
    formatDateTimeRange: (value) => String(value || ''),
    providerAircraftPlanAmount: computed(() => 100),
    isProviderApproved: ref(providerApproved),
  })
}

describe('operator portal billing domain', () => {
  it('blocks billing activation while the provider is pending approval', () => {
    const domain = buildDomain(false)
    const meta = domain.getAircraftBillingStatusMeta({
      id: 7,
      status: 'inactive',
      billingStatus: 'inactive',
    })

    expect(meta.action).toBe('blocked')
    expect(meta.ready).toBe(false)
    expect(meta.code).toBe('provider_pending')
    expect(meta.detail).toBe('Disponible despues de la aprobacion administrativa.')
  })

  it('keeps billing ready only when the subscription is active and provider approved', () => {
    const domain = buildDomain(true)
    const meta = domain.getAircraftBillingStatusMeta({
      id: 9,
      subscriptionStatus: 'active',
      subscriptionEndsAt: '2030-01-01',
    })

    expect(meta.action).toBe('payments')
    expect(meta.ready).toBe(true)
    expect(domain.isAircraftBillingActive({ subscriptionStatus: 'active', subscriptionEndsAt: '2030-01-01' })).toBe(true)
  })

  it('treats trialing subscriptions as active billing', () => {
    const domain = buildDomain(true)
    const meta = domain.getAircraftBillingStatusMeta({
      id: 10,
      subscriptionStatus: 'trialing',
      providerSubscriptionId: 'sub_trial_001',
    })

    expect(meta.label).toBe('Activa')
    expect(meta.action).toBe('payments')
    expect(meta.ready).toBe(true)
  })

  it('keeps an approved inactive aircraft pending payment until billing is confirmed', () => {
    const domain = buildDomain(true)
    const meta = domain.getAircraftBillingStatusMeta({
      id: 15,
      status: 'inactive',
      billingStatus: 'inactive',
      subscriptionStatus: 'inactive',
    })

    expect(meta.label).toBe('Pendiente de pago')
    expect(meta.action).toBe('activate')
    expect(meta.ready).toBe(false)
    expect(meta.code).toBe('billing_inactive')
  })

  it('shows payment verification while Stripe is still syncing the activation', () => {
    const domain = buildDomain(true)
    const meta = domain.getAircraftBillingStatusMeta({
      id: 18,
      billingStatus: 'pending_payment',
      providerCheckoutId: 'cs_test_aircraft_001',
    })

    expect(meta.label).toBe('Pago en verificacion')
    expect(meta.action).toBe('sync')
    expect(meta.ready).toBe(false)
    expect(meta.code).toBe('billing_syncing')
  })

  it('does not confuse operational active status with active billing when no billing trace exists', () => {
    const domain = buildDomain(true)
    const meta = domain.getAircraftBillingStatusMeta({
      id: 22,
      status: 'active',
    })

    expect(meta.label).toBe('Pendiente de pago')
    expect(meta.action).toBe('activate')
    expect(meta.ready).toBe(false)
    expect(meta.code).toBe('billing_missing_state')
  })
})
