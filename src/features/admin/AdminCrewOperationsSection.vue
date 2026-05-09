<script setup>
import { computed, reactive, watch } from 'vue'

const props = defineProps({
  crewMembers: { type: Array, required: true },
  operations: { type: Array, required: true },
  auditEntries: { type: Array, required: true },
})

const emit = defineEmits(['approve-crew', 'reject-crew', 'suspend-crew', 'assign-crew', 'audit-crew'])

const validationNotes = reactive({})
const assignmentDrafts = reactive({})

const pendingValidation = computed(() =>
  props.crewMembers.filter((member) =>
    ['Pendiente', 'En revision', 'Requiere cambios'].includes(member.profileState || member.validationStatus),
  ),
)

const approvedCrew = computed(() =>
  props.crewMembers.filter((member) => {
    const validationState = String(member.profileState || member.validationStatus || '').toLowerCase()
    const operationalState = String(member.state || '').toLowerCase()
    return validationState.includes('aprob') && !operationalState.includes('suspend')
  }),
)

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
</script>

<template>
  <section class="crew-admin-page">
    <article class="surface hero-card">
      <div>
        <p class="eyebrow">Sobrecargos</p>
        <h2>Validacion, asignacion y auditoria operativa</h2>
        <p class="muted">
          Admin confirma expedientes, asigna sobrecargos a vuelos y mantiene trazabilidad de cada cambio.
        </p>
      </div>

      <div class="hero-metrics">
        <article class="metric-card">
          <span>Pendientes</span>
          <strong>{{ pendingValidation.length }}</strong>
        </article>
        <article class="metric-card">
          <span>Aprobados</span>
          <strong>{{ approvedCrew.length }}</strong>
        </article>
        <article class="metric-card">
          <span>Operaciones</span>
          <strong>{{ operations.length }}</strong>
        </article>
        <article class="metric-card">
          <span>Auditorias</span>
          <strong>{{ auditEntries.length }}</strong>
        </article>
      </div>
    </article>

    <div class="page-grid">
      <article class="surface section-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Validacion</p>
            <h3>Cola de sobrecargos</h3>
          </div>
          <span class="badge">{{ crewMembers.length }} perfiles</span>
        </div>

        <div class="crew-list">
          <article v-for="member in crewMembers" :key="member.id" class="list-card">
            <div class="card-top">
              <div>
                <strong>{{ member.name }}</strong>
                <p class="muted">{{ member.base }} · {{ member.providerName || 'Proveedor sin ligar' }}</p>
              </div>
              <div class="status-stack">
                <span class="badge">{{ member.profileState }}</span>
                <span class="badge badge-muted">{{ member.state }}</span>
              </div>
            </div>

            <p class="muted">{{ member.certifications || 'Sin certificaciones visibles' }}</p>
            <small>{{ member.documentsSummary }} · Rating {{ member.rating }}</small>

            <label class="field">
              <span>Observaciones admin</span>
              <textarea v-model="validationNotes[member.id]" rows="3" placeholder="Motivo, hallazgo o instruccion"></textarea>
            </label>

            <div class="inline-actions">
              <button type="button" class="ghost-button" @click="emit('audit-crew', { member, note: validationNotes[member.id] || '' })">
                Auditar
              </button>
              <button type="button" class="ghost-button" @click="emit('reject-crew', { member, note: validationNotes[member.id] || '' })">
                Rechazar
              </button>
              <button type="button" class="ghost-button" @click="emit('suspend-crew', { member, note: validationNotes[member.id] || '' })">
                Suspender
              </button>
              <button type="button" class="primary-action" @click="emit('approve-crew', { member, note: validationNotes[member.id] || '' })">
                Aprobar
              </button>
            </div>
          </article>
        </div>
      </article>

      <article class="surface section-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Asignacion</p>
            <h3>Sobrecargo por operacion</h3>
          </div>
        </div>

        <div class="operations-list">
          <article v-for="operation in operations" :key="operation.id" class="list-card">
            <div class="card-top">
              <div>
                <strong>Operacion #{{ operation.id }}</strong>
                <p class="muted">{{ operation.route }}</p>
              </div>
              <span class="badge">{{ operation.status }}</span>
            </div>

            <p class="muted">{{ operation.aircraft }} · {{ operation.departure }}</p>
            <small>Asignado actual: {{ operation.crew || 'Por definir' }}</small>

            <div class="assignment-grid">
              <label class="field">
                <span>Sobrecargo</span>
                <select v-model="getDraft(operation.id).crewId">
                  <option value="">Selecciona</option>
                  <option v-for="member in approvedCrew" :key="member.id" :value="member.id">
                    {{ member.name }} · {{ member.base }}
                  </option>
                </select>
              </label>

              <label class="field">
                <span>Nota operativa</span>
                <input v-model="getDraft(operation.id).note" type="text" placeholder="Briefing, VIP, base, SLA..." />
              </label>
            </div>

            <div class="inline-actions">
              <button type="button" class="primary-action" @click="submitAssignment(operation.id)">
                Asignar sobrecargo
              </button>
            </div>
          </article>
        </div>
      </article>
    </div>

    <article class="surface section-card">
      <div class="section-head">
        <div>
          <p class="eyebrow">Auditoria</p>
          <h3>Bitacora admin</h3>
        </div>
      </div>

      <div class="timeline">
        <article v-for="entry in auditEntries" :key="entry.id" class="timeline-item">
          <span class="timeline-date">{{ entry.date }}</span>
          <div>
            <strong>{{ entry.title }}</strong>
            <p class="muted">{{ entry.detail }}</p>
          </div>
        </article>
        <p v-if="!auditEntries.length" class="empty-state">
          La bitacora de auditoria aparecera aqui conforme se validen sobrecargos y asignaciones.
        </p>
      </div>
    </article>
  </section>
</template>

<style scoped>
.crew-admin-page,
.page-grid,
.hero-metrics,
.crew-list,
.operations-list,
.timeline {
  display: grid;
  gap: 1rem;
}

.hero-card,
.section-card,
.metric-card {
  padding: 1.2rem;
}

.page-grid {
  grid-template-columns: minmax(0, 1.15fr) minmax(340px, 0.85fr);
  align-items: start;
}

.hero-card,
.section-head,
.card-top,
.inline-actions {
  display: flex;
  gap: 1rem;
}

.hero-card,
.section-head,
.card-top {
  justify-content: space-between;
}

.hero-card,
.section-head,
.card-top,
.inline-actions {
  align-items: center;
}

.hero-metrics {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  min-width: min(34rem, 100%);
}

.metric-card {
  border-radius: 18px;
  background: #faf6ee;
  border: 1px solid rgba(200, 169, 107, 0.18);
}

.metric-card span,
.field span,
.timeline-date {
  display: block;
  color: #78684e;
  font-size: 0.82rem;
}

.metric-card strong,
.section-card h3 {
  margin: 0.35rem 0 0;
}

.list-card,
.timeline-item {
  border: 1px solid #eee2cc;
  border-radius: 18px;
  background: #fffdfa;
  padding: 1rem;
}

.status-stack,
.assignment-grid {
  display: grid;
  gap: 0.6rem;
}

.assignment-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 0.9rem;
}

.field {
  display: grid;
  gap: 0.35rem;
}

input,
select,
textarea {
  min-height: 2.8rem;
  border: 1px solid #dccfb9;
  border-radius: 14px;
  background: #fff;
  color: #111;
  padding: 0 0.85rem;
}

textarea {
  padding: 0.8rem;
}

.inline-actions {
  flex-wrap: wrap;
  margin-top: 0.9rem;
}

.badge {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0 0.8rem;
  border-radius: 999px;
  background: rgba(200, 169, 107, 0.14);
  color: #8f6919;
  border: 1px solid rgba(200, 169, 107, 0.18);
  font-size: 0.78rem;
  font-weight: 700;
}

.badge-muted {
  background: rgba(17, 17, 17, 0.05);
  color: #4b5563;
  border-color: rgba(17, 17, 17, 0.08);
}

.primary-action,
.ghost-button {
  min-height: 2.75rem;
  border-radius: 14px;
  padding: 0 1rem;
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

@media (max-width: 1080px) {
  .page-grid,
  .hero-metrics,
  .assignment-grid {
    grid-template-columns: 1fr;
  }

  .hero-card {
    display: grid;
  }
}

@media (max-width: 720px) {
  .section-head,
  .card-top,
  .inline-actions {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
