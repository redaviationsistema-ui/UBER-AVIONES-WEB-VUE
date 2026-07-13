import { describe, expect, it, vi } from 'vitest'

vi.mock('../plugins/echo', () => ({
  echo: null,
  isEchoConfigured: () => false,
  syncEchoAuthToken: () => {},
}))

import {
  AIRCRAFT_REVIEW_WIZARD_STATES,
  deriveAircraftWizardReviewState,
  normalizeAircraftValidationStatus,
} from '../features/operator/portal/portalOperador.nucleo.js'

describe('operator aircraft review state', () => {
  it('normalizes aircraft validation statuses explicitly', () => {
    expect(normalizeAircraftValidationStatus(null)).toBe('pending')
    expect(normalizeAircraftValidationStatus(' pendiente_revision ')).toBe('pending')
    expect(normalizeAircraftValidationStatus('approved')).toBe('approved')
    expect(normalizeAircraftValidationStatus('changes_required')).toBe('changes_requested')
    expect(normalizeAircraftValidationStatus('rechazada')).toBe('rejected')
  })

  it('keeps a new aircraft as listo para registrar before insert', () => {
    const state = deriveAircraftWizardReviewState({
      aircraftId: null,
      aircraftStatus: '',
      validationStatus: '',
      isReadyForRegistration: true,
    })

    expect(state.key).toBe(AIRCRAFT_REVIEW_WIZARD_STATES.LISTO_PARA_REGISTRAR)
    expect(state.message).toBe('Revisa la informacion antes de registrar la aeronave.')
  })

  it('switches to pendiente revision only after the aircraft exists', () => {
    const state = deriveAircraftWizardReviewState({
      aircraftId: 31,
      aircraftStatus: 'draft',
      validationStatus: null,
      isReadyForRegistration: true,
    })

    expect(state.key).toBe(AIRCRAFT_REVIEW_WIZARD_STATES.PENDIENTE_REVISION)
    expect(state.message).toBe('Aeronave registrada y pendiente de revision administrativa.')
  })

  it('prioritizes approved, rejected and changes requested states from aircraft data', () => {
    expect(
      deriveAircraftWizardReviewState({
        aircraftId: 31,
        aircraftStatus: 'active',
        validationStatus: 'approved',
      }).key,
    ).toBe(AIRCRAFT_REVIEW_WIZARD_STATES.APROBADA)

    expect(
      deriveAircraftWizardReviewState({
        aircraftId: 31,
        aircraftStatus: 'rejected',
        validationStatus: 'rejected',
        rejectionReason: 'Falta bitacora tecnica.',
      }).notes,
    ).toBe('Falta bitacora tecnica.')

    expect(
      deriveAircraftWizardReviewState({
        aircraftId: 31,
        aircraftStatus: 'pending_review',
        validationStatus: 'changes_required',
        changesRequestedNotes: 'Corrige la matricula y vuelve a cargar el expediente.',
      }).key,
    ).toBe(AIRCRAFT_REVIEW_WIZARD_STATES.CAMBIOS_SOLICITADOS)
  })
})
