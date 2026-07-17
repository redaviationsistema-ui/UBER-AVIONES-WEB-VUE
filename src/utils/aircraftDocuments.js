function normalizeString(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function numericId(value) {
  if (value === null || value === undefined || value === '') return null

  const normalized = String(value).trim()
  return normalized !== '' ? normalized : null
}

export function getAircraftDocumentId(document) {
  return (
    numericId(document?.id) ??
    numericId(document?.document_id) ??
    numericId(document?.aircraft_document_id) ??
    numericId(document?.pivot?.document_id) ??
    null
  )
}

function getAircraftDocumentSignature(document) {
  const storagePath = normalizeString(
    document?.storage_path ??
      document?.storagePath ??
      document?.path ??
      document?.file_path ??
      document?.filePath,
  )
  const fileUrl = normalizeString(
    document?.file_url ??
      document?.fileUrl ??
      document?.document_url ??
      document?.documentUrl ??
      document?.url,
  )
  const documentType = normalizeString(
    document?.document_type ??
      document?.documentType ??
      document?.type ??
      document?.category,
  )
  const filename = normalizeString(
    document?.filename ??
      document?.file_name ??
      document?.fileName ??
      document?.document_name ??
      document?.name ??
      document?.original_name,
  )
  const aircraftId = normalizeString(
    document?.aircraft_id ??
      document?.aircraftId ??
      document?.aircraft?.id,
  )

  if (storagePath) {
    return `storage:${aircraftId}:${documentType}:${storagePath}`
  }

  if (fileUrl) {
    return `url:${aircraftId}:${documentType}:${fileUrl}`
  }

  if (documentType || filename) {
    return `logical:${aircraftId}:${documentType}:${filename}`
  }

  const id = getAircraftDocumentId(document)
  if (id) {
    return `id:${id}`
  }

  return 'logical::'
}

export function getAircraftDocumentKey(document) {
  const signature = getAircraftDocumentSignature(document)

  if (signature !== 'logical::') {
    return signature
  }

  const id = getAircraftDocumentId(document)
  return id ? `id:${id}` : 'document:unknown'
}

function scoreDocumentRecord(document) {
  if (!document || typeof document !== 'object') return -1

  const fields = [
    'id',
    'document_id',
    'aircraft_document_id',
    'document_name',
    'name',
    'filename',
    'document_type',
    'type',
    'status',
    'state',
    'file_url',
    'document_url',
    'storage_path',
    'thumbnail_url',
    'expires_at',
    'updated_at',
    'created_at',
    'notes',
  ]

  return fields.reduce((total, field) => {
    const value = document?.[field]
    return value === null || value === undefined || value === '' ? total : total + 1
  }, 0)
}

export function deduplicateAircraftDocuments(documents) {
  const source = Array.isArray(documents) ? documents : []
  const map = new Map()

  for (const document of source) {
    if (!document || typeof document !== 'object') continue

    const key = getAircraftDocumentKey(document)
    const current = map.get(key)

    if (!current) {
      map.set(key, document)
      continue
    }

    const currentId = Number(getAircraftDocumentId(current) || 0)
    const nextId = Number(getAircraftDocumentId(document) || 0)
    const keepNext =
      scoreDocumentRecord(document) > scoreDocumentRecord(current) ||
      nextId > currentId

    map.set(key, keepNext ? { ...current, ...document } : { ...document, ...current })
  }

  return Array.from(map.values())
}
