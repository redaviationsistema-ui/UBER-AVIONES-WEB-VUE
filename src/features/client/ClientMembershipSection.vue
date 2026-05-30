<script setup>
import SeccionMembresiaCliente from './membresia/SeccionMembresiaCliente.vue'

defineProps({
  membership: { type: Object, default: null },
  hasMembership: { type: Boolean, default: false },
})

const emit = defineEmits(['go-section'])
</script>

<template>
  <SeccionMembresiaCliente v-bind="$props" @go-section="emit('go-section', $event)" />
</template>
