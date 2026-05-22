<template>
  <main class="start-page">
    <section class="hero">
      <h1>Hay 2 maneras de crecer con Sky Group</h1>
      <p>
        Puedes reservar desde ahora sin suscripcion, o activar una capa premium cuando tu volumen,
        tus ahorros o tu operacion ya lo justifiquen.
      </p>
    </section>

    <section class="options-grid">
      <article class="option-card">
        <div class="visual visual-one"></div>

        <h2>Reserva libre para comenzar de inmediato</h2>

        <ul>
          <li>Ideal para clientes ocasionales o primeras reservas.</li>
          <li>Cotiza, elige aeronave y solicita tu vuelo sin membresia obligatoria.</li>
          <li>Seguimiento comercial, historial y experiencia digital desde plataforma.</li>
          <li>Perfecto para probar el producto antes de comprometerte.</li>
        </ul>

        <RouterLink to="/renta-aeronaves" class="primary-btn"> Cotizar renta </RouterLink>
      </article>

      <article class="option-card">
        <div class="visual visual-two"></div>

        <h2>Una experiencia premium para clientes frecuentes y empresas</h2>

        <ul>
          <li>Para cuentas que necesitan prioridad, credito o facturacion centralizada.</li>
          <li>Gestion de multiples usuarios, rutas, preferencias y aprobaciones.</li>
          <li>Mejor tarifa, menor fee, concierge y control operativo reforzado.</li>
          <li>Ideal para movilidad aerea corporativa y clientes premium recurrentes.</li>
        </ul>

        <RouterLink to="/membresias/contacto" class="primary-btn">
          Comunícate con ventas
        </RouterLink>
      </article>
    </section>

    <section class="resources">
      <h2>¿Necesitas más tiempo para comenzar?</h2>
      <p>
        Consulta estos recursos para entender como Sky Group combina reserva libre, membresia
        opcional y operacion aerea premium.
      </p>

      <div class="resources-grid">
        <article>
          <span>▣</span>
          <h3>Guia Sky Access</h3>
          <p>
            Conoce cuando conviene subir de nivel y que beneficios se activan despues de reservar.
          </p>
          <RouterLink to="/membresias">Ver beneficios</RouterLink>
        </article>

        <article>
          <span>✈</span>
          <h3>Prioriza viajes ejecutivos</h3>
          <p>Organiza vuelos para directivos, equipos comerciales o clientes importantes.</p>
          <RouterLink to="/renta-aeronaves">Cotizar renta</RouterLink>
        </article>

        <article>
          <span>★</span>
          <h3>Movilidad aérea premium</h3>
          <p>Crea una experiencia más eficiente con soporte, concierge y cobertura avanzada.</p>
          <RouterLink to="/plataforma">Conoce la plataforma</RouterLink>
        </article>
      </div>
    </section>
  </main>
</template>

<style scoped>
.start-page {
  min-height: 100vh;
  background: #f4f7ff;
  color: #111;
}

.hero {
  max-width: 900px;
  margin: auto;
  padding: 5rem 1.5rem 3rem;
  text-align: center;
}

.hero h1 {
  margin: 0;
  font-size: clamp(2.8rem, 6vw, 5rem);
  line-height: 1;
  letter-spacing: -0.05em;
}

.hero p {
  max-width: 680px;
  margin: 1.4rem auto 0;
  color: #445;
  font-size: 1.1rem;
  line-height: 1.7;
}

.options-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 3rem;
  max-width: 1250px;
  margin: auto;
  padding: 2rem 1.5rem 5rem;
}

.option-card {
  padding: 2rem;
  border-radius: 28px;
  background: white;
}

.visual {
  height: 260px;
  margin-bottom: 2rem;
  border-radius: 22px;
  background: #dbe7ff;
}

.visual-one {
  background:
    radial-gradient(circle at 70% 40%, #ffd37a 0 12%, transparent 13%),
    linear-gradient(135deg, #dbe7ff, #a9c7ff);
}

.visual-two {
  background:
    radial-gradient(circle at 60% 35%, #ffffff 0 10%, transparent 11%),
    linear-gradient(135deg, #cfe0ff, #7aa4ff);
}

.option-card h2 {
  margin: 0 0 1.4rem;
  font-size: clamp(1.8rem, 3vw, 2.8rem);
  line-height: 1.08;
}

.option-card ul {
  margin: 0 0 2rem;
  padding-left: 1.2rem;
  color: #333;
  line-height: 1.7;
}

.primary-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 1.4rem;
  border-radius: 10px;
  background: #000;
  color: white;
  font-weight: 900;
  text-decoration: none;
}

.resources {
  padding: 5rem 1.5rem;
  background: white;
}

.resources > h2,
.resources > p,
.resources-grid {
  max-width: 1250px;
  margin-left: auto;
  margin-right: auto;
}

.resources h2 {
  font-size: clamp(2rem, 4vw, 3rem);
  margin-bottom: 1rem;
}

.resources > p {
  color: #555;
  max-width: 720px;
  margin-bottom: 3rem;
  line-height: 1.7;
}

.resources-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 3rem;
}

.resources-grid span {
  font-size: 2rem;
}

.resources-grid p {
  color: #555;
  line-height: 1.7;
}

.resources-grid a {
  color: #000;
  font-weight: 800;
}

@media (max-width: 900px) {
  .options-grid,
  .resources-grid {
    grid-template-columns: 1fr;
  }
}
</style>
