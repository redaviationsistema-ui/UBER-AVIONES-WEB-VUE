import { describe, expect, it } from 'vitest'

import {
  formatOfficialDisplayTime,
  getOfficialDisplayRouteHours,
} from '../officialQuotePricing'

describe('officialQuotePricing', () => {
  it('reads visible time only from official display_route_hours', () => {
    const quote = {
      trip_time: '55 min',
      billable_hours: 0.92,
      pricing_breakdown: {
        display_route_hours: 2.75,
        final_billable_hours: 0.92,
        billable_hours: 0.92,
      },
    }

    expect(getOfficialDisplayRouteHours(quote, null)).toBe(2.75)
    expect(formatOfficialDisplayTime(quote, '')).toBe('2 h 45 min')
  })

  it('falls back to top-level display_route_hours when pricing_breakdown is missing', () => {
    const quote = {
      display_route_hours: '3.6666667',
      trip_time: '1 h 00 min',
    }

    expect(getOfficialDisplayRouteHours(quote, null)).toBeCloseTo(3.6666667)
    expect(formatOfficialDisplayTime(quote, '')).toBe('3 h 40 min')
  })

  it('uses legacy visible time text only after official display hours fields are missing', () => {
    const quote = {
      trip_time: '3 h 51 min',
      card_time: '4 h 05 min',
      time: '4 h 20 min',
      pricing_breakdown: {
        final_billable_hours: 6.25,
        billable_hours: 6.25,
      },
    }

    expect(getOfficialDisplayRouteHours(quote, null)).toBeCloseTo(3.85)
    expect(formatOfficialDisplayTime(quote, '')).toBe('3 h 51 min')
  })
})
