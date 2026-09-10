import { beforeEach, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import {
  groupIncidents,
  formatIncidentFlightDate,
  loadIncidentFlights,
} from '../features/admin/adminIncidentGroups'
vi.mock('../lib/api', () => ({ api: { get: vi.fn() } }))
beforeEach(() => vi.resetAllMocks())
it('groups by operation and crew IDs, never by shared names or route', () => {
  const base = {
    crew_operation_id: 46,
    crew_id: 8,
    operation_route: 'MMTO - MMQT',
    crew_name: 'Jimena',
  }
  const groups = groupIncidents([
    { ...base, id: 15, status: 'open' },
    { ...base, id: 16, status: 'in_review' },
    { ...base, id: 17, status: 'closed' },
    { ...base, id: 18, status: 'resolved' },
    { ...base, id: 19, crew_operation_id: 52, status: 'open' },
    { ...base, id: 20, crew_id: 9, status: 'open' },
  ])
  expect(groups).toHaveLength(3)
  expect(groups[0]).toMatchObject({ open: 1, inReview: 1, closed: 1 })
  expect(groups[0].reports).toHaveLength(4)
  expect(groupIncidents([{ id: 1 }, { id: 2 }])).toHaveLength(2)
})
it('formats the operation calendar date and handles absent or invalid dates', () => {
  expect(formatIncidentFlightDate('2026-09-10T00:00:00Z')).toBe('10 Sep 2026')
  expect(formatIncidentFlightDate(null)).toBe('N/D')
  expect(formatIncidentFlightDate('2026-02-30')).toBe('N/D')
})
it('joins real operation and aircraft IDs across pages, prioritizing assigned aircraft', async () => {
  api.get
    .mockResolvedValueOnce({
      requests: [{ operation: { id: 99 }, assigned_aircraft_id: 9 }],
      pagination: { has_more_pages: true },
    })
    .mockResolvedValueOnce({
      requests: [
        {
          operation: { id: 46 },
          assigned_aircraft_id: 7,
          aircraft_id: 9,
          departure_datetime: '2026-09-10',
        },
      ],
      pagination: { has_more_pages: false },
    })
    .mockResolvedValueOnce({
      aircraft: { data: [{ id: 9, registration: 'UNRELATED' }], next_page_url: '/next' },
    })
    .mockResolvedValueOnce({
      aircraft: { data: [{ id: 7, registration: 'XA-VEE' }], next_page_url: null },
    })
  const result = await loadIncidentFlights([{ crew_operation_id: 46 }, { crew_operation_id: 46 }])
  expect(result).toEqual({ 46: { flight: 'XA-VEE', departure: '2026-09-10' } })
  expect(api.get).toHaveBeenCalledTimes(4)
})
it('uses N/D when the associated aircraft has no registration', async () => {
  api.get
    .mockResolvedValueOnce({ requests: [{ operation: { id: 46 }, aircraft_id: 7 }] })
    .mockResolvedValueOnce({ aircraft: { data: [{ id: 7, registration: null }] } })
  expect((await loadIncidentFlights([{ crew_operation_id: 46 }]))[46].flight).toBe('N/D')
})
