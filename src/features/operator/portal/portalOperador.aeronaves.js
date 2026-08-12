import { getAircraftOperationalStatusMeta } from './portalOperador.estados'

///--------------------------------------------------------------------------------------------
/// VISTA DE ASIGNACIONES DE MISION OPERATIVA PARA TRIPULACIO
///--------------------------------------------------------------------------------------------


export function createOperatorPortalAircraftDomain(ctx = {}) {
  const {
    aircraft,
    normalizeMediaUrl,
    getAircraftDocumentTypeMeta,
    getAvailabilityStatusMeta: getAvailabilityStatusMetaFromCtx,
    startOfAvailabilityDay,
    endOfAvailabilityDay,
    startOfAvailabilityWeek,
    addDays,
    toDateTimeLocalValue,
    selectedAvailabilityCalendarAircraftId,
    availabilityForm,
    availabilityWeekAnchor,
  } = ctx

  function normalizeAircraftImage(raw = {}, index = 0) {
    return {
      id: raw.id || index + 1,
      title: raw.title || raw.name || raw.kind || `Imagen ${index + 1}`,
      kind: String(raw.kind || raw.slot || (index === 0 ? 'main' : 'gallery')).toLowerCase(),
      imageUrl: normalizeMediaUrl(raw.image_url || raw.url || raw.path || ''),
    }
  }

  function normalizeAircraftDocument(raw = {}, index = 0) {
    const type = raw.type || raw.document_type || 'documento'
    const fileUrl = normalizeMediaUrl(raw.file_url || raw.document_url || raw.url || '')
    const fileType = raw.file_type || raw.mime_type || ''
    const fileName =
      raw.original_file_name ||
      raw.document_name ||
      raw.name ||
      raw.file_name ||
      (fileUrl ? fileUrl.split('/').pop()?.split('?')[0] : '') ||
      `Documento ${index + 1}`

    return {
      id: raw.id || index + 1,
      type,
      typeLabel: raw.label || raw.type_label || getAircraftDocumentTypeMeta(type).label,
      name: fileName,
      state: raw.status || raw.state || 'pendiente',
      statusLabel: raw.status_label || '',
      category: raw.category || '',
      categoryLabel: raw.category_label || '',
      expiresAt: raw.expires_at || raw.expiration_date || null,
      expirationLabel: raw.expiration_label || '',
      fileUrl,
      fileType,
      fileExtension: raw.file_extension || '',
      uploadedAt: raw.updated_at || raw.updatedAt || raw.created_at || raw.createdAt || null,
      updatedAt: raw.updated_at || raw.updatedAt || raw.modified_at || raw.modifiedAt || null,
      reviewedAt: raw.reviewed_at || raw.reviewedAt || null,
      reviewedBy: raw.reviewed_by || raw.reviewedBy || null,
      rejectionReason: raw.rejection_reason || raw.rejectionReason || '',
      canPreview: raw.can_preview ?? null,
      canDownload: raw.can_download ?? null,
      canReplace: raw.can_replace ?? null,
    }
  }

  function normalizeAvailability(raw = {}, index = 0) {
    return {
      id: raw.id ?? raw.availability_id ?? raw.block_id ?? null,
      aircraftId: raw.aircraft_id ?? raw.aircraft?.id ?? raw.aircraftId ?? null,
      aircraft:
        raw.aircraft?.model ||
        raw.aircraft?.name ||
        aircraft.value.find(
          (plane) => plane.id === Number(raw.aircraft_id ?? raw.aircraft?.id ?? raw.aircraftId),
        )?.name ||
        `Aeronave ${index + 1}`,
      from: raw.start_datetime || raw.starts_at || raw.start_at || raw.from || '',
      to: raw.end_datetime || raw.ends_at || raw.end_at || raw.to || '',
      status: raw.status || 'Disponible',
      reason: raw.notes || raw.reason || 'Estado actual',
    }
  }

  function humanizeAircraftStatus(status = '') {
    return getAircraftOperationalStatusMeta({ status }).label
  }

  function getAvailabilityStatusMeta(status = '') {
    return (
      getAvailabilityStatusMetaFromCtx?.(status) || {
        label: status || 'Bloqueo',
        tone: 'neutral',
        short: 'Info',
      }
    )
  }

  function getAvailabilityEntriesForAircraft(plane, entries = []) {
    return entries.filter((entry) => Number(entry.aircraftId) === Number(plane.id))
  }

  function buildAvailabilityCalendarCell(plane, date, entries = []) {
    const dayStart = startOfAvailabilityDay(date)
    const dayEnd = endOfAvailabilityDay(date)
    const matchingEntries = getAvailabilityEntriesForAircraft(plane, entries).filter((entry) => {
      const from = new Date(entry.from)
      const to = new Date(entry.to)
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return false
      return from <= dayEnd && to >= dayStart
    })

    const primaryEntry = matchingEntries[0] || null
    const statusMeta = getAvailabilityStatusMeta(primaryEntry?.status || 'Disponible')

    return {
      key: `${plane.id}-${dayStart.toISOString()}`,
      date: dayStart,
      tone: primaryEntry ? statusMeta.tone : 'success',
      label: primaryEntry ? statusMeta.short : 'Libre',
      title: primaryEntry ? statusMeta.label : 'Disponible',
      detail: primaryEntry ? primaryEntry.reason : 'Sin bloqueos registrados',
      entries: matchingEntries,
      primaryEntry,
      isAvailable: !primaryEntry,
    }
  }

  function moveAvailabilityWeek(offset) {
    availabilityWeekAnchor.value = startOfAvailabilityWeek(addDays(availabilityWeekAnchor.value, offset * 7))
  }

  function jumpAvailabilityWeekToToday() {
    availabilityWeekAnchor.value = startOfAvailabilityWeek(new Date())
  }

  function selectAvailabilityCalendarCell(plane, cell) {
    availabilityForm.aircraftId = plane.id
    selectedAvailabilityCalendarAircraftId.value = String(plane.id)

    const startDate = startOfAvailabilityDay(cell.date)
    startDate.setHours(9, 0, 0, 0)
    const endDate = new Date(startDate)
    endDate.setHours(18, 0, 0, 0)

    availabilityForm.from = toDateTimeLocalValue(startDate)
    availabilityForm.to = toDateTimeLocalValue(endDate)
    availabilityForm.status = cell.primaryEntry?.status || 'No disponible'
    availabilityForm.reason = cell.primaryEntry?.reason || 'Bloqueo manual'
  }

  return {
    buildAvailabilityCalendarCell,
    getAvailabilityEntriesForAircraft,
    getAvailabilityStatusMeta,
    humanizeAircraftStatus,
    jumpAvailabilityWeekToToday,
    moveAvailabilityWeek,
    normalizeAircraftDocument,
    normalizeAircraftImage,
    normalizeAvailability,
    selectAvailabilityCalendarCell,
  }
}
