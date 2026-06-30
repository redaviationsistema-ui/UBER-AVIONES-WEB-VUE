export function formatDateTimeRange(value = '') {
  if (!value) return 'Sin fecha'
  const normalized = String(value)
  if (!/\d{4}-\d{2}-\d{2}/.test(normalized)) return normalized
  return normalized.replace('T', ' ').slice(0, 16)
}

export function startOfAvailabilityWeek(date = new Date()) {
  const baseDate = new Date(date)
  baseDate.setHours(0, 0, 0, 0)
  const day = baseDate.getDay()
  const diff = day === 0 ? -6 : 1 - day
  baseDate.setDate(baseDate.getDate() + diff)
  return baseDate
}

export function addDays(date, amount) {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + amount)
  return nextDate
}

export function startOfAvailabilityDay(date) {
  const value = new Date(date)
  value.setHours(0, 0, 0, 0)
  return value
}

export function endOfAvailabilityDay(date) {
  const value = new Date(date)
  value.setHours(23, 59, 59, 999)
  return value
}

export function isSameAvailabilityDay(firstDate, secondDate) {
  return startOfAvailabilityDay(firstDate).getTime() === startOfAvailabilityDay(secondDate).getTime()
}

export function formatDateTimeDisplay(value = '') {
  if (!value) return 'Sin fecha'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return formatDateTimeRange(value)
  }

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City',
  }).format(parsed)
}

export function formatDateCompact(value = '') {
  if (!value) return 'Sin fecha'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return formatDateTimeRange(value).slice(0, 10) || String(value)
  }

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Mexico_City',
  }).format(parsed)
}

export function formatOperationalTimelineTime(value = '') {
  if (!value) return '--:--'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    const match = String(value).match(/\b([01]?\d|2[0-3]):[0-5]\d\b/)
    return match?.[0] || String(value).slice(0, 5) || '--:--'
  }

  return new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Mexico_City',
  }).format(parsed)
}

export function formatRelativeAccessLabel(value = '') {
  if (!value) return 'Hoy'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Hoy'

  const now = new Date()
  const sameDay =
    parsed.getDate() === now.getDate() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getFullYear() === now.getFullYear()

  const timeLabel = new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Mexico_City',
  }).format(parsed)

  return sameDay ? `Hoy ${timeLabel}` : `${formatDateCompact(parsed.toISOString())} ${timeLabel}`
}

export function formatCurrency(value, currency = 'MXN') {
  const numericValue =
    typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.-]+/g, ''))

  if (!Number.isFinite(numericValue)) {
    return value || 'Pendiente'
  }

  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: String(currency || 'MXN').toUpperCase(),
    maximumFractionDigits: 0,
  }).format(numericValue)
}

export function formatDocumentExpiry(value = '') {
  if (!value) return 'Sin vencimiento'
  return String(value).slice(0, 10)
}

export function formatFileSize(bytes = 0) {
  const value = Number(bytes || 0)
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  if (value >= 1024) return `${Math.round(value / 1024)} KB`
  return `${value} B`
}

export function normalizeAvailabilityStatusForBackend(status = '') {
  const normalized = String(status).toLowerCase()

  if (['disponible', 'available'].includes(normalized)) return 'available'
  if (['no disponible', 'unavailable', 'blocked'].includes(normalized)) return 'blocked'
  if (['en mantenimiento', 'maintenance'].includes(normalized)) return 'maintenance'
  if (['reservado', 'reserved', 'occupied'].includes(normalized)) return 'occupied'
  if (
    ['pendiente de confirmacion', 'pending confirmation', 'pending_confirmation'].includes(
      normalized,
    )
  ) {
    return 'blocked'
  }

  return 'blocked'
}

export function toDateTimeLocalValue(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const pad = (part) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
