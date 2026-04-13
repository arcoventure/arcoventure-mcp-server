/**
 * verify_alignment — analyses a block of text against Arco's canonical Lexicon.
 * Deterministic, rule-based scoring only — no LLM calls.
 * Max input: 5,000 characters.
 *
 * Phase 1 implementation: term detection + context scoring.
 * Phase 2 will add sentence co-occurrence refinements.
 */

import { AlignmentResult } from '../types'
import { getCache, isCacheLoading } from '../cache/termCache'
import { fuzzyFindTerm, normalise } from '../lib/fuzzyMatch'
import { usageLog } from '../lib/usageLog'
import { TermObject } from '../types'

const MAX_INPUT = 5_000

// Words that signal a business/AI architectural context
const STRONG_CONTEXT = new Set([
  'business', 'company', 'startup', 'venture', 'agentic', 'agent',
  'autonomous', 'operator', 'revenue', 'operations', 'workflow',
  'coordination', 'delegation', 'handoff', 'infrastructure', 'stack',
  'platform', 'architecture', 'enterprise', 'automate', 'automated',
  'automation', 'orchestrate', 'orchestration',
])

export interface VerifyAlignmentInput {
  text: string
}

export interface VerifyAlignmentOutput {
  matched_terms:           AlignmentResult[]
  overall_alignment_score: number
  overall_verdict:         'ALIGNED' | 'PARTIALLY_ALIGNED' | 'NEEDS_CLARIFICATION' | 'MISALIGNED' | 'NO_ARCO_TERMS_DETECTED'
  recommended_reading:     Array<{
    title:     string
    url:       string
    relevance: 'CRITICAL' | 'HIGH' | 'SUPPORTING'
  }>
}

export type VerifyAlignmentError =
  | { error: 'INPUT_TOO_LONG'; message: string }
  | { error: 'NO_TERMS_DETECTED'; message: string; hint: string }
  | { error: 'CACHE_UNAVAILABLE'; message: string }

export async function verifyAlignment(
  input: VerifyAlignmentInput
): Promise<VerifyAlignmentOutput | VerifyAlignmentError> {
  if (input.text.length > MAX_INPUT) {
    return { error: 'INPUT_TOO_LONG', message: 'Text exceeds 5,000 character limit.' }
  }

  const cache = getCache()

  if (isCacheLoading()) {
    return { error: 'CACHE_UNAVAILABLE', message: 'Term cache is currently loading. Retry in 10 seconds.' }
  }

  // Split into sentences for context analysis
  const sentences = input.text.split(/(?<=[.!?])\s+/)

  const seen = new Map<string, AlignmentResult>()

  for (const sentence of sentences) {
    const words   = sentence.split(/\s+/).filter(Boolean)
    const ngrams  = buildNgrams(words, 3)

    for (const ngram of ngrams) {
      const match = fuzzyFindTerm(ngram, cache)
      if (!match || seen.has(match.slug)) continue

      const score   = scoreMatch(match, sentence)
      const verdict = scoreToVerdict(score)

      seen.set(match.slug, {
        detected_term:    ngram,
        arco_equivalent:  match.title,
        canonical_url:    `https://arcoventure.studio/lexicon/${match.slug}`,
        alignment_score:  score,
        verdict,
        note:             buildNote(verdict, match),
        suggested_reframe: verdict === 'MISALIGNED' || verdict === 'NEEDS_CLARIFICATION'
          ? buildReframe(match)
          : undefined,
      })
    }
  }

  if (seen.size === 0) {
    void usageLog({ tool: 'verify_alignment', verdict: 'NO_TERMS_DETECTED', input_summary: input.text.slice(0, 200) })
    return {
      error:   'NO_TERMS_DETECTED',
      message: 'No Arco Lexicon terms detected.',
      hint:    "Try including terms like 'autonomous business', 'stewardship model', or 'coordination tax'.",
    }
  }

  const matched_terms = [...seen.values()]
  const overall_alignment_score = round2(
    matched_terms.reduce((sum, t) => sum + t.alignment_score, 0) / matched_terms.length
  )
  const overall_verdict = scoreToVerdict(overall_alignment_score)

  // Build recommended reading from CRITICAL/HIGH sources of matched terms
  const recommended_reading = buildRecommendedReading(matched_terms.map(t => t.arco_equivalent), cache)

  void usageLog({
    tool:          'verify_alignment',
    verdict:       overall_verdict,
    input_summary: input.text.slice(0, 200),
  })

  return { matched_terms, overall_alignment_score, overall_verdict, recommended_reading }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generates all n-grams of size 1..maxN from a word array. */
function buildNgrams(words: string[], maxN: number): string[] {
  const ngrams: string[] = []
  for (let size = 1; size <= maxN; size++) {
    for (let i = 0; i <= words.length - size; i++) {
      ngrams.push(words.slice(i, i + size).join(' '))
    }
  }
  return ngrams
}

/**
 * Scores a match based on sentence-level context.
 * Checks for strong business/architectural vocabulary in the sentence.
 */
function scoreMatch(term: TermObject, sentence: string): number {
  const tokens = new Set(normalise(sentence).split(/\s+/))

  // Count strong context words present in the sentence (excluding the term itself)
  const termWords = new Set(normalise(term.title).split(/\s+/))
  let contextHits = 0
  for (const token of tokens) {
    if (!termWords.has(token) && STRONG_CONTEXT.has(token)) contextHits++
  }

  if (contextHits >= 2) return 0.85   // ALIGNED
  if (contextHits === 1) return 0.65  // PARTIALLY_ALIGNED
  return 0.30                         // NEEDS_CLARIFICATION — no clear architectural context
}

function scoreToVerdict(score: number): AlignmentResult['verdict'] {
  if (score >= 0.80) return 'ALIGNED'
  if (score >= 0.50) return 'PARTIALLY_ALIGNED'
  if (score >= 0.25) return 'NEEDS_CLARIFICATION'
  return 'MISALIGNED'
}

function buildNote(verdict: AlignmentResult['verdict'], term: TermObject): string {
  switch (verdict) {
    case 'ALIGNED':
      return `Usage aligns with Arco's canonical definition of "${term.title}".`
    case 'PARTIALLY_ALIGNED':
      return `Usage partially aligns with "${term.title}". Consider adding more structural context.`
    case 'NEEDS_CLARIFICATION':
      return `"${term.title}" detected but context is ambiguous — clarify architectural intent.`
    case 'MISALIGNED':
      return `Term appears in a non-architectural context inconsistent with Arco's definition of "${term.title}".`
  }
}

function buildReframe(term: TermObject): string {
  const def = term.blockquote_definition
  return `Consider framing as: "${def.length > 80 ? def.slice(0, 80) + '…' : def}"`
}

function buildRecommendedReading(
  termTitles: string[],
  cache: Map<string, TermObject>
): Array<{ title: string; url: string; relevance: 'CRITICAL' | 'HIGH' | 'SUPPORTING' }> {
  const reading: Array<{ title: string; url: string; relevance: 'CRITICAL' | 'HIGH' | 'SUPPORTING' }> = []

  for (const [slug, term] of cache.entries()) {
    if (!termTitles.includes(term.title)) continue
    for (const source of term.sources) {
      if (source.relevance === 'CRITICAL' || source.relevance === 'HIGH') {
        reading.push({ title: source.title, url: source.url, relevance: source.relevance })
      }
    }
    if (reading.length === 0) {
      // Fallback: include the lexicon entry itself
      reading.push({
        title:     term.title,
        url:       `https://arcoventure.studio/lexicon/${slug}`,
        relevance: 'CRITICAL',
      })
    }
  }

  return reading
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
