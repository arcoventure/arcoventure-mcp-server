/**
 * Tests for src/health.ts — readiness reporting.
 */

import { buildHealth } from '../src/health'
import { getCache, clearCache } from '../src/cache/termCache'
import { TermObject } from '../src/types'

function term(slug: string): TermObject {
  return {
    slug,
    title: slug,
    blockquote_definition: 'def',
    extended_definition: '',
    related_terms: [],
    sources: [],
  }
}

beforeEach(() => clearCache())
afterEach(() => clearCache())

describe('buildHealth', () => {
  test('reports degraded with 503 when the cache is empty and not loading', () => {
    const { httpStatus, body } = buildHealth()
    expect(httpStatus).toBe(503)
    expect(body.status).toBe('degraded')
    expect(body.cache.term_count).toBe(0)
  })

  test('reports ok with 200 once terms are present', () => {
    getCache().set('autonomous-business', term('autonomous-business'))
    const { httpStatus, body } = buildHealth()
    expect(httpStatus).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.cache.term_count).toBe(1)
  })
})
