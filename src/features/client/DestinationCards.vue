<script setup>
import TarjetasDestino from './cotizador/TarjetasDestino.vue'

defineProps({
  destinations: { type: Array, required: true },
  tripType: { type: String, required: true },
})

const emit = defineEmits(['select'])
</script>

<template>
  <TarjetasDestino v-bind="$props" @select="emit('select', $event)" />
</template>
