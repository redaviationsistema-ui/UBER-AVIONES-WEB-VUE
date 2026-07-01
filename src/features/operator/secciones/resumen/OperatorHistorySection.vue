<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  historySummary: { type: Object, required: true },
  historyEntries: { type: Array, required: true },
})

const activeFilter = ref('all')

function resolveHistoryCategory(item = {}) {
  const source = `${item.action || ''} ${item.comment || ''} ${item.previousState || ''} ${item.newState || ''}`.toLowerCase()
  if (source.includes('incid')) return 'incidents'
  if (source.includes('asign') || source.includes('tripul') || source.includes('crew')) return 'assignments'
  return 'operations'
}

const filteredHistoryEntries = computed(() =>
  props.historyEntries.filter((item) => activeFilter.value === 'all' || resolveHistoryCategory(item) === activeFilter.value),
)
</script>

<template>
  <section class="history-page">
    <div class="page-head surface">
      <div>
        <span class="eyebrow">Historial</span>
        <h3>Auditoría operativa</h3>
        <p class="muted">
          Consulta cambios, responsables, estados y eventos críticos. Solo Admin puede editar; ningún registro se elimina.
        </p>
      </div>

      <div class="audit-badge">
        Solo lectura
      </div>
    </div>

    <div class="summary-grid">
      <article class="metric-card surface">
        <span>Registros</span>
        <strong>{{ historySummary.registros }}</strong>
      </article>

      <article class="metric-card surface">
        <span>Cambios de estado</span>
        <strong>{{ historySummary.cambios_estado }}</strong>
      </article>

      <article class="metric-card surface">
        <span>Asignaciones</span>
        <strong>{{ historySummary.asignaciones }}</strong>
      </article>

      <article class="metric-card surface">
        <span>Operaciones</span>
        <strong>{{ historySummary.operaciones }}</strong>
      </article>

      <article class="metric-card surface">
        <span>Incidencias</span>
        <strong>{{ historySummary.incidencias }}</strong>
      </article>

      <article class="metric-card surface">
        <span>Archivables</span>
        <strong>{{ historySummary.archivables }}</strong>
      </article>
    </div>

    <section class="surface audit-panel">
      <div class="section-head">
        <div>
          <h4>Registro de actividad</h4>
          <p class="muted">Trazabilidad completa de cambios operativos.</p>
        </div>

        <div class="filters">
          <button type="button" class="filter-chip" :class="{ active: activeFilter === 'all' }" @click="activeFilter = 'all'">Todos</button>
          <button type="button" class="filter-chip" :class="{ active: activeFilter === 'operations' }" @click="activeFilter = 'operations'">Operaciones</button>
          <button type="button" class="filter-chip" :class="{ active: activeFilter === 'incidents' }" @click="activeFilter = 'incidents'">Incidencias</button>
          <button type="button" class="filter-chip" :class="{ active: activeFilter === 'assignments' }" @click="activeFilter = 'assignments'">Asignaciones</button>
        </div>
      </div>

      <div class="history-list">
        <article v-for="item in filteredHistoryEntries" :key="item.id" class="history-row">
          <span class="timeline-dot"></span>

          <div class="history-main">
            <strong>{{ item.action }}</strong>
            <small>{{ item.date }}</small>
          </div>

          <div>
            <span class="label">Usuario</span>
            <p>{{ item.user }}</p>
          </div>

          <div>
            <span class="label">Cambio</span>
            <p>{{ item.previousState }} → {{ item.newState }}</p>
          </div>

          <div>
            <span class="label">Comentario</span>
            <p>{{ item.comment }}</p>
          </div>
        </article>
      </div>
    </section>
  </section>
</template>

<style scoped>
.history-page {
  display: grid;
  gap: 1rem;
}

.page-head,
.audit-panel,
.metric-card {
  padding: 1rem;
}

.page-head,
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.page-head h3,
.section-head h4 {
  margin: 0;
}

.page-head .muted,
.section-head .muted {
  margin: 0.35rem 0 0;
}

.audit-badge {
  padding: 0.65rem 0.9rem;
  border-radius: 999px;
  background: #111;
  color: #fff;
  font-size: 0.85rem;
  font-weight: 800;
  white-space: nowrap;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 1rem;
}

.metric-card {
  display: grid;
  gap: 0.35rem;
  border-radius: 18px;
  background: var(--surface-premium);
  border: 1px solid rgba(201, 169, 107, 0.14);
}

.metric-card span {
  color: #70675c;
  font-size: 0.85rem;
}

.metric-card strong {
  font-size: 1.45rem;
}

.audit-panel {
  border-radius: 22px;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.filter-chip {
  border: 1px solid rgba(201, 169, 107, 0.28);
  border-radius: 999px;
  padding: 0.5rem 0.85rem;
  background: var(--surface-premium);
  font-weight: 700;
  cursor: pointer;
}

.filter-chip.active {
  background: #111;
  color: #fff;
}

.history-list {
  display: grid;
  gap: 0.7rem;
  margin-top: 1rem;
}

.history-row {
  display: grid;
  grid-template-columns: 6px 1.1fr 0.8fr 1fr 1.4fr;
  gap: 1rem;
  align-items: center;
  padding: 1rem;
  border-radius: 18px;
  background: var(--surface-premium);
  border: 1px solid rgba(201, 169, 107, 0.12);
}

.timeline-dot {
  width: 6px;
  height: 100%;
  min-height: 42px;
  border-radius: 999px;
  background: #c8a96b;
}

.history-main {
  display: grid;
  gap: 0.25rem;
}

.label {
  display: block;
  margin-bottom: 0.25rem;
  color: #9a8a6a;
  font-size: 0.75rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.history-row p,
.history-row small {
  margin: 0;
  color: #5d5d5d;
}

@media (max-width: 1200px) {
  .summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .history-row {
    grid-template-columns: 6px 1fr 1fr;
  }
}

@media (max-width: 760px) {
  .page-head,
  .section-head,
  .history-row {
    display: grid;
    grid-template-columns: 1fr;
  }

  .summary-grid {
    grid-template-columns: 1fr;
  }

  .timeline-dot {
    width: 100%;
    height: 5px;
    min-height: 5px;
  }
}
</style>
