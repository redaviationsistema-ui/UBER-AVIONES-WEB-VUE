/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'

import { getBackendOrigin } from '../lib/api'
import {
  isAdminDocumentRoute,
  resolveProviderCompanyDocumentAccess,
  resolveUserLegacyIdentityImages,
  resolveUserOfficialIdentificationAccess,
} from '../lib/documentAccess'

describe('documentAccess helpers', () => {
  it('detects admin-only document routes', () => {
    expect(isAdminDocumentRoute('/api/v1/admin/proveedores/9/documentos/4/descargar')).toBe(true)
    expect(isAdminDocumentRoute('/api/v1/proveedor/aeronaves/7/documentos/3/descargar')).toBe(false)
  })

  it('prefers the persisted company document url over an admin download route', () => {
    const access = resolveProviderCompanyDocumentAccess({
      download_url: '/api/v1/admin/proveedores/9/documentos/4/descargar',
      document_url: 'https://bucket.example.com/provider/9/company-documents/acta.pdf',
    })

    expect(access.viewUrl).toBe('https://bucket.example.com/provider/9/company-documents/acta.pdf')
    expect(access.downloadUrl).toBe('https://bucket.example.com/provider/9/company-documents/acta.pdf')
    expect(access.adminDownloadUrl).toBe(
      `${getBackendOrigin()}/api/v1/admin/proveedores/9/documentos/4/descargar`,
    )
  })

  it('falls back to the backend-relative path when there is no direct file url', () => {
    const access = resolveProviderCompanyDocumentAccess({
      path: 'storage/company/acta.pdf',
    })

    expect(access.viewUrl).toBe(`${getBackendOrigin()}/storage/company/acta.pdf`)
    expect(access.downloadUrl).toBe(`${getBackendOrigin()}/storage/company/acta.pdf`)
  })

  it('reads the saved official identification pdf from nested client tax_data', () => {
    const access = resolveUserOfficialIdentificationAccess({
      profile: {
        tax_data: {
          official_identification: {
            id: 'doc-123',
            document_name: 'Identificación oficial',
            storage_disk: 's3',
            storage_path: 'registration/identification/doc-123.pdf',
            document_url: 'https://bucket.example.com/registration/identification/doc-123.pdf',
          },
        },
      },
    })

    expect(access.id).toBe('doc-123')
    expect(access.name).toBe('Identificación oficial')
    expect(access.storagePath).toBe('registration/identification/doc-123.pdf')
    expect(access.viewUrl).toBe('https://bucket.example.com/registration/identification/doc-123.pdf')
    expect(access.downloadUrl).toBe('https://bucket.example.com/registration/identification/doc-123.pdf')
  })

  it('resolves legacy client identity images when only front and back paths exist', () => {
    const images = resolveUserLegacyIdentityImages({
      profile: {
        ine_front_path: 'identity/ine/front/front.jpg',
        ine_front_url: '/api/v1/public/identity/ine/7/front?signature=front',
        ine_back_path: 'identity/ine/back/back.jpg',
        ine_back_url: '/api/v1/public/identity/ine/7/back?signature=back',
      },
    })

    expect(images).toHaveLength(2)
    expect(images[0]).toMatchObject({
      key: 'front',
      label: 'INE frente',
      path: 'identity/ine/front/front.jpg',
      url: `${getBackendOrigin()}/api/v1/public/identity/ine/7/front?signature=front`,
    })
    expect(images[1]).toMatchObject({
      key: 'back',
      label: 'INE reverso',
      path: 'identity/ine/back/back.jpg',
      url: `${getBackendOrigin()}/api/v1/public/identity/ine/7/back?signature=back`,
    })
  })
})
