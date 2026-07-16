import { describe, expect, it } from 'vitest'
import { isClientUser, isCrewUser, isOperatorProvider, isPilotUser, normalizeRole } from '../utils/adminUserClassification'

describe('adminUserClassification', () => {
  it('normalizes role values defensively', () => {
    expect(normalizeRole('  SOBRECARGO ')).toBe('sobrecargo')
    expect(normalizeRole(null)).toBe('')
  })

  it('accepts only operator providers in providers module', () => {
    expect(
      isOperatorProvider({
        user: { role: 'provider', operational_role: null },
      }),
    ).toBe(true)

    expect(
      isOperatorProvider({
        user: { role: 'provider', operational_role: 'operador' },
      }),
    ).toBe(true)

    expect(
      isOperatorProvider({
        user: { role: 'provider', operational_role: 'sobrecargo' },
      }),
    ).toBe(false)

    expect(
      isOperatorProvider({
        user: { role: 'client', operational_role: '' },
      }),
    ).toBe(false)
  })

  it('separates crew, pilots and clients', () => {
    expect(isCrewUser({ role: 'provider', operational_role: 'cabin_crew' })).toBe(true)
    expect(isCrewUser({ user: { role: 'provider', operational_role: 'flight_attendant' } })).toBe(true)
    expect(isPilotUser({ user: { role: 'provider', operational_role: 'pilot' } })).toBe(true)
    expect(isClientUser({ user: { role: 'client' } })).toBe(true)
    expect(isClientUser({ user: { role: 'provider', operational_role: 'pilot' } })).toBe(false)
  })
})
