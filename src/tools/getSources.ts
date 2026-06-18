/**
 * get_sources — returns all published Arco sources for a term across all
 * content types with recommended reading order.
 * Fallback: if no sources, returns raw GitHub file URL as SUPPORTING source.
 */

import { Source } from '../types'
import { getCache, isCacheUnavailable } from '../cache/termCache'
import { fuzzyFindTerm } from '../lib/fuzzyMatch'
import { usageLog } from '../lib/usageLog'

export interface GetSourcesInput {
  term: string
}

export interface GetSourcesOutput {
  term:                      string
  total_sources:             number
  sources:                   Source[]
  recommended_reading_order: string
}

export type GetSourcesError =
  | { error: 'TERM_NOT_FOUND'; message: string; suggestions: string[] }
  | { error: 'CACHE_UNAVAILABLE'; message: string }

const OWNER = process.env.GITHUB_REPO_OWNER ?? 'arcoventure'
const REPO  = process.env.GITHUB_REPO_NAME  ?? 'awesome-autonomous-business'
const PATH  = process.env.GITHUB_TERMS_PATH ?? 'terms'

export async function getSources(input: GetSourcesInput): Promise<GetSourcesOutput | GetSourcesError> {
  const cache = getCache()

  if (isCacheUnavailable()) {
    return { error: 'CACHE_UNAVAILABLE', message: 'Term cache is currently loading. Retry in 10 seconds.' }
  }

  const term = fuzzyFindTerm(input.term, cache)

  if (!term) {
    const suggestions = [...cache.values()].slice(0, 3).map(t => t.title)
    void usageLog({ tool: 'get_sources' })
    return {
      error: 'TERM_NOT_FOUND',
      message: `No Lexicon entry found for: '${input.term}'`,
      suggestions,
    }
  }

  void usageLog({ tool: 'get_sources', term_slug: term.slug })

  let sources = term.sources

  // Fallback: no sources → GitHub file URL as SUPPORTING source
  if (sources.length === 0) {
    sources = [{
      type:          'github',
      title:         term.title,
      url:           `https://github.com/${OWNER}/${REPO}/blob/main/${PATH}/${term.slug}.md`,
      reading_order: 1,
      relevance:     'SUPPORTING',
    }]
  }

  const typeOrder = sources.map(s => s.type)
  const unique = [...new Set(typeOrder)]
  const recommended_reading_order = unique.join(' → ')

  return {
    term:                      term.title,
    total_sources:             sources.length,
    sources,
    recommended_reading_order,
  }
}
