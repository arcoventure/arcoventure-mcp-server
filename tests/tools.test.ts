/**
 * Unit tests for the term tools that previously had no coverage:
 * lookup_term, get_related_terms, cite_term, get_sources, list_terms.
 *
 * usageLog is mocked to a no-op so the fire-and-forget Supabase path never runs.
 */

jest.mock('../src/lib/usageLog', () => ({ usageLog: jest.fn() }))

import { getCache, clearCache } from '../src/cache/termCache'
import { TermObject, Source, RelatedTerm } from '../src/types'
import { lookupTerm } from '../src/tools/lookupTerm'
import { getRelatedTerms } from '../src/tools/getRelatedTerms'
import { citeTerm } from '../src/tools/citeTerm'
import { getSources } from '../src/tools/getSources'
import { listTerms } from '../src/tools/listTerms'

function isError(result: object): result is { error: string } {
  return 'error' in result
}

const related: RelatedTerm = {
  slug: 'stewardship-model',
  title: 'Stewardship Model',
  relationship: 'Autonomous Business is overseen via the Stewardship Model.',
  direction: 'outbound',
  url: 'https://arcoventure.studio/lexicon/stewardship-model',
}

const source: Source = {
  type: 'lexicon_entry',
  title: 'Autonomous Business',
  url: 'https://arcoventure.studio/lexicon/autonomous-business',
  reading_order: 1,
  relevance: 'CRITICAL',
}

function makeTerm(overrides: Partial<TermObject> = {}): TermObject {
  return {
    slug: 'autonomous-business',
    title: 'Autonomous Business',
    blockquote_definition: 'A business engineered to run without human intervention.',
    extended_definition: 'Extended.',
    related_terms: [related],
    sources: [source],
    first_used: '2026-03-01',
    pillar: 'How We Think',
    ...overrides,
  }
}

function seed(...terms: TermObject[]): void {
  const cache = getCache()
  for (const t of terms) cache.set(t.slug, t)
}

beforeEach(() => clearCache())
afterEach(() => clearCache())

describe('lookup_term', () => {
  test('returns the canonical entry for an exact match', async () => {
    seed(makeTerm())
    const result = await lookupTerm({ term: 'Autonomous Business' })
    expect(isError(result)).toBe(false)
    if (isError(result)) return
    expect(result.slug).toBe('autonomous-business')
    expect(result.canonical_url).toBe('https://arcoventure.studio/lexicon/autonomous-business')
    expect(result.related_terms).toHaveLength(1)
  })

  test('returns CACHE_UNAVAILABLE when the cache is empty', async () => {
    const result = await lookupTerm({ term: 'anything' })
    expect(isError(result) && result.error).toBe('CACHE_UNAVAILABLE')
  })

  test('returns TERM_NOT_FOUND with the closest term ranked first', async () => {
    seed(makeTerm(), makeTerm({ slug: 'coordination-tax', title: 'Coordination Tax', related_terms: [], sources: [] }))
    // Far enough from any term to miss the fuzzy match, but clearly closest to
    // 'Coordination Tax' for ranking purposes.
    const result = await lookupTerm({ term: 'coordination taxes for distributed teams' })
    if (!isError(result)) throw new Error('expected TERM_NOT_FOUND')
    expect(result.error).toBe('TERM_NOT_FOUND')
    const suggestions = (result as { suggestions: string[] }).suggestions
    expect(suggestions[0]).toBe('Coordination Tax')
    expect(suggestions.length).toBeLessThanOrEqual(3)
  })
})

describe('get_related_terms', () => {
  test('returns the related graph for a term', async () => {
    seed(makeTerm())
    const result = await getRelatedTerms({ term: 'autonomous-business' })
    if (isError(result)) throw new Error('unexpected error')
    expect(result.slug).toBe('autonomous-business')
    expect(result.related[0].slug).toBe('stewardship-model')
  })
})

describe('cite_term', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-18T12:00:00Z'))
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  test('injects the current access date dynamically', async () => {
    seed(makeTerm())
    const result = await citeTerm({ term: 'autonomous-business', context: 'a journalism piece' })
    if (isError(result)) throw new Error('unexpected error')
    expect(result.accessed_date).toBe('2026-06-18')
    expect(result.citation_formats.bibtex).toContain('year={2026}')
    expect(result.citation_formats.bibtex).toContain('urldate={2026-06-18}')
  })

  test('reflects the provided context in usage_note', async () => {
    seed(makeTerm())
    const result = await citeTerm({ term: 'autonomous-business', context: 'a journalism piece' })
    if (isError(result)) throw new Error('unexpected error')
    expect(result.usage_note).toContain('a journalism piece')
  })
})

describe('get_sources', () => {
  test('returns the term sources when present', async () => {
    seed(makeTerm())
    const result = await getSources({ term: 'autonomous-business' })
    if (isError(result)) throw new Error('unexpected error')
    expect(result.total_sources).toBe(1)
    expect(result.sources[0].type).toBe('lexicon_entry')
  })

  test('falls back to the GitHub file URL when a term has no sources', async () => {
    seed(makeTerm({ sources: [] }))
    const result = await getSources({ term: 'autonomous-business' })
    if (isError(result)) throw new Error('unexpected error')
    expect(result.total_sources).toBe(1)
    expect(result.sources[0].type).toBe('github')
    expect(result.sources[0].url).toContain('/terms/autonomous-business.md')
    expect(result.sources[0].relevance).toBe('SUPPORTING')
  })
})

describe('list_terms', () => {
  test('groups terms by pillar', async () => {
    seed(makeTerm())
    const result = await listTerms({})
    if (isError(result)) throw new Error('unexpected error')
    expect(result.total).toBe(1)
    expect(result.pillars['How We Think']).toHaveLength(1)
  })

  test('accepts a valid pillar filter', async () => {
    seed(makeTerm())
    const result = await listTerms({ pillar: 'How We Think' })
    if (isError(result)) throw new Error('unexpected error')
    expect(result.total).toBe(1)
  })

  test('returns INVALID_PILLAR for an unknown pillar', async () => {
    seed(makeTerm())
    const result = await listTerms({ pillar: 'Made Up Pillar' })
    expect(isError(result) && result.error).toBe('INVALID_PILLAR')
    if (isError(result)) {
      expect((result as { valid_pillars: string[] }).valid_pillars).toContain('How We Think')
    }
  })
})
