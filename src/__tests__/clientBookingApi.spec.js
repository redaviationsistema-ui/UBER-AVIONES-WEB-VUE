import { describe, expect, it } from 'vitest'

import { inferDistanceUnit, inferEngineType } from '../features/client/clientBookingApi'

describe('inferDistanceUnit', () => {
  it('keeps matched_options distance_km values in kilometers by default', () => {
    expect(
      inferDistanceUnit(
        {
          distance_km: 1291.73,
        },
        'matched_options',
      ),
    ).toBe('km')
  })

  it('respects explicit nautical-mile units when provided', () => {
    expect(
      inferDistanceUnit({
        distance_km: 697.48,
        distance_unit: 'nm',
      }),
    ).toBe('nm')
  })
})

describe('inferEngineType', () => {
  it('infers turbofan for current jet models', () => {
    expect(inferEngineType({ category: 'Heavy Jet', model: 'GULFSTREAM G-IV' })).toBe('turbofan')
    expect(inferEngineType({ category: 'Heavy Jet', model: 'GULFSTREAM G450' })).toBe('turbofan')
    expect(inferEngineType({ category: 'Light Jet', model: 'LEARJET 31A' })).toBe('turbofan')
    expect(inferEngineType({ category: 'Mid Jet', model: 'HAWKER 800XPI' })).toBe('turbofan')
    expect(inferEngineType({ category: 'Mid Jet', model: 'HAWKER 800A' })).toBe('turbofan')
    expect(inferEngineType({ category: 'Mid Jet', model: 'GULFSTREAM G200' })).toBe('turbofan')
    expect(inferEngineType({ category: 'Light Jet', model: 'CESSNA CITATION II (550)' })).toBe('turbofan')
    expect(inferEngineType({ category: 'Heavy Jet', model: 'CESSNA CITATION 750' })).toBe('turbofan')
  })

  it('infers turboprop for current prop models', () => {
    expect(inferEngineType({ category: 'Turboprop', model: 'KING AIR' })).toBe('turboprop')
    expect(inferEngineType({ category: 'Turboprop', model: 'KING AIR C90GT' })).toBe('turboprop')
    expect(inferEngineType({ category: 'Turboprop', model: 'PILATUS PC-12' })).toBe('turboprop')
  })

  it('infers turboshaft for current helicopter models', () => {
    expect(inferEngineType({ category: 'Helicoptero', model: 'AGUSTA A109E POWER VIP' })).toBe('turboshaft')
    expect(inferEngineType({ category: 'Helicoptero', model: 'BELL 505' })).toBe('turboshaft')
  })
})
