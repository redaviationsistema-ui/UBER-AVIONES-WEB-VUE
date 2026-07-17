export function normalizeAdminAircraftStatus(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function isProviderApprovedForAdminAircraft(aircraft = {}) {
  const provider = aircraft?.provider

  if (!provider) return false
  if (provider.is_approved === true) return true

  const status = normalizeAdminAircraftStatus(
    provider.approval_status ??
      provider.admin_validation_status ??
      provider.status ??
      aircraft.provider_status ??
      '',
  )

  return ['approved', 'active', 'aprobado', 'aprobada'].includes(status)
}

export function isAdminAircraftApproved(aircraft = {}) {
  if (aircraft?.approval?.is_approved === true) return true
  if (aircraft?.approved === true) return true
  if (aircraft?.approved_at || aircraft?.approvedAt) return true

  const status = normalizeAdminAircraftStatus(
    aircraft?.approval?.status ??
      aircraft?.review_status ??
      aircraft?.validation_status ??
      aircraft?.approval_status ??
      '',
  )

  return ['approved', 'active', 'aprobado', 'aprobada'].includes(status)
}

export function isAdminAircraftActive(aircraft = {}) {
  if (aircraft?.operational?.is_active === true) return true
  if (aircraft?.activation?.is_active === true) return true
  if (aircraft?.is_active === true) return true

  const status = normalizeAdminAircraftStatus(
    aircraft?.operational?.status ??
      aircraft?.operational_status ??
      aircraft?.status ??
      '',
  )

  return ['active', 'activa'].includes(status)
}

export function resolvePrimaryAdminAircraftAction(aircraft = {}) {
  if (!isProviderApprovedForAdminAircraft(aircraft)) return 'approve_provider'
  if (!isAdminAircraftApproved(aircraft)) return 'approve_aircraft'
  if (!isAdminAircraftActive(aircraft)) return 'activate_aircraft'
  return 'deactivate_aircraft'
}
