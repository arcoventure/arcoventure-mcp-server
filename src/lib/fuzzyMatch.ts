/**
 * Levenshtein-based fuzzy matching for term lookup.
 * Matches term slugs and title variants at distance ≤ 2.
 */

import { TermObject } from '../types'
import { getCacheVersion } from '../cache/termCache'
import { normalise } from './normalise'

// Re-exported so existing importers (resolveTerm, verifyAlignment) keep a single
// normalise source without each having to know where it now lives.
export { normalise }

const MAX_DISTANCE = 2

// Precomputed normalised candidates per term, rebuilt only when the cache
// changes (version bump) or its size differs from what we indexed — so the
// hot verify_alignment path does not re-normalise every term on every n-gram.
interface IndexEntry {
  term:  TermObject
  slug:  string
  title: string
}
let indexEntries: IndexEntry[] = []
let indexedVersion = -1
let indexedSize = -1

function getIndex(cache: Map<string, TermObject>): IndexEntry[] {
  const version = getCacheVersion()
  if (version === indexedVersion && cache.size === indexedSize) {
    return indexEntries
  }
  indexEntries = [...cache.values()].map((term) => ({
    term,
    slug:  normalise(term.slug).replace(/-/g, ' '),
    title: normalise(term.title),
  }))
  indexedVersion = version
  indexedSize = cache.size
  return indexEntries
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Computes the Levenshtein edit distance between two strings.
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length

  // Allocate two rows (current and previous) — O(n) space
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  let curr = new Array<number>(n + 1)

  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(
        prev[j] + 1,       // deletion
        curr[j - 1] + 1,   // insertion
        prev[j - 1] + cost // substitution
      )
    }
    ;[prev, curr] = [curr, prev]
  }

  return prev[n]
}

/**
 * Searches the cache for the best matching TermObject given a raw input string.
 * Checks against slug and normalised title. Returns the closest match at
 * Levenshtein distance ≤ 2, or null if no match is found.
 *
 * Short inputs (≤ 4 characters) are only matched on exact slug/title equality
 * to prevent generic words from matching multi-word terms.
 *
 * Reads from a precomputed normalised index and returns early on an exact
 * match, so it avoids re-normalising the whole cache on every call.
 *
 * @param input - raw user-provided term string
 * @param cache - the full in-memory term cache
 */
export function fuzzyFindTerm(
  input: string,
  cache: Map<string, TermObject>
): TermObject | null {
  if (!input.trim() || cache.size === 0) return null

  const normInput = normalise(input)
  // Replace hyphens with spaces so slug-style input matches title-style keys
  const normInputSpaced = normInput.replace(/-/g, ' ')

  // Short inputs only get exact matches to avoid false positives on generic words
  const shortInput = normInput.length <= 4

  let bestMatch: TermObject | null = null
  let bestDistance = MAX_DISTANCE + 1

  for (const entry of getIndex(cache)) {
    const candidates = [entry.slug, entry.title]

    for (const candidate of candidates) {
      // Exact match — return immediately; no point scanning the rest.
      if (normInputSpaced === candidate || normInput === entry.slug) {
        return entry.term
      }
      if (shortInput) continue

      const dist = levenshtein(normInputSpaced, candidate)
      if (dist < bestDistance) {
        bestDistance = dist
        bestMatch = entry.term
      }
    }
  }

  return bestDistance <= MAX_DISTANCE ? bestMatch : null
}
