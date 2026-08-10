import { sanitizeProviderAircraftMutationPayload } from '../../../lib/providerContext'

///--------------------------------------------------------------------------------------------
/// VISTA DE UTILIDADES PARA EL ASISTENTE DE AERONAVES
///--------------------------------------------------------------------------------------------


function hasText(value) {
  return String(value || '').trim().length > 0
}

function toPositiveNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeAmenities(value = '') {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

const AIRCRAFT_MUTATION_MINIMAL_KEYS = [
  'model',
  'manufacturer',
  'category',
  'registration',
  'year',
  'capacity',
  'base_airport',
  'range_km',
  'speed_kmh',
  'amenities',
  'coverage',
  'hourly_rate',
]

function buildAircraftMinimalPayload(payload = {}) {
  return AIRCRAFT_MUTATION_MINIMAL_KEYS.reduce((result, key) => {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      result[key] = payload[key]
    }
    return result
  }, {})
}

export function buildAircraftMutationCandidates({
  method = 'post',
  providerPath = '',
  operatorPath = '',
  payload = {},
} = {}) {
  const normalizedMethod = String(method || 'post').trim().toLowerCase()
  const payloadVariants = [payload, buildAircraftMinimalPayload(payload)].filter(
    (candidate, index, collection) =>
      candidate &&
      Object.keys(candidate).length &&
      collection.findIndex((item) => JSON.stringify(item) === JSON.stringify(candidate)) === index,
  )

  return payloadVariants.flatMap((body) =>
    [providerPath, operatorPath]
      .filter(Boolean)
      .map((path) => ({
        method: normalizedMethod,
        path,
        body,
      })),
  )
}

function errorMessageIncludesSchemaMismatchToken(message = '') {
  const normalized = String(message || '').trim().toLowerCase()
  if (!normalized) return false

  return [
    'sqlstate',
    'undefined column',
    'does not exist',
    'internal server error',
    'column',
    'climb_descent_source',
    'climb_descent_minutes',
  ].some((token) => normalized.includes(token))
}

function normalizeBackendErrorDetail(error) {
  const candidates = [
    error?.response?.data?.message,
    error?.payload?.message,
    error?.message,
  ]

  const detail = candidates
    .map((value) => String(value || '').trim())
    .find(Boolean)

  if (!detail) return ''
  return detail.length > 220 ? `${detail.slice(0, 217)}...` : detail
}

export function resolveAircraftMutationBackendErrorMessage(
  error,
  fallback = 'La aeronave no pudo guardarse en la base de datos.',
) {
  const attempts = Array.isArray(error?.candidateAttempts) ? error.candidateAttempts : []
  const statuses = attempts
    .map((attempt) => Number(attempt?.status || 0))
    .filter((status) => Number.isFinite(status) && status > 0)
  const hasOnlyServerFailures = statuses.length > 0 && statuses.every((status) => status >= 500)
  const backendLooksMismatched =
    errorMessageIncludesSchemaMismatchToken(error?.message) ||
    errorMessageIncludesSchemaMismatchToken(error?.response?.data?.message) ||
    (hasOnlyServerFailures && attempts.length >= 2)

  if (!backendLooksMismatched) return fallback

  const backendDetail = normalizeBackendErrorDetail(error)

  return backendDetail
    ? `No se pudo guardar la aeronave porque el backend activo parece desfasado o incompatible con este flujo. Detalle backend: ${backendDetail}`
    : 'No se pudo guardar la aeronave porque el backend activo parece desfasado o incompatible con este flujo. Revisa migraciones, columnas nuevas o cambios pendientes del API antes de reintentar.'
}

export function buildAircraftWizardStepErrors(
  step,
  form,
  {
    resolveAircraftYearNumber,
    aircraftYearValidationMessage,
    selectedImageCount = 0,
    existingImageCount = 0,
    selectedDocumentCount = 0,
    existingDocumentCount = 0,
  } = {},
) {
  const errors = {}

  if (step === 1 || step === 5) {
    if (!hasText(form.name)) errors.name = 'El modelo es obligatorio.'
    if (!hasText(form.category)) errors.category = 'Selecciona una categoria.'
    if (!hasText(form.base)) errors.base = 'La base es obligatoria.'

    if (resolveAircraftYearNumber(form.year) == null) {
      errors.year = aircraftYearValidationMessage()
    }
  }

  if (step === 2 || step === 5) {
    if (toPositiveNumber(form.capacity) < 1) errors.capacity = 'La capacidad debe ser al menos 1.'
    if (toPositiveNumber(form.range_km) <= 0) {
      errors.range_km = 'Debe capturar el rango máximo de la aeronave.'
    }
    if (toPositiveNumber(form.speedKnots) <= 0) {
      errors.speedKnots = 'Ingresa una velocidad de crucero valida.'
    }
    if (toPositiveNumber(form.hourlyPrice) <= 0) {
      errors.hourlyPrice = 'Ingresa una tarifa por hora mayor a 0.'
    }
  }

  if (step === 3 || step === 5) {
    if (selectedImageCount + existingImageCount <= 0) {
      errors._gallery = 'Carga al menos una imagen comercial para la aeronave.'
    }
  }

  if (step === 4 || step === 5) {
    if (selectedDocumentCount + existingDocumentCount <= 0) {
      errors._documents = 'Carga al menos un documento antes de continuar.'
    }
  }

  return errors
}

export function buildAircraftPayload(
  form,
  {
    inferredMinimumHours,
    inferAircraftEngineType,
    knotsToKmh,
    nullableText,
    resolveAircraftYearNumber,
  },
) {
  const resolvedEngineType =
    form.engineType ||
    inferAircraftEngineType({
      category: form.category,
      model: form.name,
      engineType: form.engineType,
    })

  return sanitizeProviderAircraftMutationPayload({
    model: form.name,
    manufacturer: form.manufacturer,
    category: form.category,
    engine_type: resolvedEngineType,
    motor_tipo: String(resolvedEngineType || '').toUpperCase(),
    engine_class: form.engineClass,
    motor_clase: form.engineClass,
    registration: nullableText(form.registration),
    year: resolveAircraftYearNumber(form.year),
    capacity: Number(form.capacity || 1),
    range_km: Number(form.range_km) || null,
    speed_kmh: knotsToKmh(form.speedKnots),
    amenities: normalizeAmenities(form.amenities),
    base_airport: form.base,
    coverage: form.coverage,
    airport_expenses_usd: Number(form.airportExpensesUsd || 0),
    airport_expenses: Number(form.airportExpensesUsd || 0),
    expense_fee: Number(form.airportExpensesUsd || 0),
    hourly_rate: Number(form.hourlyPrice || 0),
    minimum_hours: inferredMinimumHours,
    operational_cost: Number(form.operationalCost || 0),
    fuel_burn_gph: Number(form.fuelBurnGallonsPerHour || 0),
    engine_reserve_rate: Number(form.engineReserveRate || 0),
    insurance_rate: Number(form.insuranceRate || 0),
    maintenance_rate: Number(form.maintenanceRate || 0),
    crew_rate: Number(form.crewRate || 0),
    repositioning_fee: Number(form.repositioningFee || 0),
    overnight_fee: Number(form.overnightFee || 0),
  })
}
