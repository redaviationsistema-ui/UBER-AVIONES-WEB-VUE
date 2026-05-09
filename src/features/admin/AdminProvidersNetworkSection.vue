<script setup>
defineProps({
  providers: { type: Array, required: true },
  aircraft: { type: Array, required: true },
})
</script>

<template>
  <section class="providers-page">
    <div class="surface page-head">
      <div>
        <span class="eyebrow">CRUD proveedores</span>
        <h3>Red operativa con onboarding y control de flota</h3>
        <p class="muted">
          Vista administrativa para revisar quienes ya tienen acceso, cuantas aeronaves cargaron y cuales siguen en trial o pendientes.
        </p>
      </div>
    </div>

    <div class="provider-grid">
      <article v-for="provider in providers" :key="provider.id" class="surface provider-card">
        <div class="provider-top">
          <div>
            <span class="badge">Proveedor #{{ provider.id }}</span>
            <h4>{{ provider.commercial_name || provider.company_name }}</h4>
            <p class="muted">{{ provider.contact_name }} · {{ provider.base_airport }}</p>
          </div>
          <strong>{{ provider.status }}</strong>
        </div>

        <div class="stats-grid">
          <div>
            <span>Aeronaves</span>
            <strong>{{ aircraft.filter((item) => item.provider_id === provider.id).length }}</strong>
          </div>
          <div>
            <span>Activas</span>
            <strong>{{ aircraft.filter((item) => item.provider_id === provider.id && item.status === 'active').length }}</strong>
          </div>
          <div>
            <span>Trial</span>
            <strong>{{ aircraft.filter((item) => item.provider_id === provider.id && item.status === 'trial_active').length }}</strong>
          </div>
          <div>
            <span>Pendientes</span>
            <strong>{{ aircraft.filter((item) => item.provider_id === provider.id && !item.approved).length }}</strong>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.providers-page,
.provider-grid,
.stats-grid {
  display: grid;
  gap: 1rem;
}

.page-head,
.provider-card {
  padding: 1rem;
}

.provider-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.provider-top {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.provider-card h4,
.page-head h3 {
  margin: 0;
}

.stats-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 1rem;
}

.stats-grid div {
  display: grid;
  gap: 0.35rem;
}

.stats-grid span {
  color: #70675c;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

@media (max-width: 1080px) {
  .provider-grid,
  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
