<template>
  <main class="contact-page">
    <header class="simple-header">
      <RouterLink to="/" class="brand">Sky Group Business</RouterLink>

      <RouterLink to="/login" class="login-pill"> Inicia sesión en el panel </RouterLink>
    </header>

    <section class="contact-layout">
      <form class="contact-card">
        <h1>Contáctanos</h1>
        <p>Recibe atención personalizada para membresías corporativas y vuelos privados.</p>

        <div class="two-cols">
          <input placeholder="Nombre" />
          <input placeholder="Apellido" />
        </div>

        <input placeholder="Correo electrónico de trabajo" />
        <input placeholder="Número de teléfono" />

        <div class="two-cols">
          <input placeholder="Nombre de la empresa" />

          <select>
            <option>País</option>
            <option>México</option>
            <option>Estados Unidos</option>
          </select>
        </div>

        <select>
          <option>Tipo de cliente</option>
          <option>Empresa</option>
          <option>Cliente privado</option>
          <option>Operador aéreo</option>
        </select>

        <select>
          <option>Frecuencia de vuelos</option>
          <option>Ocasional</option>
          <option>Mensual</option>
          <option>Semanal</option>
        </select>

        <select>
          <option>Interés principal</option>
          <option>Membresía corporativa</option>
          <option>Vuelos privados</option>
          <option>Renta de aeronaves</option>
        </select>

        <textarea placeholder="¿Cómo podemos ayudarte?"></textarea>

        <button type="button">Enviar</button>
      </form>

      <section class="benefits">
        <h2>Todas las ventajas de Sky Group, adaptadas a tu movilidad aérea.</h2>

        <article>
          <span>✈</span>
          <p>
            Centraliza vuelos privados, paquetes, usuarios y reservas desde una sola plataforma.
          </p>
        </article>

        <article>
          <span>▣</span>
          <p>Reduce fricción operativa con membresías, rutas preferentes y soporte premium.</p>
        </article>

        <article>
          <span>★</span>
          <p>
            Brinda una experiencia exclusiva para directivos, clientes VIP y equipos ejecutivos.
          </p>
        </article>

        <h3>
          Únete a empresas y clientes que buscan movilidad aérea privada con control, seguridad y
          experiencia premium.
        </h3>

        <div class="logos">
          <strong>Empresas</strong>
          <strong>VIP</strong>
          <strong>Operadores</strong>
        </div>
      </section>
    </section>
  </main>
</template>

<style scoped>
.contact-page {
  min-height: 100vh;
  background: #fff;
  color: #000;
}

.simple-header {
  height: 76px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 7%;
  background: #000;
}

.brand {
  color: #fff;
  font-size: 1.4rem;
  font-weight: 800;
  text-decoration: none;
}

.login-pill {
  padding: 0.8rem 1.2rem;
  border-radius: 999px;
  background: #fff;
  color: #000;
  font-weight: 800;
  text-decoration: none;
}

.contact-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4rem;
  max-width: 1250px;
  margin: auto;
  padding: 3rem 1.5rem;
}

.contact-card {
  padding: 2.4rem;
  border-radius: 4px;
  background: #fff;
  box-shadow: 0 0 28px rgba(0, 0, 0, 0.18);
}

.contact-card h1 {
  margin: 0 0 1rem;
  font-size: 2rem;
}

.contact-card p {
  color: #0645d8;
  margin-bottom: 1.5rem;
}

.two-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.9rem;
}

input,
select,
textarea {
  width: 100%;
  min-height: 44px;
  margin-bottom: 1rem;
  padding: 0 0.8rem;
  border: 1.5px solid #222;
  border-radius: 4px;
  font-size: 0.95rem;
}

textarea {
  min-height: 80px;
  padding-top: 0.8rem;
  resize: vertical;
}

.contact-card button {
  display: block;
  min-width: 90px;
  height: 52px;
  margin: auto;
  border: 0;
  border-radius: 10px;
  background: #000;
  color: #fff;
  font-weight: 800;
  cursor: pointer;
}

.benefits {
  padding: 2rem 0;
}

.benefits h2 {
  max-width: 620px;
  font-size: clamp(2rem, 4vw, 3rem);
  line-height: 1.05;
  margin-bottom: 2rem;
}

.benefits article {
  display: grid;
  grid-template-columns: 54px 1fr;
  gap: 1rem;
  align-items: start;
  margin-bottom: 2rem;
}

.benefits span {
  font-size: 2rem;
}

.benefits p {
  font-size: 1.1rem;
  line-height: 1.5;
}

.benefits h3 {
  max-width: 650px;
  margin-top: 3rem;
  font-size: 2rem;
  line-height: 1.15;
}

.logos {
  display: flex;
  gap: 3rem;
  flex-wrap: wrap;
  margin-top: 2rem;
  color: #0b57d0;
  font-size: 2rem;
}

@media (max-width: 900px) {
  .contact-layout {
    grid-template-columns: 1fr;
  }

  .two-cols {
    grid-template-columns: 1fr;
  }

  .simple-header {
    padding: 0 1rem;
  }

  .login-pill {
    font-size: 0.8rem;
  }
}
</style>
