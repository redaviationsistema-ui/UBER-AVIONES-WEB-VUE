<template>
  <main class="help-page">
    <section class="hero">
      <h1>Centro de ayuda</h1>
      <p>Asistencia, preguntas frecuentes y soporte operativo.</p>
    </section>

    <section class="faq-list">
      <div class="faq-card">
        <h2>¿Cómo cotizo?</h2>
        <p>Selecciona base, fechas y categoría desde Renta de aeronaves.</p>
      </div>

      <div class="faq-card">
        <h2>¿Qué incluye mi membresía?</h2>
        <p>Beneficios según nivel, prioridad y cobertura.</p>
      </div>

      <div class="faq-card">
        <h2>¿Cómo contacto soporte?</h2>
        <p>Chat, correo o asistencia dedicada.</p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.help-page {
  min-height: 100vh;
  padding: 7rem 2rem;
  background: #0b0b0f;
  color: white;
}

.hero {
  text-align: center;
  margin-bottom: 4rem;
}

.faq-list {
  display: grid;
  gap: 1.5rem;
  max-width: 1000px;
  margin: auto;
}

.faq-card {
  padding: 2rem;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.04);
}
</style>
