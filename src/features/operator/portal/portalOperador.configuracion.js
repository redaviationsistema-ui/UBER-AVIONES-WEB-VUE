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
} from './portalOperador.nucleo'

export { shouldKeepOperatorRealtimeRequestVisible } from './portalOperador.utilidadesSolicitudes'
