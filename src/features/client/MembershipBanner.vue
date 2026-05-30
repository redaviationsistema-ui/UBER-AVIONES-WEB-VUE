<script setup>
import BannerMembresia from './membresia/BannerMembresia.vue'

defineProps({
  quotesRemaining: { type: Number, required: true },
})
</script>

<template>
  <BannerMembresia v-bind="$props" />
</template>
