<script setup>
defineProps({
  plan: { type: String, required: true },
  quotesRemaining: { type: Number, required: true },
  reservationsRemaining: { type: Number, required: true },
})

defineEmits(['upgrade'])
</script>

<template>
  <section class="membership-banner">
    <div>
      <span>Membresia {{ plan }}</span>
      <strong v-if="quotesRemaining">Itinerarios disponibles: {{ quotesRemaining }}</strong>
      <strong v-else-if="reservationsRemaining">Reservas disponibles: {{ reservationsRemaining }}</strong>
    </div>
    <button type="button" @click="$emit('upgrade')">Ver acceso</button>
  </section>
</template>

<style scoped>
.membership-banner {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: center;
  padding: 1rem;
  border: 1px solid #e5e1d8;
  border-radius: 8px;
  background: #141414;
  color: #ffffff;
}

.membership-banner div {
  display: grid;
  gap: 0.2rem;
}

.membership-banner span {
  color: #d8b45b;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.membership-banner strong {
  font-size: clamp(1.15rem, 2vw, 1.55rem);
}

.membership-banner p {
  margin: 0;
  color: #d8d2c4;
}

.membership-banner button {
  min-height: 2.8rem;
  border: 0;
  border-radius: 8px;
  padding: 0 1rem;
  background: #ffffff;
  color: #111111;
  font-weight: 800;
  cursor: pointer;
}

@media (max-width: 720px) {
  .membership-banner {
    grid-template-columns: 1fr;
    gap: 0.75rem;
    padding: 0.9rem;
  }

  .membership-banner strong {
    font-size: 1.05rem;
  }

  .membership-banner button {
    width: 100%;
  }
}
</style>
