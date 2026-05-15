function pickFirstValue(...values) {
  return values.find((value) => typeof value === 'string' && value.trim()) || ''
}

function compact(parts) {
  return parts.filter(Boolean)
}

export const featuredAirports = [
  { code: 'MMMX', iata: 'MEX', name: 'Aeropuerto Internacional Benito Juarez', city: 'Ciudad de Mexico', country: 'Mexico', climb_descent_adjustment_minutes: 10 },
  { code: 'MMTO', iata: 'TLC', name: 'Aeropuerto Internacional de Toluca', city: 'Toluca', country: 'Mexico', climb_descent_adjustment_minutes: 5 },
  { code: 'MMMY', iata: 'MTY', name: 'Aeropuerto Internacional de Monterrey', city: 'Monterrey', country: 'Mexico', climb_descent_adjustment_minutes: 0 },
  { code: 'MMGL', iata: 'GDL', name: 'Aeropuerto Internacional de Guadalajara', city: 'Guadalajara', country: 'Mexico', climb_descent_adjustment_minutes: 0 },
  { code: 'MMSD', iata: 'SJD', name: 'Aeropuerto Internacional de Los Cabos', city: 'Los Cabos', country: 'Mexico', climb_descent_adjustment_minutes: 5 },
  { code: 'MMUN', iata: 'CUN', name: 'Aeropuerto Internacional de Cancun', city: 'Cancun', country: 'Mexico', climb_descent_adjustment_minutes: 0 },
  { code: 'MMPR', iata: 'PVR', name: 'Aeropuerto Internacional Lic. Gustavo Diaz Ordaz', city: 'Puerto Vallarta', country: 'Mexico', climb_descent_adjustment_minutes: 0 },
  { code: 'MMZH', iata: 'ZIH', name: 'Aeropuerto Internacional de Ixtapa-Zihuatanejo', city: 'Zihuatanejo', country: 'Mexico', climb_descent_adjustment_minutes: 0 },
  { code: 'MMSP', iata: 'SLP', name: 'Aeropuerto Internacional de San Luis Potosi', city: 'San Luis Potosi', country: 'Mexico', climb_descent_adjustment_minutes: 0 },
  { code: 'KOPF', iata: 'OPF', name: 'Miami-Opa Locka Executive Airport', city: 'Miami', country: 'Estados Unidos', climb_descent_adjustment_minutes: 0 },
  { code: 'KMIA', iata: 'MIA', name: 'Miami International Airport', city: 'Miami', country: 'Estados Unidos', climb_descent_adjustment_minutes: 0 },
  { code: 'KTEB', iata: 'TEB', name: 'Teterboro Airport', city: 'Nueva York', country: 'Estados Unidos', climb_descent_adjustment_minutes: 0 },
  { code: 'KLAX', iata: 'LAX', name: 'Los Angeles International Airport', city: 'Los Angeles', country: 'Estados Unidos', climb_descent_adjustment_minutes: 0 },
  { code: 'KLAS', iata: 'LAS', name: 'Harry Reid International Airport', city: 'Las Vegas', country: 'Estados Unidos', climb_descent_adjustment_minutes: 0 },
]

function normalizeTerm(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export function searchFeaturedAirports(query, limit = 6) {
  const term = normalizeTerm(query)

  if (!term) {
    return featuredAirports.slice(0, limit)
  }

  return featuredAirports
    .map((airport) => {
      const haystack = normalizeTerm(
        `${airport.city} ${airport.name} ${airport.iata} ${airport.code} ${airport.country}`,
      )
      const startsWithCode = [airport.iata, airport.code].some((value) =>
        normalizeTerm(value).startsWith(term),
      )
      const startsWithCity = normalizeTerm(airport.city).startsWith(term)
      const contains = haystack.includes(term)

      let score = 0
      if (startsWithCode) score += 4
      if (startsWithCity) score += 3
      if (contains) score += 1

      return { airport, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((entry) => entry.airport)
}

export function formatAirportOption(airport) {
  const primaryCode = airport?.iata || airport?.code || ''
  return `${airport?.city || airport?.name || 'Aeropuerto'} (${primaryCode})`
}

export function mapAirportPayload(payload = {}) {
  return {
    code: pickFirstValue(payload.code, payload.icao, payload.icao_code),
    iata: pickFirstValue(payload.iata, payload.iata_code),
    name: pickFirstValue(payload.name),
    city: pickFirstValue(payload.city),
    country: pickFirstValue(payload.country),
    climb_descent_adjustment_minutes: Number(
      payload.climb_descent_adjustment_minutes || payload.climbDescentAdjustmentMinutes || 0,
    ) || 0,
  }
}

export function resolveAirportData(entity, side) {
  const airport =
    entity?.[`${side}_airport`] ||
    entity?.[`${side}Airport`] ||
    entity?.[`${side}_details`] ||
    entity?.[`${side}Details`] ||
    null

  const code = pickFirstValue(
    airport?.iata,
    airport?.iata_code,
    entity?.[`${side}_iata`],
    entity?.[`${side}_iata_code`],
    airport?.icao,
    airport?.icao_code,
    entity?.[`${side}_icao`],
    entity?.[`${side}_icao_code`],
    entity?.[side],
  )

  const name = pickFirstValue(
    airport?.name,
    entity?.[`${side}_airport_name`],
    entity?.[`${side}AirportName`],
    entity?.[`${side}_name`],
  )

  const city = pickFirstValue(
    airport?.city,
    entity?.[`${side}_airport_city`],
    entity?.[`${side}AirportCity`],
    entity?.[`${side}_city`],
  )

  const country = pickFirstValue(
    airport?.country,
    entity?.[`${side}_airport_country`],
    entity?.[`${side}AirportCountry`],
    entity?.[`${side}_country`],
  )

  const climbDescentAdjustmentMinutes = Number(
    airport?.climb_descent_adjustment_minutes ||
      airport?.climbDescentAdjustmentMinutes ||
      entity?.[`${side}_airport_climb_descent_adjustment_minutes`] ||
      entity?.[`${side}AirportClimbDescentAdjustmentMinutes`] ||
      0,
  ) || 0

  return { code, name, city, country, climb_descent_adjustment_minutes: climbDescentAdjustmentMinutes }
}

export function formatAirportLabel(entity, side) {
  const airport = resolveAirportData(entity, side)
  const location = compact([airport.city, airport.name]).join(' / ')

  if (location && airport.code) return `${location} (${airport.code})`
  if (location) return location
  return airport.code || 'Pendiente'
}

export function formatAirportRoute(entity) {
  return `${formatAirportLabel(entity, 'origin')} -> ${formatAirportLabel(entity, 'destination')}`
}
