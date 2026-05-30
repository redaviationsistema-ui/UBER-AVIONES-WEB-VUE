<script setup>
import { roleLabels } from './registrationSteps'

defineProps({
  form: { type: Object, required: true },
})
</script>

<template>
  <div class="role-grid">
    <button
      v-for="(label, role) in roleLabels"
      :key="role"
      type="button"
      class="role-option"
      :class="{ selected: form.role === role }"
      @click="form.role = role"
    >
      <span>{{ label }}</span>
      <small>
        {{
          role === 'client'
            ? 'Registrarse, cotizar gratis y luego activar membresia'
            : role === 'provider'
              ? 'Gestionar operacion y flota'
              : 'Acceso de tripulacion'
        }}
      </small>
    </button>
  </div>
</template>
