<template src="./plantillas/PortalOperadorBloqueoOperativoSection.html"></template>

<script>
import { defineComponent } from 'vue'
import { useInjectedOperatorPortalContext } from './useInjectedOperatorPortalContext'

export default defineComponent({
  name: 'PortalOperadorBloqueoOperativoSection',
  setup() {
    return useInjectedOperatorPortalContext()
  },
})
</script>
