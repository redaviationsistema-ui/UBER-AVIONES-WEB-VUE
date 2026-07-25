import { describe, expect, it } from 'vitest'

import {
  extractIneNameFromFront,
  isValidPersonName,
  filterRawText,
  normalizeCurp,
  normalizeIsoDate,
  normalizePersonName,
  parseMrz,
  parseMrzName,
  resolveName,
  resolveField,
} from '../features/register/documentScanner'

describe('documentScanner helpers', () => {
  it('normalizes full names without truncating the preferred source', () => {
    const resolved = resolveField(
      [
        { value: normalizePersonName('PEREZ<<JUAN<CARLOS', 'mrz', 'ine'), source: 'mrz', confidence: 82 },
        { value: normalizePersonName('JUAN CARLOS PEREZ LOPEZ', 'front_ocr', 'ine'), source: 'front_ocr', confidence: 88 },
        { value: normalizePersonName('JUAN PEREZ', 'barcode', 'ine'), source: 'barcode', confidence: 93 },
      ],
      {
        preferSources: ['front_ocr', 'mrz', 'barcode', 'ocr'],
        minimumConfidence: 70,
        validate: (value) => value.split(' ').length >= 2,
      },
    )

    expect(resolved.value).toBe('JUAN CARLOS PEREZ LOPEZ')
    expect(resolved.source).toBe('front_ocr')
    expect(resolved.alternatives).toHaveLength(2)
  })

  it('rejects OCR garbage as a person name', () => {
    expect(isValidPersonName('AD O CEES Q UY UW PRR A A GE RM AWN')).toBe(false)
    expect(isValidPersonName('INSTITUTO NACIONAL ELECTORAL')).toBe(false)
    expect(isValidPersonName('JUAN CARLOS PEREZ')).toBe(true)
  })

  it('extracts INE names only from the NOMBRE region', () => {
    const result = extractIneNameFromFront([
      'INSTITUTO NACIONAL ELECTORAL',
      'NOMBRE',
      'JUAN CARLOS',
      'PEREZ LOPEZ',
      'DOMICILIO',
      'CALLE 123',
    ])

    expect(result).toBe('JUAN CARLOS PEREZ LOPEZ')
  })

  it('normalizes dates into ISO format and rejects future values', () => {
    expect(normalizeIsoDate('24/07/2026')).toBe('2026-07-24')
    expect(normalizeIsoDate('2026-07-25')).toBeNull()
    expect(normalizeIsoDate('31/02/2026')).toBeNull()
  })

  it('validates CURP before accepting it', () => {
    expect(normalizeCurp('gode561231hdfrrn09')).toBe('GODE561231HDFRRN09')
    expect(normalizeCurp('AAAAAAAAAAAAAAAAAA')).toBeNull()
  })

  it('parses MRZ data from the dedicated lower region text', () => {
    const mrz = parseMrz([
      'IDMEXABC123456<0<<<<<<<<<<<<<<<',
      '8001011H3001019MEX<<<<<<<<<<<6',
      'PEREZ<<JUAN<CARLOS<<<<<<<<<<<<',
    ])

    expect(mrz.valid).toBe(true)
    expect(mrz.documentNumber).toBe('ABC123456')
    expect(mrz.birthDate).toBe('1980-01-01')
    expect(mrz.expirationDate).toBe('2030-01-01')
    expect(mrz.surname).toBe('PEREZ')
    expect(mrz.givenNames).toBe('JUAN CARLOS')
  })

  it('parses MRZ names without using the full reverse OCR text', () => {
    expect(parseMrzName('PEREZ<<JUAN<CARLOS<<<<<<<<<<<<')).toBe('JUAN CARLOS PEREZ')
    expect(parseMrzName('INSTITUTO<<NACIONAL<ELECTORAL')).toBeNull()
  })

  it('resolves names by priority and not by raw OCR length', () => {
    const resolved = resolveName({
      frontName: { value: 'JUAN CARLOS PEREZ LOPEZ', confidence: 79, source: 'front_ocr' },
      mrzName: { value: 'JUAN CARLOS PEREZ', confidence: 92, source: 'mrz' },
      barcodeName: { value: 'AD O CEES Q UY UW PRR A A GE RM AWN', confidence: 99, source: 'barcode' },
      generalOcrName: { value: 'MEXICO INSTITUTO NACIONAL ELECTORAL', confidence: 45, source: 'ocr' },
    })

    expect(resolved.value).toBe('JUAN CARLOS PEREZ LOPEZ')
    expect(resolved.source).toBe('front_ocr')
    expect(resolved.alternatives).toHaveLength(1)
  })

  it('filters OCR noise while preserving meaningful lines', () => {
    const filtered = filterRawText(`
      ####
      CURP GODE561231HDFRRN09
      <<<<<<<
      VIGENCIA 2030
      .....
    `)

    expect(filtered).toContain('CURP GODE561231HDFRRN09')
    expect(filtered).toContain('VIGENCIA 2030')
    expect(filtered).not.toContain('####')
    expect(filtered).not.toContain('<<<<<<<')
  })
})
