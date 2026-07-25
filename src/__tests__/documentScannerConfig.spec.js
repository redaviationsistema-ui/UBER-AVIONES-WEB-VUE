import { describe, expect, it } from 'vitest'

import {
  DOCUMENT_SCAN_STAGES,
  DOCUMENT_TYPE_OPTIONS,
  getDocumentStage,
  getDocumentTypeOption,
  normalizeDocumentType,
} from '../features/register/documentScannerConfig'

describe('documentScannerConfig', () => {
  it('normalizes known aliases to generic document types', () => {
    expect(normalizeDocumentType('INE')).toBe('ine')
    expect(normalizeDocumentType('Pasaporte')).toBe('passport')
    expect(normalizeDocumentType('Licencia de sobrecargo')).toBe('driver_license')
    expect(normalizeDocumentType('Tarjeta de circulacion')).toBe('vehicle_registration')
  })

  it('falls back to custom for unknown values', () => {
    expect(normalizeDocumentType('Mi documento raro')).toBe('custom')
  })

  it('exposes the expected scan stages in order', () => {
    expect(DOCUMENT_SCAN_STAGES.map((stage) => stage.key)).toEqual([
      'preparing-image',
      'verifying-quality',
      'detecting-document',
      'correcting-perspective',
      'uploading-file',
      'reading-information',
      'validating-data',
      'completed',
    ])
    expect(getDocumentStage('validating-data').progress).toBe(90)
  })

  it('returns document metadata for supported types', () => {
    expect(DOCUMENT_TYPE_OPTIONS.some((option) => option.value === 'proof_of_address')).toBe(true)
    expect(getDocumentTypeOption('passport').label).toBe('Pasaporte')
    expect(getDocumentTypeOption('desconocido').value).toBe('custom')
  })
})
