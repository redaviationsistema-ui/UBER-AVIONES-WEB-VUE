<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { featuredAirports } from '../../utils/airports'

const props = defineProps({
  reservation: { type: Object, default: null },
  reservationId: { type: [String, Number], default: '' },
  customerName: { type: String, default: '' },
  submitting: { type: Boolean, default: false },
})

const emit = defineEmits(['confirm'])
const signatureInput = ref(null)
const uploadedSignatureName = ref('')
const uploadedSignatureUrl = ref('')
const signatureError = ref('')

function resetUploadedSignature() {
  if (uploadedSignatureUrl.value) {
    URL.revokeObjectURL(uploadedSignatureUrl.value)
  }

  uploadedSignatureUrl.value = ''
  uploadedSignatureName.value = ''
  signatureError.value = ''

  if (signatureInput.value) {
    signatureInput.value.value = ''
  }
}

function openSignaturePicker() {
  signatureInput.value?.click()
}

function handleSignatureUpload(event) {
  const [file] = Array.from(event?.target?.files || [])

  if (!file) {
    resetUploadedSignature()
    return
  }

  const mimeType = String(file.type || '').toLowerCase()
  const isImage = mimeType.startsWith('image/')
  const isPngByName = String(file.name || '')
    .trim()
    .toLowerCase()
    .endsWith('.png')

  if (!isImage && !isPngByName) {
    resetUploadedSignature()
    signatureError.value = 'Sube una imagen valida para usarla como firma.'
    return
  }

  if (uploadedSignatureUrl.value) {
    URL.revokeObjectURL(uploadedSignatureUrl.value)
  }

  uploadedSignatureUrl.value = URL.createObjectURL(file)
  uploadedSignatureName.value = file.name || 'firma.png'
  signatureError.value = ''
}

onBeforeUnmount(() => {
  if (uploadedSignatureUrl.value) {
    URL.revokeObjectURL(uploadedSignatureUrl.value)
  }
})

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

function airportDisplay(code = '', airportPayload = null) {
  if (airportPayload?.city && (airportPayload?.code || airportPayload?.iata)) {
    return `${airportPayload.city} (${airportPayload.code || airportPayload.iata})`
  }

  const airport = airportMeta(code)
  if (!airport) return String(code || 'Por confirmar')
  return `${airport.city} (${airport.code || airport.iata})`
}

function formatDateTime(value = '') {
  if (!value) return 'Fecha por confirmar'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
}

function formatDate(value = '') {
  if (!value) return 'Fecha por confirmar'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(parsed)
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function parsePrice(value) {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0

  const normalized = String(value)
    .trim()
    .replace(/[^\d,.-]/g, '')

  if (!normalized) return 0

  if (normalized.includes(',') && normalized.includes('.')) {
    const parsed =
      normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
        ? Number(normalized.replace(/\./g, '').replace(',', '.'))
        : Number(normalized.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }

  if (/^\d{1,3}(,\d{3})+$/.test(normalized)) {
    const parsed = Number(normalized.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }

  if (/^\d{1,3}(\.\d{3})+$/.test(normalized)) {
    const parsed = Number(normalized.replace(/\./g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }

  const parsed = Number(normalized.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function listRequestMatches(reservation = {}) {
  const collections = [reservation.matches, reservation.matched_options]
  return collections.flatMap((items) =>
    Array.isArray(items) ? items.filter((item) => item && typeof item === 'object') : [],
  )
}

function normalizeWorkflowToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function pickPreferredClientMatch(reservation = {}) {
  const matches = listRequestMatches(reservation)
  if (!matches.length) return null

  const assignedMatchId = reservation.match_id || reservation.matched_option_id || null
  if (assignedMatchId) {
    const exactMatch = matches.find(
      (match) =>
        String(match?.match_id || match?.matched_option_id || match?.id || '') ===
        String(assignedMatchId),
    )
    if (exactMatch) return exactMatch
  }

  const assignedAircraftId = reservation.assigned_aircraft_id || reservation.aircraft_id || null
  if (assignedAircraftId) {
    const assignedMatch = matches.find(
      (match) =>
        String(match?.aircraft_id || match?.aircraft?.id || '') === String(assignedAircraftId),
    )
    if (assignedMatch) return assignedMatch
  }

  const acceptedMatch =
    matches.find((match) => {
      const normalizedStatus = normalizeWorkflowToken(
        match.status || match.workflow_status || match.state,
      )
      return ['accepted', 'aceptada', 'aceptado', 'approved', 'aprobada', 'matched'].includes(
        normalizedStatus,
      )
    }) || null

  return acceptedMatch || matches[0]
}

function resolveReservationFinalPrice(reservation = {}) {
  const pricingContext =
    reservation.pricing_context && typeof reservation.pricing_context === 'object'
      ? reservation.pricing_context
      : {}
  const snapshotRecord =
    reservation.aircraft_snapshot && typeof reservation.aircraft_snapshot === 'object'
      ? reservation.aircraft_snapshot
      : {}
  const preferredMatch = pickPreferredClientMatch(reservation) || {}

  return (
    reservation.selected_card_price ||
    pricingContext.selected_card_price ||
    reservation.final_price ||
    reservation.total ||
    reservation.estimated_total ||
    reservation.final_price_display ||
    reservation.formatted_final_price ||
    reservation.quote_total ||
    reservation.quote ||
    reservation.amount ||
    reservation.net_amount ||
    pricingContext.total ||
    pricingContext.final_price ||
    snapshotRecord.selected_card_price ||
    snapshotRecord.total ||
    snapshotRecord.final_price ||
    preferredMatch.selected_card_price ||
    preferredMatch.total ||
    preferredMatch.final_price ||
    preferredMatch.estimated_price ||
    preferredMatch.price ||
    preferredMatch.quote_total ||
    preferredMatch.quote ||
    0
  )
}

const reservationCode = computed(() => {
  const baseId = String(props.reservationId || props.reservation?.id || '').trim()
  return baseId ? `SKY-${baseId.padStart(4, '0')}` : 'SKY-PENDIENTE'
})

const itinerarySegments = computed(() => {
  const reservation = props.reservation || {}

  if (Array.isArray(reservation.legs) && reservation.legs.length) {
    return reservation.legs.map((leg, index) => ({
      key: leg.id || `leg-${index + 1}`,
      order: leg.leg_order || index + 1,
      origin: airportDisplay(leg.origin),
      destination: airportDisplay(leg.destination),
      departure: leg.departure_datetime || '',
    }))
  }

  if (Array.isArray(reservation.requirements) && reservation.requirements.length) {
    return [
      {
        key: 'base-leg',
        order: 1,
        origin: airportDisplay(reservation.origin),
        destination: airportDisplay(reservation.destination),
        departure: reservation.date || '',
      },
      ...reservation.requirements.map((leg, index) => ({
        key: leg.id || `req-${index + 2}`,
        order: leg.leg_order || index + 2,
        origin: airportDisplay(leg.origin, leg.originAirport),
        destination: airportDisplay(leg.destination, leg.destinationAirport),
        departure: leg.departure_datetime || (leg.date ? `${leg.date}T${leg.time || '09:00'}` : ''),
      })),
    ]
  }

  return [
    {
      key: 'single-leg',
      order: 1,
      origin: airportDisplay(reservation.origin),
      destination: airportDisplay(reservation.destination),
      departure: reservation.date || '',
    },
  ].filter(
    (segment) => segment.origin !== 'Por confirmar' || segment.destination !== 'Por confirmar',
  )
})

const routeDisplay = computed(() => {
  const reservation = props.reservation || {}
  const firstLeg = itinerarySegments.value[0]
  const lastLeg = itinerarySegments.value[itinerarySegments.value.length - 1]
  const origin = firstLeg?.origin || airportDisplay(reservation.origin)
  const destination = lastLeg?.destination || airportDisplay(reservation.destination)

  if (!origin && !destination) return `Contrato ${props.reservationId || reservation.id || ''}`
  return `${origin} → ${destination}`
})

const passengerLabel = computed(() => {
  const amount = Number(props.reservation?.passengers || 0)
  if (!amount) return 'Pasajeros por confirmar'
  return `${amount} ${amount === 1 ? 'pasajero' : 'pasajeros'}`
})

const aircraftLabel = computed(() => {
  return (
    props.reservation?.aircraft || props.reservation?.aircraft_category || 'Aeronave por confirmar'
  )
})

const aircraftCategory = computed(
  () => props.reservation?.aircraft_category || 'Categoría ejecutiva validada',
)
const serviceTier = computed(
  () => props.reservation?.flight_package || 'Servicio ejecutivo privado',
)
const operatorLabel = computed(
  () => props.reservation?.operator || 'Operador confirmado por SKY Group',
)
const customerLabel = computed(() => props.customerName || 'Cliente de SKY Group')
const customerAddress = computed(
  () =>
    props.reservation?.client_address ||
    props.reservation?.billing_address ||
    'Domicilio por confirmar',
)
const customerRepresentative = computed(
  () => props.reservation?.client_representative || customerLabel.value,
)
const contractDate = computed(() =>
  formatDate(props.reservation?.updated_at || props.reservation?.created_at || new Date()),
)
const departureDate = computed(() =>
  formatDateTime(props.reservation?.date || itinerarySegments.value[0]?.departure || ''),
)
const overnightLabel = computed(() => {
  const nights = Number(props.reservation?.overnight_nights || 0)
  if (!nights) return 'Sin pernocta registrada'
  return `${nights} ${nights === 1 ? 'pernocta' : 'pernoctas'}`
})

const finalPrice = computed(() => {
  const reservation = props.reservation || {}
  const resolvedFinalPrice = resolveReservationFinalPrice(reservation)
  const numericFinalPrice = parsePrice(resolvedFinalPrice)

  return (
    reservation.formatted_final_price ||
    reservation.final_price_display ||
    (typeof resolvedFinalPrice === 'string' && resolvedFinalPrice.trim() ? resolvedFinalPrice : '') ||
    (numericFinalPrice > 0 ? formatCurrency(numericFinalPrice) : 'Monto por confirmar')
  )
})

const depositAmount = computed(() => {
  const reservation = props.reservation || {}
  const rawAmount = Number(reservation.deposit_amount || reservation.deposit || 0)
  return rawAmount > 0 ? formatCurrency(rawAmount) : 'Por confirmar en Anexo A'
})

const bankAccounts = [
  {
    bank: 'BANBAJÍO',
    account: '046 76313 20201',
    clabe: '0304 209000 4337 2636',
    beneficiary: 'TRANSPORTACIÓN EXITOSA BELLIKAI S.A. DE C.V.',
    rfc: 'TEB231030NU9',
  },
  {
    bank: 'BANREGIO',
    account: '247 96234 0011',
    clabe: '05842 0000 150761410',
    beneficiary: 'TRANSPORTACIÓN EXITOSA BELLIKAI S.A. DE C.V.',
    rfc: 'TEB231030NU9',
  },
  {
    bank: 'BBVA',
    account: '0122 912627',
    clabe: '01243 800122 9126272',
    beneficiary: 'TRANSPORTACIÓN EXITOSA BELLIKAI S.A. DE C.V.',
    rfc: 'TEB231030NU9',
  },
]

const considerations = computed(() => [
  'El Prestador del Servicio declara y garantiza que cuenta con las autorizaciones, permisos, licencias, certificaciones y capacidades operativas necesarias para proporcionar y/o coordinar servicios de aviación ejecutiva conforme a la legislación aplicable y a las condiciones operativas correspondientes, mismos que serán realizados conforme al itinerario establecido en la cotización correspondiente.',
  'El Prestador del Servicio declara y garantiza que cuenta con la capacidad corporativa, comercial y de coordinación necesarias para proporcionar y/o coordinar servicios de aviación ejecutiva conforme a la legislación aplicable y a las condiciones operativas correspondientes, pudiendo para tales efectos apoyarse en operadores aéreos autorizados, contratistas y/o terceros especializados para el cumplimiento de las obligaciones derivadas del presente Contrato.',
  `El Cliente declara que cuenta con la capacidad jurídica y, en su caso, con las facultades suficientes para celebrar el presente Contrato y obligarse en los términos del mismo, incluyendo la contratación de los servicios objeto del presente instrumento. Para efectos de esta reserva, el Cliente se identifica como ${customerLabel.value}.`,
])

const definitions = computed(() => [
  '1.1 “Aeronave”: Se refiere a cualquier aeronave asignada y especificada por el Prestador del Servicio en el Anexo A y/o cotización correspondiente para la ejecución de los servicios objeto del presente Contrato, incluyendo cualquier aeronave sustituta que resulte necesaria por razones operativas, técnicas, logísticas o de disponibilidad.',
  '1.2 “Autoridad de Aviación”: Se refiere a cualquier persona que de tiempo en tiempo esté facultada con control y supervisión, o tenga jurisdicción sobre el registro, aeronavegabilidad, operación u otros asuntos relacionados con la aviación civil en México o en cualquier otro país aplicable, incluyendo el país de destino y los países sobre los cuales la Aeronave deba volar para efectos del presente Contrato.',
  '1.3 “Día hábil”: Día en el cual los bancos en los Estados Unidos Mexicanos se encuentran abiertos para realizar transacciones del tipo requerido por este Contrato.',
  '1.4 “Depósito”: Monto en dólares referido en la Sección 4 de este Contrato y detallado en el Anexo A, requerido por el Prestador del Servicio para garantizar el cumplimiento por parte del Cliente de sus obligaciones conforme al presente Contrato.',
  '1.5 “Dólares” y el signo “USD$”: Cada uno hace referencia a la moneda de curso legal de los Estados Unidos de América, salvo que se indique expresamente lo contrario. En caso de que el Cliente realice pagos en moneda nacional, el Prestador del Servicio indicará el tipo de cambio aplicable para efectos de conversión y pago correspondiente.',
  '1.6 “Fecha de Entrada en Vigencia”: Fecha de firma del presente Contrato por las partes.',
  '1.7 “Servicios Complementarios”: Se refiere a los servicios adicionales que, en su caso, podrán ser coordinados o proporcionados por el Prestador del Servicio en relación con la operación del vuelo, incluyendo bebidas, alimentos ligeros, catering ejecutivo, asistencia personalizada u otros servicios similares, sujetos a disponibilidad operativa, logística aplicable y al tipo de servicio contratado.',
  '1.8 “Impuestos y Tasas”: Incluye, respecto de los servicios descritos en el Anexo A y/o en la cotización correspondiente, todos los impuestos presentes o futuros, derechos, tarifas aeroportuarias, contribuciones, cargos operativos, recargos y demás conceptos aplicables derivados de la operación de los servicios objeto del presente Contrato, conforme a la legislación aplicable.',
  '1.9 “Costo Total del Servicio”: Se refiere al monto total establecido en la cotización correspondiente por los servicios objeto del presente Contrato.',
])

const clauses = computed(() => [
  {
    title: '2. DURACIÓN',
    paragraphs: [
      'Las disposiciones de este Contrato entrarán en vigor a partir de la Fecha de Entrada en Vigencia y permanecerán vigentes hasta la finalización del vuelo.',
    ],
  },
  {
    title: '3. SERVICIOS CONTRATADOS',
    paragraphs: [
      `Con sujeción a la Sección 5 del presente Contrato, el Prestador del Servicio proporcionará y/o coordinará a favor del Cliente los servicios de aviación ejecutiva descritos en el Anexo A y/o en la cotización correspondiente, sujetos a disponibilidad operativa, condiciones aeronáuticas aplicables y demás términos y condiciones establecidos en el presente Contrato. Para esta reserva, el servicio corresponde a la ruta ${routeDisplay.value}, con salida programada para ${departureDate.value}, aeronave ${aircraftLabel.value}, categoría ${aircraftCategory.value} y ${passengerLabel.value}.`,
    ],
  },
  {
    title: '4. COSTO TOTAL DEL SERVICIO Y DEPÓSITO',
    paragraphs: [
      `Con sujeción a las Secciones 5 y 15 del presente Contrato, el Cliente pagará al Prestador del Servicio el Costo Total del Servicio respecto de los servicios objeto del presente Contrato, conforme al Anexo A, más los Impuestos y Tasas. Para esta operación, el costo total identificado en el flujo es ${finalPrice.value}.`,
      `Al firmar este Contrato, el Cliente acepta pagar al Prestador del Servicio un Depósito en el monto indicado en el Anexo A. Para esta reserva, el depósito mostrado es ${depositAmount.value}. El Depósito se realizará mediante transferencia bancaria, al menos 48 horas antes de la salida.`,
    ],
  },
  {
    title: '5. CONDICIONES DE PAGO',
    paragraphs: [
      'El Cliente se compromete a pagar íntegramente al Prestador del Servicio, al menos siete (7) días naturales antes de la fecha de salida de cada vuelo, el Costo Total del Servicio establecido en el Anexo A respecto del vuelo correspondiente. Los Impuestos y Tasas deberán pagarse al Prestador del Servicio dentro de los siete (7) días posteriores al vuelo correspondiente.',
      'Todos los pagos del Costo Total del Servicio, más Impuestos y Tasas, así como cualquier otra cantidad a cargo del Cliente derivada del presente Contrato, deberán realizarse en dólares estadounidenses (USD$). En caso de que el Cliente efectúe el pago en moneda nacional, el Prestador del Servicio indicará el tipo de cambio aplicable para efectos de conversión correspondiente.',
      'Si algún pago vence en un día que no sea hábil, la fecha de vencimiento se trasladará al siguiente día hábil; siempre que, si dicho día cae en el mes siguiente, el vencimiento será el día hábil inmediatamente anterior.',
    ],
  },
  {
    title: '6. IMPUESTOS Y TASAS',
    paragraphs: [
      '6.1 El Cliente se compromete a pagar todos los Impuestos y Tasas definidos en la Sección 1.8 del presente Contrato, respecto de los servicios descritos en el Anexo A y/o en la cotización correspondiente, conforme a los términos y plazos establecidos en las Secciones 4 y 5 del presente Contrato.',
      '6.2 El Cliente será responsable del pago de los Impuestos y Tasas aplicables derivados de la operación del vuelo conforme a la cotización correspondiente. Dichos pagos deberán realizarse en dólares estadounidenses (USD$). En caso de efectuarse en moneda nacional, el Prestador del Servicio indicará el tipo de cambio aplicable para efectos de conversión y pago correspondiente.',
    ],
  },
  {
    title: '7. PUBLICIDAD',
    paragraphs: [
      'El Cliente no podrá utilizar el nombre, logotipo, imagen comercial, fotografías, videos, material audiovisual, denominaciones comerciales o marcas del Prestador del Servicio, ni imágenes relacionadas con la Aeronave o con la operación objeto del presente Contrato, en ningún material publicitario, promocional o comercial, sin el consentimiento previo y por escrito del Prestador del Servicio, el cual no podrá ser negado de manera irrazonable. Esta disposición será igualmente aplicable a cualquier tercero relacionado con el Cliente que tenga acceso a información, imágenes o material relacionado con la operación objeto del presente Contrato.',
    ],
  },
  {
    title: '8. EQUIPAJE',
    paragraphs: [
      'El transporte de equipaje estará sujeto a las limitaciones operativas, de seguridad y capacidad de la Aeronave asignada. El Prestador del Servicio podrá establecer restricciones razonables respecto del peso, dimensiones o contenido del equipaje conforme a criterios operativos y aeronáuticos aplicables.',
    ],
  },
  {
    title: '9. DECLARACIONES DEL PRESTADOR DEL SERVICIO',
    paragraphs: [
      'El Prestador del Servicio declara y garantiza al Cliente que las siguientes declaraciones y garantías serán verdaderas y correctas durante todo el período de vigencia de este Contrato:',
    ],
    items: [
      '9.1 El Prestador del Servicio está debidamente constituido, existe válidamente y se encuentra en buena situación legal conforme a las leyes de México.',
      'a. La Aeronave utilizada para las operaciones objeto de este Contrato será mantenida y operada en condiciones seguras y aeronavegables.',
      'i. Para cada vuelo, la Aeronave cumplirá y será operada de acuerdo con todas las leyes, normas y regulaciones de cualquier autoridad gubernamental a la que esté sujeta.',
      'ii. El Prestador del Servicio proporcionará personal suficiente, debidamente calificado, tanto de tripulación de vuelo como de cabina, así como personal de mantenimiento y otro necesario para operar y mantener la Aeronave según los horarios de vuelo establecidos en el Anexo A del presente Contrato.',
      '9.2 El Prestador del Servicio proporcionará el personal operativo, técnico y de vuelo razonablemente necesario para la correcta ejecución de los servicios objeto del presente Contrato.',
      '9.3 El Prestador del Servicio cumplirá con las disposiciones de cualquier póliza de seguro aplicable a la Aeronave y con sus obligaciones conforme a la Sección 10 del presente Contrato.',
      '9.4 El Prestador del Servicio mantendrá y conservará en vigor todas las licencias y permisos requeridos, incluyendo, sin limitación, el certificado de aeronavegabilidad y todas las licencias exigidas por ley.',
      '9.5 La firma de este Contrato por el Prestador del Servicio no contraviene ningún otro acuerdo u obligación a la que el Prestador del Servicio esté sujeto.',
      '9.6 Consentimientos y Aprobaciones: este Contrato está condicionado a la recepción oportuna por parte del Prestador del Servicio de todos los consentimientos y aprobaciones de cualquier autoridad gubernamental y de instalaciones de aterrizaje requeridos para operar los vuelos. El Prestador del Servicio hará esfuerzos comerciales razonables para obtenerlos, pero no tendrá otra responsabilidad que la devolución de cualquier pago recibido si no se obtienen los consentimientos a tiempo para la operación del vuelo contratado.',
      '9.7 Las operaciones internacionales realizadas conforme al presente Contrato podrán sujetarse a las disposiciones y limitaciones de responsabilidad previstas en los tratados internacionales aplicables en materia de aviación civil.',
    ],
  },
  {
    title: '10. SEGUROS',
    paragraphs: [
      '10.1 El Prestador del Servicio se compromete a mantener vigente, a su propio costo y durante toda la vigencia de este Contrato, seguros sobre la Aeronave que cubran responsabilidad civil frente a terceros, daños corporales y materiales, así como responsabilidad derivada de la operación de la Aeronave conforme a la legislación aplicable.',
    ],
  },
  {
    title: '11. EVENTOS DE INCUMPLIMIENTO Y TERMINACIÓN',
    paragraphs: ['11.1 Se considerará Evento de Incumplimiento cualquiera de los siguientes:'],
    items: [
      'a. Que el Cliente no pague el Costo Total del Servicio ni cualquier otra cantidad adeudada dentro de los cinco (5) Días Hábiles siguientes a la fecha de vencimiento.',
      'b. Que el Prestador del Servicio no opere un vuelo o incumpla con las obligaciones establecidas en el presente Contrato y no subsane dicho incumplimiento dentro de las veinticuatro (24) horas posteriores a la notificación escrita del Cliente.',
      'c. Que cualquiera de las partes no cumpla con cualquier otro convenio, condición o disposición de este Contrato y no subsane dicho incumplimiento dentro de siete (7) días naturales posteriores a la notificación de la parte no incumplidora.',
      'd. Que cualquiera de las partes suspenda voluntariamente todas o sustancialmente todas sus operaciones comerciales.',
      'e. Que cualquiera de las partes inicie procedimientos de quiebra, insolvencia, liquidación o protección de deudas, consienta tales procedimientos o se someta a ellos, y dichos procedimientos no sean objetados de buena fe dentro de cinco (5) días naturales, o consienta la designación de un receptor sobre su negocio y activos, o haga una cesión general en beneficio de los acreedores.',
      'f. Que un acreedor garantizado, receptor o autoridad judicial tome posesión de activos materiales de cualquiera de las partes.',
      'g. Que cualquiera de las partes suspenda pagos, no pague sus deudas en general o admita por escrito su imposibilidad de pago conforme venzan.',
      'h. Cancelación, terminación o no renovación de cualquier licencia, permiso o autorización requerida para el cumplimiento de las obligaciones bajo este Contrato.',
    ],
  },
  {
    title: '11.2 DERECHOS DE LA PARTE NO INCUMPLIDORA',
    paragraphs: [
      'Ante un Evento de Incumplimiento, la parte no incumplidora tendrá, además de otros derechos legales, el derecho de:',
    ],
    items: [
      'a. Hacer cumplir este Contrato y ser indemnizada conforme a la Sección 14.1.',
      'b. Terminar este Contrato sin responsabilidad hacia la parte incumplidora, mediante simple aviso, cesando todos los derechos de la parte incumplidora.',
      'i. Todos los montos adeudados.',
      'ii. Costos y gastos incurridos para ejercer derechos y remedios.',
      'iii. Cualquier daño directo.',
      'iv. Compensación de montos adeudados entre las partes.',
    ],
  },
  {
    title: '12. FUERZA MAYOR',
    paragraphs: [
      '12.1 Ninguna de las partes será responsable por retrasos o incumplimientos debido a causas fuera de su control, incluyendo, sin limitación: actos de Dios, actos gubernamentales, guerra civil, incendios, inundaciones, explosiones, terremotos, accidentes graves, epidemias, cuarentenas, huelgas, embargos, disturbios, insurrecciones, actos del enemigo público o daños a la Aeronave o instalaciones por causas fuera de su control razonable.',
      'El Prestador del Servicio no será responsable por modificaciones operativas, cambios de itinerario, desvíos, retrasos o cancelaciones derivados de eventos de fuerza mayor o circunstancias fuera de su control razonable.',
      'En caso de fuerza mayor, el Prestador del Servicio reembolsará al Cliente cualquier monto pagado, menos costos administrativos, operativos y fiscales con la documentación adecuada, por vuelos no operados.',
      '12.2 Ante fuerza mayor, el Cliente podrá cancelar uno o varios vuelos según el Anexo A, con intención de reanudar tan pronto se supere la fuerza mayor; o terminar el Contrato mediante aviso escrito con efecto inmediato, sin responsabilidad.',
    ],
  },
  {
    title: '13. INDEMNIZACIÓN',
    paragraphs: [
      '13.1 El Prestador del Servicio indemnizará y mantendrá indemne al Cliente, sus empleados, agentes, directores, contratistas y representantes frente a cualquier responsabilidad, costo, pérdida, daño, reclamación, demanda, acción judicial o gasto derivado total o parcialmente de este Contrato o de la operación de la Aeronave, salvo cuando sea atribuible directamente a negligencia grave o conducta dolosa del Cliente o sus representantes.',
      '13.2 El Cliente indemnizará y mantendrá indemne al Prestador del Servicio frente a pérdidas, gastos, daños, demandas y reclamaciones originadas por negligencia grave o conducta dolosa del Cliente.',
      '13.3 Las disposiciones de indemnización sobrevivirán la terminación de este Contrato.',
      '13.4 El Prestador del Servicio será responsable conforme a la legislación aplicable por daños derivados directamente de la operación de la Aeronave, salvo en los casos atribuibles a negligencia grave o conducta dolosa del Cliente.',
      '13.5 El Prestador del Servicio será responsable conforme a la legislación aplicable por daños ocasionados a terceros derivados de la operación de la Aeronave, salvo en los casos atribuibles a negligencia grave o conducta dolosa del Cliente.',
    ],
  },
  {
    title: '14. LEY APLICABLE',
    paragraphs: [
      '14.1 Este Contrato se interpretará y hará cumplir de acuerdo con las leyes de los Estados Unidos Mexicanos. Las partes se someten irrevocablemente a la jurisdicción de los tribunales de la Ciudad de México para cualquier acción o procedimiento derivado o relacionado con este Contrato.',
    ],
  },
  {
    title: '15. DISPOSICIONES VARIAS',
    items: [
      '15.1 Acuerdo Completo: Este Contrato y sus Anexos constituyen el acuerdo completo entre las partes y reemplazan cualquier acuerdo previo. Solo podrá modificarse mediante escrito firmado por representantes autorizados de ambas partes.',
      '15.2 No Renuncia: Ninguna renuncia será válida a menos que se realice por escrito y no constituirá renuncia continua ni de otras disposiciones.',
      '15.3 Separabilidad: Si alguna disposición fuera inválida o inaplicable en alguna jurisdicción, no afectará la validez de las demás disposiciones.',
      '15.4 No Agencia: Este Contrato no crea relación de mandato, agencia, sociedad, empresa conjunta ni otra asociación entre las partes.',
      '15.5 Políticas Operativas: El presente Contrato estará sujeto a las políticas operativas y de seguridad aplicables del Prestador del Servicio. En caso de conflicto, prevalecerán los términos del presente Contrato.',
      '15.6 Confidencialidad: Las partes se comprometen a mantener estricta confidencialidad sobre los términos del Contrato, incluyendo información financiera, operativa o comercial. El acceso se limitará a personal directivo y no se divulgará a terceros salvo necesidad para cumplir obligaciones contractuales o acuerdo escrito.',
      '15.7 Cesión: Ninguna parte puede ceder este Contrato sin consentimiento escrito de la otra parte. El Contrato será vinculante para los sucesores y cesionarios.',
      '15.8 Tiempo Esencial: El tiempo es esencial para el cumplimiento de las obligaciones de ambas partes.',
      '15.9 Ejecución en Contrapartes: El presente Contrato podrá firmarse en uno o varios ejemplares, incluyendo mediante medios electrónicos, considerándose cada uno de ellos como original y conjuntamente como un mismo instrumento jurídico.',
      '15.10 Notificaciones: Todas las notificaciones derivadas del presente Contrato deberán realizarse por escrito y entregarse personalmente en los domicilios señalados en el presente instrumento, mediante correo electrónico u otros medios electrónicos previamente autorizados por las partes. Dichas notificaciones se tendrán por recibidas en la fecha de su entrega personal o, tratándose de medios electrónicos, en la fecha de confirmación de envío o recepción correspondiente.',
      '15.11 Idioma: Las partes han solicitado expresamente que este Contrato y documentos relacionados estén redactados en español.',
    ],
  },
  {
    title: '16. POLÍTICA DE CANCELACIÓN',
    paragraphs: [
      '16.1 Sujeto a la Sección 15.1, si el Cliente cancela el vuelo, pagará al Prestador del Servicio las siguientes tarifas de cancelación, considerando como fecha de cancelación el día en que el Prestador del Servicio reciba aviso escrito:',
    ],
    items: [
      'a. Más de siete (7) días naturales antes del vuelo: 0% del Costo Total del Servicio.',
      'b. Menos de siete (7) días: 15%.',
      'c. Menos de cinco (5) días: 50%.',
      'd. Desde tres (3) días naturales: 100%, sin reembolso.',
    ],
  },
  {
    title: '17. VALIDEZ DE FIRMAS ELECTRÓNICAS',
    paragraphs: [
      'Las partes acuerdan que la firma del presente Contrato podrá realizarse de manera electrónica. RED AVIATION COMPANY S.A. DE C.V. hará uso de la plataforma DocuSign para la firma electrónica, la cual tendrá plena validez legal. El Cliente podrá firmar por cualquier medio digital que elija, y al hacerlo, reconoce y acepta expresamente la legalidad, validez y plena eficacia del acto de firma electrónica, asumiendo toda responsabilidad derivada de su utilización. Las firmas electrónicas tendrán la misma fuerza y efecto que una firma autógrafa para todos los efectos legales.',
    ],
  },
])
</script>

<template>
  <article class="contract-preview">
    <header class="contract-header">
      <div>
        <span class="eyebrow">Contrato {{ reservationId || reservation?.id || '' }}</span>
        <h2>Contrato completo de prestación de servicios de aviación ejecutiva</h2>
        <p>
          Esta vista integra el texto base del contrato y lo completa con la información dinámica de
          la reserva antes de la firma.
        </p>
      </div>
      <div class="contract-badge">
        <strong>{{ finalPrice }}</strong>
        <span>Costo total del servicio</span>
      </div>
    </header>

    <section class="contract-summary">
      <article class="summary-card summary-card--route">
        <span>Ruta contratada</span>
        <strong>{{ routeDisplay }}</strong>
        <small>{{ departureDate }}</small>
      </article>
      <article class="summary-card">
        <span>Aeronave</span>
        <strong>{{ aircraftLabel }}</strong>
        <small>{{ aircraftCategory }}</small>
      </article>
      <article class="summary-card">
        <span>Servicio</span>
        <strong>{{ serviceTier }}</strong>
        <small>{{ passengerLabel }}</small>
      </article>
    </section>

    <section class="contract-sheet">
      <div class="contract-sheet__head">
        <strong>Contrato de prestación de servicios de aviación ejecutiva</strong>
        <span>Referencia {{ reservationCode }}</span>
      </div>

      <div class="contract-block">
        <p class="contract-opening">
          El presente Contrato se celebra en la fecha <strong>{{ contractDate }}</strong
          >.
        </p>
        <p>
          ENTRE <strong>RED AVIATION COMPANY S.A. DE C.V.</strong>, sociedad constituida conforme a
          las leyes de los Estados Unidos Mexicanos, con domicilio en Circuito Alfonso G. de Orozco,
          Manzana 007, C.P. 50225, San Miguel Totoltepec, Toluca de Lerdo, Estado de México,
          legalmente representada en este acto por José Luis Hernández Ortiz, quien cuenta con
          facultades suficientes para este acto, en lo sucesivo el
          <strong>Prestador del Servicio</strong>.
        </p>
        <p>
          Y <strong>{{ customerLabel }}</strong
          >, persona física o moral según corresponda, con domicilio en
          <strong>{{ customerAddress }}</strong
          >, por su propio derecho o representada en este acto por
          <strong>{{ customerRepresentative }}</strong
          >, quien declara contar con la capacidad jurídica y/o facultades suficientes para
          obligarse en los términos del presente Contrato, en lo sucesivo el
          <strong>Cliente</strong>.
        </p>
      </div>

      <div class="contract-block">
        <h3>CONSIDERANDO QUE</h3>
        <ul class="contract-list">
          <li v-for="item in considerations" :key="item">{{ item }}</li>
        </ul>
      </div>

      <div class="contract-block">
        <h3>ANEXO “A” </h3>
        <div class="annex-table-wrap">
          <table class="annex-table">
            <tbody>
              <tr>
                <th scope="row">Reserva</th>
                <td>{{ reservationCode }}</td>
                <th scope="row">Cliente</th>
                <td>{{ customerLabel }}</td>
              </tr>
              <tr>
                <th scope="row">Operador</th>
                <td>{{ operatorLabel }}</td>
                <th scope="row">Ruta</th>
                <td>{{ routeDisplay }}</td>
              </tr>
              <tr>
                <th scope="row">Salida</th>
                <td>{{ departureDate }}</td>
                <th scope="row">Aeronave</th>
                <td>{{ aircraftLabel }}</td>
              </tr>
              <tr>
                <th scope="row">Cabina</th>
                <td>{{ aircraftCategory }}</td>
                <th scope="row">Pasajeros</th>
                <td>{{ passengerLabel }}</td>
              </tr>
              <tr>
                <th scope="row">Pernocta</th>
                <td>{{ overnightLabel }}</td>
                <th scope="row">Servicio</th>
                <td>{{ serviceTier }}</td>
              </tr>
              <tr>
                <th scope="row">Costo total</th>
                <td>{{ finalPrice }}</td>
                <th scope="row">Depósito</th>
                <td>{{ depositAmount }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="annex-legs">
          <strong>Itinerario</strong>
          <ul class="contract-list">
            <li v-for="segment in itinerarySegments" :key="segment.key">
              Tramo {{ segment.order }}: {{ segment.origin }} → {{ segment.destination }}
              <span v-if="segment.departure"> · {{ formatDateTime(segment.departure) }}</span>
            </li>
          </ul>
        </div>
      </div>

      <div class="contract-block">
        <h3>1. DEFINICIONES</h3>
        <ul class="contract-list">
          <li v-for="item in definitions" :key="item">{{ item }}</li>
        </ul>
      </div>

      <div v-for="clause in clauses" :key="clause.title" class="contract-block">
        <h3>{{ clause.title }}</h3>
        <p v-for="paragraph in clause.paragraphs || []" :key="paragraph">{{ paragraph }}</p>
        <ul v-if="clause.items?.length" class="contract-list">
          <li v-for="item in clause.items" :key="item">{{ item }}</li>
        </ul>
      </div>

      <div class="contract-block">
        <h3>CUENTAS PARA PAGO</h3>
        <div class="accounts-grid">
          <article v-for="account in bankAccounts" :key="account.bank" class="account-card">
            <strong>{{ account.bank }}</strong>
            <span>Cuenta: {{ account.account }}</span>
            <span>CLABE: {{ account.clabe }}</span>
            <span>Beneficiario: {{ account.beneficiary }}</span>
            <span>RFC: {{ account.rfc }}</span>
          </article>
        </div>
      </div>

      <div class="contract-block">
        <h3>FIRMAS</h3>
        <div class="signatures-grid">
          <article class="signature-card">
            <span>Prestador del Servicio</span>
            <strong>RED AVIATION COMPANY S.A. DE C.V.</strong>
            <small>Nombre: José Luis Hernández Ortiz</small>
            <small>Cargo: Representante Legal</small>
            <div class="signature-line"></div>
            <small>Firma</small>
          </article>
          <article class="signature-card">
            <span>Cliente</span>
            <strong>{{ customerLabel }}</strong>
            <small>Por: {{ customerRepresentative }}</small>
            <small>Cargo: Cliente / Representante</small>
            <div class="signature-line signature-line--client">
              <img
                v-if="uploadedSignatureUrl"
                :src="uploadedSignatureUrl"
                :alt="`Firma cargada por ${customerLabel}`"
                class="signature-image"
              />
            </div>
            <small>Firma</small>
          </article>
        </div>
      </div>
    </section>

    <section class="signature-panel">
      <div class="signature-box">
        <input
          ref="signatureInput"
          type="file"
          accept="image/png,image/*"
          class="signature-input"
          @change="handleSignatureUpload"
        />
        <div v-if="uploadedSignatureUrl" class="signature-uploaded">
          <img
            :src="uploadedSignatureUrl"
            :alt="`Firma cargada por ${customerLabel}`"
            class="signature-uploaded__image"
          />
          <div class="signature-uploaded__meta">
            <strong>Firma cargada</strong>
            <span>{{ uploadedSignatureName }}</span>
          </div>
        </div>
        <div v-else class="signature-box__copy">
          <strong>Firma pendiente</strong>
          <span>Sube una firma o imagen PNG para colocarla en el contrato antes de confirmar.</span>
        </div>
      </div>
      <div class="signature-actions">
        <button
          type="button"
          class="signature-action signature-action--secondary"
          @click="openSignaturePicker"
        >
          {{ uploadedSignatureUrl ? 'Cambiar firma' : 'Cargar firma o PNG' }}
        </button>
        <button
          v-if="uploadedSignatureUrl"
          type="button"
          class="signature-action signature-action--ghost"
          @click="resetUploadedSignature"
        >
          Quitar firma
        </button>
      </div>
      <small v-if="signatureError" class="signature-error">{{ signatureError }}</small>
      <button
        type="button"
        class="signature-panel__submit"
        :disabled="props.submitting"
        @click="emit('confirm')"
      >
        {{ props.submitting ? 'Procesando firma...' : 'Firmar contrato' }}
      </button>
      <small class="signature-note">Fecha de emisión del contrato: {{ contractDate }}</small>
    </section>
  </article>
</template>

<style scoped>
.contract-preview {
  display: grid;
  gap: 1rem;
}

.contract-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: start;
}

.contract-header h2,
.contract-block h3 {
  margin: 0;
  color: #111111;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
}

.contract-header p,
.contract-block p,
.contract-list li,
.contract-badge span,
.signature-box__copy span,
.signature-note,
.account-card span,
.signature-card small,
.annex-table th {
  margin: 0;
  color: #625d55;
}

.eyebrow {
  color: #8b6a24;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.contract-badge {
  display: grid;
  gap: 0.18rem;
  min-width: 220px;
  padding: 1rem 1.1rem;
  border: 1px solid rgba(191, 151, 65, 0.22);
  border-radius: 18px;
  background: linear-gradient(180deg, #fffaf0, #ffffff);
  text-align: right;
}

.contract-badge strong {
  color: #111111;
  font-size: clamp(1.6rem, 2.2vw, 2rem);
  line-height: 1;
}

.contract-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.85rem;
}

.summary-card,
.contract-sheet,
.signature-panel {
  border: 1px solid #e5e1d8;
  border-radius: 22px;
  background: #ffffff;
}

.summary-card {
  display: grid;
  gap: 0.3rem;
  padding: 1rem;
  background: linear-gradient(180deg, rgba(255, 250, 242, 0.82), #ffffff);
}

.summary-card span,
.summary-card small,
.signature-card span {
  color: #6d6252;
}

.summary-card strong,
.contract-opening strong,
.contract-block strong,
.annex-table td,
.signature-card strong {
  color: #111111;
}

.summary-card strong {
  font-size: 1.05rem;
}

.summary-card--route strong {
  font-size: 1.2rem;
}

.contract-sheet {
  display: grid;
  gap: 1rem;
  padding: clamp(1rem, 2vw, 1.35rem);
}

.contract-sheet__head {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: space-between;
  padding-bottom: 0.9rem;
  border-bottom: 1px solid #ece6d8;
}

.contract-block {
  display: grid;
  gap: 0.6rem;
}

.contract-list {
  display: grid;
  gap: 0.45rem;
  margin: 0;
  padding-left: 1.15rem;
}

.annex-table-wrap,
.accounts-grid,
.signatures-grid {
  display: grid;
  gap: 0.75rem;
}

.annex-table-wrap {
  overflow-x: auto;
}

.annex-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid #e9e2d4;
  border-radius: 16px;
  overflow: hidden;
  background: #faf8f3;
}

.annex-table th,
.annex-table td {
  padding: 0.9rem 1rem;
  border-bottom: 1px solid #e9e2d4;
  text-align: left;
  vertical-align: top;
}

.annex-table tr:last-child th,
.annex-table tr:last-child td {
  border-bottom: 0;
}

.annex-table th {
  width: 16%;
  background: #f4eee3;
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.annex-table td {
  font-weight: 700;
  text-transform: uppercase;
}

.account-card,
.signature-card {
  display: grid;
  gap: 0.2rem;
  padding: 0.9rem;
  border: 1px solid #e9e2d4;
  border-radius: 16px;
  background: #faf8f3;
}

.accounts-grid,
.signatures-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.annex-legs {
  display: grid;
  gap: 0.45rem;
}

.signature-line {
  min-height: 2.5rem;
  border-bottom: 1px solid #111111;
}

.signature-line--client {
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  overflow: hidden;
}

.signature-panel {
  display: grid;
  gap: 0.75rem;
  padding: 1rem;
}

.signature-box {
  display: grid;
  min-height: 170px;
  place-items: center;
  padding: 1.2rem;
  border: 1px dashed #b9ad96;
  border-radius: 18px;
  background: #fbf8ef;
}

.signature-input {
  display: none;
}

.signature-box__copy {
  display: grid;
  gap: 0.35rem;
  text-align: center;
}

.signature-uploaded {
  display: grid;
  gap: 0.9rem;
  width: 100%;
  justify-items: center;
}

.signature-uploaded__image,
.signature-image {
  display: block;
  max-width: min(100%, 320px);
  object-fit: contain;
}

.signature-uploaded__image {
  max-height: 132px;
}

.signature-image {
  max-height: 54px;
}

.signature-uploaded__meta {
  display: grid;
  gap: 0.2rem;
  text-align: center;
}

.signature-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.signature-action {
  min-height: 2.85rem;
  padding: 0.8rem 1rem;
  border-radius: 14px;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
}

.signature-action--secondary {
  border: 1px solid rgba(139, 106, 36, 0.24);
  background: #fbf8ef;
  color: #3c3328;
}

.signature-action--ghost {
  border: 1px solid rgba(17, 17, 17, 0.12);
  background: #ffffff;
  color: #625d55;
}

.signature-error {
  color: #a63e2f;
}

.signature-panel__submit {
  min-height: 3.35rem;
  border: 0;
  border-radius: 16px;
  background: linear-gradient(135deg, #111111, #2b2925);
  color: #ffffff;
  font-size: 1rem;
  font-weight: 800;
  cursor: pointer;
}

@media (max-width: 900px) {
  .contract-header,
  .contract-summary,
  .accounts-grid,
  .signatures-grid {
    grid-template-columns: 1fr;
  }

  .signature-actions {
    flex-direction: column;
  }

  .annex-table,
  .annex-table tbody,
  .annex-table tr,
  .annex-table th,
  .annex-table td {
    display: block;
    width: 100%;
  }

  .annex-table tr {
    border-bottom: 1px solid #e9e2d4;
  }

  .annex-table tr:last-child {
    border-bottom: 0;
  }

  .annex-table th,
  .annex-table td {
    border-bottom: 0;
  }

  .contract-badge {
    min-width: 0;
    text-align: left;
  }
}
</style>
