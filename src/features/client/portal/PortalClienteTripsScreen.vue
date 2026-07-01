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
              :class="{ 'payment-method-card--active': selectedPaymentMethod === method.id }"
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
                calculado por el backend. La reserva se actualizara cuando Stripe confirme el pago.
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
            reservationCheckoutReturnPending
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
                    : !selectedPaymentMethod
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
              : 'No encontramos una reserva para pagar'
            : 'Preparando checkout'
        }}
      </h2>
      <p v-if="hasReservationsLoaded">
        {{
          selectedReservation?.is_reservation
            ? selectedReservationFrontendState.status_message ||
              'El pago se habilitara cuando el contrato tenga ready_for_payment en true.'
            : 'Primero necesitamos identificar una reserva activa para abrir el checkout.'
        }}
      </p>
      <p v-else>Estamos cargando la informacion de tu reserva antes de abrir el pago.</p>
      <div class="confirmation-actions">
        <button
          v-if="selectedReservation?.is_reservation"
          type="button"
          @click="$emit('go', 'contrato', reservationContextId)"
        >
          Volver al contrato
        </button>
        <button v-else type="button" @click="$emit('go', 'viajes')">Ver mis vuelos</button>
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
