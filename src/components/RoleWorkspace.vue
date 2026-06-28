<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import BrandLogo from './BrandLogo.vue'
import { buildMenuGroups, resolveRoleSectionPath, roleSections } from '../data/roleFlows'
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
  profileForm: { type: Object, default: () => ({}) },
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
  () => {
    if (props.activeRole === 'crew' && props.section === 'perfil') return false
    if (props.section === 'incidencias') return false
    return true
  },
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

const operatorGroupMeta = {
  Operacion: {
    title: 'Operacion',
    eyebrow: 'Executive flight command',
    description: 'Dashboard, flota, pricing, disponibilidad y autorizaciones en una sola capa.',
  },
  Coordinacion: {
    title: 'Coordinacion',
    eyebrow: 'Dispatch network',
    description: 'Seguimiento operativo y eventos de servicio conectados al flujo del operador.',
  },
  Control: {
    title: 'Control',
    eyebrow: 'Financial operations',
    description: 'Conciliacion, trazabilidad historica y parametros ejecutivos del operador.',
  },
}

const operatorSectionCopy = {
  dashboard: {
    label: 'Resumen proveedor',
    detail: 'Dashboard principal y KPIs',
  },
  empresa: {
    label: 'Mi empresa',
    detail: 'Perfil corporativo y certificaciones',
  },
  aeronaves: {
    label: 'Aeronaves',
    detail: 'Gestion y disponibilidad de flota',
  },
  costos: {
    label: 'Costos base',
    detail: 'Costos operativos y pricing',
  },
  disponibilidad: {
    label: 'Disponibilidad',
    detail: 'Agenda y bloqueos',
  },
  solicitudes: {
    label: 'Solicitudes',
    detail: 'Nuevas oportunidades',
  },
  'release-provider': {
    label: 'Liberacion',
    detail: 'Autorizaciones operativas',
  },
  operaciones: {
    label: 'Operaciones',
    detail: 'Control de vuelos activos',
  },
  incidencias: {
    label: 'Incidencias de sobrecargo',
    detail: 'Eventos y seguimiento operativo',
  },
  pagos: {
    label: 'Pagos',
    detail: 'Facturacion y conciliacion',
  },
  historial: {
    label: 'Historial',
    detail: 'Registro de operaciones',
  },
  configuracion: {
    label: 'Configuracion',
    detail: 'Parametros del operador',
  },
}

const currentGroup = computed(
  () =>
    groupedMenu.value.find((group) => group.label === activeMenuGroup.value) || groupedMenu.value[0] || null,
)

function getGroupMeta(group) {
  if (props.activeRole !== 'operator') {
    return {
      title: group?.label || '',
      eyebrow: `${group?.items?.length || 0} opciones`,
      description: roleInsights[props.activeRole]?.description || '',
    }
  }

  return operatorGroupMeta[group?.label] || {
    title: group?.label || '',
    eyebrow: 'Operator workspace',
    description: '',
  }
}

function getSectionCopy(item) {
  if (props.activeRole !== 'operator') {
    return {
      label: item.label,
      detail: currentGroup.value?.label || '',
    }
  }

  return operatorSectionCopy[item.id] || {
    label: item.label,
    detail: currentGroup.value?.label || '',
  }
}

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
        'workspace-operator': activeRole === 'operator',
      }"
    >
      <section v-if="usesWorkspaceMenu" class="workspace-menu-shell">
        <div class="workspace-menu-bar">
          <div class="workspace-menu-brand">
            <RouterLink to="/" class="workspace-menu-logo" aria-label="Sky Group">
              <BrandLogo :variant="activeRole === 'operator' ? 'light' : 'dark'" :width="118" />
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
            <span class="workspace-menu-hint">
              RED AVIATION
            </span> 
            <button
              type="button"
              class="workspace-menu-logout"
              @click="handleLogout"
            >
              <span class="workspace-logout-icon" aria-hidden="true"></span>
              Cerrar sesion
            </button>
          </div>
        </div>

        <div v-if="currentGroup && desktopMenuOpen" class="workspace-mega-menu">
          <div class="workspace-mega-menu__panel">
            <div class="workspace-mega-menu__header">
              <div>
                <small>{{ getGroupMeta(currentGroup).eyebrow }}</small>
                <strong>{{ getGroupMeta(currentGroup).title }}</strong>
              </div>
              <p>{{ getGroupMeta(currentGroup).description }}</p>
            </div>

            <div class="workspace-submenu-row">
              <RouterLink
                v-for="item in currentGroup.items"
                :key="item.id"
                :to="resolveRoleSectionPath(activeRole, item)"
                class="workspace-submenu-link"
                :class="{ 'workspace-submenu-link--active': section === item.id }"
              >
                <span class="workspace-submenu-icon" :data-section="item.id" aria-hidden="true">
                  <span></span>
                </span>
                <span class="workspace-submenu-copy">
                  <strong>{{ getSectionCopy(item).label }}</strong>
                  <small>{{ getSectionCopy(item).detail }}</small>
                </span>
              </RouterLink>
            </div>
          </div>
        </div>

        <div v-if="mobileMenuOpen" class="workspace-mobile-drawer">
          <div class="workspace-mobile-drawer__sheet">
            <div class="workspace-mobile-drawer__top">
              <RouterLink to="/" class="workspace-mobile-drawer__logo" aria-label="Sky Group">
                <BrandLogo :variant="activeRole === 'operator' ? 'light' : 'dark'" :width="118" />
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
                  :to="resolveRoleSectionPath(activeRole, item)"
                  class="workspace-mobile-link"
                  :class="{ 'workspace-mobile-link--active': section === item.id }"
                >
                  <span class="workspace-submenu-icon workspace-mobile-link__icon" :data-section="item.id" aria-hidden="true">
                    <span></span>
                  </span>
                  <span class="workspace-mobile-link__copy">
                    <strong>{{ getSectionCopy(item).label }}</strong>
                    <small>{{ getSectionCopy(item).detail }}</small>
                  </span>
                </RouterLink>
              </div>
            </section>

            <div class="workspace-mobile-drawer__footer">
              <button
                type="button"
                class="workspace-mobile-logout"
                @click="handleLogout"
              >
                <span class="workspace-logout-icon" aria-hidden="true"></span>
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

.workspace-mega-menu__header div {
  display: grid;
  gap: 0.18rem;
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

.workspace-mega-menu__header p {
  max-width: 24rem;
  margin: 0;
  color: #8a8276;
  font-size: 0.82rem;
  line-height: 1.45;
  text-align: right;
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

.workspace-submenu-copy {
  display: grid;
  gap: 0.14rem;
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

.workspace-operator.workspace-workflow {
  background:
    radial-gradient(circle at 18% 0%, rgba(201, 160, 99, 0.14), transparent 30%),
    radial-gradient(circle at 88% 12%, rgba(45, 106, 173, 0.22), transparent 34%),
    linear-gradient(135deg, #050a14 0%, #071b36 56%, #050a14 100%);
  color: #f8f3e8;
}

.workspace-operator .workspace-menu-shell {
  position: sticky;
  top: 0.9rem;
  animation: workspace-header-enter 0.3s ease both;
}

.workspace-operator .workspace-menu-shell::before {
  content: '';
  position: absolute;
  left: 8%;
  right: 8%;
  top: 50%;
  height: 5.5rem;
  border-radius: 999px;
  background:
    radial-gradient(circle at 50% 50%, rgba(10, 35, 66, 0.62), transparent 70%),
    radial-gradient(circle at 25% 50%, rgba(201, 160, 99, 0.12), transparent 48%);
  filter: blur(18px);
  transform: translateY(-50%);
  pointer-events: none;
}

.workspace-operator .workspace-menu-bar {
  position: relative;
  min-height: 78px;
  width: 100%;
  grid-template-columns: minmax(230px, auto) minmax(0, 1fr) auto;
  gap: clamp(0.8rem, 2vw, 1.35rem);
  padding: 0.68rem 0.9rem 0.68rem 1.25rem;
  border: 1px solid rgba(201, 160, 99, 0.12);
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(7, 27, 54, 0.92), rgba(5, 10, 20, 0.96));
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.45),
    0 0 54px rgba(10, 35, 66, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(20px);
  transition:
    border-color 0.3s ease,
    box-shadow 0.3s ease,
    backdrop-filter 0.3s ease;
}

.workspace-operator .workspace-menu-bar::before {
  content: '';
  position: absolute;
  inset: 1px 14% auto;
  height: 1px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, rgba(246, 243, 239, 0.24), transparent);
  pointer-events: none;
}

.workspace-operator .workspace-menu-bar::after {
  content: '';
  position: absolute;
  inset: auto 18% 0;
  height: 1px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, rgba(201, 160, 99, 0.28), transparent);
  opacity: 0.7;
  pointer-events: none;
}

.workspace-operator .workspace-menu-logo {
  align-items: center;
  filter: brightness(0) invert(1) drop-shadow(0 0 10px rgba(255, 255, 255, 0.15));
}

.workspace-operator .workspace-menu-logo :deep(.brand-logo__image) {
  width: auto;
  height: 34px;
  object-fit: contain;
}

.workspace-operator .workspace-menu-brand {
  min-width: 230px;
  gap: 1rem;
}

.workspace-operator .workspace-menu-brand-copy {
  gap: 0.16rem;
}

.workspace-operator .workspace-menu-brand strong,
.workspace-operator .workspace-menu-group,
.workspace-operator .workspace-menu-logout {
  color: #f8f3e8;
}

.workspace-operator .workspace-menu-brand small,
.workspace-operator .workspace-menu-hint {
  color: rgba(255, 255, 255, 0.55);
}

.workspace-operator .workspace-menu-brand strong {
  font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
  font-size: 0.96rem;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.workspace-operator .workspace-menu-brand small {
  font-size: 0.76rem;
}

.workspace-operator .workspace-menu-badge {
  min-height: 1.55rem;
  padding: 0 0.68rem;
  border: 1px solid rgba(201, 160, 99, 0.3);
  background: rgba(201, 160, 99, 0.15);
  color: #c9a063;
  box-shadow:
    0 0 18px rgba(201, 160, 99, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.workspace-operator .workspace-menu-group {
  position: relative;
  min-height: 3.08rem;
  padding: 0 1.18rem;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.88rem;
  letter-spacing: 0.02em;
  transition:
    color 0.3s ease,
    background 0.3s ease,
    border-color 0.3s ease,
    box-shadow 0.3s ease,
    transform 0.34s cubic-bezier(0.2, 0.9, 0.2, 1.18);
}

.workspace-operator .workspace-menu-group:hover,
.workspace-operator .workspace-menu-group--active {
  border-color: rgba(201, 160, 99, 0.3);
  background:
    linear-gradient(135deg, rgba(7, 27, 54, 0.78), rgba(5, 10, 20, 0.82)),
    rgba(255, 255, 255, 0.08);
  color: #ffffff;
  box-shadow:
    0 12px 34px rgba(0, 0, 0, 0.28),
    0 0 28px rgba(201, 160, 99, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  transform: translateY(-1px) scale(1.03);
}

.workspace-operator .workspace-menu-group--active {
  overflow: hidden;
}

.workspace-operator .workspace-menu-group--active::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(110deg, transparent 0%, rgba(201, 160, 99, 0.18) 48%, transparent 72%);
  transform: translateX(-70%);
  animation: workspace-metal-sheen 3.4s ease-in-out infinite;
  pointer-events: none;
}

.workspace-operator .workspace-menu-group--active::after {
  content: '';
  position: absolute;
  left: 1rem;
  right: 1rem;
  bottom: 0.32rem;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, #c9a063, transparent);
  box-shadow: 0 0 14px rgba(201, 160, 99, 0.85);
}

.workspace-operator .workspace-menu-logout,
.workspace-operator .workspace-menu-toggle {
  border-color: rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.workspace-operator .workspace-menu-groups {
  justify-content: center;
  gap: 0.38rem;
  padding: 0.18rem;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.035);
}

.workspace-operator .workspace-menu-actions {
  min-width: 230px;
  gap: 0.85rem;
}

.workspace-operator .workspace-menu-hint {
  display: inline-flex;
  align-items: center;
  min-height: 2.4rem;
  padding: 0 0.72rem;
  border: 1px solid rgba(201, 160, 99, 0.14);
  border-radius: 999px;
  background: rgba(201, 160, 99, 0.055);
  color: #c9a063;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.18em;
}

.workspace-operator .workspace-menu-logout {
  min-height: 3rem;
  padding: 0 1rem;
  color: #f6f3ef;
  font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
  font-size: 0.86rem;
  font-weight: 700;
  transition:
    border-color 0.3s ease,
    box-shadow 0.3s ease,
    transform 0.32s cubic-bezier(0.2, 0.9, 0.2, 1.16),
    background 0.3s ease;
}

.workspace-operator .workspace-menu-logout:hover {
  border-color: rgba(201, 160, 99, 0.35);
  background: rgba(255, 255, 255, 0.065);
  box-shadow: 0 10px 30px rgba(201, 160, 99, 0.2);
  transform: translateY(-2px);
}

.workspace-logout-icon {
  position: relative;
  width: 1.06rem;
  height: 1.06rem;
  flex: 0 0 auto;
  color: #c9a063;
}

.workspace-logout-icon::before,
.workspace-logout-icon::after {
  content: '';
  position: absolute;
  box-sizing: border-box;
}

.workspace-logout-icon::before {
  inset: 0.1rem 0.4rem 0.1rem 0.05rem;
  border: 1.35px solid currentColor;
  border-right: 0;
  border-radius: 0.22rem 0 0 0.22rem;
}

.workspace-logout-icon::after {
  top: 50%;
  right: 0.02rem;
  width: 0.7rem;
  height: 0.7rem;
  border-top: 1.35px solid currentColor;
  border-right: 1.35px solid currentColor;
  transform: translateY(-50%) rotate(45deg);
}

.workspace-operator .workspace-mega-menu__panel {
  position: relative;
  overflow: hidden;
  padding: 1.25rem;
  border: 1px solid rgba(201, 160, 99, 0.15);
  border-radius: 28px;
  background:
    radial-gradient(circle at 18% 0%, rgba(201, 160, 99, 0.1), transparent 30%),
    linear-gradient(135deg, rgba(7, 27, 54, 0.92), rgba(5, 10, 20, 0.96));
  box-shadow:
    0 30px 80px rgba(0, 0, 0, 0.48),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(24px);
  animation: workspace-mega-enter 0.28s cubic-bezier(0.18, 0.88, 0.32, 1.12);
}

.workspace-operator .workspace-mega-menu__header {
  align-items: end;
  padding: 0.25rem 0.35rem 1rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid rgba(201, 160, 99, 0.16);
}

.workspace-operator .workspace-mega-menu__header strong {
  color: #f8f3e8;
  font-family: 'Cormorant Garamond', 'Playfair Display', Georgia, serif;
  font-size: 1.75rem;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0;
}

.workspace-operator .workspace-mega-menu__header small,
.workspace-operator .workspace-submenu-link small {
  color: #c9a063;
}

.workspace-operator .workspace-mega-menu__header small {
  font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
  font-size: 0.72rem;
  letter-spacing: 0.14em;
}

.workspace-operator .workspace-mega-menu__header p {
  color: rgba(246, 243, 239, 0.62);
  font-size: 0.85rem;
  line-height: 1.55;
}

.workspace-operator .workspace-submenu-link {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 0.95rem;
  min-height: 8rem;
  padding: 1.2rem;
  border: 1px solid rgba(201, 160, 99, 0.1);
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(7, 27, 54, 0.85), rgba(5, 10, 20, 0.95));
  color: #f6f3ef;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45);
  transform: translateY(0) scale(1);
  transition:
    border-color 0.3s ease,
    box-shadow 0.3s ease,
    transform 0.34s cubic-bezier(0.2, 0.9, 0.2, 1.16),
    background 0.3s ease;
}

.workspace-operator .workspace-submenu-link:hover,
.workspace-operator .workspace-submenu-link--active {
  border-color: rgba(201, 160, 99, 0.35);
  background:
    radial-gradient(circle at 20% 0%, rgba(201, 160, 99, 0.12), transparent 34%),
    linear-gradient(135deg, rgba(10, 35, 66, 0.88), rgba(5, 10, 20, 0.96));
  box-shadow:
    0 26px 64px rgba(0, 0, 0, 0.5),
    0 0 30px rgba(201, 160, 99, 0.18);
  transform: translateY(-6px) scale(1.03);
}

.workspace-operator .workspace-submenu-link--active {
  box-shadow:
    0 26px 64px rgba(0, 0, 0, 0.5),
    0 0 38px rgba(201, 160, 99, 0.25),
    inset 0 0 0 1px rgba(201, 160, 99, 0.1);
}

.workspace-operator .workspace-submenu-link strong {
  color: #f6f3ef;
  font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
  font-size: 0.98rem;
  font-weight: 700;
}

.workspace-operator .workspace-submenu-link small {
  color: rgba(246, 243, 239, 0.58);
  font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
  font-size: 0.82rem;
  font-weight: 500;
  letter-spacing: 0;
  line-height: 1.35;
  text-transform: none;
}

.workspace-operator .workspace-submenu-row {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.workspace-operator .workspace-mega-menu {
  width: min(100%, 900px);
  padding-top: 0.8rem;
}

.workspace-operator .workspace-mega-menu:has(.workspace-submenu-link:nth-child(1):last-child) {
  width: min(100%, 520px);
}

.workspace-operator .workspace-mega-menu:has(.workspace-submenu-link:nth-child(1):last-child) .workspace-submenu-row {
  grid-template-columns: 1fr;
}

.workspace-operator .workspace-submenu-icon {
  position: relative;
  display: grid;
  place-items: center;
  width: 3.45rem;
  height: 3.45rem;
  border: 1px solid rgba(201, 160, 99, 0.22);
  border-radius: 18px;
  background:
    linear-gradient(145deg, rgba(201, 160, 99, 0.1), rgba(255, 255, 255, 0.025)),
    rgba(7, 27, 54, 0.54);
  color: #c9a063;
  box-shadow:
    0 0 22px rgba(201, 160, 99, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.workspace-operator .workspace-submenu-icon::before,
.workspace-operator .workspace-submenu-icon::after,
.workspace-operator .workspace-submenu-icon span,
.workspace-operator .workspace-submenu-icon span::before,
.workspace-operator .workspace-submenu-icon span::after {
  content: '';
  position: absolute;
  box-sizing: border-box;
  border-color: currentColor;
}

.workspace-operator .workspace-submenu-link:hover .workspace-submenu-icon,
.workspace-operator .workspace-submenu-link--active .workspace-submenu-icon {
  color: #e6c584;
  box-shadow:
    0 0 24px rgba(201, 160, 99, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.workspace-submenu-icon[data-section='dashboard']::before {
  width: 1.52rem;
  height: 1.52rem;
  border: 1.35px solid currentColor;
  border-radius: 50%;
}

.workspace-submenu-icon[data-section='dashboard']::after {
  width: 0.42rem;
  height: 0.42rem;
  border: 1.35px solid currentColor;
  border-radius: 50%;
}

.workspace-submenu-icon[data-section='dashboard'] span {
  width: 2.08rem;
  height: 1.35px;
  background: currentColor;
}

.workspace-submenu-icon[data-section='dashboard'] span::before,
.workspace-submenu-icon[data-section='dashboard'] span::after {
  left: 50%;
  top: 50%;
  width: 1.35px;
  height: 2.08rem;
  background: currentColor;
  transform: translate(-50%, -50%);
}

.workspace-submenu-icon[data-section='dashboard'] span::after {
  transform: translate(-50%, -50%) rotate(45deg);
}

.workspace-submenu-icon[data-section='dashboard'] span::before {
  transform: translate(-50%, -50%) rotate(-45deg);
}

.workspace-submenu-icon[data-section='empresa']::before {
  width: 1.7rem;
  height: 1.7rem;
  border: 1.35px solid currentColor;
  border-radius: 50%;
}

.workspace-submenu-icon[data-section='empresa']::after {
  width: 1rem;
  height: 1rem;
  border: 1.35px solid currentColor;
  border-radius: 50%;
}

.workspace-submenu-icon[data-section='empresa'] span {
  width: 0.42rem;
  height: 0.42rem;
  border: 1.35px solid currentColor;
  border-radius: 50%;
}

.workspace-submenu-icon[data-section='aeronaves']::before {
  width: 2.15rem;
  height: 0.42rem;
  border: 1.35px solid currentColor;
  border-radius: 999px 70% 70% 999px;
  transform: rotate(-14deg);
}

.workspace-submenu-icon[data-section='aeronaves']::after {
  width: 1.1rem;
  height: 0.42rem;
  border-top: 1.35px solid currentColor;
  transform: translate(0.05rem, 0.28rem) rotate(25deg);
}

.workspace-submenu-icon[data-section='aeronaves'] span {
  width: 0.82rem;
  height: 0.82rem;
  border-left: 1.35px solid currentColor;
  border-top: 1.35px solid currentColor;
  transform: translate(-0.72rem, -0.28rem) rotate(-18deg);
}

.workspace-submenu-icon[data-section='costos']::before {
  width: 1.86rem;
  height: 1.86rem;
  border: 1.35px solid currentColor;
  border-radius: 50%;
}

.workspace-submenu-icon[data-section='costos']::after {
  width: 0.9rem;
  height: 0.9rem;
  border-left: 1.35px solid currentColor;
  border-bottom: 1.35px solid currentColor;
  transform: rotate(-45deg) translate(0.05rem, -0.05rem);
}

.workspace-submenu-icon[data-section='costos'] span {
  width: 1.12rem;
  height: 1.35px;
  background: currentColor;
  transform: rotate(-22deg);
  transform-origin: right center;
}

.workspace-submenu-icon[data-section='disponibilidad']::before {
  width: 1.95rem;
  height: 1.95rem;
  border: 1.35px solid currentColor;
  border-radius: 50%;
}

.workspace-submenu-icon[data-section='disponibilidad']::after {
  width: 0.54rem;
  height: 0.54rem;
  border: 1.35px solid currentColor;
  border-radius: 50%;
}

.workspace-submenu-icon[data-section='disponibilidad'] span {
  width: 1rem;
  height: 1.35px;
  background: currentColor;
  transform-origin: left center;
  transform: translateX(0.1rem) rotate(-34deg);
}

.workspace-submenu-icon[data-section='solicitudes']::before {
  width: 1.95rem;
  height: 1.22rem;
  border: 1.35px solid currentColor;
  border-radius: 0.18rem;
  transform: rotate(-6deg);
}

.workspace-submenu-icon[data-section='solicitudes']::after {
  width: 1.1rem;
  height: 1.35px;
  background: currentColor;
  transform: translateY(-0.18rem) rotate(-6deg);
}

.workspace-submenu-icon[data-section='solicitudes'] span {
  width: 0.78rem;
  height: 1.35px;
  background: currentColor;
  transform: translate(-0.16rem, 0.22rem) rotate(-6deg);
}

.workspace-submenu-icon[data-section='release-provider']::before {
  width: 1.76rem;
  height: 1.76rem;
  border: 1.35px solid currentColor;
  border-radius: 50%;
}

.workspace-submenu-icon[data-section='release-provider']::after {
  width: 1.18rem;
  height: 1.18rem;
  border: 1.35px solid currentColor;
  transform: rotate(45deg);
}

.workspace-submenu-icon[data-section='release-provider'] span {
  width: 0.78rem;
  height: 0.42rem;
  border-left: 1.35px solid currentColor;
  border-bottom: 1.35px solid currentColor;
  transform: rotate(-45deg) translate(0.08rem, -0.04rem);
}

.workspace-submenu-icon[data-section='operaciones']::before {
  width: 2.05rem;
  height: 1.45rem;
  border: 1.35px solid currentColor;
  border-radius: 45% 55% 45% 55%;
  transform: rotate(-12deg);
}

.workspace-submenu-icon[data-section='operaciones']::after {
  width: 0.42rem;
  height: 0.42rem;
  border: 1.35px solid currentColor;
  border-radius: 50%;
  box-shadow:
    0.72rem -0.28rem 0 -0.02rem rgba(201, 160, 99, 0),
    0.72rem -0.28rem 0 0 currentColor,
    -0.55rem 0.38rem 0 0 currentColor;
}

.workspace-submenu-icon[data-section='operaciones'] span {
  width: 1.45rem;
  height: 1.35px;
  background: currentColor;
  transform: rotate(-22deg);
}

.workspace-submenu-icon[data-section='incidencias']::before {
  width: 2rem;
  height: 1.24rem;
  border: 1.35px solid currentColor;
  border-radius: 999px;
}

.workspace-submenu-icon[data-section='incidencias']::after {
  width: 0.46rem;
  height: 0.46rem;
  border: 1.35px solid currentColor;
  border-radius: 50%;
  box-shadow:
    -0.72rem 0 0 -0.02rem rgba(201, 160, 99, 0),
    -0.72rem 0 0 0 currentColor,
    0.72rem 0 0 0 currentColor;
}

.workspace-submenu-icon[data-section='incidencias'] span {
  width: 1.46rem;
  height: 1.35px;
  background: currentColor;
  transform: rotate(-28deg);
}

.workspace-submenu-icon[data-section='pagos']::before {
  width: 1.58rem;
  height: 2rem;
  border: 1.35px solid currentColor;
  border-radius: 0.22rem;
}

.workspace-submenu-icon[data-section='pagos']::after {
  width: 1rem;
  height: 1.35px;
  background: currentColor;
  transform: translateY(-0.34rem);
  box-shadow: 0 0.44rem 0 currentColor;
}

.workspace-submenu-icon[data-section='pagos'] span {
  width: 0.48rem;
  height: 0.48rem;
  border: 1.35px solid currentColor;
  border-radius: 50%;
  transform: translate(0.28rem, 0.54rem);
}

.workspace-submenu-icon[data-section='historial']::before {
  width: 2rem;
  height: 1.35px;
  background: currentColor;
}

.workspace-submenu-icon[data-section='historial']::after {
  width: 0.44rem;
  height: 0.44rem;
  border: 1.35px solid currentColor;
  border-radius: 50%;
  box-shadow:
    -0.72rem 0 0 0 currentColor,
    0.72rem 0 0 0 currentColor;
}

.workspace-submenu-icon[data-section='historial'] span {
  width: 1.35px;
  height: 1.45rem;
  background: currentColor;
  transform: translateX(-0.72rem);
  box-shadow:
    0.72rem 0 0 currentColor,
    1.44rem 0 0 currentColor;
}

.workspace-submenu-icon[data-section='configuracion']::before {
  width: 1.95rem;
  height: 1.42rem;
  border: 1.35px solid currentColor;
  border-radius: 0.72rem;
}

.workspace-submenu-icon[data-section='configuracion']::after {
  width: 0.46rem;
  height: 0.46rem;
  border: 1.35px solid currentColor;
  border-radius: 50%;
  transform: translateX(-0.46rem);
  box-shadow: 0.92rem 0 0 0 currentColor;
}

.workspace-submenu-icon[data-section='configuracion'] span {
  width: 1.22rem;
  height: 1.35px;
  background: currentColor;
  transform: translateY(0.56rem);
}

@keyframes workspace-mega-enter {
  from {
    opacity: 0;
    transform: translateY(-10px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes workspace-header-enter {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes workspace-metal-sheen {
  0%,
  46% {
    transform: translateX(-76%);
    opacity: 0;
  }
  58% {
    opacity: 1;
  }
  100% {
    transform: translateX(76%);
    opacity: 0;
  }
}

.workspace-operator .portal {
  background: transparent;
}

.workspace-operator .portal-workspace {
  padding-top: 2.2rem;
}

.workspace-operator .portal-header {
  display: none;
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

  .workspace-operator .workspace-mobile-drawer {
    background: rgba(5, 10, 20, 0.72);
    backdrop-filter: blur(18px);
  }

  .workspace-operator .workspace-mobile-drawer__sheet {
    background:
      radial-gradient(circle at 18% 0%, rgba(201, 160, 99, 0.14), transparent 32%),
      linear-gradient(135deg, #050a14 0%, #071b36 100%);
  }

  .workspace-operator .workspace-mobile-drawer__intro strong,
  .workspace-operator .workspace-mobile-link,
  .workspace-operator .workspace-mobile-logout {
    color: #f8f3e8;
  }

  .workspace-operator .workspace-mobile-drawer__intro p,
  .workspace-operator .workspace-mobile-group__title {
    color: rgba(236, 226, 207, 0.68);
  }

  .workspace-operator .workspace-mobile-link--active {
    color: #e8c98f;
  }

  .workspace-operator .workspace-mobile-links {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .workspace-operator .workspace-mobile-link {
    align-items: flex-start;
    gap: 0.75rem;
    min-height: 7.4rem;
    padding: 0.85rem;
    border: 1px solid rgba(201, 160, 99, 0.1);
    border-radius: 18px;
    background: linear-gradient(135deg, rgba(7, 27, 54, 0.78), rgba(5, 10, 20, 0.92));
    box-shadow: 0 18px 36px rgba(0, 0, 0, 0.28);
  }

  .workspace-operator .workspace-mobile-link__icon {
    width: 2.85rem;
    height: 2.85rem;
    min-width: 2.85rem;
    border-radius: 16px;
  }

  .workspace-mobile-link__copy {
    display: grid;
    gap: 0.18rem;
  }

  .workspace-mobile-link__copy strong {
    color: #f6f3ef;
    font-size: 0.9rem;
    line-height: 1.15;
  }

  .workspace-mobile-link__copy small {
    color: rgba(246, 243, 239, 0.58);
    font-size: 0.76rem;
    line-height: 1.3;
  }

  .workspace-operator .workspace-mobile-drawer__close,
  .workspace-operator .workspace-mobile-logout {
    border-color: rgba(201, 160, 99, 0.24);
    background: rgba(255, 255, 255, 0.08);
  }

  .workspace-operator .workspace-mobile-drawer__close span {
    background: #f8f3e8;
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
