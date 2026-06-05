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

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),

  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { redirectAuthenticated: true },
    },
    {
      path: '/vuelos',
      name: 'vuelos',
      redirect: '/renta-aeronaves',
    },
    {
      path: '/servicios',
      name: 'servicios',
      component: ServicesView,
      meta: { redirectAuthenticated: true },
    },
    {
      path: '/plataforma',
      name: 'plataforma',
      component: PlatformView,
      meta: { redirectAuthenticated: true },
    },
    {
      path: '/membresias',
      name: 'membresias',
      component: MembershipsView,
      meta: { redirectAuthenticated: true },
    },
    {
      path: '/cobertura',
      name: 'cobertura',
      component: CoverageView,
      meta: { redirectAuthenticated: true },
    },
    {
      path: '/ayuda',
      name: 'ayuda',
      component: HelpView,
      meta: { redirectAuthenticated: true },
    },
    {
      path: '/acceso',
      name: 'acceso',
      redirect: '/',
    },
    {
      path: '/login',
      alias: ['/login-cliente'],
      name: 'login-cliente',
      component: ClientLoginView,
      meta: { guestOnly: true, hideTopbar: true },
    },
    {
      path: '/login-operacion',
      name: 'login',
      redirect: '/',
    },
    {
      path: '/registro',
      alias: ['/register'],
      name: 'registro',
      component: RegisterView,
      meta: { guestOnly: true },
    },

    {
      path: '/cliente/contrato/',
      alias: ['/cliente/contrato/resultado', '/client/contract', '/client/contract/result'],
      name: 'contract-result',
      component: ContractResultView,
      meta: { requiresAuth: true, role: 'client', hideTopbar: true },
    },
    {
      path: '/cliente/:section/:id/:subsection',
      name: 'cliente-subdetalle',
      component: RoleView,
      meta: { requiresAuth: true, role: 'client', hideTopbar: true },
    },
    {
      path: '/cliente/:section/:id',
      name: 'cliente-detalle',
      component: RoleView,
      meta: { requiresAuth: true, role: 'client', hideTopbar: true },
    },
    {
      path: '/cliente/:section?',
      alias: ['/client/:section?'],
      name: 'cliente',
      component: RoleView,
      meta: { requiresAuth: true, role: 'client', hideTopbar: true },
    },
    {
      path: '/operador/:section?',
      alias: ['/operator/:section?'],
      name: 'operador',
      component: RoleView,
      meta: { requiresAuth: true, role: 'operator', hideTopbar: true },
    },
    {
      path: '/sobrecargo/disponibilidad',
      alias: ['/crew/disponibilidad'],
      name: 'sobrecargo-disponibilidad',
      component: DisponibilidadSobrecargoView,
      meta: { requiresAuth: true, role: 'crew', hideTopbar: true },
    },
    {
      path: '/crew/:section?',
      alias: ['/sobrecargo/:section?'],
      name: 'crew',
      component: RoleView,
      meta: { requiresAuth: true, role: 'crew', hideTopbar: true },
    },
    {
      path: '/admin/sobrecargos/disponibilidad',
      name: 'admin-sobrecargos-disponibilidad',
      component: DisponibilidadSobrecargosAdminView,
      meta: { requiresAuth: true, role: 'admin', hideTopbar: true },
    },
    {
      path: '/admin/:section?',
      name: 'admin',
      component: RoleView,
      meta: { requiresAuth: true, role: 'admin', hideTopbar: true },
    },
    {
      path: '/renta-aeronaves',
      name: 'renta-aeronaves',
      component: AircraftRentView,
      meta: { hideTopbar: true },
    },
    {
      path: '/membresias/comenzar',
      name: 'membresias-comenzar',
      component: StartMembershipView,
    },
    {
      path: '/membresias/registro',
      name: 'membresias-registro',
      component: BusinessRegisterView,
      meta: { hideTopbar: true },
    },
    {
      path: '/membresias/contacto',
      name: 'membresias-contacto',
      component: BusinessContactView,
      meta: { hideTopbar: true },
    },
    {
      path: '/idioma',
      name: 'idioma',
      component: LanguageView,
      meta: { hideTopbar: true },
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
  const shouldResolveAuthBeforeEnter =
    to.meta.requiresAuth || to.meta.guestOnly || to.meta.redirectAuthenticated

  if (!auth.initialized) {
    if (shouldResolveAuthBeforeEnter) {
      await auth.initialize()
    } else {
      auth.initialize()
    }
  }

  if (to.meta.guestOnly && auth.isAuthenticated) {
    return auth.dashboardPath
  }

  if (to.meta.redirectAuthenticated && auth.isAuthenticated) {
    return auth.dashboardPath
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    if (normalizeAuthRole(to.meta.role) === 'client') {
      return {
        name: 'login-cliente',
        query: { redirect: to.fullPath },
      }
    }

    return { name: 'home' }
  }

  if (!to.meta.role || !auth.user) {
    return true
  }

  if (!auth.hasRole(to.meta.role)) {
    return auth.dashboardPath
  }

  return true
})

export default router
