<template src="./plantillas/PortalOperadorReleaseProviderSection.html"></template>

<script>
import { defineComponent } from 'vue'
import { useInjectedOperatorPortalContext } from './useInjectedOperatorPortalContext'

export default defineComponent({
  name: 'PortalOperadorReleaseProviderSection',
  setup() {
    return useInjectedOperatorPortalContext()
  },
})
</script>
