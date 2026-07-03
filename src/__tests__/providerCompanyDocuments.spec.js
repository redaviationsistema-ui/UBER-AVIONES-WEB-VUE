import { describe, expect, it } from 'vitest'
import { normalizeAdminProviderDocument, resolveCompanyDocumentDefinition } from '../lib/providerCompanyDocuments'

describe('providerCompanyDocuments helpers', () => {
  it('resolves document definition from persisted slot metadata', () => {
    const definition = resolveCompanyDocumentDefinition({
      document_slot: 'legal_representative_id',
    })

    expect(definition?.label).toBe('Identificacion oficial del representante')
    expect(definition?.sectionLabel).toBe('Carga legal y respaldo')
  })

  it('hides redundant backend columns for compact admin document cards', () => {
    const document = normalizeAdminProviderDocument({
      id: 18,
      document_name: 'licencia_demo.png',
      original_name: 'licencia_demo_quqizoyn.png',
      file_name: 'licencia_demo_quqizoyn.png',
      document_slot: 'legal_representative_id',
      document_type: 'legal_representative_id',
      document_category: 'legal_representative_id',
      document_section: 'legal',
      field_map: [
        { column: 'document_slot', value: 'legal_representative_id' },
        { column: 'document_type', value: 'legal_representative_id' },
      ],
    })

    expect(document.definitionLabel).toBe('Identificacion oficial del representante')
    expect(document.sectionLabel).toBe('Carga legal y respaldo')
    expect(document.definitionKey).toBe('legal_representative_id')
    expect(document.fieldMap).toEqual([])
  })
})
