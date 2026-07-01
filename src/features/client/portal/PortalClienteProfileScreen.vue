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

            <div class="profile-mini-note">
              <strong>Perfil sincronizado</strong>
              <p>
                Estos datos se usan como referencia rápida en flujos de pago, reservas y atención
                ejecutiva.
              </p>
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
              <span class="profile-panel__badge">UX premium</span>
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
  --profile-ink: #151515;
  --profile-muted: #666053;
  --profile-soft: #f5f0e6;
  --profile-line: rgba(21, 21, 21, 0.08);
  --profile-gold: #a77b2d;
  --profile-gold-soft: #f1e2bf;
  --profile-panel: rgba(255, 255, 255, 0.82);
  --profile-panel-strong: #fffdfa;
  display: grid;
  gap: 1.2rem;
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
  padding: clamp(1.2rem, 3vw, 2rem);
  border: 1px solid rgba(167, 123, 45, 0.2);
  border-radius: 30px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.92), rgba(249, 243, 231, 0.88)),
    linear-gradient(180deg, #fffdfa, #f3ede2);
  box-shadow: 0 24px 60px rgba(17, 17, 17, 0.08);
}

.profile-hero__backdrop {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at top right, rgba(167, 123, 45, 0.18), transparent 28%),
    radial-gradient(circle at left center, rgba(17, 17, 17, 0.06), transparent 26%);
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
    linear-gradient(135deg, #111111, #4b4338),
    linear-gradient(180deg, #f7e5b2, #d0a85b);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    0 20px 36px rgba(17, 17, 17, 0.18);
}

.profile-avatar span {
  color: #f5eddc;
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
  background: #111111;
  color: #ffffff;
}

.profile-pill--muted {
  background: rgba(17, 17, 17, 0.06);
  color: var(--profile-ink);
}

.profile-pill--accent {
  background: linear-gradient(135deg, #f6e9c5, #ecd6a0);
  color: #8d6723;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55);
}

.profile-plan-card,
.profile-panel,
.profile-story-card,
.profile-kpi-card {
  border: 1px solid var(--profile-line);
  border-radius: 24px;
  background: var(--profile-panel);
  backdrop-filter: blur(16px);
  box-shadow: 0 18px 40px rgba(17, 17, 17, 0.05);
}

.profile-plan-card {
  display: grid;
  align-content: start;
  gap: 0.55rem;
  padding: 1.2rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(246, 239, 225, 0.88)),
    var(--profile-panel);
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
  color: #8c6a1f;
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
  background: rgba(17, 17, 17, 0.06);
  color: #433d34;
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
}

.profile-kpi-card strong {
  font-size: clamp(1.45rem, 3vw, 2rem);
  line-height: 1;
  color: var(--profile-ink);
}

.profile-kpi-card small {
  color: #6d6658;
}

.profile-signal-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.profile-signal-card {
  display: grid;
  gap: 0.45rem;
  padding: 1rem 1.05rem;
  border: 1px solid rgba(17, 17, 17, 0.06);
  border-radius: 20px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(245, 239, 228, 0.9)),
    var(--profile-panel);
  box-shadow: 0 16px 32px rgba(17, 17, 17, 0.04);
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
  background:
    radial-gradient(circle at top right, rgba(167, 123, 45, 0.12), transparent 32%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(247, 241, 229, 0.92));
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
  background: rgba(17, 17, 17, 0.06);
  color: #4d473e;
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
  border: 1px solid rgba(17, 17, 17, 0.06);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
}

.profile-contact-item strong,
.profile-fact-card strong {
  color: var(--profile-ink);
}

.profile-mini-note {
  display: grid;
  gap: 0.35rem;
  padding: 1rem;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(17, 17, 17, 0.04), rgba(17, 17, 17, 0.02));
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
  color: #6d6658;
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
  background: linear-gradient(180deg, #111111, #6c624f);
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
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(249, 244, 235, 0.9)),
    var(--profile-panel);
}

.profile-story-card--dark {
  background:
    radial-gradient(circle at top right, rgba(255, 209, 102, 0.12), transparent 30%),
    linear-gradient(180deg, #1f1d1a, #2c2924);
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
    border-radius: 24px;
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
    border-radius: 20px;
  }

  .profile-panel__head {
    flex-direction: column;
    align-items: start;
  }
}
</style>
