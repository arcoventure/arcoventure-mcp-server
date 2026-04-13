/**
 * Levenshtein-based fuzzy matching for term lookup.
 * Matches term slugs and title variants at distance ≤ 2.
 */

import { TermObject } from '../types'

/**
 * Computes the Levenshtein edit distance between two strings.
 */
export function levenshtein(a: string, b: string): number {
  throw new Error('Not implemented')
}

/**
 * Normalises a string for comparison: lowercase, trim, collapse whitespace.
 */
export function normalise(input: string): string {
  throw new Error('Not implemented')
}

/**
 * Searches the cache for the best matching TermObject given a raw input string.
 * Checks against slug and title (normalised). Returns the closest match at
 * Levenshtein distance ≤ 2, or null if no match found.
 *
 * @param input - raw user-provided term string
 * @param cache - the full in-memory term cache
 */
export function fuzzyFindTerm(
  input: string,
  cache: Map<string, TermObject>
): TermObject | null {
  throw new Error('Not implemented')
}
