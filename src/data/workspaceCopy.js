export const roleInsights = {
  client: {
    title: 'Reserva integral',
    description: 'Busca, compara, reserva, firma y paga sin salir del ecosistema.',
  },
  operator: {
    title: 'Publicacion y respuesta operativa',
    description: 'Coordina disponibilidad, solicitudes, liberaciones y control operativo sin perder ritmo.',
  },
  crew: {
    title: 'Agenda, cabina y servicio',
    description: 'Todo lo necesario para operar con orden, visibilidad y seguimiento claro.',
  },
  admin: {
    title: 'Control total',
    description: 'Operacion, comercial, finanzas y cumplimiento conectados en un solo frente de control.',
  },
}

const operatorGroupMeta = {
  Operacion: {
    title: 'Operacion',
    eyebrow: '',
    description: '',
  },
  Coordinacion: {
    title: 'Coordinacion',
    eyebrow: '',
    description: '',
  },
  Control: {
    title: 'Control',
    eyebrow: '',
    description: '',
  },
}

const operatorSectionCopy = {
  dashboard: { label: 'Resumen proveedor', detail: 'Dashboard principal y KPIs' },
  empresa: { label: 'Mi empresa', detail: 'Perfil corporativo y certificaciones' },
  aeronaves: { label: 'Aeronaves', detail: 'Gestion y disponibilidad de flota' },
  costos: { label: 'Costos base', detail: 'Costos operativos y pricing' },
  disponibilidad: { label: 'Disponibilidad', detail: 'Agenda y bloqueos' },
  solicitudes: { label: 'Solicitudes', detail: 'Nuevas oportunidades' },
  'release-provider': { label: 'Liberacion', detail: 'Autorizaciones operativas' },
  operaciones: { label: 'Operaciones', detail: 'Control de vuelos activos' },
  incidencias: { label: 'Incidencias de sobrecargo', detail: 'Eventos y seguimiento operativo' },
  pagos: { label: 'Pagos', detail: 'Facturacion y conciliacion' },
  historial: { label: 'Historial', detail: 'Registro de operaciones' },
  configuracion: { label: 'Configuracion', detail: 'Parametros del operador' },
}

export function getWorkspaceGroupMeta(role, group, fallbackDescription = '') {
  if (role !== 'operator') {
    return {
      title: group?.label || '',
      eyebrow: ``,
      description: fallbackDescription,
    }
  }

  return (
    operatorGroupMeta[group?.label] || {
      title: group?.label || '',
      eyebrow: 'Op',
      description: fallbackDescription,
    }
  )
}

export function getSectionCopy(role, item, group) {
  if (role !== 'operator') {
    return {
      label: item?.label || '',
      detail: group?.label || '',
    }
  }

  return (
    operatorSectionCopy[item?.id] || {
      label: item?.label || '',
      detail: group?.label || '',
    }
  )
}
