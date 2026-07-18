<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  sectionKey: { type: String, default: '' },
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
const selectedStatusFilter = ref('all')
const selectedAircraftFilter = ref('all')
const selectedDateFilter = ref('')
const openMenuKey = ref('')

const isQuotesSection = computed(() => props.sectionKey === 'cotizaciones')

function normalizeToken(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function quoteStatusMeta(value = '') {
  const token = normalizeToken(value)

  if (token.includes('accept') || token.includes('aprob') || token.includes('confirm')) {
    return { label: 'Aceptada', icon: '🟢', tone: 'accepted' }
  }

  if (token.includes('reject') || token.includes('rechaz') || token.includes('cancel')) {
    return { label: 'Rechazada', icon: '🔴', tone: 'rejected' }
  }

  if (token.includes('review') || token.includes('revision') || token.includes('proceso')) {
    return { label: 'En revision', icon: '🔵', tone: 'review' }
  }

  return { label: 'Pendiente', icon: '🟠', tone: 'pending' }
}

const quoteStatusOptions = computed(() => {
  const tokens = new Set()

  props.records.forEach((record) => {
    const meta = quoteStatusMeta(record?.status)
    tokens.add(meta.label)
  })

  return ['Todos los estados', ...Array.from(tokens)]
})

const quoteAircraftOptions = computed(() => {
  const names = Array.from(
    new Set(
      props.records
        .map((record) => String(record?.aircraft || '').trim())
        .filter(Boolean),
    ),
  )

  return ['Aeronave', ...names]
})

const normalizedSummaryCards = computed(() => {
  const iconMap = {
    cotizaciones: '📄',
    aceptadas: '✅',
    pendientes: '🟠',
    'monto visible': '💲',
    'monto cotizado': '💲',
  }

  return props.summaryCards.slice(0, 4).map((item) => {
    const token = normalizeToken(item.label)
    return {
      ...item,
      icon:
        iconMap[token] ||
        (token.includes('acept') ? '✅' : token.includes('pend') ? '🟠' : token.includes('monto') ? '💲' : '📄'),
      tone:
        token.includes('acept')
          ? 'success'
          : token.includes('pend')
            ? 'warning'
            : token.includes('monto')
              ? 'info'
              : 'neutral',
    }
  })
})

const quoteRowActions = computed(() => [
  { id: 'view-quote', label: 'Ver detalle' },
  { id: 'edit-quote', label: 'Editar' },
  { id: 'duplicate-quote', label: 'Duplicar' },
  { id: 'send-quote-client', label: 'Enviar al cliente' },
  { id: 'generate-quote-pdf', label: 'Generar PDF' },
  { id: 'link-quote-reservation', label: 'Vincular reserva' },
  { id: 'cancel-quote', label: 'Cancelar' },
])

const searchableColumns = computed(() => [
  ...props.columns.map((column) => column.key),
  ...props.detailFields.map((field) => field.key),
])

const filteredRecords = computed(() => {
  const query = String(searchTerm.value || '').trim().toLowerCase()
  let collection = [...props.records]

  if (query) {
    collection = collection.filter((record) =>
      searchableColumns.value.some((key) => String(record?.[key] || '').toLowerCase().includes(query)),
    )
  }

  if (isQuotesSection.value) {
    if (selectedStatusFilter.value !== 'all') {
      collection = collection.filter(
        (record) => quoteStatusMeta(record?.status).label === selectedStatusFilter.value,
      )
    }

    if (selectedAircraftFilter.value !== 'all') {
      collection = collection.filter(
        (record) => String(record?.aircraft || '').trim() === selectedAircraftFilter.value,
      )
    }

    if (selectedDateFilter.value) {
      collection = collection.filter((record) => {
        const raw = String(record?.createdAt || '').trim()
        if (!raw) return false
        const parsed = new Date(raw)
        if (Number.isNaN(parsed.getTime())) return false
        return parsed.toISOString().slice(0, 10) === selectedDateFilter.value
      })
    }
  }

  return collection
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
  openMenuKey.value = ''
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

function toggleRowMenu(record) {
  const key = String(record?.[props.rowKey] || '')
  openMenuKey.value = openMenuKey.value === key ? '' : key
}

function emitRecordAction(actionId, record) {
  openMenuKey.value = ''
  emit('action', { actionId, record })
}

function clearQuoteFilters() {
  searchTerm.value = ''
  selectedStatusFilter.value = 'all'
  selectedAircraftFilter.value = 'all'
  selectedDateFilter.value = ''
}
</script>

<template>
  <div class="admin-records-section" :class="{ 'admin-records-section--quotes': isQuotesSection }">
    <section class="dashboard-hero">
      <div class="hero-center">
        <template v-if="isQuotesSection">
          <div class="hero-compact">
            <div class="hero-compact__copy">
              <p class="eyebrow dark-eyebrow">Administracion / Cotizaciones</p>
              <h1>{{ title }}</h1>
              <p class="hero-subtitle">
                Consulta, administra y da seguimiento a todas las cotizaciones emitidas.
              </p>
            </div>

            <div class="hero-compact__actions">
              <button
                type="button"
                class="ghost-button ghost-button--header"
                :disabled="loading"
                @click="emit('refresh')"
              >
                {{ loading ? 'Actualizando cotizaciones...' : 'Actualizar cotizaciones' }}
              </button>
              <button
                type="button"
                class="primary-button"
                @click="emit('action', { actionId: 'new-quote', record: selectedRecord })"
              >
                + Nueva cotizacion
              </button>
            </div>
          </div>
        </template>

        <template v-else>
          <p class="eyebrow dark-eyebrow">Modulo conectado</p>
          <h1>{{ title }}</h1>
          <p class="hero-subtitle">{{ description }}</p>
        </template>
      </div>
    </section>

    <section v-if="summaryCards.length" class="status-strip">
      <article
        v-for="item in normalizedSummaryCards"
        :key="item.label"
        class="signal-card"
        :class="[`signal-card--${item.tone}`]"
      >
        <span v-if="isQuotesSection" class="signal-card__icon" aria-hidden="true">{{ item.icon }}</span>
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <p>{{ item.detail }}</p>
      </article>
    </section>

    <section class="surface records-shell">
      <header class="records-toolbar">
        <div class="records-toolbar__search">
          <span aria-hidden="true">🔍</span>
          <input v-model="searchTerm" type="search" :placeholder="searchPlaceholder" />
        </div>

        <template v-if="isQuotesSection">
          <select v-model="selectedStatusFilter" class="records-toolbar__select">
            <option value="all">Todos los estados</option>
            <option
              v-for="option in quoteStatusOptions.slice(1)"
              :key="option"
              :value="option"
            >
              {{ option }}
            </option>
          </select>

          <label class="records-toolbar__date">
            <span aria-hidden="true">📅</span>
            <input v-model="selectedDateFilter" type="date" />
          </label>

          <select v-model="selectedAircraftFilter" class="records-toolbar__select">
            <option value="all">Aeronave</option>
            <option
              v-for="option in quoteAircraftOptions.slice(1)"
              :key="option"
              :value="option"
            >
              {{ option }}
            </option>
          </select>

          <button type="button" class="ghost-button ghost-button--filter" @click="clearQuoteFilters">
            Limpiar filtros
          </button>
        </template>

        <button
          v-else
          type="button"
          class="ghost-button"
          :disabled="loading"
          @click="emit('refresh')"
        >
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
                  <template v-if="isQuotesSection && column.key === 'status'">
                    <span
                      class="status-badge"
                      :class="`status-badge--${quoteStatusMeta(record.status).tone}`"
                    >
                      {{ quoteStatusMeta(record.status).icon }} {{ quoteStatusMeta(record.status).label }}
                    </span>
                  </template>
                  <template v-else-if="isQuotesSection && column.key === 'folio'">
                    <span class="table-folio">{{ formatCell(record, column) }}</span>
                  </template>
                  <template v-else-if="isQuotesSection && column.key === 'createdAt'">
                    {{ formatCell(record, column) }}
                  </template>
                  <template v-else>
                    {{ formatCell(record, column) }}
                  </template>
                </td>
                <td v-if="isQuotesSection" class="table-actions-cell" @click.stop>
                  <button
                    type="button"
                    class="row-menu-trigger"
                    :aria-expanded="openMenuKey === String(record[rowKey]) ? 'true' : 'false'"
                    @click="toggleRowMenu(record)"
                  >
                    ⋮
                  </button>

                  <div
                    v-if="openMenuKey === String(record[rowKey])"
                    class="row-menu"
                  >
                    <button
                      v-for="action in quoteRowActions"
                      :key="action.id"
                      type="button"
                      class="row-menu__item"
                      @click="emitRecordAction(action.id, record)"
                    >
                      {{ action.label }}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <aside v-if="selectedRecord" class="detail-panel">
          <div class="detail-panel__head">
            <div>
              <span class="workstream-label">{{ isQuotesSection ? 'Detalle de cotizacion' : 'Detalle' }}</span>
              <h2>{{ selectedRecord.title || selectedRecord.name || selectedRecord.code || `Registro #${selectedRecord[rowKey]}` }}</h2>
              <span
                v-if="isQuotesSection"
                class="status-badge detail-panel__status"
                :class="`status-badge--${quoteStatusMeta(selectedRecord.status).tone}`"
              >
                {{ quoteStatusMeta(selectedRecord.status).icon }} {{ quoteStatusMeta(selectedRecord.status).label }}
              </span>
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
            <button
              v-else-if="isQuotesSection"
              type="button"
              class="detail-panel__close"
              @click="selectedKey = ''"
            >
              ×
            </button>
          </div>

          <template v-if="isQuotesSection">
            <section class="detail-card-group">
              <div class="detail-card-group__row">
                <div class="detail-icon">👤</div>
                <div class="detail-card-group__copy">
                  <strong>Cliente</strong>
                  <span>{{ selectedRecord.clientName || 'Pendiente de confirmar' }}</span>
                </div>
              </div>
              <div class="detail-card-group__row">
                <div class="detail-icon">🏢</div>
                <div class="detail-card-group__copy">
                  <strong>Proveedor</strong>
                  <span>{{ selectedRecord.provider || 'Proveedor por confirmar' }}</span>
                </div>
              </div>
              <div class="detail-card-group__row">
                <div class="detail-icon">✈</div>
                <div class="detail-card-group__copy">
                  <strong>Vuelo</strong>
                  <span>{{ selectedRecord.route || 'Ruta pendiente' }}</span>
                  <small>{{ selectedRecord.aircraft || 'Aeronave por definir' }}</small>
                </div>
              </div>
            </section>

            <section class="detail-commercial">
              <div class="detail-commercial__head">
                <span aria-hidden="true">$</span>
                <strong>Informacion comercial</strong>
              </div>
              <div class="detail-commercial__grid">
                <div>
                  <span>Monto cotizado</span>
                  <strong>{{ formatDetail(selectedRecord, { key: 'amount', format: (value, record) => formatCell(record, { key: 'amount', format: (amount) => amount, }) }) }}</strong>
                </div>
                <div>
                  <span>Fecha de creacion</span>
                  <strong>{{ formatDetail(selectedRecord, props.detailFields.find((field) => field.key === 'createdAt') || { key: 'createdAt' }) }}</strong>
                </div>
              </div>
            </section>

            <section class="detail-links">
              <div class="detail-links__head">
                <span aria-hidden="true">🔗</span>
                <strong>Vinculaciones</strong>
              </div>
              <div class="detail-link-item">
                <span>{{ selectedRecord.reservationCode === 'Sin reserva ligada' ? 'Sin reserva vinculada' : selectedRecord.reservationCode }}</span>
                <button type="button" class="mini-link-button" @click="emitRecordAction('link-quote-reservation', selectedRecord)">
                  Vincular
                </button>
              </div>
              <div class="detail-link-item">
                <span>{{ selectedRecord.paymentCode === 'Sin pago ligado' ? 'Sin pago vinculado' : selectedRecord.paymentCode }}</span>
                <button type="button" class="mini-link-button" @click="emitRecordAction('link-quote-payment', selectedRecord)">
                  Vincular
                </button>
              </div>
            </section>

            <div class="detail-footer-actions">
              <button type="button" class="ghost-button ghost-button--detail" @click="emitRecordAction('edit-quote', selectedRecord)">
                Editar cotizacion
              </button>
              <button type="button" class="primary-button primary-button--detail" @click="emitRecordAction('generate-quote-pdf', selectedRecord)">
                Ver documento
              </button>
            </div>
          </template>

          <dl v-else class="detail-grid">
            <div v-for="field in detailFields" :key="field.key" class="detail-row">
              <dt>{{ field.label }}</dt>
              <dd>{{ formatDetail(selectedRecord, field) }}</dd>
            </div>
          </dl>
        </aside>
      </div>

      <footer v-if="isQuotesSection && filteredRecords.length" class="records-footer">
        <span>Mostrando {{ filteredRecords.length }} de {{ records.length }} cotizacion{{ records.length === 1 ? '' : 'es' }}</span>
        <div class="records-footer__pager">
          <button type="button" class="pager-button" disabled>‹</button>
          <span>1</span>
          <button type="button" class="pager-button" disabled>›</button>
        </div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.admin-records-section {
  min-height: 100vh;
}

.admin-records-section--quotes {
  background: #f6f8fc;
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

.admin-records-section--quotes .dashboard-hero {
  min-height: auto;
  padding-top: 1.1rem;
  padding-bottom: 1rem;
  background:
    radial-gradient(circle at top right, rgba(37, 99, 235, 0.1), transparent 24%),
    linear-gradient(180deg, #fbfcff 0%, #f6f8fc 100%);
}

.hero-center {
  display: grid;
  place-items: center;
  text-align: center;
  gap: 0.9rem;
}

.admin-records-section--quotes .hero-center {
  place-items: stretch;
  text-align: left;
}

.hero-compact {
  display: flex;
  justify-content: space-between;
  gap: 1.25rem;
  align-items: start;
}

.hero-compact__copy {
  display: grid;
  gap: 0.55rem;
}

.hero-compact__actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: end;
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
  color: #000000;
  line-height: 1.7;
}

.dark-eyebrow,
.workstream-label {
  color: #000000;
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

.admin-records-section--quotes .status-strip {
  margin-top: 0;
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
  transition:
    transform 180ms ease,
    box-shadow 180ms ease;
}

.signal-card span {
  color: #000000;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
}

.signal-card strong {
  color: #111111;
  font-size: 1.7rem;
  line-height: 1;
}

.signal-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 22px 44px rgba(15, 23, 42, 0.08);
}

.signal-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3.25rem;
  height: 3.25rem;
  border-radius: 50%;
  background: #eef3ff;
  font-size: 1.4rem;
}

.signal-card p,
.detail-row dd,
.empty-state p {
  color: #000000;
  line-height: 1.6;
}

.records-shell {
  margin: 0 clamp(1.25rem, 5vw, 4.5rem) 2rem;
  padding: 1.3rem;
}

.records-toolbar {
  display: flex;
  gap: 0.9rem;
  justify-content: flex-start;
  align-items: center;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.records-toolbar__search {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex: 1;
  min-width: 0;
  padding: 0.85rem 1rem;
  border: 1px solid #d8e0ea;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.records-toolbar__search input {
  flex: 1;
  min-width: 0;
  border: 0;
  font: inherit;
  background: transparent;
  outline: none;
}

.records-toolbar__select,
.records-toolbar__date {
  min-height: 3.15rem;
  padding: 0 0.95rem;
  border: 1px solid #d8e0ea;
  border-radius: 16px;
  background: #ffffff;
  font: inherit;
}

.records-toolbar__date {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
}

.records-toolbar__date input {
  border: 0;
  background: transparent;
  font: inherit;
  outline: none;
}

.ghost-button {
  border: 1px solid #d6dee8;
  border-radius: 999px;
  padding: 0.75rem 1rem;
  background: #fff;
  font: inherit;
  cursor: pointer;
}

.ghost-button--header,
.primary-button,
.ghost-button--filter,
.ghost-button--detail,
.primary-button--detail,
.mini-link-button,
.pager-button,
.row-menu-trigger {
  min-height: 3.05rem;
  border-radius: 16px;
  font: inherit;
  cursor: pointer;
}

.primary-button,
.primary-button--detail {
  border: 0;
  padding: 0.8rem 1.2rem;
  background: linear-gradient(135deg, #2457e2, #2f69ff);
  color: #ffffff;
  box-shadow: 0 14px 28px rgba(36, 87, 226, 0.18);
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

.admin-records-section--quotes .records-layout {
  grid-template-columns: minmax(0, 1.8fr) minmax(340px, 0.72fr);
  gap: 1.2rem;
}

.table-wrap {
  overflow: auto;
  border: 1px solid #eef2f7;
  border-radius: 20px;
  background: #ffffff;
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

.admin-records-section--quotes .admin-table thead th {
  color: #111111;
  font-size: 0.84rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.admin-records-section--quotes .admin-table tbody td {
  color: #111111;
}

.admin-records-section--quotes .admin-table tbody tr:hover {
  background: #f8fbff;
}

.table-folio {
  color: #2759df;
  font-weight: 800;
}

.table-actions-cell {
  position: relative;
  width: 70px;
}

.row-menu-trigger {
  width: 2.9rem;
  padding: 0;
  border: 1px solid #e5eaf2;
  background: #ffffff;
  font-size: 1.25rem;
}

.row-menu {
  position: absolute;
  top: calc(100% - 0.35rem);
  right: 0.8rem;
  z-index: 6;
  display: grid;
  min-width: 210px;
  padding: 0.45rem;
  border: 1px solid #e7ecf5;
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.14);
}

.row-menu__item {
  border: 0;
  border-radius: 12px;
  padding: 0.7rem 0.8rem;
  background: transparent;
  text-align: left;
  font: inherit;
  cursor: pointer;
}

.row-menu__item:hover {
  background: #f4f8ff;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 2rem;
  padding: 0.2rem 0.75rem;
  border-radius: 999px;
  font-size: 0.84rem;
  font-weight: 800;
}

.status-badge--accepted {
  background: #e8f9ee;
  color: #168149;
}

.status-badge--pending {
  background: #fff4df;
  color: #b97900;
}

.status-badge--rejected {
  background: #ffe8e5;
  color: #b93828;
}

.status-badge--review {
  background: #e8f0ff;
  color: #2759df;
}

.detail-panel {
  border: 1px solid #ebeff5;
  border-radius: 18px;
  background: #fbfdff;
  padding: 1rem;
}

.admin-records-section--quotes .detail-panel {
  padding: 1.2rem;
  border-radius: 22px;
  background: linear-gradient(180deg, #ffffff, #fbfcff);
  box-shadow: 0 20px 44px rgba(15, 23, 42, 0.07);
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
  color: #111111;
  font-size: 1.3rem;
  line-height: 1.2;
}

.detail-panel__status {
  margin-top: 0.75rem;
}

.detail-panel__close {
  width: 2.7rem;
  height: 2.7rem;
  min-height: auto;
  border: 1px solid #e5eaf2;
  border-radius: 50%;
  background: #ffffff;
  font-size: 1.35rem;
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
  color: #000000;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}

.detail-row dd {
  margin: 0;
}

.detail-card-group,
.detail-commercial,
.detail-links {
  display: grid;
  gap: 0.8rem;
  padding: 1rem 0;
}

.detail-card-group {
  border-bottom: 1px solid #edf1f6;
}

.detail-card-group__row,
.detail-commercial__head,
.detail-links__head,
.detail-link-item,
.detail-commercial__grid {
  display: flex;
}

.detail-card-group__row {
  gap: 0.85rem;
  align-items: start;
}

.detail-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.65rem;
  height: 2.65rem;
  flex-shrink: 0;
  border-radius: 14px;
  background: #eef3ff;
}

.detail-card-group__copy,
.detail-commercial__grid > div {
  display: grid;
  gap: 0.2rem;
}

.detail-card-group__copy span,
.detail-commercial__grid span,
.detail-link-item span {
  color: #111111;
}

.detail-card-group__copy small {
  color: #2f2f2f;
}

.detail-commercial {
  border-bottom: 1px solid #edf1f6;
}

.detail-commercial__head,
.detail-links__head {
  gap: 0.65rem;
  align-items: center;
  color: #274699;
}

.detail-commercial__head strong,
.detail-links__head strong,
.detail-card-group__copy strong,
.detail-commercial__grid strong {
  color: #111111;
}

.detail-commercial__grid {
  gap: 1rem;
  justify-content: space-between;
}

.detail-commercial__grid strong {
  color: #111111;
}

.detail-links {
  gap: 0.75rem;
}

.detail-link-item {
  justify-content: space-between;
  gap: 0.8rem;
  align-items: center;
  padding: 0.85rem 0.95rem;
  border-radius: 16px;
  background: #fff9ef;
}

.mini-link-button {
  min-height: auto;
  padding: 0.55rem 0.8rem;
  border: 1px solid #d9e4ff;
  background: #ffffff;
  color: #2759df;
  font-weight: 700;
}

.detail-footer-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.8rem;
  padding-top: 1rem;
}

.empty-state {
  padding: 2rem 0;
  text-align: center;
}

.records-footer {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  padding-top: 1rem;
  color: #111111;
}

.records-footer__pager {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.pager-button {
  width: 2.6rem;
  min-height: auto;
  padding: 0;
  border: 1px solid #dde6f2;
  background: #ffffff;
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

@media (max-width: 780px) {
  .hero-compact,
  .hero-compact__actions,
  .detail-footer-actions,
  .detail-commercial__grid,
  .records-footer {
    grid-template-columns: 1fr;
    flex-direction: column;
    align-items: stretch;
  }

  .detail-link-item {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
