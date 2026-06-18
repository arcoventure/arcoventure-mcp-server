import { getCache, isCacheUnavailable } from '../cache/termCache'
import { usageLog } from '../lib/usageLog'

export interface ListTermsInput {
  pillar?: string
}

interface TermSummary {
  slug:      string
  term:      string
  short_def: string
}

export interface ListTermsOutput {
  total:   number
  pillars: Record<string, TermSummary[]>
}

export type ListTermsError =
  | { error: 'CACHE_UNAVAILABLE'; message: string }

export async function listTerms(
  input: ListTermsInput
): Promise<ListTermsOutput | ListTermsError> {
  if (isCacheUnavailable()) {
    return { error: 'CACHE_UNAVAILABLE', message: 'Term cache is currently loading. Retry in 10 seconds.' }
  }

  const cache  = getCache()
  const pillar = input.pillar?.trim() || undefined

  const grouped: Record<string, TermSummary[]> = {}

  for (const [slug, term] of cache.entries()) {
    if (pillar && term.pillar !== pillar) continue

    const key = term.pillar ?? 'Uncategorised'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push({
      slug,
      term:      term.title,
      short_def: term.blockquote_definition,
    })
  }

  // Sort terms within each pillar alphabetically
  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a, b) => a.term.localeCompare(b.term))
  }

  // Sort pillars alphabetically
  const pillars: Record<string, TermSummary[]> = {}
  for (const key of Object.keys(grouped).sort()) {
    pillars[key] = grouped[key]
  }

  const total = Object.values(pillars).reduce((sum, arr) => sum + arr.length, 0)

  void usageLog({ tool: 'list_terms', input_summary: pillar ?? 'all' })

  return { total, pillars }
}
