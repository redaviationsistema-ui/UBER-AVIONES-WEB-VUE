// Prioridad local:
// VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1
// VITE_BACKEND_ORIGIN=http://127.0.0.1:8000
// Fallback Render:
// VITE_FALLBACK_API_BASE_URL=https://uber-aviones.onrender.com/api/v1
// VITE_FALLBACK_BACKEND_ORIGIN=https://uber-aviones.onrender.com
const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1').replace(/\/$/, '')
const CONFIGURED_BACKEND_ORIGIN = String(import.meta.env.VITE_BACKEND_ORIGIN || '').replace(/\/$/, '')
const FALLBACK_API_BASE_URL = String(import.meta.env.VITE_FALLBACK_API_BASE_URL || '').replace(/\/$/, '')
const FALLBACK_BACKEND_ORIGIN = String(import.meta.env.VITE_FALLBACK_BACKEND_ORIGIN || '').replace(/\/$/, '')


let memoryToken = null
const AUTH_STORAGE_KEY = 'red_aviation_auth_token'
let activeBackendIndex = 0

function toOrigin(baseUrl = '') {
  if (!baseUrl) return ''

  try {
    return new URL(baseUrl).origin
  } catch {
    return ''
  }
}

function getBackendCandidates() {
  const candidates = [
    {
      apiBaseUrl: API_BASE_URL,
      origin: CONFIGURED_BACKEND_ORIGIN || toOrigin(API_BASE_URL),
    },
    {
      apiBaseUrl: FALLBACK_API_BASE_URL,
      origin: FALLBACK_BACKEND_ORIGIN || toOrigin(FALLBACK_API_BASE_URL),
    },
  ]

  return candidates.filter(
    (candidate, index, list) =>
      candidate.apiBaseUrl &&
      list.findIndex((item) => item.apiBaseUrl === candidate.apiBaseUrl && item.origin === candidate.origin) === index,
  )
}

function getActiveBackend() {
  const candidates = getBackendCandidates()

  if (!candidates.length) {
    return {
      apiBaseUrl: '',
      origin: '',
    }
  }

  return candidates[Math.min(activeBackendIndex, candidates.length - 1)]
}

function normalizeBaseUrl(baseUrl = '') {
  if (!baseUrl) return ''

  if (baseUrl.startsWith('http://') || baseUrl.startsWith('https://')) {
    return baseUrl
  }

  if (typeof window === 'undefined') {
    return baseUrl
  }

  return `${window.location.origin}${baseUrl.startsWith('/') ? baseUrl : `/${baseUrl}`}`
}

export function getBackendOrigin() {
  const activeBackend = getActiveBackend()

  if (activeBackend.origin) {
    return activeBackend.origin
  }

  if (typeof window === 'undefined') {
    return ''
  }

  return window.location.origin
}

export function resolveMediaUrl(url = '') {
  const rawUrl = String(url || '').trim()
  if (!rawUrl) return ''

  if (/^(blob:|data:|https?:\/\/|\/\/)/i.test(rawUrl)) {
    return rawUrl
  }

  if (rawUrl.startsWith('/') && !rawUrl.startsWith('/storage')) {
    return rawUrl
  }

  const backendOrigin = getBackendOrigin()
  if (!backendOrigin) {
    return `/${rawUrl.replace(/^\.?\//, '')}`
  }

  return `${backendOrigin}/${rawUrl.replace(/^\.?\//, '')}`
}

function buildUrl(path, query = {}, backendOverride = null) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const activeBackend = backendOverride || getActiveBackend()
  const baseUrl = activeBackend.apiBaseUrl || API_BASE_URL
  const base = normalizeBaseUrl(baseUrl)
  const url = new URL(`${base}${normalizedPath}`)

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    url.searchParams.set(key, String(value))
  })

  return url.toString()
}

function getFilenameFromDisposition(disposition = '') {
  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utfMatch?.[1]) {
    return decodeURIComponent(utfMatch[1])
  }

  
  const plainMatch = disposition.match(/filename="?([^"]+)"?/i)
  return plainMatch?.[1] || ''
}

function buildHeaders(customHeaders = {}) {
  const headers = {
    Accept: 'application/json',
    ...customHeaders,
  }

  const token = getStoredToken()

  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`
  }

  return headers
}

function canUseSessionStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function extractApiErrorMessage(payload = {}, status = 0) {
  if (typeof payload?.message === 'string' && payload.message.trim()) {
    if (payload.message !== `Error ${status}`) {
      return payload.message
    }
  }

  const firstFieldErrors = Object.values(payload?.errors || {}).find((value) => Array.isArray(value) && value.length)
  if (firstFieldErrors?.[0]) {
    return firstFieldErrors[0]
  }

  return `Error ${status}`
}

export function getStoredToken() {
  if (!memoryToken && canUseSessionStorage()) {
    memoryToken = window.sessionStorage.getItem(AUTH_STORAGE_KEY)
  }

  if (!memoryToken && canUseLocalStorage()) {
    memoryToken = window.localStorage.getItem(AUTH_STORAGE_KEY)
  }

  return memoryToken
}

export function setStoredToken(token) {
  memoryToken = token || null

  if (canUseSessionStorage()) {
    if (memoryToken) {
      window.sessionStorage.setItem(AUTH_STORAGE_KEY, memoryToken)
    } else {
      window.sessionStorage.removeItem(AUTH_STORAGE_KEY)
    }
  }

  if (canUseLocalStorage()) {
    if (memoryToken) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, memoryToken)
    } else {
      window.localStorage.removeItem(AUTH_STORAGE_KEY)
    }
  }
}

export function clearStoredToken() {
  memoryToken = null

  if (canUseSessionStorage()) {
    window.sessionStorage.removeItem(AUTH_STORAGE_KEY)
  }

  if (canUseLocalStorage()) {
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
  }
}

export async function apiRequest(path, options = {}) {
  const config = {
    method: options.method || 'GET',
    headers: buildHeaders(options.headers),
    credentials: 'include',
  }

  if (options.formData instanceof FormData) {
    config.body = options.formData
  } else if (options.body !== undefined) {
    config.headers['Content-Type'] = 'application/json'
    config.body = JSON.stringify(options.body)
  }

  const candidates = getBackendCandidates()
  const orderedCandidates = candidates.length
    ? [...candidates.slice(activeBackendIndex), ...candidates.slice(0, activeBackendIndex)]
    : [getActiveBackend()]

  let response
  let lastError = null

  for (const candidate of orderedCandidates) {
    const url = buildUrl(path, options.query, candidate)

    try {
      response = await fetch(url, config)
      const matchedIndex = candidates.findIndex(
        (item) => item.apiBaseUrl === candidate.apiBaseUrl && item.origin === candidate.origin,
      )
      activeBackendIndex = matchedIndex >= 0 ? matchedIndex : 0
      lastError = null
      break
    } catch (error) {
      lastError = error

      const matchedIndex = candidates.findIndex(
        (item) => item.apiBaseUrl === candidate.apiBaseUrl && item.origin === candidate.origin,
      )
      const nextIndex = matchedIndex >= 0 ? matchedIndex + 1 : 0
      activeBackendIndex = nextIndex < candidates.length ? nextIndex : 0
    }
  }

  if (!response) {
    const networkError = new Error('No fue posible conectar con el servicio local ni con el servidor remoto.')
    networkError.cause = lastError
    throw networkError
  }

  if (options.responseType === 'blob') {
    if (!response.ok) {
      const contentType = response.headers.get('content-type') || ''
      const payload = contentType.includes('application/json')
        ? await response.json().catch(() => ({}))
        : {}
      const error = new Error(extractApiErrorMessage(payload, response.status))
      error.status = response.status
      error.payload = payload
      throw error
    }

    return {
      blob: await response.blob(),
      fileName: getFilenameFromDisposition(response.headers.get('content-disposition') || ''),
      contentType: response.headers.get('content-type') || '',
    }
  }

  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : {}

  if (!response.ok || payload.success === false) {
    const error = new Error(extractApiErrorMessage(payload, response.status))
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload
}

export const api = {
  get: (path, options = {}) => apiRequest(path, options),
  post: (path, body, options = {}) => apiRequest(path, { method: 'POST', body, ...options }),
  postForm: (path, formData, options = {}) =>
    apiRequest(path, { method: 'POST', formData, ...options }),
  put: (path, body, options = {}) => apiRequest(path, { method: 'PUT', body, ...options }),
  delete: (path, options = {}) => apiRequest(path, { method: 'DELETE', ...options }),
  download: (path, options = {}) => apiRequest(path, { ...options, responseType: 'blob' }),
}
