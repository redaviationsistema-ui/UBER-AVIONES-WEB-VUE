import { api } from './api'

export async function deleteAircraftDocument(aircraftId, documentId) {
  const normalizedAircraftId = Number(aircraftId || 0)
  const normalizedDocumentId = Number(documentId || 0)

  if (!normalizedAircraftId || !normalizedDocumentId) {
    throw new Error('aircraftId y documentId son obligatorios')
  }

  return api.delete(`/operator/aircraft/${normalizedAircraftId}/documents/${normalizedDocumentId}`)
}
