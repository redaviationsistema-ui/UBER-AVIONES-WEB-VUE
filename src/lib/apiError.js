export function normalizeApiError(error = {}) {
  const status = Number(error?.status || error?.response?.status || 0)
  const validationErrors = error?.payload?.errors || error?.response?.data?.errors || {}
  const backendMessage = String(error?.payload?.message || error?.response?.data?.message || error?.message || '').trim()
  const byStatus = {
    401: 'Tu sesión expiró. Inicia sesión nuevamente.', 403: 'No tienes permiso para realizar esta acción.',
    404: 'No se encontró el recurso solicitado.', 409: 'La disponibilidad o el estado cambió. Actualiza la información e inténtalo de nuevo.',
    422: 'Revisa los datos capturados.', 429: 'Hay demasiados intentos. Espera un momento e inténtalo de nuevo.',
    500: 'El servicio presentó un error interno. Inténtalo más tarde.',
  }
  const isTimeout = /timeout|tiempo de espera|tard[oó] demasiado/i.test(backendMessage)
  const isNetwork = !status && /network|fetch|conectar|conexi[oó]n/i.test(backendMessage)
  return {
    status, code: isTimeout ? 'timeout' : isNetwork ? 'network' : status ? `http_${status}` : 'unknown',
    message: backendMessage || (isNetwork ? 'No fue posible conectar con el servicio.' : byStatus[status]) || 'No fue posible completar la operación.',
    validationErrors, retryable: isTimeout || isNetwork || status === 429 || status >= 500,
  }
}
