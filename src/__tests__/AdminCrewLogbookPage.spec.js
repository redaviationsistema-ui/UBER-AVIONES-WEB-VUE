// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import Page from '../features/admin/crew/logbook/AdminCrewLogbookPage.vue'
vi.mock('../lib/api', () => ({ resolveMediaUrl: (value) => value, api: { get: vi.fn() } }))
const members = [
  {
    id: 8,
    name: 'Jimena Alvarez',
    base: 'MMTO',
    raw: { profile: { avatar_url: 'https://storage.test/avatar.jpg' } },
  },
  { id: 9, name: 'Valeria Garcia' },
  { id: 10, name: 'Sin operaciones' },
]
const operations = [
  {
    id: 302,
    operationId: 46,
    crewId: 8,
    crew: 'Jimena Alvarez',
    departure: '2026-09-05T14:30:00',
    route: 'MMTO → MMQT',
    aircraft: 'Learjet 31A',
  },
  {
    id: 278,
    operationId: 52,
    crewId: 8,
    crew: 'Jimena Alvarez',
    departure: '2026-08-28T14:30:00',
    route: 'MMTO → TULM',
  },
  {
    id: 300,
    operationId: 60,
    crewId: 9,
    crew: 'Valeria Garcia',
    departure: '2026-08-20T14:30:00',
    route: 'MMTO → MMWR',
  },
]
async function setup(path, ops = operations) {
  const router = createRouter({
    history: createMemoryHistory('/renta/'),
    routes: [
      { path: '/admin/sobrecargos-bitacora', component: Page },
      { path: '/admin/sobrecargos-bitacora/:crewId/bitacora', component: Page },
    ],
  })
  await router.push(path)
  const wrapper = mount(Page, {
    props: { crewMembers: members, operations: ops, auditEntries: [] },
    global: {
      plugins: [router],
      stubs: {
        AdminCrewIndividualLogbook: {
          props: ['operation', 'crewId'],
          template:
            '<div><slot name="operation-selector" /><div class="individual-stub">{{ crewId }} / {{ operation.operationId }}</div></div>',
        },
      },
    },
  })
  await flushPromises()
  return { wrapper, router }
}
it('ends the main page at the table and opens the selected crew in another URL', async () => {
  const { wrapper, router } = await setup('/admin/sobrecargos-bitacora')
  expect(wrapper.findAll('tbody tr')).toHaveLength(3)
  expect(wrapper.find('.selected-crew-shell').exists()).toBe(false)
  expect(wrapper.find('.individual-stub').exists()).toBe(false)
  await wrapper
    .findAll('a.action-link')
    .find((link) => link.attributes('href').includes('/8/'))
    .trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.params.crewId).toBe('8')
  expect(router.currentRoute.value.query.operationId).toBe('46')
  expect(wrapper.find('table').exists()).toBe(false)
  expect(wrapper.get('.individual-stub').text()).toBe('8 / 46')
  expect(wrapper.get('.crew-avatar').attributes('src')).toBe('https://storage.test/avatar.jpg')
  expect(wrapper.find('.operations-panel').exists()).toBe(false)
  expect(wrapper.find('.master-detail-layout').exists()).toBe(false)
  expect(wrapper.findAll('.operation-selector option')).toHaveLength(2)
  await wrapper.get('.operation-selector select').setValue('52')
  await flushPromises()
  expect(wrapper.get('.individual-stub').text()).toBe('8 / 52')
  expect(router.currentRoute.value.params.crewId).toBe('8')
  await wrapper.get('a.back-link').trigger('click')
  await flushPromises()
  expect(wrapper.find('table').exists()).toBe(true)
  expect(wrapper.find('.individual-stub').exists()).toBe(false)
  wrapper.unmount()
})
it('supports direct links, browser history, missing crew and foreign operation IDs', async () => {
  const { wrapper, router } = await setup(
    '/admin/sobrecargos-bitacora/8/bitacora?operationId=52&tab=postflight',
  )
  expect(wrapper.get('.individual-stub').text()).toBe('8 / 52')
  await wrapper.get('.operation-selector select').setValue('46')
  await flushPromises()
  expect(router.currentRoute.value.query.tab).toBe('postflight')
  router.back()
  await flushPromises()
  expect(wrapper.get('.individual-stub').text()).toBe('8 / 52')
  await router.push('/admin/sobrecargos-bitacora/8/bitacora?operationId=60')
  await flushPromises()
  expect(wrapper.find('.individual-stub').exists()).toBe(false)
  expect(wrapper.text()).toContain('Operación no disponible')
  await router.push('/admin/sobrecargos-bitacora/10/bitacora')
  await flushPromises()
  expect(wrapper.text()).toContain('Sin operaciones registradas')
  expect(wrapper.get('.crew-avatar').text()).toBe('SO')
  await router.push('/admin/sobrecargos-bitacora/999/bitacora')
  await flushPromises()
  expect(wrapper.text()).toContain('Sobrecargo no disponible')
  wrapper.unmount()
})
it('selects an operation once async data arrives and does not let list filters hide the crew', async () => {
  const { wrapper, router } = await setup('/admin/sobrecargos-bitacora/8/bitacora', [])
  await wrapper.setProps({ operations })
  await flushPromises()
  expect(router.currentRoute.value.query.operationId).toBe('46')
  await router.push('/admin/sobrecargos-bitacora')
  await wrapper.get('input[type="text"]').setValue('Valeria')
  await router.push('/admin/sobrecargos-bitacora/8/bitacora')
  await flushPromises()
  expect(wrapper.get('.individual-stub').text()).toBe('8 / 46')
  wrapper.unmount()
})

it('uses the only operation automatically without any sidebar or selector', async () => {
  const { wrapper, router } = await setup('/admin/sobrecargos-bitacora/8/bitacora', [operations[0]])
  expect(router.currentRoute.value.query.operationId).toBe('46')
  expect(wrapper.get('.individual-stub').text()).toBe('8 / 46')
  expect(wrapper.find('.operation-selector').exists()).toBe(false)
  expect(wrapper.find('aside').exists()).toBe(false)
  expect(wrapper.find('.operation-row').exists()).toBe(false)
  expect(wrapper.find('.master-detail-layout').exists()).toBe(false)
  expect(wrapper.get('.selected-crew-shell > .detail-panel').exists()).toBe(true)
  wrapper.unmount()
})
it('auto-selects the active operation before a more recent inactive operation', async () => {
  const { wrapper, router } = await setup('/admin/sobrecargos-bitacora/8/bitacora', [
    operations[0],
    { ...operations[1], status: 'in_flight' },
  ])
  expect(router.currentRoute.value.query.operationId).toBe('52')
  expect(wrapper.get('.individual-stub').text()).toBe('8 / 52')
  wrapper.unmount()
})
