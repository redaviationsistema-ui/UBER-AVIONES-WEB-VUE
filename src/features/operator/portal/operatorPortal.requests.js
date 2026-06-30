export function createOperatorPortalRequestsDomain(ctx = {}) {
  const {
    requests,
    aircraft,
    filteredRequests,
    requestStatusUpdate,
    requestWorkflowLocalOverrides,
    selectedRequestId,
    requestStatusFilter,
    buildWorkflowApiPayload,
    resolveSharedWorkflowStatus,
    resolveSharedVisualWorkflowStepId,
    getSharedWorkflowActionCopy,
    getSharedWorkflowStepDescription,
    normalizeWorkflowLabel,
    resolveWorkflowState,
    buildSharedFlowStepStates,
    parseOperationalDate,
    isRequestSameOperationalDay,
    formatCurrency,
    getRequestRouteLabel,
    resolveOperatorRequestQueue,
    findOperatorRequestByIdentifier,
    findLinkedOperationForRequest,
    getAircraftLiveStatus,
    parseRequestAmount,
    emitWorkflowSync,
    ui,
    OPERATOR_FLOW_STEPS,
  } = ctx

  function isRequestAccepted(status = '') {
    const workflowState = resolveWorkflowState(resolveRequestWorkflowValue(status)).id
    return (
      ['Aceptada', 'Aprobada', 'Respuesta proveedor'].includes(
        typeof status === 'string' ? status : '',
      ) ||
      workflowState === 'provider_accepted'
    )
  }

  function isRequestRejected(status = '') {
    return (
      (typeof status === 'string' ? status : '') === 'Rechazada' ||
      resolveWorkflowState(resolveRequestWorkflowValue(status)).id === 'rejected'
    )
  }

  function isRequestPendingValidation(status = '') {
    const workflowState = resolveWorkflowState(resolveRequestWorkflowValue(status)).id
    return (
      ['contract_pending', 'contract_signed', 'payment_pending', 'payment_confirmed', 'flight_confirmed', 'tracking_live', 'completed'].includes(workflowState)
    )
  }

  function getRequestStatusMeta(statusOrRequest = '') {
    const status = resolveRequestWorkflowValue(statusOrRequest)
    const workflowState = resolveWorkflowState(status).id
    const label = normalizeWorkflowLabel(status)
    const queue =
      statusOrRequest && typeof statusOrRequest === 'object'
        ? resolveOperatorRequestQueue(statusOrRequest, status)
        : resolveOperatorRequestQueue({}, status)

    if (isRequestRejected(status)) {
      return {
        label: 'Archivada',
        tone: 'neutral',
        queue: 'rejected',
        headline: 'Solicitud archivada',
      }
    }
    if (queue === 'tracking') {
      return {
        label: 'Tracking activo',
        tone: 'info',
        queue: 'tracking',
        headline: 'Tracking activo',
      }
    }
    if (queue === 'coordination' || isRequestPendingValidation(status)) {
      return {
        label,
        tone: 'info',
        queue: 'coordination',
        headline: label,
      }
    }
    if (queue === 'pending' || workflowState === 'provider_pending' || workflowState === 'reserved') {
      return {
        label: 'Pendiente',
        tone: 'warning',
        queue: 'pending',
        headline: 'Pendiente de aceptar o rechazar',
      }
    }
    if (queue === 'completed') {
      return {
        label,
        tone: 'neutral',
        queue: 'completed',
        headline: label,
      }
    }

    return {
      label,
      tone: 'warning',
      queue: 'pending',
      headline: label,
    }
  }

  function resolveRequestStatusFilterTarget(request = null, fallback = 'all') {
    const queue = getRequestStatusMeta(request).queue
    if (['pending', 'coordination', 'tracking'].includes(queue)) return queue
    if (['rejected', 'completed'].includes(queue)) return 'pending'
    return fallback
  }

  function getRequestPriorityMeta(request = {}) {
    const referenceDate =
      parseOperationalDate(request.responseLimit) || parseOperationalDate(request.date)
    if (!referenceDate) {
      return {
        key: 'normal',
        label: 'Programada',
        tone: 'neutral',
        detail: 'Sin SLA visible en backend.',
        rank: 1,
      }
    }

    const diffMs = referenceDate.getTime() - Date.now()
    if (diffMs <= 0) {
      return { key: 'expired', label: 'SLA vencido', tone: 'danger', rank: 4 }
    }
    if (diffMs <= 4 * 60 * 60 * 1000) {
      return { key: 'urgent', label: 'Urgente', tone: 'danger', detail: 'Sale en menos de 4 horas.', rank: 3 }
    }
    if (isRequestSameOperationalDay(request.date) || diffMs <= 12 * 60 * 60 * 1000) {
      return { key: 'high', label: 'Alta prioridad', tone: 'warning', detail: 'Salida programada para hoy.', rank: 2 }
    }

    return { key: 'normal', label: 'Programada', tone: 'info', detail: 'Ventana operativa normal.', rank: 1 }
  }

  function getRequestStatusCopy(status = '') {
    const workflowState = resolveWorkflowState(resolveRequestWorkflowValue(status)).id
    if (workflowState === 'reserved' || workflowState === 'provider_pending')
      return 'La solicitud ya esta en flujo y espera respuesta operativa del proveedor.'
    if (workflowState === 'provider_accepted' || isRequestAccepted(status))
      return 'La respuesta operativa ya se registro y el siguiente paso compartido es contrato / firma.'
    if (workflowState === 'contract_pending')
      return 'La reserva ya avanzo a contrato y firma del cliente.'
    if (workflowState === 'contract_signed')
      return 'El contrato ya fue firmado y el siguiente paso es validar el pago.'
    if (workflowState === 'payment_pending')
      return 'El pago esta pendiente o en revision antes de liberar el vuelo.'
    if (workflowState === 'payment_confirmed')
      return 'Pago confirmado. El proveedor confirma aeronave y operacion; Red Aviation coordina con la sobrecargo y mantiene informado al cliente.'
    if (workflowState === 'flight_confirmed')
      return 'La aeronave y la operacion ya quedaron confirmadas por el proveedor; el admin sigue la coordinacion con sobrecargo y cliente.'
    if (workflowState === 'tracking_live')
      return 'El vuelo ya esta en seguimiento activo.'
    if (isRequestRejected(status)) return 'Rechazada por proveedor'
    if (isRequestPendingValidation(status)) return 'La reserva ya avanzo en el flujo compartido.'
    return 'Pendiente de decision'
  }

  function operatorWorkflowRank(value = '') {
    const workflowId = resolveWorkflowState(value).id
    const order = ['draft','quoted','package_selected','reserved','provider_pending','provider_accepted','contract_pending','contract_signed','payment_pending','payment_confirmed','flight_confirmed','tracking_live','completed','rejected','cancelled']
    const index = order.indexOf(workflowId)
    return index === -1 ? 0 : index
  }

  function preferOperatorWorkflowValue(baseValue = '', detailValue = '') {
    if (!String(baseValue || '').trim()) return detailValue
    if (!String(detailValue || '').trim()) return baseValue
    return operatorWorkflowRank(detailValue) >= operatorWorkflowRank(baseValue) ? detailValue : baseValue
  }

  function resolveRequestWorkflowValue(requestOrStatus = '') {
    if (requestOrStatus && typeof requestOrStatus === 'object') {
      const linkedOperation = findLinkedOperationForRequest?.(requestOrStatus)
      const requestWorkflowValue =
        requestOrStatus.workflowStatus ||
        requestOrStatus.rawWorkflowStatus ||
        requestOrStatus.status ||
        ''
      const linkedOperationWorkflowValue =
        linkedOperation?.workflowStatus ||
        linkedOperation?.rawWorkflowStatus ||
        linkedOperation?.status ||
        ''
      const explicitWorkflowValue = preferOperatorWorkflowValue(
        requestWorkflowValue,
        linkedOperationWorkflowValue,
      )
      const derivedWorkflowValue =
        resolveSharedWorkflowStatus?.({
          ...(requestOrStatus.raw && typeof requestOrStatus.raw === 'object'
            ? requestOrStatus.raw
            : {}),
          ...(linkedOperation?.raw && typeof linkedOperation.raw === 'object'
            ? linkedOperation.raw
            : {}),
          workflow_status: explicitWorkflowValue,
          status: linkedOperation?.status || requestOrStatus.status || requestOrStatus.rawStatus || '',
          contract_status: linkedOperation?.contractStatus || requestOrStatus.contractStatus || '',
          provider_status:
            requestOrStatus.providerStatus || requestOrStatus.raw?.provider_status || '',
          payment_status: linkedOperation?.paymentStatus || requestOrStatus.paymentStatus || '',
          operation_id: linkedOperation?.id || requestOrStatus.operationId || '',
        }) || explicitWorkflowValue

      if (explicitWorkflowValue && resolveWorkflowState(explicitWorkflowValue).id !== 'draft') {
        return preferOperatorWorkflowValue(explicitWorkflowValue, derivedWorkflowValue)
      }

      return derivedWorkflowValue
    }
    return requestOrStatus
  }

  function resolveOperatorVisualStepId(value = '') {
    return resolveSharedVisualWorkflowStepId?.(value) || resolveWorkflowState(value).id || 'reserved'
  }

  function buildOperatorRequestFlowSteps(request = {}) {
    const workflowValue = resolveRequestWorkflowValue(request)
    return buildSharedFlowStepStates(workflowValue).map((step) => ({
      ...step,
      shortLabel:
        OPERATOR_FLOW_STEPS?.find((item) => item.id === step.id)?.shortLabel || step.shortLabel,
    }))
  }

  function getRequestResponseCountdown(request = {}) {
    const referenceDate = parseOperationalDate(request.responseLimit)
    if (!referenceDate) return { label: 'Sin SLA visible', tone: 'neutral' }

    const diffMs = referenceDate.getTime() - Date.now()
    if (diffMs <= 0) return { label: 'Respuesta vencida', tone: 'danger' }

    const totalMinutes = Math.max(1, Math.round(diffMs / 60000))
    if (totalMinutes < 60) {
      return {
        label: `Responder en ${totalMinutes} min`,
        tone: totalMinutes <= 20 ? 'danger' : 'warning',
      }
    }

    const totalHours = Math.round(totalMinutes / 60)
    return { label: `Responder en ${totalHours} h`, tone: totalHours <= 4 ? 'warning' : 'info' }
  }

  function getRequestClientLabel(request = {}) {
    const label = String(request.client || '').trim()
    if (!label || ['Cliente', 'N/D', 'Cliente #N/D'].includes(label)) {
      return 'Cliente protegido por plataforma'
    }
    return label
  }

  function getRequestQuoteLabel(request = {}) {
    const rawValue = request.quote ?? request.finalPrice ?? request.basePrice
    const numericValue = parseRequestAmount ? parseRequestAmount(rawValue, 0) : Number(rawValue || 0)
    if (!Number.isFinite(numericValue) || numericValue <= 0) return 'Cotizacion en proceso'
    return formatCurrency(numericValue)
  }

  function getRequestSuggestedAircraft(request = {}) {
    const explicitAircraft = String(request.aircraft || '').trim()
    if (explicitAircraft && explicitAircraft !== 'Por definir') {
      return {
        label: explicitAircraft,
        detail: 'Compatible con la solicitud enviada por la plataforma.',
        available: true,
      }
    }

    const passengers = Number(request.passengers || 0)
    const matchingAircraft =
      aircraft.value.find(
        (plane) =>
          Number(plane.capacity || 0) >= passengers &&
          getAircraftLiveStatus?.(plane).label === 'Disponible',
      ) ||
      aircraft.value.find((plane) => Number(plane.capacity || 0) >= passengers) ||
      null

    if (!matchingAircraft) {
      return {
        label: 'Sin sugerencia automatica',
        detail: 'No hay aeronave registrada compatible o disponible para este request.',
        available: false,
      }
    }

    return {
      label: `${matchingAircraft.name} · ${matchingAircraft.registration || matchingAircraft.base || 'Sin matricula'}`,
      detail:
        getAircraftLiveStatus?.(matchingAircraft).label === 'Disponible'
          ? 'Compatible, disponible y con cobertura operativa.'
          : 'Compatible, pero requiere revisar disponibilidad antes de aceptar.',
      available: getAircraftLiveStatus?.(matchingAircraft).label === 'Disponible',
    }
  }

  function getRequestServiceTierLabel(request = {}) {
    const raw = String(
      request.serviceTier || request.flightPackage || request.priorityType || '',
    ).trim()
    if (!raw) return 'Essential'

    const normalized = raw.toLowerCase().replace(/[\s-]+/g, '_')
    if (normalized === 'business') return 'Business'
    if (normalized === 'elite') return 'Elite'
    if (normalized === 'empty_leg') return 'Empty Leg'
    if (normalized === 'essential') return 'Essential'
    return raw
  }

  function getRequestServiceTierTone(request = {}) {
    const normalized = String(
      request.priorityType || request.serviceTier || request.flightPackage || '',
    )
      .toLowerCase()
      .replace(/[\s-]+/g, '_')
    if (normalized === 'elite') return 'danger'
    if (normalized === 'business') return 'warning'
    return 'neutral'
  }

  function getRequestTripTypeLabel(request = {}) {
    const normalized = String(request.tripType || '').toLowerCase().trim()
    if (normalized === 'round_trip') return 'Round trip'
    if (normalized === 'multi_leg' || normalized === 'multi_city') return 'Multi-destino'
    if (normalized === 'one_way') return 'One way'
    return request.tripType || 'One way'
  }

  function buildRequestLegs(request = {}) {
    if (!request?.id) return []

    const rawLegs = Array.isArray(request.requirements) ? request.requirements : []
    const suggestion = getRequestSuggestedAircraft(request)
    const primaryLeg = {
      id: `${request.id}-0`,
      index: 1,
      origin: request.origin,
      destination: request.destination,
      date: request.date,
      passengers: request.passengers || 0,
      status: suggestion.available ? 'Disponible' : 'Revisar',
      action: suggestion.available ? 'Listo para aceptar' : 'Revisar disponibilidad',
      aircraft: suggestion.label,
      comments: request.internalComment || '',
      operationalCost: request.finalPrice || request.quote || 0,
    }

    const extraLegs = rawLegs.map((leg, index) => {
      const legDate = leg.departure_datetime || leg.date || leg.departure_date || request.date
      const legPassengers = Number(leg.passengers || leg.passenger_count || request.passengers || 0)
      const needsReview = !leg.origin || !leg.destination || !legDate

      return {
        id: `${request.id}-${index + 1}`,
        index: index + 2,
        origin: leg.origin || leg.base_airport || 'N/D',
        destination: leg.destination || leg.arrival_airport || 'N/D',
        date: legDate,
        passengers: legPassengers,
        status: needsReview ? 'Pendiente' : index % 2 === 0 ? 'Disponible' : 'Revisar',
        action:
          needsReview
            ? 'Esperando datos'
            : index % 2 === 0
              ? 'Listo para aceptar'
              : 'Revisar disponibilidad',
        aircraft: leg.aircraft || leg.assigned_aircraft || primaryLeg.aircraft,
        comments: leg.comment || leg.notes || '',
        operationalCost: Number(leg.operational_fee || leg.cost || 0),
      }
    })

    return [primaryLeg, ...extraLegs]
  }

  function selectRequest(id, filteredRequests = []) {
    const source = filteredRequests.length ? filteredRequests : filteredRequests?.value || ctx.filteredRequests?.value || []
    const matchedRequest = findOperatorRequestByIdentifier(source, id)
    selectedRequestId.value = String(matchedRequest?.id || id || '')
  }

  function applyLocalRequestStatusUpdate(id, status, workflowStatus = '') {
    const normalizedId = String(id)
    requests.value = requests.value.map((request) => {
      if (String(request.id) !== normalizedId) return request

      const normalizedStatus = status === 'Aceptada' ? workflowStatus || 'accepted' : 'rejected'
      const updatedAt = new Date().toISOString()
      const nextRaw = {
        ...(request.raw && typeof request.raw === 'object' ? request.raw : {}),
        status: normalizedStatus,
        workflow_status: normalizedStatus,
        workflow: normalizedStatus,
        updated_at: updatedAt,
      }

      const nextRequest = {
        ...request,
        status: normalizedStatus,
        workflowStatus: normalizedStatus,
        rawWorkflowStatus: normalizedStatus,
        updatedAt,
        raw: nextRaw,
      }
      const workflowPayload = buildWorkflowApiPayload(normalizedStatus)
      getRequestWorkflowOverrideKeys(nextRequest).forEach((key) => {
        requestWorkflowLocalOverrides[key] = {
          workflowStatus: normalizedStatus,
          status: workflowPayload.status || normalizedStatus,
          updatedAt,
        }
      })

      return nextRequest
    })
  }

  function getRequestWorkflowOverrideKeys(request = {}) {
    return [
      request?.id,
      request?.requestId,
      request?.reservationId,
      request?.flight_request_id,
      request?.request_id,
      request?.booking_id,
      request?.reservation_id,
      request?.raw?.id,
      request?.raw?.request_id,
      request?.raw?.flight_request_id,
      request?.raw?.reservation_id,
      request?.raw?.booking_id,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  }

  function getRequestHelperCopy(request = {}) {
    const workflowValue = resolveRequestWorkflowValue(request)
    const workflowId = resolveWorkflowState(workflowValue).id
    const visualStepId = resolveOperatorVisualStepId(workflowValue)

    if (workflowId === 'provider_pending' || workflowId === 'reserved') {
      return 'Pendiente de respuesta del proveedor. Acepta o rechaza la solicitud para continuar el flujo.'
    }

    if (workflowId === 'tracking_live') {
      return 'La solicitud ya esta en tracking activo y se separa de la bandeja de decision del proveedor.'
    }

    if (workflowId === 'rejected' || workflowId === 'cancelled') {
      return getSharedWorkflowActionCopy?.(workflowValue).detail || 'Solicitud cerrada.'
    }

    return (
      getSharedWorkflowStepDescription?.(visualStepId, 'current') ||
      getSharedWorkflowActionCopy?.(workflowValue).detail ||
      'Pendiente de decision'
    )
  }

  function isUpdatingRequestStatus(requestId, action = '') {
    if (!requestStatusUpdate.requestId) return false
    if (String(requestStatusUpdate.requestId) !== String(requestId)) return false
    return action ? requestStatusUpdate.action === action : true
  }

  return {
    applyLocalRequestStatusUpdate,
    buildOperatorRequestFlowSteps,
    buildRequestLegs,
    getRequestClientLabel,
    getRequestHelperCopy,
    getRequestPriorityMeta,
    getRequestQuoteLabel,
    getRequestResponseCountdown,
    getRequestServiceTierLabel,
    getRequestServiceTierTone,
    getRequestStatusCopy,
    getRequestStatusMeta,
    getRequestSuggestedAircraft,
    getRequestTripTypeLabel,
    isRequestAccepted,
    isRequestPendingValidation,
    isRequestRejected,
    isUpdatingRequestStatus,
    operatorWorkflowRank,
    preferOperatorWorkflowValue,
    getRequestWorkflowOverrideKeys,
    resolveOperatorVisualStepId,
    resolveRequestStatusFilterTarget,
    resolveRequestWorkflowValue,
    selectRequest,
  }
}
