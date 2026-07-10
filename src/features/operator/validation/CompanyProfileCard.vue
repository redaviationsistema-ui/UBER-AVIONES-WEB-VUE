<script setup>
defineProps({
  title: { type: String, default: 'Informacion de empresa' },
  eyebrow: { type: String, default: 'Empresa' },
  items: { type: Array, default: () => [] },
})
</script>

<template>
  <section class="company-profile-card">
    <header class="company-profile-card__head">
      <div>
        <p class="company-profile-card__eyebrow">{{ eyebrow }}</p>
        <h3>{{ title }}</h3>
      </div>
    </header>

    <div class="company-profile-card__grid">
      <article v-for="item in items" :key="item.label" class="company-profile-card__item">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
      </article>
    </div>
  </section>
</template>

<style scoped>
.company-profile-card {
  display: grid;
  gap: 18px;
  padding: 22px;
  border-radius: 24px;
  border: 1px solid rgba(21, 50, 77, 0.08);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 246, 241, 0.96));
}

.company-profile-card__eyebrow {
  margin: 0 0 6px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.78rem;
  font-weight: 700;
  color: #5f87c7;
}

.company-profile-card__head h3 {
  margin: 0;
  color: #15324d;
}

.company-profile-card__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.company-profile-card__item {
  display: grid;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(21, 50, 77, 0.08);
}

.company-profile-card__item span {
  font-size: 0.84rem;
  color: #6f8096;
}

.company-profile-card__item strong {
  color: #15324d;
}

@media (max-width: 900px) {
  .company-profile-card__grid {
    grid-template-columns: 1fr;
  }
}
</style>
