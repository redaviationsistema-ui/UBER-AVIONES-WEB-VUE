export function createOperatorPortalReleaseDomain(ctx = {}) {
  const {
    props,
    aircraft,
    releaseProviderRequest,
    selectedRequest,
    providerOperationalReleaseForm,
    providerOperationalReleaseDirty,
    providerOperationalReleaseHydrating,
    providerOperationalReleaseLoadedRequestId,
    providerOperationalReleaseLastHydratedSourceStamp,
    providerOperationalReleaseAutosaveQueued,
    providerOperationalReleaseFeedback,
    providerOperationalReleaseActiveStep,
    providerOperationalIssueOpen,
    providerOperationalIssueForm,
    providerOperationalReleaseLocalOverrides,
    requestWorkflowLocalOverrides,
    providerOperationalReleaseAutosaveTimerRef,
    windowRef,
    createEmptyProviderOperationalReleaseForm,
    getRequestSuggestedAircraft,
    resolveWorkflowState,
    resolveRequestWorkflowValue,
    resolveOperatorRequestStatusSource,
    buildWorkflowApiPayload,
    normalizeProviderOperationalBinaryStatus,
    normalizeProviderOperationalCrewOverallStatus,
    normalizeProviderOperationalAircraftOverallStatus,
    PROVIDER_OPERATIONAL_RELEASE_AUTOSAVE_MS,
  } = ctx

  function syncProviderOperationalDerivedStatuses() {
    const aircraftReady =
      providerOperationalReleaseForm.aircraftId &&
      providerOperationalReleaseForm.availabilityConfirmed &&
      providerOperationalReleaseForm.maintenanceClear &&
      providerOperationalReleaseForm.routeCoverageConfirmed

    const crewReady =
      normalizeProviderOperationalBinaryStatus(providerOperationalReleaseForm.captainStatus) === 'confirmed' &&
      normalizeProviderOperationalBinaryStatus(providerOperationalReleaseForm.copilotStatus) === 'confirmed' &&
      normalizeProviderOperationalBinaryStatus(providerOperationalReleaseForm.crewAvailabilityStatus) === 'confirmed' &&
      normalizeProviderOperationalBinaryStatus(providerOperationalReleaseForm.crewRequirementsStatus) === 'confirmed' &&
      providerOperationalReleaseForm.crewScheduleConfirmed &&
      providerOperationalReleaseForm.crewDocumentsReady

    if (aircraftReady && !['ready', 'available'].includes(providerOperationalReleaseForm.aircraftOverallStatus)) {
      providerOperationalReleaseForm.aircraftOverallStatus = 'ready'
    }
    if (crewReady && providerOperationalReleaseForm.crewOverallStatus !== 'confirmed') {
      providerOperationalReleaseForm.crewOverallStatus = 'confirmed'
    }
  }

  function clearProviderOperationalReleaseAutosaveTimer() {
    if (providerOperationalReleaseAutosaveTimerRef.value) {
      windowRef.clearTimeout(providerOperationalReleaseAutosaveTimerRef.value)
      providerOperationalReleaseAutosaveTimerRef.value = null
    }
  }

  function resetProviderOperationalReleaseForm() {
    clearProviderOperationalReleaseAutosaveTimer()
    providerOperationalReleaseHydrating.value = true
    Object.assign(providerOperationalReleaseForm, createEmptyProviderOperationalReleaseForm())
    providerOperationalReleaseHydrating.value = false
    providerOperationalReleaseDirty.value = false
    providerOperationalReleaseLoadedRequestId.value = ''
    providerOperationalReleaseLastHydratedSourceStamp.value = ''
    providerOperationalReleaseAutosaveQueued.value = false
    providerOperationalReleaseFeedback.value = ''
  }

  function getProviderOperationalReleaseRequestId(request = null) {
    return String(request?.id || request?.requestId || request?.reservationId || request?.raw?.id || '').trim()
  }

  function getProviderOperationalReleaseStatusMeta(status = 'pending') {
    if (status === 'operational_ready') return { label: 'Operational ready', tone: 'success', detail: 'Aeronave, Tripulaciony despacho ya quedaron listos para confirmar vuelo.' }
    if (status === 'crew_confirmed') return { label: 'Crew confirmed', tone: 'info', detail: 'La Tripulacionya fue validada y falta cerrar despacho final de la aeronave.' }
    if (status === 'aircraft_confirmed') return { label: 'Aircraft confirmed', tone: 'warning', detail: 'La aeronave ya fue validada y falta completar Tripulaciony liberacion final.' }
    return { label: 'Pendiente operativa', tone: 'neutral', detail: 'La liberacion operativa aun no ha sido cerrada por el proveedor.' }
  }

  function resolveProviderOperationalReleaseSource(raw = {}) {
    return (
      (raw.provider_operational_release && typeof raw.provider_operational_release === 'object' ? raw.provider_operational_release : null) ||
      (raw.operational_release && typeof raw.operational_release === 'object' ? raw.operational_release : null) ||
      (raw.release_checklist && typeof raw.release_checklist === 'object' ? raw.release_checklist : null) ||
      (raw.visibility_payload?.provider_operational_release && typeof raw.visibility_payload.provider_operational_release === 'object'
        ? raw.visibility_payload.provider_operational_release
        : null) ||
      null
    )
  }

  function normalizeProviderOperationalRelease(request = {}) {
    const raw = request?.raw && typeof request.raw === 'object' ? request.raw : request || {}
    const source = resolveProviderOperationalReleaseSource(raw) || {}
    const aircraftCandidate = source.aircraft_id || source.aircraftId || raw.assigned_aircraft_id || raw.aircraft_id || ''
    const operationalStatus =
      source.status ||
      raw.operational_status ||
      raw.operation_release_status ||
      (raw.operational_ready || source.operational_ready
        ? 'operational_ready'
        : raw.crew_confirmed || source.crew_confirmed
          ? 'crew_confirmed'
          : raw.aircraft_confirmed || source.aircraft_confirmed
            ? 'aircraft_confirmed'
            : 'pending')

    return {
      status: ['aircraft_confirmed', 'crew_confirmed', 'operational_ready'].includes(operationalStatus) ? operationalStatus : 'pending',
      aircraftId: aircraftCandidate ? String(aircraftCandidate) : '',
      aircraftOverallStatus: normalizeProviderOperationalAircraftOverallStatus(
        source.aircraft_overall_status || source.aircraft_operational_status || source.aircraftOverallStatus || (raw.operational_ready || source.operational_ready ? 'ready' : raw.aircraft_confirmed || source.aircraft_confirmed ? 'available' : 'preparing'),
      ),
      availabilityConfirmed: Boolean(source.availability_confirmed ?? source.availabilityConfirmed ?? raw.aircraft_confirmed),
      maintenanceClear: Boolean(source.maintenance_clear ?? source.maintenanceClear),
      routeCoverageConfirmed: Boolean(source.route_coverage_confirmed ?? source.routeCoverageConfirmed),
      captainStatus: normalizeProviderOperationalBinaryStatus(source.captain_status || source.captain_assigned_status || source.captainStatus || (source.pilot_id || source.pilotId ? 'confirmed' : 'pending')),
      copilotStatus: normalizeProviderOperationalBinaryStatus(source.copilot_status || source.copilot_assigned_status || source.copilotStatus || (source.copilot_id || source.copilotId ? 'confirmed' : 'pending')),
      crewAvailabilityStatus: normalizeProviderOperationalBinaryStatus(source.crew_availability_status || source.crewAvailabilityStatus || (source.crew_available ?? source.crewAvailable)),
      crewRequirementsStatus: normalizeProviderOperationalBinaryStatus(source.crew_requirements_status || source.crewRequirementsStatus || (source.crew_requirements_confirmed ?? source.crewRequirementsConfirmed)),
      crewOverallStatus: normalizeProviderOperationalCrewOverallStatus(source.crew_overall_status || source.crew_general_status || source.crewOverallStatus || (raw.crew_confirmed || source.crew_confirmed ? 'confirmed' : 'pending')),
      crewScheduleConfirmed: Boolean(source.crew_schedule_confirmed ?? source.crewScheduleConfirmed),
      crewDocumentsReady: Boolean(source.crew_documents_ready ?? source.crewDocumentsReady),
      departureAirport: source.departure_airport || source.departureAirport || request.origin || raw.origin || '',
      arrivalAirport: source.arrival_airport || source.arrivalAirport || request.destination || raw.destination || '',
      fbo: source.fbo || source.fbo_name || source.handling_fbo || '',
      flightPlanReady: Boolean(source.flight_plan_ready ?? source.flightPlanReady),
      permitsReady: Boolean(source.permits_ready ?? source.permitsReady),
      handlingReady: Boolean(source.handling_ready ?? source.handlingReady),
      fuelReady: Boolean(source.fuel_ready ?? source.fuelReady),
      cleaningReady: Boolean(source.cleaning_ready ?? source.cleaningReady),
      documentsReady: Boolean(source.documents_ready ?? source.documentsReady),
      insuranceReady: Boolean(source.insurance_ready ?? source.insuranceReady),
      registrationReady: Boolean(source.registration_ready ?? source.registrationReady),
      logbookReady: Boolean(source.logbook_ready ?? source.logbookReady),
      notes: source.notes || source.comment || raw.operational_notes || '',
    }
  }

  function getProviderOperationalReleaseSourceStamp(request = {}) {
    const raw = request?.raw && typeof request.raw === 'object' ? request.raw : request || {}
    const source = resolveProviderOperationalReleaseSource(raw)
    return String(
      source?.updated_at ||
      raw.visibility_payload?.provider_operational_release?.updated_at ||
      raw.visibility_payload?.operational_release_updated_at ||
      raw.provider_operational_release_updated_at ||
      raw.operational_release_updated_at ||
      '',
    ).trim()
  }

  function getProviderOperationalReleaseOverrideKeys(request = {}) {
    return [request?.id, request?.requestId, request?.reservationId, request?.flight_request_id, request?.request_id, request?.booking_id, request?.reservation_id, request?.raw?.id, request?.raw?.request_id, request?.raw?.flight_request_id, request?.raw?.reservation_id, request?.raw?.booking_id]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  }

  function getRequestWorkflowOverrideKeys(request = {}) {
    return [request?.id, request?.requestId, request?.reservationId, request?.flight_request_id, request?.request_id, request?.booking_id, request?.reservation_id, request?.raw?.id, request?.raw?.request_id, request?.raw?.flight_request_id, request?.raw?.reservation_id, request?.raw?.booking_id]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  }

  function mergeRequestWithLocalWorkflow(raw = {}) {
    const overrideKeys = getRequestWorkflowOverrideKeys(raw)
    const localOverride = overrideKeys.map((key) => requestWorkflowLocalOverrides[key]).find((candidate) => candidate && typeof candidate === 'object')
    if (!localOverride || typeof localOverride !== 'object') return raw

    const backendWorkflowStatus = resolveOperatorRequestStatusSource(raw) || raw.workflow_status || raw.status || ''
    const backendRank = ctx.operatorWorkflowRank(backendWorkflowStatus)
    const localRank = ctx.operatorWorkflowRank(localOverride.workflowStatus || '')
    const backendWorkflowId = resolveWorkflowState(backendWorkflowStatus).id
    const localWorkflowId = resolveWorkflowState(localOverride.workflowStatus || '').id

    if ((backendWorkflowId && backendWorkflowId === localWorkflowId) || (backendRank && localRank && backendRank >= localRank)) {
      overrideKeys.forEach((key) => { delete requestWorkflowLocalOverrides[key] })
      return raw
    }

    return {
      ...raw,
      status: localOverride.status || localOverride.workflowStatus || raw.status,
      workflow_status: localOverride.workflowStatus || raw.workflow_status || raw.workflow,
      workflow: localOverride.workflowStatus || raw.workflow || raw.workflow_status,
      updated_at: localOverride.updatedAt || raw.updated_at,
    }
  }

  function areProviderOperationalReleasesEquivalent(backendRelease = {}, localOverride = {}) {
    const backendNormalized = normalizeProviderOperationalRelease({ provider_operational_release: backendRelease })
    const localNormalized = normalizeProviderOperationalRelease({ provider_operational_release: localOverride })
    return JSON.stringify(backendNormalized) === JSON.stringify(localNormalized)
  }

  function mergeRequestWithLocalOperationalRelease(raw = {}) {
    const overrideKeys = getProviderOperationalReleaseOverrideKeys(raw)
    const localOverride = overrideKeys.map((key) => providerOperationalReleaseLocalOverrides[key]).find((candidate) => candidate && typeof candidate === 'object')
    if (!localOverride || typeof localOverride !== 'object') return raw

    const backendRelease = resolveProviderOperationalReleaseSource(raw)
    const backendTimestamp = String(backendRelease?.updated_at || '').trim()
    const localTimestamp = String(localOverride.updated_at || '').trim()

    if (backendRelease && backendTimestamp && localTimestamp && (backendTimestamp > localTimestamp || (backendTimestamp === localTimestamp && areProviderOperationalReleasesEquivalent(backendRelease, localOverride)))) {
      overrideKeys.forEach((key) => { delete providerOperationalReleaseLocalOverrides[key] })
      return raw
    }

    return {
      ...raw,
      provider_operational_release: { ...(backendRelease && typeof backendRelease === 'object' ? backendRelease : {}), ...localOverride },
      operational_release: { ...(backendRelease && typeof backendRelease === 'object' ? backendRelease : {}), ...localOverride },
      visibility_payload: {
        ...(raw.visibility_payload && typeof raw.visibility_payload === 'object' ? raw.visibility_payload : {}),
        provider_operational_release: {
          ...(raw.visibility_payload?.provider_operational_release && typeof raw.visibility_payload.provider_operational_release === 'object' ? raw.visibility_payload.provider_operational_release : {}),
          ...(backendRelease && typeof backendRelease === 'object' ? backendRelease : {}),
          ...localOverride,
        },
        operational_status: localOverride.status || raw.visibility_payload?.operational_status,
      },
      operational_status: localOverride.status || raw.operational_status,
      aircraft_confirmed: ['aircraft_confirmed', 'crew_confirmed', 'operational_ready'].includes(localOverride.status) || raw.aircraft_confirmed,
      crew_confirmed: ['crew_confirmed', 'operational_ready'].includes(localOverride.status) || raw.crew_confirmed,
      operational_ready: localOverride.status === 'operational_ready' || raw.operational_ready,
    }
  }

  function getActiveProviderReleaseRequest() {
    return props.section === 'release-provider' ? releaseProviderRequest.value : selectedRequest.value
  }

  function hydrateProviderOperationalReleaseForm(request = null, options = {}) {
    if (!request) {
      resetProviderOperationalReleaseForm()
      return
    }
    const requestId = getProviderOperationalReleaseRequestId(request)
    const shouldForce = Boolean(options?.force)
    if (!shouldForce && providerOperationalReleaseDirty.value && providerOperationalReleaseLoadedRequestId.value && providerOperationalReleaseLoadedRequestId.value === requestId) {
      return
    }

    const normalized = normalizeProviderOperationalRelease(request)
    const suggestedAircraft = getRequestSuggestedAircraft(request)
    const suggestedAircraftId =
      aircraft.value.find((item) => suggestedAircraft.label.includes(item.registration || ''))?.id ||
      aircraft.value.find((item) => suggestedAircraft.label.includes(item.name || ''))?.id ||
      ''

    providerOperationalReleaseHydrating.value = true
    Object.assign(providerOperationalReleaseForm, {
      ...createEmptyProviderOperationalReleaseForm(),
      ...normalized,
      aircraftId: normalized.aircraftId || (suggestedAircraftId ? String(suggestedAircraftId) : ''),
      departureAirport: normalized.departureAirport || request.origin || '',
      arrivalAirport: normalized.arrivalAirport || request.destination || '',
    })
    providerOperationalReleaseHydrating.value = false
    providerOperationalReleaseDirty.value = false
    providerOperationalReleaseLoadedRequestId.value = requestId
    providerOperationalReleaseLastHydratedSourceStamp.value = getProviderOperationalReleaseSourceStamp(request)
  }

  function getProviderOperationalReleaseAircraftRecord() {
    return aircraft.value.find((item) => String(item.id || '') === String(providerOperationalReleaseForm.aircraftId || '')) || null
  }

  function getProviderOperationalReleaseAircraftLabel() {
    const plane = getProviderOperationalReleaseAircraftRecord()
    if (plane) return `${plane.name}${plane.registration ? ` · ${plane.registration}` : ''}`
    const request = getActiveProviderReleaseRequest()
    return request ? getRequestSuggestedAircraft(request).label : 'Aeronave por definir'
  }

  function scheduleProviderOperationalReleaseAutosave() {
    if (props.section !== 'release-provider') return
    const request = getActiveProviderReleaseRequest()
    if (!request || !canManageProviderOperationalRelease(request)) return
    if (!isProviderOperationalReady()) return
    clearProviderOperationalReleaseAutosaveTimer()
    providerOperationalReleaseAutosaveTimerRef.value = windowRef.setTimeout(() => {
      void ctx.persistProviderOperationalReleaseDraft()
    }, PROVIDER_OPERATIONAL_RELEASE_AUTOSAVE_MS)
  }

  function isProviderOperationalStatusConfirmed(value = '') {
    return normalizeProviderOperationalBinaryStatus(value) === 'confirmed'
  }

  function isProviderAircraftConfirmedReady() {
    return Boolean(providerOperationalReleaseForm.aircraftId && ['available', 'ready'].includes(providerOperationalReleaseForm.aircraftOverallStatus) && providerOperationalReleaseForm.availabilityConfirmed && providerOperationalReleaseForm.maintenanceClear && providerOperationalReleaseForm.routeCoverageConfirmed)
  }

  function isProviderCrewConfirmedReady() {
    return Boolean(isProviderAircraftConfirmedReady() && isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.captainStatus) && isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.copilotStatus) && isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.crewAvailabilityStatus) && isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.crewRequirementsStatus) && providerOperationalReleaseForm.crewOverallStatus === 'confirmed' && providerOperationalReleaseForm.crewScheduleConfirmed && providerOperationalReleaseForm.crewDocumentsReady)
  }

  function isProviderOperationalReady() {
    return Boolean(isProviderCrewConfirmedReady() && providerOperationalReleaseForm.departureAirport && providerOperationalReleaseForm.arrivalAirport && providerOperationalReleaseForm.fbo && providerOperationalReleaseForm.flightPlanReady && providerOperationalReleaseForm.permitsReady && providerOperationalReleaseForm.handlingReady && providerOperationalReleaseForm.fuelReady && providerOperationalReleaseForm.cleaningReady && providerOperationalReleaseForm.documentsReady && providerOperationalReleaseForm.insuranceReady && providerOperationalReleaseForm.registrationReady && providerOperationalReleaseForm.logbookReady)
  }

  function deriveProviderOperationalReleaseStatus() {
    if (isProviderOperationalReady()) return 'operational_ready'
    if (isProviderCrewConfirmedReady()) return 'crew_confirmed'
    if (isProviderAircraftConfirmedReady()) return 'aircraft_confirmed'
    return 'pending'
  }

  function getProviderOperationalReleaseCurrentStatus() {
    const order = ['pending', 'aircraft_confirmed', 'crew_confirmed', 'operational_ready']
    const storedStatus = providerOperationalReleaseForm.status || 'pending'
    const derivedStatus = deriveProviderOperationalReleaseStatus()
    return order.indexOf(derivedStatus) > order.indexOf(storedStatus) ? derivedStatus : storedStatus
  }

  function getProviderOperationalWorkflowStage(request = getActiveProviderReleaseRequest()) {
    return resolveWorkflowState(resolveRequestWorkflowValue(request)).id
  }

  function isProviderReleaseFinalized(request = getActiveProviderReleaseRequest()) {
    return getProviderOperationalWorkflowStage(request) === 'completed'
  }

  function getProviderReleasePrimaryActionLabel(request = getActiveProviderReleaseRequest()) {
    const workflowId = getProviderOperationalWorkflowStage(request)
    if (workflowId === 'completed') return 'Vuelo finalizado'
    if (workflowId === 'tracking_live') return 'Finalizar vuelo'
    return 'Confirmar liberacion operativa'
  }

  function getProviderReleaseLoadingTitle(request = getActiveProviderReleaseRequest()) {
    const workflowId = getProviderOperationalWorkflowStage(request)
    if (workflowId === 'tracking_live') return 'Finalizando vuelo'
    return 'Enviando liberacion operativa'
  }

  function getProviderReleaseLoadingMessage(request = getActiveProviderReleaseRequest()) {
    const workflowId = getProviderOperationalWorkflowStage(request)
    if (workflowId === 'tracking_live') {
      return 'Estamos cerrando el flujo compartido, registrando la operacion final y notificando la actualizacion del vuelo.'
    }
    return 'Estamos validando la confirmacion operacional, guardando el avance del proveedor y sincronizando el siguiente paso del vuelo.'
  }

  function getProviderReleasePrimaryActionStatus(request = getActiveProviderReleaseRequest()) {
    const workflowId = getProviderOperationalWorkflowStage(request)
    if (workflowId === 'completed') return 'completed'
    if (workflowId === 'tracking_live') return 'tracking_live'
    return 'operational_ready'
  }

  function canManageProviderOperationalRelease(request = {}) {
    const workflowId = resolveWorkflowState(resolveRequestWorkflowValue(request)).id
    return [
      'contract_pending',
      'contract_signed',
      'payment_pending',
      'payment_confirmed',
      'flight_confirmed',
      'tracking_live',
      'completed',
    ].includes(workflowId)
  }

  function buildProviderOperationalReleaseChecklist() {
    return [
      { title: 'Disponibilidad real de aeronave', items: [
        { label: 'Aeronave sigue disponible', done: providerOperationalReleaseForm.availabilityConfirmed },
        { label: 'Sin mantenimiento pendiente', done: providerOperationalReleaseForm.maintenanceClear },
        { label: 'Puede cubrir la ruta completa', done: providerOperationalReleaseForm.routeCoverageConfirmed },
      ]},
      { title: 'Tripulacion', items: [
        { label: 'Capitan asignado', done: isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.captainStatus) },
        { label: 'Copiloto asignado', done: isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.copilotStatus) },
        { label: 'Tripulacion disponible para la fecha', done: isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.crewAvailabilityStatus) },
        { label: 'Tripulacion cumple requisitos', done: isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.crewRequirementsStatus) },
        { label: 'Horarios confirmados', done: providerOperationalReleaseForm.crewScheduleConfirmed },
        { label: 'Documentacion operativa validada', done: providerOperationalReleaseForm.crewDocumentsReady },
      ]},
    ]
  }

  function getProviderOperationalReleaseProgress() {
    const sections = buildProviderOperationalReleaseChecklist()
    const items = sections.flatMap((section) => section.items)
    const done = items.filter((item) => item.done).length
    return { done, total: items.length, percentage: items.length ? Math.round((done / items.length) * 100) : 0 }
  }

  function getProviderOperationalAircraftSectionStatus() {
    if (['not_available', 'maintenance'].includes(providerOperationalReleaseForm.aircraftOverallStatus)) {
      return { label: 'No disponible', tone: 'danger', detail: 'La aeronave requiere atencion antes de operar.' }
    }
    if (isProviderAircraftConfirmedReady()) {
      return { label: 'Confirmada', tone: 'success', detail: 'Disponibilidad, mantenimiento y cobertura ya fueron validados.' }
    }
    if (providerOperationalReleaseForm.aircraftOverallStatus === 'preparing') {
      return { label: 'En preparacion', tone: 'warning', detail: 'La aeronave sigue en preparacion operativa.' }
    }
    return { label: 'Pendiente', tone: 'neutral', detail: 'Aun faltan confirmaciones de disponibilidad real.' }
  }

  function getProviderOperationalCrewSectionStatus() {
    if (isProviderCrewConfirmedReady()) {
      return { label: 'Confirmada', tone: 'success', detail: 'La Tripulacion ya quedo validada sin exponer datos personales.' }
    }
    if (providerOperationalReleaseForm.crewOverallStatus === 'not_available') {
      return { label: 'No disponible', tone: 'danger', detail: 'No hay tripulacion completa para esta operacion.' }
    }
    if (providerOperationalReleaseForm.crewOverallStatus === 'red_aviation_review') {
      return { label: 'Revision Red Aviation', tone: 'warning', detail: 'Red Aviation debe coordinar apoyo o validacion adicional.' }
    }
    if (
      isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.captainStatus) ||
      isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.copilotStatus) ||
      isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.crewAvailabilityStatus)
    ) {
      return { label: 'En proceso', tone: 'warning', detail: 'La Tripulacion avanza, pero aun faltan validaciones.' }
    }
    return { label: 'Pendiente', tone: 'neutral', detail: 'La validacion tecnica de tripulacion aun no inicia.' }
  }

  function getProviderOperationalDispatchSectionStatus() {
    const doneCount = [
      providerOperationalReleaseForm.departureAirport,
      providerOperationalReleaseForm.arrivalAirport,
      providerOperationalReleaseForm.fbo,
      providerOperationalReleaseForm.flightPlanReady,
      providerOperationalReleaseForm.permitsReady,
      providerOperationalReleaseForm.handlingReady,
    ].filter(Boolean).length

    if (
      providerOperationalReleaseForm.departureAirport &&
      providerOperationalReleaseForm.arrivalAirport &&
      providerOperationalReleaseForm.fbo &&
      providerOperationalReleaseForm.flightPlanReady &&
      providerOperationalReleaseForm.permitsReady &&
      providerOperationalReleaseForm.handlingReady
    ) {
      return { label: 'Confirmado', tone: 'success', detail: 'Despacho, permisos y handling ya estan listos.' }
    }

    if (doneCount > 0) {
      return { label: 'En proceso', tone: 'warning', detail: 'Permisos, slots y handling siguen en curso.' }
    }
    return { label: 'Pendiente', tone: 'neutral', detail: 'Todavia no hay confirmacion operativa de despacho.' }
  }

  function getProviderOperationalReadinessSectionStatus() {
    if (
      providerOperationalReleaseForm.fuelReady &&
      providerOperationalReleaseForm.cleaningReady &&
      providerOperationalReleaseForm.documentsReady &&
      providerOperationalReleaseForm.insuranceReady &&
      providerOperationalReleaseForm.registrationReady &&
      providerOperationalReleaseForm.logbookReady
    ) {
      return { label: 'Lista', tone: 'success', detail: 'Combustible, documentos y alistamiento final ya estan completos.' }
    }

    return { label: 'Falta alistamiento', tone: 'warning', detail: 'Aun quedan pendientes de combustible, documentacion o bitacora.' }
  }

  function getProviderOperationalFinalSummary() {
    return [
      {
        label: 'Aeronave',
        statusLabel: getProviderOperationalAircraftSectionStatus().label,
        detail: getProviderOperationalAircraftSectionStatus().detail,
        tone: getProviderOperationalAircraftSectionStatus().tone,
      },
      {
        label: 'Tripulacion',
        statusLabel: getProviderOperationalCrewSectionStatus().label,
        detail: getProviderOperationalCrewSectionStatus().detail,
        tone: getProviderOperationalCrewSectionStatus().tone,
      },
      {
        label: 'Permisos, slots y handling',
        statusLabel: getProviderOperationalDispatchSectionStatus().label,
        detail: getProviderOperationalDispatchSectionStatus().detail,
        tone: getProviderOperationalDispatchSectionStatus().tone,
      },
      {
        label: 'Aeronave lista',
        statusLabel: getProviderOperationalReadinessSectionStatus().label,
        detail: getProviderOperationalReadinessSectionStatus().detail,
        tone: getProviderOperationalReadinessSectionStatus().tone,
      },
    ]
  }

  function getProviderOperationalSectionCompletion(items = []) {
    const done = items.filter((item) => item.done).length
    return { done, total: items.length }
  }

  function buildProviderOperationalWizardSections() {
    const checklist = buildProviderOperationalReleaseChecklist()
    const aircraftSection = checklist[0]
    const crewSection = checklist[1]
    const dispatchSection = checklist[2]
    const readinessSection = checklist[3]
    const aircraftCompletion = getProviderOperationalSectionCompletion(aircraftSection?.items || [])
    const crewCompletion = getProviderOperationalSectionCompletion(crewSection?.items || [])
    const dispatchCompletion = getProviderOperationalSectionCompletion(dispatchSection?.items || [])
    const readinessCompletion = getProviderOperationalSectionCompletion(readinessSection?.items || [])

    return [
      {
        id: 'aircraft',
        number: 1,
        title: 'Disponibilidad real de aeronave',
        shortTitle: 'Aeronave',
        status: getProviderOperationalAircraftSectionStatus(),
        completion: aircraftCompletion,
        optional: false,
        locked: false,
      },
      {
        id: 'crew',
        number: 2,
        title: 'Tripulacion',
        shortTitle: 'Tripulacion',
        status: getProviderOperationalCrewSectionStatus(),
        completion: crewCompletion,
        optional: false,
        locked: false,
      },
      {
        id: 'dispatch',
        number: 3,
        title: 'Permisos / slots / handling',
        shortTitle: 'Handling',
        status: getProviderOperationalDispatchSectionStatus(),
        completion: dispatchCompletion,
        optional: false,
        locked: false,
      },
      {
        id: 'readiness',
        number: 4,
        title: 'Aeronave lista',
        shortTitle: 'Alistamiento',
        status: getProviderOperationalReadinessSectionStatus(),
        completion: readinessCompletion,
        optional: false,
        locked: false,
      },
      {
        id: 'issue',
        number: 5,
        title: 'Incidencia operativa',
        shortTitle: 'Incidencia',
        status: {
          label:
            providerOperationalIssueOpen.value || providerOperationalIssueForm.comment.trim()
              ? 'Atencion abierta'
              : 'Opcional',
          tone:
            providerOperationalIssueOpen.value || providerOperationalIssueForm.comment.trim()
              ? 'warning'
              : 'neutral',
          detail: 'Usa este bloque solo si existe un bloqueo operativo real.',
        },
        completion: { done: providerOperationalIssueForm.comment.trim() ? 1 : 0, total: 1 },
        optional: true,
        locked: false,
      },
      {
        id: 'final',
        number: 6,
        title: 'Confirmacion final',
        shortTitle: 'Confirmacion',
        status: {
          label: isProviderOperationalReady() ? 'Lista' : 'Bloqueada',
          tone: isProviderOperationalReady() ? 'success' : 'neutral',
          detail: isProviderOperationalReady()
            ? 'Todo esta listo para confirmar la liberacion operativa.'
            : 'Faltan validaciones antes de confirmar la liberacion.',
        },
        completion: { done: isProviderOperationalReady() ? 1 : 0, total: 1 },
        optional: false,
        locked: !isProviderOperationalReady(),
      },
    ]
  }

  function setProviderOperationalActiveStep(stepId = 'aircraft') {
    providerOperationalReleaseActiveStep.value = stepId
  }

  function toggleProviderOperationalIssuePanel(forceValue) {
    providerOperationalIssueOpen.value = typeof forceValue === 'boolean' ? forceValue : !providerOperationalIssueOpen.value
  }

  function requestProviderOperationalSupport() {
    providerOperationalIssueOpen.value = true
    setProviderOperationalActiveStep('issue')
  }

  return {
    areProviderOperationalReleasesEquivalent,
    buildProviderOperationalReleaseChecklist,
    canManageProviderOperationalRelease,
    clearProviderOperationalReleaseAutosaveTimer,
    deriveProviderOperationalReleaseStatus,
    getActiveProviderReleaseRequest,
    getProviderOperationalReleaseAircraftLabel,
    getProviderOperationalReleaseAircraftRecord,
    getProviderOperationalReleaseCurrentStatus,
    getProviderOperationalReleaseOverrideKeys,
    getProviderOperationalReleaseProgress,
    getProviderOperationalReleaseRequestId,
    getProviderOperationalReleaseSourceStamp,
    getProviderOperationalReleaseStatusMeta,
    getProviderOperationalWorkflowStage,
    getProviderReleaseLoadingMessage,
    getProviderReleaseLoadingTitle,
    getProviderReleasePrimaryActionLabel,
    getProviderReleasePrimaryActionStatus,
    getProviderOperationalAircraftSectionStatus,
    getProviderOperationalCrewSectionStatus,
    getProviderOperationalDispatchSectionStatus,
    getProviderOperationalReadinessSectionStatus,
    getProviderOperationalFinalSummary,
    getProviderOperationalSectionCompletion,
    getRequestWorkflowOverrideKeys,
    hydrateProviderOperationalReleaseForm,
    isProviderAircraftConfirmedReady,
    isProviderCrewConfirmedReady,
    isProviderOperationalReady,
    isProviderOperationalStatusConfirmed,
    isProviderReleaseFinalized,
    mergeRequestWithLocalOperationalRelease,
    mergeRequestWithLocalWorkflow,
    normalizeProviderOperationalRelease,
    buildProviderOperationalWizardSections,
    requestProviderOperationalSupport,
    resetProviderOperationalReleaseForm,
    resolveProviderOperationalReleaseSource,
    scheduleProviderOperationalReleaseAutosave,
    setProviderOperationalActiveStep,
    syncProviderOperationalDerivedStatuses,
    toggleProviderOperationalIssuePanel,
  }
}
