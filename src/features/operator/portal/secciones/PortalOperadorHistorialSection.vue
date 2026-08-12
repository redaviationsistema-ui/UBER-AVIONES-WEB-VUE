<template src="./plantillas/PortalOperadorHistorialSection.html"></template>

<script>
import { defineComponent } from 'vue'
import { useInjectedOperatorPortalContext } from './useInjectedOperatorPortalContext'

export default defineComponent({
  name: 'PortalOperadorHistorialSection',
  setup() {
    return useInjectedOperatorPortalContext()
  },
})
</script>
