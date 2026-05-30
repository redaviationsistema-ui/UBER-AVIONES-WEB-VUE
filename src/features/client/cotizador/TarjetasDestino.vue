<script setup>
defineProps({
  destinations: { type: Array, required: true },
  tripType: { type: String, required: true },
})

defineEmits(['select'])
</script>

<template>
  <section class="destination-cards" aria-label="Rutas sugeridas">
    <article v-for="destination in destinations" :key="destination.code">
      <span>{{ destination.badge || destination.code }}</span>
      <strong>{{ destination.route_title || destination.city }}</strong>
      <small v-if="destination.time || destination.price">
        {{ [destination.price ? `Desde ${destination.price}` : '', destination.time, destination.capacity].filter(Boolean).join(' • ') }}
      </small>
      <em v-if="destination.context">{{ destination.context }}</em>
      <button type="button" @click="$emit('select', destination)">
        {{ tripType === 'Multi-destino' ? `Agregar ${destination.city}` : 'Ver opcion' }}
      </button>
    </article>
  </section>
</template>

<style scoped>
.destination-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.8rem;
}

.destination-cards article {
  display: grid;
  gap: 0.45rem;
  min-height: 8.2rem;
  padding: 1rem;
  border: 1px solid #e5e1d8;
  border-radius: 8px;
  background: #ffffff;
}

.destination-cards span {
  color: #8b6a24;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.destination-cards strong {
  color: #141414;
  font-size: 1.05rem;
}

.destination-cards small {
  color: #646464;
  font-weight: 600;
}

.destination-cards em {
  color: #3b3428;
  font-style: normal;
  font-weight: 600;
}

.destination-cards button {
  align-self: end;
  min-height: 2.5rem;
  border: 0;
  border-radius: 8px;
  background: #ece8df;
  color: #111111;
  font-weight: 800;
  cursor: pointer;
}

@media (max-width: 860px) {
  .destination-cards {
    grid-template-columns: 1fr;
  }

  .destination-cards article {
    min-height: auto;
    padding: 0.8rem;
    gap: 0.3rem;
  }

  .destination-cards button {
    width: 100%;
  }
}
</style>
