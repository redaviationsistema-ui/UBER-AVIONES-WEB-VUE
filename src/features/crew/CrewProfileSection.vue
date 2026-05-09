<script setup>
import CrewUiIcon from './CrewUiIcon.vue'

defineProps({
  profileForm: { type: Object, required: true },
  profileErrors: { type: Object, required: true },
  bases: { type: Array, required: true },
  languages: { type: Array, required: true },
  profileStates: { type: Array, required: true },
})

defineEmits(['update-field', 'save'])
</script>

<template>
  <section class="profile-page">
    <div class="page-head surface">
      <div class="hero-copy">
        <div class="title-row">
          <span class="icon-badge"><CrewUiIcon name="profile" :size="20" /></span>
          <div>
            <span class="eyebrow">Perfil de vuelo</span>
            <h3>Identidad operativa premium</h3>
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
          <select :value="profileForm.base" @change="$emit('update-field', { form: 'profile', field: 'base', value: $event.target.value })">
            <option value="">Selecciona</option>
            <option v-for="item in bases" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>

        <label>
          <span>Idiomas</span>
          <select :value="profileForm.languages" @change="$emit('update-field', { form: 'profile', field: 'languages', value: $event.target.value })">
            <option value="">Selecciona</option>
            <option v-for="item in languages" :key="item" :value="item">{{ item }}</option>
          </select>
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
          <span>Datos bancarios</span>
          <input :value="profileForm.bankData" type="text" @input="$emit('update-field', { form: 'profile', field: 'bankData', value: $event.target.value })" />
          <small v-if="profileErrors.bankData">{{ profileErrors.bankData }}</small>
        </label>

        <label>
          <span>Disponibilidad semanal</span>
          <input :value="profileForm.weeklyAvailability" type="text" @input="$emit('update-field', { form: 'profile', field: 'weeklyAvailability', value: $event.target.value })" />
        </label>

        <label>
          <span>Documentos</span>
          <input :value="profileForm.documents" type="text" @input="$emit('update-field', { form: 'profile', field: 'documents', value: $event.target.value })" />
          <small v-if="profileErrors.documents">{{ profileErrors.documents }}</small>
        </label>

        <label>
          <span>Estado perfil</span>
          <select :value="profileForm.profileState" @change="$emit('update-field', { form: 'profile', field: 'profileState', value: $event.target.value })">
            <option v-for="item in profileStates" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
      </div>
    </section>
  </section>
</template>

<style scoped>
.profile-page,
.form-grid {
  display: grid;
  gap: 1.5rem;
}

.page-head,
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

.form-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.form-grid label {
  display: grid;
  gap: 0.35rem;
}

.form-grid small {
  color: #b42318;
}

.action-button {
  gap: 0.45rem;
}

@media (max-width: 1080px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .page-head {
    display: grid;
  }

  .title-row {
    align-items: flex-start;
  }

  .page-head,
  .form-card {
    padding: 1.05rem;
  }

  .page-head > .action-button {
    width: 100%;
    justify-content: center;
  }
}
</style>
