function normalizeCompanyCandidate(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function looksLikeCorporateSuffixOnly(value = '') {
  const normalized = normalizeCompanyCandidate(value)
    .toUpperCase()
    .replace(/[.,]/g, '')

  if (!normalized) return true

  return [
    'SA',
    'SA DE CV',
    'S A',
    'S A DE C V',
    'SAB DE CV',
    'SAPI DE CV',
    'S DE RL',
    'S DE RL DE CV',
    'SC',
    'AC',
  ].includes(normalized)
}

function looksLikePlaceholderCompany(value = '') {
  const normalized = normalizeCompanyCandidate(value)
    .toUpperCase()
    .replace(/[.,]/g, '')

  if (!normalized) return true

  return [
    'RED AVIATION',
    'REDAVIATION',
    'RED AVIATION COMPANY',
    'RED AVIATION COMPANY SA DE CV',
    'DEMO',
    'EMPRESA DEMO',
    'OPERADOR DEMO',
    'PROVEEDOR DEMO',
    'TEST',
  ].includes(normalized)
}

function isWeakCompanyCandidate(value = '') {
  const normalized = normalizeCompanyCandidate(value)

  if (!normalized) return true
  if (looksLikeCorporateSuffixOnly(normalized)) return true
  if (looksLikePlaceholderCompany(normalized)) return true
  if (normalized.length <= 2) return true

  return false
}

export function resolveBestCompanyDisplayName(...candidates) {
  const normalizedCandidates = candidates
    .flat()
    .map((candidate) => normalizeCompanyCandidate(candidate))
    .filter(Boolean)

  const strongCandidate = normalizedCandidates.find((candidate) => !isWeakCompanyCandidate(candidate))

  return strongCandidate || normalizedCandidates[0] || 'Empresa operadora'
}

export { isWeakCompanyCandidate, looksLikePlaceholderCompany }
