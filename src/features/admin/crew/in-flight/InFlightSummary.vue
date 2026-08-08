<script setup>
defineProps({
  cards: { type: Array, default: () => [] },
})
</script>

<template>
  <section class="status-strip">
    <article
      v-for="item in cards"
      :key="item.label"
      class="signal-card"
      :data-tone="item.label"
    >
      <div class="signal-card__head">
        <span>{{ item.label }}</span>
        <small>Live</small>
      </div>
      <strong>{{ item.value }}</strong>
      <p>{{ item.detail }}</p>
    </article>
  </section>
</template>

<style scoped>
.status-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.9rem;
}

.signal-card {
  position: relative;
  display: grid;
  gap: 0.55rem;
  padding: 1.05rem 1.1rem;
  border-radius: 24px;
  overflow: hidden;
  border: 1px solid rgba(159, 182, 220, 0.22);
  background:
    radial-gradient(circle at top right, rgba(255, 255, 255, 0.95), transparent 38%),
    linear-gradient(160deg, rgba(14, 36, 67, 0.98), rgba(33, 73, 133, 0.92));
  box-shadow: 0 24px 48px rgba(16, 35, 61, 0.14);
  color: #f7fbff;
}

.signal-card::after {
  content: '';
  position: absolute;
  inset: auto -10% -35% auto;
  width: 120px;
  height: 120px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  filter: blur(2px);
}

.signal-card[data-tone='Con incidencia'] {
  background:
    radial-gradient(circle at top right, rgba(255, 255, 255, 0.94), transparent 38%),
    linear-gradient(160deg, rgba(82, 40, 18, 0.98), rgba(172, 95, 31, 0.92));
}

.signal-card[data-tone='Sin respuesta crew'] {
  background:
    radial-gradient(circle at top right, rgba(255, 255, 255, 0.94), transparent 38%),
    linear-gradient(160deg, rgba(73, 42, 12, 0.98), rgba(181, 124, 34, 0.92));
}

.signal-card[data-tone='Bitacora'] {
  background:
    radial-gradient(circle at top right, rgba(255, 255, 255, 0.94), transparent 38%),
    linear-gradient(160deg, rgba(22, 45, 56, 0.98), rgba(38, 122, 139, 0.92));
}

.signal-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.signal-card__head span,
.signal-card__head small {
  position: relative;
  z-index: 1;
}

.signal-card__head span {
  font-size: 0.77rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: rgba(243, 248, 255, 0.8);
}

.signal-card__head small {
  padding: 0.22rem 0.5rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #fff;
}

.signal-card strong,
.signal-card p {
  position: relative;
  z-index: 1;
}

.signal-card strong {
  font-size: clamp(1.9rem, 2.6vw, 2.45rem);
  line-height: 1;
  color: #fff;
}

.signal-card p {
  margin: 0;
  max-width: 19rem;
  font-size: 0.95rem;
  line-height: 1.42;
  color: rgba(242, 247, 255, 0.86);
}

@media (max-width: 1120px) {
  .status-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .status-strip {
    grid-template-columns: 1fr;
  }

  .signal-card {
    border-radius: 20px;
  }
}
</style>
