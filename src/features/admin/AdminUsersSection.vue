<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { pickCollection, requestWithCandidates } from '../../lib/backendCrud'
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
    name: 'Provider',
    description: 'Gestiona flota, disponibilidad, documentos y cumplimiento operativo.',
    permissions: ['Flota', 'Disponibilidad', 'Documentos', 'Asignaciones'],
    scope: 'Red operativa y capacidad',
  },
  {
    key: 'client',
    name: 'Client',
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
  Promise.allSettled([loadUsersFromBackend(), loadRolesFromBackend(), loadProvidersFromBackend()])
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

    return matchesSearch && matchesStatus && matchesRole
  }),
)

const featuredUsers = computed(() => filteredUsers.value.slice(0, 4))

const usersByRole = computed(() =>
  roleSummaries.value.map((role) => ({
    ...role,
    usersList: filteredUsers.value.filter((user) => normalizeRoleKey(user.role) === role.key),
  })),
)

const userSignals = computed(() => {
  const total = localUsers.value.length
  const active = localUsers.value.filter((user) => isActiveStatus(user.status)).length
  const admins = localUsers.value.filter((user) => normalizeRoleKey(user.role) === 'admin').length
  const clients = localUsers.value.filter((user) => normalizeRoleKey(user.role) === 'client').length
  const suspended = localUsers.value.filter((user) => normalizeStatusKey(user.status) === 'suspendido').length

  return [
    { label: 'Usuarios registrados', value: String(total), detail: 'Base total visible en el panel.' },
    { label: 'Activos', value: String(active), detail: 'Perfiles con acceso operativo habilitado.' },
    { label: 'Admins', value: String(admins), detail: 'Usuarios con control ejecutivo o total.' },
    { label: 'Clientes', value: String(clients), detail: 'Perfiles comerciales y corporativos.' },
    { label: 'Suspendidos', value: String(suspended), detail: 'Cuentas en pausa o bajo observacion.' },
  ]
})

const governanceNotes = computed(() => [
  {
    title: 'CRUD principal en directorio',
    text: 'Altas, edicion, cambio de rol y suspension viven donde esta la base completa de usuarios.',
  },
  {
    title: 'Roles en capa separada',
    text: 'La administracion de permisos no se mezcla con tarjetas de perfil ni lectura ejecutiva.',
  },
  {
    title: 'Destacados solo para acceso rapido',
    text: 'Las tarjetas se reservan para revisar y auditar, no para concentrar toda la operacion.',
  },
])

const recentActivity = computed(() =>
  localUsers.value.slice(0, 4).map((user, index) => ({
    id: user.id,
    title:
      index % 2 === 0
        ? `Revision de acceso para ${user.name}`
        : `Perfil actualizado en ${user.role}`,
    detail:
      index % 2 === 0
        ? `Se reviso estado ${user.status.toLowerCase()} y permisos especiales.`
        : `Ultimo movimiento registrado en ${user.lastAudit}.`,
  })),
)

const accessCoverage = computed(() => [
  { label: 'Roles activos', value: String(localRoles.value.length) },
  { label: 'Permisos auditables', value: String(roleSummaries.value.reduce((acc, role) => acc + role.permissions.length, 0)) },
  { label: 'Usuarios filtrados', value: String(filteredUsers.value.length) },
  { label: 'Invitaciones listas', value: String(localUsers.value.filter((user) => user.invitationSent).length) },
])

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
  const name = role.display_name || role.name || role.label || 'Nuevo rol'
  return {
    key: normalizeRoleKey(role.key || role.slug || role.code || name),
    name,
    description: role.description || 'Permisos personalizados del modulo.',
    permissions: normalizePermissions(role.permissions),
    scope: role.scope || role.coverage || 'Cobertura personalizada',
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

function resolveCommercialAccessState(detail = {}) {
  const user = detail?.user || {}
  const access = user.access || user.raw?.access || {}
  const subscriptionStatus = String(
    user.subscription?.status ||
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

  if (['active', 'activa', 'vigente', 'approved', 'trial_active', 'demo_active'].includes(subscriptionStatus)) {
    return 'Habilitado'
  }

  if (['true', '1', 'yes', 'si'].includes(demoStatus)) {
    return 'Habilitado'
  }

  return 'Bloqueado'
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
    let detailedUser = user
    let detailedProvider = user.provider

    const userResult = await requestWithCandidates([
      { method: 'get', path: `/admin/usuarios/${user.id}` },
    ]).catch(() => null)

    if (userResult) {
      detailedUser = normalizeUserRecord(pickRecord(userResult, ['user', 'usuario']), 0)
    }

    const providerId = user.provider_id || detailedUser.provider_id || detailedUser.provider?.id
    if (normalizeRoleKey(detailedUser.role) === 'provider' && providerId) {
      const providerResult = await requestWithCandidates([
        { method: 'get', path: `/admin/proveedores/${providerId}` },
      ]).catch(() => null)

      if (providerResult) {
        detailedProvider = normalizeProviderRecord(pickRecord(providerResult, ['provider', 'proveedor']))
      }
    }

    selectedUserDetail.value = {
      user: detailedUser,
      provider: detailedProvider,
    }
  } catch (error) {
    detailError.value = error.message || 'No fue posible cargar el detalle completo.'
  } finally {
    detailLoading.value = false
  }
}

async function loadUsersFromBackend() {
  const response = await requestWithCandidates([{ method: 'get', path: '/admin/users' }])

  const users = pickCollection(response, ['users'])
  if (users.length) {
    localUsers.value = users.map((user, index) => normalizeUserRecord(user, index))
  }
}

async function loadRolesFromBackend() {
  try {
    const response = await requestWithCandidates([{ method: 'get', path: '/admin/roles' }])
    const roles = pickCollection(response, ['roles']).map((role) => normalizeRoleRecord(role))

    localRoles.value = roles.length ? roles : defaultRoleBlueprints.map((role) => ({ ...role }))
  } catch {
    localRoles.value = defaultRoleBlueprints.map((role) => ({ ...role }))
  }
}

async function loadProvidersFromBackend() {
  try {
    const response = await requestWithCandidates([
      { method: 'get', path: '/admin/operators' },
      { method: 'get', path: '/admin/proveedores' },
    ])
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

  if (drawerMode.value === 'create' && trimmedPassword && trimmedPassword.length < 6) {
    errors.password = 'La password temporal debe tener al menos 6 caracteres.'
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
      <div class="hero-center">
        <p class="eyebrow dark-eyebrow">Usuarios y roles</p>
        <h1>Gestiona accesos, perfiles y permisos desde una sola vista de control.</h1>
        <p class="hero-subtitle">
          Administra el ciclo completo de usuarios desde una lectura clara, ejecutiva y consistente con el resto del admin.
        </p>
        <div class="hero-actions">
          <button type="button" class="admin-btn admin-btn-primary" @click="openCreateUser">Nuevo usuario</button>
          <button type="button" class="admin-btn admin-btn-secondary" @click="openCreateRole">Sincronizar roles</button>
          <button type="button" class="admin-btn admin-btn-ghost" @click="exportUsers">Exportar</button>
          <button type="button" class="admin-btn admin-btn-ghost" @click="toggleFilters">
            {{ filtersOpen ? 'Ocultar filtros' : 'Filtros' }}
          </button>
        </div>
      </div>
    </section>

    <section class="status-strip">
      <article v-for="item in userSignals" :key="item.label" class="signal-card">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <p>{{ item.detail }}</p>
      </article>
    </section>

    <section v-if="filtersOpen" class="filters-panel">
      <label class="field search-field">
        <span>Buscar usuario</span>
        <input v-model="searchTerm" type="search" placeholder="Nombre, correo, telefono, rol o estado" />
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
    </section>

    <section class="editorial-section">
      <div class="section-heading split-heading">
        <div>
          <h2>Roles y permisos</h2>
          <p>Esta capa resume los roles disponibles para que el admin los asigne desde el directorio de usuarios.</p>
        </div>
        <button type="button" class="admin-btn admin-btn-secondary" @click="openCreateRole">Recargar roles</button>
      </div>

      <div class="workstreams-grid roles-layout">
        <article v-for="role in roleSummaries" :key="role.key" class="workstream-card role-stream-card">
          <span class="workstream-label">{{ role.name }}</span>
          <h3>{{ role.scope }}</h3>
          <p class="workstream-copy">{{ role.description }}</p>
          <strong class="stream-meta">{{ role.users }} usuarios</strong>
          <ul>
            <li v-for="permission in role.permissions" :key="permission">{{ permission }}</li>
          </ul>
          <div class="inline-actions">
            <button type="button" class="admin-text-btn" @click="openEditRole(role)">Ver rol</button>
          </div>
        </article>
      </div>
    </section>

    <section class="editorial-section">
      <div class="section-heading">
        <h2>Como opera esta vista</h2>
        <p>La administracion se organiza en capas para que el equipo sepa donde crear, revisar, editar y auditar sin saturar una sola zona.</p>
      </div>

      <div class="workstreams-grid">
        <article v-for="note in governanceNotes" :key="note.title" class="workstream-card">
          <span class="workstream-label">{{ note.title }}</span>
          <p class="workstream-copy">{{ note.text }}</p>
        </article>
        <article class="workstream-card">
          <span class="workstream-label">Cobertura</span>
          <ul>
            <li v-for="item in accessCoverage" :key="item.label">{{ item.label }}: {{ item.value }}</li>
          </ul>
        </article>
        <article class="workstream-card">
          <span class="workstream-label">Actividad reciente</span>
          <ul>
            <li v-for="item in recentActivity" :key="item.id">{{ item.title }}</li>
          </ul>
        </article>
      </div>
    </section>

    <section class="editorial-section">
      <div class="section-heading">
        <h2>Perfiles destacados</h2>
        <p>Una seleccion rapida para auditar y revisar perfiles sin mezclar toda la administracion operativa en las tarjetas.</p>
      </div>

      <div class="featured-grid">
        <article v-for="user in featuredUsers" :key="user.id" class="featured-card">
          <div class="profile-topline">
            <div class="avatar-badge">{{ userInitials(user.name) }}</div>
            <div>
              <span class="role-chip">{{ user.role }}</span>
              <h3>{{ user.name }}</h3>
            </div>
          </div>

          <p>{{ user.email }}</p>

          <div class="meta-row">
            <span
              class="status-pill"
              :class="{
                'status-pill-warn': normalizeStatusKey(user.status) === 'suspendido',
                'status-pill-danger': normalizeStatusKey(user.status) === 'inactivo',
              }"
            >
              {{ user.status }}
            </span>
            <small>Ultima auditoria: {{ user.lastAudit }}</small>
          </div>

          <div class="inline-actions">
            <button type="button" class="admin-text-btn" @click="openEditUser(user)">Ver perfil</button>
            <button type="button" class="admin-text-btn" @click="auditUser(user)">Auditar</button>
          </div>
        </article>

        <article v-if="!featuredUsers.length" class="featured-card empty-card">
          <h3>Sin usuarios disponibles</h3>
          <p>Cuando existan registros que cumplan con los filtros, apareceran aqui para revision operativa.</p>
        </article>
      </div>
    </section>

    <section class="editorial-section">
      <div class="section-heading">
        <h2>Directorio por rol</h2>
        <p>Una lectura segmentada para que el admin revise cada frente de acceso sin depender solo de filtros manuales.</p>
      </div>

      <div class="role-directory-grid">
        <article v-for="role in usersByRole" :key="role.key" class="role-directory-card">
          <div class="role-directory-head">
            <div>
              <span class="workstream-label">{{ role.name }}</span>
              <h3>{{ role.usersList.length }} usuarios</h3>
            </div>
            <span class="role-chip">{{ role.scope }}</span>
          </div>

          <div v-if="role.usersList.length" class="role-directory-list">
            <div v-for="user in role.usersList.slice(0, 5)" :key="`${role.key}-${user.id}`" class="role-directory-row">
              <div class="user-cell">
                <div class="avatar-mini">{{ userInitials(user.name) }}</div>
                <div class="cell-stack">
                  <strong>{{ user.name }}</strong>
                  <small>{{ user.email }}</small>
                </div>
              </div>

              <div class="role-directory-meta">
                <span
                  class="status-pill"
                  :class="{
                    'status-pill-warn': normalizeStatusKey(user.status) === 'suspendido',
                    'status-pill-danger': normalizeStatusKey(user.status) === 'inactivo',
                  }"
                >
                  {{ user.status }}
                </span>
                <button type="button" class="admin-text-btn" @click="openEditUser(user)">Editar</button>
              </div>
            </div>
          </div>

          <div v-else class="role-directory-empty">
            No hay usuarios visibles para este rol con los filtros actuales.
          </div>
        </article>
      </div>
    </section>

    <section class="editorial-section">
      <div class="section-heading split-heading">
        <div>
          <h2>Directorio completo</h2>
          <p>{{ filteredUsers.length }} registros listos para consulta, edicion, suspension y cambio de rol.</p>
        </div>
        <div class="hero-actions">
          <button type="button" class="admin-btn admin-btn-primary" @click="openCreateUser">Nuevo usuario</button>
          <button type="button" class="admin-btn admin-btn-secondary" @click="openCreateRole">Recargar roles</button>
        </div>
      </div>

      <div class="table-shell">
        <div class="table-row table-head-row">
          <span>Usuario</span>
          <span>Correo</span>
          <span>Rol</span>
          <span>Estado</span>
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
                  @click="grantUserTrial(selectedUserDetail.user)"
                >
                  Activar demo comercial
                </button>
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
  min-height: 48vh;
  padding-top: 1rem;
  background:
    radial-gradient(circle at top right, rgba(201, 164, 90, 0.12), transparent 18%),
    linear-gradient(180deg, #ffffff 0%, #faf8f2 100%);
}

.hero-center {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 1rem;
  text-align: center;
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
  max-width: 14ch;
  font-size: clamp(2.8rem, 6vw, 4.4rem);
  line-height: 0.94;
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
  justify-content: center;
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

.signal-card span,
.workstream-label {
  color: #666666;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.signal-card strong {
  font-size: 1rem;
}

.filters-panel {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) repeat(2, minmax(180px, 0.5fr));
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
  font-size: 1.3rem;
  line-height: 1.05;
}

.stream-meta {
  color: #8c6a1f;
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

.featured-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
}

.role-directory-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.role-directory-card {
  display: grid;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid #ebebeb;
  border-radius: 24px;
  background:
    linear-gradient(180deg, #ffffff 0%, #fbf8f1 100%);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.05);
}

.role-directory-head,
.role-directory-row,
.role-directory-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.role-directory-head h3 {
  margin: 0.25rem 0 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  font-size: 1.35rem;
  letter-spacing: -0.04em;
}

.role-directory-list {
  display: grid;
  gap: 0.75rem;
}

.role-directory-row {
  padding: 0.9rem 0;
  border-top: 1px solid #ece7da;
}

.role-directory-row:first-child {
  border-top: 0;
  padding-top: 0;
}

.role-directory-empty {
  color: #6b7280;
  padding: 1rem 0;
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
  grid-template-columns: 1.15fr 1.1fr 0.75fr 0.7fr 1.5fr;
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

.admin-mini-btn {
  appearance: none;
  min-height: 2rem;
  padding: 0 0.75rem;
  border: 1px solid #d9dde2;
  border-radius: 10px;
  color: #2d3748;
  background: #ffffff;
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
  .status-strip,
  .featured-grid,
  .role-directory-grid {
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
  .status-strip,
  .featured-grid,
  .role-directory-grid {
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
