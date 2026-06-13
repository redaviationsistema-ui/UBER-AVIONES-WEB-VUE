import { pickCollection, pickRecord, requestWithCandidates } from '../lib/backendCrud'

const FALLBACK_STATUS_CATALOG = [
  { id: 'DISPONIBLE', clave: 'DISPONIBLE', nombre: 'Disponible', color: '#22c55e', permite_asignacion: true },
  { id: 'DESCANSO', clave: 'DESCANSO', nombre: 'Descanso', color: '#94a3b8', permite_asignacion: false },
  { id: 'NO_DISPONIBLE', clave: 'NO_DISPONIBLE', nombre: 'No disponible', color: '#ef4444', permite_asignacion: false },
  { id: 'BLOQUEO_SOLICITADO', clave: 'BLOQUEO_SOLICITADO', nombre: 'Bloqueo solicitado', color: '#facc15', permite_asignacion: false },
  { id: 'BLOQUEO_APROBADO', clave: 'BLOQUEO_APROBADO', nombre: 'Bloqueo aprobado', color: '#a855f7', permite_asignacion: false },
  { id: 'EN_OPERACION', clave: 'EN_OPERACION', nombre: 'En operacion', color: '#3b82f6', permite_asignacion: false },
  { id: 'POR_CONFIRMAR', clave: 'POR_CONFIRMAR', nombre: 'Por confirmar', color: '#d6b98c', permite_asignacion: false },
]

export function normalizeAvailabilityStatusKey(value = '') {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')

  if (!normalized) return 'DISPONIBLE'
  if (['EN_OPERACION', 'EN_VUELO', 'OPERACION'].includes(normalized)) return 'EN_OPERACION'
  if (['NO_DISPONIBLE', 'INACTIVO', 'BLOCKED'].includes(normalized)) return 'NO_DISPONIBLE'
  if (['BLOQUEO', 'PENDIENTE'].includes(normalized)) return 'BLOQUEO_SOLICITADO'
  return normalized
}

export function humanizeAvailabilityStatusKey(key = '') {
  const normalized = normalizeAvailabilityStatusKey(key)
  if (normalized === 'DISPONIBLE') return 'Disponible'
  if (normalized === 'NO_DISPONIBLE') return 'No disponible'
  if (normalized === 'DESCANSO') return 'Descanso'
  if (normalized === 'EN_OPERACION') return 'En operacion'
  if (normalized === 'BLOQUEO_SOLICITADO') return 'Bloqueo solicitado'
  if (normalized === 'BLOQUEO_APROBADO') return 'Bloqueo aprobado'
  if (normalized === 'BLOQUEO_RECHAZADO') return 'Bloqueo rechazado'
  if (normalized === 'POR_CONFIRMAR') return 'Por confirmar'
  return key
}

export function normalizeAvailabilityStatusCatalog(payload) {
  const collection = pickCollection(payload, ['statuses', 'estatuses', 'catalog', 'catalogo', 'data', 'items'])
  const source = collection.length ? collection : FALLBACK_STATUS_CATALOG

  return source.map((item) => {
    const key = normalizeAvailabilityStatusKey(item.clave || item.status || item.id || item.nombre)
    return {
      ...item,
      id: item.id || key,
      clave: key,
      status: key,
      nombre: item.nombre || humanizeAvailabilityStatusKey(key),
      color: item.color || FALLBACK_STATUS_CATALOG.find((status) => status.clave === key)?.color || '#94a3b8',
      seleccionable_sobrecargo: item.seleccionable_sobrecargo ?? item.selectable_crew ?? true,
      seleccionable_admin: item.seleccionable_admin ?? item.selectable_admin ?? true,
      permite_asignacion:
        item.permite_asignacion ?? FALLBACK_STATUS_CATALOG.find((status) => status.clave === key)?.permite_asignacion ?? false,
    }
  })
}

export function buildAvailabilityColorMap(statusCatalog = []) {
  return Object.fromEntries(
    statusCatalog.map((item) => [normalizeAvailabilityStatusKey(item.clave || item.status || item.id), item.color || '']),
  )
}

export function normalizeAvailabilityRecord(raw = {}, statusCatalog = []) {
  const statusId = raw.estatus_id || raw.status_id || raw.availability_status_id || null
  const persistedId = raw.id ?? null
  const statusDefinitionById =
    statusCatalog.find((item) => String(item.id || item.estatus_id || '') === String(statusId || '')) || null
  const statusKey = normalizeAvailabilityStatusKey(
    raw.clave ||
      raw.status_key ||
      raw.status ||
      raw.availability_status ||
      raw.state ||
      raw.nombre ||
      statusDefinitionById?.clave ||
      statusDefinitionById?.status ||
      statusDefinitionById?.nombre ||
      '',
  )
  const statusDefinition =
    statusDefinitionById ||
    statusCatalog.find((item) => normalizeAvailabilityStatusKey(item.clave || item.status || item.id) === statusKey) ||
    null

  return {
    id: persistedId || `${raw.crew_id || raw.sobrecargo_user_id || 'availability'}-${raw.fecha || raw.from || raw.starts_at || ''}`,
    recordId: persistedId,
    isPersisted: persistedId != null,
    crewId: raw.crew_id || raw.sobrecargo_id || raw.sobrecargo_user_id || raw.user_id || raw.member_id || null,
    from: raw.from || raw.fecha || raw.starts_at || raw.start_datetime || '',
    to: raw.to || raw.fecha || raw.ends_at || raw.end_datetime || raw.from || raw.fecha || '',
    date: raw.fecha || raw.from || raw.starts_at || raw.start_datetime || '',
    statusId: statusId || statusDefinition?.id || null,
    state: raw.state || raw.nombre || statusDefinition?.nombre || humanizeAvailabilityStatusKey(statusKey),
    statusKey,
    base: raw.base || raw.city || '',
    coverage: raw.coverage || raw.zone || '',
    comment: raw.comentario || raw.comment || raw.notes || '',
    restriction: raw.restriction || raw.comentario || raw.reason || raw.notes || '',
    reason: raw.motivo || raw.reason || '',
    color: raw.color || statusDefinition?.color || '',
    icon: raw.icono || statusDefinition?.icono || '',
    allowsAssignment: Boolean(raw.permite_asignacion ?? statusDefinition?.permite_asignacion),
    origin: raw.origen || '',
    createdBy: raw.created_by_nombre || raw.created_by_name || raw.updated_by_name || '',
    auditDate: raw.audit_date || raw.updated_at || raw.created_at || '',
  }
}

function getStatusCandidates(scope = 'crew') {
  if (scope === 'admin') {
    return [
      {
        method: 'get',
        path: '/admin/sobrecargos/disponibilidad',
        query: { from: new Date().toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) },
      },
    ]
  }

  return [
      { method: 'get', path: '/sobrecargo/availability/statuses' },
  ]
}

function getCalendarCandidates(scope = 'crew', query = {}, crewId = null, includeStatuses = true) {
  if (scope === 'admin') {
    return [
      {
        method: 'get',
        path: '/admin/sobrecargos/disponibilidad',
        query: {
          ...query,
          crew_id: crewId || undefined,
          include_statuses: includeStatuses ? undefined : 0,
        },
      },
    ]
  }

  return [
    { method: 'get', path: '/sobrecargo/availability', query },
  ]
}

function getSaveCandidates(scope = 'crew', body = {}, crewId = null) {
  if (scope === 'admin') {
    return [
      { method: 'post', path: '/admin/sobrecargos/disponibilidad', body: { ...body, crew_id: crewId, sobrecargo_id: crewId } },
    ]
  }

  return [
    { method: 'post', path: '/sobrecargo/availability', body },
  ]
}

function getAuditCandidates(scope = 'crew', body = {}, crewId = null) {
  if (scope === 'admin') {
    return [
      { method: 'post', path: '/admin/sobrecargos/availability/audit', body: { ...body, crew_id: crewId } },
      { method: 'post', path: '/admin/crew/availability/audit', body: { ...body, crew_id: crewId } },
    ]
  }

  return [
    { method: 'post', path: '/sobrecargo/availability/audit', body },
  ]
}

function getAvailableCrewCandidates({ from = '', to = '', base = '' } = {}) {
  const query = {
    from: from || undefined,
    to: to || undefined,
    include_statuses: 0,
    base: base || undefined,
  }

  return [
    { method: 'get', path: '/admin/sobrecargos/disponibilidad', query },
  ]
}

function shouldIgnoreAvailableCrewLookupError(error) {
  const status = Number(error?.status || 0)
  const message = String(error?.message || '').toLowerCase()

  return (
    status === 404 ||
    status === 405 ||
    message.includes('/admin/sobrecargos/available') ||
    message.includes('/admin/sobrecargos/disponibles')
  )
}

function availabilityBlocksAssignment(entry = {}) {
  const normalized = normalizeAvailabilityStatusKey(
    entry.statusKey ||
      entry.clave ||
      entry.status ||
      entry.state ||
      entry.nombre ||
      '',
  )

  return ['NO_DISPONIBLE', 'DESCANSO', 'BLOQUEO_SOLICITADO', 'BLOQUEO_APROBADO', 'EN_OPERACION'].includes(normalized)
}

function adminAvailabilityMemberMatchesBase(member = {}, base = '') {
  if (!base) return true
  const normalizedBase = String(base || '').trim().toLowerCase()
  const memberBase = String(member.base || member.base_airport || member.city || '').trim().toLowerCase()
  return !normalizedBase || !memberBase || memberBase.includes(normalizedBase) || normalizedBase.includes(memberBase)
}

function normalizeAdminAvailableCrewMember(raw = {}) {
  const availability = pickCollection(raw, ['availability', 'disponibilidad', 'items']).map((item) =>
    normalizeAvailabilityRecord(item),
  )

  return {
    id: raw.id || raw.user_id || raw.sobrecargo_id || raw.crew_id || null,
    name: raw.name || raw.full_name || raw.nombre || 'Sobrecargo',
    base: raw.base || raw.base_airport || raw.base_code || raw.city || raw.profile?.base_airport || '',
    providerName:
      raw.provider_name || raw.company_name || raw.operator_name || raw.provider?.commercial_name || raw.provider?.company_name || '',
    status: raw.current_status || raw.status || raw.state || 'Disponible',
    availability,
    raw,
  }
}

function isAdminAvailableCrewMemberAssignable(member = {}) {
  if (!Array.isArray(member.availability) || !member.availability.length) return true
  return member.availability.every((entry) => !availabilityBlocksAssignment(entry))
}

export function normalizeAvailableCrewMember(raw = {}) {
  return {
    id: raw.id || raw.user_id || raw.sobrecargo_id || raw.crew_id || null,
    name: raw.name || raw.full_name || raw.nombre || 'Sobrecargo',
    base: raw.base || raw.base_airport || raw.base_code || raw.city || '',
    providerName: raw.provider_name || raw.company_name || raw.operator_name || '',
    status: raw.status || raw.state || raw.current_status || 'Disponible',
    raw,
  }
}

export async function fetchAvailabilityStatusCatalog({ scope = 'crew' } = {}) {
  try {
    const response = await requestWithCandidates(getStatusCandidates(scope))
    const catalog = normalizeAvailabilityStatusCatalog(response)
    if (scope === 'admin') return catalog.filter((item) => item.seleccionable_admin !== false)
    return catalog.filter((item) => item.seleccionable_sobrecargo !== false)
  } catch {
    const catalog = normalizeAvailabilityStatusCatalog(FALLBACK_STATUS_CATALOG)
    if (scope === 'admin') return catalog.filter((item) => item.seleccionable_admin !== false)
    return catalog.filter((item) => item.seleccionable_sobrecargo !== false)
  }
}

export async function fetchAvailabilityDataset({
  scope = 'crew',
  from = '',
  to = '',
  crewId = null,
  statusCatalog = [],
  signal,
  timeoutMs,
  includeStatuses = true,
} = {}) {
  const response = await requestWithCandidates(
    getCalendarCandidates(scope, { from: from || undefined, to: to || undefined }, crewId, includeStatuses).map((candidate) => ({
      ...candidate,
      timeoutMs: timeoutMs ?? candidate.timeoutMs,
    })),
    { signal },
  )
  let collection = pickCollection(response, ['availability', 'disponibilidad', 'calendar', 'calendario', 'data', 'items'])
  const payloadCatalog = normalizeAvailabilityStatusCatalog(response)

  if (!collection.length && scope === 'admin') {
    const crewMembers = pickCollection(response, ['crew_members', 'sobrecargos', 'crew', 'users'])
    collection = crewMembers.flatMap((member) =>
      [
        member?.availability,
        member?.disponibilidad,
        member?.disponibilidades,
        member?.calendar,
        member?.calendario,
        member?.items,
      ]
        .find((value) => Array.isArray(value))
        ?.map((item) => ({
          ...item,
          crew_id: item.crew_id || item.sobrecargo_id || member.id || member.user_id || null,
        })) || [],
    )
  }

  const effectiveCatalog = payloadCatalog.length ? payloadCatalog : statusCatalog

  return {
    records: collection.map((item) => normalizeAvailabilityRecord(item, effectiveCatalog)),
    statuses: payloadCatalog,
    crewMembers: pickCollection(response, ['crew_members', 'sobrecargos', 'crew', 'users']),
    from: response?.from || from,
    to: response?.to || to,
    raw: response,
  }
}

export async function fetchAvailabilityCalendar({ scope = 'crew', from = '', to = '', crewId = null, statusCatalog = [] } = {}) {
  const dataset = await fetchAvailabilityDataset({ scope, from, to, crewId, statusCatalog })
  return dataset.records
}

export async function fetchAvailableCrewByRange({ from = '', to = '', base = '' } = {}) {
  try {
    const response = await requestWithCandidates(getAvailableCrewCandidates({ from, to, base }))
    return pickCollection(response, ['crew_members', 'sobrecargos', 'crew', 'users', 'data', 'items'])
      .map(normalizeAdminAvailableCrewMember)
      .filter((item) => item.id)
      .filter((item) => adminAvailabilityMemberMatchesBase(item, base))
      .filter((item) => isAdminAvailableCrewMemberAssignable(item))
  } catch (error) {
    if (shouldIgnoreAvailableCrewLookupError(error)) {
      return []
    }
    throw error
  }
}

export async function saveAvailabilityRange({
  scope = 'crew',
  date,
  from = '',
  to = '',
  statusKey,
  comment = '',
  reason = '',
  base = '',
  coverage = '',
  crewId = null,
  audit = true,
} = {}) {
  const normalizedStatus = normalizeAvailabilityStatusKey(statusKey)
  const startDate = from || date
  const endDate = to || startDate
  const payload = {
    fecha: startDate,
    date: startDate,
    from: startDate,
    to: endDate,
    fecha_inicio: startDate,
    fecha_fin: endDate,
    status_key: normalizedStatus,
    clave: normalizedStatus,
    status: humanizeAvailabilityStatusKey(normalizedStatus),
    state: humanizeAvailabilityStatusKey(normalizedStatus),
    motivo: reason || '',
    comentario: comment || '',
    notes: comment || '',
    base: base || '',
    coverage: coverage || '',
  }

  const response = await requestWithCandidates(getSaveCandidates(scope, payload, crewId))

  if (audit) {
    try {
      await requestWithCandidates(
        getAuditCandidates(
          scope,
          {
            fecha: startDate,
            from: startDate,
            to: endDate,
            status_key: normalizedStatus,
            comentario: comment || '',
            note: `Disponibilidad ${startDate}${endDate !== startDate ? ` a ${endDate}` : ''}: ${humanizeAvailabilityStatusKey(normalizedStatus)}.${comment ? ` ${comment}` : ''}`,
          },
          crewId,
        ),
      )
    } catch {
      // Best-effort audit route: availability save should not fail if audit endpoint is not exposed yet.
    }
  }

  return pickRecord(response, ['availability', 'disponibilidad', 'data'])
}

export async function saveAvailabilityDate(options = {}) {
  return saveAvailabilityRange(options)
}
