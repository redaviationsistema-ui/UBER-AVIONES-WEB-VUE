export function normalizeToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
}

export function includesAny(value = '', tokens = []) {
  const normalized = normalizeToken(value)
  return tokens.some((token) => normalized.includes(token))
}

export function normalizeOperationalState(value = '') {
  const normalized = normalizeToken(value)
  if (!normalized) return ''
  if (['available', 'active', 'activo', 'disponible'].includes(normalized)) return 'Disponible'
  if (['rest', 'descanso'].includes(normalized)) return 'Descanso'
  if (['en vuelo', 'in flight', 'vuelo'].includes(normalized)) return 'En vuelo'
  if (['assigned', 'asignado'].includes(normalized)) return 'Asignado'
  if (normalized.includes('suspend') || normalized.includes('bloq') || normalized.includes('block')) return 'Suspendido'
  if (['inactive', 'inactivo', 'unavailable', 'no disponible'].includes(normalized)) return 'No disponible'
  return value
}

export function toneClass(value = '') {
  const normalized = normalizeToken(normalizeOperationalState(value) || value)

  if (
    normalized.includes('no disponible') ||
    normalized.includes('rech') ||
    normalized.includes('suspend') ||
    normalized.includes('bloq') ||
    normalized.includes('block') ||
    normalized.includes('alert')
  ) {
    return 'chip-danger'
  }

  if (normalized.includes('descanso') || normalized.includes('rest')) return 'chip-warning'

  if (
    normalized.includes('asignad') ||
    normalized.includes('operacion') ||
    normalized.includes('vuelo') ||
    normalized.includes('tracking')
  ) {
    return 'chip-info'
  }

  if (
    normalized.includes('pend') ||
    normalized.includes('revision') ||
    normalized.includes('cambio') ||
    normalized.includes('venc')
  ) {
    return 'chip-warning'
  }

  if (
    normalized.includes('aprob') ||
    normalized.includes('confirm') ||
    normalized.includes('completa') ||
    normalized.includes('disponible') ||
    normalized.includes('activo')
  ) {
    return 'chip-success'
  }

  return 'chip-neutral'
}

export function certificationTone(value = '') {
  const normalized = normalizeToken(value)
  if (!normalized || normalized.includes('pend') || normalized.includes('venc')) return 'chip-danger'
  if (normalized.includes('complet') || normalized.includes('vigent') || normalized.includes('ok')) {
    return 'chip-success'
  }
  return 'chip-warning'
}

export function formatShortDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10)
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

export function humanizeStatus(value = '') {
  const normalizedState = normalizeOperationalState(value)
  if (normalizedState) return normalizedState
  const normalized = normalizeToken(value)
  if (!normalized) return ''
  if (normalized === 'pending crew response') return 'Sin responder'
  if (normalized === 'crew confirmed') return 'Confirmado'
  if (normalized === 'crew declined') return 'Rechazado'
  if (normalized === 'crew change requested') return 'Solicita cambio'
  if (normalized === 'crew enroute') return 'En traslado'
  if (normalized === 'crew active') return 'En servicio'
  if (normalized === 'crew completed') return 'Finalizado'
  if (normalized === 'crew incident reported') return 'Con incidencia'
  if (normalized === 'pending') return 'Pendiente'
  if (normalized === 'approved') return 'Aprobado'
  if (normalized === 'rejected') return 'Rechazado'
  if (normalized === 'suspended') return 'Suspendido'
  if (normalized === 'available') return 'Disponible'
  if (normalized === 'inactive') return 'Inactivo'
  if (normalized === 'no disponible') return 'No disponible'
  return value
}

export function fallbackLabel(value = '', emptyLabel = 'Sin asignar') {
  return String(value || '').trim() || emptyLabel
}

export function ratingNumber(value = '') {
  const parsed = Number.parseFloat(String(value || '').replace(/[^\d.]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function certificationLabel(member = {}) {
  const raw = member.certifications || member.documentsSummary || ''
  const normalized = normalizeToken(raw)
  if (!normalized) return ''
  if (normalized.includes('venc')) return 'Certificaciones vencidas'
  if (normalized.includes('complet') || normalized.includes('vigent')) return 'Expediente completo'
  if (normalized.includes('pend')) return 'Expediente incompleto'
  return raw
}

export function buildCrewAlerts(member = {}, helpers = {}) {
  const alerts = []
  const certifications = normalizeToken(certificationLabel(member))

  if (helpers.isPendingValidation?.(member)) alerts.push('Requiere validacion administrativa')
  if (certifications.includes('venc')) alerts.push('Certificacion vencida')
  if (certifications.includes('incompleto') || certifications.includes('sin expediente')) {
    alerts.push('Expediente incompleto')
  }
  if (!String(member.base || '').trim()) alerts.push('Sin base asignada')
  if (helpers.isSuspended?.(member)) alerts.push('Sobrecargo suspendido')
  if (
    ['No disponible', 'Descanso'].includes(normalizeOperationalState(member.state || member.operationalState || '')) &&
    !helpers.isAssigned?.(member) &&
    helpers.isApproved?.(member)
  ) {
    alerts.push('No disponible hoy')
  }

  return alerts
}
