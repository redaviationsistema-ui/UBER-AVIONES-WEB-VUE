import { describe, expect, it } from 'vitest'

import {
  buildAircraftPayload,
  buildAircraftWizardStepErrors,
} from '../features/operator/portal/utilidadesWizardAeronave'

const baseForm = {
  name: 'LEGACY 600',
  manufacturer: 'EMBRAER',
  category: 'Heavy Jet',
  engineType: '',
  engineClass: 'HEAVY_JET',
  registration: 'XA-ABC',
  year: '2020',
  capacity: 13,
  range_km: 2500,
  speedKnots: 460,
  amenities: 'WiFi, Galley',
  base: 'TOLUCA',
  coverage: 'NACIONAL',
  airportExpensesUsd: 1200,
  hourlyPrice: 6500,
  operationalCost: 2000,
  fuelBurnGallonsPerHour: 320,
  engineReserveRate: 200,
  insuranceRate: 150,
  maintenanceRate: 180,
  crewRate: 120,
  repositioningFee: 500,
  overnightFee: 350,
}

describe('aircraft wizard utils', () => {
  it('validates required general step fields', () => {
    const errors = buildAircraftWizardStepErrors(
      1,
      { ...baseForm, name: '', category: '', base: '', year: '' },
      {
        resolveAircraftYearNumber: () => null,
        aircraftYearValidationMessage: () => 'Ano invalido',
      },
    )

    expect(errors).toMatchObject({
      name: 'El modelo es obligatorio.',
      category: 'Selecciona una categoria.',
      base: 'La base es obligatoria.',
      year: 'Ano invalido',
    })
  })

  it('requires gallery and documents before final submit', () => {
    const errors = buildAircraftWizardStepErrors(5, baseForm, {
      resolveAircraftYearNumber: () => 2020,
      aircraftYearValidationMessage: () => 'Ano invalido',
      selectedImageCount: 0,
      existingImageCount: 0,
      selectedDocumentCount: 0,
      existingDocumentCount: 0,
    })

    expect(errors._gallery).toContain('imagen comercial')
    expect(errors._documents).toContain('documento')
  })

  it('requires a positive maximum range in the operation step', () => {
    const errors = buildAircraftWizardStepErrors(2, { ...baseForm, range_km: 0 }, {})

    expect(errors.range_km).toBe('Debe capturar el rango máximo de la aeronave.')
  })

  it('builds a normalized aircraft payload for create/update requests', () => {
    const payload = buildAircraftPayload(baseForm, {
      inferredMinimumHours: 2,
      inferAircraftEngineType: () => 'turbofan',
      knotsToKmh: (value) => Math.round(Number(value) * 1.852),
      nullableText: (value) => value || null,
      resolveAircraftYearNumber: (value) => Number(value),
    })

    expect(payload).toMatchObject({
      model: 'LEGACY 600',
      engine_type: 'turbofan',
      motor_tipo: 'TURBOFAN',
      year: 2020,
      range_km: 2500,
      speed_kmh: 852,
      minimum_hours: 2,
      hourly_rate: 6500,
      base_airport: 'TOLUCA',
    })
    expect(payload).not.toHaveProperty('provider_id')
    expect(payload).not.toHaveProperty('status')
    expect(payload).not.toHaveProperty('stripe_customer_id')
    expect(payload).not.toHaveProperty('checkout_session_id')
    expect(payload.amenities).toEqual(['WiFi', 'Galley'])
  })
})
