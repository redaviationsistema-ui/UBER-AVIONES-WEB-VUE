import { api } from './api'

export async function getAircraftChecklist(aircraftId) {
  return api.get(`/admin/aeronaves/${aircraftId}/checklist`, {
    timeoutMs: 30000,
    debugTag: 'admin-aircraft-checklist',
  })
}

export async function updateAircraftChecklist(aircraftId, payload) {
  return api.put(`/admin/aeronaves/${aircraftId}/checklist`, payload, {
    timeoutMs: 30000,
    debugTag: 'admin-aircraft-checklist',
  })
}
