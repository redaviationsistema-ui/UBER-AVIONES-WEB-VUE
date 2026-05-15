import { api } from './api'
import { mapAirportPayload, searchFeaturedAirports } from '../utils/airports'

const configuredPath = String(import.meta.env.VITE_AIRPORT_SEARCH_PATH || '').trim()

const candidatePaths = [...new Set([
  configuredPath,
  '/search',
  '/airports/search',
  '/public/airports/search',
].filter(Boolean))]

let resolvedAirportPath = ''
const unavailableAirportPaths = new Set()

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
  const fallbackItems = searchFeaturedAirports(trimmedQuery, limit)

  if (!trimmedQuery) {
    return {
      items: fallbackItems,
      source: 'local',
    }
  }

  if (resolvedAirportPath) {
    try {
      const remoteItems = await fetchByPath(resolvedAirportPath, trimmedQuery)
      const mergedItems = mergeUniqueAirports([...remoteItems, ...fallbackItems], limit)
      return {
        items: mergedItems,
        source: remoteItems.length ? 'remote' : 'local',
      }
    } catch (error) {
      if ([404, 405].includes(Number(error?.status))) {
        unavailableAirportPaths.add(resolvedAirportPath)
      }
      resolvedAirportPath = ''
    }
  }

  for (const path of candidatePaths) {
    if (unavailableAirportPaths.has(path)) {
      continue
    }

    try {
      const remoteItems = await fetchByPath(path, trimmedQuery)
      resolvedAirportPath = path
      const mergedItems = mergeUniqueAirports([...remoteItems, ...fallbackItems], limit)
      return {
        items: mergedItems,
        source: remoteItems.length ? 'remote' : 'local',
      }
    } catch (error) {
      if ([404, 405].includes(Number(error?.status))) {
        unavailableAirportPaths.add(path)
      }
      continue
    }
  }

  return {
    items: fallbackItems,
    source: 'local',
  }
}
