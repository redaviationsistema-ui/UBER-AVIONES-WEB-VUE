<template>
  <main class="coverage-page">
    <section class="hero">
      <h1>Cobertura estratégica</h1>
      <p>México, LATAM y rutas internacionales selectas.</p>
    </section>

    <section class="coverage-content">
      <div class="coverage-card">
        <h2>Cobertura nacional</h2>
        <p>Principales hubs ejecutivos y destinos estratégicos.</p>
      </div>

      <div class="coverage-card">
        <h2>Expansión internacional</h2>
        <p>Conectividad premium para negocios y movilidad privada.</p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.coverage-page {
  min-height: 100vh;
  padding: 7rem 2rem;
  background: #09090c;
  color: white;
}

.hero {
  text-align: center;
  margin-bottom: 4rem;
}

.coverage-content {
  display: grid;
  gap: 2rem;
  max-width: 1000px;
  margin: auto;
}

.coverage-card {
  padding: 2rem;
  border-radius: 24px;
  background: rgba(255,255,255,.05);
}
</style>