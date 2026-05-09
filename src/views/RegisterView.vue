<script setup>
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const roleLabels = {
  client: 'Cliente',
  provider: 'Operador',
  sobrecargo: 'Sobrecargo',
}

const allowedRoles = ['client', 'provider', 'sobrecargo']

const form = reactive({
  name: '',
  email: '',
  password: '',
  passwordConfirmation: '',
  role:
    typeof route.query.role === 'string' && allowedRoles.includes(route.query.role)
      ? route.query.role
      : 'client',
})

const errorMessage = ref('')
const successMessage = ref('')

const selectedRoleLabel = computed(() => roleLabels[form.role] || 'Cliente')
const loginRoute = computed(() =>
  form.role === 'client'
    ? { name: 'login-cliente' }
    : { name: 'login', query: { role: form.role } },
)

async function submit() {
  errorMessage.value = ''
  successMessage.value = ''

  if (form.password !== form.passwordConfirmation) {
    errorMessage.value = 'Las contraseñas no coinciden.'
    return
  }

  try {
    await auth.register({
      name: form.name,
      email: form.email,
      password: form.password,
      password_confirmation: form.passwordConfirmation,
      role: form.role,
    })

    successMessage.value = 'Usuario creado correctamente. Ya puedes iniciar sesión.'

    router.push(
      form.role === 'client'
        ? { name: 'login-cliente' }
        : {
            name: 'login',
            query: {
              role: form.role,
            },
          },
    )
  } catch (error) {
    errorMessage.value = error.message || 'No fue posible crear el usuario.'
  }
}
</script>

<template>
  <main class="register-page">
    <section class="register-shell">
      <aside class="register-aside">
        <RouterLink to="/" class="brand">✈️ Sky Group</RouterLink>

        <div class="aside-copy">
          <p class="eyebrow">Nuevo usuario</p>
          <h1>Crea una cuenta para entrar al ecosistema operativo.</h1>
          <p>
            Registra un nuevo usuario con su correo, contraseña y rol operativo para dirigirlo
            después a la vista correcta.
          </p>
        </div>
      </aside>

      <section class="register-panel">
        <div class="panel-head">
          <p class="eyebrow">Alta de cuenta</p>
          <h2>Nuevo {{ selectedRoleLabel }}</h2>
        </div>

        <form class="register-form" @submit.prevent="submit">
          <label>
            Nombre completo
            <input v-model="form.name" type="text" placeholder="Nombre completo" required />
          </label>

          <label>
            Correo electrónico
            <input v-model="form.email" type="email" placeholder="correo@empresa.com" required />
          </label>

          <label>
            Rol
            <select v-model="form.role">
              <option value="client">Cliente</option>
              <option value="provider">Operador</option>
              <option value="sobrecargo">Sobrecargo</option>
            </select>
          </label>

          <label>
            Contraseña
            <input
              v-model="form.password"
              type="password"
              placeholder="Crea una contraseña"
              required
            />
          </label>

          <label>
            Confirmar contraseña
            <input
              v-model="form.passwordConfirmation"
              type="password"
              placeholder="Repite la contraseña"
              required
            />
          </label>

          <button type="submit" class="primary-button" :disabled="auth.loading">
            {{ auth.loading ? 'Creando usuario...' : 'Crear usuario' }}
          </button>

          <p v-if="errorMessage" class="error">
            {{ errorMessage }}
          </p>

          <p v-if="successMessage" class="success">
            {{ successMessage }}
          </p>

          <div class="register-links">
            <span>¿Ya tienes cuenta?</span>
            <RouterLink :to="loginRoute">
              Iniciar sesión
            </RouterLink>
          </div>
        </form>
      </section>
    </section>
  </main>
</template>

<style scoped>
.register-page {
  min-height: 100vh;
  padding: clamp(1.2rem, 4vw, 2rem);
  background:
    radial-gradient(circle at top left, rgba(214, 181, 101, 0.14), transparent 24%),
    linear-gradient(180deg, #f3efe7 0%, #ece7de 100%);
  color: #111111;
}

.register-shell {
  display: grid;
  grid-template-columns: minmax(320px, 0.9fr) minmax(320px, 1fr);
  gap: 1.5rem;
  min-height: calc(100vh - 4rem);
}

.register-aside,
.register-panel {
  border: 1px solid rgba(16, 17, 20, 0.08);
  border-radius: 28px;
  padding: clamp(1.4rem, 4vw, 2rem);
  background: rgba(255, 255, 255, 0.78);
  box-shadow:
    0 24px 60px rgba(19, 27, 38, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.register-aside {
  display: grid;
  align-content: start;
  gap: 1.6rem;
}

.brand {
  color: #111111;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  font-size: 1.35rem;
  font-weight: 800;
  text-decoration: none;
}

.eyebrow {
  margin: 0 0 0.65rem;
  color: #8c6a1f;
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.aside-copy h1,
.panel-head h2 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.05em;
}

.aside-copy h1 {
  max-width: 11ch;
  font-size: clamp(2.4rem, 5vw, 4rem);
  line-height: 0.95;
}

.aside-copy p,
.register-links span {
  color: #4f4f4f;
  line-height: 1.7;
}

.register-panel {
  display: grid;
  align-content: center;
}

.panel-head {
  margin-bottom: 1.4rem;
}

.panel-head h2 {
  font-size: clamp(2rem, 4vw, 2.8rem);
  line-height: 0.98;
}

.register-form {
  display: grid;
  gap: 1rem;
}

.register-form label {
  display: grid;
  gap: 0.45rem;
  color: #111111;
  font-size: 0.92rem;
  font-weight: 700;
}

.register-form input,
.register-form select {
  min-height: 3.4rem;
  border: 1px solid rgba(16, 17, 20, 0.12);
  border-radius: 14px;
  padding: 0 1rem;
  color: #111111;
  background: #ffffff;
}

.primary-button {
  min-height: 3.45rem;
  border: 0;
  border-radius: 14px;
  color: #101318;
  background: linear-gradient(135deg, #f0c75c, #c8922d);
  font-weight: 800;
  cursor: pointer;
}

.primary-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error,
.success {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 700;
}

.error {
  color: #b42318;
}

.success {
  color: #067647;
}

.register-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.register-links a {
  color: #8c6a1f;
  font-weight: 800;
  text-decoration: none;
}

@media (max-width: 980px) {
  .register-shell {
    grid-template-columns: 1fr;
    min-height: auto;
  }
}
</style>
