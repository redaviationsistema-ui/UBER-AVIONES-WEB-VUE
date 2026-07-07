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
    providerId,
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

  return {
    provider_id: providerId || undefined,
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
  }
}
