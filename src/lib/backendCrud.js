import { api } from './api'

function shouldTryNextCandidate(error) {
  const status = Number(error?.status || 0)

  if (status === 0) return true
  if ([404, 405].includes(status)) return true
  if (status >= 500 && status <= 599) return true

  return false
}

function buildAttemptSummary(attempts = []) {
  return attempts
    .map((attempt) => {
      const status = attempt?.status ? ` ${attempt.status}` : ''
      const path = attempt?.path || 'ruta-desconocida'
      return `${path}${status}`
    })
    .join(' | ')
}

export async function requestWithCandidates(candidates) {
  let lastError = null
  const attempts = []

  for (const candidate of candidates) {
    try {
      const method = String(candidate.method || 'get').toLowerCase()
      const sharedOptions = {
        query: candidate.query,
        headers: candidate.headers,
        timeoutMs: candidate.timeoutMs,
      }

      if (method === 'get') {
        return await api.get(candidate.path, sharedOptions)
      }

      if (method === 'post') {
        return await api.post(candidate.path, candidate.body, sharedOptions)
      }

      if (method === 'postform') {
        return await api.postForm(candidate.path, candidate.formData, sharedOptions)
      }

      if (method === 'put') {
        return await api.put(candidate.path, candidate.body, sharedOptions)
      }

      if (method === 'delete') {
        return await api.delete(candidate.path, sharedOptions)
      }

      if (method === 'download') {
        return await api.download(candidate.path, sharedOptions)
      }
    } catch (error) {
      lastError = error
      attempts.push({
        method: candidate.method || 'get',
        path: candidate.path,
        status: Number(error?.status || 0),
      })

      if (!shouldTryNextCandidate(error)) {
        throw error
      }
    }
  }

  if (lastError) {
    const attemptsSummary = buildAttemptSummary(attempts)
    if (attemptsSummary) {
      lastError.message = `${lastError.message || 'La solicitud fallo.'} Rutas probadas: ${attemptsSummary}`
      lastError.candidateAttempts = attempts
    }
    throw lastError
  }

  const unsupportedError = new Error('El backend no expone todavia una ruta compatible para esta accion.')
  unsupportedError.cause = lastError
  throw unsupportedError
}

export function pickCollection(payload, keys = []) {
  if (Array.isArray(payload)) return payload

  for (const key of keys) {
    const direct = payload?.[key]
    if (Array.isArray(direct)) return direct
    if (Array.isArray(direct?.data)) return direct.data
  }

  if (Array.isArray(payload?.data)) return payload.data
  return []
}

export function pickRecord(payload, keys = []) {
  for (const key of keys) {
    if (payload?.[key] && typeof payload[key] === 'object') {
      return payload[key]
    }
  }

  return payload
}
