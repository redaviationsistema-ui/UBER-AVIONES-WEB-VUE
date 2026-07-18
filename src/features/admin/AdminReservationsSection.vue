<script setup>
import { computed, reactive, ref, watch } from 'vue'
import ReservationFilters from './workflow/components/ReservationFilters.vue'
import ReservationList from './workflow/components/ReservationList.vue'
import ReservationTimeline from './workflow/components/ReservationTimeline.vue'
import {
  buildSharedFlowStepStates,
  getSharedWorkflowActionCopy,
  getSharedWorkflowStepDescription,
  normalizeWorkflowLabel,
  resolveSharedVisualWorkflowStepId,
  resolveSharedWorkflowStageTitle,
  resolveSharedWorkflowStatus,
  resolveWorkflowState,
  SHARED_WORKFLOW_STEPS,
} from '../../utils/flightWorkflow'

const props = defineProps({
  reservations: { type: Array, required: true },
  auditEntries: { type: Array, default: () => [] },
  isFlowLoading: { type: Boolean, default: false },
  flowLoadingLabel: { type: String, default: '' },
  flowErrorMessage: { type: String, default: '' },
  isContentRefreshing: { type: Boolean, default: false },
  headerEyebrow: { type: String, default: 'Flujo del cliente' },
  headerTitle: { type: String, default: 'Control administrativo del flujo del cliente' },
  headerDescription: {
    type: String,
    default:
      'Desde aqui el administrador puede ver la etapa real de cada reserva, moverla de fase y pausarla si surge un detalle con el cliente o con la operacion.',
  },
  emptyTitle: { type: String, default: 'Aun no hay operaciones para administrar' },
  emptyDescription: {
    type: String,
    default: 'En cuanto entren solicitudes o reservas, esta cabina mostrara el flujo editable del admin.',
  },
  showAdminFlowPanel: { type: Boolean, default: true },
  showHeroHeader: { type: Boolean, default: true },
  showQueueSummary: { type: Boolean, default: true },
  showProviderReleasePanel: { type: Boolean, default: true },
  compactMode: { type: Boolean, default: false },
})

const emit = defineEmits([
  'update-flow',
  'delay-flow',
  'resume-flow',
  'refresh-content',
  'mark-manual-paid',
])

const flowSteps = SHARED_WORKFLOW_STEPS.map((step) => ({
  ...step,
  description: getSharedWorkflowStepDescription(step.id, 'pending'),
}))

const selectedReservationId = ref(null)
const flowDrafts = reactive({})
const holdDrafts = reactive({})
const searchQuery = ref('')
const stateFilter = ref('all')
const stageFilter = ref('all')

const sortedReservations = computed(() =>
  [...props.reservations].sort((left, right) => {
    const priority = { blocked: 0, delayed: 1, active: 2 }
    const leftPriority = priority[left.adminFlowState] ?? 3
    const rightPriority = priority[right.adminFlowState] ?? 3
    if (leftPriority !== rightPriority) return leftPriority - rightPriority
    return Number(right.id || 0) - Number(left.id || 0)
  }),
)

const workflowFilterOptions = computed(() =>
  [...new Set(props.reservations.map((item) => resolveWorkflowState(item.workflowStatus || item.status).id))]
    .map((stateId) => ({
      value: stateId,
      label: flowSteps.find((step) => step.id === stateId)?.title || normalizeWorkflowLabel(stateId),
    })),
)

const activeReservations = computed(() => {
  const query = String(searchQuery.value || '').trim().toLowerCase()

  return sortedReservations.value.filter((reservation) => {
    const adminState = String(reservation.adminFlowState || 'active').trim().toLowerCase()
    const workflowState = resolveWorkflowState(reservation.workflowStatus || reservation.status).id
    const matchesState = stateFilter.value === 'all' || adminState === stateFilter.value
    const matchesStage = stageFilter.value === 'all' || workflowState === stageFilter.value
    const matchesQuery =
      !query ||
      [
        reservation.id,
        reservation.clientName,
        reservation.clientCompany,
        reservation.route,
        reservation.aircraft,
        reservation.departure,
      ]
        .map((value) => String(value || '').toLowerCase())
        .some((value) => value.includes(query))

    return matchesState && matchesStage && matchesQuery
  })
})

const selectedReservation = computed(
  () => activeReservations.value.find((item) => item.id === selectedReservationId.value) || activeReservations.value[0] || null,
)

const summaryCards = computed(() => [
  { label: 'Reservas monitoreadas', value: props.reservations.length },
  { label: 'Con atraso', value: props.reservations.filter((item) => item.adminFlowState === 'delayed').length },
  { label: 'Bloqueadas', value: props.reservations.filter((item) => item.adminFlowState === 'blocked').length },
  { label: 'Bitacora', value: props.auditEntries.length },
])

const signatureStatus = computed(() => {
  const reservation = selectedReservation.value
  if (!reservation) return { tone: 'neutral', title: 'Sin reserva seleccionada', detail: '' }

  const contractStatus = String(reservation.contractStatus || '').trim().toLowerCase()
  const workflowState = resolveWorkflowState(effectiveWorkflowValue(reservation)).id

  if (workflowState === 'contract_pending') {
    return {
      tone: 'warning',
      title: getSharedWorkflowActionCopy('contract_pending').title,
      detail: getSharedWorkflowActionCopy('contract_pending').detail,
    }
  }

  if (contractStatus === 'signed' || workflowState === 'contract_signed' || workflowState === 'payment_pending' || workflowState === 'payment_confirmed' || workflowState === 'flight_confirmed' || workflowState === 'tracking_live' || workflowState === 'completed') {
    return {
      tone: 'success',
      title: 'Contrato ya firmado',
      detail: 'La firma ya se completó. Por eso esta reserva ya no está en la parte de firma y avanzó a pago o una etapa posterior.',
    }
  }

  return {
    tone: 'neutral',
    title: getSharedWorkflowActionCopy('provider_pending').title,
    detail: getSharedWorkflowActionCopy('provider_pending').detail,
  }
})

watch(
  () => activeReservations.value,
  (reservations) => {
    if (!reservations.length) {
      selectedReservationId.value = null
      return
    }

    if (!reservations.some((item) => item.id === selectedReservationId.value)) {
      selectedReservationId.value = reservations[0].id
    }

    reservations.forEach((reservation) => {
      const currentStage = visualWorkflowStepId(effectiveWorkflowValue(reservation))

      if (!flowDrafts[reservation.id]) {
        flowDrafts[reservation.id] = {
          stage: currentStage,
          note: '',
        }
      } else if (flowDrafts[reservation.id].stage !== currentStage) {
        flowDrafts[reservation.id].stage = currentStage
      }

      if (!holdDrafts[reservation.id]) {
        holdDrafts[reservation.id] = {
          mode: reservation.adminFlowState === 'blocked' ? 'blocked' : 'delayed',
          reason: reservation.adminDelayReason || '',
          eta: reservation.adminDelayEta || '',
          note: '',
          resumeNote: '',
        }
      } else {
        holdDrafts[reservation.id].mode = reservation.adminFlowState === 'blocked' ? 'blocked' : holdDrafts[reservation.id].mode
        holdDrafts[reservation.id].reason = reservation.adminDelayReason || holdDrafts[reservation.id].reason
        holdDrafts[reservation.id].eta = reservation.adminDelayEta || holdDrafts[reservation.id].eta
      }
    })
  },
  { immediate: true },
)

function getFlowDraft(reservationId) {
  if (!flowDrafts[reservationId]) {
    flowDrafts[reservationId] = { stage: 'reserved', note: '' }
  }
  return flowDrafts[reservationId]
}

function getHoldDraft(reservationId) {
  if (!holdDrafts[reservationId]) {
    holdDrafts[reservationId] = { mode: 'delayed', reason: '', eta: '', note: '', resumeNote: '' }
  }
  return holdDrafts[reservationId]
}

function normalizeStatusToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
}

function effectiveWorkflowValue(reservation = {}) {
  const explicitWorkflowValue = reservation.workflowStatus || reservation.status || ''
  const derivedWorkflowValue =
    resolveSharedWorkflowStatus({
      workflow_status: reservation.workflowStatus,
      status: reservation.status,
      contract_status: reservation.contractStatus,
      payment_status: reservation.paymentStatus,
      raw: reservation.raw,
      ...(reservation.raw && typeof reservation.raw === 'object' ? reservation.raw : {}),
    }) ||
    reservation.workflowStatus ||
    reservation.status ||
    ''

  if (explicitWorkflowValue && resolveWorkflowState(explicitWorkflowValue).id !== 'draft')
    return explicitWorkflowValue

  return derivedWorkflowValue
}

function visualWorkflowStepId(value = '') {
  return resolveSharedVisualWorkflowStepId(value)
}

function workflowStageTitle(value = '') {
  return resolveSharedWorkflowStageTitle(value)
}

function humanizeContractStatus(value = '') {
  const normalized = normalizeStatusToken(value)
  if (normalized === 'signed') return 'Firmado'
  // Keep the contract status label aligned with the workflow stage shown in the admin flow.
  if (normalized === 'generated') return 'Contrato pendiente'
  return value || 'Pendiente'
}

function humanizePaymentStatus(value = '') {
  const normalized = normalizeStatusToken(value)
  if (normalized === 'paid') return 'Pagado'
  if (normalized === 'pending') return 'Pendiente'
  if (normalized === 'pending manual payment') return 'Pago asistido pendiente'
  if (normalized === 'pending manual validation') return 'Validacion manual pendiente'
  return value || 'Pendiente'
}

function isAssistedManualValidationPending(reservation = {}) {
  const paymentMethod = String(
    reservation?.paymentMethod ||
      reservation?.payment_method ||
      reservation?.paymentOrder?.payment_method ||
      reservation?.paymentOrder?.method ||
      '',
  )
    .trim()
    .toLowerCase()
  const paymentStatus = normalizeStatusToken(reservation?.paymentStatus || reservation?.payment_status || '')

  return paymentMethod === 'assisted_cash' && paymentStatus === 'pending manual validation'
}

function stepState(reservation, stepId) {
  const step = buildSharedFlowStepStates(effectiveWorkflowValue(reservation)).find((item) => item.id === stepId)
  if (step?.state === 'done') return 'done'
  if (step?.state === 'active') return 'current'
  return 'pending'
}

function stepDescription(reservation, step) {
  const currentState = stepState(reservation, step.id)
  const paymentStatus = humanizePaymentStatus(reservation?.paymentStatus || '')
  const contractStatus = humanizeContractStatus(reservation?.contractStatus || '')

  if (step.id === 'contract_pending' && currentState !== 'pending') {
    return currentState === 'done'
      ? `Contrato ${contractStatus.toLowerCase()} y flujo listo para continuar.`
      : getSharedWorkflowStepDescription(step.id, 'current') || step.description
  }

  if (step.id === 'payment_pending' && currentState !== 'pending') {
    return currentState === 'done'
      ? `Pago ${paymentStatus.toLowerCase()} y validado dentro del flujo.`
      : getSharedWorkflowStepDescription(step.id, 'current') || step.description
  }

  return getSharedWorkflowStepDescription(step.id, currentState) || step.description
}

function adminStateLabel(value) {
  if (value === 'blocked') return 'Bloqueada'
  if (value === 'delayed') return 'Retrasada'
  return 'Activa'
}

function adminStateTone(value) {
  if (value === 'blocked') return 'badge-danger'
  if (value === 'delayed') return 'badge-warning'
  return 'badge-success'
}

function reservationStageLabel(reservation) {
  return workflowStageTitle(effectiveWorkflowValue(reservation))
}

function formatReservationDate(value = '') {
  const normalized = String(value || '').trim()
  if (!normalized) return 'Sin fecha'

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return normalized

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed)
}

function getProviderReleaseSource(reservation = {}) {
  const raw = reservation?.raw && typeof reservation.raw === 'object' ? reservation.raw : {}
  return (
    raw.provider_operational_release ||
    raw.operational_release ||
    raw.release_checklist ||
    raw.visibility_payload?.provider_operational_release ||
    null
  )
}

function getProviderReleaseStatusMeta(reservation = {}) {
  const source = getProviderReleaseSource(reservation)
  const status = String(
    source?.status ||
      reservation?.raw?.visibility_payload?.operational_status ||
      '',
  )
    .trim()
    .toLowerCase()

  if (status === 'operational_ready') {
    return {
      label: 'Lista para confirmacion',
      tone: 'success',
      detail: 'El proveedor reporta aeronave, tripulacion y despacho listos.',
    }
  }

  if (status === 'crew_confirmed') {
    return {
      label: 'Tripulacion confirmada',
      tone: 'warning',
      detail: 'Ya se valido la tripulacion  y faltan cierres finales de despacho.',
    }
  }

  if (status === 'aircraft_confirmed') {
    return {
      label: 'Aeronave confirmada',
      tone: 'warning',
      detail: 'La aeronave ya fue validada, pero aun faltan pasos operativos.',
    }
  }

  return {
    label: 'Pendiente operativa',
    tone: 'muted',
    detail: 'El proveedor aun no cierra la liberacion operativa.',
  }
}

function hasProviderRelease(reservation = {}) {
  return Boolean(getProviderReleaseSource(reservation))
}

function providerReleaseBooleanItems(reservation = {}) {
  const source = getProviderReleaseSource(reservation) || {}
  return [
    { label: 'Aeronave disponible', done: Boolean(source.availability_confirmed) },
    { label: 'Sin mantenimiento pendiente', done: Boolean(source.maintenance_clear) },
    { label: 'Cobertura de ruta confirmada', done: Boolean(source.route_coverage_confirmed) },
    { label: 'Horarios confirmados', done: Boolean(source.crew_schedule_confirmed) },
    { label: 'Docs tripulacion listos', done: Boolean(source.crew_documents_ready) },
    { label: 'Plan de vuelo listo', done: Boolean(source.flight_plan_ready) },
    { label: 'Permisos / slots listos', done: Boolean(source.permits_ready) },
    { label: 'Handling confirmado', done: Boolean(source.handling_ready) },
    { label: 'Combustible listo', done: Boolean(source.fuel_ready) },
    { label: 'Limpieza lista', done: Boolean(source.cleaning_ready) },
    { label: 'Documentos listos', done: Boolean(source.documents_ready) },
    { label: 'Seguro listo', done: Boolean(source.insurance_ready) },
    { label: 'Matricula lista', done: Boolean(source.registration_ready) },
    { label: 'Bitacora lista', done: Boolean(source.logbook_ready) },
  ]
}

function providerReleaseCrewItems(reservation = {}) {
  const source = getProviderReleaseSource(reservation) || {}
  const confirmed = (value) => String(value || '').trim().toLowerCase() === 'confirmed'
  return [
    { label: 'Capitan asignado', done: confirmed(source.captain_status) },
    { label: 'Copiloto asignado', done: confirmed(source.copilot_status) },
    { label: 'Tripulacion disponible', done: confirmed(source.crew_availability_status) },
    { label: 'Tripulacion cumple requisitos', done: confirmed(source.crew_requirements_status) },
    {
      label: 'Estado general',
      done: ['confirmed', 'red_aviation_review'].includes(
        String(source.crew_overall_status || '').trim().toLowerCase(),
      ),
      value: source.crew_overall_status || 'pending',
    },
  ]
}

function providerReleaseAircraftItems(reservation = {}) {
  const source = getProviderReleaseSource(reservation) || {}
  return [
    { label: 'Aeronave disponible', done: Boolean(source.availability_confirmed) },
    { label: 'Sin mantenimiento pendiente', done: Boolean(source.maintenance_clear) },
    { label: 'Cobertura de ruta confirmada', done: Boolean(source.route_coverage_confirmed) },
    { label: 'Combustible listo', done: Boolean(source.fuel_ready) },
    { label: 'Limpieza lista', done: Boolean(source.cleaning_ready) },
    { label: 'Seguro listo', done: Boolean(source.insurance_ready) },
    { label: 'Matricula lista', done: Boolean(source.registration_ready) },
  ]
}

function providerReleaseDispatchItems(reservation = {}) {
  const source = getProviderReleaseSource(reservation) || {}
  return [
    { label: 'Plan de vuelo listo', done: Boolean(source.flight_plan_ready) },
    { label: 'Permisos / slots listos', done: Boolean(source.permits_ready) },
    { label: 'Handling confirmado', done: Boolean(source.handling_ready) },
    { label: 'Horarios confirmados', done: Boolean(source.crew_schedule_confirmed) },
    { label: 'Docs tripulacion listos', done: Boolean(source.crew_documents_ready) },
    { label: 'Documentos operativos listos', done: Boolean(source.documents_ready) },
    { label: 'Bitacora lista', done: Boolean(source.logbook_ready) },
  ]
}

function providerReleaseProgress(reservation = {}) {
  const items = providerReleaseBooleanItems(reservation)
  const done = items.filter((item) => item.done).length
  return { done, total: items.length }
}

function providerReleaseCrewLabel(reservation = {}) {
  const source = getProviderReleaseSource(reservation) || {}
  const overall = String(source.crew_overall_status || '').trim().toLowerCase()
  if (overall === 'confirmed') return 'Confirmada'
  if (overall === 'red_aviation_review') return 'En revision'
  return 'Pendiente'
}

function getProviderReleaseNotes(reservation = {}) {
  const source = getProviderReleaseSource(reservation) || {}
  return String(source.notes || source.comment || '').trim() || 'Sin notas registradas.'
}

function clearFilters() {
  searchQuery.value = ''
  stateFilter.value = 'all'
  stageFilter.value = 'all'
}

function formatReservationShortDate(value = '') {
  const normalized = String(value || '').trim()
  if (!normalized) return 'Sin fecha'

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return normalized

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  }).format(parsed)
}

const compactReservationRows = computed(() =>
  activeReservations.value.map((reservation) => ({
    ...reservation,
    currentStageLabel: reservationStageLabel(reservation),
    departureShort: formatReservationShortDate(reservation.departure),
  })),
)

const compactTimelineSteps = computed(() => {
  if (!selectedReservation.value) return []

  return flowSteps.map((step, index) => ({
    id: step.id,
    index: index + 1,
    label: step.shortLabel,
    state: stepState(selectedReservation.value, step.id),
  }))
})

const compactSummaryLine = computed(() => {
  const reservation = selectedReservation.value
  if (!reservation) return []

  return [
    reservation.route || 'Ruta pendiente',
    reservation.aircraft || 'Aeronave por definir',
    `Contrato ${humanizeContractStatus(reservation.contractStatus)}`,
    `Pago ${humanizePaymentStatus(reservation.paymentStatus)}`,
  ]
})

const compactCurrentMessage = computed(() => {
  const reservation = selectedReservation.value
  if (!reservation) {
    return {
      title: 'Sin reserva seleccionada',
      description: 'Selecciona una reserva de la lista para revisar su flujo actual.',
    }
  }

  const stageTitle = reservationStageLabel(reservation)
  const actionCopy = getSharedWorkflowActionCopy(effectiveWorkflowValue(reservation))
  const providerRelease = getProviderReleaseStatusMeta(reservation)

  if (visualWorkflowStepId(effectiveWorkflowValue(reservation)) === 'flight_confirmed') {
    return {
      title: stageTitle,
      description:
        providerRelease.label === 'Lista para confirmacion'
          ? 'La operacion ya tiene aeronave asignada, tripulacion confirmada y salida programada.'
          : 'La operacion ya tiene aeronave asignada y sigue cerrando coordinacion operativa.',
    }
  }

  return {
    title: stageTitle,
    description: actionCopy.detail || providerRelease.detail || 'El flujo sigue avanzando sin incidencias registradas.',
  }
})

const compactAuditPreview = computed(() => props.auditEntries.slice(0, 2))

function submitFlowUpdate(reservation) {
  if (props.isFlowLoading) return
  const draft = getFlowDraft(reservation.id)
  emit('update-flow', {
    reservationId: reservation.id,
    nextStage: draft.stage,
    note: draft.note || '',
  })
  draft.note = ''
}

function submitDelay(reservation) {
  const draft = getHoldDraft(reservation.id)
  emit('delay-flow', {
    reservationId: reservation.id,
    mode: draft.mode,
    reason: draft.reason || '',
    eta: draft.eta || '',
    note: draft.note || '',
  })
  draft.note = ''
}

function submitResume(reservation) {
  const draft = getHoldDraft(reservation.id)
  emit('resume-flow', {
    reservationId: reservation.id,
    note: draft.resumeNote || '',
  })
  draft.resumeNote = ''
}
</script>

<template>
  <section class="reservation-admin-page">
    <transition name="flow-loading-fade">
      <div v-if="props.isFlowLoading" class="flow-loading-modal" role="dialog" aria-modal="true" aria-labelledby="flow-loading-title">
        <div class="flow-loading-backdrop"></div>
        <div class="flow-loading-card">
          <span class="flow-loading-orb" aria-hidden="true"></span>
          <p class="eyebrow">Actualizando reserva</p>
          <h3 id="flow-loading-title">Cargando flujo</h3>
          <p class="muted">
            {{ props.flowLoadingLabel ? `Moviendo la reserva a ${props.flowLoadingLabel}.` : 'Sincronizando el nuevo estado con el backend.' }}
          </p>
          <div class="flow-loading-progress" aria-hidden="true">
            <span></span>
          </div>
        </div>
      </div>
    </transition>

    <article v-if="props.showHeroHeader" class="surface hero-card">
      <div class="hero-copy">
        <p class="eyebrow">{{ props.headerEyebrow }}</p>
        <h2>{{ props.headerTitle }}</h2>
        <p class="muted">{{ props.headerDescription }}</p>
      </div>

      <div class="hero-metrics">
        <article v-for="card in summaryCards" :key="card.label" class="metric-card">
          <span>{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
        </article>
      </div>
    </article>

    <div v-if="activeReservations.length" class="page-grid">
      <article class="surface section-card reservations-panel">
        <div class="section-head">
          <h3>Lista de reservas</h3>
          <span class="badge badge-muted">{{ activeReservations.length }} visibles</span>
        </div>

        <ReservationFilters
          :search-query="searchQuery"
          :state-filter="stateFilter"
          :stage-filter="stageFilter"
          :workflow-options="workflowFilterOptions"
          :is-refreshing="props.isContentRefreshing"
          @update:search-query="searchQuery = $event"
          @update:state-filter="stateFilter = $event"
          @update:stage-filter="stageFilter = $event"
          @refresh="emit('refresh-content')"
        />

        <ReservationList
          :reservations="compactReservationRows"
          :selected-reservation-id="selectedReservation?.id"
          @select="selectedReservationId = $event"
        />

        <div class="list-footnote">
          Mostrando {{ activeReservations.length }} de {{ props.reservations.length }} reservas
        </div>
      </article>

      <article v-if="selectedReservation" class="surface section-card detail-panel">
        <div class="section-head section-head--detail">
          <div>
            <p class="eyebrow">Detalle de reserva</p>
            <h3>#{{ selectedReservation.id }}</h3>
            <p class="detail-client-name">{{ selectedReservation.clientName }}</p>
          </div>

          <div class="status-stack">
            <span class="badge" :class="adminStateTone(selectedReservation.adminFlowState)">
              {{ adminStateLabel(selectedReservation.adminFlowState) }}
            </span>
            <span class="badge badge-muted">
              {{ reservationStageLabel(selectedReservation) }}
            </span>
            <button
              type="button"
              class="ghost-button"
              :disabled="props.isContentRefreshing"
              @click="emit('refresh-content')"
            >
              {{ props.isContentRefreshing ? 'Actualizando...' : 'Actualizar' }}
            </button>
          </div>
        </div>

        <div class="detail-summary-line">
          <span v-for="item in compactSummaryLine" :key="item">{{ item }}</span>
        </div>

        <div v-if="props.showAdminFlowPanel" class="flow-shell flow-shell--compact">
          <ReservationTimeline :steps="compactTimelineSteps" />
        </div>

        <article class="compact-state-panel">
          <strong>{{ compactCurrentMessage.title }}</strong>
          <p>{{ compactCurrentMessage.description }}</p>
        </article>

        <div v-if="props.showAdminFlowPanel" class="control-grid">
          <article class="control-card">
            <div class="section-mini-head">
              <h4>Nueva etapa</h4>
              <p>Mueve manualmente la reserva a la fase correcta.</p>
            </div>

            <div class="compact-update-form">
              <select v-model="getFlowDraft(selectedReservation.id).stage">
                <option v-for="step in flowSteps" :key="step.id" :value="step.id">
                  {{ step.title }}
                </option>
              </select>

              <textarea
                v-model="getFlowDraft(selectedReservation.id).note"
                rows="2"
                placeholder="Nota"
              ></textarea>
            </div>

            <p v-if="props.flowErrorMessage" class="form-feedback form-feedback-error">
              {{ props.flowErrorMessage }}
            </p>

            <button
              type="button"
              class="primary-action"
              :disabled="props.isFlowLoading"
              :aria-busy="props.isFlowLoading"
              @click="submitFlowUpdate(selectedReservation)"
            >
              {{ props.isFlowLoading ? 'Actualizando...' : 'Actualizar flujo' }}
            </button>

            <button
              v-if="isAssistedManualValidationPending(selectedReservation)"
              type="button"
              class="ghost-button"
              :disabled="props.isFlowLoading"
              @click="emit('mark-manual-paid', { reservationId: selectedReservation.id })"
            >
              {{ props.isFlowLoading ? 'Validando...' : 'Marcar como pagado' }}
            </button>
          </article>
        </div>

        <article
          v-if="props.showAdminFlowPanel"
          class="alert-card alert-card--compact"
          :class="adminStateTone(selectedReservation.adminFlowState)"
        >
          <div class="compact-followup">
            <div>
              <strong>Seguimiento administrativo</strong>
              <p v-if="selectedReservation.adminFlowState === 'active'">
                Reserva operando normalmente. Sin incidencias.
              </p>
              <p v-else>
                {{ selectedReservation.adminDelayReason || 'Hay una pausa administrativa registrada.' }}
              </p>
            </div>
            <button type="button" class="ghost-button" :disabled="!compactAuditPreview.length">
              Ver bitacora
            </button>
          </div>
          <small v-if="selectedReservation.adminDelayEta">ETA estimada: {{ selectedReservation.adminDelayEta }}</small>
          <small v-if="compactAuditPreview[0]">{{ compactAuditPreview[0].title }}</small>
        </article>
      </article>
    </div>

    <article v-if="!activeReservations.length && props.reservations.length" class="surface section-card empty-shell">
      <p class="eyebrow">Sin resultados</p>
      <h3>No hay reservas con esos filtros</h3>
      <p class="muted">Ajusta la busqueda o vuelve a actualizar la lista.</p>
      <button type="button" class="ghost-button" @click="clearFilters">Limpiar filtros</button>
    </article>

    <article v-if="!activeReservations.length" class="surface section-card empty-shell">
      <p class="eyebrow">Sin reservas</p>
      <h3>{{ props.emptyTitle }}</h3>
      <p class="muted">{{ props.emptyDescription }}</p>
    </article>
  </section>
</template>

<style scoped>
.reservation-admin-page {
  position: relative;
  display: grid;
  gap: 1rem;
  color: #111111;
}

.reservation-admin-page :deep(.surface) {
  background: #fffdfa;
  border: 1px solid #e7dde0;
  box-shadow: 0 18px 44px rgba(18, 24, 40, 0.06);
}

.reservation-admin-page :deep(.eyebrow) {
  color: #2457e2;
}

.flow-loading-modal {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: 1.5rem;
}

.flow-loading-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(17, 17, 17, 0.38);
  backdrop-filter: blur(10px);
}

.flow-loading-card {
  position: relative;
  z-index: 1;
  width: min(100%, 28rem);
  padding: 1.4rem;
  border: 1px solid rgba(223, 228, 239, 0.9);
  border-radius: 24px;
  background: #ffffff;
  box-shadow: 0 28px 80px rgba(17, 17, 17, 0.18);
  text-align: center;
}

.flow-loading-orb {
  display: inline-block;
  width: 4rem;
  height: 4rem;
  margin-bottom: 0.9rem;
  border-radius: 50%;
  background: radial-gradient(circle at 32% 30%, #e8f0ff 0%, #5b87ff 48%, #2457e2 100%);
  box-shadow: 0 18px 45px rgba(36, 87, 226, 0.28);
  animation: flow-orb-pulse 1.6s ease-in-out infinite;
}

.flow-loading-progress {
  overflow: hidden;
  height: 0.42rem;
  margin-top: 1rem;
  border-radius: 999px;
  background: rgba(36, 87, 226, 0.12);
}

.flow-loading-progress span {
  display: block;
  width: 35%;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #2457e2, #7da0ff);
  animation: flow-progress-slide 1.15s ease-in-out infinite;
}

.flow-loading-fade-enter-active,
.flow-loading-fade-leave-active {
  transition: opacity 0.22s ease;
}

.flow-loading-fade-enter-from,
.flow-loading-fade-leave-to {
  opacity: 0;
}

.hero-card,
.section-card {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  border-radius: 20px;
}

.hero-copy {
  display: grid;
  gap: 0.35rem;
  max-width: 42rem;
}

.hero-copy h2,
.section-head h3 {
  margin: 0;
  color: #111111;
}

.muted {
  margin: 0;
  color: #556274;
}

.hero-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
  min-width: min(34rem, 100%);
}

.metric-card {
  display: grid;
  gap: 0.25rem;
  padding: 0.9rem 1rem;
  border: 1px solid #e7ecf5;
  border-radius: 18px;
  background: #ffffff;
}

.metric-card span {
  color: #6f7b8f;
  font-size: 0.82rem;
}

.metric-card strong {
  color: #111111;
  font-size: 1.5rem;
}

.page-grid {
  display: grid;
  grid-template-columns: minmax(320px, 0.82fr) minmax(0, 1.18fr);
  gap: 1rem;
  align-items: start;
}

.reservations-panel,
.detail-panel,
.compact-state-panel,
.control-card,
.alert-card {
  display: grid;
  gap: 0.9rem;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.9rem;
}

.section-head--detail {
  align-items: start;
}

.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2rem;
  padding: 0 0.8rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 800;
}

.badge-muted {
  border: 1px solid rgba(17, 17, 17, 0.08);
  background: rgba(17, 17, 17, 0.05);
  color: #4b5563;
}

.badge-success {
  border: 1px solid rgba(31, 128, 61, 0.16);
  background: rgba(31, 128, 61, 0.12);
  color: #1f803d;
}

.badge-warning {
  border: 1px solid rgba(200, 146, 17, 0.2);
  background: rgba(200, 146, 17, 0.12);
  color: #9f6c00;
}

.badge-danger {
  border: 1px solid rgba(167, 35, 47, 0.2);
  background: rgba(167, 35, 47, 0.1);
  color: #a7232f;
}

.detail-client-name {
  margin: 0.2rem 0 0;
  color: #111111;
  font-size: 1rem;
  font-weight: 700;
}

.status-stack {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
}

.detail-summary-line {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  align-items: center;
  padding: 0.15rem 0 0.8rem;
  border-bottom: 1px solid #e7ebf2;
}

.detail-summary-line span {
  color: #111111;
  font-weight: 600;
}

.detail-summary-line span:not(:last-child)::after {
  content: '•';
  margin-left: 0.65rem;
  color: #a0a9b8;
}

.flow-shell {
  padding: 0.4rem 0 0.2rem;
}

.compact-state-panel,
.control-card,
.alert-card {
  padding: 1rem;
  border: 1px solid #e7ecf5;
  border-radius: 18px;
  background: #ffffff;
}

.compact-state-panel strong,
.compact-followup strong {
  color: #111111;
}

.compact-state-panel p,
.compact-followup p,
.alert-card small {
  margin: 0;
  color: #556274;
}

.control-grid {
  display: grid;
  grid-template-columns: 1fr;
}

.section-mini-head {
  display: grid;
  gap: 0.25rem;
}

.section-mini-head h4,
.section-mini-head p {
  margin: 0;
}

.compact-update-form {
  display: grid;
  grid-template-columns: minmax(220px, 0.9fr) minmax(0, 1.1fr);
  gap: 0.75rem;
}

input,
select,
textarea,
button {
  font: inherit;
}

select,
textarea {
  border: 1px solid #dde5ef;
  border-radius: 14px;
  background: #ffffff;
  color: #111111;
}

select {
  min-height: 2.9rem;
  padding: 0 0.85rem;
}

textarea {
  min-height: 2.9rem;
  padding: 0.75rem 0.85rem;
  resize: vertical;
}

textarea::placeholder {
  color: #8a95a6;
}

.primary-action,
.ghost-button {
  min-height: 2.85rem;
  padding: 0 1rem;
  border-radius: 14px;
  cursor: pointer;
}

.primary-action {
  border: 1px solid #0e2f69;
  background: linear-gradient(135deg, #0e2f69, #123d87);
  color: #ffffff;
}

.ghost-button {
  border: 1px solid #dde5ef;
  background: #ffffff;
  color: #253247;
}

.primary-action[disabled],
.ghost-button[disabled] {
  opacity: 0.65;
  cursor: not-allowed;
}

.compact-followup {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: start;
}

.alert-card--compact.badge-success,
.alert-card--compact.badge-warning,
.alert-card--compact.badge-danger {
  display: grid;
  justify-content: stretch;
}

.list-footnote,
.empty-shell {
  color: #667489;
  font-size: 0.92rem;
}

.empty-shell {
  text-align: center;
}

.form-feedback-error {
  color: #a7232f;
}

@keyframes flow-orb-pulse {
  0%,
  100% {
    transform: scale(0.96);
  }

  50% {
    transform: scale(1.03);
  }
}

@keyframes flow-progress-slide {
  0% {
    transform: translateX(-115%);
  }

  100% {
    transform: translateX(320%);
  }
}

@media (max-width: 1180px) {
  .hero-card,
  .page-grid,
  .hero-metrics,
  .compact-update-form {
    grid-template-columns: 1fr;
  }

  .hero-card {
    display: grid;
  }
}

@media (max-width: 760px) {
  .section-head,
  .status-stack,
  .compact-followup {
    flex-direction: column;
    align-items: stretch;
  }

  .detail-summary-line {
    flex-direction: column;
    align-items: start;
  }

  .detail-summary-line span::after {
    content: none !important;
  }
}
</style>
