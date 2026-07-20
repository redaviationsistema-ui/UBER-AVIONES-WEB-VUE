/* @vitest-environment jsdom */

import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CrewNotificationCenter from '../features/crew/CrewNotificationCenter.vue'

const { push, get, patch } = vi.hoisted(() => ({ push: vi.fn(), get: vi.fn(), patch: vi.fn() }))

vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('../lib/api', () => ({ api: { get, patch } }))

describe('CrewNotificationCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    get.mockResolvedValue({
      unread_count: 1,
      notifications: { data: [{ id: 7, type: 'critical_incident_created', title: 'Incidencia crítica', message: 'Revisión inmediata', created_at: '2026-07-19T12:00:00Z', read_at: null, payload: { level: 'critical', url: '/sobrecargo/asignaciones/10' } }] },
    })
    patch.mockResolvedValue({ notification: { read_at: '2026-07-19T12:01:00Z' } })
  })

  it('shows unread critical notifications and marks one as read', async () => {
    const wrapper = mount(CrewNotificationCenter)
    await flushPromises()
    expect(wrapper.get('.crew-notification-count').text()).toBe('1')
    await wrapper.get('[data-crew-notification-trigger]').trigger('click')
    await flushPromises()
    expect(wrapper.get("li[data-level='critical']").text()).toContain('Incidencia crítica')
    await wrapper.get('.crew-notification-list button').trigger('click')
    await flushPromises()
    expect(patch).toHaveBeenCalledWith('/notifications/7/read', {})
    expect(push).toHaveBeenCalledWith('/sobrecargo/asignaciones/10')
  })

  it('renders a recoverable API error', async () => {
    get.mockRejectedValue(Object.assign(new Error('Network error'), { status: 503 }))
    const wrapper = mount(CrewNotificationCenter)
    await flushPromises()
    await wrapper.get('[data-crew-notification-trigger]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Network error')
    expect(wrapper.get('[role="alert"] button').text()).toBe('Reintentar')
  })
})
