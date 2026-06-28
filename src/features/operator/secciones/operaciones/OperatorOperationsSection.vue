<script setup>
defineProps({
  operationForm: { type: Object, required: true },
  operationErrors: { type: Object, required: true },
  operations: { type: Array, required: true },
  requests: { type: Array, required: true },
  aircraftOptions: { type: Array, required: true },
  crewOptions: { type: Array, required: true },
  operationStates: { type: Array, required: true },
})

defineEmits(['update-field', 'create', 'start-briefing', 'mark-boarding', 'mark-en-vuelo', 'finish', 'report-incident'])
</script>

<template>
  <section class="operations-page">
    <div class="page-head surface">
      <div>
        <span class="eyebrow">Operaciones</span>
        <h3>Centro de control operativo</h3>
        <p class="muted">
          Monitorea briefing, boarding, vuelo, tracking, ETA, contrato, pago y cierre operativo en tiempo real.
        </p>
      </div>

      <button class="primary-action" type="button" @click="$emit('create')">
        + Nueva operación
      </button>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card surface">
        <span>Prevuelo</span>
        <strong>{{ operations.filter(o => o.status === 'Prevuelo').length }}</strong>
      </div>

      <div class="kpi-card surface">
        <span>Boarding</span>
        <strong>{{ operations.filter(o => o.status === 'Boarding').length }}</strong>
      </div>

      <div class="kpi-card surface">
        <span>En vuelo</span>
        <strong>{{ operations.filter(o => o.status === 'En vuelo').length }}</strong>
      </div>

      <div class="kpi-card surface">
        <span>Activas</span>
        <strong>{{ operations.length }}</strong>
      </div>
    </div>

    <div class="content-grid">
      <section class="surface list-card">
        <div class="section-head">
          <div>
            <h4>Torre operativa en vivo</h4>
            <p class="muted">Actualiza fases, ETA, tracking e incidencias desde una sola vista.</p>
          </div>

          <span class="badge">{{ operations.length }} activas</span>
        </div>

        <div class="operation-list">
          <article
            v-for="item in operations"
            :key="item.id"
            class="operation-row"
            :class="{
              'is-preflight': item.status === 'Prevuelo',
              'is-boarding': item.status === 'Boarding',
              'is-flight': item.status === 'En vuelo',
              'is-finished': item.status === 'Finalizada'
            }"
          >
            <div class="operation-main">
              <span class="status-line"></span>

              <div class="operation-content">
                <div class="operation-top">
                  <strong>#{{ item.requestId }} · {{ item.route }}</strong>
                  <span class="badge">{{ item.status }}</span>
                </div>

                <p>{{ item.aircraft }} · {{ item.crew }} · ETA {{ item.eta }}</p>

                <small>
                  {{ item.tracking }} · {{ item.paymentStatus }} ·
                  {{ item.contractSigned ? 'Contrato firmado' : 'Contrato pendiente' }}
                </small>

                <div class="operation-checks">
                  <span>{{ item.checklistComplete ? 'Checklist completo' : 'Checklist incompleto' }}</span>
                  <span>{{ item.aircraftConfirmed ? 'Aeronave confirmada' : 'Aeronave no confirmada' }}</span>
                </div>
              </div>
            </div>

            <div class="action-stack">
              <button class="main-button" type="button" @click="$emit('mark-en-vuelo', item.id)">
                En vuelo
              </button>

              <button class="ghost-button" type="button" @click="$emit('start-briefing', item.id)">
                Briefing
              </button>

              <button class="ghost-button" type="button" @click="$emit('mark-boarding', item.id)">
                Boarding
              </button>

              <button class="ghost-button" type="button" @click="$emit('finish', item.id)">
                Finalizar
              </button>

              <button class="ghost-button danger-button" type="button" @click="$emit('report-incident', item.id)">
                Incidencia
              </button>
            </div>
          </article>
        </div>
      </section>

      <section class="surface form-card">
        <div class="form-head">
          <h4>Panel de operación</h4>
          <p class="muted">Control interno para actualizar el estado real de la operación.</p>
        </div>

        <div class="form-grid">
          <label>
            <span>Reserva</span>
            <select
              :value="operationForm.requestId"
              @change="$emit('update-field', { form: 'operation', field: 'requestId', value: $event.target.value })"
            >
              <option value="">Selecciona</option>
              <option v-for="item in requests" :key="item.id" :value="String(item.id)">
                #{{ item.id }} · {{ item.client }}
              </option>
            </select>
          </label>

          <label>
            <span>Ruta</span>
            <input
              :value="operationForm.route"
              type="text"
              placeholder="MTY → TLC"
              @input="$emit('update-field', { form: 'operation', field: 'route', value: $event.target.value })"
            />
          </label>

          <label>
            <span>Aeronave</span>
            <select
              :value="operationForm.aircraft"
              @change="$emit('update-field', { form: 'operation', field: 'aircraft', value: $event.target.value })"
            >
              <option value="">Selecciona</option>
              <option v-for="item in aircraftOptions" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>

          <label>
            <span>Sobrecargo</span>
            <select
              :value="operationForm.crew"
              @change="$emit('update-field', { form: 'operation', field: 'crew', value: $event.target.value })"
            >
              <option value="">Selecciona</option>
              <option v-for="item in crewOptions" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>

          <label>
            <span>Estado operativo</span>
            <select
              :value="operationForm.status"
              @change="$emit('update-field', { form: 'operation', field: 'status', value: $event.target.value })"
            >
              <option v-for="item in operationStates" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>

          <label>
            <span>ETA</span>
            <input
              :value="operationForm.eta"
              type="text"
              placeholder="00:42"
              @input="$emit('update-field', { form: 'operation', field: 'eta', value: $event.target.value })"
            />
          </label>

          <label>
            <span>Tracking</span>
            <input
              :value="operationForm.tracking"
              type="text"
              placeholder="Asignado / Prevuelo / Activo"
              @input="$emit('update-field', { form: 'operation', field: 'tracking', value: $event.target.value })"
            />
          </label>

          <label>
            <span>Checklist</span>
            <select
              :value="String(operationForm.checklistComplete)"
              @change="$emit('update-field', { form: 'operation', field: 'checklistComplete', value: $event.target.value === 'true' })"
            >
              <option :value="true">Completo</option>
              <option :value="false">Incompleto</option>
            </select>
          </label>

          <label>
            <span>Pago</span>
            <select
              :value="operationForm.paymentStatus"
              @change="$emit('update-field', { form: 'operation', field: 'paymentStatus', value: $event.target.value })"
            >
              <option value="Pagado">Pagado</option>
              <option value="Pendiente">Pendiente</option>
            </select>
          </label>

          <label>
            <span>Contrato</span>
            <select
              :value="String(operationForm.contractSigned)"
              @change="$emit('update-field', { form: 'operation', field: 'contractSigned', value: $event.target.value === 'true' })"
            >
              <option :value="true">Firmado</option>
              <option :value="false">Sin firma</option>
            </select>
          </label>

          <label>
            <span>Aeronave confirmada</span>
            <select
              :value="String(operationForm.aircraftConfirmed)"
              @change="$emit('update-field', { form: 'operation', field: 'aircraftConfirmed', value: $event.target.value === 'true' })"
            >
              <option :value="true">Confirmada</option>
              <option :value="false">No confirmada</option>
            </select>
          </label>

          <label class="full-width">
            <span>Comentarios operativos</span>
            <textarea
              :value="operationForm.comments"
              rows="3"
              placeholder="Cambios, incidencias, instrucciones internas..."
              @input="$emit('update-field', { form: 'operation', field: 'comments', value: $event.target.value })"
            ></textarea>
            <small v-if="operationErrors.status">{{ operationErrors.status }}</small>
          </label>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.operations-page,
.content-grid,
.operation-list {
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
.operation-top {
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

.operation-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  border-radius: 18px;
  background: var(--surface-premium);
  border: 1px solid rgba(201, 169, 107, 0.16);
}

.operation-main {
  display: flex;
  gap: 0.85rem;
  flex: 1;
}

.status-line {
  width: 5px;
  border-radius: 999px;
  background: #c8a96b;
}

.is-boarding .status-line {
  background: #2563eb;
}

.is-flight .status-line {
  background: #16a34a;
}

.is-finished .status-line {
  background: #6b7280;
}

.operation-content p,
.operation-content small {
  margin: 0.3rem 0 0;
}

.operation-checks {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
  font-size: 0.82rem;
  color: #70675c;
}

.action-stack {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.main-button {
  border: 0;
  border-radius: 14px;
  padding: 0.75rem 1rem;
  background: #111;
  color: white;
  font-weight: 800;
  cursor: pointer;
}

.danger-button {
  border-color: rgba(180, 35, 24, 0.2);
  color: #b42318;
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
  .operation-row {
    display: grid;
  }

  .action-stack {
    width: 100%;
  }
}
</style>