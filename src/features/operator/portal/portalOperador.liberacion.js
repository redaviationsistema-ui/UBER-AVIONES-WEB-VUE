export function createEmptyProviderOperationalReleaseForm() {
  return {
    status: 'pending',
    aircraftId: '',
    aircraftOverallStatus: 'preparing',
    availabilityConfirmed: false,
    maintenanceClear: false,
    routeCoverageConfirmed: false,
    captainStatus: 'pending',
    copilotStatus: 'pending',
    crewAvailabilityStatus: 'pending',
    crewRequirementsStatus: 'pending',
    crewOverallStatus: 'pending',
    crewScheduleConfirmed: false,
    crewDocumentsReady: false,
    departureAirport: '',
    arrivalAirport: '',
    fbo: '',
    flightPlanReady: false,
    permitsReady: false,
    handlingReady: false,
    fuelReady: false,
    cleaningReady: false,
    documentsReady: false,
    insuranceReady: false,
    registrationReady: false,
    logbookReady: false,
    notes: '',
  }
}

export function normalizeProviderOperationalBinaryStatus(value, fallback = 'pending') {
  if (typeof value === 'boolean') {
    return value ? 'confirmed' : fallback
  }

  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()

  if (!normalized) return fallback

  if (
    [
      'confirmed',
      'confirmado',
      'si',
      'sí',
      'yes',
      'true',
      '1',
      'available',
      'ready',
      'approved',
      'aprobado',
    ].includes(normalized)
  ) {
    return 'confirmed'
  }

  if (
    [
      'needs_support',
      'need_support',
      'support',
      'requires_support',
      'requiere_apoyo',
      'requiere apoyo',
    ].includes(normalized)
  ) {
    return 'needs_support'
  }

  return fallback
}

export function normalizeProviderOperationalCrewOverallStatus(value, fallback = 'pending') {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()

  if (!normalized) return fallback
  if (
    ['confirmed', 'confirmada', 'confirmado', 'si', 'sí', 'yes', 'true', '1'].includes(
      normalized,
    )
  ) {
    return 'confirmed'
  }
  if (
    ['not_available', 'not available', 'no_disponible', 'no disponible', 'unavailable'].includes(
      normalized,
    )
  ) {
    return 'not_available'
  }
  if (
    [
      'red_aviation_review',
      'red aviation review',
      'requiere revision de red aviation',
      'requiere revisión de red aviation',
      'review',
      'needs_review',
    ].includes(normalized)
  ) {
    return 'red_aviation_review'
  }
  return fallback
}

export function normalizeProviderOperationalAircraftOverallStatus(value, fallback = 'preparing') {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()

  if (!normalized) return fallback
  if (['ready', 'lista', 'lista para operacion', 'lista para operación'].includes(normalized)) {
    return 'ready'
  }
  if (['available', 'disponible'].includes(normalized)) return 'available'
  if (
    ['not_available', 'not available', 'no_disponible', 'no disponible', 'unavailable'].includes(
      normalized,
    )
  ) {
    return 'not_available'
  }
  if (
    ['maintenance', 'requiere mantenimiento', 'mantenimiento', 'needs_maintenance'].includes(
      normalized,
    )
  ) {
    return 'maintenance'
  }
  return fallback
}

export function createOperatorPortalReleaseHelpers({
  providerOperationalReleaseForm,
  providerOperationalIssueOpen,
  providerOperationalIssueForm,
  providerOperationalReleaseActiveStep,
  providerOperationalReleaseFeedback,
  getActiveProviderReleaseRequest,
  resolveWorkflowState,
  resolveRequestWorkflowValue,
  ui,
}) {
  function isProviderOperationalStatusConfirmed(value = '') {
    return normalizeProviderOperationalBinaryStatus(value) === 'confirmed'
  }

  function isProviderAircraftConfirmedReady() {
    return Boolean(
      providerOperationalReleaseForm.aircraftId &&
        ['available', 'ready'].includes(providerOperationalReleaseForm.aircraftOverallStatus) &&
        providerOperationalReleaseForm.availabilityConfirmed &&
        providerOperationalReleaseForm.maintenanceClear &&
        providerOperationalReleaseForm.routeCoverageConfirmed,
    )
  }

  function isProviderCrewConfirmedReady() {
    return Boolean(
      isProviderAircraftConfirmedReady() &&
        isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.captainStatus) &&
        isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.copilotStatus) &&
        isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.crewAvailabilityStatus) &&
        isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.crewRequirementsStatus) &&
        providerOperationalReleaseForm.crewOverallStatus === 'confirmed' &&
        providerOperationalReleaseForm.crewScheduleConfirmed &&
        providerOperationalReleaseForm.crewDocumentsReady,
    )
  }

  function isProviderOperationalReady() {
    return Boolean(
      isProviderCrewConfirmedReady() &&
        providerOperationalReleaseForm.departureAirport &&
        providerOperationalReleaseForm.arrivalAirport &&
        providerOperationalReleaseForm.fbo &&
        providerOperationalReleaseForm.flightPlanReady &&
        providerOperationalReleaseForm.permitsReady &&
        providerOperationalReleaseForm.handlingReady &&
        providerOperationalReleaseForm.fuelReady &&
        providerOperationalReleaseForm.cleaningReady &&
        providerOperationalReleaseForm.documentsReady &&
        providerOperationalReleaseForm.insuranceReady &&
        providerOperationalReleaseForm.registrationReady &&
        providerOperationalReleaseForm.logbookReady,
    )
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
      {
        title: 'Disponibilidad real de aeronave',
        items: [
          { label: 'Aeronave sigue disponible', done: providerOperationalReleaseForm.availabilityConfirmed },
          { label: 'Sin mantenimiento pendiente', done: providerOperationalReleaseForm.maintenanceClear },
          { label: 'Puede cubrir la ruta completa', done: providerOperationalReleaseForm.routeCoverageConfirmed },
        ],
      },
      {
        title: 'Tripulacion',
        items: [
          { label: 'Capitan asignado', done: isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.captainStatus) },
          { label: 'Copiloto asignado', done: isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.copilotStatus) },
          { label: 'Tripulacion disponible para la fecha', done: isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.crewAvailabilityStatus) },
          { label: 'Tripulacion cumple requisitos', done: isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.crewRequirementsStatus) },
          { label: 'Horarios confirmados', done: providerOperationalReleaseForm.crewScheduleConfirmed },
          { label: 'Documentacion operativa validada', done: providerOperationalReleaseForm.crewDocumentsReady },
        ],
      },
      {
        title: 'Permisos, slots y handling',
        items: [
          { label: 'Aeropuerto de salida confirmado', done: Boolean(providerOperationalReleaseForm.departureAirport) },
          { label: 'Aeropuerto de llegada confirmado', done: Boolean(providerOperationalReleaseForm.arrivalAirport) },
          { label: 'FBO / handling confirmado', done: Boolean(providerOperationalReleaseForm.fbo) && providerOperationalReleaseForm.handlingReady },
          { label: 'Plan de vuelo listo', done: providerOperationalReleaseForm.flightPlanReady },
          { label: 'Permisos / slots listos', done: providerOperationalReleaseForm.permitsReady },
        ],
      },
      {
        title: 'Aeronave lista',
        items: [
          { label: 'Combustible', done: providerOperationalReleaseForm.fuelReady },
          { label: 'Limpieza', done: providerOperationalReleaseForm.cleaningReady },
          { label: 'Documentos', done: providerOperationalReleaseForm.documentsReady },
          { label: 'Seguro', done: providerOperationalReleaseForm.insuranceReady },
          { label: 'Matricula', done: providerOperationalReleaseForm.registrationReady },
          { label: 'Bitacora', done: providerOperationalReleaseForm.logbookReady },
        ],
      },
    ]
  }

  function getProviderOperationalReleaseProgress() {
    const sections = buildProviderOperationalReleaseChecklist()
    const items = sections.flatMap((section) => section.items)
    const done = items.filter((item) => item.done).length
    return {
      done,
      total: items.length,
      percentage: items.length ? Math.round((done / items.length) * 100) : 0,
    }
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
      return { label: 'Confirmada', tone: 'success', detail: 'La tripulacion ya quedo validada sin exponer datos personales.' }
    }
    if (providerOperationalReleaseForm.crewOverallStatus === 'not_available') {
      return { label: 'No disponible', tone: 'danger', detail: 'No hay tripulacion completa para esta operacion.' }
    }
    if (providerOperationalReleaseForm.crewOverallStatus === 'red_aviation_review') {
      return { label: 'Revision administrativa', tone: 'warning', detail: 'Se debe coordinar apoyo o validacion adicional.' }
    }
    if (
      isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.captainStatus) ||
      isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.copilotStatus) ||
      isProviderOperationalStatusConfirmed(providerOperationalReleaseForm.crewAvailabilityStatus)
    ) {
      return { label: 'En proceso', tone: 'warning', detail: 'La tripulacion avanza, pero aun faltan validaciones.' }
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

    if (doneCount > 0) return { label: 'En proceso', tone: 'warning', detail: 'Permisos, slots y handling siguen en curso.' }
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
    return {
      done,
      total: items.length,
    }
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
        completion: {
          done: isProviderOperationalReady() ? 1 : 0,
          total: 1,
        },
        optional: false,
        locked: !isProviderOperationalReady(),
      },
    ]
  }

  function setProviderOperationalActiveStep(stepId = 'aircraft') {
    providerOperationalReleaseActiveStep.value = stepId
  }

  function getProviderOperationalNextStep() {
    const sections = buildProviderOperationalWizardSections()
    const currentIndex = sections.findIndex(
      (section) => section.id === providerOperationalReleaseActiveStep.value,
    )

    if (currentIndex < 0) return sections[0] || null

    for (let index = currentIndex + 1; index < sections.length; index += 1) {
      const candidate = sections[index]
      if (!candidate?.locked) return candidate
    }

    return null
  }

  function canAdvanceProviderOperationalStep() {
    return Boolean(getProviderOperationalNextStep())
  }

  function getProviderOperationalNextStepLabel() {
    const nextStep = getProviderOperationalNextStep()
    if (!nextStep) return 'Checklist completo'
    return `Siguiente: ${nextStep.shortTitle || nextStep.title}`
  }

  function goToNextProviderOperationalStep() {
    const nextStep = getProviderOperationalNextStep()
    if (!nextStep) return
    setProviderOperationalActiveStep(nextStep.id)
  }

  function toggleProviderOperationalIssuePanel(forceValue) {
    providerOperationalIssueOpen.value =
      typeof forceValue === 'boolean' ? forceValue : !providerOperationalIssueOpen.value
    if (providerOperationalIssueOpen.value) {
      providerOperationalReleaseActiveStep.value = 'issue'
    }
  }

  function requestProviderOperationalSupport() {
    providerOperationalReleaseFeedback.value =
      'El equipo administrativo fue notificado para apoyar con tripulacion y coordinacion operativa.'
    providerOperationalReleaseForm.crewOverallStatus = 'red_aviation_review'
    ui.pushToast({
      tone: 'info',
      title: 'Apoyo solicitado',
      message: 'El equipo administrativo dara seguimiento a tripulacion, sobrecargo y liberacion final.',
    })
  }

  return {
    buildProviderOperationalReleaseChecklist,
    buildProviderOperationalWizardSections,
    canManageProviderOperationalRelease,
    deriveProviderOperationalReleaseStatus,
    getProviderOperationalAircraftSectionStatus,
    getProviderOperationalCrewSectionStatus,
    getProviderOperationalDispatchSectionStatus,
    getProviderOperationalFinalSummary,
    getProviderOperationalReadinessSectionStatus,
    getProviderOperationalReleaseCurrentStatus,
    getProviderOperationalReleaseProgress,
    getProviderOperationalSectionCompletion,
    getProviderOperationalNextStep,
    getProviderOperationalNextStepLabel,
    getProviderOperationalWorkflowStage,
    getProviderReleaseLoadingMessage,
    getProviderReleaseLoadingTitle,
    getProviderReleasePrimaryActionLabel,
    getProviderReleasePrimaryActionStatus,
    isProviderAircraftConfirmedReady,
    isProviderCrewConfirmedReady,
    isProviderOperationalReady,
    isProviderOperationalStatusConfirmed,
    isProviderReleaseFinalized,
    canAdvanceProviderOperationalStep,
    goToNextProviderOperationalStep,
    requestProviderOperationalSupport,
    setProviderOperationalActiveStep,
    toggleProviderOperationalIssuePanel,
  }
}
