<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { hasReachedWorkflowStage, normalizeWorkflowLabel, resolveWorkflowState } from '../../utils/flightWorkflow'

const props = defineProps({
  reservations: { type: Array, required: true },
  auditEntries: { type: Array, default: () => [] },
  isFlowLoading: { type: Boolean, default: false },
  flowLoadingLabel: { type: String, default: '' },
})

const emit = defineEmits(['update-flow', 'delay-flow', 'resume-flow'])

const flowSteps = [
  { id: 'reserved', shortLabel: 'Reserva', title: 'Reserva solicitada', description: 'El cliente ya dejo activa la solicitud inicial.' },
  {
    id: 'provider_accepted',
    shortLabel: 'Proveedor',
    title: 'Respuesta proveedor',
    description: 'El operador o proveedor ya acepto ejecutar la operacion.',
  },
  {
    id: 'contract_pending',
    shortLabel: 'Firma',
    title: 'Contrato / firma',
    description: 'Aqui se genera el contrato y el cliente debe firmarlo antes de pasar a pago.',
  },
  { id: 'payment_pending', shortLabel: 'Pago', title: 'Confirmacion de pago', description: 'El cobro se valida y confirma antes de liberar el vuelo.' },
  {
    id: 'flight_confirmed',
    shortLabel: 'Vuelo',
    title: 'Vuelo confirmado',
    description: 'La operacion ya tiene aeronave, tripulacion y salida cerrada.',
  },
  {
    id: 'tracking_live',
    shortLabel: 'Tracking',
    title: 'Tracking activo',
    description: 'El admin puede seguir la ejecucion y las novedades del servicio.',
  },
]

const dynamicStepDescriptions = {
  reserved: {
    current: 'La solicitud ya entro al flujo y ahora toca conseguir respuesta operativa real del proveedor.',
    done: 'La reserva ya quedo creada y supero la activacion inicial.',
  },
  provider_accepted: {
    current: 'El proveedor ya respondio o estamos cerrando esa validacion operativa.',
    done: 'La respuesta del proveedor ya se resolvio y la reserva siguio avanzando.',
  },
  contract_pending: {
    current: 'El contrato esta en preparacion o esperando firma del cliente.',
    done: 'La parte contractual ya quedo resuelta para esta reserva.',
  },
  payment_pending: {
    current: 'El pago esta pendiente o en revision antes de liberar el vuelo.',
    done: 'La validacion de pago ya no es bloqueo para esta reserva.',
  },
  flight_confirmed: {
    current: 'Se esta cerrando la liberacion operativa final del vuelo.',
    done: 'La salida operativa ya fue confirmada con aeronave y servicio.',
  },
  tracking_live: {
    current: 'La reserva ya entro a seguimiento vivo y concierge operativo.',
    done: 'El seguimiento del servicio ya esta corriendo para este caso.',
  },
}

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

const queueCards = computed(() => [
  {
    label: 'Mostrando',
    value: activeReservations.value.length,
    detail: searchQuery.value || stateFilter.value !== 'all' || stageFilter.value !== 'all' ? 'Con filtros activos' : 'Vista completa',
  },
  {
    label: 'Activas',
    value: props.reservations.filter((item) => item.adminFlowState === 'active').length,
    detail: 'Flujo libre',
  },
  {
    label: 'Retrasadas',
    value: props.reservations.filter((item) => item.adminFlowState === 'delayed').length,
    detail: 'Seguimiento cercano',
  },
  {
    label: 'Bloqueadas',
    value: props.reservations.filter((item) => item.adminFlowState === 'blocked').length,
    detail: 'Atencion inmediata',
  },
])

const signatureStatus = computed(() => {
  const reservation = selectedReservation.value
  if (!reservation) return { tone: 'neutral', title: 'Sin reserva seleccionada', detail: '' }

  const contractStatus = String(reservation.contractStatus || '').trim().toLowerCase()
  const workflowState = resolveWorkflowState(effectiveWorkflowValue(reservation)).id

  if (workflowState === 'contract_pending') {
    return {
      tone: 'warning',
      title: 'Firma pendiente del cliente',
      detail: 'Aqui es donde debe firmarse el contrato antes de liberar el paso de pago.',
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
    title: 'Aún no llega a firma',
    detail: 'La reserva todavía no entra al paso de contrato. Primero debe completar la respuesta del proveedor.',
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
      if (!flowDrafts[reservation.id]) {
        flowDrafts[reservation.id] = {
          stage: visualWorkflowStepId(effectiveWorkflowValue(reservation)),
          note: '',
        }
      } else {
        flowDrafts[reservation.id].stage = visualWorkflowStepId(effectiveWorkflowValue(reservation))
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
  const workflowValue = reservation.workflowStatus || reservation.status || ''
  const explicitWorkflowState = resolveWorkflowState(workflowValue).id
  const contractStatus = normalizeStatusToken(reservation.contractStatus || '')
  const paymentStatus = normalizeStatusToken(reservation.paymentStatus || '')

  if (workflowValue && explicitWorkflowState !== 'draft') {
    return workflowValue
  }

  if (['pagado', 'pagada', 'paid', 'payment confirmed', 'payment_confirmed'].includes(paymentStatus)) {
    return 'payment_confirmed'
  }

  if (
    ['pendiente de pago', 'payment pending', 'payment_pending', 'pending', 'pendiente'].includes(paymentStatus) &&
    contractStatus === 'signed'
  ) {
    return 'payment_pending'
  }

  if (contractStatus === 'signed') {
    return 'contract_signed'
  }

  if (['generated', 'en firma', 'firma pendiente'].includes(contractStatus)) {
    return 'contract_pending'
  }

  return workflowValue
}

function visualWorkflowStepId(value = '') {
  const workflowId = resolveWorkflowState(value).id

  if (workflowId === 'provider_pending') return 'provider_accepted'
  if (workflowId === 'contract_signed') return 'contract_pending'
  if (workflowId === 'payment_confirmed') return 'payment_pending'

  return workflowId
}

function workflowStageTitle(value = '') {
  const workflowId = resolveWorkflowState(value).id

  if (workflowId === 'provider_pending') return 'Esperando proveedor'
  if (workflowId === 'contract_pending') return 'En firma'
  if (workflowId === 'contract_signed') return 'Contrato firmado'
  if (workflowId === 'payment_pending') return 'Pago pendiente'
  if (workflowId === 'payment_confirmed') return 'Pago confirmado'

  return normalizeWorkflowLabel(value)
}

function humanizeContractStatus(value = '') {
  const normalized = normalizeStatusToken(value)
  if (normalized === 'signed') return 'Firmado'
  if (normalized === 'generated') return 'En firma'
  return value || 'Pendiente'
}

function humanizePaymentStatus(value = '') {
  const normalized = normalizeStatusToken(value)
  if (normalized === 'paid') return 'Pagado'
  if (normalized === 'pending') return 'Pendiente'
  return value || 'Pendiente'
}

function resolvedVisualStep(reservation = {}) {
  return visualWorkflowStepId(effectiveWorkflowValue(reservation))
}

function stepState(reservation, stepId) {
  const visualStep = resolvedVisualStep(reservation)

  if (visualStep === stepId) return 'current'
  if (hasReachedWorkflowStage(visualStep, stepId)) return 'done'
  return 'pending'
}

function stepDescription(reservation, step) {
  const currentState = stepState(reservation, step.id)
  const paymentStatus = humanizePaymentStatus(reservation?.paymentStatus || '')
  const contractStatus = humanizeContractStatus(reservation?.contractStatus || '')
  const dynamicCopy = dynamicStepDescriptions[step.id] || {}

  if (step.id === 'contract_pending' && currentState !== 'pending') {
    return currentState === 'done'
      ? `Contrato ${contractStatus.toLowerCase()} y flujo listo para continuar.`
      : dynamicCopy.current || step.description
  }

  if (step.id === 'payment_pending' && currentState !== 'pending') {
    return currentState === 'done'
      ? `Pago ${paymentStatus.toLowerCase()} y validado dentro del flujo.`
      : dynamicCopy.current || step.description
  }

  return dynamicCopy[currentState] || step.description
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

function clearFilters() {
  searchQuery.value = ''
  stateFilter.value = 'all'
  stageFilter.value = 'all'
}

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

    <article class="surface hero-card">
      <div>
        <p class="eyebrow">Solicitudes / Reservas</p>
        <h2>Control administrativo del flujo del cliente</h2>
        <p class="muted">
          Desde aqui el administrador puede ver la etapa real de cada reserva, moverla de fase y pausarla
          si surge un detalle con el cliente o con la operacion.
        </p>
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
          <div>
            <p class="eyebrow">Bandeja</p>
            <h3>Reservas con seguimiento admin</h3>
          </div>
          <span class="badge badge-muted">{{ activeReservations.length }} visibles</span>
        </div>

        <div class="queue-summary">
          <article v-for="card in queueCards" :key="card.label" class="queue-stat">
            <span>{{ card.label }}</span>
            <strong>{{ card.value }}</strong>
            <small>{{ card.detail }}</small>
          </article>
        </div>

        <div class="filters-shell">
          <label class="field">
            <span>Buscar</span>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Cliente, empresa, ruta, aeronave o folio"
            />
          </label>

          <div class="filters-grid">
            <label class="field">
              <span>Estado admin</span>
              <select v-model="stateFilter">
                <option value="all">Todos</option>
                <option value="active">Activas</option>
                <option value="delayed">Retrasadas</option>
                <option value="blocked">Bloqueadas</option>
              </select>
            </label>

            <label class="field">
              <span>Etapa</span>
              <select v-model="stageFilter">
                <option value="all">Todas</option>
                <option v-for="option in workflowFilterOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>

            <button type="button" class="ghost-button filter-clear" @click="clearFilters">
              Limpiar filtros
            </button>
          </div>
        </div>

        <div class="reservation-list">
          <button
            v-for="reservation in activeReservations"
            :key="reservation.id"
            type="button"
            class="reservation-card"
            :class="{ 'reservation-card--selected': reservation.id === selectedReservation?.id }"
            @click="selectedReservationId = reservation.id"
          >
            <div class="card-head">
              <div>
                <strong>#{{ reservation.id }} · {{ reservation.clientName }}</strong>
                <p class="muted">{{ reservation.clientCompany || 'Cuenta individual' }}</p>
              </div>
              <span class="badge" :class="adminStateTone(reservation.adminFlowState)">
                {{ adminStateLabel(reservation.adminFlowState) }}
              </span>
            </div>

            <p class="route-line">{{ reservation.route }}</p>

            <div class="card-tags">
              <span class="mini-badge">{{ reservationStageLabel(reservation) }}</span>
              <span class="mini-badge">{{ reservation.aircraft || 'Aeronave por definir' }}</span>
              <span class="mini-badge">{{ humanizePaymentStatus(reservation.paymentStatus) }}</span>
            </div>

            <div class="card-meta">
              <span>{{ reservation.departure }}</span>
              <span>{{ humanizeContractStatus(reservation.contractStatus) }}</span>
            </div>
          </button>
        </div>
      </article>

      <article v-if="selectedReservation" class="surface section-card detail-panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">Detalle de reserva</p>
            <h3>#{{ selectedReservation.id }} · {{ selectedReservation.clientName }}</h3>
          </div>
          <div class="status-stack">
            <span class="badge" :class="adminStateTone(selectedReservation.adminFlowState)">
              {{ adminStateLabel(selectedReservation.adminFlowState) }}
            </span>
            <span class="badge badge-muted">
              {{ reservationStageLabel(selectedReservation) }}
            </span>
          </div>
        </div>

        <div class="info-grid">
          <article class="info-card">
            <span>Ruta</span>
            <strong>{{ selectedReservation.route }}</strong>
          </article>
          <article class="info-card">
            <span>Aeronave</span>
            <strong>{{ selectedReservation.aircraft }}</strong>
          </article>
          <article class="info-card">
            <span>Contrato</span>
            <strong>{{ humanizeContractStatus(selectedReservation.contractStatus) }}</strong>
          </article>
          <article class="info-card">
            <span>Pago</span>
            <strong>{{ humanizePaymentStatus(selectedReservation.paymentStatus) }}</strong>
          </article>
        </div>

        <div class="flow-shell">
          <div class="section-mini-head">
            <h4>Flujo visible para el admin</h4>
            <p>El admin puede llevar el caso al paso correcto aun cuando el cliente necesite ajustes o validaciones extra.</p>
          </div>

          <article class="signature-callout" :class="`signature-callout--${signatureStatus.tone}`">
            <strong>{{ signatureStatus.title }}</strong>
            <p>{{ signatureStatus.detail }}</p>
          </article>

          <div class="stepper-strip" aria-label="Resumen del flujo">
            <div
              v-for="(step, index) in flowSteps"
              :key="`${step.id}-strip`"
              class="stepper-pill"
              :class="`stepper-pill--${stepState(selectedReservation, step.id)}`"
            >
              <span class="stepper-pill-index">{{ index + 1 }}</span>
              <span class="stepper-pill-label">{{ step.shortLabel }}</span>
            </div>
          </div>

          <div class="stepper-grid">
            <article
              v-for="step in flowSteps"
              :key="step.id"
              class="step-card"
              :class="`step-card--${stepState(selectedReservation, step.id)}`"
            >
              <span class="step-chip">{{ step.shortLabel }}</span>
              <strong>{{ step.title }}</strong>
              <p>{{ stepDescription(selectedReservation, step) }}</p>
            </article>
          </div>
        </div>

        <div class="control-grid">
          <article class="control-card">
            <div class="section-mini-head">
              <h4>Cambiar etapa</h4>
              <p>Mueve manualmente la reserva a la fase correcta y deja evidencia administrativa.</p>
            </div>

            <label class="field">
              <span>Nueva etapa</span>
              <select v-model="getFlowDraft(selectedReservation.id).stage">
                <option v-for="step in flowSteps" :key="step.id" :value="step.id">
                  {{ step.title }}
                </option>
              </select>
            </label>

            <label class="field">
              <span>Nota admin</span>
              <textarea
                v-model="getFlowDraft(selectedReservation.id).note"
                rows="3"
                placeholder="Explica por que se movio el flujo o que validacion se completo"
              ></textarea>
            </label>

            <button
              type="button"
              class="primary-action"
              :disabled="props.isFlowLoading"
              :aria-busy="props.isFlowLoading"
              @click="submitFlowUpdate(selectedReservation)"
            >
              {{ props.isFlowLoading ? 'Actualizando...' : 'Actualizar flujo' }}
            </button>
          </article>

          <article class="control-card">
            <div class="section-mini-head">
              <h4>Retrasar o bloquear</h4>
              <p>Usa este control cuando el cliente, el pago, la firma o una incidencia detengan la operacion.</p>
            </div>

            <div class="toggle-grid">
              <label class="field">
                <span>Modo</span>
                <select v-model="getHoldDraft(selectedReservation.id).mode">
                  <option value="delayed">Retrasar flujo</option>
                  <option value="blocked">Bloquear flujo</option>
                </select>
              </label>

              <label class="field">
                <span>ETA de resolucion</span>
                <input v-model="getHoldDraft(selectedReservation.id).eta" type="text" placeholder="2026-05-22 18:00" />
              </label>
            </div>

            <label class="field">
              <span>Motivo</span>
              <textarea
                v-model="getHoldDraft(selectedReservation.id).reason"
                rows="3"
                placeholder="Cliente pidio mover horario, pago retenido, contrato con observaciones..."
              ></textarea>
            </label>

            <label class="field">
              <span>Comentario adicional</span>
              <input
                v-model="getHoldDraft(selectedReservation.id).note"
                type="text"
                placeholder="Impacto, responsable o siguiente accion"
              />
            </label>

            <div class="inline-actions">
              <button type="button" class="ghost-button" @click="submitDelay(selectedReservation)">
                Guardar pausa
              </button>

              <button
                v-if="selectedReservation.adminFlowState !== 'active'"
                type="button"
                class="primary-action"
                @click="submitResume(selectedReservation)"
              >
                Reanudar flujo
              </button>
            </div>

            <label v-if="selectedReservation.adminFlowState !== 'active'" class="field">
              <span>Nota de reactivacion</span>
              <input
                v-model="getHoldDraft(selectedReservation.id).resumeNote"
                type="text"
                placeholder="Ej. cliente envio documentos y se libera el proceso"
              />
            </label>
          </article>
        </div>

        <article class="alert-card" :class="adminStateTone(selectedReservation.adminFlowState)">
          <strong>Seguimiento administrativo</strong>
          <p v-if="selectedReservation.adminFlowState === 'active'">
            La reserva esta activa y puede seguir avanzando normalmente.
          </p>
          <p v-else>
            {{ selectedReservation.adminDelayReason || 'Hay una pausa administrativa registrada.' }}
          </p>
          <small v-if="selectedReservation.adminDelayEta">ETA estimada: {{ selectedReservation.adminDelayEta }}</small>
          <small>{{ selectedReservation.notes }}</small>
        </article>
      </article>
    </div>

    <article v-if="!activeReservations.length && props.reservations.length" class="surface section-card empty-shell">
      <p class="eyebrow">Sin resultados</p>
      <h3>No hay reservas con esos filtros</h3>
      <p class="muted">Ajusta la busqueda o limpia los filtros para volver a ver la bandeja completa.</p>
      <button type="button" class="ghost-button" @click="clearFilters">Limpiar filtros</button>
    </article>

    <article class="surface section-card">
      <div class="section-head">
        <div>
          <p class="eyebrow">Bitacora</p>
          <h3>Historial de cambios del flujo</h3>
        </div>
      </div>

      <div v-if="auditEntries.length" class="timeline">
        <article v-for="entry in auditEntries" :key="entry.id" class="timeline-item">
          <span class="timeline-date">{{ entry.date }}</span>
          <div>
            <strong>{{ entry.title }}</strong>
            <p class="muted">{{ entry.detail }}</p>
          </div>
        </article>
      </div>
      <p v-else class="empty-state">
        Cuando el admin haga cambios de etapa o registre retrasos, apareceran aqui.
      </p>
    </article>

    <article v-if="!activeReservations.length" class="surface section-card empty-shell">
      <p class="eyebrow">Sin reservas</p>
      <h3>Aun no hay operaciones para administrar</h3>
      <p class="muted">En cuanto entren solicitudes o reservas, esta cabina mostrara el flujo editable del admin.</p>
    </article>
  </section>
</template>

<style scoped>
.reservation-admin-page,
.hero-metrics,
.reservation-list,
.timeline,
.status-stack,
.stepper-strip {
  display: grid;
  gap: 1rem;
}

.reservation-admin-page {
  color: #16120d;
  position: relative;
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
  background:
    radial-gradient(circle at top, rgba(194, 138, 18, 0.16), transparent 42%),
    rgba(20, 16, 12, 0.42);
  backdrop-filter: blur(10px);
}

.flow-loading-card {
  position: relative;
  z-index: 1;
  width: min(100%, 28rem);
  padding: 1.4rem;
  border: 1px solid rgba(234, 223, 201, 0.9);
  border-radius: 28px;
  background: linear-gradient(180deg, rgba(255, 253, 249, 0.98) 0%, rgba(255, 247, 232, 0.98) 100%);
  box-shadow: 0 28px 80px rgba(44, 29, 10, 0.2);
  text-align: center;
}

.flow-loading-orb {
  display: inline-block;
  width: 4.25rem;
  height: 4.25rem;
  margin-bottom: 0.9rem;
  border-radius: 50%;
  background:
    radial-gradient(circle at 32% 30%, #fff7de 0%, #f7d98e 28%, #c28a12 62%, #6f4d0d 100%);
  box-shadow:
    0 0 0 10px rgba(194, 138, 18, 0.09),
    0 18px 45px rgba(194, 138, 18, 0.3);
  animation: flow-orb-pulse 1.6s ease-in-out infinite;
}

.flow-loading-card h3 {
  margin: 0.2rem 0 0.45rem;
  font-size: 1.7rem;
}

.flow-loading-progress {
  overflow: hidden;
  height: 0.42rem;
  margin-top: 1rem;
  border-radius: 999px;
  background: rgba(194, 138, 18, 0.12);
}

.flow-loading-progress span {
  display: block;
  width: 35%;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #c28a12 0%, #f1c85b 100%);
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

.reservation-admin-page :deep(.surface) {
  background: #fffdf9;
  border-color: #eadfc9;
  box-shadow: 0 24px 60px rgba(145, 108, 36, 0.08);
}

.reservation-admin-page :deep(.eyebrow) {
  color: #c28a12;
}

.reservation-admin-page :deep(.muted) {
  color: #6e6250;
}

.reservation-admin-page h2,
.reservation-admin-page h3,
.reservation-admin-page h4,
.reservation-admin-page strong,
.reservation-admin-page p,
.reservation-admin-page span,
.reservation-admin-page small,
.reservation-admin-page label {
  color: inherit;
}

.reservation-admin-page h2,
.reservation-admin-page h3,
.reservation-admin-page h4,
.reservation-admin-page strong {
  color: #20160d;
}

.reservation-admin-page p,
.reservation-admin-page small {
  color: #544838;
}

.page-grid,
.control-grid,
.toggle-grid,
.info-grid,
.stepper-grid,
.queue-summary,
.filters-grid {
  display: grid;
  gap: 1rem;
}

.page-grid {
  grid-template-columns: minmax(320px, 0.86fr) minmax(0, 1.14fr);
  align-items: start;
}

.hero-card,
.section-card,
.metric-card,
.reservation-card,
.control-card,
.info-card,
.step-card,
.alert-card {
  border-radius: 22px;
}

.hero-card,
.section-card,
.metric-card,
.reservation-card,
.control-card,
.info-card,
.step-card,
.alert-card,
.timeline-item {
  border: 1px solid #eee2cc;
  background: #fffdfa;
}

.hero-card,
.section-card {
  padding: 1.2rem;
}

.hero-card,
.section-head,
.card-head,
.inline-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.hero-metrics {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  min-width: min(34rem, 100%);
}

.metric-card,
.control-card,
.info-card,
.step-card,
.alert-card,
.timeline-item {
  padding: 1rem;
}

.metric-card span,
.field span,
.timeline-date,
.info-card span,
.step-chip,
.stepper-pill-label,
.stepper-pill-index {
  display: block;
  color: #78684e;
  font-size: 0.82rem;
}

.metric-card strong,
.info-card strong,
.section-card h3,
.hero-card h2,
.step-card strong,
.alert-card strong {
  margin-top: 0.3rem;
}

.reservations-panel,
.detail-panel,
.reservation-card,
.flow-shell,
.filters-shell {
  display: grid;
  gap: 1rem;
}

.reservation-card {
  width: 100%;
  padding: 1rem;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}

.primary-action[disabled] {
  cursor: wait;
  opacity: 0.82;
}

.reservation-card--selected {
  border-color: rgba(200, 169, 107, 0.75);
  box-shadow: 0 20px 45px rgba(141, 105, 25, 0.12);
  transform: translateY(-1px);
}

.queue-summary {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.queue-stat {
  padding: 0.95rem 1rem;
  border: 1px solid #eee2cc;
  border-radius: 18px;
  background: linear-gradient(180deg, #fffdfa 0%, #fff8ef 100%);
}

.queue-stat span,
.queue-stat small {
  display: block;
}

.queue-stat strong {
  display: block;
  margin: 0.25rem 0;
  font-size: 1.35rem;
}

.filters-shell {
  padding: 1rem;
  border: 1px solid #eee2cc;
  border-radius: 20px;
  background: linear-gradient(180deg, #fffdfa 0%, #fff8ef 100%);
}

.filters-grid {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  align-items: end;
}

.route-line,
.card-meta {
  color: #4f4638;
  font-size: 0.94rem;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.mini-badge {
  display: inline-flex;
  align-items: center;
  min-height: 1.8rem;
  padding: 0 0.7rem;
  border-radius: 999px;
  border: 1px solid rgba(194, 138, 18, 0.18);
  background: rgba(194, 138, 18, 0.08);
  color: #785f2a;
  font-size: 0.76rem;
  font-weight: 700;
}

.card-meta {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.info-grid,
.control-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.flow-shell,
.control-card {
  padding: 1rem;
  border: 1px solid #eee2cc;
  border-radius: 20px;
  background: linear-gradient(180deg, #fffdfa 0%, #fff8ef 100%);
}

.signature-callout {
  display: grid;
  gap: 0.35rem;
  padding: 0.95rem 1rem;
  border-radius: 18px;
  border: 1px solid #eadfc9;
  background: #fffaf0;
}

@keyframes flow-orb-pulse {
  0%,
  100% {
    transform: scale(0.96);
    box-shadow:
      0 0 0 10px rgba(194, 138, 18, 0.09),
      0 18px 45px rgba(194, 138, 18, 0.3);
  }

  50% {
    transform: scale(1.03);
    box-shadow:
      0 0 0 16px rgba(194, 138, 18, 0.12),
      0 24px 52px rgba(194, 138, 18, 0.36);
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

.signature-callout strong {
  margin: 0;
}

.signature-callout p {
  margin: 0;
}

.signature-callout--success {
  border-color: rgba(31, 128, 61, 0.24);
  background: #eef9f0;
}

.signature-callout--warning {
  border-color: rgba(194, 138, 18, 0.28);
  background: #fff2cf;
}

.signature-callout--neutral {
  border-color: rgba(95, 82, 67, 0.14);
  background: #fbf8f1;
}

.stepper-strip {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.stepper-pill {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-height: 3.2rem;
  padding: 0.6rem 0.8rem;
  border: 1px solid #eadfc9;
  border-radius: 999px;
  background: #ffffff;
}

.stepper-pill-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.8rem;
  height: 1.8rem;
  border-radius: 999px;
  font-weight: 800;
  background: #f7f1e4;
  color: #8f6a1d;
}

.stepper-pill-label {
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #544838;
}

.stepper-pill--done {
  border-color: rgba(31, 128, 61, 0.3);
  background: #eef9f0;
}

.stepper-pill--done .stepper-pill-index {
  background: #1f803d;
  color: #ffffff;
}

.stepper-pill--current {
  border-color: rgba(194, 138, 18, 0.35);
  background: #fff0c9;
  box-shadow: 0 12px 30px rgba(194, 138, 18, 0.12);
}

.stepper-pill--current .stepper-pill-index {
  background: #c28a12;
  color: #ffffff;
}

.stepper-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.step-card {
  min-height: 9rem;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.step-card--done {
  background: #eef9f0;
  border-color: rgba(31, 128, 61, 0.22);
}

.step-card--current {
  background: #fff4d6;
  border-color: rgba(200, 146, 17, 0.3);
}

.step-card--pending {
  background: #fffdfa;
}

.step-chip {
  margin-bottom: 0.5rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.step-card strong {
  display: block;
  margin-bottom: 0.45rem;
  font-size: 1rem;
  color: #23180f;
}

.step-card p {
  margin: 0;
  line-height: 1.45;
  color: #5d5243;
}

.section-mini-head {
  display: grid;
  gap: 0.35rem;
}

.section-mini-head h4,
.section-mini-head p {
  margin: 0;
}

.field {
  display: grid;
  gap: 0.35rem;
}

input,
select,
textarea,
button {
  font: inherit;
}

input,
select,
textarea {
  min-height: 2.8rem;
  padding: 0 0.85rem;
  border-radius: 14px;
  border: 1px solid #dccfb9;
  background: #ffffff;
  color: #111111;
}

textarea {
  padding: 0.8rem;
}

input::placeholder,
textarea::placeholder {
  color: #8c7c68;
}

.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2rem;
  padding: 0 0.8rem;
  border-radius: 999px;
  border: 1px solid rgba(200, 169, 107, 0.18);
  background: rgba(200, 169, 107, 0.14);
  color: #8f6919;
  font-size: 0.78rem;
  font-weight: 700;
}

.badge-muted {
  border-color: rgba(17, 17, 17, 0.08);
  background: rgba(17, 17, 17, 0.05);
  color: #4b5563;
}

.badge-success {
  border-color: rgba(31, 128, 61, 0.18);
  background: rgba(31, 128, 61, 0.12);
  color: #1f803d;
}

.badge-warning {
  border-color: rgba(200, 146, 17, 0.2);
  background: rgba(200, 146, 17, 0.12);
  color: #9f6c00;
}

.badge-danger {
  border-color: rgba(167, 35, 47, 0.2);
  background: rgba(167, 35, 47, 0.1);
  color: #a7232f;
}

.primary-action,
.ghost-button {
  min-height: 2.75rem;
  padding: 0 1rem;
  border-radius: 14px;
  cursor: pointer;
}

.primary-action {
  border: 1px solid #111111;
  background: #111111;
  color: #ffffff;
}

.ghost-button {
  border: 1px solid #dccfb9;
  background: #fffdfa;
  color: #2e2a22;
}

.inline-actions {
  flex-wrap: wrap;
}

.timeline-item {
  display: grid;
  gap: 0.35rem;
}

.alert-card {
  display: grid;
  gap: 0.35rem;
}

.alert-card strong,
.alert-card p,
.alert-card small {
  color: inherit;
}

.empty-state,
.empty-shell {
  text-align: center;
}

.muted {
  color: #5c5345;
}

@media (max-width: 1180px) {
  .page-grid,
  .hero-metrics,
  .queue-summary,
  .info-grid,
  .control-grid,
  .toggle-grid,
  .filters-grid,
  .stepper-strip,
  .stepper-grid {
    grid-template-columns: 1fr;
  }

  .hero-card {
    display: grid;
  }
}

@media (max-width: 760px) {
  .hero-card,
  .section-head,
  .card-head,
  .inline-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .card-meta {
    flex-direction: column;
  }

  .card-tags {
    flex-direction: column;
  }
}
</style>
