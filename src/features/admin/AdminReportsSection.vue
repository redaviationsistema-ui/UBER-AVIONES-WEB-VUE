<script setup>
import { computed } from 'vue'

const props = defineProps({
  reports: { type: Object, default: () => ({}) },
  loading: { type: Boolean, default: false },
  errorMessage: { type: String, default: '' },
})

const emit = defineEmits(['refresh'])

const summaryCards = computed(() => {
  const payments = Array.isArray(props.reports?.payments_by_type) ? props.reports.payments_by_type : []
  const reservations = Array.isArray(props.reports?.reservations_by_status)
    ? props.reports.reservations_by_status
    : []
  const quotes = Array.isArray(props.reports?.quotes_by_status) ? props.reports.quotes_by_status : []

  const totalPayments = payments.reduce((acc, item) => acc + Number(item?.count || 0), 0)
  const totalReservations = reservations.reduce((acc, item) => acc + Number(item?.count || 0), 0)
  const totalQuotes = quotes.reduce((acc, item) => acc + Number(item?.count || 0), 0)
  const totalPaid = payments.reduce((acc, item) => acc + Number(item?.total || 0), 0)

  return [
    { label: 'Registros de pago', value: String(totalPayments), detail: 'Conteo devuelto por el reporte backend.' },
    { label: 'Monto consolidado', value: new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(totalPaid), detail: 'Suma reportada por tipo y estatus.' },
    { label: 'Reservas trazadas', value: String(totalReservations), detail: 'Estados de reserva entregados por Sistema.' },
    { label: 'Cotizaciones trazadas', value: String(totalQuotes), detail: 'Estados de cotización presentes en el reporte.' },
  ]
})

const reportBlocks = computed(() => [
  {
    key: 'payments_by_type',
    title: 'Pagos por tipo',
    rows: Array.isArray(props.reports?.payments_by_type) ? props.reports.payments_by_type : [],
    columns: ['payment_type', 'status', 'count', 'total'],
  },
  {
    key: 'reservations_by_status',
    title: 'Reservas por estado',
    rows: Array.isArray(props.reports?.reservations_by_status) ? props.reports.reservations_by_status : [],
    columns: ['status', 'count'],
  },
  {
    key: 'quotes_by_status',
    title: 'Cotizaciones por estado',
    rows: Array.isArray(props.reports?.quotes_by_status) ? props.reports.quotes_by_status : [],
    columns: ['status', 'count'],
  },
])
</script>

<template>
  <div class="admin-reports-page">
    <section class="dashboard-hero">
      <div class="hero-center">
        <p class="eyebrow dark-eyebrow">Reportes backend</p>
        <h1>Lectura consolidada de pagos, reservas y cotizaciones.</h1>
        <p class="hero-subtitle">
          Esta vista solo muestra agrupaciones devueltas por Sistema. No inventa series locales ni exportaciones inseguras.
        </p>
      </div>
    </section>

    <section class="status-strip">
      <article v-for="item in summaryCards" :key="item.label" class="signal-card">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <p>{{ item.detail }}</p>
      </article>
    </section>

    <section class="surface reports-shell">
      <header class="reports-toolbar">
        <p>Tablas agregadas para corte administrativo básico.</p>
        <button type="button" class="ghost-button" :disabled="loading" @click="emit('refresh')">
          {{ loading ? 'Actualizando...' : 'Actualizar' }}
        </button>
      </header>

      <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>

      <div v-if="reportBlocks.every((block) => !block.rows.length) && !loading" class="empty-state">
        <strong>Sin reporte disponible.</strong>
        <p>Sistema todavía no devolvió datos para estos cortes administrativos.</p>
      </div>

      <div v-else class="reports-grid">
        <article v-for="block in reportBlocks" :key="block.key" class="surface report-card">
          <div class="section-heading">
            <h2>{{ block.title }}</h2>
            <p>{{ block.rows.length }} filas devueltas por backend.</p>
          </div>

          <div class="table-wrap">
            <table class="admin-table">
              <thead>
                <tr>
                  <th v-for="column in block.columns" :key="column">{{ column }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, index) in block.rows" :key="`${block.key}-${index}`">
                  <td v-for="column in block.columns" :key="`${block.key}-${index}-${column}`">
                    {{ row?.[column] ?? 'Sin dato' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.admin-reports-page {
  min-height: 100vh;
}

.dashboard-hero,
.reports-shell {
  padding: 1.5rem clamp(1.25rem, 5vw, 4.5rem);
}

.dashboard-hero {
  min-height: 32vh;
  display: grid;
  background:
    radial-gradient(circle at top right, rgba(15, 76, 129, 0.12), transparent 20%),
    linear-gradient(180deg, #ffffff 0%, #f4f7fb 100%);
}

.hero-center {
  display: grid;
  place-items: center;
  text-align: center;
  gap: 0.9rem;
}

.hero-center h1,
.section-heading h2 {
  margin: 0;
  letter-spacing: -0.05em;
}

.hero-center h1 {
  max-width: 16ch;
  font-size: clamp(2.3rem, 6vw, 4rem);
  line-height: 0.98;
}

.hero-subtitle,
.section-heading p,
.signal-card p {
  color: #5d5d5d;
  line-height: 1.7;
}

.dark-eyebrow {
  color: #0f4c81;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.status-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
  padding: 0 clamp(1.25rem, 5vw, 4.5rem) 1.2rem;
  margin-top: -1.2rem;
}

.signal-card,
.reports-shell,
.report-card {
  border: 1px solid #ebeff5;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
}

.signal-card {
  display: grid;
  gap: 0.35rem;
  padding: 1rem 1.05rem;
}

.signal-card span {
  color: #64748b;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
}

.signal-card strong {
  font-size: 1.7rem;
}

.reports-shell {
  margin: 0 clamp(1.25rem, 5vw, 4.5rem) 2rem;
  padding: 1.3rem;
}

.reports-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1rem;
}

.ghost-button {
  border: 1px solid #d6dee8;
  border-radius: 999px;
  padding: 0.75rem 1rem;
  background: #fff;
  font: inherit;
  cursor: pointer;
}

.ghost-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-banner {
  margin: 0 0 1rem;
  padding: 0.85rem 1rem;
  border-radius: 12px;
  background: #fff1f2;
  color: #9f1239;
}

.reports-grid {
  display: grid;
  gap: 1rem;
}

.report-card {
  padding: 1rem;
}

.table-wrap {
  overflow: auto;
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
}

.admin-table th,
.admin-table td {
  padding: 0.85rem 0.75rem;
  border-bottom: 1px solid #eef2f7;
  text-align: left;
}

.empty-state {
  padding: 2rem 0;
  text-align: center;
}

@media (max-width: 960px) {
  .status-strip {
    grid-template-columns: 1fr;
  }

  .reports-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
