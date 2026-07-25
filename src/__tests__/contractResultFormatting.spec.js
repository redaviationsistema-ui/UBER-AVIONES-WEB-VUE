import { describe, expect, it } from 'vitest'

import {
  formatContractResultDate,
  formatContractResultStatus,
} from '../lib/contractResultFormatting'

describe('contractResultFormatting', () => {
  it('formats ISO signature dates into es-MX local time for Mexico City', () => {
    const formatted = formatContractResultDate('2026-07-25T15:53:21.000000Z')

    expect(formatted).toContain('25 de julio de 2026')
    expect(formatted).toContain('9:53')
    expect(formatted).not.toContain('T')
    expect(formatted).not.toContain('Z')
  })

  it('maps completed to Completado without changing persisted backend values', () => {
    expect(formatContractResultStatus('completed')).toBe('Completado')
    expect(formatContractResultStatus('sent')).toBe('sent')
  })
})
