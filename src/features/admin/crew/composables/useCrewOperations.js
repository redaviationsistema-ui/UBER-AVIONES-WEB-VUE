import { computed, reactive, ref, watch } from 'vue'
import { fetchAvailableCrewByRange } from '../../../../services/disponibilidadService'
import {
  buildCrewAlerts,
  certificationTone,
  formatShortDate,
  humanizeStatus,
  normalizeToken,
  toneClass,
} from '../../crew-directory/crewDirectoryShared'
import { isActiveFlightOperation, resolveOperationFlightStatus } from '../constants/flightStatuses'
import {
  availabilityQueryKey,
  buildCrewAssignmentPayload,
  buildNormalizedCrewMember,
  buildOperationStatusBucket,
  buildPresentationPlaceValue,
  canAssignCrew,
  hasCrewAssignmentRecord,
  isCrewReadyForOperation,
  isOperationClosed,
  operationDateRange,
  operationAssignmentBadgeLabel,
  resolveCrewAssignmentStatus,
  operationDisplayClient,
  operationDisplayCrew,
  operationCrewStateLabel,
  operationDisplayState,
  operationFlightBase,
  operationIncidentLabel,
  operationPresentationPlace,
  operationPresentationTime,
  operationProviderName,
  resolvePresentationPlaceDraft,
} from '../services/crewOperations.service'

export function useCrewOperations(props, { viewMode = 'operations' } = {}) {
  const activeTab = ref('operations')
  const selectedOperationId = ref(null)
  const selectedAuditId = ref(null)
  const searchTerm = ref('')
  const operationStatusFilter = ref('all')
  const assignmentFilter = ref('all')
  const baseFilter = ref('all')
  const providerFilter = ref('all')
  const assignmentDrafts = reactive({})
  const assignmentErrors = reactive({})
  const availableCrewCache = reactive({})
  const availableCrewLookupAttempted = reactive({})
  const availableCrewErrors = reactive({})
  const loadingAvailableCrew = reactive({})

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

  const normalizedCrewMembers = computed(() =>
    props.crewMembers.map((member) => {
      const linkedOperation = crewOperation(member)
      const normalizedMember = buildNormalizedCrewMember(member, linkedOperation)
      const alerts = buildCrewAlerts(member, {
        isPendingValidation: () => normalizedMember.isPendingValidation,
        isSuspended: () => normalizedMember.isSuspended,
        isAssigned: () => normalizedMember.isAssigned,
        isApproved: () => normalizedMember.isApproved,
      })

      return {
        ...normalizedMember,
        alerts,
        alertsCount: alerts.length,
      }
    }),
  )

  function linkedCrewForOperation(operation = {}) {
    const byId = normalizedCrewLookup.value.get(`id:${String(operation.crewId || '').trim()}`)
    if (byId) {
      return normalizedCrewMembers.value.find((member) => Number(member.id || 0) === Number(byId.id || 0)) || byId
    }
    const byName = normalizedCrewLookup.value.get(`name:${normalizeToken(operation.crew || '')}`)
    if (byName) {
      return normalizedCrewMembers.value.find((member) => Number(member.id || 0) === Number(byName.id || 0)) || byName
    }
    return null
  }

  const baseOptions = computed(() => [
    'all',
    ...new Set(
      props.operations
        .map((operation) => operationFlightBase(operation))
        .filter(Boolean),
    ),
  ])

  const providerOptions = computed(() => [
    'all',
    ...new Set(
      props.operations
        .map((operation) => operationProviderName(operation))
        .filter(Boolean),
    ),
  ])

  const statusOptions = [
    { value: 'all', label: 'Estado' },
    { value: 'pending', label: 'Pendientes' },
    { value: 'confirmed', label: 'Confirmados' },
    { value: 'assigned', label: 'Asignados' },
    { value: 'tracking', label: 'Activos' },
    { value: 'completed', label: 'Finalizados' },
    { value: 'cancelled', label: 'Cancelados' },
  ]

  const filteredOperations = computed(() => {
    const query = normalizeToken(searchTerm.value)

    return [...props.operations]
      .filter((operation) => {
        if (query) {
          const haystack = normalizeToken([
            operation.folio,
            operation.route,
            operation.aircraft,
            operation.crew,
            operation.clientName,
            operation.origin,
            operation.destination,
            operationProviderName(operation),
            operationPresentationPlace(operation),
            resolveOperationFlightStatus(operation),
          ].join(' '))

          if (!haystack.includes(query)) return false
        }

        if (operationStatusFilter.value !== 'all' && buildOperationStatusBucket(operation) !== operationStatusFilter.value) {
          return false
        }

        if (assignmentFilter.value === 'assigned' && !hasCrewAssignmentRecord(operation)) {
          return false
        }

        if (assignmentFilter.value === 'unassigned' && hasCrewAssignmentRecord(operation)) {
          return false
        }

        if (baseFilter.value !== 'all' && operationFlightBase(operation) !== baseFilter.value) {
          return false
        }

        if (providerFilter.value !== 'all' && operationProviderName(operation) !== providerFilter.value) {
          return false
        }

        if (viewMode === 'in-flight' && !isActiveFlightOperation(operation)) {
          return false
        }

        return true
      })
      .sort((left, right) => {
        if (viewMode === 'in-flight') {
          return String(left.departure || '').localeCompare(String(right.departure || ''))
        }

        const leftActive = isActiveFlightOperation(left) ? 0 : 1
        const rightActive = isActiveFlightOperation(right) ? 0 : 1
        if (leftActive !== rightActive) return leftActive - rightActive

        const leftAssigned = hasCrewAssignmentRecord(left) ? 0 : 1
        const rightAssigned = hasCrewAssignmentRecord(right) ? 0 : 1
        if (leftAssigned !== rightAssigned) return leftAssigned - rightAssigned

        return String(right.departure || '').localeCompare(String(left.departure || ''))
      })
  })

  const summaryCards = computed(() => [
    {
      label: viewMode === 'in-flight' ? 'Vuelos activos' : 'Operaciones visibles',
      value: filteredOperations.value.length,
      detail: viewMode === 'in-flight' ? 'Operaciones realmente activas segun estado.' : 'Mesa operativa con filtros aplicados.',
    },
    {
      label: 'Con sobrecargo',
      value: filteredOperations.value.filter((item) => hasCrewAssignmentRecord(item)).length,
      detail: 'Operaciones que hoy ya cuentan con asignacion.',
    },
    {
      label: 'Sin asignar',
      value: filteredOperations.value.filter((item) => !hasCrewAssignmentRecord(item)).length,
      detail: 'Vuelos que todavia requieren sobrecargo.',
    },
    {
      label: 'Incidencias',
      value: filteredOperations.value.filter((item) => Number(item.incidentsCount || 0) > 0).length,
      detail: 'Vuelos con alertas o incidencias registradas.',
    },
  ])

  const auditQueue = computed(() => {
    const query = normalizeToken(searchTerm.value)

    return props.auditEntries.filter((entry) => {
      if (!query) return true
      return normalizeToken(`${entry.title || ''} ${entry.detail || ''} ${entry.date || ''}`).includes(query)
    })
  })

  const selectedOperation = computed(
    () => filteredOperations.value.find((operation) => operation.id === selectedOperationId.value) || filteredOperations.value[0] || null,
  )

  const selectedAuditEntry = computed(
    () => auditQueue.value.find((entry) => entry.id === selectedAuditId.value) || auditQueue.value[0] || null,
  )

  watch(
    () => props.operations,
    (operations) => {
      operations.forEach((operation) => {
        const existingCrewId = String(operation.crewId || '').trim()
        const existingCrewNote = String(operation.crewNotes || operation.raw?.operation?.crew_notes || operation.notes || '').trim()

        if (!assignmentDrafts[operation.id]) {
          const placeDraft = resolvePresentationPlaceDraft(operation)
          assignmentDrafts[operation.id] = {
            crewId: operation.crewId || '',
            note: existingCrewNote,
            presentationTime: operationPresentationTime(operation),
            presentationPlaceType: placeDraft.presentationPlaceType,
            presentationPlaceDetail: placeDraft.presentationPlaceDetail,
          }
          return
        }

        if (!String(assignmentDrafts[operation.id].crewId || '').trim() && existingCrewId) {
          assignmentDrafts[operation.id].crewId = operation.crewId
        }
        if (!String(assignmentDrafts[operation.id].note || '').trim() && existingCrewNote) {
          assignmentDrafts[operation.id].note = existingCrewNote
        }
        if (!assignmentDrafts[operation.id].presentationTime) {
          assignmentDrafts[operation.id].presentationTime = operationPresentationTime(operation)
        }
        if (!assignmentDrafts[operation.id].presentationPlaceDetail) {
          const placeDraft = resolvePresentationPlaceDraft(operation)
          assignmentDrafts[operation.id].presentationPlaceType ||= placeDraft.presentationPlaceType
          assignmentDrafts[operation.id].presentationPlaceDetail ||= placeDraft.presentationPlaceDetail
        }
      })
    },
    { immediate: true },
  )

  watch(
    filteredOperations,
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
    auditQueue,
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

  function updateDraft(operationId, key, value) {
    getDraft(operationId)[key] = value
  }

  function clearAssignmentError(operationId) {
    assignmentErrors[operationId] = ''
  }

  function selectedDraftCrew(operation = {}) {
    const draft = getDraft(operation.id)
    return normalizedCrewMembers.value.find((item) => Number(item.id || 0) === Number(draft.crewId || 0)) || null
  }

  function isCrewAssignableToOperation(member = {}, operation = {}) {
    const validationState = normalizeToken(member.validationState || member.profileState || '')
    const operationalState = member.operationalState || ''
    const hasExplicitValidationState = Boolean(validationState)
    const hasBlockedValidationState =
      validationState.includes('rech') ||
      validationState.includes('pend') ||
      validationState.includes('suspend')

    if (hasBlockedValidationState || member.isSuspended) return false
    if (hasExplicitValidationState && !member.isApproved) return false
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
    const lookupAttempted = availableCrewLookupAttempted[cacheKey] === true
    const cached = Array.isArray(availableCrewCache[cacheKey]) ? availableCrewCache[cacheKey] : []

    if (lookupAttempted) {
      const allowedIds = new Set(cached.map((member) => Number(member.id || 0)).filter(Boolean))
      return normalizedCrewMembers.value.filter(
        (member) => allowedIds.has(Number(member.id || 0)) && isCrewAssignableToOperation(member, operation),
      )
    }

    return normalizedCrewMembers.value.filter((member) => isCrewAssignableToOperation(member, operation))
  }

  async function ensureAvailableCrewForOperation(operation = {}) {
    const range = operationDateRange(operation)
    const cacheKey = availabilityQueryKey(operation)
    if (!range.from || loadingAvailableCrew[cacheKey]) return
    if (availableCrewLookupAttempted[cacheKey] === true && !availableCrewErrors[cacheKey]) return

    availableCrewLookupAttempted[cacheKey] = true
    availableCrewErrors[cacheKey] = ''
    loadingAvailableCrew[cacheKey] = true
    try {
      availableCrewCache[cacheKey] = await fetchAvailableCrewByRange({
        from: range.from,
        to: range.to,
        base: operationFlightBase(operation),
      })
    } catch (error) {
      delete availableCrewCache[cacheKey]
      availableCrewErrors[cacheKey] = error?.message || 'No fue posible consultar disponibilidad'
    } finally {
      loadingAvailableCrew[cacheKey] = false
    }
  }

  function isLoadingAvailableCrewForOperation(operation = {}) {
    return loadingAvailableCrew[availabilityQueryKey(operation)] === true
  }

  function availableCrewState(operation = {}) {
    const cacheKey = availabilityQueryKey(operation)
    const base = operationFlightBase(operation)
    const assignableCrew = assignableCrewMembers(operation)

    if (loadingAvailableCrew[cacheKey]) {
      return {
        kind: 'loading',
        message: 'Consultando disponibilidad...',
        disableSelect: true,
      }
    }

    if (availableCrewErrors[cacheKey]) {
      return {
        kind: 'error',
        message: 'No fue posible consultar disponibilidad',
        disableSelect: false,
      }
    }

    if (availableCrewLookupAttempted[cacheKey] === true && !assignableCrew.length) {
      return {
        kind: 'empty',
        message: `No hay sobrecargos disponibles para ${base || 'esta operacion'}`,
        disableSelect: true,
      }
    }

    return {
      kind: 'idle',
      message: 'Selecciona sobrecargo',
      disableSelect: false,
    }
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

  function assignmentPayloadFor(operation = {}) {
    const draft = getDraft(operation.id)
    const member = selectedDraftCrew(operation)
    if (!member) return null
    return buildCrewAssignmentPayload({ operation, member, draft })
  }

  function updateOperationLocalState(operationId, patch = {}) {
    const operation = props.operations.find((item) => Number(item.id || 0) === Number(operationId || 0))
    if (!operation) return

    Object.assign(operation, patch)
    if (patch.presentationPlaceType || patch.presentationPlaceDetail) {
      operation.presentationPlace = buildPresentationPlaceValue(
        patch.presentationPlaceType || getDraft(operationId).presentationPlaceType,
        patch.presentationPlaceDetail || getDraft(operationId).presentationPlaceDetail,
        operation.presentationPlace || operation.origin || '',
      )
    }
  }

  return {
    activeTab,
    selectedOperationId,
    selectedAuditId,
    searchTerm,
    operationStatusFilter,
    assignmentFilter,
    baseFilter,
    providerFilter,
    baseOptions,
    providerOptions,
    statusOptions,
    summaryCards,
    filteredOperations,
    selectedOperation,
    selectedAuditEntry,
    auditQueue,
    assignmentErrors,
    loadingAvailableCrew,
    getDraft,
    updateDraft,
    clearAssignmentError,
    selectedDraftCrew,
    assignableCrewMembers,
    ensureAvailableCrewForOperation,
    isLoadingAvailableCrewForOperation,
    availableCrewState,
    validateAssignmentDraft,
    assignmentPayloadFor,
    updateOperationLocalState,
    toneClass,
    humanizeStatus,
    certificationTone,
    formatShortDate,
    operationDisplayClient,
    operationDisplayCrew,
    operationCrewStateLabel,
    operationAssignmentBadgeLabel,
    operationDisplayState,
    operationIncidentLabel,
    resolveCrewAssignmentStatus,
    hasCrewAssignmentRecord,
    isCrewReadyForOperation,
    canAssignCrew,
    isOperationClosed,
    linkedCrewForOperation,
    isActiveFlightOperation,
  }
}
