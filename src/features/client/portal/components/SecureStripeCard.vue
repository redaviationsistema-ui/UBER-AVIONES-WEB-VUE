<script setup>
import {
  siAmericanexpress,
  siApplepay,
  siGooglepay,
  siMastercard,
  siVisa,
} from 'simple-icons'

defineProps({
  contactEmail: { type: String, default: '' },
})

const cardBrands = [
  siVisa,
  siMastercard,
  siAmericanexpress,
  siApplepay,
  siGooglepay,
].map((icon) => ({
  title: icon.title,
  path: icon.path,
  color: `#${icon.hex}`,
}))
</script>

<template>
  <article class="secure-card">
    <header class="secure-card__header">
      <span class="secure-card__icon" aria-hidden="true">🔒</span>
      <div class="secure-card__copy">
        <strong>Pago procesado por Stripe Checkout</strong>
        <span>Tu información financiera está protegida y cifrada de extremo a extremo.</span>
      </div>
    </header>

    <div class="secure-card__brands" aria-label="Métodos aceptados">
      <span
        v-for="brand in cardBrands"
        :key="brand.title"
        class="secure-card__brand-logo"
        :aria-label="brand.title"
        :title="brand.title"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path :d="brand.path" :fill="brand.color" />
        </svg>
      </span>
    </div>

    <p class="secure-card__legend">
      Stripe Checkout valida el método de pago y confirma la activación segura de tu acceso comercial.
    </p>

    <div v-if="contactEmail" class="secure-card__email">
      <span>Correo actual</span>
      <strong>{{ contactEmail }}</strong>
    </div>
  </article>
</template>

<style scoped>
.secure-card {
  display: grid;
  gap: 1rem;
  height: 100%;
  padding: 1.25rem 1.3rem;
  border-radius: 24px;
  border: 1px solid rgba(18, 25, 38, 0.08);
  background:
    radial-gradient(circle at top right, rgba(37, 99, 235, 0.12), transparent 28%),
    linear-gradient(180deg, #ffffff 0%, #f6f9ff 100%);
  box-shadow: 0 14px 32px rgba(18, 25, 38, 0.06);
}

.secure-card__header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.95rem;
  align-items: start;
}

.secure-card__icon {
  display: grid;
  place-items: center;
  width: 2.9rem;
  height: 2.9rem;
  border-radius: 18px;
  background: #0f2747;
  color: #ffffff;
  font-size: 1.1rem;
}

p {
  margin: 0;
}

.secure-card__copy {
  display: grid;
  gap: 0.25rem;
}

.secure-card__copy strong {
  color: #101828;
  font-size: 1.05rem;
}

.secure-card__copy span {
  color: #475467;
  font-size: 0.92rem;
  line-height: 1.5;
}

.secure-card__brands {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
}

.secure-card__brand-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 1.75rem;
}

.secure-card__brand-logo svg {
  display: block;
  width: auto;
  height: 100%;
  max-width: 4.4rem;
}

.secure-card__legend {
  color: #475467;
  font-size: 0.92rem;
  line-height: 1.6;
}

.secure-card__email {
  display: grid;
  gap: 0.18rem;
  margin-top: auto;
  padding-top: 1rem;
  border-top: 1px solid rgba(16, 24, 40, 0.08);
  color: #667085;
  font-size: 0.82rem;
}

.secure-card__email strong {
  color: #0f172a;
  font-size: 1rem;
}
</style>
