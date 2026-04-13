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

const VALID_PILLARS = ['How We Think', 'What We Observe', "What We've Learned"] as const
type ValidPillar = typeof VALID_PILLARS[number]

const TYPE_PRIORITY: Record<Source['type'], number> = {
  lexicon_entry: 1,
  blog_article:  2,
  wiki:          3,
  podcast:       4,
  github:        5,
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parses raw Markdown content for a single term file into a TermObject.
 * Returns null if required sections (blockquote definition, ## Metadata) are missing.
 *
 * @param slug     - derived from the filename (without .md)
 * @param markdown - raw file content
 */
export function parseTermMarkdown(slug: string, markdown: string): ParseResult {
  const warnings: string[] = []

  if (!markdown.trim()) {
    warnings.push(`[${slug}] Empty file — skipping`)
    return { term: null, warnings }
  }

  // Title — fall back to slug if H1 is absent
  const titleMatch = markdown.match(/^#\s+(.+)$/m)
  const title = titleMatch ? titleMatch[1].trim() : slug

  // Blockquote definition — required
  const blockquoteMatch = markdown.match(/^>\s+(.+)$/m)
  if (!blockquoteMatch) {
    warnings.push(`[${slug}] Missing blockquote definition — skipping`)
    return { term: null, warnings }
  }
  const blockquote_definition = blockquoteMatch[1].trim()

  // ## Metadata section — required
  if (!/^##\s+Metadata/m.test(markdown)) {
    warnings.push(`[${slug}] Missing ## Metadata section — skipping`)
    return { term: null, warnings }
  }

  const sections = splitSections(markdown)

  const extended_definition = extractExtendedDefinition(markdown) || undefined

  const related_terms = parseRelatedTerms(sections['Related Terms'] ?? '')

  const sources = parseSources(
    sections['Articles']   ?? '',
    sections['References'] ?? ''
  )

  // Metadata — both fields parsed with ^ anchor so same-line pairs are rejected
  const metadataSection = sections['Metadata'] ?? ''

  const firstUsedMatch = metadataSection.match(/^\*\*First used:\*\*\s+(\d{4}-\d{2}-\d{2})/m)
  const first_used = firstUsedMatch ? firstUsedMatch[1] : undefined

  const pillarMatch = metadataSection.match(/^\*\*Pillar:\*\*\s+(.+)/m)
  const pillarRaw = pillarMatch ? pillarMatch[1].trim() : undefined
  const pillar: ValidPillar | undefined =
    pillarRaw !== undefined && (VALID_PILLARS as readonly string[]).includes(pillarRaw)
      ? (pillarRaw as ValidPillar)
      : undefined

  return {
    term: {
      slug,
      title,
      blockquote_definition,
      extended_definition,
      related_terms,
      sources,
      first_used,
      pillar,
    },
    warnings,
  }
}

// ---------------------------------------------------------------------------
// Section splitting
// ---------------------------------------------------------------------------

/**
 * Splits a Markdown document into a map of { sectionName → content }.
 * Only captures ## (H2) sections; ignores H1 and deeper headings.
 */
function splitSections(markdown: string): Record<string, string> {
  const sections: Record<string, string> = {}
  const lines = markdown.split('\n')
  let currentSection: string | null = null
  const buffer: string[] = []

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/)
    if (h2) {
      if (currentSection !== null) {
        sections[currentSection] = buffer.join('\n').trim()
        buffer.length = 0
      }
      currentSection = h2[1].trim()
    } else if (currentSection !== null) {
      buffer.push(line)
    }
  }

  if (currentSection !== null) {
    sections[currentSection] = buffer.join('\n').trim()
  }

  return sections
}

// ---------------------------------------------------------------------------
// Extended definition
// ---------------------------------------------------------------------------

/**
 * Extracts the prose block that follows the blockquote and precedes the first ## heading.
 */
function extractExtendedDefinition(markdown: string): string {
  const lines = markdown.split('\n')
  let pastBlockquote = false
  const extLines: string[] = []

  for (const line of lines) {
    if (!pastBlockquote) {
      if (line.trim().startsWith('>')) pastBlockquote = true
      continue
    }
    if (/^##?\s/.test(line)) break
    extLines.push(line)
  }

  return extLines.join('\n').trim()
}

// ---------------------------------------------------------------------------
// Related Terms
// ---------------------------------------------------------------------------

/**
 * Parses a ## Related Terms section into RelatedTerm objects.
 * Expected line format: `- [Title](URL) — relationship description`
 */
function parseRelatedTerms(sectionContent: string): RelatedTerm[] {
  const terms: RelatedTerm[] = []
  // em-dash (—), en-dash (–), or plain hyphen after the link
  const lineRegex = /^\s*-\s+\[([^\]]+)\]\(([^)]+)\)\s+[—–-]\s+(.+)$/

  for (const line of sectionContent.split('\n')) {
    const match = line.match(lineRegex)
    if (!match) continue
    const [, termTitle, url, relationship] = match

    // Derive slug from the last URL path segment
    const slugMatch = url.match(/\/([^/]+)\/?$/)
    const termSlug = slugMatch ? slugMatch[1] : url

    terms.push({
      slug:         termSlug.trim(),
      title:        termTitle.trim(),
      relationship: relationship.trim(),
      direction:    'outbound',
      url:          url.trim(),
    })
  }

  return terms
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

/**
 * Combines Articles and References sections into a sorted Source array.
 * Reading order is assigned by type priority: lexicon_entry → blog_article → wiki → podcast → github.
 */
function parseSources(articlesContent: string, referencesContent: string): Source[] {
  const raw: Omit<Source, 'reading_order'>[] = []

  const linkRegex = /^\s*-\s+\[([^\]]+)\]\(([^)]+)\)/

  // References → lexicon_entry / wiki
  for (const line of referencesContent.split('\n')) {
    const match = line.match(linkRegex)
    if (!match) continue
    const [, title, url] = match
    const type = detectSourceType(title, url)
    raw.push({
      type,
      title:     title.trim(),
      url:       url.trim(),
      relevance: type === 'lexicon_entry' ? 'CRITICAL' : 'HIGH',
    })
  }

  // Articles → blog_article (or detected type)
  for (const line of articlesContent.split('\n')) {
    const match = line.match(linkRegex)
    if (!match) continue
    const [, title, url] = match
    const type = detectSourceType(title, url)
    raw.push({
      type,
      title:     title.trim(),
      url:       url.trim(),
      relevance: 'HIGH',
    })
  }

  // Sort by type priority, then assign reading_order
  raw.sort((a, b) => TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type])

  return raw.map((s, i) => ({ ...s, reading_order: i + 1 }))
}

/**
 * Infers Source type from the link title and URL.
 */
function detectSourceType(title: string, url: string): Source['type'] {
  const t = title.toLowerCase()
  const u = url.toLowerCase()
  if (t === 'lexicon' || u.includes('/lexicon/'))         return 'lexicon_entry'
  if (t === 'wiki'    || u.includes('wiki.'))             return 'wiki'
  if (u.includes('github.com'))                           return 'github'
  if (t.includes('podcast') || u.includes('podcast'))     return 'podcast'
  return 'blog_article'
}
