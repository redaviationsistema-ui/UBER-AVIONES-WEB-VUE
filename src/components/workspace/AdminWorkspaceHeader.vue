<script setup>
import { computed } from 'vue'
import AdminWorkspaceCommandBar from './AdminWorkspaceCommandBar.vue'
import { getAdminWorkspaceSummary } from '../../features/admin/adminWorkspaceMeta'

const props = defineProps({
  section: { type: String, required: true },
  currentSectionLabel: { type: String, required: true },
  currentGroup: { type: Object, default: null },
  groupedMenu: { type: Array, default: () => [] },
})

const summary = computed(() =>
  getAdminWorkspaceSummary(props.section, props.currentGroup, props.groupedMenu),
)
</script>

<template>
  <header class="admin-workspace-header">
    <AdminWorkspaceCommandBar
      :descriptor="summary.descriptor"
      :active-section="summary.activeSection"
      :metrics="summary.metrics"
    />

    <section class="admin-workspace-layout">
      <article class="admin-workspace-panel admin-workspace-panel--list">
        <div class="admin-workspace-panel__header">
          <p class="eyebrow">Seccion activa</p>
          <h1>{{ props.currentSectionLabel }}</h1>
          <p>
            {{ summary.activeSection?.description || summary.descriptor.note }}
          </p>
        </div>

        <ol class="admin-workspace-sections">
          <li
            v-for="item in summary.sections"
            :key="item.id"
            :class="{ 'admin-workspace-sections__item--active': item.id === props.section }"
          >
            <span>{{ String(item.order).padStart(2, '0') }}</span>
            <div>
              <strong>{{ item.label }}</strong>
              <p>{{ item.description }}</p>
            </div>
          </li>
        </ol>
      </article>

      <aside class="admin-workspace-panel admin-workspace-panel--notes">
        <div class="admin-workspace-panel__header">
          <p class="eyebrow">Principios</p>
          <h2>Admin pensado como sistema</h2>
          <p>{{ summary.descriptor.note }}</p>
        </div>

        <ul class="admin-workspace-principles">
          <li v-for="principle in summary.principles" :key="principle">{{ principle }}</li>
        </ul>
      </aside>
    </section>
  </header>
</template>

<style scoped>
.admin-workspace-header {
  display: grid;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.admin-workspace-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.8fr);
  gap: 1rem;
}

.admin-workspace-panel {
  display: grid;
  gap: 1rem;
  padding: 1rem 1.1rem;
  border: 1px solid rgba(104, 133, 186, 0.16);
  border-radius: 24px;
  background: rgba(250, 252, 255, 0.88);
  box-shadow: 0 18px 40px rgba(55, 83, 135, 0.08);
}

.admin-workspace-panel__header {
  display: grid;
  gap: 0.25rem;
}

.admin-workspace-panel__header h1,
.admin-workspace-panel__header h2 {
  margin: 0;
  color: #142742;
  letter-spacing: -0.04em;
}

.admin-workspace-panel__header h1 {
  font-size: clamp(1.85rem, 3vw, 2.6rem);
}

.admin-workspace-panel__header h2 {
  font-size: clamp(1.35rem, 2.6vw, 1.9rem);
}

.admin-workspace-panel__header p,
.admin-workspace-sections p,
.admin-workspace-principles li {
  margin: 0;
  color: #60728e;
  line-height: 1.6;
}

.eyebrow {
  margin: 0;
  color: #5671a0;
  font-size: 0.73rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.admin-workspace-sections {
  display: grid;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.admin-workspace-sections li {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.9rem;
  align-items: start;
  padding: 0.85rem 0.95rem;
  border: 1px solid rgba(112, 139, 190, 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.76);
}

.admin-workspace-sections li span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.1rem;
  min-height: 2.1rem;
  border-radius: 999px;
  background: #e9f0ff;
  color: #31579d;
  font-size: 0.82rem;
  font-weight: 800;
}

.admin-workspace-sections li strong {
  color: #173152;
}

.admin-workspace-sections__item--active {
  border-color: rgba(74, 110, 190, 0.22);
  background: linear-gradient(180deg, rgba(230, 238, 255, 0.92), rgba(247, 250, 255, 0.95));
}

.admin-workspace-principles {
  display: grid;
  gap: 0.65rem;
  margin: 0;
  padding-left: 1.1rem;
}

@media (max-width: 1080px) {
  .admin-workspace-layout {
    grid-template-columns: 1fr;
  }
}
</style>
