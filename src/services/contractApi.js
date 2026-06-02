import { api } from '../lib/api'
import { buildFrontendUrl } from '../lib/frontendUrl'

const configuredGeneratePath = String(
  import.meta.env.VITE_CLIENT_CONTRACT_GENERATE_PATH ||
    import.meta.env.VITE_CONTRACT_GENERATE_PATH ||
    '',
).trim()
const configuredStatusPath = String(
  import.meta.env.VITE_CLIENT_CONTRACT_STATUS_PATH ||
    import.meta.env.VITE_CONTRACT_STATUS_PATH ||
    '',
).trim()
const configuredSendPath = String(
  import.meta.env.VITE_CLIENT_CONTRACT_SEND_PATH || import.meta.env.VITE_CONTRACT_SEND_PATH || '',
).trim()
const configuredSignedPdfPath = String(
  import.meta.env.VITE_CLIENT_CONTRACT_SIGNED_PDF_PATH ||
    import.meta.env.VITE_CONTRACT_SIGNED_PDF_PATH ||
    '',
).trim()
const configuredResultRoute = String(
  import.meta.env.VITE_CLIENT_CONTRACT_RESULT_ROUTE || '/cliente/contrato/',
).trim()

const CONTRACT_GENERATE_PATHS = [
  ...new Set(
    [
      configuredGeneratePath,
      '/cliente/reservas/:id/contrato/docusign',
      '/client/reservations/:id/contract/docusign',
      '/cliente/reservas/:id/contrato/firmar',
      '/client/reservations/:id/contract/sign',
      '/contracts/generate-and-send',
    ].filter(Boolean),
  ),
]
const CONTRACT_STATUS_PATHS = [
  ...new Set(
    [
      configuredStatusPath,
      '/cliente/contratos/:id/estado',
      '/client/contracts/:id/status',
      '/contracts/:id/status',
    ].filter(Boolean),
  ),
]
const CONTRACT_SEND_PATHS = [
  ...new Set(
    [
      configuredSendPath,
      '/contracts/:id/docusign/send',
      '/cliente/contratos/:id/docusign/enviar',
      '/client/contracts/:id/docusign/send',
    ].filter(Boolean),
  ),
]
const CONTRACT_SIGNED_PDF_PATHS = [
  ...new Set(
    [
      configuredSignedPdfPath,
      '/cliente/contratos/:id/pdf-firmado',
      '/client/contracts/:id/signed-pdf',
      '/contracts/:id/signed-pdf',
    ].filter(Boolean),
  ),
]
const CONTRACT_STORAGE_PREFIX = 'red_aviation_client_contract_v1'

function canUseSessionStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

function replaceRouteParam(path, contractId) {
  return String(path || '').replace(':id', encodeURIComponent(String(contractId || '').trim()))
}

function buildStorageKeys({ reservationId = '', contractId = '' } = {}) {
  const normalizedReservationId = String(reservationId || '').trim()
  const normalizedContractId = String(contractId || '').trim()

  return [
    normalizedReservationId
      ? `${CONTRACT_STORAGE_PREFIX}:reservation:${normalizedReservationId}`
      : '',
    normalizedContractId ? `${CONTRACT_STORAGE_PREFIX}:contract:${normalizedContractId}` : '',
  ].filter(Boolean)
}

function safeParseStorage(value = '') {
  if (!value) return null

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function buildContractResultUrl({ contractId = '', reservationId = '', flightRequestId = '' } = {}) {
  return buildFrontendUrl(configuredResultRoute || '/cliente/contrato/', {
    contract_id: contractId ? String(contractId).trim() : '',
    reservation_id: reservationId ? String(reservationId).trim() : '',
    flight_request_id: flightRequestId ? String(flightRequestId).trim() : '',
  })
}

function resolveReservationIdForRoute(payload = {}) {
  return String(
    payload?.reservation_id || payload?.booking_id || payload?.id || payload?.reservation || '',
  ).trim()
}

export async function generateAndSendContract(payload = {}, options = {}) {
  const reservationId = resolveReservationIdForRoute(payload)
  let lastError = null

  for (const path of CONTRACT_GENERATE_PATHS) {
    try {
      const resolvedPath =
        path.includes(':id') && reservationId ? replaceRouteParam(path, reservationId) : path
      return await api.post(resolvedPath, payload, options)
    } catch (error) {
      lastError = error

      const message = String(error?.payload?.message || error?.message || '').toLowerCase()
      const missingRoute =
        Number(error?.status || 0) === 404 ||
        message.includes('could not be found') ||
        message.includes('not found')

      if (missingRoute) {
        continue
      }

      throw error
    }
  }

  if (lastError) {
    throw lastError
  }

  throw new Error('No encontramos una ruta valida para generar el contrato.')
}

export async function getContractStatus(contractId, options = {}) {
  const normalizedContractId = String(contractId || '').trim()

  if (!normalizedContractId) {
    throw new Error('No encontramos el identificador del contrato para consultar su estado.')
  }

  let lastError = null

  for (const path of CONTRACT_STATUS_PATHS) {
    try {
      return await api.get(replaceRouteParam(path, normalizedContractId), options)
    } catch (error) {
      lastError = error
      const message = String(error?.payload?.message || error?.message || '').toLowerCase()
      const missingRoute =
        Number(error?.status || 0) === 404 ||
        message.includes('could not be found') ||
        message.includes('not found')

      if (missingRoute) continue
      throw error
    }
  }

  if (lastError) throw lastError

  throw new Error('No encontramos una ruta valida para consultar el estado del contrato.')
}

export async function sendContractToDocuSign(contractId, options = {}) {
  const normalizedContractId = String(contractId || '').trim()

  if (!normalizedContractId) {
    throw new Error('No encontramos el identificador del contrato para enviarlo a DocuSign.')
  }

  let lastError = null

  for (const path of CONTRACT_SEND_PATHS) {
    try {
      return await api.post(replaceRouteParam(path, normalizedContractId), {}, options)
    } catch (error) {
      lastError = error
      const message = String(error?.payload?.message || error?.message || '').toLowerCase()
      const missingRoute =
        Number(error?.status || 0) === 404 ||
        message.includes('could not be found') ||
        message.includes('not found')

      if (missingRoute) continue
      throw error
    }
  }

  if (lastError) throw lastError

  throw new Error('No encontramos una ruta valida para enviar el contrato a DocuSign.')
}

export function normalizeContractFrontendState(payload = {}) {
  const frontendState =
    (payload?.frontend_state && typeof payload.frontend_state === 'object'
      ? payload.frontend_state
      : null) ||
    (payload?.contract?.frontend_state && typeof payload.contract.frontend_state === 'object'
      ? payload.contract.frontend_state
      : null) ||
    (payload?.data?.frontend_state && typeof payload.data.frontend_state === 'object'
      ? payload.data.frontend_state
      : null) ||
    {}

  const rawStatus = String(
    frontendState.ui_status ||
      frontendState.docusign_status ||
      frontendState.status ||
      payload?.docusign_status ||
      payload?.contract?.docusign_status ||
      payload?.status ||
      payload?.contract?.status ||
      payload?.data?.status ||
      payload?.envelope_status ||
      payload?.contract_status ||
      '',
  )
    .trim()
    .toLowerCase()

  const uiStatus = rawStatus || 'generated'
  const readyForPayment =
    frontendState.ready_for_payment === true || uiStatus === 'completed'
  const nextAction =
    String(frontendState.next_action || (readyForPayment ? 'go_to_payment' : 'sign_contract')).trim() ||
    'sign_contract'
  const statusMessage =
    String(frontendState.status_message || payload?.message || '').trim() ||
    (uiStatus === 'generated'
      ? 'El contrato esta listo para firma.'
      : uiStatus === 'sent'
        ? 'La firma del contrato esta pendiente.'
        : readyForPayment
          ? 'El contrato ya quedo listo para continuar a pago.'
          : 'Estamos validando el estado mas reciente del contrato.')
  const signedPdfUrl = String(
    frontendState.signed_pdf_url || payload?.signed_pdf_url || payload?.contract?.signed_pdf_url || '',
  ).trim()

  return {
    ...frontendState,
    docusign_envelope_id: String(
      frontendState.docusign_envelope_id ||
        payload?.docusign_envelope_id ||
        payload?.contract?.docusign_envelope_id ||
        '',
    ).trim(),
    docusign_status: String(
      frontendState.docusign_status ||
        payload?.docusign_status ||
        payload?.contract?.docusign_status ||
        uiStatus,
    ).trim(),
    ui_status: uiStatus,
    ready_for_payment: readyForPayment,
    next_action: nextAction,
    status_message: statusMessage,
    signed_pdf_url: signedPdfUrl,
  }
}

export async function downloadSignedContractPdf(contractId, options = {}) {
  const normalizedContractId = String(contractId || '').trim()

  if (!normalizedContractId) {
    throw new Error('No encontramos el identificador del contrato para descargar el PDF firmado.')
  }

  let lastError = null

  for (const path of CONTRACT_SIGNED_PDF_PATHS) {
    try {
      return await api.download(replaceRouteParam(path, normalizedContractId), options)
    } catch (error) {
      lastError = error
      const message = String(error?.payload?.message || error?.message || '').toLowerCase()
      const missingRoute =
        Number(error?.status || 0) === 404 ||
        message.includes('could not be found') ||
        message.includes('not found')

      if (missingRoute) continue
      throw error
    }
  }

  if (lastError) throw lastError

  throw new Error('No encontramos una ruta valida para descargar el contrato firmado.')
}

export function persistPendingContractContext(context = {}) {
  if (!canUseSessionStorage()) return

  const keys = buildStorageKeys({
    reservationId: context.reservationId || context.reservation_id,
    contractId: context.contractId || context.contract_id,
  })
  const serialized = JSON.stringify(context)

  keys.forEach((key) => {
    window.sessionStorage.setItem(key, serialized)
  })
}

export function readPendingContractContext({ reservationId = '', contractId = '' } = {}) {
  if (!canUseSessionStorage()) return null

  const keys = buildStorageKeys({ reservationId, contractId })

  for (const key of keys) {
    const parsed = safeParseStorage(window.sessionStorage.getItem(key) || '')
    if (parsed) {
      return parsed
    }
  }

  return null
}

export function clearPendingContractContext({ reservationId = '', contractId = '' } = {}) {
  if (!canUseSessionStorage()) return

  buildStorageKeys({ reservationId, contractId }).forEach((key) => {
    window.sessionStorage.removeItem(key)
  })
}

export const contractApi = {
  sendToDocuSign(contractId, options = {}) {
    return sendContractToDocuSign(contractId, options)
  },
  getContractStatus(contractId, options = {}) {
    return getContractStatus(contractId, options)
  },
}
