import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    postForm: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    download: vi.fn(),
  },
}))

import { api } from '../lib/api'
import { requestWithCandidates } from '../lib/backendCrud'

describe('requestWithCandidates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('tries the next equivalent route when a configured 403 should be tolerated', async () => {
    api.get
      .mockRejectedValueOnce({ status: 403, message: 'Forbidden' })
      .mockResolvedValueOnce({ success: true, aircraft: [] })

    const payload = await requestWithCandidates([
      {
        method: 'get',
        path: '/proveedor/mis-aeronaves',
        redirectOnForbidden: false,
        retryOnStatuses: [403],
      },
      {
        method: 'get',
        path: '/proveedor/aeronaves',
        redirectOnForbidden: false,
        retryOnStatuses: [403],
      },
    ])

    expect(api.get).toHaveBeenCalledTimes(2)
    expect(payload).toEqual({ success: true, aircraft: [] })
  })

  it('stops immediately on 403 when the candidate does not opt into retrying', async () => {
    api.get.mockRejectedValueOnce({ status: 403, message: 'Forbidden' })

    await expect(
      requestWithCandidates([
        { method: 'get', path: '/proveedor/mis-aeronaves' },
        { method: 'get', path: '/proveedor/aeronaves' },
      ]),
    ).rejects.toMatchObject({ status: 403 })

    expect(api.get).toHaveBeenCalledTimes(1)
  })
})
