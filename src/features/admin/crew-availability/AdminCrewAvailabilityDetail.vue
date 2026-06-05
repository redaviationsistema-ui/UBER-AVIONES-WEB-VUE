<script setup>
defineProps({
  selectedCell: { type: Object, default: null },
  draftFrom: { type: String, required: true },
  draftTo: { type: String, required: true },
  draftState: { type: String, required: true },
  draftComment: { type: String, required: true },
  statusOptions: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:draft-from', 'update:draft-to', 'update:draft-state', 'update:draft-comment', 'save'])
</script>

<template>
  <aside class="surface detail-card">
    <div class="table-head">
      <div>
        <span class="eyebrow">Panel lateral</span>
        <h4>{{ selectedCell ? selectedCell.member.name : 'Selecciona una celda' }}</h4>
      </div>
    </div>

    <template v-if="selectedCell">
      <div class="detail-stack">
        <span><strong>Fecha:</strong> {{ selectedCell.dayKey }}</span>
        <span><strong>Base:</strong> {{ selectedCell.member.base || 'Sin base' }}</span>
        <span><strong>Estado actual:</strong> {{ selectedCell.record.state }}</span>
      </div>

      <div class="range-grid">
        <label class="field">
          <span>Fecha inicio</span>
          <input :value="draftFrom" type="date" @input="$emit('update:draft-from', $event.target.value)" />
        </label>

        <label class="field">
          <span>Fecha fin</span>
          <input :value="draftTo" type="date" @input="$emit('update:draft-to', $event.target.value)" />
        </label>
      </div>

      <label class="field">
        <span>Cambiar estado</span>
        <select :value="draftState" @change="$emit('update:draft-state', $event.target.value)">
          <option v-for="option in statusOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>

      <label class="field">
        <span>Comentario administrativo</span>
        <textarea
          :value="draftComment"
          rows="5"
          placeholder="Escribe nota interna"
          @input="$emit('update:draft-comment', $event.target.value)"
        ></textarea>
      </label>

      <button type="button" class="primary-action action-button action-button--full" @click="$emit('save')">
        Actualizar estado
      </button>
    </template>

    <p v-else class="empty-state">
      Selecciona un dia de la matriz para revisar disponibilidad, cambios o contexto operativo.
    </p>
  </aside>
</template>

<style scoped>
.detail-card {
  color: #000;
  padding: 1.4rem;
  border-radius: 28px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.98), rgba(241, 245, 249, 0.96));
}

.eyebrow {
  color: #000;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h4,
.detail-stack,
.detail-stack span,
.empty-state {
  color: #000;
}

.table-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.detail-stack {
  display: grid;
  gap: 0.75rem;
}

.field {
  display: grid;
  gap: 0.45rem;
  margin-top: 1rem;
}

.field span {
  color: #000;
  font-weight: 700;
}

.field select,
.field input,
.field textarea {
  width: 100%;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(255, 255, 255, 0.92);
  color: #000;
  padding: 0.85rem 0.95rem;
}

.range-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 1rem;
}

.action-button--full {
  width: 100%;
  justify-content: center;
  margin-top: 1rem;
}

@media (max-width: 720px) {
  .range-grid {
    grid-template-columns: 1fr;
  }
}
</style>
