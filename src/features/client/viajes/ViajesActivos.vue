<script setup>
import { computed, ref, watch } from 'vue'
import { resolveMediaUrl } from '../../../lib/api'
import ReservationActionCard from '../components/reservation/ReservationActionCard.vue'
import { featuredAirports } from '../../../utils/airports'
import {
  buildSharedFlowStepStates,
  getSharedWorkflowActionCopy,
  getSharedWorkflowStatusMeta,
  resolveSharedWorkflowStatus,
  resolveWorkflowState,
  SHARED_WORKFLOW_STEPS,
} from '../../../utils/flightWorkflow'

const props = defineProps({
  reservations: { type: Array, required: true },
  selectedId: { type: String, default: '' },
  timeline: { type: Array, required: true },
  initialTab: { type: String, default: 'historial' },
  refreshing: { type: Boolean, default: false },
})

const emit = defineEmits([
  'open-contract',
  'open-detail',
  'open-payment',
  'open-concierge',
  'resolve-availability-conflict',
  'refresh',
])

const activeTab = ref('historial')
const loadingActionReservationId = ref('')

const PROGRESS_STEPS = SHARED_WORKFLOW_STEPS.map((step) => ({
  key:
    step.id === 'reserved'
      ? 'booking'
      : step.id === 'provider_pending'
        ? 'provider'
        : step.id === 'contract_pending'
          ? 'contract'
          : step.id === 'payment_pending'
            ? 'payment'
            : step.id === 'flight_confirmed'
              ? 'flight'
              : step.id === 'tracking_live'
                ? 'tracking'
                : 'closure',
  id: step.id,
  label: step.clientLabel,
}))

function statusMeta(status = '') {
  return getSharedWorkflowStatusMeta(status)
}

function workflowId(status = '') {
  return resolveWorkflowState(status).id
}

function displayWorkflowLabel(status = '') {
  return workflowId(status) === 'completed' ? 'Finalizado' : statusMeta(status).label
}

function progressSteps(status = '') {
  const sharedStates = buildSharedFlowStepStates(status)
  const currentWorkflowId = workflowId(status)

  return PROGRESS_STEPS.map((step) => {
    const sharedStep = sharedStates.find((item) => item.id === step.id)
    let state = sharedStep?.state || 'todo'

    // En cliente, cuando el vuelo ya esta confirmado, mostramos "Vuelo" como concluido
    // y dejamos "Tracking" como el siguiente paso visible del servicio.
    if (currentWorkflowId === 'flight_confirmed') {
      if (step.id === 'flight_confirmed') state = 'done'
      if (step.id === 'tracking_live') state = 'active'
    }

    return {
      ...step,
      state,
    }
  })
}

function shortTripDate(value = '') {
  if (!value) return ''

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
}

function reservationCode(reservation = {}) {
  const numericId = String(reservation.id || '').padStart(4, '0')
  return `${reservation?.is_reservation ? 'Reserva' : 'Solicitud'} SKY-${numericId}`
}

function airportMeta(code = '') {
  const normalizedCode = String(code || '')
    .trim()
    .toUpperCase()
  return (
    featuredAirports.find(
      (airport) =>
        String(airport.code || '')
          .trim()
          .toUpperCase() === normalizedCode ||
        String(airport.iata || '')
          .trim()
          .toUpperCase() === normalizedCode,
    ) || null
  )
}

function airportDisplay(code = '') {
  const airport = airportMeta(code)
  if (!airport) return code
  return `${airport.city} (${airport.code || airport.iata})`
}

function airportDisplayFromPayload(code = '', airportPayload = null) {
  const payloadCode = String(airportPayload?.code || airportPayload?.iata || code || '')
    .trim()
    .toUpperCase()
  const payloadCity = String(airportPayload?.city || airportPayload?.name || '').trim()

  if (payloadCity && payloadCode) {
    return `${payloadCity} (${payloadCode})`
  }

  if (payloadCity) {
    return payloadCity
  }

  return airportDisplay(code)
}

function itinerarySegments(reservation = {}) {
  if (reservation.legs?.length) {
    return reservation.legs.map((leg) => ({
      key: leg.id || `leg-${leg.leg_order}`,
      order: leg.leg_order || '',
      origin: airportDisplayFromPayload(leg.origin, leg.originAirport),
      destination: airportDisplayFromPayload(leg.destination, leg.destinationAirport),
      departure: leg.departure_datetime || '',
    }))
  }

  if (reservation.requirements?.length) {
    return [
      {
        key: 'base-leg',
        order: 1,
        origin: airportDisplayFromPayload(reservation.origin, reservation.originAirport),
        destination: airportDisplayFromPayload(
          reservation.destination,
          reservation.destinationAirport,
        ),
        departure: reservation.date || '',
      },
      ...reservation.requirements.map((leg, index) => ({
        key: leg.id || `req-${index + 2}`,
        order: leg.leg_order || index + 2,
        origin: airportDisplayFromPayload(leg.origin, leg.originAirport),
        destination: airportDisplayFromPayload(leg.destination, leg.destinationAirport),
        departure: leg.departure_datetime || (leg.date ? `${leg.date}T${leg.time || '09:00'}` : ''),
      })),
    ]
  }

  const contractSnapshot =
    reservation.contract?.terms_snapshot?.client_contract_snapshot &&
    typeof reservation.contract.terms_snapshot.client_contract_snapshot === 'object'
      ? reservation.contract.terms_snapshot.client_contract_snapshot
      : null

  if (Array.isArray(contractSnapshot?.itinerary_segments) && contractSnapshot.itinerary_segments.length) {
    return contractSnapshot.itinerary_segments.map((segment, index) => ({
      key: segment.key || segment.id || `contract-leg-${index + 1}`,
      order: segment.order || index + 1,
      origin: segment.origin || 'Origen por confirmar',
      destination: segment.destination || 'Destino por confirmar',
      departure: segment.departure || '',
    }))
  }

  return []
}


function routeDisplay(reservation = {}) {
  const segments = itinerarySegments(reservation)
  const snapshotRoute = reservation.contract?.terms_snapshot?.client_contract_snapshot?.route || ''

  if (segments.length) {
    const routePoints = []

    segments.forEach((segment) => {
      if (segment.origin && routePoints[routePoints.length - 1] !== segment.origin) {
        routePoints.push(segment.origin)
      }

      if (segment.destination && routePoints[routePoints.length - 1] !== segment.destination) {
        routePoints.push(segment.destination)
      }
    })

    if (routePoints.length) return routePoints.join(' -> ')
  }

  const origin = airportDisplayFromPayload(reservation.origin || '', reservation.originAirport)
  const destination = airportDisplayFromPayload(
    reservation.destination || '',
    reservation.destinationAirport,
  )

  if (!origin && !destination) {
    return snapshotRoute || reservation.route || reservation.title || `Vuelo privado #${reservation.id}`
  }

  return [origin, destination].filter(Boolean).join(' -> ')
}

function departureDateLabel(reservation = {}) {
  const value = reservation.date || reservation.departure_datetime || ''
  if (!value) return ''

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(parsed)
}

function departureTimeLabel(reservation = {}) {
  const value = reservation.date || reservation.departure_datetime || ''
  if (!value) return ''

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''

  return new Intl.DateTimeFormat('es-MX', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
}

function countdownLabel(reservation = {}) {
  const value = reservation?.date || reservation?.departure_datetime || ''
  if (!value) return ''

  const target = new Date(value)
  if (Number.isNaN(target.getTime())) return ''

  const diffMs = target.getTime() - Date.now()
  if (diffMs <= 0) {
    const stateId = workflowId(reservationWorkflowValue(reservation))

    if (['provider_pending', 'provider_accepted', 'contract_pending', 'contract_signed', 'payment_pending'].includes(stateId)) {
      return 'Pendiente de actualizar'
    }

    return 'En curso'
  }

  const totalHours = Math.floor(diffMs / 3600000)
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24

  if (days > 0) return `Sale en ${days}d ${hours}h`
  return `checklist `
}

function nextAction(status = '') {
  return getSharedWorkflowActionCopy(status).title
}

function nextActionDetail(status = '') {
  return getSharedWorkflowActionCopy(status).detail
}

function normalizeReservationActionId(reservation = {}) {
  return String(reservationActionTargetId(reservation) || '').trim()
}

function isPrimaryActionLoading(reservation = {}) {
  return loadingActionReservationId.value !== '' &&
    loadingActionReservationId.value === normalizeReservationActionId(reservation)
}

function runPrimaryAction(reservation = {}) {
  const actionConfig = primaryActionConfig(reservation)
  const reservationId = normalizeReservationActionId(reservation)

  if (!actionConfig.enabled || !reservationId || isPrimaryActionLoading(reservation)) return

  if (actionConfig.type === 'availability_conflict') {
    loadingActionReservationId.value = ''
    actionConfig.action()
    return
  }

  loadingActionReservationId.value = reservationId
  actionConfig.action()
}

function normalizedCurrentAction(reservation = {}) {
  const directAction = String(
    reservation?.current_action ||
      reservation?.workflow?.current_action ||
      reservation?.workflow?.next_action ||
      reservation?.frontend_state?.next_action ||
      '',
  )
    .trim()
    .toLowerCase()

  if (['payment', 'go_to_payment', 'open_payment', 'payment_pending'].includes(directAction)) {
    return 'payment'
  }

  if (
    ['contract', 'sign_contract', 'wait_for_signature', 'go_to_contract', 'contract_pending'].includes(
      directAction,
    )
  ) {
    return 'contract'
  }

  if (
    ['flight', 'tracking', 'go_to_detail', 'go_to_history', 'sync_payment'].includes(directAction)
  ) {
    return 'detail'
  }

  return ''
}

function hasAvailabilityConflict(reservation = {}) {
  return (
    reservation?.frontend_state?.availability_conflict === true ||
    ['AIRCRAFT_NOT_AVAILABLE', 'AIRCRAFT_ALREADY_RESERVED'].includes(
      String(reservation?.frontend_state?.availability_conflict_code || '').trim(),
    )
  )
}

function primaryActionConfig(reservation = {}) {
  const workflowValue = reservationWorkflowValue(reservation)
  const stateId = workflowId(workflowValue)
  const actionTargetId = reservationActionTargetId(reservation)
  const currentAction = normalizedCurrentAction(reservation)

  if (hasAvailabilityConflict(reservation)) {
    return {
      type: 'availability_conflict',
      badge: 'Disponibilidad actualizada',
      eyebrow: 'Siguiente paso',
      title: 'Esta aeronave ya no esta disponible',
      description:
        reservation?.frontend_state?.availability_conflict_message ||
        'Esta aeronave ya no esta disponible para el horario seleccionado.',
      helperText: 'Concierge 24/7 disponible',
      buttonLabel: 'Ver otras opciones',
      buttonLoadingLabel: 'Ver otras opciones',
      buttonIcon: '🎧',
      illustration: 'contract',
      enabled: true,
      buttonDisabledReason: '',
      action: () => emit('resolve-availability-conflict', actionTargetId),
    }
  }

  if (currentAction === 'contract' || ['provider_accepted', 'contract_pending'].includes(stateId)) {
    return {
      type: 'contract',
      badge: 'Accion requerida',
      eyebrow: 'Siguiente paso',
      title: 'Firma el contrato para continuar',
      description:
        'La respuesta del proveedor ya fue aceptada. Solo falta tu firma para continuar.',
      helperText: 'Concierge 24/7 disponible',
      buttonLabel: 'Firmar contrato',
      buttonLoadingLabel: 'Cargando...',
      buttonIcon: '✍',
      illustration: 'contract',
      enabled: contractEnabled(reservation),
      buttonDisabledReason: contractEnabled(reservation)
        ? ''
        : 'La firma del contrato todavia no esta disponible.',
      action: () => emit('open-contract', actionTargetId),
    }
  }

  if (currentAction === 'payment' || ['contract_signed', 'payment_pending'].includes(stateId)) {
    return {
      type: 'payment',
      badge: 'Accion requerida',
      eyebrow: 'Siguiente paso',
      title: 'Realiza el pago para confirmar tu vuelo',
      description:
        'El contrato fue firmado correctamente. Para confirmar tu reserva, completa el pago.',
      helperText: 'Pago 100% seguro y protegido',
      estimatedTime: '2 minutos',
      buttonLabel: 'REALIZAR PAGO',
      buttonLoadingLabel: 'ABRIENDO PAGO...',
      buttonIcon: '🔒',
      illustration: 'payment',
      enabled: paymentEnabled(reservation),
      buttonDisabledReason: paymentEnabled(reservation)
        ? ''
        : 'El pago todavia no esta disponible.',
      action: () => emit('open-payment', actionTargetId),
    }
  }

  if (['payment_confirmed', 'flight_confirmed', 'tracking_live', 'completed'].includes(stateId)) {
    return {
      type: 'flight',
      badge: 'Seguimiento premium',
      eyebrow: 'Vista del viaje',
      title:
        stateId === 'completed'
          ? 'Tu vuelo ya finalizo'
          : stateId === 'tracking_live'
            ? 'Sigue el servicio en tiempo real'
            : 'Revisa el estado operativo del vuelo',
      description:
        stateId === 'completed'
          ? 'Todo quedo registrado en tu historial. Puedes revisar detalles, documentos y seguimiento final.'
          : 'La reserva ya avanzo a operacion. Aqui puedes revisar el detalle del servicio y los siguientes hitos del viaje.',
      helperText: 'Concierge 24/7 disponible',
      buttonLabel: stateId === 'completed' ? 'Ver resumen del viaje' : 'Ver detalle del vuelo',
      buttonLoadingLabel: 'Cargando...',
      buttonIcon: stateId === 'tracking_live' ? '📡' : '🛫',
      illustration: 'contract',
      enabled: flightEnabled(reservation) || stateId === 'completed',
      buttonDisabledReason: '',
      action: () => emit('open-detail', actionTargetId),
    }
  }
  if (['cancelled', 'rejected'].includes(stateId)) {
    return {
      type: 'concierge',
      badge: 'Atencion concierge',
      eyebrow: 'Siguiente paso',
      title: 'Necesitamos revisar esta reserva contigo',
      description:
        'El estado del vuelo cambio y nuestro equipo puede ayudarte a reorganizar una nueva opcion o resolver la incidencia.',
      helperText: 'Concierge 24/7 disponible',
      buttonLabel: 'Hablar con concierge',
      buttonLoadingLabel: 'Cargando...',
      buttonIcon: '🎧',
      illustration: 'contract',
      enabled: true,
      buttonDisabledReason: '',
      action: () => emit('open-concierge', actionTargetId),
    }
  }

  return {
    type: 'default',
    badge: 'En seguimiento',
    eyebrow: 'Siguiente paso',
    title: nextAction(workflowValue),
    description: `${nextActionDetail(workflowValue)} Nuestro concierge sigue monitoreando la reserva para que avance al siguiente hito sin friccion.`,
    helperText: 'Concierge 24/7 disponible',
    buttonLabel: 'Hablar con concierge',
    buttonLoadingLabel: 'Cargando...',
    buttonIcon: '🎧',
    illustration: 'contract',
    enabled: true,
    buttonDisabledReason: '',
    action: () => emit('open-concierge', actionTargetId),
  }
}

function aircraftReservationLabel(reservation = {}) {
  const paymentStatus = String(reservation?.payment_status || reservation?.payment_order?.status || '').trim().toLowerCase()
  const reservationStatus = String(reservation?.reservation_status || reservation?.status || '').trim().toLowerCase()
  const paid = ['paid', 'pagado', 'payment_confirmed', 'confirmed', 'succeeded', 'completed'].includes(paymentStatus)
  const operational = !['cancelled', 'canceled', 'rejected', 'expired'].includes(reservationStatus)
  return paid && operational ? 'Pagado · Aeronave reservada' : ''
}

function extractImageCandidate(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value !== 'object') return ''

  return (
    value.url ||
    value.path ||
    value.file_url ||
    value.fileUrl ||
    value.public_url ||
    value.publicUrl ||
    value.image_url ||
    value.imageUrl ||
    value.main_image_url ||
    value.mainImageUrl ||
    value.src ||
    ''
  )
}

function getPrimaryImageValue(raw = {}) {
  if (typeof raw === 'string') return raw

  return (
    raw.main_image ||
    raw.main_image_url ||
    raw.mainImage ||
    raw.mainImageUrl ||
    raw.image_url ||
    raw.imageUrl ||
    raw.image ||
    raw.image_path ||
    raw.imagePath ||
    raw.photo ||
    raw.photo_url ||
    raw.photoUrl ||
    raw.cover_image ||
    raw.coverImage ||
    raw.cover_photo ||
    raw.coverPhoto ||
    raw.featured_image ||
    raw.featuredImage ||
    raw.thumbnail ||
    raw.thumbnail_url ||
    raw.thumbnailUrl ||
    raw.exterior_image ||
    raw.exteriorImage ||
    raw.interior_image ||
    raw.interiorImage ||
    raw.gallery_exterior ||
    raw.gallery_interior ||
    ''
  )
}

function normalizeImageCollection(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'string') return [value]
  if (typeof value === 'object') return [value]
  return []
}

function resolvePrimaryAircraftImage(raw = {}) {
  if (!raw || typeof raw !== 'object') return ''

  const images = [
    ...normalizeImageCollection(raw.images),
    ...normalizeImageCollection(raw.aircraft_images),
    ...normalizeImageCollection(raw.aircraftImages),
    ...normalizeImageCollection(raw.gallery_images),
    ...normalizeImageCollection(raw.galleryImages),
    ...normalizeImageCollection(raw.gallery),
    ...normalizeImageCollection(raw.photos),
    ...normalizeImageCollection(raw.media),
    ...normalizeImageCollection(raw.multimedia),
    ...normalizeImageCollection(raw.pictures),
    ...normalizeImageCollection(raw.files),
  ]

  for (const image of images) {
    const imageRecord = typeof image === 'string' ? { url: image } : image || {}
    const candidate = resolveMediaUrl(
      getPrimaryImageValue(imageRecord) || extractImageCandidate(imageRecord) || '',
    )

    if (candidate) return candidate
  }

  return resolveMediaUrl(getPrimaryImageValue(raw)) || ''
}

function resolveAircraftImageFromCollections(collections = []) {
  for (const collection of collections) {
    if (!Array.isArray(collection)) continue

    for (const item of collection) {
      if (!item) continue

      const nestedAircraftRecord =
        item.aircraft && typeof item.aircraft === 'object' ? item.aircraft : {}
      const nestedVisibilityPayload =
        item.visibility_payload && typeof item.visibility_payload === 'object'
          ? item.visibility_payload
          : {}
      const nestedVisibilityAircraft =
        nestedVisibilityPayload.aircraft && typeof nestedVisibilityPayload.aircraft === 'object'
          ? nestedVisibilityPayload.aircraft
          : {}
      const nestedSnapshot =
        item.aircraft_snapshot && typeof item.aircraft_snapshot === 'object'
          ? item.aircraft_snapshot
          : nestedVisibilityPayload.aircraft_snapshot &&
              typeof nestedVisibilityPayload.aircraft_snapshot === 'object'
            ? nestedVisibilityPayload.aircraft_snapshot
            : {}

      const candidate =
        resolveMediaUrl(item.aircraft_image || '') ||
        resolveMediaUrl(item.image_url || '') ||
        resolvePrimaryAircraftImage(item) ||
        resolvePrimaryAircraftImage(nestedSnapshot) ||
        resolvePrimaryAircraftImage(nestedAircraftRecord) ||
        resolvePrimaryAircraftImage(nestedVisibilityAircraft) ||
        resolveMediaUrl(nestedVisibilityPayload.aircraft_image || '') ||
        ''

      if (candidate) return candidate
    }
  }

  return ''
}

function reservationAircraftName(reservation = {}) {
  return (
    reservation.aircraft ||
    reservation.assigned_aircraft_model ||
    reservation.aircraft_model ||
    reservation.aircraft_name ||
    reservation.contract?.terms_snapshot?.client_contract_snapshot?.aircraft ||
    ''
  )
}

function reservationAircraftImage(reservation = {}) {
  const visibilityPayload =
    reservation.visibility_payload && typeof reservation.visibility_payload === 'object'
      ? reservation.visibility_payload
      : {}
  const visibilityAircraftRecord =
    visibilityPayload.aircraft && typeof visibilityPayload.aircraft === 'object'
      ? visibilityPayload.aircraft
      : {}
  const visibilitySnapshotRecord =
    visibilityPayload.aircraft_snapshot && typeof visibilityPayload.aircraft_snapshot === 'object'
      ? visibilityPayload.aircraft_snapshot
      : {}
  const contractSnapshot =
    reservation.contract?.terms_snapshot?.aircraft_snapshot &&
    typeof reservation.contract.terms_snapshot.aircraft_snapshot === 'object'
      ? reservation.contract.terms_snapshot.aircraft_snapshot
      : reservation.contract?.terms_snapshot?.client_contract_snapshot?.aircraft_snapshot &&
          typeof reservation.contract.terms_snapshot.client_contract_snapshot.aircraft_snapshot ===
            'object'
        ? reservation.contract.terms_snapshot.client_contract_snapshot.aircraft_snapshot
        : {}

  return (
    resolveMediaUrl(reservation.aircraft_image || '') ||
    resolveMediaUrl(reservation.image_url || '') ||
    resolveMediaUrl(visibilityPayload.aircraft_image || '') ||
    resolveMediaUrl(reservation.aircraft_photo || '') ||
    resolveMediaUrl(reservation.aircraft_photo_url || '') ||
    resolveMediaUrl(reservation.aircraft_thumbnail || '') ||
    resolvePrimaryAircraftImage(reservation.aircraft_snapshot || {}) ||
    resolvePrimaryAircraftImage(visibilitySnapshotRecord) ||
    resolvePrimaryAircraftImage(visibilityAircraftRecord) ||
    resolveAircraftImageFromCollections([
      reservation.matched_options,
      reservation.matches,
      reservation.images,
    ]) ||
    resolvePrimaryAircraftImage(reservation.contract?.terms_snapshot?.aircraft_snapshot || {}) ||
    resolvePrimaryAircraftImage(contractSnapshot) ||
    resolveMediaUrl(reservation.contract?.terms_snapshot?.aircraft_image || '') ||
    resolveMediaUrl(reservation.contract?.terms_snapshot?.client_contract_snapshot?.aircraft_image || '') ||
    ''
  )
}

function escapeSvgText(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function aircraftPlaceholderDataUri(reservation = {}) {
  const aircraftName = reservationAircraftName(reservation) || 'Aeronave privada'
  const aircraftCategory = reservationAircraftCategory(reservation) || 'Servicio ejecutivo'
  const title = escapeSvgText(aircraftName)
  const subtitle = escapeSvgText(aircraftCategory)
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420" role="img" aria-label="${title}">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1d1b19" />
          <stop offset="100%" stop-color="#635848" />
        </linearGradient>
        <linearGradient id="line" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#f2d79b" />
          <stop offset="100%" stop-color="#b88a35" />
        </linearGradient>
      </defs>
      <rect width="640" height="420" rx="34" fill="url(#bg)" />
      <circle cx="522" cy="94" r="88" fill="rgba(255,255,255,0.06)" />
      <circle cx="110" cy="320" r="120" fill="rgba(255,255,255,0.04)" />
      <path d="M150 216h170l96-66c18-12 41-11 57 3l22 19-66 34 66 34-22 19c-16 14-39 15-57 3l-96-66H150l-44 36-34-10 22-40-22-40 34-10 44 36Z" fill="url(#line)" opacity="0.96"/>
      <path d="M145 216h352" stroke="rgba(255,255,255,0.18)" stroke-width="8" stroke-linecap="round"/>
      <text x="56" y="322" fill="#f6edde" font-size="38" font-family="Manrope, Arial, sans-serif" font-weight="800">${title}</text>
      <text x="56" y="360" fill="rgba(246,237,222,0.72)" font-size="24" font-family="Manrope, Arial, sans-serif">${subtitle}</text>
    </svg>
  `
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function reservationAircraftVisualUrl(reservation = {}) {
  return reservationAircraftImage(reservation) || aircraftPlaceholderDataUri(reservation)
}

function handleAircraftImageError(event, reservation = {}) {
  const target = event?.target
  if (!target || target.dataset.fallbackApplied === 'true') return

  target.dataset.fallbackApplied = 'true'
  target.src = aircraftPlaceholderDataUri(reservation)
}

function reservationAircraftCapacity(reservation = {}) {
  return (
    reservation.aircraft_capacity ||
    reservation.contract?.terms_snapshot?.client_contract_snapshot?.passengers ||
    ''
  )
}

function reservationAircraftCategory(reservation = {}) {
  return (
    reservation.aircraft_category ||
    reservation.contract?.terms_snapshot?.client_contract_snapshot?.aircraft_category ||
    ''
  )
}

function reservationPrimarySegment(reservation = {}) {
  return itinerarySegments(reservation)[0] || null
}

function actionFooterConfig(reservation = {}) {
  const stateId = workflowId(reservationWorkflowValue(reservation))

  if (['provider_accepted', 'contract_pending'].includes(stateId)) {
    return {
      title: '¡Excelente!',
      message: 'Tu reserva va por buen camino. Solo falta tu firma para asegurar tu vuelo.',
    }
  }

  if (['contract_signed', 'payment_pending'].includes(stateId)) {
    return {
      title: '¡Vas muy bien!',
      message:
        'Tu vuelo esta casi confirmado. Solo falta completar el pago para asegurar tu lugar.',
    }
  }

  if (['payment_confirmed', 'flight_confirmed', 'tracking_live'].includes(stateId)) {
    return {
      title: '¡Excelente!',
      message:
        'La operacion ya esta avanzando. Nuestro equipo sigue cada hito para mantenerte informado.',
    }
  }

  if (stateId === 'completed') {
    return {
      title: '¡Excelente!',
      message:
        'Este viaje ya finalizo y quedo guardado en tu historial con su seguimiento completo.',
    }
  }

  return {
    title: '¡Excelente!',
    message: 'Nuestro concierge sigue moviendo tu reserva para llevarla al siguiente paso.',
  }
}

function stepStateLabel(step = {}) {
  if (step.state === 'done') return 'Completado'
  if (step.state === 'active') return 'En curso'
  return 'Pendiente'
}

function hasWorkflowIn(status = '', states = []) {
  return states.includes(resolveWorkflowState(status).id)
}

function reservationDepartureDate(reservation = {}) {
  const candidates = [
    reservation.date,
    reservation.departure_datetime,
    reservation.departure_date,
    reservation.legs?.[0]?.departure_datetime,
    reservation.requirements?.[0]?.departure_datetime,
  ]

  for (const candidate of candidates) {
    if (!candidate) continue

    const parsed = new Date(candidate)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }

  return null
}

function isReservationPast(reservation = {}) {
  const departureDate = reservationDepartureDate(reservation)
  if (!departureDate) return false
  return departureDate.getTime() < Date.now()
}

function reservationWorkflowValue(reservation = {}) {
  return (
    resolveSharedWorkflowStatus({
      ...reservation,
      workflow_status: reservation.workflow_status || reservation.status || '',
      contract_status: reservation.contract_status || '',
      payment_status: reservation.payment_status || '',
    }) ||
    reservation.workflow_status ||
    reservation.status ||
    ''
  )
}

function contractEnabled(reservation = {}) {
  return hasWorkflowIn(reservationWorkflowValue(reservation), [
    'provider_accepted',
    'contract_pending',
    'contract_signed',
  ])
}

function paymentEnabled(reservation = {}) {
  const stateId = workflowId(reservationWorkflowValue(reservation))
  const paymentStatus = String(
    reservation?.payment_status || reservation?.payment_order?.status || '',
  )
    .trim()
    .toLowerCase()
  const frontendReady = reservation?.frontend_state?.ready_for_payment === true
  const contractStatus = String(
    reservation?.contract_status || reservation?.contract?.status || '',
  )
    .trim()
    .toLowerCase()

  if (
    ['payment_confirmed', 'flight_confirmed', 'tracking_live', 'completed'].includes(stateId) ||
    ['paid', 'pagado', 'payment_confirmed', 'confirmed', 'succeeded', 'completed'].includes(
      paymentStatus,
    )
  ) {
    return false
  }

  return (
    frontendReady ||
    hasWorkflowIn(reservationWorkflowValue(reservation), ['contract_signed', 'payment_pending']) ||
    contractStatus === 'signed' ||
    ['pending', 'pendiente de pago', 'pending_manual_payment', 'pending_manual_validation'].includes(
      paymentStatus,
    )
  )
}

function flightEnabled(reservation = {}) {
  return hasWorkflowIn(reservationWorkflowValue(reservation), [
    'payment_confirmed',
    'flight_confirmed',
    'tracking_live',
    'completed',
  ])
}

function reservationActionTargetId(reservation = {}) {
  return reservation.id || reservation.flight_request_id || reservation.request_id || ''
}

function reservationTab(reservation = {}) {
  const state = resolveWorkflowState(reservationWorkflowValue(reservation))

  if (['completed', 'cancelled', 'rejected'].includes(state.id)) {
    return 'historial'
  }

  if (
    isReservationPast(reservation) &&
    ['payment_confirmed', 'flight_confirmed', 'tracking_live'].includes(state.id)
  ) {
    return 'historial'
  }

  if (['payment_confirmed', 'flight_confirmed', 'tracking_live'].includes(state.id)) {
    return 'activos'
  }

  if (
    [
      'draft',
      'quoted',
      'package_selected',
      'reserved',
      'provider_pending',
      'provider_accepted',
      'contract_pending',
      'contract_signed',
      'payment_pending',
    ].includes(state.id)
  ) {
    return 'proximos'
  }

  return 'proximos'
}

const tabOptions = [
  { key: 'activos', label: 'Activos', icon: '✈' },
  { key: 'proximos', label: 'Proximos', icon: '🗓' },
  { key: 'historial', label: 'Historial', icon: '🧾' },
]

function normalizeTabKey(value = '') {
  return tabOptions.some((tab) => tab.key === value) ? value : 'proximos'
}

const filteredReservations = computed(() =>
  props.reservations.filter((reservation) => reservationTab(reservation) === activeTab.value),
)

watch(
  () => props.initialTab,
  (nextTab) => {
    activeTab.value = normalizeTabKey(nextTab)
  },
  { immediate: true },
)

watch(
  () => props.reservations,
  (reservations) => {
    const hasActiveTabReservations = reservations.some(
      (reservation) => reservationTab(reservation) === activeTab.value,
    )
    if (hasActiveTabReservations) return

    const fallbackTab = tabOptions.find((tab) =>
      reservations.some((reservation) => reservationTab(reservation) === tab.key),
    )
    activeTab.value = fallbackTab?.key || normalizeTabKey(props.initialTab)
  },
  { immediate: true },
)

watch(
  () => props.selectedId,
  () => {
    loadingActionReservationId.value = ''
  },
)

watch(
  () => props.refreshing,
  (isRefreshing) => {
    if (isRefreshing) return
    loadingActionReservationId.value = ''
  },
)

watch(
  () =>
    props.reservations
      .map((reservation) =>
        [
          normalizeReservationActionId(reservation),
          hasAvailabilityConflict(reservation) ? 'conflict' : 'ok',
          reservation?.frontend_state?.next_action || '',
          reservation?.current_action || '',
        ].join(':'),
      )
      .join('|'),
  () => {
    if (!loadingActionReservationId.value) return

    const conflictedReservation = props.reservations.find(
      (reservation) =>
        normalizeReservationActionId(reservation) === loadingActionReservationId.value &&
        hasAvailabilityConflict(reservation),
    )

    if (conflictedReservation) {
      loadingActionReservationId.value = ''
    }
  },
  { immediate: true },
)
</script>

<template>
  <section class="active-trips">
    <div class="screen-head screen-head--actions">
      <div>
        <span class="eyebrow">Viajes</span>
        <h2>Activos, proximos e historial en un solo lugar.</h2>
        <p>Tu experiencia de vuelo privado, pagos y seguimiento viven dentro de cada reserva.</p>
      </div>

      <button
        class="refresh-button"
        type="button"
        :disabled="props.refreshing"
        @click="emit('refresh')"
      >
        {{ props.refreshing ? 'Recargando...' : 'Recargar viajes' }}
      </button>
    </div>

    <div class="tabs">
      <button
        v-for="tab in tabOptions"
        :key="tab.key"
        :class="{ active: activeTab === tab.key }"
        type="button"
        @click="activeTab = tab.key"
      >
        <span class="tab-icon" aria-hidden="true">{{ tab.icon }}</span>
        <span>{{ tab.label }}</span>
      </button>
    </div>

    <article
      v-for="reservation in filteredReservations"
      :key="reservation.id || reservation.flight_request_id || reservation.created_at"
      class="hero-card"
    >
      <div class="hero-card__head">
        <div class="hero-copy">
          <span class="hero-kicker">{{ reservationCode(reservation) }}</span>
          <h3>{{ routeDisplay(reservation) }}</h3>
          <div class="hero-meta">
            <span v-if="departureDateLabel(reservation)">📅 {{ departureDateLabel(reservation) }}</span>
            <span v-if="departureTimeLabel(reservation)">🕘 {{ departureTimeLabel(reservation) }}</span>
            <span v-if="reservation.passengers">👥 {{ reservation.passengers }} pasajeros</span>
            <span v-if="reservationAircraftName(reservation)">🛩 {{ reservationAircraftName(reservation) }}</span>
            <span v-if="itinerarySegments(reservation).length">✈ {{ itinerarySegments(reservation).length }} tramos</span>
            <span v-if="countdownLabel(reservation)">⏳ {{ countdownLabel(reservation) }}</span>
            <span v-if="aircraftReservationLabel(reservation)">✓ {{ aircraftReservationLabel(reservation) }}</span>
          </div>
        </div>
        <span
          class="status-badge"
          :class="`status-badge--${statusMeta(reservationWorkflowValue(reservation)).tone}`"
        >
          {{ statusMeta(reservationWorkflowValue(reservation)).icon }}
          {{ displayWorkflowLabel(reservationWorkflowValue(reservation)) }}
        </span>
      </div>

      <div class="workflow-panel">
        <div class="progress-steps progress-steps--cards">
          <article
          v-for="step in progressSteps(reservationWorkflowValue(reservation))"
          :key="step.key"
            class="step-card"
            :class="`step-card--${step.state}`"
          >
            <span class="step-card__icon">
              {{ step.state === 'done' ? '✓' : step.state === 'active' ? '○' : '○' }}
            </span>
            <span class="step-card__copy">
              <strong>{{ step.label }}</strong>
              <small>{{ stepStateLabel(step) }}</small>
            </span>
          </article>
        </div>

        <div class="progress-shell progress-shell--panel">
          <div class="progress-track">
            <span
              class="progress-bar"
              :style="{
                width: `${statusMeta(reservationWorkflowValue(reservation)).progress}%`,
              }"
            ></span>
          </div>
        </div>
      </div>

      <div class="executive-grid">
        <article
          v-if="reservationAircraftName(reservation) || reservationAircraftImage(reservation)"
          class="executive-card executive-card--aircraft"
        >
          <div
            class="executive-card__media"
            :class="{ 'executive-card__media--placeholder': !reservationAircraftImage(reservation) }"
          >
            <img
              :src="reservationAircraftVisualUrl(reservation)"
              :alt="reservationAircraftName(reservation) || 'Aeronave'"
              loading="lazy"
              @error="handleAircraftImageError($event, reservation)"
            />
          </div>
          <div class="executive-card__copy">
            <strong>{{ reservationAircraftName(reservation) || 'Aeronave por confirmar' }}</strong>
            <span v-if="reservationAircraftCapacity(reservation)"
              >Capacidad: {{ reservationAircraftCapacity(reservation) }} pax</span
            >
            <span v-if="reservationAircraftCategory(reservation)"
              >Cabina: {{ reservationAircraftCategory(reservation) }}</span
            >
            <span class="executive-card__divider"></span>
            <span v-if="reservationPrimarySegment(reservation)"
              >Tramo: {{ reservationPrimarySegment(reservation)?.origin }} → {{ reservationPrimarySegment(reservation)?.destination }}</span
            >
            <span v-if="departureDateLabel(reservation)"
              >Fecha: {{ departureDateLabel(reservation) }}</span
            >
            <span v-if="departureTimeLabel(reservation)"
              >Hora: {{ departureTimeLabel(reservation) }}</span
            >
          </div>
        </article>

        <ReservationActionCard
          class="executive-card--action"
          :badge="primaryActionConfig(reservation).badge"
          :eyebrow="primaryActionConfig(reservation).eyebrow"
          :title="primaryActionConfig(reservation).title"
          :description="primaryActionConfig(reservation).description"
          :helper-text="primaryActionConfig(reservation).helperText"
          :button-label="primaryActionConfig(reservation).buttonLabel"
          :button-loading-label="primaryActionConfig(reservation).buttonLoadingLabel"
          :button-disabled-reason="primaryActionConfig(reservation).buttonDisabledReason"
          :button-icon="primaryActionConfig(reservation).buttonIcon"
          :estimated-time="primaryActionConfig(reservation).estimatedTime"
          :enabled="primaryActionConfig(reservation).enabled"
          :loading="isPrimaryActionLoading(reservation)"
          :variant="primaryActionConfig(reservation).type"
          :illustration="primaryActionConfig(reservation).illustration"
          @action="runPrimaryAction(reservation)"
        />
      </div>

      <div class="action-footer-note">
        <span class="action-footer-note__icon">✓</span>
        <strong>{{ actionFooterConfig(reservation).title }}</strong>
        <span>{{ actionFooterConfig(reservation).message }}</span>
      </div>

      <div v-if="itinerarySegments(reservation).length" class="legs-grid">
        <span v-for="leg in itinerarySegments(reservation)" :key="leg.key">
          Tramo {{ leg.order || '?' }} · {{ leg.origin }} → {{ leg.destination }}
          <template v-if="leg.departure"> · {{ shortTripDate(leg.departure) }}</template>
        </span>
      </div>
    </article>

    <div v-if="reservations.length && !filteredReservations.length" class="empty-state">
      No hay viajes en
      {{ tabOptions.find((tab) => tab.key === activeTab)?.label.toLowerCase() || 'esta sección' }}.
    </div>

    <div v-if="!reservations.length" class="empty-state">El servidor no devolvio viajes.</div>
  </section>
</template>

<style scoped>
.active-trips {
  display: grid;
  gap: 1.25rem;
  padding: clamp(1.1rem, 2vw, 1.8rem);
  border: 0;
  border-radius: 34px;
  background: #ffffff;
  box-shadow: none;
}

.screen-head {
  max-width: 760px;
}

.screen-head--actions {
  max-width: none;
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
}

.eyebrow {
  color: #8b6a24;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h2,
h3 {
  margin: 0;
  color: #111111;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: 0;
}

h2 {
  font-size: clamp(2rem, 4vw, 3.2rem);
  line-height: 1;
}

h3 {
  font-size: clamp(1.55rem, 2vw, 2.2rem);
  line-height: 1.02;
}

h4 {
  margin: 0;
  color: #111111;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  font-size: clamp(1.5rem, 2vw, 2.3rem);
  line-height: 1.05;
}

p,
span {
  color: #625d55;
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
}

.tabs button {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
}

.tab-icon {
  font-size: 0.9rem;
  line-height: 1;
}

button {
  min-height: 2.8rem;
  border: 0;
  border-radius: 14px;
  padding: 0 1rem;
  background: #ece8df;
  color: #14233e;
  font-weight: 800;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease;
}

.refresh-button {
  flex-shrink: 0;
  background: linear-gradient(135deg, #14233e, #304668);
  color: #ffffff;
  box-shadow: 0 12px 28px rgba(20, 35, 62, 0.18);
}

button:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(26, 45, 79, 0.1);
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
  transform: none;
  box-shadow: none;
}

.tabs .active {
  background: linear-gradient(135deg, #14233e, #304668);
  color: #ffffff;
  box-shadow: 0 10px 24px rgba(20, 35, 62, 0.16);
}

.tabs .active span,
.tabs .active .tab-icon {
  color: #ffffff;
}

.hero-card,
.empty-state {
  border: 1px solid #e5e1d8;
  border-radius: 24px;
  background: #ffffff;
  box-shadow: 0 14px 34px rgba(77, 63, 27, 0.05);
}

.empty-state {
  padding: 1rem;
  color: #3b3428;
  font-weight: 800;
}

.hero-card {
  display: grid;
  gap: 1.15rem;
  padding: 1.45rem;
}

.executive-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem;
}

.executive-card {
  display: grid;
  gap: 0.45rem;
  padding: 1rem;
  border-radius: 18px;
  background: rgba(244, 240, 231, 0.92);
}

.executive-card--aircraft {
  grid-template-columns: 132px minmax(0, 1fr);
  align-items: center;
  padding: 1.15rem;
  border: 1px solid rgba(225, 219, 208, 0.9);
  background: linear-gradient(180deg, rgba(250, 247, 242, 0.98), rgba(245, 240, 232, 0.98));
}

.executive-card__media {
  display: grid;
  place-items: center;
  min-height: 128px;
  overflow: hidden;
  border-radius: 16px;
  background: linear-gradient(135deg, #14233e, #304668);
  color: #ffffff;
  font-weight: 800;
}

.executive-card__media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.executive-card__media--placeholder {
  background: linear-gradient(135deg, #526985, #14233e);
}

.executive-card__copy {
  display: grid;
  gap: 0.42rem;
}

.executive-card__copy strong {
  color: #1a1a1a;
  font-size: 1.05rem;
}

.executive-card__copy span {
  color: #544d43;
  font-weight: 600;
}

.executive-card__divider {
  width: 100%;
  height: 1px;
  margin: 0.2rem 0 0.1rem;
  background: linear-gradient(90deg, rgba(198, 186, 168, 0.9), rgba(198, 186, 168, 0));
}

.action-footer-note {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 1rem 1.1rem;
  border: 1px solid rgba(198, 230, 210, 0.9);
  border-radius: 18px;
  background: linear-gradient(180deg, #f1fbf4, #e9f7ee);
}

.action-footer-note strong {
  color: #168149;
  font-weight: 900;
}

.action-footer-note span:last-child {
  color: #82a08e;
  font-weight: 700;
}

.action-footer-note__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.55rem;
  height: 1.55rem;
  border-radius: 50%;
  background: #168149;
  color: #ffffff !important;
  font-size: 0.88rem;
  font-weight: 900;
}

.hero-card__head {
  display: flex;
  justify-content: space-between;
  gap: 1.25rem;
  align-items: start;
}

.hero-copy,
.legs-grid {
  display: grid;
  gap: 0.45rem;
}

.hero-kicker {
  color: #8b6a24;
  font-size: 0.88rem;
  font-weight: 900;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.9rem 1.35rem;
  font-size: 0.95rem;
}

.hero-meta span {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: #4f4a42;
  font-weight: 700;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 3.15rem;
  border-radius: 999px;
  padding: 0.55rem 1.2rem;
  font-size: 0.96rem;
  font-weight: 900;
  white-space: nowrap;
}

.status-badge--searching {
  background: #e8f1ff;
  color: #2351a8;
}

.status-badge--info {
  background: #eef4ff;
  color: #355da8;
}

.status-badge--pending {
  background: #fff2d8;
  color: #9a6500;
}

.status-badge--confirmed,
.status-badge--paid {
  background: #e5f7ea;
  color: #14673a;
}

.status-badge--completed {
  background: #ddf7e6;
  color: #0d6a34;
}

.status-badge--cancelled {
  background: #ffe6e2;
  color: #a13622;
}

.status-badge--neutral {
  background: #efebe4;
  color: #5d5448;
}

.workflow-panel {
  display: grid;
  gap: 1rem;
  padding: 1.2rem 1.25rem 1rem;
  border: 1px solid rgba(229, 225, 216, 0.92);
  border-radius: 26px;
  background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(250,247,241,0.98));
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.8);
}

.progress-shell {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.progress-shell--panel {
  padding: 0 0.2rem;
}

.progress-track {
  position: relative;
  flex: 1;
  height: 0.22rem;
  border-radius: 999px;
  background: #ebe7df;
  overflow: hidden;
}

.progress-bar {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: linear-gradient(90deg, #c08a15, #c08a15);
}

.progress-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.progress-steps--cards {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.65rem;
}

.step-card {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.step-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.65rem;
  height: 2.65rem;
  border-radius: 999px;
  font-size: 1.1rem;
  font-weight: 900;
  line-height: 1;
  flex: 0 0 auto;
  border: 2px solid currentColor;
  background: #ffffff;
}

.step-card__copy {
  display: grid;
  gap: 0.08rem;
  min-width: 0;
}

.step-card__copy strong {
  color: #1f1d19;
  font-size: 0.8rem;
  line-height: 1.15;
}

.step-card__copy small {
  color: #6f675d;
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1.2;
}

.step-card--done {
  color: #14673a;
}

.step-card--done .step-card__icon {
  background: #1b7a45;
  color: #ffffff;
  border-color: #d9f0df;
}

.step-card--active {
  color: #9a6500;
}

.step-card--active .step-card__icon {
  background: #ffffff;
  color: #b57a00;
  border-color: #c7931a;
}

.step-card--todo {
  color: #7a7266;
}

.step-card--todo .step-card__icon {
  background: #ffffff;
  color: #8c8376;
  border: 1px solid #d7cfbf;
}

.legs-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.legs-grid span {
  padding: 0.8rem 0.95rem;
  border-radius: 16px;
  background: rgba(244, 240, 231, 0.9);
  color: #433c31;
}

@media (max-width: 1080px) {
  .hero-card__head,
  .executive-grid,
  .executive-card--aircraft {
    grid-template-columns: 1fr;
    display: grid;
  }

  .progress-steps--cards {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .action-card__content {
    grid-template-columns: 1fr;
  }

  .action-card__illustration {
    justify-items: center;
  }
}

@media (max-width: 760px) {
  .active-trips {
    padding: 0.9rem;
    gap: 0.9rem;
  }

  .screen-head--actions {
    align-items: stretch;
    grid-template-columns: 1fr;
    display: grid;
  }

  h2 {
    font-size: clamp(1.75rem, 9vw, 2.35rem);
  }

  .tabs,
  .hero-meta {
    display: grid;
    grid-template-columns: 1fr;
  }

  .refresh-button,
  .tabs button,
  .primary-action-button {
    width: 100%;
  }

  .hero-card {
    padding: 1rem;
    border-radius: 20px;
  }

  .workflow-panel {
    padding: 1rem;
  }

  .progress-shell {
    align-items: start;
    flex-direction: column;
  }

  .progress-steps--cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .executive-card--action,
  .executive-card--aircraft {
    padding: 1rem;
  }

  .action-illustration {
    width: 150px;
    height: 150px;
  }

  .action-footer-note {
    align-items: flex-start;
    flex-wrap: wrap;
  }
}
</style>
