<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BrandLogo from '../components/BrandLogo.vue'
import { useSocialAuth } from '../composables/useSocialAuth'
import { sanitizePostLoginRedirect } from '../lib/authRouting'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const ui = useUiStore()
const { googleAuthUrl, appleAuthUrl } = useSocialAuth()

const form = reactive({
  email: 'cliente@privateflights.test',
  password: 'password',
})

const errorMessage = ref('')
const currentStep = ref(1)
const showPassword = ref(false)

onMounted(() => {
  if (route.query.session === 'expired') {
    ui.pushToast({
      tone: 'error',
      title: 'Sesion expirada',
      message: 'Tu sesion vencio. Inicia sesion de nuevo para continuar.',
    })
  }
})

function continueToPassword() {
  errorMessage.value = ''

  if (!form.email) return

  currentStep.value = 2
}

function backToIdentifier() {
  errorMessage.value = ''
  currentStep.value = 1
  showPassword.value = false
}

async function submit() {
  errorMessage.value = ''

  try {
    await auth.login({
      ...form,
      role: 'client',
    })

    const redirect = sanitizePostLoginRedirect(route.query.redirect, auth.dashboardPath)

    router.push(redirect)
  } catch (error) {
    errorMessage.value = error.message || 'No fue posible iniciar sesión.'
  }
}
</script>

<template>
  <main class="client-login-page">
    <section class="client-login-shell">
      <RouterLink to="/" class="brand" aria-label="Sky Group">
        <BrandLogo variant="dark" :width="318" />
      </RouterLink>
      <div class="login-card">
        <div class="login-copy">
          <h1 v-if="currentStep === 1">¿Cuál es tu número de teléfono o tu correo electrónico?</h1>
          <h1 v-else>Ingresa tu contraseña</h1>
          <p>
            Accede a tus vuelos, membresías y seguimiento privado desde una experiencia
            unificada.
          </p>
        </div>

        <form v-if="currentStep === 1" class="login-form" @submit.prevent="continueToPassword">
          <input
            v-model="form.email"
            type="email"
            placeholder="Ingresa tu teléfono o correo electrónico"
            autocomplete="username"
            required
          />

          <button type="submit" class="primary-button" :disabled="!form.email">
            Continuar
          </button>

          <p v-if="errorMessage" class="error">
            {{ errorMessage }}
          </p>
        </form>

        <form v-else class="login-form" @submit.prevent="submit">
          <div class="identity-chip">
            <span>Cuenta</span>
            <strong>{{ form.email }}</strong>
          </div>

          <div class="password-field">
            <input
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="Ingresa tu contraseña"
              autocomplete="current-password"
              required
            />
            <button
              type="button"
              class="password-toggle"
              :aria-label="showPassword ? 'Ocultar contraseña' : 'Ver contraseña'"
              @click="showPassword = !showPassword"
            >
              <svg
                v-if="showPassword"
                viewBox="0 0 24 24"
                aria-hidden="true"
                class="password-toggle-icon"
              >
                <path
                  fill="currentColor"
                  d="M3.28 2.22 2.22 3.28l4.01 4.01C4.1 8.78 2.55 10.8 2 12c1.73 3.76 5.48 6 10 6 1.93 0 3.71-.41 5.26-1.16l3.46 3.46 1.06-1.06L3.28 2.22zM12 16c-2.21 0-4-1.79-4-4 0-.73.2-1.41.54-1.99l1.55 1.55A2.5 2.5 0 0 0 12.5 14c.35 0 .69-.07.99-.2l1.7 1.7c-.89.32-1.84.5-2.86.5zm9.45-4c-.6-1.3-2.32-3.73-4.93-5.05L15.2 8.27A4 4 0 0 1 16 12c0 .46-.08.9-.22 1.31l2.57 2.57c1.43-1.07 2.53-2.47 3.1-3.88zM12 8c.5 0 .98.1 1.41.26l-1.9 1.9-1.67-1.67C10.47 8.18 11.21 8 12 8z"
                />
              </svg>
              <svg
                v-else
                viewBox="0 0 24 24"
                aria-hidden="true"
                class="password-toggle-icon"
              >
                <path
                  fill="currentColor"
                  d="M12 5c4.52 0 8.27 2.24 10 6-1.73 3.76-5.48 6-10 6S3.73 14.76 2 11c1.73-3.76 5.48-6 10-6zm0 2C8.69 7 5.85 8.82 4.39 11 5.85 13.18 8.69 15 12 15s6.15-1.82 7.61-4C18.15 8.82 15.31 7 12 7zm0 1.5A3.5 3.5 0 1 1 8.5 12 3.5 3.5 0 0 1 12 8.5zm0 2A1.5 1.5 0 1 0 13.5 12 1.5 1.5 0 0 0 12 10.5z"
                />
              </svg>
            </button>
          </div>

          <button type="submit" class="primary-button" :disabled="auth.loading">
            {{ auth.loading ? 'Continuando...' : 'Ingresar' }}
          </button>

          <button type="button" class="secondary-button" @click="backToIdentifier">
            Cambiar correo o teléfono
          </button>

          <p v-if="errorMessage" class="error">
            {{ errorMessage }}
          </p>
        </form>

        <div v-if="currentStep === 1" class="divider" aria-hidden="true">
          <span></span>
          <small>o</small>
          <span></span>
        </div>

        <div v-if="currentStep === 1" class="social-stack">
          <a
            v-if="googleAuthUrl"
            :href="googleAuthUrl"
            class="social-button social-link"
          >
            <svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M21.6 12.23c0-.68-.06-1.34-.18-1.97H12v3.73h5.39a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.97-4.33 2.97-7.28z"
              />
              <path
                fill="#34A853"
                d="M12 22c2.7 0 4.96-.9 6.61-2.44l-3.24-2.5c-.9.6-2.05.96-3.37.96-2.59 0-4.79-1.75-5.57-4.1H3.08v2.58A10 10 0 0 0 12 22z"
              />
              <path
                fill="#FBBC05"
                d="M6.43 13.92A6 6 0 0 1 6.12 12c0-.67.11-1.32.31-1.92V7.5H3.08A10 10 0 0 0 2 12c0 1.61.39 3.13 1.08 4.5l3.35-2.58z"
              />
              <path
                fill="#EA4335"
                d="M12 5.98c1.47 0 2.8.5 3.84 1.49l2.88-2.88C16.95 2.94 14.7 2 12 2A10 10 0 0 0 3.08 7.5l3.35 2.58c.78-2.35 2.98-4.1 5.57-4.1z"
              />
            </svg>
            Continúa con Google
          </a>

          <button v-else type="button" class="social-button disabled-social" disabled>
            <svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M21.6 12.23c0-.68-.06-1.34-.18-1.97H12v3.73h5.39a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.97-4.33 2.97-7.28z"
              />
              <path
                fill="#34A853"
                d="M12 22c2.7 0 4.96-.9 6.61-2.44l-3.24-2.5c-.9.6-2.05.96-3.37.96-2.59 0-4.79-1.75-5.57-4.1H3.08v2.58A10 10 0 0 0 12 22z"
              />
              <path
                fill="#FBBC05"
                d="M6.43 13.92A6 6 0 0 1 6.12 12c0-.67.11-1.32.31-1.92V7.5H3.08A10 10 0 0 0 2 12c0 1.61.39 3.13 1.08 4.5l3.35-2.58z"
              />
              <path
                fill="#EA4335"
                d="M12 5.98c1.47 0 2.8.5 3.84 1.49l2.88-2.88C16.95 2.94 14.7 2 12 2A10 10 0 0 0 3.08 7.5l3.35 2.58c.78-2.35 2.98-4.1 5.57-4.1z"
              />
            </svg>
            Continúa con Google
          </button>

          <a
            v-if="appleAuthUrl"
            :href="appleAuthUrl"
            class="social-button social-link"
          >
            <svg class="social-icon apple-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M16.37 12.61c.02-2.18 1.79-3.23 1.87-3.28-1.02-1.49-2.61-1.69-3.17-1.71-1.35-.14-2.63.79-3.31.79-.69 0-1.74-.77-2.86-.75-1.47.02-2.82.86-3.58 2.18-1.53 2.65-.39 6.57 1.1 8.72.73 1.05 1.6 2.23 2.74 2.19 1.1-.04 1.52-.71 2.86-.71 1.34 0 1.72.71 2.88.69 1.19-.02 1.94-1.07 2.66-2.13.84-1.22 1.18-2.4 1.2-2.46-.03-.01-2.29-.88-2.27-3.53zM14.19 6.2c.6-.73 1-1.75.89-2.76-.87.03-1.92.58-2.54 1.31-.56.65-1.05 1.69-.92 2.69.97.08 1.97-.49 2.57-1.24z"
              />
            </svg>
            Continúa con Apple
          </a>

          <button v-else type="button" class="social-button disabled-social" disabled>
            <svg class="social-icon apple-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M16.37 12.61c.02-2.18 1.79-3.23 1.87-3.28-1.02-1.49-2.61-1.69-3.17-1.71-1.35-.14-2.63.79-3.31.79-.69 0-1.74-.77-2.86-.75-1.47.02-2.82.86-3.58 2.18-1.53 2.65-.39 6.57 1.1 8.72.73 1.05 1.6 2.23 2.74 2.19 1.1-.04 1.52-.71 2.86-.71 1.34 0 1.72.71 2.88.69 1.19-.02 1.94-1.07 2.66-2.13.84-1.22 1.18-2.4 1.2-2.46-.03-.01-2.29-.88-2.27-3.53zM14.19 6.2c.6-.73 1-1.75.89-2.76-.87.03-1.92.58-2.54 1.31-.56.65-1.05 1.69-.92 2.69.97.08 1.97-.49 2.57-1.24z"
              />
            </svg>
            Continúa con Apple
          </button>
        </div>

        <!-- <div class="helper-links">
          <span>¿Buscas acceso operativo?</span>
          <RouterLink to="/acceso">Ir a operación</RouterLink>
        </div> -->

        <div class="helper-links">
          <span>¿No tienes cuenta?</span>
          <RouterLink :to="{ name: 'registro', query: { role: 'client' } }">
            Crear usuario nuevo
          </RouterLink>
        </div>

        <p class="terms">
          Al continuar, aceptas recibir llamadas, WhatsApp o SMS relacionados con tu cuenta,
          tus vuelos y servicios de Sky Group.
        </p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.client-login-page {
  min-height: 100vh;
  background: #ffffff;
  color: #000000;
}

.client-login-shell {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: 2rem 1.2rem;
}

.brand {
  width: fit-content;
  margin: 0 auto 2rem;
  color: #111111;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  font-size: 1.3rem;
  font-weight: 800;
  text-decoration: none;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0 auto 1.1rem;
  color: #111111;
  font-size: 0.95rem;
  font-weight: 800;
  text-decoration: none;
}

.back-link::before {
  content: '←';
  font-size: 1rem;
}

.login-card {
  width: min(100%, 360px);
}

.login-copy {
  margin-bottom: 1rem;
}

.role-kicker {
  margin: 0 0 0.45rem;
  color: #8c6a1f;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.login-copy h1 {
  margin: 0;
  font-size: 2.05rem;
  line-height: 1.08;
  letter-spacing: -0.04em;
}

.login-copy p:last-child,
.terms,
.helper-links span {
  color: #555555;
}

.login-form {
  display: grid;
  gap: 0.8rem;
}

.identity-chip {
  display: grid;
  gap: 0.15rem;
  padding: 0.9rem 1rem;
  border: 1px solid #d8d8d8;
  border-radius: 10px;
  background: #f5f5f5;
}

.identity-chip span {
  color: #666666;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.identity-chip strong {
  color: #111111;
  font-size: 1rem;
}

.login-form input {
  width: 100%;
  height: 48px;
  border: 2px solid #111111;
  border-radius: 10px;
  padding: 0 1rem;
  color: #111111;
  background: #ffffff;
  font-size: 1rem;
}

.password-field {
  position: relative;
}

.password-field input {
  padding-right: 5.4rem;
}

.password-toggle {
  position: absolute;
  top: 50%;
  right: 0.9rem;
  transform: translateY(-50%);
  border: 0;
  padding: 0;
  color: #111111;
  background: transparent;
  cursor: pointer;
  line-height: 0;
}

.password-toggle-icon {
  width: 1.2rem;
  height: 1.2rem;
}

.primary-button {
  width: 100%;
  height: 48px;
  border: 0;
  border-radius: 10px;
  color: #ffffff;
  background: #000000;
  font-size: 1rem;
  font-weight: 800;
  cursor: pointer;
}

.secondary-button {
  width: 100%;
  height: 46px;
  border: 1px solid #d8d8d8;
  border-radius: 10px;
  color: #111111;
  background: #f4f4f4;
  font-size: 0.96rem;
  font-weight: 700;
  cursor: pointer;
}

.primary-button:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.error {
  margin: 0;
  color: #b42318;
  font-size: 0.9rem;
  font-weight: 700;
}

.divider {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 0.8rem;
  align-items: center;
  margin: 1.2rem 0 0.8rem;
}

.divider span {
  height: 1px;
  background: #bdbdbd;
}

.divider small {
  color: #555555;
  font-size: 0.9rem;
}

.social-stack {
  display: grid;
  gap: 0.55rem;
}

.social-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  width: 100%;
  height: 46px;
  border: 0;
  border-radius: 10px;
  color: #111111;
  background: #e9e9e9;
  font-size: 1rem;
  cursor: pointer;
}

.social-link {
  text-decoration: none;
}

.social-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.apple-icon {
  color: #111111;
}

.disabled-social {
  opacity: 0.62;
  cursor: not-allowed;
}

.helper-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 1.2rem;
}

.helper-links a {
  color: #111111;
  font-weight: 800;
  text-decoration: none;
}

.terms {
  margin-top: 2rem;
  font-size: 0.85rem;
  line-height: 1.6;
}

@media (max-width: 640px) {
  .login-copy h1 {
    font-size: 1.8rem;
  }
}
</style>
