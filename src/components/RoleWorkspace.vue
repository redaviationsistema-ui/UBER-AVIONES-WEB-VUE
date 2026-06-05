<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import BrandLogo from './BrandLogo.vue'
import { buildMenuGroups, roleBasePaths, roleSections } from '../data/roleFlows'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'

const AdminPortal = defineAsyncComponent(() => import('../features/admin/AdminPortal.vue'))
const ClientPortal = defineAsyncComponent(() => import('../features/client/ClientPortal.vue'))
const CrewPortal = defineAsyncComponent(() => import('../features/crew/CrewPortal.vue'))
const OperatorPortal = defineAsyncComponent(
  () => import('../features/operator/portal/OperatorPortal.vue'),
)

const props = defineProps({
  role: { type: Object, required: true },
  activeRole: { type: String, required: true },
  section: { type: String, required: true },
})


const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()
const activeMenuGroup = ref('')
const mobileMenuOpen = ref(false)
const desktopMenuOpen = ref(false)

const currentMenu = computed(() => roleSections[props.activeRole] ?? [])
const currentSectionLabel = computed(
  () =>
    currentMenu.value.find((item) => item.id === props.section)?.label ||
    currentMenu.value[0]?.label ||
    '',
)
const groupedMenu = computed(() => buildMenuGroups(props.activeRole, currentMenu.value))
const isClientWorkspace = computed(() => props.activeRole === 'client')
const isClientDashboard = computed(
  () => props.activeRole === 'client' && props.section === 'dashboard',
)
const usesWorkspaceMenu = computed(
  () => !isClientWorkspace.value && !isClientDashboard.value && groupedMenu.value.length > 0,
)
const isSessionReady = computed(() => auth.initialized && auth.isAuthenticated)
const showPortalHeader = computed(
  () => !(props.activeRole === 'crew' && props.section === 'perfil'),
)

const roleInsights = {
  client: {
    title: 'Reserva integral ',
    description: 'Busca, compara, reserva, firma y paga sin salir del ecosistema .',
  },
  operator: {
    title: 'Publicacion y respuesta operativa',
    description:
      '',
  },
  crew: {
    title: 'Agenda, cabina y servicio',
    description: 'Todo lo necesario para operar con orden, visibilidad y seguimiento claro.',
  },
  admin: {
    title: 'Control total ',
    description:
      'Administra inventario, precios, reservas, soporte, margenes y reglas de negocio desde una vista central.',
  },
}

const currentGroup = computed(
  () =>
    groupedMenu.value.find((group) => group.label === activeMenuGroup.value) || groupedMenu.value[0] || null,
)

function resolveActiveGroupLabel() {
  return (
    groupedMenu.value.find((group) => group.items.some((item) => item.id === props.section))?.label ||
    groupedMenu.value[0]?.label ||
    ''
  )
}

function openMenuGroup(label) {
  if (activeMenuGroup.value === label) {
    desktopMenuOpen.value = !desktopMenuOpen.value
  } else {
    activeMenuGroup.value = label
    desktopMenuOpen.value = true
  }
  mobileMenuOpen.value = false
}

async function handleLogout() {
  auth.logout()
  ui.pushToast({
    tone: 'success',
    title: 'Sesion cerrada',
    message: 'Se cerraron tus credenciales y regresaste al inicio.',
  })
  router.push({ name: 'home' })
}

watch(
  () => [auth.initialized, auth.isAuthenticated],
  ([initialized, isAuthenticated]) => {
    if (initialized && !isAuthenticated) {
      router.replace({
        name: props.activeRole === 'client' ? 'login-cliente' : 'home',
      })
    }
  },
  { immediate: true },
)

watch(
  () => [props.section, props.activeRole, groupedMenu.value.length],
  () => {
    activeMenuGroup.value = resolveActiveGroupLabel()
    mobileMenuOpen.value = false
    desktopMenuOpen.value = false
  },
  { immediate: true },
)
</script>

<template>
  <div class="workspace-shell">
    <section
      id="workspace"
      class="workspace"
      :class="{
        'workspace-client-dashboard': isClientDashboard,
        'workspace-client': isClientWorkspace,
        'workspace-workflow': usesWorkspaceMenu,
      }"
    >
      <section v-if="usesWorkspaceMenu" class="workspace-menu-shell">
        <div class="workspace-menu-bar">
          <div class="workspace-menu-brand">
            <RouterLink to="/" class="workspace-menu-logo" aria-label="Sky Group">
              <BrandLogo variant="dark" :width="118" />
            </RouterLink>
            <div class="workspace-menu-brand-copy">
              <span class="workspace-menu-badge">{{ role.tone }}</span>
              <strong>{{ role.label }}</strong>
              <small>{{ role.area }}</small>
            </div>
          </div>

          <button
            type="button"
            class="workspace-menu-toggle"
            :aria-expanded="mobileMenuOpen ? 'true' : 'false'"
            :aria-label="mobileMenuOpen ? 'Cerrar menu' : 'Abrir menu'"
            @click="mobileMenuOpen = !mobileMenuOpen"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>

          <nav class="workspace-menu-groups" aria-label="Secciones del portal">
            <button
              v-for="group in groupedMenu"
              :key="group.label"
              type="button"
              class="workspace-menu-group"
              :class="{ 'workspace-menu-group--active': currentGroup?.label === group.label }"
              @click="openMenuGroup(group.label)"
            >
              {{ group.label }}
            </button>
          </nav>

          <div class="workspace-menu-actions">
            <span class="workspace-menu-hint">Operacion centralizada</span>
            <button
              type="button"
              class="workspace-menu-logout"
              @click="handleLogout"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10v-2H6V6h4V4Zm4.6 3.4L13.2 8.8l1.8 1.7H9v2h6l-1.8 1.7 1.4 1.4L19 11l-4.4-4.4Z"
                  fill="currentColor"
                />
              </svg>
              Cerrar sesion
            </button>
          </div>
        </div>

        <div v-if="currentGroup && desktopMenuOpen" class="workspace-mega-menu">
          <div class="workspace-mega-menu__panel">
            <div class="workspace-mega-menu__header">
              <strong>{{ currentGroup.label }}</strong>
              <small>{{ currentGroup.items.length }} opciones</small>
            </div>

            <div class="workspace-submenu-row">
              <RouterLink
                v-for="item in currentGroup.items"
                :key="item.id"
                :to="`${roleBasePaths[activeRole]}/${item.id}`"
                class="workspace-submenu-link"
                :class="{ 'workspace-submenu-link--active': section === item.id }"
              >
                <strong>{{ item.label }}</strong>
                <small>{{ currentGroup.label }}</small>
              </RouterLink>
            </div>
          </div>
        </div>

        <div v-if="mobileMenuOpen" class="workspace-mobile-drawer">
          <div class="workspace-mobile-drawer__sheet">
            <div class="workspace-mobile-drawer__top">
              <RouterLink to="/" class="workspace-mobile-drawer__logo" aria-label="Sky Group">
                <BrandLogo variant="dark" :width="118" />
              </RouterLink>

              <button
                type="button"
                class="workspace-mobile-drawer__close"
                aria-label="Cerrar menu"
                @click="mobileMenuOpen = false"
              >
                <span></span>
                <span></span>
              </button>
            </div>

            <div class="workspace-mobile-drawer__intro">
              <strong>{{ role.label }}</strong>
              <p>{{ roleInsights[activeRole]?.description }}</p>
            </div>

            <section
              v-for="group in groupedMenu"
              :key="`mobile-${group.label}`"
              class="workspace-mobile-group"
            >
              <h3 class="workspace-mobile-group__title">{{ group.label }}</h3>

              <div class="workspace-mobile-links">
                <RouterLink
                  v-for="item in group.items"
                  :key="`mobile-link-${item.id}`"
                  :to="`${roleBasePaths[activeRole]}/${item.id}`"
                  class="workspace-mobile-link"
                  :class="{ 'workspace-mobile-link--active': section === item.id }"
                >
                  <span class="workspace-mobile-link__icon" aria-hidden="true"></span>
                  <span>{{ item.label }}</span>
                </RouterLink>
              </div>
            </section>

            <div class="workspace-mobile-drawer__footer">
              <button
                type="button"
                class="workspace-mobile-logout"
                @click="handleLogout"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10v-2H6V6h4V4Zm4.6 3.4L13.2 8.8l1.8 1.7H9v2h6l-1.8 1.7 1.4 1.4L19 11l-4.4-4.4Z"
                    fill="currentColor"
                  />
                </svg>
                Cerrar sesion
              </button>
            </div>
          </div>
        </div>
      </section>

      <section
        class="portal"
        :class="{
          'portal-client-dashboard': isClientWorkspace,
          'portal-workspace': usesWorkspaceMenu,
        }"
      >
        <header v-if="usesWorkspaceMenu && showPortalHeader" class="portal-header">
          <div>
            <p class="eyebrow">Espacio de trabajo</p>
            <h2>{{ currentSectionLabel }}</h2>
          </div>
          <p class="muted">{{ roleInsights[activeRole]?.description }}</p>
        </header>

        <template v-if="isSessionReady">
          <ClientPortal v-if="activeRole === 'client'" key="client-portal" :section="section" />
          <OperatorPortal v-else-if="activeRole === 'operator'" :key="`operator-${section}`" :section="section" />
          <CrewPortal v-else-if="activeRole === 'crew'" :key="`crew-${section}`" :section="section" />
          <AdminPortal v-else :key="`admin-${section}`" :section="section" />
        </template>
      </section>
    </section>
  </div>
</template>

<style scoped>
.workspace-shell {
  display: grid;
  min-height: calc(100vh - 4.6rem);
}

.workspace {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  padding: clamp(1rem, 3vw, 1.6rem);
}

.workspace-client-dashboard,
.workspace-client {
  gap: 0;
  padding: 0;
}

.workspace-workflow {
  background: #ffffff;
}

.workspace-menu-shell {
  display: grid;
  gap: 0.85rem;
  position: relative;
  z-index: 20;
}

.workspace-menu-bar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: center;
  padding: 0.95rem 1.45rem;
  border: 1px solid rgba(20, 20, 20, 0.06);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 10px 28px rgba(22, 28, 36, 0.06);
}

.workspace-menu-brand {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  min-width: 220px;
}

.workspace-menu-logo {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
}

.workspace-menu-brand-copy {
  display: grid;
  gap: 0.08rem;
}

.workspace-menu-brand strong {
  color: #171717;
  font-size: 0.98rem;
  line-height: 1.1;
}

.workspace-menu-brand small {
  color: #716b63;
  font-size: 0.8rem;
}

.workspace-menu-badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 1.45rem;
  padding: 0 0.55rem;
  border: 1px solid #dde8dc;
  border-radius: 999px;
  background: #f4fbf3;
  color: #4f9b65;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.workspace-menu-groups {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.workspace-menu-groups::-webkit-scrollbar,
.workspace-mega-menu::-webkit-scrollbar {
  display: none;
}

.workspace-menu-toggle {
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.22rem;
  width: 2.9rem;
  min-width: 2.9rem;
  min-height: 2.9rem;
  padding: 0;
  border: 1px solid rgba(20, 20, 20, 0.08);
  border-radius: 999px;
  background: #ffffff;
  color: #171717;
}

.workspace-menu-toggle span {
  display: block;
  width: 1.05rem;
  height: 2px;
  border-radius: 999px;
  background: currentColor;
}

.workspace-menu-group {
  flex: 0 0 auto;
  min-height: 2.9rem;
  padding: 0 0.95rem;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: #1d1d1d;
  font-weight: 700;
}

.workspace-menu-group--active {
  border-color: rgba(188, 141, 47, 0.18);
  background: #f8f4ec;
}

.workspace-menu-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
  min-width: 210px;
}

.workspace-menu-hint {
  color: #81786c;
  font-size: 0.8rem;
  font-weight: 700;
  white-space: nowrap;
}

.workspace-menu-logout {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 2.9rem;
  padding: 0 1rem;
  border: 1px solid rgba(20, 20, 20, 0.08);
  border-radius: 999px;
  background: #ffffff;
  color: #1d1d1d;
  font-weight: 700;
}

.workspace-menu-logout svg {
  width: 1rem;
  height: 1rem;
  flex: 0 0 auto;
}

.workspace-mega-menu {
  position: absolute;
  top: calc(100% - 0.1rem);
  left: 50%;
  transform: translateX(-50%);
  width: min(100%, 540px);
  padding-top: 0.45rem;
  z-index: 30;
}

.workspace-submenu-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.3rem;
}

.workspace-mega-menu__panel {
  width: 100%;
  padding: 0.85rem;
  border: 1px solid rgba(20, 20, 20, 0.08);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 26px 54px rgba(22, 28, 36, 0.14);
}

.workspace-mega-menu__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0 0.2rem 0.75rem;
  margin-bottom: 0.55rem;
  border-bottom: 1px solid rgba(20, 20, 20, 0.08);
}

.workspace-mega-menu__header strong {
  color: #171717;
  font-size: 0.98rem;
}

.workspace-mega-menu__header small {
  color: #8a8276;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.workspace-submenu-link {
  display: inline-grid;
  gap: 0.14rem;
  min-width: 150px;
  padding: 0.78rem 0.92rem;
  border: 1px solid transparent;
  border-radius: 14px;
  background: transparent;
  color: #171717;
  text-decoration: none;
  box-shadow: none;
}

.workspace-submenu-link strong {
  font-size: 0.94rem;
  line-height: 1.15;
}

.workspace-submenu-link small {
  color: #8a8276;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.workspace-submenu-link:hover {
  background: #f7f3ec;
}

.workspace-submenu-link--active {
  border-color: rgba(188, 141, 47, 0.22);
  background: #fcf8ef;
}

.workspace-mobile-drawer {
  display: none;
}

.portal {
  padding: 0;
  background: #ffffff;
  min-height: calc(100vh - 4.6rem);
}

.portal-workspace {
  padding: 3.4rem 0 0;
}

.portal-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
  padding: 0 0 1rem;
  border-bottom: 1px solid rgba(18, 18, 18, 0.06);
}

.portal-header h2 {
  margin: 0;
  color: #171717;
  font-size: clamp(1.5rem, 3vw, 2.3rem);
}

.eyebrow {
  margin: 0 0 0.3rem;
  color: #bc8d2f;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.portal-header .muted {
  max-width: 460px;
  margin: 0;
  color: #8d99ae;
  text-align: right;
}

@media (max-width: 1080px) {
  .workspace {
    padding: 0.9rem;
  }

  .workspace-menu-bar {
    grid-template-columns: minmax(0, 1fr) auto;
    border-radius: 28px;
    align-items: center;
  }

  .workspace-menu-toggle {
    display: inline-flex;
    justify-self: end;
    grid-column: 2;
    grid-row: 1;
  }

  .workspace-menu-brand {
    min-width: 0;
    grid-column: 1;
    grid-row: 1;
  }

  .workspace-menu-groups,
  .workspace-menu-actions,
  .workspace-mega-menu {
    display: none;
  }

  .workspace-mobile-drawer {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    padding: 0;
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(10px);
  }

  .workspace-mobile-drawer__sheet {
    display: grid;
    grid-template-rows: auto auto auto 1fr auto;
    gap: 1.15rem;
    min-height: 100vh;
    padding: 1.25rem 1.1rem 1.5rem;
    background: #ffffff;
  }

  .workspace-mobile-drawer__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .workspace-mobile-drawer__logo {
    display: inline-flex;
    align-items: center;
  }

  .workspace-mobile-drawer__close {
    position: relative;
    width: 3.2rem;
    min-width: 3.2rem;
    min-height: 3.2rem;
    padding: 0;
    border: 1px solid rgba(20, 20, 20, 0.08);
    border-radius: 999px;
    background: #f8f8f8;
  }

  .workspace-mobile-drawer__close span {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 1rem;
    height: 2px;
    border-radius: 999px;
    background: #5b6270;
  }

  .workspace-mobile-drawer__close span:first-child {
    transform: translate(-50%, -50%) rotate(45deg);
  }

  .workspace-mobile-drawer__close span:last-child {
    transform: translate(-50%, -50%) rotate(-45deg);
  }

  .workspace-mobile-drawer__intro {
    display: grid;
    gap: 0.3rem;
  }

  .workspace-mobile-drawer__intro strong {
    color: #171717;
    font-size: 1.05rem;
    line-height: 1.1;
    text-transform: uppercase;
  }

  .workspace-mobile-drawer__intro p {
    margin: 0;
    color: #6d7483;
    font-size: 0.95rem;
    line-height: 1.35;
  }

  .workspace-mobile-group {
    display: grid;
    gap: 0.65rem;
  }

  .workspace-mobile-group__title {
    margin: 0;
    color: #3b4352;
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .workspace-mobile-links {
    display: grid;
    gap: 0.2rem;
  }

  .workspace-mobile-link {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    padding: 0.72rem 0.1rem;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: #171717;
    text-decoration: none;
    font-size: 0.96rem;
    font-weight: 700;
  }

  .workspace-mobile-link__icon {
    width: 0.9rem;
    height: 0.9rem;
    flex: 0 0 auto;
    border-radius: 0.16rem;
    background: #2f3746;
    box-shadow: inset 0 0 0 2px #ffffff;
  }

  .workspace-mobile-link--active {
    color: #bc8d2f;
  }

  .workspace-mobile-drawer__footer {
    align-self: end;
    display: grid;
    gap: 0.6rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(20, 20, 20, 0.08);
  }

  .workspace-mobile-logout {
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.5rem;
    min-height: 3rem;
    padding: 0 1rem;
    border: 1px solid rgba(20, 20, 20, 0.08);
    border-radius: 18px;
    background: #f7f8fb;
    color: #253044;
    font-weight: 700;
  }

  .workspace-mobile-logout svg {
    width: 1rem;
    height: 1rem;
    flex: 0 0 auto;
  }

  .portal-header {
    flex-direction: column;
    align-items: stretch;
  }

  .portal-header .muted {
    max-width: none;
    text-align: left;
  }
}

@media (max-width: 760px) {
  .workspace {
    gap: 0.8rem;
    padding: 0.65rem;
  }

  .workspace-menu-bar {
    gap: 0.75rem;
    padding: 0.85rem;
    border-radius: 24px;
  }

  .workspace-menu-brand {
    min-width: 0;
    gap: 0.7rem;
  }

  .workspace-menu-brand-copy small {
    display: none;
  }

  .workspace-menu-logo {
    max-width: 108px;
  }

  .workspace-menu-toggle {
    width: 2.7rem;
    min-width: 2.7rem;
    min-height: 2.7rem;
  }
}
</style>
