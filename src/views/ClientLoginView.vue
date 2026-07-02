<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BrandLogo from '../components/BrandLogo.vue'
import { sanitizePostLoginRedirect } from '../lib/authRouting'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const ui = useUiStore()

const form = reactive({
  email: '',
  password: '',
})

const errorMessage = ref('')
const currentStep = ref(1)
const showPassword = ref(false)

const premiumBenefits = [
  'Seguimiento de vuelos en tiempo real',
  'Gestion de membresias y beneficios',
  'Soporte especializado 24/7',
  'Atencion personalizada para cada trayecto',
  'Usar una sola familia de iconos outline, por ejemplo Lucide, Heroicons o Phosphor Icons.',
]

const trustMetrics = [
  { value: '+500', label: 'Clientes atendidos' },
  { value: '24/7', label: 'Soporte especializado' },
  { value: 'LATAM', label: 'Cobertura regional' },
]

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
    errorMessage.value = error.message || 'No fue posible iniciar sesion.'
  }
}
</script>

<template>
  <main class="client-login-page">
    <section class="client-login-shell">
      <aside class="login-visual-panel">
        <div class="visual-overlay"></div>
        <div class="visual-orb visual-orb-top"></div>
        <div class="visual-orb visual-orb-bottom"></div>

        <div class="visual-content">
          <p class="visual-kicker">Aviacion ejecutiva privada</p>
          <h1>Bienvenido a Sky Group</h1>
          <p class="visual-copy">
            Administre sus vuelos, membresias y servicios de aviacion privada desde una
            sola plataforma.
          </p>

          <ul class="benefit-list">
            <li v-for="benefit in premiumBenefits" :key="benefit">
              <span class="benefit-check">✓</span>
              <span>{{ benefit }}</span>
            </li>
          </ul>


          <div class="metrics-grid">
            <article v-for="metric in trustMetrics" :key="metric.label" class="metric-card">
              <strong>{{ metric.value }}</strong>
              <span>{{ metric.label }}</span>
            </article>
          </div>
        </div>
      </aside>

      <section class="login-panel">
        <div class="login-card">
          <RouterLink to="/" class="brand" aria-label="Sky Group">
            <BrandLogo variant="dark" :width="220" />
          </RouterLink>

          <div class="login-copy">
            <p class="eyebrow">Acceso privado</p>
            <p class="welcome-line">Bienvenido</p>
            <h2 v-if="currentStep === 1">¿Cual es tu correo?</h2>
            <h2 v-else>Ingresa tu contrasena</h2>
            <p>
              Accede a tus vuelos, membresias y seguimiento privado desde una experiencia
              unificada.
            </p>
          </div>

          <form v-if="currentStep === 1" class="login-form" @submit.prevent="continueToPassword">
            <label class="field-label">
              <span>Cuenta</span>
              <input
                v-model="form.email"
                type="email"
                placeholder="Ingresa tu telefono o correo electronico"
                autocomplete="username"
                required
              />
            </label>

            <button type="submit" class="primary-button" :disabled="!form.email">
              Acceder a mi cuenta
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

            <label class="field-label">
              <span>Contrasena</span>
              <div class="password-field">
                <input
                  v-model="form.password"
                  :type="showPassword ? 'text' : 'password'"
                  placeholder="Ingresa tu contrasena"
                  autocomplete="current-password"
                  required
                />
                <button
                  type="button"
                  class="password-toggle"
                  :aria-label="showPassword ? 'Ocultar contrasena' : 'Ver contrasena'"
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
            </label>

            <button type="submit" class="primary-button" :disabled="auth.loading">
              {{ auth.loading ? 'Validando acceso...' : 'Continuar de forma segura' }}
            </button>

            <button type="button" class="secondary-button" @click="backToIdentifier">
              Cambiar correo o telefono
            </button>

            <p v-if="errorMessage" class="error">
              {{ errorMessage }}
            </p>
          </form>

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
    </section>
  </main>
</template>

<style scoped>
.client-login-page {
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(188, 152, 91, 0.16), transparent 28%),
    linear-gradient(135deg, #07111d 0%, #122033 40%, #eef2f5 40%, #f7f5f1 100%);
  color: #101316;
}

.client-login-shell {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
  min-height: 100vh;
}

.login-visual-panel {
  position: relative;
  overflow: hidden;
  padding: 3.5rem;
  background:
    linear-gradient(180deg, rgba(6, 13, 23, 0.1), rgba(6, 13, 23, 0.7)),
    linear-gradient(145deg, #13253a 0%, #08111d 42%, #1d3551 100%);
  color: #f7f4ee;
}

.visual-overlay {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(120deg, rgba(255, 255, 255, 0.04), transparent 38%),
    linear-gradient(180deg, rgba(190, 152, 81, 0.18), transparent 35%);
  pointer-events: none;
}

.visual-orb {
  position: absolute;
  border-radius: 999px;
  filter: blur(12px);
  opacity: 0.7;
}

.visual-orb-top {
  top: 4rem;
  right: -6rem;
  width: 18rem;
  height: 18rem;
  background: radial-gradient(circle, rgba(232, 187, 107, 0.34), transparent 68%);
}

.visual-orb-bottom {
  bottom: -4rem;
  left: -5rem;
  width: 20rem;
  height: 20rem;
  background: radial-gradient(circle, rgba(103, 146, 206, 0.22), transparent 70%);
}

.visual-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 100%;
  gap: 2rem;
}

.visual-kicker {
  margin: 0;
  color: #d3b37a;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.visual-content h1 {
  margin: 0.35rem 0 0;
  max-width: 10ch;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(3rem, 5vw, 5.2rem);
  line-height: 0.95;
  letter-spacing: -0.05em;
}

.visual-copy {
  max-width: 34rem;
  margin: 0;
  color: rgba(247, 244, 238, 0.82);
  font-size: 1.12rem;
  line-height: 1.7;
}

.benefit-list {
  display: grid;
  gap: 0.9rem;
  padding: 0;
  margin: 0;
  list-style: none;
}

.benefit-list li {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  color: rgba(247, 244, 238, 0.92);
  font-size: 1rem;
}

.benefit-check {
  display: inline-grid;
  place-items: center;
  width: 1.7rem;
  height: 1.7rem;
  border: 1px solid rgba(211, 179, 122, 0.55);
  border-radius: 999px;
  color: #e2bf7f;
  background: rgba(255, 255, 255, 0.05);
  flex-shrink: 0;
}

.visual-aircraft-card {
  position: relative;
  min-height: 15rem;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 2rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02)),
    linear-gradient(180deg, rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.24));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.runway-line {
  position: absolute;
  left: 50%;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.5), transparent);
  transform: translateX(-50%);
  opacity: 0.6;
}

.runway-line-1 {
  top: 1.8rem;
  width: 2px;
  height: 5rem;
}

.runway-line-2 {
  bottom: 1.3rem;
  width: 2px;
  height: 4rem;
}

.aircraft-outline {
  position: absolute;
  inset: 50% auto auto 50%;
  width: 11rem;
  height: 11rem;
  transform: translate(-50%, -50%) rotate(-10deg);
  color: #f1e8d8;
  filter:
    drop-shadow(0 0 18px rgba(239, 228, 204, 0.2))
    drop-shadow(0 0 30px rgba(239, 228, 204, 0.12));
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}

.metric-card {
  padding: 1.1rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 1.2rem;
  background: rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(8px);
}

.metric-card strong {
  display: block;
  margin-bottom: 0.3rem;
  color: #ffffff;
  font-size: 1.55rem;
  font-weight: 700;
}

.metric-card span {
  color: rgba(247, 244, 238, 0.76);
  font-size: 0.9rem;
  line-height: 1.4;
}

.login-panel {
  display: grid;
  place-items: center;
  padding: 2rem;
}

.login-card {
  width: min(100%, 450px);
  padding: 2rem;
  border: 1px solid rgba(16, 19, 22, 0.08);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow:
    0 24px 60px rgba(10, 18, 28, 0.12),
    0 8px 22px rgba(10, 18, 28, 0.06);
}

.brand {
  display: inline-flex;
  width: fit-content;
  margin-bottom: 1.5rem;
  color: #111111;
  text-decoration: none;
}

.login-copy {
  margin-bottom: 1.5rem;
}

.eyebrow {
  margin: 0 0 0.4rem;
  color: #9b7a45;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.welcome-line {
  margin: 0 0 0.3rem;
  color: #3e4a56;
  font-size: 0.95rem;
  font-weight: 700;
}

.login-copy h2 {
  margin: 0;
  color: #111111;
  font-size: clamp(2rem, 4vw, 2.75rem);
  line-height: 1.02;
  letter-spacing: -0.05em;
}

.login-copy p:last-child {
  margin: 0.85rem 0 0;
  color: #596572;
  font-size: 1rem;
  line-height: 1.6;
}

.login-form {
  display: grid;
  gap: 1rem;
}

.field-label {
  display: grid;
  gap: 0.55rem;
}

.field-label span {
  color: #4b5764;
  font-size: 0.84rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.identity-chip {
  display: grid;
  gap: 0.25rem;
  padding: 1rem 1.1rem;
  border: 1px solid #d8dee5;
  border-radius: 18px;
  background: linear-gradient(180deg, #fbfbfc, #f1f4f7);
}

.identity-chip span {
  color: #6a7480;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.identity-chip strong {
  color: #12171d;
  font-size: 1.05rem;
}

.login-form input {
  width: 100%;
  min-height: 58px;
  border: 1px solid #ccd5df;
  border-radius: 18px;
  padding: 0 1rem;
  color: #111111;
  background: #ffffff;
  font-size: 1rem;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.login-form input:focus {
  outline: none;
  border-color: #9b7a45;
  box-shadow: 0 0 0 4px rgba(155, 122, 69, 0.12);
}

.password-field {
  position: relative;
}

.password-field input {
  padding-right: 4.8rem;
}

.password-toggle {
  position: absolute;
  top: 50%;
  right: 1rem;
  transform: translateY(-50%);
  border: 0;
  padding: 0;
  color: #1d2730;
  background: transparent;
  cursor: pointer;
  line-height: 0;
}

.password-toggle-icon {
  width: 1.25rem;
  height: 1.25rem;
}

.primary-button,
.secondary-button {
  width: 100%;
  min-height: 58px;
  border-radius: 18px;
  font-size: 1rem;
  font-weight: 800;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    opacity 0.18s ease;
}

.primary-button {
  border: 0;
  color: #f8f3ea;
  background: linear-gradient(135deg, #101820, #1b2b3f 55%, #8f7145 130%);
  box-shadow: 0 18px 30px rgba(16, 24, 32, 0.18);
}

.primary-button:hover:not(:disabled),
.secondary-button:hover {
  transform: translateY(-1px);
}

.secondary-button {
  border: 1px solid #d6dde5;
  color: #18212a;
  background: #f4f6f8;
}

.primary-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.error {
  margin: 0;
  color: #b42318;
  font-size: 0.92rem;
  font-weight: 700;
}

.helper-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 1.4rem;
  color: #596572;
}

.helper-links a {
  color: #111111;
  font-weight: 800;
  text-decoration: none;
}

.security-card {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.9rem;
  align-items: start;
  margin-top: 1.4rem;
  padding: 1rem 1.05rem;
  border: 1px solid #e0e5eb;
  border-radius: 18px;
  background: linear-gradient(180deg, #fbfcfd, #f5f7f9);
}

.security-icon {
  display: inline-grid;
  place-items: center;
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 999px;
  background: #e8edf2;
  font-size: 1rem;
}

.security-card strong {
  display: block;
  color: #101820;
  margin-bottom: 0.25rem;
}

.security-card p,
.terms {
  margin: 0;
  color: #5a6571;
  line-height: 1.6;
}

.terms {
  margin-top: 1.4rem;
  font-size: 0.88rem;
}

@media (max-width: 1080px) {
  .client-login-shell {
    grid-template-columns: 1fr;
  }

  .login-visual-panel {
    min-height: 38rem;
    padding: 2.5rem 1.5rem;
  }

  .login-panel {
    padding: 1.5rem;
  }
}

@media (max-width: 720px) {
  .client-login-page {
    background: linear-gradient(180deg, #0c1622 0%, #142131 24%, #f4f1ea 24%, #f7f7f6 100%);
  }

  .login-visual-panel {
    min-height: auto;
  }

  .visual-content {
    gap: 1.5rem;
  }

  .metrics-grid {
    grid-template-columns: 1fr;
  }

  .login-panel {
    padding: 1rem;
  }

  .login-card {
    padding: 1.4rem;
    border-radius: 22px;
  }

  .login-copy h2 {
    font-size: 2rem;
  }

  .visual-aircraft-card {
    min-height: 12rem;
  }
}
</style>
