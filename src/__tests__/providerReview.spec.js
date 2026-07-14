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
    expect(flow.progress.percent).toBe(0)
    expect(flow.checklist.find((item) => item.id === 'rfc_valid')?.complete).toBe(false)
    expect(flow.alerts.some((alert) => alert.title.toLowerCase().includes('documentacion legal'))).toBe(true)
  })

  it('treats approved backend field requirements as approved when source data exists and complete is null', () => {
    const flow = buildProviderReviewFlow({
      company_name: 'Aero Test',
      rfc: 'AET010101AAA',
      base_airport: 'MMMX',
      company_email: 'ops@aerotest.com',
      company_phone: '5551234567',
      representative_name: 'Laura Campos',
      validation_requirements: [
        {
          key: 'rfc_valid',
          label: 'RFC valido',
          complete: null,
          response_status: 'approved',
        },
      ],
    })

    const requirement = flow.validationRequirements.find((item) => item.key === 'rfc_valid')

    expect(requirement?.complete).toBe(true)
    expect(requirement?.responseStatus).toBe('approved')
  })

  it('keeps rejected backend field requirements complete but not approvable for operator validation', () => {
    const flow = buildProviderReviewFlow({
      company_name: 'Aero Test',
      rfc: 'AET010101AAA',
      validation_requirements: [
        {
          key: 'rfc_valid',
          label: 'RFC valido',
          complete: null,
          response_status: 'rejected',
        },
      ],
    })

    const requirement = flow.validationRequirements.find((item) => item.key === 'rfc_valid')

    expect(requirement?.complete).toBe(true)
    expect(requirement?.responseStatus).toBe('rejected')
    expect(flow.canValidate).toBe(false)
  })

  it('derives legal requirement from approved documents instead of stale requirement status', () => {
    const flow = buildProviderReviewFlow({
      company_name: 'Aero Legal',
      validation_requirements: [
        {
          key: 'legal_documents_approved',
          label: 'Documentacion legal aprobada',
          complete: true,
          response_status: 'pending',
        },
      ],
      documents: [
        { document_slot: 'articles_of_incorporation', status: 'approved' },
        { document_slot: 'legal_representative_power', status: 'approved' },
        { document_slot: 'legal_representative_id', status: 'approved' },
        { document_slot: 'tax_address_proof', status: 'approved' },
        { document_slot: 'operational_permit', status: 'approved' },
      ],
    })

    const requirement = flow.validationRequirements.find((item) => item.key === 'legal_documents_approved')

    expect(requirement?.responseStatus).toBe('approved')
    expect(requirement?.complete).toBe(true)
    expect(flow.summary.find((item) => item.label === 'Documentacion legal')?.value).toBe('Aprobada')
  })

  it('marks legal requirement rejected when any linked legal document is rejected', () => {
    const flow = buildProviderReviewFlow({
      company_name: 'Aero Legal',
      documents: [
        { document_slot: 'articles_of_incorporation', status: 'approved' },
        { document_slot: 'legal_representative_power', status: 'rejected', rejection_reason: 'Falta firma' },
        { document_slot: 'legal_representative_id', status: 'approved' },
        { document_slot: 'tax_address_proof', status: 'approved' },
        { document_slot: 'operational_permit', status: 'approved' },
      ],
    })

    const requirement = flow.validationRequirements.find((item) => item.key === 'legal_documents_approved')

    expect(requirement?.responseStatus).toBe('rejected')
    expect(flow.summary.find((item) => item.label === 'Requisitos rechazados')?.value).toBe('1')
    expect(flow.checklist.find((item) => item.id === 'legal_documents_approved')?.rejected).toBe(true)
  })
  
})



