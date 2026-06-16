<script setup>
defineProps({
  activeView: { type: String, required: true },
  views: { type: Array, required: true },
  summaryCards: { type: Array, required: true },
})

defineEmits(['change-view'])
</script>

<template>
  <article class="surface workspace-card">
    <div class="workspace-head">
      <div>
        <p class="eyebrow">Espacio de trabajo</p>
        <h3>Directorio de sobrecargos</h3>
        <p class="muted">
          El directorio administrativo ahora se distribuye en vistas separadas para revisar equipo, validacion y bitacora sin saturar una sola pantalla.
        </p>
      </div>

      <div class="summary-grid">
        <article v-for="card in summaryCards" :key="card.label" class="summary-card" :data-tone="card.tone || 'neutral'">
          <strong>{{ card.value }}</strong>
          <span>{{ card.label }}</span>
        </article>
      </div>
    </div>

    <div class="views-strip" role="tablist" aria-label="Vistas del directorio">
      <button
        v-for="view in views"
        :key="view.id"
        type="button"
        class="view-button"
        :class="{ 'view-button--active': activeView === view.id }"
        @click="$emit('change-view', view.id)"
      >
        <span>{{ view.label }}</span>
        <strong>{{ view.count }}</strong>
      </button>
    </div>
  </article>
</template>

<style scoped>
.workspace-card {
  color: #0f172a;
  padding: 1.45rem;
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

.workspace-head {
  display: grid;
  gap: 1rem;
}

.summary-grid {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}

.summary-card {
  padding: 0.95rem 1rem;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(219, 234, 254, 0.78), rgba(226, 232, 240, 0.9));
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.summary-card strong {
  display: block;
  font-size: 1.5rem;
  color: #0f172a;
}

.summary-card span {
  color: rgba(15, 23, 42, 0.7);
}

.views-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1rem;
}

.view-button {
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(255, 255, 255, 0.86);
  border-radius: 999px;
  padding: 0.8rem 1rem;
  display: inline-flex;
  gap: 0.55rem;
  align-items: center;
  color: #0f172a;
}

.view-button--active {
  background: linear-gradient(135deg, #0f172a, #1e293b);
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.16);
  color: #f8fafc;
}
</style>
