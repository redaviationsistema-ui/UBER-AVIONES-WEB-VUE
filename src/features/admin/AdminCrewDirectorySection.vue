<script setup>
import { computed, reactive, ref, watch } from 'vue'
import AdminCrewDirectoryAuditView from './crew-directory/AdminCrewDirectoryAuditView.vue'
import AdminCrewDirectoryDetailView from './crew-directory/AdminCrewDirectoryDetailView.vue'
import AdminCrewDirectoryFilters from './crew-directory/AdminCrewDirectoryFilters.vue'
import AdminCrewDirectoryHeader from './crew-directory/AdminCrewDirectoryHeader.vue'
import AdminCrewDirectoryListView from './crew-directory/AdminCrewDirectoryListView.vue'
import {
  buildCrewAlerts,
  certificationLabel,
  includesAny,
  normalizeOperationalState,
  normalizeToken,
} from './crew-directory/crewDirectoryShared'

const props = defineProps({
  crewMembers: { type: Array, required: true },
  operations: { type: Array, required: true },
  auditEntries: { type: Array, required: true },
})

const emit = defineEmits(['approve-crew', 'reject-crew', 'suspend-crew', 'audit-crew'])

const activeView = ref('directory')
const selectedCrewId = ref(null)
const notesByCrewId = reactive({})
const filters = reactive({
  searchTerm: '',
  statusFilter: 'all',
  baseFilter: 'all',
  providerFilter: 'all',
  certificationFilter: 'all',
  availabilityFilter: 'all',
})

const pendingValidationTokens = ['pend', 'revision', 'cambio', 'valid']

function crewOperation(member = {}) {
  return props.operations.find((operation) => {
    const byId = String(operation.crewId || '').trim()
    const byName = normalizeToken(operation.crew || '')
    return byId === String(member.id || '').trim() || byName === normalizeToken(member.name || '')
  }) || null
}

function crewValidationState(member = {}) {
  return member.profileState || member.validationStatus || ''
}

function crewOperationalState(member = {}) {
  return normalizeOperationalState(member.state || member.operationalState || '')
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

function matchesSearch(candidate = {}) {
  const query = normalizeToken(filters.searchTerm)
  if (!query) return true

  const haystack = normalizeToken([
    candidate.name,
    candidate.providerName,
    candidate.base,
    candidate.certifications,
    candidate.documentsSummary,
    candidate.state,
    candidate.profileState,
  ].join(' '))

  return haystack.includes(query)
}

const normalizedCrewMembers = computed(() =>
  props.crewMembers.map((member) => {
    const linkedOperation = crewOperation(member)
    const alerts = buildCrewAlerts(member, {
      isPendingValidation: isCrewPendingValidation,
      isSuspended: isCrewSuspended,
      isAssigned: isCrewAssigned,
      isApproved: isCrewApproved,
    })

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
      if (filters.statusFilter === 'pending') return member.isPendingValidation
      if (filters.statusFilter === 'approved') return member.isApproved && !member.isAssigned
      if (filters.statusFilter === 'assigned') return member.isAssigned
      if (filters.statusFilter === 'suspended') return member.isSuspended
      if (filters.statusFilter === 'alerts') return member.alertsCount > 0
      return true
    })
    .filter((member) => (filters.baseFilter === 'all' ? true : String(member.base || '').trim() === filters.baseFilter))
    .filter((member) =>
      filters.providerFilter === 'all' ? true : String(member.providerName || '').trim() === filters.providerFilter,
    )
    .filter((member) => {
      if (filters.certificationFilter === 'all') return true
      if (filters.certificationFilter === 'expired') return normalizeToken(member.certificationStatus).includes('venc')
      if (filters.certificationFilter === 'incomplete') return includesAny(member.certificationStatus, ['incompleto', 'sin expediente', 'pend'])
      if (filters.certificationFilter === 'complete') return includesAny(member.certificationStatus, ['completo', 'vigent'])
      return true
    })
    .filter((member) => {
      if (filters.availabilityFilter === 'all') return true
      if (filters.availabilityFilter === 'available') return member.isAvailableToday
      if (filters.availabilityFilter === 'assigned') return member.isAssigned
      if (filters.availabilityFilter === 'unavailable') return !member.isAvailableToday
      return true
    })
    .sort((left, right) => {
      if (left.alertsCount !== right.alertsCount) return right.alertsCount - left.alertsCount
      if (left.isPendingValidation !== right.isPendingValidation) return left.isPendingValidation ? -1 : 1
      return String(left.name || '').localeCompare(String(right.name || ''))
    }),
)

const validationQueue = computed(() => filteredCrewMembers.value.filter((member) => member.isPendingValidation || member.alertsCount > 0 || !member.isApproved))
const availableQueue = computed(() => filteredCrewMembers.value.filter((member) => member.isAvailableToday))

const selectedCrew = computed(
  () => filteredCrewMembers.value.find((member) => member.id === selectedCrewId.value) || filteredCrewMembers.value[0] || null,
)

const activeItems = computed(() => {
  if (activeView.value === 'validation') return validationQueue.value
  if (activeView.value === 'available') return availableQueue.value
  return filteredCrewMembers.value
})

const views = computed(() => [
  { id: 'directory', label: 'Directorio', count: filteredCrewMembers.value.length },
  { id: 'validation', label: 'Validacion', count: validationQueue.value.length },
  { id: 'available', label: 'Disponibles', count: availableQueue.value.length },
  { id: 'audit', label: 'Bitacora', count: props.auditEntries.length },
])

const summaryCards = computed(() => [
  { label: 'Pendientes de validar', value: validationQueue.value.length, tone: 'warning' },
  { label: 'Disponibles hoy', value: availableQueue.value.length, tone: 'success' },
  { label: 'Asignados a vuelo', value: normalizedCrewMembers.value.filter((item) => item.isAssigned).length, tone: 'info' },
  { label: 'Con alerta', value: normalizedCrewMembers.value.filter((item) => item.alertsCount > 0).length, tone: 'danger' },
])

watch(
  filteredCrewMembers,
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

const selectedNote = computed({
  get() {
    if (!selectedCrew.value) return ''
    return notesByCrewId[selectedCrew.value.id] || ''
  },
  set(value) {
    if (!selectedCrew.value) return
    notesByCrewId[selectedCrew.value.id] = value
  },
})

function emitCrewAction(type) {
  if (!selectedCrew.value) return

  const payload = {
    member: selectedCrew.value,
    note: notesByCrewId[selectedCrew.value.id] || '',
  }

  if (type === 'approve') emit('approve-crew', payload)
  if (type === 'reject') emit('reject-crew', payload)
  if (type === 'suspend') emit('suspend-crew', payload)
  if (type === 'audit') emit('audit-crew', payload)
}
</script>

<template>
  <section class="directory-shell">
    <AdminCrewDirectoryHeader
      :active-view="activeView"
      :views="views"
      :summary-cards="summaryCards"
      @change-view="activeView = $event"
    />

    <AdminCrewDirectoryFilters
      v-if="activeView !== 'audit'"
      :filters="filters"
      :status-options="statusOptions"
      :base-options="baseOptions"
      :provider-options="providerOptions"
    />

    <AdminCrewDirectoryAuditView v-if="activeView === 'audit'" :entries="auditEntries" />

    <div v-else class="workspace-grid">
      <AdminCrewDirectoryListView
        :title="activeView === 'validation' ? 'Bandeja de validacion' : activeView === 'available' ? 'Sobrecargos disponibles' : 'Directorio general'"
        :eyebrow="activeView === 'validation' ? 'Validacion' : activeView === 'available' ? 'Disponibles' : 'Directorio'"
        :items="activeItems"
        :selected-crew-id="selectedCrewId"
        @select="selectedCrewId = $event"
      />

      <AdminCrewDirectoryDetailView
        :member="selectedCrew"
        v-model:note="selectedNote"
        @approve="emitCrewAction('approve')"
        @reject="emitCrewAction('reject')"
        @suspend="emitCrewAction('suspend')"
        @audit="emitCrewAction('audit')"
      />
    </div>
  </section>
</template>

<style scoped>
.directory-shell {
  display: grid;
  gap: 1.2rem;
}

.workspace-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1.55fr) minmax(320px, 0.9fr);
}

@media (max-width: 1100px) {
  .workspace-grid {
    grid-template-columns: 1fr;
  }
}
</style>
