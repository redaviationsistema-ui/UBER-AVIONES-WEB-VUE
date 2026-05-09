<script setup>
import CrewUiIcon from './CrewUiIcon.vue'

defineProps({
  paymentSummary: { type: Object, required: true },
})

defineEmits(['report-payment'])
</script>

<template>
  <section class="payments-page">
    <div class="page-head surface">
      <div class="hero-copy">
        <div class="title-row">
          <span class="icon-badge"><CrewUiIcon name="payment" :size="20" /></span>
          <div>
            <span class="eyebrow">Pagos</span>
            <h3>Pagos y comisiones</h3>
          </div>
        </div>
        <p class="muted">
          Los pagos solo se generan con reporte final enviado. Si existe una incidencia critica abierta, el pago queda retenido.
        </p>
      </div>
      <span class="badge">{{ paymentSummary.totalMonthly }}</span>
    </div>

    <div class="summary-grid">
      <article class="surface metric-card"><span class="mini-icon"><CrewUiIcon name="service" :size="16" /></span><span>Servicios completados</span><strong>{{ paymentSummary.completedServices }}</strong></article>
      <article class="surface metric-card"><span class="mini-icon"><CrewUiIcon name="payment" :size="16" /></span><span>Bonos</span><strong>{{ paymentSummary.bonuses }}</strong></article>
      <article class="surface metric-card"><span class="mini-icon"><CrewUiIcon name="incident" :size="16" /></span><span>Penalizaciones</span><strong>{{ paymentSummary.penalties }}</strong></article>
      <article class="surface metric-card"><span class="mini-icon"><CrewUiIcon name="bank" :size="16" /></span><span>Total mensual</span><strong>{{ paymentSummary.totalMonthly }}</strong></article>
    </div>

    <section class="surface table-card">
      <div class="payment-list">
        <article v-for="item in paymentSummary.items" :key="item.id" class="payment-row">
          <div>
            <strong>{{ item.flight }} - {{ item.service }}</strong>
            <p>{{ item.payment }} - Bono {{ item.vipBonus }} - Penalizacion {{ item.penalty }}</p>
            <small>{{ item.status }} - {{ item.receipt }}</small>
          </div>
          <div class="action-stack">
            <span class="badge">{{ item.status }}</span>
            <button class="ghost-button action-button" type="button">
              <CrewUiIcon name="report" :size="15" />
              Ver detalle
            </button>
            <button class="ghost-button action-button" type="button">
              <CrewUiIcon name="download" :size="15" />
              Descargar comprobante
            </button>
            <button class="ghost-button action-button" type="button" @click="$emit('report-payment', item.id)">
              <CrewUiIcon name="incident" :size="15" />
              Reportar pago incorrecto
            </button>
          </div>
        </article>
      </div>
    </section>
  </section>
</template>

<style scoped>
.payments-page,
.summary-grid,
.payment-list {
  display: grid;
  gap: 1.5rem;
}

.page-head,
.metric-card,
.table-card {
  padding: 1.4rem;
}

.hero-copy {
  display: grid;
  gap: 0.75rem;
  min-width: 0;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.icon-badge,
.mini-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #0a8f5b;
}

.icon-badge {
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(10, 143, 91, 0.12), rgba(10, 143, 91, 0.04));
}

.page-head,
.payment-row {
  display: flex;
  gap: 1rem;
}

.page-head {
  align-items: end;
  justify-content: space-between;
}

.page-head h3 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.04em;
  font-size: clamp(1.8rem, 4vw, 2.5rem);
}

.summary-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.metric-card span,
.payment-row p,
.payment-row small {
  color: #5d5d5d;
}

.metric-card strong {
  display: block;
  margin-top: 0.35rem;
}

.payment-row {
  align-items: start;
  justify-content: space-between;
  padding: 1.05rem;
  border-radius: 16px;
  background: #faf8f3;
}

.payment-row p,
.payment-row small {
  margin: 0.3rem 0 0;
}

.action-stack {
  display: grid;
  gap: 0.55rem;
  width: min(100%, 240px);
}

.action-button {
  gap: 0.45rem;
}

@media (max-width: 1080px) {
  .summary-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .page-head,
  .payment-row {
    display: grid;
  }

  .title-row {
    align-items: flex-start;
  }

  .page-head,
  .metric-card,
  .table-card {
    padding: 1.05rem;
  }

  .page-head .badge,
  .payment-row,
  .action-stack {
    width: 100%;
  }

  .payment-row {
    gap: 0.8rem;
  }

  .action-stack .action-button {
    justify-content: center;
  }

  .payment-row strong,
  .payment-row p,
  .payment-row small {
    overflow-wrap: anywhere;
  }
}
</style>
