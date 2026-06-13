<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  providers: { type: Array, required: true },
  aircraft: { type: Array, required: true },
})

const searchTerm = ref('')

function providerLabel(provider = {}) {
  return provider.commercial_name || provider.company_name || provider.display_name || 'Proveedor'
}

function providerStatus(provider = {}) {
  return String(provider.status || provider.approval_status || 'pending').toLowerCase()
}

function providerStatusMeta(provider = {}) {
  const status = providerStatus(provider)
  if (status.includes('approv') || status.includes('aprob') || status.includes('active') || status.includes('activo')) {
    return { key: 'approved', label: 'Aprobado', icon: '●', tone: 'success' }
  }
  if (status.includes('suspend') || status.includes('block') || status.includes('inactive') || status.includes('rech')) {
    return { key: 'suspended', label: 'Suspendido', icon: '●', tone: 'danger' }
  }
  return { key: 'pending', label: 'Pendiente', icon: '●', tone: 'warning' }
}

function providerBase(provider = {}) {
  return provider.base_airport || provider.base || provider.location || 'Base pendiente'
}

function providerResponsible(provider = {}) {
  return provider.contact_name || provider.user?.name || 'Sin responsable'
}

function aircraftByProvider(provider = {}) {
  const providerId = Number(provider.id || provider.provider_id || 0)
  return props.aircraft.filter((item) => {
    const aircraftProviderId = Number(item.provider_id || item.proveedor_id || item.provider?.id || 0)
    return providerId > 0 ? aircraftProviderId === providerId : providerLabel(item.provider || item) === providerLabel(provider)
  })
}

function providerMetrics(provider = {}) {
  const fleet = aircraftByProvider(provider)
  return {
    aircraft: fleet.length,
    active: fleet.filter((item) => String(item.status || '').toLowerCase() === 'active').length,
    trial: fleet.filter((item) => String(item.status || '').toLowerCase() === 'trial_active').length,
    pending: fleet.filter((item) => !item.approved).length,
  }
}

function matchesSearch(provider = {}) {
  const query = searchTerm.value.trim().toLowerCase()
  if (!query) return true

  return [providerLabel(provider), providerResponsible(provider), providerBase(provider)]
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

            <button type="button" class="provider-link">
              Ver proveedor →
            </button>
          </article>
        </div>
      </section>
    </template>

    <div v-else class="surface empty-state">
      <strong>No encontramos proveedores con ese criterio.</strong>
      <p class="muted">Prueba con otro nombre o revisa si ya hay proveedores sincronizados en el backend.</p>
    </div>
  </section>
</template>

<style scoped>
.providers-page {
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
  background: linear-gradient(145deg, #3c414b 0%, #313741 100%);
}

.page-head-copy {
  max-width: 44rem;
}

.page-head :deep(.eyebrow) {
  color: #f4c86a;
}

.page-head :deep(.muted),
.empty-state :deep(.muted) {
  color: rgba(255, 255, 255, 0.76);
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
  border: 1px solid #e5dccf;
  border-radius: 1.4rem;
  background: linear-gradient(180deg, #fffdf8 0%, #f8f3ea 100%);
  box-shadow: 0 16px 36px rgba(148, 127, 101, 0.08);
}

.kpi-card strong {
  color: #1f2937;
  font-size: 2.5rem;
  line-height: 0.95;
}

.kpi-card span {
  color: #7c6f60;
  font-size: 0.82rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.tone-success {
  border-color: rgba(34, 197, 94, 0.2);
}

.tone-warning {
  border-color: rgba(245, 158, 11, 0.22);
}

.tone-info {
  border-color: rgba(59, 130, 246, 0.22);
}

.filters-shell {
  border-radius: 1.4rem;
  background: #fffdf9;
  box-shadow: 0 14px 30px rgba(148, 127, 101, 0.08);
}

.search-field span {
  color: #7c6f60;
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.search-field input {
  width: 100%;
  min-height: 3.6rem;
  border: 1px solid #e8dfd3;
  border-radius: 1.2rem;
  background: #ffffff;
  padding: 0 1.1rem;
  color: #1f2937;
  font-size: 1.02rem;
  outline: none;
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.04);
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
  border-bottom: 1px solid #ede5d9;
  padding-bottom: 0.6rem;
}

.section-head span {
  color: #8b7d6b;
  font-size: 0.86rem;
  font-weight: 700;
}

.section-head h4 {
  color: #1f2937;
  font-size: 1.2rem;
}

.provider-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}

.provider-card {
  min-height: 150px;
  border-radius: 1.5rem;
  background: linear-gradient(180deg, #3c414b 0%, #343a44 100%);
  color: #ffffff;
  box-shadow: 0 22px 44px rgba(15, 23, 42, 0.14);
  padding: 1.3rem;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.provider-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.18);
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
  color: rgba(255, 255, 255, 0.56);
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
  color: #4ade80;
}

.provider-dot-warning {
  color: #facc15;
}

.provider-dot-danger {
  color: #f87171;
}

.status-pill {
  border-radius: 999px;
  padding: 0.42rem 0.82rem;
  font-size: 0.74rem;
  font-weight: 800;
  white-space: nowrap;
}

.status-pill-success {
  color: #d1fae5;
  background: rgba(34, 197, 94, 0.18);
}

.status-pill-warning {
  color: #fef3c7;
  background: rgba(245, 158, 11, 0.18);
}

.status-pill-danger {
  color: #fee2e2;
  background: rgba(239, 68, 68, 0.18);
}

.provider-main-kpi strong {
  font-size: 3.35rem;
  line-height: 0.95;
  letter-spacing: -0.04em;
}

.provider-main-kpi span,
.provider-stats-inline span,
.provider-meta-row span {
  color: rgba(255, 255, 255, 0.72);
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
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.04);
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
  border-top: 1px solid rgba(255, 255, 255, 0.08);
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
  background: #f8f4ea;
  padding: 0.68rem 1rem;
  color: #1f2937;
  font-size: 0.92rem;
  font-weight: 800;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    background 0.2s ease;
}

.provider-link:hover {
  transform: translateY(-1px);
  background: #ffffff;
  box-shadow: 0 10px 22px rgba(255, 255, 255, 0.12);
}

.empty-state {
  border-radius: 1.4rem;
  background: linear-gradient(145deg, #3c414b 0%, #313741 100%);
  color: #ffffff;
}

@media (max-width: 1180px) {
  .provider-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .kpi-grid,
  .provider-grid,
  .provider-stats-inline {
    grid-template-columns: 1fr;
  }

  .section-head,
  .provider-card-top {
    display: grid;
  }

  .provider-meta-row {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
