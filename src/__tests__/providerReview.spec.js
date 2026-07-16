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

  it('rejects placeholder company names but keeps captured representative names even if they match the company', () => {
    expect(
      resolveProviderCompanyName({
        company_name: 'RED AVIATION',
        commercial_name: 'DEMO',
        legal_name: 'Operadora Aerea del Bajio',
      }),
    ).toBe('Operadora Aerea del Bajio')

    expect(
      resolveProviderRepresentativeName({
        company_name: 'SW SUPPORT GROUP',
        representative_name: 'SW SUPPORT GROUP',
        user: { name: 'SW SUPPORT GROUP' },
      }),
    ).toBe('SW SUPPORT GROUP')
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

    expect(resolveProviderStatusMeta({ status: 'pending_validation' }).label).toBe('Enviado a revision')
    expect(flow.progress.percent).toBe(50)
    expect(flow.checklist.find((item) => item.id === 'rfc_valid')?.complete).toBe(false)
    expect(flow.statusMeta.key).toBe('submitted')
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
    expect(flow.summary.find((item) => item.label === 'Documentacion')?.value).toBe('5/6 aprobados')
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

  it('respects backend summary for incomplete providers that only need review submission', () => {
    const flow = buildProviderReviewFlow({
      legal_name: 'SW SUPPORT GROUP SA DE CV',
      commercial_name: 'SW SUPPORT GROUP',
      company_name: 'SW SUPPORT GROUP',
      rfc: 'SWS010101AAA',
      company_email: 'saempresa@gmail.com',
      company_phone: '1234567891',
      base_airport: 'TOLUCA',
      address: 'W HIGGINS RD, SUITE 260 10700',
      representative_name: 'Laura Campos',
      validation_requirements: [
        { key: 'company_identity', complete: true, response_status: 'pending' },
        { key: 'rfc_valid', complete: true, response_status: 'approved' },
        { key: 'sat_validation', complete: true, response_status: 'approved' },
        { key: 'legal_documents_approved', complete: true, response_status: 'approved' },
        { key: 'base_operativa', complete: true, response_status: 'pending' },
        { key: 'contact_complete', complete: true, response_status: 'pending' },
        { key: 'legal_representative_complete', complete: true, response_status: 'pending' },
        { key: 'review_submitted', complete: false, response_status: 'pending' },
      ],
      provider_status_summary: {
        status: 'incomplete',
        progress: 88,
        missing_requirements: ['Expediente enviado a revision'],
      },
    })

    expect(flow.statusMeta.key).toBe('incomplete')
    expect(flow.progress.percent).toBe(88)
    expect(flow.missingRequirements).toEqual(['Expediente enviado a revision'])
  })

  it('keeps sat, legal documents and representative complete when only review submission is missing', () => {
    const flow = buildProviderReviewFlow({
      legal_name: 'SW SUPPORT GROUP SA DE CV',
      commercial_name: 'SW SUPPORT GROUP',
      company_name: 'SW SUPPORT GROUP',
      rfc: 'SWS010101AAA',
      company_email: 'saempresa@gmail.com',
      company_phone: '1234567891',
      base_airport: 'TOLUCA',
      address: 'W HIGGINS RD, SUITE 260 10700',
      representative_name: 'SW SUPPORT GROUP',
      sat_validation_status: 'approved',
      documents: [
        { document_slot: 'sat_certificate', status: 'approved' },
        { document_slot: 'articles_of_incorporation', status: 'approved' },
        { document_slot: 'legal_representative_power', status: 'approved' },
        { document_slot: 'legal_representative_id', status: 'approved' },
        { document_slot: 'tax_address_proof', status: 'approved' },
        { document_slot: 'operational_permit', status: 'approved' },
      ],
    })

    const byKey = Object.fromEntries(flow.validationRequirements.map((item) => [item.key, item.complete]))

    expect(byKey.sat_validation).toBe(true)
    expect(byKey.legal_documents_approved).toBe(true)
    expect(byKey.legal_representative_complete).toBe(true)
    expect(byKey.review_submitted).toBe(false)
  })

  it('does not mark invalid RFC values as complete admin requirements', () => {
    const flow = buildProviderReviewFlow({
      company_name: 'RFC Invalido Test',
      rfc: 'SWSUPPORTRFC',
      company_email: 'ops@test.com',
      company_phone: '5551234567',
      base_airport: 'MMMX',
      representative_name: 'Laura Campos',
    })

    expect(flow.validationRequirements.find((item) => item.key === 'rfc_valid')?.complete).toBe(false)
    expect(flow.canValidate).toBe(false)
  })

  it('does not treat placeholder base labels as a defined operational base', () => {
    const flow = buildProviderReviewFlow({
      company_name: 'Base Pendiente Test',
      rfc: 'BPT010101AAA',
      company_email: 'ops@test.com',
      company_phone: '5551234567',
      base: 'Base pendiente',
      representative_name: 'Laura Campos',
    })

    expect(flow.validationRequirements.find((item) => item.key === 'base_operativa')?.complete).toBe(false)
    expect(flow.canValidate).toBe(false)
  })

  it('marks review submitted requirement complete when backend only reports pending validation status', () => {
    const flow = buildProviderReviewFlow({
      company_name: 'Revision Activa Test',
      legal_name: 'Revision Activa Test SA de CV',
      commercial_name: 'Revision Activa Test',
      rfc: 'RAT010101AAA',
      company_email: 'ops@test.com',
      company_phone: '5551234567',
      base_airport: 'MMMX',
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

    expect(flow.validationRequirements.find((item) => item.key === 'review_submitted')?.complete).toBe(true)
  })

  it('exposes submit state and requirement map consistently for the operator portal', () => {
    const flow = buildProviderReviewFlow({
      legal_name: 'SW SUPPORT GROUP SA DE CV',
      commercial_name: 'SW SUPPORT GROUP',
      company_name: 'SW SUPPORT GROUP',
      rfc: 'SWS010101AAA',
      company_email: 'saempresa@gmail.com',
      company_phone: '1234567891',
      base_airport: 'TOLUCA',
      address: 'W HIGGINS RD, SUITE 260 10700',
      representative_name: 'SW SUPPORT GROUP',
      sat_validation_status: 'approved',
      company_documents_count: 6,
      approved_documents_count: 6,
      pending_documents_count: 0,
      rejected_documents_count: 0,
    })

    expect(flow.status).toBe('incomplete')
    expect(flow.canSubmit).toBe(true)
    expect(flow.submitted).toBe(false)
    expect(flow.requirementsByKey.legal_documents_approved).toBe(true)
    expect(flow.requirementsByKey.review_submitted).toBe(false)
    expect(flow.checklist.find((item) => item.id === 'review_submitted')?.complete).toBe(false)
  })
  
})
