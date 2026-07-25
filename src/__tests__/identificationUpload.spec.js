/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'

import {
  buildIdentificationUploadFormData,
  identificationDocumentNeedsExpiration,
  validateIdentificationForm,
} from '../features/register/identificationUpload'

function buildForm(overrides = {}) {
  return {
    name: 'JUAN PEREZ',
    phone: '+52 55 1234 5678',
    birthDate: '1990-01-10',
    documentType: 'ine',
    documentNumber: 'ABC123456',
    documentExpiration: '2030-10-10',
    nationality: 'Mexicana',
    ineCurp: 'PEPJ900110HDFRRN09',
    identityValidationRequired: true,
    ...overrides,
  }
}

describe('identificationUpload helpers', () => {
  it('requires expiration for INE documents and makes it optional for proof of address', () => {
    expect(identificationDocumentNeedsExpiration('ine')).toBe(true)
    expect(identificationDocumentNeedsExpiration('proof_of_address')).toBe(false)
  })

  it('validates the manual identification fields before upload', () => {
    expect(() =>
      validateIdentificationForm(buildForm({ documentExpiration: '' })),
    ).toThrow('Completa la vigencia del documento.')

    expect(() => validateIdentificationForm(buildForm())).not.toThrow()
  })

  it('builds the multipart payload with replacement metadata only when needed', () => {
    const formData = buildIdentificationUploadFormData(
      buildForm(),
      new File(['pdf'], 'identificacion.pdf', { type: 'application/pdf' }),
      'doc-123',
    )

    expect(formData.get('document_name')).toBe('Identificación oficial')
    expect(formData.get('document_slot')).toBe('official_identification')
    expect(formData.get('replace_document_id')).toBe('doc-123')
    expect(formData.get('expires_at')).toBe('2030-10-10')
  })
})
