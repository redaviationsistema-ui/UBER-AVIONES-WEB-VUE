<script setup>
import { computed, ref, watch } from 'vue'
import CrewUiIcon from './CrewUiIcon.vue'

const props = defineProps({
  assignments: { type: Array, required: true },
  assignmentResponseForm: { type: Object, required: true },
  assignmentErrors: { type: Object, required: true },
  responseOptions: { type: Array, required: true },
  rejectReasons: { type: Array, required: true },
})

defineEmits(['update-field', 'confirm', 'reject', 'request-change', 'confirm-briefing'])

const selectedAssignmentId = ref(null)

const selectedAssignment = computed(
  () => props.assignments.find((item) => item.id === selectedAssignmentId.value) || props.assignments[0] || null,
)

watch(
  () => props.assignments,
  (items) => {
    if (!items.length) {
      selectedAssignmentId.value = null
      return
    }
    if (!items.some((item) => item.id === selectedAssignmentId.value)) {
      selectedAssignmentId.value = items[0].id
    }
  },
  { immediate: true },
)

function formatDateTime(date = '', time = '') {
  const source = [date, time].filter(Boolean).join('T')
  if (!source) return 'Por definir'
  const normalized = source.includes('T') ? source : `${source}T08:00`
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return [date, time].filter(Boolean).join(' · ') || 'Por definir'
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}
</script>

<template>
  <section class="assignments-page">
    <div class="page-head surface">
      <div class="hero-copy">
        <div class="title-row">
          <span class="icon-badge"><CrewUiIcon name="assignment" :size="20" /></span>
          <div>
            <span class="eyebrow">Asignaciones</span>
            <h3>Asignaciones de vuelo</h3>
          </div>
        </div>
        <p class="muted">
          La sobrecargo solo ve vuelos asignados, cliente, briefing y requerimientos VIP. La coordinacion directa la hace Admin / Red Sky; no hay contacto directo con proveedor ni cliente.
        </p>
      </div>
      <span class="badge">{{ assignments.length }} activas</span>
    </div>

    <div class="content-grid">
      <section class="surface response-card">
        <div class="section-head">
          <span class="mini-icon"><CrewUiIcon name="briefing" :size="17" /></span>
          <h4>Respuesta al Admin</h4>
        </div>
        <div class="form-grid">
          <label>
            <span>Respuesta</span>
            <select
              :value="assignmentResponseForm.response"
              @change="$emit('update-field', { form: 'assignmentResponse', field: 'response', value: $event.target.value })"
            >
              <option value="">Selecciona</option>
              <option v-for="item in responseOptions" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>

          <label>
            <span>Motivo de rechazo</span>
            <select
              :value="assignmentResponseForm.rejectReason"
              @change="$emit('update-field', { form: 'assignmentResponse', field: 'rejectReason', value: $event.target.value })"
            >
              <option value="">Selecciona</option>
              <option v-for="item in rejectReasons" :key="item" :value="item">{{ item }}</option>
            </select>
            <small v-if="assignmentErrors.rejectReason">{{ assignmentErrors.rejectReason }}</small>
          </label>

          <label class="full-width">
            <span>Comentario para Admin</span>
            <textarea
              :value="assignmentResponseForm.comment"
              rows="3"
              @input="$emit('update-field', { form: 'assignmentResponse', field: 'comment', value: $event.target.value })"
            ></textarea>
            <small v-if="assignmentErrors.deadline">{{ assignmentErrors.deadline }}</small>
          </label>

          <label>
            <span>Hora estimada de llegada</span>
            <input
              :value="assignmentResponseForm.eta"
              type="text"
              placeholder="08:20 / 15 min antes"
              @input="$emit('update-field', { form: 'assignmentResponse', field: 'eta', value: $event.target.value })"
            />
          </label>
        </div>
      </section>

      <section class="surface assignments-list-card">
        <div class="section-head">
          <span class="mini-icon"><CrewUiIcon name="flight" :size="17" /></span>
          <h4>Vuelos asignados</h4>
        </div>
        <div class="assignment-list">
          <article
            v-for="item in assignments"
            :key="item.id"
            class="assignment-row"
            :class="{ 'assignment-row--selected': item.id === selectedAssignment?.id }"
            @click="selectedAssignmentId = item.id"
          >
            <div>
              <strong>{{ [item.flight, item.route].filter(Boolean).join(' - ') || 'Asignacion sin referencia completa' }}</strong>
              <p>{{ [item.date, item.time, item.aircraft].filter(Boolean).join(' - ') || 'Sin horario o aeronave confirmada' }}</p>
              <small>{{ [item.client, item.passengers ? `${item.passengers} pax` : '', item.serviceLevel].filter(Boolean).join(' - ') || 'Sin datos comerciales visibles' }}</small>
              <small>{{ [item.vipRequirements, item.briefingTime ? `Briefing ${item.briefingTime}` : ''].filter(Boolean).join(' - ') || 'Sin briefing o requerimientos cargados' }}</small>
              <small v-if="item.internalContact">{{ item.internalContact }}</small>
            </div>
            <div class="action-stack">
              <span class="badge">{{ item.responseStatus }}</span>
              <span class="badge">{{ item.crewStatusLabel || item.missionStatus }}</span>
              <button class="ghost-button action-button" type="button" @click="$emit('confirm', item.id)">
                <CrewUiIcon name="checklist" :size="15" />
                Confirmar al Admin
              </button>
              <button class="ghost-button action-button" type="button" @click="$emit('reject', item.id)">
                <CrewUiIcon name="incident" :size="15" />
                Rechazar al Admin
              </button>
              <button class="ghost-button action-button" type="button" @click="$emit('request-change', item.id)">
                <CrewUiIcon name="route" :size="15" />
                Solicitar cambio al Admin
              </button>
              <button class="ghost-button action-button" type="button" @click="$emit('confirm-briefing', item.id)">
                <CrewUiIcon name="briefing" :size="15" />
                Check-in operativo
              </button>
            </div>
          </article>
        </div>

        <article v-if="selectedAssignment" class="assignment-detail-card">
          <div class="section-head">
            <span class="mini-icon"><CrewUiIcon name="briefing" :size="17" /></span>
            <h4>Detalle de operacion</h4>
          </div>

          <div class="detail-grid">
            <div class="detail-item">
              <span>Folio</span>
              <strong>{{ selectedAssignment.flight || `OP-${selectedAssignment.id}` }}</strong>
            </div>
            <div class="detail-item">
              <span>Fecha / hora</span>
              <strong>{{ formatDateTime(selectedAssignment.date, selectedAssignment.time || selectedAssignment.briefingTime) }}</strong>
            </div>
            <div class="detail-item">
              <span>Ruta</span>
              <strong>{{ selectedAssignment.route || 'Por definir' }}</strong>
            </div>
            <div class="detail-item">
              <span>Aeronave</span>
              <strong>{{ selectedAssignment.aircraft || 'Por definir' }}</strong>
            </div>
            <div class="detail-item">
              <span>Hora de presentacion</span>
              <strong>{{ selectedAssignment.briefingTime || selectedAssignment.time || 'Por definir' }}</strong>
            </div>
            <div class="detail-item">
              <span>Lugar de presentacion</span>
              <strong>{{ selectedAssignment.origin || 'Base / aeropuerto por definir' }}</strong>
            </div>
            <div class="detail-item">
              <span>Cliente</span>
              <strong>{{ selectedAssignment.client || 'Cliente por confirmar' }}</strong>
            </div>
            <div class="detail-item">
              <span>Pasajeros</span>
              <strong>{{ selectedAssignment.passengers ? `${selectedAssignment.passengers} pax` : 'Sin dato' }}</strong>
            </div>
            <div class="detail-item">
              <span>Catering</span>
              <strong>{{ selectedAssignment.catering || 'Sin dato' }}</strong>
            </div>
            <div class="detail-item">
              <span>Servicio</span>
              <strong>{{ selectedAssignment.serviceLevel || 'Sin dato' }}</strong>
            </div>
            <div class="detail-item detail-item--wide">
              <span>Requerimientos especiales</span>
              <strong>{{ selectedAssignment.specialRequirements || selectedAssignment.vipRequirements || 'Sin requerimientos especiales cargados' }}</strong>
            </div>
            <div class="detail-item detail-item--wide">
              <span>Contacto interno</span>
              <strong>{{ selectedAssignment.internalContact || 'Admin / Red Sky' }}</strong>
            </div>
          </div>
        </article>
      </section>
    </div>
  </section>
</template>

<style scoped>
.assignments-page,
.content-grid,
.assignment-list {
  display: grid;
  gap: 1.5rem;
}

.page-head,
.response-card,
.assignments-list-card {
  padding: 1.4rem;
}

.hero-copy {
  display: grid;
  gap: 0.75rem;
  min-width: 0;
}

.title-row,
.section-head {
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
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 16px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
  background: linear-gradient(180deg, rgba(10, 143, 91, 0.14), rgba(10, 143, 91, 0.05));
}

.page-head,
.assignment-row {
  display: flex;
  gap: 1rem;
}

.page-head {
  align-items: end;
  justify-content: space-between;
}

.page-head h3,
.response-card h4,
.assignments-list-card h4 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.04em;
}

.page-head h3 {
  font-size: clamp(1.8rem, 4vw, 2.5rem);
}

.content-grid {
  grid-template-columns: minmax(0, 0.95fr) minmax(340px, 1.05fr);
}

.response-card,
.assignments-list-card {
  border: 1px solid rgba(10, 143, 91, 0.08);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(249, 252, 250, 0.97));
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  margin-top: 1.15rem;
}

.form-grid label {
  display: grid;
  gap: 0.35rem;
}

.full-width {
  grid-column: 1 / -1;
}

.form-grid small {
  color: #b42318;
}

.assignment-row {
  align-items: start;
  justify-content: space-between;
  padding: 1.1rem;
  border: 1px solid rgba(10, 143, 91, 0.08);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 251, 248, 0.95));
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    border-color 180ms ease;
}

.assignment-row:hover {
  transform: translateY(-2px);
  border-color: rgba(10, 143, 91, 0.16);
  box-shadow: 0 18px 42px rgba(10, 31, 21, 0.06);
}

.assignment-row--selected {
  border-color: rgba(10, 143, 91, 0.2);
  box-shadow: 0 0 0 2px rgba(10, 143, 91, 0.08);
}

.assignment-row strong {
  color: #111111;
  line-height: 1.2;
}

.assignment-row p,
.assignment-row small {
  margin: 0.3rem 0 0;
  color: #596761;
  line-height: 1.55;
}

.action-stack {
  display: grid;
  gap: 0.55rem;
  width: min(100%, 240px);
  flex-shrink: 0;
}

.action-button {
  gap: 0.45rem;
}

.assignment-detail-card {
  display: grid;
  gap: 1rem;
  padding: 1.15rem;
  border: 1px solid rgba(10, 143, 91, 0.08);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(244, 250, 247, 0.96));
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem;
}

.detail-item {
  display: grid;
  gap: 0.25rem;
  padding: 0.85rem 0.9rem;
  border-radius: 14px;
  border: 1px solid rgba(10, 143, 91, 0.08);
  background: #fff;
}

.detail-item span {
  color: #596761;
  font-size: 0.78rem;
}

.detail-item strong {
  color: #111111;
  line-height: 1.35;
}

.detail-item--wide {
  grid-column: 1 / -1;
}

@media (max-width: 1080px) {
  .content-grid,
  .form-grid,
  .detail-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .page-head,
  .assignment-row {
    display: grid;
  }

  .title-row,
  .section-head {
    align-items: flex-start;
  }

  .page-head,
  .response-card,
  .assignments-list-card {
    padding: 1.05rem;
  }

  .page-head .badge,
  .assignment-row,
  .action-stack {
    width: 100%;
  }

  .assignment-row {
    gap: 0.8rem;
  }

  .action-stack .action-button {
    justify-content: center;
  }

  .assignment-row strong,
  .assignment-row p,
  .assignment-row small {
    overflow-wrap: anywhere;
  }
}
</style>
