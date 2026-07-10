/*----------------------------------------------------------------------------------------------*/
// VISTA DE COMPONENTE PRINCIPAL DEL PORTAL DE OPERADOR
/*----------------------------------------------------------------------------------------------*/    

import { defineComponent } from 'vue'
import OperatorCrewSection from '../secciones/personal/OperatorCrewSection.vue'
import CompanyCommercialCard from '../validation/CompanyCommercialCard.vue'
import CompanyProfileCard from '../validation/CompanyProfileCard.vue'
import FleetSummary from '../validation/FleetSummary.vue'
import OperatorActivityTimeline from '../validation/OperatorActivityTimeline.vue'
import OperatorDocumentDrawer from '../validation/OperatorDocumentDrawer.vue'
import OperatorDocumentList from '../validation/OperatorDocumentList.vue'
import OperatorReadinessCard from '../validation/OperatorReadinessCard.vue'
import OperatorValidationSummary from '../validation/OperatorValidationSummary.vue'
import {
  findOperatorRequestByIdentifier,
  hasOperatorTrackingActivity,
  matchesOperatorRequestIdentifier,
  normalizeOperatorTrackingStatus,
  parseOperationalDate,
  resolveOperatorRequestQueue,
  shouldKeepOperatorRealtimeRequestVisible,
  shouldShowRealtimeRequestInBanner,
  useOperatorPortalSetup,
} from './portalOperador.configuracion'

export {
  findOperatorRequestByIdentifier,
  hasOperatorTrackingActivity,
  matchesOperatorRequestIdentifier,
  normalizeOperatorTrackingStatus,
  parseOperationalDate,
  resolveOperatorRequestQueue,
  shouldKeepOperatorRealtimeRequestVisible,
  shouldShowRealtimeRequestInBanner,
}

export default defineComponent({
  name: 'PortalOperador',
  components: {
    CompanyCommercialCard,
    CompanyProfileCard,
    FleetSummary,
    OperatorCrewSection,
    OperatorActivityTimeline,
    OperatorDocumentDrawer,
    OperatorDocumentList,
    OperatorReadinessCard,
    OperatorValidationSummary,
  },
  props: {
    section: { type: String, required: true },
  },
  setup(props) {
    return useOperatorPortalSetup(props)
  },
})
