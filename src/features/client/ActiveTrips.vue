<script setup>
defineProps({
  reservations: { type: Array, required: true },
  selectedId: { type: String, default: '' },
  timeline: { type: Array, required: true },
})

defineEmits(['open-contract', 'open-detail', 'open-payment', 'open-concierge'])
</script>

<template>
  <section class="active-trips">
    <div class="screen-head">
      <span class="eyebrow">Viajes</span>
      <h2>Activos, proximos e historial en un solo lugar.</h2>
      <p>Contratos, estado de pago y tracking viven dentro de cada reserva.</p>
    </div>

    <div class="tabs">
      <button class="active" type="button">Proximos</button>
      <button type="button">En proceso</button>
      <button type="button">Historial</button>
    </div>

    <article v-if="selectedId && timeline.length" class="timeline-card">
      <h3>Tracking {{ selectedId }}</h3>
      <div class="timeline">
        <span v-for="item in timeline" :key="item">{{ item }}</span>
      </div>
      <div class="card-actions">
        <button type="button" @click="$emit('open-contract')">Contrato</button>
        <button type="button" @click="$emit('open-payment')">Pago</button>
        <button type="button" @click="$emit('open-concierge')">Concierge</button>
      </div>
    </article>

    <div class="reservation-list">
      <article v-for="reservation in reservations" :key="reservation.id" class="reservation-card">
        <strong>{{ reservation.route || reservation.title || reservation.id }}</strong>
        <span v-if="reservation.date">{{ reservation.date }}</span>
        <span v-if="reservation.status">{{ reservation.status }}</span>
        <span v-if="reservation.total || reservation.estimated_total">{{ reservation.total || reservation.estimated_total }}</span>
        <span v-if="reservation.aircraft">{{ reservation.aircraft }}</span>
        <button type="button" @click="$emit('open-detail', reservation.id)">Ver viaje</button>
      </article>
    </div>

    <div v-if="!reservations.length" class="empty-state">El servidor no devolvio viajes.</div>
  </section>
</template>

<style scoped>
.active-trips {
  display: grid;
  gap: 1rem;
}

.screen-head {
  max-width: 760px;
}

.eyebrow {
  color: #8b6a24;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h2,
h3 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: 0;
}

h2 {
  font-size: clamp(2rem, 4vw, 3.2rem);
  line-height: 1;
}

p,
span {
  color: #626262;
}

.tabs,
.card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

button {
  min-height: 2.7rem;
  border: 0;
  border-radius: 8px;
  padding: 0 1rem;
  background: #ece8df;
  color: #111111;
  font-weight: 800;
  cursor: pointer;
}

.tabs .active,
.card-actions button:last-child,
.reservation-card button {
  background: #111111;
  color: #ffffff;
}

.timeline-card,
.reservation-card {
  border: 1px solid #e5e1d8;
  border-radius: 8px;
  background: #ffffff;
}

.empty-state {
  padding: 1rem;
  border: 1px solid #e5e1d8;
  border-radius: 8px;
  background: #ffffff;
  color: #3b3428;
  font-weight: 800;
}

.timeline-card {
  display: grid;
  gap: 0.85rem;
  padding: 1rem;
}

.timeline,
.reservation-list {
  display: grid;
  gap: 0.75rem;
}

.timeline span {
  padding: 0.75rem;
  border-radius: 8px;
  background: #f4f0e7;
  font-weight: 800;
}

.reservation-card {
  display: grid;
  grid-template-columns: 1.1fr 0.8fr 1fr 0.8fr 1fr auto;
  gap: 0.8rem;
  align-items: center;
  padding: 1rem;
}

@media (max-width: 1080px) {
  .reservation-card {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .active-trips {
    gap: 0.8rem;
  }

  h2 {
    font-size: clamp(1.75rem, 9vw, 2.35rem);
  }

  .tabs,
  .card-actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .tabs button,
  .card-actions button,
  .reservation-card button {
    width: 100%;
  }

  .timeline-card,
  .reservation-card {
    padding: 0.85rem;
  }
}
</style>
