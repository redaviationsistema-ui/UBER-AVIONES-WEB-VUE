<script setup>
import { computed } from 'vue'
import { resolveRoleSectionPath } from '../../data/roleFlows'

const props = defineProps({
  title: { type: String, required: true },
  description: { type: String, required: true },
  descriptor: { type: Object, required: true },
  activeSection: { type: Object, default: null },
  siblingSections: { type: Array, default: () => [] },
  metrics: { type: Array, default: () => [] },
  standards: { type: Array, default: () => [] },
  statusTimeline: { type: Array, default: () => [] },
})

const leadMetrics = computed(() => props.metrics.slice(0, 3))
const primarySections = computed(() => props.siblingSections.slice(0, 6))
</script>

<template>
  <div class="admin-section-scaffold">
    <section class="admin-section-scaffold__shell">
      <aside class="admin-section-scaffold__rail">
        <div class="admin-section-scaffold__rail-card admin-section-scaffold__rail-card--brand">
          <p class="admin-section-scaffold__eyebrow">{{ props.descriptor.pattern }}</p>
          <strong>{{ props.descriptor.title }}</strong>
          <span>{{ props.descriptor.cadence || 'Operacion continua' }}</span>
        </div>

        <nav class="admin-section-scaffold__rail-nav" aria-label="Subsecciones administrativas">
          <RouterLink
            v-for="item in primarySections"
            :key="item.id"
            :to="resolveRoleSectionPath('admin', item)"
            class="admin-section-scaffold__rail-link"
            :class="{ 'admin-section-scaffold__rail-link--active': item.id === props.activeSection?.id }"
          >
            <small>{{ props.descriptor.pattern }}</small>
            <strong>{{ item.label }}</strong>
            <span>{{ item.description }}</span>
          </RouterLink>
        </nav>
      </aside>

      <main class="admin-section-scaffold__main">
        <section class="admin-section-scaffold__hero">
          <div class="admin-section-scaffold__copy">
            <p class="admin-section-scaffold__eyebrow">Vista activa</p>
            <h1>{{ props.title }}</h1>
            <p>{{ props.description }}</p>

            <div class="admin-section-scaffold__chips">
              <span v-for="metric in leadMetrics" :key="metric.label" class="admin-section-scaffold__chip">
                {{ metric.label }}: {{ metric.value }}
              </span>
            </div>
          </div>

          <div class="admin-section-scaffold__focus">
            <span>Frente activo</span>
            <strong>{{ props.descriptor.title }}</strong>
            <p>{{ props.descriptor.headline }}</p>
          </div>
        </section>

        <section class="admin-section-scaffold__toolbar">
          <div class="admin-section-scaffold__toolbar-copy">
            <strong>{{ props.activeSection?.label || props.title }}</strong>
            <p>{{ props.activeSection?.description || props.description }}</p>
          </div>

          <dl class="admin-section-scaffold__metrics">
            <div v-for="metric in leadMetrics" :key="metric.label">
              <dt>{{ metric.label }}</dt>
              <dd>{{ metric.value }}</dd>
            </div>
          </dl>
        </section>

        <section class="admin-section-scaffold__content">
          <slot />
        </section>
      </main>

      <aside class="admin-section-scaffold__context">
        <div class="admin-section-scaffold__context-card">
          <p class="admin-section-scaffold__eyebrow">Criterios</p>
          <h2>Como leer esta vista</h2>
          <ul class="admin-section-scaffold__list">
            <li v-for="item in props.standards" :key="item">{{ item }}</li>
          </ul>
        </div>

        <div class="admin-section-scaffold__context-card">
          <p class="admin-section-scaffold__eyebrow">Timeline</p>
          <div class="admin-section-scaffold__timeline">
            <article
              v-for="item in props.statusTimeline"
              :key="`${item.label}-${item.value}`"
              class="admin-section-scaffold__timeline-item"
            >
              <small>{{ item.label }}</small>
              <strong>{{ item.value }}</strong>
              <p>{{ item.note }}</p>
            </article>
          </div>
        </div>
      </aside>
    </section>
   </div>
</template>

<style scoped>
.admin-section-scaffold {
  display: grid;
  gap: 1.15rem;
}

.admin-section-scaffold__shell {
  display: grid;
  grid-template-columns: minmax(220px, 0.68fr) minmax(0, 1.85fr) minmax(260px, 0.82fr);
  gap: 1rem;
}

.admin-section-scaffold__rail,
.admin-section-scaffold__main,
.admin-section-scaffold__context {
  min-width: 0;
}

.admin-section-scaffold__rail {
  display: grid;
  align-content: start;
  gap: 0.9rem;
  position: sticky;
  top: 1rem;
  align-self: start;
}

.admin-section-scaffold__eyebrow,
.admin-section-scaffold__focus span,
.admin-section-scaffold__metrics dt,
.admin-section-scaffold__rail-link small,
.admin-section-scaffold__timeline-item small {
  margin: 0;
  color: #5d76a3;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.admin-section-scaffold__rail-card,
.admin-section-scaffold__context-card,
.admin-section-scaffold__hero,
.admin-section-scaffold__toolbar {
  display: grid;
  gap: 0.9rem;
  padding: 1rem 1.1rem;
  border: 1px solid rgba(103, 132, 188, 0.16);
  border-radius: 24px;
  background: rgba(250, 252, 255, 0.88);
  box-shadow: 0 18px 44px rgba(43, 75, 132, 0.08);
}

.admin-section-scaffold__rail-card--brand {
  background:
    radial-gradient(circle at top left, rgba(191, 210, 248, 0.46), transparent 55%),
    linear-gradient(180deg, rgba(248, 251, 255, 0.98), rgba(236, 244, 255, 0.94));
}

.admin-section-scaffold__rail-card strong,
.admin-section-scaffold__toolbar-copy strong,
.admin-section-scaffold__context-card h2 {
  color: #122845;
}

.admin-section-scaffold__rail-card strong {
  font-size: 1.3rem;
  letter-spacing: -0.03em;
}

.admin-section-scaffold__rail-card span,
.admin-section-scaffold__toolbar-copy p,
.admin-section-scaffold__focus p,
.admin-section-scaffold__context-card p,
.admin-section-scaffold__timeline-item p,
.admin-section-scaffold__rail-link span {
  color: #617391;
  line-height: 1.55;
}

.admin-section-scaffold__rail-nav {
  display: grid;
  gap: 0.75rem;
}

.admin-section-scaffold__rail-link {
  display: grid;
  gap: 0.18rem;
  padding: 0.9rem 0.95rem;
  border: 1px solid rgba(103, 132, 188, 0.12);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.76);
  text-decoration: none;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.admin-section-scaffold__rail-link:hover,
.admin-section-scaffold__rail-link--active {
  transform: translateY(-1px);
  border-color: rgba(73, 109, 189, 0.28);
  background: linear-gradient(180deg, rgba(229, 237, 255, 0.92), rgba(247, 250, 255, 0.95));
  box-shadow: 0 14px 28px rgba(78, 111, 180, 0.12);
}

.admin-section-scaffold__rail-link strong {
  color: #163253;
  font-size: 1rem;
}

.admin-section-scaffold__main {
  display: grid;
  gap: 1rem;
}

.admin-section-scaffold__hero {
  grid-template-columns: minmax(0, 1.45fr) minmax(260px, 0.8fr);
}

.admin-section-scaffold__copy,
.admin-section-scaffold__focus,
.admin-section-scaffold__toolbar-copy {
  display: grid;
  gap: 0.3rem;
}

.admin-section-scaffold__copy h1,
.admin-section-scaffold__focus strong {
  margin: 0;
  color: #11253f;
  letter-spacing: -0.04em;
}

.admin-section-scaffold__copy h1 {
  font-size: clamp(1.7rem, 3vw, 2.5rem);
}

.admin-section-scaffold__copy p,
.admin-section-scaffold__focus p,
.admin-section-scaffold__metrics dd {
  margin: 0;
  color: #617391;
  line-height: 1.55;
}

.admin-section-scaffold__focus {
  padding: 0.95rem 1rem;
  border-left: 1px solid rgba(103, 132, 188, 0.16);
}

.admin-section-scaffold__focus strong {
  font-size: 1.2rem;
}

.admin-section-scaffold__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-top: 0.25rem;
}

.admin-section-scaffold__chip {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0 0.8rem;
  border: 1px solid rgba(103, 132, 188, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.78);
  color: #30507f;
  font-size: 0.8rem;
  font-weight: 700;
}

.admin-section-scaffold__toolbar {
  grid-template-columns: minmax(0, 1fr) minmax(220px, 0.72fr);
  align-items: start;
}

.admin-section-scaffold__metrics {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.75rem;
  margin: 0;
}

.admin-section-scaffold__metrics div {
  display: grid;
  gap: 0.15rem;
  padding: 0.8rem;
  border: 1px solid rgba(103, 132, 188, 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.82);
}

.admin-section-scaffold__metrics dd {
  color: #183252;
  font-size: 1rem;
  font-weight: 700;
}

.admin-section-scaffold__content {
  min-width: 0;
}

.admin-section-scaffold__context {
  display: grid;
  align-content: start;
  gap: 1rem;
  position: sticky;
  top: 1rem;
  align-self: start;
}

.admin-section-scaffold__context-card h2 {
  margin: 0;
  font-size: 1.2rem;
  letter-spacing: -0.03em;
}

.admin-section-scaffold__list,
.admin-section-scaffold__timeline {
  display: grid;
  gap: 0.7rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.admin-section-scaffold__list li,
.admin-section-scaffold__timeline-item {
  display: grid;
  gap: 0.18rem;
  padding: 0.85rem 0.9rem;
  border: 1px solid rgba(103, 132, 188, 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.78);
}

.admin-section-scaffold__timeline-item strong {
  color: #163253;
}

@media (max-width: 1080px) {
  .admin-section-scaffold__shell,
  .admin-section-scaffold__hero,
  .admin-section-scaffold__toolbar {
    grid-template-columns: 1fr;
  }

  .admin-section-scaffold__rail,
  .admin-section-scaffold__context {
    position: static;
  }

  .admin-section-scaffold__focus {
    border-left: 0;
    border-top: 1px solid rgba(103, 132, 188, 0.16);
    padding-left: 0;
    padding-right: 0;
  }
}

@media (max-width: 760px) {
  .admin-section-scaffold__hero,
  .admin-section-scaffold__toolbar,
  .admin-section-scaffold__rail-card,
  .admin-section-scaffold__context-card {
    border-radius: 20px;
  }
}
</style>
