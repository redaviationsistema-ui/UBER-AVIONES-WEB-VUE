<script setup>
import { computed } from 'vue'
import PresentationPlaceFields from './PresentationPlaceFields.vue'

const props = defineProps({
  operation: { type: Object, default: null },
  draft: { type: Object, default: null },
  assignableCrew: { type: Array, default: () => [] },
  linkedCrewMember: { type: Object, default: null },
  availabilityState: {
    type: Object,
    default: () => ({
      kind: 'idle',
      message: 'Selecciona sobrecargo',
      disableSelect: false,
    }),
  },
  selectedCrewMember: { type: Object, default: null },
  assignmentError: { type: String, default: '' },
  assignmentWindowMessage: { type: String, default: '' },
  assignmentSuccessMessage: { type: String, default: '' },
  assignmentEligibilityState: {
    type: Object,
    default: () => ({
      kind: 'idle',
      title: 'Elegibilidad de la operacion',
      message: '',
      detail: '',
      canAssign: false,
    }),
  },
  selectedCrewAvailabilityState: {
    type: Object,
    default: () => ({
      kind: 'idle',
      title: 'Disponibilidad de sobrecargo',
      message: 'Selecciona una sobrecargo para revisar su disponibilidad operativa.',
      detail: '',
    }),
  },
  canAssign: { type: Boolean, default: false },
  canSubmitAssignment: { type: Boolean, default: false },
  isClosed: { type: Boolean, default: false },
  isInFlight: { type: Boolean, default: false },
  assigningCrew: { type: Boolean, default: false },
  loadingAvailableCrew: { type: Boolean, default: false },
  formatDateTime: { type: Function, required: true },
  operationIncidentLabel: { type: Function, required: true },
  humanizeStatus: { type: Function, required: true },
  toneClass: { type: Function, required: true },
  operationStatusLabel: { type: Function, required: true },
  operationCrewStateLabel: { type: Function, required: true },
  operationAssignmentBadgeLabel: { type: Function, required: true },
  isCrewReadyForOperation: { type: Function, required: true },
})

defineEmits(['update-draft', 'assign', 'load-available'])

const duplicatedEligibilityMessage = computed(() => {
  const error = String(props.assignmentError || '').trim()
  const windowMessage = String(props.assignmentWindowMessage || '').trim()
  const eligibilityMessage = String(props.assignmentEligibilityState?.message || '').trim()

  return Boolean(
    windowMessage &&
      eligibilityMessage &&
      windowMessage === eligibilityMessage &&
      (!error || error === eligibilityMessage),
  )
})
</script>

<template>
  <aside v-if="operation && draft" class="surface detail-panel detail-panel--sticky">
    <div class="section-head detail-head detail-head--panel">
      <div>
        <p class="eyebrow">{{ isInFlight ? 'Seguimiento activo' : 'Detalle del vuelo' }}</p>
        <h3>{{ operation.folio || `RA-${operation.id}` }}</h3>
      </div>
      <div class="status-stack">
        <span class="status-chip" :class="toneClass(operationStatusLabel(operation))">
          {{ humanizeStatus(operationStatusLabel(operation)) }}
        </span>
        <span class="status-chip" :class="toneClass(operationCrewStateLabel(operation))">
          {{ operationCrewStateLabel(operation) }}
        </span>
      </div>
    </div>

    <article class="detail-hero-card">
      <div class="detail-hero-card__route">
        <p>{{ operation.route }}</p>
        <small>{{ formatDateTime(operation.departure) }}</small>
      </div>
      <div class="detail-hero-card__chips">
        <span class="status-chip chip-neutral">{{ operation.aircraft || 'Aeronave por definir' }}</span>
        <span class="status-chip chip-neutral">{{ isInFlight ? 'Ruta activa' : 'Vuelo operativo' }}</span>
      </div>
    </article>

    <article class="detail-block detail-block--timeline">
      <div class="section-mini-head">
        <h4>Estado operativo</h4>
      </div>
      <div class="timeline">
        <div class="timeline__item timeline__item--done">
          <span>1</span>
          <strong>Confirmado</strong>
        </div>
        <div class="timeline__item timeline__item--done">
          <span>2</span>
          <strong>Cliente</strong>
        </div>
        <div class="timeline__item" :class="{ 'timeline__item--done': isCrewReadyForOperation(operation) }">
          <span>3</span>
          <strong>Sobrecargo</strong>
        </div>
        <div class="timeline__item" :class="{ 'timeline__item--done': Boolean(draft.presentationTime) }">
          <span>4</span>
          <strong>Presentacion</strong>
        </div>
        <div class="timeline__item" :class="{ 'timeline__item--done': isInFlight }">
          <span>5</span>
          <strong>Vuelo</strong>
        </div>
      </div>
    </article>

    <div class="detail-kpi-grid">
      <article class="detail-kpi-card">
        <span>Cliente</span>
        <strong>{{ operation.clientName || 'Cliente privado' }}</strong>
      </article>
      <article class="detail-kpi-card">
        <span>Sobrecargo asignado</span>
        <strong>
          {{
            operationAssignmentBadgeLabel(operation) === 'Sin asignar'
              ? 'Pendiente asignar'
              : operation.crew || linkedCrewMember?.name || 'Pendiente asignar'
          }}
        </strong>
        <small>{{ operationAssignmentBadgeLabel(operation) }}</small>
      </article>
      <article class="detail-kpi-card">
        <span>Presentacion</span>
        <strong>{{ draft.presentationTime || 'Por definir' }}</strong>
      </article>
      <article class="detail-kpi-card">
        <span>Lugar de presentacion</span>
        <strong>{{ operation.presentationPlace || operation.origin || 'Por definir' }}</strong>
      </article>
      <article class="detail-kpi-card">
        <span>Incidencias</span>
        <strong>{{ operationIncidentLabel(operation) }}</strong>
      </article>
      <article class="detail-kpi-card">
        <span>Notas operativas</span>
        <strong>{{ draft.note || 'Sin comentarios' }}</strong>
      </article>
    </div>

    <article class="detail-block">
      <div class="section-mini-head">
        <h4>{{ operationAssignmentBadgeLabel(operation) === 'Sin asignar' ? 'Asignacion operativa' : 'Reasignacion operativa' }}</h4>
        <p>El backend conserva hora, lugar y notas en la misma fuente operativa.</p>
      </div>

      <div class="form-grid">
        <label class="field field--full">
          <span>Sobrecargo</span>
          <select
            :value="draft.crewId"
            :disabled="isClosed || !canAssign"
            @change="$emit('update-draft', operation.id, 'crewId', $event.target.value)"
          >
            <option value="">{{ availabilityState.message }}</option>
            <option v-for="member in assignableCrew" :key="member.id" :value="member.id">
              {{ member.name }} · {{ member.base || 'Sin base' }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>Hora de presentacion derivada</span>
          <input
            :value="draft.presentationTime"
            type="time"
            :disabled="true"
            readonly
          />
          <small class="muted">Se calcula automaticamente desde la salida real del vuelo.</small>
        </label>

        <PresentationPlaceFields
          class="field field--full"
          :type-value="draft.presentationPlaceType"
          :detail-value="draft.presentationPlaceDetail"
          :disabled="!canAssign"
          :type-error="assignmentError.includes('tipo') ? assignmentError : ''"
          :detail-error="assignmentError.includes('detalle') ? assignmentError : ''"
          @update:type-value="$emit('update-draft', operation.id, 'presentationPlaceType', $event)"
          @update:detail-value="$emit('update-draft', operation.id, 'presentationPlaceDetail', $event)"
        />

        <label class="field field--full">
          <span>Nota operativa</span>
          <textarea
            :value="draft.note"
            rows="4"
            :disabled="!canAssign"
            placeholder="VIP, briefing, horarios, alerta de cabina o seguimiento"
            @input="$emit('update-draft', operation.id, 'note', $event.target.value)"
          ></textarea>
        </label>
      </div>

      <div class="availability-card">
        <span class="eyebrow">{{ selectedCrewAvailabilityState.title }}</span>
        <strong>{{ selectedCrewAvailabilityState.message }}</strong>
        <p v-if="selectedCrewAvailabilityState.detail">{{ selectedCrewAvailabilityState.detail }}</p>
      </div>

      <div class="availability-card" :class="{ 'availability-card--blocked': !assignmentEligibilityState.canAssign }">
        <span class="eyebrow">{{ assignmentEligibilityState.title }}</span>
        <strong>{{ assignmentEligibilityState.message }}</strong>
        <p v-if="assignmentEligibilityState.detail">{{ assignmentEligibilityState.detail }}</p>
      </div>

      <div v-if="assignmentSuccessMessage" class="success-card" role="status" aria-live="polite">
        <span class="eyebrow">Asignacion confirmada</span>
        <strong>Sobrecargo listo</strong>
        <p>{{ assignmentSuccessMessage }}</p>
      </div>

      <p
        v-if="assignmentError && assignmentError !== assignmentEligibilityState.message"
        class="inline-error"
      >
        {{ assignmentError }}
      </p>
      <p
        v-else-if="assignmentWindowMessage && !duplicatedEligibilityMessage"
        class="inline-error"
      >
        {{ assignmentWindowMessage }}
      </p>
      <p v-else-if="!canAssign" class="muted">
        La asignacion se habilita cuando el vuelo ya esta confirmado para despacho operativo.
      </p>
    </article>

    <div class="detail-actions detail-actions--panel">
      <button type="button" class="secondary-action">Cancelar</button>
      <button
        type="button"
        class="primary-action"
        :class="{ 'primary-action--loading': assigningCrew }"
        :disabled="isClosed || !canSubmitAssignment || assigningCrew"
        @click="$emit('assign', operation.id)"
      >
        <span v-if="assigningCrew" class="button-spinner" aria-hidden="true"></span>
        {{
          assigningCrew
            ? 'Asignando...'
            : operationAssignmentBadgeLabel(operation) === 'Sin asignar'
              ? 'Asignar sobrecargo'
              : 'Reasignar sobrecargo'
        }}
      </button>
    </div>
  </aside>
</template>

<style scoped>
.detail-panel {
  display: grid;
  gap: 0.85rem;
  padding: 1rem;
  border-radius: 22px;
  border: 1px solid rgba(155, 176, 212, 0.22);
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 24px 48px rgba(17, 34, 68, 0.08);
}

.detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.8rem;
}

.detail-head .eyebrow {
  margin: 0 0 0.18rem;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
}

.detail-head h3 {
  margin: 0;
  font-size: 1.8rem;
  color: #10233d;
}

.status-stack {
  display: grid;
  justify-items: end;
  gap: 0.4rem;
}

.detail-hero-card,
.detail-block,
.detail-kpi-card {
  border-radius: 18px;
  border: 1px solid rgba(155, 176, 212, 0.18);
  background: #fff;
}

.detail-hero-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.9rem;
  padding: 0.95rem 1rem;
  background: linear-gradient(180deg, rgba(247, 250, 255, 0.96), rgba(255, 255, 255, 0.98));
}

.detail-hero-card__route {
  display: grid;
  gap: 0.28rem;
}

.detail-hero-card__route p {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: #163358;
}

.detail-hero-card__route small {
  color: #667a98;
}

.detail-hero-card__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  justify-content: flex-end;
}

.detail-block {
  display: grid;
  gap: 0.75rem;
  padding: 0.95rem 1rem;
}

.section-mini-head {
  display: grid;
  gap: 0.18rem;
}

.section-mini-head h4 {
  margin: 0;
  font-size: 0.98rem;
  color: #10233d;
}

.section-mini-head p {
  margin: 0;
  font-size: 0.82rem;
  color: #6b7a93;
}

.timeline {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.55rem;
}

.timeline__item {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 0.35rem;
  text-align: center;
}

.timeline__item::after {
  content: '';
  position: absolute;
  top: 15px;
  left: calc(50% + 18px);
  width: calc(100% - 12px);
  height: 2px;
  background: rgba(208, 217, 233, 0.9);
}

.timeline__item:last-child::after {
  display: none;
}

.timeline__item span {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  background: #edf2fb;
  color: #7d8ca5;
  font-size: 0.78rem;
  font-weight: 800;
  z-index: 1;
}

.timeline__item strong {
  font-size: 0.78rem;
  color: #526988;
}

.timeline__item--done span {
  background: #1e4ed8;
  color: #fff;
}

.timeline__item--done strong {
  color: #10233d;
}

.detail-kpi-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;
}

.detail-kpi-card {
  display: grid;
  gap: 0.3rem;
  padding: 0.82rem 0.9rem;
}

.detail-kpi-card span {
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #5d78a6;
}

.detail-kpi-card strong {
  font-size: 0.88rem;
  line-height: 1.38;
  color: #152942;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.8rem;
}

.field--full {
  grid-column: 1 / -1;
}

.field {
  display: grid;
  gap: 0.35rem;
}

.field span {
  font-size: 0.75rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #5873a3;
}

.field input,
.field select,
.field textarea {
  width: 100%;
  border-radius: 14px;
  border: 1px solid rgba(155, 176, 212, 0.34);
  background: #fff;
  color: #152942;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.field input,
.field select {
  min-height: 46px;
  padding: 0 0.9rem;
}

.field textarea {
  min-height: 96px;
  padding: 0.8rem 0.9rem;
  resize: vertical;
}

.field input:focus-visible,
.field select:focus-visible,
.field textarea:focus-visible {
  outline: none;
  border-color: rgba(30, 78, 216, 0.45);
  box-shadow: 0 0 0 4px rgba(30, 78, 216, 0.12);
}

.availability-card {
  display: grid;
  gap: 0.18rem;
  padding: 0.85rem 0.95rem;
  border-radius: 16px;
  background: rgba(238, 247, 243, 0.9);
  border: 1px solid rgba(16, 185, 129, 0.18);
}

.availability-card .eyebrow {
  margin: 0;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
}

.availability-card strong {
  color: #0f8e65;
}

.availability-card p,
.inline-error {
  margin: 0;
}

.success-card {
  display: grid;
  gap: 0.22rem;
  padding: 0.9rem 0.95rem;
  border-radius: 16px;
  background: rgba(236, 253, 245, 0.92);
  border: 1px solid rgba(16, 185, 129, 0.18);
}

.success-card .eyebrow,
.success-card strong,
.success-card p {
  margin: 0;
}

.success-card strong {
  color: #047857;
  font-size: 1.08rem;
}

.success-card p {
  color: #065f46;
}

.inline-error {
  color: #d14343;
}

.detail-actions {
  display: grid;
  grid-template-columns: 1fr 1.25fr;
  gap: 0.75rem;
}

.secondary-action,
.primary-action {
  min-height: 48px;
  border-radius: 14px;
  font-weight: 800;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}

.secondary-action {
  border: 1px solid rgba(155, 176, 212, 0.32);
  background: #fff;
  color: #152942;
}

.primary-action {
  border: 0;
  background: linear-gradient(135deg, #d4af37, #e6bd4e);
  color: #2f2300;
  box-shadow: 0 14px 26px rgba(212, 175, 55, 0.24);
}

.primary-action--loading {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
}

.button-spinner {
  width: 1rem;
  height: 1rem;
  border-radius: 999px;
  border: 2px solid rgba(47, 35, 0, 0.25);
  border-top-color: #2f2300;
  animation: crew-assign-spin 0.75s linear infinite;
}

@keyframes crew-assign-spin {
  to {
    transform: rotate(360deg);
  }
}

.secondary-action:hover,
.primary-action:hover {
  transform: translateY(-1px);
}

.primary-action:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  box-shadow: none;
}

@media (max-width: 1200px) {
  .timeline {
    grid-template-columns: 1fr;
  }

  .timeline__item {
    grid-template-columns: 30px 1fr;
    justify-items: start;
    text-align: left;
  }

  .timeline__item::after {
    top: calc(100% + 6px);
    left: 14px;
    width: 2px;
    height: 14px;
  }
}

@media (max-width: 720px) {
  .detail-kpi-grid,
  .form-grid,
  .detail-actions {
    grid-template-columns: 1fr;
  }

  .status-stack {
    justify-items: start;
  }

  .detail-head,
  .detail-hero-card {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
