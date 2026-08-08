import { describe, expect, it } from 'vitest'

import {
  normalizeEmail,
  sanitizeRegistrationForm,
  validateProviderProfileStep,
} from '../features/register/registerValidation'

describe('registerValidation', () => {
  it('normalizes provider commercial data before validation', () => {
    const sanitized = sanitizeRegistrationForm({
      companyName: '  Sky   Group  ',
      companyEmail: '  OPERACIONES@Empresa.COM ',
      name: '  juan   perez  ',
      ineCurp: ' abcd123456hdfrrn09 ',
    })

    expect(sanitized.companyName).toBe('Sky Group')
    expect(sanitized.companyEmail).toBe('operaciones@empresa.com')
    expect(sanitized.name).toBe('JUAN PEREZ')
    expect(sanitized.ineCurp).toBe('ABCD123456HDFRRN09')
    expect(normalizeEmail('  TEST@MAIL.COM ')).toBe('test@mail.com')
  })

  it('rejects an invalid provider email before allowing step 2 to continue', () => {
    const { errors } = validateProviderProfileStep(
      {
        companyName: 'Sky Group',
        legalName: 'Sky Group SA de CV',
        companyPhone: '+52 55 1234 5678',
        companyEmail: '98765432',
        name: 'JUAN PEREZ',
        phone: '+52 55 7654 3210',
        birthDate: '1990-01-10',
        documentType: 'INE o identificacion oficial',
        documentNumber: 'ABC123456',
        documentExpiration: '2030-10-10',
        nationality: 'Mexicana',
        ineCurp: 'PEPJ900110HDFRRN09',
      },
      { requireIdentification: true },
    )

    expect(errors.companyEmail).toBe('Ingresa un correo electrónico válido.')
  })
})
