<script setup>
import ActiveTrips from '../ActiveTrips.vue'
import ClientContractPreview from '../ClientContractPreview.vue'

defineProps({
  assistedPaymentProofFile: { type: Object, default: null },
  assistedPaymentProofInput: { type: Object, default: null },
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
      <h2>
        {{ hasReservationsLoaded ? 'No encontramos una reserva activa' : 'Cargando contrato' }}
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
          <span class="eyebrow">{{
            commercialAccessCheckoutReturnMode ? 'Pago de acceso comercial' : `Pago ${reservationContextId}`
          }}</span>
          <h2>{{ paymentHeroTitle }}</h2>
          <p>{{ paymentHeroCopy }}</p>
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

        <section class="payment-section">
          <h3>Metodo de pago</h3>
          <div v-if="!commercialAccessCheckoutReturnMode" class="payment-method-grid">
            <button
              v-for="method in paymentMethodCards"
              :key="method.id"
              type="button"
              class="payment-method-card"
              :class="{
                'payment-method-card--active':
                  paymentMethodExplicitlySelected && selectedPaymentMethod === method.id,
              }"
              @click="$emit('update:selected-payment-method', method.id)"
            >
              <strong>{{ method.label }}</strong>
              <span>{{ method.note }}</span>
            </button>
          </div>

          <div class="payment-mode-panel">
            <div v-if="commercialAccessCheckoutReturnMode" class="payment-mode-panel__copy">
              <strong>Stripe Checkout seguro</strong>
              <p>
                Al continuar te llevaremos a la pagina segura de Stripe para completar la
                renovacion mensual de tu acceso comercial.
              </p>
            </div>

            <div v-else-if="selectedPaymentMethod === 'stripe'" class="payment-mode-panel__copy">
              <strong>Stripe Checkout seguro</strong>
              <p>
                Al continuar te llevaremos a Stripe para pagar el costo del vuelo con el total
                calculado . La reserva se actualizara cuando Stripe confirme el pago.
              </p>
            </div>

            <div v-else-if="selectedPaymentMethod === 'assisted'" class="payment-mode-panel__copy">
              <strong>Pago en efectivo</strong>
              <p>Pago manual con comprobante sujeto a validacion administrativa.</p>
            </div>

            <div v-else class="payment-mode-panel__copy">
              <strong>Selecciona un metodo</strong>
              <p>Elige Stripe o pago en efectivo para continuar con esta reserva.</p>
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
              :ref="
                (node) => {
                  if (assistedPaymentProofInput) assistedPaymentProofInput.value = node
                }
              "
              type="file"
              accept=".pdf,image/*"
              class="payment-proof-input"
              @change="$emit('select-assisted-payment-proof', $event)"
            />

            <button
              type="button"
              class="ghost-button"
              :disabled="!canUploadAssistedPaymentProof"
              @click="$emit('trigger-assisted-payment-proof-upload')"
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
            <span>Correo electronico</span>
            <input
              :value="paymentForm.contactEmail"
              type="email"
              placeholder="cliente@empresa.com"
              @input="$emit('update:payment-contact-email', $event.target.value)"
            />
          </label>
        </section>
      </div>

      <aside class="payment-summary-card">
        <span class="payment-summary-card__eyebrow">{{
          commercialAccessCheckoutReturnMode ? 'Resumen de acceso' : 'Resumen de reserva'
        }}</span>
        <h3>{{ customerDisplayName }}</h3>
        <p class="payment-summary-card__route">{{ paymentRouteHeadline }}</p>
        <div class="payment-summary-meta">
          <template v-if="commercialAccessCheckoutReturnMode">
            <p v-for="item in commercialAccessCheckoutFacts.slice(0, 2)" :key="item.label">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </p>
          </template>
          <p>
            <span>Fecha estimada</span>
            <strong>{{ paymentDateLabel }}</strong>
          </p>
          <p>
            <span>Metodo seleccionado</span>
            <strong>{{ paymentMethodSummaryLabel }}</strong>
          </p>
        </div>

        <div class="payment-totals">
          <p
            v-for="item in paymentBreakdownRows"
            :key="item.key"
            :class="{ 'payment-totals__total': item.total }"
          >
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </p>
          <p v-if="!paymentBreakdownRows.length" class="payment-totals__total">
            <span>Importe a pagar hoy</span>
            <strong>{{ paymentSummaryAmountLabel }}</strong>
          </p>
        </div>

        <button
          class="payment-submit"
          type="button"
          :disabled="
            paymentSubmitting ||
            commercialAccessCheckoutReturnPending ||
            reservationCheckoutReturnPending ||
            (!commercialAccessCheckoutReturnMode && !paymentMethodExplicitlySelected)
          "
          @click="$emit('payment-submit')"
        >
          {{
            commercialAccessCheckoutReturnPending
              ? 'Validando pago...'
              : reservationCheckoutReturnPending
                ? 'Validando pago...'
                : paymentSubmitting
                  ? 'Procesando...'
                  : commercialAccessCheckoutReturnMode
                    ? commercialAccessCtaLabel
                    : !paymentMethodExplicitlySelected
                      ? 'Selecciona metodo de pago'
                    : selectedPaymentMethod === 'assisted'
                        ? assistedPrimaryCtaLabel
                        : 'Continuar a Stripe'
          }}
        </button>
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
  grid-template-columns: minmax(0, 1.15fr) minmax(320px, 420px);
  gap: 1.5rem;
  align-items: start;
}

.payment-checkout__main {
  display: grid;
  gap: 1.35rem;
}

.payment-back {
  width: fit-content;
  padding: 0;
  border: 0;
  background: transparent;
  color: #111111;
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
  gap: 0.8rem;
}

.payment-checkout__hero p,
.payment-mode-panel__copy p,
.payment-proof-hint,
.payment-proof-name,
.payment-inline-error,
.payment-summary-card__route {
  margin: 0;
}

.payment-section h3,
.payment-summary-card h3 {
  margin: 0;
  color: #111111;
  font-size: clamp(1.2rem, 2vw, 1.7rem);
}

.payment-method-grid,
.commercial-payment-brief {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
}

.payment-method-card {
  display: grid;
  gap: 0.42rem;
  min-height: 128px;
  padding: 1.15rem;
  background: linear-gradient(180deg, #ffffff, #f8f5ee);
  text-align: left;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
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
  border-color: rgba(191, 151, 65, 0.52);
  box-shadow: 0 18px 44px rgba(17, 17, 17, 0.08);
  background: linear-gradient(180deg, #fffdf7, #ffffff);
}

.payment-mode-panel,
.payment-wire-card,
.payment-field--stacked,
.payment-summary-card,
.commercial-payment-brief__card {
  padding: 1rem 1.1rem;
  background: #ffffff;
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
  padding: 0 0.1rem;
  border: 0;
  outline: none;
  background: transparent;
  color: #111111;
  font: inherit;
}

.payment-field input::placeholder {
  color: #9d9589;
}

.payment-summary-card {
  position: sticky;
  top: 6rem;
  gap: 1rem;
  padding: 1.4rem;
  background:
    radial-gradient(circle at top right, rgba(191, 151, 65, 0.14), transparent 30%),
    linear-gradient(180deg, #fffdfa, #f6f0e5);
}

.payment-totals {
  display: grid;
  gap: 0.65rem;
}

.payment-totals__total {
  padding-top: 0.75rem;
  border-top: 1px solid rgba(17, 17, 17, 0.08);
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
  background: #111111;
  box-shadow: 0 16px 30px rgba(17, 17, 17, 0.16);
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

@media (max-width: 980px) {
  .payment-checkout {
    grid-template-columns: 1fr;
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
}
</style>
