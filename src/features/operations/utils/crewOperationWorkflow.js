function normalizeToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

export function normalizeChecklistType(value = '') {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  const compact = raw.replace(/[\s_-]+/g, '')

  if (['preparation', 'preparacion', 'preparationchecklist', 'checklistpreparation', 'checklistpreparacion'].includes(compact)) {
    return 'preparation'
  }

  if (['preflight', 'prevuelo', 'preflightchecklist', 'checklistpreflight', 'checklistprevuelo'].includes(compact)) {
    return 'preflight'
  }

  if (['postflight', 'postvuelo', 'postflightchecklist', 'checklistpostflight', 'checklistpostvuelo'].includes(compact)) {
    return 'postflight'
  }

  if (compact === 'tracking' || compact === 'seguimiento') {
    return 'tracking'
  }

  return ''
}

const CHECKLIST_TYPE_LABELS = {
  preparation: 'Preparación',
  preflight: 'Checklist pre-vuelo',
  postflight: 'Checklist post-vuelo',
  tracking: 'Seguimiento',
}

const CHECKLIST_CATEGORY_LABELS = {
  personal: 'Documentación personal',
  logistics: 'Traslado y presentación',
  operation: 'Información del vuelo',
  passengers: 'Pasajeros',
  service: 'Servicio',
  cabin: 'Cabina',
  safety: 'Seguridad',
}

const TRACKING_EVENT_DEFINITIONS = [
  {
    id: 'airport-arrival',
    code: 'airport_arrival',
    title: 'Llegué al aeropuerto',
    statuses: ['crew_checkin', 'checked_in'],
    titleIncludes: ['llegue al aeropuerto', 'check in operativo', 'check-in operativo'],
  },
  {
    id: 'aircraft-ready',
    code: 'aircraft_ready',
    title: 'Aeronave lista',
    statuses: ['cabina_lista', 'cabin_ready'],
    titleIncludes: ['aeronave lista', 'cabina lista'],
  },
  {
    id: 'catering-received',
    code: 'catering_received',
    title: 'Catering recibido',
    statuses: ['cabina_lista', 'cabin_ready'],
    titleIncludes: ['catering'],
  },
  {
    id: 'passengers-arrived',
    code: 'passengers_arrived',
    title: 'Pasajeros llegaron',
    statuses: ['boarding'],
    titleIncludes: ['abordaje', 'pasajeros llegaron'],
  },
  {
    id: 'passengers-boarded',
    code: 'passengers_on_board',
    title: 'Pasajeros a bordo',
    statuses: ['pasajeros_recibidos', 'boarding_completed'],
    titleIncludes: ['pasajeros recibidos', 'pasajeros a bordo'],
  },
  {
    id: 'takeoff',
    code: 'departure',
    title: 'Despegue',
    statuses: ['in_flight'],
    titleIncludes: ['despegue', 'servicio iniciado'],
  },
  {
    id: 'landing',
    code: 'landing',
    title: 'Aterrizaje',
    statuses: ['landed'],
    titleIncludes: ['aterriz'],
  },
  {
    id: 'passengers-disembarked',
    code: 'passengers_disembarked',
    title: 'Pasajeros desembarcaron',
    statuses: ['postflight_pending', 'report_pending', 'crew_completed'],
    titleIncludes: ['desembar', 'postvuelo'],
  },
]

const WORKFLOW_STEP_ORDER = ['validation', 'preparation', 'checklist', 'tracking', 'closure']

function normalizeChecklistState(value = '') {
  const normalized = normalizeToken(value)
  if (['completed', 'correcto', 'ok', 'done', 'completado'].includes(normalized)) return 'completed'
  if (['not applicable', 'not_applicable', 'na', 'no aplica'].includes(normalized)) return 'not_applicable'
  if (['failed', 'issue', 'falla', 'falla reportada'].includes(normalized)) return 'failed'
  return 'pending'
}

export function checklistStateLabel(status = '') {
  if (status === 'completed') return 'Registrado'
  if (status === 'not_applicable') return 'No aplica'
  if (status === 'failed') return 'Falla reportada'
  return 'Pendiente'
}

export function humanizeChecklistType(value = '') {
  const normalized = normalizeChecklistType(value) || normalizeToken(value)
  return CHECKLIST_TYPE_LABELS[normalized] || value || 'Checklist'
}

export function humanizeChecklistCategory(value = '') {
  const normalized = normalizeToken(value)
  return CHECKLIST_CATEGORY_LABELS[normalized] || value || 'General'
}

function pickFirstValue(candidates = []) {
  return candidates.find((value) => value !== undefined && value !== null && String(value).trim() !== '') || ''
}

function asObject(value) {
  return value && typeof value === 'object' ? value : {}
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function isChecklistResolvedStatus(status = '') {
  return ['completed', 'not_applicable'].includes(status)
}

function isChecklistHandledStatus(status = '') {
  return ['completed', 'not_applicable', 'failed'].includes(status)
}

function operationSources(entity = {}) {
  const raw = asObject(entity.raw)
  const nestedOperation = asObject(raw.operation)
  const latestOperation = asObject(raw.latestOperation)
  const visibilityPayload = asObject(raw.visibility_payload)
  const visibilityOperation = asObject(visibilityPayload.operation)
  const detail = asObject(entity.detail)
  const briefing = asObject(raw.briefing)
  const assignment = asObject(
    entity.assignment ||
      entity.crewAssignment ||
      raw.assignment ||
      raw.crewAssignment ||
      raw.crew_assignment ||
      raw.latestCrewAssignment ||
      nestedOperation.assignment ||
      nestedOperation.crew_assignment ||
      latestOperation.assignment ||
      latestOperation.crew_assignment ||
      visibilityOperation.assignment ||
      visibilityOperation.crew_assignment ||
      detail.assignment,
  )

  return {
    entity,
    raw,
    nestedOperation,
    latestOperation,
    visibilityPayload,
    visibilityOperation,
    detail,
    briefing,
    assignment,
  }
}

function sameIdentifier(left, right) {
  if (left === undefined || left === null || right === undefined || right === null) return false
  return String(left).trim() !== '' && String(right).trim() !== '' && String(left) === String(right)
}

function extractTimeline(entity = {}) {
  const identifiers = resolveIdentifiers(entity)
  const { entity: record, raw, nestedOperation, latestOperation, detail } = operationSources(entity)
  return [
    ...asArray(record.timeline),
    ...asArray(raw.timeline),
    ...asArray(detail.timeline),
    ...asArray(nestedOperation.timeline),
    ...asArray(latestOperation.timeline),
  ].filter((entry) => {
    const operationId = entry?.operation_id || entry?.operationId
    const assignmentId = entry?.assignment_id || entry?.assignmentId
    if (operationId && identifiers.operationId && !sameIdentifier(operationId, identifiers.operationId)) return false
    if (assignmentId && identifiers.assignmentId && !sameIdentifier(assignmentId, identifiers.assignmentId)) return false
    return true
  })
}

function findLatestTimelineEntry(timeline = [], { statuses = [], titleIncludes = [] } = {}) {
  const normalizedStatuses = statuses.map(normalizeToken).filter(Boolean)
  const normalizedTitles = titleIncludes.map(normalizeToken).filter(Boolean)

  const matches = asArray(timeline).filter((entry) => {
    const status = normalizeToken(entry?.status || '')
    const title = normalizeToken(entry?.title || '')
    return normalizedStatuses.includes(status) || normalizedTitles.some((value) => title.includes(value))
  })

  return matches
    .slice()
    .sort((left, right) => {
      const leftTime = Date.parse(left?.created_at || left?.updated_at || '')
      const rightTime = Date.parse(right?.created_at || right?.updated_at || '')
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0)
    })[0] || null
}

function resolveActorName(source = {}, fallback = '') {
  return String(
    source?.created_by_name ||
      source?.updated_by_name ||
      source?.recorded_by_name ||
      source?.registered_by_name ||
      source?.performed_by_name ||
      source?.actor_name ||
      source?.author_name ||
      source?.user_name ||
      source?.crew_name ||
      source?.sobrecargo_name ||
      source?.created_by?.name ||
      source?.updated_by?.name ||
      source?.recorded_by?.name ||
      source?.registered_by?.name ||
      source?.performed_by?.name ||
      source?.actor?.name ||
      source?.author?.name ||
      fallback ||
      '',
  ).trim()
}

function resolveActorRole(source = {}, actorName = '', crewName = '') {
  const explicitRole = normalizeToken(
    source?.actor_role ||
      source?.actor_type ||
      source?.user_role ||
      source?.created_by_role ||
      source?.updated_by_role ||
      source?.recorded_by_role ||
      '',
  )

  if (explicitRole.includes('admin')) return 'Admin'
  if (explicitRole.includes('system') || explicitRole.includes('sistema')) return 'Sistema'
  if (explicitRole.includes('crew') || explicitRole.includes('sobrecargo') || explicitRole.includes('cabina')) return 'Sobrecargo'

  const normalizedActor = normalizeToken(actorName)
  const normalizedCrew = normalizeToken(crewName)

  if (!normalizedActor) return ''
  if (normalizedActor === 'sistema' || normalizedActor === 'system') return 'Sistema'
  if (normalizedCrew && normalizedActor.includes(normalizedCrew)) return 'Sobrecargo'
  if (normalizedActor.includes('admin') || normalizedActor.includes('administracion')) return 'Admin'
  return ''
}

function resolveIdentifiers(entity = {}) {
  const {
    entity: record,
    raw,
    nestedOperation,
    latestOperation,
    visibilityPayload,
    visibilityOperation,
    assignment,
  } = operationSources(entity)
  const operationId = pickFirstValue([
    record.operationId,
    record.id,
    raw.id,
    nestedOperation.id,
    latestOperation.id,
    visibilityOperation.id,
    visibilityPayload.operation_id,
  ])

  return {
    operationId,
    assignmentId: pickFirstValue([
      assignment.id,
      record.assignmentId,
      record.assignment_id,
      record.crewAssignment?.id,
      raw.assignment_id,
      raw.crew_assignment_id,
      nestedOperation.assignment_id,
      latestOperation.assignment_id,
      visibilityOperation.assignment_id,
      visibilityPayload.assignment_id,
    ]),
    flightRequestId: pickFirstValue([
      record.flightRequestId,
      raw.flight_request_id,
      nestedOperation.flight_request_id,
      latestOperation.flight_request_id,
      raw.request_id,
    ]),
    crewUserId: pickFirstValue([
      record.crewId,
      record.crew_id,
      raw.sobrecargo_user_id,
      raw.crew_user_id,
      assignment.sobrecargo_user_id,
      assignment.crew_user_id,
      assignment.crew_id,
      assignment.sobrecargo_id,
    ]),
  }
}

function extractLegs(entity = {}) {
  const { entity: record, raw, nestedOperation, latestOperation, visibilityPayload } = operationSources(entity)
  const sources = [
    record.legs,
    raw.legs,
    raw.itinerary,
    raw.segments,
    raw.flight_legs,
    raw.itinerary_segments,
    raw.route_segments,
    nestedOperation.legs,
    nestedOperation.itinerary,
    nestedOperation.segments,
    nestedOperation.flight_legs,
    nestedOperation.itinerary_segments,
    latestOperation.legs,
    latestOperation.itinerary,
    latestOperation.segments,
    visibilityPayload.legs,
    visibilityPayload.itinerary,
  ]

  return sources.find((source) => Array.isArray(source) && source.length) || []
}

function resolveRoute(entity = {}) {
  const explicit = pickFirstValue([
    entity.route,
    entity.raw?.route,
    entity.raw?.operation?.route,
    entity.raw?.latestOperation?.route,
    entity.raw?.visibility_payload?.route,
    entity.flight_route,
  ])
  if (explicit) return explicit

  const legs = extractLegs(entity)
  if (legs.length) {
    const tokens = []
    legs.forEach((leg) => {
      const origin = pickFirstValue([leg.origin, leg.origin_code, leg.from, leg.departure_airport, leg.origin_iata])
      const destination = pickFirstValue([leg.destination, leg.destination_code, leg.to, leg.arrival_airport, leg.destination_iata])
      if (origin && !tokens.length) tokens.push(origin)
      if (destination) tokens.push(destination)
    })

    const compact = tokens.filter(Boolean)
    if (compact.length > 1) return compact.join(' → ')
  }

  const { raw, detail, briefing } = operationSources(entity)
  const origin = pickFirstValue([entity.origin, raw.origin, detail.origin, briefing.origen])
  const destination = pickFirstValue([entity.destination, raw.destination, detail.destination, briefing.destino])
  return [origin, destination].filter(Boolean).join(' → ')
}

function resolveFolio(entity = {}) {
  const { entity: record, raw, nestedOperation } = operationSources(entity)
  return pickFirstValue([
    record.folio,
    raw.folio,
    raw.code,
    raw.reference,
    nestedOperation.folio,
    nestedOperation.code,
    record.flight,
  ])
}

function resolveWorkflowStatus(entity = {}) {
  const { entity: record, raw, nestedOperation, latestOperation, detail, assignment } = operationSources(entity)
  return normalizeToken(
    pickFirstValue([
      record.workflowStatus,
      raw.workflow_status,
      detail.workflow_status,
      record.crewStatus,
      record.crew_status,
      detail.crew_status,
      raw.crew_status,
      nestedOperation.crew_status,
      latestOperation.crew_status,
      assignment.status,
      record.status,
      raw.status,
      nestedOperation.status,
      latestOperation.status,
    ]),
  ).replace(/\s+/g, '_')
}

function resolveAssignmentStatus(entity = {}) {
  const { assignment, entity: record, raw, detail } = operationSources(entity)
  const normalized = normalizeToken(
    pickFirstValue([
      assignment.status,
      assignment.rawStatus,
      detail.assignment_status,
      raw.assignment_status,
      record.responseStatus,
    ]),
  )

  const assignmentAccepted = Boolean(
    assignment.accepted_at ||
      assignment.acceptedAt ||
      raw.crew_confirmed_at ||
      detail.crew_confirmed_at ||
      normalized === 'confirmed' ||
      normalized === 'accepted' ||
      normalized === 'confirmado' ||
      normalized === 'confirmada',
  )

  if (assignmentAccepted) return 'confirmed'
  if (assignment.rejected_at || assignment.rejectedAt || normalized === 'rejected' || normalized === 'crew declined') return 'rejected'
  if (assignment.cancelled_at || assignment.cancelledAt || normalized === 'cancelled') return 'cancelled'
  if (['pending confirmation', 'pending crew response', 'pending'].includes(normalized)) return 'pending_confirmation'
  return normalized ? normalized.replace(/\s+/g, '_') : 'pending_confirmation'
}

function assignmentStatusLabel(status = '') {
  const normalized = normalizeToken(status)
  if (normalized === 'confirmed') return 'Vuelo confirmado'
  if (normalized === 'rejected') return 'Rechazada'
  if (normalized === 'cancelled') return 'Cancelada'
  return 'Sin responder'
}

function extractChecklists(entity = {}) {
  const identifiers = resolveIdentifiers(entity)
  const {
    entity: record,
    raw,
    nestedOperation,
    latestOperation,
    visibilityPayload,
    visibilityOperation,
    detail,
    assignment,
  } = operationSources(entity)
  const source = [
    record.checklists,
    record.assignment?.checklists,
    record.crewAssignment?.checklists,
    raw.checklists,
    raw.assignment?.checklists,
    raw.crewAssignment?.checklists,
    raw.crew_assignment?.checklists,
    detail.checklists,
    detail.assignment?.checklists,
    assignment.checklists,
    nestedOperation.checklists,
    nestedOperation.assignment?.checklists,
    nestedOperation.crew_assignment?.checklists,
    latestOperation.checklists,
    latestOperation.assignment?.checklists,
    latestOperation.crew_assignment?.checklists,
    visibilityPayload.checklists,
    visibilityPayload.assignment?.checklists,
    visibilityPayload.crew_assignment?.checklists,
    visibilityOperation.checklists,
    visibilityOperation.assignment?.checklists,
    visibilityOperation.crew_assignment?.checklists,
  ].find((source) => Array.isArray(source) && source.length) || []

  return source.filter((checklist) => {
    const operationId = checklist?.operation_id || checklist?.operationId
    const assignmentId = checklist?.assignment_id || checklist?.assignmentId
    const operationMatches = !operationId || !identifiers.operationId || sameIdentifier(operationId, identifiers.operationId)
    const assignmentMatches = !assignmentId || !identifiers.assignmentId || sameIdentifier(assignmentId, identifiers.assignmentId)

    if (operationId && identifiers.operationId && !operationMatches) return false
    if (!operationMatches) return false
    if (!assignmentMatches && !operationMatches) return false
    return true
  })
}

function extractTrackingEvents(entity = {}) {
  const identifiers = resolveIdentifiers(entity)
  const { entity: record, raw, nestedOperation, latestOperation, visibilityPayload, detail } = operationSources(entity)
  const source = [
    record.tracking_events,
    raw.tracking_events,
    detail.tracking_events,
    nestedOperation.tracking_events,
    latestOperation.tracking_events,
    visibilityPayload.tracking_events,
  ].find((candidate) => Array.isArray(candidate) && candidate.length) || []

  return source.filter((event) => {
    const operationId = event?.operation_id || event?.operationId
    const assignmentId = event?.assignment_id || event?.assignmentId
    if (operationId && identifiers.operationId && !sameIdentifier(operationId, identifiers.operationId)) return false
    if (assignmentId && identifiers.assignmentId && !sameIdentifier(assignmentId, identifiers.assignmentId)) return false
    return true
  })
}

function normalizeChecklistItem(item = {}, checklistType = 'general', index = 0, crewName = '') {
  const status = normalizeChecklistState(item.status)
  const actorName = resolveActorName(item)
  return {
    id: item.id || item.code || item.label || item.name || `${checklistType}-${index}`,
    title: item.label || item.description || item.name || item.code || 'Checklist sin nombre',
    category: item.category || 'general',
    status,
    detail: checklistStateLabel(status),
    timestamp: item.completed_at || item.updated_at || item.recorded_at || item.created_at || '',
    actorName,
    actorRole: resolveActorRole(item, actorName, crewName),
    code: item.code || '',
    isRequired: item.is_required !== false,
  }
}

function buildChecklistSummary(items = []) {
  const requiredItems = items.filter((item) => item.isRequired !== false)
  const completed = items.filter((item) => item.status === 'completed').length
  const notApplicable = items.filter((item) => item.status === 'not_applicable').length
  const failed = items.filter((item) => item.status === 'failed').length
  const pending = items.filter((item) => item.status === 'pending').length
  const resolved = items.filter((item) => isChecklistResolvedStatus(item.status)).length
  const handled = items.filter((item) => isChecklistHandledStatus(item.status)).length
  const requiredResolved = requiredItems.filter((item) => isChecklistResolvedStatus(item.status)).length

  return {
    total: items.length,
    resolved,
    handled,
    pending,
    completed,
    notApplicable,
    failed,
    requiredTotal: requiredItems.length,
    requiredResolved,
    isLoaded: items.length > 0,
    isComplete: requiredItems.length > 0 && requiredResolved === requiredItems.length,
  }
}

function buildChecklistGroups(entity = {}) {
  const crewName = pickFirstValue([entity.crew, entity.raw?.crew_name, entity.raw?.sobrecargo_name])
  return extractChecklists(entity)
    .map((group, groupIndex) => {
      const sourceType = group?.type || group?.category || ''
      const type =
        normalizeChecklistType(sourceType)
        || normalizeToken(sourceType || `group-${groupIndex + 1}`).replace(/\s+/g, '_')
      const items = asArray(group?.items).map((item, itemIndex) =>
        normalizeChecklistItem(item, type, itemIndex, crewName),
      )

      const categoriesMap = new Map()
      items.forEach((item) => {
        const key = String(item.category || 'general')
        if (!categoriesMap.has(key)) {
          categoriesMap.set(key, {
            id: key,
            label: humanizeChecklistCategory(key),
            items: [],
          })
        }
        categoriesMap.get(key).items.push(item)
      })

      const categories = Array.from(categoriesMap.values()).map((category) => ({
        ...category,
        summary: buildChecklistSummary(category.items),
      }))
      const summary = buildChecklistSummary(items)

      return {
        id: group?.id || type,
        type,
        title: humanizeChecklistType(type),
        items,
        categories,
        summary,
        status:
          items.length === 0
            ? 'not_loaded'
            : summary.failed > 0
              ? 'failed'
              : summary.isComplete
                ? 'completed'
                : 'pending',
      }
    })
    .filter(Boolean)
}

function buildTrackingMilestones(entity = {}) {
  const timeline = extractTimeline(entity)
  const trackingEvents = extractTrackingEvents(entity)
  const crewName = pickFirstValue([entity.crew, entity.raw?.crew_name, entity.raw?.sobrecargo_name])

  const items = TRACKING_EVENT_DEFINITIONS.map((definition) => {
    const trackingEvent = trackingEvents.find((event) => normalizeToken(event?.code || event?.status || event?.type || '') === normalizeToken(definition.code))
    const entry = findLatestTimelineEntry(timeline, {
      statuses: definition.statuses,
      titleIncludes: definition.titleIncludes,
    })
    const timestamp =
      trackingEvent?.recorded_at ||
      trackingEvent?.created_at ||
      trackingEvent?.updated_at ||
      entry?.recorded_at ||
      entry?.created_at ||
      entry?.updated_at ||
      ''
    const normalizedEventStatus = normalizeToken(trackingEvent?.status || '')
    const source = trackingEvent || entry
    const hasPersistedRecord = Boolean(
      (trackingEvent && normalizedEventStatus === 'completed' && timestamp)
      || (!trackingEvent && entry && timestamp),
    )
    const actorName = resolveActorName(source, crewName)

    return {
      id: definition.id,
      code: definition.code,
      title: definition.title,
      status: hasPersistedRecord ? 'completed' : 'pending',
      detail: hasPersistedRecord ? checklistStateLabel('completed') : checklistStateLabel('pending'),
      timestamp,
      actorName,
      actorRole: resolveActorRole(source, actorName, crewName),
      isPersisted: hasPersistedRecord,
    }
  })

  const firstPendingIndex = items.findIndex((item) => item.status !== 'completed')
  const normalizedItems = items.map((item, index) => ({
    ...item,
    status: item.status === 'completed' ? 'completed' : index === firstPendingIndex ? 'current' : 'pending',
    detail: item.status === 'completed' ? checklistStateLabel('completed') : checklistStateLabel('pending'),
  }))
  const completed = items.filter((item) => item.isPersisted).length
  const total = items.length
  const pending = Math.max(total - completed, 0)
  const summary = {
    total,
    resolved: completed,
    handled: completed,
    pending,
    completed,
    notApplicable: 0,
    failed: 0,
    isLoaded: total > 0,
    isComplete: total > 0 && completed === total,
  }

  return {
    title: 'Seguimiento',
    items: normalizedItems,
    summary,
  }
}

function buildWorkflowSteps(entity = {}, groups = [], tracking = null) {
  const assignmentStatus = resolveAssignmentStatus(entity)
  const byType = new Map(groups.map((group) => [group.type, group]))
  const preparationGroup = byType.get('preparation')
  const preflightGroup = byType.get('preflight')
  const postflightGroup = byType.get('postflight')
  const validationComplete = assignmentStatus === 'confirmed'
  const preparationComplete = Boolean(preparationGroup?.summary?.isComplete)
  const preflightComplete = Boolean(preflightGroup?.summary?.isComplete)
  const trackingComplete = Boolean(tracking?.summary?.isComplete)
  const postflightComplete = Boolean(postflightGroup?.summary?.isComplete)

  const baseSteps = [
    {
      id: 'validation',
      label: validationComplete ? 'Vuelo validado' : 'Validar vuelo',
      complete: validationComplete,
      failed: false,
    },
    {
      id: 'preparation',
      label: humanizeChecklistType('preparation'),
      complete: preparationComplete,
      failed: (preparationGroup?.summary?.failed ?? 0) > 0,
    },
    {
      id: 'checklist',
      label: humanizeChecklistType('preflight'),
      complete: preflightComplete,
      failed: (preflightGroup?.summary?.failed ?? 0) > 0,
    },
    {
      id: 'tracking',
      label: 'Seguimiento',
      complete: trackingComplete,
      failed: false,
    },
    {
      id: 'closure',
      label: humanizeChecklistType('postflight'),
      complete: postflightComplete,
      failed: (postflightGroup?.summary?.failed ?? 0) > 0,
    },
  ]

  let previousStepsComplete = true
  let currentId = ''
  const steps = baseSteps.map((step) => {
    const rawComplete = Boolean(step.complete)
    const available = previousStepsComplete
    let status
    let state

    if (!available) {
      status = 'blocked'
      state = 'Bloqueado'
    } else if (rawComplete) {
      status = 'completed'
      state = 'Completado'
    } else if (!currentId) {
      currentId = step.id
      status = step.failed ? 'pending' : 'current'
      state = step.failed ? 'Falla reportada' : 'Actual'
    } else {
      status = 'available'
      state = 'Pendiente'
    }

    previousStepsComplete = previousStepsComplete && rawComplete

    return {
      ...step,
      rawComplete,
      available,
      blocked: !available,
      current: status === 'current',
      complete: status === 'completed',
      completed: status === 'completed',
      status,
      state,
      detail: status === 'current' && !rawComplete ? 'Pendiente de iniciar' : state,
    }
  })

  if (!currentId && steps.every((step) => step.complete)) {
    currentId = 'closure'
  }

  return {
    currentId,
    steps,
    stepsById: new Map(steps.map((step) => [step.id, step])),
  }
}

function latestActivityAt(entity = {}, groups = [], tracking = null) {
  const timestamps = [
    ...groups.flatMap((group) => group.items.map((item) => item.timestamp).filter(Boolean)),
    ...(tracking?.items || []).map((item) => item.timestamp).filter(Boolean),
    entity.assignment?.accepted_at,
    entity.assignment?.acceptedAt,
    entity.raw?.crew_confirmed_at,
    entity.detail?.crew_confirmed_at,
  ].filter(Boolean)

  return timestamps
    .slice()
    .sort((left, right) => {
      const leftTime = Date.parse(left || '')
      const rightTime = Date.parse(right || '')
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0)
    })[0] || ''
}

function buildConsistencyWarnings({ assignmentStatus = '', checklistGroups = [], tracking = null } = {}) {
  const warnings = []
  const byType = new Map(checklistGroups.map((group) => [group.type, group]))
  const preparationGroup = byType.get('preparation')
  const preflightGroup = byType.get('preflight')
  const postflightGroup = byType.get('postflight')

  const hasPreparationActivity = (preparationGroup?.summary?.handled ?? 0) > 0
  const hasPreflightActivity = (preflightGroup?.summary?.handled ?? 0) > 0
  const hasTrackingActivity = (tracking?.summary?.completed ?? 0) > 0
  const hasPostflightActivity = (postflightGroup?.summary?.handled ?? 0) > 0

  if (assignmentStatus !== 'confirmed' && (hasPreparationActivity || hasPreflightActivity || hasTrackingActivity || hasPostflightActivity)) {
    warnings.push('Tracking or checklist activity exists while assignment is pending confirmation')
  }

  if (!(preparationGroup?.summary?.isComplete) && (hasPreflightActivity || hasTrackingActivity || hasPostflightActivity)) {
    warnings.push('Later workflow activity exists while preparation is incomplete')
  }

  if (!(preflightGroup?.summary?.isComplete) && (hasTrackingActivity || hasPostflightActivity)) {
    warnings.push('Later workflow activity exists while preflight is incomplete')
  }

  if (!(tracking?.summary?.isComplete) && hasPostflightActivity) {
    warnings.push('Postflight activity exists while tracking is incomplete')
  }

  return warnings
}

function deriveOperationStatusLabelFromWorkflow({ assignmentStatus = '', workflow = null } = {}) {
  if (workflow?.steps?.every((step) => step.complete)) return 'Completada'
  if (assignmentStatus === 'rejected' || assignmentStatus === 'cancelled') {
    return assignmentStatusLabel(assignmentStatus)
  }

  switch (workflow?.currentId) {
    case 'preparation':
      return 'Preparación'
    case 'checklist':
      return 'Checklist pre-vuelo'
    case 'tracking':
      return 'Seguimiento'
    case 'closure':
      return 'Checklist post-vuelo'
    case 'validation':
    default:
      return assignmentStatus === 'confirmed' ? 'Vuelo confirmado' : 'Pendiente de confirmación'
  }
}

export function buildCrewOperationWorkflowSnapshot(entity = {}) {
  const identifiers = resolveIdentifiers(entity)
  const checklistGroups = buildChecklistGroups(entity)
  const tracking = buildTrackingMilestones(entity)
  const workflow = buildWorkflowSteps(entity, checklistGroups, tracking)
  const route = resolveRoute(entity)
  const folio = resolveFolio(entity) || (identifiers.operationId ? `RA-${identifiers.operationId}` : '')
  const assignmentStatus = resolveAssignmentStatus(entity)
  const consistencyWarnings = buildConsistencyWarnings({
    assignmentStatus,
    checklistGroups,
    tracking,
  })

  return {
    ids: identifiers,
    folio,
    route,
    assignmentStatus,
    assignmentStatusLabel: assignmentStatusLabel(assignmentStatus),
    operationStatusLabel: deriveOperationStatusLabelFromWorkflow({ assignmentStatus, workflow }),
    workflowStatus: resolveWorkflowStatus(entity),
    checklistGroups,
    checklistGroupsByType: new Map(checklistGroups.map((group) => [group.type, group])),
    tracking,
    workflow,
    workflowStepOrder: WORKFLOW_STEP_ORDER,
    consistencyWarnings,
    latestActivityAt: latestActivityAt(entity, checklistGroups, tracking),
  }
}
