import { ref } from 'vue'
import { defineStore } from 'pinia'
import { continueRentalFlow } from '../services/clientRentalService'

const STORAGE_KEY = 'red_aviation_pending_rental_v1'
function storage() { return typeof sessionStorage === 'undefined' ? null : sessionStorage }
function readPendingSearch() { try { return JSON.parse(storage()?.getItem(STORAGE_KEY) || 'null') } catch { return null } }

export const useRentalFlowStore = defineStore('rentalFlow', () => {
  const pendingSearch = ref(readPendingSearch())
  const pendingAction = ref(pendingSearch.value ? 'continue_rental' : null)
  const flightRequestId = ref(null), reservationId = ref(null), lastError = ref(null), continuing = ref(false)
  function savePendingSearch(payload) { pendingSearch.value = payload; pendingAction.value = 'continue_rental'; storage()?.setItem(STORAGE_KEY, JSON.stringify(payload)) }
  function restorePendingSearch() { pendingSearch.value = readPendingSearch(); return pendingSearch.value }
  function clearPendingSearch() { pendingSearch.value = null; pendingAction.value = null; storage()?.removeItem(STORAGE_KEY) }
  function setFlightRequestId(id) { flightRequestId.value = id || null }
  function setReservationId(id) { reservationId.value = id || null }
  async function continueAfterAuthentication() {
    if (continuing.value) return null
    const search = restorePendingSearch()
    if (!search) return null
    continuing.value = true; lastError.value = null
    try {
      const result = await continueRentalFlow(search)
      setFlightRequestId(result.flightRequestId); setReservationId(result.reservationId); clearPendingSearch()
      return result
    } catch (error) { lastError.value = error?.message || 'No fue posible continuar la renta.'; throw error }
    finally { continuing.value = false }
  }
  return { pendingSearch, pendingAction, flightRequestId, reservationId, lastError, continuing, savePendingSearch, restorePendingSearch, clearPendingSearch, continueAfterAuthentication, setFlightRequestId, setReservationId }
})
