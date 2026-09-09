/* @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const { request, push, toast } = vi.hoisted(() => ({
  request: vi.fn(),
  push: vi.fn(),
  toast: vi.fn(),
}))
vi.mock('../lib/backendCrud', async () => ({
  ...(await vi.importActual('../lib/backendCrud')),
  requestWithCandidates: request,
}))
vi.mock('../lib/api', () => ({ api: { get: vi.fn(async () => ({})), postForm: vi.fn() } }))
vi.mock('../lib/workflowSync', () => ({ subscribeWorkflowSync: () => () => {} }))
vi.mock('../stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 8, name: 'Tripulante' }, syncUserContext: vi.fn() }),
}))
vi.mock('../stores/ui', () => ({ useUiStore: () => ({ pushToast: toast }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
import CrewPortal from '../features/crew/CrewPortal.vue'
import { api } from '../lib/api'

let wrapper
let checkedIn
const group = (type, completed) => ({
  id: type,
  type,
  items: [
    {
      id: type,
      code: type,
      label: type,
      status: completed ? 'completed' : 'pending',
      is_required: true,
    },
  ],
})
function payload() {
  return {
    operation_id: 1,
    assignment_id: 2,
    assignment_status: 'confirmed',
    crew_status: checkedIn ? 'checked_in' : 'ready_for_operation',
    checklists: [group('preparation', true), group('preflight', false), group('postflight', false)],
    timeline: checkedIn ? [{ status: 'crew_checkin', created_at: '2026-09-07T10:00:00Z' }] : [],
    checkin: checkedIn ? { recorded_at: '2026-09-07T10:00:00Z', actor_name: 'Tripulante' } : null,
    editable_checklists: [],
    allowed_actions: checkedIn
      ? [
          {
            type: 'start_preflight',
            status: 'preflight_in_progress',
            label: 'Iniciar checklist pre-vuelo',
          },
        ]
      : [{ type: 'crew_checkin', label: 'Registrar llegada' }],
  }
}
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function () {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn()
  api.postForm.mockReset()
  push.mockClear()
  checkedIn = false
  request.mockReset()
  request.mockImplementation(async ([candidate]) => {
    if (candidate.path.endsWith('/assignments'))
      return {
        assignments: [
          { id: 1, assignment: { id: 2, status: 'confirmed' }, workflow_status: 'boarding' },
        ],
      }
    if (candidate.path.endsWith('/workflow')) return payload()
    if (candidate.path.endsWith('/checkin')) {
      checkedIn = true
      return {}
    }
    return {}
  })
})
afterEach(() => {
  wrapper?.unmount()
  vi.restoreAllMocks()
})

it.each([
  [0, 'preflight', 100, 'Catering'],
  [1, 'preflight', 101, 'Equipaje'],
  [2, 'postflight', 123, 'Cabina final'],
])(
  'preserves selection, upload and persistence for %s: %s/%s (%s)',
  async (slot, checklistType, itemId, label) => {
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:audit'), revokeObjectURL: vi.fn() }),
    )
    const state = payload()
    state.allowed_actions = []
    state.crew_status = 'postflight_pending'
    state.current_step = 'postflight'
    state.editable_checklists = ['postflight']
    state.editable_evidence = ['catering_received', 'baggage_secured', 'cabin_condition']
    state.checkin = { recorded_at: '2026-09-08T10:00:00Z' }
    state.timeline = [
      'crew_checkin',
      'cabina_lista',
      'boarding',
      'pasajeros_recibidos',
      'in_flight',
      'landed',
      'postflight_pending',
    ].map((status) => ({ status, created_at: '2026-09-08T10:00:00Z' }))
    state.checklists = [
      group('preparation', true),
      group('preflight', true),
      {
        id: 30,
        type: 'postflight',
        status: 'pending',
        items: [
          {
            id: 123,
            code: 'cabin_condition',
            label: 'Condicion final de cabina',
            status: 'pending',
            is_required: true,
            evidence_files: [],
          },
        ],
      },
    ]
    state.checklists[1].items = ['catering_received', 'baggage_secured'].map((code, index) => ({
      id: 100 + index,
      code,
      label: code,
      status: 'completed',
      is_required: true,
      evidence_files: [],
    }))
    const checklist = state.checklists[checklistType === 'preflight' ? 1 : 2]
    const entry = checklist.items.find((item) => item.id === itemId)
    request.mockImplementation(async ([c]) =>
      c.path.endsWith('/assignments')
        ? { assignments: [{ id: 1, assignment: { id: 2, status: 'confirmed' } }] }
        : c.path.endsWith('/workflow')
          ? structuredClone(state)
          : {},
    )
    let finishUpload
    const uploadGate = new Promise((resolve) => {
      finishUpload = resolve
    })
    api.postForm.mockImplementation(async () => {
      await uploadGate
      entry.evidence_files = [
        {
          storage_disk: 's3',
          file_path: 'crew/checklists/1/postflight/123/audit.jpg',
          original_name: 'cabina.jpg',
          file_type: 'image/jpeg',
          size: 3,
          file_url: 'https://audit.invalid/cabina.jpg',
        },
      ]
      return {
        success: true,
        checklist: structuredClone(checklist),
        item: structuredClone(entry),
      }
    })
    wrapper = mount(CrewPortal, {
      props: { section: 'asignaciones' },
      global: { stubs: { CrewNotificationCenter: true, CrewAvailabilitySection: true } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('Cabina final')
    expect(wrapper.text()).toContain('Evidencias 0/3')
    const card = () => wrapper.findAll('.crew-evidence-section .crew-evidence-card')[slot]
    const button = (text) =>
      card()
        .findAll('button')
        .find((element) => element.text() === text)
    const input = card().get('.crew-evidence-input')
    const picker = vi.spyOn(input.element, 'click')
    expect(card().text()).toContain(label)
    await button('Agregar evidencia').trigger('click')
    expect(picker).toHaveBeenCalledTimes(1)
    const file = new File(['abc'], 'cabina.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await flushPromises()
    expect(button('Agregar evidencia')).toBeUndefined()
    await button('Cambiar foto').trigger('click')
    expect(picker).toHaveBeenCalledTimes(2)
    const replacement = new File(['replacement'], 'otra-foto.webp', { type: 'image/webp' })
    Object.defineProperty(input.element, 'files', { value: [replacement], configurable: true })
    await input.trigger('change')
    expect(card().get('.crew-evidence-preview__meta').text()).toContain('otra-foto.webp')
    expect(card().get('.crew-evidence-preview__meta small').text()).not.toBe('')
    expect(URL.revokeObjectURL).toHaveBeenCalled()
    await button('Eliminar').trigger('click')
    expect(card().find('.crew-evidence-preview').exists()).toBe(false)
    expect(card().get('.badge').text()).toBe('Pendiente')
    expect(api.postForm).not.toHaveBeenCalled()
    await button('Agregar evidencia').trigger('click')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    expect(api.postForm).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Pendiente de subir')
    expect(wrapper.text()).toContain('Evidencias 0/3')
    expect(wrapper.get('.crew-evidence-preview img').attributes('src')).toBe('blob:audit')
    api.postForm.mockRejectedValueOnce(new Error(JSON.stringify({ status: 500, code: 'http_500', message: 'No fue posible guardar la evidencia.', validationErrors: {}, retriable: true })))
    await button('Subir evidencia').trigger('click')
    await flushPromises()
    expect(card().get('.crew-evidence-preview__meta').text()).toContain('cabina.jpg')
    expect(card().get('.badge').text()).toBe('Pendiente de subir')
    expect(card().get('.crew-evidence-feedback--error').text()).toBe('No fue posible subir la evidencia. Intenta nuevamente.')
    expect(wrapper.text()).not.toContain('http_500')
    expect(wrapper.text()).not.toContain('validationErrors')
    expect(wrapper.text()).toContain('Evidencias 0/3')
    api.postForm.mockClear()
    const before = request.mock.calls.filter(([c]) => c[0].path.endsWith('/workflow')).length
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Subir evidencia')
      .trigger('click')
    await flushPromises()
    expect(card().attributes('aria-busy')).toBe('true')
    expect(button('Subiendo...').element.disabled).toBe(true)
    expect(button('Cambiar foto').element.disabled).toBe(true)
    expect(button('Eliminar').element.disabled).toBe(true)
    await button('Subiendo...').trigger('click')
    expect(api.postForm).toHaveBeenCalledTimes(1)
    finishUpload()
    await flushPromises()
    expect(api.postForm).toHaveBeenCalledTimes(1)
    const [url, data] = api.postForm.mock.calls[0]
    expect(url).toBe(
      `/sobrecargo/operations/1/checklists/${checklistType}/items/${itemId}/evidence`,
    )
    expect(data.get('file').type).toBe('image/jpeg')
    expect(data).toBeInstanceOf(FormData)
    expect(data.get('file')).toBe(file)
    expect([...data.keys()]).toEqual(['file'])
    expect(
      request.mock.calls.filter(([c]) => c[0].path.endsWith('/workflow')).length,
    ).toBeGreaterThan(before)
    expect(wrapper.text()).toContain('Evidencias 1/3')
    expect(wrapper.get('.crew-evidence-preview--stored img').attributes('src')).toBe(
      'https://audit.invalid/cabina.jpg',
    )
    const reopen = async () => {
      wrapper.unmount()
      wrapper = mount(CrewPortal, {
        props: { section: 'asignaciones' },
        global: { stubs: { CrewNotificationCenter: true, CrewAvailabilitySection: true } },
      })
      await flushPromises()
    }
    await reopen()
    expect(wrapper.text()).toContain('Evidencias 1/3')
    expect(wrapper.get('.crew-evidence-preview--stored img').attributes('src')).toBe(
      'https://audit.invalid/cabina.jpg',
    )
    let completed = 1
    for (const other of [...state.checklists[1].items, ...state.checklists[2].items]) {
      if (other === entry) continue
      other.evidence_files = structuredClone(entry.evidence_files)
      await reopen()
      expect(wrapper.text()).toContain(`Evidencias ${++completed}/3`)
    }
  },
)
