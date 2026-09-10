// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import Page from '../features/admin/AdminIncidenciasPage.vue'
import { api } from '../lib/api'
vi.mock('../lib/api', () => ({ api: { get: vi.fn(), put: vi.fn() } }))
const incidents = [15, 16, 17].map((id) => ({
  id,
  crew_operation_id: 46,
  crew_id: 8,
  operation_departure_datetime: '2026-09-10T14:30:00',
  description: `Descripción ${id}`,
  status: 'open',
  category: 'cliente',
}))
beforeEach(() => {
  vi.resetAllMocks()
  HTMLDialogElement.prototype.close = function () {
    this.open = false
  }
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  api.get.mockImplementation(async (path) =>
    path === '/crew-operation-incidents'
      ? { incidents }
      : { operation_id: Number(path.split('/')[4]), checklists: [] },
  )
  api.put.mockImplementation(async (path, data) => ({
    incident: { ...incidents.find((item) => path.endsWith(`/${item.id}`)), ...data },
  }))
})
async function setup(path) {
  const router = createRouter({
    history: createMemoryHistory('/renta/'),
    routes: [
      { path: '/admin/incidencias', component: Page },
      { path: '/admin/incidencias/:id', component: Page },
      {
        path: '/admin/incidencias/operaciones/:operationId/sobrecargos/:crewId',
        name: 'admin-incidencias-grupo',
        component: Page,
      },
      {
        path: '/admin/incidencias/:id/evidencias',
        name: 'admin-incidencias-evidencias',
        component: Page,
      },
    ],
  })
  await router.push(path)
  const wrapper = mount(Page, { global: { plugins: [router] } })
  await flushPromises()
  return { router, wrapper }
}
it('keeps the list free of detail and links every report to both views', async () => {
  const { wrapper, router } = await setup('/admin/incidencias')
  expect(wrapper.findAll('tbody tr')).toHaveLength(1)
  expect(wrapper.get('tbody').text()).toContain('3 reportes')
  expect(wrapper.get('tbody').text()).toContain('10 Sep 2026')
  expect(wrapper.find('textarea').exists()).toBe(false)
  expect(api.get).not.toHaveBeenCalledWith('/admin/crew/operations/46/workflow')
  await wrapper.get('.group-access').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('Total reportes: 3')
  expect(wrapper.findAll('.report-access')[0].attributes('href')).toBe(
    '/renta/admin/incidencias/15',
  )
  await wrapper.findAll('.evidence-access')[0].trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/admin/incidencias/15/evidencias')
  expect(wrapper.text()).toContain('Evidencias del reporte #15')
  expect(wrapper.find('table').exists()).toBe(false)
  await wrapper.get('.evidence-footer a').trigger('click')
  await flushPromises()
  expect(wrapper.find('textarea').exists()).toBe(true)
  expect(wrapper.findAll('img')).toHaveLength(0)
  wrapper.unmount()
})
it('loads direct URLs and responds to ID changes without falling back to another report', async () => {
  const { wrapper, router } = await setup('/admin/incidencias/16')
  expect(wrapper.text()).toContain('Descripción 16')
  await router.push('/admin/incidencias/17')
  await flushPromises()
  expect(wrapper.text()).toContain('Descripción 17')
  await wrapper.get('textarea').setValue('Respuesta de prueba')
  await wrapper
    .findAll('button')
    .find((button) => button.text() === 'Resolver')
    .trigger('click')
  await flushPromises()
  expect(api.put).toHaveBeenCalledWith('/crew-operation-incidents/17', {
    status: 'resolved',
    admin_response: 'Respuesta de prueba',
  })
  await router.push('/admin/incidencias/999')
  await flushPromises()
  expect(wrapper.text()).toContain('Reporte no disponible')
  expect(wrapper.find('textarea').exists()).toBe(false)
  wrapper.unmount()
})

it('opens the complete group directly, regardless of list filters', async () => {
  const { wrapper, router } = await setup('/admin/incidencias')
  await wrapper.get('input[type="search"]').setValue('Descripción 15')
  expect(wrapper.get('tbody').text()).toContain('1 reportes')
  await wrapper.get('.group-access').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('Total reportes: 3')
  expect(wrapper.findAll('.flight-report')).toHaveLength(3)
  await router.push('/admin/incidencias/operaciones/999/sobrecargos/8')
  await flushPromises()
  expect(wrapper.text()).toContain('No hay reportes')
  wrapper.unmount()
})

it('loads a group URL directly with the real registration and flight date', async () => {
  api.get.mockImplementation(async (path) => {
    if (path === '/crew-operation-incidents') return { incidents }
    if (path.startsWith('/admin/requests?'))
      return {
        requests: [
          { operation: { id: 46 }, assigned_aircraft_id: 7, departure_datetime: '2026-09-11' },
        ],
      }
    if (path.startsWith('/admin/fleet/aircraft?'))
      return { aircraft: { data: [{ id: 7, registration: 'XA-VEE' }] } }
    throw new Error('Unexpected endpoint')
  })
  const { wrapper } = await setup('/admin/incidencias/operaciones/46/sobrecargos/8')
  expect(wrapper.text()).toContain('XA-VEE')
  expect(wrapper.text()).toContain('10 Sep 2026')
  expect(wrapper.findAll('.flight-report')).toHaveLength(3)
  wrapper.unmount()
})
it('keeps reports available when flight metadata cannot load', async () => {
  api.get.mockImplementation(async (path) => {
    if (path === '/crew-operation-incidents') return { incidents }
    throw new Error('Unavailable')
  })
  const { wrapper } = await setup('/admin/incidencias')
  expect(wrapper.get('tbody').text()).toContain('3 reportes')
  expect(wrapper.get('tbody').text()).toContain('N/D')
  expect(wrapper.get('[role="alert"]').text()).toContain('datos de vuelo')
  wrapper.unmount()
})
