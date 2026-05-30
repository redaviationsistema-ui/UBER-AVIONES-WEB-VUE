<script setup>
import SeccionSolicitudesCliente from './viajes/SeccionSolicitudesCliente.vue'

defineProps({
  requests: { type: Array, required: true },
})

const emit = defineEmits(['open-detail'])
</script>

<template>
  <SeccionSolicitudesCliente v-bind="$props" @open-detail="emit('open-detail', $event)" />
</template>
