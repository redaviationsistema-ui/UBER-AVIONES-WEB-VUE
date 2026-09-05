/* @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { showProviderBrowserNotification } from '../features/operator/portal/providerNotificationEffects'

afterEach(() => vi.unstubAllGlobals())

describe('provider notification effects across tabs', () => {
  it('claims a logical event once across separate module instances using shared storage and Web Locks', async () => {
    const storage = new Map()
    vi.stubGlobal('localStorage', {
      get length() { return storage.size }, key: (index) => [...storage.keys()][index],
      getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    })
    let lock = Promise.resolve()
    vi.stubGlobal('navigator', { locks: { request: vi.fn((_name, callback) => {
      const next = lock.then(callback)
      lock = next.then(() => {})
      return next
    }) } })
    vi.resetModules()
    const firstTab = await import('../features/operator/portal/providerNotificationEffects')
    vi.resetModules()
    const secondTab = await import('../features/operator/portal/providerNotificationEffects')
    const results = await Promise.all([
      firstTab.claimProviderNotificationEffect('provider:88:flight:901:flight-confirmed', 21),
      secondTab.claimProviderNotificationEffect('provider:88:flight:901:flight-confirmed', 21),
    ])
    expect(results.sort()).toEqual([false, true])
  })

  it('opens the notification target when the native notification is clicked', () => {
    let native
    vi.stubGlobal('Notification', class {
      static permission = 'granted'
      constructor(title, options) { native = this; this.options = options }
      close = vi.fn()
    })
    const open = vi.fn()
    const notification = { type: 'flight.confirmed', requestId: 42, eventKey: 'flight:42', payload: { route: 'MMTO → MMMM' } }
    showProviderBrowserNotification(notification, open)
    expect(native.options.tag).toBe('flight-confirmed-42')
    native.onclick()
    expect(open).toHaveBeenCalledWith(notification)
    expect(native.close).toHaveBeenCalled()
  })
})
