<script setup>
import { computed } from 'vue'

const props = defineProps({
  access: { type: Object, required: true },
})

const emit = defineEmits(['activate-access', 'open-concierge', 'go-section', 'select-plan'])

const subscriptionLabel = computed(() => String(props.access?.subscription?.status || 'Sin membresia').trim())
const hasMembership = computed(() => !['', 'Sin membresia'].includes(subscriptionLabel.value))

const plans = computed(() => [
  {
    name: 'Sky Access',
    badge: 'Opcional',
    description: 'Ideal para ahorrar mas y mejorar tu experiencia despues de haber reservado.',
    price: 'Mejor tarifa por vuelo',
    cta: hasMembership.value ? 'Ir a reservar' : 'Ver beneficios',
    target: hasMembership.value ? 'dashboard' : 'plan',
    items: ['Tarifas preferentes', 'Acceso a empty legs', 'Menor fee y concierge inicial'],
  },
  {
    name: 'Business Club',
    badge: 'Corporativo',
    description: 'Pensado para clientes frecuentes y equipos que necesitan mejor flexibilidad.',
    price: 'Beneficios corporativos',
    cta: 'Ver beneficios',
    target: 'solicitudes',
    items: ['Mayor flexibilidad', 'Prioridad operativa', 'Ventajas para cuentas de empresa'],
  },
  {
    name: 'Elite Circle',
    badge: 'Maxima prioridad',
    description: 'La capa mas alta para clientes con operacion constante y gestion dedicada.',
    price: 'Gestion dedicada',
    cta: 'Hablar con concierge',
    target: 'concierge',
    items: ['Prioridad maxima', 'Concierge dedicado', 'Seguimiento total'],
  },
])

const membershipSignals = computed(() => [
  {
    label: 'Reserva',
    value: 'Disponible',
  },
  {
    label: 'Cuenta',
    value: props.access?.has_access ? 'Activa' : 'Lista para usar',
  },
  {
    label: 'Membresia',
    value: subscriptionLabel.value,
  },
  {
    label: 'Operacion',
    value: hasMembership.value ? 'Con beneficios premium' : 'Tarifa estandar activa',
  },
])

const upgradeSteps = computed(() => [
  {
    title: 'Reserva sin friccion',
    description: 'Busca rutas, compara opciones y solicita tu vuelo sin suscripcion obligatoria.',
    meta: 'Paso 01',
  },
  {
    title: 'Opera desde un mismo flujo',
    description: 'Mueve solicitudes, seguimiento y beneficios dentro del mismo recorrido del portal.',
    meta: 'Paso 02',
  },
  {
    title: 'Escala cuando tu operacion lo pida',
    description: 'Sube de nivel si necesitas prioridad, acompanamiento reforzado, empty legs o cobertura corporativa.',
    meta: 'Paso 03',
  },
])

const accountHighlights = computed(() => [
  {
    title: 'Dashboard conectado',
    description: 'Tu cuenta conecta reservas, aircraft preview y concierge desde una sola experiencia.',
    action: 'Ir al resumen',
    target: 'dashboard',
  },
  {
    title: 'Reservas protegidas',
    description: 'Cada solicitud hereda visibilidad, orden y blindaje comercial aunque todavia no tengas membresia.',
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

function handleHeroSecondaryAction() {
  if (hasMembership.value) {
    emit('open-concierge')
    return
  }

  emit('select-plan', { name: 'Sky Access' })
}
</script>

<template>
  <div class="membership-page">
    <section class="dashboard-hero">
      <div class="hero-center">
        <p class="eyebrow dark-eyebrow">Cuenta cliente</p>
        <h1>Reserva libremente y activa beneficios premium solo cuando te convenga.</h1>
        <p class="hero-subtitle">
          Tu cuenta ya puede cotizar, reservar y dar seguimiento. Sky Access aparece como upgrade
          opcional para ahorrar mas, ganar prioridad y sumar concierge.
        </p>

        <div class="hero-membership-shell">
          <div class="hero-membership-main">
            <div class="hero-membership-copy">
              <span class="callout-label">Estado de cuenta</span>
              <strong>{{ hasMembership ? 'La cuenta ya opera con beneficios premium.' : 'La cuenta ya puede reservar sin membresia.' }}</strong>
              <p>
                {{
                  hasMembership
                    ? 'Tu suscripcion agrega mejores tarifas, prioridad y coordinacion premium dentro del mismo portal.'
                    : 'Reserva desde ahora con tarifa estandar. Cuando te convenga, puedes mejorar la experiencia con Sky Access.'
                }}
              </p>
            </div>

            <div class="hero-kpis">
              <article class="hero-kpi-card">
                <span>Reserva</span>
                <strong>Siempre disponible</strong>
              </article>
              <article class="hero-kpi-card">
                <span>Upgrade</span>
                <strong>{{ hasMembership ? 'Sky Access activo' : 'Opcional cuando quieras' }}</strong>
              </article>
            </div>
          </div>

          <div class="hero-membership-actions">
            <button class="hero-action" type="button" @click="$emit('go-section', 'reservar')">
              Reservar vuelo
            </button>
            <button class="ghost-link-button" type="button" @click="handleHeroSecondaryAction">
              {{ hasMembership ? 'Hablar con concierge' : 'Conocer beneficios premium' }}
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
          La narrativa ya no empuja una barrera de entrada: primero reserva, despues escala a
          beneficios premium dentro del mismo sistema.
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
          Cada tarjeta acompana el mismo modelo hibrido del negocio: entrada libre, upgrade opcional
          y capa corporativa cuando el volumen lo pide.
        </p>
      </div>

      <div class="plans-grid refined-modes-grid">
        <article
          v-for="plan in plans"
          :key="plan.name"
          class="plan-card mode-card"
          :class="{ featured: plan.name === 'Business Club' }"
        >
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
          Los beneficios no viven aislados: la reserva sigue abierta y los upgrades aparecen cuando
          realmente ayudan a convertir mejor.
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
