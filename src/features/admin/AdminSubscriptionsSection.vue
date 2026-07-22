<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, resolveMediaUrl } from '../../lib/api'
import { useUiStore } from '../../stores/ui'

const props = defineProps({
  clients: { type: Array, default: () => [] },
  aircraft: { type: Array, default: () => [] },
  accessPayments: { type: Array, default: () => [] },
  subscriptionPayments: { type: Array, default: () => [] },
  aircraftSubscriptions: { type: Array, default: () => [] },
  initialTab: { type: String, default: 'commercial' },
})
const emit = defineEmits(['refresh'])
const ui = useUiStore()
const route = useRoute()
const router = useRouter()

const activeTab = ref('commercial')
const searchTerm = ref('')
const statusFilter = ref('todos')
const currentPage = ref(1)
const rowsPerPage = ref(10)
const sortBy = ref('renewal_asc')
const actionUserId = ref(0)
const commercialActionMenuId = ref(0)
const evidenceModalOpen = ref(false)
const selectedEvidence = ref(null)
const evidenceSearchTerm = ref('')
const selectedProviderPaymentId = ref('')
const brokenAircraftImages = ref({})

const contentTabs = [
  { id: 'commercial', label: 'Acceso comercial' },
  { id: 'payments', label: 'Pagos recientes' },
  { id: 'provider-payments', label: 'Pagos proveedor' },
  { id: 'aircraft', label: 'Aeronaves' },
]

const latestPaymentByUserId = computed(() => {
  const map = new Map()

  for (const payment of props.accessPayments || []) {
    const userId = Number(payment?.user_id || payment?.user?.id || 0)
    if (!userId || map.has(userId)) continue
    map.set(userId, payment)
  }

  return map
})

const aircraftCatalogById = computed(() => {
  const map = new Map()

  for (const item of props.aircraft || []) {
    const id = Number(item?.id || 0)
    if (!id) continue
    map.set(id, item)
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

const providerPaymentRows = computed(() =>
  sortProviderPaymentRows(
    (props.aircraftSubscriptions || [])
    .map((item, index) => {
      const aircraftId = Number(item?.aircraft?.id || item?.aircraft_id || 0)
      const catalogAircraftRecord = aircraftCatalogById.value.get(aircraftId) || null
      const aircraftRecord = item?.aircraft || catalogAircraftRecord || {}
      const providerRecord = aircraftRecord?.provider || item?.provider || item?.user || {}
      const status = String(
        item?.payment_status ||
          item?.status ||
          item?.subscription_status ||
          item?.aircraft_subscription?.status ||
          'pending',
      ).toLowerCase()
      const amount =
        item?.amount ??
        item?.price_monthly ??
        item?.plan?.price ??
        item?.plan?.amount ??
        item?.monthly_amount ??
        0
      const currency = String(
        item?.currency || item?.payment_currency || item?.plan?.currency || item?.plan?.currency_code || 'USD',
      ).toUpperCase()
      const aircraftImage = resolveAircraftImage(aircraftRecord, item, catalogAircraftRecord)
      const operationalStatus = String(
        aircraftRecord?.status ||
          aircraftRecord?.operational_status ||
          aircraftRecord?.availability_status ||
          'Pendiente',
      )
      const renewalMeta = resolveProviderRenewalMeta(item)

      return {
        id: item?.id || `provider-payment-${index + 1}`,
        aircraftLabel: aircraftRecord?.registration || aircraftRecord?.matricula || aircraftRecord?.model || 'Aeronave',
        aircraftModel: aircraftRecord?.model || aircraftRecord?.name || 'Modelo pendiente',
        aircraftName: aircraftRecord?.name || aircraftRecord?.model || aircraftRecord?.registration || 'Aeronave',
        aircraftBase:
          aircraftRecord?.base_airport ||
          aircraftRecord?.base ||
          aircraftRecord?.airport ||
          aircraftRecord?.location ||
          'Base pendiente',
        aircraftCategory: aircraftRecord?.category || aircraftRecord?.class || 'Categoria no visible',
        aircraftImage,
        providerName:
          providerRecord?.commercial_name ||
          providerRecord?.company_name ||
          providerRecord?.name ||
          providerRecord?.email ||
          'Proveedor sin ligar',
        providerEmail: providerRecord?.email || providerRecord?.user?.email || '',
        planName: item?.plan?.name || 'Suscripcion de aeronave',
        status,
        amount,
        currency,
        paymentProvider: item?.payment_provider || 'stripe',
        paymentReference:
          item?.payment_reference ||
          item?.provider_payment_id ||
          item?.provider_subscription_id ||
          item?.stripe_subscription_id ||
          'Sin referencia',
        checkoutId: item?.provider_checkout_id || item?.stripe_checkout_session_id || 'N/D',
        providerSubscriptionId:
          item?.provider_subscription_id || item?.stripe_subscription_id || item?.provider_payment_id || 'N/D',
        startsAt: item?.starts_at || item?.started_at || item?.subscription?.started_at || '',
        endsAt: item?.ends_at || item?.expires_at || item?.subscription?.expires_at || '',
        paidAt: item?.paid_at || item?.updated_at || item?.subscription?.paid_at || '',
        autoRenewEnabled: renewalMeta.autoRenewEnabled,
        paymentMethodReady: renewalMeta.paymentMethodReady,
        renewalModeLabel: renewalMeta.renewalModeLabel,
        renewalReminderLabel: renewalMeta.renewalReminderLabel,
        renewalTone: renewalMeta.renewalTone,
        daysUntilExpiry: renewalMeta.daysUntilExpiry ?? null,
        operationalStatus,
        aircraftApproved:
          aircraftRecord?.approved === true ||
          String(aircraftRecord?.status || '').toLowerCase() === 'active',
        raw: item,
      }
    })
    .filter((row) => {
      const haystack = [
        row.aircraftLabel,
        row.aircraftModel,
        row.providerName,
        row.providerEmail,
        row.planName,
        row.paymentReference,
        row.providerSubscriptionId,
      ]
        .join(' ')
        .toLowerCase()

      const matchesSearch = !searchTerm.value || haystack.includes(searchTerm.value.toLowerCase())
      const matchesStatus =
        statusFilter.value === 'todos' || row.status === statusFilter.value || paymentLabel(row.status) === statusFilter.value

      return matchesSearch && matchesStatus
    }),
    sortBy.value,
  ),
)

const providerPaymentSummaryCards = computed(() => {
  const activeRows = providerPaymentRows.value.filter((row) => row.status === 'active').length
  const pendingRows = providerPaymentRows.value.filter((row) =>
    ['pending', 'processing', 'requires_payment_method'].includes(row.status),
  ).length
  const failedRows = providerPaymentRows.value.filter((row) =>
    ['failed', 'canceled'].includes(row.status),
  ).length
  const monthlyAmount = providerPaymentRows.value.reduce((total, row) => total + Number(row.amount || 0), 0)
  const monthlyCurrency = providerPaymentRows.value[0]?.currency || 'USD'

  return [
    { label: 'Cobros proveedor', value: String(providerPaymentRows.value.length), detail: 'Pagos ligados a aeronaves activas o en onboarding.' },
    { label: 'Suscripciones activas', value: String(activeRows), detail: 'Cobros con estado activo o visible para flota.' },
    { label: 'Pendientes por conciliar', value: String(pendingRows), detail: 'Registros que aun requieren confirmacion o metodo de pago.' },
    { label: 'Errores visibles', value: String(failedRows), detail: 'Cobros que necesitan seguimiento administrativo.' },
    { label: 'Monto mensual monitoreado', value: formatMoney(monthlyAmount, monthlyCurrency), detail: 'Suma de la mensualidad visible en la base actual.' },
  ]
})

const selectedProviderPayment = computed(
  () =>
    providerPaymentRows.value.find((row) => String(row.id) === String(selectedProviderPaymentId.value)) ||
    paginatedProviderPaymentRows.value[0] ||
    providerPaymentRows.value[0] ||
    null,
)

const selectedProviderPaymentTimeline = computed(() => {
  const row = selectedProviderPayment.value
  if (!row) return []

  return [
    {
      id: `${row.id}-created`,
      label: 'Suscripcion registrada',
      date: formatDate(row.startsAt, { compact: true }),
      detail: `${row.planName} vinculada a ${row.aircraftLabel}.`,
      state: row.startsAt ? 'done' : 'pending',
    },
    {
      id: `${row.id}-paid`,
      label: ['active', 'paid', 'succeeded'].includes(row.status) ? 'Pago confirmado' : 'Cobro en seguimiento',
      date: formatDate(row.paidAt, { compact: true, withTime: true }),
      detail: row.paymentReference,
      state: ['active', 'paid', 'succeeded'].includes(row.status) ? 'done' : 'current',
    },
    {
      id: `${row.id}-renewal`,
      label: 'Proxima vigencia',
      date: formatDate(row.endsAt, { compact: true }),
      detail: `Proveedor ${row.providerName}`,
      state: row.endsAt ? 'upcoming' : 'pending',
    },
  ]
})

const summaryCards = computed(() => {
  const totalCommercial = commercialRows.value.length
  const paidCommercial = commercialRows.value.filter((row) => row.hasPaidAccess).length
  const trialConsumed = commercialRows.value.filter((row) => row.commercialStage === 'trial_used').length
  const pendingPayment = commercialRows.value.filter((row) =>
    ['pending', 'requires_payment_method', 'processing'].includes(row.paymentStatus),
  ).length
  const activeAircraft = (props.aircraftSubscriptions || []).filter((item) => String(item?.status || '').toLowerCase() === 'active').length
  const providerPayments = providerPaymentRows.value.length

  return [
    { label: 'Clientes monitoreados', value: totalCommercial, detail: 'Base comercial visible en esta vista.' },
    { label: 'Acceso activo', value: paidCommercial, detail: 'Clientes con acceso comercial habilitado.' },
    { label: 'Prueba consumida', value: trialConsumed, detail: 'Ya requieren pago para seguir cotizando.' },
    { label: 'Pagos pendientes', value: pendingPayment, detail: 'Intentos creados o en validacion.' },
    { label: 'Suscripciones aeronave', value: activeAircraft, detail: 'Registros activos de flota.' },
    { label: 'Pagos proveedor', value: providerPayments, detail: 'Cobros del proveedor vinculados a aeronaves.' },
  ]
})

const activeCollectionLength = computed(() => {
  if (activeTab.value === 'payments') return Math.max(props.accessPayments.length, props.subscriptionPayments.length)
  if (activeTab.value === 'provider-payments') return providerPaymentRows.value.length
  if (activeTab.value === 'aircraft') return filteredAircraftSubscriptions.value.length
  return filteredCommercialRows.value.length
})

const totalPages = computed(() => Math.max(1, Math.ceil(activeCollectionLength.value / rowsPerPage.value)))
const paginationStart = computed(() => (activeCollectionLength.value ? (currentPage.value - 1) * rowsPerPage.value + 1 : 0))
const paginationEnd = computed(() => Math.min(currentPage.value * rowsPerPage.value, activeCollectionLength.value))

const paginatedCommercialRows = computed(() => paginateRows(filteredCommercialRows.value))
const paginatedRecentPayments = computed(() => paginateRows(props.accessPayments || []))
const paginatedSubscriptionPayments = computed(() => paginateRows(props.subscriptionPayments || []))
const paginatedProviderPaymentRows = computed(() => paginateRows(providerPaymentRows.value))
const paginatedAircraftSubscriptions = computed(() => paginateRows(filteredAircraftSubscriptions.value))

watch([activeTab, rowsPerPage, searchTerm, statusFilter, sortBy], () => {
  currentPage.value = 1
})

watch(
  () => [props.initialTab, route.query.tab],
  ([nextTab, queryTab]) => {
    const allowedTabs = new Set(['commercial', 'payments', 'provider-payments', 'aircraft'])
    const resolvedTab = allowedTabs.has(String(queryTab || '')) ? String(queryTab) : nextTab
    activeTab.value = allowedTabs.has(resolvedTab) ? resolvedTab : 'commercial'
  },
  { immediate: true },
)

watch(
  providerPaymentRows,
  (rows) => {
    if (!rows.length) {
      selectedProviderPaymentId.value = ''
      return
    }

    const currentExists = rows.some((row) => String(row.id) === String(selectedProviderPaymentId.value))
    if (!currentExists) {
      selectedProviderPaymentId.value = String(rows[0].id)
    }
  },
  { immediate: true },
)

watch(
  () => route.query.provider_payment_id,
  (nextId) => {
    if (!nextId) return
    if (providerPaymentRows.value.some((row) => String(row.id) === String(nextId))) {
      selectedProviderPaymentId.value = String(nextId)
    }
  },
  { immediate: true },
)

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

function resolveAircraftImage(aircraftRecord = {}, subscriptionRecord = {}, catalogAircraftRecord = null) {
  const candidateValues = [
    aircraftRecord?.main_image,
    aircraftRecord?.mainImage,
    aircraftRecord?.image_url,
    aircraftRecord?.imageUrl,
    aircraftRecord?.image,
    aircraftRecord?.photo,
    aircraftRecord?.thumbnail,
    aircraftRecord?.cover_image,
    aircraftRecord?.featured_image,
    aircraftRecord?.media?.[0]?.url,
    aircraftRecord?.gallery?.[0]?.url,
    aircraftRecord?.images?.[0]?.image_url,
    aircraftRecord?.images?.[0]?.url,
    aircraftRecord?.images?.[0]?.path,
    aircraftRecord?.files?.[0]?.url,
    subscriptionRecord?.aircraft_image,
    subscriptionRecord?.image_url,
    catalogAircraftRecord?.mainImage,
    catalogAircraftRecord?.main_image,
    catalogAircraftRecord?.image,
    catalogAircraftRecord?.image_url,
    catalogAircraftRecord?.main_image_url,
    catalogAircraftRecord?.images?.[0]?.imageUrl,
    catalogAircraftRecord?.images?.[0]?.image_url,
    catalogAircraftRecord?.images?.[0]?.url,
  ]

  for (const candidate of candidateValues) {
    const normalized = resolveMediaUrl(extractImageCandidate(candidate))
    if (normalized) return normalized
  }

  const collectionCandidates = [
    aircraftRecord?.images,
    aircraftRecord?.gallery,
    aircraftRecord?.media,
    aircraftRecord?.files,
    catalogAircraftRecord?.images,
    catalogAircraftRecord?.gallery,
    catalogAircraftRecord?.media,
    catalogAircraftRecord?.files,
  ]
  for (const collection of collectionCandidates) {
    if (!Array.isArray(collection)) continue
    for (const entry of collection) {
      const normalized = resolveMediaUrl(
        extractImageCandidate(entry?.image_url || entry?.url || entry?.path || entry?.file_url || entry),
      )
      if (normalized) return normalized
    }
  }

  return ''
}

function extractImageCandidate(candidate) {
  if (!candidate) return ''
  if (typeof candidate === 'string') return candidate
  if (typeof candidate === 'object') {
    return candidate.url || candidate.path || candidate.image_url || candidate.file_url || candidate.src || ''
  }
  return ''
}

function getDaysUntilDate(value) {
  if (!value) return null
  const target = new Date(value)
  if (Number.isNaN(target.getTime())) return null

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const normalizedTarget = new Date(target)
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value).trim())) {
    normalizedTarget.setHours(23, 59, 59, 999)
  }

  return Math.ceil((normalizedTarget.getTime() - startOfToday.getTime()) / 86400000)
}

function resolveProviderRenewalMeta(item = {}) {
  const providerSubscriptionId = String(
    item?.provider_subscription_id || item?.stripe_subscription_id || item?.subscription?.provider_subscription_id || '',
  ).trim()
  const explicitAutoRenew = [
    item?.auto_renew_enabled,
    item?.autoRenewEnabled,
    item?.subscription_auto_renew,
    item?.subscriptionAutoRenew,
  ].find((value) => value === true || value === false)
  const paymentMethodReadyCandidate = [
    item?.default_payment_method_ready,
    item?.defaultPaymentMethodReady,
    item?.has_default_payment_method,
    item?.hasDefaultPaymentMethod,
  ].find((value) => value === true || value === false)
  const normalizedStatus = String(
    item?.payment_status || item?.status || item?.subscription_status || '',
  ).toLowerCase()
  const autoRenewEnabled =
    explicitAutoRenew === true ||
    (Boolean(providerSubscriptionId) && ['active', 'paid', 'current', 'succeeded'].includes(normalizedStatus))
  const paymentMethodReady =
    paymentMethodReadyCandidate === true ||
    (paymentMethodReadyCandidate !== false && Boolean(providerSubscriptionId))
  const daysUntilExpiry = getDaysUntilDate(item?.ends_at || item?.expires_at || item?.subscription?.expires_at || '')

  if (daysUntilExpiry === null) {
    return {
      autoRenewEnabled,
      paymentMethodReady,
      providerSubscriptionId,
      renewalModeLabel: autoRenewEnabled ? 'Automatica' : 'Manual',
      renewalReminderLabel: 'Sin vigencia visible',
      renewalTone: autoRenewEnabled ? 'info' : 'warn',
    }
  }

  if (daysUntilExpiry < 0) {
    return {
      autoRenewEnabled,
      paymentMethodReady,
      providerSubscriptionId,
      daysUntilExpiry,
      renewalModeLabel: autoRenewEnabled ? 'Automatica vencida' : 'Manual vencida',
      renewalReminderLabel: 'Vencida',
      renewalTone: 'danger',
    }
  }

  if (autoRenewEnabled) {
    return {
      autoRenewEnabled,
      paymentMethodReady,
      providerSubscriptionId,
      daysUntilExpiry,
      renewalModeLabel: paymentMethodReady ? 'Automatica' : 'Automatica con alerta',
      renewalReminderLabel:
        daysUntilExpiry <= 7 ? `Cobra en ${daysUntilExpiry} dia(s)` : `Activa por ${daysUntilExpiry} dia(s)`,
      renewalTone: paymentMethodReady ? (daysUntilExpiry <= 7 ? 'info' : 'success') : 'warn',
    }
  }

  return {
    autoRenewEnabled,
    paymentMethodReady,
    providerSubscriptionId,
    daysUntilExpiry,
    renewalModeLabel: 'Manual',
    renewalReminderLabel:
      daysUntilExpiry <= 15 ? `Renovar en ${daysUntilExpiry} dia(s)` : `Vigente por ${daysUntilExpiry} dia(s)`,
    renewalTone: daysUntilExpiry <= 15 ? 'warn' : 'info',
  }
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
  if (['paid', 'succeeded', 'active'].includes(status)) return 'success'
  if (['failed', 'canceled'].includes(status)) return 'danger'
  if (['pending', 'processing', 'requires_payment_method'].includes(status)) return 'warn'
  return 'neutral'
}

function paymentLabel(status = '') {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'paid' || normalized === 'succeeded') return 'Pagado'
  if (normalized === 'active') return 'Activa'
  if (normalized === 'failed') return 'Fallido'
  if (normalized === 'processing') return 'Procesando'
  if (normalized === 'requires_payment_method') return 'Falta tarjeta'
  if (normalized === 'pending') return 'Pendiente'
  if (normalized === 'no_payment') return 'Sin pago'
  return normalized || 'Sin pago'
}

function toTimestamp(value) {
  const date = new Date(value || '')
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function sortProviderPaymentRows(rows = [], mode = 'renewal_asc') {
  const collection = [...rows]

  collection.sort((left, right) => {
    if (mode === 'amount_desc') return Number(right.amount || 0) - Number(left.amount || 0)
    if (mode === 'amount_asc') return Number(left.amount || 0) - Number(right.amount || 0)
    if (mode === 'provider_asc') return String(left.providerName || '').localeCompare(String(right.providerName || ''), 'es')
    if (mode === 'aircraft_asc') return String(left.aircraftName || '').localeCompare(String(right.aircraftName || ''), 'es')
    if (mode === 'recent_desc') return toTimestamp(right.paidAt) - toTimestamp(left.paidAt)
    return toTimestamp(left.endsAt) - toTimestamp(right.endsAt)
  })

  return collection
}

function hasRenderableAircraftImage(row = {}) {
  return Boolean(row?.aircraftImage) && !brokenAircraftImages.value[String(row.id)]
}

function markAircraftImageError(rowId) {
  brokenAircraftImages.value = {
    ...brokenAircraftImages.value,
    [String(rowId)]: true,
  }
}

function getAircraftBadge(row = {}) {
  const source = String(row?.aircraftLabel || row?.aircraftName || 'AV').trim()
  const compact = source.replace(/[^A-Z0-9]/gi, '').toUpperCase()
  return compact.slice(0, 2) || 'AV'
}

const toolbarSearchPlaceholder = computed(() => {
  if (activeTab.value === 'provider-payments') {
    return 'Matricula, modelo, proveedor, referencia Stripe o base operativa...'
  }
  if (activeTab.value === 'aircraft') {
    return 'Matricula, modelo, operador o referencia...'
  }
  return 'Cliente, correo, empresa, matricula o referencia...'
})

const statusFilterOptions = computed(() => {
  if (activeTab.value === 'provider-payments') {
    return [
      { value: 'todos', label: 'Todos' },
      { value: 'active', label: 'Activa' },
      { value: 'pending', label: 'Pendiente' },
      { value: 'processing', label: 'Procesando' },
      { value: 'requires_payment_method', label: 'Falta tarjeta' },
      { value: 'failed', label: 'Fallido' },
      { value: 'canceled', label: 'Cancelado' },
    ]
  }

  return [
    { value: 'todos', label: 'Todos' },
    { value: 'active', label: 'Activa' },
    { value: 'paid', label: 'Pago activo' },
    { value: 'trial_used', label: 'Prueba consumida' },
    { value: 'trial_in_progress', label: 'Prueba iniciada' },
    { value: 'new', label: 'Registro nuevo' },
    { value: 'pending', label: 'Pendiente' },
    { value: 'failed', label: 'Fallido' },
  ]
})

function paginateRows(rows = []) {
  const start = (currentPage.value - 1) * rowsPerPage.value
  return rows.slice(start, start + rowsPerPage.value)
}

function goToPage(page) {
  currentPage.value = Math.min(Math.max(1, page), totalPages.value)
}

function openAdminSection(section, query = {}) {
  router.push({
    name: 'admin',
    params: { section },
    query,
  })
}

function openSelectedProviderAircraft(row = selectedProviderPayment.value) {
  if (!row) return
  openAdminSection('aeronaves', {
    aircraft_id: String(row.raw?.aircraft?.id || row.raw?.aircraft_id || ''),
  })
}

function openSelectedProviderProfile(row = selectedProviderPayment.value) {
  if (!row) return
  openAdminSection('proveedores', {
    provider_id: String(
      row.raw?.aircraft?.provider?.id ||
        row.raw?.provider?.id ||
        row.raw?.provider_id ||
        '',
    ),
  })
}

function openSelectedProviderSubscription(row = selectedProviderPayment.value) {
  if (!row) return
  openAdminSection('suscripciones', {
    tab: 'provider-payments',
    provider_payment_id: String(row.id),
  })
}

function isBusy(userId) {
  return actionUserId.value === Number(userId || 0)
}

function userInitials(name = '') {
  return (
    String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((chunk) => chunk.charAt(0).toUpperCase())
      .join('') || 'CL'
  )
}

function isCommercialMenuOpen(userId) {
  return commercialActionMenuId.value === Number(userId || 0)
}

function toggleCommercialActionMenu(userId) {
  const normalizedId = Number(userId || 0)
  commercialActionMenuId.value = commercialActionMenuId.value === normalizedId ? 0 : normalizedId
}

function closeCommercialActionMenu() {
  commercialActionMenuId.value = 0
}

function openCommercialDetail() {
  closeCommercialActionMenu()
  openAdminSection('usuarios')
}

function primaryCommercialActionLabel(row = {}) {
  if (row.hasPaidAccess || row.commercialStage === 'paid') return 'Actualizar acceso'
  return 'Activar demo'
}

async function runPrimaryCommercialAction(row) {
  closeCommercialActionMenu()
  if (row.hasPaidAccess || row.commercialStage === 'paid') {
    await revokeAccess(row)
    return
  }

  await grantTrial(row)
}

async function grantTrial(row) {
  if (!row?.id || isBusy(row.id)) return
  closeCommercialActionMenu()
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
  closeCommercialActionMenu()
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
  closeCommercialActionMenu()
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
  closeCommercialActionMenu()
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

  if (activeTab.value === 'provider-payments') {
    exportCsv(
      'pagos-proveedor-aeronaves.csv',
      ['ID', 'Proveedor', 'Correo', 'Aeronave', 'Modelo', 'Plan', 'Estado', 'Monto', 'Moneda', 'Proveedor pago', 'Referencia', 'Stripe sub', 'Checkout', 'Vigencia'],
      providerPaymentRows.value.map((row) => [
        row.id,
        row.providerName,
        row.providerEmail,
        row.aircraftLabel,
        row.aircraftModel,
        row.planName,
        paymentLabel(row.status),
        row.amount || '',
        row.currency,
        row.paymentProvider,
        row.paymentReference,
        row.providerSubscriptionId,
        row.checkoutId,
        `${formatDate(row.startsAt, { compact: true })} - ${formatDate(row.endsAt, { compact: true })}`,
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
  const payload = record.gateway_response || record.raw || record.payload || {}
  const source = resolveEvidenceSource(payload)
  selectedEvidence.value = {
    kind,
    id: record.id || '',
    title:
      kind === 'subscription'
        ? `Evidencia de suscripcion #${record.id || 'N/D'}`
        : kind === 'provider'
          ? `Evidencia proveedor #${record.id || 'N/D'}`
        : `Evidencia de pago #${record.id || 'N/D'}`,
    summary: {
      cliente:
        record.user?.name ||
        record.name ||
        record.providerName ||
        record.raw?.aircraft?.provider?.commercial_name ||
        'Sin cliente',
      correo:
        record.user?.email ||
        record.email ||
        record.providerEmail ||
        record.raw?.aircraft?.provider?.email ||
        'Sin correo',
      estado: paymentLabel(record.status || record.paymentStatus || ''),
      referencia:
        record.stripe_payment_intent_id ||
        record.provider_payment_id ||
        record.paymentReference ||
        record.transaction_reference ||
        record.providerSubscriptionId ||
        record.provider_checkout_id ||
        'Sin referencia',
      checkout_session_id:
        record.stripe_checkout_session_id || record.provider_checkout_id || record.checkoutId || 'N/D',
      payment_intent_id:
        record.stripe_payment_intent_id || record.provider_payment_id || record.providerSubscriptionId || 'N/D',
      fecha:
        formatDate(record.paid_at || record.paidAccessAt || record.paidAt, { compact: true, withTime: true }),
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
      <div class="subscriptions-hero__copy">
        <span class="eyebrow">Suscripciones y cobros</span>
        <h2>Control comercial y de flota</h2>
        <p>
          Visualiza en una sola vista el acceso comercial de clientes, los cobros registrados y la vigencia de las
          suscripciones de aeronave.
        </p>
      </div>

      <div class="hero-actions">
        <button
          v-for="tab in contentTabs"
          :key="tab.id"
          type="button"
          :class="['tab-button', { active: activeTab === tab.id }]"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <div v-if="activeTab !== 'provider-payments'" class="summary-grid">
      <article v-for="card in summaryCards" :key="card.label" class="surface summary-card">
        <span class="summary-card__icon" aria-hidden="true">
          {{
            card.label === 'Clientes monitoreados'
              ? '👥'
              : card.label === 'Acceso activo'
                ? '🛡️'
                : card.label === 'Prueba consumida'
                  ? '📄'
                  : card.label === 'Pagos pendientes'
                    ? '🕘'
                    : card.label === 'Suscripciones aeronave'
                      ? '✈️'
                      : '💳'
          }}
        </span>
        <span>{{ card.label }}</span>
        <strong>{{ card.value }}</strong>
        <small>{{ card.detail }}</small>
      </article>
    </div>

    <div class="surface toolbar">
      <label class="toolbar-field toolbar-search">
        <span>Buscar</span>
        <input v-model="searchTerm" type="search" :placeholder="toolbarSearchPlaceholder" />
      </label>

      <label class="toolbar-field">
        <span>Filtro rapido</span>
        <select v-model="statusFilter">
          <option v-for="option in statusFilterOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>

      <label v-if="activeTab === 'provider-payments'" class="toolbar-field">
        <span>Orden</span>
        <select v-model="sortBy">
          <option value="renewal_asc">Proximo cobro</option>
          <option value="recent_desc">Ultimo pago reciente</option>
          <option value="amount_desc">Monto mayor</option>
          <option value="amount_asc">Monto menor</option>
          <option value="provider_asc">Proveedor A-Z</option>
          <option value="aircraft_asc">Aeronave A-Z</option>
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
                <div class="client-cell">
                  <span class="client-avatar">{{ userInitials(row.name) }}</span>
                  <div class="primary-cell">
                    <strong>{{ row.name }}</strong>
                    <span>{{ row.email }}</span>
                    <small v-if="row.companyName">{{ row.companyName }}</small>
                  </div>
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
                <div class="row-actions row-actions--compact">
                  <button
                    type="button"
                    class="icon-button"
                    :title="`Ver detalle de ${row.name}`"
                    @click="openCommercialDetail(row)"
                  >
                    👁
                  </button>
                  <button
                    type="button"
                    class="ghost-button ghost-button--primary"
                    :disabled="isBusy(row.id)"
                    @click="runPrimaryCommercialAction(row)"
                  >
                    {{ isBusy(row.id) ? 'Procesando...' : primaryCommercialActionLabel(row) }}
                  </button>
                  <div class="row-actions__menu-wrap">
                    <button
                      type="button"
                      class="icon-button"
                      :aria-expanded="isCommercialMenuOpen(row.id) ? 'true' : 'false'"
                      :title="`Mas acciones para ${row.name}`"
                      @click="toggleCommercialActionMenu(row.id)"
                    >
                      ⋮
                    </button>
                    <div v-if="isCommercialMenuOpen(row.id)" class="row-actions__menu">
                      <button type="button" class="menu-item" :disabled="isBusy(row.id)" @click="grantTrial(row)">
                        Activar demo
                      </button>
                      <button type="button" class="menu-item" :disabled="isBusy(row.id)" @click="revokeAccess(row)">
                        Revocar acceso
                      </button>
                      <button type="button" class="menu-item" :disabled="isBusy(row.id)" @click="anonymizeClient(row)">
                        Anonimizar cliente
                      </button>
                      <button type="button" class="menu-item menu-item--danger" :disabled="isBusy(row.id)" @click="deleteClient(row)">
                        Eliminar cliente
                      </button>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
            <tr v-if="!filteredCommercialRows.length">
              <td colspan="8" class="empty-cell">No hay clientes que coincidan con los filtros actuales.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="panel-footer">
        <div class="pagination-bar">
          <button type="button" class="pager-button" :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">
            Anterior
          </button>
          <span>Pagina {{ currentPage }}</span>
          <button type="button" class="pager-button" :disabled="currentPage >= totalPages" @click="goToPage(currentPage + 1)">
            Siguiente
          </button>
        </div>
        <p class="results-copy">
          Mostrando {{ paginationStart }} a {{ paginationEnd }} de {{ activeCollectionLength }} resultados
        </p>
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

      <div class="panel-footer">
        <div class="pagination-bar">
          <button type="button" class="pager-button" :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">
            Anterior
          </button>
          <span>Pagina {{ currentPage }}</span>
          <button type="button" class="pager-button" :disabled="currentPage >= totalPages" @click="goToPage(currentPage + 1)">
            Siguiente
          </button>
        </div>
        <p class="results-copy">
          Mostrando {{ paginationStart }} a {{ paginationEnd }} de {{ activeCollectionLength }} resultados
        </p>
      </div>
    </div>

    <div v-else-if="activeTab === 'provider-payments'" class="surface table-panel">
      <div class="panel-head">
        <div>
          <span class="eyebrow">Cobros del proveedor</span>
          <h3>Vista compacta de cobros por aeronave</h3>
        </div>
        <p>{{ providerPaymentRows.length }} registro(s)</p>
      </div>

      <div class="provider-payments-summary">
        <article v-for="card in providerPaymentSummaryCards" :key="card.label" class="surface provider-payments-summary__card">
          <span>{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
          <small>{{ card.detail }}</small>
        </article>
      </div>

      <div v-if="providerPaymentRows.length" class="provider-payments-layout">
        <div class="table-wrap provider-payments-table-wrap">
          <table class="admin-table provider-payments-table">
            <thead>
              <tr>
                <th>Aeronave</th>
                <th>Proveedor</th>
                <th>Estado</th>
                <th>Monto</th>
                <th>Ultimo cobro</th>
                <th>Vigencia</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in paginatedProviderPaymentRows"
                :key="row.id"
                class="provider-payments-table__row"
                :class="{ 'is-active': String(selectedProviderPaymentId) === String(row.id) }"
                @click="selectedProviderPaymentId = String(row.id)"
              >
                <td>
                  <div class="provider-payments-table__aircraft">
                    <img
                      v-if="hasRenderableAircraftImage(row)"
                      :src="row.aircraftImage"
                      :alt="row.aircraftName"
                      loading="lazy"
                      @error="markAircraftImageError(row.id)"
                    />
                    <div v-else class="provider-payment-card__placeholder provider-payments-table__placeholder">
                      {{ getAircraftBadge(row) }}
                    </div>
                    <div class="stack-cell">
                      <strong>{{ row.aircraftName }}</strong>
                      <small>{{ row.aircraftLabel }} · {{ row.aircraftBase }}</small>
                    </div>
                  </div>
                </td>
                <td>
                  <div class="stack-cell">
                    <strong>{{ row.providerName }}</strong>
                    <small>{{ row.providerEmail || 'Sin correo visible' }}</small>
                  </div>
                </td>
                <td>
                  <span :class="['status-pill', paymentTone(row.status)]">
                    {{ paymentLabel(row.status) }}
                  </span>
                  <small class="provider-payments-table__meta">{{ row.renewalReminderLabel }}</small>
                </td>
                <td>
                  <div class="stack-cell">
                    <strong>{{ formatMoney(row.amount, row.currency) }}</strong>
                    <small>{{ row.planName }}</small>
                  </div>
                </td>
                <td>{{ formatDate(row.paidAt, { compact: true, withTime: true }) }}</td>
                <td>{{ formatDate(row.endsAt, { compact: true }) }}</td>
               
              </tr>
            </tbody>
          </table>
        </div>

        <aside v-if="selectedProviderPayment" class="surface provider-payment-detail">
          <div class="provider-payment-detail__hero">
            <div class="provider-payment-detail__hero-media">
              <img
                v-if="hasRenderableAircraftImage(selectedProviderPayment)"
                :src="selectedProviderPayment.aircraftImage"
                :alt="selectedProviderPayment.aircraftName"
                loading="lazy"
                @error="markAircraftImageError(selectedProviderPayment.id)"
              />
              <div v-else class="provider-payment-card__placeholder provider-payment-card__placeholder--large">
                {{ getAircraftBadge(selectedProviderPayment) }}
              </div>
            </div>

            <div class="provider-payment-detail__hero-copy">
              <span class="eyebrow">Detalle seleccionado</span>
              <h4>{{ selectedProviderPayment.aircraftName }}</h4>
              <p>{{ selectedProviderPayment.aircraftLabel }} · {{ selectedProviderPayment.aircraftModel }}</p>
              <div class="provider-payment-detail__badges">
                <span :class="['status-pill', paymentTone(selectedProviderPayment.status)]">
                  {{ paymentLabel(selectedProviderPayment.status) }}
                </span>
                <span :class="['status-pill', selectedProviderPayment.aircraftApproved ? 'success' : 'warn']">
                  {{ selectedProviderPayment.aircraftApproved ? 'Aeronave aprobada' : 'Revision operativa' }}
                </span>
                <span :class="['status-pill', selectedProviderPayment.renewalTone]">
                  {{ selectedProviderPayment.renewalModeLabel }}
                </span>
              </div>
            </div>
          </div>

          <article class="provider-payment-detail__renewal-note" :data-tone="selectedProviderPayment.renewalTone">
            <span>Renovacion</span>
            <strong>{{ selectedProviderPayment.renewalReminderLabel }}</strong>
            <small>
              {{ selectedProviderPayment.autoRenewEnabled ? 'Stripe puede renovar esta suscripcion automaticamente.' : 'Esta aeronave requiere renovacion manual antes del vencimiento.' }}
              {{ selectedProviderPayment.paymentMethodReady ? ' Metodo de pago visible.' : ' Metodo de pago no confirmado.' }}
            </small>
          </article>

          <div class="provider-payment-detail__grid">
            <article class="provider-payment-detail__block">
              <span>Proveedor</span>
              <strong>{{ selectedProviderPayment.providerName }}</strong>
              <small>{{ selectedProviderPayment.providerEmail || 'Sin correo visible' }}</small>
            </article>
            <article class="provider-payment-detail__block">
              <span>Base operativa</span>
              <strong>{{ selectedProviderPayment.aircraftBase }}</strong>
              <small>{{ selectedProviderPayment.aircraftCategory }}</small>
            </article>
            <article class="provider-payment-detail__block">
              <span>Plan</span>
              <strong>{{ selectedProviderPayment.planName }}</strong>
              <small>{{ String(selectedProviderPayment.paymentProvider || 'stripe').toUpperCase() }}</small>
            </article>
            <article class="provider-payment-detail__block">
              <span>Monto mensual</span>
              <strong>{{ formatMoney(selectedProviderPayment.amount, selectedProviderPayment.currency) }}</strong>
              <small>Estatus operativo: {{ selectedProviderPayment.operationalStatus }}</small>
            </article>
          </div>

          <div class="provider-payment-detail__ledger">
            <article class="provider-payment-detail__line">
              <span>Referencia de pago</span>
              <strong>{{ selectedProviderPayment.paymentReference }}</strong>
            </article>
            <article class="provider-payment-detail__line">
              <span>Stripe subscription</span>
              <strong>{{ selectedProviderPayment.providerSubscriptionId }}</strong>
            </article>
            <article class="provider-payment-detail__line">
              <span>Checkout / session</span>
              <strong>{{ selectedProviderPayment.checkoutId }}</strong>
            </article>
            <article class="provider-payment-detail__line">
              <span>Vigencia backend</span>
              <strong>{{ formatDate(selectedProviderPayment.startsAt, { compact: true }) }} - {{ formatDate(selectedProviderPayment.endsAt, { compact: true }) }}</strong>
            </article>
            <article class="provider-payment-detail__line">
              <span>Modo de renovacion</span>
              <strong>{{ selectedProviderPayment.renewalModeLabel }}</strong>
            </article>
          </div>

          <div class="provider-payment-detail__timeline">
            <h5>Timeline de cobro</h5>
            <article
              v-for="entry in selectedProviderPaymentTimeline"
              :key="entry.id"
              class="provider-payment-detail__timeline-item"
              :data-state="entry.state"
            >
              <span class="provider-payment-detail__timeline-dot"></span>
              <div>
                <strong>{{ entry.label }}</strong>
                <p>{{ entry.date }}</p>
                <small>{{ entry.detail }}</small>
              </div>
            </article>
          </div>

          <div class="provider-payment-detail__actions">
            <button type="button" class="ghost-button" @click="openSelectedProviderAircraft(selectedProviderPayment)">
              Ver aeronave
            </button>
            <button type="button" class="ghost-button" @click="openSelectedProviderProfile(selectedProviderPayment)">
              Ver proveedor
            </button>
            <button type="button" class="ghost-button" @click="openSelectedProviderSubscription(selectedProviderPayment)">
              Ir a suscripcion
            </button>
            <button type="button" class="ghost-button" @click="openEvidenceModal(selectedProviderPayment, 'provider')">
              Ver evidencia completa
            </button>
          </div>
        </aside>
      </div>

      <div v-else class="table-wrap">
        <table class="admin-table">
          <tbody>
            <tr>
              <td colspan="8" class="empty-cell">Aun no hay pagos de proveedor ligados a aeronaves.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="panel-footer">
        <div class="pagination-bar">
          <button type="button" class="pager-button" :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">
            Anterior
          </button>
          <span>Pagina {{ currentPage }}</span>
          <button type="button" class="pager-button" :disabled="currentPage >= totalPages" @click="goToPage(currentPage + 1)">
            Siguiente
          </button>
        </div>
        <p class="results-copy">
          Mostrando {{ paginationStart }} a {{ paginationEnd }} de {{ activeCollectionLength }} resultados
        </p>
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

      <div class="panel-footer">
        <div class="pagination-bar">
          <button type="button" class="pager-button" :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">
            Anterior
          </button>
          <span>Pagina {{ currentPage }}</span>
          <button type="button" class="pager-button" :disabled="currentPage >= totalPages" @click="goToPage(currentPage + 1)">
            Siguiente
          </button>
        </div>
        <p class="results-copy">
          Mostrando {{ paginationStart }} a {{ paginationEnd }} de {{ activeCollectionLength }} resultados
        </p>
      </div>
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
  color: #111111;
}

.surface {
  background: #ffffff;
  border: 1px solid rgba(168, 140, 69, 0.16);
  border-radius: 20px;
  box-shadow: 0 18px 40px rgba(26, 22, 16, 0.05);
}

.subscriptions-hero,
.toolbar,
.table-panel {
  padding: 1.25rem;
}

.subscriptions-hero {
  display: flex;
  justify-content: space-between;
  gap: 1.25rem;
  align-items: center;
}

.subscriptions-hero__copy {
  max-width: 44rem;
}

.subscriptions-hero h2,
.panel-head h3 {
  margin: 0.25rem 0 0.35rem;
  font-size: clamp(1.9rem, 3vw, 2.5rem);
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
  gap: 0.55rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.tab-button {
  border: 1px solid rgba(33, 30, 26, 0.12);
  background: #f6f2e8;
  color: #1f1b17;
  border-radius: 999px;
  padding: 0.72rem 1rem;
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
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0.85rem;
}

.summary-card {
  padding: 1rem;
  display: grid;
  gap: 0.3rem;
}

.summary-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 14px;
  background: #f3f6fc;
  font-size: 1.15rem;
}

.summary-card span,
.summary-card small {
  color: #6f6a61;
}

.summary-card strong {
  font-size: 1.85rem;
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
  grid-template-columns: minmax(260px, 1fr) repeat(3, minmax(140px, 200px)) auto;
  gap: 0.85rem;
}

.toolbar-field {
  display: grid;
  gap: 0.35rem;
  color: #111111;
  font-weight: 700;
}

.toolbar-field input,
.toolbar-field select {
  width: 100%;
  border-radius: 16px;
  border: 1px solid rgba(33, 30, 26, 0.12);
  background: #fffdf9;
  padding: 0.85rem 0.95rem;
  font: inherit;
  color: #1f1b17;
}

.table-panel {
  display: grid;
  gap: 1rem;
}

.panel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-top: 0.35rem;
}

.results-copy {
  margin: 0;
  color: #5f6774;
  font-weight: 600;
}

.provider-payments-summary {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.75rem;
}

.provider-payments-summary__card {
  padding: 0.85rem 0.95rem;
  display: grid;
  gap: 0.25rem;
}

.provider-payments-summary__card span,
.provider-payments-summary__card small {
  color: #111111;
}

.provider-payments-summary__card strong {
  color: #111111;
  font-size: 1.2rem;
}

.provider-payments-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(340px, 0.85fr);
  gap: 0.9rem;
  align-items: start;
}

.provider-payments-table-wrap {
  max-height: 72vh;
  overflow: auto;
  border: 1px solid rgba(33, 30, 26, 0.08);
  border-radius: 18px;
  background: #fffdf9;
}

.provider-payments-table {
  min-width: 860px;
}

.provider-payments-table__row {
  cursor: pointer;
  transition:
    background-color 0.16s ease,
    box-shadow 0.16s ease;
}

.provider-payments-table__row:hover,
.provider-payments-table__row.is-active {
  background: #fbf4e6;
}

.provider-payments-table__meta {
  display: block;
  margin-top: 0.35rem;
  color: #6f6a61;
}

.provider-payments-table__aircraft {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: 0.7rem;
  align-items: center;
}

.provider-payments-table__aircraft img,
.provider-payment-detail__hero-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  background: #f2ede3;
}

.provider-payments-table__aircraft img,
.provider-payments-table__placeholder {
  width: 52px;
  height: 52px;
  border-radius: 12px;
}

.provider-payment-card__placeholder {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #1b395c 0%, #284d74 65%, #c8a96b 100%);
  color: #fff8ef;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.provider-payment-card__placeholder--large {
  min-height: 8.5rem;
  border-radius: 18px;
}

.provider-payment-detail,
.provider-payment-detail__grid,
.provider-payment-detail__timeline {
  display: grid;
  gap: 0.7rem;
}

.provider-payment-detail__actions {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;
}

.provider-payment-detail__hero-copy p,
.provider-payment-detail__timeline-item p,
.provider-payment-detail__timeline-item small {
  margin: 0;
  color: #111111;
}

.provider-payment-detail__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.45rem;
}

.provider-payment-detail__renewal-note {
  display: grid;
  gap: 0.25rem;
  padding: 0.8rem 0.9rem;
  border-radius: 16px;
  border: 1px solid rgba(33, 30, 26, 0.08);
  background: #fffdf9;
}

.provider-payment-detail__renewal-note[data-tone='success'] {
  background: #edfdf3;
  border-color: rgba(31, 122, 70, 0.18);
}

.provider-payment-detail__renewal-note[data-tone='warn'] {
  background: #fff6df;
  border-color: rgba(176, 107, 0, 0.18);
}

.provider-payment-detail__renewal-note[data-tone='danger'] {
  background: #ffece8;
  border-color: rgba(192, 57, 43, 0.18);
}

.provider-payment-detail__renewal-note[data-tone='info'] {
  background: #eef4fa;
  border-color: rgba(27, 57, 92, 0.16);
}

.provider-payment-detail__block,
.provider-payment-detail__line {
  display: grid;
  gap: 0.2rem;
  padding: 0.6rem 0.7rem;
  border-radius: 14px;
  background: rgba(246, 242, 232, 0.55);
}

.provider-payment-detail__block span,
.provider-payment-detail__line span {
  color: #111111;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.provider-payment-detail strong,
.provider-payment-detail h4,
.provider-payment-detail h5,
.provider-payment-detail p,
.provider-payment-detail small,
.provider-payment-detail span {
  color: #111111;
}

.provider-payment-detail {
  position: sticky;
  top: 1rem;
  padding: 0.95rem;
}

.provider-payment-detail__hero {
  display: grid;
  grid-template-columns: 116px minmax(0, 1fr);
  gap: 0.85rem;
  align-items: center;
}

.provider-payment-detail__hero-media {
  overflow: hidden;
  border-radius: 18px;
  background: #efe7da;
  min-height: 7rem;
  border: 1px solid rgba(33, 30, 26, 0.08);
}

.provider-payment-detail__hero-copy h4,
.provider-payment-detail__timeline h5 {
  margin: 0;
  color: #111111;
}

.provider-payment-detail__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.provider-payment-detail__ledger {
  display: grid;
  gap: 0.45rem;
}

.provider-payment-detail__timeline-item {
  position: relative;
  display: grid;
  grid-template-columns: 0.8rem minmax(0, 1fr);
  gap: 0.65rem;
}

.provider-payment-detail__timeline-item:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 1rem;
  left: 0.42rem;
  width: 1px;
  height: calc(100% + 0.75rem);
  background: rgba(160, 121, 29, 0.22);
}

.provider-payment-detail__timeline-dot {
  position: relative;
  z-index: 1;
  width: 0.75rem;
  height: 0.75rem;
  margin-top: 0.2rem;
  border: 2px solid #c8a96b;
  border-radius: 999px;
  background: #fffdf9;
}

.provider-payment-detail__timeline-item[data-state='done'] .provider-payment-detail__timeline-dot {
  border-color: #1f7a46;
  background: #1f7a46;
}

.provider-payment-detail__timeline-item[data-state='current'] .provider-payment-detail__timeline-dot {
  border-color: #a0791d;
  background: #fff1c4;
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
.danger-button,
.icon-button,
.menu-item {
  border: 1px solid rgba(33, 30, 26, 0.12);
  border-radius: 14px;
  padding: 0.72rem 0.9rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.export-button,
.pager-button,
.ghost-button,
.icon-button,
.menu-item {
  background: #fffdf9;
  color: #1f1b17;
}

.ghost-button--primary {
  background: #eef4ff;
  color: #1d4ed8;
  border-color: rgba(29, 78, 216, 0.18);
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
  padding: 0.8rem 0.9rem;
  border-bottom: 1px solid rgba(33, 30, 26, 0.08);
}

.admin-table td {
  padding: 0.9rem;
  border-bottom: 1px solid rgba(33, 30, 26, 0.06);
  vertical-align: middle;
  color: #211d19;
}

.primary-cell,
.stack-cell {
  display: grid;
  gap: 0.2rem;
}

.client-cell {
  display: grid;
  grid-template-columns: 2.75rem minmax(0, 1fr);
  gap: 0.75rem;
  align-items: center;
}

.client-avatar {
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 999px;
  background: linear-gradient(135deg, #f4e8ff 0%, #eceeff 100%);
  color: #27344a;
  font-weight: 800;
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

.row-actions--compact {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
}

.row-actions__menu-wrap {
  position: relative;
}

.row-actions__menu {
  position: absolute;
  top: calc(100% + 0.45rem);
  right: 0;
  z-index: 5;
  display: grid;
  gap: 0.3rem;
  min-width: 12rem;
  padding: 0.45rem;
  border-radius: 16px;
  border: 1px solid rgba(33, 30, 26, 0.12);
  background: #ffffff;
  box-shadow: 0 16px 36px rgba(20, 18, 16, 0.12);
}

.menu-item {
  width: 100%;
  text-align: left;
  padding: 0.72rem 0.8rem;
}

.menu-item--danger {
  color: #b42318;
  background: #fff4f2;
  border-color: rgba(180, 35, 24, 0.14);
}

.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.8rem;
  min-height: 2.8rem;
  padding: 0.5rem;
  font-size: 1rem;
}

.pagination-bar {
  display: flex;
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

  .summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .hero-actions {
    justify-content: flex-start;
  }

  .toolbar {
    grid-template-columns: 1fr;
  }

  .provider-payments-summary,
  .provider-payments-layout,
  .provider-payment-detail__hero,
  .provider-payment-detail__grid {
    grid-template-columns: 1fr;
  }

  .toolbar-actions,
  .pagination-bar {
    justify-content: flex-start;
  }

  .panel-footer {
    flex-direction: column;
    align-items: flex-start;
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

@media (max-width: 720px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .row-actions--compact {
    justify-content: flex-start;
  }
}

@media (max-width: 560px) {
  .summary-grid {
    grid-template-columns: 1fr;
  }

  .client-cell {
    grid-template-columns: 1fr;
  }
}
</style>
