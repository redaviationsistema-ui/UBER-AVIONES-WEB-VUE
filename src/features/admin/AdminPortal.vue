<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { api } from '../../lib/api'
import { pickCollection, requestWithCandidates } from '../../lib/backendCrud'
import { fallbackAdminFlags, fallbackAdminKpis, fallbackAdminUsers } from '../../data/platform'
import { useUiStore } from '../../stores/ui'
import AdminAlertsSection from './AdminAlertsSection.vue'
import AdminAircraftSubscriptionsSection from './AdminAircraftSubscriptionsSection.vue'
import AdminCrewOperationsSection from './AdminCrewOperationsSection.vue'
import AdminCrudSection from './AdminCrudSection.vue'
import AdminExecutiveSection from './AdminExecutiveSection.vue'
import AdminImportsSection from './AdminImportsSection.vue'
import AdminProvidersNetworkSection from './AdminProvidersNetworkSection.vue'
import AdminReservationsSection from './AdminReservationsSection.vue'
import AdminUsersSection from './AdminUsersSection.vue'
import { normalizeWorkflowLabel, SHARED_WORKFLOW_STEPS } from '../../utils/flightWorkflow'
import { emitWorkflowSync, subscribeWorkflowSync } from '../../lib/workflowSync'
import {
  delayAdminReservation,
  getAdminReservations,
  resumeAdminReservation,
  updateAdminReservationStage,
} from './adminReservationsApi'

const props = defineProps({
  section: { type: String, required: true },
})

const ui = useUiStore()
const kpis = ref({})
const users = ref([])
const flags = ref([])
const providers = ref([])
const aircraft = ref([])
const subscriptions = ref([])
const crewMembers = ref([])
const operations = ref([])
const auditEntries = ref([])
const reservationAuditEntries = ref([])
const reservationFlowLoading = ref(false)
const reservationFlowLoadingLabel = ref('')
let removeWorkflowSyncSubscription = null
let reservationsPollTimer = null
let operationsRequestPromise = null
const adminPortalInstanceId = `admin-${Math.random().toString(16).slice(2, 10)}`
let lastReservationsRefreshAt = 0
const ADMIN_RESERVATIONS_POLL_INTERVAL_MS = 10000
const ADMIN_RESERVATIONS_TIMEOUT_MS = Number(import.meta.env.VITE_ADMIN_RESERVATIONS_TIMEOUT_MS || 8000)
const ADMIN_FLOW_UPDATE_TIMEOUT_MS = Number(import.meta.env.VITE_ADMIN_FLOW_UPDATE_TIMEOUT_MS || 12000)
const ADMIN_RESERVATIONS_REFRESH_COOLDOWN_MS = 4000

const displayKpis = [
  { label: 'Ventas del dia', value: '$286,000 MXN', detail: 'Ingresos confirmados durante la jornada.' },
  { label: 'Margen bruto', value: '31%', detail: 'Resultado consolidado sobre operaciones activas.' },
  { label: 'Vuelos activos', value: '12', detail: 'Servicios actualmente en ejecucion o pre-vuelo.' },
  { label: 'Reservas pendientes', value: '9', detail: 'Solicitudes aun en revision o asignacion.' },
  { label: 'Pagos pendientes', value: '6', detail: 'Cobros, cortes o conciliaciones por resolver.' },
  { label: 'Incidencias criticas', value: '3', detail: 'Eventos con impacto alto y seguimiento inmediato.' },
  { label: 'Proveedores activos', value: '18', detail: 'Partners habilitados con SLA vigente.' },
  { label: 'Sobrecargos disponibles', value: '14', detail: 'Talento listo para recibir una nueva asignacion.' },
]

const quickActions = [
  'Crear reserva',
  'Crear cotizacion',
  'Agregar aeronave',
  'Asignar operador',
  'Ver incidencias',
]

const controlAreas = [
  {
    title: 'Usuarios y roles',
    description: 'Administra altas, permisos, estados y accesos de toda la plataforma.',
    meta: 'Clientes, operadores, proveedores, sobrecargos y admins',
  },
  {
    title: 'Reservas y pricing',
    description: 'Controla solicitudes, cotizaciones, margen, fee de plataforma y vigencias.',
    meta: 'Desde solicitud hasta confirmacion',
  },
  {
    title: 'Flota y proveedores',
    description: 'Supervisa aeronaves, disponibilidad, documentos, SLA y cumplimiento operativo.',
    meta: 'Aeronaves, bases, costos y proveedores',
  },
  {
    title: 'Contratos y documentos',
    description: 'Centraliza plantillas, firmas digitales, seguros, licencias y certificados.',
    meta: 'Cumplimiento legal y documental',
  },
  {
    title: 'Pagos y finanzas',
    description: 'Da seguimiento a cobros, comisiones, reembolsos, penalizaciones y facturas.',
    meta: 'Margen, comision y conciliacion',
  },
  {
    title: 'Incidencias y soporte',
    description: 'Escala eventos criticos, evidencia, responsables y cierre operativo.',
    meta: 'Historial, impacto y resolucion',
  },
]

const analyticsSummary = [
  { label: 'Conversion rate', value: '38%', score: 38 },
  { label: 'Ticket promedio', value: '$94k MXN', score: 74 },
  { label: 'Vuelos por mes', value: '146', score: 68 },
  { label: 'Margen por vuelo', value: '29%', score: 29 },
  { label: 'Utilizacion de flota', value: '84%', score: 84 },
  { label: 'Tiempo de asignacion', value: '11 min', score: 61 },
]

const flowSteps = SHARED_WORKFLOW_STEPS.map((step) => step.title)

const policies = [
  {
    title: 'Admin ve todo',
    description: 'Tiene visibilidad completa del negocio, el flujo y los controles de riesgo.',
  },
  {
    title: 'Operador coordina',
    description: 'Solo administra la operacion sin tocar pricing ejecutivo ni control comercial.',
  },
  {
    title: 'Proveedor ciego',
    description: 'No ve al cliente final ni las capas internas de relacion comercial.',
  },
  {
    title: 'Sobrecargo acotado',
    description: 'Solo accede a la operacion asignada, checklist, incidencias y pagos propios.',
  },
  {
    title: 'Cliente ve Red Aviation',
    description: 'Toda la experiencia se concentra bajo la marca y el frente comercial oficial.',
  },
]

const reservationStates = [
  'Pendiente',
  'Validando',
  'Cotizada',
  'Asignada',
  'En firma',
  'Pagada',
  'Confirmada',
  'En vuelo',
  'Finalizada',
  'Cancelada',
]

const paymentStates = ['Pendiente', 'Pagado', 'Retenido', 'Reembolsado', 'Fallido']
const incidentStates = ['Abierta', 'En revision', 'Escalada', 'Resuelta', 'Cerrada']

const adminSections = {
  clientes: {
    eyebrow: 'Clientes',
    title: 'Gestion integral de clientes',
    description: 'Controla datos comerciales, historial, preferencias VIP y perfil de riesgo.',
    highlights: [
      { label: 'Clientes VIP', value: '28', detail: 'Cuentas con prioridad y SLA premium.' },
      { label: 'Corporativos', value: '14', detail: 'Empresas con multiples contactos y contratos.' },
      { label: 'Pagos al dia', value: '92%', detail: 'Clientes con comportamiento financiero sano.' },
      { label: 'Riesgo alto', value: '2', detail: 'Perfiles con seguimiento manual.' },
    ],
    actions: ['Crear cliente', 'Validar perfil fiscal', 'Actualizar nivel VIP', 'Marcar riesgo operativo'],
    fields: ['Nombre', 'Empresa', 'Telefono', 'Correo', 'Tipo VIP / Corporativo / Recurrente', 'Nivel de servicio'],
    details: ['Historial de vuelos', 'Cotizaciones', 'Pagos', 'Contratos', 'Preferencias'],
    edits: ['Datos fiscales', 'Nivel VIP', 'Requerimientos especiales', 'Contactos adicionales'],
    deactivation: ['Cliente inactivo', 'Cliente riesgoso'],
  },
  proveedores: {
    eyebrow: 'Proveedores',
    title: 'Control de red de proveedores',
    description: 'Administra disponibilidad, costos, documentos, contrato y cumplimiento de cada partner.',
    highlights: [
      { label: 'Activos', value: '18', detail: 'Partners con acceso y SLA vigente.' },
      { label: 'En pausa', value: '3', detail: 'Proveedores temporalmente deshabilitados.' },
      { label: 'Documentos al dia', value: '87%', detail: 'Cumplimiento documental consolidado.' },
      { label: 'Incidencias abiertas', value: '4', detail: 'Eventos en seguimiento por proveedor.' },
    ],
    actions: ['Crear proveedor', 'Revisar SLA', 'Subir contrato', 'Pausar proveedor'],
    fields: ['Empresa', 'Contacto', 'Base operativa', 'Documentos', 'Contrato', 'Estado'],
    details: ['Flota', 'Disponibilidad', 'Costos', 'Cumplimiento', 'Incidencias'],
    edits: ['Datos', 'Permisos', 'SLA', 'Estado'],
    deactivation: ['Suspender proveedor', 'Pausar proveedor'],
  },
  aeronaves: {
    eyebrow: 'Aeronaves',
    title: 'Flota, disponibilidad y documentos',
    description: 'Supervisa matriculas, capacidad, amenidades, base y estatus operativo de cada aeronave.',
    highlights: [
      { label: 'Aeronaves activas', value: '27', detail: 'Flota lista para asignacion inmediata.' },
      { label: 'Mantenimiento', value: '4', detail: 'Unidades temporalmente fuera de linea.' },
      { label: 'Docs por vencer', value: '3', detail: 'Requieren seguimiento preventivo.' },
      { label: 'Utilizacion', value: '84%', detail: 'Uso consolidado de flota del mes.' },
    ],
    actions: ['Agregar aeronave', 'Actualizar disponibilidad', 'Subir documento', 'Pausar por mantenimiento'],
    fields: ['Matricula', 'Modelo', 'Tipo', 'Capacidad', 'Base', 'Fotos', 'Documentos', 'Amenidades', 'Estado'],
    details: ['Disponibilidad', 'Proximos vuelos', 'Historial', 'Costos', 'Documentos'],
    edits: ['Fotos', 'Base', 'Estado', 'Capacidad', 'Servicios', 'Disponibilidad'],
    deactivation: ['Por mantenimiento', 'Por documentos vencidos', 'Por baja operacion'],
  },
  operadores: {
    eyebrow: 'Operadores',
    title: 'Control de operadores',
    description: 'Gestiona turnos, regiones, permisos y desempeno de quienes coordinan la operacion.',
    highlights: [
      { label: 'Activos', value: '11', detail: 'Operadores con acceso vigente.' },
      { label: 'Tiempo de respuesta', value: '11 min', detail: 'Promedio general de coordinacion.' },
      { label: 'Incidencias resueltas', value: '42', detail: 'Casos cerrados este mes.' },
      { label: 'Performance', value: '93%', detail: 'Indicador de ejecucion operativa.' },
    ],
    actions: ['Crear operador', 'Asignar turno', 'Actualizar region', 'Suspender acceso'],
    fields: ['Nombre', 'Correo', 'Telefono', 'Region', 'Turno', 'Permisos'],
    details: ['Operaciones asignadas', 'Tiempo de respuesta', 'Incidencias resueltas', 'Performance'],
    edits: ['Turnos', 'Permisos', 'Estado', 'Region'],
    deactivation: ['Suspender acceso'],
  },
  sobrecargos: {
    eyebrow: 'Sobrecargos',
    title: 'Gestion de sobrecargos',
    description: 'Supervisa disponibilidad, certificaciones, agenda, rating y pagos del equipo de cabina.',
    highlights: [
      { label: 'Disponibles', value: '14', detail: 'Tripulacion lista para asignarse.' },
      { label: 'En servicio', value: '7', detail: 'Sobrecargos con vuelo o briefing activo.' },
      { label: 'Rating promedio', value: '4.9/5', detail: 'Calificacion consolidada de servicio.' },
      { label: 'Horas del mes', value: '412 h', detail: 'Carga operativa acumulada.' },
    ],
    actions: ['Crear sobrecargo', 'Subir certificado', 'Actualizar base', 'Pausar disponibilidad'],
    fields: ['Nombre', 'Telefono', 'Correo', 'Base', 'Certificaciones', 'Idiomas', 'Disponibilidad'],
    details: ['Agenda', 'Vuelos asignados', 'Rating', 'Horas trabajadas', 'Pagos', 'Incidencias'],
    edits: ['Certificados', 'Estado', 'Disponibilidad', 'Informacion bancaria', 'Perfil'],
    deactivation: ['Suspender', 'Pausar'],
  },
  reservas: {
    eyebrow: 'Reservas',
    title: 'Solicitudes y reservas',
    description: 'Administra el ciclo completo de una reserva desde la entrada hasta la finalizacion o cancelacion.',
    highlights: [
      { label: 'Pendientes', value: '9', detail: 'Solicitudes aun en revision.' },
      { label: 'Cotizadas', value: '6', detail: 'Esperan aprobacion o firma.' },
      { label: 'Confirmadas', value: '12', detail: 'Reservas listas para operarse.' },
      { label: 'Canceladas', value: '2', detail: 'Casos con penalizacion o reembolso.' },
    ],
    actions: ['Crear reserva', 'Reasignar aeronave', 'Actualizar estado', 'Procesar cancelacion'],
    fields: ['Cliente', 'Origen', 'Destino', 'Fecha', 'Pasajeros', 'Tipo de aeronave', 'Paquete', 'Requerimientos'],
    details: ['Cliente', 'Ruta', 'Cotizacion', 'Aeronave', 'Operador', 'Sobrecargo', 'Contrato', 'Pago', 'Estado'],
    edits: ['Fecha', 'Horario', 'Aeronave', 'Operador', 'Sobrecargo', 'Paquete', 'Estado'],
    deactivation: ['Motivo de cancelacion', 'Penalizacion', 'Reembolso'],
    states: reservationStates,
  },
  pricing: {
    eyebrow: 'Pricing',
    title: 'Cotizaciones y pricing',
    description: 'Define costo proveedor, margen, fee plataforma y precio final por operacion.',
    highlights: [
      { label: 'Cotizaciones activas', value: '15', detail: 'Enviadas y dentro de vigencia.' },
      { label: 'Margen promedio', value: '29%', detail: 'Rentabilidad media del portafolio.' },
      { label: 'Descuentos activos', value: '4', detail: 'Ajustes comerciales vigentes.' },
      { label: 'Vencidas', value: '3', detail: 'Cotizaciones fuera de vigencia.' },
    ],
    actions: ['Crear cotizacion', 'Actualizar margen', 'Aplicar descuento', 'Expirar oferta'],
    fields: ['Cliente', 'Ruta', 'Fecha', 'Costo proveedor', 'Margen', 'Fee plataforma', 'Precio final'],
    details: ['Precio cliente', 'Costo interno', 'Margen', 'Vigencia', 'Estado'],
    edits: ['Margen', 'Descuento', 'Paquete', 'Vigencia'],
    deactivation: ['Cotizacion vencida', 'Cotizacion rechazada'],
  },
  paquetes: {
    eyebrow: 'Paquetes',
    title: 'Catalogo de paquetes',
    description: 'Configura membresias y beneficios comerciales segun tipo de cliente y nivel de servicio.',
    highlights: [
      { label: 'Activos', value: '6', detail: 'Paquetes visibles en oferta comercial.' },
      { label: 'Corporativos', value: '2', detail: 'Planes para cuentas enterprise.' },
      { label: 'Con concierge', value: '3', detail: 'Incluyen servicio premium adicional.' },
      { label: 'Ocultos', value: '1', detail: 'No visibles para venta actual.' },
    ],
    actions: ['Crear paquete', 'Actualizar beneficios', 'Cambiar precio', 'Ocultar paquete'],
    fields: ['Nombre', 'Precio', 'Beneficios', 'Limite de vuelos', 'Prioridad', 'Servicios incluidos'],
    details: ['Basico', 'Ejecutivo', 'VIP', 'Corporativo', 'Concierge', 'Catering incluido'],
    edits: ['Beneficios', 'Precio', 'Vigencia', 'Visibilidad'],
    deactivation: ['Ocultar paquete'],
  },
  contratos: {
    eyebrow: 'Contratos',
    title: 'Contratos y firma digital',
    description: 'Controla plantillas, clausulas, adjuntos y estados de firma por reserva.',
    highlights: [
      { label: 'En firma', value: '5', detail: 'Pendientes de completar por cliente.' },
      { label: 'Firmados', value: '18', detail: 'Contratos cerrados y vigentes.' },
      { label: 'Plantillas', value: '4', detail: 'Versiones disponibles por tipo de servicio.' },
      { label: 'Anulados', value: '1', detail: 'Documentos reemplazados o cancelados.' },
    ],
    actions: ['Crear contrato', 'Elegir plantilla', 'Adjuntar clausula', 'Anular version'],
    fields: ['Cliente', 'Reserva', 'Plantilla', 'Clausulas', 'Firma digital'],
    details: ['Estado', 'Firmantes', 'Fecha', 'Archivo'],
    edits: ['Clausulas', 'Version', 'Adjuntos'],
    deactivation: ['Contrato cancelado', 'Contrato reemplazado'],
  },
  pagos: {
    eyebrow: 'Finanzas',
    title: 'Pagos y finanzas',
    description: 'Supervisa cobros, facturas, reembolsos, comisiones y margen por reserva.',
    highlights: [
      { label: 'Pendientes', value: '6', detail: 'Ordenes de pago por cobrar o conciliar.' },
      { label: 'Pagados', value: '24', detail: 'Cobros confirmados exitosamente.' },
      { label: 'Reembolsos', value: '2', detail: 'Casos con salida de efectivo.' },
      { label: 'Margen acumulado', value: '$1.9M MXN', detail: 'Resultado consolidado del periodo.' },
    ],
    actions: ['Crear orden de pago', 'Subir factura', 'Actualizar estatus', 'Procesar reembolso'],
    fields: ['Cliente', 'Reserva', 'Monto', 'Metodo', 'Fecha limite'],
    details: ['Estado del pago', 'Factura', 'Comision', 'Margen', 'Reembolso'],
    edits: ['Estado', 'Factura', 'Comision', 'Penalizacion'],
    deactivation: ['Pago fallido', 'Reembolso', 'Cancelacion'],
    states: paymentStates,
  },
  incidencias: {
    eyebrow: 'Incidencias',
    title: 'Mesa de incidencias',
    description: 'Escala, asigna y cierra eventos operativos, comerciales y documentales.',
    highlights: [
      { label: 'Abiertas', value: '7', detail: 'Casos activos dentro del tablero.' },
      { label: 'Escaladas', value: '3', detail: 'Incidencias con impacto alto.' },
      { label: 'Resueltas', value: '18', detail: 'Eventos cerrados este mes.' },
      { label: 'Tiempo medio', value: '2.4 h', detail: 'Promedio de resolucion.' },
    ],
    actions: ['Crear incidencia', 'Asignar responsable', 'Subir evidencia', 'Cerrar caso'],
    fields: ['Reserva', 'Tipo', 'Prioridad', 'Responsable', 'Descripcion', 'Evidencia'],
    details: ['Estado', 'Historial', 'Responsable', 'Impacto'],
    edits: ['Prioridad', 'Responsable', 'Evidencia', 'Resolucion'],
    deactivation: ['Comentario final', 'Accion tomada'],
    states: incidentStates,
  },
  documentos: {
    eyebrow: 'Documentos',
    title: 'Repositorio documental',
    description: 'Concentra licencias, seguros, contratos, certificados, facturas e identificaciones.',
    highlights: [
      { label: 'Validos', value: '146', detail: 'Documentos aprobados y vigentes.' },
      { label: 'Por vencer', value: '8', detail: 'Requieren renovacion inmediata.' },
      { label: 'Rechazados', value: '3', detail: 'Archivos con observaciones.' },
      { label: 'Archivados', value: '21', detail: 'Versiones historicas o sustituidas.' },
    ],
    actions: ['Subir documento', 'Validar archivo', 'Rechazar documento', 'Archivar vencido'],
    fields: ['Licencias', 'Seguros', 'Contratos', 'Identificaciones', 'Certificados', 'Facturas'],
    details: ['Estado', 'Fecha de vencimiento', 'Entidad relacionada'],
    edits: ['Reemplazar archivo', 'Validar / Rechazar', 'Comentarios'],
    deactivation: ['Documento vencido', 'Documento incorrecto'],
  },
  notificaciones: {
    eyebrow: 'Notificaciones',
    title: 'Centro de notificaciones',
    description: 'Emite alertas manuales, recordatorios y mensajes operativos a cada actor del sistema.',
    highlights: [
      { label: 'Activas', value: '12', detail: 'Mensajes vigentes o pendientes de leer.' },
      { label: 'Urgentes', value: '4', detail: 'Alertas con prioridad alta.' },
      { label: 'Programadas', value: '7', detail: 'Recordatorios y comunicaciones futuras.' },
      { label: 'Obsoletas', value: '2', detail: 'Pendientes de limpiar o archivar.' },
    ],
    actions: ['Crear alerta manual', 'Programar recordatorio', 'Cambiar prioridad', 'Eliminar obsoleta'],
    fields: ['Alerta manual', 'Recordatorio', 'Mensaje operativo'],
    details: ['Historial', 'Destinatario', 'Estado'],
    edits: ['Prioridad', 'Mensaje', 'Destinatario'],
    deactivation: ['Notificacion obsoleta'],
  },
  analytics: {
    eyebrow: 'Analytics',
    title: 'Analitica del negocio',
    description: 'Mide conversion, CAC, LTV, margen, volumen y eficiencia operativa.',
    highlights: analyticsSummary.map((item) => ({
      label: item.label,
      value: item.value,
      detail: 'Indicador estrategico del negocio.',
    })),
    actions: ['Comparar periodos', 'Filtrar por segmento', 'Exportar reporte', 'Revisar margen por vuelo'],
    fields: ['Conversion Rate', 'Ticket promedio', 'Vuelos por mes', 'Margen por vuelo', 'CAC', 'LTV'],
    details: ['Utilizacion de flota', 'Tiempo de asignacion', 'Incidencias por operacion'],
    edits: ['Ventana de tiempo', 'Fuente', 'Segmento'],
    deactivation: ['No aplica cierre directo', 'Solo versionado de reportes'],
  },
  configuracion: {
    eyebrow: 'Configuracion',
    title: 'Configuracion central',
    description: 'Define reglas del sistema, permisos, plantillas, metodos de pago e integraciones.',
    highlights: [
      { label: 'Roles activos', value: '5', detail: 'Estructura vigente de acceso.' },
      { label: 'Plantillas', value: '9', detail: 'Contratos y mensajes reutilizables.' },
      { label: 'Integraciones', value: '4', detail: 'Servicios conectados al negocio.' },
      { label: 'Reglas SLA', value: '12', detail: 'Politicas activas de servicio.' },
    ],
    actions: ['Crear rol', 'Editar permisos', 'Ajustar margen minimo', 'Actualizar integracion'],
    fields: ['Roles', 'Permisos', 'Reglas anti-broker', 'Margenes minimos', 'SLA'],
    details: ['Estados de reserva', 'Plantillas de contrato', 'Metodos de pago', 'Integraciones', 'Notificaciones'],
    edits: ['Permisos', 'Matriz de estados', 'Plantillas', 'Metodos', 'Webhooks'],
    deactivation: ['Desactivar integracion', 'Archivar plantilla obsoleta'],
  },
}

function normalizeAdminAircraft(item = {}) {
  const docs = Array.isArray(item.documents) ? item.documents : []
  return {
    ...item,
    provider: item.provider || null,
    documents_valid: docs.length > 0,
    approved: item.status === 'active',
    trial_ends_at: item.trial_ends_at || null,
  }
}

function normalizeAdminCrewMember(item = {}) {
  const roleValue =
    item.effective_role ||
    item.role?.code ||
    item.role?.name ||
    item.operational_role ||
    item.role ||
    item.position ||
    ''
  const roleKey = String(roleValue || '').toLowerCase()
  const isCrew =
    roleKey.includes('sobrecargo') ||
    roleKey.includes('crew') ||
    roleKey.includes('cabin')

  if (!isCrew) return null

  return {
    id: item.id || Date.now(),
    name: item.name || item.full_name || 'Sobrecargo',
    email: item.email || '',
    phone: item.phone || item.phone_number || '',
    base: item.base || item.city || 'N/D',
    providerId: item.provider_id || item.proveedor_id || item.provider?.id || null,
    providerName:
      item.provider?.commercial_name ||
      item.provider?.company_name ||
      item.provider_name ||
      'Proveedor sin ligar',
    state: item.state || item.status || item.account_status || 'Disponible',
    profileState:
      item.profile_state ||
      item.validation_status ||
      item.review_status ||
      item.approval_status ||
      'Pendiente',
    certifications:
      Array.isArray(item.certifications) ? item.certifications.join(', ') : item.certifications || item.licenses || '',
    documentsSummary:
      item.documents_summary ||
      item.documents_status ||
      item.documents ||
      item.document_status ||
      'Expediente pendiente',
    rating: String(item.rating || item.score || '4.9/5'),
    adminNotes: item.admin_notes || item.observations || '',
    lastAudit: item.lastAudit || item.updated_at || 'Sin auditoria',
  }
}

const reservationRecords = computed(() => operations.value)

function pushAuditEntry(title, detail) {
  auditEntries.value.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    date: new Date().toISOString().slice(0, 16).replace('T', ' '),
    title,
    detail,
  })
}

function upsertCrewMember(member) {
  const index = crewMembers.value.findIndex((item) => item.id === member.id)
  if (index >= 0) {
    crewMembers.value.splice(index, 1, { ...crewMembers.value[index], ...member })
    return crewMembers.value[index]
  }

  crewMembers.value.unshift(member)
  return crewMembers.value[0]
}

async function loadDashboardKpis() {
  try {
    const dashboard = await api.get('/admin/dashboard')
    kpis.value = {
      ...(dashboard.kpis || fallbackAdminKpis),
      aeronaves_catalogo: aircraft.value.length,
      proveedores_catalogo: providers.value.length,
      suscripciones_aeronave: subscriptions.value.length,
    }
  } catch {
    kpis.value = {
      ...fallbackAdminKpis,
      aeronaves_catalogo: aircraft.value.length,
      proveedores_catalogo: providers.value.length,
      suscripciones_aeronave: subscriptions.value.length,
    }
  }
}

async function loadUsers() {
  try {
    const response = await api.get('/admin/users')
    users.value = response.users?.data || response.users || fallbackAdminUsers
  } catch {
    users.value = fallbackAdminUsers
  }
}

async function loadFlags() {
  try {
    const response = await api.get('/admin/anti-broker-flags')
    flags.value = response.flags?.data || response.flags || fallbackAdminFlags
  } catch {
    flags.value = fallbackAdminFlags
  }
}

async function loadAircraft() {
  try {
    const response = await requestWithCandidates([{ method: 'get', path: '/admin/fleet/aircraft' }])
    aircraft.value = pickCollection(response, ['aircraft']).map(normalizeAdminAircraft)
  } catch {
    aircraft.value = []
  }
}

async function loadSubscriptions() {
  try {
    const response = await requestWithCandidates([{ method: 'get', path: '/admin/fleet/aircraft-subscriptions' }])
    subscriptions.value = pickCollection(response, ['aircraft_subscriptions'])
  } catch {
    subscriptions.value = []
  }
}

async function loadProviders() {
  try {
    const response = await requestWithCandidates([
      { method: 'get', path: '/admin/operators' },
      { method: 'get', path: '/admin/proveedores' },
    ])
    providers.value = pickCollection(response, ['operators', 'proveedores'])
  } catch {
    providers.value = []
  }
}

async function loadCrewMembers() {
  const [crewResult, usersResult] = await Promise.allSettled([
    requestWithCandidates([
      { method: 'get', path: '/admin/sobrecargos' },
      { method: 'get', path: '/admin/crew' },
      { method: 'get', path: '/admin/users' },
    ]),
    users.value.length ? Promise.resolve({ users: users.value }) : api.get('/admin/users'),
  ])

  const usersCollection =
    usersResult.status === 'fulfilled'
      ? usersResult.value.users?.data || usersResult.value.users || fallbackAdminUsers
      : fallbackAdminUsers

  if (!users.value.length) {
    users.value = usersCollection
  }

  const directCrewCollection =
    crewResult.status === 'fulfilled'
      ? pickCollection(crewResult.value, ['sobrecargos', 'crew', 'users', 'data'])
      : []

  crewMembers.value = (directCrewCollection.length ? directCrewCollection : usersCollection)
    .map(normalizeAdminCrewMember)
    .filter(Boolean)
}

function isTimeoutLikeError(error) {
  return (
    error?.name === 'AbortError' ||
    String(error?.message || '')
      .toLowerCase()
      .includes('timeout')
  )
}

async function loadOperations(options = {}) {
  const preserveExistingOnEmpty = options.preserveExistingOnEmpty !== false
  if (operationsRequestPromise) return operationsRequestPromise

  operationsRequestPromise = (async () => {
    try {
      const nextOperations = await getAdminReservations({ timeoutMs: ADMIN_RESERVATIONS_TIMEOUT_MS })

      if (
        preserveExistingOnEmpty &&
        Array.isArray(nextOperations) &&
        nextOperations.length === 0 &&
        operations.value.length > 0
      ) {
        return
      }

      operations.value = nextOperations
      lastReservationsRefreshAt = Date.now()
    } catch {
      if (!preserveExistingOnEmpty) {
        operations.value = []
      }
    } finally {
      operationsRequestPromise = null
    }
  })()

  return operationsRequestPromise
}

async function loadPortalSection(section) {
  if (section === 'usuarios') {
    await loadUsers()
    return
  }

  if (section === 'alertas') {
    await loadFlags()
    return
  }

  if (section === 'proveedores') {
    await Promise.all([loadAircraft(), loadProviders()])
    return
  }

  if (section === 'aeronaves') {
    await loadAircraft()
    return
  }

  if (section === 'suscripciones') {
    await Promise.all([loadAircraft(), loadSubscriptions()])
    return
  }

  if (section === 'sobrecargos') {
    await Promise.all([loadCrewMembers(), loadOperations()])
    if (!auditEntries.value.length) {
      pushAuditEntry('Admin listo para auditar sobrecargos', 'Se inicializo la bitacora de validacion y asignacion.')
    }
    return
  }

  if (section === 'reservas') {
    await loadOperations()
    return
  }

  if (section === 'ejecutivo') {
    await loadDashboardKpis()
  }
}

function shouldAutoRefreshReservations() {
  return props.section === 'reservas'
}

function clearReservationsPolling() {
  if (reservationsPollTimer) {
    clearInterval(reservationsPollTimer)
    reservationsPollTimer = null
  }
}

function startReservationsPolling() {
  clearReservationsPolling()

  if (!shouldAutoRefreshReservations()) return

  reservationsPollTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return
    if (reservationFlowLoading.value) return
    if (Date.now() - lastReservationsRefreshAt < ADMIN_RESERVATIONS_REFRESH_COOLDOWN_MS) return
    void loadPortalSection('reservas')
  }, ADMIN_RESERVATIONS_POLL_INTERVAL_MS)
}

function handleReservationsVisibilityRefresh() {
  if (typeof document !== 'undefined' && document.hidden) return
  if (!shouldAutoRefreshReservations()) return
  if (reservationFlowLoading.value) return
  if (Date.now() - lastReservationsRefreshAt < ADMIN_RESERVATIONS_REFRESH_COOLDOWN_MS) return
  void loadPortalSection('reservas')
}

function auditUser(user) {
  const crewMember = normalizeAdminCrewMember(user)
  if (crewMember) {
    upsertCrewMember({
      ...crewMember,
      lastAudit: new Date().toISOString().slice(0, 16).replace('T', ' '),
    })
  }
  pushAuditEntry(
    `Auditoria de ${user.name}`,
    `Admin reviso permisos, estado y trazabilidad del usuario ${user.email || user.name}.`,
  )
  ui.pushToast({
    tone: 'success',
    title: 'Usuario auditado',
    message: `Se abrio la revision operativa para ${user.name}.`,
  })
}

async function updateCrewValidation(member, nextProfileState, note = '') {
  const payload = {
    profile_state: nextProfileState,
    validation_status: nextProfileState,
    status: nextProfileState === 'Suspendido' ? 'Suspendido' : member.state,
    admin_notes: note || member.adminNotes || '',
  }

  try {
    await requestWithCandidates([
      { method: 'put', path: `/admin/sobrecargos/${member.id}`, body: payload },
      { method: 'put', path: `/admin/crew/${member.id}`, body: payload },
      { method: 'put', path: `/admin/users/${member.id}`, body: payload },
    ])
  } catch {
    // Keep local admin governance available even when the backend route is still being completed.
  }

  upsertCrewMember({
    ...member,
    profileState: nextProfileState,
    state: nextProfileState === 'Suspendido' ? 'Suspendido' : member.state,
    adminNotes: note || member.adminNotes,
    lastAudit: new Date().toISOString().slice(0, 16).replace('T', ' '),
  })
}

async function approveCrew({ member, note }) {
  await updateCrewValidation(member, 'Aprobado', note)
  pushAuditEntry(
    `Sobrecargo aprobado: ${member.name}`,
    note || 'Expediente validado por administracion y listo para asignacion.',
  )
  ui.pushToast({
    tone: 'success',
    title: 'Sobrecargo aprobado',
    message: `${member.name} ya quedo habilitado para asignaciones operativas.`,
  })
}

async function rejectCrew({ member, note }) {
  await updateCrewValidation(member, 'Rechazado', note)
  pushAuditEntry(
    `Sobrecargo rechazado: ${member.name}`,
    note || 'El expediente requiere correcciones antes de liberar operacion.',
  )
  ui.pushToast({
    tone: 'info',
    title: 'Sobrecargo rechazado',
    message: `${member.name} quedo marcado con observaciones administrativas.`,
  })
}

async function suspendCrew({ member, note }) {
  await updateCrewValidation({ ...member, state: 'Suspendido' }, 'Suspendido', note)
  pushAuditEntry(
    `Sobrecargo suspendido: ${member.name}`,
    note || 'Se suspendio la elegibilidad operativa por control admin.',
  )
  ui.pushToast({
    tone: 'warning',
    title: 'Sobrecargo suspendido',
    message: `${member.name} ya no podra asignarse hasta nueva revision.`,
  })
}

function auditCrew({ member, note }) {
  upsertCrewMember({
    ...member,
    adminNotes: note || member.adminNotes,
    lastAudit: new Date().toISOString().slice(0, 16).replace('T', ' '),
  })
  pushAuditEntry(
    `Auditoria operativa: ${member.name}`,
    note || 'Se registro una auditoria administrativa del expediente y capacidad operativa.',
  )
  ui.pushToast({
    tone: 'success',
    title: 'Auditoria registrada',
    message: `La revision de ${member.name} ya quedo asentada en bitacora.`,
  })
}

async function assignCrewToOperation({ operationId, crewId, note }) {
  const operation = operations.value.find((item) => item.id === operationId)
  const member = crewMembers.value.find((item) => item.id === crewId)

  if (!operation || !member) {
    ui.pushToast({
      tone: 'error',
      title: 'Asignacion incompleta',
      message: 'Selecciona una operacion y un sobrecargo valido antes de asignar.',
    })
    return
  }

  const payload = {
    provider_id: operation.providerId || undefined,
    aircraft_id: operation.aircraftId || undefined,
    sobrecargo_user_id: member.id,
    crew_id: member.id,
    sobrecargo_id: member.id,
    crew_name: member.name,
    note: note || '',
  }

  try {
    await requestWithCandidates([
      { method: 'post', path: `/admin/requests/${operation.requestId || operationId}/assign`, body: payload },
    ])
  } catch {
    // Fall back to local synchronization until every backend route is available.
  }

  operations.value = operations.value.map((item) =>
    item.id === operationId
      ? {
          ...item,
          crew: member.name,
          crewId: member.id,
          notes: note ? `${item.notes} · ${note}` : item.notes,
        }
      : item,
  )

  upsertCrewMember({
    ...member,
    state: 'Asignado',
    lastAudit: new Date().toISOString().slice(0, 16).replace('T', ' '),
  })

  pushAuditEntry(
    `Asignacion confirmada: ${member.name}`,
    `Operacion #${operationId} asignada a ${member.name}.${note ? ` ${note}` : ''}`,
  )
  ui.pushToast({
    tone: 'success',
    title: 'Sobrecargo asignado',
    message: `${member.name} ya quedo ligado a la operacion #${operationId}.`,
  })
}

async function refreshNetworkState(title, message) {
  await loadPortalSection(props.section)
  ui.pushToast({ tone: 'success', title, message })
}

function pushReservationAudit(title, detail) {
  reservationAuditEntries.value.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    date: new Date().toISOString().slice(0, 16).replace('T', ' '),
    title,
    detail,
  })
}

function updateReservationLocalState(reservationId, patch) {
  const source = operations.value
  const targetIndex = source.findIndex((item) => item.id === reservationId)
  if (targetIndex === -1) return null

  const nextRecord = { ...source[targetIndex], ...patch }

  operations.value.splice(targetIndex, 1, nextRecord)

  return nextRecord
}

function applyExternalWorkflowSync(payload = {}) {
  const reservationId = Number(payload.reservationId || payload.requestId || 0)
  const nextStage = String(payload.nextStage || '').trim()
  if (!reservationId || !nextStage) return

  const currentReservation = reservationRecords.value.find(
    (item) =>
      Number(item.id || 0) === reservationId ||
      Number(item.requestId || 0) === reservationId ||
      Number(item.reservationId || 0) === reservationId,
  )

  if (!currentReservation) return

  const patch = {
    status: nextStage,
    workflowStatus: nextStage,
  }

  if (nextStage === 'contract_pending') {
    patch.contractStatus = 'generated'
  }

  if (nextStage === 'payment_pending') {
    patch.contractStatus = 'signed'
    patch.paymentStatus = 'Pendiente de pago'
  }

  updateReservationLocalState(currentReservation.id, patch)
}

async function handleUpdateReservationFlow({ reservationId, nextStage, note }) {
  const currentReservation = reservationRecords.value.find((item) => item.id === reservationId)
  if (!currentReservation) return

  try {
    reservationFlowLoading.value = true
    reservationFlowLoadingLabel.value = normalizeWorkflowLabel(nextStage)
    const updatedReservation = await updateAdminReservationStage(currentReservation, nextStage, note, {
      timeoutMs: ADMIN_FLOW_UPDATE_TIMEOUT_MS,
    })
    updateReservationLocalState(reservationId, updatedReservation)
    emitWorkflowSync({
      scope: 'reservation-workflow',
      reservationId,
      nextStage,
      action: 'updated',
      source: adminPortalInstanceId,
    })

    pushReservationAudit(
      `Flujo actualizado: reserva #${reservationId}`,
      `${currentReservation.clientName} paso a ${normalizeWorkflowLabel(nextStage)}.${note ? ` ${note}` : ''}`,
    )
    ui.pushToast({
      tone: 'success',
      title: 'Flujo actualizado',
      message: `La reserva #${reservationId} ya quedo en ${normalizeWorkflowLabel(nextStage)}.`,
    })
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo actualizar el flujo',
      message: isTimeoutLikeError(error)
        ? 'El backend tardó demasiado en responder. El cambio de flujo no fue confirmado.'
        : error?.message || 'El backend no confirmó el cambio de etapa.',
    })
  } finally {
    reservationFlowLoading.value = false
    reservationFlowLoadingLabel.value = ''
  }
}

async function handleDelayReservationFlow({ reservationId, reason, eta, note, mode }) {
  const currentReservation = reservationRecords.value.find((item) => item.id === reservationId)
  if (!currentReservation) return

  const nextMode = mode || 'delayed'

  try {
    const updatedReservation = await delayAdminReservation(
      currentReservation,
      { mode: nextMode, reason, eta, note },
      { timeoutMs: 20000 },
    )
    updateReservationLocalState(reservationId, updatedReservation)
    emitWorkflowSync({
      scope: 'reservation-workflow',
      reservationId,
      action: nextMode === 'blocked' ? 'blocked' : 'delayed',
      source: adminPortalInstanceId,
    })

    const label = nextMode === 'blocked' ? 'bloqueada' : 'retrasada'
    pushReservationAudit(
      `Reserva #${reservationId} ${label}`,
      `${currentReservation.clientName}: ${reason || 'Se marco una pausa administrativa.'}${eta ? ` ETA ${eta}.` : ''}${note ? ` ${note}` : ''}`,
    )
    ui.pushToast({
      tone: nextMode === 'blocked' ? 'warning' : 'info',
      title: nextMode === 'blocked' ? 'Flujo bloqueado' : 'Flujo retrasado',
      message: `La reserva #${reservationId} quedo ${label} para seguimiento admin.`,
    })
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo guardar la pausa',
      message: error?.message || 'El backend no confirmó el bloqueo o retraso.',
    })
  }
}

async function handleResumeReservationFlow({ reservationId, note }) {
  const currentReservation = reservationRecords.value.find((item) => item.id === reservationId)
  if (!currentReservation) return

  try {
    const updatedReservation = await resumeAdminReservation(currentReservation, note, {
      timeoutMs: 20000,
    })
    updateReservationLocalState(reservationId, updatedReservation)
    emitWorkflowSync({
      scope: 'reservation-workflow',
      reservationId,
      action: 'resumed',
      source: adminPortalInstanceId,
    })

    pushReservationAudit(
      `Reserva #${reservationId} reactivada`,
      `${currentReservation.clientName} regreso a flujo activo.${note ? ` ${note}` : ''}`,
    )
    ui.pushToast({
      tone: 'success',
      title: 'Flujo reanudado',
      message: `La reserva #${reservationId} ya puede continuar su proceso.`,
    })
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo reactivar el flujo',
      message: error?.message || 'El backend no confirmó la reactivación.',
    })
  }
}

async function handleApproveAircraft(aircraftId) {
  try {
    await requestWithCandidates([
      { method: 'post', path: `/admin/aeronaves/${aircraftId}/activar`, body: {} },
    ])
    await refreshNetworkState(
      'Aeronave activada',
      `La aeronave #${aircraftId} quedo activa en la base de datos.`,
    )
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo activar',
      message: error.message || 'Error en el backend.',
    })
  }
}

async function handleRejectAircraft(aircraftId) {
  try {
    await requestWithCandidates([
      { method: 'post', path: `/admin/aeronaves/${aircraftId}/bloquear`, body: {} },
    ])
    await refreshNetworkState(
      'Aeronave bloqueada',
      `La aeronave #${aircraftId} fue bloqueada en la base de datos.`,
    )
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo bloquear',
      message: error.message || 'Error en el backend.',
    })
  }
}

async function handleSuspendAircraft(aircraftId) {
  await handleRejectAircraft(aircraftId)
}

onMounted(() => {
  loadPortalSection(props.section)
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleReservationsVisibilityRefresh)
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleReservationsVisibilityRefresh)
  }
  removeWorkflowSyncSubscription = subscribeWorkflowSync((payload = {}) => {
    if (payload.scope !== 'reservation-workflow') return
    if (props.section !== 'reservas') return
    if (payload.source === adminPortalInstanceId) return
    applyExternalWorkflowSync(payload)
    if (Date.now() - lastReservationsRefreshAt < ADMIN_RESERVATIONS_REFRESH_COOLDOWN_MS) return
    loadPortalSection('reservas')
  })
  startReservationsPolling()
})

onBeforeUnmount(() => {
  clearReservationsPolling()
  if (removeWorkflowSyncSubscription) {
    removeWorkflowSyncSubscription()
    removeWorkflowSyncSubscription = null
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('focus', handleReservationsVisibilityRefresh)
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleReservationsVisibilityRefresh)
  }
})

watch(
  () => props.section,
  (section) => {
    loadPortalSection(section)
    startReservationsPolling()
  },
)
</script>

<template>
  <AdminExecutiveSection
    v-if="section === 'ejecutivo'"
    :kpis="displayKpis"
    :quick-actions="quickActions"
    :control-areas="controlAreas"
    :analytics="analyticsSummary"
    :flow-steps="flowSteps"
    :policies="policies"
    :reservation-states="reservationStates"
    :payment-states="paymentStates"
    :incident-states="incidentStates"
  />
  <AdminImportsSection v-else-if="section === 'importaciones'" />
  <AdminUsersSection v-else-if="section === 'usuarios'" :users="users" @audit-user="auditUser" />
  <AdminAlertsSection v-else-if="section === 'alertas'" :flags="flags" />
  <AdminProvidersNetworkSection
    v-else-if="section === 'proveedores'"
    :providers="providers"
    :aircraft="aircraft"
  />
  <AdminAircraftSubscriptionsSection
    v-else-if="section === 'aeronaves'"
    :aircraft="aircraft"
    :subscriptions="subscriptions"
    mode="aircraft"
    @approve-aircraft="handleApproveAircraft"
    @reject-aircraft="handleRejectAircraft"
    @suspend-aircraft="handleSuspendAircraft"
  />
  <AdminAircraftSubscriptionsSection
    v-else-if="section === 'suscripciones'"
    :aircraft="aircraft"
    :subscriptions="subscriptions"
    mode="subscriptions"
  />
  <AdminCrewOperationsSection
    v-else-if="section === 'sobrecargos'"
    :crew-members="crewMembers"
    :operations="operations"
    :audit-entries="auditEntries"
    @approve-crew="approveCrew"
    @reject-crew="rejectCrew"
    @suspend-crew="suspendCrew"
    @assign-crew="assignCrewToOperation"
    @audit-crew="auditCrew"
  />
  <AdminReservationsSection
    v-else-if="section === 'reservas'"
    :reservations="reservationRecords"
    :audit-entries="reservationAuditEntries"
    :is-flow-loading="reservationFlowLoading"
    :flow-loading-label="reservationFlowLoadingLabel"
    @update-flow="handleUpdateReservationFlow"
    @delay-flow="handleDelayReservationFlow"
    @resume-flow="handleResumeReservationFlow"
  />
  <AdminCrudSection
    v-else
    :eyebrow="adminSections[props.section]?.eyebrow || 'Admin'"
    :title="adminSections[props.section]?.title || 'Control administrativo'"
    :description="adminSections[props.section]?.description || 'Vista general de configuracion administrativa.'"
    :highlights="adminSections[props.section]?.highlights || []"
    :actions="adminSections[props.section]?.actions || []"
    :fields="adminSections[props.section]?.fields || []"
    :details="adminSections[props.section]?.details || []"
    :edits="adminSections[props.section]?.edits || []"
    :deactivation="adminSections[props.section]?.deactivation || []"
    :states="adminSections[props.section]?.states || []"
  />
</template>
