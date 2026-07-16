import { describe, expect, it } from 'vitest'
import { buildProviderStatusSummary, providerStatusMetaByKey } from '../utils/providerStatus'

describe('providerStatus helpers', () => {
  it('classifies a provider with minimal data as draft', () => {
    const summary = buildProviderStatusSummary({
      company_name: 'Inicio parcial',
    })

    expect(summary.status).toBe('draft')
    expect(summary.progress).toBeLessThan(50)
  })

  it('classifies a partially completed provider as incomplete', () => {
    const summary = buildProviderStatusSummary({
      company_name: 'Operadora Parcial',
      legal_name: 'Operadora Parcial SA de CV',
      commercial_name: 'Operadora Parcial',
      company_email: 'ops@parcial.test',
      company_phone: '5551112233',
      base_airport: 'MMMX',
      rfc: 'OPA010101AAA',
    })

    expect(summary.status).toBe('incomplete')
    expect(summary.missingRequirements).toContain('Documentacion legal aprobada')
  })

  it('marks 7 of 8 requirements as incomplete with 88 percent and canSubmit enabled', () => {
    const summary = buildProviderStatusSummary({
      legal_name: 'SW SUPPORT GROUP SA DE CV',
      commercial_name: 'SW SUPPORT GROUP',
      company_name: 'SW SUPPORT GROUP',
      company_email: 'saempresa@gmail.com',
      company_phone: '1234567891',
      base_airport: 'TOLUCA',
      address: 'W HIGGINS RD, SUITE 260 10700',
      rfc: 'SWSUPPORTGR',
      representative_name: 'Laura Campos',
      sat_validation_status: 'approved',
      documents: [
        { document_slot: 'sat_certificate', status: 'approved' },
        { document_slot: 'articles_of_incorporation', status: 'approved' },
        { document_slot: 'legal_representative_power', status: 'approved' },
        { document_slot: 'legal_representative_id', status: 'approved' },
        { document_slot: 'tax_address_proof', status: 'approved' },
        { document_slot: 'operational_permit', status: 'approved' },
      ],
      validation_requirements: [
        { key: 'rfc_valid', complete: true, response_status: 'approved' },
        { key: 'sat_validation', complete: true, response_status: 'approved' },
      ],
      provider_status_summary: {
        status: 'incomplete',
        progress: 88,
        missing_requirements: ['Expediente enviado a revision'],
      },
    })

    expect(summary.status).toBe('incomplete')
    expect(summary.progress).toBe(88)
    expect(summary.canSubmit).toBe(true)
    expect(summary.submitted).toBe(false)
    expect(summary.requirementsByKey.valid_rfc).toBe(true)
    expect(summary.requirementsByKey.sat_validated).toBe(true)
    expect(summary.missingRequirements).toEqual(['Expediente enviado a revision'])
  })

  it('treats counted legal document summaries as approved even when validation requirements are stale', () => {
    const summary = buildProviderStatusSummary({
      company_name: 'SW SUPPORT GROUP',
      legal_name: 'SW SUPPORT GROUP SA DE CV',
      commercial_name: 'SW SUPPORT GROUP',
      company_email: 'ops@swsupport.test',
      company_phone: '5551112233',
      base_airport: 'TOLUCA',
      address: 'Toluca Centro',
      rfc: 'SWS010101AAA',
      representative_name: 'SW SUPPORT GROUP',
      sat_validation_status: 'aprobado',
      company_documents_count: 6,
      approved_documents_count: 6,
      pending_documents_count: 0,
      rejected_documents_count: 0,
      validation_requirements: [
        { key: 'legal_documents_approved', complete: false, response_status: 'pending' },
      ],
    })

    expect(summary.requirementsByKey.sat_validated).toBe(true)
    expect(summary.requirementsByKey.legal_documents_approved).toBe(true)
    expect(summary.requirementsByKey.legal_representative_complete).toBe(true)
    expect(summary.requirementsByKey.review_submitted).toBe(false)
    expect(summary.missingRequirements).toEqual(['Expediente enviado a revision'])
  })

  it('classifies a sent dossier as submitted before explicit admin review starts', () => {
    const summary = buildProviderStatusSummary({
      company_name: 'Operadora Enviada',
      legal_name: 'Operadora Enviada SA de CV',
      commercial_name: 'Operadora Enviada',
      company_email: 'ops@enviada.test',
      company_phone: '5551112233',
      base_airport: 'MMMX',
      rfc: 'ENV010101AAA',
      representative_name: 'Laura Campos',
      admin_review_submitted_at: '2026-07-15T10:00:00Z',
      documents: [
        { document_slot: 'sat_certificate', status: 'approved' },
        { document_slot: 'articles_of_incorporation', status: 'approved' },
        { document_slot: 'legal_representative_power', status: 'approved' },
        { document_slot: 'legal_representative_id', status: 'approved' },
        { document_slot: 'tax_address_proof', status: 'approved' },
        { document_slot: 'operational_permit', status: 'approved' },
      ],
      user: { profile: { address: 'Toluca Centro' } },
    })

    expect(summary.status).toBe('submitted')
    expect(summary.progress).toBe(100)
  })

  it('marks dossier as submitted when backend only exposes pending validation status', () => {
    const summary = buildProviderStatusSummary({
      company_name: 'Operadora En Revision',
      legal_name: 'Operadora En Revision SA de CV',
      commercial_name: 'Operadora En Revision',
      company_email: 'ops@revision.test',
      company_phone: '5551112233',
      base_airport: 'MMMX',
      rfc: 'REV010101AAA',
      representative_name: 'Laura Campos',
      validation_status: 'pending_validation',
      documents: [
        { document_slot: 'sat_certificate', status: 'approved' },
        { document_slot: 'articles_of_incorporation', status: 'approved' },
        { document_slot: 'legal_representative_power', status: 'approved' },
        { document_slot: 'legal_representative_id', status: 'approved' },
        { document_slot: 'tax_address_proof', status: 'approved' },
        { document_slot: 'operational_permit', status: 'approved' },
      ],
      user: { profile: { address: 'Toluca Centro' } },
    })

    expect(summary.submitted).toBe(true)
    expect(summary.requirementsByKey.review_submitted).toBe(true)
    expect(summary.missingRequirements).not.toContain('Expediente enviado a revision')
  })

  it('classifies observations when any required document is rejected', () => {
    const summary = buildProviderStatusSummary({
      company_name: 'Operadora Observada',
      documents: [
        { document_slot: 'sat_certificate', status: 'approved' },
        { document_slot: 'legal_representative_power', status: 'rejected' },
      ],
    })

    expect(summary.status).toBe('observations')
    expect(summary.documentSummary.rejected).toBe(1)
  })

  it('keeps approved providers approved even without aircraft', () => {
    const summary = buildProviderStatusSummary({
      approval_status: 'approved',
      admin_validation_status: 'approved',
      company_name: 'Operadora Aprobada',
    })

    expect(summary.status).toBe('approved')
    expect(summary.fleetSummary.status).toBe('no_aircraft')
  })

  it('derives suspended with highest priority', () => {
    const summary = buildProviderStatusSummary({
      approval_status: 'approved',
      admin_validation_status: 'suspended',
      company_name: 'Operadora Suspendida',
    })

    expect(summary.status).toBe('suspended')
    expect(providerStatusMetaByKey(summary.status).label).toBe('Suspendido')
  })
})
