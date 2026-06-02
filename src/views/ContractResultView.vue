<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  contractApi,
  clearPendingContractContext,
  downloadSignedContractPdf,
  normalizeContractFrontendState,
  readPendingContractContext,
} from '../services/contractApi'
import { emitWorkflowSync } from '../lib/workflowSync'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const downloadingPdf = ref(false)
const contract = ref(null)
const error = ref('')
let autoContinueTimer = null

const contractId = computed(() => String(route.query.contract_id || '').trim())
const reservationId = computed(() => String(route.query.reservation_id || '').trim())

const pendingContext = computed(() =>
  readPendingContractContext({
    reservationId: reservationId.value,
    contractId: contractId.value,
  }),
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
  () => String(frontendState.value.docusign_status || '').trim().toLowerCase() === 'completed',
)
const statusMessage = computed(() => frontendState.value.status_message || '')
const signedPdfUrl = computed(() => String(frontendState.value.signed_pdf_url || '').trim())
const canDownloadSignedPdf = computed(() => Boolean(signedPdfUrl.value))

async function loadContractStatus() {
  loading.value = true
  error.value = ''

  try {
    if (!contractId.value) {
      throw new Error('No encontramos el identificador del contrato para validar la firma.')
    }

    const response = await contractApi.getContractStatus(contractId.value, { timeoutMs: 30000 })
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
      clearPendingContractContext({
        reservationId: effectiveReservationId.value,
        contractId: contractId.value,
      })
      emitWorkflowSync({
        scope: 'reservation-workflow',
        reservationId: effectiveReservationId.value,
        requestId: effectiveReservationId.value,
        nextStage: 'payment_pending',
      })
      queueAutoContinue()
    }
  } catch (error) {
    error.value = error?.message || 'No pudimos consultar el estado del contrato.'
  } finally {
    loading.value = false
  }
}

function clearAutoContinueTimer() {
  if (!autoContinueTimer) return
  window.clearTimeout(autoContinueTimer)
  autoContinueTimer = null
}

function queueAutoContinue() {
  if (!docusignCompleted.value) return
  clearAutoContinueTimer()
  autoContinueTimer = window.setTimeout(() => {
    continuarPago()
  }, 1200)
}

function buildSignedContractQuery() {
  const query = {
    contract_signed: '1',
  }

  if (contractId.value) {
    query.contract_id = contractId.value
  }

  if (effectiveReservationId.value) {
    query.reservation_id = effectiveReservationId.value
  }

  return query
}

function continuarPago() {
  if (!docusignCompleted.value) {
    window.alert('El contrato aun no ha sido confirmado por DocuSign.')
    return
  }

  clearAutoContinueTimer()

  if (effectiveReservationId.value) {
    router.push({
      name: 'cliente-detalle',
      params: {
        section: 'pago',
        id: effectiveReservationId.value,
      },
      query: buildSignedContractQuery(),
    })
    return
  }

  router.push({
    name: 'cliente',
    params: { section: 'pago' },
    query: buildSignedContractQuery(),
  })
}

async function handleDownloadSignedPdf() {
  if (!contractId.value || downloadingPdf.value) return

  downloadingPdf.value = true

  try {
    const response = await downloadSignedContractPdf(contractId.value, { timeoutMs: 30000 })
    const blobUrl = URL.createObjectURL(response.blob)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = response.fileName || `contrato-firmado-${contractId.value}.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(blobUrl)
  } catch (error) {
    error.value = error?.message || 'No pudimos descargar el contrato firmado.'
  } finally {
    downloadingPdf.value = false
  }
}

onMounted(loadContractStatus)
onBeforeUnmount(clearAutoContinueTimer)
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
          Regresando al flujo de pago...
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
          Esperando confirmacion de firma de DocuSign...
        </p>
        <p v-if="error" class="status-copy status-copy--error">{{ error }}</p>

        <div class="actions">
          <button type="button" @click="loadContractStatus">Actualizar estado</button>
          <button v-if="canDownloadSignedPdf" type="button" class="secondary" @click="handleDownloadSignedPdf">
            {{ downloadingPdf ? 'Descargando PDF...' : 'Descargar contrato firmado' }}
          </button>
          <button type="button" class="secondary" :disabled="!docusignCompleted" @click="continuarPago">
            Continuar a pago
          </button>
        </div>
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

.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem;
}

button {
  border: none;
  border-radius: 999px;
  padding: 0.9rem 1.25rem;
  background: #15202a;
  color: #ffffff;
  font-weight: 700;
  cursor: pointer;
}

.secondary {
  background: rgba(21, 32, 42, 0.08);
  color: #15202a;
}
</style>
