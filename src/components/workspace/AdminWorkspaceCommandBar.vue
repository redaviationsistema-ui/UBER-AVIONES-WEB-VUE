<script setup>
const props = defineProps({
  descriptor: { type: Object, required: true },
  activeSection: { type: Object, default: null },
  metrics: { type: Array, default: () => [] },
})
</script>

<template>
  <section class="admin-command-bar">
    <div class="admin-command-bar__copy">
      <p class="admin-command-bar__eyebrow">{{ props.descriptor.pattern }}</p>
      <h2>{{ props.descriptor.title }}</h2>
      <p>{{ props.descriptor.headline }}</p>
    </div>

    <dl class="admin-command-bar__metrics">
      <div v-for="metric in props.metrics" :key="metric.label">
        <dt>{{ metric.label }}</dt>
        <dd>{{ metric.value }}</dd>
      </div>
    </dl>

    <div class="admin-command-bar__focus">
      <span>Foco actual</span>
      <strong>{{ props.activeSection?.label || 'Sin seccion activa' }}</strong>
      <p>{{ props.activeSection?.description || props.descriptor.note }}</p>
    </div>
  </section>
</template>

<style scoped>
.admin-command-bar {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(260px, 0.9fr) minmax(260px, 0.9fr);
  gap: 1rem;
  padding: 1rem 1.1rem;
  border: 1px solid rgba(104, 133, 186, 0.18);
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(251, 253, 255, 0.96), rgba(241, 246, 255, 0.96));
  box-shadow: 0 20px 50px rgba(39, 72, 128, 0.08);
}

.admin-command-bar__copy,
.admin-command-bar__focus {
  display: grid;
  gap: 0.3rem;
}

.admin-command-bar__eyebrow,
.admin-command-bar__focus span,
.admin-command-bar__metrics dt {
  margin: 0;
  color: #5a74a0;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.admin-command-bar__copy h2,
.admin-command-bar__focus strong {
  margin: 0;
  color: #13253f;
}

.admin-command-bar__copy h2 {
  font-size: clamp(1.55rem, 3vw, 2.3rem);
  line-height: 1;
  letter-spacing: -0.04em;
}

.admin-command-bar__copy p,
.admin-command-bar__focus p,
.admin-command-bar__metrics dd {
  margin: 0;
  color: #5f728f;
  line-height: 1.55;
}

.admin-command-bar__metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  margin: 0;
}

.admin-command-bar__metrics div {
  display: grid;
  gap: 0.15rem;
  padding: 0.8rem;
  border: 1px solid rgba(110, 137, 188, 0.14);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.8);
}

.admin-command-bar__metrics dd {
  color: #19304f;
  font-size: 1.05rem;
  font-weight: 700;
}

.admin-command-bar__focus {
  padding: 0.85rem 1rem;
  border-left: 1px solid rgba(110, 137, 188, 0.14);
}

@media (max-width: 1080px) {
  .admin-command-bar {
    grid-template-columns: 1fr;
  }

  .admin-command-bar__metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .admin-command-bar__focus {
    border-left: 0;
    border-top: 1px solid rgba(110, 137, 188, 0.14);
    padding-left: 0;
    padding-right: 0;
  }
}

@media (max-width: 760px) {
  .admin-command-bar__metrics {
    grid-template-columns: 1fr;
  }
}
</style>
