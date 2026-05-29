<script setup>
import { ref } from 'vue'
import { clientAccessPreview } from './registrationSteps'

const props = defineProps({
  form: { type: Object, required: true },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['update-field', 'merge-fields'])

const generatorMessage = ref('')
const passwordVisible = ref(false)
const passwordConfirmationVisible = ref(false)

function updateField(field, value) {
  emit('update-field', field, value)
}

function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*'
  const randomValues = new Uint32Array(14)
  crypto.getRandomValues(randomValues)

  const password = Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join('')
  emit('merge-fields', {
    password,
    passwordConfirmation: password,
  })
  generatorMessage.value = 'Se genero una contrasena aleatoria. Puedes usarla o editarla manualmente.'
}
</script>

<template>
  <div class="step-fields">
    <label>
      Correo
      <input
        :value="props.form.email"
        type="email"
        placeholder="correo@empresa.com"
        autocomplete="email"
        @input="updateField('email', $event.target.value)"
      />
    </label>

    <label>
      Contrasena
      <div class="field-action-row">
        <small>Puedes escribirla manualmente o generarla al azar.</small>
        <button type="button" class="secondary-button inline-action-button" @click="generatePassword">
          Generar contrasena
        </button>
      </div>
      <div class="password-field">
        <input
          :value="props.form.password"
          :type="passwordVisible ? 'text' : 'password'"
          placeholder="Crea una contrasena"
          autocomplete="new-password"
          @input="updateField('password', $event.target.value)"
        />
        <button
          type="button"
          class="password-toggle"
          :aria-label="passwordVisible ? 'Ocultar contrasena' : 'Mostrar contrasena'"
          @click="passwordVisible = !passwordVisible"
        >
          {{ passwordVisible ? 'Ocultar' : 'Mostrar' }}
        </button>
      </div>
    </label>

    <p v-if="generatorMessage" class="success">{{ generatorMessage }}</p>

    <label>
      Confirmar contrasena
      <div class="password-field">
        <input
          :value="props.form.passwordConfirmation"
          :type="passwordConfirmationVisible ? 'text' : 'password'"
          placeholder="Repite la contrasena"
          autocomplete="new-password"
          @input="updateField('passwordConfirmation', $event.target.value)"
        />
        <button
          type="button"
          class="password-toggle"
          :aria-label="passwordConfirmationVisible ? 'Ocultar confirmacion de contrasena' : 'Mostrar confirmacion de contrasena'"
          @click="passwordConfirmationVisible = !passwordConfirmationVisible"
        >
          {{ passwordConfirmationVisible ? 'Ocultar' : 'Mostrar' }}
        </button>
      </div>
    </label>

    <aside v-if="props.form.role === 'client'" class="client-preview">
      <p class="eyebrow">Acceso cliente</p>
      <h3>Cotizador de prueba + membresia</h3>
      <ul>
        <li v-for="item in clientAccessPreview" :key="item">{{ item }}</li>
      </ul>
      <strong>USD $115</strong>
    </aside>

    <button type="submit" class="primary-button" :disabled="props.loading">
      {{ props.loading ? 'Creando usuario...' : 'Crear usuario' }}
    </button>
  </div>
</template>
