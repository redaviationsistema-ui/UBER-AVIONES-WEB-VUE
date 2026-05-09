<script setup>
defineProps({
  aircraft: { type: Array, required: true },
  subscriptions: { type: Array, required: true },
  mode: { type: String, default: 'aircraft' },
})

defineEmits(['approve-aircraft', 'reject-aircraft', 'suspend-aircraft'])
</script>

<template>
  <section class="aircraft-page">
    <div class="surface page-head">
      <div>
        <span class="eyebrow">{{ mode === 'subscriptions' ? 'Suscripciones por avion' : 'Aeronaves y aprobaciones' }}</span>
        <h3>{{ mode === 'subscriptions' ? 'Cobro y vigencias por aeronave' : 'Revision admin para matching cliente' }}</h3>
        <p class="muted">
          {{ mode === 'subscriptions'
            ? 'Cada avion vive con su propia suscripcion y referencia de pago.'
            : 'El cliente solo debe ver aeronaves aprobadas, con documentos validos y en estado trial activo o activo.' }}
        </p>
      </div>
    </div>

    <div v-if="mode === 'subscriptions'" class="subscription-grid">
      <article v-for="item in subscriptions" :key="item.id" class="surface subscription-card">
        <span class="badge">{{ item.plan?.name || 'Plan' }}</span>
        <h4>{{ item.aircraft?.registration || 'Aeronave' }} · {{ item.aircraft?.model || 'N/D' }}</h4>
        <p class="muted">{{
          item.aircraft?.provider?.commercial_name ||
            item.aircraft?.provider?.company_name ||
            item.provider?.commercial_name ||
            item.provider?.company_name
        }}</p>
        <div class="meta-grid">
          <div>
            <span>Estado</span>
            <strong>{{ item.status }}</strong>
          </div>
          <div>
            <span>Periodo</span>
            <strong>{{ item.starts_at?.slice(0, 10) }} a {{ item.ends_at?.slice(0, 10) }}</strong>
          </div>
          <div>
            <span>Pago</span>
            <strong>{{ item.payment_provider }}</strong>
          </div>
          <div>
            <span>Referencia</span>
            <strong>{{ item.payment_reference }}</strong>
          </div>
        </div>
      </article>
    </div>

    <div v-else class="aircraft-grid">
      <article v-for="item in aircraft" :key="item.id" class="surface aircraft-card">
        <div class="aircraft-top">
          <div>
            <span class="badge">{{ item.registration }}</span>
            <h4>{{ item.model }}</h4>
            <p class="muted">{{ item.provider?.commercial_name || item.provider?.company_name }} · {{ item.base_airport }}</p>
          </div>
          <strong>{{ item.status }}</strong>
        </div>

        <div class="meta-grid">
          <div>
            <span>Trial</span>
            <strong>{{ item.trial_ends_at?.slice(0, 10) }}</strong>
          </div>
          <div>
            <span>Documentos</span>
            <strong>{{ item.documents_valid ? 'Validos' : 'Incompletos' }}</strong>
          </div>
          <div>
            <span>Aprobacion</span>
            <strong>{{ item.approved ? 'Aprobada' : 'Pendiente' }}</strong>
          </div>
          <div>
            <span>Matching</span>
            <strong>{{ item.approved && item.documents_valid && ['trial_active', 'active'].includes(item.status) ? 'Visible' : 'Bloqueado' }}</strong>
          </div>
        </div>

        <div class="actions-row">
          <button class="primary-action" type="button" @click="$emit('approve-aircraft', item.id)">
            Aprobar
          </button>
          <button class="ghost-button" type="button" @click="$emit('reject-aircraft', item.id)">
            Rechazar
          </button>
          <button class="ghost-button" type="button" @click="$emit('suspend-aircraft', item.id)">
            Suspender
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.aircraft-page,
.aircraft-grid,
.subscription-grid,
.meta-grid {
  display: grid;
  gap: 1rem;
}

.page-head,
.aircraft-card,
.subscription-card {
  padding: 1rem;
}

.aircraft-grid,
.subscription-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.aircraft-top,
.actions-row {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 0.75rem;
}

.page-head h3,
.aircraft-card h4,
.subscription-card h4 {
  margin: 0;
}

.meta-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 1rem;
}

.meta-grid div {
  display: grid;
  gap: 0.35rem;
}

.meta-grid span {
  color: #70675c;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

@media (max-width: 1080px) {
  .aircraft-grid,
  .subscription-grid,
  .meta-grid {
    grid-template-columns: 1fr;
  }

  .actions-row {
    display: grid;
  }
}
</style>
