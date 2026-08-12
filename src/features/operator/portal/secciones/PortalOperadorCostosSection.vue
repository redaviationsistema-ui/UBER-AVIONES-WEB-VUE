<template src="./plantillas/PortalOperadorCostosSection.html"></template>

<script>
import { defineComponent } from 'vue'
import { useInjectedOperatorPortalContext } from './useInjectedOperatorPortalContext'

export default defineComponent({
  name: 'PortalOperadorCostosSection',
  setup() {
    return useInjectedOperatorPortalContext()
  },
})
</script>
