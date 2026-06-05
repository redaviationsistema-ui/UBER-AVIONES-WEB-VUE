export function toDateKey(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDays(value, amount) {
  const date = value instanceof Date ? new Date(value) : new Date(value)
  date.setDate(date.getDate() + amount)
  return date
}

export function normalizeToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
}

export function normalizeState(value = '') {
  const normalized = normalizeToken(value)
  if (!normalized) return 'Disponible'
  if (normalized.includes('oper') || normalized.includes('vuelo') || normalized.includes('asignad')) return 'En operacion'
  if (normalized.includes('desc')) return 'Descanso'
  if (normalized.includes('aprob')) return 'Bloqueo aprobado'
  if (normalized.includes('solicit') || normalized.includes('pend')) return 'Bloqueo solicitado'
  if (normalized.includes('no disponible') || normalized.includes('inactivo') || normalized.includes('suspend')) {
    return 'No disponible'
  }
  return value
}

export function toneClass(state = '') {
  const normalized = normalizeToken(state)
  if (normalized.includes('oper')) return 'tone-operation'
  if (normalized.includes('desc')) return 'tone-rest'
  if (normalized.includes('solicit') || normalized.includes('pend')) return 'tone-pending'
  if (normalized.includes('aprob')) return 'tone-approved'
  if (normalized.includes('no disponible')) return 'tone-unavailable'
  return 'tone-available'
}
