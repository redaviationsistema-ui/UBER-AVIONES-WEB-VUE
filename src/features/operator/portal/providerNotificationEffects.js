const processed = new Set()
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const PREFIX = 'skygroup.provider-notification.'

export async function claimProviderNotificationEffect(eventKey, userId = '') {
  const key = `${PREFIX}${userId}:${eventKey}`
  const claim = () => {
    if (processed.has(key)) return false
    try {
      const previous = Number(localStorage.getItem(key) || 0)
      if (previous && Date.now() - previous < RETENTION_MS) {
        processed.add(key)
        return false
      }
      localStorage.setItem(key, String(Date.now()))
      // Bound storage growth; only touch keys owned by this feature.
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const entry = localStorage.key(index)
        if (entry?.startsWith(PREFIX) && Date.now() - Number(localStorage.getItem(entry) || 0) >= RETENTION_MS) {
          localStorage.removeItem(entry)
        }
      }
    } catch { /* Memory deduplication still works when storage is unavailable. */ }
    processed.add(key)
    return true
  }
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request(key, claim)
  }
  return claim()
}

export function showProviderBrowserNotification(notification, open) {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return
  const confirmed = notification.type === 'flight.confirmed'
  try {
    const browserNotice = new Notification(confirmed ? 'Red Aviation — Vuelo confirmado' : 'Nueva solicitud de vuelo', {
      body: `Solicitud #${notification.requestId} · ${notification.payload.route || 'Ruta por confirmar'}${confirmed ? '\nEl pago fue confirmado.' : ''}`,
      tag: `${confirmed ? 'flight-confirmed' : 'request-created'}-${notification.requestId}`,
    })
    browserNotice.onclick = () => {
      try { window.focus() } catch { /* Some browsers do not allow focus. */ }
      browserNotice.close?.()
      void open(notification)
    }
  } catch { /* Browser notification failures must not interrupt the portal. */ }
}
