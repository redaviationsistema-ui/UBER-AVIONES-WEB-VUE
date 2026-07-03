/*----------------------------------------------------------------------------------------------*/
// VISTA DE UTILIDADES PARA EL PORTAL DE OPERADOR
/*----------------------------------------------------------------------------------------------*/  

import { compactBillingReference, normalizePayment as normalizePaymentEntry } from './operatorPortal.paymentUtils'

export function createOperatorPortalBillingDomain(ctx = {}) {
  const {
    formatCurrency,
    formatDateTimeRange,
    providerAircraftPlanAmount,
  } = ctx

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

  function hasExpiredAircraftSubscription(item = {}) {
    const rawEndsAt = String(item.subscriptionEndsAt || item.subscription_ends_at || item.ends_at || '')
      .trim()

    if (!rawEndsAt) return false

    const normalizedEndsAt = /^\d{4}-\d{2}-\d{2}$/.test(rawEndsAt)
      ? `${rawEndsAt}T23:59:59`
      : rawEndsAt

    const endsAt = new Date(normalizedEndsAt)
    if (Number.isNaN(endsAt.getTime())) return false

    return endsAt.getTime() < Date.now()
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
    const normalizedStatus = String(
      item.subscriptionStatus || item.billingStatus || item.status || '',
    )
      .trim()
      .toLowerCase()

    if (
      hasExpiredAircraftSubscription(item) &&
      !['cancelled', 'canceled'].includes(normalizedStatus)
    ) {
      return {
        label: 'Pago vencido',
        tone: 'danger',
        detail: 'La mensualidad expiro. La aeronave queda desactivada hasta confirmar un nuevo pago.',
        cta: providerAircraftPlanAmount.value
          ? `Renovar por ${formatCurrency(providerAircraftPlanAmount.value)}`
          : 'Renovar mensualidad',
        action: 'activate',
      }
    }

    if (['active', 'paid', 'current'].includes(normalizedStatus)) {
      return {
        label: 'Activa',
        tone: 'success',
        detail: item.subscriptionEndsAt
          ? `Visible en el sistema hasta ${formatDateTimeRange(item.subscriptionEndsAt)}.`
          : 'La aeronave ya esta visible en el sistema.',
        cta: 'Ver pagos',
        action: 'payments',
      }
    }

    if (['past_due', 'expired'].includes(normalizedStatus)) {
      return {
        label: 'Pago vencido',
        tone: 'danger',
        detail: 'La aeronave no esta visible actualmente. Renueva la mensualidad para reactivarla.',
        cta: providerAircraftPlanAmount.value
          ? `Renovar por ${formatCurrency(providerAircraftPlanAmount.value)}`
          : 'Renovar mensualidad',
        action: 'activate',
      }
    }

    if (['cancelled', 'canceled'].includes(normalizedStatus)) {
      return {
        label: 'Cancelada',
        tone: 'danger',
        detail: 'La suscripcion fue cancelada. Necesita un nuevo cobro para reactivarse.',
        cta: providerAircraftPlanAmount.value
          ? `Reactivar por ${formatCurrency(providerAircraftPlanAmount.value)}`
          : 'Reactivar aeronave',
        action: 'activate',
      }
    }

    if (['inactive'].includes(normalizedStatus)) {
      return {
        label: 'Inactiva',
        tone: 'warning',
        detail: 'La aeronave sigue registrada, pero todavia no esta visible para clientes.',
        cta: providerAircraftPlanAmount.value
          ? `Activar por ${formatCurrency(providerAircraftPlanAmount.value)}`
          : 'Activar aeronave',
        action: 'activate',
      }
    }

    return {
      label: 'Pendiente de pago',
      tone: 'warning',
      detail: 'La aeronave fue registrada correctamente y queda pendiente de activacion mensual.',
      cta: providerAircraftPlanAmount.value
        ? `Pagar y activar por ${formatCurrency(providerAircraftPlanAmount.value)}`
        : 'Pagar y activar aeronave',
      action: 'activate',
    }
  }

  function isAircraftBillingActive(item = {}) {
    return getAircraftBillingStatusMeta(item).action !== 'activate'
  }

  function normalizePayment(raw = {}, index = 0, parseRequestAmount) {
    return normalizePaymentEntry(raw, index, {
      parseRequestAmount,
      compactBillingReference,
    })
  }

  return {
    compactBillingReference,
    getAircraftBillingStatusMeta,
    getAircraftRenewalMeta,
    getDateDiffInDays,
    hasExpiredAircraftSubscription,
    isAircraftBillingActive,
    normalizePayment,
    resolveAircraftAutoRenewState,
  }
}
