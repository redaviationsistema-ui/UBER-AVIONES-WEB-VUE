<script setup>
defineProps({
  entries: { type: Array, default: () => [] },
  selectedAuditId: { type: [String, Number, null], default: null },
  auditEntryTone: { type: Function, required: true },
  auditEntrySummary: { type: Function, required: true },
})

defineEmits(['select'])
</script>

<template>
  <div class="table-shell">
    <div class="table-head">
      <div>
        <p class="eyebrow">Bitacora</p>
        <h4>Historial operativo</h4>
      </div>
      <span class="badge badge-muted">{{ entries.length }} eventos</span>
    </div>

    <div class="audit-list">
      <article
        v-for="entry in entries"
        :key="entry.id"
        class="audit-card"
        :class="{ 'audit-card--selected': entry.id === selectedAuditId }"
        @click="$emit('select', entry.id)"
      >
        <div class="audit-card__date">
          <strong>{{ entry.date?.split(' ')[0] || entry.date }}</strong>
          <span>{{ entry.date?.split(' ')[1] || 'Sin hora' }}</span>
        </div>

        <div class="audit-card__body">
          <div class="audit-card__head">
            <div>
              <p class="audit-card__eyebrow">Registro operativo</p>
              <h5>{{ entry.title }}</h5>
            </div>
            <span class="status-chip" :class="auditEntryTone(entry)">
              {{ auditEntrySummary(entry).meta.at(-1) || 'Seguimiento' }}
            </span>
          </div>

          <p class="audit-card__headline">{{ auditEntrySummary(entry).headline }}</p>

          <div v-if="auditEntrySummary(entry).meta.length" class="audit-card__meta">
            <span v-for="item in auditEntrySummary(entry).meta.slice(0, 3)" :key="item">{{ item }}</span>
          </div>
        </div>
      </article>
    </div>

    <p v-if="!entries.length" class="empty-state">
      La bitacora aparecera aqui conforme se registren cambios de asignacion y seguimiento.
    </p>
  </div>
</template>
