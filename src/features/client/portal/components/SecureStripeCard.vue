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
  editable: { type: Boolean, default: false },
  changeHref: { type: String, default: '' },
  inputValue: { type: String, default: '' },
  showChangeAction: { type: Boolean, default: false },
})

defineEmits(['update:contact-email'])

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
    <div class="secure-card__topline">
      <header class="secure-card__header">
        <span class="secure-card__icon" aria-hidden="true">🔒</span>
        <div class="secure-card__copy">
          <strong>Pago seguro con Stripe Checkout</strong>
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
    </div>

    <div v-if="contactEmail" class="secure-card__email">
      <div class="secure-card__email-copy">
        <span>Confirmación</span>
        <strong>{{ contactEmail }}</strong>
      </div>
      <a
        v-if="showChangeAction && changeHref"
        :href="changeHref"
        class="secure-card__change-link"
      >
        Cambiar
      </a>
    </div>

    <label v-if="editable" class="secure-card__field">
      <span>Correo de confirmación</span>
      <input
        :value="inputValue"
        type="email"
        placeholder="cliente@empresa.com"
        @input="$emit('update:contact-email', $event.target.value)"
      />
    </label>
  </article>
</template>

<style scoped>
.secure-card {
  display: grid;
  gap: 0.9rem;
  height: 100%;
  padding: 1rem 1.15rem;
  border-radius: 22px;
  border: 1px solid rgba(18, 25, 38, 0.08);
  background:
    radial-gradient(circle at top right, rgba(37, 99, 235, 0.12), transparent 28%),
    linear-gradient(180deg, #ffffff 0%, #f6f9ff 100%);
  box-shadow: 0 12px 28px rgba(18, 25, 38, 0.06);
}

.secure-card__topline {
  display: grid;
  gap: 0.8rem;
}

.secure-card__header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.8rem;
  align-items: center;
}

.secure-card__icon {
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 14px;
  background: #0f2747;
  color: #ffffff;
  font-size: 1rem;
}

.secure-card__copy {
  display: grid;
  gap: 0.2rem;
}

.secure-card__copy strong {
  color: #101828;
  font-size: 0.98rem;
}

.secure-card__copy span {
  color: #475467;
  font-size: 0.86rem;
  line-height: 1.4;
}

.secure-card__brands {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.85rem;
}

.secure-card__brand-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 1.4rem;
}

.secure-card__brand-logo svg {
  display: block;
  width: auto;
  height: 100%;
  max-width: 4rem;
}

.secure-card__email {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem;
  padding-top: 0.9rem;
  border-top: 1px solid rgba(16, 24, 40, 0.08);
}

.secure-card__email-copy {
  display: grid;
  gap: 0.1rem;
  color: #667085;
  font-size: 0.8rem;
}

.secure-card__email strong {
  color: #0f172a;
  font-size: 0.98rem;
}

.secure-card__change-link {
  color: #163a63;
  font-size: 0.85rem;
  font-weight: 700;
  text-decoration: none;
}

.secure-card__field {
  display: grid;
  gap: 0.4rem;
}

.secure-card__field span {
  color: #667085;
  font-size: 0.78rem;
  font-weight: 700;
}

.secure-card__field input {
  width: 100%;
  padding: 0.78rem 0.9rem;
  border-radius: 14px;
  border: 1px solid rgba(15, 23, 42, 0.1);
  background: rgba(248, 250, 252, 0.92);
  color: #0f172a;
  font: inherit;
}

@media (max-width: 640px) {
  .secure-card__email {
    display: grid;
    justify-content: start;
  }
}
</style>
