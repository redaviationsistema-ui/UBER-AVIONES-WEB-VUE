function normalizeToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeStatus(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function formatVisibleDocumentType(definition = null, raw = {}) {
  if (definition?.sectionKey === 'sat') return 'Constancia fiscal'
  if (definition?.sectionKey === 'legal') return 'Documento legal'

  const explicit = raw.visible_type || raw.type_label || raw.document_type_label || raw.document_kind
  return explicit ? String(explicit) : 'Documento'
}

function normalizeFieldMap(raw = {}, definition = null) {
  const rawFieldMap = Array.isArray(raw.field_map)
    ? raw.field_map
    : Array.isArray(raw.metadata?.field_map)
      ? raw.metadata.field_map
      : []
  const hiddenColumns = new Set(hiddenFieldMapByDefinition[definition?.id] || [])

  return rawFieldMap
    .map((entry) => ({
      column: entry?.column || entry?.key || '',
      value: entry?.value == null ? '' : String(entry.value),
    }))
    .filter((entry) => entry.column && entry.value && !hiddenColumns.has(entry.column))
}

const hiddenFieldMapByDefinition = {
  legal_representative_id: ['document_slot', 'document_type', 'document_category', 'document_section'],
  articles_of_incorporation: ['document_slot', 'document_type', 'document_category', 'document_section'],
  sat_certificate: ['document_slot', 'document_type', 'document_category', 'document_section'],
}

const companyDocumentDefinitions = [
  {
    id: 'sat_certificate',
    label: 'Constancia de situacion fiscal',
    sectionKey: 'sat',
    sectionLabel: 'Validacion SAT / Constancia fiscal',
    matchers: ['sat_certificate', 'constancia fiscal', 'constancia_sat', 'situacion fiscal', 'sat'],
  },
  {
    id: 'articles_of_incorporation',
    label: 'Acta constitutiva',
    sectionKey: 'legal',
    sectionLabel: 'Carga legal y respaldo',
    matchers: ['articles_of_incorporation', 'acta_constitutiva', 'acta constitutiva'],
  },
  {
    id: 'legal_representative_power',
    label: 'Poder del representante legal',
    sectionKey: 'legal',
    sectionLabel: 'Carga legal y respaldo',
    matchers: ['legal_representative_power', 'poder_representante', 'poder del representante', 'power'],
  },
  {
    id: 'legal_representative_id',
    label: 'Identificacion oficial del representante',
    sectionKey: 'legal',
    sectionLabel: 'Carga legal y respaldo',
    matchers: ['legal_representative_id', 'identificacion_representante', 'identificacion oficial', 'ine', 'pasaporte'],
  },
  {
    id: 'tax_address_proof',
    label: 'Comprobante de domicilio fiscal',
    sectionKey: 'legal',
    sectionLabel: 'Carga legal y respaldo',
    matchers: ['tax_address_proof', 'domicilio fiscal', 'comprobante domicilio', 'domicilio_fiscal'],
  },
  {
    id: 'operational_permit',
    label: 'Permiso operativo o documentacion aeronautica',
    sectionKey: 'legal',
    sectionLabel: 'Carga legal y respaldo',
    matchers: ['operational_permit', 'permiso operativo', 'documentacion aeronautica', 'permiso_operativo'],
  },
]

export function resolveCompanyDocumentDefinition(raw = {}) {
  const candidates = [
    raw.definition_key,
    raw.document_slot,
    raw.document_type,
    raw.document_category,
    raw.document_name,
    raw.original_name,
    raw.name,
    raw.file_name,
  ]

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeToken(candidate)
    if (!normalizedCandidate) continue

    for (const definition of companyDocumentDefinitions) {
      if (definition.matchers.some((matcher) => {
        const normalizedMatcher = normalizeToken(matcher)
        return normalizedCandidate === normalizedMatcher || normalizedCandidate.includes(normalizedMatcher)
      })) {
        return definition
      }
    }
  }

  return null
}

export function normalizeAdminProviderDocument(raw = {}, index = 0) {
  const definition = resolveCompanyDocumentDefinition(raw)
  const fieldMap = normalizeFieldMap(raw, definition)

  return {
    ...raw,
    id: raw.id || index + 1,
    definitionKey: raw.definition_key || definition?.id || '',
    definitionLabel:
      raw.definition_label ||
      raw.document_label ||
      definition?.label ||
      raw.original_name ||
      raw.document_name ||
      raw.name ||
      raw.file_name ||
      `Documento ${index + 1}`,
    sectionKey: raw.section_key || raw.document_section || definition?.sectionKey || 'legal',
    sectionLabel: raw.section_label || definition?.sectionLabel || 'Documentacion legal del operador',
    fieldMap,
  }
}

export function normalizeOperatorValidationDocument(raw = {}, index = 0) {
  const normalized = normalizeAdminProviderDocument(raw, index)
  const definition = resolveCompanyDocumentDefinition(raw)
  const status = normalizeStatus(
    raw.status || raw.state || raw.validation_status || raw.review_status || raw.current_status,
  )
  const uploadedAt =
    raw.uploaded_at ||
    raw.created_at ||
    raw.updated_at ||
    raw.fecha_carga ||
    ''
  const reviewedAt = raw.reviewed_at || raw.reviewedAt || raw.validated_at || raw.validatedAt || ''
  const fileUrl = raw.file_url || raw.document_url || raw.url || raw.path || ''
  const size = toNumber(raw.size || raw.file_size || raw.file_size_bytes, 0)
  const metadata = raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {}

  return {
    ...normalized,
    status: status || 'pending',
    currentStatus: status || 'pending',
    isCurrent: Boolean(raw.is_current ?? raw.isCurrent ?? true),
    version: Math.max(1, toNumber(raw.version, 1)),
    fileName: raw.file_name || raw.filename || raw.original_name || raw.name || '',
    originalName: raw.original_name || raw.file_name || raw.name || '',
    fileUrl,
    downloadUrl: raw.download_url || raw.downloadUrl || fileUrl,
    mimeType: raw.mime_type || raw.mime || raw.content_type || '',
    size,
    uploadedAt,
    reviewedAt,
    reviewedBy: raw.reviewed_by || raw.reviewedBy || raw.validated_by || raw.validatedBy || null,
    rejectionReason: raw.rejection_reason || raw.rejectionReason || '',
    metadata,
    technicalDetails: {
      version: Math.max(1, toNumber(raw.version, 1)),
      documentType: raw.document_type || '',
      documentSlot: raw.document_slot || '',
      documentCategory: raw.document_category || '',
      documentSection: raw.document_section || '',
      storageDisk: raw.storage_disk || '',
      storagePath: raw.storage_path || '',
      mimeType: raw.mime_type || raw.mime || raw.content_type || '',
      isCurrent: Boolean(raw.is_current ?? raw.isCurrent ?? true),
      metadata,
    },
    visibleType: formatVisibleDocumentType(definition, raw),
    visibleSize: size,
    visibleDate: uploadedAt,
    historyEntries: Array.isArray(raw.history) ? raw.history : [],
    versions: Array.isArray(raw.versions) ? raw.versions : [],
    fieldMap: normalizeFieldMap(raw, definition),
  }
}
