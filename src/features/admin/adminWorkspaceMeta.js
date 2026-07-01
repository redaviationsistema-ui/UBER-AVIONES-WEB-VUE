const adminSectionDescriptions = {
  ejecutivo: 'Resumen ejecutivo del negocio, riesgos y actividad transversal.',
  importaciones: 'Conectores, carga masiva y trazabilidad de sincronizaciones.',
  usuarios: 'Altas, accesos, auditoria y permisos operativos.',
  clientes: 'Cuentas activas, pagos, historial comercial y seguimiento VIP.',
  proveedores: 'Red de partners, SLA, documentacion y cumplimiento.',
  aeronaves: 'Flota disponible, estatus operativo, media y suscripciones.',
  'pagos-proveedor': 'Cobros, renovaciones y seguimiento financiero de proveedores.',
  operadores: 'Coordinacion operativa, cobertura y desempeno del equipo interno.',
  sobrecargos: 'Directorio, aprobaciones, certificados y estados operativos.',
  disponibilidad: 'Cobertura diaria, bloqueos y lectura de capacidad.',
  'sobrecargo-operaciones': 'Asignaciones, briefing y ejecucion operativa de cabina.',
  'sobrecargos-en-vuelo': 'Seguimiento activo de vuelos con sobrecargo asignado.',
  reservas: 'Pipeline del cliente desde solicitud hasta cierre.',
  liberaciones: 'Autorizaciones y checkpoints del release operativo.',
  suscripciones: 'Planes, renovaciones, membresias y capas de acceso.',
  contratos: 'Plantillas, firma y versionado documental.',
  pagos: 'Cobros, conciliacion, reembolsos y lectura de margen.',
  incidencias: 'Alertas, escalaciones y cierre de eventos criticos.',
  documentos: 'Repositorio, vigencias y revision documental.',
  configuracion: 'Reglas base del sistema, permisos e integraciones.',
}

const adminGroupDescriptors = {
  'Cliente y Comercial': {
    title: 'Mesa comercial',
    headline: 'Conversion, contratos y dinero bajo una misma lectura.',
    note: 'Inspirado en suites operativas con resumen, contexto y accion visible.',
    pattern: 'Comercial',
    cadence: 'Seguimiento comercial continuo',
    standards: ['Pipeline limpio', 'Respuesta rapida', 'Contexto del cliente'],
  },
  'Operacion y Proveedores': {
    title: 'Mesa operativa',
    headline: 'Flota, red, pagos de proveedor y habilitadores de servicio.',
    note: 'El grupo cruza abastecimiento, disponibilidad y cumplimiento.',
    pattern: 'Operaciones',
    cadence: 'Monitoreo operativo de jornada',
    standards: ['Disponibilidad confiable', 'SLA visibles', 'Riesgos documentados'],
  },
  Sobrecargos: {
    title: 'Mesa de cabina',
    headline: 'Disponibilidad, asignacion y seguimiento de la tripulacion.',
    note: 'Prioriza cobertura y visibilidad por vuelo.',
    pattern: 'Cabina',
    cadence: 'Cobertura y reasignacion diaria',
    standards: ['Cobertura completa', 'Bitacora clara', 'Seguimiento por vuelo'],
  },
  'Control Interno': {
    title: 'Mesa de gobierno',
    headline: 'Auditoria, configuracion y salud general de la plataforma.',
    note: 'Concentra control estructural y cambios con impacto sistémico.',
    pattern: 'Gobernanza',
    cadence: 'Control y validacion continua',
    standards: ['Cambios trazables', 'Permisos consistentes', 'Integraciones sanas'],
  },
}

const adminOperatingPrinciples = [
  'Cambios graduales y compatibles con flujos ya existentes.',
  'Lectura transversal del negocio sin esconder dependencias.',
  'Acciones primarias visibles antes que tarjetas decorativas.',
  'Estados, riesgos y proximos pasos siempre a la mano.',
]

export function resolveAdminSectionDescription(section) {
  return adminSectionDescriptions[section] || 'Operacion administrativa conectada.'
}

export function resolveAdminGroupDescriptor(label) {
  return adminGroupDescriptors[label] || adminGroupDescriptors['Control Interno']
}

function describeSections(groupedMenu = [], currentGroup) {
  const group = currentGroup || groupedMenu[0] || null
  if (!group) return []

  return group.items.map((item, index) => ({
    id: item.id,
    label: item.label,
    order: index + 1,
    description: adminSectionDescriptions[item.id] || 'Operacion administrativa conectada.',
  }))
}

export function getAdminWorkspaceSummary(section, currentGroup, groupedMenu = []) {
  const descriptor =
    adminGroupDescriptors[currentGroup?.label] || adminGroupDescriptors['Control Interno']
  const sections = describeSections(groupedMenu, currentGroup)
  const activeSection = sections.find((item) => item.id === section) || sections[0] || null

  return {
    descriptor,
    activeSection,
    sections,
    principles: adminOperatingPrinciples,
    standards: descriptor.standards || [],
    statusTimeline: [
      {
        label: 'Modo',
        value: descriptor.pattern,
        note: descriptor.cadence || 'Seguimiento activo del frente actual.',
      },
      {
        label: 'Contexto',
        value: activeSection?.label || 'General',
        note: activeSection?.description || descriptor.note,
      },
      {
        label: 'Cobertura',
        value: `${sections.length} vistas`,
        note: 'Navegacion persistente dentro del mismo frente administrativo.',
      },
    ],
    metrics: [
      { label: 'Grupo activo', value: currentGroup?.label || 'General' },
      { label: 'Secciones visibles', value: String(sections.length) },
      { label: 'Vista actual', value: activeSection?.label || 'Resumen' },
    ],
  }
}
