<script setup>
defineProps({
  reportForm: { type: Object, required: true },
  reportErrors: { type: Object, required: true },
  reports: { type: Array, required: true },
  analytics: { type: Array, required: true },
  reportTypes: { type: Array, required: true },
  regions: { type: Array, required: true },
  operators: { type: Array, required: true },
  operationStates: { type: Array, required: true },
  reportFormats: { type: Array, required: true },
})

defineEmits(['update-field', 'create'])
</script>

<template>
  <section class="reports-page">
    <div class="page-head surface">
      <div>
        <span class="eyebrow">Reportes</span>
        <h3>CRUD de reportes y KPIs</h3>
        <p class="muted">El operador genera reportes operativos, de incidencias, tripulacion, tiempos de respuesta y performance sin exponer informacion financiera sensible.</p>
      </div>
      <button class="primary-action" type="button" @click="$emit('create')">Crear reporte</button>
    </div>

    <div class="content-grid">
      <section class="surface form-card">
        <h4>Parametros del reporte</h4>
        <div class="form-grid">
          <label>
            <span>Tipo de reporte</span>
            <select :value="reportForm.type" @change="$emit('update-field', { form: 'report', field: 'type', value: $event.target.value })">
              <option value="">Selecciona</option>
              <option v-for="item in reportTypes" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>
          <label>
            <span>Fecha inicio</span>
            <input :value="reportForm.startDate" type="date" @input="$emit('update-field', { form: 'report', field: 'startDate', value: $event.target.value })" />
            <small v-if="reportErrors.startDate">{{ reportErrors.startDate }}</small>
          </label>
          <label>
            <span>Fecha fin</span>
            <input :value="reportForm.endDate" type="date" @input="$emit('update-field', { form: 'report', field: 'endDate', value: $event.target.value })" />
            <small v-if="reportErrors.endDate">{{ reportErrors.endDate }}</small>
          </label>
          <label>
            <span>Region</span>
            <select :value="reportForm.region" @change="$emit('update-field', { form: 'report', field: 'region', value: $event.target.value })">
              <option value="">Selecciona</option>
              <option v-for="item in regions" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>
          <label>
            <span>Operador</span>
            <select :value="reportForm.operator" @change="$emit('update-field', { form: 'report', field: 'operator', value: $event.target.value })">
              <option value="">Selecciona</option>
              <option v-for="item in operators" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>
          <label>
            <span>Estado</span>
            <select :value="reportForm.state" @change="$emit('update-field', { form: 'report', field: 'state', value: $event.target.value })">
              <option value="">Selecciona</option>
              <option v-for="item in operationStates" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>
          <label>
            <span>Formato</span>
            <select :value="reportForm.format" @change="$emit('update-field', { form: 'report', field: 'format', value: $event.target.value })">
              <option value="">Selecciona</option>
              <option v-for="item in reportFormats" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>
        </div>
      </section>

      <section class="surface list-card">
        <h4>KPIs del operador</h4>
        <div class="kpi-grid">
          <article v-for="item in analytics" :key="item.label" class="kpi-card">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
            <small>{{ item.detail }}</small>
          </article>
        </div>

        <h4 class="reports-title">Reportes generados</h4>
        <div class="report-list">
          <article v-for="item in reports" :key="item.id" class="report-row">
            <strong>{{ item.type }}</strong>
            <span>{{ item.startDate }} -> {{ item.endDate }}</span>
            <small>{{ item.region }} · {{ item.operator }} · {{ item.format }}</small>
          </article>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.reports-page,
.content-grid,
.report-list {
  display: grid;
  gap: 1rem;
}

.page-head,
.form-card,
.list-card {
  padding: 1rem;
}

.page-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
}

.page-head h3,
.form-card h4,
.list-card h4 {
  margin: 0;
}

.content-grid {
  grid-template-columns: minmax(0, 1fr) minmax(340px, 1fr);
}

.form-grid,
.kpi-grid {
  display: grid;
  gap: 0.85rem;
}

.form-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 1rem;
}

.form-grid label {
  display: grid;
  gap: 0.35rem;
}

.form-grid small {
  color: #b42318;
}

.kpi-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.kpi-card,
.report-row {
  display: grid;
  gap: 0.3rem;
  padding: 0.95rem;
  border-radius: 16px;
  background: var(--surface-premium);
}

.reports-title {
  margin-top: 1rem !important;
}

@media (max-width: 1080px) {
  .content-grid,
  .form-grid,
  .kpi-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .page-head {
    display: grid;
  }
}
</style>
