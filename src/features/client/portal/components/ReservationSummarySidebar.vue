<script setup>
defineProps({
  customerDisplayName: { type: String, required: true },
  dateLabel: { type: String, required: true },
  durationLabel: { type: String, required: true },
  flightTypeLabel: { type: String, required: true },
  routeLabel: { type: String, required: true },
  rows: { type: Array, default: () => [] },
})
</script>

<template>
  <aside class="reservation-sidebar">
    <header class="reservation-sidebar__header">
      <div>
        <span class="reservation-sidebar__eyebrow">Resumen de reserva</span>
        <h3>{{ customerDisplayName }}</h3>
      </div>
      <button type="button" class="reservation-sidebar__print" aria-label="Imprimir resumen">
        🖨
      </button>
    </header>

    <div class="reservation-sidebar__hero">
      <span class="reservation-sidebar__avatar" aria-hidden="true">
        {{ customerDisplayName.trim().charAt(0) || 'J' }}
      </span>
      <div>
        <strong>{{ customerDisplayName }}</strong>
        <p>{{ routeLabel }}</p>
      </div>
    </div>

    <div class="reservation-sidebar__meta">
      <p><span>Fecha</span><strong>{{ dateLabel }}</strong></p>
      <p><span>Tipo de vuelo</span><strong>{{ flightTypeLabel }}</strong></p>
      <p><span>Duración</span><strong>{{ durationLabel }}</strong></p>
    </div>

    <div class="reservation-sidebar__totals">
      <p v-for="row in rows" :key="row.key" :class="{ 'reservation-sidebar__total': row.total }">
        <span>{{ row.label }}</span>
        <strong>{{ row.value }}</strong>
      </p>
    </div>

    <footer class="reservation-sidebar__footer">
      <span>Procesado por Stripe</span>
      <span>SSL</span>
      <span>PCI DSS</span>
      <span>Pago seguro</span>
    </footer>
  </aside>
</template>

<style scoped>
.reservation-sidebar {
  position: sticky;
  top: 6rem;
  display: grid;
  gap: 1.1rem;
  padding: 1.35rem;
  border: 1px solid rgba(18, 25, 38, 0.08);
  border-radius: 28px;
  background:
    radial-gradient(circle at top right, rgba(200, 212, 255, 0.55), transparent 28%),
    linear-gradient(180deg, #ffffff 0%, #f8f9fc 100%);
  box-shadow: 0 28px 64px rgba(18, 25, 38, 0.1);
}

.reservation-sidebar__header,
.reservation-sidebar__hero,
.reservation-sidebar__totals,
.reservation-sidebar__meta {
  display: grid;
  gap: 0.85rem;
}

.reservation-sidebar__header {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
}

.reservation-sidebar__eyebrow {
  color: #75819a;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.reservation-sidebar__header h3,
.reservation-sidebar__hero p,
.reservation-sidebar__hero strong,
.reservation-sidebar__meta p,
.reservation-sidebar__totals p {
  margin: 0;
}

.reservation-sidebar__header h3 {
  color: #101828;
  font-size: 1.45rem;
}

.reservation-sidebar__print {
  width: 2.75rem;
  height: 2.75rem;
  border: 1px solid rgba(16, 24, 40, 0.08);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
}

.reservation-sidebar__hero {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  padding: 1rem;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.75);
}

.reservation-sidebar__avatar {
  display: grid;
  place-items: center;
  width: 3.2rem;
  height: 3.2rem;
  border-radius: 999px;
  background: linear-gradient(135deg, #d8b45d 0%, #b6892e 100%);
  color: #ffffff;
  font-weight: 800;
}

.reservation-sidebar__hero strong {
  color: #101828;
}

.reservation-sidebar__hero p,
.reservation-sidebar__meta span {
  color: #667085;
}

.reservation-sidebar__meta p,
.reservation-sidebar__totals p {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: center;
}

.reservation-sidebar__meta strong,
.reservation-sidebar__totals strong {
  color: #101828;
  text-align: right;
}

.reservation-sidebar__totals {
  padding-top: 0.8rem;
  border-top: 1px solid rgba(16, 24, 40, 0.08);
}

.reservation-sidebar__total {
  padding-top: 0.6rem;
  border-top: 1px solid rgba(16, 24, 40, 0.08);
}

.reservation-sidebar__total strong {
  font-size: 1.5rem;
}

.reservation-sidebar__footer {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.reservation-sidebar__footer span {
  padding: 0.42rem 0.72rem;
  border-radius: 999px;
  background: rgba(15, 39, 71, 0.06);
  color: #0f2747;
  font-size: 0.8rem;
  font-weight: 700;
}

@media (max-width: 960px) {
  .reservation-sidebar {
    position: static;
  }
}
</style>
