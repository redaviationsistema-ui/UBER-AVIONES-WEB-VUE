<script setup>
import { computed } from 'vue'
import { normalizeToken, toneClass } from './crewDirectoryShared'

const props = defineProps({
  entries: { type: Array, required: true },
})

const filteredEntries = computed(() =>
  props.entries.filter((entry) => {
    const normalized = normalizeToken(`${entry.title || ''} ${entry.detail || ''}`)
    return normalized.includes('sobrecargo') || normalized.includes('audit') || normalized.includes('valid')
  }),
)
</script>

<template>
  <article class="surface audit-card">
    <div class="panel-head">
      <div>
        <p class="eyebrow">Bitacora</p>
        <h4>Movimientos del directorio</h4>
      </div>
      <span class="badge badge-muted">{{ filteredEntries.length }} eventos</span>
    </div>

    <div v-if="filteredEntries.length" class="audit-list">
      <article v-for="entry in filteredEntries" :key="entry.id" class="audit-row">
        <div>
          <strong>{{ entry.title }}</strong>
          <p>{{ entry.detail }}</p>
        </div>
        <span class="status-chip" :class="toneClass(entry.title)">{{ entry.date }}</span>
      </article>
    </div>

    <p v-else class="empty-state">La bitacora del directorio aparecera aqui conforme registres validaciones y auditorias.</p>
  </article>
</template>

<style scoped>
.audit-card {
  padding: 1.3rem;
  border-radius: 24px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.92);
}

.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.audit-list {
  display: grid;
  gap: 0.8rem;
}

.audit-row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  padding: 0.95rem 1rem;
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.95);
  border: 1px solid rgba(226, 232, 240, 0.95);
}

.audit-row p {
  margin: 0.35rem 0 0;
  color: rgba(15, 23, 42, 0.72);
}
</style>
