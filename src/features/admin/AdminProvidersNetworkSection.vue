<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { resolveRoleSectionPath } from '../../data/roleFlows'
import {
  buildProviderReviewFlow,
  resolveProviderCompanyName,
  resolveProviderRepresentativeName,
  resolveProviderStatusMeta,
} from '../../lib/providerReview'

const props = defineProps({
  providers: { type: Array, required: true },
  aircraft: { type: Array, required: true },
})

const router = useRouter()
const searchTerm = ref('')
const selectedProvider = ref(null)

function providerLabel(provider = {}) {
  return resolveProviderCompanyName(provider)
}

function providerStatusMeta(provider = {}) {
  const meta = resolveProviderStatusMeta(provider)
  if (meta.key === 'approved') return { ...meta, icon: '●' }
  if (meta.key === 'changes_required') return { ...meta, key: 'suspended', icon: '●' }
  if (meta.key === 'in_review') return { ...meta, key: 'pending', icon: '●' }
  return { ...meta, key: 'pending', icon: '●' }
}

function providerBase(provider = {}) {
  return provider.base_airport || provider.base || provider.location || 'Base pendiente'
}

function providerResponsible(provider = {}) {
  return resolveProviderRepresentativeName(provider)
}

const aircraftMetricsByProvider = computed(() => {
  const metrics = new Map()

  props.providers.forEach((provider) => {
    const providerId = Number(provider.id || provider.provider_id || 0)
    const providerKey = providerId > 0 ? `id:${providerId}` : `label:${providerLabel(provider)}`
    metrics.set(providerKey, {
      aircraft: 0,
      active: 0,
      trial: 0,
      pending: 0,
    })
  })

  props.aircraft.forEach((item) => {
    const aircraftProviderId = Number(item.provider_id || item.proveedor_id || item.provider?.id || 0)
    const fallbackLabel = providerLabel(item.provider || item)
    const key = aircraftProviderId > 0 ? `id:${aircraftProviderId}` : `label:${fallbackLabel}`
    const current = metrics.get(key) || {
      aircraft: 0,
      active: 0,
      trial: 0,
      pending: 0,
    }

    current.aircraft += 1
    if (String(item.status || '').toLowerCase() === 'active') current.active += 1
    if (String(item.status || '').toLowerCase() === 'trial_active') current.trial += 1
    if (!item.approved) current.pending += 1

    metrics.set(key, current)
  })

  return metrics
})

function providerMetrics(provider = {}) {
  if (provider?.aircraft_metrics && typeof provider.aircraft_metrics === 'object') {
    return {
      aircraft: Number(provider.aircraft_metrics.aircraft || 0),
      active: Number(provider.aircraft_metrics.active || 0),
      trial: Number(provider.aircraft_metrics.trial || 0),
      pending: Number(provider.aircraft_metrics.pending || 0),
    }
  }

  const providerId = Number(provider.id || provider.provider_id || 0)
  const providerKey = providerId > 0 ? `id:${providerId}` : `label:${providerLabel(provider)}`
  return (
    aircraftMetricsByProvider.value.get(providerKey) || {
      aircraft: 0,
      active: 0,
      trial: 0,
      pending: 0,
    }
  )
}

function matchesSearch(provider = {}) {
  const query = searchTerm.value.trim().toLowerCase()
  if (!query) return true

  return [
    providerLabel(provider),
    providerResponsible(provider),
    providerBase(provider),
    provider.company_email,
    provider.company_phone,
    provider.rfc,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query))
}

const filteredProviders = computed(() =>
  props.providers.filter((provider) => matchesSearch(provider)),
)

const dashboardKpis = computed(() => {
  const totals = filteredProviders.value.reduce(
    (acc, provider) => {
      const metrics = providerMetrics(provider)
      const status = providerStatusMeta(provider).key

      acc.providers += 1
      acc.aircraft += metrics.aircraft
      if (status === 'approved') acc.approved += 1
      else if (status === 'pending') acc.pending += 1
      else if (status === 'suspended') acc.suspended += 1
      return acc
    },
    { providers: 0, approved: 0, pending: 0, suspended: 0, aircraft: 0 },
  )

  return [
    { label: 'Proveedores totales', value: totals.providers, tone: 'default' },
    { label: 'Aprobados', value: totals.approved, tone: 'success' },
    { label: 'Pendientes', value: totals.pending, tone: 'warning' },
    { label: 'Aeronaves totales', value: totals.aircraft, tone: 'info' },
  ]
})

const providerGroups = computed(() => {
  const baseGroups = [
    { key: 'approved', title: 'Aprobados', providers: [] },
    { key: 'pending', title: 'Pendientes', providers: [] },
    { key: 'suspended', title: 'Suspendidos', providers: [] },
  ]

  filteredProviders.value.forEach((provider) => {
    const target = baseGroups.find((group) => group.key === providerStatusMeta(provider).key)
    if (target) target.providers.push(provider)
  })

  return baseGroups.filter((group) => group.providers.length)
})

const selectedProviderMetrics = computed(() =>
  selectedProvider.value ? providerMetrics(selectedProvider.value) : { aircraft: 0, active: 0, trial: 0, pending: 0 },
)

const selectedProviderReview = computed(() =>
  selectedProvider.value ? buildProviderReviewFlow(selectedProvider.value, selectedProviderMetrics.value) : null,
)

const selectedProviderHeader = computed(() => {
  if (!selectedProvider.value || !selectedProviderReview.value) return null

  return {
    companyName: selectedProviderReview.value.companyName,
    representative: selectedProviderReview.value.representative,
    base: selectedProviderReview.value.base,
    email: selectedProvider.value.company_email || selectedProvider.value.email || 'Sin correo registrado',
    phone: selectedProvider.value.company_phone || selectedProvider.value.phone || 'Sin telefono registrado',
    rfc: selectedProvider.value.rfc || 'Sin RFC',
    legalName:
      selectedProvider.value.legal_name ||
      selectedProvider.value.razon_social ||
      selectedProvider.value.company_name ||
      'Sin razon social registrada',
    statusMeta: selectedProviderReview.value.statusMeta,
  }
})

function openProviderDetail(provider) {
  selectedProvider.value = provider
}

function closeProviderDetail() {
  selectedProvider.value = null
}

async function openProviderAircraft(provider) {
  const providerId = provider?.id || provider?.provider_id || ''
  const providerName = providerLabel(provider)

  await router.push({
    path: resolveRoleSectionPath('admin', 'aeronaves'),
    query: {
      providerId: providerId ? String(providerId) : undefined,
      providerName: providerName || undefined,
    },
  })
}
</script>

<template>
  <section class="providers-page">
    <div class="surface page-head">
      <div class="page-head-copy">
        <span class="eyebrow">CRUD proveedores</span>
        <h3>Panel de control de proveedores</h3>
        <p class="muted">
          Supervisa altas, estado comercial y tamano de flota desde una vista operativa central.
        </p>
      </div>
    </div>

    <div class="kpi-grid">
      <article v-for="item in dashboardKpis" :key="item.label" :class="['surface', 'kpi-card', `tone-${item.tone}`]">
        <strong>{{ item.value }}</strong>
        <span>{{ item.label }}</span>
      </article>
    </div>

    <section class="surface filters-shell">
      <label class="search-field">
        <span>Buscar proveedor</span>
        <input v-model="searchTerm" type="search" placeholder="Buscar proveedor..." />
      </label>
    </section>

    <template v-if="filteredProviders.length">
      <section v-for="group in providerGroups" :key="group.key" class="provider-status-section">
        <div class="section-head">
          <h4>{{ group.title }}</h4>
          <span>{{ group.providers.length }} proveedor{{ group.providers.length === 1 ? '' : 'es' }}</span>
        </div>

        <div class="provider-grid">
          <article v-for="provider in group.providers" :key="provider.id || providerLabel(provider)" class="surface provider-card">
            <div class="provider-card-top">
              <div class="provider-heading">
                <div class="provider-title-row">
                  <span class="provider-dot" :class="`provider-dot-${providerStatusMeta(provider).tone}`">
                    {{ providerStatusMeta(provider).icon }}
                  </span>
                  <h5>{{ providerLabel(provider) }}</h5>
                </div>
                <span class="provider-id">Proveedor #{{ provider.id || 'N/A' }}</span>
              </div>
              <span :class="['status-pill', `status-pill-${providerStatusMeta(provider).tone}`]">
                {{ providerStatusMeta(provider).label }}
              </span>
            </div>

            <div class="provider-main-kpi">
              <strong>{{ providerMetrics(provider).aircraft }}</strong>
              <span>Aeronaves</span>
            </div>

            <div class="provider-stats-inline">
              <div class="provider-stat-card">
                <span>Activas</span>
                <strong>{{ providerMetrics(provider).active }}</strong>
              </div>
              <div class="provider-stat-card">
                <span>Pendientes</span>
                <strong>{{ providerMetrics(provider).pending }}</strong>
              </div>
              <div class="provider-stat-card">
                <span>Trial</span>
                <strong>{{ providerMetrics(provider).trial }}</strong>
              </div>
            </div>

            <div class="provider-meta">
              <div class="provider-meta-row">
                <span>Responsable</span>
                <strong>{{ providerResponsible(provider) }}</strong>
              </div>
              <div class="provider-meta-row">
                <span>Base</span>
                <strong>{{ providerBase(provider) }}</strong>
              </div>
            </div>

            <div class="provider-card-actions">
              <button type="button" class="provider-link provider-link-secondary" @click="openProviderDetail(provider)">
                Revisar expediente
              </button>
              <button type="button" class="provider-link" @click="openProviderAircraft(provider)">
                Ver aeronaves
              </button>
            </div>
          </article>
        </div>
      </section>
    </template>

    <div v-else class="surface empty-state">
      <strong>No encontramos proveedores con ese criterio.</strong>
      <p class="muted">Prueba con otro nombre o revisa si ya hay proveedores sincronizados en el backend.</p>
    </div>

    <div v-if="selectedProvider" class="provider-detail-backdrop" @click="closeProviderDetail"></div>
    <section v-if="selectedProvider && selectedProviderHeader && selectedProviderReview" class="surface provider-detail-modal" aria-label="Detalle de proveedor">
      <div class="provider-detail-head">
        <div>
          <span class="eyebrow">Centro de revision de operador</span>
          <h4>{{ selectedProviderHeader.companyName }}</h4>
          <p class="muted">Representante {{ selectedProviderHeader.representative }} · Base {{ selectedProviderHeader.base }}</p>
        </div>
        <div class="provider-detail-head-actions">
          <span :class="['status-pill', `status-pill-${selectedProviderHeader.statusMeta.tone}`]">
            {{ selectedProviderHeader.statusMeta.label }}
          </span>
          <button type="button" class="provider-detail-close" @click="closeProviderDetail">Cerrar</button>
        </div>
      </div>

      <div class="provider-detail-layout">
        <div class="provider-detail-main">
          <section class="provider-detail-hero">
            <article class="provider-detail-hero-card">
              <span class="eyebrow">Perfil de empresa</span>
              <div class="provider-detail-title-row">
                <div>
                  <strong class="provider-detail-company">{{ selectedProviderHeader.companyName }}</strong>
                  <p class="provider-detail-subtitle">{{ selectedProviderHeader.legalName }}</p>
                </div>
                <div class="provider-detail-progress">
                  <strong>{{ selectedProviderReview.progress.percent }}%</strong>
                  <span>Readiness</span>
                </div>
              </div>

              <div class="provider-detail-checklist">
                <article
                  v-for="step in selectedProviderReview.checklist"
                  :key="step.id"
                  :class="['provider-check-item', step.complete ? 'is-complete' : step.pending ? 'is-pending' : 'is-idle']"
                >
                  <strong>{{ step.complete ? 'OK' : step.pending ? 'Pend' : 'Info' }}</strong>
                  <span>{{ step.label }}</span>
                </article>
              </div>
            </article>

            <article class="provider-detail-kpis">
              <article class="provider-detail-stat">
                <span>Aeronaves</span>
                <strong>{{ selectedProviderMetrics.aircraft }}</strong>
              </article>
              <article class="provider-detail-stat">
                <span>Activas</span>
                <strong>{{ selectedProviderMetrics.active }}</strong>
              </article>
              <article class="provider-detail-stat">
                <span>Pendientes</span>
                <strong>{{ selectedProviderMetrics.pending }}</strong>
              </article>
              <article class="provider-detail-stat">
                <span>Trial</span>
                <strong>{{ selectedProviderMetrics.trial }}</strong>
              </article>
            </article>
          </section>

          <section class="provider-detail-panel">
            <div class="provider-detail-panel-head">
              <span class="eyebrow">Identidad corporativa</span>
              <strong>{{ selectedProviderHeader.statusMeta.headline }}</strong>
            </div>
            <div class="provider-data-grid">
              <article class="provider-data-card">
                <span>Razon social</span>
                <strong>{{ selectedProviderHeader.legalName }}</strong>
              </article>
              <article class="provider-data-card">
                <span>RFC</span>
                <strong>{{ selectedProviderHeader.rfc }}</strong>
              </article>
              <article class="provider-data-card">
                <span>Nombre comercial</span>
                <strong>{{ selectedProviderHeader.companyName }}</strong>
              </article>
              <article class="provider-data-card">
                <span>Base operativa</span>
                <strong>{{ selectedProviderHeader.base }}</strong>
              </article>
            </div>
          </section>

          <section class="provider-detail-panel">
            <div class="provider-detail-panel-head">
              <span class="eyebrow">Representante legal</span>
              <strong>Contacto principal para validacion</strong>
            </div>
            <div class="provider-data-grid">
              <article class="provider-data-card">
                <span>Nombre completo</span>
                <strong>{{ selectedProviderHeader.representative }}</strong>
              </article>
              <article class="provider-data-card">
                <span>Telefono</span>
                <strong>{{ selectedProviderHeader.phone }}</strong>
              </article>
              <article class="provider-data-card provider-data-card-wide">
                <span>Email</span>
                <strong>{{ selectedProviderHeader.email }}</strong>
              </article>
            </div>
          </section>
        </div>

        <aside class="provider-detail-sidebar">
          <section class="provider-detail-panel provider-detail-summary">
            <div class="provider-detail-panel-head">
              <span class="eyebrow">Resumen de validacion</span>
              <strong>{{ selectedProviderHeader.statusMeta.headline }}</strong>
            </div>

            <div class="provider-summary-list">
              <article
                v-for="item in selectedProviderReview.summary"
                :key="item.label"
                :class="['provider-summary-row', `tone-${item.tone || 'default'}`]"
              >
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </article>
            </div>
          </section>

          <section class="provider-detail-panel">
            <div class="provider-detail-panel-head">
              <span class="eyebrow">Alertas</span>
              <strong>Prioridades del expediente</strong>
            </div>

            <div class="provider-alerts-list">
              <article
                v-for="alert in selectedProviderReview.alerts"
                :key="alert.title"
                :class="['provider-alert-row', `provider-alert-row-${alert.tone}`]"
              >
                {{ alert.title }}
              </article>
            </div>
          </section>

          <section class="provider-detail-panel">
            <div class="provider-detail-panel-head">
              <span class="eyebrow">Acciones admin</span>
              <strong>Flujo rapido</strong>
            </div>
            <div class="provider-quick-actions">
              <button type="button" class="provider-link" @click="openProviderAircraft(selectedProvider)">
                Revisar aeronaves
              </button>
              <button type="button" class="provider-link provider-link-secondary" @click="closeProviderDetail">
                Continuar despues
              </button>
            </div>
          </section>
        </aside>
      </div>
    </section>
  </section>
</template>

<style scoped>
.providers-page {
  --providers-ink: #17324a;
  --providers-ink-soft: #60758b;
  --providers-line: rgba(95, 122, 149, 0.22);
  --providers-warm-line: rgba(185, 147, 87, 0.2);
  --providers-surface: linear-gradient(180deg, rgba(252, 250, 245, 0.98), rgba(242, 238, 230, 0.96));
  --providers-panel: linear-gradient(145deg, #1b3448 0%, #243f55 52%, #305168 100%);
  --providers-panel-soft: linear-gradient(180deg, rgba(30, 53, 72, 0.96), rgba(23, 42, 58, 0.98));
  --providers-shadow: 0 24px 56px rgba(18, 37, 55, 0.14);
  --providers-accent: #d7a64d;
  --providers-accent-soft: #f9edd2;
  --providers-success: #2f8f68;
  --providers-success-soft: #dff5ea;
  --providers-warning: #c68620;
  --providers-warning-soft: #fdf0d5;
  --providers-danger: #cf665b;
  --providers-danger-soft: #fde5e1;
  --providers-info: #4f87b1;
  --providers-info-soft: #dfedf8;
  display: grid;
  gap: 1.25rem;
}

.page-head,
.filters-shell,
.provider-card,
.empty-state,
.kpi-card {
  padding: 1rem;
}

.page-head-copy,
.search-field,
.provider-card,
.provider-main-kpi,
.provider-meta {
  display: grid;
  gap: 0.5rem;
}

.page-head h3,
.provider-card h5,
.section-head h4 {
  margin: 0;
}

.page-head {
  border-radius: 1.6rem;
  border: 1px solid rgba(114, 145, 174, 0.18);
  background:
    radial-gradient(circle at top right, rgba(227, 179, 91, 0.18), transparent 26%),
    radial-gradient(circle at bottom left, rgba(113, 194, 205, 0.12), transparent 22%),
    var(--providers-panel);
  box-shadow: var(--providers-shadow);
}

.page-head-copy {
  max-width: 44rem;
}

.page-head :deep(.eyebrow) {
  color: var(--providers-accent);
}

.page-head :deep(.muted),
.empty-state :deep(.muted) {
  color: rgba(236, 242, 247, 0.8);
}

.page-head h3 {
  color: #ffffff;
  font-size: clamp(1.5rem, 2vw, 2rem);
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
}

.kpi-card {
  border: 1px solid var(--providers-warm-line);
  border-radius: 1.4rem;
  background:
    radial-gradient(circle at top right, rgba(227, 179, 91, 0.08), transparent 30%),
    var(--providers-surface);
  box-shadow: 0 16px 36px rgba(36, 58, 84, 0.08);
}

.kpi-card strong {
  color: var(--providers-ink);
  font-size: 2.5rem;
  line-height: 0.95;
}

.kpi-card span {
  color: #7d6b55;
  font-size: 0.82rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.tone-success {
  border-color: rgba(47, 163, 107, 0.24);
  background:
    radial-gradient(circle at top right, rgba(47, 163, 107, 0.1), transparent 30%),
    var(--providers-surface);
}

.tone-warning {
  border-color: rgba(207, 138, 28, 0.26);
  background:
    radial-gradient(circle at top right, rgba(207, 138, 28, 0.1), transparent 30%),
    var(--providers-surface);
}

.tone-info {
  border-color: rgba(70, 137, 181, 0.24);
  background:
    radial-gradient(circle at top right, rgba(70, 137, 181, 0.1), transparent 30%),
    var(--providers-surface);
}

.filters-shell {
  border-radius: 1.4rem;
  border: 1px solid rgba(223, 212, 194, 0.65);
  background: linear-gradient(180deg, #fffdf9 0%, #fbf7ef 100%);
  box-shadow: 0 14px 30px rgba(36, 58, 84, 0.08);
}

.search-field span {
  color: #7d6b55;
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.search-field input {
  width: 100%;
  min-height: 3.6rem;
  border: 1px solid rgba(191, 166, 126, 0.28);
  border-radius: 1.2rem;
  background: rgba(255, 255, 255, 0.96);
  padding: 0 1.1rem;
  color: var(--providers-ink);
  font-size: 1.02rem;
  outline: none;
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.04);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background 0.2s ease;
}

.search-field input:focus {
  border-color: rgba(70, 137, 181, 0.45);
  box-shadow:
    0 0 0 4px rgba(112, 168, 205, 0.12),
    inset 0 1px 2px rgba(15, 23, 42, 0.04);
}

.provider-status-section {
  display: grid;
  gap: 1rem;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid rgba(191, 166, 126, 0.24);
  padding-bottom: 0.6rem;
}

.section-head span {
  color: var(--providers-ink-soft);
  font-size: 0.86rem;
  font-weight: 700;
}

.section-head h4 {
  color: var(--providers-ink);
  font-size: 1.2rem;
}

.provider-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}

.provider-card {
  min-height: 150px;
  border: 1px solid rgba(121, 153, 181, 0.18);
  border-radius: 1.5rem;
  background:
    radial-gradient(circle at top right, rgba(227, 179, 91, 0.14), transparent 24%),
    radial-gradient(circle at bottom left, rgba(113, 194, 205, 0.12), transparent 24%),
    var(--providers-panel-soft);
  color: #ffffff;
  box-shadow: 0 22px 44px rgba(20, 44, 67, 0.16);
  padding: 1.3rem;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.provider-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 24px 48px rgba(20, 44, 67, 0.22);
  border-color: rgba(171, 203, 227, 0.3);
}

.provider-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.provider-heading {
  display: grid;
  gap: 0.38rem;
}

.provider-title-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.provider-card h5 {
  color: #ffffff;
  font-size: 1.12rem;
  font-weight: 800;
}

.provider-id {
  color: rgba(224, 234, 242, 0.62);
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.provider-dot {
  flex: 0 0 auto;
  font-size: 0.9rem;
  line-height: 1;
}

.provider-dot-success {
  color: #61d69a;
}

.provider-dot-warning {
  color: #ffc85c;
}

.provider-dot-danger {
  color: #ff8d82;
}

.status-pill {
  border-radius: 999px;
  padding: 0.42rem 0.82rem;
  font-size: 0.74rem;
  font-weight: 800;
  white-space: nowrap;
}

.status-pill-success {
  color: #0f5b39;
  background: var(--providers-success-soft);
}

.status-pill-warning {
  color: #8f5a05;
  background: var(--providers-warning-soft);
}

.status-pill-danger {
  color: #8e3328;
  background: var(--providers-danger-soft);
}

.provider-main-kpi strong {
  font-size: 3.35rem;
  line-height: 0.95;
  letter-spacing: -0.04em;
}

.provider-main-kpi span,
.provider-stats-inline span,
.provider-meta-row span {
  color: rgba(229, 238, 245, 0.76);
}

.provider-main-kpi span,
.provider-stats-inline span {
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.provider-stats-inline {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.provider-stat-card {
  display: grid;
  gap: 0.28rem;
  border: 1px solid rgba(183, 208, 227, 0.12);
  border-radius: 1rem;
  background: rgba(244, 249, 252, 0.06);
  padding: 0.72rem 0.8rem;
}

.provider-stat-card strong {
  font-size: 1.32rem;
  line-height: 1;
}

.provider-meta {
  gap: 0.65rem;
}

.provider-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-top: 1px solid rgba(183, 208, 227, 0.12);
  padding-top: 0.65rem;
}

.provider-meta-row strong {
  color: #ffffff;
  font-size: 0.92rem;
  text-align: right;
}

.provider-link {
  width: fit-content;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(180deg, #f6dda0 0%, #ebc97a 100%);
  padding: 0.68rem 1rem;
  color: #533400;
  font-size: 0.92rem;
  font-weight: 800;
  box-shadow: 0 12px 24px rgba(215, 166, 77, 0.22);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    background 0.2s ease;
}

.provider-link:hover {
  transform: translateY(-1px);
  background: linear-gradient(180deg, #f9e6b8 0%, #efcf87 100%);
  box-shadow: 0 14px 28px rgba(215, 166, 77, 0.28);
}

.provider-link-secondary {
  border: 1px solid rgba(126, 151, 176, 0.22);
  background: linear-gradient(180deg, rgba(243, 247, 251, 0.96), rgba(231, 238, 245, 0.94));
  color: #45627f;
  box-shadow: 0 10px 20px rgba(79, 115, 149, 0.08);
}

.provider-link-secondary:hover {
  background: linear-gradient(180deg, rgba(248, 250, 253, 0.98), rgba(236, 242, 248, 0.96));
  color: #24425f;
  box-shadow: 0 14px 24px rgba(79, 115, 149, 0.12);
}

.provider-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.empty-state {
  border-radius: 1.4rem;
  border: 1px solid rgba(114, 145, 174, 0.18);
  background:
    radial-gradient(circle at top right, rgba(227, 179, 91, 0.12), transparent 28%),
    var(--providers-panel);
  color: #ffffff;
  box-shadow: var(--providers-shadow);
}

.provider-detail-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(12, 24, 37, 0.45);
  backdrop-filter: blur(4px);
  z-index: 30;
}

.provider-detail-modal {
  position: fixed;
  inset: 1.5rem;
  width: auto;
  overflow: auto;
  border: 1px solid rgba(126, 151, 176, 0.18);
  border-radius: 1.8rem;
  background:
    radial-gradient(circle at top right, rgba(215, 166, 77, 0.12), transparent 24%),
    radial-gradient(circle at top left, rgba(92, 142, 176, 0.08), transparent 28%),
    linear-gradient(180deg, rgba(253, 251, 246, 0.99), rgba(240, 236, 228, 0.99));
  box-shadow: 0 30px 70px rgba(20, 44, 67, 0.24);
  z-index: 31;
  padding: 1.2rem;
}

.provider-detail-head,
.provider-detail-grid {
  display: grid;
  gap: 1rem;
}

.provider-detail-head {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  margin-bottom: 1rem;
}

.provider-detail-head-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.provider-detail-head h4 {
  margin: 0.25rem 0 0;
  color: var(--providers-ink);
  font-size: 1.35rem;
}

.provider-detail-close {
  border: 1px solid rgba(137, 161, 187, 0.24);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  color: var(--providers-ink);
  padding: 0.7rem 1rem;
  font-weight: 700;
  cursor: pointer;
}

.provider-detail-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.provider-detail-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(19rem, 0.9fr);
  gap: 1rem;
}

.provider-detail-main,
.provider-detail-sidebar,
.provider-detail-hero,
.provider-detail-kpis,
.provider-detail-checklist,
.provider-data-grid,
.provider-summary-list,
.provider-alerts-list,
.provider-quick-actions {
  display: grid;
  gap: 0.9rem;
}

.provider-detail-panel,
.provider-detail-hero-card {
  border: 1px solid rgba(132, 154, 176, 0.14);
  border-radius: 1.3rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(247, 246, 242, 0.76));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65);
  padding: 1rem;
}

.provider-detail-hero {
  grid-template-columns: minmax(0, 1.2fr) minmax(16rem, 0.8fr);
}

.provider-detail-title-row {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.provider-detail-company {
  display: block;
  color: var(--providers-ink);
  font-size: clamp(1.8rem, 3vw, 2.6rem);
  line-height: 0.95;
  letter-spacing: -0.04em;
}

.provider-detail-subtitle {
  margin: 0.45rem 0 0;
  color: var(--providers-ink-soft);
}

.provider-detail-progress {
  min-width: 7rem;
  border-radius: 1.1rem;
  background:
    radial-gradient(circle at top, rgba(92, 142, 176, 0.18), transparent 44%),
    linear-gradient(180deg, #1d3a56 0%, #163047 100%);
  padding: 1rem;
  color: #ffffff;
  text-align: center;
  box-shadow: 0 16px 28px rgba(20, 44, 67, 0.18);
}

.provider-detail-progress strong {
  display: block;
  font-size: 2rem;
  line-height: 1;
}

.provider-detail-progress span {
  color: rgba(234, 241, 246, 0.72);
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.provider-check-item,
.provider-summary-row,
.provider-alert-row,
.provider-data-card {
  border-radius: 1rem;
  padding: 0.9rem 1rem;
}

.provider-detail-checklist {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.provider-check-item {
  border: 1px solid rgba(128, 152, 177, 0.18);
  background: linear-gradient(180deg, rgba(243, 247, 251, 0.92), rgba(238, 243, 248, 0.88));
}

.provider-check-item strong,
.provider-data-card span {
  display: block;
  color: #8a6b36;
  font-size: 0.74rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.provider-check-item span,
.provider-data-card strong {
  color: var(--providers-ink);
  font-weight: 800;
}

.provider-check-item.is-complete {
  border-color: rgba(47, 143, 104, 0.24);
  background: linear-gradient(180deg, rgba(223, 245, 234, 0.98), rgba(211, 238, 226, 0.94));
}

.provider-check-item.is-pending {
  border-color: rgba(198, 134, 32, 0.24);
  background: linear-gradient(180deg, rgba(253, 240, 213, 0.98), rgba(249, 233, 196, 0.92));
}

.provider-check-item.is-idle {
  border-color: rgba(135, 158, 181, 0.2);
  background: linear-gradient(180deg, rgba(240, 244, 248, 0.94), rgba(233, 239, 245, 0.9));
}

.provider-data-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.provider-data-card {
  border: 1px solid rgba(132, 154, 176, 0.14);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(249, 250, 252, 0.88));
}

.provider-data-card-wide {
  grid-column: 1 / -1;
}

.provider-detail-panel-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.85rem;
}

.provider-detail-panel-head strong {
  color: var(--providers-ink);
}

.provider-detail-kpis {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.provider-detail-stat {
  display: grid;
  gap: 0.35rem;
  padding: 1rem;
  border: 1px solid rgba(132, 154, 176, 0.14);
  border-radius: 1rem;
  background:
    radial-gradient(circle at top right, rgba(92, 142, 176, 0.08), transparent 34%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.86), rgba(246, 248, 251, 0.84));
}

.provider-detail-stat span {
  color: var(--providers-ink-soft);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.provider-detail-stat strong {
  color: var(--providers-ink);
  font-size: 1.25rem;
}

.provider-summary-row,
.provider-alert-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border: 1px solid rgba(132, 154, 176, 0.12);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(248, 250, 252, 0.9));
}

.provider-summary-row span {
  color: var(--providers-ink-soft);
}

.provider-summary-row strong {
  color: var(--providers-ink);
  text-align: right;
}

.provider-summary-row.tone-success {
  border-color: rgba(47, 143, 104, 0.18);
  background: linear-gradient(180deg, rgba(243, 251, 247, 0.96), rgba(232, 246, 238, 0.92));
}

.provider-summary-row.tone-warning {
  border-color: rgba(198, 134, 32, 0.18);
  background: linear-gradient(180deg, rgba(255, 249, 236, 0.96), rgba(251, 241, 217, 0.92));
}

.provider-summary-row.tone-info {
  border-color: rgba(79, 135, 177, 0.18);
  background: linear-gradient(180deg, rgba(243, 248, 253, 0.96), rgba(228, 239, 249, 0.92));
}

.provider-summary-row.tone-neutral {
  border-color: rgba(132, 154, 176, 0.14);
  background: linear-gradient(180deg, rgba(252, 253, 254, 0.96), rgba(243, 247, 251, 0.92));
}

.provider-alert-row-warning {
  border-color: rgba(198, 134, 32, 0.24);
  background: linear-gradient(180deg, rgba(255, 244, 221, 0.9), rgba(251, 235, 196, 0.84));
  color: #8b5a08;
}

.provider-alert-row-info {
  border-color: rgba(79, 135, 177, 0.22);
  background: linear-gradient(180deg, rgba(230, 240, 249, 0.9), rgba(219, 233, 245, 0.84));
  color: #295978;
}

.provider-alert-row-success {
  border-color: rgba(47, 143, 104, 0.22);
  background: linear-gradient(180deg, rgba(224, 245, 234, 0.92), rgba(211, 238, 226, 0.84));
  color: #0f5b39;
}

.provider-alert-row-danger {
  border-color: rgba(207, 102, 91, 0.22);
  background: linear-gradient(180deg, rgba(254, 235, 231, 0.92), rgba(251, 222, 216, 0.84));
  color: #8e3328;
}

@media (max-width: 1180px) {
  .provider-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .provider-detail-layout,
  .provider-detail-hero {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .kpi-grid,
  .provider-grid,
  .provider-stats-inline,
  .provider-detail-grid,
  .provider-detail-kpis,
  .provider-data-grid,
  .provider-detail-checklist {
    grid-template-columns: 1fr;
  }

  .section-head,
  .provider-card-top,
  .provider-detail-head,
  .provider-detail-panel-head,
  .provider-detail-title-row,
  .provider-summary-row,
  .provider-alert-row {
    display: grid;
  }

  .provider-meta-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .provider-detail-modal {
    inset: 0.75rem;
  }
}
</style>
