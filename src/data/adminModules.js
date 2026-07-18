import { buildMenuGroups, resolveRoleSectionPath, roleSections } from './roleFlows'
import {
  adminGroupDescriptors,
  resolveAdminSectionDescription,
} from '../features/admin/adminWorkspaceMeta'

const adminGroupMeta = {
  'Cliente y Comercial': {
    icon: 'wallet',
    color: '#1E4ED8',
    description: 'Selecciona un modulo para administrar clientes, contratos, pagos y relaciones comerciales.',
  },
  'Operacion y Proveedores': {
    icon: 'jet',
    color: '#0F766E',
    description: 'Selecciona un modulo para supervisar flota, disponibilidad, vuelos y red de proveedores.',
  },
  Sobrecargos: {
    icon: 'crew',
    color: '#B45309',
    description: 'Selecciona un modulo para coordinar cabina, cobertura operativa y seguimiento en vuelo.',
  },
  'Control Interno': {
    icon: 'shield',
    color: '#475569',
    description: 'Selecciona un modulo para gobernanza, auditoria, usuarios y configuracion administrativa.',
  },
}

const adminModuleIconOverrides = {
  cotizaciones: 'clipboard',
  vuelos: 'takeoff',
  auditoria: 'shield',
  reportes: 'chart',
  importaciones: 'link',
  proveedores: 'account',
  documentos: 'folder',
}

function buildAdminModuleGroups() {
  return buildMenuGroups('admin', roleSections.admin).map((group) => {
    const descriptor = adminGroupDescriptors[group.label] || {}
    const meta = adminGroupMeta[group.label] || adminGroupMeta['Control Interno']

    return {
      id: group.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      label: group.label,
      title: group.label,
      icon: meta.icon,
      color: meta.color,
      description: meta.description,
      eyebrow: descriptor.pattern || 'Admin',
      modules: group.items.map((item) => ({
        id: item.id,
        title: item.label,
        description: resolveAdminSectionDescription(item.id),
        icon: adminModuleIconOverrides[item.id] || item.icon,
        route: resolveRoleSectionPath('admin', item),
        permission: 'admin',
        color: meta.color,
      })),
    }
  })
}

export const adminModuleGroups = buildAdminModuleGroups()

export const adminAllModulesGroup = {
  id: 'todos',
  label: 'Todos los modulos',
  title: 'Todos los modulos',
  icon: 'grid',
  color: '#1E4ED8',
  description: 'Explora todos los frentes administrativos desde un unico launchpad.',
  eyebrow: 'Acceso rapido',
  modules: adminModuleGroups.flatMap((group) =>
    group.modules.map((module) => ({
      ...module,
      groupLabel: group.label,
      color: group.color,
    })),
  ),
}

export function resolveAdminModuleGroup(label) {
  if (label === adminAllModulesGroup.label || label === adminAllModulesGroup.id) {
    return adminAllModulesGroup
  }

  return adminModuleGroups.find((group) => group.label === label || group.id === label) || null
}
