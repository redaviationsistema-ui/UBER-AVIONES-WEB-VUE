import { computed } from 'vue'

export function useClientPortalPayments({
  auth,
  buildCommercialAccessUiState,
  commercialAccessCheckoutReturnMode,
  commercialAccessSnapshot,
  isAssistedReservationPayment,
  isCommercialAccessExpired,
  isStripeReservationPayment,
  normalizeCardBrand,
  paymentBreakdownCurrency,
  paymentCardBrand,
  paymentMethodCards,
  paymentReadyForCheckout,
  resolveCommercialAccessExpiryMeta,
  resolveReservationPaymentMethod,
  selectedPaymentMethod,
  selectedReservation,
  selectedReservationFrontendState,
}) {
  const paymentHeroTitle = computed(() => {
    if (commercialAccessCheckoutReturnMode.value) {
      const accessSource = auth.access?.commercial_access || auth.access
      const state = buildCommercialAccessUiState(accessSource)
      if (state.isSuspended) return 'Reactiva tu suscripción'
      if (state.isPastDue) return 'Actualiza tu método de pago'
      if (isCommercialAccessExpired(accessSource)) return 'Reactiva tu acceso comercial'

      const { daysUntil } = resolveCommercialAccessExpiryMeta(accessSource)
      if ([0, 1, 3, 7].includes(daysUntil)) return 'Renueva tu acceso comercial'

      return 'Activa tu acceso comercial'
    }
    if (!selectedReservation.value) return 'Checkout seguro'
    return paymentReadyForCheckout.value ? 'Configura tu pago' : 'Pago bloqueado hasta firma'
  })

  const paymentHeroCopy = computed(() => {
    if (commercialAccessCheckoutReturnMode.value) {
      const accessSource = auth.access?.commercial_access || auth.access
      const state = buildCommercialAccessUiState(accessSource)

      if (state.isSuspended) {
        return 'Tu suscripción quedó suspendida. Usa esta cabina de pago para actualizar el método y reactivar el acceso comercial.'
      }

      if (state.isPastDue) {
        return 'El cobro automático falló y tu cuenta está en periodo de gracia. Actualiza el método ahora para evitar el bloqueo.'
      }

      if (isCommercialAccessExpired(accessSource)) {
        return 'Usa esta misma cabina de pago para reactivar tu acceso comercial y volver a cotizar vuelos privados.'
      }

      const { daysUntil } = resolveCommercialAccessExpiryMeta(accessSource)
      if ([0, 1, 3, 7].includes(daysUntil)) {
        return 'Usa esta misma cabina de pago para renovar tu acceso comercial antes de que venza y seguir operando sin interrupciones.'
      }

      return 'Usa esta misma cabina de pago para habilitar tu acceso comercial y seguir cotizando vuelos privados.'
    }
    if (selectedReservation.value) {
      if (!paymentReadyForCheckout.value) {
        return (
          selectedReservationFrontendState.value.status_message ||
          'Primero necesitamos confirmar la firma del contrato antes de habilitar el pago.'
        )
      }
      return 'Confirma el metodo, revisa los datos de contacto y autoriza el cargo de tu reserva.'
    }
    return 'Pago protegido con Stripe o con validacion asistida del equipo administrativo.'
  })

  const paymentFeatureList = computed(() =>
    commercialAccessCheckoutReturnMode.value
      ? [
          {
            icon: 'shield',
            title: 'Cuenta comercial protegida',
            copy: 'Renueva o reactiva tu acceso comercial dentro del mismo portal del cliente.',
          },
          {
            icon: 'route',
            title: 'Operacion continua',
            copy: 'Despues de completar el pago podras seguir cotizando, reservando y pagando vuelos.',
          },
        ]
      : [
          {
            icon: 'shield',
            title: 'Pago protegido',
            copy: 'Cobro seguro con trazabilidad operativa en tiempo real.',
          },
          {
            icon: 'route',
            title: 'Reserva priorizada',
            copy: 'Resumen final antes de liberar la operacion al proveedor.',
          },
        ],
  )

  const commercialAccessCheckoutFacts = computed(() => {
    const state = buildCommercialAccessUiState(auth.access?.commercial_access || auth.access)
    const accessSource = auth.access?.commercial_access || auth.access
    const latestPayment = commercialAccessSnapshot.value.latestPayment
    const paymentPreview = commercialAccessSnapshot.value.paymentPreview
    const expiryMeta = resolveCommercialAccessExpiryMeta(accessSource)
    const paymentBrand = normalizeCardBrand(latestPayment?.card_brand || '')
    const paymentLast4 = String(latestPayment?.card_last4 || '').trim()
    const paymentMethod = paymentBrand
      ? `${paymentBrand}${paymentLast4 ? ` terminacion ${paymentLast4}` : ''}`
      : state.hasPaidAccess
        ? 'Tarjeta registrada'
        : 'Stripe Checkout seguro'

    const accessStatusLabel = state.isSuspended
      ? 'Suspendido'
      : state.isPastDue
        ? 'Past due · gracia activa'
        : isCommercialAccessExpired(accessSource)
          ? 'Vencido'
          : state.hasPaidAccess
            ? 'Activo'
            : state.status === 'payment_pending'
              ? 'Pago en validacion'
              : state.status === 'payment_failed'
                ? 'Pago rechazado'
                : state.freeQuotesUsed >= state.freeQuoteLimit
                  ? 'Prueba consumida'
                  : 'Prueba disponible'

    return [
      {
        label: 'Estado de acceso',
        value: accessStatusLabel,
        tone: state.isSuspended ? 'danger' : state.hasPaidAccess ? 'success' : 'warning',
      },
      {
        label: 'Vigencia actual',
        value: expiryMeta.label || 'Por confirmar',
        tone: 'premium',
      },
      {
        label: 'Metodo registrado',
        value: paymentMethod,
        tone: 'neutral',
      },
      {
        label: 'Monto mensual',
        value:
          paymentPreview?.total_amount
            ? new Intl.NumberFormat('es-MX', {
                style: 'currency',
                currency: String(paymentBreakdownCurrency.value || 'USD').toUpperCase(),
                maximumFractionDigits: 2,
                minimumFractionDigits: 2,
              }).format(Number(paymentPreview.total_amount || 0))
            : 'Monto por confirmar',
        tone: 'premium',
      },
      {
        label: 'Ultimo pago',
        value: latestPayment?.paid_at || 'Sin cargo confirmado',
        tone: 'neutral',
      },
    ]
  })

  const paymentMethodSummaryLabel = computed(() => {
    if (commercialAccessCheckoutReturnMode.value) {
      const latestPayment = commercialAccessSnapshot.value.latestPayment
      const brand = normalizeCardBrand(latestPayment?.card_brand || '')
      const last4 = String(latestPayment?.card_last4 || '').trim()

      if (brand) return `${brand}${last4 ? ` terminacion ${last4}` : ''}`
      if (isAssistedReservationPayment.value) return 'Pago en efectivo'
      return 'Stripe Checkout seguro'
    }

    if (isAssistedReservationPayment.value) {
      return (
        paymentMethodCards.find((method) => method.id === 'assisted')?.label ||
        'Pago en efectivo'
      )
    }

    const persistedBrand =
      normalizeCardBrand(selectedReservation.value?.payment_order?.brand) ||
      normalizeCardBrand(selectedReservation.value?.payment_order?.card_brand) ||
      normalizeCardBrand(selectedReservation.value?.payment_brand) ||
      normalizeCardBrand(selectedReservation.value?.card_brand)

    const detectedBrand = normalizeCardBrand(paymentCardBrand.value)
    const brandLabel = detectedBrand || persistedBrand

    if (brandLabel) return brandLabel

    if (isStripeReservationPayment.value) {
      return paymentMethodCards.find((method) => method.id === 'stripe')?.label || 'Stripe'
    }

    const persistedMethod = resolveReservationPaymentMethod(selectedReservation.value)
    if (persistedMethod === 'assisted_cash') return 'Pago en efectivo'
    if (persistedMethod === 'stripe') {
      return paymentMethodCards.find((method) => method.id === 'stripe')?.label || 'Stripe'
    }

    return (
      paymentMethodCards.find((method) => method.id === selectedPaymentMethod.value)?.label || ''
    )
  })

  return {
    commercialAccessCheckoutFacts,
    paymentFeatureList,
    paymentHeroCopy,
    paymentHeroTitle,
    paymentMethodSummaryLabel,
  }
}
