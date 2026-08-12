<template src="./plantillas/PortalOperadorEmpresaSection.html"></template>

<script>
import { defineComponent } from 'vue'
import CompanyCommercialCard from '../../validation/CompanyCommercialCard.vue'
import CompanyProfileCard from '../../validation/CompanyProfileCard.vue'
import FleetSummary from '../../validation/FleetSummary.vue'
import OperatorActivityTimeline from '../../validation/OperatorActivityTimeline.vue'
import OperatorDocumentDrawer from '../../validation/OperatorDocumentDrawer.vue'
import OperatorDocumentList from '../../validation/OperatorDocumentList.vue'
import OperatorReadinessCard from '../../validation/OperatorReadinessCard.vue'
import OperatorValidationSummary from '../../validation/OperatorValidationSummary.vue'
import { useInjectedOperatorPortalContext } from './useInjectedOperatorPortalContext'

export default defineComponent({
  name: 'PortalOperadorEmpresaSection',
  components: {
    CompanyCommercialCard,
    CompanyProfileCard,
    FleetSummary,
    OperatorActivityTimeline,
    OperatorDocumentDrawer,
    OperatorDocumentList,
    OperatorReadinessCard,
    OperatorValidationSummary,
  },
  setup() {
    return useInjectedOperatorPortalContext()
  },
})
</script>
