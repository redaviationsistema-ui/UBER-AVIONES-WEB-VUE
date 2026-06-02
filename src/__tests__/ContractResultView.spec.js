/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ContractResultView from '../views/ContractResultView.vue'

const {
  pushMock,
  getContractStatusMock,
  clearPendingContractContextMock,
  downloadSignedContractPdfMock,
  readPendingContractContextMock,
  emitWorkflowSyncMock,
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  getContractStatusMock: vi.fn(),
  clearPendingContractContextMock: vi.fn(),
  downloadSignedContractPdfMock: vi.fn(),
  readPendingContractContextMock: vi.fn(),
  emitWorkflowSyncMock: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({
    query: {
      contract_id: 'contract-55',
      reservation_id: 'reservation-9',
    },
  }),
  useRouter: () => ({
    push: pushMock,
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
        section: 'pago',
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
