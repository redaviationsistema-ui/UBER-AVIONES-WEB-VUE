// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import View from '../features/admin/crew/logbook/AdminCrewIndividualLogbook.vue'
import { api } from '../lib/api'
vi.mock('../lib/api', () => ({ api: { get: vi.fn() } }))
const checklist = (type, code, title) => ({ id: type, type, items: [{ id: code, code, title, label: title, status: 'completed', completed_at: '2026-09-05T10:00:00Z', evidence_files: [{ storage_disk: 's3', file_path: `${code}.jpg`, file_url: `https://storage.test/${code}.jpg`, file_type: 'image/jpeg', original_name: 'scaled_123.jpg' }] }] })
const workflow = { operation_id: 46, crew_status: 'in_progress', checklists: [checklist('preparation', 'uniform_ready', 'Uniforme listo'), checklist('preflight', 'catering_received', 'Catering abordado'), checklist('postflight', 'cabin_condition', 'Cabina final')], timeline: [{ id: 1, status: 'despegue', title: 'Despegue', created_at: '2026-09-05T11:00:00Z' }] }
beforeEach(() => {
  vi.resetAllMocks()
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event('close')) }
  api.get.mockImplementation(async (path) => {
    if (path.includes('/workflow')) return workflow
    if (path.startsWith('/admin/requests?')) return { requests: [] }
    if (path.startsWith('/crew-operation-incidents?')) return { incidents: [
      { id: 15, crew_operation_id: 46, crew_id: 8, category: 'cliente', priority: 'baja', status: 'open', description: 'Reporte correcto' },
      { id: 16, crew_operation_id: 46, crew_id: 9, description: 'Otro sobrecargo' },
      { id: 17, crew_operation_id: 52, crew_id: 8, description: 'Otra operación' },
    ] }
    throw new Error('Unexpected endpoint')
  })
})
async function setup() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/admin/sobrecargos-bitacora/:crewId/bitacora', component: View }, { path: '/admin/incidencias/:id/:sub?', component: { template: '<div />' } }] })
  await router.push('/admin/sobrecargos-bitacora/8/bitacora?operationId=46')
  const wrapper = mount(View, { props: { crewId: '8', operation: { id: 302, operationId: 46, crewId: 8, crew: 'Jimena', departure: '2026-09-05', aircraft: 'Learjet', route: 'MMTO → MMQT' }, formatDateTime: (value) => value }, global: { plugins: [router] } })
  await flushPromises()
  const tab = async (label) => { await wrapper.findAll('nav button').find((button) => button.text() === label).trigger('click'); await flushPromises() }
  return { wrapper, router, tab }
}
it('renders only the selected stage and keeps operation/crew IDs on every tab', async () => {
  const { wrapper, router, tab } = await setup()
  expect(wrapper.find('.summary-view').exists()).toBe(true)
  expect(wrapper.findAll('.checklist-item')).toHaveLength(0)
  expect(wrapper.findAll('img')).toHaveLength(0)
  for (const [name, expected] of [['Preparación', 'Uniforme listo'], ['Pre-vuelo', 'Catering abordado'], ['Post-vuelo', 'Cabina final']]) {
    await tab(name)
    expect(wrapper.find('.summary-view').exists()).toBe(false)
    expect(wrapper.findAll('.stage-block')).toHaveLength(1)
    expect(wrapper.get('.stage-block').text()).toContain(expected)
    expect(wrapper.find('.support-grid').exists()).toBe(false)
    expect(router.currentRoute.value.params.crewId).toBe('8')
    expect(router.currentRoute.value.query.operationId).toBe('46')
  }
  await tab('Seguimiento')
  expect(wrapper.findAll('.checklist-item')).toHaveLength(0)
  expect(wrapper.findAll('.timeline-item').every((item) => item.text().includes('2026-09-05'))).toBe(true)
  wrapper.unmount()
})
it('shows actual evidence only in its tab and filters incidents by both IDs', async () => {
  const { wrapper, tab } = await setup()
  await tab('Evidencias')
  expect(wrapper.findAll('img')).toHaveLength(2)
  expect(wrapper.findAll('img')[0].attributes('src')).toBe('https://storage.test/catering_received.jpg')
  expect(wrapper.text()).toContain('2/3')
  expect(wrapper.text()).not.toContain('scaled_123')
  await tab('Incidencias')
  expect(wrapper.findAll('img')).toHaveLength(0)
  expect(wrapper.findAll('.report-card')).toHaveLength(1)
  expect(wrapper.text()).toContain('Reporte correcto')
  expect(wrapper.text()).not.toContain('Otro sobrecargo')
  expect(wrapper.text()).not.toContain('Otra operación')
  expect(wrapper.get('.report-links a').attributes('href')).toBe('/admin/incidencias/15')
  expect(api.get).toHaveBeenCalledWith('/crew-operation-incidents?crew_operation_id=46&crew_id=8')
  wrapper.unmount()
})
it('shows request failures instead of claiming zero incidents', async () => {
  api.get.mockRejectedValue(new Error('Offline'))
  const { wrapper, tab } = await setup()
  await tab('Incidencias')
  expect(wrapper.text()).toContain('No se pudieron cargar las incidencias')
  expect(wrapper.text()).not.toContain('Total: 0')
  wrapper.unmount()
})
