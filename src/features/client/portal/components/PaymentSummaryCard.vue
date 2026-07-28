<script setup>
import { computed } from 'vue'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  title: { type: String, default: 'Resumen del pago' },
  supportingCopy: { type: String, default: '' },
})

const totalRow = computed(() => props.rows.find((row) => row.total) || null)
const detailRows = computed(() => props.rows.filter((row) => !row.total))
</script>

<template>
  <article class="payment-summary">
    <header class="payment-summary__header">
      <span>{{ title }}</span>
      <p v-if="supportingCopy">{{ supportingCopy }}</p>
    </header>

    <div class="payment-summary__body">
      <div class="payment-summary__rows">
        <p
          v-for="row in detailRows"
          :key="row.key"
        >
          <span>{{ row.label }}</span>
          <strong>{{ row.value }}</strong>
        </p>
      </div>

      <div v-if="totalRow" class="payment-summary__total">
        <span>{{ totalRow.label }}</span>
        <strong>{{ totalRow.value }}</strong>
      </div>
    </div>
  </article>
</template>

<style scoped>
.payment-summary {
  display: grid;
  gap: 16px;
  padding: 20px;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  background: #ffffff;
}

.payment-summary__header {
  display: grid;
  gap: 6px;
}

.payment-summary__header span {
  color: #0f172a;
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.payment-summary__header p {
  margin: 0;
  color: #64748b;
  font-size: 0.875rem;
  line-height: 1.35;
}

.payment-summary__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 20px;
  align-items: end;
}

.payment-summary__rows {
  display: grid;
  gap: 10px;
}

.payment-summary__rows p,
.payment-summary__total {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
  margin: 0;
}

.payment-summary__rows p span {
  color: #64748b;
  font-size: 0.9375rem;
}

.payment-summary__rows p strong {
  color: #0f172a;
  font-size: 0.9375rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.payment-summary__total {
  min-width: 220px;
  padding-left: 20px;
  border-left: 1px solid #e2e8f0;
  align-items: end;
}

.payment-summary__total span {
  color: #0f172a;
  font-size: 0.8125rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.payment-summary__total strong {
  color: #0f172a;
  font-size: clamp(2rem, 4vw, 2.5rem);
  font-weight: 700;
  line-height: 1;
}

@media (max-width: 720px) {
  .payment-summary__body {
    grid-template-columns: 1fr;
  }

  .payment-summary__total {
    min-width: 0;
    padding-top: 14px;
    padding-left: 0;
    border-left: 0;
    border-top: 1px solid #e2e8f0;
  }
}
</style>
