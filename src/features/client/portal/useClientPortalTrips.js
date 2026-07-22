import { computed } from 'vue'

export function useClientPortalTrips({
  commercialAccessCheckoutReturnMode,
  hasBootstrappedReservations,
  loadingServerData,
  paymentReadyForCheckout,
  props,
  refreshingReservations,
  reservations,
  selectedReservation,
}) {
  const tripsInitialTab = computed(() => {
    if (props.section === 'historial') return 'historial'
    return 'proximos'
  })

  const needsReservationContext = computed(() => {
    if (commercialAccessCheckoutReturnMode.value) return false
    return ['contrato', 'pago', 'reserva-confirmada', 'soporte'].includes(props.section)
  })

  const hasReservationsLoaded = computed(
    () =>
      hasBootstrappedReservations.value &&
      !loadingServerData.value &&
      !refreshingReservations.value &&
      Array.isArray(reservations.value),
  )

  const canRenderReservationWorkflow = computed(() => {
    if (!needsReservationContext.value) return true
    const hasAvailabilityConflict = selectedReservation.value?.frontend_state?.availability_conflict === true

    if (props.section === 'contrato') {
      return Boolean(selectedReservation.value?.is_reservation) && !hasAvailabilityConflict
    }
    if (props.section === 'pago') {
      if (commercialAccessCheckoutReturnMode.value) return true
      return Boolean(selectedReservation.value) && paymentReadyForCheckout.value && !hasAvailabilityConflict
    }
    if (props.section === 'reserva-confirmada') {
      return Boolean(selectedReservation.value) && !hasAvailabilityConflict
    }
    return Boolean(selectedReservation.value)
  })

  const isResultsSection = computed(() =>
    ['resultados', 'paquete-vuelo', 'aeronave', 'reserva'].includes(props.section),
  )

  return {
    canRenderReservationWorkflow,
    hasReservationsLoaded,
    isResultsSection,
    needsReservationContext,
    tripsInitialTab,
  }
}
