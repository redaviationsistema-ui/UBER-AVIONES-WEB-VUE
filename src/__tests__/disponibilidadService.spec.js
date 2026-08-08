import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requestWithCandidates } = vi.hoisted(() => ({
  requestWithCandidates: vi.fn(),
}))

vi.mock('../lib/backendCrud', async (importOriginal) => {
  const actual = await importOriginal()

  return {
    ...actual,
    requestWithCandidates,
  }
})

import { fetchAvailableCrewByRange } from '../services/disponibilidadService'

describe('fetchAvailableCrewByRange', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('preserves crew returned by backend even when their base differs from the requested base', async () => {
    requestWithCandidates.mockResolvedValueOnce({
      crew_members: [
        {
          id: 18,
          name: 'Jimena Alvarez Mejia',
          base_airport: 'MMTO',
          availability: [{ fecha: '2026-08-07', clave: 'POR_CONFIRMAR', permite_asignacion: false }],
        },
        {
          id: 17,
          name: 'VALERIA GARCIA RAMIREZ',
          base_airport: 'MMTO',
          availability: [{ fecha: '2026-08-07', clave: 'POR_CONFIRMAR', permite_asignacion: false }],
        },
      ],
    })

    const crew = await fetchAvailableCrewByRange({
      from: '2026-08-07',
      to: '2026-08-07',
      base: 'MMJC',
    })

    expect(requestWithCandidates).toHaveBeenCalledWith([
      {
        method: 'get',
        path: '/admin/sobrecargos/disponibilidad',
        query: {
          from: '2026-08-07',
          to: '2026-08-07',
          include_statuses: 0,
          base: 'MMJC',
        },
      },
    ])
    expect(crew.map((member) => ({ id: member.id, base: member.base }))).toEqual([
      { id: 18, base: 'MMTO' },
      { id: 17, base: 'MMTO' },
    ])
  })

  it('returns an empty array when the backend answers 200 with no crew data', async () => {
    requestWithCandidates.mockResolvedValueOnce({
      crew_members: [],
    })

    await expect(
      fetchAvailableCrewByRange({
        from: '2026-08-07',
        to: '2026-08-07',
        base: 'MMJC',
      }),
    ).resolves.toEqual([])
  })
})
