<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import BrandLogo from './BrandLogo.vue'
import {
  buildMenuGroups,
  findMenuGroupBySection,
  resolveRoleSectionRoute,
  resolveRoleSectionPath,
  roleSections,
} from '../data/roleFlows'
import {
  getSectionCopy,
  getWorkspaceGroupMeta,
  roleInsights,
} from '../data/workspaceCopy'
import { resolveBestCompanyDisplayName } from '../lib/companyDisplay'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'

const AdminPortal = defineAsyncComponent(() => import('../features/admin/AdminPortal.vue'))
const ClientPortal = defineAsyncComponent(() => import('../features/client/ClientPortal.vue'))
const CrewPortal = defineAsyncComponent(() => import('../features/crew/CrewPortal.vue'))
const OperatorPortal = defineAsyncComponent(
  () => import('../features/operator/portal/PortalOperador.vue'),
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
const workspaceLoading = ref(false)
const workspaceLoadingTarget = ref('')
let workspaceLoadingResetTimer = null

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
const isAdminWorkspace = computed(() => props.activeRole === 'admin' && usesWorkspaceMenu.value)
const showPortalHeader = computed(
  () => {
    if (props.activeRole === 'crew') return false
    if (props.section === 'incidencias') return false
    return true
  },
)

const currentGroup = computed(
  () =>
    groupedMenu.value.find((group) => group.label === activeMenuGroup.value) || groupedMenu.value[0] || null,
)
const workspaceDescription = computed(() => roleInsights[props.activeRole]?.description || '')
const operatorCompanyLabel = computed(() => {
  if (props.activeRole !== 'operator') return ''

  const provider = auth.user?.provider && typeof auth.user.provider === 'object' ? auth.user.provider : {}
  const ownedProvider =
    auth.user?.ownedProvider && typeof auth.user.ownedProvider === 'object' ? auth.user.ownedProvider : {}
  const profile = auth.user?.profile && typeof auth.user.profile === 'object' ? auth.user.profile : {}
  const authUser = auth.user && typeof auth.user === 'object' ? auth.user : {}

  return resolveBestCompanyDisplayName(
    provider.company_name,
    provider.commercial_name,
    provider.legal_name,
    ownedProvider.company_name,
    ownedProvider.commercial_name,
    ownedProvider.legal_name,
    authUser.company_name,
    authUser.commercial_name,
    authUser.legal_name,
    profile.company_name,
  )
})
const workspaceBrandTitle = computed(() =>
  props.activeRole === 'operator' ? operatorCompanyLabel.value : props.role.label,
)
const workspaceBrandHint = computed(() =>
  props.activeRole === 'operator' ? operatorCompanyLabel.value : '',
)
const workspaceLoadingCopy = computed(() => {
  const targetItem = currentMenu.value.find((item) => item.id === workspaceLoadingTarget.value)
  const fallbackGroup = currentGroup.value || groupedMenu.value[0] || null

  return getSectionCopy(props.activeRole, targetItem, fallbackGroup)
})

const workspaceOperatorIcons = {
  aeronaves: [
    'M3 16l7-4 4-6 2-.5-1 5.5L21 9l1 1.5-6.5 2.5L19 18l-1.5 1-5.5-4-7 2z',
  ],
  costos: [
    'M7 4h8a3 3 0 013 3v10a3 3 0 01-3 3H7a3 3 0 01-3-3V7a3 3 0 013-3z',
    'M8 9h6',
    'M8 13h8',
    'M8 17h5',
  ],
  disponibilidad: [
    'M7 4v3',
    'M17 4v3',
    'M4 9h16',
    'M5 7a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2H7a2 2 0 01-2-2V7z',
    'M8.5 14l2.5 2.5L15.5 12',
  ],
  'release-provider': [
    'M12 3l7 3v5c0 4.5-3 7.5-7 10-4-2.5-7-5.5-7-10V6l7-3z',
    'M8.5 12.5l2.5 2.5L15.5 10.5',
  ],
  empresa: [
    'M4 20V7a2 2 0 012-2h8a2 2 0 012 2v13',
    'M16 20V10a2 2 0 012-2h0a2 2 0 012 2v10',
    'M8 9h2',
    'M8 13h2',
    'M12 9h2',
    'M12 13h2',
    'M9 20v-3h2v3',
  ],
  operaciones: [
    'M12 12l4-4',
    'M12 12l-3 5',
    'M12 12h6',
    'M12 12V6',
    'M12 3a9 9 0 100 18 9 9 0 000-18z',
  ],
  incidencias: [
    'M12 3l9 16H3l9-16z',
    'M12 9v4',
    'M12 17h.01',
  ],
  dashboard: [
    'M4 5h7v7H4z',
    'M13 5h7v5h-7z',
    'M13 12h7v7h-7z',
    'M4 14h7v5H4z',
  ],
  solicitudes: [
    'M14 4h3a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2v-1',
    'M14 4v4h4',
    'M5 8H3v8a2 2 0 002 2h7',
    'M8 12h6',
    'M11 9v6',
  ],
  pagos: [
    'M3 7.5h18',
    'M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z',
    'M7 15h4',
  ],
  historial: [
    'M12 8v5l3 2',
    'M12 3a9 9 0 109 9',
    'M12 3a9 9 0 00-9 9',
  ],
  configuracion: [
    'M4 7h10',
    'M4 17h16',
    'M14 7a2 2 0 104 0 2 2 0 10-4 0z',
    'M8 17a2 2 0 104 0 2 2 0 10-4 0z',
  ],
}

const workspaceAdminIcons = {
  ejecutivo: [
    'M5 5h6v6H5z',
    'M13 5h6v4h-6z',
    'M13 11h6v8h-6z',
    'M5 13h6v6H5z',
  ],
  importaciones: [
    'M12 3v12',
    'M8.5 6.5L12 3l3.5 3.5',
    'M12 21V9',
    'M8.5 17.5L12 21l3.5-3.5',
  ],
  usuarios: [
    'M9 11a3 3 0 100-6 3 3 0 000 6z',
    'M15.5 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
    'M4.5 19v-1c0-1.66 1.34-3 3-3h3c1.66 0 3 1.34 3 3v1',
    'M14 19v-.5c0-1.38.9-2.57 2.16-2.91',
  ],
  configuracion: [
    'M4 7h10',
    'M4 17h16',
    'M14 7a2 2 0 104 0 2 2 0 10-4 0z',
    'M8 17a2 2 0 104 0 2 2 0 10-4 0z',
  ],
  clientes: [
    'M16 19v-1.5c0-1.38-1.12-2.5-2.5-2.5h-3c-1.38 0-2.5 1.12-2.5 2.5V19',
    'M12 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
  ],
  reservas: [
    'M5 7a2 2 0 012-2h10a2 2 0 012 2v11a2 2 0 01-2 2H7a2 2 0 01-2-2V7z',
    'M8 4v4',
    'M16 4v4',
    'M5 10h14',
    'M9 14h6',
  ],
  contratos: [
    'M8 3.5h5l4 4V19a2 2 0 01-2 2H8a2 2 0 01-2-2V5.5a2 2 0 012-2z',
    'M13 3.5V8h4',
    'M9 13h6',
    'M9 17h6',
  ],
  suscripciones: [
    'M4 8.5h16',
    'M6 6h12a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2z',
    'M8 15h4',
  ],
  pagos: [
    'M3.5 7.5h17',
    'M5.5 5.5h13a2 2 0 012 2v9a2 2 0 01-2 2h-13a2 2 0 01-2-2v-9a2 2 0 012-2z',
    'M7.5 15h4',
  ],
  proveedores: [
    'M4.5 18V7.5a2 2 0 012-2h7a2 2 0 012 2V18',
    'M15.5 18v-6.5a2 2 0 012-2h0a2 2 0 012 2V18',
    'M8 10h2',
    'M8 13.5h2',
    'M11.5 10h2',
  ],
  aeronaves: [
    'M3 15l7-3 4-6 2-.5-1 5.5L21 9l1 1.5-6.5 2.5L19 17.5l-1.5 1-5.5-4-7 1.5z',
  ],
  'disponibilidad-aeronaves': [
    'M7 4v3',
    'M17 4v3',
    'M4 9h16',
    'M5 7a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2H7a2 2 0 01-2-2V7z',
    'M8 14.75l3-1.25 1.75-2.75.9-.2-.45 2.55L17 12l.45.7-2.95 1.15L16 16l-.7.45-2.5-1.55L9 15.6z',
  ],
  'pagos-proveedor': [
    'M3.5 7.5h17',
    'M5.5 5.5h13a2 2 0 012 2v9a2 2 0 01-2 2h-13a2 2 0 01-2-2v-9a2 2 0 012-2z',
    'M14.5 14h2',
    'M7.5 14h4',
  ],
  operadores: [
    'M8.5 10.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
    'M15.5 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
    'M4.5 18v-.5c0-1.38 1.12-2.5 2.5-2.5h3',
    'M13.5 15h3c1.38 0 2.5 1.12 2.5 2.5v.5',
  ],
  liberaciones: [
    'M12 3l7 3v5c0 4.5-3 7.5-7 10-4-2.5-7-5.5-7-10V6l7-3z',
    'M9.5 12.5l1.8 1.8L15 10.6',
  ],
  documentos: [
    'M8 3.5h5l4 4V19a2 2 0 01-2 2H8a2 2 0 01-2-2V5.5a2 2 0 012-2z',
    'M13 3.5V8h4',
    'M9 13h6',
    'M9 17h4',
  ],
  sobrecargos: [
    'M12 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
    'M6 19v-1c0-2.21 1.79-4 4-4h4c2.21 0 4 1.79 4 4v1',
  ],
  disponibilidad: [
    'M7 4v3',
    'M17 4v3',
    'M4 9h16',
    'M5 7a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2H7a2 2 0 01-2-2V7z',
    'M8.5 14l2.5 2.5L15.5 12',
  ],
  'sobrecargo-operaciones': [
    'M12 12l4-4',
    'M12 12l-3 5',
    'M12 12h6',
    'M12 12V6',
    'M12 3a9 9 0 100 18 9 9 0 000-18z',
  ],
  'sobrecargos-en-vuelo': [
    'M3 15l7-3 4-6 2-.5-1 5.5L21 9l1 1.5-6.5 2.5L19 17.5l-1.5 1-5.5-4-7 1.5z',
    'M6.5 18.5h11',
  ],
  incidencias: [
    'M12 4L20 18H4L12 4Z',
    'M12 9V13',
    'M12 16H12.01',
  ],
}

const workspaceUiIcons = {
  arrowRight: [
    'M5 12h14',
    'M13 6l6 6-6 6',
  ],
}

function getWorkspaceIconPaths(sectionId, role = props.activeRole) {
  const normalized = String(sectionId || '').trim()
  if (role === 'operator') return workspaceOperatorIcons[normalized] || []
  if (role === 'admin') return workspaceAdminIcons[normalized] || []
  return []
}

function getWorkspaceUiIconPaths(iconName) {
  return workspaceUiIcons[iconName] || []
}

function resolveActiveGroupLabel() {
  return (
    findMenuGroupBySection(props.activeRole, props.section, currentMenu.value, groupedMenu.value)?.label ||
    groupedMenu.value[0]?.label ||
    ''
  )
}

async function openMenuGroup(label) {
  const targetGroup = groupedMenu.value.find((group) => group.label === label)

  if (!targetGroup) return
  if (targetGroup.items.length === 1) {
    activeMenuGroup.value = label
    desktopMenuOpen.value = false
    await handleWorkspaceNavigation(targetGroup.items[0])
    return
  }

  const isCurrentGroup = activeMenuGroup.value === label
  activeMenuGroup.value = label
  desktopMenuOpen.value = isCurrentGroup ? !desktopMenuOpen.value : true
  mobileMenuOpen.value = false
}

function clearWorkspaceLoading() {
  workspaceLoading.value = false
  workspaceLoadingTarget.value = ''

  if (workspaceLoadingResetTimer) {
    clearTimeout(workspaceLoadingResetTimer)
    workspaceLoadingResetTimer = null
  }
}

async function handleWorkspaceNavigation(item, event) {
  if (!item?.id) return

  const targetPath = resolveRoleSectionPath(props.activeRole, item)
  const targetRoute = resolveRoleSectionRoute(props.activeRole, item)
  const currentPath = router.currentRoute.value.fullPath
  const isSameSection = item.id === props.section

  desktopMenuOpen.value = false
  mobileMenuOpen.value = false

  if (props.activeRole === 'operator' || props.activeRole === 'admin') {
    workspaceLoadingTarget.value = item.id
    workspaceLoading.value = !isSameSection

    if (workspaceLoadingResetTimer) clearTimeout(workspaceLoadingResetTimer)
    workspaceLoadingResetTimer = setTimeout(() => {
      clearWorkspaceLoading()
    }, 9000)
  }

  if (!targetPath || currentPath === targetPath || isSameSection) {
    clearWorkspaceLoading()
    return
  }

  event?.preventDefault?.()

  try {
    await router.push(targetRoute)
  } catch {
    clearWorkspaceLoading()
  }
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
  () => [auth.initialized, auth.initializing, auth.isAuthenticated],
  ([initialized, initializing, isAuthenticated]) => {
    if (initialized && !initializing && !isAuthenticated) {
      router.replace(auth.getLoginRouteByRole(props.activeRole))
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
    clearWorkspaceLoading()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  clearWorkspaceLoading()
})
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
        'workspace-admin': isAdminWorkspace,
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
              <strong>{{ workspaceBrandTitle }}</strong>
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
            <span v-if="workspaceBrandHint" class="workspace-menu-hint">
              {{ workspaceBrandHint }}
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
                <div class="workspace-mega-menu__header-copy">
                  <small>{{ getWorkspaceGroupMeta(activeRole, currentGroup, workspaceDescription).eyebrow }}</small>
                  <strong>{{ getWorkspaceGroupMeta(activeRole, currentGroup, workspaceDescription).title }}</strong>
                </div>
                <p>{{ getWorkspaceGroupMeta(activeRole, currentGroup, workspaceDescription).description }}</p>
              </div>

            <div class="workspace-submenu-row">
              <RouterLink
                v-for="item in currentGroup.items"
                :key="item.id"
                :to="resolveRoleSectionRoute(activeRole, item)"
                class="workspace-submenu-link"
                :class="{ 'workspace-submenu-link--active': section === item.id }"
                @click="handleWorkspaceNavigation(item, $event)"
              >
                <span
                  class="workspace-submenu-icon"
                  :class="{ 'workspace-submenu-icon--vector': getWorkspaceIconPaths(item.id).length }"
                  :data-section="item.id"
                  aria-hidden="true"
                >
                  <svg
                    v-if="getWorkspaceIconPaths(item.id).length"
                    viewBox="0 0 24 24"
                    fill="none"
                    class="workspace-submenu-icon__svg"
                  >
                    <path
                      v-for="iconPath in getWorkspaceIconPaths(item.id)"
                      :key="iconPath"
                      :d="iconPath"
                    />
                  </svg>
                  <span v-else></span>
                </span>
                <span class="workspace-submenu-copy">
                  <strong>{{ getSectionCopy(activeRole, item, currentGroup).label }}</strong>
                  <small>{{ getSectionCopy(activeRole, item, currentGroup).detail }}</small>
                </span>
                <span class="workspace-submenu-accent" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" class="workspace-submenu-accent__svg">
                    <path
                      v-for="iconPath in getWorkspaceUiIconPaths('arrowRight')"
                      :key="`accent-${item.id}-${iconPath}`"
                      :d="iconPath"
                    />
                  </svg>
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
              <strong>{{ workspaceBrandTitle }}</strong>
              <p>{{ workspaceDescription }}</p>
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
                  :to="resolveRoleSectionRoute(activeRole, item)"
                  class="workspace-mobile-link"
                  :class="{ 'workspace-mobile-link--active': section === item.id }"
                  @click="handleWorkspaceNavigation(item, $event)"
                >
                  <span
                    class="workspace-submenu-icon workspace-mobile-link__icon"
                    :class="{ 'workspace-submenu-icon--vector': getWorkspaceIconPaths(item.id).length }"
                    :data-section="item.id"
                    aria-hidden="true"
                  >
                    <svg
                      v-if="getWorkspaceIconPaths(item.id).length"
                      viewBox="0 0 24 24"
                      fill="none"
                      class="workspace-submenu-icon__svg"
                    >
                      <path
                        v-for="iconPath in getWorkspaceIconPaths(item.id)"
                        :key="iconPath"
                        :d="iconPath"
                      />
                    </svg>
                    <span v-else></span>
                  </span>
                  <span class="workspace-mobile-link__copy">
                    <strong>{{ getSectionCopy(activeRole, item, group).label }}</strong>
                    <small>{{ getSectionCopy(activeRole, item, group).detail }}</small>
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
          'portal-admin-workspace': isAdminWorkspace,
        }"
      >
        <div
          v-if="workspaceLoading && activeRole === 'operator' && usesWorkspaceMenu"
          class="workspace-loading-overlay"
          role="status"
          aria-live="polite"
          aria-label="Cargando vista del operador"
        >
          <div class="workspace-loading-shell">
            <div class="workspace-loading-spinner" aria-hidden="true">
              <span v-for="segment in 12" :key="`workspace-loading-segment-${segment}`"></span>
            </div>
            <p class="eyebrow">Executive flight command</p>
            <h3>{{ workspaceLoadingCopy.label || 'Cargando vista' }}</h3>
            <p class="muted">
              {{ workspaceLoadingCopy.detail || 'Estamos preparando la siguiente capa operativa.' }}
            </p>
          </div>
        </div>

        <header v-if="usesWorkspaceMenu && showPortalHeader && !isAdminWorkspace" class="portal-header">
          <div>
            <p class="eyebrow">Espacio de trabajo</p>
            <h2>{{ currentSectionLabel }}</h2>
          </div>
          <p class="muted">{{ workspaceDescription }}</p>
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

.workspace-admin {
  background:
    radial-gradient(circle at top left, rgba(216, 229, 255, 0.42), transparent 24%),
    radial-gradient(circle at top right, rgba(228, 239, 255, 0.68), transparent 28%),
    linear-gradient(180deg, #f5f8fd 0%, #eef3fb 100%);
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

.workspace-admin .workspace-menu-bar {
  position: relative;
  border-color: rgba(122, 149, 201, 0.18);
  background:
    radial-gradient(circle at top left, rgba(223, 233, 252, 0.9), transparent 26%),
    linear-gradient(180deg, rgba(251, 253, 255, 0.96), rgba(242, 247, 255, 0.94));
  box-shadow:
    0 24px 48px rgba(48, 82, 138, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(18px);
}

.workspace-admin .workspace-menu-bar::after {
  content: '';
  position: absolute;
  left: 8%;
  right: 8%;
  bottom: -0.75rem;
  height: 1.35rem;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(121, 152, 209, 0.16), transparent 72%);
  filter: blur(16px);
  pointer-events: none;
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

.workspace-admin .workspace-menu-badge {
  border-color: rgba(77, 119, 204, 0.2);
  background: rgba(223, 234, 255, 0.9);
  color: #31579d;
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

.workspace-admin .workspace-menu-group {
  color: #284165;
  transition:
    transform 0.22s ease,
    color 0.22s ease,
    border-color 0.22s ease,
    background 0.22s ease,
    box-shadow 0.22s ease;
}

.workspace-admin .workspace-menu-group:hover {
  border-color: rgba(114, 148, 214, 0.22);
  background: rgba(241, 246, 255, 0.96);
  color: #1e3c64;
  transform: translateY(-1px);
}

.workspace-admin .workspace-menu-group--active {
  border-color: rgba(88, 124, 201, 0.24);
  background: linear-gradient(180deg, rgba(228, 237, 255, 0.96), rgba(243, 247, 255, 0.98));
  box-shadow:
    0 12px 24px rgba(97, 129, 191, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.76);
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

.workspace-admin .workspace-menu-hint {
  color: #5a6d8d;
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

.workspace-admin .workspace-mega-menu {
  width: min(100%, 1080px);
  padding-top: 0.7rem;
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

.workspace-admin .workspace-mega-menu__panel {
  position: relative;
  overflow: hidden;
  padding: 1.25rem 1.3rem 1.35rem;
  border-color: rgba(125, 152, 201, 0.18);
  background:
    radial-gradient(circle at top left, rgba(226, 236, 255, 0.88), transparent 24%),
    radial-gradient(circle at top right, rgba(240, 246, 255, 0.96), transparent 28%),
    linear-gradient(180deg, rgba(252, 254, 255, 0.99), rgba(241, 246, 255, 0.98));
  box-shadow:
    0 34px 80px rgba(49, 84, 141, 0.16),
    0 10px 24px rgba(110, 140, 194, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.86);
}

.workspace-admin .workspace-mega-menu__panel::before {
  content: '';
  position: absolute;
  inset: 0 auto auto 0;
  width: 16rem;
  height: 16rem;
  background: radial-gradient(circle, rgba(133, 167, 227, 0.12), transparent 70%);
  pointer-events: none;
}

.workspace-admin .workspace-submenu-row {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem;
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

.workspace-mega-menu__header-copy {
  display: grid;
  gap: 0.28rem;
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

.workspace-admin .workspace-mega-menu__header {
  align-items: start;
  padding: 0.1rem 0.15rem 1rem;
  margin-bottom: 0.9rem;
  border-bottom-color: rgba(125, 152, 201, 0.14);
}

.workspace-admin .workspace-mega-menu__header small,
.workspace-admin .workspace-submenu-link small {
  color: #5d78a6;
}

.workspace-admin .workspace-mega-menu__header strong {
  color: #163254;
  font-size: clamp(1.55rem, 2vw, 2.2rem);
  font-weight: 800;
  line-height: 0.98;
  letter-spacing: -0.03em;
}

.workspace-admin .workspace-mega-menu__header p {
  max-width: 30rem;
  color: #6880a7;
  font-size: 0.98rem;
  line-height: 1.45;
}

.workspace-mega-menu__count {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 1.9rem;
  padding: 0 0.8rem;
  border: 1px solid rgba(103, 138, 204, 0.14);
  border-radius: 999px;
  background: rgba(235, 242, 255, 0.92);
  color: #5672a3;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
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

.workspace-admin .workspace-submenu-link:hover,
.workspace-admin .workspace-submenu-link--active {
  background: rgba(231, 239, 255, 0.85);
}

.workspace-admin .workspace-submenu-link {
  position: relative;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.9rem;
  min-height: 8rem;
  padding: 1.15rem 1.15rem 1.15rem 1rem;
  border: 1px solid rgba(120, 152, 206, 0.14);
  border-radius: 22px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(245, 249, 255, 0.94));
  box-shadow:
    0 12px 28px rgba(77, 110, 171, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.75);
  transition:
    transform 0.22s ease,
    border-color 0.22s ease,
    box-shadow 0.22s ease,
    background 0.22s ease;
}

.workspace-admin .workspace-submenu-link:hover {
  transform: translateY(-2px);
  border-color: rgba(108, 143, 213, 0.22);
  background:
    radial-gradient(circle at top right, rgba(222, 234, 255, 0.8), transparent 30%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(244, 248, 255, 0.98));
  box-shadow:
    0 18px 34px rgba(77, 110, 171, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.82);
}

.workspace-admin .workspace-submenu-link--active {
  border-color: rgba(96, 133, 208, 0.28);
  background:
    radial-gradient(circle at top right, rgba(220, 232, 255, 0.94), transparent 34%),
    linear-gradient(180deg, rgba(243, 248, 255, 0.98), rgba(234, 242, 255, 0.98));
  box-shadow:
    0 20px 36px rgba(77, 110, 171, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.84);
}

.workspace-admin .workspace-submenu-link strong {
  color: #162b47;
  font-size: 1.06rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.workspace-admin .workspace-submenu-link small {
  color: #6480ad;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.workspace-admin .workspace-submenu-link:hover .workspace-submenu-icon,
.workspace-admin .workspace-submenu-link--active .workspace-submenu-icon {
  color: #48699f;
  box-shadow:
    0 12px 28px rgba(77, 110, 171, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.86);
}

.workspace-submenu-accent {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 999px;
  border: 1px solid rgba(120, 152, 206, 0.16);
  background: rgba(245, 249, 255, 0.88);
  color: #6784b4;
  transition:
    transform 0.22s ease,
    border-color 0.22s ease,
    background 0.22s ease,
    color 0.22s ease;
}

.workspace-admin .workspace-submenu-link:hover .workspace-submenu-accent,
.workspace-admin .workspace-submenu-link--active .workspace-submenu-accent {
  border-color: rgba(98, 134, 206, 0.24);
  background: rgba(232, 240, 255, 0.96);
  color: #48699f;
  transform: translateX(2px);
}

.workspace-mobile-drawer {
  display: none;
}

.portal {
  position: relative;
  padding: 0;
  background: #ffffff;
  min-height: calc(100vh - 4.6rem);
}

.portal-workspace {
  padding: 3.4rem 0 0;
}

.workspace-loading-overlay {
  position: fixed;
  inset: 6.2rem 1.25rem 1.25rem;
  z-index: 200;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  border-radius: 36px;
  background:
    radial-gradient(circle at 50% 24%, rgba(148, 163, 184, 0.16), transparent 26%),
    rgba(236, 242, 250, 0.6);
  backdrop-filter: blur(18px);
}

.workspace-loading-shell {
  display: grid;
  justify-items: center;
  gap: 0.8rem;
  width: min(26rem, 100%);
  padding: clamp(1.5rem, 4vw, 2.15rem);
  border: 1px solid rgba(191, 219, 254, 0.45);
  border-radius: 32px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(244, 248, 255, 0.96)),
    rgba(255, 255, 255, 0.96);
  box-shadow:
    0 32px 80px rgba(15, 23, 42, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.88);
  text-align: center;
}

.workspace-loading-shell h3,
.workspace-loading-shell p {
  margin: 0;
}

.workspace-loading-shell h3 {
  color: #10233d;
  font-size: clamp(1.4rem, 2.5vw, 1.8rem);
  font-weight: 800;
}

.workspace-loading-shell .muted {
  max-width: 24rem;
  color: #60748f;
}

.workspace-loading-spinner {
  position: relative;
  width: 8rem;
  height: 8rem;
  margin-bottom: 0.25rem;
}

.workspace-loading-spinner span {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 1rem;
  height: 3.3rem;
  margin: -1.65rem 0 0 -0.5rem;
  border-radius: 999px;
  background: rgba(100, 116, 139, 0.14);
  transform-origin: center 3.6rem;
  animation: workspace-loading-spinner-fade 1.2s linear infinite;
}

.workspace-loading-spinner span:nth-child(1) {
  transform: rotate(0deg) translateY(-2rem);
  animation-delay: -1.1s;
}

.workspace-loading-spinner span:nth-child(2) {
  transform: rotate(30deg) translateY(-2rem);
  animation-delay: -1s;
}

.workspace-loading-spinner span:nth-child(3) {
  transform: rotate(60deg) translateY(-2rem);
  animation-delay: -0.9s;
}

.workspace-loading-spinner span:nth-child(4) {
  transform: rotate(90deg) translateY(-2rem);
  animation-delay: -0.8s;
}

.workspace-loading-spinner span:nth-child(5) {
  transform: rotate(120deg) translateY(-2rem);
  animation-delay: -0.7s;
}

.workspace-loading-spinner span:nth-child(6) {
  transform: rotate(150deg) translateY(-2rem);
  animation-delay: -0.6s;
}

.workspace-loading-spinner span:nth-child(7) {
  transform: rotate(180deg) translateY(-2rem);
  animation-delay: -0.5s;
}

.workspace-loading-spinner span:nth-child(8) {
  transform: rotate(210deg) translateY(-2rem);
  animation-delay: -0.4s;
}

.workspace-loading-spinner span:nth-child(9) {
  transform: rotate(240deg) translateY(-2rem);
  animation-delay: -0.3s;
}

.workspace-loading-spinner span:nth-child(10) {
  transform: rotate(270deg) translateY(-2rem);
  animation-delay: -0.2s;
}

.workspace-loading-spinner span:nth-child(11) {
  transform: rotate(300deg) translateY(-2rem);
  animation-delay: -0.1s;
}

.workspace-loading-spinner span:nth-child(12) {
  transform: rotate(330deg) translateY(-2rem);
  animation-delay: 0s;
}

@keyframes workspace-loading-spinner-fade {
  0% {
    background: rgba(51, 65, 85, 0.96);
    box-shadow: 0 0 18px rgba(51, 65, 85, 0.16);
  }
  100% {
    background: rgba(100, 116, 139, 0.12);
    box-shadow: none;
  }
}

.portal-admin-workspace {
  background: transparent;
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
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 28px;
  background:
    radial-gradient(circle at 18% 0%, rgba(191, 219, 254, 0.18), transparent 32%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 250, 255, 0.96));
  box-shadow:
    0 24px 54px rgba(15, 23, 42, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.76);
  backdrop-filter: blur(24px);
  animation: workspace-mega-enter 0.28s cubic-bezier(0.18, 0.88, 0.32, 1.12);
}

.workspace-operator .workspace-mega-menu__header {
  align-items: end;
  padding: 0.25rem 0.35rem 1rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
}

.workspace-operator .workspace-mega-menu__header strong {
  color: #11253f;
  font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
  font-size: 1.85rem;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.03em;
}

.workspace-operator .workspace-mega-menu__header small,
.workspace-operator .workspace-submenu-link small {
  color: #6980a1;
}

.workspace-operator .workspace-mega-menu__header small {
  font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.14em;
}

.workspace-operator .workspace-mega-menu__header p {
  color: #60748f;
  font-size: 0.95rem;
  line-height: 1.55;
}

.workspace-operator .workspace-mega-menu__count {
  border-color: rgba(191, 219, 254, 0.32);
  background: rgba(239, 246, 255, 0.96);
  color: #4f6f9f;
}

.workspace-operator .workspace-submenu-link {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.95rem;
  min-height: 8rem;
  padding: 1.2rem;
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 24px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(247, 250, 255, 0.96)),
    rgba(255, 255, 255, 0.94);
  color: #10233d;
  box-shadow:
    0 14px 30px rgba(15, 23, 42, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.84);
  transform: translateY(0) scale(1);
  transition:
    border-color 0.3s ease,
    box-shadow 0.3s ease,
    transform 0.34s cubic-bezier(0.2, 0.9, 0.2, 1.16),
    background 0.3s ease;
}

.workspace-operator .workspace-submenu-link:hover,
.workspace-operator .workspace-submenu-link--active {
  border-color: rgba(148, 163, 184, 0.28);
  background:
    radial-gradient(circle at 20% 0%, rgba(191, 219, 254, 0.18), transparent 34%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.995), rgba(244, 248, 255, 0.98));
  box-shadow:
    0 18px 36px rgba(15, 23, 42, 0.1),
    0 0 0 1px rgba(255, 255, 255, 0.42);
  transform: translateY(-3px) scale(1.01);
}

.workspace-operator .workspace-submenu-link--active {
  box-shadow:
    0 18px 36px rgba(15, 23, 42, 0.1),
    0 0 0 1px rgba(191, 219, 254, 0.32),
    inset 0 1px 0 rgba(255, 255, 255, 0.84);
}

.workspace-operator .workspace-submenu-link strong {
  color: #11253f;
  font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
  font-size: 1rem;
  font-weight: 800;
}

.workspace-operator .workspace-submenu-link small {
  color: #60748f;
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

.workspace-operator .workspace-submenu-link .workspace-submenu-accent {
  width: 2rem;
  height: 2rem;
  align-self: center;
  justify-self: end;
  border-color: rgba(203, 213, 225, 0.96);
  background: rgba(255, 255, 255, 0.94);
  color: #5a7195;
  box-shadow:
    0 8px 18px rgba(15, 23, 42, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

.workspace-operator .workspace-submenu-link:hover .workspace-submenu-accent,
.workspace-operator .workspace-submenu-link--active .workspace-submenu-accent {
  border-color: rgba(148, 163, 184, 0.28);
  background: rgba(239, 246, 255, 0.96);
  color: #24446f;
}

.workspace-operator .workspace-mega-menu:has(.workspace-submenu-link:nth-child(1):last-child) {
  width: min(100%, 520px);
}

.workspace-operator .workspace-mega-menu:has(.workspace-submenu-link:nth-child(1):last-child) .workspace-submenu-row {
  grid-template-columns: 1fr;
}

.workspace-submenu-icon {
  display: inline-flex;
  width: 0.95rem;
  height: 0.95rem;
  border-radius: 0.22rem;
  background: linear-gradient(180deg, #314965, #18293f);
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.38);
}

.workspace-submenu-icon span {
  display: none;
}

.workspace-admin .workspace-submenu-icon {
  position: relative;
  display: grid;
  place-items: center;
  width: 3.1rem;
  height: 3.1rem;
  border: 1px solid rgba(198, 214, 243, 0.9);
  border-radius: 16px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(242, 247, 255, 0.96)),
    rgba(255, 255, 255, 0.96);
  color: #5f7ead;
  box-shadow:
    0 10px 24px rgba(77, 110, 171, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.82);
}

.workspace-operator .workspace-submenu-icon {
  position: relative;
  display: grid;
  place-items: center;
  width: 3.45rem;
  height: 3.45rem;
  border: 1px solid rgba(226, 232, 240, 0.98);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 1), rgba(248, 250, 252, 0.98)),
    rgba(255, 255, 255, 0.98);
  color: #5a7195;
  box-shadow:
    0 10px 22px rgba(15, 23, 42, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.88);
}

.workspace-operator .workspace-submenu-icon--vector::before,
.workspace-operator .workspace-submenu-icon--vector::after,
.workspace-operator .workspace-submenu-icon--vector span,
.workspace-operator .workspace-submenu-icon--vector span::before,
.workspace-operator .workspace-submenu-icon--vector span::after {
  content: none !important;
  display: none !important;
}

.workspace-operator .workspace-submenu-icon__svg {
  width: 1.7rem;
  height: 1.7rem;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.workspace-admin .workspace-submenu-icon__svg,
.workspace-mobile-link__icon .workspace-submenu-icon__svg,
.workspace-submenu-accent__svg {
  width: 1.45rem;
  height: 1.45rem;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
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
  color: #24446f;
  box-shadow:
    0 12px 26px rgba(15, 23, 42, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

.workspace-operator .workspace-submenu-icon[data-section='dashboard']::before {
  width: 1.52rem;
  height: 1.52rem;
  border: 1.35px solid currentColor;
  border-radius: 50%;
}

.workspace-operator .workspace-submenu-icon[data-section='dashboard']::after {
  width: 0.42rem;
  height: 0.42rem;
  border: 1.35px solid currentColor;
  border-radius: 50%;
}

.workspace-operator .workspace-submenu-icon[data-section='dashboard'] span {
  width: 2.08rem;
  height: 1.35px;
  background: currentColor;
}

.workspace-operator .workspace-submenu-icon[data-section='dashboard'] span::before,
.workspace-operator .workspace-submenu-icon[data-section='dashboard'] span::after {
  left: 50%;
  top: 50%;
  width: 1.35px;
  height: 2.08rem;
  background: currentColor;
  transform: translate(-50%, -50%);
}

.workspace-operator .workspace-submenu-icon[data-section='dashboard'] span::after {
  transform: translate(-50%, -50%) rotate(45deg);
}

.workspace-operator .workspace-submenu-icon[data-section='dashboard'] span::before {
  transform: translate(-50%, -50%) rotate(-45deg);
}

.workspace-operator .workspace-submenu-icon[data-section='empresa']::before {
  width: 1.7rem;
  height: 1.7rem;
  border: 1.35px solid currentColor;
  border-radius: 50%;
}

.workspace-operator .workspace-submenu-icon[data-section='empresa']::after {
  width: 1rem;
  height: 1rem;
  border: 1.35px solid currentColor;
  border-radius: 50%;
}

.workspace-operator .workspace-submenu-icon[data-section='empresa'] span {
  width: 0.42rem;
  height: 0.42rem;
  border: 1.35px solid currentColor;
  border-radius: 50%;
}

.workspace-operator .workspace-submenu-icon[data-section='aeronaves']::before {
  width: 2.15rem;
  height: 0.42rem;
  border: 1.35px solid currentColor;
  border-radius: 999px 70% 70% 999px;
  transform: rotate(-14deg);
}

.workspace-operator .workspace-submenu-icon[data-section='aeronaves']::after {
  width: 1.1rem;
  height: 0.42rem;
  border-top: 1.35px solid currentColor;
  transform: translate(0.05rem, 0.28rem) rotate(25deg);
}

.workspace-operator .workspace-submenu-icon[data-section='aeronaves'] span {
  width: 0.82rem;
  height: 0.82rem;
  border-left: 1.35px solid currentColor;
  border-top: 1.35px solid currentColor;
  transform: translate(-0.72rem, -0.28rem) rotate(-18deg);
}

.workspace-operator .workspace-submenu-icon[data-section='costos']::before {
  width: 1.86rem;
  height: 1.86rem;
  border: 1.35px solid currentColor;
  border-radius: 50%;
}

.workspace-operator .workspace-submenu-icon[data-section='costos']::after {
  width: 0.9rem;
  height: 0.9rem;
  border-left: 1.35px solid currentColor;
  border-bottom: 1.35px solid currentColor;
  transform: rotate(-45deg) translate(0.05rem, -0.05rem);
}

.workspace-operator .workspace-submenu-icon[data-section='costos'] span {
  width: 1.12rem;
  height: 1.35px;
  background: currentColor;
  transform: rotate(-22deg);
  transform-origin: right center;
}

.workspace-operator .workspace-submenu-icon[data-section='disponibilidad']::before {
  width: 1.95rem;
  height: 1.95rem;
  border: 1.35px solid currentColor;
  border-radius: 50%;
}

.workspace-operator .workspace-submenu-icon[data-section='disponibilidad']::after {
  width: 0.54rem;
  height: 0.54rem;
  border: 1.35px solid currentColor;
  border-radius: 50%;
}

.workspace-operator .workspace-submenu-icon[data-section='disponibilidad'] span {
  width: 1rem;
  height: 1.35px;
  background: currentColor;
  transform-origin: left center;
  transform: translateX(0.1rem) rotate(-34deg);
}

.workspace-operator .workspace-submenu-icon[data-section='solicitudes']::before {
  width: 1.95rem;
  height: 1.22rem;
  border: 1.35px solid currentColor;
  border-radius: 0.18rem;
  transform: rotate(-6deg);
}

.workspace-operator .workspace-submenu-icon[data-section='solicitudes']::after {
  width: 1.1rem;
  height: 1.35px;
  background: currentColor;
  transform: translateY(-0.18rem) rotate(-6deg);
}

.workspace-operator .workspace-submenu-icon[data-section='solicitudes'] span {
  width: 0.78rem;
  height: 1.35px;
  background: currentColor;
  transform: translate(-0.16rem, 0.22rem) rotate(-6deg);
}

.workspace-operator .workspace-submenu-icon[data-section='release-provider']::before {
  width: 1.76rem;
  height: 1.76rem;
  border: 1.35px solid currentColor;
  border-radius: 50%;
}

.workspace-operator .workspace-submenu-icon[data-section='release-provider']::after {
  width: 1.18rem;
  height: 1.18rem;
  border: 1.35px solid currentColor;
  transform: rotate(45deg);
}

.workspace-operator .workspace-submenu-icon[data-section='release-provider'] span {
  width: 0.78rem;
  height: 0.42rem;
  border-left: 1.35px solid currentColor;
  border-bottom: 1.35px solid currentColor;
  transform: rotate(-45deg) translate(0.08rem, -0.04rem);
}

.workspace-operator .workspace-submenu-icon[data-section='operaciones']::before {
  width: 2.05rem;
  height: 1.45rem;
  border: 1.35px solid currentColor;
  border-radius: 45% 55% 45% 55%;
  transform: rotate(-12deg);
}

.workspace-operator .workspace-submenu-icon[data-section='operaciones']::after {
  width: 0.42rem;
  height: 0.42rem;
  border: 1.35px solid currentColor;
  border-radius: 50%;
  box-shadow:
    0.72rem -0.28rem 0 -0.02rem rgba(201, 160, 99, 0),
    0.72rem -0.28rem 0 0 currentColor,
    -0.55rem 0.38rem 0 0 currentColor;
}

.workspace-operator .workspace-submenu-icon[data-section='operaciones'] span {
  width: 1.45rem;
  height: 1.35px;
  background: currentColor;
  transform: rotate(-22deg);
}

.workspace-operator .workspace-submenu-icon[data-section='incidencias']::before {
  width: 2rem;
  height: 1.24rem;
  border: 1.35px solid currentColor;
  border-radius: 999px;
}

.workspace-operator .workspace-submenu-icon[data-section='incidencias']::after {
  width: 0.46rem;
  height: 0.46rem;
  border: 1.35px solid currentColor;
  border-radius: 50%;
  box-shadow:
    -0.72rem 0 0 -0.02rem rgba(201, 160, 99, 0),
    -0.72rem 0 0 0 currentColor,
    0.72rem 0 0 0 currentColor;
}

.workspace-operator .workspace-submenu-icon[data-section='incidencias'] span {
  width: 1.46rem;
  height: 1.35px;
  background: currentColor;
  transform: rotate(-28deg);
}

.workspace-operator .workspace-submenu-icon[data-section='pagos']::before {
  width: 1.58rem;
  height: 2rem;
  border: 1.35px solid currentColor;
  border-radius: 0.22rem;
}

.workspace-operator .workspace-submenu-icon[data-section='pagos']::after {
  width: 1rem;
  height: 1.35px;
  background: currentColor;
  transform: translateY(-0.34rem);
  box-shadow: 0 0.44rem 0 currentColor;
}

.workspace-operator .workspace-submenu-icon[data-section='pagos'] span {
  width: 0.48rem;
  height: 0.48rem;
  border: 1.35px solid currentColor;
  border-radius: 50%;
  transform: translate(0.28rem, 0.54rem);
}

.workspace-operator .workspace-submenu-icon[data-section='historial']::before {
  width: 2rem;
  height: 1.35px;
  background: currentColor;
}

.workspace-operator .workspace-submenu-icon[data-section='historial']::after {
  width: 0.44rem;
  height: 0.44rem;
  border: 1.35px solid currentColor;
  border-radius: 50%;
  box-shadow:
    -0.72rem 0 0 0 currentColor,
    0.72rem 0 0 0 currentColor;
}

.workspace-operator .workspace-submenu-icon[data-section='historial'] span {
  width: 1.35px;
  height: 1.45rem;
  background: currentColor;
  transform: translateX(-0.72rem);
  box-shadow:
    0.72rem 0 0 currentColor,
    1.44rem 0 0 currentColor;
}

.workspace-operator .workspace-submenu-icon[data-section='configuracion']::before {
  width: 1.95rem;
  height: 1.42rem;
  border: 1.35px solid currentColor;
  border-radius: 0.72rem;
}

.workspace-operator .workspace-submenu-icon[data-section='configuracion']::after {
  width: 0.46rem;
  height: 0.46rem;
  border: 1.35px solid currentColor;
  border-radius: 50%;
  transform: translateX(-0.46rem);
  box-shadow: 0.92rem 0 0 0 currentColor;
}

.workspace-operator .workspace-submenu-icon[data-section='configuracion'] span {
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

  .workspace-admin .workspace-mobile-drawer__sheet {
    background: linear-gradient(180deg, #f7faff 0%, #edf3fc 100%);
  }

  .workspace-mobile-drawer__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.95rem 1rem;
    border: 1px solid rgba(226, 232, 240, 0.92);
    border-radius: 24px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.96));
    box-shadow:
      0 14px 30px rgba(15, 23, 42, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.9);
  }

  .workspace-mobile-drawer__logo {
    display: inline-flex;
    align-items: center;
    min-width: 0;
  }

  .workspace-mobile-drawer__close {
    position: relative;
    width: 2.9rem;
    min-width: 2.9rem;
    min-height: 2.9rem;
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
    display: inline-grid;
    place-items: center;
    width: 2.4rem;
    height: 2.4rem;
    flex: 0 0 auto;
    border-radius: 14px;
    border: 1px solid rgba(198, 214, 243, 0.9);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(242, 247, 255, 0.96)),
      rgba(255, 255, 255, 0.96);
    color: #5f7ead;
    box-shadow:
      0 8px 18px rgba(77, 110, 171, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.82);
  }

  .workspace-mobile-link--active {
    color: #bc8d2f;
  }

  .workspace-admin .workspace-mobile-link--active {
    color: #31579d;
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
    background: rgba(15, 23, 42, 0.22);
    backdrop-filter: blur(18px);
  }

  .workspace-operator .workspace-mobile-drawer__sheet {
    background:
      radial-gradient(circle at 18% 0%, rgba(191, 219, 254, 0.22), transparent 30%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(246, 250, 255, 0.97));
  }

  .workspace-operator .workspace-mobile-drawer__intro strong,
  .workspace-operator .workspace-mobile-link,
  .workspace-operator .workspace-mobile-logout {
    color: #11253f;
  }

  .workspace-operator .workspace-mobile-drawer__intro p,
  .workspace-operator .workspace-mobile-group__title {
    color: #6980a1;
  }

  .workspace-operator .workspace-mobile-link--active {
    color: #24446f;
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
    border: 1px solid rgba(226, 232, 240, 0.96);
    border-radius: 20px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.995), rgba(247, 250, 255, 0.97)),
      rgba(255, 255, 255, 0.95);
    box-shadow:
      0 14px 30px rgba(15, 23, 42, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.84);
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
    color: #11253f;
    font-size: 0.9rem;
    line-height: 1.15;
  }

  .workspace-mobile-link__copy small {
    color: #60748f;
    font-size: 0.76rem;
    line-height: 1.3;
  }

  .workspace-admin .workspace-mobile-link__copy small {
    color: #64748b;
  }

  .workspace-operator .workspace-mobile-drawer__close,
  .workspace-operator .workspace-mobile-logout {
    border-color: rgba(226, 232, 240, 0.96);
    background: rgba(255, 255, 255, 0.92);
  }

  .workspace-operator .workspace-mobile-drawer__top {
    border-color: rgba(226, 232, 240, 0.96);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(244, 248, 255, 0.96)),
      rgba(255, 255, 255, 0.96);
  }

  .workspace-operator .workspace-mobile-drawer__close span {
    background: #24446f;
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

.workspace-operator:has(.operator-dashboard-luxury) {
  background:
    radial-gradient(circle at top left, rgba(191, 219, 254, 0.3), transparent 18%),
    linear-gradient(180deg, #f7fbff 0%, #eef4fb 52%, #f8fbff 100%);
  color: #10233d;
}

.workspace-operator:has(.operator-incidents-dashboard),
.workspace-operator:has(.fleet-operations-luxury),
.workspace-operator:has(.operator-costs-luxury),
.workspace-operator:has(.availability-control-luxury),
.workspace-operator:has(.flight-release-luxury),
.workspace-operator:has(.operator-certification-luxury),
.workspace-operator:has(.flight-tracking-luxury),
.workspace-operator:has(.flight-ops-command-luxury),
.workspace-operator:has(.payments-cockpit-page),
.workspace-operator:has(.operator-history-luxury),
.workspace-operator:has(.operator-settings-luxury) {
  background:
    radial-gradient(circle at 14% 8%, rgba(191, 219, 254, 0.14), transparent 22%),
    radial-gradient(circle at 86% 12%, rgba(254, 240, 214, 0.12), transparent 18%),
    linear-gradient(180deg, #fbfdff 0%, #f3f7fc 100%);
  color: #10233d;
}

.workspace-operator:has(.operator-costs-luxury) {
  background:
    radial-gradient(circle at 14% 8%, rgba(241, 245, 249, 0.62), transparent 22%),
    radial-gradient(circle at 86% 12%, rgba(248, 244, 236, 0.34), transparent 18%),
    linear-gradient(180deg, #fcfcfb 0%, #f5f5f3 100%);
  color: #10233d;
}

.workspace-operator:has(.operator-incidents-dashboard) .workspace-menu-shell::before,
.workspace-operator:has(.fleet-operations-luxury) .workspace-menu-shell::before,
.workspace-operator:has(.operator-costs-luxury) .workspace-menu-shell::before,
.workspace-operator:has(.availability-control-luxury) .workspace-menu-shell::before,
.workspace-operator:has(.flight-release-luxury) .workspace-menu-shell::before,
.workspace-operator:has(.operator-certification-luxury) .workspace-menu-shell::before,
.workspace-operator:has(.flight-tracking-luxury) .workspace-menu-shell::before,
.workspace-operator:has(.flight-ops-command-luxury) .workspace-menu-shell::before,
.workspace-operator:has(.payments-cockpit-page) .workspace-menu-shell::before,
.workspace-operator:has(.operator-history-luxury) .workspace-menu-shell::before,
.workspace-operator:has(.operator-settings-luxury) .workspace-menu-shell::before {
  background:
    radial-gradient(circle at 50% 50%, rgba(191, 219, 254, 0.24), transparent 68%),
    radial-gradient(circle at 22% 50%, rgba(15, 39, 71, 0.04), transparent 42%);
  filter: blur(20px);
}

.workspace-operator:has(.operator-costs-luxury) .workspace-menu-shell::before {
  background:
    radial-gradient(circle at 50% 50%, rgba(226, 232, 240, 0.3), transparent 68%),
    radial-gradient(circle at 22% 50%, rgba(120, 113, 108, 0.04), transparent 42%);
  filter: blur(20px);
}

.workspace-operator:has(.operator-dashboard-luxury) .portal-header {
  margin-bottom: 0.25rem;
  border-bottom-color: rgba(148, 163, 184, 0.18);
}

.workspace-operator:has(.operator-dashboard-luxury) .portal-header h2 {
  color: #11253f;
}

.workspace-operator:has(.operator-dashboard-luxury) .portal-header .muted,
.workspace-operator:has(.operator-dashboard-luxury) .eyebrow {
  color: #6b7f99;
}

.workspace-operator:has(.operator-dashboard-luxury) .workspace-menu-shell::before {
  background:
    radial-gradient(circle at 50% 50%, rgba(15, 39, 71, 0.42), transparent 68%),
    radial-gradient(circle at 22% 50%, rgba(212, 169, 93, 0.08), transparent 42%);
  filter: blur(22px);
}

.workspace-operator:has(.operator-dashboard-luxury) .workspace-menu-bar {
  border-color: rgba(255, 255, 255, 0.08);
  background:
    linear-gradient(135deg, rgba(11, 22, 39, 0.98), rgba(24, 38, 63, 0.97) 52%, rgba(14, 24, 39, 0.98) 100%);
  box-shadow:
    0 20px 44px rgba(15, 23, 42, 0.16),
    0 8px 18px rgba(2, 6, 23, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(18px);
}

.workspace-operator:has(.operator-dashboard-luxury) .workspace-menu-bar::before {
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.14), transparent);
}

.workspace-operator:has(.operator-dashboard-luxury) .workspace-menu-bar::after {
  background: linear-gradient(90deg, transparent, rgba(212, 169, 93, 0.24), transparent);
}

.workspace-operator:has(.operator-dashboard-luxury) .workspace-menu-brand strong,
.workspace-operator:has(.operator-dashboard-luxury) .workspace-menu-group,
.workspace-operator:has(.operator-dashboard-luxury) .workspace-menu-logout {
  color: #eff6ff;
}

.workspace-operator:has(.operator-dashboard-luxury) .workspace-menu-brand small {
  color: rgba(226, 232, 240, 0.76);
}

.workspace-operator:has(.operator-dashboard-luxury) .workspace-menu-badge,
.workspace-operator:has(.operator-dashboard-luxury) .workspace-menu-hint {
  border-color: rgba(212, 169, 93, 0.18);
  background: rgba(255, 255, 255, 0.04);
  color: #d4a95d;
  box-shadow: none;
}

.workspace-operator:has(.operator-dashboard-luxury) .workspace-menu-groups {
  border-color: rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
}

.workspace-operator:has(.operator-dashboard-luxury) .workspace-menu-group {
  color: rgba(226, 232, 240, 0.82);
}

.workspace-operator:has(.operator-dashboard-luxury) .workspace-menu-group:hover,
.workspace-operator:has(.operator-dashboard-luxury) .workspace-menu-group--active {
  border-color: rgba(212, 169, 93, 0.18);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0.04));
  color: #ffffff;
  box-shadow:
    0 10px 24px rgba(15, 23, 42, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  transform: translateY(-1px) scale(1.01);
}

.workspace-operator:has(.operator-dashboard-luxury) .workspace-menu-group--active::before {
  background: linear-gradient(110deg, transparent 0%, rgba(212, 169, 93, 0.14) 48%, transparent 72%);
}

.workspace-operator:has(.operator-dashboard-luxury) .workspace-menu-group--active::after {
  background: linear-gradient(90deg, transparent, #d4a95d, transparent);
  box-shadow: 0 0 12px rgba(212, 169, 93, 0.35);
}

.workspace-operator:has(.operator-dashboard-luxury) .workspace-menu-logout,
.workspace-operator:has(.operator-dashboard-luxury) .workspace-menu-toggle {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  box-shadow: none;
}

@media (max-width: 760px) {
  .workspace-operator:has(.operator-dashboard-luxury) .workspace-menu-bar {
    background:
      linear-gradient(180deg, rgba(11, 22, 39, 0.98), rgba(24, 38, 63, 0.97) 58%, rgba(14, 24, 39, 0.98) 100%);
  }
}
</style>
