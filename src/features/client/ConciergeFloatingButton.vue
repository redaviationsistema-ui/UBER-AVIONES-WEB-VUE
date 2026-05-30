<script setup>
import BotonFlotanteConcierge from './navegacion/BotonFlotanteConcierge.vue'

const emit = defineEmits(['open'])
</script>

<template>
  <BotonFlotanteConcierge @open="emit('open', $event)" />
</template>
