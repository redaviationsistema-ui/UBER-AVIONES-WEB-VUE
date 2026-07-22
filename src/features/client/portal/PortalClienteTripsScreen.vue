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
  props.commercialAccessCheckoutReturnMode ? 'Paso 2 de 6' : 'Paso 2 de 2',
)

const paymentHeroHeading = computed(() =>
  props.commercialAccessCheckoutReturnMode ? 'Configura tu pago' : 'Completa tu pago',
)

const paymentHeroSupportingCopy = computed(() =>
  props.commercialAccessCheckoutReturnMode
    ? 'Confirma el metodo de pago antes de continuar con tu acceso comercial.'
    : 'Confirma los datos de tu reserva y realiza el pago de forma segura.',
)

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
    { key: 'flight_cost', label: 'Subtotal vuelo', value: props.paymentSummaryAmountLabel },
    { key: 'total', label: 'Total', value: props.paymentSummaryAmountLabel, total: true },
  ]
})

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

const paymentStatusCopy = computed(() => {
  if (props.commercialAccessCheckoutReturnPending || props.reservationCheckoutReturnPending) {
    return 'Validando disponibilidad...'
  }
  if (props.paymentAvailabilityLoading) return 'Validando disponibilidad...'
  if (props.paymentSubmitting) return 'No cierres esta ventana'
  if (hasAvailabilityError.value) return 'Revisa la disponibilidad'
  if (props.activeAircraftHoldSummary) return 'Aeronave apartada temporalmente'
  return 'Listo para pagar con Stripe'
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
      <h2>Cargando contrato</h2>
      <p v-if="hasReservationsLoaded">
        Necesitamos una reserva valida para abrir el contrato. En cuanto tengas una reserva activa,
        aparecera aqui automaticamente.
      </p>
      <p v-else>Estamos sincronizando tus reservas para preparar el contrato correcto.</p>
      <div class="confirmation-actions">
        <button type="button" @click="$emit('go', 'viajes')">Ver mis vuelos</button>
        <button class="secondary-button" type="button" @click="$emit('go', 'reservar')">
          Reservar vuelo
        </button>
      </div>
    </article>

    <article
      v-else-if="propsSection === 'pago' && canRenderReservationWorkflow"
      class="payment-checkout"
    >
      <div class="payment-checkout__main">
        <div v-if="paymentSubmitting" class="payment-overlay">
          <span class="payment-overlay__spinner" aria-hidden="true"></span>
          <strong>No cierres esta ventana</strong>
          <p>Estamos preparando tu redirección segura a Stripe.</p>
        </div>

        <button class="payment-back" type="button" @click="$emit('go', backSection, backReservationId)">
          <span aria-hidden="true">←</span>
          <span>{{ commercialAccessCheckoutReturnMode ? 'Volver a reservar' : 'Volver al contrato' }}</span>
        </button>

        <div class="payment-checkout__hero">
          <span class="eyebrow">{{ paymentHeroEyebrow }}</span>
          <h2>{{ paymentHeroHeading }}</h2>
          <p>{{ paymentHeroSupportingCopy }}</p>
          <div class="payment-progress">
            <div class="payment-progress__label">
              <span>Paso {{ PAYMENT_CURRENT_STEP }} / {{ PAYMENT_TOTAL_STEPS }}</span>
              <strong>{{ paymentProgressPercent }}%</strong>
            </div>
            <div class="payment-progress__track" aria-hidden="true">
              <span class="payment-progress__bar" :style="{ width: `${paymentProgressPercent}%` }"></span>
            </div>
          </div>
        </div>

        <section v-if="commercialAccessCheckoutReturnMode" class="commercial-payment-brief">
          <article
            v-for="item in commercialAccessCheckoutFacts"
            :key="item.label"
            :class="['commercial-payment-brief__card', `commercial-payment-brief__card--${item.tone}`]"
          >
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </article>
        </section>

        <template v-else>
          <section class="payment-stripe-layout">
            <PaymentSummaryCard
              :rows="paymentSummaryItems"
              :total-label="paymentSummaryAmountLabel"
            />

            <SecureStripeCard :contact-email="paymentForm.contactEmail" />

            <PaymentCountdown
              :countdown-label="activeAircraftHoldSummary?.countdownLabel || '00:00'"
              :has-error="hasAvailabilityError"
              :is-warning="Boolean(activeAircraftHoldSummary?.isWarning)"
              :is-loading="paymentAvailabilityLoading"
            />

            <div v-if="hasAvailabilityError" class="payment-error-card">
              <strong>Estado error</strong>
              <p>{{ paymentInlineError }}</p>
              <button type="button" @click="$emit('payment-submit')">Intentar nuevamente</button>
            </div>

            <label class="payment-email-card">
              <span>Correo de confirmación</span>
              <input
                :value="paymentForm.contactEmail"
                type="email"
                placeholder="cliente@empresa.com"
                @input="$emit('update:payment-contact-email', $event.target.value)"
              />
            </label>
          </section>

          <section class="payment-action-panel">
            <PaymentActionButton
              :amount-label="paymentSummaryAmountLabel"
              :disabled="isStripeBusy || !paymentCanSubmit || hasAvailabilityError"
              :loading="paymentSubmitting"
              :status-label="paymentStatusCopy"
              @click="$emit('payment-submit')"
            />

            <footer class="payment-footer-trust">
              <span>Procesado por Stripe</span>
              <span>SSL</span>
              <span>PCI DSS</span>
              <span>Pago seguro</span>
            </footer>
          </section>
        </template>
      </div>

      <ReservationSummarySidebar
        v-if="!commercialAccessCheckoutReturnMode"
        :customer-display-name="customerDisplayName"
        :date-label="paymentDateLabel"
        :duration-label="paymentDurationLabel"
        :flight-type-label="paymentFlightTypeLabel"
        :route-label="paymentRouteSummary"
        :rows="paymentSummaryItems"
      />
    </article>

    <article
      v-else-if="propsSection === 'pago' && !canRenderReservationWorkflow"
      class="document-panel confirmation-panel"
    >
      <span class="eyebrow">Pago</span>
      <h2>
        {{
          hasReservationsLoaded
            ? selectedReservation?.is_reservation
              ? 'Pago disponible despues de la firma'
              : 'Preparando checkout'
            : 'Preparando checkout'
        }}
      </h2>
      <p v-if="hasReservationsLoaded">
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
          @click="$emit('go', selectedReservation?.is_reservation ? 'contrato' : 'viajes', reservationContextId)"
        >
          {{ selectedReservation?.is_reservation ? 'Volver al contrato' : 'Ver mis vuelos' }}
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
    >
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
    />
  </section>
</template>

<style scoped>
.screen {
  display: grid;
  gap: 1.25rem;
}

.screen:has(.payment-checkout) {
  padding: 0.35rem;
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

.tracking-detail-panel {
  display: grid;
  gap: 1.25rem;
}

.confirmation-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
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
  grid-template-columns: minmax(0, 1.65fr) minmax(320px, 0.9fr);
  gap: 1.9rem;
  align-items: start;
  padding: 2rem;
  border-radius: 32px;
  background:
    radial-gradient(circle at top left, rgba(196, 209, 255, 0.4), transparent 34%),
    linear-gradient(180deg, #fbfcfe, #f3f6fb);
  box-shadow: 0 22px 56px rgba(15, 23, 42, 0.08);
}

.payment-checkout__main {
  position: relative;
  display: grid;
  gap: 1.5rem;
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
  padding: 0.72rem 1rem;
  border: 1px solid rgba(17, 17, 17, 0.08);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  color: #25364d;
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  font-weight: 700;
}

.payment-checkout__hero {
  display: grid;
  gap: 1rem;
}

.payment-checkout__hero h2,
.payment-checkout__hero p,
.payment-progress__label {
  margin: 0;
}

.payment-checkout__hero h2 {
  font-size: clamp(2.15rem, 4vw, 3.3rem);
  line-height: 1.02;
  color: #0f172a;
}

.payment-checkout__hero p {
  max-width: 40rem;
  color: #475467;
  line-height: 1.68;
}

.payment-progress {
  display: grid;
  gap: 0.5rem;
  max-width: 24rem;
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
  height: 0.65rem;
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
  gap: 1rem;
}

.payment-email-card {
  display: grid;
  gap: 0.7rem;
  padding: 1.35rem 1.4rem;
  border-radius: 24px;
  border: 1px solid rgba(17, 17, 17, 0.08);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.06);
}

.payment-email-card span {
  color: #475467;
  font-size: 0.92rem;
  font-weight: 700;
}

.payment-email-card input {
  width: 100%;
  padding: 0.95rem 1rem;
  border: 1px solid rgba(16, 24, 40, 0.08);
  border-radius: 16px;
  background: #f8fafc;
  color: #101828;
  font: inherit;
  outline: none;
}

.payment-email-card input:focus {
  border-color: rgba(37, 99, 235, 0.4);
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.08);
}

.payment-error-card {
  display: grid;
  gap: 0.75rem;
  padding: 1.25rem 1.35rem;
  border: 1px solid rgba(185, 28, 28, 0.16);
  border-radius: 24px;
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
  padding: 0.8rem 1rem;
  border: 0;
  border-radius: 14px;
  background: #991b1b;
  color: #ffffff;
  font-weight: 700;
}

.payment-footer-trust {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  justify-content: center;
}

.payment-footer-trust span {
  padding: 0.45rem 0.85rem;
  border-radius: 999px;
  background: rgba(15, 39, 71, 0.06);
  color: #163a63;
  font-size: 0.8rem;
  font-weight: 700;
}

.commercial-payment-brief {
  display: grid;
  gap: 0.9rem;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

.commercial-payment-brief__card {
  padding: 1rem 1.05rem;
  display: grid;
  gap: 0.4rem;
  background: rgba(255, 255, 255, 0.85);
}

.commercial-payment-brief__card span {
  color: #756858;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.commercial-payment-brief__card strong {
  font-size: 1.05rem;
  color: #171717;
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
  .payment-checkout {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 860px) {
  .payment-checkout {
    padding: 1.15rem;
    border-radius: 24px;
  }

  .payment-action-panel {
    position: sticky;
    bottom: 0.75rem;
    z-index: 3;
  }
}

@media (max-width: 640px) {
  .document-panel {
    border-radius: 24px;
  }

  .payment-checkout__hero h2 {
    font-size: 2rem;
    }
}
</style>
