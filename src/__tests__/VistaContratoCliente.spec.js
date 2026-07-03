/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import VistaContratoCliente from '../features/client/viajes/VistaContratoCliente.vue'

function buildReservation(overrides = {}) {
  return {
    id: 'res-25',
    flight_request_id: 'fr-161',
    reservation_code: 'PV-260703-L050JS',
    client_name: 'Jose Luis Hernandez',
    total_amount: '2931.50',
    origin: 'MMQT',
    destination: 'MMTO',
    date: '2026-07-03T15:00:00',
    aircraft_model: 'LEARJET 31A',
    contract: {
      id: 'contract-24',
      terms_snapshot: {
        document_source: 'backend_contract_snapshot',
        source_contract_path: '/cliente/reservas/res-25/contrato',
        full_contract_html: '<html><body><h1>Contrato backend</h1></body></html>',
        full_contract_text: 'Contrato backend en texto plano',
        client_contract_snapshot: {
          route: 'MMQT → Toluca (MMTO)',
          final_price: '$2,931.50 USD',
        },
      },
    },
    ...overrides,
  }
}

describe('VistaContratoCliente', () => {
  it('renders the persisted backend contract preview when html is available', () => {
    const wrapper = mount(VistaContratoCliente, {
      props: {
        reservation: buildReservation(),
        reservationId: 'res-25',
      },
    })

    const frame = wrapper.find('.backend-contract-shell__frame')

    expect(frame.exists()).toBe(true)
    expect(frame.attributes('srcdoc')).toContain('Contrato backend')
    expect(frame.attributes('srcdoc')).toContain('/sig_cliente/')
    expect(wrapper.text()).toContain('Contrato desde backend')
    expect(wrapper.text()).toContain('no traia anchor de firma DocuSign')
  })

  it('emits the persisted backend contract payload without rebuilding the frontend document', async () => {
    global.fetch = vi.fn()

    const wrapper = mount(VistaContratoCliente, {
      props: {
        reservation: buildReservation(),
        reservationId: 'res-25',
      },
    })

    await wrapper.find('.signature-panel__submit').trigger('click')

    const emittedPayload = wrapper.emitted('confirm')?.[0]?.[0]

    expect(emittedPayload.full_contract_html).toContain('Contrato backend')
    expect(emittedPayload.full_contract_html).toContain('/sig_cliente/')
    expect(emittedPayload.full_contract_text).toBe('Contrato backend en texto plano')
    expect(emittedPayload.document_source).toBe('backend_contract_snapshot_with_client_anchor')
    expect(emittedPayload.source_contract_path).toBe('/cliente/reservas/res-25/contrato')
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
