/**
 * get_related_terms — returns graph-style relationships for a given term.
 */

import { getCache, isCacheUnavailable } from '../cache/termCache'
import { fuzzyFindTerm } from '../lib/fuzzyMatch'
import { usageLog } from '../lib/usageLog'

export interface GetRelatedTermsInput {
  term: string
}

export interface GetRelatedTermsOutput {
  term:    string
  slug:    string
  related: Array<{
    slug:         string
    title:        string
    relationship: string
    direction:    'outbound' | 'inbound'
    url:          string
  }>
}

export type GetRelatedTermsError =
  | { error: 'TERM_NOT_FOUND'; message: string; suggestions: string[] }
  | { error: 'CACHE_UNAVAILABLE'; message: string }

export async function getRelatedTerms(
  input: GetRelatedTermsInput
): Promise<GetRelatedTermsOutput | GetRelatedTermsError> {
  const cache = getCache()

  if (isCacheUnavailable()) {
    return { error: 'CACHE_UNAVAILABLE', message: 'Term cache is currently loading. Retry in 10 seconds.' }
  }

  const term = fuzzyFindTerm(input.term, cache)

  if (!term) {
    const suggestions = [...cache.values()].slice(0, 3).map(t => t.title)
    void usageLog({ tool: 'get_related_terms' })
    return {
      error: 'TERM_NOT_FOUND',
      message: `No Lexicon entry found for: '${input.term}'`,
      suggestions,
    }
  }

  void usageLog({ tool: 'get_related_terms', term_slug: term.slug })

  return {
    term:    term.title,
    slug:    term.slug,
    related: term.related_terms,
  }
}
