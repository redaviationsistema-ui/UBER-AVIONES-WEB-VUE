<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import ClientContractPreview from '../client/ClientContractPreview.vue'
import { resolveRoleSectionPath } from '../../data/roleFlows'

const props = defineProps({
  contracts: { type: Array, default: () => [] },
})

const router = useRouter()

const filters = ref({
  query: '',
  status: 'all',
  client: 'all',
  provider: 'all',
})

const selectedContractId = ref('')
const detailModalOpen = ref(false)
const detailTab = ref('summary')

const normalizedContracts = computed(() =>
  [...props.contracts]
    .map((contract) => ({
      ...contract,
      _sortDate:
        contract?.signed_at ||
        contract?.generated_at ||
        contract?.updated_at ||
        contract?.created_at ||
        '',
    }))
    .sort((left, right) => String(right._sortDate || '').localeCompare(String(left._sortDate || ''))),
)

const clientOptions = computed(() =>
  [
    ...new Set(
      normalizedContracts.value
        .map((contract) => String(contract?.reservation?.client?.name || '').trim())
        .filter(Boolean),
    ),
  ].sort((left, right) => left.localeCompare(right, 'es')),
)

const providerOptions = computed(() =>
  [
    ...new Set(
      normalizedContracts.value
        .map((contract) =>
          String(
            contract?.reservation?.provider_name ||
              contract?.reservation?.operator_name ||
              contract?.terms_snapshot?.provider_name ||
              '',
          ).trim(),
        )
        .filter(Boolean),
    ),
  ].sort((left, right) => left.localeCompare(right, 'es')),
)

const filteredContracts = computed(() => {
  const query = String(filters.value.query || '')
    .trim()
    .toLowerCase()
  const status = String(filters.value.status || 'all')
  const client = String(filters.value.client || 'all')
  const provider = String(filters.value.provider || 'all')

  return normalizedContracts.value.filter((contract) => {
    const searchable = [
      contract.contract_code,
      contract.reservation?.reservation_code,
      contract.reservation?.client?.name,
      contract.reservation?.client?.email,
      contract.reservation?.aircraft?.model,
      contract.reservation?.provider_name,
      contract.reservation?.operator_name,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    const contractStatus = resolveDashboardStatus(contract)
    const contractClient = String(contract?.reservation?.client?.name || '').trim()
    const contractProvider = String(
      contract?.reservation?.provider_name ||
        contract?.reservation?.operator_name ||
        contract?.terms_snapshot?.provider_name ||
        '',
    ).trim()

    return (
      (!query || searchable.includes(query)) &&
      (status === 'all' || contractStatus === status) &&
      (client === 'all' || contractClient === client) &&
      (provider === 'all' || contractProvider === provider)
    )
  })
})

const selectedContract = computed(() => {
  const targetId = String(selectedContractId.value || '').trim()
  if (!targetId) return filteredContracts.value[0] || normalizedContracts.value[0] || null

  return (
    normalizedContracts.value.find((contract) => String(contract.id || '') === targetId) ||
    filteredContracts.value[0] ||
    normalizedContracts.value[0] ||
    null
  )
})

const selectedReservation = computed(() => buildContractReservation(selectedContract.value))
const selectedCustomerName = computed(
  () =>
    selectedReservation.value?.client_name ||
    selectedReservation.value?.customer_name ||
    selectedReservation.value?.company_name ||
    'Cliente de SKY Group',
)

const dashboardSignals = computed(() => {
  const items = filteredContracts.value
  const total = items.length
  const pending = items.filter((item) => resolveDashboardStatus(item) === 'pending').length
  const signed = items.filter((item) => resolveDashboardStatus(item) === 'signed').length
  const inOperation = items.filter((item) => resolveDashboardStatus(item) === 'operating').length
  const cancelled = items.filter((item) => resolveDashboardStatus(item) === 'cancelled').length

  return [
    { label: 'Total', value: String(total), detail: 'Contratos visibles con filtros activos.' },
    { label: 'Pendientes', value: String(pending), detail: 'Pendientes por firma o envio.' },
    { label: 'Firmados', value: String(signed), detail: 'Listos para continuar flujo comercial.' },
    { label: 'En operación', value: String(inOperation), detail: 'Con pago o vuelo ya en marcha.' },
    { label: 'Cancelados', value: String(cancelled), detail: 'Documentos anulados o sustituidos.' },
  ]
})

const selectedTimeline = computed(() => buildContractTimeline(selectedContract.value, selectedReservation.value))
const selectedAuditTrail = computed(() =>
  buildAuditTrail(selectedContract.value, selectedReservation.value, selectedTimeline.value),
)

watch(
  filteredContracts,
  (contracts) => {
    if (!contracts.length) {
      selectedContractId.value = ''
      detailModalOpen.value = false
      return
    }

    const hasSelection = contracts.some(
      (contract) => String(contract.id || '') === String(selectedContractId.value || ''),
    )

    if (!hasSelection && !selectedContractId.value) {
      selectedContractId.value = String(contracts[0].id || '')
    }
  },
  { immediate: true },
)

function normalizeContractStatus(status) {
  const value = String(status || '').trim().toLowerCase()
  if (['signed', 'firmado', 'firmada'].includes(value)) return 'signed'
  if (['cancelled', 'canceled', 'cancelado', 'cancelada', 'void'].includes(value)) return 'cancelled'
  if (['draft', 'borrador'].includes(value)) return 'draft'
  if (['generated', 'pending', 'pendiente', 'pending_signature'].includes(value)) return 'pending'
  return value || 'pending'
}

function normalizePaymentStatus(status) {
  const value = String(status || '').trim().toLowerCase()
  if (['paid', 'pagado', 'confirmed', 'payment_confirmed'].includes(value)) return 'paid'
  if (['pending', 'pendiente', 'payment_pending'].includes(value)) return 'pending'
  return value
}

function normalizeWorkflowStatus(status) {
  const value = String(status || '').trim().toLowerCase()
  if (!value) return ''
  if (value.includes('tracking') || value.includes('completed')) return 'tracking'
  if (value.includes('vuelo') || value.includes('flight_confirmed')) return 'flight'
  if (value.includes('payment_confirmed') || value.includes('pago confirmado')) return 'payment_confirmed'
  if (value.includes('payment_pending') || value.includes('pago pendiente')) return 'payment_pending'
  if (value.includes('contract_signed') || value.includes('contrato firmado')) return 'contract_signed'
  if (value.includes('contract_pending') || value.includes('contrato pendiente')) return 'contract_pending'
  return value
}

function resolveDashboardStatus(contract) {
  const contractStatus = normalizeContractStatus(contract?.status)
  const reservation = contract?.reservation || {}
  const paymentStatus = normalizePaymentStatus(
    reservation?.payment_status || reservation?.payment_order?.status || '',
  )
  const workflowStatus = normalizeWorkflowStatus(
    reservation?.workflow_status || reservation?.status || '',
  )

  if (contractStatus === 'cancelled') return 'cancelled'
  if (workflowStatus === 'tracking' || workflowStatus === 'flight' || paymentStatus === 'paid') {
    return 'operating'
  }
  if (contractStatus === 'signed' || workflowStatus === 'contract_signed') return 'signed'
  if (contractStatus === 'draft') return 'draft'
  return 'pending'
}

function statusMeta(contract) {
  const status = resolveDashboardStatus(contract)

  if (status === 'signed') {
    return { label: 'Firmado', tone: 'success' }
  }
  if (status === 'operating') {
    return { label: 'En operación', tone: 'info' }
  }
  if (status === 'cancelled') {
    return { label: 'Cancelado', tone: 'danger' }
  }
  if (status === 'draft') {
    return { label: 'Borrador', tone: 'neutral' }
  }
  return { label: 'Pendiente por firmar', tone: 'warn' }
}

function formatMoney(value, currency = 'MXN') {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return 'Sin monto'

  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: currency || 'MXN',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(value) {
  if (!value) return 'Sin fecha'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function selectContract(contract) {
  selectedContractId.value = String(contract?.id || '')
}

function openContractDetail(contract, tab = 'summary') {
  selectContract(contract)
  detailTab.value = tab
  detailModalOpen.value = true
}

function closeContractDetail() {
  detailModalOpen.value = false
}

function handleContractAction(action) {
  if (!selectedContract.value) return

  if (action === 'summary') {
    detailTab.value = 'summary'
    return
  }

  if (action === 'document') {
    detailTab.value = 'document'
    return
  }

  if (action === 'history') {
    detailTab.value = 'history'
    return
  }

  if (action === 'payment') {
    router.push(resolveRoleSectionPath('admin', 'pagos'))
  }
}

function buildContractReservation(contract) {
  if (!contract || typeof contract !== 'object') return null

  const reservation =
    contract.reservation && typeof contract.reservation === 'object' ? contract.reservation : {}
  const client = reservation.client && typeof reservation.client === 'object' ? reservation.client : {}
  const aircraft =
    reservation.aircraft && typeof reservation.aircraft === 'object' ? reservation.aircraft : {}
  const termsSnapshot =
    contract.terms_snapshot && typeof contract.terms_snapshot === 'object' ? contract.terms_snapshot : {}
  const contractSnapshot =
    termsSnapshot.client_contract_snapshot &&
    typeof termsSnapshot.client_contract_snapshot === 'object'
      ? termsSnapshot.client_contract_snapshot
      : {}

  const representativeName =
    contract?.signed_by?.name ||
    reservation?.client_representative ||
    reservation?.representative_name ||
    client?.name ||
    ''

  return {
    ...reservation,
    id: reservation.id || contract.reservation_id || contract.id,
    contract,
    reservation_code:
      reservation.reservation_code ||
      contractSnapshot.reservation_code ||
      `RES-${contract.reservation_id || contract.id}`,
    contract_status: contract.status || reservation.contract_status || '',
    client_name: client.name || reservation.client_name || reservation.customer_name || '',
    customer_name: client.name || reservation.customer_name || reservation.client_name || '',
    company_name: client.company_name || client.name || reservation.company_name || '',
    client_address:
      client.address ||
      reservation.client_address ||
      reservation.billing_address ||
      contractSnapshot.customer_address ||
      '',
    client_representative: representativeName,
    representative_name: representativeName,
    customer_email: client.email || reservation.customer_email || '',
    date:
      reservation.date ||
      reservation.departure_date ||
      reservation.departure_at ||
      contractSnapshot.departure_date ||
      contract.generated_at ||
      '',
    aircraft:
      aircraft.model ||
      reservation.aircraft_model ||
      reservation.aircraft_name ||
      contractSnapshot.aircraft ||
      reservation.aircraft ||
      '',
    aircraft_registration:
      aircraft.registration || aircraft.tail_number || reservation.aircraft_registration || '',
    assigned_aircraft_model:
      aircraft.model || reservation.assigned_aircraft_model || reservation.aircraft_model || '',
    aircraft_model: aircraft.model || reservation.aircraft_model || '',
    aircraft_category:
      aircraft.category || reservation.aircraft_category || contractSnapshot.aircraft_category || '',
    aircraft_capacity: aircraft.capacity || reservation.aircraft_capacity || '',
    flight_package:
      reservation.flight_package || reservation.service_tier || contractSnapshot.service_tier || '',
    service_tier:
      reservation.service_tier || reservation.flight_package || contractSnapshot.service_tier || '',
    operator:
      reservation.operator_name ||
      reservation.provider_name ||
      reservation.operator?.name ||
      contractSnapshot.operator ||
      '',
    provider_name:
      reservation.provider_name || reservation.operator_name || reservation.operator?.name || '',
    total_amount: reservation.total_amount || termsSnapshot.total_amount || termsSnapshot.amount || '',
    final_price_display:
      reservation.final_price_display ||
      reservation.formatted_final_price ||
      (Number(reservation.total_amount || termsSnapshot.total_amount || termsSnapshot.amount || 0) > 0
        ? formatMoney(
            reservation.total_amount || termsSnapshot.total_amount || termsSnapshot.amount,
            reservation.currency,
          )
        : ''),
    currency: reservation.currency || 'MXN',
    passengers: reservation.passengers || contractSnapshot.passengers || '',
    itinerary_segments:
      reservation.itinerary_segments ||
      contractSnapshot.itinerary_segments ||
      reservation.route_segments ||
      [],
    created_at: reservation.created_at || contract.created_at || '',
    updated_at: reservation.updated_at || contract.updated_at || '',
  }
}

function buildContractTimeline(contract, reservation) {
  if (!contract) return []

  const paymentStatus = normalizePaymentStatus(
    reservation?.payment_status || reservation?.payment_order?.status || '',
  )
  const workflowStatus = normalizeWorkflowStatus(
    reservation?.workflow_status || reservation?.status || '',
  )

  const steps = [
    {
      title: 'Cotización creada',
      description: 'La reserva comercial ya tiene ruta, cliente y condiciones base.',
      when: reservation?.created_at || contract?.created_at || '',
      done: Boolean(reservation?.created_at || contract?.created_at),
    },
    {
      title: 'Contrato generado',
      description: 'El documento legal se armó con datos comerciales y operativos.',
      when: contract?.generated_at || contract?.created_at || '',
      done: Boolean(contract?.generated_at || contract?.created_at),
    },
    {
      title: 'Enviado al cliente',
      description: 'El contrato quedó listo para revisión y proceso de firma.',
      when: contract?.sent_at || contract?.updated_at || '',
      done: Boolean(contract?.sent_at || contract?.updated_at),
    },
    {
      title: 'Firmado',
      description: 'El cliente ya confirmó el contrato.',
      when: contract?.signed_at || reservation?.contract_signed_at || '',
      done:
        normalizeContractStatus(contract?.status) === 'signed' ||
        workflowStatus === 'contract_signed' ||
        Boolean(contract?.signed_at || reservation?.contract_signed_at),
    },
    {
      title: 'Pago recibido',
      description: 'El área comercial ya tiene confirmación de pago.',
      when: reservation?.payment_confirmed_at || reservation?.updated_at || '',
      done: paymentStatus === 'paid' || workflowStatus === 'payment_confirmed',
    },
    {
      title: 'Vuelo confirmado',
      description: 'La operación ya avanzó a liberación o confirmación de vuelo.',
      when: reservation?.flight_confirmed_at || reservation?.updated_at || '',
      done: ['flight', 'tracking'].includes(workflowStatus),
    },
    {
      title: 'Operación completada',
      description: 'El servicio quedó cerrado dentro del flujo operativo.',
      when: reservation?.completed_at || '',
      done: workflowStatus === 'tracking' && Boolean(reservation?.completed_at),
    },
  ]

  const firstPendingIndex = steps.findIndex((step) => !step.done)

  return steps.map((step, index) => ({
    ...step,
    state: step.done ? 'done' : index === firstPendingIndex ? 'active' : 'todo',
  }))
}

function buildAuditTrail(contract, reservation, timeline) {
  const raw = [
    {
      label: 'Creado por',
      value: contract?.created_by?.name || contract?.signed_by?.name || 'Sistema / comercial',
      at: contract?.created_at || contract?.generated_at || '',
    },
    {
      label: 'Última edición',
      value: contract?.updated_by?.name || 'Panel admin',
      at: contract?.updated_at || '',
    },
    {
      label: 'Cliente abrió contrato',
      value: contract?.opened_by?.name || selectedCustomerName.value,
      at: contract?.opened_at || '',
    },
    {
      label: 'Firma registrada',
      value: contract?.signed_by?.name || reservation?.client_representative || 'Cliente',
      at: contract?.signed_at || reservation?.contract_signed_at || '',
    },
  ]
    .filter((item) => item.at || item.label === 'Creado por')
    .map((item, index) => ({
      id: `${item.label}-${index}`,
      ...item,
    }))

  if (raw.length) return raw

  return timeline
    .filter((item) => item.done)
    .map((item, index) => ({
      id: `${item.title}-${index}`,
      label: item.title,
      value: 'Bitácora automática',
      at: item.when,
    }))
}
</script>

<template>
  <div class="admin-contracts-page">
    <section class="dashboard-hero">
      <div class="hero-center hero-compact">
        <p class="eyebrow dark-eyebrow">Contratos</p>
        <h1>Centro de control contractual</h1>
        <p class="hero-subtitle">
          La pantalla principal ahora vive como dashboard: búsqueda, filtros, estados, acciones y
          detalle operativo sin incrustar el documento completo en la lista.
        </p>
      </div>
    </section>

    <section class="status-strip">
      <article v-for="item in dashboardSignals" :key="item.label" class="signal-card">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <p>{{ item.detail }}</p>
      </article>
    </section>

    <section class="contracts-dashboard">
      <section class="filters-panel">
        <div class="filters-copy">
          <h2>Dashboard de contratos</h2>
          <p>Busca, filtra y entra al detalle operativo de cada contrato sin saturar la vista.</p>
        </div>

        <div class="filters-grid">
          <label class="filter-field filter-field--wide">
            <span>Buscar contrato</span>
            <input v-model="filters.query" type="search" placeholder="Folio, cliente, aeronave o correo" />
          </label>

          <label class="filter-field">
            <span>Estado</span>
            <select v-model="filters.status">
              <option value="all">Todos</option>
              <option value="draft">Borrador</option>
              <option value="pending">Pendiente por firmar</option>
              <option value="signed">Firmado</option>
              <option value="operating">En operación</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </label>

          <label class="filter-field">
            <span>Cliente</span>
            <select v-model="filters.client">
              <option value="all">Todos</option>
              <option v-for="item in clientOptions" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>

          <label class="filter-field">
            <span>Proveedor</span>
            <select v-model="filters.provider">
              <option value="all">Todos</option>
              <option v-for="item in providerOptions" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>
        </div>
      </section>

      <section class="table-shell">
        <div class="contracts-table">
          <div class="table-head">
            <span>Folio</span>
            <span>Cliente</span>
            <span>Aeronave</span>
            <span>Total</span>
            <span>Estado</span>
            <span>Fecha</span>
            <span>Acciones</span>
          </div>

          <div class="table-body">
            <article v-for="contract in filteredContracts" :key="contract.id" class="table-row">
              <div class="row-block">
                <strong>{{ contract.contract_code || `CTR-${contract.id}` }}</strong>
                <small>{{ contract.reservation?.reservation_code || `RES-${contract.reservation_id}` }}</small>
              </div>

              <div class="row-block">
                <strong>{{ contract.reservation?.client?.name || 'Sin cliente' }}</strong>
                <small>{{ contract.reservation?.client?.email || 'Sin correo' }}</small>
              </div>

              <div class="row-block">
                <strong>{{ contract.reservation?.aircraft?.model || 'Sin aeronave' }}</strong>
                <small>{{ contract.reservation?.aircraft?.registration || contract.reservation?.aircraft?.tail_number || 'Sin matricula' }}</small>
                <small>{{ contract.reservation?.provider_name || contract.reservation?.operator_name || 'Sin proveedor' }}</small>
              </div>

              <div class="row-block">
                <strong>{{ formatMoney(contract.reservation?.total_amount, contract.reservation?.currency) }}</strong>
                <small>{{ contract.reservation?.currency || 'MXN' }}</small>
              </div>

              <span class="status-pill" :class="`status-pill--${statusMeta(contract).tone}`">
                {{ statusMeta(contract).label }}
              </span>

              <div class="row-block">
                <strong>{{ formatDate(contract.signed_at || contract.generated_at) }}</strong>
                <small>Actualizado {{ formatDate(contract.updated_at || contract.created_at) }}</small>
              </div>

              <div class="row-actions">
                <button type="button" class="primary-action" @click="openContractDetail(contract, 'summary')">
                  Ver detalle
                </button>
                <button type="button" class="secondary-action" @click="openContractDetail(contract, 'document')">
                  PDF
                </button>
                <details class="actions-menu" @click.stop>
                  <summary>...</summary>
                  <div class="actions-menu__panel">
                    <button type="button" @click="openContractDetail(contract, 'history')">Ver historial</button>
                    <button type="button" @click="openContractDetail(contract, 'summary')">Enviar contrato</button>
                    <button type="button" @click="openContractDetail(contract, 'document')">Solicitar firma</button>
                  </div>
                </details>
              </div>
            </article>
          </div>
        </div>

        <div class="mobile-list">
          <article v-for="contract in filteredContracts" :key="`mobile-${contract.id}`" class="mobile-card">
            <div class="mobile-card__top">
              <div class="row-block">
                <strong>{{ contract.contract_code || `CTR-${contract.id}` }}</strong>
                <small>{{ contract.reservation?.client?.name || 'Sin cliente' }} · {{ contract.reservation?.aircraft?.model || 'Sin aeronave' }}{{ contract.reservation?.aircraft?.registration ? ` · ${contract.reservation.aircraft.registration}` : '' }}</small>
              </div>
              <span class="status-pill" :class="`status-pill--${statusMeta(contract).tone}`">
                {{ statusMeta(contract).label }}
              </span>
            </div>

            <div class="mobile-card__meta">
              <span>{{ formatMoney(contract.reservation?.total_amount, contract.reservation?.currency) }}</span>
              <span>{{ formatDate(contract.signed_at || contract.generated_at) }}</span>
            </div>

            <div class="mobile-card__actions">
              <button type="button" class="primary-action" @click="openContractDetail(contract, 'summary')">
                Ver detalle
              </button>
              <button type="button" class="secondary-action" @click="openContractDetail(contract, 'document')">
                PDF
              </button>
            </div>
          </article>
        </div>

        <div v-if="!filteredContracts.length" class="empty-state">
          No encontramos contratos con esos filtros.
        </div>
      </section>
    </section>

    <div
      v-if="detailModalOpen && selectedContract && selectedReservation"
      class="detail-modal"
      role="dialog"
      aria-modal="true"
      @click.self="closeContractDetail"
    >
      <div class="detail-modal__surface">
        <div class="detail-modal__header">
          <div>
            <p class="eyebrow dark-eyebrow">Detalle de contrato</p>
            <h2>{{ selectedContract.contract_code || `CTR-${selectedContract.id}` }}</h2>
            <p>{{ selectedReservation.reservation_code }} · {{ selectedCustomerName }}</p>
          </div>
          <button type="button" class="close-button" @click="closeContractDetail">Cerrar</button>
        </div>

        <div class="detail-tabs">
          <button
            v-for="tab in [
              { key: 'summary', label: 'Resumen' },
              { key: 'document', label: 'PDF' },
              { key: 'history', label: 'Historial' },
            ]"
            :key="tab.key"
            type="button"
            :class="{ active: detailTab === tab.key }"
            @click="detailTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>

        <section v-if="detailTab === 'summary'" class="detail-panel">
          <div class="summary-grid">
            <article class="summary-card">
              <span>Cliente</span>
              <strong>{{ selectedCustomerName }}</strong>
              <small>{{ selectedReservation.customer_email || 'Sin correo registrado' }}</small>
            </article>
            <article class="summary-card">
              <span>Vuelo</span>
              <strong>{{ selectedReservation.reservation_code }}</strong>
              <small>{{ selectedReservation.date ? formatDate(selectedReservation.date) : 'Fecha por confirmar' }}</small>
            </article>
            <article class="summary-card">
              <span>Aeronave</span>
              <strong>{{ selectedReservation.aircraft || 'Por confirmar' }}</strong>
              <small>{{ selectedReservation.aircraft_category || 'Cabina por confirmar' }}</small>
            </article>
            <article class="summary-card">
              <span>Total</span>
              <strong>{{ selectedReservation.final_price_display || formatMoney(selectedReservation.total_amount, selectedReservation.currency) }}</strong>
              <small>{{ statusMeta(selectedContract).label }}</small>
            </article>
          </div>

          <div class="detail-columns">
            <article class="detail-card">
              <h3>Resumen operativo</h3>
              <div class="kv-grid">
                <div><span>Contrato</span><strong>{{ selectedContract.contract_code || `CTR-${selectedContract.id}` }}</strong></div>
                <div><span>Reserva</span><strong>{{ selectedReservation.reservation_code }}</strong></div>
                <div><span>Proveedor</span><strong>{{ selectedReservation.provider_name || selectedReservation.operator || 'Sin proveedor' }}</strong></div>
                <div><span>Servicio</span><strong>{{ selectedReservation.service_tier || 'Sin paquete' }}</strong></div>
                <div><span>Pasajeros</span><strong>{{ selectedReservation.passengers || 'Por confirmar' }}</strong></div>
                <div><span>Dirección cliente</span><strong>{{ selectedReservation.client_address || 'Por confirmar' }}</strong></div>
              </div>
            </article>

            <article class="detail-card">
              <h3>Timeline del proceso</h3>
              <div class="timeline-list">
                <article v-for="item in selectedTimeline" :key="item.title" class="timeline-item">
                  <span class="timeline-dot" :class="`timeline-dot--${item.state}`"></span>
                  <div>
                    <strong>{{ item.title }}</strong>
                    <p>{{ item.description }}</p>
                    <small>{{ item.when ? formatDate(item.when) : 'Pendiente' }}</small>
                  </div>
                </article>
              </div>
            </article>
          </div>
        </section>

        <section v-else-if="detailTab === 'document'" class="detail-panel">
          <ClientContractPreview
            :reservation="selectedReservation"
            :reservation-id="selectedReservation.id"
            :customer-name="selectedCustomerName"
            :read-only="true"
          />
        </section>

        <section v-else class="detail-panel">
          <div class="detail-columns">
            <article class="detail-card">
              <h3>Historial</h3>
              <div class="timeline-list">
                <article v-for="item in selectedAuditTrail" :key="item.id" class="timeline-item">
                  <span class="timeline-dot timeline-dot--done"></span>
                  <div>
                    <strong>{{ item.label }}</strong>
                    <p>{{ item.value }}</p>
                    <small>{{ item.at ? formatDate(item.at) : 'Sin fecha' }}</small>
                  </div>
                </article>
              </div>
            </article>

            <article class="detail-card">
              <h3>Acciones</h3>
              <div class="action-stack">
                <button type="button" class="primary-action" @click="handleContractAction('summary')">Enviar contrato</button>
                <button type="button" class="secondary-action" @click="handleContractAction('document')">Solicitar firma</button>
                <button type="button" class="secondary-action" @click="handleContractAction('payment')">Confirmar pago</button>
                <button type="button" class="secondary-action" @click="handleContractAction('document')">Ver documento</button>
              </div>
            </article>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-contracts-page {
  min-height: 100vh;
  background: #fff;
  color: #111;
}

.dashboard-hero,
.contracts-dashboard {
  padding: 1.5rem clamp(1.25rem, 5vw, 4.5rem);
}

.dashboard-hero {
  display: grid;
  background:
    radial-gradient(circle at top right, rgba(201, 164, 90, 0.12), transparent 18%),
    linear-gradient(180deg, #fff 0%, #faf8f2 100%);
}

.hero-center,
.hero-compact,
.filters-copy,
.filter-field,
.row-block,
.summary-card,
.detail-card,
.timeline-item,
.action-stack {
  display: grid;
  gap: 0.45rem;
}

.hero-compact {
  max-width: 980px;
}

.dark-eyebrow {
  color: #8c6a1f;
}

.hero-center h1,
.filters-copy h2,
.detail-modal__header h2,
.detail-card h3 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: 0;
}

.hero-center h1 {
  font-size: clamp(2.2rem, 5vw, 3.4rem);
  line-height: 1;
}

.hero-subtitle,
.filters-copy p,
.signal-card p,
.filter-field span,
.row-block small,
.summary-card small,
.summary-card span,
.timeline-item p,
.timeline-item small,
.detail-modal__header p {
  margin: 0;
  color: #675f55;
  line-height: 1.6;
}

.status-strip {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 1rem;
  padding: 0 clamp(1.25rem, 5vw, 4.5rem) 1.2rem;
  margin-top: -1rem;
}

.signal-card,
.filters-panel,
.table-shell,
.summary-card,
.detail-card {
  border: 1px solid #ebebeb;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.05);
}

.signal-card {
  padding: 1rem 1.05rem;
}

.signal-card span {
  color: #666;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.signal-card strong {
  font-size: 1.45rem;
  line-height: 1;
}

.contracts-dashboard {
  display: grid;
  gap: 1.25rem;
}

.filters-panel {
  display: grid;
  gap: 1rem;
  padding: 1.15rem;
}

.filters-grid {
  display: grid;
  grid-template-columns: 2fr repeat(3, minmax(0, 1fr));
  gap: 0.85rem;
}

.filter-field {
  min-width: 0;
}

.filter-field--wide {
  grid-column: span 1;
}

.filter-field input,
.filter-field select {
  width: 100%;
  min-height: 3rem;
  border: 1px solid #ddd2be;
  border-radius: 14px;
  background: #fffdf8;
  color: #111;
  padding: 0.75rem 0.9rem;
  font: inherit;
}

.table-shell {
  display: grid;
  gap: 0;
  overflow: hidden;
}

.contracts-table {
  display: block;
}

.table-body {
  display: grid;
}

.table-head,
.table-row {
  display: grid;
  grid-template-columns: 1.1fr 1.2fr 1.1fr 0.9fr 0.9fr 1fr 1.1fr;
  gap: 1rem;
  align-items: center;
  padding: 1rem 1.1rem;
}

.table-head {
  background: #faf7f1;
  color: #736a5c;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.table-row {
  border-top: 1px solid #eee7da;
}

.row-block strong,
.summary-card strong,
.detail-card strong {
  color: #111;
}

.status-pill {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  justify-content: center;
  min-height: 2rem;
  padding: 0 0.75rem;
  border-radius: 999px;
  font-size: 0.74rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.status-pill--warn {
  color: #a34b19;
  background: #f8e5d7;
}

.status-pill--success {
  color: #0f7b53;
  background: #dceee5;
}

.status-pill--danger {
  color: #b42318;
  background: #fee4e2;
}

.status-pill--info {
  color: #175cd3;
  background: #dfeaff;
}

.status-pill--neutral {
  color: #5c6672;
  background: #eef2f6;
}

.row-actions,
.mobile-card__actions,
.detail-tabs,
.detail-modal__header {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.primary-action,
.secondary-action,
.close-button,
.actions-menu summary {
  appearance: none;
  border-radius: 999px;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
  min-height: 2.55rem;
  padding: 0 0.95rem;
}

.primary-action {
  border: 1px solid #111;
  background: #111;
  color: #fff;
}

.secondary-action,
.close-button,
.actions-menu summary {
  border: 1px solid #d8c18e;
  background: #fffaf0;
  color: #8c6a1f;
}

.actions-menu {
  position: relative;
}

.actions-menu summary {
  list-style: none;
}

.actions-menu summary::-webkit-details-marker {
  display: none;
}

.actions-menu__panel {
  position: absolute;
  right: 0;
  top: calc(100% + 0.4rem);
  display: grid;
  gap: 0.35rem;
  min-width: 180px;
  padding: 0.5rem;
  border: 1px solid #e8dfd0;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.08);
}

.actions-menu__panel button {
  appearance: none;
  border: 0;
  background: #fff;
  color: #3f372c;
  cursor: pointer;
  text-align: left;
  padding: 0.65rem 0.7rem;
  border-radius: 10px;
}

.actions-menu__panel button:hover {
  background: #faf7f1;
}

.mobile-card {
  display: none;
}

.mobile-list {
  display: none;
}

.empty-state {
  padding: 1.15rem;
  color: #6f6558;
}

.detail-modal {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 1.25rem;
  background: rgba(17, 17, 17, 0.62);
  backdrop-filter: blur(4px);
}

.detail-modal__surface {
  width: min(1280px, 100%);
  max-height: calc(100vh - 2.5rem);
  overflow: auto;
  border-radius: 28px;
  background: #f6f1e7;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.25);
}

.detail-modal__header {
  position: sticky;
  top: 0;
  z-index: 1;
  justify-content: space-between;
  padding: 1.15rem 1.15rem 0;
  background: #f6f1e7;
}

.detail-tabs {
  padding: 1rem 1.15rem 0;
}

.detail-tabs button {
  appearance: none;
  border: 1px solid #d8c18e;
  border-radius: 999px;
  background: #fffaf0;
  color: #8c6a1f;
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  min-height: 2.4rem;
  padding: 0 0.95rem;
}

.detail-tabs button.active {
  background: #111;
  border-color: #111;
  color: #fff;
}

.detail-panel {
  padding: 1rem 1.15rem 1.15rem;
}

.summary-grid,
.detail-columns {
  display: grid;
  gap: 1rem;
}

.summary-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-bottom: 1rem;
}

.summary-card,
.detail-card {
  padding: 1rem;
}

.detail-columns {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}

.kv-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
}

.kv-grid div {
  display: grid;
  gap: 0.25rem;
}

.kv-grid span {
  color: #7b705f;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.timeline-list {
  display: grid;
  gap: 0.9rem;
}

.timeline-item {
  grid-template-columns: auto 1fr;
  align-items: start;
}

.timeline-dot {
  width: 0.85rem;
  height: 0.85rem;
  border-radius: 999px;
  margin-top: 0.4rem;
  background: #ddd2be;
}

.timeline-dot--done {
  background: #0f7b53;
}

.timeline-dot--active {
  background: #c98e11;
}

@media (max-width: 1220px) {
  .status-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .filters-grid,
  .summary-grid,
  .detail-columns,
  .kv-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .table-head,
  .table-row {
    grid-template-columns: 1fr 1fr 1fr 1fr;
  }

  .table-head span:nth-child(5),
  .table-head span:nth-child(6),
  .table-head span:nth-child(7),
  .table-row > :nth-child(5),
  .table-row > :nth-child(6),
  .table-row > :nth-child(7) {
    display: none;
  }
}

@media (max-width: 780px) {
  .status-strip,
  .filters-grid,
  .summary-grid,
  .detail-columns,
  .kv-grid {
    grid-template-columns: 1fr;
  }

  .table-head,
  .contracts-table {
    display: none;
  }

  .mobile-list {
    display: grid;
  }

  .mobile-card {
    display: grid;
    gap: 0.9rem;
    padding: 1rem 1.1rem;
    border-top: 1px solid #eee7da;
  }

  .mobile-card__top,
  .mobile-card__meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .row-actions,
  .mobile-card__actions,
  .detail-tabs,
  .detail-modal__header {
    flex-wrap: wrap;
  }

  .detail-modal {
    padding: 0.75rem;
  }

  .detail-modal__surface {
    max-height: calc(100vh - 1.5rem);
  }
}
</style>
