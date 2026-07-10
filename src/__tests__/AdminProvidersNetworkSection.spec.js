/* @vitest-environment jsdom */

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

const { pushToast, routerPush, requestWithCandidates } = vi.hoisted(() => ({
  pushToast: vi.fn(),
  routerPush: vi.fn(),
  requestWithCandidates: vi.fn(),
}))

vi.mock('../stores/ui', () => ({
  useUiStore: () => ({
    pushToast,
  }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: routerPush,
  }),
}))

vi.mock('../lib/backendCrud', async () => {
  const actual = await vi.importActual('../lib/backendCrud')
  return {
    ...actual,
    requestWithCandidates,
  }
})

import AdminProvidersNetworkSection from '../features/admin/AdminProvidersNetworkSection.vue'

function buildProvider(id, companyName) {
  return {
    id,
    company_name: companyName,
    representative_name: `Representante ${id}`,
    base_airport: `MM0${id}`,
    company_email: `proveedor${id}@test.com`,
    company_phone: `555000000${id}`,
    rfc: `RFC000${id}`,
    documents: [],
  }
}

function stubbedMount(props = {}) {
  return mount(AdminProvidersNetworkSection, {
    props: {
      providers: [],
      aircraft: [],
      ...props,
    },
    global: {
      stubs: {
        CompanyCommercialCard: {
          template: '<div class="stub-commercial">{{ title }} {{ items.map((item) => item.value).join(" | ") }}</div>',
          props: ['title', 'items'],
        },
        CompanyProfileCard: {
          template: '<div class="stub-company">{{ title }} {{ items.map((item) => item.value).join(" | ") }}</div>',
          props: ['title', 'items'],
        },
        FleetSummary: {
          template: '<div class="stub-fleet">{{ title }}</div>',
          props: ['title'],
        },
        OperatorDocumentDrawer: true,
        OperatorDocumentList: {
          template: '<div class="stub-documents">{{ title }} {{ documents.length }} {{ documents.map((item) => item.definitionLabel || item.name || item.fileName).join(" | ") }} {{ documents.map((item) => item.status).join(" | ") }}</div>',
          props: ['title', 'documents'],
        },
        OperatorValidationSummary: {
          template: '<div class="stub-summary">{{ badgeLabel }}</div>',
          props: ['badgeLabel'],
        },
        OperatorActivityTimeline: {
          template: '<div class="stub-activity">{{ title }}</div>',
          props: ['title'],
        },
      },
    },
  })
}

function abortablePendingPromise(signal) {
  return new Promise((_, reject) => {
    if (signal?.aborted) {
      const error = new Error('The operation was aborted.')
      error.name = 'AbortError'
      reject(error)
      return
    }

    signal?.addEventListener(
      'abort',
      () => {
        const error = new Error('The operation was aborted.')
        error.name = 'AbortError'
        reject(error)
      },
      { once: true },
    )
  })
}

describe('AdminProvidersNetworkSection', () => {
  it('keeps the latest provider detail visible when a previous request is aborted', async () => {
    pushToast.mockReset()
    routerPush.mockReset()
    requestWithCandidates.mockReset()

    requestWithCandidates.mockImplementation((candidates, requestOptions = {}) => {
      const firstPath = String(candidates?.[0]?.path || '')

      if (firstPath.includes('/admin/providers/1/')) {
        return abortablePendingPromise(requestOptions.signal)
      }

      if (firstPath.includes('/admin/providers/2/detail')) {
        return Promise.resolve({
          provider: {
            ...buildProvider(2, 'Proveedor Dos Detalle'),
            legal_name: 'Proveedor Dos Legal',
          },
        })
      }

      if (firstPath.includes('/admin/providers/2/documents')) {
        return Promise.resolve({ documents: [] })
      }

      if (firstPath.includes('/admin/providers/2/activity')) {
        return Promise.resolve({ activity: [] })
      }

      return Promise.resolve({})
    })

    const wrapper = stubbedMount({
      providers: [buildProvider(1, 'Proveedor Uno'), buildProvider(2, 'Proveedor Dos')],
    })

    const reviewButtons = wrapper.findAll('button.provider-link-secondary')
    await reviewButtons[0].trigger('click')
    await reviewButtons[1].trigger('click')
    await Promise.resolve()
    await Promise.resolve()

    const modal = wrapper.get('[aria-label="Detalle de proveedor"]')

    expect(modal.text()).toContain('Proveedor Dos Detalle')
    expect(modal.text()).not.toContain('Proveedor UnoRepresentante')
    expect(pushToast).not.toHaveBeenCalled()
    expect(requestWithCandidates).toHaveBeenCalled()
  })

  it('reads admin provider fields and legacy documents from nested tax_data', async () => {
    pushToast.mockReset()
    requestWithCandidates.mockReset()

    const wrapper = stubbedMount({
      providers: [
        {
          id: 26,
          company_name: 'SAE',
          user: {
            profile: {
              address: 'Direccion demo',
              tax_data: {
                legal_name: 'SAE RAZON SOCIAL',
                rfc: 'RFC123456789',
                legal_representative: 'SAE COMPLETO',
                sat_validation_status: 'approved',
                documents: [
                  {
                    id: 'sat-1',
                    name: 'Constancia de situacion fiscal',
                    state: 'aprobado',
                    document_slot: 'sat_certificate',
                  },
                ],
              },
            },
          },
        },
      ],
    })

    await wrapper.find('button.provider-link-secondary').trigger('click')
    await Promise.resolve()

    const modal = wrapper.get('[aria-label="Detalle de proveedor"]')

    expect(modal.text()).toContain('SAE RAZON SOCIAL')
    expect(modal.text()).toContain('RFC123456789')
    expect(modal.text()).toContain('SAE COMPLETO')
    expect(modal.text()).toContain('Documentacion legal 1')
    expect(modal.text()).toContain('aprobado')
  })
})
