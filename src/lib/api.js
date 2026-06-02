const API_BASE_URL = String(
  import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    'http://127.0.0.1:8000/api/v1',
).replace(/\/$/, '')
const CONFIGURED_BACKEND_ORIGIN = String(import.meta.env.VITE_BACKEND_ORIGIN || '').replace(
  /\/$/,
  '',
)
const FALLBACK_API_BASE_URL = String(import.meta.env.VITE_FALLBACK_API_BASE_URL || '').replace(
  /\/$/,
  '',
)
const APP_BASE_PATH = String(import.meta.env.BASE_URL || '/').trim() || '/'
const FALLBACK_BACKEND_ORIGIN = String(import.meta.env.VITE_FALLBACK_BACKEND_ORIGIN || '').replace(
  /\/$/,
  '',
)
const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 15000)
const API_CREDENTIALS_MODE = String(import.meta.env.VITE_API_CREDENTIALS_MODE || 'same-origin')
  .trim()
  .toLowerCase()

let memoryToken = null
const AUTH_STORAGE_KEY = 'red_aviation_auth_token'
let activeBackendIndex = 0

function isLocalOrigin(origin = '') {
  return /^(http:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(String(origin || '').trim())
}

function toOrigin(baseUrl = '') {
  if (!baseUrl) return ''

  try {
    return new URL(baseUrl).origin
  } catch {
    return ''
  }
}

function getBackendCandidates() {
  const configuredOrigin = CONFIGURED_BACKEND_ORIGIN || toOrigin(API_BASE_URL)
  const shouldDisableFallbackInLocalDev =
    typeof window !== 'undefined' &&
    isLocalOrigin(window.location.origin) &&
    isLocalOrigin(configuredOrigin)

  const candidates = [
    {
      apiBaseUrl: API_BASE_URL,
      origin: configuredOrigin,
    },
    ...(!shouldDisableFallbackInLocalDev
      ? [
          {
            apiBaseUrl: FALLBACK_API_BASE_URL,
            origin: FALLBACK_BACKEND_ORIGIN || toOrigin(FALLBACK_API_BASE_URL),
          },
        ]
      : []),
  ]

  return candidates.filter(
    (candidate, index, list) =>
      candidate.apiBaseUrl &&
      list.findIndex(
        (item) => item.apiBaseUrl === candidate.apiBaseUrl && item.origin === candidate.origin,
      ) === index,
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

function shouldLogAircraftRequest(path = '') {
  return String(path || '')
    .toLowerCase()
    .includes('aircraft')
}

function shouldTraceOperationalRequest(path = '', debugTag = '') {
  return false
}

function logAircraftRequest(label, details = {}) {
  if (typeof console === 'undefined') return
  console.log(`[aircraft-debug] ${label}`, details)
}

function logOperationalRequest(label, details = {}) {
  if (typeof console === 'undefined') return
  console.warn(`[ops-request-debug] ${label}`, details)
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

function resolveCredentialsMode(options = {}) {
  if (typeof options.credentials === 'string' && options.credentials.trim()) {
    return options.credentials
  }

  if (options.withCredentials === true) {
    return 'include'
  }

  if (options.withCredentials === false) {
    return 'omit'
  }

  if (['omit', 'same-origin', 'include'].includes(API_CREDENTIALS_MODE)) {
    return API_CREDENTIALS_MODE
  }

  return 'same-origin'
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

  const firstFieldErrors = Object.values(payload?.errors || {}).find(
    (value) => Array.isArray(value) && value.length,
  )
  if (firstFieldErrors?.[0]) {
    return firstFieldErrors[0]
  }

  return `Error ${status}`
}

function isTimeoutError(error) {
  if (!error) return false

  return (
    error.name === 'AbortError' ||
    String(error.message || '')
      .toLowerCase()
      .includes('timeout after')
  )
}

function buildNetworkErrorMessage(lastError, attemptedCandidates = [], timeoutMs = API_TIMEOUT_MS) {
  const destinations = attemptedCandidates.map((candidate) => candidate.apiBaseUrl).filter(Boolean)

  if (isTimeoutError(lastError)) {
    const destinationLabel =
      destinations.length > 1
        ? `los servicios configurados (${destinations.join(', ')})`
        : destinations[0] || 'el servicio configurado'

    return `El servicio tardó demasiado en responder (${Math.round(timeoutMs / 1000)} s). Verifica que ${destinationLabel} esté activo.`
  }

  return 'No fue posible conectar con el servicio local ni con el servidor remoto.'
}

function isUnauthorizedResponse(response, payload = {}) {
  if (response?.status === 401) return true

  const message = String(payload?.message || '')
    .trim()
    .toLowerCase()

  return message === 'unauthenticated.' || message === 'unauthenticated'
}

function redirectToClientLogin() {
  if (typeof window === 'undefined') return

  const normalizedBasePath =
    APP_BASE_PATH === '/' ? '/' : `/${APP_BASE_PATH.replace(/^\/+|\/+$/g, '')}/`
  const currentPath = `${window.location.pathname || '/'}${window.location.search || ''}${window.location.hash || ''}`
  const loginPath = `${normalizedBasePath === '/' ? '' : normalizedBasePath.slice(0, -1)}/login-cliente`
  const isAlreadyOnClientLogin =
    currentPath.startsWith(loginPath) ||
    currentPath.startsWith(`${normalizedBasePath === '/' ? '' : normalizedBasePath.slice(0, -1)}/login`)
  if (isAlreadyOnClientLogin) return

  const loginUrl = new URL(loginPath, window.location.origin)
  loginUrl.searchParams.set('session', 'expired')
  if (currentPath && currentPath !== '/') {
    loginUrl.searchParams.set('redirect', currentPath)
  }

  window.location.replace(loginUrl.toString())
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
// checar la causa del porque no me muestra el valor presiso como en el sistema , contemplando el ascenso y el desenso
// guiate con el movil
export async function apiRequest(path, options = {}) {
  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Number(options.timeoutMs)
    : API_TIMEOUT_MS
  const debugTag = String(options.debugTag || '').trim()
  const config = {
    method: options.method || 'GET',
    headers: buildHeaders(options.headers),
    credentials: resolveCredentialsMode(options),
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
    const isAircraftRequest = shouldLogAircraftRequest(path)
    const shouldTraceRequest = shouldTraceOperationalRequest(path, debugTag)
    const startedAt =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now()
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timeoutId =
      controller && timeoutMs > 0
        ? window.setTimeout(
            () => controller.abort(new Error(`Timeout after ${timeoutMs}ms`)),
            timeoutMs,
          )
        : null

    try {
      if (isAircraftRequest) {
        logAircraftRequest('request', {
          method: config.method,
          path,
          query: options.query || {},
          url,
        })
      }

      if (controller) {
        config.signal = controller.signal
      }
      response = await fetch(url, config)
      const finishedAt =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now()
      const elapsedMs = Math.round(finishedAt - startedAt)

      if (isAircraftRequest && !response.ok) {
        logAircraftRequest('http-error-response', {
          method: config.method,
          path,
          query: options.query || {},
          url,
          status: response.status,
          statusText: response.statusText,
        })
      }

      if (shouldTraceRequest && elapsedMs >= 1000) {
        logOperationalRequest('response', {
          tag: debugTag || path,
          method: config.method,
          path,
          url,
          status: response.status,
          elapsedMs,
          timeoutMs,
        })
      }

      const matchedIndex = candidates.findIndex(
        (item) => item.apiBaseUrl === candidate.apiBaseUrl && item.origin === candidate.origin,
      )
      activeBackendIndex = matchedIndex >= 0 ? matchedIndex : 0
      lastError = null
      break
    } catch (error) {
      const finishedAt =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now()
      const elapsedMs = Math.round(finishedAt - startedAt)

      if (isAircraftRequest) {
        logAircraftRequest('network-error', {
          method: config.method,
          path,
          query: options.query || {},
          url,
          message: error?.message || 'Unknown network error',
          error,
        })
      }

      if (shouldTraceRequest) {
        logOperationalRequest(isTimeoutError(error) ? 'timeout' : 'network-error', {
          tag: debugTag || path,
          method: config.method,
          path,
          url,
          elapsedMs,
          timeoutMs,
          message: error?.message || 'Unknown network error',
        })
      }

      lastError = error

      const matchedIndex = candidates.findIndex(
        (item) => item.apiBaseUrl === candidate.apiBaseUrl && item.origin === candidate.origin,
      )
      const nextIndex = matchedIndex >= 0 ? matchedIndex + 1 : 0
      activeBackendIndex = nextIndex < candidates.length ? nextIndex : 0
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    }
  }

  if (!response) {
    const networkError = new Error(
      buildNetworkErrorMessage(lastError, orderedCandidates, timeoutMs),
    )
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
    if (shouldLogAircraftRequest(path)) {
      logAircraftRequest('api-error-payload', {
        method: config.method,
        path,
        query: options.query || {},
        url: response.url,
        status: response.status,
        statusText: response.statusText,
        payload,
      })
    }

    if (isUnauthorizedResponse(response, payload) && !options.preserveAuthOnUnauthorized) {
      clearStoredToken()
      redirectToClientLogin()
    }

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
  patch: (path, body, options = {}) => apiRequest(path, { method: 'PATCH', body, ...options }),
  put: (path, body, options = {}) => apiRequest(path, { method: 'PUT', body, ...options }),
  delete: (path, options = {}) => apiRequest(path, { method: 'DELETE', ...options }),
  download: (path, options = {}) => apiRequest(path, { ...options, responseType: 'blob' }),
}
