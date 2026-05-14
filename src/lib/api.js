//const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'https://uber-aviones.onrender.com/api/v1').replace(/\/$/, '')
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1').replace(/\/$/, '')


let memoryToken = null
const AUTH_STORAGE_KEY = 'red_aviation_auth_token'

function buildUrl(path, query = {}) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const base =
    API_BASE_URL.startsWith('http://') || API_BASE_URL.startsWith('https://')
      ? API_BASE_URL
      : `${window.location.origin}${API_BASE_URL.startsWith('/') ? API_BASE_URL : `/${API_BASE_URL}`}`
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
  const url = buildUrl(path, options.query)
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

  let response

  try {
    response = await fetch(url, config)
  } catch (error) {
    const networkError = new Error('No fue posible conectar con el servicio en este momento.')
    networkError.cause = error
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
