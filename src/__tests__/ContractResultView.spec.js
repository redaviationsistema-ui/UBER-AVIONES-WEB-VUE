/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ContractResultView from '../views/ContractResultView.vue'

const {
  pushMock,
  replaceMock,
  getContractStatusMock,
  clearPendingContractContextMock,
  downloadSignedContractPdfMock,
  readPendingContractContextMock,
  emitWorkflowSyncMock,
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  getContractStatusMock: vi.fn(),
  clearPendingContractContextMock: vi.fn(),
  downloadSignedContractPdfMock: vi.fn(),
  readPendingContractContextMock: vi.fn(),
  emitWorkflowSyncMock: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({
    query: {
      reservation_id: 'reservation-9',
      event: 'signing_complete',
    },
  }),
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
  }),
}))

vi.mock('../services/contractApi', () => ({
  contractApi: {
    getContractStatus: getContractStatusMock,
  },
  clearPendingContractContext: clearPendingContractContextMock,
  downloadSignedContractPdf: downloadSignedContractPdfMock,
  normalizeContractFrontendState: (payload = {}) => {
    const status = String(payload?.docusign_status || payload?.status || '').trim().toLowerCase()

    return {
      docusign_status: status,
      ui_status: status || 'generated',
      status_message:
        status === 'completed'
          ? 'El contrato ya quedo listo para continuar a pago.'
          : 'Esperando confirmacion de firma de DocuSign...',
      signed_pdf_url: String(payload?.signed_pdf_url || '').trim(),
    }
  },
  readPendingContractContext: readPendingContractContextMock,
}))

vi.mock('../lib/workflowSync', () => ({
  emitWorkflowSync: emitWorkflowSyncMock,
}))

describe('ContractResultView', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    readPendingContractContextMock.mockReturnValue({
      reservationId: 'reservation-9',
      contractId: 'contract-55',
    })
  })

  it('redirects signed contracts back into the payment step with reservation context intact', async () => {
    getContractStatusMock.mockResolvedValue({
      contract: {
        id: 'contract-55',
        docusign_status: 'completed',
      },
    })

    mount(ContractResultView)

    await flushPromises()
    await vi.runAllTimersAsync()

    expect(clearPendingContractContextMock).toHaveBeenCalledWith({
      reservationId: 'reservation-9',
      contractId: 'contract-55',
    })
    expect(emitWorkflowSyncMock).toHaveBeenCalledWith({
      scope: 'reservation-workflow',
      reservationId: 'reservation-9',
      requestId: 'reservation-9',
      nextStage: 'payment_pending',
    })
    expect(pushMock).toHaveBeenCalledWith({
      name: 'cliente-detalle',
      params: {
        section: 'historial',
        id: 'reservation-9',
      },
      query: {
        contract_signed: '1',
        contract_id: 'contract-55',
        reservation_id: 'reservation-9',
      },
    })
  })

  it('allows payment continuation when docusign returns signing_complete before backend status refreshes', async () => {
    getContractStatusMock.mockResolvedValue({
      contract: {
        id: 'contract-55',
        docusign_status: 'generated',
      },
    })

    const wrapper = mount(ContractResultView)

    await flushPromises()
    await vi.runAllTimersAsync()

    expect(getContractStatusMock).toHaveBeenCalledWith('contract-55', { timeoutMs: 30000 })
    expect(wrapper.text()).toContain('Contrato firmado correctamente.')
    expect(pushMock).toHaveBeenCalledWith({
      name: 'cliente-detalle',
      params: {
        section: 'historial',
        id: 'reservation-9',
      },
      query: {
        contract_signed: '1',
        contract_id: 'contract-55',
        reservation_id: 'reservation-9',
      },
    })
  })

  it('treats a contract with signed pdf available as completed even if docusign_status lags behind', async () => {
    getContractStatusMock.mockResolvedValue({
      contract: {
        id: 'contract-55',
        docusign_status: 'sent',
        signed_pdf_url: 'https://example.com/contracts/contract-55-signed.pdf',
      },
    })

    const wrapper = mount(ContractResultView)

    await flushPromises()
    await vi.runAllTimersAsync()

    expect(wrapper.text()).toContain('Contrato firmado correctamente.')
    expect(pushMock).toHaveBeenCalledWith({
      name: 'cliente-detalle',
      params: {
        section: 'historial',
        id: 'reservation-9',
      },
      query: {
        contract_signed: '1',
        contract_id: 'contract-55',
        reservation_id: 'reservation-9',
      },
    })
  })
})
