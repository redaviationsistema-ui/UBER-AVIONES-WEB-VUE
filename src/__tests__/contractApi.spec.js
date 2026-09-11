import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import { generateAndSendContract, getContractStatus, downloadSignedContractPdf } from '../services/contractApi'

vi.mock('../lib/api', () => ({ api: { post: vi.fn(), get: vi.fn(), download: vi.fn() } }))

beforeEach(() => vi.resetAllMocks())
describe('canonical contract IDs', () => {
  it('sends the reservation ID and backend-supported signing payload', async () => {
    api.post.mockResolvedValue({ envelope_id: 'env-1' })
    await generateAndSendContract({ reservation_id: '900001', flight_request_id: '41', full_contract_html: '<html/>', contract_snapshot: { price: 1 } })
    expect(api.post).toHaveBeenCalledWith('/cliente/reservas/900001/contrato/docusign', expect.objectContaining({ reservation_id: '900001', flight_request_id: '41', regenerate: false }), {})
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('full_contract_html')
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('contract_snapshot')
  })
  it('never substitutes a flight request or ambiguous ID for a reservation ID', async () => {
    for (const payload of [{ flight_request_id: '41' }, { id: '41' }]) {
      await expect(generateAndSendContract(payload)).rejects.toThrow('reservation_id')
    }
    expect(api.post).not.toHaveBeenCalled()
  })
  it('fallback retains the reservation ID and never tries retired aliases', async () => {
    api.post.mockRejectedValue({ status: 404 })
    await expect(generateAndSendContract({ reservation_id: '900001', flight_request_id: '41' })).rejects.toEqual({ status: 404 })
    expect(api.post.mock.calls.map(([path]) => path)).toEqual(['/cliente/reservas/900001/contrato/docusign', '/client/reservations/900001/contract/docusign'])
  })
  it('uses contract IDs for status and signed PDFs', async () => {
    await getContractStatus('73')
    await downloadSignedContractPdf('73')
    expect(api.get).toHaveBeenCalledWith('/cliente/contratos/73/estado', {})
    expect(api.download).toHaveBeenCalledWith('/cliente/contratos/73/pdf-firmado', {})
  })
})
