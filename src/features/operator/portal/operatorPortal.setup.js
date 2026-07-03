/*----------------------------------------------------------------------------------------------*/
/// VISTA DE CONFIGURACION DEL PORTAL DE OPERADOR
/*----------------------------------------------------------------------------------------------*/

export {
  findOperatorRequestByIdentifier,
  hasOperatorTrackingActivity,
  matchesOperatorRequestIdentifier,
  normalizeOperatorTrackingStatus,
  parseOperationalDate,
  resolveOperatorRequestQueue,
  shouldShowRealtimeRequestInBanner,
  useOperatorPortalSetup,
} from './operatorPortal.core.setup'

export { shouldKeepOperatorRealtimeRequestVisible } from './operatorPortal.requestUtils'
