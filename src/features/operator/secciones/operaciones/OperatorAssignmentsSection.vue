<script setup>
defineProps({
  assignmentForm: { type: Object, required: true },
  assignmentErrors: { type: Object, required: true },
  assignments: { type: Array, required: true },
  requests: { type: Array, required: true },
  aircraftOptions: { type: Array, required: true },
  providerOptions: { type: Array, required: true },
  crewOptions: { type: Array, required: true },
  pilotOptions: { type: Array, required: true },
  operators: { type: Array, required: true },
  priorityOptions: { type: Array, required: true },
  assignmentStates: { type: Array, required: true },
})

defineEmits(['update-field', 'create', 'assign-aircraft', 'assign-crew', 'reassign', 'confirm'])
</script>

<template>
  <section class="assignments-page">
    <div class="page-head surface">
      <div>
        <span class="eyebrow">Asignaciones</span>
        <h3>Centro de asignaciones operativas</h3>
        <p class="muted">
          Asigna aeronave, proveedor, piloto y sobrecargo sin duplicar recursos ni cruzar horarios.
        </p>
      </div>

      <button class="primary-action" type="button" @click="$emit('create')">
        + Nueva asignación
      </button>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card surface">
        <span>Pendientes</span>
        <strong>{{ assignments.filter(a => a.status === 'Pendiente').length }}</strong>
      </div>

      <div class="kpi-card surface">
        <span>Confirmadas</span>
        <strong>{{ assignments.filter(a => a.status === 'Confirmada').length }}</strong>
      </div>

      <div class="kpi-card surface">
        <span>Alta prioridad</span>
        <strong>{{ assignments.filter(a => a.priority === 'Alta').length }}</strong>
      </div>

      <div class="kpi-card surface">
        <span>Activas</span>
        <strong>{{ assignments.length }}</strong>
      </div>
    </div>

    <div class="content-grid">
      <section class="surface list-card">
        <div class="section-head">
          <div>
            <h4>Dispatch de asignaciones</h4>
            <p class="muted">Controla recursos, horarios y responsables antes de liberar operación.</p>
          </div>

          <span class="badge">{{ assignments.length }} activas</span>
        </div>

        <div class="assignment-list">
          <article
            v-for="item in assignments"
            :key="item.id"
            class="assignment-row"
            :class="{
              'is-pending': item.status === 'Pendiente',
              'is-confirmed': item.status === 'Confirmada',
              'is-high': item.priority === 'Alta'
            }"
          >
            <div class="assignment-main">
              <span class="status-line"></span>

              <div class="assignment-content">
                <div class="assignment-top">
                  <strong>#{{ item.requestId }} · {{ item.aircraft }}</strong>
                  <span class="badge">{{ item.status }}</span>
                </div>

                <p>{{ item.provider }} · {{ item.crew }} · {{ item.pilot }}</p>

                <small>
                  {{ item.briefingTime }} briefing ·
                  {{ item.departureTime }} salida ·
                  {{ item.priority }}
                </small>
              </div>
            </div>

            <div class="action-stack">
              <button class="confirm-button" type="button" @click="$emit('confirm', item.id)">
                Confirmar
              </button>

              <button class="ghost-button" type="button" @click="$emit('assign-aircraft', item.id)">
                Aeronave
              </button>

              <button class="ghost-button" type="button" @click="$emit('assign-crew', item.id)">
                Sobrecargo
              </button>

              <button class="ghost-button" type="button" @click="$emit('reassign', item.id)">
                Reasignar
              </button>
            </div>
          </article>
        </div>
      </section>

      <section class="surface form-card">
        <div class="form-head">
          <h4>Panel de asignación</h4>
          <p class="muted">Completa recursos y horarios para evitar cruces operativos.</p>
        </div>

        <div class="form-grid">
          <label>
            <span>Reserva / solicitud</span>
            <select
              :value="assignmentForm.requestId"
              @change="$emit('update-field', { form: 'assignment', field: 'requestId', value: $event.target.value })"
            >
              <option value="">Selecciona</option>
              <option v-for="item in requests" :key="item.id" :value="String(item.id)">
                #{{ item.id }} · {{ item.client }}
              </option>
            </select>
          </label>

          <label>
            <span>Aeronave</span>
            <select
              :value="assignmentForm.aircraft"
              @change="$emit('update-field', { form: 'assignment', field: 'aircraft', value: $event.target.value })"
            >
              <option value="">Selecciona</option>
              <option v-for="item in aircraftOptions" :key="item" :value="item">{{ item }}</option>
            </select>
            <small v-if="assignmentErrors.aircraft">{{ assignmentErrors.aircraft }}</small>
          </label>

          <label>
            <span>Proveedor</span>
            <select
              :value="assignmentForm.provider"
              @change="$emit('update-field', { form: 'assignment', field: 'provider', value: $event.target.value })"
            >
              <option value="">Selecciona</option>
              <option v-for="item in providerOptions" :key="item" :value="item">{{ item }}</option>
            </select>
            <small v-if="assignmentErrors.provider">{{ assignmentErrors.provider }}</small>
          </label>

          <label>
            <span>Sobrecargo</span>
            <select
              :value="assignmentForm.crew"
              @change="$emit('update-field', { form: 'assignment', field: 'crew', value: $event.target.value })"
            >
              <option value="">Selecciona</option>
              <option v-for="item in crewOptions" :key="item" :value="item">{{ item }}</option>
            </select>
            <small v-if="assignmentErrors.crew">{{ assignmentErrors.crew }}</small>
          </label>

          <label>
            <span>Piloto</span>
            <select
              :value="assignmentForm.pilot"
              @change="$emit('update-field', { form: 'assignment', field: 'pilot', value: $event.target.value })"
            >
              <option value="">Selecciona</option>
              <option v-for="item in pilotOptions" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>

          <label>
            <span>Operador responsable</span>
            <select
              :value="assignmentForm.operatorResponsible"
              @change="$emit('update-field', { form: 'assignment', field: 'operatorResponsible', value: $event.target.value })"
            >
              <option value="">Selecciona</option>
              <option v-for="item in operators" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>

          <label>
            <span>Hora briefing</span>
            <input
              :value="assignmentForm.briefingTime"
              type="time"
              @input="$emit('update-field', { form: 'assignment', field: 'briefingTime', value: $event.target.value })"
            />
            <small v-if="assignmentErrors.briefingTime">{{ assignmentErrors.briefingTime }}</small>
          </label>

          <label>
            <span>Hora salida</span>
            <input
              :value="assignmentForm.departureTime"
              type="time"
              @input="$emit('update-field', { form: 'assignment', field: 'departureTime', value: $event.target.value })"
            />
          </label>

          <label>
            <span>Prioridad</span>
            <select
              :value="assignmentForm.priority"
              @change="$emit('update-field', { form: 'assignment', field: 'priority', value: $event.target.value })"
            >
              <option v-for="item in priorityOptions" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>

          <label>
            <span>Estado asignación</span>
            <select
              :value="assignmentForm.status"
              @change="$emit('update-field', { form: 'assignment', field: 'status', value: $event.target.value })"
            >
              <option v-for="item in assignmentStates" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>

          <label class="full-width">
            <span>Notas internas</span>
            <textarea
              :value="assignmentForm.notes"
              rows="3"
              placeholder="Restricciones, cambios, instrucciones internas..."
              @input="$emit('update-field', { form: 'assignment', field: 'notes', value: $event.target.value })"
            ></textarea>
            <small v-if="assignmentErrors.schedule">{{ assignmentErrors.schedule }}</small>
          </label>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.assignments-page,
.content-grid,
.assignment-list {
  display: grid;
  gap: 1rem;
}

.page-head,
.form-card,
.list-card,
.kpi-card {
  padding: 1rem;
}

.page-head,
.section-head,
.assignment-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.page-head h3,
.form-card h4,
.list-card h4 {
  margin: 0;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
}

.kpi-card {
  border-radius: 18px;
}

.kpi-card span {
  display: block;
  color: #70675c;
  font-size: 0.85rem;
}

.kpi-card strong {
  display: block;
  margin-top: 0.35rem;
  font-size: 1.45rem;
}

.content-grid {
  grid-template-columns: minmax(0, 1.2fr) minmax(340px, 0.8fr);
  align-items: start;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
  margin-top: 1rem;
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  border-radius: 18px;
  background: var(--surface-premium);
  border: 1px solid rgba(201, 169, 107, 0.16);
}

.assignment-main {
  display: flex;
  gap: 0.85rem;
  flex: 1;
}

.status-line {
  width: 5px;
  border-radius: 999px;
  background: #c8a96b;
}

.is-confirmed .status-line {
  background: #16a34a;
}

.is-high .status-line {
  background: #b42318;
}

.assignment-content p,
.assignment-content small {
  margin: 0.3rem 0 0;
}

.action-stack {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.confirm-button {
  border: 0;
  border-radius: 14px;
  padding: 0.75rem 1rem;
  background: #111;
  color: white;
  font-weight: 800;
  cursor: pointer;
}

@media (max-width: 1080px) {
  .content-grid,
  .form-grid,
  .kpi-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .page-head,
  .assignment-row {
    display: grid;
  }

  .action-stack {
    width: 100%;
  }
}
</style>