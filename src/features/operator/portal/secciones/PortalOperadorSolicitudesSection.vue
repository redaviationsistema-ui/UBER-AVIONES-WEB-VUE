<template src="./plantillas/PortalOperadorSolicitudesSection.html"></template>

<script>
import { defineComponent } from 'vue'
import { useInjectedOperatorPortalContext } from './useInjectedOperatorPortalContext'

export default defineComponent({
  name: 'PortalOperadorSolicitudesSection',
  setup() {
    return useInjectedOperatorPortalContext()
  },
})
</script>
