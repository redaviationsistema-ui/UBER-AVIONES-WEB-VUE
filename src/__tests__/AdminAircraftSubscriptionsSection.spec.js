/* @vitest-environment jsdom */

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

const { routerReplace, routerPush } = vi.hoisted(() => ({
  routerReplace: vi.fn(),
  routerPush: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({
    query: {},
  }),
  useRouter: () => ({
    push: routerPush,
    replace: routerReplace,
  }),
}))

import AdminAircraftSubscriptionsSection from '../features/admin/AdminAircraftSubscriptionsSection.vue'

function buildAircraft(overrides = {}) {
  return {
    id: 31,
    provider_id: 26,
    provider_name: 'SAE',
    registration: 'XB XSX',
    model: 'LEAR JET 31',
    manufacturer: 'LEAR JET',
    base: 'TOLUCA',
    status: 'active',
    capacity: 8,
    hourly_rate: 120000,
    range_km: 2400,
    images: [],
    documents: [],
    ...overrides,
  }
}

function mountSection(aircraft = []) {
  return mount(AdminAircraftSubscriptionsSection, {
    props: {
      aircraft,
      subscriptions: [],
    },
    global: {
      stubs: {
        Transition: false,
      },
    },
  })
}

async function openDocumentationDetail(wrapper) {
  await openAircraftDetail(wrapper)
  const documentsTab = wrapper
    .findAll('.detail-tabs button')
    .find((button) => button.text().includes('Documentacion'))
  await documentsTab.trigger('click')
}

async function openAircraftDetail(wrapper) {
  await wrapper.get('.aircraft-card').trigger('click')
}

describe('AdminAircraftSubscriptionsSection', () => {
  it('case 1: shows docs pendientes when uploaded files are still pending', async () => {
    const wrapper = mountSection([
      buildAircraft({
        images: [{ id: 'photo-1', url: 'https://cdn.test/foto.jpg' }],
        documents: [
          {
            id: 'doc-airworthiness',
            document_type: 'airworthiness_certificate',
            document_name: 'aeronavegabilidad.pdf',
            status: 'pending',
          },
          {
            id: 'doc-registration',
            document_type: 'matricula_aeronave',
            document_name: 'matricula.pdf',
            status: 'pending',
          },
          {
            id: 'doc-insurance',
            document_type: 'insurance_policy',
            document_name: 'seguro.pdf',
            status: 'pending',
          },
          {
            id: 'doc-maintenance',
            document_type: 'maintenance_sticker',
            document_name: 'MMTO-KLAS.pdf',
            status: 'pending',
          },
        ],
      }),
    ])

    await openDocumentationDetail(wrapper)

    const cards = wrapper.findAll('.document-summary-card')
    const completedCards = wrapper.findAll('.document-summary-card.complete')

    expect(cards).toHaveLength(5)
    expect(completedCards).toHaveLength(1)
    expect(completedCards[0].text()).toContain('Fotografias')
    expect(cards.find((card) => card.text().includes('Mantenimiento'))?.text()).toContain('Pendiente')
    expect(wrapper.text()).toContain('Docs pendientes')
    expect(wrapper.text()).toContain('Pendiente')
  })

  it('case 2: shows documentacion incompleta when a required document is missing', async () => {
    const wrapper = mountSection([
      buildAircraft({
        images: [{ id: 'photo-1', url: 'https://cdn.test/foto.jpg' }],
        documents: [
          {
            id: 'doc-airworthiness',
            document_type: 'airworthiness_certificate',
            document_name: 'aeronavegabilidad.pdf',
            status: 'approved',
          },
          {
            id: 'doc-registration',
            document_type: 'matricula_aeronave',
            document_name: 'matricula.pdf',
            status: 'approved',
          },
          {
            id: 'doc-maintenance',
            document_type: 'maintenance_sticker',
            document_name: 'MMTO-KLAS.pdf',
            status: 'approved',
          },
        ],
      }),
    ])

    await openAircraftDetail(wrapper)

    expect(wrapper.text()).toContain('Documentacion incompleta')
    expect(wrapper.text()).toContain('Listo para cotizar: No')
    expect(wrapper.text()).toContain('Listo para reservar: No')
    expect(wrapper.text()).toContain('Documentacion incompleta.')
  })

  it('case 3: marks documents as valid only when all required requirements have an approved document', async () => {
    const wrapper = mountSection([
      buildAircraft({
        images: [{ id: 'photo-1', url: 'https://cdn.test/foto.jpg' }],
        documents: [
          {
            id: 'doc-airworthiness',
            document_type: 'airworthiness_certificate',
            document_name: 'aeronavegabilidad.pdf',
            status: 'approved',
          },
          {
            id: 'doc-registration',
            document_type: 'matricula_aeronave',
            document_name: 'matricula.pdf',
            status: 'aprobado',
          },
          {
            id: 'doc-insurance',
            document_type: 'insurance_policy',
            document_name: 'seguro.pdf',
            status: 'vigente',
          },
          {
            id: 'doc-maintenance',
            document_type: 'maintenance_sticker',
            document_name: 'MMTO-KLAS.pdf',
            status: 'approved',
          },
        ],
      }),
    ])

    await openDocumentationDetail(wrapper)

    expect(wrapper.findAll('.document-summary-card.complete')).toHaveLength(5)
    expect(wrapper.text()).toContain('Docs validos')
    expect(wrapper.text()).toContain('5/5')
    expect(wrapper.text()).toContain('100%')
  })

  it('case 4: shows docs rechazados when any required document is rejected', async () => {
    const wrapper = mountSection([
      buildAircraft({
        images: [{ id: 'photo-1', url: 'https://cdn.test/foto.jpg' }],
        documents: [
          {
            id: 'doc-airworthiness',
            document_type: 'airworthiness_certificate',
            document_name: 'aeronavegabilidad.pdf',
            status: 'approved',
          },
          {
            id: 'doc-registration',
            document_type: 'matricula_aeronave',
            document_name: 'matricula.pdf',
            status: 'approved',
          },
          {
            id: 'doc-insurance',
            document_type: 'insurance_policy',
            document_name: 'seguro.pdf',
            status: 'rejected',
          },
          {
            id: 'doc-maintenance',
            document_type: 'maintenance_sticker',
            document_name: 'MMTO-KLAS.pdf',
            status: 'approved',
          },
        ],
      }),
    ])

    await openDocumentationDetail(wrapper)

    expect(wrapper.text()).toContain('Docs rechazados')
    expect(wrapper.text()).toContain('Rechazado')
  })

  it('case 5: shows docs vencidos when any required document is expired', async () => {
    const wrapper = mountSection([
      buildAircraft({
        images: [{ id: 'photo-1', url: 'https://cdn.test/foto.jpg' }],
        documents: [
          {
            id: 'doc-airworthiness',
            document_type: 'airworthiness_certificate',
            document_name: 'aeronavegabilidad.pdf',
            status: 'approved',
          },
          {
            id: 'doc-registration',
            document_type: 'matricula_aeronave',
            document_name: 'matricula.pdf',
            status: 'approved',
          },
          {
            id: 'doc-insurance',
            document_type: 'insurance_policy',
            document_name: 'seguro.pdf',
            status: 'expired',
          },
          {
            id: 'doc-maintenance',
            document_type: 'maintenance_sticker',
            document_name: 'MMTO-KLAS.pdf',
            status: 'approved',
          },
        ],
      }),
    ])

    await openDocumentationDetail(wrapper)

    expect(wrapper.text()).toContain('Docs vencidos')
    expect(wrapper.text()).toContain('Vencido')
  })

  it('case 6: ignores documents_valid=true when the real document status is pending', async () => {
    const wrapper = mountSection([
      buildAircraft({
        documents_valid: true,
        images: [{ id: 'photo-1', url: 'https://cdn.test/foto.jpg' }],
        documents: [
          {
            id: 'doc-airworthiness',
            document_type: 'airworthiness_certificate',
            document_name: 'aeronavegabilidad.pdf',
            status: 'approved',
          },
          {
            id: 'doc-registration',
            document_type: 'matricula_aeronave',
            document_name: 'matricula.pdf',
            status: 'approved',
          },
          {
            id: 'doc-insurance',
            document_type: 'insurance_policy',
            document_name: 'seguro.pdf',
            status: 'pending',
          },
          {
            id: 'doc-maintenance',
            document_type: 'maintenance_sticker',
            document_name: 'MMTO-KLAS.pdf',
            status: 'approved',
          },
        ],
      }),
    ])

    await openAircraftDetail(wrapper)

    expect(wrapper.text()).toContain('Docs pendientes')
    expect(wrapper.text()).toContain('Listo para cotizar: No')
    expect(wrapper.text()).toContain('Documentacion pendiente.')
  })

  it('associates checklist requirements using document_category when document_type is absent', async () => {
    const wrapper = mountSection([
      buildAircraft({
        images: [{ id: 'photo-1', url: 'https://cdn.test/foto.jpg' }],
        documents: [
          {
            id: 'doc-airworthiness',
            category: 'airworthiness_certificate',
            document_name: 'certificado.pdf',
            status: 'approved',
          },
          {
            id: 'doc-registration',
            category: 'matricula_aeronave',
            document_name: 'matricula.pdf',
            status: 'approved',
          },
          {
            id: 'doc-insurance',
            category: 'insurance_policy',
            document_name: 'seguro.pdf',
            status: 'approved',
          },
          {
            id: 'doc-maintenance',
            category: 'maintenance_sticker',
            document_name: 'MMTO-KLAS.pdf',
            status: 'approved',
          },
        ],
      }),
    ])

    await openDocumentationDetail(wrapper)

    expect(wrapper.text()).toContain('Docs validos')
    expect(wrapper.findAll('.document-summary-card.complete')).toHaveLength(5)
  })

  it('deduplicates visual duplicates by storage_path without mixing maintenance into other requirements', async () => {
    const wrapper = mountSection([
      buildAircraft({
        images: [{ id: 'photo-1', url: 'https://cdn.test/foto.jpg' }],
        documents: [
          {
            id: 'doc-maintenance-a',
            document_type: 'maintenance_sticker',
            storage_path: 'docs/mmto-klas.pdf',
            document_name: 'MMTO-KLAS.pdf',
            status: 'approved',
          },
          {
            id: 'doc-maintenance-b',
            document_type: 'maintenance_sticker',
            storage_path: 'docs/mmto-klas.pdf',
            document_name: 'Sticker mantenimiento.pdf',
            status: 'approved',
          },
        ],
      }),
    ])

    await openDocumentationDetail(wrapper)

    const cards = wrapper.findAll('.document-summary-card')
    expect(cards.find((card) => card.text().includes('Mantenimiento'))?.text()).toContain('Aprobado')
    expect(cards.find((card) => card.text().includes('Certificado de aeronavegabilidad'))?.text()).toContain('No cargado')
    expect(cards.find((card) => card.text().includes('Matricula'))?.text()).toContain('No cargado')
    expect(cards.find((card) => card.text().includes('Seguro'))?.text()).toContain('No cargado')
    expect(wrapper.findAll('.document-item')).toHaveLength(1)
  })

  it('reflects admin-approved aircraft as approved in admin even before payment activation', async () => {
    const wrapper = mountSection([
      buildAircraft({
        status: 'inactive',
        approved: true,
        approved_at: '2026-07-10T12:00:00Z',
        review_status: 'approved',
        billing_status: 'pending_payment',
        subscription_status: 'inactive',
        base: 'TOLUCA',
        images: [{ id: 'photo-1', url: 'https://cdn.test/foto.jpg' }],
        documents: [
          { id: 'doc-airworthiness', document_type: 'airworthiness_certificate', document_name: 'aeronavegabilidad.pdf', status: 'approved' },
          { id: 'doc-registration', document_type: 'matricula_aeronave', document_name: 'matricula.pdf', status: 'approved' },
          { id: 'doc-insurance', document_type: 'insurance_policy', document_name: 'seguro.pdf', status: 'approved' },
          { id: 'doc-maintenance', document_type: 'maintenance_sticker', document_name: 'mmto.pdf', status: 'approved' },
        ],
      }),
    ])

    await openAircraftDetail(wrapper)

    expect(wrapper.text()).toContain('Aprobada')
    expect(wrapper.text()).toContain('Pendiente de pago')
    expect(wrapper.text()).toContain('Listo para cotizar: Si')
    expect(wrapper.text()).toContain('Listo para reservar: No')
    expect(wrapper.text()).toContain('La aeronave ya fue aprobada por administracion, pero no se activa hasta reflejar el pago mensual.')
  })

  it('does not count approved inactive aircraft as suspended in admin', async () => {
    const wrapper = mountSection([
      buildAircraft({
        status: 'inactive',
        approved_at: '2026-07-10T12:00:00Z',
        review_status: 'approved',
        billing_status: 'pending_payment',
      }),
    ])

    expect(wrapper.text()).toContain('1 aprobadas')
    expect(wrapper.text()).toContain('0 pendientes')
    expect(wrapper.text()).toContain('Suspendidas')
    expect(wrapper.text()).toContain('0%')
    expect(wrapper.text()).toContain('✓ Aprobada')
    expect(wrapper.text()).toContain('Pendiente de pago')
  })
})
