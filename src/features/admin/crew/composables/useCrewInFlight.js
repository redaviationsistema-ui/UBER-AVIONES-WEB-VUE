import { computed } from 'vue'
import { useCrewOperations } from './useCrewOperations'

export function useCrewInFlight(props) {
  const controller = useCrewOperations(props, { viewMode: 'in-flight' })

  const activeSummary = computed(() => [
    {
      label: 'Activos',
      value: controller.filteredOperations.value.length,
      detail: 'Operaciones en tracking o vuelo activo.',
    },
    {
      label: 'Con incidencia',
      value: controller.filteredOperations.value.filter((item) => Number(item.incidentsCount || 0) > 0).length,
      detail: 'Vuelos que hoy requieren seguimiento.',
    },
    {
      label: 'Sin respuesta crew',
      value: controller.filteredOperations.value.filter((item) => controller.resolveCrewAssignmentStatus?.(item) === 'pending_confirmation').length,
      detail: 'Sobrecargos que aun no responden o confirman.',
    },
    {
      label: 'Bitacora',
      value: controller.auditQueue.value.length,
      detail: 'Eventos relacionados al seguimiento activo.',
    },
  ])

  return {
    ...controller,
    summaryCards: activeSummary,
  }
}
