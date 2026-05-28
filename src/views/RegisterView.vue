<script setup>
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RegisterBillingStep from '../features/register/RegisterBillingStep.vue'
import RegisterClientStep from '../features/register/RegisterClientStep.vue'
import RegisterCredentialsStep from '../features/register/RegisterCredentialsStep.vue'
import RegisterIneStep from '../features/register/RegisterIneStep.vue'
import RegisterPassengersStep from '../features/register/RegisterPassengersStep.vue'
import RegisterProgress from '../features/register/RegisterProgress.vue'
import RegisterRoleStep from '../features/register/RegisterRoleStep.vue'
import {
  allowedRoles,
  registrationSteps,
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
let passengerId = 1

function createPassenger() {
  const passenger = {
    id: passengerId,
    name: '',
    birthDate: '',
    nationality: '',
    documentType: 'INE',
    documentNumber: '',
  }
  passengerId += 1
  return passenger
}

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
  passengers: [createPassenger()],
  billingRfc: '',
  billingName: '',
  billingRegime: '',
  billingPostalCode: '',
  billingCfdiUse: '',
})

const selectedStep = computed(() => registrationSteps[currentStep.value])
const selectedRoleLabel = computed(() => roleLabels[form.role] || 'Cliente')
const isLastStep = computed(() => currentStep.value === registrationSteps.length - 1)
const loginRoute = computed(() =>
  form.role === 'client'
    ? { name: 'login-cliente' }
    : { name: 'login', query: { role: form.role } },
)

function setFile(field, event) {
  const file = event.target.files?.[0] || null
  form[field] = file
  form[`${field}Name`] = file?.name || ''
  form.ineScanStatus = ''
  form.ineScanRaw = ''
}

function validateCurrentStep() {
  errorMessage.value = ''

  if (currentStep.value === 0) {
    if (!form.documentType || !form.documentNumber.trim() || !form.documentExpiration) {
      errorMessage.value = 'Completa identificacion, numero de documento y vigencia.'
      return false
    }

    if (form.identityValidationRequired && (!form.ineFront || !form.ineBack)) {
      errorMessage.value = 'Sube la imagen de frente y reverso del documento para validar identidad.'
      return false
    }
  }

  if (currentStep.value === 1) {
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
      errorMessage.value = 'Completa nombre, correo y telefono del cliente.'
      return false
    }

    if (!form.birthDate || !form.nationality.trim()) {
      errorMessage.value = 'Completa fecha de nacimiento y nacionalidad.'
      return false
    }
  }

  if (currentStep.value === 2 && !form.passengers.every(isValidPassenger)) {
    errorMessage.value = 'Completa los datos de cada pasajero.'
    return false
  }

  if (currentStep.value === 3 && !isValidBilling()) {
    errorMessage.value = 'Completa RFC, razon social, regimen, codigo postal fiscal y uso CFDI.'
    return false
  }

  if (currentStep.value === 4 && !allowedRoles.includes(form.role)) {
    errorMessage.value = 'Selecciona un rol valido para la cuenta.'
    return false
  }

  if (currentStep.value === 5) {
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

function isValidPassenger(passenger) {
  return (
    passenger.name.trim() &&
    passenger.birthDate &&
    passenger.nationality.trim() &&
    passenger.documentType &&
    passenger.documentNumber.trim()
  )
}

function isValidBilling() {
  return (
    form.billingRfc.trim() &&
    form.billingName.trim() &&
    form.billingRegime &&
    form.billingPostalCode.trim() &&
    form.billingCfdiUse
  )
}

function addPassenger() {
  form.passengers.push(createPassenger())
}

function removePassenger(index) {
  form.passengers.splice(index, 1)
}

function nextStep() {
  if (!validateCurrentStep()) return
  currentStep.value = Math.min(currentStep.value + 1, registrationSteps.length - 1)
}

function previousStep() {
  errorMessage.value = ''
  currentStep.value = Math.max(currentStep.value - 1, 0)
}

async function submit() {
  if (!validateCurrentStep()) return

  successMessage.value = ''

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
  }
}
</script>

<template>
  <main class="register-page">
    <section class="register-shell">
      <aside class="register-aside">
        <RouterLink to="/" class="brand">Sky Group</RouterLink>

        <div class="aside-copy">
          <p class="eyebrow">Nuevo usuario</p>
          <h1>Crea una cuenta por pasos.</h1>
          <p>
            Escanea el documento, revisa los datos editables, registra pasajeros, facturacion y
            credenciales. Si el rol es cliente, entrara al cotizador y a la membresia de USD $115.
          </p>
        </div>

        <RegisterProgress :steps="registrationSteps" :current-step="currentStep" />
      </aside>

      <section class="register-panel">
        <div class="panel-head">
          <p class="eyebrow">{{ selectedStep.eyebrow }} - Alta de cuenta</p>
          <h2>{{ selectedStep.title }}</h2>
          <p class="panel-copy">{{ selectedStep.description }}</p>
        </div>

        <form class="register-form" @submit.prevent="submit">
          <RegisterIneStep v-if="currentStep === 0" :form="form" @file-selected="setFile" />
          <RegisterClientStep v-else-if="currentStep === 1" :form="form" />
          <RegisterPassengersStep
            v-else-if="currentStep === 2"
            :passengers="form.passengers"
            @add-passenger="addPassenger"
            @remove-passenger="removePassenger"
          />
          <RegisterBillingStep v-else-if="currentStep === 3" :form="form" />
          <RegisterRoleStep v-else-if="currentStep === 4" :form="form" />
          <RegisterCredentialsStep
            v-else
            :form="form"
            :loading="auth.loading"
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
