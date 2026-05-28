<script setup>
import { clientAccessPreview } from './registrationSteps'

defineProps({
  form: { type: Object, required: true },
  loading: { type: Boolean, default: false },
})
</script>

<template>
  <div class="step-fields">
    <label>
      Contrasena
      <input
        v-model="form.password"
        type="password"
        placeholder="Crea una contrasena"
        autocomplete="new-password"
      />
    </label>

    <label>
      Confirmar contrasena
      <input
        v-model="form.passwordConfirmation"
        type="password"
        placeholder="Repite la contrasena"
        autocomplete="new-password"
      />
    </label>

    <aside v-if="form.role === 'client'" class="client-preview">
      <p class="eyebrow">Acceso cliente</p>
      <h3>Cotizador de prueba + membresia</h3>
      <ul>
        <li v-for="item in clientAccessPreview" :key="item">{{ item }}</li>
      </ul>
      <strong>USD $115</strong>
    </aside>

    <button type="submit" class="primary-button" :disabled="loading">
      {{ loading ? 'Creando usuario...' : 'Crear usuario' }}
    </button>
  </div>
</template>
