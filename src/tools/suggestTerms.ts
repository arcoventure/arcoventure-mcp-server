import { getCache, isCacheUnavailable } from '../cache/termCache'
import { normalise as normaliseShared } from '../lib/normalise'
import { usageLog } from '../lib/usageLog'

/** suggest_terms matches on phrase containment, so it strips punctuation. */
function normalise(s: string): string {
  return normaliseShared(s, { stripPunctuation: true })
}

const MAX_INPUT = 10_000

export interface SuggestTermsInput {
  text: string
}

interface DetectedTerm {
  slug:   string
  term:   string
  pillar: string
  note:   string
}

interface SuggestedTerm {
  slug:      string
  term:      string
  short_def: string
  pillar:    string
  reason:    string
}

export interface SuggestTermsOutput {
  detected:       DetectedTerm[]
  suggested:      SuggestedTerm[]
  total_detected: number
  total_suggested: number
}

export type SuggestTermsError =
  | { error: 'INPUT_TOO_LONG'; message: string }
  | { error: 'CACHE_UNAVAILABLE'; message: string }

export async function suggestTerms(
  input: SuggestTermsInput
): Promise<SuggestTermsOutput | SuggestTermsError> {
  if (input.text.length > MAX_INPUT) {
    return { error: 'INPUT_TOO_LONG', message: 'Text exceeds 10,000 character limit.' }
  }

  if (isCacheUnavailable()) {
    return { error: 'CACHE_UNAVAILABLE', message: 'Term cache is currently loading. Retry in 10 seconds.' }
  }

  const cache        = getCache()
  const normText     = normalise(input.text)
  const detected:  DetectedTerm[]  = []
  const suggested: SuggestedTerm[] = []
  const detectedSlugs = new Set<string>()

  for (const [slug, term] of cache.entries()) {
    const normTitle = normalise(term.title)

    // Check A — term name present (verbatim or normalised variant)
    if (termPresentInText(normTitle, normText)) {
      detected.push({
        slug,
        term:   term.title,
        pillar: term.pillar ?? 'Uncategorised',
        note:   'Term name found in text. Verify it is being used with the canonical definition.',
      })
      detectedSlugs.add(slug)
    }
  }

  for (const [slug, term] of cache.entries()) {
    if (detectedSlugs.has(slug)) continue

    // Check B — key concepts from short_def present but term name absent
    if (conceptsPresentInText(term.blockquote_definition, normText)) {
      suggested.push({
        slug,
        term:      term.title,
        short_def: term.blockquote_definition,
        pillar:    term.pillar ?? 'Uncategorised',
        reason:    'Text describes symptoms consistent with this term but does not use the canonical name.',
      })
    }
  }

  void usageLog({ tool: 'suggest_terms', input_summary: input.text.slice(0, 200) })

  return {
    detected,
    suggested,
    total_detected:  detected.length,
    total_suggested: suggested.length,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if every word of the term title appears as a contiguous
 * phrase in the text (i.e. the title's words in order).
 */
function termPresentInText(normTitle: string, normText: string): boolean {
  return normText.includes(normTitle)
}

/**
 * Splits short_def into 3–5 word n-grams. Returns true if 2+ n-grams
 * from the definition match phrases in the text.
 */
function conceptsPresentInText(shortDef: string, normText: string): boolean {
  const words   = normalise(shortDef).split(' ').filter(Boolean)
  let matches   = 0

  for (let size = 3; size <= 5; size++) {
    for (let i = 0; i <= words.length - size; i++) {
      const ngram = words.slice(i, i + size).join(' ')
      if (normText.includes(ngram)) {
        matches++
        if (matches >= 2) return true
      }
    }
  }

  return false
}
