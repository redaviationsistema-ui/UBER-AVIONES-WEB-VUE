<script setup>
import { defineAsyncComponent } from 'vue'

const VistaContratoCliente = defineAsyncComponent(() => import('./viajes/VistaContratoCliente.vue'))

defineProps({
  reservation: { type: Object, default: null },
  reservationId: { type: [String, Number], default: '' },
  customerName: { type: String, default: '' },
  submitting: { type: Boolean, default: false },
  readOnly: { type: Boolean, default: false },
})

const emit = defineEmits(['confirm'])
</script>

<template>
  <VistaContratoCliente v-bind="$props" @confirm="emit('confirm', $event)" />
</template>
