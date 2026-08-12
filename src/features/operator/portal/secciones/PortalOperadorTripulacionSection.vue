<template src="./plantillas/PortalOperadorTripulacionSection.html"></template>

<script>
import { defineComponent } from 'vue'
import OperatorCrewSection from '../../secciones/personal/OperatorCrewSection.vue'
import { useInjectedOperatorPortalContext } from './useInjectedOperatorPortalContext'

export default defineComponent({
  name: 'PortalOperadorTripulacionSection',
  components: {
    OperatorCrewSection,
  },
  setup() {
    return useInjectedOperatorPortalContext()
  },
})
</script>
