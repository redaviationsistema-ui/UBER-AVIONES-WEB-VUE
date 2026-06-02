const CONFIGURED_DOCUSIGN_FRONTEND_URL = String(import.meta.env.VITE_DOCUSIGN_FRONTEND_URL || '')
  .trim()
  .replace(/\/$/, '')
const CONFIGURED_FRONTEND_URL = String(import.meta.env.VITE_FRONTEND_URL || '')
  .trim()
  .replace(/\/$/, '')
const APP_BASE_PATH = String(import.meta.env.BASE_URL || '/').trim() || '/'

function normalizeAppBasePath(basePath = '/') {
  const normalizedPath = String(basePath || '/').trim() || '/'

  if (normalizedPath === '/') return ''

  const withLeadingSlash = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`
  return withLeadingSlash.endsWith('/') ? withLeadingSlash.slice(0, -1) : withLeadingSlash
}

export function getFrontendBaseUrl() {
  if (CONFIGURED_DOCUSIGN_FRONTEND_URL) {
    return CONFIGURED_DOCUSIGN_FRONTEND_URL
  }

  if (CONFIGURED_FRONTEND_URL) {
    return CONFIGURED_FRONTEND_URL
  }

  if (typeof window === 'undefined') {
    return ''
  }

  return `${window.location.origin}${normalizeAppBasePath(APP_BASE_PATH)}`
}

export function buildFrontendUrl(path = '/', query = {}) {
  const baseUrl = getFrontendBaseUrl()
  if (!baseUrl) return ''

  const baseWithSlash = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const normalizedPath = String(path || '/').replace(/^\/+/, '')
  const url = new URL(normalizedPath, baseWithSlash)

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    url.searchParams.set(key, String(value))
  })

  return url.toString()
}
