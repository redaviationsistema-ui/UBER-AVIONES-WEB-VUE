<template src="./plantillas/PortalOperadorDashboardSection.html"></template>

<script>
import { defineComponent } from 'vue'
import { useInjectedOperatorPortalContext } from './useInjectedOperatorPortalContext'

export default defineComponent({
  name: 'PortalOperadorDashboardSection',
  setup() {
    return useInjectedOperatorPortalContext()
  },
})
</script>
