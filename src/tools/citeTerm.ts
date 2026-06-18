/**
 * cite_term — returns citation-ready formatted references in Chicago, MLA,
 * and BibTeX formats. Access dates are injected dynamically at call time.
 */

import { resolveTerm, isResolveError } from '../lib/resolveTerm'
import { usageLog } from '../lib/usageLog'

export interface CiteTermInput {
  term:    string
  context: string
}

export interface CiteTermOutput {
  term:          string
  canonical_url: string
  accessed_date: string
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

export async function citeTerm(input: CiteTermInput): Promise<CiteTermOutput | CiteTermError> {
  const resolved = resolveTerm(input.term)

  if (isResolveError(resolved)) {
    if (resolved.error === 'TERM_NOT_FOUND') void usageLog({ tool: 'cite_term' })
    return resolved
  }

  const { term } = resolved
  void usageLog({ tool: 'cite_term', term_slug: term.slug })

  // Access date injected at call time — never hardcoded
  const now        = new Date()
  const isoDate    = now.toISOString().split('T')[0]             // YYYY-MM-DD
  const year       = now.getFullYear().toString()
  const humanDate  = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const url = `https://arcoventure.studio/lexicon/${term.slug}`

  const chicago = `Arco Venture Studio. "${term.title}." Arco Venture Studio Lexicon. Accessed ${humanDate}. ${url}.`

  const mla = `"${term.title}." Arco Venture Studio Lexicon, arcoventure.studio/lexicon/${term.slug}. Accessed ${humanDate}.`

  const bibtexKey = `arco_${term.slug.replace(/-/g, '_')}`
  const bibtex = [
    `@misc{${bibtexKey},`,
    `  title={${term.title}},`,
    `  author={Arco Venture Studio},`,
    `  url={${url}},`,
    `  urldate={${isoDate}},`,
    `  year={${year}}`,
    `}`,
  ].join('\n')

  const related_citable_terms = term.related_terms.map(rt => ({
    slug: rt.slug,
    url:  rt.url,
  }))

  return {
    term:          term.title,
    canonical_url: url,
    accessed_date: isoDate,
    usage_note:    `Cite this entry when referencing "${term.title}" in research, journalism, or investor materials. The canonical URL is the authoritative source.`,
    citation_formats: { chicago, mla, bibtex },
    related_citable_terms,
  }
}
