import { api } from './api'
import { mapAirportPayload } from '../utils/airports'

const configuredPath = String(import.meta.env.VITE_AIRPORT_SEARCH_PATH || '').trim()

const candidatePaths = [
  configuredPath,
  '/airports/search',
  '/airports',
  '/public/airports/search',
  '/public/airports',
].filter(Boolean)

let resolvedAirportPath = ''

function normalizeAirportList(payload) {
  const rawList = payload?.airports || payload?.data || payload?.results || payload?.items || []
  if (!Array.isArray(rawList)) return []

  return rawList
    .map(mapAirportPayload)
    .filter((airport) => airport.code || airport.iata || airport.name)
}

function mergeUniqueAirports(primary = [], limit = 6) {
  const seen = new Set()
  const combined = primary.filter((airport) => {
    const key = `${airport.code || ''}-${airport.iata || ''}-${airport.name || ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return combined.slice(0, limit)
}

async function fetchByPath(path, query) {
  const payload = await api.get(path, {
    query: {
      search: query,
      q: query,
      term: query,
      limit: 6,
    },
  })

  return normalizeAirportList(payload)
}

export async function searchAirports(query, limit = 6) {
  const trimmedQuery = String(query || '').trim()

  if (!trimmedQuery) {
    return {
      items: [],
      source: 'remote',
    }
  }

  if (resolvedAirportPath) {
    try {
      const remoteItems = await fetchByPath(resolvedAirportPath, trimmedQuery)
      return {
        items: mergeUniqueAirports(remoteItems, limit),
        source: 'remote',
      }
    } catch {
      resolvedAirportPath = ''
    }
  }

  for (const path of candidatePaths) {
    try {
      const remoteItems = await fetchByPath(path, trimmedQuery)
      resolvedAirportPath = path
      return {
        items: mergeUniqueAirports(remoteItems, limit),
        source: 'remote',
      }
    } catch {
      continue
    }
  }

  return {
    items: [],
    source: 'remote',
  }
}
