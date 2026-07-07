/*----------------------------------------------------------------------------------------------*/
// VISTA DE COMPONENTE PRINCIPAL DEL PORTAL DE OPERADOR
/*----------------------------------------------------------------------------------------------*/    

import { defineComponent } from 'vue'
import OperatorCrewSection from '../secciones/personal/OperatorCrewSection.vue'
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
    OperatorCrewSection,
  },
  props: {
    section: { type: String, required: true },
  },
  setup(props) {
    return useOperatorPortalSetup(props)
  },
})
