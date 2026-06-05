<script setup>
defineProps({
  summaryCards: { type: Array, required: true },
})
</script>

<template>
  <header class="surface hero-card">
    <div>
      <span class="eyebrow">Espacio de trabajo</span>
      <h3>Disponibilidad de sobrecargos</h3>
      <p class="muted">Consulta y administra la disponibilidad operativa diaria de todas las sobrecargos.</p>
    </div>

    <div class="summary-grid">
      <article v-for="card in summaryCards" :key="card.label" class="summary-card">
        <strong>{{ card.value }}</strong>
        <span>{{ card.label }}</span>
      </article>
    </div>
  </header>
</template>

<style scoped>
.hero-card {
  color: #0f172a;
  padding: 1.4rem;
  border-radius: 28px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.98), rgba(241, 245, 249, 0.96));
}

.eyebrow {
  color: #c88412;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h3 {
  margin: 0.2rem 0 0.35rem;
  color: #0f172a;
}

.muted {
  color: rgba(51, 65, 85, 0.78);
}

.summary-grid {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  margin-top: 1rem;
}

.summary-card {
  padding: 0.95rem 1rem;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(219, 234, 254, 0.78), rgba(226, 232, 240, 0.9));
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.summary-card strong {
  display: block;
  font-size: 1.55rem;
  color: #0f172a;
}

.summary-card span {
  color: rgba(15, 23, 42, 0.72);
}
</style>
