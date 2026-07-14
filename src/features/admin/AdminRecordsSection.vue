<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  records: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] },
  detailFields: { type: Array, default: () => [] },
  summaryCards: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  errorMessage: { type: String, default: '' },
  emptyTitle: { type: String, default: 'Sin registros disponibles.' },
  emptyDescription: { type: String, default: 'Todavia no hay datos visibles para esta vista.' },
  searchPlaceholder: { type: String, default: 'Buscar registro...' },
  rowKey: { type: String, default: 'id' },
  actionButtons: { type: Array, default: () => [] },
})

const emit = defineEmits(['refresh', 'action'])

const searchTerm = ref('')
const selectedKey = ref('')

const searchableColumns = computed(() => [
  ...props.columns.map((column) => column.key),
  ...props.detailFields.map((field) => field.key),
])

const filteredRecords = computed(() => {
  const query = String(searchTerm.value || '').trim().toLowerCase()
  if (!query) return props.records

  return props.records.filter((record) =>
    searchableColumns.value.some((key) => String(record?.[key] || '').toLowerCase().includes(query)),
  )
})

const selectedRecord = computed(() => {
  const collection = filteredRecords.value.length ? filteredRecords.value : props.records
  return (
    collection.find((record) => String(record?.[props.rowKey] || '') === String(selectedKey.value || '')) ||
    collection[0] ||
    null
  )
})

watch(
  () => props.records,
  (records) => {
    if (!Array.isArray(records) || !records.length) {
      selectedKey.value = ''
      return
    }

    const currentKey = String(selectedKey.value || '')
    const stillPresent = records.some((record) => String(record?.[props.rowKey] || '') === currentKey)
    if (!stillPresent) {
      selectedKey.value = String(records[0]?.[props.rowKey] || '')
    }
  },
  { immediate: true },
)

function selectRecord(record) {
  selectedKey.value = String(record?.[props.rowKey] || '')
}

function formatCell(record, column) {
  if (typeof column.format === 'function') {
    return column.format(record?.[column.key], record)
  }

  const value = record?.[column.key]
  return value === null || value === undefined || value === '' ? 'Sin dato' : String(value)
}

function formatDetail(record, field) {
  if (typeof field.format === 'function') {
    return field.format(record?.[field.key], record)
  }

  const value = record?.[field.key]
  return value === null || value === undefined || value === '' ? 'Sin dato' : String(value)
}

function actionDisabled(action, record) {
  if (typeof action.disabled === 'function') return action.disabled(record)
  return action.disabled === true
}
</script>

<template>
  <div class="admin-records-section">
    <section class="dashboard-hero">
      <div class="hero-center">
        <p class="eyebrow dark-eyebrow">Modulo conectado</p>
        <h1>{{ title }}</h1>
        <p class="hero-subtitle">{{ description }}</p>
      </div>
    </section>

    <section v-if="summaryCards.length" class="status-strip">
      <article v-for="item in summaryCards.slice(0, 4)" :key="item.label" class="signal-card">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <p>{{ item.detail }}</p>
      </article>
    </section>

    <section class="surface records-shell">
      <header class="records-toolbar">
        <input v-model="searchTerm" type="search" :placeholder="searchPlaceholder" />
        <button type="button" class="ghost-button" :disabled="loading" @click="emit('refresh')">
          {{ loading ? 'Actualizando...' : 'Actualizar' }}
        </button>
      </header>

      <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>

      <div v-if="!filteredRecords.length && !loading" class="empty-state">
        <strong>{{ emptyTitle }}</strong>
        <p>{{ emptyDescription }}</p>
      </div>

      <div v-else class="records-layout">
        <div class="table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th v-for="column in columns" :key="column.key">{{ column.label }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="record in filteredRecords"
                :key="record[rowKey]"
                :class="{ 'is-selected': String(record[rowKey]) === String(selectedKey) }"
                @click="selectRecord(record)"
              >
                <td v-for="column in columns" :key="`${record[rowKey]}-${column.key}`">
                  {{ formatCell(record, column) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <aside v-if="selectedRecord" class="detail-panel">
          <div class="detail-panel__head">
            <div>
              <span class="workstream-label">Detalle</span>
              <h2>{{ selectedRecord.title || selectedRecord.name || selectedRecord.code || `Registro #${selectedRecord[rowKey]}` }}</h2>
            </div>
            <div v-if="actionButtons.length" class="detail-actions">
              <button
                v-for="action in actionButtons"
                :key="action.id"
                type="button"
                class="ghost-button"
                :disabled="actionDisabled(action, selectedRecord)"
                @click="emit('action', { actionId: action.id, record: selectedRecord })"
              >
                {{ action.label }}
              </button>
            </div>
          </div>

          <dl class="detail-grid">
            <div v-for="field in detailFields" :key="field.key" class="detail-row">
              <dt>{{ field.label }}</dt>
              <dd>{{ formatDetail(selectedRecord, field) }}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </section>
  </div>
</template>

<style scoped>
.admin-records-section {
  min-height: 100vh;
}

.dashboard-hero,
.records-shell {
  padding: 1.5rem clamp(1.25rem, 5vw, 4.5rem);
}

.dashboard-hero {
  display: grid;
  min-height: 32vh;
  background:
    radial-gradient(circle at top right, rgba(15, 76, 129, 0.12), transparent 20%),
    linear-gradient(180deg, #ffffff 0%, #f4f7fb 100%);
}

.hero-center {
  display: grid;
  place-items: center;
  text-align: center;
  gap: 0.9rem;
}

.hero-center h1 {
  margin: 0;
  font-size: clamp(2.3rem, 6vw, 4rem);
  line-height: 0.98;
  letter-spacing: -0.05em;
}

.hero-subtitle {
  max-width: 64ch;
  margin: 0;
  color: #5d5d5d;
  line-height: 1.7;
}

.dark-eyebrow,
.workstream-label {
  color: #0f4c81;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.status-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
  padding: 0 clamp(1.25rem, 5vw, 4.5rem) 1.2rem;
  margin-top: -1.2rem;
}

.signal-card,
.records-shell {
  border: 1px solid #ebeff5;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
}

.signal-card {
  display: grid;
  gap: 0.35rem;
  padding: 1rem 1.05rem;
}

.signal-card span {
  color: #64748b;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
}

.signal-card strong {
  font-size: 1.7rem;
  line-height: 1;
}

.signal-card p,
.detail-row dd,
.empty-state p {
  color: #5d5d5d;
  line-height: 1.6;
}

.records-shell {
  margin: 0 clamp(1.25rem, 5vw, 4.5rem) 2rem;
  padding: 1.3rem;
}

.records-toolbar {
  display: flex;
  gap: 0.9rem;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.records-toolbar input {
  flex: 1;
  min-width: 0;
  border: 1px solid #d8e0ea;
  border-radius: 12px;
  padding: 0.85rem 1rem;
  font: inherit;
}

.ghost-button {
  border: 1px solid #d6dee8;
  border-radius: 999px;
  padding: 0.75rem 1rem;
  background: #fff;
  font: inherit;
  cursor: pointer;
}

.ghost-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-banner {
  margin: 0 0 1rem;
  padding: 0.85rem 1rem;
  border-radius: 12px;
  background: #fff1f2;
  color: #9f1239;
}

.records-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.9fr);
  gap: 1rem;
}

.table-wrap {
  overflow: auto;
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
}

.admin-table th,
.admin-table td {
  padding: 0.9rem 0.8rem;
  border-bottom: 1px solid #eef2f7;
  text-align: left;
  vertical-align: top;
}

.admin-table tbody tr {
  cursor: pointer;
}

.admin-table tbody tr.is-selected {
  background: #f3f8fd;
}

.detail-panel {
  border: 1px solid #ebeff5;
  border-radius: 18px;
  background: #fbfdff;
  padding: 1rem;
}

.detail-panel__head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.detail-panel__head h2 {
  margin: 0.3rem 0 0;
  font-size: 1.3rem;
  line-height: 1.2;
}

.detail-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.detail-grid {
  display: grid;
  gap: 0.8rem;
}

.detail-row {
  display: grid;
  gap: 0.2rem;
}

.detail-row dt {
  color: #64748b;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}

.detail-row dd {
  margin: 0;
}

.empty-state {
  padding: 2rem 0;
  text-align: center;
}

@media (max-width: 960px) {
  .status-strip,
  .records-layout,
  .detail-panel__head,
  .records-toolbar {
    grid-template-columns: 1fr;
    flex-direction: column;
    align-items: stretch;
  }

  .status-strip {
    display: grid;
  }
}
</style>
