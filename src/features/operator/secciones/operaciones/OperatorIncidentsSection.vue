<script setup>
defineProps({
  incidentForm: { type: Object, required: true },
  incidentErrors: { type: Object, required: true },
  incidentBoard: { type: Array, required: true },
  requests: { type: Array, required: true },
  incidentTypes: { type: Array, required: true },
  priorityOptions: { type: Array, required: true },
  incidentStates: { type: Array, required: true },
  responsibles: { type: Array, required: true },
})

defineEmits(['update-field', 'create', 'escalate', 'resolve', 'close'])
</script>

<template>
  <section class="incidents-page">
    <div class="page-head surface">
      <div>
        <span class="eyebrow">Incidencias</span>
        <h3>Centro de incidencias operativas</h3>
        <p class="muted">
          Registra, escala, resuelve y cierra incidencias con evidencia y acción tomada.
        </p>
      </div>

      <button class="primary-action" type="button" @click="$emit('create')">
        + Crear incidencia
      </button>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card surface">
        <span>Abiertas</span>
        <strong>{{ incidentBoard.filter(i => i.state === 'Abierta').length }}</strong>
      </div>

      <div class="kpi-card surface">
        <span>Alta prioridad</span>
        <strong>{{ incidentBoard.filter(i => i.priority === 'Alta').length }}</strong>
      </div>

      <div class="kpi-card surface">
        <span>Críticas</span>
        <strong>{{ incidentBoard.filter(i => i.priority === 'Critica').length }}</strong>
      </div>

      <div class="kpi-card surface">
        <span>Resueltas</span>
        <strong>{{ incidentBoard.filter(i => i.state === 'Resuelta').length }}</strong>
      </div>
    </div>

    <div class="content-grid">
      <!-- BOARD -->
      <section class="surface list-card">
        <div class="section-head">
          <div>
            <h4>Board de incidencias</h4>
            <p class="muted">
              Supervisa riesgos, responsables y resolución hasta cierre operativo.
            </p>
          </div>

          <span class="badge">{{ incidentBoard.length }} activas</span>
        </div>

        <div class="incident-list">
          <article
            v-for="item in incidentBoard"
            :key="item.id"
            class="incident-card"
            :class="{
              'is-critical': item.priority === 'Critica',
              'is-high': item.priority === 'Alta',
              'is-medium': item.priority === 'Media',
              'is-resolved': item.state === 'Resuelta'
            }"
          >
            <span class="status-line"></span>

            <div class="incident-main">
              <div class="incident-top">
                <strong>#{{ item.requestId }} · {{ item.type }}</strong>
                <span class="badge">{{ item.state }}</span>
              </div>

              <p>{{ item.priority }} · {{ item.responsible }}</p>

              <small>{{ item.description }}</small>

              <div class="incident-meta">
                <span v-if="item.evidence">Evidencia cargada</span>
                <span v-else>Evidencia pendiente</span>
              </div>
            </div>

            <div class="action-stack">
              <button
                class="resolve-button"
                type="button"
                @click="$emit('resolve', item.id)"
              >
                Resolver
              </button>

              <button
                class="ghost-button"
                type="button"
                @click="$emit('escalate', item.id)"
              >
                Escalar
              </button>

              <button
                class="ghost-button danger-button"
                type="button"
                @click="$emit('close', item.id)"
              >
                Cerrar
              </button>
            </div>
          </article>
        </div>
      </section>

      <!-- FORM -->
      <section class="surface form-card">
        <div class="form-head">
          <h4>Registro de incidencia</h4>
          <p class="muted">
            Toda incidencia debe documentarse con prioridad, evidencia y acción correctiva.
          </p>
        </div>

        <div class="form-grid">
          <label>
            <span>Reserva</span>
            <select
              :value="incidentForm.requestId"
              @change="$emit('update-field', { form: 'incident', field: 'requestId', value: $event.target.value })"
            >
              <option value="">Selecciona</option>
              <option
                v-for="item in requests"
                :key="item.id"
                :value="String(item.id)"
              >
                #{{ item.id }} · {{ item.client }}
              </option>
            </select>
          </label>

          <label>
            <span>Tipo</span>
            <select
              :value="incidentForm.type"
              @change="$emit('update-field', { form: 'incident', field: 'type', value: $event.target.value })"
            >
              <option value="">Selecciona</option>
              <option v-for="item in incidentTypes" :key="item" :value="item">
                {{ item }}
              </option>
            </select>
          </label>

          <label>
            <span>Prioridad</span>
            <select
              :value="incidentForm.priority"
              @change="$emit('update-field', { form: 'incident', field: 'priority', value: $event.target.value })"
            >
              <option value="">Selecciona</option>
              <option
                v-for="item in priorityOptions"
                :key="item"
                :value="item"
              >
                {{ item }}
              </option>
            </select>
            <small v-if="incidentErrors.priority">{{ incidentErrors.priority }}</small>
          </label>

          <label>
            <span>Responsable</span>
            <select
              :value="incidentForm.responsible"
              @change="$emit('update-field', { form: 'incident', field: 'responsible', value: $event.target.value })"
            >
              <option value="">Selecciona</option>
              <option
                v-for="item in responsibles"
                :key="item"
                :value="item"
              >
                {{ item }}
              </option>
            </select>
          </label>

          <label class="full-width">
            <span>Descripción</span>
            <textarea
              :value="incidentForm.description"
              rows="3"
              placeholder="Describe el riesgo, impacto o problema operativo..."
              @input="$emit('update-field', { form: 'incident', field: 'description', value: $event.target.value })"
            ></textarea>
            <small v-if="incidentErrors.description">{{ incidentErrors.description }}</small>
          </label>

          <label>
            <span>Evidencia</span>
            <input
              :value="incidentForm.evidence"
              type="text"
              placeholder="URL, referencia o archivo"
              @input="$emit('update-field', { form: 'incident', field: 'evidence', value: $event.target.value })"
            />
            <small v-if="incidentErrors.evidence">{{ incidentErrors.evidence }}</small>
          </label>

          <label>
            <span>Estado</span>
            <select
              :value="incidentForm.state"
              @change="$emit('update-field', { form: 'incident', field: 'state', value: $event.target.value })"
            >
              <option
                v-for="item in incidentStates"
                :key="item"
                :value="item"
              >
                {{ item }}
              </option>
            </select>
          </label>

          <label class="full-width">
            <span>Acción tomada</span>
            <textarea
              :value="incidentForm.actionTaken"
              rows="3"
              placeholder="Corrección, escalamiento, mitigación o cierre..."
              @input="$emit('update-field', { form: 'incident', field: 'actionTaken', value: $event.target.value })"
            ></textarea>
            <small v-if="incidentErrors.actionTaken">{{ incidentErrors.actionTaken }}</small>
          </label>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.incidents-page,
.content-grid,
.incident-list {
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
.incident-top {
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

.incident-card {
  display: grid;
  grid-template-columns: 5px 1fr auto;
  gap: 1rem;
  padding: 1rem;
  border-radius: 18px;
  background: #faf8f3;
  border: 1px solid rgba(201, 169, 107, 0.12);
}

.status-line {
  border-radius: 999px;
  background: #c8a96b;
}

.is-critical .status-line {
  background: #b42318;
}

.is-high .status-line {
  background: #ea580c;
}

.is-medium .status-line {
  background: #c8a96b;
}

.is-resolved .status-line {
  background: #16a34a;
}

.incident-main {
  display: grid;
  gap: 0.35rem;
}

.incident-card p,
.incident-card small {
  margin: 0;
}

.incident-meta {
  display: flex;
  gap: 0.5rem;
  font-size: 0.82rem;
  color: #70675c;
}

.action-stack {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.resolve-button {
  border: 0;
  border-radius: 14px;
  padding: 0.75rem 1rem;
  background: #111;
  color: white;
  font-weight: 800;
  cursor: pointer;
}

.danger-button {
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
  .incident-card {
    display: grid;
    grid-template-columns: 1fr;
  }

  .action-stack {
    width: 100%;
  }
}
</style>