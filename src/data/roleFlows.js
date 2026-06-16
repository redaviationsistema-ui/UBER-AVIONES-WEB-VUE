export const roleBasePaths = {
  client: '/cliente',
  operator: '/operador',
  crew: '/crew',
  admin: '/admin',
}

export const roleSections = {
  client: [
    { id: 'reservar', label: 'Reservar', icon: 'jet' },
    { id: 'viajes', label: 'Mis vuelos', icon: 'calendar' },
    { id: 'perfil', label: 'Perfil', icon: 'account' },
    { id: 'membresia', label: 'Membresia', icon: 'wallet' },
    { id: 'dashboard', label: 'Reservar', icon: 'overview' },
    { id: 'buscar-vuelo', label: 'Reservar', icon: 'jet' },
    { id: 'resultados', label: 'Resultados', icon: 'chart' },
    { id: 'aeronave', label: 'Detalle de reserva', icon: 'jet' },
    { id: 'paquete-vuelo', label: 'Tipo de servicio', icon: 'wallet' },
    { id: 'reserva', label: 'Reservar ahora', icon: 'reservations' },
    { id: 'contrato', label: 'Contrato', icon: 'link' },
    { id: 'pago', label: 'Pago', icon: 'wallet' },
    { id: 'reserva-confirmada', label: 'Confirmacion', icon: 'clipboard' },
    { id: 'historial', label: 'Historial', icon: 'history' },
    { id: 'soporte', label: 'Concierge', icon: 'alert' },
  ],
  operator: [
    { id: 'dashboard', label: 'Resumen proveedor', icon: 'overview' },
    { id: 'empresa', label: 'Mi empresa', icon: 'account' },
    { id: 'aeronaves', label: 'Aeronaves', icon: 'jet' },
    { id: 'costos', label: 'Costos base', icon: 'wallet' },
    { id: 'disponibilidad', label: 'Disponibilidad', icon: 'calendar' },
    { id: 'solicitudes', label: 'Solicitudes ', icon: 'clipboard' },
    { id: 'release-provider', label: 'Liberacion', icon: 'clipboard' },
    { id: 'operaciones', label: 'Operaciones', icon: 'jet' },
  /*{ id: 'tripulacion', label: 'Tripulacion', icon: 'crew' },*/ 
    { id: 'incidencias', label: 'Incidencias de sobrecargo', icon: 'alert' },
    { id: 'pagos', label: 'Pagos', icon: 'wallet' },
    { id: 'historial', label: 'Historial', icon: 'history' },
    { id: 'configuracion', label: 'Configuracion', icon: 'grid' },
  ],
  crew: [
    { id: 'dashboard', label: 'Centro Operativo', icon: 'overview' },
    { id: 'disponibilidad', label: 'Disponibilidad', icon: 'calendar', path: '/sobrecargo/disponibilidad' },
    { id: 'asignaciones', label: 'Operacion', icon: 'link' },
    { id: 'calendario', label: 'Seguimiento', icon: 'checklist' },
    { id: 'incidencias', label: 'Incidencias', icon: 'alert' },
    { id: 'historial', label: 'Historial', icon: 'history' },
    { id: 'perfil', label: 'Cuenta', icon: 'account' },
    { id: 'configuracion', label: 'Configuracion', icon: 'grid' },
  ],
  admin: [
    { id: 'ejecutivo', label: 'Dashboard', icon: 'overview' },
    { id: 'importaciones', label: 'Importaciones / Exportaciones', icon: 'clipboard' },
    { id: 'usuarios', label: 'Usuarios y Roles', icon: 'crew' },
    { id: 'clientes', label: 'Clientes', icon: 'account' },
    { id: 'proveedores', label: 'Proveedores', icon: 'shield' },
    { id: 'aeronaves', label: 'Aeronaves', icon: 'jet' },
    { id: 'operadores', label: 'Operadores', icon: 'clipboard' },
    { id: 'sobrecargos', label: 'Directorio de sobrecargos', icon: 'crew' },
    { id: 'disponibilidad', label: 'Disponibilidad', icon: 'calendar', path: '/admin/sobrecargos/disponibilidad' },
    { id: 'sobrecargo-operaciones', label: 'Operaciones de sobrecargos', icon: 'link' },
    { id: 'reservas', label: 'Flujo del cliente', icon: 'reservations' },
    { id: 'liberaciones', label: 'Liberaciones', icon: 'clipboard' },
    { id: 'suscripciones', label: 'Suscripciones', icon: 'wallet' },
    { id: 'contratos', label: 'Contratos', icon: 'link' },
    { id: 'pagos', label: 'Pagos / Finanzas', icon: 'wallet' },
    { id: 'incidencias', label: 'Incidencias', icon: 'alert' },
    { id: 'documentos', label: 'Documentos', icon: 'clipboard' },
    { id: 'configuracion', label: 'Configuracion', icon: 'grid' },
  ],
}

export const roleSectionGroups = {
  client: [
    { label: 'Reservar', ids: ['reservar', 'dashboard', 'buscar-vuelo', 'resultados', 'aeronave', 'paquete-vuelo', 'reserva'] },
    { label: 'Mis vuelos', ids: ['viajes', 'contrato', 'pago', 'reserva-confirmada', 'historial', 'soporte'] },
    { label: 'Perfil', ids: ['perfil'] },
    { label: 'Membresia', ids: ['membresia'] },
  ],
  crew: [
    { label: 'Centro Operativo', ids: ['dashboard'] },
    { label: 'Disponibilidad', ids: ['disponibilidad'] },
    { label: 'Seguimiento', ids: ['incidencias', 'historial', 'documentos'] },
    { label: 'Operacion', ids: ['asignaciones', 'calendario'] },
    { label: 'Cuenta', ids: ['perfil', 'configuracion'] },
  ],
  operator: [
    {
      label: 'Operacion',
      ids: ['dashboard', 'empresa', 'aeronaves', 'costos', 'disponibilidad', 'solicitudes', 'release-provider', 'operaciones'],
    },
    { label: 'Coordinacion', ids: ['tripulacion', 'incidencias'] },
    { label: 'Control', ids: ['pagos', 'historial', 'configuracion'] },
  ],
  admin: [
    { label: 'Cliente y Comercial', ids: ['clientes', 'reservas', 'contratos', 'pricing', 'paquetes', 'suscripciones', 'pagos'] },
    {
      label: 'Operacion y Proveedores',
      ids: ['proveedores', 'aeronaves', 'operadores', 'liberaciones', 'documentos', 'notificaciones'],
    },
    { label: 'Sobrecargos', ids: ['sobrecargos', 'disponibilidad', 'sobrecargo-operaciones', 'incidencias'] },
    { label: 'Control Interno', ids: ['ejecutivo', 'importaciones', 'usuarios', 'analytics', 'configuracion'] },
  ],
}

export function buildMenuGroups(role, sections = roleSections[role] || []) {
  const groupConfig = roleSectionGroups[role] || []
  const usedIds = new Set()
  const groups = groupConfig
    .map((group) => {
      const items = group.ids
        .map((id) => sections.find((item) => item.id === id))
        .filter(Boolean)

      items.forEach((item) => usedIds.add(item.id))

      return {
        label: group.label,
        items,
      }
    })
    .filter((group) => group.items.length)

  const leftovers = sections.filter((item) => !usedIds.has(item.id))
  if (leftovers.length) {
    groups.push({ label: 'Mas', items: leftovers })
  }

  return groups
}

export function resolveSection(role, section) {
  const legacyAliases = {
    client: {
      dashboard: 'reservar',
      'buscar-vuelo': 'reservar',
      'mis-vuelos': 'viajes',
      vip: 'membresia',
      comparar: 'reservar',
    },
    crew: {
      agenda: 'calendario',
      checklist: 'calendario',
      pagos: 'historial',
    },
  }
  const sections = roleSections[role] || []
  const fallback = role === 'client' ? 'reservar' : sections[0]?.id || 'dashboard'
  const normalizedSection = legacyAliases[role]?.[section] || section
  return sections.some((item) => item.id === normalizedSection) ? normalizedSection : fallback
}

export function resolveRoleSectionPath(role, sectionOrItem) {
  const sectionItem =
    typeof sectionOrItem === 'object' && sectionOrItem !== null
      ? sectionOrItem
      : (roleSections[role] || []).find((item) => item.id === sectionOrItem)

  if (sectionItem?.path) {
    return sectionItem.path
  }

  const basePath = roleBasePaths[role] || ''
  const sectionId = sectionItem?.id || sectionOrItem || ''
  return `${basePath}/${sectionId}`.replace(/\/+$/, '')
}
