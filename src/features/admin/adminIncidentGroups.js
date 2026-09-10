import { api } from '../../lib/api'

export function incidentGroupKey(incident) {
  // Missing IDs must never merge unrelated reports.
  return JSON.stringify([
    String(incident.crew_operation_id ?? `missing-operation-${incident.id}`),
    String(incident.crew_id ?? `missing-crew-${incident.id}`),
  ])
}

export function groupIncidents(incidents) {
  const groups = new Map()
  for (const incident of incidents) {
    const key = incidentGroupKey(incident)
    if (!groups.has(key))
      groups.set(key, { key, incident, reports: [], open: 0, inReview: 0, closed: 0 })
    const group = groups.get(key)
    group.reports.push(incident)
    if (incident.status === 'open') group.open++
    if (incident.status === 'in_review') group.inReview++
    if (incident.status === 'closed') group.closed++
  }
  return [...groups.values()]
}

export function formatIncidentFlightDate(value) {
  // Preserve the operation's calendar date instead of shifting it with the browser timezone.
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return 'N/D'
  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return 'N/D'
  const parts = new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).formatToParts(date)
  const part = (type) => parts.find((item) => item.type === type)?.value || ''
  const monthLabel = part('month').replace('.', '')
  return `${part('day')} ${monthLabel.charAt(0).toUpperCase()}${monthLabel.slice(1)} ${part('year')}`
}

// Existing admin payloads: requests[].operation.id -> assigned_aircraft_id / aircraft_id;
// fleet aircraft.data[].id -> registration. No route/company/name-based matching.
export async function loadIncidentFlights(incidents) {
  const pending = new Set(
    incidents.map((item) => String(item.crew_operation_id ?? '')).filter(Boolean),
  )
  const requests = new Map()
  for (let page = 1; pending.size; page++) {
    const response = await api.get(`/admin/requests?per_page=100&skip_total=1&page=${page}`)
    for (const request of response.requests || []) {
      const id = String(request.operation?.id ?? '')
      if (!pending.has(id)) continue
      requests.set(id, request)
      pending.delete(id)
    }
    if (!response.pagination?.has_more_pages) break
  }
  const aircraftIds = new Set(
    [...requests.values()]
      .map((item) => String(item.assigned_aircraft_id || item.aircraft_id || ''))
      .filter(Boolean),
  )
  const fleet = new Map()
  for (let page = 1; aircraftIds.size; page++) {
    const response = await api.get(`/admin/fleet/aircraft?per_page=100&page=${page}`)
    for (const aircraft of response.aircraft?.data || []) {
      const id = String(aircraft.id)
      if (!aircraftIds.has(id)) continue
      fleet.set(id, aircraft)
      aircraftIds.delete(id)
    }
    if (!response.aircraft?.next_page_url) break
  }
  return Object.fromEntries(
    [...requests].map(([id, request]) => {
      const aircraft = fleet.get(String(request.assigned_aircraft_id || request.aircraft_id || ''))
      return [
        id,
        {
          flight: String(aircraft?.registration || '').trim() || 'N/D',
          departure: request.departure_datetime,
        },
      ]
    }),
  )
}

export const incidentLabels = {
  catering: 'Catering',
  cabina: 'Cabina',
  cliente: 'Cliente',
  seguridad: 'Seguridad',
  horario: 'Horario',
  coordinacion: 'Coordinacion',
  otro: 'Otro',
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  critica: 'Critica',
  open: 'Abierta',
  in_review: 'En revision',
  resolved: 'Resuelta',
  closed: 'Cerrada',
}
