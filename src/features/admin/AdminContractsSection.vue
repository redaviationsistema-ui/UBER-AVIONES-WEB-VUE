<script setup>
import { computed } from 'vue'
import { api } from '../../lib/api'

const props = defineProps({
  contracts: { type: Array, default: () => [] },
})

const contractSignals = computed(() => {
  const total = props.contracts.length
  const signed = props.contracts.filter((item) => normalizeContractStatus(item.status) === 'signed').length
  const pending = props.contracts.filter((item) => normalizeContractStatus(item.status) === 'pending').length
  const cancelled = props.contracts.filter((item) => normalizeContractStatus(item.status) === 'cancelled').length

  return [
    { label: 'Registrados', value: String(total), detail: 'Contratos visibles desde base de datos.' },
    { label: 'Firmados', value: String(signed), detail: 'Versiones completadas por cliente.' },
    { label: 'Pendientes', value: String(pending), detail: 'Documentos aun sin firma final.' },
    { label: 'Cancelados', value: String(cancelled), detail: 'Contratos anulados o reemplazados.' },
  ]
})

function normalizeContractStatus(status) {
  const value = String(status || '').trim().toLowerCase()
  if (['signed', 'firmado', 'firmada'].includes(value)) return 'signed'
  if (['cancelled', 'canceled', 'cancelado', 'cancelada', 'void'].includes(value)) return 'cancelled'
  if (['generated', 'draft', 'pending', 'pendiente'].includes(value)) return 'pending'
  return value || 'pending'
}

function contractStatusLabel(status) {
  const normalized = normalizeContractStatus(status)
  if (normalized === 'signed') return 'Firmado'
  if (normalized === 'cancelled') return 'Cancelado'
  if (normalized === 'pending') return 'Pendiente'
  return status || 'Pendiente'
}

function formatMoney(value, currency = 'MXN') {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return 'Sin monto'

  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: currency || 'MXN',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(value) {
  if (!value) return 'Sin fecha'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

async function openContractPdf(contract) {
  const reservationId = contract?.reservation?.id || contract?.reservation_id
  if (!reservationId) return

  const response = await api.download(`/cliente/reservas/${reservationId}/contrato/pdf`, {
    preserveAuthOnUnauthorized: true,
    timeoutMs: 45000,
  })

  const blobUrl = URL.createObjectURL(response.blob)
  window.open(blobUrl, '_blank', 'noopener,noreferrer')
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
}
</script>

<template>
  <div class="admin-contracts-page">
    <section class="dashboard-hero">
      <div class="hero-center hero-compact">
        <p class="eyebrow dark-eyebrow">Contratos</p>
        <h1>Contratos registrados</h1>
        <p class="hero-subtitle">
          Consulta los contratos reales de la base de datos con su reserva, cliente, estado de firma y archivo.
        </p>
      </div>
    </section>

    <section class="status-strip">
      <article v-for="item in contractSignals" :key="item.label" class="signal-card">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <p>{{ item.detail }}</p>
      </article>
    </section>

    <section class="editorial-section">
      <div class="section-heading">
        <h2>Directorio de contratos</h2>
        <p>{{ contracts.length }} contratos cargados desde backend.</p>
      </div>

      <div class="table-shell">
        <div class="table-row table-head-row">
          <span>Contrato</span>
          <span>Cliente</span>
          <span>Reserva</span>
          <span>Estado</span>
          <span>Monto</span>
          <span>Fechas</span>
          <span>Archivo</span>
        </div>

        <div v-for="contract in contracts" :key="contract.id" class="table-row">
          <div class="cell-stack">
            <strong>{{ contract.contract_code || `CTR-${contract.id}` }}</strong>
            <small>{{ contract.signed_by?.name || 'Sin firmante' }}</small>
          </div>

          <div class="cell-stack">
            <strong>{{ contract.reservation?.client?.name || 'Sin cliente' }}</strong>
            <small>{{ contract.reservation?.client?.email || 'Sin correo' }}</small>
          </div>

          <div class="cell-stack">
            <strong>{{ contract.reservation?.reservation_code || `RES-${contract.reservation_id}` }}</strong>
            <small>{{ contract.reservation?.aircraft?.model || 'Sin aeronave' }}</small>
          </div>

          <span>
            <span
              class="status-pill"
              :class="{
                'status-pill-success': normalizeContractStatus(contract.status) === 'signed',
                'status-pill-warn': normalizeContractStatus(contract.status) === 'pending',
                'status-pill-danger': normalizeContractStatus(contract.status) === 'cancelled',
              }"
            >
              {{ contractStatusLabel(contract.status) }}
            </span>
          </span>

          <span>{{ formatMoney(contract.reservation?.total_amount, contract.reservation?.currency) }}</span>

          <div class="cell-stack">
            <small>Generado: {{ formatDate(contract.generated_at) }}</small>
            <small>Firmado: {{ formatDate(contract.signed_at) }}</small>
          </div>

          <span>
            <button
              v-if="contract.reservation?.id || contract.reservation_id"
              type="button"
              class="admin-text-link admin-text-button"
              @click="openContractPdf(contract)"
            >
              Ver PDF
            </button>
            <span v-else class="table-muted">Sin archivo</span>
          </span>
        </div>

        <div v-if="!contracts.length" class="table-row empty-row">
          <span>No hay contratos registrados para mostrar.</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.admin-contracts-page {
  min-height: 100vh;
  background: #ffffff;
  color: #111111;
}

.dashboard-hero,
.editorial-section {
  padding: 1.5rem clamp(1.25rem, 5vw, 4.5rem);
}

.dashboard-hero {
  display: grid;
  min-height: auto;
  padding-top: 1rem;
  background:
    radial-gradient(circle at top right, rgba(201, 164, 90, 0.12), transparent 18%),
    linear-gradient(180deg, #ffffff 0%, #faf8f2 100%);
}

.hero-center {
  display: grid;
  gap: 1rem;
}

.hero-compact {
  max-width: 980px;
  justify-items: start;
  text-align: left;
}

.dark-eyebrow {
  color: #8c6a1f;
}

.hero-center h1,
.section-heading h2 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.05em;
}

.hero-center h1 {
  font-size: clamp(2.2rem, 5vw, 3.4rem);
  line-height: 0.98;
}

.hero-subtitle,
.section-heading p,
.signal-card p,
.cell-stack small {
  margin: 0;
  color: #5d5d5d;
  line-height: 1.7;
}

.status-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
  padding: 0 clamp(1.25rem, 5vw, 4.5rem) 1.2rem;
  margin-top: -1.2rem;
}

.signal-card,
.table-shell {
  border: 1px solid #ebebeb;
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.05);
}

.signal-card {
  display: grid;
  gap: 0.4rem;
  padding: 1rem 1.05rem;
}

.signal-card span {
  color: #666666;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.signal-card strong {
  font-size: 1.5rem;
  line-height: 1;
}

.editorial-section {
  display: grid;
  gap: 1.5rem;
}

.section-heading {
  display: grid;
  gap: 0.5rem;
  max-width: 760px;
}

.section-heading h2 {
  font-size: clamp(2rem, 4vw, 3rem);
  line-height: 1.02;
}

.table-shell {
  overflow: visible;
}

.table-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 0.8fr 0.9fr 1fr 0.8fr;
  gap: 1rem;
  align-items: center;
  padding: 1rem 1.1rem;
  border-top: 1px solid #ebebeb;
  background: #ffffff;
}

.table-head-row {
  border-top: 0;
  background: #fafafa;
  color: #6b7280;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.cell-stack {
  display: grid;
  gap: 0.15rem;
}

.status-pill {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  min-height: 2rem;
  padding: 0 0.75rem;
  border-radius: 999px;
  font-size: 0.74rem;
  font-weight: 800;
  color: #0f7b53;
  background: #dceee5;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.status-pill-warn {
  color: #a34b19;
  background: #f8e5d7;
}

.status-pill-danger {
  color: #b42318;
  background: #fee4e2;
}

.status-pill-success {
  color: #0f7b53;
  background: #dceee5;
}

.admin-text-link {
  color: #8c6a1f;
  font-weight: 800;
  text-decoration: none;
}

.admin-text-button {
  appearance: none;
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 0;
}

.table-muted {
  color: #8a8f98;
  font-size: 0.88rem;
}

.empty-row {
  grid-template-columns: 1fr;
}

@media (max-width: 1220px) {
  .status-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 920px) {
  .table-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .status-strip {
    grid-template-columns: 1fr;
  }
}
</style>
