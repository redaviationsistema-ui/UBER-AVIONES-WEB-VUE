import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api, clearStoredToken, getStoredToken, setStoredToken } from '../lib/api'
import { normalizeAuthRole, resolveDashboardPathByRole } from '../lib/authRouting'
import { resolveProviderIdForUser } from '../lib/providerContext'

const AUTH_SNAPSHOT_KEY = 'red_aviation_auth_snapshot'
const AUTH_REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_AUTH_API_TIMEOUT_MS || 45000)
const LOGOUT_REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_LOGOUT_API_TIMEOUT_MS || 2500)

function canUseStorage(storageName) {
  return typeof window !== 'undefined' && typeof window[storageName] !== 'undefined'
}

function getSessionStorage() {
  if (!canUseStorage('sessionStorage')) return null
  const storage = window.sessionStorage
  return typeof storage?.getItem === 'function' ? storage : null
}

function getLegacyLocalStorage() {
  if (!canUseStorage('localStorage')) return null
  const storage = window.localStorage
  return typeof storage?.removeItem === 'function' ? storage : null
}

function clearLegacyAuthSnapshot() {
  const legacyStorage = getLegacyLocalStorage()
  if (!legacyStorage) return
  legacyStorage.removeItem(AUTH_SNAPSHOT_KEY)
}

function readStoredAuthSnapshot() {
  const sessionStorage = getSessionStorage()
  const rawSnapshot = sessionStorage?.getItem(AUTH_SNAPSHOT_KEY)

  clearLegacyAuthSnapshot()

  if (!rawSnapshot) {
    return null
  }

  try {
    const snapshot = JSON.parse(rawSnapshot)

    if (snapshot && typeof snapshot === 'object') {
      return snapshot
    }
  } catch {
    sessionStorage?.removeItem(AUTH_SNAPSHOT_KEY)
  }

  return null
}

function writeStoredAuthSnapshot(snapshot) {
  const serializedSnapshot = snapshot ? JSON.stringify(snapshot) : null
  const sessionStorage = getSessionStorage()

  if (sessionStorage) {
    if (serializedSnapshot) {
      sessionStorage.setItem(AUTH_SNAPSHOT_KEY, serializedSnapshot)
    } else {
      sessionStorage.removeItem(AUTH_SNAPSHOT_KEY)
    }
  }

  clearLegacyAuthSnapshot()
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
      [...explicitRoles, ...fallbackRoles]
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

function resolveAuthPayload(payload = {}, options = {}) {
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {}
  const intendedRole = String(options.intendedRole || '').trim().toLowerCase()
  const currentSnapshot = options.currentSnapshot || {}
  const currentEffectiveRole = normalizeAuthRole(
    currentSnapshot.login_context?.effective_role || currentSnapshot.user?.operational_role || null,
  )
  const rawUser = payload.user || data.user || data.account || null
  const rawLoginContext = payload.login_context || data.login_context || data.loginContext || null
  const rawAccess = payload.access || data.access || null
  const resolvedEffectiveRole = resolveEffectiveRole({
    user: rawUser,
    access: rawAccess,
    login_context: rawLoginContext,
  })
  const shouldPreserveCrewContext =
    currentEffectiveRole === 'crew' && resolvedEffectiveRole && resolvedEffectiveRole !== 'crew'
  const shouldForceCrewContext = intendedRole === 'sobrecargo' || shouldPreserveCrewContext
  const user =
    rawUser && shouldForceCrewContext && !rawUser.operational_role
      ? { ...rawUser, operational_role: 'sobrecargo' }
      : rawUser
  const loginContext =
    shouldForceCrewContext && (!rawLoginContext || !rawLoginContext.effective_role)
      ? {
          ...(rawLoginContext || {}),
          effective_role: 'sobrecargo',
          roles: [...new Set([...(Array.isArray(rawLoginContext?.roles) ? rawLoginContext.roles : []), 'sobrecargo'])],
        }
      : rawLoginContext

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
    access: rawAccess,
    login_context: loginContext,
  }
}

function isUnauthorizedError(error) {
  const status = Number(error?.status || 0)
  if (status === 401) return true

  const message = String(error?.payload?.message || error?.message || '')
    .trim()
    .toLowerCase()

  return message === 'unauthenticated.' || message === 'unauthenticated'
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

  function applyAuth(payload, options = {}) {
    const resolvedPayload = resolveAuthPayload(payload, options)
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

  function syncUserContext({ userPatch = null, profilePatch = null, accessPatch = null, loginContextPatch = null } = {}) {
    if (user.value) {
      user.value = {
        ...user.value,
        ...(userPatch || {}),
        profile: profilePatch
          ? {
              ...(user.value.profile || {}),
              ...profilePatch,
            }
          : user.value.profile,
      }
    }

    if (accessPatch) {
      access.value = {
        ...(access.value || {}),
        ...accessPatch,
      }
    }

    if (loginContextPatch) {
      loginContext.value = {
        ...(loginContext.value || {}),
        ...loginContextPatch,
      }
    }

    roles.value = normalizeRoles({
      user: user.value,
      access: access.value,
      login_context: loginContext.value,
    })

    writeStoredAuthSnapshot({
      user: user.value,
      access: access.value,
      login_context: loginContext.value,
    })
  }

  async function fetchMe() {
    const response = await api.get('/auth/me', { timeoutMs: AUTH_REQUEST_TIMEOUT_MS })
    applyAuth(response, {
      currentSnapshot: {
        user: user.value,
        access: access.value,
        login_context: loginContext.value,
      },
    })
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
        initializePromise = null
        return
      }

      try {
        await fetchMe()
      } catch (error) {
        if (isUnauthorizedError(error)) {
          clearAuth()
        }
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
      const response = await api.post('/auth/login', credentials, {
        timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
      })
      applyAuth(response)
      return response
    } finally {
      loading.value = false
    }
  }

  async function register(payload, options = {}) {
    loading.value = true

    try {
      const response =
        payload instanceof FormData
          ? await api.postForm('/auth/register', payload, {
              timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
            })
          : await api.post('/auth/register', payload, {
              timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
            })
      applyAuth(response, options)
      return response
    } finally {
      loading.value = false
    }
  }

  function logout() {
    const currentToken = token.value || getStoredToken()
    clearAuth()

    if (!currentToken) {
      return Promise.resolve()
    }

    void api
      .post(
        '/auth/logout',
        {},
        {
          timeoutMs: LOGOUT_REQUEST_TIMEOUT_MS,
          headers: {
            Authorization: `Bearer ${currentToken}`,
          },
        },
      )
      .catch(() => {
        // The user is already logged out locally; remote cleanup is best-effort only.
      })

    return Promise.resolve()
  }

  async function refreshSession() {
    try {
      return await fetchMe()
    } catch (error) {
      if (isUnauthorizedError(error)) {
        clearAuth()
      }
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
    syncUserContext,
    clearAuth,
  }
})
