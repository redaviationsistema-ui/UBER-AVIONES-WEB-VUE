<script setup>
import { computed, ref, watch } from 'vue'
import ActiveTrips from '../ActiveTrips.vue'
import ClientContractPreview from '../ClientContractPreview.vue'

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
  paymentDateLabel: { type: String, required: true },
  paymentFeatureList: { type: Array, required: true },
  paymentForm: { type: Object, required: true },
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

const assistedPaymentProofInputElement = ref(null)

const PAYMENT_TOTAL_STEPS = 6
const PAYMENT_CURRENT_STEP = 2

const paymentProgressPercent = computed(() =>
  Math.round((PAYMENT_CURRENT_STEP / PAYMENT_TOTAL_STEPS) * 100),
)

const paymentHeroEyebrow = computed(() =>
  props.commercialAccessCheckoutReturnMode ? 'Paso 2 de 6' : 'Paso 2 de 6',
)

const paymentHeroHeading = computed(() => 'Configura tu pago')

const paymentHeroSupportingCopy = computed(() =>
  props.commercialAccessCheckoutReturnMode
    ? 'Confirma el metodo de pago antes de continuar con tu acceso comercial.'
    : 'Confirma el metodo de pago, revisa los datos de contacto y autoriza el cargo de tu reserva.',
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

const paymentFlightTypeLabel = computed(() =>
  props.selectedReservation?.is_reservation ? 'Vuelo confirmado' : 'Vuelo privado',
)

const paymentDurationLabel = computed(() => {
  const legCount = Number(
    props.selectedReservation?.legs?.length || props.selectedReservation?.requirements?.length || 1,
  )
  return `${legCount} ${legCount === 1 ? 'tramo' : 'tramos'}`
})

const paymentMethodUiCards = computed(() =>
  props.paymentMethodCards.map((method) => {
    const isStripe = method.id === 'stripe'
    const isActive =
      props.paymentMethodExplicitlySelected && props.selectedPaymentMethod === method.id

    return {
      ...method,
      isActive,
      icon: isStripe ? '◉' : '◌',
      badge: isStripe ? 'Seguro' : 'Manual',
      title: isStripe ? 'Pago inmediato' : 'Pago en efectivo',
      description: isStripe
        ? 'Checkout seguro fuera de la app con el total real del vuelo.'
        : 'Orden manual, comprobante y validacion administrativa.',
      features: isStripe
        ? ['Protegido por Stripe', 'SSL', 'PCI DSS']
        : ['Transferencia', 'Deposito', 'Factura', '30-60 minutos'],
      brands: isStripe ? ['Visa', 'MasterCard', 'Apple Pay', 'Google Pay'] : [],
    }
  }),
)

const paymentSecurityAlert = computed(() => {
  if (props.commercialAccessCheckoutReturnMode) {
    return {
      title: 'Pago seguro',
      description:
        'Tus datos nunca se almacenan. Stripe procesa el pago y toda la informacion viaja cifrada.',
    }
  }

  if (props.selectedPaymentMethod === 'assisted') {
    return {
      title: 'Pago asistido',
      description:
        'Generaremos una orden manual para que compartas tu comprobante y nuestro equipo valide el pago.',
    }
  }

  if (props.selectedPaymentMethod === 'stripe') {
    return {
      title: 'Pago seguro',
      description:
        'Tus datos nunca se almacenan. Stripe procesa el pago y toda la informacion viaja cifrada.',
    }
  }

  return {
    title: 'Selecciona un metodo',
    description: 'Elige Stripe o pago en efectivo para continuar con esta reserva.',
  }
})

const paymentSummaryItems = computed(() => {
  if (props.paymentBreakdownRows.length) return props.paymentBreakdownRows

  return [
    { key: 'total', label: 'Importe a pagar hoy', value: props.paymentSummaryAmountLabel, total: true },
  ]
})

const paymentPrimaryButtonText = computed(() => {
  if (props.commercialAccessCheckoutReturnPending || props.reservationCheckoutReturnPending) {
    return 'Validando pago...'
  }

  if (props.paymentSubmitting) return 'Cargando...'
  if (props.commercialAccessCheckoutReturnMode) return props.commercialAccessCtaLabel
  if (!props.paymentMethodExplicitlySelected) return 'Selecciona metodo de pago'
  if (props.selectedPaymentMethod === 'assisted') return props.assistedPrimaryCtaLabel
  return 'Pagar con Stripe'
})

const paymentPrimaryButtonCaption = computed(() => {
  if (
    props.paymentSubmitting ||
    props.commercialAccessCheckoutReturnPending ||
    props.reservationCheckoutReturnPending
  ) {
    return ''
  }

  return props.paymentSummaryAmountLabel || ''
})

watch(
  () => props.assistedPaymentProofName,
  (name) => {
    if (!name && assistedPaymentProofInputElement.value) {
      assistedPaymentProofInputElement.value.value = ''
    }
  },
)
</script>

<template>
  <section class="screen">
    <article
      v-if="propsSection === 'contrato' && canRenderReservationWorkflow"
      class="document-panel"
    >
      <ClientContractPreview
        :reservation="selectedReservation"
        :reservation-id="selectedReservation?.flight_request_id || reservationContextId"
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
      <h2>
        {{ hasReservationsLoaded ? 'Cargando contrato' : 'Cargando contrato' }}
      </h2>
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
          <div class="payment-trust-strip">
            <template v-if="commercialAccessCheckoutReturnMode">
              <span v-for="item in commercialAccessCheckoutFacts.slice(0, 3)" :key="item.label">
                {{ item.label }}: {{ item.value }}
              </span>
            </template>
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

        <section v-if="activeAircraftHoldSummary && !commercialAccessCheckoutReturnMode" class="hold-banner" :class="{ 'hold-banner--warning': activeAircraftHoldSummary.isWarning }">
          <strong>{{
            activeAircraftHoldSummary.isWarning
              ? 'Tu retencion esta por vencer'
              : 'Aeronave apartada temporalmente'
          }}</strong>
          <p>
            Apartamos esta aeronave durante 15 minutos mientras completas el pago.
            Tiempo restante: <strong>{{ activeAircraftHoldSummary.countdownLabel }}</strong>
          </p>
        </section>

        <section class="payment-section">
          <h3>Selecciona tu metodo de pago</h3>
          <div v-if="!commercialAccessCheckoutReturnMode" class="payment-method-grid">
            <button
              v-for="method in paymentMethodUiCards"
              :key="method.id"
              type="button"
              class="payment-method-card"
              :class="{
                'payment-method-card--active': method.isActive,
              }"
              @click="$emit('update:selected-payment-method', method.id)"
            >
              <div class="payment-method-card__top">
                <span class="payment-method-card__radio" aria-hidden="true">{{ method.icon }}</span>
                <span class="payment-method-card__badge">{{ method.badge }}</span>
                <span class="payment-method-card__shield" aria-hidden="true">
                  {{ method.id === 'stripe' ? '🛡' : '⌁' }}
                </span>
              </div>
              <div class="payment-method-card__brandline">
                <strong>{{ method.label }}</strong>
                <div v-if="method.brands.length" class="payment-method-card__brands" aria-hidden="true">
                  <span v-for="brand in method.brands" :key="brand">{{ brand }}</span>
                </div>
              </div>
              <h4>{{ method.title }}</h4>
              <p>{{ method.description }}</p>
              <div class="payment-method-card__features">
                <span v-for="feature in method.features" :key="feature">{{ feature }}</span>
              </div>
            </button>
          </div>

          <div class="payment-mode-panel">
            <span class="payment-mode-panel__icon" aria-hidden="true">i</span>
            <div class="payment-mode-panel__copy">
              <strong>{{ paymentSecurityAlert.title }}</strong>
              <p>{{ paymentSecurityAlert.description }}</p>
            </div>
          </div>

          <div v-if="selectedPaymentMethod === 'assisted'" class="payment-wire-card">
            <p>
              <span>Estado</span><strong>Pendiente de pago</strong>
            </p>
            <p>
              <span>Referencia</span><strong>{{ paymentLastReference || 'Pendiente' }}</strong>
            </p>
            <p>
              <span>Flight cost</span>
              <strong>{{
                formatDetailedCurrencyByCode(
                  paymentBreakdownAmountMap.flight_cost || 0,
                  paymentBreakdownCurrency,
                )
              }}</strong>
            </p>
            <p>
              <span>Administrative fee</span>
              <strong>{{
                formatDetailedCurrencyByCode(
                  paymentBreakdownAmountMap.administrative_fee || 0,
                  paymentBreakdownCurrency,
                )
              }}</strong>
            </p>
            <p>
              <span>Total amount</span><strong>{{ paymentSummaryAmountLabel }}</strong>
            </p>
          </div>

          <div v-if="selectedPaymentMethod === 'assisted'" class="payment-assisted-actions">
            <button
              type="button"
              class="secondary-button"
              :disabled="!canUploadAssistedPaymentProof"
              @click="$emit('generate-assisted-payment-pdf')"
            >
              Descargar PDF
            </button>

            <input
              ref="assistedPaymentProofInputElement"
              type="file"
              accept=".pdf,image/*"
              class="payment-proof-input"
              @change="$emit('select-assisted-payment-proof', $event)"
            />

            <button
              type="button"
              class="ghost-button"
              :disabled="!canUploadAssistedPaymentProof"
              @click="assistedPaymentProofInputElement?.click()"
            >
              Seleccionar comprobante
            </button>

            <span v-if="assistedPaymentProofName" class="payment-proof-name">
              {{ assistedPaymentProofName }}
            </span>

            <button
              type="button"
              class="primary-action"
              :disabled="!canUploadAssistedPaymentProof || !assistedPaymentProofFile || paymentProofUploading"
              @click="$emit('upload-assisted-payment-proof')"
            >
              {{ paymentProofUploading ? 'Subiendo comprobante...' : 'Subir comprobante de pago' }}
            </button>

            <p v-if="assistedPaymentProofUploaded" class="payment-proof-hint">
              Ya existe un comprobante cargado para esta reserva.
            </p>

            <div class="payment-assisted-actions__row">
              <button
                type="button"
                class="ghost-button"
                :disabled="!canUploadAssistedPaymentProof"
                @click="$emit('send-assisted-payment-email')"
              >
                Enviar por correo
              </button>
              <button type="button" class="ghost-button" @click="$emit('go', 'viajes', reservationContextId)">
                Volver a la reserva
              </button>
            </div>
          </div>

          <p v-if="paymentInlineError" class="payment-inline-error">{{ paymentInlineError }}</p>
        </section>

        <section class="payment-section">
          <h3>Informacion de contacto</h3>
          <label class="payment-field payment-field--stacked">
            <div class="payment-contact-card__header">
              <span class="payment-contact-card__icon" aria-hidden="true">✉</span>
              <span>Correo electronico</span>
            </div>
            <input
              :value="paymentForm.contactEmail"
              type="email"
              placeholder="cliente@empresa.com"
              @input="$emit('update:payment-contact-email', $event.target.value)"
            />
            <span class="payment-contact-card__status">
              <span aria-hidden="true">✓</span>
              Verificado
            </span>
          </label>
        </section>

        <section class="payment-security-footer">
          <span class="payment-security-footer__icon" aria-hidden="true">🔒</span>
          <div>
            <strong>Tu informacion esta protegida.</strong>
            <p>No compartimos tus datos. Pagos cifrados SSL.</p>
          </div>
        </section>
      </div>

      <aside class="payment-summary-card">
        <div class="payment-summary-card__header">
          <div>
            <span class="payment-summary-card__eyebrow">{{
              commercialAccessCheckoutReturnMode ? 'Resumen de acceso' : 'Resumen de reserva'
            }}</span>
            <h3>{{ customerDisplayName }}</h3>
          </div>
          <button type="button" class="payment-summary-card__print" aria-label="Resumen de reserva">
            🖨
          </button>
        </div>

        <div class="payment-summary-card__identity">
          <span class="payment-summary-card__avatar" aria-hidden="true">
            {{ customerDisplayName.trim().charAt(0) || 'J' }}
          </span>
          <div>
            <strong>{{ customerDisplayName }}</strong>
            <p class="payment-summary-card__route">{{ paymentRouteSummary }}</p>
          </div>
        </div>

        <div class="payment-summary-card__meta-highlight">
          <p>
            <span>📅</span>
            <strong>{{ paymentDateSummary.date }}</strong>
          </p>
          <p>
            <span>🕘</span>
            <strong>{{ paymentDateSummary.time }}</strong>
          </p>
        </div>

        <div class="payment-summary-meta">
          <p>
            <span>Tipo de vuelo</span>
            <strong>{{ paymentFlightTypeLabel }}</strong>
          </p>
          <p>
            <span>Duracion</span>
            <strong>{{ paymentDurationLabel }}</strong>
          </p>
          <template v-if="commercialAccessCheckoutReturnMode">
            <p v-for="item in commercialAccessCheckoutFacts.slice(0, 2)" :key="item.label">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </p>
          </template>
          <p>
            <span>Metodo seleccionado</span>
            <strong>{{ paymentMethodSummaryLabel }}</strong>
          </p>
        </div>

        <div class="payment-totals">
          <p
            v-for="item in paymentSummaryItems"
            :key="item.key"
            :class="{ 'payment-totals__total': item.total }"
          >
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </p>
        </div>

        <div class="payment-summary-card__protection">
          <span aria-hidden="true">🛡</span>
          <div>
            <strong>El total incluye todos los cargos</strong>
            <p>Comisiones, impuestos y proteccion de pago aplicables.</p>
          </div>
        </div>

        <button
          class="payment-submit"
          :class="{ 'payment-submit--loading': paymentSubmitting || commercialAccessCheckoutReturnPending || reservationCheckoutReturnPending }"
          type="button"
          :disabled="
            paymentSubmitting ||
            commercialAccessCheckoutReturnPending ||
            reservationCheckoutReturnPending ||
            (!commercialAccessCheckoutReturnMode && !paymentMethodExplicitlySelected)
          "
          @click="$emit('payment-submit')"
        >
          <span
            v-if="
              paymentSubmitting ||
              commercialAccessCheckoutReturnPending ||
              reservationCheckoutReturnPending
            "
            class="payment-submit__spinner"
            aria-hidden="true"
          ></span>
          <span v-else class="payment-submit__lock" aria-hidden="true">🔒</span>
          <span class="payment-submit__label">
            <strong>{{ paymentPrimaryButtonText }}</strong>
            <small v-if="paymentPrimaryButtonCaption">{{ paymentPrimaryButtonCaption }}</small>
          </span>
        </button>

        <p class="payment-summary-card__secure-note">
          <span aria-hidden="true">🛡</span>
          Pago 100% seguro con Stripe
        </p>
      </aside>
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
        <button type="button" @click="$emit('go', selectedReservation?.is_reservation ? 'contrato' : 'viajes', reservationContextId)">
          {{ selectedReservation?.is_reservation ? 'Volver al contrato' : 'Ver mis vuelos' }}
        </button>
        <button class="secondary-button" type="button" @click="$emit('go', 'reservar')">
          Reservar vuelo
        </button>
      </div>
    </article>

    <article
      v-else-if="propsSection === 'reserva-confirmada' && canRenderReservationWorkflow"
      class="document-panel confirmation-panel"
    >
      <span class="eyebrow">Reserva registrada</span>
      <h2>Tu vuelo esta en proceso</h2>
      <p>
        Ya puedes dar seguimiento desde Mis vuelos. En este momento la solicitud sigue su flujo
        operativo mientras recibimos la respuesta del proveedor asignado.
      </p>
      <div v-if="activeAircraftHoldSummary" class="hold-banner" :class="{ 'hold-banner--warning': activeAircraftHoldSummary.isWarning }">
        <strong>Aeronave apartada temporalmente</strong>
        <p>Tiempo restante para completar el flujo: <strong>{{ activeAircraftHoldSummary.countdownLabel }}</strong></p>
      </div>
      <div class="signature-box confirmation-box">
        <strong>Estado actual</strong>
        <span>Respuesta del proveedor.</span>
      </div>
      <div class="confirmation-actions">
        <button type="button" @click="$emit('go', 'viajes', reservationContextId)">
          Ver mis vuelos
        </button>
        <button class="secondary-button" type="button" @click="$emit('go', 'soporte')">
          Asesor privado 24/7
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
.payment-summary-card,
.payment-method-card,
.payment-mode-panel,
.payment-wire-card,
.payment-field--stacked,
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

.confirmation-actions,
.payment-assisted-actions__row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.eyebrow,
.payment-summary-card__eyebrow {
  color: #c89a32;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.payment-checkout {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(320px, 0.9fr);
  gap: 1.9rem;
  align-items: start;
  padding: 2rem;
  border-radius: 32px;
  background:
    radial-gradient(circle at top left, rgba(200, 155, 60, 0.08), transparent 32%),
    linear-gradient(180deg, #fffefc, #f9f8f3);
  box-shadow: 0 16px 42px rgba(0, 0, 0, 0.06);
}

.payment-checkout__main {
  display: grid;
  gap: 2rem;
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

.payment-back {
  width: fit-content;
  padding: 0.7rem 1rem;
  border: 1px solid rgba(17, 17, 17, 0.08);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.82);
  color: #2a2a2a;
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  font-weight: 700;
}

.payment-checkout__hero,
.payment-mode-panel__copy,
.payment-section,
.payment-summary-card,
.payment-assisted-actions {
  display: grid;
  gap: 0.95rem;
}

.payment-checkout__hero p,
.payment-mode-panel__copy p,
.payment-proof-hint,
.payment-proof-name,
.payment-inline-error,
.payment-summary-card__route {
  margin: 0;
}

.payment-checkout__hero {
  gap: 1rem;
}

.payment-checkout__hero h2 {
  margin: 0;
  color: #111111;
  font-size: clamp(2.8rem, 4vw, 4rem);
  line-height: 0.98;
  letter-spacing: -0.04em;
}

.payment-checkout__hero p {
  max-width: 48rem;
  color: #5d5d5d;
  font-size: 1.25rem;
  line-height: 1.45;
}

.payment-progress {
  display: grid;
  gap: 0.6rem;
  max-width: 420px;
}

.payment-progress__label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #896721;
  font-size: 0.94rem;
  font-weight: 800;
}

.payment-progress__track {
  position: relative;
  height: 0.5rem;
  border-radius: 999px;
  background: #ece8dd;
  overflow: hidden;
}

.payment-progress__bar {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: linear-gradient(90deg, #c89b3c, #ddb86d);
}

.payment-trust-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.payment-trust-strip span {
  padding: 0.5rem 0.8rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(17, 17, 17, 0.08);
  color: #6a6255;
  font-size: 0.9rem;
  font-weight: 700;
}

.payment-section h3,
.payment-summary-card h3 {
  margin: 0;
  color: #111111;
  font-size: clamp(1.65rem, 2vw, 2.15rem);
}

.payment-section {
  gap: 1.3rem;
}

.payment-method-grid,
.commercial-payment-brief {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
}

.payment-method-card {
  display: grid;
  gap: 0.8rem;
  min-height: 240px;
  padding: 1.8rem;
  border: 1px solid #ececec;
  background: linear-gradient(180deg, #ffffff, #fbfaf7);
  text-align: left;
  transition:
    border-color 200ms ease,
    box-shadow 200ms ease,
    transform 200ms ease,
    background 200ms ease;
}

.payment-method-card__top,
.payment-method-card__brandline,
.payment-method-card__features {
  display: flex;
  align-items: center;
}

.payment-method-card__top {
  gap: 0.75rem;
}

.payment-method-card__radio {
  color: #c89b3c;
  font-size: 1.5rem;
}

.payment-method-card__badge {
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  background: rgba(200, 155, 60, 0.12);
  color: #9a7323;
  font-size: 0.8rem;
  font-weight: 800;
  text-transform: uppercase;
}

.payment-method-card__shield {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border-radius: 18px;
  background: rgba(200, 155, 60, 0.08);
  font-size: 1.4rem;
}

.payment-method-card__brandline {
  justify-content: space-between;
  gap: 1rem;
}

.payment-method-card__brands {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.payment-method-card__brands span,
.payment-method-card__features span {
  padding: 0.32rem 0.6rem;
  border-radius: 999px;
  background: #f6f4ee;
  color: #6d6457;
  font-size: 0.8rem;
  font-weight: 700;
}

.payment-method-card h4,
.payment-summary-card__identity strong {
  margin: 0;
  color: #111111;
  font-size: 1.05rem;
}

.payment-method-card p {
  margin: 0;
  color: #666666;
  font-size: 1.02rem;
  line-height: 1.5;
}

.payment-method-card__features {
  flex-wrap: wrap;
  gap: 0.45rem;
}

.payment-method-card strong,
.payment-summary-card strong,
.payment-totals__total span,
.payment-totals__total strong {
  color: #111111;
}

.payment-method-card span,
.payment-summary-meta span,
.payment-totals span,
.payment-proof-hint,
.payment-proof-name,
.payment-field span {
  color: #655d52;
}

.payment-method-card--active {
  border: 2px solid #c89b3c;
  box-shadow: 0 12px 35px rgba(201, 155, 60, 0.18);
  background: #fffdf8;
  transform: scale(0.98);
}

.payment-mode-panel,
.payment-wire-card,
.payment-field--stacked,
.payment-summary-card,
.commercial-payment-brief__card {
  padding: 1.35rem;
  background: #ffffff;
}

.payment-mode-panel {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 1rem;
  border-color: rgba(78, 132, 232, 0.2);
  background: linear-gradient(180deg, #f3f8ff, #eef5ff);
}

.payment-mode-panel__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: #4a7bd3;
  color: #ffffff;
  font-weight: 900;
}

.payment-wire-card {
  display: grid;
  gap: 0.75rem;
}

.payment-wire-card p,
.payment-summary-meta p,
.payment-totals p {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: start;
  margin: 0;
}

.payment-wire-card strong,
.payment-summary-meta strong,
.payment-totals strong {
  text-align: right;
}

.payment-field {
  display: grid;
  gap: 0.42rem;
}

.payment-field input {
  width: 100%;
  min-height: 3rem;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: #111111;
  font: inherit;
  font-size: 1.18rem;
  font-weight: 700;
}

.payment-field input::placeholder {
  color: #9d9589;
}

.payment-contact-card__header,
.payment-contact-card__status {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
}

.payment-contact-card__header {
  color: #6b645b;
  font-weight: 700;
}

.payment-contact-card__icon {
  font-size: 1rem;
}

.payment-contact-card__status {
  color: #16924f;
  font-size: 0.95rem;
  font-weight: 800;
}

.payment-summary-card {
  position: sticky;
  top: 24px;
  gap: 1.25rem;
  padding: 2rem;
  background:
    radial-gradient(circle at top right, rgba(191, 151, 65, 0.14), transparent 30%),
    linear-gradient(180deg, #fffdfa, #f6f0e5);
}

.payment-summary-card__header,
.payment-summary-card__identity,
.payment-summary-card__meta-highlight,
.payment-summary-card__protection,
.payment-summary-card__secure-note {
  display: flex;
}

.payment-summary-card__header,
.payment-summary-card__identity,
.payment-summary-card__protection {
  align-items: center;
}

.payment-summary-card__header {
  justify-content: space-between;
  gap: 1rem;
}

.payment-summary-card__print {
  width: 3.25rem;
  height: 3.25rem;
  min-height: auto;
  padding: 0;
  border-radius: 16px;
  border: 1px solid rgba(17, 17, 17, 0.08);
  background: rgba(255, 255, 255, 0.92);
  font-size: 1.2rem;
}

.payment-summary-card__identity {
  gap: 0.9rem;
  padding: 1rem 0 1.2rem;
  border-bottom: 1px solid rgba(17, 17, 17, 0.08);
}

.payment-summary-card__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 4.4rem;
  height: 4.4rem;
  flex-shrink: 0;
  border-radius: 50%;
  background: radial-gradient(circle at top, #f0dfb8, #c89b3c);
  color: #ffffff;
  font-size: 1.55rem;
  font-weight: 900;
}

.payment-summary-card__route {
  color: #4c4c4c;
  font-size: 1rem;
}

.payment-summary-card__meta-highlight {
  gap: 0.8rem;
}

.payment-summary-card__meta-highlight p {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin: 0;
  padding: 1rem 1.05rem;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(17, 17, 17, 0.06);
}

.payment-summary-card__meta-highlight span {
  font-size: 1rem;
}

.payment-totals {
  display: grid;
  gap: 0.65rem;
}

.payment-totals__total {
  padding-top: 0.75rem;
  border-top: 1px solid rgba(17, 17, 17, 0.08);
}

.payment-totals__total strong {
  font-size: 2.2rem;
  line-height: 1;
}

.payment-summary-card__protection {
  gap: 0.9rem;
  padding: 1.2rem;
  border-radius: 20px;
  border: 1px solid rgba(200, 155, 60, 0.22);
  background: linear-gradient(180deg, rgba(255, 250, 242, 0.98), rgba(255, 246, 230, 0.92));
}

.payment-summary-card__protection span {
  font-size: 1.5rem;
}

.payment-summary-card__protection p,
.payment-security-footer p {
  margin: 0.2rem 0 0;
  color: #666666;
}

.payment-inline-error {
  color: #8e2d2d;
  font-weight: 700;
}

.payment-proof-input {
  display: none;
}

.payment-submit,
.primary-action,
.secondary-button,
.ghost-button,
.confirmation-actions button {
  min-height: 3.15rem;
  padding: 0.85rem 1.2rem;
  border-radius: 16px;
  border: 1px solid rgba(17, 17, 17, 0.1);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 160ms ease,
    box-shadow 160ms ease,
    opacity 160ms ease;
}

.payment-submit,
.primary-action {
  color: #ffffff;
  background: linear-gradient(180deg, #162033, #111827);
  box-shadow: 0 16px 30px rgba(17, 17, 17, 0.16);
}

.payment-submit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.7rem;
  min-height: 5.8rem;
  border-radius: 20px;
}

.payment-submit__lock {
  font-size: 1.35rem;
}

.payment-submit--loading {
  cursor: wait;
}

.payment-submit__spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid rgba(255, 255, 255, 0.28);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: payment-submit-spin 0.8s linear infinite;
}

.payment-submit__label {
  color: inherit;
  display: grid;
  gap: 0.2rem;
  justify-items: start;
}

.payment-submit__label strong,
.payment-submit__label small {
  color: inherit;
}

.payment-submit__label strong {
  font-size: 1.12rem;
}

.payment-submit__label small {
  font-size: 0.92rem;
  opacity: 0.82;
}

.payment-summary-card__secure-note {
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin: 0;
  color: #7f6a35;
  font-size: 0.98rem;
  font-weight: 700;
}

.payment-security-footer {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.9rem;
  align-items: center;
  padding: 1.15rem 1.2rem;
  border-radius: 20px;
  border: 1px solid rgba(17, 17, 17, 0.06);
  background: rgba(255, 255, 255, 0.76);
}

.payment-security-footer__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  background: rgba(200, 155, 60, 0.12);
}

.secondary-button,
.ghost-button,
.confirmation-actions button {
  color: #111111;
  background: #ffffff;
}

.payment-submit:disabled,
.primary-action:disabled,
.secondary-button:disabled,
.ghost-button:disabled,
.confirmation-actions button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  box-shadow: none;
}

.payment-submit:not(:disabled):hover,
.primary-action:not(:disabled):hover,
.secondary-button:not(:disabled):hover,
.ghost-button:not(:disabled):hover,
.confirmation-actions button:not(:disabled):hover,
.payment-method-card:hover {
  transform: translateY(-2px);
}

.payment-method-card:hover {
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.1);
}

.payment-submit:not(:disabled):hover {
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.18);
}

.payment-submit:not(:disabled):active {
  transform: scale(0.98);
}

@keyframes payment-submit-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 980px) {
  .payment-checkout {
    grid-template-columns: minmax(0, 1.2fr) minmax(300px, 0.8fr);
  }
}

@media (max-width: 840px) {
  .payment-checkout {
    grid-template-columns: 1fr;
    padding: 1.2rem;
  }

  .payment-summary-card {
    position: static;
  }
}

@media (max-width: 760px) {
  .payment-method-grid,
  .commercial-payment-brief {
    grid-template-columns: 1fr;
  }

  .document-panel,
  .payment-summary-card,
  .payment-method-card,
  .payment-mode-panel,
  .payment-wire-card,
  .payment-field--stacked,
  .commercial-payment-brief__card {
    border-radius: 18px;
  }

  .document-panel,
  .payment-summary-card,
  .payment-method-card,
  .payment-mode-panel,
  .payment-wire-card,
  .payment-field--stacked,
  .commercial-payment-brief__card {
    padding: 0.9rem;
  }

  .payment-checkout__hero h2 {
    font-size: 2.5rem;
  }

  .payment-checkout__hero p {
    font-size: 1.08rem;
  }

  .payment-summary-card__meta-highlight {
    flex-direction: column;
  }

  .confirmation-actions,
  .payment-assisted-actions__row {
    display: grid;
    grid-template-columns: 1fr;
  }

  .payment-submit,
  .primary-action,
  .secondary-button,
  .ghost-button,
  .confirmation-actions button {
    width: 100%;
  }

  .payment-method-card {
    min-height: auto;
  }
}
</style>
