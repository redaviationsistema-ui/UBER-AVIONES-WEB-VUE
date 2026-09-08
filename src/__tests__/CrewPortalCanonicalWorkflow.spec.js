/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const { request, push, toast } = vi.hoisted(() => ({ request: vi.fn(), push: vi.fn(), toast: vi.fn() }))
vi.mock('../lib/backendCrud', async () => ({ ...await vi.importActual('../lib/backendCrud'), requestWithCandidates: request }))
vi.mock('../lib/api', () => ({ api: { get: vi.fn(async () => ({})), postForm: vi.fn() } }))
vi.mock('../lib/workflowSync', () => ({ subscribeWorkflowSync: () => () => {} }))
vi.mock('../stores/auth', () => ({ useAuthStore: () => ({ user: { id: 8, name: 'Tripulante' }, syncUserContext: vi.fn() }) }))
vi.mock('../stores/ui', () => ({ useUiStore: () => ({ pushToast: toast }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
import CrewPortal from '../features/crew/CrewPortal.vue'
import { api } from '../lib/api'
import { DOMWrapper } from '@vue/test-utils'

let wrapper
let checkedIn
const group = (type, completed) => ({ id: type, type, items: [{ id: type, code: type, label: type, status: completed ? 'completed' : 'pending', is_required: true }] })
function payload() {
  return {
    operation_id: 1, assignment_id: 2, assignment_status: 'confirmed', crew_status: checkedIn ? 'checked_in' : 'ready_for_operation',
    checklists: [group('preparation', true), group('preflight', false), group('postflight', false)],
    timeline: checkedIn ? [{ status: 'crew_checkin', created_at: '2026-09-07T10:00:00Z' }] : [],
    checkin: checkedIn ? { recorded_at: '2026-09-07T10:00:00Z', actor_name: 'Tripulante' } : null,
    editable_checklists: [],
    allowed_actions: checkedIn ? [{ type: 'start_preflight', status: 'preflight_in_progress', label: 'Iniciar checklist pre-vuelo' }] : [{ type: 'crew_checkin', label: 'Registrar llegada' }],
  }
}
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function () { this.setAttribute('open', '') })
  HTMLDialogElement.prototype.close = vi.fn()
  api.postForm.mockReset()
  push.mockClear()
  checkedIn = false
  request.mockReset()
  request.mockImplementation(async ([candidate]) => {
    if (candidate.path.endsWith('/assignments')) return { assignments: [{ id: 1, assignment: { id: 2, status: 'confirmed' }, workflow_status: 'boarding' }] }
    if (candidate.path.endsWith('/workflow')) return payload()
    if (candidate.path.endsWith('/checkin')) { checkedIn = true; return {} }
    return {}
  })
})
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks() })
describe('Mi vuelo canonical integration', () => {
  it('renders arrival from allowed_actions, posts checkin and refreshes the next step', async () => {
    wrapper = mount(CrewPortal, { props: { section: 'asignaciones' }, global: { stubs: { CrewNotificationCenter: true, CrewAvailabilitySection: true } } })
    await flushPromises()
    expect(wrapper.text()).toContain('Paso 3 · Llegada al aeropuerto')
    const arrival = wrapper.findAll('button').find((button) => button.text() === 'Registrar llegada')
    expect(arrival).toBeTruthy()
    await arrival.trigger('click')
    await flushPromises()
    expect(request).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ method: 'post', path: '/sobrecargo/operations/1/checkin', body: expect.objectContaining({ fit_to_operate: true }) })]))
    expect(request.mock.calls.filter(([candidates]) => candidates[0].path.endsWith('/workflow')).length).toBeGreaterThanOrEqual(2)
    expect(wrapper.text()).toContain('Paso 4 · Checklist pre-vuelo')
    expect(wrapper.text()).toContain('Iniciar checklist pre-vuelo')
    expect(wrapper.text()).toContain('✓ Llegué al aeropuerto')
    expect(wrapper.text()).toContain('Tripulante')
  })
  it('collects all required final report fields before enabling closure', async () => {
    const final = payload()
    final.crew_status = 'report_pending'
    final.checklists = ['preparation', 'preflight', 'postflight'].map((type) => group(type, true))
    final.timeline = ['crew_checkin', 'cabina_lista', 'boarding', 'pasajeros_recibidos', 'in_flight', 'landed', 'postflight_pending'].map((status) => ({ status, created_at: '2026-09-07T10:00:00Z' }))
    final.allowed_actions = [{ type: 'submit_report', label: 'Enviar reporte final' }]
    request.mockImplementation(async ([candidate]) => {
      if (candidate.path.endsWith('/assignments')) return { assignments: [{ id: 1, assignment: { id: 2, status: 'confirmed' } }] }
      if (candidate.path.endsWith('/workflow')) return final
      return {}
    })
    wrapper = mount(CrewPortal, { props: { section: 'asignaciones' }, global: { stubs: { CrewNotificationCenter: true, CrewAvailabilitySection: true } } })
    await flushPromises()
    const close = wrapper.findAll('button').find((button) => button.text() === 'Finalizar operación')
    expect(close.attributes('disabled')).toBeDefined()
    const form = wrapper.get('.crew-close-form')
    const selects = form.findAll('select')
    await selects[0].setValue(5)
    await form.findAll('input')[0].setValue('Correcta')
    await form.findAll('input')[1].setValue('Correcto')
    await selects[1].setValue('false')
    await selects[2].setValue('false')
    expect(close.attributes('disabled')).toBeUndefined()
    await close.trigger('click')
    await flushPromises()
    expect(request).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({
      method: 'post', path: '/sobrecargo/operations/1/report', body: expect.objectContaining({
        service_rating: 5, cabin_condition: 'Correcta', catering_condition: 'Correcto', cleaning_required: false, restocking_required: false,
      }),
    })]))
  })

  it('shows only retry after workflow failure, then renders the fresh canonical flow', async () => {
    let failed = true
    request.mockImplementation(async ([candidate]) => {
      if (candidate.path.endsWith('/assignments')) return { assignments: [{ id: 1, assignment: { id: 2, status: 'confirmed' } }] }
      if (candidate.path.endsWith('/workflow')) { if (failed) throw new Error('Timeout'); return payload() }
      return {}
    })
    wrapper = mount(CrewPortal, { props: { section: 'asignaciones' }, global: { stubs: { CrewNotificationCenter: true, CrewAvailabilitySection: true } } })
    await flushPromises()
    expect(wrapper.text()).toContain('No se pudo cargar el flujo operativo.')
    expect(wrapper.find('.crew-stepper').exists()).toBe(false)
    expect(wrapper.findAll('button').some((button) => button.text() === 'Registrar llegada')).toBe(false)
    failed = false
    await wrapper.findAll('button').find((button) => button.text() === 'Reintentar').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Paso 3 · Llegada al aeropuerto')
    expect(wrapper.find('.crew-stepper').exists()).toBe(true)
  })

  it.each([false, true])('reports in a modal while preserving the workflow context (error=%s)', async (fails) => {
    if (fails) api.postForm.mockRejectedValue(new Error('No se pudo guardar la incidencia'))
    else api.postForm.mockResolvedValue({ incident: { id: 9 } })
    wrapper = mount(CrewPortal, { props: { section: 'asignaciones' }, global: { stubs: { CrewNotificationCenter: true, CrewAvailabilitySection: true } } })
    await flushPromises()
    const initialWorkflowCalls = request.mock.calls.filter(([c]) => c[0].path.endsWith('/workflow')).length
    const open = wrapper.findAll('button').find((button) => button.text() === 'Reportar incidencia')
    await open.trigger('click')
    let modal = new DOMWrapper(document.body.querySelector('dialog'))
    expect(modal.exists()).toBe(true)
    expect(wrapper.find('.crew-flight-workspace dialog').exists()).toBe(false)
    expect(modal.get('input[readonly]').element.value).toBe('Llegada al aeropuerto')
    expect(wrapper.text()).toContain('Registrar llegada')
    await modal.findAll('button').find((button) => button.text() === 'Cancelar').trigger('click')
    expect(document.body.querySelector('dialog')).toBeNull()
    expect(wrapper.text()).toContain('Paso 3 · Llegada al aeropuerto')
    expect(request.mock.calls.filter(([c]) => c[0].path.endsWith('/workflow')).length).toBe(initialWorkflowCalls)
    await open.trigger('click')
    modal = new DOMWrapper(document.body.querySelector('dialog'))
    await modal.findAll('select')[0].setValue('cabina')
    await modal.findAll('select')[1].setValue('baja')
    await modal.get('textarea').setValue('Reporte desde llegada')
    await modal.findAll('button').find((button) => button.text() === 'Enviar incidencia').trigger('click')
    await flushPromises()
    expect(api.postForm).toHaveBeenCalledTimes(1)
    expect(api.postForm.mock.calls[0][1].get('phase')).toBe('Pre-vuelo')
    expect(api.postForm.mock.calls[0][1].get('crew_operation_id')).toBe('1')
    expect(Boolean(document.body.querySelector('dialog'))).toBe(fails)
    if (fails) expect(modal.get('[role="alert"]').text()).toContain('No se pudo guardar')
    expect(push).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Paso 3 · Llegada al aeropuerto')
    expect(request.mock.calls.filter(([c]) => c[0].path.endsWith('/workflow')).length).toBe(fails ? initialWorkflowCalls : initialWorkflowCalls + 1)
  })

  it('keeps inconsistent workflow warning behind the incident modal', async () => {
    request.mockImplementation(async ([candidate]) => {
      if (candidate.path.endsWith('/assignments')) return { assignments: [{ id: 1, assignment: { id: 2, status: 'confirmed' } }] }
      if (candidate.path.endsWith('/workflow')) return { ...payload(), workflow_inconsistent: true, blocking_reason: 'Esta operación requiere regularización del flujo.', allowed_actions: [] }
      return {}
    })
    wrapper = mount(CrewPortal, { props: { section: 'asignaciones' }, global: { stubs: { CrewNotificationCenter: true, CrewAvailabilitySection: true } } })
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text() === 'Reportar incidencia').trigger('click')
    expect(document.body.querySelector('dialog')).not.toBeNull()
    expect(wrapper.text()).toContain('Esta operación requiere regularización del flujo.')
    expect(wrapper.find('.crew-stepper').exists()).toBe(true)
  })

})
