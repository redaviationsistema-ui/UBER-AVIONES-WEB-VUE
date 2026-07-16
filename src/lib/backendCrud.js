import { api } from './api'

function isGatewayFailure(status = 0) {
  return [502, 503, 504].includes(Number(status || 0))
}

function shouldTryNextCandidate(error) {
  const status = Number(error?.status || 0)
  const message = String(error?.message || '').toLowerCase()

  if (status === 0) return true
  if ([404, 405].includes(status)) return true
  if (isGatewayFailure(status)) return false
  if (status >= 500 && status <= 599) return true
  if (message.includes('route') && message.includes('could not be found')) return true

  return false
}

function resolveRetryStatuses(candidate = {}, requestOptions = {}) {
  const statuses = [
    ...(Array.isArray(requestOptions.retryOnStatuses) ? requestOptions.retryOnStatuses : []),
    ...(Array.isArray(candidate.retryOnStatuses) ? candidate.retryOnStatuses : []),
  ]

  return [...new Set(statuses.map((status) => Number(status)).filter((status) => Number.isInteger(status) && status > 0))]
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

function shouldExposeAttemptSummary(error) {
  const status = Number(error?.status || 0)
  const message = String(error?.message || '').toLowerCase()

  return status === 404 || status === 405 || (message.includes('route') && message.includes('could not be found'))
}

export async function requestWithCandidates(candidates, requestOptions = {}) {
  let lastError = null
  const attempts = []

  for (const candidate of candidates) {
    try {
      const method = String(candidate.method || 'get').toLowerCase()
      const sharedOptions = {
        query: candidate.query,
        headers: candidate.headers,
        timeoutMs: candidate.timeoutMs,
        signal: requestOptions.signal,
        redirectOnForbidden: candidate.redirectOnForbidden,
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

      if (method === 'patch') {
        return await api.patch(candidate.path, candidate.body, sharedOptions)
      }

      if (method === 'delete') {
        return await api.delete(candidate.path, sharedOptions)
      }

      if (method === 'download') {
        return await api.download(candidate.path, sharedOptions)
      }
    } catch (error) {
      lastError = error
      const retryStatuses = resolveRetryStatuses(candidate, requestOptions)
      const currentStatus = Number(error?.status || 0)

      attempts.push({
        method: candidate.method || 'get',
        path: candidate.path,
        status: currentStatus,
      })

      if (retryStatuses.includes(currentStatus)) {
        continue
      }

      if (!shouldTryNextCandidate(error)) {
        throw error
      }
    }
  }

  if (lastError) {
    const attemptsSummary = buildAttemptSummary(attempts)
    lastError.candidateAttempts = attempts
    if (attemptsSummary && shouldExposeAttemptSummary(lastError)) {
      lastError.message = `${lastError.message || 'La solicitud fallo.'} Rutas probadas: ${attemptsSummary}`
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
