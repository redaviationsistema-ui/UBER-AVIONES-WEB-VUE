export function normalizeRole(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function resolveUserRecord(source = {}) {
  if (source?.user && typeof source.user === 'object') return source.user
  return source && typeof source === 'object' ? source : {}
}

export function isOperatorProvider(source = {}) {
  const user = resolveUserRecord(source)
  const role = normalizeRole(user?.role?.code || user?.role?.name || user?.role)
  const operationalRole = normalizeRole(user?.operational_role || user?.operationalRole)

  return role === 'provider' && ['', 'operator', 'operador'].includes(operationalRole)
}

export function isCrewUser(source = {}) {
  const user = resolveUserRecord(source)
  const operationalRole = normalizeRole(user?.operational_role || user?.operationalRole)
  return ['sobrecargo', 'cabin_crew', 'flight_attendant'].includes(operationalRole)
}

export function isPilotUser(source = {}) {
  const user = resolveUserRecord(source)
  const operationalRole = normalizeRole(user?.operational_role || user?.operationalRole)
  return ['piloto', 'pilot'].includes(operationalRole)
}

export function isClientUser(source = {}) {
  const user = resolveUserRecord(source)
  const role = normalizeRole(user?.role?.code || user?.role?.name || user?.role)
  return role === 'client'
}
