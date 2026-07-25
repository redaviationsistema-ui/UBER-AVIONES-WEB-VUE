export function formatContractResultDate(value) {
  if (!value) return '—'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City',
  }).format(parsed)
}

export function formatContractResultStatus(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return '—'
  if (normalized === 'completed') return 'Completado'
  return value
}
