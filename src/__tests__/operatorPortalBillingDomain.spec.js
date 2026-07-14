import { computed, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { createOperatorPortalBillingDomain } from '../features/operator/portal/portalOperador.facturacion.js'
import {
  aircraftMatchesOperationalTab,
  countAircraftByOperationalTab,
} from '../features/operator/portal/portalOperador.estados.js'

function buildDomain(providerApproved = true) {
  return createOperatorPortalBillingDomain({
    formatCurrency: (amount) => `$${amount}`,
    formatDateTimeRange: (value) => String(value || ''),
    providerAircraftPlanAmount: computed(() => 100),
    isProviderApproved: ref(providerApproved),
  })
}

describe('operator portal billing domain', () => {
  it('shows active aircraft as active and enables payments', () => {
    const domain = buildDomain(true)
    const meta = domain.getAircraftBillingStatusMeta({
      id: 9,
      status: 'active',
      billingStatus: 'active',
      subscriptionStatus: 'active',
      subscriptionEndsAt: '2030-01-01',
    })

    expect(meta.label).toBe('Activa')
    expect(meta.action).toBe('payments')
    expect(meta.ready).toBe(true)
    expect(meta.detail).toContain('Vigente hasta:')
    expect(domain.isAircraftBillingActive({ status: 'active', subscriptionStatus: 'active' })).toBe(true)
  })

  it('keeps trialing subscriptions as active billing when the aircraft is active', () => {
    const domain = buildDomain(true)
    const meta = domain.getAircraftBillingStatusMeta({
      id: 10,
      status: 'active',
      billingStatus: 'active',
      subscriptionStatus: 'trialing',
      providerSubscriptionId: 'sub_trial_001',
    })

    expect(meta.label).toBe('Activa')
    expect(meta.action).toBe('payments')
    expect(meta.ready).toBe(true)
  })

  it('shows expired aircraft as pago vencido', () => {
    const domain = buildDomain(false)
    const meta = domain.getAircraftBillingStatusMeta({
      id: 15,
      status: 'inactive',
      billingStatus: 'expired',
      subscriptionStatus: 'expired',
      subscriptionEndsAt: '2026-07-01',
    })

    expect(meta.label).toBe('Pago vencido')
    expect(meta.action).toBe('activate')
    expect(meta.ready).toBe(false)
    expect(meta.code).toBe('billing_expired')
    expect(meta.detail).toContain('Vencio el:')
  })

  it('shows past due aircraft as pago vencido', () => {
    const domain = buildDomain(true)
    const meta = domain.getAircraftBillingStatusMeta({
      id: 18,
      status: 'inactive',
      billingStatus: 'past_due',
      subscriptionStatus: 'past_due',
    })

    expect(meta.label).toBe('Pago vencido')
    expect(meta.action).toBe('activate')
    expect(meta.code).toBe('billing_expired')
  })

  it('shows cancelled aircraft as suscripcion cancelada', () => {
    const domain = buildDomain(true)
    const meta = domain.getAircraftBillingStatusMeta({
      id: 22,
      status: 'inactive',
      billingStatus: 'inactive',
      subscriptionStatus: 'cancelled',
    })

    expect(meta.label).toBe('Suscripcion cancelada')
    expect(meta.action).toBe('activate')
    expect(meta.ready).toBe(false)
    expect(meta.code).toBe('billing_cancelled')
  })

  it('shows pending payment aircraft as pago pendiente and asks to sync', () => {
    const domain = buildDomain(true)
    const meta = domain.getAircraftBillingStatusMeta({
      id: 30,
      status: 'inactive',
      billingStatus: 'pending_payment',
      subscriptionStatus: 'pending_payment',
      providerCheckoutId: 'cs_test_aircraft_001',
    })

    expect(meta.label).toBe('Pago pendiente')
    expect(meta.action).toBe('sync')
    expect(meta.ready).toBe(false)
    expect(meta.code).toBe('billing_syncing')
    expect(domain.shouldPollAircraftBillingStatus({ subscriptionStatus: 'pending_payment' })).toBe(true)
  })

  it('keeps inactive aircraft without subscription as inactiva', () => {
    const domain = buildDomain(true)
    const meta = domain.getAircraftBillingStatusMeta({
      id: 31,
      status: 'inactive',
      billingStatus: 'inactive',
      subscriptionStatus: 'inactive',
    })

    expect(meta.label).toBe('Inactiva')
    expect(meta.action).toBe('activate')
    expect(meta.ready).toBe(false)
    expect(meta.code).toBe('billing_inactive')
  })

  it('does not mix provider approval with billing state', () => {
    const domain = buildDomain(false)
    const meta = domain.getAircraftBillingStatusMeta({
      id: 32,
      status: 'inactive',
      billingStatus: 'expired',
      subscriptionStatus: 'expired',
    })

    expect(meta.label).toBe('Pago vencido')
    expect(meta.code).toBe('billing_expired')
  })

  it('marks contradictory backend states as sync required', () => {
    const domain = buildDomain(true)
    const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const meta = domain.getAircraftBillingStatusMeta({
      id: 35,
      status: 'active',
      billingStatus: 'expired',
      subscriptionStatus: 'expired',
    })

    expect(meta.label).toBe('Sincronizacion requerida')
    expect(meta.action).toBe('sync')
    expect(meta.ready).toBe(false)

    warningSpy.mockRestore()
  })

  it('counts only aircraft.status=active as active in filters and counters', () => {
    const activeAircraft = {
      id: 35,
      model: 'LEAR JET 31*',
      status: 'active',
      billing_status: 'active',
      subscription_status: 'active',
      approved: true,
      review_status: 'approved',
    }
    const expiredAircraft = {
      id: 36,
      model: 'LEAR JET 31*',
      status: 'inactive',
      billing_status: 'expired',
      subscription_status: 'expired',
      approved: true,
      review_status: 'approved',
    }

    expect(countAircraftByOperationalTab([activeAircraft, expiredAircraft], 'active')).toBe(1)
    expect(countAircraftByOperationalTab([activeAircraft, expiredAircraft], 'inactive')).toBe(1)
    expect(aircraftMatchesOperationalTab(activeAircraft, 'active')).toBe(true)
    expect(aircraftMatchesOperationalTab(expiredAircraft, 'active')).toBe(false)
  })
})
