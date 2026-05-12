<script setup>
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const form = reactive({
  flightType: 'Vuelo charter',
  origin: 'Ciudad de México',
  destination: 'Monterrey',
  date: '2026-05-02',
  passengers: 6,
  program: 'Open Access',
})

const currentStep = ref(1)

const exploreCards = [
  {
    title: 'Vuelos privados',
    description: 'Cotiza rutas ejecutivas, internacionales y traslados prioritarios.',
    link: '/vuelos',
    cta: 'Cotizar',
    icon: 'jet',
  },
  {
    title: 'Renta de aeronaves',
    description: 'Consulta disponibilidad por capacidad, autonomía y tipo de cabina.',
    link: '/servicios',
    cta: 'Explorar',
    icon: 'fleet',
  },
  {
    title: 'Membresías',
    description: 'Mejora tu experiencia con mejores tarifas, prioridad y beneficios opcionales.',
    link: '/membresias',
    cta: 'Ver beneficios',
    icon: 'membership',
  },
  {
    title: 'Operación centralizada',
    description: 'Cliente, operador, sobrecargo y administración en una misma capa.',
    link: '/plataforma',
    cta: 'Conocer',
    icon: 'operations',
  },
  {
    title: 'Cobertura premium',
    description: 'Bases estratégicas en México y rutas selectas hacia destinos clave.',
    link: '/cobertura',
    cta: 'Revisar',
    icon: 'coverage',
  },
  {
    title: 'Portal privado',
    description: 'Da seguimiento a documentos, operaciones y estado de tu solicitud.',
    link: '/login',
    cta: 'Entrar',
    icon: 'portal',
  },
]

const reserveBenefits = [
  'Reserva con fecha y hora definidas para ejecutivos y roadshows.',
  'Brief operativo, documentación y coordinación en un solo flujo.',
  'Selección guiada según pasajeros, ruta y nivel de servicio.',
  'Cobertura premium en rutas nacionales e internacionales selectas.',
]

const escapeFeatures = [
  'Escapadas premium a playa, ski y ciudades estratégicas',
  'Itinerarios para equipos directivos, familias y clientes VIP',
  'Coordinación de concierge, transporte terrestre y catering',
]

const operatorBenefits = [
  'Publica disponibilidad y responde más rápido a cada solicitud',
  'Valida documentos, tripulación y estado operacional desde un panel',
]

const businessBenefits = [
  'Control de usuarios, reglas y aprobaciones por empresa',
  'Historial centralizado de solicitudes, pagos y facturación',
]

const platformHighlights = [
  {
    kicker: 'Dashboard unificado',
    title: 'Una cuenta para cotizar, reservar y operar',
  },
  {
    kicker: 'Concierge 24/7',
    title: 'Seguimiento humano para rutas delicadas y clientes VIP',
  },
  {
    kicker: '4 roles conectados',
    title: 'Cliente, operador, sobrecargo y administración alineados',
  },
]

const appCards = [
  {
    title: 'Abrir experiencia cliente',
    description: 'Solicitudes, reservas y beneficios premium desde tu cuenta.',
    link: '/cliente/reservar',
  },
  {
    title: 'Abrir panel operador',
    description: 'Flota, disponibilidad y validación operacional.',
    link: '/operador/dashboard',
  },
]

const primaryStories = [
  {
    title: 'Escapadas privadas listas para despegar',
    description:
      'Planea viajes de descanso, hospitalidad o reuniones fuera de ciudad con una experiencia aérea más rápida y mejor coordinada.',
    cta: 'Ver escapadas',
    link: '/vuelos',
    image:''
  },
  {
    title: 'Opera cuando quieras, responde cuando lo necesites',
    description:
      'Si eres operador, publica capacidad, valida requisitos y responde solicitudes desde un flujo comercial y operacional unificado.',
    cta: 'Abrir panel operador',
    link: '/operador/dashboard',
    image:
      'https://images.unsplash.com/photo-1521727857535-28d2047314ac?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'La aviación privada, reimaginada para empresas',
    description:
      'Centraliza aprobaciones, usuarios, facturación y movilidad ejecutiva para equipos y directivos desde una sola plataforma.',
    cta: 'Solicitar solución corporativa',
    link: '/membresias/contacto',
    image:
      'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1200&q=80',
  },
]

const canGoNext = computed(() => {
  if (currentStep.value === 1) return Boolean(form.origin && form.destination)
  if (currentStep.value === 2) return Boolean(form.date && form.passengers > 0)
  return true
})

function nextStep() {
  if (!canGoNext.value) return
  currentStep.value = Math.min(currentStep.value + 1, 3)
}

function previousStep() {
  currentStep.value = Math.max(currentStep.value - 1, 1)
}

function openAvailability() {
  router.push({
    name: 'vuelos',
    query: {
      origin: form.origin,
      destination: form.destination,
      date: form.date,
      passengers: String(form.passengers),
      flightType: form.flightType,
      program: form.program,
    },
  })
}
</script>

<template>
  <div class="landing-page">
    <section class="hero-section">
      <div class="hero-copy">
        <p class="eyebrow">Aviación privada premium</p>
        <h1>Reserva tu vuelo primero. Mejora la experiencia después.</h1>
        <p class="hero-text">
          Cotiza y reserva jets privados sin membresia obligatoria. Si vuelas mas seguido,
          Sky Access agrega ahorros, empty legs, prioridad y concierge dentro del mismo flujo.
        </p>

        <div class="hero-tabs" aria-label="Accesos principales">
          <RouterLink to="/vuelos" class="tab-chip active">Reservar</RouterLink>
          <RouterLink to="/membresias" class="tab-chip">Sky Access</RouterLink>
          <RouterLink to="/plataforma" class="tab-chip">Plataforma</RouterLink>
        </div>

        <section class="quote-card">
          <div class="quote-steps">
            <button
              type="button"
              class="step-chip"
              :class="{ active: currentStep === 1 }"
              @click="currentStep = 1"
            >
              1. Ruta
            </button>
            <button
              type="button"
              class="step-chip"
              :class="{ active: currentStep === 2 }"
              @click="currentStep = 2"
            >
              2. Detalles
            </button>
            <button
              type="button"
              class="step-chip"
              :class="{ active: currentStep === 3 }"
              @click="currentStep = 3"
            >
              3. Programa
            </button>
          </div>

          <div class="step-progress">
            <span :style="{ width: `${(currentStep / 3) * 100}%` }"></span>
          </div>

          <div v-if="currentStep === 1" class="quote-fields">
            <label>
              Desde
              <input v-model="form.origin" type="text" />
            </label>
            <label>
              Hacia
              <input v-model="form.destination" type="text" />
            </label>
          </div>

          <div v-else-if="currentStep === 2" class="quote-fields">
            <label>
              Fecha
              <input v-model="form.date" type="date" />
            </label>
            <label>
              Pasajeros
              <input v-model="form.passengers" type="number" min="1" />
            </label>
          </div>

          <div v-else class="quote-fields">
            <label>
              Tipo de vuelo
              <select v-model="form.flightType">
                <option>Vuelo charter</option>
                <option>Jet ejecutivo</option>
                <option>Ruta internacional</option>
              </select>
            </label>
            <label>
              Beneficios
              <select v-model="form.program">
                <option>Open Access</option>
                <option>Sky Access</option>
                <option>Corporate</option>
              </select>
            </label>
          </div>

          <div class="quote-footer">
            <p>{{ form.origin }} → {{ form.destination }} · {{ form.passengers }} pax</p>
            <div class="quote-actions">
              <button
                v-if="currentStep > 1"
                type="button"
                class="ghost-action"
                @click="previousStep"
              >
                Regresar
              </button>
              <button
                v-if="currentStep < 3"
                type="button"
                class="dark-action"
                :disabled="!canGoNext"
                @click="nextStep"
              >
                Continuar
              </button>
              <button v-else type="button" class="dark-action" @click="openAvailability">
                Ver opciones
              </button>
            </div>
          </div>
        </section>
      </div>

      <div class="hero-media">
        <div class="hero-image-card">
          <img
            src="https://images.unsplash.com/photo-1556388158-158ea5ccacbd?auto=format&fit=crop&w=1200&q=80"
            alt="Interior de jet ejecutivo"
          />
          <div class="hero-overlay">
            <strong>Reserva abierta</strong>
            <span>Cabina ejecutiva · Beneficios opcionales · Salida 07:30</span>
          </div>
        </div>

        <div class="mini-banner">
          <span>Everywhere you need to be</span>
          <RouterLink to="/cobertura">Ver cobertura</RouterLink>
        </div>
      </div>
    </section>

    <section class="explore-section">
      <header class="section-head">
        <h2>Explora todo lo que puedes hacer con Sky Group</h2>
      </header>

      <div class="explore-grid">
        <RouterLink
          v-for="card in exploreCards"
          :key="card.title"
          :to="card.link"
          class="explore-card"
        >
          <div class="explore-copy">
            <strong>{{ card.title }}</strong>
            <p>{{ card.description }}</p>
            <span>{{ card.cta }}</span>
          </div>
          <div class="explore-icon" aria-hidden="true">
            <svg v-if="card.icon === 'jet'" viewBox="0 0 64 64" role="img">
              <path
                fill="currentColor"
                d="M58 30.5c0-1.7-1.2-3.1-2.9-3.4l-16.8-2.6-9.2-12.6c-.8-1.1-2.2-1.6-3.5-1.2l-2.2.7 5.7 14.3-9.5-1.5-4.8-5.6-1.9.6 2.6 7.1-2.6 7.1 1.9.6 4.8-5.6 9.5-1.5-5.7 14.3 2.2.7c1.3.4 2.7-.1 3.5-1.2l9.2-12.6 16.8-2.6c1.7-.3 2.9-1.7 2.9-3.4Z"
              />
            </svg>
            <svg v-else-if="card.icon === 'fleet'" viewBox="0 0 64 64" role="img">
              <rect x="10" y="28" width="34" height="14" rx="5" fill="currentColor" />
              <path
                fill="currentColor"
                d="M44 31h7.8c1.2 0 2.3.6 2.9 1.6l2.6 4.2c.5.7.7 1.6.7 2.4v2.8H44V31Z"
              />
              <circle cx="21" cy="45" r="4.5" fill="currentColor" opacity=".92" />
              <circle cx="49" cy="45" r="4.5" fill="currentColor" opacity=".92" />
              <path
                fill="#f6f6f6"
                d="M16 31.5h19c1.8 0 3.2 1.4 3.2 3.2v1.8H12.8v-1.8c0-1.8 1.4-3.2 3.2-3.2Z"
              />
            </svg>
            <svg v-else-if="card.icon === 'membership'" viewBox="0 0 64 64" role="img">
              <rect x="12" y="16" width="40" height="30" rx="8" fill="currentColor" />
              <path
                fill="#f6f6f6"
                d="M20 28h15v3H20zm0 7h24v3H20zm23-13 2.1 4.3 4.7.7-3.4 3.3.8 4.7-4.2-2.2-4.2 2.2.8-4.7-3.4-3.3 4.7-.7L43 22Z"
              />
            </svg>
            <svg v-else-if="card.icon === 'operations'" viewBox="0 0 64 64" role="img">
              <rect x="12" y="14" width="40" height="36" rx="8" fill="currentColor" />
              <path
                fill="#f6f6f6"
                d="M22 24h20v4H22zm0 8h12v4H22zm0 8h8v4h-8zm19-9 6 6-6 6-2.8-2.8 3.2-3.2-3.2-3.2L41 31Z"
              />
            </svg>
            <svg v-else-if="card.icon === 'coverage'" viewBox="0 0 64 64" role="img">
              <circle cx="32" cy="32" r="18" fill="none" stroke="currentColor" stroke-width="4" />
              <path
                fill="none"
                stroke="currentColor"
                stroke-width="4"
                d="M14 32h36M32 14c5 5.5 8 11.5 8 18s-3 12.5-8 18c-5-5.5-8-11.5-8-18s3-12.5 8-18Z"
              />
              <path
                fill="currentColor"
                d="m48.5 18.5 2.7 5.5 6.1.9-4.4 4.2 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.2 6.1-.9 2.7-5.5Z"
              />
            </svg>
            <svg v-else viewBox="0 0 64 64" role="img">
              <rect x="14" y="16" width="36" height="32" rx="8" fill="currentColor" />
              <path
                fill="#f6f6f6"
                d="M23 29a9 9 0 1 1 18 0c0 3.2-1.7 5.7-4.4 7.7l-1 4.3h-7.2l-1-4.3C24.7 34.7 23 32.2 23 29Zm8-4.5a4.5 4.5 0 0 0-2.7 8.1l.9.7.7 3.2h4.2l.7-3.2.9-.7a4.5 4.5 0 0 0-2.7-8.1H31Z"
              />
            </svg>
          </div>
        </RouterLink>
      </div>
    </section>

    <section class="account-band">
      <div class="account-copy">
        <h2>Inicia sesión para revisar tu operación en detalle</h2>
        <p>
          Visualiza solicitudes activas, beneficios premium, documentos y seguimiento en
          tu cuenta privada.
        </p>
        <div class="account-actions">
          <RouterLink to="/login" class="dark-action">Ingresar a mi cuenta</RouterLink>
          <RouterLink to="/plataforma" class="text-link">Conocer la plataforma</RouterLink>
        </div>
      </div>

      <div class="account-visual">
        <img
          src="https://images.unsplash.com/photo-1519125323398-675f0ddb6308?auto=format&fit=crop&w=1200&q=80"
          alt="Equipo de atención premium"
        />
      </div>
    </section>

    <section class="reserve-section">
      <div class="reserve-card">
        <div class="reserve-copy">
          <p class="eyebrow">Reserva anticipada</p>
          <h2>Programa tu vuelo correcto con Sky Group Reserve</h2>
          <div class="reserve-form">
            <select v-model="form.origin">
              <option>Ciudad de México</option>
              <option>Monterrey</option>
              <option>Cancún</option>
              <option>Toluca</option>
            </select>
            <select v-model="form.destination">
              <option>Monterrey</option>
              <option>Ciudad de México</option>
              <option>Miami</option>
              <option>Los Cabos</option>
            </select>
            <button type="button" class="dark-action" @click="openAvailability">Siguiente</button>
          </div>
        </div>

        <div class="reserve-visual">
          <img
            src="https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=80"
            alt="Reloj y planificación de reserva"
          />
        </div>

        <div class="reserve-benefits">
          <h3>Beneficios</h3>
          <ul>
            <li v-for="benefit in reserveBenefits" :key="benefit">{{ benefit }}</li>
          </ul>
        </div>
      </div>
    </section>

    <section
      v-for="(story, index) in primaryStories"
      :key="story.title"
      class="story-section"
      :class="{ reverse: index % 2 === 1 }"
    >
      <div class="story-media">
        <img :src="story.image" :alt="story.title" />
      </div>

      <div class="story-copy">
        <h2>{{ story.title }}</h2>
        <p>{{ story.description }}</p>
        <ul v-if="index === 0" class="feature-list">
          <li v-for="feature in escapeFeatures" :key="feature">{{ feature }}</li>
        </ul>
        <ul v-else-if="index === 1" class="feature-list">
          <li v-for="benefit in operatorBenefits" :key="benefit">{{ benefit }}</li>
        </ul>
        <ul v-else class="feature-list">
          <li v-for="benefit in businessBenefits" :key="benefit">{{ benefit }}</li>
        </ul>
        <RouterLink :to="story.link" class="dark-action compact">{{ story.cta }}</RouterLink>
      </div>
    </section>

    <section class="showcase-section">
      <div class="showcase-poster">
        <div class="poster-frame">
          <span>GO</span>
          <span>JET</span>
          <span>2026</span>
        </div>
      </div>

      <div class="showcase-copy">
        <h2>Nuestra vitrina anual de producto ya está aquí</h2>
        <p>
          Descubre mejoras en cotización, flujos operativos, membresías y control por
          rol para toda la experiencia Sky Group.
        </p>
        <div class="highlight-list">
          <article v-for="item in platformHighlights" :key="item.title">
            <span>{{ item.kicker }}</span>
            <strong>{{ item.title }}</strong>
          </article>
        </div>
        <RouterLink to="/plataforma" class="dark-action compact">Descubrir producto</RouterLink>
      </div>
    </section>

    <section class="story-section reverse">
      <div class="story-media">
        <img
          src="https://images.unsplash.com/photo-1503220317375-aaad61436b1b?auto=format&fit=crop&w=1200&q=80"
          alt="Aeronave disponible para renta"
        />
      </div>

      <div class="story-copy">
        <h2>Genera ingresos rentando capacidad aérea disponible</h2>
        <p>
          Integra aeronaves disponibles, responde oportunidades mejor filtradas y lleva
          control comercial y operativo desde una misma vista.
        </p>
        <RouterLink to="/servicios" class="dark-action compact">Ver oportunidades</RouterLink>
      </div>
    </section>

    <section class="apps-section">
      <header class="section-head">
        <h2>Accesos rápidos a la experiencia</h2>
      </header>

      <div class="apps-grid">
        <RouterLink v-for="card in appCards" :key="card.title" :to="card.link" class="app-card">
          <div class="qr-box" aria-hidden="true"></div>
          <div>
            <strong>{{ card.title }}</strong>
            <p>{{ card.description }}</p>
          </div>
          <span>→</span>
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.landing-page {
  background: #f6f6f6;
  color: #111111;
}

.hero-section,
.explore-section,
.account-band,
.reserve-section,
.story-section,
.showcase-section,
.apps-section {
  padding: 2rem clamp(1.2rem, 4vw, 3rem);
}

.hero-section {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(300px, 0.95fr);
  gap: 2rem;
  align-items: start;
  padding-top: 2.5rem;
}

.eyebrow {
  margin: 0 0 0.75rem;
  color: #5f5f5f;
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1,
h2,
h3,
.quote-card strong,
.explore-card strong,
.app-card strong {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.04em;
}

h1 {
  max-width: 10ch;
  font-size: clamp(3rem, 7vw, 4.8rem);
  line-height: 0.94;
}

h2 {
  font-size: clamp(2rem, 4vw, 3rem);
  line-height: 1;
}

.hero-text,
.explore-card p,
.account-copy p,
.split-copy p,
.showcase-copy p,
.app-card p,
.quote-footer p,
.highlight-list span,
.reserve-benefits li {
  color: #4f4f4f;
}

.hero-text {
  max-width: 56ch;
  margin: 1.1rem 0 0;
  font-size: 1.08rem;
  line-height: 1.7;
}

.hero-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.4rem;
}

.tab-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.75rem;
  padding: 0 1rem;
  border-radius: 999px;
  color: #111111;
  text-decoration: none;
  background: #ececec;
  font-weight: 700;
}

.tab-chip.active {
  color: #ffffff;
  background: #111111;
}

.quote-card,
.explore-card,
.app-card {
  border-radius: 18px;
  background: #ffffff;
}

.quote-card {
  display: grid;
  gap: 1rem;
  margin-top: 1.2rem;
  padding: 1.2rem;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.06);
}

.quote-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.step-chip {
  border: 0;
  border-radius: 999px;
  padding: 0.75rem 1rem;
  color: #626262;
  background: #f1f1f1;
  font-weight: 700;
  cursor: pointer;
}

.step-chip.active {
  color: #ffffff;
  background: #111111;
}

.step-progress {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: #ededed;
}

.step-progress span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #111111, #8c8c8c);
  transition: width 180ms ease;
}

.quote-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.8rem;
}

.quote-fields label {
  display: grid;
  gap: 0.4rem;
  color: #2f2f2f;
  font-size: 0.92rem;
  font-weight: 700;
}

.quote-fields input,
.quote-fields select,
.reserve-form select {
  min-height: 3.35rem;
  border: 1px solid #dddddd;
  border-radius: 12px;
  padding: 0 1rem;
  background: #ffffff;
  color: #111111;
}

.quote-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.quote-footer p {
  margin: 0;
  font-weight: 600;
}

.quote-actions,
.account-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.dark-action,
.ghost-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 3.2rem;
  border-radius: 12px;
  padding: 0 1.2rem;
  font-weight: 800;
  text-decoration: none;
  cursor: pointer;
}

.dark-action {
  border: 0;
  color: #ffffff;
  background: #111111;
}

.ghost-action {
  border: 1px solid #d8d8d8;
  color: #111111;
  background: #ffffff;
}

.dark-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.compact {
  width: fit-content;
}

.hero-media {
  display: grid;
  gap: 0.9rem;
}

.hero-image-card {
  position: relative;
  overflow: hidden;
  min-height: 520px;
  border-radius: 18px;
  background: #e7b347;
}

.hero-image-card img,
.account-visual img,
.reserve-visual img,
.story-media img,
.split-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.hero-overlay {
  position: absolute;
  left: 1rem;
  right: 1rem;
  bottom: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.9rem 1rem;
  border-radius: 14px;
  color: #ffffff;
  background: rgba(17, 17, 17, 0.86);
}

.hero-overlay span {
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.9rem;
}

.mini-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-radius: 16px;
  padding: 0.95rem 1rem;
  background: #ffffff;
}

.mini-banner a,
.text-link {
  color: #111111;
  font-weight: 700;
}

.section-head {
  margin-bottom: 1.25rem;
}

.explore-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.9rem;
}

.explore-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 110px;
  gap: 0.9rem;
  align-items: center;
  padding: 1rem;
  color: #111111;
  text-decoration: none;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.04);
}

.explore-copy {
  display: grid;
  gap: 0.45rem;
}

.explore-card strong {
  font-size: 1.08rem;
}

.explore-card p {
  margin: 0;
  line-height: 1.5;
  font-size: 0.94rem;
}

.explore-card span {
  color: #111111;
  font-size: 0.92rem;
  font-weight: 800;
}

.explore-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 110px;
  height: 84px;
  border-radius: 18px;
  color: #0f1722;
  background:
    radial-gradient(circle at top right, rgba(213, 181, 107, 0.22), transparent 42%),
    linear-gradient(180deg, #f2f4f8 0%, #e5ebf3 100%);
}

.explore-icon svg {
  width: 52px;
  height: 52px;
  display: block;
}

.account-band,
.showcase-section {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2rem;
  align-items: center;
}

.account-band {
  padding-top: 3.5rem;
}

.account-visual {
  overflow: hidden;
  min-height: 320px;
  border-radius: 18px;
}

.reserve-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 0.9fr) minmax(240px, 0.7fr);
  gap: 1.5rem;
  border-radius: 20px;
  padding: 1.5rem;
  background: #b8e3ee;
}

.reserve-copy h2 {
  max-width: 11ch;
}

.reserve-form {
  display: grid;
  gap: 0.75rem;
  margin-top: 1rem;
}

.reserve-visual {
  overflow: hidden;
  min-height: 280px;
  border-radius: 18px;
}

.reserve-benefits h3 {
  margin-bottom: 0.85rem;
}

.reserve-benefits ul,
.feature-list {
  display: grid;
  gap: 0.8rem;
  margin: 1rem 0 0;
  padding-left: 1.1rem;
}

.story-section {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2rem;
  align-items: center;
}

.story-section.reverse .story-media {
  order: 2;
}

.story-section.reverse .story-copy {
  order: 1;
}

.story-copy {
  display: grid;
  gap: 1rem;
  align-content: center;
}

.story-media {
  overflow: hidden;
  min-height: 360px;
  border-radius: 18px;
}

.feature-list {
  color: #4f4f4f;
}

.showcase-poster {
  display: flex;
  align-items: center;
  justify-content: center;
}

.poster-frame {
  display: grid;
  gap: 0.75rem;
  width: min(100%, 360px);
  padding: 2rem;
  color: #ffffff;
  background: #050505;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  font-size: clamp(3rem, 7vw, 4.6rem);
  font-weight: 800;
  line-height: 0.9;
}

.highlight-list {
  display: grid;
  gap: 0.8rem;
  margin-top: 0.5rem;
}

.highlight-list article {
  display: grid;
  gap: 0.15rem;
  padding: 0.9rem 1rem;
  border-radius: 14px;
  background: #ffffff;
}

.highlight-list strong {
  font-size: 1rem;
}

.apps-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.app-card {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: center;
  padding: 1rem;
  color: #111111;
  text-decoration: none;
}

.qr-box {
  width: 82px;
  height: 82px;
  border-radius: 10px;
  background:
    linear-gradient(90deg, #111111 10px, transparent 10px) 0 0 / 20px 20px,
    linear-gradient(#111111 10px, transparent 10px) 0 0 / 20px 20px,
    #ffffff;
  border: 1px solid #d8d8d8;
}

.app-card span:last-child {
  font-size: 1.4rem;
  font-weight: 800;
}

@media (max-width: 1180px) {
  .hero-section,
  .account-band,
  .reserve-card,
  .story-section,
  .showcase-section,
  .explore-grid,
  .apps-grid {
    grid-template-columns: 1fr;
  }

  .explore-card {
    grid-template-columns: minmax(0, 1fr) 120px;
  }
}

@media (max-width: 760px) {
  h1 {
    max-width: none;
    font-size: clamp(2.7rem, 12vw, 3.8rem);
  }

  .quote-fields,
  .explore-card,
  .app-card {
    grid-template-columns: 1fr;
  }

  .story-section.reverse .story-media,
  .story-section.reverse .story-copy {
    order: initial;
  }

  .quote-footer,
  .hero-overlay,
  .mini-banner {
    flex-direction: column;
    align-items: flex-start;
  }

  .dark-action,
  .ghost-action {
    width: 100%;
  }

  .hero-image-card {
    min-height: 360px;
  }

  .explore-icon {
    width: 100%;
    height: 180px;
  }
}
</style>
