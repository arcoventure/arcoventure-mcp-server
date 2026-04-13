/**
 * lookup_term — returns the canonical Arco definition, related terms, and
 * source URL for a given Lexicon term. Supports fuzzy matching.
 */

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

/**
 * Handles the lookup_term MCP tool call.
 */
export async function lookupTerm(input: LookupTermInput): Promise<LookupTermOutput | LookupTermError> {
  throw new Error('Not implemented')
}
