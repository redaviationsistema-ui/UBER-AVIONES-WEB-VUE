function toNumber(value) {
  const parsed = Number(String(value ?? '').replace(/[^\d.-]+/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function formatNumber(value) {
  return new Intl.NumberFormat('es-MX').format(toNumber(value))
}

function formatCurrency(value, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: String(currency || 'MXN').toUpperCase(),
    maximumFractionDigits: 0,
  }).format(toNumber(value))
}

function formatPercent(value) {
  const numeric = toNumber(value)
  return `${numeric.toFixed(0)}%`
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '')
}

function normalizeSeriesPoints(points = []) {
  return (Array.isArray(points) ? points : [])
    .map((item, index) => ({
      label: item?.label || item?.period || item?.date || `Punto ${index + 1}`,
      value: item?.value ?? item?.total ?? item?.count ?? 0,
    }))
    .filter((item) => item.label)
}

export function normalizeAdminDashboardPayload(payload = {}) {
  const kpis = payload?.kpis && typeof payload.kpis === 'object' ? payload.kpis : {}
  const metrics = payload?.metrics && typeof payload.metrics === 'object' ? payload.metrics : {}
  const totals = payload?.totals && typeof payload.totals === 'object' ? payload.totals : {}
  const series = payload?.series && typeof payload.series === 'object' ? payload.series : {}
  const activity = Array.isArray(payload?.recent_activity) ? payload.recent_activity : []
  const currency = String(firstDefined(payload?.currency, totals?.currency, metrics?.currency, 'MXN'))

  const chargedRevenue = firstDefined(metrics.gross_revenue, totals.gross_revenue, kpis.revenue, 0)
  const refunds = firstDefined(metrics.refunds, totals.refunds, 0)
  const netRevenue = firstDefined(metrics.net_revenue, totals.net_revenue, chargedRevenue - refunds)
  const quotesIssued = firstDefined(metrics.quotes_issued, totals.quotes_issued, kpis.solicitudes, 0)
  const confirmedReservations = firstDefined(
    metrics.confirmed_reservations,
    totals.confirmed_reservations,
    kpis.confirmed_reservations,
    0,
  )
  const paymentsPending = firstDefined(metrics.payments_pending, totals.payments_pending, 0)
  const paymentsFailed = firstDefined(metrics.payments_failed, totals.payments_failed, 0)
  const activeAircraft = firstDefined(metrics.active_aircraft, totals.active_aircraft, kpis.aeronaves_activas, 0)
  const activeProviders = firstDefined(
    metrics.active_providers,
    totals.active_providers,
    kpis.proveedores_activos,
    kpis.operadores,
    0,
  )
  const activeSubscriptions = firstDefined(
    metrics.active_subscriptions,
    totals.active_subscriptions,
    kpis.suscripciones_activas,
    0,
  )
  const expiredSubscriptions = firstDefined(
    metrics.expired_subscriptions,
    totals.expired_subscriptions,
    0,
  )
  const upcomingFlights = firstDefined(metrics.upcoming_flights, totals.upcoming_flights, 0)

  const cards = [
    {
      label: 'Ingresos netos',
      value: formatCurrency(netRevenue, currency),
      detail: `Cobrado ${formatCurrency(chargedRevenue, currency)} menos reembolsos ${formatCurrency(refunds, currency)}.`,
    },
    {
      label: 'Cotizaciones emitidas',
      value: formatNumber(quotesIssued),
      detail: 'Total de cotizaciones devueltas por el sistemas.',
    },
    {
      label: 'Reservas confirmadas',
      value: formatNumber(confirmedReservations),
      detail: 'Reservas con estado confirmado en backend.',
    },
    {
      label: 'Pagos pendientes',
      value: formatNumber(paymentsPending),
      detail: 'Cobros por conciliar o completar.',
    },
    {
      label: 'Aeronaves activas',
      value: formatNumber(activeAircraft),
      detail: 'Flota activa autorizada para operación.',
    },
    {
      label: 'Vuelos próximos',
      value: formatNumber(upcomingFlights),
      detail: 'Salidas próximas dentro del rango reportado.',
    },
  ]

  const analytics = [
    {
      label: 'Reembolsos',
      value: formatCurrency(refunds, currency),
      score: Math.max(0, Math.min(100, 100 - toNumber(refunds))),
    },
    {
      label: 'Pagos fallidos',
      value: formatNumber(paymentsFailed),
      score: Math.max(0, 100 - toNumber(paymentsFailed) * 5),
    },
    {
      label: 'Proveedores activos',
      value: formatNumber(activeProviders),
      score: Math.min(100, toNumber(activeProviders) * 5),
    },
    {
      label: 'Suscripciones activas',
      value: formatNumber(activeSubscriptions),
      score: Math.min(100, toNumber(activeSubscriptions) * 5),
    },
    {
      label: 'Suscripciones vencidas',
      value: formatNumber(expiredSubscriptions),
      score: Math.max(0, 100 - toNumber(expiredSubscriptions) * 10),
    },
    {
      label: 'Ingreso por periodo',
      value: normalizeSeriesPoints(series.revenue).at(-1)?.value
        ? formatCurrency(normalizeSeriesPoints(series.revenue).at(-1)?.value, currency)
        : formatCurrency(netRevenue, currency),
      score: Math.min(100, Math.round(toNumber(netRevenue) / 1000)),
    },
  ]

  const normalizedActivity = activity
    .map((item, index) => ({
      id: item?.id || `activity-${index + 1}`,
      date: item?.date || item?.created_at || item?.timestamp || 'Reciente',
      title: item?.title || item?.action || item?.label || 'Actividad administrativa',
      detail: item?.detail || item?.description || item?.message || 'Sin detalle adicional.',
    }))
    .slice(0, 6)

  return {
    currency,
    cards,
    analytics,
    recentActivity: normalizedActivity,
    series: {
      revenue: normalizeSeriesPoints(series.revenue),
      reservations: normalizeSeriesPoints(series.reservations_by_status),
      flights: normalizeSeriesPoints(series.flights_by_status),
    },
    raw: payload,
  }
}

export function buildAdminDashboardEmptyState() {
  return {
    currency: 'MXN',
    cards: [],
    analytics: [],
    recentActivity: [],
    series: {
      revenue: [],
      reservations: [],
      flights: [],
    },
    raw: {},
  }
}

export function formatAdminCell(value, options = {}) {
  if (value === null || value === undefined || value === '') return 'Sin dato'

  if (options.kind === 'currency') {
    return formatCurrency(value, options.currency || 'MXN')
  }

  if (options.kind === 'number') {
    return formatNumber(value)
  }

  if (options.kind === 'percent') {
    return formatPercent(value)
  }

  if (options.kind === 'date') {
    const raw = String(value || '').trim()
    if (!raw) return 'Sin dato'
    const parsed = new Date(raw)
    if (Number.isNaN(parsed.getTime())) return raw

    return new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'medium',
      timeStyle: options.withTime ? 'short' : undefined,
    }).format(parsed)
  }

  return String(value)
}
