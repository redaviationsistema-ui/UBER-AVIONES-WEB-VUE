<script setup>
const props = defineProps({
  rows: { type: Array, default: () => [] },
  title: { type: String, default: 'Resumen del pago' },
  supportingCopy: { type: String, default: '' },
})
</script>

<template>
  <article class="payment-summary">
    <header class="payment-summary__header">
      <strong>{{ title }}</strong>
      <p v-if="supportingCopy">{{ supportingCopy }}</p>
    </header>

    <div class="payment-summary__rows">
      <p
        v-for="row in rows"
        :key="row.key"
        :class="{ 'payment-summary__row--total': row.total }"
      >
        <span>{{ row.label }}</span>
        <strong>{{ row.value }}</strong>
      </p>
    </div>
  </article>
</template>

<style scoped>
.payment-summary {
  display: grid;
  gap: 0.95rem;
  height: 100%;
  padding: 1.15rem 1.2rem;
  border: 1px solid rgba(18, 25, 38, 0.08);
  border-radius: 22px;
  background: linear-gradient(180deg, #ffffff 0%, #f9fafc 100%);
  box-shadow: 0 12px 28px rgba(18, 25, 38, 0.06);
}

.payment-summary__header,
.payment-summary__rows {
  display: grid;
  gap: 0.62rem;
}

.payment-summary__header strong {
  color: #101828;
  font-size: 1.02rem;
  line-height: 1.35;
}

.payment-summary__header p {
  margin: 0;
  color: #667085;
  font-size: 0.88rem;
  line-height: 1.45;
}

p {
  margin: 0;
}

.payment-summary__rows p {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: center;
}

.payment-summary__rows p span {
  color: #475467;
  font-size: 0.9rem;
}

.payment-summary__rows p strong {
  color: #101828;
  font-size: 0.98rem;
  font-variant-numeric: tabular-nums;
}

.payment-summary__rows p.payment-summary__row--total {
  margin-top: 0.1rem;
  padding-top: 0.8rem;
  border-top: 1px solid rgba(16, 24, 40, 0.08);
  align-items: end;
}

.payment-summary__rows p.payment-summary__row--total span {
  color: #0f172a;
  font-size: 0.88rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.payment-summary__rows p.payment-summary__row--total strong {
  color: #0f172a;
  font-size: clamp(1.5rem, 2.8vw, 1.9rem);
  line-height: 1;
}
</style>
