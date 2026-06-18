/**
 * Shared term-resolution guard for the single-term tools (lookup_term,
 * get_related_terms, cite_term, get_sources).
 *
 * Centralises the previously copy-pasted sequence: availability guard → fuzzy
 * match → TERM_NOT_FOUND with suggestions. Suggestions are ranked by edit
 * distance to the input rather than returned in arbitrary cache-insertion
 * order, so a near-miss surfaces the closest real terms.
 */

import { TermObject } from '../types'
import { getCache, isCacheUnavailable } from '../cache/termCache'
import { fuzzyFindTerm, levenshtein, normalise } from './fuzzyMatch'

export type ResolveTermError =
  | { error: 'CACHE_UNAVAILABLE'; message: string }
  | { error: 'TERM_NOT_FOUND'; message: string; suggestions: string[] }

export type ResolveTermResult = { term: TermObject } | ResolveTermError

const CACHE_UNAVAILABLE_MESSAGE = 'Term cache is currently loading. Retry in 10 seconds.'

/**
 * Returns the closest term titles to `raw`, ranked by Levenshtein distance to
 * each term's slug or title. Used to populate TERM_NOT_FOUND suggestions.
 */
export function suggestClosestTerms(
  raw: string,
  cache: Map<string, TermObject>,
  limit = 3
): string[] {
  const input = normalise(raw).replace(/-/g, ' ')
  return [...cache.values()]
    .map((term) => {
      const slug = normalise(term.slug).replace(/-/g, ' ')
      const title = normalise(term.title)
      return { title: term.title, distance: Math.min(levenshtein(input, slug), levenshtein(input, title)) }
    })
    .sort((a, b) => a.distance - b.distance || a.title.localeCompare(b.title))
    .slice(0, limit)
    .map((entry) => entry.title)
}

export function isResolveError(result: ResolveTermResult): result is ResolveTermError {
  return 'error' in result
}

/**
 * Resolve a raw term string to a TermObject, or a structured error suitable for
 * returning directly from a tool handler.
 */
export function resolveTerm(raw: string): ResolveTermResult {
  if (isCacheUnavailable()) {
    return { error: 'CACHE_UNAVAILABLE', message: CACHE_UNAVAILABLE_MESSAGE }
  }

  const cache = getCache()
  const term = fuzzyFindTerm(raw, cache)

  if (!term) {
    return {
      error: 'TERM_NOT_FOUND',
      message: `No Lexicon entry found for: '${raw}'`,
      suggestions: suggestClosestTerms(raw, cache),
    }
  }

  return { term }
}
