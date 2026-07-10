<script setup>
defineProps({
  title: { type: String, default: 'Flota registrada' },
  eyebrow: { type: String, default: 'Flota' },
  fleet: { type: Object, default: () => ({ count: 0, emptyLabel: '', items: [] }) },
})
</script>

<template>
  <section class="fleet-summary-card">
    <header class="fleet-summary-card__head">
      <div>
        <p class="fleet-summary-card__eyebrow">{{ eyebrow }}</p>
        <h3>{{ title }}</h3>
      </div>
      <span class="fleet-summary-card__count">{{ fleet.count || 0 }}</span>
    </header>

    <div v-if="fleet.items?.length" class="fleet-summary-card__list">
      <article v-for="item in fleet.items" :key="item.id" class="fleet-summary-card__item">
        <strong>{{ item.label }}</strong>
        <span>{{ item.detail || 'Sin detalle adicional' }}</span>
      </article>
    </div>

    <p v-else class="fleet-summary-card__empty">
      {{ fleet.emptyLabel || 'No existen aeronaves registradas' }}
    </p>
  </section>
</template>

<style scoped>
.fleet-summary-card {
  display: grid;
  gap: 18px;
  padding: 22px;
  border-radius: 24px;
  border: 1px solid rgba(21, 50, 77, 0.08);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 246, 241, 0.96));
}

.fleet-summary-card__head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
}

.fleet-summary-card__eyebrow {
  margin: 0 0 6px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.78rem;
  font-weight: 700;
  color: #5f87c7;
}

.fleet-summary-card__head h3 {
  margin: 0;
  color: #15324d;
}

.fleet-summary-card__count {
  min-width: 44px;
  min-height: 44px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: #edf3fb;
  color: #2d6ab1;
  font-weight: 800;
}

.fleet-summary-card__list {
  display: grid;
  gap: 10px;
}

.fleet-summary-card__item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(21, 50, 77, 0.08);
}

.fleet-summary-card__item strong {
  color: #15324d;
}

.fleet-summary-card__item span,
.fleet-summary-card__empty {
  color: #6f8096;
}

@media (max-width: 900px) {
  .fleet-summary-card__item {
    flex-direction: column;
  }
}
</style>
