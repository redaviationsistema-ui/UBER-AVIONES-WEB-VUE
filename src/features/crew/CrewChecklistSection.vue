<script setup>
import CrewUiIcon from './CrewUiIcon.vue'

defineProps({
  checklistItems: { type: Array, required: true },
  checklistStatus: { type: String, required: true },
  checklistOptions: { type: Array, required: true },
  itemOptions: { type: Array, required: true },
  serviceForm: { type: Object, required: true },
  serviceStates: { type: Array, required: true },
  attentionTypes: { type: Array, required: true },
  finalReportForm: { type: Object, required: true },
  finalReportErrors: { type: Object, required: true },
  reportResults: { type: Array, required: true },
  internalRatings: { type: Array, required: true },
})

defineEmits(['update-field', 'update-check-item', 'save-progress', 'report-incident', 'complete-checklist', 'start-service', 'mark-cabina-lista', 'finalize-service', 'sign-report', 'send-report'])
</script>

<template>
  <section class="checklist-page">
    <div class="page-head surface">
      <div class="hero-copy">
        <div class="title-row">
          <span class="icon-badge"><CrewUiIcon name="checklist" :size="20" /></span>
          <div>
            <span class="eyebrow">Checklist</span>
            <h3>Preparacion, servicio y reporte final</h3>
          </div>
        </div>
        <p class="muted">
          No puedes iniciar servicio si el checklist esta incompleto. Si un item cae en incidencia, debes crear reporte y adjuntar evidencia cuando aplique.
        </p>
      </div>
      <div class="action-row">
        <button class="ghost-button action-button" type="button" @click="$emit('save-progress')">
          <CrewUiIcon name="report" :size="15" />
          Guardar progreso
        </button>
        <button class="ghost-button action-button" type="button" @click="$emit('report-incident')">
          <CrewUiIcon name="incident" :size="15" />
          Reportar incidencia
        </button>
        <button class="primary-action action-button" type="button" @click="$emit('complete-checklist')">
          <CrewUiIcon name="checklist" :size="15" />
          Completar checklist
        </button>
      </div>
    </div>

    <div class="content-grid">
      <section class="surface checklist-card">
        <div class="section-head">
          <div class="title-row title-row--compact">
            <span class="mini-icon"><CrewUiIcon name="cabin" :size="17" /></span>
            <h4>Checklist pre-vuelo</h4>
          </div>
          <span class="badge">{{ checklistStatus }}</span>
        </div>
        <div class="items-grid">
          <article v-for="item in checklistItems" :key="item.id" class="item-card">
            <strong>{{ item.section }} - {{ item.label }}</strong>
            <p>{{ item.detail }}</p>
            <select :value="item.state" @change="$emit('update-check-item', { id: item.id, value: $event.target.value })">
              <option v-for="option in itemOptions" :key="option" :value="option">{{ option }}</option>
            </select>
          </article>
        </div>
      </section>

      <section class="surface service-card">
        <div class="title-row title-row--compact">
          <span class="mini-icon"><CrewUiIcon name="service" :size="17" /></span>
          <h4>Servicio activo</h4>
        </div>
        <div class="form-grid">
          <label>
            <span>Estado servicio</span>
            <select :value="serviceForm.state" @change="$emit('update-field', { form: 'service', field: 'state', value: $event.target.value })">
              <option v-for="item in serviceStates" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>
          <label>
            <span>Pasajeros</span>
            <input :value="serviceForm.passengers" type="text" @input="$emit('update-field', { form: 'service', field: 'passengers', value: $event.target.value })" />
          </label>
          <label>
            <span>Tipo de atencion</span>
            <select :value="serviceForm.attentionType" @change="$emit('update-field', { form: 'service', field: 'attentionType', value: $event.target.value })">
              <option value="">Selecciona</option>
              <option v-for="item in attentionTypes" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>
          <label class="full-width">
            <span>Notas internas</span>
            <textarea :value="serviceForm.notes" rows="3" @input="$emit('update-field', { form: 'service', field: 'notes', value: $event.target.value })"></textarea>
          </label>
        </div>
        <div class="service-actions">
          <button class="ghost-button action-button" type="button" @click="$emit('start-service')">
            <CrewUiIcon name="service" :size="15" />
            Iniciar servicio
          </button>
          <button class="ghost-button action-button" type="button" @click="$emit('mark-cabina-lista')">
            <CrewUiIcon name="cabin" :size="15" />
            Marcar cabina lista
          </button>
          <button class="primary-action action-button" type="button" @click="$emit('finalize-service')">
            <CrewUiIcon name="checklist" :size="15" />
            Finalizar servicio
          </button>
        </div>
      </section>
    </div>

    <section class="surface report-card">
      <div class="section-head">
        <div class="title-row title-row--compact">
          <span class="mini-icon"><CrewUiIcon name="report" :size="17" /></span>
          <h4>Reporte post-vuelo</h4>
        </div>
        <span class="badge">Obligatorio para cerrar vuelo</span>
      </div>
      <div class="report-grid">
        <label>
          <span>Vuelo</span>
          <input :value="finalReportForm.flight" type="text" @input="$emit('update-field', { form: 'finalReport', field: 'flight', value: $event.target.value })" />
        </label>
        <label>
          <span>Hora de inicio</span>
          <input :value="finalReportForm.startTime" type="time" @input="$emit('update-field', { form: 'finalReport', field: 'startTime', value: $event.target.value })" />
        </label>
        <label>
          <span>Hora de cierre</span>
          <input :value="finalReportForm.endTime" type="time" @input="$emit('update-field', { form: 'finalReport', field: 'endTime', value: $event.target.value })" />
        </label>
        <label>
          <span>Resultado</span>
          <select :value="finalReportForm.result" @change="$emit('update-field', { form: 'finalReport', field: 'result', value: $event.target.value })">
            <option value="">Selecciona</option>
            <option v-for="item in reportResults" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
        <label>
          <span>Evaluacion interna</span>
          <select :value="finalReportForm.internalRating" @change="$emit('update-field', { form: 'finalReport', field: 'internalRating', value: $event.target.value })">
            <option value="">Selecciona</option>
            <option v-for="item in internalRatings" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
        <label>
          <span>Firma digital</span>
          <input :value="finalReportForm.signature" type="text" @input="$emit('update-field', { form: 'finalReport', field: 'signature', value: $event.target.value })" />
          <small v-if="finalReportErrors.signature">{{ finalReportErrors.signature }}</small>
        </label>
        <label class="full-width">
          <span>Comentarios</span>
          <textarea :value="finalReportForm.comments" rows="3" @input="$emit('update-field', { form: 'finalReport', field: 'comments', value: $event.target.value })"></textarea>
        </label>
        <label class="full-width">
          <span>Incidencias vinculadas</span>
          <input :value="finalReportForm.linkedIncident" type="text" @input="$emit('update-field', { form: 'finalReport', field: 'linkedIncident', value: $event.target.value })" />
          <small v-if="finalReportErrors.linkedIncident">{{ finalReportErrors.linkedIncident }}</small>
          <small v-if="finalReportErrors.editing">{{ finalReportErrors.editing }}</small>
        </label>
      </div>
      <div class="service-actions">
        <button class="ghost-button action-button" type="button" @click="$emit('sign-report')">
          <CrewUiIcon name="profile" :size="15" />
          Firmar
        </button>
        <button class="primary-action action-button" type="button" @click="$emit('send-report')">
          <CrewUiIcon name="report" :size="15" />
          Enviar
        </button>
      </div>
    </section>
  </section>
</template>

<style scoped>
.checklist-page,
.content-grid,
.items-grid,
.report-grid {
  display: grid;
  gap: 1.5rem;
}

.page-head,
.checklist-card,
.service-card,
.report-card {
  padding: 1.4rem;
}

.page-head,
.section-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
}

.hero-copy {
  display: grid;
  gap: 0.75rem;
  min-width: 0;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.title-row--compact {
  gap: 0.55rem;
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
  background: linear-gradient(180deg, rgba(10, 143, 91, 0.12), rgba(10, 143, 91, 0.04));
}

.page-head h3,
.section-head h4 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.04em;
}

.page-head h3 {
  font-size: clamp(1.8rem, 4vw, 2.5rem);
}

.action-row,
.service-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
}

.action-button {
  gap: 0.45rem;
}

.content-grid {
  grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
}

.items-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.item-card {
  display: grid;
  gap: 0.45rem;
  padding: 1.05rem;
  border-radius: 16px;
  background: #faf8f3;
}

.item-card p {
  margin: 0;
  color: #5d5d5d;
}

.form-grid,
.report-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 1.15rem;
}

.form-grid label,
.report-grid label {
  display: grid;
  gap: 0.35rem;
}

.full-width {
  grid-column: 1 / -1;
}

.report-grid small {
  color: #b42318;
}

@media (max-width: 1080px) {
  .content-grid,
  .items-grid,
  .form-grid,
  .report-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .page-head,
  .section-head {
    display: grid;
  }

  .title-row {
    align-items: flex-start;
  }

  .page-head,
  .checklist-card,
  .service-card,
  .report-card {
    padding: 1.05rem;
  }

  .action-row,
  .service-actions {
    display: grid;
    width: 100%;
  }

  .action-row .action-button,
  .service-actions .action-button {
    justify-content: center;
  }

  .item-card {
    padding: 0.85rem;
  }
}
</style>
