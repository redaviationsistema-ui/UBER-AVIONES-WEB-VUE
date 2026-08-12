/*----------------------------------------------------------------------------------------------*/
// VISTA DE UTILIDADES PARA EL PORTAL DE OPERADOR
/*----------------------------------------------------------------------------------------------*/  

import { compactBillingReference, normalizePayment as normalizePaymentEntry } from './portalOperador.utilidadesPagos'

export function createOperatorPortalBillingDomain(ctx = {}) {
  const {
    formatCurrency,
    formatDateTimeRange,
    providerAircraftPlanAmount,
  } = ctx

  const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing']
  const PENDING_SUBSCRIPTION_STATUSES = ['pending_payment', 'incomplete']
  const FAILED_SUBSCRIPTION_STATUSES = ['failed', 'rejected']
  const EXPIRED_SUBSCRIPTION_STATUSES = ['past_due', 'unpaid', 'expired', 'incomplete_expired']
  const CANCELLED_SUBSCRIPTION_STATUSES = ['cancelled', 'canceled', 'paused']
  const ACTIVE_BILLING_STATUSES = ['active']
  const PENDING_BILLING_STATUSES = ['pending_payment', 'payment_pending', 'pending', 'processing', 'open', 'requires_action']
  const FAILED_BILLING_STATUSES = ['failed', 'rejected']
  const EXPIRED_BILLING_STATUSES = ['past_due', 'expired', 'unpaid']
  const loggedInconsistentAircraftStates = new Set()

  function normalizeStatus(value = '') {
    return String(value || '')
      .trim()
      .toLowerCase()
  }

  function normalizePaymentStatus(value = '') {
    const normalized = normalizeStatus(value)

    if (!normalized) return ''
    if (['active', 'paid', 'approved', 'confirmed', 'current'].includes(normalized)) return 'active'
    if (['pending', 'pending_payment', 'payment_pending', 'open', 'requires_action', 'incomplete'].includes(normalized)) {
      return 'pending'
    }
    if (['verifying', 'processing', 'pending_review', 'requires_confirmation'].includes(normalized)) {
      return 'verifying'
    }
    if (['expired', 'past_due', 'unpaid', 'incomplete_expired'].includes(normalized)) return 'expired'
    if (['rejected', 'failed', 'declined'].includes(normalized)) return 'rejected'
    if (['suspended', 'cancelled', 'canceled', 'paused'].includes(normalized)) return 'suspended'

    return normalized
  }

  function getOperationalStatus(item = {}) {
    return normalizeStatus(item.status)
  }

  function getBillingStatus(item = {}) {
    return normalizeStatus(item.billingStatus || item.billing_status)
  }

  function getSubscriptionStatus(item = {}) {
    return normalizeStatus(item.subscriptionStatus || item.subscription_status)
  }

  function getPaymentStatus(item = {}) {
    return normalizePaymentStatus(
      item.paymentStatus ||
        item.payment_status ||
        item.billingState?.payment_status ||
        item.billing_state?.payment_status,
    )
  }

  function getSubscriptionEndsAt(item = {}) {
    return String(item.subscriptionEndsAt || item.subscription_ends_at || item.ends_at || '').trim()
  }

  function isHiddenOperationalStatus(status = '') {
    return ['hidden', 'archived'].includes(status)
  }

  function isUnderReviewOperationalStatus(status = '') {
    return ['under_review', 'pending_review', 'draft'].includes(status)
  }

  function isBlockedOperationalStatus(status = '') {
    return ['blocked', 'manual_block', 'out_of_service', 'inactive', 'suspended'].includes(status)
  }

  function formatSubscriptionEndsAtLabel(item = {}) {
    const rawEndsAt = getSubscriptionEndsAt(item)
    if (!rawEndsAt) return ''

    const label = formatDateTimeRange(rawEndsAt)
    return String(label || rawEndsAt).slice(0, 10)
  }

  function logInconsistentAircraftState(item = {}, reason = '') {
    if (!import.meta.env?.DEV) return

    const key = [
      reason,
      item.id ?? 'no-id',
      item.status ?? '',
      item.billing_status ?? item.billingStatus ?? '',
      item.subscription_status ?? item.subscriptionStatus ?? '',
      item.subscription_ends_at ?? item.subscriptionEndsAt ?? '',
    ].join('|')

    if (loggedInconsistentAircraftStates.has(key)) return
    loggedInconsistentAircraftStates.add(key)

    console.warn('[portalOperador] Estado de aeronave inconsistente detectado.', {
      reason,
      aircraftId: item.id,
      status: item.status,
      billing_status: item.billing_status ?? item.billingStatus,
      subscription_status: item.subscription_status ?? item.subscriptionStatus,
      subscription_ends_at: item.subscription_ends_at ?? item.subscriptionEndsAt,
    })
  }

  function getDateDiffInDays(value) {
    if (!value) return null
    const target = new Date(value)
    if (Number.isNaN(target.getTime())) return null

    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)

    const endDate = new Date(target)
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value).trim())) {
      endDate.setHours(23, 59, 59, 999)
    }

    return Math.ceil((endDate.getTime() - startOfToday.getTime()) / 86400000)
  }

  function collectAircraftBillingSignals(item = {}, relatedPayment = null) {
    const signals = [
      item.subscriptionStatus,
      item.subscription_status,
      item.billingStatus,
      item.billing_status,
      relatedPayment?.statusNormalized,
      relatedPayment?.status,
    ]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean)

    const hasExplicitBillingState = signals.length > 0
    const hasStripeTrace =
      Boolean(
        item.providerSubscriptionId ||
          item.provider_subscription_id ||
          item.providerCheckoutId ||
          item.provider_checkout_id ||
          relatedPayment?.providerSubscriptionId ||
          relatedPayment?.providerCheckoutId,
      ) ||
      Boolean(item.subscriptionEndsAt || item.subscription_ends_at || item.lastPaymentAt || item.last_payment_at)

    return {
      signals,
      hasExplicitBillingState,
      hasStripeTrace,
    }
  }

  function hasReusableCheckout(item = {}) {
    return Boolean(
      item.hasPendingCheckout ||
      item.canContinueCheckout ||
      item.providerCheckoutId ||
      item.provider_checkout_id ||
      item.checkoutSessionId ||
      item.checkout_session_id,
    )
  }

  function hasExpiredAircraftSubscription(item = {}) {
    const rawEndsAt = getSubscriptionEndsAt(item)

    if (!rawEndsAt) return false

    const normalizedEndsAt = /^\d{4}-\d{2}-\d{2}$/.test(rawEndsAt)
      ? `${rawEndsAt}T23:59:59`
      : rawEndsAt

    const endsAt = new Date(normalizedEndsAt)
    if (Number.isNaN(endsAt.getTime())) return false

    return endsAt.getTime() < Date.now()
  }

  function getAircraftUiState(item = {}) {
    const primaryBillingAction = normalizeStatus(item.primaryBillingAction || item.primary_action)
    const operationalStatus = getOperationalStatus(item)
    const billingStatus = getBillingStatus(item)
    const subscriptionStatus = getSubscriptionStatus(item)
    const paymentStatus = getPaymentStatus(item)
    const hasActiveSubscription = ACTIVE_SUBSCRIPTION_STATUSES.includes(subscriptionStatus)
    const hasPendingSubscription =
      !hasActiveSubscription &&
      (
        PENDING_SUBSCRIPTION_STATUSES.includes(subscriptionStatus) ||
        PENDING_BILLING_STATUSES.includes(billingStatus)
      )
    const hasFailedSubscription =
      !hasActiveSubscription &&
      (
        FAILED_SUBSCRIPTION_STATUSES.includes(subscriptionStatus) ||
        FAILED_BILLING_STATUSES.includes(billingStatus)
      )
    const hasExpiredSubscription =
      !hasActiveSubscription &&
      (
        EXPIRED_SUBSCRIPTION_STATUSES.includes(subscriptionStatus) ||
        EXPIRED_BILLING_STATUSES.includes(billingStatus)
      )
    const hasCancelledSubscription =
      !hasActiveSubscription && CANCELLED_SUBSCRIPTION_STATUSES.includes(subscriptionStatus)
    const hasActiveBilling = ACTIVE_BILLING_STATUSES.includes(billingStatus)
    const isExpectedInactiveOperationalState =
      isHiddenOperationalStatus(operationalStatus) ||
      isUnderReviewOperationalStatus(operationalStatus) ||
      isBlockedOperationalStatus(operationalStatus)

    if (item.canOperate === true && operationalStatus === 'active') {
      return {
        key: 'active',
        label: 'Activa',
        tone: 'success',
        action: 'payments',
        operationalEnabled: true,
        reasonMessage: 'Aeronave activa y con suscripcion vigente.',
      }
    }

    if (paymentStatus === 'active') {
      if (operationalStatus === 'active') {
        return {
          key: 'active',
          label: 'Activa',
          tone: 'success',
          action: 'payments',
          operationalEnabled: true,
          reasonMessage: 'Aeronave activa con pago confirmado en el estado canonico.',
        }
      }

      if (!isExpectedInactiveOperationalState) {
        logInconsistentAircraftState(item, 'payment_active_with_inactive_operation')
        return {
          key: 'sync_required',
          label: 'Pago activo',
          tone: 'info',
          action: 'sync',
          operationalEnabled: false,
          reasonMessage: 'El pago ya esta activo, pero el backend aun no marca la aeronave como operativa.',
        }
      }
    }

    if (paymentStatus === 'verifying') {
      return {
        key: 'pending_payment',
        label: 'Pago en verificacion',
        tone: 'info',
        action: 'sync',
        operationalEnabled: false,
        reasonMessage: 'El backend sigue verificando el pago de activacion.',
      }
    }

    if (paymentStatus === 'pending') {
      return {
        key: 'pending_payment',
        label: 'Pago pendiente',
        tone: 'warning',
        action: hasReusableCheckout(item) ? 'pay' : 'sync',
        operationalEnabled: false,
        reasonMessage: hasReusableCheckout(item)
          ? 'Existe un checkout pendiente para esta aeronave.'
          : 'El pago sigue pendiente de confirmacion.',
      }
    }

    if (paymentStatus === 'rejected') {
      return {
        key: 'payment_failed',
        label: 'Pago rechazado',
        tone: 'danger',
        action: 'pay',
        operationalEnabled: false,
        reasonMessage: 'El pago fue rechazado y necesita regularizacion.',
      }
    }

    if (paymentStatus === 'expired') {
      return {
        key: 'expired',
        label: 'Pago vencido',
        tone: 'danger',
        action: 'pay',
        operationalEnabled: false,
        reasonMessage: 'La mensualidad vencio. Realiza el pago para volver a activar la aeronave.',
      }
    }

    if (paymentStatus === 'suspended') {
      return {
        key: 'cancelled',
        label: 'Pago suspendido',
        tone: 'neutral',
        action: 'pay',
        operationalEnabled: false,
        reasonMessage: 'La aeronave esta suspendida comercialmente hasta regularizar su cobro.',
      }
    }

    if (primaryBillingAction === 'continue_payment') {
      return {
        key: 'pending_payment',
        label: 'Pago pendiente',
        tone: 'warning',
        action: 'pay',
        operationalEnabled: false,
        reasonMessage: 'Existe un checkout pendiente para esta aeronave.',
      }
    }

    if (primaryBillingAction === 'verify_payment') {
      return {
        key: 'sync_required',
        label: 'Pago en verificacion',
        tone: 'info',
        action: 'sync',
        operationalEnabled: false,
        reasonMessage: 'Stripe ya devolvio actividad y falta conciliar el estado oficial.',
      }
    }

    if (primaryBillingAction === 'regularize_payment') {
      return {
        key: hasExpiredSubscription ? 'expired' : 'payment_failed',
        label: hasExpiredSubscription ? 'Pago vencido' : 'Pago pendiente',
        tone: 'danger',
        action: 'pay',
        operationalEnabled: false,
        reasonMessage: 'La aeronave necesita regularizar su pago para volver a operar.',
      }
    }

    if (primaryBillingAction === 'activate') {
      return {
        key: 'inactive',
        label: 'Inactiva',
        tone: 'warning',
        action: 'pay',
        operationalEnabled: false,
        reasonMessage: 'La aeronave todavia no ha iniciado su pago de activacion.',
      }
    }

    if (isHiddenOperationalStatus(operationalStatus)) {
      return {
        key: 'hidden',
        label: 'Oculta',
        tone: 'info',
        action: 'payments',
        operationalEnabled: false,
        reasonMessage: 'Aeronave oculta manualmente.',
      }
    }

    if (isUnderReviewOperationalStatus(operationalStatus)) {
      return {
        key: 'under_review',
        label: 'En revision',
        tone: 'warning',
        action: 'none',
        operationalEnabled: false,
        reasonMessage: 'Aeronave pendiente de revision administrativa.',
      }
    }

    if (
      operationalStatus === 'active' &&
      (hasPendingSubscription || hasExpiredSubscription || hasCancelledSubscription)
    ) {
      logInconsistentAircraftState(item, 'active_with_non_active_subscription')
      return {
        key: 'sync_required',
        label: 'Sincronizacion requerida',
        tone: 'warning',
        action: 'sync',
        operationalEnabled: false,
        reasonMessage: 'El backend devolvio un estado comercial contradictorio para una aeronave activa.',
      }
    }

    if (operationalStatus === 'active' && hasActiveSubscription) {
      return {
        key: 'active',
        label: 'Activa',
        tone: 'success',
        action: 'payments',
        operationalEnabled: true,
        reasonMessage: 'Aeronave activa y con suscripcion vigente.',
      }
    }

    if (
      operationalStatus !== 'active' &&
      hasActiveSubscription &&
      hasActiveBilling &&
      !isExpectedInactiveOperationalState
    ) {
      logInconsistentAircraftState(item, 'inactive_with_active_subscription')
      return {
        key: 'sync_required',
        label: 'Pago confirmado',
        tone: 'info',
        action: 'sync',
        operationalEnabled: false,
        reasonMessage: 'La suscripcion figura activa, pero la aeronave no fue reactivada en el backend.',
      }
    }

    if (hasPendingSubscription) {
      return {
        key: 'pending_payment',
        label: 'Pago pendiente',
        tone: 'warning',
        action: hasReusableCheckout(item) ? 'pay' : 'sync',
        operationalEnabled: false,
        reasonMessage: hasReusableCheckout(item)
          ? 'Existe un checkout pendiente para esta aeronave.'
          : 'El pago sigue pendiente de confirmacion.',
      }
    }

    if (hasFailedSubscription) {
      return {
        key: 'payment_failed',
        label: 'Pago fallido',
        tone: 'danger',
        action: 'pay',
        operationalEnabled: false,
        reasonMessage: 'El pago no pudo confirmarse. Puedes intentarlo nuevamente.',
      }
    }

    if (hasExpiredSubscription) {
      return {
        key: 'expired',
        label: 'Pago vencido',
        tone: 'danger',
        action: 'pay',
        operationalEnabled: false,
        reasonMessage: 'Tu mensualidad vencio. Realiza el pago para volver a activar la aeronave.',
      }
    }

    if (hasCancelledSubscription) {
      return {
        key: 'cancelled',
        label: 'Suscripcion cancelada',
        tone: 'neutral',
        action: 'pay',
        operationalEnabled: false,
        reasonMessage: 'Esta aeronave esta deshabilitada porque su suscripcion no esta vigente.',
      }
    }

    return {
      key: 'inactive',
      label: 'Inactiva',
      tone: 'warning',
      action: 'pay',
      operationalEnabled: false,
      reasonMessage: 'Esta aeronave esta deshabilitada porque su suscripcion no esta vigente.',
    }
  }

  function resolveAircraftAutoRenewState(item = {}, relatedPayment = null) {
    const explicitFlag = [
      item.autoRenewEnabled,
      item.auto_renew_enabled,
      item.subscriptionAutoRenew,
      item.subscription_auto_renew,
      item.billingAutoRenew,
      item.billing_auto_renew,
      relatedPayment?.autoRenewEnabled,
      relatedPayment?.auto_renew_enabled,
    ].find((value) => value === true || value === false)

    const providerSubscriptionId =
      item.providerSubscriptionId ||
      item.provider_subscription_id ||
      relatedPayment?.providerSubscriptionId ||
      relatedPayment?.provider_subscription_id ||
      ''

    const paymentMethodReadyCandidate = [
      item.defaultPaymentMethodReady,
      item.default_payment_method_ready,
      item.paymentMethodReady,
      item.payment_method_ready,
      item.hasDefaultPaymentMethod,
      item.has_default_payment_method,
      relatedPayment?.defaultPaymentMethodReady,
      relatedPayment?.default_payment_method_ready,
    ].find((value) => value === true || value === false)

    const normalizedStatus = String(
      item.subscriptionStatus || item.billingStatus || item.status || '',
    )
      .trim()
      .toLowerCase()

    const autoRenewEnabled =
      explicitFlag === true ||
      (!hasExpiredAircraftSubscription(item) &&
        Boolean(providerSubscriptionId) &&
        ['active', 'paid', 'current', 'trialing'].includes(normalizedStatus))

    const paymentMethodReady =
      paymentMethodReadyCandidate === true ||
      (paymentMethodReadyCandidate !== false && Boolean(providerSubscriptionId))

    return {
      autoRenewEnabled,
      paymentMethodReady,
      providerSubscriptionId: providerSubscriptionId || '',
    }
  }

  function getAircraftRenewalMeta(item = {}, relatedPayment = null) {
    const { autoRenewEnabled, paymentMethodReady, providerSubscriptionId } = resolveAircraftAutoRenewState(
      item,
      relatedPayment,
    )
    const daysUntilExpiry = getDateDiffInDays(item.subscriptionEndsAt || item.subscription_ends_at || item.ends_at || '')

    if (daysUntilExpiry === null) {
      return {
        autoRenewEnabled,
        mode: autoRenewEnabled ? 'automatic' : 'manual',
        modeLabel: autoRenewEnabled ? 'Renovacion automatica' : 'Renovacion manual',
        reminderLabel: 'Sin vigencia visible',
        reminderDetail: autoRenewEnabled
          ? 'La suscripcion esta ligada a Stripe, pero no hay fecha visible de vigencia.'
          : 'Conviene revisar  antes de que la aeronave quede sin renovacion trazable.',
        tone: autoRenewEnabled ? 'info' : 'warning',
        daysUntilExpiry: null,
        isUrgent: !autoRenewEnabled,
        canRenewNow: !autoRenewEnabled,
        paymentMethodReady,
        providerSubscriptionId,
      }
    }

    if (daysUntilExpiry < 0) {
      return {
        autoRenewEnabled,
        mode: autoRenewEnabled ? 'automatic' : 'manual',
        modeLabel: autoRenewEnabled ? 'Cobro automatico vencido' : 'Renovacion manual vencida',
        reminderLabel: 'Suscripcion vencida',
        reminderDetail: autoRenewEnabled
          ? 'Stripe debio renovar esta suscripcion; conviene validar metodo de pago y webhook.'
          : 'La aeronave requiere un nuevo cobro para volver a activarse.',
        tone: 'danger',
        daysUntilExpiry,
        isUrgent: true,
        canRenewNow: true,
        paymentMethodReady,
        providerSubscriptionId,
      }
    }

    if (autoRenewEnabled) {
      if (!paymentMethodReady) {
        return {
          autoRenewEnabled,
          mode: 'automatic',
          modeLabel: 'Autopago con alerta',
          reminderLabel: `Vence en ${daysUntilExpiry} dia(s)`,
          reminderDetail: 'Hay suscripcion Stripe, pero no hay metodo de pago confirmado para renovar con seguridad.',
          tone: daysUntilExpiry <= 7 ? 'danger' : 'warning',
          daysUntilExpiry,
          isUrgent: true,
          canRenewNow: true,
          paymentMethodReady,
          providerSubscriptionId,
        }
      }

      return {
        autoRenewEnabled,
        mode: 'automatic',
        modeLabel: 'Renovacion automatica',
        reminderLabel:
          daysUntilExpiry <= 0
            ? 'Renovacion en curso'
            : `Cobro automatico en ${daysUntilExpiry} dia(s)`,
        reminderDetail:
          daysUntilExpiry <= 7
            ? 'La aeronave debe renovarse automaticamente en Stripe. Solo monitorea el resultado del cobro.'
            : 'La renovacion esta ligada a Stripe y no requiere accion manual por ahora.',
        tone: daysUntilExpiry <= 7 ? 'info' : 'success',
        daysUntilExpiry,
        isUrgent: false,
        canRenewNow: false,
        paymentMethodReady,
        providerSubscriptionId,
      }
    }

    if (daysUntilExpiry <= 3) {
      return {
        autoRenewEnabled,
        mode: 'manual',
        modeLabel: 'Renovacion manual',
        reminderLabel: `Vence en ${daysUntilExpiry} dia(s)`,
        reminderDetail: 'Se recomienda pagar ahora para evitar que la aeronave salga de visibilidad.',
        tone: 'danger',
        daysUntilExpiry,
        isUrgent: true,
        canRenewNow: true,
        paymentMethodReady,
        providerSubscriptionId,
      }
    }

    if (daysUntilExpiry <= 15) {
      return {
        autoRenewEnabled,
        mode: 'manual',
        modeLabel: 'Renovacion manual',
        reminderLabel: `Renovar en los proximos ${daysUntilExpiry} dia(s)`,
        reminderDetail: 'La suscripcion sigue activa, pero ya conviene lanzar el cobro anticipado.',
        tone: 'warning',
        daysUntilExpiry,
        isUrgent: true,
        canRenewNow: true,
        paymentMethodReady,
        providerSubscriptionId,
      }
    }

    return {
      autoRenewEnabled,
      mode: 'manual',
      modeLabel: 'Renovacion manual',
      reminderLabel: `Vigente por ${daysUntilExpiry} dia(s)`,
      reminderDetail: 'No hay autopago ligado. La renovacion tendra que dispararse manualmente antes del vencimiento.',
      tone: 'info',
      daysUntilExpiry,
      isUrgent: false,
      canRenewNow: daysUntilExpiry <= 30,
      paymentMethodReady,
      providerSubscriptionId,
    }
  }

  function getAircraftBillingStatusMeta(item = {}) {
    const { hasExplicitBillingState, hasStripeTrace } = collectAircraftBillingSignals(item)
    const uiState = getAircraftUiState(item)
    const formattedEndsAt = formatSubscriptionEndsAtLabel(item)

    if (uiState.key === 'active') {
      return {
        label: uiState.label,
        tone: uiState.tone,
        detail: formattedEndsAt
          ? `Vigente hasta: ${formattedEndsAt}`
          : 'La aeronave ya esta visible en el sistema.',
        cta: 'Ver pagos',
        action: uiState.action,
        ready: true,
        code: 'billing_active',
        reasonMessage: uiState.reasonMessage,
      }
    }

    if (uiState.key === 'pending_payment') {
      return {
        label: uiState.label,
        tone: uiState.tone,
        detail: hasStripeTrace
          ? 'Stripe ya devolvio actividad para esta aeronave. Estamos esperando que el backend confirme la activacion final.'
          : 'La mensualidad se esta sincronizando. Actualiza el estado en unos segundos.',
        cta: uiState.action === 'pay' ? 'Continuar con el pago' : 'Verificar pago',
        action: uiState.action,
        ready: false,
        code: 'billing_syncing',
        reasonMessage: uiState.reasonMessage,
      }
    }

    if (uiState.key === 'expired') {
      return {
        label: uiState.label,
        tone: uiState.tone,
        detail: formattedEndsAt
          ? `Vencio el: ${formattedEndsAt}`
          : 'La aeronave no esta visible actualmente. Renueva la mensualidad para reactivarla.',
        cta: 'Regularizar pago',
        action: uiState.action,
        ready: false,
        code: 'billing_expired',
        reasonMessage: uiState.reasonMessage,
      }
    }

    if (uiState.key === 'cancelled') {
      return {
        label: uiState.label,
        tone: 'neutral',
        detail: 'La suscripcion fue cancelada. Necesita un nuevo cobro para reactivarse.',
        cta: 'Regularizar pago',
        action: uiState.action,
        ready: false,
        code: 'billing_cancelled',
        reasonMessage: uiState.reasonMessage,
      }
    }

    if (uiState.key === 'payment_failed') {
      return {
        label: uiState.label,
        tone: uiState.tone,
        detail: 'El cobro anterior no se pudo completar o fue rechazado.',
        cta: 'Regularizar pago',
        action: uiState.action,
        ready: false,
        code: 'billing_failed',
        reasonMessage: uiState.reasonMessage,
      }
    }

    if (uiState.key === 'sync_required') {
      return {
        label: uiState.label,
        tone: uiState.tone,
        detail: 'Pago confirmado. El backend esta actualizando la activacion de la aeronave.',
        cta: 'Verificar pago',
        action: uiState.action,
        ready: false,
        code: 'billing_sync_required',
        reasonMessage: uiState.reasonMessage,
      }
    }

    if (uiState.key === 'hidden') {
      return {
        label: uiState.label,
        tone: uiState.tone,
        detail: 'La aeronave esta oculta en el portal y no participa en matching comercial.',
        cta: 'Ver pagos',
        action: uiState.action,
        ready: false,
        code: 'billing_hidden',
        reasonMessage: uiState.reasonMessage,
      }
    }

    if (uiState.key === 'under_review') {
      return {
        label: uiState.label,
        tone: uiState.tone,
        detail: 'La aeronave sigue en revision administrativa y no esta habilitada comercialmente.',
        cta: 'Pendiente de validacion',
        action: uiState.action,
        ready: false,
        code: 'billing_under_review',
        reasonMessage: uiState.reasonMessage,
      }
    }

    if (!hasExplicitBillingState && !hasStripeTrace) {
      return {
        label: uiState.label,
        tone: uiState.tone,
        detail: 'La aeronave fue registrada correctamente y queda pendiente de activacion mensual.',
        cta: 'Activar aeronave',
        action: 'pay',
        ready: false,
        code: 'billing_missing_state',
        reasonMessage: uiState.reasonMessage,
      }
    }

    return {
      label: uiState.label,
      tone: uiState.tone,
      detail: 'Esta aeronave esta deshabilitada porque su suscripcion no esta vigente.',
      cta: 'Activar aeronave',
      action: 'pay',
      ready: false,
      code: 'billing_inactive',
      reasonMessage: uiState.reasonMessage,
    }
  }

  function isAircraftBillingActive(item = {}) {
    return getAircraftUiState(item).key === 'active'
  }

  function shouldPollAircraftBillingStatus(item = {}) {
    const paymentStatus = getPaymentStatus(item)
    const subscriptionStatus = getSubscriptionStatus(item)
    const billingStatus = getBillingStatus(item)

    if (['pending', 'verifying'].includes(paymentStatus)) return true
    if (paymentStatus === 'active') return false

    return (
      ['trialing', ...PENDING_SUBSCRIPTION_STATUSES].includes(subscriptionStatus) ||
      PENDING_BILLING_STATUSES.includes(billingStatus)
    )
  }

  function normalizePayment(raw = {}, index = 0, parseRequestAmount) {
    return normalizePaymentEntry(raw, index, {
      parseRequestAmount,
      compactBillingReference,
    })
  }

  return {
    compactBillingReference,
    getAircraftUiState,
    getAircraftBillingStatusMeta,
    getAircraftRenewalMeta,
    getDateDiffInDays,
    hasExpiredAircraftSubscription,
    isAircraftBillingActive,
    normalizePayment,
    resolveAircraftAutoRenewState,
    shouldPollAircraftBillingStatus,
  }
}
