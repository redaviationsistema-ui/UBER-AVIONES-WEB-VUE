import { describe, expect, it } from 'vitest'
import { addOperationalDays, getOperationalDate } from '../utils/operationalDate'

describe('operational dates', () => {
  it('uses the Mexico City calendar day instead of UTC', () => {
    expect(getOperationalDate(new Date('2026-07-19T03:30:00.000Z'))).toBe('2026-07-18')
  })

  it('formats dates as YYYY-MM-DD and adds calendar days', () => {
    expect(getOperationalDate(new Date('2026-01-02T18:00:00.000Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(addOperationalDays(new Date('2026-12-31T18:00:00.000Z'), 1)).toBe('2027-01-01')
  })
})
