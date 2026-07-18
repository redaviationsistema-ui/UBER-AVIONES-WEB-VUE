<script setup>
import { computed } from 'vue'
import { resolveWorkspaceIcon } from '../../data/workspaceIcons'

const props = defineProps({
  group: {
    type: Object,
    default: null,
  },
  activeSection: {
    type: String,
    default: '',
  },
  showAllAction: {
    type: Boolean,
    default: true,
  },
})

const emit = defineEmits(['close', 'show-all'])

const modules = computed(() => props.group?.modules || [])

function isActiveModule(module) {
  return module.id === props.activeSection
}

function resolveModuleAccentStyle(module) {
  return {
    '--module-accent': module.color || props.group?.color || '#1E4ED8',
  }
}
</script>

<template>
  <div
    v-if="group"
    class="admin-module-launcher-backdrop"
    role="presentation"
    @click.self="emit('close')"
  >
    <section
      class="admin-module-launcher"
      role="dialog"
      aria-modal="true"
      :aria-label="group.title"
    >
      <header class="admin-module-launcher__header">
        <div class="admin-module-launcher__copy">
          <h2>{{ group.title }}</h2>
          <p>{{ group.description }}</p>
        </div>
      </header>

      <div class="admin-module-launcher__grid">
        <router-link
          v-for="module in modules"
          :key="module.id"
          :to="module.route"
          class="admin-module-card"
          :class="{ 'admin-module-card--active': isActiveModule(module) }"
        >
          <span
            class="admin-module-card__icon"
            :style="resolveModuleAccentStyle(module)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" :d="resolveWorkspaceIcon(module.icon)"></path>
            </svg>
          </span>

          <span class="admin-module-card__body">
            <strong>{{ module.title }}</strong>
            <small>{{ module.groupLabel || group.title }}</small>
          </span>

          <span class="admin-module-card__arrow" aria-hidden="true">-></span>
        </router-link>
      </div>

      <footer v-if="showAllAction" class="admin-module-launcher__footer">
        <div class="admin-module-launcher__footer-copy">
          <strong>Acceso rapido</strong>
          <span>Encuentra lo que necesitas de forma mas rapida.</span>
        </div>

        <button type="button" class="admin-module-launcher__footer-action" @click="emit('show-all')">
          Ver todos los modulos
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.admin-module-launcher-backdrop {
  position: fixed;
  inset: 5.5rem 0 0;
  z-index: 1500;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 1.25rem 1.5rem 2rem;
  background: linear-gradient(180deg, rgba(239, 245, 255, 0.82), rgba(239, 245, 255, 0.68));
  backdrop-filter: blur(10px);
}

.admin-module-launcher {
  width: min(1720px, calc(100vw - 6rem));
  max-height: calc(100vh - 8.5rem);
  padding: 2.9rem 2.4rem 2rem;
  border-radius: 34px;
  background:
    radial-gradient(circle at top left, rgba(227, 236, 255, 0.8), transparent 26%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 251, 255, 0.98));
  border: 1px solid rgba(201, 216, 242, 0.9);
  box-shadow: 0 28px 80px rgba(151, 173, 214, 0.2);
  overflow: hidden;
}

.admin-module-launcher__header,
.admin-module-launcher__footer {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1.5rem;
}

.admin-module-launcher__copy {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 2rem;
  width: 100%;
  padding-bottom: 1.8rem;
  border-bottom: 1px solid rgba(201, 216, 242, 0.85);
}

.admin-module-launcher__copy h2 {
  margin: 0;
  color: #193a6a;
  font-size: clamp(2.1rem, 3.8vw, 3.15rem);
  font-weight: 700;
  letter-spacing: -0.04em;
  line-height: 0.96;
}

.admin-module-launcher__copy p {
  margin: 0;
  max-width: 36rem;
  text-align: right;
  color: #6e89b6;
  font-size: clamp(1.15rem, 2vw, 1.35rem);
  line-height: 1.35;
}

.admin-module-launcher__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.45rem;
  margin: 1.65rem 0 0;
  max-height: calc(100vh - 18rem);
  overflow-y: auto;
  padding-right: 0.35rem;
}

.admin-module-launcher__grid::-webkit-scrollbar {
  width: 6px;
}

.admin-module-launcher__grid::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.4);
  border-radius: 999px;
}

.admin-module-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 1rem;
  min-height: 7rem;
  padding: 1.25rem 1.35rem;
  color: #17345f;
  text-decoration: none;
  border-radius: 2rem;
  border: 1px solid rgba(222, 232, 248, 0.95);
  background: rgba(255, 255, 255, 0.82);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
  transition:
    transform 250ms ease,
    box-shadow 250ms ease,
    border-color 250ms ease,
    background 250ms ease;
}

.admin-module-card:hover {
  transform: translateY(-3px);
  border-color: rgba(132, 167, 229, 0.95);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18px 40px rgba(157, 181, 223, 0.18);
}

.admin-module-card:hover .admin-module-card__arrow {
  transform: translateX(4px);
  color: #6c88b6;
}

.admin-module-card--active {
  border-color: rgba(132, 167, 229, 0.9);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(241, 247, 255, 0.96));
  box-shadow: 0 16px 34px rgba(163, 187, 228, 0.16);
}

.admin-module-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 5.4rem;
  height: 5.4rem;
  border-radius: 1.55rem;
  color: #6788be;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(239, 245, 255, 0.88));
  border: 1px solid rgba(197, 214, 243, 0.9);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.95);
}

.admin-module-card__icon svg {
  width: 1.65rem;
  height: 1.65rem;
}

.admin-module-card__body {
  display: grid;
  gap: 0.28rem;
  min-width: 0;
}

.admin-module-card__body strong {
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.admin-module-card__body small {
  color: #6f8abb;
  font-size: 0.95rem;
  line-height: 1.2;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.admin-module-card__arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3.9rem;
  height: 3.9rem;
  border-radius: 999px;
  border: 1px solid rgba(205, 219, 243, 0.92);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(241, 247, 255, 0.9));
  color: #6b86b3;
  font-size: 1.35rem;
  line-height: 1;
  transition:
    transform 250ms ease,
    color 250ms ease,
    box-shadow 250ms ease;
}

.admin-module-card:hover .admin-module-card__arrow {
  box-shadow: 0 12px 22px rgba(162, 183, 219, 0.18);
}

.admin-module-launcher__footer {
  align-items: center;
  margin-top: 1.35rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(201, 216, 242, 0.85);
}

.admin-module-launcher__footer-copy {
  display: grid;
  gap: 0.2rem;
}

.admin-module-launcher__footer-copy strong {
  color: #0f172a;
  font-size: 0.96rem;
  font-weight: 700;
}

.admin-module-launcher__footer-copy span {
  color: #64748b;
  font-size: 0.9rem;
}

.admin-module-launcher__footer-action {
  min-height: 2.9rem;
  padding: 0 1.1rem;
  color: #1e4ed8;
  font-size: 0.92rem;
  font-weight: 700;
  border: 1px solid rgba(30, 78, 216, 0.18);
  border-radius: 999px;
  background: #f8fbff;
  cursor: pointer;
  transition:
    transform 250ms ease,
    box-shadow 250ms ease,
    background 250ms ease;
}

.admin-module-launcher__footer-action:hover {
  transform: translateY(-1px);
  background: #edf4ff;
  box-shadow: 0 10px 24px rgba(30, 78, 216, 0.12);
}

@media (max-width: 920px) {
  .admin-module-launcher-backdrop {
    inset: 5rem 0 0;
    padding-inline: 1rem;
  }

  .admin-module-launcher {
    width: calc(100vw - 2rem);
    padding: 1.75rem;
  }

  .admin-module-launcher__copy {
    display: grid;
    justify-content: stretch;
    gap: 0.75rem;
    align-items: start;
  }

  .admin-module-launcher__copy p {
    max-width: none;
    text-align: left;
  }
}

@media (max-width: 720px) {
  .admin-module-launcher-backdrop {
    inset: 4.8rem 0 0;
    padding: 0.75rem;
    align-items: flex-start;
  }

  .admin-module-launcher {
    width: calc(100vw - 1rem);
    max-height: calc(100vh - 5.5rem);
    padding: 1.2rem;
    border-radius: 24px;
  }

  .admin-module-launcher__grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.8rem;
  }

  .admin-module-card {
    min-height: 6rem;
    padding: 1rem;
    border-radius: 18px;
  }

  .admin-module-card__icon {
    width: 4rem;
    height: 4rem;
    border-radius: 1.2rem;
  }

  .admin-module-card__arrow {
    width: 3rem;
    height: 3rem;
    font-size: 1.1rem;
  }
}
</style>
