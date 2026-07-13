import { describe, expect, it } from 'vitest'

import { vi } from 'vitest'

vi.mock('../plugins/echo', () => ({
  echo: null,
  isEchoConfigured: () => false,
  syncEchoAuthToken: () => {},
}))

import {
  AIRCRAFT_WIZARD_ROUTE_CREATE_VALUE,
  AIRCRAFT_WIZARD_ROUTE_QUERY_KEY,
  hasCreateAircraftWizardIntent,
  normalizeAircraftWizardRouteMode,
  removeAircraftWizardRouteIntent,
} from '../features/operator/portal/portalOperador.nucleo.js'

describe('operator aircraft wizard route intent', () => {
  it('normalizes the route mode safely', () => {
    expect(normalizeAircraftWizardRouteMode(null)).toBe('')
    expect(normalizeAircraftWizardRouteMode(undefined)).toBe('')
    expect(normalizeAircraftWizardRouteMode(' New ')).toBe('new')
  })

  it('detects only the create intent inside aeronaves', () => {
    expect(
      hasCreateAircraftWizardIntent('aeronaves', {
        [AIRCRAFT_WIZARD_ROUTE_QUERY_KEY]: AIRCRAFT_WIZARD_ROUTE_CREATE_VALUE,
      }),
    ).toBe(true)

    expect(
      hasCreateAircraftWizardIntent('dashboard', {
        [AIRCRAFT_WIZARD_ROUTE_QUERY_KEY]: AIRCRAFT_WIZARD_ROUTE_CREATE_VALUE,
      }),
    ).toBe(false)

    expect(
      hasCreateAircraftWizardIntent('aeronaves', {
        [AIRCRAFT_WIZARD_ROUTE_QUERY_KEY]: 'edit',
      }),
    ).toBe(false)
  })

  it('removes the wizard intent without touching the rest of the query', () => {
    expect(
      removeAircraftWizardRouteIntent({
        [AIRCRAFT_WIZARD_ROUTE_QUERY_KEY]: AIRCRAFT_WIZARD_ROUTE_CREATE_VALUE,
        aircraft_id: '18',
        tab: 'fleet',
      }),
    ).toEqual({
      aircraft_id: '18',
      tab: 'fleet',
    })
  })
})
