/*----------------------------------------------------------------------------------------------*/  
// VISTA DE UTILIDADES PARA EL PORTAL DE OPERADOR
/*----------------------------------------------------------------------------------------------*/

export function compactBillingReference(value = '') {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  if (normalized.length <= 18) return normalized
  return `${normalized.slice(0, 8)}...${normalized.slice(-6)}`
}

export function normalizePayment(raw = {}, index = 0, helpers = {}) {
  const parseRequestAmount =
    typeof helpers.parseRequestAmount === 'function' ? helpers.parseRequestAmount : (value) => Number(value || 0)
  const compactReference =
    typeof helpers.compactBillingReference === 'function'
      ? helpers.compactBillingReference
      : compactBillingReference

  const amountValue = parseRequestAmount(raw.amount || raw.total || raw.net_amount || raw.value || 0, 0)
  const amountCurrency = String(raw.currency || raw.moneda || 'USD').toUpperCase()
  const rawStatus = String(raw.status || 'Pendiente')
  const normalizedStatus = rawStatus.trim().toLowerCase()
  const aircraft =
    raw.aircraft_name ||
    raw.aircraft_model ||
    raw.aircraft ||
    raw.subscription_item_name ||
    raw.metadata?.aircraft_name ||
    raw.description ||
    'Aeronave por identificar'

  const normalizedType = String(raw.type || raw.payment_type || raw.category || '').toLowerCase()
  const normalizedDescription = String(raw.description || '').toLowerCase()
  const isAircraftSubscription =
    normalizedType.includes('aircraft') ||
    normalizedType.includes('subscription') ||
    normalizedDescription.includes('subscription creation') ||
    normalizedDescription.includes('suscripcion mensual aeronave') ||
    Boolean(raw.aircraft_id || raw.aircraftId || raw.aircraft?.id)

  return {
    id: raw.id || index + 1,
    flight: raw.flight || raw.route || raw.operation || 'Vuelo',
    completedAt: raw.completed_at || raw.flight_date || raw.date || 'Pendiente',
    rawCreatedAt: raw.created_at || raw.completed_at || raw.flight_date || raw.date || '',
    amount: amountValue ? `${amountCurrency} ${amountValue.toFixed(2)}` : raw.amount || raw.total || raw.net_amount || 'Pendiente',
    status: rawStatus,
    statusNormalized: normalizedStatus,
    receipt: raw.receipt || raw.document || raw.voucher || 'Sin comprobante',
    reference:
      raw.reference ||
      raw.payment_reference ||
      raw.checkout_session_id ||
      raw.subscription_id ||
      raw.invoice_id ||
      raw.intent_id ||
      '',
    description:
      raw.description ||
      raw.concept ||
      raw.reason ||
      raw.type_label ||
      raw.subscription_label ||
      'Pago sin descripcion visible',
    paymentMethod:
      raw.payment_method_brand ||
      raw.payment_method ||
      raw.card_brand ||
      raw.method ||
      raw.payment_provider ||
      'Metodo no visible',
    client:
      raw.client_name ||
      raw.customer_name ||
      raw.customer_email ||
      raw.client ||
      raw.user_email ||
      'Sin cliente',
    aircraft,
    aircraftId:
      raw.aircraft_id ||
      raw.subscription_target_id ||
      raw.metadata?.aircraft_id ||
      null,
    type:
      raw.type ||
      raw.payment_type ||
      raw.category ||
      (normalizedDescription.includes('subscription') ? 'aircraft_subscription' : 'operation'),
    currency: amountCurrency,
    amountValue,
    providerCheckoutId: raw.checkout_session_id || raw.provider_checkout_id || '',
    providerSubscriptionId: raw.subscription_id || raw.provider_subscription_id || '',
    displayReference: compactReference(
      raw.reference ||
        raw.payment_reference ||
        raw.checkout_session_id ||
        raw.subscription_id ||
        raw.invoice_id ||
        raw.intent_id ||
        '',
    ),
    displayProviderCheckoutId: compactReference(raw.checkout_session_id || raw.provider_checkout_id || ''),
    displayProviderSubscriptionId: compactReference(raw.subscription_id || raw.provider_subscription_id || ''),
    paidAt: raw.paid_at || '',
    autoRenewEnabled:
      raw.auto_renew_enabled ??
      raw.autoRenewEnabled ??
      raw.subscription_auto_renew ??
      raw.subscriptionAutoRenew ??
      null,
    defaultPaymentMethodReady:
      raw.default_payment_method_ready ??
      raw.defaultPaymentMethodReady ??
      raw.has_default_payment_method ??
      raw.hasDefaultPaymentMethod ??
      null,
    isAircraftSubscription,
  }
}
