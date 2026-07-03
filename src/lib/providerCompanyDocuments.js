function normalizeToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
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
  const rawFieldMap = Array.isArray(raw.field_map) ? raw.field_map : []
  const hiddenColumns = new Set(hiddenFieldMapByDefinition[definition?.id] || [])
  const fieldMap = rawFieldMap
    .map((entry) => ({
      column: entry?.column || entry?.key || '',
      value: entry?.value == null ? '' : String(entry.value),
    }))
    .filter((entry) => entry.column && entry.value && !hiddenColumns.has(entry.column))

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
