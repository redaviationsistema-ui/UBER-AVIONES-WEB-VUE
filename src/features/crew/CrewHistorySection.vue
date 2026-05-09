<script setup>
import CrewUiIcon from './CrewUiIcon.vue'

defineProps({
  historySummary: { type: Object, required: true },
  historyEntries: { type: Array, required: true },
})
</script>

<template>
  <section class="surface history-page">
    <div class="page-head">
      <div class="title-row">
        <span class="icon-badge"><CrewUiIcon name="history" :size="20" /></span>
        <div>
          <span class="eyebrow">Historial</span>
          <h3>Historial operativo</h3>
        </div>
      </div>
      <p class="muted">Se genera automaticamente por sistema. El sobrecargo puede leerlo, pero no editarlo ni eliminarlo.</p>
    </div>

    <div class="summary-grid">
      <article class="metric-card"><span class="mini-icon"><CrewUiIcon name="flight" :size="16" /></span><span>Vuelos completados</span><strong>{{ historySummary.completedFlights }}</strong></article>
      <article class="metric-card"><span class="mini-icon"><CrewUiIcon name="time" :size="16" /></span><span>Horas trabajadas</span><strong>{{ historySummary.hoursWorked }}</strong></article>
      <article class="metric-card"><span class="mini-icon"><CrewUiIcon name="service" :size="16" /></span><span>Rating</span><strong>{{ historySummary.rating }}</strong></article>
      <article class="metric-card"><span class="mini-icon"><CrewUiIcon name="incident" :size="16" /></span><span>Incidencias</span><strong>{{ historySummary.incidents }}</strong></article>
      <article class="metric-card"><span class="mini-icon"><CrewUiIcon name="report" :size="16" /></span><span>Reportes enviados</span><strong>{{ historySummary.reportsSent }}</strong></article>
      <article class="metric-card"><span class="mini-icon"><CrewUiIcon name="payment" :size="16" /></span><span>Pagos generados</span><strong>{{ historySummary.generatedPayments }}</strong></article>
    </div>

    <div class="history-list">
      <article v-for="item in historyEntries" :key="item.id" class="history-row">
        <strong>{{ item.flight }}</strong>
        <span>{{ item.action }}</span>
        <span>{{ item.status }}</span>
        <small>{{ item.date }} - {{ item.comment }}</small>
      </article>
    </div>
  </section>
</template>

<style scoped>
.history-page {
  padding: 1.4rem;
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

.page-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
}

.page-head h3 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.04em;
  font-size: clamp(1.8rem, 4vw, 2.5rem);
}

.page-head .muted {
  max-width: 520px;
  margin: 0;
  text-align: right;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
  margin: 1.25rem 0;
}

.metric-card {
  display: grid;
  gap: 0.35rem;
  padding: 1.05rem;
  border-radius: 16px;
  background: #faf8f3;
}

.metric-card span,
.history-row span,
.history-row small {
  color: #5d5d5d;
}

.history-list {
  display: grid;
  gap: 0.7rem;
}

.history-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto 1.2fr;
  gap: 0.8rem;
  padding: 1rem;
  border-radius: 14px;
  background: #faf8f3;
}

@media (max-width: 1080px) {
  .summary-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .page-head,
  .history-row {
    display: grid;
  }

  .title-row {
    align-items: flex-start;
  }

  .page-head .muted {
    max-width: none;
    text-align: left;
  }

  .history-page {
    padding: 1.05rem;
  }

  .history-row {
    grid-template-columns: 1fr;
    gap: 0.35rem;
  }

  .history-row strong,
  .history-row span,
  .history-row small {
    overflow-wrap: anywhere;
  }
}
</style>
