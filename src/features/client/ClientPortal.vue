<script setup>
import PortalClienteVista from './portal/PortalClienteVista.vue'

defineProps({
  section: { type: String, required: true },
})
</script>

<template>
  <PortalClienteVista v-bind="$props" />
</template>
