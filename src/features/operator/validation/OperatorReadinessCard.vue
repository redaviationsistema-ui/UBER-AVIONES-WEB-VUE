<script setup>
const props = defineProps({
  progress: { type: Object, default: () => ({ completed: 0, total: 0, percent: 0 }) },
  checklist: { type: Array, default: () => [] },
  alerts: { type: Array, default: () => [] },
  title: { type: String, default: 'Readiness del expediente' },
  subtitle: { type: String, default: 'Avance real calculado por backend' },
})
</script>

<template>
  <section class="operator-readiness-card">
    <header class="operator-readiness-card__head">
      <div>
        <p class="operator-readiness-card__eyebrow">Readiness</p>
        <h3>{{ title }}</h3>
        <p>{{ subtitle }}</p>
      </div>
      <div class="operator-readiness-card__ring" :style="{ '--progress': `${progress.percent || 0}%` }">
        <strong>{{ progress.percent || 0 }}%</strong>
        <span>Completo</span>
      </div>
    </header>

    <div class="operator-readiness-card__chips">
      <span
        v-for="item in checklist"
        :key="item.id || item.key || item.label"
        class="operator-readiness-card__chip"
        :data-tone="item.complete ? 'success' : 'warning'"
      >
        {{ item.complete ? 'OK' : 'PEND' }} {{ item.label }}
      </span>
    </div>

    <div v-if="alerts.length" class="operator-readiness-card__alerts">
      <article v-for="alert in alerts" :key="alert.title" class="operator-readiness-card__alert" :data-tone="alert.tone || 'info'">
        <strong>{{ alert.title }}</strong>
      </article>
    </div>
  </section>
</template>

<style scoped>
.operator-readiness-card {
  display: grid;
  gap: 18px;
  padding: 22px;
  border-radius: 24px;
  border: 1px solid rgba(21, 50, 77, 0.08);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 246, 241, 0.96));
}

.operator-readiness-card__head {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: center;
}

.operator-readiness-card__eyebrow {
  margin: 0 0 6px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.78rem;
  font-weight: 700;
  color: #5f87c7;
}

.operator-readiness-card__head h3 {
  margin: 0;
  color: #15324d;
}

.operator-readiness-card__head p {
  margin: 8px 0 0;
  color: #6f8096;
}

.operator-readiness-card__ring {
  width: 124px;
  aspect-ratio: 1;
  border-radius: 999px;
  display: grid;
  place-items: center;
  text-align: center;
  background:
    radial-gradient(circle at center, rgba(255, 255, 255, 0.98) 0 58%, transparent 59%),
    conic-gradient(#2d6ab1 0 var(--progress), rgba(45, 106, 177, 0.12) var(--progress) 100%);
}

.operator-readiness-card__ring strong {
  display: block;
  color: #15324d;
}

.operator-readiness-card__ring span {
  display: block;
  font-size: 0.82rem;
  color: #6f8096;
}

.operator-readiness-card__chips,
.operator-readiness-card__alerts {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.operator-readiness-card__chip,
.operator-readiness-card__alert {
  padding: 10px 12px;
  border-radius: 14px;
  font-size: 0.9rem;
  font-weight: 600;
}

.operator-readiness-card__chip[data-tone='success'],
.operator-readiness-card__alert[data-tone='success'] {
  background: #e7f7ee;
  color: #2f9a6c;
}

.operator-readiness-card__chip[data-tone='warning'],
.operator-readiness-card__alert[data-tone='warning'] {
  background: #fff4df;
  color: #de9b29;
}

.operator-readiness-card__alert[data-tone='danger'] {
  background: #feebe6;
  color: #dc7a68;
}

.operator-readiness-card__alert[data-tone='info'] {
  background: #e8f0fd;
  color: #5f87c7;
}

@media (max-width: 900px) {
  .operator-readiness-card__head {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
