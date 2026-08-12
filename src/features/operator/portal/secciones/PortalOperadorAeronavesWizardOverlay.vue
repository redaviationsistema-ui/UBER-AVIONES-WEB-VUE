<template src="./plantillas/PortalOperadorAeronavesWizardOverlay.html"></template>

<script>
import { defineComponent } from 'vue'
import { useInjectedOperatorPortalContext } from './useInjectedOperatorPortalContext'

export default defineComponent({
  name: 'PortalOperadorAeronavesWizardOverlay',
  setup() {
    return useInjectedOperatorPortalContext()
  },
})
</script>
