import { describe, expect, it } from 'vitest'

import { buildFlightPricingFormula } from '../utils/flightPricing'

describe('buildFlightPricingFormula', () => {
  it('applies repositioning on multi-destination routes when the aircraft ends outside its base', () => {
    const aircraft = {
      hourly_rate: 6000,
      speed_kmh: 600,
      repositioning_fee: 1800,
      source_origin: 'MMTO',
      base_airport_match: true,
    }

    const multiDestinationContext = {
      tripType: 'Multi-destino',
      legs: [
        { origin: 'MMTO', destination: 'MMMX', distance_km: 120 },
        { origin: 'MMMX', destination: 'MMMY', distance_km: 700 },
      ],
    }

    const pricingWithoutRepositioningFee = buildFlightPricingFormula(
      { ...aircraft, repositioning_fee: 0 },
      multiDestinationContext,
    )
    const multiDestinationPricing = buildFlightPricingFormula(aircraft, multiDestinationContext)

    expect(multiDestinationPricing.repositioning).toBe(1800)
    expect(multiDestinationPricing.realFlightHours).toBe(pricingWithoutRepositioningFee.realFlightHours)
  })

  it('applies a fallback repositioning amount only for forced multi-destination quotes without explicit fee', () => {
    const aircraft = {
      hourly_rate: 6000,
      speed_kmh: 600,
      source_origin: 'MMTO',
      base_airport_match: true,
    }

    const context = {
      tripType: 'Multi-destino',
      repositioningRequired: true,
      legs: [
        { origin: 'MMTO', destination: 'MMMM', distance_km: 170 },
      ],
    }

    const pricing = buildFlightPricingFormula(aircraft, context)

    expect(pricing.repositioning).toBeGreaterThan(0)
    expect(pricing.realFlightHours).toBeGreaterThan(0)
  })

  it('does not apply repositioning on multi-destination routes when the final destination is the base', () => {
    const aircraft = {
      hourly_rate: 6000,
      speed_kmh: 600,
      repositioning_fee: 1800,
      source_origin: 'MMTO',
      base_airport_match: true,
    }

    const context = {
      tripType: 'Multi-destino',
      legs: [
        { origin: 'MMTO', destination: 'MMMX', distance_km: 120 },
        { origin: 'MMMX', destination: 'MMTO', distance_km: 120 },
      ],
    }

    const pricing = buildFlightPricingFormula(aircraft, context)

    expect(pricing.repositioning).toBe(0)
  })
})
