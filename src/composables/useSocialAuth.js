function normalizeProviderUrl(value) {
  if (!value || typeof value !== 'string') return ''

  const trimmed = value.trim()

  if (!trimmed) return ''

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  if (trimmed.startsWith('/')) {
    return trimmed
  }

  return `/${trimmed}`
}

export function useSocialAuth() {
  const googleAuthUrl = normalizeProviderUrl(import.meta.env.VITE_GOOGLE_AUTH_URL)
  const appleAuthUrl = normalizeProviderUrl(import.meta.env.VITE_APPLE_AUTH_URL)

  return {
    googleAuthUrl,
    appleAuthUrl,
  }
}
