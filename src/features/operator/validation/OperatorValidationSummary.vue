<script setup>
defineProps({
  summary: { type: Array, default: () => [] },
  title: { type: String, default: 'Resumen de validacion' },
  badgeLabel: { type: String, default: '' },
})
</script>

<template>
  <section class="operator-validation-summary">
    <header class="operator-validation-summary__head">
      <div>
        <p class="operator-validation-summary__eyebrow">Validacion</p>
        <h3>{{ title }}</h3>
      </div>
      <span v-if="badgeLabel" class="operator-validation-summary__badge">{{ badgeLabel }}</span>
    </header>

    <div class="operator-validation-summary__grid">
      <article v-for="item in summary" :key="item.label" class="operator-validation-summary__row" :data-tone="item.tone || 'neutral'">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
      </article>
      <p v-if="!summary.length" class="operator-validation-summary__empty">
        El backend aun no devolvio resumen de validacion para este expediente.
      </p>
    </div>
  </section>
</template>

<style scoped>
.operator-validation-summary {
  display: grid;
  gap: 18px;
  padding: 22px;
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 246, 241, 0.96));
  border: 1px solid rgba(21, 50, 77, 0.08);
}

.operator-validation-summary__head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
}

.operator-validation-summary__eyebrow {
  margin: 0 0 6px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.78rem;
  font-weight: 700;
  color: #eda83a;
}

.operator-validation-summary__head h3 {
  margin: 0;
  color: #15324d;
}

.operator-validation-summary__badge {
  padding: 8px 12px;
  border-radius: 999px;
  background: #fff4df;
  color: #de9b29;
  font-weight: 700;
}

.operator-validation-summary__grid {
  display: grid;
  gap: 12px;
}

.operator-validation-summary__row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid rgba(21, 50, 77, 0.08);
}

.operator-validation-summary__row span {
  color: #6f8096;
}

.operator-validation-summary__row strong {
  color: #15324d;
  text-align: right;
}

.operator-validation-summary__empty {
  margin: 0;
  color: #6f8096;
}
</style>
