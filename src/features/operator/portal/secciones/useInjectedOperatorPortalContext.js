import { inject } from 'vue'

export function useInjectedOperatorPortalContext() {
  const portal = inject('operatorPortalContext', null)

  if (!portal) {
    throw new Error('Operator portal context is not available.')
  }

  return portal
}
