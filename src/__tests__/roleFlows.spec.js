import { describe, expect, it } from 'vitest'

import {
  buildMenuGroups,
  findMenuGroupBySection,
  resolveRoleSectionPath,
  validateRoleSectionsConfig,
} from '../data/roleFlows'

describe('roleFlows helpers', () => {
  it('builds admin groups without dropping mapped sections', () => {
    const groups = buildMenuGroups('admin')

    expect(groups.map((group) => group.label)).toContain('Cliente y Comercial')
    expect(groups.flatMap((group) => group.items.map((item) => item.id))).toContain('reservas')
    expect(groups.flatMap((group) => group.items.map((item) => item.id))).toContain('cotizaciones')
    expect(groups.flatMap((group) => group.items.map((item) => item.id))).toContain('auditoria')
  })

  it('finds the group that owns a section', () => {
    const group = findMenuGroupBySection('admin', 'disponibilidad')

    expect(group?.label).toBe('Sobrecargos')
  })

  it('resolves custom paths when a section declares them', () => {
    expect(resolveRoleSectionPath('admin', 'sobrecargos')).toBe(
      '/admin/sobrecargos',
    )
    expect(resolveRoleSectionPath('admin', 'disponibilidad')).toBe(
      '/admin/sobrecargos/disponibilidad',
    )
    expect(resolveRoleSectionPath('admin', 'sobrecargo-operaciones')).toBe(
      '/admin/sobrecargos/operaciones',
    )
    expect(resolveRoleSectionPath('admin', 'sobrecargos-en-vuelo')).toBe(
      '/admin/sobrecargos/en-vuelo',
    )
    expect(resolveRoleSectionPath('admin', 'incidencias')).toBe(
      '/admin/sobrecargos/incidencias',
    )
  })

  it('validates the current role configuration', () => {
    const result = validateRoleSectionsConfig()

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('removes the legacy operadores placeholder from the admin menu', () => {
    const groups = buildMenuGroups('admin')

    expect(groups.flatMap((group) => group.items.map((item) => item.id))).not.toContain('operadores')
  })

  it('reports broken group references in invalid configs', () => {
    const result = validateRoleSectionsConfig(
      {
        demo: [{ id: 'alpha', label: 'Alpha' }],
      },
      {
        demo: [{ label: 'Main', ids: ['alpha', 'ghost'] }],
      },
    )

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('[demo] grupo referencia una seccion inexistente: ghost')
  })
})
