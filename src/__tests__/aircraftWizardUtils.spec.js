import { describe, expect, it } from 'vitest'

import {
  buildAircraftMutationCandidates,
  buildAircraftPayload,
  buildAircraftWizardStepErrors,
  resolveAircraftMutationBackendErrorMessage,
  shouldBlockAircraftWizardStepTransition,
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

  it('blocks rapid consecutive step transitions to avoid skipping documents', () => {
    expect(
      shouldBlockAircraftWizardStepTransition({
        currentStep: 3,
        targetStep: 4,
        isLocked: false,
        lastChangedAt: 1_000,
        now: 1_120,
        lockMs: 250,
      }),
    ).toBe(true)

    expect(
      shouldBlockAircraftWizardStepTransition({
        currentStep: 4,
        targetStep: 5,
        isLocked: false,
        lastChangedAt: 1_000,
        now: 1_320,
        lockMs: 250,
      }),
    ).toBe(false)
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

  it('builds compatibility mutation candidates with a minimal fallback payload', () => {
    const payload = buildAircraftPayload(baseForm, {
      inferredMinimumHours: 2,
      inferAircraftEngineType: () => 'turbofan',
      knotsToKmh: (value) => Math.round(Number(value) * 1.852),
      nullableText: (value) => value || null,
      resolveAircraftYearNumber: (value) => Number(value),
    })

    const candidates = buildAircraftMutationCandidates({
      method: 'post',
      providerPath: '/proveedor/aeronaves',
      operatorPath: '/operator/aircraft',
      payload,
    })

    expect(candidates).toHaveLength(4)
    expect(candidates[0]).toMatchObject({
      method: 'post',
      path: '/proveedor/aeronaves',
      body: payload,
    })
    expect(candidates[1]).toMatchObject({
      method: 'post',
      path: '/operator/aircraft',
      body: payload,
    })
    expect(candidates[2]).toMatchObject({
      method: 'post',
      path: '/proveedor/aeronaves',
    })
    expect(candidates[2].body).toMatchObject({
      model: 'LEGACY 600',
      manufacturer: 'EMBRAER',
      category: 'Heavy Jet',
      registration: 'XA-ABC',
      year: 2020,
      capacity: 13,
      base_airport: 'TOLUCA',
      range_km: 2500,
      speed_kmh: 852,
      coverage: 'NACIONAL',
      hourly_rate: 6500,
      amenities: ['WiFi', 'Galley'],
    })
    expect(candidates[2].body).not.toHaveProperty('minimum_hours')
    expect(candidates[2].body).not.toHaveProperty('operational_cost')
    expect(candidates[2].body).not.toHaveProperty('engine_reserve_rate')
  })

  it('avoids duplicate mutation candidates when the payload is already minimal', () => {
    const candidates = buildAircraftMutationCandidates({
      method: 'put',
      providerPath: '/proveedor/aeronaves/7',
      operatorPath: '/operator/aircraft/7',
      payload: {
        model: 'KING AIR 350',
        capacity: 8,
        base_airport: 'MMMX',
        hourly_rate: 4200,
      },
    })

    expect(candidates).toEqual([
      {
        method: 'put',
        path: '/proveedor/aeronaves/7',
        body: {
          model: 'KING AIR 350',
          capacity: 8,
          base_airport: 'MMMX',
          hourly_rate: 4200,
        },
      },
      {
        method: 'put',
        path: '/operator/aircraft/7',
        body: {
          model: 'KING AIR 350',
          capacity: 8,
          base_airport: 'MMMX',
          hourly_rate: 4200,
        },
      },
    ])
  })

  it('returns a compatibility-focused message when every candidate fails with server-side backend mismatch signals', () => {
    const message = resolveAircraftMutationBackendErrorMessage(
      {
        message: 'SQLSTATE[42703]: Undefined column: 7 ERROR: column "climb_descent_source" does not exist',
        candidateAttempts: [
          { path: '/proveedor/aeronaves', status: 500 },
          { path: '/operator/aircraft', status: 500 },
        ],
      },
      'Fallback generico',
    )

    expect(message).toContain('backend activo parece desfasado o incompatible')
    expect(message).toContain('Detalle backend:')
    expect(message).toContain('climb_descent_source')
  })

  it('keeps the provided fallback message when the error does not look like a backend compatibility issue', () => {
    const message = resolveAircraftMutationBackendErrorMessage(
      {
        message: 'Validation failed',
        candidateAttempts: [{ path: '/proveedor/aeronaves', status: 422 }],
      },
      'Fallback generico',
    )

    expect(message).toBe('Fallback generico')
  })

  it('trims overly long backend details before showing them to the user', () => {
    const detail = `SQLSTATE ${'x'.repeat(260)}`
    const message = resolveAircraftMutationBackendErrorMessage(
      {
        message: detail,
        candidateAttempts: [
          { path: '/proveedor/aeronaves', status: 500 },
          { path: '/operator/aircraft', status: 500 },
        ],
      },
      'Fallback generico',
    )

    expect(message).toContain('Detalle backend:')
    expect(message.endsWith('...')).toBe(true)
    expect(message.length).toBeLessThan(detail.length + 80)
  })
})
