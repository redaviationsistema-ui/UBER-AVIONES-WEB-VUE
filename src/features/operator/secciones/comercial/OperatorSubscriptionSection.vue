/*----------------------------------------------------------------------------------------------*/
// VISTA DE SECCION DE SUSCRIPCION DEL PORTAL DE OPERADOR
/*----------------------------------------------------------------------------------------------*/

<script setup>
defineProps({
  aircraft: { type: Array, required: true },
  plans: { type: Array, required: true },
  subscriptionSummary: { type: Object, required: true },
})

defineEmits(['subscribe'])
</script>

<template>
  <section class="subscription-page">
    <div class="surface page-head">
      <div>
        <span class="eyebrow">Suscripcion por aeronave</span>
        <h3>Controla trial, cobro y activacion por cada avion</h3>
        <p class="muted">
          El matching solo se mantiene sano si cada aeronave paga por separado al terminar su trial.
        </p>
      </div>
    </div>

    <div class="summary-grid">
      <article class="surface summary-card">
        <span>Trial activas</span>
        <strong>{{ subscriptionSummary.trialActive }}</strong>
      </article>
      <article class="surface summary-card">
        <span>Con suscripcion</span>
        <strong>{{ subscriptionSummary.active }}</strong>
      </article>
      <article class="surface summary-card">
        <span>Suspendidas</span>
        <strong>{{ subscriptionSummary.suspended }}</strong>
      </article>
      <article class="surface summary-card">
        <span>Por suscribir</span>
        <strong>{{ subscriptionSummary.required }}</strong>
      </article>
    </div>

    <section class="plans-grid">
      <article v-for="plan in plans" :key="plan.id" class="surface plan-card">
        <span class="badge">{{ plan.billing_period }}</span>
        <h4>{{ plan.name }}</h4>
        <p class="price">${{ plan.price }} {{ plan.currency }}</p>
        <p class="muted">Limite: {{ plan.aircraft_limit }} aeronaves</p>
      </article>
    </section>

    <section class="aircraft-grid">
      <article v-for="item in aircraft" :key="item.id" class="surface aircraft-card">
        <div class="aircraft-top">
          <div>
            <span class="badge">{{ item.registration }}</span>
            <h4>{{ item.model }}</h4>
            <p class="muted">{{ item.subscription_plan?.name || 'Sin plan activo' }}</p>
          </div>

          <button
            class="primary-action"
            type="button"
            :disabled="item.subscription?.status === 'active' || item.aircraft_subscription?.status === 'active'"
            @click="$emit('subscribe', { aircraftId: item.id, planId: plans[0]?.id || null })"
          >
            {{
              item.subscription?.status === 'active' || item.aircraft_subscription?.status === 'active'
                ? 'Suscripcion activa'
                : 'Activar plan base'
            }}
          </button>
        </div>

        <div class="info-grid">
          <div>
            <span>Estado</span>
            <strong>{{ item.status }}</strong>
          </div>
          <div>
            <span>Trial vence</span>
            <strong>{{ item.trial_ends_at?.slice(0, 10) || 'N/D' }}</strong>
          </div>
          <div>
            <span>Pago</span>
            <strong>{{ item.subscription?.payment_provider || 'Sin pago' }}</strong>
          </div>
          <div>
            <span>Referencia</span>
            <strong>{{ item.subscription?.payment_reference || 'Pendiente' }}</strong>
          </div>
        </div>
      </article>
    </section>
  </section>
</template>

<style scoped>
.subscription-page,
.summary-grid,
.plans-grid,
.aircraft-grid,
.info-grid {
  display: grid;
  gap: 1rem;
}

.page-head,
.summary-card,
.plan-card,
.aircraft-card {
  padding: 1rem;
}

.summary-grid,
.plans-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.aircraft-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.aircraft-top {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.info-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 1rem;
}

.price {
  margin: 0.35rem 0 0;
  font-size: 1.45rem;
  font-weight: 800;
}

.info-grid div {
  display: grid;
  gap: 0.3rem;
}

.info-grid span,
.summary-card span {
  color: #70675c;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

@media (max-width: 1080px) {
  .summary-grid,
  .plans-grid,
  .aircraft-grid,
  .info-grid {
    grid-template-columns: 1fr;
  }
}
</style>
