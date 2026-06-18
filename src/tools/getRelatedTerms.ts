/**
 * get_related_terms — returns graph-style relationships for a given term.
 */

import { resolveTerm, isResolveError } from '../lib/resolveTerm'
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
  const resolved = resolveTerm(input.term)

  if (isResolveError(resolved)) {
    if (resolved.error === 'TERM_NOT_FOUND') void usageLog({ tool: 'get_related_terms' })
    return resolved
  }

  const { term } = resolved
  void usageLog({ tool: 'get_related_terms', term_slug: term.slug })

  return {
    term:    term.title,
    slug:    term.slug,
    related: term.related_terms,
  }
}
