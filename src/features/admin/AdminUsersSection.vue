<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { pickCollection, requestWithCandidates } from '../../lib/backendCrud'
import { resolveMediaUrl } from '../../lib/api'
import { resolveUserOfficialIdentificationAccess } from '../../lib/documentAccess'
import { resolveProviderIdForUser } from '../../lib/providerContext'
import { useUiStore } from '../../stores/ui'

const props = defineProps({
  users: { type: Array, required: true },
  accessPayments: { type: Array, default: () => [] },
  scope: { type: String, default: 'all' },
  title: { type: String, default: 'Usuarios y roles' },
  subtitle: { type: String, default: 'Administra accesos, permisos y perfiles del equipo desde una operacion mas clara y rapida.' },
  hideRolePanel: { type: Boolean, default: false },
  isRefreshing: { type: Boolean, default: false },
  pagination: {
    type: Object,
    default: () => ({
      currentPage: 1,
      perPage: 20,
      total: 0,
      lastPage: 1,
      from: 0,
      to: 0,
      serverPaginated: false,
    }),
  },
})

const emit = defineEmits(['audit-user', 'refresh', 'query-change'])
const ui = useUiStore()

const defaultRoleBlueprints = [
  {
    key: 'admin',
    name: 'Admin',
    description: 'Control total de la plataforma, configuracion y trazabilidad ejecutiva.',
    permissions: ['Usuarios', 'Roles', 'Reservas', 'Pagos', 'Incidencias', 'Configuracion'],
    scope: 'Vision completa del negocio',
  },
  {
    key: 'provider',
    name: 'Operador',
    description: 'Gestiona flota, disponibilidad, documentos y cumplimiento operativo.',
    permissions: ['Flota', 'Disponibilidad', 'Documentos', 'Asignaciones'],
    scope: 'Red operativa y capacidad',
  },
  {
    key: 'client',
    name: 'Cliente',
    description: 'Cotiza, reserva, firma y consulta su operacion comercial.',
    permissions: ['Cotizaciones', 'Reservas', 'Contratos', 'Pagos'],
    scope: 'Experiencia comercial protegida',
  },
  {
    key: 'sobrecargo',
    name: 'Sobrecargo',
    description: 'Opera agenda, checklist, incidencias y seguimiento de servicio.',
    permissions: ['Agenda', 'Checklist', 'Incidencias', 'Pagos propios'],
    scope: 'Cabina y ejecucion asignada',
  },
]

const localUsers = ref([])
const localRoles = ref(defaultRoleBlueprints.map((role) => ({ ...role })))
const providerCatalog = ref([])
const filtersOpen = ref(true)
const searchTerm = ref('')
const statusFilter = ref('todos')
const roleFilter = ref('todos')
const commercialAccessFilter = ref('todos')
const activePanel = ref('users')
const drawerMode = ref('create')
const drawerOpen = ref(false)
const roleModalMode = ref('create')
const roleModalOpen = ref(false)
const editingUserId = ref(null)
const selectedActionUser = ref(null)
const detailOpen = ref(false)
const detailLoading = ref(false)
const detailError = ref('')
const selectedUserDetail = ref(null)
const paymentDetailOpen = ref(false)
const selectedPaymentDetail = ref(null)
const currentPage = ref(1)
const rowsPerPage = ref(20)
const syncingClientPagination = ref(false)
const userFormErrors = ref({})
const savingUser = ref(false)
const reconcilingPaymentUserIds = ref([])
const ADMIN_USERS_TIMEOUT_MS = 45000
let clientQueryEmitTimer = null

const userForm = ref(buildEmptyUser())
const roleForm = ref(buildEmptyRole())
const isClientScope = computed(() => props.scope === 'client')
const hasServerPagination = computed(() => Boolean(props.pagination?.serverPaginated))
const latestAccessPaymentByUserId = computed(() => {
  const map = new Map()

  for (const payment of props.accessPayments || []) {
    const userId = Number(payment?.user_id || payment?.user?.id || 0)
    if (!userId) continue

    const current = map.get(userId)
    if (!current) {
      map.set(userId, payment)
      continue
    }

    const currentIsPriority = Boolean(current?.is_current)
    const nextIsPriority = Boolean(payment?.is_current)

    if (nextIsPriority && !currentIsPriority) {
      map.set(userId, payment)
      continue
    }

    if (nextIsPriority === currentIsPriority) {
      const currentTimestamp = Date.parse(
        String(current?.paid_at || current?.created_at || current?.updated_at || ''),
      )
      const nextTimestamp = Date.parse(
        String(payment?.paid_at || payment?.created_at || payment?.updated_at || ''),
      )

      if ((Number.isFinite(nextTimestamp) ? nextTimestamp : 0) > (Number.isFinite(currentTimestamp) ? currentTimestamp : 0)) {
        map.set(userId, payment)
      }
    }
  }

  return map
})

watch(
  () => props.users,
  (value) => {
    localUsers.value = (value || []).map((user, index) => normalizeUserRecord(user, index))
  },
  { immediate: true },
)

function handleDocumentClick(event) {
  if (!event.target.closest('.row-actions')) {
    closeActionsModal()
  }
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
  if (!props.hideRolePanel && !isClientScope.value) {
    void loadRolesFromBackend()
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
  if (clientQueryEmitTimer) {
    clearTimeout(clientQueryEmitTimer)
    clientQueryEmitTimer = null
  }
})

watch(
  () => props.scope,
  (scope) => {
    if (scope === 'client') {
      roleFilter.value = 'client'
      activePanel.value = 'users'
    }
  },
  { immediate: true },
)

watch(
  () => props.pagination,
  (pagination) => {
    if (!pagination || typeof pagination !== 'object') return
    syncingClientPagination.value = true
    currentPage.value = Math.max(1, Number(pagination.currentPage || 1) || 1)
    rowsPerPage.value = Math.max(1, Number(pagination.perPage || rowsPerPage.value || 20) || 20)
    setTimeout(() => {
      syncingClientPagination.value = false
    }, 0)
  },
  { immediate: true, deep: true },
)

const roleSummaries = computed(() =>
  localRoles.value.map((role) => ({
    ...role,
    users: localUsers.value.filter((user) => normalizeRoleKey(user.role) === role.key).length,
  })),
)

const filteredUsers = computed(() => {
  const query = searchTerm.value.toLowerCase()

  return localUsers.value.filter((user) => {
    const matchesScope = !isClientScope.value || isClientUser(user)
    const matchesSearch =
      !query ||
      [user.name, user.email, user.role, user.status, user.phone].some((field) =>
        String(field || '').toLowerCase().includes(query),
      )
    const matchesStatus =
      statusFilter.value === 'todos' || normalizeStatusKey(user.status) === statusFilter.value
    const matchesRole = roleFilter.value === 'todos' || normalizeRoleKey(user.role) === roleFilter.value
    const matchesCommercialAccess =
      commercialAccessFilter.value === 'todos' ||
      (commercialAccessFilter.value === 'no-aplica' && !isClientUser(user)) ||
      (isClientUser(user) &&
        ((commercialAccessFilter.value === 'habilitado' && commercialAccessTone(user) !== 'blocked') ||
          (commercialAccessFilter.value === 'bloqueado' &&
            ['blocked', 'warn'].includes(commercialAccessTone(user)))))

    return matchesScope && matchesSearch && matchesStatus && matchesRole && matchesCommercialAccess
  })
})

const paginatedUsers = computed(() => {
  if (!isClientScope.value) return filteredUsers.value
  if (hasServerPagination.value) return filteredUsers.value

  const start = (currentPage.value - 1) * rowsPerPage.value
  return filteredUsers.value.slice(start, start + rowsPerPage.value)
})

const clientTableSummary = computed(() => {
  if (!isClientScope.value) {
    return {
      total: filteredUsers.value.length,
      from: filteredUsers.value.length ? 1 : 0,
      to: filteredUsers.value.length,
      lastPage: 1,
    }
  }

  if (hasServerPagination.value) {
    return {
      total: Number(props.pagination?.total || filteredUsers.value.length || 0),
      from: Number(props.pagination?.from || 0),
      to: Number(props.pagination?.to || filteredUsers.value.length || 0),
      lastPage: Math.max(1, Number(props.pagination?.lastPage || 1) || 1),
    }
  }

  const total = filteredUsers.value.length
  const from = total ? (currentPage.value - 1) * rowsPerPage.value + 1 : 0
  const to = total ? Math.min(total, from + paginatedUsers.value.length - 1) : 0
  const lastPage = Math.max(1, Math.ceil(total / Math.max(1, rowsPerPage.value)))

  return { total, from, to, lastPage }
})

const clientCommercialMetrics = computed(() => {
  const scopedClients = localUsers.value.filter((user) => isClientUser(user))
  const paid = scopedClients.filter((user) => {
    const commercial = user.commercialAccess || user.raw?.commercial_access || {}
    return commercial.has_paid_access === true
  }).length
  const trialAvailable = scopedClients.filter((user) => {
    const commercial = user.commercialAccess || user.raw?.commercial_access || {}
    return Number(commercial.remaining_free_quotes || 0) > 0 && commercial.has_paid_access !== true
  }).length
  const trialConsumed = scopedClients.filter((user) => {
    const commercial = user.commercialAccess || user.raw?.commercial_access || {}
    return commercial.trial_consumed === true && commercial.has_paid_access !== true
  }).length
  const newClients = scopedClients.filter((user) => isNewClientRegistration(user)).length

  return {
    total: scopedClients.length,
    paid,
    trialAvailable,
    trialConsumed,
    newClients,
  }
})

const userSignals = computed(() => {
  if (isClientScope.value) {
    return [
      {
        label: 'Clientes totales',
        value: String(clientCommercialMetrics.value.total),
        detail: 'Base comercial visible en esta ruta.',
        tone: 'neutral',
      },
      {
        label: 'Registros nuevos',
        value: String(clientCommercialMetrics.value.newClients),
        detail: 'Clientes que aun no usan su prueba.',
        tone: 'accent',
      },
      {
        label: 'Prueba disponible',
        value: String(clientCommercialMetrics.value.trialAvailable),
        detail: 'Aun pueden generar su solicitud inicial.',
        tone: 'info',
      },
      {
        label: 'Prueba consumida',
        value: String(clientCommercialMetrics.value.trialConsumed),
        detail: 'Ya requieren acceso comercial para continuar.',
        tone: 'danger',
      },
      {
        label: 'Pago activo',
        value: String(clientCommercialMetrics.value.paid),
        detail: 'Clientes con acceso comercial pagado.',
        tone: 'success',
      },
    ]
  }

  const total = localUsers.value.length
  const active = localUsers.value.filter((user) => isActiveStatus(user.status)).length
  const admins = localUsers.value.filter((user) => normalizeRoleKey(user.role) === 'admin').length
  const clients = localUsers.value.filter((user) => normalizeRoleKey(user.role) === 'client').length
  const newClients = localUsers.value.filter((user) => isNewClientRegistration(user)).length
  const suspended = localUsers.value.filter((user) => normalizeStatusKey(user.status) === 'suspendido').length

  return [
    { label: 'Total usuarios', value: String(total), detail: 'Base visible en el panel.', tone: 'neutral' },
    { label: 'Activos', value: String(active), detail: 'Perfiles operativos habilitados.', tone: 'success' },
    { label: 'Administradores', value: String(admins), detail: 'Control ejecutivo o total.', tone: 'accent' },
    { label: 'Clientes', value: String(clients), detail: 'Perfiles comerciales y corporativos.', tone: 'info' },
    { label: 'Registros nuevos', value: String(newClients), detail: 'Clientes nuevos sin prueba usada ni pago.', tone: 'accent' },
    { label: 'Suspendidos', value: String(suspended), detail: 'Cuentas en pausa o revision.', tone: 'danger' },
  ]
})

function buildClientQueryPayload() {
  return {
    page: currentPage.value,
    per_page: rowsPerPage.value,
    search: searchTerm.value.trim(),
    status: statusFilter.value,
    role: roleFilter.value,
    commercial_access: commercialAccessFilter.value,
  }
}

function scheduleClientQueryEmit() {
  if (!isClientScope.value) return
  if (clientQueryEmitTimer) clearTimeout(clientQueryEmitTimer)

  clientQueryEmitTimer = setTimeout(() => {
    emit('query-change', buildClientQueryPayload())
  }, 260)
}

watch([searchTerm, statusFilter, roleFilter, commercialAccessFilter], () => {
  if (!isClientScope.value) return
  currentPage.value = 1
  scheduleClientQueryEmit()
})

watch(rowsPerPage, (value, oldValue) => {
  if (!isClientScope.value || value === oldValue || syncingClientPagination.value) return
  currentPage.value = 1
  scheduleClientQueryEmit()
})

watch(currentPage, (value, oldValue) => {
  if (!isClientScope.value || value === oldValue || syncingClientPagination.value) return
  scheduleClientQueryEmit()
})

function buildEmptyUser() {
  return {
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'client',
    provider_id: '',
    status: 'Activa',
    permissions: '',
    invitationSent: true,
  }
}

function buildEmptyRole() {
  return {
    name: '',
    description: '',
    permissions: '',
    scope: '',
  }
}

function buildAuditStamp(index) {
  const samples = ['hoy 08:40', 'hoy 10:15', 'ayer 18:20', 'hoy 12:05']
  return samples[index % samples.length]
}

function normalizePermissions(value) {
  if (Array.isArray(value)) return value.filter(Boolean)
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

function normalizeRoleKey(role) {
  const value = String(role || '').toLowerCase()
  if (value.includes('admin')) return 'admin'
  if (value.includes('provider') || value.includes('proveedor') || value.includes('operador')) return 'provider'
  if (value.includes('sobrecargo') || value.includes('crew')) return 'sobrecargo'
  if (value.includes('client') || value.includes('cliente') || value.includes('enterprise')) return 'client'
  return value.replace(/\s+/g, '-')
}

function normalizeStatusKey(status) {
  const value = String(status || '').toLowerCase()
  if (value.includes('suspend') || value.includes('block')) return 'suspendido'
  if (
    value.includes('inactive') ||
    value.includes('inactiva') ||
    value.includes('inactivo') ||
    value.includes('disabled') ||
    value.includes('inhabilitada') ||
    value.includes('inhabilitado')
  ) {
    return 'inactivo'
  }
  if (value.includes('operando') || value.includes('activa') || value.includes('activo') || value.includes('disponible')) {
    return 'activo'
  }
  return 'otro'
}

function isActiveStatus(status) {
  return normalizeStatusKey(status) === 'activo'
}

function canActivateStatus(status) {
  return normalizeStatusKey(status) !== 'activo'
}

function normalizeStatusLabel(status) {
  const normalized = normalizeStatusKey(status)

  if (normalized === 'suspendido') return 'Suspendida'
  if (normalized === 'inactivo') return 'Inactiva'
  if (normalized === 'activo') return 'Activa'

  return status || 'Activa'
}

function normalizeUserRecord(user = {}, index = 0) {
  const primaryRole = user.effective_role || user.role?.code || user.role?.name || user.operational_role || user.role
  const provider = user.provider || user.proveedor || user.ownedProvider || user.owned_provider || null
  const access = user.access || {}
  const commercialAccess = user.commercial_access || user.commercialAccess || access.commercial_access || {}
  const demo = user.demo || access.demo || null
  const subscription =
    user.active_suscripcion ||
    user.activeSuscripcion ||
    user.subscription ||
    access.subscription ||
    null
  const password =
    user.password ||
    user.temporary_password_visible ||
    user.temporary_password ||
    user.plain_password ||
    user.generated_password ||
    user.raw_password ||
    ''

  return {
    id: user.id ?? Date.now() + index,
    name: user.name || user.full_name || '',
    email: user.email || '',
    password,
    phone: user.phone || user.phone_number || '',
    role: normalizeRoleKey(primaryRole || 'client'),
    provider_id: user.provider_id || user.proveedor_id || provider?.id || resolveProviderIdForUser(user) || '',
    provider: provider ? normalizeProviderRecord(provider) : null,
    profile: user.profile || null,
    access,
    commercialAccess,
    demo,
    subscription,
    raw: user,
    status: user.status || user.account_status || 'Activa',
    permissions:
      Array.isArray(user.permissions) && user.permissions.length
        ? user.permissions.join(', ')
        : user.permissions || 'Sin permisos especiales',
    invitationSent: user.invitationSent ?? user.invitation_sent ?? true,
    createdAt: user.created_at || null,
    lastAudit: user.lastAudit || user.updated_at || buildAuditStamp(index),
  }
}

function normalizeRoleRecord(role = {}) {
  const normalizedKey = normalizeRoleKey(role.key || role.slug || role.code || role.display_name || role.name || role.label)
  const fallbackName =
    normalizedKey === 'provider'
      ? 'Operador'
      : normalizedKey === 'client'
        ? 'Cliente'
        : normalizedKey === 'sobrecargo'
          ? 'Sobrecargo'
          : normalizedKey === 'admin'
            ? 'Admin'
            : 'Nuevo rol'
  const name = role.display_name || role.name || role.label || fallbackName
  return {
    key: normalizedKey,
    name,
    description: role.description || 'Permisos personalizados del modulo.',
    permissions: normalizePermissions(role.permissions),
    scope: role.scope || role.coverage || 'Permisos personalizados',
  }
}

function normalizeProviderRecord(provider = {}) {
  const user = provider.user || {}
  const aircraft = pickCollection(provider, ['aircraft', 'aeronaves'])
  const documents = pickCollection(provider, ['company_documents', 'documents', 'documentos'])

  return {
    id: Number(provider.id || 0),
    company_name: provider.company_name || user.name || 'Proveedor',
    commercial_name: provider.commercial_name || provider.company_name || user.name || 'Proveedor',
    approval_status: provider.approval_status || 'pending',
    notes: provider.notes || provider.admin_notes || '',
    user,
    aircraft,
    documents,
    raw: provider,
  }
}

function pickRecord(payload = {}, keys = []) {
  for (const key of keys) {
    if (payload?.[key] && typeof payload[key] === 'object') return payload[key]
  }
  return payload
}

function getNestedValue(source = {}, paths = []) {
  for (const path of paths) {
    const value = String(path)
      .split('.')
      .reduce((current, key) => current?.[key], source)

    if (value !== undefined && value !== null && value !== '') {
      return value
    }
  }

  return ''
}

function formatDetailValue(value) {
  if (value === undefined || value === null || value === '') return 'Sin dato'
  if (Array.isArray(value)) return value.length ? `${value.length} registro(s)` : 'Sin registros'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function buildDetailRows(source = {}, rows = []) {
  return rows.map((row) => ({
    label: row.label,
    value: formatDetailValue(getNestedValue(source, row.paths)),
  }))
}

function providerDetailRows(detail = {}) {
  return buildDetailRows(detail, [
    { label: 'Razon social', paths: ['provider.company_name', 'provider.raw.company_name', 'user.profile.company_name'] },
    { label: 'Nombre comercial', paths: ['provider.commercial_name', 'provider.raw.commercial_name'] },
    { label: 'RFC', paths: ['user.profile.tax_data.rfc', 'provider.raw.rfc'] },
    { label: 'Representante legal', paths: ['user.profile.tax_data.legal_representative', 'provider.raw.legal_representative'] },
    { label: 'Direccion', paths: ['user.profile.address', 'provider.raw.address'] },
    { label: 'Estado validacion', paths: ['provider.approval_status', 'provider.raw.approval_status'] },
    { label: 'Notas admin', paths: ['provider.notes', 'provider.raw.notes'] },
  ])
}

function userDetailRows(detail = {}) {
  return buildDetailRows(detail, [
    { label: 'Nombre', paths: ['user.name'] },
    { label: 'Correo', paths: ['user.email'] },
    { label: 'Telefono', paths: ['user.phone'] },
    { label: 'Rol', paths: ['user.role'] },
    { label: 'Estado', paths: ['user.status'] },
    {
      label: 'Acceso comercial',
      paths: [
        'user.commercialAccess.label',
        'user.raw.commercial_access.label',
        'user.subscription.status',
        'user.raw.active_suscripcion.status',
        'user.raw.activeSuscripcion.status',
        'user.access.subscription.status',
        'user.access.membership.status',
        'user.access.subscription_status',
        'user.access.membership_status',
        'user.raw.subscription.status',
        'user.raw.membership.status',
        'user.subscription.status',
        'user.membership.status',
        'user.subscription_status',
        'user.membership_status',
      ],
    },
    {
      label: 'Estado comercial',
      paths: ['user.commercialAccess.status', 'user.raw.commercial_access.status', 'user.raw.access_status'],
    },
    {
      label: 'Cotizacion de prueba',
      paths: [
        'user.commercialAccess.free_quotes_used',
        'user.raw.commercial_access.free_quotes_used',
        'user.raw.free_quotes_used',
      ],
    },
    {
      label: 'Limite prueba',
      paths: [
        'user.commercialAccess.free_quote_limit',
        'user.raw.commercial_access.free_quote_limit',
        'user.raw.free_quote_limit',
      ],
    },
    {
      label: 'Pago acceso',
      paths: ['user.commercialAccess.paid_access_at', 'user.raw.commercial_access.paid_access_at', 'user.raw.paid_access_at'],
    },
    {
      label: 'Demo activa',
      paths: [
        'user.demo.status',
        'user.raw.demo.status',
        'user.access.demo.status',
        'user.access.demo_active',
        'user.demo_active',
        'user.access.has_demo',
        'user.has_demo',
      ],
    },
    { label: 'Demo vence', paths: ['user.demo.expires_at', 'user.raw.demo.expires_at', 'user.access.demo.expires_at'] },
    {
      label: 'Suscripcion vence',
      paths: [
        'user.subscription.expires_at',
        'user.raw.active_suscripcion.expires_at',
        'user.raw.activeSuscripcion.expires_at',
        'user.access.subscription.expires_at',
      ],
    },
    { label: 'Ultima auditoria', paths: ['user.lastAudit'] },
  ])
}

function identityDetailRows(detail = {}) {
  return buildDetailRows(detail, [
    { label: 'Tipo de documento', paths: ['user.profile.document_type', 'user.raw.document_type', 'user.raw.documentType'] },
    { label: 'Numero de documento', paths: ['user.profile.document_number', 'user.raw.document_number', 'user.raw.documentNumber'] },
    { label: 'Fecha de emision', paths: ['user.profile.document_issue_date', 'user.raw.document_issue_date', 'user.raw.documentIssueDate'] },
    { label: 'Vigencia', paths: ['user.profile.document_expiration', 'user.raw.document_expiration', 'user.raw.documentExpiration'] },
    { label: 'Estado del documento', paths: ['user.profile.document_status', 'user.raw.document_status', 'user.raw.documentStatus'] },
    { label: 'Nacionalidad', paths: ['user.profile.nationality', 'user.raw.nationality'] },
    { label: 'Fecha de nacimiento', paths: ['user.profile.birth_date', 'user.raw.birth_date', 'user.raw.birthDate'] },
    { label: 'CURP', paths: ['user.profile.ine_curp', 'user.raw.ine_curp', 'user.raw.ineCurp'] },
    { label: 'CIC', paths: ['user.profile.ine_cic', 'user.raw.ine_cic', 'user.raw.ineCic'] },
    { label: 'OCR', paths: ['user.profile.ine_ocr', 'user.raw.ine_ocr', 'user.raw.ineOcr'] },
    { label: 'Estado de escaneo', paths: ['user.profile.ine_scan_status', 'user.raw.ine_scan_status', 'user.raw.ineScanStatus'] },
    {
      label: 'Validacion requerida',
      paths: [
        'user.profile.identity_validation_required',
        'user.raw.identity_validation_required',
        'user.raw.identityValidationRequired',
      ],
    },
    { label: 'Tipo de licencia', paths: ['user.profile.license_type', 'user.raw.license_type', 'user.raw.licenseType'] },
    {
      label: 'Categoria de licencia',
      paths: ['user.profile.license_category', 'user.raw.license_category', 'user.raw.licenseCategory'],
    },
    {
      label: 'Pais emisor',
      paths: ['user.profile.license_issuing_country', 'user.raw.license_issuing_country', 'user.raw.licenseIssuingCountry'],
    },
    { label: 'INE frente', paths: ['user.profile.ine_front_path', 'user.raw.ine_front_path', 'user.raw.ineFrontPath'] },
    { label: 'INE reverso', paths: ['user.profile.ine_back_path', 'user.raw.ine_back_path', 'user.raw.ineBackPath'] },
    {
      label: 'Archivo de licencia',
      paths: ['user.profile.license_file_path', 'user.raw.license_file_path', 'user.raw.licenseFilePath'],
    },
  ])
}

function resolveLatestVerification(detail = {}) {
  const verifications =
    detail?.user?.raw?.identityVerifications ||
    detail?.user?.raw?.identity_verifications ||
    detail?.user?.identityVerifications ||
    detail?.user?.identity_verifications
  if (Array.isArray(verifications) && verifications.length) {
    return verifications[0]
  }
  return null
}

function resolveBiometricSelfieUrl(detail = {}) {
  const rawUrl =
    getNestedValue(detail, [
      'user.biometric_selfie_url',
      'user.raw.biometric_selfie_url',
      'user.raw.biometricSelfieUrl',
    ]) ||
    ''

  if (rawUrl) {
    return resolveMediaUrl(rawUrl)
  }

  return ''
}

function resolveOfficialIdentificationAccess(detail = {}) {
  return resolveUserOfficialIdentificationAccess({
    profile: detail?.user?.profile,
    tax_data: detail?.user?.profile?.tax_data,
    taxData: detail?.user?.profile?.taxData,
    ...detail?.user?.raw,
  })
}

function biometricDetailRows(detail = {}) {
  const verification = resolveLatestVerification(detail)

  return [
    {
      label: 'Estado biometrico',
      value: formatDetailValue(
        getNestedValue(detail, ['user.raw.identity_verification_status', 'user.raw.identityVerificationStatus']),
      ),
    },
    {
      label: 'Mensaje biometrico',
      value: formatDetailValue(
        getNestedValue(detail, ['user.raw.identity_verification_message', 'user.raw.identityVerificationMessage']),
      ),
    },
    {
      label: 'Identidad verificada',
      value: formatDetailValue(
        getNestedValue(detail, ['user.raw.identity_verified', 'user.raw.identityVerified']),
      ),
    },
    {
      label: 'Rostro detectado',
      value: formatDetailValue(
        getNestedValue(detail, ['user.raw.face_detected', 'user.raw.faceDetected']),
      ),
    },
    {
      label: 'Face confidence',
      value: formatDetailValue(verification?.face_confidence),
    },
    {
      label: 'Face match score',
      value: formatDetailValue(
        getNestedValue(detail, ['user.raw.face_match_score', 'user.raw.faceMatchScore']) ||
          verification?.face_match_score ||
          verification?.face_confidence,
      ),
    },
    {
      label: 'Liveness score',
      value: formatDetailValue(
        getNestedValue(detail, ['user.raw.liveness_score', 'user.raw.livenessScore']) || verification?.liveness_score,
      ),
    },
    {
      label: 'Brightness',
      value: formatDetailValue(verification?.brightness),
    },
    {
      label: 'Sharpness',
      value: formatDetailValue(verification?.sharpness),
    },
    {
      label: 'Pose yaw / pitch / roll',
      value: formatDetailValue(
        verification
          ? `${verification.yaw ?? 'Sin dato'} / ${verification.pitch ?? 'Sin dato'} / ${verification.roll ?? 'Sin dato'}`
          : '',
      ),
    },
    {
      label: 'Face occluded',
      value: formatDetailValue(verification?.face_occluded),
    },
    {
      label: 'Proveedor biometrico',
      value: formatDetailValue(
        getNestedValue(detail, ['user.raw.biometric_provider', 'user.raw.biometricProvider']) || verification?.provider,
      ),
    },
    {
      label: 'Tipo de plantilla',
      value: formatDetailValue(
        getNestedValue(detail, ['user.raw.biometric_template_type', 'user.raw.biometricTemplateType']) ||
          verification?.template_type,
      ),
    },
    {
      label: 'Selfie biometrica',
      value: formatDetailValue(
        getNestedValue(detail, ['user.raw.biometric_selfie_path', 'user.raw.biometricSelfiePath']) || verification?.image_path,
      ),
    },
    {
      label: 'Capturada en',
      value: formatDetailValue(
        getNestedValue(detail, ['user.raw.biometric_captured_at', 'user.raw.biometricCapturedAt']),
      ),
    },
  ]
}

function resolveCommercialAccessState(detail = {}) {
  const user = detail?.user || {}
  const access = user.access || user.raw?.access || {}
  const commercial = user.commercialAccess || user.raw?.commercial_access || access.commercial_access || {}
  const latestPayment = latestAccessPaymentByUserId.value.get(Number(user?.id || 0)) || null
  const latestPaymentStatus = normalizeAccessPaymentStatus(latestPayment?.status)
  const accessStatus = normalizeAccessPaymentStatus(
    commercial.status || user.raw?.access_status || user.access?.access_status || '',
  )
  const realPaymentState = resolveRealPaymentState(user)

  if (isCommercialAccessExpired(user, latestPayment)) {
    return 'Acceso vencido'
  }

  if (
    realPaymentState.label === 'Pago realizado' ||
    commercial.has_paid_access === true ||
    isSuccessfulAccessPaymentStatus(latestPaymentStatus)
  ) {
    return 'Pago activo'
  }

  if (
    realPaymentState.label === 'Validando pago' ||
    (latestPayment && latestPayment?.is_current === true && isPendingAccessPaymentStatus(latestPaymentStatus)) ||
    accessStatus === 'payment_pending'
  ) {
    return 'Pago en validacion'
  }

  if (commercial.trial_consumed === true) {
    return 'Prueba consumida'
  }

  if (commercial.is_new_registration === true) {
    return 'Registro nuevo'
  }

  if (Number(commercial.remaining_free_quotes || 0) > 0) {
    return 'Prueba disponible'
  }

  const subscriptionStatus = String(
    user.subscription?.status ||
      user.access?.subscription_status ||
      user.access?.membership_status ||
      user.access?.has_access ||
      user.subscription_status ||
      user.membership_status ||
      user.raw?.active_suscripcion?.status ||
      user.raw?.activeSuscripcion?.status ||
    access.subscription?.status ||
      access.membership?.status ||
      access.subscription_status ||
      access.membership_status ||
      user.subscription?.status ||
      user.membership?.status ||
      user.subscription_status ||
      user.membership_status ||
      '',
  )
    .trim()
    .toLowerCase()

  const demoStatus = String(
    user.demo?.status ||
      user.raw?.demo?.status ||
      access.demo?.status ||
      access.demo_active ||
      user.demo_active ||
      access.has_demo ||
      user.has_demo ||
      '',
  )
    .trim()
    .toLowerCase()

  if (
    ['active', 'activa', 'vigente', 'approved', 'trial_active', 'demo_active', 'demo_activa', 'true', '1'].includes(
      subscriptionStatus,
    )
  ) {
    return 'Habilitado'
  }

  if (['true', '1', 'yes', 'si', 'active', 'activa', 'vigente', 'demo_active'].includes(demoStatus)) {
    return 'Habilitado'
  }

  if (access.has_access === true) {
    return 'Habilitado'
  }

  return 'Bloqueado'
}

function resolveCommercialAccessForUser(user = {}) {
  return resolveCommercialAccessState({
    user,
    provider: user.provider || null,
  })
}

function commercialAccessTone(user = {}) {
  const label = resolveCommercialAccessForUser(user)
  if (label === 'Pago activo') return 'success'
  if (label === 'Pago en validacion') return 'warn'
  if (label === 'Acceso vencido') return 'blocked'
  if (label === 'Prueba disponible' || label === 'Registro nuevo') return 'info'
  if (label === 'Prueba consumida') return 'warn'
  return label === 'Habilitado' ? 'success' : 'blocked'
}

function commercialAccessLabel(user = {}) {
  if (!isClientUser(user)) return 'Acceso no aplica'
  return resolveCommercialAccessForUser(user)
}

function commercialAccessMeta(user = {}) {
  if (!isClientUser(user)) return 'Sin seguimiento comercial'

  const commercial = user.commercialAccess || user.raw?.commercial_access || user.access?.commercial_access || {}
  const latestPayment = latestAccessPaymentByUserId.value.get(Number(user?.id || 0)) || null
  const used = Number(commercial.free_quotes_used ?? user.raw?.free_quotes_used ?? 0)
  const limit = Math.max(1, Number(commercial.free_quote_limit ?? user.raw?.free_quote_limit ?? 1))
  const remaining = Math.max(0, Number(commercial.remaining_free_quotes ?? limit - used))
  const paidAt = commercial.paid_access_at || user.raw?.paid_access_at || latestPayment?.paid_at || ''
  const expiresAt = resolveCommercialAccessExpiryDate(user, latestPayment)

  if (isCommercialAccessExpired(user, latestPayment)) {
    return expiresAt ? `Vencio ${expiresAt.slice(0, 10)}` : 'Acceso vencido'
  }

  if (commercial.has_paid_access === true || isSuccessfulAccessPaymentStatus(latestPayment?.status)) {
    if (paidAt && expiresAt) {
      return `Pago confirmado ${String(paidAt).slice(0, 10)} · vence ${String(expiresAt).slice(0, 10)}`
    }
    if (expiresAt) {
      return `Acceso vigente hasta ${String(expiresAt).slice(0, 10)}`
    }
    return paidAt ? `Pago confirmado ${String(paidAt).slice(0, 10)}` : 'Cliente con acceso pagado'
  }

  if (used <= 0) {
    return `Pendiente de usar prueba ${used}/${limit}`
  }

  if (remaining > 0) {
    return `Prueba usada ${used}/${limit} · quedan ${remaining}`
  }

  return `Prueba usada ${used}/${limit} · requiere pago`
}

function commercialLifecycleLabel(user = {}) {
  if (!isClientUser(user)) return 'No aplica'

  const commercial = user.commercialAccess || user.raw?.commercial_access || user.access?.commercial_access || {}
  const label = String(commercial.label || '').trim()

  if (resolveCommercialAccessForUser(user) === 'Pago activo') {
    return 'Pago activo'
  }

  return label || commercialAccessLabel(user)
}

function resolveCommercialAccessExpiryDate(user = {}, latestPayment = null) {
  const commercial = user.commercialAccess || user.raw?.commercial_access || user.access?.commercial_access || {}
  return String(
    commercial.access_expires_at ||
      user.access?.access_expires_at ||
      user.raw?.access_expires_at ||
      latestPayment?.user?.access_expires_at ||
      latestPayment?.billing_period_end ||
      '',
  ).trim()
}

function isCommercialAccessExpired(user = {}, latestPayment = null) {
  const expiresAt = resolveCommercialAccessExpiryDate(user, latestPayment)
  if (!expiresAt) return false

  const expiryDate = new Date(expiresAt)
  if (!Number.isFinite(expiryDate.getTime())) return false

  return expiryDate.getTime() < Date.now()
}

function trialUsageLabel(user = {}) {
  const commercial = user.commercialAccess || user.raw?.commercial_access || user.access?.commercial_access || {}
  const used = Number(commercial.free_quotes_used ?? user.raw?.free_quotes_used ?? 0)
  const limit = Math.max(1, Number(commercial.free_quote_limit ?? user.raw?.free_quote_limit ?? 1))

  return `${used}/${limit}`
}

function normalizeAccessPaymentStatus(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function isSuccessfulAccessPaymentStatus(value = '') {
  return [
    'paid',
    'succeeded',
    'success',
    'complete',
    'completed',
    'pagado',
    'pagada',
    'payment_confirmed',
    'payment confirmed',
    'pago confirmado',
    'pago aprobado',
    'exitoso',
  ].includes(normalizeAccessPaymentStatus(value))
}

function isPendingAccessPaymentStatus(value = '') {
  return [
    'pending',
    'processing',
    'requires_payment_method',
    'requires_confirmation',
    'requires_action',
    'payment_pending',
    'payment pending',
    'pago pendiente',
    'pago en revision',
    'validando pago',
  ].includes(normalizeAccessPaymentStatus(value))
}

function resolveRealPaymentState(user = {}) {
  const commercial = user.commercialAccess || user.raw?.commercial_access || user.access?.commercial_access || {}
  const latestPayment = latestAccessPaymentByUserId.value.get(Number(user?.id || 0)) || null
  const latestPaymentStatus = normalizeAccessPaymentStatus(latestPayment?.status)
  const accessStatus = normalizeAccessPaymentStatus(
    commercial.status || user.raw?.access_status || user.access?.access_status || '',
  )
  const hasPaidAccess = commercial.has_paid_access === true
  const currentPaymentConfirmed =
    latestPayment?.is_current === true && isSuccessfulAccessPaymentStatus(latestPaymentStatus)
  const activeCommercialAccess = hasPaidAccess || accessStatus === 'active'

  if (isCommercialAccessExpired(user, latestPayment)) {
    return {
      label: 'Vencido',
      meta: buildPaidPaymentMeta(latestPayment, user),
    }
  }

  if (currentPaymentConfirmed || activeCommercialAccess) {
    return {
      label: 'Pago realizado',
      meta: buildPaidPaymentMeta(latestPayment, user),
    }
  }

  if (latestPayment && latestPayment?.is_current === true && isPendingAccessPaymentStatus(latestPaymentStatus)) {
    return {
      label: 'Validando pago',
      meta: '',
    }
  }

  if (accessStatus === 'payment_pending') {
    return {
      label: 'Validando pago',
      meta: '',
    }
  }

  return {
    label: 'Sin pago',
    meta: '',
  }
}

function buildPaidPaymentMeta(payment = null, user = {}) {
  if (!payment && !user) return ''

  const paidAt = String(payment?.paid_at || '').trim()
  const cardBrand = String(payment?.card_brand || '').trim()
  const last4 = String(payment?.card_last4 || '').trim()
  const paymentBits = [cardBrand, last4 ? `**** ${last4}` : ''].filter(Boolean).join(' ')
  const expiresAt = resolveCommercialAccessExpiryDate(user, payment)

  if (paidAt && expiresAt && paymentBits) {
    return `Confirmado ${paidAt.slice(0, 10)} · vence ${expiresAt.slice(0, 10)} · ${paymentBits}`
  }
  if (paidAt && expiresAt) {
    return `Confirmado ${paidAt.slice(0, 10)} · vence ${expiresAt.slice(0, 10)}`
  }
  if (paidAt && paymentBits) {
    return `${paidAt.slice(0, 10)} · ${paymentBits}`
  }
  if (expiresAt) {
    return `Vence ${expiresAt.slice(0, 10)}`
  }
  if (paidAt) {
    return `Confirmado ${paidAt.slice(0, 10)}`
  }
  if (paymentBits) {
    return paymentBits
  }

  return ''
}

function paymentStatusLabel(user = {}) {
  return resolveRealPaymentState(user).label
}

function paymentStatusTone(user = {}) {
  const label = paymentStatusLabel(user)

  if (label === 'Pago realizado') return 'success'
  if (label === 'Validando pago') return 'warn'
  if (label === 'Vencido') return 'warn'
  return 'info'
}

function latestAccessPaymentForUser(user = {}) {
  return latestAccessPaymentByUserId.value.get(Number(user?.id || 0)) || null
}

function shouldShowPaymentAction(user = {}) {
  return isClientUser(user) && Boolean(latestAccessPaymentForUser(user))
}

function resolveAccessPaymentIntentId(payment = null) {
  return String(
    payment?.provider_payment_id ||
      payment?.payment_intent_id ||
      payment?.stripe_payment_intent_id ||
      payment?.intent_id ||
      '',
  ).trim()
}

function resolveAccessCheckoutSessionId(payment = null) {
  return String(
    payment?.provider_checkout_id ||
      payment?.checkout_session_id ||
      payment?.stripe_checkout_session_id ||
      '',
  ).trim()
}

function isReconcilingPayment(userId = 0) {
  return reconcilingPaymentUserIds.value.includes(Number(userId || 0))
}

function shouldShowPaymentReconcileAction(user = {}) {
  if (!isClientUser(user)) return false
  if (paymentStatusLabel(user) === 'Pago realizado') return false

  const payment = latestAccessPaymentForUser(user)
  if (!payment) return false

  return Boolean(resolveAccessPaymentIntentId(payment) || resolveAccessCheckoutSessionId(payment))
}

async function reconcileAccessPayment(user = {}) {
  const userId = Number(user?.id || 0)
  if (!userId || isReconcilingPayment(userId)) return

  const payment = latestAccessPaymentForUser(user)
  const checkoutSessionId = resolveAccessCheckoutSessionId(payment)

  if (!checkoutSessionId) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo validar el pago',
      message: 'Este registro no trae la sesion de Stripe necesaria para reconciliar el acceso comercial.',
    })
    return
  }

  reconcilingPaymentUserIds.value = [...reconcilingPaymentUserIds.value, userId]

  try {
    await requestWithCandidates([
      {
        method: 'get',
        path: '/client/access-payment/success',
        query: checkoutSessionId ? { session_id: checkoutSessionId } : undefined,
        timeoutMs: 30000,
      },
    ])

    await emit('refresh')

    if (detailOpen.value && selectedUserDetail.value?.user?.id === userId) {
      await openUserDetail(selectedUserDetail.value.user)
    }

    ui.pushToast({
      tone: 'success',
      title: 'Pago validado',
      message: `El acceso comercial de ${user.name} se sincronizo con el pago confirmado.`,
    })
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo validar el pago',
      message: error?.message || 'El backend no pudo reconciliar este pago de acceso comercial.',
    })
  } finally {
    reconcilingPaymentUserIds.value = reconcilingPaymentUserIds.value.filter((id) => id !== userId)
  }
}

function closePaymentDetailModal() {
  paymentDetailOpen.value = false
  selectedPaymentDetail.value = null
}

function openPaymentDetail(user = {}) {
  closeActionsModal()
  const payment = latestAccessPaymentForUser(user)
  if (!payment) return

  selectedPaymentDetail.value = {
    user,
    payment,
  }
  paymentDetailOpen.value = true
}

function formatMoneyAmount(amount = 0, currency = 'USD') {
  const normalizedCurrency = String(currency || 'USD').trim().toUpperCase() || 'USD'
  const numericAmount = Number(amount || 0)

  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: normalizedCurrency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numericAmount) ? numericAmount : 0)
}

function paymentDetailRows(detail = {}) {
  const payment = detail?.payment || {}
  const user = detail?.user || {}

  return [
    { label: 'Estado', value: paymentStatusLabel(user) },
    { label: 'Monto', value: formatMoneyAmount(payment.amount, payment.currency || 'USD') },
    { label: 'Fecha de pago', value: payment.paid_at || 'Sin confirmar' },
    { label: 'Marca', value: payment.card_brand || 'Sin dato' },
    { label: 'Ultimos 4', value: payment.card_last4 ? `**** ${payment.card_last4}` : 'Sin dato' },
    { label: 'Payment Intent', value: payment.provider_payment_id || 'Sin dato' },
    { label: 'Checkout Session', value: payment.provider_checkout_id || 'Sin dato' },
    { label: 'Periodo inicio', value: payment.billing_period_start || 'Sin dato' },
    { label: 'Periodo fin', value: payment.billing_period_end || 'Sin dato' },
    { label: 'Pago actual', value: payment.is_current ? 'Si' : 'No' },
    { label: 'Acceso usuario', value: user.raw?.access_status || user.commercialAccess?.status || 'Sin dato' },
    {
      label: 'Acceso pagado',
      value:
        user.commercialAccess?.has_paid_access === true || user.raw?.has_paid_access === true
          ? 'Si'
          : 'No',
    },
  ]
}

function isNewClientRegistration(user = {}) {
  if (!isClientUser(user)) return false
  const commercial = user.commercialAccess || user.raw?.commercial_access || user.access?.commercial_access || {}
  return commercial.is_new_registration === true
}

function shouldShowCommercialAccessAction(user = {}) {
  if (!isClientUser(user)) return false

  const commercialState = resolveCommercialAccessForUser(user)
  if (commercialState === 'Pago activo' || commercialState === 'Pago en validacion') {
    return false
  }

  return true
}

function commercialAccessActionLabel(user = {}) {
  const commercial = user.commercialAccess || user.raw?.commercial_access || user.access?.commercial_access || {}
  if (resolveCommercialAccessForUser(user) === 'Pago activo' || commercial.has_paid_access === true) {
    return 'Revocar acceso'
  }
  if (resolveCommercialAccessForUser(user) === 'Pago en validacion') {
    return 'Validando pago'
  }
  if (resolveCommercialAccessForUser(user) === 'Acceso vencido') {
    return 'Reactivar acceso'
  }
  return commercialAccessTone(user) === 'success' ? 'Desactivar demo' : 'Activar demo'
}

function isClientUser(user = {}) {
  return normalizeRoleKey(user?.role) === 'client'
}

function closeDetailModal() {
  detailOpen.value = false
  detailLoading.value = false
  detailError.value = ''
  selectedUserDetail.value = null
}

async function openUserDetail(user) {
  closeActionsModal()
  detailOpen.value = true
  detailLoading.value = true
  detailError.value = ''
  selectedUserDetail.value = {
    user,
    provider: user.provider,
  }

  try {
    const response = await requestWithCandidates([
      { method: 'get', path: `/admin/usuarios/${user.id}` },
      { method: 'get', path: `/admin/users/${user.id}` },
    ])
    const detailedUser = normalizeUserRecord(pickRecord(response, ['user']), 0)

    selectedUserDetail.value = {
      user: detailedUser,
      provider: detailedUser.provider,
    }
  } catch (error) {
    detailError.value = error.message || 'No fue posible cargar el detalle completo.'
  } finally {
    detailLoading.value = false
  }
}

async function loadUsersFromBackend() {
  const response = await requestWithCandidates([
    { method: 'get', path: '/admin/users', timeoutMs: ADMIN_USERS_TIMEOUT_MS },
  ])

  const users = pickCollection(response, ['users'])
  if (users.length) {
    localUsers.value = users.map((user, index) => normalizeUserRecord(user, index))
  }
}

async function loadRolesFromBackend() {
  try {
    const response = await requestWithCandidates([
      { method: 'get', path: '/admin/roles', timeoutMs: ADMIN_USERS_TIMEOUT_MS },
    ])
    const roles = pickCollection(response, ['roles']).map((role) => normalizeRoleRecord(role))

    localRoles.value = roles.length ? roles : defaultRoleBlueprints.map((role) => ({ ...role }))
  } catch {
    localRoles.value = defaultRoleBlueprints.map((role) => ({ ...role }))
  }
}

async function loadProvidersFromBackend() {
  try {
    const response = await requestWithCandidates([{ method: 'get', path: '/admin/operators' }])
    const providers = pickCollection(response, ['operators', 'proveedores', 'providers'])

    providerCatalog.value = providers.map((provider) => normalizeProviderRecord(provider))
  } catch {
    providerCatalog.value = []
  }
}

async function refreshCurrentUserSource() {
  if (isClientScope.value) {
    emit('refresh')
    return
  }

  await loadUsersFromBackend()
}

function userInitials(name) {
  return String(name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase())
    .join('')
}

function normalizeClientCommercialBadge(user = {}) {
  const accessState = commercialAccessLabel(user)
  const paymentState = paymentStatusLabel(user)

  if (paymentState === 'Pago realizado' || accessState === 'Pago activo') {
    return { label: 'Pago activo', tone: 'success' }
  }

  if (accessState === 'Prueba consumida') {
    return { label: 'Prueba consumida', tone: 'warn' }
  }

  if (normalizeStatusKey(user.status) === 'activo') {
    return { label: 'Active', tone: 'info' }
  }

  return { label: 'Sin pago', tone: 'danger' }
}

function compactCommercialStatus(user = {}) {
  const label = commercialLifecycleLabel(user)
  if (label === 'Pago activo' || label === 'Pago en validacion') return label
  if (label === 'Registro nuevo') return 'Nuevo'
  if (label === 'Prueba disponible') return 'Prueba disponible'
  if (label === 'Prueba consumida') return 'Prueba consumida'
  if (label === 'Acceso vencido') return 'Vencido'
  return label
}

function compactUserStatus(user = {}) {
  return normalizeStatusLabel(user.status)
}

function goToClientPage(page) {
  const lastPage = clientTableSummary.value.lastPage
  currentPage.value = Math.min(Math.max(1, page), lastPage)
}

function formatRoleName(roleKey) {
  return roleSummaries.value.find((role) => role.key === normalizeRoleKey(roleKey))?.name || roleKey
}

function toggleFilters() {
  filtersOpen.value = !filtersOpen.value
}

function openUsersPanel() {
  activePanel.value = 'users'
}

function openRolesPanel() {
  activePanel.value = 'roles'
  if (!props.hideRolePanel) {
    void loadRolesFromBackend()
  }
}

watch(
  () => normalizeRoleKey(userForm.value.role),
  (roleKey) => {
    if (roleKey === 'provider' && providerCatalog.value.length === 0) {
      void loadProvidersFromBackend()
    }
  },
)

function openCreateUser() {
  drawerMode.value = 'create'
  editingUserId.value = null
  userForm.value = buildEmptyUser()
  userFormErrors.value = {}
  drawerOpen.value = true
}

function openEditUser(user) {
  drawerMode.value = 'edit'
  editingUserId.value = user.id
  userForm.value = {
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    password: '',
    role: user.role,
    provider_id: user.provider_id || '',
    status: normalizeStatusLabel(user.status),
    permissions: user.permissions || '',
    invitationSent: user.invitationSent ?? false,
  }
  userFormErrors.value = {}
  drawerOpen.value = true
}

function closeUserDrawer() {
  drawerOpen.value = false
  userFormErrors.value = {}
}

function validateUserForm() {
  const errors = {}
  const trimmedName = String(userForm.value.name || '').trim()
  const trimmedEmail = String(userForm.value.email || '').trim()
  const trimmedPhone = String(userForm.value.phone || '').trim()
  const trimmedPassword = String(userForm.value.password || '').trim()

  if (!trimmedName) {
    errors.name = 'Escribe el nombre completo del usuario.'
  }

  if (!trimmedEmail) {
    errors.email = 'Escribe un correo para enviar el acceso.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    errors.email = 'El correo no tiene un formato valido. Ejemplo: usuario@empresa.com'
  }

  if (!trimmedPhone) {
    errors.phone = 'Escribe un telefono de contacto.'
  } else if (!/^[\d\s+()-]{7,}$/.test(trimmedPhone)) {
    errors.phone = 'El telefono debe tener al menos 7 digitos.'
  }

  if (drawerMode.value === 'create' && trimmedPassword && trimmedPassword.length < 8) {
    errors.password = 'La password temporal debe tener al menos 8 caracteres.'
  }

  if (!String(userForm.value.role || '').trim()) {
    errors.role = 'Selecciona un rol para el usuario.'
  }

  if (normalizeRoleKey(userForm.value.role) === 'provider' && !String(userForm.value.provider_id || '').trim()) {
    errors.provider_id = 'Selecciona el proveedor al que pertenece este usuario.'
  }

  if (!String(userForm.value.status || '').trim()) {
    errors.status = 'Selecciona un estado inicial.'
  }

  return errors
}

function normalizeBackendUserError(error) {
  const fieldErrors = {}
  const payloadErrors = error?.payload?.errors

  if (payloadErrors && typeof payloadErrors === 'object') {
    Object.entries(payloadErrors).forEach(([field, messages]) => {
      const firstMessage = Array.isArray(messages) ? messages[0] : messages
      if (!firstMessage) return

      if (field === 'name') fieldErrors.name = 'Revisa el nombre completo.'
      else if (field === 'email') fieldErrors.email = 'Ese correo es invalido o ya esta registrado.'
      else if (field === 'phone') fieldErrors.phone = 'Revisa el telefono capturado.'
      else if (field === 'password') fieldErrors.password = 'La password temporal no cumple los requisitos.'
      else if (field === 'role') fieldErrors.role = 'El rol seleccionado no es valido.'
      else if (field === 'provider_id' || field === 'proveedor_id') fieldErrors.provider_id = 'El proveedor asignado no es valido.'
      else if (field === 'status') fieldErrors.status = 'El estado seleccionado no es valido.'
    })
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      fieldErrors,
      message: 'Revisa los campos marcados antes de guardar.',
    }
  }

  const rawMessage = String(error?.message || '').toLowerCase()

  if (rawMessage.includes('invalid') || rawMessage.includes('inval')) {
    return {
      fieldErrors: {},
      message: 'Faltan datos obligatorios o alguno no tiene el formato correcto.',
    }
  }

  if (rawMessage.includes('email')) {
    return {
      fieldErrors: { email: 'Revisa el correo. Puede tener formato incorrecto o ya existir.' },
      message: 'El correo necesita correccion antes de continuar.',
    }
  }

  return {
    fieldErrors: {},
    message: error?.message || 'No fue posible guardar el usuario con la informacion capturada.',
  }
}

async function submitUserForm() {
  if (savingUser.value) return

  userFormErrors.value = validateUserForm()
  if (Object.keys(userFormErrors.value).length > 0) {
    ui.pushToast({
      tone: 'error',
      title: 'Revisa el formulario',
      message: 'Completa los campos marcados antes de crear o actualizar el usuario.',
    })
    return
  }

  const payload = {
    name: userForm.value.name || 'Nuevo usuario',
    email: userForm.value.email || 'pendiente@redaviation.mx',
    phone: userForm.value.phone || '',
    role: normalizeRoleKey(userForm.value.role || 'client'),
    provider_id:
      normalizeRoleKey(userForm.value.role || 'client') === 'provider'
        ? Number(userForm.value.provider_id || 0) || null
        : null,
    status:
      normalizeStatusKey(userForm.value.status) === 'suspendido'
        ? 'blocked'
        : normalizeStatusKey(userForm.value.status) === 'activo'
          ? 'active'
          : 'inactive',
  }

  savingUser.value = true

  try {
    if (drawerMode.value === 'create' && userForm.value.password) {
      payload.password = userForm.value.password
    }

    const response = await requestWithCandidates([
      drawerMode.value === 'create'
        ? { method: 'post', path: '/admin/users', body: payload }
        : { method: 'put', path: `/admin/users/${editingUserId.value}`, body: payload },
    ])

    await Promise.all([
      refreshCurrentUserSource(),
      ...(props.hideRolePanel ? [] : [loadRolesFromBackend()]),
      loadProvidersFromBackend(),
    ])
    drawerOpen.value = false
    userFormErrors.value = {}
    ui.pushToast({
      tone: 'success',
      title: drawerMode.value === 'edit' ? 'Usuario actualizado' : 'Usuario creado',
      message:
        drawerMode.value === 'create' && response.temporary_password
          ? `El usuario ya quedo creado. Password temporal: ${response.temporary_password}`
          : 'El cambio ya quedo persistido en backend.',
    })
  } catch (error) {
    const normalizedError = normalizeBackendUserError(error)
    userFormErrors.value = normalizedError.fieldErrors
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo guardar',
      message: normalizedError.message,
    })
  } finally {
    savingUser.value = false
  }
}

function openCreateRole() {
  loadRolesFromBackend()
  ui.pushToast({
    tone: 'info',
    title: 'Roles sincronizados',
    message: 'La vista recargo el catalogo de roles disponible en backend.',
  })
}

function openEditRole(role) {
  ui.pushToast({
    tone: 'info',
    title: role.name,
    message: 'Este catalogo de roles se administra desde backend. Aqui puedes asignarlo a usuarios.',
  })
}

function closeRoleModal() {
  roleModalOpen.value = false
}

async function submitRoleForm() {
  ui.pushToast({
    tone: 'info',
    title: 'Solo lectura',
    message: 'En esta vista el foco queda en asignar roles a usuarios existentes.',
  })
}

async function suspendUser(user) {
  const shouldActivate = canActivateStatus(user.status)

  try {
    await requestWithCandidates([
      { method: 'post', path: `/admin/users/${user.id}/${shouldActivate ? 'activate' : 'block'}`, body: {} },
    ])

    await refreshCurrentUserSource()
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo actualizar',
      message: error.message || 'El estado del usuario no pudo persistirse.',
    })
  }
}

async function grantUserTrial(user) {
  try {
    const response = await requestWithCandidates([
      { method: 'post', path: `/admin/users/${user.id}/grant-trial`, body: {} },
    ])
    const refreshedUser = response?.user ? normalizeUserRecord(response.user, 0) : null

    await refreshCurrentUserSource()

    if (detailOpen.value && selectedUserDetail.value?.user?.id === user.id && refreshedUser) {
      selectedUserDetail.value = {
        user: refreshedUser,
        provider: refreshedUser.provider,
      }
    }

    ui.pushToast({
      tone: 'success',
      title: 'Demo activada',
      message:
        response.message ||
        `La cuenta de ${user.name} ya tiene demo comercial activa y acceso para crear solicitudes.`,
    })
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo activar la demo',
      message: error.message || 'El backend no pudo habilitar el acceso comercial del cliente.',
    })
  }
}

async function revokeCommercialAccess(user) {
  try {
    const response = await requestWithCandidates([
      { method: 'post', path: `/admin/users/${user.id}/revoke-commercial-access`, body: {} },
    ])
    const refreshedUser = response?.user ? normalizeUserRecord(response.user, 0) : null

    await refreshCurrentUserSource()

    if (detailOpen.value && selectedUserDetail.value?.user?.id === user.id && refreshedUser) {
      selectedUserDetail.value = {
        user: refreshedUser,
        provider: refreshedUser.provider,
      }
    }

    ui.pushToast({
      tone: 'success',
      title: 'Acceso comercial desactivado',
      message: response.message || `La cuenta de ${user.name} ya no puede cotizar ni reservar hasta nueva activacion.`,
    })
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo desactivar el acceso',
      message: error.message || 'El backend no pudo retirar el acceso comercial del cliente.',
    })
  }
}

function toggleCommercialAccess(user) {
  if (commercialAccessTone(user) === 'success') {
    void revokeCommercialAccess(user)
    return
  }

  void grantUserTrial(user)
}

async function resetPassword(user) {
  try {
    const response = await requestWithCandidates([
      { method: 'post', path: `/admin/users/${user.id}/reset-password`, body: {} },
    ])

    ui.pushToast({
      tone: 'success',
      title: 'Password reiniciado',
      message: `Nuevo password temporal para ${user.name}: ${response.temporary_password}`,
    })
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo resetear',
      message: error.message || `No se pudo reiniciar la contrasena de ${user.name}.`,
    })
  }
}

async function changeRole(user) {
  const availableRoleKeys = localRoles.value.map((role) => role.key)
  const currentIndex = availableRoleKeys.indexOf(normalizeRoleKey(user.role))
  const nextRole = availableRoleKeys[(currentIndex + 1) % availableRoleKeys.length] || 'client'

  try {
    await requestWithCandidates([
      { method: 'put', path: `/admin/users/${user.id}`, body: { role: normalizeRoleKey(nextRole) } },
    ])

    await Promise.all([refreshCurrentUserSource(), ...(props.hideRolePanel ? [] : [loadRolesFromBackend()])])
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo cambiar rol',
      message: error.message || 'El backend no acepto el cambio de rol.',
    })
  }
}

async function exportUsers() {
  ui.pushToast({
    tone: 'info',
    title: 'No disponible',
    message: 'El backend actual no expone exportacion de usuarios para este modulo.',
  })
}

async function deleteUser(user) {
  try {
    await requestWithCandidates([{ method: 'delete', path: `/admin/users/${user.id}` }])
    await Promise.all([refreshCurrentUserSource(), ...(props.hideRolePanel ? [] : [loadRolesFromBackend()])])
    ui.pushToast({
      tone: 'success',
      title: 'Usuario eliminado',
      message: `${user.name} ya no forma parte del directorio.`,
    })
  } catch (error) {
    ui.pushToast({
      tone: 'error',
      title: 'No se pudo eliminar',
      message: error.message || `No se pudo eliminar a ${user.name}.`,
    })
  }
}

function openActionsModal(user) {
  selectedActionUser.value = selectedActionUser.value?.id === user.id ? null : user
}

function closeActionsModal() {
  selectedActionUser.value = null
}

function handleViewUser(user) {
  openUserDetail(user)
}

function handleEditUser(user) {
  closeActionsModal()
  openEditUser(user)
}

function handleChangeRole(user) {
  changeRole(user)
  closeActionsModal()
}

function handleSuspendUser(user) {
  suspendUser(user)
  closeActionsModal()
}

function handleGrantUserTrial(user) {
  grantUserTrial(user)
  closeActionsModal()
}

function handleResetPassword(user) {
  resetPassword(user)
  closeActionsModal()
}

function handleDeleteUser(user) {
  deleteUser(user)
  closeActionsModal()
}

function handleAuditUser(user) {
  closeActionsModal()
  auditUser(user)
}

function auditUser(user) {
  emit('audit-user', user)
}
</script>

<template>
  <div class="admin-users-page">
    <section class="dashboard-hero">
      <div class="hero-center hero-compact">
        <p class="eyebrow dark-eyebrow">Usuarios y roles</p>
        <h1>{{ title }}</h1>
        <p class="hero-subtitle">{{ subtitle }}</p>
        <div class="hero-actions">
          <button type="button" class="admin-btn admin-btn-primary" @click="openCreateUser">+ Nuevo usuario</button>
          <button
            v-if="!hideRolePanel"
            type="button"
            class="admin-btn admin-btn-secondary"
            @click="openCreateRole"
          >
            Sincronizar roles
          </button>
          <button type="button" class="admin-btn admin-btn-ghost" @click="exportUsers">Exportar</button>
          <button type="button" class="admin-btn admin-btn-ghost" @click="toggleFilters">
            {{ filtersOpen ? 'Ocultar filtros' : 'Filtros' }}
          </button>
        </div>
        <div v-if="!hideRolePanel" class="panel-switch" role="tablist" aria-label="Vista de usuarios y roles">
          <button
            type="button"
            class="panel-switch-btn"
            :class="{ 'panel-switch-btn-active': activePanel === 'users' }"
            @click="openUsersPanel"
          >
            Usuarios
          </button>
          <button
            type="button"
            class="panel-switch-btn"
            :class="{ 'panel-switch-btn-active': activePanel === 'roles' }"
            @click="openRolesPanel"
          >
            Roles y permisos
          </button>
        </div>
      </div>
    </section>

    <section class="status-strip">
      <article v-for="item in userSignals" :key="item.label" class="signal-card" :class="`signal-card-${item.tone}`">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <p>{{ item.detail }}</p>
      </article>
    </section>

    <section v-if="filtersOpen" class="filters-panel">
      <label class="field search-field">
        <span>Buscar</span>
        <input v-model="searchTerm" type="search" placeholder="Nombre, correo o telefono" />
      </label>

      <label class="field">
        <span>Estado</span>
        <select v-model="statusFilter">
          <option value="todos">Todos</option>
          <option value="activo">Activos</option>
          <option value="suspendido">Suspendidos</option>
        </select>
      </label>

      <label class="field">
        <span>Rol</span>
        <select v-model="roleFilter" :disabled="isClientScope">
          <option value="todos">Todos</option>
          <option v-for="role in roleSummaries" :key="role.key" :value="role.key">{{ role.name }}</option>
        </select>
      </label>

      <label class="field">
        <span>Acceso comercial</span>
        <select v-model="commercialAccessFilter">
          <option value="todos">Todos</option>
          <option value="habilitado">Habilitado</option>
          <option value="bloqueado">Bloqueado</option>
          <option value="no-aplica">No aplica</option>
        </select>
      </label>
    </section>

    <section v-if="activePanel === 'roles'" class="editorial-section">
      <div class="section-heading split-heading">
        <div>
          <h2>Roles y permisos</h2>
          <p>Consulta el alcance de cada rol y despues vuelve al directorio para asignarlo a usuarios existentes.</p>
        </div>
        <button type="button" class="admin-btn admin-btn-secondary" @click="openCreateRole">Recargar roles</button>
      </div>

      <div class="workstreams-grid roles-layout">
        <article v-for="role in roleSummaries" :key="role.key" class="workstream-card role-stream-card">
          <span class="workstream-label">{{ role.name }}</span>
          <h3>{{ role.name }}</h3>
          <span class="role-scope">{{ role.scope }}</span>
          <p class="workstream-copy">{{ role.description }}</p>
          <strong class="stream-meta">{{ role.users }} usuarios</strong>
          <ul>
            <li v-for="permission in role.permissions" :key="permission">{{ permission }}</li>
          </ul>
          <div class="inline-actions">
            <button type="button" class="admin-text-btn" @click="openEditRole(role)">Ver permisos</button>
            <button type="button" class="admin-text-btn" @click="openUsersPanel">Asignar desde usuarios</button>
          </div>
        </article>
      </div>
    </section>

    <section v-else-if="isClientScope" class="editorial-section editorial-section-clients">
      <div class="section-heading split-heading">
        <div>
          <h2>Panel comercial de clientes</h2>
        </div>
        <div class="hero-actions">
          <button type="button" class="admin-btn admin-btn-secondary" :disabled="isRefreshing" @click="emit('refresh')">
            {{ isRefreshing ? 'Actualizando...' : 'Refrescar tabla' }}
          </button>
          <button type="button" class="admin-btn admin-btn-primary" @click="openCreateUser">+ Nuevo usuario</button>
        </div>
      </div>

      <div class="table-shell table-shell-clients table-shell-clients-compact">
        <div class="client-table-toolbar">
          <div class="client-table-toolbar__meta">
            <strong>{{ clientTableSummary.total }}</strong>
            <span>
              {{ clientTableSummary.from }}-{{ clientTableSummary.to }} de {{ clientTableSummary.total }} clientes
            </span>
          </div>

          <label class="client-table-toolbar__page-size">
            <span>Filas</span>
            <select v-model="rowsPerPage">
              <option :value="10">10</option>
              <option :value="20">20</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
            </select>
          </label>
        </div>

        <div class="clients-table-desktop">
          <div class="clients-table-scroll">
            <table class="clients-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Correo</th>
                  <th>Telefono</th>
                  <th>Estado comercial</th>
                  <th>Estado</th>
                  <th>Prueba</th>
                  <th>Pago</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="user in paginatedUsers" :key="user.id">
                  <td>
                    <div class="user-cell user-cell-compact">
                      <div class="avatar-mini">{{ userInitials(user.name) }}</div>
                      <div class="cell-stack">
                        <strong class="user-name">{{ user.name }}</strong>
                        <small class="client-inline-badge" :class="`client-inline-badge--${normalizeClientCommercialBadge(user).tone}`">
                          {{ normalizeClientCommercialBadge(user).label }}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td class="email-cell">{{ user.email }}</td>
                  <td>{{ user.phone || 'Sin telefono' }}</td>
                  <td>
                    <span
                      class="status-pill status-pill-commercial status-pill-compact"
                      :class="{
                        'status-pill-success': commercialAccessTone(user) === 'success',
                        'status-pill-info': commercialAccessTone(user) === 'info',
                        'status-pill-warn': commercialAccessTone(user) === 'warn',
                        'status-pill-danger': commercialAccessTone(user) === 'blocked',
                      }"
                    >
                      {{ compactCommercialStatus(user) }}
                    </span>
                  </td>
                  <td>
                    <span
                      class="status-pill status-pill-compact"
                      :class="{
                        'status-pill-warn': normalizeStatusKey(user.status) === 'suspendido',
                        'status-pill-danger': normalizeStatusKey(user.status) === 'inactivo',
                        'status-pill-info': normalizeStatusKey(user.status) === 'activo',
                      }"
                    >
                      {{ compactUserStatus(user) }}
                    </span>
                  </td>
                  <td>
                    <span class="status-pill status-pill-compact status-pill-neutral">
                      {{ trialUsageLabel(user) }}
                    </span>
                  </td>
                  <td>
                    <span
                      class="status-pill status-pill-commercial status-pill-compact"
                      :class="{
                        'status-pill-success': paymentStatusTone(user) === 'success',
                        'status-pill-warn': paymentStatusTone(user) === 'warn',
                        'status-pill-info': paymentStatusTone(user) === 'info',
                      }"
                    >
                      {{ paymentStatusLabel(user) === 'Pago realizado' ? 'Pago activo' : paymentStatusLabel(user) }}
                    </span>
                  </td>
                  <td>
                    <div class="row-actions row-actions-compact">
                      <button
                        type="button"
                        class="admin-mini-btn admin-actions-trigger admin-actions-trigger-icon"
                        aria-label="Abrir acciones"
                        @click.stop="openActionsModal(user)"
                      >
                        <span aria-hidden="true">•••</span>
                      </button>

                      <div
                        v-if="selectedActionUser?.id === user.id"
                        class="mini-action-modal mini-action-popover"
                        @click.stop
                      >
                        <button type="button" class="mini-action-item" @click="handleViewUser(selectedActionUser)">Ver detalles</button>
                        <button
                          v-if="shouldShowPaymentAction(selectedActionUser)"
                          type="button"
                          class="mini-action-item"
                          @click="openPaymentDetail(selectedActionUser)"
                        >
                          Ver pago
                        </button>
                        <button
                          v-if="shouldShowPaymentReconcileAction(selectedActionUser)"
                          type="button"
                          class="mini-action-item"
                          :disabled="isReconcilingPayment(selectedActionUser.id)"
                          @click="reconcileAccessPayment(selectedActionUser)"
                        >
                          {{ isReconcilingPayment(selectedActionUser.id) ? 'Validando...' : 'Validar pago' }}
                        </button>
                        <button type="button" class="mini-action-item" @click="handleEditUser(selectedActionUser)">Editar</button>
                        <button
                          v-if="isClientUser(selectedActionUser)"
                          type="button"
                          class="mini-action-item"
                          @click="handleGrantUserTrial(selectedActionUser)"
                        >
                          Activar demo 15 dias
                        </button>
                        <button type="button" class="mini-action-item" @click="handleSuspendUser(selectedActionUser)">
                          {{ canActivateStatus(selectedActionUser.status) ? 'Activar' : 'Suspender' }}
                        </button>
                        <button type="button" class="mini-action-item" @click="handleAuditUser(selectedActionUser)">Auditar</button>
                        <button type="button" class="mini-action-item" @click="handleResetPassword(selectedActionUser)">Resetear</button>
                        <button type="button" class="mini-action-item" @click="handleDeleteUser(selectedActionUser)">Eliminar</button>
                      </div>
                    </div>
                  </td>
                </tr>
                <tr v-if="!paginatedUsers.length">
                  <td colspan="8" class="empty-table-cell">No hay usuarios para mostrar con los filtros actuales.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="clients-mobile-list">
          <article v-for="user in paginatedUsers" :key="`mobile-${user.id}`" class="client-mobile-card">
            <div class="client-mobile-card__top">
              <div class="user-cell user-cell-compact">
                <div class="avatar-mini">{{ userInitials(user.name) }}</div>
                <div class="cell-stack">
                  <strong class="user-name">{{ user.name }}</strong>
                  <small>{{ user.email }}</small>
                </div>
              </div>
              <button
                type="button"
                class="admin-mini-btn admin-actions-trigger admin-actions-trigger-icon"
                aria-label="Abrir acciones"
                @click.stop="openActionsModal(user)"
              >
                <span aria-hidden="true">•••</span>
              </button>
            </div>
            <div class="client-mobile-card__meta">
              <span class="status-pill status-pill-commercial status-pill-compact" :class="{
                'status-pill-success': commercialAccessTone(user) === 'success',
                'status-pill-info': commercialAccessTone(user) === 'info',
                'status-pill-warn': commercialAccessTone(user) === 'warn',
                'status-pill-danger': commercialAccessTone(user) === 'blocked',
              }">{{ compactCommercialStatus(user) }}</span>
              <span class="status-pill status-pill-compact status-pill-neutral">{{ trialUsageLabel(user) }}</span>
              <span class="status-pill status-pill-commercial status-pill-compact" :class="{
                'status-pill-success': paymentStatusTone(user) === 'success',
                'status-pill-warn': paymentStatusTone(user) === 'warn',
                'status-pill-info': paymentStatusTone(user) === 'info',
              }">{{ paymentStatusLabel(user) === 'Pago realizado' ? 'Pago activo' : paymentStatusLabel(user) }}</span>
            </div>
            <div
              v-if="selectedActionUser?.id === user.id"
              class="mini-action-modal mini-action-popover mini-action-popover-mobile"
              @click.stop
            >
              <button type="button" class="mini-action-item" @click="handleViewUser(selectedActionUser)">Ver detalles</button>
              <button
                v-if="shouldShowPaymentAction(selectedActionUser)"
                type="button"
                class="mini-action-item"
                @click="openPaymentDetail(selectedActionUser)"
              >
                Ver pago
              </button>
              <button type="button" class="mini-action-item" @click="handleEditUser(selectedActionUser)">Editar</button>
            </div>
          </article>
          <div v-if="!paginatedUsers.length" class="empty-table-cell empty-table-cell-mobile">
            No hay usuarios para mostrar con los filtros actuales.
          </div>
        </div>

        <div class="clients-pagination">
          <div class="clients-pagination__summary">
            Mostrando {{ clientTableSummary.from }}-{{ clientTableSummary.to }} de {{ clientTableSummary.total }}
          </div>
          <div class="clients-pagination__actions">
            <button type="button" class="pager-button" :disabled="currentPage <= 1" @click="goToClientPage(currentPage - 1)">
              Anterior
            </button>
            <span class="clients-pagination__page">Pagina {{ currentPage }} / {{ clientTableSummary.lastPage }}</span>
            <button
              type="button"
              class="pager-button"
              :disabled="currentPage >= clientTableSummary.lastPage"
              @click="goToClientPage(currentPage + 1)"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </section>

    <section v-else class="editorial-section">
      <div class="section-heading split-heading">
        <div>
          <h2>Directorio de usuarios</h2>
          <p>{{ filteredUsers.length }} registros listos para consulta, edicion, suspension y cambio de rol.</p>
        </div>
        <div class="hero-actions">
          <button type="button" class="admin-btn admin-btn-primary" @click="openCreateUser">+ Nuevo usuario</button>
          <button v-if="!hideRolePanel" type="button" class="admin-btn admin-btn-secondary" @click="openRolesPanel">Ver roles</button>
        </div>
      </div>

      <div class="table-shell">
        <div class="table-row table-head-row">
          <span>Usuario</span>
          <span>Correo</span>
          <span>Contrasena</span>
          <span>Rol</span>
          <span>Estado</span>
          <span>Acceso comercial</span>
          <span>Acciones</span>
        </div>

        <div v-for="user in filteredUsers" :key="user.id" class="table-row">
          <div class="user-cell">
            <div class="avatar-mini">{{ userInitials(user.name) }}</div>
            <div class="cell-stack">
              <strong class="user-name">{{ user.name }}</strong>
              <small>{{ user.phone || 'Sin telefono' }}</small>
            </div>
          </div>

          <span class="email-cell">{{ user.email }}</span>
          <span class="password-cell">{{ user.password || 'No disponible' }}</span>
          <span>{{ formatRoleName(user.role) }}</span>
          <span>
            <span
              class="status-pill"
              :class="{
                'status-pill-warn': normalizeStatusKey(user.status) === 'suspendido',
                'status-pill-danger': normalizeStatusKey(user.status) === 'inactivo',
              }"
            >
              {{ user.status }}
            </span>
          </span>

          <span class="commercial-access-cell">
            <template v-if="isClientUser(user)">
              <span
                class="status-pill status-pill-commercial"
                :class="{
                  'status-pill-success': commercialAccessTone(user) === 'success',
                  'status-pill-info': commercialAccessTone(user) === 'info',
                  'status-pill-warn': commercialAccessTone(user) === 'warn',
                  'status-pill-danger': commercialAccessTone(user) === 'blocked',
                }"
              >
                {{ commercialAccessLabel(user) }}
              </span>
              <small class="commercial-access-meta">{{ commercialAccessMeta(user) }}</small>
              <button
                v-if="shouldShowCommercialAccessAction(user)"
                type="button"
                class="admin-mini-btn commercial-access-btn"
                @click="toggleCommercialAccess(user)"
              >
                {{ commercialAccessActionLabel(user) }}
              </button>
            </template>
            <span v-else class="table-muted">No aplica</span>
          </span>

          <div class="row-actions">
            <button type="button" class="admin-mini-btn admin-actions-trigger" @click.stop="openActionsModal(user)">
              Acciones
            </button>

            <div
              v-if="selectedActionUser?.id === user.id"
              class="mini-action-modal mini-action-popover"
              @click.stop
            >
              <button type="button" class="mini-action-item" @click="handleViewUser(selectedActionUser)">Ver</button>
              <button type="button" class="mini-action-item" @click="handleChangeRole(selectedActionUser)">Cambiar rol</button>
              <button type="button" class="mini-action-item" @click="handleEditUser(selectedActionUser)">Editar</button>
              <button
                v-if="isClientUser(selectedActionUser)"
                type="button"
                class="mini-action-item"
                @click="handleGrantUserTrial(selectedActionUser)"
              >
                Activar demo 15 dias
              </button>
              <button type="button" class="mini-action-item" @click="handleSuspendUser(selectedActionUser)">
                {{ canActivateStatus(selectedActionUser.status) ? 'Activar' : 'Suspender' }}
              </button>
              <button type="button" class="mini-action-item" @click="handleAuditUser(selectedActionUser)">Auditar</button>
              <button type="button" class="mini-action-item" @click="handleResetPassword(selectedActionUser)">Resetear</button>
              <button type="button" class="mini-action-item" @click="handleDeleteUser(selectedActionUser)">Eliminar</button>
            </div>
          </div>
        </div>

        <div v-if="!filteredUsers.length" class="table-row empty-row">
          <span>No hay usuarios para mostrar con los filtros actuales.</span>
        </div>
      </div>
    </section>

    <transition name="fade">
      <div v-if="drawerOpen" class="overlay" @click.self="closeUserDrawer">
        <aside class="drawer-panel">
          <div class="overlay-head">
            <div>
              <span class="mini-badge">{{ drawerMode === 'create' ? 'Nuevo usuario' : 'Editar usuario' }}</span>
              <h3>{{ drawerMode === 'create' ? 'Crear usuario' : 'Actualizar usuario' }}</h3>
              <p>Completa la informacion operativa y define el alcance del acceso.</p>
            </div>
            <button type="button" class="admin-btn admin-btn-ghost" @click="closeUserDrawer">Cerrar</button>
          </div>

          <div class="form-grid">
            <label class="field">
              <span>Nombre completo</span>
              <input v-model="userForm.name" type="text" placeholder="Nombre del usuario" />
              <small v-if="userFormErrors.name" class="field-error">{{ userFormErrors.name }}</small>
            </label>

            <label class="field">
              <span>Correo</span>
              <input v-model="userForm.email" type="email" placeholder="correo@empresa.com" />
              <small v-if="userFormErrors.email" class="field-error">{{ userFormErrors.email }}</small>
            </label>

            <label class="field">
              <span>Telefono</span>
              <input v-model="userForm.phone" type="text" placeholder="+52 55 0000 0000" />
              <small v-if="userFormErrors.phone" class="field-error">{{ userFormErrors.phone }}</small>
            </label>

            <label class="field">
              <span>Rol</span>
              <select v-model="userForm.role">
                <option v-for="role in roleSummaries" :key="role.key" :value="role.key">{{ role.name }}</option>
              </select>
              <small v-if="userFormErrors.role" class="field-error">{{ userFormErrors.role }}</small>
            </label>

            <label v-if="normalizeRoleKey(userForm.role) === 'provider'" class="field">
              <span>Proveedor vinculado</span>
              <select v-model="userForm.provider_id">
                <option value="">Selecciona proveedor</option>
                <option v-for="provider in providerCatalog" :key="provider.id" :value="provider.id">
                  {{ provider.commercial_name || provider.company_name }} · #{{ provider.id }}
                </option>
              </select>
              <small v-if="userFormErrors.provider_id" class="field-error">{{ userFormErrors.provider_id }}</small>
            </label>

            <label v-if="drawerMode === 'create'" class="field">
              <span>Password temporal</span>
              <input v-model="userForm.password" type="text" placeholder="Opcional. Si lo dejas vacio se genera uno." />
              <small v-if="userFormErrors.password" class="field-error">{{ userFormErrors.password }}</small>
            </label>

            <label class="field">
              <span>Estado</span>
              <select v-model="userForm.status">
                <option value="Activa">Activa</option>
                <option value="Operando">Operando</option>
                <option value="Disponible">Disponible</option>
                <option value="Inactiva">Inactiva</option>
                <option value="Inhabilitada">Inhabilitada</option>
                <option value="Suspendida">Suspendida</option>
              </select>
              <small v-if="userFormErrors.status" class="field-error">{{ userFormErrors.status }}</small>
            </label>

            <label class="field field-full">
              <span>Permisos especiales</span>
              <textarea
                v-model="userForm.permissions"
                rows="4"
                placeholder="Describe permisos especiales, alcance adicional o notas de aprobacion"
              ></textarea>
            </label>

            <label class="checkbox-field field-full">
              <input v-model="userForm.invitationSent" type="checkbox" />
              <span>Enviar invitacion al correo</span>
            </label>
          </div>

          <div class="overlay-actions">
            <button type="button" class="admin-btn admin-btn-ghost" :disabled="savingUser" @click="closeUserDrawer">
              Cancelar
            </button>
            <button
              type="button"
              class="admin-btn admin-btn-primary"
              :disabled="savingUser"
              :aria-busy="savingUser ? 'true' : 'false'"
              @click="submitUserForm"
            >
              {{ savingUser ? 'Guardando...' : drawerMode === 'create' ? 'Crear usuario' : 'Guardar cambios' }}
            </button>
          </div>
        </aside>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="detailOpen" class="overlay overlay-center" @click.self="closeDetailModal">
        <div class="modal-panel detail-panel">
          <div class="overlay-head">
            <div>
              <span class="mini-badge">Detalle completo</span>
              <h3>{{ selectedUserDetail?.user?.name || 'Usuario' }}</h3>
              <p>Informacion de cuenta, proveedor vinculado y datos operativos registrados.</p>
            </div>
            <button type="button" class="admin-btn admin-btn-ghost" @click="closeDetailModal">Cerrar</button>
          </div>

          <div v-if="detailLoading" class="detail-empty">
            Cargando informacion completa...
          </div>

          <div v-else class="detail-content">
            <p v-if="detailError" class="field-error">{{ detailError }}</p>

            <section class="detail-section">
              <div class="detail-section-head">
                <h4>Cuenta</h4>
                <span class="status-pill">{{ formatRoleName(selectedUserDetail?.user?.role) }}</span>
              </div>
              <p class="detail-note">
                Estado de usuario y acceso comercial no son lo mismo. "Activa" solo habilita la cuenta; la reserva
                del cliente sigue bloqueada si backend no tiene demo activa o suscripcion vigente.
              </p>
              <div class="detail-grid">
                <article v-for="row in userDetailRows(selectedUserDetail)" :key="row.label" class="detail-card">
                  <span>{{ row.label }}</span>
                  <strong>{{ row.value }}</strong>
                </article>
              </div>
              <div v-if="isClientUser(selectedUserDetail?.user)" class="detail-access-highlight">
                <span
                  class="status-pill status-pill-commercial"
                  :class="{
                    'status-pill-success': commercialAccessTone(selectedUserDetail.user) === 'success',
                    'status-pill-info': commercialAccessTone(selectedUserDetail.user) === 'info',
                    'status-pill-warn': commercialAccessTone(selectedUserDetail.user) === 'warn',
                    'status-pill-danger': commercialAccessTone(selectedUserDetail.user) === 'blocked',
                  }"
                >
                  {{ commercialLifecycleLabel(selectedUserDetail.user) }}
                </span>
                <strong>{{ commercialAccessMeta(selectedUserDetail.user) }}</strong>
              </div>
              <p
                class="detail-note"
                :class="{ 'field-error': resolveCommercialAccessState(selectedUserDetail) === 'Bloqueado' }"
              >
                Acceso comercial detectado: {{ resolveCommercialAccessState(selectedUserDetail) }}.
              </p>
              <div v-if="isClientUser(selectedUserDetail?.user)" class="inline-actions">
                <button
                  type="button"
                  class="admin-btn admin-btn-secondary"
                  @click="toggleCommercialAccess(selectedUserDetail.user)"
                >
                  {{ commercialAccessActionLabel(selectedUserDetail.user) }} comercial
                </button>
                <button
                  v-if="shouldShowPaymentReconcileAction(selectedUserDetail.user)"
                  type="button"
                  class="admin-btn admin-btn-secondary"
                  :disabled="isReconcilingPayment(selectedUserDetail.user.id)"
                  @click="reconcileAccessPayment(selectedUserDetail.user)"
                >
                  {{ isReconcilingPayment(selectedUserDetail.user.id) ? 'Validando pago...' : 'Validar pago comercial' }}
                </button>
              </div>
            </section>

            <section class="detail-section">
              <div class="detail-section-head">
                <h4>Identidad e INE</h4>
                <span class="status-pill">Expediente</span>
              </div>
              <div class="detail-grid">
                <article v-for="row in identityDetailRows(selectedUserDetail)" :key="row.label" class="detail-card">
                  <span>{{ row.label }}</span>
                  <strong>{{ row.value }}</strong>
                </article>
              </div>
              <div v-if="resolveOfficialIdentificationAccess(selectedUserDetail).viewUrl" class="detail-list">
                <article class="detail-list-row detail-list-row-document">
                  <div>
                    <strong>{{ resolveOfficialIdentificationAccess(selectedUserDetail).name }}</strong>
                    <span>
                      {{
                        resolveOfficialIdentificationAccess(selectedUserDetail).storagePath ||
                        resolveOfficialIdentificationAccess(selectedUserDetail).storageDisk ||
                        'PDF de identificación guardado'
                      }}
                    </span>
                  </div>
                  <div class="inline-actions">
                    <a
                      class="admin-btn admin-btn-secondary"
                      :href="resolveOfficialIdentificationAccess(selectedUserDetail).viewUrl"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver PDF
                    </a>
                    <a
                      class="admin-btn admin-btn-ghost"
                      :href="resolveOfficialIdentificationAccess(selectedUserDetail).downloadUrl"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Descargar
                    </a>
                  </div>
                </article>
              </div>
            </section>

            <section class="detail-section">
              <div class="detail-section-head">
                <h4>Biometria</h4>
                <span class="status-pill">Validacion</span>
              </div>
              <div v-if="resolveBiometricSelfieUrl(selectedUserDetail)" class="detail-media-preview">
                <img
                  :src="resolveBiometricSelfieUrl(selectedUserDetail)"
                  alt="Selfie biometrica del usuario"
                  class="detail-media-image"
                />
              </div>
              <div class="detail-grid">
                <article v-for="row in biometricDetailRows(selectedUserDetail)" :key="row.label" class="detail-card">
                  <span>{{ row.label }}</span>
                  <strong>{{ row.value }}</strong>
                </article>
              </div>
            </section>

            <section v-if="selectedUserDetail?.provider" class="detail-section">
              <div class="detail-section-head">
                <h4>Proveedor</h4>
                <span
                  class="status-pill"
                  :class="{ 'status-pill-warn': selectedUserDetail.provider.approval_status !== 'approved' }"
                >
                  {{ selectedUserDetail.provider.approval_status }}
                </span>
              </div>
              <div class="detail-grid">
                <article v-for="row in providerDetailRows(selectedUserDetail)" :key="row.label" class="detail-card">
                  <span>{{ row.label }}</span>
                  <strong>{{ row.value }}</strong>
                </article>
              </div>
            </section>

            <section v-if="selectedUserDetail?.provider" class="detail-section">
              <div class="detail-section-head">
                <h4>Aeronaves registradas</h4>
                <span class="status-pill">{{ selectedUserDetail.provider.aircraft.length }}</span>
              </div>
              <div v-if="selectedUserDetail.provider.aircraft.length" class="detail-list">
                <article
                  v-for="item in selectedUserDetail.provider.aircraft"
                  :key="item.id || item.registration || item.name"
                  class="detail-list-row"
                >
                  <strong>{{ item.name || item.model || item.registration || 'Aeronave' }}</strong>
                  <span>{{ item.registration || item.tail_number || 'Sin matricula' }} &middot; {{ item.status || 'Sin estado' }}</span>
                </article>
              </div>
              <p v-else class="detail-empty">Este proveedor aun no tiene aeronaves registradas.</p>
            </section>

            <section v-if="selectedUserDetail?.provider" class="detail-section">
              <div class="detail-section-head">
                <h4>Documentos</h4>
                <span class="status-pill">{{ selectedUserDetail.provider.documents.length }}</span>
              </div>
              <div v-if="selectedUserDetail.provider.documents.length" class="detail-list">
                <article
                  v-for="item in selectedUserDetail.provider.documents"
                  :key="item.id || item.name || item.document_name"
                  class="detail-list-row"
                >
                  <strong>{{ item.document_name || item.name || item.type || 'Documento' }}</strong>
                  <span>{{ item.status || item.review_status || 'Sin estado' }}</span>
                </article>
              </div>
              <p v-else class="detail-empty">No hay documentos visibles para este proveedor.</p>
            </section>
          </div>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="roleModalOpen" class="overlay overlay-center" @click.self="closeRoleModal">
        <div class="modal-panel">
          <div class="overlay-head">
            <div>
              <span class="mini-badge">{{ roleModalMode === 'create' ? 'Nuevo rol' : 'Editar rol' }}</span>
              <h3>{{ roleModalMode === 'create' ? 'Crear rol' : 'Actualizar permisos' }}</h3>
              <p>Define nombre, descripcion y permisos sin mezclarlo con el directorio de usuarios.</p>
            </div>
            <button type="button" class="admin-btn admin-btn-ghost" @click="closeRoleModal">Cerrar</button>
          </div>

          <div class="form-grid compact-form">
            <label class="field">
              <span>Nombre del rol</span>
              <input v-model="roleForm.name" type="text" placeholder="Nombre del rol" />
            </label>

            <label class="field">
              <span>Scope del rol</span>
              <input v-model="roleForm.scope" type="text" placeholder="Cobertura o frente principal" />
            </label>

            <label class="field field-full">
              <span>Descripcion</span>
              <textarea v-model="roleForm.description" rows="3" placeholder="Resumen ejecutivo del rol"></textarea>
            </label>

            <label class="field field-full">
              <span>Permisos</span>
              <textarea
                v-model="roleForm.permissions"
                rows="4"
                placeholder="Usuarios, Reservas, Pagos, Incidencias"
              ></textarea>
            </label>
          </div>

          <div class="overlay-actions">
            <button type="button" class="admin-btn admin-btn-ghost" @click="closeRoleModal">Cancelar</button>
            <button type="button" class="admin-btn admin-btn-primary" @click="submitRoleForm">
              {{ roleModalMode === 'create' ? 'Crear rol' : 'Guardar rol' }}
            </button>
          </div>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="paymentDetailOpen" class="overlay overlay-center" @click.self="closePaymentDetailModal">
        <div class="modal-panel detail-panel">
          <div class="overlay-head">
            <div>
              <span class="mini-badge">Pago comercial</span>
              <h3>{{ selectedPaymentDetail?.user?.name || 'Cliente' }}</h3>
              <p>Detalle del pago actual de acceso comercial registrado en backend.</p>
            </div>
            <button type="button" class="admin-btn admin-btn-ghost" @click="closePaymentDetailModal">Cerrar</button>
          </div>

          <div class="detail-content">
            <section class="detail-section">
              <div class="detail-section-head">
                <h4>Pago</h4>
                <span
                  class="status-pill status-pill-commercial"
                  :class="{
                    'status-pill-success': paymentStatusTone(selectedPaymentDetail?.user) === 'success',
                    'status-pill-warn': paymentStatusTone(selectedPaymentDetail?.user) === 'warn',
                    'status-pill-info': paymentStatusTone(selectedPaymentDetail?.user) === 'info',
                  }"
                >
                  {{ paymentStatusLabel(selectedPaymentDetail?.user) }}
                </span>
              </div>
              <div class="detail-grid">
                <article v-for="row in paymentDetailRows(selectedPaymentDetail)" :key="row.label" class="detail-card">
                  <span>{{ row.label }}</span>
                  <strong>{{ row.value }}</strong>
                </article>
              </div>
            </section>
          </div>
        </div>
      </div>
    </transition>

  </div>
</template>

<style scoped>
.admin-users-page {
  min-height: 100vh;
  background: #ffffff;
  color: #111111;
}

.dashboard-hero,
.editorial-section {
  padding: 1.5rem clamp(1.25rem, 5vw, 4.5rem);
}

.dashboard-hero {
  display: grid;
  min-height: auto;
  padding-top: 1rem;
  background:
    radial-gradient(circle at top right, rgba(201, 164, 90, 0.12), transparent 18%),
    linear-gradient(180deg, #ffffff 0%, #faf8f2 100%);
}

.hero-center {
  display: grid;
  align-content: start;
  gap: 1rem;
}

.hero-compact {
  max-width: 980px;
  justify-items: start;
  text-align: left;
}

.dark-eyebrow {
  color: #8c6a1f;
}

.hero-center h1,
.section-heading h2,
.signal-card,
.featured-card,
.workstream-card h3,
.overlay-head h3 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.05em;
}

.hero-center h1 {
  max-width: none;
  font-size: clamp(2.2rem, 5vw, 3.4rem);
  line-height: 0.98;
}

.hero-subtitle,
.section-heading p,
.featured-card p,
.signal-card p,
.workstream-copy,
.overlay-head p,
.field span,
.field-error,
.cell-stack small,
.meta-row small {
  margin: 0;
  color: #5d5d5d;
  line-height: 1.7;
}

.hero-actions,
.inline-actions,
.overlay-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: flex-start;
}

.panel-switch {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.4rem;
  border: 1px solid #eadfbe;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
}

.panel-switch-btn {
  appearance: none;
  min-height: 2.65rem;
  padding: 0 1rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #6b7280;
  font: inherit;
  font-weight: 800;
}

.panel-switch-btn-active {
  color: #111827;
  background: #f3ead2;
}

.admin-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 3rem;
  padding: 0 1.05rem;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 0.95rem;
  font-weight: 800;
  white-space: nowrap;
  transition:
    transform 0.16s ease,
    box-shadow 0.16s ease,
    border-color 0.16s ease,
    background 0.16s ease,
    color 0.16s ease;
}

.admin-btn:hover,
.admin-mini-btn:hover,
.admin-text-btn:hover {
  transform: translateY(-2px);
}

.admin-btn:disabled,
.admin-mini-btn:disabled,
.admin-text-btn:disabled {
  cursor: wait;
  opacity: 0.72;
  transform: none;
}

.admin-btn-primary {
  color: #101318;
  background: linear-gradient(135deg, #f2d88d, #bf8f2e);
  box-shadow: 0 18px 44px rgba(216, 180, 91, 0.22);
}

.admin-btn-secondary {
  color: #8c6a1f;
  background: #f7efdb;
  border-color: #ead9ab;
}

.admin-btn-ghost {
  color: #1f2937;
  background: #ffffff;
  border-color: #d8dedc;
}

.status-strip {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 1rem;
  padding: 0 clamp(1.25rem, 5vw, 4.5rem) 1.2rem;
  margin-top: -1.2rem;
}

.editorial-section-clients ~ * {
  --client-scope-active: 1;
}

.signal-card,
.featured-card,
.workstream-card,
.table-shell,
.filters-panel {
  border: 1px solid #ebebeb;
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.05);
}

.signal-card {
  display: grid;
  gap: 0.4rem;
  padding: 1rem 1.05rem;
}

.admin-users-page:has(.editorial-section-clients) .status-strip {
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.75rem;
  padding-bottom: 0.85rem;
}

.admin-users-page:has(.editorial-section-clients) .signal-card {
  gap: 0.22rem;
  padding: 0.8rem 0.9rem;
  border-radius: 16px;
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.04);
}

.admin-users-page:has(.editorial-section-clients) .signal-card strong {
  font-size: 1.12rem;
}

.admin-users-page:has(.editorial-section-clients) .signal-card p {
  font-size: 0.76rem;
  line-height: 1.4;
}

.signal-card-success {
  background: linear-gradient(180deg, #ffffff 0%, #f1faf5 100%);
}

.signal-card-info {
  background: linear-gradient(180deg, #ffffff 0%, #f3f7fc 100%);
}

.signal-card-accent {
  background: linear-gradient(180deg, #ffffff 0%, #fbf6ea 100%);
}

.signal-card-danger {
  background: linear-gradient(180deg, #ffffff 0%, #fff6f5 100%);
}

.signal-card span,
.workstream-label {
  color: #666666;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.signal-card strong {
  font-size: 1.5rem;
  line-height: 1;
}

.filters-panel {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) repeat(3, minmax(180px, 0.6fr));
  gap: 1rem;
  margin: 0 clamp(1.25rem, 5vw, 4.5rem);
  padding: 1rem;
}

.section-heading {
  display: grid;
  gap: 0.5rem;
  max-width: 760px;
}

.split-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  max-width: none;
}

.split-heading > :first-child {
  max-width: 760px;
}

.section-heading h2 {
  font-size: clamp(2rem, 4vw, 3rem);
  line-height: 1.02;
}

.editorial-section {
  display: grid;
  gap: 1.5rem;
}

.workstreams-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}

.roles-layout {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.featured-card {
  display: grid;
  gap: 0.85rem;
  padding: 1rem;
}

.workstream-card {
  display: grid;
  gap: 0.7rem;
  padding: 1rem;
  background: #fafafa;
}

.role-stream-card h3 {
  font-size: 1.2rem;
  line-height: 1.05;
}

.stream-meta {
  color: #8c6a1f;
}

.role-scope {
  color: #8c6a1f;
  font-size: 0.85rem;
  font-weight: 700;
}

.admin-text-btn,
.admin-mini-btn {
  appearance: none;
  border: 0;
  background: transparent;
  font-weight: 800;
  color: #111827;
}

.admin-text-btn {
  padding: 0;
}

.profile-topline {
  display: flex;
  align-items: center;
  justify-content: start;
  gap: 0.8rem;
}

.avatar-badge,
.avatar-mini {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-weight: 700;
  color: #8c6a1f;
  background: #f3ead2;
}

.avatar-badge {
  width: 3rem;
  height: 3rem;
  flex: 0 0 3rem;
}

.avatar-mini {
  width: 2.4rem;
  height: 2.4rem;
  flex: 0 0 2.4rem;
  font-size: 0.8rem;
}

.role-chip,
.meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.role-chip,
.status-pill {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  min-height: 2rem;
  padding: 0 0.75rem;
  border-radius: 999px;
}

.status-pill {
  font-size: 0.74rem;
  font-weight: 800;
  color: #0f7b53;
  background: #dceee5;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.status-pill-warn {
  color: #a34b19;
  background: #f8e5d7;
}

.status-pill-danger {
  color: #b42318;
  background: #fee4e2;
}

.status-pill-success {
  color: #0f7b53;
  background: #dceee5;
}

.status-pill-info {
  color: #1d4ed8;
  background: #dbeafe;
}

.status-pill-commercial {
  text-transform: none;
  letter-spacing: 0.01em;
}

.status-pill-compact {
  min-height: 1.55rem;
  padding: 0 0.52rem;
  font-size: 0.65rem;
  line-height: 1;
}

.status-pill-neutral {
  color: #5f6b7e;
  background: #eef3fb;
}

.role-chip {
  color: #8c6a1f;
  background: #f3ead2;
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.table-shell {
  overflow: visible;
  margin-top: 0;
  border: 1px solid #ece3cf;
  border-radius: 30px;
  background:
    radial-gradient(circle at top right, rgba(213, 170, 70, 0.12), transparent 28%),
    linear-gradient(180deg, #fffdfa 0%, #ffffff 100%);
  box-shadow: 0 28px 60px rgba(30, 24, 15, 0.08);
}

.table-shell-clients {
  padding: 1rem;
}

.table-shell-clients-compact {
  display: grid;
  gap: 0.9rem;
  padding: 0.9rem;
}

.client-table-toolbar,
.clients-pagination,
.clients-pagination__actions,
.client-mobile-card__top,
.client-mobile-card__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  flex-wrap: wrap;
}

.client-table-toolbar__meta,
.client-table-toolbar__page-size {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
}

.client-table-toolbar__meta strong {
  color: #162b47;
  font-size: 1rem;
}

.client-table-toolbar__meta span,
.client-table-toolbar__page-size span,
.clients-pagination__summary,
.clients-pagination__page {
  color: #6480ad;
  font-size: 0.82rem;
  font-weight: 700;
}

.client-table-toolbar__page-size select {
  min-height: 2.2rem;
  padding: 0 0.7rem;
  border: 1px solid #d8dedc;
  border-radius: 12px;
  background: #fff;
  color: #162b47;
  font: inherit;
  font-size: 0.84rem;
  font-weight: 700;
}

.clients-table-desktop {
  display: block;
}

.clients-table-scroll {
  max-height: 65vh;
  overflow: auto;
  border: 1px solid #ece3cf;
  border-radius: 20px;
  background: #fff;
}

.clients-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
}

.clients-table thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 0.78rem 0.9rem;
  border-bottom: 1px solid #e9e2d3;
  background: linear-gradient(180deg, #fffaf0 0%, #fffdf9 100%);
  color: #6b7280;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-align: left;
  text-transform: uppercase;
}

.clients-table tbody td {
  height: 64px;
  padding: 0.55rem 0.9rem;
  border-bottom: 1px solid #f0ebe0;
  vertical-align: middle;
  color: #1f2937;
  font-size: 0.88rem;
}

.clients-table tbody tr:hover td {
  background: rgba(248, 244, 234, 0.42);
}

.empty-table-cell {
  padding: 1.15rem;
  color: #8a8f98;
  text-align: center;
}

.clients-mobile-list {
  display: none;
  gap: 0.7rem;
}

.client-mobile-card {
  display: grid;
  gap: 0.55rem;
  max-height: 120px;
  padding: 0.85rem;
  overflow: hidden;
  border: 1px solid #efe5d3;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 10px 24px rgba(43, 33, 17, 0.04);
}

.table-row {
  display: grid;
  grid-template-columns: 1.1fr 1fr 0.9fr 0.7fr 0.7fr 1fr 1.2fr;
  gap: 1rem;
  align-items: center;
  padding: 1rem 1.1rem;
  border-top: 1px solid #ebebeb;
  background: #ffffff;
}

.table-head-row {
  border-top: 0;
  background: #fafafa;
  color: #6b7280;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.table-head-row-clients {
  padding: 0.85rem 1rem 1.1rem;
  border: 0;
  border-radius: 22px;
  background: linear-gradient(180deg, #fffaf0 0%, #fffdf9 100%);
  box-shadow: inset 0 0 0 1px rgba(214, 192, 141, 0.3);
}

.table-row-client-card {
  margin-top: 0.9rem;
  padding: 1.35rem 1.4rem;
  border: 1px solid #efe5d3;
  border-radius: 26px;
  background:
    linear-gradient(90deg, rgba(248, 244, 234, 0.8) 0%, rgba(255, 255, 255, 0) 26%),
    #ffffff;
  box-shadow: 0 16px 34px rgba(43, 33, 17, 0.05);
}

.table-row-client-card:hover {
  border-color: #e6d4ab;
  box-shadow: 0 22px 42px rgba(43, 33, 17, 0.08);
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.user-cell-compact {
  gap: 0.55rem;
}

.cell-stack {
  display: grid;
  gap: 0.15rem;
}

.user-name {
  font-size: 0.98rem;
  line-height: 1.08;
  letter-spacing: -0.03em;
}

.client-inline-badge {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  min-height: 1.3rem;
  padding: 0 0.45rem;
  border-radius: 999px;
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.03em;
}

.client-inline-badge--success {
  color: #0f7b53;
  background: #dceee5;
}

.client-inline-badge--warn {
  color: #a34b19;
  background: #f8e5d7;
}

.client-inline-badge--info {
  color: #1d4ed8;
  background: #dbeafe;
}

.client-inline-badge--danger {
  color: #b42318;
  background: #fee4e2;
}

.email-cell {
  min-width: 0;
  overflow-wrap: anywhere;
  font-weight: 600;
  color: #111827;
}

.password-cell {
  min-width: 0;
  overflow-wrap: anywhere;
  font-family: 'SFMono-Regular', 'SF Mono', Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 0.84rem;
  color: #4b5563;
}

.row-actions {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  justify-content: flex-start;
}

.row-actions-compact {
  justify-content: flex-end;
}

.table-muted {
  color: #8a8f98;
  font-size: 0.88rem;
}

.commercial-access-cell {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
}

.commercial-column {
  display: flex;
  align-items: center;
}

.commercial-stack {
  display: grid;
  gap: 0.12rem;
}

.commercial-stack-panel {
  min-width: 0;
  width: 100%;
  padding: 0.95rem 1rem;
  border: 1px solid #ece5d7;
  border-radius: 20px;
  background: linear-gradient(180deg, #fffcf7 0%, #ffffff 100%);
}

.commercial-stack-panel-payment {
  background: linear-gradient(180deg, #f9fdfb 0%, #ffffff 100%);
}

.commercial-kpi {
  color: #111827;
  font-size: 1.45rem;
  line-height: 1;
  letter-spacing: -0.05em;
}

.commercial-kpi--payment {
  font-size: 0.98rem;
}

.commercial-caption {
  color: #6b7280;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.commercial-access-meta {
  display: block;
  color: #6b7280;
  font-size: 0.78rem;
  line-height: 1.4;
}

.admin-mini-btn {
  appearance: none;
  min-height: 2.25rem;
  padding: 0 0.95rem;
  border: 1px solid #d9dde2;
  border-radius: 14px;
  color: #2d3748;
  background: #ffffff;
  box-shadow: 0 10px 18px rgba(17, 24, 39, 0.04);
  transition:
    transform 0.16s ease,
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    background 0.16s ease;
}

.admin-mini-btn:hover {
  transform: translateY(-1px);
  border-color: #d3b773;
  background: #fffdf8;
  box-shadow: 0 14px 24px rgba(17, 24, 39, 0.08);
}

.commercial-access-btn {
  border-color: #f2c8c2;
  color: #b42318;
  background: #fff4f2;
}

.admin-actions-trigger {
  min-width: 7.5rem;
  justify-content: center;
  font-weight: 800;
}

.admin-actions-trigger-icon {
  min-width: 2.2rem;
  min-height: 2.2rem;
  padding: 0;
  border-radius: 999px;
  font-size: 0.95rem;
  line-height: 1;
}

.pager-button {
  appearance: none;
  min-height: 2.35rem;
  padding: 0 0.9rem;
  border: 1px solid #d8dedc;
  border-radius: 999px;
  background: #fff;
  color: #1f2937;
  font-size: 0.86rem;
  font-weight: 800;
  transition:
    transform 0.16s ease,
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    background 0.16s ease;
}

.pager-button:hover {
  transform: translateY(-1px);
  border-color: #d3b773;
  background: #fffdf8;
  box-shadow: 0 10px 18px rgba(17, 24, 39, 0.06);
}

.pager-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}

.field,
.checkbox-field {
  display: grid;
  gap: 0.45rem;
}

.field input,
.field select,
.field textarea {
  appearance: none;
  width: 100%;
  min-height: 3rem;
  padding: 0.85rem 0.95rem;
  border: 1px solid #d8dedc;
  border-radius: 18px;
  background: #fbfcfb;
  color: #111111;
  font: inherit;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    background 0.16s ease;
}

.field input:focus,
.field select:focus,
.field textarea:focus {
  outline: none;
  border-color: rgba(191, 143, 46, 0.55);
  background: #ffffff;
  box-shadow: 0 0 0 4px rgba(191, 143, 46, 0.12);
}

.field textarea {
  min-height: 7rem;
  resize: vertical;
}

.field-error {
  color: #b42318;
  line-height: 1.45;
}

.search-field input {
  min-height: 3.2rem;
}

.overlay {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  justify-content: flex-end;
  background: rgba(15, 23, 42, 0.36);
  backdrop-filter: blur(6px);
}

.overlay-center {
  justify-content: center;
  align-items: center;
  padding: 1.5rem;
}

.drawer-panel,
.modal-panel {
  width: min(100%, 560px);
  padding: 1.35rem;
  border: 1px solid #ebebeb;
  background: #ffffff;
  box-shadow: 0 22px 52px rgba(18, 26, 33, 0.16);
}

.drawer-panel {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  max-height: 100vh;
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 1.5rem;
}

.modal-panel {
  border-radius: 28px;
  max-height: min(92vh, 900px);
  overflow-y: auto;
}

.detail-panel {
  width: min(100%, 860px);
}

.detail-content,
.detail-section,
.detail-list {
  display: grid;
  gap: 1rem;
}

.detail-section {
  padding: 1rem;
  border: 1px solid #ebebeb;
  border-radius: 18px;
  background: #fbfcfb;
}

.detail-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.detail-section-head h4 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  font-size: 1.1rem;
  letter-spacing: -0.03em;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.detail-media-preview {
  display: flex;
  justify-content: flex-start;
}

.detail-media-image {
  width: min(100%, 320px);
  max-height: 320px;
  object-fit: cover;
  border: 1px solid #ece7da;
  border-radius: 18px;
  background: #ffffff;
}

.detail-card,
.detail-list-row {
  display: grid;
  gap: 0.25rem;
  padding: 0.85rem;
  border: 1px solid #ece7da;
  border-radius: 14px;
  background: #ffffff;
}

.detail-card span,
.detail-list-row span,
.detail-empty {
  color: #6b7280;
  font-size: 0.9rem;
}

.detail-card strong,
.detail-list-row strong {
  min-width: 0;
  overflow-wrap: anywhere;
  color: #111827;
}

.detail-empty {
  margin: 0;
  padding: 0.8rem 0;
}

.detail-note {
  margin: 0;
  color: #6b7280;
  font-size: 0.9rem;
  line-height: 1.5;
}

.detail-access-highlight {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1rem;
  padding: 0.9rem 1rem;
  border: 1px solid #ece7da;
  border-radius: 16px;
  background: linear-gradient(180deg, #ffffff 0%, #faf8f2 100%);
}

.overlay-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.1rem;
}

.mini-action-modal {
  width: 220px;
  display: grid;
  gap: 0.45rem;
  padding: 0.75rem;
  border: 1px solid #ebebeb;
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 18px 40px rgba(18, 26, 33, 0.14);
}

.mini-action-popover {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  z-index: 12;
  transform: none;
}

.mini-action-item,
.mini-action-close {
  appearance: none;
  min-height: 2.7rem;
  padding: 0 0.9rem;
  border: 1px solid #ebebeb;
  border-radius: 12px;
  background: #ffffff;
  text-align: left;
  font-weight: 700;
  transition:
    transform 0.16s ease,
    border-color 0.16s ease,
    background 0.16s ease;
}

.mini-action-item:hover,
.mini-action-close:hover {
  transform: translateY(-1px);
  background: #faf8f2;
  border-color: #ead9ab;
}

.mini-action-close {
  color: #8b5e22;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  padding-bottom: 1rem;
}

.compact-form {
  grid-template-columns: 1fr;
}

.field-full {
  grid-column: 1 / -1;
}

.checkbox-field {
  grid-auto-flow: column;
  align-items: center;
  justify-content: start;
}

.overlay-actions {
  justify-content: flex-end;
  margin-top: 1.25rem;
  position: sticky;
  bottom: 0;
  padding-top: 1rem;
  padding-bottom: 0.25rem;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0) 0%, #ffffff 22%);
  z-index: 2;
}

.empty-card,
.empty-row {
  grid-column: 1 / -1;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 1220px) {
  .status-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 920px) {
  .filters-panel,
  .roles-layout,
  .workstreams-grid,
  .form-grid,
  .detail-grid,
  .table-row {
    grid-template-columns: 1fr;
  }

  .status-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .clients-table-desktop {
    display: none;
  }

  .clients-mobile-list {
    display: grid;
  }

  .clients-pagination,
  .client-table-toolbar {
    align-items: stretch;
  }

  .mini-action-popover {
    top: calc(100% + 0.5rem);
    right: 0;
    transform: none;
  }

  .mini-action-popover-mobile {
    position: static;
    width: 100%;
  }

  .split-heading {
    display: grid;
    align-items: start;
  }
}

@media (max-width: 720px) {
  .status-strip {
    grid-template-columns: 1fr;
  }

  .hero-center {
    justify-items: stretch;
    text-align: left;
  }

  .hero-center h1 {
    max-width: none;
  }

  .hero-actions,
  .inline-actions,
  .row-actions,
  .overlay-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .drawer-panel,
  .modal-panel {
    width: 100%;
  }

  .admin-btn {
    width: 100%;
  }

  .clients-pagination__actions,
  .client-mobile-card__meta {
    justify-content: flex-start;
  }
}
</style>
