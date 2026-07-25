import { createRouter, createWebHistory } from 'vue-router'

import { normalizeAuthRole } from '../lib/authRouting'
import { pinia } from '../stores'
import { useAuthStore } from '../stores/auth'

const HomeView = () => import('../views/HomeView.vue')
const ServicesView = () => import('../views/ServicesView.vue')
const PlatformView = () => import('../views/PlatformView.vue')
const MembershipsView = () => import('../views/MembershipsView.vue')
const CoverageView = () => import('../views/CoverageView.vue')
const HelpView = () => import('../views/HelpView.vue')
const ClientLoginView = () => import('../views/ClientLoginView.vue')
const LoginView = () => import('../views/LoginView.vue')
const ContractResultView = () => import('../views/ContractResultView.vue')
const RegisterView = () => import('../views/RegisterView.vue')
const RoleView = () => import('../views/RoleView.vue')
const DisponibilidadSobrecargoView = () => import('../views/DisponibilidadSobrecargoView.vue')
const DisponibilidadSobrecargosAdminView = () => import('../views/DisponibilidadSobrecargosAdminView.vue')
const AircraftRentView = () => import('../views/AircraftRentView.vue')
const StartMembershipView = () => import('../views/StartMembershipView.vue')
const BusinessRegisterView = () => import('../views/BusinessRegisterView.vue')
const BusinessContactView = () => import('../views/BusinessContactView.vue')
const LanguageView = () => import('../views/LanguageView.vue')
const AccessDeniedView = () => import('../views/AccessDeniedView.vue')

const PUBLIC_ACCESS = 'public'
const GUEST_ACCESS = 'guest'
const AUTHENTICATED_ACCESS = 'authenticated'

function buildLoginRedirectRoute(requiredRole, redirect) {
  const normalizedRole = normalizeAuthRole(requiredRole)

  if (normalizedRole === 'client') {
    return {
      name: 'login-cliente',
      query: { redirect, session: 'expired' },
    }
  }

  const roleQuery =
    normalizedRole === 'admin'
      ? 'admin'
      : normalizedRole === 'crew'
        ? 'sobrecargo'
        : 'provider'

  return {
    name: 'login',
    query: { redirect, session: 'expired', role: roleQuery },
  }
}

function buildAuthenticatedMeta(role, extra = {}) {
  const normalizedRole = normalizeAuthRole(role)

  return {
    access: AUTHENTICATED_ACCESS,
    role,
    requiresAuth: true,
    ...(normalizedRole === 'admin' ? { requiresAdmin: true } : {}),
    ...extra,
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),

  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { access: PUBLIC_ACCESS, redirectAuthenticated: true },
    },
    {
      path: '/vuelos',
      name: 'vuelos',
      redirect: '/renta-aeronaves',
      meta: { access: PUBLIC_ACCESS },
    },
    {
      path: '/servicios',
      name: 'servicios',
      component: ServicesView,
      meta: { access: PUBLIC_ACCESS, redirectAuthenticated: true },
    },
    {
      path: '/plataforma',
      name: 'plataforma',
      component: PlatformView,
      meta: { access: PUBLIC_ACCESS, redirectAuthenticated: true },
    },
    {
      path: '/membresias',
      name: 'membresias',
      component: MembershipsView,
      meta: { access: PUBLIC_ACCESS, redirectAuthenticated: true },
    },
    {
      path: '/cobertura',
      name: 'cobertura',
      component: CoverageView,
      meta: { access: PUBLIC_ACCESS, redirectAuthenticated: true },
    },
    {
      path: '/ayuda',
      name: 'ayuda',
      component: HelpView,
      meta: { access: PUBLIC_ACCESS, redirectAuthenticated: true },
    },
    {
      path: '/acceso',
      name: 'acceso',
      redirect: (to) => ({
        name: 'login',
        query: to.query,
      }),
      meta: { access: PUBLIC_ACCESS },
    },
    {
      path: '/login',
      alias: ['/login-cliente'],
      name: 'login-cliente',
      component: ClientLoginView,
      meta: { access: GUEST_ACCESS, hideTopbar: true },
    },
    {
      path: '/login-operacion',
      name: 'login',
      component: LoginView,
      meta: { access: GUEST_ACCESS, hideTopbar: true },
    },
    {
      path: '/registro',
      alias: ['/register'],
      name: 'registro',
      component: RegisterView,
      meta: { access: GUEST_ACCESS },
    },

    {
      path: '/cliente/contrato/',
      alias: ['/cliente/contrato/resultado', '/client/contract', '/client/contract/result'],
      name: 'contract-result',
      component: ContractResultView,
      meta: buildAuthenticatedMeta('client', { hideTopbar: true }),
    },
    {
      path: '/cliente/:section/:id/:subsection',
      name: 'cliente-subdetalle',
      component: RoleView,
      meta: buildAuthenticatedMeta('client', { hideTopbar: true }),
    },
    {
      path: '/cliente/:section/:id',
      name: 'cliente-detalle',
      component: RoleView,
      meta: buildAuthenticatedMeta('client', { hideTopbar: true }),
    },
    {
      path: '/cliente/:section?',
      alias: ['/client/:section?'],
      name: 'cliente',
      component: RoleView,
      meta: buildAuthenticatedMeta('client', { hideTopbar: true }),
    },
    {
      path: '/operador/:section?',
      alias: ['/operator/:section?'],
      name: 'operador',
      component: RoleView,
      meta: buildAuthenticatedMeta('operator', { hideTopbar: true }),
    },
    {
      path: '/sobrecargo/disponibilidad',
      alias: ['/crew/disponibilidad'],
      name: 'sobrecargo-disponibilidad',
      component: DisponibilidadSobrecargoView,
      meta: buildAuthenticatedMeta('crew', { hideTopbar: true }),
    },
    {
      path: '/crew/:section?',
      alias: ['/sobrecargo/:section?'],
      name: 'crew',
      component: RoleView,
      meta: buildAuthenticatedMeta('crew', { hideTopbar: true }),
    },
    {
      path: '/admin/sobrecargos',
      redirect: { name: 'admin', params: { section: 'sobrecargos' } },
      meta: buildAuthenticatedMeta('admin', { hideTopbar: true }),
    },
    {
      path: '/admin/sobrecargos/disponibilidad',
      name: 'admin-sobrecargos-disponibilidad',
      component: DisponibilidadSobrecargosAdminView,
      meta: buildAuthenticatedMeta('admin', { hideTopbar: true }),
    },
    {
      path: '/admin/sobrecargos/operaciones',
      redirect: { name: 'admin', params: { section: 'sobrecargo-operaciones' } },
      meta: buildAuthenticatedMeta('admin', { hideTopbar: true }),
    },
    {
      path: '/admin/sobrecargos/en-vuelo',
      redirect: { name: 'admin', params: { section: 'sobrecargos-en-vuelo' } },
      meta: buildAuthenticatedMeta('admin', { hideTopbar: true }),
    },
    {
      path: '/admin/sobrecargos/incidencias',
      redirect: { name: 'admin', params: { section: 'incidencias' } },
      meta: buildAuthenticatedMeta('admin', { hideTopbar: true }),
    },
    {
      path: '/admin/:section?',
      name: 'admin',
      component: RoleView,
      meta: buildAuthenticatedMeta('admin', { hideTopbar: true }),
    },
    {
      path: '/acceso-denegado',
      name: 'access-denied',
      component: AccessDeniedView,
      meta: { access: PUBLIC_ACCESS, hideTopbar: true },
    },
    {
      path: '/renta-aeronaves',
      name: 'renta-aeronaves',
      component: AircraftRentView,
      meta: { access: PUBLIC_ACCESS, hideTopbar: true },
    },
    {
      path: '/membresias/comenzar',
      name: 'membresias-comenzar',
      component: StartMembershipView,
      meta: { access: PUBLIC_ACCESS },
    },
    {
      path: '/membresias/registro',
      name: 'membresias-registro',
      component: BusinessRegisterView,
      meta: { access: PUBLIC_ACCESS, hideTopbar: true },
    },
    {
      path: '/membresias/contacto',
      name: 'membresias-contacto',
      component: BusinessContactView,
      meta: { access: PUBLIC_ACCESS, hideTopbar: true },
    },
    {
      path: '/idioma',
      name: 'idioma',
      component: LanguageView,
      meta: { access: PUBLIC_ACCESS, hideTopbar: true },
    },

    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],

  scrollBehavior(to) {
    if (to.hash) {
      return { el: to.hash, behavior: 'smooth' }
    }

    return { top: 0 }
  },
})

router.beforeEach(async (to) => {
  const auth = useAuthStore(pinia)
  const accessMode = String(to.meta.access || '').trim()
  const shouldResolveAuthBeforeEnter =
    accessMode === AUTHENTICATED_ACCESS ||
    accessMode === GUEST_ACCESS ||
    Boolean(to.meta.redirectAuthenticated)

  if (![PUBLIC_ACCESS, GUEST_ACCESS, AUTHENTICATED_ACCESS].includes(accessMode)) {
    return { name: 'access-denied', query: { reason: 'route-policy' } }
  }

  if (!auth.initialized) {
    if (shouldResolveAuthBeforeEnter || auth.token) {
      await auth.initialize()
    }
  }

  if (accessMode === GUEST_ACCESS && auth.isAuthenticated) {
    return auth.dashboardPath
  }

  if (to.meta.redirectAuthenticated && auth.isAuthenticated) {
    return auth.dashboardPath
  }

  if (accessMode === AUTHENTICATED_ACCESS && !auth.isAuthenticated) {
    return buildLoginRedirectRoute(to.meta.role, to.fullPath)
  }

  if (!to.meta.role || !auth.user) {
    return true
  }

  const requiredRole = normalizeAuthRole(to.meta.role)

  if (requiredRole === 'admin') {
    if (!auth.hasAdminAccess()) {
      if (auth.isAuthenticated && auth.dashboardPath) {
        return auth.dashboardPath
      }

      return { name: 'access-denied', query: { reason: 'admin-role-required' } }
    }

    return true
  }

  if (!auth.hasRole(requiredRole)) {
    return { name: 'access-denied', query: { reason: 'insufficient-role' } }
  }

  return true
})

if (typeof window !== 'undefined') {
  window.addEventListener('skygroup:session-expired', async () => {
    const auth = useAuthStore(pinia)
    const redirect = router.currentRoute.value.fullPath
    await auth.logout()
    if (!router.currentRoute.value.meta?.requiresAuth) return
    await router.replace(buildLoginRedirectRoute(router.currentRoute.value.meta?.role, redirect))
  })
}

export default router
