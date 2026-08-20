<script setup>
defineProps({
  entries: { type: Array, default: () => [] },
  selectedAuditId: { type: [String, Number, null], default: null },
  auditEntryTone: { type: Function, required: true },
  auditEntrySummary: { type: Function, required: true },
})

defineEmits(['select'])

function checklistStateIcon(state = 'pending') {
  if (state === 'completed') return '✓'
  if (state === 'not_applicable') return '—'
  if (state === 'failed') return '⚠'
  return '○'
}
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

          <div v-if="entry.checklistTotal" class="audit-card__checklist-summary">
            <strong>Bitacora del vuelo</strong>
            <small>{{ entry.checklistResolved }}/{{ entry.checklistTotal }} resueltos</small>
          </div>

          <div v-if="entry.checklistGroups?.length" class="audit-card__checklists">
            <section
              v-for="group in entry.checklistGroups"
              :key="group.id"
              class="audit-checklist-group"
            >
              <header class="audit-checklist-group__head">
                <strong>{{ group.label }}</strong>
                <small>
                  {{ group.resolved }}/{{ group.total }}
                  <span v-if="group.total > 0 && group.resolved === group.total">✓</span>
                </small>
              </header>

              <section
                v-for="category in group.categories"
                :key="`${group.id}-${category.id}`"
                class="audit-checklist-category"
              >
                <header class="audit-checklist-category__head">
                  <strong>{{ category.label }}</strong>
                  <small>
                    {{ category.resolved }}/{{ category.total }}
                    <span v-if="category.total > 0 && category.resolved === category.total">✓</span>
                  </small>
                </header>

                <article
                  v-for="item in category.items"
                  :key="item.id"
                  class="audit-checklist-item"
                  :data-state="item.state"
                >
                  <span class="audit-checklist-item__icon" aria-hidden="true">{{ checklistStateIcon(item.state) }}</span>
                  <div class="audit-checklist-item__copy">
                    <strong>{{ item.title }}</strong>
                    <small>{{ item.stateLabel }}</small>
                  </div>
                </article>
              </section>
            </section>
          </div>
        </div>
      </article>
    </div>

    <p v-if="!entries.length" class="empty-state">
      La bitacora aparecera aqui conforme se registren cambios de asignacion y seguimiento.
    </p>
  </div>
</template>

<style scoped>
.table-shell {
  display: grid;
  gap: 0.9rem;
  padding: 0.95rem 0.95rem 0.8rem;
  border-radius: 20px;
  border: 1px solid rgba(155, 176, 212, 0.22);
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 22px 44px rgba(17, 34, 68, 0.07);
}

.table-head,
.audit-card__head,
.audit-card__meta,
.audit-checklist-group__head,
.audit-checklist-category__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.table-head .eyebrow,
.audit-card__eyebrow {
  margin: 0 0 0.2rem;
  font-size: 0.73rem;
  letter-spacing: 0.08em;
}

.table-head h4,
.audit-card h5,
.audit-card__headline,
.audit-checklist-group__head strong,
.audit-checklist-category__head strong,
.audit-checklist-item__copy strong {
  margin: 0;
  color: #10233d;
}

.audit-list,
.audit-card,
.audit-card__body,
.audit-card__date,
.audit-card__checklists,
.audit-checklist-group,
.audit-checklist-category,
.audit-checklist-item,
.audit-checklist-item__copy {
  display: grid;
}

.audit-list,
.audit-card__checklists {
  gap: 0.85rem;
}

.audit-card {
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 1rem;
  padding: 1rem;
  border-radius: 20px;
  border: 1px solid rgba(155, 176, 212, 0.22);
  background: rgba(255, 255, 255, 0.98);
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.audit-card:hover,
.audit-card--selected {
  transform: translateY(-1px);
  border-color: rgba(112, 149, 215, 0.38);
  box-shadow: 0 18px 34px rgba(17, 34, 68, 0.08);
}

.audit-card__date {
  align-content: start;
  gap: 0.18rem;
  color: #5f7496;
}

.audit-card__body,
.audit-checklist-group,
.audit-checklist-category,
.audit-checklist-item__copy {
  gap: 0.45rem;
}

.audit-card__headline {
  font-size: 0.96rem;
}

.audit-card__meta {
  flex-wrap: wrap;
  justify-content: flex-start;
}

.audit-card__meta span,
.audit-card__checklist-summary small,
.audit-checklist-group__head small,
.audit-checklist-category__head small,
.audit-checklist-item__copy small {
  color: #667d9f;
}

.audit-card__checklist-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 0.85rem;
  border-radius: 14px;
  background: rgba(241, 246, 255, 0.9);
  border: 1px solid rgba(155, 176, 212, 0.18);
}

.audit-checklist-group,
.audit-checklist-category {
  gap: 0.65rem;
  padding: 0.8rem;
  border-radius: 16px;
  border: 1px solid rgba(155, 176, 212, 0.18);
  background: linear-gradient(180deg, rgba(248, 251, 255, 0.96), rgba(255, 255, 255, 0.98));
}

.audit-checklist-item {
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: center;
  gap: 0.72rem;
  padding: 0.72rem 0.82rem;
  border-radius: 14px;
  border: 1px solid rgba(155, 176, 212, 0.2);
  background: rgba(255, 255, 255, 0.98);
}

.audit-checklist-item__icon {
  display: grid;
  place-items: center;
  font-size: 1rem;
  font-weight: 900;
  color: #8a98ae;
}

.audit-checklist-item[data-state='completed'] {
  border-color: rgba(16, 185, 129, 0.24);
  background: rgba(236, 253, 245, 0.88);
}

.audit-checklist-item[data-state='completed'] .audit-checklist-item__icon,
.audit-checklist-item[data-state='completed'] .audit-checklist-item__copy small {
  color: #0f8e65;
}

.audit-checklist-item[data-state='not_applicable'] {
  border-color: rgba(148, 163, 184, 0.32);
  background: rgba(248, 250, 252, 0.98);
}

.audit-checklist-item[data-state='not_applicable'] .audit-checklist-item__icon,
.audit-checklist-item[data-state='not_applicable'] .audit-checklist-item__copy small {
  color: #64748b;
}

.audit-checklist-item[data-state='failed'] {
  border-color: rgba(239, 68, 68, 0.24);
  background: rgba(254, 242, 242, 0.94);
}

.audit-checklist-item[data-state='failed'] .audit-checklist-item__icon,
.audit-checklist-item[data-state='failed'] .audit-checklist-item__copy small {
  color: #dc2626;
}

.empty-state {
  margin: 0;
  padding: 2rem 1rem;
  border-radius: 18px;
  border: 1px dashed rgba(173, 191, 222, 0.72);
  text-align: center;
  color: #516887;
}

@media (max-width: 720px) {
  .audit-card {
    grid-template-columns: 1fr;
  }

  .table-head,
  .audit-card__head,
  .audit-card__checklist-summary,
  .audit-checklist-group__head,
  .audit-checklist-category__head {
    display: grid;
  }
}
</style>
