<script setup>
import BarraEstadoMembresia from './membresia/BarraEstadoMembresia.vue'

defineProps({
  activePlan: { type: String, required: true },
})
</script>

<template>
  <BarraEstadoMembresia v-bind="$props" />
</template>
