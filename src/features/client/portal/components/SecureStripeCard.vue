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
    <div class="secure-card__line">
      <header class="secure-card__header">
        <span class="secure-card__icon" aria-hidden="true">🔒</span>
        <div class="secure-card__copy">
          <strong>Stripe Checkout</strong>
          <span>Pago seguro</span>
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

      <div v-if="contactEmail" class="secure-card__email">
        <div class="secure-card__email-copy">
          <span>Correo</span>
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
  gap: 12px;
  padding: 20px;
  border-radius: 18px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
}

.secure-card__line {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
}

.secure-card__header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  align-items: center;
}

.secure-card__icon {
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 12px;
  background: #173a6a;
  color: #ffffff;
  font-size: 1rem;
}

.secure-card__copy {
  display: grid;
  gap: 2px;
}

.secure-card__copy strong {
  color: #0f172a;
  font-size: 1rem;
}

.secure-card__copy span {
  color: #64748b;
  font-size: 0.8125rem;
  line-height: 1.2;
}

.secure-card__brands {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.secure-card__brand-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 1.25rem;
}

.secure-card__brand-logo svg {
  display: block;
  width: auto;
  height: 100%;
  max-width: 3.5rem;
}

.secure-card__email {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.secure-card__email-copy {
  display: grid;
  gap: 2px;
  color: #64748b;
  font-size: 0.8125rem;
  text-align: right;
}

.secure-card__email strong {
  color: #0f172a;
  font-size: 0.9375rem;
  font-weight: 600;
}

.secure-card__change-link {
  color: #173a6a;
  font-size: 0.875rem;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}

.secure-card__field {
  display: grid;
  gap: 6px;
  padding-top: 12px;
  border-top: 1px solid #e2e8f0;
}

.secure-card__field span {
  color: #64748b;
  font-size: 0.8125rem;
  font-weight: 700;
}

.secure-card__field input {
  width: 100%;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #0f172a;
  font: inherit;
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
}

.secure-card__field input:focus {
  outline: none;
  border-color: rgba(23, 58, 106, 0.35);
  box-shadow: 0 0 0 3px rgba(23, 58, 106, 0.08);
}

@media (max-width: 880px) {
  .secure-card__line {
    grid-template-columns: 1fr;
    align-items: start;
  }

  .secure-card__email-copy {
    text-align: left;
  }
}

@media (max-width: 640px) {
  .secure-card__email {
    display: grid;
    justify-content: start;
  }

  .secure-card__brands {
    flex-wrap: wrap;
  }
}
</style>
