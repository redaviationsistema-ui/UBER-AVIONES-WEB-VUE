import { identificationDocumentNeedsExpiration } from './identificationUpload'

export function trimText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

export function normalizeEmail(value = '') {
  return trimText(value).toLowerCase()
}

export function normalizeCurp(value = '') {
  return trimText(value).toUpperCase()
}

export function isValidEmail(value = '') {
  const normalized = normalizeEmail(value)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
}

export function isValidPhone(value = '') {
  const normalized = trimText(value)
  if (!normalized || normalized.includes('@')) return false
  if (/[A-Za-z]/.test(normalized)) return false

  const digits = normalized.replace(/\D/g, '')
  return digits.length >= 8 && digits.length <= 15
}

export function isValidDateInput(value = '') {
  const normalized = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return false

  const [year, month, day] = normalized.split('-').map(Number)
  const date = new Date(`${normalized}T00:00:00`)
  if (Number.isNaN(date.getTime())) return false

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  )
}

export function isPastOrToday(value = '') {
  if (!isValidDateInput(value)) return false

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const candidate = new Date(`${value}T00:00:00`)
  return candidate.getTime() <= today.getTime()
}

export function sanitizeRegistrationForm(form = {}) {
  return {
    companyName: trimText(form.companyName),
    commercialName: trimText(form.commercialName),
    legalName: trimText(form.legalName),
    companyPhone: trimText(form.companyPhone),
    companyEmail: normalizeEmail(form.companyEmail),
    name: trimText(form.name).toUpperCase(),
    phone: trimText(form.phone),
    birthDate: String(form.birthDate || '').trim(),
    documentType: trimText(form.documentType),
    documentNumber: trimText(form.documentNumber),
    documentExpiration: String(form.documentExpiration || '').trim(),
    nationality: trimText(form.nationality),
    ineCurp: normalizeCurp(form.ineCurp),
  }
}

export function validateProviderProfileStep(form = {}, options = {}) {
  const { requireIdentification = true } = options
  const sanitized = sanitizeRegistrationForm(form)
  const errors = {}

  if (!sanitized.companyName) {
    errors.companyName = 'Ingresa el nombre de la empresa.'
  }

  if (!sanitized.legalName) {
    errors.legalName = 'Ingresa la razon social.'
  }

  if (!sanitized.companyPhone) {
    errors.companyPhone = 'Ingresa el telefono de la empresa.'
  } else if (!isValidPhone(sanitized.companyPhone)) {
    errors.companyPhone = 'Ingresa un telefono valido.'
  }

  if (!sanitized.companyEmail) {
    errors.companyEmail = 'Ingresa el correo de la empresa.'
  } else if (!isValidEmail(sanitized.companyEmail)) {
    errors.companyEmail = 'Ingresa un correo electrónico válido.'
  }

  if (!sanitized.name) {
    errors.name = 'Ingresa el nombre completo del representante legal.'
  }

  if (!sanitized.phone) {
    errors.phone = 'Ingresa el telefono del representante.'
  } else if (!isValidPhone(sanitized.phone)) {
    errors.phone = 'Ingresa un telefono valido.'
  }

  if (!sanitized.birthDate) {
    errors.birthDate = 'Ingresa la fecha de nacimiento.'
  } else if (!isValidDateInput(sanitized.birthDate) || !isPastOrToday(sanitized.birthDate)) {
    errors.birthDate = 'Ingresa una fecha de nacimiento valida.'
  }

  if (!requireIdentification) {
    return { errors, sanitized }
  }

  if (!sanitized.documentType) {
    errors.documentType = 'Selecciona un tipo de identificación.'
  }

  if (!sanitized.documentNumber) {
    errors.documentNumber = 'Ingresa el numero de documento.'
  }

  if (
    sanitized.documentType &&
    identificationDocumentNeedsExpiration(sanitized.documentType) &&
    !sanitized.documentExpiration
  ) {
    errors.documentExpiration = 'Completa la vigencia del documento.'
  } else if (
    sanitized.documentExpiration &&
    !isValidDateInput(sanitized.documentExpiration)
  ) {
    errors.documentExpiration = 'Ingresa una vigencia valida.'
  }

  if (!sanitized.nationality) {
    errors.nationality = 'Ingresa la nacionalidad.'
  }

  if (!sanitized.ineCurp) {
    errors.ineCurp = 'Ingresa la CURP.'
  }

  return { errors, sanitized }
}
