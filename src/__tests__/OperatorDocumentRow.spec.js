/* @vitest-environment jsdom */

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import OperatorDocumentRow from '../features/operator/validation/OperatorDocumentRow.vue'

function mountRow(status) {
  return mount(OperatorDocumentRow, {
    props: {
      role: 'admin',
      document: {
        id: 1,
        status,
        definitionLabel: 'Acta constitutiva',
        fileName: 'acta.pdf',
        downloadUrl: 'https://example.com/acta.pdf',
      },
    },
  })
}

describe('OperatorDocumentRow', () => {
  it('shows approve and reject for pending documents', () => {
    const wrapper = mountRow('pending')
    const text = wrapper.text()

    expect(text).toContain('Aprobar')
    expect(text).toContain('Rechazar')
    expect(text).not.toContain('Revocar aprobación')
  })

  it('shows only revoke approval for approved documents', () => {
    const wrapper = mountRow('approved')
    const text = wrapper.text()

    expect(text).toContain('Revocar aprobación')
    expect(text).not.toContain('Rechazar')
    expect(text).not.toContain('Aprobar nuevamente')
  })

  it('shows approve again for rejected documents', () => {
    const wrapper = mountRow('rejected')
    const text = wrapper.text()

    expect(text).toContain('Aprobar nuevamente')
    expect(text).not.toContain('Rechazar')
    expect(text).not.toContain('Revocar aprobación')
  })

  it('normalizes spanish pending statuses so admin can approve them', () => {
    const wrapper = mountRow('pendiente')
    const text = wrapper.text()

    expect(text).toContain('Pendiente')
    expect(text).toContain('Aprobar')
    expect(text).toContain('Rechazar')
  })

  it('normalizes spanish approved statuses so admin can revoke them', () => {
    const wrapper = mountRow('aprobado')
    const text = wrapper.text()

    expect(text).toContain('Aprobado')
    expect(text).toContain('Revocar aprobación')
    expect(text).not.toContain('Rechazar')
  })
})
