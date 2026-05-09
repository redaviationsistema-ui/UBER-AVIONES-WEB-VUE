/**
 * Resuelve el proveedor asociado al usuario desde el payload de /auth/me (sin demo local).
 */
export function resolveProviderIdForUser(user = null) {
  if (!user) return null

  const explicitProviderId = Number(
    user.provider_id ||
      user.proveedor_id ||
      user.provider?.id ||
      user.proveedor?.id ||
      user.provider_profile?.id ||
      0,
  )

  return explicitProviderId > 0 ? explicitProviderId : null
}
