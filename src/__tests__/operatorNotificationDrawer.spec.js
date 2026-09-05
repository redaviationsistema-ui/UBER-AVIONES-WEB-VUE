/* @vitest-environment jsdom */
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PortalOperadorAlertas from '../features/operator/portal/secciones/PortalOperadorAlertas.vue'

let wrapper
function setup() {
  const context = {
    realtimeNotificationsOpen: ref(false), unreadRealtimeNotifications: ref(2),
    activeRealtimeNotifications: ref([
      { id: 'created', requestId: 51, title: 'Nueva solicitud', type: 'flight.request.created', payload: { route: 'MMTO → MMVA', aircraft_name: 'Learjet 31A' }, createdAt: '2026-09-05T12:00:00Z' },
      { id: 'confirmed', requestId: 52, title: 'Vuelo confirmado', type: 'flight.confirmed', payload: { route: 'MMTO → MMAN' }, createdAt: '2026-09-05T12:00:00Z' },
    ]),
    markAllRealtimeNotificationsRead: vi.fn(), markRealtimeNotificationRead: vi.fn(),
    openRealtimeNotification: vi.fn(), enableBrowserNotifications: vi.fn(), goToSection: vi.fn(),
  }
  wrapper = mount(PortalOperadorAlertas, { attachTo: document.body, global: { provide: { operatorPortalContext: context } } })
  return context
}
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = '' })

describe('compact operator notification drawer', () => {
  it('limits the drawer to six backend events without reducing the unread badge', async () => {
    const context = setup()
    context.activeRealtimeNotifications.value = Array.from({ length: 9 }, (_, index) => ({
      ...context.activeRealtimeNotifications.value[0], id: `event-${index}`, requestId: index + 1,
    }))
    context.unreadRealtimeNotifications.value = 9
    await wrapper.get('button').trigger('click')
    expect(document.querySelectorAll('.operator-notice__row')).toHaveLength(6)
    expect(wrapper.get('.operator-bell__badge').text()).toBe('9')
  })
  it('opens a body overlay with a badge, both event types and closes outside', async () => {
    setup()
    const bell = wrapper.get('[aria-label="Abrir notificaciones"]')
    expect(bell.text()).toBe('2')
    expect(bell.attributes('aria-expanded')).toBe('false')
    await bell.trigger('click')
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(wrapper.element.contains(dialog)).toBe(false)
    expect(document.body.contains(dialog)).toBe(true)
    expect(dialog.textContent).toContain('Nueva solicitud')
    expect(dialog.textContent).toContain('Vuelo confirmado')
    expect(dialog.style.maxHeight).toBeTruthy()
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(bell.attributes('aria-expanded')).toBe('false')
  })
  it('closes with Escape and restores focus to the bell', async () => {
    setup()
    const bell = wrapper.get('button')
    await bell.trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(bell.attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(bell.element)
  })
  it('preserves read actions and opens the exact notification then closes', async () => {
    const context = setup()
    await wrapper.get('button').trigger('click')
    document.querySelector('.operator-notice__read').click()
    expect(context.markRealtimeNotificationRead).toHaveBeenCalledWith('created')
    document.querySelector('.operator-notice__header button').click()
    expect(context.markAllRealtimeNotificationsRead).toHaveBeenCalled()
    document.querySelectorAll('.operator-notice__open')[1].click()
    expect(context.openRealtimeNotification).toHaveBeenCalledWith(context.activeRealtimeNotifications.value[1])
    expect(context.realtimeNotificationsOpen.value).toBe(false)
  })
  it('hides zero badge, links to solicitudes and removes outside listeners on unmount', async () => {
    const context = setup()
    context.unreadRealtimeNotifications.value = 0
    await wrapper.get('button').trigger('click')
    expect(wrapper.find('.operator-bell__badge').exists()).toBe(false)
    document.querySelector('.operator-notice__footer button').click()
    expect(context.goToSection).toHaveBeenCalledWith('solicitudes')
    await wrapper.get('button').trigger('click')
    wrapper.unmount()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(context.realtimeNotificationsOpen.value).toBe(true)
  })
})
