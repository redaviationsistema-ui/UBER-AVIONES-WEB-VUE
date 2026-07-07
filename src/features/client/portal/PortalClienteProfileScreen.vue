<script setup>
defineProps({
  activePaymentBadge: { type: String, default: '' },
  activePlan: { type: String, required: true },
  commercialAccessRenewalPanel: { type: Object, required: true },
  hasActiveClientAccess: { type: Boolean, required: true },
  isCommercialAccessExpired: { type: Function, required: true },
  otherSectionCardCopy: { type: Object, required: true },
  profileDisplayName: { type: String, required: true },
  profileEmail: { type: String, required: true },
  profileInitials: { type: String, required: true },
  profilePhone: { type: String, required: true },
  profileStats: { type: Array, required: true },
  section: { type: String, required: true },
  userFirstName: { type: String, required: true },
  accessSource: { type: Object, default: () => ({}) },
})
</script>

<template>
  <section class="profile-screen screen">
    <template v-if="section === 'perfil'">
      <section class="profile-shell">
        <header class="profile-hero">
          <div class="profile-hero__backdrop"></div>

          <div class="profile-hero__main">
            <div class="profile-identity">
              <div class="profile-avatar">
                <span>{{ profileInitials }}</span>
              </div>

              <div class="profile-identity__copy">
                <span class="profile-overline">Executive Client Workspace</span>
                <h2>Hola, {{ userFirstName }}</h2>
                <p>
                  Tu cuenta concentra identidad, contacto y estado comercial para que reservar,
                  pagar y dar seguimiento sea mucho más claro.
                </p>

                <div class="profile-status-row">
                  <span class="profile-pill profile-pill--primary">
                    {{ hasActiveClientAccess ? 'Acceso activo' : 'Acceso privado' }}
                  </span>
                  <span class="profile-pill profile-pill--muted">
                    {{
                      isCommercialAccessExpired(accessSource)
                        ? 'Renovación pendiente'
                        : 'Experiencia sincronizada'
                    }}
                  </span>
                  <span v-if="activePaymentBadge" class="profile-pill profile-pill--accent">
                    {{ activePaymentBadge }}
                  </span>
                </div>
              </div>
            </div>

            <aside class="profile-plan-card">
              <span class="profile-plan-card__label">Plan actual</span>
              <strong>{{ activePlan }}</strong>
              <p>{{ commercialAccessRenewalPanel.title }}</p>
              <div class="profile-plan-card__stack">
                <span>{{ hasActiveClientAccess ? 'Marketplace desbloqueado' : 'Cabina privada' }}</span>
                <span>{{
                  isCommercialAccessExpired(accessSource)
                    ? 'Renovación recomendada'
                    : 'Cuenta lista para operar'
                }}</span>
              </div>
            </aside>
          </div>
        </header>

        <section class="profile-kpi-grid">
          <article v-for="item in profileStats" :key="item.label" class="profile-kpi-card">
            <span class="profile-kpi-card__label">{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
            <small>{{ item.caption }}</small>
          </article>
        </section>

        <section class="profile-signal-grid">
          <article class="profile-signal-card">
            <span class="profile-overline">Workspace</span>
            <strong>Claridad inmediata</strong>
            <p>La cuenta prioriza lectura rápida para que el cliente se ubique en segundos.</p>
          </article>
          <article class="profile-signal-card">
            <span class="profile-overline">Billing</span>
            <strong>Renovación visible</strong>
            <p>El estado comercial y la continuidad del acceso permanecen al frente de la experiencia.</p>
          </article>
          <article class="profile-signal-card">
            <span class="profile-overline">Support</span>
            <strong>Operación acompañada</strong>
            <p>La vista comunica control, servicio premium y seguimiento constante.</p>
          </article>
        </section>

        <section class="profile-content-grid">
          <article class="profile-panel profile-panel--contact">
            <div class="profile-panel__head">
              <div>
                <span class="profile-overline">Cuenta</span>
                <h3>Identidad del cliente</h3>
              </div>
              <span class="profile-panel__badge">Sin edición</span>
            </div>

            <div class="profile-contact-list">
              <div class="profile-contact-item">
                <span>Nombre</span>
                <strong>{{ profileDisplayName }}</strong>
              </div>
              <div class="profile-contact-item">
                <span>Correo</span>
                <strong>{{ profileEmail }}</strong>
              </div>
              <div class="profile-contact-item">
                <span>Teléfono</span>
                <strong>{{ profilePhone }}</strong>
              </div>
            </div>

          
          </article>

          <article class="profile-panel profile-panel--renewal" :data-tone="commercialAccessRenewalPanel.tone">
            <div class="profile-panel__head">
              <div>
                <span class="profile-overline">Billing</span>
                <h3>{{ commercialAccessRenewalPanel.title }}</h3>
              </div>
              <span class="profile-panel__badge">Automático</span>
            </div>

            <p class="profile-panel__lead">{{ commercialAccessRenewalPanel.message }}</p>

            <div class="profile-facts-grid">
              <article
                v-for="item in commercialAccessRenewalPanel.rows"
                :key="item.label"
                class="profile-fact-card"
              >
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </article>
            </div>

            <small class="profile-panel__footnote">{{ commercialAccessRenewalPanel.outcome }}</small>
          </article>
        </section>

        <section class="profile-dual-grid">
          <article class="profile-panel profile-panel--executive">
            <div class="profile-panel__head">
              <div>
                <span class="profile-overline">Experience</span>
                <h3>Lo que esta vista resuelve</h3>
              </div>
            </div>

            <div class="profile-bullet-list">
              <div class="profile-bullet-item">
                <span class="profile-bullet-item__dot"></span>
                <div>
                  <strong>Identidad confiable</strong>
                  <p>Nombre, correo y teléfono quedan visibles sin perder limpieza visual.</p>
                </div>
              </div>
              <div class="profile-bullet-item">
                <span class="profile-bullet-item__dot"></span>
                <div>
                  <strong>Estado comercial legible</strong>
                  <p>Renovación, continuidad y plan actual aparecen en un mismo marco visual.</p>
                </div>
              </div>
              <div class="profile-bullet-item">
                <span class="profile-bullet-item__dot"></span>
                <div>
                  <strong>Experiencia más ejecutiva</strong>
                  <p>La cuenta se siente más cercana a producto premium que a pantalla administrativa.</p>
                </div>
              </div>
            </div>
          </article>

          <article class="profile-panel profile-panel--timeline">
            <div class="profile-panel__head">
              <div>
                <span class="profile-overline">Cuenta</span>
                <h3>Lectura rápida de estado</h3>
              </div>
              <span class="profile-panel__badge">Live</span>
            </div>

            <div class="profile-timeline">
              <div class="profile-timeline__item">
                <span class="profile-timeline__dot profile-timeline__dot--done"></span>
                <div>
                  <strong>Perfil cargado</strong>
                  <p>La identidad del cliente ya está disponible para la operación.</p>
                </div>
              </div>
              <div class="profile-timeline__item">
                <span
                  class="profile-timeline__dot"
                  :class="hasActiveClientAccess ? 'profile-timeline__dot--done' : 'profile-timeline__dot--active'"
                ></span>
                <div>
                  <strong>{{ hasActiveClientAccess ? 'Acceso comercial vigente' : 'Acceso por consolidar' }}</strong>
                  <p>
                    {{
                      hasActiveClientAccess
                        ? 'La cuenta puede continuar cotizando y operando con normalidad.'
                        : 'La cuenta sigue disponible, pero conviene completar o reactivar el acceso.'
                    }}
                  </p>
                </div>
              </div>
              <div class="profile-timeline__item">
                <span class="profile-timeline__dot profile-timeline__dot--muted"></span>
                <div>
                  <strong>Siguiente interacción</strong>
                  <p>Reservar, revisar vuelos o continuar seguimiento desde la misma cabina.</p>
                </div>
              </div>
            </div>
          </article>
        </section>

    
      </section>
    </template>

    <div v-else class="profile-fallback-grid">
      <article class="profile-story-card">
        <span class="profile-overline">{{ otherSectionCardCopy.primaryEyebrow }}</span>
        <h3>{{ otherSectionCardCopy.primaryTitle }}</h3>
        <p>{{ otherSectionCardCopy.primaryText }}</p>
      </article>
      <article class="profile-story-card profile-story-card--dark">
        <span class="profile-overline">{{ otherSectionCardCopy.secondaryEyebrow }}</span>
        <h3>{{ otherSectionCardCopy.secondaryTitle }}</h3>
        <p>{{ otherSectionCardCopy.secondaryText }}</p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.profile-screen {
  --profile-ink: #13294b;
  --profile-ink-soft: #334766;
  --profile-muted: #687a96;
  --profile-soft: #f7f3ea;
  --profile-line: rgba(19, 41, 75, 0.09);
  --profile-gold: #b48a3c;
  --profile-gold-soft: #f2dfb2;
  --profile-panel: rgba(255, 252, 246, 0.88);
  --profile-panel-strong: #fffdf8;
  display: grid;
  gap: 1.2rem;
  padding: clamp(1rem, 2vw, 1.5rem);
  border-radius: 34px;
  background: #ffffff;
}

.profile-shell,
.profile-content-grid,
.profile-dual-grid,
.profile-signal-grid,
.profile-story-grid,
.profile-fallback-grid {
  display: grid;
  gap: 1rem;
}

.profile-hero {
  position: relative;
  overflow: hidden;
  padding: clamp(1.45rem, 3vw, 2.35rem);
  border: 1px solid rgba(220, 227, 239, 0.9);
  border-radius: 34px;
  background: #ffffff;
  box-shadow: 0 20px 48px rgba(26, 45, 79, 0.06);
}

.profile-hero__backdrop {
  position: absolute;
  inset: 0;
  background: none;
  pointer-events: none;
}

.profile-hero__main {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(260px, 0.8fr);
  gap: 1rem;
  align-items: stretch;
}

.profile-identity {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}

.profile-avatar {
  display: grid;
  place-items: center;
  width: clamp(4.8rem, 10vw, 6rem);
  height: clamp(4.8rem, 10vw, 6rem);
  border-radius: 28px;
  background:
    linear-gradient(135deg, #0f1728, #22385d),
    linear-gradient(180deg, #f5e2b0, #c7983c);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 20px 36px rgba(15, 23, 40, 0.2);
}

.profile-avatar span {
  color: #fff7e8;
  font-size: clamp(1.3rem, 3vw, 1.9rem);
  font-weight: 900;
  letter-spacing: 0.08em;
}

.profile-identity__copy {
  display: grid;
  gap: 0.7rem;
}

.profile-overline {
  color: var(--profile-gold);
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.profile-identity__copy h2,
.profile-plan-card strong,
.profile-panel h3,
.profile-story-card h3 {
  margin: 0;
  color: var(--profile-ink);
}

.profile-identity__copy h2 {
  font-size: clamp(2rem, 4vw, 3.3rem);
  line-height: 0.98;
}

.profile-identity__copy p,
.profile-plan-card p,
.profile-panel__lead,
.profile-story-card p {
  margin: 0;
  color: var(--profile-muted);
  line-height: 1.6;
}

.profile-status-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
}

.profile-pill {
  display: inline-flex;
  align-items: center;
  min-height: 2.35rem;
  padding: 0 0.95rem;
  border-radius: 999px;
  font-size: 0.86rem;
  font-weight: 700;
}

.profile-pill--primary {
  background: linear-gradient(135deg, #14233e, #304668);
  color: #ffffff;
  box-shadow: 0 12px 30px rgba(20, 35, 62, 0.18);
}

.profile-pill--muted {
  background: rgba(19, 41, 75, 0.07);
  color: var(--profile-ink-soft);
}

.profile-pill--accent {
  background: linear-gradient(135deg, #f8ecd0, #edd5a0);
  color: #98712c;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55);
}

.profile-plan-card,
.profile-panel,
.profile-story-card,
.profile-kpi-card {
  border: 1px solid var(--profile-line);
  border-radius: 28px;
  background: #ffffff;
  backdrop-filter: blur(16px);
  box-shadow: none;
}

.profile-plan-card {
  display: grid;
  align-content: start;
  gap: 0.55rem;
  padding: 1.3rem;
  background: #ffffff;
}

.profile-plan-card__label,
.profile-kpi-card__label,
.profile-contact-item span,
.profile-fact-card span,
.profile-panel__badge {
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.profile-plan-card__label,
.profile-kpi-card__label,
.profile-contact-item span,
.profile-fact-card span {
  color: #9d7830;
}

.profile-plan-card strong {
  font-size: 1.4rem;
}

.profile-plan-card__stack {
  display: grid;
  gap: 0.45rem;
  margin-top: 0.35rem;
}

.profile-plan-card__stack span {
  display: inline-flex;
  align-items: center;
  min-height: 2.2rem;
  padding: 0 0.85rem;
  border-radius: 999px;
  background: rgba(19, 41, 75, 0.07);
  color: #435774;
  font-size: 0.82rem;
  font-weight: 700;
}

.profile-kpi-grid,
.profile-facts-grid {
  display: grid;
  gap: 0.9rem;
}

.profile-kpi-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.profile-kpi-card {
  display: grid;
  gap: 0.4rem;
  padding: 1rem 1.05rem;
  border-color: rgba(255, 255, 255, 0.06);
  background:
    radial-gradient(circle at top left, rgba(216, 182, 106, 0.12), transparent 22%),
    linear-gradient(160deg, #112441, #0d1c34 72%);
  box-shadow: none;
}

.profile-kpi-card strong {
  font-size: clamp(1.45rem, 3vw, 2rem);
  line-height: 1;
  color: #ffffff;
}

.profile-kpi-card small {
  color: rgba(238, 243, 250, 0.78);
}

.profile-kpi-card__label {
  color: rgba(234, 213, 168, 0.88);
}

.profile-signal-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.profile-signal-card {
  display: grid;
  gap: 0.45rem;
  padding: 1rem 1.05rem;
  border: 1px solid rgba(19, 41, 75, 0.08);
  border-radius: 24px;
  background: #ffffff;
  box-shadow: none;
}

.profile-signal-card strong {
  color: var(--profile-ink);
  font-size: 1rem;
}

.profile-signal-card p {
  margin: 0;
  color: var(--profile-muted);
  line-height: 1.55;
}

.profile-content-grid {
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.25fr);
}

.profile-dual-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.profile-panel {
  display: grid;
  gap: 1rem;
  padding: 1.15rem;
}

.profile-panel--renewal {
  background: #ffffff;
}

.profile-panel--renewal[data-tone='success'] {
  border-color: rgba(33, 132, 84, 0.2);
}

.profile-panel--renewal[data-tone='warning'] {
  border-color: rgba(202, 139, 14, 0.22);
}

.profile-panel--renewal[data-tone='danger'] {
  border-color: rgba(170, 62, 62, 0.22);
}

.profile-panel__head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.profile-panel__badge {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0 0.75rem;
  border-radius: 999px;
  background: rgba(19, 41, 75, 0.06);
  color: #556884;
}

.profile-contact-list {
  display: grid;
  gap: 0.75rem;
}

.profile-contact-item,
.profile-fact-card {
  display: grid;
  gap: 0.3rem;
  padding: 0.95rem 1rem;
  border: 1px solid rgba(19, 41, 75, 0.08);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.76);
}

.profile-contact-item strong,
.profile-fact-card strong {
  color: var(--profile-ink);
}

.profile-mini-note {
  display: grid;
  gap: 0.35rem;
  padding: 1rem;
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(19, 41, 75, 0.05), rgba(19, 41, 75, 0.02));
}

.profile-mini-note strong,
.profile-bullet-item strong,
.profile-timeline__item strong {
  color: var(--profile-ink);
}

.profile-mini-note p,
.profile-bullet-item p,
.profile-timeline__item p {
  margin: 0;
  color: var(--profile-muted);
  line-height: 1.55;
}

.profile-facts-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.profile-panel__footnote {
  color: #6c7d96;
  line-height: 1.5;
}

.profile-bullet-list,
.profile-timeline {
  display: grid;
  gap: 0.9rem;
}

.profile-bullet-item,
.profile-timeline__item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.8rem;
  align-items: start;
}

.profile-bullet-item__dot,
.profile-timeline__dot {
  width: 0.9rem;
  height: 0.9rem;
  margin-top: 0.35rem;
  border-radius: 999px;
  flex: 0 0 auto;
}

.profile-bullet-item__dot {
  background: linear-gradient(180deg, #14233e, #8f6b2d);
}

.profile-timeline__dot--done {
  background: linear-gradient(180deg, #0d8a56, #4abf8a);
}

.profile-timeline__dot--active {
  background: linear-gradient(180deg, #b37d19, #e0b659);
}

.profile-timeline__dot--muted {
  background: rgba(17, 17, 17, 0.18);
}

.profile-story-grid,
.profile-fallback-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.profile-story-card {
  display: grid;
  gap: 0.65rem;
  padding: 1.2rem;
  background: #ffffff;
}

.profile-story-card--dark {
  background:
    radial-gradient(circle at top right, rgba(233, 200, 124, 0.16), transparent 30%),
    linear-gradient(180deg, #172844, #0f1d35);
  border-color: rgba(255, 255, 255, 0.06);
}

.profile-story-card--dark h3,
.profile-story-card--dark p,
.profile-story-card--dark .profile-overline {
  color: #f4ede0;
}

.profile-story-card--dark p {
  color: rgba(244, 237, 224, 0.78);
}

@media (max-width: 1100px) {
  .profile-hero__main,
  .profile-content-grid,
  .profile-dual-grid,
  .profile-signal-grid,
  .profile-story-grid,
  .profile-fallback-grid {
    grid-template-columns: 1fr;
  }

  .profile-kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .profile-hero {
    padding: 1rem;
    border-radius: 26px;
  }

  .profile-identity {
    grid-template-columns: 1fr;
  }

  .profile-status-row {
    gap: 0.5rem;
  }

  .profile-kpi-grid,
  .profile-facts-grid {
    grid-template-columns: 1fr;
  }

  .profile-panel,
  .profile-kpi-card,
  .profile-story-card,
  .profile-plan-card {
    border-radius: 22px;
  }

  .profile-panel__head {
    flex-direction: column;
    align-items: start;
  }
}
</style>
