<script setup>
import { computed, ref, watch } from 'vue'
import { api } from '../../lib/api'
import { useUiStore } from '../../stores/ui'

const props = defineProps({
  clients: { type: Array, default: () => [] },
  accessPayments: { type: Array, default: () => [] },
  subscriptionPayments: { type: Array, default: () => [] },
  aircraftSubscriptions: { type: Array, default: () => [] },
})
const emit = defineEmits(['refresh'])
const ui = useUiStore()

const activeTab = ref('commercial')
const searchTerm = ref('')
const statusFilter = ref('todos')
const currentPage = ref(1)
const rowsPerPage = ref(10)
const actionUserId = ref(0)
const evidenceModalOpen = ref(false)
const selectedEvidence = ref(null)
const evidenceSearchTerm = ref('')

const latestPaymentByUserId = computed(() => {
  const map = new Map()

  for (const payment of props.accessPayments || []) {
    const userId = Number(payment?.user_id || payment?.user?.id || 0)
    if (!userId || map.has(userId)) continue
    map.set(userId, payment)
  }

  return map
})

const commercialRows = computed(() =>
  (props.clients || []).map((client) => {
    const commercial = client.commercial_access || client.commercialAccess || client.access?.commercial_access || {}
    const latestPayment = latestPaymentByUserId.value.get(Number(client.id || 0)) || null
    const expiresAt =
      commercial.access_expires_at ||
      client.access_expires_at ||
      client.raw?.access_expires_at ||
      latestPayment?.user?.access_expires_at ||
      latestPayment?.billing_period_end ||
      ''

    const stage = String(commercial.stage || resolveCommercialStage(client, latestPayment))
    const paymentStatus = String(latestPayment?.status || resolvePaymentStatus(client, latestPayment))

    return {
      id: client.id,
      name: client.name || 'Cliente',
      email: client.email || 'Sin correo',
      phone: client.phone || '',
      companyName: client.profile?.company_name || client.raw?.profile?.company_name || latestPayment?.user?.company_name || '',
      commercialLabel: commercial.label || resolveCommercialLabel(stage),
      commercialStage: stage,
      accessStatus: commercial.status || client.access_status || client.raw?.access_status || 'registered',
      hasPaidAccess: commercial.has_paid_access === true || client.has_paid_access === true || client.raw?.has_paid_access === true,
      accessExpiresAt: expiresAt,
      paidAccessAt: commercial.paid_access_at || client.paid_access_at || client.raw?.paid_access_at || latestPayment?.paid_at || '',
      freeQuotesUsed: Number(commercial.free_quotes_used || client.free_quotes_used || client.raw?.free_quotes_used || 0),
      freeQuoteLimit: Number(commercial.free_quote_limit || client.free_quote_limit || client.raw?.free_quote_limit || 1),
      latestPayment,
      paymentStatus,
      paymentAmount: latestPayment?.amount || 0,
      paymentCurrency: latestPayment?.currency || 'usd',
      cardBrand: latestPayment?.card_brand || '',
      cardLast4: latestPayment?.card_last4 || '',
      planName: latestPayment?.plan?.name || 'Acceso comercial mensual',
    }
  }),
)

const filteredCommercialRows = computed(() =>
  commercialRows.value.filter((row) => {
    const haystack = [row.name, row.email, row.phone, row.companyName, row.planName, row.cardBrand]
      .join(' ')
      .toLowerCase()
    const matchesSearch = !searchTerm.value || haystack.includes(searchTerm.value.toLowerCase())
    const matchesStatus =
      statusFilter.value === 'todos' ||
      row.commercialStage === statusFilter.value ||
      row.paymentStatus === statusFilter.value ||
      row.accessStatus === statusFilter.value

    return matchesSearch && matchesStatus
  }),
)

const filteredAircraftSubscriptions = computed(() =>
  (props.aircraftSubscriptions || []).filter((item) => {
    const haystack = [
      item?.plan?.name,
      item?.aircraft?.registration,
      item?.aircraft?.model,
      item?.aircraft?.provider?.commercial_name,
      item?.aircraft?.provider?.company_name,
      item?.payment_reference,
    ]
      .join(' ')
      .toLowerCase()

    return !searchTerm.value || haystack.includes(searchTerm.value.toLowerCase())
  }),
)

const summaryCards = computed(() => {
  const totalCommercial = commercialRows.value.length
  const paidCommercial = commercialRows.value.filter((row) => row.hasPaidAccess).length
  const trialConsumed = commercialRows.value.filter((row) => row.commercialStage === 'trial_used').length
  const pendingPayment = commercialRows.value.filter((row) =>
    ['pending', 'requires_payment_method', 'processing'].includes(row.paymentStatus),
  ).length
  const activeAircraft = (props.aircraftSubscriptions || []).filter((item) => String(item?.status || '').toLowerCase() === 'active').length

  return [
    { label: 'Clientes monitoreados', value: totalCommercial, detail: 'Base comercial visible en esta vista.' },
    { label: 'Acceso activo', value: paidCommercial, detail: 'Clientes con acceso comercial habilitado.' },
    { label: 'Prueba consumida', value: trialConsumed, detail: 'Ya requieren pago para seguir cotizando.' },
    { label: 'Pagos pendientes', value: pendingPayment, detail: 'Intentos creados o en validacion.' },
    { label: 'Suscripciones aeronave', value: activeAircraft, detail: 'Registros activos de flota.' },
  ]
})

const activeCollectionLength = computed(() => {
  if (activeTab.value === 'payments') return Math.max(props.accessPayments.length, props.subscriptionPayments.length)
  if (activeTab.value === 'aircraft') return filteredAircraftSubscriptions.value.length
  return filteredCommercialRows.value.length
})

const totalPages = computed(() => Math.max(1, Math.ceil(activeCollectionLength.value / rowsPerPage.value)))

const paginatedCommercialRows = computed(() => paginateRows(filteredCommercialRows.value))
const paginatedRecentPayments = computed(() => paginateRows(props.accessPayments || []))
const paginatedSubscriptionPayments = computed(() => paginateRows(props.subscriptionPayments || []))
const paginatedAircraftSubscriptions = computed(() => paginateRows(filteredAircraftSubscriptions.value))

watch([activeTab, rowsPerPage, searchTerm, statusFilter], () => {
  currentPage.value = 1
})

watch(totalPages, (value) => {
  if (currentPage.value > value) {
    currentPage.value = value
  }
})

function resolveCommercialStage(client = {}, payment = null) {
  const commercial = client.commercial_access || client.commercialAccess || client.access?.commercial_access || {}
  if (commercial.has_paid_access === true || client.has_paid_access === true || client.raw?.has_paid_access === true) {
    return 'paid'
  }
  if (payment && ['paid', 'succeeded'].includes(String(payment.status || '').toLowerCase())) return 'paid'
  if (commercial.trial_consumed === true) return 'trial_used'
  if (Number(commercial.free_quotes_used || client.free_quotes_used || client.raw?.free_quotes_used || 0) > 0) {
    return 'trial_in_progress'
  }
  return 'new'
}

function resolveCommercialLabel(stage = 'new') {
  if (stage === 'paid') return 'Pago activo'
  if (stage === 'trial_used') return 'Prueba consumida'
  if (stage === 'trial_in_progress') return 'Prueba iniciada'
  return 'Registro nuevo'
}

function resolvePaymentStatus(client = {}, payment = null) {
  if (payment?.status) return String(payment.status).toLowerCase()
  const accessStatus = String(client.access_status || client.raw?.access_status || '').toLowerCase()
  if (accessStatus === 'payment_failed') return 'failed'
  if (accessStatus === 'payment_pending') return 'pending'
  if (client.has_paid_access === true || client.raw?.has_paid_access === true) return 'paid'
  return 'no_payment'
}

function formatDate(value, options = {}) {
  if (!value) return 'Pendiente'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Pendiente'
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: options.compact ? 'short' : 'medium',
    timeStyle: options.withTime ? 'short' : undefined,
  }).format(date)
}

function formatMoney(value, currency = 'USD') {
  const amount = Number(value || 0)
  if (!amount) return 'Pendiente'
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: String(currency || 'USD').toUpperCase(),
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatCard(payment = {}) {
  if (!payment?.card_last4) return 'Sin tarjeta registrada'
  const brand = String(payment.card_brand || 'Tarjeta').toUpperCase()
  return `${brand} terminacion ${payment.card_last4}`
}

function formatAircraftPeriod(item = {}) {
  const from = formatDate(item?.starts_at, { compact: true })
  const to = formatDate(item?.ends_at, { compact: true })
  return `${from} - ${to}`
}

function commercialTone(stage = '') {
  if (stage === 'paid') return 'success'
  if (stage === 'trial_used') return 'danger'
  if (stage === 'trial_in_progress') return 'warn'
  return 'info'
}

function paymentTone(status = '') {
  if (['paid', 'succeeded'].includes(status)) return 'success'
  if (['failed', 'canceled'].includes(status)) return 'danger'
  if (['pending', 'processing', 'requires_payment_method'].includes(status)) return 'warn'
  return 'neutral'
}

function paymentLabel(status = '') {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'paid' || normalized === 'succeeded') return 'Pagado'
  if (normalized === 'failed') return 'Fallido'
  if (normalized === 'processing') return 'Procesando'
  if (normalized === 'requires_payment_method') return 'Falta tarjeta'
  if (normalized === 'pending') return 'Pendiente'
  if (normalized === 'no_payment') return 'Sin pago'
  return normalized || 'Sin pago'
}

function paginateRows(rows = []) {
  const start = (currentPage.value - 1) * rowsPerPage.value
  return rows.slice(start, start + rowsPerPage.value)
}

function goToPage(page) {
  currentPage.value = Math.min(Math.max(1, page), totalPages.value)
}

function isBusy(userId) {
  return actionUserId.value === Number(userId || 0)
}

async function grantTrial(row) {
  if (!row?.id || isBusy(row.id)) return
  actionUserId.value = Number(row.id)

  try {
    await api.post(`/admin/users/${row.id}/grant-trial`)
    ui.pushToast({
      tone: 'success',
      title: 'Demo activada',
      message: `Se habilito la demo comercial para ${row.name}.`,
    })
    emit('refresh')
  } catch (error) {
    ui.pushToast({
      tone: 'danger',
      title: 'No se pudo activar la demo',
      message: error?.message || 'El backend no pudo procesar la solicitud.',
    })
  } finally {
    actionUserId.value = 0
  }
}

async function revokeAccess(row) {
  if (!row?.id || isBusy(row.id)) return
  if (typeof window !== 'undefined' && !window.confirm(`Se desactivara el acceso comercial de ${row.name}. Deseas continuar?`)) {
    return
  }

  actionUserId.value = Number(row.id)

  try {
    await api.post(`/admin/users/${row.id}/revoke-commercial-access`)
    ui.pushToast({
      tone: 'success',
      title: 'Acceso revocado',
      message: `El acceso comercial de ${row.name} fue desactivado.`,
    })
    emit('refresh')
  } catch (error) {
    ui.pushToast({
      tone: 'danger',
      title: 'No se pudo revocar el acceso',
      message: error?.message || 'El backend no pudo procesar la solicitud.',
    })
  } finally {
    actionUserId.value = 0
  }
}

async function deleteClient(row) {
  if (!row?.id || isBusy(row.id)) return
  if (
    typeof window !== 'undefined' &&
    !window.confirm(
      `Se eliminara por completo el cliente ${row.name} (${row.email}). Esta accion impacta la base real. Deseas continuar?`,
    )
  ) {
    return
  }

  actionUserId.value = Number(row.id)

  try {
    await api.delete(`/admin/users/${row.id}`)
    ui.pushToast({
      tone: 'success',
      title: 'Cliente eliminado',
      message: `${row.name} fue eliminado del sistema.`,
    })
    emit('refresh')
  } catch (error) {
    ui.pushToast({
      tone: 'danger',
      title: 'No se pudo eliminar el cliente',
      message: error?.message || 'El backend no pudo eliminar este cliente.',
    })
  } finally {
    actionUserId.value = 0
  }
}

async function anonymizeClient(row) {
  if (!row?.id || isBusy(row.id)) return
  if (
    typeof window !== 'undefined' &&
    !window.confirm(
      `Se anonimizaran los datos personales de ${row.name} (${row.email}) conservando pagos e historial. Esta accion impacta la base real. Deseas continuar?`,
    )
  ) {
    return
  }

  actionUserId.value = Number(row.id)

  try {
    await api.post(`/admin/users/${row.id}/anonymize`)
    ui.pushToast({
      tone: 'success',
      title: 'Cliente anonimizado',
      message: `${row.name} fue anonimizado conservando historial de pagos y operacion.`,
    })
    emit('refresh')
  } catch (error) {
    ui.pushToast({
      tone: 'danger',
      title: 'No se pudo anonimizar el cliente',
      message: error?.message || 'El backend no pudo anonimizar este cliente.',
    })
  } finally {
    actionUserId.value = 0
  }
}

function exportCurrentView() {
  if (activeTab.value === 'payments') {
    exportCsv(
      'pagos-acceso-comercial.csv',
      ['ID', 'Cliente', 'Correo', 'Plan', 'Estado', 'Importe', 'Moneda', 'Periodo inicio', 'Periodo fin', 'Tarjeta', 'Referencia'],
      (props.accessPayments || []).map((payment) => [
        payment.id,
        payment.user?.name || '',
        payment.user?.email || '',
        payment.plan?.name || 'Acceso comercial mensual',
        paymentLabel(payment.status),
        payment.amount || '',
        String(payment.currency || 'USD').toUpperCase(),
        formatDate(payment.billing_period_start, { compact: true }),
        formatDate(payment.billing_period_end, { compact: true }),
        formatCard(payment),
        payment.provider_payment_id || payment.provider_checkout_id || '',
      ]),
    )
    return
  }

  if (activeTab.value === 'aircraft') {
    exportCsv(
      'suscripciones-aeronave.csv',
      ['ID', 'Matricula', 'Modelo', 'Operador', 'Plan', 'Estado', 'Periodo', 'Proveedor pago', 'Referencia'],
      filteredAircraftSubscriptions.value.map((item) => [
        item.id,
        item.aircraft?.registration || '',
        item.aircraft?.model || '',
        item.aircraft?.provider?.commercial_name || item.aircraft?.provider?.company_name || item.user?.name || '',
        item.plan?.name || '',
        item.status || '',
        formatAircraftPeriod(item),
        item.payment_provider || 'stripe',
        item.payment_reference || '',
      ]),
    )
    return
  }

  exportCsv(
    'acceso-comercial-clientes.csv',
    ['ID', 'Cliente', 'Correo', 'Empresa', 'Estado comercial', 'Estado pago', 'Plan', 'Vigencia', 'Tarjeta', 'Ultimo cargo'],
    filteredCommercialRows.value.map((row) => [
      row.id,
      row.name,
      row.email,
      row.companyName,
      row.commercialLabel,
      paymentLabel(row.paymentStatus),
      row.planName,
      formatDate(row.accessExpiresAt, { compact: true }),
      formatCard(row.latestPayment),
      formatMoney(row.paymentAmount, row.paymentCurrency),
    ]),
  )
}

function openEvidenceModal(record = {}, kind = 'payment') {
  const payload = record.gateway_response || {}
  const source = resolveEvidenceSource(payload)
  selectedEvidence.value = {
    kind,
    id: record.id || '',
    title:
      kind === 'subscription'
        ? `Evidencia de suscripcion #${record.id || 'N/D'}`
        : `Evidencia de pago #${record.id || 'N/D'}`,
    summary: {
      cliente: record.user?.name || record.name || 'Sin cliente',
      correo: record.user?.email || record.email || 'Sin correo',
      estado: paymentLabel(record.status || record.paymentStatus || ''),
      referencia:
        record.stripe_payment_intent_id ||
        record.provider_payment_id ||
        record.transaction_reference ||
        record.provider_checkout_id ||
        'Sin referencia',
      checkout_session_id:
        record.stripe_checkout_session_id || record.provider_checkout_id || 'N/D',
      payment_intent_id:
        record.stripe_payment_intent_id || record.provider_payment_id || 'N/D',
      fecha:
        formatDate(record.paid_at || record.paidAccessAt, { compact: true, withTime: true }),
    },
    source,
    payload,
  }
  evidenceSearchTerm.value = ''
  evidenceModalOpen.value = true
}

function closeEvidenceModal() {
  evidenceModalOpen.value = false
  selectedEvidence.value = null
  evidenceSearchTerm.value = ''
}

async function copyEvidenceJson() {
  const payload = JSON.stringify(selectedEvidence.value?.payload || {}, null, 2)

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload)
    } else {
      throw new Error('Clipboard API no disponible')
    }

    ui.pushToast({
      tone: 'success',
      title: 'JSON copiado',
      message: 'La evidencia Stripe se copio al portapapeles.',
    })
  } catch {
    ui.pushToast({
      tone: 'warning',
      title: 'No se pudo copiar',
      message: 'Tu navegador no permitio copiar el JSON automaticamente.',
    })
  }
}

function downloadEvidenceJson() {
  const recordId = selectedEvidence.value?.id || 'sin-id'
  const recordKind = selectedEvidence.value?.kind || 'evidencia'
  const payload = JSON.stringify(selectedEvidence.value?.payload || {}, null, 2)
  const blob = new Blob([payload], { type: 'application/json;charset=utf-8;' })
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = `${recordKind}-${recordId}-stripe-evidence.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(objectUrl)

  ui.pushToast({
    tone: 'success',
    title: 'Evidencia descargada',
    message: 'El archivo JSON se descargo correctamente.',
  })
}

function resolveEvidenceSource(payload = {}) {
  const source = String(
    payload?.source ||
      payload?.type ||
      payload?.object ||
      payload?.event_type ||
      '',
  ).trim()

  if (!source) return 'stripe_event'
  return source
}

function sourceTone(source = '') {
  const normalized = String(source || '').toLowerCase()
  if (normalized.includes('paid') || normalized.includes('succeeded')) return 'success'
  if (normalized.includes('cancel') || normalized.includes('deleted')) return 'danger'
  if (normalized.includes('pending') || normalized.includes('created')) return 'warn'
  return 'info'
}

function sourceLabel(source = '') {
  return String(source || 'stripe_event')
    .replaceAll('_', ' ')
    .replaceAll('.', ' ')
}

const filteredEvidenceJson = computed(() => {
  const rawPayload = selectedEvidence.value?.payload || {}
  const serialized = JSON.stringify(rawPayload, null, 2)
  if (!evidenceSearchTerm.value.trim()) return serialized

  const normalizedTerm = evidenceSearchTerm.value.trim().toLowerCase()
  const lines = serialized.split('\n')
  const matchedLines = lines.filter((line) => line.toLowerCase().includes(normalizedTerm))

  return matchedLines.length ? matchedLines.join('\n') : 'Sin coincidencias dentro del payload.'
})

function exportCsv(fileName, headers, rows) {
  const csv = [headers, ...rows]
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`)
        .join(','),
    )
    .join('\n')

  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(objectUrl)
}
</script>

<template>
  <section class="subscriptions-shell">
    <div class="surface subscriptions-hero">
      <div>
        <span class="eyebrow">Suscripciones y cobros</span>
        <h2>Control comercial y de flota</h2>
        <p>
          Visualiza en una sola vista el acceso comercial de clientes, los cobros registrados y la vigencia de las
          suscripciones de aeronave.
        </p>
      </div>

      <div class="hero-actions">
        <button type="button" :class="['tab-button', { active: activeTab === 'commercial' }]" @click="activeTab = 'commercial'">
          Acceso comercial
        </button>
        <button type="button" :class="['tab-button', { active: activeTab === 'payments' }]" @click="activeTab = 'payments'">
          Pagos recientes
        </button>
        <button type="button" :class="['tab-button', { active: activeTab === 'aircraft' }]" @click="activeTab = 'aircraft'">
          Aeronaves
        </button>
      </div>
    </div>

    <div class="summary-grid">
      <article v-for="card in summaryCards" :key="card.label" class="surface summary-card">
        <span>{{ card.label }}</span>
        <strong>{{ card.value }}</strong>
        <small>{{ card.detail }}</small>
      </article>
    </div>

    <div class="surface toolbar">
      <label class="toolbar-field toolbar-search">
        <span>Buscar</span>
        <input v-model="searchTerm" type="search" placeholder="Cliente, correo, empresa, matricula o referencia..." />
      </label>

      <label class="toolbar-field">
        <span>Filtro rapido</span>
        <select v-model="statusFilter">
          <option value="todos">Todos</option>
          <option value="paid">Pago activo</option>
          <option value="trial_used">Prueba consumida</option>
          <option value="trial_in_progress">Prueba iniciada</option>
          <option value="new">Registro nuevo</option>
          <option value="pending">Pendiente</option>
          <option value="failed">Fallido</option>
        </select>
      </label>

      <label class="toolbar-field">
        <span>Filas</span>
        <select v-model="rowsPerPage">
          <option :value="10">10</option>
          <option :value="20">20</option>
          <option :value="50">50</option>
        </select>
      </label>

      <div class="toolbar-actions">
        <button type="button" class="export-button" @click="exportCurrentView">Exportar CSV</button>
      </div>
    </div>

    <div v-if="activeTab === 'commercial'" class="surface table-panel">
      <div class="panel-head">
        <div>
          <span class="eyebrow">Clientes comerciales</span>
          <h3>Acceso, vigencia y metodo de pago</h3>
        </div>
        <p>{{ filteredCommercialRows.length }} cliente(s)</p>
      </div>

      <div class="table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Estado comercial</th>
              <th>Pago</th>
              <th>Plan</th>
              <th>Vigencia</th>
              <th>Tarjeta</th>
              <th>Ultimo cargo</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in paginatedCommercialRows" :key="row.id">
              <td>
                <div class="primary-cell">
                  <strong>{{ row.name }}</strong>
                  <span>{{ row.email }}</span>
                  <small v-if="row.companyName">{{ row.companyName }}</small>
                </div>
              </td>
              <td>
                <div class="stack-cell">
                  <span :class="['status-pill', commercialTone(row.commercialStage)]">{{ row.commercialLabel }}</span>
                  <small>{{ row.freeQuotesUsed }}/{{ row.freeQuoteLimit }} uso(s) de prueba</small>
                </div>
              </td>
              <td>
                <div class="stack-cell">
                  <span :class="['status-pill', paymentTone(row.paymentStatus)]">{{ paymentLabel(row.paymentStatus) }}</span>
                  <small>{{ row.accessStatus }}</small>
                </div>
              </td>
              <td>{{ row.planName }}</td>
              <td>
                <div class="stack-cell">
                  <strong>{{ formatDate(row.accessExpiresAt) }}</strong>
                  <small>{{ row.hasPaidAccess ? 'Acceso habilitado' : 'Sin vigencia activa' }}</small>
                </div>
              </td>
              <td>{{ formatCard(row.latestPayment) }}</td>
              <td>
                <div class="stack-cell">
                  <strong>{{ formatMoney(row.paymentAmount, row.paymentCurrency) }}</strong>
                  <small>{{ formatDate(row.paidAccessAt || row.latestPayment?.paid_at, { compact: true, withTime: true }) }}</small>
                </div>
              </td>
              <td>
                <div class="row-actions">
                  <button
                    type="button"
                    class="ghost-button"
                    :disabled="isBusy(row.id)"
                    @click="grantTrial(row)"
                  >
                    {{ isBusy(row.id) ? 'Procesando...' : 'Activar demo' }}
                  </button>
                  <button
                    type="button"
                    class="danger-button"
                    :disabled="isBusy(row.id)"
                    @click="revokeAccess(row)"
                  >
                    {{ isBusy(row.id) ? 'Procesando...' : 'Revocar acceso' }}
                  </button>
                  <button
                    type="button"
                    class="warning-button"
                    :disabled="isBusy(row.id)"
                    @click="anonymizeClient(row)"
                  >
                    {{ isBusy(row.id) ? 'Procesando...' : 'Anonimizar cliente' }}
                  </button>
                  <button
                    type="button"
                    class="delete-button"
                    :disabled="isBusy(row.id)"
                    @click="deleteClient(row)"
                  >
                    {{ isBusy(row.id) ? 'Procesando...' : 'Eliminar cliente' }}
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="!filteredCommercialRows.length">
              <td colspan="8" class="empty-cell">No hay clientes que coincidan con los filtros actuales.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-else-if="activeTab === 'payments'" class="surface table-panel">
      <div class="panel-head">
        <div>
          <span class="eyebrow">Cobros de acceso</span>
          <h3>Pagos y evidencia registrados en base real</h3>
        </div>
        <p>{{ props.accessPayments.length + props.subscriptionPayments.length }} registro(s)</p>
      </div>

      <div class="subpanel">
        <div class="subpanel-head">
          <span class="eyebrow">Acceso comercial</span>
          <p>{{ props.accessPayments.length }} registro(s)</p>
        </div>

      <div class="table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Cliente</th>
              <th>Plan</th>
              <th>Estado</th>
              <th>Importe</th>
              <th>Periodo</th>
              <th>Evidencia Stripe</th>
              <th>Fecha de cobro</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="payment in paginatedRecentPayments" :key="payment.id">
              <td>#{{ payment.id }}</td>
              <td>
                <div class="primary-cell">
                  <strong>{{ payment.user?.name || 'Cliente sin ligar' }}</strong>
                  <span>{{ payment.user?.email || 'Sin correo' }}</span>
                </div>
              </td>
              <td>{{ payment.plan?.name || 'Acceso comercial mensual' }}</td>
              <td>
                <span :class="['status-pill', paymentTone(payment.status)]">
                  {{ paymentLabel(payment.status) }}
                </span>
              </td>
              <td>{{ formatMoney(payment.amount, payment.currency) }}</td>
              <td>{{ formatDate(payment.billing_period_start, { compact: true }) }} - {{ formatDate(payment.billing_period_end, { compact: true }) }}</td>
              <td>
                <div class="stack-cell">
                  <strong>{{ payment.provider_payment_id || 'Sin payment_intent' }}</strong>
                  <small>Checkout: {{ payment.provider_checkout_id || 'N/D' }}</small>
                  <small>{{ formatCard(payment) }}</small>
                </div>
              </td>
              <td>{{ formatDate(payment.paid_at, { compact: true, withTime: true }) }}</td>
              <td>
                <button type="button" class="ghost-button" @click="openEvidenceModal(payment, 'access')">
                  Ver evidencia
                </button>
              </td>
            </tr>
            <tr v-if="!props.accessPayments.length">
              <td colspan="9" class="empty-cell">Aun no hay pagos comerciales registrados.</td>
            </tr>
          </tbody>
        </table>
      </div>
      </div>

      <div class="subpanel">
        <div class="subpanel-head">
          <span class="eyebrow">Suscripcion cliente</span>
          <p>{{ props.subscriptionPayments.length }} registro(s)</p>
        </div>

        <div class="table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>ID pago</th>
                <th>Cliente</th>
                <th>Suscripcion</th>
                <th>Estado</th>
                <th>Importe</th>
                <th>Evidencia Stripe</th>
                <th>Fecha exacta</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="payment in paginatedSubscriptionPayments" :key="payment.id">
                <td>#{{ payment.id }}</td>
                <td>
                  <div class="primary-cell">
                    <strong>{{ payment.user?.name || 'Cliente sin ligar' }}</strong>
                    <span>{{ payment.user?.email || 'Sin correo' }}</span>
                  </div>
                </td>
                <td>
                  <div class="stack-cell">
                    <strong>{{ payment.subscription?.plan?.name || 'Plan no disponible' }}</strong>
                    <small>Suscripcion #{{ payment.subscription_id || 'N/D' }}</small>
                    <small>Stripe sub: {{ payment.subscription?.provider_subscription_id || 'Pendiente' }}</small>
                  </div>
                </td>
                <td>
                  <span :class="['status-pill', paymentTone(payment.status)]">
                    {{ paymentLabel(payment.status) }}
                  </span>
                </td>
                <td>{{ formatMoney(payment.amount, payment.currency) }}</td>
                <td>
                  <div class="stack-cell">
                    <strong>{{ payment.stripe_payment_intent_id || 'Sin payment_intent' }}</strong>
                    <small>Checkout: {{ payment.stripe_checkout_session_id || 'N/D' }}</small>
                    <small>Ref: {{ payment.transaction_reference || 'N/D' }}</small>
                  </div>
                </td>
                <td>
                  <div class="stack-cell">
                    <strong>{{ formatDate(payment.paid_at, { compact: true, withTime: true }) }}</strong>
                    <small>
                      Vigencia: {{ formatDate(payment.subscription?.started_at, { compact: true }) }} - {{ formatDate(payment.subscription?.expires_at, { compact: true }) }}
                    </small>
                  </div>
                </td>
                <td>
                  <button type="button" class="ghost-button" @click="openEvidenceModal(payment, 'subscription')">
                    Ver evidencia
                  </button>
                </td>
              </tr>
              <tr v-if="!props.subscriptionPayments.length">
                <td colspan="8" class="empty-cell">Aun no hay pagos de suscripcion cliente registrados.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div v-else class="surface table-panel">
      <div class="panel-head">
        <div>
          <span class="eyebrow">Suscripciones de aeronave</span>
          <h3>Flota con vigencia y referencia de cobro</h3>
        </div>
        <p>{{ filteredAircraftSubscriptions.length }} registro(s)</p>
      </div>

      <div class="table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Aeronave</th>
              <th>Operador</th>
              <th>Plan</th>
              <th>Estado</th>
              <th>Periodo</th>
              <th>Proveedor de pago</th>
              <th>Referencia</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in paginatedAircraftSubscriptions" :key="item.id">
              <td>
                <div class="primary-cell">
                  <strong>{{ item.aircraft?.registration || 'Sin matricula' }}</strong>
                  <span>{{ item.aircraft?.model || 'Modelo pendiente' }}</span>
                </div>
              </td>
              <td>
                {{ item.aircraft?.provider?.commercial_name || item.aircraft?.provider?.company_name || item.user?.name || 'Operador sin ligar' }}
              </td>
              <td>{{ item.plan?.name || 'Plan' }}</td>
              <td><span :class="['status-pill', paymentTone(item.status)]">{{ item.status || 'pending' }}</span></td>
              <td>{{ formatAircraftPeriod(item) }}</td>
              <td>{{ item.payment_provider || 'stripe' }}</td>
              <td>{{ item.payment_reference || 'Sin referencia' }}</td>
            </tr>
            <tr v-if="!filteredAircraftSubscriptions.length">
              <td colspan="7" class="empty-cell">No hay suscripciones de aeronave para mostrar.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="pagination-bar">
      <button type="button" class="pager-button" :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">
        Anterior
      </button>
      <span>Pagina {{ currentPage }} de {{ totalPages }}</span>
      <button type="button" class="pager-button" :disabled="currentPage >= totalPages" @click="goToPage(currentPage + 1)">
        Siguiente
      </button>
    </div>

    <div v-if="evidenceModalOpen" class="evidence-modal-backdrop" @click.self="closeEvidenceModal">
      <div class="surface evidence-modal">
        <div class="evidence-modal__head">
          <div>
            <span class="eyebrow">Evidencia Stripe</span>
            <h3>{{ selectedEvidence?.title || 'Detalle de evidencia' }}</h3>
          </div>
          <div class="evidence-modal__actions">
            <button type="button" class="ghost-button" @click="copyEvidenceJson">Copiar JSON</button>
            <button type="button" class="ghost-button" @click="downloadEvidenceJson">Descargar evidencia</button>
            <button type="button" class="ghost-button" @click="closeEvidenceModal">Cerrar</button>
          </div>
        </div>

        <div class="evidence-summary">
          <article v-for="(value, label) in selectedEvidence?.summary || {}" :key="label" class="evidence-summary__item">
            <span>{{ label }}</span>
            <strong>{{ value }}</strong>
          </article>
          <article class="evidence-summary__item">
            <span>origen</span>
            <strong>
              <span :class="['status-pill', sourceTone(selectedEvidence?.source)]">
                {{ sourceLabel(selectedEvidence?.source) }}
              </span>
            </strong>
          </article>
        </div>

        <div class="evidence-payload">
          <div class="evidence-payload__head">
            <span class="eyebrow">Payload guardado en BD</span>
            <label class="evidence-search">
              <span>Buscar en JSON</span>
              <input
                v-model="evidenceSearchTerm"
                type="search"
                placeholder="status, customer, amount, payment_intent..."
              />
            </label>
          </div>
          <pre>{{ filteredEvidenceJson }}</pre>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.subscriptions-shell {
  display: grid;
  gap: 1.25rem;
}

.surface {
  background: #ffffff;
  border: 1px solid rgba(168, 140, 69, 0.16);
  border-radius: 28px;
  box-shadow: 0 20px 60px rgba(26, 22, 16, 0.06);
}

.subscriptions-hero,
.toolbar,
.table-panel {
  padding: 1.5rem;
}

.subscriptions-hero {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.subscriptions-hero h2,
.panel-head h3 {
  margin: 0.35rem 0 0.4rem;
  font-size: clamp(1.8rem, 3vw, 2.8rem);
  line-height: 1;
  color: #111111;
}

.subscriptions-hero p,
.panel-head p {
  margin: 0;
  color: #6f6a61;
}

.eyebrow {
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #a0791d;
}

.hero-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.tab-button {
  border: 1px solid rgba(33, 30, 26, 0.12);
  background: #f6f2e8;
  color: #1f1b17;
  border-radius: 999px;
  padding: 0.85rem 1.15rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.tab-button.active {
  background: #171717;
  color: #fff9ef;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
}

.summary-card {
  padding: 1.2rem 1.25rem;
  display: grid;
  gap: 0.45rem;
}

.summary-card span,
.summary-card small {
  color: #6f6a61;
}

.summary-card strong {
  font-size: 2rem;
  line-height: 1;
  color: #111111;
}

.summary-card,
.summary-card span,
.summary-card small,
.toolbar-field,
.toolbar-field span,
.panel-head p,
.primary-cell strong,
.stack-cell strong,
.admin-table td,
.admin-table th {
  color: #111111;
}

.toolbar {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(180px, 220px) minmax(120px, 140px) auto;
  gap: 1rem;
}

.toolbar-field {
  display: grid;
  gap: 0.45rem;
  color: #111111;
  font-weight: 700;
}

.toolbar-field input,
.toolbar-field select {
  width: 100%;
  border-radius: 18px;
  border: 1px solid rgba(33, 30, 26, 0.12);
  background: #fffdf9;
  padding: 0.95rem 1rem;
  font: inherit;
  color: #1f1b17;
}

.table-panel {
  display: grid;
  gap: 1rem;
}

.subpanel {
  display: grid;
  gap: 0.75rem;
}

.subpanel-head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
}

.subpanel-head p {
  margin: 0;
  color: #111111;
}

.toolbar-actions {
  display: flex;
  align-items: end;
  justify-content: flex-end;
}

.export-button,
.pager-button,
.ghost-button,
.danger-button {
  border: 1px solid rgba(33, 30, 26, 0.12);
  border-radius: 16px;
  padding: 0.85rem 1rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.export-button,
.pager-button,
.ghost-button {
  background: #fffdf9;
  color: #1f1b17;
}

.danger-button {
  background: #fff0ed;
  color: #b93828;
  border-color: rgba(185, 56, 40, 0.22);
}

.warning-button {
  background: #fff6df;
  color: #9a5b00;
  border: 1px solid rgba(154, 91, 0, 0.2);
  border-radius: 16px;
  padding: 0.85rem 1rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.delete-button {
  background: #b42318;
  color: #fff8f7;
  border: 1px solid rgba(120, 12, 12, 0.24);
  border-radius: 16px;
  padding: 0.85rem 1rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.export-button:hover,
.pager-button:hover,
.ghost-button:hover,
.danger-button:hover,
.warning-button:hover,
.delete-button:hover {
  filter: brightness(0.98);
}

.export-button:disabled,
.pager-button:disabled,
.ghost-button:disabled,
.danger-button:disabled,
.warning-button:disabled,
.delete-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-end;
}

.table-wrap {
  overflow-x: auto;
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 980px;
}

.admin-table th {
  text-align: left;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #7d766c;
  padding: 0.9rem 1rem;
  border-bottom: 1px solid rgba(33, 30, 26, 0.08);
}

.admin-table td {
  padding: 1rem;
  border-bottom: 1px solid rgba(33, 30, 26, 0.06);
  vertical-align: top;
  color: #211d19;
}

.primary-cell,
.stack-cell {
  display: grid;
  gap: 0.2rem;
}

.primary-cell span,
.primary-cell small,
.stack-cell small {
  color: #111111;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  border-radius: 999px;
  padding: 0.35rem 0.7rem;
  font-size: 0.8rem;
  font-weight: 800;
}

.status-pill.success {
  background: #dff4ea;
  color: #0f8a57;
}

.status-pill.warn {
  background: #fff1d8;
  color: #b06b00;
}

.status-pill.danger {
  background: #ffe4df;
  color: #c0392b;
}

.status-pill.info,
.status-pill.neutral {
  background: #eef2f7;
  color: #4b5969;
}

.empty-cell {
  text-align: center;
  color: #111111;
  padding: 2rem 1rem;
}

.row-actions {
  display: grid;
  gap: 0.5rem;
}

.pagination-bar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.8rem;
}

.evidence-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 15, 15, 0.46);
  display: grid;
  place-items: center;
  padding: 1.5rem;
  z-index: 50;
}

.evidence-modal {
  width: min(980px, 100%);
  max-height: 85vh;
  overflow: auto;
  padding: 1.5rem;
  display: grid;
  gap: 1rem;
}

.evidence-modal__head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.evidence-modal__actions {
  display: flex;
  gap: 0.65rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.evidence-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.85rem;
}

.evidence-summary__item {
  border: 1px solid rgba(33, 30, 26, 0.08);
  border-radius: 18px;
  padding: 0.85rem 1rem;
  display: grid;
  gap: 0.3rem;
}

.evidence-summary__item span {
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #7a6d50;
}

.evidence-summary__item strong {
  color: #111111;
  word-break: break-word;
}

.evidence-payload {
  display: grid;
  gap: 0.6rem;
}

.evidence-payload__head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: end;
}

.evidence-search {
  display: grid;
  gap: 0.35rem;
  min-width: min(360px, 100%);
  color: #111111;
  font-weight: 700;
}

.evidence-search input {
  width: 100%;
  border-radius: 14px;
  border: 1px solid rgba(33, 30, 26, 0.12);
  background: #fffdf9;
  padding: 0.8rem 0.9rem;
  font: inherit;
  color: #111111;
}

.evidence-payload pre {
  margin: 0;
  padding: 1rem;
  border-radius: 18px;
  background: #171717;
  color: #f5f1e8;
  overflow: auto;
  font-size: 0.84rem;
  line-height: 1.45;
}

@media (max-width: 960px) {
  .subscriptions-hero,
  .panel-head {
    grid-template-columns: 1fr;
    display: grid;
  }

  .hero-actions {
    justify-content: flex-start;
  }

  .toolbar {
    grid-template-columns: 1fr;
  }

  .toolbar-actions,
  .pagination-bar {
    justify-content: flex-start;
  }

  .evidence-modal__head {
    display: grid;
  }

  .evidence-modal__actions {
    justify-content: flex-start;
  }

  .evidence-payload__head {
    display: grid;
    align-items: start;
  }

  .evidence-search {
    min-width: 100%;
  }
}
</style>
