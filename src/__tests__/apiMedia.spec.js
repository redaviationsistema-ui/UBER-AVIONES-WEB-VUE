/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'

import { getBackendOrigin, resolveMediaUrl } from '../lib/api'

describe('resolveMediaUrl', () => {
  it('keeps absolute urls untouched', () => {
    expect(resolveMediaUrl('https://example.com/aircraft/learjet.png')).toBe(
      'https://example.com/aircraft/learjet.png',
    )
  })

  it('resolves backend-root image paths against the backend origin', () => {
    expect(resolveMediaUrl('/uploads/aircraft/learjet31a.png')).toBe(
      `${getBackendOrigin()}/uploads/aircraft/learjet31a.png`,
    )
  })

  it('resolves relative media paths against the backend origin', () => {
    expect(resolveMediaUrl('storage/aircraft/learjet31a.png')).toBe(
      `${getBackendOrigin()}/storage/aircraft/learjet31a.png`,
    )
  })
})
