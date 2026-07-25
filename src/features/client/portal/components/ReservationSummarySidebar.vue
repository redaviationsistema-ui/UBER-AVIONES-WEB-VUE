<script setup>
defineProps({
  customerDisplayName: { type: String, required: true },
  dateLabel: { type: String, required: true },
  durationLabel: { type: String, required: true },
  flightTypeLabel: { type: String, required: true },
  routeLabel: { type: String, required: true },
  totalLabel: { type: String, required: true },
})
</script>

<template>
  <aside class="reservation-sidebar">
    <header class="reservation-sidebar__header">
      <div>
        <span class="reservation-sidebar__eyebrow">Resumen de la reserva</span>
        <h3>{{ customerDisplayName }}</h3>
      </div>
    </header>

    <div class="reservation-sidebar__hero">
      <div>
        <strong>{{ routeLabel }}</strong>
      </div>
    </div>

    <div class="reservation-sidebar__meta">
      <p><span>Fecha</span><strong>{{ dateLabel }}</strong></p>
      <p><span>Tipo de vuelo</span><strong>{{ flightTypeLabel }}</strong></p>
      <p><span>Duración</span><strong>{{ durationLabel }}</strong></p>
    </div>

    <div class="reservation-sidebar__totals">
      <p class="reservation-sidebar__total">
        <span>Total</span>
        <strong>{{ totalLabel }}</strong>
      </p>
    </div>

    <p class="reservation-sidebar__note">
      El total final se confirma en Stripe antes de autorizar el cobro.
    </p>
  </aside>
</template>

<style scoped>
.reservation-sidebar {
  position: sticky;
  top: 6rem;
  display: grid;
  gap: 1rem;
  padding: 1.2rem;
  border: 1px solid rgba(18, 25, 38, 0.08);
  border-radius: 24px;
  background:
    radial-gradient(circle at top right, rgba(200, 212, 255, 0.55), transparent 28%),
    linear-gradient(180deg, #ffffff 0%, #f8f9fc 100%);
  box-shadow: 0 18px 44px rgba(18, 25, 38, 0.08);
}

.reservation-sidebar__header,
.reservation-sidebar__hero,
.reservation-sidebar__totals,
.reservation-sidebar__meta {
  display: grid;
  gap: 0.85rem;
}

.reservation-sidebar__header {
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
.reservation-sidebar__totals p,
.reservation-sidebar__note {
  margin: 0;
}

.reservation-sidebar__header h3 {
  color: #101828;
  font-size: 1.2rem;
}

.reservation-sidebar__hero {
  padding: 0.95rem 1rem;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.75);
}

.reservation-sidebar__hero strong {
  color: #101828;
  font-size: 1.05rem;
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
  font-variant-numeric: tabular-nums;
}

.reservation-sidebar__totals {
  padding-top: 0.85rem;
  border-top: 1px solid rgba(16, 24, 40, 0.08);
}

.reservation-sidebar__total {
  align-items: end;
}

.reservation-sidebar__total span {
  color: #0f172a;
  font-size: 0.82rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.reservation-sidebar__total strong {
  font-size: 1.55rem;
}

.reservation-sidebar__note {
  color: #667085;
  font-size: 0.85rem;
  line-height: 1.45;
}

@media (max-width: 960px) {
  .reservation-sidebar {
    position: static;
  }
}
</style>
