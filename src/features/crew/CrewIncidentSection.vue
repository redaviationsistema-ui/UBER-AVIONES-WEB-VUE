<script setup>
import { computed, ref } from 'vue'
import CrewUiIcon from './CrewUiIcon.vue'

const props = defineProps({
  incidentForm: { type: Object, required: true },
  incidentErrors: { type: Object, required: true },
  incidents: { type: Array, required: true },
  incidentTypes: { type: Array, required: true },
  incidentPriorities: { type: Array, required: true },
  incidentStates: { type: Array, required: true },
  incidentFlightOptions: { type: Array, required: true },
})

const emit = defineEmits(['update-field', 'create', 'add-evidence', 'add-comment', 'mark-attended', 'escalate'])

const composerOpen = ref(false)
const currentStep = ref(1)

const stepLabels = [
  'Categoria',
  'Prioridad',
  'Detalle',
  'Evidencia',
  'Envio',
]

const activeIncidents = computed(() =>
  props.incidents.filter((item) => !['Cerrada', 'Resuelta por operador'].includes(item.state)),
)

function openComposer() {
  composerOpen.value = true
  currentStep.value = 1
}

function closeComposer() {
  composerOpen.value = false
  currentStep.value = 1
}

function nextStep() {
  currentStep.value = Math.min(5, currentStep.value + 1)
}

function previousStep() {
  currentStep.value = Math.max(1, currentStep.value - 1)
}

function priorityTone(value = '') {
  if (value === 'Critica') return 'critical'
  if (value === 'Alta') return 'high'
  if (value === 'Media') return 'medium'
  return 'low'
}

function statusTone(value = '') {
  if (value === 'Escalada') return 'critical'
  if (value === 'En revision') return 'medium'
  if (value === 'Resuelta por operador') return 'success'
  if (value === 'Cerrada') return 'neutral'
  return 'high'
}

function submitIncident(escalate = false) {
  emit('create', { escalate })
  if (!Object.keys(props.incidentErrors || {}).length) {
    closeComposer()
  }
}
</script>

<template>
  <section class="incidents-page">
    <div class="page-head surface">
      <div class="hero-copy">
        <div class="title-row">
          <span class="icon-badge"><CrewUiIcon name="incident" :size="20" /></span>
          <div>
            <span class="eyebrow">Incidencia en mision</span>
            <h3>Reporte rapido operativo</h3>
          </div>
        </div>
        <p class="muted">
          Reporta incidencias operativas, adjunta evidencia y escala eventos criticos a tu operador.
        </p>
      </div>
      <button class="primary-action action-button" type="button" @click="openComposer">
        <CrewUiIcon name="incident" :size="16" />
        Reportar incidencia
      </button>
    </div>

    <div class="content-grid">
      <section class="surface composer-card" :class="{ 'composer-card-open': composerOpen }">
        <div class="section-head">
          <div>
            <span class="mini-icon"><CrewUiIcon name="report" :size="17" /></span>
            <h4>Reporte de incidente en mision</h4>
          </div>
          <button v-if="composerOpen" type="button" class="ghost-button" @click="closeComposer">
            Cerrar
          </button>
        </div>

        <div v-if="!composerOpen" class="composer-closed">
          <p>Abre el reporte rapido para registrar una incidencia de servicio, cliente, seguridad u operacion.</p>
          <button class="primary-action" type="button" @click="openComposer">+ Reportar</button>
        </div>

        <div v-else class="composer-open">
          <div class="stepper">
            <article
              v-for="(label, index) in stepLabels"
              :key="label"
              class="step-chip"
              :class="{ active: currentStep === index + 1, done: currentStep > index + 1 }"
            >
              <span>{{ index + 1 }}</span>
              <strong>{{ label }}</strong>
            </article>
          </div>

          <div v-if="currentStep === 1" class="step-body">
            <h5>Que paso?</h5>
            <div class="type-grid">
              <button
                v-for="item in incidentTypes"
                :key="item"
                type="button"
                class="type-card"
                :class="{ active: incidentForm.type === item }"
                @click="emit('update-field', { form: 'incident', field: 'type', value: item })"
              >
                {{ item }}
              </button>
            </div>
          </div>

          <div v-else-if="currentStep === 2" class="step-body">
            <h5>Prioridad</h5>
            <div class="priority-grid">
              <button
                v-for="item in incidentPriorities"
                :key="item"
                type="button"
                class="priority-card"
                :data-tone="priorityTone(item)"
                :class="{ active: incidentForm.priority === item }"
                @click="emit('update-field', { form: 'incident', field: 'priority', value: item })"
              >
                {{ item }}
              </button>
            </div>
            <small v-if="incidentErrors.priority" class="field-error">{{ incidentErrors.priority }}</small>
          </div>

          <div v-else-if="currentStep === 3" class="step-body">
            <div class="form-grid">
              <label>
                <span>Vuelo</span>
                <select
                  :value="incidentForm.flight"
                  @change="emit('update-field', { form: 'incident', field: 'flight', value: $event.target.value })"
                >
                  <option value="">Selecciona un vuelo</option>
                  <option v-for="item in incidentFlightOptions" :key="item.id" :value="item.flight">
                    {{ item.flight }} · {{ item.route }} · {{ item.phase }}
                  </option>
                </select>
              </label>

              <label>
                <span>Fase</span>
                <select
                  :value="incidentForm.phase"
                  @change="emit('update-field', { form: 'incident', field: 'phase', value: $event.target.value })"
                >
                  <option>Pre-vuelo</option>
                  <option>En vuelo</option>
                  <option>Post-vuelo</option>
                </select>
              </label>

              <label class="full-width">
                <span>Descripcion breve</span>
                <textarea
                  :value="incidentForm.description"
                  rows="4"
                  placeholder="Describe que paso y el impacto inmediato en la mision."
                  @input="emit('update-field', { form: 'incident', field: 'description', value: $event.target.value })"
                ></textarea>
                <small v-if="incidentErrors.description" class="field-error">{{ incidentErrors.description }}</small>
              </label>
            </div>
          </div>

          <div v-else-if="currentStep === 4" class="step-body">
            <div class="form-grid">
              <label class="full-width">
                <span>Foto / video / documento</span>
                <input
                  :value="incidentForm.evidence"
                  type="text"
                  placeholder="briefing-catering-742.jpg o enlace interno"
                  @input="emit('update-field', { form: 'incident', field: 'evidence', value: $event.target.value })"
                />
                <small v-if="incidentErrors.evidence" class="field-error">{{ incidentErrors.evidence }}</small>
              </label>

              <label class="full-width">
                <span>Accion tomada</span>
                <select
                  :value="incidentForm.actionTaken"
                  @change="emit('update-field', { form: 'incident', field: 'actionTaken', value: $event.target.value })"
                >
                  <option value="">Selecciona</option>
                  <option>Reportado</option>
                  <option>Escalado</option>
                  <option>Atendido en cabina</option>
                  <option>Requiere operador</option>
                </select>
              </label>
            </div>
          </div>

          <div v-else class="step-body">
            <div class="review-card">
              <span class="mini-label">Resumen</span>
              <strong>{{ incidentForm.type || 'Categoria por definir' }}</strong>
              <p>{{ incidentForm.flight || 'Vuelo sin seleccionar' }} · {{ incidentForm.phase }} · {{ incidentForm.priority || 'Prioridad por definir' }}</p>
              <small>{{ incidentForm.description || 'Sin descripcion' }}</small>
            </div>

            <div class="status-preview">
              <label>
                <span>Estado inicial</span>
                <select
                  :value="incidentForm.state"
                  @change="emit('update-field', { form: 'incident', field: 'state', value: $event.target.value })"
                >
                  <option v-for="item in incidentStates" :key="item" :value="item">{{ item }}</option>
                </select>
              </label>
              <small class="muted">La hora se registra automaticamente al enviar el reporte.</small>
            </div>
          </div>

          <div class="composer-actions">
            <button type="button" class="ghost-button" :disabled="currentStep === 1" @click="previousStep">
              Anterior
            </button>
            <button v-if="currentStep < 5" type="button" class="primary-action" @click="nextStep">
              Siguiente
            </button>
            <button v-else type="button" class="ghost-button" @click="submitIncident(false)">
              Enviar
            </button>
            <button v-if="currentStep === 5" type="button" class="primary-action" @click="submitIncident(true)">
              Enviar y escalar
            </button>
          </div>
        </div>
      </section>

      <section class="surface list-card">
        <div class="section-head">
          <div>
            <span class="mini-icon"><CrewUiIcon name="history" :size="17" /></span>
            <h4>Incidencias activas y seguimiento</h4>
          </div>
          <span class="badge">{{ activeIncidents.length }} activas</span>
        </div>

        <div class="incident-list">
          <article v-for="item in incidents" :key="item.id" class="incident-row">
            <div class="incident-main">
              <div class="incident-top">
                <strong>{{ item.flight }} · {{ item.type }}</strong>
                <div class="meta-stack">
                  <span class="status-pill" :data-tone="priorityTone(item.priority)">{{ item.priority }}</span>
                  <span class="status-pill status-pill--ghost" :data-tone="statusTone(item.state)">{{ item.state }}</span>
                </div>
              </div>

              <p>{{ item.description }}</p>
              <small>{{ item.phase }} · {{ item.time }}</small>
              <small>Accion: {{ item.actionTaken || 'Pendiente' }}</small>

              <div class="timeline">
                <article v-for="entry in item.timeline || []" :key="entry.id" class="timeline-item">
                  <span>{{ entry.time }}</span>
                  <p>{{ entry.label }}</p>
                </article>
              </div>
            </div>

            <div class="action-stack">
              <button class="ghost-button action-button" type="button" @click="$emit('add-evidence', item.id)">
                <CrewUiIcon name="report" :size="15" />
                Agregar foto
              </button>
              <button class="ghost-button action-button" type="button" @click="$emit('add-comment', item.id)">
                <CrewUiIcon name="briefing" :size="15" />
                Actualizar accion
              </button>
              <button class="ghost-button action-button" type="button" @click="$emit('mark-attended', item.id)">
                <CrewUiIcon name="checklist" :size="15" />
                En revision
              </button>
              <button class="primary-action action-button" type="button" @click="$emit('escalate', item.id)">
                <CrewUiIcon name="incident" :size="15" />
                Escalar operador
              </button>
            </div>
          </article>
        </div>
      </section>
    </div>

    <button class="floating-report" type="button" @click="openComposer">
      + Reportar
    </button>
  </section>
</template>

<style scoped>
.incidents-page,
.content-grid,
.incident-list,
.composer-open,
.hero-copy,
.stepper,
.timeline {
  display: grid;
  gap: 1.25rem;
}

.page-head,
.composer-card,
.list-card {
  padding: 1.4rem;
}

.page-head,
.incident-row,
.section-head,
.incident-top,
.composer-actions {
  display: flex;
  gap: 1rem;
}

.page-head,
.section-head,
.incident-top,
.composer-actions {
  justify-content: space-between;
}

.page-head,
.section-head,
.incident-top,
.composer-actions {
  align-items: center;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.icon-badge,
.mini-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #0a8f5b;
}

.icon-badge {
  width: 2.7rem;
  height: 2.7rem;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(10, 143, 91, 0.14), rgba(10, 143, 91, 0.05));
}

.page-head h3,
.composer-card h4,
.list-card h4 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.04em;
}

.page-head h3 {
  font-size: clamp(1.8rem, 4vw, 2.5rem);
}

.content-grid {
  grid-template-columns: minmax(0, 0.95fr) minmax(360px, 1.05fr);
}

.composer-card,
.list-card {
  border: 1px solid rgba(10, 143, 91, 0.08);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(249, 252, 250, 0.97));
}

.composer-closed {
  display: grid;
  gap: 1rem;
  padding: 1rem 0 0;
}

.stepper {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.step-chip {
  display: grid;
  gap: 0.3rem;
  padding: 0.9rem;
  border-radius: 16px;
  border: 1px solid rgba(10, 143, 91, 0.1);
  background: #fffdfa;
}

.step-chip span {
  width: 1.7rem;
  height: 1.7rem;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(17, 17, 17, 0.06);
  font-size: 0.82rem;
}

.step-chip strong {
  font-size: 0.9rem;
}

.step-chip.active {
  border-color: rgba(10, 143, 91, 0.22);
  background: rgba(10, 143, 91, 0.06);
}

.step-chip.done {
  border-color: rgba(10, 143, 91, 0.12);
}

.step-body {
  display: grid;
  gap: 1rem;
}

.step-body h5 {
  margin: 0;
  font-size: 1.05rem;
}

.type-grid,
.priority-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
}

.type-card,
.priority-card {
  min-height: 4rem;
  border-radius: 18px;
  border: 1px solid rgba(17, 17, 17, 0.08);
  background: #fffdfa;
  font-weight: 700;
  cursor: pointer;
}

.type-card.active,
.priority-card.active {
  border-color: rgba(10, 143, 91, 0.22);
  box-shadow: 0 18px 42px rgba(10, 31, 21, 0.08);
}

.priority-card[data-tone='low'] {
  background: #f6f7f8;
}

.priority-card[data-tone='medium'] {
  background: #fff5d6;
}

.priority-card[data-tone='high'] {
  background: #ffe6c7;
}

.priority-card[data-tone='critical'] {
  background: #ffe0db;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.form-grid label,
.status-preview {
  display: grid;
  gap: 0.35rem;
}

.full-width {
  grid-column: 1 / -1;
}

input,
select,
textarea {
  min-height: 2.9rem;
  border: 1px solid #d8dfdb;
  border-radius: 14px;
  background: #fff;
  color: #111;
  padding: 0 0.85rem;
}

textarea {
  padding: 0.8rem;
}

.review-card {
  display: grid;
  gap: 0.35rem;
  padding: 1rem;
  border-radius: 18px;
  background: #faf8f3;
}

.mini-label,
.field-error {
  font-size: 0.82rem;
}

.field-error {
  color: #b42318;
}

.incident-row {
  align-items: start;
  justify-content: space-between;
  padding: 1.05rem;
  border-radius: 18px;
  background: #faf8f3;
}

.incident-main,
.meta-stack,
.action-stack {
  display: grid;
  gap: 0.55rem;
}

.action-stack {
  width: min(100%, 240px);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0 0.8rem;
  border-radius: 999px;
  font-size: 0.76rem;
  font-weight: 700;
}

.status-pill[data-tone='low'] {
  background: #f3f4f6;
  color: #4b5563;
}

.status-pill[data-tone='medium'] {
  background: #fff5d6;
  color: #8a5a00;
}

.status-pill[data-tone='high'] {
  background: #ffe6c7;
  color: #b45309;
}

.status-pill[data-tone='critical'] {
  background: #ffe0db;
  color: #b42318;
}

.status-pill[data-tone='success'] {
  background: #def7e6;
  color: #067647;
}

.status-pill[data-tone='neutral'] {
  background: #eef2f6;
  color: #475467;
}

.status-pill--ghost {
  border: 1px solid rgba(17, 17, 17, 0.08);
}

.timeline {
  margin-top: 0.4rem;
}

.timeline-item {
  display: grid;
  grid-template-columns: 5.5rem 1fr;
  gap: 0.8rem;
  font-size: 0.86rem;
}

.timeline-item p {
  margin: 0;
}

.floating-report {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  min-height: 3rem;
  padding: 0 1.15rem;
  border: none;
  border-radius: 999px;
  background: #111;
  color: #fff;
  font-weight: 700;
  box-shadow: 0 18px 34px rgba(17, 17, 17, 0.22);
  cursor: pointer;
  z-index: 20;
}

@media (min-width: 761px) {
  .floating-report {
    display: none;
  }
}

@media (max-width: 1080px) {
  .content-grid,
  .form-grid,
  .type-grid,
  .priority-grid,
  .stepper {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .page-head,
  .incident-row,
  .section-head,
  .incident-top,
  .composer-actions {
    display: grid;
  }

  .page-head,
  .composer-card,
  .list-card {
    padding: 1.05rem;
  }

  .action-stack {
    width: 100%;
  }
}
</style>
