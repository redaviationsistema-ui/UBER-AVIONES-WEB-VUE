function normalized(value) {
  return String(value ?? '').trim().toLowerCase()
}

export function getCustomerFlightStage(brief = {}) {
  const operationStatus = normalized(brief.operation?.status)
  const crewStatus = normalized(brief.crew?.status)
  const flightStatus = normalized(brief.flight?.status)

  if (['cancelada', 'cancelled'].includes(operationStatus) || ['cancelada', 'cancelled'].includes(flightStatus)) return 'cancelled'
  if (['finalizada', 'completed'].includes(operationStatus)) return 'completed'
  if (crewStatus === 'landed') return 'landed'
  if (['en_vuelo', 'in_flight', 'in_progress'].includes(operationStatus) || crewStatus === 'in_flight') return 'in_flight'
  if (brief.readiness?.ready === true) return 'ready'
  if (brief.crew?.assigned === true && brief.crew?.confirmed !== true) return 'crew_confirmation'
  if (brief.checklist?.exists === true && brief.checklist?.is_complete !== true) return 'preparation_active'
  if (brief.operation?.id) return 'preparation_pending'
  if (brief.payment?.confirmed === true) return 'confirmed'
  return 'payment_pending'
}

export function getCustomerFlightPresentation(brief = {}) {
  const stage = getCustomerFlightStage(brief)
  const content = {
    payment_pending: ['Información de tu vuelo', 'Completa el pago para acceder a los detalles de tu vuelo.', 'Pago pendiente'],
    confirmed: ['Información de tu vuelo', 'Ya tenemos tu reserva y estamos preparando los detalles.', 'Confirmado'],
    crew_confirmation: ['Confirmación de tu tripulación', 'Estamos terminando de confirmar al equipo que atenderá tu vuelo.', 'Tripulación en confirmación'],
    preparation_pending: ['Preparación de tu vuelo', 'Nuestro equipo realizará las verificaciones previas a tu salida.', 'Preparación pendiente'],
    preparation_active: ['Preparación en curso', 'Estamos realizando las verificaciones necesarias antes de tu salida.', 'Preparación en curso'],
    ready: ['Todo listo para tu vuelo', 'Tu vuelo está preparado para la salida.', 'Listo para salida'],
    in_flight: ['Tu vuelo está en curso', 'El seguimiento de tu vuelo ya está disponible.', 'En vuelo'],
    landed: ['Tu vuelo ha aterrizado', 'Tu vuelo llegó a destino.', 'Aterrizado'],
    completed: ['Resumen de tu vuelo', 'Gracias por volar con nosotros.', 'Completado'],
    cancelled: ['Tu vuelo fue cancelado', 'Consulta con nuestro equipo si necesitas asistencia.', 'Cancelado'],
  }[stage]

  return { stage, title: content[0], description: content[1], badge: content[2] }
}
