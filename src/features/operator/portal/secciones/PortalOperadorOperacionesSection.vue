<template src="./plantillas/PortalOperadorOperacionesSection.html"></template>

<script>
import { defineComponent } from 'vue'
import { useInjectedOperatorPortalContext } from './useInjectedOperatorPortalContext'

export default defineComponent({
  name: 'PortalOperadorOperacionesSection',
  setup() {
    return useInjectedOperatorPortalContext()
  },
})
</script>
