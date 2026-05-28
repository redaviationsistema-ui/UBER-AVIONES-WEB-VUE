<script setup>
import { computed, reactive, ref, watch } from 'vue'

const props = defineProps({
  crewMembers: { type: Array, required: true },
  operations: { type: Array, required: true },
  auditEntries: { type: Array, required: true },
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
const validationNotes = reactive({})
const assignmentDrafts = reactive({})

const validationStates = ['Pendiente', 'En revision', 'Requiere cambios']

const pendingValidation = computed(() =>
  props.crewMembers.filter((member) =>
    validationStates.includes(member.profileState || member.validationStatus),
  ),
)

const approvedCrew = computed(() =>
  props.crewMembers.filter((member) => {
    const validationState = String(
      member.profileState || member.validationStatus || '',
    ).toLowerCase()
    const operationalState = String(member.state || '').toLowerCase()
    return validationState.includes('aprob') && !operationalState.includes('suspend')
  }),
)

const sortedCrewMembers = computed(() =>
  [...props.crewMembers].sort((left, right) => {
    const leftPending = pendingValidation.value.some((member) => member.id === left.id) ? 0 : 1
    const rightPending = pendingValidation.value.some((member) => member.id === right.id) ? 0 : 1
    if (leftPending !== rightPending) return leftPending - rightPending
    return String(left.name || '').localeCompare(String(right.name || ''))
  }),
)

const sortedOperations = computed(() =>
  [...props.operations].sort((left, right) => Number(right.id || 0) - Number(left.id || 0)),
)

const selectedCrew = computed(
  () =>
    sortedCrewMembers.value.find((member) => member.id === selectedCrewId.value) ||
    sortedCrewMembers.value[0] ||
    null,
)

const selectedOperation = computed(
  () =>
    sortedOperations.value.find((operation) => operation.id === selectedOperationId.value) ||
    sortedOperations.value[0] ||
    null,
)

const selectedAuditEntry = computed(
  () =>
    props.auditEntries.find((entry) => entry.id === selectedAuditId.value) ||
    props.auditEntries[0] ||
    null,
)

const summaryCards = computed(() => [
  { label: 'Pendientes', value: pendingValidation.value.length, tone: 'warning' },
  { label: 'Aprobados', value: approvedCrew.value.length, tone: 'success' },
  { label: 'Operaciones', value: props.operations.length, tone: 'info' },
  { label: 'Auditorias', value: props.auditEntries.length, tone: 'neutral' },
])

const tabs = computed(() => [
  { id: 'validation', label: 'Validacion', count: sortedCrewMembers.value.length },
  { id: 'assignment', label: 'Asignacion', count: sortedOperations.value.length },
  { id: 'audit', label: 'Auditoria', count: props.auditEntries.length },
])

watch(
  () => props.operations,
  (operations) => {
    operations.forEach((operation) => {
      if (!assignmentDrafts[operation.id]) {
        assignmentDrafts[operation.id] = {
          crewId: operation.crewId || '',
          note: '',
        }
      }
    })
  },
  { immediate: true },
)

watch(
  () => sortedCrewMembers.value,
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
  () => sortedOperations.value,
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
  () => props.auditEntries,
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
    assignmentDrafts[operationId] = { crewId: '', note: '' }
  }
  return assignmentDrafts[operationId]
}

function submitAssignment(operationId) {
  const draft = getDraft(operationId)
  emit('assign-crew', {
    operationId,
    crewId: Number(draft.crewId || 0),
    note: draft.note || '',
  })
}

function normalizeToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
}

function toneClass(value = '') {
  const normalized = normalizeToken(value)

  if (
    normalized.includes('pend') ||
    normalized.includes('revision') ||
    normalized.includes('cambios') ||
    normalized.includes('venc')
  ) {
    return 'chip-warning'
  }

  if (
    normalized.includes('aprob') ||
    normalized.includes('confirm') ||
    normalized.includes('completa')
  ) {
    return 'chip-success'
  }

  if (
    normalized.includes('rech') ||
    normalized.includes('suspend') ||
    normalized.includes('problema')
  ) {
    return 'chip-danger'
  }

  if (
    normalized.includes('asignad') ||
    normalized.includes('active') ||
    normalized.includes('servicio')
  ) {
    return 'chip-info'
  }

  return 'chip-neutral'
}

function documentsTone(value = '') {
  const normalized = normalizeToken(value)
  if (normalized.includes('pend') || normalized.includes('venc')) return 'chip-danger'
  if (normalized.includes('complet')) return 'chip-success'
  return 'chip-neutral'
}

function certificationLabel(member) {
  const raw = member.certifications || member.documentsSummary || ''
  const normalized = normalizeToken(raw)

  if (!normalized) return 'No visibles'
  if (normalized.includes('venc')) return 'Vencidas'
  if (normalized.includes('complet')) return 'Completas'
  if (normalized.includes('pend')) return 'Pendientes'
  return raw
}

function formatDate(value) {
  if (!value) return 'Por definir'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function openCrew(memberId) {
  selectedCrewId.value = memberId
  activeTab.value = 'validation'
}

function openOperation(operationId) {
  selectedOperationId.value = operationId
  activeTab.value = 'assignment'
}

function openAudit(entryId) {
  selectedAuditId.value = entryId
  activeTab.value = 'audit'
}
</script>

<template>
  <section class="crew-admin-page">
    <article class="surface hero-card">
      <div class="hero-copy">
        <p class="eyebrow">Sobrecargos</p>
        <h2>Cola operativa de validacion, asignacion y auditoria</h2>
        <p class="muted">
          Admin centraliza la revision de expedientes, la asignacion por vuelo y la bitacora en una
          sola mesa compacta.
        </p>
      </div>

      <div class="hero-metrics">
        <article
          v-for="card in summaryCards"
          :key="card.label"
          class="metric-card"
          :class="`metric-card--${card.tone}`"
        >
          <span>{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
        </article>
      </div>
    </article>

    <article class="surface section-card workspace-card">
      <div class="section-head workspace-head">
        <div>
          <p class="eyebrow">Centro de control</p>
          <h3>Sobrecargos</h3>
        </div>

        <div class="tabs-strip" role="tablist" aria-label="Procesos de sobrecargos">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            class="tab-button"
            :class="{ 'tab-button--active': activeTab === tab.id }"
            :aria-selected="activeTab === tab.id"
            @click="activeTab = tab.id"
          >
            <span>{{ tab.label }}</span>
            <strong>{{ tab.count }}</strong>
          </button>
        </div>
      </div>

      <div class="workspace-grid">
        <div class="queue-panel">
          <div v-if="activeTab === 'validation'" class="table-shell">
            <div class="table-head">
              <div>
                <p class="eyebrow">Validacion</p>
                <h4>Cola de sobrecargos pendientes</h4>
              </div>
              <span class="badge badge-muted">{{ pendingValidation.length }} pendientes</span>
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
                    <th>Accion</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="member in sortedCrewMembers"
                    :key="member.id"
                    :class="{ 'is-selected': member.id === selectedCrew?.id }"
                    @click="openCrew(member.id)"
                  >
                    <td>
                      <div class="table-primary">
                        <strong>{{ member.name }}</strong>
                        <small>{{ member.base || 'Base por definir' }}</small>
                      </div>
                    </td>
                    <td>{{ member.providerName || 'Sin ligar' }}</td>
                    <td>
                      <span
                        class="status-chip"
                        :class="toneClass(member.profileState || member.validationStatus)"
                      >
                        {{ member.profileState || member.validationStatus || 'Pendiente' }}
                      </span>
                    </td>
                    <td>
                      <span
                        class="status-chip"
                        :class="documentsTone(member.certifications || member.documentsSummary)"
                      >
                        {{ certificationLabel(member) }}
                      </span>
                    </td>
                    <td>{{ member.rating || 'N/D' }}</td>
                    <td>
                      <button
                        type="button"
                        class="ghost-button ghost-button--sm"
                        @click.stop="openCrew(member.id)"
                      >
                        Revisar
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p v-if="!sortedCrewMembers.length" class="empty-state">
              No hay sobrecargos cargados en esta vista.
            </p>
          </div>

          <div v-else-if="activeTab === 'assignment'" class="table-shell">
            <div class="table-head">
              <div>
                <p class="eyebrow">Asignacion</p>
                <h4>Operaciones que requieren sobrecargo</h4>
              </div>
              <span class="badge badge-muted">{{ operations.length }} operaciones</span>
            </div>

            <div class="table-wrap">
              <table class="queue-table queue-table--ops">
                <thead>
                  <tr>
                    <th>Operacion</th>
                    <th>Ruta</th>
                    <th>Aeronave</th>
                    <th>Fecha</th>
                    <th>Pago</th>
                    <th>Sobrecargo</th>
                    <th>Nota</th>
                    <th>Accion</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="operation in sortedOperations"
                    :key="operation.id"
                    :class="{ 'is-selected': operation.id === selectedOperation?.id }"
                    @click="openOperation(operation.id)"
                  >
                    <td>
                      <div class="table-primary">
                        <strong>#{{ operation.id }}</strong>
                        <small>{{ operation.crew || 'Sin asignar' }}</small>
                      </div>
                    </td>
                    <td>{{ operation.route }}</td>
                    <td>{{ operation.aircraft }}</td>
                    <td>{{ formatDate(operation.departure) }}</td>
                    <td>
                      <span class="status-chip" :class="toneClass(operation.status)">
                        {{ operation.status }}
                      </span>
                    </td>
                    <td @click.stop>
                      <select v-model="getDraft(operation.id).crewId" class="compact-field">
                        <option value="">Selecciona</option>
                        <option v-for="member in approvedCrew" :key="member.id" :value="member.id">
                          {{ member.name }}
                        </option>
                      </select>
                    </td>
                    <td @click.stop>
                      <input
                        v-model="getDraft(operation.id).note"
                        class="compact-field"
                        type="text"
                        placeholder="Briefing, VIP, SLA..."
                      />
                    </td>
                    <td @click.stop>
                      <button
                        type="button"
                        class="primary-action primary-action--sm"
                        @click="submitAssignment(operation.id)"
                      >
                        Asignar
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p v-if="!sortedOperations.length" class="empty-state">
              No hay operaciones pendientes de asignacion.
            </p>
          </div>

          <div v-else class="table-shell">
            <div class="table-head">
              <div>
                <p class="eyebrow">Auditoria</p>
                <h4>Bitacora de cambios</h4>
              </div>
              <span class="badge badge-muted">{{ auditEntries.length }} registros</span>
            </div>

            <div class="table-wrap">
              <table class="queue-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Evento</th>
                    <th>Detalle</th>
                    <th>Accion</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="entry in auditEntries"
                    :key="entry.id"
                    :class="{ 'is-selected': entry.id === selectedAuditEntry?.id }"
                    @click="openAudit(entry.id)"
                  >
                    <td>{{ entry.date }}</td>
                    <td>
                      <div class="table-primary">
                        <strong>{{ entry.title }}</strong>
                      </div>
                    </td>
                    <td class="detail-cell">{{ entry.detail }}</td>
                    <td>
                      <button
                        type="button"
                        class="ghost-button ghost-button--sm"
                        @click.stop="openAudit(entry.id)"
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p v-if="!auditEntries.length" class="empty-state">
              La bitacora aparecera aqui conforme se registren validaciones y asignaciones.
            </p>
          </div>
        </div>

        <aside class="surface detail-panel">
          <template v-if="activeTab === 'validation' && selectedCrew">
            <div class="section-head detail-head">
              <div>
                <p class="eyebrow">Detalle de sobrecargo</p>
                <h3>{{ selectedCrew.name }}</h3>
              </div>
              <div class="status-stack">
                <span
                  class="status-chip"
                  :class="toneClass(selectedCrew.profileState || selectedCrew.validationStatus)"
                >
                  {{ selectedCrew.profileState || selectedCrew.validationStatus || 'Pendiente' }}
                </span>
                <span class="status-chip" :class="toneClass(selectedCrew.state)">
                  {{ selectedCrew.state || 'Activo' }}
                </span>
              </div>
            </div>

            <div class="info-grid">
              <article class="info-card">
                <span>Proveedor</span>
                <strong>{{ selectedCrew.providerName || 'Sin ligar' }}</strong>
              </article>
              <article class="info-card">
                <span>Base</span>
                <strong>{{ selectedCrew.base || 'Por definir' }}</strong>
              </article>
              <article class="info-card">
                <span>Certificaciones</span>
                <strong>{{ selectedCrew.certifications || 'Sin certificaciones visibles' }}</strong>
              </article>
              <article class="info-card">
                <span>Rating</span>
                <strong>{{ selectedCrew.rating || 'N/D' }}</strong>
              </article>
            </div>

            <article class="detail-block">
              <div class="section-mini-head">
                <h4>Expediente y hallazgos</h4>
                <p>{{ selectedCrew.documentsSummary || 'Sin resumen documental disponible.' }}</p>
              </div>

              <label class="field">
                <span>Observaciones admin</span>
                <textarea
                  v-model="validationNotes[selectedCrew.id]"
                  rows="5"
                  placeholder="Motivo, hallazgo, instruccion o condicion para liberar la operacion"
                ></textarea>
              </label>
            </article>

            <article class="detail-block">
              <div class="section-mini-head">
                <h4>Historial rapido</h4>
                <p>
                  Ultima revision registrada: {{ selectedCrew.lastAudit || 'Sin auditoria previa' }}
                </p>
              </div>
              <p class="muted">
                {{ selectedCrew.adminNotes || 'Aun no hay notas administrativas guardadas.' }}
              </p>
            </article>

            <div class="detail-actions">
              <button
                type="button"
                class="ghost-button"
                @click="
                  emit('audit-crew', {
                    member: selectedCrew,
                    note: validationNotes[selectedCrew.id] || '',
                  })
                "
              >
                Auditar
              </button>
              <button
                type="button"
                class="ghost-button"
                @click="
                  emit('reject-crew', {
                    member: selectedCrew,
                    note: validationNotes[selectedCrew.id] || '',
                  })
                "
              >
                Rechazar
              </button>
              <button
                type="button"
                class="ghost-button"
                @click="
                  emit('suspend-crew', {
                    member: selectedCrew,
                    note: validationNotes[selectedCrew.id] || '',
                  })
                "
              >
                Suspender
              </button>
              <button
                type="button"
                class="primary-action"
                @click="
                  emit('approve-crew', {
                    member: selectedCrew,
                    note: validationNotes[selectedCrew.id] || '',
                  })
                "
              >
                Aprobar
              </button>
            </div>
          </template>

          <template v-else-if="activeTab === 'assignment' && selectedOperation">
            <div class="section-head detail-head">
              <div>
                <p class="eyebrow">Detalle de operacion</p>
                <h3>#{{ selectedOperation.id }}</h3>
              </div>
              <span class="status-chip" :class="toneClass(selectedOperation.status)">
                {{ selectedOperation.status }}
              </span>
            </div>

            <div class="info-grid">
              <article class="info-card">
                <span>Ruta</span>
                <strong>{{ selectedOperation.route }}</strong>
              </article>
              <article class="info-card">
                <span>Aeronave</span>
                <strong>{{ selectedOperation.aircraft || 'Por definir' }}</strong>
              </article>
              <article class="info-card">
                <span>Fecha</span>
                <strong>{{ formatDate(selectedOperation.departure) }}</strong>
              </article>
              <article class="info-card">
                <span>Sobrecargo asignada</span>
                <strong>{{ selectedOperation.crew || 'Sin asignar' }}</strong>
              </article>
            </div>

            <article class="detail-block">
              <div class="section-mini-head">
                <h4>Asignacion operativa</h4>
                <p>
                  Selecciona talento habilitado y deja la nota de briefing sin ensanchar la bandeja
                  principal.
                </p>
              </div>

              <label class="field">
                <span>Sobrecargo</span>
                <select v-model="getDraft(selectedOperation.id).crewId">
                  <option value="">Selecciona</option>
                  <option v-for="member in approvedCrew" :key="member.id" :value="member.id">
                    {{ member.name }} · {{ member.base || 'Base por definir' }}
                  </option>
                </select>
              </label>

              <label class="field">
                <span>Nota operativa</span>
                <textarea
                  v-model="getDraft(selectedOperation.id).note"
                  rows="5"
                  placeholder="Briefing, pax VIP, SLA, base o cualquier alerta para cabina"
                ></textarea>
              </label>
            </article>

            <article class="detail-block">
              <div class="section-mini-head">
                <h4>Trazabilidad</h4>
                <p>Ultima nota visible en la operacion.</p>
              </div>
              <p class="muted">
                {{
                  selectedOperation.notes ||
                  'Aun no hay observaciones registradas para esta operacion.'
                }}
              </p>
            </article>

            <div class="detail-actions">
              <button type="button" class="ghost-button" @click="activeTab = 'audit'">
                Ver bitacora
              </button>
              <button
                type="button"
                class="primary-action"
                @click="submitAssignment(selectedOperation.id)"
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
            <p class="muted">Selecciona un registro en la tabla para ver el detalle operativo.</p>
          </div>
        </aside>
      </div>
    </article>
  </section>
</template>

<style scoped>
.crew-admin-page,
.hero-metrics,
.workspace-grid,
.info-grid,
.status-stack {
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
.detail-actions {
  display: flex;
  gap: 1rem;
}

.hero-card,
.section-head,
.table-head {
  justify-content: space-between;
}

.hero-card,
.section-head,
.table-head,
.detail-actions {
  align-items: center;
}

.hero-card {
  flex-wrap: wrap;
}

.hero-copy {
  max-width: 48rem;
}

.hero-metrics {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  min-width: min(36rem, 100%);
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
  font-size: 1.8rem;
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

.workspace-card {
  display: grid;
  gap: 1rem;
}

.workspace-head {
  align-items: end;
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

.workspace-grid {
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.8fr);
  align-items: start;
}

.queue-panel,
.table-shell,
.detail-panel {
  display: grid;
  gap: 1rem;
}

.detail-panel {
  position: sticky;
  top: 1rem;
  padding: 1.1rem;
}

.table-wrap {
  overflow-x: auto;
  border: 1px solid #eee2cc;
  border-radius: 18px;
  background: #fffdfa;
}

.queue-table {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
}

.queue-table--ops {
  min-width: 1100px;
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
.badge {
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

.chip-warning {
  background: rgba(232, 180, 63, 0.14);
  border-color: rgba(232, 180, 63, 0.24);
  color: #99640a;
}

.chip-success {
  background: rgba(39, 153, 97, 0.14);
  border-color: rgba(39, 153, 97, 0.24);
  color: #17613d;
}

.chip-danger {
  background: rgba(201, 73, 73, 0.12);
  border-color: rgba(201, 73, 73, 0.22);
  color: #922c2c;
}

.chip-info {
  background: rgba(54, 115, 215, 0.12);
  border-color: rgba(54, 115, 215, 0.22);
  color: #224c9d;
}

.info-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.info-card,
.detail-block {
  padding: 0.95rem 1rem;
}

.detail-block {
  display: grid;
  gap: 0.85rem;
}

.section-mini-head {
  display: grid;
  gap: 0.3rem;
}

.field {
  display: grid;
  gap: 0.38rem;
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
  min-width: 9rem;
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

.ghost-button--sm,
.primary-action--sm {
  min-height: 2.35rem;
  padding: 0 0.85rem;
  border-radius: 12px;
}

.detail-actions {
  flex-wrap: wrap;
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

@media (max-width: 1180px) {
  .workspace-grid,
  .hero-metrics {
    grid-template-columns: 1fr;
  }

  .detail-panel {
    position: static;
  }
}

@media (max-width: 720px) {
  .hero-card,
  .section-head,
  .table-head,
  .detail-actions {
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
}
</style>
