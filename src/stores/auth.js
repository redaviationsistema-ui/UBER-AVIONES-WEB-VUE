import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api, clearStoredToken, getStoredToken, setStoredToken } from '../lib/api'
import { normalizeAuthRole, resolveDashboardPathByRole } from '../lib/authRouting'
import { resolveProviderIdForUser } from '../lib/providerContext'

const AUTH_SNAPSHOT_KEY = 'red_aviation_auth_snapshot'

function canUseStorage(storageName) {
  return typeof window !== 'undefined' && typeof window[storageName] !== 'undefined'
}

function readStoredAuthSnapshot() {
  const storageSources = []

  if (canUseStorage('sessionStorage')) {
    storageSources.push(window.sessionStorage)
  }

  if (canUseStorage('localStorage')) {
    storageSources.push(window.localStorage)
  }

  for (const storage of storageSources) {
    const rawSnapshot = storage.getItem(AUTH_SNAPSHOT_KEY)

    if (!rawSnapshot) {
      continue
    }

    try {
      const snapshot = JSON.parse(rawSnapshot)

      if (snapshot && typeof snapshot === 'object') {
        return snapshot
      }
    } catch {
      storage.removeItem(AUTH_SNAPSHOT_KEY)
    }
  }

  return null
}

function writeStoredAuthSnapshot(snapshot) {
  const serializedSnapshot = snapshot ? JSON.stringify(snapshot) : null

  if (canUseStorage('sessionStorage')) {
    if (serializedSnapshot) {
      window.sessionStorage.setItem(AUTH_SNAPSHOT_KEY, serializedSnapshot)
    } else {
      window.sessionStorage.removeItem(AUTH_SNAPSHOT_KEY)
    }
  }

  if (canUseStorage('localStorage')) {
    if (serializedSnapshot) {
      window.localStorage.setItem(AUTH_SNAPSHOT_KEY, serializedSnapshot)
    } else {
      window.localStorage.removeItem(AUTH_SNAPSHOT_KEY)
    }
  }
}

function normalizeRoles(payload = {}) {
  const explicitRoles = [
    ...(Array.isArray(payload.login_context?.roles) ? payload.login_context.roles : []),
    ...(Array.isArray(payload.access?.roles) ? payload.access.roles : []),
    ...(Array.isArray(payload.user?.roles)
      ? payload.user.roles.map((role) => role?.code || role?.key || role?.name).filter(Boolean)
      : []),
  ]

  const fallbackRoles = [payload.user?.operational_role, payload.user?.role].filter(Boolean)

  return [
    ...new Set(
      (explicitRoles.length > 0 ? explicitRoles : fallbackRoles)
        .map((role) => normalizeAuthRole(role))
        .filter(Boolean),
    ),
  ]
}

function resolveEffectiveRole(payload = {}) {
  return normalizeAuthRole(
    payload.login_context?.effective_role ||
      payload.access?.effective_role ||
      payload.user?.operational_role ||
      payload.user?.role ||
      null,
  )
}

function mapDashboardPath(payload) {
  return resolveDashboardPathByRole(resolveEffectiveRole(payload))
}

function resolveAuthPayload(payload = {}) {
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {}
  const user = payload.user || data.user || data.account || null

  return {
    token:
      payload.token ||
      payload.access_token ||
      payload.plainTextToken ||
      data.token ||
      data.access_token ||
      data.plainTextToken ||
      getStoredToken() ||
      null,
    user,
    access: payload.access || data.access || null,
    login_context: payload.login_context || data.login_context || data.loginContext || null,
  }
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref(null)
  const user = ref(null)
  const access = ref(null)
  const loginContext = ref(null)
  const roles = ref([])
  const initialized = ref(false)
  const loading = ref(false)
  let initializePromise = null

  const isAuthenticated = computed(() => Boolean(user.value))
  const effectiveRole = computed(() =>
    resolveEffectiveRole({
      user: user.value,
      access: access.value,
      login_context: loginContext.value,
    }),
  )
  const dashboardPath = computed(() =>
    mapDashboardPath({
      user: user.value,
      access: access.value,
      login_context: loginContext.value,
    }),
  )
  const userName = computed(() => {
    const name = user.value?.company_name || user.value?.name || ''
    return name || 'Cuenta activa'
  })
  const providerId = computed(() => resolveProviderIdForUser(user.value))

  function applyAuth(payload) {
    const resolvedPayload = resolveAuthPayload(payload)
    token.value = resolvedPayload.token
    user.value = resolvedPayload.user
    access.value = resolvedPayload.access
    loginContext.value = resolvedPayload.login_context
    roles.value = normalizeRoles(resolvedPayload)
    setStoredToken(resolvedPayload.token)
    writeStoredAuthSnapshot({
      user: resolvedPayload.user,
      access: resolvedPayload.access,
      login_context: resolvedPayload.login_context,
    })

    if (resolvedPayload.user) {
      initialized.value = true
    }
  }

  function applyStoredAuthSnapshot(snapshot = {}) {
    user.value = snapshot.user || null
    access.value = snapshot.access || null
    loginContext.value = snapshot.login_context || null
    roles.value = normalizeRoles({
      user: user.value,
      access: access.value,
      login_context: loginContext.value,
    })
  }

  function clearAuth() {
    token.value = null
    user.value = null
    access.value = null
    loginContext.value = null
    roles.value = []
    clearStoredToken()
    writeStoredAuthSnapshot(null)
  }

  async function fetchMe() {
    const response = await api.get('/auth/me')
    applyAuth(response)
    return response
  }

  function hasRole(role) {
    return roles.value.includes(normalizeAuthRole(role))
  }

  async function initialize() {
    if (initialized.value) return
    if (initializePromise) return initializePromise

    initializePromise = (async () => {
      token.value = getStoredToken()
      if (!token.value) {
        clearAuth()
        initialized.value = true
        initializePromise = null
        return
      }

      const storedSnapshot = readStoredAuthSnapshot()

      if (storedSnapshot?.user) {
        applyStoredAuthSnapshot(storedSnapshot)
        initialized.value = true
      }

      try {
        await fetchMe()
      } catch {
        clearAuth()
      } finally {
        initialized.value = true
        initializePromise = null
      }
    })()

    return initializePromise
  }

  async function login(credentials) {
    loading.value = true

    try {
      const response = await api.post('/auth/login', credentials)
      applyAuth(response)
      return response
    } finally {
      loading.value = false
    }
  }

  async function register(payload) {
    loading.value = true

    try {
      const response = await api.post('/auth/register', payload)
      applyAuth(response)
      return response
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    try {
      await api.post('/auth/logout', {})
    } catch {
      // Clearing the local auth state is still safe if the remote session is already gone.
    }

    clearAuth()
  }

  async function refreshSession() {
    try {
      return await fetchMe()
    } catch {
      clearAuth()
      return null
    }
  }

  return {
    token,
    user,
    access,
    loginContext,
    roles,
    initialized,
    loading,
    isAuthenticated,
    effectiveRole,
    dashboardPath,
    userName,
    providerId,
    hasRole,
    initialize,
    login,
    register,
    logout,
    refreshSession,
    clearAuth,
  }
})
