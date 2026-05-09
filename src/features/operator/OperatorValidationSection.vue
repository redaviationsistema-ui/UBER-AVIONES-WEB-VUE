<script setup>
defineProps({
  validationForm: { type: Object, required: true },
  validationErrors: { type: Object, required: true },
  validations: { type: Array, required: true },
  requests: { type: Array, required: true },
  aircraftOptions: { type: Array, required: true },
  crewOptions: { type: Array, required: true },
  providerOptions: { type: Array, required: true },
  availabilityOptions: { type: Array, required: true },
  viabilityOptions: { type: Array, required: true },
  weatherOptions: { type: Array, required: true },
  documentOptions: { type: Array, required: true },
})

defineEmits(['update-field', 'create', 'approve', 'review', 'not-viable'])
</script>

<template>
  <section class="validation-page">
    <div class="page-head surface">
      <div>
        <span class="eyebrow">Validación</span>
        <h3>Centro de validación operativa</h3>
        <p class="muted">
          Confirma aeronave, proveedor, tripulación, documentos, clima y viabilidad antes de liberar la operación.
        </p>
      </div>

      <button class="primary-action" type="button" @click="$emit('create')">
        + Nueva validación
      </button>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card surface">
        <span>En revisión</span>
        <strong>{{ validations.filter(v => v.status === 'En revision').length }}</strong>
      </div>

      <div class="kpi-card surface">
        <span>Aprobadas</span>
        <strong>{{ validations.filter(v => v.status === 'Aprobada').length }}</strong>
      </div>

      <div class="kpi-card surface">
        <span>No viables</span>
        <strong>{{ validations.filter(v => v.status === 'No viable').length }}</strong>
      </div>

      <div class="kpi-card surface">
        <span>Total activas</span>
        <strong>{{ validations.length }}</strong>
      </div>
    </div>

    <div class="content-grid">
      <!-- LISTA PRINCIPAL -->
      <section class="surface list-card">
        <div class="section-head">
          <div>
            <h4>Validaciones activas</h4>
            <p class="muted">Toda operación debe superar esta fase antes de asignación.</p>
          </div>

          <span class="badge">{{ validations.length }} activas</span>
        </div>

        <div class="validation-list">
          <article
            v-for="item in validations"
            :key="item.id"
            class="validation-row"
            :class="{
              'is-review': item.status === 'En revision',
              'is-approved': item.status === 'Aprobada',
              'is-not-viable': item.status === 'No viable'
            }"
          >
            <div class="validation-main">
              <span class="status-line"></span>

              <div class="validation-content">
                <div class="validation-top">
                  <strong>#{{ item.requestId }} · {{ item.aircraftSuggestion }}</strong>
                  <span class="badge">{{ item.status }}</span>
                </div>

                <p>
                  {{ item.provider }} · {{ item.availability }} ·
                  {{ item.viability }} · {{ item.weather }}
                </p>

                <small>
                  {{ item.documents }} · {{ item.catering }}
                </small>

                <div class="validation-checks">
                  <span>Proveedor: {{ item.provider ? '✔' : '✖' }}</span>
                  <span>Docs: {{ item.documents }}</span>
                  <span>Clima: {{ item.weather }}</span>
                </div>
              </div>
            </div>

            <div class="action-stack">
              <button
                class="approve-button"
                type="button"
                @click="$emit('approve', item.id)"
              >
                Aprobar
              </button>

              <button
                class="ghost-button"
                type="button"
                @click="$emit('review', item.id)"
              >
                Revisión
              </button>

              <button
                class="ghost-button danger-button"
                type="button"
                @click="$emit('not-viable', item.id)"
              >
                No viable
              </button>
            </div>
          </article>
        </div>
      </section>

      <!-- CHECKLIST -->
      <section class="surface form-card">
        <div class="form-head">
          <h4>Checklist de validación</h4>
          <p class="muted">
            Ninguna operación se libera sin disponibilidad, documentación y viabilidad confirmada.
          </p>
        </div>

        <div class="form-grid">
          <label>
            <span>Solicitud</span>
            <select
              :value="validationForm.requestId"
              @change="$emit('update-field', { form: 'validation', field: 'requestId', value: $event.target.value })"
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
            <small v-if="validationErrors.requestId">{{ validationErrors.requestId }}</small>
          </label>

          <label>
            <span>Aeronave</span>
            <select
              :value="validationForm.aircraftSuggestion"
              @change="$emit('update-field', { form: 'validation', field: 'aircraftSuggestion', value: $event.target.value })"
            >
              <option value="">Selecciona</option>
              <option v-for="item in aircraftOptions" :key="item" :value="item">
                {{ item }}
              </option>
            </select>
          </label>

          <label>
            <span>Sobrecargo</span>
            <select
              :value="validationForm.crewSuggestion"
              @change="$emit('update-field', { form: 'validation', field: 'crewSuggestion', value: $event.target.value })"
            >
              <option value="">Selecciona</option>
              <option v-for="item in crewOptions" :key="item" :value="item">
                {{ item }}
              </option>
            </select>
          </label>

          <label>
            <span>Proveedor</span>
            <select
              :value="validationForm.provider"
              @change="$emit('update-field', { form: 'validation', field: 'provider', value: $event.target.value })"
            >
              <option value="">Selecciona</option>
              <option v-for="item in providerOptions" :key="item" :value="item">
                {{ item }}
              </option>
            </select>
            <small v-if="validationErrors.provider">{{ validationErrors.provider }}</small>
          </label>

          <label>
            <span>Disponibilidad</span>
            <select
              :value="validationForm.availability"
              @change="$emit('update-field', { form: 'validation', field: 'availability', value: $event.target.value })"
            >
              <option v-for="item in availabilityOptions" :key="item" :value="item">
                {{ item }}
              </option>
            </select>
          </label>

          <label>
            <span>Ruta</span>
            <select
              :value="validationForm.viability"
              @change="$emit('update-field', { form: 'validation', field: 'viability', value: $event.target.value })"
            >
              <option v-for="item in viabilityOptions" :key="item" :value="item">
                {{ item }}
              </option>
            </select>
          </label>

          <label>
            <span>Clima</span>
            <select
              :value="validationForm.weather"
              @change="$emit('update-field', { form: 'validation', field: 'weather', value: $event.target.value })"
            >
              <option v-for="item in weatherOptions" :key="item" :value="item">
                {{ item }}
              </option>
            </select>
          </label>

          <label>
            <span>Documentos</span>
            <select
              :value="validationForm.documents"
              @change="$emit('update-field', { form: 'validation', field: 'documents', value: $event.target.value })"
            >
              <option v-for="item in documentOptions" :key="item" :value="item">
                {{ item }}
              </option>
            </select>
          </label>

          <label>
            <span>Catering</span>
            <input
              :value="validationForm.catering"
              type="text"
              placeholder="Confirmado / pendiente"
              @input="$emit('update-field', { form: 'validation', field: 'catering', value: $event.target.value })"
            />
          </label>

          <label class="full-width">
            <span>Observaciones operativas</span>
            <textarea
              :value="validationForm.observations"
              rows="3"
              placeholder="Riesgos, faltantes, restricciones..."
              @input="$emit('update-field', { form: 'validation', field: 'observations', value: $event.target.value })"
            ></textarea>
            <small v-if="validationErrors.approval">{{ validationErrors.approval }}</small>
          </label>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.validation-page,
.content-grid,
.validation-list {
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
.validation-top {
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
  font-size: 0.85rem;
  color: #70675c;
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

.validation-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  border-radius: 18px;
  background: #faf8f3;
  border: 1px solid rgba(201, 169, 107, 0.16);
}

.validation-main {
  display: flex;
  gap: 0.85rem;
  flex: 1;
}

.status-line {
  width: 5px;
  border-radius: 999px;
  background: #c8a96b;
}

.is-review .status-line {
  background: #d4a017;
}

.is-approved .status-line {
  background: #16a34a;
}

.is-not-viable .status-line {
  background: #b42318;
}

.validation-content p,
.validation-content small {
  margin: 0.3rem 0 0;
}

.validation-checks {
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

.approve-button {
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
  .validation-row {
    display: grid;
  }

  .action-stack {
    width: 100%;
  }
}
</style>