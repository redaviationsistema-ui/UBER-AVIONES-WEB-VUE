function normalizeAircraftStatusToken(value = '') {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

export function resolveAircraftOperationalStatus(item = {}) {
  const activationState =
    item?.activation && typeof item.activation === 'object'
      ? item.activation
      : item?.aircraft_state?.activation && typeof item.aircraft_state.activation === 'object'
        ? item.aircraft_state.activation
        : item?.aircraftState?.activation && typeof item.aircraftState.activation === 'object'
          ? item.aircraftState.activation
          : null

  const statusCandidates = [
    item?.operationalStatus,
    item?.operational_status,
    activationState?.operational_status,
    activationState?.status,
    item?.status,
    item?.availability,
    item?.availability_status,
  ]
    .map((value) => normalizeAircraftStatusToken(value))
    .filter(Boolean)

  const reviewStatus = normalizeAircraftStatusToken(
    item?.reviewStatus ||
      item?.review_status ||
      item?.validationStatus ||
      item?.validation_status ||
      item?.approvalStatus ||
      item?.approval_status,
  )
  const commercialStatus = normalizeAircraftStatusToken(
    item?.commercialStatus ||
      item?.commercial_status ||
      activationState?.commercial_status,
  )
  const isExplicitlyActive =
    item?.isActive === true ||
    item?.is_active === true ||
    activationState?.is_active === true
  const isCommerciallyEnabled =
    commercialStatus === 'active' ||
    item?.ready_to_book === true ||
    item?.readyToBook === true ||
    item?.ready_to_quote === true ||
    item?.readyToQuote === true ||
    item?.is_reservable === true ||
    item?.isReservable === true ||
    item?.is_quotable === true ||
    item?.isQuotable === true

  if (isExplicitlyActive || isCommerciallyEnabled) return 'active'
  if (statusCandidates.some((status) => status === 'hidden' || status === 'archived')) return 'hidden'
  if (
    [reviewStatus, commercialStatus, ...statusCandidates].some((status) =>
      ['under_review', 'pending_review', 'draft', 'submitted', 'review'].includes(status),
    )
  ) {
    return 'under_review'
  }
  if (
    [commercialStatus, ...statusCandidates].some((status) =>
      status.includes('block') || status.includes('suspend'),
    )
  ) {
    return 'inactive'
  }

  return statusCandidates[0] || ''
}

export function obtenerEstadoOperativoAeronave(item = {}) {
  const status = resolveAircraftOperationalStatus(item)

  if (status === 'active' || status === 'activa') return 'active'
  if (status === 'hidden' || status === 'archived') return 'hidden'
  if (['under_review', 'pending_review', 'draft', 'submitted', 'review'].includes(status)) return 'under_review'
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
