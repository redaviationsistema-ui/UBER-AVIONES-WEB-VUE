<template src="./plantillas/PortalOperadorPagosSection.html"></template>

<script>
import { defineComponent } from 'vue'
import { useInjectedOperatorPortalContext } from './useInjectedOperatorPortalContext'

export default defineComponent({
  name: 'PortalOperadorPagosSection',
  setup() {
    return useInjectedOperatorPortalContext()
  },
})
</script>
