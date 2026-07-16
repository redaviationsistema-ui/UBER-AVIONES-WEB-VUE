import { describe, expect, it } from 'vitest'
import {
  buildCompanyFieldErrors,
  buildCompanyPayload,
  buildCompanyPendingValidationPatch,
  buildCompanyReviewCandidates,
  buildCompanyReviewFormData,
  buildCompanySaveCandidates,
  hasCompanyFieldErrors,
  sanitizeCompanyPayloadForSave,
} from '../features/operator/portal/portalOperador.flujoEmpresa'

describe('operator portal company flow helpers', () => {
  it('validates the minimum company fields for save', () => {
    const errors = buildCompanyFieldErrors(
      {
        legalName: '',
        tradeName: '',
        rfc: '',
        address: '',
        operationalBase: '',
      },
      {
        normalizedRfc: '',
        isValidRfc: false,
      },
    )

    expect(errors.legalName).toContain('razon social')
    expect(errors.tradeName).toContain('nombre comercial')
    expect(errors.rfc).toContain('RFC')
    expect(errors.address).toContain('direccion fiscal')
    expect(errors.operationalBase).toContain('base operativa')
    expect(hasCompanyFieldErrors(errors)).toBe(true)
  })

  it('allows partial save without blocking missing core fields', () => {
    const errors = buildCompanyFieldErrors(
      {
        legalName: '',
        tradeName: '',
        rfc: '',
        address: '',
        operationalBase: '',
      },
      {
        normalizedRfc: '',
        isValidRfc: false,
        allowPartialSave: true,
      },
    )

    expect(errors.legalName).toBe('')
    expect(errors.tradeName).toBe('')
    expect(errors.rfc).toBe('')
    expect(errors.address).toBe('')
    expect(errors.operationalBase).toBe('')
    expect(hasCompanyFieldErrors(errors)).toBe(false)
  })

  it('adds stricter requirements when sending to review', () => {
    const errors = buildCompanyFieldErrors(
      {
        legalName: 'Operadora del Norte',
        tradeName: 'Sky Norte',
        rfc: 'AAA010101AAA',
        address: 'Av. Reforma 100',
        operationalBase: 'Toluca',
        phone: '',
        email: 'correo-invalido',
        legalRepresentative: '',
      },
      {
        normalizedRfc: 'AAA010101AAA',
        isValidRfc: true,
        requireReviewSubmission: true,
        hasRequiredLegalDocuments: false,
      },
    )

    expect(errors.phone).toContain('telefono')
    expect(errors.email).toContain('correo valido')
    expect(errors.legalRepresentative).toContain('representante legal')
    expect(errors._form).toContain('documentos legales obligatorios')
  })

  it('builds a resilient payload and candidate list for saving company data', () => {
    const payload = buildCompanyPayload(
      {
        legalName: 'Operadora del Norte',
        tradeName: 'Sky Norte',
        phone: '5551234567',
        email: 'ops@skynorte.test',
        address: 'Av. Reforma 100',
        operationalBase: 'Toluca',
        legalRepresentative: 'Laura Gomez',
        jetAPrice: '21.5',
        marginPercent: '',
        fixedFee: null,
      },
      'AAA010101AAA',
    )

    const candidates = buildCompanySaveCandidates(payload)

    expect(payload).toMatchObject({
      legal_name: 'Operadora del Norte',
      commercial_name: 'Sky Norte',
      rfc: 'AAA010101AAA',
      representative_name: 'Laura Gomez',
      legal_representative: 'Laura Gomez',
      jet_a_price: 21.5,
      margin_percent: 0,
      fixed_fee: 0,
    })
    expect(candidates.map((candidate) => candidate.path)).toEqual(
      expect.arrayContaining(['/proveedor/empresa', '/provider/company', '/operator/company']),
    )
    expect(candidates.map((candidate) => candidate.method)).toEqual(
      expect.arrayContaining(['put', 'patch']),
    )
  })

  it('sanitizes optional save fields that would block partial save in backend', () => {
    const sanitized = sanitizeCompanyPayloadForSave({
      legal_name: '',
      commercial_name: 'Sky Norte',
      email: 'correo-invalido',
      company_email: 'correo-invalido',
      rfc: '',
      base_airport: '',
    })

    expect(sanitized.email).toBeUndefined()
    expect(sanitized.company_email).toBeUndefined()
    expect(sanitized.rfc).toBeUndefined()
    expect(sanitized.commercial_name).toBe('Sky Norte')
    expect(sanitized.base_airport).toBe('')
  })

  it('builds review form data and fallback routes for review submission', () => {
    const file = new File(['legal'], 'acta.pdf', { type: 'application/pdf' })
    const submittedAt = '2026-07-15T10:00:00.000Z'
    const formData = buildCompanyReviewFormData({
      selectedFile: file,
      selectedFileName: 'Acta constitutiva.pdf',
      submittedAt,
    })
    const entries = Array.from(formData.entries())
    const reviewCandidates = buildCompanyReviewCandidates(formData)

    expect(entries).toEqual(
      expect.arrayContaining([
        ['review_status', 'pending_review'],
        ['validation_status', 'pending_validation'],
        ['status', 'pending_review'],
        ['admin_validation_status', 'pending_review'],
        ['approval_status', 'pending_review'],
        ['admin_review_submitted_at', submittedAt],
        ['document_name', 'Acta constitutiva.pdf'],
      ]),
    )
    expect(entries.find(([key]) => key === 'file')?.[1]).toBe(file)
    expect(reviewCandidates.map((candidate) => candidate.path)).toEqual(
      expect.arrayContaining([
        '/proveedor/empresa/enviar-revision',
        '/proveedor/empresa/send-review',
        '/provider/company/send-review',
        '/operator/company/send-review',
      ]),
    )
  })

  it('builds an explicit pending validation patch for resilient provider onboarding saves', () => {
    expect(buildCompanyPendingValidationPatch({ submittedAt: '2026-07-15T10:00:00.000Z' })).toEqual({
      review_status: 'pending_review',
      validation_status: 'pending_validation',
      status: 'pending_review',
      admin_validation_status: 'pending_review',
      approval_status: 'pending_review',
      operator_status: 'pending_validation',
      access_enabled: false,
      admin_review_submitted_at: '2026-07-15T10:00:00.000Z',
    })
  })
})
