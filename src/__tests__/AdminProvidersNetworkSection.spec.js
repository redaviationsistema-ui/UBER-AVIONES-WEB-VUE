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

function buildApprovedDocument(documentSlot, id) {
  return {
    id,
    document_slot: documentSlot,
    status: 'approved',
    reviewed_at: '2026-07-09T10:00:00Z',
    reviewed_by: 'Administrador',
    file_name: `${documentSlot}.pdf`,
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

async function openProviderReviewByName(wrapper, companyName) {
  const cards = wrapper.findAll('.provider-card')
  const targetCard = cards.find((card) => card.text().includes(companyName))
  if (!targetCard) throw new Error(`Provider card not found for ${companyName}`)
  await targetCard.find('button.provider-link-secondary').trigger('click')
  await Promise.resolve()
  await Promise.resolve()
}

function findButtonByText(wrapper, text) {
  return wrapper.findAll('button').find((button) => button.text().includes(text))
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

  it('enables admin actions from backend validation requirements even when auxiliary columns are null', async () => {
    pushToast.mockReset()
    requestWithCandidates.mockReset()

    const wrapper = stubbedMount({
      providers: [
        {
          id: 77,
          company_name: 'Operador Validable',
          legal_name: 'Operador Validable SA de CV',
          representative_name: 'Valeria Ruiz',
          company_email: 'operador@test.com',
          company_phone: '5551112233',
          rfc: 'OPV770101AAA',
          base_airport: 'MMMX',
          admin_validation_status: null,
          review_status: null,
          approval_status: null,
          operator_status: null,
          access_enabled: false,
          validation_requirements: [
            { key: 'company_identity', label: 'Datos de empresa completos', complete: true, response_status: 'approved' },
            { key: 'rfc_valid', label: 'RFC valido', complete: true, response_status: 'approved' },
            { key: 'sat_validation', label: 'Validacion SAT', complete: true, response_status: 'aprobado' },
            { key: 'legal_documents_approved', label: 'Documentacion legal aprobada', complete: true, response_status: 'approved' },
            { key: 'base_operativa', label: 'Base operativa definida', complete: true, response_status: 'aprobado' },
            { key: 'aircraft_active', label: 'Aeronave activa o aprobada', complete: true, response_status: 'approved' },
            { key: 'contact_complete', label: 'Datos de contacto completos', complete: true, response_status: 'approved' },
            { key: 'legal_representative_complete', label: 'Representante legal completo', complete: true, response_status: 'approved' },
          ],
          documents: [
            buildApprovedDocument('sat_certificate', 'sat-1'),
            buildApprovedDocument('articles_of_incorporation', 'legal-1'),
            buildApprovedDocument('legal_representative_power', 'legal-2'),
            buildApprovedDocument('legal_representative_id', 'legal-3'),
            buildApprovedDocument('tax_address_proof', 'legal-4'),
            buildApprovedDocument('operational_permit', 'legal-5'),
          ],
        },
        {
          id: 78,
          company_name: 'Operador En Revision',
          legal_name: 'Operador En Revision SA de CV',
          company_email: 'revision@test.com',
          company_phone: '5552223344',
          rfc: 'REV780101AAA',
          base_airport: 'MMGL',
          review_status: 'pending_review',
          validation_requirements: [
            { key: 'sat_validation', label: 'Validacion SAT', complete: true, response_status: 'approved' },
          ],
        },
        {
          id: 79,
          company_name: 'Operador Aprobado',
          legal_name: 'Operador Aprobado SA de CV',
          company_email: 'aprobado@test.com',
          company_phone: '5553334455',
          rfc: 'APR790101AAA',
          base_airport: 'MMTO',
          approval_status: 'approved',
          access_enabled: true,
          validation_requirements: [
            { key: 'sat_validation', label: 'Validacion SAT', complete: true, response_status: 'approved' },
          ],
        },
      ],
      aircraft: [{ id: 701, provider_id: 77, registration: 'XA-VAL', status: 'active', approved: true }],
    })

    await openProviderReviewByName(wrapper, 'Operador Validable')

    let validateButton = findButtonByText(wrapper, 'Validar operador')
    let requestChangesButton = findButtonByText(wrapper, 'Solicitar cambios')
    expect(validateButton?.attributes('disabled')).toBeUndefined()
    expect(requestChangesButton?.attributes('disabled')).toBeUndefined()

    await openProviderReviewByName(wrapper, 'Operador En Revision')

    const cancelButton = findButtonByText(wrapper, 'Cancelar validación')
    expect(cancelButton?.attributes('disabled')).toBeUndefined()

    await openProviderReviewByName(wrapper, 'Operador Aprobado')

    const aircraftButton = findButtonByText(wrapper, 'Revisar aeronaves')
    expect(aircraftButton?.attributes('disabled')).toBeUndefined()
  })

  it('shows approved requirements as complete even when backend sends complete null', async () => {
    pushToast.mockReset()
    requestWithCandidates.mockReset()

    const wrapper = stubbedMount({
      providers: [
        {
          id: 91,
          company_name: 'Operador Consistente',
          rfc: 'RFC910101AAA',
          validation_requirements: [
            {
              key: 'rfc_valid',
              label: 'RFC valido',
              complete: null,
              response_status: 'approved',
              actor_name: 'Administrador',
            },
          ],
        },
      ],
    })

    await openProviderReviewByName(wrapper, 'Operador Consistente')

    const validationCard = wrapper
      .findAll('.admin-validation-check')
      .find((card) => card.text().includes('RFC valido'))
    expect(validationCard).toBeTruthy()

    const validationCardWrapper = validationCard
    expect(validationCard.text()).toContain('Dato completo')
    expect(validationCard.text()).toContain('Aprobado por administracion')
    expect(validationCardWrapper?.find('button').attributes('disabled')).toBeUndefined()
  })

  it('does not post manual requirement decisions for legal document aggregate requirement', async () => {
    pushToast.mockReset()
    requestWithCandidates.mockReset()

    const wrapper = stubbedMount({
      providers: [
        {
          id: 105,
          company_name: 'Operador Legal',
          documents: [
            buildApprovedDocument('articles_of_incorporation', 'legal-1'),
            buildApprovedDocument('legal_representative_power', 'legal-2'),
            buildApprovedDocument('legal_representative_id', 'legal-3'),
            buildApprovedDocument('tax_address_proof', 'legal-4'),
            buildApprovedDocument('operational_permit', 'legal-5'),
          ],
        },
      ],
    })

    await openProviderReviewByName(wrapper, 'Operador Legal')

    const validationCard = wrapper
      .findAll('.admin-validation-check')
      .find((card) => card.text().includes('Documentacion legal aprobada'))
    expect(validationCard).toBeTruthy()
    requestWithCandidates.mockClear()

    const buttons = validationCard?.findAll('button') || []
    expect(buttons[0]?.attributes('disabled')).toBeDefined()
    expect(buttons[1]?.attributes('disabled')).toBeDefined()
    expect(validationCard?.text()).toContain('se sincroniza automaticamente con los documentos legales')
    expect(requestWithCandidates).not.toHaveBeenCalled()
  })
})
