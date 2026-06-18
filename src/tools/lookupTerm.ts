/**
 * lookup_term — returns the canonical Arco definition, related terms, and
 * source URL for a given Lexicon term. Supports fuzzy matching.
 */

import { getCache, isCacheUnavailable } from '../cache/termCache'
import { fuzzyFindTerm } from '../lib/fuzzyMatch'
import { usageLog } from '../lib/usageLog'

export interface LookupTermInput {
  term: string
}

export interface LookupTermOutput {
  slug:                  string
  title:                 string
  blockquote_definition: string
  extended_definition?:  string
  canonical_url:         string
  related_terms:         Array<{
    slug:         string
    title:        string
    relationship: string
    direction:    'outbound' | 'inbound'
    url:          string
  }>
  first_used?: string
  pillar?:     string
  source:      string
}

export type LookupTermError =
  | { error: 'TERM_NOT_FOUND'; message: string; suggestions: string[] }
  | { error: 'CACHE_UNAVAILABLE'; message: string }

export async function lookupTerm(input: LookupTermInput): Promise<LookupTermOutput | LookupTermError> {
  const cache = getCache()

  if (isCacheUnavailable()) {
    return { error: 'CACHE_UNAVAILABLE', message: 'Term cache is currently loading. Retry in 10 seconds.' }
  }

  const term = fuzzyFindTerm(input.term, cache)

  if (!term) {
    const suggestions = [...cache.values()].slice(0, 3).map(t => t.title)
    void usageLog({ tool: 'lookup_term', term_slug: undefined })
    return {
      error: 'TERM_NOT_FOUND',
      message: `No Lexicon entry found for: '${input.term}'`,
      suggestions,
    }
  }

  void usageLog({ tool: 'lookup_term', term_slug: term.slug })

  return {
    slug:                  term.slug,
    title:                 term.title,
    blockquote_definition: term.blockquote_definition,
    extended_definition:   term.extended_definition,
    canonical_url:         `https://arcoventure.studio/lexicon/${term.slug}`,
    related_terms:         term.related_terms,
    first_used:            term.first_used,
    pillar:                term.pillar,
    source:                'github.com/arcoventure/awesome-autonomous-business',
  }
}
