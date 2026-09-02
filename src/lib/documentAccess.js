import { resolveMediaUrl } from './api'

function normalizeCandidate(value = '') {
  return String(value || '').trim()
}

export function isAdminDocumentRoute(value = '') {
  const normalized = normalizeCandidate(value).toLowerCase()
  return normalized.includes('/api/v1/admin/')
}

export function resolveProviderCompanyDocumentAccess(raw = {}) {
  const directCandidates = [
    raw.url,
    raw.document_url,
    raw.documentUrl,
    raw.file_url,
    raw.fileUrl,
  ]
  const fallbackCandidates = [
    raw.download_url,
    raw.downloadUrl,
    raw.path,
    raw.storage_path,
    raw.full_path,
  ]

  const preferredDirectUrl = directCandidates
    .map((candidate) => normalizeCandidate(candidate))
    .find((candidate) => candidate && !isAdminDocumentRoute(candidate))
  const fallbackDownloadUrl = [...directCandidates, ...fallbackCandidates]
    .map((candidate) => normalizeCandidate(candidate))
    .find(Boolean)

  return {
    viewUrl: resolveMediaUrl(preferredDirectUrl || fallbackDownloadUrl || ''),
    downloadUrl: resolveMediaUrl(preferredDirectUrl || fallbackDownloadUrl || ''),
    adminDownloadUrl: resolveMediaUrl(raw.download_url || raw.downloadUrl || ''),
  }
}

export function resolveUserOfficialIdentificationRecord(raw = {}) {
  const record =
    raw?.official_identification ||
    raw?.officialIdentification ||
    raw?.profile?.tax_data?.official_identification ||
    raw?.profile?.taxData?.official_identification ||
    raw?.profile?.taxData?.officialIdentification ||
    raw?.tax_data?.official_identification ||
    raw?.taxData?.official_identification ||
    raw?.taxData?.officialIdentification ||
    {}

  return record && typeof record === 'object' ? record : {}
}

export function resolveUserOfficialIdentificationAccess(raw = {}) {
  const record = resolveUserOfficialIdentificationRecord(raw)
  const directCandidates = [
    record.url,
    record.document_url,
    record.documentUrl,
    record.file_url,
    record.fileUrl,
  ]
  const fallbackCandidates = [
    record.download_url,
    record.downloadUrl,
    record.path,
    record.storage_path,
    record.storagePath,
    record.full_path,
  ]

  const preferredDirectUrl = directCandidates
    .map((candidate) => normalizeCandidate(candidate))
    .find((candidate) => candidate && !isAdminDocumentRoute(candidate))
  const fallbackDownloadUrl = [...directCandidates, ...fallbackCandidates]
    .map((candidate) => normalizeCandidate(candidate))
    .find(Boolean)

  return {
    id: normalizeCandidate(record.id),
    name: normalizeCandidate(record.document_name || record.original_name || record.file_name || record.fileName) || 'Identificación oficial',
    storagePath: normalizeCandidate(record.storage_path || record.storagePath),
    storageDisk: normalizeCandidate(record.storage_disk || record.storageDisk),
    uploadedAt: normalizeCandidate(record.uploaded_at || record.uploadedAt),
    viewUrl: resolveMediaUrl(preferredDirectUrl || fallbackDownloadUrl || ''),
    downloadUrl: resolveMediaUrl(preferredDirectUrl || fallbackDownloadUrl || ''),
  }
}

export function resolveUserLegacyIdentityImages(raw = {}) {
  const frontUrl = normalizeCandidate(
    raw?.ine_front_url ||
      raw?.ineFrontUrl ||
      raw?.profile?.ine_front_url ||
      raw?.profile?.ineFrontUrl,
  )
  const frontPath = normalizeCandidate(
    raw?.ine_front_path ||
      raw?.ineFrontPath ||
      raw?.profile?.ine_front_path ||
      raw?.profile?.ineFrontPath,
  )
  const frontDownloadUrl = normalizeCandidate(
    raw?.ine_front_download_url ||
      raw?.ineFrontDownloadUrl ||
      raw?.profile?.ine_front_download_url ||
      raw?.profile?.ineFrontDownloadUrl,
  )
  const backUrl = normalizeCandidate(
    raw?.ine_back_url ||
      raw?.ineBackUrl ||
      raw?.profile?.ine_back_url ||
      raw?.profile?.ineBackUrl,
  )
  const backPath = normalizeCandidate(
    raw?.ine_back_path ||
      raw?.ineBackPath ||
      raw?.profile?.ine_back_path ||
      raw?.profile?.ineBackPath,
  )
  const backDownloadUrl = normalizeCandidate(
    raw?.ine_back_download_url ||
      raw?.ineBackDownloadUrl ||
      raw?.profile?.ine_back_download_url ||
      raw?.profile?.ineBackDownloadUrl,
  )

  return [
    frontUrl || frontPath
      ? {
          key: 'front',
          label: 'INE frente',
          // Paths are metadata only; only a backend-generated URL may be requested by the browser.
          url: frontUrl ? resolveMediaUrl(frontUrl) : '',
          downloadUrl: frontDownloadUrl ? resolveMediaUrl(frontDownloadUrl) : '',
          path: frontPath,
        }
      : null,
    backUrl || backPath
      ? {
          key: 'back',
          label: 'INE reverso',
          url: backUrl ? resolveMediaUrl(backUrl) : '',
          downloadUrl: backDownloadUrl ? resolveMediaUrl(backDownloadUrl) : '',
          path: backPath,
        }
      : null,
  ].filter(Boolean)
}
