function parseOfficialNumber(value, fallback = Number.NaN) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback
  }

  if (typeof value !== 'string') {
    return fallback
  }

  const raw = value.trim()
  if (!raw) return fallback

  const sanitized = raw.replace(/[^\d,.-]/g, '')
  if (!sanitized) return fallback

  if (/^\d{1,3}(,\d{3})+$/.test(sanitized)) {
    const amount = Number(sanitized.replace(/,/g, ''))
    return Number.isFinite(amount) ? amount : fallback
  }

  if (sanitized.includes(',') && sanitized.includes('.')) {
    const normalized =
      sanitized.lastIndexOf(',') > sanitized.lastIndexOf('.')
        ? sanitized.replace(/\./g, '').replace(',', '.')
        : sanitized.replace(/,/g, '')
    const amount = Number(normalized)
    return Number.isFinite(amount) ? amount : fallback
  }

  if (sanitized.includes(',') && !sanitized.includes('.')) {
    const amount = Number(sanitized.replace(',', '.'))
    return Number.isFinite(amount) ? amount : fallback
  }

  const amount = Number(sanitized)
  return Number.isFinite(amount) ? amount : fallback
}

function getOfficialPathValue(source, path) {
  return String(path || '')
    .split('.')
    .filter(Boolean)
    .reduce((value, segment) => (value == null ? undefined : value?.[segment]), source)
}

function parseOfficialDurationText(value, fallback = Number.NaN) {
  if (typeof value !== 'string') return fallback

  const normalized = value.trim().toLowerCase()
  if (!normalized) return fallback

  const hhmmMatch = normalized.match(/^(\d{1,2}):(\d{1,2})$/)
  if (hhmmMatch) {
    const hours = Number(hhmmMatch[1] || 0)
    const minutes = Number(hhmmMatch[2] || 0)
    if (Number.isFinite(hours) && Number.isFinite(minutes)) return hours + minutes / 60
  }

  const hoursMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*h(?:oras?)?/i)
  const minutesMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*(?:m|min|mins|minutos?)/i)
  const hours = hoursMatch ? parseOfficialNumber(hoursMatch[1], 0) : 0
  const minutes = minutesMatch ? parseOfficialNumber(minutesMatch[1], 0) : 0

  if (Number.isFinite(hours) || Number.isFinite(minutes)) {
    const totalHours = (Number.isFinite(hours) ? hours : 0) + (Number.isFinite(minutes) ? minutes / 60 : 0)
    return totalHours > 0 ? totalHours : fallback
  }

  return fallback
}

export function getOfficialPricing(quote = {}) {
  return quote?.pricing_breakdown && typeof quote.pricing_breakdown === 'object'
    ? quote.pricing_breakdown
    : {}
}

export function getOfficialPricingNumber(quote = {}, paths = [], fallback = Number.NaN) {
  const pricing = getOfficialPricing(quote)

  for (const path of paths) {
    const sources = path.startsWith('pricing_breakdown.') ? [quote] : [pricing, quote]
    const key = path.replace(/^pricing_breakdown\./, '')

    for (const source of sources) {
      const amount = parseOfficialNumber(getOfficialPathValue(source, key), Number.NaN)
      if (Number.isFinite(amount)) return amount
    }
  }

  return fallback
}

export function getOfficialPricingText(quote = {}, keys = [], fallback = '') {
  const pricing = getOfficialPricing(quote)

  for (const key of keys) {
    const sources = key.startsWith('pricing_breakdown.') ? [quote] : [pricing, quote]
    const normalizedKey = key.replace(/^pricing_breakdown\./, '')

    for (const source of sources) {
      const value = getOfficialPathValue(source, normalizedKey)
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  }

  return fallback
}

export function getOfficialDisplayRouteHours(quote = {}, fallback = Number.NaN) {
  const numericPaths = [
    'pricing_breakdown.display_route_hours',
    'display_route_hours',
  ]
  const textPaths = ['trip_time', 'card_time', 'time']

  for (const path of numericPaths) {
    const numericValue = getOfficialPricingNumber(quote, [path], Number.NaN)
    if (Number.isFinite(numericValue)) return numericValue
  }

  for (const path of textPaths) {
    const textValue = getOfficialPricingText(quote, [path], '')
    const parsedHours = parseOfficialDurationText(textValue, Number.NaN)
    if (Number.isFinite(parsedHours)) return parsedHours
  }

  return fallback
}

export function formatOfficialDisplayTime(quote = {}, fallback = '') {
  const displayRouteHours = getOfficialDisplayRouteHours(quote, Number.NaN)

  if (!Number.isFinite(displayRouteHours) || displayRouteHours <= 0) {
    return fallback
  }

  const totalMinutes = Math.max(Math.round(displayRouteHours * 60), 0)
  const wholeHours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (wholeHours && minutes) return `${wholeHours} h ${String(minutes).padStart(2, '0')} min`
  if (wholeHours) return `${wholeHours} h`
  return `${minutes} min`
}

export function getOfficialOperationalFlightHours(quote = {}, fallback = Number.NaN) {
  return getOfficialPricingNumber(
    quote,
    [
      'operational_flight_hours',
      'pricing_breakdown.operational_flight_hours',
      'client_operational_flight_hours',
      'pricing_breakdown.client_operational_flight_hours',
      'route_operational_hours',
      'pricing_breakdown.route_operational_hours',
    ],
    fallback,
  )
}

export function getOfficialFinalBillableHours(quote = {}, fallback = Number.NaN) {
  return getOfficialPricingNumber(
    quote,
    [
      'final_billable_hours',
      'pricing_breakdown.final_billable_hours',
    ],
    fallback,
  )
}

export function getOfficialBillableHours(quote = {}, fallback = Number.NaN) {
  return getOfficialPricingNumber(
    quote,
    [
      'billable_hours',
      'pricing_breakdown.billable_hours',
    ],
    fallback,
  )
}

export function getOfficialTotalAmount(quote = {}, fallback = Number.NaN) {
  return getOfficialPricingNumber(
    quote,
    [
      'total_amount',
      'pricing_breakdown.total_amount',
      'total',
      'pricing_breakdown.total',
      'final_price',
      'estimated_total',
      'pricing_context.total_amount',
      'pricing_context.total',
      'pricing_context.final_price',
      'pricing.total_amount',
      'pricing.total',
    ],
    fallback,
  )
}

export function getOfficialVisibleTimeText(quote = {}, fallback = '') {
  return formatOfficialDisplayTime(quote, fallback)
}

export function hasOfficialQuotePricing(quote = {}) {
  const pricing = getOfficialPricing(quote)
  return Object.keys(pricing).length > 0 && Number.isFinite(getOfficialTotalAmount(quote, Number.NaN))
}
