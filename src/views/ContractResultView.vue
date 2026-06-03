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
            ...(persistedReservation.frontend_state || {}),
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
  } catch (error) {
    error.value = error?.message || 'No pudimos consultar el estado del contrato.'
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

onMounted(loadContractStatus)
onBeforeUnmount(() => {
  clearAutoContinueTimer()
  clearContractStatusPollTimer()
})
</script>

<template>
  <main class="contract-result-page">
    <section class="contract-result-card">
      <span class="eyebrow">Contrato cliente</span>
      <h1>Resultado de firma</h1>

      <p v-if="loading">Validando estado del contrato...</p>

      <template v-else>
        <p v-if="docusignCompleted" class="status-copy status-copy--success">
          Contrato firmado correctamente.
        </p>
        <p v-if="docusignCompleted" class="status-note">
          Regresando a tu historial...
        </p>
        <p v-else-if="normalizedStatus === 'sent'" class="status-copy status-copy--pending">
          Firma pendiente de completar.
        </p>
        <p v-else class="status-copy status-copy--pending">
          Estado actual del contrato:
          <strong>{{ normalizedStatus || 'pendiente' }}</strong>
        </p>

        <p v-if="statusMessage" class="status-note">{{ statusMessage }}</p>
        <p v-if="!docusignCompleted" class="status-note">
          Esperando confirmacion real del backend para continuar a pago...
        </p>
        <p v-if="error" class="status-copy status-copy--error">{{ error }}</p>
      </template>
    </section>
  </main>
</template>

<style scoped>
.contract-result-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 2rem 1rem;
  background:
    radial-gradient(circle at top, rgba(198, 151, 67, 0.18), transparent 30%),
    linear-gradient(180deg, #15202a 0%, #efe8db 100%);
}

.contract-result-card {
  width: min(100%, 38rem);
  display: grid;
  justify-items: center;
  gap: 1rem;
  padding: 2rem;
  border-radius: 1.75rem;
  background: rgba(255, 252, 247, 0.96);
  box-shadow: 0 24px 60px rgba(21, 32, 42, 0.18);
  text-align: center;
}

.eyebrow {
  color: #8b6a24;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  color: #111111;
  font-size: clamp(2rem, 4vw, 2.8rem);
  line-height: 1;
}

.status-copy,
.status-note {
  margin: 0;
  color: #5e564a;
}

.status-copy strong {
  color: #111111;
}

.status-copy--success {
  color: #146c43;
  font-weight: 700;
}

.status-copy--error {
  color: #b42318;
}
</style>
