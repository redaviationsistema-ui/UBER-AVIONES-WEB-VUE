/**
 * Resuelve el proveedor asociado al usuario desde el payload de /auth/me (sin demo local).
 */
function normalizeProviderIdCandidate(value) {
  const normalized = Number(value || 0)
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null
}

function canonicalizeProtectedFieldKey(key = '') {
  return String(key || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

export function resolveProviderIdForUser(user = null) {
  if (!user) return null

  const providerCandidates = [
    user.provider_id,
    user.proveedor_id,
    user.providerId,
    user.proveedorId,
    user.provider?.provider_id,
    user.provider?.id,
    user.proveedor?.provider_id,
    user.proveedor?.id,
    user.ownedProvider?.provider_id,
    user.ownedProvider?.id,
    user.owned_provider?.provider_id,
    user.owned_provider?.id,
    user.provider_profile?.provider_id,
    user.provider_profile?.id,
    user.providerProfile?.provider_id,
    user.providerProfile?.id,
    user.profile?.provider_id,
    user.profile?.provider?.id,
    user.access?.provider_id,
    user.access?.provider?.id,
  ]

  const explicitProviderId =
    providerCandidates
      .map((value) => normalizeProviderIdCandidate(value))
      .find((value) => value != null) || null

  return explicitProviderId
}

const PROVIDER_AIRCRAFT_PROTECTED_FIELDS = new Set([
  'provider_id',
  'proveedor_id',
  'status',
  'is_active',
  'estado',
  'operational_status',
  'billing_status',
  'subscription_status',
  'approved',
  'review_status',
  'validation_status',
  'activated_at',
  'subscription_started_at',
  'subscription_ends_at',
  'last_payment_at',
  'stripe_customer_id',
  'stripe_subscription_id',
  'stripe_session_id',
  'stripe_checkout_session_id',
  'stripe_payment_intent_id',
  'stripe_invoice_id',
  'checkout_session_id',
])

const PROVIDER_AIRCRAFT_PROTECTED_PREFIXES = ['stripe_', 'billing_', 'subscription_']

function isProtectedProviderAircraftField(key = '') {
  const canonicalKey = canonicalizeProtectedFieldKey(key)
  if (!canonicalKey) return false

  return (
    PROVIDER_AIRCRAFT_PROTECTED_FIELDS.has(canonicalKey) ||
    PROVIDER_AIRCRAFT_PROTECTED_PREFIXES.some((prefix) => canonicalKey.startsWith(prefix))
  )
}

export function sanitizeProviderAircraftMutationPayload(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([key]) => !isProtectedProviderAircraftField(key),
    ),
  )
}
