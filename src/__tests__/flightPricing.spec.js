import { describe, expect, it } from 'vitest'

import { buildFlightPricingFormula } from '../utils/flightPricing'

describe('buildFlightPricingFormula', () => {
  it('charges initial repositioning on one-way quotes when aircraft base differs from origin', () => {
    const aircraft = {
      hourly_rate: 6000,
      speed_kmh: 600,
      source_origin: 'MMQT',
      cabin: 'Light Jet',
    }

    const pricing = buildFlightPricingFormula(aircraft, {
      tripType: 'Ida',
      legs: [{ origin: 'MMTO', destination: 'MMMM', distance_km: 170 }],
    })

    expect(pricing.repositioning).toBeGreaterThan(0)
    expect(pricing.initialRepositioningHours).toBeGreaterThan(0)
    expect(pricing.finalRepositioningHours).toBe(0)
  })

  it('does not charge return-to-base by default on one-way quotes', () => {
    const aircraft = {
      hourly_rate: 6000,
      speed_kmh: 600,
      source_origin: 'MMQT',
      cabin: 'Light Jet',
    }

    const pricing = buildFlightPricingFormula(aircraft, {
      tripType: 'Ida',
      legs: [{ origin: 'MMQT', destination: 'MMMM', distance_km: 190 }],
    })

    expect(pricing.repositioning).toBe(0)
    expect(pricing.repositioningHours).toBe(0)
  })

  it('charges return-to-base when the policy explicitly enables it', () => {
    const aircraft = {
      hourly_rate: 6000,
      speed_kmh: 600,
      source_origin: 'MMQT',
      cabin: 'Light Jet',
      charge_return_to_base: true,
    }

    const pricing = buildFlightPricingFormula(aircraft, {
      tripType: 'Ida',
      legs: [{ origin: 'MMQT', destination: 'MMMM', distance_km: 190 }],
    })

    expect(pricing.repositioning).toBeGreaterThan(0)
    expect(pricing.initialRepositioningHours).toBe(0)
    expect(pricing.finalRepositioningHours).toBeGreaterThan(0)
  })

  it('does not charge repositioning on round trips when textual base and airport code are the same airport', () => {
    const aircraft = {
      hourly_rate: 4800,
      speed_kmh: 764.64,
      source_origin: 'TOLUCA',
      cabin: 'Light Jet',
    }

    const pricing = buildFlightPricingFormula(aircraft, {
      tripType: 'Redondo',
      legs: [
        { origin: 'MMTO', destination: 'MMUN', distance_km: 1690, originAirport: { code: 'MMTO', iata: 'TLC', city: 'Toluca' } },
        { origin: 'MMUN', destination: 'MMTO', distance_km: 1690, destinationAirport: { code: 'MMTO', iata: 'TLC', city: 'Toluca' } },
      ],
    })

    expect(pricing.initialRepositioningHours).toBe(0)
    expect(pricing.finalRepositioningHours).toBe(0)
    expect(pricing.repositioningHours).toBe(0)
    expect(pricing.billableHours).toBeCloseTo(pricing.displayFlightHours, 6)
  })

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

    expect(multiDestinationPricing.repositioningHours).toBeCloseTo(1800 / (6000 * 0.8), 6)
    expect(multiDestinationPricing.repositioning).toBeCloseTo(
      multiDestinationPricing.repositioningHours * multiDestinationPricing.hourlyRate,
      6,
    )
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
    expect(pricing.finalRepositioningHours).toBeGreaterThan(0)
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

    expect(pricing.displayFlightHours).toBeGreaterThanOrEqual(1.1)
    expect(pricing.displayFlightHours).toBeLessThan(1.5)
    expect(pricing.operationalFlightHours).toBeGreaterThan(pricing.displayFlightHours)
    expect(pricing.billableHours).toBe(pricing.displayFlightHours + pricing.repositioningHours)
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

  it('uses conservative fallback mach values for light, mid and heavy jets', () => {
    expect(buildFlightPricingFormula({ cabin: 'Light Jet' }, { distance_km: 300 }).cruiseSpeedKmh).toBeCloseTo(0.72 * 1062)
    expect(buildFlightPricingFormula({ cabin: 'Mid Jet' }, { distance_km: 300 }).cruiseSpeedKmh).toBeCloseTo(0.78 * 1062)
    expect(buildFlightPricingFormula({ cabin: 'Heavy Jet' }, { distance_km: 300 }).cruiseSpeedKmh).toBeCloseTo(0.84 * 1062)
  })

  it('applies a general distance-based adjustment on short jet routes', () => {
    const aircraft = {
      cabin: 'Light Jet',
      speed_kmh: 764.64,
    }

    const pricing = buildFlightPricingFormula(aircraft, {
      tripType: 'Ida',
      distance_km: 90,
    })

    expect(pricing.clientFlightHours).toBeCloseTo(90 / 764.64, 3)
    expect(pricing.displayFlightHours).toBeGreaterThan(pricing.clientFlightHours)
    expect(pricing.displayFlightHours).toBeGreaterThanOrEqual(0.55)
  })

  it('keeps helicopter short routes above a visual minimum without overinflating them', () => {
    const aircraft = {
      cabin: 'Helicoptero ejecutivo',
      speed_kmh: 245,
    }

    const pricing = buildFlightPricingFormula(aircraft, {
      tripType: 'Ida',
      distance_km: 60,
    })

    expect(pricing.displayFlightHours).toBeGreaterThanOrEqual(0.3)
    expect(pricing.displayFlightHours).toBeLessThan(0.7)
  })

  it('parses latin-formatted aircraft numbers from the database correctly', () => {
    const pricing = buildFlightPricingFormula(
      {
        cabin: 'Turboprop',
        speed_kmh: '1.063',
        minimum_hours: '1,5',
        climb_descent_minutes: '25',
        hourly_rate: '2.300',
        range_km: '2.400',
      },
      {
        tripType: 'Ida',
        distance_km: 800,
      },
    )

    expect(pricing.cruiseSpeedKmh).toBe(1063)
    expect(pricing.hourlyRate).toBe(2300)
    expect(pricing.climbDescentMinutes).toBe(25)
    expect(pricing.minimumHours).toBe(2)
    expect(pricing.clientFlightHours).toBeCloseTo(800 / 1063, 4)
  })

  it('calculates real flight hours dynamically per aircraft speed', () => {
    const kingAir = buildFlightPricingFormula(
      {
        model: 'KING AIR',
        cabin: 'Turboprop',
        speed_kmh: 426,
        minimum_hours: '1,5',
        climb_descent_minutes: '25',
      },
      {
        tripType: 'Ida',
        distance_km: 1291.731008,
      },
    )

    const kingAirC90gt = buildFlightPricingFormula(
      {
        model: 'KING AIR C90GT',
        cabin: 'Turboprop',
        speed_kmh: 482,
        minimum_hours: '1,5',
        climb_descent_minutes: '25',
      },
      {
        tripType: 'Ida',
        distance_km: 1291.731008,
      },
    )

    expect(kingAir.cruiseSpeedKmh).toBe(426)
    expect(kingAirC90gt.cruiseSpeedKmh).toBe(482)
    expect(kingAir.realFlightHours).toBeCloseTo(1291.731008 / 426 + 25 / 60, 6)
    expect(kingAirC90gt.realFlightHours).toBeCloseTo(1291.731008 / 482 + 25 / 60, 6)
    expect(kingAir.realFlightHours).toBeGreaterThan(kingAirC90gt.realFlightHours)
    expect(kingAir.displayFlightHours).toBeGreaterThan(kingAirC90gt.displayFlightHours)
  })

  it('prices billable hours from display flight time plus repositioning hours', () => {
    const aircraft = {
      hourly_rate: 4800,
      speed_kmh: 764.64,
      source_origin: 'TOLUCA',
      cabin: 'Light Jet',
      expense_fee: 400,
    }

    const pricing = buildFlightPricingFormula(aircraft, {
      tripType: 'Ida',
      legs: [{ origin: 'MMTO', destination: 'MMMX', distance_km: 600 }],
    })

    expect(pricing.billableHours).toBeCloseTo(pricing.displayFlightHours + pricing.repositioningHours, 6)
    expect(pricing.baseCost).toBeCloseTo(pricing.billableHours * pricing.hourlyRate, 6)
    expect(pricing.repositioning).toBeCloseTo(pricing.repositioningHours * pricing.hourlyRate, 6)
    expect(pricing.operationalCosts).toBe(0)
    expect(pricing.subtotalBeforeMultipliers).toBeCloseTo(
      pricing.baseCost + pricing.extraServices.overnight + pricing.expenseFee,
      6,
    )
    expect(pricing.ivaAmount).toBeCloseTo(pricing.subtotalBeforeMultipliers * 0.16, 6)
    expect(pricing.finalPrice).toBeCloseTo(pricing.subtotalBeforeMultipliers + pricing.ivaAmount, 6)
  })

  it('uses 4 percent iva on international routes', () => {
    const aircraft = {
      hourly_rate: 5000,
      speed_kmh: 850,
      cabin: 'Heavy Jet',
      operational_cost: 1200,
    }

    const pricing = buildFlightPricingFormula(aircraft, {
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

    expect(pricing.ivaRate).toBe(0.04)
    expect(pricing.ivaAmount).toBeCloseTo(pricing.subtotalBeforeMultipliers * 0.04, 6)
  })

  it('ignores optional quote extras inside the pricing formula', () => {
    const aircraft = {
      hourly_rate: 4800,
      speed_kmh: 764.64,
      cabin: 'Light Jet',
      expense_fee: 400,
      catering_fee: 250,
      wifi_fee: 100,
    }

    const pricing = buildFlightPricingFormula(aircraft, {
      tripType: 'Ida',
      catering: 'basic',
      wifi: 'full',
      legs: [{ origin: 'MMTO', destination: 'MMMX', distance_km: 600 }],
    })

    expect(pricing.extraServices.catering).toBe(0)
    expect(pricing.extraServices.groundTransport).toBe(0)
    expect(pricing.extraServices.wifi).toBe(0)
    expect(pricing.extraServices.urgentSchedule).toBe(0)
    expect(pricing.extraServices.priorityService).toBe(0)
    expect(pricing.extraServices.pet).toBe(0)
    expect(pricing.extraServices.specialBaggage).toBe(0)
    expect(pricing.extraServicesTotal).toBe(pricing.extraServices.overnight)
    expect(pricing.operationalCosts).toBe(0)
    expect(pricing.subtotalBeforeMultipliers).toBeCloseTo(
      pricing.baseCost + pricing.expenseFee,
      6,
    )
    expect(pricing.ivaAmount).toBeCloseTo(
      (pricing.baseCost + pricing.expenseFee) * 0.16,
      6,
    )
  })

  it('uses expense fee even when route expense fields exist', () => {
    const aircraft = {
      hourly_rate: 5000,
      speed_kmh: 850,
      cabin: 'Heavy Jet',
      national_expenses_usd: 700,
      international_expenses_usd: 1800,
      expense_fee: 400,
    }

    const nationalPricing = buildFlightPricingFormula(aircraft, {
      tripType: 'Ida',
      legs: [
        {
          origin: 'MMTO',
          destination: 'MMMX',
          distance_km: 80,
          originAirport: { code: 'MMTO', country: 'Mexico' },
          destinationAirport: { code: 'MMMX', country: 'Mexico' },
        },
      ],
    })
    const internationalPricing = buildFlightPricingFormula(aircraft, {
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

    expect(nationalPricing.operationalCosts).toBe(0)
    expect(nationalPricing.expenseFee).toBe(400)
    expect(internationalPricing.operationalCosts).toBe(0)
    expect(internationalPricing.expenseFee).toBe(400)
  })

  it('always calculates iva from the subtotal instead of using manual tax fields', () => {
    const aircraft = {
      hourly_rate: 4800,
      speed_kmh: 764.64,
      cabin: 'Light Jet',
      expense_fee: 400,
      tax_amount: 9999,
    }

    const pricing = buildFlightPricingFormula(aircraft, {
      tripType: 'Ida',
      ivaAmount: 8888,
      legs: [
        {
          origin: 'MMTO',
          destination: 'MMMX',
          distance_km: 80,
          originAirport: { code: 'MMTO', country: 'Mexico' },
          destinationAirport: { code: 'MMMX', country: 'Mexico' },
        },
      ],
    })

    expect(pricing.ivaRate).toBe(0.16)
    expect(pricing.ivaAmount).toBeCloseTo(pricing.subtotalBeforeMultipliers * 0.16, 6)
  })

  it('matches reserva style totals for a national round trip without repositioning', () => {
    const aircraft = {
      hourly_rate: 4800,
      speed_kmh: 764.64,
      source_origin: 'TOLUCA',
      cabin: 'Light Jet',
      expense_fee: 400,
    }

    const pricing = buildFlightPricingFormula(aircraft, {
      tripType: 'Redondo',
      overnightNights: 4,
      legs: [
        {
          origin: 'MMTO',
          destination: 'MMUN',
          distance_km: 1501.5714236194174,
          originAirport: { code: 'MMTO', iata: 'TLC', city: 'Toluca', country: 'Mexico' },
          destinationAirport: { code: 'MMUN', iata: 'CUN', city: 'Cancun', country: 'Mexico' },
        },
        {
          origin: 'MMUN',
          destination: 'MMTO',
          distance_km: 1501.5714236194174,
          originAirport: { code: 'MMUN', iata: 'CUN', city: 'Cancun', country: 'Mexico' },
          destinationAirport: { code: 'MMTO', iata: 'TLC', city: 'Toluca', country: 'Mexico' },
        },
      ],
    })

    expect(pricing.repositioningHours).toBe(0)
    expect(pricing.billableHours).toBeCloseTo(pricing.displayFlightHours, 6)
    expect(pricing.baseCost).toBeCloseTo(pricing.billableHours * pricing.hourlyRate, 6)
    expect(pricing.extraServices.overnight).toBe(9600)
    expect(pricing.expenseFee).toBe(400)
    expect(pricing.subtotalBeforeMultipliers).toBeCloseTo(
      pricing.baseCost + pricing.extraServices.overnight + pricing.expenseFee,
      6,
    )
    expect(pricing.ivaRate).toBe(0.16)
    expect(pricing.ivaAmount).toBeCloseTo(pricing.subtotalBeforeMultipliers * 0.16, 6)
    expect(pricing.finalPrice).toBeCloseTo(pricing.subtotalBeforeMultipliers + pricing.ivaAmount, 6)
  })

  it('prioritizes crew overnight fee over half of hourly rate', () => {
    const aircraft = {
      hourly_rate: 4800,
      speed_kmh: 764.64,
      cabin: 'Light Jet',
      crew_overnight_usd: 1800,
      expense_fee: 400,
    }

    const pricing = buildFlightPricingFormula(aircraft, {
      tripType: 'Redondo',
      overnightNights: 3,
      legs: [
        {
          origin: 'MMTO',
          destination: 'MMUN',
          distance_km: 1501.5714236194174,
          originAirport: { code: 'MMTO', iata: 'TLC', city: 'Toluca', country: 'Mexico' },
          destinationAirport: { code: 'MMUN', iata: 'CUN', city: 'Cancun', country: 'Mexico' },
        },
        {
          origin: 'MMUN',
          destination: 'MMTO',
          distance_km: 1501.5714236194174,
          originAirport: { code: 'MMUN', iata: 'CUN', city: 'Cancun', country: 'Mexico' },
          destinationAirport: { code: 'MMTO', iata: 'TLC', city: 'Toluca', country: 'Mexico' },
        },
      ],
    })

    expect(pricing.extraServices.overnight).toBe(5400)
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
