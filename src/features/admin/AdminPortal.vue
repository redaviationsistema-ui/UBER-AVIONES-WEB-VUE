<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { api } from '../../lib/api'
import { pickCollection, requestWithCandidates } from '../../lib/backendCrud'
import { fallbackAdminFlags, fallbackAdminKpis } from '../../data/platform'
import { useUiStore } from '../../stores/ui'
import { normalizeWorkflowLabel, resolveWorkflowState, SHARED_WORKFLOW_STEPS } from '../../utils/flightWorkflow'
import { emitWorkflowSync, subscribeWorkflowSync } from '../../lib/workflowSync'
import { resolveProviderRepresentativeName } from '../../lib/providerReview'

const AdminAlertsSection = defineAsyncComponent(() => import('./AdminAlertsSection.vue'))
const AdminAircraftSubscriptionsSection = defineAsyncComponent(() => import('./AdminAircraftSubscriptionsSection.vue'))
const AdminCrewAvailabilitySection = defineAsyncComponent(() => import('./AdminCrewAvailabilitySection.vue'))
const AdminCrewDirectorySection = defineAsyncComponent(() => import('./AdminCrewDirectorySection.vue'))
const AdminCrewOperationsSection = defineAsyncComponent(() => import('./AdminCrewOperationsSection.vue'))
const AdminContractsSection = defineAsyncComponent(() => import('./AdminContractsSection.vue'))
const AdminCrudSection = defineAsyncComponent(() => import('./AdminCrudSection.vue'))
const AdminExecutiveSection = defineAsyncComponent(() => import('./AdminExecutiveSection.vue'))
const AdminImportsSection = defineAsyncComponent(() => import('./AdminImportsSection.vue'))
const AdminIncidenciasPage = defineAsyncComponent(() => import('./AdminIncidenciasPage.vue'))
const AdminProvidersNetworkSection = defineAsyncComponent(() => import('./AdminProvidersNetworkSection.vue'))
const AdminReleasesSection = defineAsyncComponent(() => import('./AdminReleasesSection.vue'))
const AdminReservationsSection = defineAsyncComponent(() => import('./AdminReservationsSection.vue'))
const AdminSubscriptionsSection = defineAsyncComponent(() => import('./AdminSubscriptionsSection.vue'))
const AdminUsersSection = defineAsyncComponent(() => import('./AdminUsersSection.vue'))

const props = defineProps({
  section: { type: String, required: true },
})

const ui = useUiStore()
const IS_LOCAL_ADMIN_DEV =
  typeof window !== 'undefined' &&
  /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname || '')
const kpis = ref({})
const users = ref([])
const clients = ref([])
const flags = ref([])
const providers = ref([])
const aircraft = ref([])
const subscriptions = ref([])
const accessPayments = ref([])
const subscriptionPayments = ref([])
const contracts = ref([])
const crewMembers = ref([])
const crewAvailabilityStatuses = ref([])
const operations = ref([])
const auditEntries = ref([])
const reservationAuditEntries = ref([])
const rawSectionRecords = reactive({
  usuarios: [],
  clientes: [],
  alertas: [],
  proveedores: [],
  aeronaves: [],
  suscripciones: [],
  pagos_acceso: [],
  pagos_suscripcion: [],
  contratos: [],
  sobrecargos: [],
  reservas: [],
  liberaciones: [],
})
const reservationFlowLoading = ref(false)
const reservationFlowLoadingLabel = ref('')
const reservationFlowErrorMessage = ref('')
const reservationContentRefreshing = ref(false)
const clientTableRefreshing = ref(false)
let removeWorkflowSyncSubscription = null
let reservationsPollTimer = null
let reservationsRequestPromise = null
let releasesRequestPromise = null
let crewMembersRequestPromise = null
const portalSectionRequestPromises = new Map()
const lastPortalSectionLoadAt = new Map()
const adminPortalInstanceId = `admin-${Math.random().toString(16).slice(2, 10)}`
let lastReservationsRefreshAt = 0
let lastReleasesRefreshAt = 0
let lastCrewRefreshAt = 0
const ADMIN_RESERVATIONS_POLL_INTERVAL_MS = Number(
  import.meta.env.VITE_ADMIN_RESERVATIONS_POLL_INTERVAL_MS || (IS_LOCAL_ADMIN_DEV ? 30000 : 10000),
)
const ADMIN_RESERVATIONS_TIMEOUT_MS = Number(import.meta.env.VITE_ADMIN_RESERVATIONS_TIMEOUT_MS || 45000)
const ADMIN_FLOW_UPDATE_TIMEOUT_MS = Number(import.meta.env.VITE_ADMIN_FLOW_UPDATE_TIMEOUT_MS || 20000)
const ADMIN_USERS_TIMEOUT_MS = Number(import.meta.env.VITE_ADMIN_USERS_TIMEOUT_MS || 45000)
const ADMIN_CREW_TIMEOUT_MS = Number(import.meta.env.VITE_ADMIN_CREW_TIMEOUT_MS || 30000)
const ADMIN_PROVIDERS_TIMEOUT_MS = Number(import.meta.env.VITE_ADMIN_PROVIDERS_TIMEOUT_MS || 20000)
const ADMIN_RESERVATIONS_REFRESH_COOLDOWN_MS = 4000
const ADMIN_CREW_REFRESH_COOLDOWN_MS = 30000
const ADMIN_SECTION_REFRESH_THROTTLE_MS = Number(
  import.meta.env.VITE_ADMIN_SECTION_REFRESH_THROTTLE_MS || (IS_LOCAL_ADMIN_DEV ? 12000 : 5000),
)
const ADMIN_PROVIDERS_CACHE_KEY = 'red_admin_providers_cache_v1'
const adminReservationsLoadWarningShown = ref(false)
const clientUsers = computed(() =>
  (clients.value.length ? clients.value : users.value).filter((user) => {
    const role = String(user?.effective_role || user?.role || '').toLowerCase()
    return role.includes('client') || role.includes('cliente')
  }),
)
let adminReservationsModulePromise = null

async function loadAdminReservationsModule() {
  if (!adminReservationsModulePromise) {
    adminReservationsModulePromise = import('./adminReservationsApi')
  }

  return adminReservationsModulePromise
}

function getReservationRefreshTimestamp(section = props.section) {
  return section === 'liberaciones' ? lastReleasesRefreshAt : lastReservationsRefreshAt
}

function markReservationRefresh(section = props.section) {
  if (section === 'liberaciones') {
    lastReleasesRefreshAt = Date.now()
    return
  }

  lastReservationsRefreshAt = Date.now()
}

function isReservationRefreshCoolingDown(section = props.section) {
  return Date.now() - getReservationRefreshTimestamp(section) < ADMIN_RESERVATIONS_REFRESH_COOLDOWN_MS
}

function markCrewRefresh() {
  lastCrewRefreshAt = Date.now()
}

function isCrewRefreshCoolingDown() {
  return Date.now() - lastCrewRefreshAt < ADMIN_CREW_REFRESH_COOLDOWN_MS
}

function extractOperationRange(operation = {}) {
  const startCandidate =
    operation.departureDate ||
    String(operation.departure || '').slice(0, 10) ||
    String(operation.raw?.operation?.departure_datetime || '').slice(0, 10) ||
    String(operation.raw?.departure_datetime || '').slice(0, 10) ||
    String(operation.raw?.departure_date || '').slice(0, 10)

  const endCandidate =
    String(operation.arrival || '').slice(0, 10) ||
    String(operation.raw?.operation?.arrival_datetime || '').slice(0, 10) ||
    String(operation.raw?.arrival_datetime || '').slice(0, 10) ||
    String(operation.raw?.return_date || '').slice(0, 10)

  const from = /^\d{4}-\d{2}-\d{2}$/.test(startCandidate) ? startCandidate : ''
  const to = /^\d{4}-\d{2}-\d{2}$/.test(endCandidate) ? endCandidate : from

  return {
    from,
    to: to && to >= from ? to : from,
  }
}

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
    title: 'Cliente ',
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
  disponibilidad: {
    eyebrow: 'Sobrecargos',
    title: 'Disponibilidad de sobrecargos',
    description: 'Consulta y administra la disponibilidad diaria de todas las sobrecargos.',
    actions: ['Aprobar bloqueo', 'Rechazar bloqueo', 'Actualizar estado', 'Ver bitacora'],
    fields: ['Sobrecargo', 'Base', 'Dia', 'Estado', 'Comentario'],
    details: ['Semana operativa', 'Bloqueos', 'Operaciones ligadas', 'Bitacora'],
    edits: ['Estado', 'Comentario administrativo'],
  },
  'sobrecargos-en-vuelo': {
    eyebrow: 'Sobrecargos',
    title: 'Sobrecargos en vuelo',
    description: 'Monitorea vuelos con sobrecargo asignado y sigue su trazabilidad operativa en una mesa separada.',
    actions: ['Ver detalle', 'Reasignar sobrecargo', 'Actualizar seguimiento', 'Consultar bitacora'],
    fields: ['Vuelo', 'Fecha', 'Aeronave', 'Sobrecargo', 'Estado crew'],
    details: ['Ruta', 'Cliente', 'Presentacion', 'Incidencias', 'Trazabilidad'],
    edits: ['Sobrecargo', 'Hora de presentacion', 'Lugar de presentacion', 'Nota operativa'],
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
  'pagos-proveedor': {
    eyebrow: 'Operacion y proveedores',
    title: 'Pagos de proveedores',
    description: 'Monitorea cobros por aeronave, vigencias, referencias Stripe y renovaciones de toda la flota.',
    highlights: [
      { label: 'Aeronaves activas', value: '0', detail: 'Se reemplaza con datos reales del backend al cargar la vista.' },
      { label: 'Pendientes', value: '0', detail: 'Suscripciones o cobros que requieren seguimiento.' },
      { label: 'Pagados', value: '0', detail: 'Renovaciones confirmadas para proveedores.' },
      { label: 'Renovaciones proximas', value: '0', detail: 'Cobros cercanos por vencer o renovarse.' },
    ],
    actions: ['Ver aeronave', 'Ver proveedor', 'Revisar vigencia', 'Abrir evidencia Stripe'],
    fields: ['Aeronave', 'Proveedor', 'Estado', 'Monto', 'Vigencia', 'Referencia'],
    details: ['Timeline', 'Cobro confirmado', 'Proximo pago', 'Suscripcion', 'Eventos backend'],
    edits: ['Estado operativo', 'Seguimiento', 'Revision administrativa'],
    deactivation: ['Suscripcion vencida', 'Cobro fallido', 'Proveedor en pausa'],
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
    highlights: [],
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

function normalizeToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
}

function toFiniteNumber(value) {
  const parsed = Number.parseFloat(String(value ?? '').replace(/[^\d.]+/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function formatCount(value) {
  return new Intl.NumberFormat('es-MX').format(Number(value || 0))
}

function formatPercent(value, digits = 0) {
  const safe = Number.isFinite(value) ? value : 0
  return `${safe.toFixed(digits)}%`
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function average(values = []) {
  const numeric = values.map(toFiniteNumber).filter((value) => value > 0)
  if (!numeric.length) return 0
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length
}

function sampleRecordKeys(records = [], limit = 10) {
  const keys = []
  const seen = new Set()

  records.forEach((record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return
    Object.keys(record).forEach((key) => {
      if (seen.has(key)) return
      const value = record[key]
      if (value != null && typeof value !== 'object') {
        seen.add(key)
        keys.push(key)
      }
    })
  })

  return keys.slice(0, limit)
}

function sampleDatabaseKeys(records = [], limit = 10) {
  const prioritized = sampleRecordKeys(records, 24).filter((key) => {
    const normalized = normalizeToken(key)
    return (
      normalized === 'id' ||
      normalized.endsWith(' id') ||
      normalized.includes('status') ||
      normalized.includes('state') ||
      normalized.includes('date') ||
      normalized.includes('time') ||
      normalized.includes('created') ||
      normalized.includes('updated') ||
      normalized.includes('provider') ||
      normalized.includes('user') ||
      normalized.includes('request') ||
      normalized.includes('reservation') ||
      normalized.includes('contract') ||
      normalized.includes('payment')
    )
  })

  return (prioritized.length ? prioritized : sampleRecordKeys(records, limit)).slice(0, limit)
}

function countByStates(records = [], states = []) {
  return records.filter((record) => {
    const normalized = normalizeToken(
      record?.state ||
      record?.status ||
      record?.workflowStatus ||
      record?.profileState ||
      record?.operationalState ||
      '',
    )
    return states.some((state) => normalized.includes(normalizeToken(state)))
  }).length
}

const activeProvidersCount = computed(() =>
  providers.value.filter((item) => {
    const normalized = normalizeToken(item.status || item.state || item.approval_status || '')
    return ['active', 'activo', 'aprobado', 'approved'].some((token) => normalized.includes(token))
  }).length,
)

const activeAircraftCount = computed(() =>
  aircraft.value.filter((item) => normalizeToken(item.status || item.state || '').includes('active')).length,
)

const availableCrewCount = computed(() =>
  crewMembers.value.filter((item) => normalizeToken(item.state || item.operationalState || '') === 'disponible').length,
)

const crewInServiceCount = computed(() =>
  crewMembers.value.filter((item) => {
    const normalized = normalizeToken(item.state || item.operationalState || '')
    return normalized === 'en vuelo' || normalized === 'asignado'
  }).length,
)

const approvedCrewCount = computed(() =>
  crewMembers.value.filter((item) => normalizeToken(item.profileState || item.validationState || '').includes('aprob')).length,
)

const crewAlertsCount = computed(() =>
  crewMembers.value.filter((item) => {
    const state = normalizeToken(item.state || item.operationalState || '')
    const profile = normalizeToken(item.profileState || item.validationState || '')
    return ['no disponible', 'descanso', 'suspendido'].includes(state) || profile.includes('pend') || profile.includes('rech')
  }).length,
)

const activeReservationsCount = computed(() =>
  operations.value.filter((item) => {
    const normalized = normalizeToken(item.workflowStatus || item.status || '')
    return normalized && !['cancelada', 'finalizada', 'closed', 'cerrada'].some((token) => normalized.includes(token))
  }).length,
)

const pendingReservationsCount = computed(() =>
  operations.value.filter((item) => {
    const normalized = normalizeToken(item.workflowStatus || item.status || '')
    return ['pend', 'valid', 'cotiz', 'asign'].some((token) => normalized.includes(token))
  }).length,
)

const paymentsPendingCount = computed(() =>
  operations.value.filter((item) => normalizeToken(item.paymentStatus || '').includes('pend')).length,
)

const criticalIncidentsCount = computed(() =>
  operations.value.filter((item) => {
    const normalized = normalizeToken(item.incidentStatus || item.alertStatus || item.statusLabel || '')
    return ['crit', 'alta', 'escal'].some((token) => normalized.includes(token))
  }).length,
)

const executiveKpis = computed(() => [
  {
    label: 'Ventas del dia',
    value: kpis.value.mrr || fallbackAdminKpis.mrr,
    detail: 'Ingresos reportados por el dashboard administrativo.',
  },
  {
    label: 'Conversion a pago',
    value: kpis.value.conversion_a_pago || fallbackAdminKpis.conversion_a_pago,
    detail: 'Tasa de avance comercial tomada del dashboard administrativo.',
  },
  {
    label: 'Vuelos activos',
    value: formatCount(activeReservationsCount.value),
    detail: 'Reservas y operaciones que siguen en flujo activo.',
  },
  {
    label: 'Reservas pendientes',
    value: formatCount(pendingReservationsCount.value),
    detail: 'Solicitudes que todavia requieren avance operativo.',
  },
  {
    label: 'Pagos pendientes',
    value: formatCount(paymentsPendingCount.value),
    detail: 'Operaciones con estatus de pago pendiente en la data cargada.',
  },
  {
    label: 'Incidencias criticas',
    value: formatCount(criticalIncidentsCount.value),
    detail: 'Casos escalados o con impacto alto detectados en la operacion.',
  },
  {
    label: 'Proveedores activos',
    value: formatCount(activeProvidersCount.value || providers.value.length),
    detail: 'Partners sincronizados desde backend con acceso operativo.',
  },
  {
    label: 'Sobrecargos disponibles',
    value: formatCount(availableCrewCount.value),
    detail: 'Tripulacion lista para recibir una nueva asignacion.',
  },
])

const executiveAnalytics = computed(() => {
  const contractsSigned = countByStates(contracts.value, ['firmado', 'signed'])
  const conversionBase = operations.value.length || 1
  const conversion = Math.round((contractsSigned / conversionBase) * 100)
  const avgTicket = average(operations.value.map((item) => item.totalAmount || item.amount || item.price))
  const avgMargin = average(operations.value.map((item) => item.margin || item.marginPercent))
  const utilizationBase = aircraft.value.length || 1
  const utilization = Math.round((activeReservationsCount.value / utilizationBase) * 100)
  const assignmentTime = auditEntries.value.length ? Math.max(5, Math.round(auditEntries.value.length / 2)) : 0

  return [
    { label: 'Conversion rate', value: formatPercent(conversion), score: conversion },
    { label: 'Ticket promedio', value: avgTicket ? formatCurrency(avgTicket) : 'Sin dato', score: Math.min(100, Math.round(avgTicket / 1000)) },
    { label: 'Vuelos por mes', value: formatCount(operations.value.length), score: Math.min(100, operations.value.length * 5) },
    { label: 'Margen por vuelo', value: avgMargin ? formatPercent(avgMargin) : 'Sin dato', score: Math.min(100, Math.round(avgMargin)) },
    { label: 'Utilizacion de flota', value: formatPercent(utilization), score: Math.max(0, Math.min(100, utilization)) },
    { label: 'Tiempo de asignacion', value: assignmentTime ? `${assignmentTime} min` : 'Sin dato', score: Math.max(0, 100 - assignmentTime) },
  ]
})

const normalizedSectionSources = computed(() => ({
  usuarios: users.value,
  alertas: flags.value,
  proveedores: providers.value,
  aeronaves: aircraft.value,
  suscripciones: subscriptions.value,
  contratos: contracts.value,
  sobrecargos: crewMembers.value,
  disponibilidad: crewMembers.value,
  'sobrecargo-operaciones': crewMembers.value,
  'sobrecargos-en-vuelo': crewMembers.value,
  reservas: operations.value,
  liberaciones: operations.value,
}))

const dynamicSectionHighlights = computed(() => ({
  proveedores: [
    { label: 'Activos', value: formatCount(activeProvidersCount.value || providers.value.length), detail: 'Proveedores con presencia operativa en el backend.' },
    { label: 'En pausa', value: formatCount(Math.max(providers.value.length - activeProvidersCount.value, 0)), detail: 'Partners fuera de disponibilidad o pendientes de activacion.' },
    { label: 'Aeronaves ligadas', value: formatCount(aircraft.value.length), detail: 'Flota asociada a la red de proveedores cargada en sistema.' },
    { label: 'Suscripciones', value: formatCount(subscriptions.value.length), detail: 'Registros activos de suscripcion vinculados a aeronaves.' },
  ],
  aeronaves: [
    { label: 'Aeronaves activas', value: formatCount(activeAircraftCount.value || aircraft.value.length), detail: 'Flota con estatus operativo activo en backend.' },
    { label: 'Bloqueadas / pausa', value: formatCount(Math.max(aircraft.value.length - activeAircraftCount.value, 0)), detail: 'Unidades fuera de linea o sin liberar para operacion.' },
    { label: 'Documentos trazados', value: formatCount(aircraft.value.filter((item) => item.documents_valid).length), detail: 'Aeronaves que ya reportan evidencia documental en el payload.' },
    { label: 'Suscripciones', value: formatCount(subscriptions.value.length), detail: 'Registros comerciales asociados a la flota.' },
  ],
  sobrecargos: [
    { label: 'Disponibles', value: formatCount(availableCrewCount.value), detail: 'Tripulacion con estado operativo disponible.' },
    { label: 'En servicio', value: formatCount(crewInServiceCount.value), detail: 'Sobrecargos asignados o con operacion en curso.' },
    { label: 'Aprobados', value: formatCount(approvedCrewCount.value), detail: 'Perfiles con validacion administrativa aprobada.' },
    { label: 'Con alerta', value: formatCount(crewAlertsCount.value), detail: 'Expedientes que requieren seguimiento operativo o documental.' },
  ],
  disponibilidad: [
    { label: 'Disponibles', value: formatCount(availableCrewCount.value), detail: 'Sobrecargos listos para una nueva asignacion.' },
    { label: 'En servicio', value: formatCount(crewInServiceCount.value), detail: 'Tripulacion ya ligada a una operacion activa.' },
    { label: 'Aprobados', value: formatCount(approvedCrewCount.value), detail: 'Perfiles con expediente validado por admin.' },
    { label: 'Con alerta', value: formatCount(crewAlertsCount.value), detail: 'Casos que requieren seguimiento adicional.' },
  ],
  'sobrecargos-en-vuelo': [
    { label: 'En servicio', value: formatCount(crewInServiceCount.value), detail: 'Sobrecargos ya ligados a una operacion activa.' },
    { label: 'Disponibles', value: formatCount(availableCrewCount.value), detail: 'Tripulacion libre para nuevas asignaciones.' },
    { label: 'Aprobados', value: formatCount(approvedCrewCount.value), detail: 'Perfiles que ya pueden operar.' },
    { label: 'Con alerta', value: formatCount(crewAlertsCount.value), detail: 'Casos con seguimiento operativo o documental.' },
  ],
  reservas: [
    { label: 'Activas', value: formatCount(activeReservationsCount.value), detail: 'Reservas y vuelos que siguen en flujo operativo.' },
    { label: 'Pendientes', value: formatCount(pendingReservationsCount.value), detail: 'Solicitudes aun sin cierre de proceso.' },
    { label: 'Pagos pendientes', value: formatCount(paymentsPendingCount.value), detail: 'Operaciones donde la cobranza sigue abierta.' },
    { label: 'Con contrato', value: formatCount(contracts.value.length), detail: 'Contratos ya cargados dentro del contexto administrativo.' },
  ],
  contratos: [
    { label: 'Total contratos', value: formatCount(contracts.value.length), detail: 'Registros contractuales sincronizados con backend.' },
    { label: 'Firmados', value: formatCount(countByStates(contracts.value, ['firmado', 'signed'])), detail: 'Contratos ya confirmados por su estatus.' },
    { label: 'Pendientes', value: formatCount(countByStates(contracts.value, ['pend', 'draft', 'firma'])), detail: 'Contratos que siguen en revision o firma.' },
    { label: 'Anulados', value: formatCount(countByStates(contracts.value, ['cancel', 'anul'])), detail: 'Documentos cancelados o reemplazados.' },
  ],
  usuarios: [
    { label: 'Usuarios', value: formatCount(users.value.length), detail: 'Registros de usuario visibles desde admin.' },
    { label: 'Sobrecargos', value: formatCount(crewMembers.value.length), detail: 'Usuarios que ya pertenecen al flujo de cabina.' },
    { label: 'Proveedores', value: formatCount(providers.value.length), detail: 'Red operativa asociada al catalogo de usuarios.' },
    { label: 'Alertas', value: formatCount(flags.value.length), detail: 'Flags activos detectados por el sistema.' },
  ],
  alertas: [
    { label: 'Alertas activas', value: formatCount(flags.value.length), detail: 'Banderas de riesgo e incidencias visibles para administracion.' },
    { label: 'Criticas', value: formatCount(criticalIncidentsCount.value), detail: 'Eventos con seguimiento urgente detectados por la operacion.' },
    { label: 'Reservas activas', value: formatCount(activeReservationsCount.value), detail: 'Contexto vivo para correlacionar alertas operativas.' },
    { label: 'Sobrecargos con alerta', value: formatCount(crewAlertsCount.value), detail: 'Expedientes de cabina que hoy requieren atencion.' },
  ],
  analytics: executiveAnalytics.value.map((item) => ({
    label: item.label,
    value: item.value,
    detail: 'Indicador estrategico calculado con la data actual del portal.',
  })),
}))

const resolvedAdminSectionConfig = computed(() => {
  const base = adminSections[props.section] || {}
  const frontendRecords = normalizedSectionSources.value[props.section] || []
  const backendRecords = rawSectionRecords[props.section] || []

  return {
    eyebrow: base.eyebrow || 'Admin',
    title: base.title || 'Control administrativo',
    description: base.description || 'Vista general de configuracion administrativa.',
    highlights: dynamicSectionHighlights.value[props.section]?.length
      ? dynamicSectionHighlights.value[props.section]
      : base.highlights || [],
    actions: base.actions || [],
    fields: base.fields || [],
    details: base.details || [],
    edits: base.edits || [],
    deactivation: base.deactivation || [],
    states: base.states || [],
    frontendFields: sampleRecordKeys(frontendRecords, 12),
    backendFields: sampleRecordKeys(backendRecords, 12),
    databaseFields: sampleDatabaseKeys(backendRecords, 12),
  }
})

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

function normalizeAdminProvider(item = {}) {
  const provider = item && typeof item === 'object' ? item : {}
  const user = provider.user && typeof provider.user === 'object' ? provider.user : {}
  const profile = user.profile && typeof user.profile === 'object' ? user.profile : {}
  const aircraftMetrics =
    provider.aircraft_metrics && typeof provider.aircraft_metrics === 'object'
      ? provider.aircraft_metrics
      : null

  const representativeName = resolveProviderRepresentativeName({
    ...provider,
    user: {
      ...user,
      profile,
    },
  })

  return {
    ...provider,
    id: Number(provider.id || provider.provider_id || user.provider_id || 0),
    company_name:
      provider.company_name ||
      provider.commercial_name ||
      provider.legal_name ||
      provider.razon_social ||
      profile.company_name ||
      user.company_name ||
      'Proveedor',
    commercial_name:
      provider.commercial_name ||
      provider.display_name ||
      provider.trade_name ||
      provider.nombre_comercial ||
      provider.company_name ||
      provider.legal_name ||
      profile.company_name ||
      'Proveedor',
    legal_name:
      provider.legal_name ||
      provider.razon_social ||
      provider.company_name ||
      profile.legal_name ||
      profile.company_name ||
      '',
    representative_name:
      representativeName === 'Sin representante' ? '' : representativeName,
    contact_name:
      representativeName === 'Sin representante' ? 'Sin contacto' : representativeName,
    company_phone:
      provider.company_phone ||
      provider.phone ||
      profile.company_phone ||
      user.phone ||
      '',
    company_email:
      provider.company_email ||
      provider.email ||
      profile.company_email ||
      user.email ||
      '',
    rfc: provider.rfc || profile.rfc || '',
    base_airport:
      provider.base_airport ||
      provider.base ||
      provider.airport ||
      provider.location ||
      profile.base_airport ||
      'Base pendiente',
    status:
      provider.status ||
      provider.state ||
      provider.approval_status ||
      provider.validation_status ||
      user.status ||
      'pending',
    approval_status:
      provider.approval_status ||
      provider.status ||
      provider.state ||
      provider.validation_status ||
      user.status ||
      'pending',
    aircraft_metrics: aircraftMetrics
      ? {
          aircraft: Number(aircraftMetrics.aircraft || provider.aircraft_count || 0),
          active: Number(aircraftMetrics.active || provider.active_aircraft_count || 0),
          trial: Number(aircraftMetrics.trial || provider.trial_aircraft_count || 0),
          pending: Number(aircraftMetrics.pending || provider.pending_aircraft_count || 0),
        }
      : null,
    user,
  }
}

function isProviderRecord(item = {}) {
  const roleCandidates = resolveRoleCandidates(item)
  const providerLikeRole = roleCandidates.some((roleValue) => {
    const roleKey = normalizeToken(roleValue)
    return roleKey.includes('provider') || roleKey.includes('proveedor') || roleKey.includes('operador')
  })

  const providerObjectPresent =
    (item.provider && typeof item.provider === 'object') ||
    (item.proveedor && typeof item.proveedor === 'object') ||
    (item.ownedProvider && typeof item.ownedProvider === 'object') ||
    (item.owned_provider && typeof item.owned_provider === 'object')

  const hasProviderMarkers = Boolean(
    item.provider_id ||
    item.proveedor_id ||
    item.company_name ||
    item.commercial_name ||
    item.trade_name ||
    item.nombre_comercial ||
    item.base_airport,
  )

  return providerLikeRole || providerObjectPresent || hasProviderMarkers
}

function providerCatalogKey(item = {}) {
  const normalized = normalizeAdminProvider(item)
  const companyKey = normalizeToken(normalized.commercial_name || normalized.company_name)
  return normalized.id > 0 ? `id:${normalized.id}` : companyKey ? `name:${companyKey}` : ''
}

function canUseSessionStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

function writeProvidersCache(records = []) {
  if (!canUseSessionStorage()) return

  try {
    window.sessionStorage.setItem(
      ADMIN_PROVIDERS_CACHE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        records,
      }),
    )
  } catch {
    // Ignore storage quota or serialization issues and keep the UI responsive.
  }
}

function readProvidersCache() {
  if (!canUseSessionStorage()) return []

  try {
    const raw = window.sessionStorage.getItem(ADMIN_PROVIDERS_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed?.records) ? mergeProviderCatalog(parsed.records) : []
  } catch {
    return []
  }
}

function applyProvidersDataset(records = [], { cache = true } = {}) {
  const nextProviders = mergeProviderCatalog(records)
  rawSectionRecords.proveedores = records
  providers.value = nextProviders

  if (cache && nextProviders.length) {
    writeProvidersCache(records)
  }

  return nextProviders
}

function applyFallbackProvidersFromAircraft(records = []) {
  const fallbackProviders = deriveProvidersFromAircraft(records)
  rawSectionRecords.proveedores = fallbackProviders
  providers.value = fallbackProviders
  return fallbackProviders
}

function mergeProviderCatalog(records = []) {
  const catalog = new Map()

  records
    .filter(Boolean)
    .filter((item) => isProviderRecord(item))
    .map((item) => normalizeAdminProvider(item))
    .filter((item) => item.id || item.commercial_name || item.company_name)
    .forEach((item) => {
      const key = providerCatalogKey(item)
      if (!key) return

      const current = catalog.get(key)
      if (!current) {
        catalog.set(key, item)
        return
      }

      catalog.set(key, {
        ...current,
        ...item,
        commercial_name:
          item.commercial_name && item.commercial_name !== 'Proveedor' ? item.commercial_name : current.commercial_name,
        company_name:
          item.company_name && item.company_name !== 'Proveedor' ? item.company_name : current.company_name,
        contact_name:
          item.contact_name && item.contact_name !== 'Sin contacto' ? item.contact_name : current.contact_name,
        base_airport:
          item.base_airport && item.base_airport !== 'Base pendiente' ? item.base_airport : current.base_airport,
      })
    })

  return [...catalog.values()]
}

function deriveProvidersFromAircraft(records = []) {
  const catalog = new Map()

  records.forEach((item) => {
    const embeddedProvider = item?.provider && typeof item.provider === 'object' ? item.provider : null
    const fallbackId = item?.provider_id || item?.proveedor_id || embeddedProvider?.id || 0
    const normalized = normalizeAdminProvider({
      ...embeddedProvider,
      id: fallbackId,
      company_name:
        embeddedProvider?.company_name ||
        item?.provider_company_name ||
        item?.provider_name ||
        item?.provider_display_name,
      commercial_name:
        embeddedProvider?.commercial_name ||
        embeddedProvider?.display_name ||
        item?.provider_display_name ||
        item?.provider_name ||
        item?.provider_company_name,
      base_airport: embeddedProvider?.base_airport || item?.base_airport || item?.base,
      status: embeddedProvider?.status || embeddedProvider?.approval_status || 'active',
    })

    if (!normalized.id && !normalized.commercial_name && !normalized.company_name) return

    const key = normalized.id || normalized.commercial_name || normalized.company_name
    if (!catalog.has(key)) {
      catalog.set(key, normalized)
    }
  })

  return [...catalog.values()]
}

function resolveRoleCandidates(item = {}) {
  const directRoles = Array.isArray(item.roles)
    ? item.roles.map((role) => role?.code || role?.key || role?.name || role).filter(Boolean)
    : []
  const loginContextRoles = Array.isArray(item.login_context?.roles)
    ? item.login_context.roles
    : Array.isArray(item.loginContext?.roles)
      ? item.loginContext.roles
      : []
  const accessRoles = Array.isArray(item.access?.roles) ? item.access.roles : []

  return [
    item.effective_role,
    item.login_context?.effective_role,
    item.loginContext?.effective_role,
    item.access?.effective_role,
    item.role?.code,
    item.role?.name,
    item.operational_role,
    item.role,
    item.position,
    ...directRoles,
    ...loginContextRoles,
    ...accessRoles,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
}

function normalizeAdminCrewMember(item = {}) {
  const profile = item.profile && typeof item.profile === 'object' ? item.profile : {}
  const taxData = profile.tax_data && typeof profile.tax_data === 'object' ? profile.tax_data : {}
  const provider =
    (item.provider && typeof item.provider === 'object' ? item.provider : null) ||
    (item.proveedor && typeof item.proveedor === 'object' ? item.proveedor : null) ||
    (item.ownedProvider && typeof item.ownedProvider === 'object' ? item.ownedProvider : null) ||
    (item.owned_provider && typeof item.owned_provider === 'object' ? item.owned_provider : null)
  const certificationsArray = Array.isArray(item.certifications)
    ? item.certifications
    : Array.isArray(item.licenses)
      ? item.licenses
      : typeof item.certifications === 'string'
        ? item.certifications.split(',').map((value) => value.trim()).filter(Boolean)
        : typeof item.licenses === 'string'
          ? item.licenses.split(',').map((value) => value.trim()).filter(Boolean)
          : []
  const languagesArray = Array.isArray(item.languages)
    ? item.languages
    : typeof item.languages === 'string'
      ? item.languages.split(',').map((value) => value.trim()).filter(Boolean)
      : typeof item.idiomas === 'string'
        ? item.idiomas.split(',').map((value) => value.trim()).filter(Boolean)
        : []
  const documentsArray = Array.isArray(item.documents)
    ? item.documents
    : Array.isArray(item.files)
      ? item.files
      : []
  const documentsSummary =
    profile.documents_summary ||
    profile.documents_status ||
    item.documents_summary ||
    item.documents_status ||
    item.document_status ||
    profile.document_status ||
    (documentsArray.length ? `${documentsArray.length} documento(s)` : '')
  const roleCandidates = resolveRoleCandidates(item)
  const isCrew = roleCandidates.some((roleValue) => {
    const roleKey = String(roleValue || '').toLowerCase()
    return (
      roleKey.includes('sobrecargo') ||
      roleKey.includes('crew') ||
      roleKey.includes('cabin') ||
      roleKey.includes('cabina')
    )
  })

  if (!isCrew) return null

  return {
    id: item.id || Date.now(),
    name: item.name || item.full_name || 'Sobrecargo',
    email: item.email || '',
    phone: item.phone || item.phone_number || '',
    base:
      item.base ||
      item.base_airport ||
      item.base_name ||
      item.base_code ||
      item.city ||
      item.location ||
      profile.base_airport ||
      profile.city ||
      profile.base ||
      '',
    providerId: item.provider_id || item.proveedor_id || provider?.id || null,
    providerName:
      provider?.commercial_name ||
      provider?.company_name ||
      provider?.trade_name ||
      provider?.nombre_comercial ||
      item.provider_name ||
      item.operator_name ||
      item.company_name ||
      '',
    state:
      item.current_status ||
      profile.current_status ||
      taxData.current_status ||
      item.state ||
      item.status ||
      item.account_status ||
      '',
    profileState:
      profile.profile_state ||
      profile.validation_status ||
      taxData.profile_state ||
      taxData.validation_status ||
      item.profile_state ||
      item.validation_status ||
      item.review_status ||
      item.approval_status ||
      provider?.approval_status ||
      '',
    certifications:
      certificationsArray.length
        ? certificationsArray.join(', ')
        : item.certifications ||
          item.license ||
          item.licenses ||
          profile.certifications ||
          profile.licenses ||
          profile.document_type ||
          '',
    certificationsList: certificationsArray,
    languages: languagesArray.join(', '),
    documentsSummary,
    rating: item.rating || item.score || '',
    adminNotes: item.admin_notes || item.observations || '',
    lastAudit:
      item.lastAudit ||
      item.last_audit ||
      item.reviewed_at ||
      item.updated_at ||
      profile.updated_at ||
      profile.reviewed_at ||
      '',
    birthDate: profile.birth_date || '',
    nationality: profile.nationality || '',
    documentType: profile.document_type || '',
    documentNumber: profile.document_number || '',
    documentExpiration: profile.document_expiration || '',
    documentStatus:
      profile.document_status ||
      profile.documents_status ||
      item.document_status ||
      item.documents_status ||
      profile.ine_scan_status ||
      '',
    identityValidationRequired: profile.identity_validation_required ?? null,
    baseAirport: profile.base_airport || item.base_airport || '',
    raw: item,
  }
}

const reservationRecords = computed(() => operations.value)
const crewAuditEntries = computed(() => {
  return operations.value
    .filter((operation) => Number(operation?.raw?.operation?.id || operation?.operation?.id || 0) > 0)
    .map((operation) => {
      const rawOperation = operation?.raw?.operation || operation?.operation || {}
      const timeline = Array.isArray(rawOperation.timeline) ? rawOperation.timeline : []
      const latestTimelineEntry = timeline[0] || null
      const crewName = String(operation.crew || '').trim() || 'Sin sobrecargo'
      const operationStatus = String(rawOperation.status || operation.workflowStatus || operation.status || 'Sin estado')
      const aircraft = String(operation.aircraft || '').trim() || 'Aeronave por definir'

      return {
        id: `operation-${rawOperation.id || operation.id}`,
        date:
          String(latestTimelineEntry?.created_at || operation.departure || '')
            .replace('T', ' ')
            .slice(0, 16) || 'Sin fecha',
        title: `Operacion #${rawOperation.id || operation.id}`,
        detail: `Vuelo ${operation.folio || `RA-${operation.id}`} · ${aircraft} · ${crewName} · Estado ${operationStatus}`,
      }
    })
    .sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')))
})

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
    const response = await requestWithCandidates([
      { method: 'get', path: '/admin/users', timeoutMs: ADMIN_USERS_TIMEOUT_MS },
    ])
    const collection = pickCollection(response, ['users', 'usuarios'])
    rawSectionRecords.usuarios = collection
    users.value = collection
  } catch {
    rawSectionRecords.usuarios = []
    users.value = []
  }
}

async function loadClients() {
  try {
    const response = await requestWithCandidates([
      { method: 'get', path: '/admin/clientes', timeoutMs: ADMIN_USERS_TIMEOUT_MS },
      { method: 'get', path: '/admin/users', timeoutMs: ADMIN_USERS_TIMEOUT_MS },
    ])
    const collection = pickCollection(response, ['clients', 'clientes', 'users', 'usuarios'])
    rawSectionRecords.clientes = collection
    clients.value = collection
  } catch {
    rawSectionRecords.clientes = []
    clients.value = []
  }
}

async function loadFlags() {
  try {
    const response = await api.get('/admin/anti-broker-flags')
    const collection = response.flags?.data || response.flags || fallbackAdminFlags
    rawSectionRecords.alertas = Array.isArray(collection) ? collection : []
    flags.value = collection
  } catch {
    rawSectionRecords.alertas = fallbackAdminFlags
    flags.value = fallbackAdminFlags
  }
}

async function loadAircraft() {
  try {
    const response = await requestWithCandidates([
      { method: 'get', path: '/admin/fleet/aircraft' },
      { method: 'get', path: '/admin/aeronaves' },
    ])
    const collection = pickCollection(response, ['aircraft'])
    rawSectionRecords.aeronaves = collection
    aircraft.value = collection.map(normalizeAdminAircraft)
  } catch {
    rawSectionRecords.aeronaves = []
    aircraft.value = []
  }
}

async function loadSubscriptions() {
  try {
    const response = await requestWithCandidates([{ method: 'get', path: '/admin/fleet/aircraft-subscriptions' }])
    const collection = pickCollection(response, ['aircraft_subscriptions'])
    rawSectionRecords.suscripciones = collection
    subscriptions.value = collection
  } catch {
    rawSectionRecords.suscripciones = []
    subscriptions.value = []
  }
}

async function loadAccessPayments() {
  try {
    const response = await requestWithCandidates([{ method: 'get', path: '/admin/client-access-payments' }])
    const collection = pickCollection(response, ['access_payments'])
    rawSectionRecords.pagos_acceso = collection
    accessPayments.value = collection
  } catch {
    rawSectionRecords.pagos_acceso = []
    accessPayments.value = []
  }
}

async function reconcilePendingClientAccessPayments({ silent = true } = {}) {
  try {
    const response = await requestWithCandidates([
      { method: 'post', path: '/admin/client-access-payments/reconcile-pending', body: {}, timeoutMs: 30000 },
    ])

    const reconciled = Number(response?.reconciled || 0)
    if (!silent && reconciled > 0) {
      ui.pushToast({
        tone: 'success',
        title: 'Pagos conciliados',
        message: `Se confirmaron ${reconciled} pago${reconciled === 1 ? '' : 's'} pendientes en Stripe.`,
      })
    }
  } catch (error) {
    if (!silent) {
      ui.pushToast({
        tone: 'warning',
        title: 'No se pudo conciliar Stripe',
        message: error?.message || 'La tabla se refrescara con los datos locales disponibles.',
      })
    }
  }
}

async function loadSubscriptionPayments() {
  try {
    const response = await requestWithCandidates([{ method: 'get', path: '/admin/subscription-payments' }])
    const collection = pickCollection(response, ['subscription_payments'])
    rawSectionRecords.pagos_suscripcion = collection
    subscriptionPayments.value = collection
  } catch {
    rawSectionRecords.pagos_suscripcion = []
    subscriptionPayments.value = []
  }
}

async function loadProviders(options = {}) {
  try {
    const response = await requestWithCandidates([
      { method: 'get', path: '/admin/operators', timeoutMs: options.timeoutMs || ADMIN_PROVIDERS_TIMEOUT_MS },
      { method: 'get', path: '/admin/providers', timeoutMs: options.timeoutMs || ADMIN_PROVIDERS_TIMEOUT_MS },
      { method: 'get', path: '/admin/proveedores', timeoutMs: options.timeoutMs || ADMIN_PROVIDERS_TIMEOUT_MS },
    ])
    const collection = pickCollection(response, ['operators', 'proveedores', 'providers'])
    return applyProvidersDataset(collection)
  } catch {
    if (aircraft.value.length) {
      return applyFallbackProvidersFromAircraft(aircraft.value)
    }

    if (options.preserveExisting !== false && providers.value.length) {
      return providers.value
    }

    const cachedProviders = readProvidersCache()
    if (cachedProviders.length) {
      providers.value = cachedProviders
      return cachedProviders
    }

    rawSectionRecords.proveedores = []
    providers.value = []
    return []
  }
}

async function loadProvidersSectionData() {
  if (!providers.value.length) {
    const cachedProviders = readProvidersCache()
    if (cachedProviders.length) {
      providers.value = cachedProviders
    }
  }

  const providersRequest = loadProviders({
    preserveExisting: true,
    timeoutMs: ADMIN_PROVIDERS_TIMEOUT_MS,
  })
  const aircraftRequest = loadAircraft()
    .then(() => {
      if (!providers.value.length && aircraft.value.length) {
        applyFallbackProvidersFromAircraft(aircraft.value)
      }
    })
    .catch(() => {})

  if (providers.value.length) {
    void Promise.allSettled([providersRequest, aircraftRequest])
  } else {
    await Promise.race([
      providersRequest,
      aircraftRequest,
    ])
  }

  const hasEmbeddedAircraftMetrics = providers.value.some((provider) => {
    const metrics = provider?.aircraft_metrics
    return metrics && typeof metrics === 'object'
  })

  if (hasEmbeddedAircraftMetrics) {
    return
  }

  if (!providers.value.length) {
    await aircraftRequest
  } else {
    void aircraftRequest.then(() => {
      if (!providers.value.length && aircraft.value.length) {
        applyFallbackProvidersFromAircraft(aircraft.value)
      }
    })
  }

  if (!providers.value.length && aircraft.value.length) {
    applyFallbackProvidersFromAircraft(aircraft.value)
  }
}

async function loadContracts() {
  try {
    const response = await requestWithCandidates([{ method: 'get', path: '/admin/contracts' }])
    const collection = pickCollection(response, ['contracts'])
    rawSectionRecords.contratos = collection
    contracts.value = collection
  } catch {
    rawSectionRecords.contratos = []
    contracts.value = []
  }
}

async function loadCrewMembers(options = {}) {
  if (crewMembersRequestPromise) return crewMembersRequestPromise

  const timeoutMs = options.timeoutMs || ADMIN_CREW_TIMEOUT_MS
  crewMembersRequestPromise = (async () => {
    const crewResult = await requestWithCandidates([
      { method: 'get', path: '/admin/sobrecargos', timeoutMs },
      { method: 'get', path: '/admin/crew', timeoutMs },
    ])

    const directCrewCollection = pickCollection(crewResult, ['sobrecargos', 'crew', 'data'])
    const usersCollection = users.value.filter((item) => normalizeAdminCrewMember(item))

    rawSectionRecords.sobrecargos = directCrewCollection.length ? directCrewCollection : usersCollection

    crewMembers.value = (directCrewCollection.length ? directCrewCollection : usersCollection)
      .map(normalizeAdminCrewMember)
      .filter(Boolean)
    markCrewRefresh()
  })()

  try {
    await crewMembersRequestPromise
  } finally {
    crewMembersRequestPromise = null
  }
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
  const silent = options.silent !== false
  if (reservationsRequestPromise) return reservationsRequestPromise

  reservationsRequestPromise = (async () => {
    try {
      const { getAdminReservations } = await loadAdminReservationsModule()
      const nextOperations = await getAdminReservations({
        timeoutMs: options.timeoutMs || ADMIN_RESERVATIONS_TIMEOUT_MS,
      })

      if (
        preserveExistingOnEmpty &&
        Array.isArray(nextOperations) &&
        nextOperations.length === 0 &&
        operations.value.length > 0
      ) {
        return
      }

      operations.value = nextOperations
      rawSectionRecords.reservas = nextOperations
      markReservationRefresh('reservas')
      adminReservationsLoadWarningShown.value = false
    } catch (error) {
      if (!preserveExistingOnEmpty) {
        rawSectionRecords.reservas = []
        operations.value = []
      }

      if (!silent && !adminReservationsLoadWarningShown.value) {
        adminReservationsLoadWarningShown.value = true
        ui.pushToast({
          tone: 'warning',
          title: 'No se pudieron cargar las reservas',
          message: isTimeoutLikeError(error)
            ? 'El backend admin tardo mas de lo esperado al responder /admin/requests. Intenta de nuevo o aumenta el timeout.'
            : error?.message || 'La vista de reservas no pudo sincronizarse con el backend.',
        })
      }
    } finally {
      reservationsRequestPromise = null
    }
  })()

  return reservationsRequestPromise
}

async function loadReleases(options = {}) {
  const preserveExistingOnEmpty = options.preserveExistingOnEmpty !== false
  const silent = options.silent !== false
  if (releasesRequestPromise) return releasesRequestPromise

  releasesRequestPromise = (async () => {
    try {
      const { getAdminReservations } = await loadAdminReservationsModule()
      const nextOperations = await getAdminReservations({
        timeoutMs: options.timeoutMs || ADMIN_RESERVATIONS_TIMEOUT_MS,
      })

      if (
        preserveExistingOnEmpty &&
        Array.isArray(nextOperations) &&
        nextOperations.length === 0 &&
        operations.value.length > 0
      ) {
        return
      }

      operations.value = nextOperations
      rawSectionRecords.liberaciones = nextOperations
      markReservationRefresh('liberaciones')
      adminReservationsLoadWarningShown.value = false
    } catch (error) {
      if (!preserveExistingOnEmpty) {
        rawSectionRecords.liberaciones = []
        operations.value = []
      }

      if (!silent && !adminReservationsLoadWarningShown.value) {
        adminReservationsLoadWarningShown.value = true
        ui.pushToast({
          tone: 'warning',
          title: 'No se pudieron cargar las liberaciones',
          message: isTimeoutLikeError(error)
            ? 'El backend admin tardo mas de lo esperado al responder /admin/requests. Intenta de nuevo o aumenta el timeout.'
            : error?.message || 'La vista de liberaciones no pudo sincronizarse con el backend.',
        })
      }
    } finally {
      releasesRequestPromise = null
    }
  })()

  return releasesRequestPromise
}

function hasCrewSectionCache() {
  return crewMembers.value.length > 0 || operations.value.length > 0
}

async function loadCrewSection(options = {}) {
  const preserveExistingOnEmpty = options.preserveExistingOnEmpty !== false
  const shouldReuseWarmCache = options.shouldReuseWarmCache !== false

  if (shouldReuseWarmCache && isCrewRefreshCoolingDown() && hasCrewSectionCache()) {
    return
  }

  await Promise.all([
    loadCrewMembers({
      timeoutMs: options.timeoutMs || ADMIN_CREW_TIMEOUT_MS,
      allowUsersFallback: options.allowUsersFallback !== false,
    }),
    loadOperations({
      silent: options.silentOperations !== false,
      preserveExistingOnEmpty,
    }),
  ])

  if (!auditEntries.value.length) {
    pushAuditEntry('Admin listo para auditar sobrecargos', 'Se inicializo la bitacora de validacion y asignacion.')
  }
}

function loadCrewSectionBackground(options = {}) {
  void loadCrewSection(options)
}

async function loadExecutiveSection() {
  await Promise.allSettled([
    loadFlags(),
    loadProviders(),
    loadAircraft(),
    loadSubscriptions(),
    loadContracts(),
  ])

  await Promise.allSettled([
    loadCrewMembers({ timeoutMs: ADMIN_CREW_TIMEOUT_MS, allowUsersFallback: true }),
    loadOperations({ silent: false, timeoutMs: ADMIN_RESERVATIONS_TIMEOUT_MS }),
  ])

  await loadDashboardKpis()
}

async function loadPortalSection(section) {
  if (section === 'usuarios') {
    await loadUsers()
    return
  }

  if (section === 'clientes') {
    await loadClients()
    void loadAccessPayments()
    void reconcilePendingClientAccessPayments({ silent: true })
    return
  }

  if (section === 'alertas') {
    await loadFlags()
    return
  }

  if (section === 'proveedores') {
    await loadProvidersSectionData()
    return
  }

  if (section === 'aeronaves') {
    await loadAircraft()
    return
  }

  if (section === 'suscripciones') {
    await reconcilePendingClientAccessPayments({ silent: true })
    await Promise.all([loadAircraft(), loadSubscriptions(), loadClients(), loadAccessPayments(), loadSubscriptionPayments()])
    return
  }

  if (section === 'pagos' || section === 'pagos-proveedor') {
    await reconcilePendingClientAccessPayments({ silent: true })
    await Promise.all([loadAircraft(), loadSubscriptions(), loadClients(), loadAccessPayments(), loadSubscriptionPayments()])
    return
  }

  if (section === 'sobrecargos' || section === 'disponibilidad' || section === 'sobrecargo-operaciones' || section === 'sobrecargos-en-vuelo') {
    if (section === 'disponibilidad') {
      await loadOperations({
        silent: true,
        preserveExistingOnEmpty: true,
      })
    } else {
      await loadCrewSection({
        allowUsersFallback: true,
        shouldReuseWarmCache: false,
        preserveExistingOnEmpty: true,
        silentOperations: true,
      })
    }
    return
  }

  if (section === 'reservas') {
    await loadOperations({ silent: false })
    return
  }

  if (section === 'contratos') {
    await loadContracts()
    return
  }

  if (section === 'liberaciones') {
    await loadReleases({ silent: false })
    return
  }

  if (section === 'ejecutivo') {
    await loadExecutiveSection()
  }
}

function shouldAutoRefreshReservations() {
  return ['reservas', 'liberaciones'].includes(props.section)
}

function shouldAutoRefreshCrewSection() {
  return false
}

function shouldWarmCrewSection(section = props.section) {
  if (IS_LOCAL_ADMIN_DEV) return false

  return ![
    'ejecutivo',
    'proveedores',
    'aeronaves',
    'sobrecargos',
    'disponibilidad',
    'sobrecargo-operaciones',
    'sobrecargos-en-vuelo',
    'reservas',
    'liberaciones',
  ].includes(section)
}

function shouldThrottlePortalSectionLoad(section = props.section, force = false) {
  if (force) return false

  const lastLoadedAt = Number(lastPortalSectionLoadAt.get(section) || 0)
  return Date.now() - lastLoadedAt < ADMIN_SECTION_REFRESH_THROTTLE_MS
}

function requestPortalSectionLoad(section = props.section, options = {}) {
  const { force = false } = options

  if (!section) return Promise.resolve()

  const existingRequest = portalSectionRequestPromises.get(section)
  if (existingRequest) return existingRequest
  if (shouldThrottlePortalSectionLoad(section, force)) return Promise.resolve()

  lastPortalSectionLoadAt.set(section, Date.now())

  const requestPromise = (async () => {
    try {
      await loadPortalSection(section)
    } finally {
      if (portalSectionRequestPromises.get(section) === requestPromise) {
        portalSectionRequestPromises.delete(section)
      }
    }
  })()

  portalSectionRequestPromises.set(section, requestPromise)
  return requestPromise
}

function clearReservationsPolling() {
  if (reservationsPollTimer) {
    clearInterval(reservationsPollTimer)
    reservationsPollTimer = null
  }
}

function startReservationsPolling() {
  clearReservationsPolling()

  if (!shouldAutoRefreshReservations() && !shouldAutoRefreshCrewSection()) return

  reservationsPollTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return
    if (reservationFlowLoading.value) return
    if (shouldAutoRefreshReservations() && isReservationRefreshCoolingDown(props.section)) return
    void requestPortalSectionLoad(props.section)
  }, ADMIN_RESERVATIONS_POLL_INTERVAL_MS)
}

function handleReservationsVisibilityRefresh() {
  if (typeof document !== 'undefined' && document.hidden) return
  if (!shouldAutoRefreshReservations() && !shouldAutoRefreshCrewSection()) return
  if (reservationFlowLoading.value) return
  if (shouldAutoRefreshReservations() && isReservationRefreshCoolingDown(props.section)) return
  void requestPortalSectionLoad(props.section)
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

async function updateCrewValidation(member, nextProfileState, note = '', nextOperationalState = member.state, backendStatus = nextOperationalState) {
  const payload = {
    profile_state: nextProfileState,
    validation_status: nextProfileState,
    status: backendStatus,
    current_status: nextOperationalState,
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
    state: nextOperationalState,
    adminNotes: note || member.adminNotes,
    lastAudit: new Date().toISOString().slice(0, 16).replace('T', ' '),
  })
}

async function approveCrew({ member, note }) {
  await updateCrewValidation(member, 'Aprobado', note, 'Activo', 'active')
  emitWorkflowSync({
    scope: 'crew-status',
    crewUserId: member.id,
    nextProfileState: 'Aprobado',
    nextOperationalState: 'Activo',
    source: adminPortalInstanceId,
  })
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
  emitWorkflowSync({
    scope: 'crew-status',
    crewUserId: member.id,
    nextProfileState: 'Rechazado',
    nextOperationalState: member.state,
    source: adminPortalInstanceId,
  })
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
  await updateCrewValidation({ ...member, state: 'Suspendido' }, 'Suspendido', note, 'Suspendido', 'suspended')
  emitWorkflowSync({
    scope: 'crew-status',
    crewUserId: member.id,
    nextProfileState: 'Suspendido',
    nextOperationalState: 'Suspendido',
    source: adminPortalInstanceId,
  })
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

async function assignCrewToOperation({
  operationId,
  crewId,
  note,
  presentationTime,
  presentationPlace,
  presentationPlaceType,
  presentationPlaceDetail,
  onSuccess,
  onError,
}) {
  const normalizedOperationId = Number(operationId || 0)
  const normalizedCrewId = Number(crewId || 0)
  const operation = operations.value.find((item) => Number(item.id || 0) === normalizedOperationId)
  const member = crewMembers.value.find((item) => Number(item.id || 0) === normalizedCrewId)

  if (!operation || !member) {
    onError?.({ message: 'Selecciona una operacion y un sobrecargo valido antes de asignar.' })
    ui.pushToast({
      tone: 'error',
      title: 'Asignacion incompleta',
      message: 'Selecciona una operacion y un sobrecargo valido antes de asignar.',
    })
    return
  }

  const normalizedOperationStatus = normalizeToken(operation.workflowStatus || operation.status || '')
  if (
    normalizedOperationStatus.includes('cancel') ||
    normalizedOperationStatus.includes('finaliz') ||
    normalizedOperationStatus.includes('cerrad')
  ) {
    onError?.({ message: 'La operacion ya esta cerrada, cancelada o finalizada.' })
    ui.pushToast({
      tone: 'warning',
      title: 'Operacion no asignable',
      message: 'La operacion ya esta cerrada, cancelada o finalizada.',
    })
    return
  }

  const currentWorkflowId = resolveWorkflowState(operation.workflowStatus || operation.status || '').id
  if (!['flight_confirmed', 'tracking_live'].includes(currentWorkflowId)) {
    onError?.({ message: 'La asignacion de sobrecargo se habilita cuando el vuelo ya quedo confirmado para despacho operativo.' })
    ui.pushToast({
      tone: 'warning',
      title: 'Asignacion bloqueada',
      message: 'La asignacion de sobrecargo se habilita cuando el vuelo ya quedo confirmado para despacho operativo.',
    })
    return
  }

  const normalizedCrewStatus = normalizeToken(member.state || member.operationalState || '')
  const normalizedCrewProfileStatus = normalizeToken(member.profileState || member.validationState || '')
  const memberAssignedToCurrentOperation = operations.value.some(
    (item) =>
      Number(item.id || 0) === normalizedOperationId &&
      Number(item.crewId || 0) === Number(member.id || 0),
  )

  const crewHasBlockedValidationState =
    normalizedCrewProfileStatus.includes('rech') ||
    normalizedCrewProfileStatus.includes('pend') ||
    normalizedCrewProfileStatus.includes('suspend')

  if (crewHasBlockedValidationState) {
    onError?.({ message: `${member.name} todavia no cuenta con validacion operativa para asignarse.` })
    ui.pushToast({
      tone: 'warning',
      title: 'Sobrecargo no elegible',
      message: `${member.name} todavia no cuenta con validacion operativa para asignarse.`,
    })
    return
  }

  if (
    !['disponible', 'active', 'activo', 'assigned', 'asignado'].includes(normalizedCrewStatus) &&
    !memberAssignedToCurrentOperation
  ) {
    onError?.({ message: `${member.name} no esta disponible para una nueva asignacion.` })
    ui.pushToast({
      tone: 'warning',
      title: 'Sobrecargo no disponible',
      message: `${member.name} no esta disponible para una nueva asignacion.`,
    })
    return
  }

  const duplicateAssignment = operations.value.find(
    (item) =>
      Number(item.id || 0) !== normalizedOperationId &&
      Number(item.crewId || 0) === Number(member.id || 0) &&
      !['cancelada', 'finalizada', 'cerrada'].some((token) =>
        normalizeToken(item.workflowStatus || item.status || '').includes(token),
      ),
  )

  if (duplicateAssignment) {
    onError?.({ message: `${member.name} ya tiene una operacion activa ligada al folio ${duplicateAssignment.folio || `RA-${duplicateAssignment.id}`}.` })
    ui.pushToast({
      tone: 'error',
      title: 'Asignacion duplicada',
      message: `${member.name} ya tiene una operacion activa ligada al folio ${duplicateAssignment.folio || `RA-${duplicateAssignment.id}`}.`,
    })
    return
  }

  const operationRange = extractOperationRange(operation)
  if (!operationRange.from) {
    onError?.({ message: 'No pudimos identificar el rango operativo del vuelo para asignar.' })
    ui.pushToast({
      tone: 'error',
      title: 'Operacion sin fechas',
      message: 'No pudimos identificar el rango operativo del vuelo para asignar y bloquear disponibilidad.',
    })
    return
  }

  const nextPresentationTime = String(presentationTime || operation.briefingTime || '').trim()
  const nextPresentationPlace = String(
    presentationPlace ||
      operation.presentationPlace ||
      operation.origin ||
      [presentationPlaceType, presentationPlaceDetail].filter(Boolean).join(' · '),
  ).trim()
  const nextOperationalNote = String(note || '').trim()

  const payload = {
    provider_id: operation.providerId || undefined,
    aircraft_id: operation.aircraftId || undefined,
    sobrecargo_user_id: member.id,
    crew_id: member.id,
    sobrecargo_id: member.id,
    crew_name: member.name,
    note: nextOperationalNote || undefined,
    briefing_time: nextPresentationTime || undefined,
    presentation_time: nextPresentationTime || undefined,
    presentation_place: nextPresentationPlace || undefined,
    presentation_location: nextPresentationPlace || undefined,
  }

  let dedicatedAssignmentResponse = null

  const persistentAssignmentPatch = {
    sobrecargo_user_id: member.id,
    crew_id: member.id,
    sobrecargo_id: member.id,
    crew_member_id: member.id,
    crew_name: member.name,
    crew_status: 'pending_crew_response',
    briefing_time: nextPresentationTime || undefined,
    presentation_time: nextPresentationTime || undefined,
    presentation_place: nextPresentationPlace || undefined,
    presentation_location: nextPresentationPlace || undefined,
    notes: nextOperationalNote ? `${operation.notes || ''} · ${nextOperationalNote}`.replace(/^ · /, '') : operation.notes,
  }

  try {
    dedicatedAssignmentResponse = await requestWithCandidates([
      { method: 'post', path: `/admin/requests/${operation.requestId || operationId}/assign`, body: payload },
    ])
  } catch (error) {
    onError?.({ message: error?.message || 'El backend no permitio asignar la sobrecargo a este vuelo.' })
    ui.pushToast({
      tone: 'error',
      title: 'Asignacion rechazada',
      message: error?.message || 'El backend no permitio asignar la sobrecargo a este vuelo.',
    })
    return
  }

  const persistentReservation = null
  updateReservationLocalState(operation.id, {
    crew: member.name,
    crewId: member.id,
    crewOperationalState: 'pending_crew_response',
    briefingTime: nextPresentationTime || '',
    presentationPlace: nextPresentationPlace || '',
    notes: persistentAssignmentPatch.notes,
  })

  const promotedWorkflowStage = currentWorkflowId === 'flight_confirmed' ? 'tracking_live' : ''
  const visibleWorkflowStage = currentWorkflowId === 'tracking_live' ? 'tracking_live' : promotedWorkflowStage

  if (promotedWorkflowStage) {
    try {
      const { updateAdminReservationStage } = await loadAdminReservationsModule()
      const updatedReservation = await updateAdminReservationStage(
        operation,
        promotedWorkflowStage,
        nextOperationalNote || `Sobrecargo asignado: ${member.name}`,
        { timeoutMs: ADMIN_FLOW_UPDATE_TIMEOUT_MS },
      )
      updateReservationLocalState(operation.id, updatedReservation)
    } catch {
      updateReservationLocalState(operation.id, {
        status: promotedWorkflowStage,
        workflowStatus: promotedWorkflowStage,
      })
    }

    emitWorkflowSync({
      scope: 'reservation-workflow',
      reservationId: operation.reservationId || operation.id,
      requestId: operation.requestId || operation.id,
      nextStage: promotedWorkflowStage,
      action: 'crew-assigned',
      source: adminPortalInstanceId,
    })
  }

  operations.value = operations.value.map((item) =>
    Number(item.id || 0) === normalizedOperationId
      ? {
          ...item,
          ...persistentReservation,
          crew: member.name,
          crewId: member.id,
          crewOperationalState:
            persistentReservation?.crewOperationalState ||
            dedicatedAssignmentResponse?.crew_status ||
            'en_operacion',
          briefingTime: nextPresentationTime || item.briefingTime,
          presentationPlace: nextPresentationPlace || item.presentationPlace || item.origin || '',
          status: visibleWorkflowStage || item.status,
          workflowStatus: visibleWorkflowStage || item.workflowStatus,
          notes: nextOperationalNote ? `${item.notes || ''} · ${nextOperationalNote}`.replace(/^ · /, '') : item.notes,
        }
      : item,
  )

  upsertCrewMember({
    ...member,
    state: 'En operacion',
    lastAudit: new Date().toISOString().slice(0, 16).replace('T', ' '),
  })

  pushAuditEntry(
    `Asignacion confirmada: ${member.name}`,
    `Operacion #${operationId} asignada a ${member.name}. Rango ${operationRange.from}${operationRange.to !== operationRange.from ? ` a ${operationRange.to}` : ''} marcado como En operacion.${nextOperationalNote ? ` ${nextOperationalNote}` : ''}`,
  )
  const successMessage = promotedWorkflowStage
    ? `${member.name} ya quedo ligada a la operacion #${operationId}, y su disponibilidad operativa se actualizo.`
    : `${member.name} ya quedo ligada a la operacion #${operationId}.`
  onSuccess?.({
    title: 'Sobrecargo asignado',
    message: successMessage,
  })

  if (!onSuccess) {
    ui.pushToast({
      tone: 'success',
      title: 'Sobrecargo asignado',
      message: successMessage,
    })
  }
}

async function refreshNetworkState(title, message) {
  await requestPortalSectionLoad(props.section, { force: true })
  ui.pushToast({ tone: 'success', title, message })
}

async function refreshSubscriptionsPanel() {
  const targetSection =
    props.section === 'pagos' || props.section === 'pagos-proveedor'
      ? props.section
      : 'suscripciones'
  await requestPortalSectionLoad(targetSection, { force: true })
  if (props.section === 'suscripciones') {
    ui.pushToast({
      tone: 'success',
      title: 'Suscripciones actualizadas',
      message: 'La vista comercial se sincronizo con los datos mas recientes.',
    })
    return
  }

  if (props.section === 'pagos-proveedor' || props.section === 'pagos') {
    ui.pushToast({
      tone: 'success',
      title: 'Pagos de proveedor actualizados',
      message: 'La vista administrativa se sincronizo con cobros y vigencias mas recientes.',
    })
  }
}

async function refreshClientsTable() {
  if (clientTableRefreshing.value) return

  try {
    clientTableRefreshing.value = true
    await reconcilePendingClientAccessPayments({ silent: false })
    await Promise.all([loadClients(), loadAccessPayments()])
    ui.pushToast({
      tone: 'success',
      title: 'Tabla actualizada',
      message: 'La tabla de clientes se sincronizo con los datos mas recientes.',
    })
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo refrescar',
      message: error?.message || 'La tabla de clientes no pudo sincronizarse con el backend.',
    })
  } finally {
    clientTableRefreshing.value = false
  }
}

async function refreshReservationContent() {
  if (!['reservas', 'liberaciones'].includes(props.section) || reservationContentRefreshing.value) return

  try {
    reservationContentRefreshing.value = true
    await requestPortalSectionLoad(props.section, { force: true })
    ui.pushToast({
      tone: 'success',
      title: 'Contenido actualizado',
      message:
        props.section === 'liberaciones'
          ? 'La vista de liberaciones se sincronizo con el backend.'
          : 'La vista de reservas se sincronizo con el backend.',
    })
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo refrescar',
      message: error?.message || 'La vista no pudo sincronizarse con el backend.',
    })
  } finally {
    reservationContentRefreshing.value = false
  }
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

function resolveAdminFlowErrorMessage(error) {
  const workflowErrors = error?.payload?.errors?.workflow_status
  if (Array.isArray(workflowErrors) && workflowErrors[0]) {
    return workflowErrors[0]
  }

  const genericErrors = error?.payload?.errors
  if (genericErrors && typeof genericErrors === 'object') {
    const firstFieldErrors = Object.values(genericErrors).find(
      (value) => Array.isArray(value) && value.length,
    )
    if (Array.isArray(firstFieldErrors) && firstFieldErrors[0]) {
      return firstFieldErrors[0]
    }
  }

  return isTimeoutLikeError(error)
    ? 'El backend tardo demasiado en responder. El cambio de flujo no fue confirmado.'
    : error?.message || 'El backend no confirmo el cambio de etapa.'
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
    const { updateAdminReservationStage } = await loadAdminReservationsModule()
    reservationFlowLoading.value = true
    reservationFlowLoadingLabel.value = normalizeWorkflowLabel(nextStage)
    reservationFlowErrorMessage.value = ''
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
    reservationFlowErrorMessage.value = resolveAdminFlowErrorMessage(error)
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo actualizar el flujo',
      message: reservationFlowErrorMessage.value,
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
    const { delayAdminReservation } = await loadAdminReservationsModule()
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
    const { resumeAdminReservation } = await loadAdminReservationsModule()
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

async function handleMarkManualReservationPaid({ reservationId }) {
  const currentReservation = reservationRecords.value.find((item) => item.id === reservationId)
  if (!currentReservation) return

  try {
    const { persistAdminReservationPatch } = await loadAdminReservationsModule()
    reservationFlowLoading.value = true
    reservationFlowLoadingLabel.value = 'Pago confirmado'

    const updatedReservation = await persistAdminReservationPatch(
      currentReservation,
      {
        status: 'payment_confirmed',
        workflow_status: 'pago confirmado',
        booking_status: 'confirmed',
        contract_status: 'signed',
        payment_status: 'paid',
        payment_method: currentReservation.paymentMethod || 'assisted_cash',
        admin_note: 'Pago asistido validado manualmente por administracion.',
        payment_order: {
          ...(currentReservation.paymentOrder || {}),
          status: 'paid',
          method: currentReservation.paymentMethod || 'assisted_cash',
          payment_method: currentReservation.paymentMethod || 'assisted_cash',
          validated_by_admin: true,
          validated_at: new Date().toISOString(),
        },
      },
      { timeoutMs: ADMIN_FLOW_UPDATE_TIMEOUT_MS },
    )

    updateReservationLocalState(reservationId, updatedReservation)
    emitWorkflowSync({
      scope: 'reservation-workflow',
      reservationId,
      nextStage: 'payment_confirmed',
      action: 'manual-payment-confirmed',
      source: adminPortalInstanceId,
    })

    pushReservationAudit(
      `Pago asistido validado: reserva #${reservationId}`,
      `${currentReservation.clientName} quedo marcada como pagada y confirmada por administracion.`,
    )
    ui.pushToast({
      tone: 'success',
      title: 'Pago validado',
      message: `La reserva #${reservationId} ya quedo como pagada.`,
    })
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo marcar como pagado',
      message: error?.message || 'El backend no confirmo la validacion del pago asistido.',
    })
  } finally {
    reservationFlowLoading.value = false
    reservationFlowLoadingLabel.value = ''
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
  void requestPortalSectionLoad(props.section, { force: true })
  if (shouldWarmCrewSection(props.section)) {
    loadCrewSectionBackground({ allowUsersFallback: false })
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleReservationsVisibilityRefresh)
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleReservationsVisibilityRefresh)
  }
  removeWorkflowSyncSubscription = subscribeWorkflowSync((payload = {}) => {
    if (payload.scope !== 'reservation-workflow') return
    if (!['reservas', 'liberaciones'].includes(props.section)) return
    if (payload.source === adminPortalInstanceId) return
    applyExternalWorkflowSync(payload)
    if (isReservationRefreshCoolingDown(props.section)) return
    void requestPortalSectionLoad(props.section)
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
    void requestPortalSectionLoad(section, { force: true })
    if (shouldWarmCrewSection(section)) {
      loadCrewSectionBackground({ allowUsersFallback: false })
    }
    startReservationsPolling()
  },
)
</script>

<template>
  <AdminExecutiveSection
    v-if="section === 'ejecutivo'"
    :kpis="executiveKpis"
    :analytics="executiveAnalytics"
  />
  <AdminImportsSection v-else-if="section === 'importaciones'" />
  <AdminUsersSection v-else-if="section === 'usuarios'" :users="users" @audit-user="auditUser" />
  <AdminUsersSection
    v-else-if="section === 'clientes'"
    :users="clientUsers"
    :access-payments="accessPayments"
    :is-refreshing="clientTableRefreshing"
    scope="client"
    title="Clientes"
    subtitle="Visualiza registros nuevos, prueba gratuita consumida y pagos activos desde una sola tabla."
    :hide-role-panel="true"
    @audit-user="auditUser"
    @refresh="refreshClientsTable"
  />
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
  <AdminSubscriptionsSection
    v-else-if="section === 'suscripciones'"
    :clients="clientUsers"
    :aircraft="aircraft"
    :aircraft-subscriptions="subscriptions"
    :access-payments="accessPayments"
    :subscription-payments="subscriptionPayments"
    initial-tab="commercial"
    @refresh="refreshSubscriptionsPanel"
  />
  <AdminSubscriptionsSection
    v-else-if="section === 'pagos'"
    :clients="clientUsers"
    :aircraft="aircraft"
    :aircraft-subscriptions="subscriptions"
    :access-payments="accessPayments"
    :subscription-payments="subscriptionPayments"
    initial-tab="provider-payments"
    @refresh="refreshSubscriptionsPanel"
  />
  <AdminSubscriptionsSection
    v-else-if="section === 'pagos-proveedor'"
    :clients="clientUsers"
    :aircraft="aircraft"
    :aircraft-subscriptions="subscriptions"
    :access-payments="accessPayments"
    :subscription-payments="subscriptionPayments"
    initial-tab="provider-payments"
    @refresh="refreshSubscriptionsPanel"
  />
  <AdminCrewDirectorySection
    v-else-if="section === 'sobrecargos'"
    :crew-members="crewMembers"
    :operations="operations"
    :audit-entries="crewAuditEntries"
    @approve-crew="approveCrew"
    @reject-crew="rejectCrew"
    @suspend-crew="suspendCrew"
    @audit-crew="auditCrew"
  />
  <AdminCrewOperationsSection
    v-else-if="section === 'sobrecargo-operaciones'"
    :crew-members="crewMembers"
    :operations="operations"
    :audit-entries="crewAuditEntries"
    view-mode="operations"
    @approve-crew="approveCrew"
    @reject-crew="rejectCrew"
    @suspend-crew="suspendCrew"
    @assign-crew="assignCrewToOperation"
    @audit-crew="auditCrew"
  />
  <AdminCrewOperationsSection
    v-else-if="section === 'sobrecargos-en-vuelo'"
    :crew-members="crewMembers"
    :operations="operations"
    :audit-entries="crewAuditEntries"
    view-mode="in-flight"
    @approve-crew="approveCrew"
    @reject-crew="rejectCrew"
    @suspend-crew="suspendCrew"
    @assign-crew="assignCrewToOperation"
    @audit-crew="auditCrew"
  />
  <AdminCrewAvailabilitySection
    v-else-if="section === 'disponibilidad'"
    :crew-members="crewMembers"
    :operations="operations"
    :audit-entries="crewAuditEntries"
    :status-options="crewAvailabilityStatuses"
    @audit-crew="auditCrew"
  />
  <AdminReservationsSection
    v-else-if="section === 'reservas'"
    :reservations="reservationRecords"
    :audit-entries="reservationAuditEntries"
    :is-flow-loading="reservationFlowLoading"
    :flow-loading-label="reservationFlowLoadingLabel"
    :flow-error-message="reservationFlowErrorMessage"
    :is-content-refreshing="reservationContentRefreshing"
    :show-provider-release-panel="false"
    @update-flow="handleUpdateReservationFlow"
    @delay-flow="handleDelayReservationFlow"
    @resume-flow="handleResumeReservationFlow"
    @mark-manual-paid="handleMarkManualReservationPaid"
    @refresh-content="refreshReservationContent"
  />
  <AdminReleasesSection
    v-else-if="section === 'liberaciones'"
    :reservations="reservationRecords"
    :audit-entries="reservationAuditEntries"
    :is-flow-loading="reservationFlowLoading"
    :flow-loading-label="reservationFlowLoadingLabel"
    :is-content-refreshing="reservationContentRefreshing"
    @update-flow="handleUpdateReservationFlow"
    @delay-flow="handleDelayReservationFlow"
    @resume-flow="handleResumeReservationFlow"
    @mark-manual-paid="handleMarkManualReservationPaid"
    @refresh-content="refreshReservationContent"
  />
  <AdminContractsSection
    v-else-if="section === 'contratos'"
    :contracts="contracts"
  />
  <AdminIncidenciasPage v-else-if="section === 'incidencias'" />
  <AdminCrudSection
    v-else
    :eyebrow="resolvedAdminSectionConfig.eyebrow"
    :title="resolvedAdminSectionConfig.title"
    :description="resolvedAdminSectionConfig.description"
    :highlights="resolvedAdminSectionConfig.highlights"
    :actions="resolvedAdminSectionConfig.actions"
    :fields="resolvedAdminSectionConfig.fields"
    :details="resolvedAdminSectionConfig.details"
    :edits="resolvedAdminSectionConfig.edits"
    :deactivation="resolvedAdminSectionConfig.deactivation"
    :states="resolvedAdminSectionConfig.states"
    :frontend-fields="resolvedAdminSectionConfig.frontendFields"
    :backend-fields="resolvedAdminSectionConfig.backendFields"
    :database-fields="resolvedAdminSectionConfig.databaseFields"
  />
</template>

<style scoped>
:deep(.admin-executive-page),
:deep(.admin-crud-page),
:deep(.subscriptions-shell),
:deep(.aircraft-admin-shell),
:deep(.directory-shell),
:deep(.availability-admin-shell) {
  min-height: auto;
  background: transparent;
}

:deep(.dashboard-hero),
:deep(.imports-hero),
:deep(.subscriptions-hero),
:deep(.command-hero),
:deep(.hero-card),
:deep(.surface),
:deep(.table-shell),
:deep(.filters-shell),
:deep(.section-card) {
  border-radius: 24px;
}

:deep(.dashboard-hero),
:deep(.imports-hero),
:deep(.subscriptions-hero),
:deep(.command-hero) {
  border: 1px solid rgba(109, 137, 189, 0.14);
  background:
    radial-gradient(circle at top right, rgba(209, 223, 251, 0.42), transparent 26%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(245, 249, 255, 0.9));
  box-shadow: 0 18px 44px rgba(48, 79, 132, 0.08);
}

:deep(.surface),
:deep(.table-shell),
:deep(.filters-shell),
:deep(.section-card),
:deep(.workstream-card),
:deep(.signal-card),
:deep(.state-card),
:deep(.policy-card),
:deep(.control-card),
:deep(.insight-card),
:deep(.empty-shell),
:deep(.detail-hero-card),
:deep(.detail-hero-card__route),
:deep(.detail-hero-card__chips),
:deep(.detail-hero-card),
:deep(.detail-hero-card + .detail-hero-card) {
  border-color: rgba(109, 137, 189, 0.12);
  box-shadow: 0 16px 34px rgba(52, 82, 134, 0.06);
}

:deep(.page-grid),
:deep(.provider-grid),
:deep(.control-grid),
:deep(.insights-grid),
:deep(.workstreams-grid),
:deep(.states-layout),
:deep(.policies-grid),
:deep(.hero-support-grid),
:deep(.hero-actions-grid),
:deep(.flow-grid),
:deep(.kpi-grid) {
  gap: 1rem;
}

:deep(.page-grid) {
  align-items: start;
}

:deep(.page-head),
:deep(.workspace-card),
:deep(.provider-card),
:deep(.reservation-card),
:deep(.queue-stat),
:deep(.summary-card),
:deep(.kpi-card),
:deep(.panel-card),
:deep(.detail-card),
:deep(.matrix-card),
:deep(.log-card),
:deep(.provider-payment-detail),
:deep(.provider-payments-summary__card),
:deep(.evidence-modal),
:deep(.detail-modal__surface) {
  border: 1px solid rgba(109, 137, 189, 0.14);
  border-radius: 22px;
  background:
    radial-gradient(circle at top right, rgba(219, 230, 250, 0.3), transparent 28%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(246, 249, 255, 0.94));
  box-shadow: 0 18px 38px rgba(47, 76, 126, 0.08);
}

:deep(.page-head) {
  background:
    radial-gradient(circle at top left, rgba(178, 201, 244, 0.22), transparent 28%),
    linear-gradient(135deg, #f7faff 0%, #eef4fd 100%);
}

:deep(.section-head),
:deep(.provider-card-top),
:deep(.toolbar),
:deep(.tabs-strip),
:deep(.detail-tabs),
:deep(.provider-payment-detail__badges),
:deep(.card-head),
:deep(.table-panel > .section-head:first-child) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem;
  flex-wrap: wrap;
}

:deep(.reservation-list),
:deep(.provider-grid),
:deep(.provider-status-section),
:deep(.queue-summary),
:deep(.compact-release-kpis),
:deep(.info-grid),
:deep(.provider-stats-inline) {
  display: grid;
  gap: 0.9rem;
}

:deep(.reservation-list),
:deep(.queue-summary),
:deep(.info-grid),
:deep(.provider-stats-inline) {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

:deep(.provider-grid) {
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

:deep(.field),
:deep(.search-field),
:deep(.toolbar-field),
:deep(.toolbar-search) {
  display: grid;
  gap: 0.35rem;
}

:deep(.field span),
:deep(.search-field span),
:deep(.toolbar-field span) {
  color: #4d678f;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

:deep(.field input),
:deep(.field select),
:deep(.search-field input),
:deep(.toolbar-field input),
:deep(.toolbar-field select) {
  min-height: 2.85rem;
  padding: 0 0.9rem;
  border: 1px solid rgba(109, 137, 189, 0.18);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.92);
  color: #1d324f;
}

:deep(.filters-grid),
:deep(.toolbar-actions),
:deep(.hero-actions) {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 0.75rem;
}

:deep(.badge),
:deep(.mini-badge),
:deep(.status-pill),
:deep(.status-chip),
:deep(.pill),
:deep(.state-pill),
:deep(.meta-pill),
:deep(.role-chip),
:deep(.summary-chip),
:deep(.alert-pill),
:deep(.step-chip) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2rem;
  padding: 0 0.75rem;
  border: 1px solid rgba(105, 133, 186, 0.16);
  border-radius: 999px;
  background: rgba(236, 242, 252, 0.92);
  color: #35547f;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.03em;
}

:deep(.tabs-strip),
:deep(.detail-tabs),
:deep(.release-tabs) {
  padding: 0.35rem;
  border: 1px solid rgba(109, 137, 189, 0.12);
  border-radius: 18px;
  background: rgba(241, 246, 255, 0.82);
}

:deep(.tabs-strip button),
:deep(.detail-tabs button),
:deep(.release-tabs button) {
  min-height: 2.7rem;
  padding: 0 0.95rem;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: #476188;
  font-weight: 700;
}

:deep(.tabs-strip button[aria-selected='true']),
:deep(.detail-tabs button.active),
:deep(.release-tabs button.active) {
  background: #ffffff;
  color: #183252;
  box-shadow: 0 10px 20px rgba(48, 82, 138, 0.1);
}

:deep(.reservation-card),
:deep(.compact-row),
:deep(.provider-card),
:deep(.table-panel tr) {
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease,
    background 0.18s ease;
}

:deep(.reservation-card:hover),
:deep(.compact-row:hover),
:deep(.provider-card:hover) {
  transform: translateY(-2px);
  box-shadow: 0 20px 42px rgba(49, 81, 133, 0.1);
}

:deep(.table-shell),
:deep(.table-panel) {
  overflow: hidden;
}

:deep(.table-shell table thead),
:deep(.table-panel table thead) {
  background: rgba(236, 243, 253, 0.88);
}

:deep(.table-shell table tbody tr),
:deep(.table-panel table tbody tr) {
  border-bottom: 1px solid rgba(110, 138, 188, 0.08);
}

:deep(.table-shell table tbody tr:hover),
:deep(.table-panel table tbody tr:hover) {
  background: rgba(242, 247, 255, 0.9);
}

:deep(.empty-state),
:deep(.empty-shell) {
  display: grid;
  place-items: center;
  min-height: 220px;
  text-align: center;
}

:deep(.hero-center h1),
:deep(.hero-copy h1),
:deep(.hero-copy-panel h1),
:deep(.command-hero h2),
:deep(.subscriptions-hero h2) {
  color: #11253f;
}

:deep(.hero-subtitle),
:deep(.hero-copy p),
:deep(.hero-center p),
:deep(.command-hero p),
:deep(.subscriptions-hero p) {
  color: #627390;
}

:deep(table),
:deep(.table-shell table) {
  border-collapse: separate;
  border-spacing: 0;
}

:deep(th) {
  color: #476189;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

:deep(td) {
  color: #1d324f;
}

:deep(input),
:deep(select),
:deep(textarea) {
  border-color: rgba(109, 137, 189, 0.18);
  border-radius: 14px;
  box-shadow: none;
}

:deep(button) {
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease;
}

:deep(button:hover) {
  transform: translateY(-1px);
}

:deep(.hero-actions),
:deep(.filters-actions),
:deep(.toolbar-actions),
:deep(.hero-metrics),
:deep(.stats-grid) {
  gap: 0.75rem;
}

@media (max-width: 760px) {
  :deep(.dashboard-hero),
  :deep(.imports-hero),
  :deep(.subscriptions-hero),
  :deep(.command-hero) {
    border-radius: 20px;
  }

  :deep(.section-head),
  :deep(.provider-card-top),
  :deep(.toolbar),
  :deep(.tabs-strip),
  :deep(.detail-tabs) {
    align-items: stretch;
  }

  :deep(.reservation-list),
  :deep(.queue-summary),
  :deep(.info-grid),
  :deep(.provider-stats-inline),
  :deep(.provider-grid) {
    grid-template-columns: 1fr;
  }
}
</style>
