<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RegisterClientStep from '../features/register/RegisterClientStep.vue'
import RegisterCredentialsStep from '../features/register/RegisterCredentialsStep.vue'
import RegisterIneStep from '../features/register/RegisterIneStep.vue'
import RegisterProgress from '../features/register/RegisterProgress.vue'
import RegisterRoleStep from '../features/register/RegisterRoleStep.vue'
import {
  allowedRoles,
  buildRegistrationSteps,
  roleLabels,
} from '../features/register/registrationSteps'
import '../features/register/registerWizard.css'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const currentStep = ref(0)
const errorMessage = ref('')
const successMessage = ref('')
const errorModalOpen = ref(false)
const errorModalTitle = ref('No fue posible crear la cuenta')
const errorModalMessage = ref('')
const errorModalDetails = ref([])
const form = reactive({
  name: '',
  email: '',
  phone: '',
  birthDate: '',
  nationality: '',
  password: '',
  passwordConfirmation: '',
  role:
    typeof route.query.role === 'string' && allowedRoles.includes(route.query.role)
      ? route.query.role
      : 'client',
  documentType: 'INE',
  documentNumber: '',
  documentExpiration: '',
  identityValidationRequired: true,
  ineCurp: '',
  ineCic: '',
  ineOcr: '',
  ineScanRaw: '',
  ineScanStatus: '',
  ineFront: null,
  ineFrontName: '',
  ineBack: null,
  ineBackName: '',
  billingRfc: '',
  billingName: '',
  billingRegime: '',
  billingPostalCode: '',
  billingCfdiUse: '',
})

const wizardSteps = computed(() => buildRegistrationSteps(form.role))
const selectedStep = computed(() => wizardSteps.value[currentStep.value] || wizardSteps.value[0])
const selectedRoleLabel = computed(() => roleLabels[form.role] || 'Cliente')
const isLastStep = computed(() => currentStep.value === wizardSteps.value.length - 1)
const loginRoute = computed(() =>
  form.role === 'client'
    ? { name: 'login-cliente' }
    : { name: 'login', query: { role: form.role } },
)

const currentStepId = computed(() => selectedStep.value?.id || wizardSteps.value[0]?.id || '')

watch(
  wizardSteps,
  (steps) => {
    if (currentStep.value > steps.length - 1) {
      currentStep.value = Math.max(steps.length - 1, 0)
    }
  },
  { immediate: true },
)

function setFile(field, event) {
  const file = event.target.files?.[0] || null
  form[field] = file
  form[`${field}Name`] = file?.name || ''
  form.ineScanStatus = ''
  form.ineScanRaw = ''
}

function setFormField(field, value) {
  form[field] = value
}

function mergeFormFields(patch = {}) {
  Object.entries(patch || {}).forEach(([field, value]) => {
    form[field] = value
  })
}

function validateCurrentStep() {
  errorMessage.value = ''

  if (currentStepId.value === 'rol') {
    if (!allowedRoles.includes(form.role)) {
      errorMessage.value = 'Selecciona un rol valido para la cuenta.'
      return false
    }
  }

  if (currentStepId.value === 'perfil') {
    if (!form.name.trim() || !form.phone.trim()) {
      errorMessage.value = 'Completa nombre y telefono del usuario.'
      return false
    }

    if (!form.birthDate || !form.nationality.trim()) {
      errorMessage.value = 'Completa fecha de nacimiento y nacionalidad.'
      return false
    }

    if (!form.documentType || !form.documentNumber.trim() || !form.documentExpiration) {
      errorMessage.value = 'Completa identificacion, numero de documento y vigencia.'
      return false
    }

    if (form.identityValidationRequired && (!form.ineFront || !form.ineBack)) {
      errorMessage.value = 'Sube la imagen de frente y reverso del documento para validar identidad.'
      return false
    }
  }

  if (currentStepId.value === 'acceso') {
    if (!form.email.trim()) {
      errorMessage.value = 'Completa el correo de acceso.'
      return false
    }

    if (form.password.length < 8) {
      errorMessage.value = 'La contrasena debe tener al menos 8 caracteres.'
      return false
    }

    if (form.password !== form.passwordConfirmation) {
      errorMessage.value = 'Las contrasenas no coinciden.'
      return false
    }
  }

  return true
}

function normalizeErrorDetails(error) {
  const fieldErrors = error?.payload?.errors

  if (!fieldErrors || typeof fieldErrors !== 'object') {
    return []
  }

  return Object.entries(fieldErrors).flatMap(([field, messages]) => {
    const fieldLabel = field === 'email' ? 'Correo' : field

    if (!Array.isArray(messages)) {
      return []
    }

    return messages
      .filter(Boolean)
      .map((message) => `${fieldLabel}: ${String(message).replace(/^The\s+/i, '')}`)
  })
}

function openErrorModal(error) {
  errorModalTitle.value = 'No fue posible crear la cuenta'
  errorModalMessage.value =
    error?.payload?.message || error?.message || 'Ocurrio un error al registrar el usuario.'
  errorModalDetails.value = normalizeErrorDetails(error)
  errorModalOpen.value = true
}

function closeErrorModal() {
  errorModalOpen.value = false
}

function nextStep() {
  if (!validateCurrentStep()) return
  currentStep.value = Math.min(currentStep.value + 1, wizardSteps.value.length - 1)
}

function previousStep() {
  errorMessage.value = ''
  currentStep.value = Math.max(currentStep.value - 1, 0)
}

async function submit() {
  if (!validateCurrentStep()) return

  successMessage.value = ''
  errorMessage.value = ''
  closeErrorModal()

  try {
    await auth.register({
      name: form.name,
      email: form.email,
      password: form.password,
      password_confirmation: form.passwordConfirmation,
      role: form.role,
    })

    successMessage.value =
      form.role === 'client'
        ? 'Usuario creado. Entrando al cotizador de vuelos de prueba...'
        : 'Usuario creado correctamente. Redirigiendo a tu cuenta...'

    router.push(form.role === 'client' ? '/cliente/reservar' : auth.dashboardPath)
  } catch (error) {
    errorMessage.value = error.message || 'No fue posible crear el usuario.'
    openErrorModal(error)
  }
}
</script>

<template>
  <main class="register-page">
    <transition name="register-error-fade">
      <div
        v-if="errorModalOpen"
        class="register-error-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="register-error-title"
        @click.self="closeErrorModal"
      >
        <div class="register-error-backdrop"></div>
        <div class="register-error-card">
          <span class="register-error-orb" aria-hidden="true">!</span>
          <p class="eyebrow">Registro no completado</p>
          <h3 id="register-error-title">{{ errorModalTitle }}</h3>
          <p class="register-error-copy">{{ errorModalMessage }}</p>

          <ul v-if="errorModalDetails.length" class="register-error-list">
            <li v-for="detail in errorModalDetails" :key="detail">{{ detail }}</li>
          </ul>

          <div class="register-error-actions">
            <button type="button" class="primary-button" @click="closeErrorModal">
              Entendido
            </button>
          </div>
        </div>
      </div>
    </transition>

    <section class="register-shell">
      <aside class="register-aside">
        <RouterLink to="/" class="brand">Sky Group</RouterLink>

        <div class="aside-copy">
          <p class="eyebrow">Nuevo usuario</p>
          <h1>Crea una cuenta por pasos.</h1>
          <p>
            Define primero el rol de acceso, completa en una sola pantalla los datos del
            usuario con su identificacion y al final crea el correo y la contrasena.
            Si el rol es cliente, entrara al cotizador y a la membresia de USD $115.
          </p>
        </div>

        <RegisterProgress :steps="wizardSteps" :current-step="currentStep" />
      </aside>

      <section class="register-panel">
        <div class="panel-head">
          <p class="eyebrow">{{ selectedStep.eyebrow }} - Alta de cuenta</p>
          <h2>{{ selectedStep.title }}</h2>
          <p class="panel-copy">{{ selectedStep.description }}</p>
        </div>

        <form class="register-form" @submit.prevent="submit">
          <RegisterRoleStep v-if="currentStepId === 'rol'" :form="form" />
          <div v-else-if="currentStepId === 'perfil'" class="step-fields">
            <RegisterClientStep :form="form" />
            <RegisterIneStep
              :form="form"
              @file-selected="setFile"
              @update-field="setFormField"
              @merge-fields="mergeFormFields"
            />
          </div>
          <RegisterCredentialsStep
            v-else
            :form="form"
            :loading="auth.loading"
            @update-field="setFormField"
            @merge-fields="mergeFormFields"
          />

          <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
          <p v-if="successMessage" class="success">{{ successMessage }}</p>

          <div class="wizard-actions">
            <button
              type="button"
              class="secondary-button"
              :disabled="currentStep === 0 || auth.loading"
              @click="previousStep"
            >
              Regresar
            </button>

            <button
              v-if="!isLastStep"
              type="button"
              class="primary-button"
              @click="nextStep"
            >
              Continuar
            </button>
          </div>

          <div class="register-links">
            <span>Rol seleccionado: {{ selectedRoleLabel }}.</span>
            <span>Ya tienes cuenta?</span>
            <RouterLink :to="loginRoute">Iniciar sesion</RouterLink>
          </div>
        </form>
      </section>
    </section>
  </main>
</template>
