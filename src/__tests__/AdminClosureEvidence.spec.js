// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import Evidence from '../features/admin/AdminClosureEvidence.vue'
import { api } from '../lib/api'
vi.mock('../lib/api', () => ({ api: { get: vi.fn() } }))
const codes = ['catering_received', 'baggage_secured', 'cabin_condition']
function payload(count, id = 10) {
  return { operation_id: id, checklists: ['preflight', 'postflight'].map((type) => ({ type, items: codes.filter((code) => (code === 'cabin_condition') === (type === 'postflight')).map((code) => ({ code, evidence_files: codes.indexOf(code) < count ? [{ storage_disk: 's3', file_path: `${id}/${code}.jpg`, original_name: `${code}.jpg`, file_type: 'image/jpeg', file_url: `https://storage.test/${id}/${code}.jpg?signed=1` }] : null })) })) }
}
beforeEach(() => {
  vi.resetAllMocks()
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event('close')) }
})
for (let count = 0; count <= 3; count++) it(`shows ${count}/3 persisted evidence`, async () => {
  api.get.mockResolvedValue(payload(count))
  const wrapper = mount(Evidence, { props: { operationId: 10 } })
  await flushPromises()
  expect(wrapper.text()).toContain(`${count}/3`)
  expect(wrapper.findAll('img')).toHaveLength(count)
  expect(wrapper.findAll('.closure-grid button')).toHaveLength(count)
  wrapper.unmount()
})
it('opens and closes modal with operation metadata', async () => {
  api.get.mockResolvedValue(payload(1))
  const wrapper = mount(Evidence, { props: { operationId: 10 } })
  await flushPromises()
  await wrapper.get('.closure-grid button').trigger('click')
  expect(wrapper.get('dialog').element.open).toBe(true)
  expect(wrapper.get('dialog').text()).toContain('Operación #10')
  await wrapper.get('dialog button').trigger('click')
  expect(wrapper.get('dialog').element.open).toBe(false)
})
it('discards stale requests and refuses mismatched operation', async () => {
  let resolve
  api.get.mockReturnValueOnce(new Promise((done) => { resolve = done })).mockResolvedValueOnce(payload(2, 20))
  const wrapper = mount(Evidence, { props: { operationId: 10 } })
  await wrapper.setProps({ operationId: 20 })
  await flushPromises()
  resolve(payload(3, 10))
  await flushPromises()
  expect(wrapper.text()).toContain('2/3')
  expect(wrapper.findAll('img').every((img) => img.attributes('src').includes('/20/'))).toBe(true)
  api.get.mockResolvedValue(payload(3, 10))
  await wrapper.setProps({ operationId: 30 })
  await flushPromises()
  expect(wrapper.text()).toContain('No se pudieron cargar')
  expect(wrapper.findAll('img')).toHaveLength(0)
})
it('handles unavailable links, files, MIME and failed images', async () => {
  const response = payload(3)
  response.checklists[0].items[0].evidence_files[0].file_url = null
  response.checklists[0].items[1].evidence_files[0].file_type = 'application/pdf'
  api.get.mockResolvedValue(response)
  const wrapper = mount(Evidence, { props: { operationId: 10 } })
  await flushPromises()
  expect(wrapper.findAll('img')).toHaveLength(1)
  await wrapper.get('img').trigger('error')
  expect(wrapper.findAll('img')).toHaveLength(0)
  expect(wrapper.text()).toContain('Vista previa no disponible')
})
it.each([null, [], [{ type: 'postflight', items: null }]])('handles absent checklists %j', async (checklists) => {
  api.get.mockResolvedValue({ operation_id: 10, checklists })
  const wrapper = mount(Evidence, { props: { operationId: 10 } })
  await flushPromises()
  expect(wrapper.text()).toContain('0/3')
})
it('keeps multiple PNG files in one slot and renews failed URLs on refresh', async () => {
  const response = payload(1)
  const files = response.checklists[0].items[0].evidence_files
  files.push({ ...files[0], file_type: 'image/png', original_name: 'second.png', file_path: '10/second.png', file_url: 'https://storage.test/10/second.png?signed=1' })
  api.get.mockResolvedValue(response)
  const wrapper = mount(Evidence, { props: { operationId: 10 } })
  await flushPromises()
  expect(wrapper.text()).toContain('1/3')
  expect(wrapper.findAll('img')).toHaveLength(2)
  await wrapper.findAll('img')[0].trigger('error')
  expect(wrapper.findAll('img')).toHaveLength(1)
  await wrapper.findAll('button').find((button) => button.text() === 'Actualizar evidencias').trigger('click')
  await flushPromises()
  expect(api.get).toHaveBeenCalledTimes(2)
  expect(wrapper.findAll('img')).toHaveLength(2)
})
it('closes the viewer when changing operation', async () => {
  api.get.mockResolvedValueOnce(payload(1)).mockResolvedValueOnce(payload(0, 20))
  const wrapper = mount(Evidence, { props: { operationId: 10 } })
  await flushPromises()
  await wrapper.get('.closure-grid button').trigger('click')
  await wrapper.setProps({ operationId: 20 })
  await flushPromises()
  expect(wrapper.get('dialog').element.open).toBe(false)
  expect(wrapper.text()).toContain('0/3')
  expect(wrapper.findAll('img')).toHaveLength(0)
})
it('selects the latest checklist regardless of response order', async () => {
  const response = payload(0)
  response.checklists.forEach((group) => { group.id = 20 })
  const previous = payload(3).checklists.map((group) => ({ ...group, id: 10 }))
  response.checklists.push(...previous)
  api.get.mockResolvedValue(response)
  const wrapper = mount(Evidence, { props: { operationId: 10 } })
  await flushPromises()
  expect(wrapper.text()).toContain('0/3')
  expect(wrapper.findAll('img')).toHaveLength(0)
})
