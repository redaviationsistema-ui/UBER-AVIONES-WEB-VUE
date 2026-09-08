/* @vitest-environment jsdom */
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CrewIncidentModal from '../features/crew/CrewIncidentModal.vue'
let wrapper
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function () { this.setAttribute('open', '') })
  HTMLDialogElement.prototype.close = vi.fn(function () { this.removeAttribute('open') })
})
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; vi.restoreAllMocks() })
describe('incident modal', () => {
  it('teleports outside the flow, opens a native modal and restores focus without scrolling', async () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    const focus = vi.spyOn(trigger, 'focus')
    wrapper = mount(CrewIncidentModal, { slots: { default: '<input aria-label="Descripción" />' } })
    const dialog = document.body.querySelector('dialog')
    expect(dialog.open).toBe(true)
    expect(wrapper.find('dialog').exists()).toBe(false)
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce()
    dialog.querySelector('[aria-label="Cerrar incidencia"]').click()
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  })
  it('supports cancel and Escape, and prevents closing while submitting', async () => {
    wrapper = mount(CrewIncidentModal)
    const dialog = document.body.querySelector('dialog')
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
    expect(wrapper.emitted('close')).toHaveLength(1)
    await wrapper.setProps({ busy: true })
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect([...dialog.querySelectorAll('button')].every((button) => button.disabled)).toBe(true)
  })
})
