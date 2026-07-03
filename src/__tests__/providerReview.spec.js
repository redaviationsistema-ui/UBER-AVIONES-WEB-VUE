import { describe, expect, it } from 'vitest'
import {
  buildProviderReviewFlow,
  resolveProviderCompanyName,
  resolveProviderRepresentativeName,
  resolveProviderStatusMeta,
} from '../lib/providerReview'

describe('providerReview helpers', () => {
  it('prioritizes a strong company name over weak legal suffixes', () => {
    expect(
      resolveProviderCompanyName({
        legal_name: 'SA de CV',
        commercial_name: 'Aero Ejecutivo Maya',
        company_name: 'SA',
      }),
    ).toBe('Aero Ejecutivo Maya')
  })

  it('keeps representative separate from company naming', () => {
    expect(
      resolveProviderRepresentativeName({
        representative_name: 'Laura Campos Torres',
        user: { name: 'Usuario Prueba' },
      }),
    ).toBe('Laura Campos Torres')
  })

  it('rejects placeholder company names and placeholder representatives', () => {
    expect(
      resolveProviderCompanyName({
        company_name: 'RED AVIATION',
        commercial_name: 'DEMO',
        legal_name: 'Operadora Aerea del Bajio',
      }),
    ).toBe('Operadora Aerea del Bajio')

    expect(
      resolveProviderRepresentativeName({
        company_name: 'RED AVIATION',
        representative_name: 'RED AVIATION',
        user: { name: 'RED AVIATION' },
      }),
    ).toBe('Sin representante')
  })

  it('detects in-review status and builds a resilient checklist', () => {
    const flow = buildProviderReviewFlow(
      {
        company_name: 'Jet Sierra Norte',
        representative_name: 'Mario Gomez',
        company_email: 'ops@jetsierra.test',
        company_phone: '5551234567',
        status: 'pending_validation',
        rfc: '',
        base_airport: 'MMMX',
        documents: [],
      },
      { aircraft: 0, active: 0, pending: 0, trial: 0 },
    )

    expect(resolveProviderStatusMeta({ status: 'pending_validation' }).label).toBe('En revision')
    expect(flow.progress.percent).toBe(57)
    expect(flow.checklist.find((item) => item.id === 'tax')?.complete).toBe(false)
    expect(flow.alerts.some((alert) => alert.title.includes('documentacion legal'))).toBe(true)
  })
})
