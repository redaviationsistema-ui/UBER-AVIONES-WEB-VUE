<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { pickCollection, requestWithCandidates } from '../../lib/backendCrud'
import { resolveMediaUrl } from '../../lib/api'
import { resolveProviderIdForUser } from '../../lib/providerContext'
import { useUiStore } from '../../stores/ui'

const props = defineProps({
  users: { type: Array, required: true },
})

const emit = defineEmits(['audit-user'])
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
const userFormErrors = ref({})
const savingUser = ref(false)
const ADMIN_USERS_TIMEOUT_MS = 45000

const userForm = ref(buildEmptyUser())
const roleForm = ref(buildEmptyRole())

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
  void loadRolesFromBackend()
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
})

const roleSummaries = computed(() =>
  localRoles.value.map((role) => ({
    ...role,
    users: localUsers.value.filter((user) => normalizeRoleKey(user.role) === role.key).length,
  })),
)

const filteredUsers = computed(() =>
  localUsers.value.filter((user) => {
    const matchesSearch =
      !searchTerm.value ||
      [user.name, user.email, user.role, user.status, user.phone].some((field) =>
        String(field || '').toLowerCase().includes(searchTerm.value.toLowerCase()),
      )
    const matchesStatus =
      statusFilter.value === 'todos' || normalizeStatusKey(user.status) === statusFilter.value
    const matchesRole = roleFilter.value === 'todos' || normalizeRoleKey(user.role) === roleFilter.value
    const matchesCommercialAccess =
      commercialAccessFilter.value === 'todos' ||
      (commercialAccessFilter.value === 'no-aplica' && !isClientUser(user)) ||
      (isClientUser(user) &&
        ((commercialAccessFilter.value === 'habilitado' && commercialAccessTone(user) === 'success') ||
          (commercialAccessFilter.value === 'bloqueado' && commercialAccessTone(user) === 'blocked')))

    return matchesSearch && matchesStatus && matchesRole && matchesCommercialAccess
  }),
)

const userSignals = computed(() => {
  const total = localUsers.value.length
  const active = localUsers.value.filter((user) => isActiveStatus(user.status)).length
  const admins = localUsers.value.filter((user) => normalizeRoleKey(user.role) === 'admin').length
  const clients = localUsers.value.filter((user) => normalizeRoleKey(user.role) === 'client').length
  const suspended = localUsers.value.filter((user) => normalizeStatusKey(user.status) === 'suspendido').length

  return [
    { label: 'Total usuarios', value: String(total), detail: 'Base visible en el panel.', tone: 'neutral' },
    { label: 'Activos', value: String(active), detail: 'Perfiles operativos habilitados.', tone: 'success' },
    { label: 'Administradores', value: String(admins), detail: 'Control ejecutivo o total.', tone: 'accent' },
    { label: 'Clientes', value: String(clients), detail: 'Perfiles comerciales y corporativos.', tone: 'info' },
    { label: 'Suspendidos', value: String(suspended), detail: 'Cuentas en pausa o revision.', tone: 'danger' },
  ]
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
  const demo = user.demo || access.demo || null
  const subscription =
    user.active_suscripcion ||
    user.activeSuscripcion ||
    user.subscription ||
    access.subscription ||
    null

  return {
    id: user.id ?? Date.now() + index,
    name: user.name || user.full_name || '',
    email: user.email || '',
    phone: user.phone || user.phone_number || '',
    role: normalizeRoleKey(primaryRole || 'client'),
    provider_id: user.provider_id || user.proveedor_id || provider?.id || resolveProviderIdForUser(user) || '',
    provider: provider ? normalizeProviderRecord(provider) : null,
    profile: user.profile || null,
    access,
    demo,
    subscription,
    raw: user,
    status: user.status || user.account_status || 'Activa',
    permissions:
      Array.isArray(user.permissions) && user.permissions.length
        ? user.permissions.join(', ')
        : user.permissions || 'Sin permisos especiales',
    invitationSent: user.invitationSent ?? user.invitation_sent ?? true,
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
    { label: 'Tipo de documento', paths: ['user.profile.document_type'] },
    { label: 'Numero de documento', paths: ['user.profile.document_number'] },
    { label: 'Vigencia', paths: ['user.profile.document_expiration'] },
    { label: 'Nacionalidad', paths: ['user.profile.nationality'] },
    { label: 'CURP', paths: ['user.profile.ine_curp'] },
    { label: 'CIC', paths: ['user.profile.ine_cic'] },
    { label: 'OCR', paths: ['user.profile.ine_ocr'] },
    { label: 'Estado de escaneo', paths: ['user.profile.ine_scan_status'] },
    { label: 'Validacion requerida', paths: ['user.profile.identity_validation_required'] },
    { label: 'INE frente', paths: ['user.profile.ine_front_path'] },
    { label: 'INE reverso', paths: ['user.profile.ine_back_path'] },
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
  return resolveCommercialAccessForUser(user) === 'Habilitado' ? 'success' : 'blocked'
}

function commercialAccessLabel(user = {}) {
  if (!isClientUser(user)) return 'Acceso no aplica'
  return resolveCommercialAccessForUser(user) === 'Habilitado'
    ? 'Acceso comercial habilitado'
    : 'Acceso comercial bloqueado'
}

function shouldShowCommercialAccessAction(user = {}) {
  return isClientUser(user)
}

function commercialAccessActionLabel(user = {}) {
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

function userInitials(name) {
  return String(name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase())
    .join('')
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

    await Promise.all([loadUsersFromBackend(), loadRolesFromBackend(), loadProvidersFromBackend()])
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

    await loadUsersFromBackend()
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

    await loadUsersFromBackend()

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

    await loadUsersFromBackend()

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

    await Promise.all([loadUsersFromBackend(), loadRolesFromBackend()])
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
    await Promise.all([loadUsersFromBackend(), loadRolesFromBackend()])
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
        <h1>Usuarios y roles</h1>
        <p class="hero-subtitle">
          Administra accesos, permisos y perfiles del equipo desde una operacion mas clara y rapida.
        </p>
        <div class="hero-actions">
          <button type="button" class="admin-btn admin-btn-primary" @click="openCreateUser">+ Nuevo usuario</button>
          <button type="button" class="admin-btn admin-btn-secondary" @click="openCreateRole">Sincronizar roles</button>
          <button type="button" class="admin-btn admin-btn-ghost" @click="exportUsers">Exportar</button>
          <button type="button" class="admin-btn admin-btn-ghost" @click="toggleFilters">
            {{ filtersOpen ? 'Ocultar filtros' : 'Filtros' }}
          </button>
        </div>
        <div class="panel-switch" role="tablist" aria-label="Vista de usuarios y roles">
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
        <select v-model="roleFilter">
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

    <section v-else class="editorial-section">
      <div class="section-heading split-heading">
        <div>
          <h2>Directorio de usuarios</h2>
          <p>{{ filteredUsers.length }} registros listos para consulta, edicion, suspension y cambio de rol.</p>
        </div>
        <div class="hero-actions">
          <button type="button" class="admin-btn admin-btn-primary" @click="openCreateUser">+ Nuevo usuario</button>
          <button type="button" class="admin-btn admin-btn-secondary" @click="openRolesPanel">Ver roles</button>
        </div>
      </div>

      <div class="table-shell">
        <div class="table-row table-head-row">
          <span>Usuario</span>
          <span>Correo</span>
          <span>Rol</span>
          <span>Estado</span>
          <span>Acceso comercial</span>
          <span>Acciones</span>
        </div>

        <div v-for="user in filteredUsers" :key="user.id" class="table-row">
          <div class="user-cell">
            <div class="avatar-mini">{{ userInitials(user.name) }}</div>
            <div class="cell-stack">
              <strong>{{ user.name }}</strong>
              <small>{{ user.phone || 'Sin telefono' }}</small>
            </div>
          </div>

          <span>{{ user.email }}</span>
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
                  'status-pill-danger': commercialAccessTone(user) === 'blocked',
                }"
              >
                {{ commercialAccessLabel(user) }}
              </span>
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
            <button
              type="button"
              class="admin-mini-btn admin-actions-trigger"
              @click.stop="openActionsModal(user)"
            >
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
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 1rem;
  padding: 0 clamp(1.25rem, 5vw, 4.5rem) 1.2rem;
  margin-top: -1.2rem;
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

.status-pill-commercial {
  text-transform: none;
  letter-spacing: 0.01em;
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
}

.table-row {
  display: grid;
  grid-template-columns: 1.1fr 1fr 0.7fr 0.7fr 1fr 1.2fr;
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

.user-cell {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.cell-stack {
  display: grid;
  gap: 0.15rem;
}

.row-actions {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  justify-content: flex-start;
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

.admin-mini-btn {
  appearance: none;
  min-height: 2rem;
  padding: 0 0.75rem;
  border: 1px solid #d9dde2;
  border-radius: 10px;
  color: #2d3748;
  background: #ffffff;
}

.commercial-access-btn {
  border-color: #f2c8c2;
  color: #b42318;
  background: #fff4f2;
}

.admin-actions-trigger {
  min-width: 7.5rem;
  justify-content: center;
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
  top: 50%;
  right: calc(100% + 0.65rem);
  z-index: 12;
  transform: translateY(-50%);
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

  .mini-action-popover {
    top: calc(100% + 0.5rem);
    right: 0;
    transform: none;
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
}
</style>
