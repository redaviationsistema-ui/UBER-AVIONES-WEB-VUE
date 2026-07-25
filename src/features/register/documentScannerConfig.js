export const DOCUMENT_SCAN_STAGES = [
  { key: 'preparing-image', label: 'Preparando imagen', progress: 8 },
  { key: 'verifying-quality', label: 'Verificando calidad', progress: 18 },
  { key: 'detecting-document', label: 'Detectando documento', progress: 28 },
  { key: 'correcting-perspective', label: 'Corrigiendo perspectiva', progress: 42 },
  { key: 'uploading-file', label: 'Subiendo archivo', progress: 58 },
  { key: 'reading-information', label: 'Leyendo informacion', progress: 76 },
  { key: 'validating-data', label: 'Validando datos', progress: 90 },
  { key: 'completed', label: 'Escaneo completado', progress: 100 },
]

export const DOCUMENT_TYPE_OPTIONS = [
  { value: 'ine', label: 'INE o identificacion oficial', sides: ['front', 'back'] },
  { value: 'passport', label: 'Pasaporte', sides: ['front'] },
  { value: 'driver_license', label: 'Licencia de conducir', sides: ['front', 'back'] },
  { value: 'proof_of_address', label: 'Comprobante de domicilio', sides: ['front'] },
  { value: 'visa', label: 'Visa', sides: ['front', 'back'] },
  { value: 'vehicle_registration', label: 'Tarjeta de circulacion', sides: ['front', 'back'] },
  { value: 'constancy', label: 'Constancia', sides: ['front'] },
  { value: 'certificate', label: 'Certificado', sides: ['front'] },
  { value: 'invoice', label: 'Factura', sides: ['front'] },
  { value: 'custom', label: 'Documento personalizado', sides: ['front', 'back'] },
]

export const DOCUMENT_TYPE_ALIASES = {
  INE: 'ine',
  'Licencia de sobrecargo': 'driver_license',
  'Licencia de conducir': 'driver_license',
  Pasaporte: 'passport',
  Visa: 'visa',
  'Tarjeta de circulacion': 'vehicle_registration',
  'Comprobante de domicilio': 'proof_of_address',
  Constancia: 'constancy',
  Certificado: 'certificate',
  Factura: 'invoice',
  'Documento personalizado': 'custom',
}

export const DOCUMENT_FIELD_MAP = {
  ine: ['name', 'birthDate', 'nationality', 'documentNumber', 'documentExpiration', 'ineCurp', 'ineCic', 'ineOcr'],
  passport: ['name', 'birthDate', 'nationality', 'documentNumber', 'documentIssueDate', 'documentExpiration', 'issuingCountry'],
  driver_license: [
    'name',
    'birthDate',
    'nationality',
    'documentNumber',
    'documentIssueDate',
    'documentExpiration',
    'licenseType',
    'licenseCategory',
    'issuingCountry',
  ],
  proof_of_address: ['name', 'documentIssueDate'],
  visa: ['name', 'birthDate', 'nationality', 'documentNumber', 'documentIssueDate', 'documentExpiration', 'issuingCountry'],
  vehicle_registration: ['name', 'documentNumber', 'documentIssueDate', 'documentExpiration'],
  constancy: ['name', 'documentIssueDate'],
  certificate: ['name', 'documentIssueDate', 'documentExpiration'],
  invoice: ['name', 'documentNumber', 'documentIssueDate'],
  custom: ['name', 'documentNumber', 'documentIssueDate', 'documentExpiration'],
}

export function normalizeDocumentType(value = 'ine') {
  const normalized = String(value || '').trim()
  if (!normalized) return 'ine'
  if (DOCUMENT_TYPE_ALIASES[normalized]) return DOCUMENT_TYPE_ALIASES[normalized]

  const lowered = normalized.toLowerCase()
  return (
    DOCUMENT_TYPE_OPTIONS.find((option) => option.value === lowered)?.value ||
    DOCUMENT_TYPE_OPTIONS.find((option) => option.label.toLowerCase() === lowered)?.value ||
    'custom'
  )
}

export function getDocumentTypeOption(value = 'ine') {
  const normalized = normalizeDocumentType(value)
  return DOCUMENT_TYPE_OPTIONS.find((option) => option.value === normalized) || DOCUMENT_TYPE_OPTIONS[0]
}

export function getDocumentStage(key = '') {
  return DOCUMENT_SCAN_STAGES.find((stage) => stage.key === key) || DOCUMENT_SCAN_STAGES[0]
}
