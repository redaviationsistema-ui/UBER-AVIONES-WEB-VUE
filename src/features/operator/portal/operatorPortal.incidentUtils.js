export function createIncidentUtils(deps = {}) {
  const normalizeMediaUrl =
    typeof deps.normalizeMediaUrl === 'function' ? deps.normalizeMediaUrl : (value = '') => value

  function normalizeIncidentFile(raw = {}, index = 0) {
    return {
      id: raw.id || index + 1,
      name: raw.name || raw.original_name || raw.filename || `Evidencia ${index + 1}`,
      size: Number(raw.size || raw.file_size || 0),
      fileUrl: normalizeMediaUrl(raw.file_url || raw.document_url || raw.url || ''),
      fileType: raw.file_type || raw.mime_type || '',
    }
  }

  function getIncidentEvidenceKind(file = {}) {
    const mimeType = String(file?.fileType || '').toLowerCase()
    const fileUrl = String(file?.fileUrl || '').toLowerCase()
    const fileName = String(file?.name || '').toLowerCase()

    if (mimeType.startsWith('image/')) return 'image'
    if (mimeType === 'application/pdf' || fileName.endsWith('.pdf') || fileUrl.endsWith('.pdf')) return 'pdf'
    if (/\.(png|jpg|jpeg|webp|gif|bmp|svg)(\?|$)/i.test(fileUrl || fileName)) return 'image'

    return 'other'
  }

  function extractIncidentLabeledValue(text = '', label = '') {
    const source = String(text || '')
    const normalizedLabel = String(label || '').trim()
    if (!source || !normalizedLabel) return ''

    const escapedLabel = normalizedLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = source.match(new RegExp(`${escapedLabel}:\\s*([^|]+)`, 'i'))
    return String(match?.[1] || '').trim()
  }

  function buildIncidentSourceText(raw = {}) {
    return [raw.title, raw.type, raw.category, raw.comment, raw.description, raw.evidence, raw.attachment]
      .filter(Boolean)
      .join(' | ')
  }

  function normalizeIncidentStatus(value = '') {
    const normalized = String(value || '').trim().toLowerCase()

    if (!normalized) return 'Abierta'
    if (['open', 'abierta'].includes(normalized)) return 'Abierta'
    if (['in_review', 'en revision', 'en revisión', 'review'].includes(normalized)) return 'En revision'
    if (['answered', 'respondida', 'respondido'].includes(normalized)) return 'Respondida'
    if (['escalated', 'escalada', 'escalado'].includes(normalized)) return 'Escalada'
    if (['resolved', 'resuelta'].includes(normalized)) return 'Resuelta'
    if (['closed', 'cerrada'].includes(normalized)) return 'Cerrada'

    return value
  }

  function normalizeIncidentPriority(value = '') {
    const normalized = String(value || '').trim().toLowerCase()

    if (!normalized) return 'Media'
    if (['low', 'baja'].includes(normalized)) return 'Baja'
    if (['medium', 'media'].includes(normalized)) return 'Media'
    if (['high', 'alta'].includes(normalized)) return 'Alta'
    if (['critical', 'critica', 'crítica'].includes(normalized)) return 'Critica'

    return value
  }

  function normalizeIncidentType(value = '') {
    const normalized = String(value || '').trim().toLowerCase()
    const labels = {
      catering: 'Catering',
      cabina: 'Cabina',
      cliente: 'Cliente',
      seguridad: 'Seguridad',
      horario: 'Horario',
      coordinacion: 'Coordinacion',
      coordinación: 'Coordinacion',
      otro: 'Otro',
    }

    if (!normalized) return 'Problema operativo'
    const embeddedCategory = extractIncidentLabeledValue(value, 'Categoria')
    if (embeddedCategory) {
      const normalizedCategory = String(embeddedCategory).trim().toLowerCase()
      return labels[normalizedCategory] || embeddedCategory
    }

    if (normalized.includes('|')) {
      const compactSegment = String(value)
        .split('|')[0]
        .split('·')
        .map((item) => item.trim())
        .filter(Boolean)
        .find((item) => {
          const candidate = item.toLowerCase()
          return candidate && !candidate.includes('mmto') && !candidate.includes('mmmy')
        })

      if (compactSegment) return compactSegment
    }

    return labels[normalized] || value
  }

  function normalizeIncidentSource(raw = {}) {
    if (raw.source) return raw.source
    if (raw.crew_operation_id || raw.crew_id || raw.crew_name) return 'Tripulacion / Sobrecargo'
    return 'Proveedor'
  }

  function resolveIncidentPhase(raw = {}) {
    return (
      raw.phase ||
      raw.flight_phase ||
      raw.operation_phase ||
      extractIncidentLabeledValue(buildIncidentSourceText(raw), 'Fase') ||
      'Por definir'
    )
  }

  function resolveIncidentCategory(raw = {}) {
    const embedded = extractIncidentLabeledValue(buildIncidentSourceText(raw), 'Categoria')
    return normalizeIncidentType(embedded || raw.category || raw.type || raw.title)
  }

  function resolveIncidentSourceLabel(raw = {}) {
    const embedded = extractIncidentLabeledValue(buildIncidentSourceText(raw), 'Origen')
    if (embedded) return embedded
    return normalizeIncidentSource(raw)
  }

  function resolveIncidentReporter(raw = {}) {
    return (
      raw.reported_by ||
      raw.reported_by_name ||
      raw.created_by_name ||
      raw.user_name ||
      raw.crew_name ||
      raw.crew?.name ||
      extractIncidentLabeledValue(buildIncidentSourceText(raw), 'Sobrecargo') ||
      extractIncidentLabeledValue(buildIncidentSourceText(raw), 'Usuario que reporto') ||
      ''
    )
  }

  function resolveIncidentDescription(raw = {}) {
    const explicit = String(raw.comment || raw.description || '').trim()
    const embedded = extractIncidentLabeledValue(buildIncidentSourceText(raw), 'Descripcion')
    const candidate = explicit || embedded
    if (!candidate) return 'Sin descripcion visible.'
    if (candidate.includes('|')) return embedded || 'Sin descripcion visible.'
    return candidate
  }

  function buildIncidentFolio(raw = {}, normalizedId = 0, createdAt = '') {
    const sourceYear = String(createdAt || '').slice(0, 4)
    const year = /^\d{4}$/.test(sourceYear) ? sourceYear : String(new Date().getFullYear())
    const numericId = Number(raw.folio_id || raw.incident_number || normalizedId || raw.id || 0)
    const suffix = String(Math.max(numericId, 0)).padStart(5, '0')
    return `INC-${year}-${suffix}`
  }

  function normalizeIncident(raw = {}, index = 0) {
    const normalizedId = raw.id || index + 1
    const fallbackFlight =
      raw.flight ||
      raw.route ||
      raw.operation_route ||
      raw.operation ||
      (raw.crew_operation_id || raw.operation_id != null
        ? `Operacion #${raw.crew_operation_id || raw.operation_id}`
        : 'Sin vuelo')
    const evidenceFiles = Array.isArray(raw.files)
      ? raw.files.map((file, fileIndex) => normalizeIncidentFile(file, fileIndex))
      : []
    const evidenceLabel =
      raw.evidence ||
      raw.attachment ||
      evidenceFiles.map((file) => file.name).filter(Boolean).join(', ') ||
      'Pendiente'
    const createdAt = raw.created_at || raw.reported_at || null
    const sourceText = buildIncidentSourceText(raw)

    return {
      id: normalizedId,
      requestId: raw.request_id || raw.flight_request_id || raw.reservation_id || null,
      type: normalizeIncidentType(raw.type || raw.category || raw.title, raw),
      flight: fallbackFlight,
      route: raw.route || raw.flight || raw.operation_route || raw.operation || fallbackFlight,
      status: normalizeIncidentStatus(raw.status || raw.state),
      priority: normalizeIncidentPriority(raw.priority),
      phase: resolveIncidentPhase(raw),
      category: resolveIncidentCategory(raw),
      folio: buildIncidentFolio(raw, normalizedId, createdAt),
      evidence: evidenceLabel,
      evidenceFiles,
      comment: resolveIncidentDescription(raw),
      responsible: raw.responsible || raw.assigned_to || raw.owner || 'Por asignar',
      source: resolveIncidentSourceLabel(raw),
      crewName: raw.crew_name || raw.crew?.name || extractIncidentLabeledValue(sourceText, 'Sobrecargo') || '',
      reporterName: resolveIncidentReporter(raw),
      providerId: raw.provider_id || raw.provider?.id || null,
      providerName:
        raw.provider_name ||
        raw.provider?.name ||
        extractIncidentLabeledValue(sourceText, 'Empresa') ||
        '',
      operationId: raw.operation_id || raw.crew_operation_id || null,
      createdAt,
      updatedAt: raw.updated_at || raw.modified_at || createdAt,
      raw,
    }
  }

  function buildNormalizedIncidentDedupKey(incident = {}) {
    return [
      String(incident.operationId || incident.requestId || '').trim(),
      String(incident.category || incident.type || '').trim().toLowerCase(),
      String(incident.priority || '').trim().toLowerCase(),
      String(incident.route || incident.flight || '').trim().toLowerCase(),
      String(incident.comment || '').trim().toLowerCase(),
      String(incident.evidence || '').trim().toLowerCase(),
    ]
      .filter(Boolean)
      .join('::')
  }

  function scoreNormalizedIncident(incident = {}) {
    return [
      incident.providerId,
      incident.providerName,
      incident.reporterName,
      incident.crewName,
      incident.evidenceFiles?.length,
      incident.updatedAt,
      incident.raw?.admin_response,
    ].filter(Boolean).length
  }

  function mergeIncidentCollections(...collections) {
    const merged = []
    const dedupedBySignature = new Map()

    collections.flat().forEach((raw) => {
      if (!raw || typeof raw !== 'object') return

      const normalizedIncident = normalizeIncident(raw, merged.length)
      const signature = buildNormalizedIncidentDedupKey(normalizedIncident)
      const normalizedTime = Date.parse(normalizedIncident.createdAt || normalizedIncident.updatedAt || '') || 0
      const existing = dedupedBySignature.get(signature)

      if (existing) {
        const existingTime = Date.parse(existing.createdAt || existing.updatedAt || '') || 0
        const looksDuplicated =
          signature &&
          normalizedTime &&
          existingTime &&
          Math.abs(normalizedTime - existingTime) <= 120000

        if (looksDuplicated) {
          if (scoreNormalizedIncident(normalizedIncident) > scoreNormalizedIncident(existing)) {
            const targetIndex = merged.findIndex((item) => item.id === existing.id)
            if (targetIndex >= 0) {
              merged.splice(targetIndex, 1, normalizedIncident)
            }
            dedupedBySignature.set(signature, normalizedIncident)
          }
          return
        }
      }

      if (signature) {
        dedupedBySignature.set(signature, normalizedIncident)
      }

      merged.push(normalizedIncident)
    })

    return merged.sort((left, right) => {
      const rightTime = Date.parse(right.createdAt || '') || 0
      const leftTime = Date.parse(left.createdAt || '') || 0
      if (rightTime !== leftTime) return rightTime - leftTime
      return Number(right.id || 0) - Number(left.id || 0)
    })
  }

  return {
    buildIncidentFolio,
    buildIncidentSourceText,
    buildNormalizedIncidentDedupKey,
    extractIncidentLabeledValue,
    getIncidentEvidenceKind,
    mergeIncidentCollections,
    normalizeIncident,
    normalizeIncidentFile,
    normalizeIncidentPriority,
    normalizeIncidentSource,
    normalizeIncidentStatus,
    normalizeIncidentType,
    resolveIncidentCategory,
    resolveIncidentDescription,
    resolveIncidentPhase,
    resolveIncidentReporter,
    resolveIncidentSourceLabel,
    scoreNormalizedIncident,
  }
}
