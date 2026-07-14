export function resolveAircraftOperationalStatus(item = {}) {
  return String(item?.status || '')
    .trim()
    .toLowerCase()
}

export function obtenerEstadoOperativoAeronave(item = {}) {
  const status = resolveAircraftOperationalStatus(item)

  if (status === 'active') return 'active'
  if (status === 'hidden' || status === 'archived') return 'hidden'
  if (['under_review', 'pending_review', 'draft'].includes(status)) return 'under_review'
  return 'inactive'
}

export function getAircraftOperationalStatusMeta(item = {}) {
  const code = obtenerEstadoOperativoAeronave(item)

  if (code === 'active') return { code, label: 'Activa', tone: 'success' }
  if (code === 'hidden') return { code, label: 'Oculta', tone: 'info' }
  if (code === 'under_review') return { code, label: 'En revision', tone: 'warning' }
  return { code: 'inactive', label: 'Inactiva', tone: 'warning' }
}

export function isAircraftOperationallyActive(item = {}) {
  return obtenerEstadoOperativoAeronave(item) === 'active'
}

export function getAircraftOperationalTabKey(item = {}) {
  const code = obtenerEstadoOperativoAeronave(item)

  if (code === 'under_review') return 'review'
  return code
}

export function aircraftMatchesOperationalTab(item = {}, tabId = 'all') {
  if (tabId === 'all') return true
  return getAircraftOperationalTabKey(item) === String(tabId || '').trim().toLowerCase()
}

export function countAircraftByOperationalTab(collection = [], tabId = 'all') {
  return collection.filter((item) => aircraftMatchesOperationalTab(item, tabId)).length
}
