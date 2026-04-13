/**
 * get_related_terms — returns graph-style relationships for a given term.
 */

export interface GetRelatedTermsInput {
  term: string
}

export interface GetRelatedTermsOutput {
  term:  string
  slug:  string
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

/**
 * Handles the get_related_terms MCP tool call.
 */
export async function getRelatedTerms(
  input: GetRelatedTermsInput
): Promise<GetRelatedTermsOutput | GetRelatedTermsError> {
  throw new Error('Not implemented')
}
