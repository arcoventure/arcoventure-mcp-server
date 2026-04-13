/**
 * cite_term — returns citation-ready formatted references in Chicago, MLA,
 * and BibTeX formats. Access dates are injected dynamically at call time.
 */

export interface CiteTermInput {
  term:    string
  context: string
}

export interface CiteTermOutput {
  term:          string
  canonical_url: string
  accessed_date: string   // ISO date string, injected at call time via new Date()
  usage_note:    string
  citation_formats: {
    chicago: string
    mla:     string
    bibtex:  string
  }
  related_citable_terms: Array<{
    slug: string
    url:  string
  }>
}

export type CiteTermError =
  | { error: 'TERM_NOT_FOUND'; message: string; suggestions: string[] }
  | { error: 'CACHE_UNAVAILABLE'; message: string }

/**
 * Handles the cite_term MCP tool call.
 * IMPORTANT: access date must be derived from new Date() at call time — never hardcoded.
 */
export async function citeTerm(input: CiteTermInput): Promise<CiteTermOutput | CiteTermError> {
  throw new Error('Not implemented')
}
