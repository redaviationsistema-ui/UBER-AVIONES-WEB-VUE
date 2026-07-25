<script setup>
import { computed } from 'vue'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  totalLabel: { type: String, required: true },
})

const totalRow = computed(() => props.rows.find((item) => item?.total) || null)
</script>

<template>
  <article class="payment-summary">
    <header class="payment-summary__header">
      <span class="payment-summary__eyebrow">Resumen del pago</span>
      <strong>Activa tu acceso comercial con el total final antes de ir a Stripe.</strong>
    </header>

    <div class="payment-summary__rows">
      <p v-for="row in rows" :key="row.key" :class="{ 'payment-summary__row--total': row.total }">
        <span>{{ row.label }}</span>
        <strong>{{ row.value }}</strong>
      </p>
    </div>

    <div class="payment-summary__total">
      <span>Total</span>
      <strong>{{ totalRow?.value || totalLabel }}</strong>
    </div>
  </article>
</template>

<style scoped>
.payment-summary {
  display: grid;
  gap: 1rem;
  height: 100%;
  padding: 1.25rem 1.3rem;
  border: 1px solid rgba(18, 25, 38, 0.08);
  border-radius: 24px;
  background: linear-gradient(180deg, #ffffff 0%, #f7f8fb 100%);
  box-shadow: 0 14px 32px rgba(18, 25, 38, 0.06);
}

.payment-summary__header,
.payment-summary__rows {
  display: grid;
  gap: 0.7rem;
}

.payment-summary__eyebrow {
  color: #75819a;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.payment-summary__header strong {
  color: #101828;
  font-size: 1.05rem;
  line-height: 1.4;
}

p {
  margin: 0;
}

.payment-summary__row,
.payment-summary__total {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: center;
}

.payment-summary__rows p span {
  color: #475467;
  font-size: 0.92rem;
}

.payment-summary__rows p strong {
  color: #101828;
  font-size: 1rem;
}

.payment-summary__rows p.payment-summary__row--total {
  padding-top: 0.4rem;
  border-top: 1px solid rgba(16, 24, 40, 0.08);
}

.payment-summary__total {
  padding-top: 0.75rem;
  border-top: 1px solid rgba(16, 24, 40, 0.08);
}

.payment-summary__total span {
  color: #0f172a;
  font-size: 0.92rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.payment-summary__total strong {
  color: #0f172a;
  font-size: clamp(1.55rem, 3vw, 2rem);
  line-height: 1;
}
</style>
