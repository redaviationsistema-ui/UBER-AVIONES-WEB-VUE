import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api, clearStoredToken, getStoredToken, setStoredToken } from '../lib/api'
import { normalizeAuthRole, resolveDashboardPathByRole } from '../lib/authRouting'
import { resolveBestCompanyDisplayName } from '../lib/companyDisplay'
import { resolveProviderIdForUser } from '../lib/providerContext'

const AUTH_SNAPSHOT_KEY = 'red_aviation_auth_snapshot'
const AUTH_ME_CACHE_KEY = 'red_aviation_auth_me_cache'
const AUTH_REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_AUTH_API_TIMEOUT_MS || 45000)
const LOGOUT_REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_LOGOUT_API_TIMEOUT_MS || 2500)
const AUTH_ME_CACHE_TTL_MS = Number(import.meta.env.VITE_AUTH_ME_CACHE_TTL_MS || 120000)

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

function clearStoredMeCache() {
  const sessionStorage = getSessionStorage()
  sessionStorage?.removeItem(AUTH_ME_CACHE_KEY)
}

function readStoredMeCache() {
  const sessionStorage = getSessionStorage()
  const rawCache = sessionStorage?.getItem(AUTH_ME_CACHE_KEY)

  if (!rawCache) return null

  try {
    const parsed = JSON.parse(rawCache)

    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.payload &&
      typeof parsed.payload === 'object' &&
      Number.isFinite(Number(parsed.timestamp || 0))
    ) {
      return {
        timestamp: Number(parsed.timestamp),
        payload: parsed.payload,
      }
    }
  } catch {
    sessionStorage?.removeItem(AUTH_ME_CACHE_KEY)
  }

  return null
}

function writeStoredMeCache(payload) {
  const sessionStorage = getSessionStorage()

  if (!sessionStorage || !payload || typeof payload !== 'object') return

  sessionStorage.setItem(
    AUTH_ME_CACHE_KEY,
    JSON.stringify({
      timestamp: Date.now(),
      payload,
    }),
  )
}

export function normalizeRoles(payload = {}) {
  const explicitRoles = [
    payload.login_context?.effective_role,
    payload.access?.effective_role,
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

export function resolveEffectiveRole(payload = {}) {
  return (
    normalizeAuthRole(
      payload.login_context?.effective_role ||
        payload.access?.effective_role ||
        payload.user?.operational_role ||
        payload.user?.role ||
        null,
    ) || normalizeRoles(payload)[0] || ''
  )
}

function mapDashboardPath(payload) {
  return resolveDashboardPathByRole(resolveEffectiveRole(payload))
}

export function resolveAuthPayload(payload = {}, options = {}) {
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
  const shouldPreserveCrewContext = currentEffectiveRole === 'crew' && resolvedEffectiveRole !== 'crew'
  const shouldPreserveProviderContext =
    currentEffectiveRole === 'operator' && resolvedEffectiveRole !== 'operator'
  const shouldForceCrewContext = intendedRole === 'sobrecargo' || shouldPreserveCrewContext
  const shouldForceProviderContext =
    ['provider', 'operator', 'operador'].includes(intendedRole) || shouldPreserveProviderContext
  const forcedOperationalRole = shouldForceCrewContext
    ? 'sobrecargo'
    : shouldForceProviderContext
      ? 'provider'
      : ''
  const user =
    rawUser && forcedOperationalRole
      ? { ...rawUser, operational_role: forcedOperationalRole }
      : rawUser
  const loginContext =
    forcedOperationalRole
      ? {
          ...rawLoginContext,
          effective_role: forcedOperationalRole,
          roles: [
            ...new Set([
              ...(Array.isArray(rawLoginContext?.roles) ? rawLoginContext.roles : []),
              forcedOperationalRole,
            ]),
          ],
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

function resolveCachedAuthPayload() {
  const cached = readStoredMeCache()
  if (cached?.payload && typeof cached.payload === 'object') {
    return cached.payload
  }

  const storedSnapshot = readStoredAuthSnapshot()
  if (storedSnapshot?.user && typeof storedSnapshot === 'object') {
    return {
      token: getStoredToken() || null,
      user: storedSnapshot.user,
      access: storedSnapshot.access || null,
      login_context: storedSnapshot.login_context || null,
    }
  }

  return null
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
    const companyName = resolveBestCompanyDisplayName(
      user.value?.provider?.company_name,
      user.value?.provider?.commercial_name,
      user.value?.provider?.legal_name,
      user.value?.ownedProvider?.company_name,
      user.value?.ownedProvider?.commercial_name,
      user.value?.ownedProvider?.legal_name,
      user.value?.company_name,
      user.value?.nombre_empresa,
      user.value?.commercial_name,
      user.value?.nombre_comercial,
      user.value?.legal_name,
      user.value?.razon_social,
    )

    return companyName !== 'Empresa operadora' ? companyName : user.value?.name || 'Cuenta activa'
  })
  const providerId = computed(() => resolveProviderIdForUser(user.value))
  let fetchMePromise = null

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
    writeStoredMeCache({
      token: resolvedPayload.token,
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
    clearStoredMeCache()
  }

  function syncUserContext({ userPatch = null, profilePatch = null, accessPatch = null, loginContextPatch = null } = {}) {
    if (user.value) {
      user.value = {
        ...user.value,
        ...userPatch,
        profile: profilePatch
          ? {
              ...user.value.profile,
              ...profilePatch,
            }
          : user.value.profile,
      }
    }

    if (accessPatch) {
      access.value = {
        ...access.value,
        ...accessPatch,
      }
    }

    if (loginContextPatch) {
      loginContext.value = {
        ...loginContext.value,
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

  async function fetchMe(options = {}) {
    const force = options.force === true
    const preferCache = options.preferCache !== false
    const allowServerErrorFallback = options.allowServerErrorFallback !== false
    const cacheTtlMs = Number.isFinite(Number(options.cacheTtlMs))
      ? Number(options.cacheTtlMs)
      : AUTH_ME_CACHE_TTL_MS

    if (!force && preferCache) {
      const cached = readStoredMeCache()
      const isFresh = cached && Date.now() - cached.timestamp < cacheTtlMs

      if (isFresh) {
        applyAuth(cached.payload, {
          currentSnapshot: {
            user: user.value,
            access: access.value,
            login_context: loginContext.value,
          },
        })
        return cached.payload
      }
    }

    if (!force && fetchMePromise) {
      return fetchMePromise
    }

    fetchMePromise = (async () => {
      try {
        const response = await api.get('/auth/me', { timeoutMs: AUTH_REQUEST_TIMEOUT_MS })
        applyAuth(response, {
          currentSnapshot: {
            user: user.value,
            access: access.value,
            login_context: loginContext.value,
          },
        })
        return response
      } catch (error) {
        const status = Number(error?.status || 0)
        const canFallback =
          allowServerErrorFallback &&
          !isUnauthorizedError(error) &&
          (status >= 500 || status === 0)

        if (canFallback) {
          const cachedPayload = resolveCachedAuthPayload()
          if (cachedPayload?.user) {
            applyAuth(cachedPayload, {
              currentSnapshot: {
                user: user.value,
                access: access.value,
                login_context: loginContext.value,
              },
            })
            return cachedPayload
          }
        }

        throw error
      }
    })().finally(() => {
      fetchMePromise = null
    })

    return fetchMePromise
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
      applyAuth(response, {
        intendedRole: credentials?.role,
      })
      return response
    } finally {
      loading.value = false
    }
  }

  async function register(payload, options = {}) {
    loading.value = true

    try {
      const registerPath = String(options.path || '/auth/register').trim() || '/auth/register'
      const response =
        payload instanceof FormData
          ? await api.postForm(registerPath, payload, {
              timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
            })
          : await api.post(registerPath, payload, {
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

  async function refreshSession(options = {}) {
    try {
      return await fetchMe(options)
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
