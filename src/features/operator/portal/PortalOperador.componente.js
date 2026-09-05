/*----------------------------------------------------------------------------------------------*/
// VISTA DE COMPONENTE PRINCIPAL DEL PORTAL DE OPERADOR
/*----------------------------------------------------------------------------------------------*/    

import { defineComponent, provide } from 'vue'
import PortalOperadorAlertas from './secciones/PortalOperadorAlertas.vue'
import PortalOperadorAeronavesSection from './secciones/PortalOperadorAeronavesSection.vue'
import PortalOperadorConfiguracionSection from './secciones/PortalOperadorConfiguracionSection.vue'
import PortalOperadorBloqueoOperativoSection from './secciones/PortalOperadorBloqueoOperativoSection.vue'
import PortalOperadorCostosSection from './secciones/PortalOperadorCostosSection.vue'
import PortalOperadorDashboardSection from './secciones/PortalOperadorDashboardSection.vue'
import PortalOperadorDisponibilidadSection from './secciones/PortalOperadorDisponibilidadSection.vue'
import PortalOperadorEmpresaSection from './secciones/PortalOperadorEmpresaSection.vue'
import PortalOperadorHistorialSection from './secciones/PortalOperadorHistorialSection.vue'
import PortalOperadorIncidenciasSection from './secciones/PortalOperadorIncidenciasSection.vue'
import PortalOperadorOperacionesSection from './secciones/PortalOperadorOperacionesSection.vue'
import PortalOperadorPagosSection from './secciones/PortalOperadorPagosSection.vue'
import PortalOperadorReleaseProviderSection from './secciones/PortalOperadorReleaseProviderSection.vue'
import PortalOperadorSolicitudesSection from './secciones/PortalOperadorSolicitudesSection.vue'
import PortalOperadorTripulacionSection from './secciones/PortalOperadorTripulacionSection.vue'
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
    PortalOperadorAlertas,
    PortalOperadorAeronavesSection,
    PortalOperadorBloqueoOperativoSection,
    PortalOperadorConfiguracionSection,
    PortalOperadorCostosSection,
    PortalOperadorDashboardSection,
    PortalOperadorDisponibilidadSection,
    PortalOperadorEmpresaSection,
    PortalOperadorHistorialSection,
    PortalOperadorIncidenciasSection,
    PortalOperadorOperacionesSection,
    PortalOperadorPagosSection,
    PortalOperadorReleaseProviderSection,
    PortalOperadorSolicitudesSection,
    PortalOperadorTripulacionSection,
  },
  props: {
    section: { type: String, required: true },
  },
  setup(props) {
    const portal = useOperatorPortalSetup(props)

    provide('operatorPortalContext', portal)

    return portal
  },
})
