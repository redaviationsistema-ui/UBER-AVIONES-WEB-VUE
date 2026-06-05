<script setup>
defineProps({
  recentAuditEntries: { type: Array, required: true },
})
</script>

<template>
  <article class="surface log-card">
    <div class="table-head">
      <div>
        <span class="eyebrow">Bitacora</span>
        <h4>Cambios recientes de disponibilidad</h4>
      </div>
    </div>

    <div v-if="recentAuditEntries.length" class="log-list">
      <article v-for="entry in recentAuditEntries" :key="entry.id" class="log-row">
        <strong>{{ entry.title }}</strong>
        <span>{{ entry.detail }}</span>
        <small>{{ entry.date }}</small>
      </article>
    </div>

    <p v-else class="empty-state">Aun no hay cambios recientes de disponibilidad en la bitacora.</p>
  </article>
</template>

<style scoped>
.log-card {
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

h4 {
  margin: 0.25rem 0 0;
  color: #0f172a;
}

.table-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.log-list {
  display: grid;
  gap: 0.75rem;
}

.log-row {
  display: grid;
  gap: 0.2rem;
  padding: 0.9rem 1rem;
  border-radius: 18px;
  background: rgba(226, 232, 240, 0.42);
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.log-row strong {
  color: #0f172a;
}

.log-row span {
  color: rgba(51, 65, 85, 0.9);
}

.log-row small,
.empty-state {
  color: rgba(71, 85, 105, 0.88);
}
</style>
