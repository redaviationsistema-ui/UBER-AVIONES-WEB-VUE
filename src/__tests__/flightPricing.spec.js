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

  it('applies fallback repositioning on completed multi-destination routes that end outside base', () => {
    const aircraft = {
      hourly_rate: 6000,
      speed_kmh: 780,
      source_origin: 'MMTO',
      base_airport_match: true,
      cabin: 'Heavy Jet',
    }

    const context = {
      tripType: 'Multi-destino',
      legs: [
        { origin: 'MMTO', destination: 'MMQT', distance_km: 180 },
        { origin: 'MMQT', destination: 'MMMM', distance_km: 190 },
      ],
    }

    const pricing = buildFlightPricingFormula(aircraft, context)

    expect(pricing.repositioning).toBeGreaterThan(0)
    expect(pricing.repositioningHours).toBeGreaterThan(0)
  })

  it('separates display flight time from billable time for multi-destination quotes', () => {
    const aircraft = {
      hourly_rate: 5500,
      speed_kmh: 780,
      cabin: 'Mid Jet',
    }

    const context = {
      tripType: 'Multi-destino',
      legs: [
        { origin: 'MMTO', destination: 'MMMM', distance_km: 173 },
        { origin: 'MMMM', destination: 'MMQT', distance_km: 191 },
      ],
    }

    const pricing = buildFlightPricingFormula(aircraft, context)

    expect(pricing.displayFlightHours).toBeGreaterThanOrEqual(0.95)
    expect(pricing.displayFlightHours).toBeLessThan(1.4)
    expect(pricing.operationalFlightHours).toBeGreaterThan(pricing.displayFlightHours)
    expect(pricing.billableHours).toBeGreaterThanOrEqual(pricing.operationalFlightHours)
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

  it('uses a realistic default helicopter cruise speed', () => {
    const aircraft = {
      cabin: 'Helicoptero ejecutivo',
    }

    const pricing = buildFlightPricingFormula(aircraft, {
      tripType: 'Ida',
      distance_km: 245,
    })

    expect(pricing.cruiseSpeedKmh).toBe(245)
  })

  it('applies dynamic heavy jet minimums by route distance in nautical miles', () => {
    const aircraft = {
      hourly_rate: 5000,
      speed_kmh: 850,
      cabin: 'Heavy Jet',
    }

    const shortRoute = buildFlightPricingFormula(aircraft, {
      tripType: 'Ida',
      distance_km: 900,
    })
    const mediumRoute = buildFlightPricingFormula(aircraft, {
      tripType: 'Ida',
      distance_km: 1200,
    })
    const longRoute = buildFlightPricingFormula(aircraft, {
      tripType: 'Ida',
      distance_km: 2300,
    })
    const internationalMediumRoute = buildFlightPricingFormula(aircraft, {
      tripType: 'Ida',
      legs: [
        {
          origin: 'MMTO',
          destination: 'KIAH',
          distance_km: 1200,
          originAirport: { code: 'MMTO', country: 'Mexico' },
          destinationAirport: { code: 'KIAH', country: 'United States' },
        },
      ],
    })

    expect(shortRoute.minimumHours).toBe(3)
    expect(mediumRoute.minimumHours).toBe(3)
    expect(longRoute.minimumHours).toBe(4)
    expect(internationalMediumRoute.minimumHours).toBe(4)
  })

  it('caps heavy jet explicit minimums on short regional routes', () => {
    const aircraft = {
      hourly_rate: 9000,
      speed_kmh: 870,
      cabin: 'Heavy Jet',
      minimum_hours: 4,
    }

    const pricing = buildFlightPricingFormula(aircraft, {
      tripType: 'Multi-destino',
      legs: [
        { origin: 'MMTO', destination: 'MMQT', distance_km: 180, originAirport: { code: 'MMTO', country: 'Mexico' }, destinationAirport: { code: 'MMQT', country: 'Mexico' } },
        { origin: 'MMQT', destination: 'MMMM', distance_km: 190, originAirport: { code: 'MMQT', country: 'Mexico' }, destinationAirport: { code: 'MMMM', country: 'Mexico' } },
      ],
    })

    expect(pricing.minimumHours).toBe(3)
  })
})
