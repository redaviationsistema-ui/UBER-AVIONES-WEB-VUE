import Echo from 'laravel-echo'
import Pusher from 'pusher-js'
import { getBackendOrigin, getStoredToken } from '../lib/api'

window.Pusher = Pusher

function resolveBroadcastAuthEndpoint() {
  const explicitEndpoint = String(import.meta.env.VITE_BROADCAST_AUTH_ENDPOINT || '').trim()
  if (explicitEndpoint) return explicitEndpoint

  const apiUrl = String(import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
  let backendOrigin = getBackendOrigin()

  if (!backendOrigin && apiUrl) {
    try {
      backendOrigin = new URL(apiUrl, window.location.origin).origin
    } catch {
      backendOrigin = ''
    }
  }

  return `${backendOrigin}/broadcasting/auth`
}

export function isEchoConfigured() {
  return Boolean(import.meta.env.VITE_PUSHER_APP_KEY)
}

export function createEchoClient() {
  if (!isEchoConfigured()) return null

  return new Echo({
    broadcaster: 'pusher',
    key: import.meta.env.VITE_PUSHER_APP_KEY,
    cluster: import.meta.env.VITE_PUSHER_APP_CLUSTER || 'mt1',
    forceTLS: true,
    authEndpoint: resolveBroadcastAuthEndpoint(),
    auth: {
      headers: {
        Authorization: `Bearer ${getStoredToken() || ''}`,
        Accept: 'application/json',
      },
    },
  })
}

export const echo = createEchoClient()

if (echo) {
  window.Echo = echo
}
