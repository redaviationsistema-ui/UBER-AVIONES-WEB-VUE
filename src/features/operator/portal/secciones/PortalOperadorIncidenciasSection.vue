<template src="./plantillas/PortalOperadorIncidenciasSection.html"></template>

<script>
import { defineComponent } from 'vue'
import { useInjectedOperatorPortalContext } from './useInjectedOperatorPortalContext'

export default defineComponent({
  name: 'PortalOperadorIncidenciasSection',
  setup() {
    return useInjectedOperatorPortalContext()
  },
})
</script>
