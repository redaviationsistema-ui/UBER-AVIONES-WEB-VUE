<script setup>
const portalCards = [
  {
    title: 'Portal operador',
    description: 'Disponibilidad, flota, validación y respuesta operativa.',
    role: 'provider',
  },
  {
    title: 'Portal sobrecargo',
    description: 'Agenda, briefings, servicios asignados e incidencias.',
    role: 'sobrecargo',
  },
  {
    title: 'Panel administrativo',
    description: 'Usuarios, indicadores, alertas y control ejecutivo.',
    role: 'admin',
  },
]
</script>

<template>
  <main class="portal-access-page">
    <section class="portal-access-shell">
      <div class="portal-access-copy">
        <p class="eyebrow">Accesos por rol</p>
        <h1>Selecciona el portal al que quieres ingresar.</h1>
        <p>
          Esta vista es exclusiva para operación interna. Elige tu acceso y continúa con
          correo y contraseña.
        </p>
      </div>

      <div class="portal-grid">
        <RouterLink
          v-for="card in portalCards"
          :key="card.role"
          :to="{ name: 'login', query: { role: card.role } }"
          class="portal-card"
        >
          <span class="portal-kicker">Operación</span>
          <strong>{{ card.title }}</strong>
          <p>{{ card.description }}</p>
          <span class="portal-action">Ingresar</span>
        </RouterLink>
      </div>

      <div class="portal-register">
        <span>¿Eres cliente?</span>
        <RouterLink :to="{ name: 'login-cliente' }">Ir a acceso cliente</RouterLink>
      </div>
    </section>
  </main>
</template>

<style scoped>
.portal-access-page {
  min-height: 100vh;
  padding: clamp(1.2rem, 4vw, 2rem);
  background:
    radial-gradient(circle at top right, rgba(214, 181, 101, 0.16), transparent 22%),
    linear-gradient(180deg, #0a0d12 0%, #111722 100%);
  color: #ffffff;
}

.portal-access-shell {
  max-width: 1180px;
  margin: 0 auto;
  display: grid;
  gap: 1.5rem;
  padding: clamp(1.4rem, 4vw, 2rem);
}

.eyebrow {
  margin: 0 0 0.65rem;
  color: #f0c75c;
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.portal-access-copy h1 {
  max-width: 11ch;
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  font-size: clamp(2.5rem, 6vw, 4.4rem);
  line-height: 0.95;
  letter-spacing: -0.05em;
}

.portal-access-copy p:last-child,
.portal-card p,
.portal-register span {
  color: rgba(255, 255, 255, 0.72);
  line-height: 1.7;
}

.portal-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}

.portal-card {
  display: grid;
  gap: 0.85rem;
  min-height: 220px;
  padding: 1.35rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  color: #ffffff;
  text-decoration: none;
  background: rgba(255, 255, 255, 0.04);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.18);
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background 180ms ease;
}

.portal-card:hover {
  transform: translateY(-4px);
  border-color: rgba(240, 199, 92, 0.38);
  background: rgba(240, 199, 92, 0.08);
}

.portal-kicker,
.portal-action {
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.portal-kicker {
  color: #f0c75c;
}

.portal-card strong {
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  font-size: 1.45rem;
  letter-spacing: -0.03em;
}

.portal-action {
  color: #ffffff;
}

.portal-register {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.portal-register a {
  color: #f0c75c;
  font-weight: 800;
  text-decoration: none;
}

@media (max-width: 1080px) {
  .portal-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 680px) {
  .portal-grid {
    grid-template-columns: 1fr;
  }
}
</style>
