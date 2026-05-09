<script setup>
import BrandLogo from './BrandLogo.vue'
</script>

<template>
  <footer class="site-footer">
    <section class="footer-main">
      <div class="footer-intro">
        <strong class="footer-logo-wrap" aria-label="Sky Group">
          <BrandLogo variant="light" :width="168" />
        </strong>
        <p>
          Plataforma digital para cotizacion, reservas, membresias y operacion aerea ejecutiva con
          seguimiento centralizado.
        </p>

        <div class="store-links">
          <a href="#" class="store-badge" aria-label="Disponible en Google Play">
            <span class="store-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="img">
                <path
                  fill="#00d26a"
                  d="M3.8 2.2c-.3.4-.5.9-.5 1.7v16.1c0 .8.2 1.4.5 1.7l.1.1 9-9V12l-9-9 .1-.8Z"
                />
                <path
                  fill="#00a0ff"
                  d="m16 15.8-3-3.1v-.6l3-3.1.1.1 3.6 2c1 .6 1 1.6 0 2.2l-3.6 2 .1.5Z"
                />
                <path fill="#ff3a44" d="M16.1 15.7 13 12.6 3.8 21.8c.4.4 1 .5 1.8.1l10.5-6.2" />
                <path fill="#ffd400" d="M16.1 8.3 5.6 2.1c-.8-.5-1.4-.4-1.8.1l9.2 9.2 3.1-3.1Z" />
              </svg>
            </span>
            <span class="store-copy">
              <small>Disponible en</small>
              <strong>Google Play</strong>
            </span>
          </a>

          <a href="#" class="store-badge" aria-label="Disponible en App Store">
            <span class="store-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="img">
                <path
                  fill="currentColor"
                  d="M16.7 12.8c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.4-1.6-3-1.6-1.3-.1-2.5.8-3.1.8-.6 0-1.6-.8-2.7-.8-1.4 0-2.7.8-3.4 2-.7 1.2-.9 3 .6 5.2.7 1.1 1.6 2.2 2.8 2.1 1.1 0 1.5-.7 2.8-.7s1.7.7 2.8.7c1.2 0 1.9-1 2.6-2.1.8-1.1 1.1-2.2 1.1-2.3 0 0-2.3-.9-2.3-3.1Zm-2.1-6.2c.6-.7 1-1.7.8-2.6-.9 0-1.9.6-2.5 1.3-.6.6-1.1 1.6-.9 2.5 1 .1 2-.5 2.6-1.2Z"
                />
              </svg>
            </span>
            <span class="store-copy">
              <small>Consiguelo en</small>
              <strong>App Store</strong>
            </span>
          </a>
        </div>
      </div>

      <div class="footer-grid">
        <section>
          <h3>Plataforma</h3>
          <RouterLink to="/servicios">Servicios</RouterLink>
          <RouterLink to="/plataforma">Vista general</RouterLink>
          <RouterLink to="/membresias">Membresias</RouterLink>
          <RouterLink to="/cobertura">Cobertura</RouterLink>
        </section>

        <section>
          <h3>Operacion</h3>
          <RouterLink :to="{ name: 'login-cliente' }">Cliente</RouterLink>
          <RouterLink :to="{ name: 'acceso', query: { role: 'provider' } }">Operador</RouterLink>
          <RouterLink :to="{ name: 'acceso', query: { role: 'sobrecargo' } }"
            >Sobrecargo</RouterLink
          >
          <RouterLink :to="{ name: 'acceso', query: { role: 'admin' } }">Administrativo</RouterLink>
        </section>

        <section>
          <h3>Acceso y soporte</h3>
          <RouterLink to="/login-cliente">Iniciar sesion</RouterLink>
          <a href="https://wa.me/525500000000" target="_blank" rel="noreferrer">WhatsApp</a>
          <RouterLink to="/help">Centro de ayuda</RouterLink>
          <a href="#inicio">Volver arriba</a>
        </section>

        <section>
          <h3>Confianza</h3>
          <span>Atencion continua 24/7</span>
          <span>Acceso protegido por rol</span>
          <span>Seguimiento operativo centralizado</span>
          <span>Privacidad y terminos disponibles bajo solicitud</span>
        </section>
      </div>
    </section>

    <div class="footer-base">
      <span>&copy; 2026 Sky Group</span>
      <span>Operaciones premium, soporte continuo y experiencia centralizada.</span>
    </div>
  </footer>
</template>

<style scoped>
.site-footer {
  padding: clamp(3rem, 7vw, 5.5rem) clamp(1.2rem, 5vw, 4.5rem) 2rem;
  color: #ffffff;
  background:
    radial-gradient(circle at top right, rgba(217, 175, 72, 0.16), transparent 24%),
    linear-gradient(180deg, #050607 0%, #0a1018 100%);
}

.footer-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) auto;
  gap: 2rem;
  align-items: center;
  padding: 1.75rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 28px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.eyebrow {
  margin: 0 0 0.9rem;
  color: #f0c75c;
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.footer-brand h2 {
  max-width: 12ch;
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  font-size: clamp(2.3rem, 5vw, 4rem);
  line-height: 0.95;
  letter-spacing: -0.05em;
}

.footer-summary {
  max-width: 58ch;
  margin: 1rem 0 0;
  color: rgba(255, 255, 255, 0.72);
  font-size: 1rem;
  line-height: 1.7;
}

.footer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
}

.primary-action,
.secondary-action {
  display: inline-flex;
  min-height: 3.35rem;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  padding: 0 1.25rem;
  font-weight: 800;
  text-decoration: none;
  transition:
    transform 180ms ease,
    background 180ms ease,
    border-color 180ms ease;
}

.primary-action {
  color: #0f1217;
  background: linear-gradient(135deg, #f0c75c, #c8922d);
}

.secondary-action {
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #ffffff;
  background: rgba(255, 255, 255, 0.04);
}

.primary-action:hover,
.secondary-action:hover,
.footer-grid a:hover {
  transform: translateY(-2px);
}

.footer-main {
  display: grid;
  grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
  gap: 2rem;
  padding: 2.2rem 0 1.8rem;
}

.footer-intro {
  display: grid;
  gap: 0.75rem;
  align-content: start;
}

.footer-intro strong {
  display: inline-flex;
}

.footer-logo-wrap {
  width: fit-content;
}

.footer-intro p {
  margin: 0;
  color: rgba(255, 255, 255, 0.68);
  line-height: 1.7;
}

.store-links {
  display: grid;
  gap: 0.75rem;
  margin-top: 0.35rem;
}

.store-badge {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 0.8rem;
  min-height: 3.95rem;
  padding: 0.62rem 1rem 0.62rem 0.85rem;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 10px;
  color: #ffffff;
  text-decoration: none;
  background: #050505;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 10px 24px rgba(0, 0, 0, 0.18);
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background 180ms ease;
}

.store-badge:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.92);
  background: #0a0a0a;
}

.store-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.7rem;
  height: 2.7rem;
  color: #ffffff;
  flex: 0 0 auto;
}

.store-icon svg {
  width: 2rem;
  height: 2rem;
  display: block;
}

.store-copy {
  display: grid;
  gap: 0.05rem;
}

.store-copy small {
  color: rgba(255, 255, 255, 0.92);
  font-size: 0.72rem;
  font-weight: 500;
  line-height: 1.05;
  letter-spacing: 0.01em;
}

.store-copy strong {
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  font-size: 1.45rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1;
}

.footer-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1.5rem;
}

.footer-grid section {
  display: grid;
  gap: 0.8rem;
  align-content: start;
}

.footer-grid h3 {
  margin: 0 0 0.2rem;
  color: #ffffff;
  font-size: 1rem;
}

.footer-grid a,
.footer-grid span,
.footer-base span {
  color: rgba(255, 255, 255, 0.72);
  text-decoration: none;
  line-height: 1.6;
}

.footer-base {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-top: 1.4rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.72);
}

@media (max-width: 1080px) {
  .footer-hero,
  .footer-main,
  .footer-grid {
    grid-template-columns: 1fr;
  }

  .footer-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 720px) {
  .footer-base {
    flex-direction: column;
    align-items: flex-start;
  }

  .primary-action,
  .secondary-action {
    width: 100%;
  }
}
</style>
