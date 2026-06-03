<script setup>
import CrewUiIcon from './CrewUiIcon.vue'

defineProps({
  profileForm: { type: Object, required: true },
  profileErrors: { type: Object, required: true },
  providerName: { type: String, default: '' },
  currentStatus: { type: String, default: '' },
  documentsValidity: { type: Number, default: 0 },
  profileAlerts: { type: Array, default: () => [] },
  profileRating: { type: String, default: '' },
  bases: { type: Array, required: true },
  languages: { type: Array, required: true },
  profileStates: { type: Array, required: true },
})

defineEmits(['update-field', 'save'])
</script>

<template>
  <section class="profile-page">
    <section class="surface detail-panel">
      <div class="detail-head">
        <div>
          <p class="eyebrow">Panel de detalle</p>
          <h3>{{ profileForm.name || 'Mi expediente' }}</h3>
        </div>
        <div class="status-stack">
          <span class="status-chip status-chip-warning">{{ profileForm.profileState || 'Sin estado' }}</span>
          <span class="status-chip status-chip-neutral">{{ currentStatus || 'Sin estado operativo' }}</span>
        </div>
      </div>

      <div class="info-grid">
        <article class="info-card">
          <span>Proveedor</span>
          <strong>{{ providerName || 'Sin ligar' }}</strong>
        </article>
        <article class="info-card">
          <span>Base</span>
          <strong>{{ profileForm.base || 'N/D' }}</strong>
        </article>
        <article class="info-card">
          <span>Rating</span>
          <strong>{{ profileRating || 'Sin dato' }}</strong>
        </article>
        <article class="info-card">
          <span>Disponibilidad</span>
          <strong>{{ currentStatus || 'Sin dato' }}</strong>
        </article>
        <article class="info-card info-card-wide">
          <span>Certificaciones</span>
          <strong>{{ profileForm.certifications || profileForm.documents || 'Expediente pendiente' }}</strong>
        </article>
      </div>

      <article class="detail-block">
        <div class="section-mini-head">
          <h4>Alertas</h4>
          <p>Hallazgos visibles para que revises tu expediente antes de que Admin / Red Sky lo audite.</p>
        </div>
        <div v-if="profileAlerts.length" class="alerts-stack">
          <span v-for="alert in profileAlerts" :key="alert" class="alert-pill">{{ alert }}</span>
        </div>
        <p v-else class="muted">Sin alertas activas. Tu expediente no muestra observaciones pendientes.</p>
      </article>

      <article class="detail-block">
        <div class="section-mini-head">
          <h4>Seguimiento administrativo</h4>
          <p>Las acciones de aprobar, rechazar o suspender se gestionan desde Admin / Red Sky.</p>
        </div>
        <div class="detail-summary-row">
          <span class="summary-pill">Documentos {{ documentsValidity ? `${documentsValidity}% validados` : 'sin validar' }}</span>
          <span class="summary-pill">Perfil {{ profileForm.profileState || 'sin estado' }}</span>
        </div>
      </article>
    </section>

    <div class="page-head surface">
      <div class="hero-copy">
        <div class="title-row">
          <span class="icon-badge"><CrewUiIcon name="profile" :size="20" /></span>
          <div>
            <span class="eyebrow">Perfil de vuelo</span>
            <h3>Perfil operativo</h3>
          </div>
        </div>
        <p class="muted">
          Ajusta tu identidad profesional, base, idiomas, certificaciones y datos operativos para mantener prioridad de asignacion.
        </p>
      </div>
      <button class="primary-action action-button" type="button" @click="$emit('save')">
        <CrewUiIcon name="profile" :size="16" />
        Guardar perfil
      </button>
    </div>

    <section class="surface form-card">
      <div class="form-grid">
        <label>
          <span>Nombre</span>
          <input :value="profileForm.name" type="text" @input="$emit('update-field', { form: 'profile', field: 'name', value: $event.target.value })" />
        </label>

        <label>
          <span>Telefono</span>
          <input :value="profileForm.phone" type="text" @input="$emit('update-field', { form: 'profile', field: 'phone', value: $event.target.value })" />
          <small v-if="profileErrors.phone">{{ profileErrors.phone }}</small>
        </label>

        <label>
          <span>Correo</span>
          <input :value="profileForm.email" type="email" @input="$emit('update-field', { form: 'profile', field: 'email', value: $event.target.value })" />
          <small v-if="profileErrors.email">{{ profileErrors.email }}</small>
        </label>

        <label>
          <span>Base</span>
          <input :value="profileForm.base" type="text" @input="$emit('update-field', { form: 'profile', field: 'base', value: $event.target.value })" />
        </label>

        <label>
          <span>Idiomas</span>
          <input :value="profileForm.languages" type="text" @input="$emit('update-field', { form: 'profile', field: 'languages', value: $event.target.value })" />
        </label>

        <label>
          <span>Certificaciones</span>
          <input :value="profileForm.certifications" type="text" @input="$emit('update-field', { form: 'profile', field: 'certifications', value: $event.target.value })" />
          <small v-if="profileErrors.certifications">{{ profileErrors.certifications }}</small>
        </label>

        <label>
          <span>Experiencia</span>
          <input :value="profileForm.experience" type="text" @input="$emit('update-field', { form: 'profile', field: 'experience', value: $event.target.value })" />
        </label>

        <label>
          <span>Foto</span>
          <input :value="profileForm.photo" type="text" @input="$emit('update-field', { form: 'profile', field: 'photo', value: $event.target.value })" />
        </label>

        <label>
          <span>Disponibilidad semanal</span>
          <input :value="profileForm.weeklyAvailability" type="text" @input="$emit('update-field', { form: 'profile', field: 'weeklyAvailability', value: $event.target.value })" />
        </label>

        <label class="readonly-field">
          <span>Documentos</span>
          <div class="readonly-value">{{ profileForm.documents || 'Sin resumen documental' }}</div>
        </label>

        <label class="readonly-field">
          <span>Estado perfil</span>
          <div class="readonly-value">{{ profileForm.profileState || 'Sin estado' }}</div>
        </label>
      </div>
    </section>
  </section>
</template>

<style scoped>
.profile-page,
.form-grid,
.info-grid,
.alerts-stack,
.detail-summary-row {
  display: grid;
  gap: 1.5rem;
}

.page-head,
.detail-panel,
.form-card {
  padding: 1.4rem;
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

.icon-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 16px;
  color: #0a8f5b;
  background: linear-gradient(180deg, rgba(10, 143, 91, 0.12), rgba(10, 143, 91, 0.04));
}

.page-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
}

.page-head h3 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.04em;
  font-size: clamp(1.8rem, 4vw, 2.5rem);
}

.detail-head,
.status-stack,
.section-mini-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.detail-head h3,
.section-mini-head h4 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.04em;
}

.detail-head h3 {
  font-size: clamp(1.8rem, 4vw, 2.7rem);
}

.status-stack {
  justify-content: flex-end;
  flex-wrap: wrap;
}

.status-chip,
.summary-pill,
.alert-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  font-weight: 700;
}

.status-chip {
  padding: 0.7rem 1.2rem;
  border: 1px solid rgba(177, 127, 15, 0.18);
  background: rgba(255, 248, 235, 0.95);
  color: #6e4b0b;
}

.status-chip-neutral {
  border-color: rgba(16, 22, 28, 0.1);
  background: rgba(246, 243, 238, 0.96);
  color: #2c241d;
}

.info-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.info-card,
.detail-block {
  border: 1px solid rgba(221, 201, 167, 0.78);
  border-radius: 26px;
  background: linear-gradient(180deg, rgba(255, 253, 249, 0.98), rgba(255, 251, 244, 0.96));
}

.info-card {
  display: grid;
  gap: 0.35rem;
  padding: 1.45rem 1.55rem;
}

.info-card span,
.section-mini-head p {
  color: #7b6646;
}

.info-card strong,
.detail-block h4 {
  color: #241a13;
}

.info-card strong {
  font-size: 1.15rem;
  line-height: 1.2;
}

.info-card-wide {
  grid-column: 1 / -1;
}

.detail-block {
  display: grid;
  gap: 1.15rem;
  padding: 1.55rem;
}

.section-mini-head {
  align-items: end;
}

.section-mini-head p {
  margin: 0;
  max-width: 42rem;
}

.alerts-stack {
  grid-template-columns: repeat(auto-fit, minmax(220px, max-content));
  gap: 0.85rem;
}

.alert-pill {
  padding: 0.85rem 1.1rem;
  border: 1px solid rgba(233, 130, 119, 0.34);
  background: rgba(255, 240, 238, 0.92);
  color: #6d2a25;
}

.detail-summary-row {
  grid-template-columns: repeat(auto-fit, minmax(220px, max-content));
  gap: 0.85rem;
}

.summary-pill {
  padding: 0.85rem 1.05rem;
  border: 1px solid rgba(221, 201, 167, 0.92);
  background: rgba(255, 251, 245, 0.96);
  color: #5f4c35;
}

.form-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.form-grid label {
  display: grid;
  gap: 0.35rem;
}

.readonly-field {
  align-content: start;
}

.readonly-value {
  min-height: 3.5rem;
  display: flex;
  align-items: center;
  padding: 0 1rem;
  border: 1px solid rgba(16, 22, 28, 0.08);
  border-radius: 18px;
  background: rgba(247, 249, 251, 0.9);
  color: #241a13;
  font-weight: 600;
}

.form-grid small {
  color: #b42318;
}

.action-button {
  gap: 0.45rem;
}

@media (max-width: 1080px) {
  .info-grid,
  .form-grid {
    grid-template-columns: 1fr;
  }

  .info-card-wide {
    grid-column: auto;
  }
}

@media (max-width: 760px) {
  .page-head,
  .detail-head,
  .section-mini-head {
    display: grid;
  }

  .title-row {
    align-items: flex-start;
  }

  .page-head,
  .detail-panel,
  .form-card {
    padding: 1.05rem;
  }

  .page-head > .action-button {
    width: 100%;
    justify-content: center;
  }
}
</style>
