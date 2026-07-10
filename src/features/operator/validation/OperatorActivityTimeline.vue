<script setup>
import { formatValidationDate } from '../../../lib/operatorValidationApi'

defineProps({
  entries: { type: Array, default: () => [] },
  title: { type: String, default: 'Actividad administrativa' },
})
</script>

<template>
  <section class="operator-activity-timeline">
    <header>
      <p class="operator-activity-timeline__eyebrow">Actividad</p>
      <h3>{{ title }}</h3>
    </header>

    <div class="operator-activity-timeline__list">
      <article v-for="entry in entries" :key="entry.id" class="operator-activity-timeline__item" :data-tone="entry.tone || 'info'">
        <span class="operator-activity-timeline__dot"></span>
        <div>
          <strong>{{ entry.title }}</strong>
          <p>{{ entry.description || 'Sin detalle adicional.' }}</p>
          <small>{{ formatValidationDate(entry.createdAt) }}<template v-if="entry.createdBy"> · {{ entry.createdBy }}</template></small>
        </div>
      </article>

      <p v-if="!entries.length" class="operator-activity-timeline__empty">
        El historial aparecera aqui conforme avance la validacion.
      </p>
    </div>
  </section>
</template>

<style scoped>
.operator-activity-timeline {
  display: grid;
  gap: 18px;
  padding: 22px;
  border-radius: 24px;
  border: 1px solid rgba(21, 50, 77, 0.08);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 246, 241, 0.96));
}

.operator-activity-timeline__eyebrow {
  margin: 0 0 6px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.78rem;
  font-weight: 700;
  color: #5f87c7;
}

.operator-activity-timeline h3 {
  margin: 0;
  color: #15324d;
}

.operator-activity-timeline__list {
  display: grid;
  gap: 12px;
}

.operator-activity-timeline__item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid rgba(21, 50, 77, 0.08);
}

.operator-activity-timeline__dot {
  width: 10px;
  height: 10px;
  margin-top: 8px;
  border-radius: 999px;
  background: #5f87c7;
}

.operator-activity-timeline__item[data-tone='success'] .operator-activity-timeline__dot {
  background: #2f9a6c;
}

.operator-activity-timeline__item[data-tone='warning'] .operator-activity-timeline__dot {
  background: #de9b29;
}

.operator-activity-timeline__item[data-tone='danger'] .operator-activity-timeline__dot {
  background: #dc7a68;
}

.operator-activity-timeline__item strong {
  color: #15324d;
}

.operator-activity-timeline__item p,
.operator-activity-timeline__item small,
.operator-activity-timeline__empty {
  margin: 4px 0 0;
  color: #6f8096;
}
</style>
