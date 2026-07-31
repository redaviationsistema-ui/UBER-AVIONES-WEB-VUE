<script setup>
import HeroeBusquedaVuelo from './cotizador/HeroeBusquedaVuelo.vue'

defineProps({
  commercialAccessActionDisabled: { type: Boolean, default: false },
  commercialAccessCtaLabel: { type: String, default: '' },
  commercialAccessNotice: { type: Object, default: () => ({}) },
  form: { type: Object, required: true },
  submitBusy: { type: Boolean, default: false },
  submitLabel: { type: String, default: 'Cotizar vuelo' },
  shouldShowCommercialAccessCta: { type: Boolean, default: false },
  summary: { type: Object, required: true },
  tripType: { type: String, required: true },
})

const emit = defineEmits([
  'add-leg',
  'go-concierge',
  'go-commercial-access-payment',
  'remove-leg',
  'submit',
  'select-form-airport',
  'select-leg-airport',
  'update-form-field',
  'update-leg-field',
  'update-trip-type',
])
</script>

<template>
  <HeroeBusquedaVuelo
    v-bind="$props"
    @add-leg="emit('add-leg', $event)"
    @go-concierge="emit('go-concierge', $event)"
    @go-commercial-access-payment="emit('go-commercial-access-payment', $event)"
    @remove-leg="emit('remove-leg', $event)"
    @submit="emit('submit', $event)"
    @select-form-airport="emit('select-form-airport', $event)"
    @select-leg-airport="emit('select-leg-airport', $event)"
    @update-form-field="emit('update-form-field', $event)"
    @update-leg-field="emit('update-leg-field', $event)"
    @update-trip-type="emit('update-trip-type', $event)"
  />
</template>
