<template src="./plantillas/PortalOperadorAeronavesSection.html"></template>

<script>
import { defineComponent } from 'vue'
import PortalOperadorAeronavesWizardOverlay from './PortalOperadorAeronavesWizardOverlay.vue'
import { useInjectedOperatorPortalContext } from './useInjectedOperatorPortalContext'

export default defineComponent({
  name: 'PortalOperadorAeronavesSection',
  components: {
    PortalOperadorAeronavesWizardOverlay,
  },
  setup() {
    return useInjectedOperatorPortalContext()
  },
})
</script>
