/**
 * Parses a term Markdown file into a TermObject.
 *
 * Required file structure:
 *   # {Term Title}
 *   > {Blockquote definition}
 *   {Extended definition prose}
 *   ## Related Terms
 *   ## Articles
 *   ## References
 *   ## Metadata
 *   **First used:** YYYY-MM-DD
 *   **Pillar:** {value}
 *
 * Terms missing blockquote definition or ## Metadata are excluded (returns null + warning).
 */

import { TermObject, RelatedTerm, Source } from '../types'

export interface ParseResult {
  term: TermObject | null
  warnings: string[]
}

/**
 * Parses raw Markdown content for a single term file into a TermObject.
 * Returns null if required sections are missing.
 *
 * @param slug     - derived from the filename (without .md)
 * @param markdown - raw file content
 */
export function parseTermMarkdown(slug: string, markdown: string): ParseResult {
  throw new Error('Not implemented')
}
