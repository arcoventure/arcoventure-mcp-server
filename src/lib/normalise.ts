/**
 * Shared string normalisation, replacing the two divergent `normalise`
 * implementations that previously lived in fuzzyMatch.ts and suggestTerms.ts.
 *
 * Default: lowercase + collapse whitespace + trim (matching-friendly, keeps
 * punctuation). With { stripPunctuation: true }: also map hyphens to spaces and
 * drop all non-alphanumeric characters (phrase-containment friendly).
 */
export function normalise(input: string, opts: { stripPunctuation?: boolean } = {}): string {
  let s = input.toLowerCase()
  if (opts.stripPunctuation) {
    s = s.replace(/-/g, ' ').replace(/[^a-z0-9 ]/g, ' ')
  }
  return s.replace(/\s+/g, ' ').trim()
}
