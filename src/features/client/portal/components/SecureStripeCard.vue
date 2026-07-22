<script setup>
defineProps({
  contactEmail: { type: String, default: '' },
})

const brands = [
  'Tarjetas Visa',
  'Mastercard',
  'American Express',
  'Apple Pay',
  'Google Pay',
  'Pago protegido SSL',
  'PCI DSS',
  'Procesado por Stripe',
]
</script>

<template>
  <article class="secure-card">
    <header class="secure-card__header">
      <span class="secure-card__icon" aria-hidden="true">🔒</span>
      <div>
        <span class="secure-card__eyebrow">Card 2</span>
        <h3>Pago seguro con Stripe</h3>
      </div>
    </header>

    <div class="secure-card__badges">
      <span v-for="brand in brands" :key="brand">{{ brand }}</span>
    </div>

    <p class="secure-card__copy">
      Serás redirigido a Stripe para completar el pago de forma segura.
    </p>

    <p v-if="contactEmail" class="secure-card__email">
      Confirmación enviada a <strong>{{ contactEmail }}</strong>
    </p>
  </article>
</template>

<style scoped>
.secure-card {
  display: grid;
  gap: 1rem;
  padding: 1.5rem;
  border-radius: 28px;
  border: 1px solid rgba(18, 25, 38, 0.08);
  background:
    radial-gradient(circle at top right, rgba(37, 99, 235, 0.12), transparent 28%),
    linear-gradient(180deg, #ffffff 0%, #f6f9ff 100%);
  box-shadow: 0 24px 60px rgba(18, 25, 38, 0.08);
}

.secure-card__header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.9rem;
  align-items: center;
}

.secure-card__icon {
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  border-radius: 18px;
  background: #0f2747;
  color: #ffffff;
}

.secure-card__eyebrow {
  color: #75819a;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

h3,
p {
  margin: 0;
}

h3 {
  color: #101828;
  font-size: 1.35rem;
}

.secure-card__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
}

.secure-card__badges span {
  padding: 0.58rem 0.82rem;
  border-radius: 999px;
  background: rgba(15, 39, 71, 0.06);
  color: #0f2747;
  font-size: 0.9rem;
  font-weight: 600;
}

.secure-card__copy {
  color: #344054;
  line-height: 1.65;
}

.secure-card__email {
  color: #667085;
  font-size: 0.92rem;
}

.secure-card__email strong {
  color: #0f172a;
}
</style>
