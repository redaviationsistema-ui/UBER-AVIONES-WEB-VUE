<script setup>
import { computed } from 'vue'

const props = defineProps({
  access: { type: Object, required: true },
})

const emit = defineEmits(['activate-access', 'open-concierge', 'go-section', 'select-plan'])

const plans = computed(() => [
  {
    name: 'Demo',
    badge: 'Explorar',
    description: 'Entrada inicial para validar la experiencia, entender el flujo y comenzar con apoyo concierge.',
    price: 'Acceso inicial',
    cta: props.access?.has_access ? 'Ir al dashboard' : 'Activar acceso',
    target: props.access?.has_access ? 'dashboard' : 'activate',
    items: ['Visibilidad basica', 'Primer contacto concierge', 'Ruta y seguimiento inicial'],
  },
  {
    name: 'Basic',
    badge: 'Acceso privado',
    description: 'Ideal para viajeros que necesitan movilidad premium con lectura clara y operacion ordenada.',
    price: 'Uso recurrente',
    cta: 'Ver reservas',
    target: 'solicitudes',
    items: ['Reservas protegidas', 'Concierge operativo', 'Soporte de salida'],
  },
  {
    name: 'Pro',
    badge: 'Mas solicitado',
    description: 'Pensado para clientes frecuentes, equipos y cuentas que requieren prioridad real en el proceso.',
    price: 'Prioridad premium',
    cta: 'Hablar con concierge',
    target: 'concierge',
    items: ['Catering ejecutivo', 'Prioridad de atencion', 'Seguimiento reforzado'],
  },
  {
    name: 'Elite',
    badge: 'Enterprise',
    description: 'Infraestructura premium para cuentas con administracion, multiples actores y control extendido.',
    price: 'A medida',
    cta: 'Solicitar configuracion',
    target: 'plan',
    items: ['Control administrativo', 'Prioridad total', 'Cobertura corporativa'],
  },
])

const membershipSignals = computed(() => [
  {
    label: 'Acceso',
    value: props.access?.has_access ? 'Activo' : 'Inactivo',
  },
  {
    label: 'Periodo',
    value: props.access?.demo?.status || '',
  },
  {
    label: 'Suscripcion',
    value: props.access?.subscription?.status || 'Sin suscripcion',
  },
  {
    label: 'Operacion',
    value: props.access?.has_access ? 'Lista para reservar' : 'Pendiente de activacion',
  },
])

const upgradeSteps = computed(() => [
  {
    title: 'Activa tu capa de acceso',
    description: 'Habilita el entorno cliente para consultar rutas, concierge y experiencias premium.',
    meta: 'Paso 01',
  },
  {
    title: 'Opera desde un mismo flujo',
    description: 'Mueve solicitudes, seguimiento y beneficios dentro del mismo recorrido del portal.',
    meta: 'Paso 02',
  },
  {
    title: 'Escala cuando tu operacion lo pida',
    description: 'Sube de nivel si necesitas prioridad, acompanamiento reforzado o cobertura corporativa.',
    meta: 'Paso 03',
  },
])

const accountHighlights = computed(() => [
  {
    title: 'Dashboard conectado',
    description: 'Tu membresia conversa con reservas, aircraft preview y concierge desde una sola experiencia.',
    action: 'Ir al resumen',
    target: 'dashboard',
  },
  {
    title: 'Reservas protegidas',
    description: 'Cada solicitud hereda el mismo nivel de visibilidad, orden y blindaje comercial.',
    action: 'Abrir solicitudes',
    target: 'solicitudes',
  },
  {
    title: 'Escalamiento humano',
    description: 'Si tu cuenta necesita mas apoyo, el concierge puede continuar el flujo sin romper la experiencia.',
    action: 'Contactar concierge',
    target: 'concierge',
  },
])

function handlePlanAction(plan) {
  if (plan.target === 'activate') {
    emit('activate-access')
    return
  }

  if (plan.target === 'concierge') {
    emit('open-concierge')
    return
  }

  if (plan.target === 'plan') {
    emit('select-plan', plan)
    return
  }

  emit('go-section', plan.target)
}

function handleHighlightAction(item) {
  if (item.target === 'concierge') {
    emit('open-concierge')
    return
  }

  emit('go-section', item.target)
}
</script>

<template>
  <div class="membership-page">
    <section class="dashboard-hero">
      <div class="hero-center">
        <p class="eyebrow dark-eyebrow">Cuenta cliente</p>
        <h1>Administra tu membresia con el mismo nivel editorial del flujo cliente.</h1>
        <p class="hero-subtitle">
          Consulta estado, activa acceso, escala beneficios y conecta tu cuenta con reservas,
          seguimiento y concierge desde una sola experiencia premium.
        </p>

        <div class="hero-membership-shell">
          <div class="hero-membership-main">
            <div class="hero-membership-copy">
              <span class="callout-label">Estado de cuenta</span>
              <strong>{{ access.has_access ? 'La cuenta ya puede operar dentro del portal.' : 'La cuenta aun requiere activacion.' }}</strong>
              <p>
                {{
                  access.has_access
                    ? 'Tu acceso permite avanzar a dashboard, solicitudes y coordinacion protegida.'
                    : 'Activa o renueva acceso para habilitar reservas, seguimiento y beneficios de membresia.'
                }}
              </p>
            </div>

            <div class="hero-kpis">
              <article class="hero-kpi-card">
                <span>Estado</span>
                <strong>{{ access.has_access ? 'Activo' : 'Inactivo' }}</strong>
              </article>
              <article class="hero-kpi-card">
                <span>Ruta del portal</span>
                <strong>{{ access.has_access ? 'Lista para reservar' : 'Pendiente de activacion' }}</strong>
              </article>
            </div>
          </div>

          <div class="hero-membership-actions">
            <button class="hero-action" type="button" @click="$emit('activate-access')">
              {{ access.has_access ? 'Renovar o refrescar acceso' : 'Activar acceso' }}
            </button>
            <button class="ghost-link-button" type="button" @click="$emit('open-concierge')">
              Hablar con concierge
            </button>
          </div>
        </div>
      </div>
    </section>

    <section class="status-strip">
      <article v-for="item in membershipSignals" :key="item.label" class="signal-card">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
      </article>
    </section>

    <section class="editorial-section">
      <div class="editorial-heading">
        <h2>Como evoluciona tu cuenta dentro del ecosistema</h2>
        <p>
          Repetimos la misma narrativa de producto del dashboard para que membresia, reservas y
          seguimiento se sientan parte del mismo sistema.
        </p>
      </div>

      <div class="step-editorial refined-steps">
        <article v-for="(step, index) in upgradeSteps" :key="step.title" class="step-row">
          <div class="step-index" aria-hidden="true">0{{ index + 1 }}</div>

          <div class="step-copy">
            <span class="step-meta">{{ step.meta }}</span>
            <strong>{{ step.title }}</strong>
            <p>{{ step.description }}</p>
          </div>
        </article>
      </div>
    </section>

    <section class="modes-section">
      <div class="section-heading">
        <h2>Niveles de membresia listos para accionar</h2>
        <p>
          Ya no se queda en informativo: cada tarjeta conecta con una accion real dentro del flujo
          del cliente.
        </p>
      </div>

      <div class="plans-grid refined-modes-grid">
        <article v-for="plan in plans" :key="plan.name" class="plan-card mode-card" :class="{ featured: plan.name === 'Pro' }">
          <div class="mode-copy">
            <div class="plan-head">
              <span class="mode-label">{{ plan.badge }}</span>
              <div class="plan-price">{{ plan.price }}</div>
            </div>
            <div class="plan-title-row">
              <h3>{{ plan.name }}</h3>
              <span class="plan-marker"></span>
            </div>
            <p>{{ plan.description }}</p>

            <ul class="plan-list">
              <li v-for="item in plan.items" :key="item">{{ item }}</li>
            </ul>

            <button class="mini-action" type="button" @click="handlePlanAction(plan)">
              {{ plan.cta }}
            </button>
          </div>
        </article>
      </div>
    </section>

    <section class="discovery-section">
      <div class="section-heading">
        <h2>Conecta tu cuenta con el resto del portal</h2>
        <p>
          Los beneficios no viven aislados: ahora la seccion empuja al usuario a continuar dentro
          del mismo flujo cliente.
        </p>
      </div>

      <div class="discovery-grid">
        <article v-for="item in accountHighlights" :key="item.title" class="discovery-card">
          <div class="discovery-copy">
            <span class="discovery-badge">{{ item.action }}</span>
            <h3>{{ item.title }}</h3>
            <p>{{ item.description }}</p>
            <div class="discovery-divider"></div>
            <button class="mini-action" type="button" @click="handleHighlightAction(item)">
              {{ item.action }}
            </button>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.membership-page {
  min-height: 100vh;
  background: #ffffff;
  color: #111111;
}

.dashboard-hero,
.editorial-section,
.modes-section,
.discovery-section {
  padding: 1.5rem clamp(1.25rem, 5vw, 4.5rem);
}

.dashboard-hero {
  display: grid;
  gap: 2rem;
  min-height: 66vh;
  padding-top: 1rem;
  background:
    radial-gradient(circle at top right, rgba(201, 164, 90, 0.12), transparent 18%),
    linear-gradient(180deg, #ffffff 0%, #faf8f2 100%);
}

.hero-center {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 1rem;
  text-align: center;
}

.dark-eyebrow {
  color: #8c6a1f;
}

.hero-center h1,
.editorial-heading h2,
.section-heading h2,
.mode-copy h3,
.discovery-copy h3 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.05em;
}

.hero-center h1 {
  max-width: 13ch;
  font-size: clamp(2.8rem, 7vw, 4.4rem);
  line-height: 0.96;
}

.hero-subtitle,
.editorial-heading p,
.section-heading p,
.step-copy p,
.mode-copy p,
.discovery-copy p,
.hero-membership-copy p,
.plan-list li {
  color: #5d5d5d;
  line-height: 1.7;
}

.hero-subtitle,
.editorial-heading,
.section-heading {
  max-width: 760px;
}

.hero-subtitle {
  margin: 0;
}

.hero-membership-shell {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(260px, 320px);
  gap: 1rem;
  width: min(100%, 980px);
  padding: 1.35rem;
  border: 1px solid rgba(140, 106, 31, 0.12);
  border-radius: 28px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(250, 246, 236, 0.94)),
    radial-gradient(circle at top right, rgba(201, 164, 90, 0.14), transparent 30%);
  box-shadow: 0 24px 50px rgba(0, 0, 0, 0.06);
  text-align: left;
}

.hero-membership-main {
  display: grid;
  gap: 1rem;
}

.hero-membership-copy {
  display: grid;
  gap: 0.45rem;
}

.callout-label,
.step-meta,
.discovery-badge {
  color: #8c6a1f;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-membership-copy strong {
  font-size: 1.25rem;
}

.hero-kpis {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
}

.hero-kpi-card {
  display: grid;
  gap: 0.35rem;
  padding: 1rem;
  border: 1px solid #ece6d8;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.86);
}

.hero-kpi-card span {
  color: #7a7a7a;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.hero-kpi-card strong {
  font-size: 1rem;
  line-height: 1.35;
}

.hero-membership-actions {
  display: grid;
  gap: 0.75rem;
  align-content: stretch;
}

.hero-action {
  min-height: 3.6rem;
  border: 0;
  border-radius: 14px;
  padding: 0 1.35rem;
  color: #ffffff;
  background: #000000;
  font-weight: 800;
  box-shadow: 0 16px 28px rgba(0, 0, 0, 0.16);
}

.ghost-link-button,
.mini-action {
  border: 0;
  font-weight: 800;
}

.ghost-link-button {
  min-height: 3rem;
  border-radius: 14px;
  color: #111111;
  background: #f3f3f3;
  box-shadow: inset 0 0 0 1px #e4e4e4;
}

.status-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
  padding: 0 clamp(1.25rem, 5vw, 4.5rem) 1.2rem;
  margin-top: -1.2rem;
}

.signal-card {
  display: grid;
  gap: 0.4rem;
  padding: 1.1rem 1.05rem;
  border: 1px solid #ebebeb;
  border-radius: 22px;
  background: #ffffff;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.05);
}

.signal-card span {
  color: #666666;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.signal-card strong {
  font-size: 1rem;
}

.editorial-section,
.modes-section,
.discovery-section {
  display: grid;
  gap: 1.6rem;
}

.editorial-heading h2,
.section-heading h2 {
  font-size: clamp(2rem, 4vw, 3rem);
  line-height: 1.02;
}

.step-editorial {
  display: grid;
  gap: 1rem;
}

.refined-steps {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.step-row {
  display: grid;
  gap: 1rem;
  padding: 1.2rem;
  border: 1px solid #ebebeb;
  border-radius: 24px;
  background: linear-gradient(180deg, #ffffff 0%, #fafafa 100%);
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.03);
}

.step-index {
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  border-radius: 16px;
  color: #111111;
  background: #f0f0f0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: -0.04em;
}

.step-copy strong {
  display: block;
  margin-bottom: 0.45rem;
  font-size: 1.15rem;
}

.plans-grid,
.discovery-grid {
  display: grid;
  gap: 1rem;
}

.refined-modes-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.mode-card,
.discovery-card {
  display: grid;
  gap: 1rem;
  padding: 1.15rem;
  border-radius: 24px;
  background: #f7f7f7;
}

.plan-card.featured {
  border: 1px solid #dfc48b;
  background:
    radial-gradient(circle at top right, rgba(223, 196, 139, 0.18), transparent 28%),
    linear-gradient(180deg, #fffaf0, #fafafa);
}

.mode-copy,
.discovery-copy {
  display: grid;
  gap: 0.7rem;
}

.plan-head,
.plan-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.mode-label {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  min-height: 2rem;
  padding: 0 0.7rem;
  border-radius: 999px;
  color: #8c6a1f;
  background: #f3ead2;
  font-size: 0.76rem;
  font-weight: 800;
}

.mode-copy h3,
.discovery-copy h3 {
  font-size: 1.2rem;
}

.plan-price {
  color: #111111;
  font-size: 0.82rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.plan-marker {
  width: 0.85rem;
  height: 0.85rem;
  border-radius: 999px;
  background: #e2e2e2;
  flex-shrink: 0;
}

.plan-card.featured .plan-marker {
  background: #d8b45b;
  box-shadow: 0 0 0 6px rgba(216, 180, 91, 0.14);
}

.plan-list {
  display: grid;
  gap: 0.55rem;
  margin: 0.2rem 0 0;
  padding-left: 1.1rem;
}

.mini-action {
  width: fit-content;
  min-height: 2.6rem;
  padding: 0 1rem;
  border-radius: 999px;
  color: #111111;
  background: #ffffff;
  box-shadow: inset 0 0 0 1px #ececec;
}

.discovery-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.discovery-card {
  background: #ffffff;
  border: 1px solid #ebebeb;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.04);
}

.discovery-divider {
  width: 100%;
  height: 1px;
  background: linear-gradient(90deg, rgba(17, 17, 17, 0.12), transparent);
}

@media (max-width: 1080px) {
  .status-strip,
  .refined-steps,
  .refined-modes-grid,
  .discovery-grid,
  .hero-membership-shell,
  .hero-kpis {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .hero-center {
    justify-items: stretch;
    text-align: left;
  }

  .hero-center h1 {
    max-width: none;
  }

  .hero-action,
  .ghost-link-button {
    width: 100%;
  }
}
</style>
