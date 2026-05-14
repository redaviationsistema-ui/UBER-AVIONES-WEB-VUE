<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AdminPortal from '../features/admin/AdminPortal.vue'
import ClientPortal from '../features/client/ClientPortal.vue'
import CrewPortal from '../features/crew/CrewPortal.vue'
import OperatorPortal from '../features/operator/OperatorPortal.vue'
import { buildMenuGroups, roleBasePaths, roleSections } from '../data/roleFlows'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'

const props = defineProps({
  role: { type: Object, required: true },
  activeRole: { type: String, required: true },
  section: { type: String, required: true },
})

const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()
const openSidebarMenu = ref('')

const currentMenu = computed(() => roleSections[props.activeRole] ?? [])
const currentSectionLabel = computed(
  () => currentMenu.value.find((item) => item.id === props.section)?.label || currentMenu.value[0]?.label || '',
)
const groupedMenu = computed(() => buildMenuGroups(props.activeRole, currentMenu.value))
const isClientWorkspace = computed(() => props.activeRole === 'client')
const isCrewWorkspace = computed(() => props.activeRole === 'crew')
const isOperatorWorkspace = computed(() => props.activeRole === 'operator')
const isAdminWorkspace = computed(() => props.activeRole === 'admin')
const isClientDashboard = computed(
  () => props.activeRole === 'client' && props.section === 'dashboard',
)
const isSessionReady = computed(() => auth.initialized && auth.isAuthenticated)

const roleInsights = {
  client: {
    title: 'Reserva integral con Red Aviation',
    description: 'Busca, compara, reserva, firma y paga sin salir del ecosistema Red Aviation.',
  },
  operator: {
    title: 'Publicacion y respuesta operativa',
    description: 'Publica aeronaves, abre disponibilidad y acepta o rechaza solicitudes sin contacto directo con el cliente.',
  },
  crew: {
    title: 'Agenda, cabina y servicio',
    description: 'Todo lo necesario para operar con orden, visibilidad y seguimiento claro.',
  },
  admin: {
    title: 'Control total de Red Aviation',
    description: 'Administra inventario, precios, reservas, soporte, margenes y reglas de negocio desde una vista central.',
  },
}

async function handleLogout() {
  await auth.logout()
  ui.pushToast({
    tone: 'success',
    title: 'Sesion cerrada',
    message: 'Se cerraron tus credenciales y regresaste al inicio.',
  })
  router.push('/')
}

function toggleSidebarMenu(label) {
  openSidebarMenu.value = openSidebarMenu.value === label ? '' : label
}

function isSidebarMenuOpen(label) {
  return openSidebarMenu.value === label
}

watch(
  () => [auth.initialized, auth.isAuthenticated],
  ([initialized, isAuthenticated]) => {
    if (initialized && !isAuthenticated) {
      router.replace({
        name: props.activeRole === 'client' ? 'login-cliente' : 'acceso',
        query: { redirect: router.currentRoute.value.fullPath },
      })
    }
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
        'workspace-crew': isCrewWorkspace,
        'workspace-operator': isOperatorWorkspace,
        'workspace-admin': isAdminWorkspace,
      }"
    >
      <aside
        v-if="!isClientWorkspace && !isClientDashboard && !isCrewWorkspace && !isOperatorWorkspace && !isAdminWorkspace"
        class="sidebar"
      >
      <section class="surface overview-card">
        <span class="badge success">{{ role.tone }}</span>
        <strong>{{ role.label }}</strong>
        <p>{{ role.area }}</p>
        <div class="role-summary">
          <h3>{{ roleInsights[activeRole]?.title }}</h3>
          <p>{{ roleInsights[activeRole]?.description }}</p>
        </div>
      </section>

      <section class="surface navigation-card">
        <div class="card-head">
          <span class="eyebrow">Navegacion</span>
          <strong>{{ currentSectionLabel }}</strong>
        </div>

        <div class="sidebar-menu">
          <section
            v-for="group in groupedMenu"
            :key="group.label"
            class="sidebar-dropdown"
            :class="{ 'sidebar-dropdown-open': isSidebarMenuOpen(group.label) }"
          >
            <button
              type="button"
              class="sidebar-dropdown-trigger"
              :aria-expanded="isSidebarMenuOpen(group.label) ? 'true' : 'false'"
              @click="toggleSidebarMenu(group.label)"
            >
              <span class="menu-copy">
                <strong>{{ group.label }}</strong>
                <small>{{ group.items.find((item) => item.id === section)?.label || `${group.items.length} modulos` }}</small>
              </span>
              <span class="sidebar-caret"></span>
            </button>

            <div v-if="isSidebarMenuOpen(group.label)" class="sidebar-dropdown-panel">
              <RouterLink
                v-for="item in group.items"
                :key="item.id"
                :class="{ active: section === item.id }"
                :to="`${roleBasePaths[activeRole]}/${item.id}`"
              >
                <span class="menu-copy">
                  <strong>{{ item.label }}</strong>
                  <small>{{ role.label }}</small>
                </span>
                <span class="menu-indicator"></span>
              </RouterLink>
            </div>
          </section>
        </div>
      </section>

      <section class="surface support-card">
        <span class="badge">Operacion centralizada</span>
        <p>Sky Group concentra seguimiento, servicio y validaciones en una misma experiencia.</p>
      </section>

      <button v-if="auth.isAuthenticated" type="button" class="logout-button" @click="handleLogout">
        Cerrar sesion
      </button>
    </aside>

      <section
        class="portal"
        :class="{
          surface: !isClientWorkspace && !isClientDashboard && !isCrewWorkspace && !isOperatorWorkspace && !isAdminWorkspace,
          'portal-client-dashboard': isClientWorkspace,
          'portal-crew': isCrewWorkspace,
          'portal-operator': isOperatorWorkspace,
          'portal-admin': isAdminWorkspace,
        }"
      >
        <header
          v-if="!isClientWorkspace && !isClientDashboard && !isCrewWorkspace && !isOperatorWorkspace && !isAdminWorkspace"
          class="portal-header"
        >
        <div>
          <p class="eyebrow">Workspace</p>
          <h2>{{ currentSectionLabel }}</h2>
        </div>
        <p class="muted">{{ roleInsights[activeRole]?.description }}</p>
        </header>

        <template v-if="isSessionReady">
          <ClientPortal v-if="activeRole === 'client'" :section="section" />
          <OperatorPortal v-else-if="activeRole === 'operator'" :section="section" />
          <CrewPortal v-else-if="activeRole === 'crew'" :section="section" />
          <AdminPortal v-else :section="section" />
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
  grid-template-columns: minmax(280px, 320px) minmax(0, 1fr);
  gap: 1.2rem;
  padding: clamp(1rem, 4vw, 2.4rem);
}

.workspace-client-dashboard {
  grid-template-columns: 1fr;
  gap: 0;
  padding: 0;
}

.workspace-client {
  grid-template-columns: 1fr;
  gap: 0;
  padding: 0;
}

.workspace-crew {
  grid-template-columns: 1fr;
  gap: 0;
  padding: 0;
  background: #ffffff;
  min-height: calc(100vh - 4.6rem);
}

.workspace-operator {
  grid-template-columns: 1fr;
  gap: 0;
  padding: 0;
  background: #ffffff;
  min-height: calc(100vh - 4.6rem);
}

.workspace-admin {
  grid-template-columns: 1fr;
  gap: 0;
  padding: 0;
  background: #ffffff;
  min-height: calc(100vh - 4.6rem);
}

.sidebar {
  position: sticky;
  top: 6.8rem;
  align-self: start;
  display: grid;
  gap: 1rem;
}

.overview-card,
.navigation-card,
.support-card {
  padding: 1rem;
}

.overview-card strong {
  display: block;
  margin: 0.8rem 0 0.25rem;
  font-size: 1.4rem;
}

.overview-card p,
.role-summary p,
.support-card p {
  margin: 0;
  color: #aeb6c4;
  line-height: 1.6;
}

.role-summary {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.role-summary h3 {
  margin-bottom: 0.45rem;
  font-size: 1rem;
}

.card-head {
  display: grid;
  gap: 0.2rem;
  margin-bottom: 0.9rem;
}

.card-head strong {
  font-size: 1.05rem;
}

.sidebar-menu {
  display: grid;
  gap: 0.75rem;
}

.sidebar-dropdown {
  display: grid;
  gap: 0.55rem;
}

.sidebar-dropdown-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.9rem;
  width: 100%;
  padding: 0.8rem 0.9rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  color: #cfd5df;
  background: rgba(255, 255, 255, 0.03);
  text-align: left;
  transition:
    border-color 180ms ease,
    background 180ms ease;
}

.sidebar-dropdown-trigger:hover,
.sidebar-dropdown-open .sidebar-dropdown-trigger {
  border-color: rgba(216, 180, 91, 0.24);
  background: rgba(255, 255, 255, 0.05);
}

.sidebar-dropdown-panel {
  display: grid;
  gap: 0.55rem;
}

.sidebar-caret {
  width: 0.7rem;
  height: 0.7rem;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(45deg);
  opacity: 0.7;
  transition: transform 180ms ease;
}

.sidebar-dropdown-open .sidebar-caret {
  transform: rotate(225deg);
}

.sidebar-menu a {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 0.8rem 0.9rem;
  color: #cfd5df;
  text-decoration: none;
  background: rgba(255, 255, 255, 0.03);
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background 180ms ease;
}

.sidebar-menu a:hover {
  transform: translateY(-1px);
  border-color: rgba(216, 180, 91, 0.22);
  background: rgba(255, 255, 255, 0.05);
}

.sidebar-menu a.active {
  border-color: rgba(216, 180, 91, 0.36);
  background: linear-gradient(135deg, rgba(216, 180, 91, 0.16), rgba(255, 255, 255, 0.04));
}

.menu-copy {
  display: grid;
  gap: 0.12rem;
}

.menu-copy strong {
  color: #f6f1e8;
  font-size: 0.96rem;
}

.menu-copy small {
  color: #8f98a8;
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.menu-indicator {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.15);
}

.sidebar-menu a.active .menu-indicator {
  background: #f2d88d;
  box-shadow: 0 0 0 6px rgba(216, 180, 91, 0.12);
}

.support-card {
  display: grid;
  gap: 0.8rem;
  background: linear-gradient(180deg, rgba(216, 180, 91, 0.1), rgba(255, 255, 255, 0.02));
}

.logout-button {
  min-height: 2.9rem;
  border: 1px solid rgba(255, 111, 105, 0.2);
  border-radius: 14px;
  color: #ffd7d5;
  background: rgba(255, 111, 105, 0.09);
}

.logout-button:hover {
  border-color: rgba(255, 111, 105, 0.38);
  background: rgba(255, 111, 105, 0.14);
}

.portal {
  padding: clamp(1rem, 3vw, 1.5rem);
}

.portal-client-dashboard {
  padding: 0;
}

.portal-crew {
  padding: 0;
  background: #ffffff;
  min-height: calc(100vh - 4.6rem);
}

.portal-operator {
  padding: 0;
  background: #ffffff;
  min-height: calc(100vh - 4.6rem);
}

.portal-admin {
  padding: 0;
  background: #ffffff;
  min-height: calc(100vh - 4.6rem);
}

.portal-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.portal-header h2 {
  margin-bottom: 0;
  font-size: clamp(1.55rem, 3vw, 2.5rem);
}

.portal-header .muted {
  max-width: 460px;
  margin: 0;
  text-align: right;
}

@media (max-width: 1080px) {
  .workspace {
    grid-template-columns: 1fr;
  }

  .sidebar {
    position: static;
  }
}

@media (max-width: 760px) {
  .portal-header {
    flex-direction: column;
    align-items: stretch;
  }

  .portal-header .muted {
    max-width: none;
    text-align: left;
  }
}
</style>
