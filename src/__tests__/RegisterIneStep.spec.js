/* @vitest-environment jsdom */

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

const generateIdentificationPdfMock = vi.fn()
const uploadIdentificationDocumentMock = vi.fn()

vi.mock('../features/register/ineScanner', () => ({
  scanDocumentFiles: vi.fn(),
}))

vi.mock('../features/register/identificationUpload', async () => {
  const actual = await vi.importActual('../features/register/identificationUpload')

  return {
    ...actual,
    generateIdentificationPdf: (...args) => generateIdentificationPdfMock(...args),
    uploadIdentificationDocument: (...args) => uploadIdentificationDocumentMock(...args),
    validateIdentificationFiles: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('../features/register/identityVerification', () => ({
  canvasToFile: vi.fn(),
  captureVideoFrame: vi.fn(),
}))

vi.mock('../lib/api', () => ({
  api: {
    postForm: vi.fn(),
  },
}))

vi.mock('../lib/airportSearch', () => ({
  searchAirports: vi.fn().mockResolvedValue({ items: [] }),
}))

import RegisterIneStep from '../features/register/RegisterIneStep.vue'

function buildForm(overrides = {}) {
  return {
    role: 'client',
    name: 'JUAN PEREZ',
    phone: '+52 55 1234 5678',
    birthDate: '1990-01-10',
    nationality: 'Mexicana',
    base: '',
    documentType: 'INE o identificacion oficial',
    documentNumber: 'ABC123456',
    documentIssueDate: '',
    documentExpiration: '2030-10-10',
    documentStatus: 'Vigente',
    identityValidationRequired: true,
    ineCurp: 'PEPJ900110HDFRRN09',
    ineCic: '',
    ineOcr: '',
    ineScanRaw: '',
    ineScanStatus: '',
    identificationUploadStatus: 'pending',
    identificationUploadError: '',
    identificationDocumentId: '',
    identificationStorageDisk: '',
    identificationStoragePath: '',
    identificationFileUrl: '',
    identificationDocumentUrl: '',
    identificationPdfName: '',
    licenseType: '',
    licenseCategory: '',
    issuingCountry: '',
    ineFront: new File(['front'], 'front.jpg', { type: 'image/jpeg' }),
    ineFrontName: 'front.jpg',
    ineFrontPreviewUrl: 'blob:front',
    ineBack: new File(['back'], 'back.jpg', { type: 'image/jpeg' }),
    ineBackName: 'back.jpg',
    ineBackPreviewUrl: 'blob:back',
    selfieFile: null,
    selfieFileName: '',
    selfiePreviewUrl: '',
    identityVerificationStatus: '',
    identityVerificationMessage: '',
    identityVerified: false,
    faceDetected: false,
    faceMatchScore: null,
    livenessScore: null,
    imageStorageScore: 0,
    biometricImageSaved: false,
    biometricCapturedAt: '',
    biometricProvider: '',
    biometricTemplateType: '',
    facesCount: 0,
    faceConfidence: null,
    qualityBrightness: null,
    qualitySharpness: null,
    poseYaw: null,
    posePitch: null,
    poseRoll: null,
    faceOccluded: null,
    ...overrides,
  }
}

describe('RegisterIneStep', () => {
  it('renders the manual identification flow for clients without OCR copy', () => {
    const wrapper = mount(RegisterIneStep, {
      props: {
        form: buildForm(),
      },
    })

    expect(wrapper.text()).toContain('Guardar identificación')
    expect(wrapper.text()).not.toContain('Datos detectados y editables')
    expect(wrapper.text()).not.toContain('Escanear')
  })

  it('uploads the generated identification PDF and emits saved metadata', async () => {
    const pdfFile = new File(['pdf'], 'identificacion-1.pdf', { type: 'application/pdf' })
    generateIdentificationPdfMock.mockResolvedValueOnce(pdfFile)
    uploadIdentificationDocumentMock.mockResolvedValueOnce({
      status: 'saved',
      documentId: 'doc-123',
      storageDisk: 's3',
      storagePath: 'registration/identification/doc-123.pdf',
      fileUrl: 'https://example.test/doc-123.pdf',
      documentUrl: 'https://example.test/doc-123.pdf',
    })

    const wrapper = mount(RegisterIneStep, {
      props: {
        form: buildForm(),
      },
    })

    const saveButton = wrapper.get('.identification-save-row .primary-button')
    await saveButton.trigger('click')

    expect(generateIdentificationPdfMock).toHaveBeenCalledTimes(1)
    expect(uploadIdentificationDocumentMock).toHaveBeenCalledTimes(1)
    const mergeEvents = wrapper.emitted('merge-fields') || []
    expect(mergeEvents.some(([payload]) => payload.identificationUploadStatus === 'saved')).toBe(true)
    expect(mergeEvents.some(([payload]) => payload.identificationDocumentId === 'doc-123')).toBe(true)
  })

  it('marks the stored document as pending again when a tracked field changes', async () => {
    const wrapper = mount(RegisterIneStep, {
      props: {
        form: buildForm({
          identificationUploadStatus: 'saved',
          identificationDocumentId: 'doc-123',
        }),
      },
    })

    const curpInput = wrapper.find('input[placeholder="Captura tu CURP"]')
    await curpInput.setValue('PEPJ900110HDFRRN10')

    const mergeEvents = wrapper.emitted('merge-fields') || []
    expect(mergeEvents.some(([payload]) => payload.identificationUploadStatus === 'pending')).toBe(true)
    expect(mergeEvents.some(([payload]) => payload.identificationDocumentId === '')).toBe(true)
  })
})
