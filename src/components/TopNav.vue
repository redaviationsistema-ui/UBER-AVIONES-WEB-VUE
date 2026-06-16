<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BrandLogo from './BrandLogo.vue'
import { buildMenuGroups, resolveRoleSectionPath, roleSections } from '../data/roleFlows'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const publicLinks = [
  //{ label: 'Renta', icon: '', to: '/renta-aeronaves' },
  { label: 'Servicios', icon: 'service', to: '/servicios' },
  { label: 'Plataforma', icon: 'grid', to: '/plataforma' },
  { label: 'Membresias', icon: 'membership', to: '/membresias' },
  { label: 'Cobertura', icon: 'globe', to: '/cobertura' },
]

const utilityLinks = [
  { label: 'ES', icon: 'globe', to: '/idioma' },
  { label: 'Ayuda', icon: 'help', to: '/ayuda' },
]

const publicMenuGroups = [
  { label: 'Explorar', items: publicLinks },
  { label: 'Utilidades', items: utilityLinks },
]

const routeToRole = {
  cliente: 'client',
  operador: 'operator',
  crew: 'crew',
  admin: 'admin',
}

const roleDescriptions = {
  client: 'Reserva y seguimiento',
  operator: 'Flota y disponibilidad',
  crew: 'Servicio y cabina',
  admin: 'Control de negocio',
}

const roleDisplayNames = {
  client: 'Cliente',
  operator: 'Proveedor',
  crew: 'Sobrecargo',
  admin: 'Admin',
}

const activeRouteRole = computed(() => routeToRole[route.name] || '')
const activeRole = computed(() => activeRouteRole.value || auth.effectiveRole || '')
const isRoleView = computed(() => Boolean(activeRole.value))
const hideTopbar = computed(
  () => route.meta.hideTopbar || ['login', 'registro'].includes(route.name),
)

const currentRoleMenu = computed(() => roleSections[activeRole.value] || [])
const currentSectionLabel = computed(
  () =>
    currentRoleMenu.value.find((item) => item.id === route.params.section)?.label ||
    currentRoleMenu.value[0]?.label ||
    '',
)
const workspaceAccountLabel = computed(() => auth.userName)
const isClientWorkspace = computed(() => activeRole.value === 'client')
const isLightWorkspace = computed(() =>
  ['client', 'crew', 'operator', 'admin'].includes(activeRole.value),
)
const showWorkspaceUser = computed(() =>
  ['client', 'operator', 'crew', 'admin'].includes(activeRole.value),
)
const workspaceThemeClass = computed(() =>
  activeRole.value ? `workspace-topbar--${activeRole.value}` : '',
)
// const workspaceLogoWidth = computed(() => (isCrewWorkspace.value ? 88 : 124))
// const usesMobileDrawer = computed(() => ['client', 'operator', 'crew', 'admin'].includes(activeRole.value))
const MOBILE_WORKSPACE_BREAKPOINT = 1024
const isMobile = ref(window.innerWidth <= MOBILE_WORKSPACE_BREAKPOINT)
const IS_LOCAL_CREW_WORKSPACE =
  typeof window !== 'undefined' &&
  /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname || '')

window.addEventListener('resize', () => {
  isMobile.value = window.innerWidth <= MOBILE_WORKSPACE_BREAKPOINT
})

const usesMobileDrawer = computed(() => {
  return isMobile.value && ['client', 'operator', 'crew', 'admin'].includes(activeRole.value)
})
const usesPublicMobileDrawer = computed(() => !isRoleView.value)
const workspaceMenuOpen = ref(false)
const workspaceMenuGroups = computed(() => buildMenuGroups(activeRole.value, currentRoleMenu.value))
const workspaceDesktopMenu = ref('')
const workspaceDrawerMenu = ref('')
let crewStatusRefreshTimer = null

function isWorkspaceItemActive(item) {
  return route.params.section === item.id
}

function toggleMenu(targetName, label) {
  const target = targetName === 'desktop' ? workspaceDesktopMenu : workspaceDrawerMenu
  target.value = target.value === label ? '' : label
}

function isMenuOpen(targetName, label) {
  const target = targetName === 'desktop' ? workspaceDesktopMenu : workspaceDrawerMenu
  return target.value === label
}

function closeAllMenus() {
  workspaceDesktopMenu.value = ''
  workspaceDrawerMenu.value = ''
}

function handleDocumentClick(event) {
  const target = event.target
  if (!(target instanceof Element)) return

  if (!target.closest('.menu-master') && !target.closest('.workspace-drawer-dropdown')) {
    closeAllMenus()
  }
}

function handleDocumentKeydown(event) {
  if (event.key === 'Escape') {
    closeAllMenus()
  }
}

function clearCrewStatusRefresh() {
  if (crewStatusRefreshTimer) {
    clearInterval(crewStatusRefreshTimer)
    crewStatusRefreshTimer = null
  }
}

async function refreshCrewStatusCard() {
  if (activeRole.value !== 'crew' || !auth.isAuthenticated) return
  if (typeof document !== 'undefined' && document.hidden) return
  await auth.refreshSession()
}

function startCrewStatusRefresh() {
  clearCrewStatusRefresh()
  if (activeRole.value !== 'crew' || !auth.isAuthenticated) return
  if (IS_LOCAL_CREW_WORKSPACE) return
  crewStatusRefreshTimer = setInterval(() => {
    void refreshCrewStatusCard()
  }, 15000)
}

const iconPaths = {
  overview:
    'M4 5.5A1.5 1.5 0 0 1 5.5 4H10v7H4V5.5ZM12 4h6.5A1.5 1.5 0 0 1 20 5.5V9h-8V4ZM4 13h6v7H5.5A1.5 1.5 0 0 1 4 18.5V13Zm8 0h8v5.5a1.5 1.5 0 0 1-1.5 1.5H12v-7Z',
  reservations:
    'M7 3h2v2h6V3h2v2h1.5A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5H7V3Zm11 7H6v8h12v-8Z',
  account: 'M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.3 0-6 1.8-6 4v2h12v-2c0-2.2-2.7-4-6-4Z',
  clipboard:
    'M9 4.5h6a1 1 0 0 1 1 1V7h1.5A1.5 1.5 0 0 1 19 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 18.5v-10A1.5 1.5 0 0 1 6.5 7H8V5.5a1 1 0 0 1 1-1Zm0 2V7h6v-.5h-6ZM7 9v9h10V9H7Zm2 2h6v1.5H9V11Zm0 3h4v1.5H9V14Z',
  shield:
    'M12 3.2 18 5.6v4.8c0 4.2-2.45 7.77-6 9.4-3.55-1.63-6-5.2-6-9.4V5.6l6-2.4Zm0 2.15-4 1.6v3.45c0 3.13 1.7 5.9 4 7.3 2.3-1.4 4-4.17 4-7.3V6.95l-4-1.6Zm-.7 3.15h1.4v3.1l2.35 2.35-1 1-2.75-2.75V8.5Z',
  link: 'M8.9 15.1a3 3 0 0 1 0-4.24l2.47-2.47 1.06 1.06-2.47 2.47a1.5 1.5 0 0 0 2.12 2.12l2.47-2.47 1.06 1.06-2.47 2.47a3 3 0 0 1-4.24 0Zm6.2-6.2a1.5 1.5 0 0 0-2.12 0l-2.47 2.47-1.06-1.06 2.47-2.47a3 3 0 1 1 4.24 4.24l-2.47 2.47-1.06-1.06 2.47-2.47a1.5 1.5 0 0 0 0-2.12Z',
  jet: 'm21.8 11.4-8-3.4-3.4-6.2c-.3-.5-.9-.8-1.5-.6l-1 .3 2.2 7-4.6-1.9-2.2-2.6-.9.3 1.2 3.4-1.2 3.4.9.3 2.2-2.6 4.6-1.9-2.2 7 1 .3c.6.2 1.2-.1 1.5-.6l3.4-6.2 8-3.4c.7-.3 1.2-.9 1.2-1.7s-.5-1.4-1.2-1.7Z',
  calendar:
    'M7 3h2v2h6V3h2v2h1.5A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5H7V3Zm11 6H6v9h12V9Zm-8 2h2v2h-2v-2Zm4 0h2v2h-2v-2Zm-4 4h2v2h-2v-2Z',
  crew: 'M8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm8 1a2.5 2.5 0 1 0-2.5-2.5A2.5 2.5 0 0 0 16 12Zm-8 1c-2.76 0-5 1.57-5 3.5V19h10v-2.5C13 14.57 10.76 13 8 13Zm8 1c-1.2 0-2.3.33-3.2.9.75.67 1.2 1.56 1.2 2.6V19H21v-1.3c0-2.03-2.24-3.7-5-3.7Z',
  alert:
    'M12 3.4 2.8 19h18.4L12 3.4Zm0 4.1 4.52 7.7H7.48L12 7.5Zm-.9 2.2h1.8v3.8h-1.8V9.7Zm0 4.95h1.8v1.8h-1.8v-1.8Z',
  history:
    'M12 4a8 8 0 1 1-7.75 10h1.84A6.2 6.2 0 1 0 12 5.8a6.1 6.1 0 0 0-4.3 1.76L10 10H4V4l2.42 2.42A7.9 7.9 0 0 1 12 4Zm-.9 3.4h1.8v4.1l3 1.8-.9 1.5-3.9-2.35V7.4Z',
  chart: 'M5 19V9h2v10H5Zm6 0V5h2v14h-2Zm6 0v-7h2v7h-2Z',
  checklist:
    'M9.2 6.4 7.8 5 6.4 6.4l1.4 1.4L6.4 9.2l1.4 1.4 1.4-1.4 1.4 1.4 1.4-1.4-1.4-1.4 1.4-1.4-1.4-1.4-1.4 1.4Zm4.3.6H19v1.5h-5.5V7Zm0 5H19v1.5h-5.5V12Zm0 5H19v1.5h-5.5V17ZM5 12h6v6H5v-6Z',
  wallet:
    'M5.5 6A1.5 1.5 0 0 0 4 7.5v9A1.5 1.5 0 0 0 5.5 18h13a1.5 1.5 0 0 0 1.5-1.5V9.75A1.75 1.75 0 0 0 18.25 8H7V7.5A.5.5 0 0 1 7.5 7H19V5.5h-13.5ZM20 11v5.5a.5.5 0 0 1-.5.5h-14a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h12.75a.25.25 0 0 1 .25.25V10H16.5a1.5 1.5 0 0 0 0 3H20Zm-3.5-.25a.5.5 0 1 0 0 1h2v-1h-2Z',
  grid: 'M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z',
  logout:
    'M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10v-2H6V6h4V4Zm4.6 3.4L13.2 8.8l1.8 1.7H9v2h6l-1.8 1.7 1.4 1.4L19 11l-4.4-4.4Z',
}

function resolveIcon(icon) {
  return iconPaths[icon] || iconPaths.grid
}

watch(
  () => route.fullPath,
  () => {
    workspaceMenuOpen.value = false
    workspaceDesktopMenu.value = ''
    workspaceDrawerMenu.value = ''
  },
)

watch([activeRole, () => auth.isAuthenticated], () => {
  startCrewStatusRefresh()
}, { immediate: true })

const workspaceHome = computed(() => {
  if (!activeRole.value || !currentRoleMenu.value.length) return '/'
  return resolveRoleSectionPath(activeRole.value, currentRoleMenu.value[0])
})

const roleBadgeLabel = computed(() => {
  const badgeMap = {
    client: 'Portal Cliente',
    operator: 'Portal Operativo',
    crew: 'Portal Cabina',
    admin: 'Portal Ejecutivo',
  }
  return badgeMap[activeRole.value] || 'Portal'
})

const mobileQuickActions = computed(() => currentRoleMenu.value.slice(0, 4))

const crewProfileState = computed(() => {
  const profile = auth.user?.profile || {}
  const taxData = profile.tax_data || {}
  return (
    profile.profile_state ||
    profile.validation_status ||
    profile.review_status ||
    taxData.profile_state ||
    taxData.validation_status ||
    ''
  )
})

const crewOperationalStatus = computed(() => {
  const profile = auth.user?.profile || {}
  const rawStatus = auth.user?.current_status || profile.current_status || auth.user?.status || ''
  const normalized = String(rawStatus || '').trim().toLowerCase()

  if (['active', 'activo', 'activa'].includes(normalized)) return 'Activo'
  if (['available', 'disponible'].includes(normalized)) return 'Disponible'
  if (['assigned', 'asignado', 'asignada'].includes(normalized)) return 'Asignado'
  if (['rest', 'descanso'].includes(normalized)) return 'Descanso'
  if (['unavailable', 'no disponible'].includes(normalized)) return 'No disponible'
  if (['suspended', 'suspendido', 'suspendida'].includes(normalized)) return 'Suspendido'

  return rawStatus
})

const crewBaseLabel = computed(() => {
  const profile = auth.user?.profile || {}
  return profile.base_airport || profile.base || profile.city || ''
})

const mobileStatusItems = computed(() => {
  const statusMap = {
    client: ['Reservas activas', 'Atencion disponible', 'Panel estable'],
    operator: ['3 vuelos activos', '2 pendientes', 'Sistema estable'],
    admin: ['Panel ejecutivo', 'Alertas al dia', 'Sistema estable'],
  }

  if (activeRole.value === 'crew') {
    return [
      crewProfileState.value ? `Validacion: ${crewProfileState.value}` : 'Validacion pendiente',
      crewOperationalStatus.value ? `Operacion: ${crewOperationalStatus.value}` : 'Sin estado operativo',
      crewBaseLabel.value ? `Base: ${crewBaseLabel.value}` : 'Base por asignar',
    ]
  }

  return statusMap[activeRole.value] || ['Operacion activa', 'Sistema estable']
})

function resolveGroupIcon(label) {
  const iconMap = {
    portal: 'grid',
    operacion: 'jet',
    operador: 'jet',
    'operacion y proveedores': 'jet',
    coordinacion: 'clipboard',
    control: 'shield',
    'control interno': 'shield',
    seguimiento: 'history',
    cuenta: 'account',
    ejecutivo: 'chart',
    comercial: 'wallet',
    cliente: 'wallet',
    'cliente y comercial': 'wallet',
    administrador: 'shield',
  }

  return resolveIcon(iconMap[String(label || '').toLowerCase()] || 'grid')
}

async function handleLogout() {
  auth.logout()
  workspaceMenuOpen.value = false
  closeAllMenus()
  router.push({ name: 'home' })
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
  document.addEventListener('keydown', handleDocumentKeydown)
  startCrewStatusRefresh()
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
  document.removeEventListener('keydown', handleDocumentKeydown)
  clearCrewStatusRefresh()
})
</script>

<template>
  <header v-if="!hideTopbar" class="topbar-shell">
    <nav v-if="!isRoleView" class="public-topbar" aria-label="Navegacion principal">
      <div class="brand-cluster public-mobile-head">
        <button
          type="button"
          class="workspace-mobile-toggle public-mobile-toggle button-reset"
          :aria-expanded="workspaceMenuOpen ? 'true' : 'false'"
          :aria-label="workspaceMenuOpen ? 'Cerrar menu principal' : 'Abrir menu principal'"
          @click="workspaceMenuOpen = !workspaceMenuOpen"
        >
          <span class="workspace-mobile-toggle-line"></span>
          <span class="workspace-mobile-toggle-line"></span>
          <span class="workspace-mobile-toggle-line"></span>
        </button>

        <RouterLink to="/" class="brand-wordmark brand-wordmark--logo" aria-label="Sky Group">
          <BrandLogo variant="dark" :width="132" />
        </RouterLink>

        <ul class="main-links">
          <li v-for="link in publicLinks" :key="link.label">
            <RouterLink :to="link.to" class="main-link">
              <svg
                v-if="link.icon === 'jet'"
                class="link-icon nav-link-icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="m21.8 11.4-8-3.4-3.4-6.2c-.3-.5-.9-.8-1.5-.6l-1 .3 2.2 7-4.6-1.9-2.2-2.6-.9.3 1.2 3.4-1.2 3.4.9.3 2.2-2.6 4.6-1.9-2.2 7 1 .3c.6.2 1.2-.1 1.5-.6l3.4-6.2 8-3.4c.7-.3 1.2-.9 1.2-1.7s-.5-1.4-1.2-1.7Z"
                />
              </svg>
              <svg
                v-else-if="link.icon === 'service'"
                class="link-icon nav-link-icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M12 2.8 14.3 7l4.7.7-3.4 3.3.8 4.7L12 13.5l-4.4 2.2.8-4.7L5 7.7 9.7 7 12 2.8Zm0 5.05-.93 1.88-2.08.3 1.5 1.46-.35 2.06L12 12.6l1.86.98-.35-2.06 1.5-1.46-2.08-.3L12 7.85Z"
                />
              </svg>
              <svg
                v-else-if="link.icon === 'grid'"
                class="link-icon nav-link-icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z"
                />
              </svg>
              <svg
                v-else-if="link.icon === 'membership'"
                class="link-icon nav-link-icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M12 3.5 14.1 8l4.9.4-3.7 3.2 1.2 4.8L12 13.8 7.5 16.4l1.2-4.8L5 8.4 9.9 8 12 3.5Zm0 12.3 4 2.3-.9 2.4L12 18.8l-3.1 1.7-.9-2.4 4-2.3Z"
                />
              </svg>
              <svg
                v-else-if="link.icon === 'globe'"
                class="link-icon nav-link-icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Zm5.9 8h-2.54a14.9 14.9 0 0 0-1.12-4A7.03 7.03 0 0 1 17.9 11ZM12 5.05c.78.95 1.65 2.92 1.97 5.95h-3.94C10.35 7.97 11.22 6 12 5.05ZM9.76 7a14.9 14.9 0 0 0-1.12 4H6.1A7.03 7.03 0 0 1 9.76 7ZM6.1 13h2.54a14.9 14.9 0 0 0 1.12 4A7.03 7.03 0 0 1 6.1 13Zm3.93 0h3.94c-.32 3.03-1.19 5-1.97 5.95-.78-.95-1.65-2.92-1.97-5.95ZM14.24 17a14.9 14.9 0 0 0 1.12-4h2.54A7.03 7.03 0 0 1 14.24 17Z"
                />
              </svg>
              {{ link.label }}
            </RouterLink>
          </li>
        </ul>
      </div>

      <div class="actions-cluster">
        <ul class="utility-links">
          <li v-for="link in utilityLinks" :key="link.label">
            <RouterLink :to="link.to" class="utility-link">
              <svg
                v-if="link.icon === 'globe'"
                class="link-icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Zm5.9 8h-2.54a14.9 14.9 0 0 0-1.12-4A7.03 7.03 0 0 1 17.9 11ZM12 5.05c.78.95 1.65 2.92 1.97 5.95h-3.94C10.35 7.97 11.22 6 12 5.05ZM9.76 7a14.9 14.9 0 0 0-1.12 4H6.1A7.03 7.03 0 0 1 9.76 7ZM6.1 13h2.54a14.9 14.9 0 0 0 1.12 4A7.03 7.03 0 0 1 6.1 13Zm3.93 0h3.94c-.32 3.03-1.19 5-1.97 5.95-.78-.95-1.65-2.92-1.97-5.95ZM14.24 17a14.9 14.9 0 0 0 1.12-4h2.54A7.03 7.03 0 0 1 14.24 17Z"
                />
              </svg>
              <svg
                v-else-if="link.icon === 'help'"
                class="link-icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Zm0 14.2a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Zm1.44-3.63-.67.38A1.54 1.54 0 0 0 12 15.3v.2h-1.8v-.32a2.84 2.84 0 0 1 1.46-2.78l.92-.52a1.71 1.71 0 0 0 .97-1.48 1.69 1.69 0 0 0-1.82-1.66 1.84 1.84 0 0 0-1.92 1.62H8.02A3.57 3.57 0 0 1 11.8 7a3.34 3.34 0 0 1 3.55 3.28 3.25 3.25 0 0 1-1.91 3.29Z"
                />
              </svg>
              {{ link.label }}
            </RouterLink>
          </li>
        </ul>

        <RouterLink v-if="!auth.isAuthenticated" to="/login-cliente" class="signin-link">
          <svg class="link-icon auth-link-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.3 0-6 1.8-6 4v1h12v-1c0-2.2-2.7-4-6-4Z"
            />
          </svg>
          Inicia sesion
        </RouterLink>

        <button v-else type="button" class="signin-link button-reset" @click="handleLogout">
          Salir
        </button>

        <RouterLink v-if="!auth.isAuthenticated" to="/registro" class="register-link">
          <svg class="link-icon auth-link-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 5a3.5 3.5 0 1 0 3.5 3.5A3.5 3.5 0 0 0 12 5Zm0 9c-3 0-5.5 1.6-5.5 3.8V19h11v-1.2C17.5 15.6 15 14 12 14Zm6.5-5.5V6.75h-1.75V5h-1.5v1.75H13.5v1.5h1.75V10h1.5V8.25h1.75Z"
            />
          </svg>
          Registrate
        </RouterLink>

        <span v-else class="account-pill">
          {{ auth.userName }}
        </span>
      </div>

      <Transition name="workspace-drawer-fade">
        <div
          v-if="usesPublicMobileDrawer && workspaceMenuOpen"
          class="workspace-drawer-scrim"
          @click="workspaceMenuOpen = false"
        ></div>
      </Transition>

      <Transition name="workspace-drawer-slide">
        <aside
          v-if="usesPublicMobileDrawer && workspaceMenuOpen"
          class="workspace-drawer workspace-drawer-public"
          aria-label="Menu principal del sitio"
        >
          <div class="workspace-drawer-header">
            <RouterLink to="/" class="brand-wordmark brand-wordmark--logo" aria-label="Sky Group">
              <BrandLogo variant="dark" :width="94" />
            </RouterLink>

            <button
              type="button"
              class="workspace-drawer-close button-reset"
              aria-label="Cerrar menu principal"
              @click="workspaceMenuOpen = false"
            >
              <span></span>
              <span></span>
            </button>
          </div>

          <div class="workspace-drawer-copy">
            <strong>Sky Group</strong>
            <p>Navega vuelos, servicios, plataforma y acceso cliente desde una sola entrada.</p>
          </div>

          <div class="workspace-drawer-groups">
            <section
              v-for="group in publicMenuGroups"
              :key="group.label"
              class="workspace-drawer-group"
            >
              <span class="workspace-drawer-group-label">{{ group.label }}</span>
              <ul class="workspace-drawer-list">
                <li v-for="item in group.items" :key="item.label">
                  <RouterLink :to="item.to" class="workspace-drawer-link">
                    <svg
                      v-if="item.icon"
                      class="workspace-link-icon"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path fill="currentColor" :d="resolveIcon(item.icon)" />
                    </svg>
                    <span>{{ item.label }}</span>
                  </RouterLink>
                </li>
              </ul>
            </section>
          </div>

          <div class="workspace-drawer-footer workspace-drawer-footer-stack">
            <RouterLink
              v-if="!auth.isAuthenticated"
              to="/login-cliente"
              class="workspace-drawer-link workspace-drawer-link-cta"
            >
              <svg class="workspace-link-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" :d="resolveIcon('account')" />
              </svg>
              <span>Inicia sesion</span>
            </RouterLink>

            <RouterLink
              v-if="!auth.isAuthenticated"
              to="/registro"
              class="workspace-drawer-link workspace-drawer-link-cta"
            >
              <svg class="workspace-link-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 5a3.5 3.5 0 1 0 3.5 3.5A3.5 3.5 0 0 0 12 5Zm0 9c-3 0-5.5 1.6-5.5 3.8V19h11v-1.2C17.5 15.6 15 14 12 14Zm6.5-5.5V6.75h-1.75V5h-1.5v1.75H13.5v1.5h1.75V10h1.5V8.25h1.75Z"
                />
              </svg>
              <span>Registrate</span>
            </RouterLink>

            <button
              v-if="auth.isAuthenticated"
              type="button"
              class="workspace-drawer-exit button-reset"
              @click="handleLogout"
            >
              <svg class="workspace-action-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" :d="resolveIcon('logout')" />
              </svg>
              Salir
            </button>
          </div>
        </aside>
      </Transition>
    </nav>

    <nav
      v-else
      class="workspace-topbar"
      :class="[{ 'workspace-topbar-light': isLightWorkspace }, workspaceThemeClass]"
      aria-label="Navegacion del portal"
    >
      <div v-if="usesMobileDrawer" class="workspace-mobile-head">
        <button
          type="button"
          class="workspace-mobile-toggle button-reset"
          :aria-expanded="workspaceMenuOpen ? 'true' : 'false'"
          :aria-label="workspaceMenuOpen ? 'Cerrar menu del portal' : 'Abrir menu del portal'"
          @click="workspaceMenuOpen = !workspaceMenuOpen"
        >
          <span class="workspace-mobile-toggle-line"></span>
          <span class="workspace-mobile-toggle-line"></span>
          <span class="workspace-mobile-toggle-line"></span>
        </button>

        <div class="workspace-mobile-title">
          <strong>{{ currentSectionLabel }}</strong>
          <small>{{ roleDisplayNames[activeRole] || activeRole }}</small>
        </div>

        <RouterLink
          :to="workspaceHome"
          class="brand-wordmark brand-wordmark--logo"
          aria-label="Sky Group"
        >
          <BrandLogo :variant="isLightWorkspace ? 'dark' : 'light'" :width="76" />
        </RouterLink>
      </div>

      <!-- DEJA SOLO EL LOGO, QUITA TEXTO OPERADOR -->
      <div class="workspace-brand workspace-brand--compact">
        <RouterLink
          :to="workspaceHome"
          class="brand-wordmark brand-wordmark--logo"
          aria-label="Sky Group"
        >
          <BrandLogo :variant="isLightWorkspace ? 'dark' : 'light'" :width="92" />
        </RouterLink>
      </div>

      <Transition name="crew-menu">
        <div
          v-if="!usesMobileDrawer && !isClientWorkspace"
          class="workspace-links workspace-links-grouped workspace-links-grouped-open"
        >
          <section
            v-for="group in workspaceMenuGroups"
            :key="group.label"
            class="menu-master menu-master-workspace"
            :class="{
              'menu-master-open': isMenuOpen('desktop', group.label),
            }"
          >
            <button
              type="button"
              class="menu-master-trigger button-reset"
              :aria-expanded="isMenuOpen('desktop', group.label) ? 'true' : 'false'"
              @click.stop="toggleMenu('desktop', group.label)"
            >
              <span class="menu-master-copy">
                <strong>{{ group.label }}</strong>
                <small v-if="!['admin', 'operator'].includes(activeRole)">{{
                  group.items.find(isWorkspaceItemActive)?.label || `${group.items.length} modulos`
                }}</small>
              </span>
              <span class="menu-master-caret"></span>
            </button>

            <div v-if="isMenuOpen('desktop', group.label)" class="menu-master-panel" @click.stop>
              <RouterLink
                v-for="item in group.items"
                :key="item.id"
                :to="resolveRoleSectionPath(activeRole, item)"
                class="menu-master-link workspace-link"
                :class="{ active: isWorkspaceItemActive(item) }"
              >
                <svg class="workspace-link-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" :d="resolveIcon(item.icon)" />
                </svg>
                <span>{{ item.label }}</span>
              </RouterLink>
            </div>
          </section>
        </div>
      </Transition>

      <ul v-if="!usesMobileDrawer && isClientWorkspace" class="workspace-links">
        <li v-for="item in currentRoleMenu" :key="item.id">
          <RouterLink :to="resolveRoleSectionPath(activeRole, item)" class="workspace-link">
            <svg class="workspace-link-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" :d="resolveIcon(item.icon)" />
            </svg>
            {{ item.label }}
          </RouterLink>
        </li>
      </ul>

      <Transition name="crew-menu">
        <div class="workspace-actions" v-if="!usesMobileDrawer">
          <span v-if="showWorkspaceUser" class="workspace-user">
            <svg class="workspace-action-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.3 0-6 1.8-6 4v1h12v-1c0-2.2-2.7-4-6-4Z"
              />
            </svg>
            {{ workspaceAccountLabel }}
          </span>

          <button type="button" class="workspace-exit button-reset" @click="handleLogout">
            <svg class="workspace-action-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" :d="resolveIcon('logout')" />
            </svg>
            Salir
          </button>
        </div>
      </Transition>

      <Transition name="workspace-drawer-fade">
        <div
          v-if="usesMobileDrawer && workspaceMenuOpen"
          class="workspace-drawer-scrim"
          @click="workspaceMenuOpen = false"
        ></div>
      </Transition>

      <Transition name="workspace-drawer-slide">
        <aside
          v-if="usesMobileDrawer && workspaceMenuOpen"
          class="workspace-drawer"
          :class="workspaceThemeClass"
          aria-label="Menu lateral del portal"
        >
          <div class="workspace-drawer-header">
            <RouterLink
              :to="workspaceHome"
              class="brand-wordmark brand-wordmark--logo"
              aria-label="Sky Group"
            >
              <BrandLogo variant="dark" :width="94" />
            </RouterLink>

            <button
              type="button"
              class="workspace-drawer-close button-reset"
              aria-label="Cerrar menu lateral"
              @click="workspaceMenuOpen = false"
            >
              <span></span>
              <span></span>
            </button>
          </div>

          <div class="workspace-drawer-main">
            <div class="workspace-drawer-copy">
              <span class="workspace-drawer-role-badge">{{ roleBadgeLabel }}</span>
              <strong class="workspace-drawer-role-title">{{
                roleDisplayNames[activeRole] || activeRole
              }}</strong>
              <p>{{ roleDescriptions[activeRole] }}</p>
            </div>

            <div class="workspace-drawer-status">
              <span
                v-for="item in mobileStatusItems"
                :key="item"
                class="workspace-drawer-status-item"
              >
                {{ item }}
              </span>
            </div>

            <section class="workspace-drawer-quick-actions">
              <div class="workspace-drawer-section-head">
                <span>Accesos rapidos</span>
              </div>
              <div class="workspace-drawer-quick-grid">
                <RouterLink
                  v-for="item in mobileQuickActions"
                  :key="item.id"
                  :to="resolveRoleSectionPath(activeRole, item)"
                  class="workspace-drawer-quick-link"
                  :class="{ 'workspace-drawer-quick-link-primary': item.id === 'dashboard' }"
                >
                  <svg class="workspace-link-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="currentColor" :d="resolveIcon(item.icon)" />
                  </svg>
                  <span>{{ item.label }}</span>
                </RouterLink>
              </div>
            </section>

            <div class="workspace-drawer-groups">
              <template v-if="isClientWorkspace">
                <ul class="workspace-drawer-list">
                  <li v-for="item in currentRoleMenu" :key="item.id">
                    <RouterLink
                      :to="resolveRoleSectionPath(activeRole, item)"
                      class="workspace-drawer-link"
                    >
                      <svg class="workspace-link-icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="currentColor" :d="resolveIcon(item.icon)" />
                      </svg>
                      <span>{{ item.label }}</span>
                    </RouterLink>
                  </li>
                </ul>
              </template>

              <section
                v-else
                v-for="group in workspaceMenuGroups"
                :key="group.label"
                class="workspace-drawer-group workspace-drawer-dropdown"
              >
                <button
                  type="button"
                  class="workspace-drawer-group-trigger button-reset"
                  :aria-expanded="isMenuOpen('drawer', group.label) ? 'true' : 'false'"
                  @click="toggleMenu('drawer', group.label)"
                >
                  <span class="workspace-drawer-group-copy">
                    <span class="workspace-drawer-group-icon">
                      <svg class="workspace-link-icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="currentColor" :d="resolveGroupIcon(group.label)" />
                      </svg>
                    </span>
                    <span class="workspace-drawer-group-text">
                      <span class="workspace-drawer-group-label">{{ group.label }}</span>
                    </span>
                  </span>
                  <span class="menu-master-caret"></span>
                </button>
                <ul
                  v-if="isMenuOpen('drawer', group.label)"
                  class="workspace-drawer-list workspace-drawer-submenu"
                >
                  <li v-for="item in group.items" :key="item.id">
                    <RouterLink
                      :to="resolveRoleSectionPath(activeRole, item)"
                      class="workspace-drawer-link workspace-drawer-submenu-item"
                    >
                      <svg class="workspace-link-icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="currentColor" :d="resolveIcon(item.icon)" />
                      </svg>
                      <span>{{ item.label }}</span>
                    </RouterLink>
                  </li>
                </ul>
              </section>
            </div>
          </div>

          <div class="workspace-drawer-footer">
            <span v-if="showWorkspaceUser" class="workspace-drawer-user">
              <svg class="workspace-action-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.3 0-6 1.8-6 4v1h12v-1c0-2.2-2.7-4-6-4Z"
                />
              </svg>
              {{ workspaceAccountLabel }}
            </span>

            <button type="button" class="workspace-drawer-exit button-reset" @click="handleLogout">
              <svg class="workspace-action-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" :d="resolveIcon('logout')" />
              </svg>
              Salir
            </button>
          </div>
        </aside>
      </Transition>
    </nav>
  </header>
</template>

<style scoped>
.topbar-shell {
  position: sticky;
  top: 0;
  z-index: 999;
  backdrop-filter: blur(18px);
}

.public-topbar,
.workspace-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 4.6rem;
  padding: 0 1.5rem;
}

.public-topbar {
  background: rgba(255, 255, 255, 0.96);
  border-bottom: 1px solid rgba(17, 17, 17, 0.08);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.05);
}

.workspace-topbar {
  --workspace-accent: rgba(255, 255, 255, 0.1);
  --workspace-accent-strong: #ffffff;
  --workspace-chip: rgba(255, 255, 255, 0.08);
  --workspace-hover: rgba(255, 255, 255, 0.08);
  --workspace-active: rgba(255, 255, 255, 0.1);
  background: rgba(10, 10, 12, 0.96);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.22);
  overflow: visible;
}

.workspace-topbar-light {
  background: rgba(255, 255, 255, 0.96);
  border-bottom: 1px solid rgba(17, 17, 17, 0.08);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.05);
}

.workspace-topbar--client,
.workspace-topbar--admin {
  --workspace-accent: rgba(17, 17, 17, 0.08);
  --workspace-accent-strong: #111111;
  --workspace-chip: rgba(17, 17, 17, 0.05);
  --workspace-hover: rgba(17, 17, 17, 0.06);
  --workspace-active: rgba(17, 17, 17, 0.08);
}

.workspace-topbar--operator {
  --workspace-accent: rgba(216, 180, 91, 0.14);
  --workspace-accent-strong: #8c6a1f;
  --workspace-chip: rgba(216, 180, 91, 0.12);
  --workspace-hover: rgba(216, 180, 91, 0.12);
  --workspace-active: linear-gradient(180deg, rgba(216, 180, 91, 0.18), rgba(216, 180, 91, 0.08));
}

.workspace-topbar--crew {
  --workspace-accent: rgba(10, 143, 91, 0.14);
  --workspace-accent-strong: #0a8f5b;
  --workspace-chip: rgba(10, 143, 91, 0.1);
  --workspace-hover: rgba(10, 143, 91, 0.1);
  --workspace-active: linear-gradient(180deg, rgba(10, 143, 91, 0.14), rgba(10, 143, 91, 0.08));
}

.workspace-topbar--crew {
  gap: 1.4rem;
  padding-inline: 1.2rem;
}

.workspace-mobile-head {
  display: none;
}

.brand-cluster,
.actions-cluster,
.workspace-brand,
.workspace-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.brand-wordmark {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  color: #111111;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  font-size: 1.15rem;
  font-weight: 800;
  text-decoration: none;
  white-space: nowrap;
  letter-spacing: -0.03em;
}

.brand-wordmark--logo {
  gap: 0;
}

.menu-masters {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
}

.menu-master {
  position: relative;
  z-index: 2;
}

.menu-master-trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 3.5rem;
  padding: 0.62rem 1.12rem;
  border-radius: 18px;
  color: inherit;
  border: 1px solid transparent;
  background: transparent;
}

.menu-master-open .menu-master-trigger {
  border-color: var(--workspace-accent, rgba(17, 17, 17, 0.08));
  background: var(--workspace-active, rgba(17, 17, 17, 0.06));
}

.menu-master-copy {
  display: grid;
  gap: 0.1rem;
  text-align: left;
}

.menu-master-copy strong {
  font-size: 0.88rem;
  font-weight: 800;
}

.menu-master-copy small {
  color: #5d5d5d;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.025em;
  text-transform: uppercase;
  opacity: 0.65;
}

.menu-master-caret {
  width: 0.6rem;
  height: 0.6rem;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(45deg);
  opacity: 0.68;
  transition: transform 180ms ease;
}

.menu-master-open .menu-master-caret {
  transform: rotate(225deg);
}

.menu-master-panel {
  position: absolute;
  top: calc(100% + 0.45rem);
  left: 0;
  z-index: 1200;
  display: grid;
  gap: 0.3rem;
  min-width: 240px;
  padding: 0.55rem;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid rgba(17, 17, 17, 0.08);
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.08);
}

.menu-master-link {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.625rem;
  min-height: 2.7rem;
  padding: 0.75rem 1rem;
  color: #111111;
  text-decoration: none;
  border-radius: 12px;
  font-size: 0.94rem;
  font-weight: 700;
  text-align: left;
}

.menu-master-link.workspace-link {
  justify-content: flex-start;
  width: 100%;
  padding: 0.75rem 1rem;
}

.menu-master-link:hover,
.menu-master-link.router-link-active {
  background: rgba(17, 17, 17, 0.06);
}

.menu-master-link.active,
.workspace-topbar:not(.workspace-topbar-light) .menu-master-link.active {
  color: #0f7b53;
  font-weight: 800;
  background: #dceee5;
}

.main-links,
.utility-links,
.workspace-links {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.main-link,
.utility-link,
.signin-link,
.workspace-link,
.workspace-exit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.5rem;
  padding: 0 0.9rem;
  color: #111111;
  font-size: 0.92rem;
  font-weight: 700;
  text-decoration: none;
  border-radius: 999px;
  transition: all 0.25s ease;
  white-space: nowrap;
}

.link-icon {
  width: 0.95rem;
  height: 0.95rem;
  margin-right: 0.42rem;
  flex-shrink: 0;
}

.nav-link-icon {
  width: 0.88rem;
  height: 0.88rem;
  opacity: 0.92;
}

.auth-link-icon {
  width: 0.9rem;
  height: 0.9rem;
}

.main-link:hover,
.utility-link:hover,
.signin-link:hover,
.workspace-link:hover,
.workspace-exit:hover {
  background: rgba(17, 17, 17, 0.06);
}

.main-link.router-link-active {
  background: rgba(17, 17, 17, 0.08);
}

.register-link,
.account-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.65rem;
  padding: 0 1.15rem;
  border-radius: 999px;
  background: white;
  color: #111;
  font-size: 0.92rem;
  font-weight: 800;
  text-decoration: none;
  white-space: nowrap;
  transition: transform 0.25s ease;
}

.register-link {
  gap: 0.12rem;
}

.register-link:hover {
  transform: translateY(-1px);
}

.utility-link,
.signin-link,
.workspace-user,
.workspace-label small {
  color: #5d5d5d;
}

.workspace-topbar .workspace-link,
.workspace-topbar .workspace-exit,
.workspace-topbar .workspace-user,
.workspace-topbar .workspace-label strong {
  color: #ffffff;
}

.workspace-topbar .workspace-label small {
  color: rgba(255, 255, 255, 0.82);
}

.workspace-topbar .workspace-link:hover,
.workspace-topbar .workspace-exit:hover {
  background: var(--workspace-hover);
}

.workspace-topbar .workspace-link.router-link-active {
  color: var(--workspace-accent-strong);
  background: var(--workspace-active);
}

.workspace-topbar-light .brand-wordmark,
.workspace-topbar-light .workspace-label strong,
.workspace-topbar-light .workspace-link,
.workspace-topbar-light .workspace-user,
.workspace-topbar-light .workspace-exit {
  color: #111111;
}

.workspace-topbar-light .workspace-link-icon,
.workspace-topbar-light .workspace-action-icon {
  color: var(--workspace-accent-strong);
}

.workspace-topbar-light .workspace-label small {
  color: #5d5d5d;
}

.workspace-topbar-light .workspace-link:hover,
.workspace-topbar-light .workspace-exit:hover {
  background: var(--workspace-hover);
}

.workspace-topbar-light .workspace-link.router-link-active {
  color: var(--workspace-accent-strong);
  background: var(--workspace-active);
}

.workspace-topbar--admin .menu-master-copy strong,
.workspace-topbar--admin .menu-master-caret,
.workspace-topbar--admin .workspace-user,
.workspace-topbar--admin .workspace-exit,
.workspace-topbar--admin .workspace-link,
.workspace-topbar--admin .brand-wordmark {
  color: #111111;
}

.workspace-topbar--admin .menu-master-copy small {
  color: #6d7480;
}

.workspace-topbar--admin .workspace-link-icon,
.workspace-topbar--admin .workspace-action-icon {
  color: #8c6a1f;
}

.workspace-label {
  display: grid;
  gap: 0.08rem;
}

.workspace-label strong {
  color: white;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.workspace-topbar--crew .workspace-brand {
  flex: 0 0 auto;
  gap: 0.8rem;
  padding-right: 0.9rem;
  border-right: 1px solid rgba(10, 143, 91, 0.12);
}

.workspace-topbar--crew .workspace-label {
  gap: 0.05rem;
  line-height: 1.05;
}

.workspace-topbar--crew .workspace-label strong {
  font-size: 0.72rem;
  letter-spacing: 0.12em;
}

.workspace-topbar--crew .workspace-label small {
  max-width: 7rem;
  font-size: 0.68rem;
  line-height: 1.1;
}

.workspace-links {
  flex: 1;
  justify-content: center;
  gap: 0.55rem;
  overflow: visible;
}

.workspace-links-grouped {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: flex-start;
  gap: 1.125rem;
  padding: 0 0.35rem;
  overflow: visible;
}

.menu-master-workspace .menu-master-trigger {
  min-height: 3.5rem;
  border-radius: 18px;
}

.workspace-topbar .menu-master-copy small {
  color: rgba(255, 255, 255, 0.72);
}

.workspace-topbar-light .menu-master-copy small {
  color: #6d7480;
}

.menu-master-workspace .menu-master-panel {
  background: rgba(255, 255, 255, 0.98);
}

.workspace-topbar:not(.workspace-topbar-light) .menu-master-panel {
  background: rgba(12, 15, 24, 0.98);
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 18px 38px rgba(0, 0, 0, 0.32);
}

.workspace-topbar:not(.workspace-topbar-light) .menu-master-link {
  color: #ffffff;
}

.workspace-topbar:not(.workspace-topbar-light) .menu-master-link:hover,
.workspace-topbar:not(.workspace-topbar-light) .menu-master-link.router-link-active {
  background: rgba(255, 255, 255, 0.08);
}

.workspace-link {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 2.35rem;
  padding: 0 0.92rem;
  color: rgba(255, 255, 255, 0.82);
  font-size: 0.9rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  border: 1px solid transparent;
}

.workspace-topbar--crew .workspace-link {
  min-height: 1.95rem;
  padding: 0 0.72rem;
  font-size: 0.86rem;
  color: #1f2c27;
  border-radius: 999px;
}

.workspace-topbar--crew .workspace-link:hover {
  background: rgba(10, 143, 91, 0.08);
}

.workspace-topbar--crew .workspace-link.router-link-active {
  color: #0a8f5b;
  border-color: rgba(10, 143, 91, 0.16);
  background: linear-gradient(180deg, rgba(10, 143, 91, 0.14), rgba(10, 143, 91, 0.08));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.workspace-link-icon,
.workspace-action-icon {
  width: 0.95rem;
  height: 0.95rem;
  flex-shrink: 0;
}

.workspace-topbar--crew .workspace-link-icon {
  width: 0.72rem;
  height: 0.72rem;
}

.workspace-link.router-link-active {
  color: var(--workspace-accent-strong);
  border-color: var(--workspace-accent);
  background: var(--workspace-active);
}

.workspace-user {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  min-height: 2.35rem;
  padding: 0 0.85rem;
  border-radius: 999px;
  background: var(--workspace-chip);
  font-weight: 700;
}

.workspace-exit {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 2.35rem;
  padding: 0 0.85rem;
  color: #ffffff;
  font-weight: 800;
  background: transparent;
  border-radius: 999px;
}

.workspace-topbar--crew .workspace-actions {
  flex: 0 0 auto;
  margin-left: 0.25rem;
  padding-left: 0.5rem;
  border-left: 1px solid rgba(10, 143, 91, 0.12);
}

.workspace-topbar--crew .workspace-exit {
  min-height: 2rem;
  padding: 0 0.35rem 0 0.7rem;
  color: #24342d;
}

.button-reset {
  border: none;
  background: transparent;
  cursor: pointer;
}

.workspace-drawer-scrim,
.workspace-drawer {
  display: none;
}

.workspace-mobile-title {
  display: none;
}

.workspace-drawer {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 1001;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  width: min(82vw, 320px);
  height: 100vh;
  padding: 0.85rem 0.85rem 0.9rem;
  color: #111111;
  background: #ffffff;
  border-right: 1px solid rgba(17, 17, 17, 0.08);
  box-shadow: 0 24px 60px rgba(18, 22, 40, 0.18);
  overflow: hidden;
}

.workspace-drawer.workspace-drawer-public {
  background: #ffffff;
}

.workspace-drawer.workspace-topbar--operator {
  background: #ffffff;
}

.workspace-drawer.workspace-topbar--crew {
  background: #ffffff;
}

.workspace-drawer.workspace-topbar--admin {
  background: #ffffff;
}

.workspace-drawer-header,
.workspace-drawer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.55rem;
}

.workspace-drawer-main {
  min-height: 0;
  overflow-y: auto;
  padding-right: 0.1rem;
  padding-bottom: 1rem;
}

.workspace-drawer-main::-webkit-scrollbar {
  width: 4px;
}

.workspace-drawer-main::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.12);
  border-radius: 10px;
}

.workspace-drawer-copy {
  display: grid;
  gap: 0.12rem;
  margin: 0.2rem 0 0.35rem;
}

.workspace-drawer-role-badge {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  padding: 0.28rem 0.62rem;
  border-radius: 999px;
  color: #ffffff;
  background: #111827;
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.workspace-drawer-copy strong {
  font-size: 0.96rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  line-height: 1.1;
}

.workspace-drawer-role-title {
  font-size: 1.28rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  text-transform: none;
}

.workspace-drawer-copy p {
  margin: 0;
  color: #6d7480;
  line-height: 1.35;
  font-size: 0.88rem;
}

.workspace-drawer-status {
  display: grid;
  gap: 0.35rem;
  margin: 0.25rem 0 0.85rem;
}

.workspace-drawer-status-item {
  color: #5f6b7d;
  font-size: 0.8rem;
  font-weight: 700;
}

.workspace-drawer-status-item::before {
  content: '\2022';
  margin-right: 0.45rem;
  color: #8c6a1f;
}

.workspace-drawer-close {
  position: relative;
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  color: #5d6470;
  background: #f4f6f8;
  border: 1px solid rgba(17, 17, 17, 0.08);
}

.workspace-drawer-close span {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 1rem;
  height: 2px;
  border-radius: 999px;
  background: currentColor;
}

.workspace-drawer-close span:first-child {
  transform: translate(-50%, -50%) rotate(45deg);
}

.workspace-drawer-close span:last-child {
  transform: translate(-50%, -50%) rotate(-45deg);
}

.workspace-drawer-groups {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  padding-bottom: 5rem;
  padding-top: 0.05rem;
}

.workspace-drawer-group {
  display: block;
  padding: 0.06rem 0;
  width: 100%;
}

.workspace-drawer-group-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  min-height: 3.75rem;
  padding: 1rem 1rem;
  color: #111111;
  border-radius: 14px;
  border: 1px solid rgba(17, 17, 17, 0.06);
  background: #f8f9fc;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
}

.workspace-drawer-group-trigger[aria-expanded='true'] {
  color: #111111;
  border-color: rgba(191, 143, 46, 0.2);
  background: linear-gradient(180deg, #fbf6ea, #f8f9fc);
}

.workspace-drawer-group-trigger[aria-expanded='true'] .workspace-drawer-group-label {
  color: #8c6a1f;
}

.workspace-drawer-group-trigger[aria-expanded='true'] .menu-master-caret {
  transform: rotate(225deg);
  color: #8c6a1f;
}

.workspace-drawer-group-copy {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}

.workspace-drawer-group-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 12px;
  color: #8c6a1f;
  background: rgba(191, 143, 46, 0.12);
}

.workspace-drawer-group-text {
  display: grid;
  gap: 0;
  justify-items: start;
}

.workspace-drawer-group-label {
  color: #374151;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.workspace-drawer-list {
  display: flex;
  flex-direction: column;
  gap: 0.08rem;
  list-style: none;
  margin: 0;
  padding: 0.35rem 0 0.3rem;
  width: 100%;
}

.workspace-drawer-link {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 2.2rem;
  padding: 0 0.65rem;
  color: #1f2937;
  font-size: 0.91rem;
  font-weight: 700;
  text-decoration: none;
  border-radius: 12px;
  transition:
    background 180ms ease,
    transform 180ms ease;
}

.workspace-drawer-link:hover {
  transform: translateX(2px);
  background: #f5f7fa;
}

.workspace-drawer-link.router-link-active {
  color: #111111;
  background: #f3ead4;
  box-shadow: inset 0 0 0 1px rgba(191, 143, 46, 0.18);
}

.workspace-drawer-submenu {
  margin-top: 0.18rem;
  overflow: visible;
}

.workspace-drawer-submenu-item {
  min-height: 2rem;
  padding: 0.56rem 0.7rem;
  border-radius: 10px;
  font-size: 0.92rem;
  margin: 0;
}

.workspace-drawer-footer {
  position: sticky;
  bottom: 0.65rem;
  margin: 0;
  padding: 0.65rem 0.2rem calc(0.7rem + env(safe-area-inset-bottom));
  border-top: 1px solid rgba(17, 17, 17, 0.08);
  background: rgba(255, 255, 255, 0.92);
  border-radius: 18px;
  backdrop-filter: blur(12px);
  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.06);
}

.workspace-drawer-user,
.workspace-drawer-exit {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  min-height: 2.45rem;
  padding: 0 0.8rem;
  border-radius: 999px;
  color: #1f2937;
  font-weight: 700;
}

.workspace-drawer-user {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  background: #f5f7fa;
}

.workspace-drawer-exit {
  background: #f5f7fa;
}

.workspace-drawer-footer-stack {
  display: grid;
  gap: 0.4rem;
}

.workspace-drawer-link-cta {
  justify-content: flex-start;
  background: #f5f7fa;
}

.workspace-drawer .menu-master-caret {
  color: #7a828f;
}

.workspace-drawer-quick-actions {
  display: grid;
  gap: 0.45rem;
  margin: 0 0 0.9rem;
}

.workspace-drawer-section-head span {
  color: #8b95a7;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.workspace-drawer-quick-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
}

.workspace-drawer-quick-link {
  display: grid;
  gap: 0.32rem;
  min-height: 4.2rem;
  padding: 0.85rem 0.9rem;
  color: #1f2937;
  text-decoration: none;
  border-radius: 14px;
  border: 1px solid rgba(17, 17, 17, 0.06);
  background: #f8f9fc;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.04);
}

.workspace-drawer-quick-link .workspace-link-icon {
  color: #8c6a1f;
}

.workspace-drawer-quick-link span {
  font-size: 0.84rem;
  font-weight: 800;
  line-height: 1.15;
}

.workspace-drawer-quick-link-primary {
  background: linear-gradient(135deg, #d6c28a, #bfa45f);
  color: #111111;
  box-shadow: 0 10px 22px rgba(191, 164, 95, 0.24);
}

.workspace-drawer-quick-link-primary .workspace-link-icon {
  color: #111111;
}

.workspace-drawer-fade-enter-active,
.workspace-drawer-fade-leave-active,
.workspace-drawer-slide-enter-active,
.workspace-drawer-slide-leave-active {
  transition: all 220ms ease;
}

.workspace-drawer-fade-enter-from,
.workspace-drawer-fade-leave-to {
  opacity: 0;
}

.workspace-drawer-slide-enter-from,
.workspace-drawer-slide-leave-to {
  opacity: 0;
  transform: translateX(-18px);
}

.crew-menu-enter-active,
.crew-menu-leave-active {
  transition:
    opacity 180ms ease,
    transform 220ms ease;
}

.crew-menu-enter-from,
.crew-menu-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* ===== OPERADOR: LOGO LIMPIO SIN AMONTONAR ===== */
.workspace-topbar--operator {
  justify-content: flex-start;
  gap: 1.2rem;
  overflow: visible;
}

.workspace-topbar--operator .workspace-brand {
  flex: 0 0 110px;
  width: 110px;
  min-width: 110px;
  justify-content: center;
  gap: 0;
  padding-right: 1rem;
  margin-right: 0.25rem;
  border-right: 1px solid rgba(216, 180, 91, 0.18);
}

.workspace-topbar--operator .workspace-label {
  display: none !important;
}

.workspace-topbar--operator .brand-wordmark--logo {
  width: 92px;
  max-width: 92px;
  overflow: hidden;
}

.workspace-topbar--operator .workspace-links {
  flex: 1;
  justify-content: flex-start;
  gap: 0.65rem;
  min-width: 0;
}

.workspace-topbar--operator .workspace-link {
  padding: 0 0.75rem;
}
/* ===== FIX REAL OPERADOR DESKTOP / TABLET ===== */
.workspace-topbar--operator {
  flex-wrap: nowrap !important;
  overflow: visible !important;
  justify-content: flex-start;
  align-items: center;
}

/* Logo compacto */
.workspace-topbar--operator .workspace-brand {
  width: auto !important;
  min-width: 96px !important;
  flex: 0 0 96px !important;
  padding-right: 0.8rem;
  margin-right: 0.65rem;
  border-right: 1px solid rgba(216, 180, 91, 0.14);
  justify-content: center;
}

/* Menú principal horizontal */
.workspace-topbar--operator .workspace-links {
  width: auto !important;
  flex: 1 !important;
  min-width: max-content;
  justify-content: flex-start !important;
  flex-wrap: nowrap !important;
  overflow-x: visible !important;
  padding-bottom: 0 !important;
}

/* Tabs más limpios */
.workspace-topbar--operator .workspace-link {
  flex-shrink: 0;
  padding: 0 0.78rem;
  font-size: 0.9rem;
}

/* Usuario / salir */
.workspace-topbar--operator .workspace-actions {
  width: auto !important;
  flex: 0 0 auto !important;
  margin-left: auto;
}

/* Evita que media global lo rompa */
@media (max-width: 1180px) {
  .workspace-topbar--operator .workspace-brand,
  .workspace-topbar--operator .workspace-links,
  .workspace-topbar--operator .workspace-actions {
    width: auto !important;
  }

  .workspace-topbar--operator .workspace-links {
    overflow-x: auto !important;
  }

  .workspace-topbar--operator {
    overflow-x: auto !important;
    overflow-y: visible !important;
  }
}
@media (max-width: 1180px) {
  .public-topbar,
  .workspace-topbar {
    flex-wrap: wrap;
    padding: 0.9rem 1rem;
    overflow: visible;
  }

  .brand-cluster,
  .actions-cluster,
  .workspace-brand,
  .workspace-actions {
    width: 100%;
    justify-content: space-between;
  }

  .main-links,
  .utility-links,
  .workspace-links {
    overflow-x: auto;
    width: 100%;
    padding-bottom: 0.25rem;
  }

  .workspace-links-grouped {
    justify-content: flex-start;
    flex-wrap: wrap;
    overflow: visible !important;
    padding: 0;
    width: auto;
  }

  .workspace-links-grouped .menu-master {
    z-index: 20;
  }

  .workspace-links-grouped .menu-master-panel {
    z-index: 1400;
  }
}

@media (max-width: 720px) {
  .brand-cluster,
  .actions-cluster,
  .workspace-brand,
  .workspace-actions {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.65rem;
  }

  .main-links,
  .utility-links,
  .workspace-links,
  .menu-masters {
    justify-content: flex-start;
  }

  .workspace-topbar--crew {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
    padding: 0.9rem 0.85rem 1rem;
    align-items: stretch;
    justify-items: stretch;
  }

  .workspace-topbar--crew .workspace-mobile-head {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.75rem;
  }

  .workspace-mobile-toggle {
    display: inline-grid;
    gap: 0.22rem;
    padding: 0.55rem 0.35rem;
    border-radius: 12px;
    color: #111111;
  }

  .workspace-mobile-title {
    display: grid;
    justify-items: center;
    gap: 0.08rem;
    text-align: center;
  }

  .workspace-mobile-title strong {
    color: #111111;
    font-size: 0.98rem;
    font-weight: 800;
  }

  .workspace-mobile-title small {
    color: #5d5d5d;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .workspace-topbar--admin .workspace-mobile-toggle {
    color: #ffffff;
  }

  .workspace-topbar--admin .workspace-mobile-title strong {
    color: #ffffff;
  }

  .workspace-topbar--admin .workspace-mobile-title small {
    color: rgba(255, 255, 255, 0.76);
  }

  .workspace-mobile-toggle-line {
    display: block;
    width: 1rem;
    height: 2px;
    border-radius: 999px;
    background: currentColor;
  }

  .workspace-topbar--crew .workspace-brand {
    display: none;
  }

  .workspace-topbar--operator,
  .workspace-topbar--client,
  .workspace-topbar--admin {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.9rem;
    padding: 0.9rem 0.85rem 1rem;
    align-items: stretch;
  }

  .workspace-topbar--operator .workspace-mobile-head,
  .workspace-topbar--client .workspace-mobile-head,
  .workspace-topbar--admin .workspace-mobile-head {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.75rem;
  }

  .workspace-topbar--operator .workspace-brand,
  .workspace-topbar--client .workspace-brand,
  .workspace-topbar--admin .workspace-brand,
  .workspace-topbar--operator .workspace-links,
  .workspace-topbar--client .workspace-links,
  .workspace-topbar--admin .workspace-links,
  .workspace-topbar--operator .workspace-actions,
  .workspace-topbar--client .workspace-actions,
  .workspace-topbar--admin .workspace-actions {
    display: none;
  }

  .public-topbar {
    padding: 0.9rem 0.85rem 1rem;
  }

  .public-mobile-head {
    display: grid;
    grid-template-columns: auto 1fr auto;
    width: 100%;
    align-items: center;
  }

  .public-mobile-toggle {
    color: #111111;
  }

  .public-mobile-head .brand-wordmark,
  .workspace-topbar--operator .workspace-mobile-head .brand-wordmark,
  .workspace-topbar--client .workspace-mobile-head .brand-wordmark,
  .workspace-topbar--admin .workspace-mobile-head .brand-wordmark,
  .workspace-topbar--crew .workspace-mobile-head .brand-wordmark {
    justify-self: end;
  }

  .public-topbar .main-links,
  .public-topbar .utility-links,
  .public-topbar .actions-cluster {
    display: none;
  }

  .workspace-drawer-scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(7, 9, 18, 0.34);
    backdrop-filter: blur(4px);
  }

  .workspace-topbar--crew .brand-wordmark {
    min-width: 0;
  }

  .workspace-topbar--crew .workspace-label strong {
    font-size: 0.92rem;
    letter-spacing: 0.14em;
  }

  .workspace-topbar--crew .workspace-label small {
    max-width: none;
    font-size: 0.82rem;
    line-height: 1.2;
  }

  .menu-master-panel {
    position: static;
    min-width: 0;
    margin-top: 0.45rem;
  }
}
</style>
