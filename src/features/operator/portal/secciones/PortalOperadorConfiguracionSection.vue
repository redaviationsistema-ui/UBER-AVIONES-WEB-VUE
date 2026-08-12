<template src="./plantillas/PortalOperadorConfiguracionSection.html"></template>

<script>
import { defineComponent } from 'vue'
import { useInjectedOperatorPortalContext } from './useInjectedOperatorPortalContext'

export default defineComponent({
  name: 'PortalOperadorConfiguracionSection',
  setup() {
    return useInjectedOperatorPortalContext()
  },
})
</script>
