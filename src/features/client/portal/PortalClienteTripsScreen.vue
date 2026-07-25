<script setup>
import { computed } from 'vue'
import ActiveTrips from '../ActiveTrips.vue'
import ClientContractPreview from '../ClientContractPreview.vue'
import { resolveWorkflowState } from '../../../utils/flightWorkflow'
import PaymentActionButton from './components/PaymentActionButton.vue'
import PaymentCountdown from './components/PaymentCountdown.vue'
import PaymentSummaryCard from './components/PaymentSummaryCard.vue'
import ReservationSummarySidebar from './components/ReservationSummarySidebar.vue'
import SecureStripeCard from './components/SecureStripeCard.vue'

const props = defineProps({
  activeAircraftHoldSummary: { type: Object, default: null },
  assistedPaymentProofFile: { type: Object, default: null },
  assistedPaymentProofName: { type: String, default: '' },
  assistedPaymentProofUploaded: { type: Boolean, required: true },
  assistedPrimaryCtaLabel: { type: String, required: true },
  backReservationId: { type: String, default: '' },
  backSection: { type: String, required: true },
  canRenderReservationWorkflow: { type: Boolean, required: true },
  canUploadAssistedPaymentProof: { type: Boolean, required: true },
  commercialAccessCheckoutFacts: { type: Array, required: true },
  commercialAccessCheckoutScreenMode: { type: Boolean, required: true },
  commercialAccessCheckoutReturnMode: { type: Boolean, required: true },
  commercialAccessCheckoutReturnPending: { type: Boolean, required: true },
  commercialAccessCtaLabel: { type: String, required: true },
  customerDisplayName: { type: String, required: true },
  formatDetailedCurrencyByCode: { type: Function, required: true },
  hasReservationsLoaded: { type: Boolean, required: true },
  paymentBreakdownAmountMap: { type: Object, required: true },
  paymentBreakdownCurrency: { type: String, required: true },
  paymentBreakdownRows: { type: Array, required: true },
  paymentCanSubmit: { type: Boolean, required: true },
  paymentDateLabel: { type: String, required: true },
  paymentFeatureList: { type: Array, required: true },
  paymentForm: { type: Object, required: true },
  paymentAvailabilityLoading: { type: Boolean, required: true },
  paymentHeroCopy: { type: String, required: true },
  paymentHeroTitle: { type: String, required: true },
  paymentInlineError: { type: String, default: '' },
  paymentLastReference: { type: String, default: '' },
  paymentMethodCards: { type: Array, required: true },
  paymentMethodExplicitlySelected: { type: Boolean, required: true },
  paymentMethodSummaryLabel: { type: String, default: '' },
  paymentProofUploading: { type: Boolean, required: true },
  paymentRouteHeadline: { type: String, required: true },
  paymentSubmitting: { type: Boolean, required: true },
  paymentSummaryAmountLabel: { type: String, required: true },
  propsSection: { type: String, required: true },
  refreshingReservations: { type: Boolean, required: true },
  reservationCheckoutReturnPending: { type: Boolean, required: true },
  reservationContextId: { type: String, default: '' },
  reservations: { type: Array, required: true },
  routeSubsection: { type: String, default: '' },
  selectedPaymentMethod: { type: String, default: '' },
  selectedReservation: { type: Object, default: null },
  selectedReservationFrontendState: { type: Object, required: true },
  selectedTripId: { type: String, default: '' },
  signingContract: { type: Boolean, required: true },
  timeline: { type: Array, required: true },
  tripsInitialTab: { type: String, required: true },
})

defineEmits([
  'confirm-contract',
  'generate-assisted-payment-pdf',
  'go',
  'manual-refresh',
  'open-concierge',
  'open-contract',
  'open-detail',
  'open-payment',
  'payment-submit',
  'resolve-availability-conflict',
  'select-assisted-payment-proof',
  'send-assisted-payment-email',
  'trigger-assisted-payment-proof-upload',
  'update:payment-contact-email',
  'update:selected-payment-method',
  'upload-assisted-payment-proof',
])

const PAYMENT_TOTAL_STEPS = 2
const PAYMENT_CURRENT_STEP = 2

const paymentProgressPercent = computed(() =>
  Math.round((PAYMENT_CURRENT_STEP / PAYMENT_TOTAL_STEPS) * 100),
)

const paymentHeroEyebrow = computed(() =>
  props.commercialAccessCheckoutScreenMode ? 'Paso 2 de 2 · 100%' : 'Paso 2 de 2 · 100%',
)

const paymentHeroHeading = computed(() =>
  props.commercialAccessCheckoutScreenMode ? 'Configura tu pago' : 'Completa tu pago',
)

const paymentHeroSupportingCopy = computed(() =>
  props.commercialAccessCheckoutScreenMode
    ? 'Confirma el total y continúa en Stripe.'
    : 'Confirma el total y continúa en Stripe.',
)

const compactCommercialFacts = computed(() => {
  if (!props.commercialAccessCheckoutScreenMode) return []

  const stateFact = props.commercialAccessCheckoutFacts[0] || {
    label: 'Estado',
    value: 'Pendiente',
  }

  return [
    { label: 'Acceso', value: 'Acceso comercial' },
    { label: stateFact.label || 'Estado', value: stateFact.value || 'Pendiente' },
    { label: 'Método', value: props.paymentMethodSummaryLabel || 'Stripe Checkout' },
    { label: 'Monto', value: props.paymentSummaryAmountLabel },
  ]
})

const paymentRouteSummary = computed(
  () => props.paymentRouteHeadline || props.selectedReservation?.route || 'Ruta por confirmar',
)

const paymentDateSummary = computed(() => {
  const raw = String(props.paymentDateLabel || '').trim()
  if (!raw) return { date: 'Fecha por confirmar', time: 'Hora por confirmar' }

  const match = raw.match(/^(.*?)(?:\s+a\s+las\s+|\s+[·|-]\s+)(.+)$/i)
  if (match) {
    return {
      date: match[1]?.trim() || 'Fecha por confirmar',
      time: match[2]?.trim() || 'Hora por confirmar',
    }
  }

  return { date: raw, time: 'Hora por confirmar' }
})

const paymentFlightTypeLabel = computed(() => {
  const bookingStatus = String(
    props.selectedReservation?.booking_status || props.selectedReservation?.status || '',
  )
    .trim()
    .toLowerCase()
  const hasSchedule =
    paymentDateSummary.value.date !== 'Fecha por confirmar' &&
    paymentDateSummary.value.time !== 'Hora por confirmar'

  return bookingStatus === 'confirmed' && hasSchedule ? 'Vuelo confirmado' : 'Vuelo privado'
})

const paymentDurationLabel = computed(() => {
  const legCount = Number(
    props.selectedReservation?.legs?.length || props.selectedReservation?.requirements?.length || 1,
  )
  return `${legCount} ${legCount === 1 ? 'tramo' : 'tramos'}`
})

const paymentSummaryItems = computed(() => {
  if (props.paymentBreakdownRows.length) return props.paymentBreakdownRows

  return [
    { key: 'flight_cost', label: 'Subtotal del vuelo', value: props.paymentSummaryAmountLabel },
    { key: 'total', label: 'Total a pagar', value: props.paymentSummaryAmountLabel, total: true },
  ]
})

const paymentSummaryTitle = computed(() =>
  props.commercialAccessCheckoutScreenMode ? 'Resumen del pago' : 'Resumen del pago',
)

const shouldShowPaymentInfoCard = computed(
  () =>
    Boolean(props.activeAircraftHoldSummary?.countdownLabel) ||
    props.paymentAvailabilityLoading ||
    hasAvailabilityError.value ||
    Boolean(props.activeAircraftHoldSummary?.isWarning),
)

const isStripeBusy = computed(
  () =>
    props.paymentSubmitting ||
    props.paymentAvailabilityLoading ||
    props.commercialAccessCheckoutReturnPending ||
    props.reservationCheckoutReturnPending,
)

const hasAvailabilityError = computed(
  () => Boolean(props.paymentInlineError) && !props.paymentAvailabilityLoading,
)
const hasAvailabilityConflict = computed(
  () => props.selectedReservation?.frontend_state?.availability_conflict === true,
)
const availabilityConflictMessage = computed(
  () =>
    props.selectedReservation?.frontend_state?.availability_conflict_message ||
    'La disponibilidad de esta aeronave cambio y ya no podemos continuar con este flujo.',
)

const paymentStatusCopy = computed(() => {
  if (props.commercialAccessCheckoutReturnPending || props.reservationCheckoutReturnPending) {
    return 'Validando disponibilidad...'
  }
  if (props.paymentAvailabilityLoading) return 'Validando disponibilidad...'
  if (props.paymentSubmitting) return ''
  if (hasAvailabilityError.value) return 'Revisa la disponibilidad antes de continuar.'
  if (props.activeAircraftHoldSummary?.countdownLabel) {
    return `Tiempo disponible: ${props.activeAircraftHoldSummary.countdownLabel}`
  }
  return ''
})

const reservationDetailWorkflow = computed(() =>
  resolveWorkflowState(
    props.selectedReservation?.workflow_status ||
      props.selectedReservation?.status ||
      props.selectedReservation?.booking_status ||
      '',
  ),
)

const reservationDetailContent = computed(() => {
  const workflowId = reservationDetailWorkflow.value.id

  if (workflowId === 'completed') {
    return {
      eyebrow: 'Operacion cerrada',
      title: 'Tu vuelo ya finalizo',
      description:
        'El servicio termino correctamente. Desde aqui puedes revisar el resumen final y regresar a tu historial cuando lo necesites.',
      statusLabel: 'Vuelo finalizado y resguardado en historial.',
      primaryLabel: 'Ver mis vuelos',
      primaryAction: 'viajes',
      secondaryLabel: 'Asesor privado 24/7',
      secondaryAction: 'soporte',
    }
  }

  if (['flight_confirmed', 'tracking_live'].includes(workflowId)) {
    return {
      eyebrow: workflowId === 'tracking_live' ? 'Tracking activo' : 'Vuelo confirmado',
      title:
        workflowId === 'tracking_live'
          ? 'Tu seguimiento premium ya esta activo'
          : 'Tu vuelo ya paso a seguimiento operativo',
      description:
        'Aqui puedes consultar el estado mas reciente del servicio mientras nuestro equipo coordina cada hito operativo.',
      statusLabel:
        workflowId === 'tracking_live'
          ? 'Seguimiento en vivo y concierge disponibles.'
          : 'Operacion confirmada y lista para seguimiento.',
      primaryLabel: 'Ver mis vuelos',
      primaryAction: 'viajes',
      secondaryLabel: 'Asesor privado 24/7',
      secondaryAction: 'soporte',
    }
  }

  if (workflowId === 'payment_confirmed') {
    return {
      eyebrow: 'Pago confirmado',
      title: 'Tu pago fue confirmado correctamente',
      description:
        'La reserva ya fue asegurada. Ahora nuestro equipo termina la coordinacion operativa para llevarla al seguimiento del vuelo.',
      statusLabel: 'Pago aplicado y aeronave reservada.',
      primaryLabel: 'Ver mis vuelos',
      primaryAction: 'viajes',
      secondaryLabel: 'Asesor privado 24/7',
      secondaryAction: 'soporte',
    }
  }

  return {
    eyebrow: 'Reserva registrada',
    title: 'Tu vuelo esta en proceso',
    description:
      'Ya puedes dar seguimiento desde Mis vuelos. En este momento la solicitud sigue su flujo operativo mientras recibimos la respuesta del proveedor asignado.',
    statusLabel: 'Respuesta del proveedor.',
    primaryLabel: 'Ver mis vuelos',
    primaryAction: 'viajes',
    secondaryLabel: 'Asesor privado 24/7',
    secondaryAction: 'soporte',
  }
})

const isTrackingDetailView = computed(
  () => props.propsSection === 'reserva-confirmada' && props.routeSubsection === 'tracking',
)

function formatTrackingDateTime(value = '') {
  const normalized = String(value || '').trim()
  if (!normalized) return 'Fecha por confirmar'

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return normalized

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
}

const trackingStatusLabel = computed(() => {
  const workflowId = reservationDetailWorkflow.value.id
  const status =
    props.selectedReservation?.tracking_status ||
    props.selectedReservation?.operation?.tracking_status ||
    props.selectedReservation?.operation?.trackingStatus ||
    ''

  const normalizedStatus = String(status || '').trim()

  if (normalizedStatus) return normalizedStatus
  if (isTrackingDetailView.value && ['flight_confirmed', 'tracking_live'].includes(workflowId)) {
    return 'En curso'
  }

  return reservationDetailWorkflow.value.label || 'En seguimiento'
})

const trackingPrimaryFacts = computed(() => [
  {
    label: 'Ruta',
    value: props.selectedReservation?.route || 'Ruta por confirmar',
  },
  {
    label: 'Salida programada',
    value: formatTrackingDateTime(
      props.selectedReservation?.date || props.selectedReservation?.departure_datetime || '',
    ),
  },
  {
    label: 'Aeronave',
    value:
      props.selectedReservation?.aircraft ||
      props.selectedReservation?.aircraft_model ||
      props.selectedReservation?.assigned_aircraft_model ||
      'Aeronave confirmada',
  },
  {
    label: 'Tracking',
    value: isTrackingDetailView.value ? 'Tracking en curso' : trackingStatusLabel.value,
  },
])

const trackingOperationalFacts = computed(() => [
  {
    label: 'Tripulacion',
    value:
      props.selectedReservation?.crew_name ||
      props.selectedReservation?.operation?.crew_name ||
      props.selectedReservation?.crew ||
      'Asignacion en seguimiento',
  },
  {
    label: 'Terminal',
    value:
      props.selectedReservation?.terminal ||
      props.selectedReservation?.operation?.terminal ||
      'Por confirmar',
  },
  {
    label: 'Presentacion',
    value:
      props.selectedReservation?.briefing_time ||
      props.selectedReservation?.operation?.briefing_time ||
      props.selectedReservation?.briefing?.hora_presentacion ||
      'Pendiente de actualizacion',
  },
  {
    label: 'Concierge',
    value: 'Disponible 24/7',
  },
])

const trackingSteps = computed(() => {
  const workflowId = reservationDetailWorkflow.value.id

  return [
    {
      title: 'Reserva y pago',
      detail: 'Tu reserva ya fue confirmada y el pago quedo aplicado.',
      state: 'done',
    },
    {
      title: 'Preparacion operativa',
      detail: 'Estamos coordinando aeronave, tripulacion y briefing.',
      state: ['flight_confirmed', 'tracking_live', 'completed'].includes(workflowId) ? 'done' : 'active',
    },
    {
      title: 'Tracking en curso',
      detail: 'Seguimiento premium del servicio y novedades del viaje.',
      state: workflowId === 'tracking_live' ? 'active' : workflowId === 'completed' ? 'done' : 'todo',
    },
    {
      title: 'Cierre del servicio',
      detail: 'Se habilitara el resumen final cuando termine la operacion.',
      state: workflowId === 'completed' ? 'done' : 'todo',
    },
  ]
})

const completedReservationFacts = computed(() => [
  {
    label: 'Ruta',
    value: props.selectedReservation?.route || 'Ruta completada',
  },
  {
    label: 'Fecha del servicio',
    value: formatTrackingDateTime(
      props.selectedReservation?.date || props.selectedReservation?.departure_datetime || '',
    ),
  },
  {
    label: 'Aeronave',
    value:
      props.selectedReservation?.aircraft ||
      props.selectedReservation?.aircraft_model ||
      props.selectedReservation?.assigned_aircraft_model ||
      'Aeronave ejecutiva confirmada',
  },
  {
    label: 'Pasajeros',
    value: props.selectedReservation?.passengers
      ? `${props.selectedReservation.passengers} pax`
      : 'Manifiesto resguardado',
  },
])

const completedReservationStatusItems = computed(() => [
  {
    label: 'Estado del servicio',
    value: reservationDetailContent.value.statusLabel,
  },
  {
    label: 'Historial',
    value: 'Disponible en Mis vuelos cuando lo necesites.',
  },
  {
    label: 'Concierge',
    value: 'Tu asesor privado sigue disponible 24/7.',
  },
])
</script>

<template>
  <section class="screen">
    <article
      v-if="propsSection === 'contrato' && canRenderReservationWorkflow"
      class="document-panel"
    >
      <ClientContractPreview
        :reservation="selectedReservation"
        :reservation-id="reservationContextId"
        :customer-name="customerDisplayName"
        :submitting="signingContract"
        @confirm="$emit('confirm-contract')"
      />
    </article>

    <article
      v-else-if="propsSection === 'contrato' && !canRenderReservationWorkflow"
      class="document-panel confirmation-panel"
    >
      <span class="eyebrow">Contrato</span>
      <h2>{{ hasAvailabilityConflict ? 'Aeronave no disponible' : 'Cargando contrato' }}</h2>
      <p v-if="hasReservationsLoaded && hasAvailabilityConflict">
        {{ availabilityConflictMessage }}
      </p>
      <p v-else-if="hasReservationsLoaded">
        Necesitamos una reserva valida para abrir el contrato. En cuanto tengas una reserva activa,
        aparecera aqui automaticamente.
      </p>
      <p v-else>Estamos sincronizando tus reservas para preparar el contrato correcto.</p>
      <div class="confirmation-actions">
        <button type="button" @click="$emit('go', hasAvailabilityConflict ? 'reservar' : 'viajes')">
          {{ hasAvailabilityConflict ? 'Ver otras opciones' : 'Ver mis vuelos' }}
        </button>
        <button class="secondary-button" type="button" @click="$emit('go', 'reservar')">
          Reservar vuelo
        </button>
      </div>
    </article>

    <article
      v-else-if="propsSection === 'pago' && canRenderReservationWorkflow"
      class="payment-checkout"
      :class="{ 'payment-checkout--commercial': commercialAccessCheckoutScreenMode }"
    >
      <div class="payment-checkout__main">
        <div v-if="paymentSubmitting" class="payment-overlay">
          <span class="payment-overlay__spinner" aria-hidden="true"></span>
          <strong>No cierres esta ventana</strong>
          <p>Estamos preparando tu redirección segura a Stripe.</p>
        </div>

        <button class="payment-back" type="button" @click="$emit('go', backSection, backReservationId)">
          <span aria-hidden="true">←</span>
          <span>{{ commercialAccessCheckoutScreenMode ? 'Volver a reservar' : 'Volver al contrato' }}</span>
        </button>

        <div class="payment-checkout__hero">
          <h2>{{ paymentHeroHeading }}</h2>
          <div class="payment-progress payment-progress--compact">
            <span>{{ paymentHeroEyebrow }}</span>
            <div class="payment-progress__track" aria-hidden="true">
              <span class="payment-progress__bar" :style="{ width: `${paymentProgressPercent}%` }"></span>
            </div>
          </div>
          <p v-if="paymentHeroSupportingCopy">{{ paymentHeroSupportingCopy }}</p>
        </div>

        <section v-if="commercialAccessCheckoutScreenMode" class="commercial-payment-brief">
          <article class="commercial-payment-brief__hero-card">
            <div
              v-for="item in compactCommercialFacts"
              :key="item.label"
              class="commercial-payment-brief__hero-item"
            >
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </div>
          </article>
        </section>

        <section class="payment-stripe-layout">
          <PaymentSummaryCard
            :rows="paymentSummaryItems"
            :title="paymentSummaryTitle"
          />

          <SecureStripeCard
            :contact-email="paymentForm.contactEmail"
            :editable="commercialAccessCheckoutScreenMode"
            :input-value="paymentForm.contactEmail"
            :show-change-action="commercialAccessCheckoutScreenMode"
            change-href="#commercial-payment-email"
            @update:contact-email="$emit('update:payment-contact-email', $event)"
          />

          <section class="payment-action-panel payment-action-panel--sticky">
            <div class="payment-action-panel__button">
              <PaymentActionButton
                :disabled="isStripeBusy || !paymentCanSubmit || hasAvailabilityError"
                :loading="paymentSubmitting"
                :status-label="paymentStatusCopy"
                :title="commercialAccessCheckoutScreenMode ? 'Completar pago con Stripe' : 'Completar pago con Stripe'"
                @click="$emit('payment-submit')"
              />
            </div>
          </section>

          <PaymentCountdown
            v-if="shouldShowPaymentInfoCard"
            :compact="true"
            :countdown-label="activeAircraftHoldSummary?.countdownLabel || ''"
            :has-error="hasAvailabilityError"
            :is-warning="Boolean(activeAircraftHoldSummary?.isWarning)"
            :is-loading="paymentAvailabilityLoading"
            :show-timer="!commercialAccessCheckoutScreenMode && Boolean(activeAircraftHoldSummary?.countdownLabel)"
          />

          <div v-if="hasAvailabilityError" class="payment-error-card">
            <strong>No pudimos continuar con el checkout.</strong>
            <p>{{ paymentInlineError }}</p>
            <button type="button" @click="$emit('payment-submit')">Intentar nuevamente</button>
          </div>
        </section>
      </div>

      <ReservationSummarySidebar
        v-if="!commercialAccessCheckoutScreenMode"
        :customer-display-name="customerDisplayName"
        :date-label="paymentDateLabel"
        :duration-label="paymentDurationLabel"
        :flight-type-label="paymentFlightTypeLabel"
        :route-label="paymentRouteSummary"
        :total-label="paymentSummaryAmountLabel"
      />
    </article>

    <article
      v-else-if="propsSection === 'pago' && !canRenderReservationWorkflow"
      class="document-panel confirmation-panel"
    >
      <span class="eyebrow">Pago</span>
      <h2>
        {{
          hasAvailabilityConflict
            ? 'Aeronave no disponible'
            : hasReservationsLoaded
            ? selectedReservation?.is_reservation
              ? 'Pago disponible despues de la firma'
              : 'Preparando checkout'
            : 'Preparando checkout'
        }}
      </h2>
      <p v-if="hasReservationsLoaded && hasAvailabilityConflict">
        {{ availabilityConflictMessage }}
      </p>
      <p v-else-if="hasReservationsLoaded">
        {{
          selectedReservation?.is_reservation
            ? selectedReservationFrontendState.status_message ||
              'El pago se habilitara cuando el contrato tenga ready_for_payment en true.'
            : 'Estamos preparando la reserva correcta para abrir tu checkout.'
        }}
      </p>
      <p v-else>Estamos cargando la informacion de tu reserva antes de abrir el pago.</p>
      <div class="confirmation-actions">
        <button
          type="button"
          @click="$emit('go', hasAvailabilityConflict ? 'reservar' : selectedReservation?.is_reservation ? 'contrato' : 'viajes', reservationContextId)"
        >
          {{
            hasAvailabilityConflict
              ? 'Ver otras opciones'
              : selectedReservation?.is_reservation
                ? 'Volver al contrato'
                : 'Ver mis vuelos'
          }}
        </button>
        <button class="secondary-button" type="button" @click="$emit('go', 'reservar')">
          Reservar vuelo
        </button>
      </div>
    </article>

    <article
      v-else-if="propsSection === 'reserva-confirmada' && canRenderReservationWorkflow && isTrackingDetailView"
      class="document-panel tracking-detail-panel"
    >
      <div class="tracking-detail-hero">
        <span class="eyebrow">Tracking premium</span>
        <h2>Seguimiento del vuelo en curso</h2>
        <p>
          Esta vista concentra el estado operativo del servicio para que puedas revisar el avance
          sin regresar a la lista de reservas.
        </p>
      </div>

      <section class="tracking-facts-grid">
        <article v-for="item in trackingPrimaryFacts" :key="item.label" class="tracking-fact-card">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </article>
      </section>

      <section class="tracking-layout">
        <article class="tracking-status-card">
          <span class="tracking-status-card__eyebrow">Estado actual</span>
          <strong>{{ trackingStatusLabel }}</strong>
          <p>{{ reservationDetailContent.statusLabel }}</p>

          <div class="tracking-status-list">
            <article
              v-for="item in trackingOperationalFacts"
              :key="item.label"
              class="tracking-status-list__item"
            >
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </article>
          </div>
        </article>

        <article class="tracking-workflow-card">
          <span class="tracking-status-card__eyebrow">Hitos del servicio</span>
          <div class="tracking-workflow">
            <article
              v-for="step in trackingSteps"
              :key="step.title"
              class="tracking-workflow__step"
              :data-state="step.state"
            >
              <strong>{{ step.title }}</strong>
              <p>{{ step.detail }}</p>
            </article>
          </div>
        </article>
      </section>

      <div class="confirmation-actions">
        <button type="button" @click="$emit('go', 'viajes', reservationContextId)">
          Volver a mis vuelos
        </button>
        <button class="secondary-button" type="button" @click="$emit('go', 'soporte', reservationContextId)">
          Asesor privado 24/7
        </button>
      </div>
    </article>

    <article
      v-else-if="propsSection === 'reserva-confirmada' && canRenderReservationWorkflow"
      class="document-panel confirmation-panel"
      :class="{ 'confirmation-panel--completed': reservationDetailWorkflow.id === 'completed' }"
    >
      <template v-if="reservationDetailWorkflow.id === 'completed'">
        <section class="completion-hero">
          <div class="completion-hero__copy">
            <span class="eyebrow">{{ reservationDetailContent.eyebrow }}</span>
            <h2>{{ reservationDetailContent.title }}</h2>
            <p>{{ reservationDetailContent.description }}</p>
            <div class="completion-hero__status">
              <span class="completion-badge">Servicio cerrado</span>
              <strong>{{ reservationDetailContent.statusLabel }}</strong>
            </div>
          </div>
          <div class="completion-hero__orb" aria-hidden="true">
            <span>✓</span>
          </div>
        </section>

        <section class="completion-facts-grid">
          <article
            v-for="item in completedReservationFacts"
            :key="item.label"
            class="completion-fact-card"
          >
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </article>
        </section>

        <section class="completion-summary-card">
          <div class="completion-summary-card__head">
            <div>
              <span class="tracking-status-card__eyebrow">Resumen final</span>
              <strong>Cierre de operacion resguardado</strong>
            </div>
            <span class="completion-pill">Listo</span>
          </div>
          <div class="completion-summary-card__items">
            <article
              v-for="item in completedReservationStatusItems"
              :key="item.label"
              class="completion-summary-card__item"
            >
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </article>
          </div>
        </section>
      </template>

      <template v-else>
        <span class="eyebrow">{{ reservationDetailContent.eyebrow }}</span>
        <h2>{{ reservationDetailContent.title }}</h2>
        <p>{{ reservationDetailContent.description }}</p>
        <div
          v-if="activeAircraftHoldSummary"
          class="hold-banner"
          :class="{ 'hold-banner--warning': activeAircraftHoldSummary.isWarning }"
        >
          <strong>Aeronave apartada temporalmente</strong>
          <p>Tiempo restante para completar el flujo: <strong>{{ activeAircraftHoldSummary.countdownLabel }}</strong></p>
        </div>
        <div class="signature-box confirmation-box">
          <strong>Estado actual</strong>
          <span>{{ reservationDetailContent.statusLabel }}</span>
        </div>
      </template>
      <div class="confirmation-actions">
        <button type="button" @click="$emit('go', reservationDetailContent.primaryAction, reservationContextId)">
          {{ reservationDetailContent.primaryLabel }}
        </button>
        <button class="secondary-button" type="button" @click="$emit('go', reservationDetailContent.secondaryAction)">
          {{ reservationDetailContent.secondaryLabel }}
        </button>
      </div>
    </article>

    <article
      v-else-if="propsSection === 'reserva-confirmada' && !canRenderReservationWorkflow"
      class="document-panel confirmation-panel"
    >
      <span class="eyebrow">Reserva registrada</span>
      <h2>{{ hasReservationsLoaded ? 'No encontramos esa reserva' : 'Cargando estado de reserva' }}</h2>
      <p v-if="hasReservationsLoaded">
        La reserva que intentas abrir ya no esta disponible o todavia no se sincroniza.
      </p>
      <p v-else>Estamos consultando el estado mas reciente de tu reserva.</p>
      <div class="confirmation-actions">
        <button type="button" @click="$emit('go', 'viajes')">Ver mis vuelos</button>
        <button class="secondary-button" type="button" @click="$emit('go', 'reservar')">
          Reservar vuelo
        </button>
      </div>
    </article>

    <ActiveTrips
      v-else
      :reservations="reservations"
      :selected-id="selectedTripId"
      :initial-tab="tripsInitialTab"
      :refreshing="refreshingReservations"
      :timeline="timeline"
      @refresh="$emit('manual-refresh')"
      @open-concierge="$emit('open-concierge', $event)"
      @open-contract="$emit('open-contract', $event)"
      @open-detail="$emit('open-detail', $event)"
      @open-payment="$emit('open-payment', $event)"
      @resolve-availability-conflict="$emit('resolve-availability-conflict', $event)"
    />
  </section>
</template>

<style scoped>
.screen {
  display: grid;
  gap: 1.25rem;
}

.screen:has(.payment-checkout) {
  padding: 0.35rem 0;
}

.document-panel,
.commercial-payment-brief__card {
  border: 1px solid rgba(17, 17, 17, 0.08);
  border-radius: 24px;
  background: linear-gradient(180deg, #fffdfa, #f7f1e6);
  box-shadow: 0 18px 44px rgba(17, 17, 17, 0.06);
}

.document-panel {
  padding: 1.4rem;
}

.confirmation-panel {
  display: grid;
  gap: 1rem;
}

.confirmation-panel--completed {
  gap: 1.35rem;
  padding: 1.8rem;
  background:
    radial-gradient(circle at top right, rgba(37, 99, 235, 0.08), transparent 24%),
    radial-gradient(circle at top left, rgba(200, 154, 50, 0.12), transparent 28%),
    linear-gradient(180deg, #fffdfa, #f8f5ef);
}

.tracking-detail-panel {
  display: grid;
  gap: 1.25rem;
}

.confirmation-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.completion-hero,
.completion-facts-grid,
.completion-summary-card__items {
  display: grid;
  gap: 1rem;
}

.completion-hero {
  grid-template-columns: minmax(0, 1.2fr) minmax(180px, 0.45fr);
  align-items: center;
  padding: 1.5rem;
  border: 1px solid rgba(17, 17, 17, 0.08);
  border-radius: 28px;
  background:
    radial-gradient(circle at 85% 24%, rgba(200, 154, 50, 0.12), transparent 30%),
    linear-gradient(135deg, #ffffff, #f7f2e8);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85);
}

.completion-hero__copy,
.completion-summary-card,
.completion-summary-card__head,
.completion-summary-card__item,
.completion-fact-card {
  display: grid;
}

.completion-hero__copy {
  gap: 0.7rem;
}

.completion-hero__copy h2,
.completion-hero__copy p,
.completion-summary-card__head strong,
.completion-summary-card__item strong {
  margin: 0;
}

.completion-hero__copy h2 {
  font-size: clamp(2.35rem, 5vw, 4.4rem);
  line-height: 0.94;
  color: #111827;
  max-width: 11ch;
}

.completion-hero__copy p {
  max-width: 68ch;
  color: #5b6472;
  font-size: 1.02rem;
  line-height: 1.55;
}

.completion-hero__status {
  display: grid;
  gap: 0.45rem;
}

.completion-hero__status strong {
  color: #1f2937;
  font-size: 1.05rem;
}

.completion-badge,
.completion-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  min-height: 2rem;
  padding: 0 0.8rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.completion-badge {
  border: 1px solid rgba(22, 163, 74, 0.16);
  background: rgba(240, 253, 244, 0.95);
  color: #166534;
}

.completion-pill {
  border: 1px solid rgba(200, 154, 50, 0.2);
  background: rgba(255, 248, 235, 0.96);
  color: #8b6f3d;
}

.completion-hero__orb {
  display: grid;
  place-items: center;
  justify-self: end;
  width: clamp(9rem, 18vw, 12rem);
  aspect-ratio: 1;
  border-radius: 50%;
  background:
    radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.28) 34%, transparent 36%),
    linear-gradient(135deg, #163a63, #294f7b);
  box-shadow:
    0 28px 60px rgba(22, 58, 99, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.32);
}

.completion-hero__orb span {
  color: #ffffff;
  font-size: clamp(2.4rem, 5vw, 3.6rem);
  font-weight: 900;
}

.completion-facts-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.completion-fact-card {
  gap: 0.35rem;
  min-height: 118px;
  padding: 1.1rem 1.15rem;
  border: 1px solid rgba(17, 17, 17, 0.08);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 12px 26px rgba(15, 23, 42, 0.05);
}

.completion-fact-card span,
.completion-summary-card__item span {
  color: #8b6f3d;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.completion-fact-card strong {
  color: #111827;
  font-size: 1rem;
  line-height: 1.35;
}

.completion-summary-card {
  gap: 1rem;
  padding: 1.35rem;
  border: 1px solid rgba(17, 17, 17, 0.08);
  border-radius: 26px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.05);
}

.completion-summary-card__head {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.8rem;
}

.completion-summary-card__head > div {
  display: grid;
  gap: 0.25rem;
}

.completion-summary-card__head strong {
  color: #111827;
  font-size: 1.55rem;
  line-height: 1.05;
}

.completion-summary-card__items {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.completion-summary-card__item {
  gap: 0.35rem;
  min-height: 110px;
  padding: 1rem 1.05rem;
  border-radius: 20px;
  background: #fffcf6;
  border: 1px solid rgba(200, 154, 50, 0.12);
}

.completion-summary-card__item strong {
  color: #25364d;
  font-size: 1rem;
  line-height: 1.45;
}

.eyebrow {
  color: #c89a32;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tracking-detail-hero,
.tracking-status-card,
.tracking-workflow-card,
.tracking-fact-card {
  border: 1px solid rgba(200, 154, 50, 0.16);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.76);
  box-shadow: 0 18px 44px rgba(17, 17, 17, 0.05);
}

.tracking-detail-hero,
.tracking-status-card,
.tracking-workflow-card {
  padding: 1.4rem;
}

.tracking-detail-hero,
.tracking-status-card,
.tracking-workflow-card,
.tracking-fact-card,
.tracking-status-list__item,
.tracking-workflow__step {
  display: grid;
  gap: 0.45rem;
}

.tracking-detail-hero h2,
.tracking-detail-hero p,
.tracking-status-card p,
.tracking-workflow__step p {
  margin: 0;
}

.tracking-detail-hero h2 {
  font-size: clamp(2rem, 3.6vw, 3rem);
  line-height: 1.03;
  color: #111827;
}

.tracking-detail-hero p,
.tracking-status-card p,
.tracking-workflow__step p {
  color: #5b6472;
}

.tracking-facts-grid,
.tracking-layout,
.tracking-status-list {
  display: grid;
  gap: 1rem;
}

.tracking-facts-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.tracking-layout {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
}

.tracking-fact-card {
  padding: 1.15rem 1.2rem;
}

.tracking-fact-card span,
.tracking-status-card__eyebrow,
.tracking-status-list__item span {
  color: #8b6f3d;
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tracking-fact-card strong,
.tracking-status-card strong,
.tracking-status-list__item strong,
.tracking-workflow__step strong {
  color: #111827;
}

.tracking-status-card strong {
  font-size: 1.55rem;
}

.tracking-status-list {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 0.75rem;
}

.tracking-status-list__item {
  padding: 1rem 1.05rem;
  border-radius: 18px;
  background: #fffcf6;
}

.tracking-workflow {
  display: grid;
  gap: 0.9rem;
}

.tracking-workflow__step {
  padding: 1rem 1.05rem;
  border-radius: 18px;
  border: 1px solid rgba(17, 17, 17, 0.06);
  background: #fffdfa;
}

.tracking-workflow__step[data-state='done'] {
  border-color: rgba(22, 163, 74, 0.18);
  background: rgba(240, 253, 244, 0.92);
}

.tracking-workflow__step[data-state='active'] {
  border-color: rgba(217, 119, 6, 0.2);
  background: rgba(255, 251, 235, 0.96);
}

.payment-checkout {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(320px, 0.95fr);
  gap: 1.5rem;
  align-items: start;
  width: min(94vw, 1500px);
  margin: 0 auto;
  padding: 1.25rem;
  border-radius: 28px;
  background:
    radial-gradient(circle at top left, rgba(196, 209, 255, 0.4), transparent 34%),
    linear-gradient(180deg, #fbfcfe, #f3f6fb);
  box-shadow: 0 22px 56px rgba(15, 23, 42, 0.08);
}

.payment-checkout--commercial {
  grid-template-columns: minmax(0, 1fr);
}

.payment-checkout__main {
  position: relative;
  display: grid;
  gap: 0.9rem;
}

.payment-checkout__eyebrow {
  color: #c89a32;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.payment-overlay {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: grid;
  place-items: center;
  gap: 0.55rem;
  padding: 2rem;
  border-radius: 28px;
  background: rgba(248, 250, 252, 0.92);
  backdrop-filter: blur(6px);
  text-align: center;
}

.payment-overlay strong,
.payment-overlay p {
  margin: 0;
}

.payment-overlay strong {
  color: #0f172a;
  font-size: 1.15rem;
}

.payment-overlay p {
  color: #475467;
}

.payment-overlay__spinner {
  width: 3rem;
  height: 3rem;
  border: 4px solid rgba(15, 39, 71, 0.12);
  border-top-color: #163a63;
  border-radius: 999px;
  animation: portal-spin 0.9s linear infinite;
}

.payment-back {
  width: fit-content;
  padding: 0.2rem 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #25364d;
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  font-weight: 700;
}

.payment-checkout__hero {
  display: grid;
  gap: 0.45rem;
  padding: 0.2rem 0 0.35rem;
}

.payment-checkout__hero h2,
.payment-checkout__hero p,
.payment-progress__label {
  margin: 0;
}

.payment-checkout__hero h2 {
  font-size: clamp(1.45rem, 2.3vw, 1.95rem);
  line-height: 1.06;
  color: #0f172a;
}

.payment-checkout__hero p {
  color: #475467;
  line-height: 1.45;
  font-size: 0.9rem;
}

.payment-progress {
  display: grid;
  gap: 0.5rem;
  max-width: 24rem;
}

.payment-progress--compact {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 0.75rem;
  max-width: 28rem;
  color: #667085;
  font-size: 0.88rem;
  font-weight: 700;
}

.payment-progress__label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #667085;
  font-size: 0.92rem;
}

.payment-progress__track {
  position: relative;
  overflow: hidden;
  height: 0.5rem;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
}

.payment-progress__bar {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #163a63, #2563eb);
}

.payment-stripe-layout,
.payment-action-panel {
  display: grid;
  gap: 0.9rem;
}

.payment-error-card {
  display: grid;
  gap: 0.6rem;
  padding: 0.95rem 1rem;
  border: 1px solid rgba(185, 28, 28, 0.16);
  border-radius: 18px;
  background: linear-gradient(180deg, #fff8f8 0%, #fff0f0 100%);
}

.payment-error-card strong,
.payment-error-card p {
  margin: 0;
}

.payment-error-card strong {
  color: #991b1b;
}

.payment-error-card p {
  color: #b42318;
}

.payment-error-card button {
  justify-self: start;
  padding: 0.7rem 0.95rem;
  border: 0;
  border-radius: 14px;
  background: #991b1b;
  color: #ffffff;
  font-weight: 700;
}

.commercial-payment-brief {
  display: grid;
  gap: 0.8rem;
}

.commercial-payment-brief__hero-card {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0;
  padding: 0;
  border-radius: 22px;
  border: 1px solid rgba(17, 17, 17, 0.08);
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.05);
}

.commercial-payment-brief__hero-item {
  display: grid;
  gap: 0.28rem;
  min-height: 88px;
  padding: 0.95rem 1rem;
  align-content: center;
}

.commercial-payment-brief__hero-item + .commercial-payment-brief__hero-item {
  border-left: 1px solid rgba(17, 17, 17, 0.08);
}

.commercial-payment-brief__hero-item span {
  color: #756858;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.commercial-payment-brief__hero-item strong {
  font-size: 1rem;
  color: #171717;
  line-height: 1.25;
}

.payment-action-panel--sticky {
  position: sticky;
  bottom: 0.75rem;
  z-index: 3;
  padding: 0.95rem 1rem;
  border-radius: 20px;
  border: 1px solid rgba(17, 17, 17, 0.08);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.1);
  backdrop-filter: blur(10px);
}

.payment-action-panel__total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.payment-action-panel__total span {
  color: #475467;
  font-size: 0.82rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.payment-action-panel__total strong {
  color: #101828;
  font-size: 1.15rem;
  font-variant-numeric: tabular-nums;
}

.payment-action-panel__button {
  min-width: 0;
}

.hold-banner {
  display: grid;
  gap: 0.35rem;
  padding: 1rem 1.1rem;
  border: 1px solid rgba(59, 130, 246, 0.16);
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(239, 246, 255, 0.96), rgba(219, 234, 254, 0.92));
  color: #0f3a6d;
}

.hold-banner strong,
.hold-banner p {
  margin: 0;
}

.hold-banner--warning {
  border-color: rgba(217, 119, 6, 0.18);
  background: linear-gradient(180deg, rgba(255, 247, 237, 0.96), rgba(254, 215, 170, 0.22));
  color: #9a3412;
}

@keyframes portal-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1180px) {
  .completion-facts-grid,
  .completion-summary-card__items {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .payment-checkout {
    grid-template-columns: minmax(0, 1fr);
    width: min(92vw, 1320px);
  }
}

@media (max-width: 860px) {
  .completion-hero {
    grid-template-columns: 1fr;
  }

  .completion-hero__orb {
    justify-self: start;
  }

  .payment-checkout {
    width: min(94vw, 1120px);
    padding: 1rem;
    border-radius: 24px;
  }

  .commercial-payment-brief__hero-card {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .commercial-payment-brief__hero-item:nth-child(3),
  .commercial-payment-brief__hero-item:nth-child(4) {
    border-top: 1px solid rgba(17, 17, 17, 0.08);
  }

  .commercial-payment-brief__hero-item:nth-child(3) {
    border-left: 0;
  }

  .payment-action-panel--sticky {
    z-index: 3;
  }
}

@media (max-width: 640px) {
  .document-panel {
    border-radius: 24px;
  }

  .confirmation-panel--completed {
    padding: 1.15rem;
  }

  .completion-facts-grid,
  .completion-summary-card__items {
    grid-template-columns: 1fr;
  }

  .payment-checkout__hero h2 {
    font-size: 1.6rem;
  }

  .payment-progress--compact,
  .payment-action-panel__total {
    grid-template-columns: minmax(0, 1fr);
    display: grid;
  }

  .commercial-payment-brief__hero-card {
    grid-template-columns: 1fr;
  }

  .commercial-payment-brief__hero-item + .commercial-payment-brief__hero-item {
    border-left: 0;
    border-top: 1px solid rgba(17, 17, 17, 0.08);
  }

  .payment-action-panel--sticky {
    bottom: 0;
  }
}
</style>
