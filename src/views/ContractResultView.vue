<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { markClientTripReadyForPayment } from '../features/client/clientBookingApi'
import {
  contractApi,
  clearPendingContractContext,
  normalizeContractFrontendState,
  readPendingContractContext,
} from '../services/contractApi'
import { emitWorkflowSync } from '../lib/workflowSync'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const contract = ref(null)
const error = ref('')
const syncingReadyForPayment = ref(false)
let autoContinueTimer = null
let contractStatusPollTimer = null

const contractId = computed(() => String(route.query.contract_id || '').trim())
const reservationId = computed(() => String(route.query.reservation_id || '').trim())
const docusignReturnEvent = computed(() => String(route.query.event || '').trim().toLowerCase())
const docusignReturnedAsCompleted = computed(() =>
  ['signing_complete', 'completed', 'signing_completed'].includes(docusignReturnEvent.value),
)

const pendingContext = computed(() =>
  readPendingContractContext({
    reservationId: reservationId.value,
    contractId: contractId.value,
  }),
)

const effectiveContractId = computed(
  () =>
    contractId.value ||
    String(pendingContext.value?.contractId || pendingContext.value?.contract_id || '').trim(),
)

const effectiveReservationId = computed(
  () =>
    reservationId.value ||
    String(
      pendingContext.value?.reservationId || pendingContext.value?.reservation_id || '',
    ).trim(),
)

const frontendState = computed(() => normalizeContractFrontendState(contract.value || {}))
const normalizedStatus = computed(() => frontendState.value.ui_status)
const docusignCompleted = computed(
  () =>
    docusignReturnedAsCompleted.value ||
    frontendState.value.ready_for_payment === true ||
    ['go_to_payment', 'go_to_history'].includes(String(frontendState.value.next_action || '').trim()) ||
    String(frontendState.value.docusign_status || '').trim().toLowerCase() === 'completed',
)

const visualStatus = computed(() => {
  if (error.value) return 'error'
  if (docusignCompleted.value) return 'success'
  return 'loading'
})

const statusTitle = computed(() => {
  if (visualStatus.value === 'loading') return 'Validando estado del contrato...'
  if (visualStatus.value === 'success') return 'Contrato firmado correctamente.'
  return 'No pudimos validar la firma'
})

const statusDescription = computed(() => {
  if (visualStatus.value === 'loading') return 'Esto puede tardar unos segundos.'
  if (visualStatus.value === 'success') return 'Tu contrato fue firmado y validado correctamente.'
  return 'No fue posible confirmar el estado del contrato. Intenta nuevamente.'
})

const canNavigateToHistory = computed(() => Boolean(effectiveReservationId.value))
const statusMessage = computed(() =>
  docusignCompleted.value
    ? 'DocuSign devolvio confirmacion de firma. Ya puedes continuar a tu historial.'
    : frontendState.value.status_message ||
      'Te llevaremos a tu historial para que sigas el estado del contrato desde ahi.',
)

function clearContractStatusPollTimer() {
  if (!contractStatusPollTimer) return
  window.clearTimeout(contractStatusPollTimer)
  contractStatusPollTimer = null
}

function queueContractStatusPoll() {
  if (docusignCompleted.value || !effectiveContractId.value) return
  clearContractStatusPollTimer()
  contractStatusPollTimer = window.setTimeout(() => {
    void loadContractStatus({ silent: true })
  }, 4000)
}

async function persistReadyForPayment() {
  if (
    syncingReadyForPayment.value ||
    !docusignReturnedAsCompleted.value ||
    !effectiveReservationId.value
  ) {
    return null
  }

  syncingReadyForPayment.value = true

  try {
    return await markClientTripReadyForPayment(
      effectiveReservationId.value,
      {
        reservation_id: effectiveReservationId.value,
        flight_request_id:
          route.query.flight_request_id ||
          pendingContext.value?.flightRequestId ||
          pendingContext.value?.flight_request_id ||
          '',
        contract_snapshot:
          pendingContext.value?.contractPayload?.contract_snapshot ||
          pendingContext.value?.contract_payload?.contract_snapshot ||
          null,
      },
      { timeoutMs: 30000 },
    )
  } catch (syncError) {
    console.warn('[contract-result-ready-for-payment-warning]', {
      reservationId: effectiveReservationId.value,
      contractId: effectiveContractId.value,
      message: syncError?.message || 'No se pudo persistir payment_pending.',
    })
    return null
  } finally {
    syncingReadyForPayment.value = false
  }
}

async function loadContractStatus({ silent = false } = {}) {
  if (!silent) {
    loading.value = true
  }
  error.value = ''
  clearContractStatusPollTimer()

  try {
    if (docusignReturnedAsCompleted.value) {
      const persistedReservation = await persistReadyForPayment()

      if (persistedReservation && typeof persistedReservation === 'object') {
        contract.value = {
          ...persistedReservation,
          contract:
            persistedReservation.contract && typeof persistedReservation.contract === 'object'
              ? persistedReservation.contract
              : contract.value?.contract || null,
          frontend_state: {
            ...persistedReservation.frontend_state,
            ready_for_payment: true,
            next_action: 'go_to_history',
            docusign_status: 'completed',
          },
          docusign_status: 'completed',
        }
      }
    }

    if (!effectiveContractId.value) {
      if (docusignReturnedAsCompleted.value && effectiveReservationId.value) {
        contract.value = {
          docusign_status: 'completed',
          status: 'completed',
          frontend_state: {
            ui_status: 'completed',
            docusign_status: 'completed',
            ready_for_payment: true,
            next_action: 'go_to_history',
            status_message: 'DocuSign devolvio confirmacion de firma. Ya puedes continuar a tu historial.',
          },
        }
        queueAutoContinue()
        return
      }

      throw new Error('No encontramos el identificador del contrato para validar la firma.')
    }

    const response = await contractApi.getContractStatus(effectiveContractId.value, { timeoutMs: 30000 })
    const nestedContract = response?.contract || response?.data?.contract || null
    contract.value =
      nestedContract && typeof nestedContract === 'object'
        ? {
            ...response,
            ...nestedContract,
            contract: nestedContract,
          }
        : response || null

    if (docusignCompleted.value) {
      clearResolvedDocuSignQuery()
      clearPendingContractContext({
        reservationId: effectiveReservationId.value,
        contractId: effectiveContractId.value,
      })
      emitWorkflowSync({
        scope: 'reservation-workflow',
        reservationId: effectiveReservationId.value,
        requestId: effectiveReservationId.value,
        nextStage: 'payment_pending',
      })
    }

    queueAutoContinue()
  } catch (loadError) {
    error.value = loadError?.message || 'No pudimos consultar el estado del contrato.'
    queueContractStatusPoll()
  } finally {
    if (!silent) {
      loading.value = false
    }
    if (!docusignCompleted.value) {
      queueContractStatusPoll()
    }
  }
}

function clearAutoContinueTimer() {
  if (!autoContinueTimer) return
  window.clearTimeout(autoContinueTimer)
  autoContinueTimer = null
}

function queueAutoContinue() {
  if (!canNavigateToHistory.value || !docusignCompleted.value) return
  clearAutoContinueTimer()
  autoContinueTimer = window.setTimeout(() => {
    continuarHistorial()
  }, 1200)
}

function clearResolvedDocuSignQuery() {
  if (!docusignReturnedAsCompleted.value) return

  const nextQuery = {
    ...route.query,
  }

  delete nextQuery.event

  router.replace({
    query: nextQuery,
  })
}

function buildSignedContractQuery() {
  const query = {
    contract_signed: '1',
  }

  if (contractId.value) {
    query.contract_id = contractId.value
  } else if (effectiveContractId.value) {
    query.contract_id = effectiveContractId.value
  }

  if (effectiveReservationId.value) {
    query.reservation_id = effectiveReservationId.value
  }

  return query
}

function continuarHistorial() {
  clearAutoContinueTimer()

  if (effectiveReservationId.value) {
    router.push({
      name: 'cliente-detalle',
      params: {
        section: 'historial',
        id: effectiveReservationId.value,
      },
      query: docusignCompleted.value ? buildSignedContractQuery() : undefined,
    })
    return
  }

  router.push({
    name: 'cliente',
    params: { section: 'historial' },
    query: docusignCompleted.value ? buildSignedContractQuery() : undefined,
  })
}

function retryValidation() {
  void loadContractStatus()
}

onMounted(loadContractStatus)
onBeforeUnmount(() => {
  clearAutoContinueTimer()
  clearContractStatusPollTimer()
})
</script>

<template>
  <main class="contract-result-page">
    <div class="contract-result-background">
      <div class="contract-result-decoration"></div>
    </div>

    <section class="contract-result-shell">
      <div class="contract-result-icon">
        <svg v-if="visualStatus === 'success'" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="14 2 14 8 20 8" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M9 15l2 2 4-4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <svg v-else-if="visualStatus === 'error'" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="14 2 14 8 20 8" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="11" cy="15" r="1" fill="currentColor"/>
          <circle cx="11" cy="11" r="1" fill="currentColor"/>
        </svg>
        <svg v-else width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="14 2 14 8 20 8" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M8 13h8M8 17h8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>

      <article class="contract-result-card">
        <p class="contract-result-eyebrow">Contrato cliente</p>
        <h1 class="contract-result-title">{{ statusTitle }}</h1>
        <p class="contract-result-description">{{ statusDescription }}</p>

        <p v-if="statusMessage && visualStatus !== 'loading'" class="contract-result-status-message">{{ statusMessage }}</p>

        <ol v-if="visualStatus === 'loading'" class="signature-progress" aria-label="Progreso de validación">
          <li class="signature-progress__step signature-progress__step--complete">
            <span class="signature-progress__marker">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke-linecap="round" stroke-linejoin="round"/>
                <polyline points="14 2 14 8 20 8" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M8 13h8M8 17h8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <span class="signature-progress__label">Verificando</span>
          </li>
          <li class="signature-progress__step signature-progress__step--active" aria-busy="true">
            <span class="signature-progress__marker">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="signature-progress__spinner" aria-hidden="true">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <span class="signature-progress__label">Validando</span>
          </li>
          <li class="signature-progress__step signature-progress__step--pending">
            <span class="signature-progress__marker">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M9 12l2 2 4-4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <span class="signature-progress__label">Finalizando</span>
          </li>
        </ol>

        <ol v-else-if="visualStatus === 'success'" class="signature-progress" aria-label="Progreso de validación">
          <li class="signature-progress__step signature-progress__step--complete">
            <span class="signature-progress__marker">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke-linecap="round" stroke-linejoin="round"/>
                <polyline points="14 2 14 8 20 8" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M8 13h8M8 17h8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <span class="signature-progress__label">Verificando</span>
          </li>
          <li class="signature-progress__step signature-progress__step--complete">
            <span class="signature-progress__marker">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M9 12l2 2 4-4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <span class="signature-progress__label">Validando</span>
          </li>
          <li class="signature-progress__step signature-progress__step--complete">
            <span class="signature-progress__marker">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke-linecap="round" stroke-linejoin="round"/>
                <polyline points="14 2 14 8 20 8" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M9 15l2 2 4-4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <span class="signature-progress__label">Finalizando</span>
          </li>
        </ol>

        <ol v-else class="signature-progress" aria-label="Progreso de validación">
          <li class="signature-progress__step signature-progress__step--complete">
            <span class="signature-progress__marker">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke-linecap="round" stroke-linejoin="round"/>
                <polyline points="14 2 14 8 20 8" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M8 13h8M8 17h8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <span class="signature-progress__label">Verificando</span>
          </li>
          <li class="signature-progress__step signature-progress__step--error">
            <span class="signature-progress__marker">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M9 12l2 2 4-4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <span class="signature-progress__label">Validando</span>
          </li>
          <li class="signature-progress__step signature-progress__step--pending">
            <span class="signature-progress__marker">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke-linecap="round" stroke-linejoin="round"/>
                <polyline points="14 2 14 8 20 8" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M9 15l2 2 4-4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <span class="signature-progress__label">Finalizando</span>
          </li>
        </ol>

        <div v-if="visualStatus === 'loading'" class="contract-result-pill" role="status" aria-live="polite">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M12 16v-4M12 8h.01" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>Esto puede tardar unos segundos.</span>
        </div>

        <div v-if="visualStatus === 'success' && (contract?.contract_id || contract?.id || contractId)" class="contract-result-details">
          <div v-if="contract?.contract_id || contract?.id || contractId" class="contract-result-detail">
            <span class="contract-result-detail__label">Folio</span>
            <span class="contract-result-detail__value">{{ contract?.contract_id || contract?.id || contractId }}</span>
          </div>
          <div v-if="contract?.signed_at || contract?.updated_at || contract?.contract?.signed_at" class="contract-result-detail">
            <span class="contract-result-detail__label">Fecha de firma</span>
            <span class="contract-result-detail__value">{{ contract?.signed_at || contract?.updated_at || contract?.contract?.signed_at }}</span>
          </div>
          <div v-if="normalizedStatus" class="contract-result-detail">
            <span class="contract-result-detail__label">Estado</span>
            <span class="contract-result-detail__value">{{ normalizedStatus }}</span>
          </div>
        </div>

        <div v-if="visualStatus === 'error'" class="contract-result-error" role="alert">
          <p>{{ error }}</p>
        </div>

        <div class="contract-result-actions">
          <button
            v-if="visualStatus === 'error'"
            type="button"
            class="contract-result-button contract-result-button--primary"
            @click="retryValidation"
          >
            Reintentar validación
          </button>

          <button
            v-if="visualStatus === 'success'"
            type="button"
            class="contract-result-button contract-result-button--primary"
            :disabled="syncingReadyForPayment"
            @click="continuarHistorial"
          >
            {{ syncingReadyForPayment ? 'Preparando...' : 'Continuar' }}
          </button>

          <button
            v-if="visualStatus === 'error' && canNavigateToHistory"
            type="button"
            class="contract-result-button contract-result-button--ghost"
            @click="continuarHistorial"
          >
            Volver al inicio
          </button>
        </div>
      </article>
    </section>
  </main>
</template>

<style scoped>
.contract-result-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 40px 24px;
  background:
    radial-gradient(circle at center 35%, rgba(199, 157, 70, 0.12), transparent 32%),
    linear-gradient(180deg, #18222c 0%, #39434b 35%, #d8d5ce 68%, #f4ede1 100%);
}

.contract-result-background {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.contract-result-decoration {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 20% 10%, rgba(199, 157, 70, 0.08), transparent 28%),
    radial-gradient(circle at 80% 90%, rgba(199, 157, 70, 0.06), transparent 32%);
}

.contract-result-shell {
  position: relative;
  width: min(800px, 100%);
  display: grid;
  place-items: center;
  gap: 24px;
}

.contract-result-icon {
  width: 104px;
  height: 104px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #e0b75e;
  background: rgba(196, 150, 56, 0.08);
  border: 1px solid rgba(217, 177, 88, 0.24);
  box-shadow:
    0 0 0 18px rgba(196, 150, 56, 0.025),
    0 0 50px rgba(196, 150, 56, 0.16);
}

.contract-result-card {
  width: min(800px, 100%);
  padding: 56px 64px 36px;
  border: 1px solid rgba(255, 255, 255, 0.65);
  border-radius: 34px;
  background: rgba(255, 253, 249, 0.97);
  box-shadow:
    0 32px 80px rgba(18, 25, 31, 0.22),
    0 8px 24px rgba(18, 25, 31, 0.10);
  text-align: center;
  backdrop-filter: blur(18px);
  display: grid;
  gap: 18px;
}

.contract-result-eyebrow {
  color: #b88a2e;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin: 0;
}

.contract-result-title {
  margin: 0;
  color: #111315;
  font-size: clamp(42px, 5vw, 64px);
  font-weight: 800;
  line-height: 1.05;
}

.contract-result-description {
  margin: 20px 0 0;
  color: #52575c;
  font-size: 20px;
  line-height: 1.35;
}

.contract-result-status-message {
  margin: 16px 0 0;
  color: #62676b;
  font-size: 16px;
  line-height: 1.5;
}

.signature-progress {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  list-style: none;
  margin: 28px 0 0;
  padding: 0;
  flex-wrap: wrap;
}

.signature-progress__step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  min-width: 96px;
}

.signature-progress__marker {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #b88a2e;
  background: rgba(196, 150, 56, 0.10);
  border: 1px solid rgba(217, 177, 88, 0.28);
}

.signature-progress__label {
  font-size: 14px;
  font-weight: 600;
  color: #62676b;
  text-align: center;
}

.signature-progress__step--complete .signature-progress__marker {
  color: #2f7d57;
  background: rgba(47, 125, 87, 0.10);
  border-color: rgba(47, 125, 87, 0.28);
}

.signature-progress__step--active .signature-progress__marker {
  color: #b88a2e;
  background: rgba(196, 150, 56, 0.14);
  border-color: rgba(217, 177, 88, 0.45);
}

.signature-progress__step--pending .signature-progress__marker {
  color: #9aa3a9;
  background: rgba(154, 163, 169, 0.10);
  border-color: rgba(154, 163, 169, 0.22);
}

.signature-progress__step--error .signature-progress__marker {
  color: #a84848;
  background: rgba(168, 72, 72, 0.10);
  border-color: rgba(168, 72, 72, 0.28);
}

.signature-progress__spinner {
  animation: signature-spin 1s linear infinite;
}

@keyframes signature-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .signature-progress__spinner {
    animation: none;
  }
}

.contract-result-pill {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-top: 24px;
  padding: 12px 22px;
  border-radius: 999px;
  background: #f4ede1;
  color: #4a3f2f;
  font-weight: 600;
  font-size: 15px;
}

.contract-result-details {
  margin-top: 24px;
  display: grid;
  gap: 12px;
  text-align: left;
}

.contract-result-detail {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 14px;
  background: rgba(17, 19, 21, 0.03);
}

.contract-result-detail__label {
  color: #62676b;
  font-weight: 600;
}

.contract-result-detail__value {
  color: #111315;
  font-weight: 700;
  text-align: right;
  word-break: break-word;
}

.contract-result-error {
  margin-top: 24px;
  padding: 16px;
  border-radius: 18px;
  background: rgba(168, 72, 72, 0.08);
  color: #a84848;
  font-weight: 600;
  text-align: left;
}

.contract-result-actions {
  margin-top: 28px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
}

.contract-result-button {
  min-width: 180px;
  padding: 14px 18px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
  border: none;
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.contract-result-button:focus-visible {
  outline: 3px solid #b88a2e;
  outline-offset: 3px;
}

.contract-result-button--primary {
  background: #111315;
  color: #fff;
}

.contract-result-button--ghost {
  background: transparent;
  color: #111315;
  border: 1px solid rgba(17, 19, 21, 0.18);
}

@media (max-width: 640px) {
  .contract-result-page {
    padding: 24px 16px;
  }

  .contract-result-icon {
    width: 82px;
    height: 82px;
  }

  .contract-result-card {
    padding: 38px 20px 28px;
    border-radius: 24px;
  }

  .contract-result-title {
    font-size: 38px;
  }

  .contract-result-description {
    font-size: 17px;
  }

  .signature-progress {
    gap: 10px;
  }

  .signature-progress__marker {
    width: 48px;
    height: 48px;
  }

  .contract-result-button {
    width: 100%;
  }
}
</style>
