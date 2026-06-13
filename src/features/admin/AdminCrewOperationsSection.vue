<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { resolveWorkflowState } from '../../utils/flightWorkflow'
import { fetchAvailableCrewByRange } from '../../services/disponibilidadService'

const props = defineProps({
  crewMembers: { type: Array, required: true },
  operations: { type: Array, required: true },
  auditEntries: { type: Array, required: true },
  viewMode: { type: String, default: 'review' },
})

const emit = defineEmits([
  'approve-crew',
  'reject-crew',
  'suspend-crew',
  'assign-crew',
  'audit-crew',
])

const activeTab = ref('validation')
const selectedCrewId = ref(null)
const selectedOperationId = ref(null)
const selectedAuditId = ref(null)
const detailModalOpen = ref(false)
const interactionLoading = reactive({
  active: false,
  title: '',
  detail: '',
})
const interactionFeedback = reactive({
  active: false,
  title: '',
  detail: '',
  tone: 'success',
})
const searchTerm = ref('')
const statusFilter = ref('all')
const baseFilter = ref('all')
const providerFilter = ref('all')
const certificationFilter = ref('all')
const availabilityFilter = ref('all')
const validationNotes = reactive({})
const assignmentDrafts = reactive({})
const assignmentErrors = reactive({})
const availableCrewCache = reactive({})
const loadingAvailableCrew = reactive({})
let hasInitializedViewMode = false

const pendingValidationTokens = ['pend', 'revision', 'cambio', 'valid']

function normalizeToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
}

function includesAny(value = '', tokens = []) {
  const normalized = normalizeToken(value)
  return tokens.some((token) => normalized.includes(token))
}

function normalizeOperationalState(value = '') {
  const normalized = normalizeToken(value)
  if (!normalized) return ''
  if (['available', 'active', 'activo', 'disponible'].includes(normalized)) return 'Disponible'
  if (['rest', 'descanso'].includes(normalized)) return 'Descanso'
  if (['en vuelo', 'in flight', 'vuelo'].includes(normalized)) return 'En vuelo'
  if (['assigned', 'asignado'].includes(normalized)) return 'Asignado'
  if (normalized.includes('suspend') || normalized.includes('bloq') || normalized.includes('block')) return 'Suspendido'
  if (['inactive', 'inactivo', 'unavailable', 'no disponible'].includes(normalized)) return 'No disponible'
  return value
}

function toneClass(value = '') {
  const normalized = normalizeToken(normalizeOperationalState(value) || value)

  if (
    normalized.includes('no disponible') ||
    normalized.includes('rech') ||
    normalized.includes('suspend') ||
    normalized.includes('bloq') ||
    normalized.includes('block') ||
    normalized.includes('alert')
  ) {
    return 'chip-danger'
  }

  if (normalized.includes('descanso') || normalized.includes('rest')) {
    return 'chip-warning'
  }

  if (
    normalized.includes('asignad') ||
    normalized.includes('operacion') ||
    normalized.includes('vuelo') ||
    normalized.includes('tracking')
  ) {
    return 'chip-info'
  }

  if (
    normalized.includes('pend') ||
    normalized.includes('revision') ||
    normalized.includes('cambio') ||
    normalized.includes('venc')
  ) {
    return 'chip-warning'
  }

  if (
    normalized.includes('aprob') ||
    normalized.includes('confirm') ||
    normalized.includes('completa') ||
    normalized.includes('disponible') ||
    normalized.includes('activo')
  ) {
    return 'chip-success'
  }

  return 'chip-neutral'
}

function certificationTone(value = '') {
  const normalized = normalizeToken(value)
  if (!normalized || normalized.includes('pend') || normalized.includes('venc')) return 'chip-danger'
  if (normalized.includes('complet') || normalized.includes('vigent') || normalized.includes('ok')) {
    return 'chip-success'
  }
  return 'chip-warning'
}

function formatDate(value) {
  if (!value) return 'Por definir'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function formatShortDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10)
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function ratingNumber(value = '') {
  const parsed = Number.parseFloat(String(value || '').replace(/[^\d.]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

const normalizedCrewLookup = computed(() => {
  const map = new Map()
  props.crewMembers.forEach((member) => {
    const id = String(member.id || '').trim()
    const name = normalizeToken(member.name || '')
    if (id) map.set(`id:${id}`, member)
    if (name) map.set(`name:${name}`, member)
  })
  return map
})

const operationAssignments = computed(() => {
  const map = new Map()
  props.operations.forEach((operation) => {
    const crewId = String(operation.crewId || '').trim()
    const crewName = normalizeToken(operation.crew || '')
    if (crewId) map.set(`id:${crewId}`, operation)
    if (crewName) map.set(`name:${crewName}`, operation)
  })
  return map
})

function crewOperation(member = {}) {
  const byId = operationAssignments.value.get(`id:${String(member.id || '').trim()}`)
  if (byId) return byId
  return operationAssignments.value.get(`name:${normalizeToken(member.name || '')}`) || null
}

function operationCrewMember(operation = {}) {
  const byId = normalizedCrewLookup.value.get(`id:${String(operation.crewId || '').trim()}`)
  if (byId) return byId
  return normalizedCrewLookup.value.get(`name:${normalizeToken(operation.crew || '')}`) || null
}

function crewValidationState(member = {}) {
  return member.profileState || member.validationStatus || ''
}

function crewOperationalState(member = {}) {
  return normalizeOperationalState(member.state || member.operationalState || '')
}

function certificationLabel(member = {}) {
  const raw = member.certifications || member.documentsSummary || ''
  const normalized = normalizeToken(raw)

  if (!normalized) return ''
  if (normalized.includes('venc')) return 'Certificaciones vencidas'
  if (normalized.includes('complet') || normalized.includes('vigent')) return 'Expediente completo'
  if (normalized.includes('pend')) return 'Expediente incompleto'

  return raw
}

function isCrewApproved(member = {}) {
  return includesAny(crewValidationState(member), ['aprob'])
}

function isCrewPendingValidation(member = {}) {
  return includesAny(crewValidationState(member), pendingValidationTokens)
}

function isCrewSuspended(member = {}) {
  return normalizeOperationalState(crewOperationalState(member)) === 'Suspendido'
}

function isCrewAssigned(member = {}) {
  const operationalState = normalizeOperationalState(crewOperationalState(member))
  return Boolean(crewOperation(member)) || operationalState === 'Asignado' || operationalState === 'En vuelo'
}

function isCrewAvailableToday(member = {}) {
  const validationState = normalizeToken(crewValidationState(member))
  const operationalState = normalizeOperationalState(crewOperationalState(member))
  const hasBlockedValidationState =
    validationState.includes('rech') ||
    validationState.includes('pend') ||
    validationState.includes('suspend')

  return (
    !hasBlockedValidationState &&
    !isCrewSuspended(member) &&
    !isCrewAssigned(member) &&
    operationalState === 'Disponible'
  )
}

function buildCrewAlerts(member = {}) {
  const alerts = []
  const certifications = normalizeToken(certificationLabel(member))

  if (isCrewPendingValidation(member)) alerts.push('Requiere validacion administrativa')
  if (certifications.includes('venc')) alerts.push('Certificacion vencida')
  if (certifications.includes('incompleto') || certifications.includes('sin expediente')) {
    alerts.push('Expediente incompleto')
  }
  if (!String(member.base || '').trim()) alerts.push('Sin base asignada')
  if (isCrewSuspended(member)) alerts.push('Sobrecargo suspendido')
  if (
    ['No disponible', 'Descanso'].includes(normalizeOperationalState(crewOperationalState(member))) &&
    !isCrewAssigned(member) &&
    isCrewApproved(member)
  ) {
    alerts.push('No disponible hoy')
  }

  return alerts
}

function matchesSearch(candidate = {}) {
  const query = normalizeToken(searchTerm.value)
  if (!query) return true

  const haystack = normalizeToken([
    candidate.name,
    candidate.providerName,
    candidate.base,
    candidate.certifications,
    candidate.documentsSummary,
    candidate.state,
    candidate.profileState,
    candidate.route,
    candidate.aircraft,
    candidate.clientName,
  ].join(' '))

  return haystack.includes(query)
}

const normalizedCrewMembers = computed(() =>
  props.crewMembers.map((member) => {
    const linkedOperation = crewOperation(member)
    const alerts = buildCrewAlerts(member)
    return {
      ...member,
      validationState: crewValidationState(member),
      operationalState: crewOperationalState(member),
      certificationStatus: certificationLabel(member),
      assignedOperation: linkedOperation,
      isApproved: isCrewApproved(member),
      isPendingValidation: isCrewPendingValidation(member),
      isSuspended: isCrewSuspended(member),
      isAssigned: Boolean(linkedOperation),
      isAvailableToday: isCrewAvailableToday(member),
      alerts,
      alertsCount: alerts.length,
    }
  }),
)

const statusOptions = computed(() => [
  { value: 'all', label: 'Estado' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'approved', label: 'Aprobados' },
  { value: 'assigned', label: 'Asignados' },
  { value: 'suspended', label: 'Suspendidos' },
  { value: 'alerts', label: 'Con alerta' },
])

const baseOptions = computed(() => [
  'all',
  ...new Set(normalizedCrewMembers.value.map((member) => String(member.base || '').trim()).filter(Boolean)),
])

const providerOptions = computed(() => [
  'all',
  ...new Set(normalizedCrewMembers.value.map((member) => String(member.providerName || '').trim()).filter(Boolean)),
])

const filteredCrewMembers = computed(() =>
  normalizedCrewMembers.value
    .filter((member) => matchesSearch(member))
    .filter((member) => {
      if (statusFilter.value === 'pending') return member.isPendingValidation
      if (statusFilter.value === 'approved') return member.isApproved && !member.isAssigned
      if (statusFilter.value === 'assigned') return member.isAssigned
      if (statusFilter.value === 'suspended') return member.isSuspended
      if (statusFilter.value === 'alerts') return member.alertsCount > 0
      return true
    })
    .filter((member) =>
      baseFilter.value === 'all' ? true : String(member.base || '').trim() === baseFilter.value,
    )
    .filter((member) =>
      providerFilter.value === 'all'
        ? true
        : String(member.providerName || '').trim() === providerFilter.value,
    )
    .filter((member) => {
      if (certificationFilter.value === 'all') return true
      if (certificationFilter.value === 'expired') {
        return normalizeToken(member.certificationStatus).includes('venc')
      }
      if (certificationFilter.value === 'incomplete') {
        return includesAny(member.certificationStatus, ['incompleto', 'sin expediente', 'pend'])
      }
      if (certificationFilter.value === 'complete') {
        return includesAny(member.certificationStatus, ['completo', 'vigent'])
      }
      return true
    })
    .filter((member) => {
      if (availabilityFilter.value === 'all') return true
      if (availabilityFilter.value === 'available') return member.isAvailableToday
      if (availabilityFilter.value === 'assigned') return member.isAssigned
      if (availabilityFilter.value === 'unavailable') return !member.isAvailableToday
      return true
    })
    .sort((left, right) => {
      if (left.alertsCount !== right.alertsCount) return right.alertsCount - left.alertsCount
      if (left.isPendingValidation !== right.isPendingValidation) {
        return left.isPendingValidation ? -1 : 1
      }
      return String(left.name || '').localeCompare(String(right.name || ''))
    }),
)

const validationQueue = computed(() =>
  filteredCrewMembers.value.filter(
    (member) => member.isPendingValidation || member.alertsCount > 0 || !member.isApproved,
  ),
)

const availableQueue = computed(() =>
  filteredCrewMembers.value.filter((member) => member.isAvailableToday),
)

const approvedCrew = computed(() =>
  filteredCrewMembers.value.filter((member) => member.isAvailableToday),
)

function isCrewAssignableToOperation(member = {}, operation = {}) {
  const validationState = normalizeToken(crewValidationState(member))
  const operationalState = normalizeOperationalState(crewOperationalState(member))
  const hasExplicitValidationState = Boolean(validationState)
  const hasBlockedValidationState =
    validationState.includes('rech') ||
    validationState.includes('pend') ||
    validationState.includes('suspend')

  if (hasBlockedValidationState || isCrewSuspended(member)) return false
  if (hasExplicitValidationState && !isCrewApproved(member)) return false
  if (['No disponible', 'Descanso', 'En vuelo'].includes(operationalState)) return false

  const assignedOperationId = Number(member.assignedOperation?.id || 0)
  const targetOperationId = Number(operation.id || 0)

  if (assignedOperationId && assignedOperationId !== targetOperationId) {
    return false
  }

  return member.isAvailableToday || assignedOperationId === targetOperationId
}

function assignableCrewMembers(operation = {}) {
  const cacheKey = availabilityQueryKey(operation)
  const cached = availableCrewCache[cacheKey]

  if (Array.isArray(cached) && cached.length) {
    const allowedIds = new Set(cached.map((member) => Number(member.id || 0)).filter(Boolean))
    return normalizedCrewMembers.value.filter(
      (member) => allowedIds.has(Number(member.id || 0)) && isCrewAssignableToOperation(member, operation),
    )
  }

  return normalizedCrewMembers.value.filter((member) => isCrewAssignableToOperation(member, operation))
}

function operationDateRange(operation = {}) {
  const from =
    String(operation.departureDate || '').slice(0, 10) ||
    String(operation.departure || '').slice(0, 10) ||
    String(operation.raw?.operation?.departure_datetime || '').slice(0, 10) ||
    String(operation.raw?.departure_datetime || '').slice(0, 10)
  const to =
    String(operation.arrival || '').slice(0, 10) ||
    String(operation.raw?.operation?.arrival_datetime || '').slice(0, 10) ||
    String(operation.raw?.arrival_datetime || '').slice(0, 10) ||
    from

  return {
    from: /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : '',
    to: /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : from,
  }
}

function availabilityQueryKey(operation = {}) {
  const range = operationDateRange(operation)
  return `${range.from || 'sin-fecha'}:${range.to || 'sin-fecha'}:${String(operation.origin || operation.presentationPlace || '').trim() || 'sin-base'}`
}

async function ensureAvailableCrewForOperation(operation = {}) {
  const range = operationDateRange(operation)
  const cacheKey = availabilityQueryKey(operation)
  if (!range.from || loadingAvailableCrew[cacheKey]) return
  if (Array.isArray(availableCrewCache[cacheKey])) return

  loadingAvailableCrew[cacheKey] = true
  try {
    availableCrewCache[cacheKey] = await fetchAvailableCrewByRange({
      from: range.from,
      to: range.to,
      base: String(operation.origin || operation.presentationPlace || '').trim(),
    })
  } catch {
    delete availableCrewCache[cacheKey]
  } finally {
    loadingAvailableCrew[cacheKey] = false
  }
}

const assignedOperations = computed(() =>
  [...props.operations]
    .filter((operation) => matchesSearch(operation))
    .sort((left, right) => {
      const leftAssigned = String(left.crew || left.crewId || '').trim() ? 0 : -1
      const rightAssigned = String(right.crew || right.crewId || '').trim() ? 0 : -1
      if (leftAssigned !== rightAssigned) return leftAssigned - rightAssigned
      return Number(right.id || 0) - Number(left.id || 0)
    }),
)

const auditQueue = computed(() =>
  props.auditEntries.filter((entry) => matchesSearch(entry)),
)

const totalAuditEntries = computed(() => props.auditEntries.length)

const summaryCards = computed(() => [
  { label: 'Pendientes de validar', value: validationQueue.value.length, tone: 'warning' },
  { label: 'Aprobados activos', value: approvedCrew.value.length, tone: 'success' },
  { label: 'Asignados a vuelo', value: assignedOperations.value.filter((item) => item.crew || item.crewId).length, tone: 'info' },
  { label: 'Con alerta', value: normalizedCrewMembers.value.filter((item) => item.alertsCount > 0).length, tone: 'danger' },
  { label: 'Disponibles hoy', value: availableQueue.value.length, tone: 'neutral' },
])

const isOperationsView = computed(() => props.viewMode === 'operations')
const tabs = computed(() =>
  isOperationsView.value
    ? [
        { id: 'validation', label: 'Sobrecargos', count: filteredCrewMembers.value.length },
        { id: 'assigned', label: 'Vuelos', count: assignedOperations.value.length },
        { id: 'audit', label: 'Bitacora', count: totalAuditEntries.value },
      ]
    : [
        { id: 'validation', label: 'Sobrecargos', count: filteredCrewMembers.value.length },
        { id: 'available', label: 'Disponibles', count: availableQueue.value.length },
        { id: 'assigned', label: 'Asignados', count: assignedOperations.value.length },
        { id: 'audit', label: 'Auditoria', count: totalAuditEntries.value },
      ],
)

const activeCrewQueue = computed(() => {
  if (activeTab.value === 'available') return availableQueue.value
  if (activeTab.value === 'validation') return filteredCrewMembers.value
  return []
})

const selectedCrew = computed(
  () => activeCrewQueue.value.find((member) => member.id === selectedCrewId.value) || activeCrewQueue.value[0] || null,
)

const selectedOperation = computed(
  () =>
    assignedOperations.value.find((operation) => operation.id === selectedOperationId.value) ||
    assignedOperations.value[0] ||
    null,
)

const selectedAuditEntry = computed(
  () => auditQueue.value.find((entry) => entry.id === selectedAuditId.value) || auditQueue.value[0] || null,
)

watch(
  () => props.operations,
  (operations) => {
    operations.forEach((operation) => {
      if (!assignmentDrafts[operation.id]) {
        assignmentDrafts[operation.id] = {
          crewId: operation.crewId || '',
          note: '',
          presentationTime: operation.briefingTime || '',
          presentationPlaceType: '',
          presentationPlaceDetail: operation.presentationPlace || '',
        }
      }
    })
  },
  { immediate: true },
)

watch(
  () => activeCrewQueue.value,
  (members) => {
    if (!members.length) {
      selectedCrewId.value = null
      return
    }
    if (!members.some((member) => member.id === selectedCrewId.value)) {
      selectedCrewId.value = members[0].id
    }
  },
  { immediate: true },
)

watch(
  () => assignedOperations.value,
  (operations) => {
    if (!operations.length) {
      selectedOperationId.value = null
      return
    }
    if (!operations.some((operation) => operation.id === selectedOperationId.value)) {
      selectedOperationId.value = operations[0].id
    }
  },
  { immediate: true },
)

watch(
  () => auditQueue.value,
  (entries) => {
    if (!entries.length) {
      selectedAuditId.value = null
      return
    }
    if (!entries.some((entry) => entry.id === selectedAuditId.value)) {
      selectedAuditId.value = entries[0].id
    }
  },
  { immediate: true },
)

watch(activeTab, () => {
  detailModalOpen.value = false
})

watch(
  () => props.viewMode,
  (mode) => {
    if (!hasInitializedViewMode) {
      activeTab.value = mode === 'operations' ? 'assigned' : 'validation'
      hasInitializedViewMode = true
      return
    }

    if (mode === 'operations') {
      if (!['validation', 'assigned', 'audit'].includes(activeTab.value)) {
        activeTab.value = 'assigned'
      }
      return
    }

    if (!['validation', 'available', 'assigned', 'audit'].includes(activeTab.value)) {
      activeTab.value = 'validation'
    }
  },
  { immediate: true },
)

function getDraft(operationId) {
  if (!assignmentDrafts[operationId]) {
    assignmentDrafts[operationId] = {
      crewId: '',
      note: '',
      presentationTime: '',
      presentationPlaceType: '',
      presentationPlaceDetail: '',
    }
  }
  return assignmentDrafts[operationId]
}

function clearAssignmentError(operationId) {
  assignmentErrors[operationId] = ''
}

function assignmentFieldIsEmpty(operationId, field) {
  const draft = getDraft(operationId)

  if (field === 'crewId') return !draft.crewId
  if (field === 'presentationTime') return !String(draft.presentationTime || '').trim()
  if (field === 'presentationPlaceType') return !String(draft.presentationPlaceType || '').trim()
  if (field === 'presentationPlaceDetail') return !String(draft.presentationPlaceDetail || '').trim()
  if (field === 'note') return !String(draft.note || '').trim()

  return false
}

function showAssignmentFieldError(operationId, field) {
  return Boolean(assignmentErrors[operationId]) && assignmentFieldIsEmpty(operationId, field)
}

function selectCrew(memberId) {
  selectedCrewId.value = memberId
}

function selectOperation(operationId) {
  selectedOperationId.value = operationId
}

function selectAudit(entryId) {
  selectedAuditId.value = entryId
}

function openCrewDetail(memberId) {
  selectCrew(memberId)
  detailModalOpen.value = true
}

function openOperationDetail(operationId) {
  selectOperation(operationId)
  detailModalOpen.value = true
}

function openAuditDetail(entryId) {
  selectAudit(entryId)
  detailModalOpen.value = true
}

function closeDetailModal() {
  detailModalOpen.value = false
}

function wait(ms = 0) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function runWithInteractionLoading(
  {
    title = 'Cargando modulo',
    detail = 'Estamos preparando la informacion operativa.',
    minDuration = 520,
  } = {},
  task = null,
) {
  const startedAt = Date.now()
  let result = null
  interactionLoading.active = true
  interactionLoading.title = title
  interactionLoading.detail = detail

  try {
    if (typeof task === 'function') {
      result = await task()
    }

    await nextTick()

    const elapsed = Date.now() - startedAt
    if (elapsed < minDuration) {
      await wait(minDuration - elapsed)
    }
  } finally {
    interactionLoading.active = false
    interactionLoading.title = ''
    interactionLoading.detail = ''
  }

  return result
}

async function showInteractionFeedback({
  title = 'Movimiento completado',
  detail = 'La operacion ya se actualizo.',
  tone = 'success',
  duration = 1800,
} = {}) {
  interactionFeedback.active = true
  interactionFeedback.title = title
  interactionFeedback.detail = detail
  interactionFeedback.tone = tone
  await wait(duration)
  interactionFeedback.active = false
  interactionFeedback.title = ''
  interactionFeedback.detail = ''
  interactionFeedback.tone = 'success'
}

function handlePrimaryAction(mode) {
  if (!selectedCrew.value) return
  submitCrewAction(mode)
  closeDetailModal()
}

async function handleCrewAction(mode) {
  const actionMeta = {
    approve: {
      title: 'Aprobando sobrecargo',
      detail: 'Estamos registrando la aprobacion y actualizando el expediente operativo.',
    },
    reject: {
      title: 'Registrando rechazo',
      detail: 'Estamos guardando la decision administrativa para este sobrecargo.',
    },
    suspend: {
      title: 'Suspendiendo sobrecargo',
      detail: 'Estamos aplicando el bloqueo operativo y sincronizando la bitacora.',
    },
    audit: {
      title: 'Generando auditoria',
      detail: 'Estamos guardando la nota administrativa en el historial del sobrecargo.',
    },
  }

  await runWithInteractionLoading(actionMeta[mode], async () => {
    handlePrimaryAction(mode)
  })
}

function submitCrewAction(mode) {
  if (!selectedCrew.value) return

  const payload = {
    member: selectedCrew.value,
    note: validationNotes[selectedCrew.value.id] || '',
  }

  if (mode === 'approve') {
    emit('approve-crew', payload)
    return
  }

  if (mode === 'reject') {
    emit('reject-crew', payload)
    return
  }

  if (mode === 'suspend') {
    emit('suspend-crew', payload)
    return
  }

  if (mode === 'audit') {
    emit('audit-crew', payload)
  }
}

function submitAssignment(operationId) {
  const draft = getDraft(operationId)
  const operation = props.operations.find((item) => item.id === operationId)
  const selectedCrewMember = normalizedCrewMembers.value.find((item) => Number(item.id) === Number(draft.crewId || 0))

  if (!operation || isOperationClosed(operation)) return false

  const validationMessage = validateAssignmentDraft(operation)
  assignmentErrors[operationId] = validationMessage
  if (validationMessage) return false

  const presentationPlace = buildPresentationPlace(operationId)

  return new Promise((resolve) => {
    emit('assign-crew', {
      operationId,
      crewId: Number(draft.crewId || 0),
      presentationTime: String(draft.presentationTime || '').trim(),
      presentationPlaceType: String(draft.presentationPlaceType || '').trim(),
      presentationPlaceDetail: String(draft.presentationPlaceDetail || '').trim(),
      presentationPlace,
      note: String(draft.note || '').trim(),
      onSuccess: ({ title, message } = {}) =>
        resolve({
          success: true,
          title: title || 'Sobrecargo asignado',
          detail: message || `${selectedCrewMember?.name || 'La sobrecargo'} ya quedo ligada a la operacion.`,
        }),
      onError: ({ message } = {}) => {
        assignmentErrors[operationId] = message || 'No fue posible completar la asignacion.'
        resolve({ success: false })
      },
    })
  })
}

async function handleAssignment(operationId, { closeAfter = false } = {}) {
  const result = await runWithInteractionLoading(
    {
      title: 'Asignando sobrecargo',
      detail: 'Estamos vinculando el vuelo, la presentacion y las notas operativas.',
    },
    async () => submitAssignment(operationId),
  )

  if (result?.success) {
    await showInteractionFeedback({
      title: result.title,
      detail: result.detail,
      tone: 'success',
    })

    if (closeAfter) {
      closeDetailModal()
    }
  }
}

async function handleCrewDetailOpen(memberId) {
  await runWithInteractionLoading(
    {
      title: 'Abriendo expediente',
      detail: 'Estamos preparando el detalle administrativo y operativo del sobrecargo.',
    },
    async () => {
      openCrewDetail(memberId)
    },
  )
}

async function handleOperationDetailOpen(operationId) {
  selectOperation(operationId)
  await nextTick()
}

async function handleAuditDetailOpen(entryId) {
  await runWithInteractionLoading(
    {
      title: 'Abriendo bitacora',
      detail: 'Estamos preparando el evento seleccionado para revision detallada.',
    },
    async () => {
      openAuditDetail(entryId)
    },
  )
}

async function handleTabSelection(tabId) {
  if (activeTab.value === tabId) return

  const tabMeta = {
    validation: {
      title: 'Cargando sobrecargos',
      detail: 'Estamos preparando la bandeja de validacion y seguimiento operativo.',
    },
    available: {
      title: 'Cargando disponibilidad',
      detail: 'Estamos reuniendo a los sobrecargos listos para asignacion inmediata.',
    },
    assigned: {
      title: 'Cargando vuelos',
      detail: 'Estamos armando la mesa de operaciones y asignaciones activas.',
    },
    audit: {
      title: 'Cargando auditoria',
      detail: 'Estamos consultando la bitacora administrativa y operativa.',
    },
  }

  await runWithInteractionLoading(tabMeta[tabId], async () => {
    activeTab.value = tabId
  })
}

function assignmentUrgency(operation = {}) {
  return String(operation.crew || operation.crewId || '').trim() ? 'Confirmado' : 'Urgente'
}

function formatDisplayDate(value) {
  if (!value) return ''
  const normalized = String(value).includes('T') ? String(value) : `${value}T08:00`
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return String(value)

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function formatDateTime(value) {
  if (!value) return 'Por definir'
  const normalized = String(value).includes('T') ? String(value) : `${value}T08:00`
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return String(value)

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function operationStatusLabel(operation = {}) {
  return operation.workflowStatus || operation.status || 'Pendiente'
}

function operationCrewStateLabel(operation = {}) {
  if (operation.crewOperationalState) return humanizeStatus(operation.crewOperationalState)
  const linkedCrew = operationCrewMember(operation)
  if (linkedCrew) return humanizeStatus(linkedCrew.state || linkedCrew.operationalState || '')
  return String(operation.crew || operation.crewId || '').trim() ? 'Asignada' : 'Pendiente'
}

function operationIncidentLabel(operation = {}) {
  return operation.incidentsLabel || (operation.incidentsCount ? `${operation.incidentsCount} incidencia(s)` : 'Sin incidencias')
}

function canAssignCrew(operation = {}) {
  return resolveWorkflowState(operation.workflowStatus || operation.status || '').id === 'tracking_live'
}

function isOperationClosed(operation = {}) {
  const normalized = normalizeToken(operation.workflowStatus || operation.status || '')
  return normalized.includes('cancel') || normalized.includes('finaliz') || normalized.includes('cerrad') || normalized.includes('closed')
}

const operationFlowLabels = [
  'Asignada',
  'Confirmada por sobrecargo',
  'En aeropuerto/base',
  'Cabina revisada',
  'Pasajeros recibidos',
  'En vuelo',
  'Escala / siguiente tramo',
  'Reporte enviado',
  'Cierre admin',
]

function operationFlowIndex(operation = {}) {
  const normalized = normalizeToken(operation.workflowStatus || operation.status || operationCrewStateLabel(operation))
  if (normalized.includes('cancel')) return 0
  if (normalized.includes('finaliz') || normalized.includes('cerrad')) return 8
  if (normalized.includes('reporte')) return 7
  if (normalized.includes('escala')) return 6
  if (normalized.includes('vuelo') || normalized.includes('service')) return 5
  if (normalized.includes('pasaj')) return 4
  if (normalized.includes('cabina') || normalized.includes('catering')) return 3
  if (normalized.includes('aeropuerto') || normalized.includes('base') || normalized.includes('briefing') || normalized.includes('prepar')) return 2
  if (normalizeToken(operationCrewStateLabel(operation)).includes('confirm')) return 1
  return String(operation.crew || operation.crewId || '').trim() ? 0 : 0
}

function operationFlowSteps(operation = {}) {
  const activeIndex = operationFlowIndex(operation)
  return operationFlowLabels.map((label, index) => ({
    label,
    done: index <= activeIndex,
    active: index === activeIndex,
  }))
}

function humanizeStatus(value = '') {
  const normalizedState = normalizeOperationalState(value)
  if (normalizedState) return normalizedState
  const normalized = normalizeToken(value)
  if (!normalized) return ''
  if (normalized === 'tracking live') return 'En seguimiento activo'
  if (normalized === 'operador asignado' || normalized === 'operator assigned' || normalized === 'operator assigned') return 'Operador asignado'
  if (normalized === 'pending crew response') return 'Esperando respuesta de sobrecargo'
  if (normalized === 'contrato pendiente' || normalized === 'contract pending') return 'Contrato pendiente'
  if (normalized === 'payment pending' || normalized === 'pago pendiente') return 'Pago pendiente'
  if (normalized === 'flight confirmed' || normalized === 'vuelo confirmado') return 'Vuelo confirmado'
  if (normalized === 'pending crew response') return 'Sin responder'
  if (normalized === 'crew confirmed') return 'Confirmado'
  if (normalized === 'crew declined') return 'Rechazado'
  if (normalized === 'crew change requested') return 'Solicita cambio'
  if (normalized === 'crew enroute') return 'En traslado'
  if (normalized === 'crew active') return 'En servicio'
  if (normalized === 'crew completed') return 'Finalizado'
  if (normalized === 'crew incident reported') return 'Con incidencia'
  if (normalized === 'active') return 'Activo'
  if (normalized === 'activo') return 'Activo'
  if (normalized === 'blocked') return 'Bloqueado'
  if (normalized === 'pending') return 'Pendiente'
  if (normalized === 'approved') return 'Aprobado'
  if (normalized === 'rejected') return 'Rechazado'
  if (normalized === 'suspended') return 'Suspendido'
  if (normalized === 'available') return 'Disponible'
  if (normalized === 'inactive') return 'Inactivo'
  if (normalized === 'no disponible') return 'No disponible'
  return value
}

function summarizePersonName(value = '', fallback = 'Sin asignar') {
  const parts = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (!parts.length) return fallback
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${String(parts[1] || '').charAt(0)}.`
}

function operationDisplayClient(operation = {}) {
  return operation.clientName ? `Cliente: ${summarizePersonName(operation.clientName, 'Cliente privado')}` : 'Cliente privado'
}

function operationDisplayCrew(operation = {}) {
  return operation.crew ? summarizePersonName(operation.crew) : 'Pendiente asignar'
}

function operationDisplayState(operation = {}) {
  const operationLabel = humanizeStatus(operationStatusLabel(operation))
  const crewLabel = humanizeStatus(operationCrewStateLabel(operation))
  return `${operationLabel}${crewLabel ? ` · ${crewLabel}` : ''}`
}

function selectedDraftCrew(operation = {}) {
  const draft = getDraft(operation.id)
  return normalizedCrewMembers.value.find((item) => Number(item.id || 0) === Number(draft.crewId || 0)) || null
}

function buildPresentationPlace(operationId) {
  const draft = getDraft(operationId)
  return [draft.presentationPlaceType, draft.presentationPlaceDetail]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' · ')
}

function validateAssignmentDraft(operation = {}) {
  const draft = getDraft(operation.id)
  const selectedCrewMember = selectedDraftCrew(operation)

  if (!canAssignCrew(operation)) {
    return 'Esta operacion aun no esta lista para asignacion.'
  }
  if (!draft.crewId || !selectedCrewMember) {
    return 'Selecciona una sobrecargo antes de asignar.'
  }
  if (!String(draft.presentationTime || '').trim()) {
    return 'Completa la hora de presentacion antes de asignar.'
  }
  if (!String(draft.presentationPlaceType || '').trim() || !String(draft.presentationPlaceDetail || '').trim()) {
    return 'Completa el tipo y detalle del lugar de presentacion antes de asignar.'
  }
  if (!String(draft.note || '').trim()) {
    return 'Completa la nota operativa antes de asignar.'
  }
  if (!isCrewAssignableToOperation(selectedCrewMember, operation)) {
    return 'La sobrecargo seleccionada no esta disponible para este rango operativo.'
  }

  return ''
}

function fallbackLabel(value = '', emptyLabel = 'Sin asignar') {
  return String(value || '').trim() || emptyLabel
}

function hasOperationalGap(member = {}) {
  return !String(member.base || '').trim() || !String(member.providerName || '').trim()
}

function isOperationallyBlocked(member = {}) {
  const normalized = normalizeToken(member.operationalState || '')
  return normalized.includes('bloq') || normalized.includes('suspend') || normalized.includes('block')
}

function showApprovalBlockedNote(member = {}) {
  return includesAny(member.validationState, ['aprob']) && isOperationallyBlocked(member)
}

function auditEntrySummary(entry = {}) {
  const detail = String(entry.detail || '').trim()
  const segments = detail.split('·').map((segment) => segment.trim()).filter(Boolean)

  return {
    headline: segments[0] || detail || 'Movimiento operativo',
    meta: segments.slice(1),
  }
}

function auditEntryTone(entry = {}) {
  const normalized = normalizeToken(`${entry.title || ''} ${entry.detail || ''}`)
  if (normalized.includes('rechaz')) return 'chip-danger'
  if (normalized.includes('confirm')) return 'chip-success'
  if (normalized.includes('cambio') || normalized.includes('revision')) return 'chip-warning'
  return 'chip-info'
}
</script>

<template>
  <section class="crew-admin-page">
    <article class="surface section-card workspace-card">
      <div class="section-head workspace-head">
        <div>
          <p class="eyebrow">Centro de despacho</p>
          <p class="muted">
            {{
              isOperationsView
                ? 'Vista separada para seleccionar vuelo, asignar sobrecargo y seguir la trazabilidad operativa.'
                : 'Lista compacta, filtros rapidos y panel de detalle para operar con velocidad.'
            }}
          </p>
        </div>

        <div class="tabs-strip" role="tablist" aria-label="Procesos de sobrecargos">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            class="tab-button"
            :class="{ 'tab-button--active': activeTab === tab.id }"
            :aria-selected="activeTab === tab.id"
            @click="handleTabSelection(tab.id)"
          >
            <span>{{ tab.label }}</span>
            <strong>{{ tab.count }}</strong>
          </button>
        </div>
      </div>

      <div class="filters-shell">
        <label class="field field--search">
          <span>Buscar sobrecargo / proveedor / base</span>
          <input v-model="searchTerm" type="text" placeholder="Nombre, proveedor, base o vuelo" />
        </label>

        <label class="field">
          <span>Estado</span>
          <select v-model="statusFilter">
            <option v-for="option in statusOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>Base</span>
          <select v-model="baseFilter">
            <option value="all">Todas</option>
            <option v-for="base in baseOptions.slice(1)" :key="base" :value="base">{{ base }}</option>
          </select>
        </label>

        <label class="field">
          <span>Proveedor</span>
          <select v-model="providerFilter">
            <option value="all">Todos</option>
            <option v-for="provider in providerOptions.slice(1)" :key="provider" :value="provider">
              {{ provider }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>Certificacion</span>
          <select v-model="certificationFilter">
            <option value="all">Todas</option>
            <option value="complete">Completas</option>
            <option value="incomplete">Incompletas</option>
            <option value="expired">Vencidas</option>
          </select>
        </label>

        <label class="field">
          <span>Disponibilidad</span>
          <select v-model="availabilityFilter">
            <option value="all">Todas</option>
            <option value="available">Disponibles hoy</option>
            <option value="assigned">Asignadas a vuelo</option>
            <option value="unavailable">No disponibles</option>
          </select>
        </label>
      </div>

      <div class="workspace-grid" :class="{ 'workspace-grid--assigned': activeTab === 'assigned' && selectedOperation }">
        <div class="queue-panel">
          <div v-if="activeTab === 'validation' || activeTab === 'available'" class="table-shell">
            <div class="table-head">
              <div>
                <p class="eyebrow">{{ activeTab === 'validation' ? 'Sobrecargos' : 'Disponibles' }}</p>
                <h4>
                  {{
                    activeTab === 'validation'
                      ? 'Lista completa de sobrecargos'
                      : 'Sobrecargos listos para asignarse'
                  }}
                </h4>
              </div>
              <span class="badge badge-muted">{{ activeCrewQueue.length }} registros</span>
            </div>

            <div class="table-wrap">
              <table class="queue-table">
                <thead>
                  <tr>
                    <th>Sobrecargo</th>
                    <th>Proveedor</th>
                    <th>Estado</th>
                    <th>Certificaciones</th>
                    <th>Rating</th>
                    <th>Ultima revision</th>
                    <th>Accion</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="member in activeCrewQueue"
                    :key="member.id"
                    :class="{ 'is-selected': member.id === selectedCrew?.id }"
                    @click="selectCrew(member.id)"
                  >
                    <td>
                      <div class="table-primary">
                        <strong>{{ member.name }}</strong>
                        <small v-if="member.base">{{ member.base }}</small>
                      </div>
                    </td>
                    <td>{{ member.providerName || '' }}</td>
                    <td>
                      <div class="status-stack-inline">
                        <span v-if="member.validationState" class="status-chip" :class="toneClass(member.validationState)">
                          {{ member.validationState }}
                        </span>
                        <span v-if="member.operationalState" class="status-chip" :class="toneClass(member.operationalState)">
                          {{ member.operationalState }}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span v-if="member.certificationStatus" class="status-chip" :class="certificationTone(member.certificationStatus)">
                        {{ member.certificationStatus }}
                      </span>
                    </td>
                    <td>{{ member.rating || '' }}</td>
                    <td>{{ formatShortDate(member.lastAudit) || '' }}</td>
                    <td>
                      <div class="row-action-pack">
                        <span v-if="member.alertsCount" class="mini-alert">{{ member.alertsCount }} alerta(s)</span>
                        <button type="button" class="ghost-button ghost-button--sm" @click.stop="handleCrewDetailOpen(member.id)">
                          Revisar
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p v-if="!activeCrewQueue.length" class="empty-state">
              No hay sobrecargos para esta bandeja con los filtros actuales.
            </p>
          </div>

          <div v-else-if="activeTab === 'assigned'" class="table-shell">
            <div class="table-head">
              <div>
                <p class="eyebrow">Operacion por vuelo</p>
                <h4>Asignacion y seguimiento de sobrecargos</h4>
              </div>
              <span class="badge badge-muted">{{ assignedOperations.length }} vuelos</span>
            </div>

            <div class="table-wrap">
              <table class="queue-table queue-table--ops">
                <thead>
                  <tr>
                    <th>Vuelo</th>
                    <th>Fecha</th>
                    <th>Aeronave</th>
                    <th>Sobrecargo</th>
                    <th>Estado</th>
                    <th>Accion</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="operation in assignedOperations"
                    :key="operation.id"
                    :class="{ 'is-selected': operation.id === selectedOperation?.id }"
                    @click="selectOperation(operation.id)"
                  >
                    <td>
                      <div class="table-primary">
                        <strong>{{ operation.folio || `RA-${operation.id}` }}</strong>
                        <small>{{ operation.route }}</small>
                        <small>{{ operationDisplayClient(operation) }}</small>
                      </div>
                    </td>
                    <td>{{ formatDateTime(operation.departure) }}</td>
                    <td>{{ operation.aircraft || 'Aeronave por definir' }}</td>
                    <td>{{ operationDisplayCrew(operation) }}</td>
                    <td>{{ operationDisplayState(operation) }}</td>
                    <td @click.stop>
                      <div class="row-action-pack">
                        <button type="button" class="ghost-button ghost-button--sm" @click="handleOperationDetailOpen(operation.id)">
                          Ver detalle
                        </button>
                        <button
                          type="button"
                          class="primary-action primary-action--sm"
                          :disabled="isOperationClosed(operation) || !canAssignCrew(operation)"
                          @click="handleOperationDetailOpen(operation.id)"
                        >
                          {{ operation.crew ? 'Reasignar' : 'Asignar' }}
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p v-if="!assignedOperations.length" class="empty-state">
              No hay vuelos operativos para mostrar en esta mesa.
            </p>
          </div>

          <div v-else class="table-shell">
            <div class="table-head">
              <div>
                <p class="eyebrow">Auditoria</p>
                <h4>Historial administrativo</h4>
              </div>
              <span class="badge badge-muted">{{ auditQueue.length }} eventos</span>
            </div>

            <div class="audit-list">
              <article
                v-for="entry in auditQueue"
                :key="entry.id"
                class="audit-card"
                :class="{ 'audit-card--selected': entry.id === selectedAuditEntry?.id }"
                @click="selectAudit(entry.id)"
              >
                <div class="audit-card__date">
                  <strong>{{ entry.date.split(' ')[0] || entry.date }}</strong>
                  <span>{{ entry.date.split(' ')[1] || 'Sin hora' }}</span>
                </div>

                <div class="audit-card__body">
                  <div class="audit-card__head">
                    <div>
                      <p class="audit-card__eyebrow">Registro operativo</p>
                      <h5>{{ entry.title }}</h5>
                    </div>
                    <span class="status-chip" :class="auditEntryTone(entry)">
                      {{ auditEntrySummary(entry).meta.at(-1) || 'Seguimiento' }}
                    </span>
                  </div>

                  <p class="audit-card__headline">{{ auditEntrySummary(entry).headline }}</p>

                  <div v-if="auditEntrySummary(entry).meta.length" class="audit-card__meta">
                    <span v-for="item in auditEntrySummary(entry).meta.slice(0, 3)" :key="item">{{ item }}</span>
                  </div>
                </div>

                <div class="audit-card__action">
                  <button type="button" class="ghost-button ghost-button--sm" @click.stop="handleAuditDetailOpen(entry.id)">
                    Ver
                  </button>
                </div>
              </article>
            </div>

            <p v-if="!auditQueue.length" class="empty-state">
              La bitacora aparecera aqui conforme se registren cambios de validacion y operacion.
            </p>
          </div>
        </div>

        <aside v-if="activeTab === 'assigned' && selectedOperation" class="surface detail-panel detail-panel--sticky">
          <div class="section-head detail-head detail-head--panel">
            <div>
              <p class="eyebrow">Detalle del vuelo</p>
              <h3>{{ selectedOperation.folio || `RA-${selectedOperation.id}` }}</h3>
              <p class="muted">Asignacion operativa y seguimiento del servicio sin salir de la mesa.</p>
            </div>
            <div class="status-stack">
              <span class="status-chip" :class="toneClass(operationStatusLabel(selectedOperation))">
                {{ humanizeStatus(operationStatusLabel(selectedOperation)) }}
              </span>
              <span class="status-chip" :class="toneClass(operationCrewStateLabel(selectedOperation))">
                {{ operationCrewStateLabel(selectedOperation) }}
              </span>
            </div>
          </div>

          <article class="detail-hero-card">
            <div class="detail-hero-card__route">
              <p class="eyebrow">Ruta activa</p>
              <h4>{{ selectedOperation.route }}</h4>
              <p>{{ formatDateTime(selectedOperation.departure) }}</p>
            </div>
            <div class="detail-hero-card__chips">
              <span class="status-chip chip-neutral">
                {{ selectedOperation.passengers ? `${selectedOperation.passengers} pax` : 'Sin pax' }}
              </span>
              <span class="status-chip chip-neutral">
                {{ selectedOperation.aircraft || 'Aeronave por definir' }}
              </span>
            </div>
          </article>

          <div class="detail-kpi-grid">
            <article class="detail-kpi-card">
              <span>Cliente</span>
              <strong>{{ selectedOperation.clientName || 'Cliente privado' }}</strong>
            </article>
            <article class="detail-kpi-card">
              <span>Sobrecargo actual</span>
              <strong>{{ selectedOperation.crew || 'Pendiente asignar' }}</strong>
            </article>
            <article class="detail-kpi-card">
              <span>Estado operacion</span>
              <strong>{{ humanizeStatus(operationStatusLabel(selectedOperation)) }}</strong>
            </article>
            <article class="detail-kpi-card">
              <span>Estado crew</span>
              <strong>{{ operationCrewStateLabel(selectedOperation) }}</strong>
            </article>
          </div>

          <article class="detail-block detail-block--toned">
            <div class="section-mini-head">
              <h4>Detalle del vuelo</h4>
              <p>Contexto operativo antes de tomar cualquier accion.</p>
            </div>
            <div class="record-grid">
              <div class="record-row">
                <span>Ruta</span>
                <strong>{{ selectedOperation.route }}</strong>
              </div>
              <div class="record-row">
                <span>Fecha y hora</span>
                <strong>{{ formatDateTime(selectedOperation.departure) }}</strong>
              </div>
              <div class="record-row">
                <span>Catering</span>
                <strong>{{ selectedOperation.catering || 'Sin dato' }}</strong>
              </div>
              <div class="record-row">
                <span>Incidencias</span>
                <strong>{{ operationIncidentLabel(selectedOperation) }}</strong>
              </div>
              <div class="record-row record-row--wide">
                <span>Requerimientos especiales</span>
                <strong>{{ selectedOperation.specialRequirements || 'Sin requerimientos especiales cargados' }}</strong>
              </div>
            </div>
          </article>

          <article class="detail-block">
            <div class="section-mini-head">
              <h4>Asignacion de sobrecargo</h4>
              <p>Completa los datos operativos para asignar o reasignar esta operacion.</p>
            </div>

            <label class="field" :class="{ 'field--error': showAssignmentFieldError(selectedOperation.id, 'crewId') }">
              <span>Sobrecargo</span>
              <select
                v-model="getDraft(selectedOperation.id).crewId"
                :disabled="isOperationClosed(selectedOperation) || !canAssignCrew(selectedOperation)"
                @focus="ensureAvailableCrewForOperation(selectedOperation)"
                @change="clearAssignmentError(selectedOperation.id)"
              >
                <option value="">Selecciona</option>
                <option v-for="member in assignableCrewMembers(selectedOperation)" :key="member.id" :value="member.id">
                  {{ member.name }} · {{ member.base || 'Sin base' }}
                </option>
              </select>
            </label>

            <article v-if="selectedDraftCrew(selectedOperation)" class="availability-card">
              <span class="eyebrow">Disponibilidad</span>
              <strong>{{ selectedDraftCrew(selectedOperation)?.isAvailableToday ? 'Disponible para esta fecha' : 'Revisar disponibilidad' }}</strong>
              <p>Base: {{ selectedDraftCrew(selectedOperation)?.base || 'Sin base' }}</p>
              <p>Ultima operacion: {{ formatShortDate(selectedDraftCrew(selectedOperation)?.lastAudit) || 'Pendiente' }}</p>
            </article>

            <div class="record-grid">
              <label class="field" :class="{ 'field--error': showAssignmentFieldError(selectedOperation.id, 'presentationTime') }">
                <span>Hora de presentacion</span>
                <input
                  v-model="getDraft(selectedOperation.id).presentationTime"
                  type="text"
                  :disabled="!canAssignCrew(selectedOperation)"
                  placeholder="08:30"
                  @input="clearAssignmentError(selectedOperation.id)"
                />
              </label>
              <label class="field" :class="{ 'field--error': showAssignmentFieldError(selectedOperation.id, 'presentationPlaceType') }">
                <span>Tipo de lugar</span>
                <select
                  v-model="getDraft(selectedOperation.id).presentationPlaceType"
                  :disabled="!canAssignCrew(selectedOperation)"
                  @change="clearAssignmentError(selectedOperation.id)"
                >
                  <option value="">Selecciona</option>
                  <option value="FBO">FBO</option>
                  <option value="Base">Base</option>
                  <option value="Aeropuerto">Aeropuerto</option>
                  <option value="Hangar">Hangar</option>
                  <option value="Otro">Otro</option>
                </select>
              </label>
            </div>

            <label class="field" :class="{ 'field--error': showAssignmentFieldError(selectedOperation.id, 'presentationPlaceDetail') }">
              <span>Detalle del lugar</span>
              <input
                v-model="getDraft(selectedOperation.id).presentationPlaceDetail"
                type="text"
                :disabled="!canAssignCrew(selectedOperation)"
                placeholder="Ej. FBO Toluca / Hangar 3 / Sala VIP"
                @input="clearAssignmentError(selectedOperation.id)"
              />
            </label>

            <label class="field" :class="{ 'field--error': showAssignmentFieldError(selectedOperation.id, 'note') }">
              <span>Nota operativa</span>
              <textarea
                v-model="getDraft(selectedOperation.id).note"
                rows="4"
                :disabled="!canAssignCrew(selectedOperation)"
                placeholder="VIP, briefing, horarios, alerta de cabina o seguimiento"
                @input="clearAssignmentError(selectedOperation.id)"
              ></textarea>
            </label>

            <p v-if="assignmentErrors[selectedOperation.id]" class="inline-error">
              {{ assignmentErrors[selectedOperation.id] }}
            </p>
            <p v-else-if="!canAssignCrew(selectedOperation)" class="muted">
              Completa el flujo cuando la operacion entre a seguimiento activo.
            </p>
          </article>

          <article class="detail-block">
            <div class="section-mini-head">
              <h4>Checklist / seguimiento</h4>
              <p>Lectura operativa del avance actual.</p>
            </div>
            <div class="alerts-stack">
              <span
                v-for="step in operationFlowSteps(selectedOperation)"
                :key="step.label"
                class="status-chip"
                :class="step.active ? 'chip-info' : step.done ? 'chip-success' : 'chip-neutral'"
              >
                {{ step.label }}
              </span>
            </div>
            <p class="muted">{{ selectedOperation.notes || 'Sin observaciones operativas.' }}</p>
          </article>

          <div class="detail-actions detail-actions--panel">
            <button type="button" class="ghost-button" @click="activeTab = 'audit'">Ver historial</button>
            <button
              type="button"
              class="primary-action"
              :disabled="isOperationClosed(selectedOperation) || !canAssignCrew(selectedOperation)"
              @click="handleAssignment(selectedOperation.id)"
            >
              {{ selectedOperation.crew ? 'Reasignar sobrecargo' : 'Asignar sobrecargo' }}
            </button>
          </div>
        </aside>
      </div>

      <div v-if="detailModalOpen" class="detail-modal-backdrop" @click.self="closeDetailModal">
        <section class="surface detail-modal" role="dialog" aria-modal="true" aria-label="Detalle de sobrecargo">
          <button type="button" class="detail-modal-close button-reset" aria-label="Cerrar detalle" @click="closeDetailModal">
            <span></span>
            <span></span>
          </button>

          <template v-if="(activeTab === 'validation' || activeTab === 'available') && selectedCrew">
            <div class="section-head detail-head detail-head--modal">
              <div>
                <p class="eyebrow">Expediente administrativo</p>
                <h3>{{ selectedCrew.name }}</h3>
                <p class="muted">Revisa el expediente y decide sin salir de la mesa de validación.</p>
              </div>
              <div class="status-stack">
                <span class="status-chip" :class="toneClass(selectedCrew.validationState)">
                  {{ humanizeStatus(selectedCrew.validationState) || 'Pendiente' }}
                </span>
                <span class="status-chip" :class="toneClass(selectedCrew.operationalState)">
                  {{ humanizeStatus(selectedCrew.operationalState || (selectedCrew.isAssigned ? 'Asignado' : 'No disponible')) }}
                </span>
                <span
                  class="status-chip"
                  :class="hasOperationalGap(selectedCrew) ? 'chip-warning' : 'chip-success'"
                >
                  {{ String(selectedCrew.base || '').trim() ? `Base ${selectedCrew.base}` : 'Sin base asignada' }}
                </span>
              </div>
            </div>

            <article v-if="hasOperationalGap(selectedCrew)" class="detail-callout detail-callout--warning">
              <strong>Acción requerida</strong>
              <p>
                {{
                  !String(selectedCrew.base || '').trim()
                    ? 'Este sobrecargo no tiene base asignada. Asigna una base antes de aprobar operaciones.'
                    : 'Este sobrecargo aún no tiene proveedor ligado. Revisa su relación operativa antes de liberarlo.'
                }}
              </p>
            </article>

            <article v-else-if="showApprovalBlockedNote(selectedCrew)" class="detail-callout detail-callout--info">
              <strong>Estado combinado</strong>
              <p>El expediente está aprobado, pero el sobrecargo sigue bloqueado operativamente. Aún no está listo para operar.</p>
            </article>

            <div class="summary-strip">
              <span class="summary-chip" :class="toneClass(selectedCrew.validationState)">
                {{ humanizeStatus(selectedCrew.validationState) || 'Pendiente' }}
              </span>
              <span class="summary-chip" :class="toneClass(selectedCrew.operationalState)">
                {{ humanizeStatus(selectedCrew.operationalState) || 'Sin estado' }}
              </span>
              <span class="summary-chip" :class="selectedCrew.identityValidationRequired ? 'chip-warning' : 'chip-neutral'">
                {{ selectedCrew.identityValidationRequired ? 'ID requerida' : 'ID no requerida' }}
              </span>
              <span class="summary-chip" :class="String(selectedCrew.base || '').trim() ? 'chip-success' : 'chip-warning'">
                {{ String(selectedCrew.base || '').trim() ? `Base ${selectedCrew.base}` : 'Sin base' }}
              </span>
            </div>

            <div class="record-sections">
              <article class="detail-block detail-block--compact">
                <div class="section-mini-head">
                  <h4>Contacto</h4>
                </div>
                <div class="record-grid">
                  <div class="record-row record-row--wide">
                    <span>Correo</span>
                    <strong>{{ fallbackLabel(selectedCrew.email, 'Sin correo registrado') }}</strong>
                  </div>
                  <div class="record-row">
                    <span>Teléfono</span>
                    <strong>{{ fallbackLabel(selectedCrew.phone, 'Sin teléfono registrado') }}</strong>
                  </div>
                </div>
              </article>

              <article class="detail-block detail-block--compact">
                <div class="section-mini-head">
                  <h4>Información operativa</h4>
                </div>
                <div class="record-grid">
                  <div class="record-row">
                    <span>Proveedor</span>
                    <strong>{{ fallbackLabel(selectedCrew.providerName, 'Sin asignar') }}</strong>
                    <small v-if="!selectedCrew.providerName" class="inline-hint inline-hint--warning">Requiere asignación</small>
                  </div>
                  <div class="record-row">
                    <span>Base</span>
                    <strong>{{ fallbackLabel(selectedCrew.base, 'Sin asignar') }}</strong>
                    <small v-if="!selectedCrew.base" class="inline-hint inline-hint--warning">Requiere asignación</small>
                  </div>
                  <div class="record-row">
                    <span>Validación administrativa</span>
                    <strong>{{ humanizeStatus(selectedCrew.validationState) || 'Sin dato' }}</strong>
                  </div>
                  <div class="record-row">
                    <span>Estado operativo</span>
                    <strong>{{ humanizeStatus(selectedCrew.operationalState) || 'Sin dato' }}</strong>
                  </div>
                  <div class="record-row">
                    <span>Identidad requerida</span>
                    <strong>{{ selectedCrew.identityValidationRequired ? 'Sí' : 'No' }}</strong>
                  </div>
                  <div v-if="selectedCrew.lastAudit" class="record-row">
                    <span>Última revisión</span>
                    <strong>{{ formatDisplayDate(selectedCrew.lastAudit) }}</strong>
                  </div>
                </div>
              </article>

              <article v-if="selectedCrew.documentType || selectedCrew.documentNumber || selectedCrew.documentExpiration || selectedCrew.documentStatus || selectedCrew.nationality || selectedCrew.birthDate" class="detail-block detail-block--compact">
                <div class="section-mini-head">
                  <h4>Documento y perfil</h4>
                </div>
                <div class="record-grid">
                  <div v-if="selectedCrew.documentType" class="record-row">
                    <span>Tipo de documento</span>
                    <strong>{{ selectedCrew.documentType }}</strong>
                  </div>
                  <div v-if="selectedCrew.documentStatus" class="record-row">
                    <span>Estado documental</span>
                    <strong>{{ humanizeStatus(selectedCrew.documentStatus) }}</strong>
                  </div>
                  <div v-if="selectedCrew.documentNumber" class="record-row record-row--wide">
                    <span>Número de documento</span>
                    <strong>{{ selectedCrew.documentNumber }}</strong>
                  </div>
                  <div v-if="selectedCrew.documentExpiration" class="record-row">
                    <span>Vigencia</span>
                    <strong>{{ formatDisplayDate(selectedCrew.documentExpiration) }}</strong>
                  </div>
                  <div v-if="selectedCrew.nationality" class="record-row">
                    <span>Nacionalidad</span>
                    <strong>{{ selectedCrew.nationality }}</strong>
                  </div>
                  <div v-if="selectedCrew.birthDate" class="record-row">
                    <span>Fecha de nacimiento</span>
                    <strong>{{ formatDisplayDate(selectedCrew.birthDate) }}</strong>
                  </div>
                  <div v-if="selectedCrew.certifications || selectedCrew.documentsSummary" class="record-row record-row--wide">
                    <span>Certificaciones</span>
                    <strong>{{ selectedCrew.certifications || selectedCrew.documentsSummary }}</strong>
                  </div>
                </div>
              </article>

              <article class="detail-block detail-block--compact">
                <div class="section-mini-head">
                  <h4>Historial y auditoría</h4>
                </div>
                <div class="record-grid">
                  <div class="record-row">
                    <span>Última acción</span>
                    <strong>{{ selectedCrew.lastAudit ? 'Expediente revisado' : 'Sin registro' }}</strong>
                  </div>
                  <div class="record-row">
                    <span>Última revisión</span>
                    <strong>{{ selectedCrew.lastAudit ? formatDisplayDate(selectedCrew.lastAudit) : 'Pendiente' }}</strong>
                  </div>
                  <div class="record-row record-row--wide">
                    <span>Observaciones</span>
                    <strong>{{ fallbackLabel(selectedCrew.adminNotes || validationNotes[selectedCrew.id], 'Sin observaciones administrativas') }}</strong>
                  </div>
                </div>
              </article>
            </div>

            <article class="detail-block detail-block--compact">
              <div class="section-mini-head">
                <h4>Alertas</h4>
                <p>Hallazgos visibles para tomar una decisión rápida.</p>
              </div>
              <div v-if="selectedCrew.alerts.length" class="alerts-stack">
                <span v-for="alert in selectedCrew.alerts" :key="alert" class="alert-pill">{{ alert }}</span>
              </div>
              <p v-else class="muted">Sin alertas activas. El expediente luce operativo.</p>
            </article>

            <article class="detail-block detail-block--compact">
              <div class="section-mini-head">
                <h4>Observaciones administrativas</h4>
                <p>Opcional. Se guardan junto con la acción que elijas.</p>
              </div>
              <label class="field">
                <span>Observaciones</span>
                <textarea
                  v-model="validationNotes[selectedCrew.id]"
                  rows="4"
                  placeholder="Motivo, hallazgo, instrucción o criterio para documentar la acción"
                ></textarea>
              </label>
            </article>

            <article v-if="selectedCrew.assignedOperation" class="detail-block detail-block--compact">
              <div class="section-mini-head">
                <h4>Operación ligada</h4>
                <p>{{ selectedCrew.assignedOperation.route }}</p>
              </div>
              <p class="muted">
                Vuelo RA-{{ selectedCrew.assignedOperation.id }} · {{ formatDate(selectedCrew.assignedOperation.departure) }}
              </p>
            </article>

            <div class="detail-actions detail-actions--review">
              <button type="button" class="ghost-button ghost-button--soft" @click="closeDetailModal">
                Cerrar
              </button>
              <details class="detail-actions-menu">
                <summary>Mas acciones</summary>
                <div class="detail-actions-menu__panel">
                  <button type="button" class="ghost-button ghost-button--neutral" @click="handleCrewAction('audit')">
                    Auditar expediente
                  </button>
                  <button type="button" class="ghost-button ghost-button--warning" @click="handleCrewAction('suspend')">
                    Suspender
                  </button>
                  <button type="button" class="ghost-button ghost-button--danger" @click="handleCrewAction('reject')">
                    Rechazar
                  </button>
                </div>
              </details>
              <button type="button" class="primary-action primary-action--approve" @click="handleCrewAction('approve')">
                Aprobar
              </button>
            </div>
          </template>

          <template v-else-if="activeTab === 'assigned' && selectedOperation">
            <div class="section-head detail-head">
              <div>
                <p class="eyebrow">Detalle por vuelo</p>
                <h3>{{ selectedOperation.folio || `RA-${selectedOperation.id}` }}</h3>
                <p class="muted">Seguimiento operativo, asignacion y contexto del servicio en una sola vista.</p>
              </div>
              <div class="status-stack">
                <span class="status-chip" :class="toneClass(operationStatusLabel(selectedOperation))">
                  {{ humanizeStatus(operationStatusLabel(selectedOperation)) }}
                </span>
                <span class="status-chip" :class="toneClass(operationCrewStateLabel(selectedOperation))">
                  {{ operationCrewStateLabel(selectedOperation) }}
                </span>
              </div>
            </div>

            <article class="detail-hero-card">
              <div class="detail-hero-card__route">
                <p class="eyebrow">Ruta activa</p>
                <h4>{{ selectedOperation.route }}</h4>
                <p>{{ formatDateTime(selectedOperation.departure) }}</p>
              </div>
              <div class="detail-hero-card__chips">
                <span class="status-chip" :class="toneClass(operationStatusLabel(selectedOperation))">
                  {{ humanizeStatus(operationStatusLabel(selectedOperation)) }}
                </span>
                <span class="status-chip" :class="toneClass(operationCrewStateLabel(selectedOperation))">
                  {{ operationCrewStateLabel(selectedOperation) }}
                </span>
                <span class="status-chip chip-neutral">
                  {{ selectedOperation.passengers ? `${selectedOperation.passengers} pax` : 'Sin pax' }}
                </span>
              </div>
            </article>

            <div class="detail-kpi-grid">
              <article class="detail-kpi-card">
                <span>Cliente</span>
                <strong>{{ selectedOperation.clientName || 'Cliente por confirmar' }}</strong>
              </article>
              <article class="detail-kpi-card">
                <span>Sobrecargo actual</span>
                <strong>{{ selectedOperation.crew || 'Pendiente asignar' }}</strong>
              </article>
              <article class="detail-kpi-card">
                <span>Aeronave</span>
                <strong>{{ selectedOperation.aircraft || 'Por definir' }}</strong>
              </article>
              <article class="detail-kpi-card">
                <span>Presentacion</span>
                <strong>{{ selectedOperation.briefingTime || 'Por definir' }}</strong>
              </article>
            </div>

            <div class="detail-stack">
              <article class="detail-block detail-block--toned">
                <div class="section-mini-head">
                  <h4>Resumen operativo</h4>
                  <p>Datos clave visibles para la toma de decisiones inmediata.</p>
                </div>
                <div class="record-grid">
                  <div class="record-row">
                    <span>Ruta</span>
                    <strong>{{ selectedOperation.route }}</strong>
                  </div>
                  <div class="record-row">
                    <span>Fecha y hora</span>
                    <strong>{{ formatDateTime(selectedOperation.departure) }}</strong>
                  </div>
                  <div class="record-row">
                    <span>Lugar de presentacion</span>
                    <strong>{{ selectedOperation.presentationPlace || selectedOperation.origin || 'Por definir' }}</strong>
                  </div>
                  <div class="record-row">
                    <span>Pasajeros</span>
                    <strong>{{ selectedOperation.passengers ? `${selectedOperation.passengers} pax` : 'Sin dato' }}</strong>
                  </div>
                  <div class="record-row">
                    <span>Catering</span>
                    <strong>{{ selectedOperation.catering || 'Sin dato' }}</strong>
                  </div>
                  <div class="record-row">
                    <span>Incidencias</span>
                    <strong>{{ operationIncidentLabel(selectedOperation) }}</strong>
                  </div>
                </div>
              </article>

              <article class="detail-block detail-block--toned">
                <div class="section-mini-head">
                  <h4>Servicio y coordinacion</h4>
                  <p>Preferencias, contacto interno y contexto para la ejecucion.</p>
                </div>
                <div class="record-grid">
                  <div class="record-row record-row--wide">
                    <span>Requerimientos especiales</span>
                    <strong>{{ selectedOperation.specialRequirements || 'Sin requerimientos especiales cargados' }}</strong>
                  </div>
                  <div class="record-row record-row--wide">
                    <span>Contacto interno</span>
                    <strong>{{ selectedOperation.internalContact || 'Admin / Red Sky' }}</strong>
                  </div>
                </div>
              </article>
            </div>

            <article class="detail-block">
              <div class="section-mini-head">
                <h4>Asignacion operativa</h4>
                <p>La asignacion de sobrecargo se habilita cuando el vuelo entra a tracking en vivo.</p>
              </div>

              <label class="field">
                <span>Sobrecargo</span>
                <select
                  v-model="getDraft(selectedOperation.id).crewId"
                  :disabled="isOperationClosed(selectedOperation) || !canAssignCrew(selectedOperation)"
                  @focus="ensureAvailableCrewForOperation(selectedOperation)"
                >
                  <option value="">Selecciona</option>
                  <option v-for="member in assignableCrewMembers(selectedOperation)" :key="member.id" :value="member.id">
                    {{ member.name }} · {{ member.base || 'Sin base' }}
                  </option>
                </select>
              </label>

              <div class="record-grid">
                <label class="field">
                  <span>Hora de presentacion</span>
                  <input
                    v-model="getDraft(selectedOperation.id).presentationTime"
                    type="text"
                    :disabled="!canAssignCrew(selectedOperation)"
                    placeholder="08:30"
                  />
                </label>
                <label class="field">
                  <span>Lugar de presentacion</span>
                  <input
                    v-model="getDraft(selectedOperation.id).presentationPlace"
                    type="text"
                    :disabled="!canAssignCrew(selectedOperation)"
                    placeholder="FBO / Base / Aeropuerto"
                  />
                </label>
              </div>

              <label class="field">
                <span>Nota operativa</span>
                <textarea
                  v-model="getDraft(selectedOperation.id).note"
                  rows="5"
                  :disabled="!canAssignCrew(selectedOperation)"
                  placeholder="VIP, briefing, horarios, alerta de cabina o seguimiento"
                ></textarea>
              </label>

              <p v-if="!canAssignCrew(selectedOperation)" class="muted">
                Esta seccion se habilita en cuanto el estado de la operacion cambie a tracking en vivo.
              </p>
            </article>

            <article class="detail-block">
              <div class="section-mini-head">
                <h4>Trazabilidad</h4>
                <p>Lectura operativa del avance actual y ultima nota registrada para el vuelo.</p>
              </div>
              <div class="alerts-stack">
                <span
                  v-for="step in operationFlowSteps(selectedOperation)"
                  :key="step.label"
                  class="status-chip"
                  :class="step.active ? 'chip-info' : step.done ? 'chip-success' : 'chip-neutral'"
                >
                  {{ step.label }}
                </span>
              </div>
              <p class="muted">{{ selectedOperation.notes || 'Sin observaciones operativas.' }}</p>
            </article>

            <div class="detail-actions">
              <button type="button" class="ghost-button" @click="activeTab = 'audit'; closeDetailModal()">Ver historial</button>
              <button
                type="button"
                class="primary-action"
                :disabled="isOperationClosed(selectedOperation) || !canAssignCrew(selectedOperation)"
                @click="handleAssignment(selectedOperation.id, { closeAfter: true })"
              >
                Asignar sobrecargo
              </button>
            </div>
          </template>

          <template v-else-if="activeTab === 'audit' && selectedAuditEntry">
            <div class="section-head detail-head">
              <div>
                <p class="eyebrow">Registro seleccionado</p>
                <h3>{{ selectedAuditEntry.title }}</h3>
              </div>
              <span class="status-chip chip-info">Bitacora</span>
            </div>

            <article class="detail-block">
              <div class="section-mini-head">
                <h4>Fecha</h4>
                <p>{{ selectedAuditEntry.date }}</p>
              </div>
            </article>

            <article class="detail-block">
              <div class="section-mini-head">
                <h4>Detalle completo</h4>
                <p>{{ selectedAuditEntry.detail }}</p>
              </div>
            </article>
          </template>

          <div v-else class="empty-shell">
            <p class="eyebrow">Sin seleccion</p>
            <h3>No hay datos para mostrar</h3>
            <p class="muted">Selecciona un registro de la mesa para ver el detalle operativo.</p>
          </div>
        </section>
      </div>

      <div
        v-if="interactionLoading.active"
        class="interaction-loading-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="interaction-loading-title"
      >
        <div class="interaction-loading-surface">
          <div class="interaction-loading-orb" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <p class="eyebrow">Centro de despacho</p>
          <h3 id="interaction-loading-title">{{ interactionLoading.title }}</h3>
          <p class="muted">{{ interactionLoading.detail }}</p>
        </div>
      </div>

      <div
        v-if="interactionFeedback.active"
        class="interaction-feedback-modal"
        role="status"
        aria-live="polite"
      >
        <div class="interaction-feedback-surface" :class="`interaction-feedback-surface--${interactionFeedback.tone}`">
          <div class="interaction-feedback-seal" aria-hidden="true">
            <span v-if="interactionFeedback.tone === 'success'">✓</span>
            <span v-else>!</span>
          </div>
          <p class="eyebrow">Centro de despacho</p>
          <h3>{{ interactionFeedback.title }}</h3>
          <p class="muted">{{ interactionFeedback.detail }}</p>
        </div>
      </div>
    </article>
  </section>
</template>

<style scoped>
.crew-admin-page,
.hero-metrics,
.workspace-grid,
.info-grid,
.status-stack,
.filters-shell {
  display: grid;
  gap: 1rem;
}

.crew-admin-page {
  color: #16120d;
}

.crew-admin-page :deep(.surface) {
  background: #fffdf9;
  border-color: #eadfc9;
  box-shadow: 0 24px 60px rgba(145, 108, 36, 0.08);
}

.crew-admin-page :deep(.eyebrow) {
  color: #c28a12;
}

.crew-admin-page :deep(.muted) {
  color: #6e6250;
}

.crew-admin-page h2,
.crew-admin-page h3,
.crew-admin-page h4,
.crew-admin-page strong,
.crew-admin-page p,
.crew-admin-page span,
.crew-admin-page small,
.crew-admin-page label {
  color: inherit;
}

.crew-admin-page h2,
.crew-admin-page h3,
.crew-admin-page h4,
.crew-admin-page strong {
  color: #20160d;
}

.crew-admin-page p,
.crew-admin-page small {
  color: #544838;
}

.hero-card,
.section-card,
.metric-card,
.detail-panel,
.info-card,
.detail-block {
  border-radius: 22px;
}

.hero-card,
.section-card,
.detail-panel,
.info-card,
.detail-block {
  border: 1px solid #eee2cc;
  background: #fffdfa;
}

.hero-card,
.section-card,
.detail-panel {
  padding: 1.25rem;
}

.hero-card,
.section-head,
.table-head,
.detail-actions,
.workspace-head {
  display: flex;
  gap: 1rem;
}

.hero-card,
.section-head,
.table-head,
.workspace-head {
  justify-content: space-between;
}

.hero-card,
.section-head,
.table-head,
.detail-actions,
.workspace-head {
  align-items: center;
}

.hero-card {
  flex-wrap: wrap;
}

.hero-copy {
  max-width: 48rem;
}

.hero-metrics {
  grid-template-columns: repeat(5, minmax(0, 1fr));
  min-width: min(56rem, 100%);
}

.metric-card {
  padding: 1rem;
  border: 1px solid rgba(200, 169, 107, 0.16);
  background: linear-gradient(180deg, #fffdfa 0%, #faf4e7 100%);
}

.metric-card span,
.field span,
.info-card span,
.section-mini-head p {
  display: block;
  color: #78684e;
  font-size: 0.82rem;
}

.metric-card strong {
  display: block;
  margin-top: 0.35rem;
  font-size: 1.55rem;
}

.metric-card--warning {
  box-shadow: inset 0 0 0 1px rgba(225, 170, 54, 0.18);
}

.metric-card--success {
  box-shadow: inset 0 0 0 1px rgba(32, 138, 88, 0.14);
}

.metric-card--info {
  box-shadow: inset 0 0 0 1px rgba(51, 102, 204, 0.14);
}

.metric-card--danger {
  box-shadow: inset 0 0 0 1px rgba(201, 73, 73, 0.16);
}

.metric-card--neutral {
  box-shadow: inset 0 0 0 1px rgba(17, 17, 17, 0.08);
}

.workspace-card {
  display: grid;
  gap: 1rem;
}

.workspace-head {
  align-items: end;
  flex-wrap: wrap;
}

.tabs-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.tab-button {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  min-height: 2.85rem;
  padding: 0 1rem;
  border-radius: 999px;
  border: 1px solid #e6d7be;
  background: #fffaf0;
  color: #6b5634;
  cursor: pointer;
}

.tab-button strong {
  display: inline-grid;
  place-items: center;
  min-width: 1.85rem;
  min-height: 1.85rem;
  border-radius: 999px;
  background: rgba(194, 138, 18, 0.1);
  font-size: 0.82rem;
}

.tab-button--active {
  border-color: #c28a12;
  background: #1f2028;
  color: #fff8eb;
}

.tab-button--active strong {
  background: rgba(255, 248, 235, 0.12);
  color: #fff8eb;
}

.filters-shell {
  grid-template-columns: minmax(280px, 2.3fr) repeat(5, minmax(160px, 1fr));
  align-items: end;
  overflow-x: auto;
  padding-bottom: 0.25rem;
}

.field {
  display: grid;
  gap: 0.38rem;
  min-width: 0;
}

.field--search {
  min-width: 0;
}

.workspace-grid {
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
}

.workspace-grid--assigned {
  grid-template-columns: minmax(0, 1.65fr) minmax(360px, 0.95fr);
}

.queue-panel,
.table-shell,
.detail-modal {
  display: grid;
  gap: 1rem;
}

.detail-panel--sticky {
  position: sticky;
  top: 1rem;
  align-self: start;
  max-height: calc(100vh - 8rem);
  overflow: auto;
}

.detail-modal {
  width: min(720px, calc(100vw - 2rem));
  height: calc(100vh - 8rem);
  min-height: calc(100vh - 8rem);
  max-height: calc(100vh - 8rem);
  overflow: auto;
  padding: 1.25rem;
  position: relative;
  border-radius: 28px;
  box-shadow:
    0 26px 70px rgba(24, 19, 13, 0.18),
    0 2px 14px rgba(24, 19, 13, 0.06);
}

.detail-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  justify-content: flex-end;
  align-items: stretch;
  padding: 6.5rem 1.25rem 1.5rem;
  background: rgba(20, 20, 20, 0.08);
  backdrop-filter: blur(1.5px);
}

.interaction-loading-modal {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background:
    radial-gradient(circle at top, rgba(194, 138, 18, 0.18), transparent 38%),
    rgba(16, 14, 11, 0.46);
  backdrop-filter: blur(14px);
}

.interaction-loading-surface {
  display: grid;
  gap: 0.85rem;
  width: min(430px, 100%);
  padding: 2rem 1.75rem;
  border-radius: 28px;
  border: 1px solid rgba(236, 223, 197, 0.7);
  background: linear-gradient(180deg, rgba(255, 253, 249, 0.96) 0%, rgba(251, 244, 232, 0.94) 100%);
  box-shadow:
    0 30px 80px rgba(18, 16, 12, 0.26),
    inset 0 1px 0 rgba(255, 255, 255, 0.7);
  text-align: center;
}

.interaction-loading-surface h3 {
  margin: 0;
  font-size: 1.45rem;
}

.interaction-loading-surface .muted {
  margin: 0;
}

.interaction-loading-orb {
  position: relative;
  width: 4.5rem;
  height: 4.5rem;
  margin: 0 auto 0.25rem;
  border-radius: 999px;
  background: radial-gradient(circle at 30% 30%, #fff8eb 0%, #ead6aa 38%, #c28a12 100%);
  box-shadow:
    0 18px 36px rgba(194, 138, 18, 0.28),
    inset 0 1px 10px rgba(255, 255, 255, 0.6);
}

.interaction-loading-orb span {
  position: absolute;
  inset: -0.45rem;
  border-radius: inherit;
  border: 1px solid rgba(194, 138, 18, 0.24);
  animation: crew-loading-pulse 1.8s ease-out infinite;
}

.interaction-loading-orb span:nth-child(2) {
  animation-delay: 0.3s;
}

.interaction-loading-orb span:nth-child(3) {
  animation-delay: 0.6s;
}

.interaction-feedback-modal {
  position: fixed;
  inset: 0;
  z-index: 85;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  pointer-events: none;
  background: rgba(16, 14, 11, 0.18);
  backdrop-filter: blur(8px);
}

.interaction-feedback-surface {
  display: grid;
  gap: 0.8rem;
  width: min(440px, 100%);
  padding: 2rem 1.8rem;
  border-radius: 30px;
  text-align: center;
  border: 1px solid rgba(236, 223, 197, 0.74);
  background: linear-gradient(180deg, rgba(255, 253, 249, 0.98) 0%, rgba(247, 241, 230, 0.96) 100%);
  box-shadow:
    0 28px 70px rgba(18, 16, 12, 0.26),
    inset 0 1px 0 rgba(255, 255, 255, 0.76);
}

.interaction-feedback-surface--success {
  border-color: rgba(124, 170, 132, 0.48);
}

.interaction-feedback-surface h3,
.interaction-feedback-surface .muted {
  margin: 0;
}

.interaction-feedback-seal {
  display: grid;
  place-items: center;
  width: 4.25rem;
  height: 4.25rem;
  margin: 0 auto 0.15rem;
  border-radius: 999px;
  background: radial-gradient(circle at 30% 30%, #fffdf3 0%, #d9efd8 42%, #6c9f72 100%);
  color: #12311a;
  font-size: 1.85rem;
  font-weight: 800;
  box-shadow:
    0 18px 34px rgba(76, 128, 85, 0.24),
    inset 0 1px 10px rgba(255, 255, 255, 0.56);
}

@keyframes crew-loading-pulse {
  0% {
    transform: scale(0.82);
    opacity: 0;
  }

  30% {
    opacity: 0.9;
  }

  100% {
    transform: scale(1.32);
    opacity: 0;
  }
}

.detail-modal-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 999px;
  border: 1px solid #dccfb9;
  background: #fffdfa;
  cursor: pointer;
}

.detail-modal-close span {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 1rem;
  height: 2px;
  background: #2e2a22;
}

.detail-modal-close span:first-child {
  transform: translate(-50%, -50%) rotate(45deg);
}

.detail-modal-close span:last-child {
  transform: translate(-50%, -50%) rotate(-45deg);
}

.detail-head--modal {
  align-items: start;
  padding-right: 3.25rem;
}

.detail-head {
  position: sticky;
  top: 0;
  z-index: 2;
  margin: -1.25rem -1.25rem 0;
  padding: 1.25rem 1.25rem 1rem;
  background: linear-gradient(180deg, #fffdfa 70%, rgba(255, 253, 250, 0.92) 100%);
  backdrop-filter: blur(10px);
  border-radius: 28px 28px 0 0;
}

.detail-hero-card,
.detail-kpi-grid,
.detail-stack {
  display: grid;
  gap: 1rem;
}

.detail-hero-card {
  grid-template-columns: minmax(0, 1.2fr) auto;
  align-items: end;
  padding: 1.1rem 1.15rem;
  border: 1px solid #eadfc9;
  border-radius: 24px;
  background:
    radial-gradient(circle at top left, rgba(194, 138, 18, 0.12), transparent 34%),
    linear-gradient(180deg, #fffdfa 0%, #fbf5ea 100%);
}

.detail-hero-card__route {
  display: grid;
  gap: 0.25rem;
}

.detail-hero-card__route h4 {
  margin: 0;
  font-size: 1.6rem;
  line-height: 1.05;
}

.detail-hero-card__route p:last-child {
  margin: 0;
  color: #6e6250;
}

.detail-hero-card__chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.55rem;
}

.detail-kpi-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.detail-kpi-card {
  display: grid;
  gap: 0.28rem;
  min-height: 5.5rem;
  padding: 1rem 1.05rem;
  border: 1px solid #eee2cc;
  border-radius: 20px;
  background: #fffefb;
}

.detail-kpi-card span {
  color: #78684e;
  font-size: 0.8rem;
}

.detail-kpi-card strong {
  font-size: 1.08rem;
  line-height: 1.25;
}

.availability-card {
  display: grid;
  gap: 0.3rem;
  padding: 0.95rem 1rem;
  border: 1px solid rgba(39, 153, 97, 0.18);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(239, 252, 245, 0.9) 0%, rgba(255, 253, 249, 1) 100%);
}

.availability-card strong {
  font-size: 1rem;
}

.availability-card p {
  margin: 0;
  color: #625645;
}

.detail-stack {
  grid-template-columns: 1fr;
}

.detail-block--toned {
  background:
    linear-gradient(180deg, rgba(255, 251, 244, 0.96) 0%, rgba(255, 253, 250, 1) 100%),
    #fffdfa;
}

.summary-strip,
.record-sections {
  display: grid;
  gap: 0.9rem;
}

.summary-strip {
  grid-template-columns: repeat(4, minmax(0, max-content));
  align-items: start;
}

.summary-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2rem;
  padding: 0 0.85rem;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
}

.detail-callout {
  display: grid;
  gap: 0.3rem;
  padding: 1rem 1.05rem;
  border-radius: 18px;
  border: 1px solid #eadfc9;
}

.detail-callout strong {
  font-size: 0.95rem;
}

.detail-callout--warning {
  background: linear-gradient(180deg, #fff7eb 0%, #fffdf8 100%);
  border-color: rgba(232, 180, 63, 0.28);
}

.detail-callout--info {
  background: linear-gradient(180deg, #f5f8ff 0%, #fffdf8 100%);
  border-color: rgba(54, 115, 215, 0.2);
}

.record-grid {
  display: grid;
  gap: 0.9rem 1rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.record-row {
  display: grid;
  gap: 0.2rem;
  padding: 0.85rem 0.95rem;
  border-radius: 18px;
  border: 1px solid #eee2cc;
  background: #fffefb;
}

.record-row--wide {
  grid-column: 1 / -1;
}

.record-row span {
  color: #78684e;
  font-size: 0.8rem;
}

.record-row strong {
  font-size: 0.98rem;
  line-height: 1.35;
}

.inline-hint {
  display: inline-flex;
  align-items: center;
  width: max-content;
  min-height: 1.7rem;
  margin-top: 0.35rem;
  padding: 0 0.65rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
}

.inline-hint--warning {
  background: rgba(232, 180, 63, 0.14);
  color: #99640a;
}

.table-wrap {
  overflow-x: auto;
  border: 1px solid #eee2cc;
  border-radius: 18px;
  background: #fffdfa;
}

.audit-list {
  display: grid;
  gap: 0.9rem;
}

.audit-card {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: center;
  padding: 1rem 1.05rem;
  border: 1px solid #eee2cc;
  border-radius: 20px;
  background:
    linear-gradient(135deg, rgba(255, 248, 235, 0.55) 0%, rgba(255, 253, 249, 0.96) 28%),
    #fffdfa;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.audit-card:hover {
  border-color: rgba(194, 138, 18, 0.34);
  box-shadow: 0 18px 36px rgba(145, 108, 36, 0.08);
  transform: translateY(-1px);
}

.audit-card--selected {
  border-color: rgba(194, 138, 18, 0.42);
  box-shadow: 0 20px 42px rgba(194, 138, 18, 0.12);
}

.audit-card__date,
.audit-card__body,
.audit-card__head,
.audit-card__meta,
.audit-card__action {
  display: grid;
  gap: 0.35rem;
}

.audit-card__date {
  align-content: start;
  padding: 0.9rem;
  border-radius: 16px;
  border: 1px solid #eadfc9;
  background: rgba(255, 250, 240, 0.95);
}

.audit-card__date strong {
  font-size: 0.96rem;
  line-height: 1.2;
}

.audit-card__date span {
  color: #7a6a51;
  font-size: 0.8rem;
  font-weight: 600;
}

.audit-card__head {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
}

.audit-card__eyebrow {
  color: #b58319;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.audit-card__head h5 {
  margin: 0.18rem 0 0;
  font-size: 1.08rem;
  line-height: 1.2;
  color: #20160d;
}

.audit-card__headline {
  margin: 0;
  color: #3f3428;
  font-size: 1rem;
  line-height: 1.45;
}

.audit-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.audit-card__meta span {
  display: inline-flex;
  align-items: center;
  min-height: 1.7rem;
  padding: 0 0.65rem;
  border-radius: 999px;
  background: rgba(17, 17, 17, 0.04);
  color: #625645;
  font-size: 0.76rem;
  font-weight: 700;
}

.audit-card__action {
  align-content: center;
}

.queue-table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
}

.queue-table--ops {
  min-width: 780px;
}

.queue-table th,
.queue-table td {
  padding: 0.9rem 0.95rem;
  border-bottom: 1px solid #f0e6d4;
  text-align: left;
  vertical-align: middle;
}

.queue-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #fbf5ea;
  color: #735f43;
  font-size: 0.8rem;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.queue-table tbody tr {
  cursor: pointer;
  transition: background 0.18s ease;
}

.queue-table tbody tr:hover {
  background: #fff8eb;
}

.queue-table tbody tr.is-selected {
  background: #fff1cf;
}

.queue-table tbody tr:last-child td {
  border-bottom: 0;
}

.table-primary {
  display: grid;
  gap: 0.2rem;
}

.table-primary small,
.detail-cell {
  color: #6e6250;
}

.status-chip,
.badge,
.mini-alert,
.alert-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 1.95rem;
  padding: 0 0.8rem;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
}

.badge-muted,
.chip-neutral {
  background: rgba(17, 17, 17, 0.05);
  border-color: rgba(17, 17, 17, 0.08);
  color: #4b5563;
}

.chip-warning,
.mini-alert {
  background: rgba(232, 180, 63, 0.14);
  border-color: rgba(232, 180, 63, 0.24);
  color: #99640a;
}

.chip-success {
  background: rgba(39, 153, 97, 0.14);
  border-color: rgba(39, 153, 97, 0.24);
  color: #17613d;
}

.chip-danger,
.alert-pill {
  background: rgba(201, 73, 73, 0.12);
  border-color: rgba(201, 73, 73, 0.22);
  color: #922c2c;
}

.chip-info {
  background: rgba(54, 115, 215, 0.12);
  border-color: rgba(54, 115, 215, 0.22);
  color: #224c9d;
}

.status-stack,
.status-stack-inline,
.action-mode-strip,
.alerts-stack,
.row-action-pack {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.row-action-pack {
  align-items: center;
}

.info-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.info-card,
.detail-block {
  padding: 0.95rem 1rem;
}

.info-card--wide {
  grid-column: 1 / -1;
}

.detail-block {
  display: grid;
  gap: 0.85rem;
}

.detail-block--compact {
  gap: 0.7rem;
  padding: 1rem 1.05rem;
}

.section-mini-head {
  display: grid;
  gap: 0.3rem;
}

input,
select,
textarea,
.compact-field {
  width: 100%;
  min-height: 2.7rem;
  border: 1px solid #dccfb9;
  border-radius: 14px;
  background: #fff;
  color: #111;
  padding: 0 0.85rem;
}

textarea {
  padding: 0.8rem;
  resize: vertical;
}

.compact-field {
  min-width: 11rem;
  min-height: 2.45rem;
  border-radius: 12px;
  padding: 0 0.7rem;
}

.primary-action,
.ghost-button {
  min-height: 2.75rem;
  padding: 0 1rem;
  border-radius: 14px;
  cursor: pointer;
}

.primary-action {
  border: 1px solid #111;
  background: #111;
  color: #fff;
}

.ghost-button {
  border: 1px solid #dccfb9;
  background: #fffdfa;
  color: #2e2a22;
}

.ghost-button--soft {
  background: #fffdfa;
}

.ghost-button--neutral {
  background: #f8f4eb;
}

.ghost-button--warning {
  border-color: rgba(232, 180, 63, 0.3);
  background: rgba(255, 242, 214, 0.8);
  color: #99640a;
}

.ghost-button--danger {
  border-color: rgba(201, 73, 73, 0.28);
  background: rgba(255, 236, 236, 0.86);
  color: #9a2e2e;
}

.ghost-button--active {
  border-color: #c28a12;
  background: #fff1cf;
}

.ghost-button--sm,
.primary-action--sm {
  min-height: 2.35rem;
  padding: 0 0.85rem;
  border-radius: 12px;
}

.detail-actions {
  flex-wrap: wrap;
  margin-top: 0.5rem;
  padding-top: 0.25rem;
  background: transparent;
}

.detail-actions .ghost-button,
.detail-actions .primary-action {
  flex: 1 1 140px;
}

.detail-actions--review .primary-action--approve {
  background: linear-gradient(180deg, #1a1a1a 0%, #111 100%);
  border-color: #111;
}

.detail-actions--panel {
  margin-top: 0.25rem;
}

.inline-error {
  margin: 0;
  color: #a13030;
  font-size: 0.84rem;
  font-weight: 600;
}

.field--error input,
.field--error select,
.field--error textarea {
  border-color: #c95b5b;
  box-shadow: 0 0 0 1px rgba(201, 91, 91, 0.16);
}

.field--error span {
  color: #a13030;
}

.detail-actions-menu {
  position: relative;
  flex: 1 1 180px;
}

.detail-actions-menu summary {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 2.75rem;
  padding: 0 1rem;
  border: 1px solid #dccfb9;
  border-radius: 14px;
  background: #f8f4eb;
  color: #2e2a22;
  cursor: pointer;
  list-style: none;
  font-weight: 600;
}

.detail-actions-menu summary::-webkit-details-marker {
  display: none;
}

.detail-actions-menu[open] summary {
  border-color: #c28a12;
  background: #fff7e7;
}

.detail-actions-menu__panel {
  position: absolute;
  right: 0;
  bottom: calc(100% + 0.6rem);
  display: grid;
  gap: 0.55rem;
  min-width: 240px;
  padding: 0.75rem;
  border: 1px solid #eadfc9;
  border-radius: 18px;
  background: rgba(255, 253, 249, 0.98);
  box-shadow: 0 20px 48px rgba(33, 25, 16, 0.14);
}

.detail-actions-menu__panel .ghost-button {
  width: 100%;
}

.empty-state,
.empty-shell {
  color: #6e6250;
}

.empty-shell {
  display: grid;
  gap: 0.4rem;
  align-content: start;
  min-height: 14rem;
}

@media (max-width: 1280px) {
  .workspace-grid,
  .workspace-grid--assigned,
  .hero-metrics {
    grid-template-columns: 1fr;
  }

  .detail-panel--sticky {
    position: static;
    max-height: none;
  }
}

@media (max-width: 720px) {
  .filters-shell {
    grid-template-columns: 1fr;
    overflow-x: visible;
  }

  .hero-card,
  .section-head,
  .table-head,
  .detail-actions,
  .workspace-head {
    flex-direction: column;
    align-items: stretch;
  }

  .tabs-strip {
    width: 100%;
  }

  .tab-button {
    justify-content: space-between;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }

  .detail-hero-card,
  .detail-kpi-grid {
    grid-template-columns: 1fr;
  }

  .detail-hero-card__chips {
    justify-content: flex-start;
  }

  .summary-strip,
  .record-grid {
    grid-template-columns: 1fr;
  }

  .audit-card {
    grid-template-columns: 1fr;
  }

  .audit-card__head {
    grid-template-columns: 1fr;
  }

  .audit-card__action {
    justify-items: start;
  }

  .detail-modal-backdrop {
    padding: 0;
  }

  .detail-modal {
    width: 100vw;
    height: 100vh;
    min-height: 100vh;
    max-height: 100vh;
    border-radius: 0;
  }

  .detail-head {
    border-radius: 0;
  }

  .detail-actions-menu {
    width: 100%;
  }

  .detail-actions-menu__panel {
    position: static;
    min-width: 0;
    margin-top: 0.6rem;
  }
}
</style>
