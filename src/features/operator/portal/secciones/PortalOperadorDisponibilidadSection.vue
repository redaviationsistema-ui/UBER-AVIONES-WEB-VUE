<template src="./plantillas/PortalOperadorDisponibilidadSection.html"></template>

<script>
import { defineComponent } from 'vue'
import { useInjectedOperatorPortalContext } from './useInjectedOperatorPortalContext'

export default defineComponent({
  name: 'PortalOperadorDisponibilidadSection',
  setup() {
    return useInjectedOperatorPortalContext()
  },
})
</script>
